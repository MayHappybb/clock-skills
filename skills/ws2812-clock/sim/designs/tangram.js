// Tangram: four tangram sets on a black lacquer table, one set per arm of
// the plus, each laid out as a numeral (top H1, left H2, right M1, bottom
// M2: read it like text, 1 / 0 0 / 9). Hours are cinnabar lacquer, minutes
// jade glass. Each numeral sits in its gold-inlaid puzzle outline. A lamp
// drifts over the table and its reflection slides across the pieces; now
// and then a piece hitches itself back into place.
// Minute: the changing set lifts and every piece glides, turns (and the
// parallelogram flips over) into the new numeral while the new outline
// shows where they are going.
// Hour: all 28 pieces fly into the box in the middle, where four tangram
// sets tile ONE tangram square twice the size, piece for piece (each big
// piece is four small copies), and then fly back out to the new time.
import * as kit from '../js/kit.js';
import { TYPES, NUM, GIANT, GIANT_OUTLINES, polyOf, angDelta, SYM, matchSets } from './tangram-geo.js';

const U = 11;                       // px per unit (small-triangle leg)
const W = 192, H = 192;
const ARM = [[96, 32], [32, 96], [160, 96], [96, 160]];   // H1 top, H2 left, M1 right, M2 bottom
const BOX = [96, 96];
const LACQ = kit.hex('#d8401f'), LACQ_HI = kit.hex('#ff9a6a');
const JADE = kit.hex('#2fc28c'), JADE_HI = kit.hex('#b8ffe0');
const GOLD = kit.hex('#d9a441');
const POOL = kit.hex('#ffb070');

const img = new Float32Array(3 * W * H);
const shade = new Float32Array(W * H);
const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => pad(d.getHours()) + pad(d.getMinutes());

// ------------------------------------------------------------ placement
/** Pixel centre of digit d in arm a, snapped so the unit grid lies on pixel edges. */
function digitOrigin(a, d) {
  const n = NUM[d], [cx, cy] = ARM[a];
  return [Math.round(cx - (n.w * U) / 2) + (n.w * U) / 2, Math.round(cy - (n.h * U) / 2) + (n.h * U) / 2];
}
/** Rest pose (px) of piece i of digit d in arm a. */
function restPose(a, d, i, o) {
  const p = NUM[d].poses[i], [ox, oy] = digitOrigin(a, d);
  o.x = ox + p.x * U; o.y = oy + p.y * U; o.th = p.th; o.fx = p.fx;
  return o;
}

// giant-square slots for each (set, piece): greedy nearest by arm
const SLOT = [[], [], [], []];
{
  const free = GIANT.map((g, j) => j), pairs = [];
  for (let a = 0; a < 4; a++) for (let i = 0; i < 7; i++) for (const j of free) {
    if (GIANT[j].t !== TYPES[i]) continue;
    const sx = BOX[0] + GIANT[j].x * U, sy = BOX[1] + GIANT[j].y * U;
    // the big L and S triangles each take one material: hours lacquer, minutes jade
    const gm = { 0: 0, 1: 1, 3: 0, 4: 1 }[GIANT[j].g], mat = a < 2 ? 0 : 1;
    pairs.push([Math.hypot(sx - ARM[a][0], sy - ARM[a][1]) + (gm !== undefined && gm !== mat ? 1000 : 0), a, i, j]);
  }
  pairs.sort((p, q) => p[0] - q[0]);
  const used = new Set(), done = new Set();
  for (const [, a, i, j] of pairs) { if (used.has(j) || done.has(a * 7 + i)) continue; used.add(j); done.add(a * 7 + i); SLOT[a][i] = j; }
}

// ----------------------------------------------------- outlines (puzzle cards)
const sil = new Map();
/** Signed distance field (px) of digit d's silhouette over its arm tile (64 x 64, arm-local). */
function silField(a, d) {
  const key = a * 10 + +d;
  if (sil.has(key)) return sil.get(key);
  const f = new Float32Array(64 * 64).fill(99), o = { x: 0, y: 0, th: 0, fx: 1 };
  const bx = ARM[a][0] - 32, by = ARM[a][1] - 32;
  for (let i = 0; i < 7; i++) {
    restPose(a, d, i, o);
    const poly = polyOf(TYPES[i], o.x, o.y, o.th, o.fx, U);
    const E = edges(poly);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const px = bx + x + 0.5, py = by + y + 0.5;
      let dd = -1e9;
      for (let e = 0; e < E.length; e += 3) { const v = E[e] * px + E[e + 1] * py - E[e + 2]; if (v > dd) dd = v; }
      // outside: true distance to the outline (the plane maximum spikes out at sharp corners)
      if (dd > 0) { dd = 1e9; for (let k = 0; k < poly.length; k++) { const p = poly[k], q = poly[(k + 1) % poly.length]; dd = Math.min(dd, kit.segDist(px, py, p[0], p[1], q[0], q[1])); } }
      if (dd < f[y * 64 + x]) f[y * 64 + x] = dd;
    }
  }
  // counters stay clean: outside pixels not reachable from the tile edge (through
  // gaps wider than ~2 px) get no keyline
  const seen = new Uint8Array(64 * 64), stack = [];
  for (let k = 0; k < 64; k++) for (const q of [k, 63 * 64 + k, k * 64, k * 64 + 63]) if (f[q] > 1.2 && !seen[q]) { seen[q] = 1; stack.push(q); }
  while (stack.length) {
    const q = stack.pop(), x = q % 64, y = (q - x) / 64;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, n = ny * 64 + nx;
      if (nx < 0 || ny < 0 || nx > 63 || ny > 63 || seen[n] || f[n] <= 1.2) continue;
      seen[n] = 1; stack.push(n);
    }
  }
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const q = y * 64 + x;
    if (!(f[q] > 0) || seen[q]) continue;
    let near = false;
    for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < 64 && ny < 64 && seen[ny * 64 + nx] === 1) { near = true; break; }
    }
    if (!near) f[q] = 99;
  }
  sil.set(key, f);
  return f;
}
/** Edge planes of a convex polygon: [nx, ny, c] * n, outward normals. */
function edges(poly, out = []) {
  out.length = 0;
  let area = 0;
  for (let k = 0; k < poly.length; k++) { const p = poly[k], q = poly[(k + 1) % poly.length]; area += p[0] * q[1] - q[0] * p[1]; }
  const sg = area > 0 ? 1 : -1;
  for (let k = 0; k < poly.length; k++) {
    const p = poly[k], q = poly[(k + 1) % poly.length];
    let nx = (q[1] - p[1]) * sg, ny = -(q[0] - p[0]) * sg;
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    out.push(nx, ny, nx * p[0] + ny * p[1]);
  }
  return out;
}

// --------------------------------------------------------------- static box
// The lid of the box carries the double square's dissection in faint gold;
// a brush re-draws it in brighter gold over each minute (the seconds).
let boxImg = null;
const boxS = new Float32Array(64 * 64), boxW = new Float32Array(64 * 64), SEGS = [];
let SEG_LEN = 0;
function buildBox() {
  boxImg = new Float32Array(3 * 64 * 64);
  // unique edges of the seven big pieces, in drawing order
  const seen = new Set();
  for (const pl of GIANT_OUTLINES) for (let k = 0; k < pl.length; k++) {
    const p = pl[k], q = pl[(k + 1) % pl.length];
    const ka = `${p[0].toFixed(2)},${p[1].toFixed(2)}`, kb = `${q[0].toFixed(2)},${q[1].toFixed(2)}`;
    const key = ka < kb ? ka + kb : kb + ka;
    if (seen.has(key)) continue;
    seen.add(key);
    const ax = 32 + p[0] * U, ay = 32 + p[1] * U, bx = 32 + q[0] * U, by = 32 + q[1] * U, l = Math.hypot(bx - ax, by - ay);
    SEGS.push([ax, ay, bx, by, SEG_LEN, l]); SEG_LEN += l;
  }
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const px = x + 0.5, py = y + 0.5;
    let dl = 1e9, sp = 0;
    for (const [ax, ay, bx, by, s0, l] of SEGS) {
      const d = kit.segDist(px, py, ax, ay, bx, by);
      if (d < dl) { dl = d; sp = s0 + kit.clamp(((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / (l * l)) * l; }
    }
    const edge = Math.min(px, py, 64 - px, 64 - py);
    let r = 0, g = 0, b = 0;
    const gl = 1 - kit.smoothstep(0.2, 0.9, dl);                  // maki-e lines
    boxS[y * 64 + x] = sp; boxW[y * 64 + x] = gl;
    r += GOLD[0] * 0.05 * gl; g += GOLD[1] * 0.05 * gl; b += GOLD[2] * 0.05 * gl;
    if (edge < 1.6) { const k = 0.16 * (1 - edge / 1.6); r += GOLD[0] * k; g += GOLD[1] * k; b += GOLD[2] * k; }  // rim
    boxImg[3 * (y * 64 + x)] = r; boxImg[3 * (y * 64 + x) + 1] = g; boxImg[3 * (y * 64 + x) + 2] = b;
  }
}

// ----------------------------------------------------------------- pieces
const P = [];
for (let a = 0; a < 4; a++) for (let i = 0; i < 7; i++) P.push({ a, i, t: TYPES[i], mat: a < 2 ? 0 : 1, x: 0, y: 0, th: 0, fx: 1, z: 0, glint: 0 });
const tmpA = { x: 0, y: 0, th: 0, fx: 1 }, tmpB = { x: 0, y: 0, th: 0, fx: 1 };

/** Glide piece p from pose A to pose B with progress u (0..1), lifting on the way. */
function glide(p, A, B, u, lift, bend) {
  const e = kit.ease.inOut(kit.clamp(u));
  const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
  const arc = Math.sin(Math.PI * e) * bend * Math.min(L, 60) * 0.18;
  p.x = A.x + dx * e - (dy / L) * arc; p.y = A.y + dy * e + (dx / L) * arc;
  p.th = A.th + angDelta(A.th, B.th, SYM[p.t]) * e;
  p.fx = A.fx === B.fx ? A.fx : A.fx * Math.cos(Math.PI * e);
  p.z = Math.sin(Math.PI * kit.clamp(u)) * lift;
}

const perms = new Map();
function permFor(da, db) {
  const k = da + db;
  if (!perms.has(k)) perms.set(k, matchSets(NUM[da].poses, NUM[db].poses));
  return perms.get(k);
}

/** Set every piece's pose for wall time now (seconds). */
function pose(now) {
  const M = Math.floor(now / 60), sec = now - M * 60;
  const cur = digitsOf(new Date(M * 60000)), prev = digitsOf(new Date((M - 1) * 60000)), next = digitsOf(new Date((M + 1) * 60000));
  const minute = new Date(M * 60000).getMinutes();
  // the hour show runs from 2.2 s before the hour to 2.6 s after
  let tH = null, oldD = null, newD = null;
  if (minute === 59 && sec >= 57.8) { tH = sec - 60; oldD = cur; newD = next; }
  else if (minute === 0 && sec < 2.6) { tH = sec; oldD = prev; newD = cur; }
  const st = { show: tH, fill: [0, 0, 0, 0], from: cur, to: cur, mix: [1, 1, 1, 1] };
  for (const p of P) {
    const a = p.a, i = p.i;
    p.glint = 0;
    if (tH !== null) {
      const g = GIANT[SLOT[a][i]];
      const B = tmpB; B.x = BOX[0] + g.x * U; B.y = BOX[1] + g.y * U; B.th = g.th; B.fx = g.fx;
      const din = -2.2 + 0.09 * i + 0.13 * ((a * 3) % 4), dout = 0.35 + 0.08 * (6 - i) + 0.12 * a;
      if (tH < dout) {
        restPose(a, oldD[a], i, tmpA);
        glide(p, tmpA, B, (tH - din) / 1.25, 1.0, a % 2 ? 1 : -1);
        // landing settle in the box
        const s = tH - (din + 1.25);
        if (s > 0) p.z = 0.18 * Math.exp(-s * 7) * Math.abs(Math.sin(s * 18));
      } else {
        // the new numeral's piece of this type, matched from the slot side
        restPose(a, newD[a], i, tmpA);
        glide(p, B, tmpA, (tH - dout) / 1.3, 1.0, a % 2 ? -1 : 1);
      }
      p.glint = tH;
      continue;
    }
    const changed = prev[a] !== cur[a];
    if (changed && sec < 2.8) {
      const perm = permFor(prev[a], cur[a]);
      // piece i of prev goes to slot perm[i] of cur
      restPose(a, prev[a], i, tmpA); restPose(a, cur[a], perm[i], tmpB);
      const order = (i * 3) % 7, d0 = 0.1 + 0.11 * order;
      glide(p, tmpA, tmpB, (sec - d0) / 1.5, 1.0, i % 2 ? 1.6 : -1.6);
      continue;
    }
    // at rest: in this minute's numeral; perm keeps identity consistent after a turn
    const perm = changed ? permFor(prev[a], cur[a]) : null;
    restPose(a, cur[a], perm ? perm[i] : i, p);
    p.z = 0;
    // hitch: once or twice a minute a piece lifts a hair, turns and clicks back
    for (let n = 0; n < 2; n++) {
      const h = kit.hash(M, a * 7 + n, 11);
      if (Math.floor(h * 7) !== i) continue;
      const t0 = 6 + n * 26 + 18 * kit.hash(M, a, n + 3), s = (sec - t0) / 0.9;
      if (s <= 0 || s >= 1) continue;
      const w = Math.sin(Math.PI * s), sg = kit.hash(M, a, n) > 0.5 ? 1 : -1;
      p.z = 0.22 * w;
      p.th += sg * 0.07 * w * Math.cos(s * 9);
      p.x += sg * 0.9 * w; p.y -= 0.5 * w;
    }
  }
  // outline cards: which numeral each arm shows and how much of its inlay is filled
  for (let a = 0; a < 4; a++) {
    if (tH !== null) {
      const fl = kit.smoothstep(-2.2, -1.4, tH) * (1 - kit.smoothstep(1.6, 2.6, tH));
      st.fill[a] = fl;
      st.from = oldD; st.to = newD; st.mix[a] = kit.smoothstep(-0.25, 0.25, tH);
    } else if (prev[a] !== cur[a] && sec < 3) {
      st.fill[a] = kit.smoothstep(0, 0.35, sec) * (1 - kit.smoothstep(1.9, 2.9, sec));
      st.from = prev; st.to = cur; st.mix[a] = kit.smoothstep(0.05, 0.4, sec);
    }
  }
  if (tH === null) { st.from = prev; st.to = cur; }
  return st;
}

// ------------------------------------------------------------------ draw
const E = [];
function drawPiece(p, lx, ly, dim, glintT, sweep) {
  const s = 1 + 0.1 * p.z;
  const poly = polyOf(p.t, p.x, p.y, p.th, p.fx, U * s);
  edges(poly, E);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const [x, y] of poly) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const X0 = Math.max(0, Math.floor(x0) - 1), X1 = Math.min(W - 1, Math.ceil(x1) + 1), Y0 = Math.max(0, Math.floor(y0) - 1), Y1 = Math.min(H - 1, Math.ceil(y1) + 1);
  // light direction from the piece towards the lamp
  let ldx = lx - p.x, ldy = ly - p.y; const ll = Math.hypot(ldx, ldy) + 30; ldx /= ll; ldy /= ll;
  const glass = p.mat === 1, base = glass ? JADE : LACQ, hi = glass ? JADE_HI : LACQ_HI;
  const face = 0.55 + 0.45 * Math.abs(p.fx);             // edge-on while flipping
  const ne = E.length;
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    const px = x + 0.5, py = y + 0.5;
    let d = -1e9, best = 0;
    for (let e = 0; e < ne; e += 3) { const v = E[e] * px + E[e + 1] * py - E[e + 2]; if (v > d) { d = v; best = e; } }
    const cov = kit.clamp(-0.05 - d);                 // ~1 px gap between neighbours
    if (cov <= 0) continue;
    const inner = -d;
    const facing = E[best] * ldx + E[best + 1] * ldy;  // bevel facing the lamp: -1..1
    const bev = inner < 2.2 ? 1 - inner / 2.2 : 0;
    const sx = px - lx, sy = py - ly, spec = Math.exp(-(sx * sx + sy * sy) / (glass ? 120 : 260));
    let r, g, b;
    if (glass) {
      const caus = kit.noise2(px * 0.15 + glintT * 0.21, py * 0.15 - glintT * 0.17);
      const k = 0.42 + 0.3 * caus, rim = (1 - kit.clamp(inner / 3.2)) ** 2 * (0.5 + 0.5 * facing);
      r = base[0] * k + hi[0] * 0.55 * rim; g = base[1] * k + hi[1] * 0.55 * rim; b = base[2] * k + hi[2] * 0.55 * rim;
    } else {
      const k = 0.78 + 0.2 * facing * bev;
      r = base[0] * k; g = base[1] * k; b = base[2] * k;
      if (facing > 0) { const rr = bev * facing * 0.45; r += hi[0] * rr; g += hi[1] * rr; b += hi[2] * rr; }
    }
    r *= face; g *= face; b *= face;
    // the hour's glint: a band of light runs across the finished double square
    const gb = sweep > -1e3 ? px + py - sweep : 1e3;
    const sp = spec * (glass ? 0.7 : 0.45) + (gb * gb < 400 ? 0.55 * Math.exp(-gb * gb / 40) : 0);
    r += sp; g += sp * 0.92; b += sp * 0.82;
    const j = 3 * (y * W + x), a = cov;
    img[j] += (r * dim - img[j]) * a; img[j + 1] += (g * dim - img[j + 1]) * a; img[j + 2] += (b * dim - img[j + 2]) * a;
  }
}

function drawShadow(p, lx, ly) {
  if (p.z <= 0.01) return;
  let ax = p.x - lx, ay = p.y - ly; const l = Math.hypot(ax, ay) + 1; ax /= l; ay /= l;
  const off = 1.5 + 7 * p.z, poly = polyOf(p.t, p.x + ax * off, p.y + ay * off, p.th, p.fx, U);
  edges(poly, E);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const [x, y] of poly) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const soft = 1 + 2.5 * p.z, ne = E.length;
  for (let y = Math.max(0, Math.floor(y0 - soft)); y <= Math.min(H - 1, Math.ceil(y1 + soft)); y++)
    for (let x = Math.max(0, Math.floor(x0 - soft)); x <= Math.min(W - 1, Math.ceil(x1 + soft)); x++) {
      let d = -1e9;
      for (let e = 0; e < ne; e += 3) { const v = E[e] * (x + 0.5) + E[e + 1] * (y + 0.5) - E[e + 2]; if (v > d) d = v; }
      const c = kit.clamp(0.5 - d / soft);
      if (c > 0) shade[y * W + x] *= 1 - 0.8 * c;
    }
}

export default {
  name: 'Tangram',
  blurb: 'four tangram sets laid out as the time on a lacquer table; on the hour all 28 pieces tile one double-size tangram in the box',
  layouts: ['hub-cross'], look: 'smoke', fps: 60, brightness: 0.5, dither: true,
  frame(ctx) {
    const G = kit.grid(ctx);
    if (!boxImg) { buildBox(); for (let a = 0; a < 4; a++) for (let d = 0; d < 10; d++) silField(a, String(d)); }  // all caches up front: no mid-run hitch
    const now = ctx.date.getTime() / 1000;
    const dim = 1 - 0.6 * ctx.night;
    const st = pose(now);
    // the lamp drifts slowly over the table
    const lx = 96 + 62 * Math.sin((kit.TAU * now) / 23), ly = 96 + 48 * Math.sin((kit.TAU * now) / 31 + 1.3);
    // ground: lacquer table, lamp pool, inlaid outlines, the box
    shade.fill(1);
    for (const p of P) drawShadow(p, lx, ly);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const j = y * W + x;
      if (G.idx[j] < 0) { img[3 * j] = img[3 * j + 1] = img[3 * j + 2] = 0; continue; }
      const dx = x - lx, dy = y - ly, pool = 0.03 * Math.exp(-(dx * dx + dy * dy) / 2400);
      img[3 * j] = POOL[0] * pool; img[3 * j + 1] = POOL[1] * pool; img[3 * j + 2] = POOL[2] * pool;
    }
    // box
    const sec = kit.secOf(ctx.date), S = (sec / 60) * SEG_LEN, old = 1 - kit.smoothstep(0, 1.2, sec);
    let tx = 0, ty = 0;
    for (const [ax, ay, bx, by, s0, l] of SEGS) if (S >= s0 && S <= s0 + l) { const u = (S - s0) / l; tx = ax + (bx - ax) * u; ty = ay + (by - ay) * u; }
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const q = y * 64 + x, j = 3 * ((64 + y) * W + 64 + x), k = 3 * q;
      // brush: drawn part brighter, fresh ink brightest; last minute's drawing fades at :00
      const w = boxW[q], ds = S - boxS[q];
      let g = 0;
      if (w > 0) g = w * (ds >= 0 ? 0.12 + 0.25 * Math.exp(-ds / 14) : 0.12 * old);
      const ex = x + 0.5 - tx, ey = y + 0.5 - ty, tip = 0.5 * Math.exp(-(ex * ex + ey * ey) / 3);
      g += tip;
      img[j] += boxImg[k] + GOLD[0] * g; img[j + 1] += boxImg[k + 1] + GOLD[1] * g; img[j + 2] += boxImg[k + 2] + GOLD[2] * g;
    }
    // outlines: gold keyline round each numeral, filled in while its pieces are away
    for (let a = 0; a < 4; a++) {
      const fa = silField(a, st.from[a]), fb = silField(a, st.to[a]), m = st.mix[a], fill = st.fill[a];
      const bx = ARM[a][0] - 32, by = ARM[a][1] - 32;
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const q = y * 64 + x, da = fa[q], db = fb[q];
        if (da > 3 && db > 3) continue;
        const ka = (da > 0 ? Math.max(0, 1 - Math.abs(da - 1.6) / 0.9) * 0.16 : fill * 0.12), kb = (db > 0 ? Math.max(0, 1 - Math.abs(db - 1.6) / 0.9) * 0.16 : fill * 0.12);
        const k = ka * (1 - m) + kb * m;
        if (k <= 0) continue;
        const j = 3 * ((by + y) * W + bx + x);
        img[j] += GOLD[0] * k; img[j + 1] += GOLD[1] * k; img[j + 2] += GOLD[2] * k;
      }
    }
    for (let j = 0; j < W * H; j++) { const s = shade[j]; if (s < 1) { img[3 * j] *= s; img[3 * j + 1] *= s; img[3 * j + 2] *= s; } }
    // pieces, low to high
    const order = P.slice().sort((p, q) => p.z - q.z);
    const sweep = st.show !== null && st.show > -0.45 && st.show < 0.55 ? 128 + 256 * ((st.show + 0.45) / 1.0) - 64 : -1e9;
    for (const p of order) drawPiece(p, lx, ly, 1, now, sweep);
    kit.blitGrid(ctx, img, dim);
  },
};
