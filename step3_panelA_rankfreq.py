"""Panel A of Figure 1: Rank-Frequency 3x3 grid.

Each cell shows one region's rank-frequency distribution (version C: cleanest).
Cells are color-coded by anatomical group (purely visual aid; regions are
treated as analytically independent).

Two output variants are produced:
    panel_A_rank_frequency_grid_log.{png,svg,pdf}      (Y in log10)
    panel_A_rank_frequency_grid_linear.{png,svg,pdf}   (Y linear)

In addition, the original "9-line overlay" is saved as:
    graph_1_rank_frequency_log.{png,svg,pdf}
    graph_1_rank_frequency_linear.{png,svg,pdf}
"""

from __future__ import annotations

import sys

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from wolf_lib import (
    OUTPUT_DIR,
    REGIONS,
    apply_publication_style,
    load_data,
    process_all_regions,
    rank_frequency,
    region_summary,
    save_three_formats,
)

# Anatomical group colors (matching the user's schematic)
GROUP_COLORS = {
    "A": "#E91E63",   # pink / magenta — muzzle
    "B": "#42A5F5",   # blue — eye
    "C": "#FF7043",   # orange — nose / chin
    "D": "#9C27B0",   # purple — head side
}

REGION_GROUP = {
    "A1": "A", "A2": "A",
    "B3": "B", "B4": "B", "B5": "B",
    "C6": "C", "C7": "C",
    "D8": "D", "D9": "D",
}

# Layout for the 3x3 grid (row-major)
GRID_ORDER = [
    ["A1", "A2", "B3"],
    ["B4", "B5", "C6"],
    ["C7", "D8", "D9"],
]


def make_grid(proc: pd.DataFrame, summary: pd.DataFrame, log_y: bool, fname_no_ext) -> None:
    """Build a 3x3 grid of rank-frequency mini-plots."""
    fig, axes = plt.subplots(3, 3, figsize=(10, 9), sharex=False, sharey=True)
    summary_lookup = summary.set_index("region")

    # determine the global Y-max so all panels share scale
    max_count = 0
    for r in REGIONS:
        rf = rank_frequency(proc, r, "C")
        if len(rf):
            max_count = max(max_count, int(rf["count"].max()))
    y_top = max(max_count * 1.4, 50)

    # determine global X-max so all panels share scale
    max_rank = 0
    for r in REGIONS:
        rf = rank_frequency(proc, r, "C")
        if len(rf):
            max_rank = max(max_rank, len(rf))

    for i, row in enumerate(GRID_ORDER):
        for j, region in enumerate(row):
            ax = axes[i, j]
            rf = rank_frequency(proc, region, "C")
            color = GROUP_COLORS[REGION_GROUP[region]]

            if len(rf) > 0:
                ax.plot(rf["rank"], rf["count"], "o-", color=color,
                        markersize=4, linewidth=1.5)
                # baseline at y=1 for context
                ax.axhline(1, color="lightgray", linewidth=0.5, zorder=0)

            # axis cosmetics
            if log_y:
                ax.set_yscale("log")
                ax.set_ylim(0.7, y_top)
            else:
                ax.set_ylim(0, y_top)
            ax.set_xlim(0.5, max_rank + 1)
            ax.tick_params(axis="both", labelsize=9)

            # region label + stats annotation
            row_summary = summary_lookup.loc[region]
            n_unique = int(row_summary["n_unique"])
            H = row_summary["shannon_entropy_bits"]
            ax.text(0.04, 0.95, region,
                    transform=ax.transAxes, fontsize=14, fontweight="bold",
                    color=color, va="top", ha="left")
            ax.text(0.96, 0.95, f"n={n_unique}\nH={H:.2f}",
                    transform=ax.transAxes, fontsize=9,
                    va="top", ha="right",
                    bbox=dict(boxstyle="round,pad=0.25", fc="white",
                              ec="lightgray", alpha=0.85))

            # axis labels only on outer panels
            if j == 0:
                ax.set_ylabel("count" + (" (log)" if log_y else ""))
            if i == 2:
                ax.set_xlabel("rank")

            # spine cleanup
            for spine in ("top", "right"):
                ax.spines[spine].set_visible(False)

    fig.suptitle(
        "Panel A — Rank-frequency of pelt codes per body region (version C)",
        fontsize=13, y=1.0,
    )
    fig.tight_layout()
    paths = save_three_formats(fig, fname_no_ext)
    plt.close(fig)
    for p in paths:
        print(f"  wrote: {p}")


def make_overlay(proc: pd.DataFrame, log_y: bool, fname_no_ext) -> None:
    """The classic 9-line overlay on a single axis (kept as supplementary)."""
    fig, ax = plt.subplots(figsize=(8, 5))
    for region in REGIONS:
        rf = rank_frequency(proc, region, "C")
        if len(rf):
            color = GROUP_COLORS[REGION_GROUP[region]]
            ax.plot(rf["rank"], rf["count"], "o-",
                    color=color, markersize=3, linewidth=1.4,
                    label=region, alpha=0.85)
    if log_y:
        ax.set_yscale("log")
    ax.set_xlabel("Rank of code (most → least frequent)")
    ax.set_ylabel("Count of wolves" + (" (log)" if log_y else ""))
    ax.set_title("Rank-frequency distribution per body region (version C)")
    ax.legend(loc="upper right", ncol=3, fontsize=9, frameon=False)
    for spine in ("top", "right"):
        ax.spines[spine].set_visible(False)
    fig.tight_layout()
    paths = save_three_formats(fig, fname_no_ext)
    plt.close(fig)
    for p in paths:
        print(f"  wrote: {p}")


def main() -> None:
    apply_publication_style()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    df = load_data(only_with_pictures=True)
    proc = process_all_regions(df)
    summary = region_summary(proc)

    print("=== Panel A — 3x3 grid (log Y) ===")
    make_grid(proc, summary, log_y=True,
              fname_no_ext=OUTPUT_DIR / "panel_A_rank_frequency_grid_log")
    print()
    print("=== Panel A — 3x3 grid (linear Y) ===")
    make_grid(proc, summary, log_y=False,
              fname_no_ext=OUTPUT_DIR / "panel_A_rank_frequency_grid_linear")
    print()
    print("=== Supplementary: overlay (log Y) ===")
    make_overlay(proc, log_y=True,
                 fname_no_ext=OUTPUT_DIR / "graph_1_rank_frequency_log")
    print()
    print("=== Supplementary: overlay (linear Y) ===")
    make_overlay(proc, log_y=False,
                 fname_no_ext=OUTPUT_DIR / "graph_1_rank_frequency_linear")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
