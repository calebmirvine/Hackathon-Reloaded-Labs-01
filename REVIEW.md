<!-- # Created by Caleb M. Irvine for use by Moto Reloaded -->

# Milestone 4 Review — Intake ERP Redesign, Flicker Fix & Frontier Agent Traceability

> Post-MVP usability, reliability, and governance review for the **Moto Reloaded Gear Intake Checker** (`"photo coverage + damage disclosure"` store intake workflow).

---

## 1. Root Cause & Fix — 2-Second Desktop Photo Flicker

### Root Cause
- In the initial counter UI (`app/static/laptop.js`), the 2-second polling loop calling `GET /status/{session_id}` rebuilt the entire `angleGrid.innerHTML` (and defect thumbnail strip) on every poll tick.
- Even when no new photo had arrived, replacing `innerHTML` destroyed and recreated every `<img src="/uploads/...">` DOM element every 2 seconds, causing visible thumbnail flashing and layout jitter.
- In addition, polling continued indefinitely even after `session.status === "scored"`, causing unnecessary background requests and repeated DOM churn on completed sessions.

### Fix
- **Persistent Card DOM + Per-Angle Signatures:** The 6 guided angle cards (`front`, `left`, `right`, `back`, `inside`, `labels`) are initialized once in the DOM (keyed by `data-angle`), and `laptop.js` tracks a signature map (`state.angleSignatures`) per angle (`${photo.id}|${photo.filepath}|${photo.angle_ok}|${photo.clip_predicted_angle}|${photo.clip_confidence}`). On each poll, only cards whose signature changed are updated in place — `<img>` elements never unmount or flicker when unchanged. The same signature diffing applies to the optional `defect` strip.
- **Smart Polling Lifecycle:** Polling pauses/stops automatically once `session.status === "scored"`, can be manually triggered via **Poll Now**, and dynamically respects the Admin-configured `poll_interval_ms` (`1500ms`, `2000ms`, `3000ms`, `5000ms`, or `0 = Manual`).

---

## 2. Streamlined Intake ERP Shell & 3-Step Card-Deck Wizard

The initial single-page counter screen packed session creation, QR display, photo grid, disclosure controls, score results, and sample loading into one dense scrolling view. Milestone 4 restructures the interface into a focused **Moto Reloaded · Intake ERP** workspace:

### Workspace Navigation
- **New Intake:** 3-step centered card-deck wizard with Tinder-style stacked-card focal framing and smooth step transitions.
- **Review Queue:** Filterable (`All`, `Pending`, `Approved`, `Upcycle`) CRM review cards for `50–84` sessions with staff inspection notes, Approve / Decline -> Upcycle actions, and direct jump into Card 3 (**Open Audit Card ->**).
- **Intake Ledger:** Structured ERP table of recorded sessions (Session ID, Category, Brand, Score `0–100`, Decision, Updated, `.xlsx` export, and direct **Audit** card access).
- **Admin & Debug:** Live runtime settings, system diagnostics, sample sandbox, and expanded latest frontier agent trace.

### 3-Step Intake Card Deck
1. **Card 1 — Category Selection:** Two large tactile category cards (**Motorcycle Jacket** and **Motorcycle Pants**) showing Zone 1 reference areas; clicking either creates a session (`POST /sessions`) and advances cleanly to Card 2. Local sample loading is tucked into a secondary drawer below the primary choice.
2. **Card 2 — Guided Photo Capture:** Compact `#E6E0D6`-framed mobile QR handoff beside the flicker-free 6-angle deck, collapsible Rider Disclosure strip (`<details>`), manual **Poll Now** control when paused, and **Continue to Audit ->** (with optional auto-advance on mobile completion).
3. **Card 3 — Verification & Audit Dossier:** Centered audit card featuring the `0–100` **`"Photo Coverage + Damage Disclosure Score"`** SVG radial gauge, `/50` component bars, Decision Banner, Hard Gate / Contradiction / Retake alerts, Circular Upcycling & Responsible Retirement card (`0–49`), NA CE-neutral Extracted Labels strip, Pass/Fail Audit Checklist table, **Frontier Agent Output & Prompt Trace** card, inline Staff Review controls, `.xlsx` export, and **Start Next Intake ->**.
4. **Mobile Guided Capture (`phone.html` / `phone.js`):** Matching single-card deck visual polish, stacked shadow depth, clear step progress bar, and instant OpenCLIP angle feedback (`Retake or Keep Anyway`).

---

## 3. Removal of Hardcoded Personal Names

- All hardcoded personal names (`Alex`, `Barbara`, `Mathias`) have been removed from application source code (`app/*.py`, `app/static/*`), Excel export copy (`app/exporter.py`), and API test fixtures (`tests/test_api.py`).
- Replaced with clean, role-based CRM/ERP terminology: **Store Staff**, **Staff Review**, **In-Hand Inspection**, **Intake Ledger**, and **Export Shot Checklist (.xlsx)**.
- Verified continuously by an automated compliance test scanning `app/` for zero case-insensitive matches.

---

## 4. Admin & Debug Panel + Frontier Agent Output & Prompt Trace

### Persistent Runtime Settings (`app_settings` Table)
- Added `app_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)` in `app/db.py` with `DEFAULT_SETTINGS`, `ALLOWED_DEPLOYMENTS = ("gpt-4.1", "gpt-4.1-mini")`, `get_settings()`, and strict server-side validation in `update_settings()`.
- Exposed `GET /admin/settings`, `POST /admin/settings`, and `GET /admin/diagnostics` in `app/main.py` to tune:
  - Frontier vision deployment (`gpt-4.1` or `gpt-4.1-mini`), `temperature` (`0.0–1.0`), `max_tokens` (`300–4096`)
  - Polling cadence (`poll_interval_ms`) and `auto_score_on_complete`
  - Stage-1 OpenCLIP soft-mismatch cutoff (`clip_warn_threshold`)
  - Outcome band cutoffs (`50 <= human_review_min < auto_approve_min <= 100`)
  - Live `public_base_url` override for HTTPS mobile QR handoff without restarting `uvicorn`

### Frontier Agent Output & Prompt Trace (`agent_trace`)
- Stage 2 `score_photos()` (`app/vision_scorer.py`) captures non-secret execution metadata (`agent_label`, `provider`, `deployment`, `model_returned`, `api_version`, `temperature`, `max_tokens`, `latency_ms`, `usage`, `clip_model`, `system_prompt`, `user_prompt`, and `raw_response`).
- `agent_trace` flows through deterministic `compute_score()` (`app/scoring_engine.py`), persists in SQLite `scores.result_json`, surfaces via `db.get_latest_agent_trace()` in `GET /admin/diagnostics`, and renders directly on **Card 3** and the **Admin & Debug** panel with 1-click Copy Prompt and Copy Raw JSON buttons.

---

## 5. Participant Agreement & Security Compliance Verification

- **Wording Discipline:** All scores, UI labels, prompts, exports, and traces use **`"photo coverage"`** and **`"damage disclosure"`** terminology only — never claiming, testing, certifying, or guaranteeing safety or protective performance.
- **Permanently Locked Hard Compliance Gate:** Admin threshold controls enforce `50 <= human_review_min < auto_approve_min <= 100` (`hard_gate_locked: true`). Declared/evident crash, contamination, or Zone 1 damage/repair always caps `total_score <= 49`, sets `decision = "rejected_upcycle"`, sets `buy_in_recommended = False`, and attaches a material-tailored circular upcycling plan.
- **Zero Secret Leakage:** `AZURE_OPENAI_API_KEY` is never accepted or persisted by `app_settings`, never included in `agent_trace`, and never returned by `/admin/settings` or `/admin/diagnostics` (diagnostics expose only `configured: bool` and sanitized `endpoint_host`).
- **Inference-Only & Dataset Isolation:** OpenCLIP (`ViT-B-32` `laion2b_s34b_b79k`) remains frozen inference-only with `# REFERENCES (no training):` blocks preserved across all model/embedding/data-touching code; challenge photos remain isolated in gitignored `data/`.

---

## 6. Round 2 UI & Mobile Camera Refinements (Milestone 5)

- **Brand & Copy Polish (Zero Monogram / Zero "ERP"):** Removed the `.brand-mark` MR monogram logo from desktop and mobile headers (`index.html`, `phone.html`, `styles.css`), replacing it with a clean editorial uppercase **`MOTO RELOADED`** wordmark and **`Gear Intake`** subtitle. Removed all `ERP` terminology across `app/` in favor of clear intake language (`Gear Intake`, `Workspaces`, `Intake Records`, `Runtime Settings`).
- **Desktop Card 1 & Header Refinement:** Replaced negative-`z-index` `::before`/`::after` pseudo-element card stacks on `.deck-card` with crisp layered `box-shadow` depth so Card 1 renders cleanly with zero overlapping edges, paired with a streamlined header bar and balanced Jacket vs. Pants starting cards.
- **Mobile Dedicated Category Card (`#stage-category`) + Live Desktop Sync:** Split mobile `/capture/{id}` into a clean Card 1 garment-selection step (**Motorcycle Jacket** vs. **Motorcycle Pants**) backed by `PATCH /sessions/{session_id}` (`{"garment_type": ...}`) so category selection on mobile immediately updates the counter view, with a compact `← Category` chip to step back at any time.
- **In-Line Photo-ID SVG Viewfinder & Smart Auto-Capture:** Upgraded `#stage-photo` with an in-browser rear camera viewfinder (`getUserMedia` into `#live-camera-video`) overlaid with dynamic angle- and garment-specific SVG silhouettes (`#viewfinder-svg`, including macro label brackets and coin-scale defect reticle). A lightweight downscaled `<canvas>` loop monitors Laplacian sharpness (stricter on `labels`), frame steadiness, and brightness to highlight the frame emerald (`#3ED660`) and auto-snap JPEG uploads to `POST /upload`, paired with an `Auto-Snap: ON/OFF` HUD toggle, tactile manual shutter button, clean media-track teardown on view exit, and automatic fallback to native camera (`#camera-input`) and photo library (`#library-input`) inputs.
- **Shop Goals on a Paper Counter:** The counter and phone now lead with the shop's three goals — rider awareness, materials kept in circulation, and the in-store trade-in conversation — and each scored result names which goal the band serves. The dark stacked-card chrome is a warm paper surface with an ink wordmark. Scores remain `"photo coverage"` and `"damage disclosure"` documentation only.

