import { CONFIG } from "./config.site.js";

const VISIT_DAY_KEY_PREFIX = "kid-quiz-visit-";
const VISITOR_ID_KEY = "kid-quiz-visitor-id";

function todayKey() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function alreadyLoggedToday() {
  try {
    return localStorage.getItem(`${VISIT_DAY_KEY_PREFIX}${todayKey()}`) === "1";
  } catch {
    return false;
  }
}

function markLoggedToday() {
  try {
    localStorage.setItem(`${VISIT_DAY_KEY_PREFIX}${todayKey()}`, "1");
  } catch {
    /* ignore */
  }
}

function getVisitorId() {
  try {
    let id = localStorage.getItem(VISITOR_ID_KEY);
    if (!id) {
      id =
        globalThis.crypto?.randomUUID?.() ||
        `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(VISITOR_ID_KEY, id);
    }
    return id;
  } catch {
    return "unknown";
  }
}

function deviceHint() {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac/i.test(ua)) return "Mac";
  return "其他";
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
      console.warn("造訪記錄寫入失敗，嘗試下一種方式", e);
    }
  }
  return { ok: false, reason: lastError };
}

async function fetchPublicIp() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch("https://api.ipify.org?format=json", {
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return "";
    const data = await res.json();
    return String(data.ip || "").trim();
  } catch {
    return "";
  }
}

/** 每日每瀏覽器記一筆造訪（靜默，不影響使用） */
export async function logSiteVisit() {
  if (!(CONFIG.SCORE_LOG_URL || "").trim()) return;
  if (location.protocol === "file:") return;
  if (alreadyLoggedToday()) return;

  const ip = await Promise.race([
    fetchPublicIp(),
    new Promise((resolve) => setTimeout(() => resolve(""), 1500)),
  ]);

  const payload = {
    action: "logVisit",
    ip,
    visitorId: getVisitorId(),
    page: location.pathname || "/",
    version: String(CONFIG.APP_VERSION || ""),
    device: deviceHint(),
    at: new Date().toISOString(),
  };

  let result = await postToScript(payload);
  if (!result.ok) {
    await new Promise((r) => setTimeout(r, 800));
    result = await postToScript(payload);
  }
  if (result.ok) markLoggedToday();
}
