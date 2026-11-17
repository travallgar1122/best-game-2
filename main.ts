// STARFALL DEFENSE — the hand-in program for the best-game-01 bounty.
// Node 22, standard library only, no build step.
//
// It does three things, in order:
//   1. Finds the entry (the folder this file sits in) and the output:
//      $MAKEFUN_OUTPUT_DIR when set, else /output, the grader's folder.
//   2. Copies the whole game/ tree — the static files a desktop browser
//      plays offline from game/index.html — into the output, and the
//      screenshots/ folder beside it when one exists.
//   3. Writes dossier.json with buildDossier from the vendored make.fun
//      library (vendor/makefun-game.ts, the kit's byte-identical copy).
//      The dossier is what the judge reads, capped exactly as the scorer
//      caps it, so the dossier written here is byte for byte the one the
//      scorer rebuilds and compares.
//
// Run it the way the grader does, pointed at a scratch folder:
//   mkdir -p out-test && MAKEFUN_OUTPUT_DIR=out-test node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const entryDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(entryDir, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
const shotsDir = join(entryDir, 'screenshots');
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });
}

// The caps are the scorer's own (reference/gate.json): at most 160 KiB of
// source text in the dossier, at most 4 screenshots of at most 256 KiB
// each, and a game tree of at most 993 entries, 48 MiB in all, no path
// over 1,000 bytes. Enforcing them here means this program refuses
// exactly what the scorer would refuse, instead of handing in an entry
// that cannot score.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
console.log(`starfall defense handed in: dossier.json ${dossier.length} bytes -> ${outputDir}`);
