/**
 * 例句格式：用【國字或詞】標出要考的字，畫面會只把該處顯示成注音。
 * 例：這本【厚厚】的剪貼簿，每一頁……
 */
export function fillSentenceContext(container, sentence, word, zhuyin) {
  if (!container) return false;

  const sent = String(sentence || "").trim();
  if (!sent) {
    container.hidden = true;
    container.replaceChildren();
    return false;
  }

  container.hidden = false;
  container.replaceChildren();

  const marker = `【${word}】`;
  if (sent.includes(marker)) {
    const parts = sent.split(marker);
    parts.forEach((part, i) => {
      if (part) container.append(document.createTextNode(part));
      if (i < parts.length - 1) {
        const sp = document.createElement("span");
        sp.className = "zhuyin-in-sentence";
        sp.setAttribute("aria-label", `請寫：${word}`);
        sp.textContent = zhuyin;
        container.append(sp);
      }
    });
    return true;
  }

  const idx = sent.indexOf(word);
  if (word && idx >= 0) {
    container.append(document.createTextNode(sent.slice(0, idx)));
    const sp = document.createElement("span");
    sp.className = "zhuyin-in-sentence";
    sp.setAttribute("aria-label", `請寫：${word}`);
    sp.textContent = zhuyin;
    container.append(sp);
    container.append(document.createTextNode(sent.slice(idx + word.length)));
    return true;
  }

  container.append(document.createTextNode(sent));
  return true;
}

function escapeHtmlText(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const RACE_BLANK = "【　】";

/**
 * 搶答對戰：例句不露出答案國字，改為空括號【　】
 * @param {string} sentence
 * @param {string} word
 */
export function blankSentenceForRace(sentence, word) {
  const sent = String(sentence || "").trim();
  const w = String(word || "").trim();
  if (!sent) return "";
  if (!w) return sent;

  const markers = [`【${w}】`, `［${w}］`, `[${w}]`, `〔${w}〕`];
  for (const marker of markers) {
    if (sent.includes(marker)) return sent.split(marker).join(RACE_BLANK);
  }

  const idx = sent.indexOf(w);
  if (idx >= 0) {
    return sent.slice(0, idx) + RACE_BLANK + sent.slice(idx + w.length);
  }
  return sent;
}

/** 搶答例句 HTML（空括號樣式） */
export function raceSentenceHtml(sentence, word) {
  const blanked = blankSentenceForRace(sentence, word);
  if (!blanked) return "";
  const parts = blanked.split(RACE_BLANK);
  if (parts.length === 1) return escapeHtmlText(blanked);
  return parts
    .map((part, i) => {
      const text = escapeHtmlText(part);
      return i < parts.length - 1
        ? `${text}<span class="race-char-blank">${RACE_BLANK}</span>`
        : text;
    })
    .join("");
}
