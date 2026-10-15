// Laundromat: three front-loading washers at night, side by side. The
// octagons are their round doors; the boards' shared lattice is the row of
// machines, and the necks where the doors touch are the pipes between them.
//
// The washers are an odometer. Machine 1 holds the hour as a matched pair of
// socks; machine 2 holds the tens of minutes, machine 3 the minute, each as
// one odd sock bent into the numeral (cream cuff, knitted rings, heel
// patch at the bend, a fatter toe). Each drum's water is the progress of
// its cycle: machine 3 fills over the minute, machine 2 over ten, machine 1
// over the hour; the drums rock as hard as their cycle is short.
//
// Look: bare. The clear packages are the point: each LED reads as one knit
// stitch, and the black between them is the dark of the drum.
//
// When a cycle completes the machine spins: the sock is thrown to the drum
// wall, whirls into a ring of stripes, and flops back down as the next
// numeral. A carry squirts suds through the neck to the next machine just
// before it, right to left, like an odometer. At the hour all three spin
// together, then rinse: suds flood the three doors, a ding runs round each
// rim, and the glass fogs and clears.
//
// Stateless: everything is a closed-form function of the wall clock.
import * as kit from '../js/kit.js';

const CX = [-64, 0, 64];                 // drum centres (mm)
const RW = 26;                           // drum wall radius the laundry is thrown to
const HALF = { min: 4.1, hr: 2.7 };       // half width of a sock tube (mm): two LEDs, one LED
const NMIN = 44, NHR = 40;               // points per sock polyline

// ------------------------------------------------------------- the socks
// Each numeral is ONE sock, drawn as its centreline from cuff to toe in an
// 8 x 10 box (y down). A path is a list of pieces, each a smooth spline;
// pieces meet at sharp bends, and the bend flagged `heel` gets the heel
// patch. Integer box coordinates land between LED centres, so straight
// runs light exactly two LEDs across.
const GLYPHS = {
  0: { pieces: [ellipse(4, 5, 4, 5, 2.4, -1.75, -1.75 + 2 * Math.PI - 0.38, 24)] },
  1: { pieces: [[[5, 10], [5, 0]], [[5, 0], [3.6, 1.5], [1.6, 2.8]]], heel: 0 },
  2: {
    pieces: [[[0.3, 2.8], [1.6, 0.6], [4, 0], [6.5, 0.6], [7.8, 2.7], [7.2, 4.8], [4.6, 7.1], [0, 10]], [[0, 10], [8, 10]]],
    heel: 0,
  },
  3: {
    pieces: [
      [[0.3, 1.6], [2.3, 0.2], [4.6, 0], [7, 1], [7.4, 3.1], [5.8, 4.6], [3, 5]],
      [[3, 5], [6, 5.4], [7.9, 7.4], [6.9, 9.4], [4.2, 10], [1.8, 9.8], [0.2, 8.4]],
    ],
  },
  4: { pieces: [[[6, 10], [6, 0]], [[6, 0], [0, 7]], [[0, 7], [8, 7]]], heel: 1 },
  5: {
    pieces: [
      [[7.8, 0], [1, 0]],
      [[1, 0], [0.6, 4.4]],
      [[0.6, 4.4], [3, 3.7], [6, 4.1], [7.8, 6.5], [7.3, 8.9], [4.8, 10], [2.2, 9.9], [0.2, 8.6]],
    ],
    heel: 0,
  },
  6: { pieces: [[[1.2, 5.4], [3.6, 4.2], [6.6, 4.6], [7.9, 7], [7.1, 9.1], [4, 10], [0.9, 9], [0, 6.2], [0.4, 3.2], [2.2, 0.8], [4.6, 0], [7.2, 0.6]]] },
  7: { pieces: [[[2.6, 10], [3.6, 6.6], [5.6, 3.2], [8, 0]], [[8, 0], [0, 0]]], heel: 0 },
  8: {
    pieces: [[[6.9, 2.4], [6, 0.4], [4, 0], [1.8, 0.5], [1, 2.4], [2.2, 4.2], [4, 5], [6.2, 6], [7.8, 7.8], [6.8, 9.6], [4, 10], [1.2, 9.6], [0.2, 7.8], [1.8, 6], [4, 5], [5.8, 4.1], [6.6, 3]]],
  },
  9: { pieces: [[[6.8, 4.6], [4.4, 5.8], [1.4, 5.4], [0.1, 3], [0.9, 0.9], [4, 0], [7.1, 1], [8, 3.8], [7.6, 7], [5.8, 9.4], [3, 10], [0.8, 9.4]]] },
};

// The hour pair are little socks, one LED thick, so they are drawn on the
// LEDs themselves: a 5 x 10 grid of LED centres, straight and 45-degree
// runs only, still one continuous sock from cuff to toe.
const HOUR_GLYPHS = {
  0: { pieces: [[[1, 0], [3, 0], [4, 1], [4, 8], [3, 9], [1, 9], [0, 8], [0, 1]]] },
  1: { pieces: [[[2, 9], [2, 0]], [[2, 0], [0, 2]]], heel: 0 },
  2: { pieces: [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 3], [0, 7], [0, 9]], [[0, 9], [4, 9]]], heel: 0 },
  3: { pieces: [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 3], [3, 4], [1, 4]], [[1, 4], [3, 4], [4, 5], [4, 8], [3, 9], [1, 9], [0, 8]]] },
  4: { pieces: [[[3, 9], [3, 0]], [[3, 0], [0, 3], [0, 6]], [[0, 6], [4, 6]]], heel: 1 },
  5: { pieces: [[[4, 0], [0, 0]], [[0, 0], [0, 4], [3, 4], [4, 5], [4, 8], [3, 9], [0, 9]]], heel: 0 },
  6: { pieces: [[[0, 5], [1, 4], [3, 4], [4, 5], [4, 8], [3, 9], [1, 9], [0, 8], [0, 1], [1, 0], [3, 0], [4, 1]]] },
  7: { pieces: [[[1, 9], [1, 6], [4, 3], [4, 0]], [[4, 0], [0, 0]]], heel: 0 },
  8: { pieces: [[[3, 4], [4, 3], [4, 1], [3, 0], [1, 0], [0, 1], [0, 3], [1, 4], [3, 4], [4, 5], [4, 8], [3, 9], [1, 9], [0, 8], [0, 5], [1, 4]]] },
  9: { pieces: [[[4, 4], [3, 5], [1, 5], [0, 4], [0, 1], [1, 0], [3, 0], [4, 1], [4, 8], [3, 9], [1, 9], [0, 8]]] },
};

function ellipse(cx, cy, a, b, n, t0, t1, steps) {
  const pts = [];
  for (let k = 0; k <= steps; k++) {
    const t = kit.lerp(t0, t1, k / steps), c = Math.cos(t), s = Math.sin(t);
    pts.push([cx + a * Math.sign(c) * Math.abs(c) ** (2 / n), cy + b * Math.sign(s) * Math.abs(s) ** (2 / n)]);
  }
  return pts;
}

/** Catmull-Rom through a piece's points. */
function spline(pts, per = 12) {
  if (pts.length === 2) return [pts[0], pts[1]];
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

const shapes = new Map();
/** Digit d at a size ('min' 8x10 box at 4 mm, 'hr' 5x10 LEDs): N points, arc length, heel. */
function shape(d, size) {
  const key = d + size;
  if (shapes.has(key)) return shapes.get(key);
  const hr = size === 'hr', g = hr ? HOUR_GLYPHS[d] : GLYPHS[d];
  const dense = [];
  let heelAt = -1;
  g.pieces.forEach((pc, k) => {
    const sp = hr ? pc.slice() : spline(pc);
    if (k > 0) sp.shift();
    for (const [x, y] of sp) dense.push(hr ? [(x - 2) * 4, (y - 4.5) * 4] : [(x - 4) * 4, (y - 5) * 4]);
    if (g.heel === k) heelAt = dense.length - 1;
  });
  const cum = [0];
  for (let k = 1; k < dense.length; k++) cum.push(cum[k - 1] + Math.hypot(dense[k][0] - dense[k - 1][0], dense[k][1] - dense[k - 1][1]));
  const L = cum[cum.length - 1], N = size === 'min' ? NMIN : NHR;
  const xs = new Float32Array(N), ys = new Float32Array(N);
  let j = 0;
  for (let k = 0; k < N; k++) {
    const s = (L * k) / (N - 1);
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const f = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    xs[k] = kit.lerp(dense[j][0], dense[j + 1][0], f);
    ys[k] = kit.lerp(dense[j][1], dense[j + 1][1], f);
  }
  const sh = { xs, ys, L, N, half: HALF[size], heel: heelAt >= 0 ? cum[heelAt] : -1 };
  shapes.set(key, sh);
  return sh;
}
// ------------------------------------------------------------- palette
// Warm socks against cool night water. Each machine has its own load.
const C = kit.hex;
const STYLES = [
  // machine 1, the hour: a matched pair, coral and cream rings
  { stripes: [C('#ff5034'), C('#ff5034'), C('#ffe0b0')], period: 4, cuff: C('#fff4e0'), toe: C('#ffa020'), heel: C('#ffa020') },
  // machine 2, tens of minutes: mustard with thin tomato rings
  { stripes: [C('#ffa000'), C('#ffa000'), C('#ff3010')], period: 4, cuff: C('#fff0d0'), toe: C('#ff3a20'), heel: C('#ff3a20') },
  // machine 3, the minute: bubblegum pink with cream rings
  { stripes: [C('#ff2a78'), C('#ff2a78'), C('#ffd0b0')], period: 4, cuff: C('#fff0d0'), toe: C('#ff7a00'), heel: C('#ff7a00') },
];
const DEEP = [0.0, 0.0, 0.085], SURF = [0.0, 0.14, 0.26], BUBBLE = [0.22, 0.42, 0.55];
const STEEL = [0.05, 0.058, 0.075], CHROME = [0.22, 0.25, 0.3];
const FOAM = [0.08, 0.2, 0.32], FOG = [0.04, 0.045, 0.05], DING = C('#ffd27a');
// ------------------------------------------------------------- the cycle
// A turn: the sock is thrown to the wall (0..A1), whirls (A1..A2), flops
// down as the new numeral (A2..A3). At the hour machine 1 lands first and
// the minutes follow, so the face is never blank for more than ~0.9 s.
const TIM = { A1: 0.3, A2: 0.95, A3: 1.7 };
const TIM_HOUR = [{ A1: 0.28, A2: 0.7, A3: 1.32 }, { A1: 0.3, A2: 0.82, A3: 1.5 }, TIM];
const SPIN_TURNS = (8 * Math.PI * 2) / 3;   // total extra drum angle: a multiple of the lifters' 120 deg
// wash action: each drum rocks back and forth, as hard as its cycle is short:
// machine 1 soaks (an hour), machine 2 washes (ten minutes), machine 3 rushes
const ROCK = { amp: [0.9, 1.8, 2.6], period: [12, 9, 6] };
const AGITATE = [0.12, 0.6, 1];

function digitsOf(m, d) {
  const h = d.getHours(), mi = d.getMinutes();
  return m === 0 ? [Math.floor(h / 10), h % 10] : m === 1 ? [Math.floor(mi / 10)] : [mi % 10];
}

const turns = new Map();
/** What machine m does in the minute containing epoch second `now`. */
function turnOf(m, now) {
  const M = Math.floor(now / 60) * 60, key = M * 4 + m;
  let st = turns.get(key);
  if (!st) {
    const dNew = new Date(M * 1000), dOld = new Date((M - 1) * 1000);
    const nw = digitsOf(m, dNew), old = digitsOf(m, dOld);
    const hour = dNew.getMinutes() === 0;
    const T = hour ? TIM_HOUR[m] : TIM;
    st = { M, nw, old, hour, changed: nw.some((v, k) => v !== old[k]), T, D: T.A3 + 0.2 };
    if (turns.size > 24) turns.delete(turns.keys().next().value);
    turns.set(key, st);
  }
  return st;
}

const dayT = (now) => now % 86400;
/** Drum rocking speed, -1..1. */
const rock = (m, now) => Math.cos((2 * Math.PI * dayT(now)) / ROCK.period[m] + m * 2.1);
/** The extra angle of a spin, a seconds into it. */
function spinAngle(st, a) {
  if (!st.changed || a <= 0) return 0;
  const D = st.D, x = Math.min(a, D), W = (2 * SPIN_TURNS) / D;
  return W * (x / 2 - (D / (4 * Math.PI)) * Math.sin((2 * Math.PI * x) / D));
}
function drumAngle(m, now) {
  const st = turnOf(m, now), a = now - st.M;
  return ROCK.amp[m] * Math.sin((2 * Math.PI * dayT(now)) / ROCK.period[m] + m * 2.1) + spinAngle(st, a);
}

/** Where sock j of machine m rests (its centre) and its size. */
const slot = (m, j) => (m === 0 ? { x: CX[0] + (j ? 14 : -14), size: 'hr' } : { x: CX[m], size: 'min' });

/** The rest pose of shape sh in slot (m, j), gently rocked by the wash. */
function restPose(sh, m, j, now, px, py) {
  const T = dayT(now), g = AGITATE[m], r = rock(m, now) * g, sl = slot(m, j);
  const tilt = 0.075 * r + 0.02 * g * Math.sin(T * 1.3 + j * 2 + m);
  const ox = sl.x + 1.1 * r, oy = -0.9 * r * r + 0.5 * Math.sin(T * 2.1 + m + j) * (0.3 + 0.7 * g);
  const c = Math.cos(tilt), s = Math.sin(tilt), N = sh.N;
  for (let k = 0; k < N; k++) {
    // cloth breathing: a small travelling ripple across the tube
    const k0 = Math.max(0, k - 1), k1 = Math.min(N - 1, k + 1);
    let tx = sh.xs[k1] - sh.xs[k0], ty = sh.ys[k1] - sh.ys[k0];
    const tl = Math.hypot(tx, ty) || 1;
    const w = 0.45 * g * Math.sin((k / (N - 1)) * sh.L * 0.18 - T * 3.1 + j * 1.7 + m);
    const x = sh.xs[k] - (ty / tl) * w, y = sh.ys[k] + (tx / tl) * w;
    px[k] = ox + c * x - s * y;
    py[k] = oy + s * x + c * y;
  }
}

/** The sock lying along the drum wall: cuff at angle phi0 + drum angle. */
function wallPose(m, N, phi, delta, px, py) {
  for (let k = 0; k < N; k++) {
    const a = phi + (k / (N - 1)) * delta;
    px[k] = CX[m] + RW * Math.cos(a);
    py[k] = RW * Math.sin(a);
  }
}

const tmpX = new Float32Array(64), tmpY = new Float32Array(64);
const ALPHA = [new Float32Array(64), new Float32Array(64)];
/** Points in flight between the wall and the numeral are a blur: faint. */
const flight = (w) => kit.smoothstep(0.55, 0.95, Math.abs(2 * w - 1));

/**
 * Sock j of machine m at time now: fills px/py, returns
 * { N, L, half, heel, alpha (per point, or null) }.
 */
function sockAt(m, j, now, px, py) {
  const st = turnOf(m, now), a = now - st.M, T = st.T, size = slot(m, j).size;
  const shN = shape(st.nw[j], size);
  if (!st.changed || a >= T.A3) {
    restPose(shN, m, j, now, px, py);
    if (st.changed && a < T.A3 + 0.8) {           // landing: a damped bounce
      const b = a - T.A3, dy = 1.6 * Math.exp(-6 * b) * Math.sin(13 * b);
      for (let k = 0; k < shN.N; k++) py[k] += dy;
    }
    return { N: shN.N, L: shN.L, half: shN.half, heel: shN.heel, alpha: null };
  }
  const shO = shape(st.old[j], size), N = shN.N, al = ALPHA[j];
  const dO = shO.L / RW, dN = shN.L / RW;
  // the old sock's cuff starts where it lies; the new one falls from the top
  const cO = Math.atan2(shO.ys[0], shO.xs[0] + (slot(m, j).x - CX[m]));
  const phiO = cO - drumAngle(m, st.M);
  const top = m === 0 ? -Math.PI / 2 - (j ? 0 : dN) : -Math.PI / 2 - dN / 2;
  const phiN = top - drumAngle(m, st.M + T.A2);
  const q = kit.smoothstep(T.A1, T.A2, a);
  const phi = kit.lerp(phiO, phiN, q) + drumAngle(m, now), delta = kit.lerp(dO, dN, q);
  wallPose(m, N, phi, delta, px, py);
  const L = kit.lerp(shO.L, shN.L, q);
  if (a < T.A1) {
    // thrown to the wall toe first: what is left in place is the old
    // numeral, unravelling
    const e = kit.ease.in(a / T.A1) * 0.6 + 0.4 * (a / T.A1), eT = e * 1.35, wallA = kit.lerp(0.45, 1, kit.smoothstep(0.4, 1, a / T.A1));
    restPose(shO, m, j, now, tmpX, tmpY);
    for (let k = 0; k < N; k++) {
      const w = 1 - kit.smoothstep(eT - 0.35, eT, 1 - k / (N - 1));
      px[k] = kit.lerp(tmpX[k], px[k], w); py[k] = kit.lerp(tmpY[k], py[k], w); al[k] = flight(w) * (w > 0.5 ? wallA : 1);
    }
    return { N, L, half: shN.half, heel: shO.heel, alpha: al };
  }
  if (a >= T.A2) {
    // laid down cuff first: the part already down is the new numeral, the
    // rest still rides the wall, so the digit is only ever half-drawn
    const p = (a - T.A2) / (T.A3 - T.A2), e = kit.ease.inOut(p) * 1.3, wallA = kit.lerp(1, 0.45, kit.smoothstep(0, 0.35, p));
    restPose(shN, m, j, now, tmpX, tmpY);
    for (let k = 0; k < N; k++) {
      const w = 1 - kit.smoothstep(e - 0.3, e, k / (N - 1));
      px[k] = kit.lerp(px[k], tmpX[k], w); py[k] = kit.lerp(py[k], tmpY[k], w); al[k] = flight(w) * (w < 0.5 ? wallA : 1);
    }
    return { N, L, half: shN.half, heel: shN.heel, alpha: al };
  }
  return { N, L, half: shN.half, heel: q < 0.5 ? shO.heel : shN.heel, alpha: null };
}
// ------------------------------------------------------------ geometry
const GW = 48, GH = 16;                       // the trio's one 4 mm lattice
let G = null;
function geom(ctx) {
  if (G && G.n === ctx.n) return G;
  const n = ctx.n, grid = new Int32Array(GW * GH).fill(-1);
  const lx = new Float32Array(n), r = new Float32Array(n), ang = new Float32Array(n), rim = new Float32Array(n);
  const drum = new Int8Array(n), byDrum = [[], [], []];
  const key = (gx, gy) => (gx >= 0 && gx < GW && gy >= 0 && gy < GH ? grid[gy * GW + gx] : -1);
  for (const l of ctx.leds) grid[Math.round((l.y + 30) / 4) * GW + Math.round((l.x + 94) / 4)] = l.i;
  for (const l of ctx.leds) {
    const m = l.panel, x = l.x - CX[m];
    drum[l.i] = m; lx[l.i] = x; r[l.i] = Math.hypot(x, l.y); ang[l.i] = Math.atan2(l.y, x);
    byDrum[m].push(l.i);
    const gx = Math.round((l.x + 94) / 4), gy = Math.round((l.y + 30) / 4);
    // the door's gasket: LEDs at the edge of their own board
    let edge = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const o = key(gx + dx, gy + dy);
      if (o < 0 || ctx.leds[o].panel !== m) edge = 1;
    }
    rim[l.i] = edge;
  }
  G = { n, grid, lx, r, ang, rim, drum, byDrum,
    bestD: new Float32Array(n).fill(1e9), bestS: new Float32Array(n), bestK: new Int8Array(n),
    acc: new Float32Array(3 * n), cov: new Float32Array(n), halo: new Float32Array(n), mark: new Uint8Array(n), touched: [] };
  return G;
}

/** Nearest-centreline coverage of one sock polyline into G.bestD/bestS. */
function raster(px, py, N, L, k, half) {
  const reach = half + 2.4, ds = L / (N - 1), { grid, bestD, bestS, bestK, touched } = G;
  for (let s = 0; s < N - 1; s++) {
    const ax = px[s], ay = py[s], bx = px[s + 1], by = py[s + 1];
    const x0 = Math.max(0, Math.ceil((Math.min(ax, bx) - reach + 94) / 4)), x1 = Math.min(GW - 1, Math.floor((Math.max(ax, bx) + reach + 94) / 4));
    const y0 = Math.max(0, Math.ceil((Math.min(ay, by) - reach + 30) / 4)), y1 = Math.min(GH - 1, Math.floor((Math.max(ay, by) + reach + 30) / 4));
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-9;
    for (let gy = y0; gy <= y1; gy++) {
      const yy = gy * 4 - 30;
      for (let gx = x0; gx <= x1; gx++) {
        const i = grid[gy * GW + gx];
        if (i < 0) continue;
        const xx = gx * 4 - 94;
        const t = kit.clamp(((xx - ax) * dx + (yy - ay) * dy) / l2);
        const d = Math.hypot(xx - ax - t * dx, yy - ay - t * dy);
        if (d < reach && d < bestD[i]) {
          if (bestD[i] >= 1e9) touched.push(i);
          bestD[i] = d; bestS[i] = (s + t) * ds; bestK[i] = k;
        }
      }
    }
  }
}

/** Colour of a sock at arc length s (mm from the cuff). */
function sockColour(st, s, L, heel) {
  if (s < 7) return st.cuff;
  if (L - s < 7) return st.toe;
  if (heel >= 0 && Math.abs(s - heel) < 4.5) return st.heel;
  const n = st.stripes.length, b = Math.floor((s - 7) / st.period);
  return st.stripes[((b % n) + n) % n];
}
// ------------------------------------------------------------- drawing
const SHUTTER = 1 / 40;                        // motion blur window for fast laundry
const PX = [new Float32Array(64), new Float32Array(64)], PY = [new Float32Array(64), new Float32Array(64)];

/** Blur samples for machine m now: more when the drum or the sock moves fast. */
function samples(m, now) {
  const st = turnOf(m, now), a = now - st.M;
  if (!st.changed || a > st.T.A3 + 0.05) return 1;
  const w = Math.abs(drumAngle(m, now) - drumAngle(m, now - 0.01)) / 0.01;
  return Math.max(2, Math.min(7, Math.ceil((w * SHUTTER * RW) / 2.2)));
}

/** Cycle progress of machine m (0..1), which is its water level. */
function waterLevel(m, now) {
  const st = turnOf(m, now), a = now - st.M, mi = new Date(st.M * 1000).getMinutes();
  const p = m === 2 ? a / 60 : m === 1 ? ((mi % 10) + a / 60) / 10 : (mi + a / 60) / 60;
  return st.changed ? Math.max(p, 1 - kit.smoothstep(0, 0.9, a)) : p;
}

function drawDrum(ctx, m, now, K) {
  const { out, leds } = ctx, T = dayT(now), st = turnOf(m, now), a = now - st.M;
  const r = rock(m, now), spin = st.changed && a < st.D ? Math.sin((Math.PI * Math.min(a, st.D)) / st.D) : 0;
  const level = waterLevel(m, now), sy = 31 - level * 46;
  const slope = 0.12 * r, amp = 0.7 + 2.2 * spin;
  for (const i of G.byDrum[m]) {
    const x = G.lx[i], y = leds[i].y;
    let R = 0, Gc = 0, B = 0;
    const surf = sy + slope * x + amp * (0.7 * Math.sin(0.28 * x - 2.3 * T + m) + 0.4 * Math.sin(0.47 * x + 1.7 * T + 2 * m));
    const depth = y - surf;
    if (depth > -3) {
      const cov = kit.smoothstep(-2, 2, depth), ca = kit.noise2(x * 0.13 + T * 0.45, y * 0.13 - T * 0.3);
      const body = cov * (0.35 + 1.4 * ca * ca * ca) * (1 - 0.35 * kit.clamp(depth / 30)), gl = Math.exp(-((depth / 1.9) ** 2)) * (0.55 + 0.6 * ca);
      R = DEEP[0] * body + SURF[0] * gl; Gc = DEEP[1] * body + SURF[1] * gl; B = DEEP[2] * body + SURF[2] * gl;
    }
    if (G.rim[i]) {
      // the door gasket, with the room's window caught top-left in its chrome
      const h = Math.max(0, Math.cos(G.ang[i] + 2.3)) ** 6;
      R += STEEL[0] + CHROME[0] * h; Gc += STEEL[1] + CHROME[1] * h; B += STEEL[2] + CHROME[2] * h;
    }
    out[3 * i] = R; out[3 * i + 1] = Gc; out[3 * i + 2] = B;
  }
  // the drum's three lifters ride round with it
  for (let s = 0; s < K; s++) {
    const ph = drumAngle(m, now - (SHUTTER * s) / K);
    for (let k = 0; k < 3; k++) {
      const an = ph + (k * 2 * Math.PI) / 3;
      kit.splat(ctx, CX[m] + 25.5 * Math.cos(an), 25.5 * Math.sin(an), 3.4, [0.07, 0.08, 0.1], 1 / K);
    }
  }
  // bubbles rising through the water
  for (let b = 0; b < 7; b++) {
    const sp = 6 + 6 * kit.hash(b, m, 1), per = 52 / sp, ph = kit.hash(b, m, 2);
    const y = 30 - kit.fract(T / per + ph) * 52;
    const x = CX[m] + (kit.hash(b, m, 3) - 0.5) * 40 + 1.6 * Math.sin(T * 2.3 + b * 1.7);
    const surf = sy + slope * (x - CX[m]);
    const al = kit.smoothstep(0.5, 4, y - surf);
    if (al > 0) kit.splat(ctx, x, y, 2.2 + 0.8 * kit.hash(b, m, 4), BUBBLE, al * 0.8);
  }
}

function drawSocks(ctx, m, now, K) {
  const out = ctx.out, style = STYLES[m], nS = m === 0 ? 2 : 1;
  const { acc, cov, halo, mark, bestD, bestS, bestK, touched } = G;
  const list = [];
  for (let s = 0; s < K; s++) {
    const ts = now - (SHUTTER * s) / K, infos = [];
    for (let j = 0; j < nS; j++) { infos.push(sockAt(m, j, ts, PX[j], PY[j])); raster(PX[j], PY[j], infos[j].N, infos[j].L, j, infos[j].half); }
    for (const i of touched) {
      const d = bestD[i], f = infos[bestK[i]];
      // the toe is a little fatter: it is a foot
      const hw = f.half + (f.half > 3 ? 1.3 * kit.smoothstep(9, 3, f.L - bestS[i]) : 0);
      let c = (1 - kit.smoothstep(hw - 1.5, hw + 1.2, d)) / K;
      let hl = (1 - kit.smoothstep(hw + 1.0, hw + 2.4, d)) / K;
      if (f.alpha) { const u = (bestS[i] / f.L) * (f.N - 1), k0 = Math.min(f.N - 2, Math.floor(u)), al = kit.lerp(f.alpha[k0], f.alpha[k0 + 1], u - k0); c *= al; hl *= al; }
      if (!mark[i] && hl > 0) { mark[i] = 1; list.push(i); }
      halo[i] += hl;
      if (c <= 0) { bestD[i] = 1e9; continue; }
      const col = sockColour(style, bestS[i], f.L, f.heel), sh = 0.72 + 0.28 * (1 - Math.min(1, (d / hw) ** 2));
      cov[i] += c; acc[3 * i] += col[0] * sh * c; acc[3 * i + 1] += col[1] * sh * c; acc[3 * i + 2] += col[2] * sh * c;
      bestD[i] = 1e9;
    }
    touched.length = 0;
  }
  for (const i of list) {
    // a clear dark margin round the sock keeps it off the water
    const c = Math.min(1, cov[i]), keep = (1 - c) * (1 - 0.85 * Math.min(1, halo[i]));
    for (let ch = 0; ch < 3; ch++) { out[3 * i + ch] = out[3 * i + ch] * keep + acc[3 * i + ch]; acc[3 * i + ch] = 0; }
    cov[i] = 0; halo[i] = 0; mark[i] = 0;
  }
}
/** A carry: a squirt of suds through the neck from machine b+1 into b. */
function drawCarry(ctx, b, q) {
  if (q <= 0 || q >= 1) return;
  const x0 = CX[b + 1] - 10, x1 = CX[b] + 12, e = kit.ease.inOut(q);
  for (let k = 0; k < 11; k++) {
    const u = e - k * 0.04;
    if (u < 0 || u > 1) continue;
    const x = kit.lerp(x0, x1, u), y = 2.2 * Math.sin(u * 19 + k) + (k % 2 ? 1.2 : -1.2);
    const al = Math.min(1, 2.5 * Math.sin(Math.PI * u)) * (1 - k / 12);
    kit.splat(ctx, x, y, 3.6 - 0.15 * k, [0.55, 0.9, 1.1], 1.3 * al);
  }
}

/** The hour's rinse: suds flood the doors, a ding runs round each rim, the glass fogs and clears. */
function drawBubbles(ctx, h) {
  const { out, leds } = ctx;
  if (h < 0.9 || h > 6) return;
  // rinse: big soap bubbles rise through each door, wobble, and pop
  for (let m = 0; m < 3; m++) {
    for (let b = 0; b < 7; b++) {
      const t0 = 1.0 + 0.32 * b + 0.25 * kit.hash(b, m, 7), life = 1.5 + 0.7 * kit.hash(b, m, 8), u = (h - t0) / life;
      if (u < 0 || u > 1.12) continue;
      const R = 5 + 3.5 * kit.hash(b, m, 9);
      const x = CX[m] + (kit.hash(b, m, 10) - 0.5) * 30 + 3 * Math.sin(h * 2.6 + b);
      const y = kit.lerp(32 + R, -14 - 10 * kit.hash(b, m, 11), kit.ease.out(Math.min(u, 1)));
      const pop = kit.smoothstep(1, 1.12, u), r = R * (0.75 + 0.25 * Math.min(1, u * 4)) * (1 + 0.6 * pop);
      const k = Math.min(1, u * 6) * (1 - pop);
      for (const i of ctx.layout.index.near(x, y, r + 3)) {
        const d = Math.hypot(leds[i].x - x, leds[i].y - y), ring = Math.exp(-(((d - r) / 1.5) ** 2));
        const hl = Math.exp(-((Math.hypot(leds[i].x - x + 0.45 * r, leds[i].y - y + 0.45 * r) / 2.2) ** 2));
        const v = k * (0.7 * ring + 0.6 * hl);
        out[3 * i] += FOAM[0] * v; out[3 * i + 1] += FOAM[1] * v; out[3 * i + 2] += FOAM[2] * v;
      }
    }
  }
}

function drawRinse(ctx, h) {
  const { out, leds } = ctx;
  if (h < 3 || h > 9) return;
  const fogOn = kit.smoothstep(3.6, 4.1, h), clear = ((h - 4.3) / 2.2) * 40;
  for (let i = 0; i < ctx.n; i++) {
    const y = leds[i].y, x = leds[i].x;
    if (fogOn > 0) {
      const edge = clear + 6 * (kit.noise2(x * 0.15, y * 0.15) - 0.5);
      const f = fogOn * kit.smoothstep(edge - 4, edge + 4, G.r[i]) * (G.rim[i] ? 0.4 : 1);
      if (f > 0) for (let ch = 0; ch < 3; ch++) out[3 * i + ch] = out[3 * i + ch] * (1 - 0.3 * f) + FOG[ch] * f;
    }
    if (G.rim[i]) {
      // ding: a glint runs once round each door, left to right
      const m = G.drum[i], u = (h - 3.4 - 0.18 * m) / 0.75;
      if (u > -0.3 && u < 1.4) {
        const head = -Math.PI / 2 + 2 * Math.PI * kit.ease.out(kit.clamp(u));
        let d = G.ang[i] - head; d = Math.atan2(Math.sin(d), Math.cos(d));
        const tail = d < 0 ? Math.exp(d * 2.2) : Math.exp(-d * d * 30);
        const k = Math.max(0, Math.min(1, u * 4, (1.4 - u) * 3)) * tail + 0.5 * Math.exp(-((u - 1.05) ** 2) * 40);
        for (let ch = 0; ch < 3; ch++) out[3 * i + ch] += DING[ch] * 0.7 * k;
      }
    }
  }
}

export default {
  name: 'Laundromat',
  blurb: 'three washers at night: socks bent into the time, water is the cycle, every minute a spin',
  layouts: ['oct-trio'], look: 'bare', fps: 60, brightness: 0.55, dither: true,
  frame(ctx) {
    geom(ctx);
    const now = ctx.date.getTime() / 1000;
    const K = [0, 1, 2].map((m) => samples(m, now));
    for (let m = 0; m < 3; m++) drawDrum(ctx, m, now, K[m]);
    const h0 = turnOf(0, now), hourShow = h0.hour && h0.changed;
    if (hourShow) drawBubbles(ctx, now - h0.M);
    for (let m = 0; m < 3; m++) drawSocks(ctx, m, now, K[m]);
    // carries run right to left, just before the turn they cause
    const st = turnOf(2, now), sec = now - st.M, mi = new Date(st.M * 1000).getMinutes();
    if (mi === 59) { drawCarry(ctx, 1, (sec - 58.3) / 0.9); drawCarry(ctx, 0, (sec - 59.1) / 0.9); }
    else if (mi % 10 === 9) drawCarry(ctx, 1, (sec - 59.1) / 0.9);
    if (hourShow) drawRinse(ctx, now - h0.M);
    const dim = 1 - 0.6 * ctx.night;
    if (dim < 1) for (let k = 0; k < ctx.out.length; k++) ctx.out[k] *= dim;
  },
};
