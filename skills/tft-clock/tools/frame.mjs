// One frame as text, instantly, no image: what it costs and what it holds.
//
//   node tools/frame.mjs <design> [options]
//
//   --t <s> --clock HH:MM:SS --fps <n> --bus <b> --module <key> --night <m>
//   --map               print the frame as characters, one per pixel, one per colour (legend below it)
//   --crop x,y,w,h      the map of just that box (implies --map)
//   --half              the map at half resolution (each character is the top-left pixel of a 2x2 block)
//
// The map is exact: one character is one stored RGB565 value. Use it to
// check pixel art, anti-aliasing, palettes and alignment without a render.

import { parseArgs } from './render.mjs';
import { DESIGNS, buildFrame } from '../sim/js/player.js';
import { estimate, HOSTS } from '../sim/js/cost.js';
import { from565, hexOf } from '../sim/js/color.js';
import { BUSES } from '../sim/js/st7735.js';

const args = parseArgs(process.argv.slice(2), ['map', 'half']);
const key = args._[0];
if (!key || !DESIGNS[key]) {
  console.error(key ? `unknown design '${key}'` : 'usage: node tools/frame.mjs <design> [--t s] [--clock HH:MM:SS] [--map] [--crop x,y,w,h]');
  process.exit(2);
}

const b = buildFrame(key, { t: Number(args.t ?? 0), clock: args.clock, fps: args.fps, bus: args.bus, module: args.module, night: args.night, meter: true });
const { report: rep, module: mod, fps, canvas: g } = b;
const period = 1 / b.lcd.frameRate();
const wireFps = 1000 / rep.ms;
const at = b.date.toTimeString().slice(0, 8) + '.' + String(b.date.getMilliseconds()).padStart(3, '0');

console.log(`${key} at ${at} (t=${Number(args.t ?? 0)}s), ${mod.label}, ${BUSES[b.bus].label}, driver ${b.design.driver ?? 'full'}`);
console.log(`bus:     ${rep.bytes.toLocaleString()} bytes in ${rep.transactions} transactions, ${rep.ms.toFixed(2)} ms -> the wire allows ${wireFps.toFixed(0)} fps; design runs at ${fps}: ${wireFps >= fps ? 'fits' : 'DOES NOT FIT'}`);
console.log(`panel:   refreshes at ${(1 / period).toFixed(1)} Hz; this frame is on the wire for ${((rep.ms / 1000 / period) * 100).toFixed(0)}% of a refresh${rep.ms > 0.05 ? ' (a refresh that overlaps it shows a tear: --tear on render.mjs)' : ''}`);
const w = b.cpu.workload;
console.log(`work:    ${w.written.toLocaleString()} px written, ${w.blended.toLocaleString()} blended, ${w.edges.toLocaleString()} AA edge px, ${w.ramp.toLocaleString()} gradient px, ${w.shaded.toLocaleString()} calls of your per-pixel code, ${w.trig.toLocaleString()} Math calls (${mathList(b)})`);
const per = Object.keys(HOSTS).map((h) => `${h} ${estimate(b.canvas.cost, mathOf(b), h).ms.toFixed(1)} ms`).join(', ');
console.log(`         rough C estimate per frame: ${per}; budget at ${fps} fps is ${(1000 / fps).toFixed(1)} ms${b.cpu.top.length ? `; most of it: ${b.cpu.top.join(', ')}` : ''}`);
const want = b.want;
console.log(`hw:      backlight ${want.backlight.toFixed(2)}${want.invert ? ', inverted' : ''}${want.idle ? ', idle (8 colours)' : ''}${want.displayOn ? '' : ', display OFF'}`);

const counts = new Map();
for (const v of g.buf) counts.set(v, (counts.get(v) ?? 0) + 1);
let dark = 0;
for (const [v, n] of counts) { const c = from565(v); if (((c >> 16) & 255) < 20 && ((c >> 8) & 255) < 20 && (c & 255) < 20) dark += n; }
console.log(`colours: ${counts.size} distinct; ${((dark / g.buf.length) * 100).toFixed(0)}% of the glass is near black (every channel < 20)`);
if (b.lcd.warnings.length) console.log(`warnings: ${b.lcd.warnings.join('; ')}`);

if (args.map || args.crop) {
  const [cx, cy, cw, ch] = (args.crop ?? `0,0,${g.width},${g.height}`).split(',').map(Number);
  const step = args.half ? 2 : 1;
  const sorted = [...counts].sort((a, b2) => b2[1] - a[1]).map(([v]) => v);
  const SYMBOLS = ' .#ox+=*%@abcdefghijklmnpqrstuvwyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789&$?!<>/\\|^~';
  const sym = new Map(sorted.map((v, i) => [v, SYMBOLS[i] ?? '?']));
  console.log('');
  for (let y = cy; y < cy + ch; y += step) {
    let line = '';
    for (let x = cx; x < cx + cw; x += step) line += sym.get(g.buf[y * g.width + x]);
    console.log(`${String(y).padStart(2)} |${line}|`);
  }
  const used = new Set();
  for (let y = cy; y < cy + ch; y += step) for (let x = cx; x < cx + cw; x += step) used.add(g.buf[y * g.width + x]);
  const legend = sorted.filter((v) => used.has(v)).map((v) => `'${sym.get(v)}' #${hexOf(from565(v))} (${counts.get(v)})`);
  console.log(`\n${legend.join('  ')}`);
}

function mathOf(bb) { return bb.cpu.math; }
function mathList(bb) {
  const m = bb.cpu.math ?? {};
  return Object.entries(m).filter(([, n]) => n > 0).sort((a, c) => c[1] - a[1]).slice(0, 5).map(([k, n]) => `${k} ${n}`).join(', ') || 'none';
}
