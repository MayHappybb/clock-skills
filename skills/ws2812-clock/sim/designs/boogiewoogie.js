// Broadway Boogie Woogie: Mondrian's last painting, running.
//
// The 20x20 square is a square canvas (the painting is 127 x 127 cm) and a
// Manhattan street grid (the square lattice). Two dark avenues cross it,
// cols 9-10 and rows 9-10: four one-way lanes of little red, blue and grey
// cars that move on the swung eighth notes of a 132 bpm boogie-woogie, a
// light at the crossing giving each avenue one bar of green, then one of red.
// Each of the four blocks the avenues leave is a 7x7 district whose yellow
// streets ARE a digit, hours above, minutes below. Taxis (mostly grey, as
// bright as the paint, so no short street ever looks missing) walk those
// streets on the quarter notes along the postman's route, and the squares
// where streets cross flash red, blue and grey on every beat.
//
// Minute turn: the city re-routes. First the streets the new digit does not
// need close from their far ends inward, a blue car backing out ahead of the
// vanishing paint; then the new streets are paved outward from the streets
// both digits share, a red car leading each paving head. Closing, then
// paving, so the street map is always a part of the old digit or a part of
// the new one (checked: no intermediate state is another digit).
//
// Hour: the street map flips into a 1930s Mondrian. Primary and white planes
// slide out from under the avenues, which become the thick black lines (their
// traffic keeps running); the digits become black lines inside the planes, so
// the time reads in negative, and pairs of planes trade colours every two
// beats. Then every plane cell slides along its row or column into the
// nearest street, flashes there as traffic, and the streets light yellow.
//
// Letterforms: one-LED streets, horizontals and verticals only, on a 7x7
// block. The 4 and 7 drive their bars through the vertical like a street
// crossing an avenue, the 1 is a street with a turn and a base, the 6 is open
// at the top. Each digit shares streets with the next one, where paving starts.
//
// Look: opal at 1.5 mm. Mondrian's lines are rows of small flat squares of
// paint; at half the pitch each LED becomes a soft square tile that just
// touches its neighbours, so a street reads as a painted line and a plane as
// flat colour, while the one-LED black lines of the negative digits survive.
//
// Stateless: closed-form in the wall clock, caches keyed by glyph and hour.
import * as kit from '../js/kit.js';

const N = 20;
const idx = (c, r) => c * N + r;                         // Z order: columns top to bottom

const YELLOW = [1, 0.6, 0];
const RED = [1, 0.035, 0];
const BLUE = [0, 0.2, 1];
const GREY = [0.55, 0.55, 0.6];
const WHITE = [0.5, 0.48, 0.42];
const CARS = [RED, BLUE, GREY, RED, GREY, BLUE];          // the avenues
const TAXIS = [GREY, RED, GREY, BLUE, GREY, RED, GREY];   // the digit streets: mostly grey, bright as the paint

const BEAT = 60 / 132;                                   // seconds per quarter note
const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => pad(d.getHours()) + pad(d.getMinutes());

// slot origins (top-left of each 7x7 block): HH over MM, avenues between
const SLOTS = [[1, 1], [12, 1], [1, 12], [12, 12]];
const QUADS = [[0, 0, 8, 8], [11, 0, 19, 8], [0, 11, 8, 19], [11, 11, 19, 19]];

const GLYPHS = {
  0: ['#######', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#######'],
  1: ['.###...', '...#...', '...#...', '...#...', '...#...', '...#...', '.#####.'],
  2: ['#######', '......#', '......#', '#######', '#......', '#......', '#######'],
  3: ['#######', '......#', '......#', '..#####', '......#', '......#', '#######'],
  4: ['#....#.', '#....#.', '#....#.', '#######', '.....#.', '.....#.', '.....#.'],
  5: ['#######', '#......', '#......', '#######', '......#', '......#', '#######'],
  6: ['#####..', '#......', '#......', '#######', '#.....#', '#.....#', '#######'],
  7: ['######.', '.....#.', '.....#.', '...####', '.....#.', '.....#.', '.....#.'],
  8: ['#######', '#.....#', '#.....#', '#######', '#.....#', '#.....#', '#######'],
  9: ['#######', '#.....#', '#.....#', '#######', '......#', '......#', '#######'],
};
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const inG = (has, c, r) => c >= 0 && c < 7 && r >= 0 && r < 7 && has.has(c * 7 + r);

/** BFS over a glyph's streets from a set of local keys; Map key -> steps. */
function bfs(has, sources) {
  const d = new Map(), q = [];
  for (const k of sources) { d.set(k, 0); q.push(k); }
  for (let h = 0; h < q.length; h++) {
    const k = q[h], c = Math.floor(k / 7), r = k % 7;
    for (const [dx, dy] of DIRS) {
      const nk = (c + dx) * 7 + r + dy;
      if (inG(has, c + dx, r + dy) && !d.has(nk)) { d.set(nk, d.get(k) + 1); q.push(nk); }
    }
  }
  return d;
}

const glyphCache = new Map();
const ekey = (p, q) => (p < q ? p * 49 + q : q * 49 + p);
/**
 * A digit as a street map: its cells, and the shortest closed route that
 * drives every street (the postman's route: odd junctions are paired up and
 * the streets between them driven twice). Mostly one-way, so two taxis rarely
 * share a short street; it goes straight where it can and U-turns only at
 * dead ends.
 */
function glyph(ch) {
  if (glyphCache.has(ch)) return glyphCache.get(ch);
  const rows = GLYPHS[ch], cells = [], has = new Set();
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) if (rows[r][c] === '#') { cells.push([c, r]); has.add(c * 7 + r); }
  cells.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const nb = (k) => DIRS.map(([dx, dy]) => [Math.floor(k / 7) + dx, (k % 7) + dy]).filter(([c, r]) => inG(has, c, r)).map(([c, r]) => c * 7 + r);
  const mult = new Map();
  for (const k of has) for (const n of nb(k)) mult.set(ekey(k, n), 1);
  // pair the odd junctions with the shortest total of extra driving, and double those paths
  const odd = [...has].filter((k) => nb(k).length % 2);
  const path = (p, q) => {
    const prev = new Map([[p, -1]]), qu = [p];
    for (let h = 0; h < qu.length; h++) for (const n of nb(qu[h])) if (!prev.has(n)) { prev.set(n, qu[h]); qu.push(n); }
    const out = [];
    for (let k = q; k !== -1; k = prev.get(k)) out.push(k);
    return out;
  };
  const best = (left) => {
    if (!left.length) return [0, []];
    const [p, ...rest] = left;
    let top = [Infinity, []];
    rest.forEach((q, j) => {
      const pq = path(p, q), [c, pairs] = best(rest.filter((_, k) => k !== j));
      if (c + pq.length < top[0]) top = [c + pq.length, [pq, ...pairs]];
    });
    return top;
  };
  for (const pq of best(odd)[1]) for (let j = 0; j + 1 < pq.length; j++) { const e = ekey(pq[j], pq[j + 1]); mult.set(e, mult.get(e) + 1); }
  // Hierholzer, preferring straight on, then turns, then back
  const k0 = cells[0][0] * 7 + cells[0][1];
  const stack = [[k0, 0]], circ = [];
  while (stack.length) {
    const [k, d] = stack[stack.length - 1], c = Math.floor(k / 7), r = k % 7;
    let moved = false;
    for (const turn of [0, 1, 3, 2]) {
      const nd = (d + turn) % 4, nc = c + DIRS[nd][0], nr = r + DIRS[nd][1];
      if (!inG(has, nc, nr)) continue;
      const nk = nc * 7 + nr, e = ekey(k, nk);
      if (!(mult.get(e) > 0)) continue;
      mult.set(e, mult.get(e) - 1); stack.push([nk, nd]); moved = true; break;
    }
    if (!moved) circ.push(stack.pop()[0]);
  }
  circ.reverse(); circ.pop();
  const g = { ch, cells, has, route: circ, junctions: [...has].filter((k) => nb(k).length >= 3) };
  g.cars = Math.max(2, Math.round(g.cells.length / 6));
  glyphCache.set(ch, g);
  return g;
}

const transCache = new Map();
/** How digit a becomes digit b: per changed cell, its distance from the shared streets. */
function transition(a, b) {
  const key = a + b;
  if (transCache.has(key)) return transCache.get(key);
  const A = glyph(a), B = glyph(b);
  let K = [...A.has].filter((k) => B.has.has(k));
  const dist = (G, src, k) => {
    const d = bfs(G.has, src);
    return (k2) => d.get(k2) ?? Infinity;
  };
  let srcA = K, srcB = K, off = 0;
  if (!K.length) {                                    // no shared street: meet at the closest pair
    let best = null;
    for (const p of A.has) for (const q of B.has) {
      const m = Math.abs(Math.floor(p / 7) - Math.floor(q / 7)) + Math.abs((p % 7) - (q % 7));
      if (!best || m < best[0]) best = [m, p, q];
    }
    srcA = [best[1]]; srcB = [best[2]]; off = 1;
  }
  const dA = dist(A, srcA), dB = dist(B, srcB);
  const manh = (k, src) => Math.min(...src.map((s) => Math.abs(Math.floor(s / 7) - Math.floor(k / 7)) + Math.abs((s % 7) - (k % 7))));
  const removed = [], added = [];
  for (const k of A.has) if (!B.has.has(k)) { let d = dA(k); if (!isFinite(d)) d = manh(k, srcA); removed.push([k, d + off]); }
  for (const k of B.has) if (!A.has.has(k)) { let d = dB(k); if (!isFinite(d)) d = manh(k, srcB); added.push([k, d + off]); }
  const t = {
    removed, added, keep: new Set(K),
    maxR: Math.max(0, ...removed.map((x) => x[1])), maxA: Math.max(0, ...added.map((x) => x[1])),
  };
  transCache.set(key, t);
  return t;
}

// the minute turn: streets close first, then the new ones are paved
const T0 = 0.15, T1 = 2.4;
/** Progress (0..1, eased) of the closing and of the paving at `age` seconds into the minute. */
function phases(tr, age) {
  const total = T1 - T0;
  const share = !tr.maxR ? 0 : !tr.maxA ? 1 : kit.clamp(tr.maxR / (tr.maxR + tr.maxA), 0.35, 0.6);
  const tm = T0 + share * total;
  const pR = share ? kit.ease.inOut(kit.clamp((age - T0) / (tm - T0))) : 1;
  const pA = share < 1 ? kit.ease.inOut(kit.clamp((age - tm) / (T1 - tm))) : 1;
  return [pR, pA];
}

/** Swung eighth notes: a count that advances one per eighth, long-short, eased into each step. */
function swingBeats(b) {
  const n = Math.floor(b), fr = b - n;
  const g = (x) => 0.35 * x + 0.65 * kit.ease.inOut(x);
  return fr < 2 / 3 ? 2 * n + g(fr * 1.5) : 2 * n + 1 + g((fr - 2 / 3) * 3);
}

// the avenues: one-way lanes, cars spaced irregularly on a 24-cell loop (4 off canvas).
// A light at the crossing gives each avenue one bar of green, then one of red:
// eight cells per green, and no offset is 1 or 2 mod 8, so no car ever waits
// inside the crossing.
const LANES = [
  { v: true, at: 9, dir: 1, off: [0, 5, 11, 14, 20] },
  { v: true, at: 10, dir: -1, off: [3, 7, 12, 16, 22] },
  { v: false, at: 9, dir: -1, off: [4, 8, 13, 19, 23] },
  { v: false, at: 10, dir: 1, off: [0, 6, 11, 15, 21] },
];
/** Cells an avenue has moved by time T: swung eighths, but only on its green bar. */
function avenue(T, vertical) {
  const b = T / BEAT, cyc = Math.floor(b / 8), x = kit.clamp(b - 8 * cyc - (vertical ? 0 : 4), 0, 4);
  return 8 * cyc + swingBeats(x);
}
const LOOP = 24;
const AVE = 0.08;                                       // avenue paint, against 1 for the streets

// ------------------------------------------------------------ the hour show
const SWEEP = 2.6, HOLD = 4.4, COLLAPSE = 8.0, SHOW_END = 10.6;

const shows = new Map();
/** The composition for the hour starting at epoch second H, with the digits it is cut by. */
function composition(H, digits) {
  const key = H + digits;
  if (shows.has(key)) return shows.get(key);
  const rnd = (k) => kit.hash(Math.floor(H / 3600), k, 77);
  const rects = [];
  QUADS.forEach(([x0, y0, x1, y1], q) => {
    const m = Math.floor(rnd(q) * 4), s = 3 + Math.floor(rnd(q + 10) * 3);
    if (m === 0) rects.push([x0, y0, x1, y1, q]);
    else if (m === 1) { rects.push([x0, y0, x0 + s, y1, q]); rects.push([x0 + s + 1, y0, x1, y1, q]); }
    else if (m === 2) { rects.push([x0, y0, x1, y0 + s, q]); rects.push([x0, y0 + s + 1, x1, y1, q]); }
    else {
      const t = 3 + Math.floor(rnd(q + 20) * 3);
      rects.push([x0, y0, x0 + s, y1, q]); rects.push([x0 + s + 1, y0, x1, y0 + t, q]); rects.push([x0 + s + 1, y0 + t + 1, x1, y1, q]);
    }
  });
  // colours: the largest plane red or blue, one more primary, one small yellow, the rest white
  const order = rects.map((_, i) => i).sort((a, b) => area(rects[b]) - area(rects[a]));
  const cols = rects.map(() => WHITE);
  const flip = rnd(50) < 0.5;
  cols[order[0]] = flip ? RED : BLUE;
  cols[order[2]] = flip ? BLUE : RED;
  if (order.length > 5) cols[order[4]] = YELLOW;
  if (order.length > 7) cols[order[6]] = flip ? RED : BLUE;
  // each plane slides out from under the avenue it touches
  const center = (x0, x1) => (x0 + x1) / 2 < 9.5;
  const planes = rects.map(([x0, y0, x1, y1], i) => {
    const horiz = rnd(60 + i) < 0.5;
    const fromHi = horiz ? center(x0, x1) : center(y0, y1);   // left quads grow leftward from the avenue
    return { x0, y0, x1, y1, q: rects[i][4], horiz, fromHi, start: SWEEP + 0.14 * order.indexOf(i), col: cols[i] };
  });
  // boogie: pairs of planes trade colours every two beats during the hold
  const swaps = [];
  for (let k = 0, t = HOLD; t < COLLAPSE - 0.6; k++, t += 2 * BEAT) {
    const a = Math.floor(rnd(100 + k) * planes.length);
    let b = Math.floor(rnd(200 + k) * (planes.length - 1)); if (b >= a) b++;
    swaps.push({ t, a, b });
  }
  const final = planes.map((p) => p.col);
  for (const s of swaps) [final[s.a], final[s.b]] = [final[s.b], final[s.a]];
  // the collapse: every plane cell slides along a row or column into the nearest street
  const stroke = new Set();
  [...digits].forEach((ch, s) => { for (const [c, r] of glyph(ch).cells) stroke.add(idx(SLOTS[s][0] + c, SLOTS[s][1] + r)); });
  const planeOf = new Int16Array(N * N).fill(-1);
  planes.forEach((p, i) => { for (let c = p.x0; c <= p.x1; c++) for (let r = p.y0; r <= p.y1; r++) planeOf[idx(c, r)] = i; });
  const dots = [];
  for (let c = 0; c < N; c++) for (let r = 0; r < N; r++) {
    const i = idx(c, r), pi = planeOf[i];
    if (pi < 0 || stroke.has(i)) continue;
    const [qx0, qy0, qx1, qy1] = QUADS[planes[pi].q];
    let best = null;
    for (const [dx, dy] of DIRS) {
      for (let k = 1; k < 9; k++) {
        const nc = c + dx * k, nr = r + dy * k;
        if (nc < qx0 || nc > qx1 || nr < qy0 || nr > qy1) break;
        if (stroke.has(idx(nc, nr))) { if (!best || k < best[0]) best = [k, dx, dy]; break; }
      }
    }
    const [dist, dx, dy] = best ?? [0, 0, 0];
    const start = COLLAPSE + 0.25 * kit.hash(c, r, 5);
    dots.push({ c, r, dx, dy, dist, start, dur: 0.25 + 0.1 * dist, col: final[pi] });
  }
  const sh = { planes, swaps, stroke, planeOf, dots };
  if (shows.size > 4) shows.delete(shows.keys().next().value);
  shows.set(key, sh);
  return sh;
}
function area(r) { return (r[2] - r[0] + 1) * (r[3] - r[1] + 1); }

/** A plane's colour at show time `a`, with the beat swaps crossfaded. */
function planeColour(sh, i, a) {
  const cols = sh.planes.map((p) => p.col);
  for (const s of sh.swaps) {
    if (a < s.t) break;
    const k = kit.smoothstep(s.t, s.t + 0.18, a);
    const ca = cols[s.a], cb = cols[s.b];
    if (k >= 1) { cols[s.a] = cb; cols[s.b] = ca; } else { cols[s.a] = kit.mix(ca, cb, k); cols[s.b] = kit.mix(cb, ca, k); }
  }
  return cols[i];
}

// ------------------------------------------------------------------ frame
const vis = new Float32Array(N * N);       // how much street paint each cell has (0..1)
const light = new Float32Array(N * N);     // how much of the street layer survives the composition

/** Quarter notes, the walking bass: one count per beat, eased into each step. */
function walk(T) {
  const b = T / BEAT, n = Math.floor(b);
  return n + 0.2 * (b - n) + 0.8 * kit.ease.inOut(b - n);
}
/** Crossfade weight between two cells, kept crisp: a car is mostly in one cell. */
const sharp = (f) => kit.smoothstep(0.15, 0.85, f);

/** Blend a car into cell i with weight w: cars sit on the street, they replace its paint. */
function car(ctx, i, col, w) {
  if (w <= 0.003) return;
  kit.over(ctx, i, col, Math.min(1, w));
}

export default {
  name: 'Boogie Woogie',
  blurb: 'Mondrian\'s Manhattan: the yellow streets spell the time and taxis drive them in swing; the hour flips into a 1930 composition',
  layouts: ['sq'], look: { look: 'opal', gap: 1.5 }, fps: 60, brightness: 0.6, dither: true,
  frame(ctx) {
    const date = ctx.date, now = date.getTime() / 1000;
    const age = kit.secOf(date), M = now - age;
    const next = digitsOf(date), prev = digitsOf(new Date((M - 60) * 1000));
    const dim = 1 - 0.7 * ctx.night;
    const pulse = 0.88 + 0.12 * Math.exp(-3.5 * kit.fract(now / BEAT));   // the bass, on the beat
    const inTurn = age < T1 + 0.05;

    // the hour show
    const showOn = date.getMinutes() === 0 && age < SHOW_END;
    const sh = showOn ? composition(M, next) : null;
    light.fill(1);
    if (sh) {
      if (age < COLLAPSE) for (const pl of sh.planes) {
        const u = kit.ease.out(kit.clamp((age - pl.start) / 0.7));
        if (u <= 0) continue;
        const len = pl.horiz ? pl.x1 - pl.x0 + 1 : pl.y1 - pl.y0 + 1;
        for (let c = pl.x0; c <= pl.x1; c++) for (let r = pl.y0; r <= pl.y1; r++) {
          const d = pl.horiz ? (pl.fromHi ? pl.x1 - c : c - pl.x0) : (pl.fromHi ? pl.y1 - r : r - pl.y0);
          light[idx(c, r)] = 1 - kit.clamp(u * (len + 1) - d);
        }
      } else {
        const back = kit.smoothstep(COLLAPSE, COLLAPSE + 0.7, age);
        for (const i of sh.stroke) light[i] = back;
      }
    }

    // streets
    vis.fill(0);
    const fronts = [];
    for (let s = 0; s < 4; s++) {
      const [ox, oy] = SLOTS[s];
      const changed = inTurn && prev[s] !== next[s];
      if (!changed) { for (const [c, r] of glyph(next[s]).cells) vis[idx(ox + c, oy + r)] = 1; continue; }
      const tr = transition(prev[s], next[s]);
      for (const k of tr.keep) vis[idx(ox + Math.floor(k / 7), oy + (k % 7))] = 1;
      const [pR, pA] = phases(tr, age);
      const sR = pR * tr.maxR, sA = pA * tr.maxA;
      const envR = kit.smoothstep(0, 0.12, pR), envA = kit.smoothstep(0, 0.12, pA) * (1 - kit.smoothstep(0.85, 1, pA));
      for (const [k, d] of tr.removed) {
        const i = idx(ox + Math.floor(k / 7), oy + (k % 7));
        vis[i] = kit.clamp(tr.maxR - d + 1 - sR);
        fronts.push([i, BLUE, envR * Math.max(0, 1 - Math.abs(tr.maxR - sR - d))]);
      }
      for (const [k, d] of tr.added) {
        const i = idx(ox + Math.floor(k / 7), oy + (k % 7));
        vis[i] = kit.clamp(sA - d + 1);
        fronts.push([i, RED, envA * Math.max(0, 1 - Math.abs(sA - d))]);
      }
    }
    const o = ctx.out;
    for (let i = 0; i < N * N; i++) {
      const v = vis[i] * light[i];
      if (v > 0) { const a = v * pulse * dim; o[3 * i] = YELLOW[0] * a; o[3 * i + 1] = YELLOW[1] * a; o[3 * i + 2] = YELLOW[2] * a; }
    }

    // taxis on the digit streets: two-way, half a cell per swung eighth
    const wk = walk(now), swV = avenue(now, true), swH = avenue(now, false);
    for (let s = 0; s < 4; s++) {
      const [ox, oy] = SLOTS[s];
      const changed = inTurn && prev[s] !== next[s];
      let pair = [[next[s], 1]];
      if (changed) { const [pR, pA] = phases(transition(prev[s], next[s]), age); pair = [[prev[s], 1 - kit.smoothstep(0, 0.5, pR)], [next[s], kit.smoothstep(0.5, 1, pA)]]; }
      for (const [ch, a] of pair) {
        if (a <= 0) continue;
        const g = glyph(ch), W = g.route.length;
        for (let k = 0; k < g.cars; k++) {
          const u = ((wk + (k * W) / g.cars + s * 3) % W + W) % W, n = Math.floor(u), f = sharp(u - n);
          const col = TAXIS[(k + s * 2 + ch.charCodeAt(0)) % TAXIS.length];
          for (const [lk, w] of [[g.route[n], 1 - f], [g.route[(n + 1) % W], f]]) {
            const i = idx(ox + Math.floor(lk / 7), oy + (lk % 7));
            car(ctx, i, kit.scale(col, dim), 0.85 * w * a * vis[i] * light[i]);
          }
        }
      }
    }
    // the crossings flash on the beat, like the squares Mondrian set where his lines meet
    const beat = Math.floor(now / BEAT), hit = Math.exp(-5 * kit.fract(now / BEAT));
    for (let s = 0; s < 4; s++) {
      const [ox, oy] = SLOTS[s];
      for (const k of glyph(next[s]).junctions) {
        const i = idx(ox + Math.floor(k / 7), oy + (k % 7));
        car(ctx, i, kit.scale([RED, BLUE, GREY][(beat + s) % 3], dim), 0.8 * hit * vis[i] * light[i]);
      }
    }
    for (const [i, col, w] of fronts) car(ctx, i, kit.scale(col, dim), w * light[i]);

    // the avenues: faint asphalt, cars that never stop
    for (let a = 0; a < N; a++) for (const at of [9, 10]) {
      for (const i of [idx(at, a), idx(a, at)]) { const k = AVE * (1 - ctx.night) * light[i]; o[3 * i] = YELLOW[0] * k; o[3 * i + 1] = YELLOW[1] * k; o[3 * i + 2] = YELLOW[2] * k; }
    }
    for (const L of LANES) {
      for (let k = 0; k < L.off.length; k++) {
        const x = (((L.dir * (L.v ? swV : swH) + L.off[k]) % LOOP) + LOOP) % LOOP, n = Math.floor(x), f = sharp(x - n);
        const col = kit.scale(CARS[(k + L.at + (L.v ? 0 : 3)) % CARS.length], dim);
        for (const [m, w] of [[n, 1 - f], [n + 1, f]]) {
          if (m >= N) continue;
          car(ctx, L.v ? idx(L.at, m) : idx(m, L.at), col, w);
        }
      }
    }

    if (!sh) return;
    // the composition's planes (the street layer was already darkened under them)
    if (age < COLLAPSE) {
      sh.planes.forEach((pl, pi) => {
        const col = planeColour(sh, pi, age);
        for (let c = pl.x0; c <= pl.x1; c++) for (let r = pl.y0; r <= pl.y1; r++) {
          const i = idx(c, r);
          if (sh.stroke.has(i)) continue;
          const cov = 1 - light[i];
          if (cov > 0) kit.add(ctx, i, col, cov * dim);
        }
      });
      return;
    }
    // the collapse: plane cells slide into the streets and become traffic
    for (const d of sh.dots) {
      const u = kit.clamp((age - d.start) / d.dur);
      if (d.dist === 0) { kit.add(ctx, idx(d.c, d.r), d.col, (1 - kit.smoothstep(0, 1, u)) * dim); continue; }
      if (u >= 1) {
        const fl = 1 - kit.smoothstep(0, 0.4, age - d.start - d.dur);
        if (fl > 0) car(ctx, idx(d.c + d.dx * d.dist, d.r + d.dy * d.dist), kit.scale(d.col, dim), 0.7 * fl);
        continue;
      }
      const pos = d.dist * kit.ease.inOut(u), n = Math.floor(pos), f = pos - n;
      const a = (1 - 0.4 * u) * dim;
      kit.add(ctx, idx(d.c + d.dx * n, d.r + d.dy * n), d.col, a * (1 - f));
      if (f > 0 && n + 1 <= d.dist) kit.add(ctx, idx(d.c + d.dx * (n + 1), d.r + d.dy * (n + 1)), d.col, a * f);
    }
  },
};
