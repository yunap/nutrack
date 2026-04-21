// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS & STATE
// ═══════════════════════════════════════════════════════════════════════════
const DEFAULT_TARGETS = {
  calories:2000,protein_g:50,carbs_g:275,fat_g:78,fiber_g:28,sugar_g:50,
  sodium_mg:2300,potassium_mg:4700,calcium_mg:1300,iron_mg:18,magnesium_mg:420,
  phosphorus_mg:1250,zinc_mg:11,vitamin_a_mcg:900,vitamin_c_mg:90,vitamin_d_mcg:20,
  vitamin_e_mg:15,vitamin_k1_mcg:120,vitamin_k2_mcg:200,vitamin_b1_mg:1.2,vitamin_b2_mg:1.3,
  vitamin_b3_mg:16,vitamin_b5_mg:5,vitamin_b6_mg:1.7,vitamin_b12_mcg:2.4,folate_mcg:400,omega3_mg:1600,copper_mg:0.9,selenium_mcg:55,manganese_mg:2.3
};
const LABELS = {
  calories:'Calories',protein_g:'Protein',carbs_g:'Carbs',fat_g:'Fat',
  fiber_g:'Fiber',sugar_g:'Sugar',sodium_mg:'Sodium',potassium_mg:'Potassium',
  calcium_mg:'Calcium',iron_mg:'Iron',magnesium_mg:'Magnesium',
  phosphorus_mg:'Phosphorus',zinc_mg:'Zinc',vitamin_a_mcg:'Vitamin A',
  vitamin_c_mg:'Vitamin C',vitamin_d_mcg:'Vitamin D',vitamin_e_mg:'Vitamin E',
  vitamin_k1_mcg:'Vitamin K1',
  vitamin_k2_mcg:'Vitamin K2',vitamin_b1_mg:'B1 (Thiamine)',vitamin_b2_mg:'B2 (Riboflavin)',
  vitamin_b3_mg:'B3 (Niacin)',vitamin_b6_mg:'B6',vitamin_b12_mcg:'B12',folate_mcg:'Folate',
  omega3_mg:'Omega-3',
  copper_mg:'Copper',
  selenium_mcg:'Selenium',
  manganese_mg:'Manganese',
  vitamin_b5_mg:'B5 (Pantothenic)'
};
const UNITS = {
  calories:'kcal',protein_g:'g',carbs_g:'g',fat_g:'g',fiber_g:'g',sugar_g:'g',
  sodium_mg:'mg',potassium_mg:'mg',calcium_mg:'mg',iron_mg:'mg',magnesium_mg:'mg',
  phosphorus_mg:'mg',zinc_mg:'mg',vitamin_a_mcg:'mcg',vitamin_c_mg:'mg',
  vitamin_d_mcg:'mcg',vitamin_e_mg:'mg',vitamin_k1_mcg:'mcg',vitamin_k2_mcg:'mcg',vitamin_b1_mg:'mg',
  vitamin_b2_mg:'mg',vitamin_b3_mg:'mg',vitamin_b6_mg:'mg',vitamin_b12_mcg:'mcg',folate_mcg:'mcg',
  omega3_mg:'mg',
  copper_mg:'mg',
  selenium_mcg:'mcg',
  manganese_mg:'mg',
  vitamin_b5_mg:'mg'
};

let imageBase64=null, imageMime=null, currentNutrition=null, currentThumbFile=null;
let currentProfileId=null, currentProfileName=null;
let selMealType='breakfast';
let logServingSize = 1;
let settings={ targets:{...DEFAULT_TARGETS}, priorityNutrients:['protein_g','calcium_mg','vitamin_d_mcg','vitamin_c_mg','iron_mg','magnesium_mg'] };
let focusNutrients=['protein_g','calcium_mg','vitamin_c_mg','vitamin_d_mcg'];

// ── Timezone helpers ──────────────────────────────────────────────────────────
// Returns today's date string (YYYY-MM-DD) in the user's preferred timezone.
// tzOffset = minutes offset from UTC (e.g. -420 for UTC-7, 330 for UTC+5:30).
// Defaults to the browser's local offset if no preference is stored.
function getTzOffset() {
  const stored = localStorage.getItem('tzOffset');
  if (stored !== null && stored !== '') return parseInt(stored);
  return -(new Date().getTimezoneOffset()); // browser local offset in minutes
}

function localDateStr(dateObj) {
  const d = dateObj || new Date();
  const offsetMin = getTzOffset();
  const local = new Date(d.getTime() + (offsetMin + d.getTimezoneOffset()) * 60000);
  const y = local.getFullYear();
  const m = String(local.getMonth()+1).padStart(2,'0');
  const day = String(local.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+day;
}
let suppTotals={};
let _todayMeals = [];
let _todaySuppLog = null;
let _openDrillKey = null;
let _gapSortDir = 'default'; // 'default' | 'asc' | 'desc'

// NIH/IOM Tolerable Upper Intake Levels for adults (per day).
// null = no established UL (no known toxicity at normal intakes).
// Sources: NIH ODS, National Academies DRI reports.
const UPPER_LIMITS = {
  calories:      null,
  protein_g:     null,
  carbs_g:       null,
  fat_g:         null,
  fiber_g:       null,
  sugar_g:       null,
  sodium_mg:     2300,    // AI = UL per 2019 NASEM report
  potassium_mg:  null,    // no UL established
  calcium_mg:    2500,    // NIH ODS
  iron_mg:       45,      // NIH ODS
  magnesium_mg:  350,     // supplement form only; food magnesium excluded
  phosphorus_mg: 4000,    // NIH ODS adults 19-70
  zinc_mg:       40,      // NIH ODS
  vitamin_a_mcg: 3000,    // preformed retinol only
  vitamin_c_mg:  2000,    // NIH ODS
  vitamin_d_mcg: 100,     // NIH ODS (= 4000 IU)
  vitamin_e_mg:  1000,    // NIH ODS (all-rac-α-tocopherol)
  vitamin_k1_mcg: null,   // no UL established
  vitamin_k2_mcg: null,   // no UL established
  vitamin_b1_mg:  null,   // no UL established
  vitamin_b2_mg:  null,   // no UL established
  vitamin_b3_mg:  35,     // from supplements/fortification only
  vitamin_b5_mg:  null,   // no UL established
  vitamin_b6_mg:  100,    // NIH ODS
  vitamin_b12_mcg: null,  // no UL established
  folate_mcg:    1000,    // from supplements/fortification only
  omega3_mg:     null,    // no established UL; FDA GRAS up to 3000mg EPA+DHA
  copper_mg:     10,      // NIH ODS
  selenium_mcg:  400,     // NIH ODS
  manganese_mg:  11,      // NIH ODS
};
let charts={};
let pendingLibId=null, pendingLibDefaultType='snack';

// ═══════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════
async function init() {
  setTodayDate();
  await loadProfileScreen();
  // try to restore last used profile
  const savedId   = localStorage.getItem('activeProfileId');
  const savedName = localStorage.getItem('activeProfileName');
  if (savedId && savedName) {
    // verify it still exists
    const res = await fetch('/api/profiles');
    const profiles = await res.json();
    const match = profiles.findIndex(p => p.id === savedId);
    if (match >= 0) {
      selectProfile(savedId, savedName, match);
      try {
        const r = await fetch('/api/settings');
        settings = await r.json();
      } catch(e) {}
      buildSettingsUI();
      return;
    }
  }
  // no saved profile — show the picker
  document.getElementById('profile-screen').style.display = 'flex';
}

// ═══════════════════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════
// ── Collapsible card sections ─────────────────────────────────────────────────
function toggleCardCollapse(id, headerEl) {
  const el = document.getElementById(id);
  if (!el) return;
  const isCollapsed = el.classList.toggle('collapsed');
  if (headerEl) headerEl.classList.toggle('collapsed', isCollapsed);
  // persist preference for the session
  try { sessionStorage.setItem('collapse_' + id, isCollapsed ? '1' : '0'); } catch(e) {}
}
function restoreCollapseStates() {
  ['rdv-collapse', 'gap-collapse', 'supps-collapse', 'rolling-collapse'].forEach(id => {
    try {
      const val = sessionStorage.getItem('collapse_' + id);
      if (val === '1') {
        const el = document.getElementById(id);
        if (el) {
          el.classList.add('collapsed');
          const header = el.closest('.card')?.querySelector('.card-head-toggle');
          if (header) header.classList.add('collapsed');
        }
      }
    } catch(e) {}
  });
}

function go(name) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  document.querySelector(`.nav-tab[data-page="${name}"]`)?.classList.add('active');
  if (name==='today') loadToday();
  if (name==='library') loadLibrary();
  if (name==='history') loadHistory();
  if (name==='settings') buildSettingsUI();
}

// ═══════════════════════════════════════════════════════════════════════════
// LOG MEAL
// ═══════════════════════════════════════════════════════════════════════════
function handleDrop(e) {
  e.preventDefault(); document.getElementById('drop-zone').classList.remove('over');
  const f=e.dataTransfer.files[0]; if(f&&f.type.startsWith('image/')) handleFile(f);
}
function handleFile(file) {
  if(!file) return; imageMime=file.type||'image/jpeg';
  const reader=new FileReader();
  reader.onload=e=>{
    imageBase64=e.target.result.split(',')[1];
    document.getElementById('preview-img').src=e.target.result;
    document.getElementById('preview-wrap').style.display='block';
    document.getElementById('upload-prompt').style.display='none';
    document.getElementById('analyze-btn').style.display='flex';
    document.getElementById('log-results').style.display='none';
    document.getElementById('photo-augment').style.display='block';
  };
  reader.readAsDataURL(file);
}
function selMType(el) {
  document.querySelectorAll('#page-log .mtype').forEach(b=>b.classList.remove('sel'));
  el.classList.add('sel'); selMealType=el.dataset.type;
}
let inputMode = 'photo';

function setInputMode(mode) {
  inputMode = mode;
  document.getElementById('photo-mode').style.display = mode==='photo' ? 'block' : 'none';
  document.getElementById('text-mode').style.display  = mode==='text'  ? 'block' : 'none';
  document.getElementById('url-mode').style.display   = mode==='url'   ? 'block' : 'none';
  ['photo','text','url'].forEach(m => {
    const btn = document.getElementById('mode-'+m+'-btn');
    btn.style.background = mode===m ? 'var(--green)' : 'var(--surface)';
    btn.style.color = mode===m ? '#fff' : 'var(--t2)';
  });
  document.getElementById('log-results').style.display='none';
  document.getElementById('log-err').style.display='none';
  if (mode==='text') {
    document.getElementById('analyze-btn').style.display = document.getElementById('meal-description').value.trim() ? 'flex' : 'none';
  } else if (mode==='url') {
    document.getElementById('analyze-btn').style.display = document.getElementById('recipe-url').value.trim() ? 'flex' : 'none';
  } else {
    document.getElementById('analyze-btn').style.display = imageBase64 ? 'flex' : 'none';
  }
}

function toggleTextAnalyzeBtn() {
  const hasText = document.getElementById('meal-description').value.trim().length > 0;
  document.getElementById('analyze-btn').style.display = hasText ? 'flex' : 'none';
}

function toggleUrlAnalyzeBtn() {
  const hasUrl = document.getElementById('recipe-url').value.trim().length > 0;
  document.getElementById('analyze-btn').style.display = hasUrl ? 'flex' : 'none';
}

async function analyze() {
  const btn=document.getElementById('analyze-btn');
  btn.disabled=true; btn.innerHTML='<div class="spin"></div> Analyzing…';
  document.getElementById('log-err').style.display='none';

  try {
    let d;
    if (inputMode === 'text') {
      const desc = document.getElementById('meal-description').value.trim();
      if (!desc) throw new Error('Please describe your meal first');
      const r=await fetch('/api/analyze-text',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({description:desc})});
      d=await r.json(); if(!r.ok) throw new Error(d.error);
      currentThumbFile=null;
    } else if (inputMode === 'url') {
      const url = document.getElementById('recipe-url').value.trim();
      if (!url) throw new Error('Please enter a recipe URL first');
      const urlNotes = document.getElementById('url-notes')?.value.trim() || '';
      btn.innerHTML='<div class="spin"></div> Fetching recipe…';
      const r=await fetch('/api/analyze-url',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url, notes: urlNotes})});
      d=await r.json(); if(!r.ok) throw new Error(d.error);
      if(d.meal_name==='Recipe not found') throw new Error('Could not find a recipe on that page. Try copying the ingredients and using the Describe mode instead.');
      currentThumbFile=null;
    } else {
      if(!imageBase64) throw new Error('Please upload a photo first');
      const notes = document.getElementById('photo-notes')?.value.trim() || '';
      const fd=new FormData(); fd.append('image',b64Blob(imageBase64,imageMime),'meal.jpg');
      if (notes) fd.append('notes', notes);
      const r=await fetch('/api/analyze',{method:'POST',body:fd});
      d=await r.json(); if(!r.ok) throw new Error(d.error);
      currentThumbFile=d._thumbFile||null;
    }
    currentNutrition=d; renderLogResult(d);
  } catch(e){ showErr('log-err',e.message); }
  btn.disabled=false; btn.innerHTML='Analyze nutrition';
}
async function reanalyze() {
  const btn=document.getElementById('reanalyze-btn');
  btn.disabled=true; btn.innerHTML='<div class="spin"></div>';
  const ings=getIngs(); const t=ings.map(i=>`- ${i.name}: ${i.qty}${i.notes?' ('+i.notes+')':''}`).join('\n');
  try {
    const payload={
      imageMime,
      thumbFile: currentThumbFile || null,
      ingredients: t,
      mealName: currentNutrition?.meal_name || ''
    };
    // only include base64 if we actually have it (photo mode) and no thumbFile
    if (!currentThumbFile && imageBase64) payload.imageBase64 = imageBase64;
    const r=await fetch('/api/reanalyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const d=await r.json(); if(!r.ok) throw new Error(d.error);
    currentNutrition=d; renderLogResult(d);
  } catch(e){ showErr('log-err',e.message); }
  btn.disabled=false; btn.innerHTML='Recalculate';
}
function renderLogResult(d) {
  document.getElementById('r-meal-name').textContent=d.meal_name;
  document.getElementById('r-meal-desc').textContent=d.description;
  document.getElementById('r-cal').textContent=Math.round(d.calories);
  document.getElementById('r-prot').textContent=r1(d.protein_g)+'g';
  document.getElementById('r-carb').textContent=r1(d.carbs_g)+'g';
  document.getElementById('r-fat').textContent=r1(d.fat_g)+'g';
  renderIngs(d.ingredients||[]);
  const mins=[['Sodium',d.sodium_mg,'mg','#378ADD',2300],['Potassium',d.potassium_mg,'mg','#1D9E75',3500],
    ['Calcium',d.calcium_mg,'mg','#534AB7',1000],['Iron',d.iron_mg,'mg','#0891b2',18],
    ['Magnesium',d.magnesium_mg,'mg','#639922',400],['Phosphorus',d.phosphorus_mg,'mg','#0891b2',700],['Zinc',d.zinc_mg,'mg','#D4537E',11]];
  document.getElementById('r-minerals').innerHTML=mins.map(([n,v,u,c,mx])=>{
    const p=Math.min(100,Math.round((v/mx)*100));
    return `<div class="bar-row"><div class="bar-name">${n}</div><div class="bar-track"><div class="bar-fill" style="width:${p}%;background:${c}"></div></div><div class="bar-pct">${p}%</div><div class="bar-amt">${r1(v)}${u}</div></div>`;
  }).join('');
  const vits=[['A',d.vitamin_a_mcg,'mcg'],['C',d.vitamin_c_mg,'mg'],['D',d.vitamin_d_mcg,'mcg'],['E',d.vitamin_e_mg,'mg'],
    ['K1',d.vitamin_k1_mcg,'mcg'],['K2',d.vitamin_k2_mcg,'mcg'],['B1',d.vitamin_b1_mg,'mg'],['B2',d.vitamin_b2_mg,'mg'],['B3',d.vitamin_b3_mg,'mg'],
    ['B6',d.vitamin_b6_mg,'mg'],['B12',d.vitamin_b12_mcg,'mcg'],['Folate',d.folate_mcg,'mcg']];
  document.getElementById('r-vitamins').innerHTML=vits.map(([n,v,u])=>`<div class="pill"><span class="pill-name">Vit. ${n}</span><span class="pill-val">${r2(v)}${u}</span></div>`).join('');
  document.getElementById('r-other').innerHTML=`<div class="pill"><span class="pill-name">Fiber</span><span class="pill-val">${r1(d.fiber_g)}g</span></div><div class="pill"><span class="pill-name">Sugar</span><span class="pill-val">${r1(d.sugar_g)}g</span></div><div class="pill"><span class="pill-name">Omega-3</span><span class="pill-val">${Math.round(d.omega3_mg||0)}mg</span></div><div class="pill"><span class="pill-name">Copper</span><span class="pill-val">${r2(d.copper_mg||0)}mg</span></div><div class="pill"><span class="pill-name">Selenium</span><span class="pill-val">${Math.round(d.selenium_mcg||0)}mcg</span></div><div class="pill"><span class="pill-name">Manganese</span><span class="pill-val">${r2(d.manganese_mg||0)}mg</span></div><div class="pill"><span class="pill-name">B5</span><span class="pill-val">${r2(d.vitamin_b5_mg||0)}mg</span></div>`;
  document.getElementById('log-results').style.display='block';
  document.getElementById('log-date').value = localDateStr();
  resetLogServing();
  document.getElementById('save-btn').textContent="Save to log";
  document.getElementById('save-btn').disabled=false;
  document.getElementById('save-lib-btn').textContent='+ Save to library';
  document.getElementById('save-lib-btn').disabled=false;
}
function renderIngs(ings) {
  const list=document.getElementById('ing-list'); list.innerHTML='';
  ings.forEach(i=>list.appendChild(makeIngRow(i.name,i.quantity,i.notes||'')));
}
function makeIngRow(name,qty,notes) {
  const row=document.createElement('div'); row.className='ing-row';
  row.innerHTML=`<input type="text" value="${esc(name)}" placeholder="Ingredient" class="in"><input type="text" value="${esc(qty)}" placeholder="Qty" class="iq"><input type="text" value="${esc(notes)}" placeholder="Notes" class="iw nc"><button class="del-btn" onclick="this.closest('.ing-row').remove()">×</button>`;
  return row;
}
function addIng() {
  const list=document.getElementById('ing-list');
  list.appendChild(makeIngRow('','','')); list.lastElementChild.querySelector('.in').focus();
}
function getIngs() {
  return Array.from(document.querySelectorAll('.ing-row')).map(r=>({
    name:r.querySelector('.in').value.trim(), qty:r.querySelector('.iq').value.trim(),
    notes:r.querySelector('.iw')?r.querySelector('.iw').value.trim():''
  })).filter(i=>i.name);
}
function setLogServing(val, btn) {
  logServingSize = val;
  document.querySelectorAll('.log-srv').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  document.getElementById('log-srv-custom').value = '';
  updateLogSrvPreview();
}
function setLogServingCustom(val) {
  const n = parseFloat(val);
  if (!isNaN(n) && n > 0) {
    logServingSize = n;
    document.querySelectorAll('.log-srv').forEach(b => b.classList.remove('sel'));
  }
  updateLogSrvPreview();
}
function updateLogSrvPreview() {
  const el = document.getElementById('log-srv-preview');
  if (!el || !currentNutrition) return;
  if (logServingSize === 1) { el.textContent = ''; return; }
  const kcal = Math.round((currentNutrition.calories||0) * logServingSize);
  const prot = r1((currentNutrition.protein_g||0) * logServingSize);
  el.textContent = `→ ${kcal} kcal · ${prot}g protein at ${logServingSize}× serving`;
}
function resetLogServing() {
  logServingSize = 1;
  document.querySelectorAll('.log-srv').forEach(b => b.classList.toggle('sel', b.dataset.srv === '1'));
  const custom = document.getElementById('log-srv-custom');
  if (custom) custom.value = '';
  const preview = document.getElementById('log-srv-preview');
  if (preview) preview.textContent = '';
}

async function saveMeal() {
  if(!currentNutrition) return;
  const btn=document.getElementById('save-btn');
  btn.disabled=true; btn.innerHTML='<div class="spin"></div> Saving…';
  const today = document.getElementById('log-date').value || localDateStr();
  const srv = logServingSize || 1;
  try {
    // scale nutrition if not 1×
    let nutrition = currentNutrition;
    if (srv !== 1) {
      nutrition = { ...currentNutrition };
      Object.keys(nutrition).forEach(k => {
        if (typeof nutrition[k] === 'number' && k !== 'servingSize') {
          nutrition[k] = Math.round(nutrition[k] * srv * 10) / 10;
        }
      });
      nutrition.meal_name = currentNutrition.meal_name;
      nutrition.description = (currentNutrition.description || '') + ` (${srv}× serving)`;
      nutrition.ingredients = currentNutrition.ingredients;
    }
    const r=await fetch('/api/meals',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({nutrition,mealType:selMealType,thumbFile:currentThumbFile,date:today,servingSize:srv})});
    const d=await r.json(); if(!r.ok) throw new Error(d.error);
    btn.innerHTML='✓ Saved!';
    toast('Meal saved to ' + today + (srv!==1?' ('+srv+'× serving)':''));
    setTimeout(()=>{ btn.textContent="Save to log"; btn.disabled=false; },2000);
    // show library nudge only if this meal isn't already in library
    const mealName = currentNutrition?.meal_name;
    const alreadyInLib = libraryMeals?.some(m => m.name === mealName);
    if (!alreadyInLib) showNudge();

  } catch(e){ showErr('log-err',e.message); btn.disabled=false; btn.textContent="Save to log"; }
}
function showNudge() {
  const el = document.getElementById('save-lib-nudge');
  if (el) el.style.display = 'flex';
}
function dismissNudge() {
  const el = document.getElementById('save-lib-nudge');
  if (el) el.style.display = 'none';
}
async function nudgeSaveToLibrary() {
  dismissNudge();
  await saveToLibrary();
}
async function saveToLibrary() {
  if(!currentNutrition) return;
  const btn=document.getElementById('save-lib-btn');
  btn.disabled=true; btn.innerHTML='<div class="spin"></div>';
  try {
    const r=await fetch('/api/library',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({nutrition:currentNutrition,thumbFile:currentThumbFile,defaultMealType:selMealType})});
    const d=await r.json(); if(!r.ok) throw new Error(d.error);
    btn.innerHTML=d.duplicate?'Already in library':'✓ Saved to library!';
    toast(d.duplicate?'Already in library':'Saved to meal library');
    setTimeout(()=>{ btn.textContent='+ Save to library'; btn.disabled=false; },2000);
  } catch(e){ showErr('log-err',e.message); btn.disabled=false; btn.textContent='+ Save to library'; }
}
function resetLog() {
  imageBase64=null; imageMime=null; currentNutrition=null;
  document.getElementById('preview-img').src='';
  document.getElementById('preview-wrap').style.display='none';
  document.getElementById('upload-prompt').style.display='block';
  document.getElementById('photo-augment').style.display='none';
  document.getElementById('photo-notes').value='';
  document.getElementById('analyze-btn').style.display='none';
  document.getElementById('log-results').style.display='none';
  document.getElementById('log-err').style.display='none';
  document.getElementById('file-input').value='';
  document.getElementById('meal-description').value='';
  document.getElementById('recipe-url').value='';
  document.getElementById('url-notes').value='';
  currentThumbFile=null;
  dismissNudge();
  resetLogServing();
  // reset to photo mode and scroll to top of card
  setInputMode('photo');
  window.scrollTo({top:0, behavior:'smooth'});
}

// ═══════════════════════════════════════════════════════════════════════════
// LIBRARY
// ═══════════════════════════════════════════════════════════════════════════
let currentDetailId = null, currentDetailType = 'snack';
let libraryMeals = [];

function renderLibraryGrid(meals) {
  const el = document.getElementById('lib-content');
  if (!meals.length) {
    el.innerHTML = libraryMeals.length
      ? '<div class="empty"><div class="ei">🔍</div><p style="font-weight:500;color:var(--text)">No meals match your search</p></div>'
      : '<div class="empty"><div class="ei">📚</div><p style="font-weight:500;color:var(--text)">No saved meals yet</p><p style="font-size:13px;margin-top:4px">Analyze a meal and click &quot;+ Save to library&quot;</p></div>';
    return;
  }
  el.innerHTML=`<div class="lib-grid">${meals.map(m=>`
    <div class="lib-card" id="lc-${m.id}" onclick="showDetail('${m.id}')">
      ${m.thumbFile
        ? `<img class="lib-card-img" src="/thumbs/${m.thumbFile}" onerror="this.outerHTML='<div class=\'lib-card-ph\'>🍽️</div>'">`
        : `<div class="lib-card-ph">🍽️</div>`}
      <div class="lib-card-body">
        <div class="lib-card-name" title="${esc(m.name)}">${esc(m.name)}</div>
        <div class="lib-card-meta">${Math.round(m.nutrition.calories)} kcal &middot; ${r1(m.nutrition.protein_g)}g protein</div>
        <div class="lib-card-actions">
          <button class="btn btn-primary btn-sm" style="flex:1" onclick="event.stopPropagation();openLibModal('${m.id}','${m.defaultMealType||'snack'}')">Log</button>
          <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();deleteLib('${m.id}')">✕</button>
        </div>
      </div>
    </div>`).join('')}</div>`;
}

function filterLibrary(query) {
  const q = query.trim().toLowerCase();
  if (!q) { renderLibraryGrid(libraryMeals); return; }
  const filtered = libraryMeals.filter(m => {
    if (m.name.toLowerCase().includes(q)) return true;
    const ings = (m.nutrition?.ingredients || []).map(i => i.name.toLowerCase()).join(' ');
    return ings.includes(q);
  });
  renderLibraryGrid(filtered);
}

async function loadLibrary() {
  const r=await fetch('/api/library');
  libraryMeals=await r.json();
  closeDetail();
  // clear search on reload
  const searchEl = document.getElementById('lib-search');
  if (searchEl) searchEl.value = '';
  renderLibraryGrid(libraryMeals);
}

async function saveLibName(newName) {
  const name = newName.trim();
  if (!name || name === _origLibName || !currentDetailId) return;
  const meal = libraryMeals?.find(m => m.id === currentDetailId);
  if (!meal) return;
  const r = await fetch('/api/library/' + currentDetailId + '/nutrition', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nutrition: { ...meal.nutrition, meal_name: name }, name })
  });
  if (!r.ok) {
    document.getElementById('lib-det-name').value = _origLibName; // revert on error
    return;
  }
  // update local cache
  meal.name = name;
  meal.nutrition.meal_name = name;
  _origLibName = name;
  // update the library card title live
  const card = document.getElementById('lc-' + currentDetailId);
  if (card) card.querySelector('.lib-card-name').textContent = name;
  toast('Name updated');
}

function showDetail(id) {
  const m = libraryMeals.find(x=>x.id===id);
  if (!m) return;
  currentDetailId = id;
  currentDetailType = m.defaultMealType || 'snack';

  // highlight selected card
  document.querySelectorAll('.lib-card').forEach(c=>c.style.borderColor='');
  const card = document.getElementById('lc-'+id);
  if (card) card.style.borderColor = 'var(--green)';

  // fill detail panel
  document.getElementById('lib-det-name').value = m.name;
  _origLibName = m.name;
  document.getElementById('lib-det-desc').textContent = m.nutrition.description || '';
  const img = document.getElementById('lib-det-img');
  if (m.thumbFile) {
    img.src='/thumbs/'+m.thumbFile;
    img.style.display='block';
    img.onerror = function() { this.style.display='none'; };
  } else { img.style.display='none'; }

  document.getElementById('ld-cal').textContent = Math.round(m.nutrition.calories);
  document.getElementById('ld-prot').textContent = r1(m.nutrition.protein_g)+'g';
  document.getElementById('ld-carb').textContent = r1(m.nutrition.carbs_g)+'g';
  document.getElementById('ld-fat').textContent = r1(m.nutrition.fat_g)+'g';

  const mins=[['Sodium',m.nutrition.sodium_mg,'mg','#378ADD',2300],['Potassium',m.nutrition.potassium_mg,'mg','#1D9E75',3500],
    ['Calcium',m.nutrition.calcium_mg,'mg','#534AB7',1000],['Iron',m.nutrition.iron_mg,'mg','#0891b2',18],
    ['Magnesium',m.nutrition.magnesium_mg,'mg','#639922',400],['Phosphorus',m.nutrition.phosphorus_mg,'mg','#0891b2',700],
    ['Zinc',m.nutrition.zinc_mg,'mg','#D4537E',11]];
  document.getElementById('ld-minerals').innerHTML=mins.map(([n,v,u,c,mx])=>{
    const p=Math.min(100,Math.round(((v||0)/mx)*100));
    return `<div class="bar-row"><div class="bar-name">${n}</div><div class="bar-track"><div class="bar-fill" style="width:${p}%;background:${c}"></div></div><div class="bar-pct">${p}%</div><div class="bar-amt">${r1(v||0)}${u}</div></div>`;
  }).join('');

  const vits=[['A',m.nutrition.vitamin_a_mcg,'mcg'],['C',m.nutrition.vitamin_c_mg,'mg'],['D',m.nutrition.vitamin_d_mcg,'mcg'],
    ['E',m.nutrition.vitamin_e_mg,'mg'],['K1',m.nutrition.vitamin_k1_mcg,'mcg'],['K2',m.nutrition.vitamin_k2_mcg,'mcg'],['B1',m.nutrition.vitamin_b1_mg,'mg'],
    ['B2',m.nutrition.vitamin_b2_mg,'mg'],['B3',m.nutrition.vitamin_b3_mg,'mg'],['B6',m.nutrition.vitamin_b6_mg,'mg'],
    ['B12',m.nutrition.vitamin_b12_mcg,'mcg'],['Folate',m.nutrition.folate_mcg,'mcg']];
  document.getElementById('ld-vitamins').innerHTML=vits.map(([n,v,u])=>`<div class="pill"><span class="pill-name">Vit. ${n}</span><span class="pill-val">${r2(v||0)}${u}</span></div>`).join('');
  document.getElementById('ld-other').innerHTML=`<div class="pill"><span class="pill-name">Fiber</span><span class="pill-val">${r1(m.nutrition.fiber_g||0)}g</span></div><div class="pill"><span class="pill-name">Sugar</span><span class="pill-val">${r1(m.nutrition.sugar_g||0)}g</span></div><div class="pill"><span class="pill-name">Omega-3</span><span class="pill-val">${Math.round(m.nutrition.omega3_mg||0)}mg</span></div><div class="pill"><span class="pill-name">Copper</span><span class="pill-val">${r2(m.nutrition.copper_mg||0)}mg</span></div><div class="pill"><span class="pill-name">Selenium</span><span class="pill-val">${Math.round(m.nutrition.selenium_mcg||0)}mcg</span></div><div class="pill"><span class="pill-name">Manganese</span><span class="pill-val">${r2(m.nutrition.manganese_mg||0)}mg</span></div><div class="pill"><span class="pill-name">B5</span><span class="pill-val">${r2(m.nutrition.vitamin_b5_mg||0)}mg</span></div>`;

  const ings = m.nutrition.ingredients || [];
  document.getElementById('ld-ingredients').innerHTML = ings.length
    ? ings.map(i=>`<div>• ${esc(i.name)} — ${esc(i.quantity)}${i.notes?' ('+esc(i.notes)+')':''}</div>`).join('')
    : '<span style="color:var(--t3)">No ingredient data</span>';

  document.getElementById('lib-detail-card').style.display='block';
  setTimeout(()=>document.getElementById('lib-detail-card').scrollIntoView({behavior:'smooth',block:'start'}),50);
}

function closeDetail() {
  document.getElementById('lib-detail-card').style.display='none';
  document.querySelectorAll('.lib-card').forEach(c=>c.style.borderColor='');
  currentDetailId=null;
}

let currentServingSize = 1;

function setServing(val, btn) {
  currentServingSize = val;
  document.querySelectorAll('.srv-preset').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  document.getElementById('srv-custom').value = '';
  updateSrvPreview();
}

function setServingCustom(val) {
  const n = parseFloat(val);
  if (!isNaN(n) && n > 0) {
    currentServingSize = n;
    document.querySelectorAll('.srv-preset').forEach(b => b.classList.remove('sel'));
  }
  updateSrvPreview();
}

function updateSrvPreview() {
  const el = document.getElementById('srv-preview');
  if (!el) return;
  const meal = libraryMeals?.find(m => m.id === pendingLibId);
  if (!meal || currentServingSize === 1) { el.textContent = ''; return; }
  const kcal = Math.round((meal.nutrition.calories || 0) * currentServingSize);
  const prot = r1((meal.nutrition.protein_g || 0) * currentServingSize);
  el.textContent = `→ ${kcal} kcal · ${prot}g protein at ${currentServingSize}× serving`;
}

function openLibModal(id, defaultType) {
  pendingLibId=id; pendingLibDefaultType=defaultType||'snack';
  document.getElementById('modal-date').value=localDateStr();
  document.querySelectorAll('#modal-mtypes .mtype').forEach(b=>{
    b.classList.toggle('sel', b.dataset.type===(defaultType||'snack'));
  });
  // reset serving size to 1×
  currentServingSize = 1;
  document.querySelectorAll('.srv-preset').forEach(b => b.classList.toggle('sel', b.dataset.srv==='1'));
  const custom = document.getElementById('srv-custom');
  if (custom) custom.value = '';
  const preview = document.getElementById('srv-preview');
  if (preview) preview.textContent = '';
  document.getElementById('lib-modal').classList.add('open');
}
function closeModal(){ document.getElementById('lib-modal').classList.remove('open'); }
function selModalType(el){
  document.querySelectorAll('#modal-mtypes .mtype').forEach(b=>b.classList.remove('sel'));
  el.classList.add('sel');
}
async function confirmLogFromLib() {
  const mealType=document.querySelector('#modal-mtypes .mtype.sel')?.dataset.type||'snack';
  const date=document.getElementById('modal-date').value||localDateStr();
  const srv = currentServingSize || 1;
  const r=await fetch(`/api/library/${pendingLibId}/log`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mealType,date,servingSize:srv})});
  const d=await r.json(); if(!r.ok){ alert('Error: '+d.error); return; }
  closeModal();
  toast('Meal logged'+(srv!==1?' ('+srv+'× serving)':'')+'!');
  if(document.querySelector('.nav-tab.active')?.dataset.page==='today') loadToday();
}
async function deleteLib(id) {
  if(!confirm('Remove from library?')) return;
  await fetch('/api/library/'+id,{method:'DELETE'});
  loadLibrary();
}
// ── Library edit & recalculate ────────────────────────────────────────────────
function openLibEdit() {
  const meal = libraryMeals?.find(m => m.id === currentDetailId);
  if (!meal) return;
  // build editable ingredient rows from stored ingredients
  const ings = meal.nutrition.ingredients || [];
  const el = document.getElementById('lib-edit-ing-table');
  el.innerHTML = `
    <div class="ing-header col-h" style="display:grid;grid-template-columns:1fr 100px 1fr auto;gap:6px;padding:4px 0;font-size:11px;font-weight:600;text-transform:uppercase;color:var(--t2);letter-spacing:.05em">
      <div>Ingredient</div><div>Quantity</div><div class="nc">Notes</div><div></div>
    </div>` +
    ings.map((ing, i) => `
    <div class="ing-row" id="lib-ing-${i}" style="display:grid;grid-template-columns:1fr 100px 1fr auto;gap:6px;margin-bottom:4px">
      <input type="text" value="${esc(ing.name||'')}" placeholder="Ingredient" style="font-size:13px;padding:.3rem .5rem;border:1px solid var(--border);border-radius:var(--rs);background:var(--surface);color:var(--text)">
      <input type="text" value="${esc(ing.quantity||'')}" placeholder="Qty" style="font-size:13px;padding:.3rem .5rem;border:1px solid var(--border);border-radius:var(--rs);background:var(--surface);color:var(--text)">
      <input type="text" value="${esc(ing.notes||'')}" placeholder="Notes" class="nc" style="font-size:13px;padding:.3rem .5rem;border:1px solid var(--border);border-radius:var(--rs);background:var(--surface);color:var(--text)">
      <button onclick="this.closest('[id^=lib-ing]').remove()" style="background:none;border:none;color:var(--t2);cursor:pointer;font-size:16px;padding:0 4px">×</button>
    </div>`).join('');
  document.getElementById('lib-edit-section').style.display = 'block';
  document.getElementById('lib-edit-err').style.display = 'none';
}

function closeLibEdit() {
  document.getElementById('lib-edit-section').style.display = 'none';
}

function addLibIngRow() {
  const el = document.getElementById('lib-edit-ing-table');
  const i = Date.now();
  const row = document.createElement('div');
  row.className = 'ing-row';
  row.id = 'lib-ing-' + i;
  row.style.cssText = 'display:grid;grid-template-columns:1fr 100px 1fr auto;gap:6px;margin-bottom:4px';
  row.innerHTML = `
    <input type="text" placeholder="Ingredient" style="font-size:13px;padding:.3rem .5rem;border:1px solid var(--border);border-radius:var(--rs);background:var(--surface);color:var(--text)">
    <input type="text" placeholder="Qty" style="font-size:13px;padding:.3rem .5rem;border:1px solid var(--border);border-radius:var(--rs);background:var(--surface);color:var(--text)">
    <input type="text" placeholder="Notes" class="nc" style="font-size:13px;padding:.3rem .5rem;border:1px solid var(--border);border-radius:var(--rs);background:var(--surface);color:var(--text)">
    <button onclick="this.closest('[id^=lib-ing]').remove()" style="background:none;border:none;color:var(--t2);cursor:pointer;font-size:16px;padding:0 4px">×</button>`;
  el.appendChild(row);
}

async function recalcLibMeal() {
  if (!currentDetailId) return;
  const btn = document.getElementById('lib-recalc-btn');
  const errEl = document.getElementById('lib-edit-err');
  errEl.style.display = 'none';
  btn.disabled = true; btn.innerHTML = '<div class="spin"></div>';

  // collect ingredients from edit rows
  const rows = document.querySelectorAll('[id^="lib-ing-"]');
  const ings = [];
  rows.forEach(row => {
    const inputs = row.querySelectorAll('input');
    const name = inputs[0]?.value.trim();
    const qty  = inputs[1]?.value.trim();
    const notes = inputs[2]?.value.trim();
    if (name) ings.push({ name, quantity: qty || '', notes: notes || '' });
  });
  if (!ings.length) {
    errEl.textContent = 'Please add at least one ingredient';
    errEl.style.display = 'block';
    btn.disabled = false; btn.innerHTML = 'Recalculate';
    return;
  }

  const meal = libraryMeals?.find(m => m.id === currentDetailId);
  const ingText = ings.map(i => `- ${i.name}: ${i.quantity}${i.notes?' ('+i.notes+')':''}`).join('\n');
  const description = (meal?.nutrition?.meal_name || '') +
    '. Recalculate nutrition using EXACTLY these corrected ingredients per serving:\n' + ingText;

  try {
    // reanalyze via text (no image needed for library edit)
    const r = await fetch('/api/analyze-text', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ description })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);

    // preserve meal name and updated ingredients
    d.meal_name = meal?.nutrition?.meal_name || d.meal_name;
    d.ingredients = ings;

    // save back to library
    const saveRes = await fetch('/api/library/' + currentDetailId + '/nutrition', {
      method: 'PUT', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ nutrition: d })
    });
    if (!saveRes.ok) throw new Error('Failed to save');

    // update local cache and re-render detail panel
    if (meal) meal.nutrition = d;
    showDetail(currentDetailId);
    closeLibEdit();
    toast('Library entry updated');
  } catch(e) {
    errEl.textContent = 'Error: ' + e.message;
    errEl.style.display = 'block';
  }
  btn.disabled = false; btn.innerHTML = 'Recalculate';
}


async function duplicateLibMeal() {
  if (!currentDetailId) return;
  const r = await fetch('/api/library/' + currentDetailId + '/duplicate', { method: 'POST' });
  const d = await r.json();
  if (!r.ok) { alert('Error: ' + d.error); return; }
  toast('Duplicate created — opening for editing');
  await loadLibrary();
  // open the new copy and immediately enter edit mode
  showDetail(d.meal.id);
  setTimeout(() => openLibEdit(), 150); // small delay for DOM to render
}

async function deleteLibAndClose() {
  if(!currentDetailId) return;
  if(!confirm('Remove this meal from the library?')) return;
  await fetch('/api/library/'+currentDetailId,{method:'DELETE'});
  closeDetail();
  loadLibrary();
}

async function uploadLibPhoto(file) {
  if (!file || !currentDetailId) return;
  const btn = document.getElementById('lib-photo-btn');
  btn.textContent = 'Uploading…';
  btn.disabled = true;

  const fd = new FormData();
  fd.append('image', file);

  try {
    const r = await fetch('/api/library/'+currentDetailId+'/photo', { method:'POST', body: fd });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);

    // update the detail panel image immediately
    const img = document.getElementById('lib-det-img');
    img.src = '/thumbs/' + d.thumbFile + '?t=' + Date.now();
    img.style.display = 'block';
    img.onerror = function() { this.style.display='none'; };

    // update the library card thumbnail too
    const card = document.getElementById('lc-'+currentDetailId);
    if (card) {
      const cardImg = card.querySelector('.lib-card-img');
      if (cardImg) {
        cardImg.src = '/thumbs/' + d.thumbFile + '?t=' + Date.now();
      } else {
        const ph = card.querySelector('.lib-card-ph');
        if (ph) ph.outerHTML = `<img class="lib-card-img" src="/thumbs/${d.thumbFile}?t=${Date.now()}" onerror="this.outerHTML='<div class=\'lib-card-ph\'>🍽️</div>'">`;
      }
    }

    // update local libraryMeals cache
    const cached = libraryMeals.find(m => m.id === currentDetailId);
    if (cached) cached.thumbFile = d.thumbFile;

    toast('Photo saved');
    btn.textContent = '✓ Photo updated';
    setTimeout(() => { btn.innerHTML = '📷 Change photo'; btn.disabled = false; }, 2000);
  } catch(e) {
    showErr('log-err', e.message);
    btn.innerHTML = '📷 Add photo';
    btn.disabled = false;
  }
  document.getElementById('lib-photo-input').value = '';
}

// ═══════════════════════════════════════════════════════════════════════════
// TODAY
// ═══════════════════════════════════════════════════════════════════════════
function setTodayDate(){
  document.getElementById('today-date').value=localDateStr();
  loadToday();
}
async function loadToday(){
  const date=document.getElementById('today-date').value; if(!date) return;
  // reset drill-down state when date changes
  _todayMeals = [];
  _todaySuppLog = null;
  _openDrillKey = null;
  const [summaryRes, suppTotalsRes, suppLogRes] = await Promise.all([
    fetch('/api/summary/'+date),
    fetch('/api/supplog/'+date+'/totals'),
    fetch('/api/supplog/'+date)
  ]);
  const s = await summaryRes.json();
  suppTotals = await suppTotalsRes.json();
  const suppLog = await suppLogRes.json();
  if(!s && !suppLog.length){
    document.getElementById('today-empty').style.display='block';
    document.getElementById('today-content').style.display='none';
  } else {
    document.getElementById('today-empty').style.display='none';
    document.getElementById('today-content').style.display='block';
    if(s) renderToday(s);
    restoreCollapseStates();
  }
  renderSuppsToday(suppLog, date);
}
function renderToday(s){
  // food macros
  const foodCal  = Math.round(s.calories);
  const foodProt = parseFloat(s.protein_g)||0;
  const foodCarb = parseFloat(s.carbs_g)||0;
  const foodFat  = parseFloat(s.fat_g)||0;

  // supplement macros (from suppTotals)
  const suppCal  = Math.round(suppTotals.calories||0);
  const suppProt = parseFloat(suppTotals.protein_g||0);
  const suppCarb = parseFloat(suppTotals.carbs_g||0);
  const suppFat  = parseFloat(suppTotals.fat_g||0);
  const suppFiber= parseFloat(suppTotals.fiber_g||0);

  document.getElementById('t-cal').textContent = foodCal;
  document.getElementById('t-prot').textContent = r1(foodProt)+'g';
  document.getElementById('t-carb').textContent = r1(foodCarb)+'g';
  document.getElementById('t-fat').textContent  = r1(foodFat)+'g';
  document.getElementById('today-meal-count').textContent=s.mealCount+' meal'+(s.mealCount!==1?'s':'');

  // supplement sub-lines (only show when supps contribute)
  const showSuppLine = (el, val, unit) => {
    el.textContent = val > 0 ? '+'+val+unit+' supps' : '';
  };
  showSuppLine(document.getElementById('t-cal-supp'),  suppCal,  '');
  showSuppLine(document.getElementById('t-prot-supp'), r1(suppProt), 'g');
  showSuppLine(document.getElementById('t-carb-supp'), r1(suppCarb), 'g');
  showSuppLine(document.getElementById('t-fat-supp'),  r1(suppFat),  'g');

  // fiber from supplements
  const fiberEl = document.getElementById('t-supp-fiber');
  if (suppFiber > 0) {
    fiberEl.textContent = '+'+r1(suppFiber)+'g fiber from supplements';
    fiberEl.style.display = 'block';
  } else { fiberEl.style.display = 'none'; }

  // macros donut — combine food + supplements
  const totalProt = foodProt + suppProt;
  const totalCarb = foodCarb + suppCarb;
  const totalFat  = foodFat  + suppFat;
  dChart('macros-chart'); charts['macros-chart']=new Chart(document.getElementById('macros-chart'),{
    type:'doughnut',
    data:{labels:['Protein','Carbs','Fat'],datasets:[{data:[Math.round(totalProt*4),Math.round(totalCarb*4),Math.round(totalFat*9)],backgroundColor:['#378ADD','#1D9E75','#534AB7'],borderWidth:2,borderColor:'#fff'}]},
    options:{plugins:{legend:{position:'bottom',labels:{boxWidth:12,font:{size:12}}}},cutout:'65%',responsive:true,maintainAspectRatio:true}
  });

  // RDV custom HTML bar chart (supports click drill-down)
  const T=settings.targets||DEFAULT_TARGETS;
  const rdvKeys=['calories','protein_g','carbs_g','fat_g','fiber_g','sodium_mg','potassium_mg','calcium_mg','iron_mg','vitamin_a_mcg','vitamin_c_mg','vitamin_d_mcg'];
  const maxPct=150;
  document.getElementById('rdv-bars').innerHTML=
    rdvKeys.map(k=>{
      const foodVal=parseFloat(s[k])||0;
      const suppVal=parseFloat(suppTotals&&suppTotals[k])||0;
      const val=foodVal+suppVal;
      const target=parseFloat(T[k])||parseFloat(DEFAULT_TARGETS[k])||1;
      const pct=Math.min(maxPct,Math.round((val/target)*100));
      const barW=Math.min(100,(pct/maxPct)*100);
      const col=pct>110?'#D85A30':pct>=70?'#1D9E75':'#378ADD';
      const targetPos=Math.round((100/maxPct)*100);
      return `<div class="rdv-row" id="rdvrow-${k}" onclick="toggleRdvDrill('${k}')">
        <div class="rdv-row-inner">
          <div class="rdv-label">${LABELS[k]}</div>
          <div class="rdv-track">
            <div class="rdv-bar" style="width:${barW}%;background:${col}"></div>
            <div class="rdv-target-line" style="left:${targetPos}%"></div>
          </div>
          <div class="rdv-pct" style="color:${col}">${pct}%</div>
        </div>
        <div class="rdv-drill" id="rdvdrill-${k}">
          <div class="drill-panel" id="rdvpanel-${k}"></div>
        </div>
      </div>`;
    }).join('')+
    `<div class="rdv-axis"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span style="font-weight:600;color:var(--text)">100%</span><span>125%</span><span>150%</span></div>`;

  // supplement gap table
  const P=settings.priorityNutrients||['protein_g','calcium_mg','vitamin_d_mcg'];
  const T2=settings.targets||DEFAULT_TARGETS;
  // store today's meals for drill-down
  _todayMeals = s.meals || [];
  _todaySuppLog = null; // will be fetched on demand

  // build rows with balance values for sorting
  const gapRows = P
    .filter(k => LABELS[k] !== undefined)
    .map(k => {
      const eaten   = parseFloat(s[k])||0;
      const target  = parseFloat(T2[k])||parseFloat(DEFAULT_TARGETS[k])||1;
      const suppAmt = parseFloat((suppTotals&&suppTotals[k])||0);
      const total   = eaten + suppAmt;
      const gap     = r2(target - total);           // negative = over
      const overage = r2(total - target);
      const totalPct = Math.min(150, Math.round((total/target)*100));
      const foodPct  = Math.min(100, Math.round((eaten/target)*100));
      const ul = UPPER_LIMITS[k];
      // Magnesium UL applies to supplemental form only (food mag doesn't count toward toxicity)
      // For all other nutrients, UL applies to total intake (food + supplements)
      const ulCheckAmt = k === 'magnesium_mg' ? suppAmt : total;
      const overUL     = ul !== null && ulCheckAmt > ul;
      const overTarget = total > target;
      const ulNote     = overUL ? ` ⚠ ${k === 'magnesium_mg' ? 'supp ' : ''}UL ${ul}${UNITS[k]}` : '';
      const balanceCls = overUL ? 'gap-high'
                       : overTarget ? 'gap-ok'
                       : totalPct >= 90 ? 'gap-ok'
                       : 'gap-low';
      const barCol = overUL ? '#D85A30' : totalPct >= 90 ? '#1D9E75' : totalPct >= 50 ? '#0891b2' : '#378ADD';
      // Balance text: show UL warning regardless of whether personal target is met
      const balanceText = overUL && !overTarget
        ? r2(Math.abs(gap)) + ' ' + UNITS[k] + ulNote        // under target but over UL
        : overTarget
          ? 'Over by ' + overage + ' ' + UNITS[k] + ulNote   // over target (with UL note if applicable)
          : gap > 0 ? r2(Math.abs(gap)) + ' ' + UNITS[k]
          : '✓ Met';
      return { k, eaten, suppAmt: r2(suppAmt), total, gap: parseFloat(gap), overage: parseFloat(overage),
               totalPct, foodPct, barCol, balanceCls, balanceText };
    });

  // sort by balance column
  if (_gapSortDir === 'asc') {
    gapRows.sort((a,b) => a.gap - b.gap);   // most needed first (biggest gap)
  } else if (_gapSortDir === 'desc') {
    gapRows.sort((a,b) => b.gap - a.gap);   // most over first (most negative gap)
  }

  document.getElementById('gap-tbody').innerHTML = gapRows.map(({k, eaten, suppAmt, foodPct, barCol, balanceCls, balanceText, totalPct}) => {
    const target = parseFloat(T2[k])||parseFloat(DEFAULT_TARGETS[k])||1;
    return `<tr class="gap-row-clickable" data-key="${k}" onclick="toggleDrillDown(this,'${k}')">
      <td><strong>${LABELS[k]}</strong> <span style="font-size:10px;color:var(--t2)">▸</span></td>
      <td><div class="gap-bar-wrap"><div class="gap-bar-fill" style="width:${foodPct}%;background:#378ADD"></div></div> ${r2(eaten)} ${UNITS[k]}</td>
      <td style="color:${parseFloat(suppAmt)>0?'var(--green)':'var(--t3)'}">${parseFloat(suppAmt)>0?'+'+suppAmt+' '+UNITS[k]:'—'}</td>
      <td>${r2(target)} ${UNITS[k]}</td>
      <td class="${balanceCls}">${balanceText}</td>
    </tr>
    <tr class="gap-row-drill" id="drill-${k}" style="display:none">
      <td colspan="5"><div class="drill-panel" id="drill-panel-${k}"></div></td>
    </tr>`;
  }).join('');

  // meals list
  const order=['breakfast','lunch','dinner','snack'];
  const sorted=(s.meals||[]).slice().sort((a,b)=>order.indexOf(a.mealType)-order.indexOf(b.mealType));
  document.getElementById('meals-list').innerHTML=sorted.map(m=>`
    <div class="meal-item">
      ${m.thumbFile?`<img class="thumb" src="/thumbs/${m.thumbFile}" onerror="this.outerHTML='<div class=\'thumb-ph\'>🍽️</div>'">`:`<div class="thumb-ph">🍽️</div>`}
      <div class="meal-info">
        <div class="meal-nm"><span class="badge b-${m.mealType}">${m.mealType}</span>${esc(m.nutrition.meal_name)}</div>
        <div class="meal-mt">${esc(m.nutrition.description)}${m.fromLibrary?' · from library':''}</div>
      </div>
      <div class="meal-kcal">${Math.round(m.nutrition.calories)}</div>
      <button class="btn btn-danger btn-sm" onclick="deleteMeal('${m.id}')">✕</button>
    </div>`).join('');
}
async function deleteMeal(id){
  if(!confirm('Remove this meal?')) return;
  await fetch('/api/meals/'+id,{method:'DELETE'}); loadToday();
}

// ═══════════════════════════════════════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════════════════════════════════════
async function loadHistory(){
  buildFocusUI();
  const r=await fetch('/api/dates'); const dates=await r.json();
  if(!dates.length){
    document.getElementById('hist-list').innerHTML='<div class="empty"><div class="ei">📅</div><p>No meals logged yet</p></div>';
    return;
  }
  document.getElementById('hist-list').innerHTML=dates.map(d=>`
    <div class="meal-item" style="cursor:pointer" onclick="document.getElementById('today-date').value='${d}';go('today')">
      <div style="flex:1"><strong style="font-size:13px">${fmtDate(d)}</strong></div>
      <span style="font-size:12px;color:var(--t2)">View →</span>
    </div>`).join('');

  // fetch last 30 days of data (food + supplements) for both charts
  const allDates = dates.slice(0, 30).reverse();
  const [summaries, suppTotalsHist] = await Promise.all([
    Promise.all(allDates.map(d => fetch('/api/summary/'+d).then(r => r.json()))),
    Promise.all(allDates.map(d => fetch('/api/supplog/'+d+'/totals').then(r => r.json())))
  ]);
  const combined = summaries.map((s, i) => {
    if (!s) return null;
    const st = suppTotalsHist[i] || {};
    const m = { ...s };
    Object.keys(st).forEach(k => { m[k] = Math.round(((parseFloat(s[k])||0) + (parseFloat(st[k])||0)) * 10) / 10; });
    return m;
  });

  const T = settings.targets || DEFAULT_TARGETS;
  const cols = ['#534AB7','#1D9E75','#D85A30','#378ADD','#0891b2','#D4537E','#639922','#E4A019'];

  // ── Daily chart: % of target (last 10 days) ────────────────────────────────
  const last10idx = Math.max(0, allDates.length - 10);
  const dailyDates = allDates.slice(last10idx);
  const dailyData  = combined.slice(last10idx);

  dChart('focus-chart');
  charts['focus-chart'] = new Chart(document.getElementById('focus-chart'), {
    type: 'line',
    data: {
      labels: dailyDates.map(fmtShort),
      datasets: [
        // 100% target reference line
        { label: '100% target', data: dailyDates.map(() => 100),
          borderColor: 'rgba(0,0,0,.15)', borderDash: [6,4], borderWidth: 1.5,
          pointRadius: 0, fill: false, order: 99 },
        ...focusNutrients.map((k, i) => {
          const target = parseFloat(T[k]) || parseFloat(DEFAULT_TARGETS[k]) || 1;
          return {
            label: LABELS[k],
            data: dailyData.map(s => s ? Math.round(((s[k]||0) / target) * 100) : null),
            borderColor: cols[i % cols.length],
            backgroundColor: cols[i % cols.length] + '22',
            tension: .3, pointRadius: 4, borderWidth: 2, fill: false, spanGaps: true
          };
        })
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 12 },
          filter: item => item.text !== '100% target' } },
        tooltip: { callbacks: { label: ctx => {
          if (ctx.dataset.label === '100% target') return null;
          return ` ${ctx.dataset.label}: ${ctx.raw}% of target`;
        }}}
      },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,.05)' },
             ticks: { callback: v => v + '%' } },
        x: { grid: { display: false } }
      }
    }
  });

  // ── 7-day rolling average chart: % of target ───────────────────────────────
  // compute rolling averages over all fetched days
  function rollingAvg(data, key, window) {
    const target = parseFloat(T[key]) || parseFloat(DEFAULT_TARGETS[key]) || 1;
    return data.map((_, idx) => {
      const start = Math.max(0, idx - window + 1);
      const slice = data.slice(start, idx + 1).filter(s => s !== null);
      if (!slice.length) return null;
      const avg = slice.reduce((sum, s) => sum + ((s[key]||0) / target) * 100, 0) / slice.length;
      return Math.round(avg);
    });
  }

  dChart('rolling-chart');
  charts['rolling-chart'] = new Chart(document.getElementById('rolling-chart'), {
    type: 'line',
    data: {
      labels: allDates.map(fmtShort),
      datasets: [
        { label: '100% target', data: allDates.map(() => 100),
          borderColor: 'rgba(0,0,0,.15)', borderDash: [6,4], borderWidth: 1.5,
          pointRadius: 0, fill: false, order: 99 },
        ...focusNutrients.map((k, i) => ({
          label: LABELS[k],
          data: rollingAvg(combined, k, 7),
          borderColor: cols[i % cols.length],
          backgroundColor: cols[i % cols.length] + '22',
          tension: .4, pointRadius: 3, borderWidth: 2.5, fill: false, spanGaps: true
        }))
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 12 },
          filter: item => item.text !== '100% target' } },
        tooltip: { callbacks: { label: ctx => {
          if (ctx.dataset.label === '100% target') return null;
          return ` ${ctx.dataset.label}: ${ctx.raw}% avg`;
        }}}
      },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,.05)' },
             ticks: { callback: v => v + '%' } },
        x: { grid: { display: false } }
      }
    }
  });
}
function buildFocusUI(){
  document.getElementById('focus-wrap').innerHTML=Object.keys(LABELS).map(k=>
    `<div class="focus-btn${focusNutrients.includes(k)?' on':''}" data-key="${k}" onclick="toggleFocus(this)">${LABELS[k]}</div>`
  ).join('');
}
function toggleFocus(el){
  const k=el.dataset.key;
  if(focusNutrients.includes(k)){ if(focusNutrients.length<=1) return; focusNutrients=focusNutrients.filter(x=>x!==k); el.classList.remove('on'); }
  else { focusNutrients.push(k); el.classList.add('on'); }
  loadHistory();
}
async function runCompare(){
  const d1=document.getElementById('cmp1').value, d2=document.getElementById('cmp2').value;
  if(!d1||!d2){ showErr('cmp-err','Please select both dates'); return; }
  if(d1===d2){ showErr('cmp-err','Please select two different dates'); return; }
  document.getElementById('cmp-err').style.display='none';
  const [cmpData, st1, st2] = await Promise.all([
    fetch(`/api/compare?date1=${d1}&date2=${d2}`).then(r=>r.json()),
    fetch('/api/supplog/'+d1+'/totals').then(r=>r.json()),
    fetch('/api/supplog/'+d2+'/totals').then(r=>r.json())
  ]);
  if(!cmpData.date1.summary&&!cmpData.date2.summary){ showErr('cmp-err','No meals found for either date'); return; }
  // merge supplement totals into summaries
  const mergeSuppTotals = (summary, st) => {
    if (!summary) return null;
    const m = {...summary};
    Object.keys(st).forEach(k => { m[k] = Math.round(((parseFloat(summary[k])||0)+(parseFloat(st[k])||0))*10)/10; });
    return m;
  };
  cmpData.date1.summary = mergeSuppTotals(cmpData.date1.summary, st1);
  cmpData.date2.summary = mergeSuppTotals(cmpData.date2.summary, st2);
  renderCompare(cmpData);
}
function renderCompare(data){
  const {date1,date2}=data; const s1=date1.summary, s2=date2.summary;
  const keys=['calories','protein_g','carbs_g','fat_g','fiber_g','sodium_mg','calcium_mg','iron_mg','vitamin_c_mg','vitamin_d_mcg'];
  const T=settings.targets||DEFAULT_TARGETS;
  dChart('cmp-chart');
  charts['cmp-chart']=new Chart(document.getElementById('cmp-chart'),{
    type:'bar',
    data:{
      labels:keys.map(k=>LABELS[k]),
      datasets:[
        {label:fmtShort(date1.date),data:keys.map(k=>s1?Math.round(((s1[k]||0)/(T[k]||1))*100):0),backgroundColor:'#534AB788',borderColor:'#534AB7',borderWidth:1,borderRadius:3},
        {label:fmtShort(date2.date),data:keys.map(k=>s2?Math.round(((s2[k]||0)/(T[k]||1))*100):0),backgroundColor:'#1D9E7588',borderColor:'#1D9E75',borderWidth:1,borderRadius:3}
      ]
    },
    options:{responsive:true,maintainAspectRatio:true,
      plugins:{legend:{position:'bottom',labels:{boxWidth:12,font:{size:12}}},tooltip:{callbacks:{label:ctx=>` ${ctx.raw}% of target`}}},
      scales:{y:{ticks:{callback:v=>v+'%'},grid:{color:'rgba(0,0,0,.05)'}},x:{grid:{display:false},ticks:{font:{size:11}}}}}
  });
  const dkeys=['calories','protein_g','carbs_g','fat_g','fiber_g','sodium_mg','potassium_mg','calcium_mg','iron_mg','vitamin_c_mg','vitamin_d_mcg','magnesium_mg'];
  document.getElementById('cmp-detail').innerHTML=`
    <div>
      <h4>${fmtDate(date1.date)} · ${date1.mealCount} meal${date1.mealCount!==1?'s':''}</h4>
      ${s1?dkeys.map(k=>`<div class="bar-row"><div class="bar-name">${LABELS[k]}</div><div style="font-size:12px;font-weight:500">${r2(s1[k]||0)} ${UNITS[k]}</div></div>`).join(''):'<p style="font-size:13px;color:var(--t2)">No data</p>'}
    </div>
    <div>
      <h4>${fmtDate(date2.date)} · ${date2.mealCount} meal${date2.mealCount!==1?'s':''}</h4>
      ${s2?dkeys.map(k=>{const diff=s1?r2((s2[k]||0)-(s1[k]||0)):null;const cls=diff===null?'':diff>0?'diff-p':'diff-n';const ds=diff===null?'':` <span class="${cls}">(${diff>0?'+':''}${diff})</span>`;return`<div class="bar-row"><div class="bar-name">${LABELS[k]}</div><div style="font-size:12px;font-weight:500">${r2(s2[k]||0)} ${UNITS[k]}${ds}</div></div>`}).join(''):'<p style="font-size:13px;color:var(--t2)">No data</p>'}
    </div>`;
  document.getElementById('cmp-results').style.display='block';
}

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════════════
// ── Timezone settings ─────────────────────────────────────────────────────────
function buildTzSelect() {
  const sel = document.getElementById('tz-select');
  if (!sel) return;
  const current = getTzOffset();
  // Build options from UTC-12 to UTC+14 in 30-min increments
  const options = [];
  for (let off = -720; off <= 840; off += 30) {
    const h = Math.floor(Math.abs(off) / 60);
    const m = Math.abs(off) % 60;
    const sign = off >= 0 ? '+' : '-';
    const label = 'UTC' + sign + String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
    options.push(`<option value="${off}"${off===current?' selected':''}>${label}</option>`);
  }
  sel.innerHTML = options.join('');
  previewTz();
}

function previewTz() {
  const sel = document.getElementById('tz-select');
  const preview = document.getElementById('tz-preview');
  if (!sel || !preview) return;
  const off = parseInt(sel.value);
  // show what "today" would be at this offset
  const local = new Date(Date.now() + (off + new Date().getTimezoneOffset()) * 60000);
  const y = local.getFullYear();
  const m = String(local.getMonth()+1).padStart(2,'0');
  const d = String(local.getDate()).padStart(2,'0');
  const h = String(local.getHours()).padStart(2,'0');
  const min = String(local.getMinutes()).padStart(2,'0');
  preview.textContent = '→ Today = ' + y+'-'+m+'-'+d + '  ' + h+':'+min + ' local time';
}

function saveTz() {
  const sel = document.getElementById('tz-select');
  if (!sel) return;
  localStorage.setItem('tzOffset', sel.value);
  previewTz();
  toast('Timezone saved — Today date updated');
  setTodayDate(); // refresh the Today tab date
}

function resetTz() {
  localStorage.removeItem('tzOffset');
  buildTzSelect();
  toast('Using browser timezone');
  setTodayDate();
}

function buildSettingsUI(){
  loadSuppLibrary();
  buildTzSelect();
  // Priority nutrients
  document.getElementById('prio-grid').innerHTML=Object.keys(LABELS).map(k=>
    `<div class="prio-btn${(settings.priorityNutrients||[]).includes(k)?' on':''}" data-key="${k}" onclick="this.classList.toggle('on')">${LABELS[k]}</div>`
  ).join('');

  // Targets
  const T=settings.targets||DEFAULT_TARGETS;
  document.getElementById('targets-grid').innerHTML=Object.keys(DEFAULT_TARGETS).map(k=>`
    <div class="setting-row">
      <label>${LABELS[k]} (${UNITS[k]})</label>
      <input type="number" id="t-${k}" value="${T[k]||DEFAULT_TARGETS[k]}" min="0" step="0.1">
    </div>`).join('');
}
async function savePriority(){
  const selected=Array.from(document.querySelectorAll('.prio-btn.on')).map(el=>el.dataset.key);
  if(!selected.length){ alert('Select at least one nutrient'); return; }
  await fetch('/api/settings/priority',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({priorityNutrients:selected})});
  settings.priorityNutrients=selected;
  focusNutrients=selected.slice(0,6);
  toast('Priority nutrients saved');
}
async function saveTargets(){
  const targets={};
  Object.keys(DEFAULT_TARGETS).forEach(k=>{
    const v=parseFloat(document.getElementById('t-'+k)?.value);
    targets[k]=isNaN(v)?DEFAULT_TARGETS[k]:v;
  });
  await fetch('/api/settings/targets',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({targets})});
  settings.targets=targets;
  toast('Personal targets saved');
}
function resetTargets(){
  Object.keys(DEFAULT_TARGETS).forEach(k=>{ const el=document.getElementById('t-'+k); if(el) el.value=DEFAULT_TARGETS[k]; });
  toast('Targets reset to defaults (not saved yet — click Save to apply)');
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════════════
function b64Blob(b64,mime){ const b=atob(b64),a=new Uint8Array(b.length); for(let i=0;i<b.length;i++) a[i]=b.charCodeAt(i); return new Blob([a],{type:mime}); }
function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function r1(v){ return Math.round((parseFloat(v)||0)*10)/10; }
function r2(v){ return Math.round((parseFloat(v)||0)*100)/100; }
function showErr(id,msg){ const el=document.getElementById(id); el.textContent='Error: '+msg; el.style.display='block'; }
function dChart(id){ if(charts[id]){ charts[id].destroy(); delete charts[id]; } }
function fmtDate(d){ return new Date(d+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}); }
function fmtShort(d){ return new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}); }
function toast(msg){ const el=document.getElementById('toast'); el.textContent=msg; el.style.display='block'; setTimeout(()=>el.style.display='none',2500); }


// ═══════════════════════════════════════════════════════════════════════════
// SUPPLEMENTS
// ═══════════════════════════════════════════════════════════════════════════

// Key nutrients to show in supplement forms (most relevant for supplements)
const SUPP_NUTR_KEYS = [
  'vitamin_d_mcg','vitamin_c_mg','vitamin_b12_mcg','vitamin_b6_mg','vitamin_k1_mcg','vitamin_k2_mcg',
  'vitamin_a_mcg','vitamin_e_mg','vitamin_b1_mg','vitamin_b2_mg','vitamin_b3_mg','vitamin_b5_mg',
  'folate_mcg','omega3_mg','copper_mg','selenium_mcg','manganese_mg',
  'calcium_mg','magnesium_mg','zinc_mg','iron_mg',
  'potassium_mg','sodium_mg','phosphorus_mg',
  'protein_g','carbs_g','fiber_g','sugar_g','fat_g','calories'
];

// Build the nutrient input grid for add/edit forms
function buildNutrGrid(containerId, existingNutrients={}) {
  document.getElementById(containerId).innerHTML = SUPP_NUTR_KEYS.map(k =>
    `<div class="nutr-row">
      <label>${LABELS[k]} (${UNITS[k]})</label>
      <input type="number" id="sn-${containerId}-${k}" value="${existingNutrients[k]||0}" min="0" step="0.01">
    </div>`
  ).join('');
}

function getNutrFromGrid(containerId) {
  const nutrients = {};
  SUPP_NUTR_KEYS.forEach(k => {
    const v = parseFloat(document.getElementById('sn-'+containerId+'-'+k)?.value);
    if (!isNaN(v) && v > 0) nutrients[k] = v;
  });
  return nutrients;
}

function openAddSuppForm(mode) {
  document.getElementById('add-supp-manual').classList.remove('open');
  document.getElementById('add-supp-photo').classList.remove('open');
  if (mode === 'manual') {
    buildNutrGrid('add-supp-nutr-grid');
    document.getElementById('supp-name-input').value = '';
    document.getElementById('add-supp-manual').classList.add('open');
    setTimeout(() => document.getElementById('supp-name-input').focus(), 50);
  } else {
    document.getElementById('add-supp-photo').classList.add('open');
  }
}

function closeAddSuppForm() {
  document.getElementById('add-supp-manual').classList.remove('open');
  document.getElementById('add-supp-photo').classList.remove('open');
}

async function saveNewSupp() {
  const name = document.getElementById('supp-name-input').value.trim();
  const errEl = document.getElementById('supp-err');
  errEl.style.display = 'none';
  if (!name) { errEl.textContent = 'Please enter a supplement name'; errEl.style.display = 'block'; return; }
  const nutrients = getNutrFromGrid('add-supp-nutr-grid');
  const r = await fetch('/api/supplements', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ name, nutrients })
  });
  const d = await r.json();
  if (!r.ok) { errEl.textContent = d.error; errEl.style.display = 'block'; return; }
  closeAddSuppForm();
  toast('Supplement saved');
  loadSuppLibrary();
}

async function analyzeSuppLabel(file) {
  if (!file) return;
  const btn = document.getElementById('scan-label-btn');
  const errEl = document.getElementById('supp-scan-err');
  errEl.style.display = 'none';
  btn.textContent = 'Analyzing label…'; btn.disabled = true;
  const fd = new FormData(); fd.append('image', file);
  try {
    const r = await fetch('/api/supplements/analyze-label', { method:'POST', body: fd });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    // pre-fill manual form with scanned data
    document.getElementById('add-supp-photo').classList.remove('open');
    document.getElementById('supp-name-input').value = d.name || '';
    buildNutrGrid('add-supp-nutr-grid', d.nutrients || {});
    document.getElementById('add-supp-manual').classList.add('open');
    toast('Label scanned — review and save');
  } catch(e) { errEl.textContent = 'Error: '+e.message; errEl.style.display='block'; }
  btn.textContent = 'Choose photo'; btn.disabled = false;
  document.getElementById('supp-label-input').value = '';
}

async function loadSuppLibrary() {
  if (!currentProfileId) return;
  const r = await fetch('/api/supplements');
  const supps = await r.json();
  const el = document.getElementById('supp-library-list');
  if (!el) return;
  if (!supps.length) {
    el.innerHTML = '<p style="font-size:13px;color:var(--t2);padding:.5rem 0">No supplements saved yet. Add your first one below.</p>';
    return;
  }
  el.innerHTML = supps.map(s => {
    const nutrientSummary = Object.entries(s.nutrients||{})
      .filter(([k,v])=>v>0)
      .map(([k,v])=>`${LABELS[k]}: ${v}${UNITS[k]}`)
      .slice(0,4).join(' · ');
    return `<div class="supp-card" id="sc-${s.id}">
      <div class="supp-card-head" onclick="toggleSuppEdit('${s.id}')">
        <div>
          <div class="supp-name">${esc(s.name)}</div>
          <div class="supp-summary">${nutrientSummary || 'No nutrients set'}</div>
        </div>
        <div style="display:flex;gap:7px">
          <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();toggleSuppEdit('${s.id}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();deleteSupp('${s.id}')">✕</button>
        </div>
      </div>
      <div class="supp-edit-form" id="se-${s.id}">
        <p style="font-size:12px;font-weight:500;margin-bottom:.5rem">Edit: ${esc(s.name)}</p>
        <input type="text" id="se-name-${s.id}" value="${esc(s.name)}" style="width:100%;font-size:13px;padding:.4rem .6rem;border:1px solid var(--border);border-radius:var(--rs);background:var(--surface);color:var(--text);margin-bottom:.6rem">
        <div class="nutr-grid" id="se-grid-${s.id}"></div>
        <div style="display:flex;gap:7px;margin-top:.6rem">
          <button class="btn btn-primary btn-sm" onclick="saveEditSupp('${s.id}')">Save changes</button>
          <button class="btn btn-outline btn-sm" onclick="toggleSuppEdit('${s.id}')">Cancel</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function toggleSuppEdit(id) {
  const form = document.getElementById('se-'+id);
  if (!form) return;
  if (form.classList.contains('open')) { form.classList.remove('open'); return; }
  // build nutr grid with current values
  fetch('/api/supplements').then(r=>r.json()).then(supps => {
    const s = supps.find(x=>x.id===id); if (!s) return;
    buildNutrGrid('se-grid-'+id, s.nutrients||{});
    form.classList.add('open');
  });
}

async function saveEditSupp(id) {
  const name = document.getElementById('se-name-'+id)?.value.trim();
  const nutrients = getNutrFromGrid('se-grid-'+id);
  const r = await fetch('/api/supplements/'+id, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ name, nutrients })
  });
  if (!r.ok) { alert('Error saving'); return; }
  document.getElementById('se-'+id)?.classList.remove('open');
  toast('Supplement updated');
  loadSuppLibrary();
}

async function deleteSupp(id) {
  if (!confirm('Remove this supplement?')) return;
  await fetch('/api/supplements/'+id, {method:'DELETE'});
  toast('Supplement removed');
  loadSuppLibrary();
}

function toggleGapSort() {
  // cycle: default → asc (most needed) → desc (most over) → default
  _gapSortDir = _gapSortDir === 'default' ? 'asc'
              : _gapSortDir === 'asc'     ? 'desc'
              :                             'default';
  const icon = document.getElementById('gap-sort-icon');
  if (icon) icon.textContent = _gapSortDir === 'asc' ? '↑' : _gapSortDir === 'desc' ? '↓' : '⇅';
  // re-render — loadToday will re-fetch but we can just re-render from cached data
  const date = document.getElementById('today-date').value;
  if (date) loadToday();
}

// ── RDV bar chart drill-down ──────────────────────────────────────────────────
let _openRdvKey = null;

async function toggleRdvDrill(key) {
  const drill = document.getElementById('rdvdrill-' + key);
  const row   = document.getElementById('rdvrow-' + key);
  if (!drill || !row) return;

  const isOpen = drill.classList.contains('open');

  // close any other open drill
  if (_openRdvKey && _openRdvKey !== key) {
    document.getElementById('rdvdrill-' + _openRdvKey)?.classList.remove('open');
    document.getElementById('rdvrow-'   + _openRdvKey)?.classList.remove('open');
  }

  if (isOpen) {
    drill.classList.remove('open');
    row.classList.remove('open');
    _openRdvKey = null;
    return;
  }

  // fetch supp log for today if not cached
  if (!_todaySuppLog) {
    const date = document.getElementById('today-date').value;
    const r = await fetch('/api/supplog/' + date);
    _todaySuppLog = await r.json();
  }

  drill.classList.add('open');
  row.classList.add('open');
  _openRdvKey = key;

  // reuse the same buildDrillPanel logic, targeting the rdv panel element
  buildDrillPanelInto(key, document.getElementById('rdvpanel-' + key));
}

// ── Nutrient drill-down ───────────────────────────────────────────────────────
async function toggleDrillDown(row, key) {
  const drillRow = document.getElementById('drill-' + key);
  if (!drillRow) return;

  const isOpen = drillRow.style.display !== 'none';
  // close any other open drill-down
  if (_openDrillKey && _openDrillKey !== key) {
    const other = document.getElementById('drill-' + _openDrillKey);
    if (other) other.style.display = 'none';
    document.querySelector(`.gap-row-clickable[data-key="${_openDrillKey}"]`)?.classList.remove('open');
    const arrow = document.querySelector(`.gap-row-clickable[data-key="${_openDrillKey}"] span`);
    if (arrow) arrow.textContent = '▸';
  }

  if (isOpen) {
    drillRow.style.display = 'none';
    row.classList.remove('open');
    const arrow = row.querySelector('span');
    if (arrow) arrow.textContent = '▸';
    _openDrillKey = null;
    return;
  }

  // fetch supp log for today if not cached
  const date = document.getElementById('today-date').value;
  if (!_todaySuppLog) {
    const r = await fetch('/api/supplog/' + date);
    _todaySuppLog = await r.json();
  }

  drillRow.style.display = '';
  row.classList.add('open');
  const arrow = row.querySelector('span');
  if (arrow) arrow.textContent = '▾';
  _openDrillKey = key;

  buildDrillPanel(key, date);
}

function buildDrillPanel(key, date) {
  buildDrillPanelInto(key, document.getElementById('drill-panel-' + key));
}

function buildDrillPanelInto(key, panel) {
  if (!panel) return;

  const unit = UNITS[key] || '';
  const label = LABELS[key] || key;
  const meals = _todayMeals || [];
  const suppLog = _todaySuppLog || [];

  // calculate total for context
  const foodTotal = meals.reduce((sum, m) => sum + (parseFloat(m.nutrition?.[key]) || 0), 0);
  const suppTotal = suppLog.reduce((sum, e) => {
    const n = (e.supplement?.nutrients?.[key] || 0) * (e.doses || 1);
    return sum + n;
  }, 0);
  const grandTotal = foodTotal + suppTotal;

  // meal rows — sorted by contribution descending
  const mealRows = meals
    .map(m => ({ meal: m, amt: parseFloat(m.nutrition?.[key]) || 0 }))
    .filter(x => x.amt > 0)
    .sort((a, b) => b.amt - a.amt);

  // supplement rows
  const suppRows = suppLog
    .map(e => ({ name: e.supplement?.name || 'Unknown', amt: (e.supplement?.nutrients?.[key] || 0) * (e.doses || 1), doses: e.doses }))
    .filter(x => x.amt > 0);

  let html = `<div class="drill-header">${label} sources today</div>`;

  if (mealRows.length === 0 && suppRows.length === 0) {
    html += `<div class="drill-none">No ${label} logged today</div>`;
    panel.innerHTML = html;
    return;
  }

  // food sources
  if (mealRows.length > 0) {
    html += mealRows.map(({ meal, amt }) => {
      const pct = grandTotal > 0 ? Math.round((amt / grandTotal) * 100) : 0;
      const barW = grandTotal > 0 ? Math.round((amt / grandTotal) * 120) : 0;
      const mealName = meal.nutrition?.meal_name || 'Meal';
      const mtype = meal.mealType || '';
      // per-ingredient breakdown if available
      const ings = (meal.nutrition?.ingredients || [])
        .filter(ing => ing.nutrients && (parseFloat(ing.nutrients[key]) || 0) > 0)
        .sort((a, b) => (b.nutrients[key] || 0) - (a.nutrients[key] || 0));
      const ingHtml = ings.length > 0
        ? `<div style="margin:.3rem 0 .1rem 1rem;padding-left:.5rem;border-left:2px solid var(--border)">${
            ings.map(ing => {
              const iAmt = r2(ing.nutrients[key]);
              const iPct = amt > 0 ? Math.round((ing.nutrients[key] / amt) * 100) : 0;
              return `<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:11px;color:var(--t2)">
                <span>${esc(ing.name)} <span style="color:var(--t3)">${esc(ing.quantity||'')}</span></span>
                <span style="font-weight:500;color:var(--text);white-space:nowrap">${iAmt} ${unit}</span>
              </div>`;
            }).join('')
          }</div>`
        : '';
      return `<div class="drill-meal">
        <div style="flex:1">
          <div style="display:flex;align-items:baseline;gap:6px">
            <span class="drill-meal-type">${mtype}</span>
            <span class="drill-meal-name">${esc(mealName)}</span>
          </div>
          <div class="drill-meal-bar" style="width:${barW}px;max-width:100%"></div>
        </div>
        <div style="text-align:right;flex-shrink:0;padding-left:.75rem">
          <div class="drill-meal-amt">${r2(amt)} ${unit}</div>
          <div style="font-size:10px;color:var(--t2)">${pct}% of total</div>
        </div>
      </div>${ingHtml}`;
    }).join('');
  }

  // supplement sources
  if (suppRows.length > 0) {
    html += `<div style="margin-top:.4rem;padding-top:.4rem;border-top:1px solid var(--border)">`;
    html += suppRows.map(({ name, amt, doses }) => {
      const pct = grandTotal > 0 ? Math.round((amt / grandTotal) * 100) : 0;
      return `<div class="drill-supp">
        <span class="drill-supp-name">💊 ${esc(name)}${doses !== 1 ? ' ×' + doses : ''}</span>
        <span style="font-weight:600">${r2(amt)} ${unit} <span style="font-size:10px;font-weight:400">(${pct}%)</span></span>
      </div>`;
    }).join('');
    html += `</div>`;
  }

  // total line
  if (mealRows.length + suppRows.length > 1) {
    html += `<div style="margin-top:.4rem;padding-top:.4rem;border-top:1px solid var(--border);display:flex;justify-content:space-between;font-weight:600;font-size:12px">
      <span>Total</span><span>${r2(grandTotal)} ${unit}</span>
    </div>`;
  }

  panel.innerHTML = html;
}

// ── Supplements Today ─────────────────────────────────────────────────────────
async function renderSuppsToday(suppLog, date) {
  const el = document.getElementById('supps-today-list');
  if (!el) return;
  // get full supplement library
  const r = await fetch('/api/supplements');
  const allSupps = await r.json();
  if (!allSupps.length) {
    el.innerHTML = '<div style="padding:.75rem 1.1rem;font-size:13px;color:var(--t2)">No supplements in your library yet. <a href="#" onclick="go(&quot;settings&quot;);return false" style="color:var(--green)">Add supplements →</a></div>';
    return;
  }
  // build a map of what's already logged
  const logMap = {};
  suppLog.forEach(e => { logMap[e.supplementId] = e.doses || 1; });
  el.innerHTML = allSupps.map(s => {
    const taken = !!logMap[s.id];
    const doses = logMap[s.id] || 1;
    const nutrientHighlights = Object.entries(s.nutrients||{})
      .filter(([k,v])=>v>0).slice(0,3)
      .map(([k,v])=>`${LABELS[k]} ${v}${UNITS[k]}`).join(' · ');
    return `<div class="meal-item" id="st-${s.id}">
      <div style="flex:1">
        <div style="font-size:13px;font-weight:500">${esc(s.name)}</div>
        ${nutrientHighlights ? `<div style="font-size:11px;color:var(--t2);margin-top:2px">${nutrientHighlights}</div>` : ''}
      </div>
      <div class="supp-doses ${taken?'show':''}" id="sd-${s.id}">
        <span style="font-size:11px;color:var(--t2)">×</span>
        <input type="number" min="0.5" max="20" step="0.5" value="${doses}" style="width:48px;font-size:12px;padding:2px 5px;border:1px solid var(--border);border-radius:var(--rs);background:var(--surface);color:var(--text);text-align:center" onchange="updateDoses('${s.id}','${date}',this.value)">
        <span style="font-size:11px;color:var(--t2)">doses</span>
      </div>
      <button class="supp-toggle${taken?' on':''}" id="stog-${s.id}" onclick="toggleSupp('${s.id}','${date}',${taken})" title="${taken?'Mark not taken':'Mark taken'}"></button>
    </div>`;
  }).join('');
}

async function toggleSupp(suppId, date, currentlyTaken) {
  if (currentlyTaken) {
    await fetch('/api/supplog/'+suppId+'/'+date, {method:'DELETE'});
    document.getElementById('stog-'+suppId)?.classList.remove('on');
    document.getElementById('sd-'+suppId)?.classList.remove('show');
  } else {
    await fetch('/api/supplog', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({supplementId:suppId, date, doses:1})});
    document.getElementById('stog-'+suppId)?.classList.add('on');
    document.getElementById('sd-'+suppId)?.classList.add('show');
  }
  // refresh gap table with updated supp totals
  const r = await fetch('/api/supplog/'+date+'/totals');
  suppTotals = await r.json();
  loadToday();
}

async function updateDoses(suppId, date, doses) {
  const d = parseFloat(doses);
  if (isNaN(d) || d <= 0) return;
  await fetch('/api/supplog', {method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({supplementId:suppId, date, doses:d})});
  const r = await fetch('/api/supplog/'+date+'/totals');
  suppTotals = await r.json();
  loadToday();
}

// Wire up nav tabs
document.querySelectorAll('.nav-tab[data-page]').forEach(tab => {
  tab.addEventListener('click', () => go(tab.dataset.page));
});

// ── Profile screen ───────────────────────────────────────────────────────────
async function loadProfileScreen() {
  const res = await fetch('/api/profiles');
  const profiles = await res.json();
  const container = document.getElementById('profile-cards');
  const avatarColors = ['#534AB7','#1D9E75','#D85A30','#378ADD','#0891b2','#D4537E','#0891b2','#639922'];
  container.innerHTML = profiles.map((p, i) => `
    <div class="profile-card" onclick="selectProfile('${p.id}','${esc(p.name)}',${i})">
      <div class="prof-avatar-sm profile-avatar" style="background:${avatarColors[i % avatarColors.length]}">${p.avatar}</div>
      <div class="profile-name">${esc(p.name)}</div>
    </div>`).join('') +
    `<div class="profile-card add-profile-card" onclick="toggleAddForm(true)">
      <div class="profile-avatar" style="background:var(--s2);color:var(--t2);font-size:24px">+</div>
      <div class="profile-name" style="color:var(--t2)">Add profile</div>
    </div>`;
}

function toggleAddForm(show) {
  document.getElementById('add-profile-form').style.display = show ? 'block' : 'none';
  if (show) setTimeout(() => document.getElementById('new-profile-name').focus(), 50);
}

async function submitNewProfile() {
  const name = document.getElementById('new-profile-name').value.trim();
  const errEl = document.getElementById('profile-err');
  errEl.style.display = 'none';
  if (!name) { errEl.textContent = 'Please enter a name'; errEl.style.display = 'block'; return; }
  const res = await fetch('/api/profiles', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  const d = await res.json();
  if (!res.ok) { errEl.textContent = d.error; errEl.style.display = 'block'; return; }
  document.getElementById('new-profile-name').value = '';
  toggleAddForm(false);
  await loadProfileScreen();
  selectProfile(d.profile.id, d.profile.name, 0);
}

const avatarColors = ['#534AB7','#1D9E75','#D85A30','#378ADD','#0891b2','#D4537E','#0891b2','#639922'];

function selectProfile(id, name, idx) {
  currentProfileId = id;
  currentProfileName = name;
  localStorage.setItem('activeProfileId', id);
  localStorage.setItem('activeProfileName', name);
  // update nav
  const color = avatarColors[idx % avatarColors.length];
  document.getElementById('nav-avatar').textContent = name[0].toUpperCase();
  document.getElementById('nav-avatar').style.background = color;
  document.getElementById('nav-name').textContent = name;
  // hide profile screen
  document.getElementById('profile-screen').style.display = 'none';
  // reload current page data
  const activePage = document.querySelector('.nav-tab.active')?.dataset.page;
  if (activePage === 'today') loadToday();
  if (activePage === 'library') loadLibrary();
  if (activePage === 'history') loadHistory();
  if (activePage === 'settings') buildSettingsUI();
}

function showProfileScreen() {
  document.getElementById('profile-screen').style.display = 'flex';
  loadProfileScreen();
}

// ── Patched fetch that injects x-profile-id header ───────────────────────────
const _origFetch = window.fetch;
window.fetch = function(url, opts = {}) {
  if (typeof url === 'string' && url.startsWith('/api/') &&
      !url.startsWith('/api/profiles') && !url.startsWith('/api/analyze') &&
      currentProfileId) {
    opts.headers = { ...(opts.headers || {}), 'x-profile-id': currentProfileId };
  }
  return _origFetch(url, opts);
};

init();
