// STARFALL DEFENSE — seeded randomness. A single mulberry32 stream feeds
// every spawn jitter, star twinkle and particle scatter in the game, so a
// run from a given seed always plays out the same way. Nothing in the game
// calls Math.random: determinism is what lets the screenshot scenes freeze
// an exact, honest moment of play.

/** Create a mulberry32 generator from a 32-bit seed. */
export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Small convenience wrapper: ranges, ints, angles, chances and picks. */
export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => Math.floor(lo + next() * (hi - lo + 1)),
    angle: () => next() * Math.PI * 2,
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)],
  };
}
