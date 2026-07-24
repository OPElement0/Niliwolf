# Session Handoff — read this when picking up the project

> **For Claude (next session, possibly on a different machine):**
> Read `CLAUDE.md` in full first, then this file, then `data_dictionary.md`. After
> that you should have full context to continue without re-asking the user.

---

## Last session — 2026-07-24 (public/private split: viewer + cloud editor)

**Big architectural change.** The single `data_table.html` was split into two
builds so Nili can send the paper editor a **view-only** link while editing
privately from **any PC**.

### What changed
- `build_data_table.py` now takes a variant: `--viewer` / `--editor` / `--both`
  (default `--editor`). One shared `HTML_TEMPLATE`; the variant only changes
  injected constants + a couple of `init()` guards.
  - **`data_table.html`** = PUBLIC viewer. `PWD_HASH=""` (admin login
    mathematically impossible), `XLSX_BASE64=""` (no embedded workbook),
    `issues/claude_questions/prefilled_decisions` emptied, **photographer rows
    excluded entirely** (89 rows, not 100). Login button + sync pill hidden;
    `syncProbe()` not called. Charts + sortable/filter table remain.
  - **`edit-7q2m9x4p.html`** = PRIVATE cloud editor (obscure, unlisted name; not
    referenced by `index.html`). Full admin UI + a new **cloud-save** module
    (`setupGithubEditor` / `ghSave` / `ghLoadLatest` in the JS). Saving commits
    `wolves_data.xlsx` back to the repo via the **GitHub Contents API** using a
    **Personal Access Token** the user pastes once per browser (localStorage key
    `wolves_gh_pat_v1`; never embedded). "↻ Load latest" pulls current data on
    any device.
- **GitHub Actions** (`.github/workflows/build.yml` + `requirements.txt`):
  on any push that changes `wolves_data.xlsx`, CI runs `build_data_table.py
  --both` and commits the rebuilt HTML back (`[skip ci]` + path filter → no
  loop). So an edit from any PC → cloud save → public viewer refreshes in
  ~1–2 min, no local run needed.
- **Repo hygiene**: `.gitignore` now excludes old/backup/snapshot xlsx, all
  `*.csv` dumps, internal JSON (`data_decisions.json`, `claude_questions.json`),
  QC/audit reports, and `wolf_dashboard.html`. Those 19 files were
  `git rm --cached` (local copies kept). `wolves_data.xlsx` stays tracked (CI
  needs it; it's the same data the viewer already shows).
- **Scripts**: `update.bat` now builds `--both` and opens the editor;
  `publish.bat` added (commit data + dashboards, push).

### ⚠️ Not yet done / needs Nili (GitHub-side, can't be automated from here)
1. **Create a fine-grained PAT** (repo `OPElement0/Niliwolf`, Contents:
   Read/Write) and connect it in the editor's "☁ Cloud save" bar.
2. **Enable Actions write permission**: repo Settings → Actions → General →
   Workflow permissions → "Read and write permissions".
3. **First push** of this change was NOT auto-done — confirm before publishing
   (it makes the editor live + restructures the public repo). Live GitHub commit
   from the editor is the only path not tested locally (needs the real token).
- Data itself unchanged this session (still 89-wolf pool; the earlier
  camera/date edits are already saved). Charts unaffected.

---

## Last session — 2026-05-30 (chart polish for paper / mentor share)

### What landed in this session

Entirely chart-presentation work on `data_table.html`. No data changes — pool
stays at 89 wolves, all CSVs / xlsx untouched. `verify_chart_vs_table.py`
remains at 0 mismatches across all 4 layers.

**Per-region identification heat-map (Identification by Region tab):**
1. Recoloured the continuous Shared scale to an **all-green ramp** (darkest
   `#2E7D32` at k=2, palest `#E8F5E9` at k=maxK) replacing the green→yellow→
   orange→brown ramp. Distinguishable from the discrete Unique `#1B5E20` dark
   green.
2. Bar segment labels now show **percent only** (e.g. `22%`), no more
   `22%, a4b5` style code lists.
3. Updated the description text + the **N and P legend labels**:
   - `P — marking present, code unclear` (legend short form)
   - `N — not codable` (legend short form)
   - Full nuance in the section sub-text — P is informative presence,
     N is no usable observation. Saved as memory
     `feedback_p_vs_n_semantics.md`.

**Social donut (Social Dynamics tab, card #4):**
1. Replaced the in-wedge probable-count badges with **leader-line callouts**
   pointing from inside each hatched (probable) wedge to a label outside the
   donut showing `<b>N</b> probable (X%)`. L-shape, category-coloured line,
   labels close to the donut.
2. Fixed a Plotly pie-direction bug that put callouts in the wrong place for
   wedges other than the first. The reverse-engineered rule lives as
   `wedgeMidPhi(i)` in `renderSocialDonut` with a verification comment.
   Confirmed correct against the rendered SVG paths for Pack/Group/Lone
   hatched wedges.
3. Donut shrunk slightly via `domain.y = [0.04, 0.96]` so callouts have room.
4. Caption now says "Leader-line callouts point from each hatched wedge to
   its probable (*) count and its share of the pool."

**Header banner:**
- Replaced `total rows: 100` with `wolves in pool: 89` (populated from
  `PAYLOAD.n_pool`). The hover tooltip explains the canonical-pool rule.

**Cross-pack colour signature matrix (Pack Signatures tab — major overhaul):**
1. **Moved to be the FIRST block in the tab** (was second after Top-3 packs).
2. **Colour NAMES instead of letter codes** — sourced from Nili's fur-region
   key image (`Downloads/עותק של מיפוי אזורי פרווה לתרגום.png`,
   2026-05-30). The mapping is saved permanently as memory file
   `reference_colour_names.md` and mirrored as `COLOR_NAMES` JS constant
   in `build_data_table.py`. Keep both in sync if the palette ever extends.
3. **New columns** between Pack-name and the region cells: **Land use**
   (tinted with `LAND_USE_COLORS`) and **Type** (`pack` if n≥5, `group` if
   2–4 — per `feedback_pack_inference_criteria.md`).
4. **Polygon column dropped** to free space — polygon name still shown as
   tooltip on the pack-name cell.
5. **Tie handling**: when 2+ colours share the most-common count in a pack,
   the cell splits into one vertical strip per tied colour (each with its
   own name + `N/total`). Less-common colours intentionally hidden.
6. **Auto font-shrink** for crowded tied cells. CSS hooks: `data-n="<count>"`
   on `.sigs-tie-strips`; an extra `.long-name` class on names with 3+ tokens
   (split on space + hyphen). Effective sizes:

   | # tied | Short name (≤2 tokens) | Long name (3+ tokens) |
   |---|---|---|
   | 1 | 11.5 px | 11.5 px |
   | 2 | 10.5 px | 10.5 px |
   | 3 | 9.5 px  | 8.5 px |
   | 4-6 | 8.5 px | 7.5 px |
7. **Uniform row height** (`tbody td { height: 56px; }`) so short rows like
   `yehudiya trio` match taller tied-cell rows.
8. Long names wrap at hyphens/spaces (`overflow-wrap: anywhere`); tooltip
   on every coloured cell carries the full name as safety.

**Memory files added this session:**
- `feedback_p_vs_n_semantics.md` — P = informative presence, N = no usable
  observation. Not symmetric.
- `reference_colour_names.md` — full A1/A2/C6/D8 letter→name table from
  Nili's image, plus a how-to-apply note.

### Share link for the mentor

The repo IS the public GitHub Pages site:

  **`https://opelement0.github.io/Niliwolf/`**

Pushing `data_table.html` to `origin/main` updates the live site. The
mentor needs only that URL. Tooltips work on hover; admin features stay
hidden without the admin password.

### Next session — likely starting points

- Open Claude questions still awaiting user input (no change since
  2026-05-29): ≈22 per-wolf pack-candidate / cohort items, plus the
  long-standing methodology questions Nili owns.
- Possible next visual polish areas if the mentor flags them:
  - Mobile layout for the colour-signature matrix (currently desktop-tuned).
  - A "show region colour-key swatch" legend if the colour names alone
    aren't self-explanatory in the matrix.
- O80's `#pictures=0` typo is still pending Nili's xlsx fix; Sh109's empty
  D9 also still pending.

---

## Earlier session — 2026-05-29

### What landed in this session

**Mentor decision: photographer-source wolves are out of the paper.**

1. **New canonical pool: 89 wolves** (was 100). The 11 wolves observed only
   by external photographers — `In89, In90, In91, In92, In93, In94, In95,
   In96, In97, In98, In105` — are excluded from the analysis pool. The
   five photographers in the data: `ariel shamir`, `omer weiner`,
   `elimelech`, `moshe_neeman`, `nevo_`.
2. **O66 kept** — it has both `31` (research camera) and `omer weiner` in
   `cams_spotted`. The photographer name was stripped from the Excel;
   `cams_spotted` is now `"31"` only. Backup preserved as
   `wolves_data.OLD.before_photographer_filter.xlsx`.
3. **`wolf_lib.cams_source(...)`** — new classifier. Returns
   `"research"` (≥1 numeric token 1–60), `"photographer"` (no numeric
   tokens), or `"empty"`. Used by `load_data` and the data table.
4. **`load_data(include_photographer_only=False)`** — new keyword. Default
   `False` excludes photographer-only rows from the canonical pool. Pass
   `True` for admin tooling that needs the full 100-row view.
5. **`build_data_table.py`**: photographer rows are still embedded in the
   HTML (so admins can audit / export them), but:
   - viewer mode hides them entirely;
   - admin mode also hides them by default — a new toggle, **"show
     photographer-source wolves"** (admin controls bar), reveals them;
   - when revealed, they get a pale-orange tint
     (`.row-photographer-source`);
   - admin export and master xlsx save include them when the toggle is on.
6. **Stale `only_with_pictures=True` fixed** in `step3_build_app.py` and
   `step3_panelA_rankfreq.py`. Both now use the canonical pool.
7. **`verify_chart_vs_table.py`** updated to apply the same photographer
   filter, so the integrity check passes against the new pool.
8. **All outputs rebuilt** — every CSV, the audit, the data-QC report,
   `wolf_dashboard.html`, `data_table.html`, and the verifier all agree
   on `n_total = 89`.

### Headline numbers (new — 89-pool)

| Region | n_unambiguous | n_unique | H (bits) | Top code (count) | %usable |
|---|---|---|---|---|---|
| A1 | 83 | 66 | 5.887 | b1i (5) | 98.88 |
| A2 | 77 | 38 | 4.929 | a1i, N (7) | 92.13 |
| B3 | 28 | 9 | 2.734 | N (24) | 68.54 |
| B4 | 51 | 12 | 3.175 | N (17) | 70.79 |
| B5 | 49 | 12 | 2.864 | N (22) | 70.79 |
| C6 | 81 | 38 | 4.840 | c1g (8) | 94.38 |
| C7 | 73 | 7 | 2.376 | c (26) | 82.02 |
| D8 | 54 | 18 | 3.334 | a4b5 (20) | 94.38 |
| D9 | 75 | 4 | 1.678 | a2 (39) | 84.27 |

### Caveats

- `update.bat` still does NOT rebuild `wolf_dashboard.html` automatically
  (only data_table). If the user needs the analysis dashboard refreshed,
  run `step3_build_app.py` manually. Pre-existing gap, not a regression.
- The 12 per-wolf pack-candidate questions from the 2026-05-13 session
  that referenced `In92`, `In93` etc. now point at excluded wolves; if
  Nili revisits those questions, they should be closed (not actionable).

---

## Earlier session — 2026-05-13

### What landed in this session

1. **Pack-inference engine** (`pack_inference.py`, ~280 lines): parses
   `cams_spotted`, `time on camera`, `seen with`, builds pack signatures,
   classifies each wolf. Implements Nili's formal criteria
   (`feedback_pack_inference_criteria.md`).
2. **Cell-click feature in `data_table.html`** — clicking a flagged cell
   in the table now auto-opens the related question in the side panel.
   `applyCellBadges` builds a reverse `(row, column) → issue` index;
   Tabulator's `cellClick` looks it up.
3. **Scrollable active card** (max-height 55vh, overflow-y auto, custom
   scrollbar) — fixes the issue where long questions hid the action
   buttons.
4. **"Decisions remaining" counter** in the panel — practical count
   (open Claude questions + open QC categories) instead of raw 200+
   item count.
5. **Strict pack-membership rule** (Nili 2026-05-13): for a wolf to
   qualify as `pack*`/`group*`, BOTH date endpoints must match a pack
   member at the SAME CAMERA within threshold. Previously checked only
   polygon overlap. Applied retroactively — 8 borderline `lone`
   classifications shrunk to 2 actual disagreements (Y46, Y37).
6. **`*` = same-pack rule** (Nili 2026-05-13): `dark pack` and
   `dark pack*` are the SAME pack identity (the `*` just marks
   individual wolves as probable members). Algorithm now normalises
   pack names (`rstrip('*').strip().lower()`). Effect:
   - `dark pack` grew from 9 → 10 members (Y102 folded in as probable)
   - `Shaal west` grew from 1 → 2 members (Sh57 folded in)
   - `dark pack*` and `Shaal west*` no longer exist as separate packs
   - Single-member packs collapsed from 5 to 2 (`makhfi new`/M2k and
     `marom golan`/Mg90 are genuinely single-identified, expert-tagged)
7. **8 → 12 per-wolf Claude questions** for pack candidates
   (`cq_pack_candidate_*`, `cq_inferred_lone_*`, `cq_pair_*`,
   `cq_mg90_single_member_pack`). Each has `target_column` set so
   cell-click works.
8. **Indian cohort decisions applied** (Nili explicit instruction): In92
   + In93 → `social_dynamic = group`; In89, In91, In94-98, In105 →
   `social_dynamic = unknown`. 10 cell edits committed.
9. **34 user decisions total** committed to `data_decisions.json`:
   - 18 `fixed_in_xlsx` (region cells / code fields)
   - 12 `answered` (substantive comments, e.g. methodology + cohort)
   - 1 `needs_more_data` (B-region missing contrast suffix)
   - 3 `decided_keep` (closed batch questions split into per-wolf)
10. **Reports**: `pack_inference_report.md` (algorithmic discrepancies),
    `pack_membership_report.md` (per-pack confirmed + probable counts),
    `missing_data_report.md`, `b_regions_missing_contrast_suffix.md`.

### Project-memory rules added this session

- `feedback_social_dynamic_grammar.md` — 4 canonical categories + `*` =
  probable. EXTENDED 2026-05-13: `X` and `X*` are the same identity in
  any column (`pack name`, `social dynamic`, `שיוך`).
- `feedback_cams_spotted_external.md` — numeric cams (1-60) are spatial;
  reporter names are valid alt-source but NOT spatial; never split into
  a `reporter` column.
- `feedback_pack_inference_criteria.md` — formal criteria for pack /
  group / lone / `pack*` / `group*`. EXTENDED 2026-05-13: strict rule
  requires SAME-CAMERA match at BOTH endpoints.
- `feedback_no_auto_edit_pack_data.md` — pack inference is surface-only;
  `pack name` / `social dynamic` / `שיוך` writes require explicit
  per-row user approval.

### Pack composition at end of session

- 12 packs/groups: dark pack (10), golden pack (7), Makhfi original (6),
  Odem west (6), Odem East (5), shaal east (5), slopes (4 probable),
  yehudiya trio (3), Shaal west (2), Odem South (2), makhfi new (1),
  marom golan (1).
- 46 confirmed pack members + 6 probable (with `*`).
- 23 `lone` wolves.
- 25 wolves still unassigned (pack name unknown/empty) — 5 are explicit
  group members without a pack name (F21, F23, F24, In92, In93); 19
  unknown; 1 fully empty (Y37).

### One clarification still pending at session end

- **Mg90 social_dynamic** — expert-tagged as `marom golan` (sole
  identified member) but social_dynamic is empty. For consistency with
  M2k (sole identified member of makhfi new, social_dynamic=`group`),
  Mg90 should probably also be `group`. Surfaced as
  `cq_mg90_single_member_pack` awaiting user decision.

### Next session — likely starting points

- Open Claude questions awaiting user input (≈22):
  - 12 per-wolf pack-candidate questions (M10, Sh51, Sh54, O73, O77,
    Y46, Y37, F104, F22, Sn85, Sl103, Mg90, In92, In93)
  - cq_y39_b5_extra_digit
  - cq_extra_midletter_3_wolves (already answered but verify)
  - 7 methodology / cohort-level questions
- QC items: 132 flagged rows across 9 categories (most batchable).
- The 4 substantive non-`lone` cohort assignments (F21, F23, F24,
  In92, In93) need pack-name decisions.

---

## Earlier session — 2026-05-12 (evening)

### What landed in this session

1. **Local sync server (`sync_server.py` + `start_sync.bat`)** — live-sync
   loop between `data_table.html` admin mode and the on-disk
   `wolves_data.xlsx` / `data_decisions.json`. Eliminates the manual
   download → drop → update.bat cycle. Status pill in the header shows
   `Sync: synced HH:MM` / `saving` / `pipeline running` / `offline`. Pipeline
   (`step1d_dataqc.py`) runs in the background after every save. Backups
   to `.sync_backups/` (last 20 per file).
2. **"Save table edits" button** in the admin bar — force-saves the full
   table to disk via the sync server's bulk endpoint. Catches anything the
   per-cell sync missed. Pending counter (`N pending`) updates live.
3. **"Decisions remaining" counter** — practical number (open Claude
   questions + open QC categories) shown in the panel header. Replaces
   the misleading item-level count.
4. **localStorage ↔ disk merge on load** — newer `updated_at` wins per id.
   Fixes the bug where the browser cached stale statuses while the disk
   already had fresher decisions.
5. **Scrollable active card** — `max-height: 55vh; overflow-y: auto` so
   buttons stay reachable when the question + textarea are long.
6. **Empty-row cleanup** — `M11H`, `F25`, `Y38` + trailing blank row
   removed (100 wolves now in the xlsx).
7. **Code≠concat category fully cleared** — was 26 wolves; now 0. Mix of
   user table edits + 9 Claude-question fixes (8 user-affirmed +
   `cq_y39_b5_extra_digit` newly identified + `cq_code_partcount_mismatches_batch`
   batch).
8. **3 grammar / structural memories** saved to `~/.claude/projects/...`:
   - "Asymmetric R/L coding is intentional — never question it"
   - "B-region exceptions: `b` (B3), `d` (B4/B5) are complete codes; no
      a/b suffix required"
   - "Add Claude questions to `claude_questions.json` during chat — surface
      decision points to the panel, not only inline"
9. **`audit_report.md` now appends Clarifications section** with every
   user comment (status=answered or needs_more_data).
10. **`step1d_dataqc.py` suppresses findings with status=`decided_keep`**
    and inlines user comments below the row in the QC report.

### Where we are at session end

- **xlsx**: 100 wolves, 0 empty rows, no code≠concat mismatches.
- **Decisions made by user**: 20 (last build), of which 11+ are
  `fixed_in_xlsx` and several `answered` with substantive paper-relevant
  comments. `audit_report.md` carries those comments forward.
- **Claude questions**: 39 authored, ~14 still open after this session.
- **Categories worth her attention next session**:
  - `cq_extra_midletter_3_wolves` (M4 A2, H12 A2, F104 A1 — extra mid-letter
    in code field; needs her ruling on whether the cell should be extended
    or the code regenerated)
  - The remaining methodology questions (D9, asymmetric in rank-frequency,
    bucket boundaries, terminology, Figure 1 panel composition, etc.)
  - QC categories with bulk actions: `social_dynamic = 'lone'` (23 wolves),
    `seen with = 'seen together'` (18 wolves), polygon casing
- **Pipeline verifier**: 4/4 layers pass, 0 mismatches.

### Important workflow rules in effect

- **The admin Fix & Clarify panel is the canonical channel for decisions**
  (not chat). Per `feedback_add_claude_questions_during_chat.md`: whenever
  Claude identifies a new anomaly during chat, the next action is to
  append it to `claude_questions.json` so it appears in the panel.
- **xlsx edits flow through the sync server** when `start_sync.bat` is
  running. Otherwise the page falls back to localStorage + manual
  download.
- **`data_decisions.json` is the source of truth for user statuses + comments.**
  Read by `step1d_dataqc.py` (suppression) and `step1c_audit.py`
  (clarifications section). The Save → download button on the page is a
  redundant safety net when sync is offline.

### Files added / modified in this session

| Type | File |
|---|---|
| New | `sync_server.py`, `start_sync.bat` |
| New | `claude_questions.json`, `data_decisions.json` |
| New | `missing_data_report.md`, `b_regions_missing_contrast_suffix.md` |
| Modified | `build_data_table.py` — sync client, save button, merge-on-load, scrollable card |
| Modified | `step1d_dataqc.py` — reads decisions, suppresses + annotates |
| Modified | `step1c_audit.py` — appends Clarifications section |
| Modified | `CLAUDE.md` — Fix & Clarify section + B-grammar exceptions |
| Modified | `wolves_data.xlsx` — 4 empty rows removed, 20+ data edits applied |
| Generated | `audit_report.md`, `data_quality_report.{md,json}`, `data_chart_verification_report.md` |

### Previous session (earlier same day — kept for context)



1. **Fix & Clarify Mode** is live inside `data_table.html` admin panel. Unified UX
   for QC findings + Claude's authored questions. Per item: status dropdown
   (`open` / `answered` / `decided_keep` / `fixed_in_xlsx` / `needs_more_data`)
   + free-text comment + 💾 Save / ✓ Mark answered. Top filter tabs:
   All / Needs reply / Answered / Resolved.
2. **`claude_questions.json` v1** — 37 Claude-authored open questions covering:
   per-region rarity methodology (A1/C6/D8/D9), B-region contrast suffix gap,
   3 asymmetric edge cases, 8 substantive code-vs-concat disagreements, 1 batch
   for 7 part-count code mismatches, metadata anomalies (`lone`/`pack*`/gender `?`,
   `time on camera` × 2, O80 #pictures=0, `seen with` × 2), 1 poor-data wolves
   question, and ~12 methodology questions for the paper (D9 placement, bucket
   boundaries, asymmetric counting, terminology, dataset release, etc.).
3. **`data_decisions.json`** — new committed file, single source of truth for
   Nili's status + comment per issue/question. Round-trip via the admin UI's
   💾/📥 buttons. Embedded at build time so the page pre-populates on next
   open.
4. **`step1d_dataqc.py`** now reads `data_decisions.json` and suppresses any
   finding with status `decided_keep` (banner: "N finding(s) suppressed via
   data_decisions.json"). Findings marked `fixed_in_xlsx` that the source still
   shows are kept and annotated. Findings with `answered`/`needs_more_data` are
   kept with their user comments inlined below each row.
5. **`step1c_audit.py`** now appends a "Clarifications from data owner" section
   to `audit_report.md`, listing every comment with status `answered` or
   `needs_more_data`, sorted by `updated_at` desc.
6. **Bug fix**: phantom "Found unsaved edits…" popup that fired on every load.
   Root cause: `onChange()` was called by `tableBuilt` and unconditionally wrote
   the baseline to localStorage. Fixed two ways — `onChange()` only persists when
   `diffs > 0`, and the load-time restore prompt now silently drops the stored
   value if it matches the baseline. Old stale localStorage entries auto-clean on
   first reload of the new build.
7. **Bug fix**: Claude's "general" questions (no row anchor) were being
   auto-resolved by the live re-check because `findRowByIndex(null)` returns
   null → `rowHasIssueLive` → `false` → `isResolved` → `true`. Now `isResolved`
   special-cases `__is_claude` issues to only resolve via explicit decision.

### Where we are right now
- Canonical pool: **100 wolves** (every wolf with non-empty `code`). Unchanged.
- `data_table.html` is the **single deliverable**, hosted at
  https://opelement0.github.io/Niliwolf/ — admin password `112358`.
- After this session, the build reports: `232 total items` (37 Claude + 195 QC),
  `230 unresolved`, `0 answered`, `2 auto-resolved by live re-check`.
- Pipeline `update.bat` runs all 5 steps cleanly. Chart↔table integrity verifier
  passes 4/4 layers with 0 mismatches.

### Next session — handoff to Nili
1. **Open `data_table.html` → login admin** (`112358`) → click "⚠ Review issues".
2. Click "Needs reply" tab — first 37 items are Claude's questions, then the
   46 still-open QC items.
3. For each item: type a comment in the textarea, pick a status, click "💾 Save"
   (or just blur — autosave). Keyboard `Skip ▶` to move on.
4. When done (or whenever), click 💾 at the top → save `data_decisions.json`
   into the project folder (replacing the empty one).
5. Run `update.bat`. The next QC report will suppress your `decided_keep` items
   and inline your comments. The audit report will get a Clarifications section.
6. Share back with Claude in the next session — the saved file is the input for
   incorporating your answers into analysis decisions / paper text.

### Open from previous sessions (still relevant)
- O80 `#pictures = 0` — typo in the count; Claude question `cq_o80_pictures_zero`.
- Y42 / O68 unparseable time on camera — Claude questions `cq_y42_time_on_camera`
  / `cq_o68_time_on_camera`.
- 26 code≠concat wolves — `cq_code_partcount_mismatches_batch` covers the 7
  mechanical ones; 8 substantive ones have individual Claude questions.

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
