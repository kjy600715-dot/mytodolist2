/* =========================================================
 * My Tasks — script.js
 * 기본판(/)과 데스크톱판(/web_version/)이 같은 내용을 쓴다.
 * 이 파일을 고치면 web_version/script.js도 똑같이 고친다.
 *
 * 섹션: 1 상수 → 2 유틸리티 → 3 저장소 → 4 검증 → 5 상태
 *       → 6 변경 → 7 렌더링 → 8 이벤트 → 9 초기화
 * ========================================================= */
'use strict';

/* =========================================================
 * 1. 상수
 * ========================================================= */
const STORAGE_KEYS = Object.freeze({
  todos: 'todos',
  filter: 'todoFilter',
  sort: 'todoSort',
  theme: 'todoTheme',
  trash: 'todoTrash',
  corruptBackup: 'todos_corrupt_backup',
});

const CATEGORIES = Object.freeze({ work: '업무', personal: '개인', study: '공부' });
const CATEGORY_ORDER = Object.freeze(['work', 'personal', 'study']);
const FALLBACK_CATEGORY = 'personal';

/* 자동 분류 키워드: 모두 소문자, 두 글자 이상 (한 글자는 다른 단어 안에 들어가 오분류됨) */
const CATEGORY_KEYWORDS = Object.freeze({
  work: [
    '업무', '회의', '미팅', '보고서', '기획', '제안서', '발표', '출장', '결재', '이메일', '메일',
    '고객', '거래처', '계약', '프로젝트', '마감', '회사', '출근', '야근', '팀장', '견적', '예산',
    '매출', '정산', '세금계산서', '배포', '개발', '버그', '코드 리뷰', '엑셀', '기안', '인수인계',
    'meeting', 'report', 'email', 'client', 'project', 'deadline', 'invoice', 'presentation',
    'standup', 'deploy',
  ],
  personal: [
    '장보기', '마트', '운동', '헬스', '요가', '산책', '청소', '빨래', '설거지', '요리', '병원',
    '치과', '약국', '은행', '택배', '쇼핑', '생일', '선물', '가족', '부모님', '친구', '약속',
    '여행', '예약', '미용실', '공과금', '관리비', '세탁', '분리수거', '강아지', '고양이', '영화',
    'gym', 'grocery', 'laundry', 'dinner', 'doctor', 'workout', 'birthday',
  ],
  study: [
    '공부', '복습', '예습', '시험', '과제', '숙제', '강의', '수업', '인강', '토익', '토플', '단어',
    '암기', '영어', '수학', '독서', '자격증', '논문', '레포트', '문제집', '기출', '학원', '스터디',
    '알고리즘', '코딩테스트', '필기',
    'study', 'exam', 'homework', 'lecture', 'course', 'toeic', 'vocab', 'quiz', 'tutorial',
  ],
});

const FILTER_LABELS = Object.freeze({ all: '전체', ...CATEGORIES });
const SHORTCUT_FILTERS = Object.freeze({
  Digit1: 'all', Digit2: 'work', Digit3: 'personal', Digit4: 'study',
  Numpad1: 'all', Numpad2: 'work', Numpad3: 'personal', Numpad4: 'study',
});
const SORT_LABELS = Object.freeze({
  status: '완료 상태순',
  manual: '직접 정렬',
  newest: '생성일 최신순',
  oldest: '생성일 오래된순',
  category: '카테고리순',
});
const DEFAULT_SORT = 'status';

const MAX_TEXT_LENGTH = 200;
const TEXT_WARN_LENGTH = 180;
const MAX_TODOS = 5000;
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const EXPORT_VERSION = 1;
const MAX_TRASH = 10;
const SAVE_DELAY_MS = 300;
const TOAST_MS = 5000;
const DRAG_EDGE_PX = 64;
const DRAG_MAX_SPEED = 22;
const TOP_BAR_GAP_PX = 8;

const QUOTES = Object.freeze([
  { text: '천 리 길도 한 걸음부터.', author: '속담' },
  { text: '시작이 반이다.', author: '속담' },
  { text: '티끌 모아 태산.', author: '속담' },
  { text: '낙숫물이 댓돌을 뚫는다.', author: '속담' },
  { text: '구슬이 서 말이라도 꿰어야 보배.', author: '속담' },
  { text: '느리게 가는 것을 두려워 말고, 멈추는 것을 두려워하라.', author: '중국 속담' },
  { text: '아는 것이 힘이다.', author: '프랜시스 베이컨' },
  { text: '배우고 때로 익히면 또한 기쁘지 아니한가.', author: '공자' },
  { text: '지금 하지 않으면 언제 하겠는가?', author: '힐렐' },
  { text: '오늘 할 수 있는 일을 내일로 미루지 마라.', author: '벤저민 프랭클린' },
  { text: '잘 시작한 것은 절반을 이룬 것이다.', author: '아리스토텔레스' },
  { text: '성공은 매일 반복한 작은 노력의 합이다.', author: '로버트 콜리어' },
]);

/* =========================================================
 * 2. 유틸리티
 * ========================================================= */
function normalizeText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** 입력 문장에서 카테고리를 추정한다. 일치 수 1위가 하나일 때만 { category, keyword }, 아니면 null */
function suggestCategory(text) {
  const target = normalizeText(text);
  if (!target) return null;
  let best = null;
  let bestCount = 0;
  let tie = false;
  for (const category of CATEGORY_ORDER) {
    let count = 0;
    let first = null;
    for (const keyword of CATEGORY_KEYWORDS[category]) {
      if (target.includes(keyword)) {
        count += 1;
        first ??= keyword;
      }
    }
    if (count > bestCount) {
      best = { category, keyword: first };
      bestCount = count;
      tie = false;
    } else if (count > 0 && count === bestCount) {
      tie = true;
    }
  }
  return bestCount > 0 && !tie ? best : null;
}

function createId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* 보안 컨텍스트가 아니면 아래 방식 사용 */ }
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function localDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDate(iso) {
  const date = new Date(iso);
  if (date.getFullYear() === new Date().getFullYear()) return `${date.getMonth() + 1}월 ${date.getDate()}일`;
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
}

/** 검색어를 <mark>로 강조한다. 사용자 텍스트는 텍스트 노드로만 넣는다. */
function fillHighlighted(el, text, query) {
  el.textContent = '';
  if (!query) {
    el.textContent = text;
    return;
  }
  const lower = text.toLowerCase();
  const fragment = document.createDocumentFragment();
  let index = 0;
  while (index < text.length) {
    const found = lower.indexOf(query, index);
    if (found === -1) break;
    if (found > index) fragment.append(text.slice(index, found));
    const mark = document.createElement('mark');
    mark.textContent = text.slice(found, found + query.length);
    fragment.append(mark);
    index = found + query.length;
  }
  if (index < text.length) fragment.append(text.slice(index));
  el.append(fragment);
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function isTextField(el) {
  if (!el) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'reset', 'file'].includes(el.type);
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function readScrollPaddingTop() {
  const value = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop);
  return Number.isFinite(value) ? value : 0;
}

/* =========================================================
 * 3. 저장소 (localStorage 접근은 모두 이 래퍼를 거친다)
 * ========================================================= */
const storage = {
  available: (() => {
    try {
      const probe = '__my_tasks_probe__';
      localStorage.setItem(probe, probe);
      localStorage.removeItem(probe);
      return true;
    } catch {
      return false;
    }
  })(),
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.error('저장 실패', key, error);
      return false;
    }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* 무시 */ }
  },
};

/* =========================================================
 * 4. 검증 (저장소·가져오기 데이터는 모두 sanitizeTodos를 거친다)
 * ========================================================= */
function sanitizeTodo(raw, seenIds) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const text = typeof raw.text === 'string' ? raw.text.trim().slice(0, MAX_TEXT_LENGTH).trim() : '';
  if (!text) return null;

  let id = typeof raw.id === 'string' && raw.id.length > 0 && raw.id.length <= 100 ? raw.id : createId();
  while (seenIds.has(id)) id = createId();
  seenIds.add(id);

  const time = typeof raw.createdAt === 'string' ? Date.parse(raw.createdAt) : NaN;
  const createdAt = Number.isNaN(time) ? new Date().toISOString() : new Date(time).toISOString();
  const category = typeof raw.category === 'string' && Object.hasOwn(CATEGORIES, raw.category)
    ? raw.category : FALLBACK_CATEGORY;

  return { id, text, completed: raw.completed === true, createdAt, category };
}

/** 배열이 아니면 null. 아니면 { todos, dropped } */
function sanitizeTodos(raw, { seenIds = new Set(), limit = MAX_TODOS } = {}) {
  if (!Array.isArray(raw)) return null;
  const todos = [];
  let dropped = 0;
  for (const item of raw) {
    if (todos.length >= limit) {
      dropped += 1;
      continue;
    }
    const todo = sanitizeTodo(item, seenIds);
    if (todo) todos.push(todo);
    else dropped += 1;
  }
  return { todos, dropped };
}

function sanitizeTrash(raw) {
  if (!Array.isArray(raw)) return [];
  const entries = [];
  for (const entry of raw.slice(-MAX_TRASH)) {
    if (!entry || typeof entry !== 'object' || !Array.isArray(entry.items)) continue;
    const items = [];
    for (const item of entry.items) {
      const todo = sanitizeTodo(item?.todo, new Set());
      const index = Number.isInteger(item?.index) && item.index >= 0 ? item.index : 0;
      if (todo) items.push({ index, todo });
    }
    if (items.length > 0) {
      entries.push({ label: typeof entry.label === 'string' ? entry.label.slice(0, 40) : '삭제', items });
    }
  }
  return entries;
}

/* =========================================================
 * 5. 상태
 * ========================================================= */
const $ = (selector) => document.querySelector(selector);

const dom = {
  root: document.documentElement,
  banner: $('#storage-banner'),
  bannerText: $('#storage-banner-text'),
  bannerClose: $('#storage-banner-close'),
  remaining: $('#remaining-count'),
  themeToggle: $('#theme-toggle'),
  quoteText: $('#quote-text'),
  quoteAuthor: $('#quote-author'),
  progressBar: $('#progress-bar'),
  progressFill: $('#progress-fill'),
  progressPercent: $('#progress-percent'),
  progressText: $('#progress-text'),
  todayCount: $('#today-count'),
  cheer: $('#cheer'),
  catStats: [...document.querySelectorAll('.cat-stat')],
  filterBar: $('#filter-bar'),
  filterButtons: [...document.querySelectorAll('#filter-bar [data-filter]')],
  form: $('#todo-form'),
  input: $('#new-todo'),
  categorySelect: $('#category-select'),
  hint: $('#input-hint'),
  search: $('#search'),
  sortSelect: $('#sort-select'),
  listHeading: $('#list-heading'),
  list: $('#todo-list'),
  emptyState: $('#empty-state'),
  template: $('#todo-template'),
  undoBtn: $('#undo-btn'),
  clearCompletedBtn: $('#clear-completed-btn'),
  exportBtn: $('#export-btn'),
  importBtn: $('#import-btn'),
  importFile: $('#import-file'),
  importDialog: $('#import-dialog'),
  importSummary: $('#import-summary'),
  importBackup: $('#import-backup'),
  toast: $('#toast'),
  toastText: $('#toast-text'),
  toastAction: $('#toast-action'),
  announcer: $('#announcer'),
  topBar: document.querySelector('.workspace-top'), // 데스크톱판에만 있음. 기본판에서는 null
};

let todos = [];                 // 원본 데이터. 배열 순서 = 직접 정렬 순서
let trash = [];                 // 되돌리기 기록 [{ label, items: [{ index, todo }] }]
let filter = 'all';
let sort = DEFAULT_SORT;
let searchQuery = '';
let editingId = null;
let saveTimer = null;
let toastTimer = null;
let drag = null;
let pendingImport = null;
let hintMessage = null;         // 일시적인 힌트 { text, type, action? }

let manualCategory = dom.categorySelect.value; // 사용자가 마지막으로 직접 고른 카테고리
let categoryLocked = false;                    // 입력 중 직접 골랐으면 자동 분류 멈춤
let autoCategory = null;                       // 현재 자동 분류 결과

const itemCache = new Map(); // id → { el, sig }

/* =========================================================
 * 6. 변경
 * ========================================================= */
function findTodo(id) {
  return todos.find((todo) => todo.id === id) ?? null;
}

function commit() {
  scheduleSave();
  render();
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
}

function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!storage.set(STORAGE_KEYS.todos, JSON.stringify(todos))) {
    showBanner('할 일을 저장하지 못했습니다. 저장 공간이 부족할 수 있습니다. 내보내기로 백업해 두세요.', 'save');
    showToast('저장하지 못했습니다.', { type: 'error' });
  } else {
    hideBanner('save');
  }
}

function saveTrash() {
  storage.set(STORAGE_KEYS.trash, JSON.stringify(trash));
}

function pushTrash(label, items) {
  trash.push({ label, items });
  if (trash.length > MAX_TRASH) trash = trash.slice(-MAX_TRASH);
  saveTrash();
}

function loadTodos() {
  const raw = storage.get(STORAGE_KEYS.todos);
  if (raw === null) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
  }
  const result = sanitizeTodos(parsed);
  if (!result) {
    storage.set(STORAGE_KEYS.corruptBackup, raw);
    showBanner('저장된 데이터가 손상되어 읽지 못했습니다. 원본은 백업(todos_corrupt_backup)해 두었습니다.', 'corrupt');
    return [];
  }
  if (result.dropped > 0) {
    storage.set(STORAGE_KEYS.corruptBackup, raw);
    showBanner(`잘못된 항목 ${result.dropped}개를 건너뛰었습니다. 원본은 백업(todos_corrupt_backup)해 두었습니다.`, 'corrupt');
  }
  return result.todos;
}

function loadTrash() {
  try {
    return sanitizeTrash(JSON.parse(storage.get(STORAGE_KEYS.trash) ?? '[]'));
  } catch {
    return [];
  }
}

function findDuplicate(text) {
  const target = normalizeText(text);
  return todos.find((todo) => normalizeText(todo.text) === target) ?? null;
}

function addTodo(text, category) {
  const todo = {
    id: createId(),
    text: text.slice(0, MAX_TEXT_LENGTH),
    completed: false,
    createdAt: new Date().toISOString(),
    category: Object.hasOwn(CATEGORIES, category) ? category : FALLBACK_CATEGORY,
  };
  todos.unshift(todo);
  commit();
  return todo;
}

function toggleTodo(id) {
  const todo = findTodo(id);
  if (!todo) return;
  todo.completed = !todo.completed;
  commit();
  announce(`‘${todo.text}’ ${todo.completed ? '완료' : '완료 취소'}`);
}

function deleteTodo(id) {
  const index = todos.findIndex((todo) => todo.id === id);
  if (index === -1) return;
  if (editingId === id) finishEdit(false, { restoreFocus: false });

  const focusTarget = neighborFocusTarget(id);
  const [removed] = todos.splice(index, 1);
  pushTrash('삭제', [{ index, todo: removed }]);
  commit();
  (focusTarget?.isConnected ? focusTarget : dom.input).focus({ preventScroll: true });
  showToast(`‘${removed.text}’ 삭제했습니다.`, { action: { label: '되돌리기', onClick: undo } });
}

function clearCompleted() {
  const items = [];
  todos.forEach((todo, index) => {
    if (todo.completed) items.push({ index, todo });
  });
  if (items.length === 0) {
    showToast('완료된 할 일이 없습니다.');
    return;
  }
  if (editingId && items.some((item) => item.todo.id === editingId)) finishEdit(false, { restoreFocus: false });
  todos = todos.filter((todo) => !todo.completed);
  pushTrash('완료 항목 삭제', items);
  commit();
  showToast(`완료 항목 ${items.length}개를 삭제했습니다.`, { action: { label: '되돌리기', onClick: undo } });
}

function undo() {
  const entry = trash.pop();
  if (!entry) {
    showToast('되돌릴 작업이 없습니다.');
    return;
  }
  saveTrash();
  const existing = new Set(todos.map((todo) => todo.id));
  let restored = 0;
  for (const { index, todo } of [...entry.items].sort((a, b) => a.index - b.index)) {
    if (existing.has(todo.id) || todos.length >= MAX_TODOS) continue;
    todos.splice(Math.min(index, todos.length), 0, todo);
    restored += 1;
  }
  commit();
  showToast(`${entry.label}을(를) 되돌렸습니다. (${restored}개 복원)`);
}

/** 보이는 목록 기준으로 이웃 항목과 자리를 바꾼다 (키보드 ↑/↓). */
function moveTodo(id, direction) {
  const visible = getVisibleTodos();
  const from = visible.findIndex((todo) => todo.id === id);
  const to = from + direction;
  if (from === -1) return;
  if (to < 0 || to >= visible.length) {
    announce(direction < 0 ? '이미 맨 위입니다.' : '이미 맨 아래입니다.');
    return;
  }
  placeTodo(id, direction < 0 ? { before: visible[to].id } : { after: visible[to].id });
  commit();
  announce(`${to + 1}번째로 옮겼습니다.`);
}

/** id 항목을 원본 배열에서 다른 항목의 앞(before)이나 뒤(after)로 옮긴다. */
function placeTodo(id, { before = null, after = null }) {
  const index = todos.findIndex((todo) => todo.id === id);
  if (index === -1) return;
  const [todo] = todos.splice(index, 1);
  if (after) {
    todos.splice(todos.findIndex((item) => item.id === after) + 1, 0, todo);
  } else if (before) {
    const target = todos.findIndex((item) => item.id === before);
    todos.splice(target === -1 ? todos.length : target, 0, todo);
  } else {
    todos.splice(index, 0, todo);
  }
}

function setFilter(next) {
  if (!Object.hasOwn(FILTER_LABELS, next)) return;
  filter = next;
  storage.set(STORAGE_KEYS.filter, filter);
  render();
  announce(`${FILTER_LABELS[filter]} 필터`);
}

function setSort(next) {
  if (!Object.hasOwn(SORT_LABELS, next)) return;
  sort = next;
  dom.sortSelect.value = sort;
  storage.set(STORAGE_KEYS.sort, sort);
  render();
}

function applyTheme(theme) {
  const dark = theme === 'dark';
  dom.root.dataset.theme = dark ? 'dark' : 'light';
  dom.themeToggle.setAttribute('aria-pressed', String(dark));
  dom.themeToggle.setAttribute('aria-label', dark ? '라이트 모드로 바꾸기' : '다크 모드로 바꾸기');
  dom.themeToggle.querySelector('.theme-icon').textContent = dark ? '☀️' : '🌙';
  dom.themeToggle.querySelector('.theme-label').textContent = dark ? '라이트' : '다크';
}

function toggleTheme() {
  const next = dom.root.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  storage.set(STORAGE_KEYS.theme, next);
  announce(next === 'dark' ? '다크 모드' : '라이트 모드');
}

/* ---------- 가져오기 / 내보내기 ---------- */
function exportTodos() {
  const date = localDayKey(new Date());
  downloadJson(`my-tasks-${date}.json`, {
    app: 'My Tasks',
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    count: todos.length,
    todos,
  });
}

async function readImportFile(file) {
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) {
    showToast('파일이 너무 큽니다. 5MB 이하만 가져올 수 있습니다.', { type: 'error' });
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    showToast('JSON 파일을 읽지 못했습니다.', { type: 'error' });
    return;
  }
  if (parsed && !Array.isArray(parsed) && typeof parsed === 'object') {
    if (Number.isInteger(parsed.version) && parsed.version > EXPORT_VERSION) {
      showToast('이 앱보다 새로운 형식의 파일입니다.', { type: 'error' });
      return;
    }
    parsed = parsed.todos;
  }
  const result = sanitizeTodos(parsed, { limit: Infinity });
  if (!result || result.todos.length === 0) {
    showToast('가져올 수 있는 할 일이 없습니다.', { type: 'error' });
    return;
  }
  pendingImport = result;
  const skipped = result.dropped > 0 ? ` (잘못된 항목 ${result.dropped}개 제외)` : '';
  dom.importSummary.textContent = `파일에서 할 일 ${result.todos.length}개를 찾았습니다${skipped}. 지금 목록에는 ${todos.length}개가 있습니다.`;
  dom.importBackup.checked = todos.length > 0;
  dom.importBackup.disabled = todos.length === 0;
  dom.importDialog.returnValue = '';
  dom.importDialog.showModal();
}

function applyImport(mode, backup) {
  const incoming = pendingImport?.todos ?? [];
  pendingImport = null;
  if (incoming.length === 0) return;
  if (backup && todos.length > 0) exportTodos();
  if (editingId) finishEdit(false, { restoreFocus: false });

  let added = 0;
  let skipped = 0;
  if (mode === 'replace') {
    todos = incoming.slice(0, MAX_TODOS);
    added = todos.length;
    skipped = incoming.length - added;
  } else {
    const ids = new Set(todos.map((todo) => todo.id));
    for (const todo of incoming) {
      if (ids.has(todo.id) || todos.length >= MAX_TODOS) {
        skipped += 1;
        continue;
      }
      ids.add(todo.id);
      todos.push(todo);
      added += 1;
    }
  }
  commit();
  const extra = skipped > 0 ? ` (${skipped}개는 중복이거나 한도 ${MAX_TODOS}개를 넘어 제외)` : '';
  showToast(`${mode === 'replace' ? '대체' : '병합'}: ${added}개를 가져왔습니다.${extra}`);
}

/* =========================================================
 * 7. 렌더링
 * ========================================================= */
function getVisibleTodos() {
  const query = searchQuery.trim().toLowerCase();
  const list = todos.filter((todo) =>
    (filter === 'all' || todo.category === filter) && (!query || todo.text.toLowerCase().includes(query)));
  switch (sort) {
    case 'status':
      return list.sort((a, b) => Number(a.completed) - Number(b.completed));
    case 'newest':
      return list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    case 'oldest':
      return list.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
    case 'category':
      return list.sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));
    default:
      return list;
  }
}

function render() {
  const visible = getVisibleTodos();
  reconcileList(visible);
  renderStats();
  renderHeading(visible.length);
  renderEmptyState(visible.length);
  dom.undoBtn.disabled = trash.length === 0;
}

function signatureOf(todo, query) {
  return `${todo.text}\u0000${todo.completed}\u0000${todo.category}\u0000${todo.createdAt}\u0000${query}`;
}

/** 키 기반 렌더링: 항목을 id로 캐시하고, 서명이 바뀐 항목만 다시 그리며 순서만 맞춘다. */
function reconcileList(list) {
  const query = searchQuery.trim().toLowerCase();
  const active = document.activeElement;
  const keep = new Set();
  let cursor = dom.list.firstElementChild;

  dom.list.classList.toggle('is-manual', sort === 'manual');

  for (const todo of list) {
    keep.add(todo.id);
    let entry = itemCache.get(todo.id);
    if (!entry) {
      entry = { el: createItem(todo.id), sig: null };
      itemCache.set(todo.id, entry);
    }
    const sig = signatureOf(todo, query);
    if (entry.sig !== sig && todo.id !== editingId) {
      updateItem(entry.el, todo, query);
      entry.sig = sig;
    }
    if (entry.el === cursor) {
      cursor = cursor.nextElementSibling;
    } else {
      dom.list.insertBefore(entry.el, cursor);
    }
  }
  while (cursor) {
    const next = cursor.nextElementSibling;
    cursor.remove();
    cursor = next;
  }
  for (const [id, entry] of itemCache) {
    if (!keep.has(id)) {
      entry.el.remove();
      itemCache.delete(id);
    }
  }
  if (active && active !== document.activeElement && active.isConnected && dom.list.contains(active)) {
    active.focus({ preventScroll: true });
  }
}

function createItem(id) {
  const el = dom.template.content.firstElementChild.cloneNode(true);
  el.dataset.id = id;
  return el;
}

function updateItem(el, todo, query) {
  const label = CATEGORIES[todo.category];
  el.dataset.category = todo.category;
  el.classList.toggle('is-completed', todo.completed);

  const check = el.querySelector('.todo-check');
  check.checked = todo.completed;
  check.setAttribute('aria-label', `완료: ${todo.text}`);

  fillHighlighted(el.querySelector('.todo-text'), todo.text, query);
  el.querySelector('.cat-badge').textContent = label;

  const time = el.querySelector('.todo-date');
  time.dateTime = todo.createdAt;
  time.textContent = formatDate(todo.createdAt);
  time.title = new Date(todo.createdAt).toLocaleString('ko-KR');

  el.querySelector('.drag-handle').setAttribute('aria-label', `순서 바꾸기: ${todo.text} (위·아래 화살표)`);
  el.querySelector('.edit-btn').setAttribute('aria-label', `수정: ${todo.text}`);
  el.querySelector('.delete-btn').setAttribute('aria-label', `삭제: ${todo.text}`);
}

function renderStats() {
  const todayKey = localDayKey(new Date());
  const perCategory = Object.fromEntries(CATEGORY_ORDER.map((category) => [category, { total: 0, done: 0 }]));
  let done = 0;
  let today = 0;
  for (const todo of todos) {
    const stat = perCategory[todo.category];
    stat.total += 1;
    if (todo.completed) {
      done += 1;
      stat.done += 1;
    }
    if (localDayKey(new Date(todo.createdAt)) === todayKey) today += 1;
  }
  const total = todos.length;
  const percent = total ? Math.round((done / total) * 100) : 0;

  dom.remaining.textContent = `남은 할 일 ${total - done}개`;
  dom.progressPercent.textContent = `${percent}%`;
  dom.progressFill.style.width = `${percent}%`;
  dom.progressBar.setAttribute('aria-valuenow', String(percent));
  dom.progressBar.setAttribute('aria-valuetext', `${total}개 중 ${done}개 완료, ${percent}%`);
  dom.progressText.textContent = `${done}/${total} 완료`;
  dom.todayCount.textContent = String(today);
  dom.cheer.textContent = cheerMessage(total, percent);

  for (const card of dom.catStats) {
    const stat = perCategory[card.dataset.category];
    if (!stat) continue;
    const pct = stat.total ? Math.round((stat.done / stat.total) * 100) : 0;
    card.querySelector('[data-role="count"]').textContent = `${stat.done}/${stat.total}`;
    card.querySelector('[data-role="fill"]').style.width = `${pct}%`;
    card.setAttribute('aria-label', `${CATEGORIES[card.dataset.category]} ${stat.total}개 중 ${stat.done}개 완료`);
  }

  for (const button of dom.filterButtons) {
    const key = button.dataset.filter;
    button.setAttribute('aria-pressed', String(key === filter));
    button.querySelector('.filter-count').textContent = String(key === 'all' ? total : perCategory[key]?.total ?? 0);
  }
  dom.clearCompletedBtn.disabled = done === 0;
}

function cheerMessage(total, percent) {
  if (total === 0) return '첫 할 일을 추가해 보세요!';
  if (percent === 100) return '모두 끝냈어요! 🎉';
  if (percent >= 70) return '거의 다 왔어요. 조금만 더!';
  if (percent >= 30) return '잘하고 있어요. 계속 가 볼까요?';
  if (percent > 0) return '좋은 출발이에요!';
  return '하나씩 시작해 봐요.';
}

function renderHeading(count) {
  const query = searchQuery.trim();
  const title = query ? '검색 결과' : `${FILTER_LABELS[filter]} 할 일`;
  dom.listHeading.textContent = `${title} `;
  const span = document.createElement('span');
  span.className = 'heading-count';
  span.textContent = `${count}개 · ${SORT_LABELS[sort]}`;
  dom.listHeading.append(span);
}

function renderEmptyState(count) {
  dom.emptyState.hidden = count > 0;
  if (count > 0) return;
  const query = searchQuery.trim();
  if (todos.length === 0) dom.emptyState.textContent = '할 일이 없습니다. 입력창에 첫 할 일을 적어 보세요.';
  else if (query) dom.emptyState.textContent = `‘${query}’에 맞는 할 일이 없습니다.`;
  else dom.emptyState.textContent = `${FILTER_LABELS[filter]} 카테고리에 할 일이 없습니다.`;
}

/* ---------- 입력 힌트 ---------- */
function setInputHint(text, type = 'default', action = null) {
  dom.hint.textContent = '';
  dom.hint.dataset.type = type;
  const span = document.createElement('span');
  span.textContent = text;
  dom.hint.append(span);
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hint-action';
    button.textContent = action.label;
    button.addEventListener('click', action.onClick);
    dom.hint.append(button);
  }
  dom.hint.title = text;
}

/** 힌트 우선순위: 일시 메시지 > 글자 수 경고 > 자동 분류 > 기본 */
function updateInputHint() {
  if (hintMessage) {
    setInputHint(hintMessage.text, hintMessage.type, hintMessage.action);
    return;
  }
  const length = dom.input.value.length;
  if (length >= TEXT_WARN_LENGTH) {
    setInputHint(`글자 수 ${length}/${MAX_TEXT_LENGTH}`, 'warn');
  } else if (autoCategory && !categoryLocked) {
    setInputHint(`자동 분류: ${CATEGORIES[autoCategory.category]} (‘${autoCategory.keyword}’)`, 'auto');
  } else if (categoryLocked) {
    setInputHint(`직접 고른 카테고리: ${CATEGORIES[dom.categorySelect.value]}`, 'default');
  } else {
    setInputHint('Enter로 추가 · 카테고리는 입력 내용으로 자동 선택됩니다', 'default');
  }
}

/* ---------- 알림 ---------- */
function announce(message) {
  dom.announcer.textContent = '';
  setTimeout(() => { dom.announcer.textContent = message; }, 30);
}

function showToast(message, { action = null, type = 'default' } = {}) {
  clearTimeout(toastTimer);
  dom.toastText.textContent = message;
  dom.toast.dataset.type = type;
  dom.toastAction.hidden = !action;
  dom.toastAction.onclick = null;
  if (action) {
    dom.toastAction.textContent = action.label;
    dom.toastAction.onclick = () => {
      hideToast();
      action.onClick();
    };
  }
  dom.toast.classList.add('is-visible');
  toastTimer = setTimeout(hideToast, TOAST_MS);
}

function hideToast() {
  clearTimeout(toastTimer);
  dom.toast.classList.remove('is-visible');
}

function showBanner(message, kind) {
  dom.banner.dataset.kind = kind;
  dom.bannerText.textContent = message;
  dom.banner.hidden = false;
}

function hideBanner(kind) {
  if (!kind || dom.banner.dataset.kind === kind) dom.banner.hidden = true;
}

function highlightTodo(id) {
  const el = itemCache.get(id)?.el;
  if (!el?.isConnected) return false;
  el.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  el.classList.remove('flash');
  void el.offsetWidth; // 애니메이션 다시 시작
  el.classList.add('flash');
  el.addEventListener('animationend', () => el.classList.remove('flash'), { once: true });
  return true;
}

function neighborFocusTarget(id) {
  const el = itemCache.get(id)?.el;
  const neighbor = el?.nextElementSibling ?? el?.previousElementSibling;
  return neighbor?.querySelector('.todo-check') ?? null;
}

/* =========================================================
 * 8. 이벤트
 * ========================================================= */

/* ---------- 자동 카테고리 분류 ---------- */
function applyAutoCategory() {
  const value = dom.input.value;
  if (!value.trim()) categoryLocked = false;
  if (categoryLocked) return;
  autoCategory = suggestCategory(value);
  dom.categorySelect.value = autoCategory?.category ?? manualCategory;
  dom.categorySelect.toggleAttribute('data-auto', autoCategory !== null);
}

function onInput() {
  hintMessage = null;
  applyAutoCategory();
  updateInputHint();
}

function onCategoryChange() {
  manualCategory = dom.categorySelect.value;
  categoryLocked = dom.input.value.trim() !== '';
  autoCategory = null;
  dom.categorySelect.removeAttribute('data-auto');
  hintMessage = null;
  updateInputHint();
}

function submitNewTodo(force = false) {
  const text = dom.input.value.trim();
  if (!text) {
    hintMessage = { text: '할 일을 입력하세요.', type: 'error' };
    updateInputHint();
    dom.input.focus();
    return;
  }
  if (todos.length >= MAX_TODOS) {
    hintMessage = { text: `할 일은 최대 ${MAX_TODOS}개까지 저장할 수 있습니다.`, type: 'error' };
    updateInputHint();
    return;
  }
  if (!force) {
    const duplicate = findDuplicate(text);
    if (duplicate) {
      const shown = highlightTodo(duplicate.id);
      hintMessage = {
        text: shown ? '이미 같은 할 일이 있습니다.' : '이미 같은 할 일이 있습니다 (지금 보기에서는 숨겨져 있음).',
        type: 'warn',
        action: { label: '그래도 추가', onClick: () => submitNewTodo(true) },
      };
      updateInputHint();
      return;
    }
  }

  const todo = addTodo(text, dom.categorySelect.value);
  dom.input.value = '';
  hintMessage = null;
  applyAutoCategory();
  updateInputHint();
  dom.input.focus();

  const visible = itemCache.get(todo.id)?.el?.isConnected;
  if (visible) itemCache.get(todo.id).el.scrollIntoView({ block: 'nearest' });
  announce(`‘${todo.text}’ 추가 (${CATEGORIES[todo.category]})${visible ? '' : ' — 지금 필터나 검색에서는 보이지 않습니다'}`);
}

/* ---------- 인라인 수정 ---------- */
function startEdit(id) {
  if (editingId === id) return;
  if (editingId) finishEdit(true, { restoreFocus: false });
  const entry = itemCache.get(id);
  const todo = findTodo(id);
  if (!entry || !todo) return;

  editingId = id;
  const textEl = entry.el.querySelector('.todo-text');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'todo-edit';
  input.maxLength = MAX_TEXT_LENGTH;
  input.value = todo.text;
  input.setAttribute('aria-label', '할 일 수정 (Enter 저장, Esc 취소)');
  textEl.hidden = true;
  textEl.after(input);
  entry.el.classList.add('is-editing');
  input.focus();
  input.select();
}

function finishEdit(save, { restoreFocus = true } = {}) {
  if (!editingId) return;
  const id = editingId;
  editingId = null;
  const entry = itemCache.get(id);
  const input = entry?.el.querySelector('.todo-edit');
  const value = input?.value ?? '';
  input?.remove();
  if (entry) {
    entry.el.classList.remove('is-editing');
    entry.el.querySelector('.todo-text').hidden = false;
    entry.sig = null;
  }

  const todo = findTodo(id);
  const text = value.trim().slice(0, MAX_TEXT_LENGTH);
  if (save && todo && text && text !== todo.text) {
    todo.text = text;
    commit();
    announce('수정했습니다.');
  } else {
    if (save && todo && !text) showToast('빈 내용으로는 바꿀 수 없어 원래대로 두었습니다.');
    render();
  }
  if (restoreFocus) entry?.el.querySelector('.edit-btn')?.focus();
}

/* ---------- 드래그 정렬 (Pointer Events) ---------- */
function startDrag(event, handle) {
  if (sort !== 'manual' || event.button !== 0 || drag) return;
  const el = handle.closest('.todo-item');
  if (!el) return;
  if (editingId) finishEdit(true, { restoreFocus: false });
  event.preventDefault();

  const rect = el.getBoundingClientRect();
  drag = {
    id: el.dataset.id,
    el,
    pointerId: event.pointerId,
    y: event.clientY,
    grabOffset: event.clientY - rect.top,
    topInset: readScrollPaddingTop(), // 데스크톱판: 고정 바 높이. 기본판: 0
    moved: false,
    raf: 0,
  };
  try { handle.setPointerCapture(event.pointerId); } catch { /* 무시 */ }
  el.classList.add('dragging');
  document.body.classList.add('is-dragging');
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd);
  window.addEventListener('pointercancel', onDragCancel);
  window.addEventListener('blur', onDragCancel);
  drag.raf = requestAnimationFrame(dragFrame);
}

function onDragMove(event) {
  if (drag && event.pointerId === drag.pointerId) drag.y = event.clientY;
}

function onDragEnd(event) {
  if (drag && event.pointerId === drag.pointerId) endDrag(true);
}

function onDragCancel() {
  if (drag) endDrag(false);
}

function dragFrame() {
  if (!drag) return;
  const top = drag.topInset + DRAG_EDGE_PX;
  const bottom = window.innerHeight - DRAG_EDGE_PX;
  let dy = 0;
  if (drag.y < top) dy = -Math.min(DRAG_MAX_SPEED, Math.ceil((top - drag.y) / 3));
  else if (drag.y > bottom) dy = Math.min(DRAG_MAX_SPEED, Math.ceil((drag.y - bottom) / 3));
  if (dy !== 0) window.scrollBy(0, dy);
  updateDragPosition();
  drag.raf = requestAnimationFrame(dragFrame);
}

/** 이웃 항목을 옮겨 자리를 만든다 (끌고 있는 요소 자체는 옮기지 않아 포인터 캡처가 유지됨). */
function updateDragPosition() {
  const { el } = drag;
  const middle = (node) => {
    const rect = node.getBoundingClientRect();
    return rect.top + rect.height / 2;
  };
  let prev = el.previousElementSibling;
  while (prev && drag.y < middle(prev)) {
    dom.list.insertBefore(prev, el.nextElementSibling);
    prev = el.previousElementSibling;
    drag.moved = true;
  }
  let next = el.nextElementSibling;
  while (next && drag.y > middle(next)) {
    dom.list.insertBefore(next, el);
    next = el.nextElementSibling;
    drag.moved = true;
  }
  el.style.transform = '';
  const natural = el.getBoundingClientRect().top;
  el.style.transform = `translateY(${drag.y - drag.grabOffset - natural}px)`;
}

function endDrag(save) {
  const { el, id, moved, raf } = drag;
  cancelAnimationFrame(raf);
  drag = null;
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragEnd);
  window.removeEventListener('pointercancel', onDragCancel);
  window.removeEventListener('blur', onDragCancel);
  el.classList.remove('dragging');
  el.style.transform = '';
  document.body.classList.remove('is-dragging');

  if (save && moved) {
    const prevId = el.previousElementSibling?.dataset.id ?? null;
    const nextId = el.nextElementSibling?.dataset.id ?? null;
    placeTodo(id, prevId ? { after: prevId } : { before: nextId });
    commit();
    const position = [...dom.list.children].indexOf(el) + 1;
    announce(`${position}번째로 옮겼습니다.`);
  } else {
    render(); // 취소: 원래 순서로 되돌림
  }
}

/* ---------- 이벤트 연결 ---------- */
function bindEvents() {
  dom.form.addEventListener('submit', (event) => {
    event.preventDefault();
    submitNewTodo();
  });
  dom.input.addEventListener('input', onInput);
  dom.categorySelect.addEventListener('change', onCategoryChange);

  dom.search.addEventListener('input', () => {
    searchQuery = dom.search.value;
    render();
  });
  dom.sortSelect.addEventListener('change', () => setSort(dom.sortSelect.value));
  dom.filterBar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-filter]');
    if (button) setFilter(button.dataset.filter);
  });
  dom.themeToggle.addEventListener('click', toggleTheme);

  // 목록: 이벤트 위임
  dom.list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    const item = event.target.closest('.todo-item');
    if (!button || !item) return;
    if (button.dataset.action === 'edit') startEdit(item.dataset.id);
    else if (button.dataset.action === 'delete') deleteTodo(item.dataset.id);
  });
  dom.list.addEventListener('change', (event) => {
    if (!event.target.matches('.todo-check')) return;
    toggleTodo(event.target.closest('.todo-item').dataset.id);
  });
  dom.list.addEventListener('dblclick', (event) => {
    const text = event.target.closest('.todo-text');
    if (text) startEdit(text.closest('.todo-item').dataset.id);
  });
  dom.list.addEventListener('keydown', (event) => {
    if (event.target.matches('.todo-edit')) {
      if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        finishEdit(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finishEdit(false);
      }
      return;
    }
    if (event.target.matches('.drag-handle') && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      if (sort !== 'manual') return;
      const handle = event.target;
      moveTodo(handle.closest('.todo-item').dataset.id, event.key === 'ArrowUp' ? -1 : 1);
      handle.focus({ preventScroll: true });
      handle.closest('.todo-item').scrollIntoView({ block: 'nearest' });
    }
  });
  dom.list.addEventListener('focusout', (event) => {
    if (event.target.matches('.todo-edit')) finishEdit(true, { restoreFocus: false });
  });
  dom.list.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('.drag-handle');
    if (handle) startDrag(event, handle);
  });

  // 목록 관리
  dom.undoBtn.addEventListener('click', undo);
  dom.clearCompletedBtn.addEventListener('click', clearCompleted);
  dom.exportBtn.addEventListener('click', exportTodos);
  dom.importBtn.addEventListener('click', () => dom.importFile.click());
  dom.importFile.addEventListener('change', async () => {
    const [file] = dom.importFile.files;
    dom.importFile.value = '';
    await readImportFile(file);
  });
  dom.importDialog.addEventListener('close', () => {
    if (dom.importDialog.returnValue === 'confirm') {
      const mode = dom.importDialog.querySelector('input[name="import-mode"]:checked')?.value ?? 'merge';
      applyImport(mode, dom.importBackup.checked);
    } else {
      pendingImport = null;
    }
    dom.importBtn.focus();
  });
  dom.bannerClose.addEventListener('click', () => hideBanner());

  // 단축키 (키보드 배열·한글 입력기와 상관없이 e.code 기준)
  document.addEventListener('keydown', (event) => {
    if (drag && event.key === 'Escape') {
      event.preventDefault();
      endDrag(false);
      return;
    }
    if (dom.importDialog.open) return;
    if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      if (event.code === 'KeyN') {
        event.preventDefault();
        dom.input.focus();
      } else if (event.code === 'KeyD') {
        event.preventDefault();
        toggleTheme();
      } else if (Object.hasOwn(SHORTCUT_FILTERS, event.code)) {
        event.preventDefault();
        setFilter(SHORTCUT_FILTERS[event.code]);
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.code === 'KeyZ') {
      if (isTextField(document.activeElement)) return; // 입력창에서는 브라우저 기본 되돌리기
      event.preventDefault();
      undo();
    }
  });

  // 다른 탭과 동기화
  window.addEventListener('storage', (event) => {
    if (event.storageArea !== localStorage) return;
    if (event.key === STORAGE_KEYS.todos || event.key === null) {
      clearTimeout(saveTimer);
      saveTimer = null;
      if (editingId) finishEdit(false, { restoreFocus: false });
      if (drag) endDrag(false);
      todos = loadTodos();
      render();
      announce('다른 탭에서 바뀐 목록을 불러왔습니다.');
    }
    if (event.key === STORAGE_KEYS.trash || event.key === null) {
      trash = loadTrash();
      dom.undoBtn.disabled = trash.length === 0;
    }
    if (event.key === STORAGE_KEYS.theme && (event.newValue === 'light' || event.newValue === 'dark')) {
      applyTheme(event.newValue);
    }
  });

  // 페이지를 떠날 때 예약된 저장을 바로 실행
  window.addEventListener('pagehide', () => { if (saveTimer) saveNow(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && saveTimer) saveNow();
  });
}

/* ---------- 데스크톱판: 고정 바 높이 추종 ---------- */
function observeTopBar() {
  if (!dom.topBar || typeof ResizeObserver === 'undefined') return;
  const update = () => {
    const height = dom.topBar.offsetHeight;
    if (height > 0) dom.root.style.setProperty('--top-bar-space', `${height + TOP_BAR_GAP_PX}px`);
  };
  new ResizeObserver(update).observe(dom.topBar);
  update();
}

/* =========================================================
 * 9. 초기화
 * ========================================================= */
function renderQuote() {
  const now = new Date();
  const day = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
  const quote = QUOTES[day % QUOTES.length];
  dom.quoteText.textContent = quote.text;
  dom.quoteAuthor.textContent = quote.author;
}

function init() {
  if (!storage.available) {
    showBanner('이 브라우저에서는 저장소를 쓸 수 없어, 새로고침하면 할 일이 사라집니다.', 'unavailable');
  }
  todos = loadTodos();
  trash = loadTrash();

  const storedFilter = storage.get(STORAGE_KEYS.filter);
  filter = Object.hasOwn(FILTER_LABELS, storedFilter ?? '') ? storedFilter : 'all';
  const storedSort = storage.get(STORAGE_KEYS.sort);
  sort = Object.hasOwn(SORT_LABELS, storedSort ?? '') ? storedSort : DEFAULT_SORT;
  dom.sortSelect.value = sort;

  applyTheme(dom.root.dataset.theme === 'dark' ? 'dark' : 'light');
  renderQuote();
  bindEvents();
  observeTopBar();
  applyAutoCategory();
  updateInputHint();
  render();
}

init();
