# Created by Caleb M. Irvine for use by Moto Reloaded
"""Runtime credit-protection, passcode verification, and rate-limiting guardrails.

Protects public portfolio deployments on Azure Container Apps from unintended
Azure OpenAI spend and unauthenticated configuration edits while preserving
100% unchanged local development behavior when environment variables are unset.
"""

from __future__ import annotations

import hmac
import os
import threading
import time
from collections import defaultdict, deque
from typing import Any, Literal

from fastapi import Request

ScoreMode = Literal["live", "demo_with_passcode", "demo"]

DEFAULT_MAX_UPLOAD_BYTES = 12 * 1024 * 1024  # 12 MiB
_HOUR_SECONDS = 3600.0
_DAY_SECONDS = 86400.0
_PASSCODE_FAIL_WINDOW_SECONDS = 900.0  # 15 minutes
_MAX_FAILED_PASSCODE_PROBES = 12


def get_score_mode() -> ScoreMode:
    """Return active scoring mode from SCORE_MODE (defaults to 'live' locally)."""
    raw = (os.environ.get("SCORE_MODE") or "live").strip().lower()
    if raw in ("live", "demo_with_passcode", "demo"):
        return raw  # type: ignore[return-value]
    return "live"


def get_live_passcode() -> str:
    """Return configured LIVE_SCORE_PASSCODE (never exposed in any response)."""
    return (os.environ.get("LIVE_SCORE_PASSCODE") or "").strip()


def verify_passcode(candidate: str | None) -> bool:
    """Verify a caller-supplied passcode using constant-time comparison."""
    expected = get_live_passcode()
    if not expected or not candidate:
        return False
    return hmac.compare_digest(candidate.strip(), expected)


def is_admin_write_protected() -> bool:
    """Return True when ALLOW_PUBLIC_ADMIN_WRITE disables unauthenticated settings writes."""
    raw = (os.environ.get("ALLOW_PUBLIC_ADMIN_WRITE") or "true").strip().lower()
    return raw in ("false", "0", "no", "off")


def _parse_non_negative_int(env_name: str, default: int = 0) -> int:
    raw = (os.environ.get(env_name) or "").strip()
    if not raw:
        return default
    try:
        return max(0, int(raw))
    except ValueError:
        return default


def get_max_upload_bytes() -> int:
    """Return maximum allowed upload size in bytes (MAX_UPLOAD_BYTES)."""
    val = _parse_non_negative_int("MAX_UPLOAD_BYTES", DEFAULT_MAX_UPLOAD_BYTES)
    return val if val > 0 else DEFAULT_MAX_UPLOAD_BYTES


def get_max_live_scores_per_hour() -> int:
    """Per-IP rolling 1-hour cap on live Azure OpenAI calls (0 = unlimited)."""
    return _parse_non_negative_int("MAX_LIVE_SCORES_PER_HOUR", 0)


def get_max_live_scores_per_day() -> int:
    """Global rolling 24-hour cap on live Azure OpenAI calls (0 = unlimited)."""
    return _parse_non_negative_int("MAX_LIVE_SCORES_PER_DAY", 0)


def extract_client_ip(request: Request) -> str:
    """Resolve caller IP honoring reverse-proxy X-Forwarded-For first hop."""
    forwarded = (request.headers.get("x-forwarded-for") or "").strip()
    if forwarded:
        first_hop = forwarded.split(",")[0].strip()
        if first_hop:
            return first_hop
    if request.client and request.client.host:
        return str(request.client.host)
    return "unknown"


class LiveScoreRateLimiter:
    """Thread-safe in-memory sliding-window limiter for live Azure OpenAI calls."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._per_ip_hour: dict[str, deque[float]] = defaultdict(deque)
        self._global_day: deque[float] = deque()
        self._failed_passcodes: dict[str, deque[float]] = defaultdict(deque)

    def _prune(self, dq: deque[float], now: float, window: float) -> None:
        cutoff = now - window
        while dq and dq[0] <= cutoff:
            dq.popleft()

    def check_and_record_live_score(self, client_ip: str) -> tuple[bool, str, int]:
        """Atomically enforce hourly per-IP and daily global live-score caps.

        Returns (allowed, reason_if_blocked, retry_after_seconds).
        """
        max_hour = get_max_live_scores_per_hour()
        max_day = get_max_live_scores_per_day()
        now = time.monotonic()

        with self._lock:
            self._prune(self._global_day, now, _DAY_SECONDS)
            ip_dq = self._per_ip_hour[client_ip]
            self._prune(ip_dq, now, _HOUR_SECONDS)

            if max_day > 0 and len(self._global_day) >= max_day:
                oldest = self._global_day[0]
                retry_after = max(60, int(_DAY_SECONDS - (now - oldest)))
                return (
                    False,
                    (
                        f"Daily live AI credit-protection cap ({max_day}/day) reached. "
                        "Demo Mode remains available with $0 API spend."
                    ),
                    retry_after,
                )

            if max_hour > 0 and len(ip_dq) >= max_hour:
                oldest = ip_dq[0]
                retry_after = max(30, int(_HOUR_SECONDS - (now - oldest)))
                return (
                    False,
                    (
                        f"Hourly live AI limit ({max_hour}/hour per visitor) reached. "
                        "Try again shortly or use Demo Mode."
                    ),
                    retry_after,
                )

            if max_day > 0 or max_hour > 0:
                self._global_day.append(now)
                ip_dq.append(now)

        return (True, "", 0)

    def check_failed_passcode_allowed(self, client_ip: str) -> tuple[bool, int]:
        """Check whether this IP is temporarily throttled after repeated invalid passcodes."""
        now = time.monotonic()
        with self._lock:
            dq = self._failed_passcodes[client_ip]
            self._prune(dq, now, _PASSCODE_FAIL_WINDOW_SECONDS)
            if len(dq) >= _MAX_FAILED_PASSCODE_PROBES:
                retry_after = max(60, int(_PASSCODE_FAIL_WINDOW_SECONDS - (now - dq[0])))
                return (False, retry_after)
            return (True, 0)

    def record_failed_passcode(self, client_ip: str) -> None:
        now = time.monotonic()
        with self._lock:
            dq = self._failed_passcodes[client_ip]
            self._prune(dq, now, _PASSCODE_FAIL_WINDOW_SECONDS)
            dq.append(now)

    def get_quota_snapshot(self) -> dict[str, Any]:
        """Return non-secret usage and remaining quota counters."""
        max_hour = get_max_live_scores_per_hour()
        max_day = get_max_live_scores_per_day()
        now = time.monotonic()
        with self._lock:
            self._prune(self._global_day, now, _DAY_SECONDS)
            used_today = len(self._global_day)

        remaining_today = max(0, max_day - used_today) if max_day > 0 else None
        return {
            "live_scores_used_today": used_today,
            "live_scores_remaining_today": remaining_today,
            "max_live_scores_per_day": max_day,
            "max_live_scores_per_hour": max_hour,
        }

    def reset(self) -> None:
        """Reset all in-memory counters (intended for automated tests)."""
        with self._lock:
            self._per_ip_hour.clear()
            self._global_day.clear()
            self._failed_passcodes.clear()


rate_limiter = LiveScoreRateLimiter()


def get_public_runtime_mode() -> dict[str, Any]:
    """Return non-secret protection and scoring mode metadata for UI & diagnostics."""
    mode = get_score_mode()
    passcode_configured = bool(get_live_passcode())
    quota = rate_limiter.get_quota_snapshot()
    return {
        "score_mode": mode,
        "passcode_configured": passcode_configured,
        "admin_write_protected": is_admin_write_protected(),
        "max_upload_bytes": get_max_upload_bytes(),
        **quota,
    }
