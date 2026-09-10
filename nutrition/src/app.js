// Main application. No personal data lives in this file.
(function () {
  "use strict";
  // ------------------------------------------------------------ utils
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const fmt = (v, d) => {
    if (v == null || isNaN(v)) return "–";
    const n = Number(v);
    const dec = d != null ? d : (Math.abs(n) < 10 ? 1 : 0);
    return n.toLocaleString("he-IL", { maximumFractionDigits: dec, minimumFractionDigits: 0 });
  };
  const pad = (n) => String(n).padStart(2, "0");
  const dateKeyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dateKeyOf(d); };
  const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const DAYS_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  const fmtDate = (k) => { const d = parseKey(k); return `${d.getDate()}.${d.getMonth() + 1}`; };
  const fmtDateLong = (k) => { const d = parseKey(k); return `יום ${DAYS_HE[d.getDay()]}, ${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`; };
  const uid = (p) => p + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const NUT = window.NUTRIENTS;
  const NUT_BY = Object.fromEntries(NUT.map((n) => [n.key, n]));
  const NUT_KEYS = NUT.map((n) => n.key);
  const HERO = NUT.filter((n) => n.hero).map((n) => n.key);
  const UNIT_WORDS = {
    "גרם": "גרם", "גר": "גרם", "גר'": "גרם", "ג": "גרם", "ג'": "גרם", "מל": "מ\"ל", "מ\"ל": "מ\"ל", "מ״ל": "מ\"ל",
    "כוס": "כוס", "כוסות": "כוס", "כף": "כף", "כפות": "כף", "כפית": "כפית", "כפיות": "כפית",
    "פרוסה": "פרוסה", "פרוסות": "פרוסה", "יחידה": "יחידה", "יחידות": "יחידה", "יח": "יחידה", "יח'": "יחידה",
    "מנה": "מנה", "מנות": "מנה", "חופן": "חופן", "חופנים": "חופן", "קובייה": "קובייה", "קוביה": "קובייה", "קוביות": "קובייה",
    "גביע": "גביע", "גביעים": "גביע", "קופסה": "קופסה", "פיתה": "פיתה", "פיתות": "פיתה", "כדור": "כדור", "כדורים": "כדור",
    "קערה": "קערה", "צלחת": "צלחת", "שקית": "שקית", "פחית": "פחית", "בקבוק": "בקבוק", "שן": "שן", "סקופ": "סקופ",
    "משולש": "משולש", "שורה": "שורה", "קלח": "קלח", "חצי": "חצי", "אשכול": "אשכול",
  };
  const FRACTIONS = { "חצי": 0.5, "רבע": 0.25, "שליש": 0.33, "שלושת": 0.75 };

  // ------------------------------------------------------------ generic foods
  const GENERIC = window.FOODS_GENERIC.map((f) => ({
    id: "g_" + f[0], name: f[1], aliases: f[2] || [], cat: f[3],
    portions: f[4].map((p) => ({ label: p[0], g: p[1] })), per100: f[5], generic: true,
  }));
  const GENERIC_BY = Object.fromEntries(GENERIC.map((f) => [f.id, f]));

  // ------------------------------------------------------------ state
  const CACHE_KEY = "nutrition_cache_v1";
  const emptyState = () => ({ profile: {}, targets: { overrides: {} }, supplements: [], foods: [], days: {}, labs: [], diagnoses: [], chat: { turns: [] } });
  const App = window.App = {
    state: emptyState(), db: null, mode: "local", date: dateKeyOf(new Date()), tab: "today",
    fmt, esc, dateKey: () => App.date,
  };
  let unlocked = false, activityTimer = null;

  function readCache() { try { const s = localStorage.getItem(CACHE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function writeCache() { try { localStorage.setItem(CACHE_KEY, JSON.stringify(App.state)); } catch (e) {} }

  // ------------------------------------------------------------ store (db ↔ local)
  const Store = {
    async init() {
      try {
        App.db = window.claude && window.claude.use ? await window.claude.use("db") : null;
      } catch (e) { App.db = null; }
      App.mode = App.db ? "cloud" : "local";
      if (App.db) this.subscribeAll();
      setSyncPill();
    },
    subscribeAll() {
      const db = App.db;
      // Snapshot data is frozen by the platform — deep-clone so the app can edit it in place.
      const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
      const onErr = (e) => { console.warn("db", e); if (e && e.code === "revoked") { App.mode = "local"; setSyncPill(); } };
      db.collection("settings").onSnapshot((snap) => {
        snap.docs.forEach((d) => { if (d.id === "profile") App.state.profile = clone(d.data()) || {}; if (d.id === "targets") App.state.targets = clone(d.data()) || { overrides: {} }; });
        afterRemote();
      }, onErr);
      const listColl = (name, key) => db.collection(name).onSnapshot((snap) => {
        App.state[key] = snap.docs.filter((d) => d.exists).map((d) => Object.assign({ id: d.id }, clone(d.data())));
        afterRemote();
      }, onErr);
      listColl("supplements", "supplements");
      listColl("foods", "foods");
      listColl("labs", "labs");
      listColl("diagnoses", "diagnoses");
      db.collection("days").onSnapshot((snap) => {
        const days = {};
        snap.docs.forEach((d) => { if (d.exists) days[d.id] = clone(d.data()); });
        App.state.days = days;
        afterRemote();
      }, onErr);
      db.doc("chat/history").onSnapshot((d) => { App.state.chat = d.exists ? clone(d.data()) : { turns: [] }; afterRemote(); }, onErr);
    },
    async set(coll, id, data) {
      writeCache();
      if (!App.db) return;
      try { await App.db.doc(coll + "/" + id).set(data); }
      catch (e) { console.warn("set failed", e); toast("השמירה לענן נכשלה (" + (e.code || "שגיאה") + ") — הנתון נשמר במכשיר"); }
    },
    async del(coll, id) {
      writeCache();
      if (!App.db) return;
      try { await App.db.doc(coll + "/" + id).delete(); } catch (e) { console.warn("delete failed", e); }
    },
  };
  let remoteTimer = null;
  function afterRemote() { writeCache(); clearTimeout(remoteTimer); remoteTimer = setTimeout(() => render(), 60); }

  // persistence helpers (optimistic local + cloud)
  const saveProfile = () => Store.set("settings", "profile", App.state.profile);
  const saveTargets = () => Store.set("settings", "targets", App.state.targets);
  const saveDay = (k) => Store.set("days", k, App.state.days[k]);
  const saveFood = (f) => Store.set("foods", f.id, stripId(f));
  const saveSupp = (s) => Store.set("supplements", s.id, stripId(s));
  const saveLab = (l) => Store.set("labs", l.id, stripId(l));
  const saveDiag = (d) => Store.set("diagnoses", d.id, stripId(d));
  const saveChat = () => Store.set("chat", "history", App.state.chat);
  function stripId(o) { const c = Object.assign({}, o); delete c.id; return c; }

  // ------------------------------------------------------------ lock
  async function sha256(s) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  function hasPin() { return !!(App.state.profile && App.state.profile.pin_hash); }
  function showLock() {
    $("lock").hidden = false; $("app").hidden = true; unlocked = false;
    setTimeout(() => $("lock-pin").focus(), 50);
  }
  function hideLock() { $("lock").hidden = true; $("app").hidden = false; unlocked = true; touchActivity(); }
  async function tryUnlock() {
    const pin = $("lock-pin").value;
    if (!pin) return;
    const p = App.state.profile;
    const h = await sha256((p.pin_salt || "") + pin);
    if (h === p.pin_hash) {
      try { sessionStorage.setItem("nutrition_unlocked", "1"); } catch (e) {}
      $("lock-pin").value = ""; $("lock-msg").textContent = "הזיני סיסמה כדי להמשיך";
      hideLock(); render();
    } else { $("lock-msg").textContent = "סיסמה שגויה — נסי שוב"; $("lock-pin").value = ""; }
  }
  function touchActivity() {
    if (!hasPin()) return;
    clearTimeout(activityTimer);
    activityTimer = setTimeout(() => { if (hasPin()) { try { sessionStorage.removeItem("nutrition_unlocked"); } catch (e) {} showLock(); } }, 10 * 60 * 1000);
  }
  ["click", "keydown", "touchstart", "pointermove"].forEach((ev) => document.addEventListener(ev, touchActivity, { passive: true }));

  // ------------------------------------------------------------ foods & nutrients
  function allFoods() { return App.state.foods.map(normFood).concat(GENERIC); }
  function normFood(f) {
    return Object.assign({ aliases: [], portions: [{ label: "מנה", g: 100 }], per100: {} }, f, { generic: false });
  }
  function foodById(id) {
    if (!id) return null;
    if (GENERIC_BY[id]) return GENERIC_BY[id];
    const f = App.state.foods.find((x) => x.id === id);
    return f ? normFood(f) : null;
  }
  function nutrientsFor(food, grams) {
    const out = {};
    if (!food) return out;
    NUT_KEYS.forEach((k) => { const v = food.per100[k]; if (v != null) out[k] = (v * grams) / 100; });
    return out;
  }
  function gramsFor(food, qty, unit) {
    if (!food) return qty;
    if (unit === "גרם" || unit === "מ\"ל") return qty;
    const p = food.portions.find((p) => p.label === unit) || food.portions.find((p) => p.label.includes(unit) || unit.includes(p.label));
    if (p) return qty * p.g;
    return qty * (food.portions[0] ? food.portions[0].g : 100);
  }
  function unitOptions(food) {
    const list = food.portions.map((p) => p.label);
    if (!list.includes("גרם")) list.push("גרם");
    return list;
  }
  function normalizeHe(s) { return String(s || "").replace(/[֑-ׇ]/g, "").replace(/['"״׳]/g, "").trim().toLowerCase(); }
  function searchFoods(q, limit = 8) {
    const nq = normalizeHe(q);
    if (!nq) return [];
    const score = (f) => {
      const names = [f.name].concat(f.aliases || []).map(normalizeHe);
      let best = 0;
      names.forEach((n) => { if (n === nq) best = Math.max(best, 100); else if (n.startsWith(nq)) best = Math.max(best, 80); else if (n.includes(nq)) best = Math.max(best, 50); else if (nq.includes(n) && n.length > 1) best = Math.max(best, 30 + n.length); });
      return best;
    };
    const personal = App.state.foods.map(normFood).map((f) => ({ f, s: score(f) + (f.favorite ? 5 : 0) + 8 })).filter((x) => x.s > 8);
    const generic = GENERIC.map((f) => ({ f, s: score(f) })).filter((x) => x.s > 0);
    return personal.concat(generic).sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.f);
  }
  // "שקשוקה 1", "לחם 2 פרוסות", "2 פרוסות לחם מלא", "יוגורט 150 גרם"
  function parseQuick(text) {
    const tokens = text.trim().split(/\s+/).filter(Boolean);
    let qty = null, unit = null, nameTokens = [];
    const numRe = /^(\d+([.,]\d+)?|\d+\/\d+)$/;
    tokens.forEach((t) => {
      const nt = t.replace(",", ".");
      if (qty == null && numRe.test(nt)) { qty = nt.includes("/") ? Number(nt.split("/")[0]) / Number(nt.split("/")[1]) : Number(nt); return; }
      if (qty == null && FRACTIONS[t] != null) { qty = FRACTIONS[t]; return; }
      const uw = UNIT_WORDS[t.replace(/^ו/, "")];
      if (uw && !unit && uw !== "חצי") { unit = uw; return; }
      nameTokens.push(t);
    });
    let name = nameTokens.join(" ");
    let matches = searchFoods(name, 6);
    // try trimming trailing tokens if nothing matched (e.g., "לחם מלא עם" )
    while (!matches.length && nameTokens.length > 1) { nameTokens.pop(); name = nameTokens.join(" "); matches = searchFoods(name, 6); }
    return { qty: qty == null ? 1 : qty, unit, name, matches };
  }
  function addMealEntry(dateKey, food, qty, unit, time) {
    const u = unit || (food.portions[0] ? food.portions[0].label : "גרם");
    const grams = gramsFor(food, qty, u);
    const day = getDay(dateKey);
    day.meals.push({ id: uid("m"), time: time || nowTime(), food_id: food.id, name: food.name, qty, unit: u, grams: Math.round(grams), nutrients: nutrientsFor(food, grams) });
    day.meals.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    saveDay(dateKey);
  }
  function getDay(k) {
    if (!App.state.days[k]) App.state.days[k] = { meals: [], supplements_taken: [], notes: "" };
    const d = App.state.days[k];
    d.meals = d.meals || []; d.supplements_taken = d.supplements_taken || [];
    return d;
  }
  App.today = () => getDay(App.date);

  // ------------------------------------------------------------ pregnancy context, targets, rules
  function pregCtx() {
    const p = App.state.profile || {};
    const ctx = { week: null, trimester: null, weightKg: null, prepregWeightKg: p.prepreg_weight_kg || null, heightCm: p.height_cm || null, bmi: null, gainKg: null, gainRange: null, labs: {}, diagnoses: new Set(App.state.diagnoses.map((d) => d.code)), dietType: p.diet_type || "omnivore", hour: new Date().getHours() };
    if (p.due_date) {
      const due = parseKey(p.due_date), ref = parseKey(App.date);
      const daysLeft = Math.round((due - ref) / 86400000);
      ctx.week = clamp(Math.floor((280 - daysLeft) / 7), 0, 42);
      ctx.trimester = ctx.week < 14 ? 1 : ctx.week < 28 ? 2 : 3;
    }
    // latest weight up to selected date
    const wk = Object.keys(App.state.days).filter((k) => App.state.days[k].weight_kg && k <= App.date).sort();
    if (wk.length) ctx.weightKg = App.state.days[wk[wk.length - 1]].weight_kg;
    if (ctx.prepregWeightKg && ctx.heightCm) ctx.bmi = ctx.prepregWeightKg / Math.pow(ctx.heightCm / 100, 2);
    if (ctx.weightKg && ctx.prepregWeightKg) ctx.gainKg = ctx.weightKg - ctx.prepregWeightKg;
    if (ctx.bmi && ctx.week != null) {
      const cat = window.WEIGHT_GAIN_IOM.find((c) => ctx.bmi < c.bmiMax);
      const w2 = Math.max(0, ctx.week - 13);
      ctx.gainRange = { cat, expectedMin: (ctx.week <= 13 ? 0.5 * ctx.week / 13 : 0.5) + w2 * cat.weekly[0], expectedMax: (ctx.week <= 13 ? 2 * ctx.week / 13 : 2) + w2 * cat.weekly[1] };
    }
    // latest lab per marker (up to date)
    App.state.labs.filter((l) => !l.date || l.date <= App.date).sort((a, b) => (a.date || "").localeCompare(b.date || "")).forEach((l) => {
      const m = window.LAB_MARKERS.find((x) => x.key === l.marker) || { he: l.marker, unit: l.unit };
      ctx.labs[l.marker] = { value: Number(l.value), date: l.date, he: m.he, unit: l.unit || m.unit };
    });
    return ctx;
  }
  App.pregCtx = pregCtx;
  function baseTargets(ctx) {
    const ti = (ctx.trimester || 2) - 1;
    const t = {};
    Object.keys(window.TARGETS_BY_TRIMESTER).forEach((k) => { t[k] = window.TARGETS_BY_TRIMESTER[k][ti]; });
    return t;
  }
  function applyRules(ctx) {
    const t = baseTargets(ctx);
    const fired = [];
    window.RULES.forEach((r) => {
      let ok = false;
      try { ok = !!r.when(ctx); } catch (e) { ok = false; }
      if (!ok) return;
      const before = JSON.stringify(t);
      r.adjust(t, ctx);
      const changed = before !== JSON.stringify(t);
      const level = typeof r.level === "function" ? r.level(ctx) : r.level;
      const text = r.note(ctx);
      fired.push({ id: r.id, level, text, changed });
    });
    return { targets: t, fired };
  }
  function targetsFor() {
    const ctx = pregCtx();
    const { targets } = applyRules(ctx);
    const ov = (App.state.targets && App.state.targets.overrides) || {};
    Object.keys(ov).forEach((k) => { if (ov[k] != null && ov[k] !== "") targets[k] = Number(ov[k]); });
    return targets;
  }
  App.targetsFor = targetsFor;
  function rulesNotes() { return applyRules(pregCtx()).fired.filter((f) => f.text); }
  App.rulesNotes = rulesNotes;

  function suppNutrients(s) { const out = {}; Object.keys(s.nutrients || {}).forEach((k) => { if (NUT_BY[k] && s.nutrients[k] != null) out[k] = Number(s.nutrients[k]); }); return out; }
  // doses: a supplement has N units per day; each unit is ticked separately.
  function suppDoses(s) { return Math.max(1, Math.round(Number(s.doses) || 1)); }
  function suppTaken(day, s) {
    if (day.supplement_doses && day.supplement_doses[s.id] != null) return clamp(Number(day.supplement_doses[s.id]) || 0, 0, suppDoses(s));
    return (day.supplements_taken || []).includes(s.id) ? suppDoses(s) : 0;
  }
  function setSuppTaken(day, s, n) {
    day.supplement_doses = day.supplement_doses || {};
    n = clamp(n, 0, suppDoses(s));
    day.supplement_doses[s.id] = n;
    day.supplements_taken = (day.supplements_taken || []).filter((id) => id !== s.id);
    if (n >= suppDoses(s)) day.supplements_taken.push(s.id);
  }
  function suppFraction(day, s) { return suppTaken(day, s) / suppDoses(s); }
  const CHECK = `<span class="check-ico" title="הושלם"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="3"><path d="M3 8.5l3 3 7-7"/></svg></span>`;
  function doseBoxes(day, s) {
    const n = suppDoses(s), c = suppTaken(day, s);
    return `<span class="doses" role="group" aria-label="${esc(s.name)}">${Array.from({ length: n }, (_, i) => `<button class="dose ${i < c ? "on" : ""}" data-act="supp-dose" data-id="${s.id}" data-i="${i}" aria-pressed="${i < c}" title="${i + 1}/${n}"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 8.5l3 3 7-7"/></svg></button>`).join("")}</span>`;
  }
  function donut(pct, status, size) {
    size = size || 44;
    const r = (size - 6) / 2, c = 2 * Math.PI * r, p = clamp(pct || 0, 0, 1);
    const color = status === "good" ? "var(--good)" : status === "warn" ? "var(--warn)" : status === "over" ? "var(--bad)" : "var(--accent)";
    const label = Math.round((pct || 0) * 100);
    return `<svg class="donut" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" direction="ltr" aria-label="${label}%"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="5"></circle><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"></circle><text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-size="${size >= 44 ? 11 : 9}" font-weight="700" fill="var(--ink)">${label}%</text></svg>`;
  }
  function dayTotals(k, opts = {}) {
    const day = App.state.days[k] || { meals: [], supplements_taken: [] };
    const tot = {}; const fromSupp = {};
    (day.meals || []).forEach((m) => { Object.keys(m.nutrients || {}).forEach((n) => { tot[n] = (tot[n] || 0) + m.nutrients[n]; }); });
    if (opts.includeSupplements !== false) {
      App.state.supplements.forEach((s) => {
        const fr = suppFraction(day, s); if (!fr) return;
        const sn = suppNutrients(s);
        Object.keys(sn).forEach((n) => { const v = sn[n] * fr; tot[n] = (tot[n] || 0) + v; fromSupp[n] = (fromSupp[n] || 0) + v; });
      });
    }
    if (opts.split) return { tot, fromSupp };
    return tot;
  }
  App.dayTotals = dayTotals; App.suppTaken = suppTaken; App.suppDoses = suppDoses;
  function statusOf(key, v, t) {
    const meta = NUT_BY[key];
    if (meta.ul && v > meta.ul && !meta.ulSoft) return "over";
    if (meta.kind === "limit") return v > t ? "bad" : v > t * 0.8 ? "warn" : "good";
    const p = t ? v / t : 0;
    return p >= 0.95 ? "good" : p >= 0.6 ? "warn" : "bad";
  }
  function gaps(k) {
    const t = targetsFor(), { tot, fromSupp } = dayTotals(k, { split: true });
    return NUT.map((n) => {
      const v = tot[n.key] || 0, tv = t[n.key] || 0;
      return { key: n.key, he: n.he, unit: n.unit, v, t: tv, supp: fromSupp[n.key] || 0, pct: tv ? v / tv : 0, remaining: Math.max(0, tv - v), status: statusOf(n.key, v, tv), kind: n.kind, ul: n.ul };
    });
  }
  App.gaps = gaps;
  function avgPct(days, key) {
    const t = targetsFor();
    const vals = days.map((k) => { const tot = dayTotals(k); return t[key] ? (tot[key] || 0) / t[key] : null; }).filter((v) => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }
  function loggedDays(n) {
    const out = []; let k = App.date;
    for (let i = 0; i < n; i++) { if (App.state.days[k] && App.state.days[k].meals && App.state.days[k].meals.length) out.push(k); k = addDays(k, -1); }
    return out;
  }
  // which non-hero nutrients should "float" today
  function floatingGaps() {
    const g = gaps(App.date), hour = new Date().getHours();
    const isToday = App.date === dateKeyOf(new Date());
    const expected = isToday ? clamp((hour - 6) / 15, 0.15, 1) : 1;
    const last7 = loggedDays(8).filter((k) => k !== App.date);
    return g.filter((x) => !HERO.includes(x.key) && x.t > 0).map((x) => {
      const trend = last7.length >= 3 ? avgPct(last7, x.key) : null;
      let reason = null;
      if (x.status === "over") reason = "מעל הגבול העליון";
      else if (x.kind === "limit") { if (x.v > x.t) reason = "מעל המגבלה"; }
      else if (x.pct < expected * 0.6) reason = "חסר היום";
      else if (trend != null && trend < 0.7) reason = `ממוצע ${Math.round(trend * 100)}% בשבוע האחרון`;
      return Object.assign({ reason, trend }, x);
    }).filter((x) => x.reason).sort((a, b) => (a.status === "over" ? -1 : 0) - (b.status === "over" ? -1 : 0) || a.pct - b.pct);
  }
  // best foods to close a gap: [{food, portion, amount}]
  const NONVEGAN_DISHES = ["g_shakshuka", "g_omelet", "g_tuna_salad", "g_chicken_soup", "g_pizza", "g_sandwich_cheese", "g_chicken_potatoes", "g_porridge", "g_yogurt_granola", "g_pancake", "g_burekas", "g_protein_powder", "g_coffee_milk", "g_choco_milk", "g_smoothie", "g_icecream", "g_milk_choc", "g_cake", "g_cookie", "g_choc_spread", "g_mayo"];
  const MEAT_DISHES = ["g_tuna_salad", "g_chicken_soup", "g_chicken_potatoes"];
  function dietOk(f) {
    if (!f.generic) return true;
    const diet = (App.state.profile || {}).diet_type || "omnivore";
    if (diet === "vegan") return f.cat !== "meat" && f.cat !== "dairy" && !NONVEGAN_DISHES.includes(f.id);
    if (diet === "vegetarian") return f.cat !== "meat" && !MEAT_DISHES.includes(f.id);
    return true;
  }
  function closers(key, n = 3) {
    const pool = App.state.foods.map(normFood).map((f) => ({ f, bonus: f.favorite ? 1.5 : 1.2 })).concat(GENERIC.filter((f) => f.cat !== "snacks" && dietOk(f)).map((f) => ({ f, bonus: 1 })));
    return pool.map(({ f, bonus }) => { const p = f.portions[0] || { label: "100 גרם", g: 100 }; const amt = ((f.per100[key] || 0) * p.g) / 100; return { food: f, portion: p, amount: amt, score: amt * bonus }; })
      .filter((x) => x.amount > 0).sort((a, b) => b.score - a.score).slice(0, n);
  }
  function scoreOption(deltaN, g) {
    let score = 0, closes = [];
    g.forEach((x) => {
      const d = deltaN[x.key] || 0;
      if (!x.t || d <= 0) return;
      if (x.kind === "limit") { if (x.v + d > x.t) score -= ((x.v + d - x.t) / x.t) * 2; return; }
      if (x.ul && x.v + d > x.ul) { score -= 2; closes.push({ key: x.key, over: true }); return; }
      const w = HERO.includes(x.key) ? 3 : 1;
      const gain = Math.min(d, x.remaining) / x.t;
      if (gain > 0.05) closes.push({ key: x.key, gain });
      score += w * gain;
    });
    return { score, closes: closes.sort((a, b) => (b.gain || 0) - (a.gain || 0)) };
  }

  // ------------------------------------------------------------ UI helpers
  function toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }
  function openModal(html) { $("modal-root").innerHTML = `<div class="modal-bg" data-act="modal-bg"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`; }
  function closeModal() { $("modal-root").innerHTML = ""; }
  function setSyncPill() {
    const pill = $("sync-pill");
    pill.className = "pill " + (App.mode === "cloud" ? "ok" : "warn");
    $("sync-text").textContent = App.mode === "cloud" ? "מסונכרן בענן" : "מצב מקומי — רק במכשיר הזה";
  }
  function statusPill(st) { const m = { good: ["st-good", "הושג"], warn: ["st-warn", "בדרך"], bad: ["st-bad", "חסר"], over: ["st-over", "מעל הגבול"] }[st]; return `<span class="status-pill ${m[0]}">${m[1]}</span>`; }
  function barHtml(x, thin) {
    const foodPct = clamp(((x.v - x.supp) / (x.t || 1)) * 100, 0, 100), suppPct = clamp((x.supp / (x.t || 1)) * 100, 0, 100 - foodPct);
    return `<div class="bar${thin ? " thin" : ""}"><i class="food" style="width:${foodPct}%"></i><i class="supp" style="width:${suppPct}%"></i></div>`;
  }
  function foodSelectHtml(id, food, qty, unit) {
    const opts = unitOptions(food).map((u) => `<option ${u === unit ? "selected" : ""}>${esc(u)}</option>`).join("");
    return `<input class="qty num" id="${id}-qty" type="number" step="0.25" min="0" value="${qty}"> <select class="unit" id="${id}-unit">${opts}</select>`;
  }

  // ------------------------------------------------------------ rendering
  function render() {
    if (hasPin() && !unlocked) { showLock(); return; }
    renderHeader();
    const fn = { today: renderToday, log: renderLog, foods: renderFoods, supps: renderSupps, whatnext: renderWhatNext, chat: renderChat, pregnancy: renderPregnancy, history: renderHistory, settings: renderSettings }[App.tab];
    if (fn) fn();
    document.querySelectorAll("[data-panel]").forEach((p) => p.classList.toggle("active", p.dataset.panel === App.tab));
    document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === App.tab ? "true" : "false"));
  }
  App.render = render;
  function renderHeader() {
    const ctx = pregCtx();
    $("brand-week").textContent = ctx.week != null ? `· שבוע ${ctx.week}` : "";
    const g = gaps(App.date);
    const targetsMet = g.filter((x) => x.kind === "target" && x.t > 0 && x.status === "good").length;
    const targetsTotal = g.filter((x) => x.kind === "target" && x.t > 0).length;
    const heroTxt = HERO.map((k) => { const x = g.find((y) => y.key === k); return `${x.he} ${Math.round(x.pct * 100)}%`; }).join(" · ");
    const isToday = App.date === dateKeyOf(new Date());
    $("summary-line").innerHTML = `${esc(fmtDateLong(App.date))}${isToday ? "" : " <span class='status-pill st-info'>תאריך אחר</span>"} · ${heroTxt} · <span class="num">${targetsMet}/${targetsTotal}</span> יעדים הושגו`;
  }

  // ---- Today
  function renderToday() {
    const g = gaps(App.date), t = targetsFor(), ctx = pregCtx();
    const day = getDay(App.date);
    const notes = rulesNotes();
    const supps = App.state.supplements.filter((s) => s.active !== false);
    const missingSupps = supps.filter((s) => suppTaken(day, s) < suppDoses(s));
    const dosesTotal = supps.reduce((a, s) => a + suppDoses(s), 0), dosesTaken = supps.reduce((a, s) => a + suppTaken(day, s), 0);
    const floating = floatingGaps();
    const hour = new Date().getHours();
    const isToday = App.date === dateKeyOf(new Date());
    const headline = (() => {
      const heroG = HERO.map((k) => g.find((x) => x.key === k));
      const done = heroG.filter((x) => x.status === "good").map((x) => x.he);
      const todo = heroG.filter((x) => x.status !== "good");
      let s = "";
      if (!day.meals.length) s = "עדיין לא נרשם אוכל " + (isToday ? "היום" : "בתאריך הזה") + ".";
      else if (!todo.length) s = "כל שלושת היעדים המרכזיים הושגו. ";
      else s = (done.length ? `הושג: ${done.join(", ")}. ` : "") + "נשאר להשלים: " + todo.map((x) => `${x.he} ${fmt(x.remaining)} ${x.unit}`).join(", ") + ".";
      if (isToday && missingSupps.length && hour >= 12) s += ` תוספים: ${dosesTaken}/${dosesTotal} יחידות סומנו.`;
      return s;
    })();
    const heroTiles = HERO.map((k) => {
      const x = g.find((y) => y.key === k);
      const extra = k === "carbs" && t.carbsPerMeal ? `<span>עד ${t.carbsPerMeal} גרם לארוחה</span>` : k === "iron" && ctx.labs.ferritin ? `<span>פריטין ${ctx.labs.ferritin.value}</span>` : "";
      return `<div class="tile" data-act="nutrient-detail" data-key="${k}">
        <div class="name"><span>${x.status === "good" ? CHECK : ""}${x.he}</span>${statusPill(x.status)}</div>
        <div class="tile-main"><div class="big num">${fmt(x.v)}<small> / ${fmt(x.t)} ${x.unit}</small></div>${donut(x.pct, x.status, 56)}</div>
        ${barHtml(x, true)}
        <div class="sub"><span>${x.remaining > 0 ? `נשאר ${fmt(x.remaining)}` : `+${fmt(x.v - x.t)} מעל היעד`}</span>${x.supp ? `<span>מתוספים ${fmt(x.supp)}</span>` : ""}${extra}</div>
      </div>`;
    }).join("");
    const noteRows = notes.filter((n) => n.level !== "info" || n.changed).map((n) => `<div class="note ${n.level === "alert" ? "alert" : n.level === "warn" ? "warn" : "info"}">${esc(n.text)}</div>`);
    const overs = g.filter((x) => x.status === "over").map((x) => `<div class="note alert">${x.he}: ${fmt(x.v)} ${x.unit} — מעל הגבול העליון הבטוח (${fmt(x.ul)}).</div>`)
      .concat(g.filter((x) => x.ul && NUT_BY[x.key].ulSoft && x.v > x.ul).map((x) => `<div class="note info">${x.he}: ${fmt(x.v)} ${x.unit} — מעל ${fmt(x.ul)} (הגבול לאדם בריא). בטיפול בחסר ברזל לפי הנחיית רופא/ה זה מקובל; אם לא — כדאי לוודא.</div>`));
    const floatShown = floating.filter((x) => x.reason !== null).sort((a, b) => (a.reason.startsWith("ממוצע") ? 1 : 0) - (b.reason.startsWith("ממוצע") ? 1 : 0) || a.pct - b.pct).slice(0, 10);
    const floatRows = floatShown.map((x) => `<div class="nut-row" data-act="nutrient-detail" data-key="${x.key}">
        ${donut(x.pct, x.status, 40)}
        <div class="grow"><div><b>${x.he}</b> <span class="small ink2">· ${esc(x.reason)}</span></div><div class="num small ink2">${fmt(x.v)} / ${fmt(x.t)} ${x.unit}${x.remaining > 0 && x.kind !== "limit" ? ` · נשאר ${fmt(x.remaining)}` : ""}</div></div>
      </div>`);
    const doneList = g.filter((x) => x.t > 0 && !HERO.includes(x.key) && (x.kind === "limit" ? x.status === "good" && day.meals.length : x.status === "good"));
    const doneRows = doneList.length ? `<div class="chips" style="margin-top:12px">${doneList.map((x) => `<button class="chip done" data-act="nutrient-detail" data-key="${x.key}">${CHECK}${x.he} <span class="num">${Math.round(x.pct * 100)}%</span></button>`).join("")}</div>` : "";
    const suppRows = supps.map((s) => { const full = suppTaken(day, s) >= suppDoses(s); return `<div class="supp ${full ? "on" : ""}">
        ${doseBoxes(day, s)}
        <div class="grow"><div class="title">${full ? CHECK : ""}${esc(s.name)}</div><div class="meta">${esc(s.dose_label || "")}${s.times && s.times.length ? " · " + esc(s.times.join(", ")) : ""}</div></div>
      </div>`; });
    const water = g.find((x) => x.key === "water");
    const glucoseCard = App.state.profile.track_glucose ? `<div class="card"><div class="card-head"><h3>מדידות סוכר</h3><button class="btn sm" data-act="add-glucose">+ מדידה</button></div>
        ${(day.glucose || []).length ? `<div class="list">${day.glucose.map((r, i) => `<div class="item"><div class="grow"><span class="num">${r.mg_dl}</span> mg/dL <span class="meta">· ${esc(r.tag)} · ${r.time}</span></div><button class="iconbtn" data-act="del-glucose" data-i="${i}" aria-label="מחיקה">✕</button></div>`).join("")}</div>` : `<p class="help">אין מדידות ${isToday ? "היום" : "בתאריך זה"}.</p>`}</div>` : "";
    $("panel-today").innerHTML = `
      <div class="stack">
        <div class="card soft"><p><b>${esc(headline)}</b></p>${noteRows.length || overs.length ? `<div class="stack" style="gap:6px;margin-top:10px">${overs.join("")}${noteRows.join("")}</div>` : ""}</div>
        <div class="hero">${heroTiles}</div>
        <div class="grid two">
          <div class="stack">
            <div class="card">
              <div class="card-head"><h2>מה עוד חסר ${isToday ? "היום" : ""}</h2><button class="btn sm ghost" data-act="show-all-nutrients">כל הרכיבים</button></div>
              ${floating.length ? floatRows.join("") + (floating.length > floatShown.length ? `<p class="help" style="margin-top:8px"><button class="btn sm ghost" data-act="show-all-nutrients">+${floating.length - floatShown.length} רכיבים נוספים</button></p>` : "") : `<p class="help">${day.meals.length ? "כרגע אין רכיב נוסף שחסר בולט — רכיבים צפים כאן רק כשהם מפגרים אחרי היעד." : "כשתרשמי אוכל, רכיבים שחסרים יופיעו כאן. לחיצה על רכיב מראה מאיפה הוא הגיע ומה יסגור את הפער."}</p>`}
              ${doneRows}
              <div class="row" style="margin-top:12px"><button class="btn sm" data-act="quick-add" data-food="g_water">+ כוס מים</button><span class="small ink2">נוזלים: <span class="num">${fmt(water.v)}</span> / ${fmt(water.t)} מ"ל</span></div>
            </div>
            ${glucoseCard}
          </div>
          <div class="stack">
            <div class="card">
              <div class="card-head"><h2>${dosesTotal && dosesTaken >= dosesTotal ? CHECK : ""}תוספים</h2><span class="small ink2 num">${dosesTaken}/${dosesTotal} יחידות</span></div>
              ${supps.length ? suppRows.join("") : `<p class="help">עדיין לא הוגדרו תוספים. <button class="btn sm ghost" data-act="go-tab" data-tab="supps">הוסיפי בטאב תוספים</button></p>`}
              ${supps.length > 1 ? `<div class="row end" style="margin-top:8px"><button class="btn sm ghost" data-act="take-all-supps">סמני הכול</button></div>` : ""}
            </div>
            <div class="card">
              <div class="card-head"><h2>נאכל ${isToday ? "היום" : ""}</h2><button class="btn sm ghost" data-act="go-tab" data-tab="log">ליומן</button></div>
              ${day.meals.length ? `<div class="list">${day.meals.map((m) => `<div class="item"><div class="grow"><span class="title">${esc(m.name)}</span> <span class="meta">${m.qty} ${esc(m.unit)} · ${m.time}</span></div><span class="small num ink2">${fmt(m.nutrients.kcal, 0)} קק"ל</span></div>`).join("")}</div>` : `<p class="help">רשמי מה אכלת בטאב היומן, או בשורת ההזנה המהירה.</p>`}
            </div>
          </div>
        </div>
      </div>`;
  }
  function nutrientDetail(key) {
    const x = gaps(App.date).find((y) => y.key === key), day = getDay(App.date);
    const contributions = day.meals.map((m) => ({ name: m.name, v: m.nutrients[key] || 0, qty: `${m.qty} ${m.unit}` })).filter((c) => c.v > 0).sort((a, b) => b.v - a.v);
    const suppC = App.state.supplements.map((s) => ({ name: `${s.name} (${suppTaken(day, s)}/${suppDoses(s)})`, v: (suppNutrients(s)[key] || 0) * suppFraction(day, s) })).filter((c) => c.v > 0);
    openModal(`<h2>${x.status === "good" ? CHECK : ""}${x.he}</h2>
      <div class="tile-main"><div class="big num" style="font-size:1.6rem;font-weight:700">${fmt(x.v)} <small class="ink2" style="font-size:.9rem;font-weight:500">/ ${fmt(x.t)} ${x.unit}</small></div>${donut(x.pct, x.status, 64)}</div>
      ${barHtml(x, true)}<div class="legend"><span><i style="background:var(--accent)"></i>ממזון</span><span><i style="background:var(--accent-2)"></i>מתוספים</span></div>
      ${x.ul ? `<p class="help">גבול עליון בטוח: ${fmt(x.ul)} ${x.unit}</p>` : ""}
      <h3 style="margin-top:14px">מאיפה זה הגיע</h3>
      ${contributions.length || suppC.length ? `<div class="list">${contributions.map((c) => `<div class="item"><div class="grow"><span class="title">${esc(c.name)}</span> <span class="meta">${esc(c.qty)}</span></div><span class="num">${fmt(c.v)}</span></div>`).join("")}${suppC.map((c) => `<div class="item"><div class="grow"><span class="title">${esc(c.name)}</span> <span class="meta">תוסף</span></div><span class="num">${fmt(c.v)}</span></div>`).join("")}</div>` : `<p class="help">עדיין כלום.</p>`}
      ${x.remaining > 0 && x.kind !== "limit" ? `<h3 style="margin-top:14px">מה יסגור את הפער (${fmt(x.remaining)} ${x.unit})</h3><p class="help">מותאם לסוג התזונה שבפרופיל; המאכלים שלך קודם.</p><div class="chips" style="margin-top:6px">${closers(key, 6).map((c) => `<button class="chip" data-act="quick-add" data-food="${c.food.id}">${esc(c.food.name)} (${esc(c.portion.label)}) +${fmt(c.amount)}</button>`).join("")}</div>` : ""}
      <div class="actions"><button class="btn" data-act="modal-close">סגירה</button></div>`);
  }
  function allNutrientsModal() {
    const g = gaps(App.date);
    openModal(`<h2>כל הרכיבים — ${esc(fmtDate(App.date))}</h2>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>רכיב</th><th class="num">הושג</th><th class="num">יעד</th><th class="num">%</th><th></th></tr></thead><tbody>
      ${g.filter((x) => x.t > 0).map((x) => `<tr data-act="nutrient-detail" data-key="${x.key}" style="cursor:pointer"><td>${x.status === "good" ? CHECK : ""}${x.he}</td><td class="num">${fmt(x.v)}</td><td class="num">${fmt(x.t)} ${x.unit}</td><td>${donut(x.pct, x.status, 34)}</td><td>${statusPill(x.status)}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="help" style="margin-top:8px">נתרן הוא מגבלה (לא יעד): ירוק = מתחת למגבלה.</p>
      <div class="actions"><button class="btn" data-act="modal-close">סגירה</button></div>`);
  }

  // ---- Log
  let pendingFood = null; // {food, qty, unit}
  function renderLog() {
    const day = getDay(App.date);
    const isToday = App.date === dateKeyOf(new Date());
    const groups = [["בוקר", (t) => t < "11:00"], ["צהריים", (t) => t >= "11:00" && t < "16:00"], ["ערב", (t) => t >= "16:00" && t < "21:00"], ["לילה", (t) => t >= "21:00"]];
    const tot = dayTotals(App.date, { includeSupplements: false });
    const freq = {};
    Object.values(App.state.days).forEach((d) => (d.meals || []).forEach((m) => { freq[m.food_id] = (freq[m.food_id] || 0) + 1; }));
    const favIds = App.state.foods.filter((f) => f.favorite).map((f) => f.id);
    const quickIds = Array.from(new Set(favIds.concat(Object.keys(freq).sort((a, b) => freq[b] - freq[a])))).filter((id) => foodById(id)).slice(0, 10);
    const pending = pendingFood ? `<div class="card soft" style="margin-top:8px"><div class="inline-form">
        <div class="field" style="flex:2 1 160px"><label>מאכל</label><b>${esc(pendingFood.food.name)}</b></div>
        <div class="field short"><label>כמות</label>${foodSelectHtml("pend", pendingFood.food, pendingFood.qty, pendingFood.unit).split(" <select")[0]}</div>
        <div class="field short"><label>יחידה</label><select class="unit" id="pend-unit">${unitOptions(pendingFood.food).map((u) => `<option ${u === pendingFood.unit ? "selected" : ""}>${esc(u)}</option>`).join("")}</select></div>
        <div class="field short"><label>שעה</label><input id="pend-time" type="time" value="${nowTime()}" style="min-height:34px;padding:4px 8px"></div>
        <button class="btn primary" data-act="pend-add">הוסיפי</button><button class="btn ghost" data-act="pend-cancel">ביטול</button>
      </div></div>` : "";
    const mealsHtml = day.meals.length ? groups.map(([name, test]) => {
      const items = day.meals.filter((m) => test(m.time || "12:00"));
      if (!items.length) return "";
      return `<div class="meal-group"><h4>${name} · ${fmt(items.reduce((a, m) => a + (m.nutrients.kcal || 0), 0), 0)} קק"ל</h4><div class="list">${items.map((m) => `<div class="item">
          <div class="grow"><div class="title">${esc(m.name)}</div><div class="meta">${m.time} · ${m.grams} גרם · חלבון ${fmt(m.nutrients.protein)} · פחמ' ${fmt(m.nutrients.carbs)} · ברזל ${fmt(m.nutrients.iron)}</div></div>
          <input class="qty num" type="number" step="0.25" min="0" value="${m.qty}" data-act="meal-qty" data-id="${m.id}" aria-label="כמות">
          <span class="small ink2">${esc(m.unit)}</span>
          <button class="iconbtn" data-act="meal-del" data-id="${m.id}" aria-label="מחיקה">✕</button>
        </div>`).join("")}</div></div>`;
    }).join("") : `<p class="empty">עדיין לא נרשם כלום ${isToday ? "היום" : "בתאריך זה"}.</p>`;
    $("panel-log").innerHTML = `<div class="stack">
      <div class="row between">
        <div class="datenav"><button class="iconbtn" data-act="date-shift" data-n="-1" aria-label="יום קודם">‹</button><input type="date" id="log-date" value="${App.date}" data-act="date-set"><button class="iconbtn" data-act="date-shift" data-n="1" aria-label="יום הבא">›</button>${isToday ? "" : `<button class="btn sm ghost" data-act="date-today">היום</button>`}</div>
        <div class="row"><button class="btn sm" data-act="copy-yesterday">העתק מאתמול</button><button class="btn sm" data-act="parse-ai">✨ פענוח טקסט חופשי</button></div>
      </div>
      <div class="card">
        <div class="quick">
          <input id="quick-input" placeholder="הזנה מהירה: שקשוקה 1 · לחם מלא 2 פרוסות · יוגורט 150 גרם" autocomplete="off" data-act="quick-typing">
          <button class="iconbtn plus" data-act="quick-submit" aria-label="הוספה">+</button>
          <div class="suggest" id="quick-suggest" hidden></div>
        </div>
        ${pending}
        ${quickIds.length ? `<div class="chips" style="margin-top:10px">${quickIds.map((id) => `<button class="chip" data-act="quick-add" data-food="${id}">${esc(foodById(id).name)}</button>`).join("")}</div>` : `<p class="help" style="margin-top:8px">טיפ: כשיהיו לך מאכלים מועדפים ב"המאכלים שלי", הם יופיעו כאן כלחצנים.</p>`}
      </div>
      <div class="card">
        <div class="card-head"><h2>${esc(fmtDateLong(App.date))}</h2><span class="small ink2 num">${fmt(tot.kcal, 0)} קק"ל · חלבון ${fmt(tot.protein)} · פחמ' ${fmt(tot.carbs)} · שומן ${fmt(tot.fat)}</span></div>
        ${mealsHtml}
        <hr class="divider">
        <label for="day-notes">הערות ליום (איך הרגשת, בחילות, תיאבון…)</label>
        <textarea id="day-notes" data-act="day-notes" placeholder="">${esc(day.notes || "")}</textarea>
      </div>
    </div>`;
  }
  function showSuggest(list, q) {
    const box = $("quick-suggest");
    if (!box) return;
    if (!list.length) { box.hidden = true; return; }
    box.innerHTML = list.map((f) => `<button data-act="suggest-pick" data-food="${f.id}"><span>${esc(f.name)}${f.favorite ? " ★" : ""}</span><span class="cat">${f.generic ? esc(window.FOOD_CATEGORIES[f.cat] || "") : "המאכלים שלי"}</span></button>`).join("");
    box.hidden = false;
  }
  function pickFood(food, qty, unit) {
    pendingFood = { food, qty: qty || 1, unit: unit && unitOptions(food).includes(unit) ? unit : (food.portions[0] ? food.portions[0].label : "גרם") };
    renderLog();
    setTimeout(() => { const q = $("pend-qty"); if (q) { q.focus(); q.select(); } }, 30);
  }
  function parseAiModal() {
    openModal(`<h2>פענוח טקסט חופשי</h2><p class="help">כתבי בחופשיות מה אכלת. הטקסט נשלח ל-Claude רק כשלוחצים "פענחי", ומתקבלת רשימת פריטים לאישור לפני ההוספה.</p>
      <textarea id="ai-text" placeholder="לדוגמה: אכלתי שקשוקה עם 2 פרוסות לחם מלא וסלט, ואחר כך יוגורט עם גרנולה" style="margin-top:10px"></textarea>
      <div id="ai-photo-wrap" style="margin-top:8px" hidden><label class="btn sm" for="ai-photo" style="cursor:pointer">📷 צרפי תמונה של הארוחה<input id="ai-photo" type="file" accept="image/*" capture="environment" hidden></label> <span class="help" id="ai-photo-name"></span></div>
      <div id="ai-result" style="margin-top:10px"></div>
      <div class="actions"><button class="btn" data-act="modal-close">סגירה</button><button class="btn primary" data-act="ai-parse">פענחי</button></div>`);
    window.NutriChat.canSendImages().then((ok) => { const w = $("ai-photo-wrap"); if (w && ok) w.hidden = false; });
  }
  async function runAiParse() {
    const text = $("ai-text").value.trim();
    const photo = $("ai-photo") && $("ai-photo").files && $("ai-photo").files[0];
    if (!text && !photo) return;
    const out = $("ai-result"); out.innerHTML = `<p class="muted">מפענח…</p>`;
    try {
      const items = await window.NutriChat.parseMeal(App, text, photo);
      const rows = items.map((it, i) => {
        const m = searchFoods(String(it.name || ""), 1)[0];
        const unit = UNIT_WORDS[it.unit] || it.unit || "";
        return { i, name: it.name, qty: Number(it.qty) || 1, unit, food: m };
      });
      window._aiRows = rows;
      out.innerHTML = rows.length ? `<div class="list">${rows.map((r) => `<div class="item"><input type="checkbox" id="ai-ok-${r.i}" ${r.food ? "checked" : ""}><div class="grow"><div class="title">${esc(r.name)} → ${r.food ? esc(r.food.name) : "<span class='td-bad'>לא זוהה</span>"}</div><div class="meta">${r.qty} ${esc(r.unit)}${r.food ? " · " + Math.round(gramsFor(r.food, r.qty, r.unit)) + " גרם" : " · הוסיפי ידנית"}</div></div></div>`).join("")}</div><div class="actions"><button class="btn primary" data-act="ai-confirm">הוסיפי את המסומנים ליומן</button></div>` : `<p class="td-bad">לא זוהו פריטים.</p>`;
    } catch (e) { out.innerHTML = `<p class="td-bad">${esc(window.NutriChat.errorText(e))}</p>`; }
  }

  // ---- Foods
  let foodsQuery = "";
  function renderFoods() {
    const mine = App.state.foods.map(normFood).filter((f) => !foodsQuery || [f.name].concat(f.aliases).some((n) => normalizeHe(n).includes(normalizeHe(foodsQuery)))).sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || a.name.localeCompare(b.name, "he"));
    const gen = foodsQuery ? GENERIC.filter((f) => [f.name].concat(f.aliases).some((n) => normalizeHe(n).includes(normalizeHe(foodsQuery)))).slice(0, 12) : [];
    $("panel-foods").innerHTML = `<div class="stack">
      <div class="row between"><h2>המאכלים שלי <span class="small ink2">(${App.state.foods.length})</span></h2><div class="row"><button class="btn sm" data-act="food-new" data-kind="product">+ מוצר / מנה</button><button class="btn sm" data-act="food-new" data-kind="recipe">+ מתכון ממרכיבים</button></div></div>
      <input id="foods-search" placeholder="חיפוש במאכלים שלי ובמאגר הכללי…" value="${esc(foodsQuery)}" data-act="foods-search" autocomplete="off">
      <div class="card">
        ${mine.length ? `<div class="list">${mine.map((f) => `<div class="item">
          <button class="iconbtn" data-act="food-fav" data-id="${f.id}" aria-label="מועדף" title="מועדף">${f.favorite ? "★" : "☆"}</button>
          <div class="grow" data-act="food-edit" data-id="${f.id}" style="cursor:pointer"><div class="title">${esc(f.name)}</div><div class="meta">${f.kind === "recipe" ? "מתכון · " : ""}${esc(f.portions[0] ? f.portions[0].label + " = " + f.portions[0].g + " גרם" : "")} · ${fmt(((f.per100.kcal || 0) * (f.portions[0] ? f.portions[0].g : 100)) / 100, 0)} קק"ל · חלבון ${fmt(((f.per100.protein || 0) * (f.portions[0] ? f.portions[0].g : 100)) / 100)}${f.aliases.length ? " · קיצורים: " + esc(f.aliases.join(", ")) : ""}</div></div>
          <button class="btn sm" data-act="quick-add" data-food="${f.id}">אכלתי</button>
        </div>`).join("")}</div>` : `<div class="empty">עדיין אין מאכלים אישיים.<br><span class="small">הוסיפי את המנות שחוזרות על עצמן — עם קיצור דרך — וההזנה היומית תהיה עניין של שנייה.</span><div class="row" style="justify-content:center;margin-top:12px"><button class="btn sm" data-act="food-examples">טעני דוגמאות</button></div></div>`}
      </div>
      ${gen.length ? `<div class="card"><h3>מהמאגר הכללי</h3><div class="list">${gen.map((f) => `<div class="item"><div class="grow"><div class="title">${esc(f.name)}</div><div class="meta">${esc(window.FOOD_CATEGORIES[f.cat] || "")} · ${fmt(f.per100.kcal, 0)} קק"ל ל-100 גרם</div></div><button class="btn sm" data-act="food-adopt" data-id="${f.id}">הוסיפי לשלי</button><button class="btn sm ghost" data-act="quick-add" data-food="${f.id}">אכלתי</button></div>`).join("")}</div></div>` : foodsQuery ? "" : `<p class="help">חפשי למעלה כדי למצוא מזון במאגר הכללי (~150 מזונות ישראליים) ולהוסיף אותו למאכלים שלך.</p>`}
    </div>`;
  }
  const MAIN_FIELDS = ["kcal", "protein", "carbs", "fiber", "fat", "iron", "calcium", "sodium"];
  function foodModal(f, kind) {
    const isNew = !f;
    f = f ? normFood(f) : { id: uid("f"), name: "", aliases: [], kind: kind || "product", per100: {}, portions: [{ label: kind === "recipe" ? "מנה" : "מנה", g: 100 }], favorite: true, ingredients: [], servings: 1 };
    window._editFood = f;
    if (f.kind === "recipe") return recipeModal(f, isNew);
    const nutFields = (keys) => keys.map((k) => `<div class="field"><label for="ff-${k}">${NUT_BY[k].he} (${NUT_BY[k].unit})</label><input id="ff-${k}" type="number" step="any" value="${f.per100[k] != null ? f.per100[k] : ""}"></div>`).join("");
    openModal(`<h2>${isNew ? "מוצר / מנה חדשה" : "עריכת " + esc(f.name)}</h2>
      <div class="form-grid">
        <div class="field wide"><label for="ff-name">שם</label><input id="ff-name" value="${esc(f.name)}" placeholder="למשל: דייסה של הבוקר"></div>
        <div class="field wide"><label for="ff-aliases">קיצורי דרך (מופרדים בפסיק)</label><input id="ff-aliases" value="${esc(f.aliases.join(", "))}" placeholder="דייסה, קוואקר"></div>
        <div class="field"><label for="ff-plabel">שם המנה</label><input id="ff-plabel" value="${esc(f.portions[0].label)}"></div>
        <div class="field"><label for="ff-pg">משקל המנה (גרם)</label><input id="ff-pg" type="number" step="any" value="${f.portions[0].g}"></div>
        <div class="field wide"><label>ערכים ל-<b>100 גרם</b> (מהתווית)</label></div>
        ${nutFields(MAIN_FIELDS)}
        <details class="wide"><summary class="help" style="cursor:pointer">עוד רכיבים (ויטמינים ומינרלים)</summary><div class="form-grid" style="margin-top:8px">${nutFields(NUT_KEYS.filter((k) => !MAIN_FIELDS.includes(k)))}</div></details>
        <div class="field wide"><label><input type="checkbox" id="ff-fav" ${f.favorite ? "checked" : ""} style="vertical-align:middle;margin-inline-end:6px">מועדף (מופיע ראשון בהזנה ובהצעות)</label></div>
      </div>
      <div class="actions">${isNew ? "" : `<button class="btn danger" data-act="food-del" data-id="${f.id}">מחיקה</button>`}<button class="btn" data-act="modal-close">ביטול</button><button class="btn primary" data-act="food-save">שמירה</button></div>`);
  }
  function recipeModal(f, isNew) {
    const ing = f.ingredients || [];
    const totalG = ing.reduce((a, i) => a + Number(i.grams || 0), 0);
    const tot = {}; ing.forEach((i) => { const fd = foodById(i.food_id); if (!fd) return; const n = nutrientsFor(fd, Number(i.grams || 0)); Object.keys(n).forEach((k) => { tot[k] = (tot[k] || 0) + n[k]; }); });
    const servings = Number(f.servings || 1) || 1;
    const perServ = (k) => (tot[k] || 0) / servings;
    openModal(`<h2>${isNew ? "מתכון חדש" : "עריכת " + esc(f.name)}</h2>
      <div class="form-grid">
        <div class="field wide"><label for="ff-name">שם המתכון</label><input id="ff-name" value="${esc(f.name)}" placeholder="למשל: שקשוקה של שישי"></div>
        <div class="field wide"><label for="ff-aliases">קיצורי דרך (מופרדים בפסיק)</label><input id="ff-aliases" value="${esc(f.aliases.join(", "))}"></div>
        <div class="field"><label for="ff-servings">כמה מנות יוצאות</label><input id="ff-servings" type="number" step="any" min="0.25" value="${servings}" data-act="recipe-field"></div>
        <div class="field"><label>משקל מנה</label><b class="num" style="line-height:40px">${Math.round(totalG / servings)} גרם</b></div>
      </div>
      <h3 style="margin-top:12px">מרכיבים</h3>
      <div class="list">${ing.map((i, idx) => { const fd = foodById(i.food_id); return `<div class="item"><div class="grow"><span class="title">${fd ? esc(fd.name) : "?"}</span></div><input class="qty num" type="number" step="any" min="0" value="${i.grams}" data-act="ing-grams" data-i="${idx}" aria-label="גרם"><span class="small ink2">גרם</span><button class="iconbtn" data-act="ing-del" data-i="${idx}" aria-label="הסרה">✕</button></div>`; }).join("")}</div>
      <div class="quick" style="margin-top:8px"><input id="ing-search" placeholder="הוסיפי מרכיב (חיפוש במאגר ובמאכלים שלי)…" autocomplete="off" data-act="ing-typing"><div class="suggest" id="ing-suggest" hidden></div></div>
      <div class="card soft" style="margin-top:12px"><b>למנה אחת:</b> <span class="num">${fmt(perServ("kcal"), 0)} קק"ל · חלבון ${fmt(perServ("protein"))} · פחמ' ${fmt(perServ("carbs"))} · שומן ${fmt(perServ("fat"))} · ברזל ${fmt(perServ("iron"))} · סידן ${fmt(perServ("calcium"), 0)} · חומצה פולית ${fmt(perServ("folate"), 0)}</span></div>
      <div class="field" style="margin-top:8px"><label><input type="checkbox" id="ff-fav" ${f.favorite ? "checked" : ""} style="vertical-align:middle;margin-inline-end:6px">מועדף</label></div>
      <div class="actions">${isNew ? "" : `<button class="btn danger" data-act="food-del" data-id="${f.id}">מחיקה</button>`}<button class="btn" data-act="modal-close">ביטול</button><button class="btn primary" data-act="recipe-save">שמירה</button></div>`);
  }
  function collectFoodForm() {
    const f = window._editFood;
    f.name = $("ff-name").value.trim();
    f.aliases = $("ff-aliases").value.split(",").map((s) => s.trim()).filter(Boolean);
    f.favorite = $("ff-fav").checked;
    if (f.kind === "recipe") {
      f.servings = Number($("ff-servings").value) || 1;
      const totalG = f.ingredients.reduce((a, i) => a + Number(i.grams || 0), 0);
      const tot = {}; f.ingredients.forEach((i) => { const fd = foodById(i.food_id); if (!fd) return; const n = nutrientsFor(fd, Number(i.grams || 0)); Object.keys(n).forEach((k) => { tot[k] = (tot[k] || 0) + n[k]; }); });
      f.per100 = {}; if (totalG > 0) Object.keys(tot).forEach((k) => { f.per100[k] = Math.round((tot[k] / totalG) * 100 * 1000) / 1000; });
      f.portions = [{ label: "מנה", g: Math.round(totalG / f.servings) || 100 }];
    } else {
      f.per100 = {};
      NUT_KEYS.forEach((k) => { const el = $("ff-" + k); if (el && el.value !== "") f.per100[k] = Number(el.value); });
      f.portions = [{ label: $("ff-plabel").value.trim() || "מנה", g: Number($("ff-pg").value) || 100 }];
    }
    return f;
  }
  function upsertFood(f) {
    const idx = App.state.foods.findIndex((x) => x.id === f.id);
    const clean = Object.assign({}, f); delete clean.generic;
    if (idx >= 0) App.state.foods[idx] = clean; else App.state.foods.push(clean);
    saveFood(clean);
  }
  function exampleFoods() {
    const ex = [
      { name: "דייסת בוקר (דוגמה)", aliases: ["דייסה"], kind: "recipe", ingredients: [{ food_id: "g_oats", grams: 40 }, { food_id: "g_milk3", grams: 200 }, { food_id: "g_banana", grams: 60 }, { food_id: "g_chia", grams: 10 }], servings: 1, favorite: true },
      { name: "שקשוקה של הבית (דוגמה)", aliases: ["שקשוקה"], kind: "recipe", ingredients: [{ food_id: "g_egg", grams: 100 }, { food_id: "g_tomato", grams: 200 }, { food_id: "g_pepper", grams: 60 }, { food_id: "g_onion", grams: 40 }, { food_id: "g_olive_oil", grams: 10 }], servings: 1, favorite: true },
      { name: "יוגורט חלבון קנוי (דוגמה)", aliases: ["יוגורט פרו"], kind: "product", per100: { kcal: 60, protein: 10, carbs: 4, fat: 0.5, calcium: 120, sodium: 50 }, portions: [{ label: "גביע", g: 200 }], favorite: true },
    ];
    ex.forEach((e) => { const f = Object.assign({ id: uid("f"), per100: {}, portions: [] }, e); window._editFood = f; if (f.kind === "recipe") { const totalG = f.ingredients.reduce((a, i) => a + i.grams, 0); const tot = {}; f.ingredients.forEach((i) => { const n = nutrientsFor(foodById(i.food_id), i.grams); Object.keys(n).forEach((k) => { tot[k] = (tot[k] || 0) + n[k]; }); }); f.per100 = {}; Object.keys(tot).forEach((k) => { f.per100[k] = Math.round((tot[k] / totalG) * 100 * 1000) / 1000; }); f.portions = [{ label: "מנה", g: Math.round(totalG / f.servings) }]; } upsertFood(f); });
    toast("נוספו 3 מאכלים לדוגמה — אפשר לערוך או למחוק");
  }

  // ---- Supplements
  function renderSupps() {
    const day = getDay(App.date), supps = App.state.supplements;
    const streak = (() => { let n = 0, k = dateKeyOf(new Date()); const act = supps.filter((s) => s.active !== false); if (!act.length) return 0; for (let i = 0; i < 400; i++) { const d = App.state.days[k]; if (!d || !act.every((s) => suppTaken(d, s) >= suppDoses(s))) { if (i === 0) { k = addDays(k, -1); continue; } break; } n++; k = addDays(k, -1); } return n; })();
    $("panel-supps").innerHTML = `<div class="stack">
      <div class="row between"><h2>תוספים קבועים</h2><button class="btn sm primary" data-act="supp-new">+ תוסף</button></div>
      <div class="card">
        ${supps.length ? supps.map((s) => `<div class="supp ${suppTaken(day, s) >= suppDoses(s) ? "on" : ""} ${s.active === false ? "muted" : ""}">
          ${s.active === false ? "" : doseBoxes(day, s)}
          <div class="grow" data-act="supp-edit" data-id="${s.id}" style="cursor:pointer"><div class="title">${suppTaken(day, s) >= suppDoses(s) && s.active !== false ? CHECK : ""}${esc(s.name)}${s.active === false ? " (לא פעיל)" : ""}</div><div class="meta">${esc(s.dose_label || "")}${s.times && s.times.length ? " · " + esc(s.times.join(", ")) : ""}${Object.keys(suppNutrients(s)).length ? " · " + Object.entries(suppNutrients(s)).map(([k, v]) => `${NUT_BY[k].he} ${fmt(v)}`).join(", ") : ""}</div></div>
        </div>`).join("") : `<div class="empty">עדיין לא הוגדרו תוספים.<br><span class="small">לכל תוסף אפשר להזין מה הוא תורם (ברזל, חומצה פולית…) כדי שהסימון היומי ייכנס לחישוב.</span></div>`}
      </div>
      <div class="card soft"><b>רצף:</b> <span class="num">${streak}</span> ימים רצופים שכל היחידות סומנו. <span class="help">קובייה לכל יחידה (כדור/כמוסה) — הסימון הוא לתאריך ${esc(fmtDate(App.date))}. לחיצה על השם עורכת את התוסף.</span></div>
    </div>`;
  }
  function suppModal(s) {
    const isNew = !s;
    s = s || { id: uid("s"), name: "", dose_label: "", times: ["בוקר"], nutrients: {}, active: true };
    window._editSupp = s;
    const common = ["folate", "iron", "vitD", "b12", "calcium", "iodine", "omega3", "magnesium", "zinc", "choline", "vitC", "b6", "vitA"];
    openModal(`<h2>${isNew ? "תוסף חדש" : "עריכת " + esc(s.name)}</h2>
      <div class="form-grid">
        <div class="field wide"><label for="sf-name">שם</label><input id="sf-name" value="${esc(s.name)}" placeholder="למשל: פרנטל, ברזל, אומגה-3"></div>
        <div class="field"><label for="sf-doses">כמה יחידות ביום (קוביות לסימון)</label><input id="sf-doses" type="number" min="1" max="12" step="1" value="${suppDoses(s)}"></div>
        <div class="field"><label for="sf-dose">מינון (טקסט חופשי)</label><input id="sf-dose" value="${esc(s.dose_label || "")}" placeholder="כדור אחד עם האוכל"></div>
        <div class="field"><label for="sf-times">מתי (מופרד בפסיק)</label><input id="sf-times" value="${esc((s.times || []).join(", "))}" placeholder="בוקר, ערב"></div>
        <div class="field wide"><label>מה התוסף תורם <b>ביום שלם</b> (כל היחידות יחד, מהתווית) — נכנס לחישוב לפי כמה יחידות סומנו</label></div>
        ${common.map((k) => `<div class="field"><label for="sf-${k}">${NUT_BY[k].he} (${NUT_BY[k].unit})</label><input id="sf-${k}" type="number" step="any" value="${s.nutrients && s.nutrients[k] != null ? s.nutrients[k] : ""}"></div>`).join("")}
        <div class="field wide"><label><input type="checkbox" id="sf-active" ${s.active !== false ? "checked" : ""} style="vertical-align:middle;margin-inline-end:6px">פעיל (מופיע בצ'קליסט היומי)</label></div>
      </div>
      <div class="actions">${isNew ? "" : `<button class="btn danger" data-act="supp-del" data-id="${s.id}">מחיקה</button>`}<button class="btn" data-act="modal-close">ביטול</button><button class="btn primary" data-act="supp-save">שמירה</button></div>`);
  }

  // ---- What next
  let options = [null, null, null, null]; // {food, qty, unit}
  function renderWhatNext() {
    const g = gaps(App.date);
    const hasAny = options.some(Boolean);
    const results = options.map((o) => { if (!o) return null; const grams = gramsFor(o.food, o.qty, o.unit); const d = nutrientsFor(o.food, grams); return Object.assign({ grams, delta: d }, scoreOption(d, g)); });
    const best = results.reduce((b, r, i) => (r && (b < 0 || r.score > results[b].score) ? i : b), -1);
    const showKeys = HERO.concat(g.filter((x) => !HERO.includes(x.key) && x.status !== "good" && x.t > 0 && x.kind !== "limit").map((x) => x.key)).slice(0, 8);
    const cols = options.map((o, i) => `<div class="opt-card ${i === best && hasAny ? "best" : ""}">
        <div class="row between"><b>אופציה ${i + 1}</b>${o ? `<button class="iconbtn" data-act="opt-clear" data-i="${i}" aria-label="ניקוי">✕</button>` : ""}</div>
        ${o ? `<div><b>${esc(o.food.name)}</b><div class="row" style="margin-top:6px">${foodSelectHtml("opt" + i, o.food, o.qty, o.unit)}</div><div class="help">${results[i].grams} גרם</div></div>
          <div class="score num">${results[i].score > 0 ? Math.round(Math.min(1, results[i].score / 3) * 100) + "%" : "0%"}<span class="small ink2" style="font-weight:500"> מהפערים</span></div>
          <div class="small">${results[i].closes.slice(0, 4).map((c) => c.over ? `<span class="delta-over">${NUT_BY[c.key].he}: מעל הגבול</span>` : `<span class="delta-up">${NUT_BY[c.key].he} +${Math.round(c.gain * 100)}%</span>`).join(" · ") || "<span class='ink2'>תרומה קטנה לפערים</span>"}</div>
          <button class="btn sm primary" data-act="opt-eat" data-i="${i}">אכלתי → ליומן</button>`
        : `<div class="quick"><input placeholder="חפשי מאכל…" data-act="opt-typing" data-i="${i}" id="opt-in-${i}" autocomplete="off"><div class="suggest" id="opt-suggest-${i}" hidden></div></div>`}
      </div>`).join("");
    const table = hasAny ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>רכיב</th><th class="num">עכשיו</th>${options.map((o, i) => o ? `<th class="num">${i + 1}</th>` : "").join("")}<th class="num">יעד</th></tr></thead><tbody>
      ${showKeys.map((k) => { const x = g.find((y) => y.key === k); return `<tr><td>${x.he}</td><td class="num">${fmt(x.v)}</td>${results.map((r) => r ? `<td class="num ${(r.delta[k] || 0) > 0 ? (x.v + r.delta[k] >= x.t ? "td-good" : "") : "muted"}">${(r.delta[k] || 0) > 0 ? "+" + fmt(r.delta[k]) : "–"}</td>` : "").join("")}<td class="num ink2">${fmt(x.t)} ${x.unit}</td></tr>`; }).join("")}
      </tbody></table></div>` : "";
    const sugg = window._suggestions ? `<div class="card"><h3>הצעות מהמאכלים שלך</h3><div class="list">${window._suggestions.map((s) => `<div class="item"><div class="grow"><div class="title">${esc(s.food.name)} <span class="meta">${esc(s.portion.label)}</span></div><div class="meta">${s.closes.slice(0, 4).map((c) => `${NUT_BY[c.key].he} +${Math.round(c.gain * 100)}%`).join(" · ")}</div></div><button class="btn sm" data-act="opt-use" data-food="${s.food.id}">השוואה</button><button class="btn sm primary" data-act="quick-add" data-food="${s.food.id}">אכלתי</button></div>`).join("")}</div></div>` : "";
    $("panel-whatnext").innerHTML = `<div class="stack">
      <div class="row between"><h2>מה לאכול עכשיו?</h2><button class="btn sm" data-act="suggest-me">הציעי לי מהמאכלים שלי</button></div>
      <p class="help">הזיני עד 4 אופציות שאת מתלבטת ביניהן. לכל אחת תראי כמה מהפערים של היום היא סוגרת (חלבון, פחמימות וברזל שוקלים פי 3).</p>
      <div class="grid equal">${cols}</div>
      ${table ? `<div class="card">${table}</div>` : ""}
      ${sugg}
    </div>`;
  }
  function suggestMe() {
    const g = gaps(App.date);
    const pool = App.state.foods.map(normFood).length ? App.state.foods.map(normFood) : GENERIC.filter((f) => f.cat !== "snacks" && f.cat !== "drinks" && dietOk(f));
    window._suggestions = pool.map((f) => { const p = f.portions[0] || { label: "100 גרם", g: 100 }; const d = nutrientsFor(f, p.g); return Object.assign({ food: f, portion: p }, scoreOption(d, g)); }).sort((a, b) => b.score - a.score).slice(0, 5);
    renderWhatNext();
  }

  // ---- Chat
  let chatCtl = null, chatBusy = false, showCtx = false;
  function renderChat() {
    const turns = (App.state.chat && App.state.chat.turns) || [];
    $("panel-chat").innerHTML = `<div class="stack">
      <div class="row between"><h2>התייעצות</h2><div class="row"><button class="btn sm ghost" data-act="chat-ctx">${showCtx ? "הסתירי" : "מה נשלח?"}</button><button class="btn sm ghost" data-act="chat-clear">ניקוי שיחה</button></div></div>
      <p class="help">שאלי על מאכל שאת שוקלת, ואקבל יחד עם השאלה את מצב היום, הפרופיל והבדיקות — רק כשאת לוחצת "שלחי".</p>
      ${showCtx ? `<div class="card soft"><pre style="white-space:pre-wrap;font-size:.8rem;margin:0;font-family:inherit">${esc(window.NutriChat.buildContext(App))}</pre></div>` : ""}
      <div class="card chat-box">
        <div class="msgs" id="msgs">${turns.length ? turns.map((t) => `<div class="msg ${t.role === "ai" ? "ai" : "user"}">${esc(t.content)}</div>`).join("") : `<div class="empty">אפשר לשאול למשל: "האם כדאי לי סלט טונה או חביתה עכשיו?", "מה חסר לי היום ואיך משלימים?"</div>`}<div id="msg-live"></div></div>
        <div class="chips">${["מה כדאי לי לאכול עכשיו?", "מה עוד חסר לי היום ואיך משלימים?", "האם ההתקדמות שלי השבוע טובה?"].map((q) => `<button class="chip" data-act="chat-quick" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>
        <div class="chat-input"><textarea id="chat-text" placeholder="כתבי כאן…" rows="2"></textarea>${chatBusy ? `<button class="btn" data-act="chat-stop">עצרי</button>` : `<button class="btn primary" data-act="chat-send">שלחי</button>`}</div>
        <p class="help" id="chat-status"></p>
      </div>
    </div>`;
    const m = $("msgs"); if (m) m.scrollTop = m.scrollHeight;
  }
  async function chatSend(text) {
    if (!text || chatBusy) return;
    App.state.chat = App.state.chat || { turns: [] };
    App.state.chat.turns.push({ role: "user", content: text, at: Date.now() });
    chatBusy = true; renderChat();
    const live = $("msg-live"); live.innerHTML = `<div class="msg ai thinking">חושבת…</div>`;
    const bubble = live.firstChild;
    try {
      const res = await window.NutriChat.send(App, text, {
        onStart: (ctl) => { chatCtl = ctl; },
        onText: (t) => { bubble.classList.remove("thinking"); bubble.textContent = t; $("msgs").scrollTop = 1e9; },
      });
      App.state.chat.turns.push({ role: "ai", content: res.text, at: Date.now() });
    } catch (e) {
      if (e && e.text) App.state.chat.turns.push({ role: "ai", content: e.text + " …", at: Date.now() });
      const msg = window.NutriChat.errorText(e);
      if (msg) toast(msg);
    }
    App.state.chat.turns = App.state.chat.turns.slice(-30);
    chatBusy = false; chatCtl = null; saveChat(); renderChat();
  }

  // ---- Pregnancy
  function renderPregnancy() {
    const p = App.state.profile, ctx = pregCtx();
    const { targets: adj, fired } = applyRules(ctx);
    const base = baseTargets(ctx);
    const ov = (App.state.targets && App.state.targets.overrides) || {};
    const weights = Object.keys(App.state.days).filter((k) => App.state.days[k].weight_kg).sort().reverse().slice(0, 8);
    const labs = App.state.labs.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const gainTxt = ctx.gainRange ? `<div class="kv"><dt>קטגוריית BMI</dt><dd>${ctx.gainRange.cat.label} (${ctx.bmi.toFixed(1)})</dd><dt>עלייה מומלצת כוללת</dt><dd>${ctx.gainRange.cat.total[0]}–${ctx.gainRange.cat.total[1]} ק"ג</dd><dt>טווח צפוי לשבוע ${ctx.week}</dt><dd>${ctx.gainRange.expectedMin.toFixed(1)}–${ctx.gainRange.expectedMax.toFixed(1)} ק"ג</dd><dt>עלייה בפועל</dt><dd class="${ctx.gainKg == null ? "" : ctx.gainKg < ctx.gainRange.expectedMin - 1 || ctx.gainKg > ctx.gainRange.expectedMax + 1 ? "td-warn" : "td-good"}">${ctx.gainKg == null ? "אין שקילה" : ctx.gainKg.toFixed(1) + " ק\"ג"}</dd></div>` : `<p class="help">להצגת טווח העלייה במשקל יש למלא גובה, משקל לפני ההריון ותאריך לידה משוער.</p>`;
    $("panel-pregnancy").innerHTML = `<div class="stack">
      <div class="grid equal">
        <div class="card"><h2>פרופיל</h2>
          <div class="form-grid">
            <div class="field"><label for="pf-due">תאריך לידה משוער</label><input id="pf-due" type="date" value="${esc(p.due_date || "")}" data-act="profile-field" data-k="due_date"></div>
            <div class="field"><label>שבוע / טרימסטר</label><b style="line-height:40px">${ctx.week != null ? `שבוע ${ctx.week} · טרימסטר ${ctx.trimester}` : "–"}</b></div>
            <div class="field"><label for="pf-h">גובה (ס"מ)</label><input id="pf-h" type="number" step="any" value="${p.height_cm || ""}" data-act="profile-field" data-k="height_cm"></div>
            <div class="field"><label for="pf-w0">משקל לפני ההריון (ק"ג)</label><input id="pf-w0" type="number" step="any" value="${p.prepreg_weight_kg || ""}" data-act="profile-field" data-k="prepreg_weight_kg"></div>
            <div class="field"><label for="pf-diet">סוג תזונה</label><select id="pf-diet" data-act="profile-field" data-k="diet_type"><option value="omnivore" ${(p.diet_type || "omnivore") === "omnivore" ? "selected" : ""}>הכול</option><option value="vegetarian" ${p.diet_type === "vegetarian" ? "selected" : ""}>צמחונית</option><option value="vegan" ${p.diet_type === "vegan" ? "selected" : ""}>טבעונית</option></select></div>
            <div class="field"><label><input type="checkbox" id="pf-gl" ${p.track_glucose ? "checked" : ""} data-act="profile-check" data-k="track_glucose" style="vertical-align:middle;margin-inline-end:6px">מעקב מדידות סוכר</label></div>
            <div class="field wide"><label for="pf-all">אלרגיות / הגבלות / המלצות מהרופא/ה</label><textarea id="pf-all" data-act="profile-field" data-k="allergies">${esc(p.allergies || "")}</textarea></div>
          </div>
        </div>
        <div class="stack">
          <div class="card"><div class="card-head"><h2>משקל</h2></div>
            <div class="inline-form"><div class="field short"><label for="w-kg">שקילה (ק"ג) לתאריך ${esc(fmtDate(App.date))}</label><input id="w-kg" type="number" step="0.1" value="${(App.state.days[App.date] || {}).weight_kg || ""}"></div><button class="btn" data-act="weight-save">שמירה</button></div>
            <div style="margin-top:10px">${gainTxt}</div>
            ${weights.length ? `<div class="chips" style="margin-top:10px">${weights.map((k) => `<span class="chip static">${fmtDate(k)}: ${App.state.days[k].weight_kg}</span>`).join("")}</div>` : ""}
          </div>
          <div class="card"><h2>אבחנות / מצבים</h2><div class="chips" style="margin-top:6px">${window.DIAGNOSES.map((d) => { const on = App.state.diagnoses.find((x) => x.code === d.key); return `<button class="chip ${on ? "on" : ""}" data-act="diag-toggle" data-code="${d.key}">${d.he}</button>`; }).join("")}</div></div>
        </div>
      </div>
      <div class="card"><div class="card-head"><h2>בדיקות</h2></div>
        <div class="inline-form">
          <div class="field"><label for="lab-marker">בדיקה</label><select id="lab-marker">${window.LAB_MARKERS.map((m) => `<option value="${m.key}">${m.he}${m.unit ? " (" + m.unit + ")" : ""}</option>`).join("")}</select></div>
          <div class="field short"><label for="lab-value">ערך</label><input id="lab-value" type="number" step="any"></div>
          <div class="field short"><label for="lab-date">תאריך</label><input id="lab-date" type="date" value="${App.date}"></div>
          <div class="field short"><label for="lab-unit">יחידה</label><input id="lab-unit" placeholder="אוטומטי"></div>
          <button class="btn primary" data-act="lab-add">הוסיפי</button>
        </div>
        ${labs.length ? `<div class="tbl-wrap" style="margin-top:10px"><table class="tbl"><thead><tr><th>תאריך</th><th>בדיקה</th><th class="num">ערך</th><th>מצב</th><th></th></tr></thead><tbody>${labs.map((l) => { const m = window.LAB_MARKERS.find((x) => x.key === l.marker) || { he: l.marker }; const v = Number(l.value); const st = m.low != null && v < m.low ? "bad" : m.high != null && v > m.high ? "bad" : "good"; return `<tr><td>${esc(l.date || "")}</td><td>${esc(m.he)}${l.note ? " · " + esc(l.note) : ""}</td><td class="num">${fmt(v, 2)} ${esc(l.unit || m.unit || "")}</td><td class="td-${st}">${st === "good" ? "תקין" : (m.low != null && v < m.low ? "נמוך" : "גבוה")}</td><td><button class="iconbtn" data-act="lab-del" data-id="${l.id}" aria-label="מחיקה">✕</button></td></tr>`; }).join("")}</tbody></table></div>` : `<p class="help" style="margin-top:8px">הזיני תוצאות בדיקות דם — היעדים וההערות מתעדכנים אוטומטית (למשל פריטין נמוך → יעד ברזל מוגדל).</p>`}
      </div>
      <div class="card"><div class="card-head"><h2>היעדים שלך עכשיו — ולמה</h2></div>
        ${fired.length ? `<div class="stack" style="gap:6px;margin-bottom:10px">${fired.map((f) => `<div class="note ${f.level === "alert" ? "alert" : f.level === "warn" ? "warn" : "info"}">${f.text ? esc(f.text) : `<span class="ink2">חוק ${esc(f.id)}</span>`}${f.changed ? " <span class='status-pill st-info'>שינה יעד</span>" : ""}</div>`).join("")}</div>` : ""}
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>רכיב</th><th class="num">בסיס (טרימסטר ${ctx.trimester || 2})</th><th class="num">מותאם</th><th class="num">ידני (מהרופא/ה)</th></tr></thead><tbody>
        ${NUT.map((n) => `<tr><td>${n.he} <span class="muted small">${n.unit}</span></td><td class="num">${fmt(base[n.key])}</td><td class="num ${adj[n.key] !== base[n.key] ? "td-warn" : ""}">${fmt(adj[n.key])}</td><td><input class="qty num" type="number" step="any" value="${ov[n.key] != null ? ov[n.key] : ""}" data-act="override" data-k="${n.key}" placeholder="–" style="width:90px"></td></tr>`).join("")}
        </tbody></table></div>
      </div>
    </div>`;
  }

  // ---- History
  let histRange = 30, histKey = "protein", histLab = "ferritin";
  function renderHistory() {
    const todayK = dateKeyOf(new Date());
    const allKeys = Object.keys(App.state.days).filter((k) => (App.state.days[k].meals || []).length).sort();
    if (!allKeys.length) { $("panel-history").innerHTML = `<div class="empty">עדיין אין ימים עם רישום. אחרי כמה ימי מעקב תראי כאן מפת חום, מגמות וחוסרים קבועים.</div>`; return; }
    const n = histRange === 0 ? Math.max(7, Math.round((parseKey(todayK) - parseKey(allKeys[0])) / 86400000) + 1) : histRange;
    const keys = []; for (let i = n - 1; i >= 0; i--) keys.push(addDays(todayK, -i));
    const t = targetsFor();
    const totals = Object.fromEntries(keys.map((k) => [k, dayTotals(k)]));
    const logged = keys.filter((k) => (App.state.days[k] && (App.state.days[k].meals || []).length));
    const pct = (k, key) => (App.state.days[k] && (App.state.days[k].meals || []).length && t[key]) ? (totals[k][key] || 0) / t[key] : null;
    // heatmap
    const hmKeys = NUT.filter((x) => x.kind === "target" && t[x.key]).map((x) => x.key);
    const heat = window.Charts.heatmap({ rows: hmKeys.map((k) => NUT_BY[k].he), cols: keys.map((k) => ({ label: n <= 31 ? fmtDate(k) : (parseKey(k).getDay() === 0 ? fmtDate(k) : "") })), cells: hmKeys.map((key) => keys.map((k) => { const p = pct(k, key); return p == null ? null : { p, tip: `${fmtDate(k)} · ${NUT_BY[key].he}: ${fmt(totals[k][key] || 0)} / ${fmt(t[key])} (${Math.round(p * 100)}%)` }; })) });
    // trend line
    const pts = keys.map((k) => ({ label: fmtDate(k), y: (App.state.days[k] && (App.state.days[k].meals || []).length) ? (totals[k][histKey] || 0) : null }));
    const avg = pts.map((p, i) => { const win = pts.slice(Math.max(0, i - 6), i + 1).map((q) => q.y).filter((v) => v != null); return win.length >= 3 ? win.reduce((a, b) => a + b, 0) / win.length : null; });
    const lineSvg = window.Charts.line({ points: pts, avg, target: t[histKey], unit: NUT_BY[histKey].unit, yLabel: NUT_BY[histKey].he });
    // deficits ranking
    const rank = NUT.filter((x) => x.kind === "target" && t[x.key]).map((x) => { const vals = logged.map((k) => pct(k, x.key)).filter((v) => v != null); const a = vals.length ? vals.reduce((p, c) => p + c, 0) / vals.length : 0; return { key: x.key, label: x.he, p: a, text: Math.round(a * 100) + "%", status: a >= 0.95 ? "good" : a >= 0.6 ? "warn" : "bad", tip: `${x.he}: ממוצע ${Math.round(a * 100)}% מהיעד ב-${vals.length} ימים` }; }).sort((a, b) => a.p - b.p);
    const barsSvg = window.Charts.bars({ items: rank });
    // adherence calendar (last 28 days)
    const act = App.state.supplements.filter((s) => s.active !== false);
    const calKeys = []; for (let i = 27; i >= 0; i--) calKeys.push(addDays(todayK, -i));
    const calDays = calKeys.map((k) => { const d = App.state.days[k]; const units = act.reduce((a, s) => a + suppDoses(s), 0); const taken = d ? act.reduce((a, s) => a + suppTaken(d, s), 0) : 0; const p = units ? (d ? taken / units : null) : null; return { dow: parseKey(k).getDay(), label: parseKey(k).getDate(), p, tip: `${fmtDate(k)}: ${taken}/${units} יחידות` }; });
    const calSvg = act.length ? window.Charts.calendar({ days: calDays }) : `<p class="help">אין תוספים פעילים.</p>`;
    // weight
    const wKeys = Object.keys(App.state.days).filter((k) => App.state.days[k].weight_kg).sort();
    const ctx = pregCtx();
    let weightSvg = "";
    if (wKeys.length) {
      const wp = wKeys.map((k) => ({ label: fmtDate(k), y: App.state.days[k].weight_kg }));
      let band = null;
      if (ctx.gainRange && App.state.profile.due_date && App.state.profile.prepreg_weight_kg) {
        const due = parseKey(App.state.profile.due_date);
        band = wKeys.map((k) => { const wk = clamp(Math.floor((280 - Math.round((due - parseKey(k)) / 86400000)) / 7), 0, 42); const w2 = Math.max(0, wk - 13); const c = ctx.gainRange.cat; const base = App.state.profile.prepreg_weight_kg; return { lo: base + (wk <= 13 ? 0.5 * wk / 13 : 0.5) + w2 * c.weekly[0], hi: base + (wk <= 13 ? 2 * wk / 13 : 2) + w2 * c.weekly[1] }; });
      }
      const ys = wp.map((p) => p.y).concat(band ? band.flatMap((b) => [b.lo, b.hi]) : []);
      weightSvg = window.Charts.line({ points: wp, band, unit: "ק\"ג", yMax: Math.max(...ys) + 2, yMin: Math.max(0, Math.min(...ys) - 3), yLabel: "משקל", height: 200 });
    }
    // labs
    const labMarkers = Array.from(new Set(App.state.labs.map((l) => l.marker)));
    let labSvg = "";
    if (labMarkers.length) {
      if (!labMarkers.includes(histLab)) histLab = labMarkers[0];
      const m = window.LAB_MARKERS.find((x) => x.key === histLab) || { he: histLab };
      const ls = App.state.labs.filter((l) => l.marker === histLab).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      const lp = ls.map((l) => ({ label: l.date ? fmtDate(l.date) : "", y: Number(l.value) }));
      const band = m.low != null && m.high != null ? lp.map(() => ({ lo: m.low, hi: m.high })) : null;
      labSvg = window.Charts.line({ points: lp, target: band ? null : (m.low != null ? m.low : m.high), band, unit: m.unit, yLabel: m.he, height: 180 });
    }
    // summary tiles
    const avgOf = (key) => { const vals = logged.map((k) => totals[k][key] || 0); return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0; };
    const suppDays = calKeys.filter((k) => { const d = App.state.days[k]; return d && act.length && act.every((s) => suppTaken(d, s) >= suppDoses(s)); }).length;
    $("panel-history").innerHTML = `<div class="stack">
      <div class="row between"><h2>מעקב לאורך זמן</h2><div class="seg">${[[7, "7 ימים"], [30, "30 ימים"], [90, "90 ימים"], [0, "הכול"]].map(([v, l]) => `<button class="${histRange === v ? "on" : ""}" data-act="hist-range" data-v="${v}">${l}</button>`).join("")}</div></div>
      <div class="hero">
        <div class="tile"><div class="name">ימים עם רישום</div><div class="big num">${logged.length}<small> / ${n}</small></div></div>
        <div class="tile"><div class="name">ממוצע יומי</div><div class="big num">${fmt(avgOf("kcal"), 0)}<small> קק"ל</small></div><div class="sub"><span>חלבון ${fmt(avgOf("protein"))} · פחמ' ${fmt(avgOf("carbs"))} · ברזל ${fmt(avgOf("iron"))}</span></div></div>
        <div class="tile"><div class="name">תוספים — 28 יום</div><div class="big num">${act.length ? Math.round((suppDays / 28) * 100) + "%" : "–"}</div><div class="sub"><span>ימים שבהם כל התוספים סומנו</span></div></div>
      </div>
      <div class="card"><div class="card-head"><h3>מפת חום — % מהיעד לכל רכיב ויום</h3></div><div class="chart">${heat}</div><div class="legend"><span><i style="background:var(--seq-1)"></i>0–25%</span><span><i style="background:var(--seq-2)"></i>25–50%</span><span><i style="background:var(--seq-3)"></i>50–75%</span><span><i style="background:var(--seq-4)"></i>75–100%</span><span><i style="background:var(--seq-5)"></i>100%+</span><span><i style="background:var(--surface-2)"></i>אין רישום</span></div></div>
      <div class="grid equal">
        <div class="card"><div class="card-head"><h3>מגמה</h3><select id="hist-key" data-act="hist-key" style="width:auto;min-height:34px;padding:4px 8px">${NUT.filter((x) => t[x.key]).map((x) => `<option value="${x.key}" ${x.key === histKey ? "selected" : ""}>${x.he}</option>`).join("")}</select></div><div class="chart">${lineSvg}</div><div class="legend"><span><i style="background:var(--accent)"></i>יומי</span><span><i style="background:var(--accent-2)"></i>ממוצע נע 7 ימים</span><span>- - יעד</span></div></div>
        <div class="card"><div class="card-head"><h3>החוסרים הקבועים שלי</h3><span class="help">ממוצע % מהיעד בימים עם רישום</span></div><div class="chart">${barsSvg}</div></div>
      </div>
      <div class="grid equal">
        <div class="card"><div class="card-head"><h3>היענות לתוספים — 4 שבועות</h3></div><div class="chart">${calSvg}</div><div class="legend"><span><i style="background:var(--good)"></i>הכול</span><span><i style="background:var(--warn)"></i>חלקי</span><span><i style="background:var(--bad-soft)"></i>כלום</span></div></div>
        <div class="card"><div class="card-head"><h3>משקל מול הטווח המומלץ</h3></div>${weightSvg ? `<div class="chart">${weightSvg}</div><div class="legend"><span><i style="background:var(--accent-2-soft)"></i>טווח IOM לשבוע</span><span><i style="background:var(--accent)"></i>שקילות</span></div>` : `<p class="help">אין שקילות עדיין — הזיני בטאב נתוני הריון.</p>`}</div>
      </div>
      ${labMarkers.length ? `<div class="card"><div class="card-head"><h3>בדיקות לאורך זמן</h3><select id="hist-lab" data-act="hist-lab" style="width:auto;min-height:34px;padding:4px 8px">${labMarkers.map((k) => `<option value="${k}" ${k === histLab ? "selected" : ""}>${(window.LAB_MARKERS.find((x) => x.key === k) || { he: k }).he}</option>`).join("")}</select></div><div class="chart">${labSvg}</div><div class="legend"><span><i style="background:var(--accent-2-soft)"></i>טווח תקין</span></div></div>` : ""}
    </div>`;
  }

  // ---- Settings
  function renderSettings() {
    const counts = { days: Object.keys(App.state.days).length, foods: App.state.foods.length, supps: App.state.supplements.length, labs: App.state.labs.length };
    $("panel-settings").innerHTML = `<div class="stack">
      <div class="card"><h2>סיסמה</h2>
        <p class="help">${hasPin() ? "מוגדרת סיסמה. הדף ננעל אחרי 10 דקות ללא פעילות." : "לא מוגדרת סיסמה. מומלץ להגדיר — שכבת הגנה נוספת על ההתחברות ל-claude.ai."}</p>
        <div class="inline-form" style="margin-top:8px"><div class="field short"><label for="pin-new">סיסמה חדשה</label><input id="pin-new" type="password" inputmode="numeric" autocomplete="new-password"></div><div class="field short"><label for="pin-new2">שוב</label><input id="pin-new2" type="password" inputmode="numeric" autocomplete="new-password"></div><button class="btn primary" data-act="pin-set">${hasPin() ? "החלפה" : "הגדרה"}</button>${hasPin() ? `<button class="btn" data-act="pin-remove">הסרה</button>` : ""}</div>
      </div>
      <div class="card"><h2>גיבוי</h2>
        <p class="help">ייצוא של כל הנתונים לקובץ JSON (${counts.days} ימים, ${counts.foods} מאכלים, ${counts.supps} תוספים, ${counts.labs} בדיקות). הקובץ אינו מוצפן — שמרי אותו במקום פרטי.</p>
        <div class="row" style="margin-top:8px"><button class="btn" data-act="export">ייצוא לקובץ</button><label class="btn" for="import-file" style="cursor:pointer">ייבוא מקובץ<input id="import-file" type="file" accept="application/json,.json" hidden data-act="import-file"></label></div>
      </div>
      <div class="card"><h2>אחסון</h2>
        <p>${App.mode === "cloud" ? "הנתונים נשמרים במסד הנתונים הפרטי של הדף (רק את יכולה לפתוח אותו) ומסונכרנים בין המכשירים שלך." : "הדף רץ במצב מקומי: הנתונים נשמרים רק בדפדפן הזה. כדי לסנכרן בין מכשירים, פתחי את הדף מתוך claude.ai."}</p>
        <div class="row" style="margin-top:10px"><button class="btn danger" data-act="wipe">מחיקת כל הנתונים</button></div>
      </div>
      <div class="card soft small ink2">
        <p>ערכי המזון במאגר הכללי הם משוערים (USDA / משרד הבריאות). מאכלים אישיים עם תווית מדויקת נותנים תוצאה מדויקת יותר.</p>
        <p style="margin-top:6px">היעדים: DRI להריון (NIH/IOM), מותאמים לפי שבוע, משקל, בדיקות ואבחנות. הכלי אינו תחליף לייעוץ רפואי.</p>
      </div>
    </div>`;
  }
  async function exportData() {
    const json = JSON.stringify(App.state, null, 1);
    const name = `nutrition-backup-${dateKeyOf(new Date())}.json`;
    try {
      const dl = window.claude && window.claude.use ? await window.claude.use("downloads") : null;
      if (dl) { await dl.save({ filename: name, data: json }); toast("הקובץ נשמר"); return; }
    } catch (e) { if (e && e.code === "declined") return; }
    try { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([json], { type: "application/json" })); a.download = name; a.click(); } catch (e) {}
    openModal(`<h2>גיבוי</h2><p class="help">אם ההורדה לא נפתחה, העתיקי את הטקסט ושמרי אותו בקובץ.</p><textarea style="min-height:200px;font-size:.75rem;direction:ltr">${esc(json)}</textarea><div class="actions"><button class="btn" data-act="modal-close">סגירה</button></div>`);
  }
  async function importData(file) {
    try {
      const txt = await file.text(); const data = JSON.parse(txt);
      if (!data || typeof data !== "object" || !("days" in data)) throw new Error("bad");
      if (!confirm("לייבא את הקובץ? הנתונים הקיימים יוחלפו.")) return;
      App.state = Object.assign(emptyState(), data);
      await pushAll();
      toast("הייבוא הושלם"); render();
    } catch (e) { toast("הקובץ לא תקין"); }
  }
  async function pushAll() {
    writeCache();
    if (!App.db) return;
    await saveProfile(); await saveTargets(); await saveChat();
    for (const f of App.state.foods) await saveFood(f);
    for (const s of App.state.supplements) await saveSupp(s);
    for (const l of App.state.labs) await saveLab(l);
    for (const d of App.state.diagnoses) await saveDiag(d);
    for (const k of Object.keys(App.state.days)) await saveDay(k);
  }
  async function wipeAll() {
    if (!confirm("למחוק את כל הנתונים? הפעולה אינה הפיכה.")) return;
    if (!confirm("בטוחה? מומלץ לייצא גיבוי קודם.")) return;
    if (App.db) {
      const dels = [];
      App.state.foods.forEach((f) => dels.push(Store.del("foods", f.id)));
      App.state.supplements.forEach((s) => dels.push(Store.del("supplements", s.id)));
      App.state.labs.forEach((l) => dels.push(Store.del("labs", l.id)));
      App.state.diagnoses.forEach((d) => dels.push(Store.del("diagnoses", d.id)));
      Object.keys(App.state.days).forEach((k) => dels.push(Store.del("days", k)));
      dels.push(Store.del("settings", "profile"), Store.del("settings", "targets"), Store.del("chat", "history"));
      await Promise.all(dels);
    }
    App.state = emptyState(); try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
    unlocked = true; render(); toast("הכול נמחק");
  }

  // ------------------------------------------------------------ actions (event delegation)
  const actions = {
    "go-tab": (el) => { App.tab = el.dataset.tab; render(); },
    "modal-close": () => closeModal(),
    "modal-bg": (el, e) => { if (e.target === el) closeModal(); },
    "nutrient-detail": (el) => nutrientDetail(el.dataset.key),
    "show-all-nutrients": () => allNutrientsModal(),
    "supp-dose": (el) => { const day = getDay(App.date); const s = App.state.supplements.find((x) => x.id === el.dataset.id); if (!s) return; const i = Number(el.dataset.i), c = suppTaken(day, s); setSuppTaken(day, s, i < c ? i : i + 1); saveDay(App.date); render(); },
    "take-all-supps": () => { const day = getDay(App.date); App.state.supplements.filter((s) => s.active !== false).forEach((s) => setSuppTaken(day, s, suppDoses(s))); saveDay(App.date); render(); },
    "quick-add": (el) => { const f = foodById(el.dataset.food); if (!f) return; closeModal(); if (App.tab !== "log") { addMealEntry(App.date, f, 1, f.portions[0] ? f.portions[0].label : "גרם"); toast(`נוסף: ${f.name} (${f.portions[0] ? f.portions[0].label : "100 גרם"})`); render(); } else pickFood(f, 1); },
    "add-glucose": () => openModal(`<h2>מדידת סוכר</h2><div class="form-grid"><div class="field"><label for="gl-v">mg/dL</label><input id="gl-v" type="number" inputmode="numeric"></div><div class="field"><label for="gl-tag">מתי</label><select id="gl-tag"><option>בצום</option><option>שעה אחרי ארוחה</option><option>שעתיים אחרי ארוחה</option><option>לפני שינה</option><option>אחר</option></select></div><div class="field"><label for="gl-t">שעה</label><input id="gl-t" type="time" value="${nowTime()}"></div></div><div class="actions"><button class="btn" data-act="modal-close">ביטול</button><button class="btn primary" data-act="glucose-save">שמירה</button></div>`),
    "glucose-save": () => { const v = Number($("gl-v").value); if (!v) return; const day = getDay(App.date); day.glucose = day.glucose || []; day.glucose.push({ mg_dl: v, tag: $("gl-tag").value, time: $("gl-t").value }); saveDay(App.date); closeModal(); render(); },
    "del-glucose": (el) => { const day = getDay(App.date); day.glucose.splice(Number(el.dataset.i), 1); saveDay(App.date); render(); },
    // log
    "date-shift": (el) => { App.date = addDays(App.date, Number(el.dataset.n)); pendingFood = null; render(); },
    "date-today": () => { App.date = dateKeyOf(new Date()); pendingFood = null; render(); },
    "quick-submit": () => quickSubmit(),
    "suggest-pick": (el) => { const f = foodById(el.dataset.food); const parsed = parseQuick(($("quick-input") || { value: "" }).value); pickFood(f, parsed.qty, parsed.unit); },
    "pend-add": () => { if (!pendingFood) return; const qty = Number($("pend-qty").value) || 1, unit = $("pend-unit").value, time = $("pend-time").value; addMealEntry(App.date, pendingFood.food, qty, unit, time); toast(`נוסף: ${pendingFood.food.name}`); pendingFood = null; render(); setTimeout(() => { const q = $("quick-input"); if (q) q.focus(); }, 30); },
    "pend-cancel": () => { pendingFood = null; renderLog(); },
    "meal-del": (el) => { const day = getDay(App.date); day.meals = day.meals.filter((m) => m.id !== el.dataset.id); saveDay(App.date); render(); },
    "copy-yesterday": () => { const y = App.state.days[addDays(App.date, -1)]; if (!y || !(y.meals || []).length) { toast("אין רישום אתמול"); return; } const day = getDay(App.date); y.meals.forEach((m) => day.meals.push(Object.assign({}, m, { id: uid("m") }))); day.meals.sort((a, b) => (a.time || "").localeCompare(b.time || "")); saveDay(App.date); render(); toast("הועתק מאתמול"); },
    "parse-ai": () => parseAiModal(),
    "ai-parse": () => runAiParse(),
    "ai-confirm": () => { (window._aiRows || []).forEach((r) => { const cb = $("ai-ok-" + r.i); if (cb && cb.checked && r.food) addMealEntry(App.date, r.food, r.qty, unitOptions(r.food).includes(r.unit) ? r.unit : null); }); closeModal(); render(); toast("נוסף ליומן"); },
    // foods
    "food-new": (el) => foodModal(null, el.dataset.kind),
    "food-edit": (el) => foodModal(App.state.foods.find((f) => f.id === el.dataset.id)),
    "food-fav": (el) => { const f = App.state.foods.find((x) => x.id === el.dataset.id); f.favorite = !f.favorite; saveFood(f); render(); },
    "food-save": () => { const f = collectFoodForm(); if (!f.name) { toast("צריך שם"); return; } upsertFood(f); closeModal(); render(); },
    "recipe-save": () => { const f = collectFoodForm(); if (!f.name) { toast("צריך שם"); return; } if (!f.ingredients.length) { toast("הוסיפי לפחות מרכיב אחד"); return; } upsertFood(f); closeModal(); render(); },
    "food-del": (el) => { if (!confirm("למחוק את המאכל?")) return; App.state.foods = App.state.foods.filter((f) => f.id !== el.dataset.id); Store.del("foods", el.dataset.id); closeModal(); render(); },
    "food-adopt": (el) => { const g = foodById(el.dataset.id); const f = { id: uid("f"), name: g.name, aliases: g.aliases.slice(), kind: "product", per100: Object.assign({}, g.per100), portions: g.portions.map((p) => Object.assign({}, p)), favorite: true }; upsertFood(f); toast("נוסף למאכלים שלך"); foodsQuery = ""; render(); },
    "food-examples": () => { exampleFoods(); render(); },
    "recipe-field": () => { const f = window._editFood; f.servings = Number($("ff-servings").value) || 1; f.name = $("ff-name").value; f.aliases = $("ff-aliases").value.split(",").map((s) => s.trim()).filter(Boolean); recipeModal(f, false); },
    "ing-pick": (el) => { const f = window._editFood; f.name = $("ff-name").value; f.aliases = $("ff-aliases").value.split(",").map((s) => s.trim()).filter(Boolean); f.servings = Number($("ff-servings").value) || 1; const fd = foodById(el.dataset.food); f.ingredients.push({ food_id: fd.id, grams: fd.portions[0] ? fd.portions[0].g : 100 }); recipeModal(f, false); },
    "ing-del": (el) => { const f = window._editFood; f.name = $("ff-name").value; f.servings = Number($("ff-servings").value) || 1; f.ingredients.splice(Number(el.dataset.i), 1); recipeModal(f, false); },
    // supps
    "supp-new": () => suppModal(null),
    "supp-edit": (el) => suppModal(App.state.supplements.find((s) => s.id === el.dataset.id)),
    "supp-save": () => { const s = window._editSupp; s.name = $("sf-name").value.trim(); if (!s.name) { toast("צריך שם"); return; } s.dose_label = $("sf-dose").value.trim(); s.doses = Math.max(1, Math.round(Number($("sf-doses").value) || 1)); s.times = $("sf-times").value.split(",").map((x) => x.trim()).filter(Boolean); s.active = $("sf-active").checked; s.nutrients = {}; NUT_KEYS.forEach((k) => { const el = $("sf-" + k); if (el && el.value !== "") s.nutrients[k] = Number(el.value); }); const i = App.state.supplements.findIndex((x) => x.id === s.id); if (i >= 0) App.state.supplements[i] = s; else App.state.supplements.push(s); saveSupp(s); closeModal(); render(); },
    "supp-del": (el) => { if (!confirm("למחוק את התוסף?")) return; App.state.supplements = App.state.supplements.filter((s) => s.id !== el.dataset.id); Store.del("supplements", el.dataset.id); closeModal(); render(); },
    // what next
    "opt-clear": (el) => { options[Number(el.dataset.i)] = null; renderWhatNext(); },
    "opt-pick": (el) => { const f = foodById(el.dataset.food); options[Number(el.dataset.i)] = { food: f, qty: 1, unit: f.portions[0] ? f.portions[0].label : "גרם" }; renderWhatNext(); },
    "opt-use": (el) => { const f = foodById(el.dataset.food); const i = options.findIndex((o) => !o); options[i < 0 ? 3 : i] = { food: f, qty: 1, unit: f.portions[0] ? f.portions[0].label : "גרם" }; renderWhatNext(); window.scrollTo({ top: 0, behavior: "smooth" }); },
    "opt-eat": (el) => { const o = options[Number(el.dataset.i)]; addMealEntry(App.date, o.food, o.qty, o.unit); options[Number(el.dataset.i)] = null; toast(`נוסף ליומן: ${o.food.name}`); renderWhatNext(); renderHeader(); },
    "suggest-me": () => suggestMe(),
    // chat
    "chat-send": () => { const t = $("chat-text").value.trim(); if (t) chatSend(t); },
    "chat-quick": (el) => chatSend(el.dataset.q),
    "chat-stop": () => { if (chatCtl) chatCtl.abort(); },
    "chat-clear": () => { if (!confirm("לנקות את השיחה?")) return; App.state.chat = { turns: [] }; saveChat(); renderChat(); },
    "chat-ctx": () => { showCtx = !showCtx; renderChat(); },
    // pregnancy
    "weight-save": () => { const v = Number($("w-kg").value); const day = getDay(App.date); if (v) day.weight_kg = v; else delete day.weight_kg; saveDay(App.date); render(); toast("נשמר"); },
    "diag-toggle": (el) => { const code = el.dataset.code; const ex = App.state.diagnoses.find((d) => d.code === code); if (ex) { App.state.diagnoses = App.state.diagnoses.filter((d) => d.code !== code); Store.del("diagnoses", ex.id); } else { const d = { id: uid("d"), code, since: App.date }; App.state.diagnoses.push(d); saveDiag(d); } render(); },
    "lab-add": () => { const v = $("lab-value").value; if (v === "") { toast("חסר ערך"); return; } const marker = $("lab-marker").value; const m = window.LAB_MARKERS.find((x) => x.key === marker); const l = { id: uid("l"), marker, value: Number(v), date: $("lab-date").value || App.date, unit: $("lab-unit").value.trim() || m.unit }; App.state.labs.push(l); saveLab(l); render(); toast("הבדיקה נשמרה"); },
    "lab-del": (el) => { App.state.labs = App.state.labs.filter((l) => l.id !== el.dataset.id); Store.del("labs", el.dataset.id); render(); },
    // history
    "hist-range": (el) => { histRange = Number(el.dataset.v); renderHistory(); },
    // settings
    "pin-set": async () => { const a = $("pin-new").value, b = $("pin-new2").value; if (!a || a.length < 4) { toast("לפחות 4 תווים"); return; } if (a !== b) { toast("הסיסמאות לא זהות"); return; } const salt = uid("salt"); App.state.profile.pin_salt = salt; App.state.profile.pin_hash = await sha256(salt + a); await saveProfile(); try { sessionStorage.setItem("nutrition_unlocked", "1"); } catch (e) {} unlocked = true; toast("הסיסמה נשמרה"); render(); },
    "pin-remove": async () => { if (!confirm("להסיר את הסיסמה?")) return; delete App.state.profile.pin_hash; delete App.state.profile.pin_salt; await saveProfile(); render(); },
    "export": () => exportData(),
    "wipe": () => wipeAll(),
  };
  function quickSubmit() {
    const inp = $("quick-input"); if (!inp) return;
    const parsed = parseQuick(inp.value);
    if (!parsed.name && parsed.matches.length === 0) return;
    if (parsed.matches.length && (parsed.matches.length === 1 || normalizeHe(parsed.matches[0].name) === normalizeHe(parsed.name) || (parsed.matches[0].aliases || []).map(normalizeHe).includes(normalizeHe(parsed.name)))) {
      const f = parsed.matches[0];
      addMealEntry(App.date, f, parsed.qty, parsed.unit && unitOptions(f).includes(parsed.unit) ? parsed.unit : (parsed.unit ? (f.portions.find((p) => p.label.includes(parsed.unit)) || {}).label : null));
      inp.value = ""; toast(`נוסף: ${f.name}`); render();
      setTimeout(() => { const q = $("quick-input"); if (q) q.focus(); }, 30);
    } else if (parsed.matches.length) showSuggest(parsed.matches, parsed.name);
    else toast("לא נמצא מאכל בשם הזה — נסי חיפוש אחר או הוסיפי אותו ב'המאכלים שלי'");
  }
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]"); if (!el) return;
    const fn = actions[el.dataset.act];
    if (fn) { if (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA") return; e.preventDefault(); try { const r = fn(el, e); if (r && r.catch) r.catch((err) => { console.error(err); toast("משהו השתבש: " + (err && err.message ? err.message : err)); }); } catch (err) { console.error(err); toast("משהו השתבש: " + (err && err.message ? err.message : err)); } }
  });
  document.addEventListener("keydown", (e) => {
    const el = e.target;
    if (el.id === "quick-input") { if (e.key === "Enter") { e.preventDefault(); quickSubmit(); } if (e.key === "Escape") { const s = $("quick-suggest"); if (s) s.hidden = true; } }
    if (el.id === "lock-pin" && e.key === "Enter") tryUnlock();
    if (el.id === "chat-text" && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); actions["chat-send"](); }
    if (el.id === "pend-qty" && e.key === "Enter") actions["pend-add"]();
    if (el.id === "lab-value" && e.key === "Enter") actions["lab-add"]();
    if (el.id === "w-kg" && e.key === "Enter") actions["weight-save"]();
    if (el.id === "ai-text" && e.key === "Enter" && (e.ctrlKey || e.metaKey)) runAiParse();
    if ((el.classList.contains("supp") || el.classList.contains("check")) && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); el.click(); }
  });
  document.addEventListener("input", (e) => {
    const el = e.target, act = el.dataset.act;
    if (act === "quick-typing") { const p = parseQuick(el.value); if (el.value.trim()) showSuggest(p.matches, p.name); else $("quick-suggest").hidden = true; }
    if (act === "foods-search") { foodsQuery = el.value; renderFoods(); const s = $("foods-search"); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
    if (act === "ing-typing") { const list = searchFoods(el.value, 8); const box = $("ing-suggest"); if (!list.length || !el.value.trim()) { box.hidden = true; return; } box.innerHTML = list.map((f) => `<button data-act="ing-pick" data-food="${f.id}"><span>${esc(f.name)}</span><span class="cat">${f.generic ? esc(window.FOOD_CATEGORIES[f.cat] || "") : "שלי"}</span></button>`).join(""); box.hidden = false; }
    if (act === "opt-typing") { const i = el.dataset.i; const list = searchFoods(el.value, 8); const box = $("opt-suggest-" + i); if (!list.length || !el.value.trim()) { box.hidden = true; return; } box.innerHTML = list.map((f) => `<button data-act="opt-pick" data-food="${f.id}" data-i="${i}"><span>${esc(f.name)}</span><span class="cat">${f.generic ? esc(window.FOOD_CATEGORIES[f.cat] || "") : "שלי"}</span></button>`).join(""); box.hidden = false; }
  });
  document.addEventListener("change", (e) => {
    const el = e.target, act = el.dataset.act;
    if (act === "date-set" && el.value) { App.date = el.value; pendingFood = null; render(); }
    if (act === "meal-qty") { const day = getDay(App.date); const m = day.meals.find((x) => x.id === el.dataset.id); const f = foodById(m.food_id); m.qty = Number(el.value) || 0; m.grams = Math.round(f ? gramsFor(f, m.qty, m.unit) : m.grams); m.nutrients = f ? nutrientsFor(f, m.grams) : m.nutrients; saveDay(App.date); render(); }
    if (act === "day-notes") { getDay(App.date).notes = el.value; saveDay(App.date); }
    if (act === "profile-field") { App.state.profile[el.dataset.k] = el.type === "number" ? (el.value === "" ? null : Number(el.value)) : el.value; saveProfile(); render(); }
    if (act === "profile-check") { App.state.profile[el.dataset.k] = el.checked; saveProfile(); render(); }
    if (act === "override") { App.state.targets = App.state.targets || { overrides: {} }; App.state.targets.overrides = App.state.targets.overrides || {}; if (el.value === "") delete App.state.targets.overrides[el.dataset.k]; else App.state.targets.overrides[el.dataset.k] = Number(el.value); saveTargets(); renderHeader(); }
    if (act === "hist-key") { histKey = el.value; renderHistory(); }
    if (act === "hist-lab") { histLab = el.value; renderHistory(); }
    if (act === "import-file" && el.files[0]) importData(el.files[0]);
    if (el.id === "ai-photo") { const n = $("ai-photo-name"); if (n) n.textContent = el.files[0] ? el.files[0].name : ""; }
    if (act === "ing-grams") { const f = window._editFood; f.ingredients[Number(el.dataset.i)].grams = Number(el.value) || 0; f.name = $("ff-name").value; f.servings = Number($("ff-servings").value) || 1; recipeModal(f, false); }
    if (el.id && el.id.startsWith("opt") && (el.id.endsWith("-qty") || el.id.endsWith("-unit"))) { const i = Number(el.id.replace("opt", "").split("-")[0]); const o = options[i]; if (!o) return; o.qty = Number($("opt" + i + "-qty").value) || 0; o.unit = $("opt" + i + "-unit").value; renderWhatNext(); }
  });
  document.addEventListener("click", (e) => { if (!e.target.closest(".quick")) document.querySelectorAll(".suggest").forEach((s) => { s.hidden = true; }); });
  // tabs
  $("tabs").addEventListener("click", (e) => { const b = e.target.closest(".tab"); if (!b) return; App.tab = b.dataset.tab; pendingFood = null; render(); });
  $("lock-btn").addEventListener("click", tryUnlock);
  // tooltip
  const tip = $("tip");
  document.addEventListener("pointermove", (e) => {
    const el = e.target.closest ? e.target.closest("[data-tip]") : null;
    if (!el) { tip.hidden = true; return; }
    tip.textContent = el.dataset.tip; tip.hidden = false;
    const x = Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, e.clientX - tip.offsetWidth / 2));
    tip.style.left = x + "px"; tip.style.top = (e.clientY - tip.offsetHeight - 12) + "px";
  });
  document.addEventListener("pointerdown", (e) => { if (!(e.target.closest && e.target.closest("[data-tip]"))) tip.hidden = true; });

  // ------------------------------------------------------------ boot
  (async function boot() {
    const cached = readCache();
    if (cached) App.state = Object.assign(emptyState(), cached);
    let sessionOk = false; try { sessionOk = sessionStorage.getItem("nutrition_unlocked") === "1"; } catch (e) {}
    if (hasPin() && !sessionOk) showLock(); else { unlocked = true; render(); }
    await Store.init();
    // after cloud snapshot, re-evaluate lock (pin may live only in cloud)
    setTimeout(() => { if (hasPin() && !sessionOk && !unlocked) showLock(); else if (!hasPin()) { unlocked = true; } render(); }, 800);
  })();
})();
