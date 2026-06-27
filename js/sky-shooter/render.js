import { shipOrDefault } from "./ships.js?v=sky-duo-v7";
import { asList } from "./state-util.js?v=sky-duo-v7";
import { VERSUS_TIME } from "./sim.js?v=sky-duo-v7";

const WEAPON_LABELS = { straight: "直射", spread: "擴散", laser: "雷射" };

/** @param {CanvasRenderingContext2D} ctx @param {object} state @param {{ w: number, h: number, mySlot: string, names: Record<string,string> }} opts */
export function drawSkyFrame(ctx, state, opts) {
  const { w, h, mySlot, names } = opts;
  const particles = asList(state.particles);
  const pickups = asList(state.pickups);
  const eBullets = asList(state.eBullets);
  const bullets = asList(state.bullets);
  const enemies = asList(state.enemies);
  const missileTracks = asList(state.missileTracks);

  ctx.clearRect(0, 0, w, h);

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#1a2848");
  grad.addColorStop(0.45, "#243858");
  grad.addColorStop(1, "#1e3028");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  if (state.mode === "versus") {
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5);
    ctx.lineTo(w, h * 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${state.flash * 0.35})`;
    ctx.fillRect(0, 0, w, h);
  }

  for (const p of particles) {
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const o of pickups) {
    drawPickup(ctx, o, w, h);
  }

  for (const eb of eBullets) {
    ctx.fillStyle = "#ff4080";
    ctx.beginPath();
    ctx.arc(eb.x * w, eb.y * h, eb.r * w, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const b of bullets) {
    ctx.fillStyle = b.pvp ? "#e0c8ff" : "#fff6a0";
    ctx.beginPath();
    ctx.arc(b.x * w, b.y * h, b.r * w, 0, Math.PI * 2);
    ctx.fill();
  }

  drawMissileTracks(ctx, state, w, h, missileTracks, enemies);

  for (const e of enemies) {
    drawEnemy(ctx, e, w, h);
  }

  for (const slot of ["host", "guest"]) {
    const p = state.players[slot];
    if (p.lives <= 0) continue;
    drawPlayer(ctx, p, w, h, slot === mySlot, names[slot] || slot);
  }

  drawHud(ctx, state, w, h, mySlot, names);
}

function drawPickup(ctx, o, w, h) {
  const colors = {
    power: "#ffb830",
    spread: "#ff8040",
    laser: "#00d4ff",
    missile: "#a060ff",
  };
  ctx.fillStyle = colors[o.type] || "#fff";
  ctx.beginPath();
  ctx.arc(o.x * w, o.y * h, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 10px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = { power: "P", spread: "S", laser: "L", missile: "M" }[o.type] || "?";
  ctx.fillText(label, o.x * w, o.y * h);
}

function drawEnemy(ctx, e, w, h) {
  const x = e.x * w;
  const y = e.y * h;
  const ew = e.w * w;
  const eh = e.h * h;
  if (e.kind === "boss") {
    ctx.fillStyle = "#8b3030";
    ctx.fillRect(x - ew * 0.5, y - eh * 0.5, ew, eh);
    ctx.fillStyle = "#ff5040";
    ctx.fillRect(x - ew * 0.2, y - eh * 0.15, ew * 0.4, eh * 0.3);
    const hpR = Math.max(0, e.hp / 150);
    ctx.fillStyle = "#333";
    ctx.fillRect(x - ew * 0.4, y - eh * 0.7, ew * 0.8, 5);
    ctx.fillStyle = "#ff4040";
    ctx.fillRect(x - ew * 0.4, y - eh * 0.7, ew * 0.8 * hpR, 5);
    return;
  }
  ctx.fillStyle = e.kind === "fast" ? "#6a5040" : "#5a6b4a";
  ctx.beginPath();
  ctx.ellipse(x, y, ew * 0.5, eh * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (e.shield > 0) {
    ctx.strokeStyle = `rgba(120,220,255,${0.4 + (e.shield % 0.3)})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawPlayer(ctx, p, w, h, isMe, name) {
  const ship = shipOrDefault(p.ship);
  const x = p.x * w;
  const y = p.y * h;
  const pw = 28;
  const ph = 24;

  if (p.invuln > 0 && Math.sin(Date.now() * 0.02) > 0) ctx.globalAlpha = 0.55;

  ctx.save();
  ctx.translate(x, y);
  if (p.slot === "guest" && p.y < 0.5) ctx.rotate(Math.PI);

  ctx.fillStyle = ship.color;
  ctx.beginPath();
  ctx.moveTo(0, -ph * 0.5);
  ctx.lineTo(pw * 0.45, ph * 0.45);
  ctx.lineTo(0, ph * 0.25);
  ctx.lineTo(-pw * 0.45, ph * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = ship.accent;
  ctx.fillRect(-4, -ph * 0.15, 8, ph * 0.35);

  ctx.restore();
  ctx.globalAlpha = 1;

  if (p.weapon === "laser") {
    const dir = p.y < 0.5 ? 1 : -1;
    const beamH = h * 0.35;
    const y0 = y;
    const y1 = y + dir * beamH;
    const grd = ctx.createLinearGradient(x, y0, x, y1);
    grd.addColorStop(0, "rgba(0,220,255,0.55)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grd;
    ctx.fillRect(x - 8, Math.min(y0, y1), 16, Math.abs(beamH));
  }

  ctx.fillStyle = isMe ? "#fff" : "rgba(255,255,255,0.75)";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(name, x, y + (p.y < 0.5 ? -ph - 8 : ph + 14));

  const hearts = "♥".repeat(p.lives) + "♡".repeat(Math.max(0, 3 - p.lives));
  ctx.font = "10px sans-serif";
  ctx.fillText(`${hearts} ${WEAPON_LABELS[p.weapon] || ""}`, x, y + (p.y < 0.5 ? -ph - 20 : ph + 26));
}

function drawMissileTracks(ctx, state, w, h, missileTracks, enemies) {
  for (const t of missileTracks) {
    const p = state.players[t.owner];
    const e = enemies.find((en) => en.id === t.targetId);
    if (!p || !e) continue;
    const flicker = 0.8 + Math.sin((t.pulse || 0) * 3) * 0.15;
    ctx.strokeStyle = `rgba(168,120,255,${0.7 * flicker})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(p.x * w, p.y * h);
    ctx.lineTo(e.x * w, e.y * h);
    ctx.stroke();
  }
}

function drawHud(ctx, state, w, h, mySlot, names) {
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, w, 36);
  ctx.fillStyle = "#fff";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  if (state.mode === "coop") {
    const hL = state.players.host.lives;
    const gL = state.players.guest.lives;
    ctx.fillText(
      `合作 · 總分 ${state.teamScore} · ${names.host || "房主"} ${"♥".repeat(hL)} · ${names.guest || "來賓"} ${"♥".repeat(gL)} · ${Math.floor(state.t)}s`,
      10,
      18,
    );
  } else {
    const left = Math.max(0, Math.ceil(VERSUS_TIME - state.t));
    ctx.textAlign = "center";
    ctx.fillText(
      `${state.scores[mySlot] || 0}  :  ${left}s  :  ${state.scores[other(mySlot)] || 0}`,
      w / 2,
      18,
    );
    ctx.font = "10px sans-serif";
    ctx.fillText(`你 · ${names[mySlot] || ""}`, w * 0.2, 18);
    ctx.fillText(`${names[other(mySlot)] || ""}`, w * 0.8, 18);
  }
}

function other(slot) {
  return slot === "host" ? "guest" : "host";
}
