"""Build an interactive HTML dashboard for the wolf pelt analysis (English).

Reads the processed data and generates `wolf_dashboard.html` — a single,
self-contained HTML file with all data embedded and Plotly.js loaded from
CDN.

Tabs:
    - Overview          : key stats, headline cards, summary table
    - Rank-Frequency    : 3x3 grid OR overlay; toggle log/linear; A/B/C version
    - Composition       : stacked bars per region (% or absolute)
    - Capacity Map      : scatter (entropy vs % usable)
    - Color / Pattern   : color & pattern frequencies for A1, A2, C6, D8
    - Wolves Table      : every wolf x every region with status badges
"""

from __future__ import annotations

import json
import sys

import pandas as pd

from wolf_lib import (
    ID_BUCKET_ORDER,
    OUTPUT_DIR,
    REGIONS,
    identification_buckets,
    load_data,
    process_all_regions,
    rank_frequency,
    region_summary,
)

# ---------------------------------------------------------------------------
# Visual constants
# ---------------------------------------------------------------------------

GROUP_COLORS = {
    "A": "#E91E63",  # pink — Cheek
    "B": "#42A5F5",  # blue — Periocular (around eye)
    "C": "#FF7043",  # orange — Nasal
    "D": "#9C27B0",  # purple — Nape
}

REGION_GROUP = {
    "A1": "A", "A2": "A",
    "B3": "B", "B4": "B", "B5": "B",
    "C6": "C", "C7": "C",
    "D8": "D", "D9": "D",
}

GROUP_NAMES = {
    "A": "Cheek (A1, A2)",
    "B": "Periocular (B3, B4, B5)",
    "C": "Nasal (C6, C7)",
    "D": "Nape (D8, D9)",
}

# Proper anatomical region names + descriptions (per user's schematic, 2026-05-03).
# Surfaced as tooltips and tab subtitles throughout the dashboard.
REGION_NAMES = {
    "A1": "Infraorbital patch",
    "A2": "Malar (eye–ear) stripe",
    "B3": "Below eye",
    "B4": "Upper outer eye",
    "B5": "Upper inner eye (near nasal bridge)",
    "C6": "Central nasal stripe",
    "C7": "Lateral nasal (side region)",
    "D8": "Upper nape",
    "D9": "Side nape",
}

REGION_DESCRIPTIONS = {
    "A1": "Light/dark patch below the eye on the cheek",
    "A2": "Stripe extending from eye toward ear",
    "B3": "Lower periocular region",
    "B4": "Outer upper eye region",
    "B5": "Inner upper eye region near nasal bridge",
    "C6": "Stripe along bridge of nose",
    "C7": "Lateral nasal areas",
    "D8": "Upper neck behind head",
    "D9": "Lateral neck region",
}

REGION_VARIATION = {
    "A1": "Shape, size, contrast",
    "A2": "Presence, thickness, continuity",
    "B3": "Contrast, extent",
    "B4": "Shape, shading",
    "B5": "Shape, contrast",
    "C6": "Width, continuity",
    "C7": "Color contrast, extent",
    "D8": "Color tone, patterning",
    "D9": "Pattern, contrast",
}

# 9 distinct (line dash, marker symbol) combos so each region is visually
# unique even when its anatomical-group neighbour shares its colour.
REGION_STYLES = {
    "A1": {"dash": "solid",   "symbol": "circle"},
    "A2": {"dash": "dash",    "symbol": "square"},
    "B3": {"dash": "solid",   "symbol": "circle"},
    "B4": {"dash": "dash",    "symbol": "square"},
    "B5": {"dash": "dot",     "symbol": "diamond"},
    "C6": {"dash": "solid",   "symbol": "circle"},
    "C7": {"dash": "dash",    "symbol": "square"},
    "D8": {"dash": "solid",   "symbol": "circle"},
    "D9": {"dash": "dash",    "symbol": "square"},
}

STATUS_COLORS = {
    "unambiguous": "#43A047",
    "asymmetric": "#1E88E5",
    "partial_ambiguous": "#9E9E9E",
    "P": "#FB8C00",
    "N": "#E53935",
    "empty": "#757575",
    "unknown": "#FFEB3B",
}

# Bottom-to-top order in stacked composition bars
STATUS_ORDER = ["unambiguous", "asymmetric", "partial_ambiguous", "P", "N"]

STATUS_LABELS = {
    "unambiguous": "Unambiguous (clean code)",
    "asymmetric": "Asymmetric (R/L split)",
    "partial_ambiguous": "Partial / ambiguous",
    "P": "P — unclear",
    "N": "N — not visible",
    "empty": "Empty",
    "unknown": "Unknown",
}

# Identification-bucket colours — green→red gradient for the count buckets,
# distinct hues for the special categories.
ID_BUCKET_COLORS = {
    "Unique (1)":         "#1B5E20",  # dark green — best
    "Shared 2-3":         "#66BB6A",
    "Shared 4-6":         "#C5E1A5",
    "Shared 7-10":        "#FFF176",  # yellow
    "Shared 11-20":       "#FFB74D",
    "Shared 21-35":       "#F57C00",
    "Shared 36+":         "#6D4C41",  # brown — extreme over-sharing
    "Asymmetric":         "#1E88E5",  # blue
    "Partial-ambiguous":  "#9E9E9E",  # gray
    "P":                  "#FB8C00",  # warm orange
    "N":                  "#E53935",  # red
    "Empty":              "#000000",  # black — should be 0 once user fixes data
}


# ---------------------------------------------------------------------------
# Build the data dict that the dashboard will consume
# ---------------------------------------------------------------------------

def build_data():
    df = load_data(only_with_pictures=True)
    proc = process_all_regions(df)
    summary = region_summary(proc)

    regions = {}
    for r in REGIONS:
        rf = {}
        for v in ("A", "B", "C"):
            rf_v = rank_frequency(proc, r, v)
            rf[v] = rf_v[["rank", "code", "count", "percent"]].to_dict(orient="records")

        sc = {k: int(v) for k, v in proc[f"{r}_status"].value_counts().items()}

        cp = None
        if r in {"A1", "A2", "C6", "D8"}:
            cs = proc[f"{r}_color"].dropna().astype(str)
            ps = proc[f"{r}_pattern"].dropna().astype(str)
            cp = {
                "colors": [
                    {"value": str(x) if x else "(none)", "count": int(n)}
                    for x, n in cs.value_counts().items()
                ],
                "patterns": [
                    {"value": str(x) if x else "(empty)", "count": int(n)}
                    for x, n in ps.value_counts().items()
                ],
            }

        regions[r] = {
            "rank_freq": rf,
            "status_counts": sc,
            "group": REGION_GROUP[r],
            "color": GROUP_COLORS[REGION_GROUP[r]],
            "style": REGION_STYLES[r],
            "color_pattern": cp,
        }

    summary_records = []
    for _, row in summary.iterrows():
        d = {}
        for k, v in row.items():
            if isinstance(v, list):
                d[k] = v
            elif pd.isna(v):
                d[k] = None
            elif isinstance(v, (int, float)):
                d[k] = float(v)
            else:
                d[k] = str(v)
        summary_records.append(d)

    wolves = []
    for _, row in proc.iterrows():
        wolf = {
            "serial_number": str(row["serial number"]),
            "area": str(row.get("area", "")) if pd.notna(row.get("area", "")) else "",
            "main_poligon": str(row.get("main poligon", "")) if pd.notna(row.get("main poligon", "")) else "",
            "pictures": int(row["#pictures"]) if pd.notna(row["#pictures"]) else 0,
        }
        for r in REGIONS:
            wolf[r] = str(row[r]) if pd.notna(row[r]) else ""
            wolf[f"{r}_status"] = str(row[f"{r}_status"])
            cleaned = row[f"{r}_cleaned"]
            wolf[f"{r}_cleaned"] = str(cleaned) if cleaned else ""
            right = row.get(f"{r}_right")
            left = row.get(f"{r}_left")
            wolf[f"{r}_right"] = str(right) if pd.notna(right) else ""
            wolf[f"{r}_left"] = str(left) if pd.notna(left) else ""
        wolves.append(wolf)

    # Identification buckets per region
    id_buckets = {}
    for r in REGIONS:
        b = identification_buckets(proc, r)
        id_buckets[r] = {k: int(v) for k, v in b.items()}

    return {
        "regions": regions,
        "summary": summary_records,
        "wolves": wolves,
        "n_total": len(proc),
        "group_colors": GROUP_COLORS,
        "group_names": GROUP_NAMES,
        "region_group": REGION_GROUP,
        "all_regions": REGIONS,
        "status_colors": STATUS_COLORS,
        "status_order": STATUS_ORDER,
        "status_labels": STATUS_LABELS,
        "id_buckets": id_buckets,
        "id_bucket_order": ID_BUCKET_ORDER,
        "id_bucket_colors": ID_BUCKET_COLORS,
    }


# ---------------------------------------------------------------------------
# HTML template
# ---------------------------------------------------------------------------

HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Wolf Pelt Pattern Analysis — Interactive Dashboard</title>
<script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
<style>
* { box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  margin: 0; padding: 16px; background: #f5f7fa; color: #2c3e50;
}
.container { max-width: 1500px; margin: 0 auto; }

header {
  background: linear-gradient(135deg, #fff 0%, #f9f9fb 100%);
  padding: 20px 24px; border-radius: 12px; margin-bottom: 16px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
}
h1 { margin: 0; font-size: 22px; }
h1 small { font-weight: 400; color: #6c7a89; font-size: 14px; margin-left: 10px; }

.stats { display: flex; gap: 12px; margin-top: 12px; flex-wrap: wrap; }
.stat {
  background: #f0f4f8; padding: 8px 16px; border-radius: 8px;
  font-size: 14px; display: flex; align-items: center; gap: 8px;
}
.stat-value { font-weight: 700; font-size: 17px; color: #1a1a1a; }

.legend-anatomy {
  display: flex; gap: 8px; margin-top: 10px; font-size: 12px;
  flex-wrap: wrap; align-items: center;
}
.legend-anatomy strong { margin-right: 4px; }
.legend-anatomy span { padding: 3px 10px; border-radius: 6px; color: white; font-weight: 600; }

.tabs { display: flex; gap: 4px; margin-bottom: 0; flex-wrap: wrap; }
.tab {
  padding: 10px 18px; cursor: pointer; background: #e8ecef;
  border-radius: 8px 8px 0 0; font-size: 14px; transition: all 0.15s;
  border-bottom: 3px solid transparent;
}
.tab:hover { background: #d8dde2; }
.tab.active {
  background: white; border-bottom-color: #E91E63;
  font-weight: 700; color: #E91E63;
}
.tab-content {
  display: none; background: white; padding: 20px;
  border-radius: 0 12px 12px 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.06);
  min-height: 500px;
}
.tab-content.active { display: block; }

.controls {
  margin-bottom: 16px; display: flex; gap: 12px; flex-wrap: wrap;
  align-items: center; padding: 10px 14px; background: #f7f9fb;
  border-radius: 8px;
}
.controls label { display: flex; align-items: center; gap: 6px; font-size: 14px; }
.controls select, .controls input[type=text] {
  padding: 6px 10px; border-radius: 6px; border: 1px solid #ccd2d8;
  background: white; font-size: 14px;
}

.grid-3x3 {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;
}
.mini-plot { background: #fafbfc; border-radius: 8px; min-height: 280px; padding: 4px; }

table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { padding: 8px 10px; border-bottom: 1px solid #e0e6ed; text-align: left; }
th {
  background: #f0f4f8; cursor: default; user-select: none;
  position: sticky; top: 0; z-index: 1;
}
tr:hover td { background: #fafbfc; }

.group-A { color: #E91E63; }
.group-B { color: #42A5F5; }
.group-C { color: #FF7043; }
.group-D { color: #9C27B0; }
.group-pill {
  display: inline-block; padding: 2px 8px; border-radius: 6px;
  color: white; font-weight: 700; font-size: 11px;
}

.badge {
  display: inline-block; padding: 2px 8px; border-radius: 12px;
  font-size: 11px; font-weight: 600;
}
.badge-unambiguous       { background: #E8F5E9; color: #2E7D32; }
.badge-asymmetric        { background: #E3F2FD; color: #1565C0; }
.badge-partial_ambiguous { background: #ECEFF1; color: #455A64; }
.badge-N                 { background: #FFEBEE; color: #C62828; }
.badge-P                 { background: #FFF3E0; color: #EF6C00; }
.badge-empty             { background: #FAFAFA; color: #616161; }
.badge-unknown           { background: #FFF9C4; color: #F57F17; }

.summary-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-bottom: 16px; }
.summary-card {
  background: #fff; padding: 12px 14px; border-radius: 8px;
  border-left: 4px solid #E91E63;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}
.summary-card.success { border-color: #43A047; }
.summary-card.warn    { border-color: #FB8C00; }
.summary-card.bad     { border-color: #E53935; }
.summary-card .label { font-size: 12px; color: #6c7a89; }
.summary-card .value { font-size: 20px; font-weight: 700; margin-top: 4px; }
.summary-card .sub   { font-size: 12px; color: #6c7a89; margin-top: 2px; }

.note {
  background: #fff8e1; border-left: 4px solid #ffa726; padding: 10px 14px;
  border-radius: 6px; font-size: 13px; margin: 12px 0;
}
.note strong { color: #e65100; }

@media (max-width: 900px) {
  .grid-3x3 { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 600px) {
  .grid-3x3 { grid-template-columns: 1fr; }
  .tab { padding: 8px 12px; font-size: 13px; }
}
</style>
</head>
<body>
<div class="container">

<header>
  <h1>🐺 Wolf Pelt Pattern Analysis <small>Interactive Dashboard</small></h1>
  <div class="stats">
    <div class="stat">Total wolves: <span class="stat-value" id="stat-wolves">--</span></div>
    <div class="stat">Pelt regions: <span class="stat-value">9</span></div>
    <div class="stat">Anatomical groups: <span class="stat-value">4</span></div>
    <div class="stat">Collection window: <span class="stat-value">3 months</span></div>
  </div>
  <div class="legend-anatomy">
    <strong>Anatomical groups:</strong>
    <span style="background:#E91E63;">A — Muzzle</span>
    <span style="background:#42A5F5;">B — Eye</span>
    <span style="background:#FF7043;">C — Nose &amp; Chin</span>
    <span style="background:#9C27B0;">D — Head Side</span>
  </div>
  <div id="data-edit-banner" style="margin-top:12px; padding:10px 14px; background:#fff3cd; border:1px solid #ffeaa7; border-radius:6px; font-size:13px; color:#856404; display:none;">
    <strong>📝 Editing the data:</strong>
    edit <code>wolves_data.xlsx</code> in Excel, save it, then double-click
    <code>update.bat</code>. The dashboard reopens automatically with refreshed numbers.
    <span id="empty-warn" style="display:none; margin-left: 12px;">
      ⚠️ <strong>1 wolf has an empty D9 cell:</strong> <span id="empty-wolf"></span>
    </span>
  </div>
</header>

<div class="tabs">
  <div class="tab active" data-tab="overview">📊 Overview</div>
  <div class="tab" data-tab="rank-freq">📈 Rank-Frequency</div>
  <div class="tab" data-tab="composition">🧩 Composition</div>
  <div class="tab" data-tab="identification">🆔 Identification Power</div>
  <div class="tab" data-tab="capacity">🎯 Capacity Map</div>
  <div class="tab" data-tab="color-pattern">🎨 Color / Pattern</div>
  <div class="tab" data-tab="wolves">🐺 Wolves Table</div>
</div>

<div class="tab-content active" id="tab-overview">
  <div class="summary-cards" id="summary-cards"></div>
  <div class="note">
    <strong>Reading the table:</strong> <code>n_unambiguous</code> = wolves whose code is well-defined (clean — not partial, not N/P).
    <code>n_unique</code> = number of <em>distinct codes</em> among them.
    Many wolves can share the same unambiguous code (e.g., D9 has 78 unambiguous wolves but only 4 distinct codes).
  </div>
  <h3 style="margin-top: 16px;">Per-region summary</h3>
  <div id="summary-table"></div>
  <div id="overview-plot" style="height: 420px; margin-top: 20px;"></div>
</div>

<div class="tab-content" id="tab-rank-freq">
  <div class="controls">
    <label>Layout:
      <select id="rf-layout">
        <option value="grid">3×3 Grid (one panel per region)</option>
        <option value="overlay">Overlay (all 9 on shared axes)</option>
      </select>
    </label>
    <label>Y-scale:
      <select id="rf-yscale">
        <option value="log">Logarithmic (log10)</option>
        <option value="linear">Linear</option>
      </select>
    </label>
    <label>Data version:
      <select id="rf-version">
        <option value="C">C — clean (excludes N/P/partial)</option>
        <option value="B">B — without N/P</option>
        <option value="A">A — raw (everything)</option>
      </select>
    </label>
  </div>
  <div id="rf-content"></div>
  <div class="note">
    <strong>How to read:</strong> X axis = code rank (1 = most frequent). Y = number of wolves with that code.
    Region colours follow anatomical groups; line dash &amp; marker shape distinguish regions within the same group.
    Hover any point to see its code.
  </div>
</div>

<div class="tab-content" id="tab-composition">
  <div class="controls">
    <label>Display:
      <select id="comp-mode">
        <option value="percent">Percent (0–100%)</option>
        <option value="absolute">Absolute (wolf count)</option>
      </select>
    </label>
    <label>Sort bars by:
      <select id="comp-order">
        <option value="anatomy">Anatomical group</option>
        <option value="entropy">Shannon entropy ↓</option>
        <option value="usable">% usable ↓</option>
        <option value="unique">Distinct codes (n_unique) ↓</option>
      </select>
    </label>
  </div>
  <div id="comp-plot" style="height: 600px;"></div>
  <div class="note">
    <strong>How to read:</strong> Each bar = one region. Stack colours show how the <span id="comp-n-total">__N_TOTAL__</span> wolves are distributed:
    🟢 unambiguous = clean code, 🔵 asymmetric = R/L pattern, ⚪ partial / ambiguous, 🟠 P (unclear), 🔴 N (not visible).
    More green = the region was useful for a higher fraction of wolves.
    Numbers above each bar are Shannon entropy (bits).
  </div>
</div>

<div class="tab-content" id="tab-identification">
  <div class="controls">
    <label>Display:
      <select id="id-mode">
        <option value="percent">Percent (0–100%)</option>
        <option value="absolute">Absolute (wolf count)</option>
      </select>
    </label>
    <label>Sort bars by:
      <select id="id-order">
        <option value="anatomy">Anatomical group</option>
        <option value="unique">% Unique (best ID first)</option>
        <option value="entropy">Shannon entropy ↓</option>
      </select>
    </label>
  </div>
  <div id="id-plot" style="height: 600px;"></div>
  <div class="note">
    <strong>How to read:</strong> For each region, every wolf is placed in exactly one bucket.
    The dark-green bar at the bottom counts wolves with a <strong>unique</strong> code
    (no other wolf in this region has the same code) — this is the strongest evidence
    of individual-level identification. Larger green = the region works.
    Brown / red at the top = wolves whose code is shared with many others (or the region
    was unobservable). Hover any segment for exact wolf count.
  </div>
  <h3 style="margin-top: 20px;">Verification table (counts per bucket)</h3>
  <div id="id-table" style="font-size: 12px; overflow-x: auto;"></div>
</div>

<div class="tab-content" id="tab-capacity">
  <div class="note">
    <strong>How to read:</strong> Each region is one point. X = visibility (% of wolves where the region was readable);
    Y = Shannon entropy in bits (information per wolf). Bubble size scales with the count of distinct codes.
    The <strong>upper-right corner ⭐ is ideal</strong> (highly diverse <em>and</em> readable in most photos).
  </div>
  <div id="capacity-plot" style="height: 600px;"></div>
</div>

<div class="tab-content" id="tab-color-pattern">
  <div class="controls">
    <label>Region:
      <select id="cp-region">
        <option value="A1">A1 (lower muzzle)</option>
        <option value="A2">A2 (upper muzzle)</option>
        <option value="C6">C6 (nose tip)</option>
        <option value="D8">D8 (upper head side)</option>
      </select>
    </label>
  </div>
  <div id="cp-plot" style="height: 500px;"></div>
  <div class="note">
    <strong>How to read:</strong> For these regions the code is split into a <strong>colour</strong> letter
    (suffix in A1/A2/C6, the digit after 'a' in D8) and a <strong>pattern</strong> (the rest).
    "missing" indicates the colour or pattern was N/P in the raw data and was removed in cleaning.
  </div>
</div>

<div class="tab-content" id="tab-wolves">
  <div class="controls">
    <input type="text" id="wolf-search" placeholder="🔍 Search by serial number..." style="min-width: 200px;">
    <label>Geographic area:
      <select id="wolf-area"><option value="">All</option></select>
    </label>
    <label>Pelt region:
      <select id="wolf-region-col"><option value="">no filter</option></select>
    </label>
    <label>Status:
      <select id="wolf-status">
        <option value="">All</option>
        <option value="unambiguous">unambiguous</option>
        <option value="asymmetric">asymmetric</option>
        <option value="partial_ambiguous">partial_ambiguous</option>
        <option value="N">N (not visible)</option>
        <option value="P">P (unclear)</option>
      </select>
    </label>
    <span id="wolf-count" style="margin-left:auto; font-size:13px; color:#6c7a89;"></span>
  </div>
  <div style="max-height: 700px; overflow: auto; border: 1px solid #e0e6ed; border-radius: 8px;">
    <div id="wolves-table"></div>
  </div>
  <div class="note">
    <strong>Tip:</strong> Hover over any cell to see the full classification details
    (raw code, status, cleaned code, asymmetric right/left).
  </div>
</div>

</div>

<script>
const DATA = __DATA_JSON__;

const $ = id => document.getElementById(id);
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  })[c]);
}
function findSummary(region) { return DATA.summary.find(s => s.region === region); }
function pct(x) { return Number(x).toFixed(1) + "%"; }

function init() {
  $("stat-wolves").textContent = DATA.n_total;
  // Always show the editing banner so users see how to refresh data
  $("data-edit-banner").style.display = "block";
  // If any wolf has an empty cell anywhere, surface it in the banner
  const emptyCells = [];
  DATA.wolves.forEach(w => {
    DATA.all_regions.forEach(r => {
      if (w[`${r}_status`] === "empty") {
        emptyCells.push(`${w.serial_number} (${r})`);
      }
    });
  });
  if (emptyCells.length > 0) {
    $("empty-warn").style.display = "inline";
    $("empty-wolf").textContent = emptyCells.join(", ");
  }
  setupTabs();
  setupRankFreqControls();
  setupCompositionControls();
  setupIdentificationControls();
  setupColorPatternControls();
  setupWolvesControls();
  renderTab("overview");
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      tab.classList.add("active");
      $(`tab-${tab.dataset.tab}`).classList.add("active");
      renderTab(tab.dataset.tab);
    });
  });
}

function renderTab(name) {
  ({
    "overview": renderOverview,
    "rank-freq": renderRankFreq,
    "composition": renderComposition,
    "identification": renderIdentification,
    "capacity": renderCapacity,
    "color-pattern": renderColorPattern,
    "wolves": renderWolvesTable,
  })[name]();
}

// ============ OVERVIEW ============
function renderOverview() {
  const sortedUnique = [...DATA.summary].sort((a,b) => b.n_unique - a.n_unique);
  const sortedUsable = [...DATA.summary].sort((a,b) => b.pct_usable - a.pct_usable);
  const best = sortedUnique[0];
  const worst = sortedUnique[sortedUnique.length-1];
  const mostVis = sortedUsable[0];
  const leastVis = sortedUsable[sortedUsable.length-1];

  $("summary-cards").innerHTML = `
    <div class="summary-card success">
      <div class="label">⭐ Most identifying</div>
      <div class="value">${best.region} <small>(n_unique=${best.n_unique})</small></div>
      <div class="sub">H=${best.shannon_entropy_bits.toFixed(2)} bits • ${pct(best.pct_usable)} usable</div>
    </div>
    <div class="summary-card bad">
      <div class="label">📉 Most uniform</div>
      <div class="value">${worst.region} <small>(n_unique=${worst.n_unique})</small></div>
      <div class="sub">H=${worst.shannon_entropy_bits.toFixed(2)} bits • ${pct(worst.pct_usable)} usable</div>
    </div>
    <div class="summary-card success">
      <div class="label">👁️ Most readable</div>
      <div class="value">${mostVis.region}</div>
      <div class="sub">${pct(mostVis.pct_usable)} usable • ${mostVis.n_N} N</div>
    </div>
    <div class="summary-card warn">
      <div class="label">🙈 Least readable</div>
      <div class="value">${leastVis.region}</div>
      <div class="sub">${pct(leastVis.pct_usable)} usable • ${leastVis.n_N} N</div>
    </div>
  `;

  let html = '<table><thead><tr>';
  ["Region","Group","n_total","n_unambiguous","n_unique","H (bits)","Gini-Simpson","Top code(s)","Top freq","%N","%P","% usable"]
    .forEach(c => html += `<th>${c}</th>`);
  html += '</tr></thead><tbody>';
  DATA.summary.forEach(row => {
    const grp = DATA.region_group[row.region];
    const grpColor = DATA.group_colors[grp];
    html += `<tr>`;
    html += `<td><strong class="group-${grp}">${row.region}</strong></td>`;
    html += `<td><span class="group-pill" style="background:${grpColor}">${grp}</span></td>`;
    html += `<td>${row.n_total}</td>`;
    html += `<td>${row.n_unambiguous}</td>`;
    html += `<td><strong>${row.n_unique}</strong></td>`;
    html += `<td>${row.shannon_entropy_bits.toFixed(3)}</td>`;
    html += `<td>${row.gini_simpson.toFixed(3)}</td>`;
    html += `<td>${escapeHtml(row.top_codes)}</td>`;
    html += `<td>${row.top_freq}</td>`;
    html += `<td>${row.pct_N.toFixed(1)}%</td>`;
    html += `<td>${row.pct_P.toFixed(1)}%</td>`;
    html += `<td><strong>${row.pct_usable.toFixed(1)}%</strong></td>`;
    html += `</tr>`;
  });
  html += '</tbody></table>';
  $("summary-table").innerHTML = html;

  const x = DATA.all_regions;
  const y = x.map(r => findSummary(r).n_unique);
  const colors = x.map(r => DATA.group_colors[DATA.region_group[r]]);
  const text = x.map(r => `H=${findSummary(r).shannon_entropy_bits.toFixed(2)}`);

  Plotly.newPlot("overview-plot", [{
    x, y, type: "bar",
    marker: { color: colors },
    text, textposition: "outside",
    hovertemplate: "<b>%{x}</b><br>n_unique=%{y}<br>%{text}<extra></extra>",
  }], {
    title: "Distinct codes per region (version C)",
    yaxis: { title: "n_unique (distinct codes)" },
    margin: { t: 50, b: 50 },
    showlegend: false,
  }, { responsive: true });
}

// ============ RANK-FREQUENCY ============
function setupRankFreqControls() {
  ["rf-layout","rf-yscale","rf-version"].forEach(id => {
    $(id).addEventListener("change", renderRankFreq);
  });
}

function renderRankFreq() {
  const layout = $("rf-layout").value;
  const yscale = $("rf-yscale").value;
  const version = $("rf-version").value;
  const container = $("rf-content");
  container.innerHTML = "";

  if (layout === "grid") {
    container.className = "grid-3x3";
    const order = ["A1","A2","B3","B4","B5","C6","C7","D8","D9"];
    order.forEach(r => {
      const div = document.createElement("div");
      div.className = "mini-plot";
      const id = `rf-mini-${r}`;
      div.id = id;
      container.appendChild(div);

      const rf = DATA.regions[r].rank_freq[version];
      const color = DATA.regions[r].color;
      const style = DATA.regions[r].style;
      const sm = findSummary(r);

      Plotly.newPlot(id, [{
        x: rf.map(d => d.rank),
        y: rf.map(d => d.count),
        type: "scatter", mode: "lines+markers",
        line: { color: color, width: 2, dash: style.dash },
        marker: { size: 6, color: color, symbol: style.symbol },
        text: rf.map(d => d.code),
        hovertemplate: "rank %{x}<br>code: <b>%{text}</b><br>count: %{y}<extra></extra>",
      }], {
        title: { text: `${r} <sub>n_unique=${sm.n_unique} • H=${sm.shannon_entropy_bits.toFixed(2)}</sub>`, font: { size: 14 } },
        margin: { t: 40, l: 40, r: 14, b: 35 },
        xaxis: { title: "rank" },
        yaxis: { title: "count", type: yscale, autorange: true },
        showlegend: false,
        height: 280,
      }, { responsive: true, displayModeBar: false });
    });
  } else {
    container.className = "";
    container.innerHTML = '<div id="rf-overlay" style="height: 600px;"></div>';
    const traces = DATA.all_regions.map(r => {
      const rf = DATA.regions[r].rank_freq[version];
      const color = DATA.regions[r].color;
      const style = DATA.regions[r].style;
      return {
        x: rf.map(d => d.rank),
        y: rf.map(d => d.count),
        type: "scatter", mode: "lines+markers",
        line: { color: color, width: 2, dash: style.dash },
        marker: { size: 7, color: color, symbol: style.symbol, line: { color: "white", width: 1 } },
        name: `${r}`,
        text: rf.map(d => d.code),
        hovertemplate: `<b>${r}</b><br>rank %{x} • code %{text} • count %{y}<extra></extra>`,
      };
    });
    Plotly.newPlot("rf-overlay", traces, {
      title: `Rank-frequency overlay — version ${version}`,
      xaxis: { title: "Code rank (most → least frequent)" },
      yaxis: { title: "Wolf count", type: yscale },
      legend: { orientation: "v", x: 1.02, y: 1, font: { size: 12 } },
      margin: { t: 50, r: 110 },
    }, { responsive: true });
  }
}

// ============ COMPOSITION ============
function setupCompositionControls() {
  ["comp-mode","comp-order"].forEach(id => {
    $(id).addEventListener("change", renderComposition);
  });
}

function renderComposition() {
  const mode = $("comp-mode").value;
  const order = $("comp-order").value;

  let regions = [...DATA.all_regions];
  if (order === "entropy") {
    regions.sort((a,b) => findSummary(b).shannon_entropy_bits - findSummary(a).shannon_entropy_bits);
  } else if (order === "usable") {
    regions.sort((a,b) => findSummary(b).pct_usable - findSummary(a).pct_usable);
  } else if (order === "unique") {
    regions.sort((a,b) => findSummary(b).n_unique - findSummary(a).n_unique);
  }

  const traces = DATA.status_order.map(status => {
    const ys = regions.map(r => {
      const cnt = DATA.regions[r].status_counts[status] || 0;
      return mode === "percent" ? (100 * cnt / DATA.n_total) : cnt;
    });
    return {
      x: regions, y: ys, name: DATA.status_labels[status], type: "bar",
      marker: { color: DATA.status_colors[status] },
      hovertemplate: `<b>${DATA.status_labels[status]}</b><br>%{x}: %{y:.1f}${mode==="percent"?"%":" wolves"}<extra></extra>`,
    };
  });

  const annotations = regions.map(r => ({
    x: r,
    y: mode === "percent" ? 102 : DATA.n_total + 2,
    text: `<b>${findSummary(r).shannon_entropy_bits.toFixed(2)}</b>`,
    showarrow: false,
    font: { size: 11, color: DATA.group_colors[DATA.region_group[r]] },
    xanchor: "center", yanchor: "bottom",
  }));

  Plotly.newPlot("comp-plot", traces, {
    barmode: "stack",
    title: `Composition per region (${mode==="percent" ? "percent" : "absolute"})`,
    xaxis: { title: "Region", tickfont: { size: 13 } },
    yaxis: {
      title: mode==="percent" ? "% of wolves" : "Wolf count",
      range: mode==="percent" ? [0,108] : [0, DATA.n_total*1.1],
    },
    legend: { orientation: "h", y: -0.18 },
    margin: { t: 60, b: 80 },
    annotations: annotations,
  }, { responsive: true });
}

// ============ IDENTIFICATION POWER ============
function setupIdentificationControls() {
  ["id-mode","id-order"].forEach(id => {
    $(id).addEventListener("change", renderIdentification);
  });
}

function renderIdentification() {
  const mode = $("id-mode").value;
  const order = $("id-order").value;

  let regions = [...DATA.all_regions];
  if (order === "unique") {
    regions.sort((a,b) => (DATA.id_buckets[b]["Unique (1)"] || 0) - (DATA.id_buckets[a]["Unique (1)"] || 0));
  } else if (order === "entropy") {
    regions.sort((a,b) => findSummary(b).shannon_entropy_bits - findSummary(a).shannon_entropy_bits);
  }

  const traces = DATA.id_bucket_order.map(bucket => {
    const ys = regions.map(r => {
      const cnt = DATA.id_buckets[r][bucket] || 0;
      return mode === "percent" ? (100 * cnt / DATA.n_total) : cnt;
    });
    const counts = regions.map(r => DATA.id_buckets[r][bucket] || 0);
    return {
      x: regions, y: ys, name: bucket, type: "bar",
      marker: { color: DATA.id_bucket_colors[bucket] },
      customdata: counts,
      hovertemplate: `<b>${bucket}</b><br>%{x}: <b>%{customdata}</b> wolves (%{y:.1f}${mode==="percent"?"%":" wolves"})<extra></extra>`,
    };
  });

  // Mark anatomical group above each bar (small coloured square)
  const annotations = regions.map(r => ({
    x: r,
    y: mode === "percent" ? 102 : DATA.n_total + 2,
    text: `<b>${r}</b>`,
    showarrow: false,
    font: { size: 11, color: DATA.group_colors[DATA.region_group[r]] },
    xanchor: "center", yanchor: "bottom",
  }));

  Plotly.newPlot("id-plot", traces, {
    barmode: "stack",
    title: `Identification power per region — wolf bucket assignment (${mode==="percent" ? "percent" : "absolute"})`,
    xaxis: { title: "Region", tickfont: { size: 13 } },
    yaxis: {
      title: mode==="percent" ? "% of wolves" : "Wolf count",
      range: mode==="percent" ? [0,108] : [0, DATA.n_total*1.1],
    },
    legend: { orientation: "v", x: 1.02, y: 1, font: { size: 11 } },
    margin: { t: 60, b: 80, r: 220 },
    annotations: annotations,
  }, { responsive: true });

  // Verification table — exact counts so the user can audit the chart
  let html = '<table><thead><tr>';
  html += '<th>Region</th>';
  DATA.id_bucket_order.forEach(b => html += `<th title="${b}" style="background:${DATA.id_bucket_colors[b]}30">${b}</th>`);
  html += '<th>SUM</th></tr></thead><tbody>';
  DATA.all_regions.forEach(r => {
    const grp = DATA.region_group[r];
    html += `<tr><td><strong class="group-${grp}">${r}</strong></td>`;
    let sum = 0;
    DATA.id_bucket_order.forEach(b => {
      const cnt = DATA.id_buckets[r][b] || 0;
      sum += cnt;
      const pct = (100 * cnt / DATA.n_total).toFixed(1);
      const cell = cnt === 0 ? "—" : `${cnt}<br><span style="color:#999;font-size:10px">${pct}%</span>`;
      html += `<td style="text-align:center;background:${DATA.id_bucket_colors[b]}15">${cell}</td>`;
    });
    html += `<td style="text-align:center;font-weight:700">${sum}</td></tr>`;
  });
  html += '</tbody></table>';
  $("id-table").innerHTML = html;
}

// ============ CAPACITY MAP ============
function renderCapacity() {
  const traces = ["A","B","C","D"].map(grp => {
    const items = DATA.summary.filter(s => DATA.region_group[s.region] === grp);
    return {
      x: items.map(s => s.pct_usable),
      y: items.map(s => s.shannon_entropy_bits),
      mode: "markers+text",
      type: "scatter",
      name: `${DATA.group_names[grp]}`,
      marker: {
        size: items.map(s => Math.sqrt(s.n_unique) * 5 + 8),
        color: DATA.group_colors[grp],
        line: { color: "white", width: 2 },
        opacity: 0.85,
      },
      text: items.map(s => s.region),
      textposition: "top center",
      textfont: { size: 13, color: "#222" },
      customdata: items.map(s => s.n_unique),
      hovertemplate: "<b>%{text}</b><br>" +
        "% usable: %{x:.1f}%<br>" +
        "H: %{y:.3f} bits<br>" +
        "n_unique: %{customdata}<extra></extra>",
    };
  });

  const shapes = [
    { type:"rect", xref:"paper", yref:"paper", x0:0.5, y0:0.5, x1:1, y1:1, fillcolor:"#43A047", opacity:0.07, line:{width:0} },
    { type:"rect", xref:"paper", yref:"paper", x0:0,   y0:0,   x1:0.5, y1:0.5, fillcolor:"#E53935", opacity:0.07, line:{width:0} },
  ];

  Plotly.newPlot("capacity-plot", traces, {
    title: "Identification Capacity Map",
    xaxis: { title: "% usable (visibility)", range: [55, 102] },
    yaxis: { title: "Shannon entropy (bits)", range: [0, 6.8] },
    shapes: shapes,
    annotations: [
      { x: 0.99, y: 0.99, xref:"paper", yref:"paper", text: "⭐ <b>IDEAL</b>",
        showarrow:false, font:{color:"#43A047", size:14}, xanchor:"right", yanchor:"top" },
      { x: 0.01, y: 0.01, xref:"paper", yref:"paper", text: "❌ useless",
        showarrow:false, font:{color:"#E53935", size:13}, xanchor:"left", yanchor:"bottom" },
    ],
    legend: { orientation: "h", y: -0.18 },
    margin: { t: 50, b: 80 },
  }, { responsive: true });
}

// ============ COLOR / PATTERN ============
function setupColorPatternControls() {
  $("cp-region").addEventListener("change", renderColorPattern);
}

function renderColorPattern() {
  const r = $("cp-region").value;
  const cp = DATA.regions[r].color_pattern;
  const grpColor = DATA.regions[r].color;

  if (!cp) {
    $("cp-plot").innerHTML = "<p>No color/pattern split available for this region.</p>";
    return;
  }

  const traces = [
    {
      x: cp.colors.map(d => d.value),
      y: cp.colors.map(d => d.count),
      name: "Colour",
      type: "bar",
      marker: { color: grpColor },
      hovertemplate: "<b>%{x}</b><br>count: %{y}<extra>colour</extra>",
      xaxis: "x",  yaxis: "y",
    },
    {
      x: cp.patterns.map(d => d.value),
      y: cp.patterns.map(d => d.count),
      name: "Pattern",
      type: "bar",
      marker: { color: "#666" },
      hovertemplate: "<b>%{x}</b><br>count: %{y}<extra>pattern</extra>",
      xaxis: "x2", yaxis: "y2",
    }
  ];

  Plotly.newPlot("cp-plot", traces, {
    grid: { rows: 1, columns: 2, pattern: "independent" },
    title: `${r} — colour and pattern split`,
    xaxis:  { title: "Colour value" },
    yaxis:  { title: "Wolf count" },
    xaxis2: { title: "Pattern value" },
    yaxis2: { title: "Wolf count" },
    showlegend: false,
    margin: { t: 50, b: 60 },
  }, { responsive: true });
}

// ============ WOLVES TABLE ============
function setupWolvesControls() {
  const areas = [...new Set(DATA.wolves.map(w => w.area).filter(a => a))].sort();
  const areaSel = $("wolf-area");
  areas.forEach(a => {
    const opt = document.createElement("option");
    opt.value = a; opt.textContent = a;
    areaSel.appendChild(opt);
  });

  const colSel = $("wolf-region-col");
  DATA.all_regions.forEach(r => {
    const opt = document.createElement("option");
    opt.value = r; opt.textContent = r;
    colSel.appendChild(opt);
  });

  ["wolf-search","wolf-area","wolf-region-col","wolf-status"].forEach(id => {
    $(id).addEventListener("input", renderWolvesTable);
    $(id).addEventListener("change", renderWolvesTable);
  });
}

function renderWolvesTable() {
  const search = $("wolf-search").value.toLowerCase().trim();
  const area = $("wolf-area").value;
  const regionCol = $("wolf-region-col").value;
  const statusFilter = $("wolf-status").value;

  let wolves = DATA.wolves;
  if (search) wolves = wolves.filter(w => w.serial_number.toLowerCase().includes(search));
  if (area) wolves = wolves.filter(w => w.area === area);
  if (regionCol && statusFilter) {
    wolves = wolves.filter(w => w[`${regionCol}_status`] === statusFilter);
  } else if (statusFilter) {
    wolves = wolves.filter(w => DATA.all_regions.some(r => w[`${r}_status`] === statusFilter));
  }

  $("wolf-count").textContent = `Showing ${wolves.length} of ${DATA.n_total} wolves`;

  let html = '<table><thead><tr>';
  html += '<th>Serial</th><th>Area</th><th>Pictures</th>';
  DATA.all_regions.forEach(r => {
    const grp = DATA.region_group[r];
    html += `<th><span class="group-pill" style="background:${DATA.group_colors[grp]}">${r}</span></th>`;
  });
  html += '</tr></thead><tbody>';

  wolves.forEach(w => {
    html += `<tr>`;
    html += `<td><strong>${escapeHtml(w.serial_number)}</strong></td>`;
    html += `<td>${escapeHtml(w.area)}</td>`;
    html += `<td>${w.pictures}</td>`;
    DATA.all_regions.forEach(r => {
      const raw = w[r];
      const status = w[`${r}_status`];
      const cleaned = w[`${r}_cleaned`];
      const label = escapeHtml(raw || "—");
      let title = `raw: ${raw || "(empty)"}\nstatus: ${status}\ncleaned: ${cleaned || "—"}`;
      if (w[`${r}_right`]) title += `\nright: ${w[`${r}_right`]}\nleft: ${w[`${r}_left`]}`;
      html += `<td title="${escapeHtml(title)}">`;
      html += `<span class="badge badge-${status}">${label}</span>`;
      html += `</td>`;
    });
    html += `</tr>`;
  });
  html += '</tbody></table>';
  $("wolves-table").innerHTML = html;
}

init();
</script>
</body>
</html>"""


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    data = build_data()
    data_json = json.dumps(data, ensure_ascii=False)
    data_json = data_json.replace("</", "<\\/")
    html = HTML_TEMPLATE.replace("__DATA_JSON__", data_json)
    html = html.replace("__N_TOTAL__", str(data["n_total"]))

    out = OUTPUT_DIR / "wolf_dashboard.html"
    out.write_text(html, encoding="utf-8")
    size_kb = len(html.encode("utf-8")) / 1024
    print(f"  wrote: {out}")
    print(f"  size : {size_kb:.1f} KB")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
