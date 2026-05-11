"""End-to-end data-integrity check between the embedded data in
`data_table.html` (chart + table) and the raw `wolves_data.xlsx` source
processed through `wolf_lib`.

Verifies four layers:
  (1) Per-row, per-region cell status (the small coloured bar in each
      region cell of the table) — does it match `process_all_regions`?
  (2) Per-region identification-bucket distribution (the stacked bar chart) —
      does it match `identification_buckets`?
  (3) Per-region distinct-code lists (the drill-down modal data) —
      does it match the value-counts in the analysis pool?
  (4) Cross-check: table cell statuses aggregated per region equal the
      chart's bucket sums for that region.

Writes:
    data_chart_verification_report.md

Exits with code 0 on PASS, 1 on FAIL.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd

from wolf_lib import (
    INPUT_FILE,
    SHEET_NAME,
    REGIONS,
    process_all_regions,
    identification_buckets,
    ID_BUCKET_ORDER,
)

PROJECT_DIR = Path(__file__).parent
HTML_PATH = PROJECT_DIR / "data_table.html"
OUT_REPORT = PROJECT_DIR / "data_chart_verification_report.md"


# ---------------------------------------------------------------------------
# Extract the PAYLOAD JSON from data_table.html
# ---------------------------------------------------------------------------

def extract_payload(html_text: str) -> dict:
    """Find `const PAYLOAD = {...};` and parse the JSON body."""
    needle = "const PAYLOAD = "
    i = html_text.find(needle)
    if i == -1:
        raise RuntimeError("Could not find 'const PAYLOAD = ' in the HTML")
    start = i + len(needle)
    # Brace balancer
    depth = 0
    in_str = False
    esc = False
    end = None
    for j in range(start, len(html_text)):
        ch = html_text[j]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = j + 1
                break
    if end is None:
        raise RuntimeError("Could not find matching closing brace for PAYLOAD")
    raw = html_text[start:end]
    # Restore any `</` escape we did at build time
    raw = raw.replace("<\\/", "</")
    return json.loads(raw)


# ---------------------------------------------------------------------------
# Verification helpers
# ---------------------------------------------------------------------------

def verify_per_cell_statuses(rows_in_html: list[dict], processed: pd.DataFrame) -> list[dict]:
    """Compare each row's per-region _status in the HTML against what
    `process_all_regions` produces. Returns a list of mismatch dicts."""
    mismatches = []
    proc_by_idx = {int(idx): row for idx, row in processed.iterrows()}
    for r in rows_in_html:
        idx = int(r.get("_row_index", -1))
        html_status = r.get("_status") or {}
        # If this row is not in the analysis pool, expected status = "empty" for all regions
        if idx not in proc_by_idx:
            for region in REGIONS:
                hs = html_status.get(region, "")
                if hs != "empty":
                    mismatches.append({
                        "row_index": idx,
                        "serial": str(r.get("serial number", "")),
                        "region": region,
                        "html_status": hs,
                        "expected": "empty",
                        "reason": "row not in pool (no code) → expected empty",
                    })
            continue
        proc_row = proc_by_idx[idx]
        for region in REGIONS:
            expected = str(proc_row.get(f"{region}_status", "empty"))
            if pd.isna(proc_row.get(f"{region}_status")):
                expected = "empty"
            hs = html_status.get(region, "")
            if hs != expected:
                mismatches.append({
                    "row_index": idx,
                    "serial": str(r.get("serial number", "")),
                    "region": region,
                    "html_status": hs,
                    "expected": expected,
                    "raw_value": str(r.get(region, "")),
                })
    return mismatches


def verify_bucket_dist(html_dist: dict, processed: pd.DataFrame) -> list[dict]:
    """Compare PAYLOAD.anatomy.bucket_dist[region][bucket] against
    `identification_buckets(processed, region)[bucket]`."""
    mismatches = []
    for region in REGIONS:
        expected = identification_buckets(processed, region)
        actual = html_dist.get(region, {}) or {}
        for bucket in ID_BUCKET_ORDER:
            exp = int(expected.get(bucket, 0))
            act = int(actual.get(bucket, 0))
            if exp != act:
                mismatches.append({
                    "region": region,
                    "bucket": bucket,
                    "html": act,
                    "expected": exp,
                    "diff": act - exp,
                })
    return mismatches


def verify_codes_per_region(html_codes: dict, processed: pd.DataFrame) -> list[dict]:
    """Verify the embedded (code, count) list per region against
    re-computing from the unambiguous wolves only."""
    mismatches = []
    for region in REGIONS:
        status_col = f"{region}_status"
        cleaned_col = f"{region}_cleaned"
        unambig = processed[processed[status_col] == "unambiguous"]
        expected_counts = unambig[cleaned_col].value_counts().to_dict()
        html_list = html_codes.get(region, []) or []
        html_counts = {item["code"]: int(item["count"]) for item in html_list}

        for code, exp_count in expected_counts.items():
            html_count = html_counts.get(str(code), 0)
            if int(exp_count) != html_count:
                mismatches.append({
                    "region": region,
                    "code": str(code),
                    "expected": int(exp_count),
                    "html": int(html_count),
                    "reason": "count mismatch",
                })
        for code, html_count in html_counts.items():
            if code not in expected_counts:
                mismatches.append({
                    "region": region,
                    "code": code,
                    "expected": 0,
                    "html": html_count,
                    "reason": "code present in HTML but not in pool",
                })
    return mismatches


def verify_table_chart_cross(rows_in_html: list[dict], html_dist: dict, n_pool: int) -> list[dict]:
    """Cross-check: per region, the count of cells with each status across all
    rows-in-the-pool of the table must agree with the chart's bucket totals.

    Status grouping:
        unambiguous total  == sum of all "Shared" buckets + "Unique (1)"
        asymmetric         == "Asymmetric"
        partial_ambiguous  == "Partial-ambiguous"
        P                  == "P"
        N                  == "N"
        (empty rows are excluded — they're not in the chart pool)
    """
    mismatches = []
    UNAMBIG_BUCKETS = [
        "Unique (1)", "Shared 2-3", "Shared 4-6", "Shared 7-10",
        "Shared 11-20", "Shared 21-35", "Shared 36+",
    ]
    for region in REGIONS:
        # Count statuses from table rows (only those in the pool — non-empty status)
        status_counts = Counter()
        for r in rows_in_html:
            st = (r.get("_status") or {}).get(region, "")
            if st and st != "empty":
                status_counts[st] += 1
        # Pull chart values
        bd = html_dist.get(region, {})
        ch_unambig = sum(int(bd.get(b, 0)) for b in UNAMBIG_BUCKETS)
        ch_asym    = int(bd.get("Asymmetric", 0))
        ch_partial = int(bd.get("Partial-ambiguous", 0))
        ch_P       = int(bd.get("P", 0))
        ch_N       = int(bd.get("N", 0))
        ch_empty   = int(bd.get("Empty", 0))

        checks = [
            ("unambiguous",       status_counts.get("unambiguous", 0),       ch_unambig),
            ("asymmetric",        status_counts.get("asymmetric", 0),        ch_asym),
            ("partial_ambiguous", status_counts.get("partial_ambiguous", 0), ch_partial),
            ("P",                 status_counts.get("P", 0),                 ch_P),
            ("N",                 status_counts.get("N", 0),                 ch_N),
        ]
        for label, table_n, chart_n in checks:
            if table_n != chart_n:
                mismatches.append({
                    "region": region,
                    "status": label,
                    "table_count": table_n,
                    "chart_count": chart_n,
                    "diff": table_n - chart_n,
                })

        # Total pool count (chart sums should equal n_pool)
        chart_total = ch_unambig + ch_asym + ch_partial + ch_P + ch_N + ch_empty
        if chart_total != n_pool:
            mismatches.append({
                "region": region,
                "status": "TOTAL",
                "table_count": n_pool,
                "chart_count": chart_total,
                "diff": chart_total - n_pool,
                "reason": "bucket sums ≠ n_pool",
            })
    return mismatches


# ---------------------------------------------------------------------------
# Report rendering
# ---------------------------------------------------------------------------

def md_table(headers: list[str], rows: list[list]) -> str:
    if not rows:
        return "(no rows)"
    out = ["| " + " | ".join(headers) + " |"]
    out.append("|" + "|".join(["---"] * len(headers)) + "|")
    for r in rows:
        out.append("| " + " | ".join(str(c) for c in r) + " |")
    return "\n".join(out)


def write_report(
    n_total_rows: int,
    n_pool: int,
    n_active: int,
    html_payload: dict,
    cell_mismatches: list[dict],
    bucket_mismatches: list[dict],
    code_mismatches: list[dict],
    cross_mismatches: list[dict],
    processed: pd.DataFrame,
) -> str:
    n_cells_total = n_total_rows * len(REGIONS)
    lines = []
    lines.append("# Data-integrity Report — `data_table.html` chart vs. table\n")
    lines.append(f"**Generated:** {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M')}  ")
    lines.append(f"**Source:** `wolves_data.xlsx`, sheet `{SHEET_NAME}`  ")
    lines.append(f"**HTML:** `data_table.html` (build_iso: `{html_payload.get('build_iso')}`)\n")

    lines.append("## 1. Headline\n")
    total_issues = (
        len(cell_mismatches)
        + len(bucket_mismatches)
        + len(code_mismatches)
        + len(cross_mismatches)
    )
    if total_issues == 0:
        lines.append("✅ **ALL FOUR INTEGRITY CHECKS PASSED.** "
                     "The chart numbers and the per-cell statuses in the table are "
                     "perfectly consistent with the raw `wolves_data.xlsx` data and "
                     "with `wolf_lib`'s classification rules.\n")
    else:
        lines.append(f"⚠️ **{total_issues} discrepancy entries found.** See sections below.\n")

    lines.append("## 2. Source numbers\n")
    lines.append(md_table(["item", "value"], [
        ["rows in sheet (2)", n_total_rows],
        ["rows with non-empty `code` (analysis pool used by chart + statuses)", n_pool],
        ["rows with `code` AND `#pictures > 0` (load_data pool)", n_active],
        ["region cells in table (rows × 9 regions)", n_cells_total],
        ["HTML reports `n_total_rows`", html_payload.get("n_total_rows", "?")],
        ["HTML reports `n_pool`", html_payload.get("n_pool", "?")],
    ]))
    lines.append("")

    # --- Layer 1: per-cell status -----------------------------------------
    lines.append("## 3. Layer 1 — per-cell status (table colour bars)\n")
    lines.append(f"Checked **{n_cells_total}** region cells against `process_all_regions`.")
    if not cell_mismatches:
        lines.append("\n✅ **All cell statuses match expected.**\n")
    else:
        lines.append(f"\n❌ **{len(cell_mismatches)} cell(s) disagree.**\n")
        lines.append(md_table(
            ["row_index", "serial", "region", "raw_value", "html_status", "expected"],
            [[m.get("row_index"), m.get("serial"), m["region"], m.get("raw_value", ""),
              m["html_status"], m["expected"]] for m in cell_mismatches[:50]]
        ))
        if len(cell_mismatches) > 50:
            lines.append(f"\n*(showing first 50 of {len(cell_mismatches)})*\n")

    # --- Layer 2: per-region bucket distribution --------------------------
    lines.append("\n## 4. Layer 2 — per-region bucket distribution (the chart)\n")
    lines.append(
        "Compared `PAYLOAD.anatomy.bucket_dist` in the page against "
        "`identification_buckets(processed, region)` for every (region, bucket)."
    )
    if not bucket_mismatches:
        lines.append("\n✅ **All 9 × 12 = 108 bucket cells in the chart match expected.**\n")
        # Show the buckets summary for reference
        lines.append("\nReference (chart values, all confirmed correct):\n")
        header_row = ["region"] + ID_BUCKET_ORDER
        data_rows = []
        for region in REGIONS:
            row = [region]
            for b in ID_BUCKET_ORDER:
                row.append(html_payload["anatomy"]["bucket_dist"][region].get(b, 0))
            data_rows.append(row)
        lines.append(md_table(header_row, data_rows))
    else:
        lines.append(f"\n❌ **{len(bucket_mismatches)} bucket cell(s) disagree.**\n")
        lines.append(md_table(
            ["region", "bucket", "chart shows", "expected", "diff"],
            [[m["region"], m["bucket"], m["html"], m["expected"], m["diff"]] for m in bucket_mismatches]
        ))

    # --- Layer 3: codes_per_region (drill-down data) ----------------------
    lines.append("\n## 5. Layer 3 — codes_per_region (the drill-down modal source)\n")
    lines.append("Each region's `(code, count)` list in the HTML, compared to "
                 "value-counts of the unambiguous wolves' cleaned codes.")
    if not code_mismatches:
        total_codes = sum(len(html_payload["anatomy"]["codes_per_region"][r]) for r in REGIONS)
        lines.append(f"\n✅ **All {total_codes} distinct codes (across 9 regions) match expected counts.**\n")
    else:
        lines.append(f"\n❌ **{len(code_mismatches)} code(s) disagree.**\n")
        lines.append(md_table(
            ["region", "code", "chart count", "expected count", "reason"],
            [[m["region"], m["code"], m["html"], m["expected"], m.get("reason", "")] for m in code_mismatches]
        ))

    # --- Layer 4: cross-check between table cells and chart buckets ------
    lines.append("\n## 6. Layer 4 — cross-check: table cell statuses vs. chart bucket sums\n")
    lines.append("For each region, the count of cells in the table with each status "
                 "must equal the corresponding total in the chart "
                 "(`unambiguous` total = sum of all Shared+Unique buckets, etc.).")
    if not cross_mismatches:
        lines.append("\n✅ **All cross-checks pass.** "
                     "Every region's cell-status totals in the table match the chart's bucket sums exactly.\n")
        # Show the cross-check matrix
        lines.append("\nReference (per region, status counts, all confirmed):\n")
        ref_rows = []
        UNAMBIG_BUCKETS = ["Unique (1)", "Shared 2-3", "Shared 4-6", "Shared 7-10",
                           "Shared 11-20", "Shared 21-35", "Shared 36+"]
        for region in REGIONS:
            bd = html_payload["anatomy"]["bucket_dist"][region]
            unambig_n = sum(int(bd.get(b, 0)) for b in UNAMBIG_BUCKETS)
            ref_rows.append([
                region,
                unambig_n,
                bd.get("Asymmetric", 0),
                bd.get("Partial-ambiguous", 0),
                bd.get("P", 0),
                bd.get("N", 0),
                bd.get("Empty", 0),
                unambig_n + bd.get("Asymmetric", 0) + bd.get("Partial-ambiguous", 0) +
                  bd.get("P", 0) + bd.get("N", 0) + bd.get("Empty", 0),
            ])
        lines.append(md_table(
            ["region", "Full (unambig.)", "Asym.", "Partial", "P", "N", "Empty", "total"],
            ref_rows
        ))
    else:
        lines.append(f"\n❌ **{len(cross_mismatches)} cross-check failure(s).**\n")
        lines.append(md_table(
            ["region", "status", "table count", "chart count", "diff"],
            [[m["region"], m["status"], m["table_count"], m["chart_count"], m["diff"]] for m in cross_mismatches]
        ))

    # --- Asymmetric wolves listing (sanity, since they're rare) ----------
    lines.append("\n## 7. Asymmetric wolves (sanity listing)\n")
    asym_rows = []
    for region in REGIONS:
        sc = f"{region}_status"
        rc = f"{region}_right"
        lc = f"{region}_left"
        ar = processed[processed[sc] == "asymmetric"]
        for _, row in ar.iterrows():
            asym_rows.append([
                str(row.get("serial number", "")),
                region,
                str(row.get(region, "")),
                str(row.get(rc, "")),
                str(row.get(lc, "")),
            ])
    if asym_rows:
        lines.append(md_table(
            ["serial", "region", "raw value", "right (cleaned)", "left (cleaned)"],
            asym_rows
        ))
    else:
        lines.append("(none)")

    # --- Summary footer ---------------------------------------------------
    lines.append("\n## 8. Summary\n")
    lines.append(md_table(
        ["check", "result"],
        [
            ["Per-cell status (table coloured bars)",
                "✅ pass" if not cell_mismatches else f"❌ {len(cell_mismatches)} mismatches"],
            ["Per-region bucket counts (chart)",
                "✅ pass" if not bucket_mismatches else f"❌ {len(bucket_mismatches)} mismatches"],
            ["Distinct codes & counts (drill-down)",
                "✅ pass" if not code_mismatches else f"❌ {len(code_mismatches)} mismatches"],
            ["Cross-check (table totals = chart totals)",
                "✅ pass" if not cross_mismatches else f"❌ {len(cross_mismatches)} mismatches"],
        ]
    ))
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    if not INPUT_FILE.exists():
        raise SystemExit(f"Source not found: {INPUT_FILE}")
    if not HTML_PATH.exists():
        raise SystemExit(f"HTML not found: {HTML_PATH}")

    print("Loading raw data...")
    df = pd.read_excel(INPUT_FILE, sheet_name=SHEET_NAME)
    df.columns = [str(c).strip() for c in df.columns]
    n_total_rows = len(df)
    n_pool = int(df["code"].notna().sum()) if "code" in df.columns else 0
    n_active = int((df["code"].notna() &
                    (pd.to_numeric(df["#pictures"], errors="coerce").fillna(0) > 0)).sum())

    print("Processing through wolf_lib...")
    df_pool = df[df["code"].notna()].copy()
    processed = process_all_regions(df_pool)

    print("Extracting PAYLOAD from data_table.html...")
    html_text = HTML_PATH.read_text(encoding="utf-8")
    payload = extract_payload(html_text)

    print("Layer 1: per-cell status...")
    cell_mismatches = verify_per_cell_statuses(payload.get("rows", []), processed)

    print("Layer 2: per-region bucket distribution...")
    bucket_mismatches = verify_bucket_dist(
        payload.get("anatomy", {}).get("bucket_dist", {}), processed
    )

    print("Layer 3: codes per region...")
    code_mismatches = verify_codes_per_region(
        payload.get("anatomy", {}).get("codes_per_region", {}), processed
    )

    print("Layer 4: cross-check table vs chart...")
    cross_mismatches = verify_table_chart_cross(
        payload.get("rows", []),
        payload.get("anatomy", {}).get("bucket_dist", {}),
        n_pool,
    )

    print("Rendering report...")
    md = write_report(
        n_total_rows=n_total_rows,
        n_pool=n_pool,
        n_active=n_active,
        html_payload=payload,
        cell_mismatches=cell_mismatches,
        bucket_mismatches=bucket_mismatches,
        code_mismatches=code_mismatches,
        cross_mismatches=cross_mismatches,
        processed=processed,
    )
    OUT_REPORT.write_text(md, encoding="utf-8")

    total = len(cell_mismatches) + len(bucket_mismatches) + len(code_mismatches) + len(cross_mismatches)
    print()
    print(f"  wrote: {OUT_REPORT}")
    print(f"  Layer 1 (cells)        : {len(cell_mismatches)} mismatch(es)")
    print(f"  Layer 2 (buckets)      : {len(bucket_mismatches)} mismatch(es)")
    print(f"  Layer 3 (codes)        : {len(code_mismatches)} mismatch(es)")
    print(f"  Layer 4 (cross-check)  : {len(cross_mismatches)} mismatch(es)")
    print(f"  TOTAL                  : {total}")
    if total == 0:
        print("  ✅ ALL CHECKS PASSED.")
    else:
        print("  ❌ DISCREPANCIES FOUND — see the report.")
    sys.exit(0 if total == 0 else 1)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
