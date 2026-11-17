# best-game-2

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/travallgar1122/best-game-2/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/travallgar1122/best-game-2/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

# STARFALL DEFENSE

STARFALL DEFENSE is a tower defense game that runs entirely in the browser. At night the invaders ride a glowing star-road down into the valley: mites in swarms, runners at a sprint, grunts in ranks and bulwarks that shrug off bolts. You spend gold on towers beside the road, season them through three levels, call waves in early for a bounty when you feel brave — and try to keep twenty lives from slipping past the red gate. Survive all fifteen waves and the valley holds.

## How to play

- **Build** — click a tower card, then click a free cell of dark ground (the road itself can never hold a tower). Building works between waves and while one is marching.
- **Upgrade / sell** — click one of your towers: raise it toward level 3, or sell it back for 70% of everything you spent on it.
- **Send the wave** — click SEND WAVE or press Space. Between waves a countdown runs: call the wave in early and the seconds you skip pay gold.
- **Pause** — P or the pause button. **Speed** — F or the 1×/2× button. **Sound** — M. **Cancel selection** — Esc or right-click.
- Kills pay gold, a cleared wave pays a bonus plus interest on the gold you banked, and every invader that reaches the red gate costs lives — a bulwark costs three.

## What is in the valley

- **Three tower families** — the Arrow Spire (fast, cheap bolts), the Star Cannon (slow shells with a wide splash) and the Frost Obelisk (chills invaders to 45% speed), each with three levels.
- **Four invader kinds** across fifteen hand-shaped waves, from a six-grunt stroll to a final stand of bulwarks, ranks and swarms.
- **A full economy** — kill bounties, wave-clear bonuses, bank interest, early-call bounties, upgrade costs and sell refunds, all tuned so greed and caution both have a price.
- **Synthesised sound** — every bolt, burst, chill and fanfare is generated live with the Web Audio API. There are no audio files.
- **No libraries, fully offline** — hand-written HTML, CSS and JavaScript on a single canvas, a fixed-timestep simulation and a seeded random generator, so a run plays out identically from the same seed. It never touches the network.

## Repository layout

- `game/` — the playable game: `index.html` plus `src/` (`main.js` the loop and referee, `world.js` the simulation, `render.js` the canvas drawing and UI geometry, `config.js` every tuning number, `input.js`, `audio.js`, `random.js`, `shots.js` the deterministic screenshot scenes)
- `main.ts` — the hand-in program: copies the game and screenshots into the output directory and writes `dossier.json` with the vendored make.fun library
- `serve.ts` — a tiny local server for playing the game from this repo
- `screenshots/` — three real renders of the game (title, a mid-game wave under fire, the valley fallen), with `shots.json` describing how they were taken
- `tools/screenshots.mjs` — the script that produced the screenshots
- `vendor/makefun-game.ts` — the make.fun hand-in library, byte-identical to the competition kit

## Run it

```sh
node serve.ts
# then open http://localhost:8080 in a browser

# hand-in program (copies the game + screenshots and writes dossier.json):
MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=h0zvrf0h&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
