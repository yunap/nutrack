require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

// --- DB setup ---
const dbPath = process.env.DATA_DIR || path.join(__dirname, 'data');
const thumbPath = path.join(dbPath, 'thumbs');
if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });
if (!fs.existsSync(thumbPath)) fs.mkdirSync(thumbPath, { recursive: true });

const mealsDb = low(new FileSync(path.join(dbPath, 'meals.json')));
mealsDb.defaults({ meals: [] }).write();

const settingsDb = low(new FileSync(path.join(dbPath, 'settings.json')));
settingsDb.defaults({
  targets: {
    calories: 2000, protein_g: 50, carbs_g: 275, fat_g: 78, fiber_g: 28, sugar_g: 50,
    sodium_mg: 2300, potassium_mg: 4700, calcium_mg: 1300, iron_mg: 18, magnesium_mg: 420,
    phosphorus_mg: 1250, zinc_mg: 11, vitamin_a_mcg: 900, vitamin_c_mg: 90,
    vitamin_d_mcg: 20, vitamin_e_mg: 15, vitamin_k_mcg: 120, vitamin_b1_mg: 1.2,
    vitamin_b2_mg: 1.3, vitamin_b3_mg: 16, vitamin_b6_mg: 1.7, vitamin_b12_mcg: 2.4,
    folate_mcg: 400
  },
  priorityNutrients: ['protein_g', 'calcium_mg', 'vitamin_d_mcg', 'vitamin_c_mg', 'iron_mg', 'magnesium_mg']
}).write();

const libraryDb = low(new FileSync(path.join(dbPath, 'library.json')));
libraryDb.defaults({ meals: [] }).write();

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Serve saved thumbnails
app.use('/thumbs', express.static(thumbPath));

// ── Save image buffer to disk, return filename ────────────────────────────────
function saveThumb(buffer, mime) {
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const filename = Date.now() + '_' + Math.random().toString(36).slice(2) + '.' + ext;
  fs.writeFileSync(path.join(thumbPath, filename), buffer);
  return filename;
}
function saveThumbFromBase64(base64, mime) {
  if (!base64) return null;
  try { return saveThumb(Buffer.from(base64, 'base64'), mime || 'image/jpeg'); }
  catch(e) { return null; }
}

// ── Analyze from photo ──────────────────────────────────────────────────────
app.post('/api/analyze', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image provided' });
    const base64 = req.file.buffer.toString('base64');
    const mime = req.file.mimetype || 'image/jpeg';
    const result = await callClaude(base64, mime, null);
    // save thumbnail to disk and return filename so frontend can store it
    result._thumbFile = saveThumb(req.file.buffer, mime);
    result._mime = mime;
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── Analyze from recipe URL ──────────────────────────────────────────────────
app.post('/api/analyze-url', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || !url.trim()) return res.status(400).json({ error: 'No URL provided' });

    // basic URL validation
    let parsed;
    try { parsed = new URL(url.trim()); } catch(e) {
      return res.status(400).json({ error: 'Invalid URL — please include https://' });
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'Only http/https URLs are supported' });
    }

    // fetch the page
    let html;
    try {
      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), 10000);
      const pageRes = await fetch(url.trim(), {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NutritionTracker/1.0)' },
        redirect: 'follow',
        signal: controller.signal
      });
      clearTimeout(fetchTimeout);
      if (!pageRes.ok) return res.status(400).json({ error: `Could not fetch page (HTTP ${pageRes.status})` });
      html = await pageRes.text();
    } catch(e) {
      return res.status(400).json({ error: `Could not reach URL: ${e.message}` });
    }

    // strip HTML tags to get readable text (keep it under ~8000 chars for the prompt)
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 8000);

    const result = await callClaudeUrl(url.trim(), text);
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});


app.post('/api/analyze-text', async (req, res) => {
  try {
    const { description } = req.body;
    if (!description || !description.trim()) return res.status(400).json({ error: 'No description provided' });
    const result = await callClaudeText(description.trim());
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── Re-analyze with corrections ─────────────────────────────────────────────
app.post('/api/reanalyze', async (req, res) => {
  try {
    const { imageBase64, imageMime, thumbFile, ingredients } = req.body;
    if (!ingredients) return res.status(400).json({ error: 'Missing ingredients' });
    let base64 = imageBase64;
    // if no base64 sent but we have a thumbFile, load it from disk
    if (!base64 && thumbFile) {
      const fp = path.join(thumbPath, thumbFile);
      if (fs.existsSync(fp)) base64 = fs.readFileSync(fp).toString('base64');
    }
    if (!base64) return res.status(400).json({ error: 'No image available for reanalysis' });
    const result = await callClaude(base64, imageMime || 'image/jpeg', ingredients);
    result._thumbFile = thumbFile || null;
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── Save meal to daily log ───────────────────────────────────────────────────
app.post('/api/meals', async (req, res) => {
  try {
    const { nutrition, mealType, thumbFile, date } = req.body;
    if (!nutrition) return res.status(400).json({ error: 'Missing nutrition data' });
    const meal = {
      id: Date.now().toString(),
      date: date || new Date().toISOString().split('T')[0],
      time: new Date().toISOString(),
      mealType: mealType || 'snack',
      nutrition,
      thumbFile: thumbFile || null
    };
    mealsDb.get('meals').push(meal).write();
    res.json({ success: true, meal });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Get meals for a date ─────────────────────────────────────────────────────
app.get('/api/meals/:date', (req, res) => {
  res.json(mealsDb.get('meals').filter({ date: req.params.date }).value());
});

// ── Get all unique dates ─────────────────────────────────────────────────────
app.get('/api/dates', (req, res) => {
  const all = mealsDb.get('meals').value();
  const dates = [...new Set(all.map(m => m.date))].sort().reverse();
  res.json(dates);
});

// ── Delete a logged meal ─────────────────────────────────────────────────────
app.delete('/api/meals/:id', (req, res) => {
  mealsDb.get('meals').remove({ id: req.params.id }).write();
  res.json({ success: true });
});

// ── Daily summary ─────────────────────────────────────────────────────────────
app.get('/api/summary/:date', (req, res) => {
  const meals = mealsDb.get('meals').filter({ date: req.params.date }).value();
  if (!meals.length) return res.json(null);
  const summary = sumNutrition(meals.map(m => m.nutrition));
  summary.mealCount = meals.length;
  summary.meals = meals;
  res.json(summary);
});

// ── Compare two dates ─────────────────────────────────────────────────────────
app.get('/api/compare', (req, res) => {
  const { date1, date2 } = req.query;
  if (!date1 || !date2) return res.status(400).json({ error: 'Need date1 and date2' });
  const meals1 = mealsDb.get('meals').filter({ date: date1 }).value();
  const meals2 = mealsDb.get('meals').filter({ date: date2 }).value();
  res.json({
    date1: { date: date1, summary: meals1.length ? sumNutrition(meals1.map(m => m.nutrition)) : null, mealCount: meals1.length },
    date2: { date: date2, summary: meals2.length ? sumNutrition(meals2.map(m => m.nutrition)) : null, mealCount: meals2.length }
  });
});

// ══ MEAL LIBRARY ══════════════════════════════════════════════════════════════

app.get('/api/library', (req, res) => {
  res.json(libraryDb.get('meals').value());
});

app.post('/api/library', async (req, res) => {
  try {
    const { nutrition, imageBase64, imageMime, thumbFile, defaultMealType } = req.body;
    if (!nutrition) return res.status(400).json({ error: 'Missing nutrition data' });
    const existing = libraryDb.get('meals').find({ name: nutrition.meal_name }).value();
    if (existing) return res.json({ success: true, meal: existing, duplicate: true });
    // use existing thumbFile if available, otherwise save from base64
    const tf = thumbFile || saveThumbFromBase64(imageBase64, imageMime);
    const meal = {
      id: 'lib_' + Date.now().toString(),
      savedAt: new Date().toISOString(),
      name: nutrition.meal_name,
      defaultMealType: defaultMealType || 'snack',
      nutrition,
      thumbFile: tf
    };
    libraryDb.get('meals').push(meal).write();
    res.json({ success: true, meal });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/library/:id', (req, res) => {
  libraryDb.get('meals').remove({ id: req.params.id }).write();
  res.json({ success: true });
});

app.post('/api/library/:id/log', async (req, res) => {
  try {
    const libMeal = libraryDb.get('meals').find({ id: req.params.id }).value();
    if (!libMeal) return res.status(404).json({ error: 'Library meal not found' });
    const { mealType, date } = req.body;
    const meal = {
      id: Date.now().toString(),
      date: date || new Date().toISOString().split('T')[0],
      time: new Date().toISOString(),
      mealType: mealType || libMeal.defaultMealType || 'snack',
      nutrition: libMeal.nutrition,
      thumbFile: libMeal.thumbFile,
      fromLibrary: true,
      libraryId: libMeal.id
    };
    mealsDb.get('meals').push(meal).write();
    res.json({ success: true, meal });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══ SETTINGS ═════════════════════════════════════════════════════════════════

app.get('/api/settings', (req, res) => { res.json(settingsDb.value()); });

app.put('/api/settings/targets', (req, res) => {
  const { targets } = req.body;
  if (!targets) return res.status(400).json({ error: 'Missing targets' });
  settingsDb.set('targets', targets).write();
  res.json({ success: true });
});

app.put('/api/settings/priority', (req, res) => {
  const { priorityNutrients } = req.body;
  if (!priorityNutrients) return res.status(400).json({ error: 'Missing priorityNutrients' });
  settingsDb.set('priorityNutrients', priorityNutrients).write();
  res.json({ success: true });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const NUTR_KEYS = ['calories','protein_g','carbs_g','fat_g','fiber_g','sugar_g',
  'sodium_mg','potassium_mg','calcium_mg','iron_mg','magnesium_mg','phosphorus_mg','zinc_mg',
  'vitamin_a_mcg','vitamin_c_mg','vitamin_d_mcg','vitamin_e_mg','vitamin_k_mcg',
  'vitamin_b1_mg','vitamin_b2_mg','vitamin_b3_mg','vitamin_b6_mg','vitamin_b12_mcg','folate_mcg'];

function sumNutrition(nutritionArray) {
  const sum = {};
  NUTR_KEYS.forEach(k => { sum[k] = 0; });
  nutritionArray.forEach(n => { NUTR_KEYS.forEach(k => { sum[k] += (parseFloat(n[k]) || 0); }); });
  NUTR_KEYS.forEach(k => { sum[k] = Math.round(sum[k] * 10) / 10; });
  return sum;
}

function buildPrompt(corrections) {
  const note = corrections ? `\n\nIMPORTANT: The user has corrected the ingredients. Use EXACTLY these and recalculate:\n${corrections}` : '';
  return `You are a professional nutritionist analyzing a meal photo. Return ONLY a valid JSON object (no markdown, no backticks, no extra text).

CRITICAL INSTRUCTIONS:
1. If a nutrition label is visible in the photo, READ IT CAREFULLY and use the exact values from the label scaled to the actual portion shown. Do not guess when label data is available.
2. Identify all food items and containers visible. Pay close attention to portion sizes — use measuring cups, plates, or other size references in the photo.
3. If the same food has different plausible identities (e.g. white soft food could be farmers cheese, ricotta, yogurt, or tofu), describe what you see precisely in the ingredients list.

Return this JSON structure:
{"meal_name":"string","description":"string (include estimated portion sizes)","ingredients":[{"name":"string","quantity":"string","notes":"string (include any label-sourced info or uncertainty)"}],
"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0,"sodium_mg":0,"potassium_mg":0,
"calcium_mg":0,"iron_mg":0,"magnesium_mg":0,"phosphorus_mg":0,"zinc_mg":0,"vitamin_a_mcg":0,"vitamin_c_mg":0,
"vitamin_d_mcg":0,"vitamin_e_mg":0,"vitamin_k_mcg":0,"vitamin_b1_mg":0,"vitamin_b2_mg":0,"vitamin_b3_mg":0,
"vitamin_b6_mg":0,"vitamin_b12_mcg":0,"folate_mcg":0}${note}

Replace all 0s with your best estimates.`;
}

async function callClaudeUrl(url, pageText) {
  const prompt = `You are a professional nutritionist. A user has provided a recipe URL and the extracted page text below.

Your job:
1. Find the recipe ingredients and serving size in the text
2. Calculate the nutrition for ONE serving of this recipe
3. Return ONLY a valid JSON object (no markdown, no backticks, no extra text)

Recipe URL: ${url}
Page text:
---
${pageText}
---

Return this JSON:
{"meal_name":"string (recipe name)","description":"string (brief description, include serving size)","ingredients":[{"name":"string","quantity":"string (per serving)","notes":"string"}],
"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0,"sodium_mg":0,"potassium_mg":0,
"calcium_mg":0,"iron_mg":0,"magnesium_mg":0,"phosphorus_mg":0,"zinc_mg":0,"vitamin_a_mcg":0,"vitamin_c_mg":0,
"vitamin_d_mcg":0,"vitamin_e_mg":0,"vitamin_k_mcg":0,"vitamin_b1_mg":0,"vitamin_b2_mg":0,"vitamin_b3_mg":0,
"vitamin_b6_mg":0,"vitamin_b12_mcg":0,"folate_mcg":0}

If you cannot find a recipe in the page text, set meal_name to "Recipe not found" and all numbers to 0.
Replace all 0s with your best nutritional estimates per serving.`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] })
  });
  if (!resp.ok) { const e = await resp.json(); throw new Error(e.error?.message || `API error ${resp.status}`); }
  const data = await resp.json();
  return JSON.parse(data.content.map(c => c.text || '').join('').replace(/```json|```/g, '').trim());
}

async function callClaudeText(description) {
  const prompt = `You are a professional nutritionist. The user has described a meal. Return ONLY a valid JSON object (no markdown, no backticks, no extra text):
{"meal_name":"string","description":"string","ingredients":[{"name":"string","quantity":"string","notes":"string"}],
"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0,"sodium_mg":0,"potassium_mg":0,
"calcium_mg":0,"iron_mg":0,"magnesium_mg":0,"phosphorus_mg":0,"zinc_mg":0,"vitamin_a_mcg":0,"vitamin_c_mg":0,
"vitamin_d_mcg":0,"vitamin_e_mg":0,"vitamin_k_mcg":0,"vitamin_b1_mg":0,"vitamin_b2_mg":0,"vitamin_b3_mg":0,
"vitamin_b6_mg":0,"vitamin_b12_mcg":0,"folate_mcg":0}

Meal description: "${description}"

Replace all 0s with realistic nutritional estimates based on the described ingredients and quantities.`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] })
  });
  if (!resp.ok) { const e = await resp.json(); throw new Error(e.error?.message || `API error ${resp.status}`); }
  const data = await resp.json();
  return JSON.parse(data.content.map(c => c.text || '').join('').replace(/```json|```/g, '').trim());
}

async function callClaude(base64, mime, corrections) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514', max_tokens: 1500,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
        { type: 'text', text: buildPrompt(corrections) }
      ]}]
    })
  });
  if (!resp.ok) { const e = await resp.json(); throw new Error(e.error?.message || `API error ${resp.status}`); }
  const data = await resp.json();
  return JSON.parse(data.content.map(c => c.text || '').join('').replace(/```json|```/g, '').trim());
}

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`\n✅ Meal Nutrition Tracker v3 running at http://localhost:${PORT}\n`));
}

module.exports = { app, sumNutrition };
