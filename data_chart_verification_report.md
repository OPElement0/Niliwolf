# Data-integrity Report — `data_table.html` chart vs. table

**Generated:** 2026-05-20 04:15  
**Source:** `wolves_data.xlsx`, sheet `נתוני זיהוי זאבים (2)`  
**HTML:** `data_table.html` (build_iso: `2026-05-20 04:15`)

## 1. Headline

✅ **ALL FOUR INTEGRITY CHECKS PASSED.** The chart numbers and the per-cell statuses in the table are perfectly consistent with the raw `wolves_data.xlsx` data and with `wolf_lib`'s classification rules.

## 2. Source numbers

| item | value |
|---|---|
| rows in sheet (2) | 100 |
| rows with non-empty `code` (analysis pool used by chart + statuses) | 100 |
| rows with `code` AND `#pictures > 0` (load_data pool) | 100 |
| region cells in table (rows × 9 regions) | 900 |
| HTML reports `n_total_rows` | 100 |
| HTML reports `n_pool` | 100 |

## 3. Layer 1 — per-cell status (table colour bars)

Checked **900** region cells against `process_all_regions`.

✅ **All cell statuses match expected.**


## 4. Layer 2 — per-region bucket distribution (the chart)

Compared `PAYLOAD.anatomy.bucket_dist` in the page against `identification_buckets(processed, region)` for every (region, bucket).

✅ **All 9 × 12 = 108 bucket cells in the chart match expected.**


Reference (chart values, all confirmed correct):

| region | Unique (1) | Shared 2-3 | Shared 4-6 | Shared 7-10 | Shared 11-20 | Shared 21-35 | Shared 36+ | Asymmetric | Partial-ambiguous | P | N | Empty |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A1 | 54 | 28 | 9 | 0 | 0 | 0 | 0 | 2 | 6 | 0 | 1 | 0 |
| A2 | 17 | 30 | 29 | 7 | 0 | 0 | 0 | 3 | 7 | 0 | 7 | 0 |
| B3 | 2 | 8 | 4 | 8 | 11 | 0 | 0 | 1 | 33 | 4 | 29 | 0 |
| B4 | 2 | 3 | 10 | 33 | 11 | 0 | 0 | 3 | 9 | 9 | 20 | 0 |
| B5 | 3 | 3 | 13 | 8 | 30 | 0 | 0 | 3 | 11 | 4 | 25 | 0 |
| C6 | 26 | 19 | 27 | 17 | 0 | 0 | 0 | 0 | 6 | 1 | 4 | 0 |
| C7 | 1 | 3 | 6 | 10 | 31 | 29 | 0 | 0 | 1 | 5 | 14 | 0 |
| D8 | 9 | 12 | 14 | 0 | 20 | 0 | 0 | 0 | 36 | 2 | 7 | 0 |
| D9 | 0 | 0 | 6 | 0 | 12 | 21 | 41 | 0 | 0 | 2 | 18 | 0 |

## 5. Layer 3 — codes_per_region (the drill-down modal source)

Each region's `(code, count)` list in the HTML, compared to value-counts of the unambiguous wolves' cleaned codes.

✅ **All 205 distinct codes (across 9 regions) match expected counts.**


## 6. Layer 4 — cross-check: table cell statuses vs. chart bucket sums

For each region, the count of cells in the table with each status must equal the corresponding total in the chart (`unambiguous` total = sum of all Shared+Unique buckets, etc.).

✅ **All cross-checks pass.** Every region's cell-status totals in the table match the chart's bucket sums exactly.


Reference (per region, status counts, all confirmed):

| region | Full (unambig.) | Asym. | Partial | P | N | Empty | total |
|---|---|---|---|---|---|---|---|
| A1 | 91 | 2 | 6 | 0 | 1 | 0 | 100 |
| A2 | 83 | 3 | 7 | 0 | 7 | 0 | 100 |
| B3 | 33 | 1 | 33 | 4 | 29 | 0 | 100 |
| B4 | 59 | 3 | 9 | 9 | 20 | 0 | 100 |
| B5 | 57 | 3 | 11 | 4 | 25 | 0 | 100 |
| C6 | 89 | 0 | 6 | 1 | 4 | 0 | 100 |
| C7 | 80 | 0 | 1 | 5 | 14 | 0 | 100 |
| D8 | 55 | 0 | 36 | 2 | 7 | 0 | 100 |
| D9 | 80 | 0 | 0 | 2 | 18 | 0 | 100 |

## 7. Asymmetric wolves (sanity listing)

| serial | region | raw value | right (cleaned) | left (cleaned) |
|---|---|---|---|---|
| O77 | A1 | Ra3vzfLb1f | a3vzf | b1f |
| O78 | A1 | Ra4vxiLa4txi | a4vxi | a4txi |
| M5 | A2 | fRa6La1 | a6f | a1f |
| Y32 | A2 | Ra1eLa10e | a1e | a10e |
| O78 | A2 | Ra7iLa10 | a7i | a10 |
| O70 | B3 | Ra2bLb | a2b | b |
| Y31 | B4 | Rb1aLc2a | b1a | c2a |
| Y39 | B4 | Rb1aLd | b1a | d |
| Y47 | B4 | Rb2bLN | b2b | N |
| S104 | B5 | Ra1bLa2b | a1b | a2b |
| Y31 | B5 | Ra1aLc2a | a1a | c2a |
| Y39 | B5 | Ra2bLd | a2b | d |

## 8. Summary

| check | result |
|---|---|
| Per-cell status (table coloured bars) | ✅ pass |
| Per-region bucket counts (chart) | ✅ pass |
| Distinct codes & counts (drill-down) | ✅ pass |
| Cross-check (table totals = chart totals) | ✅ pass |