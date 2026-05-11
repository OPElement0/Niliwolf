# Session Handoff — read this when picking up the project

> **For Claude (next session, possibly on a different machine):**
> Read `CLAUDE.md` in full first, then this file, then `data_dictionary.md`. After
> that you should have full context to continue without re-asking the user.

> **For the user (Nili) — if you're picking up on a new machine:**
> 1. Make sure you have the *whole* `wolf paper` folder (xlsx, all `.py` scripts, all `.md` files,
>    CSVs, `update.bat`, `wolf_dashboard.html`, `data_table.html`).
> 2. Install Python 3.10 + the packages listed in §A below if this machine doesn't have them.
> 3. Open Claude Code, point it at this folder, and tell it: "read `CLAUDE.md` and `SESSION_HANDOFF.md`".
> 4. From there, continue from "Where we left off" below.

---

## Last session — 2026-05-11 (most recent)

### Where we are right now
- The **canonical analysis pool is 100 wolves** (every wolf with non-empty `code`).
  The `#pictures > 0` filter was **rescinded** — see Rule 0 in
  `~/.claude/skills/wolf-pelt-analysis/SKILL.md` for the user's verbatim statement.
- `data_table.html` is the **single deliverable** of the public site. Hosted at:
  https://opelement0.github.io/Niliwolf/ — anyone with the link can view; admin
  password `112358` gates editing (client-side soft gate).
- `wolf_dashboard.html` was **removed** from the repo & site (no longer relevant
  after data_table.html became feature-complete).
- The page now contains: editable table + status filter chips + anatomy reference
  section (with the user-supplied schematic) + per-region 100% stacked bar chart
  (Plotly, drill-down on Shared buckets, colored x-axis labels, percentage labels
  ≥10%) + mobile-responsive layout + issue-review panel (admin only).
- A full **chart ↔ table ↔ raw-xlsx integrity check** runs as the last step of
  `update.bat` (`verify_chart_vs_table.py`). It passed 4/4 layers with 0 mismatches
  on the latest build.
- Narrative analysis report for A1, C6, D8, D9 is in
  `region_narratives_A1_C6_D8_D9.md` — written for the user to reuse in the paper.
  Numbers refreshed to 100-pool. Section 1 explicitly distinguishes `n_unique`
  (count of distinct codes) from "Singletons" (count of wolves with one-of-a-kind
  codes) — common confusion the reader of the paper might hit.

### Next session — what the user has flagged
> "אני מתחילה שיחה חדשה איתך בקרוב על מיון מידע נוסף בטבלה"
> ("I'll start a new chat with you soon about sorting more information in the table.")

**Likely scope of the next session:** extend the analytical machinery to the
*metadata* columns (not just the 9 pelt regions). Candidates:
- `gender`, `social dynamic`, `pack name`, `שיוך` (the last two only after the
  user cleans them — currently off-limits per Rule 12 in SKILL.md).
- `area`, `main poligon` (geographic).
- `cams_spotted` (which cameras detected each wolf — the 60-camera grid).
- `time on camera` (date / range — needs parsing).
- `seen with` (co-occurrence — could become a network plot).
- `#sights`, `#right`, `#left`, `#front`, `#no good`, `#pictures` (photo counts).

The user is the one driving which columns to tackle; ask her at the start of the
next session.

### Open issues parked from earlier
- 47 data-QC issues in the issue-review panel (admin mode → click "Review issues").
  The user has not stepped through them yet.
- O80 still has `#pictures = 0` — she said she'll fix the count; the wolf itself
  is fine and included in analysis.
- Y42 (`30.9.20-27.10`, missing year on second side) and O68 (`29.8-29`,
  malformed) — unparseable `time on camera` entries that need her edit.
- 26 wolves where the precomputed `code` ≠ `A1_…_D9` concat — auto-fix action
  available in the issue panel.

---

## Earlier session — 2026-05-02

### What was built

1. **New Excel integrated**: `Golan Hights wolves data.xlsx` (104 rows × 28 cols in sheet
   `נתוני זיהוי זאבים (2)`) → copied into the project as `wolves_data.xlsx`. Old file
   backed up as `wolves_data.OLD.xlsx`.
2. **`wolf_lib.py` updated**: `INPUT_FILE` now relative to the project; `load_data()` filters
   out rows with empty `code` (per user rule). 99 wolves in the analysis pool.
3. **`data_dictionary.md` written**: per-column meanings from user Q&A — single source of
   truth for what each column means.
4. **`step1d_dataqc.py` added**: comprehensive data-quality check on the source xlsx. Writes
   `data_quality_report.md` and `data_quality_report.json`. Wired into `update.bat`.
5. **`build_data_table.py` extended with the issue-review UI**: when the admin (password
   `112358`) clicks "⚠ Review issues", a right-side panel appears with categories,
   per-issue actions, bulk fixes, and policy decisions. Decisions persist to the admin
   browser's `localStorage` only — viewers never see them.
6. **`CLAUDE.md` refreshed**: schema, file structure, workflow steps, pending work all
   reflect the new state.

### Data quality findings (snapshot from latest run)

| Severity | Categories | Total flagged rows |
|---|---|---|
| ❌ Errors | 3 | 30 |
| ⚠ Warnings | 5 | 66 |
| ℹ Info | 6 | 99 |

Key items the user should review (most are surfaced in the admin issue panel):

- **O80** — has a `code` but `#pictures = 0`. User said this is a typo she will fix.
- **`code` ≠ regions concat** — 26 wolves where the precomputed `code` string doesn't
  match `A1_…_D9`. The "Replace code with concatenated regions" row action solves it
  per-row safely.
- **`social dynamic` outside {pack, group, unknown}** — 23 rows say `'lone'` (and 1
  `'pack*'`). User should accept `'lone'` as a 4th category OR rename — one click
  resolves all 24.
- **`cams_spotted` non-numeric** — 12 rows have observer names. The "Add a 'reporter'
  column and move observer names there" policy action will split them.
- **Polygon casing**: `Hazeka`/`hazeka`, `Saki`/`saki` — bulk-fix UI in the panel.
- **`gender` "?"** — 2 rows. One-click action sets to blank (per user's rule:
  blank when uncertain).
- **`time on camera` 2 unparseable** — Y42 (`30.9.20-27.10`, missing year on second
  side), O68 (`29.8-29`, malformed). Need user edit.
- **`seen with` references unknown wolf** — 27 references. Includes `F21s` and
  `Sh37y` from the old non-(2) sheet, the literal string `"seen together"`
  appearing in 18 rows, and `+` separators in 2 rows (Sh52, Sh53). User input
  needed for each.

### Where we left off

The user signed off at the point where `data_table.html` was just rebuilt with the new
issue-review panel. **She has not yet stepped through the issues.** When she returns:

1. She refreshes `data_table.html`, logs in as admin (`112358`), clicks "Review issues",
   and walks through the 47 unresolved items.
2. She'll likely apply most of the bulk fixes and policy decisions (lone, polygon casing,
   reporter column, whitespace) in a few minutes.
3. Per-row issues (code≠regions, time, seen-with) take longer — those need her judgement.
4. After fixing → "Save → download wolves_data.xlsx" → place in project folder → run
   `update.bat` → the QC report should drop dramatically.
5. Then we move to **Stage 4 — Visualizations** (Plotly panels for the paper, G1–G9 as
   scoped in the plan file `C:\Users\nilim\.claude\plans\c-users-nilim-downloads-golan-hights-wo-functional-puzzle.md`).

### User's working preferences (carry forward)

- Hebrew speaker; respond in Hebrew. Project UI / paper / dashboard text all in English.
- Precision in the data is paramount (paper context, won't tolerate errors).
- Surface anomalies, never silently filter or auto-fix without approval.
- Per-cell edits happen IN the table, not in pop-out forms.
- Decisions persist for admin only; viewers see only the clean final data.
- The `update.bat` workflow is the canonical refresh path.
- `pack name` and `שיוך` are off-limits in visualizations until she cleans them.
- `notes` and `name` are local info — show in the table, never aggregate in plots.

---

## A. Required environment (for a fresh machine)

- **Python**: 3.10 (3.10.0 is what we use; later 3.10.x should work).
- **Packages**: `pandas numpy scipy matplotlib seaborn openpyxl plotly`
  (the dashboards use Plotly via CDN, but `step3_panelA_rankfreq.py` uses matplotlib).
  Install with: `pip install pandas numpy scipy matplotlib seaborn openpyxl plotly`.
- **Browser**: any modern Chromium / Firefox / Safari (the static HTML pages run there).
- **Excel**: optional but useful for editing the source xlsx directly.

The dashboards (`wolf_dashboard.html`, `data_table.html`) are self-contained — they need
no Python at runtime, just a browser.

---

## B. How to verify the project is intact on a new machine

```bash
cd "<wherever you put the project folder>"
PY="<path to python 3.10>"

# 1) sanity: imports work
"$PY" -c "from wolf_lib import load_data, process_all_regions; print(len(load_data()))"
# expect: 100  (since 2026-05-11; previously 99)

# 2) full refresh
update.bat        # Windows
# Runs: step2_process -> step1c_audit -> step1d_dataqc -> build_data_table -> verify_chart_vs_table

# 3) open the output
start "" "data_table.html"
# Note: wolf_dashboard.html was removed 2026-05-06 — data_table.html is the
# single deliverable now.
```

If any of those fail, read the error and fix `INPUT_FILE` / `SHEET_NAME` in `wolf_lib.py`.

---

## C. Backup / portability strategy

The user opted for cloud + zip for now. Suggested longer-term:

- **Quick (manual)**: keep the project folder inside OneDrive / Google Drive / Dropbox
  so it auto-syncs across machines.
- **Robust**: initialize a private GitHub repo for the folder. Pros: full version history,
  diff view, can roll back any data edit, can share with a collaborator one day.
  Suggested `.gitignore`:
  ```
  __pycache__/
  *.pyc
  .claude/
  ```
  (Keep `wolves_data.xlsx` IN the repo — it's the master.)
- **Belt-and-braces**: a dated zip per major milestone (`wolf_paper_2026-05-02.zip`).
