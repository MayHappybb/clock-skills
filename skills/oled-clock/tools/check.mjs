// Prove a design runs, all day: bus budget, controller warnings, burn-in.
//
//   node tools/check.mjs --design <key|all> [--quick] [--bus i2c100] [--fps 60]
//
// For every minute of the day it builds frames at the instants transitions
// live in (the turn of the minute, the first seconds) and checks:
//   - the frame fits the bus at the design's fps, every time
//   - the controller raised no warning (invalid command, RAM written mid-scroll)
//   - the design never throws
// and, from evenly spread samples, how long each pixel is lit over a day:
// OLED pixels age with use, so a pixel lit all day dims relative to its
// neighbours and the face burns in. Writes out/<design>-wear.png, a map of it.
//
// Exits non-zero if any check fails.

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFrame, scanout, DESIGNS, fpsOf } from '../sim/js/player.js';
import { encodePNG } from './png.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--quick') opt.quick = true;
  else if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[++i];
}
if (!opt.design) {
  console.error('usage: node tools/check.mjs --design <key|all> [--quick] [--bus name]');
  process.exit(2);
}

/** Instants within each minute where transitions usually live. */
const COST_AT = [0, 0.05, 0.25, 0.5, 1, 2, 30, 59.5];
/**
 * Instants for the wear estimate: six per minute, at golden-ratio steps that
 * also drift from minute to minute, so nothing periodic (a pendulum, a
 * sweeping hand, a 2 s blink) is always caught in the same phase.
 */
const WEAR_N = 6;
const wearAt = (minute) => Array.from({ length: WEAR_N }, (_, i) => (((minute * WEAR_N + i) * 0.6180339887) % 1) * 60);

const clockAt = (minute, sec) => {
  const s = Math.floor(sec), frac = sec - s;
  return { clock: `${Math.floor(minute / 60)}:${minute % 60}:${s}`, t: frac };
};

async function check(key) {
  const design = DESIGNS[key];
  const fps = fpsOf(design, opt.fps);
  const step = opt.quick ? 7 : 1;
  let worst = { busUs: 0 }, over = 0, frames = 0;
  const warnings = new Map();
  const errors = [];
  let wear = null, litTime = null, wearN = 0, litSum = 0, mod = null;

  for (let minute = 0; minute < 1440; minute += step) {
    const wearSecs = wearAt(minute);
    for (const sec of [...COST_AT, ...wearSecs]) {
      const { clock, t } = clockAt(minute, sec);
      // Sample on the design's frame grid, as the hardware would send.
      const tk = Math.floor(t * fps + 1e-9) / fps;
      let built;
      try {
        built = buildFrame(key, { clock, t: tk, bus: opt.bus, fps });
      } catch (err) {
        if (errors.length < 3) errors.push(`${clock}+${tk}s: ${err.message}`);
        continue;
      }
      mod = built.module;
      const r = built.report;
      frames++;
      if (r.busUs > worst.busUs) worst = { ...r, clock, t: tk };
      if (r.fps < fps) over++;
      for (const w of r.warnings) if (!warnings.has(w)) warnings.set(w, `${clock}+${tk}s`);
      if (wearSecs.includes(sec)) {
        const lv = scanout(built.oled, mod);
        if (!wear) { wear = new Float64Array(lv.length); litTime = new Float64Array(lv.length); }
        for (let i = 0; i < lv.length; i++) {
          wear[i] += lv[i];
          if (lv[i] > 0) { litTime[i] += 1; litSum += 1; }
        }
        wearN++;
      }
    }
  }

  const ok = !errors.length && !over && !warnings.size;
  console.log(`\n${key}  (${design.name}, ${mod?.label ?? '?'}, ${fps} fps on ${worst.bus ?? design.bus})`);
  console.log(`  frames checked            : ${frames}${opt.quick ? ' (quick: every 7th minute)' : ''}`);
  if (worst.clock) {
    console.log(`  worst frame               : ${(worst.busUs / 1000).toFixed(2)} ms, ${worst.ramBytes} RAM bytes, at ${worst.clock}+${worst.t}s` +
      ` -> bus allows ${worst.fps === Infinity ? 'inf' : worst.fps.toFixed(1)} fps`);
  }
  console.log(`  frames over the bus budget: ${over}${over ? '  FAIL' : ''}`);
  for (const [w, at] of warnings) console.log(`  WARNING (first at ${at}): ${w}`);
  for (const e of errors) console.log(`  ERROR ${e}`);

  if (wear && mod) {
    let max = 0, maxAt = 0, hot = 0;
    for (let i = 0; i < wear.length; i++) {
      wear[i] /= wearN;
      litTime[i] /= wearN;
      if (wear[i] > max) { max = wear[i]; maxAt = i; }
      if (litTime[i] > 0.5) hot++;
    }
    const meanLit = litSum / wearN / wear.length;
    // "Full-drive equivalent" weights lit time by the contrast setting:
    // an hour at 0x80 counts about half an hour at 0xFF.
    console.log(`  pixels lit, on average    : ${(meanLit * 100).toFixed(1)}% of the glass`);
    console.log(`  hottest pixel             : (${maxAt % mod.cols}, ${Math.floor(maxAt / mod.cols)}) lit ${(litTime[maxAt] * 24).toFixed(1)} h/day,` +
      ` ${(max * 24).toFixed(1)} h/day at full-contrast equivalent`);
    console.log(`  pixels lit over half the day: ${hot}`);
    // Panel datasheets rate life as hours to 50% brightness: UG-2864HSWEG01
    // >= 10,000 h at 100 cd/m2 (a 50% checkerboard). At that drive, the
    // hottest pixel reaches half brightness after roughly this long, and its
    // neighbours lit less often stay brighter: that difference is burn-in.
    if (max > 0) console.log(`  hottest pixel at 50% after : ~${(10000 / (max * 24) / 365).toFixed(1)} years at full contrast (10,000 h rating; lower contrast lasts longer)`);
    await writeWear(key, mod, wear, max);
  }
  console.log(`  ${ok ? 'PASS' : 'FAIL'}`);
  return ok;
}

/** A heat map of the day's wear, 4x, black (never lit) to white (always). */
async function writeWear(key, mod, wear, max) {
  const S = 4, W = mod.cols * S, H = mod.rows * S;
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = wear[Math.floor(y / S) * mod.cols + Math.floor(x / S)];
      const i = (y * W + x) * 4;
      // black -> red -> yellow -> white
      rgba[i] = Math.min(255, v * 3 * 255);
      rgba[i + 1] = Math.min(255, Math.max(0, v * 3 - 1) * 255);
      rgba[i + 2] = Math.min(255, Math.max(0, v * 3 - 2) * 255);
      rgba[i + 3] = 255;
    }
  await mkdir(join(ROOT, 'out'), { recursive: true });
  const file = join(ROOT, 'out', `${key}-wear.png`);
  await writeFile(file, encodePNG(W, H, rgba));
  console.log(`  wear map                  : ${file}`);
}

const keys = opt.design === 'all' ? Object.keys(DESIGNS) : [opt.design];
let allOk = true;
for (const k of keys) {
  if (!DESIGNS[k]) { console.error(`unknown design ${k}`); process.exit(2); }
  allOk = (await check(k)) && allOk;
}
process.exit(allOk ? 0 : 1);
