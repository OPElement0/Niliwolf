#!/usr/bin/env python3
"""Build nutrition.html (single self-contained page) from src/.

The output is written in the Artifact page format (no <html>/<head>/<body>
wrapper — the Artifact tool adds those). It contains only generic code and
reference tables: no personal data ever goes through this build.

Usage:  python build_nutrition.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / "src"
OUT = HERE / "nutrition.html"


def read(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def main() -> int:
    page = read(SRC / "page.html")
    styles = read(SRC / "styles.css")
    data = "\n".join(read(SRC / "data" / f) for f in ("foods.js", "targets.js", "rules.js"))
    charts = read(SRC / "charts.js")
    chat = read(SRC / "chat.js")
    app = read(SRC / "app.js")

    for name, chunk in (("data", data), ("charts", charts), ("chat", chat), ("app", app)):
        if "</script" in chunk.lower():
            print(f"ERROR: '</script' found inside {name} — would break the page", file=sys.stderr)
            return 1

    html = (
        page.replace("__STYLES__", styles)
        .replace("__DATA__", data)
        .replace("__CHARTS__", charts)
        .replace("__CHAT__", chat)
        .replace("__APP__", app)
    )

    # Privacy guard: the page must not reference any external host.
    ext = re.findall(r"https?://[^\s\"'<>)]+", html)
    ext = [u for u in ext if not u.startswith("https://api.github.com")]  # (none expected)
    if ext:
        print("ERROR: external URLs found in output:", *sorted(set(ext)), sep="\n  ", file=sys.stderr)
        return 1
    leftover = re.findall(r"__[A-Z]+__", html)
    if leftover:
        print("ERROR: unreplaced placeholders:", leftover, file=sys.stderr)
        return 1

    OUT.write_text(html, encoding="utf-8")
    print(f"wrote {OUT.name}: {OUT.stat().st_size / 1024:.0f} KB, {html.count(chr(10))} lines")
    return 0


if __name__ == "__main__":
    sys.exit(main())
