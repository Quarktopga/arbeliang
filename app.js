let courseDatabase = {};
let currentLevel = "debutant";
let activeSequence = [];
let activeIndex = 0;
let score = 0;
let comboCount = 0;
let currentSelectedOption = null;
let isHubSession = false;
let currentHubType = ""; 
let activeChapterId = "";
let activeLessonType = "";

// COMPTEURS INTERNES PAR SESSION (SANS TOUCHER AU STORAGE AVANT LA FIN)
let lessonEarnedPoints = 0; 
let totalLessonErrors = 0; 

// NOUVELLES CLES V2 POUR LA REMISE A ZERO TOTAL DE LA PROGRESSION
let vocabPool = JSON.parse(localStorage.getItem('sv_v2_vocab_pool')) || []; 
let errorsPool = JSON.parse(localStorage.getItem('sv_v2_errors_pool')) || []; 
let progression = JSON.parse(localStorage.getItem('sv_v2_progression')) || [];
let globalPoints = parseInt(localStorage.getItem('sv_v2_points')) || 0;

async function init() {
    updatePointsDisplay();
    try {
        const res = await fetch('questions.json');
        courseDatabase = await res.json();
    } catch (e) { console.error("Fichier de données introuvable."); }
    renderChapters();
}

function updatePointsDisplay() {
    document.getElementById('global-points-val').innerText = globalPoints;
}

function isLessonAccessible(chapterId, type) {
    if (chapterId === 'c1' && type === 'vocab') return true;
    const order = ['vocab', 'grammar', 'reading', 'review'];
    const currentIdx = order.indexOf(type);
    
    if (currentIdx > 0) {
        return progression.includes(`${chapterId}_${order[currentIdx - 1]}`);
    } else {
        const prevChapterNum = parseInt(chapterId.replace('c', '')) - 1;
        return progression.includes(`c${prevChapterNum}_review`);
    }
}

function renderChapters() {
    const root = document.getElementById('chapters-root');
    if (!root) return;
    root.innerHTML = '';
    const chapters = courseDatabase[currentLevel] || [];
    
    chapters.forEach(ch => {
        const states = {};
        ['vocab', 'grammar', 'reading', 'review'].forEach(type => {
            const key = `${ch.chapterId}_${type}`;
            if (progression.includes(key)) {
                states[type] = 'completed'; 
            } else {
                states[type] = isLessonAccessible(ch.chapterId, type) ? '' : 'locked';
            }
        });

        root.innerHTML += `
            <div class="chapter-card">
                <div class="chapter-title">${ch.title}</div>
                <div class="sub-grid">
                    <button class="sub-btn ${states.vocab}" onclick="${states.vocab === 'locked' ? '' : `launchLesson('${ch.chapterId}', 'vocab')`}">Vocabulaire</button>
                    <button class="sub-btn ${states.grammar}" onclick="${states.grammar === 'locked' ? '' : `launchLesson('${ch.chapterId}', 'grammar')`}">Grammaire</button>
                    <button class="sub-btn ${states.reading}" onclick="${states.reading === 'locked' ? '' : `launchLesson('${ch.chapterId}', 'reading')`}">Compréhension</button>
                    <button class="sub-btn ${states.review}" onclick="${states.review === 'locked' ? '' : `launchLesson('${ch.chapterId}', 'review')`}">Vérif. Globale</button>
                </div>
            </div>`;
    });
}

function toggleLevelMenu() { const m = document.getElementById('level-menu'); m.style.display = m.style.display === 'flex' ? 'none' : 'flex'; }
function selectLevel(lvl) {
    document.querySelector('.level-current').innerText = lvl + " ▾";
    toggleLevelMenu();
    currentLevel = lvl.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    renderChapters();
}

function launchLesson(chapterId, type) {
    isHubSession = false; activeChapterId = chapterId; activeLessonType = type;
    const chap = courseDatabase[currentLevel].find(c => c.chapterId === chapterId);
    activeSequence = JSON.parse(JSON.stringify(chap.lessons[type]));
    
    activeIndex = 0; score = 0; comboCount = 0;
    lessonEarnedPoints = 0; totalLessonErrors = 0; // Remise à zéro locale
    
    document.getElementById('lesson-layer').style.display = 'flex';
    buildStep();
}

function buildStep() {
    const body = document.getElementById('l-body');
    const actionBtn = document.getElementById('l-action');
    const overlay = document.getElementById('lesson-layer');
    
    body.innerHTML = ''; actionBtn.innerText = "Valider"; actionBtn.onclick = handleValidation;

    if (activeIndex >= activeSequence.length) { finishLesson(); return; }

    const step = activeSequence[activeIndex];
    const progress = (activeIndex / activeSequence.length) * 100;
    document.getElementById('p-bar').style.width = `${progress}%`;

    if (step.hard) {
        overlay.classList.add('hard-mode');
        body.innerHTML += `<div class="hard-badge">⚡ Défi Ultime (Points x2)</div>`;
    } else {
        overlay.classList.remove('hard-mode');
    }

    if (step.context) {
        body.innerHTML += `<div class="context-panel">${step.context}</div>`;
    }

    if (step.type === 'card') {
        actionBtn.innerText = "Compris"; actionBtn.onclick = nextStep;
        body.innerHTML += step.fr ? `
            <div class="card-view">
                <div class="card-fr">${step.fr}</div>
                <div class="card-sv">${step.article ? step.article+' ' : ''}${step.sv}</div>
            </div>` : `
            <div class="card-view">
                <div class="card-fr">${step.title}</div>
                <div style="font-size:15px; margin-top:10px; line-height:1.5;">${step.text}</div>
            </div>`;
    } 
    else if (step.type === 'qcm') {
        body.innerHTML += `<div class="question-text">${step.q}</div><div class="options-container">` +
            step.options.map((opt, idx) => `<button class="option-btn" onclick="selectOption(this, ${idx})">${opt}</button>`).join('') +
            `</div><div class="feedback-banner" id="f-banner"></div>`;
    }
    else if (step.type === 'strict') {
        body.innerHTML += `
            <div class="question-text">${step.q}</div>
            <input type="text" id="s-input" class="input-box" placeholder="Tapez la phrase complète..." autocomplete="off" autocapitalize="none">
            <div class="feedback-banner" id="f-banner"></div>`;
        setTimeout(() => { const i = document.getElementById('s-input'); if(i) i.focus(); }, 120);
    }
}

function selectOption(btn, idx) {
    document.querySelectorAll('.option-btn').forEach(b => b.style.borderColor = '#e2e8f0');
    btn.style.borderColor = 'var(--primary)';
    currentSelectedOption = activeSequence[activeIndex].options[idx];
}

function handleValidation() {
    const step = activeSequence[activeIndex];
    const banner = document.getElementById('f-banner');
    const actionBtn = document.getElementById('l-action');
    let isCorrect = false;

    if (step.type === 'qcm') {
        if (currentSelectedOption === null) return;
        isCorrect = (currentSelectedOption === step.a);
        document.querySelectorAll('.option-btn').forEach(b => {
            b.style.pointerEvents = 'none';
            if (b.innerText === step.a) b.classList.add('correct');
            if (b.innerText === currentSelectedOption && !isCorrect) b.classList.add('wrong');
        });
    } 
    else if (step.type === 'strict') {
        const input = document.getElementById('s-input');
        if (!input) return;
        const cleanUser = input.value.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
        const targets = (Array.isArray(step.a) ? step.a : [step.a]).map(ans => ans.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,""));
        
        isCorrect = targets.includes(cleanUser);
        input.disabled = true;
        input.classList.add(isCorrect ? 'correct' : 'wrong');
    }

    if (isCorrect) {
        score++; comboCount++;
        
        // Calcul du score accumulé pour cette session uniquement
        let pts = 0;
        if (isHubSession) {
            pts = 3; 
        } else {
            const lessonKey = `${activeChapterId}_${activeLessonType}`;
            if (progression.includes(lessonKey)) {
                pts = 1; 
            } else {
                pts = step.hard ? 10 : 5; 
            }
        }
        lessonEarnedPoints += pts; // Ajout local temporaire

        if(banner) banner.innerHTML = `<span style="color:var(--secondary)">✓ Correct (+${pts} pts accumulés)</span>`;

        if (!isHubSession && step.meta) {
            if (!vocabPool.some(v => v.sv === step.meta.sv)) {
                step.meta.status = "non_revise"; vocabPool.push(step.meta);
                localStorage.setItem('sv_v2_vocab_pool', JSON.stringify(vocabPool));
            }
        }
    } else {
        comboCount = 0; 
        totalLessonErrors++; 
        const correctionDisplay = Array.isArray(step.a) ? step.a[0] : step.a;
        if(banner) banner.innerHTML = `<span style="color:var(--error)">✗ Solution : ${correctionDisplay}</span>`;
        
        if (!isHubSession && step.id && !errorsPool.some(e => e.id === step.id)) {
            errorsPool.push(step); localStorage.setItem('sv_v2_errors_pool', JSON.stringify(errorsPool));
        }
    }
    actionBtn.innerText = "Continuer";
    actionBtn.onclick = nextStep;
    currentSelectedOption = null;
}

function nextStep() { activeIndex++; buildStep(); }

function finishLesson() {
    document.getElementById('p-bar').style.width = `100%`;
    const body = document.getElementById('l-body');
    const actionBtn = document.getElementById('l-action');
    const totalQuestions = activeSequence.filter(s => s.type !== 'card').length;
    const ratio = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 100;
    const validated = ratio >= 80;

    let bonusFin = 0;
    if (!isHubSession && validated) {
        if (totalLessonErrors === 0) bonusFin = 20;
        else if (totalLessonErrors <= 2) bonusFin = 10;
    }

    // REGLE SECURISEE : LES POINTS NE SONT SAUVEGARDES QU'ICI
    globalPoints += lessonEarnedPoints + bonusFin;
    localStorage.setItem('sv_v2_points', globalPoints);
    updatePointsDisplay();

    if (validated && !isHubSession) {
        const key = `${activeChapterId}_${activeLessonType}`;
        if (!progression.includes(key)) { 
            progression.push(key); 
            localStorage.setItem('sv_v2_progression', JSON.stringify(progression)); 
        }
    }

    body.innerHTML = `
        <div class="question-text" style="font-size: 42px; margin-top: 10px; color:var(--primary);">${ratio}%</div>
        <div class="score-summary-box">
            <div class="score-row"><span>Réponses correctes :</span><span>${score} / ${totalQuestions}</span></div>
            <div class="score-row"><span>Points de base récoltés :</span><span>+${lessonEarnedPoints} pts</span></div>
            <div class="score-row"><span>Fautes commises :</span><span>${totalLessonErrors}</span></div>
            <div class="score-row"><span>Bonus de précision :</span><span>+${bonusFin} pts</span></div>
            <div class="score-row"><span>Statut de la leçon :</span><span>${validated ? 'Validé (Enregistré)' : 'Terminé'}</span></div>
        </div>`;
    
    actionBtn.innerText = "Terminer";
    actionBtn.onclick = () => { document.getElementById('lesson-layer').style.display = 'none'; renderChapters(); };
}

function triggerAbortModal() { document.getElementById('abort-modal').style.display = 'flex'; }
function closeAbortModal() { document.getElementById('abort-modal').style.display = 'none'; }
function confirmAbortLesson() { closeAbortModal(); document.getElementById('lesson-layer').style.display = 'none'; renderChapters(); }

function openHub() {
    const countVocab = vocabPool.filter(v => v.status === "non_revise").length;
    const body = document.getElementById('chapters-root');
    if(!body) return;
    body.innerHTML = `
        <div class="chapter-card">
            <div class="chapter-title" style="text-align:center; font-size:22px;">Hub de Révision Unique</div>
            <div class="sub-grid" style="grid-template-columns: 1fr; gap: 15px;">
                <button class="sub-btn" style="padding:16px; background: #f0fdf4;" onclick="startHubVocab()">Lexique à revoir (${countVocab})</button>
                <button class="sub-btn" style="padding:16px; background: #fff1f2;" onclick="startHubErrors()">Fautes à corriger (${errorsPool.length})</button>
            </div>
            <button class="action-btn" style="margin-top:25px; background:#64748b;" onclick="renderChapters()">Retour au parcours principal</button>
        </div>`;
}

function startHubVocab() {
    const targets = vocabPool.filter(v => v.status === "non_revise");
    if (targets.length === 0) { alert("Aucun élément lexical à réviser."); return; }
    isHubSession = true; currentHubType = "vocab"; activeSequence = [];
    targets.forEach(item => {
        const full = item.art ? `${item.art} ${item.sv}` : item.sv;
        activeSequence.push({ type: "strict", q: `Traduisez en suédois : "${item.fr}"`, a: [full] });
    });
    activeIndex = 0; score = 0; comboCount = 0; lessonEarnedPoints = 0; totalLessonErrors = 0;
    document.getElementById('lesson-layer').style.display = 'flex'; buildStep();
}

function startHubErrors() {
    if (errorsPool.length === 0) { alert("Aucune erreur enregistrée."); return; }
    isHubSession = true; currentHubType = "errors";
    activeSequence = errorsPool.map(err => { let copy = JSON.parse(JSON.stringify(err)); copy.originId = err.id; return copy; });
    activeIndex = 0; score = 0; comboCount = 0; lessonEarnedPoints = 0; totalLessonErrors = 0;
    document.getElementById('lesson-layer').style.display = 'flex'; buildStep();
}

window.onload = init;
