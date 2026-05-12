# Wolf Pelt Pattern Analysis — Project Memory

> **For Claude in future sessions**: read this file in full before doing any work in this directory. It captures every decision, rule, and code path we agreed on. The goal is that you can pick up the work immediately without re-deriving anything.

---

## ✅ NEW TABLE INTEGRATED (2026-05-02)

The new, larger Excel file `Golan Hights wolves data.xlsx` has been integrated.
Status as of this session:

- Source file moved into the project: `wolves_data.xlsx` (78.9 KB).
- Backup of the previous file: `wolves_data.OLD.xlsx`.
- Canonical analysis pool: **100 wolves** (every row with `code != null`).
  Sheet (2) has 104 rows × 28 cols; 4 rows have empty `code` and are dropped.
  *(Previously listed as 99 with `#pictures > 0` — that filter was rescinded
  on 2026-05-11 per user statement: "any wolf with a code is an identified
  wolf; the picture count is informational only".)*
- A new Excel sheet `נתוני זיהוי זאבים` (without the `(2)`) appeared in the file
  with 106 rows × 21 cols — it lacks `code` / `#pictures` and is **not used by
  the pipeline**. Treat sheet `נתוני זיהוי זאבים (2)` as canonical.
- A third sheet `גרפים` (11 rows) is auxiliary and untouched.
- 9 new metadata columns are now in sheet (2): `name`, `gender`, `cams_spotted`,
  `social dynamic`, `שיוך` (Hebrew), `pack name`, `seen with`, `notes`,
  `time on camera`. Old `D10` column was dropped (replaced by `notes`).
- Column meanings are documented in **`data_dictionary.md`** — read that
  alongside this file.
- `wolf_lib.load_data()` filter: rows with empty `code` are dropped
  (4 such rows: `M11H`, `F25`, `Y38`, trailing blank). The `#pictures > 0`
  filter is **disabled by default** (since 2026-05-11) — passing
  `only_with_pictures=True` is preserved for optional photographed-only
  studies but is NOT the canonical pool.
- Known data-quality item: `O80` has a code but `#pictures = 0` — this is a
  typo in the picture count the user will fix. **O80 is included in the
  analysis pool**; only the picture-count value is wrong, not the wolf's
  existence/identification.

### New artifact: interactive data table

A self-contained `data_table.html` is now generated alongside `wolf_dashboard.html`:

- Single static HTML file, sharable anywhere (Google Drive / GitHub Pages / email).
- **Viewer mode** (default): read-only, sortable, per-column header filter (every
  column except `code`), column-visibility menu, free-text search, CSV/XLSX export.
- **Admin mode**: unlocked by password `112358` (SHA-256 hashed in the page; soft
  client-side gate). Reveals click-to-edit cells, add/delete rows, and a
  "Save → download wolves_data.xlsx" button that preserves all 3 sheets.
- Empty-code rows are HIDDEN by default in viewer; admin sees them tinted yellow.
- Edits are auto-saved to `localStorage` until the user clicks Save.
- Built by `build_data_table.py`; refreshed automatically by `update.bat`.

### Re-integration recipe (if a future, even-larger file arrives)

1. **Discovery first**: run `python step0_discover.py <new path>`.
2. **Sheet selection**: confirm the sheet with `code` + `#pictures` (the analysis
   needs both). If a Hebrew name changes, update `wolf_lib.SHEET_NAME` only with
   the user's explicit approval.
3. **Backup** the current `wolves_data.xlsx` to `wolves_data.OLD.xlsx`.
4. **Replace** the source file in the project folder.
5. **Update `INPUT_FILE` / `SHEET_NAME`** if needed.
6. **Run the audit**: `step1c_audit.py`. Must say `ALL CHECKS PASSED`.
7. **Run** `update.bat` — refreshes both `wolf_dashboard.html` and `data_table.html`.
8. **Update** `data_dictionary.md` with any new column meanings (ask the user).
9. **Update this file (CLAUDE.md)** with the new headline numbers.

### Default extension policy for further new columns

| Type | Default action |
|------|----------------|
| Per-wolf metadata (age, sex, pack…) | Pass through; add filter; `data_dictionary.md` entry. |
| Photo / quality metadata | Pass through; cross-tab if useful. |
| Geographic (lat/lon) | Pass through; consider map view. |
| Behavioural | Pass through; do not modify identification pipeline. |
| DNA / molecular | INDEPENDENT validation channel — don't merge. |
| More pelt regions | Major change — propose, wait for approval. |
| Per-region attribute columns | Pass through; do NOT replace pattern code. |
| Per-sighting rows | STOP — major model change, ask user. |

### Default extension policy (what to do with new info, given user permission)

| New column type | Default behaviour |
|-----------------|-------------------|
| **Per-wolf metadata** (age, sex, pack, …) | Pass through into `wolves_processed.csv`; surface as additional filter dropdowns in the **Wolves Table** tab; consider an additional summary/breakdown tab. |
| **Photo / quality metadata** | Pass through; surface as filter; consider an "image quality vs. visibility" cross-tab. |
| **Geographic** | Pass through; consider a small map/scatter view if lat/lon present. |
| **Behavioural** | Pass through; do not modify the identification pipeline. |
| **DNA / molecular** | Treat as an INDEPENDENT validation channel for the pelt-ID method. Don't merge — present alongside. |
| **More pelt regions** | Major change. Propose plan: add to `REGIONS`, decide on color letters, run audit, propose visualisation update. WAIT for approval. |
| **Per-region attribute columns** | Pass through; consider extending the audit to validate format. Do NOT replace the pattern code. |
| **Per-sighting rows** | Stop. Ask whether to aggregate to per-wolf (one row per `serial number`) or to switch the entire analysis to per-sighting (which changes everything). |

### Compatibility checklist (run mentally for each new column)
- Does it break `load_data()` in `wolf_lib.py`? (column rename / removal of `#pictures` / `serial number`?)
- Does it change row uniqueness? (i.e., are there now multiple rows per wolf?)
- Does it require new validation rules in `step1c_audit.py`?
- Does it appear in the dashboard naturally, or do we need to extend `step3_build_app.py`?

If any of those are true → **stop and discuss** before running `update.bat`.

### What stays the same regardless
- The **9 region columns and their classification rules** (Sections 3–4 below) are CORE. They must keep working on the new data.
- The **status enum** (`unambiguous`, `asymmetric`, `partial_ambiguous`, `N`, `P`, `empty`, `unknown`) must remain.
- The **identification-bucket boundaries** (Unique / 2-3 / 4-6 / 7-10 / 11-20 / 21-35 / 36+) must remain unless the user explicitly changes them.
- The **`unambiguous` terminology** (never "unique" for status).
- The **English UI** for the dashboard.
- The **`update.bat` workflow** for refreshing.

---

## 1. Project Goal

Analyse pelt pattern codes from **98 wolves** across **9 anatomical regions** to:
1. **Prove the methodology** — show that wolves can be identified individually from pelt patterns.
2. **Describe the population** — characterize what was found in the Golan wolf population.

Final deliverable for the paper is **Figure 1**, an interactive HTML dashboard during exploration, plus static panels for publication.

---

## 2. Data Source

| Item | Value |
|------|-------|
| **Excel file** | `C:\Users\nilim\Desktop\wolf paper\wolves_data.xlsx` (in the project, not Downloads) |
| **Sheet name** | `נתוני זיהוי זאבים (2)` (Hebrew — Wolf Identification Data) |
| **Total rows in sheet** | 104 |
| **Wolves analysed (canonical pool)** | **100** — filtered by `code != null` only |
| **Excluded** | 4 rows with empty `code` (`M11H`, `F25`, `Y38`, trailing blank) |
| **`#pictures` filter — NOT applied** | The picture count is informational only; data-entry errors in `#pictures` (e.g. `O80` currently has `#pictures=0` as a typo the user will fix) do NOT exclude a wolf from analysis. **Any wolf with a non-empty `code` IS an identified wolf.** |
| **Collection window** | 3 months |
| **Same wolf rule** | One row per wolf regardless of how many times photographed |
| **Other sheets** | `נתוני זיהוי זאבים` (106×21, no code/pictures — NOT used) and `גרפים` (11 rows, auxiliary) |
| **Working directory** | `C:\Users\nilim\Desktop\wolf paper\` |
| **Python** | 3.10.0 at `C:\Users\nilim\AppData\Local\Programs\Python\Python310\python.exe` |

### Columns (sheet (2), 28 total)
- `serial number` — wolf ID (e.g., `M1`, `Y32`, `Sh109`)
- `name` — local nickname for known wolves (only ~3 filled; not for analysis)
- `area`, `main poligon` — geographic. `main poligon` = primary; `area` = all polygons seen in
- `gender` — `m`/`f`/blank (only when 100% certain)
- `cams_spotted` — comma-separated camera IDs from a 60-camera grid (1–60)
- `social dynamic` — `pack`/`group`/`unknown` (user's own size categorisation, paper will explain)
- `שיוך` (Hebrew), `pack name` — IGNORE for now (messy; user will clean later)
- `seen with` — wolves photographed together (incl. `1 unrecognized`/`2 unrecognized?` for unidentified neighbours)
- `notes` — free text from another expert; not for analysis
- `time on camera` — single date `dd.mm.yy` OR earliest-latest range `dd-dd.mm.yy`
- `#pictures`, `#right`, `#left`, `#front`, `#no good`, `#sights` — photo counts
- `code` — composite pelt-code string (9 regions joined with `_`)
- **9 region columns**: `A1`, `A2`, `B3`, `B4`, `B5`, `C6`, `C7`, `D8`, `D9`

The previous `D10` column has been removed (replaced by `notes`).
**See `data_dictionary.md` for the full per-column reference.**

### Anatomical groups (visual aid only — regions are analytically independent)

The 9 regions are organised into 4 anatomical groups (corrected per the user's
schematic + region-name table on 2026-05-03):

| Region | Group | Region name | Anatomical description | Primary variation encoded |
|---|---|---|---|---|
| **A1** | **A — Cheek** `#E91E63` | Infraorbital patch | Light/dark patch below the eye on the cheek | Shape, size, contrast |
| **A2** | A — Cheek | Malar (eye–ear) stripe | Stripe extending from eye toward ear | Presence, thickness, continuity |
| **B3** | **B — Periocular** `#42A5F5` | Below eye | Lower periocular region | Contrast, extent |
| **B4** | B — Periocular | Upper outer | Outer upper eye region | Shape, shading |
| **B5** | B — Periocular | Upper inner | Inner upper eye region near nasal bridge | Shape, contrast |
| **C6** | **C — Nasal** `#FF7043` | Central stripe | Stripe along bridge of nose | Width, continuity |
| **C7** | C — Nasal | Side region | Lateral nasal areas | Color contrast, extent |
| **D8** | **D — Nape** `#9C27B0` | Upper nape | Upper neck behind head | Color tone, patterning |
| **D9** | D — Nape | Side nape | Lateral neck region | Pattern, contrast |

Anatomical schematic asset: `assets/wolf_schematic.png` (side-profile illustration with
the 9 polygons hand-drawn in their group colours by the user, supplied 2026-05-03).

---

## 3. Classification Rules — CRITICAL

Each cell in a region column is classified into one of these statuses:

| Status | Meaning | Example raw value |
|--------|---------|-------------------|
| `empty` | NaN / blank cell | (NaN) |
| `N` | Region not visible in any photo | `N` |
| `P` | Region visible but pattern unclear | `P` |
| `asymmetric` | Different right/left patterns | `Ra2bLb`, `fRa6La1` |
| `unambiguous` | Clean alphanumeric code, well-defined | `b1i`, `a4b5` |
| `partial_ambiguous` | Code has missing info OR is substring of another code | see rules below |
| `unknown` | Doesn't match any pattern (should NEVER occur after rules — flagged in audit) | — |

> **NOTE**: We use `unambiguous` (NOT `unique`). The status indicates the code is well-defined — it does NOT imply the code appears only once. Many wolves can share the same `unambiguous` code (e.g., D9 has 78 wolves with status=unambiguous but only 4 distinct codes).

### Rule 1 — Asymmetric codes
- Format: `[<prefix>]R<right>L<left>` where `<prefix>` is an OPTIONAL color letter.
- Regex: `^([a-z])?R(.+?)L(.+)$`
- If a prefix is present (e.g., `f` in `fRa6La1`), it is appended as a **suffix** to BOTH right and left:
  - `fRa6La1` → right=`a6f`, left=`a1f`
  - `Ra2bLb` → right=`a2b`, left=`b`
  - `Rb2bLN` → right=`b2b`, left=`N` (left side not visible)
- The wolf **stays one entity** — never counted twice.

### Rule 2 — N or P inside a longer code (cleaning rule)
- Pure `N` or `P` cells stay as their own status.
- Codes that **contain** N or P **plus** other characters are classified as `partial`:
  - `c2xN` → cleaned form `c2x` (N stripped)
  - `aNb4` → cleaned form `ab4`
  - `a5bN` → cleaned form `a5b`
  - `a3bP` → cleaned form `a3b`
  - `Pa` → cleaned form `a`
- **CRITICAL**: any code that originally contained N or P (not pure) → automatically `partial_ambiguous` regardless of substring check, because the missing character could be any value.

### Rule 3 — Substring containment
- For codes that did NOT contain N/P (clean `full` codes):
  - Code C is `partial_ambiguous` iff there exists another code C' in the SAME region with C ≠ C' AND C is a substring of C'.
  - Example (region A1): `e` is contained in `a3e` and `b3e` → ambiguous.
  - Counter-example: `a3e` and `b3e` are NOT substrings of each other → both unambiguous.
- Comparison is done on **cleaned** strings (after N/P stripping).

### Rule 4 — Each region is analyzed independently
- The 9 regions are anatomically grouped (A/B/C/D) but **analytically independent**.
- No joint-information analysis (we removed C6+C7 and D8+D9 joint capacity from scope).
- Each wolf has 9 separate region codes that together form its individual ID.

### Rule 5 — Three data versions for rank-frequency
- **A** — raw, includes everything (N, P, partial, asymmetric, unambiguous)
- **B** — without N and P (keeps asymmetric and partial_ambiguous)
- **C** — clean: only `unambiguous` + `asymmetric` (the cleanest pool for diversity stats)

### Rule 6 — Top codes with ties
- Always list ALL codes tied for the maximum count, joined with `, ` in `top_codes`.
- Example: C6 → `c1f, c1g` (both 9 wolves).
- Example: A2 → `N` is the most common in version A (7 wolves) — the "top" depends on version.

---

## 4. Code structure per region (per user's 2026-05-03 explanation)

The codes are NOT a single uniform alphabet — each region has its own micro-grammar
that reflects the anatomical variation it captures.

| Region | Structure | Examples | What each piece encodes |
|---|---|---|---|
| **A1, A2** | `<pattern-letter><digit>[mod-letters][color-letter]` | `a5tye`, `b1l`, `c1zf`, `a1txi` | leading `a/b/c/d` = pattern type; digit = pattern refinement; up to 2 mid letters (e.g. `t`, `y`, `v`, `z`, `x`) = additional refinements; **trailing letter from `{e,f,g,h,i,j,k,l,m}` = color** |
| **B3, B4, B5** | `<pattern-letter><digit>[a/b]`  *with standalone exceptions: B3=`b`, B4=`d`, B5=`d`* | `c2b`, `b2b`, `a1b`, `c1`, `a2`, `b` (B3), `d` (B4/B5) | letter+digit = pattern; **trailing `a` = low contrast, trailing `b` = high contrast** (this is a contrast suffix, NOT a colour). **Exception (Nili 2026-05-12):** the standalone forms B3=`b`, B4=`d`, B5=`d` are complete codes on their own — they do NOT require a contrast suffix. |
| **C6** | same shape as A1/A2 | `c1f`, `a3i`, `c1g` | pattern type + refinement + **color** trailing letter from `{e,f,g,h,i,j,k,l}` (no `m`) |
| **C7** | pattern only — no color, no contrast suffix | `c`, `a1`, `b2` | "complementary" pattern; the lateral nasal area's variation isn't colour-encoded |
| **D8** | `a<color-digit>[b<pattern-digit>]` | `a4b5`, `a2b5`, `a3b` | **first digit (after `a`) = colour tone**; **second digit (after `b`) = pattern**; the `b` segment is optional when no patterning is visible |
| **D9** | `a<contrast-digit>` | `a2`, `a4`, `a5` | only **contrast level** is encoded (e.g. `a2` = contrast level 2) — there is no shape/pattern variable here, which is why D9 has only 4 distinct codes |

Implementation reference (`wolf_lib.py:split_color_pattern` etc.):
- A1/A2: trailing letter from `{e..m}` is colour, rest is pattern.
- C6: trailing letter from `{e..l}` is colour, rest is pattern.
- D8 regex `^a([0-9]*)(b([0-9a-z]*))?$` — first digits = colour, after `b` = pattern.
- B regions and C7 currently have NO formal colour/pattern split in `wolf_lib`; the
  `a/b` contrast suffix on B is implicit in the cleaned-code substring rule. *(If we
  later want explicit contrast aggregation for B, that becomes a small `wolf_lib`
  extension — not blocking visualisations.)*

After cleaning N/P, both colour and pattern parts of D8 can be empty:
- `a4` → colour `4`, pattern `(no pattern)` (no `b` marker)
- `a4b5` → colour `4`, pattern `5`
- `ab4` → colour `missing`, pattern `4`
- `a5b` → colour `5`, pattern `missing`
- `a3b` → colour `3`, pattern `missing`

The label `"missing"` indicates the part was N or P in the raw data and was stripped during cleaning.

**For visualisations**: when displaying codes in the dashboard, we can decompose them
into the labelled axes above (e.g. tooltip on a B3 cell `c2b` reads "pattern c2 — high
contrast"). The user has a formal internal document that maps individual letter
identities to specific morphologies; for the current visualisation scope we treat
codes as opaque IDs and rely on aggregate stats + photo examples.

---

## 5. File Structure (working directory)

```
C:\Users\nilim\Desktop\wolf paper\
├─ wolves_data.xlsx          ← MASTER data file (was in Downloads; now in the project)
├─ wolves_data.OLD.xlsx      ← backup of the previous master before the 2026-05-02 update
├─ wolf_lib.py               ← shared library (DO NOT BREAK — many scripts import from it)
├─ step0_discover.py         ← run this on a new Excel file (schema diff)
├─ step1_explore.py          ← Phase 1 exploratory (initial human-readable summary)
├─ step1b_review.py          ← Detailed per-region review (writes wolves_processed_preview.csv)
├─ step1c_audit.py           ← Comprehensive data verification (writes audit_report.md)
├─ step2_process.py          ← Main processing (writes wolves_processed.csv etc.)
├─ step3_build_app.py        ← Builds wolf_dashboard.html (analysis dashboard)
├─ step3_panelA_rankfreq.py  ← Static rank-frequency panels (kept as supplementary)
├─ build_data_table.py       ← Builds data_table.html (interactive admin/viewer + issue review)
├─ step1d_dataqc.py          ← Data quality check on the source xlsx (writes data_quality_report.*)
├─ update.bat                ← One-click refresh: process → audit → dataqc → dashboard → data table
├─ CLAUDE.md                 ← THIS FILE — read first
├─ SESSION_HANDOFF.md        ← read SECOND if returning to the project (per-session notes)
├─ data_dictionary.md        ← per-column meanings
├─ audit_report.md           ← latest analysis-pipeline audit
├─ data_quality_report.md    ← latest source-data QC report (errors / warnings / info)
├─ data_quality_report.json  ← machine-readable QC findings (consumed by data_table.html)
├─ claude_questions.json     ← Claude-authored open questions (read at build time → admin panel)
├─ data_decisions.json       ← Nili's status + comment per issue/question (single source of truth)
│
├─ wolves_processed.csv          ← every wolf × region with status / cleaned / right / left / color / pattern
├─ wolves_processed_preview.csv  ← subset for quick review
├─ region_codes_review.csv       ← long format wolf×region audit table
├─ rank_freq_per_region.csv      ← long format, versions A/B/C, wolf-centric
├─ rank_freq_sides.csv           ← side-aware (asymmetric → 2 entries)
├─ region_summary.csv            ← per-region diversity & visibility metrics
├─ color_pattern_freq.csv        ← color/pattern split frequencies (A1, A2, C6, D8)
├─ identification_buckets.csv    ← per-region wolf-bucket counts
│
├─ wolf_dashboard.html        ← analysis dashboard (open in browser)
├─ data_table.html            ← interactive admin/viewer table (admin password: 112358)
│
├─ panel_A_rank_frequency_grid_log.{png,svg,pdf}
├─ panel_A_rank_frequency_grid_linear.{png,svg,pdf}
├─ graph_1_rank_frequency_log.{png,svg,pdf}
├─ graph_1_rank_frequency_linear.{png,svg,pdf}
└─ .claude/                   ← (Claude Code session storage)
```

The plan file is at `C:\Users\nilim\.claude\plans\c-users-nilim-downloads-wolves-data-xls-floofy-flamingo.md`.

---

## 6. Workflow — How to Refresh / Run

### A. Editing data
1. Open `wolves_data.xlsx` in Excel.
2. Make edits and save.
3. Double-click `update.bat` in the project folder.
4. Wait ~5 s. The dashboard reopens with refreshed numbers.

`update.bat` runs five steps in order:
- `step2_process.py` — re-process all CSVs.
- `step1c_audit.py` — analysis pipeline audit (writes `audit_report.md`, appends Clarifications section from `data_decisions.json`).
- `step1d_dataqc.py` — source data quality check (writes `data_quality_report.md`, `.json`); suppresses findings with `decided_keep` status and inlines user comments from `data_decisions.json`.
- `step3_build_app.py` — rebuild analysis dashboard.
- `build_data_table.py` — rebuild interactive admin/viewer table (embeds the latest QC findings + `claude_questions.json` + prefilled decisions into the Fix & Clarify panel).

### Fix & Clarify Mode (admin-only)
- `data_table.html` includes a right-side panel under admin login (password `112358`).
- Two sources of items, unified UI:
  - **🤖 Claude's questions** — open questions Claude authored in `claude_questions.json` (methodology + per-wolf anomalies).
  - **QC findings** — auto-detected by `step1d_dataqc.py` (errors / warnings / info).
- Per item: status dropdown (`open`, `answered`, `decided_keep`, `fixed_in_xlsx`, `needs_more_data`), free-text comment, "Mark answered" / "Save comment".
- Filter tabs at the top: All / Needs reply / Answered / Resolved.
- Persistence layers (hot → cold):
  1. **localStorage** key `wolves_clarifications_v1` (hot in-browser cache).
  2. **`data_decisions.json`** in the project root (committed, single source of truth). Updated via the 💾 button → drop into the project folder → `update.bat` pre-fills the page from it on next build.
  3. Read by `step1d_dataqc.py` (suppression) and `step1c_audit.py` (Clarifications appendix).
- Round-trip: type in admin → 💾 download `data_decisions.json` → move into the project folder → run `update.bat` → next build embeds the saved answers.

### Refreshing Claude's open questions
- `claude_questions.json` is Claude-authored once per audit pass; replace it when you want a fresh batch (e.g. after new data).
- Schema: `{generated_at, generated_by, questions: [{id, kind: "row"|"general", serial, target_column, question, evidence, severity_hint}]}`.

### B. Manual commands (if `update.bat` not preferred)
```bash
cd "C:\Users\nilim\Desktop\wolf paper"
PY="C:\Users\nilim\AppData\Local\Programs\Python\Python310\python.exe"
"$PY" -X utf8 step2_process.py
"$PY" -X utf8 step1c_audit.py
"$PY" -X utf8 step3_build_app.py
start "" wolf_dashboard.html
```

### C. Required Python packages
`pandas`, `numpy`, `scipy`, `matplotlib`, `seaborn`, `openpyxl` — already installed for Python 3.10.

---

## 7. Key User Decisions / Preferences

These were debated in the original conversation. **DO NOT change them without explicit user permission.**

1. **Status name**: `unambiguous` (NOT `unique`) — clarifies it means "well-defined code", not "one-of-a-kind".
2. **Empty cells**: 1 wolf (Sh109) has empty D9 → user will fix in Excel; we count as `empty` until fixed.
3. **Asymmetric in identification buckets**: separate bucket called `Asymmetric` (NOT merged with Unique).
4. **Top codes**: always list ALL ties (e.g., `c1f, c1g` for C6).
5. **Identification bucket gap**: 21-35 was a single bucket (closing the original gap between 11-20 and 30-35).
6. **Dashboard language**: ENGLISH only (paper is in English).
7. **Anatomical grouping**: visual aid only — regions are analytically independent. No joint-info analysis.
8. **Dashboard preferred over static images**: an interactive HTML file is the primary deliverable for exploration. Static panels are kept as supplementary.
9. **Color palette**: anatomical colors (pink/blue/orange/purple) match the user's anatomical schematic.
10. **Two views for asymmetric**:
    - Wolf-centric (n_unique): asymmetric whole = 1 unique code.
    - Side-aware (rank_freq_sides): asymmetric → 2 entries (right + left). Used for "how often does code X appear on any side".

---

## 8. Identification Buckets (the new graph)

For each region, every wolf is placed into exactly ONE bucket. Sum per region = 98.

| Bucket | Logic | Color |
|--------|-------|-------|
| `Unique (1)` | unambiguous + cleaned-code count = 1 | `#1B5E20` dark green |
| `Shared 2-3` | unambiguous + count in [2,3] | `#66BB6A` |
| `Shared 4-6` | count in [4,6] | `#C5E1A5` |
| `Shared 7-10` | count in [7,10] | `#FFF176` |
| `Shared 11-20` | count in [11,20] | `#FFB74D` |
| `Shared 21-35` | count in [21,35] | `#F57C00` |
| `Shared 36+` | count ≥ 36 | `#6D4C41` brown |
| `Asymmetric` | status = asymmetric | `#1E88E5` blue |
| `Partial-ambiguous` | status = partial_ambiguous | `#9E9E9E` gray |
| `P` | status = P | `#FB8C00` |
| `N` | status = N | `#E53935` red |
| `Empty` | status = empty (data hole — should be fixed) | `#000000` |

Implemented in `wolf_lib.identification_buckets(processed, region)` and `all_identification_buckets(processed)`.

---

## 9. Findings Summary (for reference)

### Per-region diversity & visibility (region_summary.csv)
| Region | n_total | n_unambiguous | n_unique | H (bits) | Gini-Simpson | top_codes (count) | %usable |
|--------|---------|---------------|----------|----------|--------------|-------------------|---------|
| **A1** | 98 | 89 | **71** | **5.998** | 0.982 | b1i (5) | 99.0 |
| A2 | 98 | 81 | 40 | 5.020 | 0.963 | a1i, a4f (6) | 92.9 |
| B3 | 98 | 33 | 10 | 2.799 | 0.815 | b (18) | 66.3 |
| B4 | 98 | 57 | 13 | 3.262 | 0.879 | b2b (11) | 70.4 |
| B5 | 98 | 55 | 12 | 2.936 | 0.828 | a1b (18) | 70.4 |
| **C6** | 98 | 88 | 41 | 4.886 | 0.954 | c1f, c1g (9) | 94.9 |
| C7 | 98 | 78 | 7 | 2.370 | 0.773 | c (28) | 80.6 |
| D8 | 98 | 54 | 18 | 3.344 | 0.829 | a4b5 (20) | 91.8 |
| **D9** | 98 | 78 | **4** | **1.682** | 0.639 | a2 (40) | 79.6 |

### Headline insights
- **A1 is the strongest single-region identifier**: 55 of 98 wolves had a UNIQUE code (singleton).
- **C6 is the second strongest**: 26 unique singletons, 41 distinct codes overall.
- **D9 is essentially uninformative**: 0 singletons, only 4 distinct codes (a2 dominates with 40 wolves).
- **B3 has the worst visibility**: 33 wolves marked N or P (66% usable).

### Asymmetric wolves (13 total across 5 regions)
- A1: 2 (`Ra3vzfLb1f`, `Ra4vxiLa4txi`)
- A2: 3 (incl. `fRa6La1` with prefix color)
- B3: 2; B4: 3; B5: 3.
- C6, C7, D8, D9: none.

### Wolves with poor data (≥5 unobservable regions out of 9)
- F23 (7/9), Sh55 (6/9), F24, Y28, Sh59, In97 (5/9 each).
- Worth mentioning in Methods/Limitations of paper.

### Outstanding data issue
- **Sh109** has an empty D9 cell. Banner is shown in the dashboard until fixed.

---

## 10. Visualization Choices for Figure 1 (in user's English paper)

The user previewed several options and chose:
- **Interactive HTML dashboard** is the working/exploration tool.
- **Static Figure 1** for the paper will be a 3-panel composite (NOT YET BUILT — pending):
  - Panel A: 3×3 grid of rank-frequency curves (anatomical color coding).
  - Panel B: Composition stacked bars per region.
  - Panel C: Capacity Map scatter (entropy vs. % usable).
- **Identification Power tab** (the latest addition) is potentially Figure 2 or supplementary.

The user also wanted the heatmap (Graph 4) as supplementary — NOT YET BUILT.

---

## 11. Pending Work / Next Steps

> **Read `SESSION_HANDOFF.md` for the latest session-specific status.**
> The list below is the longer-term roadmap.

**Immediate (next session)**
1. User to walk through the data-quality issues in `data_table.html` admin mode and apply fixes.
2. User to fix `O80` (#pictures = 0 typo) and `Sh109` empty D9.
3. After fixes: download updated xlsx → run `update.bat` → confirm `data_quality_report.md` shows fewer issues.
4. **Stage 4 — Visualizations**: build interactive Plotly panels for the paper (G1–G9 as scoped in the plan file).

**Paper-ready outputs (later)**
5. Static Figure 1 composite (panels A+B+C side-by-side as a single image).
6. Heatmap supplementary (top 5–10 codes per region × 9 regions).
7. `analysis_report.md` — markdown summary of findings.
8. Methods text draft (Shannon, Gini-Simpson, bucket methodology).

**Open questions (parked until user revisits)**
9. `pack name` and `שיוך` cleanup — user owns this; ignore both columns in visualizations until done.
10. The 8 wolves only in non-(2) sheet (`F21s, O79, Sh37y, Sh56, Sh58, Sl63, Sn86, data`) — should any move into (2)?
11. Possible spatial / area-by-area patterns and rarefaction curves (mentioned in passing).

---

## 12. Quick Reference — Common Code Patterns

### Load & process the data
```python
from wolf_lib import load_data, process_all_regions, region_summary

df = load_data(only_with_pictures=True)   # 98 wolves
proc = process_all_regions(df)             # adds {region}_status, _cleaned, _right, _left, _color, _pattern
summary = region_summary(proc)
```

### Compute rank-frequency
```python
from wolf_lib import rank_frequency, rank_frequency_sides
rf = rank_frequency(proc, "A1", "C")             # wolf-centric
rfs = rank_frequency_sides(proc, "A1", "C")      # asymmetric splits into 2
```

### Compute identification buckets
```python
from wolf_lib import identification_buckets, ID_BUCKET_ORDER
buckets = identification_buckets(proc, "D9")
# returns {"Unique (1)": 0, "Shared 36+": 40, "N": 17, ..., "Empty": 1}
```

### Adding a new region
1. Update `wolf_lib.REGIONS` (and `REGION_GROUP` if anatomically separate).
2. If it has a color/pattern split, add to `COLOR_LETTERS` and update `split_color_pattern`.
3. Re-run `update.bat`.

### Discovering schema of a NEW Excel file (use on the upcoming larger table)
```python
from pathlib import Path
import pandas as pd

NEW = Path(r"C:\Users\nilim\Downloads\<new file name>.xlsx")

# 1. List sheets
xl = pd.ExcelFile(NEW)
print("Sheets:", xl.sheet_names)

# 2. For each sheet: rows, columns, sample
for s in xl.sheet_names:
    df = xl.parse(s)
    print(f"\n=== {s} ===")
    print(f"  rows: {len(df)}  cols: {len(df.columns)}")
    print(f"  columns: {list(df.columns)}")
    print(df.head(3).to_string())

# 3. Compare against current expected schema
EXPECTED_CORE = {"serial number", "#pictures",
                 "A1", "A2", "B3", "B4", "B5", "C6", "C7", "D8", "D9"}
EXPECTED_AUX = {"area", "main poligon", "#sights", "#right", "#left",
                "#front", "#no good", "code", "D10"}

actual = set(df.columns)  # use the relevant sheet
missing_core = EXPECTED_CORE - actual
print(f"\nMissing CORE columns (must investigate!): {missing_core}")
new_cols = actual - EXPECTED_CORE - EXPECTED_AUX
print(f"NEW columns not seen before: {new_cols}")
```
Run this before deciding what to do with the new file.

### When the user provides the new table
1. Save the file to `C:\Users\nilim\Downloads\` (or wherever they place it).
2. Run the discovery snippet above.
3. Present the schema diff and per-column proposals (per the table in the top section).
4. Wait for user approval on each NEW column's role.
5. If `INPUT_FILE` or `SHEET_NAME` need to change, propose the edit; do not silently overwrite.
6. Once approved → `update.bat` (or manual scripts) → audit → dashboard.
7. **Update CLAUDE.md** with the new schema once stable.

### Adding a new metric to region_summary
1. Edit `wolf_lib.region_summary` — append the new field to the row dict.
2. Re-run `step2_process.py`.
3. The field will automatically appear in the dashboard's overview table.

---

## 13. Critical Things to Avoid

- **Do not use the term "unique" for the status** — it confuses users. Always say `unambiguous` for a clean code, `n_unique` for the count of distinct codes.
- **Do not double-count asymmetric wolves** — they are ONE entity per region; their right/left codes are ADDITIONAL signatures only used in the side-aware view.
- **Do not silently treat `unknown` codes** — they are flagged in the audit. If new ones appear after data edits, surface them to the user.
- **Do not change the bucket boundaries** without explicit user permission — they were carefully chosen (1 / 2-3 / 4-6 / 7-10 / 11-20 / 21-35 / 36+).
- **Do not skip the audit after data changes** — `update.bat` runs it automatically; if running scripts manually, always run the audit too.
- **Do not assume the dashboard's "Empty" bucket should always be 0** — surface it. The user wants to know about empty cells.

---

*Last updated: end of conversation establishing the dashboard, identification-buckets tab, and edit/refresh workflow.*
