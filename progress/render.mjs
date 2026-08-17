// Regenerates progress/index.html from progress/log.json (schema: see validate.mjs).
// Run: node progress/render.mjs  — outputs progress/index.html.
// The page inlines the log JSON and references artifacts via relative paths,
// so it works both served (vite) and opened straight from disk.
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const progressDir = path.join(ROOT, 'progress');
const log = JSON.parse(fs.readFileSync(path.join(progressDir, 'log.json'), 'utf8'));

const artifactsDir = path.join(progressDir, 'artifacts');
const shots = fs.existsSync(artifactsDir)
  ? fs.readdirSync(artifactsDir).filter((f) => /^round\d+\.png$/.test(f)).sort((a, b) => {
      const na = parseInt(a.match(/\d+/)[0], 10);
      const nb = parseInt(b.match(/\d+/)[0], 10);
      return na - nb;
    })
  : [];
const barRefs = fs.existsSync(path.join(progressDir, 'bar'))
  ? fs.readdirSync(path.join(progressDir, 'bar')).sort()
  : [];

const wins = log.pieces.filter((p) => p.verdict === 'win').length;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const badge = (v) => `<span class="badge ${v}">${v}</span>`;

const piecesRows = log.pieces
  .map(
    (p) => `
    <tr>
      <td><strong>${esc(p.name)}</strong></td>
      <td>${badge(p.verdict)}</td>
      <td class="gate">${esc(p.gate)}</td>
      <td class="gap">${esc(p.gap || '—')}</td>
    </tr>`
  )
  .join('');

const historyRows = [...log.history]
  .reverse()
  .map((h) => {
    const before = h.metrics && h.metrics.before ? esc(JSON.stringify(h.metrics.before)) : '—';
    const after = h.metrics && h.metrics.after ? esc(JSON.stringify(h.metrics.after)) : '—';
    return `
    <tr>
      <td class="num">${h.round}</td>
      <td>${esc(h.piece)}</td>
      <td>${badge(h.verdict)}</td>
      <td class="num">${before}</td>
      <td class="num">${after}</td>
      <td class="gap">${esc(h.note || '')}</td>
    </tr>`;
  })
  .join('');

const thumbs = shots
  .map((f) => `<a href="artifacts/${f}"><img loading="lazy" src="artifacts/${f}" alt="${f}"/></a>`)
  .join('\n');

const barImgs = barRefs.map((f) => `<img loading="lazy" src="bar/${f}" alt="bar: ${f}"/>`).join('\n');

const html = `<!doctype html>
<html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Outhouse Pooping Simulator — Gauntlet Progress</title>
<style>
 body{margin:0;background:#0d0f14;color:#e8e6df;font:15px/1.5 system-ui,sans-serif;padding:24px;max-width:1080px;margin:0 auto}
 h1{font-size:22px;margin:0 0 4px}
 .bar{color:#9aa3b2;font-size:13px;margin-bottom:20px}
 h2{font-size:15px;text-transform:uppercase;letter-spacing:.08em;color:#8b93a3;margin:28px 0 10px}
 table{width:100%;border-collapse:collapse;font-size:13px}
 td,th{border-bottom:1px solid #232833;padding:7px 10px;text-align:left;vertical-align:top}
 th{color:#8b93a3;font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:.06em}
 .num{font-variant-numeric:tabular-nums;white-space:nowrap}
 .gate{color:#b9c2d0}
 .gap{color:#d9b8a0;max-width:340px}
 .badge{display:inline-block;padding:1px 9px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
 .badge.win{background:#1d3a26;color:#7fe3a1}
 .badge.gap{background:#3a2d1d;color:#e3c67f}
 .badge.stalled{background:#3a1d24;color:#e37f9d}
 .shots img{width:230px;border-radius:8px;margin:6px 8px 6px 0;border:1px solid #232833;display:block}
 .shots a{display:inline-block;margin:0 8px 12px 0}
 .barmeds img{max-width:420px;border-radius:8px;margin:6px 8px 6px 0;border:1px solid #232833}
 .stat{font-size:13px;color:#9aa3b2;margin:6px 0 0}
 .stat b{color:#e8e6df}
</style></head>
<body>
<h1>🚽 Outhouse Pooping Simulator — gauntlet loop</h1>
<p class="bar"><strong>Bar:</strong> ${esc(log.bar)}</p>
<p class="stat">Round <b>${log.rounds}</b> · pieces <b>${wins}/${log.pieces.length}</b> won</p>

<h2>Quality bar (references)</h2>
<div class="barmeds">${barImgs}</div>

<h2>Pieces (current state)</h2>
<table><tr><th>piece</th><th>verdict</th><th>gate</th><th>current gap</th></tr>${piecesRows}</table>

<h2>Round history</h2>
<table><tr><th>round</th><th>piece</th><th>verdict</th><th>before</th><th>after</th><th>note</th></tr>${historyRows}</table>

<h2>Round artifacts</h2>
<div class="shots">${thumbs}</div>
</body></html>
`;

fs.writeFileSync(path.join(progressDir, 'index.html'), html);
console.log(`rendered progress/index.html (rounds=${log.rounds}, shots=${shots.length}, bar refs=${barRefs.length})`);
