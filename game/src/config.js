// STARFALL DEFENSE — every tuning number in one place: the field geometry,
// the star-road the invaders march, the three tower families, the invader
// kinds and the shape of the fifteen waves. Behaviour lives in world.js;
// this file is only the numbers that behaviour reads.

// The canvas is one fixed stage; main.js scales it to the window.
export const FIELD = { width: 1280, height: 800 };

// Simulation step (seconds). The world advances in fixed slices so a run
// is a pure function of its seed and the player's clicks.
export const STEP = 1 / 120;

// --- The board -------------------------------------------------------------
// A 16 x 11 grid of 64 px cells under a 64 px HUD bar. The side panel on
// the right (x from PANEL_X) holds the tower cards and the controls.
export const CELL = 64;
export const COLS = 16;
export const ROWS = 11;
export const GRID_X = 16;
export const GRID_Y = 80;
export const PANEL_X = 1064;
export const PANEL_W = 200;

// The star-road, as grid waypoints (col, row). Invaders enter off-screen at
// the left of row 2, wind down and across the board, and leave at the right
// of row 8. The road is drawn cell by cell from these legs.
export const ROAD_CELLS = [
  [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2],
  [9, 2], [10, 2], [11, 2], [12, 2],
  [12, 3], [12, 4], [12, 5],
  [11, 5], [10, 5], [9, 5], [8, 5], [7, 5], [6, 5], [5, 5], [4, 5], [3, 5],
  [3, 6], [3, 7], [3, 8],
  [4, 8], [5, 8], [6, 8], [7, 8], [8, 8], [9, 8], [10, 8], [11, 8],
  [12, 8], [13, 8], [14, 8], [15, 8],
];

/** Centre of a grid cell, in field pixels. */
export function cellCenter(col, row) {
  return { x: GRID_X + col * CELL + CELL / 2, y: GRID_Y + row * CELL + CELL / 2 };
}

/** The road as pixel waypoints, extended past both board edges. */
export const ROAD_POINTS = (() => {
  const pts = ROAD_CELLS.map(([c, r]) => cellCenter(c, r));
  const first = pts[0];
  const last = pts[pts.length - 1];
  return [
    { x: first.x - CELL * 1.5, y: first.y },
    ...pts,
    { x: last.x + CELL * 1.5, y: last.y },
  ];
})();

/** Total length of the road in pixels (used for "furthest along" targeting). */
export const ROAD_LENGTH = (() => {
  let total = 0;
  for (let i = 1; i < ROAD_POINTS.length; i += 1) {
    total += Math.hypot(
      ROAD_POINTS[i].x - ROAD_POINTS[i - 1].x,
      ROAD_POINTS[i].y - ROAD_POINTS[i - 1].y,
    );
  }
  return total;
})();

// --- Run economy -----------------------------------------------------------
export const START_GOLD = 220;
export const START_LIVES = 20;
export const TOTAL_WAVES = 15;
export const SELL_RATE = 0.7; // fraction of invested gold refunded on a sale
export const INTEREST_RATE = 0.05; // of banked gold, paid when a wave falls
export const INTEREST_CAP = 40;
export const CALL_EARLY_PER_SECOND = 2; // gold per second of spawn time skipped

// --- Towers ------------------------------------------------------------------
// damage: per shot. rate: shots per second. range: in cells (centre to
// centre). splash: blast radius in cells (0 = single target). slow: the
// fraction of speed an invader keeps while chilled, and for how long.
// Each level multiplies damage and slightly extends range and rate.
export const TOWERS = {
  arrow: {
    name: 'Arrow Spire',
    short: 'ARROW',
    cost: 50,
    damage: 11,
    rate: 2.6,
    range: 2.7,
    splash: 0,
    slowFactor: 0,
    slowSeconds: 0,
    bulletSpeed: 620,
    color: '#ffd166',
    dark: '#9a7414',
    blurb: 'Fast bolts, cheap and cheerful.',
  },
  cannon: {
    name: 'Star Cannon',
    short: 'CANNON',
    cost: 110,
    damage: 34,
    rate: 0.75,
    range: 2.5,
    splash: 0.95,
    slowFactor: 0,
    slowSeconds: 0,
    bulletSpeed: 430,
    color: '#ff8c5a',
    dark: '#9a4a1e',
    blurb: 'Slow shells, big splash.',
  },
  frost: {
    name: 'Frost Obelisk',
    short: 'FROST',
    cost: 80,
    damage: 5,
    rate: 1.6,
    range: 2.4,
    splash: 0,
    slowFactor: 0.45,
    slowSeconds: 1.6,
    bulletSpeed: 520,
    color: '#7de3ff',
    dark: '#1e6f8f',
    blurb: 'Chills invaders to a crawl.',
  },
};
export const TOWER_ORDER = ['arrow', 'cannon', 'frost'];
export const MAX_LEVEL = 3;
// Cost of going from level n to n+1, as a fraction of the base cost.
export const UPGRADE_COST_RATE = 0.8;
export const LEVEL_DAMAGE = [1, 1.7, 2.6]; // index: level - 1
export const LEVEL_RATE = [1, 1.15, 1.3];
export const LEVEL_RANGE = [1, 1.08, 1.16];

/** Gold to raise a tower of `kind` from `level` to the next level. */
export function upgradeCost(kind, level) {
  return Math.round(TOWERS[kind].cost * UPGRADE_COST_RATE * level);
}

// --- Invaders ----------------------------------------------------------------
// speed: cells per second. hp is the wave-1 baseline; each wave multiplies
// hit points by HP_GROWTH^(wave-1). bounty: gold paid for the kill. leak:
// lives lost when it slips off the right edge. radius: pixels.
export const INVADERS = {
  mite: {
    name: 'Mite',
    hp: 16,
    speed: 1.55,
    bounty: 4,
    leak: 1,
    radius: 13,
    color: '#b8f35c',
    dark: '#5c8a1e',
  },
  runner: {
    name: 'Runner',
    hp: 24,
    speed: 2.6,
    bounty: 6,
    leak: 1,
    radius: 14,
    color: '#5cf3e8',
    dark: '#1e8a80',
  },
  grunt: {
    name: 'Grunt',
    hp: 46,
    speed: 1.15,
    bounty: 7,
    leak: 1,
    radius: 17,
    color: '#c792ff',
    dark: '#6a3fb8',
  },
  tank: {
    name: 'Bulwark',
    hp: 240,
    speed: 0.62,
    bounty: 18,
    leak: 3,
    radius: 24,
    color: '#ff5c7a',
    dark: '#8f1e38',
  },
};
export const HP_GROWTH = 1.22;

// --- Waves -------------------------------------------------------------------
// Each wave is a list of groups: [kind, count, gapSeconds between spawns,
// delaySeconds before the group starts]. The roster unlocks a new kind
// every few waves and leans harder as the night deepens; wave 15 is the
// last stand. Survive it and the valley is saved.
export const WAVES = [
  [['grunt', 6, 1.1, 0]],
  [['grunt', 8, 0.95, 0], ['runner', 3, 0.7, 6]],
  [['runner', 8, 0.6, 0], ['grunt', 5, 1.0, 5]],
  [['mite', 14, 0.38, 0], ['grunt', 6, 0.9, 6]],
  [['grunt', 8, 0.85, 0], ['tank', 1, 1, 8]],
  [['runner', 12, 0.5, 0], ['mite', 10, 0.35, 5]],
  [['grunt', 12, 0.7, 0], ['tank', 2, 3.5, 7]],
  [['mite', 22, 0.28, 0], ['runner', 8, 0.55, 4]],
  [['tank', 3, 3.0, 0], ['grunt', 10, 0.8, 3]],
  [['runner', 16, 0.42, 0], ['tank', 2, 4.0, 6], ['mite', 12, 0.3, 8]],
  [['grunt', 16, 0.6, 0], ['runner', 10, 0.5, 5]],
  [['tank', 4, 2.6, 0], ['mite', 18, 0.26, 4]],
  [['runner', 20, 0.36, 0], ['grunt', 12, 0.65, 3], ['tank', 2, 4.0, 8]],
  [['mite', 30, 0.22, 0], ['tank', 4, 2.4, 5], ['runner', 12, 0.45, 7]],
  [['tank', 6, 2.2, 0], ['grunt', 14, 0.55, 2], ['runner', 14, 0.4, 4], ['mite', 16, 0.25, 6]],
];

/** Gold paid when a wave falls: a clear bonus plus interest on the bank. */
export function waveClearBonus(wave, gold) {
  const clear = 24 + wave * 3;
  const interest = Math.min(INTEREST_CAP, Math.floor(gold * INTEREST_RATE));
  return { clear, interest, total: clear + interest };
}

// --- Palette -------------------------------------------------------------------
export const COLORS = {
  night: '#070b1d',
  nightSoft: '#0d1430',
  gridLine: 'rgba(125, 160, 255, 0.07)',
  cellEmpty: '#0b1128',
  cellHover: 'rgba(255, 209, 102, 0.25)',
  cellBad: 'rgba(255, 92, 122, 0.3)',
  road: '#1d2a52',
  roadEdge: '#31498c',
  roadGlow: '#7da2ff',
  panel: '#0a0f26',
  panelEdge: '#26336b',
  ink: '#eaf0ff',
  inkDim: '#93a3d4',
  gold: '#ffd166',
  heart: '#ff5c7a',
  good: '#7dffb0',
  bad: '#ff5c7a',
};
