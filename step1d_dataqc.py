"""Comprehensive data-quality check on wolves_data.xlsx (sheet 'נתוני זיהוי זאבים (2)').

Surfaces missing / inconsistent / unparseable data WITHOUT modifying anything.
Outputs a Markdown report and a JSON file for downstream tooling.

Usage:
    python step1d_dataqc.py

Outputs:
    data_quality_report.md    (human-readable)
    data_quality_report.json  (machine-readable)

Severity levels:
    errors     — must be fixed before analysis (data inconsistencies, broken refs)
    warnings   — likely issues, surface to user
    info       — FYI, may or may not need action
"""

from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

import pandas as pd

from wolf_lib import INPUT_FILE, REGIONS, SHEET_NAME

OUT_MD = Path(__file__).parent / "data_quality_report.md"
OUT_JSON = Path(__file__).parent / "data_quality_report.json"
DECISIONS_PATH = Path(__file__).parent / "data_decisions.json"

# Allowed values
GENDER_ALLOWED = {"m", "f"}
SOCIAL_DYN_BASE = {"pack", "group", "lone", "unknown"}
# Per Nili 2026-05-12: `*` suffix on any of the 4 canonical categories means
# "high probability but not certain". So {pack*, group*, lone*, unknown*} are
# all valid alongside the bare forms.
SOCIAL_DYN_ALLOWED = SOCIAL_DYN_BASE | {f"{x}*" for x in SOCIAL_DYN_BASE}
CAMERA_RANGE = (1, 60)

# Patterns
# Date formats observed in 'time on camera':
#   dd.mm.yy                    single observation
#   d-d.mm.yy                   same-month range (year only at end)
#   d.m-d.m.yy                  cross-month range (year only at end) — user-described shorthand
#   d.m.yy-d.m.yy               cross-month range (year on BOTH ends) — actual data uses this most
#   m.yyyy                      month/year only (observer-reported wolves with no day precision)
#   m.yyyy-m.yyyy               month/year range (observer reports spanning months)
SINGLE_DATE_RE = re.compile(r"^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$")
RANGE_SAMEMONTH_RE = re.compile(r"^(\d{1,2})\s*-\s*(\d{1,2})\.(\d{1,2})\.(\d{2,4})$")
RANGE_CROSSMONTH_SHORT_RE = re.compile(r"^(\d{1,2})\.(\d{1,2})\s*-\s*(\d{1,2})\.(\d{1,2})\.(\d{2,4})$")
RANGE_FULLDATES_RE = re.compile(r"^(\d{1,2})\.(\d{1,2})\.(\d{2,4})\s*-\s*(\d{1,2})\.(\d{1,2})\.(\d{2,4})$")
MONTH_YEAR_RE = re.compile(r"^(\d{1,2})\.(\d{4})$")
MONTH_YEAR_RANGE_RE = re.compile(r"^(\d{1,2})\.(\d{4})\s*-\s*(\d{1,2})\.(\d{4})$")
UNRECOGNIZED_RE = re.compile(r"^\d+\s+unrecognized\??$", re.IGNORECASE)
INVALID_SEP_RE = re.compile(r"[/&|;]")


# ---------------------------------------------------------------------------
# Findings collector
# ---------------------------------------------------------------------------

def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


class Findings:
    def __init__(self):
        self.errors: list[dict] = []
        self.warnings: list[dict] = []
        self.info: list[dict] = []

    def add(self, severity: str, category: str, description: str, rows: list | None = None):
        cat_id = _slug(category)
        bucket = getattr(self, severity)
        items = []
        for i, r in enumerate(rows or []):
            anchor = (
                r.get("serial")
                or r.get("from_serial")
                or (f"row{r.get('row_index')}" if r.get("row_index") is not None else f"item{i}")
            )
            extra = r.get("col") or r.get("column") or r.get("region") or r.get("missing_reference") or ""
            item_id = f"{cat_id}__{anchor}__{extra}".replace(" ", "_").replace("/", "_")
            items.append({**r, "_id": item_id})
        bucket.append({
            "category": category,
            "category_id": cat_id,
            "severity": severity,
            "description": description,
            "rows": items,
        })


def get_serial(df, idx) -> str:
    v = df.at[idx, "serial number"]
    return str(v).strip() if pd.notna(v) else f"(blank, row {idx})"


# ---------------------------------------------------------------------------
# Individual checks
# ---------------------------------------------------------------------------

def check_serial(df: pd.DataFrame, f: Findings) -> None:
    sns_raw = df["serial number"]
    empties = sns_raw.isna().sum()
    if empties:
        rows = []
        for idx in df.index[sns_raw.isna()]:
            rows.append({
                "row_index": int(idx),
                "code": "(empty)" if pd.isna(df.at[idx, "code"]) else str(df.at[idx, "code"])[:40],
                "area": "(empty)" if pd.isna(df.at[idx, "area"]) else str(df.at[idx, "area"]),
                "#pictures": int(df.at[idx, "#pictures"]) if pd.notna(df.at[idx, "#pictures"]) else "(empty)",
            })
        f.add("info", "rows with empty 'serial number'",
              f"{empties} row(s) lack a serial number — only the trailing blank row is expected",
              rows)

    sns = sns_raw.dropna().astype(str).str.strip()
    dups = sns[sns.duplicated()].unique().tolist()
    if dups:
        f.add("errors", "duplicate 'serial number'",
              f"{len(dups)} serial(s) appear more than once — must be unique",
              [{"serial": s, "occurrences": int((sns == s).sum())} for s in dups])

    ws = []
    for idx, val in sns_raw.items():
        if isinstance(val, str) and val != val.strip():
            ws.append({"row_index": int(idx), "value": repr(val)})
    if ws:
        f.add("warnings", "whitespace in 'serial number'",
              f"{len(ws)} serial(s) have leading/trailing whitespace — silent matching risk",
              ws)


def check_picture_counts(df: pd.DataFrame, f: Findings) -> None:
    cols = ["#right", "#left", "#front", "#no good"]
    mismatches = []
    non_numeric = []
    for idx, r in df.iterrows():
        try:
            parts = []
            for c in cols:
                v = r.get(c)
                if pd.isna(v):
                    continue
                parts.append(float(v))
            total_v = r.get("#pictures")
            if pd.isna(total_v):
                continue
            total = float(total_v)
            psum = sum(parts)
            if abs(psum - total) > 0.0001:
                mismatches.append({
                    "serial": get_serial(df, idx),
                    "#right": int(r["#right"]) if pd.notna(r["#right"]) else "",
                    "#left": int(r["#left"]) if pd.notna(r["#left"]) else "",
                    "#front": int(r["#front"]) if pd.notna(r["#front"]) else "",
                    "#no good": int(r["#no good"]) if pd.notna(r["#no good"]) else "",
                    "sum": int(psum) if psum.is_integer() else psum,
                    "#pictures": int(total) if total.is_integer() else total,
                    "diff": int(total - psum) if (total - psum) == int(total - psum) else (total - psum),
                })
        except (TypeError, ValueError):
            non_numeric.append({"serial": get_serial(df, idx)})

    if mismatches:
        f.add("warnings", "picture-count sum mismatch",
              f"{len(mismatches)} wolf(ves): #right + #left + #front + #no good ≠ #pictures",
              mismatches)
    if non_numeric:
        f.add("errors", "non-numeric in picture-count column",
              f"{len(non_numeric)} row(s): one of the count columns is not numeric",
              non_numeric)


def check_code_pictures(df: pd.DataFrame, f: Findings) -> None:
    code_empty_pics_yes = []
    code_yes_pics_zero = []
    for idx, r in df.iterrows():
        code = r.get("code")
        try:
            pics = float(r.get("#pictures")) if pd.notna(r.get("#pictures")) else 0
        except (TypeError, ValueError):
            pics = 0
        is_code_empty = pd.isna(code) or str(code).strip() == ""
        if is_code_empty and pics > 0:
            code_empty_pics_yes.append({
                "serial": get_serial(df, idx),
                "#pictures": int(pics),
            })
        elif (not is_code_empty) and pics == 0:
            code_yes_pics_zero.append({
                "serial": get_serial(df, idx),
                "code": str(code)[:50],
            })
    if code_empty_pics_yes:
        f.add("errors", "code is empty but #pictures > 0",
              f"{len(code_empty_pics_yes)} wolf(ves): pictures exist but no code — would be silently dropped",
              code_empty_pics_yes)
    if code_yes_pics_zero:
        f.add("errors", "code present but #pictures = 0",
              f"{len(code_yes_pics_zero)} wolf(ves): code exists but pictures=0 — likely typo, fix #pictures",
              code_yes_pics_zero)


def check_code_matches_regions(df: pd.DataFrame, f: Findings) -> None:
    mismatches = []
    for idx, r in df.iterrows():
        code = r.get("code")
        if pd.isna(code) or not str(code).strip():
            continue
        expected_parts = []
        for region in REGIONS:
            v = r.get(region)
            expected_parts.append("" if pd.isna(v) else str(v).strip())
        expected = "_".join(expected_parts)
        actual = str(code).strip()
        if expected != actual:
            mismatches.append({
                "serial": get_serial(df, idx),
                "code (actual)": actual[:60],
                "concat A1..D9": expected[:60],
            })
    if mismatches:
        f.add("warnings", "code != concat(A1, A2, B3, B4, B5, C6, C7, D8, D9)",
              f"{len(mismatches)} wolf(ves): the 'code' string doesn't match the joined region cells",
              mismatches)


def check_gender(df: pd.DataFrame, f: Findings) -> None:
    bad = []
    for idx, val in df["gender"].items():
        if pd.isna(val):
            continue
        s = str(val)
        if s != s.strip() or s.strip() not in GENDER_ALLOWED:
            bad.append({"serial": get_serial(df, idx), "value": repr(val)})
    if bad:
        f.add("warnings", "gender not in {m, f, blank}",
              f"{len(bad)} row(s): unexpected gender value (case, whitespace, or other)",
              bad)


def check_social_dynamic(df: pd.DataFrame, f: Findings) -> None:
    bad = []
    for idx, val in df["social dynamic"].items():
        if pd.isna(val):
            continue
        s = str(val).strip().lower()
        if s not in SOCIAL_DYN_ALLOWED:
            bad.append({"serial": get_serial(df, idx), "value": repr(val)})
    if bad:
        f.add("warnings", "social dynamic outside official set",
              f"{len(bad)} row(s): value not in {{pack, group, lone, unknown}} "
              f"with optional `*` suffix for 'probable'",
              bad)


def check_cams_spotted(df: pd.DataFrame, f: Findings) -> None:
    out_of_range = []
    bad_sep = []
    non_numeric = []
    for idx, val in df["cams_spotted"].items():
        if pd.isna(val) or val == "":
            continue
        serial = get_serial(df, idx)
        if isinstance(val, (int, float)):
            n = int(val)
            if not (CAMERA_RANGE[0] <= n <= CAMERA_RANGE[1]):
                out_of_range.append({"serial": serial, "value": n})
            continue
        s = str(val).strip()
        if INVALID_SEP_RE.search(s):
            bad_sep.append({"serial": serial, "value": s})
        tokens = [t.strip() for t in s.split(",") if t.strip()]
        for tok in tokens:
            # Strip any non-numeric noise inside the token
            try:
                n = int(tok)
                if not (CAMERA_RANGE[0] <= n <= CAMERA_RANGE[1]):
                    out_of_range.append({"serial": serial, "value": s, "bad_id": n})
            except ValueError:
                non_numeric.append({"serial": serial, "value": s, "non_numeric_token": tok})
    if out_of_range:
        f.add("errors", "cams_spotted: camera ID outside 1-60",
              f"{len(out_of_range)} entry(ies) reference cameras outside the 60-camera grid",
              out_of_range)
    if bad_sep:
        f.add("warnings", "cams_spotted: non-comma separator",
              f"{len(bad_sep)} entry(ies) use '/', '&', '|' or ';' instead of ','",
              bad_sep)
    if non_numeric:
        f.add("warnings", "cams_spotted: non-numeric token",
              f"{len(non_numeric)} entry(ies) contain a token that is not a camera ID",
              non_numeric)


def parse_time_cell(s: str) -> tuple[bool, str]:
    s = s.strip()

    m = SINGLE_DATE_RE.match(s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            yy = 2000 + y if y < 100 else y
            date(yy, mo, d)
            return True, "single-date"
        except ValueError:
            return False, f"invalid calendar date d={d} m={mo} y={y}"

    m = RANGE_SAMEMONTH_RE.match(s)
    if m:
        d1, d2, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4))
        try:
            yy = 2000 + y if y < 100 else y
            date(yy, mo, d1)
            date(yy, mo, d2)
        except ValueError:
            return False, "invalid day in same-month range"
        if d1 > d2:
            return False, f"same-month range out of order: {d1} > {d2}"
        return True, "same-month-range"

    m = RANGE_FULLDATES_RE.match(s)
    if m:
        d1, m1, y1, d2, m2, y2 = (int(g) for g in m.groups())
        try:
            yy1 = 2000 + y1 if y1 < 100 else y1
            yy2 = 2000 + y2 if y2 < 100 else y2
            start = date(yy1, m1, d1)
            end = date(yy2, m2, d2)
        except ValueError:
            return False, "invalid day/month in full-date range"
        if start > end:
            return False, "full-date range out of order"
        return True, "full-date-range"

    m = RANGE_CROSSMONTH_SHORT_RE.match(s)
    if m:
        d1, m1, d2, m2, y = (int(g) for g in m.groups())
        try:
            yy = 2000 + y if y < 100 else y
            date(yy, m1, d1)
            date(yy, m2, d2)
        except ValueError:
            return False, "invalid day/month in short cross-month range"
        if (m1, d1) > (m2, d2):
            return False, "cross-month-short range out of order"
        return True, "cross-month-short-range"

    m = MONTH_YEAR_RANGE_RE.match(s)
    if m:
        m1, y1, m2, y2 = (int(g) for g in m.groups())
        if not (1 <= m1 <= 12 and 1 <= m2 <= 12):
            return False, "invalid month in month/year range"
        if (y1, m1) > (y2, m2):
            return False, "month/year range out of order"
        return True, "month-year-range (no day precision)"

    m = MONTH_YEAR_RE.match(s)
    if m:
        mo, y = int(m.group(1)), int(m.group(2))
        if not (1 <= mo <= 12):
            return False, "invalid month in month/year"
        return True, "month-year (no day precision)"

    return False, "unparseable"


def check_time_on_camera(df: pd.DataFrame, f: Findings) -> None:
    bad = []
    for idx, val in df["time on camera"].items():
        if pd.isna(val) or val == "":
            continue
        ok, reason = parse_time_cell(str(val))
        if not ok:
            bad.append({"serial": get_serial(df, idx), "value": str(val), "reason": reason})
    if bad:
        f.add("errors", "time on camera unparseable",
              f"{len(bad)} entry(ies) don't match any accepted format "
              "(dd.mm.yy / d-d.mm.yy / d.m-d.m.yy / dd.mm.yy-dd.mm.yy / m.yyyy / m.yyyy-m.yyyy)",
              bad)


def check_seen_with(df: pd.DataFrame, f: Findings) -> None:
    valid_serials = set(df["serial number"].dropna().astype(str).str.strip())
    bad_sep = []
    unknown_refs = []

    for idx, val in df["seen with"].items():
        if pd.isna(val) or val == "":
            continue
        s = str(val).strip()
        serial = get_serial(df, idx)

        # Detect non-comma separators inside the value (per user rule: comma only)
        if INVALID_SEP_RE.search(s):
            bad_sep.append({"serial": serial, "seen_with": s})

        # Tokenize permissively (commas, slashes, semicolons) so we can still
        # validate the references contained inside non-canonical separators
        tokens = [t.strip() for t in re.split(r"[,/&|;]", s) if t.strip()]
        for tok in tokens:
            if UNRECOGNIZED_RE.match(tok):
                continue
            # Allow trailing '?' (uncertainty marker)
            clean = tok.rstrip("?").strip()
            if not clean:
                continue
            if clean not in valid_serials:
                unknown_refs.append({
                    "from_serial": serial,
                    "seen_with": s,
                    "missing_reference": clean,
                })

    if bad_sep:
        f.add("warnings", "seen with: non-comma separator",
              f"{len(bad_sep)} entry(ies) use '/', '&', '|' or ';' — should use ','",
              bad_sep)
    if unknown_refs:
        # Dedupe by (from_serial, missing_reference)
        seen_keys = set()
        unique = []
        for r in unknown_refs:
            k = (r["from_serial"], r["missing_reference"])
            if k not in seen_keys:
                seen_keys.add(k)
                unique.append(r)
        f.add("errors", "seen with references unknown wolf",
              f"{len(unique)} reference(s) point to a serial not present in the table",
              unique)


def check_pack_vs_shiyukh(df: pd.DataFrame, f: Findings) -> None:
    if "pack name" not in df.columns or "שיוך" not in df.columns:
        return
    diffs = []
    for idx, r in df.iterrows():
        a = str(r["pack name"]).strip() if pd.notna(r["pack name"]) else ""
        b = str(r["שיוך"]).strip() if pd.notna(r["שיוך"]) else ""
        if a != b:
            diffs.append({
                "serial": get_serial(df, idx),
                "pack name": a or "(blank)",
                "שיוך": b or "(blank)",
            })
    if diffs:
        f.add("info", "'pack name' vs 'שיוך' diverge",
              f"{len(diffs)} row(s) differ between the two columns — for user's manual cleanup",
              diffs)


def check_polygon_consistency(df: pd.DataFrame, f: Findings) -> None:
    main_not_in_area = []
    casing_groups: dict[str, set[str]] = defaultdict(set)

    for col in ("area", "main poligon"):
        for val in df[col].dropna():
            if isinstance(val, str):
                for part in re.split(r"\s*,\s*", val):
                    p = part.strip()
                    if p:
                        casing_groups[p.lower()].add(p)

    inconsistent_casings = [
        {"canonical_lower": low, "forms": sorted(forms)}
        for low, forms in casing_groups.items() if len(forms) > 1
    ]
    if inconsistent_casings:
        f.add("warnings", "polygon name casing inconsistency",
              f"{len(inconsistent_casings)} polygon(s) appear with multiple capitalisations",
              inconsistent_casings)

    for idx, r in df.iterrows():
        a = r.get("area")
        m = r.get("main poligon")
        if pd.isna(a) or pd.isna(m):
            continue
        a_parts = {p.strip().lower() for p in re.split(r"\s*,\s*", str(a))}
        m_clean = str(m).strip().lower()
        if m_clean and m_clean not in a_parts:
            main_not_in_area.append({
                "serial": get_serial(df, idx),
                "area": str(a),
                "main poligon": str(m),
            })
    if main_not_in_area:
        f.add("warnings", "main poligon not in area",
              f"{len(main_not_in_area)} wolf(ves): primary polygon doesn't appear in the area list",
              main_not_in_area)


def check_string_hygiene(df: pd.DataFrame, f: Findings) -> None:
    issues: list[dict] = []
    for col in df.columns:
        for idx, val in df[col].items():
            if not isinstance(val, str):
                continue
            stripped = val.strip()
            if val != stripped:
                issues.append({
                    "col": col,
                    "serial": get_serial(df, idx),
                    "value": repr(val),
                })
            elif "\t" in val or "\n" in val:
                issues.append({
                    "col": col,
                    "serial": get_serial(df, idx),
                    "value": repr(val),
                    "issue": "tab or newline",
                })
    if issues:
        f.add("info", "string hygiene (whitespace / tabs)",
              f"{len(issues)} cell(s) have leading/trailing whitespace, tabs or newlines",
              issues[:30])


def check_cams_pictures_relation(df: pd.DataFrame, f: Findings) -> None:
    odd = []
    for idx, r in df.iterrows():
        cams = r.get("cams_spotted")
        pics = r.get("#pictures")
        if pd.isna(cams) or pd.isna(pics):
            continue
        try:
            pics_n = int(float(pics))
        except (TypeError, ValueError):
            continue
        if pics_n == 0:
            continue
        if isinstance(cams, (int, float)):
            n_cams = 1
        else:
            tokens = [t.strip() for t in str(cams).split(",") if t.strip()]
            n_cams = len(tokens)
        if n_cams > pics_n:
            odd.append({
                "serial": get_serial(df, idx),
                "n_cameras": n_cams,
                "#pictures": pics_n,
            })
    if odd:
        f.add("info", "more cameras than pictures",
              f"{len(odd)} wolf(ves): listed in more cameras than #pictures (worth a sanity check)",
              odd)


def check_missing_metadata(df: pd.DataFrame, f: Findings) -> None:
    """For wolves that survive both filters (code != null AND #pictures > 0), surface
    rows missing other useful metadata."""
    pool = df[df["code"].notna() & (pd.to_numeric(df["#pictures"], errors="coerce").fillna(0) > 0)]
    fields = ["area", "main poligon", "cams_spotted", "social dynamic", "time on camera"]
    by_field = {f_: [] for f_ in fields}
    for idx, r in pool.iterrows():
        for fname in fields:
            v = r.get(fname)
            if pd.isna(v) or (isinstance(v, str) and not v.strip()):
                by_field[fname].append({"serial": get_serial(df, idx)})
    for fname, rows in by_field.items():
        if rows:
            f.add("info", f"missing '{fname}' (in analysis pool)",
                  f"{len(rows)} analysed wolf(ves) have empty '{fname}'",
                  rows[:20])


def check_region_value_hygiene(df: pd.DataFrame, f: Findings) -> None:
    """Region cells containing characters outside the expected alphabet."""
    odd: list[dict] = []
    expected = re.compile(r"^[a-zA-Z0-9NPRL]+$")
    for region in REGIONS:
        for idx, val in df[region].items():
            if pd.isna(val):
                continue
            s = str(val).strip()
            if not s:
                continue
            if not expected.match(s):
                odd.append({
                    "serial": get_serial(df, idx),
                    "region": region,
                    "value": repr(val),
                })
    if odd:
        f.add("warnings", "unusual character in region cell",
              f"{len(odd)} region cell(s) contain characters outside the expected alphabet [a-z0-9NPRL]",
              odd)


# ---------------------------------------------------------------------------
# Markdown report
# ---------------------------------------------------------------------------

def render_md(f: Findings, df: pd.DataFrame, sheet: str,
              decision_stats: dict | None = None) -> str:
    lines = []
    lines.append(f"# Data Quality Report — `wolves_data.xlsx`\n")
    lines.append(f"**Generated:** {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M')}  ")
    lines.append(f"**Source sheet:** `{sheet}` ({len(df)} rows × {len(df.columns)} cols)\n")

    if decision_stats:
        suppressed_keep = decision_stats.get("suppressed_decided_keep", 0)
        annotated = decision_stats.get("annotated_with_comment", 0)
        fixed_but_still = decision_stats.get("fixed_but_still_detected", 0)
        if suppressed_keep or annotated or fixed_but_still:
            lines.append("> **From `data_decisions.json`:** "
                         f"{suppressed_keep} finding(s) suppressed (status=decided_keep), "
                         f"{annotated} carry a user comment, "
                         f"{fixed_but_still} marked `fixed_in_xlsx` but still detected.\n")

    lines.append("## Summary\n")
    lines.append("| Severity | Categories | Total rows flagged |")
    lines.append("|---|---:|---:|")
    for sev, label in [("errors", "❌ Errors (must fix)"),
                       ("warnings", "⚠ Warnings (likely issues)"),
                       ("info", "ℹ Info (FYI)")]:
        items = getattr(f, sev)
        total = sum(len(it["rows"]) for it in items)
        lines.append(f"| {label} | {len(items)} | {total} |")
    lines.append("")

    if not (f.errors or f.warnings or f.info):
        lines.append("\n**No issues found.** ✅\n")
        return "\n".join(lines)

    for sev, header in [("errors", "## ❌ Errors"),
                        ("warnings", "## ⚠ Warnings"),
                        ("info", "## ℹ Info")]:
        items = getattr(f, sev)
        if not items:
            continue
        lines.append(f"\n{header}\n")
        for item in items:
            lines.append(f"### {item['category']}")
            lines.append(item["description"])
            if item["rows"]:
                # Hide audit-only fields (_id, _user_*) from the displayed columns,
                # but surface user comments inline below each row that has one.
                display_cols = [c for c in item["rows"][0].keys()
                                if not (c.startswith("_") and c != "_id")]
                cols = [c for c in display_cols if c != "_id"]
                lines.append("")
                lines.append("| " + " | ".join(cols) + " |")
                lines.append("|" + "---|" * len(cols))
                for row in item["rows"][:30]:
                    cells = []
                    for c in cols:
                        v = row.get(c, "")
                        s = str(v).replace("|", "\\|")
                        cells.append(s[:80])
                    lines.append("| " + " | ".join(cells) + " |")
                    # Inline annotation lines below the row
                    note = row.get("_note")
                    user_status = row.get("_user_status")
                    user_comment = row.get("_user_comment")
                    if note or user_status or user_comment:
                        bits = []
                        if user_status:
                            bits.append(f"status=`{user_status}`")
                        if user_comment:
                            bits.append(f'note from data owner: "{user_comment[:200]}"')
                        if note:
                            bits.append(f"⚠ {note}")
                        if bits:
                            lines.append(f"| _{(' · '.join(bits))[:600]}_ {'|' * (len(cols) - 1)}|")
                if len(item["rows"]) > 30:
                    lines.append(f"\n*(showing first 30 of {len(item['rows'])} rows)*")
            lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run_checks(df: pd.DataFrame) -> Findings:
    """Run every QC check on the dataframe and return the populated Findings."""
    f = Findings()
    check_serial(df, f)
    check_picture_counts(df, f)
    check_code_pictures(df, f)
    check_code_matches_regions(df, f)
    check_region_value_hygiene(df, f)
    check_gender(df, f)
    check_social_dynamic(df, f)
    check_cams_spotted(df, f)
    check_time_on_camera(df, f)
    check_seen_with(df, f)
    check_polygon_consistency(df, f)
    check_pack_vs_shiyukh(df, f)
    check_missing_metadata(df, f)
    check_cams_pictures_relation(df, f)
    check_string_hygiene(df, f)
    return f


def load_decisions() -> dict:
    """Read data_decisions.json's 'decisions' map. Returns {} if absent or malformed."""
    if not DECISIONS_PATH.exists():
        return {}
    try:
        raw = json.loads(DECISIONS_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    decs = raw.get("decisions") if isinstance(raw, dict) else None
    return decs or {}


def apply_decisions(findings: Findings, decisions: dict) -> dict:
    """Walk the findings and apply user decisions.

    - status='decided_keep'    → drop the row from the report.
    - status='fixed_in_xlsx'   → drop the row only if the underlying check
                                  no longer flags it. Since we run on the
                                  CURRENT xlsx, if it's still in `findings`
                                  the user marked it fixed but the data
                                  still shows the issue → keep and annotate.
    - status='answered'/'needs_more_data' → keep, but attach user comment.

    Returns a dict of suppression stats for the report header.
    """
    stats = {"suppressed_decided_keep": 0,
             "suppressed_fixed_in_xlsx": 0,
             "annotated_with_comment": 0,
             "fixed_but_still_detected": 0}
    if not decisions:
        return stats
    for severity in ("errors", "warnings", "info"):
        items_kept = []
        for cat in getattr(findings, severity):
            rows_kept = []
            for r in cat["rows"]:
                dec = decisions.get(r.get("_id"))
                if not dec:
                    rows_kept.append(r)
                    continue
                status = (dec.get("status") or "").strip()
                comment = (dec.get("comment") or "").strip()
                if status == "decided_keep":
                    stats["suppressed_decided_keep"] += 1
                    continue
                if status == "fixed_in_xlsx":
                    # Row is in current findings → user said fixed but it's not.
                    r["_user_comment"] = comment
                    r["_user_status"] = status
                    r["_note"] = "marked fixed_in_xlsx but still detected"
                    stats["fixed_but_still_detected"] += 1
                    rows_kept.append(r)
                    continue
                # Other statuses (open, answered, needs_more_data): keep + annotate
                if comment:
                    r["_user_comment"] = comment
                    stats["annotated_with_comment"] += 1
                if status and status != "open":
                    r["_user_status"] = status
                rows_kept.append(r)
            if rows_kept:
                cat = {**cat, "rows": rows_kept}
                items_kept.append(cat)
        setattr(findings, severity, items_kept)
    return stats


def main() -> None:
    df = pd.read_excel(INPUT_FILE, sheet_name=SHEET_NAME)
    df.columns = [str(c).strip() for c in df.columns]

    f = run_checks(df)
    decisions = load_decisions()
    decision_stats = apply_decisions(f, decisions)

    md = render_md(f, df, SHEET_NAME, decision_stats)
    OUT_MD.write_text(md, encoding="utf-8")

    json_payload = {
        "summary": {
            "n_errors_categories": len(f.errors),
            "n_warnings_categories": len(f.warnings),
            "n_info_categories": len(f.info),
            "n_error_rows": sum(len(it["rows"]) for it in f.errors),
            "n_warning_rows": sum(len(it["rows"]) for it in f.warnings),
            "n_info_rows": sum(len(it["rows"]) for it in f.info),
            "source_rows": len(df),
            "source_cols": len(df.columns),
            "decisions_applied": decision_stats,
        },
        "errors": f.errors,
        "warnings": f.warnings,
        "info": f.info,
    }
    OUT_JSON.write_text(json.dumps(json_payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8")

    print(f"  wrote: {OUT_MD}")
    print(f"  wrote: {OUT_JSON}")
    print(f"  Errors:   {len(f.errors)} categories, {sum(len(it['rows']) for it in f.errors)} flagged rows")
    print(f"  Warnings: {len(f.warnings)} categories, {sum(len(it['rows']) for it in f.warnings)} flagged rows")
    print(f"  Info:     {len(f.info)} categories, {sum(len(it['rows']) for it in f.info)} flagged rows")
    suppressed = decision_stats["suppressed_decided_keep"] + decision_stats["suppressed_fixed_in_xlsx"]
    if decisions:
        print(f"  Decisions applied: {suppressed} suppressed (decided_keep), "
              f"{decision_stats['annotated_with_comment']} annotated, "
              f"{decision_stats['fixed_but_still_detected']} flagged 'fixed but still detected'.")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
