// Bookshelf: a lamp-lit shelf where every numeral is a little construction of
// real books: books standing, lying across, wedged, leaning. A ginger cat
// lives at the end of the shelf.
//
// Minute turn: the cat stalks the stale numeral (butt wiggle at :58), and at
// :00 swats the books that the new time doesn't need clean off the shelf
// (flying books knock the next numeral's stale ones off in turn). The right
// books then drop in from above and land with a thunk that rocks their
// neighbours. Between turns it naps on its cushion, sits in the gap between
// hours and minutes like a colon, grooms, or teases a numeral early. Hour:
// zoomies. The cat sprints the length of the shelf, every book topples off in
// a domino wave behind it, the shelf restacks itself in a rain of books, and
// the cat strolls back in from the other end, tail up, proud.
//
// Pure function of time: the books of a minute and the cat's script are
// deterministic caches keyed by the minute.
import * as kit from '../js/kit.js';

const P = 3, X0 = -46.5, Y0 = -10.5;               // the strip's lattice, mm
const X = (c) => X0 + P * c, Y = (r) => Y0 + P * r;
const COLS = 32, ROWS = 8;
const SLOTS = [0, 5, 12, 17];                      // first column of each numeral
const SHELF = Y(6) + P / 2;                        // the shelf's top surface, mm
const G = 520;                                     // gravity, mm/s^2 (display scale)

// ------------------------------------------------------------------ books
// A piece is one book at rest: the LED centres of its two ends, [c0, r0, c1, r1]
// in the numeral's own 4 x 7 cell, and its thickness in pitches.
const PIECES = {
  T: [0, 0, 3, 0], B: [0, 6, 3, 6],                // lying flat, top and bottom
  L: [0, 1, 0, 5], R: [3, 1, 3, 5],                // standing, full height
  Lu: [0, 1, 0, 2], Ru: [3, 1, 3, 2], Rl: [3, 4, 3, 5], Ll: [0, 4, 0, 5],
  Mw: [1, 3, 2, 3], Mf: [0, 3, 3, 3], Mr: [1, 3, 3, 3], Ml: [0, 3, 2, 3],
  S: [2, 0, 2, 6],                                 // a tall volume, the stem of 1 and 4
  F: [0.15, 2.05, 1.05, 0.95],                     // a slim book leaning on it: 1's flag
  D2: [2.1, 3, 0, 5.1],                            // leaning, 2's diagonal
  D7: [3, 1, 1.4, 6],                              // leaning tall, 7's stem
  D4: [0, 3.1, 1.25, 0.75], X4: [0, 4, 3, 4],              // 4: a short book leaning on the stem, a crossbar
};
const THICK = { F: 0.8, D2: 0.85, D7: 0.85, D4: 0.85 };
const FONT = {
  0: ['B', 'L', 'R', 'T'],
  1: ['S', 'F'],
  2: ['B', 'D2', 'Ru', 'T'],
  3: ['B', 'R', 'Mw', 'T'],
  4: ['X4', 'S', 'D4'],
  5: ['B', 'Rl', 'Mf', 'Lu', 'T'],
  6: ['B', 'L', 'Rl', 'Mr', 'T'],
  7: ['D7', 'T'],
  8: ['B', 'Ll', 'R', 'Ml', 'Lu', 'T'],
  9: ['B', 'R', 'Ml', 'Lu', 'T'],
};

// leathers, lit by a warm lamp (sRGB picks; linear inside)
// faint channels (under 5%) are dropped: at 8 bits they would only step and tint
const pick = (h) => kit.hex(h).map((v) => (v < 0.05 ? 0 : v));
const LEATHER = ['#c0102c', '#178a3c', '#2a48d8', '#d89a0c', '#8c28b4', '#0c9a90', '#b8a888', '#b8402a'].map(pick);
const GILT = kit.hex('#ffd27a');
/** The colour of piece `k` in slot `s`: fixed, so a numeral keeps its books. */
function leather(s, k) {
  const h = [...k].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7);
  return LEATHER[Math.floor(kit.hash(h, s, 3) * LEATHER.length)];
}

/** Signed distance (mm) from (px, py) to a book from end centre a to b, thickness th pitches. */
function bookSdf(px, py, ax, ay, bx, by, th) {
  const mx = (ax + bx) / 2, my = (ay + by) / 2, L = Math.hypot(bx - ax, by - ay) || 1e-6;
  const ux = (bx - ax) / L, uy = (by - ay) / L;
  const dx = px - mx, dy = py - my;
  const u = Math.abs(dx * ux + dy * uy) - (L / 2 + P / 2), v = Math.abs(-dx * uy + dy * ux) - th * P / 2;
  return Math.hypot(Math.max(u, 0), Math.max(v, 0)) + Math.min(Math.max(u, v), 0);
}

/** Rest cells of a piece as a 28-bit mask over its numeral's 4 x 7 cell (for the ordering search). */
const pieceMask = Object.fromEntries(Object.entries(PIECES).map(([k, [c0, r0, c1, r1]]) => {
  let m = 0;
  for (let c = 0; c < 4; c++) for (let r = 0; r < 7; r++)
    if (bookSdf(c * P, r * P, c0 * P, r0 * P, c1 * P, r1 * P, THICK[k] ?? 1) < -0.2 * P) m |= 1 << (c * 7 + r);
  return [k, m];
}));
const maskOf = (keys) => keys.reduce((m, k) => m | pieceMask[k], 0);
const DIGIT_MASK = Object.fromEntries(Object.entries(FONT).map(([d, ks]) => [d, maskOf(ks)]));
function hamming(a, b) { let x = a ^ b, n = 0; while (x) { x &= x - 1; n++; } return n; }
const lowest = (k) => Math.max(PIECES[k][1], PIECES[k][3]);

function perms(a) {
  if (a.length <= 1) return [a];
  const out = [];
  a.forEach((x, i) => { for (const p of perms([...a.slice(0, i), ...a.slice(i + 1)])) out.push([x, ...p]); });
  return out;
}
/**
 * How to turn numeral `from` into `to` (from = null: an empty slot) so that no
 * in-between state looks like a third numeral: removals first, then additions,
 * each in the order that keeps every partial state furthest (in lit cells) from
 * every other digit; ties go to building bottom-up, as gravity would.
 */
const plans = new Map();
function plan(from, to) {
  const key = from + '>' + to;
  if (plans.has(key)) return plans.get(key);
  const A = from == null ? [] : FONT[from], Bk = FONT[to];
  const keep = A.filter((k) => Bk.includes(k));
  const rem = A.filter((k) => !Bk.includes(k)), add = Bk.filter((k) => !A.includes(k));
  const others = Object.keys(FONT).filter((d) => d !== String(from) && d !== String(to));
  const safety = (state) => { const m = maskOf(state); let v = 99; for (const d of others) v = Math.min(v, hamming(m, DIGIT_MASK[d])); return v; };
  let best = null;
  for (const ro of perms(rem)) for (const ao of perms(add)) {
    let cur = [...A], score = 99;
    for (const k of ro) { cur = cur.filter((x) => x !== k); if (cur.length) score = Math.min(score, safety(cur)); }
    for (let j = 0; j < ao.length - 1; j++) { cur = [...cur, ao[j]]; score = Math.min(score, safety(cur)); }
    let inv = 0;                                     // additions placed above ones still to come
    for (let i = 0; i < ao.length; i++) for (let j = i + 1; j < ao.length; j++) if (lowest(ao[i]) < lowest(ao[j])) inv++;
    const val = Math.min(score, 3) * 100 - inv * 10 + Math.min(score, 9);
    if (!best || val > best.val) best = { val, score, rem: ro, add: ao, keep };
  }
  plans.set(key, best);
  return best;
}

// all 110 plans up front (a few ms), so no frame pays for the search
for (let a = -1; a < 10; a++) for (let b = 0; b < 10; b++) plan(a < 0 ? null : String(a), String(b));

// ------------------------------------------------------------ the minute
const pad = (n) => String(n).padStart(2, '0');
const digitsAt = (sec) => { const d = new Date(sec * 1000); return pad(d.getHours()) + pad(d.getMinutes()); };

/** A book instance in world mm. */
function bookOf(s, k) {
  const [c0, r0, c1, r1] = PIECES[k], o = SLOTS[s];
  return { s, k, ax: X(o + c0), ay: Y(r0), bx: X(o + c1), by: Y(r1), th: THICK[k] ?? 1, col: leather(s, k) };
}
// the cat's cushion at the end of the shelf: two books lying flat
const CUSHION = [
  { ax: X(27), ay: Y(6), bx: X(31), by: Y(6), th: 1, col: pick('#7a2a9a') },
  { ax: X(28), ay: Y(5), bx: X(31), by: Y(5), th: 1, col: pick('#1a7a8a') },
];

// cat spots (mm)
const STALK = X(24.3), HOME = X(24), GAP = X(10), BED = X(29.3);
const BED_GROUND = Y(5) - P / 2;

const minutes = new Map();
function minuteOf(M) {
  if (minutes.has(M)) return minutes.get(M);
  const prev = digitsAt(M - 60), next = digitsAt(M);
  const hour = new Date(M * 1000).getMinutes() === 0;
  const books = [];                                 // { ...book, kind: 'keep'|'gone'|'new', at }
  if (!hour) {
    // the swat: one paw sends the units' stale books flying left, and they
    // knock the next numeral's stale books off in turn, like billiards
    let base = M + 0.18, j = 0;
    for (let s = 3; s >= 0; s--) {
      const p = plan(prev[s], next[s]);
      for (const key of p.keep) books.push({ ...bookOf(s, key), kind: 'keep' });
      if (!p.rem.length && !p.add.length) continue;
      p.rem.forEach((key, k) => books.push({ ...bookOf(s, key), kind: 'gone', at: base + 0.07 * k, dir: -1 }));
      const firstAdd = base + 0.26;
      p.add.forEach((key, k) => books.push({ ...bookOf(s, key), kind: 'new', at: Math.max(firstAdd, M + 0.55 + 0.22 * j) + 0.2 * k }));
      j += p.add.length;
      base += 0.3;
    }
  } else {
    // zoomies: everything topples as the cat passes, then rains back in
    for (let s = 3; s >= 0; s--) {
      let last = 0;
      for (const key of FONT[prev[s]]) {
        const b = bookOf(s, key), at = M + runPass(Math.max(b.ax, b.bx) + P / 2);
        last = Math.max(last, at);
        books.push({ ...b, kind: 'gone', at, dir: -1, topple: true });
      }
      plan(null, next[s]).add.forEach((key, j) => books.push({ ...bookOf(s, key), kind: 'new', at: last + 0.12 + 0.12 * j }));
    }
  }
  // every landing and every swat jolts the numeral it happens in
  const jolts = [[], [], [], []];
  for (const b of books) {
    if (b.kind === 'new') { b.land = b.at + fallOf(b).tf; jolts[b.s].push([b.land, 1]); }
    if (b.kind === 'gone' && !b.topple) jolts[b.s].push([b.at, 0.6]);
  }
  const m = { M, prev, next, hour, books, jolts };
  if (minutes.size > 4) minutes.delete(minutes.keys().next().value);
  minutes.set(M, m);
  return m;
}

// ---------------------------------------------------------- zoomies path
const RUN_T = 2.3, RUN_X0 = STALK, RUN_X1 = -64;
/** Cat x during the hour sprint, u in [0, 1]: a pounce off the mark, then flat out. */
const runX = (u) => kit.lerp(RUN_X0, RUN_X1, 0.35 * u * u + 0.65 * u);
const NOSE = 2.9 * P;
/** Seconds after the hour when the cat's nose passes x. */
function runPass(x) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (runX(m) - NOSE > x) lo = m; else hi = m; }
  return lo * RUN_T;
}

// ----------------------------------------------------------- book motion
/** Where a book is at time now: ends a, b (mm) and alpha, or null if not on show. */
function bookAt(b, now) {
  if (b.kind === 'keep') return [b.ax, b.ay, b.bx, b.by];
  const tau = now - b.at;
  if (b.kind === 'gone') {
    if (tau <= 0) return [b.ax, b.ay, b.bx, b.by];
    if (tau > 1.6) return null;
    // knocked: pivot on its lower far corner, tip, then fall forward off the shelf
    const px = Math.min(b.ax, b.bx) - P / 2, py = Math.max(b.ay, b.by) + P / 2;
    const tip = b.topple ? 0.22 : 0.12;
    let th, dx = 0, dy = 0;
    if (tau < tip) th = 0.9 * (tau / tip) ** 2;
    else {
      const f = tau - tip;
      th = 0.9 + (b.topple ? 7 : 9) * f;
      dx = -(b.topple ? 28 : 42) * f;
      dy = -18 * f + 0.5 * G * f * f;
    }
    th *= b.dir;                                    // dir -1: tips to the left (counter-clockwise on screen)
    const c = Math.cos(th), s = Math.sin(th);
    const rot = (x, y) => [px + (x - px) * c - (y - py) * s + dx, py + (x - px) * s + (y - py) * c + dy];
    const A = rot(b.ax, b.ay), Bp = rot(b.bx, b.by);
    if (Math.min(A[1], Bp[1]) > 18) return null;
    return [A[0], A[1], Bp[0], Bp[1]];
  }
  // new: dropped from above, lands with one small bounce
  if (tau <= 0) return null;
  const { drop, tf } = fallOf(b);
  let off;
  if (tau < tf) off = -drop + 0.5 * G * tau * tau;
  else {
    const vb = 0.22 * G * tf, tb = (2 * vb) / G, q = tau - tf;   // bounce at 22% of impact speed
    off = q < tb ? -(vb * q - 0.5 * G * q * q) : 0;
  }
  return [b.ax, b.ay + off, b.bx, b.by + off];
}
/** A new book starts with its bottom edge just above the strip and falls under G. */
function fallOf(b) {
  const bottom = Math.max(b.ay, b.by) + (Math.abs(b.ay - b.by) > Math.abs(b.ax - b.bx) ? P / 2 : (b.th * P) / 2);
  const drop = bottom - (Y0 - P / 2) + 0.5;
  return { drop, tf: Math.sqrt((2 * drop) / G) };
}
/** Resting books shiver after a jolt in their numeral: a small rocking about the foot. */
function wobble(m, b, e, now, cat) {
  let a = 0;
  for (const [t, k] of m.jolts[b.s]) {
    const q = now - t;
    if (q > 0 && q < 0.7) a += k * 0.09 * Math.exp(-q / 0.16) * Math.sin(q * 38 + b.ax);
  }
  if (m.tease && b.s === 3) {
    const q = now - m.tease;
    if (q > 0 && q < 1.4) a += 0.2 * Math.exp(-q / 0.35) * Math.sin(q * 26 + b.ax * 0.3);
  }
  // the cat brushing past in front: books near its body sway with its speed
  if (cat.speed > 1) {
    const dx = (b.ax + b.bx) / 2 - cat.x;
    a += 0.05 * Math.min(1, cat.speed / 15) * Math.exp(-(dx * dx) / 40) * Math.sin(now * 11 + b.ax * 0.7);
  }
  if (!a) return e;
  const px = (e[0] + e[2]) / 2, py = Math.max(e[1], e[3]) + P / 2, c = Math.cos(a), s = Math.sin(a);
  const r = (x, y) => [px + (x - px) * c - (y - py) * s, py + (x - px) * s + (y - py) * c];
  return [...r(e[0], e[1]), ...r(e[2], e[3])];
}

/** Paint one book with coverage, a gilt label band and a darker foot. */
function paintBook(ctx, e, th, col, light, alpha = 1) {
  const [ax, ay, bx, by] = e;
  const L = Math.hypot(bx - ax, by - ay) || 1e-6, ux = (bx - ax) / L, uy = (by - ay) / L;
  const reach = L / 2 + P * 1.3;
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  const c0 = Math.max(0, Math.floor((mx - reach - X0) / P)), c1 = Math.min(COLS - 1, Math.ceil((mx + reach - X0) / P));
  const r0 = Math.max(0, Math.floor((my - reach - Y0) / P)), r1 = Math.min(ROWS - 1, Math.ceil((my + reach - Y0) / P));
  const len = L + P;                                // spine length, end to end
  for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) {
    const x = X(c), y = Y(r), d = bookSdf(x, y, ax, ay, bx, by, th);
    const cov = kit.clamp(0.5 - d / (0.62 * P));
    if (cov <= 0) continue;
    // position along the spine 0..1 from its a end
    const s = ((x - ax) * ux + (y - ay) * uy + P / 2) / len;
    const n = len / P;                              // books of 3+ LEDs get a gilt title band
    let k = col;
    if (n >= 3) {
      const band = 1 - kit.smoothstep(0.25, 0.75, Math.abs(s * n - (n >= 5 ? 1.5 : 0.5 + (n - 1) / 2)));
      k = kit.mix(col, GILT, 0.32 * band);
    }
    kit.over(ctx, c * ROWS + r, kit.scale(k, light(r)), cov * alpha);
  }
}

// ------------------------------------------------------------------ cat
// Poses in pitches, facing +x, y negative up, origin on the ground under the
// body. Parts: rear and front body circles, head, two ears (base, tip), four
// legs (hip, foot), a four-point tail, eye point(s) and eye openness.
const V = (...a) => a;
function pose(name, t, ph = 0, k = 0) {
  const sw = Math.sin(t * 2.3) * 0.35 + Math.sin(t * 5.1) * 0.1;   // idle tail swish
  switch (name) {
    case 'walk': case 'run': {
      const run = name === 'run', A = run ? 0.95 : 0.55, bob = (run ? 0.14 : 0.07) * Math.sin(2 * ph);
      const leg = (hx, p) => V(hx, -1.3 + bob, hx + A * Math.sin(p), -0.22 - (run ? 0.4 : 0.28) * Math.max(0, Math.cos(p)));
      return {
        rear: V(run ? -1.6 : -1.3, -1.95 + bob, 0.88), front: V(run ? 1.3 : 1.0, -2.05 + bob, 0.92),
        head: V(run ? 2.35 : 2.1, (run ? -3.0 : -3.0) + bob * 1.4, 0.95),
        ear1: V(run ? 2.0 : 1.8, -3.75, run ? 1.75 : 1.62, run ? -4.35 : -4.4),
        ear2: V(run ? 2.65 : 2.45, -3.75, run ? 2.7 : 2.55, run ? -4.35 : -4.4),
        legs: [leg(1.1, ph), leg(0.9, ph + Math.PI), leg(-1.2, ph + (run ? 0.6 : Math.PI / 2)), leg(-1.4, ph + (run ? 0.6 + Math.PI : 1.5 * Math.PI))],
        tail: run ? [V(-2.2, -2.2), V(-3.2, -2.35), V(-4.1, -2.6 + 0.15 * Math.sin(ph)), V(-4.8, -2.9)]
          : [V(-2.0, -2.35), V(-2.75, -2.95), V(-3.0 + 0.2 * sw, -3.8), V(-2.75 + 0.5 * sw, -4.45)],
        eyes: [V(2.6, -3.05)], open: 1, facing: 0,
      };
    }
    case 'sit': return {                            // side profile, sitting: haunch, chest, head up
      rear: V(-0.6, -1.25, 1.2), front: V(0.25, -2.6, 0.8), head: V(1.05, -4.05, 0.92),
      ear1: V(0.7, -4.75, 0.55, -5.45), ear2: V(1.35, -4.8, 1.5, -5.45),
      legs: [V(0.75, -2.0, 0.85, -0.22), V(0.55, -2.0, 0.55, -0.22), V(-0.6, -0.9, 0.2, -0.25), V(-0.8, -0.9, 0.0, -0.25)],
      tail: [V(-1.65, -0.5), V(-2.35, -0.85), V(-2.65 + 0.15 * sw, -1.7), V(-2.4 + 0.45 * sw, -2.5 - 0.2 * sw)],
      eyes: [V(1.45, -4.1)], open: 1, facing: 0,
    };
    case 'groom': {                                 // sitting, licking a raised paw
      const lick = Math.sin(t * 7);
      return {
        rear: V(-0.55, -1.3, 1.25), front: V(0.35, -2.5, 0.95), head: V(1.15, -3.8 + 0.12 * lick, 0.92),
        ear1: V(0.72, -4.3, 0.55, -4.95), ear2: V(1.4, -4.3, 1.6, -4.95),
        legs: [V(0.8, -2.2, 1.75, -3.1 + 0.15 * lick), V(0.6, -2.0, 0.6, -0.22), V(-0.6, -0.9, 0.2, -0.25), V(-0.8, -0.9, 0.0, -0.25)],
        tail: [V(-1.7, -0.45), V(-1.2, -0.15), V(-0.3, -0.15), V(0.5, -0.2 - 0.15 * sw)],
        eyes: [V(1.5, -3.6)], open: 0, facing: 0,
      };
    }
    case 'front': case 'proud': {                   // sitting, facing you
      const proud = name === 'proud';
      const tail = proud
        ? [V(0.9, -0.7), V(1.45, -1.9), V(1.6, -3.4), V(1.25 + 0.15 * sw, -4.4)]
        : [V(1.0, -0.4), V(1.9, -0.55), V(2.35 + 0.15 * sw, -1.3), V(2.2 + 0.5 * sw, -2.1)];
      return {
        rear: V(0, -1.3, 1.35), front: V(0, -2.55, 1.0), head: V(0, proud ? -4.05 : -3.85, 1.25),
        ear1: V(-0.8, proud ? -4.9 : -4.7, -1.0, proud ? -5.55 : -5.35), ear2: V(0.8, proud ? -4.9 : -4.7, 1.0, proud ? -5.55 : -5.35),
        legs: [V(-0.45, -2.0, -0.45, -0.22), V(0.45, -2.0, 0.45, -0.22), V(-1.0, -0.8, -1.1, -0.25), V(1.0, -0.8, 1.1, -0.25)],
        tail, eyes: [V(-1, proud ? -4.0 : -3.8), V(1, proud ? -4.0 : -3.8)], open: 1, facing: 1,
      };
    }
    case 'crouch': case 'swat': {                   // stalking low; swat raises a paw and strikes
      const wig = name === 'crouch' ? k * Math.sin(t * 15) : 0, sw2 = Math.sin(t * 9) * (0.2 + 0.4 * k);
      const paw = name === 'swat' ? V(1.2, -1.6, kit.lerp(3.0, 3.7, k), kit.lerp(-3.6, -1.6, k)) : V(1.0, -0.65, 1.7, -0.22);
      return {
        rear: V(-1.25 + 0.2 * wig, -1.4 - 0.12 * Math.abs(wig), 0.88), front: V(0.9, name === 'swat' ? -1.6 : -1.05, 0.82),
        head: V(2.0, name === 'swat' ? -2.2 : -1.4, 0.92),
        ear1: V(1.7, name === 'swat' ? -2.95 : -2.15, 1.5, name === 'swat' ? -3.55 : -2.75),
        ear2: V(2.35, name === 'swat' ? -2.95 : -2.15, 2.5, name === 'swat' ? -3.55 : -2.75),
        legs: [paw, V(0.8, -0.65, 1.5, -0.22), V(-1.2, -0.9, -0.9, -0.22), V(-1.4, -0.9, -1.1, -0.22)],
        tail: [V(-2.0, -1.5), V(-2.75, -1.6), V(-3.25, -2.1 - 0.15 * sw2), V(-3.3 + 0.3 * sw2, -2.8 - 0.3 * sw2)],
        eyes: [V(2.4, name === 'swat' ? -2.3 : -1.5)], open: 1, facing: 0,
      };
    }
    case 'sleep': {                                 // curled loaf, breathing
      const br = 0.05 * Math.sin(t * 1.9);
      return {
        rear: V(-0.7, -1.0 - br, 1.0 + br), front: V(0.55, -0.95 - br, 1.0 + br), head: V(1.55, -1.3, 0.85),
        ear1: V(1.25, -2.05, 1.1, -2.65), ear2: V(1.85, -2.0, 2.05, -2.6 + 0.15 * Math.max(0, Math.sin(t * 0.7) - 0.9) * 10),
        legs: [V(0.5, -0.5, 0.5, -0.5), V(0.4, -0.5, 0.4, -0.5), V(-0.6, -0.5, -0.6, -0.5), V(-0.7, -0.5, -0.7, -0.5)],
        tail: [V(-1.6, -0.45), V(-1.1, -0.15), V(0.2, -0.12), V(1.3, -0.2 - 0.12 * sw)],
        eyes: [V(1.8, -1.0)], open: 0, facing: 0,
      };
    }
    case 'stretch': return {                        // front down, rear up
      rear: V(-1.2, -2.2, 0.85), front: V(0.95, -1.0, 0.8), head: V(2.15, -1.25, 0.88),
      ear1: V(1.85, -1.95, 1.7, -2.55), ear2: V(2.45, -1.95, 2.6, -2.55),
      legs: [V(1.1, -0.7, 2.7, -0.22), V(1.0, -0.7, 2.4, -0.22), V(-1.2, -1.6, -1.35, -0.22), V(-1.4, -1.6, -1.6, -0.22)],
      tail: [V(-1.9, -2.7), V(-2.3, -3.5), V(-2.15, -4.25), V(-1.75 + 0.2 * sw, -4.8)],
      eyes: [V(2.5, -1.3)], open: 0, facing: 0,
    };
  }
  return pose('sit', t);
}
/** Blend two poses (same shape), k in 0..1. */
function blend(a, b, k) {
  if (typeof a === 'number') return a + (b - a) * k;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return k < 0.5 ? a : b;
    return a.map((x, i) => blend(x, b[i], k));
  }
  const o = {};
  for (const key in a) o[key] = blend(a[key], b[key], k);
  return o;
}

const GINGER = pick('#ff7418'), GINGER_DK = pick('#c44a08'), CREAM = pick('#ffd8a8');
const EYE = pick('#9cff3a');

/** The cat's distance field at (px, py) mm; returns [d, partTag]. */
function catField(C, px, py) {
  // to cat-local pitches
  const lx = (px - C.x) / (P * C.sx), ly = (py - C.gy) / P;
  const sc = Math.abs(C.sx) * P;                    // x is squashed when turning
  const p = C.p;
  let best = 1e9, tag = 0;
  const circ = (c, t) => { const d = Math.hypot((lx - c[0]) * sc / P, ly - c[1]) - c[2]; if (d < best) { best = d; tag = t; } };
  const cap = (ax, ay, bx, by, ra, rb, t) => {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
    const qx = (lx - ax) * sc / P, qy = ly - ay, h = kit.clamp((qx * dx * sc / P + qy * dy) / (dx * dx * (sc / P) ** 2 + dy * dy || 1e-9));
    const d = Math.hypot(qx - dx * h * sc / P, qy - dy * h) - kit.lerp(ra, rb, h);
    if (d < best) { best = d; tag = t; }
    void L2;
  };
  circ(p.rear, 1); circ(p.front, 1);
  cap(p.rear[0], p.rear[1], p.front[0], p.front[1], p.rear[2] * 0.92, p.front[2] * 0.92, 1);
  circ(p.head, 2);
  // ears drawn around the head's centre so a turning cat shows both
  const ex = (e, side) => e + (1 - Math.abs(C.sx)) * side * 0.0;
  cap(ex(p.ear1[0], -1), p.ear1[1], ex(p.ear1[2], -1), p.ear1[3], 0.42, 0.12, 3);
  cap(ex(p.ear2[0], 1), p.ear2[1], ex(p.ear2[2], 1), p.ear2[3], 0.42, 0.12, 3);
  for (const l of p.legs) cap(l[0], l[1], l[2], l[3], 0.4, 0.34, 4);
  const T = p.tail;
  for (let i = 0; i + 1 < T.length; i++) cap(T[i][0], T[i][1], T[i + 1][0], T[i + 1][1], 0.36 - 0.05 * i, 0.31 - 0.05 * i, 5);
  return [best * P, tag];
}

function paintCat(ctx, C, light) {
  const p = C.p;
  // bounding box from parts
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  const acc = (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
  for (const c of [p.rear, p.front, p.head]) { acc(c[0] - c[2], c[1] - c[2]); acc(c[0] + c[2], c[1] + c[2]); }
  for (const e of [p.ear1, p.ear2, ...p.legs]) { acc(e[0], e[1]); acc(e[2], e[3]); }
  for (const tp of p.tail) acc(tp[0], tp[1]);
  const wx0 = C.x + Math.min(x0 * C.sx, x1 * C.sx) * P - 2 * P, wx1 = C.x + Math.max(x0 * C.sx, x1 * C.sx) * P + 2 * P;
  const wy0 = C.gy + y0 * P - 2 * P, wy1 = C.gy + y1 * P + 2 * P;
  const c0 = Math.max(0, Math.floor((wx0 - X0) / P)), c1 = Math.min(COLS - 1, Math.ceil((wx1 - X0) / P));
  const r0 = Math.max(0, Math.floor((wy0 - Y0) / P)), r1 = Math.min(ROWS - 1, Math.ceil((wy1 - Y0) / P));
  if (c0 > c1) return;
  const o = ctx.out;
  for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) {
    const x = X(c), y = Y(r), [d, tag] = catField(C, x, y), i = c * ROWS + r;
    // dark halo, so the cat stands off the books behind it
    const halo = 1 - kit.smoothstep(0.15 * P, 1.05 * P, d);
    if (halo > 0) { const m = 1 - 0.85 * halo * C.alpha; o[3 * i] *= m; o[3 * i + 1] *= m; o[3 * i + 2] *= m; }
    const cov = kit.clamp(0.5 - d / (0.6 * P)) * C.alpha;
    if (cov <= 0) continue;
    // tabby: darker bands across the back, cream muzzle and chest when facing you
    const lx = (x - C.x) / (P * C.sx), ly = (y - C.gy) / P;
    let col = GINGER;
    if (tag === 1 && ly < p.front[1] - 0.2 && C.front < 0.5) col = kit.mix(GINGER, GINGER_DK, 0.5 + 0.5 * Math.cos(lx * 2.6));
    if (tag === 5) col = kit.mix(GINGER, GINGER_DK, 0.5 + 0.5 * Math.cos(r * 3.1 + c));
    if (C.front > 0) {
      const dm = Math.hypot(lx - p.head[0], ly - (p.head[1] + 0.75)), dc = Math.hypot(lx - p.front[0], ly - p.front[1] - 0.3);
      if (tag === 2 && dm < 0.7) col = kit.mix(col, CREAM, C.front * 0.75);
      if (tag === 1 && dc < 0.75) col = kit.mix(col, CREAM, C.front * 0.6);
    }
    kit.over(ctx, i, kit.scale(col, light(r) * 0.9), cov);
  }
  // eyes: green when open, a dark lid line when shut
  for (const e of p.eyes) {
    const ex = C.x + e[0] * C.sx * P, ey = C.gy + e[1] * P;
    const c = Math.round((ex - X0) / P), r = Math.round((ey - Y0) / P);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
    const near = (1 - kit.clamp(Math.hypot(X(c) - ex, Y(r) - ey) / P)) * C.alpha, i = c * ROWS + r;
    const open = p.open * C.blink;
    kit.over(ctx, i, kit.scale(GINGER_DK, 0.35 * light(r)), (1 - open) * near * 0.8);
    kit.over(ctx, i, kit.scale(EYE, C.eyeGlow), open * near);
  }
}

// ---------------------------------------------------------- cat's script
/**
 * The cat's minute, as segments { t0, t1, pose, x0, x1, g0, g1, face }. Every
 * minute starts and ends crouched at STALK, facing left, so minutes join.
 */
const scripts = new Map();
function scriptOf(M, night) {
  const key = M + ':' + (night > 0.5 ? 1 : 0);
  if (scripts.has(key)) return scripts.get(key);
  const hour = new Date(M * 1000).getMinutes() === 0;
  const S = [];
  let t = M, x = STALK, g = SHELF, face = -1;
  const seg = (dur, p, o = {}) => {
    const x1 = o.x ?? x, g1 = o.g ?? g, f = o.face ?? (x1 !== x ? Math.sign(x1 - x) : face);
    S.push({ t0: t, t1: t + dur, pose: p, x0: x, x1, g0: g, g1, face: f, hop: o.hop || 0, wig: o.wig || 0, k: o.k });
    t += dur; x = x1; g = g1; face = f;
  };
  const walkTo = (x1, speed = 13) => { if (Math.abs(x1 - x) > 0.5) seg(Math.abs(x1 - x) / speed + 0.35, 'walk', { x: x1 }); };
  if (hour) {
    seg(RUN_T, 'run', { x: RUN_X1 });
    seg(1.0, 'run', { x: RUN_X1, face: -1 });       // off the left end ...
    x = 58; face = -1;                              // ... and back in from the right: it's a long shelf
    walkTo(HOME, 15);
    seg(9, 'proud', { face: -1 });
  } else {
    seg(0.42, 'swat', { k: 1 });
    seg(0.5, 'sit', { x: STALK + 1.2, face: -1 });  // springs back to watch the books land
    seg(2.2, 'sit');
  }
  // the rest of the minute: one of three moods (mostly napping at night)
  const h = kit.hash(M / 60, 77), mood = night > 0.5 ? (h < 0.75 ? 'nap' : 'lounge') : h < 0.3 ? 'nap' : h < 0.62 ? 'visit' : 'lounge';
  const END = M + 55.5;
  if (mood === 'nap') {
    walkTo(BED - 3.5);
    seg(0.55, 'walk', { x: BED, g: BED_GROUND, hop: 1 });
    seg(0.4, 'sit', { face: -1 });                  // turns round on the cushion, then curls up
    seg(END - 5.6 - t, 'sleep', { face: -1 });
    seg(2.0, 'stretch', { face: -1 });
    seg(0.25, 'sit', { face: -1 });
    seg(0.55, 'walk', { x: BED - 4, g: SHELF, hop: 1, face: -1 });
  } else if (mood === 'visit') {
    // pads over to sit in the gap between hours and minutes, like the colon
    const sitFor = 14 + 8 * kit.hash(M / 60, 5);
    walkTo(GAP, 12);
    seg(0.4, 'front', { face: -1 });
    seg(sitFor, 'front');
    seg(4, 'groom', { face: 1 });
  } else {
    walkTo(HOME);
    seg(12 + 6 * kit.hash(M / 60, 9), 'front');
    if (kit.hash(M / 60, 13) < 0.5) {
      // a tease: bats the numeral long before it is due; the books rock and stay
      walkTo(STALK);
      seg(1.2, 'crouch', { face: -1 });
      S.tease = t + 0.25;
      seg(0.42, 'swat', { k: 1 });
      seg(0.5, 'sit', { x: STALK + 1.2, face: -1 });
      seg(0.4, 'front');
      seg(4, 'front');
    }
    seg(6, 'groom', { face: -1 });
    seg(7, 'front');
    seg(5, 'sit', { face: 1 });
  }
  const tw = Math.abs(STALK - x) / 13 + 0.35;
  if (t < END - tw) seg(END - tw - t, S.length ? S[S.length - 1].pose : 'sit');
  walkTo(STALK);
  seg(Math.max(0.3, M + 60 - t), 'crouch', { face: -1, wig: 1 });
  scripts.set(key, S);
  if (scripts.size > 6) scripts.delete(scripts.keys().next().value);
  return S;
}

/** The cat at time now: position, facing, pose. */
function catAt(now, night) {
  const M = Math.floor(now / 60) * 60, S = scriptOf(M, night);
  let i = S.findIndex((s) => now < s.t1);
  if (i < 0) i = S.length - 1;
  const s = S[i];
  const u = kit.clamp((now - s.t0) / Math.max(1e-6, s.t1 - s.t0));
  const ease = s.pose === 'run' ? (s.x0 === RUN_X0 ? 0.35 * u * u + 0.65 * u : u) : u - Math.sin(kit.TAU * u) / kit.TAU;
  const x = kit.lerp(s.x0, s.x1, ease);
  let gy = kit.lerp(s.g0, s.g1, kit.ease.inOut(u));
  if (s.hop) gy -= 1.4 * P * Math.sin(Math.PI * u);
  const stride = (s.pose === 'run' ? 3.4 : 2.3) * P;
  const ph = (Math.abs(x - s.x0) / stride) * kit.TAU;
  const wig = s.wig ? kit.smoothstep(s.t1 - 3, s.t1 - 0.8, now) : 0;
  const k = s.pose === 'swat' ? kit.ease.inOut(kit.clamp((now - s.t0 - 0.1) / 0.22)) : wig;
  let p = pose(s.pose, now, ph, k);
  // blend from the previous segment's end pose over 0.3 s
  const prev = S[i - 1] ?? null;
  let sx = s.face;
  if (prev) {
    const bk = kit.clamp((now - s.t0) / 0.3);
    if (bk < 1) {
      const pu = 1, pease = prev.pose === 'run' ? 1 : pu;
      const pph = (Math.abs(kit.lerp(prev.x0, prev.x1, pease) - prev.x0) / ((prev.pose === 'run' ? 3.4 : 2.3) * P)) * kit.TAU;
      const pk = prev.pose === 'swat' ? 1 : prev.wig ? 1 : 0;
      p = blend(pose(prev.pose, now, pph, pk), p, kit.ease.inOut(bk));
    }
    // turning: x-scale runs through zero (the cat swings round to face you)
    if (prev.face !== s.face) {
      const tk = kit.ease.inOut(kit.clamp((now - s.t0) / 0.4));
      sx = kit.lerp(prev.face, s.face, tk);
    }
  }
  if (Math.abs(sx) < 0.3) sx = 0.3 * (sx < 0 ? -1 : 1);
  const front = p.facing;
  // blinks: a quick one every few seconds; the proud cat gives you the slow blink
  const cyc = Math.floor(now / 3.3), off = 0.4 + 2.3 * kit.hash(cyc, 41), q = now - cyc * 3.3 - off;
  const slow = s.pose === 'proud';
  const blink = slow ? 1 - 0.95 * kit.smoothstep(0, 0.5, Math.sin(now * 0.9) - 0.35)
    : 1 - (q > 0 && q < 0.2 ? Math.sin((Math.PI * q) / 0.2) : 0);
  const speed = s.pose === 'walk' || s.pose === 'run' ? Math.abs(s.x1 - s.x0) / Math.max(0.1, s.t1 - s.t0) : 0;
  return { x, gy, sx, p, front, blink, speed, alpha: 1, eyeGlow: (0.55 + 0.2 * night) * (1 - 0.45 * night) };
}

// ------------------------------------------------------------- the face
const WOOD = [0.15, 0.052, 0.0];
export default {
  name: 'Bookshelf', blurb: 'numerals built from books; the cat swats the stale ones off, new ones drop in',
  layouts: ['strip'], look: { look: 'opal', gap: 1 }, fps: 60, brightness: 0.75, dither: true,
  frame(ctx) {
    const now = ctx.date.getTime() / 1000, M = Math.floor(now / 60) * 60;
    const night = ctx.night, dim = 1 - 0.65 * night;
    const o = ctx.out;
    o.fill(0);
    // lamp light from the upper right: books high and near it a little brighter
    const light = (r) => dim * (1.0 - 0.035 * r);
    // the shelf: warm wood with a grain that drifts in the lamp's flicker-free light
    for (let c = 0; c < COLS; c++) {
      const g = 0.8 + 0.4 * kit.noise2(c * 0.45, 3.7), pool = 0.75 + 0.6 * Math.exp(-((c - 27) ** 2) / 50);
      kit.set(ctx, c * ROWS + 7, WOOD, dim * g * pool);
    }
    for (const b of CUSHION) paintBook(ctx, [b.ax, b.ay, b.bx, b.by], 1, b.col, (r) => light(r) * 0.8);
    const m = minuteOf(M), cat = catAt(now, night);
    m.tease = scriptOf(M, night).tease;
    const flying = [];
    for (const b of m.books) {
      const e = bookAt(b, now);
      if (!e) continue;
      if (b.kind === 'gone' && now > b.at) { flying.push([b, e]); continue; }
      const settled = b.kind === 'keep' || (b.kind === 'gone' ? now <= b.at : now > b.land + 0.2);
      paintBook(ctx, settled ? wobble(m, b, e, now, cat) : e, b.th, b.col, light);
    }
    paintCat(ctx, cat, light);
    for (const [b, e] of flying) paintBook(ctx, e, b.th, b.col, light);
  },
};
