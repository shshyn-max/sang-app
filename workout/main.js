import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit, deleteDoc, doc, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = { apiKey: "AIzaSyBAwk8ms_RHgV3I4eVBnWqMKc7UBwk3vm8", authDomain: "my-tabata-web.firebaseapp.com", projectId: "my-tabata-web", storageBucket: "my-tabata-web.firebasestorage.app", messagingSenderId: "154823281802", appId: "1:154823281802:web:21e51b45843e7e4cb3f173" };
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// 익명 로그인 후 앱 초기화
signInAnonymously(auth).catch(e => console.error("익명 로그인 실패:", e));
onAuthStateChanged(auth, user => { if (user) { renderPresets().then(() => renderHistory()); } });

let timerId = null, config = { work: 20, rest: 10, sets: 4, rounds: 2, prepare: 10 };
let currentRoundTotal = 0, totalRounds = 8, mode = 'PREPARE', timeLeft = 10, totalSecondsLeft = 0, isPaused = false, isFinished = false;
const timerDisplay = document.getElementById('timer'), finishMsgDisplay = document.getElementById('finishMsg'), statusDisplay = document.getElementById('status'), progressDisplay = document.getElementById('progressDisplay'), totalDisplay = document.getElementById('totalTimeDisplay'), toggleBtn = document.getElementById('toggleBtn'), rightBtn = document.getElementById('rightBtn'), settingsArea = document.getElementById('settingsArea'), normalControls = document.getElementById('normalControls'), finishBtn = document.getElementById('finishBtn');

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playBeep(f, d) { const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.connect(g); g.connect(audioCtx.destination); o.frequency.value = f; o.start(); setTimeout(() => o.stop(), d); }
const formatTime = (s) => `${Math.floor(Math.max(0,s)/60).toString().padStart(2,'0')}:${(Math.max(0,s)%60).toString().padStart(2,'0')}`;

async function renderPresets() {
    const snap = await getDocs(query(collection(db, "workout_presets"), orderBy("updatedAt", "desc"), limit(15)));
    const list = document.getElementById('presetList');
    list.innerHTML = "";
    if (!snap.empty) {
        const latest = snap.docs[0].data();
        if (!timerId && !isPaused && !isFinished && !document.getElementById('inputWork').value) {
            document.getElementById('inputWork').value = latest.work;
            document.getElementById('inputRest').value = latest.rest;
            document.getElementById('inputSets').value = latest.sets;
            document.getElementById('inputRounds').value = latest.rounds;
            updateInfo();
        }
        snap.forEach(d => {
            const p = d.data();
            const total = (p.work + p.rest) * (p.sets * p.rounds);
            list.innerHTML += `<div class="preset-item"><div class="preset-info" onclick="applyPreset(${p.work}, ${p.rest}, ${p.sets}, ${p.rounds})"><b>${p.sets}세트 X ${p.rounds}라운드</b><span>${p.work}s운동/${p.rest}s휴식 (${formatTime(total)})</span></div><button class="btn-text btn-del" onclick="deletePreset('${d.id}')" style="margin-left:0; font-size:0.65rem;">삭제</button></div>`;
        });
    } else {
        document.getElementById('inputWork').value = 20; document.getElementById('inputRest').value = 10; document.getElementById('inputSets').value = 4; document.getElementById('inputRounds').value = 2;
        updateInfo(); list.innerHTML = '<div style="color:#555; font-size:0.8rem;">세팅이 없습니다.</div>';
    }
}

async function renderHistory() {
    const historySnap = await getDocs(query(collection(db, "workout_history"), orderBy("createdAt", "desc"), limit(20)));
    const savedSnap = await getDocs(collection(db, "saved_workouts"));
    const savedKeys = new Set();
    savedSnap.forEach(d => { const data = d.data(); if(data.createdAt) savedKeys.add(`${data.createdAt}_${data.sets}_${data.rounds}`); });
    const list = document.getElementById('historyList');
    list.innerHTML = "";
    if (historySnap.empty) { list.innerHTML = '<div style="color:#555; font-size:0.9rem; padding:20px;">기록이 없습니다.</div>'; return; }
    historySnap.forEach(d => {
        const item = d.data();
        const total = (item.work + item.rest) * (item.sets * item.rounds); 
        const _isSaved = savedKeys.has(`${item.createdAt}_${item.sets}_${item.rounds}`);
        list.innerHTML += `<div class="history-item"><div class="history-info" onclick="applyPreset(${item.work}, ${item.rest}, ${item.sets}, ${item.rounds})"><span>${item.date}</span><b>${item.sets}세트 X ${item.rounds}라운드 (${formatTime(total)})</b></div><div style="display:flex; align-items:center;"><button class="btn-text btn-save ${_isSaved ? 'disabled' : ''}" onclick="saveToStats(this, '${d.id}')">${_isSaved ? '저장완료' : '저장'}</button><button class="btn-text btn-del" onclick="deleteItem('${d.id}')">삭제</button></div></div>`;
    });
}

async function registerPreset() {
    const work = parseInt(document.getElementById('inputWork').value) || 0, rest = parseInt(document.getElementById('inputRest').value) || 0, sets = parseInt(document.getElementById('inputSets').value) || 1, rounds = parseInt(document.getElementById('inputRounds').value) || 1;
    const q = query(collection(db, "workout_presets"), where("work", "==", work), where("rest", "==", rest), where("sets", "==", sets), where("rounds", "==", rounds));
    const snap = await getDocs(q);
    if (!snap.empty) { alert("이미 등록된 세팅입니다."); return; }
    await addDoc(collection(db, "workout_presets"), { work, rest, sets, rounds, updatedAt: Date.now() });
    alert("최근 세팅에 추가되었습니다."); renderPresets();
}

window.applyPreset = (work, rest, sets, rounds) => { if (timerId || isPaused || isFinished) return; document.getElementById('inputWork').value = work; document.getElementById('inputRest').value = rest; document.getElementById('inputSets').value = sets; document.getElementById('inputRounds').value = rounds; updateInfo(); };
window.saveToStats = async (btn, id) => {
    if(!confirm("통계에 저장하시겠습니까?")) return;
    const snap = await getDocs(query(collection(db, "workout_history"), where("__name__", "==", id)));
    if (!snap.empty) { await addDoc(collection(db, "saved_workouts"), { ...snap.docs[0].data(), savedAt: Date.now() }); btn.innerText = "저장완료"; btn.classList.add('disabled'); }
};
window.deleteItem = async (id) => { if(confirm("삭제하시겠습니까?")) { await deleteDoc(doc(db, "workout_history", id)); renderHistory(); } };
window.deletePreset = async (id) => { if(confirm("세팅을 삭제하시겠습니까?")) { await deleteDoc(doc(db, "workout_presets", id)); renderPresets(); } };

function updateInfo() {
    config.work = parseInt(document.getElementById('inputWork').value) || 0; config.rest = parseInt(document.getElementById('inputRest').value) || 0; config.sets = parseInt(document.getElementById('inputSets').value) || 1; config.rounds = parseInt(document.getElementById('inputRounds').value) || 1;
    totalRounds = config.sets * config.rounds; 
    if (!timerId && !isPaused && !isFinished) {
        timeLeft = config.prepare; totalSecondsLeft = (config.work + config.rest) * totalRounds; currentRoundTotal = 0;
        timerDisplay.style.display = "block"; finishMsgDisplay.style.display = "none";
    }
    let percent = Math.floor((currentRoundTotal / totalRounds) * 100);
    timerDisplay.innerText = Math.max(0, timeLeft); progressDisplay.innerText = `${currentRoundTotal} / ${totalRounds} (${percent}%)`; totalDisplay.innerText = formatTime(totalSecondsLeft);
}

async function startWorkout() { if (audioCtx.state === 'suspended') await audioCtx.resume(); toggleBtn.innerText = "⏸ PAUSE"; rightBtn.innerText = "■ STOP"; isPaused = false; isFinished = false; settingsArea.style.opacity = '0.5'; settingsArea.style.pointerEvents = 'none'; runInterval(); }
function runInterval() {
    document.body.className = `mode-${mode.toLowerCase()}`; statusDisplay.innerText = mode;
    timerId = setInterval(() => {
        timeLeft--; if (mode !== 'PREPARE') { totalSecondsLeft--; }
        timerDisplay.innerText = Math.max(0, timeLeft); totalDisplay.innerText = formatTime(totalSecondsLeft);
        if (timeLeft <= 3 && timeLeft > 0) playBeep(440, 100);
        if (timeLeft <= 0) {
            playBeep(880, 500); clearInterval(timerId);
            if (mode === 'PREPARE') { mode = 'WORK'; timeLeft = config.work; runInterval(); }
            else if (mode === 'WORK') { currentRoundTotal++; updateInfo(); mode = 'REST'; timeLeft = config.rest; runInterval(); }
            else if (mode === 'REST') {
                if (currentRoundTotal >= totalRounds) { finishWorkout(); }
                else { mode = 'WORK'; timeLeft = config.work; updateInfo(); runInterval(); }
            }
        }
    }, 1000);
}

function performReset() { clearInterval(timerId); timerId = null; isPaused = false; isFinished = false; mode = 'PREPARE'; currentRoundTotal = 0; updateInfo(); normalControls.style.display = "grid"; finishBtn.style.display = "none"; toggleBtn.innerText = "▶ START"; rightBtn.innerText = "⚙︎ 운동세팅"; settingsArea.style.opacity = '1'; settingsArea.style.pointerEvents = 'all'; document.body.className = ''; }
async function finishWorkout() { 
    isFinished = true; document.body.className = 'mode-finished'; statusDisplay.innerText = "FINISHED!"; 
    timerDisplay.style.display = "none"; finishMsgDisplay.style.display = "block";
    totalSecondsLeft = 0; totalDisplay.innerText = formatTime(0);
    const now = Date.now();
    await addDoc(collection(db, "workout_history"), { work: config.work, rest: config.rest, sets: config.sets, rounds: config.rounds, date: new Date().toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }), createdAt: now });
    renderHistory(); confetti(); normalControls.style.display = "none"; finishBtn.style.display = "flex";
}

window.completeWorkout = () => { performReset(); document.getElementById('historyWrapper').scrollIntoView({ behavior: 'smooth' }); };
toggleBtn.addEventListener('click', () => { if (!timerId) startWorkout(); else { clearInterval(timerId); timerId = null; isPaused = true; toggleBtn.innerText = "▶ 재시작"; } });
rightBtn.addEventListener('click', () => { if (timerId || isPaused) { if (confirm("중단할까요?")) performReset(); } else { registerPreset(); } });
document.querySelectorAll('input').forEach(i => i.addEventListener('input', updateInfo));
