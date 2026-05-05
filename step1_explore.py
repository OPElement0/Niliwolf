"""Phase 1: exploratory read of the wolves dataset.

Loads the data, filters to rows with pictures, and prints region-by-region
descriptive statistics so the user can review what is in the data before any
formal processing happens.
"""

from __future__ import annotations

import sys
from collections import Counter

import pandas as pd

from wolf_lib import (
    REGIONS,
    classify_code,
    load_data,
    normalize,
    split_asymmetric,
)


def main() -> None:
    df_all = load_data(only_with_pictures=False)
    df = load_data(only_with_pictures=True)

    print("=" * 70)
    print("PHASE 1 — EXPLORATORY READ")
    print("=" * 70)
    print()
    print(f"Total rows in sheet           : {len(df_all)}")
    print(f"Wolves with #pictures > 0     : {len(df)}")
    print(f"Wolves with no pictures       : {len(df_all) - len(df)}")
    print()

    # Picture stats
    pics = pd.to_numeric(df["#pictures"], errors="coerce")
    print(f"Pictures per wolf (filtered)  : "
          f"min={int(pics.min())}, median={pics.median():.0f}, "
          f"mean={pics.mean():.1f}, max={int(pics.max())}")
    print(f"Sum of #pictures              : {int(pics.sum())}")
    print()

    # Geographic distribution
    print("-" * 70)
    print("Geographic distribution")
    print("-" * 70)
    if "area" in df.columns:
        print("\n[area]")
        print(df["area"].fillna("(empty)").value_counts().to_string())
    if "main poligon" in df.columns:
        print("\n[main poligon]")
        print(df["main poligon"].fillna("(empty)").value_counts().to_string())
    print()

    # Per-region stats
    print("=" * 70)
    print("PER-REGION DESCRIPTIVE STATISTICS")
    print("=" * 70)

    for r in REGIONS:
        print()
        print(f"\n{'#' * 60}")
        print(f"## REGION {r}")
        print(f"{'#' * 60}")

        col = df[r]
        classes = [classify_code(v) for v in col]
        ccount = Counter(classes)

        print(f"\nClass counts (out of {len(df)} wolves):")
        for cls in ("empty", "N", "P", "asymmetric", "full", "unknown"):
            if ccount.get(cls, 0) > 0:
                print(f"  {cls:18s}: {ccount[cls]:4d}")

        # Top-10 codes (raw, no normalization beyond stripping)
        normalized_present = [normalize(v) for v in col]
        normalized_present = [v for v in normalized_present if v is not None]
        top = Counter(normalized_present).most_common(10)
        print(f"\nTop 10 codes by frequency:")
        for code, n in top:
            cls = classify_code(code)
            print(f"  {code:25s}  count={n:3d}  ({cls})")

        # Asymmetric examples
        asym_codes = [v for v, c in zip(normalized_present, [classify_code(x) for x in normalized_present]) if c == "asymmetric"]
        if asym_codes:
            print(f"\nAsymmetric codes ({len(asym_codes)} wolf-rows):")
            shown = set()
            for ac in asym_codes:
                if ac in shown:
                    continue
                shown.add(ac)
                try:
                    right, left = split_asymmetric(ac)
                    print(f"  {ac}  ->  right={right!r}  left={left!r}")
                except ValueError:
                    print(f"  {ac}  -> COULD NOT SPLIT")
                if len(shown) >= 5:
                    break

        # Unknown examples (anomalies — important)
        unknowns = [v for v in normalized_present if classify_code(v) == "unknown"]
        if unknowns:
            print(f"\n!! UNKNOWN codes (do not match dictionary patterns):")
            for u in Counter(unknowns).most_common(10):
                print(f"  {u[0]!r}  count={u[1]}")

    print()
    print("=" * 70)
    print("END OF PHASE 1")
    print("=" * 70)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
