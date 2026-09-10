// Declarative rule engine — adjusts targets and produces notes from the pregnancy context.
// ctx = { week, trimester, weightKg, prepregWeightKg, heightCm, bmi, gainKg, gainRange,
//         labs: {marker: {value, date, week}}, diagnoses: Set, dietType, hour }
// Each rule: { id, when(ctx) -> bool, adjust(targets, ctx) -> void, note(ctx) -> string, level }
// level: "info" | "warn" | "alert"
window.RULES = [
  {
    id: "protein_by_weight",
    when: (c) => c.weightKg > 0,
    adjust: (t, c) => { t.protein = Math.max(t.protein, Math.round(c.weightKg * 1.1)); },
    note: () => "",
    level: "info",
  },
  {
    id: "iron_low",
    when: (c) => (c.labs.ferritin && c.labs.ferritin.value < 30) ||
                 (c.labs.hb && c.labs.hb.value < (c.trimester === 2 ? 10.5 : 11)) ||
                 c.diagnoses.has("anemia"),
    adjust: (t) => { t.iron = Math.max(t.iron, 30); },
    note: (c) => {
      const f = c.labs.ferritin ? `פריטין ${c.labs.ferritin.value}` : "";
      const h = c.labs.hb ? `המוגלובין ${c.labs.hb.value}` : "";
      const what = [f, h].filter(Boolean).join(", ") || "אנמיה";
      return `${what}: מאגרי ברזל נמוכים — מקור ברזל בכל ארוחה עם ויטמין C; להפריד ברזל מסידן, קפה ותה (שעתיים).`;
    },
    level: "alert",
  },
  {
    id: "vitd_low",
    when: (c) => c.labs.vitD && c.labs.vitD.value < 20,
    adjust: (t) => { t.vitD = Math.max(t.vitD, 25); },
    note: (c) => `ויטמין D ${c.labs.vitD.value} ng/mL — חסר. מקורות: תוסף, שמש${c.dietType === "vegan" ? ", מזון מועשר (משקאות צמחיים)" : ", סלמון, ביצים"}. לוודא עם הרופא/ה מינון תוסף.`,
    level: "warn",
  },
  {
    id: "vitd_borderline",
    when: (c) => c.labs.vitD && c.labs.vitD.value >= 20 && c.labs.vitD.value < 30,
    adjust: () => {},
    note: (c) => `ויטמין D ${c.labs.vitD.value} ng/mL — גבולי (רצוי 30+).`,
    level: "info",
  },
  {
    id: "b12_low",
    when: (c) => c.labs.b12 && c.labs.b12.value < 300,
    adjust: (t) => { t.b12 = Math.max(t.b12, 4); },
    note: (c) => `B12 ${c.labs.b12.value} pg/mL — ${c.labs.b12.value < 200 ? "חסר" : "גבולי"}. ${c.dietType === "vegan" ? "בתזונה טבעונית המקור היחיד הוא תוסף/מזון מועשר — לשקול העלאת מינון עם הרופא/ה." : "מקורות: ביצים, דגים, מוצרי חלב, בשר; לשקול תוסף."}`,
    level: (c) => (c.labs.b12.value < 200 ? "alert" : "warn"),
  },
  {
    id: "gdm",
    when: (c) => c.diagnoses.has("gdm") ||
                 (c.labs.glucose_fasting && c.labs.glucose_fasting.value > 92) ||
                 (c.labs.ogtt_50 && c.labs.ogtt_50.value > 140) ||
                 (c.labs.ogtt_100_2h && c.labs.ogtt_100_2h.value > 155),
    adjust: (t) => { t.carbs = Math.max(175, Math.min(t.carbs, 200)); t.carbsPerMeal = 45; t.carbsPerSnack = 20; },
    note: () => "רגישות לסוכר: לפזר פחמימות על פני היום (עד ~45 גרם בארוחה, ~20 בביניים), להעדיף פחמימות מלאות ולצרף חלבון לכל ארוחה.",
    level: "warn",
  },
  {
    id: "hypothyroid",
    when: (c) => c.diagnoses.has("hypothyroid") || (c.labs.tsh && c.labs.tsh.value > 3),
    adjust: () => {},
    note: () => "בלוטת התריס: לוודא יוד (220 מק\"ג) ולהפריד אלטרוקסין מברזל/סידן/סויה ב-4 שעות.",
    level: "info",
  },
  {
    id: "vegetarian",
    when: (c) => c.dietType === "vegetarian" || c.dietType === "vegan",
    adjust: (t) => { t.iron = Math.min(45, Math.round(t.iron * 1.8)); t.zinc = Math.round(t.zinc * 1.5); },
    note: (c) => c.dietType === "vegan"
      ? "טבעונות: יעד ברזל ואבץ מוגדל (ספיגה נמוכה מהצומח); B12, ויטמין D, DHA מאצות וסידן — בעיקר מתוספים/מזון מועשר."
      : "צמחונות: יעד ברזל ואבץ מוגדל (ספיגה נמוכה מהצומח); לשים לב ל-B12 ו-DHA.",
    level: "info",
  },
  {
    id: "twins",
    when: (c) => c.diagnoses.has("twins"),
    adjust: (t) => { t.kcal += 300; t.protein += 25; t.iron = Math.max(t.iron, 30); t.folate = Math.max(t.folate, 1000); },
    note: () => "תאומים: יעדי קלוריות, חלבון, ברזל וחומצה פולית מוגדלים.",
    level: "info",
  },
  {
    id: "gain_high",
    when: (c) => c.gainRange && c.gainKg != null && c.week >= 14 && c.gainKg > c.gainRange.expectedMax + 1,
    adjust: () => {},
    note: (c) => `עלייה במשקל (${c.gainKg.toFixed(1)} ק"ג) מעל הטווח המומלץ לשבוע ${c.week} (${c.gainRange.expectedMin.toFixed(1)}–${c.gainRange.expectedMax.toFixed(1)}). לא לצמצם קלוריות בלי רופא/ה — לשים לב למתוקים ומשקאות.`,
    level: "info",
  },
  {
    id: "gain_low",
    when: (c) => c.gainRange && c.gainKg != null && c.week >= 14 && c.gainKg < c.gainRange.expectedMin - 1,
    adjust: (t) => { t.kcal += 150; },
    note: (c) => `עלייה במשקל (${c.gainKg.toFixed(1)} ק"ג) מתחת לטווח לשבוע ${c.week} (${c.gainRange.expectedMin.toFixed(1)}–${c.gainRange.expectedMax.toFixed(1)}). להוסיף ארוחות ביניים עשירות (אגוזים, אבוקדו, טחינה).`,
    level: "warn",
  },
  {
    id: "nausea",
    when: (c) => c.diagnoses.has("nausea"),
    adjust: () => {},
    note: () => "בחילות: ארוחות קטנות ותכופות, פחמימה יבשה בבוקר, ג'ינג'ר, להפריד שתייה מאוכל.",
    level: "info",
  },
  {
    id: "constipation",
    when: (c) => c.diagnoses.has("constipation"),
    adjust: (t) => { t.fiber = Math.max(t.fiber, 30); t.water = Math.max(t.water, 2500); },
    note: () => "עצירות: יעד סיבים ונוזלים מוגדל; קטניות, פירות עם קליפה, שיבולת שועל, שזיפים.",
    level: "info",
  },
  {
    id: "hypertension",
    when: (c) => c.diagnoses.has("hypertension"),
    adjust: (t) => { t.sodium = 2000; t.calcium = Math.max(t.calcium, 1200); },
    note: () => "לחץ דם: להגביל נתרן (~2,000 מ\"ג), להקפיד על סידן, אשלגן ומגנזיום.",
    level: "info",
  },
  {
    id: "third_trimester",
    when: (c) => c.trimester === 3,
    adjust: () => {},
    note: () => "טרימסטר 3: הצורך בברזל, סידן ו-DHA בשיא — התינוק בונה מאגרים.",
    level: "info",
  },
];
