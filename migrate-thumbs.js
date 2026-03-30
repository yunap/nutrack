/**
 * Thumbnail migration + cleanup
 *
 * Does three things:
 *  1. Converts old base64 `thumbnail` fields in profile JSON files to real image files
 *  2. Validates existing thumbFile references — deletes corrupt/empty files and clears the reference
 *  3. Reports what was fixed vs what had no photo
 *
 * Usage:
 *   node migrate-thumbs.js
 */

const path = require('path');
const fs   = require('fs');
const low  = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const dataDir  = path.join(__dirname, 'data');
const thumbDir = path.join(dataDir, 'thumbs');
const profDir  = path.join(dataDir, 'profiles');

if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });

// ── Validate a JPEG/PNG/WEBP buffer ──────────────────────────────────────────
function isValidImage(buf) {
  if (!buf || buf.length < 100) return false;
  // JPEG starts with FF D8 FF
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return true;
  // PNG starts with 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return true;
  // WEBP starts with RIFF
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return true;
  return false;
}

// ── Save base64 to file, return filename or null if invalid ──────────────────
function saveThumb(base64) {
  if (!base64 || base64.length < 200) return null;
  try {
    const buf = Buffer.from(base64, 'base64');
    if (!isValidImage(buf)) return null;
    const header = base64.substring(0, 4);
    const ext = (buf[0] === 0xFF) ? 'jpg' : (buf[0] === 0x89) ? 'png' : 'webp';
    const filename = Date.now() + '_' + Math.random().toString(36).slice(2) + '.' + ext;
    fs.writeFileSync(path.join(thumbDir, filename), buf);
    return filename;
  } catch(e) { return null; }
}

// ── Check if a thumbFile on disk is valid ────────────────────────────────────
function isThumbValid(thumbFile) {
  if (!thumbFile) return false;
  const fp = path.join(thumbDir, thumbFile);
  if (!fs.existsSync(fp)) return false;
  const buf = fs.readFileSync(fp);
  return isValidImage(buf);
}

// ── Process one JSON file ────────────────────────────────────────────────────
function migrateJsonFile(filePath, label) {
  if (!fs.existsSync(filePath)) return { converted: 0, cleaned: 0, noPhoto: 0 };

  const db = low(new FileSync(filePath));
  db.defaults({ meals: [] }).write();
  const meals = db.get('meals').value();

  let converted = 0, cleaned = 0, noPhoto = 0, alreadyOk = 0;

  meals.forEach(meal => {
    const mealName = meal.name || meal.nutrition?.meal_name || meal.id;

    // Case 1: already has a valid thumbFile on disk — nothing to do
    if (meal.thumbFile && isThumbValid(meal.thumbFile)) {
      alreadyOk++;
      return;
    }

    // Case 2: has a thumbFile but it's corrupt/missing — try to recover from base64
    if (meal.thumbFile && !isThumbValid(meal.thumbFile)) {
      // delete the bad file if it exists
      const fp = path.join(thumbDir, meal.thumbFile);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);

      if (meal.thumbnail) {
        const filename = saveThumb(meal.thumbnail);
        if (filename) {
          db.get('meals').find({ id: meal.id }).assign({ thumbFile: filename }).unset('thumbnail').write();
          converted++;
          console.log('  ✓ ' + mealName + ' (recovered from base64) → ' + filename);
          return;
        }
      }
      // couldn't recover — clear the bad reference
      db.get('meals').find({ id: meal.id }).unset('thumbFile').unset('thumbnail').write();
      cleaned++;
      console.log('  ✗ ' + mealName + ' — corrupt thumbnail cleared (no photo will show)');
      return;
    }

    // Case 3: has old base64 thumbnail field, no thumbFile yet
    if (meal.thumbnail) {
      const filename = saveThumb(meal.thumbnail);
      if (filename) {
        db.get('meals').find({ id: meal.id }).assign({ thumbFile: filename }).unset('thumbnail').write();
        converted++;
        console.log('  ✓ ' + mealName + ' → ' + filename);
      } else {
        db.get('meals').find({ id: meal.id }).unset('thumbnail').write();
        cleaned++;
        console.log('  ✗ ' + mealName + ' — thumbnail was truncated/corrupt, cleared');
      }
      return;
    }

    // Case 4: no photo at all
    noPhoto++;
  });

  const summary = [
    converted  ? converted  + ' converted'   : '',
    alreadyOk  ? alreadyOk  + ' already ok'  : '',
    cleaned    ? cleaned    + ' corrupt/cleared' : '',
    noPhoto    ? noPhoto    + ' no photo'     : '',
  ].filter(Boolean).join(', ');

  console.log('  ' + label + ': ' + (summary || 'nothing to do'));
  return { converted, cleaned, noPhoto };
}

// ── Main ─────────────────────────────────────────────────────────────────────
if (!fs.existsSync(profDir)) {
  console.log('No profiles directory found. Run migrate-to-profile.js first.');
  process.exit(1);
}

const profileIds = fs.readdirSync(profDir).filter(f =>
  fs.statSync(path.join(profDir, f)).isDirectory()
);

if (!profileIds.length) {
  console.log('No profile directories found under data/profiles/');
  process.exit(0);
}

// Load profile names for display
const profilesDb = low(new FileSync(path.join(dataDir, 'profiles.json')));
profilesDb.defaults({ profiles: [] }).write();
const profiles = profilesDb.get('profiles').value();
const nameMap = {};
profiles.forEach(p => { nameMap[p.id] = p.name; });

let totalConverted = 0, totalCleaned = 0;

profileIds.forEach(id => {
  const displayName = nameMap[id] || id;
  console.log('\nProfile: ' + displayName);

  const dir = path.join(profDir, id);
  const r1 = migrateJsonFile(path.join(dir, 'library.json'), 'library');
  const r2 = migrateJsonFile(path.join(dir, 'meals.json'),   'meals  ');

  totalConverted += r1.converted + r2.converted;
  totalCleaned   += r1.cleaned   + r2.cleaned;
});

const thumbCount = fs.readdirSync(thumbDir).length;
console.log('\n─────────────────────────────────────');
console.log('Photos saved to disk : ' + totalConverted);
console.log('Corrupt refs cleared : ' + totalCleaned);
console.log('Files in data/thumbs : ' + thumbCount);
console.log('─────────────────────────────────────');
if (totalConverted > 0) {
  console.log('\nRestart the app to see the photos.');
}
if (totalCleaned > 0) {
  console.log('\nNote: ' + totalCleaned + ' meal(s) had corrupt/truncated thumbnails that could not be recovered.');
  console.log('Those meals will show a placeholder icon. Re-analyze them to get a photo.');
}
console.log('');
