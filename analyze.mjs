// Pixel analysis for Outhouse Pooping Simulator gates.
// Usage: node analyze.mjs <screenshot.png>
// Emits a coarse ASCII map + METRICS the gauntlet gates on:
//   - readability: distinct colour families present (structure vs void)
//   - skyRatio / groundRatio / blowoutRatio (overexposure)
//   - structureRatio (non-sky, non-flat-ground = "stuff to look at")
//   - centerOccupancy (is the play area framed, not empty)
//   - brownPoopRatio / goldRatio / blueRatio (game-specific accents)
import fs from 'fs';
import { PNG } from 'pngjs';

const path = process.argv[2];
if (!path) { console.error('usage: analyze.mjs <png>'); process.exit(1); }
const png = PNG.sync.read(fs.readFileSync(path));
const { width, height, data } = png;
const idx = (x, y) => (y * width + x) * 4;
const total = width * height;

let sky = 0, ground = 0, brown = 0, gold = 0, blue = 0, red = 0, white = 0, blowout = 0;
let satSum = 0, lumSum = 0;
const cols = 80, rows = 40;

function classify(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx - mn;
  const lum = (r + g + b) / 3;
  if (r > 245 && g > 245 && b > 245) return '!'; // blowout
  // sky: bright blue-dominant, low-ish sat
  if (b > r && b > g && lum > 150 && b > 180) return 's';
  // green ground/foliage
  if (g > r && g > b) return 'g';
  // brown family (wood, poop, dirt)
  if (r > g && g >= b && r > 60) return 'b';
  // gold/yellow
  if (r > 150 && g > 120 && b < 100 && r > b * 1.6) return 'G';
  // blue accents (bucket/character)
  if (b > r * 1.3 && b > 100) return 'B';
  // red (outhouse walls)
  if (r > 130 && g < 90 && b < 90) return 'r';
  if (lum > 200) return 'w';
  return '.';
}

let centerHits = 0, centerTot = 0;
for (let y = 0; y < rows; y++) {
  let line = '';
  for (let x = 0; x < cols; x++) {
    const sx = Math.floor((x + 0.5) / cols * width);
    const sy = Math.floor((y + 0.5) / rows * height);
    const c = classify(data[idx(sx, sy)], data[idx(sx, sy) + 1], data[idx(sx, sy) + 2]);
    line += c;
    // center band: the play-area frame check (middle 40% x, lower 60% y)
    if (x / cols > 0.3 && x / cols < 0.7 && y / rows > 0.4) {
      centerTot++;
      if (c !== 's' && c !== '!') centerHits++;
    }
  }
  console.log(line);
}

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const o = idx(x, y);
    const r = data[o], g = data[o + 1], b = data[o + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const lum = (r + g + b) / 3;
    satSum += mx - mn;
    lumSum += lum;
    if (r > 245 && g > 245 && b > 245) blowout++;
    if (b > r && b > g && lum > 150 && b > 180) sky++;
    else if (g > r && g > b) ground++;
    else if (r > g && g >= b && r > 60) brown++;
    else if (r > 150 && g > 120 && b < 100 && r > b * 1.6) gold++;
    else if (b > r * 1.3 && b > 100) blue++;
    else if (r > 130 && g < 90 && b < 90) red++;
    else if (lum > 200) white++;
  }
}
const structure = total - sky - ground;
console.log('METRICS ' + JSON.stringify({
  skyRatio: sky / total,
  groundRatio: ground / total,
  structureRatio: structure / total,
  centerOccupancy: centerHits / centerTot,
  brownRatio: brown / total,
  goldRatio: gold / total,
  blueRatio: blue / total,
  redRatio: red / total,
  blowoutRatio: blowout / total,
  meanSat: satSum / total,
  meanLum: lumSum / total,
}));
