# NuTrack — AI-Powered Nutrition Tracker

Personal nutrition tracking app that uses Claude to analyze meals from photos, text descriptions, or recipe URLs. Tracks 30 nutrients across food and supplements with daily dashboards, gap analysis, and trend charts.

## Setup

### Prerequisites
- [Node.js](https://nodejs.org) v16+
- Anthropic API key from https://console.anthropic.com

### Install & run
```bash
cd meal-nutrition-app-v3
npm install
```

Edit `.env`:
```
ANTHROPIC_API_KEY=your_key_here
PORT=7000
```

```bash
npm start
```

Visit **http://localhost:7000**

### Run tests
```bash
npm test
```

91 tests covering all endpoints, data isolation, edge cases, and migrations.

---

## Features

### Multi-profile support
Multiple user profiles with fully isolated data (meals, library, supplements, settings). Switch profiles from the top-right dropdown. Each profile has its own:
- `data/profiles/<profileId>/meals.json`
- `data/profiles/<profileId>/library.json`
- `data/profiles/<profileId>/settings.json`
- `data/profiles/<profileId>/supplements.json`
- `data/profiles/<profileId>/supplog.json`

### Log Meal tab
Three input modes:

- **📷 Photo** — upload or drop a meal photo. Claude identifies ingredients and estimates nutrition. An optional text field appears after upload for context ("homemade, the sauce has heavy cream, I ate about half").
- **✏️ Describe** — type a free-text meal description with quantities, brands, and cooking methods.
- **🔗 Recipe URL** — paste a URL from any cooking site (AllRecipes, NYT Cooking, Serious Eats, etc.). Claude fetches the recipe, calculates per-serving nutrition. Optional notes field for modifications ("used half the butter, subbed Greek yogurt for cream").

After analysis:
- Review and edit ingredients inline — add, remove, or modify any row
- **Recalculate** with corrected ingredients (works for all modes, no image required for text/URL meals)
- **Portion selector** — log 1×, ¾, ½, ¼, or any custom fraction. Scales all nutrients before saving.
- **Save to today's log** with meal type (Breakfast/Lunch/Dinner/Snack) and date
- **Post-log library nudge** — after saving, if the meal isn't in your library, a prompt asks "Save to library too?" for quick reuse
- **✕ Clear** button to reset the form and start over

### Library tab
Saved meals for quick re-logging without re-analysis.

- **Search** — filter by meal name or ingredient name, live as you type
- **Detail panel** — tap any card to see full nutrition breakdown (macros, minerals, vitamins, ingredients)
- **Inline name editing** — click the meal name to rename it
- **✏️ Edit** — open the ingredient editor, modify quantities or swap ingredients, recalculate nutrition
- **⧉ Duplicate** — creates a "Copy of [name]" and immediately opens it in edit mode for modification
- **📷 Add photo** — upload a thumbnail for visual reference
- **Serving size** — log ¾, ½, ¼, or custom fractions from the log modal. Preview shows scaled calories/protein.
- **Remove** — delete from library

### Today tab
Daily nutrition dashboard with four collapsible sections:

**Daily macros** — calorie, protein, carb, and fat totals with supplement sub-lines showing supplement contributions separately. Donut chart shows food + supplement combined macro split. Fiber from supplements noted below the grid.

**% of personal daily targets** — custom HTML bar chart (replaced Chart.js for interactivity). Click any bar to expand an inline drill-down panel showing:
- Each meal that contributed to that nutrient, sorted by contribution
- Supplement contributions with 💊 icon
- Proportional bars and percentage breakdowns
- Total line when multiple sources

A thin vertical line at 100% provides a visual target reference. Colors: blue (under 70%), teal (70-89%), green (90%+), red (over UL only).

**Supplement gap table** — based on your priority nutrients. Columns: Nutrient | From food | From supps | Target | Balance.
- **Balance column** — sortable (click header to cycle: default → most needed ↑ → most over ↓)
- **UL-aware coloring** — red only when total exceeds the NIH Tolerable Upper Intake Level, not just when over target. Green means over target but safe. Teal means still needed.
- **Magnesium UL** checks supplement amount only (food magnesium excluded per NIH guidance)
- **UL flag** shows even when under personal target (e.g., Vitamin D at 131mcg with 100mcg UL)
- Click any row for the same meal-level drill-down as the bar chart

**Supplements today** — toggle switches to mark each supplement taken. Dose multiplier for adjusting intake.

**"Set targets in Settings"** is a clickable link to the Settings tab.

### History tab
- **Nutrient selector** — toggle which nutrients appear on the charts (shared between both)
- **Daily trends — % of target** — line chart showing each selected nutrient as a percentage of your personal target over the last 10 days. 100% dashed reference line. All nutrients are directly comparable on the same axis regardless of unit (mg, mcg, g).
- **7-day rolling average — % of target** — smoothed trend chart over 30 days. Shows whether you're genuinely trending toward targets, filtering out daily spikes. Collapsible.
- **Compare two days** — side-by-side bar chart and detail table with difference indicators. Includes supplement totals.
- **All logged days** — clickable list to jump to any day's Today view

### Settings tab
- **Supplement library** — add supplements manually or scan a label photo. Claude reads the label and extracts all nutrients with:
  - B-vitamin name mapping (Riboflavin → B2, Pantothenic Acid → B5, etc.)
  - IU → mcg conversions for fat-soluble vitamins
  - K1/K2 form detection (MK-7 → K2, phylloquinone → K1)
  - Elemental magnesium estimation for proprietary blends
  - Macro extraction (calories, carbs, fiber, sugar, protein, fat)
- **Priority nutrients** — select which nutrients appear in the gap table
- **Personal daily targets** — customize targets for all 30 tracked nutrients
- **Timezone** — auto-detects browser timezone. Manual override with UTC offset selector if Today shows the wrong date.

---

## Tracked nutrients (30)

| Category | Nutrients |
|---|---|
| Macros | Calories, Protein, Carbs, Fat, Fiber, Sugar |
| Minerals | Sodium, Potassium, Calcium, Iron, Magnesium, Phosphorus, Zinc, Copper, Selenium, Manganese |
| Vitamins | A, C, D, E, K1, K2, B1 (Thiamine), B2 (Riboflavin), B3 (Niacin), B5 (Pantothenic), B6, B12, Folate |
| Other | Omega-3 |

### Vitamin K split
- `vitamin_k1_mcg` — phylloquinone, from leafy greens/food. Target: 120mcg.
- `vitamin_k2_mcg` — menaquinone (MK-4/MK-7), from supplements/fermented foods. Target: 200mcg.
- No UL established for either form.

### NIH Tolerable Upper Intake Levels (adults)
Applied in the gap table — only nutrients exceeding these thresholds show red:

| Nutrient | UL | Notes |
|---|---|---|
| Sodium | 2,300mg | |
| Calcium | 2,500mg | |
| Iron | 45mg | |
| Magnesium | 350mg | Supplement form only |
| Phosphorus | 4,000mg | |
| Zinc | 40mg | |
| Vitamin A | 3,000mcg | Preformed retinol only |
| Vitamin C | 2,000mg | |
| Vitamin D | 100mcg | = 4,000 IU |
| Vitamin E | 1,000mg | |
| Niacin (B3) | 35mg | Supplement/fortification only |
| B6 | 100mg | |
| Folate | 1,000mcg | Supplement/fortification only |
| Copper | 10mg | |
| Selenium | 400mcg | |
| Manganese | 11mg | |

Nutrients without established ULs (K1, K2, B1, B2, B5, B12, Potassium, Omega-3) never flag red regardless of amount.

---

## Architecture

### File structure
```
public/
  index.html          — HTML + CSS (740 lines)
  app.js              — Frontend JavaScript (1,700 lines)
server.js             — Express backend + Claude API (770 lines)
tests/
  server.test.js      — Jest + Supertest (91 tests, 900 lines)
data/
  profiles.json       — Profile registry
  thumbs/             — Shared meal photo thumbnails
  profiles/<id>/      — Per-profile JSON databases
```

### Stack
- **Backend**: Node.js, Express, lowdb (JSON file database), multer (image upload)
- **Frontend**: Vanilla JS, Chart.js (donut + line charts), custom HTML bar charts
- **AI**: Anthropic Claude Sonnet (claude-sonnet-4-20250514) via Messages API
- **Testing**: Jest + Supertest

### Key design decisions
- **Snapshot logging** — logging a meal copies nutrition data at that moment. Renaming or editing a library entry does not affect historical log entries.
- **No build step** — `app.js` is plain JS served by Express static middleware. No webpack, no transpilation.
- **UL-aware, not UL-restrictive** — the app flags when intake exceeds safety thresholds but respects personal therapeutic targets (e.g., high-dose Vitamin D).
- **Magnesium UL exception** — per NIH guidance, food-sourced magnesium is excluded from the 350mg supplemental UL check.
- **LBM-based protein targets** — for users with specific body composition data, targets can be set based on lean body mass rather than total weight.

### API endpoints
All profile-scoped routes require `x-profile-id` header.

| Method | Path | Description |
|---|---|---|
| GET/POST | `/api/profiles` | List/create profiles |
| DELETE | `/api/profiles/:id` | Delete profile |
| POST | `/api/analyze` | Photo analysis (multipart, optional `notes` field) |
| POST | `/api/analyze-text` | Text description analysis |
| POST | `/api/analyze-url` | Recipe URL analysis (optional `notes` field) |
| POST | `/api/reanalyze` | Recalculate with edited ingredients |
| GET/POST | `/api/meals` | List/create meal log entries |
| GET | `/api/meals/:date` | Meals for a specific date |
| DELETE | `/api/meals/:id` | Delete a meal |
| GET | `/api/summary/:date` | Nutrition summary for a date |
| GET | `/api/compare` | Compare two dates |
| GET | `/api/dates` | All logged dates |
| GET/POST | `/api/library` | List/save library meals |
| DELETE | `/api/library/:id` | Delete library entry |
| POST | `/api/library/:id/log` | Log from library (with `servingSize`) |
| POST | `/api/library/:id/photo` | Upload library thumbnail |
| PUT | `/api/library/:id/nutrition` | Update nutrition/name |
| POST | `/api/library/:id/duplicate` | Duplicate entry |
| GET/PUT | `/api/settings/targets` | Nutrient targets |
| PUT | `/api/settings/priority` | Priority nutrients list |
| GET/POST | `/api/supplements` | List/create supplements |
| PUT/DELETE | `/api/supplements/:id` | Update/delete supplement |
| POST | `/api/supplements/analyze-label` | Scan supplement label photo |
| GET | `/api/supplog/:date` | Supplement log for date |
| POST | `/api/supplog` | Log supplement intake |
| DELETE | `/api/supplog/:suppId/:date` | Remove supplement log entry |
| GET | `/api/supplog/:date/totals` | Sum supplement nutrients for date |

---


---

## Authentication (optional)

Auth is **disabled by default** — the app runs in open mode for local use. Enable it by adding OAuth credentials to `.env`.

### Setup

1. **Google OAuth** — go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an OAuth 2.0 Client ID. Set the authorized redirect URI to `https://your-domain.com/auth/google/callback`.

2. **GitHub OAuth** — go to [GitHub Developer Settings](https://github.com/settings/developers), create a new OAuth App. Set the callback URL to `https://your-domain.com/auth/github/callback`.

3. Add to `.env`:
```
GOOGLE_CLIENT_ID=your-id
GOOGLE_CLIENT_SECRET=your-secret
GITHUB_CLIENT_ID=your-id
GITHUB_CLIENT_SECRET=your-secret
BASE_URL=https://your-domain.com
SESSION_SECRET=openssl-rand-hex-32
NODE_ENV=production
```

You can configure one or both providers.

### Profile assignment

After both users have signed in once, check `data/users.json` for their IDs:

```json
{
  "users": [
    { "id": "google_118234567890", "name": "Yuna", "email": "yuna@gmail.com", "isAdmin": true },
    { "id": "google_998765432100", "name": "Eugene", "email": "eugene@gmail.com", "isAdmin": false }
  ]
}
```

Then edit `data/profiles.json` to assign ownership:

```json
{
  "profiles": [
    { "id": "prof_abc", "name": "Yuna", "avatar": "Y", "ownerId": "google_118234567890" },
    { "id": "prof_def", "name": "Eugene", "avatar": "E", "ownerId": "google_998765432100" }
  ]
}
```

To make both users admins, set `"isAdmin": true` for both entries in `users.json`.

### Access control

- **Admins** can see and manage all profiles
- **Non-admin users** see only profiles assigned to them (via `ownerId`)
- **Unassigned profiles** (no `ownerId`) are visible only to admins
- **New profiles** created via the UI are automatically assigned to the creating user
- **Dev mode** (no OAuth configured) — all profiles are accessible to everyone


## Cost
~$0.01-0.03 per meal analysis with Claude Sonnet. Label scans are similar. No ongoing costs when browsing, logging from library, or viewing dashboards.

## Data
All data stays on your machine in JSON files. No cloud, no accounts, no telemetry. Delete `data/` to start fresh.
