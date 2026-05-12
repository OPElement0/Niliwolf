# Wolves Data Dictionary

> Source: `wolves_data.xlsx`, sheet `נתוני זיהוי זאבים (2)` (28 columns × 104 rows).
> Compiled from user explanations on **2026-05-02**.

This file is the source of truth for what each column means and how it should
be treated in analysis / visualization. **Read it before designing any new chart.**

---

## A. Identity

| Column | Type | Meaning | Use in analysis |
|---|---|---|---|
| `serial number` | text | Unique wolf ID (e.g. `M1`, `Y32`, `Sh109`). 1 row in sheet (2) has it blank — that row also has empty `code` and `#pictures = 0` (placeholder). | PK. Required. |
| `name` | text, sparse (3/104) | **Local info only**: informal nicknames given by other field experts to wolves they had named (Segen, Foxy, Odem). Not part of the user's research. | Show in main table. **DO NOT use in charts/aggregations.** |

## B. Geography

| Column | Type | Meaning | Use in analysis |
|---|---|---|---|
| `area` | text, ~18 unique values | All polygons in which the wolf was identified. May be a comma-separated list when seen in multiple polygons. | Filter; can drive map/multi-polygon plots. |
| `main poligon` | text, ~11 unique values | The single primary polygon for the wolf (most observations there). | Filter; drives "wolves per polygon" charts. **This is the primary geographic field.** |

The study area is divided into polygons. A wolf seen in only one polygon has the
same value in both columns; a wolf seen in multiple has a list in `area` and a
single primary in `main poligon`.

## C. Demographic

| Column | Type | Meaning | Use in analysis |
|---|---|---|---|
| `gender` | `m` / `f` / blank (33/104 filled) | Filled **only when 100% certain** from observation. Blank = uncertain (not "unknown" — could be either, just couldn't confirm). | Filter, breakdown axis — but always note "uncertain" as a third bucket. Don't infer. |

## D. Sighting metadata

| Column | Type | Meaning | Use in analysis |
|---|---|---|---|
| `cams_spotted` | text, comma-separated camera IDs | The project deployed **60 cameras** numbered 1–60. Value = the camera (or comma-separated list of cameras) where this wolf was detected. e.g. `27` = camera 27 only; `27, 29, 30` = three cameras. | Drives camera-coverage plots; can build wolf×camera matrix or camera-mobility metric. |
| `time on camera` | text, Israeli `dd.mm.yy` format | If only one observation: a single date. If multiple observations: a range `<earliest>-<latest>` (still `dd.mm.yy` for each end). e.g. `29.10.20` = single observation Oct 29, 2020; `1-9.11.20` = first seen Nov 1, last seen Nov 9, 2020. | Parse with care (single vs range); drives any temporal plot. |
| `seen with` | text | List of wolves that were photographed together with this wolf. Relevant for analysis (co-occurrence). Identified neighbors are listed by serial; unidentified neighbors are listed as `1 unrecognized` / `2 unrecognized?` (the `?` denotes uncertainty). | Drives the "seen with" co-occurrence network. Treat as a list of references. |
| `#sights` | int | Number of sighting events for this wolf. | Filter; weight in importance metrics. |
| `#pictures` | int | Total number of pictures of this wolf. **Required > 0** for analysis. | The main analysis filter. |
| `#right`, `#left`, `#front`, `#no good` | int | Picture counts broken down by direction / quality. | Filter; QA. |

## E. Social / pack (currently messy — DO NOT USE)

| Column | Type | Meaning | Use in analysis |
|---|---|---|---|
| `social dynamic` | `pack` / `group` / `lone` / `unknown`, each optionally suffixed `*` for "probable but not certain" | The user's own size-category classification. The `*` suffix is a confidence marker (per 2026-05-12 ruling). Empty = not classified yet. | Aggregate by base category; treat `*` as a "probable" annotation (alongside, not separate). |
| `pack name` | text | User's manual sorting category. Currently messy. | **IGNORE for now.** Will be cleaned with the user before being used. |
| `שיוך` (Hebrew: "association") | text | Same purpose as `pack name`, currently overlapping. Will eventually merge to one column. | **IGNORE for now.** |

## F. Pelt code (CORE — analysis input)

| Column | Type | Meaning |
|---|---|---|
| `code` | text | Composite of all 9 region codes joined with `_`. Empty → drop wolf from analysis. |

### Region columns — proper anatomical names

Per the user's schematic + table (2026-05-03):

| Column | Group | Region name | Anatomical description | Code structure | Primary variation encoded |
|---|---|---|---|---|---|
| **A1** | A — Cheek | Infraorbital patch | Light/dark patch below the eye on the cheek | `<pat-letter><digit>[mods][color]` | Shape, size, contrast |
| **A2** | A — Cheek | Malar (eye–ear) stripe | Stripe extending from eye toward ear | same as A1 | Presence, thickness, continuity |
| **B3** | B — Periocular | Below eye | Lower periocular region | `<pat-letter><digit>[a\|b]` | Contrast, extent |
| **B4** | B — Periocular | Upper outer | Outer upper eye region | same as B3 | Shape, shading |
| **B5** | B — Periocular | Upper inner | Inner upper eye region near nasal bridge | same as B3 | Shape, contrast |
| **C6** | C — Nasal | Central stripe | Stripe along bridge of nose | same as A1 (color set without `m`) | Width, continuity |
| **C7** | C — Nasal | Side region | Lateral nasal areas | pattern only — no color | Color contrast, extent |
| **D8** | D — Nape | Upper nape | Upper neck behind head | `a<color-digit>[b<pattern-digit>]` | Color tone, patterning |
| **D9** | D — Nape | Side nape | Lateral neck region | `a<contrast-digit>` | Pattern, contrast |

For the per-region code structure, see `CLAUDE.md` Section 4.
For classification rules (`unambiguous`, `asymmetric`, `partial_ambiguous`, `N`, `P`, `empty`),
see `CLAUDE.md` Section 3.

### Code-character semantics (summary)

- **A1, A2**: leading letter `{a,b,c,d}` = pattern type; digit = pattern refinement;
  optional 1–2 middle letters = further refinements; trailing letter from `{e..m}` = color.
- **B3, B4, B5**: pattern letter + digit; trailing `a` = low contrast, trailing `b` = high
  contrast. (Not a color suffix — a contrast suffix.)
- **C6**: same shape as A1/A2; trailing color letter from `{e..l}` (no `m`).
- **C7**: pattern only (no color, no contrast suffix).
- **D8**: first letter+digit (`aN`) = color; optional second letter+digit (`bN`) = pattern.
- **D9**: contrast level only (`a2` = level 2 contrast); no shape variable.

The user has a formal internal document that maps each individual letter to specific
morphological features; this dictionary records the structural grammar above as the
basis for visualisations and aggregate analysis.

## G. Free-text

| Column | Type | Meaning | Use in analysis |
|---|---|---|---|
| `notes` | free text | **Local info only**: ad-hoc notes from other expert (e.g. "alpha female", "born in 2015", "Odem's daughter"). NOT part of the user's analysis. | Show in main table only. **DO NOT extract / parse / aggregate** for charts. |

---

## Filter / visualization usability matrix

| Column | Filter in viewer? | Use as breakdown axis? | Show in table? |
|---|---|---|---|
| serial number | ✓ | — | ✓ |
| name | search only | ✗ (local info) | ✓ |
| area | ✓ | ✓ (multi-polygon) | ✓ |
| main poligon | ✓ | ✓ (primary) | ✓ |
| gender | ✓ | ✓ (with "uncertain" bucket) | ✓ |
| cams_spotted | ✓ (parse list) | ✓ | ✓ |
| social dynamic | ✓ | ⚠ pass-through, paper will explain | ✓ |
| שיוך | ✗ ignore | ✗ ignore | ✓ (editable for cleanup) |
| pack name | ✗ ignore | ✗ ignore | ✓ (editable for cleanup) |
| seen with | search only | ✓ (network plot) | ✓ |
| notes | search only | ✗ (local info) | ✓ |
| time on camera | search only | ✓ (with date parsing) | ✓ |
| #sights, #*, #pictures | ✓ (numeric range) | ✓ | ✓ |
| code | ✗ (no header filter) | core analysis | ✓ |
| A1..D9 | ✓ | core analysis | ✓ (anatomical color tint) |

## Outstanding open items (to resolve in next checks)

- **Sheet `נתוני זיהוי זאבים` (non-(2))** has 8 records the (2) sheet doesn't:
  `F21s, O79, Sh37y, Sh56, Sh58, Sl63, Sn86, data`. The `data` entry looks like a header
  leaked into a row. Need to decide: do these wolves belong in (2)? Are some duplicates
  with suffix variants (`F21` vs `F21s`)?
- **Sheet (2) has 8 wolves not in non-(2)**: `F21, F104, In105, K106, Sh109, Sl103, Y37, Y107`.
  Likely just newer/cleaner entries.
- **3 wolves with serial but no code/pictures**: `M11H, F25, Y38` — placeholders for known
  but unphotographed wolves; kept in Excel, hidden in viewer (admin can edit).
- **1 wolf with code but `#pictures=0`**: `O80` — user said this is a data-entry error she
  will fix.
- **`pack name` and `שיוך` cleanup** — pending; user will lead this.
