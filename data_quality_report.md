# Data Quality Report — `wolves_data.xlsx`

**Generated:** 2026-05-14 01:09  
**Source sheet:** `נתוני זיהוי זאבים (2)` (100 rows × 28 cols)

> **From `data_decisions.json`:** 11 finding(s) suppressed (status=decided_keep), 0 carry a user comment, 0 marked `fixed_in_xlsx` but still detected.

## Summary

| Severity | Categories | Total rows flagged |
|---|---:|---:|
| ❌ Errors (must fix) | 2 | 30 |
| ⚠ Warnings (likely issues) | 2 | 3 |
| ℹ Info (FYI) | 4 | 89 |


## ❌ Errors

### time on camera unparseable
1 entry(ies) don't match any accepted format (dd.mm.yy / d-d.mm.yy / d.m-d.m.yy / dd.mm.yy-dd.mm.yy / m.yyyy / m.yyyy-m.yyyy)

| serial | value | reason |
|---|---|---|
| Y42 | 30.9.20-27.10 | unparseable |

### seen with references unknown wolf
29 reference(s) point to a serial not present in the table

| from_serial | seen_with | missing_reference |
|---|---|---|
| M7 | 1 unrecognized* | 1 unrecognized* |
| F23 | unknown, F24 | unknown |
| F24 | F23, unknown | unknown |
| Y27 | seen together | seen together |
| Y29 | seen together | seen together |
| Y30 | seen together | seen together |
| Y31 | seen together | seen together |
| Y107 | seen together | seen together |
| Y32 | unknown | unknown |
| Y102 | unknown | unknown |
| Y33 | seen together | seen together |
| Y34 | seen together | seen together |
| Y35 | seen together | seen together |
| Y39 | seen together | seen together |
| Y40 | seen together | seen together |
| Y41 | seen together | seen together |
| Y42 | seen together | seen together |
| Y43 | seen together | seen together |
| Y44 | seen together | seen together |
| Y45 | seen together | seen together |
| Sh50 | 7 min after Sh49+Sh109 | 7 min after Sh49+Sh109 |
| Sh52 | Sh53+1 unrecognized | Sh53+1 unrecognized |
| Sh53 | Sh52+1 unrecognized | Sh52+1 unrecognized |
| Sh55 | seen together | seen together |
| Sh57 | seen together* | seen together* |
| Sl60 | unknown | unknown |
| Sn85 | unknown | unknown |
| In92 | seen together | seen together |
| In93 | seen together | seen together |


## ⚠ Warnings

### cams_spotted: non-numeric token
12 entry(ies) contain a token that is not a camera ID

| serial | value | non_numeric_token |
|---|---|---|
| In90 | omer weiner | omer weiner |

### polygon name casing inconsistency
2 polygon(s) appear with multiple capitalisations

| canonical_lower | forms |
|---|---|
| hazeka | ['Hazeka', 'hazeka'] |
| saki | ['Saki', 'saki'] |


## ℹ Info

### 'pack name' vs 'שיוך' diverge
69 row(s) differ between the two columns — for user's manual cleanup

| serial | pack name | שיוך |
|---|---|---|
| M3 | (blank) | makhfi unknown |
| M6H | (blank) | makhfi unknown |
| M10 | (blank) | makhfi unknown |
| S21 | (blank) | unknown |
| S104 | (blank) | unknown |
| F22 | (blank) | group* |
| F26 | lone | (blank) |
| Y27 | dark pack | (blank) |
| Y101 | lone | (blank) |
| Y28 | lone | (blank) |
| Y29 | dark pack | (blank) |
| Y30 | dark pack | (blank) |
| Y31 | dark pack | (blank) |
| Y107 | dark pack | (blank) |
| Y32 | dark pack | (blank) |
| Y102 | dark pack* | (blank) |
| Y33 | dark pack | (blank) |
| Y34 | dark pack | (blank) |
| Y35 | dark pack | (blank) |
| Y36 | yehodiya trio | (blank) |
| Y39 | golden pack | (blank) |
| Y40 | golden pack | (blank) |
| Y41 | golden pack | (blank) |
| Y42 | golden pack | (blank) |
| Y43 | golden pack | (blank) |
| Y44 | golden pack | (blank) |
| Y45 | golden pack | (blank) |
| Y46 | lone | (blank) |
| Y47 | yehodiya trio | (blank) |
| Y48 | yehodiya trio | (blank) |

*(showing first 30 of 69 rows)*

### missing 'main poligon' (in analysis pool)
11 analysed wolf(ves) have empty 'main poligon'

| serial |
|---|
| In89 |
| In90 |
| In91 |
| In92 |
| In93 |
| In94 |
| In95 |
| In96 |
| In97 |
| In98 |
| In105 |

### more cameras than pictures
1 wolf(ves): listed in more cameras than #pictures (worth a sanity check)

| serial | n_cameras | #pictures |
|---|---|---|
| Sl60 | 2 | 1 |

### string hygiene (whitespace / tabs)
8 cell(s) have leading/trailing whitespace, tabs or newlines

| col | serial | value |
|---|---|---|
| cams_spotted | H13S | ' 21, 11' |
| notes | Y28 | 'mostly honey ' |
| notes | Y39 | 'golden fur, dark tail ' |
| notes | Y43 | 'golden fur, dark tail ' |
| notes | Y44 | 'golden fur, dark tail, dark-grey face, ‘wave’ pattern on the face ' |
| notes | Sh52 | 'loves mud ' |
| notes | Sh54 | '”tringle” shape on the cheek ' |
| notes | In95 | 'dark orange fur ' |
