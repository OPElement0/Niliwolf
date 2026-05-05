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

## Last session — 2026-05-02

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
# expect: 99

# 2) full refresh
update.bat        # Windows
# or run the 5 scripts manually (see CLAUDE.md §6.B)

# 3) open the outputs
start "" "wolf_dashboard.html"
start "" "data_table.html"
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
