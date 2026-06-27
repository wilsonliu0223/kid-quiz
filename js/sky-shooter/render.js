import { shipOrDefault } from "./ships.js?v=sky-duo-v13";
import { asList } from "./state-util.js?v=sky-duo-v13";
import { VERSUS_TIME, ZONE_RATIO, COOP_Y_BAND } from "./sim.js?v=sky-duo-v13";

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
  const time = state.t || 0;

  ctx.clearRect(0, 0, w, h);
  drawSkyZones(ctx, w, h, time, state.mode);

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
    drawPickup(ctx, o, w, h, time);
  }

  for (const eb of eBullets) {
    drawEnemyBullet(ctx, eb, w, h);
  }

  for (const b of bullets) {
    drawPlayerBullet(ctx, b, w, h);
  }

  drawMissileTracks(ctx, state, w, h, missileTracks, enemies);

  for (const e of enemies) {
    drawEnemy(ctx, e, w, h, time);
  }

  drawAllPlayerLasers(ctx, state, w, h, time);

  for (const slot of ["host", "guest"]) {
    const p = state.players[slot];
    if (p.lives <= 0) continue;
    drawPlayer(ctx, p, w, h, slot === mySlot, names[slot] || slot, time);
  }

  drawHud(ctx, state, w, h, mySlot, names);
}

function zoneBounds(h) {
  const mid = h * ZONE_RATIO.top;
  const bot = mid + h * ZONE_RATIO.mid;
  const botEnd = bot + h * ZONE_RATIO.bot;
  return { mid, bot, botEnd };
}

function drawSkyZones(ctx, w, h, time, mode) {
  const { mid, bot, botEnd } = zoneBounds(h);

  const grdTop = ctx.createLinearGradient(0, 0, 0, mid);
  grdTop.addColorStop(0, "#0f2840");
  grdTop.addColorStop(1, "#1a3a5c");
  ctx.fillStyle = grdTop;
  ctx.fillRect(0, 0, w, mid);

  const grdMid = ctx.createLinearGradient(0, mid, 0, bot);
  grdMid.addColorStop(0, "#1a2d4a");
  grdMid.addColorStop(0.5, "#243a32");
  grdMid.addColorStop(1, "#1a2d4a");
  ctx.fillStyle = grdMid;
  ctx.fillRect(0, mid, w, bot - mid);

  const grdBot = ctx.createLinearGradient(0, bot, 0, botEnd);
  grdBot.addColorStop(0, "#0d1f35");
  grdBot.addColorStop(1, "#0a1628");
  ctx.fillStyle = grdBot;
  ctx.fillRect(0, bot, w, botEnd - bot);

  ctx.strokeStyle = "rgba(61, 107, 138, 0.65)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(w, mid);
  ctx.moveTo(0, bot);
  ctx.lineTo(w, bot);
  ctx.stroke();

  if (mode === "coop") {
    const bandTop = h * COOP_Y_BAND[0];
    const bandBot = h * COOP_Y_BAND[1];
    ctx.strokeStyle = "rgba(255, 213, 74, 0.4)";
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(0, bandTop);
    ctx.lineTo(w, bandTop);
    ctx.moveTo(0, bandBot);
    ctx.lineTo(w, bandBot);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (mode === "versus") {
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5);
    ctx.lineTo(w, h * 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  for (let i = 0; i < 5; i++) {
    const mx = ((time * 12 + i * 90) % (w + 80)) - 40;
    const my = mid * 0.25 + i * 14;
    ctx.fillStyle = "rgba(100, 140, 180, 0.2)";
    ctx.beginPath();
    ctx.ellipse(mx, my, 28, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPickup(ctx, o, w, h, time) {
  const colors = {
    power: "#ffb830",
    spread: "#ff8040",
    laser: "#00d4ff",
    missile: "#a060ff",
  };
  const x = o.x * w;
  const y = o.y * h;
  const pulse = 0.85 + Math.sin(time * 8 + o.id) * 0.15;
  ctx.save();
  ctx.shadowColor = colors[o.type] || "#fff";
  ctx.shadowBlur = 10;
  ctx.fillStyle = colors[o.type] || "#fff";
  ctx.beginPath();
  ctx.arc(x, y, 11 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 10px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = { power: "P", spread: "S", laser: "L", missile: "M" }[o.type] || "?";
  ctx.fillText(label, x, y);
  ctx.restore();
}

function drawPlayerBullet(ctx, b, w, h) {
  const x = b.x * w;
  const y = b.y * h;
  const r = b.r * w;
  ctx.save();
  if (b.pvp) {
    ctx.fillStyle = "#e0c8ff";
    ctx.shadowColor = "#c8a0ff";
  } else {
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, "#fff");
    grd.addColorStop(0.5, "#fff6a0");
    grd.addColorStop(1, "#ffb830");
    ctx.fillStyle = grd;
    ctx.shadowColor = "#ffd54a";
  }
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEnemyBullet(ctx, eb, w, h) {
  const x = eb.x * w;
  const y = eb.y * h;
  const r = eb.r * w;
  const grd = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
  grd.addColorStop(0, "#fff");
  grd.addColorStop(0.35, "#ff80c0");
  grd.addColorStop(1, "#ff2060");
  ctx.fillStyle = grd;
  ctx.shadowColor = "#ff6eb4";
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawEnemy(ctx, e, w, h, time) {
  const x = e.x * w;
  const y = e.y * h;
  const ew = e.w * w;
  const eh = e.h * h;

  if (e.shield > 0) {
    ctx.strokeStyle = `rgba(120,220,255,${0.35 + (e.shield % 0.3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y, ew * 0.55, eh * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (e.kind === "boss") {
    drawBoss(ctx, e, x, y, ew, eh, time);
    return;
  }
  if (e.kind === "fast") {
    drawJetEnemy(ctx, x, y, ew);
    return;
  }
  drawHelicopter(ctx, x, y, ew, time);
}

function drawHelicopter(ctx, x, y, ew, time) {
  const rot = time * 14;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#5a6b4a";
  ctx.fillRect(-ew / 2, -4, ew, 12);
  ctx.fillStyle = "#3a4a32";
  ctx.fillRect(-6, -10, 12, 8);
  ctx.strokeStyle = "rgba(200,220,180,0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, -14, ew * 0.55, 3, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.save();
  ctx.rotate(rot);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-16, 0);
  ctx.lineTo(16, 0);
  ctx.moveTo(0, -16);
  ctx.lineTo(0, 16);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "#ff8040";
  ctx.beginPath();
  ctx.arc(ew / 2 - 2, 2, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawJetEnemy(ctx, x, y, ew) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(-1, 1);
  ctx.fillStyle = "#4a5a6a";
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(-10, -9);
  ctx.lineTo(-6, 0);
  ctx.lineTo(-10, 9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ff6060";
  ctx.shadowColor = "#ff4040";
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(-4, 0, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawBoss(ctx, e, x, y, ew, eh, time) {
  const pulse = 0.82 + Math.sin(time * 4.5) * 0.18;
  const hpR = Math.max(0, e.hp / 150);
  const rage = hpR < 0.45;

  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = rage ? "#ff3060" : "#ff8040";
  ctx.shadowBlur = 18 * pulse;

  const wingGrad = ctx.createLinearGradient(-ew / 2, 0, ew / 2, 0);
  wingGrad.addColorStop(0, "#2a1018");
  wingGrad.addColorStop(0.5, "#5a2830");
  wingGrad.addColorStop(1, "#2a1018");
  ctx.fillStyle = wingGrad;
  ctx.beginPath();
  ctx.moveTo(0, -eh * 0.45);
  ctx.lineTo(ew * 0.48, eh * 0.35);
  ctx.lineTo(0, eh * 0.42);
  ctx.lineTo(-ew * 0.48, eh * 0.35);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#ff5040";
  ctx.beginPath();
  ctx.ellipse(0, -eh * 0.05, ew * 0.18, eh * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#333";
  ctx.fillRect(-ew * 0.4, -eh * 0.75, ew * 0.8, 5);
  ctx.fillStyle = rage ? "#ff2060" : "#ff4040";
  ctx.fillRect(-ew * 0.4, -eh * 0.75, ew * 0.8 * hpR, 5);
  ctx.restore();
}

function shipPalette(ship) {
  return {
    body: ship.color,
    wing: ship.accent,
    cockpit: "#e8f4ff",
    engine: ship.id === "swift" ? "#4da6ff" : "#ff8040",
    accent: ship.id === "swift" ? "#2a5080" : "#802020",
  };
}

function drawRaidenFighter(ctx, x, y, palette, time) {
  const body = palette.body;
  const wing = palette.wing;
  const cockpit = palette.cockpit;
  const engine = palette.engine;
  const accent = palette.accent;

  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = engine;
  ctx.shadowBlur = 12;

  ctx.fillStyle = wing;
  ctx.beginPath();
  ctx.moveTo(-22, 4);
  ctx.lineTo(-8, -2);
  ctx.lineTo(8, -2);
  ctx.lineTo(22, 4);
  ctx.lineTo(8, 6);
  ctx.lineTo(-8, 6);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.bezierCurveTo(6, -8, 7, 8, 5, 16);
  ctx.lineTo(0, 20);
  ctx.lineTo(-5, 16);
  ctx.bezierCurveTo(-7, 8, -6, -8, 0, -20);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = accent;
  ctx.fillRect(-3, -6, 6, 14);

  ctx.fillStyle = cockpit;
  ctx.beginPath();
  ctx.ellipse(0, -8, 4.5, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = engine;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.ellipse(-7, 14, 3.5, 8, 0, 0, Math.PI * 2);
  ctx.ellipse(7, 14, 3.5, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  const flicker = 0.7 + Math.sin(time * 28) * 0.3;
  ctx.globalAlpha = flicker;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(-2, 18);
  ctx.lineTo(0, 28 + flicker * 6);
  ctx.lineTo(2, 18);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawPlayer(ctx, p, w, h, isMe, name, time) {
  const ship = shipOrDefault(p.ship);
  const x = p.x * w;
  const y = p.y * h;
  const faceDown = p.y < 0.45;

  if (p.invuln > 0 && Math.sin(time * 12) > 0) ctx.globalAlpha = 0.55;

  ctx.save();
  ctx.translate(x, y);
  if (faceDown) ctx.rotate(Math.PI);
  drawRaidenFighter(ctx, 0, 0, shipPalette(ship), time);
  ctx.restore();
  ctx.globalAlpha = 1;

  ctx.fillStyle = isMe ? "#fff" : "rgba(255,255,255,0.75)";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(name, x, y + (faceDown ? -36 : 36));

  const hearts = "♥".repeat(p.lives) + "♡".repeat(Math.max(0, 3 - p.lives));
  ctx.font = "10px sans-serif";
  ctx.fillText(`${hearts} ${WEAPON_LABELS[p.weapon] || ""}`, x, y + (faceDown ? -50 : 50));
}

function drawAllPlayerLasers(ctx, state, w, h, time) {
  for (const slot of ["host", "guest"]) {
    const p = state.players[slot];
    if (!p || p.lives <= 0 || p.weapon !== "laser") continue;
    drawPlayerLaserBeam(ctx, p, w, h, time);
  }
}

function drawPlayerLaserBeam(ctx, p, w, h, time) {
  const faceDown = p.y < 0.45;
  const x = p.x * w;
  const y0 = p.y * h + (faceDown ? 14 : -14);
  const { mid } = zoneBounds(h);
  const top = faceDown ? h * 0.5 : mid + 6;
  const beamH = Math.abs(y0 - top);
  if (beamH < 4) return;

  const pulse = time * 14 + (p.slot === "host" ? 0 : 1.7);
  const flicker = 0.82 + Math.sin(pulse) * 0.12 + Math.sin(time * 42) * 0.06;
  const beamW = (10 + p.power * 3.5) * (p.ship === "heavy" ? 1.15 : 1);
  const coreW = (3.5 + p.power * 0.4) * flicker;
  const midW = beamW * 0.75 * flicker;
  const yTop = Math.min(y0, top);
  const yBot = Math.max(y0, top);

  ctx.save();
  ctx.shadowColor = "#00e5ff";
  ctx.shadowBlur = 18;

  const outer = ctx.createLinearGradient(x, yBot, x, yTop);
  outer.addColorStop(0, "rgba(0, 220, 255, 0.55)");
  outer.addColorStop(0.35, "rgba(80, 200, 255, 0.28)");
  outer.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = outer;
  ctx.fillRect(x - midW * 1.4, yTop, midW * 2.8, beamH);

  const midGrd = ctx.createLinearGradient(x, yBot, x, yTop);
  midGrd.addColorStop(0, "rgba(120, 240, 255, 0.9)");
  midGrd.addColorStop(0.5, "rgba(60, 180, 255, 0.65)");
  midGrd.addColorStop(1, "rgba(200,240,255,0)");
  ctx.fillStyle = midGrd;
  ctx.fillRect(x - midW, yTop, midW * 2, beamH);

  ctx.fillStyle = `rgba(255,255,255,${0.92 * flicker})`;
  ctx.fillRect(x - coreW * 0.5, yTop, coreW, beamH);

  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.arc(x, y0 + (faceDown ? -2 : 2), 5 * flicker, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
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
  ctx.fillStyle = "rgba(8, 18, 32, 0.82)";
  ctx.fillRect(0, 0, w, 40);
  ctx.strokeStyle = "rgba(61, 107, 138, 0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 40);
  ctx.lineTo(w, 40);
  ctx.stroke();

  ctx.fillStyle = "#e8f4ff";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  if (state.mode === "coop") {
    const hL = state.players.host.lives;
    const gL = state.players.guest.lives;
    ctx.fillStyle = "#ffd54a";
    ctx.fillText(`合作 · 總分 ${state.teamScore}`, 10, 14);
    ctx.fillStyle = "#e8f4ff";
    ctx.font = "11px sans-serif";
    ctx.fillText(
      `${names.host || "房主"} ${"♥".repeat(hL)}  ·  ${names.guest || "來賓"} ${"♥".repeat(gL)}  ·  ${Math.floor(state.t)}s`,
      10,
      30,
    );
  } else {
    const left = Math.max(0, Math.ceil(VERSUS_TIME - state.t));
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffd54a";
    ctx.fillText(
      `${state.scores[mySlot] || 0}  :  ${left}s  :  ${state.scores[other(mySlot)] || 0}`,
      w / 2,
      20,
    );
    ctx.font = "10px sans-serif";
    ctx.fillStyle = "#e8f4ff";
    ctx.fillText(`你 · ${names[mySlot] || ""}`, w * 0.2, 20);
    ctx.fillText(`${names[other(mySlot)] || ""}`, w * 0.8, 20);
  }
}

function other(slot) {
  return slot === "host" ? "guest" : "host";
}
