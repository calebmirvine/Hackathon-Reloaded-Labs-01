# Created by Caleb M. Irvine for use by Moto Reloaded
"""SQLite persistence layer for Moto Reloaded Gear Intake Checker.

Stores intake sessions, uploaded photo metadata and angle-check results,
0-100 photo coverage + damage disclosure score records, and the human
review queue for staff in-hand inspection.
"""

from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

REQUIRED_ANGLES: tuple[str, ...] = (
    "front",
    "left",
    "right",
    "back",
    "inside",
    "labels",
)

DEFAULT_DB_PATH = "intake.db"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_db_path() -> str:
    """Resolve the active SQLite database path from INTAKE_DB_PATH."""
    return os.environ.get("INTAKE_DB_PATH", DEFAULT_DB_PATH)


@contextmanager
def _connect() -> Iterator[sqlite3.Connection]:
    db_path = get_db_path()
    if db_path != ":memory:":
        parent = Path(db_path).parent
        if str(parent) not in ("", "."):
            parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _parse_json(raw: str | None, default: Any) -> Any:
    if not raw:
        return default
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return default


def _row_to_session(row: sqlite3.Row) -> dict[str, Any]:
    data: dict[str, Any] = {
        "session_id": row["session_id"],
        "garment_type": row["garment_type"],
        "status": row["status"],
        "disclosure": _parse_json(row["disclosure_json"], {}),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }
    keys = row.keys()
    if "total_score" in keys:
        data["total_score"] = row["total_score"]
    if "decision" in keys:
        data["decision"] = row["decision"]
    if "photo_count" in keys:
        data["photo_count"] = row["photo_count"]
    return data


def _row_to_photo(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "session_id": row["session_id"],
        "angle": row["angle"],
        "filepath": row["filepath"],
        "clip_predicted_angle": row["clip_predicted_angle"],
        "clip_confidence": float(row["clip_confidence"]),
        "clip_matched_refs": _parse_json(row["clip_matched_refs_json"], []),
        "angle_ok": bool(row["angle_ok"]),
        "created_at": row["created_at"],
    }


def _row_to_score(row: sqlite3.Row) -> dict[str, Any]:
    parsed = _parse_json(row["result_json"], {})
    if not isinstance(parsed, dict):
        parsed = {}
    score_dict: dict[str, Any] = {
        **parsed,
        "session_id": row["session_id"],
        "total_score": int(row["total_score"]),
        "photo_coverage_score": int(row["photo_coverage_score"]),
        "damage_disclosure_score": int(row["damage_disclosure_score"]),
        "decision": row["decision"],
        "hard_gate_triggered": bool(row["hard_gate_triggered"]),
        "buy_in_recommended": bool(row["buy_in_recommended"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }
    return score_dict


def _row_to_review_item(row: sqlite3.Row) -> dict[str, Any]:
    parsed_score = _parse_json(row["result_json"], {})
    if not isinstance(parsed_score, dict):
        parsed_score = {}
    return {
        "session_id": row["session_id"],
        "status": row["review_status"],
        "review_status": row["review_status"],
        "staff_notes": row["staff_notes"],
        "queued_at": row["queued_at"],
        "updated_at": row["review_updated_at"],
        "garment_type": row["garment_type"],
        "session_status": row["session_status"],
        "disclosure": _parse_json(row["disclosure_json"], {}),
        "total_score": int(row["total_score"]),
        "photo_coverage_score": int(row["photo_coverage_score"]),
        "damage_disclosure_score": int(row["damage_disclosure_score"]),
        "decision": row["decision"],
        "hard_gate_triggered": bool(row["hard_gate_triggered"]),
        "buy_in_recommended": bool(row["buy_in_recommended"]),
        "score": parsed_score,
    }


def init_db() -> None:
    """Create all SQLite tables if they do not already exist."""
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                garment_type TEXT NOT NULL DEFAULT 'jacket',
                status TEXT NOT NULL DEFAULT 'created',
                disclosure_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS photos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                angle TEXT NOT NULL,
                filepath TEXT NOT NULL,
                clip_predicted_angle TEXT,
                clip_confidence REAL NOT NULL DEFAULT 0.0,
                clip_matched_refs_json TEXT NOT NULL DEFAULT '[]',
                angle_ok INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_photos_session_angle
                ON photos(session_id, angle);

            CREATE TABLE IF NOT EXISTS scores (
                session_id TEXT PRIMARY KEY,
                total_score INTEGER NOT NULL,
                photo_coverage_score INTEGER NOT NULL DEFAULT 0,
                damage_disclosure_score INTEGER NOT NULL DEFAULT 0,
                decision TEXT NOT NULL,
                hard_gate_triggered INTEGER NOT NULL DEFAULT 0,
                buy_in_recommended INTEGER NOT NULL DEFAULT 0,
                result_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS review_queue (
                session_id TEXT PRIMARY KEY,
                status TEXT NOT NULL DEFAULT 'pending',
                staff_notes TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
            );
            """
        )


def create_session(session_id: str, garment_type: str = "jacket") -> dict[str, Any]:
    """Create and persist a new intake session."""
    now = _utc_now()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO sessions (session_id, garment_type, status, disclosure_json, created_at, updated_at)
            VALUES (?, ?, 'created', '{}', ?, ?)
            """,
            (session_id, garment_type, now, now),
        )
        row = conn.execute(
            "SELECT * FROM sessions WHERE session_id = ?",
            (session_id,),
        ).fetchone()
    assert row is not None
    return _row_to_session(row)


def get_session(session_id: str) -> dict[str, Any] | None:
    """Fetch a single intake session by ID, or None if not found."""
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM sessions WHERE session_id = ?",
            (session_id,),
        ).fetchone()
    if row is None:
        return None
    return _row_to_session(row)


def list_sessions(limit: int = 50) -> list[dict[str, Any]]:
    """List recent intake sessions with optional score summary and photo count."""
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT
                s.*,
                sc.total_score AS total_score,
                sc.decision AS decision,
                (SELECT COUNT(*) FROM photos p WHERE p.session_id = s.session_id) AS photo_count
            FROM sessions s
            LEFT JOIN scores sc ON sc.session_id = s.session_id
            ORDER BY s.created_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [_row_to_session(row) for row in rows]


def update_session(
    session_id: str,
    *,
    status: str | None = None,
    garment_type: str | None = None,
    disclosure: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Update status, garment_type, and/or disclosure JSON for an existing session."""
    with _connect() as conn:
        existing = conn.execute(
            "SELECT * FROM sessions WHERE session_id = ?",
            (session_id,),
        ).fetchone()
        if existing is None:
            return None

        updates: list[str] = []
        params: list[Any] = []
        if status is not None:
            updates.append("status = ?")
            params.append(status)
        if garment_type is not None:
            updates.append("garment_type = ?")
            params.append(garment_type)
        if disclosure is not None:
            updates.append("disclosure_json = ?")
            params.append(json.dumps(disclosure))

        now = _utc_now()
        updates.append("updated_at = ?")
        params.append(now)
        params.append(session_id)

        conn.execute(
            f"UPDATE sessions SET {', '.join(updates)} WHERE session_id = ?",
            params,
        )
        row = conn.execute(
            "SELECT * FROM sessions WHERE session_id = ?",
            (session_id,),
        ).fetchone()
    assert row is not None
    return _row_to_session(row)


def upsert_photo(
    session_id: str,
    angle: str,
    filepath: str,
    clip_predicted_angle: str | None,
    clip_confidence: float,
    clip_matched_refs: list[dict[str, Any]],
    angle_ok: bool,
) -> dict[str, Any]:
    """Insert or replace a captured photo record for a session.

    For required angles (front, left, right, back, inside, labels), any prior
    photo row for that angle in the session is replaced on retake.
    For 'defect' (and any non-required angle), multiple rows are preserved.
    """
    now = _utc_now()
    refs_json = json.dumps(clip_matched_refs or [])
    with _connect() as conn:
        if angle in REQUIRED_ANGLES:
            conn.execute(
                "DELETE FROM photos WHERE session_id = ? AND angle = ?",
                (session_id, angle),
            )
        cursor = conn.execute(
            """
            INSERT INTO photos (
                session_id,
                angle,
                filepath,
                clip_predicted_angle,
                clip_confidence,
                clip_matched_refs_json,
                angle_ok,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                angle,
                filepath,
                clip_predicted_angle,
                float(clip_confidence),
                refs_json,
                1 if angle_ok else 0,
                now,
            ),
        )
        photo_id = cursor.lastrowid
        row = conn.execute(
            "SELECT * FROM photos WHERE id = ?",
            (photo_id,),
        ).fetchone()
    assert row is not None
    return _row_to_photo(row)


def get_session_photos(session_id: str) -> list[dict[str, Any]]:
    """Return all photo records for a session ordered chronologically."""
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM photos
            WHERE session_id = ?
            ORDER BY created_at ASC, id ASC
            """,
            (session_id,),
        ).fetchall()
    return [_row_to_photo(row) for row in rows]


def save_score(session_id: str, result: dict[str, Any]) -> dict[str, Any]:
    """Persist a photo coverage + damage disclosure score for a session.

    Marks the session as 'scored' and, when decision == 'human_review',
    upserts a 'pending' entry into review_queue for in-hand staff review.
    """
    now = _utc_now()
    total_score = int(result.get("total_score", 0))
    photo_coverage_score = int(result.get("photo_coverage_score", 0))
    damage_disclosure_score = int(result.get("damage_disclosure_score", 0))
    decision = str(result.get("decision", "rejected_retake"))
    hard_gate_triggered = 1 if result.get("hard_gate_triggered") else 0
    buy_in_recommended = 1 if result.get("buy_in_recommended") else 0
    result_json = json.dumps(result)

    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO scores (
                session_id,
                total_score,
                photo_coverage_score,
                damage_disclosure_score,
                decision,
                hard_gate_triggered,
                buy_in_recommended,
                result_json,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                total_score = excluded.total_score,
                photo_coverage_score = excluded.photo_coverage_score,
                damage_disclosure_score = excluded.damage_disclosure_score,
                decision = excluded.decision,
                hard_gate_triggered = excluded.hard_gate_triggered,
                buy_in_recommended = excluded.buy_in_recommended,
                result_json = excluded.result_json,
                updated_at = excluded.updated_at
            """,
            (
                session_id,
                total_score,
                photo_coverage_score,
                damage_disclosure_score,
                decision,
                hard_gate_triggered,
                buy_in_recommended,
                result_json,
                now,
                now,
            ),
        )
        conn.execute(
            "UPDATE sessions SET status = 'scored', updated_at = ? WHERE session_id = ?",
            (now, session_id),
        )
        if decision == "human_review":
            conn.execute(
                """
                INSERT INTO review_queue (session_id, status, staff_notes, created_at, updated_at)
                VALUES (?, 'pending', '', ?, ?)
                ON CONFLICT(session_id) DO UPDATE SET
                    status = 'pending',
                    updated_at = excluded.updated_at
                """,
                (session_id, now, now),
            )
        row = conn.execute(
            "SELECT * FROM scores WHERE session_id = ?",
            (session_id,),
        ).fetchone()
    assert row is not None
    return _row_to_score(row)


def get_score(session_id: str) -> dict[str, Any] | None:
    """Fetch the persisted score result dict for a session, or None."""
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM scores WHERE session_id = ?",
            (session_id,),
        ).fetchone()
    if row is None:
        return None
    return _row_to_score(row)


def list_review_queue() -> list[dict[str, Any]]:
    """List review_queue items joined with sessions and scores."""
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT
                rq.session_id AS session_id,
                rq.status AS review_status,
                rq.staff_notes AS staff_notes,
                rq.created_at AS queued_at,
                rq.updated_at AS review_updated_at,
                s.garment_type AS garment_type,
                s.status AS session_status,
                s.disclosure_json AS disclosure_json,
                sc.total_score AS total_score,
                sc.photo_coverage_score AS photo_coverage_score,
                sc.damage_disclosure_score AS damage_disclosure_score,
                sc.decision AS decision,
                sc.hard_gate_triggered AS hard_gate_triggered,
                sc.buy_in_recommended AS buy_in_recommended,
                sc.result_json AS result_json
            FROM review_queue rq
            JOIN sessions s ON s.session_id = rq.session_id
            JOIN scores sc ON sc.session_id = rq.session_id
            ORDER BY
                CASE WHEN rq.status = 'pending' THEN 0 ELSE 1 END,
                rq.created_at DESC
            """
        ).fetchall()
    return [_row_to_review_item(row) for row in rows]


def update_review_item(
    session_id: str,
    status: str,
    staff_notes: str = "",
) -> dict[str, Any] | None:
    """Update status and staff_notes for a queued human-review item."""
    now = _utc_now()
    with _connect() as conn:
        existing = conn.execute(
            "SELECT session_id FROM review_queue WHERE session_id = ?",
            (session_id,),
        ).fetchone()
        if existing is None:
            return None

        conn.execute(
            """
            UPDATE review_queue
            SET status = ?, staff_notes = ?, updated_at = ?
            WHERE session_id = ?
            """,
            (status, staff_notes, now, session_id),
        )
        row = conn.execute(
            """
            SELECT
                rq.session_id AS session_id,
                rq.status AS review_status,
                rq.staff_notes AS staff_notes,
                rq.created_at AS queued_at,
                rq.updated_at AS review_updated_at,
                s.garment_type AS garment_type,
                s.status AS session_status,
                s.disclosure_json AS disclosure_json,
                sc.total_score AS total_score,
                sc.photo_coverage_score AS photo_coverage_score,
                sc.damage_disclosure_score AS damage_disclosure_score,
                sc.decision AS decision,
                sc.hard_gate_triggered AS hard_gate_triggered,
                sc.buy_in_recommended AS buy_in_recommended,
                sc.result_json AS result_json
            FROM review_queue rq
            JOIN sessions s ON s.session_id = rq.session_id
            JOIN scores sc ON sc.session_id = rq.session_id
            WHERE rq.session_id = ?
            """,
            (session_id,),
        ).fetchone()
    if row is None:
        return None
    return _row_to_review_item(row)
