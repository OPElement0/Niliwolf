// Pregnancy nutrient targets (adult 19-50, per day) — NIH/IOM DRIs + Israeli MoH.
// Generic reference values only. Personal overrides live in the user's data, never here.
window.NUTRIENTS = [
  // key, Hebrew label, unit, group, always-show, upper limit (UL), kind
  { key: "kcal",      he: "קלוריות",        unit: "קק\"ל", group: "macro",   ul: null, kind: "target" },
  { key: "protein",   he: "חלבון",          unit: "גרם",   group: "macro",   ul: null, kind: "target", hero: true },
  { key: "carbs",     he: "פחמימות",        unit: "גרם",   group: "macro",   ul: null, kind: "target", hero: true },
  { key: "fiber",     he: "סיבים",          unit: "גרם",   group: "macro",   ul: null, kind: "target" },
  { key: "fat",       he: "שומן",           unit: "גרם",   group: "macro",   ul: null, kind: "guide" },
  { key: "water",     he: "נוזלים",         unit: "מ\"ל",  group: "macro",   ul: null, kind: "target" },
  { key: "iron",      he: "ברזל",           unit: "מ\"ג",  group: "mineral", ul: 45,   kind: "target", hero: true },
  { key: "calcium",   he: "סידן",           unit: "מ\"ג",  group: "mineral", ul: 2500, kind: "target" },
  { key: "iodine",    he: "יוד",            unit: "מק\"ג", group: "mineral", ul: 1100, kind: "target" },
  { key: "zinc",      he: "אבץ",            unit: "מ\"ג",  group: "mineral", ul: 40,   kind: "target" },
  { key: "magnesium", he: "מגנזיום",        unit: "מ\"ג",  group: "mineral", ul: null, kind: "target" },
  { key: "potassium", he: "אשלגן",          unit: "מ\"ג",  group: "mineral", ul: null, kind: "target" },
  { key: "sodium",    he: "נתרן",           unit: "מ\"ג",  group: "mineral", ul: 2300, kind: "limit" },
  { key: "folate",    he: "חומצה פולית",    unit: "מק\"ג", group: "vitamin", ul: 1000, kind: "target" },
  { key: "vitD",      he: "ויטמין D",       unit: "מק\"ג", group: "vitamin", ul: 100,  kind: "target" },
  { key: "b12",       he: "ויטמין B12",     unit: "מק\"ג", group: "vitamin", ul: null, kind: "target" },
  { key: "b6",        he: "ויטמין B6",      unit: "מ\"ג",  group: "vitamin", ul: 100,  kind: "target" },
  { key: "vitC",      he: "ויטמין C",       unit: "מ\"ג",  group: "vitamin", ul: 2000, kind: "target" },
  { key: "vitA",      he: "ויטמין A",       unit: "מק\"ג", group: "vitamin", ul: 3000, kind: "target" },
  { key: "choline",   he: "כולין",          unit: "מ\"ג",  group: "vitamin", ul: 3500, kind: "target" },
  { key: "omega3",    he: "אומגה-3 (DHA+EPA)", unit: "מ\"ג", group: "vitamin", ul: null, kind: "target" },
];

// Base daily targets by trimester (1, 2, 3). kcal assumes ~2,000 kcal pre-pregnancy baseline
// (IOM: +0 / +340 / +452). Protein 71 g RDA — raised to 1.1 g/kg when weight is known.
window.TARGETS_BY_TRIMESTER = {
  kcal:      [2000, 2340, 2450],
  protein:   [71, 71, 71],
  carbs:     [175, 175, 175],
  fiber:     [28, 28, 28],
  fat:       [70, 75, 80],
  water:     [2300, 2300, 2300],
  iron:      [27, 27, 27],
  calcium:   [1000, 1000, 1000],
  iodine:    [220, 220, 220],
  zinc:      [11, 11, 11],
  magnesium: [360, 360, 360],
  potassium: [2900, 2900, 2900],
  sodium:    [2300, 2300, 2300],
  folate:    [600, 600, 600],
  vitD:      [15, 15, 15],
  b12:       [2.6, 2.6, 2.6],
  b6:        [1.9, 1.9, 1.9],
  vitC:      [85, 85, 85],
  vitA:      [770, 770, 770],
  choline:   [450, 450, 450],
  omega3:    [300, 300, 300],
};

// IOM 2009 total gestational weight-gain ranges by pre-pregnancy BMI, and
// recommended weekly rate in trimesters 2-3 (kg/week).
window.WEIGHT_GAIN_IOM = [
  { bmiMax: 18.5,     label: "תת-משקל",   total: [12.5, 18],  weekly: [0.44, 0.58] },
  { bmiMax: 25,       label: "משקל תקין", total: [11.5, 16],  weekly: [0.35, 0.50] },
  { bmiMax: 30,       label: "עודף משקל", total: [7, 11.5],   weekly: [0.23, 0.33] },
  { bmiMax: Infinity, label: "השמנה",     total: [5, 9],      weekly: [0.17, 0.27] },
];

// Lab markers the pregnancy tab knows how to interpret (units are the common Israeli lab units).
window.LAB_MARKERS = [
  { key: "hb",        he: "המוגלובין",        unit: "g/dL",   low: 11,  high: null, note: "סף אנמיה בהריון: 11 (טרימסטר 1/3) או 10.5 (טרימסטר 2)" },
  { key: "ferritin",  he: "פריטין",           unit: "ng/mL",  low: 30,  high: null, note: "מתחת ל-30 = מאגרי ברזל נמוכים" },
  { key: "vitD",      he: "ויטמין D (25-OH)", unit: "ng/mL",  low: 20,  high: 100,  note: "מתחת ל-20 = חסר; 30+ רצוי" },
  { key: "b12",       he: "ויטמין B12",       unit: "pg/mL",  low: 200, high: null, note: "מתחת ל-200 = חסר; 200-300 גבולי" },
  { key: "folate",    he: "חומצה פולית בדם",  unit: "ng/mL",  low: 4,   high: null, note: "" },
  { key: "tsh",       he: "TSH",              unit: "mIU/L",  low: 0.1, high: 2.5,  note: "בהריון רצוי עד 2.5 (טרימסטר 1) / 3.0" },
  { key: "glucose_fasting", he: "סוכר בצום", unit: "mg/dL",  low: null, high: 92, note: "בהריון: מעל 92 בצום דורש בירור" },
  { key: "ogtt_50",   he: "העמסת סוכר 50 גר' (שעה)", unit: "mg/dL", low: null, high: 140, note: "מעל 140 → העמסת 100 גר'" },
  { key: "ogtt_100_1h", he: "העמסת 100 גר' – שעה", unit: "mg/dL", low: null, high: 180, note: "" },
  { key: "ogtt_100_2h", he: "העמסת 100 גר' – שעתיים", unit: "mg/dL", low: null, high: 155, note: "" },
  { key: "hba1c",     he: "HbA1c",            unit: "%",      low: null, high: 5.7, note: "" },
  { key: "platelets", he: "טסיות",            unit: "K/µL",   low: 150, high: null, note: "" },
  { key: "other",     he: "אחר",              unit: "",       low: null, high: null, note: "" },
];

window.DIAGNOSES = [
  { key: "anemia",      he: "אנמיה / חסר ברזל" },
  { key: "gdm",         he: "סוכרת הריון / רגישות לסוכר" },
  { key: "hypothyroid", he: "תת-פעילות בלוטת התריס" },
  { key: "nausea",      he: "בחילות / הקאות" },
  { key: "twins",       he: "הריון תאומים" },
  { key: "hypertension",he: "לחץ דם גבוה" },
  { key: "constipation",he: "עצירות" },
];
