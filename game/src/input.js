// STARFALL DEFENSE — raw input. This module only listens: it tracks the
// mouse in field coordinates, queues clicks for main.js to interpret
// against render.js's UI rectangles, and turns keys into one-shot flags.
// It knows nothing about towers or waves; every decision lives in main.js.

export function createInput(canvas, toField) {
  const state = {
    mouse: { x: 0, y: 0 },
    mouseIn: false,
    clicks: [], // queued {x, y} in field coordinates, drained by main.js
    pauseQueued: false,
    speedQueued: false,
    muteQueued: false,
    waveQueued: false, // Space: start the game / send the wave / confirm
    restartQueued: false,
    cancelQueued: false, // Esc or right-click: drop the current selection
  };

  canvas.addEventListener('mousemove', (ev) => {
    const p = toField(ev.clientX, ev.clientY);
    state.mouse.x = p.x;
    state.mouse.y = p.y;
    state.mouseIn = true;
  });
  canvas.addEventListener('mouseleave', () => {
    state.mouseIn = false;
  });
  canvas.addEventListener('mousedown', (ev) => {
    const p = toField(ev.clientX, ev.clientY);
    if (ev.button === 2) {
      state.cancelQueued = true;
      return;
    }
    if (ev.button === 0) state.clicks.push({ x: p.x, y: p.y });
  });
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

  window.addEventListener('keydown', (ev) => {
    if (ev.repeat) return;
    const k = ev.key;
    if (k === 'p' || k === 'P') state.pauseQueued = true;
    else if (k === 'f' || k === 'F') state.speedQueued = true;
    else if (k === 'm' || k === 'M') state.muteQueued = true;
    else if (k === ' ') {
      state.waveQueued = true;
      ev.preventDefault();
    } else if (k === 'r' || k === 'R') state.restartQueued = true;
    else if (k === 'Escape') state.cancelQueued = true;
  });

  /** Clear the one-shot flags; called once per frame after they are read. */
  function endFrame() {
    state.pauseQueued = false;
    state.speedQueued = false;
    state.muteQueued = false;
    state.waveQueued = false;
    state.restartQueued = false;
    state.cancelQueued = false;
  }

  return { state, endFrame };
}
