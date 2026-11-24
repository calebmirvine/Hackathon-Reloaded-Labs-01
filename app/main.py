# Created by Caleb M. Irvine for use by Moto Reloaded
"""FastAPI server for the Moto Reloaded Gear Intake Checker.

Provides guided mobile capture session creation (with HTTPS QR code),
photo upload with Stage 1 OpenCLIP angle verification, 2-second live status
polling, Stage 2 Azure OpenAI vision rubric scoring via `score_photos()`,
Stage 3 deterministic 0-100 photo coverage + damage disclosure scoring,
staff human-review queue endpoints, Excel shot-checklist export, and a local
sample loader for offline/demo runs.
"""

from __future__ import annotations

import base64
import inspect
import io
import os
import re
import shutil
import time
from datetime import datetime
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlparse

import qrcode
from dotenv import load_dotenv
from fastapi import Body, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict, Field

load_dotenv()

from app import clip_matcher, db, exporter, guardrails, scoring_engine, vision_scorer  # noqa: E402
from app.clip_matcher import REQUIRED_ANGLES, verify_angle  # noqa: E402
from app.scoring_engine import compute_score  # noqa: E402
from app.vision_scorer import score_photos  # noqa: E402

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "app" / "static"
UPLOADS_DIR = Path(os.environ.get("INTAKE_UPLOADS_DIR", str(BASE_DIR / "uploads")))
DATA_DIR = BASE_DIR / "data"

ALLOWED_ANGLES: tuple[str, ...] = (
    "front",
    "left",
    "right",
    "back",
    "inside",
    "labels",
    "defect",
)
MAX_STORED_IMAGE_EDGE = 2400

_ORIG_VERIFY_ANGLE = verify_angle
_ORIG_SCORE_PHOTOS = score_photos
_ORIG_COMPUTE_SCORE = compute_score
_INITIALIZED_DB_PATH: str | None = None


def _ensure_db() -> None:
    """Ensure SQLite tables exist for the active INTAKE_DB_PATH."""
    global _INITIALIZED_DB_PATH
    active_path = db.get_db_path()
    needs_init = (
        _INITIALIZED_DB_PATH != active_path
        or active_path == ":memory:"
        or not Path(active_path).exists()
    )
    if needs_init:
        db.init_db()
        _INITIALIZED_DB_PATH = active_path


def _ensure_dirs() -> None:
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


def _callable_accepts_kwarg(fn: Any, kwarg_name: str) -> bool:
    """Return True if `fn` accepts `kwarg_name` explicitly or via **kwargs."""
    try:
        sig = inspect.signature(fn)
    except (TypeError, ValueError):
        return False
    for name, param in sig.parameters.items():
        if param.kind == inspect.Parameter.VAR_KEYWORD:
            return True
        if name == kwarg_name and param.kind in (
            inspect.Parameter.POSITIONAL_OR_KEYWORD,
            inspect.Parameter.KEYWORD_ONLY,
        ):
            return True
    return False


# REFERENCES (no training):
# - Model is pretrained and frozen for inference only (model.eval(), torch.no_grad(),
#   no optimizer, no backward pass, no fine-tuning).
#   Source: OpenCLIP repo (https://github.com/mlfoundations/open_clip) & model card (https://huggingface.co/laion/CLIP-ViT-B-32-laion2B-s34B-b79K)
# - Embeddings are only stored and compared with cosine similarity (lookup, not training).
#   Source: OpenCLIP repo (https://github.com/mlfoundations/open_clip) & Participant Agreement v2.0 ("Don't train or fine-tune a model on the photo set")
# - Photos sent to the scoring API go to Azure OpenAI, which does not train on inputs.
#   Source: Azure OpenAI Data, Privacy, and Security (https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy)
# - Challenge photos are never saved as training data.
#   Source: Participant Agreement v2.0 ("Don't train or fine-tune a model on the photo set")
def _run_verify_angle(
    image_path: str,
    expected_angle: str,
    *,
    warn_threshold: float | None = None,
) -> dict[str, Any]:
    """Dispatch Stage 1 OpenCLIP angle verification (supports monkeypatching)."""
    target = (
        verify_angle if verify_angle is not _ORIG_VERIFY_ANGLE else clip_matcher.verify_angle
    )
    if warn_threshold is not None and _callable_accepts_kwarg(target, "warn_threshold"):
        return target(image_path, expected_angle, warn_threshold=warn_threshold)
    return target(image_path, expected_angle)


# REFERENCES (no training):
# - Model is pretrained and frozen for inference only (model.eval(), torch.no_grad(),
#   no optimizer, no backward pass, no fine-tuning).
#   Source: OpenCLIP repo (https://github.com/mlfoundations/open_clip) & model card (https://huggingface.co/laion/CLIP-ViT-B-32-laion2B-s34B-b79K)
# - Embeddings are only stored and compared with cosine similarity (lookup, not training).
#   Source: OpenCLIP repo (https://github.com/mlfoundations/open_clip) & Participant Agreement v2.0 ("Don't train or fine-tune a model on the photo set")
# - Photos sent to the scoring API go to Azure OpenAI, which does not train on inputs.
#   Source: Azure OpenAI Data, Privacy, and Security (https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy)
# - Challenge photos are never saved as training data.
#   Source: Participant Agreement v2.0 ("Don't train or fine-tune a model on the photo set")
def _run_score_photos(
    photos: list[dict[str, Any]],
    garment_type: str,
    disclosure: dict[str, Any] | None = None,
    *,
    runtime_settings: dict[str, Any] | None = None,
    use_demo_mode: bool = False,
) -> dict[str, Any]:
    """Dispatch Stage 2 Azure OpenAI vision rubric scoring (supports monkeypatching)."""
    if use_demo_mode:
        return _ORIG_SCORE_PHOTOS(
            photos,
            garment_type,
            disclosure,
            runtime_settings=runtime_settings,
            use_demo_mode=True,
        )
    target = (
        score_photos if score_photos is not _ORIG_SCORE_PHOTOS else vision_scorer.score_photos
    )
    if runtime_settings is not None and _callable_accepts_kwarg(target, "runtime_settings"):
        return target(photos, garment_type, disclosure, runtime_settings=runtime_settings)
    return target(photos, garment_type, disclosure)


def _run_compute_score(
    vision_result: dict[str, Any],
    photos: list[dict[str, Any]],
    garment_type: str,
    disclosure: dict[str, Any] | None = None,
    *,
    auto_approve_min: int | None = None,
    human_review_min: int | None = None,
) -> dict[str, Any]:
    """Dispatch Stage 3 deterministic photo coverage + damage disclosure scoring."""
    target = (
        compute_score
        if compute_score is not _ORIG_COMPUTE_SCORE
        else scoring_engine.compute_score
    )
    extra_kwargs: dict[str, Any] = {}
    if auto_approve_min is not None and _callable_accepts_kwarg(target, "auto_approve_min"):
        extra_kwargs["auto_approve_min"] = auto_approve_min
    if human_review_min is not None and _callable_accepts_kwarg(target, "human_review_min"):
        extra_kwargs["human_review_min"] = human_review_min
    return target(vision_result, photos, garment_type, disclosure, **extra_kwargs)


# ---------------------------------------------------------------------------
# Request Schemas
# ---------------------------------------------------------------------------
class CreateSessionRequest(BaseModel):
    garment_type: Literal["jacket", "pants"] = "jacket"


class CompleteSessionRequest(BaseModel):
    garment_type: Literal["jacket", "pants"] | None = None
    disclosure: dict[str, Any] | None = None


class ScoreRequest(BaseModel):
    session_id: str = Field(..., min_length=1)
    disclosure: dict[str, Any] | None = None


class ReviewUpdateRequest(BaseModel):
    status: Literal["approved", "declined_upcycle", "pending"]
    staff_notes: str = ""


class LoadSampleRequest(BaseModel):
    item_id: str = Field(..., min_length=1)
    garment_type: Literal["jacket", "pants"] = "jacket"
    disclosure: dict[str, Any] | None = None


class AdminSettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    vision_deployment: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    poll_interval_ms: int | None = None
    auto_score_on_complete: bool | None = None
    clip_warn_threshold: float | None = None
    auto_approve_min: int | None = None
    human_review_min: int | None = None
    public_base_url: str | None = None


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------
def _generate_session_id(garment_type: str = "jacket") -> str:
    """Readable session id: RL-pants-YYYY-MM-DD, with -2, -3 when that day is taken."""
    kind = "pants" if str(garment_type).strip().lower() == "pants" else "jacket"
    base = f"RL-{kind}-{datetime.now().strftime('%Y-%m-%d')}"
    if db.get_session(base) is None:
        return base
    suffix = 2
    while db.get_session(f"{base}-{suffix}") is not None:
        suffix += 1
        if suffix > 99:
            break
    return f"{base}-{suffix}"


def _resolve_public_base_url(
    request: Request,
    settings: dict[str, Any] | None = None,
) -> str:
    """Resolve HTTPS public base URL for mobile QR code links."""
    if isinstance(settings, dict) and "public_base_url" in settings:
        configured = str(settings.get("public_base_url") or "").strip().rstrip("/")
    else:
        configured = (os.environ.get("PUBLIC_BASE_URL") or "").strip().rstrip("/")
    if configured:
        return configured

    forwarded_host = (request.headers.get("x-forwarded-host") or "").split(",")[0].strip()
    if forwarded_host:
        forwarded_proto = (
            request.headers.get("x-forwarded-proto") or request.url.scheme or "https"
        ).split(",")[0].strip()
        return f"{forwarded_proto}://{forwarded_host}"

    return str(request.base_url).rstrip("/")


def _generate_qr_data_url(url: str) -> str:
    """Render a crisp PNG QR code data URL for the mobile capture link."""
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=2,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#202219", back_color="#FFFFFF")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    encoded = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _build_photo_url(session_id: str, filepath: str) -> str:
    filename = Path(filepath).name
    return f"/uploads/{session_id}/{filename}"


def _enrich_photo(photo: dict[str, Any]) -> dict[str, Any]:
    session_id = str(photo.get("session_id") or "")
    filepath = str(photo.get("filepath") or "")
    angle_ok = bool(photo.get("angle_ok", True))
    return {
        **photo,
        "photo_url": _build_photo_url(session_id, filepath),
        "angle_status": "matched" if angle_ok else "warn_mismatch",
        "predicted_angle": photo.get("clip_predicted_angle"),
        "expected_similarity": float(photo.get("clip_confidence", 0.0)),
        "matched_references": photo.get("clip_matched_refs") or [],
    }


def _ordered_captured_angles(photos: list[dict[str, Any]]) -> list[str]:
    present = {str(p.get("angle") or "").lower() for p in photos}
    ordered = [angle for angle in REQUIRED_ANGLES if angle in present]
    if "defect" in present:
        ordered.append("defect")
    return ordered


def _save_normalized_jpeg(raw_bytes: bytes, dest_path: Path) -> None:
    """Decode uploaded image via Pillow, apply EXIF orientation, and save RGB JPEG."""
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Uploaded image file is empty.")

    try:
        with Image.open(io.BytesIO(raw_bytes)) as img:
            oriented = ImageOps.exif_transpose(img)
            if oriented.mode in ("RGBA", "LA") or (
                oriented.mode == "P" and "transparency" in oriented.info
            ):
                background = Image.new("RGB", oriented.size, (255, 255, 255))
                rgba = oriented.convert("RGBA")
                background.paste(rgba, mask=rgba.split()[-1])
                rgb = background
            elif oriented.mode != "RGB":
                rgb = oriented.convert("RGB")
            else:
                rgb = oriented.copy()

            if max(rgb.size) > MAX_STORED_IMAGE_EDGE:
                rgb.thumbnail((MAX_STORED_IMAGE_EDGE, MAX_STORED_IMAGE_EDGE), Image.Resampling.LANCZOS)

            dest_path.parent.mkdir(parents=True, exist_ok=True)
            rgb.save(dest_path, format="JPEG", quality=90, optimize=True)
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file could not be decoded as a valid image.",
        ) from exc


def _is_separator_card(path: Path, item_id: str) -> bool:
    stem = path.stem.strip().lower()
    return stem == item_id.lower() or bool(re.fullmatch(r"rl\d+-\d+", stem))


def _classify_sample_filename(filename: str) -> tuple[str | None, int]:
    """Map messy challenge-set filenames to a guided intake angle + priority.

    Lower priority integer means a stronger canonical match for that angle slot.
    Never reads image bytes; inspects filename tokens only.
    """
    stem = Path(filename).stem.lower()
    normalized = re.sub(r"[^a-z0-9]+", " ", stem).strip()

    if "defect" in normalized or "damage" in normalized:
        return ("defect", 1 if "1" in normalized else 2)

    if any(tok in normalized for tok in ("label", "brand", "comp", "tag")) or re.search(
        r"\bce\b", normalized
    ):
        if "brand" in normalized or "info" in normalized:
            return ("labels", 1)
        if "label" in normalized:
            return ("labels", 2)
        return ("labels", 3)

    if any(tok in normalized for tok in ("lining", "inside", "pocket")):
        if "lining" in normalized and not re.search(r"lining\s*\d|sides", normalized):
            return ("inside", 1)
        if "lining" in normalized:
            return ("inside", 2)
        return ("inside", 3)

    # Skip Zone 1 close-ups when selecting core exterior angles
    if re.search(r"\bz1\b|zone\s*1", normalized):
        return (None, 99)

    if "front" in normalized:
        return ("front", 1)
    if "back" in normalized:
        return ("back", 1)
    if "left" in normalized:
        return ("left", 1)
    if "right" in normalized:
        return ("right", 1)

    return (None, 99)


# REFERENCES (no training):
# - Model is pretrained and frozen for inference only (model.eval(), torch.no_grad(),
#   no optimizer, no backward pass, no fine-tuning).
#   Source: OpenCLIP repo (https://github.com/mlfoundations/open_clip) & model card (https://huggingface.co/laion/CLIP-ViT-B-32-laion2B-s34B-b79K)
# - Embeddings are only stored and compared with cosine similarity (lookup, not training).
#   Source: OpenCLIP repo (https://github.com/mlfoundations/open_clip) & Participant Agreement v2.0 ("Don't train or fine-tune a model on the photo set")
# - Photos sent to the scoring API go to Azure OpenAI, which does not train on inputs.
#   Source: Azure OpenAI Data, Privacy, and Security (https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy)
# - Challenge photos are never saved as training data.
#   Source: Participant Agreement v2.0 ("Don't train or fine-tune a model on the photo set")
def _select_sample_files(sample_dir: Path, item_id: str) -> dict[str, Path]:
    """Select up to 1 local sample image per guided angle from data/<item_id>/."""
    candidates: dict[str, tuple[int, str, Path]] = {}
    image_exts = {".jpg", ".jpeg", ".png", ".webp"}

    for entry in sorted(sample_dir.iterdir(), key=lambda p: p.name.lower()):
        if not entry.is_file() or entry.suffix.lower() not in image_exts:
            continue
        if _is_separator_card(entry, item_id):
            continue

        angle, priority = _classify_sample_filename(entry.name)
        if angle is None:
            continue

        existing = candidates.get(angle)
        if existing is None or (priority, entry.name.lower()) < (existing[0], existing[1]):
            candidates[angle] = (priority, entry.name.lower(), entry)

    ordered_result: dict[str, Path] = {}
    for angle in ALLOWED_ANGLES:
        if angle in candidates:
            ordered_result[angle] = candidates[angle][2]
    return ordered_result


# ---------------------------------------------------------------------------
# FastAPI App & Static Mounts
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(_app: FastAPI):
    _ensure_dirs()
    _ensure_db()
    yield


_ensure_dirs()

app = FastAPI(
    title="Moto Reloaded Gear Intake Checker",
    description=(
        "Guided mobile photo coverage and damage disclosure intake checker "
        "for Moto Reloaded store buy-in and circular upcycling triage."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR), check_dir=False), name="static")
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR), check_dir=False), name="uploads")


# ---------------------------------------------------------------------------
# UI & Health Routes
# ---------------------------------------------------------------------------
@app.get("/", include_in_schema=False)
def serve_laptop_ui() -> FileResponse:
    index_path = STATIC_DIR / "index.html"
    if not index_path.exists():
        raise HTTPException(status_code=404, detail="Laptop UI not found.")
    return FileResponse(index_path)


@app.get("/capture/{session_id}", include_in_schema=False)
def serve_phone_ui(session_id: str) -> FileResponse:  # noqa: ARG001
    phone_path = STATIC_DIR / "phone.html"
    if not phone_path.exists():
        raise HTTPException(status_code=404, detail="Mobile capture UI not found.")
    return FileResponse(phone_path)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/config/public")
def get_public_config() -> dict[str, Any]:
    """Return non-secret public runtime mode and credit-protection quota status."""
    return guardrails.get_public_runtime_mode()


@app.post("/auth/verify-passcode")
def verify_live_passcode(request: Request) -> dict[str, Any]:
    """Verify optional X-Live-Passcode header for unlocking Live AI and Admin writes."""
    client_ip = guardrails.extract_client_ip(request)
    allowed, retry_after = guardrails.rate_limiter.check_failed_passcode_allowed(client_ip)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many invalid passcode attempts. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    candidate = request.headers.get("x-live-passcode")
    if not guardrails.verify_passcode(candidate):
        guardrails.rate_limiter.record_failed_passcode(client_ip)
        raise HTTPException(status_code=403, detail="Invalid live access passcode.")

    return {
        "unlocked": True,
        **guardrails.get_public_runtime_mode(),
    }


# ---------------------------------------------------------------------------
# Core Intake Session, Upload, Status & Scoring Routes
# ---------------------------------------------------------------------------
@app.post("/sessions")
def create_intake_session(
    request: Request,
    payload: CreateSessionRequest = Body(default_factory=CreateSessionRequest),
) -> dict[str, Any]:
    _ensure_db()
    settings = db.get_settings()
    session_id = _generate_session_id(payload.garment_type)
    session = db.create_session(session_id, garment_type=payload.garment_type)

    base_url = _resolve_public_base_url(request, settings=settings)
    capture_url = f"{base_url}/capture/{session_id}"
    qr_data_url = _generate_qr_data_url(capture_url)

    return {
        "session_id": session["session_id"],
        "garment_type": session["garment_type"],
        "status": session["status"],
        "capture_url": capture_url,
        "qr_data_url": qr_data_url,
        "required_angles": list(REQUIRED_ANGLES),
    }


@app.get("/sessions")
def get_sessions(limit: int = Query(default=50, ge=1, le=200)) -> dict[str, Any]:
    _ensure_db()
    sessions = db.list_sessions(limit=limit)
    enriched: list[dict[str, Any]] = []
    for item in sessions:
        if "brand" not in item and item.get("total_score") is not None:
            sc = db.get_score(item["session_id"])
            labels = sc.get("extracted_labels") if isinstance(sc, dict) else None
            brand = labels.get("brand") if isinstance(labels, dict) else None
            item = {**item, "brand": brand}
        enriched.append(item)
    return {"sessions": enriched}


@app.patch("/sessions/{session_id}")
def update_intake_session_category(
    session_id: str,
    payload: CreateSessionRequest,
) -> dict[str, Any]:
    """Update garment category ('jacket' | 'pants') for an active intake session."""
    _ensure_db()
    updated = db.update_session(session_id, garment_type=payload.garment_type)
    if updated is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")
    return {
        "session_id": updated["session_id"],
        "garment_type": updated["garment_type"],
        "status": updated["status"],
    }


@app.post("/upload")
async def upload_photo(
    session_id: str = Form(...),
    angle: str = Form(...),
    file: UploadFile = File(...),
) -> dict[str, Any]:
    _ensure_db()
    session = db.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")

    clean_angle = angle.strip().lower()
    if clean_angle not in ALLOWED_ANGLES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid angle '{angle}'. Allowed values: {', '.join(ALLOWED_ANGLES)}.",
        )

    raw_bytes = await file.read()
    max_upload_bytes = guardrails.get_max_upload_bytes()
    if len(raw_bytes) > max_upload_bytes:
        max_mb = max(1, round(max_upload_bytes / (1024 * 1024)))
        raise HTTPException(
            status_code=413,
            detail=f"Uploaded image exceeds the {max_mb} MB size limit.",
        )
    ts = int(time.time() * 1000)
    filename = f"{clean_angle}_{ts}.jpg"
    dest_path = UPLOADS_DIR / session_id / filename
    _save_normalized_jpeg(raw_bytes, dest_path)

    settings = db.get_settings()
    clip_result = _run_verify_angle(
        str(dest_path),
        clean_angle,
        warn_threshold=settings.get("clip_warn_threshold"),
    )
    predicted_angle = clip_result.get("predicted_angle")
    expected_similarity = float(clip_result.get("expected_similarity", 0.0))
    top_similarity = float(clip_result.get("top_similarity", expected_similarity))
    angle_status = str(
        clip_result.get(
            "angle_status",
            "matched" if clip_result.get("angle_ok", True) else "warn_mismatch",
        )
    )
    angle_ok = bool(clip_result.get("angle_ok", angle_status == "matched"))
    matched_references = clip_result.get("matched_references") or []

    db.upsert_photo(
        session_id=session_id,
        angle=clean_angle,
        filepath=str(dest_path),
        clip_predicted_angle=predicted_angle,
        clip_confidence=expected_similarity,
        clip_matched_refs=matched_references,
        angle_ok=angle_ok,
    )
    db.update_session(session_id, status="capturing")

    photos = db.get_session_photos(session_id)
    captured_angles = _ordered_captured_angles(photos)

    return {
        "session_id": session_id,
        "angle": clean_angle,
        "photo_url": _build_photo_url(session_id, str(dest_path)),
        "angle_status": angle_status,
        "angle_ok": angle_ok,
        "predicted_angle": predicted_angle,
        "expected_similarity": expected_similarity,
        "top_similarity": top_similarity,
        "matched_references": matched_references,
        "captured_angles": captured_angles,
    }


@app.post("/sessions/{session_id}/complete")
def complete_session_capture(
    session_id: str,
    payload: CompleteSessionRequest = Body(default_factory=CompleteSessionRequest),
) -> dict[str, Any]:
    _ensure_db()
    session = db.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")

    merged_disclosure = dict(session.get("disclosure") or {})
    if payload.disclosure:
        merged_disclosure.update(payload.disclosure)

    db.update_session(
        session_id,
        status="ready_to_score",
        garment_type=payload.garment_type,
        disclosure=merged_disclosure if payload.disclosure is not None else None,
    )
    photos = db.get_session_photos(session_id)
    return {
        "session_id": session_id,
        "status": "ready_to_score",
        "captured_angles": _ordered_captured_angles(photos),
    }


@app.get("/status/{session_id}")
def get_session_status(session_id: str) -> dict[str, Any]:
    _ensure_db()
    session = db.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")

    photos = db.get_session_photos(session_id)
    enriched_photos = [_enrich_photo(p) for p in photos]
    score = db.get_score(session_id)

    return {
        "session_id": session["session_id"],
        "garment_type": session["garment_type"],
        "status": session["status"],
        "required_angles": list(REQUIRED_ANGLES),
        "captured_angles": _ordered_captured_angles(photos),
        "photos": enriched_photos,
        "disclosure": session.get("disclosure") or {},
        "ready_to_score": session["status"] == "ready_to_score",
        "score": score,
    }


@app.post("/score")
def score_intake_session(payload: ScoreRequest, request: Request) -> dict[str, Any]:
    _ensure_db()
    session = db.get_session(payload.session_id)
    if session is None:
        raise HTTPException(
            status_code=404,
            detail=f"Session '{payload.session_id}' not found.",
        )

    merged_disclosure = dict(session.get("disclosure") or {})
    if payload.disclosure:
        merged_disclosure.update(payload.disclosure)
        db.update_session(payload.session_id, disclosure=merged_disclosure)

    photos = db.get_session_photos(payload.session_id)
    if not photos:
        raise HTTPException(
            status_code=400,
            detail="No photos uploaded for this session yet. Capture at least one angle before scoring.",
        )

    score_mode = guardrails.get_score_mode()
    raw_passcode = (request.headers.get("x-live-passcode") or "").strip()
    client_ip = guardrails.extract_client_ip(request)
    use_demo_mode = False

    if score_mode == "demo":
        use_demo_mode = True
    elif score_mode == "demo_with_passcode":
        if not raw_passcode:
            use_demo_mode = True
        else:
            probe_ok, probe_retry = guardrails.rate_limiter.check_failed_passcode_allowed(client_ip)
            if not probe_ok:
                raise HTTPException(
                    status_code=429,
                    detail="Too many invalid passcode attempts. Please try again later.",
                    headers={"Retry-After": str(probe_retry)},
                )
            if not guardrails.verify_passcode(raw_passcode):
                guardrails.rate_limiter.record_failed_passcode(client_ip)
                raise HTTPException(
                    status_code=403,
                    detail="Invalid live access passcode. Clear the passcode to score in Demo Mode ($0 spend).",
                )
            allowed, reason, retry_after = guardrails.rate_limiter.check_and_record_live_score(client_ip)
            if not allowed:
                raise HTTPException(
                    status_code=429,
                    detail=reason,
                    headers={"Retry-After": str(retry_after)},
                )
            use_demo_mode = False
    else:
        allowed, reason, retry_after = guardrails.rate_limiter.check_and_record_live_score(client_ip)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail=reason,
                headers={"Retry-After": str(retry_after)},
            )
        use_demo_mode = False

    settings = db.get_settings()
    vision_result = _run_score_photos(
        photos,
        session["garment_type"],
        merged_disclosure,
        runtime_settings=settings,
        use_demo_mode=use_demo_mode,
    )
    score_result = _run_compute_score(
        vision_result,
        photos,
        session["garment_type"],
        merged_disclosure,
        auto_approve_min=settings.get("auto_approve_min"),
        human_review_min=settings.get("human_review_min"),
    )

    # Preserve vision details if not already folded into score_result
    score_payload = dict(score_result)
    score_payload.setdefault("session_id", payload.session_id)
    score_payload.setdefault("garment_type", session["garment_type"])
    if isinstance(vision_result, dict):
        for field_name in (
            "checklist",
            "extracted_labels",
            "hard_gate_flags",
            "contradiction_flagged",
            "contradiction_reason",
            "summary",
            "agent_trace",
        ):
            if field_name in vision_result and score_payload.get(field_name) is None:
                score_payload[field_name] = vision_result[field_name]

    saved = db.save_score(payload.session_id, score_payload)
    return saved


# ---------------------------------------------------------------------------
# Staff Human-Review Queue & Excel Shot Checklist Export
# ---------------------------------------------------------------------------
@app.get("/review-queue")
def get_review_queue() -> dict[str, Any]:
    _ensure_db()
    return {"items": db.list_review_queue()}


@app.post("/review-queue/{session_id}")
def update_review_queue_item(
    session_id: str,
    payload: ReviewUpdateRequest,
) -> dict[str, Any]:
    _ensure_db()
    updated = db.update_review_item(
        session_id,
        status=payload.status,
        staff_notes=payload.staff_notes,
    )
    if updated is None:
        raise HTTPException(
            status_code=404,
            detail=f"Review queue item for session '{session_id}' not found.",
        )
    return updated


@app.get("/export/{session_id}.xlsx")
def export_shot_checklist(session_id: str) -> StreamingResponse:
    _ensure_db()
    session = db.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")

    photos = db.get_session_photos(session_id)
    score = db.get_score(session_id)
    xlsx_bytes = exporter.build_checklist_workbook_bytes(session, photos, score)

    filename = f"moto-reloaded-{session_id}-shot-checklist.xlsx"
    return StreamingResponse(
        io.BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# Local Sample Demo Loader (Inference-Only Lookup Against data/RL01-*)
# ---------------------------------------------------------------------------
# REFERENCES (no training):
# - Model is pretrained and frozen for inference only (model.eval(), torch.no_grad(),
#   no optimizer, no backward pass, no fine-tuning).
#   Source: OpenCLIP repo (https://github.com/mlfoundations/open_clip) & model card (https://huggingface.co/laion/CLIP-ViT-B-32-laion2B-s34B-b79K)
# - Embeddings are only stored and compared with cosine similarity (lookup, not training).
#   Source: OpenCLIP repo (https://github.com/mlfoundations/open_clip) & Participant Agreement v2.0 ("Don't train or fine-tune a model on the photo set")
# - Photos sent to the scoring API go to Azure OpenAI, which does not train on inputs.
#   Source: Azure OpenAI Data, Privacy, and Security (https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy)
# - Challenge photos are never saved as training data.
#   Source: Participant Agreement v2.0 ("Don't train or fine-tune a model on the photo set")
@app.get("/demo/samples")
def list_demo_samples() -> dict[str, list[str]]:
    """List local sample folder IDs (directory names only) under data/RL01-*."""
    if not DATA_DIR.exists() or not DATA_DIR.is_dir():
        return {"items": []}

    items = sorted(
        entry.name
        for entry in DATA_DIR.iterdir()
        if entry.is_dir() and entry.name.startswith("RL01-")
    )
    return {"items": items}


# REFERENCES (no training):
# - Model is pretrained and frozen for inference only (model.eval(), torch.no_grad(),
#   no optimizer, no backward pass, no fine-tuning).
#   Source: OpenCLIP repo (https://github.com/mlfoundations/open_clip) & model card (https://huggingface.co/laion/CLIP-ViT-B-32-laion2B-s34B-b79K)
# - Embeddings are only stored and compared with cosine similarity (lookup, not training).
#   Source: OpenCLIP repo (https://github.com/mlfoundations/open_clip) & Participant Agreement v2.0 ("Don't train or fine-tune a model on the photo set")
# - Photos sent to the scoring API go to Azure OpenAI, which does not train on inputs.
#   Source: Azure OpenAI Data, Privacy, and Security (https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy)
# - Challenge photos are never saved as training data.
#   Source: Participant Agreement v2.0 ("Don't train or fine-tune a model on the photo set")
@app.post("/demo/load-sample")
def load_demo_sample(payload: LoadSampleRequest) -> dict[str, Any]:
    """Load one sample folder from data/RL01-* into a fresh intake session."""
    _ensure_db()
    item_id = payload.item_id.strip()
    if not re.fullmatch(r"RL01-[A-Za-z0-9_-]+", item_id):
        raise HTTPException(status_code=400, detail="Invalid sample item_id format.")

    if not DATA_DIR.exists():
        raise HTTPException(status_code=404, detail="Local sample data directory not found.")

    sample_dir = (DATA_DIR / item_id).resolve()
    if sample_dir.parent != DATA_DIR.resolve() or not sample_dir.is_dir():
        raise HTTPException(status_code=404, detail=f"Sample folder '{item_id}' not found.")

    selected = _select_sample_files(sample_dir, item_id)
    if not selected:
        raise HTTPException(
            status_code=404,
            detail=f"No matching angle images found in sample folder '{item_id}'.",
        )

    session_id = _generate_session_id(payload.garment_type)
    db.create_session(session_id, garment_type=payload.garment_type)

    session_upload_dir = UPLOADS_DIR / session_id
    session_upload_dir.mkdir(parents=True, exist_ok=True)

    settings = db.get_settings()
    ts_base = int(time.time() * 1000)
    for offset, (angle, src_path) in enumerate(selected.items()):
        dest_path = session_upload_dir / f"{angle}_{ts_base + offset}.jpg"
        if src_path.suffix.lower() in {".jpg", ".jpeg"}:
            shutil.copy2(src_path, dest_path)
        else:
            _save_normalized_jpeg(src_path.read_bytes(), dest_path)

        clip_result = _run_verify_angle(
            str(dest_path),
            angle,
            warn_threshold=settings.get("clip_warn_threshold"),
        )
        predicted_angle = clip_result.get("predicted_angle")
        expected_similarity = float(clip_result.get("expected_similarity", 0.0))
        angle_status = str(
            clip_result.get(
                "angle_status",
                "matched" if clip_result.get("angle_ok", True) else "warn_mismatch",
            )
        )
        angle_ok = bool(clip_result.get("angle_ok", angle_status == "matched"))
        matched_references = clip_result.get("matched_references") or []

        db.upsert_photo(
            session_id=session_id,
            angle=angle,
            filepath=str(dest_path),
            clip_predicted_angle=predicted_angle,
            clip_confidence=expected_similarity,
            clip_matched_refs=matched_references,
            angle_ok=angle_ok,
        )

    disclosure_data = dict(payload.disclosure or {})
    disclosure_data.setdefault("source_item_id", item_id)
    db.update_session(
        session_id,
        status="ready_to_score",
        garment_type=payload.garment_type,
        disclosure=disclosure_data,
    )

    photos = db.get_session_photos(session_id)
    enriched_photos = [_enrich_photo(p) for p in photos]

    return {
        "session_id": session_id,
        "item_id": item_id,
        "garment_type": payload.garment_type,
        "status": "ready_to_score",
        "captured_angles": _ordered_captured_angles(photos),
        "photos": enriched_photos,
    }


# ---------------------------------------------------------------------------
# Admin Settings & System Diagnostics (NEVER exposes API keys or secrets)
# ---------------------------------------------------------------------------
@app.get("/admin/settings")
def get_admin_settings() -> dict[str, Any]:
    """Return runtime intake settings with permanently locked hard-gate flag."""
    _ensure_db()
    return {
        "settings": db.get_settings(),
        "available_deployments": list(db.ALLOWED_DEPLOYMENTS),
        "hard_gate_locked": True,
    }


def _require_admin_write_unlocked(request: Request) -> None:
    """Enforce live access passcode on admin write routes when public writes are locked."""
    if not guardrails.is_admin_write_protected():
        return
    client_ip = guardrails.extract_client_ip(request)
    probe_ok, probe_retry = guardrails.rate_limiter.check_failed_passcode_allowed(client_ip)
    if not probe_ok:
        raise HTTPException(
            status_code=429,
            detail="Too many invalid passcode attempts. Please try again later.",
            headers={"Retry-After": str(probe_retry)},
        )
    raw_passcode = (request.headers.get("x-live-passcode") or "").strip()
    if not guardrails.verify_passcode(raw_passcode):
        guardrails.rate_limiter.record_failed_passcode(client_ip)
        raise HTTPException(
            status_code=403,
            detail="Admin settings are locked in public portfolio mode. Unlock with the Live Access Passcode first.",
        )


@app.post("/admin/settings")
def save_admin_settings(payload: AdminSettingsUpdate, request: Request) -> dict[str, Any]:
    """Validate and persist runtime intake settings in SQLite."""
    _ensure_db()
    _require_admin_write_unlocked(request)

    patch = payload.model_dump(exclude_none=True)
    if "public_base_url" in patch:
        raw_url = str(patch["public_base_url"]).strip().rstrip("/")
        if raw_url and not raw_url.startswith(("http://", "https://")):
            raise HTTPException(
                status_code=422,
                detail="public_base_url must be empty or start with http:// or https://.",
            )
        patch["public_base_url"] = raw_url

    try:
        updated = db.update_settings(patch)
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return {
        "settings": updated,
        "available_deployments": list(db.ALLOWED_DEPLOYMENTS),
        "hard_gate_locked": True,
    }


_SESSION_DIR_RE = re.compile(r"[A-Za-z0-9_-]{1,64}")


def _path_inside_uploads(path: Path) -> Path | None:
    """Return a resolved path only when it lives strictly inside the uploads directory."""
    try:
        root = UPLOADS_DIR.resolve()
        resolved = path.resolve()
    except OSError:
        return None
    if resolved == root or root not in resolved.parents:
        return None
    return resolved


def _remove_ledger_uploads(session_ids: list[str], filepaths: list[str]) -> int:
    """Delete recorded upload files and their session folders. Ignore paths outside uploads."""
    removed = 0
    for raw in filepaths:
        if not raw:
            continue
        target = _path_inside_uploads(Path(raw))
        if target is not None and target.is_file():
            target.unlink()
            removed += 1
    seen: set[str] = set()
    for sid in session_ids:
        if not isinstance(sid, str) or _SESSION_DIR_RE.fullmatch(sid) is None or sid in seen:
            continue
        seen.add(sid)
        folder = _path_inside_uploads(UPLOADS_DIR / sid)
        if folder is not None and folder.is_dir():
            shutil.rmtree(folder)
            removed += 1
    return removed


@app.post("/admin/ledger/clear")
def clear_intake_ledger(request: Request) -> dict[str, Any]:
    """Wipe intake sessions, photos, scores, review rows, and their upload files.

    Runtime settings in app_settings are kept.
    """
    _ensure_db()
    _require_admin_write_unlocked(request)
    cleared = db.clear_ledger()
    upload_entries = _remove_ledger_uploads(
        list(cleared.get("session_ids") or []),
        list(cleared.get("filepaths") or []),
    )
    return {
        "cleared": True,
        "sessions": cleared["sessions"],
        "photos": cleared["photos"],
        "scores": cleared["scores"],
        "reviews": cleared["reviews"],
        "upload_entries": upload_entries,
        "settings_kept": True,
    }


@app.get("/admin/diagnostics")
def get_admin_diagnostics() -> dict[str, Any]:
    """Return non-secret Azure, OpenCLIP, SQLite, compliance, and trace diagnostics."""
    _ensure_db()
    settings = db.get_settings()

    endpoint = (os.environ.get("AZURE_OPENAI_ENDPOINT") or "").strip()
    api_key = (os.environ.get("AZURE_OPENAI_API_KEY") or "").strip()
    api_version = (
        os.environ.get("AZURE_OPENAI_API_VERSION") or "2024-12-01-preview"
    ).strip()
    endpoint_host = urlparse(endpoint).hostname if endpoint else None

    openclip_diag = (
        clip_matcher.get_clip_diagnostics()
        if hasattr(clip_matcher, "get_clip_diagnostics")
        else {}
    )

    db_stats = (
        db.get_db_stats()
        if hasattr(db, "get_db_stats")
        else {
            "db_path": db.get_db_path(),
            "session_count": len(db.list_sessions(limit=10000)),
            "pending_review_count": sum(
                1
                for item in db.list_review_queue()
                if (item.get("review_status") or item.get("status")) == "pending"
            ),
        }
    )

    return {
        "azure": {
            "configured": bool(endpoint and api_key),
            "endpoint_host": endpoint_host,
            "api_version": api_version,
            "active_deployment": settings.get("vision_deployment", "gpt-4.1"),
            "available_deployments": list(db.ALLOWED_DEPLOYMENTS),
        },
        "openclip": openclip_diag,
        "database": db_stats,
        "compliance": {
            "hard_gate_locked": True,
            "inference_only": True,
            "wording_mode": "photo_coverage_and_damage_disclosure_only",
        },
        "protection": guardrails.get_public_runtime_mode(),
        "latest_agent_trace": db.get_latest_agent_trace(),
    }
