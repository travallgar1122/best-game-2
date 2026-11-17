// STARFALL DEFENSE — the loop and the referee. Owns the canvas, the fixed-
// step clock (with the 1x/2x speed toggle), the pause, and every decision
// that turns raw input into a world action: clicks are read against
// render.js's rectangles, keys against the phase. It also drains the
// world's event list into the audio voices after every step. In
// screenshot mode (?shot=...) it stages one frozen scene instead.

import { FIELD, STEP } from './config.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import {
  createWorld, PHASE_BUILD, PHASE_OVER, PHASE_WAVE, PHASE_WON,
} from './world.js';
import {
  drawFrame, hitTest, cellAt, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WON,
} from './render.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');

function fitCanvas() {
  const scale = Math.min(window.innerWidth / FIELD.width, window.innerHeight / FIELD.height);
  canvas.width = FIELD.width;
  canvas.height = FIELD.height;
  canvas.style.width = `${FIELD.width * scale}px`;
  canvas.style.height = `${FIELD.height * scale}px`;
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

function toField(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * FIELD.width,
    y: ((clientY - rect.top) / rect.height) * FIELD.height,
  };
}

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') ?? '1') || 1;

const audio = createAudio();
const world = createWorld(seed * 104729 + 7);
const { state } = world;

if (shotName) {
  const screen = stageShot(shotName, world);
  drawFrame(ctx, state, { screen, paused: false, speed: 1, muted: false, mouse: { x: 0, y: 0 }, mouseIn: false }, world);
  window.__shotReady = true;
} else {
  runGame();
}

function runGame() {
  const input = createInput(canvas, toField);
  let screen = SCREEN_TITLE;
  let paused = false;
  let speed = 1;
  let last = performance.now();
  let acc = 0;

  function playEvents() {
    for (const ev of state.events) {
      if (ev.type === 'shoot') audio.shoot(ev.kind);
      else if (ev.type === 'boom') audio.boom();
      else if (ev.type === 'chill') audio.chill();
      else if (ev.type === 'die') audio.die(ev.big);
      else if (ev.type === 'leak') audio.leak();
      else if (ev.type === 'coin') audio.coin();
      else if (ev.type === 'build') audio.build();
      else if (ev.type === 'sell') audio.sell();
      else if (ev.type === 'upgrade') audio.upgrade();
      else if (ev.type === 'deny') audio.deny();
      else if (ev.type === 'wave' && !ev.start) audio.wave();
      else if (ev.type === 'clear') audio.clear();
      else if (ev.type === 'over') audio.over();
      else if (ev.type === 'won') audio.won();
    }
    state.events.length = 0;
  }

  function beginRun() {
    world.reset();
    world.startGame();
    screen = SCREEN_PLAY;
    paused = false;
    acc = 0;
    status.textContent = 'Build your towers, then send wave 1.';
  }

  function handleAction(a) {
    if (a.type === 'start') {
      audio.unlock();
      beginRun();
    } else if (a.type === 'restart') {
      audio.unlock();
      beginRun();
    } else if (a.type === 'card') {
      state.buildKind = a.kind;
      state.selectedId = null;
    } else if (a.type === 'cell') {
      const t = world.towerAt(a.col, a.row);
      if (t) {
        state.selectedId = t.id;
      } else if (state.phase === PHASE_BUILD || state.phase === PHASE_WAVE) {
        world.buildAt(a.col, a.row);
      }
    } else if (a.type === 'upgrade') {
      world.upgradeSelected();
    } else if (a.type === 'sell') {
      world.sellSelected();
    } else if (a.type === 'wave') {
      world.sendWave(true);
    } else if (a.type === 'pause') {
      if (screen === SCREEN_PLAY) paused = !paused;
    } else if (a.type === 'speed') {
      speed = speed === 1 ? 2 : 1;
    } else if (a.type === 'mute') {
      audio.unlock();
      audio.toggleMute();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    const s = input.state;

    // Queued clicks and keys first: they may change the phase the
    // simulation is about to advance.
    for (const click of s.clicks) handleAction(hitTest(state, screen, click.x, click.y));
    s.clicks.length = 0;
    if (s.waveQueued) {
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WON) {
        audio.unlock();
        beginRun();
      } else if (state.phase === PHASE_BUILD) {
        world.sendWave(true);
      }
    }
    if (s.restartQueued && (screen === SCREEN_OVER || screen === SCREEN_WON)) beginRun();
    if (s.pauseQueued && screen === SCREEN_PLAY) paused = !paused;
    if (s.speedQueued) speed = speed === 1 ? 2 : 1;
    if (s.muteQueued) {
      audio.unlock();
      audio.toggleMute();
      status.textContent = audio.muted ? 'Sound off' : 'Sound on';
    }
    if (s.cancelQueued) state.selectedId = null;

    state.hover = s.mouseIn && screen === SCREEN_PLAY ? cellAt(s.mouse.x, s.mouse.y) : null;

    if (!paused) {
      acc += dt * (screen === SCREEN_PLAY ? speed : 1);
      while (acc >= STEP) {
        world.step(STEP);
        playEvents();
        acc -= STEP;
        if (state.phase === PHASE_OVER && screen !== SCREEN_OVER) {
          screen = SCREEN_OVER;
          status.textContent = `Game over. Score ${state.score}.`;
          acc = 0;
          break;
        }
        if (state.phase === PHASE_WON && screen !== SCREEN_WON) {
          screen = SCREEN_WON;
          status.textContent = `Victory! Final score ${state.score}.`;
          acc = 0;
          break;
        }
      }
    }

    drawFrame(ctx, state, {
      screen,
      paused,
      speed,
      muted: audio.muted,
      mouse: s.mouse,
      mouseIn: s.mouseIn,
    }, world);
    input.endFrame();
  }
  requestAnimationFrame(frame);
}
