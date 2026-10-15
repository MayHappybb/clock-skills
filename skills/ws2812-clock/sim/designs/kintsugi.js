// Kintsugi: a black tenmoku tea bowl seen from above, and the time is the
// gold. Every numeral is a real break line in the bowl, mended with gold
// lacquer: jagged, tapering, carried on to the rim by a fine gold thread.
// A window is reflected in the glaze (with a branch swaying in it), each
// mended shard catches it a little differently, and a glint runs along the
// seams. Minute: the old seam heals back into the glaze, a crack races along
// the new numeral, then liquid gold flows in from one end with a bright
// meniscus that cools. Hour: after the minute's mend the whole bowl cracks
// along its old break lines and the clay falls away in 3D shards, tilting
// and glinting, while the gold numerals hang in the air; the shards rise
// back, and gold floods every crack before the extra ones heal.
import * as kit from '../js/kit.js';
import { crackPath, rasterPaths, walkTail } from './kintsugi-crack.js';

const W = 64, H = 64, N = W * H;
const BOWL = { cx: 31.5, cy: 31.5, ri: 28.3, ro: 31.4 };
// hours big on top, minutes smaller below: the bowl is round, the time follows it
const SLOTS = [
  { x0: 13.6, y0: 9.4, W: 16, H: 24, wMax: 2.25 },
  { x0: 33.4, y0: 9.4, W: 16, H: 24, wMax: 2.25 },
  { x0: 17.8, y0: 38.4, W: 12.6, H: 17.6, wMax: 1.95 },
  { x0: 33.6, y0: 38.4, W: 12.6, H: 17.6, wMax: 1.95 },
];
const GOLD = kit.hex('#d8962a'), GOLD_HI = kit.hex('#ffe7a6'), HOT = kit.hex('#fff3d6');
const CLAY = kit.hex('#d9ccb8');

const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => pad(d.getHours()) + pad(d.getMinutes());

// ------------------------------------------------------------------ the bowl (static)
let BASE = null;
function buildBase() {
  const r = new Float32Array(N), g = new Float32Array(N), b = new Float32Array(N);
  const kind = new Uint8Array(N), cover = new Float32Array(N), gloss = new Float32Array(N);
  const nX = new Float32Array(N), nY = new Float32Array(N), nZ = new Float32Array(N);
  const Ld = norm3(0.7, -0.2, 0.6);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x, dx = x - BOWL.cx, dy = y - BOWL.cy, rr = Math.hypot(dx, dy) || 1e-3;
    let inside = 0;
    for (let s = 0; s < 4; s++) { const ox = (s & 1) * 0.5 - 0.25, oy = (s >> 1) * 0.5 - 0.25; if (Math.hypot(dx + ox, dy + oy) < BOWL.ro) inside++; }
    cover[p] = inside / 4;
    if (!inside) continue;
    const ux = dx / rr, uy = dy / rr;
    let nx, ny, nz, cr, cg, cb;
    if (rr < BOWL.ri) {
      kind[p] = 1;
      const q = rr / BOWL.ri, phi = 1.05 * q ** 1.6;
      nx = -ux * Math.sin(phi); ny = -uy * Math.sin(phi); nz = Math.cos(phi);
      const lit = Math.max(0, nx * Ld[0] + ny * Ld[1] + nz * Ld[2]);
      const k = lit ** 2.2;
      // hare's-fur: fine radial streaks running down into the well
      const ang = Math.atan2(dy, dx), fur = kit.noise2(ang * 26, rr * 0.12) * 0.6 + kit.noise2(ang * 61, rr * 0.3) * 0.4;
      const furK = 0.72 + 0.56 * fur * kit.smoothstep(4, 20, rr);
      cr = (0.004 + 0.016 * k) * furK; cg = (0.008 + 0.03 * k) * furK; cb = (0.024 + 0.08 * k) * furK;
      // glaze pools deeper and greener in the well
      const pool = (1 - kit.smoothstep(0, 12, rr)) ** 2;
      cg += 0.005 * pool; cb += 0.006 * pool;
      // speckles: pale bubbles and rust
      const h1 = kit.hash(x, y, 11);
      if (h1 < 0.05) { const a = kit.hash(x, y, 12); cr += 0.010 * a; cg += 0.011 * a; cb += 0.014 * a; }
      else if (h1 < 0.08) { const a = kit.hash(x, y, 13); cr += 0.013 * a; cg += 0.005 * a; cb += 0.001 * a; }
      gloss[p] = 1;
    } else {
      kind[p] = 2;
      const t = kit.clamp((rr - BOWL.ri) / (BOWL.ro - BOWL.ri)), nr = (2 * t - 1) * 0.92, nzz = Math.sqrt(1 - nr * nr);
      nx = ux * nr; ny = uy * nr; nz = nzz;
      const lit = Math.max(0, nx * Ld[0] + ny * Ld[1] + nz * Ld[2]);
      // the glaze thins to persimmon brown on the lip
      cr = 0.05 * (0.2 + 1.1 * lit); cg = 0.021 * (0.2 + 1.1 * lit); cb = 0.009 * (0.2 + 1.1 * lit);
      gloss[p] = 0.6;
    }
    const cv = cover[p];
    r[p] = cr * cv; g[p] = cg * cv; b[p] = cb * cv;
    nX[p] = nx; nY[p] = ny; nZ[p] = nz;
  }
  // glaze bubbles that twinkle when the window light crosses them
  const spark = [];
  for (let p = 0; p < N; p++) if (kind[p] === 1 && kit.hash(p, 5, 77) < 0.045) spark.push(p);
  const sheen = new Float32Array(N);
  for (let p = 0; p < N; p++) sheen[p] = 0.6 * kit.noise2((p % W) * 0.45, ((p / W) | 0) * 0.45) + 0.4 * kit.hash(p, 3);
  return { r, g, b, kind, cover, gloss, nX, nY, nZ, sheen, spark: Int32Array.from(spark), sparkPh: Float32Array.from(spark, (p) => kit.hash(p, 9) * 100) };
}
function norm3(x, y, z) { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; }

// ------------------------------------------------------------- branch in the window
const BR_U = 28, BR_V = 40;     // mask in reflection-local pixels: u radial (-14..14), v tangential (-20..20)
let BRANCH = null;
function buildBranch() {
  const m = new Float32Array(BR_U * BR_V);
  const segs = [];
  // a twig crossing the window, with side shoots and leaves
  const main = [[-14, -17], [-8, -9], [-3, -3], [1, 3], [5, 10], [9, 19]];
  for (let i = 0; i + 1 < main.length; i++) segs.push([...main[i], ...main[i + 1], 1.15 - i * 0.1]);
  segs.push([-3, -3, -8, 2, 0.75], [-8, 2, -11, 4, 0.55], [1, 3, 6, -2, 0.7], [6, -2, 9, -4, 0.5], [5, 10, 1, 14, 0.6]);
  const leaves = [[-11, 4, 3.0, 1.5, 0.6], [9, -4, 2.8, 1.4, -0.5], [1, 14, 3.0, 1.5, 2.0], [-8, -9, 2.6, 1.3, 1.2], [9, 19, 3.0, 1.5, 0.9], [-6, 1, 2.4, 1.2, -0.3], [3, 6, 2.6, 1.3, 1.9], [-2, -6, 2.4, 1.2, -1.0]];
  for (let iu = 0; iu < BR_U; iu++) for (let iv = 0; iv < BR_V; iv++) {
    const u = iu - BR_U / 2, v = iv - BR_V / 2;
    let a = 0;
    for (const [au, av, bu, bv, w] of segs) a = Math.max(a, 1 - kit.smoothstep(w - 0.5, w + 0.6, kit.segDist(u, v, au, av, bu, bv)));
    for (const [cu, cv, ra, rb, th] of leaves) {
      const du = u - cu, dv = v - cv, c = Math.cos(th), s = Math.sin(th);
      const q = Math.hypot((du * c + dv * s) / ra, (-du * s + dv * c) / rb);
      a = Math.max(a, 1 - kit.smoothstep(0.75, 1.15, q));
    }
    m[iu * BR_V + iv] = a;
  }
  return m;
}
function branchAt(u, v) {
  const fu = u + BR_U / 2, fv = v + BR_V / 2;
  if (fu < 0 || fv < 0 || fu >= BR_U - 1 || fv >= BR_V - 1) return 0;
  const iu = fu | 0, iv = fv | 0, tu = fu - iu, tv = fv - iv, k = iu * BR_V + iv;
  const B = BRANCH;
  return (B[k] * (1 - tv) + B[k + 1] * tv) * (1 - tu) + (B[k + BR_V] * (1 - tv) + B[k + BR_V + 1] * tv) * tu;
}
// ------------------------------------------------------------- the cracks of a minute
const FIELDS = new Map();
function fieldFor(digs) {
  let F = FIELDS.get(digs);
  if (F) return F;
  F = {
    e: new Float32Array(N).fill(99), d: new Float32Array(N), s: new Float32Array(N), slot: new Int8Array(N).fill(-1),
    te: new Float32Array(N).fill(99), tpx: new Float32Array(N), tslot: new Int8Array(N).fill(-1),
    L: new Float32Array(4), specP: [], specK: [], specS: [], specA: [], shards: null,
  };
  const paths = [];
  for (let k = 0; k < 4; k++) {
    const dg = +digs[k], S = SLOTS[k], seed = dg * 31 + k * 7 + 1;
    const c = crackPath(dg, { x0: S.x0, y0: S.y0, W: S.W, H: S.H, rot: (kit.hash(seed, 1) - 0.5) * 0.07 }, seed, S.wMax);
    c.slot = k; F.L[k] = c.L; paths.push(c);
    // a side fracture or two splitting off the seam (outward, never into a counter)
    const nb = dg === 1 || dg === 7 ? 0 : 1 + (kit.hash(seed, 50) < 0.4 ? 1 : 0);
    for (let j = 0; j < nb; j++) {
      // only on the side of the numeral that faces the rim, pointing at the rim
      let i = -1, best = 0.55;
      for (let t = 0; t < 8; t++) {
        const q = 2 + Math.floor(kit.hash(seed, j * 8 + t, 51) * (c.n - 4));
        const qx = c.pts[2 * q], qy = c.pts[2 * q + 1];
        const ax = qx - (S.x0 + S.W / 2), ay = qy - (S.y0 + S.H / 2), rx = qx - BOWL.cx, ry = qy - BOWL.cy;
        const sc = (ax * rx + ay * ry) / ((Math.hypot(ax, ay) * Math.hypot(rx, ry)) || 1);
        if (sc > best) { best = sc; i = q; }
      }
      if (i < 0) continue;
      const bx = c.pts[2 * i], by = c.pts[2 * i + 1];
      let ox = bx - BOWL.cx, oy = by - BOWL.cy; const ol = Math.hypot(ox, oy) || 1;
      const turn = (kit.hash(seed, j, 52) - 0.5) * 1.0, cs = Math.cos(turn), sn = Math.sin(turn);
      const dx = (ox / ol) * cs - (oy / ol) * sn, dy = (ox / ol) * sn + (oy / ol) * cs, len = 2.6 + kit.hash(seed, j, 53) * 1.6;
      const s0 = c.cum[i];
      paths.push({ slot: k, n: 3, L: c.L, branch: true,
        pts: Float32Array.of(bx, by, bx + dx * len * 0.5 + dy * 0.4, by + dy * len * 0.5 - dx * 0.4, bx + dx * len, by + dy * len),
        w: Float32Array.of(S.wMax * 0.6, S.wMax * 0.38, 0.25), cum: Float32Array.of(s0, s0 + len * 0.5, s0 + len) });
    }
    // gold dust beside the seam
    for (let j = 0; j < 4; j++) {
      const i = Math.min(c.n - 2, 1 + Math.floor(kit.hash(seed, j, 21) * (c.n - 2)));
      const ax = c.pts[2 * i], ay = c.pts[2 * i + 1], tx = c.pts[2 * i + 2] - ax, ty = c.pts[2 * i + 3] - ay, tl = Math.hypot(tx, ty) || 1;
      const side = kit.hash(seed, j, 22) < 0.5 ? -1 : 1, off = 2.3 + kit.hash(seed, j, 23) * 0.9;
      const px = Math.round(ax - (ty / tl) * off * side), py = Math.round(ay + (tx / tl) * off * side);
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      F.specP.push(py * W + px); F.specK.push(k); F.specS.push(c.cum[i] / c.L); F.specA.push(0.1 + 0.12 * kit.hash(seed, j, 24));
    }
  }
  rasterPaths(F, paths, W, H, 3);
  // ungilded hairlines carry each break on to the rim
  const hit = (x, y) => {
    const px = Math.round(x), py = Math.round(y);
    if (px < 0 || py < 0 || px >= W || py >= H) return true;
    const p = py * W + px; return F.e[p] < 0.7 || F.te[p] < 0.4;
  };
  for (const c of paths) {
    if (c.branch) continue;
    const seed = +digs[c.slot] * 31 + c.slot * 7 + 1, P = c.pts, n = c.n, starts = [];
    // one hairline per numeral, from its point nearest the rim, outward
    let bi = 0, br = -1;
    for (let i = 0; i < n; i++) { const r = Math.hypot(P[2 * i] - BOWL.cx, P[2 * i + 1] - BOWL.cy) + kit.hash(seed, i, 31) * 3; if (r > br) { br = r; bi = i; } }
    starts.push([P[2 * bi], P[2 * bi + 1], P[2 * bi] - BOWL.cx, P[2 * bi + 1] - BOWL.cy]);
    starts.forEach(([x, y, dx, dy], j) => {
      const T = walkTail(x, y, dx, dy, seed * 3 + j, BOWL, hit);
      rasterTail(F, T, c.slot);
    });
  }
  FIELDS.set(digs, F);
  if (FIELDS.size > 6) FIELDS.delete(FIELDS.keys().next().value);
  return F;
}
function rasterTail(F, T, slot) {
  const n = T.length / 2;
  let cum = 0;
  const total = (() => { let s = 0; for (let i = 1; i < n; i++) s += Math.hypot(T[2 * i] - T[2 * i - 2], T[2 * i + 1] - T[2 * i - 1]); return s; })();
  for (let i = 0; i + 1 < n; i++) {
    const ax = T[2 * i], ay = T[2 * i + 1], bx = T[2 * i + 2], by = T[2 * i + 3];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-6, sl = Math.sqrt(l2);
    for (let y = Math.max(0, Math.floor(Math.min(ay, by) - 2)); y <= Math.min(H - 1, Math.ceil(Math.max(ay, by) + 2)); y++)
      for (let x = Math.max(0, Math.floor(Math.min(ax, bx) - 2)); x <= Math.min(W - 1, Math.ceil(Math.max(ax, bx) + 2)); x++) {
        let t = ((x - ax) * dx + (y - ay) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const along = cum + t * sl, w = 0.85 - 0.45 * (along / (total || 1));
        const e = Math.hypot(ax + t * dx - x, ay + t * dy - y) - w / 2, p = y * W + x;
        if (e < F.te[p] && F.e[p] > 0.2) { F.te[p] = e; F.tpx[p] = along; F.tslot[p] = slot; }
      }
    cum += sl;
  }
}

// ------------------------------------------------------------- the hour's shards
// the hour's old break lines: a Voronoi of nine shards, each mended at a
// slightly different angle, so each catches the light a little differently
const VOR = new Map();
function voronoiFor(hr) {
  let V = VOR.get(hr);
  if (V) return V;
  const seeds = [];
  seeds.push([BOWL.cx + (kit.hash(hr, 1) - 0.5) * 8, BOWL.cy + (kit.hash(hr, 2) - 0.5) * 8]);
  for (let k = 0; k < 8; k++) {
    const a = (k + kit.hash(hr, k, 3) * 0.6) * kit.TAU / 8, r = 15 + kit.hash(hr, k, 4) * 12;
    seeds.push([BOWL.cx + r * Math.cos(a), BOWL.cy + r * Math.sin(a)]);
  }
  const vd = new Float32Array(N).fill(99), vs = new Float32Array(N), lab = new Int8Array(N).fill(-1);
  const ix = seeds[0][0], iy = seeds[0][1];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x;
    if (!BASE.cover[p]) continue;
    const jx = x + (kit.noise2(x * 0.35, y * 0.35 + 9) - 0.5) * 3, jy = y + (kit.noise2(x * 0.35 + 4, y * 0.35) - 0.5) * 3;
    let b1 = 1e9, b2 = 1e9, i1 = 0, i2 = 0;
    for (let k = 0; k < seeds.length; k++) {
      const d = (jx - seeds[k][0]) ** 2 + (jy - seeds[k][1]) ** 2;
      if (d < b1) { b2 = b1; i2 = i1; b1 = d; i1 = k; } else if (d < b2) { b2 = d; i2 = k; }
    }
    vd[p] = (b2 - b1) / (2 * Math.hypot(seeds[i1][0] - seeds[i2][0], seeds[i1][1] - seeds[i2][1]));
    vs[p] = Math.hypot(x - ix, y - iy);
    lab[p] = i1;
  }
  const tone = new Float32Array(N).fill(1);
  for (let p = 0; p < N; p++) if (lab[p] >= 0) tone[p] = 0.78 + 0.44 * kit.hash(hr, lab[p], 61);
  V = { vd, vs, lab, tone, ix, iy };
  VOR.set(hr, V);
  if (VOR.size > 3) VOR.delete(VOR.keys().next().value);
  return V;
}
function shardsFor(F, digs) {
  if (F.shards) return F.shards;
  const hr = +digs.slice(0, 2), V = voronoiFor(hr), vd = V.vd, vs = V.vs, ix = V.ix, iy = V.iy;
  const comp = new Int16Array(N).fill(-1);
  // shards: what is left between every crack, found by flood fill
  const isVoid = (p) => !BASE.cover[p] || F.e[p] < 0.2 || F.te[p] < 0.05 || vd[p] < 0.5;
  const stack = new Int32Array(N), cxs = [], cys = [];
  let nc = 0;
  for (let p0 = 0; p0 < N; p0++) {
    if (comp[p0] >= 0 || isVoid(p0)) continue;
    let sp = 0, cnt = 0, sx = 0, sy = 0; const members = [];
    stack[sp++] = p0; comp[p0] = nc;
    while (sp) {
      const p = stack[--sp], x = p % W, y = (p / W) | 0;
      members.push(p); cnt++; sx += x; sy += y;
      if (x > 0 && comp[p - 1] < 0 && !isVoid(p - 1)) { comp[p - 1] = nc; stack[sp++] = p - 1; }
      if (x < W - 1 && comp[p + 1] < 0 && !isVoid(p + 1)) { comp[p + 1] = nc; stack[sp++] = p + 1; }
      if (y > 0 && comp[p - W] < 0 && !isVoid(p - W)) { comp[p - W] = nc; stack[sp++] = p - W; }
      if (y < H - 1 && comp[p + W] < 0 && !isVoid(p + W)) { comp[p + W] = nc; stack[sp++] = p + W; }
    }
    if (cnt < 6) { for (const p of members) comp[p] = -2; continue; }
    cxs.push(sx / cnt); cys.push(sy / cnt); nc++;
  }
  const edge = new Uint8Array(N);
  for (let p = 0; p < N; p++) {
    const c = comp[p]; if (c < 0) continue;
    const x = p % W, y = (p / W) | 0;
    if ((x > 0 && comp[p - 1] !== c) || (x < W - 1 && comp[p + 1] !== c) || (y > 0 && comp[p - W] !== c) || (y < H - 1 && comp[p + W] !== c)) edge[p] = 1;
  }
  const h1 = new Float32Array(nc), h2 = new Float32Array(nc), h3 = new Float32Array(nc);
  for (let j = 0; j < nc; j++) { h1[j] = kit.hash(hr, j, 41); h2[j] = kit.hash(hr, j, 42); h3[j] = kit.hash(hr, j, 43); }
  F.shards = { vd, vs, comp, edge, nc, cx: Float32Array.from(cxs), cy: Float32Array.from(cys), h1, h2, h3, ix, iy };
  return F.shards;
}
// ------------------------------------------------------------- the window
const SKY = [[0, [0.3, 0.4, 0.72]], [5.5, [0.3, 0.4, 0.72]], [7, [1.0, 0.6, 0.46]], [9, [1.0, 0.92, 0.8]],
  [16, [1.0, 0.92, 0.8]], [18, [1.0, 0.52, 0.22]], [20, [0.3, 0.4, 0.72]], [24, [0.3, 0.4, 0.72]]];
function skyAt(hf) {
  let k = 0; while (k < SKY.length - 2 && SKY[k + 1][0] <= hf) k++;
  const [t0, c0] = SKY[k], [t1, c1] = SKY[k + 1], u = kit.smoothstep(t0, t1, hf);
  return kit.mix(c0, c1, u);
}

const IMG = new Float32Array(3 * N), GLD = new Float32Array(3 * N), REFL = new Float32Array(N);
const ACC = new Float32Array(3 * N), WAC = new Float32Array(N);
const chg = new Uint8Array(4), oldA = new Float32Array(4), crackF = new Float32Array(4), flowF = new Float32Array(4);
const tailF = new Float32Array(4), tailG = new Float32Array(4), glintP = new Float32Array(4), heatK = new Float32Array(4), waveF = new Float32Array(4);

export default {
  name: 'Kintsugi',
  blurb: 'a black tea bowl mended in gold: the numerals are its break lines; cracks race, gold flows, and on the hour the bowl shatters and mends',
  layouts: ['hub'], look: { look: 'opal', gap: 1.4 }, fps: 60, brightness: 0.35, dither: true,
  frame(ctx) {
    BASE ??= buildBase(); BRANCH ??= buildBranch();
    const G = kit.grid(ctx);
    const now = ctx.date.getTime() / 1000, a = kit.secOf(ctx.date);
    const cur = digitsOf(ctx.date), prev = digitsOf(new Date(ctx.date.getTime() - (a + 1) * 1000));
    const NF = fieldFor(cur), OF = fieldFor(prev);
    const isHour = ctx.date.getMinutes() === 0 && a < 9.5;
    const tNew = voronoiFor(ctx.date.getHours()).tone, tOld = voronoiFor(+prev.slice(0, 2)).tone;
    const tMix = ctx.date.getMinutes() === 0 && a < 2.8 ? kit.smoothstep(2.3, 2.8, a) : 1;
    const hf = ctx.date.getHours() + ctx.date.getMinutes() / 60 + a / 3600;

    // light of the hour: colour, where the window reflects, which way it shines
    const night = ctx.night, cloud = 0.88 + 0.24 * (kit.noise2(now * 0.06, 4.2) - 0.5);
    const Lc = kit.scale(skyAt(hf), cloud);
    const th = Math.PI + 0.3 * kit.clamp((hf - 12.5) / 6.5, -1, 1);
    const rcx = BOWL.cx + 22 * Math.cos(th), rcy = BOWL.cy + 22 * Math.sin(th), cth = Math.cos(th), sth = Math.sin(th);
    const Ld = norm3(-cth * 0.75, -sth * 0.75 - 0.2, 0.62), Hv = norm3(Ld[0], Ld[1], Ld[2] + 1);
    const sway = 1.3 * Math.sin(now * 0.55) + 0.6 * Math.sin(now * 1.37 + 2) * (0.4 + kit.noise2(now * 0.15, 1));
    const glazeK = 1 - 0.45 * night, goldK = 1 - 0.4 * night, reflK = 0.3 * (1 - 0.3 * night);

    // where each digit is in its turn
    const T0 = 1.15, TB = 2.8, TR = 6.1;   // gold flows; the hour: bowl falls away; shards return
    for (let k = 0; k < 4; k++) {
      chg[k] = cur[k] !== prev[k] ? 1 : 0;
      oldA[k] = chg[k] ? 1 - kit.smoothstep(0, 0.75, a) : 0;
      crackF[k] = chg[k] ? (a - 0.55) / 0.45 : 9;
      tailF[k] = chg[k] ? (a - 1.0) * 70 : 999;
      flowF[k] = chg[k] ? (a < T0 ? -1 : kit.ease.inOut(kit.clamp((a - T0) / 1.4)) * 1.02) : 9;
      heatK[k] = chg[k] ? 1 - kit.smoothstep(T0 + 1.3, T0 + 2.2, a) : 0;
      waveF[k] = isHour && a > TR && a < TR + 1.8 ? kit.ease.inOut((a - TR) / 1.5) * 1.1 : -9;
      tailG[k] = chg[k] ? kit.smoothstep(T0 + 1.3, T0 + 1.9, a) : 1;
      glintP[k] = kit.fract(now / 7.5 + k * 0.29) * 1.6 - 0.3;
    }
    const flash = a > 1.0 && a < 1.6 ? Math.exp(-(a - 1.0) / 0.12) : 0;

    // the hour: shatter, lift, settle, flood with gold
    let lift = 0, S = null, gapK = 0;
    if (isHour) {
      S = shardsFor(NF, cur);
      lift = a < TB ? 0 : a < TB + 1.1 ? kit.ease.inOut((a - TB) / 1.1) : a < TR - 1.1 ? 1 : a < TR ? 1 - kit.ease.inOut((a - TR + 1.1) / 1.1) : 0;
      gapK = kit.smoothstep(0, 0.1, lift);
    }
    const vRace = isHour ? (a - 2.3) / 0.45 * 36 : -1, contact = isHour ? Math.exp(-Math.abs(a - TR) / 0.12) : 0;
    const vGold = isHour ? (a - TR) / 1.2 * 36 : -1, vFade = isHour ? 1 - kit.smoothstep(TR + 1.3, TR + 3.1, a) : 0;
    const B = BASE, img = IMG, TAIL = 0.075;
    const L0 = Lc[0], L1 = Lc[1], L2 = Lc[2];
    for (let y = 0, p = 0; y < H; y++) for (let x = 0; x < W; x++, p++) {
      const cv = B.cover[p], o = 3 * p;
      if (!cv) { img[o] = img[o + 1] = img[o + 2] = GLD[o] = GLD[o + 1] = GLD[o + 2] = 0; REFL[p] = 0; continue; }
      const tn = tOld[p] + (tNew[p] - tOld[p]) * tMix, gk = glazeK * tn;
      let r = B.r[p] * gk, g = B.g[p] * gk, b = B.b[p] * gk;
      // the window, reflected in the glaze, a branch moving across it
      const dx = x - rcx, dy = y - rcy, v = -dx * sth + dy * cth, u = dx * cth + dy * sth + v * v / 42;
      let refl = 0;
      const au = u < 0 ? -u : u, av = v < 0 ? -v : v;
      if (au < 13 && av < 21) {
        const box = (1 - kit.smoothstep(3.2, 4.6, au)) * (1 - kit.smoothstep(10, 12.5, av));
        refl = (box > 0 ? box * (1 - 0.85 * branchAt(u + sway * 0.3, v + sway)) : 0) + 0.22 * Math.exp(-(u * u / 40 + v * v / 200));
      }
      refl *= B.gloss[p] * cv; REFL[p] = refl;
      const rt = refl * (tn * tn);
      r += L0 * rt * reflK; g += L1 * rt * reflK; b += L2 * rt * reflK;
      if (B.kind[p] === 2) {
        const sp = Math.max(0, B.nX[p] * Hv[0] + B.nY[p] * Hv[1] + B.nZ[p] * Hv[2]), s = sp ** 24 * 0.2 * cv * glazeK;
        r += L0 * s; g += L1 * s; b += L2 * s;
      }
      let ar = 0, ag = 0, ab = 0, cr = 0, cg = 0, cb = 0, moat = 0;
      // the gold of this minute
      const k = NF.slot[p];
      if (k >= 0) {
        const e = NF.e[p], s = NF.s[p], L = NF.L[k], cov = kit.clamp(0.5 - e);
        let gA = 1, cA = 1;
        if (chg[k]) { gA = kit.clamp((flowF[k] - s) * L / 1.2 + 0.5); cA = kit.clamp((crackF[k] - s) * L + 0.5); }
        moat = (1 - kit.smoothstep(0, 1.8, e)) * Math.max(gA, 0.6 * cA);
        if (gA > 0 && cov > 0) {
          let gl = (s - glintP[k]) * L / 3; gl = Math.exp(-gl * gl);
          const sh = 0.88 + 0.3 * B.sheen[p], hi = refl * 0.75, hg = 0.55 * gl;
          let qr = GOLD[0] * sh + GOLD_HI[0] * (hi * L0 + hg), qg = GOLD[1] * sh + GOLD_HI[1] * (hi * L1 + hg), qb = GOLD[2] * sh + GOLD_HI[2] * (hi * L2 + hg);
          if (heatK[k] > 0) {
            const dist = (flowF[k] - s) * L, ht = Math.exp(-dist / 5) * heatK[k], bead = 0.7 * Math.exp(-dist * dist / 1.5) * heatK[k];
            qr += (HOT[0] - qr) * ht + HOT[0] * bead; qg += (HOT[1] - qg) * ht + HOT[1] * bead; qb += (HOT[2] - qb) * ht + HOT[2] * bead;
          }
          if (waveF[k] > -1) { const dw = (waveF[k] - s) * L, bd = 0.6 * Math.exp(-dw * dw / 3); qr += HOT[0] * bd; qg += HOT[1] * bd; qb += HOT[2] * bd; }
          const m = cov * gA; ar += qr * m; ag += qg * m; ab += qb * m;
        }
        if (chg[k] && cA > 0 && gA < 1) {
          // a fresh hairline: pale clay showing through, a spark at its tip
          const hl = kit.clamp(1.0 - NF.d[p]), tip = (crackF[k] - s) * L;
          const spark = crackF[k] < 1.08 ? Math.exp(-tip * tip / 1.2) : 0;
          const lev = (0.16 + 0.4 * flash + 1.2 * spark) * hl * cA * (1 - gA);
          cr += CLAY[0] * lev; cg += CLAY[1] * lev; cb += CLAY[2] * lev;
          if (e > 0 && e < 3.5) {     // the shards either side lift a hair as it passes
            const tp = a - (0.55 + 0.45 * s);
            if (tp > 0 && tp < 1) { const lb = Math.exp(-tp / 0.2) * (1 - e / 3.5) * 0.05; cr += CLAY[0] * lb; cg += CLAY[1] * lb; cb += CLAY[2] * lb; }
          }
        }
      }
      // last minute's seam, healing back into the glaze
      const ko = OF.slot[p];
      if (ko >= 0 && chg[ko] && oldA[ko] > 0) {
        const A = oldA[ko], cov = kit.clamp(0.5 - OF.e[p]) * A * A * 0.46;
        moat = Math.max(moat, (1 - kit.smoothstep(0, 1.8, OF.e[p])) * A);
        ar += GOLD[0] * cov; ag += GOLD[1] * cov; ab += GOLD[2] * cov;
      }
      // the fine gold thread carrying each break on to the rim (a spark runs it as it cracks)
      const kt = NF.tslot[p];
      if (kt >= 0) {
        const tc = kit.clamp(0.5 - NF.te[p]);
        if (tc > 0) {
          let gl = TAIL, sp = 0;
          if (chg[kt]) {
            const fr = tailF[kt] - NF.tpx[p];
            gl = fr < 0 ? 0 : TAIL * tailG[kt];
            sp = fr < 0 || tailG[kt] > 0 ? 0 : 0.5 * Math.exp(-fr * fr / 2);
          }
          const m = tc * kit.smoothstep(1.5, 5, NF.tpx[p]), gm = gl * m, sm = sp * m;
          ar += GOLD[0] * gm; ag += GOLD[1] * gm; ab += GOLD[2] * gm;
          cr += CLAY[0] * sm; cg += CLAY[1] * sm; cb += CLAY[2] * sm;
        }
      }
      const kto = OF.tslot[p];
      if (kto >= 0 && chg[kto] && oldA[kto] > 0) {
        const lev = TAIL * kit.clamp(0.5 - OF.te[p]) * kit.smoothstep(1.5, 5, OF.tpx[p]) * oldA[kto];
        ar += GOLD[0] * lev; ag += GOLD[1] * lev; ab += GOLD[2] * lev;
      }
      // the hour: the whole bowl's break lines
      if (S) {
        const vd = S.vd[p];
        if (vd < 1.4) {
          const vc = kit.clamp(0.8 - vd), vs = S.vs[p];
          if (vs < vRace) {
            const tip = vRace - vs, lev = vc * ((0.06 + 0.5 * Math.exp(-tip * tip / 4) + 0.6 * contact) * (a < TR ? 1 : vFade));
            cr += CLAY[0] * lev; cg += CLAY[1] * lev; cb += CLAY[2] * lev;
          }
          if (vs < vGold && vFade > 0) {
            const fr = vGold - vs, m = vc * vFade * (0.3 + 0.6 * Math.exp(-fr * fr / 3));
            ar += GOLD[0] * m; ag += GOLD[1] * m; ab += GOLD[2] * m;
            moat = Math.max(moat, 0.5 * vc * vFade);
          }
        }
      }
      const dk = 1 - 0.65 * moat;
      img[o] = r * dk + cr * glazeK; img[o + 1] = g * dk + cg * glazeK; img[o + 2] = b * dk + cb * glazeK;
      GLD[o] = ar * goldK; GLD[o + 1] = ag * goldK; GLD[o + 2] = ab * goldK;
    }
    // glaze bubbles twinkle in the window light
    for (let j = 0; j < B.spark.length; j++) {
      const p = B.spark[j], rf = REFL[p];
      if (rf < 0.05) continue;
      const tw = (0.5 + 0.5 * Math.sin(now * 1.9 + B.sparkPh[j])) ** 16 * rf * 0.16 * glazeK;
      img[3 * p] += L0 * tw; img[3 * p + 1] += L1 * tw; img[3 * p + 2] += L2 * tw;
    }
    // gold dust
    for (let j = 0; j < NF.specP.length; j++) {
      const k = NF.specK[j];
      if (chg[k] && flowF[k] < NF.specS[j]) continue;
      const p = NF.specP[j], m = NF.specA[j] * (0.75 + 0.25 * Math.sin(now * 2.3 + j * 1.7) + REFL[p] * 2) * goldK;
      GLD[3 * p] += GOLD[0] * m; GLD[3 * p + 1] += GOLD[1] * m; GLD[3 * p + 2] += GOLD[2] * m;
    }
    const out = ctx.out, idx = G.idx;
    if (!S || lift <= 0) {
      for (let p = 0; p < N; p++) { const i = idx[p]; if (i < 0) continue; out[3 * i] = img[3 * p] + GLD[3 * p]; out[3 * i + 1] = img[3 * p + 1] + GLD[3 * p + 1]; out[3 * i + 2] = img[3 * p + 2] + GLD[3 * p + 2]; }
      return;
    }
    splatShards(S, lift, a, Ld, Hv, Lc, glazeK);
    for (let p = 0; p < N; p++) {
      const i = idx[p]; if (i < 0) continue;
      const w = WAC[p], k = w > 0 ? Math.min(1, w * 1.2) / w : 0;
      let r = ACC[3 * p] * k, g = ACC[3 * p + 1] * k, b = ACC[3 * p + 2] * k;
      if (S.comp[p] < 0) { const f = 1 - gapK; r += img[3 * p] * f; g += img[3 * p + 1] * f; b += img[3 * p + 2] * f; }
      out[3 * i] = r + GLD[3 * p]; out[3 * i + 1] = g + GLD[3 * p + 1]; out[3 * i + 2] = b + GLD[3 * p + 2];
    }
  },
};

/** Lift every shard in 3D and splat it back onto the raster (bilinear, perspective). */
function splatShards(S, lift, a, Ld, Hv, Lc, glazeK) {
  ACC.fill(0); WAC.fill(0);
  const nc = S.nc, P = S.tr ??= new Float32Array(nc * 12);
  const F = 150, flatSpec = Hv[2] ** 60;
  for (let j = 0; j < nc; j++) {
    const h1 = S.h1[j], h2 = S.h2[j], h3 = S.h3[j];
    // each shard lets go a moment apart, and comes home a moment apart
    const dn = kit.clamp((a - 2.8 - 0.3 * h2) / 0.9), up = kit.clamp((a - 5.0 - 0.25 * (1 - h2)) / 0.85);
    const lift = kit.ease.inOut(dn) * (1 - kit.ease.inOut(up));
    const theta = lift * (0.5 + 0.6 * h1) + lift * 0.14 * Math.sin((a - 2.8) * 1.6 + h2 * 6);
    const al = h2 * kit.TAU, ax = Math.cos(al), ay = Math.sin(al), px = -ay, py = ax;
    const phi = lift * (h3 - 0.5) * 0.7 + lift * 0.08 * Math.sin((a - 2.8) * 1.3 + h1 * 5);
    let dx = S.cx[j] - S.ix, dy = S.cy[j] - S.iy; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    const disp = lift * (3.0 + 5.0 * h1), z = -lift * (20 + 60 * h3);   // the clay falls away below the gold
    const st = Math.sin(theta), ct = Math.cos(theta);
    const nx = -px * st, ny = -py * st, nz = ct;
    const shade = kit.clamp(0.45 + 0.55 * (nx * Ld[0] + ny * Ld[1] + nz * Ld[2]) / Ld[2], 0.3, 1.9) * Math.max(0.3, 1 + z / 110);
    const spec = Math.max(0, Math.max(0, nx * Hv[0] + ny * Hv[1] + nz * Hv[2]) ** 60 - flatSpec) * 0.35 * glazeK;
    const q = 12 * j;
    P[q] = Math.cos(phi); P[q + 1] = Math.sin(phi); P[q + 2] = ax; P[q + 3] = ay; P[q + 4] = px; P[q + 5] = py;
    P[q + 6] = ct; P[q + 7] = st; P[q + 8] = S.cx[j] + dx * disp; P[q + 9] = S.cy[j] + dy * disp; P[q + 10] = z; P[q + 11] = shade;
    S.spec ??= new Float32Array(nc); S.spec[j] = spec; S.lj ??= new Float32Array(nc); S.lj[j] = lift;
  }
  const img = IMG, comp = S.comp, cover = BASE.cover;
  for (let y = 0, p = 0; y < H; y++) for (let x = 0; x < W; x++, p++) {
    const j = comp[p]; if (j < 0) continue;
    const q = 12 * j, rx0 = x - S.cx[j], ry0 = y - S.cy[j];
    const rx = rx0 * P[q] - ry0 * P[q + 1], ry = rx0 * P[q + 1] + ry0 * P[q];
    const aa = rx * P[q + 2] + ry * P[q + 3], qq = rx * P[q + 4] + ry * P[q + 5];
    const X = P[q + 8] + P[q + 2] * aa + P[q + 4] * qq * P[q + 6], Y = P[q + 9] + P[q + 3] * aa + P[q + 5] * qq * P[q + 6];
    const Z = P[q + 10] + qq * P[q + 7], pr = F / (F - Z);
    const sx = BOWL.cx + (X - BOWL.cx) * pr, sy = BOWL.cy + (Y - BOWL.cy) * pr;
    const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
    const sh = P[q + 11], sp = S.spec[j] * cover[p] + (S.edge[p] ? 0.12 * S.lj[j] * glazeK : 0);
    const cr = img[3 * p] * sh + Lc[0] * sp, cg = img[3 * p + 1] * sh + Lc[1] * sp, cb = img[3 * p + 2] * sh + Lc[2] * sp;
    for (let t = 0; t < 4; t++) {
      const X2 = ix + (t & 1), Y2 = iy + (t >> 1);
      if (X2 < 0 || Y2 < 0 || X2 >= W || Y2 >= H) continue;
      const w = ((t & 1) ? fx : 1 - fx) * ((t >> 1) ? fy : 1 - fy);
      if (w <= 0) continue;
      const d = Y2 * W + X2;
      ACC[3 * d] += cr * w; ACC[3 * d + 1] += cg * w; ACC[3 * d + 2] += cb * w; WAC[d] += w;
    }
  }
}
