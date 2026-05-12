"""Build a self-contained interactive HTML table (admin + viewer) for the
wolves dataset.

Reads:    wolves_data.xlsx  (sheet 'נתוני זיהוי זאבים (2)')
Writes:   data_table.html

The page has two modes:
    - Viewer (default)  : read-only table, search/filter/sort, CSV/XLSX export.
    - Admin (password)  : click-to-edit cells, add/delete rows, save back to
                          a downloaded wolves_data.xlsx.

The admin password is a soft client-side gate (SHA-256 hashed in the page).
It prevents accidental edits, not determined attackers.
"""

from __future__ import annotations

import base64
import hashlib
import json
import sys
from pathlib import Path

import pandas as pd

from wolf_lib import (
    INPUT_FILE,
    OUTPUT_DIR,
    SHEET_NAME,
    REGIONS,
    process_all_regions,
    identification_buckets,
    ID_BUCKET_ORDER,
)
from step1d_dataqc import run_checks

OUT_PATH = OUTPUT_DIR / "data_table.html"
PASSWORD = "112358"
SCHEMATIC_PATH = OUTPUT_DIR / "assets" / "wolf_schematic.jpg"
DEFINITIONS_TABLE_PATH = OUTPUT_DIR / "assets" / "region_definitions_table.jpg"
CLAUDE_QUESTIONS_PATH = OUTPUT_DIR / "claude_questions.json"
DATA_DECISIONS_PATH = OUTPUT_DIR / "data_decisions.json"

# Anatomical metadata (mirrors step3_build_app.py — keep in sync).
GROUP_COLORS = {"A": "#E91E63", "B": "#42A5F5", "C": "#FF7043", "D": "#9C27B0"}
GROUP_NAMES = {
    "A": "Cheek (A1, A2)",
    "B": "Periocular (B3, B4, B5)",
    "C": "Nasal (C6, C7)",
    "D": "Nape (D8, D9)",
}
REGION_GROUP = {
    "A1": "A", "A2": "A",
    "B3": "B", "B4": "B", "B5": "B",
    "C6": "C", "C7": "C",
    "D8": "D", "D9": "D",
}
REGION_NAMES = {
    "A1": "Infraorbital patch",
    "A2": "Malar (eye–ear) stripe",
    "B3": "Below eye",
    "B4": "Upper outer eye",
    "B5": "Upper inner eye (near nasal bridge)",
    "C6": "Central nasal stripe",
    "C7": "Lateral nasal (side region)",
    "D8": "Upper nape",
    "D9": "Side nape",
}
REGION_DESCRIPTIONS = {
    "A1": "Light/dark patch below the eye on the cheek",
    "A2": "Stripe extending from eye toward ear",
    "B3": "Lower periocular region",
    "B4": "Outer upper eye region",
    "B5": "Inner upper eye region near nasal bridge",
    "C6": "Stripe along bridge of nose",
    "C7": "Lateral nasal areas",
    "D8": "Upper neck behind head",
    "D9": "Lateral neck region",
}
REGION_VARIATION = {
    "A1": "Shape, size, contrast",
    "A2": "Presence, thickness, continuity",
    "B3": "Contrast, extent",
    "B4": "Shape, shading",
    "B5": "Shape, contrast",
    "C6": "Width, continuity",
    "C7": "Color contrast, extent",
    "D8": "Color tone, patterning",
    "D9": "Pattern, contrast",
}

# Identification-bucket palette (mirror of step3_build_app.py)
ID_BUCKET_COLORS = {
    "Unique (1)":         "#1B5E20",
    "Shared 2-3":         "#66BB6A",
    "Shared 4-6":         "#C5E1A5",
    "Shared 7-10":        "#FFF176",
    "Shared 11-20":       "#FFB74D",
    "Shared 21-35":       "#F57C00",
    "Shared 36+":         "#6D4C41",
    "Asymmetric":         "#1E88E5",
    "Partial-ambiguous":  "#9E9E9E",
    "P":                  "#FB8C00",
    "N":                  "#E53935",
    "Empty":              "#000000",
}

# Status (per region cell) palette — used for in-cell badges
STATUS_COLORS = {
    "unambiguous":        "#43A047",
    "asymmetric":         "#1E88E5",
    "partial_ambiguous":  "#9E9E9E",
    "P":                  "#FB8C00",
    "N":                  "#E53935",
    "empty":              "#757575",
    "unknown":            "#9C27B0",
}
STATUS_LABELS = {
    "unambiguous":        "Full",
    "asymmetric":         "Asymmetric",
    "partial_ambiguous":  "Partial",
    "P":                  "P (unclear)",
    "N":                  "N (not visible)",
    "empty":              "Empty",
    "unknown":            "Unknown",
}

# ---------------------------------------------------------------------------
# Category metadata for the issue-review UI.
#
# Each category_id (the slug used by step1d_dataqc.Findings) is mapped to a
# small spec the JS uses to render appropriate action buttons.
#
# action_kinds:
#   "edit_cell"      — instruct the user to click a target cell and edit
#   "auto_set"       — one-click button to set a target column to a fixed value
#                      (e.g. trim whitespace, set gender '?' to blank)
#   "bulk_replace"   — replace one value with another in a column across rows
#   "add_to_allowed" — extend an enumeration to include a new value
# ---------------------------------------------------------------------------

CATEGORY_META = {
    "code_present_but_pictures_0": {
        "title": "code present but #pictures = 0",
        "kind": "row",
        "target_column": "#pictures",
        "hint": "This wolf has a code but #pictures = 0 — likely a typo. Edit #pictures to the real count.",
    },
    "code_is_empty_but_pictures_0": {
        "title": "code empty but #pictures > 0",
        "kind": "row",
        "target_column": "code",
        "hint": "Pictures exist but code is blank. Either fill in the code or set #pictures back to 0.",
    },
    "code_concat_a1_a2_b3_b4_b5_c6_c7_d8_d9": {
        "title": "code ≠ A1_A2_…_D9",
        "kind": "row",
        "target_column": "code",
        "hint": "The 'code' string doesn't match A1..D9 joined with '_'. Decide which is canonical.",
        "row_actions": [
            {"id": "set_code_from_regions", "label": "Replace code with concatenated regions"},
        ],
    },
    "time_on_camera_unparseable": {
        "title": "time on camera unparseable",
        "kind": "row",
        "target_column": "time on camera",
        "hint": "Doesn't match dd.mm.yy / d-d.mm.yy / d.m-d.m.yy / dd.mm.yy-dd.mm.yy / m.yyyy. Edit to a recognised format.",
    },
    "seen_with_references_unknown_wolf": {
        "title": "seen with references unknown wolf",
        "kind": "row",
        "target_column": "seen with",
        "hint": "Token doesn't match a serial in this sheet. Either fix the reference or add the missing wolf as a new row.",
    },
    "seen_with_non_comma_separator": {
        "title": "seen with: non-comma separator",
        "kind": "row",
        "target_column": "seen with",
        "hint": "The separator should be ','. Replace '/', '+', '|', etc. with commas.",
    },
    "duplicate_serial_number": {
        "title": "duplicate serial number",
        "kind": "row",
        "target_column": "serial number",
        "hint": "This serial appears more than once. Rename one or merge.",
    },
    "whitespace_in_serial_number": {
        "title": "whitespace in serial",
        "kind": "row",
        "target_column": "serial number",
        "hint": "Leading/trailing whitespace will silently break matches. Trim it.",
        "row_actions": [
            {"id": "trim_cell", "label": "Auto-trim this cell"},
        ],
    },
    "string_hygiene_whitespace_tabs": {
        "title": "trailing whitespace / tabs",
        "kind": "bulk",
        "bulk_label": "Trim all flagged cells",
        "hint": "All cells listed have leading/trailing whitespace, tabs or newlines. Safe to trim in bulk.",
    },
    "polygon_name_casing_inconsistency": {
        "title": "polygon name casing",
        "kind": "bulk",
        "bulk_label": "Apply chosen casing to all rows",
        "hint": "Same polygon spelled with different cases. Pick the canonical spelling per polygon.",
    },
    "gender_not_in_m_f_blank": {
        "title": "gender not in {m, f, blank}",
        "kind": "row",
        "target_column": "gender",
        "hint": "You said: blank when uncertain. '?' looks like 'uncertain'. One-click sets to blank.",
        "row_actions": [
            {"id": "set_cell_blank", "label": "Set to blank"},
        ],
    },
    "social_dynamic_out_of_pack_group_unknown": {
        "title": "social dynamic outside {pack, group, unknown}",
        "kind": "policy",
        "hint": "23 rows say 'lone' (and 1 'pack*'). Decide once: accept as new categories or rename.",
        "policy_actions": [
            {"id": "accept_lone", "label": "Accept 'lone' as a 4th allowed value"},
            {"id": "accept_packstar", "label": "Accept 'pack*' as a 5th allowed value"},
            {"id": "rename_lone_to_unknown", "label": "Rename all 'lone' → 'unknown'"},
            {"id": "rename_packstar_to_pack", "label": "Rename 'pack*' → 'pack'"},
        ],
    },
    "cams_spotted_camera_id_outside_1_60": {
        "title": "camera ID out of range",
        "kind": "row",
        "target_column": "cams_spotted",
        "hint": "Cameras must be 1-60. Check what was meant.",
    },
    "cams_spotted_non_comma_separator": {
        "title": "cams_spotted non-comma separator",
        "kind": "row",
        "target_column": "cams_spotted",
        "hint": "Use commas only.",
    },
    "cams_spotted_non_numeric_token": {
        "title": "cams_spotted contains non-numeric token (likely an observer name)",
        "kind": "policy",
        "hint": "12 rows have observer names ('omer weiner', 'ariel shamir', …) instead of camera IDs — these wolves were reported without camera traps.",
        "policy_actions": [
            {"id": "move_observers_to_new_column", "label": "Add a 'reporter' column and move observer names there"},
            {"id": "keep_as_is", "label": "Keep names mixed in cams_spotted (no separation)"},
        ],
    },
    "main_poligon_not_in_area": {
        "title": "main poligon not listed in area",
        "kind": "row",
        "target_column": "area",
        "hint": "Add the main polygon to 'area' or correct one of them.",
    },
    "non_numeric_in_picture_count_column": {
        "title": "non-numeric in count column",
        "kind": "row",
        "target_column": "#pictures",
        "hint": "Picture count columns must be integers.",
    },
    "picture_count_sum_mismatch": {
        "title": "picture count sum mismatch",
        "kind": "row",
        "target_column": "#pictures",
        "hint": "#right + #left + #front + #no good ≠ #pictures. Fix one to make them agree.",
    },
    "rows_with_empty_serial_number": {
        "title": "row with empty serial",
        "kind": "row",
        "target_column": "serial number",
        "hint": "Trailing empty row at the end of the sheet — usually safe to keep, you can also delete it.",
    },
    "pack_name_vs_diverge": {
        "title": "'pack name' ≠ 'שיוך'",
        "kind": "info_only",
        "hint": "You asked to ignore both columns for now — listed here only for visibility.",
    },
    "missing_main_poligon_in_analysis_pool": {
        "title": "missing main poligon (analysis pool)",
        "kind": "row",
        "target_column": "main poligon",
        "hint": "Wolf is in the analysis pool but has no main polygon (likely an observer-reported wolf without GPS).",
    },
    "missing_social_dynamic_in_analysis_pool": {
        "title": "missing social dynamic",
        "kind": "row",
        "target_column": "social dynamic",
        "hint": "Wolf is analysed but has no social dynamic value.",
    },
    "missing_area_in_analysis_pool": {
        "title": "missing area",
        "kind": "row",
        "target_column": "area",
        "hint": "Wolf is analysed but has no area value.",
    },
    "missing_cams_spotted_in_analysis_pool": {
        "title": "missing cams_spotted",
        "kind": "row",
        "target_column": "cams_spotted",
        "hint": "Wolf is analysed but has no cams_spotted value.",
    },
    "missing_time_on_camera_in_analysis_pool": {
        "title": "missing time on camera",
        "kind": "row",
        "target_column": "time on camera",
        "hint": "Wolf is analysed but has no time on camera value.",
    },
    "more_cameras_than_pictures": {
        "title": "more cameras than pictures",
        "kind": "row",
        "target_column": "#pictures",
        "hint": "More distinct cameras listed than #pictures — sanity check.",
    },
    "unusual_character_in_region_cell": {
        "title": "unusual character in region cell",
        "kind": "row",
        "target_column": None,  # The 'region' field tells us which one
        "hint": "Region cell contains a character outside [a-z0-9NPRL].",
    },
}


def build_issues_payload(findings, df) -> dict:
    """Convert Findings into a UI-ready issue tree."""
    serial_to_idx = {}
    for idx, val in df["serial number"].items():
        if pd.notna(val):
            serial_to_idx[str(val).strip()] = int(idx)

    categories = []
    for severity in ("errors", "warnings", "info"):
        for item in getattr(findings, severity):
            cat_id = item["category_id"]
            meta = CATEGORY_META.get(cat_id, {
                "title": item["category"],
                "kind": "row",
                "target_column": None,
                "hint": "",
            })
            issues = []
            for r in item["rows"]:
                # Resolve row index (admin UI uses original sheet row index)
                anchor_serial = r.get("serial") or r.get("from_serial")
                if isinstance(anchor_serial, str):
                    anchor_serial = anchor_serial.strip()
                row_index = r.get("row_index")
                if row_index is None and anchor_serial in serial_to_idx:
                    row_index = serial_to_idx[anchor_serial]

                target_col = meta.get("target_column") or r.get("region") or r.get("col")

                issues.append({
                    "id": r["_id"],
                    "row_index": row_index,
                    "serial": str(anchor_serial) if anchor_serial else "",
                    "target_column": target_col,
                    "details": {k: v for k, v in r.items() if k != "_id"},
                })
            categories.append({
                "category_id": cat_id,
                "title": meta.get("title", item["category"]),
                "severity": severity,
                "kind": meta.get("kind", "row"),
                "hint": meta.get("hint", ""),
                "description": item["description"],
                "row_actions": meta.get("row_actions", []),
                "policy_actions": meta.get("policy_actions", []),
                "bulk_label": meta.get("bulk_label"),
                "issues": issues,
            })
    return {
        "categories": categories,
        "totals": {
            "errors_categories": len(findings.errors),
            "warnings_categories": len(findings.warnings),
            "info_categories": len(findings.info),
            "total_rows": sum(len(it["rows"]) for it in findings.errors + findings.warnings + findings.info),
        },
    }


def _encode_image_b64(path: Path) -> tuple[str, str]:
    """Return (data-uri-prefix, base64-string) for an image file. Empty string if missing."""
    if not path.exists():
        return ("", "")
    suffix = path.suffix.lower().lstrip(".")
    mime = {"jpg": "jpeg", "jpeg": "jpeg", "png": "png", "gif": "gif", "webp": "webp"}.get(suffix, "octet-stream")
    b64 = base64.b64encode(path.read_bytes()).decode("ascii")
    return (f"data:image/{mime};base64,", b64)


def _load_json_or(path: Path, default):
    """Read a JSON file if present; return `default` otherwise. Silent on absence."""
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        print(f"  WARN: {path.name} unreadable ({e}); using empty default", file=sys.stderr)
        return default


def build_claude_questions_payload(df) -> list:
    """Resolve every Claude question to a row_index (when serial-anchored) for the UI."""
    serial_to_idx: dict[str, int] = {}
    for idx, val in df["serial number"].items():
        if pd.notna(val):
            serial_to_idx[str(val).strip()] = int(idx)
    raw = _load_json_or(CLAUDE_QUESTIONS_PATH, {"questions": []})
    out: list[dict] = []
    for q in raw.get("questions", []):
        serial = q.get("serial") or ""
        row_index = serial_to_idx.get(str(serial).strip()) if serial else None
        out.append({
            "id": q.get("id", ""),
            "kind": q.get("kind", "general"),
            "serial": str(serial) if serial else "",
            "target_column": q.get("target_column"),
            "question": q.get("question", ""),
            "evidence": q.get("evidence"),
            "severity_hint": q.get("severity_hint", "info"),
            "row_index": row_index,
        })
    return out


def load_prefilled_decisions() -> dict:
    """Read data_decisions.json's `decisions` map. Returns {} if absent or malformed."""
    raw = _load_json_or(DATA_DECISIONS_PATH, {"decisions": {}})
    decs = raw.get("decisions") or {}
    if not isinstance(decs, dict):
        return {}
    return decs


def main() -> None:
    if not INPUT_FILE.exists():
        raise SystemExit(f"Source not found: {INPUT_FILE}")

    df = pd.read_excel(INPUT_FILE, sheet_name=SHEET_NAME)
    df.columns = [str(c).strip() for c in df.columns]

    # ----- Compute per-region status using wolf_lib (only on the analysis pool) -----
    df_pool = df[df["code"].notna()].copy()
    processed = process_all_regions(df_pool)
    # Map: original sheet row index -> {region: status_string}
    status_by_row: dict[int, dict[str, str]] = {}
    for idx in processed.index:
        per_region: dict[str, str] = {}
        for region in REGIONS:
            status = processed.at[idx, f"{region}_status"]
            per_region[region] = "empty" if pd.isna(status) else str(status)
        status_by_row[int(idx)] = per_region

    # ----- Per-region identification-bucket distributions for the chart -----
    bucket_dist: dict[str, dict[str, int]] = {}
    for region in REGIONS:
        bucket_dist[region] = {k: int(v) for k, v in identification_buckets(processed, region).items()}

    # ----- Per-region (code, count) lists — used to drill down on click -----
    codes_per_region: dict[str, list[dict]] = {}
    for region in REGIONS:
        status_col = f"{region}_status"
        cleaned_col = f"{region}_cleaned"
        unambig = processed[processed[status_col] == "unambiguous"]
        code_counts = unambig[cleaned_col].value_counts()
        codes_per_region[region] = [
            {"code": str(code), "count": int(count)}
            for code, count in code_counts.items()
        ]

    # ----- Build per-row records -----
    rows: list[dict] = []
    for idx, row in df.iterrows():
        record = {"_row_index": int(idx)}
        for col, val in row.items():
            if pd.isna(val):
                record[col] = ""
            elif isinstance(val, (int, float)):
                record[col] = (
                    int(val) if isinstance(val, (int, float)) and float(val).is_integer()
                    else float(val)
                )
            else:
                record[col] = str(val)
        # Attach per-region status so the JS can highlight cells & filter rows.
        record["_status"] = status_by_row.get(int(idx), {r: "empty" for r in REGIONS})
        rows.append(record)

    columns = list(df.columns)
    n_visible = int(df["code"].notna().sum()) if "code" in df.columns else len(df)

    pwd_hash = hashlib.sha256(PASSWORD.encode("utf-8")).hexdigest()
    xlsx_b64 = base64.b64encode(INPUT_FILE.read_bytes()).decode("ascii")
    schematic_prefix, schematic_b64 = _encode_image_b64(SCHEMATIC_PATH)
    deftable_prefix, deftable_b64 = _encode_image_b64(DEFINITIONS_TABLE_PATH)

    findings = run_checks(df)
    issues_payload = build_issues_payload(findings, df)
    claude_questions = build_claude_questions_payload(df)
    prefilled_decisions = load_prefilled_decisions()

    # Anatomy / region metadata for the JS side
    anatomy = {
        "regions": REGIONS,
        "region_group": REGION_GROUP,
        "group_colors": GROUP_COLORS,
        "group_names": GROUP_NAMES,
        "region_names": REGION_NAMES,
        "region_descriptions": REGION_DESCRIPTIONS,
        "region_variation": REGION_VARIATION,
        "status_colors": STATUS_COLORS,
        "status_labels": STATUS_LABELS,
        "id_bucket_order": ID_BUCKET_ORDER,
        "id_bucket_colors": ID_BUCKET_COLORS,
        "bucket_dist": bucket_dist,
        "codes_per_region": codes_per_region,
    }

    payload = {
        "rows": rows,
        "columns": columns,
        "sheet_name": SHEET_NAME,
        "n_total_rows": len(df),
        "n_visible_default": n_visible,
        "n_pool": len(df_pool),
        "build_iso": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M"),
        "issues": issues_payload,
        "claude_questions": claude_questions,
        "prefilled_decisions": prefilled_decisions,
        "anatomy": anatomy,
    }

    payload_json = json.dumps(payload, ensure_ascii=False, default=str)
    payload_json = payload_json.replace("</", "<\\/")

    html = HTML_TEMPLATE
    html = html.replace("__PWD_HASH__", pwd_hash)
    html = html.replace("__XLSX_BASE64__", xlsx_b64)
    html = html.replace("__SCHEMATIC_SRC__", (schematic_prefix + schematic_b64) if schematic_b64 else "")
    html = html.replace("__DEFTABLE_SRC__", (deftable_prefix + deftable_b64) if deftable_b64 else "")
    html = html.replace("__PAYLOAD_JSON__", payload_json)

    OUT_PATH.write_text(html, encoding="utf-8")
    size_kb = len(html.encode("utf-8")) / 1024
    print(f"  wrote: {OUT_PATH}")
    print(f"  size : {size_kb:.1f} KB  ({len(rows)} rows × {len(columns)} cols)")
    print(f"  pool : {len(df_pool)} wolves processed for status / buckets")
    print(f"  imgs : schematic={'yes' if schematic_b64 else 'MISSING'}  "
          f"deftable={'yes' if deftable_b64 else 'MISSING'}")
    print(f"  issues: {issues_payload['totals']['errors_categories']}E / "
          f"{issues_payload['totals']['warnings_categories']}W / "
          f"{issues_payload['totals']['info_categories']}I categories, "
          f"{issues_payload['totals']['total_rows']} flagged")
    print(f"  claude: {len(claude_questions)} authored questions, "
          f"{len(prefilled_decisions)} pre-filled decisions from data_decisions.json")


HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Wolves Data — Interactive Table</title>
<link href="https://unpkg.com/tabulator-tables@5.5.2/dist/css/tabulator_simple.min.css" rel="stylesheet">
<script src="https://unpkg.com/tabulator-tables@5.5.2/dist/js/tabulator.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
<script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
         margin: 0; padding: 14px; background: #f3f5f8; color: #2c3e50; }
  header { background: #fff; padding: 14px 18px; border-radius: 10px;
           box-shadow: 0 2px 8px rgba(0,0,0,0.06); margin-bottom: 10px; }
  .topline { display: flex; justify-content: space-between; align-items: flex-start;
             gap: 12px; flex-wrap: wrap; }
  h1 { margin: 0 0 6px; font-size: 18px; font-weight: 700; }
  h1 .mode-badge { font-size: 12px; padding: 2px 8px; border-radius: 5px;
                   margin-left: 8px; font-weight: 600; }
  .mode-viewer { background: #e3f2fd; color: #1565c0; }
  .mode-admin  { background: #fff3e0; color: #e65100; }
  .stats { display: flex; gap: 8px; font-size: 12px; color: #555; flex-wrap: wrap; }
  .stat { background: #eef2f6; padding: 3px 9px; border-radius: 5px; }
  .stat strong { color: #111; }
  .legend { display: flex; gap: 6px; font-size: 11px; flex-wrap: wrap;
            align-items: center; margin-top: 8px; }
  .legend strong { font-size: 11px; color: #444; margin-right: 4px; }
  .legend span { padding: 2px 8px; border-radius: 4px; color: white; font-weight: 600; font-size: 11px; }
  .controls { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 10px; }
  .controls input[type="text"] { padding: 6px 10px; border: 1px solid #ccc; border-radius: 6px;
                                 font-size: 13px; min-width: 220px; }
  .controls label { font-size: 12px; color: #555; display: inline-flex; align-items: center;
                    gap: 4px; padding: 4px 8px; background: #f5f5f5; border-radius: 5px; }
  .controls button { padding: 6px 12px; border: 1px solid #ccc; background: #fff; border-radius: 6px;
                     cursor: pointer; font-size: 12px; font-weight: 500; }
  .controls button:hover { background: #eef; }
  .btn-primary { background: #2563eb !important; color: #fff !important; border-color: #2563eb !important; }
  .btn-primary:hover { background: #1d4ed8 !important; }
  .btn-warn { background: #ef6c00 !important; color: #fff !important; border-color: #ef6c00 !important; }
  .btn-danger { background: #dc2626 !important; color: #fff !important; border-color: #dc2626 !important; }
  .admin-bar, .save-bar { padding: 9px 14px; border-radius: 8px; margin-bottom: 8px;
                          display: none; align-items: center; justify-content: space-between;
                          font-size: 13px; gap: 10px; flex-wrap: wrap; }
  .admin-bar.show, .save-bar.show { display: flex; }
  .admin-bar { background: #fff8e1; border: 1px solid #fbc02d; }
  .save-bar  { background: #e8f5e9; border: 1px solid #43a047; }

  #data-table { background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
  .footer { font-size: 11.5px; color: #777; margin-top: 10px; padding: 8px 14px;
            background: #fff; border-radius: 6px; line-height: 1.5; }

  /* Anatomical region tinting */
  .tabulator .tabulator-cell.cell-A { background: rgba(233,30,99,0.08) !important; }
  .tabulator .tabulator-cell.cell-B { background: rgba(66,165,245,0.08) !important; }
  .tabulator .tabulator-cell.cell-C { background: rgba(255,112,67,0.08) !important; }
  .tabulator .tabulator-cell.cell-D { background: rgba(156,39,176,0.08) !important; }
  .tabulator .tabulator-col.col-A { background: rgba(233,30,99,0.18) !important; }
  .tabulator .tabulator-col.col-B { background: rgba(66,165,245,0.18) !important; }
  .tabulator .tabulator-col.col-C { background: rgba(255,112,67,0.18) !important; }
  .tabulator .tabulator-col.col-D { background: rgba(156,39,176,0.18) !important; }

  .tabulator { font-size: 12.5px; }
  .tabulator-row.row-empty-code { background: #fffde7 !important; }

  /* Status filter chips */
  .status-filter-bar {
    background: #fff; padding: 8px 14px; border-radius: 8px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.04); margin-bottom: 10px;
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  }
  .status-filter-bar .label { font-size: 12px; color: #555; font-weight: 600; margin-right: 4px; }
  .status-chip {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 10px; border-radius: 14px; font-size: 12px;
    cursor: pointer; user-select: none; border: 2px solid transparent;
    background: #f0f0f0; color: #333; font-weight: 500; transition: all 0.15s;
  }
  .status-chip:hover { transform: translateY(-1px); }
  .status-chip.active { color: white; }
  .status-chip .dot {
    width: 10px; height: 10px; border-radius: 50%; display: inline-block;
  }
  .status-chip .count {
    background: rgba(255,255,255,0.35); padding: 1px 6px; border-radius: 8px;
    font-size: 10.5px; font-weight: 700; margin-left: 2px;
  }
  .status-chip:not(.active) .count { background: rgba(0,0,0,0.08); color: #555; }

  /* Status badges inside region cells (admin or hover only) */
  .tabulator .tabulator-cell.region-cell { position: relative; }
  .tabulator .tabulator-cell.region-cell::before {
    content: ""; position: absolute; left: 2px; top: 50%; transform: translateY(-50%);
    width: 4px; height: 70%; border-radius: 2px;
  }
  .tabulator .tabulator-cell.status-unambiguous::before { background: #43A047; }
  .tabulator .tabulator-cell.status-asymmetric::before { background: #1E88E5; }
  .tabulator .tabulator-cell.status-partial_ambiguous::before { background: #9E9E9E; }
  .tabulator .tabulator-cell.status-P::before { background: #FB8C00; }
  .tabulator .tabulator-cell.status-N::before { background: #E53935; }
  .tabulator .tabulator-cell.status-empty::before { background: #BDBDBD; }
  .tabulator .tabulator-cell.region-cell { padding-left: 10px !important; }

  /* Sections below the table */
  .section {
    background: #fff; padding: 18px 22px; border-radius: 10px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.06); margin-top: 16px;
  }
  .section h2 {
    margin: 0 0 6px; font-size: 18px; font-weight: 700; color: #1a1a1a;
    border-bottom: 2px solid #f0f0f0; padding-bottom: 8px; display: flex;
    align-items: center; gap: 10px;
  }
  .section h2 .swatch {
    display: inline-block; width: 14px; height: 14px; border-radius: 3px;
    background: linear-gradient(90deg, #E91E63, #42A5F5, #FF7043, #9C27B0);
  }
  .section .section-sub {
    color: #666; font-size: 12.5px; margin-bottom: 12px; line-height: 1.5;
  }

  /* Anatomy reference layout */
  .anatomy-grid {
    display: grid; gap: 18px;
    grid-template-columns: minmax(320px, 1fr) minmax(380px, 1.2fr);
  }
  @media (max-width: 980px) {
    .anatomy-grid { grid-template-columns: 1fr; }
  }
  .anatomy-grid img {
    width: 100%; height: auto; border-radius: 8px; border: 1px solid #eee;
    background: #fafafa;
  }
  .region-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .region-table th, .region-table td {
    padding: 6px 8px; text-align: left; border-bottom: 1px solid #eee;
  }
  .region-table th { background: #fafbfc; font-weight: 600; color: #444; font-size: 11.5px; }
  .region-table .group-cell { font-weight: 700; }
  .region-table tr:hover { background: #f8fafc; }
  .region-key { display: inline-flex; align-items: center; gap: 4px; }
  .region-key .pill {
    width: 10px; height: 10px; border-radius: 50%; display: inline-block;
  }

  /* Plotly chart container */
  #region-distribution-chart { width: 100%; height: 480px; min-height: 380px; }

  /* Codes drill-down modal */
  #codes-modal .modal { min-width: min(520px, 90vw); max-width: 90vw; max-height: 80vh; overflow-y: auto; }
  .codes-group { margin: 14px 0; padding: 10px 12px; border: 1px solid #e0e0e0;
                  border-radius: 8px; background: #fafbfc; }
  .codes-group .header { font-weight: 700; font-size: 13px; margin-bottom: 8px;
                          color: #333; display: flex; justify-content: space-between; }
  .codes-group .codes-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .codes-group .codes-list code { background: #fff; padding: 4px 10px; border-radius: 5px;
                                    border: 1px solid #ddd; font-family: 'SF Mono', Consolas, monospace;
                                    font-size: 12.5px; }

  /* ----- Mobile-responsive layout ----- */
  @media (max-width: 768px) {
    body { padding: 8px; }
    header { padding: 10px 12px; }
    h1 { font-size: 15px; }
    h1 .mode-badge { font-size: 10px; padding: 1px 6px; }
    .stats { gap: 5px; font-size: 11px; }
    .stat { padding: 2px 7px; }
    .legend { font-size: 10px; gap: 4px; }
    .legend strong { font-size: 10px; }
    .legend span { padding: 1px 6px; font-size: 10px; }
    .controls { gap: 5px; margin-top: 8px; }
    .controls input[type="text"] { min-width: 100%; flex: 1; padding: 5px 8px; font-size: 12px; }
    .controls button, .controls label { font-size: 11px; padding: 4px 8px; }
    .status-filter-bar {
      padding: 6px 10px; gap: 5px;
      flex-direction: column; align-items: flex-start;
    }
    .status-filter-bar .label { font-size: 11px; margin-right: 0; }
    .status-chip { font-size: 11px; padding: 3px 8px; }
    .status-chip .count { font-size: 9.5px; padding: 0 5px; }
    .status-filter-bar > button { align-self: stretch; }
    .anatomy-grid { grid-template-columns: 1fr; gap: 12px; }
    .anatomy-grid img { max-width: 100%; }
    .region-table th, .region-table td { padding: 4px 6px; font-size: 11.5px; }
    .region-table th:nth-child(4), .region-table td:nth-child(4) { display: none; } /* hide description col */
    #region-distribution-chart { height: 420px; min-height: 320px; }
    .section { padding: 12px 14px; }
    .section h2 { font-size: 15px; }
    .section .section-sub { font-size: 11.5px; }
    /* Issue panel covers full width on mobile when shown */
    body.with-issue-panel { padding-right: 8px; }
    .issue-panel { width: 100%; box-shadow: none; border-top: 2px solid #f57c00; }
    .footer { font-size: 10.5px; padding: 6px 10px; }
    .tabulator { font-size: 11.5px; }
  }
  @media (max-width: 480px) {
    h1 { font-size: 13px; }
    .legend { display: none; }   /* save space — colours visible in chart anyway */
    .topline > div:last-child { width: 100%; }
    #admin-login-btn { width: 100%; padding: 6px !important; }
  }

  /* Issue review panel (admin-only) */
  body.with-issue-panel { padding-right: 380px; transition: padding-right 0.2s; }
  .issue-panel { position: fixed; top: 0; right: 0; bottom: 0; width: 364px;
                 background: #fff; box-shadow: -4px 0 14px rgba(0,0,0,0.10);
                 z-index: 50; display: none; flex-direction: column; overflow: hidden;
                 font-size: 13px; }
  .issue-panel.show { display: flex; }
  .ip-header { padding: 12px 14px; background: linear-gradient(135deg, #fff8e1 0%, #ffecb3 100%);
               border-bottom: 1px solid #ddd; display: flex; align-items: center;
               justify-content: space-between; }
  .ip-header h3 { margin: 0; font-size: 14px; font-weight: 700; }
  .ip-header .close-btn { background: none; border: none; font-size: 18px; cursor: pointer;
                          padding: 2px 6px; color: #555; }
  .ip-progress { padding: 6px 14px; font-size: 11.5px; color: #555;
                 background: #fafbfc; border-bottom: 1px solid #eee; display: flex; gap: 10px; }
  .ip-progress strong { color: #111; }
  .ip-list { flex: 1; overflow-y: auto; padding: 6px 0; }
  .ip-cat { border-bottom: 1px solid #eee; }
  .ip-cat-header { padding: 8px 14px; cursor: pointer; display: flex; align-items: center;
                   gap: 6px; user-select: none; font-weight: 600; font-size: 12.5px;
                   background: #fafbfc; }
  .ip-cat-header:hover { background: #f0f4f8; }
  .ip-cat-header .arrow { display: inline-block; width: 12px; transition: transform 0.15s; }
  .ip-cat.open .ip-cat-header .arrow { transform: rotate(90deg); }
  .ip-cat-header .count { margin-left: auto; padding: 1px 8px; border-radius: 10px;
                          font-size: 11px; background: #e0e0e0; color: #444; font-weight: 600; }
  .ip-cat.sev-errors .ip-cat-header .count { background: #ef9a9a; color: #b71c1c; }
  .ip-cat.sev-warnings .ip-cat-header .count { background: #ffe082; color: #e65100; }
  .ip-cat.sev-info .ip-cat-header .count { background: #e0e0e0; color: #555; }
  .ip-cat-body { display: none; padding: 4px 0 8px; }
  .ip-cat.open .ip-cat-body { display: block; }
  .ip-hint { padding: 4px 14px 8px; font-size: 11.5px; color: #666; line-height: 1.45; }
  .ip-actions { padding: 4px 14px; display: flex; gap: 6px; flex-wrap: wrap; }
  .ip-actions button { padding: 4px 8px; border: 1px solid #aaa; background: #fff;
                       border-radius: 5px; cursor: pointer; font-size: 11.5px; }
  .ip-actions button:hover { background: #f0f4f8; }
  .ip-actions button.primary { background: #2563eb; color: #fff; border-color: #2563eb; }
  .ip-actions button.primary:hover { background: #1d4ed8; }
  .ip-issue { padding: 4px 14px 4px 28px; cursor: pointer; display: flex;
              justify-content: space-between; align-items: center; font-size: 12px;
              border-left: 3px solid transparent; }
  .ip-issue:hover { background: #f5f7fa; }
  .ip-issue.active { background: #fff8e1; border-left-color: #f57c00; font-weight: 600; }
  .ip-issue.resolved { color: #999; text-decoration: line-through; }
  .ip-issue .ip-issue-key { font-family: monospace; }
  .ip-issue .ip-issue-state { font-size: 10px; color: #888; }
  .ip-active-card { padding: 12px 14px; background: #fff8e1; border-top: 2px solid #f57c00;
                    display: none; max-height: 55vh; overflow-y: auto;
                    flex-shrink: 0; }
  .ip-active-card.show { display: block; }
  .ip-active-card::-webkit-scrollbar { width: 10px; }
  .ip-active-card::-webkit-scrollbar-thumb { background: rgba(245, 124, 0, 0.4); border-radius: 5px; }
  .ip-active-card::-webkit-scrollbar-thumb:hover { background: rgba(245, 124, 0, 0.7); }
  .ip-active-card .ip-active-title { font-weight: 700; font-size: 13px; margin-bottom: 6px; }
  .ip-active-card .ip-active-detail { font-size: 11.5px; color: #555; line-height: 1.45;
                                       margin-bottom: 8px; }
  .ip-active-card .ip-active-detail code { background: #fffde7; padding: 1px 4px;
                                            border-radius: 3px; font-size: 11px; }
  .ip-nav { display: flex; gap: 6px; padding: 6px 14px; border-top: 1px solid #eee;
            background: #fafbfc; }
  .ip-nav button { flex: 1; padding: 5px; font-size: 11.5px; cursor: pointer;
                   border: 1px solid #aaa; background: #fff; border-radius: 5px; }

  /* Cell decoration for flagged cells */
  .tabulator .tabulator-cell.cell-issue-error { box-shadow: inset 0 0 0 2px #d32f2f; }
  .tabulator .tabulator-cell.cell-issue-warning { box-shadow: inset 0 0 0 2px #f9a825; }
  .tabulator .tabulator-cell.cell-issue-info { box-shadow: inset 0 0 0 2px #90a4ae; }
  .tabulator .tabulator-cell.cell-issue-active { box-shadow: inset 0 0 0 3px #f57c00, 0 0 0 2px #f57c00; }
  .tabulator-row.row-issue-active { background: #fff8e1 !important; }

  /* Fix & Clarify mode — admin-only additions to issue panel */
  .ip-header-actions { display: flex; gap: 4px; align-items: center; }
  .ip-header-actions button {
    background: rgba(255,255,255,0.7); border: 1px solid rgba(0,0,0,0.08);
    cursor: pointer; padding: 3px 8px; border-radius: 4px; font-size: 13px;
    line-height: 1;
  }
  .ip-header-actions button:hover { background: #fff; }

  .ip-panel-tabs {
    display: flex; gap: 3px; padding: 5px 8px; background: #f5f7fa;
    border-bottom: 1px solid #eee;
  }
  .ip-tab {
    flex: 1; padding: 4px 6px; background: transparent; border: 0;
    font-size: 11px; cursor: pointer; border-radius: 4px;
    color: #555; font-weight: 500; text-align: center;
    display: inline-flex; align-items: center; justify-content: center; gap: 3px;
  }
  .ip-tab:hover { background: #fff; }
  .ip-tab.active {
    background: #fff; color: #111; box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    font-weight: 600;
  }
  .ip-tab-count {
    font-size: 10px; padding: 1px 5px; border-radius: 8px;
    background: rgba(0,0,0,0.08); font-weight: 600;
  }
  .ip-tab.active .ip-tab-count { background: #2563eb; color: #fff; }

  /* Claude-questions category gets a distinct teal accent */
  .ip-cat.sev-claude .ip-cat-header { background: linear-gradient(90deg, #e0f7fa 0%, #fafbfc 60%); }
  .ip-cat.sev-claude .ip-cat-header .count { background: #80deea; color: #006064; }

  /* Status pill — next to side-list items and active-card title */
  .ip-status-pill {
    display: inline-block; padding: 1px 7px; border-radius: 8px;
    font-size: 10px; font-weight: 700; color: #fff;
    margin-left: 4px; vertical-align: middle; letter-spacing: 0.2px;
  }
  .ip-status-pill.status-open          { background: #9e9e9e; }
  .ip-status-pill.status-answered      { background: #43a047; }
  .ip-status-pill.status-decided_keep  { background: #2563eb; }
  .ip-status-pill.status-fixed_in_xlsx { background: #7e57c2; }
  .ip-status-pill.status-needs_more_data { background: #ef6c00; }

  /* Clarification block in active card */
  .ip-clarification {
    margin-top: 10px; padding-top: 10px; border-top: 1px dashed #e0c97f;
  }
  .ip-clarification-row {
    display: flex; align-items: center; gap: 6px; margin-bottom: 6px;
    font-size: 11.5px; flex-wrap: wrap;
  }
  .ip-clarification-row label {
    color: #555; font-weight: 600;
  }
  .ip-status-select {
    padding: 3px 6px; border: 1px solid #c0a878; border-radius: 4px;
    background: #fff; font-size: 11.5px; cursor: pointer;
  }
  .ip-updated {
    color: #888; font-size: 10.5px; margin-left: auto; font-style: italic;
  }
  .ip-comment {
    width: 100%; padding: 6px 8px; border: 1px solid #c0a878;
    border-radius: 5px; font-family: inherit; font-size: 12px;
    resize: vertical; min-height: 56px; max-height: 180px; box-sizing: border-box;
    background: #fffef7; line-height: 1.45;
  }
  .ip-comment:focus { outline: 1px solid #f57c00; border-color: #f57c00; }
  .ip-save-flash {
    display: inline-block; margin-left: 6px; color: #43a047;
    font-size: 11px; font-weight: 600; opacity: 0; transition: opacity 0.18s;
  }
  .ip-save-flash.show { opacity: 1; }

  /* Question prose inside Claude category items */
  .ip-question-text {
    background: #f1f8e9; border-left: 3px solid #689f38;
    padding: 6px 9px; margin: 6px 0; font-size: 12px; line-height: 1.45;
    color: #2c3e50; border-radius: 3px;
  }
  .ip-question-evidence {
    font-size: 11px; color: #555; margin-top: 4px;
    background: #fafbfc; padding: 4px 8px; border-radius: 3px;
    font-family: 'SF Mono', Consolas, monospace;
  }

  /* Local-sync status pill (top-right of header) */
  .sync-pill {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 11px; border-radius: 12px;
    font-size: 11.5px; font-weight: 600; cursor: pointer;
    background: #f5f5f5; color: #757575; user-select: none;
    transition: all 0.15s; border: 1px solid transparent;
    max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .sync-pill::before {
    content: ""; width: 8px; height: 8px; border-radius: 50%;
    background: currentColor; opacity: 0.85; flex-shrink: 0;
  }
  .sync-pill.sync-saved      { background: #e8f5e9; color: #2e7d32; border-color: #a5d6a7; }
  .sync-pill.sync-saving     { background: #fff8e1; color: #ef6c00; border-color: #ffd54f; }
  .sync-pill.sync-pipeline   { background: #e3f2fd; color: #1565c0; border-color: #90caf9; }
  .sync-pill.sync-error      { background: #ffebee; color: #c62828; border-color: #ef9a9a; }
  .sync-pill.sync-offline    { background: #f5f5f5; color: #757575; border-color: #e0e0e0; }
  .sync-pill.sync-connected  { background: #e0f7fa; color: #006064; border-color: #80deea; }
  .sync-pill:hover           { transform: translateY(-1px); box-shadow: 0 2px 5px rgba(0,0,0,0.08); }

  /* Error toast for sync failures */
  .sync-toast {
    position: fixed; top: 16px; right: 16px; z-index: 2000;
    background: #ffebee; color: #b71c1c; border: 1px solid #ef9a9a;
    padding: 10px 14px; border-radius: 8px; max-width: 360px;
    font-size: 12.5px; line-height: 1.45; box-shadow: 0 4px 14px rgba(0,0,0,0.15);
    display: none;
  }
  .sync-toast.show { display: block; }
  .sync-toast .close { float: right; cursor: pointer; margin-left: 10px; font-weight: 700; }

  /* Login modal */
  .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: none;
              align-items: center; justify-content: center; z-index: 1000; }
  .modal-bg.show { display: flex; }
  .modal { background: #fff; padding: 22px 26px; border-radius: 10px; min-width: 320px;
           box-shadow: 0 10px 28px rgba(0,0,0,0.22); }
  .modal h2 { margin: 0 0 12px; font-size: 16px; }
  .modal input { width: 100%; padding: 8px 10px; font-size: 14px; border: 1px solid #ccc;
                 border-radius: 6px; margin-bottom: 6px; }
  .modal-buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
  #pwd-error { color: #dc2626; font-size: 12px; min-height: 16px; margin-bottom: 4px; }
</style>
</head>
<body>

<header>
  <div class="topline">
    <div>
      <h1>Wolves Data — Interactive Table <span id="mode-badge" class="mode-badge mode-viewer">VIEWER</span></h1>
      <div class="stats">
        <div class="stat">total rows: <strong id="stat-total">0</strong></div>
        <div class="stat">visible: <strong id="stat-visible">0</strong></div>
        <div class="stat">last refresh: <strong id="stat-build">—</strong></div>
      </div>
      <div class="legend">
        <strong>Region groups:</strong>
        <span style="background:#E91E63;">A — muzzle (A1, A2)</span>
        <span style="background:#42A5F5;">B — eye (B3, B4, B5)</span>
        <span style="background:#FF7043;">C — nose/chin (C6, C7)</span>
        <span style="background:#9C27B0;">D — head side (D8, D9)</span>
      </div>
    </div>
    <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
      <div id="sync-pill" class="sync-pill sync-offline" title="Local sync status — click for details">starting…</div>
      <button id="admin-login-btn" class="btn-warn" style="padding: 8px 14px; font-size: 13px;">
        🔒 Admin login
      </button>
    </div>
  </div>
  <div class="controls">
    <input type="text" id="search-input" placeholder="Search across all columns…" />
    <label><input type="checkbox" id="show-empty-code" /> show wolves with no code</label>
    <label><input type="checkbox" id="show-status-bars" checked /> region status badges</label>
    <div id="col-toggle-wrap" style="position:relative; display:inline-block;">
      <button id="col-toggle-btn" type="button">Columns ▼</button>
      <div id="col-toggle-menu" style="display:none; position:absolute; top:100%; left:0; margin-top:4px;
            background:#fff; border:1px solid #ccc; border-radius:6px; padding:8px;
            box-shadow:0 4px 12px rgba(0,0,0,0.15); z-index:200; min-width:220px; max-height:60vh; overflow:auto;">
        <div style="display:flex; gap:6px; margin-bottom:6px; padding-bottom:6px; border-bottom:1px solid #eee;">
          <button type="button" id="col-show-all" style="font-size:11px; padding:3px 8px;">Show all</button>
          <button type="button" id="col-hide-all" style="font-size:11px; padding:3px 8px;">Hide all</button>
        </div>
        <div id="col-toggle-list"></div>
      </div>
    </div>
    <button id="export-csv">⬇ CSV</button>
    <button id="export-xlsx">⬇ XLSX (data only)</button>
    <button id="reset-filters">Reset filters</button>
  </div>
</header>

<div class="status-filter-bar" id="status-filter-bar">
  <span class="label">Filter by region status (any of 9 regions):</span>
  <span class="status-chip" data-status="unambiguous"   style="--c:#43A047;"><span class="dot" style="background:#43A047;"></span>Full <span class="count" id="cnt-unambiguous">0</span></span>
  <span class="status-chip" data-status="asymmetric"    style="--c:#1E88E5;"><span class="dot" style="background:#1E88E5;"></span>Asymmetric <span class="count" id="cnt-asymmetric">0</span></span>
  <span class="status-chip" data-status="partial_ambiguous" style="--c:#9E9E9E;"><span class="dot" style="background:#9E9E9E;"></span>Partial <span class="count" id="cnt-partial_ambiguous">0</span></span>
  <span class="status-chip" data-status="P"             style="--c:#FB8C00;"><span class="dot" style="background:#FB8C00;"></span>P (unclear) <span class="count" id="cnt-P">0</span></span>
  <span class="status-chip" data-status="N"             style="--c:#E53935;"><span class="dot" style="background:#E53935;"></span>N (not visible) <span class="count" id="cnt-N">0</span></span>
  <span style="flex:1;"></span>
  <button id="status-clear" style="padding:4px 10px; font-size:11.5px;">Clear status filter</button>
</div>

<div id="admin-bar" class="admin-bar">
  <div><strong>Admin mode active</strong> — click any cell to edit, press <kbd>Enter</kbd> or click outside to commit. <span id="admin-bar-hint" style="color:#6d4c41;"></span></div>
  <div style="display:flex; gap:6px; flex-wrap:wrap;">
    <button id="save-table-btn" class="btn-primary" title="Save every table edit to wolves_data.xlsx right now">
      💾 Save table edits <span id="save-table-count"></span>
    </button>
    <button id="review-issues-btn">⚠ Review issues (<span id="review-count">0</span>)</button>
    <button id="add-row-btn">＋ Add row</button>
    <button id="logout-btn">Logout</button>
  </div>
</div>

<aside id="issue-panel" class="issue-panel">
  <div class="ip-header">
    <h3>Fix &amp; Clarify</h3>
    <div class="ip-header-actions">
      <button id="ip-download" title="Download all answers as data_decisions.json">💾</button>
      <button id="ip-load" title="Load saved answers from a JSON file">📥</button>
      <button class="close-btn" id="ip-close" title="Close">×</button>
    </div>
  </div>
  <input type="file" id="ip-load-file" accept=".json" style="display:none">
  <div class="ip-panel-tabs">
    <button class="ip-tab active" data-mode="all">All <span class="ip-tab-count" id="ip-tab-count-all">0</span></button>
    <button class="ip-tab" data-mode="needs_reply">Needs reply <span class="ip-tab-count" id="ip-tab-count-needs_reply">0</span></button>
    <button class="ip-tab" data-mode="answered">Answered <span class="ip-tab-count" id="ip-tab-count-answered">0</span></button>
    <button class="ip-tab" data-mode="resolved">Resolved <span class="ip-tab-count" id="ip-tab-count-resolved">0</span></button>
  </div>
  <div class="ip-progress" id="ip-progress">
    <span title="Distinct decisions left (Claude questions + QC categories with open items)">
      <strong id="ip-decisions-remaining">0</strong> decisions remaining
    </span>
    <span title="Items where you've left a comment or set a status"><strong id="ip-answered">0</strong> answered</span>
    <span title="Total individual items"><strong id="ip-items-total">0</strong> items</span>
  </div>
  <div class="ip-list" id="ip-list"></div>
  <div class="ip-active-card" id="ip-active-card">
    <div class="ip-active-title" id="ip-active-title">—</div>
    <div class="ip-active-detail" id="ip-active-detail">—</div>
    <div class="ip-clarification" id="ip-clarification">
      <div class="ip-clarification-row">
        <label for="ip-status-select">Status:</label>
        <select id="ip-status-select" class="ip-status-select">
          <option value="open">Open</option>
          <option value="answered">Answered</option>
          <option value="decided_keep">Decided to keep</option>
          <option value="fixed_in_xlsx">Fixed in xlsx</option>
          <option value="needs_more_data">Need more data</option>
        </select>
        <span class="ip-updated" id="ip-updated">—</span>
      </div>
      <textarea id="ip-comment" class="ip-comment"
                placeholder="Your reply / clarification… (saved on blur)"
                dir="auto" rows="3"></textarea>
      <span class="ip-save-flash" id="ip-save-flash">✓ saved</span>
    </div>
    <div class="ip-actions" id="ip-active-actions"></div>
  </div>
  <div class="ip-nav">
    <button id="ip-prev">◀ Prev</button>
    <button id="ip-next">Next ▶</button>
  </div>
</aside>

<div id="save-bar" class="save-bar">
  <div><span id="dirty-summary">No unsaved changes</span></div>
  <div style="display:flex; gap:6px;">
    <button id="discard-btn" class="btn-danger">Discard</button>
    <button id="save-btn" class="btn-primary">💾 Save → download wolves_data.xlsx</button>
  </div>
</div>

<div id="data-table"></div>

<!-- ============= Anatomy reference ============= -->
<div class="section" id="anatomy-section">
  <h2><span class="swatch"></span>Anatomy reference</h2>
  <div class="section-sub">
    Each wolf's pelt is encoded across 9 regions, grouped into 4 anatomical zones.
    Codes within a region capture the morphological variation noted in the rightmost column.
    Click a region row to highlight it in the schematic.
  </div>
  <div class="anatomy-grid">
    <div>
      <img src="__SCHEMATIC_SRC__" alt="Wolf head schematic — A, B, C, D regions" />
    </div>
    <div>
      <table class="region-table" id="region-ref-table">
        <thead>
          <tr>
            <th>Region</th><th>Group</th><th>Region name</th>
            <th>Anatomical description</th><th>Variation encoded</th>
          </tr>
        </thead>
        <tbody><!-- populated by JS --></tbody>
      </table>
    </div>
  </div>
</div>

<!-- ============= Per-region status distribution chart ============= -->
<div class="section" id="distribution-section">
  <h2><span class="swatch"></span>Per-region identification breakdown</h2>
  <div class="section-sub">
    Each column represents one region. Each bar holds 100% of the analysed wolves
    (n = <span id="dist-n">0</span>), partitioned into identification-power buckets:
    <strong>Unique</strong> = wolves whose code in this region appears in no other wolf;
    <strong>Shared 2-3 → 36+</strong> = a heat-map of how widely a code is reused
    (lighter = uncommon, darker brown = dominates the population);
    <strong>Asymmetric</strong> / <strong>Partial</strong> / <strong>P</strong> /
    <strong>N</strong> = non-resolvable categories.
    Hover any segment for exact counts. Use Plotly's camera icon to download as PNG.
  </div>
  <div id="region-distribution-chart"></div>
</div>

<div class="footer">
  <strong>About this page:</strong>
  Read-only by default. The Admin login (password protected) lets the data owner edit cells in the browser.
  Edits don't change the file on the server — clicking <em>Save</em> downloads an updated <code>wolves_data.xlsx</code>
  which the owner places back in the project folder. Running <code>update.bat</code> then refreshes all
  analyses and rebuilds this page.
  <br>
  <em>Security note:</em> the admin password is a soft client-side gate. It prevents accidental edits, not determined viewers.
  All data on this page is visible to anyone who can open it (this is by design — the table is meant to be shared).
</div>

<div id="pwd-modal" class="modal-bg">
  <div class="modal">
    <h2>Admin login</h2>
    <input type="password" id="pwd-input" placeholder="Password" autocomplete="off" />
    <div id="pwd-error">&nbsp;</div>
    <div class="modal-buttons">
      <button id="pwd-cancel">Cancel</button>
      <button id="pwd-submit" class="btn-primary">Login</button>
    </div>
  </div>
</div>

<div id="sync-toast" class="sync-toast">
  <span class="close" onclick="document.getElementById('sync-toast').classList.remove('show')">×</span>
  <strong>Sync error:</strong> <span id="sync-toast-msg">—</span>
</div>

<div id="codes-modal" class="modal-bg">
  <div class="modal">
    <h2 id="codes-modal-title">Codes</h2>
    <div id="codes-modal-body" style="font-size:13px; color:#555;"></div>
    <div class="modal-buttons">
      <button id="codes-modal-close" class="btn-primary">Close</button>
    </div>
  </div>
</div>

<script>
const PAYLOAD = __PAYLOAD_JSON__;
const PWD_HASH = "__PWD_HASH__";
const XLSX_BASE64 = "__XLSX_BASE64__";
const STORAGE_KEY = "wolves_data_table_edits_v1";

const REGION_GROUP = {
  "A1": "A", "A2": "A",
  "B3": "B", "B4": "B", "B5": "B",
  "C6": "C", "C7": "C",
  "D8": "D", "D9": "D",
};
const NUMERIC_COLS = new Set(["#sights", "#right", "#left", "#front", "#no good", "#pictures"]);

let table = null;
let isAdmin = false;
let baselineRows = [];

const $ = (id) => document.getElementById(id);

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function rowKey(r, idx) { return r._id ?? `${r["serial number"] ?? ""}#${idx}`; }

// ============================================================================
// Local sync client — pushes every admin edit / clarification to a local
// Python server (sync_server.py) running on http://127.0.0.1:7869.
// If the server isn't running, every method is a no-op and the page falls
// back to the existing localStorage + manual download path.
// ============================================================================
const SYNC_BASE = "http://127.0.0.1:7869";
let syncActive = false;           // server reachable?
let syncLastSavedAt = null;       // Date of last successful POST
let syncStatusTimer = null;       // /api/status polling timer
let syncProbeTimer = null;        // periodic re-probe when offline

function fmtClock(d) {
  return d ? d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}) : "—";
}

function setSyncPill(state, text, tooltip) {
  const pill = document.getElementById("sync-pill");
  if (!pill) return;
  pill.className = `sync-pill sync-${state}`;
  pill.textContent = text;
  if (tooltip) pill.title = tooltip;
  // Update the admin-bar hint to match the current sync state
  const hint = document.getElementById("admin-bar-hint");
  if (hint) {
    if (state === "connected" || state === "saved" || state === "saving" || state === "pipeline") {
      hint.textContent = "Each edit auto-syncs to disk. The Save button below force-saves the entire table.";
    } else {
      hint.textContent = "(sync server offline — your edits stay in this browser; click Save to download an xlsx).";
    }
  }
}

function syncToast(msg) {
  const toast = document.getElementById("sync-toast");
  const ms = document.getElementById("sync-toast-msg");
  if (!toast || !ms) return;
  ms.textContent = msg;
  toast.classList.add("show");
  // Auto-hide after 8s
  clearTimeout(syncToast._t);
  syncToast._t = setTimeout(() => toast.classList.remove("show"), 8000);
}

async function syncProbe() {
  // Quick ping. Use AbortController for a 1s timeout (works on older browsers).
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1200);
    const r = await fetch(SYNC_BASE + "/api/ping", { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    if (!r.ok) throw new Error("non-200");
    const body = await r.json();
    if (!body.ok) throw new Error("server says not ok");
    syncActive = true;
    setSyncPill("connected", "Sync: connected", "Local sync server detected at " + SYNC_BASE);
    // Begin status polling
    if (!syncStatusTimer) syncStatusTimer = setInterval(syncPollStatus, 3000);
    // Cancel periodic re-probe (we're connected)
    if (syncProbeTimer) { clearInterval(syncProbeTimer); syncProbeTimer = null; }
    syncPollStatus();
    return true;
  } catch (e) {
    syncActive = false;
    setSyncPill("offline", "Sync: offline (local cache)",
      "Sync server is not running. Edits will still save to your browser; double-click start_sync.bat to enable live sync.");
    if (syncStatusTimer) { clearInterval(syncStatusTimer); syncStatusTimer = null; }
    // Periodically retry while offline
    if (!syncProbeTimer) syncProbeTimer = setInterval(() => syncProbe(), 8000);
    return false;
  }
}

async function syncPollStatus() {
  if (!syncActive) return;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch(SYNC_BASE + "/api/status", { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    if (!r.ok) throw new Error("non-200");
    const body = await r.json();
    const p = body.pipeline || {};
    if (p.running) {
      setSyncPill("pipeline", "Sync: pipeline running…",
        "QC pipeline rerunning after your save.");
    } else if (p.ok === false) {
      const stderr = (p.stderr_tail || "").slice(-300);
      setSyncPill("error", "Sync: pipeline failed (click)",
        "QC pipeline failed. Click for details.");
      const pill = document.getElementById("sync-pill");
      if (pill) pill.onclick = () => alert("Pipeline error tail:\n\n" + (stderr || "(no detail)"));
    } else if (syncLastSavedAt) {
      setSyncPill("saved", `Sync: synced ${fmtClock(syncLastSavedAt)}`,
        `Server in sync. Decisions: ${body.decisions_count}.`);
    } else {
      setSyncPill("connected", "Sync: connected",
        `Server in sync. Decisions: ${body.decisions_count}. Pipeline last ran: ${p.ended_at || "—"}.`);
    }
  } catch (e) {
    // Server went away; revert to offline.
    syncActive = false;
    setSyncPill("offline", "Sync: offline (local cache)",
      "Lost connection to sync server. Edits still save to browser.");
    syncToast("Lost connection to local sync server. Edits saved to browser cache. Start sync_server.bat to re-enable.");
    if (syncStatusTimer) { clearInterval(syncStatusTimer); syncStatusTimer = null; }
    if (!syncProbeTimer) syncProbeTimer = setInterval(() => syncProbe(), 8000);
  }
}

async function syncPost(endpoint, payload) {
  if (!syncActive) return { ok: false, offline: true };
  setSyncPill("saving", "Sync: saving…", "Saving to disk and queuing pipeline.");
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(SYNC_BASE + endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const body = await r.json().catch(() => ({}));
    if (!r.ok || !body.ok) {
      const errmsg = body.error || `HTTP ${r.status}`;
      setSyncPill("error", "Sync: save failed (click)",
        "Save error: " + errmsg + ". Click for details.");
      const pill = document.getElementById("sync-pill");
      if (pill) pill.onclick = () => alert("Save error on " + endpoint + ":\n\n" + errmsg);
      syncToast("Save error: " + errmsg);
      return body;
    }
    syncLastSavedAt = new Date();
    setSyncPill("saved", `Sync: synced ${fmtClock(syncLastSavedAt)}`, "Saved to disk.");
    return body;
  } catch (e) {
    setSyncPill("error", "Sync: network error",
      "Network error talking to sync server. Edit saved to browser.");
    syncToast("Sync server unreachable: " + e.message + ". Edits remain in local cache; re-save once server is up.");
    syncActive = false;
    if (syncStatusTimer) { clearInterval(syncStatusTimer); syncStatusTimer = null; }
    if (!syncProbeTimer) syncProbeTimer = setInterval(() => syncProbe(), 8000);
    return { ok: false, error: e.message };
  }
}

// Debouncer for bulk xlsx pushes — multiple rapid cell edits become one POST.
let _syncBulkTimer = null;
function syncPushXlsxBulkDebounced() {
  if (!syncActive || !table) return;
  if (_syncBulkTimer) clearTimeout(_syncBulkTimer);
  _syncBulkTimer = setTimeout(() => {
    const rows = table.getData().map(r => {
      const copy = {};
      for (const c of PAYLOAD.columns) copy[c] = r[c] ?? "";
      return copy;
    });
    syncPost("/api/save_xlsx_bulk", { rows, columns: PAYLOAD.columns });
  }, 700);
}

function syncPushDecision(id, dec) {
  if (!syncActive) return;
  syncPost("/api/save_decisions", { decisions: { [id]: dec } });
}

function buildColumns() {
  return PAYLOAD.columns.map((name, i) => {
    const grp = REGION_GROUP[name];
    const col = {
      title: name,
      field: name,
      // Per-column header filter on every column except 'code' (per user request).
      headerFilter: name === "code" ? false : "input",
      headerSort: true,
      resizable: true,
      editor: isAdmin ? (NUMERIC_COLS.has(name) ? "number" : "input") : false,
    };
    if (i === 0) {
      col.frozen = true;
      col.width = 110;
    }
    if (grp) {
      // Region columns get a status-coloured left bar via cellFormatter.
      col.cssClass = `cell-${grp}`;
      col.headerCssClass = `col-${grp}`;
      col.width = 92;
      col.formatter = function(cell) {
        const data = cell.getRow().getData();
        const cellEl = cell.getElement();
        const status = (data._status && data._status[name]) || "empty";
        // Reset and apply status class
        cellEl.classList.remove(
          "region-cell",
          "status-unambiguous", "status-asymmetric", "status-partial_ambiguous",
          "status-P", "status-N", "status-empty", "status-unknown"
        );
        if (window._showStatusBars !== false) {
          cellEl.classList.add("region-cell", "status-" + status);
        }
        cellEl.title = `${PAYLOAD.anatomy.region_names[name] || name}\nStatus: ${PAYLOAD.anatomy.status_labels[status] || status}`;
        const v = cell.getValue();
        return v == null || v === "" ? "" : String(v);
      };
    } else if (name === "notes") {
      col.formatter = "textarea";
      col.width = 240;
    } else if (name === "code") {
      col.width = 240;
      col.tooltip = (e, cell) => String(cell.getValue() ?? "");
    } else if (NUMERIC_COLS.has(name)) {
      col.width = 80;
      col.hozAlign = "right";
    }
    return col;
  });
}

function rowFormatter(row) {
  const data = row.getData();
  if (!data["code"] || data["code"] === "") row.getElement().classList.add("row-empty-code");
  else row.getElement().classList.remove("row-empty-code");
}

function applyFilters() {
  if (!table) return;
  const showEmpty = isAdmin || $("show-empty-code").checked;
  const q = ($("search-input").value || "").trim().toLowerCase();
  const activeStatuses = window._activeStatuses || new Set();
  table.setFilter(row => {
    if (!showEmpty) {
      const code = row["code"];
      if (code === undefined || code === null || code === "") return false;
    }
    if (activeStatuses.size > 0) {
      // Row passes if ANY of its 9 region statuses is in the active set.
      const st = row._status || {};
      let any = false;
      for (const r of PAYLOAD.anatomy.regions) {
        if (activeStatuses.has(st[r])) { any = true; break; }
      }
      if (!any) return false;
    }
    if (q) {
      for (const c of PAYLOAD.columns) {
        const v = row[c];
        if (v != null && String(v).toLowerCase().includes(q)) return true;
      }
      return false;
    }
    return true;
  });
}

function refreshStats() {
  if (!table) return;
  $("stat-visible").textContent = table.getDataCount("active");
}

function setMode(adminOn) {
  isAdmin = adminOn;
  $("mode-badge").textContent = adminOn ? "ADMIN" : "VIEWER";
  $("mode-badge").className = "mode-badge " + (adminOn ? "mode-admin" : "mode-viewer");
  $("admin-bar").classList.toggle("show", adminOn);
  $("admin-login-btn").style.display = adminOn ? "none" : "";
  if (!adminOn) toggleIssuePanel(false);
  // Rebuild table to swap editor states
  rebuildTable();
}

function rebuildTable() {
  const currentData = table ? table.getData() : JSON.parse(JSON.stringify(PAYLOAD.rows));
  if (table) table.destroy();
  table = new Tabulator("#data-table", {
    data: currentData,
    columns: buildColumns(),
    layout: "fitDataStretch",
    height: "calc(100vh - 280px)",
    movableColumns: true,
    rowFormatter: rowFormatter,
    cellEdited: () => onChange(),
    cellClick: (e, cell) => focusIssueFromCell(cell),
    rowAdded: () => onChange(),
    rowDeleted: () => onChange(),
    dataFiltered: () => { refreshStats(); if (isAdmin) applyCellBadges(); },
  });
  table.on("tableBuilt", () => {
    applyFilters();
    refreshStats();
    if (isAdmin && typeof applyCellBadges === "function") applyCellBadges();
  });
}

function onChange() {
  const data = table.getData();
  const diffs = countDiffs(data);
  // Only persist to localStorage when there are ACTUAL unsaved edits — otherwise
  // the popup "Found unsaved edits…" fires on every page load because tableBuilt
  // calls onChange() with the pristine baseline.
  try {
    if (diffs > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    else localStorage.removeItem(STORAGE_KEY);
  } catch (e) {}
  $("save-bar").classList.toggle("show", diffs > 0);
  $("dirty-summary").textContent = diffs === 0 ? "No unsaved changes" :
        `${diffs} unsaved change${diffs === 1 ? "" : "s"}`;
  // Live counter on the admin-bar Save button
  const sb = $("save-table-count");
  if (sb) sb.textContent = diffs > 0 ? `(${diffs} pending)` : "";
  // Re-validate issues against current data
  if (typeof renderIssuePanel === "function" && isAdmin) renderIssuePanel();
  // Refresh status-chip counts (depends on _status — only changes if user edits a region cell;
  // we don't recompute statuses live, but at least the chips reflect filter effects).
  if (typeof refreshStatusChipCounts === "function") refreshStatusChipCounts();
}

// Force-save: pushes the ENTIRE current table state to disk via the sync server,
// catching anything that the per-cell sync may have missed (e.g. edits made while
// the server was offline, or cells whose `cellEdited` event didn't fire).
async function saveTableNow() {
  if (!table) return;
  const btn = $("save-table-btn");
  const origLabel = btn ? btn.innerHTML : "";
  if (btn) { btn.disabled = true; btn.innerHTML = "💾 Saving…"; }
  try {
    if (syncActive) {
      const rows = table.getData().map(r => {
        const copy = {};
        for (const c of PAYLOAD.columns) copy[c] = r[c] ?? "";
        return copy;
      });
      const result = await syncPost("/api/save_xlsx_bulk", { rows, columns: PAYLOAD.columns });
      if (result && result.ok) {
        // Re-baseline so countDiffs returns 0 — we just saved everything to disk.
        baselineRows = JSON.parse(JSON.stringify(rows));
        try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
        $("save-bar").classList.remove("show");
        $("dirty-summary").textContent = "No unsaved changes";
        if (btn) btn.innerHTML = "✓ Saved to disk";
        setTimeout(() => { if (btn) btn.innerHTML = origLabel; }, 1500);
        onChange();
      } else if (btn) {
        btn.innerHTML = "✗ Save failed";
        setTimeout(() => { btn.innerHTML = origLabel; }, 2500);
      }
    } else {
      // Offline → fall back to the original download flow.
      await saveAsXlsx();
      if (btn) btn.innerHTML = origLabel;
    }
  } catch (e) {
    if (btn) btn.innerHTML = origLabel;
    syncToast("Save failed: " + e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function countDiffs(currentData) {
  if (currentData.length !== baselineRows.length) {
    return Math.abs(currentData.length - baselineRows.length) + countCellDiffs(currentData);
  }
  return countCellDiffs(currentData);
}

function countCellDiffs(currentData) {
  let n = 0;
  const minLen = Math.min(currentData.length, baselineRows.length);
  for (let i = 0; i < minLen; i++) {
    const a = currentData[i], b = baselineRows[i];
    for (const c of PAYLOAD.columns) {
      if (String(a[c] ?? "") !== String(b[c] ?? "")) { n++; break; }
    }
  }
  return n;
}

function discardChanges() {
  if (!confirm("Discard all unsaved edits? This cannot be undone.")) return;
  localStorage.removeItem(STORAGE_KEY);
  table.replaceData(JSON.parse(JSON.stringify(PAYLOAD.rows)));
  $("save-bar").classList.remove("show");
}

async function saveAsXlsx() {
  // Decode the original embedded XLSX so we preserve the other sheets
  const binStr = atob(XLSX_BASE64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
  const wb = XLSX.read(bytes, { type: "array" });

  // Replace sheet (2) with current edited data
  const data = table.getData();
  const sheetRows = data.map(r => {
    const out = {};
    for (const col of PAYLOAD.columns) {
      const v = r[col];
      if (v === "" || v === null || v === undefined) out[col] = null;
      else out[col] = v;
    }
    return out;
  });
  const newSheet = XLSX.utils.json_to_sheet(sheetRows, { header: PAYLOAD.columns });
  wb.Sheets[PAYLOAD.sheet_name] = newSheet;

  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "wolves_data.xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  alert("File downloaded as wolves_data.xlsx.\n\nNext steps:\n1. Move the file into the project folder (replacing the current one).\n2. Run update.bat to refresh the analyses.\n3. The dashboard and this table will both rebuild.");
}

// ============================================================================
// Region reference table + status filter chips + per-region distribution chart
// ============================================================================

window._activeStatuses = new Set();
window._showStatusBars = true;

function populateRegionRefTable() {
  const tbody = document.querySelector("#region-ref-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const A = PAYLOAD.anatomy;
  for (const r of A.regions) {
    const grp = A.region_group[r];
    const tr = document.createElement("tr");
    tr.dataset.region = r;
    tr.innerHTML = `
      <td><span class="region-key"><span class="pill" style="background:${A.group_colors[grp]};"></span>${r}</span></td>
      <td class="group-cell" style="color:${A.group_colors[grp]};">${A.group_names[grp]}</td>
      <td>${escapeHtml(A.region_names[r] || "")}</td>
      <td style="color:#555;">${escapeHtml(A.region_descriptions[r] || "")}</td>
      <td style="color:#444;font-style:italic;">${escapeHtml(A.region_variation[r] || "")}</td>
    `;
    tr.addEventListener("click", () => {
      // Scroll the table to the column for this region
      try { table.scrollToColumn(r, "middle", true); } catch (e) {}
      // Also flash a header highlight
      document.querySelectorAll(".region-table tr").forEach(x => x.style.background = "");
      tr.style.background = "#fff8e1";
      setTimeout(() => { tr.style.background = ""; }, 1200);
    });
    tbody.appendChild(tr);
  }
}

function refreshStatusChipCounts() {
  // Count rows where AT LEAST ONE of the 9 regions has the given status.
  const counts = {
    unambiguous: 0, asymmetric: 0, partial_ambiguous: 0,
    P: 0, N: 0, empty: 0,
  };
  if (!table) return counts;
  const data = table.getData();
  for (const row of data) {
    const st = row._status || {};
    const seen = new Set();
    for (const r of PAYLOAD.anatomy.regions) {
      const s = st[r];
      if (s && !seen.has(s)) seen.add(s);
    }
    for (const s of seen) {
      if (counts[s] !== undefined) counts[s]++;
    }
  }
  for (const k of Object.keys(counts)) {
    const el = document.getElementById("cnt-" + k);
    if (el) el.textContent = counts[k];
  }
  return counts;
}

function setupStatusChips() {
  const chips = document.querySelectorAll(".status-chip");
  chips.forEach(chip => {
    chip.addEventListener("click", () => {
      const s = chip.dataset.status;
      if (window._activeStatuses.has(s)) {
        window._activeStatuses.delete(s);
        chip.classList.remove("active");
        chip.style.background = "";
        chip.style.borderColor = "transparent";
      } else {
        window._activeStatuses.add(s);
        chip.classList.add("active");
        chip.style.background = chip.style.getPropertyValue("--c");
        chip.style.borderColor = chip.style.getPropertyValue("--c");
      }
      applyFilters();
    });
  });
  $("status-clear").addEventListener("click", () => {
    window._activeStatuses.clear();
    chips.forEach(c => {
      c.classList.remove("active");
      c.style.background = "";
      c.style.borderColor = "transparent";
    });
    applyFilters();
  });
}

function setupStatusBarsToggle() {
  const cb = $("show-status-bars");
  if (!cb) return;
  cb.addEventListener("change", () => {
    window._showStatusBars = cb.checked;
    table.redraw(true);
  });
}

// Bucket → count range, used both for click-to-drill-down and labelling
const BUCKET_COUNT_RANGES = {
  "Unique (1)":   [1, 1],
  "Shared 2-3":   [2, 3],
  "Shared 4-6":   [4, 6],
  "Shared 7-10":  [7, 10],
  "Shared 11-20": [11, 20],
  "Shared 21-35": [21, 35],
  "Shared 36+":   [36, 9999],
};
// Buckets that represent codes shared by multiple wolves (so a drill-down makes sense)
const DRILLDOWN_BUCKETS = new Set([
  "Shared 2-3", "Shared 4-6", "Shared 7-10",
  "Shared 11-20", "Shared 21-35", "Shared 36+",
]);

function renderRegionDistributionChart() {
  if (!window.Plotly) return;
  const A = PAYLOAD.anatomy;
  const regions = A.regions;
  const buckets = A.id_bucket_order;
  const colors = A.id_bucket_colors;
  const dist = A.bucket_dist;

  // Total per region (should all equal n_pool)
  const totals = {};
  for (const r of regions) {
    totals[r] = 0;
    for (const b of buckets) totals[r] += dist[r][b] || 0;
  }
  const nPool = totals[regions[0]] || PAYLOAD.n_pool || 0;
  const dn = document.getElementById("dist-n");
  if (dn) dn.textContent = nPool;

  // Helper: pick black or white text based on background luminance
  function textColorFor(bg) {
    const m = /^#([0-9a-f]{6})/i.exec(bg);
    if (!m) return "#000";
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
    const lum = 0.299*r + 0.587*g + 0.114*b;
    return lum > 165 ? "#222" : "#fff";
  }

  // One trace per bucket — labels appear only when segment >= 10%
  const traces = buckets.map(b => {
    const ys = regions.map(r => totals[r] ? (100 * (dist[r][b] || 0) / totals[r]) : 0);
    const counts = regions.map(r => dist[r][b] || 0);
    return {
      name: b,
      type: "bar",
      x: regions,
      y: ys,
      customdata: counts,
      // Show "12%" inside any segment >= 10%
      text: ys.map(y => y >= 10 ? `${y.toFixed(0)}%` : ""),
      textposition: "inside",
      insidetextanchor: "middle",
      textfont: { color: textColorFor(colors[b]), size: 11, family: "sans-serif" },
      cliponaxis: false,
      marker: { color: colors[b], line: { width: 0.5, color: "rgba(0,0,0,0.15)" } },
      hovertemplate:
        "<b>%{x}</b><br>" +
        b + ": %{y:.1f}%<br>" +
        "wolves: %{customdata}" +
        (DRILLDOWN_BUCKETS.has(b) ? "<br><i>click to see codes</i>" : "") +
        "<extra></extra>",
    };
  });

  // Region annotation: anatomical group colour bar above each x label
  const shapes = regions.map((r, i) => {
    const grp = A.region_group[r];
    return {
      type: "rect",
      xref: "x", yref: "paper",
      x0: i - 0.4, x1: i + 0.4, y0: 1.005, y1: 1.028,
      line: { width: 0 }, fillcolor: A.group_colors[grp],
    };
  });

  // Coloured x-axis tick labels using inline HTML (Plotly supports <span>)
  const ticktext = regions.map(r => {
    const grp = A.region_group[r];
    const c = A.group_colors[grp];
    return `<span style="color:${c}; font-weight:700;">${r}</span>`;
  });

  Plotly.newPlot("region-distribution-chart", traces, {
    barmode: "stack",
    bargap: 0.18,
    margin: { l: 56, r: 16, t: 36, b: 56 },
    yaxis: {
      title: { text: "% of analysed wolves", font: { size: 12 } },
      range: [0, 100], ticksuffix: "%", gridcolor: "#eee",
    },
    xaxis: {
      title: { text: "Region (anatomical group colour shown both above and on the label)", font: { size: 11, color: "#666" } },
      tickmode: "array",
      tickvals: regions,
      ticktext: ticktext,
      tickfont: { size: 13 },
    },
    legend: {
      orientation: "h", x: 0.5, xanchor: "center", y: -0.22,
      font: { size: 11 }, traceorder: "normal",
    },
    shapes: shapes,
    plot_bgcolor: "#fff", paper_bgcolor: "#fff",
  }, {
    displaylogo: false,
    toImageButtonOptions: {
      format: "png", filename: "wolf_region_distribution",
      height: 720, width: 1280, scale: 2,
    },
    modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"],
    responsive: true,
  });

  // Click-to-drill-down on Shared buckets
  const chartEl = document.getElementById("region-distribution-chart");
  chartEl.on("plotly_click", function(event) {
    if (!event || !event.points || !event.points.length) return;
    const p = event.points[0];
    const region = p.x;
    const bucket = p.data.name;
    if (!DRILLDOWN_BUCKETS.has(bucket)) return;
    showCodesForBucket(region, bucket);
  });
}

function showCodesForBucket(region, bucket) {
  const A = PAYLOAD.anatomy;
  const range = BUCKET_COUNT_RANGES[bucket];
  if (!range) return;
  const codes = A.codes_per_region[region] || [];
  const matching = codes.filter(c => c.count >= range[0] && c.count <= range[1]);
  // Group by count
  const byCount = {};
  for (const c of matching) {
    (byCount[c.count] = byCount[c.count] || []).push(c.code);
  }
  const counts = Object.keys(byCount).map(Number).sort((a, b) => b - a);
  const grpColor = A.group_colors[A.region_group[region]];
  $("codes-modal-title").innerHTML =
    `<span style="color:${grpColor};">${escapeHtml(region)}</span> ` +
    `<span style="color:#888; font-weight:400;">— ${escapeHtml(A.region_names[region] || "")}</span><br>` +
    `<span style="font-size:13px; font-weight:500; color:#666;">Bucket: ${escapeHtml(bucket)} (count range ${range[0]}–${range[1] === 9999 ? "∞" : range[1]})</span>`;
  let html = "";
  if (counts.length === 0) {
    html = `<p style="padding: 8px 0;">No codes in this bucket fall within the count range.</p>`;
  } else {
    for (const cnt of counts) {
      const codeList = byCount[cnt];
      html += `<div class="codes-group">
        <div class="header">
          <span>Count = ${cnt} <span style="color:#888;font-weight:400;">(shared by ${cnt} wolf${cnt === 1 ? "" : "ves"})</span></span>
          <span style="color:#888;font-weight:400;font-size:11.5px;">${codeList.length} distinct code${codeList.length === 1 ? "" : "s"}</span>
        </div>
        <div class="codes-list">
          ${codeList.map(c => `<code>${escapeHtml(c)}</code>`).join("")}
        </div>
      </div>`;
    }
  }
  $("codes-modal-body").innerHTML = html;
  $("codes-modal").classList.add("show");
}

// ============================================================================
// Issue review (admin-only). Decisions persist to localStorage on the admin's
// browser. Viewers never see issue indicators or decisions.
// ============================================================================

const ISSUES = (PAYLOAD.issues && PAYLOAD.issues.categories) ? PAYLOAD.issues.categories : [];
const CLAUDE_QUESTIONS = PAYLOAD.claude_questions || [];
const PREFILLED_DECISIONS = PAYLOAD.prefilled_decisions || {};
const ISSUE_DECISIONS_KEY = "wolves_issue_decisions_v1";
const ISSUE_POLICY_KEY = "wolves_issue_policy_v1";
const CLARIFICATIONS_KEY = "wolves_clarifications_v1";

const STATUS_LIST = ["open", "answered", "decided_keep", "fixed_in_xlsx", "needs_more_data"];
const STATUS_LABEL = {
  open: "open", answered: "answered", decided_keep: "decided keep",
  fixed_in_xlsx: "fixed in xlsx", needs_more_data: "need more data"
};

let ALLOWED_SET_SOCIAL = new Set(["pack", "group", "unknown"]);
let issueDecisions = {};
let policyState = {};
let clarifications = {};
let activeIssueId = null;
let issueOpenCategories = new Set();
let panelFilterMode = "all"; // all | needs_reply | answered | resolved
// Reverse index for click-from-table: key = `${rowIndex}__${columnField}` → issue
let cellIssueMap = new Map();

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => (
    { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]
  ));
}

function loadIssueState() {
  try {
    const raw = localStorage.getItem(ISSUE_DECISIONS_KEY);
    if (raw) issueDecisions = JSON.parse(raw) || {};
  } catch (e) {}
  try {
    const rawP = localStorage.getItem(ISSUE_POLICY_KEY);
    if (rawP) {
      policyState = JSON.parse(rawP) || {};
      if (policyState["accept_lone"]) ALLOWED_SET_SOCIAL.add("lone");
      if (policyState["accept_packstar"]) ALLOWED_SET_SOCIAL.add("pack*");
    }
  } catch (e) {}
  // Clarifications (status + free-text comments)
  try {
    const rawC = localStorage.getItem(CLARIFICATIONS_KEY);
    if (rawC) clarifications = JSON.parse(rawC) || {};
  } catch (e) {}
  // MERGE with embedded prefilled (snapshot from data_decisions.json at build time).
  // Newest `updated_at` per id wins. This catches the case where the sync server
  // or another machine wrote newer decisions to disk while the browser was holding
  // stale state in localStorage.
  let mergedFromDisk = 0;
  for (const [id, prefilled] of Object.entries(PREFILLED_DECISIONS || {})) {
    const local = clarifications[id];
    const localT = (local && local.updated_at) || "";
    const diskT  = (prefilled && prefilled.updated_at) || "";
    if (!local || diskT > localT) {
      clarifications[id] = prefilled;
      mergedFromDisk++;
    }
  }
  if (mergedFromDisk > 0) {
    saveClarifications();
    console.log(`[sync] merged ${mergedFromDisk} fresher decisions from data_decisions.json`);
  }
  // Sync legacy issueDecisions so existing isResolved() / Mark-as-correct still work
  for (const [id, dec] of Object.entries(clarifications)) {
    if (dec && dec.status === "decided_keep") issueDecisions[id] = "decided_keep";
  }
}
function saveIssueState() {
  try { localStorage.setItem(ISSUE_DECISIONS_KEY, JSON.stringify(issueDecisions)); } catch (e) {}
  try { localStorage.setItem(ISSUE_POLICY_KEY, JSON.stringify(policyState)); } catch (e) {}
}
function saveClarifications() {
  try { localStorage.setItem(CLARIFICATIONS_KEY, JSON.stringify(clarifications)); } catch (e) {}
}
function getStatus(id) {
  return (clarifications[id] && clarifications[id].status) || "open";
}
function getComment(id) {
  return (clarifications[id] && clarifications[id].comment) || "";
}
function getUpdatedAt(id) {
  return (clarifications[id] && clarifications[id].updated_at) || "";
}
function setClarification(id, fields) {
  const existing = clarifications[id] || { status: "open", comment: "" };
  const next = { ...existing, ...fields };
  next.updated_at = new Date().toISOString();
  clarifications[id] = next;
  if (next.status === "decided_keep") {
    issueDecisions[id] = "decided_keep";
    saveIssueState();
  } else if (issueDecisions[id] === "decided_keep" && next.status !== "decided_keep") {
    delete issueDecisions[id];
    saveIssueState();
  }
  saveClarifications();
  // Live-sync: push this single decision to the local server if available
  syncPushDecision(id, next);
}
function fmtTimestamp(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric", month: "short", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch (e) { return iso; }
}

function findRowByIndex(rowIndex) {
  if (!table || rowIndex == null) return null;
  return table.getRows().find(r => r.getData()._row_index === rowIndex) || null;
}

// ----------------------------------------------------------------------------
// Claude's questions — synthesised as a virtual category that the existing
// renderIssuePanel loop can consume unchanged.
// ----------------------------------------------------------------------------
function buildClaudeCategory() {
  if (!CLAUDE_QUESTIONS.length) return null;
  return {
    category_id: "_claude_questions",
    title: "🤖 Claude's questions",
    severity: "claude", // distinct accent in CSS
    kind: "row",
    hint: "Open questions authored by Claude — your replies feed back into analysis.",
    description: `${CLAUDE_QUESTIONS.length} authored questions`,
    row_actions: [],
    policy_actions: [],
    issues: CLAUDE_QUESTIONS.map(q => ({
      id: q.id,
      row_index: q.row_index,
      serial: q.serial || "",
      target_column: q.target_column || null,
      __is_claude: true,
      __severity_hint: q.severity_hint || "info",
      details: {
        question: q.question,
        ...(q.kind ? { kind: q.kind } : {}),
        ...(q.evidence ? { evidence: typeof q.evidence === "object"
              ? JSON.stringify(q.evidence) : String(q.evidence) } : {}),
      },
    })),
  };
}

// All visible categories: Claude's questions first (if any), then QC categories.
function allCategories() {
  const out = [];
  const claude = buildClaudeCategory();
  if (claude) out.push(claude);
  for (const c of ISSUES) out.push(c);
  return out;
}

// ----------------------------------------------------------------------------
// Filter tabs
// ----------------------------------------------------------------------------
function matchesPanelFilter(issue) {
  const resolved = isResolved(issue);
  const status = getStatus(issue.id);
  switch (panelFilterMode) {
    case "all": return true;
    case "needs_reply": return !resolved && status === "open";
    case "answered": return status === "answered";
    case "resolved":
      return resolved || status === "decided_keep" || status === "fixed_in_xlsx";
    default: return true;
  }
}

function refreshPanelTabCounts() {
  let all = 0, needs = 0, answered = 0, resolved = 0;
  for (const cat of allCategories()) {
    for (const it of cat.issues) {
      it.__category = cat;
      all++;
      const r = isResolved(it);
      const st = getStatus(it.id);
      if (!r && st === "open") needs++;
      if (st === "answered") answered++;
      if (r || st === "decided_keep" || st === "fixed_in_xlsx") resolved++;
    }
  }
  const set = (id, n) => { const el = $(id); if (el) el.textContent = n; };
  set("ip-tab-count-all", all);
  set("ip-tab-count-needs_reply", needs);
  set("ip-tab-count-answered", answered);
  set("ip-tab-count-resolved", resolved);
}

// ----------------------------------------------------------------------------
// Download / load decisions — round-trip with the project's data_decisions.json
// ----------------------------------------------------------------------------
function downloadDecisionsJson() {
  const payload = {
    generated_at: new Date().toISOString(),
    schema_version: 1,
    decisions: clarifications,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "data_decisions.json";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  alert("data_decisions.json downloaded.\n\nNext steps:\n1. Move the file into the project folder (replacing the existing one).\n2. Run update.bat — your statuses + comments now flow into the QC report and audit report.");
}

function loadDecisionsJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try { parsed = JSON.parse(reader.result); }
    catch (e) { alert("Invalid JSON file: " + e.message); return; }
    const incoming = (parsed && parsed.decisions) ? parsed.decisions : parsed;
    if (!incoming || typeof incoming !== "object") {
      alert("File doesn't look like a decisions JSON (no `decisions` object).");
      return;
    }
    // Merge: newest updated_at per id wins; confirm before overwriting any
    // non-empty existing comment with a different value.
    let added = 0, updated = 0, kept = 0;
    const conflicts = [];
    for (const [id, dec] of Object.entries(incoming)) {
      const cur = clarifications[id];
      if (!cur) { clarifications[id] = dec; added++; continue; }
      const curT = cur.updated_at || "";
      const newT = dec.updated_at || "";
      if (newT > curT) {
        if (cur.comment && dec.comment && cur.comment !== dec.comment) {
          conflicts.push({ id, cur, dec });
        } else {
          clarifications[id] = dec; updated++;
        }
      } else {
        kept++;
      }
    }
    if (conflicts.length) {
      const proceed = confirm(
        `${conflicts.length} item(s) have non-empty local comments that differ from the file.\n\n` +
        `OK = overwrite local with file, Cancel = keep local.`
      );
      for (const c of conflicts) {
        if (proceed) { clarifications[c.id] = c.dec; updated++; }
        else { kept++; }
      }
    }
    saveClarifications();
    renderIssuePanel();
    alert(`Loaded: ${added} added, ${updated} updated, ${kept} kept (no change).`);
  };
  reader.readAsText(file);
}

function rowHasIssueLive(issue) {
  const cat = issue.__category;
  const r = findRowByIndex(issue.row_index);
  if (!r) return false;
  const data = r.getData();
  switch (cat.category_id) {
    case "code_present_but_pictures_0": {
      const pics = parseFloat(data["#pictures"]);
      const code = (data["code"] || "").toString().trim();
      return code && (isNaN(pics) || pics === 0);
    }
    case "code_is_empty_but_pictures_0": {
      const pics = parseFloat(data["#pictures"]);
      const code = (data["code"] || "").toString().trim();
      return !code && pics > 0;
    }
    case "code_concat_a1_a2_b3_b4_b5_c6_c7_d8_d9": {
      const code = (data["code"] || "").toString().trim();
      if (!code) return false;
      const concat = ["A1","A2","B3","B4","B5","C6","C7","D8","D9"]
        .map(c => (data[c] ?? "").toString().trim()).join("_");
      return code !== concat;
    }
    case "gender_not_in_m_f_blank": {
      const v = (data["gender"] ?? "").toString();
      if (v === "" || v == null) return false;
      return !(v === "m" || v === "f");
    }
    case "social_dynamic_out_of_pack_group_unknown": {
      const v = (data["social dynamic"] ?? "").toString().trim().toLowerCase();
      if (!v) return false;
      return !ALLOWED_SET_SOCIAL.has(v);
    }
    case "string_hygiene_whitespace_tabs": {
      const col = issue.details && issue.details.col;
      if (!col) return true;
      const v = data[col];
      if (typeof v !== "string") return false;
      return v !== v.trim() || /[\t\n]/.test(v);
    }
    case "whitespace_in_serial_number": {
      const v = data["serial number"];
      if (typeof v !== "string") return false;
      return v !== v.trim();
    }
    case "main_poligon_not_in_area": {
      const a = (data["area"] ?? "").toString();
      const m = (data["main poligon"] ?? "").toString().trim().toLowerCase();
      if (!m) return false;
      const aParts = a.split(/\s*,\s*/).map(s => s.trim().toLowerCase()).filter(Boolean);
      return aParts.length > 0 && !aParts.includes(m);
    }
    default:
      // Cross-row / regex-heavy checks: trust the original flag until next full
      // re-validation; user can mark them resolved manually.
      return true;
  }
}

function isResolved(issue) {
  const dec = issueDecisions[issue.id];
  if (dec === "decided_keep" || dec === "resolved_by_edit") return true;
  // Claude's questions only resolve via explicit user decision (decided_keep
  // or `fixed_in_xlsx` with the underlying row going away). They are NOT
  // auto-resolved by the live re-check, because most of them are general
  // methodology questions with no row anchor.
  if (issue.__is_claude) {
    const st = (clarifications[issue.id] && clarifications[issue.id].status) || "";
    return st === "decided_keep" || st === "fixed_in_xlsx";
  }
  return !rowHasIssueLive(issue);
}

function categoryStats(cat) {
  let remain = 0, shown = 0;
  for (const it of cat.issues) {
    it.__category = cat;
    if (!isResolved(it)) remain++;
    if (matchesPanelFilter(it)) shown++;
  }
  return { remain, total: cat.issues.length, shown };
}

function totalUnresolved() {
  let n = 0;
  for (const cat of allCategories()) n += categoryStats(cat).remain;
  return n;
}
function totalIssues() {
  let n = 0;
  for (const cat of allCategories()) n += cat.issues.length;
  return n;
}

function renderIssuePanel() {
  const list = $("ip-list");
  if (!list) return;
  list.innerHTML = "";
  for (const cat of allCategories()) {
    cat.issues.forEach(it => { it.__category = cat; });
    const stats = categoryStats(cat);
    // When filter mode is not "all", hide categories whose issues all fail the filter.
    if (panelFilterMode !== "all" && stats.shown === 0) continue;
    const catEl = document.createElement("div");
    catEl.className = `ip-cat sev-${cat.severity}`;
    if (issueOpenCategories.has(cat.category_id)) catEl.classList.add("open");

    const header = document.createElement("div");
    header.className = "ip-cat-header";
    const countLabel = panelFilterMode === "all"
      ? `${stats.remain}/${stats.total}`
      : `${stats.shown}`;
    header.innerHTML = `
      <span class="arrow">▶</span>
      <span style="flex:1;">${escapeHtml(cat.title)}</span>
      <span class="count">${countLabel}</span>
    `;
    header.addEventListener("click", () => {
      if (issueOpenCategories.has(cat.category_id)) issueOpenCategories.delete(cat.category_id);
      else issueOpenCategories.add(cat.category_id);
      renderIssuePanel();
    });
    catEl.appendChild(header);

    const body = document.createElement("div");
    body.className = "ip-cat-body";
    if (cat.hint) {
      const hint = document.createElement("div");
      hint.className = "ip-hint";
      hint.textContent = cat.hint;
      body.appendChild(hint);
    }
    if (cat.kind === "bulk" || cat.kind === "policy") {
      const actionsEl = document.createElement("div");
      actionsEl.className = "ip-actions";
      if (cat.kind === "bulk" && cat.bulk_label) {
        const btn = document.createElement("button");
        btn.className = "primary";
        btn.textContent = cat.bulk_label;
        btn.addEventListener("click", () => executeBulkAction(cat));
        actionsEl.appendChild(btn);
      }
      for (const a of cat.policy_actions || []) {
        const btn = document.createElement("button");
        btn.textContent = a.label;
        btn.addEventListener("click", () => executePolicyAction(cat, a));
        actionsEl.appendChild(btn);
      }
      body.appendChild(actionsEl);
    }
    for (const issue of cat.issues) {
      issue.__category = cat;
      if (!matchesPanelFilter(issue)) continue;
      const resolved = isResolved(issue);
      const status = getStatus(issue.id);
      const it = document.createElement("div");
      it.className = "ip-issue";
      if (resolved && status !== "open") it.classList.add("resolved");
      if (issue.id === activeIssueId) it.classList.add("active");
      const label = issue.serial
        || (issue.row_index != null ? `row ${issue.row_index}` : "general");
      const colHint = issue.target_column ? `→ ${issue.target_column}` : "";
      const pill = (status && status !== "open")
        ? `<span class="ip-status-pill status-${status}">${STATUS_LABEL[status]}</span>`
        : "";
      it.innerHTML = `
        <span><span class="ip-issue-key">${escapeHtml(label)}</span>
              <span style="color:#888;font-size:11px;"> ${escapeHtml(colHint)}</span>${pill}</span>
        <span class="ip-issue-state">${resolved && status === "open" ? "✓" : ""}</span>
      `;
      it.addEventListener("click", () => focusIssue(issue));
      body.appendChild(it);
    }
    catEl.appendChild(body);
    list.appendChild(catEl);
  }
  // ---- Practical decisions remaining (the meaningful workload count) ----
  // = (Claude questions with status open) + (QC categories with >=1 open item)
  let claudeOpen = 0;
  let qcCategoriesOpen = 0;
  let totalAnswered = 0;
  for (const cat of allCategories()) {
    let catHasOpen = false;
    for (const it of cat.issues) {
      it.__category = cat;
      const status = getStatus(it.id);
      if (status === "open") {
        if (cat.category_id === "_claude_questions") claudeOpen++;
        else catHasOpen = true;
      } else if (status === "answered" || status === "needs_more_data") {
        totalAnswered++;
      } else if (status === "decided_keep" || status === "fixed_in_xlsx") {
        totalAnswered++;
      }
    }
    if (catHasOpen && cat.category_id !== "_claude_questions") qcCategoriesOpen++;
  }
  const decisionsRemaining = claudeOpen + qcCategoriesOpen;
  if ($("ip-decisions-remaining")) {
    $("ip-decisions-remaining").textContent = decisionsRemaining;
    $("ip-decisions-remaining").title =
      `${claudeOpen} Claude questions still open + ${qcCategoriesOpen} QC categories with open items`;
  }
  if ($("ip-answered")) $("ip-answered").textContent = totalAnswered;
  if ($("ip-items-total")) $("ip-items-total").textContent = totalIssues();
  if ($("review-count")) $("review-count").textContent = decisionsRemaining;
  refreshPanelTabCounts();
  applyCellBadges();
}

function applyCellBadges() {
  if (!table) return;
  // Clear existing decoration AND the click-target index
  table.getRows().forEach(row => {
    row.getElement().classList.remove("row-issue-active");
    row.getCells().forEach(cell => {
      cell.getElement().classList.remove("cell-issue-error", "cell-issue-warning",
        "cell-issue-info", "cell-issue-active");
    });
  });
  cellIssueMap = new Map();
  if (!isAdmin) return;
  for (const cat of allCategories()) {
    for (const issue of cat.issues) {
      issue.__category = cat;
      if (isResolved(issue)) continue;
      const r = findRowByIndex(issue.row_index);
      if (!r) continue;
      if (issue.target_column) {
        const cell = r.getCells().find(c => c.getColumn().getField() === issue.target_column);
        if (!cell) continue;
        // Claude's questions use a per-issue severity hint; QC categories use cat.severity
        const sev = issue.__is_claude ? (issue.__severity_hint || "info") : cat.severity;
        const sevClass = sev === "errors" ? "cell-issue-error"
          : sev === "warnings" ? "cell-issue-warning" : "cell-issue-info";
        cell.getElement().classList.add(sevClass);
        // Build reverse index: first issue per (row, column) wins
        const key = `${issue.row_index}__${issue.target_column}`;
        if (!cellIssueMap.has(key)) cellIssueMap.set(key, issue);
        if (issue.id === activeIssueId) {
          cell.getElement().classList.add("cell-issue-active");
          r.getElement().classList.add("row-issue-active");
        }
      }
    }
  }
}

// Called from Tabulator's cellClick. If the clicked cell has a flagged issue,
// open the side panel (if closed) and focus that issue in the active card.
function focusIssueFromCell(cell) {
  if (!isAdmin) return;
  const data = cell.getRow().getData();
  const col = cell.getColumn().getField();
  if (data._row_index == null || !col) return;
  const key = `${data._row_index}__${col}`;
  const issue = cellIssueMap.get(key);
  if (!issue) return;
  if (!$("issue-panel").classList.contains("show")) toggleIssuePanel(true);
  // Make sure the category is expanded so the side list highlight is visible
  if (issue.__category) issueOpenCategories.add(issue.__category.category_id);
  focusIssue(issue);
}

function focusIssue(issue) {
  activeIssueId = issue.id;
  const r = findRowByIndex(issue.row_index);
  if (r) r.scrollTo("center", true);
  showActiveIssueCard(issue);
  renderIssuePanel();
}

function showActiveIssueCard(issue) {
  const card = $("ip-active-card");
  card.classList.add("show");
  const cat = issue.__category;
  const status = getStatus(issue.id);
  const statusPill = (status && status !== "open")
    ? ` <span class="ip-status-pill status-${status}">${STATUS_LABEL[status]}</span>`
    : "";
  const titleAnchor = issue.serial
    ? issue.serial
    : (issue.row_index != null ? `row ${issue.row_index}` : "general");
  $("ip-active-title").innerHTML =
    `${escapeHtml(cat.title)} — ${escapeHtml(titleAnchor)}${statusPill}`;

  // ----- Detail block -----
  let detailHtml = "";
  if (issue.__is_claude) {
    // Claude's questions: prominent question text + evidence + hint
    detailHtml += `<div class="ip-question-text">${escapeHtml(issue.details.question || "")}</div>`;
    if (issue.details.evidence) {
      detailHtml += `<div class="ip-question-evidence">${escapeHtml(issue.details.evidence)}</div>`;
    }
    if (issue.details.kind === "general") {
      detailHtml += `<div style="font-size:11px;color:#888;margin-top:4px;">(general methodology question — not tied to a single row)</div>`;
    }
  } else {
    detailHtml = `<strong>Hint:</strong> ${escapeHtml(cat.hint || "(no hint)")}`;
    if (issue.details) {
      const lines = [];
      for (const [k, v] of Object.entries(issue.details)) {
        if (k.startsWith("_") || k === "row_index") continue;
        lines.push(`<strong>${escapeHtml(k)}:</strong> <code>${escapeHtml(String(v).slice(0,90))}</code>`);
      }
      if (lines.length) detailHtml += "<br><br>" + lines.join("<br>");
    }
  }
  $("ip-active-detail").innerHTML = detailHtml;

  // ----- Clarification block: status dropdown + textarea -----
  const statusSelect = $("ip-status-select");
  if (statusSelect) statusSelect.value = status;
  const commentBox = $("ip-comment");
  if (commentBox) commentBox.value = getComment(issue.id);
  const updatedEl = $("ip-updated");
  if (updatedEl) {
    const ts = getUpdatedAt(issue.id);
    updatedEl.textContent = ts ? `last updated: ${fmtTimestamp(ts)}` : "—";
  }

  // ----- Action buttons -----
  const actionsEl = $("ip-active-actions");
  actionsEl.innerHTML = "";

  const saveBtn = document.createElement("button");
  saveBtn.className = "primary";
  saveBtn.textContent = "💾 Save comment";
  saveBtn.addEventListener("click", () => saveActiveClarification(issue, false));
  actionsEl.appendChild(saveBtn);

  if (status !== "answered") {
    const answeredBtn = document.createElement("button");
    answeredBtn.textContent = "✓ Mark answered";
    answeredBtn.addEventListener("click", () => saveActiveClarification(issue, "answered"));
    actionsEl.appendChild(answeredBtn);
  }

  if (issue.target_column) {
    const editBtn = document.createElement("button");
    editBtn.textContent = `✏ Edit "${issue.target_column}"`;
    editBtn.addEventListener("click", () => editTargetCell(issue));
    actionsEl.appendChild(editBtn);
  }
  for (const ra of (cat.row_actions || [])) {
    const btn = document.createElement("button");
    btn.textContent = ra.label;
    btn.addEventListener("click", () => executeRowAction(cat, issue, ra));
    actionsEl.appendChild(btn);
  }
  if (!issue.__is_claude) {
    // QC-only legacy quick action; Claude questions use status dropdown instead
    const okBtn = document.createElement("button");
    okBtn.textContent = "✓ Mark as correct";
    okBtn.addEventListener("click", () => saveActiveClarification(issue, "decided_keep"));
    actionsEl.appendChild(okBtn);
  }

  const skipBtn = document.createElement("button");
  skipBtn.textContent = "Skip ▶";
  skipBtn.addEventListener("click", () => nextIssue(1));
  actionsEl.appendChild(skipBtn);
}

// Save the active card's status dropdown + comment textarea to clarifications.
// `forceStatus` accepted forms:
//   false / undefined  → use dropdown's current value
//   string             → override status to this value
function saveActiveClarification(issue, forceStatus) {
  const statusSelect = $("ip-status-select");
  const commentBox = $("ip-comment");
  const status = (typeof forceStatus === "string" && forceStatus)
    ? forceStatus
    : (statusSelect ? statusSelect.value : "open");
  const comment = commentBox ? commentBox.value : "";
  setClarification(issue.id, { status, comment });
  // Visual confirmation
  const flash = $("ip-save-flash");
  if (flash) {
    flash.classList.add("show");
    setTimeout(() => flash.classList.remove("show"), 900);
  }
  renderIssuePanel();
  // Re-render the active card so the button list / pill / timestamp reflect the new state
  showActiveIssueCard(issue);
}

function editTargetCell(issue) {
  const r = findRowByIndex(issue.row_index);
  if (!r) return;
  const cell = r.getCells().find(c => c.getColumn().getField() === issue.target_column);
  if (!cell) return;
  cell.edit(true);
}

function executeRowAction(cat, issue, action) {
  const r = findRowByIndex(issue.row_index);
  if (!r) return;
  const data = r.getData();
  switch (action.id) {
    case "trim_cell": {
      const v = data[issue.target_column];
      if (typeof v === "string") r.update({ [issue.target_column]: v.trim() });
      break;
    }
    case "set_cell_blank": {
      r.update({ [issue.target_column]: "" });
      break;
    }
    case "set_code_from_regions": {
      const concat = ["A1","A2","B3","B4","B5","C6","C7","D8","D9"]
        .map(c => (data[c] ?? "").toString().trim()).join("_");
      r.update({ "code": concat });
      break;
    }
  }
  onChange();
}

function executeBulkAction(cat) {
  if (cat.category_id === "string_hygiene_whitespace_tabs") {
    if (!confirm(`Trim leading/trailing whitespace and remove tabs/newlines in ${cat.issues.length} cells?`)) return;
    for (const issue of cat.issues) {
      const r = findRowByIndex(issue.row_index);
      if (!r) continue;
      const col = issue.details && issue.details.col;
      if (!col) continue;
      const v = r.getData()[col];
      if (typeof v === "string") r.update({ [col]: v.trim().replace(/[\t\n]+/g, " ") });
    }
    onChange();
  } else if (cat.category_id === "polygon_name_casing_inconsistency") {
    for (const issue of cat.issues) {
      const forms = (issue.details && issue.details.forms) || [];
      const lower = (issue.details && issue.details.canonical_lower) || "";
      const choice = prompt(
        `Polygon (lowercase: '${lower}'). Forms found: ${forms.join(", ")}\n\n` +
        `Type the form to use as canonical:`, forms[0] || "");
      if (choice == null) continue;
      const trimmed = choice.trim();
      if (!trimmed) continue;
      table.getRows().forEach(r => {
        const data = r.getData();
        for (const col of ["area", "main poligon"]) {
          const v = (data[col] ?? "").toString();
          if (!v) continue;
          const replaced = v.split(/\s*,\s*/).map(p => {
            const t = p.trim();
            if (t.toLowerCase() === lower) return trimmed;
            return t;
          }).join(", ");
          if (replaced !== v) r.update({ [col]: replaced });
        }
      });
      issueDecisions[issue.id] = "decided_keep";
    }
    saveIssueState();
    onChange();
  }
}

function executePolicyAction(cat, action) {
  switch (action.id) {
    case "accept_lone":
      ALLOWED_SET_SOCIAL.add("lone");
      policyState["accept_lone"] = true;
      break;
    case "accept_packstar":
      ALLOWED_SET_SOCIAL.add("pack*");
      policyState["accept_packstar"] = true;
      break;
    case "rename_lone_to_unknown":
      if (!confirm("Replace all 'lone' with 'unknown' in social dynamic?")) return;
      table.getRows().forEach(r => {
        const v = (r.getData()["social dynamic"] ?? "").toString().trim().toLowerCase();
        if (v === "lone") r.update({ "social dynamic": "unknown" });
      });
      onChange();
      break;
    case "rename_packstar_to_pack":
      if (!confirm("Replace 'pack*' with 'pack' in social dynamic?")) return;
      table.getRows().forEach(r => {
        const v = (r.getData()["social dynamic"] ?? "").toString().trim();
        if (v === "pack*") r.update({ "social dynamic": "pack" });
      });
      onChange();
      break;
    case "move_observers_to_new_column":
      if (!confirm("Add a new 'reporter' column and move observer names from cams_spotted? Take effect immediately and persist on next Save.")) return;
      addReporterColumn();
      break;
    case "keep_as_is":
      for (const issue of cat.issues) issueDecisions[issue.id] = "decided_keep";
      break;
  }
  saveIssueState();
  renderIssuePanel();
}

function addReporterColumn() {
  if (!PAYLOAD.columns.includes("reporter")) {
    const idx = PAYLOAD.columns.indexOf("cams_spotted");
    PAYLOAD.columns.splice(idx + 1, 0, "reporter");
  }
  table.getRows().forEach(r => {
    const data = r.getData();
    const v = (data["cams_spotted"] ?? "").toString();
    const tokens = v.split(/\s*,\s*/).map(t => t.trim()).filter(Boolean);
    const numeric = tokens.filter(t => /^\d+$/.test(t)).join(", ");
    const names = tokens.filter(t => !/^\d+$/.test(t)).join(", ");
    if (names) r.update({ "cams_spotted": numeric, "reporter": names });
    else if (data["reporter"] === undefined) r.update({ "reporter": "" });
  });
  rebuildTable();
  onChange();
}

function findActiveIssue() {
  if (!activeIssueId) return null;
  for (const cat of allCategories()) {
    for (const it of cat.issues) {
      if (it.id === activeIssueId) { it.__category = cat; return it; }
    }
  }
  return null;
}

function nextIssue(direction) {
  const flat = [];
  for (const cat of allCategories()) {
    for (const it of cat.issues) {
      it.__category = cat;
      if (!matchesPanelFilter(it)) continue;
      if (panelFilterMode === "all" && isResolved(it)) continue;
      flat.push(it);
    }
  }
  if (flat.length === 0) {
    activeIssueId = null;
    $("ip-active-card").classList.remove("show");
    renderIssuePanel();
    return;
  }
  let curIdx = flat.findIndex(it => it.id === activeIssueId);
  if (curIdx === -1) curIdx = direction > 0 ? -1 : flat.length;
  const next = (curIdx + direction + flat.length) % flat.length;
  issueOpenCategories.add(flat[next].__category.category_id);
  focusIssue(flat[next]);
}

function toggleIssuePanel(show) {
  $("issue-panel").classList.toggle("show", show);
  document.body.classList.toggle("with-issue-panel", show);
  if (show) {
    renderIssuePanel();
    if (!activeIssueId) nextIssue(1);
  } else {
    activeIssueId = null;
    applyCellBadges();
  }
}

function init() {
  $("stat-total").textContent = PAYLOAD.n_total_rows;
  $("stat-build").textContent = PAYLOAD.build_iso;

  baselineRows = JSON.parse(JSON.stringify(PAYLOAD.rows));

  // Restore unsaved edits if present — but only prompt when the stored data
  // actually differs from the baseline. Past builds wrote the baseline to
  // localStorage on every tableBuilt, causing a phantom popup on every reload.
  let initialData = JSON.parse(JSON.stringify(PAYLOAD.rows));
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Compare cell-by-cell against the baseline; if identical, silently drop.
        const identical = parsed.length === baselineRows.length && parsed.every((row, i) => {
          const base = baselineRows[i] || {};
          for (const c of PAYLOAD.columns) {
            if (String(row[c] ?? "") !== String(base[c] ?? "")) return false;
          }
          return true;
        });
        if (identical) {
          localStorage.removeItem(STORAGE_KEY);
        } else if (confirm("Found unsaved edits in this browser from a previous session. Restore them?")) {
          initialData = parsed;
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    }
  } catch (e) {}

  table = new Tabulator("#data-table", {
    data: initialData,
    columns: buildColumns(),
    layout: "fitDataStretch",
    height: "calc(100vh - 280px)",
    movableColumns: true,
    rowFormatter: rowFormatter,
    cellEdited: (cell) => {
      onChange();
      // Live-sync: push this cell change directly to wolves_data.xlsx
      if (syncActive) {
        const d = cell.getRow().getData();
        const col = cell.getColumn().getField();
        // Skip internal/computed fields
        if (col === "_row_index" || col === "_status") return;
        syncPost("/api/save_cell", {
          row_index: d._row_index,
          column: col,
          value: cell.getValue() ?? "",
        });
      }
    },
    cellClick: (e, cell) => focusIssueFromCell(cell),
    rowAdded: () => { onChange(); syncPushXlsxBulkDebounced(); },
    rowDeleted: () => { onChange(); syncPushXlsxBulkDebounced(); },
    dataFiltered: () => refreshStats(),
  });
  table.on("tableBuilt", () => { applyFilters(); refreshStats(); onChange(); });

  $("search-input").addEventListener("input", applyFilters);
  $("show-empty-code").addEventListener("change", applyFilters);
  $("reset-filters").addEventListener("click", () => {
    $("search-input").value = "";
    $("show-empty-code").checked = false;
    table.clearHeaderFilter();
    applyFilters();
  });

  // Column-visibility menu
  const colMenu = $("col-toggle-menu");
  const colList = $("col-toggle-list");
  function rebuildColMenu() {
    colList.innerHTML = "";
    PAYLOAD.columns.forEach(name => {
      const wrap = document.createElement("label");
      wrap.style.display = "flex";
      wrap.style.alignItems = "center";
      wrap.style.gap = "6px";
      wrap.style.padding = "3px 4px";
      wrap.style.fontSize = "12px";
      wrap.style.cursor = "pointer";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      const c = table.getColumn(name);
      cb.checked = c ? c.isVisible() : true;
      cb.addEventListener("change", () => {
        const col = table.getColumn(name);
        if (!col) return;
        if (cb.checked) col.show(); else col.hide();
      });
      wrap.appendChild(cb);
      const txt = document.createElement("span");
      txt.textContent = name;
      wrap.appendChild(txt);
      colList.appendChild(wrap);
    });
  }
  $("col-toggle-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    const visible = colMenu.style.display === "block";
    colMenu.style.display = visible ? "none" : "block";
    if (!visible) rebuildColMenu();
  });
  document.addEventListener("click", (e) => {
    if (!$("col-toggle-wrap").contains(e.target)) colMenu.style.display = "none";
  });
  $("col-show-all").addEventListener("click", () => {
    PAYLOAD.columns.forEach(c => { const col = table.getColumn(c); if (col) col.show(); });
    rebuildColMenu();
  });
  $("col-hide-all").addEventListener("click", () => {
    // Keep at least the first column visible to avoid an empty table.
    PAYLOAD.columns.forEach((c, i) => { const col = table.getColumn(c); if (col && i > 0) col.hide(); });
    rebuildColMenu();
  });
  $("export-csv").addEventListener("click", () => table.download("csv", "wolves_data.csv"));
  $("export-xlsx").addEventListener("click", () => table.download("xlsx", "wolves_data_view.xlsx", { sheetName: "wolves" }));
  $("admin-login-btn").addEventListener("click", () => {
    $("pwd-modal").classList.add("show");
    $("pwd-input").value = "";
    $("pwd-error").textContent = " ";
    $("pwd-input").focus();
  });
  $("pwd-cancel").addEventListener("click", () => $("pwd-modal").classList.remove("show"));
  $("pwd-input").addEventListener("keydown", e => { if (e.key === "Enter") $("pwd-submit").click(); });
  $("pwd-submit").addEventListener("click", async () => {
    const h = await sha256Hex($("pwd-input").value);
    if (h === PWD_HASH) {
      $("pwd-modal").classList.remove("show");
      setMode(true);
    } else {
      $("pwd-error").textContent = "Wrong password.";
    }
  });
  $("logout-btn").addEventListener("click", () => setMode(false));
  $("save-btn").addEventListener("click", saveAsXlsx);
  $("save-table-btn").addEventListener("click", saveTableNow);
  $("discard-btn").addEventListener("click", discardChanges);
  $("add-row-btn").addEventListener("click", () => {
    const empty = {};
    for (const c of PAYLOAD.columns) empty[c] = "";
    table.addRow(empty, true);
  });

  // Issue review wire-up
  loadIssueState();
  if ($("review-issues-btn")) {
    $("review-issues-btn").addEventListener("click", () => {
      toggleIssuePanel(!$("issue-panel").classList.contains("show"));
    });
  }
  if ($("ip-close")) $("ip-close").addEventListener("click", () => toggleIssuePanel(false));
  if ($("ip-prev")) $("ip-prev").addEventListener("click", () => nextIssue(-1));
  if ($("ip-next")) $("ip-next").addEventListener("click", () => nextIssue(1));

  // Fix & Clarify mode: filter tabs, comment textarea blur-save, status select,
  // download/load buttons.
  document.querySelectorAll(".ip-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".ip-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      panelFilterMode = tab.dataset.mode || "all";
      renderIssuePanel();
    });
  });
  if ($("ip-comment")) {
    $("ip-comment").addEventListener("blur", () => {
      if (!activeIssueId) return;
      const issue = findActiveIssue();
      if (issue) saveActiveClarification(issue, false);
    });
  }
  if ($("ip-status-select")) {
    $("ip-status-select").addEventListener("change", () => {
      if (!activeIssueId) return;
      const issue = findActiveIssue();
      if (issue) saveActiveClarification(issue, false);
    });
  }
  if ($("ip-download")) {
    $("ip-download").addEventListener("click", downloadDecisionsJson);
  }
  if ($("ip-load")) {
    $("ip-load").addEventListener("click", () => $("ip-load-file").click());
    $("ip-load-file").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) loadDecisionsJson(f);
      e.target.value = "";
    });
  }

  // Initial counter (works pre-admin so the button shows the right number once revealed)
  if ($("review-count")) $("review-count").textContent = totalUnresolved();

  // ---- Anatomy reference + status filter chips + distribution chart ----
  populateRegionRefTable();
  setupStatusChips();
  setupStatusBarsToggle();
  // Codes modal close
  if ($("codes-modal-close")) {
    $("codes-modal-close").addEventListener("click", () => $("codes-modal").classList.remove("show"));
    $("codes-modal").addEventListener("click", (e) => {
      if (e.target === $("codes-modal")) $("codes-modal").classList.remove("show");
    });
  }
  // Initial chip counts (run after the table is built so getData() works)
  table.on("tableBuilt", () => { refreshStatusChipCounts(); });
  // Probe the local sync server (no-op if it's not running)
  syncProbe();
  // Render chart (Plotly is async-loaded via CDN; check)
  if (window.Plotly) {
    renderRegionDistributionChart();
  } else {
    const wait = setInterval(() => {
      if (window.Plotly) {
        clearInterval(wait);
        renderRegionDistributionChart();
      }
    }, 80);
  }
}

document.addEventListener("DOMContentLoaded", init);
</script>
</body>
</html>
"""


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
