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

function pickEnglishVoice() {
  const voices = window.speechSynthesis?.getVoices() || [];
  return (
    voices.find((v) => v.lang === "en-US") ||
    voices.find((v) => v.lang?.startsWith("en")) ||
    null
  );
}

/** 手機需在「按鈕點擊」後先呼叫一次，之後較容易播得出聲音 */
export function primeSpeech() {
  if (!window.speechSynthesis || speechPrimed) return;
  speechPrimed = true;
  try {
    window.speechSynthesis.resume();
    const silent = new SpeechSynthesisUtterance(" ");
    silent.volume = 0;
    silent.rate = 10;
    window.speechSynthesis.speak(silent);
    window.speechSynthesis.cancel();
  } catch (e) {
    console.warn("primeSpeech", e);
  }
}

export function speakEnglish(text) {
  const w = String(text || "").trim();
  if (!w || !window.speechSynthesis) return false;

  const run = () => {
    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
      const u = new SpeechSynthesisUtterance(w);
      u.lang = "en-US";
      u.rate = 0.88;
      const voice = pickEnglishVoice();
      if (voice) u.voice = voice;
      window.speechSynthesis.speak(u);
      return true;
    } catch (e) {
      console.warn("speakEnglish", e);
      return false;
    }
  };

  const voices = window.speechSynthesis.getVoices();
  if (voices.length) return run();

  return new Promise((resolve) => {
    const onVoices = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
      resolve(run());
    };
    window.speechSynthesis.addEventListener("voiceschanged", onVoices);
    setTimeout(() => {
      window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
      resolve(run());
    }, 500);
  });
}

if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    pickEnglishVoice();
  });
}
