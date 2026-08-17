# Outhouse Pooping Simulator — project context

A Three.js + TypeScript browser game built by a **gauntlet loop**: every round
closes the biggest gap against a fixed external bar, re-measures, commits, and
updates the ledger. See skill `gauntlet-loop` for the method.

## The bar (frozen — do not revise to meet the work)

Match the visual craft of bruno-simon.com's live Three.js scene
(`progress/bar/bruno-simon.png`: warm/cool soft-shadowed lighting, material
polish, composition) AND the absurd-comedy feel of Goat Simulator 3
(`progress/bar/goatsim1.jpg`). A cold critic (fresh context, blind A/B) plus
the numeric gates in `progress/log.json` decides verdicts.

## Commands

```bash
npx tsc -p tsconfig.json                 # must pass before any commit
# dev server (port 5176) — check first:
curl -sf http://127.0.0.1:5176/ || (nohup npx vite --port 5176 >/tmp/vite-oup.log 2>&1 & sleep 3)
node shot.mjs progress/artifacts/round<N>.png play    # capture: skilled play
node shot.mjs /tmp/sweet.png sweet                   # capture: 10 perfect-aim shots (hit-rate gate)
node analyze.mjs <png>                               # pixel gates
node validate.mjs                                    # ledger schema MUST pass
node progress/render.mjs                             # regenerate progress/index.html after ledger edits
```

## Layout

- `src/main.ts` — scene, physics, core loop, HUD (the Game class; `boot()` at bottom)
- `src/fx.ts` — particles, `fx.count()` exposed in snapshot
- `src/sfx.ts` — procedural WebAudio (no assets)
- `src/types.ts` — shared types incl. `GameSnapshot`
- `shot.mjs` / `analyze.mjs` / `validate.mjs` — the gauntlet measurement
  instruments. **Builders do not edit these**; if the harness is wrong, say so
  in the report, don't silently retune gates.
- `assets/*.glb` — Blender-built models (outhouse, character, bucket, poop,
  tree, 3 thrones, 3 buckets). Rebuild in Blender via the `mcp__blender__`
  tools (headless unit, Blender 5.2) then re-export; generator script pattern
  is in git history / scratch notes.
- `progress/log.json` — the append-only ledger. `rounds` = last completed
  round; `pieces[]` = current state (overwrite, never duplicate names);
  `history[]` = one entry per round, no gaps.
- `progress/artifacts/round<N>.png` — this round's capture; N == `rounds`.
- `scratch/` — throwaway probes only (gitignored).

## Invariants

1. If a number didn't move, the verdict is `gap`, not `win`.
2. Re-measure every `win` piece each round; a regressed gate IS this round's gap.
3. Same piece taken 3 rounds running → mark `stalled`, cap it, move on.
4. One history entry per round, exactly. `validate.mjs` must pass before commit.
5. Commit message names the gap closed and the before→after numbers.
6. Do not schedule further cron jobs from a tick.
