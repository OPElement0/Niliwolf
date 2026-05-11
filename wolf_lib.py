"""Shared utilities for wolf pelt pattern analysis.

Refined rules (as confirmed by user):

Cleaning rules
--------------
1. A pure 'N' or 'P' code → that wolf's region is unobserved/unclear (not partial).
2. Any other code containing 'N' or 'P' characters → strip those characters
   and treat the remainder as a *partial* code. Then apply the substring rule:
   the partial code is `partial_ambiguous` iff it is a strict substring of
   another code in the same region (NOT equal).
3. Asymmetric codes have shape `[<prefix>]R<right>L<left>` (prefix is an
   optional color letter). The wolf is one entity, but the right and left
   halves are stored in separate columns. The prefix color letter (if present)
   is appended as a *suffix* to BOTH right and left, to enable uniqueness
   checks.

Color / pattern decomposition (additional analysis)
---------------------------------------------------
- A1, A2: color = last letter if in {e,f,g,h,i,j,k,l,m}; pattern = the rest.
- C6:     color = last letter if in {e,f,g,h,i,j,k,l};   pattern = the rest.
- D8:     color = the digit immediately following 'a' (or 'N' if `aN…`);
          pattern = the part after the 'b' marker (or 'N'/'P' if missing).
"""

from __future__ import annotations

import re
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy.stats import entropy as scipy_entropy

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

REGIONS = ["A1", "A2", "B3", "B4", "B5", "C6", "C7", "D8", "D9"]
SHEET_NAME = "נתוני זיהוי זאבים (2)"
OUTPUT_DIR = Path(r"C:\Users\nilim\Desktop\wolf paper")
INPUT_FILE = OUTPUT_DIR / "wolves_data.xlsx"

# Color letters per region (where applicable)
COLOR_LETTERS: dict[str, set[str]] = {
    "A1": set("efghijklm"),
    "A2": set("efghijklm"),
    "C6": set("efghijkl"),
    # D8 is special — color is the digit after 'a'
}

# Asymmetric pattern: optional prefix color letter, then R<right>L<left>
# Examples:
#   'Ra2bLb'      → prefix='', right='a2b', left='b'
#   'fRa6La1'     → prefix='f', right='a6f', left='a1f' (after suffix)
#   'Rb2bLN'      → prefix='', right='b2b', left='N'
ASYM_RE = re.compile(r"^([a-z])?R(.+?)L(.+)$")

# A "valid" alphanumeric code consists only of lowercase letters and digits.
VALID_CODE_RE = re.compile(r"^[a-z0-9]+$")

# A code that contains N/P inside (not pure)
HAS_NP_RE = re.compile(r"[NP]")


# ---------------------------------------------------------------------------
# Code classification
# ---------------------------------------------------------------------------

def normalize(code) -> str | None:
    if code is None:
        return None
    if isinstance(code, float) and np.isnan(code):
        return None
    s = str(code).strip()
    if s == "" or s.lower() == "nan":
        return None
    return s


def clean_partial(code: str) -> tuple[str, str]:
    """Strip 'N' and 'P' from a non-pure code.

    Returns (cleaned, marker) where marker ∈
        {'pure', 'had_N', 'had_P', 'had_both'}.

    Example:
        'a5bN'  → ('a5b', 'had_N')
        'aNb4'  → ('ab4', 'had_N')   # 'a' + 'b4' joined
        'Pa'    → ('a',   'had_P')
        'a3bP'  → ('a3b', 'had_P')
        'c2xN'  → ('c2x', 'had_N')
        'b1i'   → ('b1i', 'pure')
    """
    has_N = "N" in code
    has_P = "P" in code
    cleaned = code.replace("N", "").replace("P", "")
    if has_N and has_P:
        return cleaned, "had_both"
    if has_N:
        return cleaned, "had_N"
    if has_P:
        return cleaned, "had_P"
    return cleaned, "pure"


def classify_code(code) -> str:
    """One of: 'empty' | 'N' | 'P' | 'asymmetric' | 'full' | 'partial' | 'unknown'.

    'full'    = an alphanumeric code with no N/P (clean signature)
    'partial' = an alphanumeric code that contained N or P inside (cleaned)
    """
    s = normalize(code)
    if s is None:
        return "empty"
    if s == "N":
        return "N"
    if s == "P":
        return "P"
    if ASYM_RE.match(s):
        return "asymmetric"
    if HAS_NP_RE.search(s):
        # Cleaned version must still be a valid alphanumeric token of length≥1
        cleaned, _ = clean_partial(s)
        if cleaned and VALID_CODE_RE.match(cleaned):
            return "partial"
        return "unknown"
    if VALID_CODE_RE.match(s):
        return "full"
    return "unknown"


def split_asymmetric(code: str) -> tuple[str, str, str]:
    """Split asymmetric code → (right, left, prefix).

    The prefix color letter (if present) is appended as suffix to BOTH halves.

    Example:
        'Ra2bLb'   → ('a2b', 'b', '')
        'fRa6La1'  → ('a6f', 'a1f', 'f')
        'Rb2bLN'   → ('b2b', 'N',  '')
    """
    m = ASYM_RE.match(code)
    if not m:
        raise ValueError(f"Code {code!r} does not match asymmetric pattern.")
    prefix = m.group(1) or ""
    right = m.group(2)
    left = m.group(3)
    if prefix:
        right = right + prefix
        left = left + prefix
    return right, left, prefix


def find_partial_ambiguous(codes: list[str]) -> set[str]:
    """Return codes that are strict substrings of another code in the list.

    A code C is ambiguous iff there exists C' in `codes` with C != C' and C in C'.
    Comparison is on the *cleaned* forms (after N/P stripping).
    """
    unique = set(codes)
    ambiguous: set[str] = set()
    for c in unique:
        if c == "":
            continue
        for other in unique:
            if c == other or other == "":
                continue
            if c in other:
                ambiguous.add(c)
                break
    return ambiguous


# ---------------------------------------------------------------------------
# Color / pattern decomposition
# ---------------------------------------------------------------------------

# D8 codes (after N/P cleaning) follow the shape  a<color?>(b<pattern?>)?
# All four sub-parts may be empty when info was lost during cleaning:
#   'a4'    -> color='4', pattern='(no pattern)'  (no 'b' marker)
#   'a4b5'  -> color='4', pattern='5'
#   'ab4'   -> color='missing', pattern='4'       (was aNb4)
#   'a5b'   -> color='5', pattern='missing'       (was a5bN or a5bP)
#   'a3b'   -> color='3', pattern='missing'       (was a3bP)
D8_RE = re.compile(r"^a([0-9]*)(b([0-9a-z]*))?$")


def split_color_pattern(code: str, region: str) -> tuple[str, str] | None:
    """Decompose code into (color, pattern).

    A1/A2/C6 rule: trailing letter from COLOR_LETTERS[region] is the color,
    the rest is the pattern. If the code does not end with a color letter,
    color='' (no color identified) and the entire code is pattern.

    D8 rule: code shape is `a<color?>(b<pattern?>)?` after cleaning.
    Empty parts are surfaced as 'missing' (color/pattern was N/P, removed
    in cleaning) or '(no pattern)' (no 'b' marker at all).
    """
    if region not in {"A1", "A2", "C6", "D8"}:
        return None
    if not code:
        return None

    if region in {"A1", "A2", "C6"}:
        colors = COLOR_LETTERS[region]
        last = code[-1]
        if last in colors:
            return (last, code[:-1])
        return ("", code)

    if region == "D8":
        m = D8_RE.match(code)
        if not m:
            return None
        color_raw = m.group(1) or ""
        b_marker = m.group(2)
        pattern_raw = m.group(3) if b_marker else None

        color = color_raw if color_raw else "missing"
        if b_marker is None:
            pattern = "(no pattern)"
        else:
            pattern = pattern_raw if pattern_raw else "missing"
        return (color, pattern)

    return None


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def load_data(path: Path = INPUT_FILE, only_with_pictures: bool = False) -> pd.DataFrame:
    """Return the analysis pool: every wolf with a non-empty `code`.

    Canonical rule (user-stated 2026-05-11): **any wolf that has a `code` value
    is an identified wolf and is part of the analysis pool**, regardless of
    `#pictures`. The picture count is informational only; data-entry errors
    in `#pictures` (e.g. O80 currently has #pictures=0 as a typo to fix) MUST
    NOT exclude a wolf from analysis.

    `only_with_pictures=True` is preserved as an *optional* extra filter for
    studies that need photographed-only wolves, but it is NO LONGER the
    default and should NOT be used for the canonical pool.
    """
    df = pd.read_excel(path, sheet_name=SHEET_NAME)
    df.columns = [str(c).strip() for c in df.columns]
    # Canonical filter: keep every wolf with a non-empty `code`.
    if "code" in df.columns:
        df = df[df["code"].notna()].copy()
    if only_with_pictures:
        pics = pd.to_numeric(df["#pictures"], errors="coerce").fillna(0)
        df = df[pics > 0].copy()
    return df.reset_index(drop=True)


# ---------------------------------------------------------------------------
# Per-region processing
# ---------------------------------------------------------------------------

def process_region(df: pd.DataFrame, region: str) -> pd.DataFrame:
    """Add classification columns for a region.

    New columns:
        {region}_norm      : stripped string or None
        {region}_class     : 'empty' | 'N' | 'P' | 'asymmetric' | 'full' | 'partial' | 'unknown'
        {region}_cleaned   : version with N/P removed (used for substring check); '' for pure N/P
        {region}_status    : final status used in version C filtering:
                                'empty' | 'N' | 'P' | 'asymmetric' |
                                'partial_ambiguous' | 'unambiguous' | 'unknown'
        {region}_right     : right side of asymmetric (prefix appended), pd.NA otherwise
        {region}_left      : left side of asymmetric  (prefix appended), pd.NA otherwise
        {region}_color     : color letter (only for A1/A2/C6/D8 if applicable)
        {region}_pattern   : pattern part  (only for A1/A2/C6/D8 if applicable)
    """
    out = df.copy()
    norm_col = f"{region}_norm"
    class_col = f"{region}_class"
    cleaned_col = f"{region}_cleaned"
    status_col = f"{region}_status"
    right_col = f"{region}_right"
    left_col = f"{region}_left"
    color_col = f"{region}_color"
    pattern_col = f"{region}_pattern"

    out[norm_col] = out[region].apply(normalize)
    out[class_col] = out[region].apply(classify_code)

    # Initialize new columns
    out[cleaned_col] = ""
    out[right_col] = pd.NA
    out[left_col] = pd.NA
    out[color_col] = pd.NA
    out[pattern_col] = pd.NA

    # Fill cleaned, asymmetric halves
    for idx in out.index:
        cls = out.at[idx, class_col]
        s = out.at[idx, norm_col]
        if cls == "asymmetric":
            try:
                right, left, _prefix = split_asymmetric(s)
                out.at[idx, right_col] = right
                out.at[idx, left_col] = left
            except ValueError:
                out.at[idx, class_col] = "unknown"
        elif cls in ("full", "partial"):
            cleaned, _marker = clean_partial(s) if cls == "partial" else (s, "pure")
            out.at[idx, cleaned_col] = cleaned

    # Substring-ambiguity pool (full + partials cleaned)
    pool = [c for c in out[cleaned_col].tolist() if c]
    ambiguous = find_partial_ambiguous(pool)

    # Final status
    # RULE: any code that originally contained N or P (cls == 'partial') is
    # ALWAYS partial_ambiguous, because the missing character could be any
    # value, so the wolf's identity at this region is genuinely uncertain
    # — even if the cleaned form is not a substring of any other code.
    def status(row) -> str:
        c = row[class_col]
        if c in ("empty", "N", "P", "asymmetric", "unknown"):
            return c
        if c == "partial":
            return "partial_ambiguous"
        # c == "full"
        cleaned = row[cleaned_col]
        return "partial_ambiguous" if cleaned in ambiguous else "unambiguous"

    out[status_col] = out.apply(status, axis=1)

    # Color / pattern split (where applicable)
    if region in {"A1", "A2", "C6", "D8"}:
        for idx in out.index:
            cls = out.at[idx, class_col]
            if cls in ("full", "partial"):
                cleaned = out.at[idx, cleaned_col]
                cp = split_color_pattern(cleaned, region)
                if cp is not None:
                    out.at[idx, color_col] = cp[0]
                    out.at[idx, pattern_col] = cp[1]

    return out


def process_all_regions(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    for r in REGIONS:
        out = process_region(out, r)
    return out


# ---------------------------------------------------------------------------
# Versioning A / B / C, rank-frequency
# ---------------------------------------------------------------------------

def codes_for_version(processed: pd.DataFrame, region: str, version: str) -> pd.Series:
    """Return the series of codes (cleaned form) for a version.

    A: every non-empty wolf — uses {N, P, asymmetric_str, cleaned_full_or_partial}.
    B: drop N and P (keep asymmetric and partial_ambiguous).
    C: drop N, P, partial_ambiguous (cleanest pool).
    """
    norm_col = f"{region}_norm"
    cleaned_col = f"{region}_cleaned"
    status_col = f"{region}_status"
    df = processed[[norm_col, cleaned_col, status_col]].copy()
    df = df[df[status_col] != "empty"]
    if version == "A":
        # Use original normalized string (so N stays as 'N', asymmetric stays full)
        return df[norm_col].dropna()
    if version == "B":
        df = df[~df[status_col].isin(["N", "P"])]
        return df[norm_col].dropna()
    if version == "C":
        df = df[~df[status_col].isin(["N", "P", "partial_ambiguous", "unknown"])]
        # for asymmetric we keep the full asymmetric string as the wolf's code
        return df[norm_col].dropna()
    raise ValueError(f"Unknown version {version}")


def rank_frequency(processed: pd.DataFrame, region: str, version: str) -> pd.DataFrame:
    codes = codes_for_version(processed, region, version)
    if len(codes) == 0:
        return pd.DataFrame(columns=["region", "version", "rank", "code", "count", "percent"])
    counts = codes.value_counts()
    df = counts.reset_index()
    df.columns = ["code", "count"]
    df.insert(0, "version", version)
    df.insert(0, "region", region)
    df["rank"] = np.arange(1, len(df) + 1)
    df["percent"] = 100 * df["count"] / df["count"].sum()
    return df[["region", "version", "rank", "code", "count", "percent"]]


def all_rank_frequencies(processed: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for r in REGIONS:
        for v in ("A", "B", "C"):
            rows.append(rank_frequency(processed, r, v))
    return pd.concat(rows, ignore_index=True)


# ---------------------------------------------------------------------------
# Side-aware counting: asymmetric wolves contribute BOTH their right and left
# sides as separate code instances. Used to answer "how many wolves carry
# this code on any side?"
#
# Each non-asymmetric wolf contributes 1 entry; each asymmetric wolf
# contributes 2 entries (right side, left side).
# ---------------------------------------------------------------------------

def codes_with_sides(processed: pd.DataFrame, region: str, version: str) -> pd.Series:
    """Side-aware code stream.

    For full / partial / N / P wolves: 1 entry (the same as `codes_for_version`).
    For asymmetric wolves: 2 entries — the right and the left side
    (color prefix already appended by `split_asymmetric`).

    Version filtering:
        A: include all non-empty entries.
        B: drop pure N and P (asymmetric retained — its sides count separately).
        C: drop pure N, P, partial_ambiguous (asymmetric retained).
    """
    norm_col = f"{region}_norm"
    cleaned_col = f"{region}_cleaned"
    status_col = f"{region}_status"
    right_col = f"{region}_right"
    left_col = f"{region}_left"

    entries: list[str] = []
    for _, row in processed.iterrows():
        st = row[status_col]
        if st == "empty":
            continue
        if st == "asymmetric":
            r = row[right_col]
            l = row[left_col]
            if pd.notna(r):
                entries.append(str(r))
            if pd.notna(l):
                entries.append(str(l))
            continue
        if st == "N":
            if version != "A":
                continue
            entries.append("N")
            continue
        if st == "P":
            if version != "A":
                continue
            entries.append("P")
            continue
        if st == "unknown":
            entries.append(str(row[norm_col]))  # surfaces in any version (rare)
            continue
        if st == "partial_ambiguous":
            if version == "C":
                continue
            entries.append(str(row[cleaned_col]))
            continue
        if st == "unambiguous":
            entries.append(str(row[cleaned_col]))
            continue
    return pd.Series(entries)


def rank_frequency_sides(processed: pd.DataFrame, region: str, version: str) -> pd.DataFrame:
    codes = codes_with_sides(processed, region, version)
    if len(codes) == 0:
        return pd.DataFrame(columns=["region", "version", "rank", "code", "count", "percent"])
    counts = codes.value_counts()
    df = counts.reset_index()
    df.columns = ["code", "count"]
    df.insert(0, "version", version)
    df.insert(0, "region", region)
    df["rank"] = np.arange(1, len(df) + 1)
    df["percent"] = 100 * df["count"] / df["count"].sum()
    return df[["region", "version", "rank", "code", "count", "percent"]]


def all_rank_frequencies_sides(processed: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for r in REGIONS:
        for v in ("A", "B", "C"):
            rows.append(rank_frequency_sides(processed, r, v))
    return pd.concat(rows, ignore_index=True)


# ---------------------------------------------------------------------------
# Identification-capacity buckets — answer the question:
# "Of the 98 wolves in each region, how many had a code that was unique to
# them, vs shared with N other wolves, vs marked N/P/partial?"
# ---------------------------------------------------------------------------

ID_BUCKET_ORDER = [
    "Unique (1)",          # code count == 1 among unambiguous wolves
    "Shared 2-3",
    "Shared 4-6",
    "Shared 7-10",
    "Shared 11-20",
    "Shared 21-35",
    "Shared 36+",
    "Asymmetric",
    "Partial-ambiguous",
    "P",
    "N",
    "Empty",
]


def _bucket_for_count(count: int) -> str:
    if count == 1:
        return "Unique (1)"
    if 2 <= count <= 3:
        return "Shared 2-3"
    if 4 <= count <= 6:
        return "Shared 4-6"
    if 7 <= count <= 10:
        return "Shared 7-10"
    if 11 <= count <= 20:
        return "Shared 11-20"
    if 21 <= count <= 35:
        return "Shared 21-35"
    if count >= 36:
        return "Shared 36+"
    raise ValueError(f"unexpected count {count}")


def identification_buckets(processed: pd.DataFrame, region: str) -> dict[str, int]:
    """Return {bucket_label: wolf_count} for one region.

    Logic:
        - Each wolf is placed into exactly ONE bucket based on its status:
            N / P / partial_ambiguous / asymmetric / empty -> own bucket
            unambiguous -> bucket determined by how many *other* unambiguous
                          wolves share the same cleaned code in this region.
                          Count is the size of the same-code group, including
                          this wolf, so a singleton has count=1.
        - Sum over buckets is exactly len(processed).
    """
    status_col = f"{region}_status"
    cleaned_col = f"{region}_cleaned"

    # Count the same-code group size among unambiguous wolves only
    unambig = processed[processed[status_col] == "unambiguous"]
    code_counts = unambig[cleaned_col].value_counts().to_dict()

    buckets = {label: 0 for label in ID_BUCKET_ORDER}
    for _, row in processed.iterrows():
        st = row[status_col]
        if st == "N":
            buckets["N"] += 1
        elif st == "P":
            buckets["P"] += 1
        elif st == "partial_ambiguous":
            buckets["Partial-ambiguous"] += 1
        elif st == "asymmetric":
            buckets["Asymmetric"] += 1
        elif st == "empty":
            buckets["Empty"] += 1
        elif st == "unambiguous":
            cleaned = row[cleaned_col]
            cnt = code_counts.get(cleaned, 1)
            buckets[_bucket_for_count(int(cnt))] += 1
        elif st == "unknown":
            # All unknowns should be resolved by classification; if any leak
            # through, treat them as partial-ambiguous (conservative).
            buckets["Partial-ambiguous"] += 1
    return buckets


def all_identification_buckets(processed: pd.DataFrame) -> pd.DataFrame:
    """Long-format table: region x bucket x count."""
    rows = []
    for r in REGIONS:
        b = identification_buckets(processed, r)
        n_total = sum(b.values())
        for bucket, cnt in b.items():
            rows.append({
                "region": r,
                "bucket": bucket,
                "count": cnt,
                "percent": round(100 * cnt / max(n_total, 1), 2),
            })
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Diversity metrics
# ---------------------------------------------------------------------------

def shannon_entropy_bits(counts) -> float:
    arr = np.asarray(list(counts), dtype=float)
    arr = arr[arr > 0]
    if arr.size == 0:
        return 0.0
    return float(scipy_entropy(arr, base=2))


def gini_simpson(counts) -> float:
    arr = np.asarray(list(counts), dtype=float)
    s = arr.sum()
    if s == 0:
        return 0.0
    p = arr / s
    return float(1 - np.sum(p ** 2))


def region_summary(processed: pd.DataFrame) -> pd.DataFrame:
    """Per-region diversity / visibility summary.

    Field definitions:
      * n_unambiguous   — wolves with status='unambiguous' (clean, well-defined
                          code; not partial, not N/P, not asymmetric).
                          NOTE: this is *wolves*, not distinct codes — many
                          wolves may share the same unambiguous code.
      * n_unique        — number of *distinct* codes in version C
                          (wolf-centric: asymmetric whole counts as one).
      * n_unique_sides  — number of distinct codes in side-aware view
                          (asymmetric splits into right + left).
      * top_codes       — comma-joined list of all codes tied for the highest
                          count in version A (raw).
      * top_freq        — that highest count.
      * shannon_entropy_bits — H computed on version C value-counts.
      * gini_simpson         — 1 - sum(p_i^2) on version C.
      * pct_usable          — 100 - pct_N - pct_P - pct_empty.
    """
    rows = []
    n_total_overall = len(processed)
    for r in REGIONS:
        status_col = f"{r}_status"
        statuses = processed[status_col].value_counts().to_dict()
        n_total = n_total_overall
        n_empty = statuses.get("empty", 0)
        n_N = statuses.get("N", 0)
        n_P = statuses.get("P", 0)
        n_asym = statuses.get("asymmetric", 0)
        n_partial_amb = statuses.get("partial_ambiguous", 0)
        n_unambiguous = statuses.get("unambiguous", 0)
        n_unknown = statuses.get("unknown", 0)

        # Wolf-centric (version C)
        codes_C = codes_for_version(processed, r, "C")
        n_unique = codes_C.nunique()
        counts_C = codes_C.value_counts().values
        H = shannon_entropy_bits(counts_C)
        GS = gini_simpson(counts_C)

        # Side-aware (version C)
        codes_C_sides = codes_with_sides(processed, r, "C")
        n_unique_sides = codes_C_sides.nunique()
        counts_C_sides = codes_C_sides.value_counts().values
        H_sides = shannon_entropy_bits(counts_C_sides)

        # Top codes — track ALL ties at the maximum frequency
        codes_A = codes_for_version(processed, r, "A")
        if len(codes_A):
            counts_A = codes_A.value_counts()
            top_freq = int(counts_A.iloc[0])
            tied_codes = counts_A[counts_A == top_freq].index.tolist()
            top_codes_str = ", ".join(str(c) for c in tied_codes)
            top_codes_list = [str(c) for c in tied_codes]
        else:
            top_freq = 0
            top_codes_str = ""
            top_codes_list = []

        denom = max(n_total, 1)
        rows.append({
            "region": r,
            "n_total": n_total,
            "n_empty": n_empty,
            "n_N": n_N,
            "n_P": n_P,
            "n_asymmetric": n_asym,
            "n_partial_ambiguous": n_partial_amb,
            "n_unambiguous": n_unambiguous,
            "n_unknown": n_unknown,
            "n_unique": n_unique,
            "n_unique_sides": n_unique_sides,
            "top_codes": top_codes_str,
            "top_codes_list": top_codes_list,
            "top_freq": top_freq,
            "shannon_entropy_bits": round(H, 6),
            "shannon_entropy_bits_sides": round(H_sides, 6),
            "gini_simpson": round(GS, 6),
            "pct_N": round(100 * n_N / denom, 2),
            "pct_P": round(100 * n_P / denom, 2),
            "pct_usable": round(100 * (denom - n_N - n_P - n_empty) / denom, 2),
        })
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Plot styling
# ---------------------------------------------------------------------------

def apply_publication_style() -> None:
    plt.rcParams.update({
        "font.family": "DejaVu Sans",
        "font.size": 11,
        "axes.linewidth": 1.2,
        "axes.labelsize": 12,
        "axes.titlesize": 13,
        "xtick.labelsize": 10,
        "ytick.labelsize": 10,
        "legend.fontsize": 10,
        "figure.dpi": 300,
        "savefig.dpi": 300,
        "savefig.bbox": "tight",
        "pdf.fonttype": 42,
        "ps.fonttype": 42,
    })


def save_three_formats(fig, path_no_ext: Path) -> list[Path]:
    paths = []
    for ext in ("png", "svg", "pdf"):
        p = path_no_ext.with_suffix(f".{ext}")
        fig.savefig(p)
        paths.append(p)
    return paths
