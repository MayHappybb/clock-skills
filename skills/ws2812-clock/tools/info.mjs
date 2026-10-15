// The boards and assemblies, with what they cost on the wire and the supply.
//
//   node tools/info.mjs                  every layout, one line each
//   node tools/info.mjs --layout hex     one layout in detail
//   node tools/info.mjs --panels         every board

import { parseArgs } from './render.mjs';
import { LAYOUTS, layout } from '../sim/js/layout.js';
import { panel, PANEL_KEYS } from '../sim/js/panels.js';
import { wireBudget, hub75Budget, fullWhiteA } from '../sim/js/ws2812.js';

const args = parseArgs(process.argv.slice(2), ['panels']);

if (args.panels) {
  for (const k of PANEL_KEYS) {
    const p = panel(k);
    const amps = p.bus === 'hub75' ? `${p.hub.fullA} A full` : `${p.mA} mA`;
    console.log(`${k.padEnd(9)} ${String(p.leds.length).padStart(4)} LEDs  ${p.size.join(' x ')} mm  ${p.lattice.padEnd(7)} P${p.pitch}${p.pitchY ? 'x' + p.pitchY : ''}  ${p.bus}  ${p.pkg} ${amps}  ${p.label}`);
    if (p.notes) console.log(`          ${p.notes}`);
  }
  process.exit(0);
}

const row = (k) => {
  const L = layout(k), w = wireBudget(L), hb = hub75Budget(L);
  const ws = w.lanes.length ? `${String(w.lanes.length).padStart(2)} lane(s) ${(w.frameUs / 1000).toFixed(1).padStart(5)} ms -> ${w.maxFps.toFixed(0).padStart(4)} fps  ` : '';
  const hs = hb.chains.length ? `HUB75 ${hb.chains.map((c) => c.panels.length + ' panel(s) ' + c.refresh.toFixed(0) + ' Hz, t=' + c.t).join(' + ')}, ${(hb.ramBytes / 1024).toFixed(0)} KB  ` : '';
  return `${k.padEnd(12)} ${String(L.n).padStart(5)} LEDs  ${L.bbox.w.toFixed(0).padStart(4)} x ${L.bbox.h.toFixed(0).padEnd(4)} mm  ` + ws + hs +
    `full white ${fullWhiteA(L).toFixed(1).padStart(5)} A  supply ${L.supply} A  ${L.lattice ? 'one ' + L.lattice.kind + ' lattice' : 'seams break the lattice'}`;
};

if (!args.layout) { for (const k of Object.keys(LAYOUTS)) console.log(row(k)); process.exit(0); }

const L = layout(args.layout);
console.log(row(args.layout));
console.log(`  ${L.label}; bbox ${L.bbox.w.toFixed(1)} x ${L.bbox.h.toFixed(1)} mm`);
for (const p of L.panels) {
  console.log(`  board ${p.index}: ${p.def.key} (${p.def.bus}${p.def.ownMcu ? ', own MCU' : ''}) at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) mm, rot ${p.rot} deg, lane ${p.lane}, LEDs ${p.start}..${p.start + p.count - 1}`);
}
// seam spacing: for each pair of boards, the closest LEDs across
for (let a = 0; a < L.panels.length; a++) for (let b = a + 1; b < L.panels.length; b++) {
  let best = Infinity;
  const A = L.leds.filter((l) => l.panel === a), B = L.leds.filter((l) => l.panel === b);
  for (const p of A) for (const q of B) best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y));
  if (best < 3 * L.pitch) console.log(`  seam ${a}|${b}: closest LEDs ${best.toFixed(2)} mm apart (pitch ${L.pitch})`);
}
