/**
 * Migration: move existing meals.json, library.json, settings.json
 * into a named profile under data/profiles/<id>/
 *
 * Usage:
 *   node migrate-to-profile.js "Yuna"
 *
 * Run ONCE before starting the new version of the app.
 * Your original files are left untouched (renamed to *.bak).
 */

const path = require('path');
const fs   = require('fs');
const low  = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const name = process.argv[2];
if (!name || !name.trim()) {
  console.error('\nUsage: node migrate-to-profile.js "Your Name"\n');
  process.exit(1);
}

const trimmed = name.trim();
const dataDir = path.join(__dirname, 'data');
const profDir = path.join(dataDir, 'profiles');

if (!fs.existsSync(profDir)) fs.mkdirSync(profDir, { recursive: true });

// Create / find the profile
const profilesDb = low(new FileSync(path.join(dataDir, 'profiles.json')));
profilesDb.defaults({ profiles: [] }).write();

let profile = profilesDb.get('profiles')
  .find(p => p.name.toLowerCase() === trimmed.toLowerCase()).value();

if (!profile) {
  const id = trimmed.toLowerCase()
    .replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
    + '_' + Date.now();
  profile = { id, name: trimmed, createdAt: new Date().toISOString(), avatar: trimmed[0].toUpperCase() };
  profilesDb.get('profiles').push(profile).write();
  console.log('\n✅ Created profile "' + trimmed + '" (id: ' + profile.id + ')');
} else {
  console.log('\n✅ Found existing profile "' + trimmed + '" (id: ' + profile.id + ')');
}

// Set up profile directory
const targetDir = path.join(profDir, profile.id);
if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

function migrateFile(srcName, destName, countKey) {
  const src  = path.join(dataDir, srcName);
  const dest = path.join(targetDir, destName);

  if (!fs.existsSync(src)) {
    console.log('  ⚠️  ' + srcName + ' not found — skipping');
    return 0;
  }

  if (fs.existsSync(dest)) {
    console.log('  ⚠️  ' + destName + ' already exists in profile — skipping');
    return 0;
  }

  const raw   = JSON.parse(fs.readFileSync(src, 'utf8'));
  const count = countKey && Array.isArray(raw[countKey]) ? raw[countKey].length : '';

  fs.copyFileSync(src, dest);
  fs.renameSync(src, src + '.bak');

  const countStr = count !== '' ? ' (' + count + ' ' + countKey + ')' : '';
  console.log('  ✓ ' + srcName + ' → profiles/' + profile.id + '/' + destName + countStr);
  return count || 1;
}

console.log('\nMigrating files...');
const mealCount = migrateFile('meals.json',   'meals.json',   'meals');
const libCount  = migrateFile('library.json', 'library.json', 'meals');
                  migrateFile('settings.json', 'settings.json', null);

console.log('');
console.log('Migration complete!');
console.log('  Profile : ' + trimmed);
console.log('  Meals   : ' + mealCount + ' logged meals moved');
console.log('  Library : ' + libCount  + ' library meals moved');
console.log('');
console.log('Your old files have been renamed to *.bak in the data/ folder.');
console.log('Start the app with: npm start');
console.log('Then select "' + trimmed + '" on the profile screen.');
console.log('');
