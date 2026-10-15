// Assemblies: which boards, where, turned how, and on which data line.
//
//   { key, label, panels: [{ panel: 'hex331', x, y, rot, lane }], supply, turn }
//
// x, y place the board's origin (its bounding-box centre) in millimetres;
// rot turns it clockwise on screen, in degrees, about that origin. Boards
// are chained in the order listed; `lane` puts a board on another data line
// (a separate GPIO), which is sent in parallel. `supply` is the power
// budget in amps at 5 V. `turn` (degrees) turns the whole assembly after
// placing it, so a tower of triangles can become a horizontal ribbon.
//
// buildLayout() turns that into one flat list of LEDs in world millimetres,
// numbered in the order the data reaches them, lane by lane.

import { panel } from './panels.js';

const RAD = Math.PI / 180;
const SQ3 = Math.sqrt(3);

function place(p, x, y) {
  const c = Math.cos(p.rot * RAD), s = Math.sin(p.rot * RAD);
  return [p.x + x * c - y * s, p.y + x * s + y * c];
}

/**
 * If every LED sits on one lattice, give each global lattice coordinates
 * (gx, gy) and return the lattice; otherwise null. Seams usually break it:
 * most boards leave more than a pitch between LEDs across a butt joint.
 */
function sharedLattice(leds, defs, turn = 0) {
  const fam = new Set(defs.map((d) => d.lattice)), pitch = new Set(defs.map((d) => d.pitch));
  if (fam.size !== 1 || pitch.size !== 1) return null;
  const kind = [...fam][0], P = [...pitch][0];
  if (kind !== 'square' && kind !== 'tri') return null;   // rhombic: only single boards have one
  const PY = new Set(defs.map((d) => d.pitchY ?? d.pitch));
  if (PY.size !== 1) return null;
  // test in the assembly's own frame, before `turn`
  const c = Math.cos(-turn * RAD), s = Math.sin(-turn * RAD);
  const un = (l) => [l.x * c - l.y * s, l.x * s + l.y * c];
  const [ox, oy] = un(leds[0]), tol = 0.2 * P;
  const sx = kind === 'square' ? P : P * SQ3 / 2, sy = kind === 'square' ? [...PY][0] : P / 2;
  const g = [];
  for (const l of leds) {
    const [x, y] = un(l);
    const rx = Math.round((x - ox) / sx), ry = Math.round((y - oy) / sy);
    if (Math.hypot(rx * sx - (x - ox), ry * sy - (y - oy)) > tol) return null;
    if (kind === 'tri' && (rx + ry) % 2) return null;
    g.push([rx, ry]);
  }
  leds.forEach((l, i) => { [l.gx, l.gy] = g[i]; });
  return { kind, pitch: P, turn, origin: [leds[0].x, leds[0].y] };
}

/**
 * On one square lattice: the layout as a raster. w x h cells, idx[y * w + x]
 * is the LED at grid cell (x, y) (gx - x0, gy - y0), or -1 where there is
 * none (cut corners, holes). Every LED gets gridX / gridY too.
 */
function rasterOf(leds) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of leds) { x0 = Math.min(x0, l.gx); x1 = Math.max(x1, l.gx); y0 = Math.min(y0, l.gy); y1 = Math.max(y1, l.gy); }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, idx = new Int32Array(w * h).fill(-1);
  for (const l of leds) { l.gridX = l.gx - x0; l.gridY = l.gy - y0; idx[l.gridY * w + l.gridX] = l.i; }
  return { w, h, x0, y0, idx };
}

export function buildLayout(spec) {
  const turn = spec.turn ?? 0, tc = Math.cos(turn * RAD), ts = Math.sin(turn * RAD);
  const panels = spec.panels.map((p, pi) => {
    const q = { rot: 0, x: 0, y: 0, lane: 0, ...p };
    if (turn) [q.x, q.y, q.rot] = [q.x * tc - q.y * ts, q.x * ts + q.y * tc, q.rot + turn];
    return { ...q, index: pi, def: panel(p.panel) };
  });
  const lanes = [];
  for (const p of panels) (lanes[p.lane] ??= []).push(p);
  const leds = [];
  for (const [laneNo, lp] of lanes.entries()) {
    if (!lp) continue;
    let k = 0;
    for (const p of lp) {
      p.start = leds.length;
      for (const l of p.def.leds) {
        const [x, y] = place(p, l.x, l.y);
        leds.push({ ...l, x, y, rot: l.rot + p.rot, panel: p.index, type: p.def.key, lane: laneNo, laneIndex: k++, i: leds.length });
      }
      p.count = p.def.leds.length;
      p.outline = p.def.outline.map(([x, y]) => place(p, x, y));
    }
  }
  const xs = panels.flatMap((p) => p.outline.map((v) => v[0])), ys = panels.flatMap((p) => p.outline.map((v) => v[1]));
  const bbox = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  bbox.w = bbox.x1 - bbox.x0; bbox.h = bbox.y1 - bbox.y0;
  bbox.cx = (bbox.x0 + bbox.x1) / 2; bbox.cy = (bbox.y0 + bbox.y1) / 2;
  const L = {
    key: spec.key, label: spec.label ?? spec.key, supply: spec.supply ?? 3,
    panels, leds, n: leds.length, bbox,
    lanes: lanes.filter(Boolean).map((lp) => {
      const bus = new Set(lp.map((p) => p.def.bus));
      if (bus.size > 1) throw new Error(`layout ${spec.key}: a lane mixes ${[...bus].join(' and ')} boards`);
      return { panels: lp.map((p) => p.index), count: lp.reduce((s, p) => s + p.count, 0), bus: [...bus][0] };
    }),
    pitch: Math.min(...panels.map((p) => p.def.pitch)),
  };
  L.lattice = sharedLattice(leds, panels.map((p) => p.def), turn);
  L.grid = L.lattice?.kind === 'square' ? rasterOf(leds) : null;
  L.index = spatialIndex(leds, L.pitch);
  return L;
}

/** A bucket grid over the LEDs, for "which LEDs are near (x, y)" queries. */
function spatialIndex(leds, pitch) {
  const cell = pitch * 2, map = new Map();
  const key = (i, j) => i * 73856093 ^ j * 19349663;
  for (const l of leds) {
    const k = key(Math.floor(l.x / cell), Math.floor(l.y / cell));
    (map.get(k) ?? map.set(k, []).get(k)).push(l.i);
  }
  return {
    /** Indices of LEDs within r mm of (x, y). */
    near(x, y, r) {
      const out = [];
      const i0 = Math.floor((x - r) / cell), i1 = Math.floor((x + r) / cell);
      const j0 = Math.floor((y - r) / cell), j1 = Math.floor((y + r) / cell);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const b = map.get(key(i, j));
        if (b) for (const n of b) { const l = leds[n]; if ((l.x - x) ** 2 + (l.y - y) ** 2 <= r * r) out.push(n); }
      }
      return out;
    },
    /** The LED at (x, y), within a third of a pitch, or -1. */
    at(x, y) {
      let best = -1, bd = (pitch / 3) ** 2;
      for (const n of this.near(x, y, pitch / 3)) { const d = (leds[n].x - x) ** 2 + (leds[n].y - y) ** 2; if (d < bd) { bd = d; best = n; } }
      return best;
    },
  };
}

// ---------------------------------------------------------------- presets

const HEX_FLAT = 74.5;                       // hexagon, flat to flat
const TRI_W = 51.96;                         // triangle, apex corner to base edge

function insidePoly(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Area (mm2, sampled on a `step` grid) where two outlines overlap. Butted edges give 0. */
export function overlapArea(a, b, step = 0.2) {
  const bb = (p) => [Math.min(...p.map((v) => v[0])), Math.min(...p.map((v) => v[1])), Math.max(...p.map((v) => v[0])), Math.max(...p.map((v) => v[1]))];
  const [a0, a1, a2, a3] = bb(a), [b0, b1, b2, b3] = bb(b);
  const x0 = Math.max(a0, b0), y0 = Math.max(a1, b1), x1 = Math.min(a2, b2), y1 = Math.min(a3, b3);
  let n = 0;
  for (let y = y0 + step * 0.537; y < y1; y += step) for (let x = x0 + step * 0.537; x < x1; x += step) if (insidePoly(a, x, y) && insidePoly(b, x, y)) n++;
  return n * step * step;
}

// Six triangles round a point, bases outward. The stepped edges stick out
// past the ideal 30-degree line by one step, so apex to apex they would
// collide: each is pushed out along its own axis until no two outlines
// overlap (3.41 mm, found by bisection with overlapArea; tools/test.mjs
// checks it). That leaves a hole in the middle and a sawtooth gap along
// every seam: this is the real assembly, not a seamless hexagon.
const TRI_PUSH = 3.41;
function sixTriangles() {
  return [0, 60, 120, 180, 240, 300].map((a) => ({
    panel: 'tri120', rot: a, lane: Math.floor(a / 120),
    x: (TRI_W / 2 + TRI_PUSH) * Math.cos(a * RAD), y: (TRI_W / 2 + TRI_PUSH) * Math.sin(a * RAD),
  }));
}

// A triangle on the shared triangular lattice: `sc` columns (3.464 mm) and
// `sh` half-rows (2 mm) from the origin, `flip` = turned 180 (apex right).
// Triangles turned 0 / 180 interlock exactly: their stepped edges are
// complementary, so the LEDs continue on ONE lattice across the seams
// (provided sh - sc is even). Derivation in references/panels.md.
const DX = 4 * SQ3 / 2;
const triAt = (sc, sh, flip = false, lane = 0) => ({ panel: 'tri120', x: sc * DX, y: sh * 2, rot: flip ? 180 : 0, lane });
// Arc triangles with their apex at the origin, pointing in towards it, the
// board's axis at `a` degrees (the apex corner is about 120 degrees, so
// three meet round a point). APEX is the board-frame y of the apex.
const ARC_APEX = 36.16;
const arcAt = (a, lane = 0) => ({ panel: 'arc210', rot: a + 270, x: ARC_APEX * Math.cos(a * RAD), y: ARC_APEX * Math.sin(a * RAD), lane });
const hexAt = (k, lane) => (k < 0 ? { panel: 'hex331', x: 0, y: 0, lane } :
  { panel: 'hex331', x: HEX_FLAT * Math.cos(k * 60 * RAD), y: HEX_FLAT * Math.sin(k * 60 * RAD), lane });

export const LAYOUTS = {
  hex:        { label: 'one hexagon (331)', panels: [{ panel: 'hex331' }], supply: 3 },
  tri:        { label: 'one triangle (120)', panels: [{ panel: 'tri120' }] },
  oct:        { label: 'one octagon (196)', panels: [{ panel: 'oct196' }] },
  strip:      { label: 'one 32x8 strip', panels: [{ panel: 'strip256' }] },
  sq:         { label: 'one 20x20 square', panels: [{ panel: 'sq400' }] },
  para:       { label: 'one 16x8 parallelogram', panels: [{ panel: 'para128' }] },
  arc:        { label: 'one arc triangle (210)', panels: [{ panel: 'arc210' }] },
  'arc-pair': { label: 'two arc triangles apex to apex: a bow tie (420)', panels: [arcAt(180), arcAt(0, 1)] },
  'arc-trio': { label: 'three arc triangles round a point: a trefoil (630)', panels: [arcAt(-90), arcAt(30, 1), arcAt(150, 2)], supply: 4 },

  'hex-trio': {
    label: 'three hexagons, flat sides touching (993)', supply: 5,
    panels: [
      { panel: 'hex331', x: -HEX_FLAT / 2, y: -HEX_FLAT * SQ3 / 4 },
      { panel: 'hex331', x: HEX_FLAT / 2, y: -HEX_FLAT * SQ3 / 4, lane: 1 },
      { panel: 'hex331', x: 0, y: HEX_FLAT * SQ3 / 4, lane: 2 },
    ],
  },
  'tri-hex':     { label: 'six triangles as a hexagon (720)', panels: sixTriangles(), supply: 5 },
  'tri-diamond': {
    label: 'two triangles base to base: one lattice (240)',
    panels: [triAt(0, 0), triAt(15, 1, true)],
  },
  'tri-pair': {
    label: 'two triangles along a slant: a parallelogram, one lattice (240)',
    panels: [triAt(0, 0), triAt(0, -16, true)],
  },
  'tri-big': {
    label: 'four triangles as one big triangle: one lattice (480)',
    panels: [triAt(0, 0), triAt(15, 1, true), triAt(15, -15, false, 1), triAt(15, 17, false, 1)],
  },
  'tri-mountain': {
    label: 'four triangles as one big triangle, standing apex up: one lattice (480)', turn: 90,
    panels: [triAt(0, 0), triAt(15, 1, true), triAt(15, -15, false, 1), triAt(15, 17, false, 1)],
  },
  'tri-ribbon': {
    label: 'five triangles alternating: a long ribbon, one lattice (600)', turn: 90, supply: 4,
    panels: [triAt(0, 0), triAt(0, -16, true), triAt(0, -32, false, 1), triAt(0, -48, true, 1), triAt(0, -64, false, 2)],
  },
  'hex-pair': {
    label: 'two hexagons side by side (662)',
    panels: [{ panel: 'hex331', x: -HEX_FLAT / 2 }, { panel: 'hex331', x: HEX_FLAT / 2, lane: 1 }],
  },
  'hex-row': {
    label: 'three hexagons in a row (993)', supply: 5,
    panels: [{ panel: 'hex331', x: -HEX_FLAT }, { panel: 'hex331', lane: 1 }, { panel: 'hex331', x: HEX_FLAT, lane: 2 }],
  },
  'hex-flower': {
    label: 'seven hexagons: a honeycomb flower (2317)', supply: 10,
    panels: [-1, 0, 1, 2, 3, 4, 5].map((k, i) => hexAt(k, i)),
  },
  'oct-trio': {
    label: 'three octagons in a row: three round dials (588)',
    panels: [{ panel: 'oct196', x: -64 }, { panel: 'oct196', lane: 1 }, { panel: 'oct196', x: 64, lane: 2 }],
  },
  'oct-strip': {
    label: 'an octagon dial over a 32x8 strip (452)',
    panels: [{ panel: 'oct196', y: -44.2 }, { panel: 'strip256', lane: 1 }],
  },
  'sq-x2': {
    label: 'two squares side by side: 40x20, one lattice (800)', supply: 4,
    panels: [{ panel: 'sq400', x: -30 }, { panel: 'sq400', x: 30, lane: 1 }],
  },
  'sq-strip': {
    label: 'a 20x20 square over a 32x8 strip: one lattice (656)',
    panels: [{ panel: 'sq400', y: -12.2 }, { panel: 'strip256', y: 30, lane: 1 }],
  },
  'strip-x2': {
    label: 'two strips stacked: 32x16 (512)',
    panels: [{ panel: 'strip256', y: -12.2 }, { panel: 'strip256', y: 12.2 }],
  },
  'strip-x3': {
    label: 'three strips stacked: 32x24 (768)', supply: 4,
    panels: [{ panel: 'strip256', y: -24.4 }, { panel: 'strip256', y: 0, lane: 1 }, { panel: 'strip256', y: 24.4, lane: 2 }],
  },
  'strip-x4': {
    label: 'four strips stacked: 32x32 (1024)', supply: 5,
    panels: [-1.5, -0.5, 0.5, 1.5].map((k, i) => ({ panel: 'strip256', y: k * 24.4, lane: i })),
  },
  'sq-2x2': {
    label: 'four squares: 40x40 (1600)', supply: 5,
    panels: [
      { panel: 'sq400', x: -30, y: -30 }, { panel: 'sq400', x: 30, y: -30, lane: 1 },
      { panel: 'sq400', x: -30, y: 30, lane: 2 }, { panel: 'sq400', x: 30, y: 30, lane: 3 },
    ],
  },
  'para-x2': {
    label: 'two parallelograms end to end (256)',
    panels: [{ panel: 'para128', x: -42.275 / 2 }, { panel: 'para128', x: 42.275 / 2 }],
  },
  'para-stack': {
    label: 'two parallelograms stacked along the slant (256)',
    panels: [{ panel: 'para128', x: 10.587 / 2, y: -9.55 }, { panel: 'para128', x: -10.587 / 2, y: 9.55 }],
  },
  'para-tower': {
    label: 'four parallelograms stacked along the slant: a leaning tower (512)',
    panels: [0, 1, 2, 3].map((k) => ({ panel: 'para128', x: (1.5 - k) * 10.587, y: (k - 1.5) * 19.1, lane: k >> 1 })),
  },

  // HUB75 panels: 64 x 64 on 2 mm with a 1 mm margin, so butted panels keep
  // the pitch across the seam (one lattice). A lane is one HUB75 chain:
  // panels daisy-chained by ribbon, input to output. supply: a 5 V 4 A brick
  // per panel, as Waveshare recommends.
  hub:        { label: 'one HUB75 64x64 P2 panel (4096)', panels: [{ panel: 'hub64' }], supply: 4 },
  'hub-x2':   {
    label: 'two HUB75 panels side by side: 128x64, one lattice (8192)', supply: 8,
    panels: [{ panel: 'hub64', x: -64 }, { panel: 'hub64', x: 64 }],
  },
  'hub-tall': {
    label: 'two HUB75 panels stacked: 64x128, one lattice (8192)', supply: 8,
    panels: [{ panel: 'hub64', y: -64 }, { panel: 'hub64', y: 64 }],
  },
  'hub-2x2':  {
    label: 'four HUB75 panels: 128x128, one lattice (16384)', supply: 16,
    panels: [[-64, -64], [64, -64], [-64, 64], [64, 64]].map(([x, y]) => ({ panel: 'hub64', x, y })),
  },
  'hub-x3':   {
    label: 'three HUB75 panels side by side: 192x64 panorama, one lattice (12288)', supply: 12,
    panels: [-128, 0, 128].map((x) => ({ panel: 'hub64', x })),
  },
  'hub-x4':   {
    label: 'four HUB75 panels in a row: 256x64 banner, one lattice (16384)', supply: 16,
    panels: [-192, -64, 64, 192].map((x) => ({ panel: 'hub64', x })),
  },
  'hub-tall3': {
    label: 'three HUB75 panels stacked: 64x192 tower, one lattice (12288)', supply: 12,
    panels: [-128, 0, 128].map((y) => ({ panel: 'hub64', y })),
  },
  // Non-rectangular assemblies: the raster is the bounding box, with -1
  // (no LED) in the missing panels' cells.
  'hub-cross': {
    label: 'five HUB75 panels in a plus: 192x192 cross, one lattice (20480)', supply: 20,
    panels: [[0, -128], [-128, 0], [0, 0], [128, 0], [0, 128]].map(([x, y]) => ({ panel: 'hub64', x, y })),
  },
  'hub-stair': {
    label: 'three HUB75 panels in an L: 128x128 with the top-right missing (12288)', supply: 12,
    panels: [[-64, -64], [-64, 64], [64, 64]].map(([x, y]) => ({ panel: 'hub64', x, y })),
  },
  // Six or more panels on one chain crush the dim end (transition bit 6-7)
  // or refresh under 60 Hz: these run a chain per row, each on its own
  // ESP32-S3 (one HUB75 DMA each), kept in step over Wi-Fi like s3m-x4.
  // check.mjs sums their frame buffers, so its RAM figure is for all rows.
  'hub-2x3':  {
    label: 'six HUB75 panels, 2 wide and 3 tall: 128x192 portrait, one lattice, a chain (and controller, kept in step) per row (24576)', supply: 24,
    panels: [-128, 0, 128].flatMap((y) => [-64, 64].map((x) => ({ panel: 'hub64', x, y, lane: (y + 128) / 128 }))),
  },
  'hub-3x3':  {
    label: 'nine HUB75 panels, 3 by 3: 192x192, one lattice, a chain (and controller, kept in step) per row (36864)', supply: 36,
    panels: [-128, 0, 128].flatMap((y) => [-128, 0, 128].map((x) => ({ panel: 'hub64', x, y, lane: (y + 128) / 128 }))),
  },
  'hub-ring': {
    label: 'eight HUB75 panels round a missing centre: a 192x192 frame, a chain (and controller, kept in step) per row (32768)', supply: 32,
    panels: [-128, 0, 128].flatMap((y) => [-128, 0, 128].filter((x) => x || y).map((x) => ({ panel: 'hub64', x, y, lane: (y + 128) / 128 }))),
  },
  'hub-steps': {
    label: 'three HUB75 panels corner to corner down a diagonal: 192x192 staircase (12288)', supply: 12,
    panels: [-128, 0, 128].map((k) => ({ panel: 'hub64', x: k, y: k })),
  },
  // The ESP32-S3-Matrix is a controller with an 8x8 on it: its 17 header
  // GPIOs carry the 14 HUB75 signals, so one board drives the panel AND
  // shows its own 8x8 beside it, 8 mm off the panel's bottom-right.
  'hub-s3m':  {
    label: 'a HUB75 64x64 driven by an ESP32-S3-Matrix, whose 8x8 sits beside it (4160)', supply: 5,
    panels: [{ panel: 'hub64' }, { panel: 's3m64', x: 64 + 8 + 12.5, y: 64 - 12.5, lane: 1 }],
  },

  // ESP32-S3-Matrix boards: each has its own MCU (so its own lane), and
  // several are kept in step over Wi-Fi (ESP-NOW or NTP), not by wire.
  s3m:        { label: 'one ESP32-S3-Matrix 8x8 (64)', panels: [{ panel: 's3m64' }], supply: 3 },
  's3m-x4':   {
    label: 'four ESP32-S3-Matrix boards butted in a row: one digit each (256)', supply: 12,
    panels: [-1.5, -0.5, 0.5, 1.5].map((k, i) => ({ panel: 's3m64', x: k * 25, lane: i })),
  },
  's3m-2x2':  {
    label: 'four ESP32-S3-Matrix boards butted in a square (256)', supply: 12,
    panels: [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, y], i) => ({ panel: 's3m64', x: x * 12.5, y: y * 12.5, lane: i })),
  },
};
for (const [k, v] of Object.entries(LAYOUTS)) v.key = k;

const built = {};
export function layout(key) {
  if (typeof key === 'object') return buildLayout(key);
  if (!LAYOUTS[key]) throw new Error(`unknown layout '${key}' (have: ${Object.keys(LAYOUTS).join(', ')})`);
  return (built[key] ??= buildLayout(LAYOUTS[key]));
}
