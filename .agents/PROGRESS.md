<!-- # Created by Caleb M. Irvine for use by Moto Reloaded -->

# Hackathon Progress Tracker — Gear Intake Checker

## Phase 0 — Setup & Context Alignment
- [x] Inspect challenge docs (`item-grading-sheet-v2.docx`, `photo-briefing-reloaded-labs.docx`, `reloaded-labs-shot-checklist.xlsx`)
- [x] Audit sample dataset folder structure (`RL01-001`–`RL01-019`, 282 files, no ground-truth sheet)
- [x] Provision Azure OpenAI (`aoai-motoreloaded-rl01` in `eastus2`: `gpt-4.1` + `gpt-4.1-mini`) and configure `.env`
- [x] Align `AGENTS.md`, `DOMAIN-SPEC.md`, `.gitignore`, and create `TOOLS.md` for judge disclosure

## Phase 1 — Project Scaffold, SQLite & Reference Embeddings (`uv`)
- [ ] Configure `pyproject.toml` via `uv` (`fastapi`, `uvicorn`, `open-clip-torch`, `openai`, `pillow`, `python-multipart`, `numpy`, `qrcode`, `python-dotenv`)
- [ ] Set up SQLite schema (`sessions`, `photos`, `scores`, `review_queue`)
- [ ] Build local inference-only script to generate `refs.npy` + reference angle labels using frozen pretrained OpenCLIP (zero training/fine-tuning)

## Phase 2 — 3-Stage Scoring Pipeline
- [ ] Implement OpenCLIP angle verification & nearest-reference lookup using `numpy` cosine similarity against `refs.npy`
- [ ] Implement swappable `score_photos()` calling Azure OpenAI `gpt-4.1` with photos + matched reference labels + rubric -> pass/fail + reason JSON per checklist item
- [ ] Implement deterministic Python 0–100 `"photo coverage + damage disclosure"` scorer (`0–49` rejected/retake + hard gate cap & upcycling route, `50–84` human review queue, `85–100` auto-approved & logged)

## Phase 3 — FastAPI Endpoints & Frontend (Laptop QR + Phone Capture)
- [ ] Implement `POST /upload`, `GET /status/<id>`, `POST /score` (+ session creation endpoint for laptop QR)
- [ ] Build Laptop view: QR code with session ID, live 2-second polling of `/status/<id>`, results dashboard (`0–100` score, checklist pass/fail + reasons, review queue, upcycling pathway for declined items)
- [ ] Build Phone view: mobile-first guided angle capture (`front`, `left`, `right`, `back`, `inside`, `labels`) with instant angle-match feedback

## Phase 4 — HTTPS Tunnel, Compliance Audit & Demo Prep
- [ ] Expose local FastAPI over HTTPS via ngrok or Cloudflare Tunnel (`cloudflared`) and test live phone camera capture
- [ ] Audit all UI copy, prompts, and JSON outputs for hard rules (`"photo coverage"` & `"damage disclosure"` wording only, zero safety certification claims, zero buy-in offers on crashed/damaged gear, no person identification, no challenge photos sent to external non-scoring tools)
- [ ] Update `TOOLS.md` with exact OpenCLIP checkpoint name and final packages; verify repo is private & `git status` excludes `data/`, `.env`, `refs.npy`, `*.db`, `.docx`, `.xlsx`
