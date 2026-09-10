// Consultation chat + free-text meal parsing, via the artifact `sample` capability.
// Nothing is sent anywhere until the user presses Send / Parse.
window.NutriChat = (function () {
  let sampleFn = null, probed = false;
  async function getSample() {
    if (probed) return sampleFn;
    probed = true;
    try { sampleFn = window.claude && window.claude.use ? await window.claude.use("sample") : null; } catch (e) { sampleFn = null; }
    return sampleFn;
  }

  const INSTRUCTIONS = `את/ה דיאטנ/ית קליני/ת שמלווה אישה בהריון במעקב תזונתי יומי. עני בעברית, בגובה העיניים, קצר וממוקד (עד ~8 שורות אלא אם התבקש פירוט).
כללים:
- התייחסי תמיד למצב של היום: מה כבר הושג, מה חסר, ומה כל אופציה שנשאלת עליה תוסיף (בערכים מספריים כשאפשר).
- העדיפי את סדר העדיפויות של המשתמשת: חלבון, פחמימות (פיזור לאורך היום), ברזל; ואז רכיבים שחסרים היום.
- תני תשובה ברורה (כן/לא/עדיף X) ולא רשימה של "תלוי".
- שימי לב לבטיחות מזון בהריון (בשר/דג לא מבושל, גבינות לא מפוסטרות, כספית בדגים, קפאין, אלכוהול) — הזכירי רק אם רלוונטי לשאלה.
- אם השאלה רפואית באמת (סימפטומים, תרופות, ערכי מעבדה מדאיגים) — הפני לרופא/ה, אבל עדיין תני את המידע התזונתי.
- אל תמציאי ערכים לבדיקות שלא סופקו.
להלן ההקשר המעודכן להיום:`;

  // Compact context (aim < 6K chars)
  function buildContext(app) {
    const d = app.state;
    const day = app.today();
    const t = app.targetsFor(app.dateKey());
    const tot = app.dayTotals(app.dateKey(), { includeSupplements: true });
    const totFood = app.dayTotals(app.dateKey(), { includeSupplements: false });
    const lines = [];
    const ctx = app.pregCtx();
    lines.push(`תאריך: ${app.dateKey()} (שעה ${new Date().getHours()}:00). שבוע הריון: ${ctx.week || "לא ידוע"} (טרימסטר ${ctx.trimester || "?"}).`);
    if (d.profile) {
      const p = d.profile;
      const parts = [];
      if (p.height_cm) parts.push(`גובה ${p.height_cm} ס"מ`);
      if (p.prepreg_weight_kg) parts.push(`משקל לפני ההריון ${p.prepreg_weight_kg} ק"ג`);
      if (ctx.weightKg) parts.push(`משקל נוכחי ${ctx.weightKg} ק"ג`);
      if (ctx.bmi) parts.push(`BMI לפני ההריון ${ctx.bmi.toFixed(1)}`);
      if (ctx.gainKg != null) parts.push(`עלייה עד כה ${ctx.gainKg.toFixed(1)} ק"ג`);
      if (p.diet_type && p.diet_type !== "omnivore") parts.push(`תזונה: ${p.diet_type}`);
      if (p.allergies) parts.push(`אלרגיות/הגבלות: ${p.allergies}`);
      if (parts.length) lines.push("פרופיל: " + parts.join(", ") + ".");
    }
    if (d.diagnoses && d.diagnoses.length) lines.push("אבחנות: " + d.diagnoses.map((x) => (window.DIAGNOSES.find((q) => q.key === x.code) || { he: x.code }).he + (x.note ? ` (${x.note})` : "")).join("; ") + ".");
    const labs = Object.values(ctx.labs || {});
    if (labs.length) lines.push("בדיקות אחרונות: " + labs.map((l) => `${l.he} ${l.value} ${l.unit} (${l.date})`).join("; ") + ".");
    const notes = app.rulesNotes();
    if (notes.length) lines.push("הערות ממנוע ההמלצות: " + notes.map((n) => n.text).join(" | "));
    lines.push("מצב היום (הושג / יעד, כולל תוספים; בסוגריים – ממזון בלבד):");
    window.NUTRIENTS.forEach((n) => {
      const v = tot[n.key] || 0, tv = t[n.key];
      if (!tv) return;
      lines.push(`- ${n.he}: ${app.fmt(v)} / ${app.fmt(tv)} ${n.unit} (${Math.round((v / tv) * 100)}%${totFood[n.key] !== v ? `, ממזון ${app.fmt(totFood[n.key] || 0)}` : ""})`);
    });
    const meals = (day.meals || []);
    if (meals.length) lines.push("מה נאכל היום: " + meals.map((m) => `${m.time || ""} ${m.name} ${m.qty} ${m.unit}`).join("; "));
    else lines.push("עדיין לא נרשם אוכל היום.");
    const supps = (d.supplements || []).filter((s) => s.active !== false);
    if (supps.length) lines.push("תוספים קבועים (נלקח/יחידות ליום): " + supps.map((s) => `${s.name} ${app.suppTaken(day, s)}/${app.suppDoses(s)}`).join(", ") + ".");
    const favs = (d.foods || []).filter((f) => f.favorite).slice(0, 25);
    if (favs.length) lines.push("מאכלים שהיא אוהבת ויש לה בבית: " + favs.map((f) => f.name).join(", ") + ".");
    return lines.join("\n").slice(0, 7000);
  }

  async function send(app, userText, ui) {
    const sample = await getSample();
    if (!sample) throw { code: "not_granted", message: "sample unavailable" };
    const hist = (app.state.chat && app.state.chat.turns) || [];
    const turns = hist.slice(-12).map((t) => ({ role: t.role === "ai" ? "assistant" : "user", content: t.content }));
    turns.push({ role: "user", content: userText });
    const input = [{ role: "user", content: INSTRUCTIONS + "\n\n" + buildContext(app) }, ...turns];
    const ctl = new AbortController();
    ui.onStart && ui.onStart(ctl);
    const res = await sample(input, {
      cache: false,
      signal: ctl.signal,
      onText: ({ text }) => ui.onText && ui.onText(text),
    });
    return res;
  }

  async function canSendImages() {
    const sample = await getSample();
    if (!sample || !sample.limits) return false;
    try { const caps = await sample.limits(); return !!(caps && caps.images); } catch (e) { return false; }
  }

  // Free-text (and/or photo) meal parsing → [{name, qty, unit}]
  async function parseMeal(app, text, image) {
    const sample = await getSample();
    if (!sample) throw { code: "not_granted", message: "sample unavailable" };
    const known = (app.state.foods || []).map((f) => f.name).concat(window.FOODS_GENERIC.map((f) => f[1])).slice(0, 400);
    const prompt = `פרקי את תיאור הארוחה הבא לפריטים. השיבי אך ורק במערך JSON של אובייקטים {"name": string, "qty": number, "unit": string} — בלי טקסט נוסף.
"unit" הוא אחד מ: "גרם", "מ"ל", "יחידה", "כוס", "כף", "כפית", "פרוסה", "מנה", "חופן", "קובייה", "גביע", "קופסה", "פיתה", "כדור".
אם אפשר, השתמשי בשמות מהרשימה הבאה (שמות מוכרים למערכת): ${known.join(", ")}.
אם פריט לא ברשימה — כתבי את שמו הפשוט ביותר.
דוגמה: "אכלתי 2 פרוסות לחם מלא עם טחינה וסלט" → [{"name":"לחם מלא","qty":2,"unit":"פרוסה"},{"name":"טחינה מוכנה","qty":1,"unit":"כף"},{"name":"סלט ירקות קצוץ","qty":1,"unit":"קערה"}]

${image ? "מצורפת תמונה של הארוחה: זהי את הפריטים בתמונה והעריכי כמויות סבירות; התיאור הכתוב (אם יש) גובר על ההערכה מהתמונה.\n" : ""}התיאור: ${text || "(ראי תמונה)"}`;
    const opts = { modelTier: image ? "default" : "quick", cache: false };
    if (image) opts.images = image;
    const out = await sample.json(prompt, opts);
    return Array.isArray(out) ? out : [];
  }

  function errorText(e) {
    const code = e && e.code;
    switch (code) {
      case "not_granted": case "sampling_disabled": case "not_declared": case "capability_disabled": case "capability_removed":
        return "הצ'אט לא זמין בתצוגה הזו (נדרש אישור שימוש ב-Claude מתוך claude.ai).";
      case "rate_limited": return "יותר מדי בקשות או שנגמרה מכסת השימוש — נסי שוב מאוחר יותר.";
      case "session_expired": return "פג תוקף ההתחברות — התחברי מחדש ל-claude.ai.";
      case "cancelled": return "";
      case "refused": return "Claude לא ענה על השאלה הזו. נסי לנסח אחרת.";
      case "prompt_too_large": return "ההקשר גדול מדי — נסי לקצר את השאלה.";
      case "invalid_json": return "לא הצלחתי לפרק את הטקסט לפריטים. נסי לנסח פשוט יותר (למשל: 2 פרוסות לחם, כף טחינה).";
      default: return "משהו השתבש (" + (code || "שגיאה") + "). נסי שוב.";
    }
  }

  return { getSample, canSendImages, buildContext, send, parseMeal, errorText, INSTRUCTIONS };
})();
