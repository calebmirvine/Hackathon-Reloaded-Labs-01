<!-- # Created by Caleb M. Irvine for use by Moto Reloaded -->

# Moto Reloaded — Distilled Domain Specification

> Machine-readable summary of `.agents/context/item-grading-sheet-v2.docx`, `.agents/context/photo-briefing-reloaded-labs.docx`, `.agents/context/reloaded-labs-shot-checklist.xlsx`, and the `data/` dataset audit. Do not modify the original `.docx`/`.xlsx` files.

---

## 1. Photo Shot List & Naming Convention

**Target naming format:** `{item_id}_{code}.jpg` (lowercase, hyphens, no spaces, flat folder). Example: `RL01-003_lining-2.jpg`.
- **Standard full set:** 19 shots (4 exterior + 5 Zone 1 + 3 labels + 1 full lining + 5 lining close-ups + 1 pockets) + `defect-1..N` (20–25 typical).
- **Pre-shoot rules:** Physical grading happens *before* photos; impact protectors are removed (out of frame); ID card shot (`RL01-XXX.jpg`) is only a folder separator, NOT an inspection photo.
- **Scale & Sharpness:** Place a **coin** next to every defect ("larger than a coin" questionnaire check). A blurred label photo counts as a **missing label photo**.

| Group | Shot Code | Capture Instructions | Must Show |
|---|---|---|---|
| Exterior | `front` | Laid flat, front up, zipped, ~80% frame | Whole front, fading, Zone 1 & 2 wear |
| Exterior | `back` | Turned over, laid flat | Whole back, upper back / seat |
| Exterior | `left` | Folded/turned to show left side & sleeve/leg | Outer arm / outer thigh |
| Exterior | `right` | Folded/turned to show right side & sleeve/leg | Outer arm / outer thigh |
| Zone 1 | `z1-1` … `z1-5` | Close-up per impact zone; coin if defect visible | Scuffing, abrasion, repairs, seam condition |
| Labels | `label-brand` | Straight on, filling frame, sharp | Brand, size, model, country of origin |
| Labels | `label-ce` | Straight on, every line legible | EN 17092 class (`A`/`AA`/`AAA`), year, pictogram |
| Labels | `label-comp` | Straight on (2 photos if wrapped across folds) | Fibre content — every percentage line |
| Lining | `lining` | Fully inside out, laid flat, front up | Protective layer placement (full vs. panels) |
| Lining | `lining-1` … `lining-5` | Zone 1 areas from the inside | Protective layer condition: pilling, thinning, holes |
| Pockets | `pockets` | Inside out showing protector pockets (+2nd if label printed) | Pockets present, condition, protector date if printed |
| Defects | `defect-1`, `defect-2`… | Close-up with **coin for scale**, one defect per shot | Evidence supporting condition class / safety gate |

### Zone 1 Mapping (Garment-Specific)

| Code | Jacket | Pants |
|---|---|---|
| `z1-1` / `lining-1` | Left shoulder | Left hip & outer thigh |
| `z1-2` / `lining-2` | Right shoulder | Right hip & outer thigh |
| `z1-3` / `lining-3` | Left elbow & forearm | Left knee |
| `z1-4` / `lining-4` | Right elbow & forearm | Right knee |
| `z1-5` / `lining-5` | Upper back | Seat *(Note: normal sitting sheen with no fibre damage = Zone 2 wear, NOT a Zone 1 scuff)* |

### Guided Mobile Capture Angles (6 Core Slots -> Full Spec Mapping)
The mobile intake flow guides the user through 6 core capture angles mapped directly onto the full shot spec above:

| Guided Mobile Angle | Maps To Spec Shot Codes | What It Captures |
|---|---|---|
| `front` | `front` | Whole exterior front, fading, front Zone 1 & 2 wear |
| `left` | `left` (+ left-side Zone 1 view) | Outer left arm / outer left thigh & left Zone 1 areas |
| `right` | `right` (+ right-side Zone 1 view) | Outer right arm / outer right thigh & right Zone 1 areas |
| `back` | `back` (+ upper back / seat view) | Whole exterior back, upper back / seat Zone 1 area |
| `inside` | `lining`, `lining-1..5`, `pockets` | Garment inside-out showing protective layer placement, lining condition & pockets |
| `labels` | `label-brand`, `label-ce`, `label-comp` | Sharp close-ups of brand, EN 17092 CE label (if present), and fibre composition |

*(Optional extra close-up defect shots may be captured if visible damage is spotted, with a coin for scale.)*

---

## 2. Item Grading Sheet Schema (`item-grading-sheet-v2.docx`)

### A. Identification
- `item_id`, `date`
- `category`: `jacket` | `pants`
- `brand`, `size`, `model` (if known), `country_of_origin`
- `ce_label`: `none` | `A` | `AA` | `AAA` | `illegible` *(Not required in North America — absence tells you nothing.)*

### B. Acceptance & Hard Safety Gate
- `arrives_clean_washed`: `yes` | `no` *(If `no` -> not accepted until cleaned)*
- **Safety Gate Flags (ANY checked -> `accepted = no`, NEVER recommend resale offer):**
  - `crash_declared_or_evident`
  - `contamination`
  - `breach_in_zone_1`
  - `repair_in_zone_1`
- `accepted`: `yes` | `no`

### C. Condition — Zone 1 (Per Area 1–5)
Each of the 5 areas gets:
- `status`: `none` | `scuff` | `breach_or_repair`
- `note`: free text

### D. Condition — Everything Else (*Worst finding sets the class*)
| Dimension | Grade A (Best) | Grade B | Grade C (Human Review) | Grade D (Defective) |
|---|---|---|---|---|
| **Zone 2/3 wear** | `none` | `minor scuffs / pilling` | `visible wear, minor stains` | `extensive` |
| **Fading** | `none` | `slight, even` | `uneven / panel-level` | `heavy / patchy` |
| **Hardware** | `all functional` | `all functional` | `minor repairable fault` | `non-repairable failure` |
| **Repairs** | `none` | `sound, Zone 2/3 only` | `sound, Zone 2/3 only` | `unsound` *(Zone 1 repair triggers Safety Gate)* |
| **Lining** | `intact, clean` | `intact, light use` | `minor wear / marks` | `torn / heavily worn` |
| **Labels** | `present, legible` | `present` | `partially legible` | `missing` |

- **Features checklist:** `removable thermal liner`, `membrane / waterproof`, `waterproof zips`, `hood`, `removable hood`, `vents`, `other`
- **Features working:** `all` | `some missing / faulty` (+ details)
- **Output:** `condition_class`: `A` | `B` | `C` | `D`

### E. Protection Disclosure (NOT a Safety Test)
- **Protective material (composition label):** `UHMWPE` | `para-aramid` | `polyamide` | `polyester` | `leather` | `cotton only` | `not determinable` (+ `blend` text)
- **Placement:** `full lining` | `panels at Zone 1` | `none` | `not determinable`
- **Layer condition:** `intact` | `worn` | `not visible`
- *(Older garments where neither material nor placement can be established -> tick `not determinable` -> status is `unknown`. This is a normal result, not a failure.)*

### F. Declared Rider History & Contradiction Check
- `year_purchased` (int / unknown)
- `crash`: `no` | `yes`
- `seasons_ridden`: `0-1` | `2-5` | `6+`
- `protectors`: `yes` | `no` | `never`
- `washing`: `never / hand-wash` | `a few machine washes` | `regular machine washing` | `professional cleaning`
- `storage`: `indoors, dark` | `indoors, daylight` | `outdoors / on the bike`
- `exposure_band`: `light` | `moderate` | `heavy`
- **Critical Judge Test Signal:** `contradicts_photos`: `no` | `yes` *(Sample set intentionally includes cases where declared answers contradict photo evidence!)*
- **Output:** `protection_status`: `confirmed` | `reduced` | `unknown`

---

## 3. Shot Checklist Export Columns (`reloaded-labs-shot-checklist.xlsx`)
Exact column order (Row 5 headers):
`Item ID` | `Jacket / Pants` | `Brand / description` | `Set` (`kickoff`/`held-back`/`ref-B`/`ref-C`) | `Complete?` (`yes`/`no`) | `front` | `back` | `left` | `right` | `z1-1` | `z1-2` | `z1-3` | `z1-4` | `z1-5` | `brand` | `ce` | `comp` | `lining` | `lin-1` | `lin-2` | `lin-3` | `lin-4` | `lin-5` | `pockets` | `# defects` | `Files renamed` | `Sheet filled` | `Notes (skipped shots, retakes)`

---

## 4. Dataset Audit (`data/` as of Nov 21)
- **Items present:** `RL01-001` through `RL01-019` (**19 items, 282 `.jpg` files**).
- **Important dataset quirks to handle in batch upload / demo ingestion:**
  1. **Separator cards exist:** Every folder has `RL01-XXX.jpg` showing the printed ID card on the wooden table — automatically detect and exclude this frame from garment grading!
  2. **Messy real-world filenames:** Actual files do *not* follow `{item_id}_{code}.jpg` cleanly — e.g. `1-Front.jpg`, `5-z1 1L&3L.jpg`, `6-z1-2&4.jpg`, `16- lining sides.jpg`, `17-lining 1,2,3,4.jpg`, `20-defect #2.jpg`, `11-label info.jpg`. Our parser must normalize/map combined zone shots (like `z1-1&3` covering both `z1-1` and `z1-3`) and handle inconsistent spacing/casing!
  3. **Incomplete sets are intentional:** Some items omit certain shots (matching `Complete? = no` in the briefing). The app should report missing shots cleanly rather than crashing.
  4. **No Ground-Truth Sheet Provided:** The 19 image folders (`RL01-001`–`RL01-019`) + business process docs (`item-grading-sheet-v2.docx`, `photo-briefing-reloaded-labs.docx`, `reloaded-labs-shot-checklist.xlsx`) are the complete input. Reference embeddings (`refs.npy`) are generated via **frozen pretrained OpenCLIP inference only** (zero training or fine-tuning) to verify shot angles and match closest reference labels via `numpy` cosine similarity; rubric pass/fail checklist evaluation is then performed by Azure OpenAI `gpt-4.1` inside `score_photos()`, followed by deterministic Python 0–100 `"photo coverage + damage disclosure"` scoring.
  5. **Strict Data & Privacy Rules:** **Never send `data/` images to coding assistants or any outside tool except the scoring API.** Never attempt to identify people in any photo. Always use `"photo coverage"` and `"damage disclosure"` wording rather than safety/certification claims.
