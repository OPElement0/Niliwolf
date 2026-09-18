---
name: nutrition-dashboard
description: Work on Nili's private pregnancy-nutrition dashboard (nutrition/ folder, claude.ai Artifact). Use for ANY request about the nutrition dashboard, מעקב תזונה, logging meals/supplements/labs for her, changing the Today tab, urgency colours, food database, or republishing the page.
---

# Nutrition dashboard (מעקב תזונה בהריון)

Private personal tool for Nili (Hebrew, RTL, vegan diet, pregnancy). Lives in
`nutrition/` of the `OPElement0/Niliwolf` repo. **Current branch:
`claude/pregnancy-nutrition-dashboard-access-a7uch1`** (supersedes
`claude/pregnancy-nutrition-dashboard-qsr5lg`, which stops at the 2026-09-10
state). It is **unrelated to the wolf project** in the rest of the repo.

**Source of truth = `src/` on that branch.** On 2026-09-17 the published page
(versions 18–24, edited directly as HTML from conversations without repo
access) was split back into `src/`; `build_nutrition.py` reproduces the
published page byte-for-byte. If a future conversation edits the published
HTML directly, re-sync first: download the page (`Artifact read path=index.html`),
strip the first line (`<!doctype…<body>`) and the trailing `</body></html>`,
and split by the `page.html` placeholders.

## 0. First thing in a new session

1. Read `nutrition/README.md` and this file.
2. Read the private context doc from the Artifact db (NOT in git):
   `Artifact read_db url=<ARTIFACT_URL> db_op=get collection=settings doc_id=handoff`
   It holds her preferences, supplement plan, lab summary, decisions and pending items.
3. Answer in Hebrew. Keep replies short; she is the only user.

**ARTIFACT_URL:** `https://claude.ai/code/artifact/e84cf4f0-d8fd-40a5-81ec-ba9146aeef86`

## 1. Privacy rules (non-negotiable)

- Only generic code goes in git: food table, DRI targets, rule engine, UI.
- **Never commit personal data**: supplements, recipes, labs, profile, chat, photos,
  ID numbers from lab PDFs. Personal data lives only in the Artifact `db`.
- `.gitignore` blocks `nutrition/private/`, `*.nutrition.json`, `nutrition/*.enc`.
- The page must not reference any external host (build fails if it does).
- Never link the page from `index.html`; never add it to `.github/workflows/build.yml`.
- Scratch files with her data go in the session scratchpad and are deleted after.

## 2. Build → test → publish → commit (every code change)

```bash
cd nutrition
python build_nutrition.py                 # src/ → nutrition.html (fails on external URLs)
node --check src/app.js && node --check src/chat.js && node --check src/data/*.js
NODE_PATH=$(npm root -g) node <scratch>/smoke.js   # optional headless smoke (see §7)
```
Publish with the Artifact tool, **same file path** so the URL stays:
`Artifact file_path=/home/user/Niliwolf/nutrition/nutrition.html url=<ARTIFACT_URL> label="..."`
(capabilities `{db:{}, sample:{}, downloads:true}` are stored; omit on redeploy).
From a fresh conversation you MUST pass `url`, otherwise a second artifact is created.
Then `git add nutrition/ .claude/skills/nutrition-dashboard && git commit && git push -u origin <current branch>`.
Tell her to refresh the page after publishing.

## 3. Files

| File | What |
|---|---|
| `src/page.html` | shell: title, lock screen, header, 9 tabs, `__STYLES__/__DATA__/__CHARTS__/__CHAT__/__APP__` placeholders |
| `src/styles.css` | tokens for light/dark (`:root`, `prefers-color-scheme`, `[data-theme]`), all components |
| `src/app.js` | everything: Store (db↔localStorage), lock, calculations, all tab renderers, actions. Sections added 2026-09-11..17: glycemic-load timeline (`GI_GENERIC`, `glEntries`, `glCurveAt`, `glCardInner`, `glDailyTarget`, `glTotalGauge`), walk timer (`walk_timer_v1`, `walkCardInner`, `walkFactor`), sitting breaks (`sit_timer_v1`, `sitBlockHtml`), sun / vitamin D (`solarElevation`, `uviAt`, `sunCardInner`), report export (`reportData/reportText/reportHtml/reportCsv/repDeliver`) |
| `src/chat.js` | `NutriChat`: consultation chat (`sample`), free-text/photo meal parser (`sample.json`) |
| `src/charts.js` | SVG heatmap / line / bars / calendar (`direction="ltr"` on every svg root) |
| `src/data/foods.js` | ~155 generic Israeli foods per 100 g: `[id, name, aliases, cat, portions[[label,g]], per100]`; ids become `g_<id>` |
| `src/data/targets.js` | `NUTRIENTS` (key, he, unit, ul, ulSoft, ulNote, urgency daily/stored, info), `TARGETS_BY_TRIMESTER`, IOM weight gain, `LAB_MARKERS`, `DIAGNOSES` |
| `src/data/rules.js` | declarative rules `{id, when(ctx), adjust(t), note(ctx), level}` |
| `tools/nutri.js` | CLI to compute meal entries / recipes from the food table (see §5) |
| `build_nutrition.py` | concatenates src → `nutrition.html` (Artifact page format, no doctype) |

## 4. Data model (Artifact `db`)

Collections → documents (all plain JSON; arrays replace wholesale on `update`):

- `settings/profile` `{due_date, height_cm, prepreg_weight_kg, diet_type, allergies, track_glucose, pin_hash, pin_salt}`
- `settings/targets` `{overrides:{nutrientKey: value}}`
- `settings/handoff` — free-text context for Claude (not read by the page)
- `supplements/<id>` `{name, dose_label, doses (units/day), times[], nutrients{key: per FULL daily dose}, active, label_notes}`
- `foods/<id>` `{name, aliases[], kind:"product"|"recipe", per100{}, portions[{label,g}], favorite, ingredients?, servings?, label_notes}`
- `days/<YYYY-MM-DD>` `{meals[{id,time,food_id,name,qty,unit,grams,nutrients{}}], supplements_taken[ids fully taken], supplement_doses{id:count}, supplement_times{id:[HH:MM]}, weight_kg?, glucose[]?, notes, walks[{id,start,minutes,pace:"light"|"moderate",outdoors}], sun[{id,start,minutes,cover,uvi,walk_id}], sun_cloud?, sit?{breaks,longest,every}}`
- `settings/profile` also holds `sun{lat,lon,skin}` and `report_prefs{audience:{fields,nutMode,name}}`; personal foods may carry `gi` (glycemic index) used by the GL timeline.
- `days/<date>.symptoms[]` — `{id, time, energy, nausea, dizziness, hunger (1–5; a missing key = not reported, not 0), pain: {level, types[], duration, positions[]} | null, note}`; definitions in `src/data/targets.js` (`SYMPTOMS`, `PAIN_*`). Added 2026-09-18 by a **second session that published the page directly** (page version 30) — re-synced into `src/` here the same day.
- `labs/<id>` `{marker, value, unit, date, week, note}` — markers per `LAB_MARKERS`; **B12 stored in pg/mL** (pmol/L × 1.355)
- `diagnoses/<id>` `{code, since}`; `chat/history` `{turns[]}`

Nutrient keys: kcal protein carbs fiber fat iron calcium iodine zinc magnesium potassium sodium folate vitD b12 b6 vitC vitA choline omega3 (DHA+EPA mg). `water` exists in foods but is not tracked.

**Seeding from chat** (she sends labels/photos/lab PDFs): use `write_db` with `batch`.
Before touching a day doc, `read_db get days/<date>` and send back the FULL `meals`
array (existing + new) via `update` so supplement ticks are preserved. Snapshot
data is deep-cloned in the page (frozen otherwise) — keep `clone()` in `subscribeAll`.

## 5. Logging a meal for her from the conversation

```bash
cd nutrition
node tools/nutri.js search "קוסקוס"                                  # find ids (generic + personal dump)
node tools/nutri.js entry --food g_couscous --qty 130 --unit גרם --time 13:30
node tools/nutri.js entry --food f_rolls --qty 2 --unit לחמנייה --time 10:00 --personal <dbdump>/foods
node tools/nutri.js recipe --name "..." --ing g_lentils:70 --ing g_quinoa:50 --servings 1   # → foods doc JSON
node tools/nutri.js merge <day.json> <entries.json>                  # → {"meals":[...]} for write_db update
```
Personal foods come from `read_db list foods out_dir=<dbdump>`. Estimate portions
from photos honestly and say so; create a personal food (favorite) for dishes she
will eat again. Lab PDFs from Clalit are scanned: `pip install pymupdf` then
`fitz` text extraction; never store the ID number.

## 6. UI logic that she approved (do not silently change)

- **Today tab order:** focus sentence card (bold, above the clock) → "איך אני מרגישה" symptom card
  (1–5 scales: energy, nausea, dizziness, abdominal pain with type/duration/position, hunger; entries
  listed under it, also drawn on the GL chart and the history heatmap) → "now" card
  (Israel clock, refresh 60 s, eat/avoid notes: digestion, carb load, iron↔calcium/coffee 2 h,
  evening, pending supplements) → hero tiles **protein + iron only** → "מה עוד חסר"
  (ALL incomplete nutrients incl. carbs) → "הושלם" list → supplements → meals.
- **Deficit list order:** over-limit → food-dependent items by urgency red→orange→yellow then % →
  supplement-covered items by %.
- **Donut colour = urgency** (`urgencyOf`): red must-fix-today, orange fix (harm if prolonged),
  yellow acceptable, green done. Uses pace vs time of day (`expected=(hour-6)/14`),
  `NUTRIENTS[].urgency` daily/stored, and whether pending supplement units cover it.
  Yellow token is highlighter yellow; orange is clear orange.
- **Plan pill** next to the name (right side), no urgency dot: green "יושלם מתוספים",
  accent "דרוש תזונה", "עם תוספים X%" coloured by the urgency it would reach after
  remaining units. Details (which supplements) only in the nutrient modal.
- **Completed rows** get a UL gauge on the left: limit/red on the LEFT, green on the right;
  ⚠ from 85 % of a hard UL, plus a warn note at the top. Soft ULs (iron under treatment,
  folate = synthetic only, vitamin A = retinol only) are informational, never red.
- **Supplements:** one tick box per unit (`doses`), contribution scaled by units taken;
  tick time recorded; "reduce a supplement?" hints only when food+supplement ≥85 % of a hard UL.
- No fluids/water tracking. No food chips in the list; suggestions (diet-filtered, with grams
  needed to close the gap) live in the nutrient modal. Static rule notes (labs, vegan) live in
  the pregnancy tab, not Today.
- Meals are editable (time/qty/unit) from the meal modal in Today and Log; modal also shows
  digestion estimate + next-meal time + net-carb load + spacing considerations.
- Parser (`parseMeal`): keeps qualifiers (decaf, plant milk), returns `known:false` instead of
  nearest match; page accepts only exact/prefix matches (`bestMatch`), else "צרי מאכל".
- **Below the deficit/completed lists (Today):** GL timeline card (base thresholds 20 = high peak,
  10–20 medium, **divided by a pregnancy-week factor** ×1.2 from week 20 and ×1.4 from week 28, same for
  the daily cumulative target; 2026-09-17 "GL v2": meals = items within 45 min, protein/fat damping falls
  linearly with distance up to 60 min, first meal of the day ×1.15 amplitude on the curve only, kernel peak
  moves later with meal net carbs and a fatty meal (>20 g) peaks later with a longer tail, composition
  heuristic estimates the CARBOHYDRATE's GI only (base 65, lowered by fibre alone — fat is never
  deducted there because the meal damping already counts it once), treats <5 g net carbs **per portion**
  as negligible and sugary drinks/sugar as GI 65 (checked before the negligible test); the kernel tail is
  capped (`glTailCap`) at 25% of peak by 3 h, 5% by 4 h, zero by 5 h, so fat delays and widens the peak
  (43–100 min) without holding the curve up for half a day; the card and the report show **time above the
  threshold** (`glTimeAbove`, minutes, plus minutes in the medium band) instead of a peak count, which
  broke when waves merged; a
  "פחמימות נטו לארוחה" block rates each meal against 45/60/30 g (breakfast/main/snack, by time and size);
  glucose measurements can be entered from the meal modal (`day.glucose[].meal_id/min_after`) and are drawn
  as ◆ on the chart with a right-hand mg/dL scale; daily cumulative gauge vs personal target) → "תנועה — הליכה" card (live walk
  timer, manual entry, walks soften the GL curve; soft warnings >45 min/segment, >90 min/day)
  with the **sitting-break sub-block** (2026-09-17: local timer `sit_timer_v1`, reminder every
  30/45/60 min, "קמתי לרגע" resets the stretch, starting a walk counts as a break and pauses
  the sit timer, overdue → red note in the card + in the "now" card + toast/vibrate; per-day
  summary saved to `day.sit`) → "שמש — ויטמין D" card (UV from solar elevation × manual cloud,
  no API; IU estimate is informational only).
- Her medical constraints (short cervix): walking allowed, no strenuous effort, no prolonged
  standing, no lifting >5 kg, no bed rest. Keep all activity wording soft and non-judgmental.
- Report export (מעקב לאורך זמן → "דוח לייצוא"; Today → "שתפי את היום"): audiences nurse/claude,
  print page / markdown / csv / share. Never exports chat or password.

## 7. Smoke test (headless)

Playwright is preinstalled (`/opt/pw-browsers/chromium`). Load `file://…/nutrition.html`,
seed `window.App.state`, click tabs/actions, assert no `pageerror`. Example script lives
in the session scratchpad during work; recreate as needed (see git history of this skill).

## 7b. Food cards: versioning rule (2026-09-17)

A **new bake with changed ingredients** (e.g. the roll with ground lentils + vital gluten) gets a **new
food card**, never an overwrite, so past days stay correct. Overwrite only to fix a card that was
computed wrongly for the same recipe. Logged meals keep their snapshot, so a card fix does not change
past days by itself — say so when reporting one.

**Recipe cards from 2026-09-17 on** are computed from the ingredient list with USDA values and now
include the new nutrients (selenium, B2, vitamin E, ALA, natural folate). Two things to state every
time: the GI is a weighted average over each ingredient's available carbohydrate (fresh whole wheat 68
at her medium-fine grind, lentil flour 30, honey 61, 55% chocolate 40, tahini 35), and the per-100 g
values depend on an assumed baked mass while the **per-unit** values do not — so ask for the unit count
or the weight of one unit rather than guessing twice. Selenium from wheat is soil-dependent: imported
hard red wheat is high (61 mcg/100 g), local wheat can be 4-10x lower. Say so on any card that carries it.

**Rewriting past records after a card fix** (done 2026-09-17 for `f_decaf_oat` and
`f_choc_chip_cookies`): only for cards corrected because they were *wrong*, never for a card whose
portion legitimately changed over time — the 10.9 rolls were smaller (70 g) by her explicit decision and
must not be recomputed against the 160 g card. For each affected meal recompute exactly as the page
does: `grams = qty × portion` (the count she reported is the truth, not the stored grams), then
`nutrients = per100 × grams / 100`. Write the whole day doc back with `if_version`, and report the
per-day delta for every nutrient that moved.

## 7b2. Two sessions, one page (2026-09-18)

A second conversation published the symptom card straight to the artifact without committing. Before
**every** publish from here: `Artifact read` the live page and `cmp` it (minus the first line and the
trailing `</body></html>`) against `nutrition/nutrition.html`. If they differ, split the live page back
into `src/` first (template = `src/page.html`, split `__DATA__` on the first lines of `targets.js` and
`rules.js`), rebuild, confirm byte equality, commit — and only then apply the new change. Publishing an
older build silently deletes the other session's work.

## 7c. Nutrient model v2 (2026-09-17, page version 29)

Built from her `dashboard_code_updates.md`. Do not undo any of it without her:

- **Targets.** Protein is `pre-pregnancy kg × 1.2 + 25 g` from trimester 2, then ×1.15 for veganism
  (57.2 kg → **108 g**, was 71). B12 target for vegans is the supplement dose **25 mcg**, not the 2.6 mcg
  food RDA. Choline **550** with a 450 floor and a 930 soft ceiling.
- **Upper limits are form-aware.** `NUTRIENTS[].ulKey` names the form the UL applies to — vitamin A →
  `retinol`, folate → `folicAcid` — and `statusOf` compares that amount, not the total. Beta-carotene
  from sweet potato and methylfolate from the prenatal no longer raise "over the limit".
- **`floor` on a limit nutrient.** Sodium 1500 (pregnancy needs it for plasma volume); below it the
  status is `low`, which is a real state in the UI, not "good".
- **11 new nutrients**: dha (target 250), epa, dpa, ala (1.4 g), retinol, betaCarotene, folicAcid,
  folateNatural, selenium (60), b2 (1.4), vitE (15). `sub` marks a breakdown of a parent nutrient.
- **Forms are derived, not typed in** (`splitForms`): animal foods carry retinol, plants beta-carotene;
  folate is natural except fortified cereal. A card that states the split itself wins.
- **Supplement cards** carry `chem_forms` (per nutrient), `serving` (the label serving, distinct from
  `doses`) and `active_since`. `partialDose` says what is missing when fewer units than the serving
  were ticked ("1 of 2 — missing 275 mg choline").

## 8. Open items (as of 2026-09-17)

- Halva label and choline label still to be sent (values are estimates, `label_notes` say so).
- Chocolate-chip cookie weight (assumed 44 g) and chocolate type; roll weight now ~160 g
  (recipe of 11.9: 11 rolls from 1 kg flour; earlier logs used smaller rolls — do not fix).
- Whether the "📷 צרפי תמונה" button appears in her viewer (needs `sample.limits().images`).
- Glucose tolerance test not done yet; no GDM rules active.
- Sun card: she has not confirmed skin type (default III) or work hours.
- Sitting-break timer: default 45 min, not yet confirmed by her.
- History tab does not chart sitting breaks; report export does not include `day.sit`.
- GL v3 (2026-09-17, same day) fixed three things her analysis chat found in v2: the fat-lengthened tail
  was unphysiological (curve still at 56% of peak 4.5 h after dinner), "number of peaks" broke when waves
  merged (203 GL on a day with "one peak"), and the composition heuristic deducted fat twice so chips came
  out at GI 47. Do not reintroduce any of the three.
- GL v2 (2026-09-17) came from her analysis chat; the week factor, morning ×1.15, meal caps 45/60/30 and the
  meal-kind heuristic (first before 11:30 = breakfast, largest in 12–16:30 / 17:30–22:30 = main) are not yet
  validated against real glucose readings — once she has a glucometer, compare ◆ points with the curve.
- Personal GI values changed 2026-09-17: `f_rolls` 62→70, `f_choc_chip_cookies` 55→60 (retroactive, GI is looked up at render time).
- Nutrient coverage is now measured in the page itself (`coverageOf`): the share of the day's food kcal
  that came from items carrying a value for that nutrient. Below 70% the row gets a quiet ◍ marker and
  the nutrient modal says the number is a floor. Measured over 4.9–17.9: iodine and omega-3 1.5%, B12
  and vitamin D 59%, vitamin A 65%, choline 75%; macros, iron, calcium, sodium, potassium, magnesium
  97–100%.
- Still not tracked (low priority in her spec): saturated fat, vitamin K, B1, B3, copper, phosphorus.
  They are on the prenatal label and live as free text in `label_notes`.
- `settings/targets` now stores `overrides_set_at` next to `overrides`; the iron override predates it,
  so its date stays unknown.
- The private context doc `settings/handoff` in the db has the fuller list — read it first.
