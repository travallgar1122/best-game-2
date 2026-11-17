// STARFALL DEFENSE — the simulation. A pure, DOM-free world: invaders walk
// the star-road, towers pick the invader furthest along it, projectiles
// home and burst, and the economy of gold, lives and score ticks over.
// main.js drives it in fixed steps and drains state.events for sound;
// render.js only ever reads it. Because nothing here touches the browser,
// the whole game can be played headlessly by a test with the same code
// the browser runs.

import {
  CELL, ROAD_CELLS, ROAD_POINTS, ROAD_LENGTH, START_GOLD, START_LIVES,
  TOTAL_WAVES, TOWERS, INVADERS, WAVES, HP_GROWTH, SELL_RATE,
  CALL_EARLY_PER_SECOND, LEVEL_DAMAGE, LEVEL_RATE, LEVEL_RANGE, MAX_LEVEL,
  upgradeCost, waveClearBonus, cellCenter,
} from './config.js';
import { makeRng } from './random.js';

export const PHASE_TITLE = 'title';
export const PHASE_BUILD = 'build';
export const PHASE_WAVE = 'wave';
export const PHASE_OVER = 'over';
export const PHASE_WON = 'won';

const BUILD_COUNTDOWN = 30; // seconds before the next wave marches on its own
const MAX_PARTICLES = 700;
const MAX_FLOATERS = 40;

// Cumulative road geometry, worked out once: CUM[i] is the distance from
// the road's start to ROAD_POINTS[i].
const CUM = [0];
for (let i = 1; i < ROAD_POINTS.length; i += 1) {
  CUM.push(CUM[i - 1] + Math.hypot(
    ROAD_POINTS[i].x - ROAD_POINTS[i - 1].x,
    ROAD_POINTS[i].y - ROAD_POINTS[i - 1].y,
  ));
}

/** Point at distance `dist` along the road, with its travel direction. */
function roadPose(dist) {
  if (dist <= 0) {
    const a = ROAD_POINTS[0];
    const b = ROAD_POINTS[1];
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: a.x, y: a.y, dx: (b.x - a.x) / d, dy: (b.y - a.y) / d };
  }
  let i = 1;
  while (i < CUM.length - 1 && CUM[i] < dist) i += 1;
  const segLen = CUM[i] - CUM[i - 1] || 1;
  const t = (dist - CUM[i - 1]) / segLen;
  const a = ROAD_POINTS[i - 1];
  const b = ROAD_POINTS[i];
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    dx: (b.x - a.x) / segLen,
    dy: (b.y - a.y) / segLen,
  };
}

/** Is (col,row) a road cell? Road cells can never hold a tower. */
const ROAD_SET = new Set(ROAD_CELLS.map(([c, r]) => `${c},${r}`));
export function isRoad(col, row) {
  return ROAD_SET.has(`${col},${row}`);
}

export function createWorld(seed) {
  const state = {
    phase: PHASE_TITLE,
    time: 0,
    gold: START_GOLD,
    lives: START_LIVES,
    score: 0,
    wave: 0,
    kills: 0,
    leaks: 0,
    towers: [],
    enemies: [],
    projectiles: [],
    particles: [],
    floaters: [],
    events: [],
    spawnQueue: [], // [{at, kind}] times in seconds from the wave's start
    waveTime: 0,
    buildTimer: null, // seconds until the next wave auto-starts (build phase)
    buildKind: 'arrow', // tower card currently chosen in the panel
    selectedId: null, // tower the player clicked, shown in the panel
    hover: null, // {col,row} under the mouse, for the placement ghost
    demo: [], // decorative marchers on the title screen
    demoClock: 0,
    shake: 0,
  };
  let rng = makeRng(seed);
  let nextId = 1;

  function emit(type, extra) {
    // Capped: while the game is paused the consumer drains nothing, and a
    // burst of queued clicks must not become a burst of queued sounds.
    if (state.events.length >= 64) state.events.shift();
    state.events.push({ type, ...extra });
  }

  function towerAt(col, row) {
    return state.towers.find((t) => t.col === col && t.row === row) ?? null;
  }

  function canBuild(col, row) {
    return !isRoad(col, row) && !towerAt(col, row);
  }

  function burst(x, y, color, n, speed, life, size) {
    for (let i = 0; i < n; i += 1) {
      if (state.particles.length >= MAX_PARTICLES) state.particles.shift();
      const a = rng.angle();
      const v = rng.range(speed * 0.25, speed);
      state.particles.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: rng.range(life * 0.5, life),
        maxLife: life,
        size: rng.range(size * 0.5, size),
        color,
      });
    }
  }

  function floater(x, y, text, color) {
    if (state.floaters.length >= MAX_FLOATERS) state.floaters.shift();
    state.floaters.push({ x, y, text, color, life: 0.95, maxLife: 0.95 });
  }

  // --- Player actions -------------------------------------------------------

  function reset() {
    rng = makeRng(seed);
    nextId = 1;
    Object.assign(state, {
      phase: PHASE_TITLE,
      time: 0,
      gold: START_GOLD,
      lives: START_LIVES,
      score: 0,
      wave: 0,
      kills: 0,
      leaks: 0,
      towers: [],
      enemies: [],
      projectiles: [],
      particles: [],
      floaters: [],
      events: [],
      spawnQueue: [],
      waveTime: 0,
      buildTimer: null,
      selectedId: null,
      hover: null,
      demo: [],
      demoClock: 0,
      shake: 0,
    });
  }

  function startGame() {
    if (state.phase !== PHASE_TITLE) return;
    state.phase = PHASE_BUILD;
    state.buildTimer = null; // the first wave waits for the player's word
    emit('wave', { start: true });
  }

  function sendWave(manual) {
    if (state.phase !== PHASE_BUILD) return false;
    if (state.wave >= TOTAL_WAVES) return false;
    if (manual && state.buildTimer !== null && state.buildTimer > 0) {
      const bonus = Math.ceil(state.buildTimer) * CALL_EARLY_PER_SECOND;
      state.gold += bonus;
      state.score += bonus * 5;
      floater(880, 130, `Early call +${bonus}g`, '#ffd166');
      emit('coin');
    }
    state.wave += 1;
    state.buildTimer = null;
    state.waveTime = 0;
    state.spawnQueue = [];
    const hpScale = HP_GROWTH ** (state.wave - 1);
    for (const [kind, count, gap, delay] of WAVES[state.wave - 1]) {
      for (let i = 0; i < count; i += 1) {
        state.spawnQueue.push({ at: delay + i * gap, kind, hpScale });
      }
    }
    state.spawnQueue.sort((a, b) => a.at - b.at);
    state.phase = PHASE_WAVE;
    emit('wave', { wave: state.wave });
    return true;
  }

  function buildAt(col, row) {
    if (state.phase !== PHASE_BUILD && state.phase !== PHASE_WAVE) return false;
    const kind = state.buildKind;
    const def = TOWERS[kind];
    if (!canBuild(col, row) || state.gold < def.cost) {
      emit('deny');
      return false;
    }
    state.gold -= def.cost;
    const tower = {
      id: nextId++,
      kind,
      col,
      row,
      level: 1,
      invested: def.cost,
      cooldown: 0,
      angle: -Math.PI / 2,
      flash: 0,
    };
    state.towers.push(tower);
    state.selectedId = tower.id;
    const c = cellCenter(col, row);
    burst(c.x, c.y, def.color, 10, 90, 0.4, 3);
    emit('build', { kind });
    return true;
  }

  function selectedTower() {
    return state.towers.find((t) => t.id === state.selectedId) ?? null;
  }

  function upgradeSelected() {
    const t = selectedTower();
    if (!t || t.level >= MAX_LEVEL) return false;
    const cost = upgradeCost(t.kind, t.level);
    if (state.gold < cost) {
      emit('deny');
      return false;
    }
    state.gold -= cost;
    t.invested += cost;
    t.level += 1;
    const c = cellCenter(t.col, t.row);
    burst(c.x, c.y, '#ffffff', 14, 110, 0.45, 3);
    emit('upgrade');
    return true;
  }

  function sellSelected() {
    const t = selectedTower();
    if (!t) return false;
    const refund = Math.floor(t.invested * SELL_RATE);
    state.gold += refund;
    state.towers = state.towers.filter((o) => o !== t);
    state.selectedId = null;
    const c = cellCenter(t.col, t.row);
    floater(c.x, c.y - 16, `+${refund}g`, '#ffd166');
    emit('sell');
    return true;
  }

  // --- Combat -----------------------------------------------------------------

  function spawnEnemy(kind, hpScale) {
    const def = INVADERS[kind];
    const hp = Math.round(def.hp * hpScale);
    state.enemies.push({
      id: nextId++,
      kind,
      hp,
      maxHp: hp,
      dist: 0,
      x: ROAD_POINTS[0].x,
      y: ROAD_POINTS[0].y,
      slowUntil: 0,
      slowF: 1,
      radius: def.radius,
      bounty: def.bounty,
      leak: def.leak,
      cellsPerSecond: def.speed,
      wob: rng.range(0, Math.PI * 2),
      dead: false,
      leaked: false,
    });
  }

  function damage(enemy, amount) {
    if (enemy.dead || enemy.leaked) return;
    enemy.hp -= amount;
    if (enemy.hp > 0) return;
    enemy.dead = true;
    state.gold += enemy.bounty;
    state.score += enemy.bounty * 10;
    state.kills += 1;
    const def = INVADERS[enemy.kind];
    burst(enemy.x, enemy.y, def.color, enemy.kind === 'tank' ? 22 : 11, 150, 0.55, 3.5);
    floater(enemy.x, enemy.y - 16, `+${enemy.bounty}`, '#ffd166');
    emit('die', { kind: enemy.kind, big: enemy.kind === 'tank' });
  }

  function towerStats(t) {
    const def = TOWERS[t.kind];
    return {
      damage: def.damage * LEVEL_DAMAGE[t.level - 1],
      rate: def.rate * LEVEL_RATE[t.level - 1],
      rangePx: def.range * CELL * LEVEL_RANGE[t.level - 1],
      splashPx: def.splash * CELL,
      slowFactor: def.slowFactor,
      slowSeconds: def.slowSeconds,
      bulletSpeed: def.bulletSpeed,
      color: def.color,
    };
  }

  function fire(t, target, st) {
    const c = cellCenter(t.col, t.row);
    state.projectiles.push({
      x: c.x,
      y: c.y,
      target,
      tx: target.x,
      ty: target.y,
      speed: st.bulletSpeed,
      damage: st.damage,
      splashPx: st.splashPx,
      slowFactor: st.slowFactor,
      slowSeconds: st.slowSeconds,
      kind: t.kind,
      color: st.color,
    });
    t.flash = 0.09;
    t.angle = Math.atan2(target.y - c.y, target.x - c.x);
    emit('shoot', { kind: t.kind });
  }

  function impact(p) {
    if (p.splashPx > 0) {
      emit('boom');
      burst(p.tx, p.ty, p.color, 14, 170, 0.4, 3.5);
      for (const e of state.enemies) {
        if (e.dead || e.leaked) continue;
        if (Math.hypot(e.x - p.tx, e.y - p.ty) <= p.splashPx + e.radius * 0.5) {
          damage(e, p.damage);
        }
      }
      return;
    }
    const e = p.target;
    if (e && !e.dead && !e.leaked && Math.hypot(e.x - p.tx, e.y - p.ty) <= 30) {
      if (p.slowFactor > 0) {
        e.slowUntil = state.time + p.slowSeconds;
        e.slowF = p.slowFactor;
        burst(e.x, e.y, p.color, 5, 70, 0.35, 2.5);
        emit('chill');
      }
      damage(e, p.damage);
    }
  }

  // --- The step -----------------------------------------------------------------

  function step(dt) {
    state.time += dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 2.2);

    // Particles and floaters always drift, whatever the phase.
    for (const pt of state.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.92;
      pt.vy *= 0.92;
      pt.life -= dt;
    }
    state.particles = state.particles.filter((pt) => pt.life > 0);
    for (const f of state.floaters) {
      f.y -= 34 * dt;
      f.life -= dt;
    }
    state.floaters = state.floaters.filter((f) => f.life > 0);

    if (state.phase === PHASE_TITLE) {
      // A decorative march crosses the board behind the title: one invader
      // every 1.4 s, walking the whole road and vanishing at the far edge.
      state.demoClock -= dt;
      if (state.demoClock <= 0 && state.demo.length < 7) {
        state.demoClock = 1.4;
        const kinds = ['grunt', 'runner', 'mite', 'tank'];
        const n = state.demo.length;
        state.demo.push({ kind: kinds[n % kinds.length], dist: 0, wob: (n * 1.71) % (Math.PI * 2) });
      }
      for (const d of state.demo) d.dist += INVADERS[d.kind].speed * CELL * dt;
      state.demo = state.demo.filter((d) => d.dist < ROAD_LENGTH);
      return;
    }
    if (state.phase === PHASE_OVER || state.phase === PHASE_WON) return;

    if (state.phase === PHASE_BUILD) {
      if (state.buildTimer !== null) {
        state.buildTimer -= dt;
        if (state.buildTimer <= 0) sendWave(false);
      }
      return;
    }

    // PHASE_WAVE: spawn what is due.
    state.waveTime += dt;
    while (state.spawnQueue.length > 0 && state.spawnQueue[0].at <= state.waveTime) {
      const s = state.spawnQueue.shift();
      spawnEnemy(s.kind, s.hpScale);
    }

    // Move the invaders along the road.
    for (const e of state.enemies) {
      const slowed = state.time < e.slowUntil;
      const speedPx = e.cellsPerSecond * CELL * (slowed ? e.slowF : 1);
      e.dist += speedPx * dt;
      if (e.dist >= ROAD_LENGTH) {
        e.leaked = true;
        state.lives -= e.leak;
        state.leaks += 1;
        state.shake = Math.min(1, state.shake + 0.45);
        burst(ROAD_POINTS[ROAD_POINTS.length - 1].x - 30, e.y, '#ff5c7a', 12, 130, 0.5, 3.5);
        floater(980, e.y - 14, `-${e.leak} life`, '#ff5c7a');
        emit('leak', { leak: e.leak });
        continue;
      }
      const pose = roadPose(e.dist);
      const wobble = e.kind === 'tank' ? 0 : Math.sin(e.dist * 0.045 + e.wob) * 3;
      e.x = pose.x - pose.dy * wobble;
      e.y = pose.y + pose.dx * wobble;
    }

    // Towers acquire and fire.
    for (const t of state.towers) {
      if (t.flash > 0) t.flash -= dt;
      t.cooldown -= dt;
      const st = towerStats(t);
      const cc = cellCenter(t.col, t.row);
      const cx = cc.x;
      const cy = cc.y;
      let best = null;
      for (const e of state.enemies) {
        if (e.dead || e.leaked) continue;
        if (Math.hypot(e.x - cx, e.y - cy) > st.rangePx + e.radius) continue;
        if (!best || e.dist > best.dist) best = e;
      }
      if (best) {
        t.angle = Math.atan2(best.y - cy, best.x - cx);
        if (t.cooldown <= 0) {
          fire(t, best, st);
          t.cooldown = 1 / st.rate;
        }
      }
    }

    // Projectiles home to their target's last known position and burst.
    for (const p of state.projectiles) {
      if (p.target && !p.target.dead && !p.target.leaked) {
        p.tx = p.target.x;
        p.ty = p.target.y;
      }
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      const travel = p.speed * dt;
      if (d <= Math.max(travel, 6)) {
        p.x = p.tx;
        p.y = p.ty;
        p.done = true;
        impact(p);
      } else {
        p.x += (dx / d) * travel;
        p.y += (dy / d) * travel;
      }
    }
    state.projectiles = state.projectiles.filter((p) => !p.done);

    // Sweep the fallen and the leaked.
    state.enemies = state.enemies.filter((e) => !e.dead && !e.leaked);

    if (state.lives <= 0) {
      state.lives = 0;
      state.phase = PHASE_OVER;
      state.shake = 1;
      emit('over');
      return;
    }

    // Wave cleared?
    if (state.spawnQueue.length === 0 && state.enemies.length === 0) {
      const bonus = waveClearBonus(state.wave, state.gold);
      state.gold += bonus.total;
      state.score += state.wave * 100;
      emit('clear', { wave: state.wave, bonus: bonus.total });
      if (state.wave >= TOTAL_WAVES) {
        state.score += state.lives * 150 + state.gold;
        state.phase = PHASE_WON;
        emit('won');
      } else {
        state.phase = PHASE_BUILD;
        state.buildTimer = BUILD_COUNTDOWN;
      }
    }
  }

  return {
    state,
    reset,
    startGame,
    sendWave,
    buildAt,
    upgradeSelected,
    sellSelected,
    selectedTower,
    towerAt,
    canBuild,
    towerStats,
    step,
  };
}
