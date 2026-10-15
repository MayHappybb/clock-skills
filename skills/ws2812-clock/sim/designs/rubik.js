// Speedcube: a 7x7x7 Rubik's cube hovering in 3D. Its stickers are the
// pixels of the time: the hour on the top face, the minutes on the front.
//
// Each minute, the rows of the front face whose stickers change make a half
// turn, one after another: the old row swings round the side to the back
// and the new one comes round from behind. On the hour the cube is tossed
// up and spun, does a flurry of finger tricks on the bottom and back layers
// (the ones with no digits on them), then two waves of half turns bring in
// the new hour and the new minutes, and it lands. Between minutes it hovers
// and sways, and every 12 s the bottom or back layer gets an idle flick.
//
// The cube is real: stickers live on integer positions and every turn is a
// permutation. Only stickers on the hidden faces (left, back, bottom) are
// "set up" just before a turn brings them into view, the way a cube mosaic
// is prepared.
//
// Pure function of time: each minute's turns are worked out from the time
// alone (cached per minute), and every frame is ray-cast per LED (2x2 samples).
import * as kit from '../js/kit.js';

const N = 7;                                   // cube order; cube spans [-N, N], a cell is 2 units
const other = (a) => [(a + 1) % 3, (a + 2) % 3];
const cc = (c) => 2 * c - (N - 1);             // cubie-centre coordinate of layer index c

// ---------------------------------------------------------------- stickers
// Face f = axis * 2 + (positive ? 1 : 0). Sticker index (f * N + i) * N + j,
// i and j the layer indices along the face's two other axes.
const POS = [];
for (let f = 0; f < 6; f++) {
  const a = f >> 1, s = f & 1 ? 1 : -1, [o1, o2] = other(a);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const p = [0, 0, 0]; p[a] = s * N; p[o1] = cc(i); p[o2] = cc(j); POS.push(p);
  }
}
const NS = POS.length;
function idxOf(p) {
  const a = Math.abs(p[0]) === N ? 0 : Math.abs(p[1]) === N ? 1 : 2, [o1, o2] = other(a);
  return (((a * 2 + (p[a] > 0 ? 1 : 0)) * N + (p[o1] + N - 1) / 2) * N + (p[o2] + N - 1) / 2);
}
const faceOf = (i) => (i / (N * N)) | 0;
const F_ = { L: 0, R: 1, D: 2, U: 3, B: 4, F: 5 };
const HIDDEN = new Set([F_.L, F_.D, F_.B]);

// +90 degrees, right-handed, about axis a
const rot90 = (a, p) => (a === 0 ? [p[0], -p[2], p[1]] : a === 1 ? [p[2], p[1], -p[0]] : [-p[1], p[0], p[2]]);
const layerOf = (p, a) => (kit.clamp(p[a], -(N - 1), N - 1) + N - 1) / 2;

/** perm[i] = where sticker i goes when layer k of axis a turns q quarters (+90 each). */
const PERMS = new Map();
function perm(a, k, q) {
  q = ((q % 4) + 4) % 4;
  const key = (a * N + k) * 4 + q;
  if (PERMS.has(key)) return PERMS.get(key);
  const P = new Int16Array(NS);
  for (let i = 0; i < NS; i++) {
    let p = POS[i];
    if (layerOf(p, a) === k) for (let r = 0; r < q; r++) p = rot90(a, p);
    P[i] = idxOf(p);
  }
  PERMS.set(key, P);
  return P;
}

// Faces in reading orientation: (row, col) from the top-left as you look at it.
const AT = {
  F: (r, c) => idxOf([cc(c), -cc(r), N]),
  U: (r, c) => idxOf([cc(c), N, cc(r)]),          // row 0 at the back
  R: (r, c) => idxOf([N, -cc(r), -cc(c)]),
  L: (r, c) => idxOf([-N, -cc(r), cc(c)]),
  B: (r, c) => idxOf([-cc(c), -cc(r), -N]),
  D: (r, c) => idxOf([cc(c), -N, -cc(r)]),
};

// ------------------------------------------------------------- the palette
// The six cube colours. A face's digits are a mosaic: ground, stroke, and the
// colour between them for the corners (blue+yellow = green, red+yellow = orange).
const BLUE = 0, YELLOW = 1, GREEN = 2, RED = 3, ORANGE = 4, WHITE = 5;
// Linear, with the minor channels at zero: a stray 1/255 would tint them.
const COL = [[0, 0.05, 1], [1, 0.6, 0], [0, 0.62, 0.04], [1, 0, 0], [1, 0.17, 0], [0.8, 0.85, 0.9]];
const SCHEME = { U: [BLUE, YELLOW, GREEN], F: [RED, WHITE, ORANGE] }, SIDE = GREEN;

// --------------------------------------------------------------- the type
// 3x5 sticker digits: '#' stroke, '+' the in-between colour, '.' ground.
const GLYPH = {
  0: ['+#+', '#.#', '#.#', '#.#', '+#+'],
  1: ['+#.', '.#.', '.#.', '.#.', '+#+'],
  2: ['##+', '..#', '+#+', '#..', '###'],
  3: ['##+', '..#', '.#+', '..#', '##+'],
  4: ['#..', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '##+', '..#', '##+'],
  6: ['+#+', '#..', '##+', '#.#', '+#+'],
  7: ['###', '..#', '.+#', '.#.', '.#.'],
  8: ['+#+', '#.#', '+#+', '#.#', '+#+'],
  9: ['+#+', '#.#', '+##', '..#', '+#+'],
};
const pad = (n) => String(n).padStart(2, '0');

/** Colour of every sticker (row, col) on a 7x7 face showing the two digits s. */
const patterns = new Map();
function facePattern(s, sch) {
  const key = s + sch.join();
  if (!patterns.has(key)) patterns.set(key, makePattern(s, sch));
  return patterns.get(key);
}
function makePattern(s, [g, k, m]) {
  const P = [];
  for (let r = 0; r < N; r++) {
    const row = [];
    for (let c = 0; c < N; c++) {
      let v = g;
      if (r >= 1 && r <= 5 && c !== 3) {
        const ch = GLYPH[s[c < 3 ? 0 : 1]][r - 1][c < 3 ? c : c - 4];
        v = ch === '#' ? k : ch === '+' ? m : g;
      }
      row.push(v);
    }
    P.push(row);
  }
  return P;
}
const want = (m, face, P) => { for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) m.set(AT[face](r, c), P[r][c]); return m; };
const solid = (m, face, v) => want(m, face, Array.from({ length: N }, () => Array(N).fill(v)));

// ------------------------------------------------------------- the turns
/**
 * Layers of one axis turning together ({ k, q, s, d }: layer, signed quarter
 * turns, start and duration in seconds after the batch's minute). Before it
 * runs, stickers on the hidden faces that the turn brings to a wanted place
 * are set to the wanted colour. Returns the batch with its pre/post states.
 */
function batch(S, axis, layers, wanted) {
  const P = new Int16Array(NS);
  for (let i = 0; i < NS; i++) P[i] = i;
  for (const L of layers) { const p = perm(axis, L.k, L.q); for (let i = 0; i < NS; i++) P[i] = p[P[i]]; }
  const inv = new Int16Array(NS);
  for (let i = 0; i < NS; i++) inv[P[i]] = i;
  const pre = S.slice();
  for (const [d, col] of wanted) {
    const s = inv[d];
    if (pre[s] === col) continue;
    if (HIDDEN.has(faceOf(s))) pre[s] = col;     // a visible sticker is never repainted
  }
  const post = new Uint8Array(NS);
  for (let i = 0; i < NS; i++) post[P[i]] = pre[i];
  const t0 = Math.min(...layers.map((L) => L.s)), t1 = Math.max(...layers.map((L) => L.s + L.d));
  return { axis, layers, pre, post, t0, t1 };
}

const rowLayer = (r) => N - 1 - r;                 // front-face row r -> y-layer

const keeps = new Map();
const keep = (Fp) => {
  const key = Fp.join('|');
  if (!keeps.has(key)) keeps.set(key, solid(want(new Map(), 'F', Fp), 'R', SIDE));
  return keeps.get(key);
};

/** Idle flicks, back and forth, of the two layers that carry no digits. */
const FIDGETS = [[12, 1, 2], [24, 2, 2], [36, 1, -2], [48, 2, -2]];   // [second, axis, quarters]
function fidgets(S, Fp, Up, out) {
  const w = solid(want(want(new Map(), 'F', Fp), 'U', Up), 'R', SIDE);
  for (const [t, axis, q] of FIDGETS) {
    const b = batch(S, axis, [{ k: 0, q, s: t, d: 0.75 }], w);
    out.push(b); S = b.post;
  }
  return S;
}

/**
 * The cube as a minute begins: the faces you see show the time; the hidden
 * ones hold what earlier turns left there (the side's green on the left, old
 * minute rows on the back, a jumble underneath), dealt afresh each minute.
 */
function startState(M, hh, mm) {
  const S = new Uint8Array(NS), F3 = SCHEME.F;
  for (let i = 0; i < NS; i++) {
    const f = faceOf(i), h = kit.hash(i, M / 60);
    S[i] = f === F_.L ? SIDE : f === F_.B ? F3[Math.floor(h * 2.4) % 3] : Math.floor(h * 6);
  }
  for (const [i, v] of want(new Map(), 'U', facePattern(hh, SCHEME.U))) S[i] = v;
  for (const [i, v] of keep(facePattern(mm, SCHEME.F))) S[i] = v;
  return S;
}

const MINUTE = { lag: 0.05, step: 0.07, dur: 1.0 };
/** A plain minute: the rows that differ make a half turn, then the idle flicks. */
function plainMinute(M, hh, m) {
  const Fo = facePattern(pad(m - 1), SCHEME.F), Fp = facePattern(pad(m), SCHEME.F);
  const start = startState(M, hh, pad(m - 1)), layers = [];
  let j = 0;
  for (let r = 1; r <= 5; r++) {
    if (Fo[r].join() === Fp[r].join()) continue;
    layers.push({ k: rowLayer(r), q: 2, s: MINUTE.lag + MINUTE.step * j++, d: MINUTE.dur });
  }
  const b = batch(start, 1, layers, keep(Fp)), bs = [b];
  fidgets(b.post, Fp, facePattern(hh, SCHEME.U), bs);
  return { start, batches: bs };
}

// The hour: tossed (from 1.1 s before) and spun; then a flurry of finger
// tricks on the bottom and back layers (they carry no digits). Then three
// waves of half turns: the minutes go blank, the new hour comes in, the new
// minutes come in. Hours and minutes can't turn at once (different axes), and
// either order alone would show a wrong time in between ("00:59" at
// midnight), so the minutes are cleared first.
const SHOW = { dip: -1.1, launch: -0.85, spun: 0.25, flick: 0.3, flickDur: 0.12, step: 0.05, dur: 0.5, waves: [0.82, 1.6, 2.38], land: 3.2, still: 4.0 };
const FLURRY = [[1, 1], [2, -1], [1, -1], [2, 1]];   // [axis, quarter turns] on layer 0
const BLANK = Array.from({ length: N }, () => Array(N).fill(SCHEME.F[0]));
function hourMinute(M, hh, ho) {
  const start = startState(M, ho, '59'), bs = [];
  let S = start;
  const Up = facePattern(hh, SCHEME.U), Fp = facePattern('00', SCHEME.F), Fo = facePattern('59', SCHEME.F);
  const Uo = facePattern(ho, SCHEME.U);
  const run = (axis, layers, wanted) => { const b = batch(S, axis, layers, wanted); bs.push(b); S = b.post; };
  FLURRY.forEach(([axis, q], j) => run(axis, [{ k: 0, q, s: SHOW.flick + j * SHOW.flickDur, d: SHOW.flickDur }], want(want(new Map(), 'U', Uo), 'F', Fo)));
  const wave = (t, q) => Array.from({ length: 6 }, (_, k) => ({ k, q, s: t + SHOW.step * (5 - k), d: SHOW.dur }));
  run(1, wave(SHOW.waves[0], 2), keep(BLANK));
  run(2, wave(SHOW.waves[1], -2), solid(want(new Map(), 'U', Up), 'R', SIDE));
  run(1, wave(SHOW.waves[2], -2), keep(Fp));
  fidgets(S, Fp, Up, bs);
  return { start, batches: bs };
}

/** Each minute's turns, cached by the minute (epoch seconds). */
const minutes = new Map();
function minuteOf(M) {
  if (minutes.has(M)) return minutes.get(M);
  const d = new Date(M * 1000), mm = d.getMinutes(), hh = pad(d.getHours());
  const e = mm === 0 ? hourMinute(M, hh, pad(new Date((M - 60) * 1000).getHours())) : plainMinute(M, hh, mm);
  if (minutes.size > 4) minutes.delete(minutes.keys().next().value);
  minutes.set(M, e);
  return e;
}

/** The cube at `now`: the state turns start from, and the moving layers. */
function cubeAt(now) {
  const M = Math.floor(now / 60) * 60, e = minuteOf(M), sec = now - M;
  let S = e.start;
  for (const b of e.batches) {
    if (sec < b.t0) break;
    if (sec < b.t1) {
      const ang = new Float32Array(N);
      for (const L of b.layers) ang[L.k] = L.q * (Math.PI / 2) * kit.ease.inOut(kit.clamp((sec - L.s) / L.d));
      return { S: b.pre, axis: b.axis, ang };
    }
    S = b.post;
  }
  return { S, axis: -1, ang: null };
}

// --------------------------------------------------------------- the pose
const DEG = Math.PI / 180, TAU = Math.PI * 2;
/** Seconds from the nearest hour turn (local), or null when far from one. */
function hourPhase(date) {
  const mm = date.getMinutes(), s = kit.secOf(date);
  return mm === 59 ? s - 60 : mm === 0 ? s : null;
}
function pose(now, date) {
  const p = {
    yaw: 15 + 4 * Math.sin(TAU * now / 13) + 1.5 * Math.sin(TAU * now / 5.3),
    pitch: 40 + 3 * Math.sin(TAU * now / 9.1 + 1),
    roll: -3 + 1.5 * Math.sin(TAU * now / 11 + 2),
    lift: 0.5 * Math.sin(TAU * now / 4.2), scale: 1, glint: -99,
  };
  const sec = kit.secOf(date);
  if (sec < 1.5) p.yaw -= 3 * Math.sin(Math.PI * sec / 1.5);           // reaction to the turn
  const u = hourPhase(date);
  if (u !== null && u > SHOW.dip && u < SHOW.still) {
    if (u < SHOW.launch) p.lift -= 1.2 * Math.sin(Math.PI * (u - SHOW.dip) / (SHOW.launch - SHOW.dip) / 2);
    else if (u < SHOW.land) {
      const a = (u - SHOW.launch) / (SHOW.land - SHOW.launch), arc = Math.sin(Math.PI * a);
      p.lift += 3 * arc - 1.2 * (1 - kit.ease.out(Math.min(1, a * 4)));
      p.scale = 1 - 0.2 * Math.sin(Math.PI * Math.min(1, a * 1.25)) ** 0.7;
      p.pitch += 14 * arc;
      p.yaw += 360 * kit.ease.inOut(kit.clamp((u - SHOW.launch) / (SHOW.spun - SHOW.launch)));
    } else {
      const b = (u - SHOW.land) / (SHOW.still - SHOW.land);
      p.lift -= 1.4 * Math.sin(Math.PI * b * 2.5) * (1 - b) ** 2;
      p.roll += 4 * Math.sin(Math.PI * b * 3) * (1 - b) ** 2;
    }
    p.glint = (u - (SHOW.land - 0.2)) / 0.8;                          // a sweep of light: solved
  }
  return p;
}

// ------------------------------------------------------------- the render
const rotA = (a, c, s, v) => (a === 0 ? [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]
  : a === 1 ? [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c] : [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]);
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const LIGHT = norm([-0.3, 0.35, 0.89]), HALF = norm([LIGHT[0], LIGHT[1], LIGHT[2] + 1]);
const JIT = Array.from({ length: NS }, (_, i) => [kit.hash(i, 1) - 0.5, kit.hash(i, 2) - 0.5, kit.hash(i, 3) - 0.5].map((x) => x * 0.22));
const SAMP = [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]];
const PX = 1.62;                                    // LEDs per cube unit, at the cube's centre
const EYE = 4000;                                    // eye distance, cube units: far, so near-orthographic and pixel-clean
const INSET = 0.24, RAD = 0.4;                     // sticker inset and corner radius, cube units (cell = 2)

const geoms = new Map();
function geom(ctx) {
  const L = ctx.layout;
  if (geoms.has(L.key)) return geoms.get(L.key);
  const b = L.bbox, pitch = L.pitch;
  const g = { X: new Float32Array(L.n), Y: new Float32Array(L.n) };
  for (const l of ctx.leds) { g.X[l.i] = (l.x - b.cx) / pitch; g.Y[l.i] = -(l.y - b.cy) / pitch; }
  geoms.set(L.key, g);
  return g;
}

/** Rigid pieces: runs of layers along the turning axis that share an angle. */
function slabsOf(cube) {
  if (cube.axis < 0) return [{ a: 0, lo: -N, hi: N, th: 0 }];
  const out = [];
  let k0 = 0;
  for (let k = 1; k <= N; k++) {
    if (k === N || cube.ang[k] !== cube.ang[k0]) { out.push({ a: cube.axis, lo: -N + 2 * k0, hi: -N + 2 * k, th: cube.ang[k0] }); k0 = k; }
  }
  return out;
}

export default {
  name: 'Speedcube',
  blurb: 'a 7x7x7 cube whose stickers are the time; changed rows half-turn each minute, tossed and re-turned on the hour',
  layouts: ['sq-2x2'], look: 'smoke', fps: 60, brightness: 0.5, dither: true,
  frame(ctx) {
    const now = ctx.date.getTime() / 1000, p = pose(now, ctx.date), cube = cubeAt(now), St = cube.S;
    const g = geom(ctx), out = ctx.out, dim = 1 - 0.7 * ctx.night;
    const y = -p.yaw * DEG, x = p.pitch * DEG, z = p.roll * DEG;
    const Q = (v) => rotA(2, Math.cos(z), Math.sin(z), rotA(0, Math.cos(x), Math.sin(x), rotA(1, Math.cos(y), Math.sin(y), v)));
    const c0 = Q([1, 0, 0]), c1 = Q([0, 1, 0]), c2 = Q([0, 0, 1]);
    const toW = (v) => [v[0] * c0[0] + v[1] * c1[0] + v[2] * c2[0], v[0] * c0[1] + v[1] * c1[1] + v[2] * c2[1], v[0] * c0[2] + v[1] * c1[2] + v[2] * c2[2]];
    const S = PX * p.scale, cy = p.lift, oC = [EYE * c0[2], EYE * c1[2], EYE * c2[2]];
    const slabs = slabsOf(cube).map((sl) => {
      const c = Math.cos(-sl.th), s = Math.sin(-sl.th), nw = [], dif = [];
      for (let f = 0; f < 6; f++) {
        const nl = [0, 0, 0]; nl[f >> 1] = f & 1 ? 1 : -1;
        const n = toW(rotA(sl.a, Math.cos(sl.th), Math.sin(sl.th), nl));
        nw.push(n); dif.push(0.28 + 0.72 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]));
      }
      return { ...sl, c, s, oo: rotA(sl.a, c, s, oC), nw, dif, dd: new Float64Array(3) };
    });
    const R2 = (S * N * 1.8) ** 2, gl = p.glint >= 0 && p.glint <= 1 ? -50 + 100 * p.glint : null;
    const H = new Float64Array(3);
    for (let i = 0; i < ctx.n; i++) {
      const X = g.X[i], Y = g.Y[i];
      out[3 * i] = out[3 * i + 1] = out[3 * i + 2] = 0;
      if (X * X + (Y - cy) ** 2 > R2) continue;
      let ar = 0, ag = 0, ab = 0;
      for (const [sx, sy] of SAMP) {
        // a ray from the eye through this point of the picture plane
        const wx = (X + sx) / S, wy = (Y - sy - cy) / S, wz = -EYE;
        const ox = wx * c0[0] + wy * c0[1] + wz * c0[2], oy = wx * c1[0] + wy * c1[1] + wz * c1[2], oz = wx * c2[0] + wy * c2[1] + wz * c2[2];
        let best = 1e9, bs = null, bf = -1;
        for (const sl of slabs) {
          const oo = sl.oo, dd = sl.dd, c = sl.c, s = sl.s;          // the ray in the slab's own frame
          if (sl.a === 0) { dd[0] = ox; dd[1] = oy * c - oz * s; dd[2] = oy * s + oz * c; }
          else if (sl.a === 1) { dd[0] = ox * c + oz * s; dd[1] = oy; dd[2] = -ox * s + oz * c; }
          else { dd[0] = ox * c - oy * s; dd[1] = ox * s + oy * c; dd[2] = oz; }
          let tn = -1e9, tf = 1e9, fa = -1, miss = false;
          for (let ax = 0; ax < 3; ax++) {
            const lo = ax === sl.a ? sl.lo : -N, hi = ax === sl.a ? sl.hi : N, dv = dd[ax], ov = oo[ax];
            if (Math.abs(dv) < 1e-9) { if (ov < lo || ov > hi) { miss = true; break; } continue; }
            let t1 = (lo - ov) / dv, t2 = (hi - ov) / dv;
            if (t1 > t2) { const q = t1; t1 = t2; t2 = q; }
            if (t1 > tn) { tn = t1; fa = ax; }
            if (t2 < tf) tf = t2;
          }
          if (!miss && tn <= tf && tn < best) { best = tn; bs = sl; bf = fa; }
        }
        if (!bs) continue;
        H[0] = bs.oo[0] + best * bs.dd[0]; H[1] = bs.oo[1] + best * bs.dd[1]; H[2] = bs.oo[2] + best * bs.dd[2];
        const h = H;
        if (bf === bs.a && Math.abs(h[bf]) < N - 1e-4) continue;          // a cut face: black plastic
        const f = bf * 2 + (bs.dd[bf] < 0 ? 1 : 0), o1 = (bf + 1) % 3, o2 = (bf + 2) % 3;
        const u = h[o1] + N, v = h[o2] + N, ci = Math.min(N - 1, Math.floor(u / 2)), cj = Math.min(N - 1, Math.floor(v / 2));
        const idx = (f * N + ci) * N + cj, n = bs.nw[f];
        const hs = 1 - INSET - RAD, qx = Math.abs(u - 2 * ci - 1) - hs, qy = Math.abs(v - 2 * cj - 1) - hs;
        const sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - RAD;
        const cov = kit.clamp(0.5 - sd * S * Math.max(0.3, n[2]) * 3);
        if (cov <= 0) continue;
        const j = JIT[idx], nd = (n[0] + j[0]) * HALF[0] + (n[1] + j[1]) * HALF[1] + (n[2] + j[2]) * HALF[2];
        let spec = nd > 0.9 ? 0.45 * nd ** 40 - 0.007 : 0;
        if (gl !== null) spec += 0.4 * Math.max(0, 1 - Math.abs((X - Y) * 0.7 - gl) / 4) ** 2;
        const col = COL[St[idx]], k = bs.dif[f] * cov, w = Math.max(0, spec) * cov;
        ar += col[0] * k + w; ag += col[1] * k + w; ab += col[2] * k + w;
      }
      const a = 0.5 * dim;
      out[3 * i] = ar * a; out[3 * i + 1] = ag * a; out[3 * i + 2] = ab * a;
    }
  },
};
