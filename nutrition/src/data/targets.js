// Pregnancy nutrient targets (adult 19-50, per day) — NIH/IOM DRIs + Israeli MoH.
// Generic reference values only. Personal overrides live in the user's data, never here.
window.NUTRIENTS = [
  // key, Hebrew label, unit, group, always-show, upper limit (UL), kind
  { key: "kcal",      he: "קלוריות",        unit: "קק\"ל", group: "macro",   ul: null, kind: "target" , urgency: "daily", info: "אנרגיה לגדילת העובר ולך. בטרימסטר 2 כ-340 קק\"ל מעל הבסיס, בטרימסטר 3 כ-450. חוסר קבוע פוגע בעלייה במשקל." },
  { key: "protein",   he: "חלבון",          unit: "גרם",   group: "macro",   ul: null, kind: "target", hero: true , urgency: "daily", info: "אבן הבניין של רקמות העובר, השליה והדם. הצורך עולה ל-1.1 גרם לק\"ג. מקורות טבעוניים: טופו, טמפה, עדשים, חומוס גרגרים, אדממה, סייטן, אבקת חלבון, לחם מלא." },
  { key: "carbs",     he: "פחמימות",        unit: "גרם",   group: "macro",   ul: null, kind: "target" , urgency: "daily", info: "מקור האנרגיה העיקרי של העובר והמוח. לפזר לאורך היום, להעדיף מלאות (לחם מלא, קטניות, קינואה) ולצרף חלבון כדי למתן עליית סוכר." },
  { key: "fiber",     he: "סיבים",          unit: "גרם",   group: "macro",   ul: null, kind: "target" , urgency: "stored", info: "עוזר לעצירות (נפוצה בהריון) ולאיזון סוכר. יחד עם הרבה נוזלים. יותר מדי בבת אחת גורם נפיחות." },
  { key: "fat",       he: "שומן",           unit: "גרם",   group: "macro",   ul: null, kind: "guide" , urgency: "stored", info: "ערך מנחה, לא יעד קשיח. להעדיף שמן זית, אבוקדו, אגוזים וזרעים; DHA מגיע מהאומגה-3." },
  { key: "iron",      he: "ברזל",           unit: "מ\"ג",  group: "mineral", ul: 45,   ulSoft: true, ulNote: "הגבול נקבע לאדם בריא; בטיפול בחסר ברזל לפי הנחיית רופא/ה מינון גבוה יותר מקובל.", kind: "target", hero: true , urgency: "daily", info: "בהריון נפח הדם גדל וצריך פי 1.5 ברזל. ברזל מהצומח נספג פחות — לכן היעד גבוה יותר. ויטמין C באותה ארוחה משפר ספיגה; סידן, קפה ותה פוגעים (להפריד שעתיים). מקורות: עדשים, טופו, טחינה, שומשום מלא, גרעיני דלעת, שוקולד מריר." },
  { key: "calcium",   he: "סידן",           unit: "מ\"ג",  group: "mineral", ul: 2500, kind: "target" , urgency: "stored", info: "לעצמות העובר; אם חסר הגוף לוקח מהעצמות שלך. מקורות טבעוניים: טופו עם סידן, משקה צמחי מועשר, טחינה משומשום מלא, שקדים, ברוקולי, כרוב. להרחיק מכדור הברזל." },
  { key: "iodine",    he: "יוד",            unit: "מק\"ג", group: "mineral", ul: 1100, kind: "target" , urgency: "stored", info: "חיוני להתפתחות המוח ובלוטת התריס של העובר. בתזונה טבעונית קשה להשיג: מלח מועשר ביוד, דף נורי ביום, והמולטי. להימנע מקלפ/קומבו (יוד בכמות מסוכנת)." },
  { key: "zinc",      he: "אבץ",            unit: "מ\"ג",  group: "mineral", ul: 40,   kind: "target" , urgency: "stored", info: "לחלוקת תאים ולמערכת החיסון. מהצומח נספג פחות (לכן יעד מוגדל). מקורות: גרעיני דלעת, קשיו, שיבולת שועל, עדשים, טופו, שומשום." },
  { key: "magnesium", he: "מגנזיום",        unit: "מ\"ג",  group: "mineral", ul: null, kind: "target" , urgency: "stored", info: "עוזר להתכווצויות שרירים ברגליים ולאיזון סוכר. מקורות: גרעיני דלעת, שקדים, קשיו, טחינה, שיבולת שועל, קטניות, שוקולד מריר." },
  { key: "potassium", he: "אשלגן",          unit: "מ\"ג",  group: "mineral", ul: null, kind: "target" , urgency: "stored", info: "לאיזון נוזלים ולחץ דם. מקורות: תפוח אדמה, בטטה, בננה, קטניות, אבוקדו, שזיפים מיובשים, עגבניות." },
  { key: "sodium",    he: "נתרן",           unit: "מ\"ג",  group: "mineral", ul: 2300, kind: "limit" , urgency: "stored", info: "מגבלה, לא יעד: עודף נתרן קשור לבצקות ולחץ דם. רוב הנתרן מגיע ממזון מעובד, לחם קנוי, חטיפים ורטבים." },
  { key: "folate",    he: "חומצה פולית",    unit: "מק\"ג", group: "vitamin", ul: 1000, ulSoft: true, ulNote: "הגבול חל רק על חומצה פולית סינתטית (תוספים/מזון מועשר); פולאט טבעי מקטניות וירקות בטוח בכל כמות.", kind: "target" , urgency: "daily", info: "מונע מומים בתעלה העצבית ותומך בגדילה. בהריון היעד 600 מק\"ג. הגבול העליון חל רק על הצורה הסינתטית; פולאט מעדשים, אדממה, ירקות ירוקים ואבוקדו בטוח בכל כמות." },
  { key: "vitD",      he: "ויטמין D",       unit: "מק\"ג", group: "vitamin", ul: 100,  kind: "target" , urgency: "stored", info: "לספיגת סידן ולעצמות העובר. כמעט אין במזון טבעוני (רק מועשר); המקור העיקרי הוא המולטי ושמש. אם הבדיקה מתחת ל-30 — לשקול תוסף נפרד עם הרופא/ה." },
  { key: "b12",       he: "ויטמין B12",     unit: "מק\"ג", group: "vitamin", ul: null, kind: "target" , urgency: "stored", info: "חיוני למערכת העצבים של העובר; חסר בטבעונות הוא הסיכון הגדול ביותר. אין מקור צמחי אמין — רק תוסף או מזון מועשר. הגוף אוגר, אז יום חסר אינו קריטי, אבל לא לדלג על התוסף לאורך זמן." },
  { key: "b6",        he: "ויטמין B6",      unit: "מ\"ג",  group: "vitamin", ul: 100,  kind: "target" , urgency: "stored", info: "מפחית בחילות ותומך ביצירת דם. מקורות: בננה, תפוח אדמה, חומוס גרגרים, גרעיני חמנייה, אבוקדו. גבול עליון 100 מ\"ג — רלוונטי רק עם תוספים גדולים." },
  { key: "vitC",      he: "ויטמין C",       unit: "מ\"ג",  group: "vitamin", ul: 2000, kind: "target" , urgency: "daily", info: "משפר ספיגת ברזל מהצומח (לשלב באותה ארוחה עם מקור ברזל) ותומך ברקמות. לא נאגר בגוף. מקורות: פלפל, הדרים, קיווי, תות, ברוקולי, עגבנייה." },
  { key: "vitA",      he: "ויטמין A",       unit: "מק\"ג", group: "vitamin", ul: 3000, ulSoft: true, ulNote: "הגבול חל על רטינול (מהחי/תוספים). בטא-קרוטן מגזר, בטטה וירקות כתומים בטוח ואינו נספר לגבול.", kind: "target" , urgency: "stored", info: "לראייה ולהתפתחות איברים. הגבול העליון (3,000) חל על רטינול מהחי/תוספים; בטא-קרוטן מגזר, בטטה, דלעת ותרד בטוח בכל כמות והמולטי שלך הוא בטא-קרוטן." },
  { key: "choline",   he: "כולין",          unit: "מ\"ג",  group: "vitamin", ul: 3500, kind: "target" , urgency: "stored", info: "להתפתחות המוח והזיכרון של העובר. במזון טבעוני מעט: פולי סויה, טופו, קינואה, ברוקולי, כרובית, בוטנים — לכן התוסף חשוב." },
  { key: "omega3",    he: "אומגה-3 (DHA+EPA)", unit: "מ\"ג", group: "vitamin", ul: null, kind: "target" , urgency: "stored", info: "DHA למוח ולרשתית של העובר. בתזונה טבעונית המקור היחיד הוא אצות (התוסף שלך). ALA מצ'יה/אגוזי מלך מומר ל-DHA בשיעור נמוך מאוד ולא נספר כאן." },
];

// Base daily targets by trimester (1, 2, 3). kcal assumes ~2,000 kcal pre-pregnancy baseline
// (IOM: +0 / +340 / +452). Protein 71 g RDA — raised to 1.1 g/kg when weight is known.
window.TARGETS_BY_TRIMESTER = {
  kcal:      [2000, 2340, 2450],
  protein:   [71, 71, 71],
  carbs:     [175, 175, 175],
  fiber:     [28, 28, 28],
  fat:       [70, 75, 80],
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
