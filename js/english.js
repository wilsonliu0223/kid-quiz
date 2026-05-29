/** 英文答案比對（忽略大小寫、前後空白） */
export function normalizeEnglish(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/[.,!?;:"]/g, "");
}

export function englishAnswersMatch(typed, expected) {
  const a = normalizeEnglish(typed);
  const b = normalizeEnglish(expected);
  if (!a || !b) return false;
  return a === b;
}

let speechPrimed = false;
let activeAudio = null;
const dictAudioCache = new Map();

function normalizeAudioUrl(url) {
  if (!url) return "";
  const u = String(url).trim();
  if (u.startsWith("//")) return `https:${u}`;
  return u;
}

function stopAudio() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = "";
    activeAudio = null;
  }
  window.speechSynthesis?.cancel();
}

function playAudioUrl(url) {
  return new Promise((resolve) => {
    const src = normalizeAudioUrl(url);
    if (!src) {
      resolve(false);
      return;
    }
    try {
      stopAudio();
      const audio = new Audio(src);
      activeAudio = audio;
      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };
      audio.onended = () => done(true);
      audio.onerror = () => done(false);
      audio.play().then(() => {}).catch(() => done(false));
    } catch (e) {
      console.warn("playAudioUrl", e);
      resolve(false);
    }
  });
}

function pickAudioFromEntry(entry) {
  const list = entry.phonetics || [];
  const withAudio = list
    .map((p) => normalizeAudioUrl(p.audio))
    .filter(Boolean);
  if (!withAudio.length) return "";

  const us =
    withAudio.find((u) => /-us\.|american|en-us/i.test(u)) ||
    withAudio.find((u) => /us\b/i.test(u));
  return us || withAudio[0];
}

async function fetchDictionaryAudioUrl(query) {
  const key = String(query || "").trim().toLowerCase();
  if (!key) return "";
  if (dictAudioCache.has(key)) return dictAudioCache.get(key);

  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(query)}`
    );
    if (!res.ok) return "";
    const data = await res.json();
    for (const entry of data) {
      const url = pickAudioFromEntry(entry);
      if (url) {
        dictAudioCache.set(key, url);
        return url;
      }
    }
  } catch (e) {
    console.warn("fetchDictionaryAudioUrl", query, e);
  }
  return "";
}

async function speakWithDictionary(text) {
  const tries = [
    text,
    text.replace(/\s+/g, "-"),
    text.replace(/\s+/g, ""),
    text.replace(/-/g, " "),
  ];
  const seen = new Set();
  for (const q of tries) {
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const url = await fetchDictionaryAudioUrl(q);
    if (url) return playAudioUrl(url);
  }
  return false;
}

function pickEnglishVoice() {
  const voices = window.speechSynthesis?.getVoices() || [];
  const en = voices.filter((v) => v.lang?.toLowerCase().startsWith("en"));
  return (
    en.find((v) => /google.*english.*united states/i.test(v.name)) ||
    en.find((v) => /google/i.test(v.name) && v.lang === "en-US") ||
    en.find((v) => v.lang === "en-US" && !v.localService) ||
    en.find((v) => v.lang === "en-US") ||
    en[0] ||
    null
  );
}

export function primeSpeech() {
  speechPrimed = true;
  try {
    window.speechSynthesis?.resume();
    window.speechSynthesis?.getVoices();
  } catch (e) {
    console.warn("primeSpeech", e);
  }
}

function speakWithSynth(text) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) {
      resolve(false);
      return;
    }

    const start = () => {
      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();

        const u = new SpeechSynthesisUtterance(text);
        u.lang = "en-US";
        u.rate = 0.82;
        u.pitch = 1;
        u.volume = 1;
        const voice = pickEnglishVoice();
        if (voice) u.voice = voice;

        let settled = false;
        let spoke = false;
        const done = (ok) => {
          if (settled) return;
          settled = true;
          resolve(ok);
        };

        u.onstart = () => {
          spoke = true;
        };
        u.onend = () => done(spoke);
        u.onerror = () => done(false);
        setTimeout(() => done(spoke), 5000);

        window.speechSynthesis.speak(u);
      } catch (e) {
        console.warn("speakWithSynth", e);
        resolve(false);
      }
    };

    if (window.speechSynthesis.getVoices().length) {
      start();
      return;
    }

    const onVoices = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
      start();
    };
    window.speechSynthesis.addEventListener("voiceschanged", onVoices);
    setTimeout(() => {
      window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
      start();
    }, 400);
  });
}

/**
 * 播放英文：優先詞典真人發音 MP3，其次手機內建語音
 * @returns {Promise<boolean>}
 */
export async function speakEnglish(text) {
  const w = String(text || "").trim();
  if (!w) return false;

  primeSpeech();

  const dictOk = await speakWithDictionary(w);
  if (dictOk) return true;

  return speakWithSynth(w);
}

if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.addEventListener("voiceschanged", pickEnglishVoice);
  pickEnglishVoice();
}
