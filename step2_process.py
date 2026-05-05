"""Phase 2: full data processing.

Reads the raw xlsx, applies all classification rules, and writes:
    - wolves_processed.csv      : every wolf row with status / cleaned / right / left / color / pattern columns
    - rank_freq_per_region.csv  : long format wolf-centric, versions A, B, C
    - rank_freq_sides.csv       : long format side-aware (asymmetric -> 2 entries)
    - region_summary.csv        : per-region diversity / visibility metrics
    - color_pattern_freq.csv    : per-region color and pattern frequencies (A1, A2, C6, D8 only)
"""

from __future__ import annotations

import sys
from collections import Counter

import pandas as pd

from wolf_lib import (
    COLOR_LETTERS,
    OUTPUT_DIR,
    REGIONS,
    all_identification_buckets,
    all_rank_frequencies,
    all_rank_frequencies_sides,
    load_data,
    process_all_regions,
    region_summary,
)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    df = load_data(only_with_pictures=True)
    print(f"Loaded {len(df)} wolves with #pictures > 0")

    proc = process_all_regions(df)

    # 1) processed wolves table
    pp = OUTPUT_DIR / "wolves_processed.csv"
    proc.to_csv(pp, index=False, encoding="utf-8-sig")
    print(f"  wrote: {pp}")

    # 2) wolf-centric rank-freq (versions A, B, C)
    rf = all_rank_frequencies(proc)
    rf_path = OUTPUT_DIR / "rank_freq_per_region.csv"
    rf.to_csv(rf_path, index=False, encoding="utf-8-sig")
    print(f"  wrote: {rf_path} ({len(rf)} rows)")

    # 3) side-aware rank-freq (asymmetric splits into 2 entries)
    rfs = all_rank_frequencies_sides(proc)
    rfs_path = OUTPUT_DIR / "rank_freq_sides.csv"
    rfs.to_csv(rfs_path, index=False, encoding="utf-8-sig")
    print(f"  wrote: {rfs_path} ({len(rfs)} rows)")

    # 4) region summary
    rs = region_summary(proc)
    rs_path = OUTPUT_DIR / "region_summary.csv"
    rs.to_csv(rs_path, index=False, encoding="utf-8-sig")
    print(f"  wrote: {rs_path}")

    # 5) color/pattern frequencies (only for the 4 regions that have a defined split)
    cp_rows = []
    for r in ("A1", "A2", "C6", "D8"):
        col_color = f"{r}_color"
        col_pattern = f"{r}_pattern"
        for kind, col in (("color", col_color), ("pattern", col_pattern)):
            series = proc[col].dropna()
            for value, n in series.value_counts().items():
                cp_rows.append({"region": r, "kind": kind, "value": str(value),
                                "count": int(n), "percent": round(100 * n / len(series), 2)})
    cp = pd.DataFrame(cp_rows)
    cp_path = OUTPUT_DIR / "color_pattern_freq.csv"
    cp.to_csv(cp_path, index=False, encoding="utf-8-sig")
    print(f"  wrote: {cp_path}")

    # 6) identification buckets
    ib = all_identification_buckets(proc)
    ib_path = OUTPUT_DIR / "identification_buckets.csv"
    ib.to_csv(ib_path, index=False, encoding="utf-8-sig")
    print(f"  wrote: {ib_path} ({len(ib)} rows)")

    # Quick sanity print
    print()
    print("=== Region summary (preview) ===")
    print(rs[["region", "n_total", "n_N", "n_P", "n_asymmetric",
              "n_partial_ambiguous", "n_unique", "shannon_entropy_bits",
              "pct_usable"]].to_string(index=False))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
