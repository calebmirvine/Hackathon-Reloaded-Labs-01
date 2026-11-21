# Created by Caleb M. Irvine for use by Moto Reloaded
"""Unit tests for Stage 3 deterministic scoring engine (app/scoring_engine.py)."""

from __future__ import annotations

import re

import pytest

from app.scoring_engine import compute_score

REQUIRED_ANGLES = ["front", "left", "right", "back", "inside", "labels"]

FORBIDDEN_SAFETY_CLAIMS_RE = re.compile(
    r"\b("
    r"certified\s+safe|"
    r"safety\s+certified|"
    r"guaranteed\s+safe|"
    r"safety\s+score|"
    r"safety\s+rating|"
    r"passes\s+safety\s+test|"
    r"protective\s+performance\s+guaranteed|"
    r"certified\s+protective"
    r")\b",
    re.IGNORECASE,
)


def make_photos(
    angles: list[str] | None = None,
    *,
    angle_ok: bool = True,
    confidence: float = 0.88,
) -> list[dict]:
    """Build synthetic session photo records for deterministic scoring tests."""
    selected = REQUIRED_ANGLES if angles is None else angles
    return [
        {
            "angle": angle,
            "filepath": f"uploads/test_session/{angle}.jpg",
            "clip_predicted_angle": angle if angle_ok else "labels",
            "clip_confidence": confidence,
            "clip_matched_refs": [
                {
                    "item_id": "RL01-001",
                    "angle": angle,
                    "detail_tag": angle,
                    "similarity": confidence,
                }
            ],
            "angle_ok": angle_ok,
        }
        for angle in selected
    ]


def make_clean_vision_result(
    *,
    ce_label: str = "AA",
    material_group: str = "leather",
    checklist_overrides: list[dict] | None = None,
    hard_gate_flags: dict | None = None,
    contradiction_flagged: bool = False,
    contradiction_reason: str | None = None,
    summary: str = "Complete photo coverage across all 6 angles with no visible damage disclosed.",
) -> dict:
    """Build a passing Stage 2 vision evaluation payload."""
    default_checklist = [
        {
            "key": "angles_complete",
            "category": "photo_coverage",
            "label": "All required angles visible",
            "passed": True,
            "severity": "none",
            "reason": "All 6 required garment views are present and properly framed.",
        },
        {
            "key": "photo_sharpness",
            "category": "photo_coverage",
            "label": "Photos sharp and well-lit",
            "passed": True,
            "severity": "none",
            "reason": "Exterior, inside, and label photos are clear and in focus.",
        },
        {
            "key": "labels_legible",
            "category": "photo_coverage",
            "label": "Brand and composition labels legible",
            "passed": True,
            "severity": "none",
            "reason": "Brand, size, and composition tags are readable.",
        },
        {
            "key": "zone1_condition",
            "category": "damage_disclosure",
            "label": "Zone 1 areas free of abrasion, breach, or repair",
            "passed": True,
            "severity": "none",
            "reason": "No visible scuffs, tears, or repairs in Zone 1 areas.",
        },
        {
            "key": "zone2_3_wear",
            "category": "damage_disclosure",
            "label": "Zone 2/3 wear minimal",
            "passed": True,
            "severity": "none",
            "reason": "Minimal normal handling marks.",
        },
        {
            "key": "hardware_zippers",
            "category": "damage_disclosure",
            "label": "Zippers and closures appear intact",
            "passed": True,
            "severity": "none",
            "reason": "Main zip, cuff zips, and snaps appear intact.",
        },
        {
            "key": "lining_pockets",
            "category": "damage_disclosure",
            "label": "Interior lining and protector pockets intact",
            "passed": True,
            "severity": "none",
            "reason": "Lining is clean and protector pockets are visible and intact.",
        },
        {
            "key": "cleanliness_contamination",
            "category": "damage_disclosure",
            "label": "Garment clean and free of contamination",
            "passed": True,
            "severity": "none",
            "reason": "No visible oil, fuel, chemical, or biological contamination.",
        },
    ]

    return {
        "checklist": default_checklist if checklist_overrides is None else checklist_overrides,
        "extracted_labels": {
            "brand": "Rev'It",
            "size": "L",
            "ce_label": ce_label,
            "composition": "100% cowhide leather" if material_group == "leather" else "Cordura polyamide",
            "material_group": material_group,
        },
        "hard_gate_flags": hard_gate_flags
        or {
            "crash_evident": False,
            "contamination_evident": False,
            "zone1_breach_or_repair": False,
        },
        "contradiction_flagged": contradiction_flagged,
        "contradiction_reason": contradiction_reason,
        "summary": summary,
    }


def test_auto_approved_band_85_to_100() -> None:
    """Clean 6-angle capture with no damage disclosures scores 85-100 and auto-approves."""
    result = compute_score(
        vision_result=make_clean_vision_result(),
        photos=make_photos(),
        garment_type="jacket",
        disclosure={"crash": False, "usage": "light", "notes": "Worn one season."},
    )

    assert 85 <= result["total_score"] <= 100
    assert 0 <= result["photo_coverage_score"] <= 50
    assert 0 <= result["damage_disclosure_score"] <= 50
    assert result["total_score"] == result["photo_coverage_score"] + result["damage_disclosure_score"]
    assert result["decision"] == "auto_approved"
    assert result["buy_in_recommended"] is True
    assert result["hard_gate_triggered"] is False


def test_human_review_band_50_to_84() -> None:
    """Moderate wear or disclosure/coverage issues without hard gate route to human_review (50-84)."""
    checklist = [
        {
            "key": "angles_complete",
            "category": "photo_coverage",
            "label": "All required angles visible",
            "passed": True,
            "severity": "none",
            "reason": "All 6 angles uploaded.",
        },
        {
            "key": "photo_sharpness",
            "category": "photo_coverage",
            "label": "Photos sharp and well-lit",
            "passed": False,
            "severity": "minor",
            "reason": "Inside lining shot is slightly soft.",
        },
        {
            "key": "labels_legible",
            "category": "photo_coverage",
            "label": "Labels legible",
            "passed": False,
            "severity": "minor",
            "reason": "Composition tag partially folded.",
        },
        {
            "key": "zone1_condition",
            "category": "damage_disclosure",
            "label": "Zone 1 areas intact",
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
            "reason": "Visible fading and cuff wear in Zone 2.",
        },
        {
            "key": "hardware_zippers",
            "category": "damage_disclosure",
            "label": "Hardware functional",
            "passed": False,
            "severity": "major",
            "reason": "Left pocket zipper pull missing; needs in-hand check.",
        },
        {
            "key": "lining_pockets",
            "category": "damage_disclosure",
            "label": "Interior lining intact",
            "passed": True,
            "severity": "none",
            "reason": "Lining shows normal light use.",
        },
    ]

    result = compute_score(
        vision_result=make_clean_vision_result(
            checklist_overrides=checklist,
            contradiction_flagged=True,
            contradiction_reason="Rider reported light usage, but cuffs and collar show heavy wear.",
        ),
        photos=make_photos(),
        garment_type="jacket",
        disclosure={"crash": False, "usage": "light"},
    )

    assert 50 <= result["total_score"] <= 84
    assert result["decision"] == "human_review"
    assert result["buy_in_recommended"] is False
    assert result["hard_gate_triggered"] is False


def test_rejected_retake_band_0_to_49_missing_angles() -> None:
    """Missing/mismatched angles with no hard gate route to rejected_retake (0-49)."""
    checklist = [
        {
            "key": "angles_complete",
            "category": "photo_coverage",
            "label": "All required angles visible",
            "passed": False,
            "severity": "major",
            "reason": "Missing left, right, inside, and labels photos.",
        },
        {
            "key": "photo_sharpness",
            "category": "photo_coverage",
            "label": "Photos sharp and well-lit",
            "passed": False,
            "severity": "major",
            "reason": "Uploaded front image is blurry and dark.",
        },
        {
            "key": "labels_legible",
            "category": "photo_coverage",
            "label": "Labels legible",
            "passed": False,
            "severity": "major",
            "reason": "No label photo supplied.",
        },
        {
            "key": "zone1_condition",
            "category": "damage_disclosure",
            "label": "Zone 1 visibility",
            "passed": False,
            "severity": "major",
            "reason": "Cannot verify side and back Zone 1 surfaces from incomplete photos.",
        },
        {
            "key": "lining_pockets",
            "category": "damage_disclosure",
            "label": "Interior lining check",
            "passed": False,
            "severity": "major",
            "reason": "Inside-out lining shot missing.",
        },
    ]

    result = compute_score(
        vision_result=make_clean_vision_result(checklist_overrides=checklist),
        photos=make_photos(angles=["front"], angle_ok=False, confidence=0.22),
        garment_type="pants",
        disclosure={"crash": False, "usage": "moderate"},
    )

    assert 0 <= result["total_score"] <= 49
    assert result["decision"] == "rejected_retake"
    assert result["buy_in_recommended"] is False
    assert result["hard_gate_triggered"] is False
    retake = result.get("retake_angles", [])
    assert len(retake) >= 4
    for missing in ("left", "right", "back", "inside", "labels"):
        assert missing in retake


@pytest.mark.parametrize(
    "case_name,disclosure,hard_gate_flags,extra_checklist_item",
    [
        (
            "declared_crash",
            {"crash": True, "usage": "light"},
            {"crash_evident": False, "contamination_evident": False, "zone1_breach_or_repair": False},
            None,
        ),
        (
            "evident_crash",
            {"crash": False, "usage": "light"},
            {"crash_evident": True, "contamination_evident": False, "zone1_breach_or_repair": False},
            None,
        ),
        (
            "contamination",
            {"crash": False, "usage": "light"},
            {"crash_evident": False, "contamination_evident": True, "zone1_breach_or_repair": False},
            None,
        ),
        (
            "zone1_breach_or_repair",
            {"crash": False, "usage": "light"},
            {"crash_evident": False, "contamination_evident": False, "zone1_breach_or_repair": True},
            None,
        ),
        (
            "checklist_hard_gate_item",
            {"crash": False, "usage": "light"},
            {"crash_evident": False, "contamination_evident": False, "zone1_breach_or_repair": False},
            {
                "key": "zone1_shoulder_repair",
                "category": "damage_disclosure",
                "label": "Zone 1 repair check",
                "passed": False,
                "severity": "hard_gate",
                "reason": "Visible restitched patch on right shoulder (Zone 1).",
            },
        ),
    ],
)
def test_hard_gate_always_caps_score_and_routes_to_upcycle(
    case_name: str,
    disclosure: dict,
    hard_gate_flags: dict,
    extra_checklist_item: dict | None,
) -> None:
    """Any hard compliance gate caps score <= 49 and routes to upcycling even with 6 crisp photos."""
    vision = make_clean_vision_result(hard_gate_flags=hard_gate_flags)
    if extra_checklist_item is not None:
        vision["checklist"] = [*vision["checklist"], extra_checklist_item]

    result = compute_score(
        vision_result=vision,
        photos=make_photos(angle_ok=True, confidence=0.95),
        garment_type="jacket",
        disclosure=disclosure,
    )

    assert result["total_score"] <= 49, f"{case_name} exceeded hard-gate score cap"
    assert result["decision"] == "rejected_upcycle", f"{case_name} must route to rejected_upcycle"
    assert result["buy_in_recommended"] is False, f"{case_name} must never recommend buy-in"
    assert result["hard_gate_triggered"] is True, f"{case_name} must mark hard_gate_triggered"
    assert result.get("hard_gate_reasons"), f"{case_name} must report hard_gate_reasons"
    assert result.get("upcycle_plan"), f"{case_name} must include a non-empty upcycle_plan"


@pytest.mark.parametrize("material_group", ["leather", "textile", "denim_aramid", "unknown"])
def test_upcycle_plan_populated_for_all_material_groups(material_group: str) -> None:
    """Hard-gated garments produce a non-empty upcycle_plan for every material group."""
    vision = make_clean_vision_result(
        material_group=material_group,
        hard_gate_flags={
            "crash_evident": True,
            "contamination_evident": False,
            "zone1_breach_or_repair": False,
        },
    )
    result = compute_score(
        vision_result=vision,
        photos=make_photos(),
        garment_type="jacket",
        disclosure={"crash": True},
    )

    plan = result.get("upcycle_plan")
    assert plan
    plan_text = str(plan).lower()
    assert any(
        keyword in plan_text
        for keyword in ("upcycl", "retir", "salvage", "trade", "recycl", "leather", "zipper", "textile")
    )


def test_north_america_ce_label_neutrality() -> None:
    """Absence of a CE label (ce_label == 'none') causes zero penalty and does not fail intake."""
    result_with_ce = compute_score(
        vision_result=make_clean_vision_result(ce_label="AA"),
        photos=make_photos(),
        garment_type="jacket",
        disclosure={"crash": False, "usage": "light"},
    )
    result_without_ce = compute_score(
        vision_result=make_clean_vision_result(ce_label="none"),
        photos=make_photos(),
        garment_type="jacket",
        disclosure={"crash": False, "usage": "light"},
    )

    assert result_without_ce["total_score"] == result_with_ce["total_score"]
    assert result_without_ce["decision"] == "auto_approved"
    assert result_without_ce["buy_in_recommended"] is True
    assert result_without_ce["hard_gate_triggered"] is False

    # Even if a vision response mistakenly fails a label item solely for absent CE label,
    # scoring_engine must neutralize the penalty under NA CE-label neutrality.
    ce_false_fail_vision = make_clean_vision_result(ce_label="none")
    ce_false_fail_vision["checklist"] = [
        *ce_false_fail_vision["checklist"],
        {
            "key": "ce_label_check",
            "category": "photo_coverage",
            "label": "CE label present",
            "passed": False,
            "severity": "minor",
            "reason": "No CE label present on garment.",
        },
    ]
    neutralized = compute_score(
        vision_result=ce_false_fail_vision,
        photos=make_photos(),
        garment_type="jacket",
        disclosure={"crash": False, "usage": "light"},
    )
    assert neutralized["total_score"] == result_with_ce["total_score"]
    assert neutralized["decision"] == "auto_approved"


def test_rejected_upcycle_band_0_to_49_extensive_non_hard_gate_defects() -> None:
    """All 6 crisp angles with 3+ major non-hard-gate defects routes to rejected_upcycle (0-49)."""
    checklist = [
        {
            "key": "angles_complete",
            "category": "photo_coverage",
            "label": "All required angles visible",
            "passed": True,
            "severity": "none",
            "reason": "All 6 angles uploaded clearly.",
        },
        {
            "key": "zone2_3_wear",
            "category": "damage_disclosure",
            "label": "Zone 2/3 wear",
            "passed": False,
            "severity": "major",
            "reason": "Extensive heavy wear and patchy fading across front and cuffs.",
        },
        {
            "key": "hardware_zippers",
            "category": "damage_disclosure",
            "label": "Hardware functional",
            "passed": False,
            "severity": "major",
            "reason": "Main front zipper teeth sheared; non-repairable failure.",
        },
        {
            "key": "lining_pockets",
            "category": "damage_disclosure",
            "label": "Interior lining intact",
            "passed": False,
            "severity": "major",
            "reason": "Interior lining torn across back and sleeve seams.",
        },
    ]
    result = compute_score(
        vision_result=make_clean_vision_result(checklist_overrides=checklist),
        photos=make_photos(angle_ok=True, confidence=0.92),
        garment_type="jacket",
        disclosure={"crash": False, "usage": "heavy"},
    )
    assert 0 <= result["total_score"] <= 49
    assert result["decision"] == "rejected_upcycle"
    assert result["buy_in_recommended"] is False
    assert result["hard_gate_triggered"] is False
    assert result.get("upcycle_plan")


def test_wording_compliance_photo_coverage_and_damage_disclosure_only() -> None:
    """Outputs use 'photo coverage' / 'damage disclosure' wording and never certify safety."""
    scenarios = [
        compute_score(make_clean_vision_result(), make_photos(), "jacket", {"crash": False}),
        compute_score(
            make_clean_vision_result(
                hard_gate_flags={
                    "crash_evident": True,
                    "contamination_evident": False,
                    "zone1_breach_or_repair": False,
                }
            ),
            make_photos(),
            "pants",
            {"crash": True},
        ),
    ]

    for result in scenarios:
        score_label = str(result.get("score_label", "")).lower()
        disclaimer = str(result.get("disclaimer", "")).lower()
        assert "photo coverage" in score_label
        assert "damage disclosure" in score_label
        assert "photo coverage" in disclaimer
        assert "damage disclosure" in disclaimer
        assert "do not" in disclaimer or "not assess" in disclaimer

        combined_non_disclaimer = " ".join(
            [
                str(result.get("score_label", "")),
                str(result.get("summary", "")),
                str(result.get("hard_gate_reasons", "")),
                str(result.get("upcycle_plan", "")),
            ]
        )
        assert not FORBIDDEN_SAFETY_CLAIMS_RE.search(
            combined_non_disclaimer
        ), f"Forbidden safety certification wording found: {combined_non_disclaimer}"
