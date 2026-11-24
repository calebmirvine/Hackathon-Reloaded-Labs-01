# Created by Caleb M. Irvine for use by Moto Reloaded
"""Stage 2: Swappable vision rubric evaluation inside a single `score_photos()` boundary.

Sends resized intake photos, OpenCLIP reference matches, optional rider disclosure,
and Moto Reloaded's photo-coverage & damage-disclosure rubric to Azure OpenAI
(`gpt-4.1`), returning structured JSON pass/fail checklist items.
"""

from __future__ import annotations

import base64
import io
import json
import os
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from dotenv import load_dotenv
from openai import AzureOpenAI
from PIL import Image, ImageOps

load_dotenv()

_VALID_CATEGORIES = {"photo_coverage", "damage_disclosure"}
_VALID_SEVERITIES = {"none", "minor", "major", "hard_gate"}
_VALID_MATERIAL_GROUPS = {"leather", "textile", "denim_aramid", "unknown"}
_VALID_CE_LABELS = {"none", "A", "AA", "AAA", "B", "C", "illegible"}
_VALID_RIDING_GEAR = {"yes", "no", "uncertain"}
_VALID_PROTECTOR = {"intact", "failed", "missing", "not_required", "unknown"}
_VALID_STAIN = {"none", "cosmetic", "contamination"}

_SYSTEM_PROMPT = """\
You are Moto Reloaded's store intake photo-coverage and damage-disclosure assistant for motorcycle jackets and pants ONLY (never helmets).

NON-NEGOTIABLE COMPLIANCE RULES:
1. WORDING ONLY: Use "photo coverage" and "damage disclosure" wording ONLY. NEVER claim, imply, or state that this tool or Moto Reloaded assesses, certifies, tests, or guarantees safety or protective performance.
2. PRIVACY: NEVER identify, name, or describe any person or face if inadvertently visible in a photo.
3. FIBRES & DISCLOSURE LIMIT: Garment fibres cannot be judged visually from photos alone; report composition ONLY from legible label photos, otherwise return "not determinable".
4. NORTH AMERICA CE-LABEL NEUTRALITY: EN 17092 CE labels (A, AA, AAA, B, C) are European and NOT required in North America. Absence of a CE label ("none") tells you NOTHING and MUST NEVER fail a checklist item, fail a protector check, or be treated as a defect. However, if a label photo is blurry or out-of-focus so text cannot be read, treat that blurred label photo as a missing/illegible label photo ("photo_coverage" failure). When a label is readable, record the printed class only. EN 17092-2 is AAA, -3 is AA, -4 is A, -5 is B, -6 is C. Never invent a class. Never report kilometres per hour as if this intake measured them. Never treat a condition grade as a CE class.
5. HARD GATE DETECTION (NEVER RECOMMEND BUYING COMPROMISED GEAR):
   - crash_evident: Visible slide marks, road rash, melted/abraded impact zones, or crash damage.
   - contamination_evident: Visible heavy oil, fuel, chemical, mold, or unsanitary biological contamination. A light cosmetic stain is NOT contamination_evident.
   - zone1_breach_or_repair: ANY visible tear, hole, split seam, through-abrasion, patch, or repair inside a Zone 1 area. A broken protector with an intact shell is a protector failure, not a shell breach, unless the shell is also torn.
6. GARMENT-SPECIFIC ZONE 1 MAPPING:
   - JACKET Zone 1: (1) Left shoulder, (2) Right shoulder, (3) Left elbow & forearm, (4) Right elbow & forearm, (5) Upper back.
   - PANTS Zone 1: (1) Left hip & outer thigh, (2) Right hip & outer thigh, (3) Left knee, (4) Right knee, (5) Seat.
   - CRITICAL PANTS EXCEPTION: Normal sitting sheen/gloss on the seat of motorcycle pants with NO fibre wear or damage is Zone 2 wear, NOT a Zone 1 scuff or breach.
7. DETAIL PRIORITIES: Inspect stitching, yarn integrity, seams, zippers/snaps/hardware, interior lining/protective-layer placement, fading, Zone 2/3 wear, and damage close-ups if provided.
8. CONTRADICTION CHECK: Compare the rider's declared disclosure (crash history, usage level, notes) against what is visible in the photos. Set contradiction_flagged=true with a concise contradiction_reason if the photos clearly contradict the rider's disclosure (for example, rider declared no crash or light use while photos show crash abrasion, heavy fading/wear, or Zone 1 repair).
9. RIDING GEAR: Set riding_gear to "yes". Do not classify work pants, fashion pants, or street clothes. This field does not change the score.
10. PROTECTORS, separate from a fabric tear:
   - failed: a pad is visibly broken, cracked, displaced, or the pocket is torn open. This is failed even when no CE label is readable.
   - missing: a required pocket is empty AND a readable class is AAA, AA, or A.
   - not_required: readable class B (sold without impact protectors). Class B with no armour is not a failure. Also use not_required for class C only when no protector is expected in the photos and nothing is broken.
   - unknown: no CE label, or armour simply is not proven in the photo. Do not call unseen armour "failed" or "missing".
   - intact: protectors are visible and look whole.
11. STAINS: stain_kind "contamination" together with contamination_evident true only for a heavy oil, fuel, or chemical soak. A light cosmetic mark is stain_kind "cosmetic" and MUST NOT set contamination_evident. No stain is "none".
12. CLOSE-UP: If one localized mark, tear, broken pad, or stain is visible and no damage close-up is in the set, set closeup_needed to a short place name such as "left shoulder pad" or "right thigh oil soak". Otherwise null. Do not ask for every checklist frame. Do not ask for a coin.

Return ONLY a valid JSON object with this exact schema:
{
  "checklist": [
    {
      "key": "exterior_angles_complete",
      "category": "photo_coverage",
      "label": "Exterior Angles Coverage",
      "passed": true,
      "severity": "none",
      "reason": "Short factual observation."
    },
    {
      "key": "inside_lining_visible",
      "category": "photo_coverage",
      "label": "Inside Lining & Pockets Coverage",
      "passed": true,
      "severity": "none",
      "reason": "Short factual observation."
    },
    {
      "key": "labels_sharp_legible",
      "category": "photo_coverage",
      "label": "Label Close-Up Sharpness & Legibility",
      "passed": true,
      "severity": "none",
      "reason": "Short factual observation (do not fail for absent NA CE label; fail if label photo is blurry or missing)."
    },
    {
      "key": "photo_sharpness_framing",
      "category": "photo_coverage",
      "label": "Photo Sharpness & Framing",
      "passed": true,
      "severity": "none",
      "reason": "Short factual observation."
    },
    {
      "key": "zone1_areas_visible",
      "category": "photo_coverage",
      "label": "Zone 1 Areas Visible",
      "passed": true,
      "severity": "none",
      "reason": "Short factual observation referencing garment-specific Zone 1 areas."
    },
    {
      "key": "no_crash_evidence",
      "category": "damage_disclosure",
      "label": "No Visible Crash / Slide Damage",
      "passed": true,
      "severity": "none",
      "reason": "Short factual observation. Use severity='hard_gate' if failed."
    },
    {
      "key": "no_contamination",
      "category": "damage_disclosure",
      "label": "No Visible Contamination",
      "passed": true,
      "severity": "none",
      "reason": "Short factual observation. Use severity='hard_gate' if failed."
    },
    {
      "key": "zone1_integrity",
      "category": "damage_disclosure",
      "label": "Zone 1 Integrity (No Breach or Repair)",
      "passed": true,
      "severity": "none",
      "reason": "Short factual observation. Use severity='hard_gate' for Zone 1 breach/repair; 'minor' for light surface scuff only; remember pants seat sitting sheen with no fibre wear is Zone 2, not Zone 1."
    },
    {
      "key": "stitching_seams_intact",
      "category": "damage_disclosure",
      "label": "Stitching, Yarn & Seam Integrity",
      "passed": true,
      "severity": "none",
      "reason": "Short factual observation."
    },
    {
      "key": "hardware_zippers_condition",
      "category": "damage_disclosure",
      "label": "Zippers, Snaps & Hardware Condition",
      "passed": true,
      "severity": "none",
      "reason": "Short factual observation."
    },
    {
      "key": "lining_interior_condition",
      "category": "damage_disclosure",
      "label": "Lining & Interior Condition",
      "passed": true,
      "severity": "none",
      "reason": "Short factual observation."
    },
    {
      "key": "zone2_3_wear_fading",
      "category": "damage_disclosure",
      "label": "Zone 2/3 Wear & Fading",
      "passed": true,
      "severity": "none",
      "reason": "Short factual observation."
    }
  ],
  "extracted_labels": {
    "brand": "Brand name or 'Unknown'",
    "size": "Size or 'Unknown'",
    "ce_label": "none | A | AA | AAA | B | C | illegible",
    "composition": "Exact legible fibre percentages or 'not determinable'",
    "material_group": "leather | textile | denim_aramid | unknown"
  },
  "hard_gate_flags": {
    "crash_evident": false,
    "contamination_evident": false,
    "zone1_breach_or_repair": false
  },
  "riding_gear": "yes | no | uncertain",
  "protector_status": "intact | failed | missing | not_required | unknown",
  "stain_kind": "none | cosmetic | contamination",
  "closeup_needed": null,
  "contradiction_flagged": false,
  "contradiction_reason": null,
  "summary": "2-sentence factual summary of photo coverage and visible damage disclosure for store staff."
}

Severity values MUST be one of: "none", "minor", "major", "hard_gate".
When passed=true, severity MUST be "none".
"""


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
def _encode_image_for_vision(image_path: str, angle: str) -> str:
    """Resize an intake photo via Pillow and encode it as a base64 JPEG data URL."""
    max_edge = 1536 if angle in {"labels", "defect"} else 1024
    jpeg_quality = 88 if angle in {"labels", "defect"} else 85

    with Image.open(image_path) as img:
        rgb = ImageOps.exif_transpose(img).convert("RGB")
        rgb.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        rgb.save(buf, format="JPEG", quality=jpeg_quality, optimize=True)
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{b64}"


def _parse_matched_refs(raw_refs: Any) -> list[dict[str, Any]]:
    if isinstance(raw_refs, str):
        try:
            parsed = json.loads(raw_refs)
            return parsed if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return []
    if isinstance(raw_refs, list):
        return [r for r in raw_refs if isinstance(r, dict)]
    return []


def _normalize_vision_response(raw: dict[str, Any]) -> dict[str, Any]:
    """Validate and normalize structured JSON returned by the vision model."""
    checklist: list[dict[str, Any]] = []
    for item in raw.get("checklist") or []:
        if not isinstance(item, dict):
            continue
        category = str(item.get("category", "damage_disclosure")).strip().lower()
        if category not in _VALID_CATEGORIES:
            category = "damage_disclosure"
        passed = bool(item.get("passed", False))
        severity = str(item.get("severity", "none")).strip().lower()
        if severity not in _VALID_SEVERITIES:
            severity = "none" if passed else "minor"
        if passed:
            severity = "none"
        elif severity == "none":
            severity = "minor"

        checklist.append(
            {
                "key": str(item.get("key", f"item_{len(checklist) + 1}")).strip(),
                "category": category,
                "label": str(item.get("label", "Checklist Item")).strip(),
                "passed": passed,
                "severity": severity,
                "reason": str(item.get("reason", "")).strip() or "Observed during photo review.",
            }
        )

    raw_labels = raw.get("extracted_labels") if isinstance(raw.get("extracted_labels"), dict) else {}
    ce_val = str(raw_labels.get("ce_label", "none") or "none").strip()
    if ce_val.upper() in {"A", "AA", "AAA", "B", "C"}:
        ce_val = ce_val.upper()
    elif ce_val.lower() in {"none", "illegible"}:
        ce_val = ce_val.lower()
    else:
        ce_val = "none"

    mat_group = str(raw_labels.get("material_group", "unknown") or "unknown").strip().lower()
    if mat_group not in _VALID_MATERIAL_GROUPS:
        if "leather" in mat_group:
            mat_group = "leather"
        elif "denim" in mat_group or "aramid" in mat_group or "kevlar" in mat_group:
            mat_group = "denim_aramid"
        elif "textile" in mat_group or "poly" in mat_group or "nylon" in mat_group or "cordura" in mat_group:
            mat_group = "textile"
        else:
            mat_group = "unknown"

    extracted_labels = {
        "brand": str(raw_labels.get("brand") or "Unknown").strip(),
        "size": str(raw_labels.get("size") or "Unknown").strip(),
        "ce_label": ce_val,
        "composition": str(raw_labels.get("composition") or "not determinable").strip(),
        "material_group": mat_group,
    }

    raw_flags = raw.get("hard_gate_flags") if isinstance(raw.get("hard_gate_flags"), dict) else {}
    hard_gate_flags = {
        "crash_evident": bool(raw_flags.get("crash_evident", False)),
        "contamination_evident": bool(raw_flags.get("contamination_evident", False)),
        "zone1_breach_or_repair": bool(raw_flags.get("zone1_breach_or_repair", False)),
    }

    riding_raw = str(raw.get("riding_gear") or "").strip().lower()
    riding_gear = riding_raw if riding_raw in _VALID_RIDING_GEAR else "yes"

    protector_raw = str(raw.get("protector_status") or "").strip().lower()
    protector_status = protector_raw if protector_raw in _VALID_PROTECTOR else "unknown"

    stain_raw = str(raw.get("stain_kind") or "").strip().lower()
    stain_kind = stain_raw if stain_raw in _VALID_STAIN else "none"
    if stain_kind == "contamination":
        hard_gate_flags["contamination_evident"] = True
    elif stain_kind == "cosmetic":
        hard_gate_flags["contamination_evident"] = False

    closeup_raw = raw.get("closeup_needed")
    closeup_needed: str | None
    if closeup_raw is None:
        closeup_needed = None
    else:
        closeup_text = str(closeup_raw).strip()
        closeup_needed = None if closeup_text.lower() in {"", "null", "none", "false"} else closeup_text[:160]

    contradiction_flagged = bool(raw.get("contradiction_flagged", False))
    raw_reason = raw.get("contradiction_reason")
    contradiction_reason = (
        str(raw_reason).strip() if contradiction_flagged and raw_reason else None
    )

    summary = str(raw.get("summary") or "").strip()
    if not summary:
        summary = "Photo coverage and visible damage disclosure review completed for store staff inspection."

    return {
        "checklist": checklist,
        "extracted_labels": extracted_labels,
        "hard_gate_flags": hard_gate_flags,
        "riding_gear": riding_gear,
        "protector_status": protector_status,
        "stain_kind": stain_kind,
        "closeup_needed": closeup_needed,
        "contradiction_flagged": contradiction_flagged,
        "contradiction_reason": contradiction_reason,
        "summary": summary,
    }


def _empty_photos_fallback(
    garment_type: str,
    *,
    deployment: str = "gpt-4.1",
    api_version: str = "2024-12-01-preview",
    endpoint_host: str | None = None,
    temperature: float = 0.1,
    max_tokens: int = 1800,
    user_prompt_summary: str = "",
) -> dict[str, Any]:
    """Return a clean structured response when no readable photos were supplied."""
    return {
        "checklist": [
            {
                "key": "exterior_angles_complete",
                "category": "photo_coverage",
                "label": "Exterior Angles Coverage",
                "passed": False,
                "severity": "major",
                "reason": "No readable garment photos were provided for photo coverage review.",
            },
            {
                "key": "inside_lining_visible",
                "category": "photo_coverage",
                "label": "Inside Lining & Pockets Coverage",
                "passed": False,
                "severity": "major",
                "reason": "Inside lining photo is missing.",
            },
            {
                "key": "labels_sharp_legible",
                "category": "photo_coverage",
                "label": "Label Close-Up Sharpness & Legibility",
                "passed": False,
                "severity": "major",
                "reason": "Label close-up photo is missing.",
            },
        ],
        "extracted_labels": {
            "brand": "Unknown",
            "size": "Unknown",
            "ce_label": "none",
            "composition": "not determinable",
            "material_group": "unknown",
        },
        "hard_gate_flags": {
            "crash_evident": False,
            "contamination_evident": False,
            "zone1_breach_or_repair": False,
        },
        "riding_gear": "yes",
        "protector_status": "unknown",
        "stain_kind": "none",
        "closeup_needed": None,
        "contradiction_flagged": False,
        "contradiction_reason": None,
        "summary": f"No readable {garment_type} photos were available for photo coverage and damage disclosure review.",
        "agent_trace": {
            "provider": "Local Fallback",
            "agent_label": "Local Empty-Photo Guard",
            "deployment": deployment,
            "model_returned": "local-empty-photo-guard",
            "api_version": api_version,
            "endpoint_host": endpoint_host,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "latency_ms": 0,
            "usage": {
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0,
            },
            "clip_stage1_model": "OpenCLIP ViT-B-32 (laion2b_s34b_b79k, frozen inference)",
            "photos_evaluated": 0,
            "system_prompt": _SYSTEM_PROMPT,
            "user_prompt": user_prompt_summary,
            "raw_response": "{}",
        },
    }


def _demo_rubric_evaluation(
    photos: list[dict[str, Any]],
    garment_type: str,
    disclosure: dict[str, Any] | None = None,
    *,
    deployment: str = "gpt-4.1-mini",
    api_version: str = "2024-12-01-preview",
    endpoint_host: str | None = None,
    temperature: float = 0.1,
    max_tokens: int = 1800,
) -> dict[str, Any]:
    """Return a deterministic, zero-API-spend vision rubric simulation for Portfolio Demo Mode.

    Evaluates actual captured angle coverage, Stage-1 OpenCLIP angle verification flags,
    and rider disclosure inputs using strictly 'photo coverage' and 'damage disclosure'
    wording, respecting North America CE-label neutrality and the Hard Compliance Gate.
    """
    normalized_garment = (garment_type or "jacket").strip().lower()
    if normalized_garment not in {"jacket", "pants"}:
        normalized_garment = "jacket"

    disc = dict(disclosure or {})
    crash_declared = bool(disc.get("crash"))
    usage = str(disc.get("usage") or disc.get("exposure_band") or "moderate").strip().lower()
    notes = str(disc.get("notes") or "").strip()

    present_angles = {str(p.get("angle") or "").strip().lower() for p in (photos or [])}
    exterior_required = {"front", "left", "right", "back"}
    missing_exterior = sorted(exterior_required - present_angles)
    has_inside = "inside" in present_angles
    has_labels = "labels" in present_angles
    has_defect = "defect" in present_angles
    mismatched_angles = sorted(
        {
            str(p.get("angle") or "").strip().lower()
            for p in (photos or [])
            if p.get("angle_ok") is False
        }
    )

    heavy_usage = usage == "heavy"
    notes_lower = notes.lower()
    notes_mention_contamination = any(
        tok in notes_lower for tok in ("oil", "fuel", "gasoline", "chemical", "mold", "contaminated")
    )
    notes_mention_zone1_damage = any(
        tok in notes_lower for tok in ("tear", "rip", "hole", "patch", "repaired", "road rash", "slide")
    )

    exterior_ok = len(missing_exterior) == 0
    zone1_visible = exterior_ok and len(mismatched_angles) == 0

    checklist: list[dict[str, Any]] = [
        {
            "key": "exterior_angles_complete",
            "category": "photo_coverage",
            "label": "Exterior Angles Coverage",
            "passed": exterior_ok,
            "severity": "none" if exterior_ok else "major",
            "reason": (
                "All 4 required exterior angles (front, left, right, back) were captured."
                if exterior_ok
                else f"Missing required exterior angle(s): {', '.join(missing_exterior)}."
            ),
        },
        {
            "key": "inside_lining_visible",
            "category": "photo_coverage",
            "label": "Inside Lining & Pockets Coverage",
            "passed": has_inside,
            "severity": "none" if has_inside else "major",
            "reason": (
                "Inside lining angle captured for interior inspection."
                if has_inside
                else "Inside lining photo is missing."
            ),
        },
        {
            "key": "labels_sharp_legible",
            "category": "photo_coverage",
            "label": "Label Close-Up Sharpness & Legibility",
            "passed": has_labels,
            "severity": "none" if has_labels else "major",
            "reason": (
                "Label close-up uploaded (Demo Mode does not run live OCR; unlock Live AI for label reading)."
                if has_labels
                else "Label close-up photo is missing."
            ),
        },
        {
            "key": "photo_sharpness_framing",
            "category": "photo_coverage",
            "label": "Photo Sharpness & Framing",
            "passed": len(mismatched_angles) == 0,
            "severity": "none" if len(mismatched_angles) == 0 else "minor",
            "reason": (
                "Stage-1 OpenCLIP angle verification matched all uploaded views."
                if len(mismatched_angles) == 0
                else f"Stage-1 OpenCLIP flagged angle framing warning on: {', '.join(mismatched_angles)}."
            ),
        },
        {
            "key": "zone1_areas_visible",
            "category": "photo_coverage",
            "label": "Zone 1 Areas Visible",
            "passed": zone1_visible,
            "severity": "none" if zone1_visible else "minor",
            "reason": (
                f"All primary {normalized_garment} Zone 1 regions are covered by the uploaded exterior set."
                if zone1_visible
                else f"Retake or complete exterior views so all {normalized_garment} Zone 1 areas are clearly visible."
            ),
        },
        {
            "key": "no_crash_evidence",
            "category": "damage_disclosure",
            "label": "No Visible Crash / Slide Damage",
            "passed": not crash_declared,
            "severity": "hard_gate" if crash_declared else "none",
            "reason": (
                "Rider disclosed prior crash involvement — Hard Compliance Gate triggered (declined for buy-in)."
                if crash_declared
                else "No crash history disclosed in Portfolio Demo Mode (unlock Live AI for pixel-level vision review)."
            ),
        },
        {
            "key": "no_contamination",
            "category": "damage_disclosure",
            "label": "No Visible Contamination",
            "passed": not notes_mention_contamination,
            "severity": "hard_gate" if notes_mention_contamination else "none",
            "reason": (
                "Disclosure notes indicate possible contamination — Hard Compliance Gate triggered."
                if notes_mention_contamination
                else "No contamination disclosed."
            ),
        },
        {
            "key": "zone1_integrity",
            "category": "damage_disclosure",
            "label": "Zone 1 Integrity (No Breach or Repair)",
            "passed": not notes_mention_zone1_damage,
            "severity": "hard_gate" if notes_mention_zone1_damage else "none",
            "reason": (
                "Disclosure notes reference damage or repair affecting Zone 1 — Hard Compliance Gate triggered."
                if notes_mention_zone1_damage
                else "No Zone 1 tear or repair disclosed (unlock Live AI for visual Zone 1 inspection)."
            ),
        },
        {
            "key": "stitching_seams_intact",
            "category": "damage_disclosure",
            "label": "Stitching, Yarn & Seam Integrity",
            "passed": not has_defect,
            "severity": "minor" if has_defect else "none",
            "reason": (
                "Optional defect close-up uploaded — queued for in-hand seam and stitching review by store staff."
                if has_defect
                else "No stitching issues disclosed; confirm seams in hand at counter."
            ),
        },
        {
            "key": "hardware_zippers_condition",
            "category": "damage_disclosure",
            "label": "Zippers, Snaps & Hardware Condition",
            "passed": True,
            "severity": "none",
            "reason": "No hardware defects disclosed; confirm zipper action in hand.",
        },
        {
            "key": "lining_interior_condition",
            "category": "damage_disclosure",
            "label": "Lining & Interior Condition",
            "passed": has_inside,
            "severity": "none" if has_inside else "minor",
            "reason": (
                "Interior angle recorded for counter lining inspection."
                if has_inside
                else "Inside photo absent — physical lining check required."
            ),
        },
        {
            "key": "zone2_3_wear_fading",
            "category": "damage_disclosure",
            "label": "Zone 2/3 Wear & Fading",
            "passed": not heavy_usage,
            "severity": "minor" if heavy_usage else "none",
            "reason": (
                "Heavy usage disclosed — flagged for in-hand Zone 2/3 wear and fading inspection."
                if heavy_usage
                else f"Usage disclosed as '{usage}'; no excessive Zone 2/3 wear disclosed."
            ),
        },
    ]

    extracted_labels = {
        "brand": "Demo Sample (Unlock Live AI for OCR)",
        "size": "Unknown",
        "ce_label": "none",
        "composition": "not determinable",
        "material_group": "textile",
    }
    hard_gate_flags = {
        "crash_evident": crash_declared,
        "contamination_evident": notes_mention_contamination,
        "zone1_breach_or_repair": notes_mention_zone1_damage,
    }

    summary = (
        f"Portfolio Demo Mode completed photo coverage and damage disclosure triage for {len(photos or [])} "
        f"{normalized_garment} photo(s) using real Stage-1 OpenCLIP verification and deterministic rubric rules ($0 Azure OpenAI spend). "
        "Unlock Live AI with a passcode to run live Azure OpenAI vision inspection."
    )

    raw_demo_payload = {
        "checklist": checklist,
        "extracted_labels": extracted_labels,
        "hard_gate_flags": hard_gate_flags,
        "riding_gear": "yes",
        "protector_status": "unknown",
        "stain_kind": "contamination" if notes_mention_contamination else "none",
        "closeup_needed": None,
        "contradiction_flagged": False,
        "contradiction_reason": None,
        "summary": summary,
    }
    normalized = _normalize_vision_response(raw_demo_payload)
    normalized["agent_trace"] = {
        "provider": "Portfolio Demo Mode (No API Spend)",
        "agent_label": "Demo Rubric Simulator (Unlock Passcode for Live Azure AI)",
        "deployment": f"{deployment} (standby)",
        "model_returned": "demo-rubric-simulator",
        "api_version": api_version,
        "endpoint_host": endpoint_host,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "latency_ms": 0,
        "usage": {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
        },
        "clip_stage1_model": "OpenCLIP ViT-B-32 (laion2b_s34b_b79k, frozen inference)",
        "photos_evaluated": len(photos or []),
        "system_prompt": _SYSTEM_PROMPT,
        "user_prompt": (
            f"[Portfolio Demo Mode — zero external API call made]\n"
            f"Garment Type: {normalized_garment.upper()}\n"
            f"Captured Angles: {', '.join(sorted(present_angles)) or 'none'}\n"
            f"Rider Disclosure: {json.dumps(disc, ensure_ascii=False)}"
        ),
        "raw_response": json.dumps(raw_demo_payload, indent=2),
    }
    return normalized


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
def score_photos(
    photos: list[dict[str, Any]],
    garment_type: str,
    disclosure: dict[str, Any] | None = None,
    *,
    runtime_settings: dict[str, Any] | None = None,
    use_demo_mode: bool = False,
) -> dict[str, Any]:
    """Evaluate intake photos against Moto Reloaded's rubric via Azure OpenAI (swappable provider boundary)."""
    load_dotenv()

    rs = dict(runtime_settings or {})
    endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
    api_key = os.getenv("AZURE_OPENAI_API_KEY")
    api_version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-12-01-preview")
    deployment = str(
        rs.get("vision_deployment")
        or os.getenv("AZURE_OPENAI_VISION_DEPLOYMENT")
        or "gpt-4.1"
    ).strip()
    temperature = float(rs["temperature"]) if rs.get("temperature") is not None else 0.1
    max_tokens = int(rs["max_tokens"]) if rs.get("max_tokens") is not None else 1800
    endpoint_host = urlparse(endpoint).hostname if endpoint else None

    if use_demo_mode:
        return _demo_rubric_evaluation(
            photos,
            garment_type,
            disclosure,
            deployment=deployment,
            api_version=api_version,
            endpoint_host=endpoint_host,
            temperature=temperature,
            max_tokens=max_tokens,
        )

    normalized_garment = (garment_type or "jacket").strip().lower()
    if normalized_garment not in {"jacket", "pants"}:
        normalized_garment = "jacket"

    zone1_desc = (
        "Left shoulder, Right shoulder, Left elbow & forearm, Right elbow & forearm, Upper back."
        if normalized_garment == "jacket"
        else (
            "Left hip & outer thigh, Right hip & outer thigh, Left knee, Right knee, Seat "
            "(IMPORTANT: normal sitting sheen on pants seat without fibre wear is Zone 2 wear, NOT Zone 1)."
        )
    )

    intro_text = (
        f"Garment Type: {normalized_garment.upper()}\n"
        f"Zone 1 Areas: {zone1_desc}\n"
        f"Rider Disclosure: {json.dumps(disclosure or {}, ensure_ascii=False)}\n"
        "Below are the captured intake photos along with their Stage-1 OpenCLIP angle verification "
        "and closest reference matches. Evaluate every photo coverage and damage disclosure item strictly."
    )
    user_content: list[dict[str, Any]] = [{"type": "text", "text": intro_text}]
    prompt_summary_lines: list[str] = [intro_text]

    attached_count = 0
    for idx, photo in enumerate(photos or [], start=1):
        filepath = photo.get("filepath") or photo.get("path") or photo.get("file_path")
        if not filepath or not Path(str(filepath)).exists():
            continue

        angle = str(photo.get("angle", "unknown")).strip().lower()
        predicted = photo.get("clip_predicted_angle") or photo.get("predicted_angle") or "unknown"
        confidence = photo.get("clip_confidence")
        if confidence is None:
            confidence = photo.get("expected_similarity", 0.0)
        angle_ok = photo.get("angle_ok", True)
        matched_refs = _parse_matched_refs(
            photo.get("clip_matched_refs") if "clip_matched_refs" in photo else photo.get("matched_references")
        )
        ref_summary = ", ".join(
            f"{r.get('item_id', '?')}:{r.get('detail_tag', r.get('angle', '?'))} ({r.get('similarity', 0):.2f})"
            for r in matched_refs[:3]
        ) or "none"

        max_edge = 1536 if angle in {"labels", "defect"} else 1024
        detail = "high" if angle in {"labels", "defect"} else "auto"
        data_url = _encode_image_for_vision(str(filepath), angle)

        attached_count += 1
        meta_line = (
            f"Photo #{attached_count} — Requested slot: '{angle}' | "
            f"OpenCLIP predicted: '{predicted}' (sim={float(confidence):.2f}, angle_ok={bool(angle_ok)}) | "
            f"Closest references: {ref_summary}"
        )
        user_content.append({"type": "text", "text": meta_line})
        user_content.append(
            {
                "type": "image_url",
                "image_url": {
                    "url": data_url,
                    "detail": detail,
                },
            }
        )
        prompt_summary_lines.append(
            f"{meta_line}\n[Image #{attached_count}: slot={angle}, max_edge={max_edge}px, detail={detail}]"
        )

    user_prompt_summary = "\n\n".join(prompt_summary_lines)

    if attached_count == 0:
        return _empty_photos_fallback(
            normalized_garment,
            deployment=deployment,
            api_version=api_version,
            endpoint_host=endpoint_host,
            temperature=temperature,
            max_tokens=max_tokens,
            user_prompt_summary=user_prompt_summary,
        )

    if not endpoint or not api_key:
        raise RuntimeError(
            "Missing AZURE_OPENAI_ENDPOINT or AZURE_OPENAI_API_KEY environment variables."
        )

    client = AzureOpenAI(
        azure_endpoint=endpoint,
        api_key=api_key,
        api_version=api_version,
    )

    t0 = time.perf_counter()
    response = client.chat.completions.create(
        model=deployment,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        response_format={"type": "json_object"},
        temperature=temperature,
        max_tokens=max_tokens,
    )
    latency_ms = round((time.perf_counter() - t0) * 1000)

    content = response.choices[0].message.content or "{}"
    parsed = json.loads(content)
    normalized = _normalize_vision_response(parsed)

    usage = getattr(response, "usage", None)
    normalized["agent_trace"] = {
        "provider": "Azure OpenAI",
        "agent_label": "Azure OpenAI Vision Rubric Agent",
        "deployment": deployment,
        "model_returned": getattr(response, "model", None) or deployment,
        "api_version": api_version,
        "endpoint_host": endpoint_host,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "latency_ms": latency_ms,
        "usage": {
            "prompt_tokens": getattr(usage, "prompt_tokens", None),
            "completion_tokens": getattr(usage, "completion_tokens", None),
            "total_tokens": getattr(usage, "total_tokens", None),
        },
        "clip_stage1_model": "OpenCLIP ViT-B-32 (laion2b_s34b_b79k, frozen inference)",
        "photos_evaluated": attached_count,
        "system_prompt": _SYSTEM_PROMPT,
        "user_prompt": user_prompt_summary,
        "raw_response": content,
    }
    return normalized
