#!/usr/bin/env node
// Helper CLI for logging meals / building foods from the conversation.
// Contains no personal data; personal foods are read from a db dump directory when given.
//
//   node tools/nutri.js search <query> [--personal <dir>]
//   node tools/nutri.js entry --food <id> (--qty <n> --unit <label> | --grams <g>) [--time HH:MM] [--personal <dir>] [--id <mealId>]
//   node tools/nutri.js recipe --name <name> --ing <foodId>:<grams> [--ing ...] [--servings n] [--portion <label>] [--alias a,b]
//   node tools/nutri.js merge <day.json> <entries.json>      → {"meals":[...]} (existing + new, sorted by time)
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const KEYS = ["kcal", "protein", "carbs", "fiber", "fat", "iron", "calcium", "folate", "vitC", "vitA", "vitD", "b12", "zinc", "magnesium", "potassium", "sodium", "omega3", "iodine", "choline", "b6", "water"];

function loadGeneric() {
  const w = {};
  global.window = w;
  eval(fs.readFileSync(path.join(ROOT, "src/data/foods.js"), "utf8"));
  return w.FOODS_GENERIC.map((f) => ({ id: "g_" + f[0], name: f[1], aliases: f[2] || [], cat: f[3], portions: f[4].map((p) => ({ label: p[0], g: p[1] })), per100: f[5], generic: true }));
}
function loadPersonal(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const d = j && j.data && j.id ? j.data : j;
    return Object.assign({ aliases: [], portions: [{ label: "מנה", g: 100 }], per100: {} }, d, { id: f.replace(/\.json$/, ""), generic: false });
  });
}
function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) { const k = a.slice(2); const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true; if (out[k] === undefined) out[k] = v; else out[k] = [].concat(out[k], v); }
    else out._.push(a);
  }
  return out;
}
const norm = (s) => String(s || "").replace(/['"״׳]/g, "").trim().toLowerCase();
function gramsFor(food, qty, unit) {
  if (unit === "גרם" || unit === "מ\"ל") return qty;
  const p = food.portions.find((p) => p.label === unit) || food.portions.find((p) => p.label.includes(unit) || unit.includes(p.label));
  return qty * (p ? p.g : food.portions[0] ? food.portions[0].g : 100);
}
function nutrientsFor(food, grams) {
  const out = {};
  KEYS.forEach((k) => { if (food.per100[k] != null) out[k] = Math.round((food.per100[k] * grams) / 100 * 1000) / 1000; });
  return out;
}

const a = args(process.argv.slice(2));
const cmd = a._[0];
const foods = loadGeneric().concat(loadPersonal(a.personal));
const byId = Object.fromEntries(foods.map((f) => [f.id, f]));

if (cmd === "search") {
  const q = norm(a._[1]);
  const hits = foods.filter((f) => [f.name].concat(f.aliases).some((n) => norm(n).includes(q))).slice(0, 15);
  hits.forEach((f) => console.log(`${f.id}\t${f.name}\t${f.portions.map((p) => `${p.label}=${p.g}g`).join(", ")}\t${f.per100.kcal || 0} kcal/100g`));
} else if (cmd === "entry") {
  const food = byId[a.food]; if (!food) { console.error("unknown food id " + a.food); process.exit(1); }
  const unit = a.unit || (a.grams ? "גרם" : food.portions[0].label);
  const qty = a.grams ? Number(a.grams) : Number(a.qty || 1);
  const grams = Math.round(gramsFor(food, qty, unit));
  const entry = { id: a.id || `m_${Date.now().toString(36)}`, time: a.time || "12:00", food_id: food.id, name: food.name, qty, unit, grams, nutrients: nutrientsFor(food, grams) };
  console.log(JSON.stringify(entry, null, 1));
} else if (cmd === "recipe") {
  const ings = [].concat(a.ing || []).map((s) => { const [id, g] = String(s).split(":"); return { food_id: id, grams: Number(g) }; });
  const total = {}; let totalG = 0;
  ings.forEach((i) => { const f = byId[i.food_id]; if (!f) { console.error("unknown " + i.food_id); process.exit(1); } totalG += i.grams; const n = nutrientsFor(f, i.grams); Object.keys(n).forEach((k) => { total[k] = (total[k] || 0) + n[k]; }); });
  const servings = Number(a.servings || 1);
  const per100 = {}; Object.keys(total).forEach((k) => { per100[k] = Math.round((total[k] / totalG) * 100 * 1000) / 1000; });
  const doc = { name: a.name, aliases: a.alias ? String(a.alias).split(",").map((s) => s.trim()) : [], kind: "product", favorite: true, portions: [{ label: a.portion || "מנה", g: Math.round(totalG / servings) }], per100, label_notes: "חושב מהמרכיבים: " + ings.map((i) => `${byId[i.food_id].name} ${i.grams} ג'`).join(", ") };
  console.log(JSON.stringify(doc, null, 1));
} else if (cmd === "merge") {
  const dayRaw = JSON.parse(fs.readFileSync(a._[1], "utf8"));
  const day = dayRaw && dayRaw.data && dayRaw.id ? dayRaw.data : dayRaw;
  const entries = JSON.parse(fs.readFileSync(a._[2], "utf8"));
  const meals = (day.meals || []).concat(Array.isArray(entries) ? entries : [entries]).sort((x, y) => (x.time || "").localeCompare(y.time || ""));
  console.log(JSON.stringify({ meals }));
} else {
  console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 8).join("\n"));
}
