// Capture Starfall Defense's three judge screenshots, for real, in a
// browser. Starts the game's own static server (node serve.ts, port
// 8080), then drives the Playwright Chromium binary over the DevTools
// protocol: for each entry in shots.json it opens the game at 1280x800
// with that entry's ?shot=...&seed=... query, waits for the page to flag
// its frozen frame (window.__shotReady, set by game/src/main.js after it
// draws once) plus a full second for the compositor to paint, and
// captures the viewport as JPEG. (Plain `chrome --screenshot` with a
// #fragment URL is not used: it can return a blank frame captured before
// paint.)
//
// A frame over the gate's 256 KiB cap is re-captured at stepping-down
// JPEG quality (85 -> 75 -> 65 -> 55 -> 45). Every capture is verified
// non-blank two ways before it is kept: the JPEG's own SOF marker must
// say 1280x800, and a pixel sample read back from the game canvas in the
// page must show real variance and many distinct colours (a blank frame
// has neither).
//
// Usage: node tools/screenshots.mjs

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shotsDir = join(root, 'screenshots');
const shots = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));
const chrome = join(homedir(), '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome');
const PORT = 8080;
const CDP_PORT = 9335;
const MAX_BYTES = 262_144; // the gate's 256 KiB per-screenshot cap
const QUALITIES = [85, 75, 65, 55, 45];

if (!existsSync(chrome)) {
  process.stderr.write(`screenshots: no Chromium at ${chrome}\n`);
  process.exit(2);
}
mkdirSync(shotsDir, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn('node', ['serve.ts'], { cwd: root, stdio: 'ignore' });
const browser = spawn(
  chrome,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--window-size=1280,800',
    `--remote-debugging-port=${CDP_PORT}`,
    '--remote-debugging-address=127.0.0.1',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

/** A minimal CDP client over the target's WebSocket. */
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
      else resolve(msg.result);
    } else if (msg.method && listeners.has(msg.method)) {
      for (const fn of listeners.get(msg.method)) fn(msg.params);
    }
  });
  return {
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    once(method) {
      return new Promise((resolve) => {
        const arr = listeners.get(method) ?? [];
        const fn = (params) => {
          listeners.set(method, arr.filter((f) => f !== fn));
          resolve(params);
        };
        arr.push(fn);
        listeners.set(method, arr);
      });
    },
    close() {
      ws.close();
    },
  };
}

/** Width/height from a JPEG's SOF0/SOF2 marker, or null when not found. */
function jpegSize(buf) {
  let i = 2; // skip SOI
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker === 0xc0 || marker === 0xc2) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

try {
  let up = false;
  for (let i = 0; i < 50 && !up; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/`);
      up = res.ok;
    } catch {
      await wait(200);
    }
  }
  if (!up) throw new Error('game server (node serve.ts) did not come up');
  let version = null;
  for (let i = 0; i < 50 && !version; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) version = await res.json();
    } catch {
      await wait(200);
    }
  }
  if (!version) throw new Error('chrome CDP endpoint did not come up');

  const targetRes = await fetch(
    `http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent('about:blank')}`,
    { method: 'PUT' },
  );
  const target = await targetRes.json();
  const cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });

  for (const shot of shots) {
    const url = `http://127.0.0.1:${PORT}/${shot.query}`;
    const loaded = cdp.once('Page.loadEventFired');
    await cdp.send('Page.navigate', { url });
    await loaded;
    let ready = false;
    for (let i = 0; i < 300 && !ready; i++) {
      const res = await cdp.send('Runtime.evaluate', {
        expression: 'window.__shotReady === true',
        returnByValue: true,
      });
      ready = res.result?.value === true;
      if (!ready) await wait(100);
    }
    if (!ready) throw new Error(`${shot.name}: page never flagged __shotReady (${url})`);
    await wait(1100); // let the compositor paint the drawn frame

    // Non-blank evidence from the page itself: sample the game canvas on
    // a coarse grid and measure spread. A blank frame is one flat colour.
    const probe = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const c = document.getElementById('game');
        const g = c.getContext('2d');
        const img = g.getImageData(0, 0, c.width, c.height).data;
        const colours = new Set();
        let n = 0, mean = 0, m2 = 0;
        for (let y = 0; y < c.height; y += 6) {
          for (let x = 0; x < c.width; x += 6) {
            const p = (y * c.width + x) * 4;
            const lum = (img[p] + img[p + 1] + img[p + 2]) / 3;
            colours.add((img[p] << 16) | (img[p + 1] << 8) | img[p + 2]);
            n += 1;
            const d = lum - mean;
            mean += d / n;
            m2 += d * (lum - mean);
          }
        }
        return { width: c.width, height: c.height, samples: n,
                 stddev: Math.round(Math.sqrt(m2 / n) * 10) / 10,
                 distinctColours: colours.size };
      })()`,
      returnByValue: true,
    });
    const stats = probe.result?.value;
    if (!stats || stats.stddev < 5 || stats.distinctColours < 50) {
      throw new Error(`${shot.name}: canvas looks blank (${JSON.stringify(stats)})`);
    }

    let saved = null;
    for (const q of QUALITIES) {
      const frame = await cdp.send('Page.captureScreenshot', {
        format: 'jpeg',
        quality: q,
        captureBeyondViewport: false,
      });
      const buf = Buffer.from(frame.data, 'base64');
      if (buf.length <= MAX_BYTES) {
        writeFileSync(join(shotsDir, shot.name), buf);
        saved = { bytes: buf.length, quality: q, size: jpegSize(buf) };
        break;
      }
    }
    if (!saved) throw new Error(`${shot.name}: still over ${MAX_BYTES} bytes at quality ${QUALITIES.at(-1)}`);
    if (!saved.size || saved.size.width !== 1280 || saved.size.height !== 800) {
      throw new Error(`${shot.name}: JPEG dimensions ${JSON.stringify(saved.size)}, expected 1280x800`);
    }
    process.stdout.write(
      `screenshots: ${shot.name} — ${saved.bytes} bytes (jpeg q${saved.quality}), ` +
        `${saved.size.width}x${saved.size.height}, canvas stddev ${stats.stddev}, ` +
        `${stats.distinctColours} distinct colours in ${stats.samples} samples — not blank\n`,
    );
  }
  cdp.close();
} finally {
  browser.kill();
  server.kill();
}
