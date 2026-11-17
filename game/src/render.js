// STARFALL DEFENSE — all drawing, and the one place that knows where the
// buttons live. render.js exports the UI rectangles and a hitTest so that
// main.js can turn clicks into actions without duplicating geometry, and
// drawFrame paints one frame from the world state: the starfield, the
// road, towers and invaders, then the HUD, the side panel and whichever
// screen overlay the run is on. It never mutates the world.

import {
  FIELD, CELL, COLS, ROWS, GRID_X, GRID_Y, PANEL_X, PANEL_W, ROAD_POINTS,
  TOWERS, TOWER_ORDER, INVADERS, TOTAL_WAVES, MAX_LEVEL, COLORS,
  START_LIVES, upgradeCost, cellCenter,
} from './config.js';
import { isRoad, PHASE_BUILD, PHASE_OVER, PHASE_TITLE, PHASE_WAVE, PHASE_WON } from './world.js';
import { makeRng } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_OVER = 'over';
export const SCREEN_WON = 'won';

// --- UI geometry (single source of truth for drawing and clicking) --------
const PX = PANEL_X + 12; // panel content left edge
const PW = PANEL_W - 24; // panel content width
export const UI = {
  cards: {},
  selectedBox: { x: PX, y: 408, w: PW, h: 148 },
  upgrade: { x: PX + 4, y: 512, w: 84, h: 32 },
  sell: { x: PX + 92, y: 512, w: 80, h: 32 },
  wave: { x: PX, y: 568, w: PW, h: 52 },
  pause: { x: PX, y: 632, w: 56, h: 38 },
  speed: { x: PX + 60, y: 632, w: 56, h: 38 },
  mute: { x: PX + 120, y: 632, w: 56, h: 38 },
  start: { x: FIELD.width / 2 - 150, y: 516, w: 300, h: 60 },
  restart: { x: FIELD.width / 2 - 150, y: 486, w: 300, h: 56 },
};
TOWER_ORDER.forEach((kind, i) => {
  UI.cards[kind] = { x: PX, y: 116 + i * 96, w: PW, h: 88 };
});

function inRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/** What a click at field (x,y) means, given the world state and screen. */
export function hitTest(state, screen, x, y) {
  if (screen === SCREEN_TITLE) {
    return inRect(x, y, UI.start) ? { type: 'start' } : { type: 'none' };
  }
  if (screen === SCREEN_OVER || screen === SCREEN_WON) {
    return inRect(x, y, UI.restart) ? { type: 'restart' } : { type: 'none' };
  }
  for (const kind of TOWER_ORDER) {
    if (inRect(x, y, UI.cards[kind])) return { type: 'card', kind };
  }
  if (state.selectedId !== null) {
    if (inRect(x, y, UI.upgrade)) return { type: 'upgrade' };
    if (inRect(x, y, UI.sell)) return { type: 'sell' };
  }
  if (inRect(x, y, UI.wave)) return { type: 'wave' };
  if (inRect(x, y, UI.pause)) return { type: 'pause' };
  if (inRect(x, y, UI.speed)) return { type: 'speed' };
  if (inRect(x, y, UI.mute)) return { type: 'mute' };
  const col = Math.floor((x - GRID_X) / CELL);
  const row = Math.floor((y - GRID_Y) / CELL);
  if (col >= 0 && col < COLS && row >= 0 && row < ROWS) return { type: 'cell', col, row };
  return { type: 'none' };
}

/** Grid cell under a field point, or null outside the board. */
export function cellAt(x, y) {
  const col = Math.floor((x - GRID_X) / CELL);
  const row = Math.floor((y - GRID_Y) / CELL);
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
  return { col, row };
}

// --- Starfield ---------------------------------------------------------------
// Fixed stars from a fixed seed: the night sky is the same in every frame
// of every run, only the twinkle phase moves with the world's clock.
const STARS = (() => {
  const rng = makeRng(20261117);
  const stars = [];
  for (let i = 0; i < 190; i += 1) {
    stars.push({
      x: rng.range(0, FIELD.width),
      y: rng.range(0, FIELD.height),
      r: rng.range(0.6, 1.9),
      p: rng.range(0, Math.PI * 2),
      s: rng.range(0.4, 1.4),
    });
  }
  return stars;
})();

// Road pose for drawing chevrons: same walk as the world's, kept local so
// render never reaches into the simulation's internals.
const ROAD_CUM = [0];
for (let i = 1; i < ROAD_POINTS.length; i += 1) {
  ROAD_CUM.push(ROAD_CUM[i - 1] + Math.hypot(
    ROAD_POINTS[i].x - ROAD_POINTS[i - 1].x,
    ROAD_POINTS[i].y - ROAD_POINTS[i - 1].y,
  ));
}
const ROAD_TOTAL = ROAD_CUM[ROAD_CUM.length - 1];
function poseAt(dist) {
  let i = 1;
  while (i < ROAD_CUM.length - 1 && ROAD_CUM[i] < dist) i += 1;
  const seg = ROAD_CUM[i] - ROAD_CUM[i - 1] || 1;
  const t = (dist - ROAD_CUM[i - 1]) / seg;
  const a = ROAD_POINTS[i - 1];
  const b = ROAD_POINTS[i];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dx: (b.x - a.x) / seg, dy: (b.y - a.y) / seg };
}

// --- Small drawing helpers -----------------------------------------------------
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
function text(ctx, str, x, y, size, color, align = 'left', weight = 600) {
  ctx.font = `${weight} ${size}px system-ui, 'Segoe UI', sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}
function circle(ctx, x, y, r, color) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

// --- The board -------------------------------------------------------------------
function drawBoard(ctx, state) {
  const grad = ctx.createLinearGradient(0, 0, 0, FIELD.height);
  grad.addColorStop(0, COLORS.nightSoft);
  grad.addColorStop(1, COLORS.night);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  for (const s of STARS) {
    const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(state.time * s.s + s.p));
    ctx.globalAlpha = tw;
    circle(ctx, s.x, s.y, s.r, '#cfe0ff');
  }
  ctx.globalAlpha = 1;

  // Grid cells: a faint checker so empty ground reads as buildable land.
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if (isRoad(c, r)) continue;
      ctx.fillStyle = (c + r) % 2 === 0 ? 'rgba(125,160,255,0.045)' : 'rgba(125,160,255,0.015)';
      ctx.fillRect(GRID_X + c * CELL + 1, GRID_Y + r * CELL + 1, CELL - 2, CELL - 2);
    }
  }
  ctx.strokeStyle = COLORS.gridLine;
  ctx.lineWidth = 1;
  ctx.strokeRect(GRID_X, GRID_Y, COLS * CELL, ROWS * CELL);

  // The road: a wide dark ribbon with a glowing spine and marching chevrons.
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ROAD_POINTS.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.strokeStyle = COLORS.roadEdge;
  ctx.lineWidth = CELL * 0.94;
  ctx.stroke();
  ctx.beginPath();
  ROAD_POINTS.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.strokeStyle = COLORS.road;
  ctx.lineWidth = CELL * 0.82;
  ctx.stroke();
  ctx.save();
  ctx.strokeStyle = 'rgba(125, 162, 255, 0.16)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 14]);
  ctx.lineDashOffset = -state.time * 26;
  ctx.beginPath();
  ROAD_POINTS.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = 'rgba(190, 210, 255, 0.5)';
  const chevStep = 150;
  const chevOff = (state.time * 42) % chevStep;
  for (let d = chevOff; d < ROAD_TOTAL; d += chevStep) {
    const p = poseAt(d);
    const s = 7;
    ctx.beginPath();
    ctx.moveTo(p.x + p.dx * s, p.y + p.dy * s);
    ctx.lineTo(p.x - p.dy * s * 0.7 - p.dx * s * 0.4, p.y + p.dx * s * 0.7 - p.dy * s * 0.4);
    ctx.lineTo(p.x + p.dy * s * 0.7 - p.dx * s * 0.4, p.y - p.dx * s * 0.7 - p.dy * s * 0.4);
    ctx.closePath();
    ctx.fill();
  }

  // Portals: where the night lets them in, and where it must not let them out.
  const entry = ROAD_POINTS[0];
  const exit = ROAD_POINTS[ROAD_POINTS.length - 1];
  const pulse = 0.6 + 0.4 * Math.sin(state.time * 3);
  ctx.save();
  ctx.shadowColor = '#7da2ff';
  ctx.shadowBlur = 18 * pulse;
  circle(ctx, GRID_X + 6, entry.y, 13, '#31498c');
  circle(ctx, GRID_X + 6, entry.y, 7, '#aebfff');
  ctx.shadowColor = '#ff5c7a';
  circle(ctx, GRID_X + COLS * CELL - 6, exit.y, 13, '#8f1e38');
  circle(ctx, GRID_X + COLS * CELL - 6, exit.y, 7, '#ffb3c2');
  ctx.restore();
}

// --- Pieces ------------------------------------------------------------------------
function drawTowerShape(ctx, kind, x, y, angle, level, flash) {
  const def = TOWERS[kind];
  // Pedestal.
  rr(ctx, x - 24, y - 24, 48, 48, 9);
  ctx.fillStyle = '#131c40';
  ctx.fill();
  ctx.strokeStyle = def.dark;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  if (kind === 'arrow') {
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(-8, -8);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-8, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-14, -3, 16, 6);
  } else if (kind === 'cannon') {
    ctx.fillStyle = def.dark;
    ctx.fillRect(2, -7, 22, 14);
    ctx.fillStyle = def.color;
    circle(ctx, 0, 0, 13);
    ctx.fillStyle = '#2a1408';
    circle(ctx, 22, 0, 5);
  } else {
    ctx.rotate(-angle); // the obelisk does not aim; it simply glows
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.moveTo(0, -19);
    ctx.lineTo(11, 0);
    ctx.lineTo(0, 19);
    ctx.lineTo(-11, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    circle(ctx, 0, 0, 4.5);
  }
  ctx.restore();
  if (flash > 0) {
    ctx.globalAlpha = Math.min(1, flash * 6);
    circle(ctx, x, y, 24, '#ffffff');
    ctx.globalAlpha = 1;
  }
  // Level pips.
  for (let i = 0; i < level; i += 1) {
    circle(ctx, x - 10 + i * 10, y + 29, 3, def.color);
  }
}

function drawEnemyShape(ctx, e, state) {
  const def = INVADERS[e.kind];
  const slowed = state.time < e.slowUntil;
  ctx.save();
  ctx.translate(e.x, e.y);
  if (e.kind === 'runner') ctx.rotate(Math.sin(e.dist * 0.05 + e.wob) * 0.2);
  // Body: a dark rim and a lit core, so kinds read at a glance.
  circle(ctx, 0, 0, e.radius, def.dark);
  circle(ctx, 0, 0, e.radius * 0.72, def.color);
  if (e.kind === 'tank') {
    ctx.strokeStyle = '#ffd9de';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, e.radius * 0.45, 0, Math.PI * 2);
    ctx.stroke();
    circle(ctx, 0, 0, 5, '#fff');
  } else if (e.kind === 'grunt') {
    ctx.fillStyle = def.dark;
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2 + e.wob;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * e.radius * 0.95, Math.sin(a) * e.radius * 0.95);
      ctx.lineTo(Math.cos(a + 0.35) * e.radius * 0.55, Math.sin(a + 0.35) * e.radius * 0.55);
      ctx.lineTo(Math.cos(a - 0.35) * e.radius * 0.55, Math.sin(a - 0.35) * e.radius * 0.55);
      ctx.closePath();
      ctx.fill();
    }
    circle(ctx, 0, 0, 4, '#fff');
  } else if (e.kind === 'runner') {
    ctx.fillStyle = '#eafffb';
    ctx.beginPath();
    ctx.moveTo(e.radius * 0.6, 0);
    ctx.lineTo(-e.radius * 0.4, -4.5);
    ctx.lineTo(-e.radius * 0.4, 4.5);
    ctx.closePath();
    ctx.fill();
  } else {
    circle(ctx, -4, -3, 3, '#f4ffd6');
    circle(ctx, 4, 3, 2.4, '#f4ffd6');
  }
  if (slowed) {
    ctx.globalAlpha = 0.55;
    circle(ctx, 0, 0, e.radius + 2, '#7de3ff');
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  // Hit-point bar, only once the invader has been scratched.
  if (e.hp < e.maxHp) {
    const w = e.radius * 2;
    const frac = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = 'rgba(4, 6, 16, 0.8)';
    ctx.fillRect(e.x - e.radius, e.y - e.radius - 11, w, 5);
    ctx.fillStyle = frac > 0.5 ? '#7dffb0' : frac > 0.25 ? '#ffd166' : '#ff5c7a';
    ctx.fillRect(e.x - e.radius + 0.5, e.y - e.radius - 10.5, (w - 1) * frac, 4);
  }
}

function drawPieces(ctx, state, world) {
  for (const d of state.demo) {
    const p = poseAt(d.dist);
    drawEnemyShape(ctx, { ...d, x: p.x, y: p.y, hp: 1, maxHp: 1, radius: INVADERS[d.kind].radius, slowUntil: 0 }, state);
  }
  for (const e of state.enemies) drawEnemyShape(ctx, e, state);

  // Placement ghost and range preview.
  if (state.hover && (state.phase === PHASE_BUILD || state.phase === PHASE_WAVE)) {
    const { col, row } = state.hover;
    const c = cellCenter(col, row);
    const def = TOWERS[state.buildKind];
    const ok = world.canBuild(col, row) && state.gold >= def.cost;
    ctx.beginPath();
    ctx.arc(c.x, c.y, def.range * CELL, 0, Math.PI * 2);
    ctx.fillStyle = ok ? 'rgba(255, 209, 102, 0.06)' : 'rgba(255, 92, 122, 0.05)';
    ctx.fill();
    ctx.strokeStyle = ok ? 'rgba(255, 209, 102, 0.35)' : 'rgba(255, 92, 122, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 0.55;
    drawTowerShape(ctx, state.buildKind, c.x, c.y, -Math.PI / 2, 1, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = ok ? COLORS.cellHover : COLORS.cellBad;
    ctx.fillRect(GRID_X + col * CELL + 1, GRID_Y + row * CELL + 1, CELL - 2, CELL - 2);
  }

  for (const t of state.towers) {
    const c = cellCenter(t.col, t.row);
    if (state.selectedId === t.id) {
      const st = world.towerStats(t);
      ctx.beginPath();
      ctx.arc(c.x, c.y, st.rangePx, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(234, 240, 255, 0.05)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(234, 240, 255, 0.4)';
      ctx.stroke();
      rr(ctx, c.x - 27, c.y - 27, 54, 54, 10);
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    drawTowerShape(ctx, t.kind, c.x, c.y, t.angle, t.level, t.flash);
  }

  for (const p of state.projectiles) {
    const dx = p.tx - p.x;
    const dy = p.ty - p.y;
    const d = Math.hypot(dx, dy) || 1;
    ctx.strokeStyle = p.color;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x - (dx / d) * 11, p.y - (dy / d) * 11);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    circle(ctx, p.x, p.y, p.kind === 'cannon' ? 5 : 3.4, p.color);
  }

  for (const pt of state.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    circle(ctx, pt.x, pt.y, pt.size, pt.color);
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  for (const f of state.floaters) {
    ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
    text(ctx, f.text, f.x, f.y, 14, f.color, 'center', 700);
  }
  ctx.globalAlpha = 1;
}

// --- HUD and panel -------------------------------------------------------------------
function drawHud(ctx, state) {
  ctx.fillStyle = 'rgba(6, 9, 22, 0.92)';
  ctx.fillRect(0, 0, FIELD.width, 64);
  ctx.fillStyle = COLORS.panelEdge;
  ctx.fillRect(0, 64, FIELD.width, 2);
  circle(ctx, 36, 32, 11, COLORS.gold);
  text(ctx, 'g', 36, 33, 13, '#7a5b00', 'center', 800);
  text(ctx, `${state.gold}`, 56, 33, 22, COLORS.ink, 'left', 700);
  text(ctx, '♥', 196, 33, 22, COLORS.heart, 'left', 700);
  text(ctx, `${state.lives}`, 224, 33, 22, state.lives <= 5 ? COLORS.bad : COLORS.ink, 'left', 700);
  text(ctx, `WAVE ${Math.max(1, state.wave)}/${TOTAL_WAVES}`, 330, 33, 19, COLORS.inkDim, 'left', 700);
  if (state.phase === PHASE_WAVE) {
    const left = state.enemies.length + state.spawnQueue.length;
    text(ctx, `${left} invader${left === 1 ? '' : 's'} on the road`, 560, 33, 16, COLORS.inkDim, 'left', 600);
  } else if (state.phase === PHASE_BUILD && state.wave > 0) {
    text(ctx, 'the valley holds — for now', 560, 33, 16, COLORS.good, 'left', 600);
  }
  text(ctx, `SCORE ${state.score}`, 1024, 33, 20, COLORS.ink, 'right', 700);
  text(ctx, 'STARFALL DEFENSE', 1180, 33, 15, COLORS.inkDim, 'center', 800);
}

function button(ctx, r, label, sub, opts = {}) {
  const { fill = '#1a2650', edge = COLORS.panelEdge, ink = COLORS.ink, dim = false, hot = false } = opts;
  rr(ctx, r.x, r.y, r.w, r.h, 9);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = hot ? COLORS.gold : edge;
  ctx.lineWidth = hot ? 2 : 1;
  ctx.stroke();
  ctx.globalAlpha = dim ? 0.45 : 1;
  text(ctx, label, r.x + r.w / 2, r.y + (sub ? r.h / 2 - 9 : r.h / 2 + 1), opts.size ?? 15, ink, 'center', 800);
  if (sub) text(ctx, sub, r.x + r.w / 2, r.y + r.h / 2 + 12, 11.5, COLORS.inkDim, 'center', 600);
  ctx.globalAlpha = 1;
}

function drawPanel(ctx, state, ui, world) {
  ctx.fillStyle = COLORS.panel;
  ctx.fillRect(PANEL_X, 66, PANEL_W, FIELD.height - 66);
  ctx.fillStyle = COLORS.panelEdge;
  ctx.fillRect(PANEL_X, 66, 2, FIELD.height - 66);
  text(ctx, 'BUILD A TOWER', PX, 98, 13, COLORS.inkDim, 'left', 800);

  for (const kind of TOWER_ORDER) {
    const def = TOWERS[kind];
    const r = UI.cards[kind];
    const chosen = state.buildKind === kind;
    const afford = state.gold >= def.cost;
    rr(ctx, r.x, r.y, r.w, r.h, 10);
    ctx.fillStyle = chosen ? '#1d2a55' : '#101736';
    ctx.fill();
    ctx.strokeStyle = chosen ? COLORS.gold : COLORS.panelEdge;
    ctx.lineWidth = chosen ? 2 : 1;
    ctx.stroke();
    ctx.globalAlpha = afford ? 1 : 0.5;
    drawTowerShape(ctx, kind, r.x + 34, r.y + 36, kind === 'frost' ? 0 : -0.5, 1, 0);
    text(ctx, def.name, r.x + 62, r.y + 24, 12.5, COLORS.ink, 'left', 700);
    const stat = kind === 'cannon'
      ? `dmg ${def.damage} · splash`
      : kind === 'frost'
        ? `slow ${Math.round((1 - def.slowFactor) * 100)}% · ${def.slowSeconds}s`
        : `dmg ${def.damage} · fast`;
    text(ctx, stat, r.x + 62, r.y + 45, 11.5, COLORS.inkDim, 'left', 600);
    text(ctx, def.blurb, r.x + 10, r.y + 70, 10.5, COLORS.inkDim, 'left', 500);
    ctx.globalAlpha = 1;
    text(ctx, `${def.cost}g`, r.x + r.w - 8, r.y + 20, 12.5, afford ? COLORS.gold : COLORS.bad, 'right', 800);
  }

  // Selected tower box, or a hint when nothing is selected.
  const box = UI.selectedBox;
  rr(ctx, box.x, box.y, box.w, box.h, 10);
  ctx.fillStyle = '#0d1330';
  ctx.fill();
  ctx.strokeStyle = COLORS.panelEdge;
  ctx.lineWidth = 1;
  ctx.stroke();
  const sel = world.selectedTower();
  if (sel) {
    const def = TOWERS[sel.kind];
    const st = world.towerStats(sel);
    drawTowerShape(ctx, sel.kind, box.x + 30, box.y + 32, -0.5, sel.level, 0);
    text(ctx, `${def.name}`, box.x + 56, box.y + 24, 14, COLORS.ink, 'left', 700);
    text(ctx, `level ${sel.level} of ${MAX_LEVEL}`, box.x + 56, box.y + 44, 11.5, COLORS.inkDim, 'left', 600);
    text(ctx, `damage ${Math.round(st.damage)} · range ${(st.rangePx / CELL).toFixed(1)} · rate ${st.rate.toFixed(1)}/s`, box.x + 12, box.y + 74, 11.5, COLORS.inkDim, 'left', 600);
    text(ctx, `invested ${sel.invested}g`, box.x + 12, box.y + 92, 11.5, COLORS.inkDim, 'left', 600);
    if (sel.level < MAX_LEVEL) {
      const cost = upgradeCost(sel.kind, sel.level);
      button(ctx, UI.upgrade, `UP ${cost}g`, null, {
        size: 12.5,
        fill: '#274a2a',
        dim: state.gold < cost,
        hot: ui.mouseIn && inRect(ui.mouse.x, ui.mouse.y, UI.upgrade),
      });
    } else {
      text(ctx, 'MAX LEVEL', UI.upgrade.x + UI.upgrade.w / 2, UI.upgrade.y + 17, 12, COLORS.gold, 'center', 800);
    }
    button(ctx, UI.sell, `SELL ${Math.floor(sel.invested * 0.7)}g`, null, {
      size: 12.5,
      fill: '#4a2432',
      hot: ui.mouseIn && inRect(ui.mouse.x, ui.mouse.y, UI.sell),
    });
  } else {
    text(ctx, 'No tower selected.', box.x + 12, box.y + 28, 13, COLORS.ink, 'left', 700);
    text(ctx, 'Pick a card above, then tap', box.x + 12, box.y + 56, 11.5, COLORS.inkDim, 'left', 500);
    text(ctx, 'a free cell to build there.', box.x + 12, box.y + 74, 11.5, COLORS.inkDim, 'left', 500);
    text(ctx, 'Click your tower to upgrade', box.x + 12, box.y + 92, 11.5, COLORS.inkDim, 'left', 500);
    text(ctx, 'or sell it. Roads stay empty.', box.x + 12, box.y + 110, 11.5, COLORS.inkDim, 'left', 500);
  }

  // The wave button tells the story of the moment.
  let waveLabel;
  let waveSub;
  let waveDim = false;
  if (state.phase === PHASE_BUILD) {
    waveLabel = `SEND WAVE ${state.wave + 1}`;
    waveSub = state.buildTimer !== null
      ? `auto in ${Math.ceil(state.buildTimer)}s · call now +${Math.ceil(state.buildTimer) * 2}g`
      : 'when you are ready';
  } else if (state.phase === PHASE_WAVE) {
    waveLabel = `WAVE ${state.wave} INCOMING`;
    waveSub = `${state.enemies.length + state.spawnQueue.length} still out there`;
    waveDim = true;
  } else {
    waveLabel = 'THE NIGHT DECIDES';
    waveSub = '';
    waveDim = true;
  }
  button(ctx, UI.wave, waveLabel, waveSub, {
    fill: state.phase === PHASE_BUILD ? '#5a3d10' : '#1a2650',
    dim: waveDim,
    hot: state.phase === PHASE_BUILD && ui.mouseIn && inRect(ui.mouse.x, ui.mouse.y, UI.wave),
  });

  button(ctx, UI.pause, ui.paused ? '▶' : '❚❚', null, { size: 14 });
  button(ctx, UI.speed, `${ui.speed}×`, null, { size: 14 });
  button(ctx, UI.mute, ui.muted ? '✕♪' : '♪', null, { size: 14 });

  text(ctx, 'Space send wave · P pause', PX, 700, 11, COLORS.inkDim, 'left', 500);
  text(ctx, 'F speed · M sound · Esc cancel', PX, 720, 11, COLORS.inkDim, 'left', 500);
  text(ctx, 'Survive all 15 waves.', PX, 756, 11.5, COLORS.inkDim, 'left', 600);
  text(ctx, `Towers standing: ${state.towers.length}`, PX, 776, 11.5, COLORS.inkDim, 'left', 600);
}

// --- Screens ---------------------------------------------------------------------------
function drawTitle(ctx, state, ui) {
  ctx.fillStyle = 'rgba(4, 6, 16, 0.45)';
  ctx.fillRect(0, 66, FIELD.width, FIELD.height - 66);
  text(ctx, 'STARFALL', FIELD.width / 2, 196, 84, '#eaf0ff', 'center', 800);
  text(ctx, 'DEFENSE', FIELD.width / 2, 268, 84, COLORS.gold, 'center', 800);
  text(ctx, 'The invaders ride the star-road down into the valley.', FIELD.width / 2, 336, 19, COLORS.ink, 'center', 600);
  text(ctx, 'Build towers on the dark ground, hold the road for fifteen waves,', FIELD.width / 2, 366, 16, COLORS.inkDim, 'center', 500);
  text(ctx, 'and do not let twenty lives slip past the red gate.', FIELD.width / 2, 390, 16, COLORS.inkDim, 'center', 500);
  const kinds = [
    ['#ffd166', 'Arrow Spire — fast, cheap bolts'],
    ['#ff8c5a', 'Star Cannon — slow shells, wide splash'],
    ['#7de3ff', 'Frost Obelisk — chills the march to a crawl'],
  ];
  kinds.forEach(([color, line], i) => {
    circle(ctx, FIELD.width / 2 - 218, 428 + i * 26, 6, color);
    text(ctx, line, FIELD.width / 2 - 200, 429 + i * 26, 14.5, COLORS.ink, 'left', 600);
  });
  button(ctx, UI.start, 'BEGIN THE WATCH', null, {
    size: 19,
    fill: '#5a3d10',
    hot: ui.mouseIn && inRect(ui.mouse.x, ui.mouse.y, UI.start),
  });
}

function drawEnd(ctx, state, ui, wonGame) {
  ctx.fillStyle = 'rgba(4, 6, 16, 0.62)';
  ctx.fillRect(0, 66, FIELD.width, FIELD.height - 66);
  rr(ctx, FIELD.width / 2 - 320, 210, 640, 350, 16);
  ctx.fillStyle = '#0b1128';
  ctx.fill();
  ctx.strokeStyle = wonGame ? COLORS.good : COLORS.bad;
  ctx.lineWidth = 2;
  ctx.stroke();
  text(ctx, wonGame ? 'THE VALLEY HOLDS' : 'THE VALLEY FALLS', FIELD.width / 2, 268, 40, wonGame ? COLORS.good : COLORS.bad, 'center', 800);
  text(
    ctx,
    wonGame
      ? `All ${TOTAL_WAVES} waves broke against your towers.`
      : `Wave ${state.wave} was one wave too many — ${START_LIVES - state.lives} lives lost.`,
    FIELD.width / 2, 312, 16, COLORS.inkDim, 'center', 500,
  );
  const rows = [
    ['Waves survived', `${wonGame ? TOTAL_WAVES : Math.max(0, state.wave - (state.phase === PHASE_OVER ? 1 : 0))} of ${TOTAL_WAVES}`],
    ['Invaders destroyed', `${state.kills}`],
    ['Lives remaining', `${state.lives}`],
    ['Gold in the vault', `${state.gold}`],
    ['FINAL SCORE', `${state.score}`],
  ];
  rows.forEach(([k, v], i) => {
    const y = 356 + i * 30;
    text(ctx, k, FIELD.width / 2 - 200, y, 15, i === rows.length - 1 ? COLORS.gold : COLORS.inkDim, 'left', i === rows.length - 1 ? 800 : 600);
    text(ctx, v, FIELD.width / 2 + 200, y, 15, i === rows.length - 1 ? COLORS.gold : COLORS.ink, 'right', 700);
  });
  button(ctx, UI.restart, wonGame ? 'WATCH AGAIN' : 'TRY AGAIN', null, {
    size: 17,
    fill: '#274a2a',
    hot: ui.mouseIn && inRect(ui.mouse.x, ui.mouse.y, UI.restart),
  });
}

/** Paint one frame. `ui` carries {screen, paused, speed, muted, mouse:{x,y}, mouseIn}. */
export function drawFrame(ctx, state, ui, world) {
  ctx.save();
  if (state.shake > 0.02) {
    const s = state.shake * 5;
    ctx.translate(Math.sin(state.time * 91) * s, Math.cos(state.time * 83) * s);
  }
  drawBoard(ctx, state);
  drawPieces(ctx, state, world);
  ctx.restore();
  drawHud(ctx, state);
  if (ui.screen !== SCREEN_TITLE) drawPanel(ctx, state, ui, world);
  if (ui.screen === SCREEN_TITLE) drawTitle(ctx, state, ui);
  if (ui.screen === SCREEN_OVER) drawEnd(ctx, state, ui, false);
  if (ui.screen === SCREEN_WON) drawEnd(ctx, state, ui, true);
  if (ui.paused && ui.screen === SCREEN_PLAY) {
    rr(ctx, FIELD.width / 2 - 110, 84, 220, 46, 10);
    ctx.fillStyle = 'rgba(6, 9, 22, 0.9)';
    ctx.fill();
    ctx.strokeStyle = COLORS.panelEdge;
    ctx.stroke();
    text(ctx, '❚❚  PAUSED', FIELD.width / 2, 108, 18, COLORS.ink, 'center', 800);
  }
}
