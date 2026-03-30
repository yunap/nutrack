require('dotenv').config();
const express  = require('express');
const multer   = require('multer');
const fetch    = require('node-fetch');
const path     = require('path');
const fs       = require('fs');
const low      = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

// ── Base data directory (overridable for tests) ───────────────────────────────
const BASE_DIR  = process.env.DATA_DIR || path.join(__dirname, 'data');
const THUMB_DIR = path.join(BASE_DIR, 'thumbs');
const PROF_DIR  = path.join(BASE_DIR, 'profiles');

[BASE_DIR, THUMB_DIR, PROF_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ── Global profiles registry ──────────────────────────────────────────────────
const profilesDb = low(new FileSync(path.join(BASE_DIR, 'profiles.json')));
profilesDb.defaults({ profiles: [] }).write();

// ── Per-profile DB cache ──────────────────────────────────────────────────────
const _dbCache = {};

function profileDir(profileId) {
  const dir = path.join(PROF_DIR, profileId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getProfileDbs(profileId) {
  if (_dbCache[profileId]) return _dbCache[profileId];
  const dir = profileDir(profileId);

  const mealsDb = low(new FileSync(path.join(dir, 'meals.json')));
  mealsDb.defaults({ meals: [] }).write();

  const settingsDb = low(new FileSync(path.join(dir, 'settings.json')));
  settingsDb.defaults({
    targets: {
      calories: 2000, protein_g: 50, carbs_g: 275, fat_g: 78, fiber_g: 28, sugar_g: 50,
      sodium_mg: 2300, potassium_mg: 4700, calcium_mg: 1300, iron_mg: 18, magnesium_mg: 420,
      phosphorus_mg: 1250, zinc_mg: 11, vitamin_a_mcg: 900, vitamin_c_mg: 90,
      vitamin_d_mcg: 20, vitamin_e_mg: 15, vitamin_k1_mcg: 120, vitamin_k2_mcg: 200, vitamin_b1_mg: 1.2,
      vitamin_b2_mg: 1.3, vitamin_b3_mg: 16, vitamin_b6_mg: 1.7, vitamin_b12_mcg: 2.4,
      folate_mcg: 400,
      omega3_mg: 1600,
      copper_mg: 0.9
    },
    priorityNutrients: ['protein_g', 'calcium_mg', 'vitamin_d_mcg', 'vitamin_c_mg', 'iron_mg', 'magnesium_mg']
  }).write();

  const libraryDb = low(new FileSync(path.join(dir, 'library.json')));
  libraryDb.defaults({ meals: [] }).write();

  const supplementsDb = low(new FileSync(path.join(dir, 'supplements.json')));
  supplementsDb.defaults({ supplements: [] }).write();

  const suppLogDb = low(new FileSync(path.join(dir, 'supplog.json')));
  suppLogDb.defaults({ log: [] }).write();

  _dbCache[profileId] = { mealsDb, settingsDb, libraryDb, supplementsDb, suppLogDb };
  return _dbCache[profileId];
}

// ── Middleware: resolve profile from x-profile-id header ─────────────────────
function requireProfile(req, res, next) {
  const profileId = req.headers['x-profile-id'] || req.query.profileId;
  if (!profileId) return res.status(400).json({ error: 'Missing profile ID (x-profile-id header)' });
  const exists = profilesDb.get('profiles').find({ id: profileId }).value();
  if (!exists) return res.status(404).json({ error: `Profile "${profileId}" not found` });
  req.profileId = profileId;
  req.dbs = getProfileDbs(profileId);
  next();
}

// ── App setup ─────────────────────────────────────────────────────────────────
const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/thumbs', express.static(THUMB_DIR));

function saveThumb(buffer, mime) {
  if (!buffer || buffer.length < 512) return null;
  // validate it's actually an image by checking magic bytes
  const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
  const isPng  = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
  const isWebp = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
  if (!isJpeg && !isPng && !isWebp) return null;
  const ext = isPng ? 'png' : isWebp ? 'webp' : 'jpg';
  const filename = Date.now() + '_' + Math.random().toString(36).slice(2) + '.' + ext;
  fs.writeFileSync(path.join(THUMB_DIR, filename), buffer);
  return filename;
}
function saveThumbFromBase64(base64, mime) {
  if (!base64 || base64.length < 512) return null;
  try { return saveThumb(Buffer.from(base64, 'base64'), mime || 'image/jpeg'); }
  catch(e) { return null; }
}

// ══ PROFILE ROUTES ════════════════════════════════════════════════════════════

app.get('/api/profiles', (req, res) => {
  res.json(profilesDb.get('profiles').value());
});

app.post('/api/profiles', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Profile name is required' });
  const trimmed = name.trim();
  const id = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') + '_' + Date.now();
  const existing = profilesDb.get('profiles').find(p => p.name.toLowerCase() === trimmed.toLowerCase()).value();
  if (existing) return res.status(400).json({ error: `A profile named "${trimmed}" already exists` });
  const profile = { id, name: trimmed, createdAt: new Date().toISOString(), avatar: trimmed[0].toUpperCase() };
  profilesDb.get('profiles').push(profile).write();
  profileDir(id);
  res.json({ success: true, profile });
});

app.delete('/api/profiles/:id', (req, res) => {
  const { id } = req.params;
  const exists = profilesDb.get('profiles').find({ id }).value();
  if (!exists) return res.status(404).json({ error: 'Profile not found' });
  profilesDb.get('profiles').remove({ id }).write();
  delete _dbCache[id];
  res.json({ success: true });
});

// ══ ANALYSIS ROUTES (profile-agnostic) ═══════════════════════════════════════

app.post('/api/analyze', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image provided' });
    const base64 = req.file.buffer.toString('base64');
    const mime   = req.file.mimetype || 'image/jpeg';
    const result = await callClaude(base64, mime, null);
    result._thumbFile = saveThumb(req.file.buffer, mime);
    result._mime = mime;
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

app.post('/api/analyze-url', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || !url.trim()) return res.status(400).json({ error: 'No URL provided' });
    let parsed;
    try { parsed = new URL(url.trim()); } catch(e) {
      return res.status(400).json({ error: 'Invalid URL — please include https://' });
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'Only http/https URLs are supported' });
    }
    let html;
    try {
      const controller   = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), 10000);
      const pageRes = await fetch(url.trim(), {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NutritionTracker/1.0)' },
        redirect: 'follow', signal: controller.signal
      });
      clearTimeout(fetchTimeout);
      if (!pageRes.ok) return res.status(400).json({ error: `Could not fetch page (HTTP ${pageRes.status})` });
      html = await pageRes.text();
    } catch(e) {
      return res.status(400).json({ error: `Could not reach URL: ${e.message}` });
    }
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ').trim().substring(0, 8000);
    const result = await callClaudeUrl(url.trim(), text);
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.post('/api/reanalyze', requireProfile, async (req, res) => {
  try {
    const { imageBase64, imageMime, thumbFile, ingredients } = req.body;
    if (!ingredients) return res.status(400).json({ error: 'Missing ingredients' });
    let base64 = imageBase64;
    if (!base64 && thumbFile) {
      const fp = path.join(THUMB_DIR, thumbFile);
      if (fs.existsSync(fp)) base64 = fs.readFileSync(fp).toString('base64');
    }
    if (!base64) return res.status(400).json({ error: 'No image available for reanalysis' });
    const result = await callClaude(base64, imageMime || 'image/jpeg', ingredients);
    result._thumbFile = thumbFile || null;
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ══ PROFILE-SCOPED ROUTES ═════════════════════════════════════════════════════

app.post('/api/meals', requireProfile, (req, res) => {
  try {
    const { nutrition, mealType, thumbFile, date } = req.body;
    if (!nutrition) return res.status(400).json({ error: 'Missing nutrition data' });
    const meal = {
      id: Date.now().toString(), date: date || new Date().toISOString().split('T')[0],
      time: new Date().toISOString(), mealType: mealType || 'snack', nutrition,
      thumbFile: thumbFile || null
    };
    req.dbs.mealsDb.get('meals').push(meal).write();
    res.json({ success: true, meal });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Lazy thumbnail migration: convert old base64 thumbnail → disk file ────────
function isThumbFileValid(thumbFile) {
  if (!thumbFile) return false;
  const fp = path.join(THUMB_DIR, thumbFile);
  if (!fs.existsSync(fp)) return false;
  const buf = fs.readFileSync(fp);
  if (buf.length < 512) return false;
  return (buf[0] === 0xFF && buf[1] === 0xD8) || // JPEG
         (buf[0] === 0x89 && buf[1] === 0x50) || // PNG
         (buf[0] === 0x52 && buf[1] === 0x49);   // WEBP
}

function migrateMealThumbs(db) {
  const meals = db.get('meals').value();
  meals.forEach(meal => {
    // clean up corrupt existing thumbFile
    if (meal.thumbFile && !isThumbFileValid(meal.thumbFile)) {
      const fp = path.join(THUMB_DIR, meal.thumbFile);
      if (fs.existsSync(fp)) try { fs.unlinkSync(fp); } catch(e) {}
      db.get('meals').find({ id: meal.id }).unset('thumbFile').write();
      meal.thumbFile = null;
    }
    // convert old base64 thumbnail to disk file
    if (meal.thumbnail && !meal.thumbFile) {
      const thumbFile = saveThumbFromBase64(meal.thumbnail, 'image/jpeg');
      if (thumbFile) {
        db.get('meals').find({ id: meal.id }).assign({ thumbFile }).unset('thumbnail').write();
      } else {
        db.get('meals').find({ id: meal.id }).unset('thumbnail').write();
      }
    }
  });
}

app.get('/api/meals/:date', requireProfile, (req, res) => {
  migrateMealThumbs(req.dbs.mealsDb);
  res.json(req.dbs.mealsDb.get('meals').filter({ date: req.params.date }).value());
});

app.get('/api/dates', requireProfile, (req, res) => {
  const all   = req.dbs.mealsDb.get('meals').value();
  const dates = [...new Set(all.map(m => m.date))].sort().reverse();
  res.json(dates);
});

app.delete('/api/meals/:id', requireProfile, (req, res) => {
  req.dbs.mealsDb.get('meals').remove({ id: req.params.id }).write();
  res.json({ success: true });
});

app.get('/api/summary/:date', requireProfile, (req, res) => {
  migrateMealThumbs(req.dbs.mealsDb);
  const meals = req.dbs.mealsDb.get('meals').filter({ date: req.params.date }).value();
  if (!meals.length) return res.json(null);

  // for meals from library, always use the library's current thumbFile
  const enriched = meals.map(meal => {
    if (meal.fromLibrary && meal.libraryId) {
      const libMeal = req.dbs.libraryDb.get('meals').find({ id: meal.libraryId }).value();
      if (libMeal && libMeal.thumbFile && isThumbFileValid(libMeal.thumbFile)) {
        return { ...meal, thumbFile: libMeal.thumbFile };
      }
    }
    return meal;
  });

  const summary = sumNutrition(enriched.map(m => m.nutrition));
  summary.mealCount = enriched.length;
  summary.meals = enriched;
  res.json(summary);
});

app.get('/api/compare', requireProfile, (req, res) => {
  const { date1, date2 } = req.query;
  if (!date1 || !date2) return res.status(400).json({ error: 'Need date1 and date2' });
  const meals1 = req.dbs.mealsDb.get('meals').filter({ date: date1 }).value();
  const meals2 = req.dbs.mealsDb.get('meals').filter({ date: date2 }).value();
  res.json({
    date1: { date: date1, summary: meals1.length ? sumNutrition(meals1.map(m => m.nutrition)) : null, mealCount: meals1.length },
    date2: { date: date2, summary: meals2.length ? sumNutrition(meals2.map(m => m.nutrition)) : null, mealCount: meals2.length }
  });
});

app.get('/api/library', requireProfile, (req, res) => {
  const lib = req.dbs.libraryDb;
  lib.get('meals').value().forEach(meal => {
    // clean up corrupt existing thumbFile
    if (meal.thumbFile && !isThumbFileValid(meal.thumbFile)) {
      const fp = path.join(THUMB_DIR, meal.thumbFile);
      if (fs.existsSync(fp)) try { fs.unlinkSync(fp); } catch(e) {}
      lib.get('meals').find({ id: meal.id }).unset('thumbFile').write();
      meal.thumbFile = null;
    }
    // convert old base64 thumbnail to disk file
    if (meal.thumbnail && !meal.thumbFile) {
      const thumbFile = saveThumbFromBase64(meal.thumbnail, 'image/jpeg');
      if (thumbFile) lib.get('meals').find({ id: meal.id }).assign({ thumbFile }).unset('thumbnail').write();
      else           lib.get('meals').find({ id: meal.id }).unset('thumbnail').write();
    }
  });
  res.json(lib.get('meals').value());
});

app.post('/api/library', requireProfile, (req, res) => {
  try {
    const { nutrition, imageBase64, imageMime, thumbFile, defaultMealType } = req.body;
    if (!nutrition) return res.status(400).json({ error: 'Missing nutrition data' });
    const existing = req.dbs.libraryDb.get('meals').find({ name: nutrition.meal_name }).value();
    if (existing) return res.json({ success: true, meal: existing, duplicate: true });
    const tf = thumbFile || saveThumbFromBase64(imageBase64, imageMime);
    const meal = {
      id: 'lib_' + Date.now().toString(), savedAt: new Date().toISOString(),
      name: nutrition.meal_name, defaultMealType: defaultMealType || 'snack',
      nutrition, thumbFile: tf
    };
    req.dbs.libraryDb.get('meals').push(meal).write();
    res.json({ success: true, meal });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/library/:id', requireProfile, (req, res) => {
  req.dbs.libraryDb.get('meals').remove({ id: req.params.id }).write();
  res.json({ success: true });
});

// ── Upload / replace photo for a library entry ────────────────────────────────
app.post('/api/library/:id/photo', requireProfile, upload.single('image'), (req, res) => {
  try {
    const meal = req.dbs.libraryDb.get('meals').find({ id: req.params.id }).value();
    if (!meal) return res.status(404).json({ error: 'Library meal not found' });
    if (!req.file) return res.status(400).json({ error: 'No image provided' });

    // delete old thumb file if it exists
    if (meal.thumbFile) {
      const old = path.join(THUMB_DIR, meal.thumbFile);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }

    const thumbFile = saveThumb(req.file.buffer, req.file.mimetype || 'image/jpeg');
    req.dbs.libraryDb.get('meals').find({ id: req.params.id }).assign({ thumbFile }).write();
    res.json({ success: true, thumbFile });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/library/:id/log', requireProfile, (req, res) => {
  try {
    const libMeal = req.dbs.libraryDb.get('meals').find({ id: req.params.id }).value();
    if (!libMeal) return res.status(404).json({ error: 'Library meal not found' });
    const { mealType, date } = req.body;

    // always use the library's current (potentially freshly uploaded) thumbFile
    const thumbFile = (libMeal.thumbFile && isThumbFileValid(libMeal.thumbFile))
      ? libMeal.thumbFile : null;

    const meal = {
      id: Date.now().toString(), date: date || new Date().toISOString().split('T')[0],
      time: new Date().toISOString(), mealType: mealType || libMeal.defaultMealType || 'snack',
      nutrition: libMeal.nutrition, thumbFile,
      fromLibrary: true, libraryId: libMeal.id
    };
    req.dbs.mealsDb.get('meals').push(meal).write();
    res.json({ success: true, meal });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/settings', requireProfile, (req, res) => {
  res.json(req.dbs.settingsDb.value());
});

app.put('/api/settings/targets', requireProfile, (req, res) => {
  const { targets } = req.body;
  if (!targets) return res.status(400).json({ error: 'Missing targets' });
  req.dbs.settingsDb.set('targets', targets).write();
  res.json({ success: true });
});

app.put('/api/settings/priority', requireProfile, (req, res) => {
  const { priorityNutrients } = req.body;
  if (!priorityNutrients) return res.status(400).json({ error: 'Missing priorityNutrients' });
  req.dbs.settingsDb.set('priorityNutrients', priorityNutrients).write();
  res.json({ success: true });
});

app.put('/api/settings/priority', requireProfile, (req, res) => {
  const { priorityNutrients } = req.body;
  if (!priorityNutrients) return res.status(400).json({ error: 'Missing priorityNutrients' });
  req.dbs.settingsDb.set('priorityNutrients', priorityNutrients).write();
  res.json({ success: true });
});

// ══ SUPPLEMENT LIBRARY ════════════════════════════════════════════════════════

// Get all saved supplements
app.get('/api/supplements', requireProfile, (req, res) => {
  res.json(req.dbs.supplementsDb.get('supplements').value());
});

// Save a new supplement manually
app.post('/api/supplements', requireProfile, (req, res) => {
  try {
    const { name, nutrients } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Supplement name is required' });
    if (!nutrients || typeof nutrients !== 'object') return res.status(400).json({ error: 'Nutrients object is required' });
    const existing = req.dbs.supplementsDb.get('supplements').find(s => s.name.toLowerCase() === name.trim().toLowerCase()).value();
    if (existing) return res.status(400).json({ error: `A supplement named "${name.trim()}" already exists` });
    const supp = {
      id: 'supp_' + Date.now().toString(),
      name: name.trim(),
      nutrients,
      createdAt: new Date().toISOString()
    };
    req.dbs.supplementsDb.get('supplements').push(supp).write();
    res.json({ success: true, supplement: supp });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update a supplement
app.put('/api/supplements/:id', requireProfile, (req, res) => {
  try {
    const { name, nutrients } = req.body;
    const supp = req.dbs.supplementsDb.get('supplements').find({ id: req.params.id }).value();
    if (!supp) return res.status(404).json({ error: 'Supplement not found' });
    const updates = {};
    if (name && name.trim()) updates.name = name.trim();
    if (nutrients && typeof nutrients === 'object') updates.nutrients = nutrients;
    req.dbs.supplementsDb.get('supplements').find({ id: req.params.id }).assign(updates).write();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete a supplement
app.delete('/api/supplements/:id', requireProfile, (req, res) => {
  req.dbs.supplementsDb.get('supplements').remove({ id: req.params.id }).write();
  // also remove from any daily logs
  req.dbs.suppLogDb.get('log').remove({ supplementId: req.params.id }).write();
  res.json({ success: true });
});

// Analyze a supplement label photo
app.post('/api/supplements/analyze-label', requireProfile, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image provided' });
    const base64 = req.file.buffer.toString('base64');
    const mime   = req.file.mimetype || 'image/jpeg';
    const result = await callClaudeSuppLabel(base64, mime);
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ══ SUPPLEMENT DAILY LOG ══════════════════════════════════════════════════════

// Get supplement log for a date
app.get('/api/supplog/:date', requireProfile, (req, res) => {
  const entries = req.dbs.suppLogDb.get('log').filter({ date: req.params.date }).value();
  // enrich with supplement details
  const supps = req.dbs.supplementsDb.get('supplements').value();
  const enriched = entries.map(e => {
    const supp = supps.find(s => s.id === e.supplementId);
    return { ...e, supplement: supp || null };
  }).filter(e => e.supplement);
  res.json(enriched);
});

// Log taking a supplement on a date
app.post('/api/supplog', requireProfile, (req, res) => {
  try {
    const { supplementId, date, doses = 1 } = req.body;
    if (!supplementId) return res.status(400).json({ error: 'supplementId is required' });
    const supp = req.dbs.supplementsDb.get('supplements').find({ id: supplementId }).value();
    if (!supp) return res.status(404).json({ error: 'Supplement not found' });
    const logDate = date || new Date().toISOString().split('T')[0];
    // upsert — if already logged today, update doses
    const existing = req.dbs.suppLogDb.get('log').find({ supplementId, date: logDate }).value();
    if (existing) {
      req.dbs.suppLogDb.get('log').find({ supplementId, date: logDate }).assign({ doses }).write();
      return res.json({ success: true, updated: true });
    }
    const entry = {
      id: 'sl_' + Date.now().toString(),
      supplementId, date: logDate, doses,
      loggedAt: new Date().toISOString()
    };
    req.dbs.suppLogDb.get('log').push(entry).write();
    res.json({ success: true, entry });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Remove a supplement from a date's log
app.delete('/api/supplog/:supplementId/:date', requireProfile, (req, res) => {
  req.dbs.suppLogDb.get('log').remove({ supplementId: req.params.supplementId, date: req.params.date }).write();
  res.json({ success: true });
});

// Get total nutrients from supplements for a date
app.get('/api/supplog/:date/totals', requireProfile, (req, res) => {
  const entries = req.dbs.suppLogDb.get('log').filter({ date: req.params.date }).value();
  const supps   = req.dbs.supplementsDb.get('supplements').value();
  const totals  = {};
  NUTR_KEYS.forEach(k => { totals[k] = 0; });
  entries.forEach(e => {
    const supp = supps.find(s => s.id === e.supplementId);
    if (!supp) return;
    const doses = parseFloat(e.doses) || 1;
    NUTR_KEYS.forEach(k => { totals[k] += (parseFloat(supp.nutrients[k]) || 0) * doses; });
  });
  NUTR_KEYS.forEach(k => { totals[k] = Math.round(totals[k] * 10) / 10; });
  res.json(totals);
});



const NUTR_KEYS = ['calories','protein_g','carbs_g','fat_g','fiber_g','sugar_g',
  'sodium_mg','potassium_mg','calcium_mg','iron_mg','magnesium_mg','phosphorus_mg','zinc_mg',
  'vitamin_a_mcg','vitamin_c_mg','vitamin_d_mcg','vitamin_e_mg',
  'vitamin_k1_mcg','vitamin_k2_mcg',
  'vitamin_b1_mg','vitamin_b2_mg','vitamin_b3_mg','vitamin_b6_mg','vitamin_b12_mcg','folate_mcg','omega3_mg','copper_mg'];

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
1. If a nutrition label is visible in the photo, READ IT CAREFULLY and use the exact values from the label scaled to the actual portion shown.
2. Identify all food items visible. Pay close attention to portion sizes.
3. If a food has multiple plausible identities, describe what you see precisely in the ingredients list.
4. For omega3_mg: estimate total Omega-3 in milligrams. Key sources: fatty fish (salmon ~2000mg/100g, sardines ~1480mg/100g, mackerel ~2670mg/100g), flaxseed (~2350mg/tbsp), walnuts (~2570mg/28g), chia seeds (~5060mg/28g). Most other foods <100mg.

Return this JSON:
{"meal_name":"string","description":"string","ingredients":[{"name":"string","quantity":"string","notes":"string"}],
"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0,"sodium_mg":0,"potassium_mg":0,
"calcium_mg":0,"iron_mg":0,"magnesium_mg":0,"phosphorus_mg":0,"zinc_mg":0,"vitamin_a_mcg":0,"vitamin_c_mg":0,
"vitamin_d_mcg":0,"vitamin_e_mg":0,"vitamin_k1_mcg":0,"vitamin_k2_mcg":0,"vitamin_b1_mg":0,"vitamin_b2_mg":0,"vitamin_b3_mg":0,
"vitamin_b6_mg":0,"vitamin_b12_mcg":0,"folate_mcg":0,"omega3_mg":0,"copper_mg":0}${note}

Replace all 0s with your best estimates.`;
}

async function callClaudeUrl(url, pageText) {
  const prompt = `You are a professional nutritionist. A user has provided a recipe URL and the extracted page text.
Find the recipe ingredients and serving size, calculate nutrition for ONE serving, and return ONLY valid JSON (no markdown):

Recipe URL: ${url}
Page text:
---
${pageText}
---

{"meal_name":"string","description":"string (include serving size)","ingredients":[{"name":"string","quantity":"string","notes":"string"}],
"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0,"sodium_mg":0,"potassium_mg":0,
"calcium_mg":0,"iron_mg":0,"magnesium_mg":0,"phosphorus_mg":0,"zinc_mg":0,"vitamin_a_mcg":0,"vitamin_c_mg":0,
"vitamin_d_mcg":0,"vitamin_e_mg":0,"vitamin_k1_mcg":0,"vitamin_k2_mcg":0,"vitamin_b1_mg":0,"vitamin_b2_mg":0,"vitamin_b3_mg":0,
"vitamin_b6_mg":0,"vitamin_b12_mcg":0,"folate_mcg":0}

If no recipe found, set meal_name to "Recipe not found" and all numbers to 0. Otherwise replace all 0s with estimates.`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] })
  });
  if (!resp.ok) { const e = await resp.json(); throw new Error(e.error?.message || `API error ${resp.status}`); }
  const data = await resp.json();
  return JSON.parse(data.content.map(c => c.text || '').join('').replace(/```json|```/g, '').trim());
}

async function callClaudeSuppLabel(base64, mime) {
  const prompt = `You are analyzing a supplement label photo. Extract the supplement name and all nutrient amounts per serving.
Return ONLY a valid JSON object (no markdown, no backticks):
{
  "name": "string (product name, e.g. Vitamin D3 5000 IU)",
  "serving_size": "string (e.g. 1 capsule)",
  "nutrients": {
    "calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "fiber_g": 0, "sugar_g": 0,
    "sodium_mg": 0, "potassium_mg": 0, "calcium_mg": 0, "iron_mg": 0, "magnesium_mg": 0,
    "phosphorus_mg": 0, "zinc_mg": 0, "vitamin_a_mcg": 0, "vitamin_c_mg": 0,
    "vitamin_d_mcg": 0, "vitamin_e_mg": 0, "vitamin_k1_mcg": 0, "vitamin_k2_mcg": 0, "vitamin_b1_mg": 0,
    "vitamin_b2_mg": 0, "vitamin_b3_mg": 0, "vitamin_b6_mg": 0, "vitamin_b12_mcg": 0,
    "folate_mcg": 0, "omega3_mg": 0, "copper_mg": 0
  }
}

IMPORTANT:
- Read the label carefully. Use the "per serving" or "per capsule/tablet" amounts, not the whole bottle.
- Convert all units to match the JSON keys: IU to mcg for vitamins (Vitamin D: 1 IU = 0.025mcg; Vitamin A: 1 IU = 0.3mcg; Vitamin E: 1 IU = 0.67mg), mg stays mg, mcg stays mcg.
- Only include nutrients that are actually on the label with non-zero values. Leave others as 0.
- For omega3_mg: look for EPA + DHA or "Total Omega-3" on fish oil labels.
- For Vitamin K supplements: map MK-4, MK-7, MK-9, menaquinone, or any K2 form to vitamin_k2_mcg. Map phylloquinone or K1 to vitamin_k1_mcg. If the label just says "Vitamin K" without specifying the form, check context — most standalone K supplements are K2 (MK-7); most multivitamins use K1.

MAGNESIUM PROPRIETARY BLENDS — CRITICAL:
If the label lists a magnesium supplement as a proprietary blend with a total blend weight (rather than stating elemental magnesium directly), you MUST estimate the elemental magnesium content — do NOT log the blend weight as magnesium_mg.

Use these molecular weight ratios to estimate elemental magnesium per form:
- Magnesium oxide: ~60% elemental (but note very low bioavailability ~4%)
- Magnesium citrate: ~16% elemental
- Magnesium glycinate / bisglycinate: ~14% elemental
- Magnesium malate: ~15% elemental
- Magnesium taurinate: ~8% elemental
- Magnesium threonate: ~8% elemental
- Magnesium chloride: ~12% elemental

If the label names the specific form(s), apply the ratio(s) above. If the form is unknown or it is simply labeled "Magnesium Blend" or "Proprietary Blend" without specifying the form, estimate elemental magnesium at 15–20% of the total blend weight (use 17.5% as the midpoint default).

Always log the elemental magnesium amount in magnesium_mg, never the raw blend weight.

Example: "Magnesium Blend 500mg (as glycinate, malate)" → estimate ~75mg elemental (500 × 15%). Log magnesium_mg: 75.`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514', max_tokens: 1000,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
        { type: 'text', text: prompt }
      ]}]
    })
  });
  if (!resp.ok) { const e = await resp.json(); throw new Error(e.error?.message || `API error ${resp.status}`); }
  const data = await resp.json();
  return JSON.parse(data.content.map(c => c.text || '').join('').replace(/```json|```/g, '').trim());
}

async function callClaudeText(description) {
  const prompt = `You are a professional nutritionist. The user has described a meal. Return ONLY valid JSON (no markdown):
{"meal_name":"string","description":"string","ingredients":[{"name":"string","quantity":"string","notes":"string"}],
"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0,"sodium_mg":0,"potassium_mg":0,
"calcium_mg":0,"iron_mg":0,"magnesium_mg":0,"phosphorus_mg":0,"zinc_mg":0,"vitamin_a_mcg":0,"vitamin_c_mg":0,
"vitamin_d_mcg":0,"vitamin_e_mg":0,"vitamin_k1_mcg":0,"vitamin_k2_mcg":0,"vitamin_b1_mg":0,"vitamin_b2_mg":0,"vitamin_b3_mg":0,
"vitamin_b6_mg":0,"vitamin_b12_mcg":0,"folate_mcg":0,"omega3_mg":0,"copper_mg":0}

Meal description: "${description}"
Replace all 0s with realistic estimates.`;

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
