"""Detailed per-region review with the new processing rules applied.

Generates:
    - A printable report (Hebrew + English) on stdout
    - wolves_processed_preview.csv : every wolf row + region status columns
    - region_codes_review.csv      : every wolf × region (long format) for deep audit
"""

from __future__ import annotations

import sys
from collections import Counter

import pandas as pd

from wolf_lib import (
    OUTPUT_DIR,
    REGIONS,
    classify_code,
    clean_partial,
    load_data,
    process_all_regions,
    split_color_pattern,
)


def print_section(title: str, char: str = "=") -> None:
    print()
    print(char * 78)
    print(title)
    print(char * 78)


def main() -> None:
    df = load_data()  # canonical: every wolf with non-empty code
    proc = process_all_regions(df)

    print_section("REVIEW — REFINED RULES APPLIED", "=")
    print(f"Wolves in analysis pool (code != null): {len(df)}")

    # Audit each region in detail
    for r in REGIONS:
        print_section(f"REGION {r}", "=")
        norm_col = f"{r}_norm"
        class_col = f"{r}_class"
        cleaned_col = f"{r}_cleaned"
        status_col = f"{r}_status"
        right_col = f"{r}_right"
        left_col = f"{r}_left"
        color_col = f"{r}_color"
        pattern_col = f"{r}_pattern"

        # Status counts (this is the final ground-truth tagging)
        statuses = proc[status_col].value_counts().to_dict()
        print("\nFinal status counts:")
        for s in ("empty", "N", "P", "asymmetric", "unique",
                  "partial_ambiguous", "unknown"):
            if statuses.get(s, 0) > 0:
                print(f"  {s:20s}: {statuses[s]:4d}")

        # Class counts (intermediate)
        cls_counts = proc[class_col].value_counts().to_dict()
        print("\nClass breakdown (before substring resolution):")
        for s in ("empty", "N", "P", "asymmetric", "full", "partial", "unknown"):
            if cls_counts.get(s, 0) > 0:
                print(f"  {s:20s}: {cls_counts[s]:4d}")

        # All cleaned codes with counts (this is the pool used for substring check)
        cleaned_pool = [c for c in proc[cleaned_col].tolist() if c]
        cleaned_counts = Counter(cleaned_pool)
        print(f"\nAll cleaned codes by frequency ({len(cleaned_counts)} distinct):")
        for code, n in cleaned_counts.most_common():
            # Look up the status of this cleaned code
            sample = proc.loc[proc[cleaned_col] == code, status_col].iloc[0]
            mark = "   "
            if sample == "partial_ambiguous":
                mark = "⚠️ "
            print(f"  {mark}{code:25s}  count={n:3d}  ({sample})")

        # Show partial codes with their original form (so user can verify)
        partials = proc[proc[class_col] == "partial"][["serial number", norm_col, cleaned_col, status_col]]
        if len(partials) > 0:
            print(f"\nPartial codes (had N or P inside, cleaned for substring check):")
            for _, row in partials.iterrows():
                sn = row["serial number"]
                orig = row[norm_col]
                clean = row[cleaned_col]
                stat = row[status_col]
                # what longer codes contain it
                if stat == "partial_ambiguous":
                    longer = sorted({c for c in cleaned_pool if c != clean and clean in c})
                    why = f"contained in: {longer}"
                else:
                    why = "no longer code contains it → unique partial"
                print(f"  wolf {sn:>6}  '{orig}' → cleaned='{clean}' → {stat}")
                print(f"           ↳ {why}")

        # Asymmetric details
        asym = proc[proc[class_col] == "asymmetric"][["serial number", norm_col, right_col, left_col]]
        if len(asym) > 0:
            print(f"\nAsymmetric wolves ({len(asym)} found):")
            for _, row in asym.iterrows():
                sn = row["serial number"]
                orig = row[norm_col]
                right = row[right_col]
                left = row[left_col]
                print(f"  wolf {sn:>6}  '{orig}' → right='{right}'  left='{left}'")

        # Unknown — these still need attention
        unknowns = proc[proc[class_col] == "unknown"][["serial number", norm_col]]
        if len(unknowns) > 0:
            print(f"\n!! UNKNOWN codes (do not match any rule):")
            for _, row in unknowns.iterrows():
                print(f"  wolf {row['serial number']:>6}  '{row[norm_col]}'")

        # Color / pattern decomposition (if applicable)
        if r in {"A1", "A2", "C6", "D8"}:
            print(f"\nColor / pattern decomposition (for cleaned codes):")
            print("  COLORS:")
            colors = proc[color_col].dropna()
            if len(colors) > 0:
                for c, n in colors.value_counts().items():
                    label = c if c else "(no color identified)"
                    print(f"    {label!r}: {n}")
            print("  PATTERNS:")
            patterns = proc[pattern_col].dropna()
            if len(patterns) > 0:
                for p, n in patterns.value_counts().head(20).items():
                    label = p if p else "(empty / pure color)"
                    print(f"    {label!r}: {n}")

    # Save preview CSVs
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    preview_cols = ["serial number", "area", "main poligon", "#pictures"]
    for r in REGIONS:
        preview_cols += [r, f"{r}_status", f"{r}_cleaned",
                         f"{r}_right", f"{r}_left",
                         f"{r}_color", f"{r}_pattern"]
    preview_cols = [c for c in preview_cols if c in proc.columns]
    preview = proc[preview_cols].copy()
    preview_path = OUTPUT_DIR / "wolves_processed_preview.csv"
    preview.to_csv(preview_path, index=False, encoding="utf-8-sig")

    # Long-format audit
    rows = []
    for r in REGIONS:
        for _, row in proc.iterrows():
            rows.append({
                "serial_number": row["serial number"],
                "region": r,
                "raw": row[r],
                "norm": row.get(f"{r}_norm"),
                "class": row.get(f"{r}_class"),
                "cleaned": row.get(f"{r}_cleaned"),
                "status": row.get(f"{r}_status"),
                "right": row.get(f"{r}_right"),
                "left": row.get(f"{r}_left"),
                "color": row.get(f"{r}_color"),
                "pattern": row.get(f"{r}_pattern"),
            })
    audit = pd.DataFrame(rows)
    audit_path = OUTPUT_DIR / "region_codes_review.csv"
    audit.to_csv(audit_path, index=False, encoding="utf-8-sig")

    print_section("FILES WRITTEN", "=")
    print(f"  {preview_path}")
    print(f"  {audit_path}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
