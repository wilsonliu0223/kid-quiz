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

function parseScriptResponse(text) {
  const trimmed = String(text || "").trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }
  throw new Error("回應不是 JSON");
}

async function postToScript(payload) {
  const url = (CONFIG.SCORE_LOG_URL || "").trim();
  if (!url) return { ok: false, reason: "no_url" };

  const tryGet = async () => {
    const params = new URLSearchParams(payload);
    const res = await fetch(`${url}?${params.toString()}`, { redirect: "follow" });
    return parseScriptResponse(await res.text());
  };

  const tryPost = async () => {
    const res = await fetch(url, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    return parseScriptResponse(await res.text());
  };

  let lastError = "network";
  for (const fn of [tryGet, tryPost]) {
    try {
      const data = await fn();
      if (data.ok) return { ok: true };
      lastError = data.error || "remote_error";
    } catch (e) {
      lastError = e.message;
      console.warn("寫入試算表失敗，嘗試下一種方式", e);
    }
  }
  return { ok: false, reason: lastError };
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

export function scoresForChild(scores, childId, childName) {
  return scores.filter(
    (s) => s.childId === childId || s.child === childName
  );
}

export function formatScoreLine(s) {
  const t = s.savedAt || s.at || "";
  const when = t ? new Date(t).toLocaleString("zh-TW", { hour12: false }) : "";
  const mode = s.mode ? ` · ${s.mode}` : "";
  const pending = Number(s.pending) || 0;
  const pendingStr = pending > 0 ? `（待確認 ${pending}）` : "";
  return `${when} · ${s.child} · ${s.subject}${mode} · ${s.correct}/${s.total}${pendingStr} · ${s.lesson || "全部"}`;
}

/** @returns {{ score: string, meta: string }} */
export function formatScoreSummary(s) {
  const t = s.savedAt || s.at || "";
  const when = t
    ? new Date(t).toLocaleString("zh-TW", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "";
  const mode = s.mode ? ` · ${s.mode}` : "";
  const pending = Number(s.pending) || 0;
  const extra = pending > 0 ? ` · 待確認 ${pending}` : "";
  return {
    score: `${s.correct} / ${s.total}`,
    meta: `${s.subject}${mode} · ${when}${extra}`,
  };
}
