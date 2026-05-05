"""Schema-discovery helper for an incoming wolves-data file.

Run this BEFORE making any changes to the pipeline when the user provides a
new (larger / different) Excel file. It prints sheet names, row counts,
column lists, dtypes, and a sample, then computes a schema diff against the
current expected columns.

Usage:
    python step0_discover.py <path-to-new-excel-file>

If no path is given, defaults to C:\\Users\\nilim\\Downloads\\wolves_data.xlsx
(the existing file).
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd


# Current schema (what wolf_lib.py expects)
EXPECTED_CORE = {
    "serial number",
    "#pictures",
    "A1", "A2", "B3", "B4", "B5", "C6", "C7", "D8", "D9",
}
EXPECTED_AUX = {
    "area", "main poligon",
    "#sights", "#right", "#left", "#front", "#no good",
    "code", "D10",
}
ALL_KNOWN = EXPECTED_CORE | EXPECTED_AUX


def header(text: str, ch: str = "=") -> None:
    print()
    print(ch * 78)
    print(text)
    print(ch * 78)


def discover(path: Path) -> None:
    if not path.exists():
        print(f"ERROR: file not found: {path}")
        sys.exit(1)

    header(f"SCHEMA DISCOVERY — {path.name}")
    print(f"  full path: {path}")
    print(f"  size:      {path.stat().st_size / 1024:.1f} KB")

    xl = pd.ExcelFile(path)
    header("[1] SHEETS")
    for s in xl.sheet_names:
        n = len(xl.parse(s))
        print(f"  {s!r}: {n} rows")

    target_sheet = "נתוני זיהוי זאבים (2)"
    if target_sheet in xl.sheet_names:
        print(f"\n  Default sheet for current pipeline: {target_sheet!r} ✓ FOUND")
        chosen = target_sheet
    else:
        print(f"\n  ⚠️  Default sheet {target_sheet!r} NOT FOUND.")
        chosen = xl.sheet_names[0]
        print(f"  Falling back to first sheet: {chosen!r}")
        print(f"  *** wolf_lib.SHEET_NAME may need to be updated. ***")

    df = xl.parse(chosen)

    header(f"[2] SHEET '{chosen}' — STRUCTURE")
    print(f"  Total rows:    {len(df)}")
    print(f"  Total columns: {len(df.columns)}")

    print("\n  Columns (in order):")
    for i, c in enumerate(df.columns, 1):
        dtype = str(df[c].dtype)
        n_null = int(df[c].isna().sum())
        n_uniq = int(df[c].nunique(dropna=True))
        sample = df[c].dropna().head(3).tolist()
        print(f"    {i:>2}. {str(c)!r:<30}  dtype={dtype:<10} nulls={n_null:<4} uniq={n_uniq:<5} sample={sample}")

    header("[3] PICTURE FILTER PREVIEW")
    if "#pictures" in df.columns:
        pics = pd.to_numeric(df["#pictures"], errors="coerce").fillna(0)
        print(f"  Rows with #pictures > 0: {(pics > 0).sum()}")
        print(f"  Rows with #pictures = 0: {(pics == 0).sum()}")
    else:
        print("  '#pictures' column NOT FOUND — current load_data() will fail.")

    header("[4] SCHEMA DIFF vs CURRENT PIPELINE")
    actual = set(df.columns)

    missing_core = EXPECTED_CORE - actual
    print("\n  CORE columns (must exist):")
    for c in sorted(EXPECTED_CORE):
        ok = "✓" if c in actual else "✗ MISSING"
        print(f"    {ok}  {c!r}")
    if missing_core:
        print(f"\n  ⚠️  MISSING {len(missing_core)} CORE column(s): {missing_core}")
        print("      The current pipeline cannot run on this file as-is.")

    print("\n  Existing AUX columns (carried through if present):")
    for c in sorted(EXPECTED_AUX):
        if c in actual:
            print(f"    ✓  {c!r}")
        else:
            print(f"    -  {c!r}  (not in this file — that's OK)")

    new_cols = actual - ALL_KNOWN
    if new_cols:
        print(f"\n  ✨ NEW columns ({len(new_cols)}) — these need user input on what they mean:")
        for c in sorted(new_cols):
            sample = df[c].dropna().head(3).tolist()
            print(f"    • {c!r:<30} dtype={df[c].dtype}  sample={sample}")
    else:
        print("\n  No new columns — schema matches existing pipeline.")

    header("[5] ROW UNIQUENESS")
    if "serial number" in df.columns:
        sns = df["serial number"].astype(str)
        dups = sns[sns.duplicated()].tolist()
        if dups:
            print(f"  ⚠️  Duplicate serial numbers ({len(dups)}): {dups[:10]}{'...' if len(dups) > 10 else ''}")
            print("      The current model assumes ONE row per wolf. If duplicates")
            print("      represent per-sighting rows, the entire analysis must adapt.")
        else:
            print("  ✓ Serial numbers all unique — same row-uniqueness model as before.")

    header("[6] NEXT STEPS")
    if missing_core:
        print("  1. Investigate missing CORE columns — file is incompatible.")
        print("  2. Discuss with user: rename / restore / map columns?")
    elif new_cols:
        print("  1. For each NEW column, ask user:")
        print("     - What does it mean?")
        print("     - Should it appear as a filter in the Wolves Table tab?")
        print("     - Does it require a new analysis or just pass-through?")
        print("  2. After mapping decisions, update CLAUDE.md.")
        print("  3. If pass-through only → `update.bat` will work as-is.")
    else:
        print("  Schema unchanged. Run `update.bat` directly to refresh outputs.")
    print()


def main() -> None:
    if len(sys.argv) > 1:
        path = Path(sys.argv[1])
    else:
        path = Path(r"C:\Users\nilim\Downloads\wolves_data.xlsx")
    discover(path)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
