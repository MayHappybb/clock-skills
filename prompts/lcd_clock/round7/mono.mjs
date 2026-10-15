// Monochrome check for round 7: is every pixel a tint or shade of ONE hue?
//
//   cd .claude/skills/tft-clock && node ../../../prompts/round7/mono.mjs <design> [HH:MM:SS ...]
//
// For each sampled frame (default: rest, mid-turn, mid-hour show, night) it
// takes every stored pixel, ignores near-neutral ones (chroma < 24 of 255:
// those are the ramp's tinted black and white ends), and measures how far
// each chromatic pixel's hue is from the face's dominant hue. PASS when at
// most 0.5% of the chromatic pixels sit more than 15 degrees off it.

import { buildFrame } from '../../.claude/skills/tft-clock/sim/js/player.js';
import { from565 } from '../../.claude/skills/tft-clock/sim/js/color.js';

const key = process.argv[2];
const clocks = process.argv.slice(3);
if (!key) { console.error('usage: node mono.mjs <design> [HH:MM:SS ...]'); process.exit(2); }
const times = clocks.length ? clocks : ['10:09:30', '10:09:59.4', '10:10:00.8', '10:59:59.5', '11:00:01.5', '11:00:04', '02:47:30', '23:59:59.6', '00:00:01'];

function hueOf(c) {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), ch = mx - mn;
  if (ch === 0) return [0, 0];
  let h;
  if (mx === r) h = ((g - b) / ch) % 6;
  else if (mx === g) h = (b - r) / ch + 2;
  else h = (r - g) / ch + 4;
  return [((h * 60) + 360) % 360, ch];
}

const all = [];
const rows = [];
for (const clock of times) {
  const b = buildFrame(key, { t: 0, clock });
  const px = [];
  for (const v of b.canvas.buf) {
    const [h, ch] = hueOf(from565(v));
    if (ch >= 24) px.push([h, ch]);
  }
  all.push(...px);
  rows.push([clock, px, b.canvas.buf.length]);
}
// dominant hue: chroma-weighted circular mean over every sample
let sx = 0, sy = 0;
for (const [h, ch] of all) { sx += ch * Math.cos(h * Math.PI / 180); sy += ch * Math.sin(h * Math.PI / 180); }
const dom = ((Math.atan2(sy, sx) * 180 / Math.PI) + 360) % 360;
const off = (h) => { const d = Math.abs(h - dom) % 360; return d > 180 ? 360 - d : d; };
let bad = 0, worst = 0;
console.log(`${key}: dominant hue ${dom.toFixed(0)} deg`);
for (const [clock, px, n] of rows) {
  const out = px.filter(([h]) => off(h) > 15);
  const far = px.reduce((m, [h]) => Math.max(m, off(h)), 0);
  bad += out.length; worst = Math.max(worst, far);
  console.log(`  ${clock.padEnd(11)} chromatic ${String(((px.length / n) * 100).toFixed(0)).padStart(3)}%  off-hue ${out.length} px  furthest ${far.toFixed(0)} deg`);
}
const frac = all.length ? bad / all.length : 0;
console.log(`${frac <= 0.005 ? 'PASS' : 'FAIL'}: ${(frac * 100).toFixed(2)}% of chromatic pixels more than 15 deg off the dominant hue (furthest ${worst.toFixed(0)} deg)`);
process.exit(frac <= 0.005 ? 0 : 1);
