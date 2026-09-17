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

- **Today tab order:** focus sentence card (bold, above the clock) → "now" card
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
  heuristic treats <5 g net carbs **per portion** as negligible and sugary drinks as GI 65; a
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

## 8. Open items (as of 2026-09-17)

- Halva label and choline label still to be sent (values are estimates, `label_notes` say so).
- Chocolate-chip cookie weight (assumed 44 g) and chocolate type; roll weight now ~160 g
  (recipe of 11.9: 11 rolls from 1 kg flour; earlier logs used smaller rolls — do not fix).
- Whether the "📷 צרפי תמונה" button appears in her viewer (needs `sample.limits().images`).
- Glucose tolerance test not done yet; no GDM rules active.
- Sun card: she has not confirmed skin type (default III) or work hours.
- Sitting-break timer: default 45 min, not yet confirmed by her.
- History tab does not chart sitting breaks; report export does not include `day.sit`.
- GL v2 (2026-09-17) came from her analysis chat; the week factor, morning ×1.15, meal caps 45/60/30 and the
  meal-kind heuristic (first before 11:30 = breakfast, largest in 12–16:30 / 17:30–22:30 = main) are not yet
  validated against real glucose readings — once she has a glucometer, compare ◆ points with the curve.
- Personal GI values changed 2026-09-17: `f_rolls` 62→70, `f_choc_chip_cookies` 55→60 (retroactive, GI is looked up at render time).
- The private context doc `settings/handoff` in the db has the fuller list — read it first.
