/**
 * NutritionTrack v3 — Test Suite
 * Run with: npm test
 */

const request = require('supertest');
const path    = require('path');
const fs      = require('fs');
const os      = require('os');

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nutrition-test-'));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.ANTHROPIC_API_KEY = 'test-key-not-used';

const { app, sumNutrition } = require('../server');

const MEAL_A = {
  meal_name: 'Scrambled Eggs', description: '2 eggs with olive oil',
  ingredients: [{ name: 'eggs', quantity: '2 large', notes: 'scrambled' }],
  calories: 200, protein_g: 14, carbs_g: 2, fat_g: 15, fiber_g: 0, sugar_g: 0,
  sodium_mg: 200, potassium_mg: 140, calcium_mg: 60, iron_mg: 1.8, magnesium_mg: 12,
  phosphorus_mg: 180, zinc_mg: 1.2, vitamin_a_mcg: 140, vitamin_c_mg: 0,
  vitamin_d_mcg: 2, vitamin_e_mg: 1, vitamin_k1_mcg: 80, vitamin_k2_mcg: 0, vitamin_b1_mg: 0.07,
  vitamin_b2_mg: 0.27, vitamin_b3_mg: 0.07, vitamin_b6_mg: 0.14,
  vitamin_b12_mcg: 0.89, folate_mcg: 47, omega3_mg: 120, copper_mg: 0.1,
  selenium_mcg: 15, manganese_mg: 0.04, vitamin_b5_mg: 0.7
};

const MEAL_B = {
  meal_name: 'Greek Yogurt Bowl', description: '170g yogurt with berries',
  ingredients: [{ name: 'greek yogurt', quantity: '170g', notes: '' }],
  calories: 130, protein_g: 17, carbs_g: 9, fat_g: 0, fiber_g: 0, sugar_g: 7,
  sodium_mg: 60, potassium_mg: 240, calcium_mg: 200, iron_mg: 0.1, magnesium_mg: 19,
  phosphorus_mg: 190, zinc_mg: 1.0, vitamin_a_mcg: 0, vitamin_c_mg: 0,
  vitamin_d_mcg: 0, vitamin_e_mg: 0, vitamin_k1_mcg: 0, vitamin_k2_mcg: 0, vitamin_b1_mg: 0.05,
  vitamin_b2_mg: 0.27, vitamin_b3_mg: 0.1, vitamin_b6_mg: 0.1,
  vitamin_b12_mcg: 1.3, folate_mcg: 10, omega3_mg: 50, copper_mg: 0.05,
  selenium_mcg: 8, manganese_mg: 0.01, vitamin_b5_mg: 0.5
};

const TODAY = new Date().toISOString().split('T')[0];

async function makeProfile(name) {
  const res = await request(app).post('/api/profiles').send({ name });
  expect(res.status).toBe(200);
  return res.body.profile.id;
}

function as(profileId) {
  return {
    get:    (url)       => request(app).get(url).set('x-profile-id', profileId),
    post:   (url, body) => request(app).post(url).set('x-profile-id', profileId).send(body),
    put:    (url, body) => request(app).put(url).set('x-profile-id', profileId).send(body),
    delete: (url)       => request(app).delete(url).set('x-profile-id', profileId),
  };
}

// ══ sumNutrition ══════════════════════════════════════════════════════════════
describe('sumNutrition()', () => {
  test('sums two meals correctly', () => {
    const r = sumNutrition([MEAL_A, MEAL_B]);
    expect(r.calories).toBeCloseTo(330, 0);
    expect(r.protein_g).toBeCloseTo(31, 0);
    expect(r.calcium_mg).toBeCloseTo(260, 0);
    expect(r.omega3_mg).toBeCloseTo(170, 0);
    expect(r.copper_mg).toBeCloseTo(0.15, 0);
    expect(r.vitamin_k1_mcg).toBeCloseTo(80, 0); // MEAL_A has 80, MEAL_B has 0
    expect(r.vitamin_k2_mcg).toBe(0);
  });
  test('handles empty array', () => {
    const r = sumNutrition([]); expect(r.calories).toBe(0);
  });
  test('handles single meal', () => {
    const r = sumNutrition([MEAL_A]); expect(r.calories).toBe(MEAL_A.calories);
  });
  test('handles missing fields gracefully', () => {
    const r = sumNutrition([{ calories: 100 }]); expect(r.calories).toBe(100); expect(r.protein_g).toBe(0);
  });
  test('sums three meals', () => {
    const r = sumNutrition([MEAL_A, MEAL_B, MEAL_A]);
    expect(r.calories).toBeCloseTo(530, 0);
  });
});

// ══ Profiles ══════════════════════════════════════════════════════════════════
describe('Profile API', () => {
  test('GET /api/profiles returns array', async () => {
    const res = await request(app).get('/api/profiles');
    expect(res.status).toBe(200); expect(Array.isArray(res.body)).toBe(true);
  });

  test('creates a profile with correct fields', async () => {
    const res = await request(app).post('/api/profiles').send({ name: 'Alice' });
    expect(res.status).toBe(200);
    expect(res.body.profile.name).toBe('Alice');
    expect(res.body.profile.id).toBeDefined();
    expect(res.body.profile.avatar).toBe('A');
  });

  test('returns 400 for empty name', async () => {
    const res = await request(app).post('/api/profiles').send({ name: '' });
    expect(res.status).toBe(400);
  });

  test('returns 400 for duplicate name', async () => {
    await request(app).post('/api/profiles').send({ name: 'DupeUser' });
    const res = await request(app).post('/api/profiles').send({ name: 'DupeUser' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already exists/);
  });

  test('deletes a profile', async () => {
    const c = await request(app).post('/api/profiles').send({ name: 'DeleteMe' });
    const id = c.body.profile.id;
    const d = await request(app).delete(`/api/profiles/${id}`);
    expect(d.status).toBe(200);
    const list = await request(app).get('/api/profiles');
    expect(list.body.map(p => p.id)).not.toContain(id);
  });

  test('returns 404 for unknown profile delete', async () => {
    const res = await request(app).delete('/api/profiles/ghost_999');
    expect(res.status).toBe(404);
  });
});

// ══ Profile isolation ═════════════════════════════════════════════════════════
describe('Profile data isolation', () => {
  let profA, profB;
  beforeAll(async () => {
    profA = await makeProfile('IsolationA');
    profB = await makeProfile('IsolationB');
  });

  test('meals saved to profile A not visible to profile B', async () => {
    await as(profA).post('/api/meals', { nutrition: MEAL_A, mealType: 'breakfast', date: TODAY });
    const res = await as(profB).get(`/api/meals/${TODAY}`);
    expect(res.body).toEqual([]);
  });

  test('library saved to profile A not visible to profile B', async () => {
    await as(profA).post('/api/library', { nutrition: MEAL_A });
    const res = await as(profB).get('/api/library');
    expect(res.body).toEqual([]);
  });

  test('settings from profile A do not affect profile B', async () => {
    await as(profA).put('/api/settings/targets', { targets: { protein_g: 150 } });
    const res = await as(profB).get('/api/settings');
    expect(res.body.targets.protein_g).not.toBe(150);
  });
});

// ══ Meals ═════════════════════════════════════════════════════════════════════
describe('Meals API', () => {
  let pid;
  beforeAll(async () => { pid = await makeProfile('MealsUser'); });

  test('saves a meal', async () => {
    const res = await as(pid).post('/api/meals', { nutrition: MEAL_A, mealType: 'breakfast', date: TODAY });
    expect(res.status).toBe(200);
    expect(res.body.meal.mealType).toBe('breakfast');
  });

  test('returns 400 without nutrition', async () => {
    const res = await as(pid).post('/api/meals', { mealType: 'lunch' });
    expect(res.status).toBe(400);
  });

  test('defaults mealType to snack', async () => {
    const res = await as(pid).post('/api/meals', { nutrition: MEAL_B, date: TODAY });
    expect(res.body.meal.mealType).toBe('snack');
  });

  test('GET returns meals for date', async () => {
    const res = await as(pid).get(`/api/meals/${TODAY}`);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('GET returns empty for unknown date', async () => {
    const res = await as(pid).get('/api/meals/1999-01-01');
    expect(res.body).toEqual([]);
  });

  test('DELETE removes a meal', async () => {
    const save = await as(pid).post('/api/meals', { nutrition: MEAL_A, mealType: 'snack', date: TODAY });
    const id   = save.body.meal.id;
    await as(pid).delete(`/api/meals/${id}`);
    const check = await as(pid).get(`/api/meals/${TODAY}`);
    expect(check.body.map(m => m.id)).not.toContain(id);
  });

  test('returns 400 without x-profile-id header', async () => {
    const res = await request(app).post('/api/meals').send({ nutrition: MEAL_A });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/profile/i);
  });

  test('returns 404 for unknown profile id', async () => {
    const res = await request(app).post('/api/meals')
      .set('x-profile-id', 'ghost_999').send({ nutrition: MEAL_A });
    expect(res.status).toBe(404);
  });
});

// ══ Summary ═══════════════════════════════════════════════════════════════════
describe('Summary API', () => {
  let pid;
  beforeAll(async () => { pid = await makeProfile('SummaryUser'); });

  test('returns null for date with no meals', async () => {
    const res = await as(pid).get('/api/summary/1990-01-01');
    expect(res.body).toBeNull();
  });

  test('sums nutrition across meals', async () => {
    const date = '2030-07-01';
    await as(pid).post('/api/meals', { nutrition: MEAL_A, mealType: 'breakfast', date });
    await as(pid).post('/api/meals', { nutrition: MEAL_B, mealType: 'lunch', date });
    const res = await as(pid).get(`/api/summary/${date}`);
    expect(res.body.calories).toBeCloseTo(MEAL_A.calories + MEAL_B.calories, 0);
    expect(res.body.mealCount).toBe(2);
  });

  test('summary includes meal list', async () => {
    const date = '2030-07-02';
    await as(pid).post('/api/meals', { nutrition: MEAL_A, mealType: 'dinner', date });
    const res = await as(pid).get(`/api/summary/${date}`);
    expect(res.body.meals[0].mealType).toBe('dinner');
  });
});

// ══ Dates ═════════════════════════════════════════════════════════════════════
describe('Dates API', () => {
  let pid;
  beforeAll(async () => { pid = await makeProfile('DatesUser'); });

  test('returns unique dates in descending order', async () => {
    await as(pid).post('/api/meals', { nutrition: MEAL_A, date: '2030-02-01' });
    await as(pid).post('/api/meals', { nutrition: MEAL_B, date: '2030-02-03' });
    await as(pid).post('/api/meals', { nutrition: MEAL_A, date: '2030-02-03' });
    const res = await as(pid).get('/api/dates');
    expect([...new Set(res.body)].length).toBe(res.body.length);
    for (let i = 0; i < res.body.length - 1; i++) {
      expect(res.body[i] >= res.body[i + 1]).toBe(true);
    }
  });
});

// ══ Compare ═══════════════════════════════════════════════════════════════════
describe('Compare API', () => {
  let pid;
  const D1 = '2031-04-01', D2 = '2031-04-02';
  beforeAll(async () => {
    pid = await makeProfile('CompareUser');
    await as(pid).post('/api/meals', { nutrition: MEAL_A, date: D1 });
    await as(pid).post('/api/meals', { nutrition: MEAL_B, date: D2 });
  });

  test('returns summaries for both dates', async () => {
    const res = await as(pid).get(`/api/compare?date1=${D1}&date2=${D2}`);
    expect(res.body.date1.summary.calories).toBeCloseTo(MEAL_A.calories, 0);
    expect(res.body.date2.summary.calories).toBeCloseTo(MEAL_B.calories, 0);
  });

  test('null summary for empty date', async () => {
    const res = await as(pid).get(`/api/compare?date1=${D1}&date2=1888-01-01`);
    expect(res.body.date2.summary).toBeNull();
  });

  test('returns 400 when dates missing', async () => {
    const res = await as(pid).get('/api/compare?date1=2031-04-01');
    expect(res.status).toBe(400);
  });
});

// ══ Library ════════════════════════════════════════════════════════════════════
describe('Library API', () => {
  let pid, savedLibId;
  beforeAll(async () => { pid = await makeProfile('LibraryUser'); });

  test('saves a meal to library', async () => {
    const res = await as(pid).post('/api/library', { nutrition: MEAL_A, defaultMealType: 'breakfast' });
    expect(res.status).toBe(200);
    expect(res.body.meal.id).toMatch(/^lib_/);
    savedLibId = res.body.meal.id;
  });

  test('flags duplicate name', async () => {
    const res = await as(pid).post('/api/library', { nutrition: MEAL_A });
    expect(res.body.duplicate).toBe(true);
  });

  test('GET returns saved meals', async () => {
    const res = await as(pid).get('/api/library');
    expect(res.body.map(m => m.name)).toContain(MEAL_A.meal_name);
  });

  test('logs a library meal to daily log', async () => {
    const res = await as(pid).post(`/api/library/${savedLibId}/log`, { mealType: 'lunch', date: TODAY });
    expect(res.status).toBe(200);
    expect(res.body.meal.fromLibrary).toBe(true);
    const log = await as(pid).get(`/api/meals/${TODAY}`);
    expect(log.body.some(m => m.libraryId === savedLibId)).toBe(true);
  });

  test('returns 404 for unknown library meal', async () => {
    const res = await as(pid).post('/api/library/lib_nonexistent/log', { mealType: 'snack' });
    expect(res.status).toBe(404);
  });

  test('deletes a library meal', async () => {
    const save = await as(pid).post('/api/library', { nutrition: MEAL_B });
    const id   = save.body.meal.id;
    await as(pid).delete(`/api/library/${id}`);
    const list = await as(pid).get('/api/library');
    expect(list.body.map(m => m.id)).not.toContain(id);
  });
});

// ══ Settings ══════════════════════════════════════════════════════════════════
describe('Settings API', () => {
  let pid;
  beforeAll(async () => { pid = await makeProfile('SettingsUser'); });

  test('GET returns defaults', async () => {
    const res = await as(pid).get('/api/settings');
    expect(res.body.targets).toBeDefined();
    expect(res.body.targets.omega3_mg).toBe(1600);
    expect(res.body.targets.copper_mg).toBe(0.9);
    expect(res.body.targets.vitamin_k1_mcg).toBe(120);
    expect(res.body.targets.vitamin_k2_mcg).toBe(200);
    expect(res.body.targets.selenium_mcg).toBe(55);
    expect(res.body.targets.manganese_mg).toBe(2.3);
    expect(res.body.targets.vitamin_b5_mg).toBe(5);
    expect(Array.isArray(res.body.priorityNutrients)).toBe(true);
  });

  test('saves custom targets', async () => {
    await as(pid).put('/api/settings/targets', { targets: { protein_g: 130, calories: 1800 } });
    const res = await as(pid).get('/api/settings');
    expect(res.body.targets.protein_g).toBe(130);
  });

  test('returns 400 when targets missing', async () => {
    const res = await as(pid).put('/api/settings/targets', {});
    expect(res.status).toBe(400);
  });

  test('saves priority nutrients', async () => {
    await as(pid).put('/api/settings/priority', { priorityNutrients: ['protein_g', 'calcium_mg'] });
    const res = await as(pid).get('/api/settings');
    expect(res.body.priorityNutrients).toEqual(['protein_g', 'calcium_mg']);
  });

  test('returns 400 when priority missing', async () => {
    const res = await as(pid).put('/api/settings/priority', {});
    expect(res.status).toBe(400);
  });
});

// ══ Analysis validation ════════════════════════════════════════════════════════
describe('Analysis endpoints (validation)', () => {
  test('analyze-text: 400 for empty description', async () => {
    const res = await request(app).post('/api/analyze-text').send({ description: '' });
    expect(res.status).toBe(400);
  });

  test('analyze-text: 400 when missing', async () => {
    const res = await request(app).post('/api/analyze-text').send({});
    expect(res.status).toBe(400);
  });

  test('analyze-url: 400 when url missing', async () => {
    const res = await request(app).post('/api/analyze-url').send({});
    expect(res.status).toBe(400);
  });

  test('analyze-url: 400 for invalid URL', async () => {
    const res = await request(app).post('/api/analyze-url').send({ url: 'not-a-url' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid URL/);
  });

  test('analyze-url: 400 for non-http protocol', async () => {
    const res = await request(app).post('/api/analyze-url').send({ url: 'ftp://example.com' });
    expect(res.status).toBe(400);
  });

  test('analyze-url: 400 when page cannot be fetched', async () => {
    const res = await request(app)
      .post('/api/analyze-url')
      .send({ url: 'https://192.0.2.1/recipe' })
      .timeout(15000);
    expect(res.status).toBe(400);
  }, 15000);

  test('reanalyze: 400 without ingredients', async () => {
    const pid = await makeProfile('ReanalyzeUser');
    const res = await as(pid).post('/api/reanalyze', { imageBase64: 'abc' });
    expect(res.status).toBe(400);
  });
});

afterAll(() => {
  try { fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true }); } catch(e) {}
});

// ══ Library photo upload ═══════════════════════════════════════════════════════
describe('Library photo upload', () => {
  let pid, libId;

  beforeAll(async () => {
    pid = await makeProfile('PhotoUser');
    const save = await as(pid).post('/api/library', { nutrition: MEAL_A });
    libId = save.body.meal.id;
  });

  test('POST /api/library/:id/photo returns 400 with no file', async () => {
    const res = await request(app)
      .post('/api/library/' + libId + '/photo')
      .set('x-profile-id', pid);
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('POST /api/library/:id/photo saves a thumb and returns thumbFile', async () => {
    // Minimal valid JPEG > 512 bytes (includes JFIF header + comment padding)
    // 596-byte valid JPEG (SOI + APP0/JFIF + padded comment + EOI)
    const jpegBuf = Buffer.from(
      '/9j/4AAQSkZJRgABAQAAAQABAAD//gI8eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4' +
      'eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4' +
      'eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4' +
      'eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4' +
      'eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4' +
      'eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4' +
      'eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4' +
      'eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4' +
      'eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4' +
      'eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4' +
      'eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4' +
      'eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4' +
      'eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4/9k=',
      'base64'
    );
    const res = await request(app)
      .post('/api/library/' + libId + '/photo')
      .set('x-profile-id', pid)
      .attach('image', jpegBuf, { filename: 'test.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    expect(res.body.thumbFile).toBeDefined();
    expect(typeof res.body.thumbFile).toBe('string');
    expect(res.body.thumbFile).toMatch(/\.jpg$/);
  });

  test('POST /api/library/:id/photo returns 404 for unknown id', async () => {
    const jpegBuf = Buffer.from('AAAA', 'base64');
    const res = await request(app)
      .post('/api/library/lib_nonexistent/photo')
      .set('x-profile-id', pid)
      .attach('image', jpegBuf, { filename: 'test.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(404);
  });
});

// ══ Supplements ════════════════════════════════════════════════════════════════
describe('Supplements API', () => {
  let pid, suppId;

  beforeAll(async () => { pid = await makeProfile('SuppUser'); });

  test('GET /api/supplements returns empty array initially', async () => {
    const res = await as(pid).get('/api/supplements');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('POST /api/supplements creates a supplement', async () => {
    const res = await as(pid).post('/api/supplements', {
      name: 'Vitamin D3 5000 IU',
      nutrients: { vitamin_d_mcg: 125, copper_mg: 2, vitamin_k2_mcg: 100 }
    });
    expect(res.status).toBe(200);
    expect(res.body.supplement.id).toMatch(/^supp_/);
    expect(res.body.supplement.name).toBe('Vitamin D3 5000 IU');
    expect(res.body.supplement.nutrients.vitamin_d_mcg).toBe(125);
    suppId = res.body.supplement.id;
  });

  test('POST /api/supplements returns 400 for missing name', async () => {
    const res = await as(pid).post('/api/supplements', { nutrients: { vitamin_c_mg: 500 } });
    expect(res.status).toBe(400);
  });

  test('POST /api/supplements returns 400 for duplicate name', async () => {
    const res = await as(pid).post('/api/supplements', {
      name: 'Vitamin D3 5000 IU', nutrients: {}
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already exists/);
  });

  test('PUT /api/supplements/:id updates a supplement', async () => {
    const res = await as(pid).put('/api/supplements/'+suppId, {
      nutrients: { vitamin_d_mcg: 125, vitamin_k2_mcg: 100 }
    });
    expect(res.status).toBe(200);
    const list = await as(pid).get('/api/supplements');
    const updated = list.body.find(s => s.id === suppId);
    expect(updated.nutrients.vitamin_k2_mcg).toBe(100);
  });

  test('PUT /api/supplements/:id returns 404 for unknown id', async () => {
    const res = await as(pid).put('/api/supplements/supp_nonexistent', { name: 'Test' });
    expect(res.status).toBe(404);
  });

  test('DELETE /api/supplements/:id removes the supplement', async () => {
    const create = await as(pid).post('/api/supplements', { name: 'Magnesium Glycinate', nutrients: { magnesium_mg: 400 } });
    const id = create.body.supplement.id;
    await as(pid).delete('/api/supplements/'+id);
    const list = await as(pid).get('/api/supplements');
    expect(list.body.map(s => s.id)).not.toContain(id);
  });
});

// ══ Supplement Log ════════════════════════════════════════════════════════════
describe('Supplement Log API', () => {
  let pid, suppId;
  const DATE = '2031-06-15';

  beforeAll(async () => {
    pid = await makeProfile('SuppLogUser');
    const s = await as(pid).post('/api/supplements', {
      name: 'Omega-3 Fish Oil',
      nutrients: { omega3_mg: 1000, vitamin_d_mcg: 10 }
    });
    suppId = s.body.supplement.id;
  });

  test('GET /api/supplog/:date returns empty for new date', async () => {
    const res = await as(pid).get('/api/supplog/'+DATE);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('POST /api/supplog logs a supplement', async () => {
    const res = await as(pid).post('/api/supplog', { supplementId: suppId, date: DATE, doses: 1 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('GET /api/supplog/:date returns logged supplement with details', async () => {
    const res = await as(pid).get('/api/supplog/'+DATE);
    expect(res.body.length).toBe(1);
    expect(res.body[0].supplement.name).toBe('Omega-3 Fish Oil');
    expect(res.body[0].doses).toBe(1);
  });

  test('POST /api/supplog upserts doses on same date', async () => {
    await as(pid).post('/api/supplog', { supplementId: suppId, date: DATE, doses: 2 });
    const res = await as(pid).get('/api/supplog/'+DATE);
    expect(res.body[0].doses).toBe(2);
  });

  test('GET /api/supplog/:date/totals sums nutrients correctly', async () => {
    const res = await as(pid).get('/api/supplog/'+DATE+'/totals');
    expect(res.status).toBe(200);
    expect(res.body.omega3_mg).toBeCloseTo(2000, 0);  // 2 doses × 1000mg
    expect(res.body.vitamin_d_mcg).toBeCloseTo(20, 0); // 2 doses × 10mcg
  });

  test('DELETE /api/supplog/:suppId/:date removes the entry', async () => {
    await as(pid).delete('/api/supplog/'+suppId+'/'+DATE);
    const res = await as(pid).get('/api/supplog/'+DATE);
    expect(res.body).toEqual([]);
  });

  test('POST /api/supplog returns 404 for unknown supplement', async () => {
    const res = await as(pid).post('/api/supplog', { supplementId: 'supp_ghost', date: DATE });
    expect(res.status).toBe(404);
  });

  test('POST /api/supplog returns 400 without supplementId', async () => {
    const res = await as(pid).post('/api/supplog', { date: DATE });
    expect(res.status).toBe(400);
  });

  test('supplement totals return zero for date with no log entries', async () => {
    const res = await as(pid).get('/api/supplog/1999-01-01/totals');
    expect(res.body.omega3_mg).toBe(0);
    expect(res.body.calcium_mg).toBe(0);
  });

  test('supplement data is isolated between profiles', async () => {
    const otherPid = await makeProfile('SuppIsoUser');
    const res = await as(otherPid).get('/api/supplements');
    expect(res.body).toEqual([]);
  });
});

// ══ Library nutrition update + serving size ════════════════════════════════════
describe('Library nutrition update & serving size', () => {
  let pid, libId;

  beforeAll(async () => {
    pid = await makeProfile('EditSrvUser');
    const save = await as(pid).post('/api/library', { nutrition: MEAL_A, defaultMealType: 'breakfast' });
    libId = save.body.meal.id;
  });

  test('PUT /api/library/:id/nutrition updates stored nutrition', async () => {
    const updated = { ...MEAL_A, calories: 250, protein_g: 18, meal_name: 'Scrambled Eggs' };
    const res = await as(pid).put('/api/library/' + libId + '/nutrition', { nutrition: updated });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const list = await as(pid).get('/api/library');
    const meal = list.body.find(m => m.id === libId);
    expect(meal.nutrition.calories).toBe(250);
    expect(meal.nutrition.protein_g).toBe(18);
  });

  test('PUT /api/library/:id/nutrition returns 400 when nutrition missing', async () => {
    const res = await as(pid).put('/api/library/' + libId + '/nutrition', {});
    expect(res.status).toBe(400);
  });

  test('PUT /api/library/:id/nutrition returns 404 for unknown id', async () => {
    const res = await as(pid).put('/api/library/lib_nonexistent/nutrition', { nutrition: MEAL_A });
    expect(res.status).toBe(404);
  });

  test('log from library at 0.5× serving scales all nutrients', async () => {
    const res = await as(pid).post('/api/library/' + libId + '/log', {
      mealType: 'snack', date: '2032-01-01', servingSize: 0.5
    });
    expect(res.status).toBe(200);
    expect(res.body.meal.servingSize).toBe(0.5);
    // calories stored were 250 after update above, so 0.5× = 125
    expect(res.body.meal.nutrition.calories).toBe(125);
    expect(res.body.meal.nutrition.protein_g).toBe(9);
  });

  test('log from library at 1× serving (default) keeps full nutrition', async () => {
    const res = await as(pid).post('/api/library/' + libId + '/log', {
      mealType: 'breakfast', date: '2032-01-02'
    });
    expect(res.status).toBe(200);
    expect(res.body.meal.nutrition.calories).toBe(250);
  });

  test('log from library at 2× doubles calories', async () => {
    const res = await as(pid).post('/api/library/' + libId + '/log', {
      mealType: 'dinner', date: '2032-01-03', servingSize: 2
    });
    expect(res.body.meal.nutrition.calories).toBe(500);
    expect(res.body.meal.nutrition.protein_g).toBe(36);
  });
});

// ══ Library nutrition update covers photo+notes (server accepts notes field) ══
describe('Photo + notes analyze endpoint', () => {
  test('POST /api/analyze returns 400 with no image even with notes', async () => {
    const res = await request(app)
      .post('/api/analyze')
      .field('notes', 'homemade with heavy cream');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

// ══ Library search (filterLibrary is frontend-only; test data structure) ══
describe('Library ingredient data for search', () => {
  let pid;
  beforeAll(async () => { pid = await makeProfile('SearchUser'); });

  test('library meals include ingredients array for search', async () => {
    const mealWithIngs = {
      ...MEAL_A,
      meal_name: 'Salmon with Broccoli',
      ingredients: [
        { name: 'salmon', quantity: '150g', notes: 'grilled' },
        { name: 'broccoli', quantity: '100g', notes: 'steamed' }
      ]
    };
    await as(pid).post('/api/library', { nutrition: mealWithIngs });
    const res = await as(pid).get('/api/library');
    const meal = res.body.find(m => m.name === 'Salmon with Broccoli');
    expect(meal).toBeDefined();
    expect(Array.isArray(meal.nutrition.ingredients)).toBe(true);
    expect(meal.nutrition.ingredients[0].name).toBe('salmon');
  });
});

// ══ Duplicate library entry ════════════════════════════════════════════════════
describe('Library duplicate', () => {
  let pid, origId;

  beforeAll(async () => {
    pid = await makeProfile('DupUser');
    const s = await as(pid).post('/api/library', {
      nutrition: { ...MEAL_A, meal_name: 'Original Meal' },
      defaultMealType: 'lunch'
    });
    origId = s.body.meal.id;
  });

  test('POST /api/library/:id/duplicate creates a copy', async () => {
    const res = await as(pid).post('/api/library/' + origId + '/duplicate');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.meal.name).toBe('Copy of Original Meal');
    expect(res.body.meal.id).not.toBe(origId);
    expect(res.body.meal.nutrition.meal_name).toBe('Copy of Original Meal');
  });

  test('duplicate preserves nutrition values', async () => {
    const res = await as(pid).post('/api/library/' + origId + '/duplicate');
    expect(res.body.meal.nutrition.calories).toBe(MEAL_A.calories);
    expect(res.body.meal.nutrition.protein_g).toBe(MEAL_A.protein_g);
    expect(res.body.meal.defaultMealType).toBe('lunch');
  });

  test('duplicate appears in library listing', async () => {
    const list = await as(pid).get('/api/library');
    const names = list.body.map(m => m.name);
    expect(names.filter(n => n.startsWith('Copy of Original Meal')).length).toBeGreaterThan(0);
  });

  test('duplicate original and copy are independent', async () => {
    const dupRes = await as(pid).post('/api/library/' + origId + '/duplicate');
    const dupId = dupRes.body.meal.id;
    // update the copy's nutrition
    await as(pid).put('/api/library/' + dupId + '/nutrition', {
      nutrition: { ...MEAL_A, calories: 999, meal_name: 'Modified Copy' }
    });
    // original should be unchanged
    const list = await as(pid).get('/api/library');
    const orig = list.body.find(m => m.id === origId);
    expect(orig.nutrition.calories).toBe(MEAL_A.calories);
    expect(orig.nutrition.calories).not.toBe(999);
  });

  test('POST /api/library/:id/duplicate returns 404 for unknown id', async () => {
    const res = await as(pid).post('/api/library/lib_nonexistent/duplicate');
    expect(res.status).toBe(404);
  });
});

// ══ Coverage gaps — reanalyze text path ═══════════════════════════════════════
describe('Reanalyze text-only path', () => {
  let pid;
  beforeAll(async () => { pid = await makeProfile('ReanalyzeTextUser'); });

  test('reanalyze without image falls back to text analysis (requires API — validates 400 without ingredients)', async () => {
    // No image + no ingredients = 400
    const res = await as(pid).post('/api/reanalyze', {
      mealName: 'Test Meal'
      // no ingredients
    });
    expect(res.status).toBe(400);
  });

  test('reanalyze with ingredients is validated correctly (ingredients required)', async () => {
    // Confirms the validation boundary: ingredients field is required.
    // The text-only Claude call path is an integration concern tested manually.
    const missingIngredientsRes = await as(pid).post('/api/reanalyze', { mealName: 'Test' });
    expect(missingIngredientsRes.status).toBe(400);
    const emptyIngredientsRes = await as(pid).post('/api/reanalyze', { ingredients: '' });
    // empty string is falsy — should also be 400
    expect(emptyIngredientsRes.status).toBe(400);
  });
});

// ══ Coverage gaps — serving size edge cases ═══════════════════════════════════
describe('Serving size edge cases', () => {
  let pid, libId;
  beforeAll(async () => {
    pid = await makeProfile('ServingEdgeUser');
    const s = await as(pid).post('/api/library', {
      nutrition: { ...MEAL_A, calories: 400, protein_g: 20 }
    });
    libId = s.body.meal.id;
  });

  test('0.75× serving correctly scales', async () => {
    const res = await as(pid).post('/api/library/' + libId + '/log', {
      mealType: 'snack', date: '2032-05-01', servingSize: 0.75
    });
    expect(res.body.meal.nutrition.calories).toBeCloseTo(300, 0);
    expect(res.body.meal.nutrition.protein_g).toBeCloseTo(15, 0);
  });

  test('1.5× serving correctly scales', async () => {
    const res = await as(pid).post('/api/library/' + libId + '/log', {
      mealType: 'snack', date: '2032-05-02', servingSize: 1.5
    });
    expect(res.body.meal.nutrition.calories).toBeCloseTo(600, 0);
  });

  test('invalid servingSize defaults to 1×', async () => {
    const res = await as(pid).post('/api/library/' + libId + '/log', {
      mealType: 'snack', date: '2032-05-03', servingSize: 0
    });
    expect(res.body.meal.nutrition.calories).toBe(400);
  });
});

// ══ Coverage gaps — settings K1/K2 migration ══════════════════════════════════
describe('Settings vitamin_k migration', () => {
  let pid;
  beforeAll(async () => { pid = await makeProfile('KMigUser'); });

  test('GET /api/settings migrates vitamin_k_mcg to k1+k2 in priorityNutrients', async () => {
    // Manually inject stale vitamin_k_mcg into settings
    // We can simulate by saving a priority list with the old key via direct PUT
    // then checking GET migrates it
    await as(pid).put('/api/settings/priority', {
      priorityNutrients: ['protein_g', 'vitamin_k_mcg', 'calcium_mg']
    });
    const res = await as(pid).get('/api/settings');
    expect(res.body.priorityNutrients).not.toContain('vitamin_k_mcg');
    expect(res.body.priorityNutrients).toContain('vitamin_k1_mcg');
    expect(res.body.priorityNutrients).toContain('vitamin_k2_mcg');
  });

  test('GET /api/settings migrates vitamin_k_mcg target to k1+k2', async () => {
    // inject stale target
    await as(pid).put('/api/settings/targets', {
      targets: { ...{calories:2000,protein_g:50}, vitamin_k_mcg: 120 }
    });
    const res = await as(pid).get('/api/settings');
    expect(res.body.targets.vitamin_k_mcg).toBeUndefined();
    expect(res.body.targets.vitamin_k1_mcg).toBe(120);
    expect(res.body.targets.vitamin_k2_mcg).toBe(200);
  });
});

// ══ Coverage gaps — supplement delete clears log ══════════════════════════════
describe('Supplement delete clears log entries', () => {
  let pid, suppId;
  const DATE = '2032-07-10';

  beforeAll(async () => {
    pid = await makeProfile('SuppDelUser');
    const s = await as(pid).post('/api/supplements', {
      name: 'Deletable Supp', nutrients: { vitamin_c_mg: 500 }
    });
    suppId = s.body.supplement.id;
    await as(pid).post('/api/supplog', { supplementId: suppId, date: DATE, doses: 1 });
  });

  test('deleting a supplement removes it from the log', async () => {
    const before = await as(pid).get('/api/supplog/' + DATE);
    expect(before.body.length).toBe(1);
    await as(pid).delete('/api/supplements/' + suppId);
    const after = await as(pid).get('/api/supplog/' + DATE);
    expect(after.body).toEqual([]);
  });
});

// ══ Library name rename ════════════════════════════════════════════════════════
describe('Library name rename', () => {
  let pid, libId;
  beforeAll(async () => {
    pid = await makeProfile('RenameUser');
    const s = await as(pid).post('/api/library', { nutrition: { ...MEAL_A, meal_name: 'Original Name' } });
    libId = s.body.meal.id;
  });

  test('PUT /api/library/:id/nutrition with top-level name updates the entry name', async () => {
    const res = await as(pid).put('/api/library/' + libId + '/nutrition', {
      nutrition: { ...MEAL_A, meal_name: 'Original Name' },
      name: 'Renamed Meal'
    });
    expect(res.status).toBe(200);
    const list = await as(pid).get('/api/library');
    const meal = list.body.find(m => m.id === libId);
    expect(meal.name).toBe('Renamed Meal');
  });

  test('name in nutrition.meal_name is used when no top-level name provided', async () => {
    const res = await as(pid).put('/api/library/' + libId + '/nutrition', {
      nutrition: { ...MEAL_A, meal_name: 'From meal_name field' }
    });
    expect(res.status).toBe(200);
    const list = await as(pid).get('/api/library');
    const meal = list.body.find(m => m.id === libId);
    expect(meal.name).toBe('From meal_name field');
  });
});
