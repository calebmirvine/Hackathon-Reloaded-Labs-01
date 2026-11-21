<!-- # Created by Caleb M. Irvine for use by Moto Reloaded -->

# Tools & Models Disclosure — Moto Reloaded (Reloaded Labs #01)

> Disclosure of main AI models, software libraries, and development tools used in the **Moto Reloaded Gear Intake Checker** (`"photo coverage + damage disclosure"` workflow), provided for hackathon judge transparency and participant-agreement compliance.

---

## 1. AI & Machine Learning Models (Inference Only — No Training or Fine-Tuning)

| Component | Model / Provider | How It Is Used | Training / Data Policy Compliance |
|---|---|---|---|
| **Angle Verification & Reference Matching** | **OpenCLIP** (`open_clip_torch`, [repo](https://github.com/mlfoundations/open_clip), [ViT-B-32 `laion2b_s34b_b79k` model card](https://huggingface.co/laion/CLIP-ViT-B-32-laion2B-s34B-b79K)) | Runs locally in **frozen inference mode** (`model.eval()`, `torch.no_grad()`, no optimizer, no backward pass) to embed each garment photo and compare via `numpy` cosine similarity lookup against `refs.npy` to verify shot angle (`front`, `left`, `right`, `back`, `inside`, `labels`) and retrieve closest reference labels. | **Pretrained, frozen, inference only; lookup, not training.** Participant Agreement v2.0 (*"Don't train or fine-tune a model on the photo set"*). |
| **Checklist Vision Evaluation** | **Azure OpenAI `gpt-4.1`** (`2025-04-14`, hosted in `eastus2` on resource `aoai-motoreloaded-rl01`) | Invoked solely inside one isolated `score_photos()` function. Receives uploaded session photos, OpenCLIP-matched reference labels, and Moto Reloaded's rubric to return structured JSON pass/fail + reason per checklist item. | **Zero-training API.** Azure OpenAI does not use customer prompts or uploads to train foundation models ([Azure OpenAI Data, Privacy, and Security](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy)). Challenge photos are never saved as training data (Participant Agreement v2.0). |

*(Note: A secondary `gpt-4.1-mini` (`2025-04-14`) deployment was provisioned on the same Azure OpenAI resource during setup; update or remove this note based on final `score_photos()` usage.)*

---

## 2. Application Stack & Python Libraries

- **Runtime & Package Management:** Python 3.11 + **`uv`** (`pyproject.toml`)
- **Web Server & API:** **`fastapi`** + **`uvicorn`** (serves `/upload`, `/status/<id>`, `/score`, and frontend assets)
- **Image & Vector Math:** **`open-clip-torch`**, **`numpy`**, **`pillow`** (`PIL`), **`python-multipart`**
- **Vision API Client:** **`openai`** Python SDK (`AzureOpenAI` client isolated in `score_photos()`)
- **Database:** **SQLite** (Python standard library `sqlite3`) for intake sessions, photo records, checklist JSON, 0–100 scores, and the human review queue
- **Frontend:** Plain **HTML / CSS / JavaScript** (mobile-first guided camera UI + desktop QR polling view)
- **Utilities:** **`qrcode`** (laptop session QR generation), **`python-dotenv`** (environment config)
- **HTTPS Tunnel (Mobile Camera Access):** **ngrok** or **Cloudflare Tunnel (`cloudflared`)** to serve the local app over HTTPS on phones

---

## 3. Cloud & Development Tooling

- **Azure CLI (`az`):** Used to provision the `rg-motoreloaded` resource group and `aoai-motoreloaded-rl01` Azure OpenAI resource in `eastus2`.
- **Git (Private Repository):** Version control with `.gitignore` excluding `data/`, `.env`, `refs.npy`, local SQLite databases, `uploads/`, and confidential `.docx`/`.xlsx` files.
- **AI Coding Assistant:** Used strictly for software architecture, code authoring, and documentation cleanup. **No challenge photos (`data/`) are sent to coding assistants.**

---

## 4. Participant Agreement Guardrails Reflected in Tooling

- **Wording:** All outputs report **`"photo coverage"`** and **`"damage disclosure"`** only — never safety claims, certifications, or protective performance guarantees.
- **No Buy-In Offers on Compromised Gear:** Deterministic Python logic caps crashed, contaminated, or Zone-1-damaged/repaired gear at `<= 49` (Rejected / Upcycling pathway).
- **No Person Identification:** Prompts and pipeline do not identify or profile people in any photo.
- **Maintenance Note:** Update this file whenever a model, OpenCLIP checkpoint, or major package is added or changed during the build.
