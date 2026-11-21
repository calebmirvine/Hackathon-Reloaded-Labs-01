<!-- # Created by Caleb M. Irvine for use by Moto Reloaded -->

# Hackathon: Reloaded Labs #01 — Moto Reloaded Gear Intake Checker

> **Core Purpose:** A **Gear Intake Checker** for Moto Reloaded's **store intake / buy-in workflow** (not marketplace listings). Guided mobile photo capture verifies that each required angle was shot and flags visible damage for store staff, outputting a **0–100 `"photo coverage + damage disclosure"` score**.
>
> **Core Thesis:** Lead with **rider safety awareness**, **sustainability**, and **circular upcycling** — routing declined or compromised gear into responsible retirement, upcycling, and an in-store safe-gear conversation rather than dead-end rejections, and letting those values naturally drive Moto Reloaded's buy-in, consignment, and new-gear trade-in business.

---

## 1. Non-Negotiable Hard Rules (Participant Agreement)

Every prompt, API response, database field, UI screen, and exported summary **MUST** obey these rules:

1. **Wording & No Safety Claims:** Never claim, imply, or lead anyone to believe that this app or Moto Reloaded assesses, certifies, tests, or guarantees safety or protective performance. **Use the wording `"photo coverage"` and `"damage disclosure"` only** when describing scores, checks, and results.
2. **Never Recommend Buying Compromised Gear (Hard Gate):** Never recommend buying or making an offer on gear that:
   - has been in a crash (declared or evident),
   - is contaminated, or
   - is damaged or repaired in a protective area (Zone 1).
   - Any item triggering this hard gate must be capped into **Rejected (`0–49`)**, clearly declined for buy-in, and routed to the **Upcycling / Responsible Retirement** pathway.
3. **Disclosure-Only Protection Status:** `confirmed` / `reduced` / `unknown` is a documentation/disclosure rule based on labels and rider history — **not** a safety test. Garment fibres cannot be judged from photos. Absence of a CE label in North America tells you nothing; `unknown` on older gear is a normal outcome, not a failure.
4. **Inference-Only & Zero-Training AI Policy:** No training or fine-tuning on the challenge photos. Use pretrained models for **inference only**. Use **no AI service that trains on uploads** (OpenCLIP runs locally frozen; Azure OpenAI API does not train on customer uploads/prompts).
5. **Strict Challenge Photo Isolation:** **Do NOT send challenge photos (`data/`) to coding assistants or any outside tools except the scoring API.**
6. **Privacy / No Person Identification:** **Do NOT try to identify people in the photos.**
7. **Out of Scope:** Marketplace listings, shipping, repairs, **helmets**, and model training/fine-tuning.
8. **Confidentiality & Private Repository:** Keep the git repository **private**. The challenge brief, photo briefing, photograph dataset (`data/`), shot checklist (`.agents/context/*.docx`, `.xlsx`), derived reference embeddings (`refs.npy`), and `.env` are confidential and must remain gitignored (never committed).
9. **Judge Disclosure (`TOOLS.md`):** Maintain [`TOOLS.md`](TOOLS.md) listing all main tools, libraries, and AI models used, for transparent disclosure to the judges.
10. **License & Mandatory File Header Rule:** Work created for this challenge grants Moto Reloaded a non-exclusive, worldwide, permanent, irrevocable, royalty-free license (moral rights waived as far as law allows).
    - **Mandatory header on every file we create:** Include `# Created by Caleb M. Irvine for use by Moto Reloaded` on line 1 using the file's comment syntax:
      - Python / Shell / TOML / YAML / `.gitignore`: `# Created by Caleb M. Irvine for use by Moto Reloaded`
      - JS / TS / CSS: `// Created by Caleb M. Irvine for use by Moto Reloaded`
      - HTML / Markdown: `<!-- # Created by Caleb M. Irvine for use by Moto Reloaded -->`
11. **Compliance Comments (`# REFERENCES (no training):`):** Any code that touches models, embeddings, reference data (`refs.npy`), or challenge photos (`data/`) **MUST** have a `# REFERENCES (no training):` comment block directly above it stating in plain words (with the source cited next to each claim):
    - the model is pretrained and frozen, used for inference only (`model.eval()`, `torch.no_grad()`, no optimizer, no backward pass, no fine-tuning) — [OpenCLIP repo](https://github.com/mlfoundations/open_clip) & [model card](https://huggingface.co/laion/CLIP-ViT-B-32-laion2B-s34B-b79K)
    - embeddings are only stored and compared with cosine similarity, which is a lookup, not training — [OpenCLIP repo](https://github.com/mlfoundations/open_clip) & Participant Agreement v2.0 (*"Don't train or fine-tune a model on the photo set"*)
    - photos sent to the scoring API go to a provider that doesn't train on inputs (Azure OpenAI) — [Azure OpenAI Data, Privacy, and Security](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy)
    - challenge photos are never saved as training data — Participant Agreement v2.0 (*"Don't train or fine-tune a model on the photo set"*)
    - Also keep the short **`## No model training`** section in [`README.md`](README.md) pointing to these `# REFERENCES (no training):` comments.
    - Canonical Python comment template:
      ```python
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
      ```

---

## 2. Guided Flow & Stakeholders

### Stakeholders
- **Mathias & Barbara (Owners):** Prioritize **rider safety**, **sustainability**, and **upcycling** over pushing used gear at any cost — turning retired gear into circular material upcycling (e.g., leather into bags/accessories, zipper salvage, textile recycling) and an **in-store safety & new-gear upgrade conversation**.
- **Alex (Store Clerk):** Needs a fast, consistent intake check for jackets and pants that verifies every photo angle, flags visible damage and label details for in-hand review, and cuts manual busywork.
- **Riders / Sellers:** Need a frictionless mobile camera flow that guides every required angle and clearly explains why an item is auto-logged, queued for human review, or routed to upcycling/retirement.

### End-to-End Intake Flow (Laptop QR -> Phone HTTPS -> Live Poll)
1. **Laptop Starts Session & Shows QR Code:** The desktop/counter screen creates an intake session and displays a **QR code containing the session ID** (pointing to the app's **HTTPS** tunnel URL via **ngrok** or **Cloudflare Tunnel** so phone browsers allow camera access).
2. **Phone Captures Guided Angles:** The phone opens the session URL, selects **Jacket** or **Pants** (plus optional rider disclosure notes), and captures the guided angles:
   - **`front`** — full exterior front, laid flat, zipped
   - **`left`** — left outer side / sleeve or outer thigh
   - **`right`** — right outer side / sleeve or outer thigh
   - **`back`** — full exterior back (upper back / seat)
   - **`inside`** — garment inside-out showing lining, protective layer placement, and pockets
   - **`labels`** — sharp close-up(s) of brand, CE (if present), and material composition tags
   - *(Optional additional defect shots if visible damage is spotted, with coin for scale)*
3. **Live 2-Second Polling:** The laptop **polls `GET /status/<id>` every 2 seconds** to display incoming angles in real time and automatically continues to final scoring once the phone finishes capture.

---

## 3. 3-Stage Scoring Pipeline

1. **Stage 1 — OpenCLIP Angle Verification & Reference Matching (Pretrained, Frozen, Inference Only):**
   - `open_clip_torch` (pretrained, frozen — zero training or fine-tuning) embeds each uploaded photo locally.
   - Cosine similarity in **`numpy`** against precomputed reference embeddings (`refs.npy`, built inference-only) confirms the photo matches the requested angle slot (`front`, `left`, `right`, `back`, `inside`, `labels`) and retrieves the closest reference examples/labels.
   - *ChromaDB is optional — skip it unless needed.*

2. **Stage 2 — Vision Rubric Evaluation inside `score_photos()`:**
   - **Azure OpenAI `gpt-4.1`** (`aoai-motoreloaded-rl01`, `eastus2`) receives the session photos, the OpenCLIP-matched reference labels, and Moto Reloaded's intake rubric (`.agents/context/item-grading-sheet-v2.docx` / `.agents/context/DOMAIN-SPEC.md`).
   - Returns **pass/fail plus a short reason for each checklist item as structured JSON** (covering photo coverage completeness/sharpness, Zone 1 damage/repairs, Zone 2/3 wear, hardware/zippers, lining, label legibility, and photo-vs-disclosure contradictions).
   - **Swappable Provider Boundary:** Keep the AI vision call inside **one single `score_photos()` function** so the provider or model can be swapped cleanly without changing FastAPI routes or deterministic scoring logic.

3. **Stage 3 — Deterministic Python 0–100 Score & Intake Routing:**
   - Pure Python computes the **0–100 `"photo coverage + damage disclosure"` score** from the structured checklist JSON and enforces hard compliance gates (declared/evident crash, contamination, or Zone 1 damage/repair hard-caps the score at **`<= 49`** so compromised gear can never be auto-approved or recommended for buy-in).
   - **Outcome Bands:**
     - **`0–49` — Rejected / Retake:** Prompt retake if required angles are missing, mismatched, or blurry; decline for buy-in and route to **Upcycling / Responsible Retirement & Safe-Gear Trade-In** if crash, contamination, or Zone 1 damage is disclosed or visible.
     - **`50–84` — Human Review:** Queued in SQLite for **Alex / Barbara in-hand physical inspection** with exact pass/fail items and reasons highlighted.
     - **`85–100` — Auto-Approved & Logged:** Logged in SQLite as intake-ready (physical in-hand check still confirmed by staff; optional checklist/grading exports available for Alex).

---

## 4. Tech Stack & API Endpoints

- **Language & Package Manager:** Python 3.11 managed with **`uv`** (`pyproject.toml`).
- **Backend & AI Libraries:** `fastapi` + `uvicorn`, `open_clip_torch` (`open-clip-torch`), `openai` (Azure OpenAI SDK), `pillow`, `python-multipart`, `numpy`, `qrcode`, `python-dotenv` (optional `openpyxl` / `python-docx` for clerk exports).
- **Database:** **SQLite** for sessions, uploaded photo metadata/angle matches, checklist JSON, 0–100 scores, and the human review queue.
- **Frontend:** Plain **HTML/CSS/JS** (default for hackathon speed; React+Vite optional).
- **HTTPS Tunnel for Mobile Camera:** **ngrok** or **Cloudflare Tunnel (`cloudflared`)** exposing the local FastAPI server over HTTPS.
- **Core API Endpoints:**
  - `POST /upload` — accepts session ID, target angle, and image file; runs OpenCLIP inference + `numpy` cosine similarity against `refs.npy`; updates session state in SQLite.
  - `GET /status/<id>` — polled every 2 seconds by the laptop UI for captured angle status, OpenCLIP match feedback, completion state, and final score.
  - `POST /score` — invokes `score_photos()` (Azure OpenAI GPT-4.1), computes the deterministic 0–100 `"photo coverage + damage disclosure"` score and hard-gate routing, and persists results/review queue entries in SQLite.

---

## 5. Project Context & Disclosure Files

- **Judge Tools & Models Disclosure:** `TOOLS.md`
- **Stakeholder & Debrief Notes:** `.agents/Project-Notes.md`
- **Distilled Domain & Rubric Spec:** `.agents/context/DOMAIN-SPEC.md`
- **Build Tracker:** `.agents/PROGRESS.md`
- **Original Challenge Reference Docs (Confidential — Do Not Modify or Commit):**
  - `.agents/context/item-grading-sheet-v2.docx`
  - `.agents/context/photo-briefing-reloaded-labs.docx`
  - `.agents/context/reloaded-labs-shot-checklist.xlsx`
- **Sample Photo Dataset (Confidential — Do Not Commit or Send to Coding Assistants):** `data/` (`RL01-001` through `RL01-019`, 19 items / 282 images)
