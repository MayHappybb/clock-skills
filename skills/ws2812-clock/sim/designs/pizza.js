// Pizzeria: the six triangles are six slices of a hot pizza. The board gaps
// are the cuts, the hole in the middle is where the slices meet. The time is
// laid on it in toppings, one digit per slice: hours in pepperoni on the top
// two slices, minutes in basil leaves on the bottom two; the side slices just
// have olives. Cheese bubbles and pops, the crust shimmers, steam drifts, and
// white mice keep poking their noses in at the edge.
//
// Minute: the mouse who owns the ones slice (and at :x0 his sister, on the
// tens) creeps up, sinks his teeth into the crust and yanks the slice out of
// the pizza. Cheese strings stretch across the cut and snap; the leaves slide
// off into a heap at the tip; the slice slips out of his teeth, snaps back,
// and the leaves skid out into the next digit. He tumbles and runs.
// Hour: the pizzaiolo tosses the pie. It spins once and rises toward you
// (it grows past the crust), toppings are flung out and land as the new
// time; the mice, who were waiting for their minute, bolt.
//
// Look: opal at 3.5 mm. The diffuser turns each LED into a soft disc, so
// cheese reads as a surface and pepperoni as round slices rather than pixels,
// but it is close enough that the board gaps stay dark lines: the cuts.
//
// Stateless: every topping, bubble and mouse is a function of the clock;
// the only caches are glyph tables and topping matchings keyed by digit.
import * as kit from '../js/kit.js';

const DEG = Math.PI / 180;
const R_PIZZA = 56, CRUST_IN = 49;            // round pizza on the hexagonal board
const AXIS = [0, 1, 2, 3, 4, 5].map((k) => [Math.cos(k * 60 * DEG), Math.sin(k * 60 * DEG)]);

// palette (linear light)
// set in linear light, channel by channel: no stray 1/255 blues to shift hue at the dim end
const CHEESE_LO = [0.1, 0.045, 0], CHEESE_HI = [0.23, 0.11, 0];
const BROWN = [0.08, 0.036, 0];
const SAUCE = [0.1, 0.012, 0];
const CRUST = [0.3, 0.075, 0], CHAR = [0.1, 0.022, 0];
const PEP = [0.62, 0.012, 0], PEP_RIM = [0.38, 0.005, 0], GREASE = kit.hex('#ffb070');
const BASIL = [0.012, 0.32, 0.006], VEIN = kit.hex('#a8ff60');
const STRING = kit.hex('#ffe070');
const OLIVE = [0, 0, 0], MUSH = kit.scale(kit.hex('#ffe2b0'), 0.16);
// the side slices (0, 3) carry no time: just what a pizza has on it
const SCATTER = [
  [0, 'olive', 33, -9], [0, 'olive', 23, 4], [0, 'olive', 40, 6], [0, 'mush', 30, -1, 0.4],
  [3, 'olive', -25, -5], [3, 'olive', -38, 7], [3, 'olive', -40, -7], [3, 'mush', -30, 2, 2.0],
];
const STEAM = [0.06, 0.055, 0.045];
const FUR = [0.4, 0.38, 0.44], PINK = kit.hex('#ff6088'), EYE = [0, 0, 0];

// ------------------------------------------------------------------ the type
// Each digit is a few hand-drawn paths in a 4 x 6 box. Toppings are laid
// along them at even spacing, the same count in every digit of a kind, so a
// minute turn is pure motion: every leaf skids to a place in the next digit.
const arc = (cx, cy, rx, ry, a0, a1, n = 24) => Array.from({ length: n + 1 }, (_, i) => {
  const a = (a0 + (a1 - a0) * i / n) * DEG; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
});
const bez = (p0, p1, p2, n = 16) => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n, u = 1 - t; return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
});
const flip = (paths) => paths.map((p) => p.map(([x, y]) => [4 - x, 6 - y]));

const SIX = [[...bez([3.6, 0.3], [0.2, 0.5], [0.12, 4.1]), ...arc(2.05, 4.15, 1.93, 1.78, 180, 520).slice(1)]];
const PATHS = {
  0: [arc(2, 3, 1.95, 2.95, -90, 270, 40)],
  1: [[[0.6, 1.5], [2.3, 0], [2.3, 5.1]], [[0.7, 6], [3.9, 6]]],
  2: [[...arc(2, 1.85, 1.85, 1.75, 195, 370), ...bez([3.8, 2.4], [2.6, 3.9], [0.1, 6]).slice(1), [4, 6]]],
  3: [[...arc(1.9, 1.5, 1.75, 1.45, 210, 450), ...arc(1.9, 4.35, 1.95, 1.6, 270, 510).slice(1)]],
  4: [[[3.1, 6], [3.1, 0], [0, 4.2], [4, 4.2]]],
  5: [[[3.9, 0], [0.55, 0], ...arc(1.95, 4.15, 1.95, 1.8, 215, 500)]],
  6: SIX,
  7: [[[0, 0], [4, 0], ...bez([4, 0], [2.2, 2.2], [1.4, 6]).slice(1)]],
  8: [arc(2, 1.45, 1.6, 1.4, 90, 450), arc(2, 4.4, 1.95, 1.6, -90, 270)],
  9: flip(SIX),
};

/** Points along the digit's paths: N in all, or (spacing given) as many as fit that pitch. */
function sample(paths, N, spacing = 0) {
  const info = paths.map((p) => {
    const segs = [];
    for (let i = 0; i + 1 < p.length; i++) {
      const [ax, ay] = p[i], [bx, by] = p[i + 1], len = Math.hypot(bx - ax, by - ay);
      if (len > 1e-6) segs.push({ ax, ay, bx, by, len });
    }
    const len = segs.reduce((a, s) => a + s.len, 0);
    const closed = Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) < 1e-3;
    return { segs, len, closed };
  });
  if (spacing) for (const q of info) q.n = Math.max(2, Math.round(q.len / spacing) + (q.closed ? 0 : 1));
  else {
    // N shared out by length: open paths carry both ends, so they need one more
    const tot = info.reduce((a, q) => a + q.len, 0);
    info.forEach((q) => { q.n = Math.max(2, Math.round((N * q.len) / tot)); });
    const sum = () => info.reduce((a, q) => a + q.n, 0);
    while (sum() > N) info.reduce((m, q) => (q.len / q.n < m.len / m.n ? q : m)).n--;
    while (sum() < N) info.reduce((m, q) => (q.len / q.n > m.len / m.n ? q : m)).n++;
  }
  const out = [];
  for (const q of info) {
    for (let j = 0; j < q.n; j++) {
      let d = (q.len * j) / (q.closed ? q.n : q.n - 1);
      for (const s of q.segs) {
        if (d <= s.len + 1e-9) { const f = d / s.len; out.push({ x: s.ax + (s.bx - s.ax) * f, y: s.ay + (s.by - s.ay) * f, a: Math.atan2(s.by - s.ay, s.bx - s.ax) }); break; }
        d -= s.len;
      }
    }
  }
  return out;
}

// toppings in mm, relative to the digit's centre
const KIND = {
  pep: { n: 16, u: 4.4, r: 3.4 },                // pepperoni: 16 slices a digit, shingled
  leaf: { n: 15, u: 4.3, len: 4.3, wid: 2.0 },   // basil: 15 leaves a digit, laid nose to tail
};
const GLYPH = { pep: [], leaf: [] };
for (let d = 0; d < 10; d++) {
  // laid by hand: each topping a little off the line, each leaf a little askew
  for (const [ki, k] of ['pep', 'leaf'].entries()) GLYPH[k][d] = sample(PATHS[d], KIND[k].n).map((p, j) => ({
    x: (p.x - 2) * KIND[k].u + 0.9 * (kit.hash(d, j, ki * 2) - 0.5), y: (p.y - 3) * KIND[k].u + 0.9 * (kit.hash(d, j, ki * 2 + 1) - 0.5),
    a: p.a + 0.5 * (kit.hash(d, j, 9) - 0.5) }));
}

// ---------------------------------------------------------------- matching
/** Minimum-cost assignment (Hungarian): returns col[row]. */
function assign(cost) {
  const n = cost.length, INF = 1e18;
  const u = new Float64Array(n + 1), v = new Float64Array(n + 1), p = new Int32Array(n + 1), way = new Int32Array(n + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i; let j0 = 0;
    const minv = new Float64Array(n + 1).fill(INF), used = new Uint8Array(n + 1);
    do {
      used[j0] = 1; const i0 = p[j0]; let delta = INF, j1 = 0;
      for (let j = 1; j <= n; j++) if (!used[j]) {
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const ans = new Array(n);
  for (let j = 1; j <= n; j++) ans[p[j] - 1] = j - 1;
  return ans;
}
const moves = new Map();
/**
 * For kind k, digit a -> b: mv[i] is the topping of b that topping i of a
 * becomes, or -1 if it is flung off the pizza; extra lists b's toppings that
 * fly in from outside (pepperoni counts differ between digits).
 */
function moveOf(k, a, b) {
  const key = k + a + b;
  if (!moves.has(key)) {
    const A = GLYPH[k][a], B = GLYPH[k][b], n = Math.max(A.length, B.length), LOST = 260;
    const cost = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) =>
      (i < A.length && j < B.length ? (A[i].x - B[j].x) ** 2 + (A[i].y - B[j].y) ** 2 : LOST)));
    const col = assign(cost), mv = A.map((_, i) => (col[i] < B.length ? col[i] : -1));
    const used = new Set(mv), extra = B.map((_, j) => j).filter((j) => !used.has(j));
    moves.set(key, { mv, extra });
  }
  return moves.get(key);
}

// ------------------------------------------------------------------ layout
// one digit per slice: hours on the top two (4, 5), minutes on the bottom two (2, 1)
const SLOTS = [
  { slice: 4, cx: -12.6, cy: -29.5, kind: 'pep' },
  { slice: 5, cx: 12.6, cy: -29.5, kind: 'pep' },
  { slice: 2, cx: -12.6, cy: 29.5, kind: 'leaf' },
  { slice: 1, cx: 12.6, cy: 29.5, kind: 'leaf' },
];
const digitsAt = (s) => { const d = new Date(s * 1000), h = d.getHours(), m = d.getMinutes(); return [Math.floor(h / 10), h % 10, Math.floor(m / 10), m % 10]; };

// timings (seconds after the minute)
const TUG = 6.5;                       // mm the mouse pulls a slice out
const PILE = [0.05, 0.55], SPREAD = [0.95, 0.75], STAG = 0.025;   // leaves: slide to the tip, then out to the new digit
const TOSS = 3.0;                      // the hour's spin
const FLY = { pep: [0.8, 0.75], leaf: [1.15, 0.75] };  // start, duration of a topping's flight

function tugAmount(age) {
  if (age < 0 || age > 1.7) return 0;
  if (age < 0.4) return kit.ease.out(age / 0.4);
  if (age < 1.0) { const w = (age - 0.4) / 0.6; return 1 + 0.07 * Math.sin(w * 10) * (1 - w); }
  return 1 - kit.ease.outBack((age - 1.0) / 0.6);
}

/** Pizza-space toppings of slot s at this instant: [{ x, y, a, z }] (z: height, 0 = lying on the cheese). */
function toppings(s, T) {
  const S = SLOTS[s], K = S.kind, cur = T.cur[s], prev = T.prev[s];
  const G = GLYPH[K][cur];
  const at = (P) => P.map((p) => ({ x: S.cx + p.x, y: S.cy + p.y, a: p.a, z: 0 }));
  if (prev === cur) return at(G);
  const A = GLYPH[K][prev], { mv, extra } = moveOf(K, prev, cur);
  const out = [];
  if (T.hour && T.age < TOSS + 0.5) {
    const [f0, fd] = FLY[K];
    // flung out toward the crust, slipping back against the spin, landing in place
    const fling = (p, q, j, e) => {
      let x = kit.lerp(p.x, q.x, e), y = kit.lerp(p.y, q.y, e);
      const r = Math.hypot(x, y) || 1, lift = Math.sin(Math.PI * e), o = Math.max(0, 44 - r) * 0.85 * lift;
      x += (x / r) * o; y += (y / r) * o;
      const sl = -0.8 * lift, c = Math.cos(sl), sn = Math.sin(sl);
      out.push({ x: x * c - y * sn, y: x * sn + y * c, a: kit.lerp(p.a, q.a, e) + 6 * lift, z: lift });
    };
    const ab = (p) => ({ x: S.cx + p.x, y: S.cy + p.y, a: p.a });
    const away = (p, j) => { const x = S.cx + p.x, y = S.cy + p.y, r = Math.hypot(x, y) || 1, ang = Math.atan2(y, x) - 0.9 - 0.15 * (j % 3);
      return { x: Math.cos(ang) * 80, y: Math.sin(ang) * 80, a: p.a }; };
    A.forEach((p, j) => {
      const e = kit.ease.inOut(kit.clamp((T.age - f0 - j * 0.025) / fd));
      if (mv[j] >= 0) fling(ab(p), ab(G[mv[j]]), j, e);
      else if (e < 1) { const q = away(p, j), ee = kit.ease.in(e); out.push({ x: kit.lerp(S.cx + p.x, q.x, ee), y: kit.lerp(S.cy + p.y, q.y, ee), a: p.a + 5 * e, z: Math.sin(Math.PI * e * 0.5) }); }
    });
    extra.forEach((jb, n) => {
      const e = kit.ease.inOut(kit.clamp((T.age - f0 - 0.1 - n * 0.05) / fd)), q = ab(G[jb]), f = away(G[jb], n + 1), ee = kit.ease.out(e);
      if (e > 0) out.push({ x: kit.lerp(f.x, q.x, ee), y: kit.lerp(f.y, q.y, ee), a: q.a - 5 * (1 - e), z: Math.sin(Math.PI * (0.5 + e * 0.5)) });
    });
    return out;
  }
  if (!T.hour && T.age < SPREAD[0] + SPREAD[1] + STAG * 16) {
    // the slice is yanked out from under the leaves: they slide down to its tip
    // in a heap; when it snaps back they skid out again, into the new digit
    const r0 = Math.hypot(S.cx, S.cy), hx = S.cx * (1 - 10 / r0), hy = S.cy * (1 - 10 / r0);
    A.forEach((p, j) => {
      const q = G[mv[j]], ang = kit.hash(j, prev * 10 + cur, 5) * kit.TAU, rad = 1.5 + 4.5 * kit.hash(j, prev, 6);
      const pile = { x: hx + Math.cos(ang) * rad, y: hy + Math.sin(ang) * rad * 0.7, a: p.a + 2 * (kit.hash(j, 9) - 0.5) };
      const e1 = kit.ease.inOut(kit.clamp((T.age - PILE[0] - j * STAG) / PILE[1]));
      const e2 = kit.ease.inOut(kit.clamp((T.age - SPREAD[0] - j * STAG) / SPREAD[1]));
      const from = { x: S.cx + p.x, y: S.cy + p.y, a: p.a }, to = { x: S.cx + q.x, y: S.cy + q.y, a: q.a };
      const a0 = e2 > 0 ? pile : from, a1 = e2 > 0 ? to : pile, e = e2 > 0 ? e2 : e1;
      let da = a1.a - a0.a; da -= Math.PI * Math.round(da / Math.PI);       // a leaf is the same either way round
      out.push({ x: kit.lerp(a0.x, a1.x, e), y: kit.lerp(a0.y, a1.y, e), a: a0.a + da * e, z: 0.2 * Math.sin(Math.PI * e) });
    });
    return out;
  }
  return at(G);
}

// ------------------------------------------------------------------- mouse
const lerp2 = (a, b, e) => [kit.lerp(a[0], b[0], e), kit.lerp(a[1], b[1], e)];
const polar = (deg, r) => [Math.cos(deg * DEG) * r, Math.sin(deg * DEG) * r];
// each minute slice has its own mouse, who works it from the crust (never on a seam,
// where there are no LEDs): the ones mouse every minute, his sister on the tens
const MOUSE_AT = { 1: 67, 2: 113 };

/** One mouse working slice k this minute: { p, h, run, sniff } or null. */
function mouseFor(T, k, delay) {
  const { now } = T, deg = MOUSE_AT[k];
  const grab = polar(deg, 50), peek = polar(deg, 58), home = polar(deg, 84);
  const h0 = (deg + 180) * DEG, back = [Math.cos(deg * DEG), Math.sin(deg * DEG)];
  const age = T.age;
  if (age > 53 && T.next[k === 1 ? 3 : 2] !== T.cur[k === 1 ? 3 : 2]) {        // the approach
    const a = age - 60 + delay;
    if (a < -6) return null;
    if (a < -4) return { p: lerp2(home, peek, kit.ease.out((a + 6) / 2)), h: h0, run: 1 };
    // sniffing at the edge, eased in and out of so nothing jumps
    const w = kit.smoothstep(-4, -3.3, a) * (1 - kit.smoothstep(-1.3, -0.6, a));
    const sn = 0.5 + 0.5 * Math.sin(now * 2.3 + k), at = lerp2(peek, grab, kit.ease.inOut(kit.clamp((a + 0.6) / 0.6)));
    return { p: [at[0] - back[0] * 1.5 * sn * w, at[1] - back[1] * 1.5 * sn * w], h: h0 + 0.4 * Math.sin(now * 1.7 + k) * w, run: a > -0.6 ? 1 : 0, sniff: w };
  }
  const slot = k === 1 ? 3 : 2;
  if (T.prev[slot] === T.cur[slot]) return null;
  if (T.hour) {                                           // the pizza takes off: they bolt
    if (age < 1.1) return { p: lerp2(grab, home, kit.ease.in(age / 1.1)), h: kit.lerp(h0, h0 + Math.PI, kit.ease.inOut(Math.min(1, age / 0.45))), run: 2 };
    return null;
  }
  const off = T.off[k];
  if (age < 1.0) {                                        // teeth in the crust, leaning back
    const lean = Math.sin(age * 14 + k) * 0.7 * kit.clamp(age / 0.2);
    return { p: [grab[0] + off[0] + back[0] * lean, grab[1] + off[1] + back[1] * lean], h: h0 + 0.12 * Math.sin(age * 9), run: 0.6 };
  }
  if (age < 1.5) {                                        // it slips out of his teeth: he tumbles back
    const e = kit.ease.out((age - 1.0) / 0.5), o = TUG * (1 - 0.3 * e) + 6 * e;
    return { p: [grab[0] + back[0] * o, grab[1] + back[1] * o], h: h0 + 1.1 * Math.sin(e * Math.PI) * (k === 1 ? 1 : -1), run: 0 };
  }
  if (age < 2.9) {
    const e = (age - 1.5) / 1.4, st = [grab[0] + back[0] * (TUG * 0.7 + 6), grab[1] + back[1] * (TUG * 0.7 + 6)];
    return { p: lerp2(st, home, kit.ease.in(e)), h: kit.lerp(h0, h0 + Math.PI, kit.ease.out(Math.min(1, e * 3))), run: 2 };
  }
  return null;
}

/** All the mice in the frame. */
function mice(T) {
  const out = [];
  for (const [k, delay] of [[1, 0], [2, 0.5]]) { const m = mouseFor(T, k, delay); if (m) out.push(m); }
  // mid-minute, one of them pokes his nose in from some other edge
  const { age, now } = T;
  if (age > 22 && age < 31) {
    const n = Math.floor(now / 60), deg = Math.floor(kit.hash(n, 7) * 6) * 60 + (kit.hash(n, 8) - 0.5) * 30;
    const a = age - 22, r = a < 1.2 ? kit.lerp(80, 55, kit.ease.out(a / 1.2)) : a < 7.6 ? 55 - 1.5 * (0.5 + 0.5 * Math.sin(a * 2.1)) : kit.lerp(55, 80, kit.ease.in((a - 7.6) / 1.4));
    out.push({ p: polar(deg, r), h: (deg + 180) * DEG + 0.3 * Math.sin(a * 1.4), run: a < 1.2 || a > 7.6 ? 1 : 0, sniff: 1 });
  }
  return out;
}

function drawMouse(ctx, m, now) {
  const [x, y] = m.p, ch = Math.cos(m.h), sh = Math.sin(m.h);
  const wig = now * (m.run ? 14 : 4), tail = [];
  for (let k = 0; k <= 9; k++) {
    const u = -7 - 2.3 * k, v = Math.sin(k * 0.7 - wig) * k * 0.4;
    tail.push([x + ch * u - sh * v, y + sh * u + ch * v]);
  }
  const twitch = (m.sniff ?? 0) * 0.6 * Math.sin(now * 23), bob = m.run ? 0.5 * Math.sin(now * 30) : 0;
  for (const i of ctx.layout.index.near(x, y, 26)) {
    const l = ctx.leds[i], dx = l.x - x, dy = l.y - y;
    const u = dx * ch + dy * sh, v = -dx * sh + dy * ch + bob;
    // body: a fat teardrop, nose forward
    const uc = kit.clamp(u, -6.5, 5.5), r = kit.lerp(5.4, 2.0, (uc + 6.5) / 12);
    const body = 1 - kit.smoothstep(-0.9, 1.0, Math.hypot(u - uc, v) - r);
    const ear = Math.max(1 - kit.smoothstep(0.8, 2.8, Math.hypot(u - 2.2, v - 4.3)), 1 - kit.smoothstep(0.8, 2.8, Math.hypot(u - 2.2, v + 4.3)));
    const nose = 1 - kit.smoothstep(0, 1.8, Math.hypot(u - 8 - twitch, v));
    let tl = 0;
    for (let k = 0; k + 1 < tail.length; k++) tl = Math.max(tl, (1 - kit.smoothstep(0.3, 1.5, kit.segDist(l.x, l.y, ...tail[k], ...tail[k + 1]))) * (1 - k / 10));
    if (tl > 0) kit.over(ctx, i, kit.scale(PINK, 0.3), tl * 0.85);
    if (body > 0) kit.over(ctx, i, kit.scale(FUR, 0.75 + 0.5 * kit.clamp((u + 6.5) / 12)), body);
    if (ear > 0) kit.over(ctx, i, kit.scale(PINK, 0.42), ear * 0.95);
    if (nose > 0) kit.add(ctx, i, PINK, nose * 0.4);
    const eye = Math.max(1 - kit.smoothstep(0.2, 1.4, Math.hypot(u - 4.2, v - 1.9)), 1 - kit.smoothstep(0.2, 1.4, Math.hypot(u - 4.2, v + 1.9)));
    if (eye > 0) kit.over(ctx, i, EYE, eye * 0.85);
  }
}

// --------------------------------------------------------------- the pizza
function cheese(px, py, tod) {
  const r = Math.hypot(px, py);
  if (r > R_PIZZA + 1.2) return null;
  const th = Math.atan2(py, px);
  const c = kit.fbm(px * 0.085, py * 0.085, tod * 0.12, 2);
  let col = kit.mix(CHEESE_LO, CHEESE_HI, c * c);
  const b = kit.smoothstep(0.62, 0.8, kit.noise2(px * 0.16 + 31, py * 0.16 - 7));
  col = kit.mix(col, BROWN, 0.75 * b);
  const sauce = kit.smoothstep(45, 48.5, r) * (0.6 + 0.4 * kit.noise2(th * 9, 3.3));
  col = kit.mix(col, SAUCE, 0.7 * sauce);
  const k = kit.smoothstep(CRUST_IN - 1, CRUST_IN + 1.5, r);
  if (k > 0) {
    const ridge = 1 - Math.abs(r - 52.6) / 4.2;                       // the crust's rounded rim
    const heat = 0.75 + 0.25 * kit.noise2(th * 7 + tod * 0.35, 1.7 + tod * 0.21);
    const ch = kit.smoothstep(0.66, 0.82, kit.noise2(th * 11 + 5, r * 0.2));
    const cr = kit.scale(kit.mix(CRUST, CHAR, 0.5 * ch + 0.5 * (1 - kit.clamp(ridge))), heat * (0.5 + 0.5 * kit.clamp(ridge)));
    col = kit.mix(col, cr, k);
  }
  return kit.scale(col, 1 - kit.smoothstep(R_PIZZA - 1, R_PIZZA + 1.2, r));
}

const sectorOf = (x, y) => ((Math.round(Math.atan2(y, x) / (60 * DEG)) % 6) + 6) % 6;

function drawTopping(ctx, K, t, X, Y, S, clip, j, tod) {
  const big = S * (1 + 0.45 * t.z), reach = (K === 'pep' ? KIND.pep.r : KIND.leaf.len) * big + 1.6;
  const ca = Math.cos(t.a), sa = Math.sin(t.a);
  for (const i of ctx.layout.index.near(X, Y, reach)) {
    const l = ctx.leds[i];
    if (clip >= 0 && l.panel !== clip) continue;
    const dx = l.x - X, dy = l.y - Y;
    if (K === 'pep') {
      const R = KIND.pep.r * big, d = Math.hypot(dx, dy);
      const cov = 1 - kit.smoothstep(R - 1.2, R + 0.7, d);
      if (cov <= 0) continue;
      // each slice of sausage its own shade: some cured darker, some oilier
      const tone = (j % 2 ? 1 : 0.62) * (0.85 + 0.15 * kit.hash(j, 11));
      kit.over(ctx, i, kit.scale(kit.mix(PEP, PEP_RIM, kit.clamp(d / R) * 0.8), tone), cov);
      // a bead of grease catching the light
      const g = Math.max(0, Math.sin(tod * 0.9 + j * 2.1)) ** 6;
      if (g > 0.01) kit.add(ctx, i, GREASE, 0.35 * g * (1 - kit.smoothstep(0, R * 0.7, Math.hypot(dx + 1.2, dy + 1.2))));
    } else {
      const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
      const e = (u / (KIND.leaf.len * big)) ** 2 + (v / (KIND.leaf.wid * big)) ** 2;
      const cov = 1 - kit.smoothstep(0.45, 1.5, e);
      if (cov <= 0) continue;
      kit.over(ctx, i, kit.scale(BASIL, (j % 2 ? 1 : 0.6) * (0.85 + 0.15 * kit.hash(j, 13))), cov);
      kit.add(ctx, i, VEIN, 0.12 * cov * (1 - kit.smoothstep(0.3, 1.2, Math.abs(v))));
    }
  }
}

export default {
  name: 'Pizzeria',
  blurb: 'the time in pepperoni and basil on six hot slices; a mouse tugs a slice each minute, the hour is a pizza toss',
  layouts: ['tri-hex'], look: { look: 'opal', gap: 2.5 }, fps: 60, brightness: 0.8, dither: true,
  frame(ctx) {
    const { leds, date } = ctx;
    const now = date.getTime() / 1000, M = Math.floor(now / 60) * 60, age = now - M;
    const tod = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds() + date.getMilliseconds() / 1000;
    const cur = digitsAt(M), prev = digitsAt(M - 60);
    const hour = prev[1] !== cur[1] || prev[0] !== cur[0];
    const T = { now, age, cur, prev, next: digitsAt(M + 60), hour, tugSlices: [] };

    // the hour's toss: one spin, rising toward you
    const tp = hour ? kit.clamp(age / TOSS) : 1;
    const th = 2 * Math.PI * kit.ease.inOut(tp), S = 1 + 0.2 * Math.sin(Math.PI * tp);
    const cth = Math.cos(th), sth = Math.sin(th);
    // the minute's tug: changed minute slices pulled outward
    const off = [0, 0, 0, 0, 0, 0].map(() => [0, 0]);
    const A = hour ? 0 : tugAmount(age);
    for (const s of [2, 3]) if (!hour && prev[s] !== cur[s]) {
      const k = SLOTS[s].slice; T.tugSlices.push(k);
      off[k] = [AXIS[k][0] * TUG * A, AXIS[k][1] * TUG * A];
    }
    T.off = off;

    const toPizza = (x, y, b = th) => { const c = Math.cos(b), sn = Math.sin(b); return [(x * c + y * sn) / S, (-x * sn + y * c) / S]; };
    // while it spins, smear the cheese over the arc it swept this frame (the eye does)
    const sweep = hour && tp < 1 ? 2 * Math.PI * (kit.ease.inOut(tp) - kit.ease.inOut(kit.clamp((age - 1 / 60) / TOSS))) : 0;
    const taps = Math.abs(sweep) > 0.02 ? 3 : 1;
    const toWorld = (x, y, k) => [(x * cth - y * sth) * S + off[k][0], (x * sth + y * cth) * S + off[k][1]];

    // cheese, crust, the pan showing through where a slice has been pulled away
    for (const l of leds) {
      const k = l.panel, x = l.x - off[k][0], y = l.y - off[k][1];
      if ((off[k][0] || off[k][1]) && sectorOf(x, y) !== k) continue;
      for (let q = 0; q < taps; q++) {
        const [px, py] = toPizza(x, y, th - (sweep * q) / taps), c = cheese(px, py, tod);
        if (c) kit.add(ctx, l.i, c, 1 / taps);
      }
    }

    // bubbles rising and popping in the cheese
    for (let b = 0; b < 10; b++) {
      const P = 3.2 + 2.6 * kit.hash(b, 1), ph = (tod + kit.hash(b, 2) * P) / P, cyc = Math.floor(ph), u = ph - cyc;
      const ang = kit.hash(b, cyc, 3) * kit.TAU, rad = 8 + 36 * Math.sqrt(kit.hash(b, cyc, 4));
      const bx = Math.cos(ang) * rad, by = Math.sin(ang) * rad, k = sectorOf(bx, by);
      const [X, Y] = toWorld(bx, by, k);
      const grow = kit.smoothstep(0, 0.8, u), pop = u > 0.86 ? (u - 0.86) / 0.14 : 0;
      for (const i of ctx.layout.index.near(X, Y, 5)) {
        if (leds[i].panel !== k) continue;
        const d = Math.hypot(leds[i].x - X, leds[i].y - Y);
        if (!pop) kit.add(ctx, i, CHEESE_HI, 0.9 * grow * (1 - kit.smoothstep(0.5, 1.5 + 2 * grow, d)));
        else kit.add(ctx, i, CHEESE_HI, 1.6 * (1 - pop) * (1 - kit.smoothstep(0, 1.5, Math.abs(d - 1.5 - 3 * pop))));
      }
    }

    // olives and mushrooms on the side slices: dark rings, pale caps
    for (const [k, kind, sx, sy, a = 0] of SCATTER) {
      const [X, Y] = toWorld(sx, sy, k), ca = Math.cos(a + th), sa = Math.sin(a + th);
      for (const i of ctx.layout.index.near(X, Y, 6 * S)) {
        if (!hour && leds[i].panel !== k) continue;
        const dx = (leds[i].x - X) / S, dy = (leds[i].y - Y) / S, d = Math.hypot(dx, dy);
        if (kind === 'olive') kit.over(ctx, i, OLIVE, 0.9 * (1 - kit.smoothstep(3.2, 4.8, d)));
        else {
          const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
          const cap = 1 - kit.smoothstep(3.0, 4.6, Math.hypot(u * 0.8, Math.max(0, v) * 1.6 + Math.min(0, v) * 0.9));
          kit.over(ctx, i, MUSH, 0.85 * cap);
        }
      }
    }

    // toppings
    for (let s = 0; s < 4; s++) {
      const sl = SLOTS[s].slice, tops = toppings(s, T), tossing = hour && age < TOSS;
      tops.forEach((t, j) => {
        const [X, Y] = toWorld(t.x, t.y, tossing ? 0 : sl);
        // a topping on a pulled slice stays on its own board
        drawTopping(ctx, SLOTS[s].kind, t, X, Y, S, !tossing && (off[sl][0] || off[sl][1]) ? sl : -1, j, tod);
      });
    }

    // cheese strings across every cut whose two sides have come apart
    if (A > 0 || (!hour && age < 1.7)) for (let c = 0; c < 6; c++) {
      const k1 = c, k2 = (c + 1) % 6, d1 = off[k1], d2 = off[k2];
      const gx = d2[0] - d1[0], gy = d2[1] - d1[1], full = TUG * Math.hypot(AXIS[k2][0] * (T.tugSlices.includes(k2) ? 1 : 0) - AXIS[k1][0] * (T.tugSlices.includes(k1) ? 1 : 0), AXIS[k2][1] * (T.tugSlices.includes(k2) ? 1 : 0) - AXIS[k1][1] * (T.tugSlices.includes(k1) ? 1 : 0));
      if (full < 0.1) continue;
      const ea = (c * 60 + 30) * DEG, ex = Math.cos(ea), ey = Math.sin(ea);
      for (let j = 0; j < 4; j++) {
        const h = kit.hash(c, j, Math.floor(now / 60));
        const r = 7 + j * 10 + 6 * h;
        // each string gives at its own stretch; the strong ones survive and sag back
        const f = 0.55 + 0.7 * kit.hash(c, j, 17);
        const tSnap = f < 1 ? 0.4 * (1 - Math.cbrt(1 - f)) : Infinity;
        const ax = ex * r + d1[0], ay = ey * r + d1[1], bx = ex * r + d2[0], by = ey * r + d2[1];
        const L = Math.hypot(bx - ax, by - ay);
        let segs;
        if (age < tSnap) {
          // a sagging rope: bowed sideways, swaying
          const sw = (1.5 + 0.15 * L) * Math.sin(now * 5 + j * 2), mx = (ax + bx) / 2 + ex * sw, my = (ay + by) / 2 + ey * sw;
          segs = [[ax, ay, mx, my, 1], [mx, my, bx, by, 1]];
        } else {
          // snapped: the two ends whip back into the cheese
          const k = kit.clamp((age - tSnap) / 0.35); if (k >= 1) continue;
          const sh = 0.5 * (1 - kit.ease.out(k));
          segs = [[ax, ay, ax + (bx - ax) * sh, ay + (by - ay) * sh, 1 - k], [bx, by, bx + (ax - bx) * sh, by + (ay - by) * sh, 1 - k]];
        }
        const thin = kit.clamp(1.25 - L / 14, 0.45, 1);
        for (const [x0, y0, x1, y1, a] of segs) for (const i of ctx.layout.index.near((x0 + x1) / 2, (y0 + y1) / 2, Math.hypot(x1 - x0, y1 - y0) / 2 + 3)) {
          const dd = kit.segDist(leds[i].x, leds[i].y, x0, y0, x1, y1);
          kit.add(ctx, i, STRING, 0.45 * a * thin * (1 - kit.smoothstep(0.3, 2.4, dd)));
        }
      }
    }

    // steam drifting up off the pie
    for (const l of leds) {
      const v = kit.noise3(l.x * 0.045, (l.y + tod * 7) * 0.05, tod * 0.13);
      const st = 0.5 * kit.smoothstep(0.76, 0.92, v) * (1 - kit.smoothstep(20, 62, Math.hypot(l.x, l.y + 10)));
      if (st > 0) kit.add(ctx, l.i, STEAM, st);
    }

    for (const m of mice(T)) drawMouse(ctx, m, now);

    const dim = 1 - 0.8 * ctx.night;
    if (dim < 1) for (let i = 0; i < ctx.out.length; i++) ctx.out[i] *= dim;
  },
};
