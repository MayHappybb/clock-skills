// Print what the glass shows as text, straight from the emulator. No browser.
//
//   node tools/frame.mjs <design> [--t 0] [--clock 10:09:30] [--bus i2c400]
//                                 [--module key] [--half] [--tear] [--crop x,y,w,h]
//
// '#' is a lit pixel, '.' an unlit one. --half packs two rows into each line
// with block characters (▀ ▄ █), so a 128x64 frame is 32 lines. --crop prints
// only part of the glass, at full detail, for checking a small area.

import { buildFrame, scanout } from '../sim/js/player.js';

const argv = process.argv.slice(2);
const opts = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--half' || a === '--tear') opts[a.slice(2)] = true;
  else if (a.startsWith('--')) opts[a.slice(2)] = argv[++i];
  else positional.push(a);
}
const name = positional[0];
if (!name) {
  console.error('usage: node tools/frame.mjs <design> [--t s] [--clock HH:MM:SS] [--half] [--tear] [--crop x,y,w,h]');
  process.exit(2);
}

const t = Number(opts.t ?? 0);
const { fpsOf } = await import('../sim/js/player.js');
const fps = fpsOf((await import('../sim/designs/index.js')).default[name], opts.fps);
const k = Math.floor(t * fps + 1e-9);
const { oled, design, module: mod, report } = buildFrame(name, { t: k / fps, clock: opts.clock, bus: opts.bus, module: opts.module, fps, night: opts.night });
const levels = scanout(oled, mod, { tear: !!opts.tear, t, frameStart: k / fps });

console.log(`${design.name}  @ t=${t}s  clock=${opts.clock ?? '10:09:30'}  module=${mod.key} (${mod.label})`);
console.log(`frame: ${report.ramBytes} RAM bytes, ${report.transactions} transactions, ${(report.busUs / 1000).toFixed(2)} ms on ${report.bus}` +
  ` -> bus allows ${report.fps === Infinity ? 'inf' : report.fps.toFixed(1)} fps, design runs at ${fps}: ` +
  (report.fps >= fps ? 'fits' : 'TOO SLOW for this bus'));
for (const w of report.warnings) console.log(`WARNING: ${w}`);
for (const n of report.notes) console.log(`note: ${n}`);
console.log(`panel refresh ${oled.frameRate().toFixed(1)} Hz`);
console.log();

const [cx, cy, cw, ch] = (opts.crop ?? `0,0,${mod.cols},${mod.rows}`).split(',').map(Number);
const lit = (x, y) => x >= 0 && y >= 0 && x < mod.cols && y < mod.rows && levels[y * mod.cols + x] > 0.001;
if (opts.half) {
  for (let y = cy; y < cy + ch; y += 2) {
    let line = '';
    for (let x = cx; x < cx + cw; x++) {
      const a = lit(x, y), b = y + 1 < cy + ch && lit(x, y + 1);
      line += a && b ? '█' : a ? '▀' : b ? '▄' : ' ';
    }
    console.log(line.replace(/\s+$/, '') || '');
  }
} else {
  for (let y = cy; y < cy + ch; y++) {
    let line = '';
    for (let x = cx; x < cx + cw; x++) line += lit(x, y) ? '#' : '.';
    console.log(line);
  }
}
