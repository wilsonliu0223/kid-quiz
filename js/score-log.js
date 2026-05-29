import { CONFIG } from "./config.site.js";
import { getChildName } from "./children.js";

const KEY_SCORES = "kid-quiz-scores";
const MAX_LOCAL = 80;

function buildPayload(quiz, lessonFilter) {
  const subject = quiz.subject === "en" ? "英語" : "國語";
  let mode = "";
  if (quiz.subject === "en") {
    mode = (quiz.mode || "meaning") === "listen" ? "聽音拼字" : "看中拼英";
  } else {
    mode = "手寫";
  }
  return {
    action: "logScore",
    child: getChildName(quiz.child),
    childId: quiz.child,
    subject,
    lesson: lessonFilter || "全部",
    mode,
    correct: String(quiz.autoCorrect),
    total: String(quiz.questions.length),
    pending: String(quiz.pending || 0),
    at: new Date().toISOString(),
  };
}

export function loadLocalScores() {
  try {
    const raw = localStorage.getItem(KEY_SCORES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function appendLocalScore(entry) {
  const list = loadLocalScores();
  list.unshift({
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    savedAt: entry.at,
  });
  localStorage.setItem(KEY_SCORES, JSON.stringify(list.slice(0, MAX_LOCAL)));
}

async function postToScript(payload) {
  const url = (CONFIG.SCORE_LOG_URL || "").trim();
  if (!url) return { ok: false, reason: "no_url" };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    const data = JSON.parse(text);
    if (data.ok) return { ok: true };
    return { ok: false, reason: data.error || "remote_error" };
  } catch (e) {
    console.warn("POST 記錄失敗，改試 GET", e);
  }

  try {
    const params = new URLSearchParams(payload);
    const res = await fetch(`${url}?${params.toString()}`);
    const text = await res.text();
    const data = JSON.parse(text);
    if (data.ok) return { ok: true };
    return { ok: false, reason: data.error || "remote_error" };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

/**
 * @returns {{ local: boolean, remote: boolean, message: string }}
 */
export async function logQuizResult(quiz, lessonFilter) {
  const payload = buildPayload(quiz, lessonFilter);
  appendLocalScore(payload);

  const remote = await postToScript(payload);
  if (remote.ok) {
    return {
      local: true,
      remote: true,
      message: "已寫入試算表「成績」工作表",
    };
  }
  if (!(CONFIG.SCORE_LOG_URL || "").trim()) {
    return {
      local: true,
      remote: false,
      message:
        "已記錄在本機。若要寫入 Google 試算表，請部署 Apps Script 並設定 SCORE_LOG_URL（見 README）",
    };
  }
  return {
    local: true,
    remote: false,
    message: `已記錄在本機（試算表寫入失敗：${remote.reason || "未知"}）`,
  };
}

export function formatScoreLine(s) {
  const t = s.savedAt || s.at || "";
  const when = t ? new Date(t).toLocaleString("zh-TW", { hour12: false }) : "";
  const mode = s.mode ? ` · ${s.mode}` : "";
  return `${when} · ${s.child} · ${s.subject}${mode} · ${s.correct}/${s.total}（待確認 ${s.pending}）· ${s.lesson || "全部"}`;
}
