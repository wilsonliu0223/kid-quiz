import {
  getChildName,
  getChildren,
  getDuoOpponentCandidates,
} from "./children.js";
import { getDuoOpponent, getSelectedChild, setDuoOpponent } from "./store.js";

/**
 * @param {string} activeChildId
 * @returns {string|null}
 */
export function resolveDuoOpponent(activeChildId) {
  const candidates = getDuoOpponentCandidates(activeChildId);
  if (!candidates.length) return null;
  const stored = getDuoOpponent(activeChildId);
  if (stored && candidates.some((c) => c.id === stored)) return stored;
  return candidates[0].id;
}

/** @returns {string[]} */
export function getActiveDuoPlayerIds() {
  const active = getSelectedChild();
  const opponent = resolveDuoOpponent(active);
  if (!opponent) return [];
  return [active, opponent];
}

export function renderDuoMatchupLine(activeNameEl, opponentNameEl) {
  const ids = getActiveDuoPlayerIds();
  if (activeNameEl) {
    activeNameEl.textContent = ids[0] ? getChildName(ids[0]) : "—";
  }
  if (opponentNameEl) {
    opponentNameEl.textContent = ids[1] ? getChildName(ids[1]) : "—";
  }
}

/**
 * @param {string | Element} container
 * @param {{ onChange?: (opponentId: string) => void, needOpponentMessage?: string }} [opts]
 * @returns {boolean}
 */
export function renderDuoOpponentPicker(container, opts = {}) {
  const el = typeof container === "string" ? document.querySelector(container) : container;
  if (!el) return false;

  const active = getSelectedChild();
  const candidates = getDuoOpponentCandidates(active);
  const selected = resolveDuoOpponent(active);

  el.innerHTML = "";
  if (!candidates.length) {
    const p = document.createElement("p");
    p.className = "duo-pick-need-two";
    p.textContent =
      opts.needOpponentMessage ||
      "至少需要另一位才能對戰（請在家長區新增，或換一位「誰在練習」）";
    el.appendChild(p);
    return false;
  }

  candidates.forEach((child) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    if (child.id === selected) btn.classList.add("chip-active");
    btn.dataset.opponentId = child.id;
    btn.textContent = child.name;
    btn.addEventListener("click", () => {
      setDuoOpponent(active, child.id);
      renderDuoOpponentPicker(el, opts);
      opts.onChange?.(child.id);
    });
    el.appendChild(btn);
  });
  return true;
}

/**
 * @param {string | Element} container
 * @param {{ onPick: (id: string) => void, labelSuffix?: string, playerIds?: string[], needTwoMessage?: string }} opts
 * @returns {boolean}
 */
export function renderDuoPickButtons(container, opts) {
  const el = typeof container === "string" ? document.querySelector(container) : container;
  if (!el) return false;

  const ids = opts.playerIds || getActiveDuoPlayerIds();
  el.innerHTML = "";

  if (ids.length < 2) {
    const p = document.createElement("p");
    p.className = "duo-pick-need-two";
    p.textContent =
      opts.needTwoMessage ||
      "請先選「誰在練習」，並在上方挑選對戰對象";
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

export function canStartDuoBattle() {
  return getChildren().length >= 2 && getActiveDuoPlayerIds().length === 2;
}

function updateDuoMatchupLabels() {
  const ids = getActiveDuoPlayerIds();
  const pairs = [
    ["#math-setup-player-a-name", "#math-setup-player-b-name"],
    ["#flip-duo-matchup-a", "#flip-duo-matchup-b"],
    ["#gomoku-duo-matchup-a", "#gomoku-duo-matchup-b"],
    ["#flip-player-a-name", "#flip-player-b-name"],
    ["#mul-flip-player-a-name", "#mul-flip-player-b-name"],
  ];
  for (const [aSel, bSel] of pairs) {
    renderDuoMatchupLine(
      document.querySelector(aSel),
      document.querySelector(bSel)
    );
  }
}

/** 依首頁「誰在練習」更新對戰名稱與對手選單 */
export function refreshDuoBattleUI() {
  const activeName = getChildName(getSelectedChild());
  for (const id of ["math-duo-active-name", "flip-duo-active-name", "gomoku-duo-active-name"]) {
    const el = document.getElementById(id);
    if (el) el.textContent = activeName;
  }

  const onChange = () => updateDuoMatchupLabels();
  for (const sel of [
    "#math-duo-opponent-chips",
    "#flip-duo-opponent-chips",
    "#gomoku-duo-opponent-chips",
  ]) {
    if (document.querySelector(sel)) {
      renderDuoOpponentPicker(sel, { onChange });
    }
  }
  updateDuoMatchupLabels();
}
