"""Pack-membership inference engine.

Implements Nili's formal criteria (see
`feedback_pack_inference_criteria.md`):
  - group = 2-4 wolves together; pack = 5+
  - direct co-occurrence (group photo) → high confidence
  - daytime fragments + nighttime headcount overlap → high confidence
  - lone = ≥10 days from nearest pack-member observation
          (≥14 days in Yehudia)
  - pack* / group* = ≤10 days time proximity OR at camera with anonymous
                     pack activity

Reads:    wolves_data.xlsx + the canonical pool from wolf_lib.load_data().
Writes:   pack_inference_report.md  (markdown summary)
Returns:  list[dict] of discrepancies, ready to be turned into Claude
          questions by build_claude_questions_for_inference().

Run standalone:
    python pack_inference.py
"""

from __future__ import annotations

import re
import sys
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path
from typing import Optional

import pandas as pd

from wolf_lib import INPUT_FILE, SHEET_NAME

PROJECT_DIR = Path(__file__).parent
OUT_MD = PROJECT_DIR / "pack_inference_report.md"
YEHUDIA_KEYS = {"yehodiya", "yehudia"}  # match polygon names containing these
LONE_THRESHOLD_DEFAULT = 10  # days
LONE_THRESHOLD_YEHUDIA = 14  # days

# ----------------------------------------------------------------------------
# Parsers
# ----------------------------------------------------------------------------

def parse_cams_spotted(v) -> tuple[list[int], list[str]]:
    """Return (numeric_cameras, reporter_names) from a `cams_spotted` cell.

    Reporter names are kept (per `feedback_cams_spotted_external.md`) but
    treated as non-spatial. Numeric cameras are clamped to 1-60.
    """
    if pd.isna(v): return [], []
    s = str(v).strip()
    if not s: return [], []
    nums: list[int] = []
    names: list[str] = []
    for tok in re.split(r"\s*,\s*", s):
        if not tok: continue
        if re.match(r"^\d+$", tok):
            n = int(tok)
            if 1 <= n <= 60:
                nums.append(n)
        else:
            names.append(tok)
    return nums, names


def parse_time_on_camera(v) -> tuple[Optional[date], Optional[date], str]:
    """Return (start_date, end_date, precision) where precision is
    'day' / 'month' / 'unparseable'. Both dates are inclusive."""
    if pd.isna(v): return None, None, "empty"
    s = str(v).strip()
    if not s: return None, None, "empty"

    def _year(y: str) -> int:
        n = int(y)
        return n if n >= 1000 else 2000 + n  # 2-digit year → 20xx

    # single date dd.mm.yy
    m = re.match(r"^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$", s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), _year(m.group(3))
        try: return date(y, mo, d), date(y, mo, d), "day"
        except ValueError: return None, None, "unparseable"

    # range same month: d-d.mm.yy
    m = re.match(r"^(\d{1,2})\s*-\s*(\d{1,2})\.(\d{1,2})\.(\d{2,4})$", s)
    if m:
        d1, d2, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3)), _year(m.group(4))
        try: return date(y, mo, d1), date(y, mo, d2), "day"
        except ValueError: return None, None, "unparseable"

    # range cross month: d.m-d.m.yy
    m = re.match(r"^(\d{1,2})\.(\d{1,2})\s*-\s*(\d{1,2})\.(\d{1,2})\.(\d{2,4})$", s)
    if m:
        d1, m1, d2, m2, y = int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4)), _year(m.group(5))
        try: return date(y, m1, d1), date(y, m2, d2), "day"
        except ValueError: return None, None, "unparseable"

    # range full: dd.mm.yy-dd.mm.yy
    m = re.match(r"^(\d{1,2})\.(\d{1,2})\.(\d{2,4})\s*-\s*(\d{1,2})\.(\d{1,2})\.(\d{2,4})$", s)
    if m:
        d1, m1, y1, d2, m2, y2 = (int(m.group(i)) for i in (1, 2, 3, 4, 5, 6))
        y1, y2 = _year(str(y1)), _year(str(y2))
        try: return date(y1, m1, d1), date(y2, m2, d2), "day"
        except ValueError: return None, None, "unparseable"

    # month/year only m.yyyy
    m = re.match(r"^(\d{1,2})\.(\d{4})$", s)
    if m:
        mo, y = int(m.group(1)), int(m.group(2))
        try:
            d_start = date(y, mo, 1)
            d_end = date(y, mo, 28)  # safe end-of-month approximation
            return d_start, d_end, "month"
        except ValueError: return None, None, "unparseable"

    # month/year range m.yyyy-m.yyyy
    m = re.match(r"^(\d{1,2})\.(\d{4})\s*-\s*(\d{1,2})\.(\d{4})$", s)
    if m:
        m1, y1, m2, y2 = int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4))
        try:
            return date(y1, m1, 1), date(y2, m2, 28), "month"
        except ValueError: return None, None, "unparseable"

    return None, None, "unparseable"


def parse_seen_with(v) -> tuple[list[str], int, bool, bool, list[str]]:
    """Return (explicit_serial_refs, unrecognized_count, is_seen_together,
                 has_unknown_value, raw_tokens)."""
    if pd.isna(v): return [], 0, False, False, []
    s = str(v).strip()
    if not s: return [], 0, False, False, []
    lower = s.lower()
    if lower in ("seen together", "seen together*"):
        return [], 0, True, False, [s]
    if lower == "unknown":
        return [], 0, False, True, [s]
    refs: list[str] = []
    unrec = 0
    raw: list[str] = []
    for tok in re.split(r"\s*,\s*", s):
        if not tok: continue
        raw.append(tok)
        for sub in re.split(r"\s*\+\s*", tok):
            sub = sub.strip()
            if not sub: continue
            m = re.match(r"^(\d+)\s+unrecognized\*?\??$", sub, re.IGNORECASE)
            if m:
                unrec += int(m.group(1))
                continue
            refs.append(sub)
    return refs, unrec, False, False, raw


def normalize_polygon(s: str) -> str:
    return str(s).strip().lower() if pd.notna(s) else ""


# ----------------------------------------------------------------------------
# Core inference
# ----------------------------------------------------------------------------

def load_table() -> pd.DataFrame:
    df = pd.read_excel(INPUT_FILE, sheet_name=SHEET_NAME)
    df.columns = [str(c).strip() for c in df.columns]
    df = df[df["code"].notna() & (df["code"].astype(str).str.strip() != "")].reset_index(drop=True)
    return df


def build_observation_events(df: pd.DataFrame) -> dict[tuple, list[str]]:
    """Group wolves with `seen with`='seen together' (or '*') by their
    (time on camera, cams_spotted) — these define observation cliques."""
    events: dict[tuple, list[str]] = defaultdict(list)
    for _, row in df.iterrows():
        sw = str(row.get("seen with", "")).strip().lower()
        if sw not in ("seen together", "seen together*"):
            continue
        key = (str(row.get("time on camera", "")).strip(),
               str(row.get("cams_spotted", "")).strip())
        events[key].append(str(row["serial number"]).strip())
    return events


def build_cooccurrence(df: pd.DataFrame, events: dict[tuple, list[str]]) -> dict[str, set[str]]:
    """For each wolf, set of co-occurring partners."""
    co: dict[str, set[str]] = defaultdict(set)
    # Direct refs from `seen with`
    for _, row in df.iterrows():
        sn = str(row["serial number"]).strip()
        refs, _, _, _, _ = parse_seen_with(row.get("seen with"))
        for r in refs:
            co[sn].add(r)
    # Inferred from "seen together" cliques (events with ≥2 wolves)
    for key, members in events.items():
        if len(members) < 2: continue
        for m in members:
            co[m].update(x for x in members if x != m)
    return co


def normalize_pack_name(name: str) -> str:
    """Strip the probability suffix `*` and lowercase. Per 2026-05-13 rule:
    `dark pack` and `dark pack*` are the SAME pack identity (the * just
    marks individual wolves as probable members of the same pack)."""
    if not isinstance(name, str): return ""
    return name.strip().rstrip("*").strip().lower()


def build_pack_signatures(df: pd.DataFrame) -> dict[str, dict]:
    """Group wolves by NORMALISED `pack name` (* suffix stripped). Per the
    2026-05-13 grammar rule, `X` and `X*` are the same pack. Tracks which
    members are confirmed vs probable for downstream reporting."""
    raw_groups: dict[str, list] = defaultdict(list)
    raw_display: dict[str, str] = {}  # remember canonical (longest non-* form) for display
    for pn, group in df.groupby("pack name", dropna=True):
        if not isinstance(pn, str): continue
        name = pn.strip()
        if name.lower().rstrip("*").strip() in ("lone", "unknown", "?", "") or not name:
            continue
        norm = normalize_pack_name(name)
        for _, row in group.iterrows():
            raw_groups[norm].append((row, name))
        # Track the best display name: prefer a form WITHOUT the *
        if norm not in raw_display or (raw_display[norm].endswith("*") and not name.endswith("*")):
            raw_display[norm] = name.rstrip("*").strip() if not name.endswith("*") else name

    sigs: dict[str, dict] = {}
    for norm, rows_with_label in raw_groups.items():
        members = []
        probable_members = []
        polys = set()
        cams = set()
        dmin, dmax = None, None
        for row, label in rows_with_label:
            sn = str(row["serial number"]).strip()
            if label.endswith("*"):
                probable_members.append(sn)
            else:
                members.append(sn)
            polys.add(normalize_polygon(row.get("main poligon")))
            for p in re.split(r"\s*,\s*", str(row.get("area","")).strip()):
                polys.add(p.lower())
            nums, _ = parse_cams_spotted(row.get("cams_spotted"))
            cams.update(nums)
            ds, de, _ = parse_time_on_camera(row.get("time on camera"))
            if ds:
                dmin = ds if dmin is None or ds < dmin else dmin
                dmax = de if dmax is None or de > dmax else dmax
        display = raw_display.get(norm, norm)
        sigs[display] = {
            "members": members + probable_members,   # all wolves involved
            "confirmed_members": members,
            "probable_members": probable_members,
            "polygons": polys - {""},
            "cameras": cams,
            "date_min": dmin,
            "date_max": dmax,
            "is_starred": False,  # the pack itself is no longer "starred"
            "normalized": norm,
        }
    return sigs


def days_between(d1: Optional[date], d2: Optional[date]) -> Optional[int]:
    if d1 is None or d2 is None: return None
    return abs((d1 - d2).days)


def closest_pack_member_distance(wolf_dates: tuple[Optional[date], Optional[date]],
                                  wolf_polys: set[str],
                                  pack_sigs: dict[str, dict],
                                  exclude_pack: Optional[str] = None) -> tuple[Optional[int], Optional[str]]:
    """[DEPRECATED — kept for back-compat. Use strict_pack_candidates instead.]
    Polygon-only overlap. Returns the nearest pack by time, in any
    overlapping polygon."""
    ws, we = wolf_dates
    if ws is None: return None, None
    best = None
    best_pack = None
    for pname, sig in pack_sigs.items():
        if exclude_pack and pname == exclude_pack: continue
        if not (sig["polygons"] & wolf_polys): continue
        if sig["date_min"] is None: continue
        if we < sig["date_min"]:
            gap = (sig["date_min"] - we).days
        elif ws > sig["date_max"]:
            gap = (ws - sig["date_max"]).days
        else:
            gap = 0
        if best is None or gap < best:
            best = gap; best_pack = pname
    return best, best_pack


def build_member_observations(df: pd.DataFrame, pack_sigs: dict[str, dict]) -> dict:
    """Per-pack list of member observations: (member_serial, ds, de, cams_set)."""
    member_obs: dict[str, list] = {}
    for pname, sig in pack_sigs.items():
        obs = []
        for m in sig["members"]:
            mrow = df[df["serial number"].astype(str).str.strip() == m]
            if len(mrow) == 0: continue
            mrow = mrow.iloc[0]
            ds, de, _ = parse_time_on_camera(mrow.get("time on camera"))
            cams, _ = parse_cams_spotted(mrow.get("cams_spotted"))
            obs.append((m, ds, de, set(cams)))
        member_obs[pname] = obs
    return member_obs


def strict_pack_candidates(wolf_cams: set[int],
                            wolf_start: Optional[date],
                            wolf_end: Optional[date],
                            member_obs: dict,
                            threshold_days: int) -> list[tuple[str, str, list[int], str, str]]:
    """STRICT rule (Nili 2026-05-13): for each pack, the wolf is a candidate
    iff there's a pack-member observation at the SAME camera, within
    `threshold_days` of BOTH the wolf's start AND end dates (for ranges),
    or just the single date (for single-observation wolves).

    Returns list of (pack_name, evidence_summary, shared_cameras,
    start_match_member, end_match_member). Empty list = stays `lone`.
    """
    if wolf_start is None or not wolf_cams:
        return []
    is_single = (wolf_start == wolf_end)
    out = []
    for pname, obs in member_obs.items():
        if not obs: continue
        sm = None; em = None
        for m, mds, mde, mcams in obs:
            if mds is None: continue
            shared = mcams & wolf_cams
            if not shared: continue
            # start endpoint
            if mds <= wolf_start <= mde or min(abs((mds - wolf_start).days),
                                                abs((mde - wolf_start).days)) <= threshold_days:
                if sm is None: sm = (m, sorted(shared))
            # end endpoint (only matters if not single)
            if not is_single:
                if mds <= wolf_end <= mde or min(abs((mds - wolf_end).days),
                                                  abs((mde - wolf_end).days)) <= threshold_days:
                    if em is None: em = (m, sorted(shared))
        if is_single and sm:
            out.append((pname, f"single obs matched {sm[0]} on cam {sm[1]}", sm[1], sm[0], "single"))
        elif (not is_single) and sm and em:
            out.append((pname, f"start={sm[0]}@cam{sm[1]}; end={em[0]}@cam{em[1]}",
                        sorted(set(sm[1]) | set(em[1])), sm[0], em[0]))
    return out


def is_yehudia(poly_set: set[str]) -> bool:
    return any(any(k in p for k in YEHUDIA_KEYS) for p in poly_set)


# ----------------------------------------------------------------------------
# Classification per wolf
# ----------------------------------------------------------------------------

def classify_wolf(row, cooccurrence: dict[str, set[str]],
                  pack_sigs: dict[str, dict],
                  member_obs: dict) -> dict:
    """Return inferred {social_dynamic, pack_candidates, evidence}.

    Uses STRICT criterion (2026-05-13): pack candidacy requires same-camera
    matches at BOTH endpoints (or the single observation date).
    """
    sn = str(row["serial number"]).strip()
    own_polys = {normalize_polygon(row.get("main poligon"))}
    for p in re.split(r"\s*,\s*", str(row.get("area","")).strip()):
        own_polys.add(p.lower())
    own_polys.discard("")
    ds, de, _ = parse_time_on_camera(row.get("time on camera"))
    cams_list, _ = parse_cams_spotted(row.get("cams_spotted"))
    own_cams = set(cams_list)
    threshold = LONE_THRESHOLD_YEHUDIA if is_yehudia(own_polys) else LONE_THRESHOLD_DEFAULT

    partners = cooccurrence.get(sn, set())
    partners = {p for p in partners if p and not p.lower() in ("unknown", "")}

    own_packs = [pn for pn, sig in pack_sigs.items() if sn in sig["members"]]

    if own_packs:
        pack_name = own_packs[0]
        sig = pack_sigs[pack_name]
        n_members = len(sig["members"])
        return {
            "inferred_social_dynamic": "pack" if n_members >= 5 else "group",
            "inferred_pack_candidates": own_packs,
            "evidence": f"listed as member of {pack_name} ({n_members} members)",
            "starred": sig["is_starred"],
        }

    has_cooccurrence = len(partners) > 0
    # STRICT candidacy: same-camera + both-endpoint check
    candidates = strict_pack_candidates(own_cams, ds, de, member_obs, threshold)

    if not has_cooccurrence and not candidates:
        return {
            "inferred_social_dynamic": "lone",
            "inferred_pack_candidates": [],
            "evidence": "no co-occurrence; no pack at the same camera within threshold (strict rule)",
            "starred": False,
        }

    if not has_cooccurrence and candidates:
        # Could be multiple candidates (ambiguous); pick highest-confidence
        # but report all so user can choose.
        cand_names = [c[0] for c in candidates]
        # Decide pack vs group via largest candidate's size
        best = max(cand_names, key=lambda n: len(pack_sigs[n]["members"]))
        return {
            "inferred_social_dynamic": "pack*" if len(pack_sigs[best]["members"]) >= 5 else "group*",
            "inferred_pack_candidates": cand_names,
            "evidence": " | ".join(f"{c[0]}: {c[1]}" for c in candidates),
            "starred": True,
        }

    if has_cooccurrence:
        partner_packs = []
        for p in partners:
            for pn, sig in pack_sigs.items():
                if p in sig["members"]:
                    partner_packs.append(pn)
        partner_packs = sorted(set(partner_packs))
        if partner_packs:
            sig = pack_sigs[partner_packs[0]]
            return {
                "inferred_social_dynamic": "pack*" if len(sig["members"]) >= 5 else "group*",
                "inferred_pack_candidates": partner_packs,
                "evidence": f"co-occurred with members of {', '.join(partner_packs)} but not formally listed",
                "starred": True,
            }
        return {
            "inferred_social_dynamic": "group",
            "inferred_pack_candidates": [],
            "evidence": f"co-occurred with {len(partners)} wolf(s) but no known pack match: {sorted(partners)}",
            "starred": False,
        }

    return {
        "inferred_social_dynamic": "unknown",
        "inferred_pack_candidates": [],
        "evidence": "insufficient evidence",
        "starred": False,
    }


# ----------------------------------------------------------------------------
# Main: find discrepancies and write report
# ----------------------------------------------------------------------------

def main() -> list[dict]:
    df = load_table()
    print(f"loaded {len(df)} wolves")
    events = build_observation_events(df)
    print(f"observation events (date+cam clusters): {len(events)}")
    co = build_cooccurrence(df, events)
    print(f"co-occurrence graph: {sum(len(v) for v in co.values())//2} edges")
    sigs = build_pack_signatures(df)
    print(f"pack signatures: {len(sigs)} packs")
    member_obs = build_member_observations(df, sigs)

    discrepancies = []
    for _, row in df.iterrows():
        sn = str(row["serial number"]).strip()
        existing = str(row.get("social dynamic", "")).strip().lower()
        existing_pack = str(row.get("pack name", "")).strip()
        result = classify_wolf(row, co, sigs, member_obs)
        inferred = result["inferred_social_dynamic"]
        # Compare base category (strip * for comparison)
        existing_base = existing.rstrip("*")
        inferred_base = inferred.rstrip("*")
        if not existing:
            kind = "missing_existing"
        elif existing_base != inferred_base:
            kind = "mismatch"
        elif existing.endswith("*") != inferred.endswith("*"):
            kind = "confidence_diff"
        else:
            kind = "ok"
        if kind != "ok":
            discrepancies.append({
                "serial": sn,
                "kind": kind,
                "existing_social_dynamic": existing or "(empty)",
                "existing_pack_name": existing_pack or "(empty)",
                "inferred_social_dynamic": inferred,
                "inferred_pack_candidates": result["inferred_pack_candidates"],
                "evidence": result["evidence"],
                "row_index": int(row.name),
            })

    # Write markdown report
    lines = [f"# Pack-Inference Report\n",
             f"Generated: 2026-05-12 — algorithm per `feedback_pack_inference_criteria.md`\n",
             f"Total wolves: {len(df)}",
             f"Pack signatures: {len(sigs)}",
             f"Co-occurrence edges: {sum(len(v) for v in co.values())//2}",
             f"Discrepancies (need user review): **{len(discrepancies)}**\n"]
    lines.append("## Discrepancies by kind\n")
    by_kind: dict[str, list] = defaultdict(list)
    for d in discrepancies:
        by_kind[d["kind"]].append(d)
    for kind, items in sorted(by_kind.items()):
        lines.append(f"### {kind} — {len(items)} wolves\n")
        lines.append("| serial | existing dyn | existing pack | inferred dyn | candidate pack(s) | evidence |")
        lines.append("|---|---|---|---|---|---|")
        for d in items:
            packs = ", ".join(d["inferred_pack_candidates"]) or "—"
            lines.append(f"| {d['serial']} | {d['existing_social_dynamic']} | {d['existing_pack_name']} | "
                         f"{d['inferred_social_dynamic']} | {packs} | {d['evidence'][:120]} |")
        lines.append("")

    lines.append("## Pack signatures used\n")
    lines.append("| pack name | n members | polygons | date range | cameras |")
    lines.append("|---|---|---|---|---|")
    for pn, sig in sorted(sigs.items(), key=lambda kv: -len(kv[1]["members"])):
        polys = ", ".join(sorted(sig["polygons"]))[:60]
        dr = f"{sig['date_min']} — {sig['date_max']}" if sig["date_min"] else "—"
        cams = ", ".join(str(c) for c in sorted(sig["cameras"]))[:50] or "—"
        lines.append(f"| {pn} | {len(sig['members'])} | {polys} | {dr} | {cams} |")

    OUT_MD.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote: {OUT_MD}")
    print(f"discrepancies: {len(discrepancies)}")
    return discrepancies


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
