// Gobbler, the game: one deterministic "level" per minute window, planned
// once from that minute's maze and cached. A window runs from second :04 to
// the next :04, so the minute turn falls in its scripted tail, when every
// actor stands in the fixed streets that no digit can move into:
//   :04  frog in the centre, beetles in their corners, flies in place
//   ...  the frog hops after the nearest fly (Dijkstra on a half-pixel grid,
//        right into the digits' bays); the beetles patrol the streets and
//        chase it, each with its own aim, but keep a shy 9 px away
//   :55  a power fly drifts down to the centre; the frog comes home
//   :58.5 tongue: power fly gone, beetles turn blue and flee to their corners
//   :00  the walls slide into the new digits (gobbler-maze), new flies swarm in
import { N, BORDER, glyphSegs } from './gobbler-maze.js';

export const NG = 63;                         // nav points at (i + 0.5, j + 0.5)
export const CX = 31.5, CY = 31.5;
const CLEAR = 4.25;                           // frog centre to wall skeleton
export const HOP_T = 0.4, HOP_L = 3.6;        // a hop: seconds, pixels
export const T_HOME = 53.5, T_POWER = 54.5, T_FLEE = 59.4, T_FLY = 51;
const TONGUE = 3.5;

const pad = (n) => String(n).padStart(2, '0');
export const digitsAt = (sec) => { const d = new Date(sec * 1000); return pad(d.getHours()) + pad(d.getMinutes()); };
const hash = (a, b = 0) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ----------------------------------------------------------- nav grid
function clearance(segs) {
  const C = new Float32Array(NG * NG).fill(9);
  for (const [ax, ay, bx, by] of segs) {
    const R = 6;
    const i0 = Math.max(0, Math.floor(Math.min(ax, bx) - R - 0.5)), i1 = Math.min(NG - 1, Math.ceil(Math.max(ax, bx) + R));
    const j0 = Math.max(0, Math.floor(Math.min(ay, by) - R - 0.5)), j1 = Math.min(NG - 1, Math.ceil(Math.max(ay, by) + R));
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = i + 0.5, y = j + 0.5;
      let t = ((x - ax) * dx + (y - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - ax - t * dx, y - ay - t * dy);
      if (d < C[j * NG + i]) C[j * NG + i] = d;
    }
  }
  return C;
}

const heapK = new Int32Array(NG * NG * 8), heapV = new Float32Array(NG * NG * 8);
/** Dijkstra over free nav points from point s: { dist, from }. */
function dijkstra(free, s, stop = null) {
  const dist = new Float32Array(NG * NG).fill(1e9), from = new Int32Array(NG * NG).fill(-1);
  let n = 0;
  const push = (k, v) => { let i = n++; while (i > 0) { const p = (i - 1) >> 1; if (heapV[p] <= v) break; heapK[i] = heapK[p]; heapV[i] = heapV[p]; i = p; } heapK[i] = k; heapV[i] = v; };
  const pop = () => {
    const k = heapK[0], lk = heapK[--n], lv = heapV[n];
    let i = 0;
    for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && heapV[c + 1] < heapV[c]) c++; if (heapV[c] >= lv) break; heapK[i] = heapK[c]; heapV[i] = heapV[c]; i = c; }
    heapK[i] = lk; heapV[i] = lv; return k;
  };
  dist[s] = 0; push(s, 0);
  while (n) {
    const k = pop(), d = dist[k], x = k % NG, y = (k / NG) | 0;
    if (d > dist[k] + 1e-6) continue;
    if (stop && stop(k, d)) return { dist, from, hit: k };
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= NG || ny >= NG) continue;
      const q = ny * NG + nx;
      if (!free[q]) continue;
      if (dx && dy && (!free[y * NG + nx] || !free[ny * NG + x])) continue;
      const nd = d + (dx && dy ? 1.4142 : 1);
      if (nd < dist[q] - 1e-6) { dist[q] = nd; from[q] = k; push(q, nd); }
    }
  }
  return { dist, from };
}

// -------------------------------------------------------- the streets
// Beetles keep to the fixed streets: three avenues and the cross street,
// plus the side tunnel through the border (off one edge, on at the other).
export const NODES = [[5.5, 5.5], [5.5, 31.5], [5.5, 57.5], [31.5, 5.5], [31.5, 31.5], [31.5, 57.5], [57.5, 5.5], [57.5, 31.5], [57.5, 57.5]];
const EDGES = [[0, 1], [1, 2], [3, 4], [4, 5], [6, 7], [7, 8], [1, 4], [4, 7], [1, 7]];
const TUN = 8, TUN_L = 19.5;
const elen = (e) => (e === TUN ? TUN_L : Math.hypot(NODES[EDGES[e][1]][0] - NODES[EDGES[e][0]][0], NODES[EDGES[e][1]][1] - NODES[EDGES[e][0]][1]));
/** Point s along edge e, measured from node `a`. */
function edgePt(e, a, s) {
  const [p, q] = EDGES[e], L = elen(e), u = a === p ? s : L - s;
  if (e === TUN) return u < 9.5 ? [5.5 - u, 31.5] : [67.5 - (u - 9.5), 31.5];
  const A = NODES[p], B = NODES[q], f = u / L;
  return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f];
}
const ADJ = NODES.map((_, n) => EDGES.map((e, k) => (e[0] === n ? [k, e[1]] : e[1] === n ? [k, e[0]] : null)).filter(Boolean));
function nodeDist(block = -1) {
  const D = NODES.map(() => NODES.map(() => 1e9));
  NODES.forEach((_, s) => {
    D[s][s] = 0;
    const Q = [s];
    while (Q.length) {   // tiny graph: Bellman-style relaxation
      const n = Q.shift();
      for (const [e, m] of ADJ[n]) {
        if (m === block && m !== s) continue;
        const d = D[s][n] + elen(e);
        if (d < D[s][m]) { D[s][m] = d; Q.push(m); }
      }
    }
  });
  return D;
}
const ND = nodeDist(), ND_FLEE = nodeDist(4);
/** Nearest street point to (x, y): [edge, distance from its first node]. */
function project(x, y) {
  let best = [1e9, 0, 0];
  EDGES.forEach(([p, q], e) => {
    if (e === TUN) return;
    const A = NODES[p], B = NODES[q], dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy);
    const t = Math.max(0, Math.min(1, ((x - A[0]) * dx + (y - A[1]) * dy) / (L * L)));
    const d = Math.hypot(x - A[0] - t * dx, y - A[1] - t * dy);
    if (d < best[0]) best = [d, e, t * L];
  });
  return [best[1], best[2]];
}
/** Street distance from node n to an edge point. */
function distTo(n, [e, s], D = ND) {
  const [p, q] = EDGES[e];
  return Math.min(D[n][p] + s, D[n][q] + elen(e) - s);
}

// ------------------------------------------------------------ a level
export const HOMES = [6, 0, 8, 2];          // red, pink, cyan, amber corners
const SCATTER = [[0, 5], [22, 27], [40, 44]];
export const BEETLE_HZ = 30;

const cache = new Map();
/** The planned level of minute window w (epoch minute). */
export function level(w) {
  if (cache.has(w)) return cache.get(w);
  if (cache.size > 6) cache.delete(cache.keys().next().value);
  const dg = digitsAt(w * 60);
  const segs = [...BORDER];
  for (let k = 0; k < 4; k++) segs.push(...glyphSegs(+dg[k], k));
  const clr = clearance(segs);
  const free = new Uint8Array(NG * NG);
  for (let j = 5; j <= 57; j++) for (let i = 5; i <= 57; i++) if (clr[j * NG + i] >= CLEAR) free[j * NG + i] = 1;
  const c0 = 31 * NG + 31;
  const home = dijkstra(free, c0);
  for (let k = 0; k < NG * NG; k++) if (home.dist[k] > 1e8) free[k] = 0;

  // flies: in tidy rows on the street lattice, then one in any bay the rows miss
  const LAT = [5.5, 12.5, 18.5, 25.5, 31.5, 37.5, 44.5, 50.5, 57.5];
  const flies = [];
  const addFly = (x, y) => flies.push({ x, y, k: (y - 0.5) * NG + (x - 0.5), te: Infinity, ph: hash((y - 0.5) * NG + (x - 0.5), w) * 6.283 });
  const near = (x, y, r) => flies.some((f) => Math.hypot(f.x - x, f.y - y) < r);
  for (const y of LAT) for (const x of LAT) {
    if (Math.hypot(x - CX, y - CY) < 7) continue;
    if (free[(y - 0.5) * NG + (x - 0.5)]) addFly(x, y);
  }
  for (let k = 0; k < NG * NG; k++) {
    if (!free[k]) continue;
    const x = (k % NG) + 0.5, y = ((k / NG) | 0) + 0.5;
    if (Math.hypot(x - CX, y - CY) < 7 || near(x, y, 6.2)) continue;
    addFly(x, y);
  }
  for (const f of flies) f.ts = -1;
  // later arrivals: every couple of seconds a fly drifts in from the edge
  const nFree = [];
  for (let k = 0; k < NG * NG; k++) if (free[k] && (k % NG) % 3 === 2 && ((k / NG) | 0) % 3 === 2) nFree.push(k);
  for (let j = 0, ts = 16; ts < 49 && nFree.length; j++, ts += 2.2 + 1.6 * hash(w, j + 50)) {
    const k = nFree[Math.floor(hash(w, j) * nFree.length)];
    const x = (k % NG) + 0.5, y = ((k / NG) | 0) + 0.5;
    if (Math.hypot(x - CX, y - CY) < 7 || near(x, y, 3)) continue;
    addFly(x, y);
    const f = flies[flies.length - 1], e = [x, 63 - x, y, 63 - y], q = e.indexOf(Math.min(...e));
    f.ts = ts; f.from = [[-3, y + 8], [66, y - 8], [x + 8, -3], [x - 8, 66]][q];
  }

  // the frog's route: nearest fly, again and again, until it must head home
  const route = [[CX, CY]];
  const sOf = (pts) => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; };
  let pos = c0, sNow = 0;
  const sBudget = (T_HOME / HOP_T) * HOP_L;
  const eats = [];
  const flyAt = new Int16Array(NG * NG).fill(-1);
  flies.forEach((f, i) => { if (flyAt[f.k] < 0) flyAt[f.k] = i; });
  const left = new Set(flies.map((_, i) => i));
  const pathPts = (D, k) => { const out = []; for (let q = k; q >= 0; q = D.from[q]) out.push([(q % NG) + 0.5, ((q / NG) | 0) + 0.5]); return out.reverse(); };
  for (;;) {
    const tNow = timeAtS(sNow), R = sBudget - sNow - TONGUE;
    // search outward from the frog; stop at the first catchable fly
    const D = dijkstra(free, pos, (k, d) => { const i = flyAt[k]; return i >= 0 && left.has(i) && flies[i].ts <= tNow && d + home.dist[k] <= R; });
    const fits = (k) => D.dist[k] + home.dist[k] <= R;
    const best = D.hit !== undefined ? flyAt[D.hit] : -1;
    let goal;
    if (best >= 0) goal = flies[best].k;
    else {   // nothing to catch just now: mooch about, sniffing, until a fly comes or it's time
      const far = left.size === 0 || [...left].every((i) => flies[i].ts > 99);
      const opts = [];
      for (let k = 0; k < NG * NG; k++) if (free[k] && D.dist[k] >= 6 && fits(k) && (far ? D.dist[k] > 20 : D.dist[k] <= 16)) opts.push(k);
      if (!opts.length) break;
      goal = opts[Math.floor(hash(w * 7 + eats.length, route.length) * opts.length)];
    }
    let pts = pathPts(D, goal);
    // stop a tongue's length short
    let cut = pts.length - 1, rem = 0;
    while (cut > 0 && rem + Math.hypot(pts[cut][0] - pts[cut - 1][0], pts[cut][1] - pts[cut - 1][1]) <= TONGUE) { rem += Math.hypot(pts[cut][0] - pts[cut - 1][0], pts[cut][1] - pts[cut - 1][1]); cut--; }
    pts = pts.slice(0, cut + 1);
    const endK = Math.round(pts[cut][1] - 0.5) * NG + Math.round(pts[cut][0] - 0.5);
    const len = sOf(pts);
    if (sNow + len + home.dist[endK] + TONGUE > sBudget) break;
    // flies passed on the way go too (the tongue flicks sideways)
    let s = sNow;
    for (let p = 1; p < pts.length; p++) {
      s += Math.hypot(pts[p][0] - pts[p - 1][0], pts[p][1] - pts[p - 1][1]);
      const tp = (s / HOP_L) * HOP_T;
      for (const i of left) if (i !== best && flies[i].ts <= tp && Math.hypot(flies[i].x - pts[p][0], flies[i].y - pts[p][1]) < 3.2) { eats.push([i, s]); left.delete(i); }
      route.push(pts[p]);
    }
    sNow = s;
    if (best >= 0) { eats.push([best, sNow]); left.delete(best); }
    else eats.push([-1, sNow]);
    pos = endK;
  }
  // home: to a tongue's length from the centre, where the power fly will be
  {
    const D = dijkstra(free, c0);
    let pts = pathPts(D, pos).reverse();
    let cut = pts.length - 1, rem = 0;
    while (cut > 0 && rem < 4) { rem += Math.hypot(pts[cut][0] - pts[cut - 1][0], pts[cut][1] - pts[cut - 1][1]); cut--; }
    pts = pts.slice(0, cut + 1);
    for (let p = 1; p < pts.length; p++) route.push(pts[p]);
  }
  const path = smoothPath(route);
  const L = path.s[path.s.length - 1];
  for (const [i, s] of eats) if (i >= 0) flies[i].te = timeAtS(Math.min(s, L));

  const lv = { w, digits: dg, flies, path, L, tArrive: timeAtS(L) };
  lv.beetles = beetles(lv);
  cache.set(w, lv);
  return lv;
}

// ------------------------------------------------------- frog motion
function smoothPath(pts) {
  // resample at 0.5 px, then average out the grid's staircase
  const raw = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [a, b] = [pts[i], pts[i + 1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / 0.5));
    for (let k = 0; k < n; k++) raw.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  raw.push(pts[pts.length - 1]);
  const R = 3, sm = raw.map((_, i) => {
    let x = 0, y = 0, n = 0;
    for (let k = -R; k <= R; k++) { const q = raw[Math.max(0, Math.min(raw.length - 1, i + k))]; x += q[0]; y += q[1]; n++; }
    return [x / n, y / n];
  });
  sm[0] = raw[0]; sm[sm.length - 1] = raw[raw.length - 1];
  const n = sm.length, X = new Float32Array(n), Y = new Float32Array(n), S = new Float32Array(n), F = new Int8Array(n);
  let face = 1;
  for (let i = 0; i < n; i++) {
    X[i] = sm[i][0]; Y[i] = sm[i][1];
    if (i) S[i] = S[i - 1] + Math.hypot(X[i] - X[i - 1], Y[i] - Y[i - 1]);
  }
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2), dx = X[b] - X[a];
    if (Math.abs(dx) > 0.6) face = dx > 0 ? 1 : -1;
    F[i] = face;
  }
  return { x: X, y: Y, s: S, face: F };
}
/** A frog's hop: the distance covered u of the way through one hop. */
const hopEase = (u) => { const t = Math.min(1, u / 0.72); return t * t * (3 - 2 * t); };
export const sAtTime = (t) => { const k = Math.floor(t / HOP_T); return HOP_L * (k + hopEase(t / HOP_T - k)); };
function timeAtS(s) {
  let lo = 0, hi = 200;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (sAtTime(m) < s) lo = m; else hi = m; }
  return hi;
}
/** Where on the path, at arc length s: [x, y, face]. */
export function pathAt(P, s) {
  const S = P.s, n = S.length;
  if (s <= 0) return [P.x[0], P.y[0], P.face[0]];
  if (s >= S[n - 1]) return [P.x[n - 1], P.y[n - 1], P.face[n - 1]];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
  const f = (s - S[lo]) / (S[hi] - S[lo] || 1);
  return [P.x[lo] + (P.x[hi] - P.x[lo]) * f, P.y[lo] + (P.y[hi] - P.y[lo]) * f, P.face[lo]];
}

// ------------------------------------------------------------ beetles
function beetles(lv) {
  const dt = 1 / BEETLE_HZ, steps = Math.ceil(60 * BEETLE_HZ) + 1;
  const out = HOMES.map(() => ({ x: new Float32Array(steps), y: new Float32Array(steps) }));
  const st = HOMES.map((h) => ({ a: h, e: ADJ[h][0][0], b: ADJ[h][0][1], s: 0, shy: -9 }));
  const frogAt = (t) => {
    const s = Math.min(sAtTime(t), lv.L), p = pathAt(lv.path, s), q = pathAt(lv.path, Math.min(lv.L, s + 2));
    const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
    return [p[0], p[1], dx / l || p[2], dy / l];
  };
  const kFlee = Math.round(T_POWER * BEETLE_HZ);
  for (let k = 0; k < kFlee; k++) {
    const t = k * dt, [fx, fy, hx, hy] = frogAt(t);
    const scatter = SCATTER.some(([a, b]) => t >= a && t < b);
    const speed = t > 46 ? 9 : 7.5;
    st.forEach((b, i) => {
      const [x, y] = edgePt(b.e, b.a, b.s);
      out[i].x[k] = x; out[i].y[k] = y;
      // shy: too close and heading in, turn round
      const dFrog = Math.hypot(x - fx, y - fy);
      if (dFrog < 10 && t - b.shy > 0.6) {
        const [nx, ny] = edgePt(b.e, b.a, Math.min(elen(b.e), b.s + 0.5));
        if (Math.hypot(nx - fx, ny - fy) < dFrog) { [b.a, b.b] = [b.b, b.a]; b.s = elen(b.e) - b.s; b.shy = t; }
      }
      // the final stand-off: they close in on the centre and wait in a ring round it
      const dC = Math.hypot(x - CX, y - CY);
      if (t > 48 && dC < 12.5 + 6 * i && dFrog > 7) {
        const [nx, ny] = edgePt(b.e, b.a, Math.min(elen(b.e), b.s + 0.5));
        if (Math.hypot(nx - CX, ny - CY) < dC) return;
      }
      b.s += (dFrog < 12 ? 11.5 : speed) * dt;   // and scurry when it comes for them
      while (b.s >= elen(b.e)) {
        b.s -= elen(b.e);
        const at = b.b;
        let tx, ty;
        if (t > 48) [tx, ty] = [CX, CY];
        else if (scatter) [tx, ty] = NODES[HOMES[i]];
        else if (i === 0) [tx, ty] = [fx, fy];
        else if (i === 1) [tx, ty] = [fx + 12 * hx, fy + 12 * hy];
        else if (i === 2) { const [rx, ry] = [out[0].x[k], out[0].y[k]]; [tx, ty] = [2 * (fx + 6 * hx) - rx, 2 * (fy + 6 * hy) - ry]; }
        else [tx, ty] = dFrog > 22 ? [fx, fy] : NODES[HOMES[i]];
        tx = Math.max(5.5, Math.min(57.5, tx)); ty = Math.max(5.5, Math.min(57.5, ty));
        const tgt = project(tx, ty);
        const opts = ADJ[at].filter(([e]) => e !== b.e || ADJ[at].length === 1);
        let best = null, bd = 1e9;
        for (const [e, m] of opts) {
          const d = elen(e) + distTo(m, tgt) + (e === TUN ? 6 : 0) + hash(k, i * 9 + e) * 0.5;
          if (d < bd) { bd = d; best = [e, m]; }
        }
        b.a = at; b.e = best[0]; b.b = best[1];
      }
    });
  }
  // frightened: home along the streets, never through the frog in the centre
  st.forEach((b, i) => {
    const goal = HOMES[i];
    const pts = [edgePt(b.e, b.a, b.s)];
    let n0;
    if (b.e === TUN) n0 = (b.a === EDGES[TUN][0] ? b.s : TUN_L - b.s) < 9.5 ? 1 : 7;   // out the near side
    else {
      // the end of this street that is not the centre, with the shorter way home
      const ends = [[b.a, b.s], [b.b, elen(b.e) - b.s]].filter(([n]) => n !== 4);
      [n0] = ends.reduce((p, q) => (q[1] + ND_FLEE[q[0]][goal] < p[1] + ND_FLEE[p[0]][goal] ? q : p));
    }
    let n = n0;
    pts.push(NODES[n]);
    while (n !== goal) {
      let nx = -1, via = -1;
      for (const [e, m] of ADJ[n]) if (m !== 4 && Math.abs(ND_FLEE[m][goal] + elen(e) - ND_FLEE[n][goal]) < 1e-3) { nx = m; via = e; break; }
      if (nx < 0) break;
      if (via === TUN) {   // through the tunnel: off one edge, on at the other
        const out = n === 1 ? [-4, 31.5] : [67, 31.5], back = n === 1 ? [67, 31.5, 'jump'] : [-4, 31.5, 'jump'];
        pts.push(out, back);
      }
      n = nx; pts.push(NODES[n]);
    }
    const cum = [0];
    for (let p = 1; p < pts.length; p++) cum.push(cum[p - 1] + (pts[p][2] === 'jump' ? 0 : Math.hypot(pts[p][0] - pts[p - 1][0], pts[p][1] - pts[p - 1][1])));
    const Lp = cum[cum.length - 1] || 1e-6;
    for (let k = kFlee; k < steps; k++) {
      const t = k * dt, u = Math.min(1, (t - T_POWER) / (T_FLEE - T_POWER));
      const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2, s = e * Lp;
      let p = 1; while (p < cum.length - 1 && (cum[p] < s || pts[p + 1]?.[2] === 'jump' && cum[p + 1] <= s)) p++;
      const f = Math.min(1, (s - cum[p - 1]) / ((cum[p] - cum[p - 1]) || 1));
      const A = pts[p - 1], B = pts[Math.min(p, pts.length - 1)];
      out[i].x[k] = A[0] + (B[0] - A[0]) * f; out[i].y[k] = A[1] + (B[1] - A[1]) * f;
    }
  });
  return out;
}
export { N };
