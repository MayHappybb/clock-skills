// Hokusai: a living print after "The Great Wave off Kanagawa". The numerals
// ARE waves: Prussian-blue water rising out of one sea, deep at the foot and
// pale toward the crest, foam riding every upward curve, foam claws at every
// curling lip, spray shed from the claws. The hour is the great wave on the
// left board, the minutes the smaller wave on the right, Fuji sits small in
// the trough between them and two boats of rowers ride the swell. The waves
// lean and recover with the swell as it passes under them.
//
// A crest leaves the hour wave and reaches out over Fuji as the hour builds:
// at :00 it is gone, by :59 it hangs over the whole print, claws down. When
// the hour turns it breaks: a giant wave rolls over the print, the time stays
// written in foam inside it, the changed digits re-form from spray, the sea
// drains and calms and the printer's red seal is stamped again.
//
// Minute turn: the changing digit's crest breaks first, the water is thrown
// up as spray, and the spray falls into the new numeral, filling it from the
// sea upward. The old digit is fully gone before the new one starts.
//
// Stateless: everything is a function of the wall clock; caches are keyed by
// slot, digit, lean phase and minute.
import * as kit from '../js/kit.js';

const PITCH = 3;
const COLX = (c) => -58.5 + PITCH * c, ROWY = (r) => -28.5 + PITCH * r;

// ---------------------------------------------------------------- palette
const DEEP = kit.hex('#0a2c86'), LIGHT = kit.hex('#5a9cf0'), FOAM = kit.hex('#fff0d2');
const SPRAY = kit.hex('#e8f0ff'), INDIGO = kit.hex('#122a78'), SEAL = kit.hex('#e0201a');
const GLOW = kit.hex('#ffc890'), FUJI = kit.hex('#2a3f86'), WATER = kit.hex('#0a2f8a');
const HULL = kit.hex('#d9a05a');

// ---------------------------------------------------------------- glyphs
// Drawn on the hour box: 8 x 17 LED pitches (x right, y down), stroke centre
// lines inset for a 2.3-pitch brush. Paths are Catmull-Rom smoothed; `lip`
// marks a curling terminal (0 = start, 1 = end) that grows foam claws.
// Every open end curls like a wave's lip; the bars are crests.
const ell = (cx, cy, rx, ry, a0, a1, n = 28) => {
  const p = [];
  for (let k = 0; k <= n; k++) { const a = (a0 + (a1 - a0) * k / n) * Math.PI / 180; p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return p;
};
const GLYPHS = {
  0: [{ pts: ell(4, 8.55, 2.85, 7.35, -90, 270, 40), raw: true }],
  1: [{ pts: [[2.0, 3.6], [2.9, 2.0], [4.6, 1.2], [4.8, 6], [4.9, 11], [5.0, 16.4]], lip: [0] }],
  2: [{ pts: [[1.3, 5.0], [1.6, 2.4], [3.8, 1.2], [5.9, 1.8], [6.7, 4.0], [6.1, 7.0], [3.9, 10.4], [1.3, 15.6]], lip: [0] },
      { pts: [[1.3, 15.6], [6.9, 15.6]], line: true }],
  3: [{ pts: [[1.3, 3.8], [2.9, 1.4], [5.3, 1.4], [6.6, 3.7], [5.9, 6.6], [3.4, 8.2]], lip: [0] },
      { pts: [[3.4, 8.2], [6.1, 9.4], [6.8, 12.3], [5.6, 15.2], [3.2, 15.8], [1.3, 13.6]], lip: [1] }],
  4: [{ pts: [[5.4, 1.2], [1.2, 11.4]], line: true }, { pts: [[1.2, 11.4], [6.9, 11.4]], line: true },
      { pts: [[5.4, 1.2], [5.4, 16.4]], line: true }],
  5: [{ pts: [[6.9, 2.7], [6.3, 1.3], [4.5, 1.3], [2.1, 1.3]], lip: [0] }, { pts: [[2.1, 1.3], [1.7, 7.6]], line: true },
      { pts: [[1.7, 7.6], [3.9, 6.6], [6.1, 7.5], [6.9, 10.7], [6.2, 14.2], [3.9, 15.8], [1.3, 14.2]], lip: [1] }],
  6: [{ pts: [[6.4, 2.8], [4.8, 1.2], [2.5, 2.1], [1.3, 5.6], [1.2, 10.6], [2.1, 14.6], [4.1, 15.8], [6.1, 14.9], [6.8, 12.4], [6.1, 9.7], [4.0, 8.8], [1.4, 9.8]], lip: [0] }],
  7: [{ pts: [[1.3, 3.6], [1.5, 1.5], [3.0, 1.3], [6.9, 1.3]], lip: [0] },
      { pts: [[6.9, 1.3], [5.6, 5.4], [4.2, 10.0], [3.5, 16.4]] }],
  8: [{ pts: ell(4, 4.6, 2.55, 3.4, 90, 450, 30), raw: true }, { pts: ell(4, 12.0, 2.85, 3.85, -90, 270, 34), raw: true }],
  9: [{ pts: ell(4, 5.3, 2.85, 4.05, 0, 360, 34), raw: true },
      { pts: [[6.85, 5.3], [6.85, 10.0], [6.1, 14.0], [4.0, 15.8], [2.0, 15.3], [1.3, 13.2]], lip: [1] }],
};

function smooth(pts, n = 6) {
  const out = [];
  const P = (k) => pts[Math.max(0, Math.min(pts.length - 1, k))];
  for (let k = 0; k + 1 < pts.length; k++) {
    const p0 = P(k - 1), p1 = P(k), p2 = P(k + 1), p3 = P(k + 2);
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Segments (mm) of already-smoothed paths: [ax, ay, bx, by, s0, len], and the lips. */
function segsOf(paths) {
  const segs = [], lips = [];
  for (const p of paths) {
    const pts = p.pts;
    let s = 0;
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1], len = Math.hypot(bx - ax, by - ay);
      if (len > 1e-6) segs.push([ax, ay, bx, by, s, len]);
      s += len;
    }
    for (const e of p.lip ?? []) {
      const a = e ? pts[pts.length - 1] : pts[0], b = e ? pts[pts.length - 3] : pts[2];
      const tx = a[0] - b[0], ty = a[1] - b[1], n = Math.hypot(tx, ty) || 1;
      lips.push({ x: a[0], y: a[1], tx: tx / n, ty: ty / n });
    }
  }
  return { segs, lips };
}
/**
 * Per-LED coverage of a stroke set. The brush is heavier at the foot (the
 * water's mass) and thins toward the crest (`taper`). Edges facing `dir`
 * (-1 up, +1 down) carry foam; just outside them a fringe of foam fingers.
 * Cells: { i, a, foam, fringe, s (arc length), yn (0 crest .. 1 foot) }.
 */
const FRINGE = 3.2;
/** Signed distance from (x, y) to the stroke set's edge (constant width). */
function sdist(segs, x, y, hw) {
  let bd = 1e9;
  for (const [ax, ay, bx, by, , len] of segs) {
    const dx = bx - ax, dy = by - ay, t = kit.clamp(((x - ax) * dx + (y - ay) * dy) / (len * len));
    const d = Math.hypot(x - ax - t * dx, y - ay - t * dy);
    if (d < bd) bd = d;
  }
  return bd - hw;
}
function rasterise(ctx, segs, w, bbox, { taper = 0.36, dir = -1, along = null } = {}) {
  const cells = [], reach = w / 2 * (1 + taper / 2) + FRINGE;
  const top = bbox[1], hgt = bbox[3] - bbox[1];
  for (const i of ctx.layout.index.near((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2, Math.hypot(bbox[2] - bbox[0], bbox[3] - bbox[1]) / 2 + reach)) {
    const l = ctx.leds[i];
    let be = 1e9, bs = 0, bny = 0, byn = 0;
    for (const [ax, ay, bx, by, s0, len] of segs) {
      const dx = bx - ax, dy = by - ay;
      const t = kit.clamp(((l.x - ax) * dx + (l.y - ay) * dy) / (len * len));
      const qx = ax + t * dx, qy = ay + t * dy, d = Math.hypot(l.x - qx, l.y - qy);
      const yn = kit.clamp((qy - top) / hgt);
      const hw = along ? kit.lerp(along[0], along[1], kit.clamp((s0 + t * len) / along[2])) / 2 : w / 2 * (1 - taper / 2 + taper * yn);
      if (d - hw < be) { be = d - hw; bs = s0 + t * len; byn = yn; bny = d > 1e-3 ? (l.y - qy) / d : 0; }
    }
    if (be > FRINGE) continue;
    const a = 1 - kit.smoothstep(-1.0, 1.2, be);
    let face = kit.smoothstep(0.3, 0.8, dir * bny);
    // foam belongs on open crests, not on the floor of a counter: look along
    // the facing direction for more water
    if (face > 0) for (let k = 2; k <= 5; k++) if (sdist(segs, l.x, l.y + dir * PITCH * k, w * 0.4) < 0) { face = 0; break; }
    const foam = face * kit.smoothstep(-3.4, -0.8, be);
    const fringe = be > 0.6 ? face * (1 - kit.smoothstep(1.2, FRINGE, be)) : 0;
    if (a < 0.02 && fringe < 0.02) continue;
    cells.push({ i, a, foam, fringe, s: bs, yn: byn });
  }
  return cells;
}

// The four slots: hours big on the left board, minutes smaller on the right,
// all standing in the same sea (their feet at y = 21 mm).
const SLOTS = [
  { x0: COLX(0) - 1.5, y0: ROWY(0) - 1.5, sx: 1, sy: 1, w: 6.9, lean: 3.2 },
  { x0: COLX(9) - 1.5, y0: ROWY(0) - 1.5, sx: 1, sy: 1, w: 6.9, lean: 3.2 },
  { x0: COLX(25) - 1.5, y0: ROWY(4) - 1.5, sx: 7 / 8, sy: 13 / 17, w: 5.6, lean: 2.2 },
  { x0: COLX(33) - 1.5, y0: ROWY(4) - 1.5, sx: 7 / 8, sy: 13 / 17, w: 5.6, lean: 2.2 },
];
const NPH = 9, MID = 4;                       // lean phases, cached; MID is upright

const fields = new Map();
/** A digit in its slot at lean phase ph: cells, lips (mm), solid cells for spray. */
let budget = 0;                               // lean-phase builds allowed this frame (they are slow-ish)
function field(ctx, slot, digit, ph = MID) {
  const key = (slot * 10 + digit) * NPH + ph;
  if (fields.has(key)) return fields.get(key);
  if (ph !== MID) {
    // over budget: stand in with the nearest phase already built, upright at worst
    if (budget <= 0) {
      for (let d = 1; d < NPH; d++) for (const q of [ph - d, ph + d]) { if (q < 0 || q >= NPH) continue; const f = fields.get((slot * 10 + digit) * NPH + q); if (f) return f; }
      return field(ctx, slot, digit, MID);
    }
    budget--;
  }
  const S = SLOTS[slot], lean = S.lean * (ph - MID) / MID;
  const tx = ([x, y]) => [S.x0 + x * PITCH * S.sx + lean * (1 - y / 17) ** 1.5, S.y0 + y * PITCH * S.sy];
  const paths = GLYPHS[digit].map((p) => ({ lip: p.lip, pts: (p.raw || p.line ? p.pts : smooth(p.pts)).map(tx) }));
  const { segs, lips } = segsOf(paths);
  const bbox = [S.x0, S.y0, S.x0 + 8 * PITCH * S.sx, S.y0 + 17 * PITCH * S.sy];
  const cells = rasterise(ctx, segs, S.w, bbox);
  for (const c of cells) { c.x = ctx.leds[c.i].x; c.y = ctx.leds[c.i].y; }
  const f = { cells, lips, solid: cells.filter((c) => c.a > 0.5) };
  fields.set(key, f);
  return f;
}

/** The swell passing under the waves, left to right: lean in -1..1 for a slot. */
const swell = (T, slot) => Math.sin(kit.TAU * T / 6.5 - [0, 0.9, 2.3, 3.0][slot]) * (0.65 + 0.35 * Math.sin(T * 0.31 + slot));
// ------------------------------------------------------------ the break
// The old digit's crest breaks first (top down), its water goes up as spray,
// and the spray falls into the new numeral from the sea upward. Departures
// end before the first arrival, so two numerals never overlap.
const DEP0 = 0.1, DEP1 = 0.85, ARR0 = 1.15, ARR1 = 2.15, FLASH = 0.45;
const TURN_END = ARR1 + 0.15 + FLASH, CALM = 1.4;     // a changing wave stands upright this long either side

const breaks = new Map();
function breakOf(ctx, slot, from, to, key) {
  if (breaks.has(key)) return breaks.get(key);
  const A = field(ctx, slot, from), B = field(ctx, slot, to);
  const jit = (c, k) => kit.hash(c.i, k, slot) - 0.5;
  const src = [...A.solid].sort((p, q) => p.y + 4 * jit(p, 1) - (q.y + 4 * jit(q, 1)));        // top first
  const dst = [...B.solid].sort((p, q) => q.y + 4 * jit(q, 2) - (p.y + 4 * jit(p, 2)));        // bottom first
  const n = Math.max(src.length, dst.length), parts = [];
  for (let k = 0; k < n; k++) {
    const a = src[Math.floor(k * src.length / n)], b = dst[Math.floor(k * dst.length / n)], r = k / Math.max(1, n - 1);
    parts.push({
      ax: a.x, ay: a.y, bx: b.x, by: b.y, bi: b.i,
      dep: DEP0 + (DEP1 - DEP0) * r + 0.05 * kit.hash(k, 3, slot),
      arr: ARR0 + (ARR1 - ARR0) * r + 0.05 * kit.hash(k, 4, slot),
      cy: Math.max(-36, Math.min(a.y, b.y) - 8 - 14 * kit.hash(k, 5, slot)), cx: (a.x + b.x) / 2 + 2 + 9 * (kit.hash(k, 6, slot) - 0.3),
    });
  }
  // every cell takes its timing from the nearest particle's end
  const near = (c, e) => {
    let best = null, bd = 1e9;
    for (const p of parts) { const d = (p[e + 'x'] - c.x) ** 2 + (p[e + 'y'] - c.y) ** 2; if (d < bd) { bd = d; best = p; } }
    return best;
  };
  const depOf = new Map(A.cells.map((c) => [c.i, near(c, 'a').dep]));
  const arrOf = new Map(B.cells.map((c) => [c.i, Math.max(near(c, 'b').arr, ...parts.filter((p) => p.bi === c.i).map((p) => p.arr))]));
  const b = { parts, depOf, arrOf, A, B };
  if (breaks.size > 16) breaks.delete(breaks.keys().next().value);
  breaks.set(key, b);
  return b;
}

// ------------------------------------------------------- the great wave
/** Seconds from the hour turn, about -3.5 .. 6, or null away from it. */
function hourPhase(d) {
  const m = d.getMinutes(), s = kit.secOf(d);
  if (m === 59 && s >= 56) return s - 60;
  if (m === 0 && s < 6.5) return s;
  return null;
}
const SWEEP0 = -3.7, SWEEP = 3.1, DRAIN0 = 2.4, DRAIN = 1.8, STAMP0 = 4.4;

/** Water cover (0..1) and its foam edge at (x, y), hu seconds from the hour. */
function cover(x, y, hu) {
  const p = kit.clamp((hu - SWEEP0) / SWEEP), e = kit.ease.inOut(p);
  const xf = kit.lerp(-100, 82, e);
  const k = kit.clamp((28.5 - y) / 57);
  // the top leads and curls over; along the top third, foam fingers reach ahead
  const claw = kit.smoothstep(0.45, 0.85, kit.noise2(y * 0.55, hu * 2.5)) * kit.smoothstep(0.55, 0.9, k);
  const front = xf + 34 * k ** 2.2 + 1.5 * Math.sin(y * 0.5 + hu * 7) + 7 * claw;
  let w = kit.smoothstep(-2, 2, front - x);
  const band = 2.4 + 5 * k;                                                     // foam thickens toward the lip
  let edge = p < 1 ? Math.exp(-((((front - x) - band * 0.6) / band) ** 2)) * (0.6 + 0.4 * k) : 0;
  const q = kit.clamp((hu - DRAIN0) / DRAIN);
  if (q > 0) {
    const level = kit.lerp(-38, 30, kit.ease.inOut(q)) + 3 * Math.sin(0.13 * x + 6 * hu) * Math.sin(Math.PI * q);
    w *= kit.smoothstep(level - 2, level + 2, y) * (1 - kit.smoothstep(0.85, 1, q));
    edge = Math.max(edge * (1 - q), q < 1 ? Math.exp(-(((y - level) / 2.4) ** 2)) * (1 - q) : 0);
  }
  return [w, edge];
}
// ---------------------------------------------------------------- scenery
const FUJI_X = COLX(20.5), FUJI_Y = ROWY(10) - 0.5, FUJI_H = 21, FUJI_W = 11;
const fujiY = (x) => FUJI_Y + FUJI_H * Math.min(1.5, Math.abs(x - FUJI_X) / FUJI_W) ** 0.62;   // concave flanks
const SEA = 21.5;
const seaY = (x, t) => SEA + 1.3 * Math.sin(0.19 * x - kit.TAU * t / 6.5) + 0.6 * Math.sin(0.47 * x + 1.3 * t);

function scenery(ctx, t, dim) {
  for (const l of ctx.leds) {
    const { x, y, i } = l;
    // a warm dawn just behind Fuji: paper showing through at the horizon
    let c = kit.scale(GLOW, 0.045 * Math.exp(-(((x - FUJI_X) / 10) ** 2) - (((y - 17) / 7) ** 2)));
    // Fuji, small in the trough, snow streaking down from the cap
    const fy = fujiY(x);
    if (y > fy - 1.5 && y < SEA + 3) {
      const inside = kit.smoothstep(fy - 1.6, fy + 1.4, y);
      const streak = kit.noise2(x * 0.7, 3.1) * 5;
      const snow = 1 - kit.smoothstep(FUJI_Y + 3 + streak, FUJI_Y + 6.5 + streak, y);
      c = kit.mix(c, kit.mix(kit.scale(FUJI, 1.5), kit.scale(FOAM, 0.75), snow), inside);
    }
    // the sea every wave rises from
    const sy = seaY(x, t);
    if (y > sy - 2.5) {
      const body = kit.smoothstep(sy - 1.5, sy + 1, y);
      const crest = Math.exp(-(((y - sy) / 1.5) ** 2)) * kit.smoothstep(0.4, 0.8, kit.noise2(x * 0.2 - t * 0.8, 7));
      c = kit.mix(c, kit.mix(kit.scale(DEEP, 0.75), kit.scale(INDIGO, 0.5), kit.clamp((y - sy) / 7)), body);
      c = kit.mix(c, kit.scale(FOAM, 0.4), crest);
    }
    kit.set(ctx, i, c, dim);
  }
}

/** An oshiokuri-bune in the trough under the crest, rowers bending to the oars. */
function boats(ctx, t, dim) {
  const x = FUJI_X + 0.5 + 4 * Math.sin(t * 0.07);
  const y = seaY(x, t) - 0.4, slope = (seaY(x + 2, t) - seaY(x - 2, t)) / 4;
  const ang = Math.atan(slope), ca = Math.cos(ang), sa = Math.sin(ang);
  const P = (u, v) => [x + u * ca - v * sa, y + u * sa + v * ca];          // boat frame: u along, v down
  for (let u = -7; u <= 7; u += 1.75) {
    const [px, py] = P(u, -0.05 * u * u + 0.6);                             // the hull's sheer: bow and stern high
    kit.splat(ctx, px, py, 1.9, HULL, 0.3 * dim);
  }
  for (let r = -1; r <= 1; r++) {                                           // the crew, rowing in time
    const [px, py] = P(r * 3.8 + 0.8 * Math.sin(t * 2.6), -2.6 + 0.5 * Math.cos(t * 2.6));
    kit.splat(ctx, px, py, 1.6, FOAM, 0.3 * dim);
  }
}

/**
 * The crest of the great wave, building all hour: in the first half it
 * reaches out from the hour over Fuji, in the second its lip curls down
 * toward the peak, claws first, the way Hokusai framed the mountain. It
 * breaks at the hour.
 */
function crestShape(t, P) {
  const reach = kit.ease.inOut(kit.smoothstep(0, 0.55, P)), curl = kit.smoothstep(0.12, 1, P);
  const x0 = COLX(16) - 1, xt = kit.lerp(x0 + 4, FUJI_X + 2, reach);
  const A = xt - x0;
  if (A < 4.5) return null;
  const sw = 1.1 * Math.sin(t * 1.3), y0 = -28 + 0.5 * Math.sin(t * 0.9);
  const D = kit.lerp(3, 16, curl) + 0.8 * Math.sin(t * 1.1 + 1), h = kit.smoothstep(4.5, 12, A);
  const pts = [[x0 - 3, y0 + 3.5], [x0 + A * 0.45, y0], [xt + 1.5 * h, y0 + 1.0 + D * 0.06],
    [xt + (3.4 + 1.2 * curl) * h + sw * 0.5, y0 + (3.2 + 0.25 * D) * h]];
  const sm = smooth(pts, 4);
  const { segs } = segsOf([{ pts: sm }]);
  const total = segs.reduce((m, g) => Math.max(m, g[4] + g[5]), 0);
  // claws hang from the lip's underside, longer as the hour builds; each
  // finger reaches forward and hooks back at its end
  const claws = [];
  for (let j = 0; j < 6; j++) {
    const k = Math.min(sm.length - 1, Math.floor(sm.length * (0.5 + 0.5 * j / 5)));
    const len = (2.5 + D * 0.6) * (0.55 + 0.45 * kit.hash(j, 9)) * h * (j === 5 ? 1.15 : 1);
    claws.push({ x: sm[k][0] + 0.8, y: sm[k][1] + 2.2, len, ph: j * 1.7 });
  }
  const e = sm[sm.length - 1];
  return { segs, total, claws, w: [3.4, 6.2 + 1.4 * curl], bbox: [x0 - 5, -31, xt + 10, y0 + 14], a: kit.smoothstep(4.5, 9, A),
    tip: h > 0.3 ? { x: e[0], y: e[1], tx: 0.5, ty: 0.86, s: 0.8 + 0.4 * curl } : null };
}

/** The printer's red seal, top right; washed off by the great wave and re-stamped. */
function seal(ctx, hu, dim, W) {
  let a = 1, sc = 1, flash = 0;
  if (hu !== null && hu > SWEEP0 + 1.8 && hu < STAMP0) a = 0;
  if (hu !== null && hu >= STAMP0) {
    const e = kit.clamp((hu - STAMP0) / 0.45);
    a = kit.smoothstep(0, 0.5, e); sc = 1 + 1.6 * (1 - kit.ease.in(e));
    flash = e >= 1 ? Math.exp(-(hu - STAMP0 - 0.45) / 0.25) : 0;
  }
  if (a <= 0) return;
  const cx = COLX(38), cy = ROWY(1), hx = 4.4 * sc, hy = 4.4 * sc;
  for (const i of ctx.layout.index.near(cx, cy, Math.hypot(hx, hy) + 2)) {
    const l = ctx.leds[i];
    const dx = Math.abs(l.x - cx) - hx, dy = Math.abs(l.y - cy) - hy;
    const inside = 1 - kit.smoothstep(-1.2, 1.0, Math.max(dx, dy));
    if (inside <= 0) continue;
    const mark = Math.abs(l.x - cx) < 1 && Math.abs(l.y - cy) < 1 ? 1 : 0;   // the carved character
    const col = kit.mix(kit.scale(SEAL, 0.75), kit.scale(FOAM, 0.3), mark);
    kit.over(ctx, i, kit.scale(kit.mix(col, FOAM, 0.5 * flash), dim), inside * a * (1 - W[i]) / (sc * sc));
  }
}
// ----------------------------------------------------------------- water
// Waves are accumulated (two lean phases blend into one sub-LED lean), then
// painted once: deep at the foot, pale toward the crest, bands of light
// running along the stroke, foam on the crest, fingers reaching off it.
let ACC = null;
function accReset(n) {
  if (!ACC || ACC.n !== n) ACC = { n, a: new Float32Array(n), f: new Float32Array(n), s: new Float32Array(n), y: new Float32Array(n), r: new Float32Array(n), h: new Float32Array(n), on: new Uint8Array(n), list: [] };
  for (const i of ACC.list) { ACC.a[i] = ACC.f[i] = ACC.s[i] = ACC.y[i] = ACC.r[i] = ACC.h[i] = 0; ACC.on[i] = 0; }
  ACC.list.length = 0;
}
function accumulate(cells, g, mask) {
  const A = ACC;
  for (const c of cells) {
    let m = g, fl = 0;
    if (mask) { const r = mask(c); m *= r[0]; fl = r[1]; }
    if (m <= 0) continue;
    const i = c.i, wa = c.a * m;
    if (!A.on[i]) { A.on[i] = 1; A.list.push(i); }
    A.a[i] += wa; A.f[i] += c.foam * wa; A.s[i] += c.s * wa; A.y[i] += c.yn * wa; A.r[i] += c.fringe * m; A.h[i] += fl * wa;
  }
}
function paint(ctx, T, dim, W) {
  const A = ACC;
  for (const i of A.list) {
    const l = ctx.leds[i], wa = A.a[i];
    if (wa > 0.01) {
      const inv = 1 / wa, s = A.s[i] * inv, yn = A.y[i] * inv;
      const stripe = 0.5 + 0.5 * Math.sin(kit.TAU * (s / 14 - T * 0.45));
      let col = kit.mix(DEEP, LIGHT, 0.06 + 0.66 * (1 - yn) ** 1.3 * (0.55 + 0.45 * stripe));
      col = kit.mix(col, FOAM, A.f[i] * inv * (0.45 + 0.55 * kit.noise2(l.x * 0.09 - T * 1.2, l.y * 0.12)));
      if (W[i] > 0) col = kit.mix(col, kit.scale(FOAM, 0.8), 0.92 * W[i]);
      const fl = A.h[i] * inv;
      if (fl > 0) col = kit.mix(col, FOAM, kit.clamp(fl));
      kit.over(ctx, i, kit.scale(col, 0.9 * dim), Math.min(1, wa));
    }
    if (A.r[i] > 0.02) {
      const finger = kit.smoothstep(0.42, 0.78, kit.noise2(l.x * 0.33 - T * 1.1, l.y * 0.25));
      kit.add(ctx, i, FOAM, Math.min(1, A.r[i]) * finger * 0.55 * dim * (1 - 0.7 * W[i]));
    }
  }
}

/** Foam claws at a curling lip, and the spray they shed. */
function claws(ctx, lip, s, T, dim, a, seed) {
  if (a <= 0.01) return;
  const th = Math.atan2(lip.ty, lip.tx);
  for (let k = -1; k <= 1; k++) {
    const flex = 0.28 * Math.sin(T * 2.3 + k * 1.9 + seed);
    const a1 = th + k * 0.8 + flex, a2 = a1 + 0.65;                      // fingers hook as they reach
    const x1 = lip.x + Math.cos(a1) * 2.4 * s, y1 = lip.y + Math.sin(a1) * 2.4 * s;
    kit.splat(ctx, x1, y1, 2.1, FOAM, 0.45 * a * dim);
    kit.splat(ctx, x1 + Math.cos(a2) * 2.4 * s, y1 + Math.sin(a2) * 2.4 * s, 1.9, FOAM, 0.28 * a * dim);
  }
  for (let j = 0; j < 2; j++) {
    const per = 1.7, tau = kit.fract((T + kit.hash(seed * 7 | 0, j) * per) / per) * per;
    if (tau > 1.1) continue;
    const r = (3 + 10 * tau) * s;
    const x = lip.x + lip.tx * r + 5 * tau, y = lip.y + lip.ty * r - 8 * tau + 26 * tau * tau;
    kit.splat(ctx, x, y, 1.8, SPRAY, 0.4 * (1 - tau / 1.1) * a * dim);
  }
}
/** A claw of foam hanging from the crest: a chain of soft dots, reaching and hooking back. */
function hanging(ctx, c, T, a) {
  if (a <= 0.01 || c.len < 1) return;
  const n = Math.max(2, Math.ceil(c.len / 2.2));
  for (let k = 0; k <= n; k++) {
    const u = k / n, th = 1.05 + 1.0 * u * u + 0.18 * Math.sin(T * 2.1 + c.ph);   // down-forward, curling back
    const x = c.x + c.len * u * Math.cos(th) + 1.2 * u * u * Math.sin(T * 1.6 + c.ph), y = c.y + c.len * u * Math.sin(th);
    kit.splat(ctx, x, y, 2.0 - 0.5 * u, FOAM, a * (0.5 - 0.25 * u));
  }
}
const lerpLip = (p, q, f) => ({ x: kit.lerp(p.x, q.x, f), y: kit.lerp(p.y, q.y, f), tx: kit.lerp(p.tx, q.tx, f), ty: kit.lerp(p.ty, q.ty, f) });

const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => (pad(d.getHours()) + pad(d.getMinutes())).split('').map(Number);
let WBUF = null, EBUF = null;
const wAt = (ctx, W, p) => { const i = kit.at(ctx, p.x, p.y); return i >= 0 ? W[i] : 0; };
export default {
  name: 'Hokusai',
  blurb: 'the numerals are Prussian-blue waves with foam claws; a crest builds over Fuji all hour and breaks at the turn',
  layouts: ['sq-x2'], look: { look: 'opal', gap: 0.8 }, fps: 60, brightness: 0.6, dither: true,
  frame(ctx) {
    const { leds, n, date } = ctx;
    const now = date.getTime() / 1000, T = now % 86400;
    const M = Math.floor(now / 60) * 60, age = now - M;
    const dim = 1 - 0.72 * ctx.night;
    const hu = hourPhase(date);
    if (!WBUF || WBUF.length !== n) { WBUF = new Float32Array(n); EBUF = new Float32Array(n); }
    const W = WBUF, E = EBUF;
    W.fill(0); E.fill(0);

    scenery(ctx, T, dim);
    boats(ctx, T, dim);

    // the great wave: water over everything, the time stays written in foam
    if (hu !== null) {
      for (const l of leds) {
        const [w, e] = cover(l.x, l.y, hu);
        W[l.i] = w; E[l.i] = e;
        if (w <= 0) continue;
        const lines = 0.5 + 0.5 * Math.sin(kit.TAU * ((l.x * 0.55 + l.y) / 10 - hu * 0.9));
        const tex = kit.noise2(l.x * 0.12 + hu * 2, l.y * 0.12);
        kit.over(ctx, l.i, kit.scale(kit.mix(WATER, LIGHT, 0.08 + 0.55 * lines * tex), 0.62 * dim), w);
      }
    }
    seal(ctx, hu, dim, W);

    // the waves
    accReset(n);
    budget = 1;
    const cr = crestShape(T, (date.getMinutes() + kit.secOf(date) / 60) / 60);
    if (cr) accumulate(rasterise(ctx, cr.segs, 5.4, cr.bbox, { dir: 1, along: [...cr.w, cr.total] }), cr.a,
      (c) => [1 - W[c.i], 0.2 + 0.55 * kit.smoothstep(0.55, 1, c.s / cr.total)]);   // the lip is all foam

    const prev = digitsOf(new Date((M - 60) * 1000)), cur = digitsOf(date), next = digitsOf(new Date((M + 60) * 1000));
    const sprays = [], lips = [];
    for (let s = 0; s < 4; s++) {
      if (prev[s] !== cur[s] && age < TURN_END) {
        const B = breakOf(ctx, s, prev[s], cur[s], M * 4 + s);
        accumulate(B.A.cells, 1, (c) => {
          const dep = B.depOf.get(c.i);
          return [1 - kit.smoothstep(dep, dep + 0.18, age), 0.6 * kit.smoothstep(dep - 0.3, dep, age)];
        });
        accumulate(B.B.cells, 1, (c) => {
          const arr = B.arrOf.get(c.i);
          return [kit.smoothstep(arr - 0.1, arr + 0.05, age), age > arr ? Math.exp(-(age - arr) / FLASH) : 1];
        });
        const oldA = 1 - kit.smoothstep(DEP0, DEP0 + 0.3, age), newA = kit.smoothstep(ARR1, TURN_END, age);
        B.A.lips.forEach((lp, k) => lips.push([lp, s, oldA, k]));
        B.B.lips.forEach((lp, k) => lips.push([lp, s, newA, k]));
        sprays.push(B);
        continue;
      }
      // the swell leans the wave; a wave about to change (or just changed) stands calm
      let amp = 1;
      if (prev[s] !== cur[s]) amp *= kit.smoothstep(TURN_END, TURN_END + CALM, age);
      if (next[s] !== cur[s]) amp *= 1 - kit.smoothstep(60 - CALM, 60, age);
      const u = (swell(T, s) * amp + 1) / 2 * (NPH - 1), k0 = Math.min(NPH - 2, Math.floor(u)), f = u - k0;
      const F0 = field(ctx, s, cur[s], k0), F1 = field(ctx, s, cur[s], k0 + 1);
      accumulate(F0.cells, 1 - f); accumulate(F1.cells, f);
      F0.lips.forEach((lp, k) => lips.push([lerpLip(lp, F1.lips[k], f), s, 1, k]));
    }
    paint(ctx, T, dim, W);

    for (const [lp, s, a, k] of lips) claws(ctx, lp, SLOTS[s].sx, T, dim, a * (1 - 0.6 * wAt(ctx, W, lp)), s * 3 + k);
    if (cr?.tip) claws(ctx, cr.tip, cr.tip.s, T, dim, cr.a * (1 - wAt(ctx, W, cr.tip)), 41);
    if (cr) for (const c of cr.claws) hanging(ctx, c, T, dim * cr.a * (1 - wAt(ctx, W, c)));

    // spray in flight
    for (const B of sprays) {
      for (const p of B.parts) {
        if (age < p.dep || age > p.arr) continue;
        // thrown up into the wind, then raining down into the new numeral
        const u = (age - p.dep) / (p.arr - p.dep), e = kit.ease.inOut(u), up = Math.sin(Math.PI * u);
        const k0 = (1 - e) * (1 - e), k1 = 2 * (1 - e) * e, k2 = e * e;
        const x = k0 * p.ax + k1 * p.cx + k2 * p.bx, y = k0 * p.ay + k1 * p.cy + k2 * p.by;
        kit.splat(ctx, x, y, 2.0, SPRAY, 0.24 * dim * (1 - 0.55 * up));
      }
    }

    // the great wave's foaming front and draining surface
    if (hu !== null) {
      for (const l of leds) {
        if (E[l.i] <= 0.01) continue;
        const claw = kit.smoothstep(0.3, 0.8, kit.noise2(l.y * 0.35 + hu * 3, l.x * 0.2));
        kit.add(ctx, l.i, FOAM, E[l.i] * (0.25 + 0.45 * claw) * dim);
      }
    }
  },
};
