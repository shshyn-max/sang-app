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
const dueInput = document.getElementById('todo-due');
const list = document.getElementById('todo-list');
const emptyState = document.getElementById('empty-state');

const addModal = document.getElementById('add-modal');
const openModalBtn = document.getElementById('open-modal-btn');
const closeModalBtn = document.getElementById('close-modal-btn');

let todos = []; // 로컬 데이터 복제본 (UI 렌더링용)
let editingId = null; // 현재 편집 중인 항목 ID

const deleteIcon = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>';
const editIcon = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>';
const saveIcon = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>';
const cancelIcon = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>';

function formatDateTime(dateTimeStr) {
    if (!dateTimeStr) return '';
    const options = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return new Date(dateTimeStr).toLocaleString('ko-KR', options);
}

function isOverdue(dateTimeStr) {
    if (!dateTimeStr) return false;
    return new Date(dateTimeStr) < new Date();
}

function renderTodos() {
    list.innerHTML = '';
    
    if (todos.length === 0) {
        emptyState.classList.add('visible');
    } else {
        emptyState.classList.remove('visible');
        todos.forEach(todo => {
            const li = document.createElement('li');
            li.className = `todo-item ${todo.completed ? 'completed' : ''}`;
            li.id = `todo-${todo.id}`;
            
            const dueFormatted = formatDateTime(todo.due);
            const overdueClass = (!todo.completed && isOverdue(todo.due)) ? 'overdue' : '';
            
            if (editingId === todo.id) {
                li.innerHTML = `
                    <div class="todo-content edit-mode">
                        <input type="text" id="edit-input-${todo.id}" value="${escapeHTML(todo.text)}" class="edit-input" placeholder="할 일 수정">
                        <input type="datetime-local" id="edit-due-${todo.id}" value="${todo.due || ''}" class="edit-input edit-due-input" aria-label="기한 수정">
                    </div>
                    <div class="action-buttons">
                        <button class="action-btn save-btn" onclick="saveEditTodo('${todo.id}')" aria-label="Save edit">
                            ${saveIcon}
                        </button>
                        <button class="action-btn cancel-btn" onclick="cancelEditTodo()" aria-label="Cancel edit">
                            ${cancelIcon}
                        </button>
                    </div>
                `;
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
                        <button class="action-btn edit-btn" onclick="startEditTodo('${todo.id}')" aria-label="Edit task">
                            ${editIcon}
                        </button>
                        <button class="action-btn delete-btn" onclick="deleteTodo('${todo.id}')" aria-label="Delete task">
                            ${deleteIcon}
                        </button>
                    </div>
                `;
            }
            list.appendChild(li);
        });
    }
}

// Firestore 실시간 리스너 추가 (데이터 읽기)
// 참고: 초기 인덱스 생성 문제를 피하기 위해 orderBy를 쿼리 레벨에서 제거하고 JS 배열에서 정렬
const q = query(todosCollectionRef);
onSnapshot(q, (snapshot) => {
    todos = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));
    
    // 프론트엔드에서 최신순으로 정렬
    todos.sort((a, b) => {
        const timeA = a.createdAt ? a.createdAt.toMillis() : Date.now();
        const timeB = b.createdAt ? b.createdAt.toMillis() : Date.now();
        return timeB - timeA;
    });
    
    renderTodos();
}, (error) => {
    console.error("Error fetching data:", error);
    if (error.code === 'failed-precondition') {
        alert("Firestore 인덱스 생성 오류이거나 초기 설정 문제입니다: " + error.message);
    } else if (error.code === 'permission-denied') {
        alert("Firestore 권한 오류입니다. Firebase Console의 'Firestore Database' > '규칙(Rules)' 탭에서 읽기/쓰기 권한을 확인해주세요.");
    } else {
        alert("데이터를 불러오는데 실패했습니다: " + error.message);
    }
});

// Firestore 데이터 추가
async function addTodo(text, due) {
    try {
        await addDoc(todosCollectionRef, {
            text: text,
            due: due,
            completed: false,
            createdAt: serverTimestamp()
        });
    } catch (e) {
        console.error("Error adding document: ", e);
        alert("할 일을 추가하는데 실패했습니다. Firestore 설정을 확인해주세요.");
    }
}

// 전역 스코프에 함수 노출 (모듈 스코프 해결)
window.startEditTodo = function(id) {
    editingId = id;
    renderTodos();
    
    // 렌더링 후 인풋에 포커스 주입
    setTimeout(() => {
        const editInput = document.getElementById(`edit-input-${id}`);
        if (editInput) {
            editInput.focus();
            // 커서를 맨 끝으로
            editInput.selectionStart = editInput.selectionEnd = editInput.value.length;
            
            // 엔터 키 처리
            editInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    saveEditTodo(id);
                }
            });
        }
    }, 0);
};

window.cancelEditTodo = function() {
    editingId = null;
    renderTodos();
};

window.saveEditTodo = async function(id) {
    const editInput = document.getElementById(`edit-input-${id}`);
    const editDueInput = document.getElementById(`edit-due-${id}`);
    if (!editInput) return;
    
    const newText = editInput.value.trim();
    const newDue = editDueInput ? editDueInput.value : '';
    
    if (newText === '') {
        cancelEditTodo();
        return;
    }

    const todoDoc = doc(db, 'todos', id);
    try {
        // 파이어베이스 통신 완료를 기다리지 않고 화면의 편집 모드를 즉시 닫음
        editingId = null;
        renderTodos(); 
        
        await updateDoc(todoDoc, { 
            text: newText,
            due: newDue 
        });
        // updateDoc 호출 직후 파이어베이스 onSnapshot이 새 데이터를 기반으로 화면을 다시 그려줌
    } catch (e) {
        console.error("Error updating document: ", e);
        alert("수정에 실패했습니다.");
    }
};

window.toggleTodo = async function(id, newStatus) {
    const todoDoc = doc(db, 'todos', id);
    try {
        await updateDoc(todoDoc, { completed: newStatus });
    } catch (e) {
        console.error("Error updating document: ", e);
    }
};

window.deleteTodo = async function(id) {
    const element = document.getElementById(`todo-${id}`);
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

form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    const due = dueInput.value;
    if (text !== '') {
        addTodo(text, due);
        input.value = '';
        dueInput.value = ''; 
        // 값 초기화 후 모달 닫기
        addModal.classList.remove('show');
    }
});

// 모달 제어 로직
openModalBtn.addEventListener('click', () => {
    addModal.classList.add('show');
    setTimeout(() => input.focus(), 100); // 애니메이션 후 포커스
});

const closeAddModal = () => {
    addModal.classList.remove('show');
    input.value = '';
    dueInput.value = '';
};

 близModalBtn.addEventListener('click', closeAddModal);

// 모달 밖 배경 클릭 시 닫기
addModal.addEventListener('click', (e) => {
    if (e.target === addModal) {
        closeAddModal();
    }
});

setInterval(renderTodos, 60000);

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}
