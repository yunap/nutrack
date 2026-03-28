/**
 * NutritionTrack v3 — Test Suite
 * Run with: npm test
 *
 * Tests cover:
 *  - sumNutrition helper
 *  - All REST API endpoints (meals, library, summary, compare, settings)
 *  - Input validation and error handling
 *  - Data persistence across requests
 *  - Settings (targets + priority nutrients)
 */

const request = require('supertest');
const path    = require('path');
const fs      = require('fs');
const os      = require('os');

// ── Point the app at a temp data directory so tests never touch real data ────
const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nutrition-test-'));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.ANTHROPIC_API_KEY = 'test-key-not-used';  // prevent undefined errors

const { app, sumNutrition } = require('../server');

// ── Sample nutrition objects ──────────────────────────────────────────────────
const MEAL_A = {
  meal_name: 'Scrambled Eggs',
  description: '2 eggs with olive oil',
  ingredients: [{ name: 'eggs', quantity: '2 large', notes: 'scrambled' }],
  calories: 200, protein_g: 14, carbs_g: 2, fat_g: 15,
  fiber_g: 0, sugar_g: 0, sodium_mg: 200, potassium_mg: 140,
  calcium_mg: 60, iron_mg: 1.8, magnesium_mg: 12, phosphorus_mg: 180,
  zinc_mg: 1.2, vitamin_a_mcg: 140, vitamin_c_mg: 0, vitamin_d_mcg: 2,
  vitamin_e_mg: 1, vitamin_k_mcg: 0.5, vitamin_b1_mg: 0.07,
  vitamin_b2_mg: 0.27, vitamin_b3_mg: 0.07, vitamin_b6_mg: 0.14,
  vitamin_b12_mcg: 0.89, folate_mcg: 47
};

const MEAL_B = {
  meal_name: 'Greek Yogurt Bowl',
  description: '170g yogurt with berries',
  ingredients: [{ name: 'greek yogurt', quantity: '170g', notes: '' }],
  calories: 130, protein_g: 17, carbs_g: 9, fat_g: 0,
  fiber_g: 0, sugar_g: 7, sodium_mg: 60, potassium_mg: 240,
  calcium_mg: 200, iron_mg: 0.1, magnesium_mg: 19, phosphorus_mg: 190,
  zinc_mg: 1.0, vitamin_a_mcg: 0, vitamin_c_mg: 0, vitamin_d_mcg: 0,
  vitamin_e_mg: 0, vitamin_k_mcg: 0, vitamin_b1_mg: 0.05,
  vitamin_b2_mg: 0.27, vitamin_b3_mg: 0.1, vitamin_b6_mg: 0.1,
  vitamin_b12_mcg: 1.3, folate_mcg: 10
};

const TODAY = new Date().toISOString().split('T')[0];
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().split('T')[0];

// ══════════════════════════════════════════════════════════════════════════════
// UNIT TESTS — sumNutrition helper
// ══════════════════════════════════════════════════════════════════════════════
describe('sumNutrition()', () => {
  test('sums two meals correctly', () => {
    const result = sumNutrition([MEAL_A, MEAL_B]);
    expect(result.calories).toBeCloseTo(330, 0);
    expect(result.protein_g).toBeCloseTo(31, 0);
    expect(result.carbs_g).toBeCloseTo(11, 0);
    expect(result.fat_g).toBeCloseTo(15, 0);
    expect(result.calcium_mg).toBeCloseTo(260, 0);
  });

  test('handles empty array', () => {
    const result = sumNutrition([]);
    expect(result.calories).toBe(0);
    expect(result.protein_g).toBe(0);
  });

  test('handles single meal', () => {
    const result = sumNutrition([MEAL_A]);
    expect(result.calories).toBe(MEAL_A.calories);
    expect(result.protein_g).toBe(MEAL_A.protein_g);
  });

  test('handles missing fields gracefully', () => {
    const sparse = { calories: 100 };
    const result = sumNutrition([sparse]);
    expect(result.calories).toBe(100);
    expect(result.protein_g).toBe(0);
  });

  test('sums three meals', () => {
    const result = sumNutrition([MEAL_A, MEAL_B, MEAL_A]);
    expect(result.calories).toBeCloseTo(530, 0);
    expect(result.protein_g).toBeCloseTo(45, 0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// API — MEALS (daily log)
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /api/meals', () => {
  test('saves a meal and returns it', async () => {
    const res = await request(app).post('/api/meals').send({
      nutrition: MEAL_A, mealType: 'breakfast', date: TODAY
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.meal.mealType).toBe('breakfast');
    expect(res.body.meal.date).toBe(TODAY);
    expect(res.body.meal.id).toBeDefined();
  });

  test('returns 400 when nutrition is missing', async () => {
    const res = await request(app).post('/api/meals').send({ mealType: 'lunch' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('defaults mealType to snack when not provided', async () => {
    const res = await request(app).post('/api/meals').send({ nutrition: MEAL_B, date: TODAY });
    expect(res.status).toBe(200);
    expect(res.body.meal.mealType).toBe('snack');
  });

  test('stores thumbFile when provided', async () => {
    const res = await request(app).post('/api/meals').send({
      nutrition: MEAL_A, mealType: 'dinner', date: TODAY, thumbFile: 'test.jpg'
    });
    expect(res.status).toBe(200);
    expect(res.body.meal.thumbFile).toBe('test.jpg');
  });
});

describe('GET /api/meals/:date', () => {
  test('returns meals for a specific date', async () => {
    await request(app).post('/api/meals').send({ nutrition: MEAL_A, mealType: 'breakfast', date: TODAY });
    const res = await request(app).get(`/api/meals/${TODAY}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].nutrition.meal_name).toBeDefined();
  });

  test('returns empty array for date with no meals', async () => {
    const res = await request(app).get('/api/meals/1999-01-01');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('DELETE /api/meals/:id', () => {
  test('deletes a meal by id', async () => {
    const save = await request(app).post('/api/meals').send({
      nutrition: MEAL_A, mealType: 'snack', date: TODAY
    });
    const id = save.body.meal.id;

    const del = await request(app).delete(`/api/meals/${id}`);
    expect(del.status).toBe(200);
    expect(del.body.success).toBe(true);

    const check = await request(app).get(`/api/meals/${TODAY}`);
    const ids = check.body.map(m => m.id);
    expect(ids).not.toContain(id);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// API — SUMMARY
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /api/summary/:date', () => {
  test('returns null for a date with no meals', async () => {
    const res = await request(app).get('/api/summary/1990-01-01');
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  test('correctly sums nutrition across meals for a date', async () => {
    const date = '2030-06-15';
    await request(app).post('/api/meals').send({ nutrition: MEAL_A, mealType: 'breakfast', date });
    await request(app).post('/api/meals').send({ nutrition: MEAL_B, mealType: 'lunch', date });

    const res = await request(app).get(`/api/summary/${date}`);
    expect(res.status).toBe(200);
    expect(res.body.calories).toBeCloseTo(MEAL_A.calories + MEAL_B.calories, 0);
    expect(res.body.protein_g).toBeCloseTo(MEAL_A.protein_g + MEAL_B.protein_g, 0);
    expect(res.body.mealCount).toBe(2);
    expect(Array.isArray(res.body.meals)).toBe(true);
  });

  test('summary includes meal list with mealType', async () => {
    const date = '2030-06-16';
    await request(app).post('/api/meals').send({ nutrition: MEAL_A, mealType: 'dinner', date });
    const res = await request(app).get(`/api/summary/${date}`);
    expect(res.body.meals[0].mealType).toBe('dinner');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// API — DATES
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /api/dates', () => {
  test('returns array of unique dates in descending order', async () => {
    await request(app).post('/api/meals').send({ nutrition: MEAL_A, date: '2030-01-01' });
    await request(app).post('/api/meals').send({ nutrition: MEAL_B, date: '2030-01-03' });
    await request(app).post('/api/meals').send({ nutrition: MEAL_A, date: '2030-01-03' }); // duplicate date

    const res = await request(app).get('/api/dates');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // dates should be unique
    const unique = new Set(res.body);
    expect(unique.size).toBe(res.body.length);
    // sorted descending
    for (let i = 0; i < res.body.length - 1; i++) {
      expect(res.body[i] >= res.body[i + 1]).toBe(true);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// API — COMPARE
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /api/compare', () => {
  const D1 = '2031-03-01', D2 = '2031-03-02';

  beforeAll(async () => {
    await request(app).post('/api/meals').send({ nutrition: MEAL_A, date: D1 });
    await request(app).post('/api/meals').send({ nutrition: MEAL_B, date: D2 });
  });

  test('returns summaries for both dates', async () => {
    const res = await request(app).get(`/api/compare?date1=${D1}&date2=${D2}`);
    expect(res.status).toBe(200);
    expect(res.body.date1.date).toBe(D1);
    expect(res.body.date2.date).toBe(D2);
    expect(res.body.date1.summary.calories).toBeCloseTo(MEAL_A.calories, 0);
    expect(res.body.date2.summary.calories).toBeCloseTo(MEAL_B.calories, 0);
  });

  test('returns null summary for date with no meals', async () => {
    const res = await request(app).get(`/api/compare?date1=${D1}&date2=1888-01-01`);
    expect(res.status).toBe(200);
    expect(res.body.date2.summary).toBeNull();
    expect(res.body.date2.mealCount).toBe(0);
  });

  test('returns 400 when dates are missing', async () => {
    const res = await request(app).get('/api/compare?date1=2031-03-01');
    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// API — LIBRARY
// ══════════════════════════════════════════════════════════════════════════════
describe('Library API', () => {
  let savedLibId;

  test('POST /api/library saves a meal', async () => {
    const res = await request(app).post('/api/library').send({
      nutrition: MEAL_A, defaultMealType: 'breakfast'
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.meal.id).toMatch(/^lib_/);
    expect(res.body.meal.name).toBe(MEAL_A.meal_name);
    savedLibId = res.body.meal.id;
  });

  test('POST /api/library flags duplicate by name', async () => {
    const res = await request(app).post('/api/library').send({
      nutrition: MEAL_A, defaultMealType: 'snack'
    });
    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
  });

  test('GET /api/library returns saved meals', async () => {
    const res = await request(app).get('/api/library');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const names = res.body.map(m => m.name);
    expect(names).toContain(MEAL_A.meal_name);
  });

  test('POST /api/library/:id/log adds to daily log', async () => {
    const res = await request(app)
      .post(`/api/library/${savedLibId}/log`)
      .send({ mealType: 'lunch', date: TODAY });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.meal.fromLibrary).toBe(true);
    expect(res.body.meal.mealType).toBe('lunch');

    // verify it appears in daily log
    const log = await request(app).get(`/api/meals/${TODAY}`);
    const fromLib = log.body.filter(m => m.libraryId === savedLibId);
    expect(fromLib.length).toBeGreaterThan(0);
  });

  test('POST /api/library/:id/log returns 404 for unknown id', async () => {
    const res = await request(app)
      .post('/api/library/lib_nonexistent/log')
      .send({ mealType: 'snack', date: TODAY });
    expect(res.status).toBe(404);
  });

  test('DELETE /api/library/:id removes the meal', async () => {
    // save a new meal to delete
    const save = await request(app).post('/api/library').send({
      nutrition: MEAL_B, defaultMealType: 'snack'
    });
    const id = save.body.meal.id;

    const del = await request(app).delete(`/api/library/${id}`);
    expect(del.status).toBe(200);
    expect(del.body.success).toBe(true);

    const list = await request(app).get('/api/library');
    const ids = list.body.map(m => m.id);
    expect(ids).not.toContain(id);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// API — SETTINGS
// ══════════════════════════════════════════════════════════════════════════════
describe('Settings API', () => {
  test('GET /api/settings returns defaults', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.targets).toBeDefined();
    expect(res.body.targets.protein_g).toBeDefined();
    expect(res.body.priorityNutrients).toBeDefined();
    expect(Array.isArray(res.body.priorityNutrients)).toBe(true);
  });

  test('PUT /api/settings/targets saves custom targets', async () => {
    const customTargets = { protein_g: 130, calories: 1800, calcium_mg: 1200 };
    const res = await request(app).put('/api/settings/targets').send({ targets: customTargets });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const check = await request(app).get('/api/settings');
    expect(check.body.targets.protein_g).toBe(130);
    expect(check.body.targets.calories).toBe(1800);
  });

  test('PUT /api/settings/targets returns 400 when missing', async () => {
    const res = await request(app).put('/api/settings/targets').send({});
    expect(res.status).toBe(400);
  });

  test('PUT /api/settings/priority saves priority nutrients', async () => {
    const priority = ['protein_g', 'calcium_mg', 'vitamin_d_mcg'];
    const res = await request(app).put('/api/settings/priority').send({ priorityNutrients: priority });
    expect(res.status).toBe(200);

    const check = await request(app).get('/api/settings');
    expect(check.body.priorityNutrients).toEqual(priority);
  });

  test('PUT /api/settings/priority returns 400 when missing', async () => {
    const res = await request(app).put('/api/settings/priority').send({});
    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// API — ANALYZE (text mode — mocked, no real API call)
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /api/analyze-text', () => {
  test('returns 400 when description is empty', async () => {
    const res = await request(app).post('/api/analyze-text').send({ description: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('returns 400 when description is missing', async () => {
    const res = await request(app).post('/api/analyze-text').send({});
    expect(res.status).toBe(400);
  });

  // Note: actual Claude API call is not tested here to avoid real API calls in CI.
  // Integration tests for /api/analyze and /api/analyze-text with mocked Claude
  // responses can be added with jest.mock('node-fetch') if needed.
});

// ══════════════════════════════════════════════════════════════════════════════
// API — REANALYZE validation
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /api/reanalyze', () => {
  test('returns 400 when ingredients are missing', async () => {
    const res = await request(app).post('/api/reanalyze').send({
      imageBase64: 'abc', imageMime: 'image/jpeg'
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

// ── Cleanup temp directory after all tests ────────────────────────────────────
afterAll(() => {
  try { fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true }); } catch (e) {}
});

// ══════════════════════════════════════════════════════════════════════════════
// API — ANALYZE URL (validation only — no real HTTP fetch in unit tests)
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /api/analyze-url', () => {
  test('returns 400 when url is missing', async () => {
    const res = await request(app).post('/api/analyze-url').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('returns 400 when url is empty string', async () => {
    const res = await request(app).post('/api/analyze-url').send({ url: '  ' });
    expect(res.status).toBe(400);
  });

  test('returns 400 for invalid URL format', async () => {
    const res = await request(app).post('/api/analyze-url').send({ url: 'not-a-url' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid URL/);
  });

  test('returns 400 for non-http protocol', async () => {
    const res = await request(app).post('/api/analyze-url').send({ url: 'ftp://example.com/recipe' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/http/);
  });

  test('returns 400 when page cannot be fetched', async () => {
    // Use a non-routable IP — will abort after server-side 10s timeout
    const res = await request(app)
      .post('/api/analyze-url')
      .send({ url: 'https://192.0.2.1/recipe' })
      .timeout(15000);
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  }, 15000);
});
