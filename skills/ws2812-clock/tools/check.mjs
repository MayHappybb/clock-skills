// Prove a design runs all day on real hardware: frame rate on the wire,
// RAM, supply current, heat, and what the dim end of 8 bits does to it.
// HUB75 panels get their own budget: refresh rate, frame-buffer RAM and
// the cost of updating the buffer, instead of wire time.
//
//   node tools/check.mjs --design <key> [--layout <key>] [--controller esp32s3]
//                        [--supply <A>] [--night auto|off|on]
//                        [--hubclk <MHz>] [--depth <bits>] [--single]   (HUB75)
//
// Sweeps every minute of a day, plus a few seconds of 30 fps round every
// hour turn (where most designs are busiest). Exit code 1 on FAIL.

import { parseArgs } from './render.mjs';
import { runner, DESIGNS, layoutFor } from '../sim/js/player.js';
import { wireBudget, hub75Budget, fullWhiteA, ledCurrents, CONTROLLERS, WIRE } from '../sim/js/ws2812.js';

const args = parseArgs(process.argv.slice(2), ['single']);
const key = args.design ?? args._[0];
const design = DESIGNS[key];
if (!design) { console.error('usage: node tools/check.mjs --design <key> [--layout <key>]'); process.exit(2); }
const L = layoutFor(design, args.layout);
const ctrl = args.controller ?? 'esp32s3';
if (!CONTROLLERS[ctrl]) { console.error(`controller: ${Object.keys(CONTROLLERS).join(', ')}`); process.exit(2); }
const supply = Number(args.supply ?? L.supply);
const r = runner(design, { layout: L.key, clock: '00:00:00', night: args.night });

const area = (poly) => Math.abs(poly.reduce((s, [x, y], k) => { const [u, v] = poly[(k + 1) % poly.length]; return s + x * v - u * y; }, 0)) / 2;

let maxA = 0, maxAt = 0, sumA = 0, nA = 0, maxMs = 0, sumMs = 0, nMs = 0, blank = 0, minutes = 0;
let lit = 0, low = 0, lowNight = 0, litNight = 0, bad = 0, badAt = 0;
const perPanel = new Float64Array(L.panels.length);   // peak watts per board
const panelOf = L.leds.map((l) => l.panel);
const { chMa, idleMa } = ledCurrents(L);

function sample(t, perMinute) {
  const f = r.at(t);
  if (f.amps > maxA) { maxA = f.amps; maxAt = t; }
  maxMs = Math.max(maxMs, f.ms); sumMs += f.ms; nMs++;
  const w = new Float64Array(L.panels.length);
  let any = false;
  const night = f.date.getHours() >= 23 || f.date.getHours() < 7;
  for (let i = 0; i < L.n; i++) {
    let mA = idleMa[i];
    for (let c = 0; c < 3; c++) {
      const v = f.values[3 * i + c], d = f.duty[3 * i + c];
      if (!Number.isFinite(v) || !Number.isFinite(d)) { if (!bad++) badAt = t; continue; }   // NaN/Infinity from the design
      mA += chMa[i] * d;
      if (v) { any = true; if (perMinute) { lit++; if (v < 8) low++; if (night) { litNight++; if (v < 8) lowNight++; } } }
    }
    w[panelOf[i]] += (mA * WIRE.volts) / 1000;
  }
  for (let p = 0; p < w.length; p++) perPanel[p] = Math.max(perPanel[p], w[p] + (L.panels[p].def.mcuW ?? 0));
  if (perMinute) { sumA += f.amps; nA++; minutes++; if (!any) blank++; }
}

const t0 = performance.now();
for (let m = 0; m < 1440; m++) sample(m * 60 + 21.3, true);
for (let h = 0; h < 24; h++) for (let s = -1; s < 6; s += 1 / 30) sample(h * 3600 + s, false);
const secs = (performance.now() - t0) / 1000;

const wire = wireBudget(L, ctrl);
const fps = r.fps, results = [];
const verdict = (level, msg) => results.push([level, msg]);

if (wire.lanes.length) {
  verdict(wire.maxFps >= fps ? 'PASS' : 'FAIL',
    `wire: ${wire.lanes.map((l) => l.count).join('+')} WS2812 LEDs on ${wire.lanes.length} lane(s), ${(wire.frameUs / 1000).toFixed(2)} ms a frame -> ${wire.maxFps.toFixed(0)} fps max; design runs ${fps} fps`);
  if (wire.own) verdict('PASS', `${wire.own} board(s) run their own ESP32-S3: each sends its own lane, kept in step over Wi-Fi (ESP-NOW/NTP), not by wire`);
  if (wire.shared > wire.controller.lanes) verdict('WARN', `${wire.shared} lanes but ${ctrl} drives ${wire.controller.lanes} at once: the rest go out in turn`);
  verdict(wire.ramBytes * 2 < wire.controller.ramKB * 1024 * 0.5 ? 'PASS' : 'FAIL', `RAM: ${wire.ramBytes} bytes a frame (x2 double-buffered) on ${wire.controller.label}`);
}

const hub = hub75Budget(L, { clockHz: args.hubclk ? Number(args.hubclk) * 1e6 : undefined, depth: args.depth ? Number(args.depth) : undefined, double: !args.single });
for (const c of hub.chains) {
  const exact = c.t <= 2 ? 'every level in proportion down to ' + (2 ** (c.t + 1)) + '/255' : `levels below ${2 ** (c.t + 1)}/255 shown out of proportion (dim end crushed)`;
  verdict(c.refresh >= hub.minRefresh && c.t <= 3 ? 'PASS' : 'WARN',
    `HUB75 refresh: chain of ${c.panels.length} panel(s), ${c.ppr} px a row, ${hub.depth}-bit at ${hub.clockHz / 1e6} MHz -> ${c.refresh.toFixed(0)} Hz with transition bit ${c.t}: ${exact}`);
}
if (hub.chains.length) {
  const kb = hub.ramBytes / 1024;
  verdict(kb <= hub.internalKB ? 'PASS' : 'WARN', `HUB75 RAM: ${kb.toFixed(0)} KB of DMA frame buffer (${hub.double ? 'double-buffered: no tearing' : 'single: tears'}); ` +
    (kb <= hub.internalKB ? `fits the ESP32-S3's internal SRAM (~${hub.internalKB} KB free beside Wi-Fi)` : `more than ~${hub.internalKB} KB internal: needs PSRAM (SPIRAM_DMA_BUFFER, 8 MHz) or --single`));
  verdict(hub.maxFps >= fps ? 'PASS' : 'WARN', `HUB75 update: ${hub.pixels} pixels into the bit planes, ~${(hub.updateUs / 1000).toFixed(1)} ms a frame (${hub.pixelUs} us/px ASSUMED) -> ${hub.maxFps.toFixed(0)} fps; design runs ${fps}`);
}

verdict(maxMs < 1000 / fps * 0.5 ? 'PASS' : 'WARN', `compute: frame() worst ${maxMs.toFixed(2)} ms, mean ${(sumMs / nMs).toFixed(2)} ms in Node (an MCU is 10-50x slower; budget ${(1000 / fps).toFixed(1)} ms)`);
verdict(maxA <= supply ? 'PASS' : 'FAIL', `current: peak ${maxA.toFixed(2)} A at ${new Date(r.at(maxAt).date).toTimeString().slice(0, 8)}, day mean ${(sumA / nA).toFixed(2)} A; supply ${supply} A (full white would be ${fullWhiteA(L).toFixed(1)} A)`);
if (bad) verdict('FAIL', `output: ${bad} non-finite channel values (NaN or Infinity), first at ${new Date(r.at(badAt).date).toTimeString().slice(0, 8)}; they were left out of the current and heat figures`);
const dens = L.panels.map((p, k) => perPanel[k] / (area(p.outline) / 100));
const hot = Math.max(...dens), hotP = L.panels[dens.indexOf(hot)];
verdict(hot <= 0.25 ? 'PASS' : hot <= 0.5 ? 'WARN' : 'FAIL',
  `heat: hottest board (${hotP.def.key}) peaks at ${hot.toFixed(3)} W/cm2 (${perPanel[hotP.index].toFixed(2)} W${hotP.def.mcuW ? `, incl. its MCU's ${hotP.def.mcuW} W` : ''}); heuristic limit 0.25 for a bare 1.2 mm board, see hardware.md`);
verdict(blank === 0 ? 'PASS' : 'WARN', `blank: ${blank} of ${minutes} minute samples had every LED off`);
const lowPct = (100 * low) / Math.max(1, lit), lowN = (100 * lowNight) / Math.max(1, litNight);
verdict(lowPct < 25 ? 'PASS' : 'WARN', `dim end: ${lowPct.toFixed(0)}% of lit channels are below 8/255 (${lowN.toFixed(0)}% at night). ` +
  `Levels that low step visibly and shift hue${design.dither ? ' (dithered: smooth, but 1-2 flicker at low fps)' : ''}` +
  (wire.lanes.length ? '; WS2812B-V5 parts stay dark below 3.' : '.') +
  (hub.chains.length ? ' HUB75 values are counted at full scale: the panel dims by its OE pulse.' : ''));

console.log(`${key} on ${L.label} (${L.n} LEDs), ${fps} fps, ${ctrl}; ${nMs} frames in ${secs.toFixed(1)} s`);
for (const [lv, msg] of results) console.log(`  ${lv.padEnd(4)}  ${msg}`);
const fail = results.some(([lv]) => lv === 'FAIL');
console.log(fail ? 'FAIL' : results.some(([lv]) => lv === 'WARN') ? 'PASS with warnings' : 'PASS');
process.exit(fail ? 1 : 0);
