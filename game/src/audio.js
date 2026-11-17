// STARFALL DEFENSE — synthesised sound. Every effect is an oscillator or a
// puff of filtered noise shaped by hand; there are no audio files. The
// context is created lazily and unlocked on the first player gesture, as
// browsers require. Towers fire often, so the shooting voices are short,
// quiet and slightly detuned per shot to keep the mix from fatiguing.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let wobble = 0;

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') void ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
  }

  function tone(freqA, freqB, seconds, type, volume, delay = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqA, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqB), t0 + seconds);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.02);
  }

  function noise(seconds, volume, freq, delay = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
  }

  return {
    unlock,
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    shoot(kind) {
      wobble = (wobble + 0.618) % 1;
      const detune = 1 + (wobble - 0.5) * 0.12;
      if (kind === 'cannon') tone(150 * detune, 55, 0.16, 'triangle', 0.20);
      else if (kind === 'frost') tone(1150 * detune, 1750, 0.09, 'sine', 0.07);
      else tone(840 * detune, 320, 0.06, 'square', 0.045);
    },
    boom() {
      noise(0.22, 0.22, 700);
      tone(110, 40, 0.22, 'sine', 0.22);
    },
    chill() {
      tone(1500, 2100, 0.07, 'sine', 0.04);
    },
    die(big) {
      noise(big ? 0.3 : 0.14, big ? 0.26 : 0.13, big ? 500 : 1100);
      tone(big ? 200 : 320, 60, big ? 0.3 : 0.15, 'triangle', 0.14);
    },
    leak() {
      tone(220, 70, 0.28, 'sawtooth', 0.16);
    },
    coin() {
      tone(1250, 1250, 0.06, 'sine', 0.08);
      tone(1870, 1870, 0.1, 'sine', 0.08, 0.055);
    },
    build() {
      tone(300, 520, 0.1, 'triangle', 0.14);
      tone(520, 780, 0.09, 'triangle', 0.1, 0.06);
    },
    upgrade() {
      tone(520, 520, 0.07, 'triangle', 0.12);
      tone(660, 660, 0.07, 'triangle', 0.12, 0.07);
      tone(880, 880, 0.12, 'triangle', 0.12, 0.14);
    },
    sell() {
      tone(780, 390, 0.12, 'triangle', 0.1);
    },
    deny() {
      tone(160, 120, 0.1, 'square', 0.07);
    },
    wave() {
      tone(392, 392, 0.11, 'triangle', 0.13);
      tone(587, 587, 0.16, 'triangle', 0.13, 0.1);
    },
    clear() {
      tone(659, 659, 0.09, 'sine', 0.12);
      tone(784, 784, 0.09, 'sine', 0.12, 0.08);
      tone(1046, 1046, 0.16, 'sine', 0.12, 0.16);
    },
    over() {
      tone(392, 392, 0.22, 'triangle', 0.16);
      tone(330, 330, 0.22, 'triangle', 0.16, 0.2);
      tone(262, 196, 0.45, 'triangle', 0.16, 0.4);
    },
    won() {
      const notes = [523, 659, 784, 1046, 784, 1046];
      notes.forEach((n, i) => tone(n, n, 0.16, 'triangle', 0.13, i * 0.11));
    },
  };
}
