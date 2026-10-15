// Kite: the diamond of two triangles IS a kite, flown at dusk with the low sun
// behind it, so the ripstop sail glows like stained glass. Its two spars cross
// the board's diagonals and split the sail into four panels; each panel
// carries one digit, appliquéd in gold cloth with a dark hem (HH above the
// spine, MM below). The digits are drawn for this lattice: every stroke is a
// chain of neighbouring LEDs, and every bowl is a little kite (a 60/120
// diamond, the board's own shape).
//
// The kite is a real plane in 3D, ray-cast per LED: it sways, the cloth
// ripples with travelling wind waves, and the sun shows through it as a warm
// hot spot. Each minute a gust builds, and the kite turns over in the wind:
// its other side, painted with the new time, comes round. Edge-on, the sun
// behind it blazes out for an instant and the tail of bows whips across.
// Each hour a rival fighter kite closes in behind (its shadow slides across
// the sail), the two lines cross and saw, the old kite's line is cut and it
// tumbles away with the old hour, revealing the new kite behind it.
//
// Stateless: every pose is a closed-form function of the wall clock.
import * as kit from '../js/kit.js';

const DX = 2 * Math.sqrt(3);                  // column step (mm)
const X0 = -24.2487;                          // world x of lattice column 0
const CX = 25.98076, CY = 1;                  // where the spars cross
const A = 53, B = 31.6;                        // half spine (to nose / tail), half spar
const D = 240;                                // eye distance (mm): mild perspective
// Lattice origin (gx, gy) of H h M m. Each row slants one LED down to the
// right like the spine (the right board sits half a row low), and the minutes
// row is staggered a column left, so no two digits ever touch.
const SLOTS = [[10, -10], [16, -8], [9, 1], [15, 3]];

// ------------------------------------------------------------ the digits
// On a 5-column x 9-half-row cell: (i, j), i + j even. Vertical strokes run
// along a column, slanted ones are the lattice's 30 degree lines; there is no
// straight horizontal, so the flat parts are zigzags.
const GLYPHS = {
  0: [[[2, 0], [0, 2], [0, 6], [2, 8], [4, 6], [4, 2], [2, 0]]],
  1: [[[0, 2], [2, 0], [2, 8]]],
  2: [[[0, 2], [2, 0], [4, 2], [0, 6], [0, 8], [1, 7], [2, 8], [3, 7], [4, 8]]],
  3: [[[0, 2], [2, 0], [4, 2], [2, 4], [4, 6], [2, 8], [0, 6]]],
  4: [[[0, 0], [0, 4], [1, 5], [2, 4], [3, 5], [4, 4]], [[4, 0], [4, 8]]],
  5: [[[4, 0], [3, 1], [2, 0], [1, 1], [0, 0], [0, 2], [2, 4], [4, 6], [2, 8], [0, 6]]],
  6: [[[4, 2], [2, 0], [0, 2], [0, 6], [2, 8], [4, 6], [2, 4], [0, 6]]],
  7: [[[0, 0], [1, 1], [2, 0], [3, 1], [4, 0], [4, 2], [2, 4], [2, 8]]],
  8: [[[2, 0], [0, 2], [2, 4], [4, 2], [2, 0]], [[2, 4], [0, 6], [2, 8], [4, 6], [2, 4]]],
  9: [[[0, 6], [2, 8], [4, 6], [4, 2], [2, 0], [0, 2], [2, 4], [4, 2]]],
};

const segCache = new Map();
/** Segments of digit `ch` in slot `s`, in display coords (mm from the spar crossing). */
function digitSegs(s, ch) {
  const key = s * 10 + ch;
  if (segCache.has(key)) return segCache.get(key);
  const [gx0, gy0] = SLOTS[s], segs = [];
  const P = ([i, j]) => [X0 + (gx0 + i) * DX - CX, 2 * (gy0 + j) - CY];
  for (const path of GLYPHS[ch]) for (let k = 0; k + 1 < path.length; k++) segs.push([...P(path[k]), ...P(path[k + 1])]);
  const xs = segs.flatMap((g) => [g[0], g[2]]), ys = segs.flatMap((g) => [g[1], g[3]]);
  const box = [Math.min(...xs) - 6, Math.min(...ys) - 6, Math.max(...xs) + 6, Math.max(...ys) + 6];
  const r = { segs, box };
  segCache.set(key, r);
  return r;
}
/** Distance (mm) from display point (u, v) to the nearest stroke of the time `t4`. */
// Measured as it looks on the board: sx, sy are how much the turn squashes the
// sail across and along, so a foreshortened stroke keeps its width in LEDs
// instead of falling between them.
function inkDist(u, v, t4, sx = 1, sy = 1) {
  let best = 99;
  const loose = sx < 0.95 || sy < 0.95;
  for (let s = 0; s < 4; s++) {
    const { segs, box } = digitSegs(s, t4[s]);
    if (!loose && (u < box[0] || u > box[2] || v < box[1] || v > box[3])) continue;
    for (const g of segs) {
      const d = kit.segDist(u * sx, v * sy, g[0] * sx, g[1] * sy, g[2] * sx, g[3] * sy);
      if (d < best) best = d;
    }
  }
  return best;
}
const timeDigits = (sec) => {
  const d = new Date(sec * 1000), h = d.getHours(), m = d.getMinutes();
  return [Math.floor(h / 10), h % 10, Math.floor(m / 10), m % 10];
};

// ---------------------------------------------------------------- colour
const PALS = [                                    // per hour: two panel cloths and the gold appliqué
  { a: kit.hex('#b8102e'), b: kit.hex('#6c0e58'), ink: kit.hex('#ffb42c') },   // crimson, plum
  { a: kit.hex('#cc3a12'), b: kit.hex('#561874'), ink: kit.hex('#ffd056') },   // vermilion, violet
  { a: kit.hex('#a8124e'), b: kit.hex('#381c8a'), ink: kit.hex('#ffa832') },   // rose, indigo
  { a: kit.hex('#c22a0c'), b: kit.hex('#7c0e3c'), ink: kit.hex('#ffcc66') },   // scarlet, wine
];
const SKY_TOP = kit.hex('#0c0a2c'), SKY_LOW = kit.hex('#2c0c28'), SUN = kit.hex('#ffd9a0'), SUNGLOW = kit.hex('#ff7a2a');
const SUN_X = 22, SUN_Y = 9;                     // the sun, low, almost behind the crossing of the spars
const LINE = kit.hex('#ffe6c0'), SPARK = kit.hex('#fff2d0');

function sky(x, y, out) {
  const k = kit.clamp((y + 30) / 62) ** 1.6;
  const r2 = (x - SUN_X) ** 2 + (y - SUN_Y) ** 2, r = Math.sqrt(r2);
  const glow = 0.5 * Math.exp(-r2 / (2 * 7 * 7)) + 0.12 * Math.exp(-r2 / (2 * 20 * 20)), core = 1 - kit.smoothstep(4, 6.5, r);
  for (let c = 0; c < 3; c++) out[c] = kit.lerp(SKY_TOP[c], SKY_LOW[c], k) + SUNGLOW[c] * glow + SUN[c] * core;
}
/** Backlight through the cloth: the sky's glow plus the sun's hot spot. */
// Dusk clouds drift between the sun and the kite: their shadows slide across the sail.
const backlight = (x, y, now) => (0.55 + 0.6 * Math.exp(-((x - SUN_X) ** 2 + (y - SUN_Y) ** 2) / (2 * 18 * 18)))
  * (0.45 + 0.75 * kit.smoothstep(0.3, 0.7, kit.fbm(x * 0.022 - now * 0.11, y * 0.03 + now * 0.012, now * 0.02, 2)));

// ------------------------------------------------------------------ 3D
function rot(yaw, pitch, roll) {                  // columns of Rz(roll) Rx(pitch) Ry(yaw)
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  const ry = [[cy, 0, -sy], [0, 1, 0], [sy, 0, cy]];               // columns of Ry
  const rx = (v) => [v[0], cp * v[1] - sp * v[2], sp * v[1] + cp * v[2]];
  const rz = (v) => [cr * v[0] - sr * v[1], sr * v[0] + cr * v[1], v[2]];
  return ry.map((v) => rz(rx(v)));
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A kite pose: centre q (world mm, z away from the eye) and yaw/pitch/roll. */
function pose(q, yaw, pitch, roll) { const [ex, ey, ez] = rot(yaw, pitch, roll); return { q, ex, ey, ez }; }

/** The sway of a kite holding its station: small, slow, never still. */
function sway(now, k = 1) {
  return {
    yaw: k * (0.055 * Math.sin(0.71 * now) + 0.03 * Math.sin(1.27 * now + 1)),
    pitch: k * 0.04 * Math.sin(0.53 * now + 2),
    // roll and bob move the digits off their LEDs, so they stay small; yaw and
    // pitch about the spars barely do, so the gust goes into those
    roll: 0.008 * Math.sin(0.9 * now + 0.5) + 0.004 * Math.sin(1.9 * now),
    y: 0.25 * Math.sin(1.1 * now),
  };
}

/**
 * Ray-cast one kite into cov[] (0..1) and col[] (linear rgb). face(side)
 * says what that side carries: { t4, pal, inkA }.
 */
function castKite(ctx, P, face, now, gust, cov, col, shadow, inkOut, clothDim = 1) {
  const E = [CX, CY, -D], QE = [P.q[0] - E[0], P.q[1] - E[1], P.q[2] - E[2]], nq = dot(P.ez, QE);
  const faces = [face(0), face(1)];
  const sc = D / (D + P.q[2]);                     // perspective: farther is smaller
  const sx = kit.clamp(sc * Math.hypot(P.ex[0], P.ex[1]), 0.05, 1.2), sy = kit.clamp(sc * Math.hypot(P.ey[0], P.ey[1]), 0.05, 1.2);
  const sq = Math.min(sx, sy), inkVis = kit.smoothstep(0.62, 0.9, sq);
  const wid = kit.clamp((1 - sq) * 4, 0, 1.4);   // off the lattice, strokes widen so they never fall between LEDs
  const sheen = 1 + 0.9 * (1 - Math.abs(P.ez[2]));     // cloth seen slantwise glows: a longer path through it
  for (const l of ctx.leds) {
    const i = l.i, d = [l.x - CX, l.y - CY, D], nd = dot(P.ez, d);
    cov[i] = 0; if (shadow) shadow[i] = 0; if (inkOut) inkOut[i] = 0;
    if (Math.abs(nd) < 1e-3 * D) continue;
    const s = nq / nd;
    if (s <= 0) continue;
    const rel = [E[0] + s * d[0] - P.q[0], E[1] + s * d[1] - P.q[1], E[2] + s * d[2] - P.q[2]];
    const lu = dot(rel, P.ex), lv = dot(rel, P.ey);
    const side = nd > 0 ? 0 : 1, F = faces[side];
    const u = side ? -lu : lu, v = lv;              // display coords: the side we see, unmirrored
    const sk = v - u / A;                           // across the spine
    const m = Math.abs(u) / A + Math.abs(sk) / B;
    const edge = (1 - m) * 27.1;
    const c = kit.smoothstep(-1.2, 1.0, edge);
    if (c <= 0) continue;
    // wind waves in the cloth's own coordinates, running nose to tail
    const env = kit.smoothstep(-1, 3, edge) * kit.smoothstep(0.5, 3, Math.abs(u)) * kit.smoothstep(0.3, 2.5, Math.abs(sk));
    const amp = env * (0.8 + 0.7 * gust);
    const w1 = Math.cos(0.26 * lu + 0.08 * lv + 7.5 * now);           // the long swell, nose to tail
    const w2 = Math.cos(0.19 * lu - 0.24 * lv + 4.4 * now + 1.7);
    const w3 = Math.cos(0.55 * lu + 0.05 * lv + 13 * now + 4.1);      // flutter
    const G = amp * (0.75 * w1 + 0.3 * w2 + 0.18 * w3 * (0.4 + gust));
    const shade = Math.max(0.12, 1 + 0.85 * G), glint = 1.1 * Math.max(0, G - 0.4) ** 2;
    const light = backlight(l.x, l.y, now) * shade * sheen;
    // cloth: harlequin panels, dark bamboo spars
    const pan = ((u > 0) !== (sk > 0)) !== (side === 1) ? F.pal.a : F.pal.b;
    const spar = Math.min(kit.smoothstep(0.6, 2.4, Math.abs(u)), kit.smoothstep(0.5, 1.5, Math.abs(sk)));
    let k = 0.75 * light * kit.smoothstep(0.15, 1, spar);
    // the appliqué: gold digits with a dark double-stitched hem
    let ink = 0;
    if (F.inkA * inkVis > 0) {
      const dd = inkDist(u + 0.5 * G, v + 0.35 * G, F.t4, sx, sy);
      const a = F.inkA * inkVis;
      ink = (1 - kit.smoothstep(0.7 + 0.6 * wid, 2.3 + wid, dd)) * a;
      k *= kit.lerp(1, kit.smoothstep(3.3 + wid, 5.6 + wid, dd), a);
    }
    const o = 3 * i;
    let mx = 0;
    for (let ch = 0; ch < 3; ch++) {
      const cloth = pan[ch] * k + glint * pan[ch];
      mx = Math.max(mx, col[o + ch] = kit.lerp(cloth * clothDim, F.pal.ink[ch] * ((0.45 + 0.4 * light) + glint), ink));
    }
    // a faint tint channel under a bright one is a few 1/255 steps that only
    // flicker and shift hue: drop it, and keep the cloth's colours pure
    for (let ch = 0; ch < 3; ch++) if (col[o + ch] < 0.006 || col[o + ch] < 0.08 * mx) col[o + ch] = 0;
    cov[i] = c; if (inkOut) inkOut[i] = ink;
    if (shadow) shadow[i] = c * kit.lerp(1, 0.8, spar);
  }
}

// ------------------------------------------------------------ the story
const SHOW0 = -7, SHOW1 = 3;                      // the hour's kite fight, seconds around the hour
const RETREAT = 0, RIVAL = 150;                   // how far back ours and the rival fly during it (mm)
const FLYER1 = [104, 50], FLYER2 = [-46, 50];     // where the two lines go: the flyers, down the hill
const palOf = (sec) => PALS[new Date(sec * 1000).getHours() % PALS.length];
const ZERO = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };

/** The gust: builds through the minute, peaks at the turn, dies away. */
function gustAt(now) {
  const sec = now - Math.floor(now / 60) * 60;
  return kit.smoothstep(42, 59.5, sec) + (sec < 6 ? 1 - kit.smoothstep(0, 6, sec) : 0);
}

/** A kite flying station: kPar is which side faces us at e = 0, e the turn (0..1). */
function flying(now, kPar, e, lift, gust, off) {
  const sw = sway(now, 1 + 1.5 * gust);
  return pose([CX + off.x, CY + sw.y - 4 * lift + off.y, 22 * lift + off.z],
    Math.PI * (kPar + e) + sw.yaw + off.yaw, sw.pitch + 0.12 * lift + off.pitch, sw.roll + off.roll);
}

/**
 * Every kite in the sky at `now`, front first: { id, P, face(side), tail }.
 * id is the hour (epoch s) whose kite it is; the tail is drawn for each.
 */
function kitesAt(now) {
  const Mn = Math.round(now / 60) * 60, Hn = Math.round(now / 3600) * 3600, tau = now - Hn;
  const gust = gustAt(now);
  if (tau < SHOW0 || tau > SHOW1) {
    // a minute: the kite turns over in the gust; the side coming round carries the new time
    const kOld = Mn / 60 - 1, p = kit.clamp((now - (Mn - 1.2)) / 2.4), e = kit.ease.inOut(p);
    const tOld = timeDigits(Mn - 60), tNew = timeDigits(Mn), pOld = palOf(Mn - 60), pNew = palOf(Mn);
    const P = flying(now, kOld & 1, e, Math.sin(Math.PI * p), gust, ZERO);
    const face = (side) => (side === (kOld & 1) ? { t4: tOld, pal: pOld, inkA: 1 } : { t4: tNew, pal: pNew, inkA: 1 });
    return { gust, kites: [{ id: Math.floor(now / 3600), P, face }] };
  }
  // the hour: ours backs off, a rival swoops in, the lines cross and saw, ours is cut
  const kOld = Hn / 60 - 1, kNew = Hn / 60;
  const tOld = timeDigits(Hn - 60), tNew = timeDigits(Hn), pOld = palOf(Hn - 60), pNew = palOf(Hn);
  const back = kit.ease.inOut(kit.smoothstep(SHOW0, SHOW0 + 2.5, tau));
  const oOld = { x: 0, y: 0, z: RETREAT * back, yaw: 0, pitch: 0, roll: 0 };
  if (tau < 0) {                                    // fighting: quick dodges
    oOld.yaw += back * 0.035 * Math.sin(1.7 * now + 1);
  } else {                                          // cut loose: it tumbles away down the wind
    const f = tau;
    oOld.x -= 58 * f ** 1.3; oOld.y += 16 * f * f - 4 * f; oOld.z += 40 * f;
    oOld.yaw += 4.2 * f; oOld.roll += 1.8 * f; oOld.pitch -= 0.6 * f;
  }
  const fade = 1 - kit.smoothstep(0, 0.4, tau);
  const oldKite = {
    id: Hn / 3600 - 1, P: flying(now, kOld & 1, 0, 0, gust, oOld),
    face: (side) => ({ t4: tOld, pal: pOld, inkA: side === (kOld & 1) ? fade : 0 }),
  };
  // the rival is placed by where it shows on the board: its line from there to
  // its flyer (down-left) slides up ours until the crossing reaches our bridle
  const B1 = [CX, CY];
  const ux = B1[0] - FLYER2[0], uy = B1[1] - FLYER2[1], uL = Math.hypot(ux, uy), u = [ux / uL, uy / uL], n = [-u[1], u[0]];
  const sawAt = (t) => {                            // on screen, during the saw (t in -2.5..0)
    const off = 13 * kit.clamp(-t / 2.5), sw = 2.2 * Math.sin(9 * now) * kit.smoothstep(-2.5, -2, t);
    return [B1[0] + u[0] * (30 + sw) + n[0] * off, B1[1] + u[1] * (30 + sw) + n[1] * off];
  };
  let scr, z, yaw, roll;
  if (tau < -2.5) {                                 // swooping in from the upper right, weaving
    const e = kit.ease.inOut(kit.clamp((tau - SHOW0 - 1) / (-2.5 - SHOW0 - 1))), S = sawAt(-2.5);
    scr = [kit.lerp(CX + 95, S[0], e) + 5 * Math.sin(1.9 * now) * (1 - e), kit.lerp(CY - 55, S[1], e) + 4 * Math.sin(2.6 * now + 1) * (1 - e)];
    z = RIVAL; yaw = 0.5 * (1 - e) + 0.25; roll = -0.5 * (1 - e) - 0.15;
  } else if (tau < 0) {
    scr = sawAt(tau); z = RIVAL; yaw = 0.25; roll = -0.15 + 0.06 * Math.sin(9 * now);
  } else {                                          // the winner takes the station
    const e = kit.ease.out(kit.clamp(tau / 1.7)), S = sawAt(0);
    scr = [kit.lerp(S[0], CX, e), kit.lerp(S[1], CY, e)]; z = RIVAL * (1 - e); yaw = 0.25 * (1 - e); roll = -0.15 * (1 - e);
  }
  const k = (D + z) / D;
  const oNew = { x: (scr[0] - CX) * k, y: (scr[1] - CY) * k, z, yaw, pitch: 0, roll };
  const show = kit.smoothstep(0.15, 0.6, tau);
  const newKite = {
    id: Hn / 3600, P: flying(now, kNew & 1, 0, 0, gust, oNew),
    face: (side) => ({ t4: tNew, pal: pNew, inkA: side === (kNew & 1) ? show : 0 }),
  };
  return { gust, kites: [oldKite, newKite], tau };
}

/** Where a kite-local point lands on the board (mm). */
function project(P, lu, lv) {
  const X = [P.q[0] + lu * P.ex[0] + lv * P.ey[0], P.q[1] + lu * P.ex[1] + lv * P.ey[1], P.q[2] + lu * P.ex[2] + lv * P.ey[2]];
  const k = D / (X[2] + D);
  return [CX + (X[0] - CX) * k, CY + (X[1] - CY) * k];
}

// ---------------------------------------------------------------- frame
const COV = [new Float32Array(240), new Float32Array(240)], COL = [new Float32Array(720), new Float32Array(720)];
const SHADOW = new Float32Array(240), INK = new Float32Array(240), TAILBUF = new Float32Array(720), LINEBUF = new Float32Array(720);
const SKY = [0, 0, 0];
const BOWS = [kit.hex('#ffc040'), kit.hex('#ff4a78')];
const TAIL_N = 16, TAIL_LAG = 0.05, TAIL_SEG = 4.2;

/** The tail of bows behind kite `id`: a chain trailing its tail corner through time. */
function drawTail(tctx, id, now) {
  const pts = [];
  for (let k = 0; k <= TAIL_N; k++) {
    const tt = now - k * TAIL_LAG, K = kitesAt(tt).kites.find((q) => q.id === id);
    if (!K) break;
    const a = project(K.P, -A, -1), n = project(K.P, A, 1);
    let dx = a[0] - n[0], dy = a[1] - n[1] + 0.25 * Math.hypot(a[0] - n[0], a[1] - n[1]);
    const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const fl = Math.sin(k * 0.95 - now * 9.5) * 0.45 * Math.sqrt(k) * (1 + gustAt(tt));
    pts.push([a[0] + dx * k * TAIL_SEG - dy * fl, a[1] + dy * k * TAIL_SEG + dx * fl]);
  }
  for (let k = 0; k + 1 < pts.length; k++) {
    const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
    for (const i of tctx.layout.index.near((ax + bx) / 2, (ay + by) / 2, TAIL_SEG)) {
      const l = tctx.leds[i], d = kit.segDist(l.x, l.y, ax, ay, bx, by);
      if (d < 1.4) kit.add(tctx, i, LINE, 0.05 * (1 - d / 1.4));
    }
    if (k % 3 === 2) {                               // a bow: two wings across the string
      const nx = -(by - ay) / TAIL_SEG, ny = (bx - ax) / TAIL_SEG, c = BOWS[(k / 3 | 0) & 1];
      kit.splat(tctx, ax + nx * 1.5, ay + ny * 1.5, 2.6, c, 0.75);
      kit.splat(tctx, ax - nx * 1.5, ay - ny * 1.5, 2.6, c, 0.75);
    }
  }
}

/** A thin line from a to b into buf, with brightness a. */
function drawLine(ctx, buf, a, b, amt) {
  if (amt <= 0) return;
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, r = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2 + 2;
  for (const i of ctx.layout.index.near(mx, my, r)) {
    const l = ctx.leds[i], d = kit.segDist(l.x, l.y, a[0], a[1], b[0], b[1]);
    const w = (1 - kit.smoothstep(0.2, 1.5, d)) * amt;
    if (w > 0) for (let c = 0; c < 3; c++) buf[3 * i + c] += LINE[c] * w;
  }
}

function crossing(a, b, c, d) {                      // where segment ab meets cd, or null
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-6) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + t * r[0], a[1] + t * r[1]] : null;
}

/**
 * Now and then a swallow darts past behind the kite: its silhouette flicks
 * across the glowing sail. Returns its two wing strokes on the board, or null.
 */
const SWIFT_W = 13;
function swallow(now) {
  const w = Math.floor(now / SWIFT_W), t0 = w * SWIFT_W + 1 + 8 * kit.hash(w, 3), dur = 2.6 + 0.8 * kit.hash(w, 4);
  const p = (now - t0) / dur;
  if (kit.hash(w, 2) > 0.6 || p < 0 || p > 1) return null;
  const sec = t0 - Math.floor(t0 / 60) * 60;
  if (sec > 50 || sec < 4) return null;            // not across a turn
  const dir = kit.hash(w, 5) < 0.5 ? 1 : -1, y0 = -18 + 30 * kit.hash(w, 6);
  const x = dir > 0 ? kit.lerp(-34, 86, p) : kit.lerp(86, -34, p);
  const y = y0 + 9 * Math.sin(p * 4.2 + 6 * kit.hash(w, 7)), dy = 9 * 4.2 / dur * Math.cos(p * 4.2) / (120 / dur);
  const L = Math.hypot(1, dy), fx = dir / L, fy = dy / L;   // flying direction
  const flap = Math.sin(now * 20), span = 7.5, back = 4.5;
  const tip = (side) => [x - fx * back + side * -fy * span * (0.55 + 0.45 * flap), y - fy * back + side * fx * span * (0.55 + 0.45 * flap)];
  return [[x + fx * 2, y + fy * 2, ...tip(1)], [x + fx * 2, y + fy * 2, ...tip(-1)], [x + fx * 3, y + fy * 3, x - fx * 6, y - fy * 6]];
}

export default {
  name: 'Kite',
  blurb: 'a backlit diamond kite with the time appliquéd on its four panels; it turns over in each minute\'s gust and loses a kite fight every hour',
  layouts: ['tri-diamond'], look: { look: 'opal', gap: 1.6 }, fps: 60, brightness: 0.85, dither: true,
  frame(ctx) {
    // at night the cloth and sky sink further than the gold, so the time still reads
    const now = ctx.date.getTime() / 1000, dim = 1 - 0.6 * ctx.night, clothDim = 1 - 0.55 * ctx.night;
    const { gust, kites, tau } = kitesAt(now);
    kites.forEach((K, j) => castKite(ctx, K.P, K.face, now, gust, COV[j], COL[j], j ? SHADOW : null, j ? null : INK, clothDim));
    const two = kites.length > 1;

    // tails and lines
    TAILBUF.fill(0); LINEBUF.fill(0);
    const tctx = { layout: ctx.layout, leds: ctx.leds, out: TAILBUF }, lctx = { layout: ctx.layout, leds: ctx.leds, out: LINEBUF };
    for (const K of kites) drawTail(tctx, K.id, now);
    if (two) {
      const B1 = project(kites[0].P, 0, 0), B2 = project(kites[1].P, 0, 0);
      const F1 = FLYER1, F2 = FLYER2;
      const inA = kit.smoothstep(-4.5, -3.5, tau);
      const ours = tau < 0 ? inA * 0.22 : 0.22 * (1 - kit.smoothstep(0, 0.3, tau));
      const theirs = inA * 0.22 * (1 - kit.smoothstep(0.6, 2.4, tau));
      if (tau < 0) drawLine(ctx, LINEBUF, B1, F1, ours);
      else {                                         // the cut end whips away
        const w = kit.smoothstep(0, 0.25, tau);
        drawLine(ctx, LINEBUF, [kit.lerp(B1[0], F1[0], 0.15 + 0.5 * w), kit.lerp(B1[1], F1[1], 0.15 + 0.5 * w) + 6 * w], F1, ours);
      }
      drawLine(ctx, LINEBUF, B2, F2, theirs);
      // sawing: sparks of glass where the lines cross, and a burst at the cut
      const X = tau < 0 ? crossing(B1, F1, B2, F2) : null;
      if (X && tau > -3) {
        const saw = kit.smoothstep(-3, -0.5, tau);
        for (let s = 0; s < 3; s++) {
          const h = kit.hash(Math.floor(now * 24), s, 7), ang = h * kit.TAU, r = 1 + 3 * kit.hash(Math.floor(now * 24), s, 9);
          kit.splat(lctx, X[0] + r * Math.cos(ang), X[1] + r * Math.sin(ang), 2.4, SPARK, saw * (0.4 + 0.8 * kit.hash(s, Math.floor(now * 24))));
        }
      }
      if (tau >= 0 && tau < 0.9) {
        const f = tau / 0.9;
        for (let s = 0; s < 9; s++) {
          const ang = s / 9 * kit.TAU + 0.4, r = 3 + 22 * kit.ease.out(f);
          kit.splat(lctx, B1[0] + r * Math.cos(ang), B1[1] + r * Math.sin(ang) + 8 * f * f, 3, SPARK, 0.9 * (1 - f) ** 2);
        }
      }
    }

    const bird = swallow(now);
    const o = ctx.out;
    for (const l of ctx.leds) {
      const i = l.i, c0 = COV[0][i], c1 = two ? COV[1][i] : 0;
      let sw = 1;
      if (bird) for (const g of bird) sw = Math.min(sw, kit.smoothstep(0.8, 3.0, kit.segDist(l.x, l.y, g[0], g[1], g[2], g[3])));
      sky(l.x, l.y, SKY);
      for (let ch = 0; ch < 3; ch++) {
        const k = 3 * i + ch;
        const back = kit.lerp((SKY[ch] + TAILBUF[k]) * clothDim, COL[1][k], c1);
        // the rival behind blocks the sun: its shadow on our sail, tinted by its cloth
        const front = two ? COL[0][k] * (1 - 0.85 * SHADOW[i] * (1 - INK[i])) + 0.12 * c1 * COL[1][k] : COL[0][k];
        o[k] = dim * (kit.lerp(back, front * (0.12 + 0.88 * sw), c0) + LINEBUF[k]);
      }
    }
  },
};
