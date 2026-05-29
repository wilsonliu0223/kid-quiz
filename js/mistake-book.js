const KEY = "kid-quiz-mistakes";

function loadStore() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStore(store) {
  localStorage.setItem(KEY, JSON.stringify(store));
}

function childBucket(store, childId) {
  const id = childId || "A";
  if (!store[id]) store[id] = { zh: {}, en: {} };
  return store[id];
}

export function mistakeKey(subject, expected) {
  const exp = String(expected || "").trim();
  if (!exp) return "";
  return subject === "en" ? `en:${exp.toLowerCase()}` : `zh:${exp}`;
}

function snapshotFromQuestion(subject, q) {
  if (subject === "en") {
    return {
      lesson: q.lesson || "",
      chinese: q.chinese || "",
      english: q.english || "",
      hint: q.hint || "",
      type: q.type || "單字",
    };
  }
  return {
    lesson: q.lesson || "",
    word: q.word || "",
    zhuyin: q.zhuyin || "",
    sentence: q.sentence || "",
    type: q.type || "生字",
  };
}

/** 記一筆錯題（同一字會累加次數、更新時間） */
export function addMistake(childId, subject, question, recognized = "") {
  const expected =
    subject === "en" ? question?.english : question?.word;
  const key = mistakeKey(subject, expected);
  if (!key || !question) return;

  const store = loadStore();
  const bucket = childBucket(store, childId);
  const sub = subject === "en" ? bucket.en : bucket.zh;
  const now = new Date().toISOString();
  const prev = sub[key];

  sub[key] = {
    key,
    subject,
    expected: String(expected).trim(),
    ...snapshotFromQuestion(subject, question),
    wrongCount: (prev?.wrongCount || 0) + 1,
    lastWrongAt: now,
    lastRecognized: String(recognized || prev?.lastRecognized || "").trim(),
  };

  saveStore(store);
}

export function removeMistake(childId, subject, expected) {
  const key = mistakeKey(subject, expected);
  if (!key) return;

  const store = loadStore();
  const bucket = childBucket(store, childId);
  if (subject === "en") delete bucket.en[key];
  else delete bucket.zh[key];
  saveStore(store);
}

export function listMistakes(childId, subject) {
  const store = loadStore();
  const bucket = childBucket(store, childId);
  const sub = subject === "en" ? bucket.en : bucket.zh;
  return Object.values(sub).sort(
    (a, b) => new Date(b.lastWrongAt) - new Date(a.lastWrongAt)
  );
}

export function countMistakes(childId, subject) {
  return listMistakes(childId, subject).length;
}

export function clearMistakes(childId, subject) {
  const store = loadStore();
  const bucket = childBucket(store, childId);
  if (!subject || subject === "zh") bucket.zh = {};
  if (!subject || subject === "en") bucket.en = {};
  saveStore(store);
}

/** 測驗結束：把本輪確定答錯的題寫入錯題本 */
export function recordMistakesFromQuiz(quiz) {
  if (!quiz?.wrong?.length) return;

  const childId = quiz.child || "A";
  for (const w of quiz.wrong) {
    if (w.skipped) continue;

    const q = quiz.questions.find((item) => {
      if (quiz.subject === "en") return item.english === w.expected;
      return item.word === w.expected;
    });
    if (!q) continue;

    addMistake(childId, quiz.subject, q, w.recognized || "");
  }
}

/** 從題庫找回完整題目（試算表更新後仍盡量對得上） */
export function questionsFromMistakeBook(bank, childId, subject, maxCount = 10) {
  const mistakes = listMistakes(childId, subject);
  if (!mistakes.length) return [];

  const pool = [];
  const seen = new Set();

  for (const m of mistakes) {
    const key = mistakeKey(subject, m.expected);
    if (seen.has(key)) continue;

    let item = bank.find((row) => {
      if (subject === "en") {
        return (
          String(row.english || "").toLowerCase() ===
          String(m.expected || "").toLowerCase()
        );
      }
      return String(row.word || "") === String(m.expected || "");
    });

    if (!item) {
      if (subject === "en") {
        item = {
          lesson: m.lesson || "",
          type: m.type || "單字",
          chinese: m.chinese || "",
          hint: m.hint || "",
          english: m.expected,
        };
      } else {
        item = {
          lesson: m.lesson || "",
          type: m.type || "生字",
          word: m.expected,
          zhuyin: m.zhuyin || "",
          sentence: m.sentence || "",
        };
      }
    }

    seen.add(key);
    pool.push(item);
  }

  const n = maxCount > 0 ? Math.min(maxCount, pool.length) : pool.length;
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

export function formatMistakeLine(m) {
  if (m.subject === "en") {
    return `${m.chinese || "—"} → ${m.expected}${m.wrongCount > 1 ? `（錯 ${m.wrongCount} 次）` : ""}`;
  }
  return `${m.expected} ${m.zhuyin || ""}${m.wrongCount > 1 ? ` · 錯 ${m.wrongCount} 次` : ""}`;
}
