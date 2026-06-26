const KEY_PENDING = "kid-quiz-pending";
const KEY_CHILD = "kid-quiz-child";
const KEY_QUIZ_DRAFT = "kid-quiz-draft";
const KEY_DUO_OPPONENT = "kid-quiz-duo-opponent";

export function getSelectedChild() {
  return sessionStorage.getItem(KEY_CHILD) || "A";
}

export function setSelectedChild(id) {
  sessionStorage.setItem(KEY_CHILD, id);
}

export function getDuoOpponent(activeChildId) {
  return sessionStorage.getItem(`${KEY_DUO_OPPONENT}:${activeChildId}`);
}

export function setDuoOpponent(activeChildId, opponentId) {
  sessionStorage.setItem(`${KEY_DUO_OPPONENT}:${activeChildId}`, opponentId);
}

export function loadPending() {
  try {
    const raw = localStorage.getItem(KEY_PENDING);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function savePending(list) {
  localStorage.setItem(KEY_PENDING, JSON.stringify(list));
}

export function addPending(entry) {
  const list = loadPending();
  list.push({
    ...entry,
    childId: entry.childId || entry.child,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });
  savePending(list);
  return list;
}

export function removePending(id) {
  const list = loadPending().filter((p) => p.id !== id);
  savePending(list);
  return list;
}

export function saveQuizDraft(draft) {
  try {
    sessionStorage.setItem(KEY_QUIZ_DRAFT, JSON.stringify(draft));
    return true;
  } catch (e) {
    console.warn("saveQuizDraft", e);
    return false;
  }
}

export function loadQuizDraft() {
  try {
    const raw = sessionStorage.getItem(KEY_QUIZ_DRAFT);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearQuizDraft() {
  sessionStorage.removeItem(KEY_QUIZ_DRAFT);
}
