# Meal Nutrition Tracker v2

AI-powered nutrition tracker with meal logging, daily dashboards, and day-by-day comparison.

## Setup (5 minutes)

### 1. Prerequisites
- [Node.js](https://nodejs.org) v16+
- Anthropic API key from https://console.anthropic.com

### 2. Install dependencies
```bash
cd meal-nutrition-app-v2
npm install
```

### 3. Add your API key
Edit `.env`:
```
ANTHROPIC_API_KEY=your_key_here
PORT=3000
```

### 4. Start
```bash
npm start
```

### 5. Open
Visit **http://localhost:3000**

---

## Features

### Log Meal
- Upload a meal photo → Claude identifies ingredients and calculates all nutrients
- Correct any ingredient (name, quantity, cooking method) and recalculate
- Choose meal type: Breakfast / Lunch / Dinner / Snack
- Save to your local log

### Today
- Pick any date to see that day's full nutritional breakdown
- Macros donut chart (protein / carbs / fat calorie split)
- Horizontal bar chart showing % of Recommended Daily Values for 12 key nutrients
- Color coded: green = 80–110% RDV, red = over 110%, blue = under 80%
- Full meal list for the day with thumbnails; delete any meal

### History & Compare
- Select which nutrients to track (toggle buttons)
- Line chart showing selected nutrients over the last 10 days
- Compare any two days side-by-side: grouped bar chart (% RDV) + detail table with difference indicators

## Data storage
All meals are stored in `data/meals.json` — a plain JSON file on your computer. No cloud, no account needed.

## Cost
~$0.01–0.03 per meal analysis with Claude Sonnet.
