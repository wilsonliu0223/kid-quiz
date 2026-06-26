import { getChildName, getDuoPlayerIds } from "./children.js";

/**
 * @param {string | Element} container
 * @param {{ onPick: (id: string) => void, labelSuffix?: string, needTwoMessage?: string }} opts
 * @returns {boolean}
 */
export function renderDuoPickButtons(container, opts) {
  const el = typeof container === "string" ? document.querySelector(container) : container;
  if (!el) return false;

  const ids = getDuoPlayerIds();
  el.innerHTML = "";

  if (ids.length < 2) {
    const p = document.createElement("p");
    p.className = "duo-pick-need-two";
    p.textContent =
      opts.needTwoMessage || "至少需要兩位小孩，請在家長區新增並把對戰的兩位排在最上面";
    el.appendChild(p);
    return false;
  }

  const suffix = opts.labelSuffix || "";
  ids.forEach((id, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `flip-pick-btn flip-pick-${index === 0 ? "a" : "b"}`;
    btn.textContent = getChildName(id) + suffix;
    btn.addEventListener("click", () => opts.onPick(id));
    el.appendChild(btn);
  });
  return true;
}
