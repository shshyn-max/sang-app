const firebaseConfig = {
    apiKey: "AIzaSyAlMx_uSh9FuB1gbZj3DzB1u1qX6kKnSuw", 
    authDomain: "voucher-pocket.firebaseapp.com",
    projectId: "voucher-pocket", 
    storageBucket: "voucher-pocket.firebasestorage.app",
    messagingSenderId: "789053008764", 
    appId: "1:789053008764:web:49070106255927785f92f9"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const VOUCHER_COL = db.collection("vouchers"); 

let vouchersData = []; 
let currentVoucherId = null; 
let currentHistoryIdx = null; 
let isEditMode = false;

function init() {
    // 1. orderBy를 코드 내부 sort로 대체하여 필드 부재로 인한 데이터 누락 방지
    VOUCHER_COL.onSnapshot((snap) => {
        vouchersData = snap.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data() 
        }));
        
        // 2. 데이터가 갱신될 때마다 두 화면을 모두 다시 그립니다.
        renderList();
        renderArchive(); 
    }, (error) => {
        console.error("데이터 로드 실패:", error);
    });
}

// --- 뷰 전환 및 렌더링 ---
window.showView = (viewId) => {
    ['view-list', 'view-archive', 'view-form', 'view-detail'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    document.getElementById(viewId).classList.remove('hidden');
    window.scrollTo(0,0);
};

function renderList() {
    const container = document.getElementById('voucher-container');
    const active = vouchersData.filter(v => !v.isDone).sort((a,b) => new Date(a.expiry) - new Date(b.expiry));
    container.innerHTML = active.length ? active.map(v => generateCardHtml(v, false)).join('') : `<p style="text-align:center; color:var(--sub-text); margin-top:40px;">사용 가능한 상품권이 없습니다.</p>`;
}

function renderArchive() {
    const container = document.getElementById('archive-container');
    // isDone이 true인 항목만 필터링
    const done = vouchersData.filter(v => v.isDone === true);
    
    if (done.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:var(--sub-text); margin-top:40px;">완료된 내역이 없습니다.</p>`;
        return;
    }

    // 유효기간순으로 정렬 (안전한 비교 방식)
    const sorted = done.sort((a, b) => {
        const dateA = a.expiry ? new Date(a.expiry) : 0;
        const dateB = b.expiry ? new Date(b.expiry) : 0;
        return dateA - dateB;
    });

    container.innerHTML = sorted.map(v => generateCardHtml(v, true)).join('');
}

function generateCardHtml(v, isArchive) {
    const history = v.history || [];
    const used = history.reduce((s, h) => s + h.amount, 0);
    const balance = v.total - used;
    const { text, isUrgent } = getDdayInfo(v.expiry);
    const sortedH = [...history].sort((a, b) => new Date(b.date) - new Date(a.date));
    const latest = sortedH[0];
    const isExpanded = localStorage.getItem('expanded_' + v.id) === 'true';

    return `
        <div class="list-card ${isArchive ? 'archive-card' : ''}">
            <div class="list-header">
                <div class="info-left-group">
                    <div class="list-info-top">
                        <div class="title-row">
                            <span class="category-tag">${v.category}</span>
                            <h3 class="card-black-text" style="margin:0; font-size:1.1rem; font-weight:700;">${v.name}</h3>
                        </div>
                        <div class="title-actions">
                            <button class="btn-mini" onclick="quickEdit('${v.id}')">편집</button>
                            <button class="btn-mini" style="color:#ff4757" onclick="quickDelete('${v.id}')">삭제</button>
                            ${!isArchive ? `<button class="btn-mini done" onclick="markAsDone('${v.id}')">사용완료</button>` : `<button class="btn-mini" onclick="markAsActive('${v.id}')">복원</button>`}
                        </div>
                    </div>
                    <div class="card-black-text" style="font-size:1.2rem; font-weight:800; margin-top:4px;">${balance.toLocaleString()}원</div>
                </div>
                <div style="text-align:right;"><span style="font-weight:800; color:${isUrgent ? 'var(--urgent)' : 'var(--primary)'}; ${isUrgent ? 'animation: blink 1.2s infinite;' : ''}">${text}</span></div>
            </div>
            <div class="list-history-box">
                ${latest ? `
                    <div class="history-summary"><span>최근: ${latest.date}</span><span>-${latest.amount.toLocaleString()}원</span></div>
                    <div id="full-history-${v.id}" class="${isExpanded ? '' : 'hidden'} history-full">
                        ${sortedH.map((h, i) => `<div class="history-row"><span>${h.date} <strong>-${h.amount.toLocaleString()}원</strong></span>
                        <button class="btn-history-mini" onclick="editHistory('${v.id}', ${history.indexOf(h)})">✎</button></div>`).join('')}
                    </div>
                    <button class="btn-expand" onclick="toggleHistory(event, '${v.id}')">${isExpanded ? "접기 ▲" : "내역 펼치기 ▼"}</button>
                ` : '<div style="text-align:center; font-size:0.75rem; color:#ccc;">내역 없음</div>'}
            </div>
            <div class="list-actions-bottom">
                <button class="btn-bottom btn-view" onclick="openVoucherImg('${v.id}')">이미지 보기</button>
                <button class="btn-bottom btn-input" onclick="showDetail('${v.id}')">금액 입력</button>
            </div>
        </div>`;
}

// --- 핵심 로직 (ID 기반) ---
window.saveVoucher = async () => {
    const name = document.getElementById('vName').value;
    const total = parseInt(document.getElementById('vTotal').value);
    const expiry = document.getElementById('vExpiry').value;
    const category = document.getElementById('vCategory').value;
    const file = document.getElementById('vImg').files[0];

    if(!name || isNaN(total) || !expiry) return alert("필수 정보를 입력하세요.");
    
    const resizeImg = (f) => new Promise(res => {
        const r = new FileReader();
        r.onload = e => {
            const i = new Image();
            i.onload = () => {
                const c = document.createElement('canvas');
                let w = i.width, h = i.height;
                if(w > h) { if(w > 800) { h *= 800/w; w = 800; } }
                else { if(h > 800) { w *= 800/h; h = 800; } }
                c.width = w; c.height = h;
                c.getContext('2d').drawImage(i,0,0,w,h);
                res(c.toDataURL('image/jpeg', 0.7));
            };
            i.src = e.target.result;
        };
        r.readAsDataURL(f);
    });

    const imgData = file ? await resizeImg(file) : null;
    if(isEditMode) {
        const up = { name, total, expiry, category };
        if(imgData) up.img = imgData;
        await VOUCHER_COL.doc(currentVoucherId).update(up);
    } else {
        if(!imgData) return alert("이미지는 필수입니다.");
        await VOUCHER_COL.add({ name, total, expiry, category, img: imgData, history: [], isDone: false, createdAt: new Date() });
    }
    showView('view-list');
};

window.quickEdit = (id) => {
    isEditMode = true; currentVoucherId = id;
    const v = vouchersData.find(x => x.id === id);
    document.getElementById('vName').value = v.name;
    document.getElementById('vTotal').value = v.total;
    document.getElementById('vExpiry').value = v.expiry;
    document.getElementById('vCategory').value = v.category;
    document.getElementById('imgEditBlock').classList.remove('hidden');
    document.getElementById('vImgPreview').src = v.img;
    showView('view-form');
};

window.showDetail = (id) => {
    currentVoucherId = id; currentHistoryIdx = null;
    document.getElementById('useDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('useAmount').value = "";
    showView('view-detail');
};

window.addHistory = async () => {
    const d = document.getElementById('useDate').value, a = parseInt(document.getElementById('useAmount').value);
    if(!d || isNaN(a)) return;
    const v = vouchersData.find(x => x.id === currentVoucherId);
    let h = [...v.history];
    if(currentHistoryIdx !== null) h[currentHistoryIdx] = { date: d, amount: a };
    else h.push({ date: d, amount: a });
    await VOUCHER_COL.doc(currentVoucherId).update({ history: h });
    showView('view-list');
};

window.toggleHistory = (e, id) => {
    const box = document.getElementById('full-history-' + id);
    const isHidden = box.classList.toggle('hidden');
    localStorage.setItem('expanded_' + id, !isHidden);
    e.target.innerText = isHidden ? "내역 펼치기 ▼" : "내역 접기 ▲";
};

window.editHistory = (id, hIdx) => {
    const v = vouchersData.find(x => x.id === id);
    currentVoucherId = id;
    currentHistoryIdx = hIdx;
    
    const h = v.history[hIdx];
    document.getElementById('useDate').value = h.date;
    document.getElementById('useAmount').value = h.amount;
    
    showView('view-detail');
};

window.openVoucherImg = (id) => {
    const v = vouchersData.find(x => x.id === id);
    const win = window.open("", "_blank");
    
    // 문서 작성을 시작합니다.
    win.document.write(`
        <html>
        <head>
            <title>${v.name} - 이미지 보기</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { 
                    margin: 0; background: #000; 
                    display: flex; justify-content: center; align-items: center; 
                    min-height: 100vh; cursor: pointer; overflow: hidden;
                }
                img { max-width: 100%; max-height: 100vh; object-fit: contain; }
                .close-btn {
                    position: fixed; top: 20px; right: 20px;
                    background: rgba(0,0,0,0.7); color: white; border: 1px solid rgba(255,255,255,0.3);
                    padding: 12px 24px; border-radius: 30px; font-size: 16px; font-weight: bold;
                    cursor: pointer; z-index: 100; backdrop-filter: blur(5px);
                    -webkit-tap-highlight-color: transparent;
                }
            </style>
        </head>
        <body onclick="window.close()">
            <button class="close-btn">닫기 ✕</button>
            <img src="${v.img}" alt="상품권 이미지">
        </body>
        </html>
    `);
    win.document.close(); // 이 줄이 있어야 브라우저가 로딩을 완료합니다.
};

window.quickDelete = async (id) => { if(confirm("정말 삭제할까요?")) await VOUCHER_COL.doc(id).delete(); };
window.markAsDone = async (id) => await VOUCHER_COL.doc(id).update({ isDone: true });
window.markAsActive = async (id) => await VOUCHER_COL.doc(id).update({ isDone: false });

function getDdayInfo(targetDate) {
    const diff = Math.ceil((new Date(targetDate) - new Date().setHours(0,0,0,0)) / (1000*60*60*24));
    if(diff < 0) return { text: `만료 ${Math.abs(diff)}일 경과`, isUrgent: true };
    if(diff === 0) return { text: "D-Day", isUrgent: true };
    if(diff <= 7) return { text: `D-${diff}`, isUrgent: true };
    return { text: `D-${diff}`, isUrgent: false };
}

window.showAddView = () => {
    isEditMode = false; currentVoucherId = null;
    document.getElementById('vName').value = "";
    document.getElementById('vTotal').value = "";
    document.getElementById('vExpiry').value = "";
    document.getElementById('imgEditBlock').classList.add('hidden');
    showView('view-form');
};

init();