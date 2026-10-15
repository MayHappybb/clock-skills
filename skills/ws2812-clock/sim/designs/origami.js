// Origami: the triangle is one sheet of two-sided kami, indigo on the face
// and vermilion on the back. The hour is creased into the face and the
// minutes into the back, as raised pleats that run along the lattice's own
// lines. A triangle is mirror-symmetric about its long axis, so the sheet
// can turn over in place without changing its outline, and it does, every
// five seconds: it tilts in 3D, goes edge-on, catches the lamp and lands
// showing its other side. An origami frog lives in the lower corner and
// hops straight up each time, so the paper turns under it.
//
// Minute turn: the frog leaps onto the minutes, the old pleats spring flat
// in a ripple from where it lands, and it hops along the new numeral,
// creasing it in behind it. Hour: the sheet tumbles over its three mirror
// axes in turn (four flips; the hour changes while it is edge-on), the
// frog somersaulting above it, and lands face up with the new hour.
//
// Stateless: every frame is a closed-form function of the wall clock.
import * as kit from '../js/kit.js';

const DX = 2 * Math.sqrt(3);                                  // column step, mm
const G = [24.249 / 3, 0];                                    // centroid: every mirror axis runs through it

// ------------------------------------------------------------ the sheet
const TRI = [[-24.249, 0], [24.249, -28], [24.249, 28]];
const EDGES = TRI.map((a, k) => {
  const b = TRI[(k + 1) % 3], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  let nx = dy / L, ny = -dx / L;
  if (nx * (G[0] - a[0]) + ny * (G[1] - a[1]) > 0) { nx = -nx; ny = -ny; }
  return { a, nx, ny };
});
/** Distance outside the paper (negative inside), mm, in the sheet's own frame. */
function outside(x, y) {
  let m = -1e9;
  for (const e of EDGES) m = Math.max(m, (x - e.a[0]) * e.nx + (y - e.a[1]) * e.ny);
  return m - 1.8;
}

// ------------------------------------------------------------- numerals
// Lattice units: c = one column (3.46 mm), k = one half-row (2 mm); a glyph
// is 5 columns by 9 half-rows. Strokes run along the lattice's straight
// lines (vertical, and 30 degrees: one column across, one half-row down),
// so every crease lands on a chain of LEDs. Two columns apart at the same
// height is the lattice's "horizontal": it renders as a shallow zigzag.
const GLYPH = {
  0: [[[0, 2], [2, 0], [4, 2], [4, 6], [2, 8], [0, 6], [0, 2]]],
  1: [[[0, 2], [2, 0], [2, 8]]],
  2: [[[0, 2], [2, 0], [4, 2], [0, 6], [0, 8], [4, 8]]],
  3: [[[0, 2], [2, 0], [4, 2], [2, 4], [4, 6], [2, 8], [0, 6]]],
  4: [[[0, 0], [0, 4], [4, 4]], [[4, 0], [4, 8]]],
  5: [[[4, 0], [0, 0], [0, 4], [2, 4], [4, 6], [2, 8], [0, 6]]],
  6: [[[3, 1], [2, 0], [0, 2], [0, 6], [2, 8], [4, 6], [2, 4], [0, 6]]],
  7: [[[0, 0], [4, 0], [4, 2], [2, 4], [2, 8]]],
  8: [[[2, 0], [4, 2], [2, 4], [0, 6], [2, 8], [4, 6], [2, 4], [0, 2], [2, 0]]],
  9: [[[4, 2], [2, 4], [0, 2], [2, 0], [4, 2], [4, 6], [2, 8], [1, 7]]],
};
const SLOT_C = [-3, 3];                                        // each slot's column 0
const LIFT = 7;                                                // mm of hop between strokes

/** A digit's creases in mm (sheet-upright frame), with arc length: [ax, ay, bx, by, s0, len, ux, uy]. */
const segCache = new Map();
function glyphSegs(d, slot) {
  const key = d + '/' + slot;
  if (segCache.has(key)) return segCache.get(key);
  const out = [];
  let s0 = 0;
  for (const path of GLYPH[d]) {
    for (let j = 0; j + 1 < path.length; j++) {
      const [c1, k1] = path[j], [c2, k2] = path[j + 1];
      const ax = (SLOT_C[slot] + c1) * DX, ay = (k1 - 4) * 2, bx = (SLOT_C[slot] + c2) * DX, by = (k2 - 4) * 2;
      const len = Math.hypot(bx - ax, by - ay);
      out.push([ax, ay, bx, by, s0, len, (bx - ax) / len, (by - ay) / len]);
      s0 += len;
    }
    s0 += LIFT;
  }
  out.total = s0 - LIFT;
  segCache.set(key, out);
  return out;
}

/** Point and direction at arc length s along a digit (between strokes: the hop). */
function pointAt(segs, s) {
  for (let j = 0; j < segs.length; j++) {
    const g = segs[j];
    if (s < g[4]) {                                            // in a lift: glide from the last end
      const p = segs[j - 1], t = kit.clamp((s - p[4] - p[5]) / (g[4] - p[4] - p[5]));
      return [kit.lerp(p[2], g[0], t), kit.lerp(p[3], g[1], t), Math.sin(Math.PI * t)];
    }
    if (s <= g[4] + g[5]) { const t = (s - g[4]) / g[5]; return [g[0] + t * (g[2] - g[0]), g[1] + t * (g[3] - g[1]), 0]; }
  }
  const g = segs[segs.length - 1];
  return [g[2], g[3], 0];
}

/**
 * The pleat a digit raises at (x, y): [height 0..1, stroke ux, uy, glint].
 * Only the first `upto` mm are creased; the crease front is soft and the
 * freshly creased paper just behind it glints.
 */
function pleat(segs, x, y, upto = Infinity) {
  let best = 0, ux = 0, uy = 1, gl = 0, dm = 1e9, ox = 0, oy = 0;
  for (const g of segs) {
    if (g[4] > upto) break;
    const dx = g[2] - g[0], dy = g[3] - g[1];
    const t = kit.clamp(((x - g[0]) * dx + (y - g[1]) * dy) / (g[5] * g[5]));
    const d = Math.hypot(x - g[0] - t * dx, y - g[1] - t * dy);
    if (d < dm && g[4] + t * g[5] <= upto) { dm = d; ox = x - g[0] - t * dx; oy = y - g[1] - t * dy; }
    let v = kit.smoothstep(3.1, 1.3, d);
    if (v <= 0) continue;
    const s = g[4] + t * g[5];
    if (s > upto) v *= kit.smoothstep(upto + 3, upto, s);
    if (v > best) { best = v; ux = g[6]; uy = g[7]; gl = upto < 1e6 ? Math.exp(-Math.max(0, upto - s) / 7) : 0; }
  }
  return [best, ux, uy, gl, dm, ox, oy];
}
// ------------------------------------------------------------- schedule
// Minutes up at :00. The sheet turns at 4, 9, 14 ... 59 s (0.8 s each), so it
// is minutes-up again at 59.8 s, just as the frog lands on them at :00.
//
// On the hour the turn at 59 s becomes the tumble: four flips, about the
// triangle's mirror axes at -60, 0, +60 and 0 degrees, from 59.25 s. The
// second flip is edge-on at :00 exactly, so the hour changes unseen; the old
// minutes spring flat while their face is down. Reflections compose as
// R(d) R(c) R(b) R(a) = Rot(2(d - c + b - a)) = identity here: it lands
// hours-up and upright, showing the new hour. The frog creases the new
// minutes after the turn at 4 s; the turn at 9 s is skipped to keep the
// minute's parity (it must end minutes-up).
const TURN0 = 4, PERIOD = 5, TURN = 0.8;
const TUMBLE = [-Math.PI / 3, 0, Math.PI / 3, 0], FLIP = 0.5, TUMBLE_AT = 59.25;
const TUMBLE_END = TUMBLE_AT + TUMBLE.length * FLIP - 60;   // 1.25 s into the hour
const REF = (a) => [Math.cos(2 * a), Math.sin(2 * a), Math.sin(2 * a), -Math.cos(2 * a)];
const mul = (A, B) => [A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3], A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3]];
const ID = [1, 0, 0, 1], MY = REF(0);

/** Start times of the ordinary turns in a minute. */
const TURNS = { plain: [], hourly: [], eve: [] };
for (let t = TURN0; t < 60; t += PERIOD) {
  TURNS.plain.push(t);
  if (t !== 9) TURNS.hourly.push(t);
  if (t !== 59) TURNS.eve.push(t);
}
const kind = (hourly, eve) => (hourly ? 'hourly' : eve ? 'eve' : 'plain');

/**
 * The sheet at second s of the minute: flat transform A (sheet -> world,
 * about G) and the flip under way. `eve`: minute 59; `hourly`: minute 0.
 */
function sheet(s, hourly, eve) {
  const u = eve && s >= TUMBLE_AT ? s - TUMBLE_AT : hourly && s < TUMBLE_END ? s + 60 - TUMBLE_AT : -1;
  if (u >= 0) {
    const j = Math.min(TUMBLE.length - 1, Math.floor(u / FLIP));
    let A = ID;
    for (let q = 0; q < j; q++) A = mul(REF(TUMBLE[q]), A);
    return { A, flip: { a: TUMBLE[j], th: Math.PI * kit.ease.inOut(kit.clamp(u / FLIP - j)) } };
  }
  let A = hourly ? ID : MY;
  for (const t of TURNS[kind(hourly, eve)]) {
    if (s < t) break;
    if (s < t + TURN) return { A, flip: { a: 0, th: Math.PI * kit.ease.inOut((s - t) / TURN) } };
    A = A === ID ? MY : ID;
  }
  return { A, flip: null };
}

// ----------------------------------------------------------------- frog
const HOME = [18.25, 16], FACING = Math.PI,          // facing left, eyes on two LEDs of column 4
      V = 62, SETTLE = 0.42, HOP = 0.3, BACK = 0.55;
const LEAP = 1.1;                                              // the leap that rides a turn onto the minutes
const SOM_AT = 59.1, SOM = 2.35;                               // the somersault over the tumble, in place
const pad = (n) => String(n).padStart(2, '0');

/** What the frog does in a minute: leap, flatten, crease each changed digit, hop home. */
const plans = new Map();
function plan(M) {
  if (plans.has(M)) return plans.get(M);
  const a = pad(new Date((M - 60) * 1000).getMinutes()), b = pad(new Date(M * 1000).getMinutes());
  const hourly = b === '00', landAt = hourly ? TURN0 + TURN + 0.2 : 0;
  const legs = [];
  let t = landAt + SETTLE;
  for (const slot of [0, 1]) {
    if (a[slot] === b[slot]) continue;
    const segs = glyphSegs(b[slot], slot);
    if (legs.length) t += HOP;
    legs.push({ slot, segs, old: glyphSegs(a[slot], slot), t0: t, t1: t + segs.total / V });
    t = legs[legs.length - 1].t1;
  }
  const p0 = pointAt(legs[0].segs, 0);
  const P = { legs, land: [p0[0], p0[1]], landAt, end: t, home: t + BACK, old: a, now: b };
  if (plans.size > 4) plans.delete(plans.keys().next().value);
  plans.set(M, P);
  return P;
}

const arc = (u, h) => h * 4 * u * (1 - u);
/**
 * Where the frog is at second s: [x, y, z (mm above the paper), roll]. Its
 * leap starts with a turn: the paper turns under the frog in flight and it
 * lands on the minutes as they come up (at :00, or at 5 s on the hour).
 */
function frogPos(s, P, Pn, hourly, eve) {
  const som = eve && s >= SOM_AT ? s - SOM_AT : hourly && s < SOM_AT + SOM - 60 ? s + 60 - SOM_AT : -1;
  if (som >= 0) { const u = som / SOM; return [HOME[0], HOME[1], arc(u, 24), kit.TAU * 2 * kit.ease.inOut(u)]; }
  if (!eve && s >= 60 - LEAP) {
    const u = kit.clamp((s - 60 + LEAP) / LEAP);
    return [kit.lerp(HOME[0], Pn.land[0], u), kit.lerp(HOME[1], Pn.land[1], u), arc(u, 16), 0];
  }
  if (hourly && s < P.landAt) {
    if (s < P.landAt - LEAP) return [HOME[0], HOME[1], 0, 0];
    const u = (s - P.landAt + LEAP) / LEAP;
    return [kit.lerp(HOME[0], P.land[0], u), kit.lerp(HOME[1], P.land[1], u), arc(u, 16), 0];
  }
  if (s < P.legs[0].t0) return [P.land[0], P.land[1], 0, 0];
  for (let j = 0; j < P.legs.length; j++) {
    const g = P.legs[j];
    if (s < g.t0) {                                             // hop to the next digit
      const e = pointAt(P.legs[j - 1].segs, 1e9), b = pointAt(g.segs, 0), u = 1 - (g.t0 - s) / HOP;
      return [kit.lerp(e[0], b[0], u), kit.lerp(e[1], b[1], u), arc(u, 6), 0];
    }
    if (s <= g.t1) {
      const d = (s - g.t0) * V, [x, y, lift] = pointAt(g.segs, d);
      return [x, y, 1.5 * Math.abs(Math.sin(Math.PI * d / 6)) + 5 * lift, 0];
    }
  }
  if (s < P.home) {
    const e = pointAt(P.legs[P.legs.length - 1].segs, 1e9), u = (s - P.end) / BACK;
    return [kit.lerp(e[0], HOME[0], u), kit.lerp(e[1], HOME[1], u), arc(u, 10), 0];
  }
  // at home: it hops while the paper turns under it
  for (const t of TURNS[kind(hourly, eve)]) {
    const q = s - t + 0.1;
    if (q >= 0 && q < TURN + 0.2) return [HOME[0], HOME[1], arc(q / (TURN + 0.2), 9), 0];
  }
  return [HOME[0], HOME[1], 0, 0];
}

/** Crouch before take-off and squash on landing: 1 = relaxed. */
function squash(s, P, hourly, eve) {
  let k = 1;
  const dip = (t0, depth) => { const d = s - t0; if (d > -0.3 && d < 0.25) k = Math.min(k, 1 - depth * Math.exp(-(((d + (d < 0 ? 0.02 : 0)) / 0.12) ** 2))); };
  for (const t of [P.end, P.home, ...P.legs.slice(1).map((g) => g.t0 - HOP)]) dip(t, 0.15);
  if (eve) dip(SOM_AT, 0.5); else dip(60 - LEAP, 0.3);
  if (hourly) { dip(SOM_AT + SOM - 60, 0.5); dip(P.landAt - LEAP, 0.3); }
  dip(P.landAt, 0.4);
  for (const t of TURNS[kind(hourly, eve)]) if (s > P.home) { dip(t - 0.1, 0.25); dip(t + TURN + 0.1, 0.2); }
  return k;
}
// ---------------------------------------------------------------- light
// A lamp circles the sheet once a minute, low and close, like a second hand
// of light: each pleat flares as the lamp comes round to face it.
let LAMP = [0, 0, 0];
function placeLamp(sec) {
  const a = kit.TAU * sec / 60;
  LAMP = [G[0] + 50 * Math.sin(a), G[1] - 50 * Math.cos(a), 30];
}
function lamp(x, y, nx, ny, nz) {
  const vx = LAMP[0] - x, vy = LAMP[1] - y, vz = LAMP[2], d = Math.hypot(vx, vy, vz);
  return Math.max(0, (nx * vx + ny * vy + nz * vz) / d) * 4400 / (1800 + d * d);
}
const FACE = [kit.hex('#2a4fd0'), kit.hex('#f04a1a')];         // side 0 hours: indigo; side 1 minutes: vermilion
const CORE = [kit.hex('#dfe9ff'), kit.hex('#ffe4c4')];
// The bare paper is dim, so it is one channel only: a 2/255 green in the
// indigo would step and tint; one clean channel stays the same hue as it fades.
const PAPER = [[0, 0, 0.62], [0.8, 0, 0]];         // a pleat's ridge: the paper catching the lamp
const FROG = kit.hex('#4cd83c'), BELLY = kit.hex('#eef7b0'), LEG = kit.hex('#1f8f2c'), EYE = kit.hex('#fff8d0');
const RING = [[0, 0], [1.5, 0], [-1.5, 0], [0.75, 1.3], [-0.75, 1.3], [0.75, -1.3], [-0.75, -1.3]];
const RIP = 500;                                               // mm/s: the old pleats spring flat (all but at once: a
                                                               // slow ripple leaves fragments that read as other digits)

/**
 * The paper at sheet point (px, py) (relative to G) on `side`: adds into c.
 * N is the visible face's world normal, W maps a content direction to world.
 */
function paper(px, py, side, layers, N, W, wx, wy, c) {
  const ux = px + G[0], uy = side ? -py : py;                   // the side's own upright frame
  const grain = 0.7 + 0.6 * kit.fbm(ux * 0.11 + side * 9, uy * 0.11, 0, 3);
  const flat = lamp(wx, wy, N[0], N[1], N[2]);
  const F = FACE[side], B = PAPER[side], k0 = 0.2 * grain * (0.3 + flat);
  c[0] += B[0] * k0; c[1] += B[1] * k0; c[2] += B[2] * k0;
  let h = 0, sx = 0, sy = 1, gl = 0, dm = 1e9, ox = 0, oy = 0;
  for (const L of layers) {
    const [v, a, b, g, d, qx, qy] = pleat(L.segs, ux, uy, L.upto);
    let amp = 1, fl = 0;
    if (L.flatAt !== undefined) {                              // an old pleat springing flat
      const e = kit.smoothstep(0, 0.22, L.flatAt - Math.hypot(ux - L.lx, uy - L.ly) / RIP);
      amp = 1 - e; fl = 4 * e * (1 - e);
    }
    const hv = v * amp;
    if (hv > h) { h = hv; sx = a; sy = b; }
    if (d * (2 - amp) < dm) { dm = d * (2 - amp); ox = qx; oy = qy; }
    gl = Math.max(gl, v * (g + fl));
  }
  // the pleats stand up off the paper and cast a shadow away from the lamp
  if (dm < 5) {
    const wx2 = W[0] * ox + W[1] * oy, wy2 = W[2] * ox + W[3] * oy, lx = LAMP[0] - wx, ly = LAMP[1] - wy;
    const away = -(wx2 * lx + wy2 * ly) / (Math.hypot(wx2, wy2) * Math.hypot(lx, ly) + 1e-6);
    const sh = 0.85 * kit.smoothstep(5, 3, dm) * kit.smoothstep(-0.2, 0.6, away) * (1 - h);
    c[0] -= B[0] * k0 * sh; c[1] -= B[1] * k0 * sh; c[2] -= B[2] * k0 * sh;
  }
  if (h <= 0 && gl <= 0) return;
  // a pleat is a strip of paper standing at an angle, leaning to the left of
  // the direction it was creased in; it lights by where it faces the lamp
  const dx = W[0] * sx + W[1] * sy, dy = W[2] * sx + W[3] * sy, st = Math.sin(0.85), ct = Math.cos(0.85);
  const lean = side ? -1 : 1;
  const lit = lamp(wx, wy, N[0] * ct + lean * dy * st, N[1] * ct - lean * dx * st, N[2] * ct);
  const C = CORE[side], k = 0.5 * h * (0.5 + 1.7 * lit) + 0.45 * gl;
  const m = 0.45;                                              // the ridge keeps some of the paper's colour
  c[0] += (C[0] * (1 - m) + F[0] * m) * k; c[1] += (C[1] * (1 - m) + F[1] * m) * k; c[2] += (C[2] * (1 - m) + F[2] * m) * k;
}
/** The frog's heading: its recent velocity, smoothed; it faces the digits when it sits. */
function heading(s, P, Pn, hourly, eve) {
  let vx = 0, vy = 0;
  for (let j = 0; j < 6; j++) {
    const t = s - j * 0.06, a = frogPos(t - 0.03, P, Pn, hourly, eve), b = frogPos(t + 0.03, P, Pn, hourly, eve);
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const m = Math.hypot(dx, dy);
    if (m < 0.05) { dx = Math.cos(FACING); dy = Math.sin(FACING); } else { dx /= m; dy /= m; }
    const w = 1 - j / 6;
    vx += dx * w; vy += dy * w;
  }
  return Math.atan2(vy, vx);
}

/** An ellipse's signed distance, roughly, mm. */
const ell = (x, y, rx, ry) => (Math.hypot(x / rx, y / ry) - 1) * Math.min(rx, ry);

function drawFrog(ctx, f, h, k, blink, dim) {
  const [fx, fy, z, roll] = f, sc = 1 + z / 40, cr = Math.cos(roll), ca = Math.cos(h), sa = Math.sin(h);
  const rx = 5.2 * sc * (0.84 + 0.16 * k), ry = 4.2 * sc * (1.3 - 0.3 * k), acr = Math.max(0.35, Math.abs(cr));
  // shadow on the paper, falling away from the lamp
  if (z > 0.3) {
    const sx = fx + z * 0.45, sy = fy + z * 0.6, a = Math.min(1, z / 3) * 0.8 / (1 + z / 20);
    for (const i of ctx.layout.index.near(sx, sy, 8)) {
      const l = ctx.leds[i], v = a * kit.smoothstep(5.5, 2, Math.hypot(l.x - sx, l.y - sy));
      for (let c = 0; c < 3; c++) ctx.out[3 * i + c] *= 1 - v;
    }
  }
  const top = cr > 0, skin = top ? FROG : BELLY;
  for (const i of ctx.layout.index.near(fx, fy, 10 * sc)) {
    const l = ctx.leds[i], dx = l.x - fx, dy = l.y - fy;
    const lx = dx * ca + dy * sa, ly = (-dx * sa + dy * ca) / acr;
    const body = ell(lx + 0.5 * sc, ly, rx, ry);
    const legs = Math.min(ell(lx + 4.2 * sc, ly - 4.6 * sc, 2.4 * sc, 1.8 * sc), ell(lx + 4.2 * sc, ly + 4.6 * sc, 2.4 * sc, 1.8 * sc));
    const a = kit.smoothstep(1, -1, Math.min(body, legs));
    if (a <= 0) continue;
    // two folded facets either side of the spine
    const side = ly >= 0 ? 1 : -1, nx = -sa * side * 0.55 * cr, ny = ca * side * 0.55 * cr;
    const lit = 0.3 + 1.2 * lamp(l.x, l.y, nx, ny, 0.83);
    let c = kit.scale(body < legs ? skin : LEG, 0.5 * lit);
    if (top && !blink) {
      const e = Math.min(ell(lx - 4.35 * sc, ly - 2 * sc, 1.6 * sc, 1.6 * sc), ell(lx - 4.35 * sc, ly + 2 * sc, 1.6 * sc, 1.6 * sc));
      c = kit.mix(c, kit.scale(EYE, 1.0), kit.smoothstep(0.9, -0.9, e));
    }
    kit.over(ctx, i, c, a * dim);
  }
}

export default {
  name: 'Origami',
  blurb: 'a two-sided paper sheet, hours on the face and minutes on the back, turns over in place; a paper frog creases each new minute',
  layouts: ['tri'], look: { look: 'opal', gap: 1.2 }, fps: 60, brightness: 0.6, dither: true,
  frame(ctx) {
    const d = ctx.date, now = d.getTime() / 1000, M = Math.floor(now / 60) * 60, s = now - M;
    const hourly = d.getMinutes() === 0, eve = d.getMinutes() === 59, dim = 1 - 0.75 * ctx.night;
    const P = plan(M), Pn = plan(M + 60), hh = pad(d.getHours());
    placeLamp(s);
    const layers = [[0, 1].map((j) => ({ segs: glyphSegs(hh[j], j), upto: Infinity })), []];
    for (const j of [0, 1]) {
      const g = P.legs.find((q) => q.slot === j);
      if (!g || s > g.t1 + 0.5) { layers[1].push({ segs: glyphSegs(P.now[j], j), upto: Infinity }); continue; }
      layers[1].push({ segs: g.old, upto: Infinity, flatAt: s, lx: P.land[0], ly: P.land[1] });
      if (s > g.t0) layers[1].push({ segs: g.segs, upto: (s - g.t0) * V });
    }
    const { A, flip } = sheet(s, hourly, eve);
    const det = A[0] * A[3] - A[1] * A[2];
    let N = [0, 0, 1], ca = 1, sa = 0, cth = 1;
    if (flip) {
      ca = Math.cos(flip.a); sa = Math.sin(flip.a); cth = Math.cos(flip.th);
      const sth = Math.sin(flip.th), sg = cth < 0 ? -1 : 1;
      N = [sa * sth * sg, -ca * sth * sg, Math.abs(cth)];
    }
    // paper is never quite flat: it sways a few degrees, and the lamp shows it
    const wx = 0.13 * Math.sin(now * 0.71) + 0.05 * Math.sin(now * 1.9), wy = 0.11 * Math.sin(now * 0.53 + 1.3);
    N = [N[0] + wx * N[2], N[1] + wy * N[2], N[2]];
    const nl = Math.hypot(N[0], N[1], N[2]); N = [N[0] / nl, N[1] / nl, N[2] / nl];
    const side = (det < 0) !== (cth < 0) ? 1 : 0;
    const S = side ? MY : ID, W = mul(A, S);
    const samples = flip ? RING : RING.slice(0, 1), c = [0, 0, 0];
    for (const l of ctx.leds) {
      c[0] = c[1] = c[2] = 0;
      for (const [ox, oy] of samples) {
        const qx = l.x + ox - G[0], qy = l.y + oy - G[1];
        let x0 = qx, y0 = qy;
        if (flip) {
          if (Math.abs(cth) < 0.02) continue;
          const al = ca * qx + sa * qy, pe = (-sa * qx + ca * qy) / cth;
          x0 = ca * al - sa * pe; y0 = sa * al + ca * pe;
        }
        const px = A[0] * x0 + A[2] * y0, py = A[1] * x0 + A[3] * y0;   // A^T: world -> sheet
        if (outside(px + G[0], py + G[1]) > 0) continue;
        paper(px, py, side, layers[side], N, W, l.x + ox, l.y + oy, c);
      }
      if (flip && Math.abs(cth) < 0.35) {                      // the paper's edge, catching the light
        const qx = l.x - G[0], qy = l.y - G[1], al = ca * qx + sa * qy, pe = Math.abs(-sa * qx + ca * qy);
        const bx = A[0] * ca + A[2] * sa, by = A[1] * ca + A[3] * sa;
        if (outside(bx * al + G[0], by * al + G[1]) < 0) {
          const e = (1 - Math.abs(cth) / 0.35) ** 2 * kit.smoothstep(2.8, 0.6, pe) * samples.length * 0.3;
          c[0] += e * 0.9; c[1] += e * 0.75; c[2] += e * 0.6;
        }
      }
      kit.set(ctx, l.i, c, dim / samples.length);
    }
    const f = frogPos(s, P, Pn, hourly, eve);
    const blink = kit.hash(Math.floor(now / 3.7)) < 0.5 && (now % 3.7) < 0.14;
    // at home it breathes and looks about
    const home = kit.smoothstep(3, 0, Math.hypot(f[0] - HOME[0], f[1] - HOME[1])) * kit.smoothstep(1, 0, f[2]);
    const look = home * 0.5 * (kit.noise2(now * 0.35, 3.1) - 0.5) * 2;
    const breath = 1 + 0.06 * home * Math.sin(now * kit.TAU / 1.4);
    drawFrog(ctx, f, heading(s, P, Pn, hourly, eve) + look, squash(s, P, hourly, eve) * breath, blink, dim);
  },
};
