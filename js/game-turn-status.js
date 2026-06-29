/** @typedef {'xiangqi' | 'gomoku'} TurnStatusTheme */

const THEME = {
  xiangqi: {
    leftKey: "red",
    rightKey: "black",
    leftLabel: "紅方",
    rightLabel: "黑方",
    leftCardClass: "xiangqi-side-red",
    rightCardClass: "xiangqi-side-black",
    leftBannerClass: "xiangqi-turn-banner-red",
    rightBannerClass: "xiangqi-turn-banner-black",
    turnMain: (turn) => (turn === "red" ? "紅方走棋" : "黑方走棋"),
  },
  gomoku: {
    leftKey: "black",
    rightKey: "white",
    leftLabel: "黑方",
    rightLabel: "白方",
    leftCardClass: "gomoku-side-black",
    rightCardClass: "gomoku-side-white",
    leftBannerClass: "gomoku-turn-banner-black",
    rightBannerClass: "gomoku-turn-banner-white",
    turnMain: (turn) => (turn === "black" ? "黑方下棋" : "白方下棋"),
  },
};

/**
 * @param {object} opts
 * @param {TurnStatusTheme} opts.theme
 * @param {HTMLElement|null} [opts.leftCard]
 * @param {HTMLElement|null} [opts.rightCard]
 * @param {HTMLElement|null} [opts.banner]
 * @param {HTMLElement|null} [opts.turnMain]
 * @param {HTMLElement|null} [opts.turnSub]
 * @param {string} opts.leftName
 * @param {string} opts.rightName
 * @param {string|null} [opts.turn]
 * @param {string} [opts.turnPlayerName]
 * @param {boolean} [opts.over]
 * @param {string} [opts.overTitle]
 * @param {boolean} [opts.waitingAi]
 * @param {string} [opts.statusText]
 * @param {string} [opts.youHint]
 * @param {HTMLElement|null} [opts.extraEl]
 * @param {string} [opts.extraText]
 * @param {boolean} [opts.extraVisible]
 */
export function renderDuoTurnStatusBar(opts) {
  const cfg = THEME[opts.theme];
  if (!cfg) return;

  const setName = (card, name) => {
    const el = card?.querySelector(".duo-side-card-name, .xiangqi-side-card-name, .gomoku-side-card-name");
    if (el) el.textContent = name;
  };
  setName(opts.leftCard, opts.leftName);
  setName(opts.rightCard, opts.rightName);

  const turn = opts.turn || null;
  const over = !!opts.over;

  const showTurnHighlight = !over && !opts.statusText && !!turn;

  opts.leftCard?.classList.toggle("is-active-turn", showTurnHighlight && turn === cfg.leftKey);
  opts.rightCard?.classList.toggle("is-active-turn", showTurnHighlight && turn === cfg.rightKey);

  if (opts.banner) {
    opts.banner.classList.toggle(cfg.leftBannerClass, showTurnHighlight && turn === cfg.leftKey);
    opts.banner.classList.toggle(cfg.rightBannerClass, showTurnHighlight && turn === cfg.rightKey);
    opts.banner.classList.toggle("is-over", over);
    opts.banner.classList.toggle("is-waiting-ai", !!opts.waitingAi);
    opts.banner.classList.toggle("is-replay", !!opts.statusText && !over);
  }

  if (opts.turnMain) {
    if (opts.statusText) {
      opts.turnMain.textContent = opts.statusText;
    } else if (over) {
      opts.turnMain.textContent = opts.overTitle || "對局結束";
    } else if (opts.waitingAi) {
      opts.turnMain.textContent = "電腦思考中";
    } else if (turn) {
      opts.turnMain.textContent = cfg.turnMain(turn);
    }
  }

  if (opts.turnSub) {
    if (over || opts.statusText) {
      opts.turnSub.textContent = opts.statusText && !over ? "" : "";
      opts.turnSub.hidden = true;
    } else {
      opts.turnSub.hidden = false;
      opts.turnSub.textContent = opts.waitingAi
        ? "請稍候…"
        : `${opts.turnPlayerName || ""}${opts.youHint || ""}`;
    }
  }

  if (opts.extraEl) {
    if (opts.extraText) opts.extraEl.textContent = opts.extraText;
    opts.extraEl.toggleAttribute("hidden", !opts.extraVisible);
  }
}
