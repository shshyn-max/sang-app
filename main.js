import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAlpQVSMkvLTLBJIJDLJuzAiX03eqWvEKE",
    authDomain: "my-todo-app-90eab.firebaseapp.com",
    projectId: "my-todo-app-90eab",
    storageBucket: "my-todo-app-90eab.firebasestorage.app",
    messagingSenderId: "61381291469",
    appId: "1:61381291469:web:a27b4addb3ba228d28e884"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const todosCollectionRef = collection(db, 'todos');

const form = document.getElementById('todo-form');
const input = document.getElementById('todo-input');
const dueDateInput = document.getElementById('todo-due-date');
const dueHourInput = document.getElementById('todo-due-hour');
const dueMinuteInput = document.getElementById('todo-due-minute');
const categoryInput = document.getElementById('todo-category'); // New
const list = document.getElementById('todo-list');
const emptyState = document.getElementById('empty-state');

const addModal = document.getElementById('add-modal');
const openModalBtn = document.getElementById('open-modal-btn');
const closeModalBtn = document.getElementById('close-modal-btn');

const completedModal = document.getElementById('completed-modal');
const openCompletedBtn = document.getElementById('open-completed-btn');
const closeCompletedBtn = document.getElementById('close-completed-btn');

let todos = [];
let editingId = null;
let editingContext = 'main'; // 'main' | 'completed'
let completedModalOpen = false;
let currentCategory = '회사'; // Default main tab
let currentCompletedCategory = '회사'; // Default completed tab

const deleteIcon = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>';
const editIcon = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>';
const saveIcon = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>';
const cancelIcon = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>';
const chevronIcon = '<svg class="chevron-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" /></svg>';

function formatDateTime(dateTimeStr) {
    if (!dateTimeStr) return '';
    const options = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return new Date(dateTimeStr).toLocaleString('ko-KR', options);
}

function isOverdue(dateTimeStr) {
    if (!dateTimeStr) return false;
    return new Date(dateTimeStr) < new Date();
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g,
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

function splitDateTime(dateTimeStr) {
    if (!dateTimeStr) return { date: '', hour: '00', minute: '00' };
    const [date, time] = dateTimeStr.split('T');
    const [hour, minute] = (time || '00:00').split(':');
    return { date, hour, minute };
}

function joinDateTime(date, hour, minute) {
    if (!date) return '';
    return `${date}T${hour}:${minute}`;
}

function roundTo10Minutes(dateTimeStr) {
    if (!dateTimeStr) return '';
    const date = new Date(dateTimeStr);
    if (isNaN(date.getTime())) return dateTimeStr;
    const minutes = date.getMinutes();
    const roundedMinutes = Math.round(minutes / 10) * 10;
    date.setMinutes(roundedMinutes);
    date.setSeconds(0);
    date.setMilliseconds(0);
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    // 브라우저 호환성을 위해 00분~50분으로 순환됩니다 (60분은 다음 시간 00분)
    return `${year}-${month}-${day}T${hours}:${mins}`;
}

function getTimestamp(todo) {
    if (todo.completedAt && todo.completedAt.toMillis) return todo.completedAt.toMillis();
    if (todo.completedAt) return new Date(todo.completedAt).getTime();
    if (todo.createdAt && todo.createdAt.toMillis) return todo.createdAt.toMillis();
    if (todo.createdAt) return new Date(todo.createdAt).getTime();
    return 0;
}

function getDateKey(todo) {
    if (todo.due) {
        return todo.due.split('T')[0];
    }
    let date;
    if (todo.completedAt && todo.completedAt.toDate) {
        date = todo.completedAt.toDate();
    } else if (todo.completedAt && todo.completedAt.seconds) {
        date = new Date(todo.completedAt.seconds * 1000);
    } else if (todo.createdAt && todo.createdAt.toDate) {
        date = todo.createdAt.toDate();
    } else if (todo.createdAt && todo.createdAt.seconds) {
        date = new Date(todo.createdAt.seconds * 1000);
    } else {
        date = new Date();
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`; // Local YYYY-MM-DD (정렬용 키)
}

function formatDateKey(key) {
    const [year, month, day] = key.split('-');
    return `${year}년 ${parseInt(month)}월 ${parseInt(day)}일`;
}

// ── 메인 리스트 렌더링 ──────────────────────────────────────
function renderTodos() {
    list.innerHTML = '';
    const activeTodos = todos.filter(t => !t.completed && t.category === currentCategory);

    if (activeTodos.length === 0) {
        emptyState.classList.add('visible');
    } else {
        emptyState.classList.remove('visible');
        activeTodos.forEach(todo => {
            const li = document.createElement('li');
            li.className = 'todo-item';
            li.id = `todo-${todo.id}`;

            const dueFormatted = formatDateTime(todo.due);
            const overdueClass = isOverdue(todo.due) ? 'overdue' : '';

            if (editingId === todo.id && editingContext === 'main') {
                const dt = splitDateTime(todo.due);
                li.innerHTML = `
                    <div class="todo-content edit-mode">
                        <input type="text" id="edit-input-${todo.id}" value="${escapeHTML(todo.text)}" class="edit-input" placeholder="할 일 수정">
                        <select id="edit-category-${todo.id}" class="edit-input" style="margin-top: 5px;">
                            <option value="회사" ${todo.category === '회사' ? 'selected' : ''}>회사</option>
                            <option value="집" ${todo.category === '집' ? 'selected' : ''}>집</option>
                            <option value="개인" ${todo.category === '개인' ? 'selected' : ''}>개인</option>
                            <option value="기타" ${todo.category === '기타' ? 'selected' : ''}>기타(선택없음)</option>
                        </select>
                        <div class="time-picker-container">
                            <input type="date" id="edit-due-date-${todo.id}" value="${dt.date}" class="edit-input">
                            <div class="time-selects">
                                <select id="edit-due-hour-${todo.id}" class="edit-input">
                                    ${Array.from({length:24}, (_,i)=>String(i).padStart(2,'0')).map(h=>`<option value="${h}" ${dt.hour===h?'selected':''}>${h}시</option>`).join('')}
                                </select>
                                <select id="edit-due-minute-${todo.id}" class="edit-input">
                                    ${['00','10','20','30','40','50'].map(m=>`<option value="${m}" ${dt.minute===m?'selected':''}>${m}분</option>`).join('')}
                                </select>
                            </div>
                        </div>
                    </div>
                    <div class="action-buttons">
                        <button class="action-btn save-btn" onclick="saveEditTodo('${todo.id}')" aria-label="Save edit">${saveIcon}</button>
                        <button class="action-btn cancel-btn" onclick="cancelEditTodo()" aria-label="Cancel edit">${cancelIcon}</button>
                    </div>`;
            } else {
                li.innerHTML = `
                    <label class="checkbox-container">
                        <input type="checkbox" ${todo.completed ? 'checked' : ''} onchange="toggleTodo('${todo.id}', ${!todo.completed})">
                        <span class="checkmark"></span>
                    </label>
                    <div class="todo-content">
                        <span class="todo-text">${escapeHTML(todo.text)}</span>
                        ${dueFormatted ? `<span class="todo-due ${overdueClass}">기한: ${escapeHTML(dueFormatted)}</span>` : ''}
                    </div>
                    <div class="action-buttons">
                        <button class="action-btn edit-btn" onclick="startEditTodo('${todo.id}')" aria-label="Edit task">${editIcon}</button>
                        <button class="action-btn delete-btn" onclick="deleteTodo('${todo.id}')" aria-label="Delete task">${deleteIcon}</button>
                    </div>`;
            }
            list.appendChild(li);
        });
    }
}

// ── 완료업무 리스트 렌더링 ──────────────────────────────────
function createCompletedItemHTML(todo) {
    const dueFormatted = formatDateTime(todo.due);

    if (editingId === todo.id && editingContext === 'completed') {
        const dt = splitDateTime(todo.due);
        return `
            <li class="todo-item completed" id="completed-${todo.id}">
                <div class="todo-content edit-mode">
                    <input type="text" id="edit-input-${todo.id}" value="${escapeHTML(todo.text)}" class="edit-input" placeholder="할 일 수정">
                    <select id="edit-category-${todo.id}" class="edit-input" style="margin-top: 5px;">
                        <option value="회사" ${todo.category === '회사' ? 'selected' : ''}>회사</option>
                        <option value="집" ${todo.category === '집' ? 'selected' : ''}>집</option>
                        <option value="개인" ${todo.category === '개인' ? 'selected' : ''}>개인</option>
                        <option value="기타" ${todo.category === '기타' ? 'selected' : ''}>기타(선택없음)</option>
                    </select>
                    <div class="time-picker-container">
                        <input type="date" id="edit-due-date-${todo.id}" value="${dt.date}" class="edit-input">
                        <div class="time-selects">
                            <select id="edit-due-hour-${todo.id}" class="edit-input">
                                ${Array.from({length:24}, (_,i)=>String(i).padStart(2,'0')).map(h=>`<option value="${h}" ${dt.hour===h?'selected':''}>${h}시</option>`).join('')}
                            </select>
                            <select id="edit-due-minute-${todo.id}" class="edit-input">
                                ${['00','10','20','30','40','50'].map(m=>`<option value="${m}" ${dt.minute===m?'selected':''}>${m}분</option>`).join('')}
                            </select>
                        </div>
                    </div>
                </div>
                <div class="action-buttons" style="opacity:1">
                    <button class="action-btn save-btn" onclick="saveEditTodo('${todo.id}')" aria-label="Save edit">${saveIcon}</button>
                    <button class="action-btn cancel-btn" onclick="cancelEditTodo()" aria-label="Cancel edit">${cancelIcon}</button>
                </div>
            </li>`;
    }

    return `
        <li class="todo-item completed" id="completed-${todo.id}">
            <label class="checkbox-container">
                <input type="checkbox" checked onchange="toggleTodo('${todo.id}', false)">
                <span class="checkmark"></span>
            </label>
            <div class="todo-content">
                <span class="todo-text">${escapeHTML(todo.text)}</span>
                ${dueFormatted ? `<span class="todo-due">${escapeHTML(dueFormatted)}</span>` : ''}
            </div>
            <div class="action-buttons">
                <button class="action-btn edit-btn" onclick="startEditCompletedTodo('${todo.id}')" aria-label="Edit task">${editIcon}</button>
                <button class="action-btn delete-btn" onclick="deleteTodo('${todo.id}')" aria-label="Delete task">${deleteIcon}</button>
            </div>
        </li>`;
}

function renderCompletedTodos() {
    const container = document.getElementById('completed-list-container');
    const completedTodos = todos.filter(t => t.completed && t.category === currentCompletedCategory);

    if (completedTodos.length === 0) {
        container.innerHTML = '<p class="empty-completed">완료된 업무가 없습니다.</p>';
        return;
    }

    // 날짜별 그룹핑
    const groups = {};
    completedTodos.forEach(todo => {
        const key = getDateKey(todo);
        if (!groups[key]) groups[key] = { todos: [], maxTimestamp: 0 };
        groups[key].todos.push(todo);
        const ts = getTimestamp(todo);
        if (ts > groups[key].maxTimestamp) groups[key].maxTimestamp = ts;
    });

    // 그룹을 날짜역순(최신 날짜 상단)으로 정렬
    const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

    container.innerHTML = '';

    sortedKeys.forEach((key, index) => {
        const isFirst = index === 0;
        const group = groups[key];

        // 그룹 내 항목도 최신순 정렬
        group.todos.sort((a, b) => getTimestamp(b) - getTimestamp(a));

        const todosHTML = group.todos.map(t => createCompletedItemHTML(t)).join('');

        const groupEl = document.createElement('div');
        groupEl.className = 'date-group';
        groupEl.innerHTML = `
            <button class="date-group-header ${isFirst ? 'expanded' : 'collapsed'}" onclick="toggleDateGroup(this)">
                <span>${formatDateKey(key)}</span>
                <span class="date-group-count">${group.todos.length}개</span>
                ${chevronIcon}
            </button>
            <ul class="date-group-list ${isFirst ? '' : 'hidden'}">
                ${todosHTML}
            </ul>`;
        container.appendChild(groupEl);
    });

    // 편집 중인 항목이 있으면 포커스
    if (editingId && editingContext === 'completed') {
        setTimeout(() => {
            const editInput = document.getElementById(`edit-input-${editingId}`);
            if (editInput) {
                editInput.focus();
                editInput.selectionStart = editInput.selectionEnd = editInput.value.length;
            }
        }, 0);
    }
}

function refreshRender() {
    renderTodos();
    if (completedModalOpen) renderCompletedTodos();
}

// ── Firestore 실시간 리스너 ─────────────────────────────────
const q = query(todosCollectionRef);
onSnapshot(q, (snapshot) => {
    todos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    // 마이그레이션: category가 없는 데이터 '기타'로 업데이트
    todos.forEach(todo => {
        if (!todo.category) {
            updateDoc(doc(db, 'todos', todo.id), { category: '기타' });
        }
    });

    // 생성일 기준 최신순 정렬 (미완료 목록용)
    todos.sort((a, b) => {
        const timeA = a.createdAt ? a.createdAt.toMillis() : Date.now();
        const timeB = b.createdAt ? b.createdAt.toMillis() : Date.now();
        return timeB - timeA;
    });

    refreshRender();
}, (error) => {
    console.error("Error fetching data:", error);
    if (error.code === 'failed-precondition') {
        alert("Firestore 인덱스 생성 오류: " + error.message);
    } else if (error.code === 'permission-denied') {
        alert("Firestore 권한 오류입니다. Rules 탭에서 읽기/쓰기 권한을 확인해주세요.");
    } else {
        alert("데이터를 불러오는데 실패했습니다: " + error.message);
    }
});

// ── Firestore CRUD ──────────────────────────────────────────
async function addTodo(text, due, category) {
    try {
        await addDoc(todosCollectionRef, {
            text,
            due,
            category,
            completed: false,
            createdAt: serverTimestamp()
        });
    } catch (e) {
        console.error("Error adding document: ", e);
        alert("할 일을 추가하는데 실패했습니다.");
    }
}

window.toggleTodo = async function(id, newStatus) {
    const todoDoc = doc(db, 'todos', id);
    try {
        const updateData = { completed: newStatus };
        updateData.completedAt = newStatus ? serverTimestamp() : null;
        await updateDoc(todoDoc, updateData);
    } catch (e) {
        console.error("Error updating document: ", e);
    }
};

window.deleteTodo = async function(id) {
    const element = document.getElementById(`todo-${id}`) || document.getElementById(`completed-${id}`);
    if (element) {
        element.style.animation = 'scaleOut 0.3s forwards';
    }
    setTimeout(async () => {
        const todoDoc = doc(db, 'todos', id);
        try {
            await deleteDoc(todoDoc);
        } catch (e) {
            console.error("Error deleting document: ", e);
        }
    }, 300);
};

// ── 편집 ───────────────────────────────────────────────────
window.startEditTodo = function(id) {
    editingId = id;
    editingContext = 'main';
    refreshRender();
    setTimeout(() => {
        const editInput = document.getElementById(`edit-input-${id}`);
        if (editInput) {
            editInput.focus();
            editInput.selectionStart = editInput.selectionEnd = editInput.value.length;
            editInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') saveEditTodo(id);
            });
        }
    }, 0);
};

window.startEditCompletedTodo = function(id) {
    editingId = id;
    editingContext = 'completed';
    renderCompletedTodos();
    setTimeout(() => {
        const editInput = document.getElementById(`edit-input-${id}`);
        if (editInput) {
            editInput.focus();
            editInput.selectionStart = editInput.selectionEnd = editInput.value.length;
            editInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') saveEditTodo(id);
            });
        }
    }, 0);
};

window.cancelEditTodo = function() {
    editingId = null;
    refreshRender();
};

window.saveEditTodo = async function(id) {
    const editInput = document.getElementById(`edit-input-${id}`);
    const editDueDateInput = document.getElementById(`edit-due-date-${id}`);
    const editDueHourInput = document.getElementById(`edit-due-hour-${id}`);
    const editDueMinuteInput = document.getElementById(`edit-due-minute-${id}`);
    const editCategoryInput = document.getElementById(`edit-category-${id}`);
    if (!editInput) return;

    const newText = editInput.value.trim();
    let newDue = '';
    if (editDueDateInput && editDueDateInput.value) {
        newDue = joinDateTime(editDueDateInput.value, editDueHourInput.value, editDueMinuteInput.value);
    }

    const newCategory = editCategoryInput ? editCategoryInput.value : '기타';

    if (newText === '') {
        cancelEditTodo();
        return;
    }

    editingId = null;
    refreshRender();

    const todoDoc = doc(db, 'todos', id);
    try {
        await updateDoc(todoDoc, { text: newText, due: newDue, category: newCategory });
    } catch (e) {
        console.error("Error updating document: ", e);
        alert("수정에 실패했습니다.");
    }
};

// ── 날짜 그룹 펼침/접기 ────────────────────────────────────
window.toggleDateGroup = function(btn) {
    const listEl = btn.nextElementSibling;
    if (btn.classList.contains('expanded')) {
        btn.classList.replace('expanded', 'collapsed');
        listEl.classList.add('hidden');
    } else {
        btn.classList.replace('collapsed', 'expanded');
        listEl.classList.remove('hidden');
    }
};

// ── 새작업 추가 모달 ───────────────────────────────────────
form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    let due = '';
    if (dueDateInput.value) {
        due = joinDateTime(dueDateInput.value, dueHourInput.value, dueMinuteInput.value);
    }

    const category = categoryInput.value;
    if (text !== '') {
        addTodo(text, due, category);
        input.value = '';
        dueDateInput.value = '';
        dueHourInput.value = '00';
        dueMinuteInput.value = '00';
        categoryInput.value = '기타';
        addModal.classList.remove('show');
    }
});

openModalBtn.addEventListener('click', () => {
    addModal.classList.add('show');
    setTimeout(() => input.focus(), 100);
});

const closeAddModal = () => {
    addModal.classList.remove('show');
    input.value = '';
    dueDateInput.value = '';
    dueHourInput.value = '00';
    dueMinuteInput.value = '00';
};

closeModalBtn.addEventListener('click', closeAddModal);

addModal.addEventListener('click', (e) => {
    if (e.target === addModal) closeAddModal();
});

// ── 완료업무 모달 ──────────────────────────────────────────
openCompletedBtn.addEventListener('click', () => {
    completedModalOpen = true;
    completedModal.classList.add('show');
    renderCompletedTodos();
});

const closeCompletedModal = () => {
    completedModalOpen = false;
    completedModal.classList.remove('show');
    if (editingContext === 'completed') {
        editingId = null;
        editingContext = 'main';
    }
};

closeCompletedBtn.addEventListener('click', closeCompletedModal);

completedModal.addEventListener('click', (e) => {
    if (e.target === completedModal) closeCompletedModal();
});

// ── 탭 전환 로직 ───────────────────────────────────────────
function setupTabs(containerId, isCompleted = false) {
    const container = document.getElementById(containerId);
    const buttons = container.querySelectorAll('.tab-btn');

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const category = btn.getAttribute('data-category');
            if (isCompleted) {
                currentCompletedCategory = category;
                renderCompletedTodos();
            } else {
                currentCategory = category;
                renderTodos();
            }
        });
    });
}

setupTabs('main-category-tabs');
setupTabs('completed-category-tabs', true);

setInterval(renderTodos, 60000);
