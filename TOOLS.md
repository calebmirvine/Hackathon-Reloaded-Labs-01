<!-- # Created by Caleb M. Irvine for use by Moto Reloaded -->

# Tools & Models Disclosure — Moto Reloaded (Reloaded Labs #01)

> Disclosure of main AI models, software libraries, and development tools used in the **Moto Reloaded Gear Intake Checker** (`"photo coverage + damage disclosure"` workflow), provided for hackathon judge transparency and participant-agreement compliance.

---

## 1. AI & Machine Learning Models (Inference Only — No Training or Fine-Tuning)

| Component | Model / Provider | How It Is Used | Training / Data Policy Compliance |
|---|---|---|---|
| **Angle Verification & Reference Matching** | **OpenCLIP** (`open-clip-torch==4.2.2`, `torch==2.15.0`, `torchvision==0.29.2`; [repo](https://github.com/mlfoundations/open_clip), [ViT-B-32 `laion2b_s34b_b79k` model card](https://huggingface.co/laion/CLIP-ViT-B-32-laion2B-s34B-b79K)) | Runs locally on Apple `mps` (or `cpu` fallback) in **frozen inference mode** (`model.eval()`, `torch.no_grad()`, no optimizer, no backward pass). `scripts/build_refs.py` embeds 263 local garment photos (excluding 19 separator cards) into gitignored `refs.npy` (`(263, 512) float32`) + `refs_meta.json`. `app/clip_matcher.py` performs `numpy` cosine similarity lookup to verify shot angle (`front`, `left`, `right`, `back`, `inside`, `labels`, `defect`) and retrieve nearest reference labels (with zero-shot text fallback if `refs.npy` is absent). | **Pretrained, frozen, inference only; lookup, not training.** Participant Agreement v2.0 (*"Don't train or fine-tune a model on the photo set"*). |
| **Checklist Vision Evaluation** | **Azure OpenAI `gpt-4.1`** (`2025-04-14`, hosted in `eastus2` on resource `aoai-motoreloaded-rl01`) | Invoked solely inside one isolated `score_photos()` function (`app/vision_scorer.py`). Receives Pillow-resized session photos (`1024px` max edge for exterior/inside, `1536px` for `labels`/`defect`), OpenCLIP-matched reference labels, and Moto Reloaded's rubric to return structured JSON pass/fail + reason per checklist item. | **Zero-training API.** Azure OpenAI does not use customer prompts or uploads to train foundation models ([Azure OpenAI Data, Privacy, and Security](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy)). Challenge photos are never saved as training data (Participant Agreement v2.0). |

*(Note: A secondary `gpt-4.1-mini` (`2025-04-14`) deployment is provisioned on the same zero-training Azure OpenAI resource (`aoai-motoreloaded-rl01`, `eastus2`); `score_photos()` defaults to `gpt-4.1` via `AZURE_OPENAI_VISION_DEPLOYMENT` and allows optional runtime switching between `gpt-4.1` and `gpt-4.1-mini` in the Admin & Debug panel.)*

---

## 2. Application Stack & Python Libraries

- **Runtime & Package Management:** Python `3.11.15` + **`uv`** (`pyproject.toml`, `uv.lock`)
- **Web Server & API:** **`fastapi==0.165.0`** + **`uvicorn==0.54.0`** (`uvicorn[standard]`), **`pydantic==2.14.4`**, **`python-multipart==0.0.34`** (serves `/`, `/capture/{id}`, `/sessions`, `/upload`, `/status/{id}`, `/score`, `/review-queue`, `/export/{id}.xlsx`, `/demo/*`, `/admin/settings`, `/admin/diagnostics`)
- **Image & Vector Math:** **`open-clip-torch==4.2.2`**, **`torch==2.15.0`**, **`torchvision==0.29.2`**, **`numpy==2.4.6`**, **`pillow==13.0.0`** (`PIL`)
- **Vision API Client:** **`openai==3.57.0`** Python SDK (`AzureOpenAI` client isolated in `app/vision_scorer.py:score_photos()`, capturing non-secret `agent_trace` metadata for auditability)
- **Database:** **SQLite** (Python standard library `sqlite3` in `app/db.py`) for `sessions`, `photos`, `scores`, `review_queue`, and `app_settings`
- **Frontend:** Plain **HTML / CSS / JavaScript** (`app/static/{index.html,laptop.js,phone.html,phone.js,styles.css}`) with Google Font `Instrument Sans` — mobile-first guided camera capture + desktop counter QR polling dashboard
- **Utilities & Clerk Exports:** **`qrcode==8.2`** (base64 PNG session QR generation), **`openpyxl==3.1.5`** (28-column Shot Checklist + Intake Report `.xlsx` export in `app/exporter.py`), **`python-dotenv==1.2.4`** (environment config)
- **Automated Testing (dev dependencies):** **`pytest==9.2.0`**, **`httpx==0.28.1`** (`tests/test_scoring_engine.py`, `tests/test_api.py`)
- **HTTPS Tunnel (Mobile Camera Access):** **ngrok** or **Cloudflare Tunnel (`cloudflared`)** to serve the local FastAPI server over HTTPS on phones

---

## 3. Cloud & Development Tooling

- **Azure CLI (`az`) & Azure Container Apps:** Used to provision `rg-motoreloaded`, `aoai-motoreloaded-rl01` (Azure OpenAI), and the scale-to-zero `ca-motoreloaded-intake` Consumption container app in `eastus2` (running CPU-only PyTorch with pre-downloaded frozen OpenCLIP weights, ephemeral `/tmp/moto-runtime/` storage, `gpt-4.1-mini` default live deployment, and Demo Mode / passcode credit guardrails).
- **Docker & GitHub Container Registry (`ghcr.io`):** Multi-step `Dockerfile` + strict `.dockerignore` (excluding `data/`, `refs.npy`, `refs_meta.json`, `.env`, `.agents/`, `*.db`, and `uploads/`) built via Docker Desktop and GitHub Actions.
- **GitHub Actions, GitHub CLI (`gh`), & GitHub Pages:** Automated offline `pytest` + confidentiality checks, container image publishing, Azure Container App rollouts (`.github/workflows/deploy-azure-container-app.yml`), and static portfolio showcase hosting (`docs/index.html` via `.github/workflows/deploy-pages.yml`).
- **Git (Private Repository):** Version control with `.gitignore` excluding `data/`, `.env`, `refs.npy`, `refs_meta.json`, `*.npy`, local SQLite databases (`*.db`), `uploads/`, `exports/`, and confidential `.docx`/`.xlsx` files.
- **AI Coding Assistant:** Used strictly for software architecture, code authoring, automated testing, and documentation cleanup. **No challenge photos (`data/`) are sent to coding assistants.**

---

## 4. Participant Agreement Guardrails Reflected in Tooling

- **Wording:** All outputs report **`"photo coverage"`** and **`"damage disclosure"`** only — never safety claims, certifications, or protective performance guarantees.
- **No Buy-In Offers on Compromised Gear:** Deterministic Python logic (`app/scoring_engine.py`) hard-caps crashed, contaminated, or Zone-1-damaged/repaired gear at `<= 49` (`rejected_upcycle`, `buy_in_recommended=False`) and routes to circular upcycling / responsible retirement.
- **North America CE-Label Neutrality:** Absence of a CE label (`ce_label == "none"`) causes zero score penalty and is treated as a normal disclosure outcome.
- **No Person Identification:** Prompts and pipeline do not identify or profile people in any photo.
- **No-Training Compliance Comments:** Every module touching models, embeddings, `refs.npy`, or `data/` carries a `# REFERENCES (no training):` comment block directly above it (searchable via `git grep "REFERENCES (no training):"`).
- **Maintenance Note:** Update this file whenever a model, OpenCLIP checkpoint, or major package is added or changed during the build.
