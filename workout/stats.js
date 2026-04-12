import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, query, orderBy, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = { apiKey: "AIzaSyBAwk8ms_RHgV3I4eVBnWqMKc7UBwk3vm8", authDomain: "my-tabata-web.firebaseapp.com", projectId: "my-tabata-web", storageBucket: "my-tabata-web.firebasestorage.app", messagingSenderId: "154823281802", appId: "1:154823281802:web:21e51b45843e7e4cb3f173" };
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// 익명 로그인 후 통계 로드
signInAnonymously(auth).catch(e => console.error("익명 로그인 실패:", e));
onAuthStateChanged(auth, user => { if (user) { loadStats(); } });

window.toggleMonth = (header) => { header.parentElement.classList.toggle('open'); };

window.deleteSavedItem = async (id) => {
    if(confirm("기록을 삭제하시겠습니까?")) {
        await deleteDoc(doc(db, "saved_workouts", id));
        loadStats();
    }
};

const formatTime = (s) => `${Math.floor(Math.max(0,s)/60).toString().padStart(2,'0')}:${(Math.max(0,s)%60).toString().padStart(2,'0')}`;

const formatLongTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return sec > 0 ? `${m}분 ${sec}초` : `${m}분`;
};

function getGrowthTag(current, previous) {
    if (!previous || previous === 0) return '<div class="growth-tag growth-zero">비교대상 없음</div>';
    const rate = ((current - previous) / previous * 100).toFixed(1);
    if (rate > 0) return `<div class="growth-tag growth-up">▲ ${rate}% 성장</div>`;
    if (rate < 0) return `<div class="growth-tag growth-down">▼ ${Math.abs(rate)}% 하락</div>`;
    return '<div class="growth-tag growth-zero">변동 없음</div>';
}

async function loadStats() {
    const snap = await getDocs(query(collection(db, "saved_workouts"), orderBy("savedAt", "asc")));
    const statsContent = document.getElementById('statsContent');
    
    if (snap.empty) {
        statsContent.innerHTML = '<div class="empty-state">저장된 기록이 없습니다.</div>';
        return;
    }

    const monthlyData = {};
    const monthsOrdered = [];
    const seenItems = new Set();

    snap.forEach(d => {
        const item = d.data();
        const uniqueKey = `${item.createdAt}_${item.sets}_${item.rounds}`;
        if (seenItems.has(uniqueKey)) return; 
        seenItems.add(uniqueKey);

        const dateObj = new Date(item.savedAt);
        const monthKey = `${dateObj.getFullYear()}년 ${dateObj.getMonth() + 1}월`;
        
        // 🛠️ 핵심 수정: 마지막 휴식 시간을 포함하여 INDEX 파일과 계산 방식 통일 (04:00 정석)
        const workoutTime = (item.work + item.rest) * (item.sets * item.rounds);

        if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = { sessions: 0, totalSeconds: 0, items: [] };
            monthsOrdered.push(monthKey);
        }

        monthlyData[monthKey].sessions += 1;
        monthlyData[monthKey].totalSeconds += workoutTime;
        monthlyData[monthKey].items.unshift({ id: d.id, ...item, workoutTime });
    });

    monthsOrdered.reverse();

    let finalHtml = "";
    monthsOrdered.forEach((month, index) => {
        const data = monthlyData[month];
        const prevMonthKey = monthsOrdered[index + 1];
        const prevData = prevMonthKey ? monthlyData[prevMonthKey] : null;
        const isOpen = index === 0 ? "open" : "";

        finalHtml += `
            <div class="month-section ${isOpen}">
                <div class="month-header" onclick="toggleMonth(this)">
                    <div class="month-title">${month}</div>
                    <div class="toggle-icon">▼</div>
                </div>
                <div class="month-summary">
                    <div class="month-card"><span>한 달 운동 시간</span><b>${formatLongTime(data.totalSeconds)}</b>${getGrowthTag(data.totalSeconds, prevData?.totalSeconds)}</div>
                    <div class="month-card"><span>한 달 운동 횟수</span><b>${data.sessions}회</b>${getGrowthTag(data.sessions, prevData?.sessions)}</div>
                </div>
                <div class="month-details">
                    ${data.items.map(i => `
                        <div class="saved-item">
                            <div class="saved-info">
                                <b>${i.sets}세트 X ${i.rounds}라운드</b>
                                <span>${i.date}</span>
                            </div>
                            <div class="saved-btns">
                                <span class="time-badge">${formatTime(i.workoutTime)}</span>
                                <button class="btn-del-text" onclick="deleteSavedItem('${i.id}')">삭제</button>
                            </div>
                        </div>`).join('')}
                </div>
            </div>`;
    });
    statsContent.innerHTML = finalHtml;
}
