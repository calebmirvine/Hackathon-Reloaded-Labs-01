# Created by Caleb M. Irvine for use by Moto Reloaded
"""Stage 3: Pure deterministic Python 0–100 Photo Coverage + Damage Disclosure scoring engine.

Contains zero LLM calls and zero external I/O. Computes a deterministic 0–100
"Photo Coverage + Damage Disclosure Score", enforces Moto Reloaded's Hard
Compliance Gate (never recommending buy-in on crash-involved, contaminated, or
Zone 1 damaged/repaired gear), preserves North America CE-label neutrality, and
builds material-tailored upcycling and retirement guidance.
"""

from __future__ import annotations

from typing import Any

REQUIRED_ANGLES: list[str] = ["front", "left", "right", "back", "inside", "labels"]

SCORE_LABEL = "Photo Coverage + Damage Disclosure Score"
DISCLAIMER = (
    "Photo coverage and damage disclosure check only. Moto Reloaded and this tool "
    "do not assess, certify, test, or guarantee protective performance."
)

_CE_NA_NOTE = (
    "No CE label observed — normal for North American riding gear; absence of a CE "
    "label does not reduce the photo coverage + damage disclosure score."
)


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.strip().lower() in {"true", "yes", "1", "y"}
    return False


def _build_upcycle_plan(
    material_group: str,
    garment_type: str,
    reasons: list[str],
) -> dict[str, Any]:
    """Generate material-tailored circular upcycling & in-store trade-in guidance."""
    mat = (material_group or "unknown").strip().lower()
    garment = (garment_type or "garment").strip().lower()

    if mat == "leather":
        pathways = [
            "Leather panel upcycling: Repurpose undamaged leather panels into saddlebags, tool rolls, wallets, pouches, and key fobs.",
            "Hardware & liner salvage: Harvest heavy-duty metal zippers, snaps, buckles, and intact removable thermal liners.",
            "Responsible retirement: Keep retired riding hides circulating as durable everyday goods instead of landfill waste.",
        ]
    elif mat == "textile":
        pathways = [
            "Hardware & component salvage: Recover working zippers, buckles, vents, and removable liners for repair reuse.",
            "Textile recycling stream: Route worn synthetic textile shells and aged membranes to specialized textile recyclers.",
            "Responsible retirement: Prevent aged synthetic fabrics from entering landfill while avoiding resale of compromised gear.",
        ]
    elif mat == "denim_aramid":
        pathways = [
            "Denim panel repurposing: Convert clean outer denim sections into utility pouches, shop aprons, or tool wraps.",
            "Hardware salvage: Recover metal buttons, rivets, and heavy zippers for reuse.",
            "Lining textile recycling: Divert retired inner reinforcement panels to responsible textile recycling.",
        ]
    else:
        pathways = [
            "In-store material sort: Staff can separate salvageable leather or heavy fabric panels for local bag and accessory makers.",
            "Hardware salvage: Recover functional zippers, snaps, buckles, and removable liners.",
            "Responsible textile recycling: Route remaining worn fabric components into circular textile recycling streams.",
        ]

    reason_text = "; ".join(reasons) if reasons else "visible wear or damage disclosure findings"
    trade_in_msg = (
        "Start an in-store gear consultation with Moto Reloaded staff to retire this piece "
        "responsibly and explore trade-in options toward modern new riding gear."
    )
    return {
        "headline": "Declined for Buy-In — Route to Circular Upcycling & Trade-In",
        "material_group": mat if mat in {"leather", "textile", "denim_aramid"} else "unknown",
        "summary": (
            f"This {garment} is not eligible for Moto Reloaded buy-in or consignment based on "
            f"current damage disclosure ({reason_text}). Rather than sending it to landfill, "
            "Moto Reloaded can route salvageable materials into circular upcycling."
        ),
        "pathways": pathways,
        "recovery_pathways": pathways,
        "hardware_salvage": (
            "Salvage working zippers, metal snaps, buckles, and removable liners before material recycling."
        ),
        "trade_in_note": trade_in_msg,
        "trade_in_conversation": trade_in_msg,
        "next_step_for_clerk": (
            "Decline buy-in politely, explain the visible damage disclosure findings clearly, "
            "offer Moto Reloaded's upcycling bin / retirement pathway, and invite an in-store gear upgrade chat."
        ),
    }


def _compute_protection_disclosure_status(
    extracted_labels: dict[str, Any],
    disclosure: dict[str, Any],
    hard_gate_triggered: bool,
    contradiction_flagged: bool,
) -> str:
    """Documentation-only disclosure status (confirmed | reduced | unknown) — NOT a safety test."""
    usage = str(
        disclosure.get("usage") or disclosure.get("exposure_band") or ""
    ).strip().lower()

    if hard_gate_triggered or _as_bool(disclosure.get("crash")) or contradiction_flagged or usage == "heavy":
        return "reduced"

    ce_label = str(extracted_labels.get("ce_label") or "none").strip()
    composition = str(extracted_labels.get("composition") or "").strip().lower()
    material_group = str(extracted_labels.get("material_group") or "unknown").strip().lower()

    has_documented_composition = bool(
        composition and composition not in {"not determinable", "unknown", "none", "n/a"}
    )
    if ce_label in {"A", "AA", "AAA"} or (
        material_group in {"leather", "textile", "denim_aramid"} and has_documented_composition
    ):
        return "confirmed"

    return "unknown"


def _is_ce_only_false_failure(item: dict[str, Any]) -> bool:
    """Guard North America CE-label neutrality: absent CE label alone must never deduct points."""
    if item.get("passed", True):
        return False
    reason = str(item.get("reason", "")).lower()
    key = str(item.get("key", "")).lower()
    mentions_ce_absent = (
        ("no ce" in reason or "missing ce" in reason or "absent ce" in reason or "without ce" in reason)
        and "blur" not in reason
        and "illegible" not in reason
        and "unreadable" not in reason
        and "brand" not in reason
        and "comp" not in reason
    )
    return mentions_ce_absent and ("label" in key or "ce" in key)


def compute_score(
    vision_result: dict[str, Any],
    photos: list[dict[str, Any]],
    garment_type: str,
    disclosure: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Compute the deterministic 0–100 Photo Coverage + Damage Disclosure score and intake routing."""
    disclosure = dict(disclosure or {})
    normalized_garment = (garment_type or "jacket").strip().lower()
    if normalized_garment not in {"jacket", "pants"}:
        normalized_garment = "jacket"

    # 1. Inspect captured required angles & Stage 1 OpenCLIP match flags
    photo_by_angle: dict[str, dict[str, Any]] = {}
    for p in photos or []:
        if not isinstance(p, dict):
            continue
        ang = str(p.get("angle", "")).strip().lower()
        if ang in REQUIRED_ANGLES:
            photo_by_angle[ang] = p

    missing_angles: list[str] = []
    mismatched_angles: list[str] = []
    verified_angles: list[str] = []

    for ang in REQUIRED_ANGLES:
        photo = photo_by_angle.get(ang)
        if photo is None:
            missing_angles.append(ang)
            continue
        angle_status = str(photo.get("angle_status", "")).strip().lower()
        angle_ok = photo.get("angle_ok", True)
        if angle_ok is False or angle_status == "warn_mismatch":
            mismatched_angles.append(ang)
        else:
            verified_angles.append(ang)

    present_count = len(REQUIRED_ANGLES) - len(missing_angles)

    # 2. Normalize vision checklist while enforcing NA CE-label neutrality
    raw_checklist = vision_result.get("checklist") if isinstance(vision_result, dict) else []
    checklist: list[dict[str, Any]] = []
    for raw_item in raw_checklist or []:
        if not isinstance(raw_item, dict):
            continue
        item = {
            "key": str(raw_item.get("key", f"item_{len(checklist) + 1}")),
            "category": str(raw_item.get("category", "damage_disclosure")).strip().lower(),
            "label": str(raw_item.get("label", "Checklist Item")),
            "passed": bool(raw_item.get("passed", False)),
            "severity": str(raw_item.get("severity", "none")).strip().lower(),
            "reason": str(raw_item.get("reason", "")).strip(),
        }
        if item["category"] not in {"photo_coverage", "damage_disclosure"}:
            item["category"] = "damage_disclosure"
        if _is_ce_only_false_failure(item):
            item["passed"] = True
            item["severity"] = "none"
            item["reason"] = _CE_NA_NOTE
        if item["passed"]:
            item["severity"] = "none"
        checklist.append(item)

    coverage_items = [c for c in checklist if c["category"] == "photo_coverage"]
    damage_items = [c for c in checklist if c["category"] == "damage_disclosure"]

    # 3. Compute photo_coverage_score (0–50)
    # 30 points from required angles (5 per verified angle, 2 per mismatched angle, 0 per missing)
    angle_points = len(verified_angles) * 5 + len(mismatched_angles) * 2

    # 20 points from photo_coverage checklist items (scaled when angles are missing)
    completeness_ratio = present_count / len(REQUIRED_ANGLES)
    if present_count == 0:
        coverage_checklist_points = 0.0
    elif coverage_items:
        earned = 0.0
        for item in coverage_items:
            if item["passed"]:
                earned += 1.0
            elif item["severity"] == "minor":
                earned += 0.45
            else:
                earned += 0.0
        base_checklist_pts = 20.0 * (earned / len(coverage_items))
        # Scale checklist portion by how many required angles were actually provided
        coverage_checklist_points = base_checklist_pts * completeness_ratio
    else:
        coverage_checklist_points = 20.0 * (angle_points / 30.0)

    photo_coverage_score = max(0, min(50, int(round(angle_points + coverage_checklist_points))))

    # Track any extra retake angles hinted by failed photo_coverage items (e.g., blurry labels)
    retake_angles: list[str] = list(dict.fromkeys(missing_angles + mismatched_angles))
    for item in coverage_items:
        if not item["passed"]:
            key_lower = item["key"].lower()
            if "label" in key_lower and "labels" not in retake_angles:
                retake_angles.append("labels")
            elif ("inside" in key_lower or "lining" in key_lower) and "inside" not in retake_angles:
                retake_angles.append("inside")

    # 4. Detect Hard Compliance Gate triggers (NEVER recommend buy-in on compromised gear)
    hard_gate_flags = (
        vision_result.get("hard_gate_flags")
        if isinstance(vision_result, dict) and isinstance(vision_result.get("hard_gate_flags"), dict)
        else {}
    )
    crash_declared = _as_bool(disclosure.get("crash"))
    contamination_declared = _as_bool(disclosure.get("contamination"))
    crash_evident = bool(hard_gate_flags.get("crash_evident", False))
    contamination_evident = bool(hard_gate_flags.get("contamination_evident", False))
    zone1_breach_or_repair = bool(hard_gate_flags.get("zone1_breach_or_repair", False))

    hard_gate_reasons: list[str] = []
    if crash_declared:
        hard_gate_reasons.append("Rider disclosed prior crash history.")
    if crash_evident:
        hard_gate_reasons.append("Visible crash or slide damage flagged in intake photos.")
    if contamination_declared or contamination_evident:
        hard_gate_reasons.append("Contamination disclosed or visible in intake photos.")
    if zone1_breach_or_repair:
        hard_gate_reasons.append("Visible damage, breach, or repair in a Zone 1 protective area.")

    for item in checklist:
        if not item["passed"] and item["severity"] == "hard_gate":
            msg = f"{item['label']}: {item['reason']}" if item["reason"] else item["label"]
            if msg not in hard_gate_reasons:
                hard_gate_reasons.append(msg)

    hard_gate_triggered = len(hard_gate_reasons) > 0

    # 5. Compute damage_disclosure_score (0–50)
    contradiction_flagged = bool(
        vision_result.get("contradiction_flagged", False) if isinstance(vision_result, dict) else False
    )
    contradiction_reason = (
        vision_result.get("contradiction_reason")
        if contradiction_flagged and isinstance(vision_result, dict)
        else None
    )

    major_damage_failures = 0
    if hard_gate_triggered:
        damage_disclosure_score = 0
    else:
        damage_pts = 50
        for item in damage_items:
            if item["passed"]:
                continue
            sev = item["severity"]
            if sev == "major":
                damage_pts -= 18
                major_damage_failures += 1
            elif sev == "minor":
                damage_pts -= 6
            else:
                damage_pts -= 10

        if contradiction_flagged:
            damage_pts -= 18

        # Missing or mismatched required angles reduce damage disclosure completeness
        damage_pts -= len(missing_angles) * 8
        damage_pts -= len(mismatched_angles) * 6

        # If half or more of required angles are missing/unverified, cap disclosure score proportionally
        effective_angle_ratio = (len(verified_angles) + 0.4 * len(mismatched_angles)) / len(REQUIRED_ANGLES)
        if present_count == 0:
            damage_pts = 0
        elif effective_angle_ratio <= 0.55:
            damage_pts = min(damage_pts, int(round(50 * effective_angle_ratio)) - 3)

        damage_disclosure_score = max(0, min(50, damage_pts))

    # 6. Combine scores and enforce hard-gate / incomplete-coverage / Grade-D caps
    raw_total = photo_coverage_score + damage_disclosure_score

    if hard_gate_triggered:
        total_score = min(raw_total, 39)
    else:
        total_score = max(0, min(100, raw_total))
        # Missing or mismatched required angles cannot auto-approve (85–100)
        if (missing_angles or mismatched_angles) and total_score >= 85:
            # Trim excess cleanly from damage_disclosure_score so breakdown remains consistent
            excess = total_score - 84
            damage_disclosure_score = max(0, damage_disclosure_score - excess)
            total_score = photo_coverage_score + damage_disclosure_score
        # Extensive multi-area major defects (3+ major damage failures) route to 0–49 upcycle
        elif major_damage_failures >= 3 and damage_disclosure_score == 0:
            total_score = min(total_score, 45)

    # 7. Extract & enrich labels (explicitly preserving NA CE-label neutrality)
    raw_labels = (
        vision_result.get("extracted_labels")
        if isinstance(vision_result, dict) and isinstance(vision_result.get("extracted_labels"), dict)
        else {}
    )
    ce_label = str(raw_labels.get("ce_label") or "none").strip()
    material_group = str(raw_labels.get("material_group") or "unknown").strip().lower()
    if material_group not in {"leather", "textile", "denim_aramid", "unknown"}:
        material_group = "unknown"

    extracted_labels: dict[str, Any] = {
        "brand": str(raw_labels.get("brand") or "Unknown").strip(),
        "size": str(raw_labels.get("size") or "Unknown").strip(),
        "ce_label": ce_label,
        "composition": str(raw_labels.get("composition") or "not determinable").strip(),
        "material_group": material_group,
    }
    if ce_label.lower() == "none":
        extracted_labels["ce_note"] = _CE_NA_NOTE

    # 8. Deterministic Intake Routing
    upcycle_plan: dict[str, Any] | None = None

    if hard_gate_triggered:
        decision = "rejected_upcycle"
        decision_label = "Declined for Buy-In — Route to Upcycling (0–49)"
        buy_in_recommended = False
        upcycle_plan = _build_upcycle_plan(material_group, normalized_garment, hard_gate_reasons)
    elif total_score <= 49:
        needs_retake = bool(missing_angles or mismatched_angles or (retake_angles and photo_coverage_score < 35))
        if needs_retake:
            decision = "rejected_retake"
            decision_label = "Rejected / Retake Required (0–49)"
            buy_in_recommended = False
        else:
            decision = "rejected_upcycle"
            decision_label = "Declined for Buy-In — Route to Upcycling (0–49)"
            buy_in_recommended = False
            failed_reasons = [
                f"{c['label']}: {c['reason']}" if c["reason"] else c["label"]
                for c in damage_items
                if not c["passed"]
            ]
            upcycle_plan = _build_upcycle_plan(material_group, normalized_garment, failed_reasons)
    elif total_score <= 84:
        decision = "human_review"
        decision_label = "Human Review Required (50–84)"
        buy_in_recommended = False
    else:
        decision = "auto_approved"
        decision_label = "Auto-Approved & Logged (85–100)"
        buy_in_recommended = True

    protection_disclosure_status = _compute_protection_disclosure_status(
        extracted_labels=extracted_labels,
        disclosure=disclosure,
        hard_gate_triggered=hard_gate_triggered,
        contradiction_flagged=contradiction_flagged,
    )

    vision_summary = (
        str(vision_result.get("summary") or "").strip() if isinstance(vision_result, dict) else ""
    )
    if hard_gate_triggered:
        summary = (
            f"Photo coverage + damage disclosure score capped at {total_score}/100 due to a "
            f"hard compliance gate ({'; '.join(hard_gate_reasons)}). Declined for buy-in and "
            "routed to Moto Reloaded's upcycling and retirement pathway."
        )
    elif decision == "rejected_retake":
        angles_str = ", ".join(retake_angles) if retake_angles else "required angles"
        summary = (
            f"Photo coverage + damage disclosure score is {total_score}/100. "
            f"Please retake or upload clearer photos for: {angles_str}."
        )
    elif decision == "rejected_upcycle":
        summary = (
            f"Photo coverage + damage disclosure score is {total_score}/100. "
            "Extensive visible wear or defects preclude buy-in; routed to circular upcycling and retirement."
        )
    elif decision == "human_review":
        extra = f" {vision_summary}" if vision_summary else ""
        summary = (
            f"Photo coverage + damage disclosure score is {total_score}/100. "
            f"Queued for Alex/Barbara in-hand physical inspection.{extra}"
        )
    else:
        extra = f" {vision_summary}" if vision_summary else ""
        summary = (
            f"Photo coverage + damage disclosure score is {total_score}/100. "
            f"Logged as intake-ready pending standard in-hand physical confirmation.{extra}"
        )

    return {
        "garment_type": normalized_garment,
        "photo_coverage_score": photo_coverage_score,
        "damage_disclosure_score": damage_disclosure_score,
        "total_score": total_score,
        "score_label": SCORE_LABEL,
        "decision": decision,
        "decision_label": decision_label,
        "buy_in_recommended": buy_in_recommended,
        "hard_gate_triggered": hard_gate_triggered,
        "hard_gate_reasons": hard_gate_reasons,
        "hard_gate_flags": {
            "crash_evident": crash_evident,
            "contamination_evident": contamination_evident,
            "zone1_breach_or_repair": zone1_breach_or_repair,
        },
        "missing_angles": missing_angles,
        "mismatched_angles": mismatched_angles,
        "retake_angles": retake_angles,
        "checklist": checklist,
        "extracted_labels": extracted_labels,
        "contradiction_flagged": contradiction_flagged,
        "contradiction_reason": contradiction_reason,
        "protection_disclosure_status": protection_disclosure_status,
        "upcycle_plan": upcycle_plan,
        "summary": summary,
        "disclaimer": DISCLAIMER,
    }
