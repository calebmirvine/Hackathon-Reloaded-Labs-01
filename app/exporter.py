# Created by Caleb M. Irvine for use by Moto Reloaded
"""Excel (.xlsx) shot-checklist and intake-report exporter for Moto Reloaded.

Generates an in-memory openpyxl workbook whose active 'Shot Checklist' sheet
matches the exact 28 Row-5 headers of `reloaded-labs-shot-checklist.xlsx`,
plus a structured 'Intake Report' sheet for store intake staff.

Wording policy: strictly reports "photo coverage" and "damage disclosure" only.
"""

from __future__ import annotations

import io
from datetime import datetime, timezone
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

REQUIRED_ANGLES: tuple[str, ...] = (
    "front",
    "left",
    "right",
    "back",
    "inside",
    "labels",
)

DISCLAIMER_TEXT = (
    "Photo coverage and damage disclosure check only. Moto Reloaded and this "
    "tool do not assess, certify, test, or guarantee protective performance."
)

# Exact 28 Row-5 headers matching reloaded-labs-shot-checklist.xlsx (DOMAIN-SPEC.md Section 3)
SHOT_CHECKLIST_HEADERS: list[str] = [
    "Item ID",
    "Jacket / Pants",
    "Brand / description",
    "Set",
    "Complete?",
    "front",
    "back",
    "left",
    "right",
    "z1-1",
    "z1-2",
    "z1-3",
    "z1-4",
    "z1-5",
    "brand",
    "ce",
    "comp",
    "lining",
    "lin-1",
    "lin-2",
    "lin-3",
    "lin-4",
    "lin-5",
    "pockets",
    "# defects",
    "Files renamed",
    "Sheet filled",
    "Notes (skipped shots, retakes)",
]

# Moto Reloaded palette accents for clean workbook styling
_DARK_OLIVE = "202219"
_MID_OLIVE = "46493C"
_WARM_IVORY = "FFFEFD"
_PARCHMENT = "E6E0D6"
_SOFT_CREAM = "F7F4EE"
_BORDER_GRAY = "B8B2A6"
_GREEN_TINT = "DFF5E4"
_AMBER_TINT = "FCECD9"
_RED_TINT = "FADDDD"

_THIN_SIDE = Side(style="thin", color=_BORDER_GRAY)
_CELL_BORDER = Border(
    left=_THIN_SIDE,
    right=_THIN_SIDE,
    top=_THIN_SIDE,
    bottom=_THIN_SIDE,
)


def _extract_labels(score: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(score, dict):
        return {}
    labels = score.get("extracted_labels")
    if isinstance(labels, dict):
        return labels
    vision = score.get("vision_result")
    if isinstance(vision, dict) and isinstance(vision.get("extracted_labels"), dict):
        return vision["extracted_labels"]
    return {}


def _extract_checklist(score: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(score, dict):
        return []
    checklist = score.get("checklist")
    if isinstance(checklist, list):
        return [item for item in checklist if isinstance(item, dict)]
    vision = score.get("vision_result")
    if isinstance(vision, dict) and isinstance(vision.get("checklist"), list):
        return [item for item in vision["checklist"] if isinstance(item, dict)]
    return []


def _format_brand_description(labels: dict[str, Any], garment_type: str) -> str:
    parts: list[str] = []
    brand = str(labels.get("brand") or "").strip()
    size = str(labels.get("size") or "").strip()
    comp = str(labels.get("composition") or "").strip()
    if brand and brand.lower() not in {"unknown", "none", "n/a", "not visible"}:
        parts.append(brand)
    if size and size.lower() not in {"unknown", "none", "n/a", "not visible"}:
        parts.append(f"Size {size}")
    if comp and comp.lower() not in {"unknown", "none", "n/a", "not visible"}:
        short_comp = comp if len(comp) <= 48 else f"{comp[:45]}..."
        parts.append(short_comp)
    if parts:
        return " — ".join(parts)
    label = "Jacket" if garment_type == "jacket" else "Pants"
    return f"Moto {label} (details pending physical review)"


_FINDING_LABELS = {
    "protector_status": {
        "intact": "Intact in the photos",
        "failed": "Broken, cracked, or out of its pocket",
        "missing": "Missing on a class that includes protectors",
        "not_required": "Not part of this printed class",
        "unknown": "Not confirmed in the photos",
    },
    "stain_kind": {
        "none": "None noted",
        "cosmetic": "Light stain — in-hand review, not contamination",
        "contamination": "Heavy oil, fuel, or chemical soak",
    },
}


def _photo_finding_rows(score: dict[str, Any] | None) -> list[tuple[str, str]]:
    if not isinstance(score, dict):
        return []
    rows: list[tuple[str, str]] = []
    class_text = str(score.get("class_disclosure") or "").strip()
    if class_text:
        rows.append(("Printed class (disclosure only)", class_text))
    for key, title in (
        ("protector_status", "Protector (from photos)"),
        ("stain_kind", "Stain (from photos)"),
    ):
        raw = str(score.get(key) or "").strip().lower()
        if raw in {"", "unspecified"}:
            continue
        rows.append((title, _FINDING_LABELS[key].get(raw, raw)))
    closeup = str(score.get("closeup_needed") or "").strip()
    if closeup and score.get("decision") == "rejected_retake":
        rows.append(("Close-up still needed", closeup))
    return rows


def _format_ce_cell(has_labels: bool, labels: dict[str, Any]) -> str:
    if not has_labels:
        return "no"
    ce_val = str(labels.get("ce_label") or "").strip()
    if not ce_val:
        return "yes"
    if ce_val.lower() == "none":
        return "none (NA ok)"
    return f"yes ({ce_val})"


def _build_notes(
    session: dict[str, Any],
    photos: list[dict[str, Any]],
    score: dict[str, Any] | None,
    captured_required: set[str],
) -> str:
    notes: list[str] = []

    missing = [angle for angle in REQUIRED_ANGLES if angle not in captured_required]
    if missing:
        notes.append(f"Missing angles: {', '.join(missing)}")

    mismatched = [
        f"{p.get('angle')} (closer to {p.get('clip_predicted_angle') or 'other'})"
        for p in photos
        if p.get("angle") in REQUIRED_ANGLES and not p.get("angle_ok", True)
    ]
    if mismatched:
        notes.append(f"Angle check warnings: {', '.join(mismatched)}")

    disclosure = session.get("disclosure") or {}
    if isinstance(disclosure, dict):
        if disclosure.get("crash") is True or str(disclosure.get("crash", "")).lower() == "yes":
            notes.append("Rider disclosure: crash history declared")
        usage = disclosure.get("usage") or disclosure.get("exposure_band")
        if usage:
            notes.append(f"Declared usage: {usage}")
        rider_notes = str(disclosure.get("notes") or "").strip()
        if rider_notes:
            notes.append(f"Rider notes: {rider_notes}")

    if isinstance(score, dict):
        total = score.get("total_score")
        decision = score.get("decision")
        if total is not None:
            notes.append(
                f"Photo coverage + damage disclosure score: {total}/100 ({decision})"
            )
        if score.get("hard_gate_triggered"):
            reasons = score.get("hard_gate_reasons") or []
            reason_text = "; ".join(str(r) for r in reasons) if reasons else "hard gate flag"
            notes.append(f"Declined for buy-in (route to upcycling): {reason_text}")
        if score.get("contradiction_flagged"):
            reason = score.get("contradiction_reason") or "Photo evidence differs from disclosure"
            notes.append(f"Disclosure contradiction: {reason}")

    return " | ".join(notes) if notes else "All core angles captured."


def _format_upcycle_plan(plan: Any) -> str:
    if not plan:
        return ""
    if isinstance(plan, str):
        return plan
    if isinstance(plan, list):
        return "; ".join(str(item) for item in plan)
    if isinstance(plan, dict):
        segments: list[str] = []
        headline = plan.get("headline") or plan.get("title")
        if headline:
            segments.append(str(headline))
        pathways = plan.get("pathways") or plan.get("options") or plan.get("steps")
        if isinstance(pathways, list) and pathways:
            segments.append("; ".join(str(p) for p in pathways))
        trade_in = plan.get("trade_in_note") or plan.get("next_step") or plan.get("in_store_conversation")
        if trade_in:
            segments.append(str(trade_in))
        if segments:
            return " — ".join(segments)
        return "; ".join(f"{k}: {v}" for k, v in plan.items() if v)
    return str(plan)


def build_checklist_workbook_bytes(
    session: dict[str, Any],
    photos: list[dict[str, Any]],
    score: dict[str, Any] | None = None,
) -> bytes:
    """Build an in-memory .xlsx workbook matching reloaded-labs-shot-checklist.xlsx.

    Sheet 1 ('Shot Checklist') puts the exact 28 required column headers on Row 5
    and the populated intake session record on Row 6.
    Sheet 2 ('Intake Report') provides the full photo coverage + damage
    disclosure breakdown and pass/fail checklist for store clerks.
    """
    wb = Workbook()

    # ------------------------------------------------------------------
    # Sheet 1: Shot Checklist (exact 28 Row-5 headers)
    # ------------------------------------------------------------------
    ws = wb.active
    assert ws is not None
    ws.title = "Shot Checklist"

    session_id = str(session.get("session_id") or "")
    garment_type = str(session.get("garment_type") or "jacket").lower()
    garment_label = "Jacket" if garment_type == "jacket" else "Pants"
    labels = _extract_labels(score)

    angles_present = {str(p.get("angle") or "").lower() for p in photos}
    captured_required = {a for a in REQUIRED_ANGLES if a in angles_present}
    complete_flag = "yes" if len(captured_required) == len(REQUIRED_ANGLES) else "no"
    defect_count = sum(1 for p in photos if str(p.get("angle") or "").lower() == "defect")

    has_front = "front" in angles_present
    has_back = "back" in angles_present
    has_left = "left" in angles_present
    has_right = "right" in angles_present
    has_inside = "inside" in angles_present
    has_labels = "labels" in angles_present

    disclosure = session.get("disclosure") or {}
    source_item = disclosure.get("source_item_id") if isinstance(disclosure, dict) else None
    set_label = "kickoff" if source_item else "intake"

    # Row 1: Title
    ws["A1"] = "Moto Reloaded — Gear Intake Shot Checklist (Photo Coverage + Damage Disclosure)"
    ws["A1"].font = Font(name="Calibri", size=14, bold=True, color=_DARK_OLIVE)

    # Row 2: Compliance Disclaimer
    ws["A2"] = DISCLAIMER_TEXT
    ws["A2"].font = Font(name="Calibri", size=10, italic=True, color=_MID_OLIVE)

    # Row 3: Export Metadata & Score Snapshot
    exported_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    if isinstance(score, dict):
        summary_line = (
            f"Exported: {exported_at} | Session: {session_id} | "
            f"Photo Coverage + Damage Disclosure Score: {score.get('total_score', 0)}/100 "
            f"(Photo Coverage {score.get('photo_coverage_score', 0)}/50, "
            f"Damage Disclosure {score.get('damage_disclosure_score', 0)}/50) | "
            f"Decision: {score.get('decision', 'pending')}"
        )
    else:
        summary_line = f"Exported: {exported_at} | Session: {session_id} | Status: {session.get('status', 'created')}"
    ws["A3"] = summary_line
    ws["A3"].font = Font(name="Calibri", size=10, color=_DARK_OLIVE)

    # Row 4: Section group markers (leaves Row 5 strictly as the 28 headers)
    group_spans = [
        (1, 5, "Identification"),
        (6, 9, "Exterior"),
        (10, 14, "Zone 1"),
        (15, 17, "Labels"),
        (18, 23, "Lining"),
        (24, 25, "Pockets & Defects"),
        (26, 28, "Intake Admin"),
    ]
    group_fill = PatternFill(start_color=_PARCHMENT, end_color=_PARCHMENT, fill_type="solid")
    group_font = Font(name="Calibri", size=9, bold=True, color=_DARK_OLIVE)
    for start_col, end_col, label in group_spans:
        ws.merge_cells(start_row=4, start_column=start_col, end_row=4, end_column=end_col)
        cell = ws.cell(row=4, column=start_col, value=label)
        cell.fill = group_fill
        cell.font = group_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
        for col_idx in range(start_col, end_col + 1):
            ws.cell(row=4, column=col_idx).border = _CELL_BORDER

    # Row 5: Exact 28 headers from reloaded-labs-shot-checklist.xlsx
    header_fill = PatternFill(start_color=_DARK_OLIVE, end_color=_DARK_OLIVE, fill_type="solid")
    header_font = Font(name="Calibri", size=10, bold=True, color=_WARM_IVORY)
    for col_idx, header in enumerate(SHOT_CHECKLIST_HEADERS, start=1):
        cell = ws.cell(row=5, column=col_idx, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = _CELL_BORDER
    ws.row_dimensions[5].height = 28

    # Row 6: Session data row mapped onto the 28 columns
    row_values: list[Any] = [
        session_id,
        garment_label,
        _format_brand_description(labels, garment_type),
        set_label,
        complete_flag,
        "yes" if has_front else "no",
        "yes" if has_back else "no",
        "yes" if has_left else "no",
        "yes" if has_right else "no",
        "via left" if has_left else "no",
        "via right" if has_right else "no",
        "via left" if has_left else "no",
        "via right" if has_right else "no",
        "via back" if has_back else "no",
        "yes" if has_labels else "no",
        _format_ce_cell(has_labels, labels),
        "yes" if has_labels else "no",
        "yes" if has_inside else "no",
        "via inside" if has_inside else "no",
        "via inside" if has_inside else "no",
        "via inside" if has_inside else "no",
        "via inside" if has_inside else "no",
        "via inside" if has_inside else "no",
        "via inside" if has_inside else "no",
        defect_count,
        "yes" if photos else "no",
        "yes" if score else "no",
        _build_notes(session, photos, score, captured_required),
    ]

    data_fill = PatternFill(start_color=_SOFT_CREAM, end_color=_SOFT_CREAM, fill_type="solid")
    ok_fill = PatternFill(start_color=_GREEN_TINT, end_color=_GREEN_TINT, fill_type="solid")
    warn_fill = PatternFill(start_color=_AMBER_TINT, end_color=_AMBER_TINT, fill_type="solid")
    data_font = Font(name="Calibri", size=10, color=_DARK_OLIVE)

    for col_idx, val in enumerate(row_values, start=1):
        cell = ws.cell(row=6, column=col_idx, value=val)
        cell.font = data_font
        cell.border = _CELL_BORDER
        if col_idx in (3, 28):
            cell.alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
        else:
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

        if 6 <= col_idx <= 24:
            str_val = str(val).lower()
            cell.fill = ok_fill if str_val != "no" else warn_fill
        elif col_idx == 5:
            cell.fill = ok_fill if val == "yes" else warn_fill
        else:
            cell.fill = data_fill
    ws.row_dimensions[6].height = 44

    # Sensible column widths
    col_widths = {
        1: 14,
        2: 14,
        3: 32,
        4: 10,
        5: 11,
        25: 11,
        26: 13,
        27: 12,
        28: 52,
    }
    for col_idx in range(1, len(SHOT_CHECKLIST_HEADERS) + 1):
        width = col_widths.get(col_idx, 10)
        ws.column_dimensions[get_column_letter(col_idx)].width = width
    ws.freeze_panes = "A6"

    # ------------------------------------------------------------------
    # Sheet 2: Intake Report (Photo Coverage + Damage Disclosure Detail)
    # ------------------------------------------------------------------
    report = wb.create_sheet(title="Intake Report")
    report["A1"] = "Moto Reloaded — Photo Coverage + Damage Disclosure Report"
    report["A1"].font = Font(name="Calibri", size=14, bold=True, color=_DARK_OLIVE)
    report["A2"] = DISCLAIMER_TEXT
    report["A2"].font = Font(name="Calibri", size=10, italic=True, color=_MID_OLIVE)

    decision = str(score.get("decision") or "pending") if isinstance(score, dict) else "pending"
    buy_in_text = "Pending scoring"
    if isinstance(score, dict):
        if score.get("hard_gate_triggered") or decision == "rejected_upcycle":
            buy_in_text = "No — Declined for buy-in; route to upcycling / responsible retirement"
        elif decision == "rejected_retake":
            buy_in_text = "No — Incomplete or unclear photos; retake required"
        elif decision == "human_review":
            buy_in_text = "Pending — Queued for store staff in-hand physical inspection"
        elif score.get("buy_in_recommended"):
            buy_in_text = "Intake-ready — Subject to in-hand physical confirmation by staff"
        else:
            buy_in_text = "No"

    summary_rows: list[tuple[str, Any]] = [
        ("Session ID", session_id),
        ("Garment Type", garment_label),
        ("Session Status", session.get("status", "")),
        (
            "Photo Coverage + Damage Disclosure Score",
            f"{score.get('total_score', 0)} / 100" if isinstance(score, dict) else "Not scored yet",
        ),
        (
            "Photo Coverage Subtotal",
            f"{score.get('photo_coverage_score', 0)} / 50" if isinstance(score, dict) else "-",
        ),
        (
            "Damage Disclosure Subtotal",
            f"{score.get('damage_disclosure_score', 0)} / 50" if isinstance(score, dict) else "-",
        ),
        ("Intake Routing Decision", decision),
        ("Buy-In Pathway", buy_in_text),
        ("Brand (from label)", labels.get("brand") or "Not determinable"),
        ("Size (from label)", labels.get("size") or "Not determinable"),
        ("CE Label (disclosure only — optional in NA)", labels.get("ce_label") or "unknown"),
        ("Fibre Composition (from label)", labels.get("composition") or "Not determinable"),
        (
            "Photo vs. Disclosure Contradiction",
            (
                f"FLAGGED: {score.get('contradiction_reason') or 'See checklist'}"
                if isinstance(score, dict) and score.get("contradiction_flagged")
                else "None flagged"
            ),
        ),
    ]
    summary_rows.extend(_photo_finding_rows(score if isinstance(score, dict) else None))

    if isinstance(score, dict) and score.get("upcycle_plan"):
        summary_rows.append(
            ("Upcycling / Responsible Retirement Plan", _format_upcycle_plan(score.get("upcycle_plan")))
        )

    label_font = Font(name="Calibri", size=10, bold=True, color=_DARK_OLIVE)
    row_cursor = 4
    for field_name, field_value in summary_rows:
        c1 = report.cell(row=row_cursor, column=1, value=field_name)
        c2 = report.cell(row=row_cursor, column=2, value=str(field_value))
        c1.font = label_font
        c1.fill = group_fill
        c1.border = _CELL_BORDER
        c2.font = data_font
        c2.fill = data_fill
        c2.border = _CELL_BORDER
        c2.alignment = Alignment(wrap_text=True, vertical="top")
        row_cursor += 1

    # Checklist table
    row_cursor += 1
    checklist_headers = ["Category", "Checklist Item", "Status", "Severity", "Reason"]
    for idx, title in enumerate(checklist_headers, start=1):
        cell = report.cell(row=row_cursor, column=idx, value=title)
        cell.fill = header_fill
        cell.font = header_font
        cell.border = _CELL_BORDER
        cell.alignment = Alignment(horizontal="center", vertical="center")
    row_cursor += 1

    checklist_items = _extract_checklist(score)
    red_fill = PatternFill(start_color=_RED_TINT, end_color=_RED_TINT, fill_type="solid")
    if checklist_items:
        for item in checklist_items:
            passed = bool(item.get("passed"))
            severity = str(item.get("severity") or "none")
            vals = [
                str(item.get("category") or ""),
                str(item.get("label") or item.get("key") or ""),
                "PASS" if passed else "FAIL",
                severity,
                str(item.get("reason") or ""),
            ]
            for idx, val in enumerate(vals, start=1):
                cell = report.cell(row=row_cursor, column=idx, value=val)
                cell.font = data_font
                cell.border = _CELL_BORDER
                cell.alignment = Alignment(
                    horizontal="center" if idx in (1, 3, 4) else "left",
                    vertical="top",
                    wrap_text=True,
                )
                if idx == 3:
                    if passed:
                        cell.fill = ok_fill
                    elif severity == "hard_gate":
                        cell.fill = red_fill
                    else:
                        cell.fill = warn_fill
            row_cursor += 1
    else:
        empty_cell = report.cell(
            row=row_cursor,
            column=1,
            value="No vision checklist recorded yet. Run scoring to populate pass/fail items.",
        )
        empty_cell.font = Font(name="Calibri", size=10, italic=True, color=_MID_OLIVE)

    report.column_dimensions["A"].width = 36
    report.column_dimensions["B"].width = 34
    report.column_dimensions["C"].width = 14
    report.column_dimensions["D"].width = 14
    report.column_dimensions["E"].width = 56

    output = io.BytesIO()
    wb.save(output)
    return output.getvalue()


export_session_xlsx = build_checklist_workbook_bytes
