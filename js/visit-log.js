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

function getScriptUrl() {
  return (CONFIG.SCORE_LOG_URL || "").trim();
}

function buildVisitPayload(ip = "") {
  return {
    action: "logVisit",
    ip,
    visitorId: getVisitorId(),
    page: location.pathname || "/",
    version: String(CONFIG.APP_VERSION || ""),
    device: deviceHint(),
    at: new Date().toISOString(),
  };
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

function sendImageBeacon(url, payload) {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve(true);
    };
    const timer = setTimeout(done, 3500);
    img.onload = () => {
      clearTimeout(timer);
      done();
    };
    img.onerror = () => {
      clearTimeout(timer);
      done();
    };
    const q = new URLSearchParams({ ...payload, _: String(Date.now()) });
    img.src = `${url}?${q.toString()}`;
  });
}

function sendBeaconPost(url, payload) {
  try {
    if (!navigator.sendBeacon) return false;
    const body = new Blob([JSON.stringify(payload)], {
      type: "text/plain;charset=utf-8",
    });
    return navigator.sendBeacon(url, body);
  } catch {
    return false;
  }
}

async function fetchPublicIp() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1200);
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

async function postToScriptFetch(url, payload) {
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
    }
  }
  return { ok: false, reason: lastError };
}

async function deliverVisit(url, payload) {
  if (sendBeaconPost(url, payload)) {
    return { ok: true, via: "beacon" };
  }

  await sendImageBeacon(url, payload);
  return { ok: true, via: "image" };
}

/** 每日每瀏覽器記一筆造訪（靜默，不影響使用） */
export async function logSiteVisit() {
  const url = getScriptUrl();
  if (!url) return;
  if (location.protocol === "file:") return;
  if (alreadyLoggedToday()) return;

  const ip = await Promise.race([
    fetchPublicIp(),
    new Promise((resolve) => setTimeout(() => resolve(""), 600)),
  ]);
  const payload = buildVisitPayload(ip);

  let result = await deliverVisit(url, payload);
  if (!result.ok) {
    result = await postToScriptFetch(url, payload);
  }
  if (!result.ok) {
    await new Promise((r) => setTimeout(r, 600));
    result = await deliverVisit(url, payload);
  }

  if (result.ok) {
    markLoggedToday();
  }
}
