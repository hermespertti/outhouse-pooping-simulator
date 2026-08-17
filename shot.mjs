// Durable capture harness for the gauntlet loop.
// Usage: node shot.mjs <out.png> [script]
//   - takes a deterministic screenshot from the renderer buffer
//   - dumps live game state (score, poops, fps, frameMs...) as STATE
//   - runs an optional play script to make the shot representative
// The harness owns measurement: builders must not edit it.
import puppeteer from 'puppeteer-core';
import fs from 'fs';

const OUT = process.argv[2] || '/tmp/oup_shot.png';
const SCRIPT = process.argv[3] || 'idle';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader', '--window-size=1280,800', '--use-gl=angle', '--use-angle=swiftshader'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => logs.push('CONSOLE[' + m.type() + ']: ' + m.text().slice(0, 300)));
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + String(e).slice(0, 300)));

await page.goto('http://127.0.0.1:5176/', { waitUntil: 'domcontentloaded', timeout: 20000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// wait for the world to finish loading (models are async)
await page.waitForFunction(() => window.__game && !document.getElementById('load'), { timeout: 25000 }).catch(() => {});
await sleep(1200);

const dump = () => page.evaluate(() => {
  const g = window.__game;
  const s = g ? g.snapshot() : { phase: 'loading' };
  const band = document.querySelector('#gaugewrap .band');
  s.gaugeBand = band ? band.style.bottom : null;
  return s;
});

const keyDown = (k) => page.keyboard.down(k);
const keyUp = (k) => page.keyboard.up(k);
// hold space (straining), then release — the core move
async function strainRelease(holdMs) {
  await keyDown(' ');
  await sleep(holdMs);
  await keyUp(' ');
  await sleep(1600); // let the poop fly + resolve
}

switch (SCRIPT) {
  case 'idle':
    await sleep(600);
    break;
  case 'play': {
    // a representative round: several launches at varied strain, some on-target
    for (let i = 0; i < 6; i++) {
      // nudge aim randomly to simulate play
      await page.keyboard.press(i % 2 ? 'ArrowLeft' : 'ArrowRight');
      await sleep(120);
      await page.keyboard.press(i % 2 ? 'ArrowRight' : 'ArrowLeft');
      await strainRelease(500 + Math.random() * 900);
    }
    break;
  }
  case 'sweet': {
    // land as many as possible near the sweet spot for bucket-hit metrics
    for (let i = 0; i < 10; i++) {
      const s = await dump();
      // hold duration that reaches ~sweet strain (strain rate = 1/1.15 per s)
      // read the gauge band bottom % as the sweet strain
      const band = s.gaugeBand ? parseFloat(s.gaugeBand) / 100 : 0.5;
      await keyDown(' ');
      await sleep(Math.max(150, band * 1150));
      await keyUp(' ');
      await sleep(1700);
    }
    break;
  }
  default:
    await sleep(600);
}

const state = await dump();
const shot = await page.evaluate(() => (window.__game ? window.__game.screenshot() : null));
if (shot) fs.writeFileSync(OUT, Buffer.from(shot.split(',')[1], 'base64'));

console.log('STATE ' + JSON.stringify(state));
console.log('SHOT_SAVED ' + OUT);
console.log(logs.join('\n'));
await browser.close();
