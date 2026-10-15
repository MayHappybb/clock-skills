// Prove a design runs all day: sweep the clock and report what it costs.
//
//   node tools/check.mjs --design <key>|all [--fps n] [--bus b] [--quick]
//
// Frames checked: one every ~97 s across the whole day, plus every frame of
// a few seconds across several minute turns and hour turns (where designs
// do the most). For each design:
//
//   FAIL  frame() throws; a frame differs when rebuilt from cold (it keeps
//         state, or reads Date.now / Math.random); the wire cannot carry
//         the design's fps
//   WARN  a frame is blank; the rough C estimate exceeds the frame budget on
//         a host profile (the face may need a lower fps there); the
//         backlight never dims at night
//   info  bus time, refresh overlap, workload, colours, dark area, how much
//         of the glass changes per frame (what a tear can show)

import { parseArgs } from './render.mjs';
import { DESIGNS, buildFrame, fpsOf, dateFor } from '../sim/js/player.js';
import { estimate, HOSTS } from '../sim/js/cost.js';
import { from565 } from '../sim/js/color.js';

const args = parseArgs(process.argv.slice(2), ['quick']);
const which = args.design ?? args._[0];
if (!which) { console.error('usage: node tools/check.mjs --design <key>|all'); process.exit(2); }
const keys = which === 'all' ? Object.keys(DESIGNS) : [which];
for (const k of keys) if (!DESIGNS[k]) { console.error(`unknown design '${k}'`); process.exit(2); }

let failed = false;
for (const key of keys) failed = checkOne(key) || failed;
process.exit(failed ? 1 : 0);

function checkOne(key) {
  const design = DESIGNS[key];
  const fps = fpsOf(design, args.fps);
  const opts = { fps: args.fps, bus: args.bus };
  const fails = [], warns = [];

  // The instants to check, as [clock at t=0, t].
  const samples = [];
  const stepS = args.quick ? 601 : 97;
  for (let s = 0; s < 86400; s += stepS) samples.push(hms(s));
  const turns = args.quick ? ['10:09:58', '23:59:58'] : ['10:09:58', '10:59:58', '12:30:58', '22:59:58', '23:59:58', '06:59:58'];
  const dense = [];
  for (const c of turns) for (let i = 0; i < Math.round(4 * fps); i++) dense.push([c, i / fps]);

  const hostsMs = Object.fromEntries(Object.keys(HOSTS).map((h) => [h, { max: 0, sum: 0, at: '' }]));
  let n = 0, busMax = 0, colMax = 0, darkMax = 0, blank = 0, changeMax = 0, changeAt = '', overlapMax = 0, refresh = 0;
  const work = { written: 0, blended: 0, edges: 0, shaded: 0, trig: 0 };

  const visit = (clock, t, prevBuf) => {
    let b;
    try { b = buildFrame(key, { ...opts, clock, t, meter: true }); }
    catch (e) { fails.push(`frame() throws at ${clock}+${t.toFixed(3)}s: ${e.message}`); return null; }
    n++;
    const at = dateFor(clock, t).toTimeString().slice(0, 8);
    busMax = Math.max(busMax, b.report.ms);
    refresh = b.lcd.frameRate();
    overlapMax = Math.max(overlapMax, (b.report.ms / 1000) * refresh);
    for (const h of Object.keys(HOSTS)) {
      const ms = estimate(b.canvas.cost, b.cpu.math, h).ms;
      hostsMs[h].sum += ms;
      if (ms > hostsMs[h].max) { hostsMs[h].max = ms; hostsMs[h].at = at; }
    }
    for (const k of Object.keys(work)) work[k] = Math.max(work[k], b.cpu.workload[k]);
    const buf = b.canvas.buf, counts = new Set(buf);
    colMax = Math.max(colMax, counts.size);
    if (counts.size === 1) blank++;
    let dark = 0;
    for (let i = 0; i < buf.length; i++) { const c = from565(buf[i]); if (((c >> 16) & 255) < 20 && ((c >> 8) & 255) < 20 && (c & 255) < 20) dark++; }
    darkMax = Math.max(darkMax, dark / buf.length);
    if (prevBuf) {
      let ch = 0;
      for (let i = 0; i < buf.length; i++) if (buf[i] !== prevBuf[i]) ch++;
      if (ch / buf.length > changeMax) { changeMax = ch / buf.length; changeAt = at; }
    }
    return b;
  };

  for (const c of samples) visit(c, 0);
  let prev = null, prevClock = null;
  for (const [c, t] of dense) {
    const b = visit(c, t, prevClock === c ? prev : null);
    prev = b?.canvas.buf ?? null; prevClock = c;
  }

  // Cold rebuilds must match: a frame is a function of the clock alone.
  for (const [c, t] of [['10:09:31', 0.37], ['23:59:59', 0.5], ['04:12:07', 0]]) {
    try {
      const a = buildFrame(key, { ...opts, clock: c, t }).canvas.buf, b2 = buildFrame(key, { ...opts, clock: c, t }).canvas.buf;
      if (a.some((v, i) => v !== b2[i])) { fails.push(`frame at ${c}+${t}s differs when rebuilt: it must not keep state or read Date.now()/Math.random()`); break; }
    } catch { /* reported above */ }
  }

  // Night: does it dim? (Not asked of utilities: test card, specimen, the baseline.)
  if (!design.utility) try {
    const day = buildFrame(key, { ...opts, clock: '12:00:00' }), night = buildFrame(key, { ...opts, clock: '03:00:00' });
    if (night.lcd.backlight >= day.lcd.backlight && meanLight(night.canvas.buf) >= meanLight(day.canvas.buf) * 0.98)
      warns.push('never dims at night: use ctx.night with ctx.lcd.backlight() (a lit LCD is bright in a dark room)');
  } catch { /* reported above */ }

  const wireFps = 1000 / busMax;
  if (wireFps < fps) fails.push(`the wire carries ${wireFps.toFixed(0)} fps at most (${busMax.toFixed(2)} ms a frame); the design runs at ${fps}`);
  if (blank) warns.push(`${blank} frame(s) are a single colour`);
  const budget = 1000 / fps;
  const over = Object.entries(hostsMs).filter(([, v]) => v.max > budget).map(([h, v]) => `${h} (${v.max.toFixed(1)} ms at ${v.at})`);
  if (over.length) warns.push(`rough C estimate exceeds the ${budget.toFixed(1)} ms budget at ${fps} fps on: ${over.join(', ')}`);

  const verdict = fails.length ? 'FAIL' : warns.length ? 'WARN' : 'PASS';
  console.log(`\n${verdict}  ${key} (${design.name}), ${n} frames, ${fps} fps`);
  console.log(`  bus      ${busMax.toFixed(2)} ms a frame at most -> the wire allows ${wireFps.toFixed(0)} fps; the panel refreshes at ${refresh.toFixed(1)} Hz and a frame is on the wire for up to ${(overlapMax * 100).toFixed(0)}% of a refresh`);
  console.log(`  change   up to ${(changeMax * 100).toFixed(0)}% of the glass changes between frames${changeAt ? ` (at ${changeAt})` : ''}: a refresh overlapping the transfer can show a tear across that`);
  console.log(`  work     at most ${work.written} px written, ${work.blended} blended, ${work.edges} AA edge px, ${work.shaded} calls of your per-pixel code, ${work.trig} Math calls in a frame`);
  console.log(`  estimate ${Object.entries(hostsMs).map(([h, v]) => `${h} max ${v.max.toFixed(1)} / mean ${(v.sum / n).toFixed(1)} ms`).join('; ')} (rough; budget ${budget.toFixed(1)} ms)`);
  console.log(`  colours  up to ${colMax} distinct in a frame; up to ${(darkMax * 100).toFixed(0)}% of the glass near black (it shows as the panel's dark grey, not black)`);
  for (const f of fails) console.log(`  FAIL     ${f}`);
  for (const w of warns) console.log(`  WARN     ${w}`);
  return fails.length > 0;
}

function hms(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return `${h}:${m}:${x}`;
}

function meanLight(buf) {
  let s = 0;
  for (const v of buf) { const c = from565(v); s += ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255); }
  return s / buf.length;
}
