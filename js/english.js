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
let fallbackAudio = null;

function pickEnglishVoice() {
  const voices = window.speechSynthesis?.getVoices() || [];
  return (
    voices.find((v) => v.lang === "en-US" && v.localService) ||
    voices.find((v) => v.lang === "en-US") ||
    voices.find((v) => v.lang?.startsWith("en")) ||
    null
  );
}

/** 在按鈕點擊時呼叫，喚醒語音（Android / iPhone） */
export function primeSpeech() {
  if (speechPrimed) {
    window.speechSynthesis?.resume();
    return;
  }
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
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
        }
        window.speechSynthesis.resume();

        const u = new SpeechSynthesisUtterance(text);
        u.lang = "en-US";
        u.rate = 0.85;
        u.volume = 1;
        const voice = pickEnglishVoice();
        if (voice) u.voice = voice;

        let settled = false;
        const done = (ok) => {
          if (settled) return;
          settled = true;
          resolve(ok);
        };

        u.onend = () => done(true);
        u.onerror = () => done(false);
        setTimeout(() => done(false), 2500);

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

/** Android 部分機型內建語音無聲時的備援 */
function speakWithOnlineAudio(text) {
  return new Promise((resolve) => {
    try {
      if (fallbackAudio) {
        fallbackAudio.pause();
        fallbackAudio.src = "";
        fallbackAudio = null;
      }
      const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=${encodeURIComponent(text)}`;
      const audio = new Audio(url);
      fallbackAudio = audio;
      audio.preload = "auto";

      const finish = (ok) => {
        audio.onended = null;
        audio.onerror = null;
        resolve(ok);
      };

      audio.onended = () => finish(true);
      audio.onerror = () => finish(false);

      const playPromise = audio.play();
      if (playPromise?.catch) {
        playPromise.then(() => {}).catch(() => finish(false));
      }
    } catch (e) {
      console.warn("speakWithOnlineAudio", e);
      resolve(false);
    }
  });
}

/**
 * 播放英文（先內建語音，失敗再用線上音檔）
 * @returns {Promise<boolean>}
 */
function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}

export async function speakEnglish(text) {
  const w = String(text || "").trim();
  if (!w) return false;

  primeSpeech();

  if (isAndroid()) {
    const onlineOk = await speakWithOnlineAudio(w);
    if (onlineOk) return true;
    return speakWithSynth(w);
  }

  const synthOk = await speakWithSynth(w);
  if (synthOk) return true;
  return speakWithOnlineAudio(w);
}

if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.addEventListener("voiceschanged", pickEnglishVoice);
  pickEnglishVoice();
}
