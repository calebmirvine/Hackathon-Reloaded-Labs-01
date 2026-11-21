# Created by Caleb M. Irvine for use by Moto Reloaded
"""Fast offline FastAPI integration tests for Moto Reloaded Gear Intake Checker."""

from __future__ import annotations

import io
import json
import re
import shutil
from pathlib import Path

import openpyxl
import pytest
from fastapi.testclient import TestClient
from PIL import Image

REQUIRED_ANGLES = ["front", "left", "right", "back", "inside", "labels"]
CANARY_API_KEY = "CANARY_SECRET_AZURE_KEY_987654321"
PERSONAL_NAMES_RE = re.compile(r"\b(alex|barbara|mathias)\b", re.IGNORECASE)

EXPECTED_ROW5_HEADERS = [
    "Item ID",
    "Jacket / Pants",
    "Brand / description",
    "Set",
    "Complete?",
    "front",
    "back",
    "left",
    "right",
    "z1-1",
    "z1-2",
    "z1-3",
    "z1-4",
    "z1-5",
    "brand",
    "ce",
    "comp",
    "lining",
    "lin-1",
    "lin-2",
    "lin-3",
    "lin-4",
    "lin-5",
    "pockets",
    "# defects",
    "Files renamed",
    "Sheet filled",
    "Notes (skipped shots, retakes)",
]


def _make_jpeg_bytes(color: tuple[int, int, int] = (70, 73, 60)) -> bytes:
    """Create a tiny valid in-memory RGB JPEG (no challenge dataset access)."""
    buf = io.BytesIO()
    img = Image.new("RGB", (64, 64), color=color)
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def _sample_agent_trace(deployment: str = "gpt-4.1") -> dict:
    return {
        "provider": "Azure OpenAI",
        "agent_label": "Azure OpenAI Vision Rubric Agent",
        "deployment": deployment,
        "model_returned": f"{deployment}-2025-04-14",
        "api_version": "2025-01-01-preview",
        "endpoint_host": "aoai-motoreloaded-rl01.openai.azure.com",
        "temperature": 0.1,
        "max_tokens": 1800,
        "latency_ms": 420,
        "usage": {
            "prompt_tokens": 1240,
            "completion_tokens": 280,
            "total_tokens": 1520,
        },
        "clip_stage1_model": "OpenCLIP ViT-B-32 (laion2b_s34b_b79k, frozen inference)",
        "photos_evaluated": 6,
        "system_prompt": "Moto Reloaded photo coverage and damage disclosure rubric prompt.",
        "user_prompt": "Garment Type: JACKET\nPhoto #1 — Requested slot: 'front'",
        "raw_response": json.dumps({"summary": "Clean photo coverage and damage disclosure."}),
    }


def _clean_vision_payload() -> dict:
    return {
        "checklist": [
            {
                "key": "angles_complete",
                "category": "photo_coverage",
                "label": "All required angles visible",
                "passed": True,
                "severity": "none",
                "reason": "All 6 required angles clearly framed.",
            },
            {
                "key": "photo_sharpness",
                "category": "photo_coverage",
                "label": "Photos sharp and clear",
                "passed": True,
                "severity": "none",
                "reason": "Images are well lit and in focus.",
            },
            {
                "key": "labels_legible",
                "category": "photo_coverage",
                "label": "Labels legible",
                "passed": True,
                "severity": "none",
                "reason": "Brand and composition tags readable.",
            },
            {
                "key": "zone1_condition",
                "category": "damage_disclosure",
                "label": "Zone 1 intact",
                "passed": True,
                "severity": "none",
                "reason": "No scuffs, breaches, or repairs visible in Zone 1.",
            },
            {
                "key": "zone2_3_wear",
                "category": "damage_disclosure",
                "label": "Zone 2/3 wear minimal",
                "passed": True,
                "severity": "none",
                "reason": "Light handling wear only.",
            },
            {
                "key": "hardware_zippers",
                "category": "damage_disclosure",
                "label": "Hardware intact",
                "passed": True,
                "severity": "none",
                "reason": "Zippers and snaps appear functional.",
            },
            {
                "key": "lining_pockets",
                "category": "damage_disclosure",
                "label": "Interior lining intact",
                "passed": True,
                "severity": "none",
                "reason": "Clean lining and intact protector pockets.",
            },
        ],
        "extracted_labels": {
            "brand": "Alpinestars",
            "size": "52",
            "ce_label": "AA",
            "composition": "100% cowhide leather",
            "material_group": "leather",
        },
        "hard_gate_flags": {
            "crash_evident": False,
            "contamination_evident": False,
            "zone1_breach_or_repair": False,
        },
        "contradiction_flagged": False,
        "contradiction_reason": None,
        "summary": "All 6 angles captured clearly with no visible damage disclosed.",
        "agent_trace": _sample_agent_trace(),
    }


def _human_review_vision_payload() -> dict:
    return {
        "checklist": [
            {
                "key": "angles_complete",
                "category": "photo_coverage",
                "label": "All required angles visible",
                "passed": True,
                "severity": "none",
                "reason": "All 6 required angles uploaded.",
            },
            {
                "key": "photo_sharpness",
                "category": "photo_coverage",
                "label": "Photos sharp and clear",
                "passed": False,
                "severity": "minor",
                "reason": "Inside photo is slightly out of focus.",
            },
            {
                "key": "labels_legible",
                "category": "photo_coverage",
                "label": "Labels legible",
                "passed": False,
                "severity": "minor",
                "reason": "Composition label partly creased.",
            },
            {
                "key": "zone1_condition",
                "category": "damage_disclosure",
                "label": "Zone 1 intact",
                "passed": True,
                "severity": "none",
                "reason": "No Zone 1 breach or repair.",
            },
            {
                "key": "zone2_3_wear",
                "category": "damage_disclosure",
                "label": "Zone 2/3 wear",
                "passed": False,
                "severity": "minor",
                "reason": "Noticeable sleeve fading and cuff scuffing.",
            },
            {
                "key": "hardware_zippers",
                "category": "damage_disclosure",
                "label": "Hardware functional",
                "passed": False,
                "severity": "major",
                "reason": "Pocket zip pull missing; requires physical check.",
            },
            {
                "key": "lining_pockets",
                "category": "damage_disclosure",
                "label": "Interior lining intact",
                "passed": True,
                "severity": "none",
                "reason": "Lining intact with light wear.",
            },
        ],
        "extracted_labels": {
            "brand": "Dainese",
            "size": "50",
            "ce_label": "none",
            "composition": "Polyamide textile shell",
            "material_group": "textile",
        },
        "hard_gate_flags": {
            "crash_evident": False,
            "contamination_evident": False,
            "zone1_breach_or_repair": False,
        },
        "contradiction_flagged": True,
        "contradiction_reason": "Usage declared light, but visible fading suggests heavier use.",
        "summary": "Moderate Zone 2 wear and hardware note flagged for in-hand inspection.",
        "agent_trace": _sample_agent_trace(),
    }


@pytest.fixture()
def api_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Provide an isolated FastAPI TestClient with temp SQLite DB and mocked AI calls."""
    db_file = tmp_path / "test_intake.db"
    monkeypatch.setenv("INTAKE_DB_PATH", str(db_file))
    monkeypatch.setenv("AZURE_OPENAI_API_KEY", CANARY_API_KEY)
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://aoai-motoreloaded-rl01.openai.azure.com/")
    monkeypatch.setenv("AZURE_OPENAI_VISION_DEPLOYMENT", "gpt-4.1")
    monkeypatch.delenv("PUBLIC_BASE_URL", raising=False)

    import app.clip_matcher as clip_matcher
    import app.db as db_mod
    import app.main as main_mod
    import app.vision_scorer as vision_scorer

    created_sessions: list[str] = []

    def fake_verify_angle(image_path: str, expected_angle: str) -> dict:
        return {
            "expected_angle": expected_angle,
            "predicted_angle": expected_angle,
            "expected_similarity": 0.91,
            "top_similarity": 0.91,
            "angle_status": "matched",
            "angle_ok": True,
            "matched_references": [
                {
                    "item_id": "RL01-001",
                    "angle": expected_angle,
                    "detail_tag": expected_angle,
                    "similarity": 0.91,
                }
            ],
            "mode": "refs_npy",
        }

    vision_state = {"payload": _clean_vision_payload()}

    def fake_score_photos(photos: list[dict], garment_type: str, disclosure: dict | None = None) -> dict:
        return vision_state["payload"]

    monkeypatch.setattr(clip_matcher, "verify_angle", fake_verify_angle)
    if hasattr(main_mod, "verify_angle"):
        monkeypatch.setattr(main_mod, "verify_angle", fake_verify_angle)
    monkeypatch.setattr(vision_scorer, "score_photos", fake_score_photos)
    if hasattr(main_mod, "score_photos"):
        monkeypatch.setattr(main_mod, "score_photos", fake_score_photos)

    db_mod.init_db()

    with TestClient(main_mod.app) as client:
        yield {
            "client": client,
            "vision_state": vision_state,
            "created_sessions": created_sessions,
            "db_file": db_file,
        }

    # Clean up any temporary session upload folders created under uploads/
    uploads_root = Path("uploads")
    for sid in created_sessions:
        session_dir = uploads_root / sid
        if session_dir.exists():
            shutil.rmtree(session_dir, ignore_errors=True)


def _upload_all_required_angles(client: TestClient, session_id: str) -> None:
    jpeg_bytes = _make_jpeg_bytes()
    for angle in REQUIRED_ANGLES:
        resp = client.post(
            "/upload",
            data={"session_id": session_id, "angle": angle},
            files={"file": (f"{angle}.jpg", jpeg_bytes, "image/jpeg")},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["session_id"] == session_id
        assert body["angle"] == angle
        assert body["angle_status"] == "matched"
        assert body["angle_ok"] is True
        assert body["photo_url"]


def test_pages_and_health(api_env: dict) -> None:
    """GET /, GET /capture/<id>, and GET /health serve cleanly."""
    client: TestClient = api_env["client"]

    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    home = client.get("/")
    assert home.status_code == 200
    assert "text/html" in home.headers.get("content-type", "")
    home_lower = home.text.lower()
    assert "photo coverage" in home_lower
    assert "damage disclosure" in home_lower

    phone = client.get("/capture/demo1234")
    assert phone.status_code == 200
    assert "text/html" in phone.headers.get("content-type", "")


def test_full_intake_flow_auto_approved_and_xlsx_export(api_env: dict) -> None:
    """Full session creation -> 6 uploads -> poll -> complete -> score -> Excel export."""
    client: TestClient = api_env["client"]

    create_resp = client.post("/sessions", json={"garment_type": "jacket"})
    assert create_resp.status_code == 200, create_resp.text
    created = create_resp.json()
    session_id = created["session_id"]
    api_env["created_sessions"].append(session_id)

    assert created["garment_type"] == "jacket"
    assert session_id in created["capture_url"]
    assert created["qr_data_url"].startswith("data:image/png;base64,")
    assert created["required_angles"] == REQUIRED_ANGLES

    _upload_all_required_angles(client, session_id)

    status_before = client.get(f"/status/{session_id}")
    assert status_before.status_code == 200
    status_data = status_before.json()
    assert set(status_data["captured_angles"]) == set(REQUIRED_ANGLES)
    assert len(status_data["photos"]) == 6
    assert all(p.get("photo_url") for p in status_data["photos"])

    complete_resp = client.post(
        f"/sessions/{session_id}/complete",
        json={
            "garment_type": "jacket",
            "disclosure": {"crash": False, "usage": "light", "notes": "Clean jacket"},
        },
    )
    assert complete_resp.status_code == 200, complete_resp.text
    assert complete_resp.json()["status"] == "ready_to_score"

    score_resp = client.post("/score", json={"session_id": session_id})
    assert score_resp.status_code == 200, score_resp.text
    score_data = score_resp.json()
    assert 85 <= score_data["total_score"] <= 100
    assert score_data["decision"] == "auto_approved"
    assert score_data["buy_in_recommended"] is True

    # Confirm SQLite persistence via /status and /sessions
    status_after = client.get(f"/status/{session_id}").json()
    assert status_after["status"] == "scored"
    assert status_after["score"] is not None
    assert status_after["score"]["total_score"] == score_data["total_score"]

    sessions_resp = client.get("/sessions")
    assert sessions_resp.status_code == 200
    session_ids = [s["session_id"] for s in sessions_resp.json()["sessions"]]
    assert session_id in session_ids

    # Verify Excel export returns valid .xlsx with exact Row-5 headers
    export_resp = client.get(f"/export/{session_id}.xlsx")
    assert export_resp.status_code == 200, export_resp.text
    wb = openpyxl.load_workbook(io.BytesIO(export_resp.content))
    ws = wb.active
    row5_values = [ws.cell(row=5, column=idx).value for idx in range(1, len(EXPECTED_ROW5_HEADERS) + 1)]
    assert row5_values == EXPECTED_ROW5_HEADERS


def test_human_review_queue_flow(api_env: dict) -> None:
    """A 50-84 score lands in GET /review-queue and updates cleanly via POST /review-queue/<id>."""
    client: TestClient = api_env["client"]
    api_env["vision_state"]["payload"] = _human_review_vision_payload()

    session_id = client.post("/sessions", json={"garment_type": "pants"}).json()["session_id"]
    api_env["created_sessions"].append(session_id)

    _upload_all_required_angles(client, session_id)
    client.post(
        f"/sessions/{session_id}/complete",
        json={"garment_type": "pants", "disclosure": {"crash": False, "usage": "light"}},
    )

    score_resp = client.post("/score", json={"session_id": session_id})
    assert score_resp.status_code == 200, score_resp.text
    score_data = score_resp.json()
    assert 50 <= score_data["total_score"] <= 84
    assert score_data["decision"] == "human_review"

    queue_resp = client.get("/review-queue")
    assert queue_resp.status_code == 200
    items = queue_resp.json()["items"]
    matching = [item for item in items if item["session_id"] == session_id]
    assert len(matching) == 1

    update_resp = client.post(
        f"/review-queue/{session_id}",
        json={"status": "approved", "staff_notes": "Reviewer inspected in-hand; seams intact."},
    )
    assert update_resp.status_code == 200, update_resp.text

    queue_after = client.get("/review-queue").json()["items"]
    updated = [item for item in queue_after if item["session_id"] == session_id][0]
    assert updated.get("review_status", updated.get("status")) == "approved"
    assert "Reviewer inspected" in str(updated.get("staff_notes", ""))


def test_hard_gate_crash_disclosure_via_score_endpoint(api_env: dict) -> None:
    """Declared crash enforces hard gate <= 49 and upcycling plan via POST /score."""
    client: TestClient = api_env["client"]

    session_id = client.post("/sessions", json={"garment_type": "jacket"}).json()["session_id"]
    api_env["created_sessions"].append(session_id)

    _upload_all_required_angles(client, session_id)
    client.post(
        f"/sessions/{session_id}/complete",
        json={"garment_type": "jacket", "disclosure": {"crash": True, "usage": "moderate"}},
    )

    score_resp = client.post("/score", json={"session_id": session_id})
    assert score_resp.status_code == 200, score_resp.text
    score_data = score_resp.json()
    assert score_data["total_score"] <= 49
    assert score_data["decision"] == "rejected_upcycle"
    assert score_data["buy_in_recommended"] is False
    assert score_data["hard_gate_triggered"] is True
    assert score_data.get("upcycle_plan")


def test_invalid_angle_and_unknown_session_rejected(api_env: dict) -> None:
    """Invalid angle returns 4xx and unknown session returns 404."""
    client: TestClient = api_env["client"]

    missing = client.get("/status/doesnotexist")
    assert missing.status_code == 404

    session_id = client.post("/sessions", json={"garment_type": "jacket"}).json()["session_id"]
    api_env["created_sessions"].append(session_id)

    bad_upload = client.post(
        "/upload",
        data={"session_id": session_id, "angle": "helmet"},
        files={"file": ("helmet.jpg", _make_jpeg_bytes(), "image/jpeg")},
    )
    assert bad_upload.status_code in (400, 422)


def test_agent_trace_persisted_and_no_api_key_leaked(api_env: dict) -> None:
    """agent_trace persists through POST /score, GET /status/<id>, and GET /admin/diagnostics without API key."""
    client: TestClient = api_env["client"]

    session_id = client.post("/sessions", json={"garment_type": "jacket"}).json()["session_id"]
    api_env["created_sessions"].append(session_id)
    _upload_all_required_angles(client, session_id)
    client.post(
        f"/sessions/{session_id}/complete",
        json={"garment_type": "jacket", "disclosure": {"crash": False, "usage": "light"}},
    )

    score_resp = client.post("/score", json={"session_id": session_id})
    assert score_resp.status_code == 200, score_resp.text
    score_data = score_resp.json()
    trace = score_data.get("agent_trace")
    assert isinstance(trace, dict)
    assert trace["provider"] == "Azure OpenAI"
    assert trace["deployment"] == "gpt-4.1"
    assert trace["system_prompt"]
    assert trace["user_prompt"]
    assert trace["raw_response"]

    status_resp = client.get(f"/status/{session_id}")
    assert status_resp.status_code == 200
    status_data = status_resp.json()
    assert status_data["score"]["agent_trace"]["provider"] == "Azure OpenAI"

    settings_resp = client.get("/admin/settings")
    assert settings_resp.status_code == 200
    diag_resp = client.get("/admin/diagnostics")
    assert diag_resp.status_code == 200
    diag_data = diag_resp.json()

    latest_trace = diag_data.get("latest_agent_trace")
    assert isinstance(latest_trace, dict)
    assert latest_trace["session_id"] == session_id
    assert latest_trace["agent_trace"]["deployment"] == "gpt-4.1"

    # Canary API key must NEVER appear anywhere in API payloads
    for name, payload in (
        ("/score", score_data),
        ("/status", status_data),
        ("/admin/settings", settings_resp.json()),
        ("/admin/diagnostics", diag_data),
    ):
        serialized = json.dumps(payload)
        assert CANARY_API_KEY not in serialized, f"Secret API key leaked in {name}!"


def test_admin_settings_and_diagnostics_endpoints(api_env: dict) -> None:
    """Admin settings persist & validate cleanly, override QR URL, and keep Hard Gate locked."""
    client: TestClient = api_env["client"]

    initial = client.get("/admin/settings")
    assert initial.status_code == 200, initial.text
    init_body = initial.json()
    assert init_body["hard_gate_locked"] is True
    assert "gpt-4.1" in init_body["available_deployments"]
    assert "gpt-4.1-mini" in init_body["available_deployments"]
    assert init_body["settings"]["poll_interval_ms"] == 2000

    # Persist valid settings update
    updated = client.post(
        "/admin/settings",
        json={
            "vision_deployment": "gpt-4.1-mini",
            "temperature": 0.25,
            "max_tokens": 1400,
            "poll_interval_ms": 3000,
            "auto_score_on_complete": False,
            "clip_warn_threshold": 0.35,
            "auto_approve_min": 92,
            "human_review_min": 55,
            "public_base_url": "https://moto-demo.trycloudflare.com",
        },
    )
    assert updated.status_code == 200, updated.text
    upd_body = updated.json()
    assert upd_body["hard_gate_locked"] is True
    assert upd_body["settings"]["vision_deployment"] == "gpt-4.1-mini"
    assert upd_body["settings"]["poll_interval_ms"] == 3000
    assert upd_body["settings"]["auto_score_on_complete"] is False
    assert upd_body["settings"]["auto_approve_min"] == 92
    assert upd_body["settings"]["human_review_min"] == 55

    # Re-fetch confirms SQLite persistence
    refetched = client.get("/admin/settings").json()
    assert refetched["settings"]["vision_deployment"] == "gpt-4.1-mini"
    assert refetched["settings"]["public_base_url"] == "https://moto-demo.trycloudflare.com"

    # Session creation honors public_base_url override
    sess = client.post("/sessions", json={"garment_type": "jacket"}).json()
    api_env["created_sessions"].append(sess["session_id"])
    assert sess["capture_url"].startswith("https://moto-demo.trycloudflare.com/capture/")

    # Invalid settings rejected with 422
    for bad_patch in (
        {"human_review_min": 85, "auto_approve_min": 80},
        {"human_review_min": 40, "auto_approve_min": 85},
        {"vision_deployment": "unsupported-model-99"},
        {"temperature": 2.5},
    ):
        bad_resp = client.post("/admin/settings", json=bad_patch)
        assert bad_resp.status_code == 422, f"Expected 422 for {bad_patch}, got {bad_resp.status_code}"

    # Verify Hard Gate still caps <= 49 even with custom thresholds active
    _upload_all_required_angles(client, sess["session_id"])
    hard_gated = client.post(
        "/score",
        json={"session_id": sess["session_id"], "disclosure": {"crash": True}},
    ).json()
    assert hard_gated["total_score"] <= 49
    assert hard_gated["decision"] == "rejected_upcycle"
    assert hard_gated["buy_in_recommended"] is False
    assert hard_gated["hard_gate_triggered"] is True

    # Diagnostics payload structure & zero secret exposure
    diag = client.get("/admin/diagnostics")
    assert diag.status_code == 200, diag.text
    diag_body = diag.json()
    assert diag_body["azure"]["configured"] is True
    assert diag_body["azure"]["endpoint_host"] == "aoai-motoreloaded-rl01.openai.azure.com"
    assert diag_body["azure"]["active_deployment"] == "gpt-4.1-mini"
    assert "api_key" not in json.dumps(diag_body["azure"]).lower()
    assert diag_body["openclip"]["checkpoint"] == "ViT-B-32"
    assert diag_body["openclip"]["pretrained"] == "laion2b_s34b_b79k"
    assert diag_body["database"]["session_count"] >= 1
    assert diag_body["compliance"]["hard_gate_locked"] is True
    assert diag_body["compliance"]["inference_only"] is True
    assert CANARY_API_KEY not in json.dumps(diag_body)


def test_zero_personal_names_across_app() -> None:
    """No hardcoded staff/owner personal names (Alex, Barbara, Mathias) appear anywhere in app/."""
    app_root = Path(__file__).resolve().parent.parent / "app"
    hits: list[str] = []
    for path in sorted(app_root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in {".py", ".html", ".css", ".js"}:
            continue
        text = path.read_text(encoding="utf-8")
        for line_no, line in enumerate(text.splitlines(), start=1):
            if PERSONAL_NAMES_RE.search(line):
                hits.append(f"{path.relative_to(app_root.parent)}:{line_no}: {line.strip()}")
    assert not hits, "Hardcoded personal names found in app/:\n" + "\n".join(hits)


def test_laptop_js_no_flicker_and_smart_polling() -> None:
    """laptop.js tracks per-angle DOM signatures (no full innerHTML rebuild on poll) and stops on scored."""
    laptop_js = Path(__file__).resolve().parent.parent / "app" / "static" / "laptop.js"
    src = laptop_js.read_text(encoding="utf-8")

    # Signature-based incremental updates instead of wiping angleGrid.innerHTML every poll
    assert "angleSignatures" in src, "Expected per-angle signature map (angleSignatures) in laptop.js"
    assert not re.search(
        r"function\s+renderSessionStatus[\s\S]{0,4000}angleGrid\.innerHTML\s*=",
        src,
    ), "renderSessionStatus must NOT rebuild angleGrid.innerHTML on every poll!"

    # Polling stops automatically once session is scored
    assert re.search(
        r"""status\s*===\s*["']scored["'][\s\S]{0,400}stopPolling\s*\(""",
        src,
    ) or re.search(
        r"""stopPolling\s*\(\)[\s\S]{0,200}["']scored["']""",
        src,
    ), "Expected laptop.js to stop polling automatically when status === 'scored'"
