// Regression tests for the geometry: board LED counts, spec dimensions,
// lattice spacing, chain continuity, hexagon rings, layouts, and the COMB font.
//
//   node tools/test.mjs

import { panel, PANEL_KEYS } from '../sim/js/panels.js';
import { LAYOUTS, layout, overlapArea } from '../sim/js/layout.js';
import { COMB } from '../sim/js/fonts.js';
import { laneUs, hub75Budget, fullWhiteA } from '../sim/js/ws2812.js';

let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.log(`FAIL  ${msg}`); } };
const near = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;

function inside(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

const COUNTS = { hex331: 331, tri120: 120, oct196: 196, strip256: 256, sq400: 400, para128: 128, arc210: 210, hub64: 4096, s3m64: 64 };
const SERPENTINE = { hex331: true, tri120: true, para128: true };
const NOSIZE = { arc210: [84.5, 72.3] };   // modelled outline (spec 86 x 72.7: see panels.md)

for (const k of PANEL_KEYS) {
  const p = panel(k);
  const tol = k === 'arc210' ? 0.7 : 0.01;     // the arc board's bipolar lattice spaces 3.8-4.5 mm
  ok(p.leds.length === COUNTS[k], `${k}: ${p.leds.length} LEDs, spec says ${COUNTS[k]}`);
  const xs = p.outline.map((v) => v[0]), ys = p.outline.map((v) => v[1]);
  if (NOSIZE[k]) ok(near(p.size[0], NOSIZE[k][0], 0.2) && near(p.size[1], NOSIZE[k][1], 0.2), `${k}: modelled size ${p.size.map((v) => v.toFixed(1))}`);
  ok(near(Math.max(...xs) - Math.min(...xs), p.size[0], 0.1) && near(Math.max(...ys) - Math.min(...ys), p.size[1], 0.1),
    `${k}: outline ${(Math.max(...xs) - Math.min(...xs)).toFixed(2)} x ${(Math.max(...ys) - Math.min(...ys)).toFixed(2)}, spec ${p.size.join(' x ')}`);
  ok(near((Math.max(...xs) + Math.min(...xs)) / 2, 0, 0.1) && near((Math.max(...ys) + Math.min(...ys)) / 2, 0, 0.1), `${k}: origin is the bbox centre`);
  for (const l of p.leds) ok(inside(p.outline, l.x, l.y), `${k}: LED ${l.local} at (${l.x.toFixed(1)}, ${l.y.toFixed(1)}) is outside the board`);
  // nearest neighbour is exactly one pitch, for every LED
  let bad = 0;
  const nn = Math.min(p.pitch, p.pitchY ?? p.pitch);
  for (const a of p.leds) {
    let d = Infinity;
    for (const b of p.leds) if (a !== b) d = Math.min(d, Math.hypot(a.x - b.x, a.y - b.y));
    if (!near(d, nn, tol)) bad++;
  }
  ok(bad === 0, `${k}: ${bad} LEDs whose nearest neighbour is not ${nn} mm`);
  // chain: serpentine boards step one pitch every time; Z boards one pitch within a column
  let jumps = 0;
  for (let i = 1; i < p.leds.length; i++) {
    const d = Math.hypot(p.leds[i].x - p.leds[i - 1].x, p.leds[i].y - p.leds[i - 1].y);
    if (!near(d, p.pitch, tol) && !near(d, p.colStep ?? -1, 0.01)) jumps++;
  }
  const cols = new Set(p.leds.map((l) => l.col)).size;
  if (k === 'arc210') {
    // ring by ring: within a ring every step is one lattice step (3.8-6.1 mm, the
    // rings cross at a shallow angle near the base); a new ring starts at the base
    let bad = 0;
    for (let i = 1; i < p.leds.length; i++) { const a = p.leds[i - 1], b = p.leds[i]; if (a.u === b.u && !(Math.hypot(a.x - b.x, a.y - b.y) < 6.3 && b.v === a.v + 1)) bad++; }
    ok(bad === 0 && p.leds.every((l, i) => i === 0 || l.u >= p.leds[i - 1].u), `arc210: ${bad} broken steps within rings`);
  } else if (p.order === 'rows') {
    // row by row, left to right: one jump per new row
    const rows = new Set(p.leds.map((l) => l.row)).size;
    ok(jumps === rows - 1 && p.leds.every((l, i) => i === 0 || l.row > p.leds[i - 1].row || l.col === p.leds[i - 1].col + 1), `${k}: ${jumps} row jumps (expected ${rows - 1})`);
  } else ok(SERPENTINE[k] ? jumps === 0 : jumps === cols - 1, `${k}: ${jumps} chain jumps (expected ${SERPENTINE[k] ? 0 : cols - 1})`);
  // HUB75: leds[] is frame-buffer order, (0, 0) top-left; there is no DIN side
  if (p.bus === 'hub75') ok(p.leds[0].x < 0 && p.leds[0].y < 0 && p.leds[65].col === 1 && p.leds[65].row === 1, `${k}: frame buffer index y*64+x from the top-left`);
  else ok(p.leds[0].x < 0, `${k}: chain starts on the DIN (left, from the front) side`);
}

// hexagon rings
const H = panel('hex331');
for (let k = 1; k <= 10; k++) ok(H.leds.filter((l) => l.ring === k).length === 6 * k, `hex ring ${k} has ${6 * k} LEDs`);
const at = (ring, pos) => H.leds.find((l) => l.ring === ring && l.ringPos === pos);
ok(near(at(10, 0).x, 0) && near(at(10, 0).y, -40), 'hex ring 10 pos 0 is 12 o\'clock');
ok(near(at(10, 15).y, 0) && at(10, 15).x > 30, 'hex ring 10 pos 15 is 3 o\'clock');
ok(near(at(10, 30).y, 40), 'hex ring 10 pos 30 is 6 o\'clock');
ok(near(at(2, 3).y, 0) && at(2, 3).x > 0, 'hex ring 2 pos 3 is 3 o\'clock');
ok(H.leds[0].col === -10 && near(H.leds[0].y, -20) && near(H.leds[10].y, 20) && near(H.leds[11].y, 22), 'hex chain: 1 top-left, 11 bottom-left, 12 bottom of column 2');
for (const l of H.leds) ok((l.col + l.hr) % 2 === 0, 'hex: col + hr even');

// octagon chain map, spot checks against the printed table
const O = panel('oct196');
const rc = (n) => [O.leds[n - 1].col + 1, O.leds[n - 1].row + 1];
ok(rc(1).join() === '1,6' && rc(6).join() === '1,11' && rc(51).join() === '6,1' && rc(146).join() === '11,16' && rc(196).join() === '16,11', 'oct: map matches the table (1, 6, 51, 146, 196)');

// layouts: build, no LEDs on top of each other, wire cost sane
for (const k of Object.keys(LAYOUTS)) {
  const L = layout(k);
  let clash = 0;
  for (const a of L.leds) for (const i of L.index.near(a.x, a.y, 1.5)) if (L.leds[i].panel !== a.panel) clash++;
  ok(clash === 0, `layout ${k}: ${clash} LEDs closer than 1.5 mm to another board's`);
  for (const p of L.panels) for (const q of L.panels) if (p.index < q.index) {
    const a = overlapArea(p.outline, q.outline, 0.25);
    ok(a === 0, `layout ${k}: boards ${p.index} and ${q.index} overlap by ${a.toFixed(1)} mm2`);
  }
  ok(L.lanes.reduce((s, l) => s + l.count, 0) === L.n, `layout ${k}: lanes cover every LED`);
}
ok(layout('strip-x2').lattice?.kind === 'square', 'strip-x2 is one square lattice (seam 3.4 mm on a 3 mm pitch)');
ok(layout('sq-2x2').lattice?.kind === 'square', 'sq-2x2 is one square lattice');
{ // tri-hex: 3.41 mm is the smallest push that clears (0.05 less must collide)
  const L = layout('tri-hex'), tri = L.panels[0].def, RAD = Math.PI / 180;
  const at = (d, a) => tri.outline.map(([x, y]) => { const c = Math.cos(a * RAD), s = Math.sin(a * RAD), r = 25.98 + d; return [r * Math.cos(a * RAD) + x * c - y * s, r * Math.sin(a * RAD) + x * s + y * c]; });
  ok(overlapArea(at(3.41, 0), at(3.41, 60), 0.1) === 0 && overlapArea(at(3.36, 0), at(3.36, 60), 0.1) > 0, 'tri-hex push is the tightest that clears');
}
for (const k of ['tri-diamond', 'tri-pair', 'tri-big', 'tri-ribbon']) ok(layout(k).lattice?.kind === 'tri', `${k} is one triangular lattice`);
ok(layout('sq-strip').lattice?.kind === 'square' && layout('sq-x2').lattice?.kind === 'square', 'sq-strip and sq-x2 are one square lattice');
{ // on a shared tri lattice every LED's nearest neighbour is one pitch, across seams too
  for (const k of ['tri-diamond', 'tri-pair', 'tri-big', 'tri-ribbon']) {
    const L = layout(k);
    let bad = 0;
    for (const a of L.leds) { const d = Math.min(...L.index.near(a.x, a.y, 5).filter((i) => i !== a.i).map((i) => Math.hypot(L.leds[i].x - a.x, L.leds[i].y - a.y))); if (!near(d, 4, 0.01)) bad++; }
    ok(bad === 0, `${k}: ${bad} LEDs without a neighbour at exactly 4 mm`);
  }
}
ok(layout('hex-trio').lattice === null, 'hex-trio seams break the lattice');
// HUB75 panels tile seamlessly: one 2 mm lattice and a full raster
for (const [k, w, h] of [['hub', 64, 64], ['hub-x2', 128, 64], ['hub-tall', 64, 128], ['hub-2x2', 128, 128]]) {
  const L = layout(k);
  ok(L.grid && L.grid.w === w && L.grid.h === h && L.grid.idx.every((i) => i >= 0), `${k}: one ${w}x${h} raster with no holes`);
  ok(L.lanes.length === 1 && L.lanes[0].bus === 'hub75', `${k}: one HUB75 chain`);
}
for (const [k, w, h] of [['hub-x3', 192, 64], ['hub-x4', 256, 64], ['hub-tall3', 64, 192], ['hub-2x3', 128, 192], ['hub-3x3', 192, 192]]) {
  const L = layout(k);
  ok(L.grid && L.grid.w === w && L.grid.h === h && L.grid.idx.every((i) => i >= 0), `${k}: one ${w}x${h} raster with no holes`);
}
// non-rectangular assemblies: bounding-box raster, -1 where a panel is missing
for (const [k, w, h, n, hole] of [['hub-cross', 192, 192, 5, [0, 0]], ['hub-stair', 128, 128, 3, [127, 0]],
  ['hub-ring', 192, 192, 8, [96, 96]], ['hub-steps', 192, 192, 3, [191, 0]]]) {
  const L = layout(k), g = L.grid;
  ok(g && g.w === w && g.h === h && g.idx.filter((i) => i >= 0).length === n * 4096 && g.idx[hole[1] * w + hole[0]] === -1, `${k}: ${w}x${h} raster, ${n} panels, holes where none`);
}
{ const L = layout('hub-x2'), a = L.leds[L.grid.idx[63]], b = L.leds[L.grid.idx[64]]; ok(near(b.x - a.x, 2) && a.panel !== b.panel, 'hub-x2: 2 mm across the seam'); }
ok(layout('hub-s3m').lattice === null && layout('hub-s3m').lanes.map((l) => l.bus).join() === 'hub75,ws2812', 'hub-s3m: a HUB75 chain and the 8x8 lane');
ok(layout('s3m').grid?.w === 8 && layout('s3m').grid?.h === 8, 's3m: an 8x8 raster');
{ // HUB75 budget: one panel at 8 MHz, 8 bits: transition bit 2, 100 Hz, 32 KB a buffer
  const hb = hub75Budget(layout('hub'));
  ok(hb.chains[0].t === 2 && Math.round(hb.chains[0].refresh) === 100 && hb.ramBytes === 2 * 32768, `hub75: t=${hb.chains[0].t}, ${hb.chains[0].refresh.toFixed(1)} Hz, ${hb.ramBytes} B`);
  ok(near(fullWhiteA(layout('hub')), 3.1, 0.01), 'hub75: full white is the spec 3 A plus idle');
}
ok(near(laneUs(331), 331 * 30 + 300, 1e-6), 'wire: 30 us an LED plus the latch');

// COMB glyphs: parity, and every stroke a chain of nearest neighbours
for (const [ch, paths] of Object.entries(COMB.glyphs)) {
  for (const path of paths) {
    for (const [c, k] of path) ok((c + k) % 2 === 0 && c >= 0 && c < COMB.cols && k >= 0 && k < COMB.k, `COMB '${ch}': dot ${c},${k} off the lattice or the box`);
    for (let i = 1; i < path.length; i++) {
      const [a, b] = path[i - 1], [c, d] = path[i];
      const step = (Math.abs(a - c) === 1 && Math.abs(b - d) === 1) || (a === c && Math.abs(b - d) === 2);
      ok(step, `COMB '${ch}': ${a},${b} -> ${c},${d} is not a neighbour step`);
    }
  }
}

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
