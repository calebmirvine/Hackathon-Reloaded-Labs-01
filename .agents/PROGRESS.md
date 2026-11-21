<!-- # Created by Caleb M. Irvine for use by Moto Reloaded -->

# Hackathon Progress Tracker — Gear Intake Checker

## Phase 0 — Setup & Context Alignment
- [x] Inspect challenge docs (`item-grading-sheet-v2.docx`, `photo-briefing-reloaded-labs.docx`, `reloaded-labs-shot-checklist.xlsx`)
- [x] Audit sample dataset folder structure (`RL01-001`–`RL01-019`, 282 files, no ground-truth sheet)
- [x] Provision Azure OpenAI (`aoai-motoreloaded-rl01` in `eastus2`: `gpt-4.1` + `gpt-4.1-mini`) and configure `.env`
- [x] Align `AGENTS.md`, `DOMAIN-SPEC.md`, `.gitignore`, and create `TOOLS.md` for judge disclosure
- [x] Push Milestone 0 baseline docs to private `origin/main` (`20ce89b`)

## Phase 1 — Project Scaffold, SQLite & Reference Embeddings (`uv`)
- [x] Configure `pyproject.toml` via `uv` (`fastapi`, `uvicorn[standard]`, `open-clip-torch`, `torch`, `torchvision`, `openai`, `pillow`, `python-multipart`, `numpy`, `qrcode[pil]`, `openpyxl`, `python-dotenv`, `pydantic`, plus `pytest` / `httpx`) and sync `.venv`
- [x] Set up SQLite schema (`sessions`, `photos`, `scores`, `review_queue`) in `app/db.py` with dynamic `INTAKE_DB_PATH`
- [x] Build local inference-only script (`scripts/build_refs.py`) generating `refs.npy` `(263, 512) float32` + `refs_meta.json` (263 garment photos; 19 separator cards skipped) using frozen pretrained OpenCLIP `ViT-B-32` (`laion2b_s34b_b79k`)

## Phase 2 — 3-Stage Scoring Pipeline
- [x] Implement OpenCLIP angle verification & nearest-reference lookup using `numpy` cosine similarity against `refs.npy` (`app/clip_matcher.py`, with zero-shot text fallback)
- [x] Implement swappable `score_photos()` (`app/vision_scorer.py`) calling Azure OpenAI `gpt-4.1` with resized photos + matched reference labels + rubric -> structured pass/fail + reason JSON per checklist item
- [x] Implement deterministic Python 0–100 `"photo coverage + damage disclosure"` scorer (`app/scoring_engine.py`: `0–49` rejected/retake + hard gate cap & material-aware upcycling route, `50–84` human review queue, `85–100` auto-approved & logged, NA CE-label neutrality)
- [x] Push Milestone 1 core pipeline & scoring tests (`84393bd`)

## Phase 3 — FastAPI Endpoints, Clerk Export & Frontend (Laptop QR + Phone Capture)
- [x] Implement FastAPI endpoints (`app/main.py`): `/`, `/capture/{id}`, `/health`, `POST/GET /sessions`, `POST /upload`, `POST /sessions/{id}/complete`, `GET /status/{id}`, `POST /score`, `GET/POST /review-queue`, `GET /export/{id}.xlsx`, `GET /demo/samples`, `POST /demo/load-sample`
- [x] Implement 28-column Row-5 Shot Checklist + Intake Report Excel export (`app/exporter.py`)
- [x] Build Laptop Counter view (`app/static/index.html`, `app/static/laptop.js`, `app/static/styles.css`): QR handoff, Demo Backup sample loader, 2-second `/status/{id}` polling, live angle cards, 0–100 score dashboard, checklist pass/fail + reasons, Review Queue (50–84), Intake Log, Upcycling & New-Gear Trade-In card, `.xlsx` export
- [x] Build Phone Guided Capture view (`app/static/phone.html`, `app/static/phone.js`): mobile-first 6-angle stepper (`front`, `left`, `right`, `back`, `inside`, `labels`) + optional coin-scale `defect` shots, instant OpenCLIP angle feedback (`Retake or Keep Anyway`), 3-control Rider Disclosure submit

## Phase 4 — Verification, Compliance Audit & Demo Prep
- [x] Offline automated tests (`tests/test_scoring_engine.py`, `tests/test_api.py`): **20/20 passing** via `uv run pytest -v`
- [x] Live local E2E smoke test on `RL01-001` (frozen OpenCLIP `verify_angle` 6/6 matched + Azure OpenAI `gpt-4.1` `score_photos()` + `compute_score()` -> `100/100` `auto_approved` + valid 28-column `.xlsx`)
- [x] Audit all UI copy, prompts, headers, Rule 11 `# REFERENCES (no training):` blocks, and JSON outputs (`"photo coverage"` & `"damage disclosure"` wording only, zero safety certification claims, zero buy-in offers on compromised gear, no person identification, no challenge photos sent to coding assistants)
- [x] Update `TOOLS.md` with exact OpenCLIP checkpoint name and final package versions; verify private repo & `git status` excludes `data/`, `.env`, `refs.npy`, `refs_meta.json`, `*.db`, `uploads/`, `.docx`, `.xlsx`
- [ ] Expose local FastAPI over HTTPS via ngrok or Cloudflare Tunnel (`cloudflared`) and run live phone camera walkthrough for demo
