# Outhouse Pooping Simulator

A low-poly 3D browser game: sit in an outhouse, **strain**, **release**, and lob
swirls of poop into a bucket. Score, combos, and unlockable thrones/buckets.

- **Stack:** Three.js (ESM) + TypeScript + Vite. No build step required to run.
- **Models:** built in Blender via MCP, exported as GLB into `assets/`.
- **Dev:** `npm install && npm run dev` → http://127.0.0.1:5176
- **Capture harness:** `shot.mjs` (screenshot + live state) and `analyze.mjs`
  (pixel metrics) — the gauntlet loop's measurement instruments. Do not edit
  them to make numbers look better; if the harness is wrong, say so.

## Controls
- **HOLD SPACE** — strain (gauge fills). Release to drop.
- **← →** aim · **↑ ↓** loft
- **1–4** thrones · **Q** bucket

## Gauntlet loop
- Bar: see `progress/log.json` (`bar` field).
- Ledger: `progress/log.json` (validated by `node validate.mjs`).
- One history entry per round; artifact at `progress/artifacts/round<N>.png`.
