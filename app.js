/* ===================== Arbéliang — Moteur ===================== */

const LANGS = {
  svenska: { file: 'data/svenska.json', flag: '🇸🇪', name: 'Svenska', code: 'sv' },
  deutsch: { file: 'data/deutsch.json', flag: '🇩🇪', name: 'Deutsch', code: 'de' },
  gaeilge: { file: 'data/gaeilge.json', flag: '🇮🇪', name: 'Gaeilge', code: 'ga' },
};
const LEVELS = ['debutant', 'intermediaire', 'avance'];
const LEVEL_LABEL = { debutant: 'Débutant', intermediaire: 'Intermédiaire', avance: 'Avancé' };
const LESSON_TYPES = ['vocab', 'grammar', 'reading', 'review'];
const LESSON_LABEL = { vocab: 'Vocabulaire', grammar: 'Grammaire', reading: 'Compréhension', review: 'Reprise Globale' };
const LESSON_ICON = { vocab: '🌿', grammar: '🏛️', reading: '📖', review: '🔁' };
const MILESTONES = [5, 10, 25, 50, 100];

/* Lettres spéciales par langue */
const SPECIAL_CHARS = {
  svenska: ['å', 'ä', 'ö', 'Å', 'Ä', 'Ö'],
  deutsch: ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'],
  gaeilge: ['á', 'é', 'í', 'ó', 'ú', 'Á', 'É', 'Í', 'Ó', 'Ú']
};

/* ---------- Persisted state (localStorage sécurisé) ---------- */
const STORE_KEY = 'arbeliang_state_v1';
function loadState(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(raw) {
      const parsed = JSON.parse(raw);
      // Sécurisation et validation des types critiques
      if (typeof parsed.points !== 'number' || isNaN(parsed.points)) parsed.points = 0;
      if (typeof parsed.streak !== 'number' || isNaN(parsed.streak)) parsed.streak = 0;
      if (!parsed.progress) parsed.progress = {};
      if (!parsed.learnedWords) parsed.learnedWords = {};
      if (!parsed.mistakes) parsed.mistakes = {};
      if (!parsed.exerciseBank) parsed.exerciseBank = {};
      return parsed;
    }
  }catch(e){}
  return {
    points: 0,
    streak: 0,
    progress: {},       
    learnedWords: {},    
    mistakes: {},        
    exerciseBank: {}      
  };
}
let STATE = loadState();
function saveState(){
  try {
    if (typeof STATE.points !== 'number' || isNaN(STATE.points)) STATE.points = 0;
    localStorage.setItem(STORE_KEY, JSON.stringify(STATE));
  } catch(e) {
    console.error("Impossible de sauvegarder l'état dans le stockage local", e);
  }
}
function ensurePath(obj, ...keys){
  let cur = obj;
  for(const k of keys){
    if(!cur[k]) cur[k] = {};
    cur = cur[k];
  }
  return cur;
}

/* ---------- URL (GET params) ---------- */
function getParams(){
  const p = new URLSearchParams(location.search);
  return {
    lang: p.get('lang') || 'svenska',
    level: p.get('level') || 'debutant',
    chapter: p.get('chapter') || null,
    lesson: p.get('lesson') || null,
    view: p.get('view') || null 
  };
}
function setParams(next, push=true){
  const cur = getParams();
  const merged = { ...cur, ...next };
  const p = new URLSearchParams();
  p.set('lang', merged.lang);
  p.set('level', merged.level);
  if(merged.chapter) p.set('chapter', merged.chapter);
  if(merged.lesson) p.set('lesson', merged.lesson);
  if(merged.view) p.set('view', merged.view);
  const url = `${location.pathname}?${p.toString()}`;
  if(push) history.pushState({}, '', url);
  else history.replaceState({}, '', url);
}

/* ---------- Audio feedback ---------- */
let audioCtx = null;
function beep(freqs, dur=0.14, type='sine', gainVal=0.18){
  try{
    if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audioCtx.currentTime;
    freqs.forEach((f, i)=>{
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.value = f;
      gain.gain.setValueAtTime(gainVal, t0 + i*dur);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + i*dur + dur*0.95);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0 + i*dur);
      osc.stop(t0 + i*dur + dur);
    });
  }catch(e){}
}
function playCorrectSound(){ beep([523.25, 659.25, 783.99], 0.11, 'sine', 0.15); }
function playWrongSound(){ beep([220, 174.6], 0.16, 'sawtooth', 0.10); }
function playMilestoneSound(level){
  const map = {5:[659,784],10:[659,784,988],25:[523,659,784,988],50:[523,659,784,988,1318],100:[440,554,659,880,1108,1319]};
  beep(map[level] || [659,784], 0.13, 'triangle', 0.16);
}
function hapticStrong(){
  if(navigator.vibrate) navigator.vibrate([90, 40, 110]);
}
function hapticMilestone(level){
  if(!navigator.vibrate) return;
  const patterns = {5:[60],10:[70,30,70],25:[90,40,90,40,90],50:[100,40,100,40,100,40,130],100:[120,50,120,50,120,50,120,50,180]};
  navigator.vibrate(patterns[level] || [70]);
}

function showModal(msg, opts={}){
  const { confirmLabel='OK', cancelLabel=null } = opts;
  return new Promise(resolve=>{
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box pop">
        <p>${escapeHtml(msg)}</p>
        <div class="modal-actions">
          ${cancelLabel ? `<button class="btn-secondary" id="modalCancel">${escapeHtml(cancelLabel)}</button>` : ''}
          <button class="btn-primary" id="modalOk">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('modalOk').addEventListener('click', ()=>{ overlay.remove(); resolve(true); });
    const cancelBtn = document.getElementById('modalCancel');
    if(cancelBtn) cancelBtn.addEventListener('click', ()=>{ overlay.remove(); resolve(false); });
  });
}

/* ---------- Data loading ---------- */
const DATA_CACHE = {};
async function loadLangData(lang){
  if(DATA_CACHE[lang]) return DATA_CACHE[lang];
  const res = await fetch(LANGS[lang].file);
  const json = await res.json();
  DATA_CACHE[lang] = json;
  return json;
}

/* ---------- DOM refs ---------- */
const root = document.getElementById('root');
const flagBtn = document.getElementById('flagBtn');
const flagEmoji = document.getElementById('flagEmoji');
const flagName = document.getElementById('flagName');
const langDropdown = document.getElementById('langDropdown');
const levelBtn = document.getElementById('levelBtn');
const levelLabel = document.getElementById('levelLabel');
const levelDropdown = document.getElementById('levelDropdown');
const pointsVal = document.getElementById('pointsVal');
const hubBtn = document.getElementById('hubBtn');
const hubBadge = document.getElementById('hubBadge');
const brand = document.getElementById('brand');

/* ---------- Topbar rendering ---------- */
function renderTopbar(){
  const { lang, level } = getParams();
  const L = LANGS[lang];
  flagEmoji.textContent = L.flag;
  flagName.textContent = L.name;
  levelLabel.textContent = LEVEL_LABEL[level];
  pointsVal.textContent = STATE.points;

  langDropdown.innerHTML = '';
  Object.keys(LANGS).forEach(key=>{
    if(key === lang) return;
    const item = document.createElement('button');
    item.className = 'dropdown-item';
    item.innerHTML = `<span class="flag-emoji">${LANGS[key].flag}</span> ${LANGS[key].name}`;
    item.onclick = ()=>{
      langDropdown.classList.remove('open');
      setParams({ lang: key, level: 'debutant', chapter: null, lesson: null, view: null });
      route();
    };
    langDropdown.appendChild(item);
  });

  levelDropdown.innerHTML = '';
  LEVELS.forEach(lv=>{
    const item = document.createElement('button');
    item.className = 'dropdown-item' + (lv === level ? ' active' : '');
    item.textContent = LEVEL_LABEL[lv];
    item.onclick = ()=>{
      levelDropdown.classList.remove('open');
      setParams({ level: lv, chapter: null, lesson: null, view: null });
      route();
    };
    levelDropdown.appendChild(item);
  });

  updateHubBadge();
}

function updateHubBadge(){
  const { lang } = getParams();
  const count = getReviewCount(lang);
  if(count > 0){
    hubBadge.textContent = count;
    hubBadge.classList.remove('hidden');
  } else {
    hubBadge.classList.add('hidden');
  }
}

flagBtn.addEventListener('click', (e)=>{
  e.stopPropagation();
  langDropdown.classList.toggle('open');
  levelDropdown.classList.remove('open');
});
levelBtn.addEventListener('click', (e)=>{
  e.stopPropagation();
  levelDropdown.classList.toggle('open');
  langDropdown.classList.remove('open');
});
document.addEventListener('click', ()=>{
  langDropdown.classList.remove('open');
  levelDropdown.classList.remove('open');
});
brand.addEventListener('click', ()=>{
  setParams({ chapter: null, lesson: null, view: null });
  route();
});
hubBtn.addEventListener('click', ()=>{
  setParams({ view: 'hub', chapter: null, lesson: null });
  route();
});

/* ---------- Progress helpers ---------- */
function getProgress(lang, level){
  const langP = ensurePath(STATE.progress, lang);
  if(!langP[level]) langP[level] = { completedChapters: [], completedLessons: {} };
  return langP[level];
}
function isLessonDone(lang, level, chapterId, lessonType){
  const prog = getProgress(lang, level);
  return (prog.completedLessons[chapterId] || []).includes(lessonType);
}
function isChapterDone(lang, level, chapterId){
  const prog = getProgress(lang, level);
  return LESSON_TYPES.every(t => (prog.completedLessons[chapterId] || []).includes(t));
}
function markLessonDone(lang, level, chapterId, lessonType){
  const prog = getProgress(lang, level);
  if(!prog.completedLessons[chapterId]) prog.completedLessons[chapterId] = [];
  if(!prog.completedLessons[chapterId].includes(lessonType)){
    prog.completedLessons[chapterId].push(lessonType);
  }
  if(isChapterDone(lang, level, chapterId) && !prog.completedChapters.includes(chapterId)){
    prog.completedChapters.push(chapterId);
  }
  saveState();
}

function isChapterUnlocked(chapters, lang, level, idx){
  if(idx === 0) return true;
  return isChapterDone(lang, level, chapters[idx-1].chapterId);
}
function isLessonUnlocked(lang, level, chapters, chapterIdx, lessonIdx){
  if(!isChapterUnlocked(chapters, lang, level, chapterIdx)) return false;
  if(lessonIdx === 0) return true;
  const chapterId = chapters[chapterIdx].chapterId;
  return isLessonDone(lang, level, chapterId, LESSON_TYPES[lessonIdx-1]);
}

/* ---------- Vocabulary tracking ---------- */
function registerLearnedWord(lang, wordId){
  const bank = ensurePath(STATE.learnedWords, lang);
  if(!bank[wordId]) bank[wordId] = { anchored: false, correctStreak: 0 };
}
function reinforceWord(lang, wordId, correct){
  const bank = ensurePath(STATE.learnedWords, lang);
  if(!bank[wordId]) bank[wordId] = { anchored: false, correctStreak: 0 };
  if(correct){
    bank[wordId].correctStreak++;
    if(bank[wordId].correctStreak >= 2) bank[wordId].anchored = true;
  } else {
    bank[wordId].correctStreak = 0;
  }
  saveState();
}
function getUnanchoredWords(lang){
  const bank = STATE.learnedWords[lang] || {};
  return Object.keys(bank).filter(id => !bank[id].anchored);
}

/* ---------- Mistake tracking ---------- */
function registerMistake(lang, exercise){
  const bank = ensurePath(STATE.mistakes, lang);
  bank[exercise.id] = { fixed: false };
  ensurePath(STATE.exerciseBank, lang)[exercise.id] = exercise;
  saveState();
}
function fixMistake(lang, exerciseId){
  const bank = STATE.mistakes[lang];
  if(bank && bank[exerciseId]) bank[exerciseId].fixed = true;
  saveState();
}
function getOpenMistakes(lang){
  const bank = STATE.mistakes[lang] || {};
  return Object.keys(bank).filter(id => !bank[id].fixed);
}
function getReviewCount(lang){
  return getUnanchoredWords(lang).length + getOpenMistakes(lang).length;
}

/* ---------- Streak (global) ---------- */
function bumpStreak(correct){
  if(correct){
    STATE.streak++;
    saveState();
    if(MILESTONES.includes(STATE.streak)){
      showMilestone(STATE.streak);
    }
  } else {
    STATE.streak = 0;
    saveState();
  }
}
function showMilestone(n){
  const overlay = document.createElement('div');
  overlay.className = 'milestone-overlay';
  const span = document.createElement('span');
  span.className = `milestone-text m-${n}`;
  const labels = {5:'🔥 5 d\'affilée !', 10:'🔥 10 d\'affilée !', 25:'⚡ 25 d\'affilée !!', 50:'🌟 50 D\'AFFILÉE !!', 100:'👑 100 D\'AFFILÉE !!!'};
  span.textContent = labels[n];
  overlay.appendChild(span);
  document.body.appendChild(overlay);
  document.body.classList.add('flash-gold');
  playMilestoneSound(n);
  hapticMilestone(n);
  const dur = n>=100 ? 3000 : n>=25 ? 2200 : 1600;
  setTimeout(()=>{
    overlay.remove();
    document.body.classList.remove('flash-gold');
  }, dur);
}

/* ============================================================
   ROUTER
   ============================================================ */
async function route(){
  renderTopbar();
  const { lang, level, chapter, lesson, view } = getParams();

  if(view === 'hub'){
    renderHub();
    return;
  }
  if(chapter && lesson){
    await renderLessonRuntime(lang, level, chapter, lesson, false);
    return;
  }
  await renderPathView(lang, level);
}
window.addEventListener('popstate', route);

/* ============================================================
   PATH VIEW
   ============================================================ */
async function renderPathView(lang, level){
  root.innerHTML = `<div class="app"><p class="page-sub">Chargement…</p></div>`;
  const data = await loadLangData(lang);
  const chapters = data[level] || [];

  if(chapters.length === 0){
    root.innerHTML = `
      <div class="app">
        <div class="page-title">${LANGS[lang].name} — ${LEVEL_LABEL[level]}</div>
        <p class="page-sub">Ce niveau n'est pas encore disponible pour cette langue. Reviens bientôt !</p>
      </div>`;
    return;
  }

  let html = `
    <div class="app">
      <div class="page-title">${LANGS[lang].flag} ${LANGS[lang].name} — ${LEVEL_LABEL[level]}</div>
      <p class="page-sub">Progresse chapitre par chapitre. Chaque leçon débloque la suivante.</p>
      <div class="path">
  `;

  chapters.forEach((ch, ci)=>{
    const chUnlocked = isChapterUnlocked(chapters, lang, level, ci);
    html += `<div class="chapter-block ${chUnlocked ? '' : 'locked'}">
      <div class="chapter-title">${chUnlocked ? '' : '<span class="lock-icon">🔒</span>'} ${escapeHtml(ch.title)}</div>
      <div class="lesson-row">`;
    LESSON_TYPES.forEach((lt, li)=>{
      const unlocked = isLessonUnlocked(lang, level, chapters, ci, li);
      const done = isLessonDone(lang, level, ch.chapterId, lt);
      html += `
        <div class="lesson-node node-${lt} ${unlocked ? '' : 'node-locked'} ${done ? 'node-done' : ''}"
             data-chapter="${ch.chapterId}" data-lesson="${lt}" data-unlocked="${unlocked}">
          ${done ? '<span class="node-check">✓</span>' : ''}
          <span class="node-icon">${LESSON_ICON[lt]}</span>
          <span class="node-label">${LESSON_LABEL[lt]}</span>
        </div>`;
    });
    html += `</div></div>`;
  });

  html += `</div></div>`;
  root.innerHTML = html;

  root.querySelectorAll('.lesson-node').forEach(node=>{
    node.addEventListener('click', ()=>{
      if(node.dataset.unlocked !== 'true') return;
      setParams({ chapter: node.dataset.chapter, lesson: node.dataset.lesson, view: null });
      route();
    });
  });
}
function escapeHtml(s){
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/* ============================================================
   HUB VIEW
   ============================================================ */
function renderHub(){
  const { lang } = getParams();
  const unanchored = getUnanchoredWords(lang);
  const mistakes = getOpenMistakes(lang);

  root.innerHTML = `
    <div class="app">
      <div class="back-link" id="hubBack">← Retour au parcours</div>
      <div class="page-title">🧭 Hub de révisions</div>
      <p class="page-sub">Renforce ce qui n'est pas encore acquis. Chaque exercice réussi ici rapporte 3 points.</p>
      <div class="hub-grid">
        <div class="hub-card">
          <h3>🌱 Vocabulaire à ancrer</h3>
          <p>Mots appris récemment mais pas encore solidement mémorisés.</p>
          ${unanchored.length > 0 ? `<div class="hub-count">${unanchored.length} mot${unanchored.length>1?'s':''}</div>
          <button class="btn-primary" id="startVocabHub">Lancer la leçon</button>`
          : `<p class="hub-empty">Tout le vocabulaire appris est ancré. Bravo !</p>`}
        </div>
        <div class="hub-card">
          <h3>🛠️ Erreurs à corriger</h3>
          <p>Exercices ratés précédemment, à refaire jusqu'à réussite.</p>
          ${mistakes.length > 0 ? `<div class="hub-count">${mistakes.length} erreur${mistakes.length>1?'s':''}</div>
          <button class="btn-primary" id="startMistakesHub">Lancer la leçon</button>`
          : `<p class="hub-empty">Aucune erreur en attente. Impeccable !</p>`}
        </div>
      </div>
    </div>
  `;
  document.getElementById('hubBack').addEventListener('click', ()=>{
    setParams({ view: null, chapter: null, lesson: null });
    route();
  });
  const vBtn = document.getElementById('startVocabHub');
  if(vBtn) vBtn.addEventListener('click', ()=> runHubLesson(lang, 'vocabAnchor'));
  const mBtn = document.getElementById('startMistakesHub');
  if(mBtn) mBtn.addEventListener('click', ()=> runHubLesson(lang, 'mistakes'));
}

async function runHubLesson(lang, hubType){
  const data = await loadLangData(lang);
  let exercises = [];

  if(hubType === 'vocabAnchor'){
    const wordIds = getUnanchoredWords(lang);
    const allChapters = Object.values(data).flat();
    wordIds.forEach(wid=>{
      allChapters.forEach(ch=>{
        const vocabLessons = ch.lessons.vocab || [];
        const cardIdx = vocabLessons.findIndex(it => it.type === 'card' && it.id === wid);
        if(cardIdx !== -1){
          for(let i=cardIdx+1; i<vocabLessons.length; i++){
            if(vocabLessons[i].type === 'card') break;
            exercises.push({ ...vocabLessons[i], _wordId: wid });
          }
        }
      });
    });
  } else {
    const exIds = getOpenMistakes(lang);
    exIds.forEach(id=>{
      const ex = (STATE.exerciseBank[lang] || {})[id];
      if(ex) exercises.push({ ...ex, _mistakeId: id });
    });
  }

  if(exercises.length === 0){
    await showModal('Rien à réviser pour le moment !');
    return;
  }

  await renderLessonRuntime(lang, null, null, null, true, { hubType, exercises });
}

/* ============================================================
   LESSON RUNTIME
   ============================================================ */
let runtimeState = null;

async function renderLessonRuntime(lang, level, chapterId, lessonType, isHub, hubData){
  let exercises = [];
  let chapterTitle = '';

  if(isHub){
    exercises = hubData.exercises.map(e => ({ ...e }));
    chapterTitle = hubData.hubType === 'vocabAnchor' ? 'Vocabulaire à ancrer' : 'Erreurs à corriger';
  } else {
    const data = await loadLangData(lang);
    const chapters = data[level] || [];
    const ch = chapters.find(c => c.chapterId === chapterId);
    if(!ch){ root.innerHTML = `<div class="app"><p>Chapitre introuvable.</p></div>`; return; }
    chapterTitle = ch.title;
    exercises = (ch.lessons[lessonType] || []).map(e => ({ ...e }));
  }

  const isRedo = !isHub && isLessonDone(lang, level, chapterId, lessonType);
  const coreCount = exercises.filter(e => e.type !== 'card' && e.type !== 'gcard').length;

  runtimeState = {
    lang, level, chapterId, lessonType, isHub, hubType: isHub ? hubData.hubType : null,
    isRedo,
    queue: exercises,
    originalCount: coreCount || 1, 
    correctCount: 0,
    mainAnsweredCount: 0,     // Compte les exercices initiaux terminés (pour progression stricte)
    errorsReviewedCount: 0,   // X erreurs revues
    totalErrorsToReview: 0,   // Y erreurs totales à revoir en fin de session
    pointsEarned: 0,
    retryQueue: [],
    inRetryPhase: false,       // Passe à true quand on traite les erreurs uniques
    currentAnswered: false,
    lastCorrect: null
  };

  renderLessonShell(chapterTitle);
  renderNextExercise();
}

function renderLessonShell(title){
  root.innerHTML = `
    <div class="lesson-screen">
      <div class="progress-wrap">
        <button class="close-lesson" id="closeLesson">✕</button>
        <div class="streak-line" id="streakLine"></div>
        <div class="progress-bar-container">
          <div class="progress-bar-outer"><div class="progress-bar-inner" id="progBar"></div></div>
          <div class="error-review-counter hidden" id="errCounter">Erreurs revues : 0/0</div>
        </div>
      </div>
      <div id="exoZone"></div>
    </div>
  `;
  document.getElementById('closeLesson').addEventListener('click', async ()=>{
    const ok = await showModal('Quitter la leçon ? Ta progression sur cette leçon ne sera pas comptabilisée.', { confirmLabel: 'Quitter', cancelLabel: 'Annuler' });
    if(ok){
      setParams({ chapter: null, lesson: null, view: null });
      route();
    }
  });
  updateStreakLine();
}

function updateStreakLine(){
  const el = document.getElementById('streakLine');
  if(!el) return;
  if(STATE.streak > 0){
    el.innerHTML = `<span class="streak-fire">🔥</span> ${STATE.streak} bonnes réponses d'affilée`;
  } else {
    el.innerHTML = '';
  }
}

function updateProgressBar(){
  const rs = runtimeState;
  
  // Progression fixe basée exclusivement sur les questions initiales
  const pct = Math.min(100, Math.round((rs.mainAnsweredCount / rs.originalCount) * 100));
  document.getElementById('progBar').style.width = pct + '%';

  // Gestion de l'indicateur "X/Y erreurs revues"
  const errCounterEl = document.getElementById('errCounter');
  if(rs.inRetryPhase || rs.totalErrorsToReview > 0) {
    errCounterEl.classList.remove('hidden');
    errCounterEl.textContent = `Erreurs revues : ${rs.errorsReviewedCount}/${rs.totalErrorsToReview}`;
  }
}

function renderNextExercise(){
  const rs = runtimeState;

  if(rs.queue.length === 0){
    if(rs.retryQueue.length > 0 && !rs.inRetryPhase){
      // Déclenchement de la phase de révision unique
      rs.queue = rs.retryQueue;
      rs.retryQueue = [];
      rs.inRetryPhase = true;
      rs.totalErrorsToReview = rs.queue.length;
      rs.queue.forEach(e => e._isRetry = true);
    } else {
      // Déjà en phase d'erreur ou aucune erreur : leçon finie
      finishLesson();
      return;
    }
  }

  const ex = rs.queue.shift();
  rs.currentEx = ex;
  rs.currentAnswered = false;

  if(ex.type === 'card'){
    renderVocabCard(ex);
  } else if(ex.type === 'gcard'){
    renderGrammarCard(ex);
  } else {
    renderQuestion(ex);
  }
  updateProgressBar();
}

function exoCardKindClass(ex){
  if(ex.hard) return 'kind-hard';
  if(ex.type === 'card') return 'kind-vocab';
  if(ex.type === 'gcard') return 'kind-grammar';
  if(ex.id && ex.id.includes('_g_')) return 'kind-grammar';
  if(ex.id && ex.id.includes('_v_')) return 'kind-vocab';
  return '';
}

function renderVocabCard(ex){
  const zone = document.getElementById('exoZone');
  zone.innerHTML = `
    <div class="exo-card kind-vocab pop">
      <div class="exo-tag">🌿 Carte de vocabulaire</div>
      <div class="card-face">
        <div class="card-fr">${escapeHtml(ex.fr)}</div>
        <div class="card-target">${escapeHtml(ex.target)}</div>
        <div class="card-hint">Mémorise ce mot — des exercices vont suivre.</div>
      </div>
      <div class="action-row">
        <button class="btn-validate" id="btnNext">Continuer</button>
      </div>
    </div>
  `;
  if(!runtimeState.isHub){
    registerLearnedWord(runtimeState.lang, ex.id);
  }
  document.getElementById('btnNext').addEventListener('click', ()=>{
    renderNextExercise();
  });
}

function renderGrammarCard(ex){
  const zone = document.getElementById('exoZone');
  zone.innerHTML = `
    <div class="exo-card kind-grammar pop">
      <div class="exo-tag">🏛️ Point de grammaire</div>
      <div class="gcard-title">${escapeHtml(ex.title)}</div>
      <div class="gcard-content">${escapeHtml(ex.content)}</div>
      <div class="action-row">
        <button class="btn-validate" id="btnNext">Continuer</button>
      </div>
    </div>
  `;
  document.getElementById('btnNext').addEventListener('click', ()=>{
    renderNextExercise();
  });
}

function renderQuestion(ex){
  const zone = document.getElementById('exoZone');
  const kindClass = exoCardKindClass(ex);
  let tagLabel = ex.hard ? '⚡ Difficile' : (kindClass==='kind-grammar' ? '🏛️ Grammaire' : kindClass==='kind-vocab' ? '🌿 Vocabulaire' : '📘 Question');
  if(ex._isRetry) tagLabel += ' <span class="tag-mistake">| Révision</span>';

  const ctxHtml = ex.ctx ? `<div class="context-box">${escapeHtml(ex.ctx)}</div>` : '';
  let bodyHtml = '';
  
  // 1. FORMAT QCM
  if(ex.type === 'qcm'){
    bodyHtml = `<div class="options">` + ex.options.map((opt)=>
      `<button class="option-btn" data-opt="${escapeHtml(opt)}">${escapeHtml(opt)}</button>`
    ).join('') + `</div>`;
  } 
  // 2. FORMAT SAISIE STRICT
  else if(ex.type === 'strict'){
    bodyHtml = `<input type="text" class="strict-input" id="strictInput" placeholder="Écris ta réponse…" autocomplete="off" autocorrect="off" spellcheck="false" />`
      + renderSpecialCharsRow(runtimeState.lang);
  }
  // 3. NOUVEAU : FORMAT CLOZE (TEXTE À TROUS)
  else if(ex.type === 'cloze'){
    const selectHtml = `<select class="cloze-select" id="clozeSelect">
      <option value="" disabled selected>...</option>
      ${ex.options.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('')}
    </select>`;
    const interactiveText = ex.text.replace('[blank]', selectHtml);
    bodyHtml = `<div class="cloze-sentence">${interactiveText}</div>`;
  }
  // 4. NOUVEAU : FORMAT JUMBLE (CONSTRUCTEUR DE PHRASE)
  else if(ex.type === 'jumble'){
    bodyHtml = `
      <div class="jumble-slots" id="jumbleSlots" placeholder="Clique sur les mots pour construire la phrase"></div>
      <div class="jumble-pool" id="jumblePool">
        ${ex.words.map(w => `<button class="jumble-chip" data-word="${escapeHtml(w)}">${escapeHtml(w)}</button>`).join('')}
      </div>`;
  }
  // 5. NOUVEAU : FORMAT MATCH (ASSOCIATION DE PAIRES)
  else if(ex.type === 'match'){
    // Mélange des éléments sources et cibles dans une seule grille
    const elements = [];
    ex.pairs.forEach((p, idx) => {
      elements.push({ id: idx, type: 'src', val: p.source });
      elements.push({ id: idx, type: 'tgt', val: p.target });
    });
    elements.sort(() => Math.random() - 0.5);

    bodyHtml = `<div class="match-grid">` + elements.map(el => 
      `<button class="match-chip" data-id="${el.id}" data-type="${el.type}">${escapeHtml(el.val)}</button>`
    ).join('') + `</div>`;
  }

  zone.innerHTML = `
    <div class="exo-card ${kindClass} pop" id="exoCardEl">
      <div class="exo-tag">${tagLabel}</div>
      ${ctxHtml}
      <div class="exo-q">${escapeHtml(ex.q)}</div>
      ${bodyHtml}
      <div class="action-row">
        <button class="btn-validate" id="btnValidate" disabled>Valider</button>
      </div>
    </div>
  `;

  const validateBtn = document.getElementById('btnValidate');

  // FILAGE ET LOGIQUE DES COMPOSANTS INTERACTIFS
  if(ex.type === 'qcm'){
    let selected = null;
    zone.querySelectorAll('.option-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        if(runtimeState.currentAnswered) return;
        zone.querySelectorAll('.option-btn').forEach(b=>b.classList.remove('selected'));
        btn.classList.add('selected');
        selected = btn.dataset.opt;
        validateBtn.disabled = false;
      });
    });
    validateBtn.addEventListener('click', ()=>{
      if(!runtimeState.currentAnswered){
        handleAnswer(ex, selected === ex.a, selected);
      } else {
        renderNextExercise();
      }
    });
  } 
  else if(ex.type === 'strict'){
    const input = document.getElementById('strictInput');
    input.addEventListener('input', () => { validateBtn.disabled = input.value.trim().length === 0; });
    input.addEventListener('keydown', (e) => { if(e.key === 'Enter' && !validateBtn.disabled) validateBtn.click(); });
    validateBtn.addEventListener('click', ()=>{
      if(!runtimeState.currentAnswered){
        const val = input.value.trim();
        const correct = ex.a.some(acceptable => normalizeStr(acceptable) === normalizeStr(val));
        handleAnswer(ex, correct, val);
      } else {
        renderNextExercise();
      }
    });
    setTimeout(()=>input.focus(), 50);
    wireSpecialChars(input);
  }
  else if(ex.type === 'cloze'){
    const select = document.getElementById('clozeSelect');
    select.addEventListener('change', () => { validateBtn.disabled = false; });
    validateBtn.addEventListener('click', () => {
      if(!runtimeState.currentAnswered){
        handleAnswer(ex, select.value === ex.a, select.value);
      } else {
        renderNextExercise();
      }
    });
  }
  else if(ex.type === 'jumble'){
    const slots = document.getElementById('jumbleSlots');
    const pool = document.getElementById('jumblePool');
    
    pool.querySelectorAll('.jumble-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        if(runtimeState.currentAnswered) return;
        if(chip.parentElement === pool){
          slots.appendChild(chip);
        } else {
          pool.appendChild(chip);
        }
        const activeChips = slots.querySelectorAll('.jumble-chip');
        validateBtn.disabled = activeChips.length === 0;
      });
    });

    validateBtn.addEventListener('click', () => {
      if(!runtimeState.currentAnswered){
        const built = Array.from(slots.querySelectorAll('.jumble-chip')).map(c => c.dataset.word).join(' ');
        const correct = ex.a.some(ans => normalizeStr(ans) === normalizeStr(built));
        handleAnswer(ex, correct, built);
      } else {
        renderNextExercise();
      }
    });
  }
  else if(ex.type === 'match'){
    let activeSelection = null;
    let completedPairs = 0;
    const totalPairs = ex.pairs.length;

    zone.querySelectorAll('.match-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        if(runtimeState.currentAnswered || chip.classList.contains('matched')) return;

        if(!activeSelection){
          activeSelection = chip;
          chip.classList.add('selected');
        } else if(activeSelection === chip){
          chip.classList.remove('selected');
          activeSelection = null;
        } else {
          // Comparaison de la paire
          const id1 = activeSelection.dataset.id;
          const type1 = activeSelection.dataset.type;
          const id2 = chip.dataset.id;
          const type2 = chip.dataset.type;

          if(id1 === id2 && type1 !== type2){
            // Bonne correspondance !
            activeSelection.classList.remove('selected');
            activeSelection.classList.add('matched');
            chip.classList.add('matched');
            completedPairs++;
            playCorrectSound();
            activeSelection = null;

            if(completedPairs === totalPairs){
              validateBtn.disabled = false;
              // Simulation d'une réponse valide instantanée
              validateBtn.classList.add('state-correct');
              validateBtn.textContent = 'Continuer';
              runtimeState.currentAnswered = true;
            }
          } else {
            // Mauvaise correspondance
            chip.classList.add('wrong');
            activeSelection.classList.add('wrong');
            playWrongSound();
            const temp = activeSelection;
            setTimeout(() => {
              chip.classList.remove('wrong');
              temp.classList.remove('wrong', 'selected');
            }, 400);
            activeSelection = null;
          }
        }
      });
    });

    validateBtn.addEventListener('click', () => {
      // Les matches valident directement au succès global, on passe au suivant
      if(!runtimeState.inRetryPhase) runtimeState.mainAnsweredCount++;
      else runtimeState.errorsReviewedCount++;
      runtimeState.correctCount++;
      // Score paires
      runtimeState.pointsEarned += runtimeState.isHub ? 3 : (runtimeState.isRedo ? 1 : 5);
      renderNextExercise();
    });
  }
}

function renderSpecialCharsRow(lang){
  const chars = SPECIAL_CHARS[lang] || [];
  if(chars.length === 0) return '';
  return `<div class="special-chars-row" id="specialCharsRow">
    ${chars.map(c => `<button type="button" class="special-char-btn" data-char="${c}">${c}</button>`).join('')}
  </div>`;
}

function wireSpecialChars(input){
  const row = document.getElementById('specialCharsRow');
  if(!row) return;
  row.querySelectorAll('.special-char-btn').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.preventDefault();
      if(runtimeState.currentAnswered) return;
      const char = btn.dataset.char;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      input.value = input.value.slice(0, start) + char + input.value.slice(end);
      const caretPos = start + char.length;
      input.focus();
      input.setSelectionRange(caretPos, caretPos);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
}

function normalizeStr(s){
  // Tolère uniquement les majuscules et la ponctuation terminale (! . ?)
  return s.trim().toLowerCase()
    .replace(/[.!?]+$/g, '') 
    .replace(/\s+/g, ' ')
    .trim();
}

function handleAnswer(ex, isCorrect, userAnswer){
  const rs = runtimeState;
  rs.currentAnswered = true;

  if(!rs.inRetryPhase) {
    rs.mainAnsweredCount++; // Compteur fixe pour la barre de progression
  } else {
    rs.errorsReviewedCount++; // Compteur d'erreurs revues
  }

  const zone = document.getElementById('exoZone');
  const card = document.getElementById('exoCardEl');
  const validateBtn = document.getElementById('btnValidate');

  // FEEDBACKS VISUELS ADAPTATIFS
  if(ex.type === 'qcm'){
    zone.querySelectorAll('.option-btn').forEach(b=>{
      b.disabled = true;
      if(b.dataset.opt === ex.a) b.classList.add('correct');
      if(b.dataset.opt === userAnswer && userAnswer !== ex.a) b.classList.add('wrong');
    });
  } else if(ex.type === 'strict'){
    const input = document.getElementById('strictInput');
    input.disabled = true;
    input.classList.add(isCorrect ? 'correct' : 'wrong');
    if(!isCorrect){
      const hint = document.createElement('div');
      hint.className = 'card-hint';
      hint.textContent = 'Réponse attendue : ' + ex.a[0];
      card.insertBefore(hint, card.querySelector('.action-row'));
    }
  } else if(ex.type === 'cloze'){
    const select = document.getElementById('clozeSelect');
    select.disabled = true;
    select.classList.add(isCorrect ? 'correct' : 'wrong');
    if(!isCorrect){
      const hint = document.createElement('div');
      hint.className = 'card-hint';
      hint.textContent = 'La bonne réponse était : ' + ex.a;
      card.insertBefore(hint, card.querySelector('.action-row'));
    }
  } else if(ex.type === 'jumble'){
    const slots = document.getElementById('jumbleSlots');
    slots.classList.add(isCorrect ? 'correct' : 'wrong');
    if(!isCorrect){
      const hint = document.createElement('div');
      hint.className = 'card-hint';
      hint.textContent = 'Ordre attendu : ' + ex.a[0];
      card.insertBefore(hint, card.querySelector('.action-row'));
    }
  }

  validateBtn.disabled = false;
  validateBtn.textContent = 'Continuer';
  validateBtn.classList.add(isCorrect ? 'state-correct' : 'state-wrong');

  if(isCorrect){
    playCorrectSound();
  } else {
    playWrongSound();
    card.classList.add('shake');
    setTimeout(()=>card.classList.remove('shake'), 500);
  }
  hapticStrong();

  bumpStreak(isCorrect);
  updateStreakLine();

  // SCORE ET REMISE UNIQUE D'ERREUR
  if(isCorrect){
    rs.correctCount++;
    const basePts = ex.hard ? 7 : 5;
    if(rs.isHub) rs.pointsEarned += 3;
    else if(rs.isRedo) rs.pointsEarned += 1;
    else rs.pointsEarned += basePts;

    if(ex._wordId) reinforceWord(rs.lang, ex._wordId, true);
    if(ex._mistakeId) fixMistake(rs.lang, ex._mistakeId);
    
    if(!rs.isHub && !ex._mistakeId && !ex._isRetry){
      const bank = STATE.mistakes[rs.lang];
      if(bank && bank[ex.id] && !bank[ex.id].fixed) fixMistake(rs.lang, ex.id);
    }
  } else {
    if(ex._wordId) reinforceWord(rs.lang, ex._wordId, false);
    if(!rs.isHub) registerMistake(rs.lang, ex);
    
    // Remise UNE SEULE FOIS (uniquement si on ne vient pas déjà d'une révision)
    if(!ex._isRetry){
      rs.retryQueue.push({ ...ex });
    }
  }

  if(rs.isHub) saveState();
  updateProgressBar();
}

/* ---------- Finish lesson ---------- */
function finishLesson(){
  const rs = runtimeState;
  const total = rs.originalCount || 1;
  const pct = Math.round((rs.correctCount / total) * 100);
  const passed = pct >= 75;

  if(rs.isHub){
    saveState();
    renderHubEndScreen(rs, pct);
    return;
  }

  if(passed){
    markLessonDone(rs.lang, rs.level, rs.chapterId, rs.lessonType);
    STATE.points += rs.pointsEarned;
  } else {
    rs.pointsEarned = 0;
  }
  saveState();
  renderEndScreen(rs, pct, passed);
}

function renderEndScreen(rs, pct, passed){
  root.innerHTML = `
    <div class="end-screen">
      <span class="end-emoji">${passed ? '🎉' : '💪'}</span>
      <div class="end-title ${passed ? 'success' : 'fail'}">${passed ? 'Leçon validée !' : 'Leçon non validée'}</div>
      <div class="end-score">${pct}%</div>
      <div class="end-points">✨ +${rs.pointsEarned} points</div>
      <p class="page-sub" style="margin-bottom:20px;">${passed
        ? 'Continue sur ta lancée, la suite du parcours est débloquée.'
        : 'Il faut au moins 75% de bonnes réponses pour valider. Retente ta chance !'}</p>
      <div class="end-actions">
        <button class="btn-secondary" id="btnBackPath">Retour au parcours</button>
        ${!passed ? '<button class="btn-primary" id="btnRetry">Retenter</button>' : ''}
      </div>
    </div>
  `;
  document.getElementById('btnBackPath').addEventListener('click', ()=>{
    setParams({ chapter: null, lesson: null, view: null });
    route();
  });
  const retryBtn = document.getElementById('btnRetry');
  if(retryBtn){
    retryBtn.addEventListener('click', ()=>{
      renderLessonRuntime(rs.lang, rs.level, rs.chapterId, rs.lessonType, false);
    });
  }
}

function renderHubEndScreen(rs, pct){
  root.innerHTML = `
    <div class="end-screen">
      <span class="end-emoji">✅</span>
      <div class="end-title success">Session de révision terminée</div>
      <div class="end-score">${pct}%</div>
      <div class="end-points">✨ +${rs.pointsEarned} points</div>
      <p class="page-sub" style="margin-bottom:20px;">Le hub se met à jour automatiquement au fur et à mesure de tes réussites.</p>
      <div class="end-actions">
        <button class="btn-secondary" id="btnBackPath">Retour au parcours</button>
        <button class="btn-primary" id="btnBackHub">Retour au hub</button>
      </div>
    </div>
  `;
  STATE.points += rs.pointsEarned;
  saveState();
  document.getElementById('btnBackPath').addEventListener('click', ()=>{
    setParams({ chapter: null, lesson: null, view: null });
    route();
  });
  document.getElementById('btnBackHub').addEventListener('click', ()=>{
    setParams({ view: 'hub', chapter: null, lesson: null });
    route();
  });
}

/* ---------- Init ---------- */
(function init(){
  const cur = getParams();
  setParams(cur, false);
  route();
})();
