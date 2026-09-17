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
  function scoreFood(f, nq) {
    const names = [f.name].concat(f.aliases || []).map(normalizeHe);
    let best = 0;
    names.forEach((n) => { if (n === nq) best = Math.max(best, 100); else if (n.startsWith(nq)) best = Math.max(best, 80); else if (n.includes(nq)) best = Math.max(best, 50); else if (nq.includes(n) && n.length > 1) best = Math.max(best, 30 + n.length); });
    return best;
  }
  function rankFoods(q) {
    const nq = normalizeHe(q);
    if (!nq) return [];
    const personal = App.state.foods.map(normFood).map((f) => ({ f, raw: scoreFood(f, nq) })).filter((x) => x.raw > 0).map((x) => ({ f: x.f, raw: x.raw, s: x.raw + (x.f.favorite ? 5 : 0) + 8 }));
    const generic = GENERIC.map((f) => ({ f, raw: scoreFood(f, nq) })).filter((x) => x.raw > 0).map((x) => ({ f: x.f, raw: x.raw, s: x.raw }));
    return personal.concat(generic).sort((a, b) => b.s - a.s);
  }
  function searchFoods(q, limit = 8) { return rankFoods(q).slice(0, limit).map((x) => x.f); }
  // Confident only when the name (or an alias) matches exactly or as a prefix — never a loose "contains".
  function bestMatch(q) { const r = rankFoods(q)[0]; return r ? { food: r.f, confident: r.raw >= 80 } : { food: null, confident: false }; }
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
    const prev = suppTaken(day, s);
    day.supplement_times = day.supplement_times || {};
    const times = (day.supplement_times[s.id] || []).slice(0, prev);
    while (times.length < n) times.push(israelNow().str);
    day.supplement_times[s.id] = times.slice(0, n);
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
    const color = status === "good" ? "var(--good)" : status === "yellow" ? "var(--yellow)" : status === "orange" || status === "warn" ? "var(--warn)" : status === "red" || status === "over" ? "var(--bad)" : "var(--accent)";
    const label = Math.round((pct || 0) * 100);
    return `<svg class="donut" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" direction="ltr" aria-label="${label}%"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="5"></circle><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"></circle><text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-size="${size >= 44 ? 11 : 9}" font-weight="700" fill="var(--ink)">${label}%</text></svg>`;
  }
  // What the not-yet-taken supplement units would still add today, per nutrient.
  function pendingSupp(k, key) {
    const day = App.state.days[k] || { meals: [], supplements_taken: [] };
    let amount = 0; const parts = [];
    App.state.supplements.filter((s) => s.active !== false).forEach((s) => {
      const left = suppDoses(s) - suppTaken(day, s); if (left <= 0) return;
      const v = (suppNutrients(s)[key] || 0) * (left / suppDoses(s)); if (v <= 0) return;
      amount += v; parts.push({ name: s.name, units: left, v });
    });
    return { amount, parts };
  }
  function planOf(x, k) {
    if (x.kind === "limit" || x.status === "good" || x.status === "over") return null;
    const pend = pendingSupp(k, x.key);
    const projected = x.t ? (x.v + pend.amount) / x.t : 0;
    if (pend.amount <= 0) return { cls: "food", projected, text: "דרוש תזונה להשלמה", parts: [] };
    if (projected >= 0.95) return { cls: "supp", projected, text: `יושלם מתוספים (${pend.parts.map((p) => `${p.name.split(" ")[0]} ×${p.units}`).join(", ")})`, parts: pend.parts };
    return { cls: "part", projected, text: `יגיע ל-${Math.round(projected * 100)}% מתוספים · השאר מתזונה`, parts: pend.parts };
  }
  // Urgency of a deficit: red = must fix today, orange = fix, harm only if prolonged, yellow = fine for a few days, good = done.
  function urgencyOf(x, k) {
    if (x.status === "over") return { level: "over", label: "מעל הגבול" };
    if (x.kind === "limit") return x.status === "good" ? { level: "good", label: "בסדר" } : { level: "red", label: "מעל המגבלה" };
    if (x.status === "good") return { level: "good", label: "הושג" };
    const plan = planOf(x, k);
    const level = plan && plan.cls === "supp" ? "yellow" : urgencyLevelFor(x.pct, x.key, k);
    return { level, label: level === "red" ? "דחוף היום" : level === "orange" ? "להשלים" : "סביר, עדיין חסר" };
  }
  function urgencyLevelFor(pct, key, k) {
    if (pct >= 0.95) return "good";
    const isToday = k === dateKeyOf(new Date());
    const hour = new Date().getHours();
    const expected = isToday ? clamp((hour - 6) / 14, 0.15, 1) : 1;
    const ratio = expected ? pct / expected : pct;
    const daily = NUT_BY[key].urgency === "daily";
    if (ratio < 0.4) return daily ? "red" : "orange";
    if (ratio < 0.75) return daily ? "orange" : "yellow";
    return "yellow";
  }
  // Small line gauge: where today's intake sits between 0 and the safe upper limit (UL).
  function ulGauge(x) {
    const lim = x.kind === "limit" ? x.t : x.ul;
    if (!lim) return `<div class="ulg none"><span class="help">ללא גבול עליון</span></div>`;
    const r = x.v / lim, W = 100, L = 6, R = 94, y = 9;
    const px = (f) => R - clamp(f, 0, 1) * (R - L); // 0 on the right, the limit on the left
    const tp = x.kind === "limit" ? px(0.6) : px(x.t / lim), cp = px(0.85);
    const soft = !!NUT_BY[x.key].ulSoft;
    let lvl = r >= 1 ? "over" : r >= 0.85 ? "near" : r >= (x.kind === "limit" ? 0.6 : x.t / lim) ? "mid" : "ok";
    if (soft && (lvl === "over" || lvl === "near")) lvl = "soft";
    const label = r >= 1 ? (soft ? "מעל הגבול (ראי הערה)" : "מעל הגבול!") : `${Math.round(r * 100)}% מהגבול`;
    return `<div class="ulg ${lvl}" data-tip="${esc(`${x.he}: ${fmt(x.v)} מתוך גבול ${fmt(lim)} ${x.unit} ליום (${Math.round(r * 100)}%)`)}">
      <svg width="${W}" height="18" viewBox="0 0 ${W} 18" direction="ltr" aria-hidden="true">
        <line x1="${tp}" x2="${R}" y1="${y}" y2="${y}" stroke="var(--good)" stroke-width="4" stroke-linecap="round" opacity=".45"></line>
        <line x1="${cp}" x2="${tp}" y1="${y}" y2="${y}" stroke="var(--warn)" stroke-width="4" opacity=".5"></line>
        <line x1="${L}" x2="${cp}" y1="${y}" y2="${y}" stroke="var(--bad)" stroke-width="4" stroke-linecap="round" opacity=".6"></line>
        <line x1="${L}" x2="${L}" y1="3" y2="15" stroke="var(--bad)" stroke-width="2"></line>
        <circle cx="${px(r)}" cy="${y}" r="5" fill="${lvl === "over" || lvl === "near" ? "var(--bad)" : lvl === "mid" || lvl === "soft" ? "var(--warn)" : "var(--good)"}" stroke="var(--surface)" stroke-width="2"></circle>
      </svg><span class="ulg-text">${lvl === "over" || lvl === "near" ? "⚠ " : ""}${label}</span></div>`;
  }
  // Hints: when food alone already meets a target and the full supplement would push toward a hard limit.
  function suppAdvice(k) {
    const t = targetsFor(), food = dayTotals(k, { includeSupplements: false });
    const out = [];
    App.state.supplements.filter((s) => s.active !== false).forEach((s) => {
      const sn = suppNutrients(s);
      Object.keys(sn).forEach((key) => {
        const meta = NUT_BY[key]; if (!meta || !meta.ul) return;
        const full = sn[key], fv = food[key] || 0, ul = meta.ul, tv = t[key] || 0;
        if (key === "vitA") return; // prenatal vitamin A is beta-carotene — not counted toward the retinol limit
        if (meta.ulSoft && key !== "folate") return; // iron under treatment: no reduction hints
        const counted = key === "folate" ? full : fv + full; // folate UL applies to the synthetic form only
        if (counted >= ul * 0.85) out.push({ supp: s, key, level: counted >= ul ? "alert" : "warn", text: `${s.name}: עם כל היחידות ${key === "folate" ? "התוסף לבדו מגיע" : "התזונה + התוסף מגיעים"} ל-${fmt(counted)} ${meta.unit} ${meta.he} — ${Math.round((counted / ul) * 100)}% מהגבול העליון (${fmt(ul)}). שווה לדבר על המינון עם הרופא/ה; לא להפסיק לבד.` });
        else if (tv && fv >= tv && fv + full >= ul * 0.6) out.push({ supp: s, key, level: "info", text: `${meta.he}: התזונה לבדה כבר כיסתה את היעד היום (${fmt(fv)} / ${fmt(tv)}); התוסף מוסיף עד ${fmt(fv + full)} — עדיין מתחת לגבול הבטוח (${fmt(ul)}).` });
      });
    });
    return out;
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
  // Foods that can close the remaining gap of `key`: how many grams (or cups, for drinks) are needed.
  function closers(key, remaining, n = 8) {
    const mine = App.state.foods.map(normFood).filter((f) => (f.per100[key] || 0) > 0);
    const gen = GENERIC.filter((f) => f.cat !== "snacks" && dietOk(f) && (f.per100[key] || 0) > 0);
    const build = (f, personal) => {
      const need = (remaining / f.per100[key]) * 100;
      const p = f.portions[0];
      const isDrink = f.cat === "drinks";
      let eq = "";
      if (isDrink) eq = `${fmt(need / 240, 1)} כוסות`;
      else if (p && p.g > 0) { const q = need / p.g; if (q >= 0.2 && q <= 12) eq = `≈ ${fmt(q, 1)} ${p.label}`; }
      return { food: f, personal, need, text: isDrink ? eq : `${fmt(need, 0)} גרם${eq ? " (" + eq + ")" : ""}` };
    };
    const a = mine.map((f) => build(f, true)).filter((x) => x.need <= 600).sort((x, y) => x.need - y.need);
    const b = gen.map((f) => build(f, false)).filter((x) => x.need <= 400).sort((x, y) => x.need - y.need);
    return a.slice(0, 4).concat(b).slice(0, n);
  }
  function scoreOption(deltaN, g) {
    let score = 0, closes = [];
    g.forEach((x) => {
      const d = deltaN[x.key] || 0;
      if (!x.t || d <= 0) return;
      if (x.kind === "limit") { if (x.v + d > x.t) score -= ((x.v + d - x.t) / x.t) * 2; return; }
      if (x.ul && x.v + d > x.ul) { score -= 2; closes.push({ key: x.key, over: true }); return; }
      const w = HERO.includes(x.key) ? 3 : x.key === "carbs" ? 2 : 1;
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
  // Two separate markers: an urgency dot (colour only) and a plan pill (own colours + short text).
  function urgencyDot(u) { return `<span class="urg-dot urg-${u.level}" title="${esc(u.label)}" aria-label="${esc(u.label)}"></span>`; }
  function planPill(plan, x, k) {
    if (!plan) return "";
    if (plan.cls === "supp") return `<span class="status-pill st-good">יושלם מתוספים</span>`;
    if (plan.cls === "food") return `<span class="status-pill st-info">דרוש תזונה</span>`;
    const after = urgencyLevelFor(plan.projected, x.key, k); // the colour it would reach after the remaining supplements
    const cls = { good: "st-good", yellow: "st-yellow", orange: "st-warn", red: "st-bad" }[after] || "st-info";
    return `<span class="status-pill ${cls}" title="אחרי התוספים שנותרו">${esc(`עם תוספים ${Math.round(plan.projected * 100)}%`)}</span>`;
  }
  function combinedPill(x, k) {
    const u = urgencyOf(x, k), plan = planOf(x, k);
    if (u.level === "good" || u.level === "over" || x.kind === "limit") return urgencyPill(u);
    return planPill(plan, x, k);
  }
  function urgencyPill(u) { const cls = { good: "st-good", yellow: "st-yellow", orange: "st-warn", red: "st-bad", over: "st-over" }[u.level] || "st-info"; return `<span class="status-pill ${cls}">${esc(u.label)}</span>`; }
  function barHtml(x, thin) {
    const foodPct = clamp(((x.v - x.supp) / (x.t || 1)) * 100, 0, 100), suppPct = clamp((x.supp / (x.t || 1)) * 100, 0, 100 - foodPct);
    return `<div class="bar${thin ? " thin" : ""}"><i class="food" style="width:${foodPct}%"></i><i class="supp" style="width:${suppPct}%"></i></div>`;
  }
  function foodSelectHtml(id, food, qty, unit) {
    const opts = unitOptions(food).map((u) => `<option ${u === unit ? "selected" : ""}>${esc(u)}</option>`).join("");
    return `<input class="qty num" id="${id}-qty" type="number" step="0.25" min="0" value="${qty}"> <select class="unit" id="${id}-unit">${opts}</select>`;
  }

  // ------------------------------------------------------------ "now" (Israel clock) status
  function israelNow() {
    let h, m;
    try { const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date()); h = Number(parts.find((x) => x.type === "hour").value) % 24; m = Number(parts.find((x) => x.type === "minute").value); }
    catch (e) { const d = new Date(); h = d.getHours(); m = d.getMinutes(); }
    return { h, m, min: h * 60 + m, str: `${pad(h)}:${pad(m)}` };
  }
  const toMin = (t) => { const [h, m] = String(t || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  const minStr = (mm) => `${pad(Math.floor(((mm % 1440) + 1440) % 1440 / 60))}:${pad(((mm % 60) + 60) % 60)}`;
  function nowStatus() {
    const now = israelNow(), todayK = dateKeyOf(new Date()), day = getDay(todayK);
    const g = gaps(todayK), items = [];
    const meals = day.meals.filter((m) => m.time && toMin(m.time) <= now.min).sort((x, y) => toMin(x.time) - toMin(y.time));
    const last = meals[meals.length - 1];
    let head = "";
    const wanted = g.filter((x) => x.t > 0 && x.kind !== "limit" && x.status !== "good").sort((x, y) => (HERO.includes(y.key) ? 1 : 0) - (HERO.includes(x.key) ? 1 : 0) || x.pct - y.pct).slice(0, 3).map((x) => x.he);
    if (!last) {
      head = now.h < 6 ? "לילה — אין מה לרשום עדיין." : now.h < 11 ? "עדיין לא אכלת היום — התחילי בארוחת בוקר עם חלבון ופחמימה מלאה." : "עדיין לא נרשם אוכל היום — אם אכלת, רשמי; אם לא, זה הזמן לאכול.";
      if (now.h >= 6) items.push({ level: "warn", text: head });
    } else {
      const d = digestion(last), start = toMin(last.time), ready = start + d.hours * 60, since = now.min - start;
      const sinceTxt = since < 60 ? `${since} דק'` : `${fmt(since / 60, 1)} שעות`;
      if (now.min < ready) { head = `הקיבה עדיין מעכלת את ${last.name} (עד ~${minStr(ready)}) — חטיף קל בסדר, ארוחה מעמיסה עדיף אחר כך.`; items.push({ level: "info", text: head }); }
      else if (since >= 240 && now.h < 23) { head = `עברו ${sinceTxt} מאז ${last.name} — כדאי לאכול משהו עכשיו (חלבון + פחמימה מלאה).`; items.push({ level: "warn", text: head }); }
      else { head = `אפשר לאכול (הארוחה האחרונה לפני ${sinceTxt}).${wanted.length ? " כדאי לכוון ל: " + wanted.join(", ") + "." : ""}`; items.push({ level: "good", text: head }); }
      if (d.glLabel === "גבוה" && now.min < start + 150) items.push({ level: "warn", text: `עומס פחמימות גבוה ב-${last.name} (${fmt(d.netCarbs, 0)} גרם נטו) — עד ~${minStr(start + 150)} להימנע מעוד פחמימות (מתוקים, לחם, פירות מיובשים).` });
    }
    // iron vs calcium / coffee timing
    const ironSupps = App.state.supplements.filter((s) => s.active !== false && (suppNutrients(s).iron || 0) >= 10);
    const ironTimes = ironSupps.flatMap((s) => ((day.supplement_times || {})[s.id] || []).map(toMin)).filter((t) => t <= now.min);
    const lastIron = ironTimes.length ? Math.max(...ironTimes) : null;
    const ironMeal = meals.filter((m) => (m.nutrients.iron || 0) >= 3 && now.min - toMin(m.time) < 120).pop();
    const calMeal = meals.filter((m) => (m.nutrients.calcium || 0) >= 200 && now.min - toMin(m.time) < 120).pop();
    if (lastIron != null && now.min - lastIron < 120) items.push({ level: "warn", text: `לקחת ברזל ב-${minStr(lastIron)} — עד ~${minStr(lastIron + 120)} להימנע מסידן (חלב צמחי מועשר, הרבה טחינה/שומשום, כדור סידן) ומקפה/תה.` });
    else if (ironMeal) items.push({ level: "info", text: `${ironMeal.name} עשיר בברזל — קפה/תה ומקורות סידן עדיף להרחיק עד ~${minStr(toMin(ironMeal.time) + 120)}; ויטמין C (פלפל, הדרים, עגבנייה) משפר ספיגה.` });
    const ironPending = ironSupps.some((s) => suppTaken(day, s) < suppDoses(s));
    if (calMeal && ironPending && !(lastIron != null && now.min - lastIron < 120)) items.push({ level: "info", text: `${calMeal.name} עשיר בסידן (${minStr(toMin(calMeal.time))}) — את כדור הברזל עדיף לקחת אחרי ~${minStr(toMin(calMeal.time) + 120)}, עם מים או מיץ הדרים.` });
    // evening
    if (now.h >= 21) items.push({ level: "info", text: "ערב: ארוחה גדולה לפני השינה מכבידה (צרבת); חטיף קטן עם חלבון מייצב את הסוכר בלילה." });
    const pendingUnits = App.state.supplements.filter((s) => s.active !== false).reduce((acc, s) => acc + (suppDoses(s) - suppTaken(day, s)), 0);
    if (pendingUnits > 0 && now.h >= 19) items.push({ level: "warn", text: `נותרו ${pendingUnits} יחידות תוספים שלא סומנו היום.` });
    const sitNote = sitOverdue(); if (sitNote) items.push({ level: "alert", text: sitNote });
    return { now, head, items };
  }
  function nowCardHtml() {
    const st = nowStatus();
    return `<div class="now-head"><div class="clock num">${st.now.str}</div><div class="grow"><div class="eyebrow">עכשיו · שעון ישראל</div><p><b>${esc(st.head)}</b></p></div></div>
      ${st.items.length > 1 ? `<div class="stack" style="gap:6px;margin-top:8px">${st.items.slice(1).map((i) => `<div class="note ${i.level}">${esc(i.text)}</div>`).join("")}</div>` : ""}`;
  }
  setInterval(() => {
    if (document.querySelector(".modal-bg")) return;
    const el = $("now-card"); if (el) el.innerHTML = nowCardHtml();
    const gl = $("gl-card"); if (gl && App.date === dateKeyOf(new Date())) gl.innerHTML = glCardInner(getDay(App.date), true);
    const sp = $("sun-pill"), sr = $("sun-rec"); if (sp && sr && App.date === dateKeyOf(new Date())) { const st = sunStatus(getDay(App.date), true); sp.innerHTML = st.pill; sr.textContent = st.rec; }
  }, 60 * 1000);

  // ------------------------------------------------------------ glycemic load timeline
  // Typical glycemic index per generic food (University of Sydney GI database and similar tables; approximate).
  const GI_GENERIC = {
    lehem_lavan: 75, lehem_male: 60, lehem_kal: 55, pita: 70, pita_mlea: 60, lahmania: 72, tortilla: 60, orez_lavan: 73, orez_male: 65,
    pasta: 50, pasta_mlea: 45, couscous: 65, burgul: 48, quinoa: 53, oats: 55, ptitim: 60, potato: 80, batata: 63, granola: 60, cornflakes: 81, pricha: 85,
    lentils: 32, chickpeas: 28, hummus: 25, white_beans: 31, red_beans: 29, peas: 50, ful: 40, tofu: 15, edamame: 18,
    egg: 0, milk3: 35, milk1: 35, yogurt: 35, greek_yogurt: 20, white_cheese: 10, cottage: 10, yellow_cheese: 0, bulgarit: 0, labane: 15, butter: 0,
    chicken_breast: 0, chicken_thigh: 0, beef_ground: 0, beef_steak: 0, chicken_liver: 0, turkey: 0, salmon: 0, tuna_can: 0, sardines: 0, white_fish: 0, schnitzel: 55, meatballs: 40,
    tomato: 30, cucumber: 15, pepper: 15, carrot: 39, broccoli: 15, cauliflower: 15, spinach_cooked: 15, spinach_raw: 15, lettuce: 15, onion: 15, garlic: 30, zucchini: 15,
    eggplant: 15, cabbage: 15, beet: 64, pumpkin: 75, corn: 52, avocado: 15, parsley: 15, mushrooms: 15, salad: 20, olives: 15, pickles: 15, nori: 15, iodized_salt: 0,
    apple: 36, banana: 51, orange: 43, clementine: 47, watermelon: 76, melon: 65, grapes: 53, strawberry: 40, peach: 42, pear: 38, date: 42, pomegranate: 53, kiwi: 50,
    mango: 51, pineapple: 59, dried_apricot: 31, raisins: 64, prunes: 29,
    almonds: 15, walnuts: 15, tahini_raw: 35, tahini_prep: 35, peanut_butter: 14, olive_oil: 0, chia: 1, sunflower: 20, pumpkin_seeds: 25, cashew: 22, peanuts: 14, sesame: 35,
    shakshuka: 30, omelet: 0, tuna_salad: 10, falafel: 40, lentil_soup: 35, veg_soup: 35, chicken_soup: 30, pizza: 60, sandwich_cheese: 60, pasta_tomato: 50, mujadara: 45,
    chicken_potatoes: 60, porridge: 55, yogurt_granola: 50, pancake: 67, burekas: 65, protein_powder: 30,
    water: 0, oj: 50, coffee_milk: 35, coffee_black: 0, tea: 0, choco_milk: 40, soy_milk: 34, almond_milk: 25, oat_milk: 69, coffee_decaf: 0, coffee_plant_milk: 50,
    soda: 63, lemonade: 60, smoothie: 50, pom_juice: 53,
    bamba: 55, bissli: 70, dark_choc: 25, milk_choc: 43, cookie: 65, cake: 60, icecream: 51, honey: 61, sugar: 65, jam: 55, choc_spread: 33, halva: 35, ketchup: 55, mayo: 0,
  };
  const GI_BY_CAT = { grains: 65, legumes: 30, dairy: 35, meat: 0, veg: 30, fruit: 50, nuts: 20, dishes: 55, drinks: 55, snacks: 65 };
  // One-off items whose name identifies them better than their composition does. Mung-bean starch
  // noodles look like plain refined starch but measure around GI 40.
  const GI_BY_NAME = [[/אטריות זכוכית|אטריות שעועית|נודלס שעועית|אטריות מש/, 40]];
  // GI of a logged item: explicit `gi` on the food → generic table → estimate from composition.
  // `nutrients` are for the portion actually eaten; the "negligible" test (< 5 g net carbs) is on the portion, not per 100 ml.
  function giOf(food, nutrients, grams, name) {
    if (food && food.gi != null && food.gi !== "") return clamp(Number(food.gi) || 0, 0, 110);
    if (food && food.generic) { const k = food.id.replace(/^g_/, ""); if (GI_GENERIC[k] != null) return GI_GENERIC[k]; return GI_BY_CAT[food.cat] != null ? GI_BY_CAT[food.cat] : 55; }
    const n = nutrients || {}, g = grams || 100;
    const netPortion = Math.max(0, (n.carbs || 0) - (n.fiber || 0));
    const carbs = ((n.carbs || 0) / g) * 100, fiber = ((n.fiber || 0) / g) * 100, fat = ((n.fat || 0) / g) * 100, prot = ((n.protein || 0) / g) * 100;
    const net = Math.max(0, carbs - fiber);
    // sweetened drink / plain sugar or honey: named so, or almost no fibre, fat and protein → behaves like sucrose (GI ~65) on the grams actually drunk.
    const label = String(name || (food && food.name) || "");
    const named = GI_BY_NAME.find(([re]) => re.test(label));
    if (named) return named[1];
    if (/סוכר|דבש|סירופ|ממותק|מיץ|לימונדה|משקה/.test(label) || (net >= 2 && fiber < 0.3 && fat + prot < 1)) return 65;
    if (netPortion < 5) return 20;
    // The estimate is the GI of the CARBOHYDRATE itself, so fat and protein are NOT deducted here:
    // the meal's damping factor already accounts for them once. Deducting twice made fried and pastry
    // food look low-GI (chips came out at 47 instead of 65–75). Base 65 = a refined starch (bread,
    // potato, pastry, batter); only the item's own fibre lowers it.
    let gi = 65;
    const fr = carbs > 0 ? fiber / carbs : 0;
    if (fr > 0.45) gi -= 30; else if (fr > 0.3) gi -= 20; else if (fr > 0.15) gi -= 10;
    return clamp(gi, 25, 75);
  }
  // Meals: every logged item with a time; items eaten within 45 minutes of the previous one form one meal (cluster).
  // Each cluster gets a kind (breakfast / main / snack) and a net-carb cap: first cluster before 11:30 = breakfast (45 g);
  // the largest cluster (kcal) in 12:00–16:30 and in 17:30–22:30 = main (60 g); everything else = snack (30 g).
  const MEAL_CAP = { breakfast: 45, main: 60, snack: 30 };
  const MEAL_KIND_HE = { breakfast: "בוקר", main: "עיקרית", snack: "ביניים" };
  function glClusters(day) {
    const all = (day.meals || []).filter((m) => m.time && m.nutrients).slice().sort((a, b) => toMin(a.time) - toMin(b.time));
    const clusters = []; let cur = null;
    all.forEach((m) => { const t = toMin(m.time); if (cur && t - cur.end <= 45) { cur.items.push(m); cur.end = t; } else { cur = { start: t, end: t, items: [m] }; clusters.push(cur); } });
    clusters.forEach((c) => {
      c.net = c.items.reduce((a, m) => a + Math.max(0, (m.nutrients.carbs || 0) - (m.nutrients.fiber || 0)), 0);
      c.fat = c.items.reduce((a, m) => a + (m.nutrients.fat || 0), 0);
      c.protein = c.items.reduce((a, m) => a + (m.nutrients.protein || 0), 0);
      c.kcal = c.items.reduce((a, m) => a + (m.nutrients.kcal || 0), 0);
      c.kind = "snack";
    });
    if (clusters.length && clusters[0].start < 11.5 * 60) clusters[0].kind = "breakfast";
    [[12 * 60, 16.5 * 60], [17.5 * 60, 22.5 * 60]].forEach(([a, b]) => { const win = clusters.filter((c) => c.kind !== "breakfast" && c.start >= a && c.start <= b); if (win.length) win.reduce((m, c) => (c.kcal > m.kcal ? c : m)).kind = "main"; });
    const capPerMeal = targetsFor().carbsPerMeal;
    clusters.forEach((c) => { c.cap = capPerMeal ? Math.min(MEAL_CAP[c.kind], capPerMeal) : MEAL_CAP[c.kind]; c.capLevel = c.net > c.cap * 1.25 ? "over" : c.net > c.cap ? "soft" : "ok"; });
    return { all, clusters };
  }
  // Glycemic load per logged item (only items with carbohydrate produce a wave). Protein + fat eaten around the same
  // time damp the item's load by up to 30%; the damping weight falls linearly with the distance in time (full at
  // the same minute, zero at 60 minutes) instead of a hard window. The first meal of the day gets a ×1.15 amplitude
  // on its wave (morning insulin resistance) — the amplitude affects the curve, not the counted load.
  function glEntries(day) {
    const { all, clusters } = glClusters(day);
    const out = [];
    clusters.forEach((c, ci) => {
      c.items.forEach((m) => {
        if (!((m.nutrients.carbs || 0) > 0)) return;
        const tm = toMin(m.time);
        let fpW = 0, netW = 0;
        all.forEach((o) => { const w = 1 - Math.abs(toMin(o.time) - tm) / 60; if (w <= 0) return; fpW += w * ((o.nutrients.fat || 0) + (o.nutrients.protein || 0)); netW += w * Math.max(0, (o.nutrients.carbs || 0) - (o.nutrients.fiber || 0)); });
        const damp = 1 - 0.3 * Math.min(1, fpW / Math.max(netW, 1));
        const food = foodById(m.food_id);
        const gi = giOf(food, m.nutrients, m.grams, m.name);
        const netC = Math.max(0, (m.nutrients.carbs || 0) - (m.nutrients.fiber || 0));
        const raw = (gi * netC) / 100;
        out.push({ id: m.id, name: m.name, t: tm, time: m.time, gi, netC, raw, damp, gl: raw * damp, amp: ci === 0 ? 1.15 : 1, netMeal: c.net, fatMeal: c.fat, mealGl: 0, cluster: c });
      });
    });
    clusters.forEach((c) => { const sum = out.filter((e) => e.cluster === c).reduce((a, e) => a + e.gl, 0); out.filter((e) => e.cluster === c).forEach((e) => { e.mealGl = sum; }); c.gl = sum; });
    return out;
  }
  // A real glucose wave comes back toward baseline within 3–4 hours even after a fatty meal, so the
  // tail is capped: at most 25% of the peak at 3 h, 5% at 4 h, nothing by 5 h. Fat spreads and delays
  // the peak, it does not keep the sugar up for half a day.
  function glTailCap(dt) {
    if (dt <= 120) return 1;
    if (dt <= 180) return Math.pow(0.25, (dt - 120) / 60);
    return 0.25 * Math.pow(0.2, (dt - 180) / 60);
  }
  // Blood-glucose response shape for one item: 0 at the meal, 1 at the peak, then the bounded tail.
  // Base peak 40–75 min (later for low-GI food); a large meal pushes it later (up to ×1.5) and a fatty
  // meal (> 20 g fat) ~15% later and wider, together reaching 75–100 min. Gamma-like curve, peak = 1.
  function glKernel(dtMin, gi, e) {
    if (dtMin <= 0) return 0;
    const g = clamp(gi, 0, 100);
    const netMeal = e ? clamp(e.netMeal || 0, 0, 120) : 0, fatty = !!(e && e.fatMeal > 20);
    let p = (40 + (100 - g) * 0.35) * (1 + netMeal / 240), a = 1.6 + (g / 100) * 1.4;
    if (fatty) { p *= 1.15; a *= 0.85; }
    p = clamp(p, 35, 100);
    const x = dtMin / p;
    const v = Math.pow(x, a) * Math.exp(a * (1 - x)) * glTailCap(dtMin);
    return v < 0.01 ? 0 : v;
  }
  function glCurveAt(entries, t, walks) { return entries.reduce((a, e) => a + e.gl * (e.amp || 1) * glKernel(t - e.t, e.gi, e) * (walks && walks.length ? walkFactor(e, t, walks) : 1), 0); }
  // Insulin resistance rises through pregnancy, so the same load produces a higher glucose response. Rather than
  // scaling the curve, the peak thresholds and the daily target are divided by a week factor:
  // ×1.0 until week 20, ×1.2 in weeks 20–27, ×1.4 from week 28 (base thresholds 20 = high peak, 10 = medium).
  const GL_HIGH_BASE = 20, GL_MID_BASE = 10;
  function pregGlFactor() { const w = pregCtx().week; return w == null ? 1 : w >= 28 ? 1.4 : w >= 20 ? 1.2 : 1; }
  function glThr() { const f = pregGlFactor(); return { f, hi: Math.round(GL_HIGH_BASE / f), mid: Math.round(GL_MID_BASE / f) }; }
  const glLevel = (v, thr) => (v >= thr.hi ? "hi" : v >= thr.mid ? "mid" : "low");
  const GL_LEVEL_HE = { hi: "גבוה", mid: "בינוני", low: "נמוך" };
  // Time above the threshold (like a sensor's time-in-range) replaces counting peaks: it does not
  // break when two waves merge into one wide peak, and it adds up over a day or a week.
  const durStr = (m) => (!m ? "0" : m < 60 ? `${m} דק'` : `${Math.floor(m / 60)}:${pad(m % 60)} שע'`);
  function glTimeAbove(entries, walks, thr, from, to, step) {
    const st = step || 5; let hi = 0, mid = 0, peak = { t: from, v: 0 };
    for (let t = from; t <= to; t += st) { const v = glCurveAt(entries, t, walks); if (v > peak.v) peak = { t, v }; if (v >= thr.hi) hi += st; else if (v >= thr.mid) mid += st; }
    return { hi, mid, peak };
  }
  // Personal daily glycemic-load target: all the carbohydrate she needs for the day, eaten as a
  // low-GI diet. carbs = 45% of the kcal target (never below the app's carb target), minus the fibre
  // target, at an average GI of 50 (45 when sugar sensitivity / GDM is flagged, with the capped carb target).
  function glDailyTarget() {
    const t = targetsFor(), ctx = pregCtx();
    const sugar = ctx.diagnoses.has("gdm") || !!t.carbsPerMeal;
    const kcal = t.kcal || 2200, fiber = t.fiber || 28;
    const carbs = sugar ? (t.carbs || 175) : Math.max(t.carbs || 175, (0.45 * kcal) / 4);
    const giTarget = sugar ? 45 : 50, f = pregGlFactor();
    const target = Math.max(40, Math.round(Math.max(0, carbs - fiber) * giTarget / 100 / f));
    return { target, carbs: Math.round(carbs), fiber, kcal, giTarget, sugar, trimester: ctx.trimester || 2, week: ctx.week, f };
  }
  // Gauge on the personal scale (0 on the right, like the UL gauges): green up to the target,
  // orange up to 125% of it, red beyond. A hollow marker shows where the day "should" be by this hour.
  function glTotalGauge(total, isToday) {
    const g = glDailyTarget(), T = g.target, HI = Math.round(T * 1.25), MAX = T * 1.6;
    const W = 250, L = 8, R = 242, y = 9;
    const px = (v) => R - clamp(v / MAX, 0, 1) * (R - L);
    const lvl = total > HI ? "over" : total > T ? "soft" : "ok";
    const color = lvl === "over" ? "var(--bad)" : lvl === "soft" ? "var(--warn)" : "var(--good)";
    const pct = Math.round((total / T) * 100);
    let expected = null;
    if (isToday) { const now = israelNow(); expected = T * clamp((now.min - 6 * 60) / (16 * 60), 0, 1); }
    const pace = expected != null && expected > 0 ? (total > expected * 1.3 ? "מהר מהקצב" : total < expected * 0.7 ? "מתחת לקצב" : "בקצב") : null;
    const label = lvl === "over" ? `גבוה — מעל 125% מהיעד` : lvl === "soft" ? `מעל היעד (${pct}%)` : `${pct}% מהיעד${pace ? " · " + pace : ""}`;
    const tip = `יעד אישי ${T}: ~${g.carbs} גרם פחמימות (${g.sugar ? "לפי תקרת הפחמימות ברגישות לסוכר" : "45% מ-" + fmt(g.kcal, 0) + " קק\"ל, טרימסטר " + g.trimester} ) פחות ${g.fiber} סיבים, באינדקס ממוצע ${g.giTarget} (תזונה בעלת אינדקס נמוך)${g.f > 1 ? `, מחולק ב-${g.f} בגלל התנגודת לאינסולין של שבוע ${g.week}` : ""}. מצטבר ${isToday ? "עד עכשיו" : "בתאריך זה"}: ${fmt(total, 0)}${expected != null ? " · צפוי לפי השעה: ~" + fmt(expected, 0) : ""}. תלוי רק במה שנאכל, לא במרווחים.`;
    return `<div class="ulg ${lvl} gl-total" data-tip="${esc(tip)}">
      <svg width="${W}" height="32" viewBox="0 0 ${W} 32" direction="ltr" aria-hidden="true">
        <line x1="${px(T)}" x2="${R}" y1="${y}" y2="${y}" stroke="var(--good)" stroke-width="5" stroke-linecap="round" opacity=".45"></line>
        <line x1="${px(HI)}" x2="${px(T)}" y1="${y}" y2="${y}" stroke="var(--warn)" stroke-width="5" opacity=".5"></line>
        <line x1="${L}" x2="${px(HI)}" y1="${y}" y2="${y}" stroke="var(--bad)" stroke-width="5" stroke-linecap="round" opacity=".6"></line>
        <line x1="${px(T)}" x2="${px(T)}" y1="1" y2="17" stroke="var(--ink)" stroke-width="2"></line>
        <line x1="${px(HI)}" x2="${px(HI)}" y1="3" y2="15" stroke="var(--bad)" stroke-width="1.5"></line>
        ${expected != null ? `<path d="M${px(expected)} 17 l-4 7 h8 z" fill="none" stroke="var(--ink-2)" stroke-width="1.3"></path>` : ""}
        <text x="${R}" y="30" text-anchor="middle" font-size="9" fill="var(--muted)">0</text>
        <text x="${px(T)}" y="30" text-anchor="middle" font-size="9" fill="var(--ink)" font-weight="700">יעד ${T}</text>
        <text x="${px(HI)}" y="30" text-anchor="middle" font-size="9" fill="var(--bad)">${HI}</text>
        <circle cx="${px(total)}" cy="${y}" r="6" fill="${color}" stroke="var(--surface)" stroke-width="2"></circle>
      </svg><span class="ulg-text">${lvl === "over" ? "⚠ " : ""}מצטבר ${fmt(total, 0)} מתוך ${T} · ${label}</span></div>`;
  }
  // Net carbohydrate per meal against a simple clinical cap (breakfast 45 g / main 60 g / snack 30 g; a per-meal
  // carb ceiling from the GDM rules lowers the cap). Simpler than GL and the number a nurse would ask about.
  function mealCarbBlock(clusters) {
    const cs = (clusters || []).filter((c) => c.net > 0);
    if (!cs.length) return "";
    const over = cs.filter((c) => c.capLevel !== "ok").length;
    return `<details class="gl-carbs" style="margin-top:8px" ${over ? "open" : ""}><summary class="small" style="cursor:pointer"><b>פחמימות נטו לארוחה</b> · ${over ? `${over} ${over === 1 ? "ארוחה" : "ארוחות"} מעל הרף` : "כל הארוחות בתוך הרף"} <span class="help">(בוקר ${MEAL_CAP.breakfast} · עיקרית ${MEAL_CAP.main} · ביניים ${MEAL_CAP.snack} גרם)</span></summary>
      <div class="mini-list" style="margin-top:6px">${cs.map((c) => `<div><span>${minStr(c.start)}${c.end > c.start ? "–" + minStr(c.end) : ""} · ${MEAL_KIND_HE[c.kind]} <span class="help">${esc(c.items.map((m) => m.name).join(", ").slice(0, 60))}${c.items.map((m) => m.name).join(", ").length > 60 ? "…" : ""}</span></span><b class="num" style="color:${c.capLevel === "over" ? "var(--bad)" : c.capLevel === "soft" ? "var(--warn)" : "var(--good)"}">${fmt(c.net, 0)} / ${c.cap} ג'${c.capLevel === "over" ? " ⚠" : ""}</b></div>`).join("")}</div>
      <p class="help" style="margin-top:4px">ארוחה = כל מה שנאכל בטווח של 45 דק'. סוג הארוחה נקבע לפי השעה והגודל: הראשונה לפני 11:30 = בוקר; הגדולה בצהריים (12–16:30) ובערב (17:30–22:30) = עיקרית; השאר = ביניים.</p>
    </details>`;
  }
  function glCardHtml(day, isToday) { return `<div class="card" id="gl-card">${glCardInner(day, isToday)}</div>`; }
  function glCardInner(day, isToday) {
    const entries = glEntries(day), walks = dayWalks(day), thr = glThr(), clusters = glClusters(day).clusters;
    const head = `<div class="card-head"><h2>עומס גליקמי לפי שעות</h2>`;
    if (!entries.length) return `${head}</div><p class="help">כשיירשמו ארוחות עם פחמימות יופיע כאן מד משוער של עומס הסוכר לאורך היום, עם רף שמסמן פיק גבוה מדי.</p>`;
    const now = israelNow();
    const first = Math.min(...entries.map((e) => e.t)), last = Math.max(...entries.map((e) => e.t));
    let x0 = Math.max(0, Math.min(6 * 60, Math.floor((first - 30) / 60) * 60));
    let x1 = Math.min(30 * 60, Math.max(24 * 60, Math.ceil((last + 240) / 60) * 60));
    if (isToday && now.min > x1 - 60) x1 = Math.min(30 * 60, Math.ceil((now.min + 60) / 60) * 60);
    const step = 5, pts = [];
    for (let t = x0; t <= x1; t += step) pts.push({ t, v: glCurveAt(entries, t, walks) });
    const peak = pts.reduce((b, p) => (p.v > b.v ? p : b), { t: x0, v: 0 });
    const ptsRaw = walks.length ? pts.map((p) => ({ t: p.t, v: glCurveAt(entries, p.t) })) : null;
    const peakRaw = ptsRaw ? ptsRaw.reduce((b, p) => (p.v > b.v ? p : b), { t: x0, v: 0 }) : null;
    const minsHigh = pts.filter((p) => p.v >= thr.hi).length * step, minsMid = pts.filter((p) => p.v >= thr.mid && p.v < thr.hi).length * step;
    const total = entries.reduce((a, e) => a + e.gl, 0);
    const nowV = isToday ? glCurveAt(entries, now.min, walks) : null;
    let calmAt = null;
    if (nowV != null && nowV >= thr.mid) { for (let t = now.min; t <= x1 + 240; t += step) { if (glCurveAt(entries, t, walks) < thr.mid) { calmAt = t; break; } } }
    // ---- svg (RTL: morning on the right, like the other charts)
    const gluc = (day.glucose || []).filter((r) => r.time && Number(r.mg_dl) > 0).map((r) => Object.assign({}, r, { t: toMin(r.time) })).filter((r) => r.t >= x0 && r.t <= x1);
    const w = 640, h = 220, left = 34, right = gluc.length ? 30 : 12, top = 22, bottom = 30, iw = w - left - right, ih = h - top - bottom;
    const maxV = Math.max(30, (peakRaw ? Math.max(peak.v, peakRaw.v) : peak.v) * 1.15);
    const X = (t) => left + iw - ((t - x0) / (x1 - x0)) * iw;
    const Y = (v) => top + ih - (clamp(v, 0, maxV) / maxV) * ih;
    let s = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" direction="ltr" style="direction:ltr" role="img" aria-label="עומס גליקמי משוער לפי שעות">`;
    s += `<defs><clipPath id="gl-clip-hi"><rect x="0" y="0" width="${w}" height="${Y(thr.hi)}"></rect></clipPath></defs>`;
    s += `<rect class="gl-band-hi" x="${left}" y="${top}" width="${iw}" height="${Math.max(0, Y(thr.hi) - top)}"></rect>`;
    s += `<rect class="gl-band-mid" x="${left}" y="${Y(thr.hi)}" width="${iw}" height="${Math.max(0, Y(thr.mid) - Y(thr.hi))}"></rect>`;
    const tickStep = maxV > 60 ? 20 : 10;
    for (let v = 0; v <= maxV; v += tickStep) { s += `<line class="grid" x1="${left}" x2="${w - right}" y1="${Y(v)}" y2="${Y(v)}"></line><text x="${left - 6}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`; }
    const area = [`${X(x0)},${Y(0)}`].concat(pts.map((p) => `${X(p.t)},${Y(p.v)}`)).concat([`${X(x1)},${Y(0)}`]).join(" ");
    s += `<polygon class="gl-area" points="${area}"></polygon>`;
    if (peak.v > thr.hi) s += `<polygon class="gl-over" points="${area}" clip-path="url(#gl-clip-hi)"></polygon>`;
    s += `<line class="gl-mid" x1="${left}" x2="${w - right}" y1="${Y(thr.mid)}" y2="${Y(thr.mid)}"></line>`;
    s += `<line class="gl-thr" x1="${left}" x2="${w - right}" y1="${Y(thr.hi)}" y2="${Y(thr.hi)}"></line>`;
    s += `<text class="gl-thr-label" x="${w - right}" y="${Y(thr.hi) - 5}" text-anchor="end">רף פיק גבוה (${thr.hi}${thr.f > 1 ? `, שבוע ${pregCtx().week}` : ""})</text>`;
    if (ptsRaw) s += `<polyline class="gl-line raw" points="${ptsRaw.map((p) => `${X(p.t)},${Y(p.v)}`).join(" ")}"></polyline>`;
    walks.forEach((w) => { s += `<rect class="gl-walk" x="${X(w.t + w.minutes)}" y="${Y(0) + 7}" width="${Math.max(3, X(w.t) - X(w.t + w.minutes))}" height="5" rx="2" data-tip="${esc(`הליכה ${WALK_HE[w.pace] || ""} ${w.minutes} דק' · ${w.start}–${minStr(w.t + w.minutes)}`)}"></rect>`; });
    s += `<polyline class="gl-line" points="${pts.map((p) => `${X(p.t)},${Y(p.v)}`).join(" ")}"></polyline>`;
    if (gluc.length) {
      const GY = (v) => top + ih - (clamp((v - 60) / 140, 0, 1)) * ih;
      [80, 120, 160, 200].forEach((v) => { s += `<text x="${w - 2}" y="${GY(v) + 4}" text-anchor="end" font-size="9" fill="var(--accent-2)">${v}</text>`; });
      gluc.forEach((r) => { s += `<path class="gl-gluc" d="M${X(r.t)} ${GY(r.mg_dl) - 6} l6 6 l-6 6 l-6 -6 z" data-tip="${esc(`סוכר ${r.mg_dl} mg/dL · ${r.time}${r.tag ? " · " + r.tag : ""}`)}"></path><text x="${X(r.t)}" y="${GY(r.mg_dl) - 9}" text-anchor="middle" font-size="10" fill="var(--accent-2)" font-weight="700">${r.mg_dl}</text>`; });
    }
    if (peak.v >= thr.mid) s += `<text class="strong" x="${clamp(X(peak.t), left + 30, w - right - 30)}" y="${Math.max(top + 10, Y(peak.v) - 8)}" text-anchor="middle">שיא ${fmt(peak.v, 0)} · ${minStr(peak.t)}</text>`;
    // x labels
    const lblStep = (x1 - x0) > 18 * 60 ? 180 : 120;
    for (let t = Math.ceil(x0 / lblStep) * lblStep; t <= x1; t += lblStep) s += `<text x="${X(t)}" y="${h - 10}" text-anchor="middle">${minStr(t)}</text>`;
    s += `<line class="axis" x1="${left}" x2="${w - right}" y1="${Y(0)}" y2="${Y(0)}"></line>`;
    // meal markers on the baseline (clickable → meal detail)
    entries.forEach((e) => {
      const lvl = glLevel(e.mealGl, thr);
      const tip = `${e.name} · ${e.time} · עומס ${fmt(e.gl, 0)} (GI ~${e.gi}, פחמ' נטו ${fmt(e.netC, 0)} גרם)${e.damp < 0.98 ? ` · מרוכך ${Math.round((1 - e.damp) * 100)}% ע"י חלבון/שומן בארוחה` : ""}${e.cluster.items.length > 1 ? ` · הארוחה כולה: ${fmt(e.mealGl, 0)}` : ""}${e.amp > 1 ? " · גל בוקר ×1.15" : ""}`;
      s += `<circle class="gl-meal ${lvl}" cx="${X(e.t)}" cy="${Y(0)}" r="5.5" data-tip="${esc(tip)}" data-act="meal-detail" data-id="${e.id}"></circle>`;
    });
    if (isToday && now.min >= x0 && now.min <= x1) { s += `<line class="gl-now" x1="${X(now.min)}" x2="${X(now.min)}" y1="${top - 4}" y2="${Y(0)}"></line><text class="gl-now-label" x="${X(now.min)}" y="${top - 8}" text-anchor="middle">עכשיו</text>`; }
    s += "</svg>";
    // ---- text
    const pill = nowV == null ? "" : `<span class="status-pill ${nowV >= thr.hi ? "st-bad" : nowV >= thr.mid ? "st-warn" : "st-good"}">עכשיו ${fmt(nowV, 0)} · ${GL_LEVEL_HE[glLevel(nowV, thr)]}</span>`;
    const top3 = entries.slice().sort((a, b) => b.gl - a.gl).slice(0, 3);
    let advice = "";
    if (nowV != null) {
      if (nowV >= thr.hi) advice = `העומס עכשיו מעל הרף — הליכה קלה של 10–15 דקות מרככת את הפיק; פחמימה נוספת עדיף${calmAt ? ` אחרי ~${minStr(calmAt)}` : " בעוד כשעתיים"}.`;
      else if (nowV >= thr.mid) advice = `עומס בינוני עכשיו${calmAt ? ` — יורד מתחת ל-${thr.mid} בערך ב-${minStr(calmAt)}; זה זמן טוב לפחמימה הבאה` : ""}. חטיף עם חלבון (טחינה, גרעינים, טופו) לא יגביה את הגל.`;
      else advice = minsHigh ? `עכשיו רגוע. היום ${durStr(minsHigh)} מעל הרף — בפעם הבאה לפצל את המנה או לצרף חלבון וירק.` : "עכשיו רגוע, וכל הגלים היום נשארו מתחת לרף.";
    } else advice = minsHigh ? `${durStr(minsHigh)} מעל הרף בתאריך הזה${minsMid ? `, ועוד ${durStr(minsMid)} בתחום הבינוני` : ""}.` : "כל הגלים בתאריך הזה נשארו מתחת לרף.";
    let walkTip = "";
    if (isToday && !readTimer() && now.h >= 6 && now.h < 21 && nowV != null && nowV >= thr.mid * 0.8 && glCurveAt(entries, now.min + 15, walks) >= nowV * 0.9 && !walks.some((w) => now.min - w.t >= 0 && now.min - w.t < 45)) {
      walkTip = `<div class="note good" style="margin-top:8px"><div>הליכה בינונית של 10–15 דק' עכשיו תוריד את הפיק הזה בכ-15–20%. <button class="btn sm" data-act="walk-start" style="margin-inline-start:6px">▶ התחלתי ללכת</button></div></div>`;
    }
    return `${head}${pill}</div>
      <div class="chart">${s}</div>
      <div class="legend"><span><i style="background:var(--accent)"></i>עומס משוער</span><span><i style="background:var(--bad)"></i>מעל הרף (${thr.hi})</span><span><i style="background:var(--warn-soft);border:1px solid var(--warn)"></i>בינוני (${thr.mid}–${thr.hi})</span><span>● ארוחה (לחיצה לפרטים)</span><span><i style="background:var(--accent-2)"></i>הליכה</span>${walks.length ? "<span>- - איך זה היה בלי ההליכה</span>" : ""}${(day.glucose || []).length ? "<span>◆ מדידת סוכר (mg/dL, סולם מימין)</span>" : ""}</div>
      <div class="gl-sum"><span>שיא היום: <b class="num">${fmt(peak.v, 0)}</b> ב-${minStr(peak.t)}</span><span>זמן מעל הרף: <b class="num">${durStr(minsHigh)}</b></span><span>בתחום הבינוני: <b class="num">${durStr(minsMid)}</b></span>${peakRaw && peakRaw.v > 0 && peak.v / peakRaw.v < 0.995 ? `<span>ההליכה הורידה את השיא ב-<b class="num">${Math.round((1 - peak.v / peakRaw.v) * 100)}%</b></span>` : ""}</div>
      <div class="row between" style="margin-top:8px;gap:8px"><span class="small"><b>עומס גליקמי מצטבר ${isToday ? "היום" : ""}</b><br><span class="help">סכום כל הארוחות מול יעד אישי (קלוריות, סיבים, טרימסטר, רגישות לסוכר) · המשולש = צפוי לפי השעה</span></span>${glTotalGauge(total, isToday)}</div>
      ${mealCarbBlock(clusters)}
      <p class="small" style="margin-top:6px">${esc(advice)}</p>
      ${walkTip}
      ${top3.length ? `<div class="chips" style="margin-top:8px">${top3.map((e) => `<button class="chip" data-act="meal-detail" data-id="${e.id}" title="לפרטי הארוחה">${esc(e.name)} · ${fmt(e.gl, 0)}</button>`).join("")}</div>` : ""}
      <details style="margin-top:8px"><summary class="help" style="cursor:pointer">איך זה מחושב</summary><p class="help" style="margin-top:6px">עומס גליקמי לפריט = אינדקס גליקמי × פחמימות נטו (פחמימות פחות סיבים) ÷ 100. כל פריט יוצר גל: שיא אחרי 40–75 דקות, ובארוחה גדולה או שמנה עד 100 דקות והגל רחב יותר. הדעיכה חסומה כך שגם ארוחה שמנה חוזרת לכיוון הבסיס: עד 25% מהשיא אחרי 3 שעות, 5% אחרי 4 שעות, ואפס אחרי 5. גלים חופפים מצטברים. חלבון ושומן שנאכלו סמוך לפריט מרככים את הגל עד 30% (הריכוך יורד עם המרחק בזמן, עד שעה). הגל הראשון של היום מוגבר ב-15%. הרפים והיעד היומי מחולקים ב-1.2 משבוע 20 וב-1.4 משבוע 28, בגלל התנגודת לאינסולין של ההריון. הליכה שמתחילה עד שעתיים וחצי אחרי ארוחה מרככת את הגל שלה (1.5% לדקה בקצב קל, 2% בבינוני, עד 30–40%), והקו המנוקד מראה איך זה היה נראה בלעדיה. הרף 20 הוא הסיווג המקובל ל"ארוחה בעומס גבוה"; 10–20 בינוני; "זמן מעל הרף" מודד כמה זמן העקומה שהתה מעליו (מדד יציב יותר מספירת פיקים, שנשברת כששני גלים מתאחדים); המד המצטבר מסכם את כל הארוחות מול יעד אישי: כל הפחמימות שמגיעות לך ביום (45% מיעד הקלוריות לטרימסטר, פחות יעד הסיבים) באינדקס ממוצע 50 — הסף לתזונה בעלת אינדקס נמוך שנבדקה בהריון. ברגישות לסוכר היעד יורד (תקרת פחמימות, אינדקס 45). עד היעד ירוק, עד 125% כתום, מעבר אדום. לשם השוואה, הסיווג הכללי למבוגר: עד 80 נמוך, מעל 120 גבוה. האינדקס מגיע מטבלאות כלליות, משדה "אינדקס גליקמי" במאכלים שלך, ולמאכל חד-פעמי שאינו במאגר — מהערכה לפי הפחמימות והסיבים בלבד (השומן נספר רק פעם אחת, בריכוך). זו הערכה — לא מדידת סוכר, ותגובת הגוף משתנה בין אנשים ובהריון.</p></details>`;
  }

  // ------------------------------------------------------------ walking (activity)
  const WALK_MET = { light: 2.8, moderate: 3.5 };
  const WALK_HE = { light: "קלה", moderate: "בינונית" };
  const WALK_TIMER_KEY = "walk_timer_v1";
  function dayWalks(day) { return ((day && day.walks) || []).filter((w) => w.start && Number(w.minutes) > 0).map((w) => Object.assign({}, w, { t: toMin(w.start), minutes: Number(w.minutes) || 0 })).sort((a, b) => a.t - b.t); }
  // Post-meal walking flattens the glucose curve: ~1.5%/min light, 2%/min moderate (capped at 30% / 40%).
  // Applies to meals eaten up to 2.5 h before the walk started; the effect builds up during the walk and stays for the tail.
  function walkFactor(e, t, walks) {
    let f = 1;
    (walks || []).forEach((w) => {
      if (w.t < e.t || w.t - e.t > 150 || t <= w.t) return;
      const eff = Math.min(w.pace === "moderate" ? 0.4 : 0.3, (w.pace === "moderate" ? 0.02 : 0.015) * w.minutes);
      f *= 1 - eff * clamp((t - w.t) / Math.max(5, w.minutes), 0, 1);
    });
    return f;
  }
  function walkKcal(w) { const kg = pregCtx().weightKg || 64; return (WALK_MET[w.pace] || 3) * kg * (w.minutes / 60); }
  function readTimer() { try { const s = localStorage.getItem(WALK_TIMER_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function writeTimer(v) { try { if (v) localStorage.setItem(WALK_TIMER_KEY, JSON.stringify(v)); else localStorage.removeItem(WALK_TIMER_KEY); } catch (e) {} }
  function israelTimeOf(ms) {
    try { const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(ms)); return `${pad(Number(p.find((x) => x.type === "hour").value) % 24)}:${p.find((x) => x.type === "minute").value}`; }
    catch (e) { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  }
  function addWalk(dateKey, start, minutes, pace, outdoors, cover) {
    const day = getDay(dateKey); day.walks = day.walks || [];
    const w = { id: uid("w"), start, minutes: Math.max(1, Math.round(minutes)), pace: pace || "moderate", outdoors: !!outdoors };
    day.walks.push(w); day.walks.sort((a, b) => toMin(a.start) - toMin(b.start));
    if (outdoors) addSun(dateKey, start, w.minutes, cover || "arms_face", w.id, false);
    saveDay(dateKey); return w;
  }
  function timerText(t) { const secs = Math.max(0, Math.floor((Date.now() - t.startedAt) / 1000)); return `${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`; }
  function walkCardHtml(day, isToday) { return `<div class="card" id="walk-card">${walkCardInner(day, isToday)}</div>`; }
  function walkCardInner(day, isToday) {
    const walks = dayWalks(day), timer = isToday ? readTimer() : null, now = israelNow();
    const total = walks.reduce((a, w) => a + w.minutes, 0), longest = walks.reduce((a, w) => Math.max(a, w.minutes), 0);
    const kcal = walks.reduce((a, w) => a + walkKcal(w), 0);
    const pill = total ? `<span class="status-pill ${total >= 20 ? "st-good" : "st-info"}">${total} דק' · ${walks.length} ${walks.length === 1 ? "מקטע" : "מקטעים"}</span>` : "";
    const form = (startVal) => `<div class="inline-form" style="margin-top:10px">
        <div class="field short"><label for="wk-min">דקות</label><input id="wk-min" type="number" min="1" max="240" value="15" style="min-height:36px;padding:4px 8px"></div>
        <div class="field short"><label for="wk-start">התחלה</label><input id="wk-start" type="time" value="${startVal}" style="min-height:36px;padding:4px 8px"></div>
        <div class="field short"><label for="wk-pace">קצב</label><select id="wk-pace" style="min-height:36px;padding:4px 8px"><option value="light">קלה</option><option value="moderate" selected>בינונית</option></select></div>
        <div class="field short" style="flex-basis:110px"><label>&nbsp;</label><label style="margin:0;line-height:36px"><input type="checkbox" id="wk-out" checked style="vertical-align:middle;margin-inline-end:6px">בחוץ</label></div>
        <button class="btn sm" data-act="walk-add">הוסיפי</button>
      </div>`;
    let entry = "";
    if (timer) {
      entry = `<div class="walk-timer">
        <div class="clock num" id="walk-timer">${timerText(timer)}</div>
        <div class="grow"><div class="eyebrow">הולכת מ-${israelTimeOf(timer.startedAt)}</div>
          <div class="seg" style="margin-top:6px">${["light", "moderate"].map((p) => `<button class="${timer.pace === p ? "on" : ""}" data-act="timer-pace" data-p="${p}">${WALK_HE[p]}</button>`).join("")}</div>
          <label style="margin-top:8px"><input type="checkbox" data-act="timer-outdoors" ${timer.outdoors ? "checked" : ""} style="vertical-align:middle;margin-inline-end:6px">בחוץ, בשמש (יירשם גם כחשיפה לשמש)</label></div>
        <div class="stack" style="gap:6px"><button class="btn primary" data-act="walk-stop">סיימתי</button><button class="btn sm ghost" data-act="walk-cancel">ביטול</button></div>
      </div>`;
    } else if (isToday) {
      entry = `<div class="row" style="gap:10px"><button class="btn primary" data-act="walk-start">▶ התחלתי ללכת</button><span class="help">טיימר חי — ממשיך גם אם הדף נסגר</span></div>${form(minStr(now.min - 15))}`;
    } else entry = form("12:00");
    const notes = [];
    if (longest > 45) notes.push(`<div class="note warn" style="margin-top:8px">מקטע של ${longest} דק' — הליכה מותרת, אבל עם צוואר רחם קצר עדיף מקטעים קצרים יותר וישיבה ביניהם. אם היה נוח — בסדר.</div>`);
    else if (total > 90) notes.push(`<div class="note info" style="margin-top:8px">יותר מ-90 דק' הליכה היום — מצוין אם הרגשת טוב. אחרי כל מקטע לשבת, לא לעמוד.</div>`);
    const list = walks.length ? `<div class="list" style="margin-top:8px">${walks.map((w) => `<div class="item"><div class="grow"><div class="title">${w.minutes} דק' · ${WALK_HE[w.pace] || ""}${w.outdoors ? " · בחוץ ☀" : ""}</div><div class="meta">${w.start}–${minStr(w.t + w.minutes)} · ~${fmt(walkKcal(w), 0)} קק"ל</div></div><button class="iconbtn" data-act="walk-del" data-id="${w.id}" aria-label="מחיקה">✕</button></div>`).join("")}</div>` : `<p class="help" style="margin-top:8px">עדיין לא נרשמה הליכה ${isToday ? "היום" : "בתאריך זה"}.</p>`;
    return `<div class="card-head"><h2>תנועה — הליכה</h2>${pill}</div>
      ${entry}
      ${notes.join("")}
      ${list}
      ${total ? `<p class="small ink2" style="margin-top:6px">סה"כ ${total} דק' · ~${fmt(kcal, 0)} קק"ל (מידע בלבד — לא משנה את יעד הקלוריות). הליכה אחרי ארוחה מרככת את הפיק בגרף שלמעלה.</p>` : ""}
      ${sitBlockHtml(isToday)}
      <details style="margin-top:8px"><summary class="help" style="cursor:pointer">מה מותר ומה לא (לפי ההנחיות שלך)</summary><p class="help" style="margin-top:6px">הליכה מותרת. אסור: מאמץ גבוה ועמידה ממושכת. מבחן הדיבור: אם אפשר לדבר משפט שלם בלי להתנשף — הקצב בסדר; אם קשה לדבר — להאט. אחרי הליכה לשבת, לא לעמוד. הליכה של 10–20 דק' שמתחילה 15–45 דק' אחרי ארוחה נותנת את רוב התועלת לסוכר. לעצור אם יש התכווצויות, לחץ באגן או דימום, ולפנות לרופא/ה. חישוב הקלוריות: 2.8 MET לקצב קל, 3.5 לבינוני, לפי המשקל האחרון.</p></details>`;
  }
  // ------------------------------------------------------------ sitting breaks (desk work; short cervix → move a little, often)
  // Local only (localStorage), like the walk timer. A compact per-day summary {breaks, longest, every} is kept in day.sit.
  const SIT_KEY = "sit_timer_v1", SIT_EVERY = [30, 45, 60], SIT_DEFAULT = 45;
  function readSit() { try { const s = localStorage.getItem(SIT_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function writeSit(v) { try { if (v) localStorage.setItem(SIT_KEY, JSON.stringify(v)); else localStorage.removeItem(SIT_KEY); } catch (e) {} }
  function sitState() { const s = readSit(), key = dateKeyOf(new Date()); if (s && s.day === key) return s; return { day: key, every: (s && s.every) || SIT_DEFAULT, breaks: 0, longest: 0, startedAt: null, paused: false, alerted: false }; }
  function sitMinutes(s) { return s && s.startedAt ? (Date.now() - s.startedAt) / 60000 : 0; }
  function sitPersist(s) { const day = getDay(s.day); const cur = day.sit || {}; if (cur.breaks === s.breaks && Math.round(cur.longest || 0) === Math.round(s.longest || 0) && cur.every === s.every) return; day.sit = { breaks: s.breaks || 0, longest: Math.round(s.longest || 0), every: s.every }; saveDay(s.day); }
  function sitStart() { const s = sitState(); s.startedAt = Date.now(); s.paused = false; s.alerted = false; writeSit(s); }
  function sitBreak() { const s = sitState(); if (!s.startedAt) return; s.longest = Math.max(s.longest || 0, sitMinutes(s)); s.breaks = (s.breaks || 0) + 1; s.startedAt = Date.now(); s.alerted = false; writeSit(s); sitPersist(s); }
  function sitStop() { const s = sitState(); if (s.startedAt) s.longest = Math.max(s.longest || 0, sitMinutes(s)); s.startedAt = null; s.paused = false; s.alerted = false; writeSit(s); sitPersist(s); }
  function sitPauseForWalk() { const s = sitState(); if (!s.startedAt) return; s.longest = Math.max(s.longest || 0, sitMinutes(s)); s.breaks = (s.breaks || 0) + 1; s.startedAt = null; s.paused = true; s.alerted = false; writeSit(s); sitPersist(s); }
  function sitResumeAfterWalk() { const s = sitState(); if (!s.paused) return; s.startedAt = Date.now(); s.paused = false; s.alerted = false; writeSit(s); }
  function sitOverdue() { const s = sitState(); const m = sitMinutes(s); if (!s.startedAt || m < s.every) return null; return `כבר ${Math.round(m)} דק' בישיבה רצופה — קמי ל-2–3 דקות של תנועה קלה (כמה צעדים, כוס מים), ואז חזרי לשבת.`; }
  function sitBlockHtml(isToday) {
    if (!isToday) return "";
    const s = sitState(), m = sitMinutes(s);
    const summary = s.breaks || s.longest ? `<p class="small ink2" style="margin-top:6px">היום: ${s.breaks} ${s.breaks === 1 ? "הפסקת קימה" : "הפסקות קימה"} · הרצף הארוך ביותר ${Math.round(Math.max(s.longest || 0, s.startedAt ? m : 0))} דק'.</p>` : "";
    const seg = `<div class="seg">${SIT_EVERY.map((e) => `<button class="${s.every === e ? "on" : ""}" data-act="sit-every" data-m="${e}">${e}</button>`).join("")}</div>`;
    let body;
    if (s.startedAt) {
      const over = m >= s.every, soon = !over && m >= s.every - 10;
      body = `<div class="walk-timer">
        <div class="clock num ${over ? "over" : ""}" id="sit-timer">${timerText({ startedAt: s.startedAt })}</div>
        <div class="grow"><div class="eyebrow">יושבת מ-${israelTimeOf(s.startedAt)} · תזכורת כל <span class="num">${s.every}</span> דק'</div>
          <div class="row" style="gap:8px;margin-top:6px"><span class="help">תזכורת כל:</span>${seg}<span class="help">דק'</span></div></div>
        <div class="stack" style="gap:6px"><button class="btn primary" data-act="sit-break">קמתי לרגע</button><button class="btn sm ghost" data-act="sit-stop">סיימתי לשבת</button></div>
      </div>
      ${over ? `<div class="note alert" id="sit-alert" style="margin-top:8px"><div>${esc(sitOverdue())} <button class="btn sm" data-act="walk-start" style="margin-inline-start:6px">▶ התחלתי ללכת</button></div></div>` : soon ? `<div class="note info" style="margin-top:8px">עוד ~${Math.max(1, Math.round(s.every - m))} דק' תזכורת לקום.</div>` : ""}`;
    } else if (s.paused) {
      body = `<div class="note info">הישיבה מושהית בזמן ההליכה — הספירה תתחדש כשתסיימי. <button class="btn sm ghost" data-act="sit-stop" style="margin-inline-start:6px">סיימתי לשבת</button></div>`;
    } else {
      body = `<div class="row" style="gap:10px"><button class="btn sm" data-act="sit-start">🪑 התחלתי לשבת (עבודה)</button><span class="help">תזכורת לקום כל</span>${seg}<span class="help">דק' — רצה גם אם הדף נסגר</span></div>`;
    }
    return `<div class="sit-block" id="sit-block"><h3>ישיבה ממושכת</h3>${body}${summary}
      <details style="margin-top:6px"><summary class="help" style="cursor:pointer">למה זה חשוב</summary><p class="help" style="margin-top:6px">ישיבה רצופה מעלה סיכון לקרישי דם ברגליים ומכבידה על האגן. ההמלצה המקובלת בהריון: כל 30–60 דק' לקום ל-2–3 דקות של תנועה קלה — כמה צעדים, סיבוב בבית, כוס מים — ולחזור לשבת (לא עמידה ממושכת). ההפסקה נספרת גם כשמתחילים הליכה מהטיימר למעלה.</p></details></div>`;
  }
  let sitTickRender = 0;
  setInterval(() => {
    const el = $("walk-timer"), t = readTimer(); if (el && t) el.textContent = timerText(t);
    const st = $("sit-timer"), s = readSit();
    if (st && s && s.startedAt) st.textContent = timerText({ startedAt: s.startedAt });
    if (s && s.startedAt && s.day === dateKeyOf(new Date()) && !s.alerted && sitMinutes(s) >= s.every) {
      s.alerted = true; writeSit(s);
      try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
      toast(`${s.every} דק' בישיבה — זמן לקום לרגע`);
      if (!document.querySelector(".modal-bg") && App.tab === "today" && App.date === s.day && Date.now() - sitTickRender > 5000) { sitTickRender = Date.now(); const wc = $("walk-card"); if (wc) wc.innerHTML = walkCardInner(getDay(App.date), true); const nc = $("now-card"); if (nc) nc.innerHTML = nowCardHtml(); }
    }
  }, 1000);

  // ------------------------------------------------------------ sun (vitamin D)
  const SUN_DEFAULT = { lat: 32.08, lon: 34.78 };
  const SKIN_MED = { 1: 200, 2: 250, 3: 350, 4: 450, 5: 600, 6: 1000 }; // erythemal J/m² per skin type (Fitzpatrick)
  const SKIN_HE = { 1: "I — בהיר מאוד, נשרף תמיד", 2: "II — בהיר, נשרף בקלות", 3: "III — בינוני (הנפוץ בישראל)", 4: "IV — זית", 5: "V — כהה", 6: "VI — כהה מאוד" };
  const COVER = { arms_face: { he: "ידיים ופנים", frac: 0.12, dose: 0.4 }, arms_legs: { he: "ידיים ורגליים", frac: 0.3, dose: 0.25 } };
  const CLOUD_F = { clear: 1, partly: 0.7, cloudy: 0.4 }, CLOUD_HE = { clear: "בהיר", partly: "מעונן חלקית", cloudy: "מעונן" };
  function sunCfg() { const p = (App.state.profile && App.state.profile.sun) || {}; return { lat: Number(p.lat) || SUN_DEFAULT.lat, lon: Number(p.lon) || SUN_DEFAULT.lon, skin: clamp(Number(p.skin) || 3, 1, 6) }; }
  function dayCloud(day) { return (day && day.sun_cloud) || "clear"; }
  function israelTzOffset(date) {
    try { const s = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", timeZoneName: "shortOffset" }).formatToParts(date).find((x) => x.type === "timeZoneName").value; const m = /GMT([+-]\d+)/.exec(s); if (m) return Number(m[1]); } catch (e) {}
    const mo = date.getMonth(); return mo >= 3 && mo <= 9 ? 3 : 2;
  }
  // Solar elevation (degrees) at Israel clock time `min` on date `key` — NOAA low-precision algorithm.
  function solarElevation(key, min) {
    const d = parseKey(key), doy = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
    const { lat, lon } = sunCfg(), tz = israelTzOffset(d);
    const g = (2 * Math.PI / 365) * (doy - 1 + (min / 60 - 12) / 24);
    const eot = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const tst = min + eot + 4 * lon - 60 * tz;
    const ha = (tst / 4 - 180) * Math.PI / 180, latR = lat * Math.PI / 180;
    const cosZ = Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(ha);
    return Math.asin(clamp(cosZ, -1, 1)) * 180 / Math.PI;
  }
  // Clear-sky UV index from solar elevation (empirical fit for mid-latitudes), times a manual cloud factor.
  function uviAt(key, min, cloud) { const el = solarElevation(key, min); if (el <= 0) return 0; return 11.8 * Math.pow(Math.sin(el * Math.PI / 180), 2.3) * (CLOUD_F[cloud || "clear"] || 1); }
  function minutesTo(uvi, medFrac) { const med = SKIN_MED[sunCfg().skin] || 350; return uvi > 0.2 ? (med * medFrac) / (1.5 * uvi) : null; }
  function sunIU(e) { const c = COVER[e.cover] || COVER.arms_face, med = SKIN_MED[sunCfg().skin] || 350; const dose = (1.5 * (Number(e.uvi) || 0) * (Number(e.minutes) || 0)) / med; return 20000 * c.frac * Math.min(1, dose); }
  function addSun(dateKey, start, minutes, cover, walkId, save) {
    const day = getDay(dateKey); day.sun = day.sun || [];
    const mid = toMin(start) + minutes / 2;
    day.sun.push({ id: uid("sun"), start, minutes: Math.max(1, Math.round(minutes)), cover: cover || "arms_face", uvi: Math.round(uviAt(dateKey, mid, dayCloud(day)) * 10) / 10, walk_id: walkId || null });
    day.sun.sort((a, b) => toMin(a.start) - toMin(b.start));
    if (save !== false) saveDay(dateKey);
  }
  function sunWindow(key, cloud) { let first = null, last = null; for (let m = 5 * 60; m <= 19 * 60; m += 10) { if (uviAt(key, m, cloud) >= 3) { if (first == null) first = m; last = m; } } return first == null ? null : { start: first, end: last + 10 }; }
  function sunStatus(day, isToday) {
    const key = App.date, cloud = dayCloud(day), now = israelNow();
    const uviNow = uviAt(key, now.min, cloud), win = sunWindow(key, cloud);
    let peak = { v: 0, m: 12 * 60 }; for (let m = 9 * 60; m <= 16 * 60; m += 10) { const u = uviAt(key, m, cloud); if (u > peak.v) peak = { v: u, m }; }
    const tAL = minutesTo(uviNow, COVER.arms_legs.dose), tAF = minutesTo(uviNow, COVER.arms_face.dose), tMED = minutesTo(uviNow, 1);
    const lvl = uviNow < 3 ? "low" : uviNow < 6 ? "mid" : uviNow < 8 ? "high" : "vhigh";
    const pill = `<span class="status-pill ${lvl === "low" ? "st-info" : lvl === "mid" ? "st-good" : lvl === "high" ? "st-warn" : "st-bad"}">UV ${fmt(uviNow, 1)} עכשיו · ${{ low: "חלש", mid: "בינוני", high: "גבוה", vhigh: "גבוה מאוד" }[lvl]}</span>`;
    let rec;
    if (!isToday) rec = win ? `חלון שמש בתאריך זה: ${minStr(win.start)}–${minStr(win.end)} (UV 3 ומעלה), שיא ~${fmt(peak.v, 1)} ב-${minStr(peak.m)}.` : "בתאריך זה השמש לא מגיעה ל-UV 3 — ייצור ויטמין D זניח.";
    else if (uviNow < 3) rec = win ? (now.min < win.start ? `השמש עדיין חלשה לוויטמין D. החלון היום: ${minStr(win.start)}–${minStr(win.end)}, שיא ~${fmt(peak.v, 1)} ב-${minStr(peak.m)}.` : `חלון השמש של היום (${minStr(win.start)}–${minStr(win.end)}) נגמר. מחר שוב.`) : "היום השמש לא מגיעה ל-UV 3 (עונה או עננות) — ייצור ויטמין D זניח; התוסף הוא המקור.";
    else rec = `זמן טוב לוויטמין D: ~${fmt(tAL, 0)} דק' עם ידיים ורגליים חשופות, או ~${fmt(tAF, 0)} דק' עם ידיים ופנים. סף אדמומיות בקצב הזה: ~${fmt(tMED, 0)} דק' — לא לעבור.${uviNow >= 8 ? " UV גבוה מאוד: עדיף בקצוות החלון, כובע ומים, והפנים בצל (כתמי הריון)." : " פנים בצל או כובע — עור הפנים נוטה לכתמים בהריון."}`;
    return { pill, rec, uviNow, win, peak };
  }
  function sunCardHtml(day, isToday) { return `<div class="card" id="sun-card">${sunCardInner(day, isToday)}</div>`; }
  function sunCardInner(day, isToday) {
    const cfg = sunCfg(), cloud = dayCloud(day), now = israelNow(), st = sunStatus(day, isToday);
    const logs = ((day && day.sun) || []).slice().sort((a, b) => toMin(a.start) - toMin(b.start));
    const iu = logs.reduce((a, e) => a + sunIU(e), 0), mins = logs.reduce((a, e) => a + (Number(e.minutes) || 0), 0);
    return `<div class="card-head"><h2>שמש — ויטמין D</h2><span id="sun-pill">${st.pill}</span></div>
      <p class="small" id="sun-rec">${esc(st.rec)}</p>
      <div class="row" style="margin-top:8px;gap:8px"><span class="help">עננות עכשיו:</span><div class="seg">${Object.keys(CLOUD_HE).map((c) => `<button class="${cloud === c ? "on" : ""}" data-act="sun-cloud" data-c="${c}">${CLOUD_HE[c]}</button>`).join("")}</div></div>
      <div class="inline-form" style="margin-top:10px">
        <div class="field short"><label for="sn-start">התחלה</label><input id="sn-start" type="time" value="${minStr(now.min - 10)}" style="min-height:36px;padding:4px 8px"></div>
        <div class="field" style="flex:0 1 160px"><label for="sn-cover">מה חשוף</label><select id="sn-cover" style="min-height:36px;padding:4px 8px">${Object.keys(COVER).map((k) => `<option value="${k}">${COVER[k].he}</option>`).join("")}</select></div>
        <div class="field" style="flex:1 1 170px"><label>רשמי חשיפה</label><div class="row" style="gap:6px">${["5", "10", "15"].map((m) => `<button class="btn sm" data-act="sun-add" data-min="${m}">+${m} דק'</button>`).join("")}</div></div>
      </div>
      ${logs.length ? `<div class="list" style="margin-top:8px">${logs.map((e) => `<div class="item"><div class="grow"><div class="title">${e.minutes} דק' · ${(COVER[e.cover] || COVER.arms_face).he}${e.walk_id ? " · מהליכה" : ""}</div><div class="meta">${e.start} · UV ~${fmt(e.uvi, 1)} · ≈ ${fmt(sunIU(e), 0)} יח' (${fmt(sunIU(e) / 40, 0)} מק"ג) ויטמין D</div></div><button class="iconbtn" data-act="sun-del" data-id="${e.id}" aria-label="מחיקה">✕</button></div>`).join("")}</div>
      <p class="small ink2" style="margin-top:6px">${isToday ? "היום" : "בתאריך זה"}: ${mins} דק' בשמש · ≈ ${fmt(iu, 0)} יח' (${fmt(iu / 40, 0)} מק"ג) ויטמין D מהעור — הערכה גסה, לא נכנסת לחישוב הרכיבים.</p>` : `<p class="help" style="margin-top:8px">הליכה שסומנה "בחוץ" נרשמת כאן אוטומטית.</p>`}
      <details style="margin-top:8px"><summary class="help" style="cursor:pointer">הגדרות ואיך זה מחושב</summary>
        <div class="inline-form" style="margin-top:8px">
          <div class="field" style="flex:1 1 220px"><label for="sn-skin">סוג עור (פיצפטריק)</label><select id="sn-skin" data-act="sun-skin" style="min-height:36px;padding:4px 8px">${Object.keys(SKIN_HE).map((k) => `<option value="${k}" ${Number(k) === cfg.skin ? "selected" : ""}>${SKIN_HE[k]}</option>`).join("")}</select></div>
          <div class="field short"><label for="sn-lat">קו רוחב</label><input id="sn-lat" type="number" step="0.01" value="${cfg.lat}" data-act="sun-loc" data-k="lat" style="min-height:36px;padding:4px 8px"></div>
          <div class="field short"><label for="sn-lon">קו אורך</label><input id="sn-lon" type="number" step="0.01" value="${cfg.lon}" data-act="sun-loc" data-k="lon" style="min-height:36px;padding:4px 8px"></div>
        </div>
        <p class="help" style="margin-top:6px">מדד ה-UV מחושב מגובה השמש לפי תאריך, שעה ומיקום (ברירת מחדל: מרכז הארץ), בשמיים בהירים, כפול מקדם עננות ידני (0.7 מעונן חלקית, 0.4 מעונן). דקות היעד: כרבע מסף האדמומיות של סוג העור עם ידיים ורגליים חשופות, או כ-40% ממנו עם ידיים ופנים בלבד. הערכת ויטמין D: עד ~20,000 יח' לחשיפת גוף מלא בסף האדמומיות, לפי חלק הגוף החשוף והמנה. בלי שירות חיצוני. קרם הגנה, זכוכית וצל מאפסים את הייצור.</p>
      </details>`;
  }

  // ------------------------------------------------------------ report export (read-only)
  const REP_FIELDS = [
    ["preg", "פרטי הריון (שבוע, משקל, אבחנות)"], ["targets", "היעדים היומיים ומאיפה הם"], ["daily", "סיכום יומי של הרכיבים"],
    ["meals", "פירוט ארוחות (שעה, מאכל, כמות)"], ["mealNut", "ערכים לכל ארוחה"], ["supps", "תוספים — מה סומן בכל יום"],
    ["activity", "הליכה ושמש"], ["gl", "עומס גליקמי (מודל משוער)"], ["labs", "בדיקות מעבדה ומדידות סוכר"],
    ["notes", "הערות יומיות"], ["averages", "ממוצעים לתקופה מול היעדים"], ["sources", "מקורות עיקריים לכל רכיב מרכזי"], ["accuracy", "הערת דיוק — מקור הערכים"],
  ];
  const REP_PRESETS = {
    claude: { fields: { preg: 1, targets: 1, daily: 1, meals: 1, mealNut: 1, supps: 1, activity: 1, gl: 1, labs: 1, notes: 1, averages: 1, sources: 1, accuracy: 1 }, nutMode: "all", name: "" },
    nurse: { fields: { preg: 1, targets: 1, daily: 1, meals: 0, mealNut: 0, supps: 1, activity: 1, gl: 0, labs: 1, notes: 0, averages: 1, sources: 1, accuracy: 1 }, nutMode: "main", name: "" },
  };
  const REP_MAIN = ["kcal", "protein", "carbs", "fiber", "fat", "iron", "calcium", "sodium"];
  function repState() {
    if (!window._rep) {
      const prefs = (App.state.profile && App.state.profile.report_prefs) || {};
      const aud = "nurse";
      window._rep = Object.assign({ audience: aud, from: addDays(dateKeyOf(new Date()), -6), to: dateKeyOf(new Date()) }, JSON.parse(JSON.stringify(REP_PRESETS[aud])), prefs[aud] ? JSON.parse(JSON.stringify(prefs[aud])) : {});
    }
    return window._rep;
  }
  function repApplyAudience(aud) {
    const prefs = (App.state.profile && App.state.profile.report_prefs) || {};
    const r = repState();
    Object.assign(r, { audience: aud }, JSON.parse(JSON.stringify(REP_PRESETS[aud])), prefs[aud] ? JSON.parse(JSON.stringify(prefs[aud])) : {});
  }
  function repSavePrefs() {
    const r = repState();
    App.state.profile.report_prefs = Object.assign({}, App.state.profile.report_prefs || {}, { [r.audience]: { fields: r.fields, nutMode: r.nutMode, name: r.name || "" } });
    saveProfile();
  }
  function withDate(k, fn) { const prev = App.date; App.date = k; try { return fn(); } finally { App.date = prev; } }
  function reportModal(opts) {
    const r = repState();
    if (opts && opts.today) { r.from = r.to = dateKeyOf(new Date()); }
    if (opts && opts.audience) repApplyAudience(opts.audience);
    const days = []; for (let k = r.from; k <= r.to && days.length < 366; k = addDays(k, 1)) days.push(k);
    const logged = days.filter((k) => App.state.days[k] && ((App.state.days[k].meals || []).length || (App.state.days[k].walks || []).length || App.state.days[k].weight_kg));
    const canShare = typeof navigator !== "undefined" && !!navigator.share;
    openModal(`<h2>דוח תזונה לייצוא</h2>
      <p class="help">הדוח קורא בלבד ולא משנה כלום. הוא כולל רק את הטווח והשדות שסימנת. היסטוריית הצ'אט והסיסמה לעולם לא מיוצאות.</p>
      <h3 style="margin-top:12px">1. טווח</h3>
      <div class="row" style="margin-top:6px;gap:6px">${[["today", "היום"], ["7", "7 ימים"], ["14", "14 ימים"], ["30", "30 ימים"]].map(([v, l]) => `<button class="chip" data-act="rep-range" data-v="${v}">${l}</button>`).join("")}</div>
      <div class="inline-form" style="margin-top:8px"><div class="field short"><label for="rep-from">מתאריך</label><input id="rep-from" type="date" value="${r.from}" data-act="rep-date" data-k="from" style="min-height:36px;padding:4px 8px"></div><div class="field short"><label for="rep-to">עד תאריך</label><input id="rep-to" type="date" value="${r.to}" data-act="rep-date" data-k="to" style="min-height:36px;padding:4px 8px"></div><div class="field"><label>&nbsp;</label><span class="small ink2">${days.length} ימים · ${logged.length} עם רישום</span></div></div>
      <h3 style="margin-top:14px">2. למי</h3>
      <div class="seg" style="margin-top:6px">${[["nurse", "לאחות / רופא/ה"], ["claude", "לשיחה עם Claude"]].map(([v, l]) => `<button class="${r.audience === v ? "on" : ""}" data-act="rep-audience" data-v="${v}">${l}</button>`).join("")}</div>
      <p class="help" style="margin-top:4px">${r.audience === "nurse" ? "קליני וקצר: סיכומים, ממוצעים מול יעדים, תוספים, משקל ובדיקות. בלי הערות ובלי מודל משוער." : "מלא: כל מה שעוזר לי לייעץ, כולל הערכות ומקורות. בלי הצ'אט."}</p>
      <h3 style="margin-top:14px">3. שדות</h3>
      <div class="form-grid" style="margin-top:6px;grid-template-columns:repeat(auto-fill,minmax(230px,1fr))">${REP_FIELDS.map(([k, l]) => `<label style="margin:0;display:flex;align-items:center;gap:8px;color:var(--ink)"><input type="checkbox" data-act="rep-field" data-k="${k}" ${r.fields[k] ? "checked" : ""}>${l}</label>`).join("")}</div>
      <div class="inline-form" style="margin-top:10px">
        <div class="field" style="flex:0 1 200px"><label for="rep-nut">אילו רכיבים בסיכום היומי</label><select id="rep-nut" data-act="rep-nutmode" style="min-height:36px;padding:4px 8px"><option value="main" ${r.nutMode === "main" ? "selected" : ""}>עיקריים (8)</option><option value="all" ${r.nutMode === "all" ? "selected" : ""}>כל הרכיבים (${NUT.length})</option></select></div>
        <div class="field" style="flex:1 1 180px"><label for="rep-name">שם בכותרת (לא חובה)</label><input id="rep-name" value="${esc(r.name || "")}" data-act="rep-name" placeholder="ריק = בלי שם" style="min-height:36px;padding:4px 8px"></div>
      </div>
      <h3 style="margin-top:14px">4. הפקה</h3>
      <div class="row" style="margin-top:6px;gap:8px">
        <button class="btn primary" data-act="rep-print">📄 דף להדפסה / PDF</button>
        <button class="btn" data-act="rep-copy">העתק טקסט</button>
        <button class="btn" data-act="rep-download" data-fmt="md">הורד טקסט</button>
        <button class="btn" data-act="rep-download" data-fmt="csv">הורד CSV</button>
        ${canShare ? `<button class="btn" data-act="rep-share">שתף (וואטסאפ וכו')</button>` : ""}
      </div>
      <p class="help" style="margin-top:6px">דף להדפסה נפתח בחלון חדש; משם "הדפס → שמור כ-PDF". הטקסט מתאים להדבקה בשיחה רגילה איתי או לשליחה בהודעה.</p>
      <div class="actions"><button class="btn" data-act="modal-close">סגירה</button></div>`);
  }
  function foodSource(m) {
    const id = m.food_id || "";
    if (id.startsWith("g_")) return "מאגר כללי";
    const f = App.state.foods.find((x) => x.id === id);
    if (!f) return "הערכה";
    const n = f.label_notes || "";
    if (/תווית/.test(n)) return "תווית";
    if (f.kind === "recipe" || /מתכון|מהמרכיבים|מהמתכון/.test(n)) return "מתכון";
    if (/הערכה|מוערך|הונח/.test(n)) return "הערכה";
    return "מאכל אישי";
  }
  // Animal-source vitamin A (retinol) counts toward the upper limit; plant carotenoids do not.
  function isRetinolSource(m) { const f = foodById(m.food_id); if (!f || !f.generic) return false; return f.cat === "meat" || f.cat === "dairy" || NONVEGAN_DISHES.includes(f.id); }
  function reportData() {
    const r = repState();
    const days = []; for (let k = r.from; k <= r.to && days.length < 366; k = addDays(k, 1)) days.push(k);
    const nutKeys = r.nutMode === "all" ? NUT_KEYS : REP_MAIN;
    const supps = App.state.supplements.filter((s) => s.active !== false);
    const out = { r, days, nutKeys, supps, rows: [], labs: [], averages: null, preg: null, targets: null, sources: {}, topKeys: r.nutMode === "all" ? ["protein", "iron", "calcium", "carbs", "fat", "folate", "zinc", "magnesium"] : ["protein", "iron", "calcium", "carbs", "fat"] };
    const ctxEnd = withDate(r.to, () => pregCtx());
    const p = App.state.profile || {};
    out.preg = { week: ctxEnd.week, trimester: ctxEnd.trimester, height: p.height_cm, prepreg: p.prepreg_weight_kg, weight: ctxEnd.weightKg, gain: ctxEnd.gainKg, gainRange: ctxEnd.gainRange, bmi: ctxEnd.bmi, diet: p.diet_type, diagnoses: App.state.diagnoses.map((d) => (window.DIAGNOSES.find((x) => x.key === d.code) || { he: d.code }).he), due: p.due_date };
    out.targets = withDate(r.to, () => { const ctx = pregCtx(); const { targets, fired } = applyRules(ctx); const base = baseTargets(ctx); const ov = (App.state.targets && App.state.targets.overrides) || {}; return { base, adj: targets, ov, final: targetsFor(), notes: fired.filter((f) => f.text && f.changed).map((f) => f.text) }; });
    const sums = {}, fsums = {}, ssums = {}, tsums = {}; let nLogged = 0, nFull = 0;
    days.forEach((k) => {
      const day = App.state.days[k];
      const hasMeals = !!(day && (day.meals || []).length);
      const row = { k, hasMeals, day, tot: null, food: null, fromSupp: null, targets: null, supp: [], walks: dayWalks(day), sun: (day && day.sun) || [], weight: day && day.weight_kg, notes: day && day.notes, glucose: (day && day.glucose) || [], gl: null, week: null, nMeals: hasMeals ? day.meals.length : 0, full: false, retinol: 0, top: {} };
      row.week = withDate(k, () => pregCtx().week);
      if (day) {
        withDate(k, () => {
          row.targets = targetsFor();
          const split = dayTotals(k, { split: true }); row.tot = split.tot; row.fromSupp = split.fromSupp; row.food = dayTotals(k, { includeSupplements: false });
          row.full = hasMeals && row.nMeals >= 3 && (row.food.kcal || 0) >= 0.6 * (row.targets.kcal || 2000);
          if (hasMeals) {
            row.retinol = day.meals.reduce((a, m) => a + (isRetinolSource(m) ? (m.nutrients.vitA || 0) : 0), 0);
            const agg = {}; day.meals.forEach((m) => { agg[m.name] = agg[m.name] || {}; Object.keys(m.nutrients || {}).forEach((n) => { agg[m.name][n] = (agg[m.name][n] || 0) + m.nutrients[n]; }); });
            out.topKeys.forEach((n) => { row.top[n] = Object.keys(agg).map((name) => ({ name, v: agg[name][n] || 0 })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 3); });
          }
          row.supp = supps.map((s) => ({ name: s.name, taken: suppTaken(day, s), doses: suppDoses(s) }));
          if (hasMeals) {
            const entries = glEntries(day), walks = row.walks, thr = glThr(), clusters = glClusters(day).clusters;
            const ta = glTimeAbove(entries, walks, thr, 5 * 60, 27 * 60, 5);
            row.gl = { peak: ta.peak.v, peakAt: minStr(ta.peak.t), minsHigh: ta.hi, minsMid: ta.mid, hi: thr.hi, total: entries.reduce((a, e) => a + e.gl, 0), target: glDailyTarget().target, meals: clusters.filter((c) => c.net > 0).map((c) => ({ time: minStr(c.start), kind: MEAL_KIND_HE[c.kind], net: c.net, cap: c.cap, level: c.capLevel })) };
          }
        });
        if (hasMeals) nLogged++;
        if (row.full) { nFull++; NUT_KEYS.forEach((n) => { sums[n] = (sums[n] || 0) + (row.tot[n] || 0); fsums[n] = (fsums[n] || 0) + (row.food[n] || 0); ssums[n] = (ssums[n] || 0) + (row.fromSupp[n] || 0); tsums[n] = (tsums[n] || 0) + (row.targets[n] || 0); }); }
        (day.meals || []).forEach((m) => { const src = foodSource(m); out.sources[src] = out.sources[src] || new Set(); out.sources[src].add(m.name); });
      }
      out.rows.push(row);
    });
    out.nLogged = nLogged; out.nFull = nFull;
    if (nFull) out.averages = { n: nFull, avg: Object.fromEntries(NUT_KEYS.map((n) => [n, sums[n] / nFull])), food: Object.fromEntries(NUT_KEYS.map((n) => [n, fsums[n] / nFull])), supp: Object.fromEntries(NUT_KEYS.map((n) => [n, ssums[n] / nFull])), pct: Object.fromEntries(NUT_KEYS.map((n) => [n, tsums[n] ? sums[n] / tsums[n] : null])) };
    out.suppKeys = NUT_KEYS.filter((n) => out.rows.some((x) => x.fromSupp && (x.fromSupp[n] || 0) > 0));
    out.labs = App.state.labs.filter((l) => l.date && l.date >= r.from && l.date <= r.to).sort((a, b) => a.date.localeCompare(b.date));
    out.latestLabs = Object.values(ctxEnd.labs || {});
    return out;
  }
  const repDate = (k) => { const d = parseKey(k); return `${DAYS_HE[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}`; };
  const repTitle = (d) => `דוח תזונה ${d.r.from === d.r.to ? repDate(d.r.from) + "." + parseKey(d.r.from).getFullYear() : fmtDate(d.r.from) + " – " + fmtDate(d.r.to) + "." + parseKey(d.r.to).getFullYear()}`;
  function repSubtitle(d) { const parts = []; if (d.r.name) parts.push(d.r.name); const w0 = d.rows[0] && d.rows[0].week, w1 = d.preg.week; if (w1 != null) parts.push(w0 != null && w0 !== w1 ? `שבועות הריון ${w0}–${w1} (טרימסטר ${d.preg.trimester})` : `שבוע הריון ${w1} (טרימסטר ${d.preg.trimester})`); if (d.preg.diet && d.preg.diet !== "omnivore") parts.push(d.preg.diet === "vegan" ? "תזונה טבעונית" : "תזונה צמחונית"); parts.push(`הופק ${fmtDate(dateKeyOf(new Date()))}.${new Date().getFullYear()}`); return parts.join(" · "); }
  // ---- Markdown / plain text
  function reportText(d) {
    const f = d.r.fields, L = [];
    const pctTxt = (v, t) => (t ? ` (${Math.round((v / t) * 100)}%)` : "");
    L.push(`# ${repTitle(d)}`); L.push(repSubtitle(d)); L.push("");
    if (f.preg) {
      L.push("## פרטי הריון");
      if (d.preg.due) L.push(`- תאריך לידה משוער: ${fmtDate(d.preg.due)}.${parseKey(d.preg.due).getFullYear()}`);
      if (d.preg.height) L.push(`- גובה ${d.preg.height} ס"מ · משקל לפני ההריון ${d.preg.prepreg || "?"} ק"ג${d.preg.bmi ? ` · BMI ${d.preg.bmi.toFixed(1)}` : ""}`);
      if (d.preg.weight) L.push(`- משקל אחרון ${d.preg.weight} ק"ג${d.preg.gain != null ? ` · עלייה ${d.preg.gain.toFixed(1)} ק"ג` : ""}${d.preg.gainRange ? ` · טווח IOM לשבוע: ${d.preg.gainRange.expectedMin.toFixed(1)}–${d.preg.gainRange.expectedMax.toFixed(1)}` : ""}`);
      const w = d.rows.filter((x) => x.weight); if (w.length) L.push(`- שקילות בטווח: ${w.map((x) => `${fmtDate(x.k)}: ${x.weight}`).join(", ")}`);
      if (d.preg.diagnoses.length) L.push(`- אבחנות/מצבים: ${d.preg.diagnoses.join(", ")}`);
      L.push("");
    }
    if (f.targets) {
      L.push("## יעדים יומיים"); L.push("| רכיב | בסיס | מותאם | ידני |"); L.push("|---|---|---|---|");
      d.nutKeys.forEach((n) => { const m = NUT_BY[n]; L.push(`| ${m.he} (${m.unit}) | ${fmt(d.targets.base[n])} | ${fmt(d.targets.adj[n])} | ${d.targets.ov[n] != null ? fmt(d.targets.ov[n]) : "–"} |`); });
      if (d.targets.notes.length) L.push("התאמות: " + d.targets.notes.join(" | "));
      L.push("");
    }
    const dash = (n) => Array.from({ length: n }, () => "—").join(" | ");
    if (f.daily) {
      L.push("## סיכום יומי — ממזון בלבד (% מהיעד; תוספים בטבלה נפרדת)");
      L.push(`| תאריך | שבוע | ארוחות | רישום | ${d.nutKeys.map((n) => NUT_BY[n].he).join(" | ")} |`); L.push(`|---|---|---|---|${d.nutKeys.map(() => "---").join("|")}|`);
      d.rows.forEach((x) => { if (!x.hasMeals) { L.push(`| ${repDate(x.k)} | ${x.week != null ? x.week : "—"} | 0 | אין רישום | ${dash(d.nutKeys.length)} |`); return; } L.push(`| ${repDate(x.k)} | ${x.week} | ${x.nMeals} | ${x.full ? "מלא" : "חלקי"} | ${d.nutKeys.map((n) => `${fmt(x.food[n] || 0)}${NUT_BY[n].kind === "limit" ? "" : pctTxt(x.food[n] || 0, x.targets[n])}`).join(" | ")} |`); });
      L.push(`"מלא" = לפחות 3 ארוחות ולפחות 60% מיעד הקלוריות ממזון; "חלקי" = רישום לא שלם (לא נכנס לממוצעים). יום בלי רישום ויום שלא קיים במערכת מופיעים אותו דבר.`);
      if (d.suppKeys.length) {
        L.push(""); L.push("### תרומת התוספים שסומנו (בנוסף למזון)");
        L.push(`| תאריך | ${d.suppKeys.map((n) => NUT_BY[n].he).join(" | ")} |`); L.push(`|---|${d.suppKeys.map(() => "---").join("|")}|`);
        d.rows.forEach((x) => { if (!x.day || (!x.hasMeals && !x.supp.some((q) => q.taken))) { L.push(`| ${repDate(x.k)} | ${dash(d.suppKeys.length)} |`); return; } L.push(`| ${repDate(x.k)} | ${d.suppKeys.map((n) => fmt(x.fromSupp[n] || 0)).join(" | ")} |`); });
      }
      if (d.nutKeys.includes("vitA")) {
        const totA = d.rows.reduce((a, x) => a + (x.food ? (x.food.vitA || 0) : 0), 0), ret = d.rows.reduce((a, x) => a + x.retinol, 0);
        L.push(""); L.push(`ויטמין A ממזון: ${ret <= 0 ? "כולו קרוטנואידים צמחיים (בטא-קרוטן מגזר, בטטה, ירקות כתומים/ירוקים) — לא נספר לגבול העליון של 3,000 מק\"ג, שחל על רטינול בלבד." : `מתוכו רטינול (מהחי) ~${fmt(ret, 0)} מק\"ג מתוך ${fmt(totA, 0)} בטווח; רק הרטינול נספר לגבול העליון.`}${d.suppKeys.includes("vitA") ? " ויטמין A מהמולטי: לפי התווית (בטא-קרוטן)." : ""}`);
      }
      L.push("");
    }
    if (f.averages) {
      if (d.averages) {
        L.push(`## ממוצע לתקופה — ${d.averages.n} ימים מלאים${d.nLogged > d.averages.n ? ` (${d.nLogged - d.averages.n} ימים חלקיים לא נכללו)` : ""}`); L.push("| רכיב | ממוצע ממזון | ממוצע מתוספים | סה\"כ | % מהיעד (סה\"כ) |"); L.push("|---|---|---|---|---|");
        d.nutKeys.forEach((n) => { const p = d.averages.pct[n]; L.push(`| ${NUT_BY[n].he} (${NUT_BY[n].unit}) | ${fmt(d.averages.food[n])} | ${d.averages.supp[n] ? fmt(d.averages.supp[n]) : "–"} | ${fmt(d.averages.avg[n])} | ${p == null ? "–" : Math.round(p * 100) + "%"}${NUT_BY[n].kind === "limit" ? " (מגבלה)" : ""} |`); });
        const low = d.nutKeys.filter((n) => NUT_BY[n].kind === "target" && d.averages.pct[n] != null && d.averages.pct[n] < 0.7).map((n) => NUT_BY[n].he);
        if (low.length) L.push(`מתחת ל-70% מהיעד בממוצע (כולל תוספים): ${low.join(", ")}.`);
        const foodLow = d.nutKeys.filter((n) => NUT_BY[n].kind === "target" && d.averages.pct[n] != null && d.averages.pct[n] >= 0.7 && d.averages.supp[n] > 0 && d.averages.food[n] < 0.5 * (d.averages.avg[n] || 1)).map((n) => NUT_BY[n].he);
        if (foodLow.length) L.push(`מגיע בעיקר מתוספים (מזון פחות ממחצית): ${foodLow.join(", ")}.`);
      } else L.push("## ממוצע לתקופה\nאין ימים מלאים בטווח — אין ממוצע.");
      L.push("");
    }
    if (f.sources) {
      if (d.rows.some((x) => x.hasMeals)) {
        L.push("## מקורות עיקריים (3 המזונות התורמים ביותר, ליום)");
        d.rows.forEach((x) => { if (!x.hasMeals) return; L.push(`- ${repDate(x.k)}: ` + d.topKeys.map((n) => `${NUT_BY[n].he}: ${x.top[n] && x.top[n].length ? x.top[n].map((t) => `${t.name} ${fmt(t.v)}`).join(", ") : "–"}`).join(" · ")); });
        L.push("");
      }
    }
    if (f.meals) {
      L.push("## ארוחות");
      d.rows.forEach((x) => { if (!x.hasMeals) return; L.push(`### ${repDate(x.k)}`); x.day.meals.slice().sort((a, b) => (a.time || "").localeCompare(b.time || "")).forEach((m) => { const n = m.nutrients || {}; L.push(`- ${m.time || ""} ${m.name} — ${m.qty} ${m.unit} (${m.grams} ג')${f.mealNut ? `: ${fmt(n.kcal, 0)} קק"ל, חלבון ${fmt(n.protein)}, פחמ' ${fmt(n.carbs)}, סיבים ${fmt(n.fiber)}, שומן ${fmt(n.fat)}, ברזל ${fmt(n.iron)}, סידן ${fmt(n.calcium, 0)}` : ""}`); }); L.push(""); });
    }
    if (f.supps && d.supps.length) {
      L.push("## תוספים (יחידות שסומנו / יחידות ליום)"); L.push(`| תאריך | ${d.supps.map((s) => s.name).join(" | ")} |`); L.push(`|---|${d.supps.map(() => "---").join("|")}|`);
      d.rows.forEach((x) => { if (!x.day || (!x.hasMeals && !x.supp.some((q) => q.taken))) { L.push(`| ${repDate(x.k)} | ${dash(d.supps.length)} |`); return; } L.push(`| ${repDate(x.k)} | ${x.supp.map((s) => `${s.taken}/${s.doses}`).join(" | ")} |`); });
      L.push("תכולת התוספים (ליום מלא): " + d.supps.map((s) => `${s.name}: ${Object.entries(suppNutrients(s)).map(([k, v]) => `${NUT_BY[k].he} ${fmt(v)} ${NUT_BY[k].unit}`).join(", ") || "לא הוזן"}`).join(" | "));
      L.push("");
    }
    if (f.activity) {
      const any = d.rows.some((x) => x.walks.length || x.sun.length);
      L.push("## הליכה ושמש");
      if (!any) L.push("לא נרשמה פעילות בטווח.");
      d.rows.forEach((x) => { if (!x.walks.length && !x.sun.length) return; L.push(`- ${repDate(x.k)}: ${x.walks.length ? `הליכה ${x.walks.reduce((a, w) => a + w.minutes, 0)} דק' ב-${x.walks.length} מקטעים (${x.walks.map((w) => `${w.start} ${w.minutes} דק' ${WALK_HE[w.pace] || ""}`).join(", ")})` : "בלי הליכה"}${x.sun.length ? ` · שמש ${x.sun.reduce((a, s) => a + (Number(s.minutes) || 0), 0)} דק'` : ""}`); });
      L.push("");
    }
    if (f.gl) {
      L.push("## עומס גליקמי (מודל משוער, לא מדידת סוכר)"); L.push("| תאריך | שיא (שעה) | רף | זמן מעל הרף | זמן בבינוני | מצטבר | יעד יומי | ארוחות מעל רף פחמימות |"); L.push("|---|---|---|---|---|---|---|---|");
      d.rows.forEach((x) => { if (!x.gl) return; const ov = x.gl.meals.filter((m) => m.level !== "ok"); L.push(`| ${repDate(x.k)} | ${fmt(x.gl.peak, 0)} (${x.gl.peakAt}) | ${x.gl.hi} | ${durStr(x.gl.minsHigh)} | ${durStr(x.gl.minsMid)} | ${fmt(x.gl.total, 0)} | ${x.gl.target} | ${ov.length ? ov.map((m) => `${m.time} ${m.kind} ${fmt(m.net, 0)}/${m.cap}`).join("; ") : "—"} |`); });
      const glRows = d.rows.filter((x) => x.gl);
      if (glRows.length) { const sumHi = glRows.reduce((a, x) => a + x.gl.minsHigh, 0), sumMid = glRows.reduce((a, x) => a + x.gl.minsMid, 0); L.push(`סה"כ בתקופה (${glRows.length} ימים עם רישום): ${durStr(sumHi)} מעל הרף, ${durStr(sumMid)} בתחום הבינוני — בממוצע ${durStr(Math.round(sumHi / glRows.length))} ליום מעל הרף.`); }
      L.push("עומס = אינדקס גליקמי × פחמימות נטו ÷ 100; חלבון/שומן סמוך לארוחה והליכה אחריה מרככים. \"זמן מעל הרף\" = כמה זמן העקומה המשוערת שהתה מעל הרף (כמו time-in-range של חיישן), ולא ספירת פיקים — גלים שמתאחדים לא משנים אותו. הרף (20 בבסיס) והיעד היומי מחולקים ב-1.2 משבוע 20 וב-1.4 משבוע 28. רף פחמימות נטו לארוחה: בוקר 45 / עיקרית 60 / ביניים 30 גרם.");
      L.push("");
    }
    if (f.labs) {
      L.push("## בדיקות");
      if (d.labs.length) d.labs.forEach((l) => { const m = window.LAB_MARKERS.find((x) => x.key === l.marker) || { he: l.marker }; L.push(`- ${fmtDate(l.date)}: ${m.he} ${fmt(l.value, 2)} ${l.unit || m.unit || ""}`); });
      else if (d.latestLabs.length) L.push("אין בדיקות בטווח. אחרונות: " + d.latestLabs.map((l) => `${l.he} ${l.value} ${l.unit} (${l.date})`).join("; "));
      else L.push("אין בדיקות רשומות.");
      const gl = d.rows.filter((x) => x.glucose.length); if (gl.length) { L.push("מדידות סוכר:"); gl.forEach((x) => x.glucose.forEach((g) => L.push(`- ${repDate(x.k)} ${g.time}: ${g.mg_dl} mg/dL (${g.tag})`))); }
      L.push("");
    }
    if (f.notes) { const ns = d.rows.filter((x) => x.notes && x.notes.trim()); if (ns.length) { L.push("## הערות יומיות"); ns.forEach((x) => L.push(`- ${repDate(x.k)}: ${x.notes.trim()}`)); L.push(""); } }
    if (f.accuracy) {
      L.push("## הערת דיוק");
      const order = ["תווית", "מתכון", "מאכל אישי", "מאגר כללי", "הערכה"];
      order.forEach((k) => { if (d.sources[k]) L.push(`- ${k}: ${Array.from(d.sources[k]).slice(0, 25).join(", ")}${d.sources[k].size > 25 ? "…" : ""}`); });
      L.push("ערכי המאגר הכללי הם ממוצעים (USDA/משרד הבריאות); כמויות ביתיות הוערכו. כלי מעקב אישי, לא ייעוץ רפואי.");
    }
    return L.join("\n");
  }
  // ---- Printable HTML (standalone document)
  function reportHtml(d) {
    const md = reportText(d);
    // minimal markdown → html: headings, tables, bullets, paragraphs
    const lines = md.split("\n"); let h = "", inTable = false, inList = false, tableRows = [];
    const flushTable = () => { if (!tableRows.length) return; const [head, , ...body] = tableRows; const cells = (row) => row.split("|").slice(1, -1).map((c) => c.trim()); h += `<table><thead><tr>${cells(head).map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`; tableRows = []; };
    lines.forEach((ln) => {
      if (ln.startsWith("|")) { if (inList) { h += "</ul>"; inList = false; } tableRows.push(ln); inTable = true; return; }
      if (inTable) { flushTable(); inTable = false; }
      if (ln.startsWith("- ")) { if (!inList) { h += "<ul>"; inList = true; } h += `<li>${esc(ln.slice(2))}</li>`; return; }
      if (inList) { h += "</ul>"; inList = false; }
      if (ln.startsWith("### ")) h += `<h3>${esc(ln.slice(4))}</h3>`;
      else if (ln.startsWith("## ")) h += `<h2>${esc(ln.slice(3))}</h2>`;
      else if (ln.startsWith("# ")) h += `<h1>${esc(ln.slice(2))}</h1>`;
      else if (ln.trim()) h += `<p>${esc(ln)}</p>`;
    });
    if (inTable) flushTable(); if (inList) h += "</ul>";
    return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${esc(repTitle(d))}</title>
<style>body{font-family:"Segoe UI","Heebo","Assistant",Arial,sans-serif;color:#222;margin:0;padding:24px;max-width:900px;margin-inline:auto;line-height:1.45;font-size:13px}h1{font-size:20px;margin:0 0 4px}h1+p{color:#666;margin:0 0 16px}h2{font-size:15px;margin:18px 0 6px;border-bottom:1px solid #ddd;padding-bottom:3px}h3{font-size:13px;margin:12px 0 4px;color:#444}table{border-collapse:collapse;width:100%;margin:4px 0 8px;font-size:12px}th,td{border:1px solid #ddd;padding:4px 6px;text-align:right;vertical-align:top}th{background:#f3f3f3}tr:nth-child(even) td{background:#fafafa}ul{margin:4px 0 8px;padding-inline-start:18px}li{margin:2px 0}p{margin:4px 0}.foot{margin-top:24px;color:#888;font-size:11px;border-top:1px solid #ddd;padding-top:8px}.bar{display:flex;gap:8px;margin-bottom:12px}button{font:inherit;padding:6px 12px;border:1px solid #bbb;border-radius:6px;background:#fff;cursor:pointer}@media print{.bar{display:none}body{padding:0}@page{size:A4;margin:14mm}h2{break-after:avoid}table{break-inside:auto}tr{break-inside:avoid}}</style></head><body>
<div class="bar"><button onclick="window.print()">הדפס / שמור כ-PDF</button><span style="color:#888;font-size:12px;align-self:center">הדף הזה נפרד מהדאשבורד ואינו משנה בו כלום.</span></div>
${h}
<div class="foot">הופק מכלי מעקב תזונה אישי. ערכי מזון משוערים; יעדים לפי DRI להריון (NIH/IOM) מותאמים אישית. אינו תחליף לייעוץ רפואי.</div>
</body></html>`;
  }
  function reportCsv(d) {
    const keys = d.nutKeys;
    const rows = [["תאריך", "שבוע הריון", "ארוחות", "יום מלא", ...keys.map((n) => `${NUT_BY[n].he} ממזון (${NUT_BY[n].unit})`), ...d.suppKeys.map((n) => `${NUT_BY[n].he} מתוספים`), ...keys.map((n) => `יעד ${NUT_BY[n].he}`), "תוספים שסומנו", "הליכה (דק')", "משקל"]];
    d.rows.forEach((x) => { rows.push([x.k, x.week != null ? x.week : "", x.nMeals, x.hasMeals ? (x.full ? "כן" : "חלקי") : "אין רישום", ...keys.map((n) => x.hasMeals ? Math.round((x.food[n] || 0) * 10) / 10 : ""), ...d.suppKeys.map((n) => x.day ? Math.round((x.fromSupp[n] || 0) * 100) / 100 : ""), ...keys.map((n) => x.targets && x.targets[n] != null ? x.targets[n] : ""), x.day ? x.supp.map((s) => `${s.name} ${s.taken}/${s.doses}`).join("; ") : "", x.walks.reduce((a, w) => a + w.minutes, 0) || "", x.weight || ""]); });
    return "﻿" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  }
  async function saveText(name, text, mime) {
    try { const dl = window.claude && window.claude.use ? await window.claude.use("downloads") : null; if (dl) { await dl.save({ filename: name, data: text }); toast("הקובץ נשמר"); return true; } } catch (e) { if (e && e.code === "declined") return true; }
    try { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: mime || "text/plain;charset=utf-8" })); a.download = name; a.click(); return true; } catch (e) { return false; }
  }
  function reportFileBase(d) { return `nutrition-report-${d.r.from}${d.r.to !== d.r.from ? "_" + d.r.to : ""}`; }
  async function repDeliver(kind, fmt) {
    repSavePrefs();
    const d = reportData();
    if (kind === "print") {
      const html = reportHtml(d);
      let w = null; try { w = window.open("", "_blank"); } catch (e) { w = null; }
      if (w && w.document) { w.document.open(); w.document.write(html); w.document.close(); return; }
      const ok = await saveText(reportFileBase(d) + ".html", html, "text/html;charset=utf-8");
      if (!ok) openModal(`<h2>הדוח</h2><p class="help">הדפדפן חסם חלון חדש. העתיקי את הטקסט או הורידי קובץ.</p><textarea style="min-height:260px;font-size:.8rem">${esc(reportText(d))}</textarea><div class="actions"><button class="btn" data-act="modal-close">סגירה</button></div>`);
      return;
    }
    const text = reportText(d);
    if (kind === "copy") { try { await navigator.clipboard.writeText(text); toast("הדוח הועתק — אפשר להדביק בשיחה"); } catch (e) { openModal(`<h2>העתקה</h2><textarea style="min-height:260px;font-size:.8rem">${esc(text)}</textarea><div class="actions"><button class="btn" data-act="modal-close">סגירה</button></div>`); } return; }
    if (kind === "share") { try { await navigator.share({ title: repTitle(d), text }); } catch (e) { if (e && e.name !== "AbortError") toast("השיתוף לא זמין כאן — השתמשי בהעתקה"); } return; }
    if (kind === "download") { if (fmt === "csv") await saveText(reportFileBase(d) + ".csv", reportCsv(d), "text/csv;charset=utf-8"); else await saveText(reportFileBase(d) + ".md", text, "text/markdown;charset=utf-8"); }
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
      const u = urgencyOf(x, App.date), plan = planOf(x, App.date);
      return `<div class="tile" data-act="nutrient-detail" data-key="${k}">
        <div class="name"><span>${x.status === "good" ? CHECK : ""}${x.he}</span>${combinedPill(x, App.date)}</div>
        <div class="tile-main"><div class="big num">${fmt(x.v)}<small> / ${fmt(x.t)} ${x.unit}</small></div>${donut(x.pct, u.level, 56)}</div>
        ${barHtml(x, true)}
        <div class="sub"><span>${x.remaining > 0 ? `נשאר ${fmt(x.remaining)}` : `+${fmt(x.v - x.t)} מעל היעד`}</span>${x.supp ? `<span>מתוספים ${fmt(x.supp)}</span>` : ""}${extra}</div>
      </div>`;
    }).join("");
    const noteRows = []; // static rule notes (labs, diet) live in the pregnancy tab
    const focus = focusSentence(g, day, isToday);
    const overs = g.filter((x) => x.status === "over").map((x) => `<div class="note alert">${x.he}: ${fmt(x.v)} ${x.unit} — מעל הגבול העליון הבטוח (${fmt(x.ul)}).</div>`)
      .concat(g.filter((x) => x.ul && !NUT_BY[x.key].ulSoft && x.v >= x.ul * 0.85 && x.v < x.ul).map((x) => `<div class="note warn"><b>⚠ ${x.he} מתקרב לגבול העליון הבטוח:</b> ${fmt(x.v)} מתוך ${fmt(x.ul)} ${x.unit} (${Math.round((x.v / x.ul) * 100)}%). כדאי לא להוסיף עוד היום.</div>`))
      .concat(g.filter((x) => x.ul && NUT_BY[x.key].ulSoft && x.v > x.ul).map((x) => `<div class="note info">${x.he}: ${fmt(x.v)} ${x.unit} — מעל ${fmt(x.ul)}. ${esc(NUT_BY[x.key].ulNote || "")}</div>`));
    const rest = g.filter((x) => x.t > 0 && !HERO.includes(x.key));
    const isDone = (x) => (x.kind === "limit" ? x.status === "good" : x.status === "good");
    // Order: over-limit first; then items that need food (by urgency red→orange→yellow, then lowest %);
    // then items that supplements will complete, by % achieved (lowest first).
    const URG_RANK = { red: 0, orange: 1, yellow: 2, good: 3 };
    const sortKey = (x) => {
      if (x.status === "over") return [0, 0, x.pct];
      if (x.kind === "limit") return [1, 0, -x.pct];
      const plan = planOf(x, App.date), u = urgencyOf(x, App.date);
      if (plan && plan.cls === "supp") return [3, 0, x.pct];
      return [2, URG_RANK[u.level] != null ? URG_RANK[u.level] : 2, x.pct];
    };
    const missing = rest.filter((x) => !isDone(x)).map((x) => ({ x, k: sortKey(x) })).sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2]).map((o) => o.x);
    const doneList = rest.filter(isDone).sort((a, b) => b.pct - a.pct);
    const nearUL = (x) => x.ul && !NUT_BY[x.key].ulSoft && x.v >= x.ul * 0.85 && x.v < x.ul;
    const softOver = (x) => x.ul && NUT_BY[x.key].ulSoft && x.v > x.ul;
    const nutRow = (x) => { const u = urgencyOf(x, App.date), plan = planOf(x, App.date); return `<div class="nut-row ${x.status === "over" ? "row-over" : nearUL(x) ? "row-near" : ""}" data-act="nutrient-detail" data-key="${x.key}">
        ${donut(x.pct, u.level, 40)}
        <div class="grow"><div><b>${isDone(x) ? CHECK : ""}${x.he}</b>${x.kind === "limit" ? ` <span class="small ink2">· מגבלה</span>` : x.status === "over" ? ` <span class="small td-bad">· מעל הגבול העליון</span>` : nearUL(x) ? ` <span class="small td-bad">· מתקרב לגבול העליון</span>` : softOver(x) ? ` <span class="small td-warn">· מעל הגבול (ראי הערה)</span>` : !isDone(x) ? ` ${planPill(plan, x, App.date)}` : ""}</div><div class="num small ink2">${fmt(x.v)} / ${fmt(x.t)} ${x.unit}${!isDone(x) && x.remaining > 0 && x.kind !== "limit" ? ` · נשאר ${fmt(x.remaining)}` : ""}</div></div>

        ${isDone(x) || x.status === "over" || nearUL(x) || softOver(x) ? ulGauge(x) : ""}
      </div>`; };
    const floatRows = missing.map(nutRow);
    const doneRows = doneList.length ? `<h3 style="margin-top:16px;margin-bottom:4px">${CHECK}הושלם ${isToday ? "היום" : ""} <span class="small ink2">(${doneList.length})</span></h3>${doneList.map(nutRow).join("")}` : "";
    const suppRows = supps.map((s) => { const full = suppTaken(day, s) >= suppDoses(s); return `<div class="supp ${full ? "on" : ""}">
        ${doseBoxes(day, s)}
        <div class="grow"><div class="title">${full ? CHECK : ""}${esc(s.name)}</div><div class="meta">${esc(s.dose_label || "")}${s.times && s.times.length ? " · " + esc(s.times.join(", ")) : ""}${suppTaken(day, s) ? ` · <button class="btn sm ghost" data-act="supp-times" data-id="${s.id}" style="padding:0 6px;min-height:22px;font-size:.8rem" title="תיקון שעת הנטילה">נלקח ${esc(((day.supplement_times || {})[s.id] || []).slice(0, suppTaken(day, s)).join(", ") || "שעה?")} ✎</button>` : ""}</div></div>
      </div>`; });
    const glCard = glCardHtml(day, isToday), walkCard = walkCardHtml(day, isToday), sunCard = sunCardHtml(day, isToday);
    const glucoseCard = App.state.profile.track_glucose || (day.glucose || []).length ? `<div class="card"><div class="card-head"><h3>מדידות סוכר</h3><button class="btn sm" data-act="add-glucose">+ מדידה</button></div>
        ${(day.glucose || []).length ? `<div class="list">${day.glucose.map((r, i) => `<div class="item"><div class="grow"><span class="num">${r.mg_dl}</span> mg/dL <span class="meta">· ${esc(r.tag || "")} · ${r.time}${r.meal_id && day.meals.find((x) => x.id === r.meal_id) ? " · " + esc(day.meals.find((x) => x.id === r.meal_id).name) : ""}</span></div><button class="iconbtn" data-act="del-glucose" data-i="${i}" aria-label="מחיקה">✕</button></div>`).join("")}</div>` : `<p class="help">אין מדידות ${isToday ? "היום" : "בתאריך זה"}.</p>`}</div>` : "";
    $("panel-today").innerHTML = `
      <div class="stack">
        <div class="card focus"><p class="focus-line">${esc(focus)}</p><p class="small ink2" style="margin-top:4px">${esc(headline)}</p>${overs.length ? `<div class="stack" style="gap:6px;margin-top:10px">${overs.join("")}</div>` : ""}</div>
        ${isToday ? `<div class="card now" id="now-card">${nowCardHtml()}</div>` : ""}
        <div class="hero">${heroTiles}</div>
        <div class="grid two">
          <div class="stack">
            <div class="card">
              <div class="card-head"><h2>מה עוד חסר ${isToday ? "היום" : ""} <span class="small ink2">(${missing.length})</span></h2><button class="btn sm ghost" data-act="show-all-nutrients">טבלה</button></div>
              <div class="legend" style="margin:0 0 8px"><span><i style="background:var(--bad)"></i>דחוף היום</span><span><i style="background:var(--warn)"></i>להשלים (נזק רק אם מתמשך)</span><span><i style="background:var(--yellow)"></i>סביר, עדיין חסר</span><span><i style="background:var(--good)"></i>הושג</span></div>
              ${missing.length ? floatRows.join("") : `<p class="help">הכול הושלם.</p>`}
              ${doneRows}
            </div>
            ${glCard}
            ${walkCard}
            ${sunCard}
            ${glucoseCard}
          </div>
          <div class="stack">
            <div class="card">
              <div class="card-head"><h2>${dosesTotal && dosesTaken >= dosesTotal ? CHECK : ""}תוספים</h2><span class="small ink2 num">${dosesTaken}/${dosesTotal} יחידות</span></div>
              ${supps.length ? suppRows.join("") : `<p class="help">עדיין לא הוגדרו תוספים. <button class="btn sm ghost" data-act="go-tab" data-tab="supps">הוסיפי בטאב תוספים</button></p>`}
              ${supps.length > 1 ? `<div class="row end" style="margin-top:8px"><button class="btn sm ghost" data-act="take-all-supps">סמני הכול</button></div>` : ""}
              ${(() => { const adv = suppAdvice(App.date); return adv.length ? `<div class="stack" style="gap:6px;margin-top:10px">${adv.map((a) => `<div class="note ${a.level}">${esc(a.text)}</div>`).join("")}</div>` : `<p class="help" style="margin-top:8px">אין רכיב שבו התזונה + התוספים מתקרבים לגבול עליון — אין סיבה להפחית תוסף היום.</p>`; })()}
            </div>
            <div class="card">
              <div class="card-head"><h2>נאכל ${isToday ? "היום" : ""}</h2><div class="row" style="gap:4px"><button class="btn sm ghost" data-act="report-today" title="סיכום היום לשיתוף">שתפי את היום</button><button class="btn sm ghost" data-act="go-tab" data-tab="log">ליומן</button></div></div>
              ${day.meals.length ? `<div class="list">${day.meals.map((m) => `<div class="item clickable" data-act="meal-detail" data-id="${m.id}"><div class="grow"><span class="title">${esc(m.name)}</span> <span class="meta">${m.qty} ${esc(m.unit)} · ${m.time}</span></div><span class="small num ink2">${fmt(m.nutrients.kcal, 0)} קק"ל · ~${digestion(m).hours} ש'</span></div>`).join("")}</div><p class="help" style="margin-top:6px">לחיצה על ארוחה: זמן עיכול משוער ומתי כדאי לאכול שוב.</p>` : `<p class="help">רשמי מה אכלת בטאב היומן, או בשורת ההזנה המהירה.</p>`}
            </div>
          </div>
        </div>
      </div>`;
  }
  // One bold sentence: the main food focus for the rest of the day.
  const FOCUS_WORDS = { protein: "חלבון", carbs: "פחמימה מלאה", fat: "שומן", kcal: "אנרגיה", iron: "ברזל (קטניות/טחינה)", calcium: "סידן", fiber: "סיבים", vitC: "ירק או פרי טרי", folate: "ירוקים וקטניות", magnesium: "אגוזים וזרעים", zinc: "גרעינים וקטניות", potassium: "ירקות ופירות", iodine: "יוד (נורי/מלח מועשר)", choline: "סויה", b6: "בננה/תפוח אדמה", vitA: "ירקות כתומים", omega3: "אומגה-3", b12: "B12", vitD: "ויטמין D" };
  function focusSentence(g, day, isToday) {
    if (!day.meals.length) return isToday ? "עדיין לא נרשם אוכל היום — התחילי עם ארוחה שיש בה חלבון ופחמימה מלאה." : "לא נרשם אוכל בתאריך הזה.";
    const URG = { red: 0, orange: 1, yellow: 2 };
    const need = g.filter((x) => x.t > 0 && x.kind !== "limit" && x.status !== "good" && x.status !== "over").map((x) => ({ x, plan: planOf(x, App.date), u: urgencyOf(x, App.date) })).filter((o) => o.plan && o.plan.cls !== "supp");
    if (!need.length) {
      const pendingUnits = App.state.supplements.filter((s) => s.active !== false).reduce((a, s) => a + (suppDoses(s) - suppTaken(day, s)), 0);
      return pendingUnits > 0 ? `התזונה כיסתה את מה שצריך ${isToday ? "להיום" : ""} — נשאר רק לסמן ${pendingUnits} יחידות תוספים.` : "היום מושלם — כל היעדים הושגו.";
    }
    need.sort((a, b) => (URG[a.u.level] ?? 2) - (URG[b.u.level] ?? 2) || (HERO.includes(b.x.key) ? 1 : 0) - (HERO.includes(a.x.key) ? 1 : 0) || a.x.pct - b.x.pct);
    const top = need.filter((o) => o.u.level !== "yellow").slice(0, 3);
    const picks = (top.length ? top : need.slice(0, 2)).map((o) => FOCUS_WORDS[o.x.key] || o.x.he);
    const prot = g.find((x) => x.key === "protein"), kc = g.find((x) => x.key === "kcal");
    let meals = 1;
    if (prot && prot.remaining > 0) meals = Math.max(1, Math.ceil(prot.remaining / 25));
    else if (kc && kc.remaining > 400) meals = Math.max(1, Math.ceil(kc.remaining / 500));
    meals = Math.min(meals, 3);
    const mealsTxt = meals === 1 ? "ארוחה אחת" : meals === 2 ? "שתי ארוחות" : "שלוש ארוחות";
    const list = picks.length === 1 ? picks[0] : picks.slice(0, -1).join(", ") + " ו" + picks[picks.length - 1];
    const soft = !top.length;
    return soft ? `המצב טוב — עוד קצת ${list} ${isToday ? "היום" : ""} וזה מושלם.` : `דרוש עוד לפחות ${mealsTxt} עם ${list} ${isToday ? "להיום" : ""} להשלמת החוסר.`;
  }
  function nutrientDetail(key) {
    const x = gaps(App.date).find((y) => y.key === key), day = getDay(App.date);
    const contributions = day.meals.map((m) => ({ name: m.name, v: m.nutrients[key] || 0, qty: `${m.qty} ${m.unit}` })).filter((c) => c.v > 0).sort((a, b) => b.v - a.v);
    const suppC = App.state.supplements.map((s) => ({ name: `${s.name} (${suppTaken(day, s)}/${suppDoses(s)})`, v: (suppNutrients(s)[key] || 0) * suppFraction(day, s) })).filter((c) => c.v > 0);
    const u = urgencyOf(x, App.date), plan = planOf(x, App.date), meta = NUT_BY[key];
    openModal(`<h2>${x.status === "good" ? CHECK : ""}${x.he} ${urgencyPill(u)}</h2>
      <div class="tile-main"><div class="big num" style="font-size:1.6rem;font-weight:700">${fmt(x.v)} <small class="ink2" style="font-size:.9rem;font-weight:500">/ ${fmt(x.t)} ${x.unit}</small></div>${donut(x.pct, u.level, 64)}</div>
      ${plan ? `<div class="plan plan-${plan.cls}" style="margin-top:6px">${esc(plan.text)}${plan.parts.length ? ` — עוד ${fmt(plan.parts.reduce((a, p) => a + p.v, 0))} ${x.unit} מהיחידות שנותרו` : ""}</div>` : ""}
      ${meta.info ? `<div class="note info" style="margin-top:10px"><div><b>למה זה חשוב ומאיפה:</b> ${esc(meta.info)}</div></div>` : ""}
      ${barHtml(x, true)}<div class="legend"><span><i style="background:var(--accent)"></i>ממזון</span><span><i style="background:var(--accent-2)"></i>מתוספים</span></div>
      <div class="row between" style="margin-top:8px">${x.ul || x.kind === "limit" ? `<span class="help">גבול ${x.kind === "limit" ? "יומי" : "עליון בטוח (UL)"}: ${fmt(x.kind === "limit" ? x.t : x.ul)} ${x.unit}${NUT_BY[x.key].ulNote ? " · " + esc(NUT_BY[x.key].ulNote) : ""}</span>` : `<span class="help">לרכיב זה אין גבול עליון מוגדר.</span>`}${ulGauge(x)}</div>
      <h3 style="margin-top:14px">מאיפה זה הגיע</h3>
      ${contributions.length || suppC.length ? `<div class="list">${contributions.map((c) => `<div class="item"><div class="grow"><span class="title">${esc(c.name)}</span> <span class="meta">${esc(c.qty)}</span></div><span class="num">${fmt(c.v)}</span></div>`).join("")}${suppC.map((c) => `<div class="item"><div class="grow"><span class="title">${esc(c.name)}</span> <span class="meta">תוסף</span></div><span class="num">${fmt(c.v)}</span></div>`).join("")}</div>` : `<p class="help">עדיין כלום.</p>`}
      ${x.remaining > 0 && x.kind !== "limit" ? `<h3 style="margin-top:14px">מה ישלים את הפער (${fmt(x.remaining)} ${x.unit})</h3><p class="help">כמה צריך מכל מאכל כדי לסגור את הפער. המאכלים שלך ראשונים; הצעות מותאמות לסוג התזונה בפרופיל.</p>
      <div class="list">${closers(key, x.remaining).map((c) => `<div class="item"><div class="grow"><div class="title">${c.personal ? "★ " : ""}${esc(c.food.name)}</div><div class="meta">${esc(c.text)}</div></div><button class="btn sm" data-act="quick-add" data-food="${c.food.id}" title="הוספת מנה רגילה ליומן">אכלתי</button></div>`).join("") || `<p class="help">אין במאגר מאכל מתאים.</p>`}</div>` : ""}
      <div class="actions"><button class="btn" data-act="modal-close">סגירה</button></div>`);
  }
  // Rough gastric-emptying estimate: size, fat, fiber and liquidity of the meal.
  function digestion(m) {
    const n = m.nutrients || {}, kcal = n.kcal || 0, fat = n.fat || 0, fiber = n.fiber || 0, protein = n.protein || 0;
    const liquid = (n.water || 0) > (m.grams || 1) * 0.6;
    let h = kcal < 120 ? 1 : kcal < 300 ? 1.5 : kcal < 500 ? 2.5 : kcal < 750 ? 3 : 4;
    if (fat >= 20) h += 0.5; if (fat >= 35) h += 0.5;
    if (fiber >= 10) h += 0.5;
    if (protein >= 25) h += 0.5;
    if (liquid) h = Math.max(0.5, h - 1);
    h = Math.min(5, Math.round(h * 2) / 2);
    const net = Math.max(0, (n.carbs || 0) - (n.fiber || 0));
    const gl = net < 20 ? "נמוך" : net < 45 ? "בינוני" : "גבוה";
    return { hours: h, netCarbs: net, glLabel: gl, liquid };
  }
  function addHours(t, h) { const [hh, mm] = (t || "12:00").split(":").map(Number); const tot = hh * 60 + mm + Math.round(h * 60); return `${pad(Math.floor(tot / 60) % 24)}:${pad(tot % 60)}`; }
  function mealDetail(id) {
    const m = getDay(App.date).meals.find((x) => x.id === id); if (!m) return;
    const d = digestion(m), n = m.nutrients || {}, t = targetsFor();
    const cap = t.carbsPerMeal;
    const glNote = d.glLabel === "גבוה" ? "עומס פחמימות גבוה — בארוחה הבאה כדאי חלבון/ירקות בלי הרבה פחמימה, והליכה קצרה אחרי האוכל מרככת את העלייה בסוכר." : d.glLabel === "בינוני" ? "עומס פחמימות בינוני — רווח של 2–3 שעות לפני ארוחה פחמימתית נוספת." : "עומס פחמימות נמוך — לא צפוי פיק משמעותי; אפשר לאכול שוב כשרעבה.";
    const food = foodById(m.food_id);
    const units = food ? unitOptions(food) : [m.unit];
    openModal(`<h2>${esc(m.name)}</h2>
      <div class="inline-form" style="margin-top:6px">
        <div class="field short"><label for="me-time">שעה</label><input id="me-time" type="time" value="${esc(m.time || "")}" style="min-height:36px;padding:4px 8px"></div>
        <div class="field short"><label for="me-qty">כמות</label><input id="me-qty" class="num" type="number" step="0.25" min="0" value="${m.qty}" style="min-height:36px;padding:4px 8px"></div>
        <div class="field short"><label for="me-unit">יחידה</label><select id="me-unit" style="min-height:36px;padding:4px 8px">${units.map((u) => `<option ${u === m.unit ? "selected" : ""}>${esc(u)}</option>`).join("")}</select></div>
        <button class="btn sm primary" data-act="meal-save" data-id="${m.id}">שמירה</button>
        <button class="btn sm danger" data-act="meal-del-modal" data-id="${m.id}">מחיקה</button>
      </div>
      <p class="ink2 small" style="margin-top:6px">${m.grams} גרם${food ? "" : " · המאכל המקורי לא קיים יותר — שינוי כמות ישנה את הערכים יחסית"}</p>
      <div class="mini-list" style="margin-top:10px"><div><span>קלוריות</span><b class="num">${fmt(n.kcal, 0)}</b></div><div><span>חלבון</span><b class="num">${fmt(n.protein)} גרם</b></div><div><span>פחמימות (נטו)</span><b class="num">${fmt(n.carbs)} (${fmt(d.netCarbs)}) גרם</b></div><div><span>סיבים</span><b class="num">${fmt(n.fiber)} גרם</b></div><div><span>שומן</span><b class="num">${fmt(n.fat)} גרם</b></div><div><span>ברזל</span><b class="num">${fmt(n.iron)} מ"ג</b></div></div>
      <div class="card soft" style="margin-top:12px">
        <div class="row between"><b>זמן עיכול משוער</b><span class="score num">~${d.hours} שעות</span></div>
        <p class="small" style="margin-top:4px">${d.liquid ? "משקה/מאכל נוזלי — מתפנה מהקיבה מהר." : "הערכה לפי גודל הארוחה, שומן, חלבון וסיבים (שומן וסיבים מאטים את ריקון הקיבה)."}</p>
        <p style="margin-top:8px"><b>ארוחה מעמיסה הבאה: מ-${addHours(m.time, d.hours)} בערך.</b> חטיף קל (פרי, ירקות, אגוזים) אפשר גם קודם.</p>
      </div>
      <div class="note ${d.glLabel === "גבוה" ? "warn" : "info"}" style="margin-top:10px"><div><b>סוכר בדם:</b> ${esc(glNote)}${cap ? ` תקרה לארוחה לפי ההמלצות שלך: ${cap} גרם פחמימה${d.netCarbs > cap ? " — הארוחה הזו מעל התקרה." : "."}` : ""}</div></div>
      <div class="card soft" style="margin-top:10px">
        <div class="row between"><b>מדידת סוכר אחרי הארוחה</b><span class="help">כשיהיה גלוקומטר — לכיול המודל</span></div>
        ${(getDay(App.date).glucose || []).filter((r) => r.meal_id === m.id).map((r) => `<div class="small" style="margin-top:4px"><span class="num">${r.mg_dl}</span> mg/dL · ${r.min_after ? r.min_after + " דק' אחרי" : r.tag || ""} · ${r.time}</div>`).join("")}
        <div class="inline-form" style="margin-top:6px">
          <div class="field short"><label for="mg-v">mg/dL</label><input id="mg-v" class="num" type="number" inputmode="numeric" min="30" max="400" style="min-height:36px;padding:4px 8px;width:80px"></div>
          <div class="field short"><label for="mg-min">דקות אחרי</label><select id="mg-min" style="min-height:36px;padding:4px 8px"><option>60</option><option>90</option><option>120</option><option>30</option><option>0</option></select></div>
          <button class="btn sm" data-act="meal-glucose-save" data-id="${m.id}">שמירת מדידה</button>
        </div>
      </div>
      <details style="margin-top:10px"><summary class="help" style="cursor:pointer">עוד שיקולים לרווח בין ארוחות (מעבר לסוכר)</summary>
        <ul class="small" style="padding-inline-start:18px;margin:8px 0;line-height:1.6">
          <li><b>ברזל:</b> ${(n.iron || 0) >= 2 ? "הארוחה עשירה בברזל — " : ""}להרחיק קפה/תה וסידן (חלב צמחי מועשר, טחינה בכמות גדולה) בערך שעתיים ממקור ברזל או מכדור הברזל; ויטמין C באותה ארוחה משפר ספיגה.</li>
          <li><b>צרבת ורפלוקס (נפוץ בהריון):</b> ארוחות קטנות יותר ותכופות, לא לשכב 2–3 שעות אחרי ארוחה גדולה, פחות שומן ומטוגן בערב.</li>
          <li><b>ירידות סוכר ובחילה:</b> לא לעבור יותר מ-4–5 שעות בלי לאכול בשעות הערות; חטיף קטן עם חלבון לפני השינה מייצב את הבוקר.</li>
          <li><b>שובע ואנרגיה:</b> חלבון וסיבים בכל ארוחה מאריכים שובע ומרככים את עקומת הסוכר; פחמימה לבד (פרי, לחם) מתעכלת מהר.</li>
          <li><b>נפיחות ועצירות:</b> קטניות ורוטב עגבניות עלולים לגרום גזים — מרווח ומים עוזרים; אם יש עצירות, סיבים + נוזלים + תנועה.</li>
        </ul>
        <p class="help">ההערכות כלליות ומבוססות על ספרות; הגוף שלך יכול להגיב אחרת. אם יש סוכרת הריון — ההנחיות של הצוות המטפל גוברות.</p>
      </details>
      <div class="actions"><button class="btn" data-act="modal-close">סגירה</button></div>`);
  }
  function allNutrientsModal() {
    const g = gaps(App.date);
    openModal(`<h2>כל הרכיבים — ${esc(fmtDate(App.date))}</h2>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>רכיב</th><th class="num">הושג</th><th class="num">יעד</th><th class="num">%</th><th></th></tr></thead><tbody>
      ${g.filter((x) => x.t > 0).map((x) => `<tr data-act="nutrient-detail" data-key="${x.key}" style="cursor:pointer"><td>${x.status === "good" ? CHECK : ""}${x.he}</td><td class="num">${fmt(x.v)}</td><td class="num">${fmt(x.t)} ${x.unit}</td><td>${donut(x.pct, urgencyOf(x, App.date).level, 34)}</td><td>${urgencyPill(urgencyOf(x, App.date))}</td></tr>`).join("")}
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
          <div class="grow" data-act="meal-detail" data-id="${m.id}" style="cursor:pointer"><div class="title">${esc(m.name)}</div><div class="meta">${m.time} · ${m.grams} גרם · חלבון ${fmt(m.nutrients.protein)} · פחמ' ${fmt(m.nutrients.carbs)} · ברזל ${fmt(m.nutrients.iron)} · <span class="ink2">לחיצה לעריכה</span></div></div>
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
        const m = bestMatch(String(it.name || ""));
        const unit = UNIT_WORDS[it.unit] || it.unit || "";
        const food = m.confident && it.known !== false ? m.food : null;
        return { i, name: it.name, qty: Number(it.qty) || 1, unit, food, near: !food && m.food ? m.food : null };
      });
      window._aiRows = rows;
      out.innerHTML = rows.length ? `<div class="list">${rows.map((r) => `<div class="item"><input type="checkbox" id="ai-ok-${r.i}" ${r.food ? "checked" : "disabled"}><div class="grow"><div class="title">${esc(r.name)}${r.food ? " → " + esc(r.food.name) : " <span class='td-bad'>· לא זוהה</span>"}</div><div class="meta">${r.qty} ${esc(r.unit)}${r.food ? " · " + Math.round(gramsFor(r.food, r.qty, r.unit)) + " גרם" : r.near ? " · הקרוב ביותר במאגר: " + esc(r.near.name) + " (לא נבחר אוטומטית)" : ""}</div></div>${r.food ? "" : `<button class="btn sm" data-act="ai-new-food" data-name="${esc(r.name)}" data-unit="${esc(r.unit)}">צרי מאכל</button>`}</div>`).join("")}</div><div class="actions"><button class="btn primary" data-act="ai-confirm">הוסיפי את המסומנים ליומן</button></div>` : `<p class="td-bad">לא זוהו פריטים.</p>`;
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
  function foodModal(f, kind, forceNew) {
    const isNew = !f || !!forceNew;
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
        <div class="field"><label for="ff-gi">אינדקס גליקמי (0–100, לא חובה)</label><input id="ff-gi" type="number" step="1" min="0" max="110" value="${f.gi != null ? f.gi : ""}" placeholder="אוטומטי"></div>
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
      const giEl = $("ff-gi"); if (giEl) { if (giEl.value === "") delete f.gi; else f.gi = Number(giEl.value); }
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
          <div class="grow" data-act="supp-edit" data-id="${s.id}" style="cursor:pointer"><div class="title">${suppTaken(day, s) >= suppDoses(s) && s.active !== false ? CHECK : ""}${esc(s.name)}${s.active === false ? " (לא פעיל)" : ""}</div><div class="meta">${esc(s.dose_label || "")}${s.times && s.times.length ? " · " + esc(s.times.join(", ")) : ""}${Object.keys(suppNutrients(s)).length ? " · " + Object.entries(suppNutrients(s)).map(([k, v]) => `${NUT_BY[k].he} ${fmt(v)}`).join(", ") : ""}</div>${suppTaken(day, s) ? `<div class="meta"><button class="btn sm ghost" data-act="supp-times" data-id="${s.id}" style="padding:0 6px;min-height:22px;font-size:.8rem">נלקח ${esc(((day.supplement_times || {})[s.id] || []).slice(0, suppTaken(day, s)).join(", ") || "שעה?")} ✎ תיקון שעה</button></div>` : ""}</div>
        </div>`).join("") : `<div class="empty">עדיין לא הוגדרו תוספים.<br><span class="small">לכל תוסף אפשר להזין מה הוא תורם (ברזל, חומצה פולית…) כדי שהסימון היומי ייכנס לחישוב.</span></div>`}
      </div>
      <div class="card soft"><b>רצף:</b> <span class="num">${streak}</span> ימים רצופים שכל היחידות סומנו. <span class="help">קובייה לכל יחידה (כדור/כמוסה) — הסימון הוא לתאריך ${esc(fmtDate(App.date))}. לחיצה על השם עורכת את התוסף.</span></div>
    </div>`;
  }
  function suppTimesModal(id) {
    const s = App.state.supplements.find((x) => x.id === id); if (!s) return;
    const day = getDay(App.date), n = suppTaken(day, s), times = ((day.supplement_times || {})[s.id] || []).slice(0, n);
    while (times.length < n) times.push("");
    openModal(`<h2>שעות נטילה — ${esc(s.name)}</h2><p class="help">השעה נכנסת להתראות של ברזל מול סידן/קפה. אם סימנת באיחור, תקני כאן לשעה שבה באמת לקחת.</p>
      <div class="form-grid" style="margin-top:10px">${times.map((t, i) => `<div class="field"><label for="st-${i}">יחידה ${i + 1}</label><input id="st-${i}" type="time" value="${esc(t)}"></div>`).join("")}</div>
      <div class="actions"><button class="btn" data-act="modal-close">ביטול</button><button class="btn primary" data-act="supp-times-save" data-id="${s.id}" data-n="${n}">שמירה</button></div>`);
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
    // walking minutes per day
    const walkPts = keys.map((k) => ({ label: fmtDate(k), y: dayWalks(App.state.days[k]).reduce((a, w) => a + w.minutes, 0) }));
    const walkSvg = walkPts.some((p) => p.y > 0) ? window.Charts.line({ points: walkPts, unit: "דק'", yLabel: "הליכה", height: 170 }) : "";
    // summary tiles
    const avgOf = (key) => { const vals = logged.map((k) => totals[k][key] || 0); return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0; };
    const suppDays = calKeys.filter((k) => { const d = App.state.days[k]; return d && act.length && act.every((s) => suppTaken(d, s) >= suppDoses(s)); }).length;
    $("panel-history").innerHTML = `<div class="stack">
      <div class="row between"><div class="row"><h2>מעקב לאורך זמן</h2><button class="btn sm" data-act="report-open">📄 דוח לייצוא</button></div><div class="seg">${[[7, "7 ימים"], [30, "30 ימים"], [90, "90 ימים"], [0, "הכול"]].map(([v, l]) => `<button class="${histRange === v ? "on" : ""}" data-act="hist-range" data-v="${v}">${l}</button>`).join("")}</div></div>
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
      ${walkSvg ? `<div class="card"><div class="card-head"><h3>הליכה — דקות ליום</h3><span class="help">סה"כ ${fmt(walkPts.reduce((a, p) => a + p.y, 0), 0)} דק' בתקופה</span></div><div class="chart">${walkSvg}</div></div>` : ""}
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
    "meal-detail": (el) => mealDetail(el.dataset.id),
    "meal-save": (el) => {
      const day = getDay(App.date); const m = day.meals.find((x) => x.id === el.dataset.id); if (!m) return;
      const qty = Number($("me-qty").value) || 0, unit = $("me-unit").value, time = $("me-time").value || m.time;
      const f = foodById(m.food_id);
      if (f) { m.grams = Math.round(gramsFor(f, qty, unit)); m.nutrients = nutrientsFor(f, m.grams); }
      else if (m.qty > 0) { const ratio = qty / m.qty; Object.keys(m.nutrients || {}).forEach((k) => { m.nutrients[k] *= ratio; }); m.grams = Math.round(m.grams * ratio); }
      m.qty = qty; m.unit = unit; m.time = time;
      day.meals.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
      saveDay(App.date); closeModal(); render(); toast("הארוחה עודכנה");
    },
    "meal-glucose-save": (el) => {
      const v = Number($("mg-v").value); if (!v) { toast("הזיני ערך ב-mg/dL"); return; }
      const day = getDay(App.date); const m = day.meals.find((x) => x.id === el.dataset.id); if (!m) return;
      const minAfter = Number($("mg-min").value) || 0, t = toMin(m.time) + minAfter;
      day.glucose = day.glucose || [];
      day.glucose.push({ mg_dl: v, tag: minAfter ? `${minAfter} דק' אחרי ארוחה` : "לפני/בזמן הארוחה", time: minStr(Math.min(t, 24 * 60 - 1)), meal_id: m.id, min_after: minAfter });
      day.glucose.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
      saveDay(App.date); closeModal(); render(); toast("המדידה נשמרה");
    },
    "meal-del-modal": (el) => { if (!confirm("למחוק את הארוחה מהיומן?")) return; const day = getDay(App.date); day.meals = day.meals.filter((x) => x.id !== el.dataset.id); saveDay(App.date); closeModal(); render(); },
    "supp-dose": (el) => { const day = getDay(App.date); const s = App.state.supplements.find((x) => x.id === el.dataset.id); if (!s) return; const i = Number(el.dataset.i), c = suppTaken(day, s); setSuppTaken(day, s, i < c ? i : i + 1); saveDay(App.date); render(); },
    "take-all-supps": () => { const day = getDay(App.date); App.state.supplements.filter((s) => s.active !== false).forEach((s) => setSuppTaken(day, s, suppDoses(s))); saveDay(App.date); render(); },
    "quick-add": (el) => { const f = foodById(el.dataset.food); if (!f) return; closeModal(); if (App.tab !== "log") { addMealEntry(App.date, f, 1, f.portions[0] ? f.portions[0].label : "גרם"); toast(`נוסף: ${f.name} (${f.portions[0] ? f.portions[0].label : "100 גרם"})`); render(); } else pickFood(f, 1); },
    // report
    "report-open": () => reportModal(),
    "report-today": () => { const r = repState(); r.from = r.to = App.date; reportModal(); },
    "rep-range": (el) => { const r = repState(), today = dateKeyOf(new Date()); if (el.dataset.v === "today") { r.from = r.to = today; } else { r.to = today; r.from = addDays(today, -(Number(el.dataset.v) - 1)); } reportModal(); },
    "rep-audience": (el) => { repApplyAudience(el.dataset.v); reportModal(); },
    "rep-print": () => repDeliver("print"),
    "rep-copy": () => repDeliver("copy"),
    "rep-share": () => repDeliver("share"),
    "rep-download": (el) => repDeliver("download", el.dataset.fmt),
    // walking + sun
    "walk-start": () => { sitPauseForWalk(); writeTimer({ startedAt: Date.now(), pace: "moderate", outdoors: true }); render(); },
    "sit-start": () => { sitStart(); render(); },
    "sit-break": () => { sitBreak(); toast("יופי. הספירה התחילה מחדש"); render(); },
    "sit-stop": () => { sitStop(); render(); },
    "sit-every": (el) => { const s = sitState(); s.every = Number(el.dataset.m) || SIT_DEFAULT; s.alerted = false; writeSit(s); if (s.startedAt || s.breaks) sitPersist(s); render(); },
    "timer-pace": (el) => { const t = readTimer(); if (!t) return; t.pace = el.dataset.p; writeTimer(t); render(); },
    "walk-cancel": () => { if (!confirm("לבטל את ההליכה בלי לרשום?")) return; writeTimer(null); sitResumeAfterWalk(); render(); },
    "walk-stop": () => { const t = readTimer(); if (!t) return; const mins = Math.max(1, Math.round((Date.now() - t.startedAt) / 60000)); addWalk(dateKeyOf(new Date()), israelTimeOf(t.startedAt), mins, t.pace, t.outdoors); writeTimer(null); sitResumeAfterWalk(); toast(`נרשמה הליכה: ${mins} דק'`); render(); },
    "walk-add": () => { const mins = Number($("wk-min").value) || 0; if (!mins) { toast("כמה דקות?"); return; } addWalk(App.date, $("wk-start").value || nowTime(), mins, $("wk-pace").value, $("wk-out").checked); toast("נרשמה הליכה"); render(); },
    "walk-del": (el) => { const day = getDay(App.date); day.walks = (day.walks || []).filter((w) => w.id !== el.dataset.id); day.sun = (day.sun || []).filter((x) => x.walk_id !== el.dataset.id); saveDay(App.date); render(); },
    "sun-add": (el) => { addSun(App.date, $("sn-start").value || nowTime(), Number(el.dataset.min), $("sn-cover").value); toast("נרשמה חשיפה לשמש"); render(); },
    "sun-del": (el) => { const day = getDay(App.date); day.sun = (day.sun || []).filter((x) => x.id !== el.dataset.id); saveDay(App.date); render(); },
    "sun-cloud": (el) => { const day = getDay(App.date); day.sun_cloud = el.dataset.c; saveDay(App.date); render(); },
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
    "ai-new-food": (el) => { const u = el.dataset.unit; const g = u === "כוס" ? 200 : u === "כף" ? 15 : u === "כפית" ? 5 : u === "פרוסה" ? 30 : 100; foodModal({ id: uid("f"), name: el.dataset.name, aliases: [], kind: "product", per100: {}, portions: [{ label: u && u !== "גרם" ? u : "מנה", g }], favorite: true }, "product", true); },
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
    "supp-times": (el) => suppTimesModal(el.dataset.id),
    "supp-times-save": (el) => { const day = getDay(App.date), n = Number(el.dataset.n) || 0; const arr = []; for (let i = 0; i < n; i++) { const v = ($("st-" + i) || {}).value; arr.push(v || nowTime()); } arr.sort(); day.supplement_times = day.supplement_times || {}; day.supplement_times[el.dataset.id] = arr; saveDay(App.date); closeModal(); render(); toast("שעות הנטילה עודכנו"); },
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
    if (act === "rep-field") { repState().fields[el.dataset.k] = el.checked ? 1 : 0; }
    if (act === "rep-date") { const r = repState(); r[el.dataset.k] = el.value; if (r.from > r.to) { if (el.dataset.k === "from") r.to = r.from; else r.from = r.to; } reportModal(); }
    if (act === "rep-nutmode") { repState().nutMode = el.value; }
    if (act === "rep-name") { repState().name = el.value.trim(); }
    if (act === "timer-outdoors") { const t = readTimer(); if (t) { t.outdoors = el.checked; writeTimer(t); } }
    if (act === "sun-skin") { App.state.profile.sun = Object.assign({}, App.state.profile.sun || {}, { skin: Number(el.value) }); saveProfile(); render(); }
    if (act === "sun-loc") { App.state.profile.sun = Object.assign({}, App.state.profile.sun || {}, { [el.dataset.k]: Number(el.value) }); saveProfile(); render(); }
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
