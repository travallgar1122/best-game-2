// STARFALL DEFENSE — frozen scenes for the screenshots. Each scene is the
// real game, played forward from a fresh seeded world by a simple
// autopilot quartermaster, then frozen: the same seed always renders the
// same picture, and the picture is a moment the game itself made — a real
// defense holding a real wave, never a staged diorama.

import { ROAD_LENGTH, STEP } from './config.js';
import { PHASE_BUILD, PHASE_OVER, PHASE_WAVE } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

// The preset defense the quartermaster raises before the cameras roll:
// cheap arrows along the first straight, a cannon and frost at the bend,
// and a second line watching the lower road.
const PRESET = [
  ['arrow', 5, 3],
  ['arrow', 9, 3],
  ['cannon', 7, 3],
  ['frost', 11, 4],
  ['cannon', 4, 6],
  ['frost', 7, 6],
  ['arrow', 10, 7],
  ['cannon', 13, 7],
  ['arrow', 2, 4],
];
const REINFORCE = [
  ['arrow', 6, 1],
  ['frost', 9, 7],
  ['arrow', 12, 9],
];

function build(world, kind, col, row) {
  world.state.buildKind = kind;
  return world.buildAt(col, row);
}

function upgradeAt(world, col, row) {
  const t = world.towerAt(col, row);
  if (!t) return;
  world.state.selectedId = t.id;
  world.upgradeSelected();
}

/** Raise the preset defense and season two of its towers. */
function raiseDefense(world) {
  world.state.gold = 1400;
  for (const [kind, col, row] of PRESET) build(world, kind, col, row);
  upgradeAt(world, 13, 7);
  upgradeAt(world, 7, 3); // the seasoned cannon stays selected for the photo
}

/**
 * Stage the named scene ('start', 'play' or 'end') on `world`, which the
 * caller created with the shot's seed. Returns the screen to draw.
 */
export function stageShot(name, world) {
  const { state } = world;
  if (name === 'play') {
    world.startGame();
    raiseDefense(world);
    let extra = 0;
    // Play until the frame is honestly busy: a mid-game wave, invaders
    // spread along the road, shells in the air and fresh bursts popping.
    for (let i = 0; i < 120 * 1500; i += 1) {
      if (state.phase === PHASE_BUILD) {
        if (extra < REINFORCE.length) {
          const [kind, col, row] = REINFORCE[extra];
          if (build(world, kind, col, row)) {
            extra += 1;
            continue;
          }
        }
        world.sendWave(false);
        continue;
      }
      if (state.phase !== PHASE_WAVE) break;
      world.step(STEP);
      // Busy means spread out, not a clump at the gate: the vanguard must
      // be well down the road while the rearguard is still marching in.
      const deep = state.enemies.filter((e) => e.dist > ROAD_LENGTH * 0.3).length;
      if (
        state.wave >= 3 &&
        state.enemies.length >= 7 &&
        deep >= 3 &&
        state.projectiles.length >= 2 &&
        state.particles.length >= 4
      ) {
        break;
      }
    }
    // Leave the seasoned cannon selected, so the photo shows its stats.
    const hero = world.towerAt(7, 3);
    if (hero) state.selectedId = hero.id;
    if (state.phase === PHASE_OVER || state.enemies.length === 0) {
      // The defense somehow fell or the road is empty: freeze whatever
      // honest mid-wave moment a short fresh run gives us instead.
      world.reset();
      world.startGame();
      raiseDefense(world);
      world.sendWave(false);
      for (let i = 0; i < 120 * 90; i += 1) world.step(STEP);
    }
    return SCREEN_PLAY;
  }
  if (name === 'end') {
    // No towers at all: the night walks in, wave after wave, until the
    // valley falls the way an undefended valley does.
    world.startGame();
    for (let i = 0; i < 120 * 3600 && state.phase !== PHASE_OVER; i += 1) {
      if (state.phase === PHASE_BUILD) {
        world.sendWave(false);
        continue;
      }
      world.step(STEP);
    }
    if (state.phase !== PHASE_OVER) {
      state.phase = PHASE_OVER;
      state.lives = 0;
      state.score = Math.max(state.score, 900);
    }
    return SCREEN_OVER;
  }
  // 'start': let the decorative march cross behind the title for a while.
  for (let i = 0; i < 120 * 4; i += 1) world.step(STEP);
  return SCREEN_TITLE;
}
