import { CONFIG } from "./config.site.js";

const KEY_NAMES = "kid-quiz-child-names";

function defaults() {
  const fromConfig = CONFIG.CHILD_NAMES || {};
  return {
    A: fromConfig.A || "思妘",
    B: fromConfig.B || "思妤",
  };
}

export function getChildNames() {
  try {
    const raw = localStorage.getItem(KEY_NAMES);
    if (raw) {
      const saved = JSON.parse(raw);
      return { ...defaults(), ...saved };
    }
  } catch {
    /* ignore */
  }
  return defaults();
}

export function setChildNames(names) {
  const next = {
    A: String(names.A || defaults().A).trim() || defaults().A,
    B: String(names.B || defaults().B).trim() || defaults().B,
  };
  localStorage.setItem(KEY_NAMES, JSON.stringify(next));
  return next;
}

export function getChildName(id) {
  const names = getChildNames();
  return names[id] || names.A || id;
}

export function getChildLabel(id) {
  return getChildName(id);
}
