// Gauntlet-loop ledger schema validator (skill v2, invariant 5).
// Only keys: rounds, bar, pieces[], history[]. rounds == N for artifact round<N>.
// pieces[] = current state, ONE entry per piece name, overwritten each round.
// history[] = append-only, exactly ONE entry per round, no gaps.
import fs from 'fs';
const log = JSON.parse(fs.readFileSync('progress/log.json', 'utf8'));
const errs = [];
const TOP = new Set(['rounds', 'bar', 'pieces', 'history']);
for (const k of Object.keys(log)) if (!TOP.has(k)) errs.push('unexpected top-level key: ' + k);
if (typeof log.rounds !== 'number') errs.push('rounds must be number');
const N = log.rounds;
if (!fs.existsSync(`progress/artifacts/round${N}.png`)) errs.push(`missing artifact round${N}.png`);
const names = new Set();
for (const p of log.pieces) {
  if (names.has(p.name)) errs.push('duplicate piece: ' + p.name);
  names.add(p.name);
  if (typeof p.gate !== 'string') errs.push('piece ' + p.name + ' missing gate');
  if (!['win', 'gap', 'stalled'].includes(p.verdict)) errs.push('piece ' + p.name + ' bad verdict');
  if (p.verdict === 'win' && p.gap !== '') errs.push('piece ' + p.name + ' win with non-empty gap');
}
const roundsSeen = new Set();
if (log.history.length !== N) errs.push(`history length ${log.history.length} != rounds ${N}`);
for (const h of log.history) {
  if (roundsSeen.has(h.round)) errs.push('duplicate history round ' + h.round);
  roundsSeen.add(h.round);
  if (!['win', 'gap', 'stalled'].includes(h.verdict)) errs.push('history round ' + h.round + ' bad verdict');
}
for (let r = 1; r <= N; r++) if (!roundsSeen.has(r)) errs.push('history missing round ' + r);
if (errs.length) { console.error('LEDGER INVALID:\n' + errs.join('\n')); process.exit(1); }
console.log('LEDGER VALID — rounds=' + N + ' pieces=' + log.pieces.length + ' history=' + log.history.length);
