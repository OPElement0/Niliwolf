// Hand-rolled SVG charts (no external libraries). Every function returns an SVG string.
// Colors come from CSS custom properties so both themes render correctly.
window.Charts = (function () {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const fmt = (v, d = 0) => (v == null || isNaN(v) ? "–" : Number(v).toLocaleString("he-IL", { maximumFractionDigits: d }));

  function seqColor(p) {
    if (p == null) return "var(--surface-2)";
    if (p < 0.25) return "var(--seq-1)";
    if (p < 0.5) return "var(--seq-2)";
    if (p < 0.75) return "var(--seq-3)";
    if (p < 1) return "var(--seq-4)";
    return "var(--seq-5)";
  }

  // Heatmap: rows = nutrients, cols = days. cells[r][c] = {p: 0..1+ or null, tip}
  function heatmap({ rows, cols, cells }) {
    const cw = 22, ch = 22, left = 132, top = 42, gap = 2;
    const w = left + cols.length * (cw + gap) + 8;
    const h = top + rows.length * (ch + gap) + 8;
    let s = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" direction="ltr" style="direction:ltr" role="img" aria-label="מפת חום של השגת יעדים">`;
    cols.forEach((c, i) => {
      const x = w - 8 - (i + 1) * (cw + gap) + gap + cw / 2;
      if (c.label) s += `<text x="${x}" y="${top - 8}" text-anchor="middle" transform="rotate(-45 ${x} ${top - 8})">${esc(c.label)}</text>`;
    });
    rows.forEach((r, ri) => {
      const y = top + ri * (ch + gap);
      s += `<text x="${w - 8 - cols.length * (cw + gap) - 6}" y="${y + ch / 2 + 4}" text-anchor="end" class="strong">${esc(r)}</text>`;
      cols.forEach((c, ci) => {
        const x = w - 8 - (ci + 1) * (cw + gap) + gap;
        const cell = cells[ri][ci];
        const p = cell ? cell.p : null;
        s += `<rect class="cell" x="${x}" y="${y}" width="${cw}" height="${ch}" fill="${seqColor(p)}" data-tip="${esc(cell ? cell.tip : "אין נתונים")}"></rect>`;
      });
    });
    s += "</svg>";
    return s;
  }

  // Line chart with optional rolling-average series, target line, and band.
  function line({ points, avg, target, yMax, yMin, xLabels, yLabel, unit, band, height = 220 }) {
    const w = 640, h = height, left = 44, right = 12, top = 14, bottom = 34;
    const n = points.length;
    const iw = w - left - right, ih = h - top - bottom;
    const vals = points.map((p) => p.y).filter((v) => v != null).concat(avg ? avg.filter((v) => v != null) : [], target != null ? [target] : [], band ? band.flatMap((b) => [b.lo, b.hi]) : []);
    const maxV = yMax || Math.max(1, ...vals) * 1.12;
    const minV = yMin != null ? yMin : 0;
    const X = (i) => left + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
    // RTL: earliest on the right
    const Xr = (i) => left + iw - (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
    const Y = (v) => top + ih - ((v - minV) / (maxV - minV)) * ih;
    let s = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" direction="ltr" style="direction:ltr" role="img" aria-label="${esc(yLabel || "")}">`;
    // grid
    const ticks = 4;
    for (let t = 0; t <= ticks; t++) {
      const v = minV + ((maxV - minV) * t) / ticks;
      const y = Y(v);
      s += `<line class="grid" x1="${left}" x2="${w - right}" y1="${y}" y2="${y}"></line>`;
      s += `<text x="${left - 6}" y="${y + 4}" text-anchor="end">${fmt(v, v < 10 ? 1 : 0)}</text>`;
    }
    if (band && band.length) {
      const pts = band.map((b, i) => `${Xr(i)},${Y(b.hi)}`).concat(band.map((b, i) => `${Xr(i)},${Y(b.lo)}`).reverse());
      s += `<polygon class="band" points="${pts.join(" ")}"></polygon>`;
    }
    if (target != null) {
      s += `<line class="target" x1="${left}" x2="${w - right}" y1="${Y(target)}" y2="${Y(target)}"></line>`;
      s += `<text x="${w - right}" y="${Y(target) - 4}" text-anchor="end">יעד ${fmt(target)}</text>`;
    }
    // area + line
    const valid = points.map((p, i) => (p.y == null ? null : `${Xr(i)},${Y(p.y)}`));
    const segs = [];
    let cur = [];
    valid.forEach((v) => { if (v) cur.push(v); else { if (cur.length) segs.push(cur); cur = []; } });
    if (cur.length) segs.push(cur);
    segs.forEach((seg) => { s += `<polyline class="line" points="${seg.join(" ")}"></polyline>`; });
    if (avg) {
      const a = avg.map((v, i) => (v == null ? null : `${Xr(i)},${Y(v)}`)).filter(Boolean);
      if (a.length > 1) s += `<polyline class="line avg" points="${a.join(" ")}"></polyline>`;
    }
    points.forEach((p, i) => {
      if (p.y == null) return;
      s += `<circle class="dot" cx="${Xr(i)}" cy="${Y(p.y)}" r="${n > 40 ? 2.5 : 4}" data-tip="${esc((p.label || "") + ": " + fmt(p.y, 1) + (unit ? " " + unit : ""))}"></circle>`;
    });
    // x labels (sparse)
    const step = Math.max(1, Math.ceil(n / 8));
    points.forEach((p, i) => {
      if (i % step === 0 || (i === n - 1 && (n - 1) % step >= step / 2)) s += `<text x="${Xr(i)}" y="${h - 12}" text-anchor="middle">${esc(xLabels ? xLabels[i] : p.label || "")}</text>`;
    });
    s += `<line class="axis" x1="${left}" x2="${w - right}" y1="${top + ih}" y2="${top + ih}"></line>`;
    s += "</svg>";
    return s;
  }

  // Horizontal bars: items = [{label, p (0..1+), text, status}]
  function bars({ items, height }) {
    const rowH = 26, left = 110, right = 60, w = 560;
    const h = height || items.length * rowH + 10;
    const iw = w - left - right;
    let s = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" direction="ltr" style="direction:ltr" role="img" aria-label="דירוג">`;
    items.forEach((it, i) => {
      const y = 5 + i * rowH;
      const p = Math.min(1.5, it.p || 0);
      const bw = Math.max(2, p * (iw / 1.5));
      const color = it.status === "good" ? "var(--good)" : it.status === "warn" ? "var(--warn)" : it.status === "bad" ? "var(--bad)" : "var(--accent)";
      s += `<text x="${w - 4}" y="${y + 17}" text-anchor="end" class="strong">${esc(it.label)}</text>`;
      s += `<rect x="${w - right - iw}" y="${y + 6}" width="${iw}" height="14" rx="4" fill="var(--surface-2)"></rect>`;
      s += `<rect x="${w - right - bw}" y="${y + 6}" width="${bw}" height="14" rx="4" fill="${color}" data-tip="${esc(it.tip || it.text)}"></rect>`;
      const tx = w - right - iw / 1.5;
      s += `<line x1="${tx}" x2="${tx}" y1="${y + 3}" y2="${y + 23}" stroke="var(--ink-2)" stroke-dasharray="2 2"></line>`;
      s += `<text x="${left - 6}" y="${y + 17}" text-anchor="end">${esc(it.text)}</text>`;
    });
    s += "</svg>";
    return s;
  }

  // Adherence calendar: days = [{date, label, p (0..1) or null, tip}] laid out by week (7 columns, RTL)
  function calendar({ days }) {
    const cw = 30, ch = 30, gap = 4, cols = 7;
    const rows = Math.ceil((days.length + (days[0] ? days[0].dow : 0)) / cols);
    const w = cols * (cw + gap) + 30, h = rows * (ch + gap) + 24;
    const names = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
    let s = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" direction="ltr" style="direction:ltr" role="img" aria-label="לוח היענות">`;
    names.forEach((nm, i) => { s += `<text x="${w - 30 - i * (cw + gap) - cw / 2}" y="12" text-anchor="middle">${nm}</text>`; });
    days.forEach((d, i) => {
      const c = d.dow, r = Math.floor((i + days[0].dow) / cols);
      const x = w - 30 - c * (cw + gap) - cw, y = 18 + r * (ch + gap);
      const fill = d.p == null ? "var(--surface-2)" : d.p >= 1 ? "var(--good)" : d.p > 0 ? "var(--warn)" : "var(--bad-soft)";
      s += `<rect class="cell" x="${x}" y="${y}" width="${cw}" height="${ch}" fill="${fill}" data-tip="${esc(d.tip)}"></rect>`;
      s += `<text x="${x + cw / 2}" y="${y + ch / 2 + 4}" text-anchor="middle" style="fill:${d.p != null && d.p >= 1 ? "#fff" : "var(--ink-2)"}">${d.label}</text>`;
    });
    s += "</svg>";
    return s;
  }

  return { heatmap, line, bars, calendar, seqColor };
})();
