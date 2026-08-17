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
// hold space (straining), then release — the core move.
// When `atSweet` is true, release the instant strain crosses the sweet spot
// (the gauge is oscillating, so we wait for an upward crossing).
async function strainRelease(holdMs, atSweet) {
  const sweet = await page.evaluate(() => (window.__game ? window.__game.sweetStrain() : 0.5));
  await keyDown(' ');
  const start = Date.now();
  let crossed = !atSweet && holdMs > 0;
  while (Date.now() - start < (holdMs || 4000)) {
    const strain = await page.evaluate(() => (window.__game ? window.__game.snapshot().strain : 0));
    if (atSweet && strain >= sweet) { crossed = true; break; }
    if (!atSweet && Date.now() - start >= holdMs) { crossed = true; break; }
    await sleep(40);
  }
  await keyUp(' ');
  await sleep(1600); // let the poop fly + resolve
}

switch (SCRIPT) {
  case 'idle':
    await sleep(600);
    break;
  case 'play': {
    // a representative round: aim at the bucket, release near the sweet spot
    // (a skilled player); a couple of deliberately-looser shots for variety
    for (let i = 0; i < 6; i++) {
      const tight = i % 3 !== 2;
      await strainRelease(tight ? 4000 : 500 + Math.random() * 600, tight);
    }
    break;
  }
  case 'sweet': {
    // land as many as possible near the sweet spot for bucket-hit metrics
    for (let i = 0; i < 10; i++) {
      const sweet = await page.evaluate(() => (window.__game ? window.__game.sweetStrain() : 0.5));
      await keyDown(' ');
      // strain fills at 1/1.15 per second -> hold time = sweet * 1150 ms
      await sleep(Math.max(150, sweet * 1150));
      await keyUp(' ');
      await sleep(1700);
    }
    break;
  }
  default:
    await sleep(600);
}

const state = await dump();
// Capture the FULL player view: DOM HUD + WebGL canvas composited (what the eye sees).
// page.screenshot() grabs the viewport including the overlay, unlike the canvas buffer.
await page.screenshot({ path: OUT, type: 'png' });
state.captured = 'page-dom';

console.log('STATE ' + JSON.stringify(state));
console.log('SHOT_SAVED ' + OUT);
console.log(logs.join('\n'));
await browser.close();
