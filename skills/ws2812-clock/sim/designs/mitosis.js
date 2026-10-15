// Mitosis: two hexagonal fields of view under a fluorescence microscope.
// In each field two cells sit pressed together along a straight wall (the
// board's middle column). Each cell's chromosomes (DAPI blue, magenta
// kinetochores) are condensed into the shape of one digit: hours on the
// left field, minutes on the right.
//
// Every cell is somewhere in its own cell cycle. Its centrosome (GFP-green,
// with a flickering aster of microtubules) duplicates and the two migrate
// round the nucleus to opposite poles as the cell nears division: the
// minutes-units cell runs a 60 s cycle, the minutes-tens 10 min, the hour
// cells one hour. Yellow vesicles ride the microtubules out and back.
//
// When a digit changes, its cell divides: the rods slide onto the
// metaphase plate (a straight 30-degree lattice line), the spindle grows,
// sister chromatids are pulled apart, a red actin ring pinches the cell and
// one daughter swims out of the field with the old chromatin, decondensed.
// The other daughter's chromatin condenses into the new digit.
//
// On the hour a tissue crowds into both fields (nuclei on a hexagonal
// sub-lattice of the LEDs) and a mitotic wave sweeps left to right through
// it and the four digit cells, green spindles flashing; then the fields
// clear. The wave staggers the digit cells, so the time never goes blank.
//
// Look: opal, 4 mm. A fluorescence micrograph is soft glows on black; the
// diffuser turns the dots into exactly that, while 4 mm keeps strokes apart.
//
// Stateless: everything is a function of the wall clock and ctx.t.
import * as kit from '../js/kit.js';

const SQ3 = Math.sqrt(3), DX = 2 * SQ3;
const { clamp, smoothstep: sst, ease, hash } = kit;

// ------------------------------------------------------------ palette
const CHROM = [0.0, 0.16, 1.0];          // DAPI
const CORE = [0.10, 0.30, 0.22];          // added at stroke cores: chromatin glows paler
const CEN = [1.0, 0.04, 0.5];             // kinetochores
const TUB = [0.08, 1.0, 0.16];            // GFP tubulin
const ACT = [1.0, 0.03, 0.0];            // phalloidin actin
const VES = [1.0, 0.62, 0.0];             // vesicles (red + green colocalised)
const CUT = 4 / 255 / 0.6;                 // the dimmest level kept (brightness 0.6)

// ------------------------------------------------------------ the glyphs
// Each digit is a few chromosomes: rods (Catmull-Rom through control points)
// or ring chromosomes. Box: x -10..10, y -18..18 mm. `cen` = centromere at
// that fraction of the length.
const ell = (cx, cy, rx, ry) => Array.from({ length: 12 }, (_, k) => [cx + rx * Math.sin(k * Math.PI / 6), cy - ry * Math.cos(k * Math.PI / 6)]);
const GLYPHS = {
  0: [{ p: ell(0, 0, 8.3, 16.3), closed: true, cen: 0.1 }],
  1: [{ p: [[0, -17.4], [0.3, -6], [-0.2, 6], [0, 17.4]], cen: 0.3 },
      { p: [[-6.4, -11.4], [-6.2, -11.8]], wf: 1.15, cen: -1 },                // satellite
      { p: [[-4.8, -13.2], [-2, -15.8]], wf: 0.45, b: 0.45, cen: -1 }],        // its stalk
  2: [{ p: [[-8.2, -9.5], [-5, -15.8], [1.5, -17.6], [7.5, -13.5], [7.8, -6.5], [2.5, 1.5], [-4, 9], [-8.4, 16.4]], cen: 0.38 },
      { p: [[-4.6, 17.2], [2, 17.4], [9, 16.8]], cen: 0.5 }],
  3: [{ p: [[-8.2, -12.8], [-3, -17.4], [4.5, -16.8], [8.4, -10.5], [5.2, -3.6], [-1.5, -1.6]], cen: 0.45 },
      { p: [[1.8, 0.4], [8.2, 4.8], [8.6, 11.6], [4, 16.8], [-3, 17.3], [-8.6, 13]], cen: 0.4 }],
  4: [{ p: [[3, -17.6], [-3, -6], [-9, 5.6], [-1, 6.4], [9.6, 6]], cen: 0.55 },
      { p: [[5.2, -8.6], [5.6, 4], [5.2, 17.6]], cen: 0.3 }],
  5: [{ p: [[8.8, -17.2], [1, -17.4], [-6.6, -17]], cen: 0.5 },
      { p: [[-7.8, -12.6], [-8.2, -3.6], [-1, -5.8], [6.6, -3.2], [9, 5], [7, 13.6], [0, 17.6], [-8.6, 14]], cen: 0.25 }],
  6: [{ p: [[7, -16.6], [0, -13.4], [-6, -5.4], [-8.6, 4], [-7, 13], [0, 17.6], [7, 14], [8.6, 6], [4.2, -0.6], [-3, -0.4], [-8, 4.6]], cen: 0.62 }],
  7: [{ p: [[-9.4, -17.2], [0, -17.6], [8.4, -17.4], [9.4, -16.2], [5, -6], [1.2, 5], [-1.2, 17.6]], cen: 0.3 }],
  8: [{ p: ell(0, -9.6, 6.9, 7.6), closed: true, cen: 0.3 },
      { p: ell(0, 8.6, 8.6, 9), closed: true, cen: 0.8 }],
  9: [{ p: ell(0, -8, 8.3, 9.4), closed: true, cen: 0.85 },
      { p: [[8.5, -5.6], [7.8, 5], [3.6, 13], [-3, 17.6]], cen: 0.3 }],
};

function catmull(pts, closed, sub = 12) {
  const n = pts.length, P = (i) => (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const out = [];
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < sub; k++) {
      const t = k / sub, t2 = t * t, t3 = t2 * t;
      const f = (j) => 0.5 * (2 * p1[j] + (p2[j] - p0[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t3);
      out.push([f(0), f(1)]);
    }
  }
  out.push(closed ? out[0] : pts[n - 1]);
  return out;
}

const XS = 0.86;                           // digits are drawn narrower than their design box
const STEP = 1.1;                          // mm between chromatin samples
const glyphCache = new Map();
/** A digit as chromatin samples: { pts: [{x, y, wf, b, rod}], cens: [{x, y, rod}] }. */
function glyph(d) {
  if (glyphCache.has(d)) return glyphCache.get(d);
  const pts = [], cens = [];
  GLYPHS[d].forEach((rod, ri) => {
    const poly = catmull(rod.p, !!rod.closed);
    const cum = [0];
    for (let k = 1; k < poly.length; k++) cum.push(cum[k - 1] + Math.hypot(poly[k][0] - poly[k - 1][0], poly[k][1] - poly[k - 1][1]));
    const L = cum[cum.length - 1], n = Math.max(1, Math.round(L / STEP));
    const sc = rod.cen * L, seed = hash(d.charCodeAt(0), ri) * 6;
    let k = 0;
    const base = pts.length;
    for (let j = 0; j <= (rod.closed ? n - 1 : n); j++) {
      const s = (j / n) * L;
      while (k < cum.length - 2 && cum[k + 1] < s) k++;
      const u = (s - cum[k]) / (cum[k + 1] - cum[k] || 1);
      const x = kit.lerp(poly[k][0], poly[k + 1][0], u), y = kit.lerp(poly[k][1], poly[k + 1][1], u);
      let dc = Math.abs(s - sc);
      if (rod.closed) dc = Math.min(dc, L - dc);
      let wf = rod.cen < 0 ? 1 : 0.55 + 0.45 * sst(0.6, 4, dc);
      if (!rod.closed) wf *= 0.78 + 0.22 * sst(0, 2.5, Math.min(s, L - s));
      wf *= rod.wf ?? 1;
      const b = (rod.b ?? 1) * (0.8 + 0.2 * Math.cos((2 * Math.PI * s) / 5.2 + seed));
      pts.push({ x, y, wf, b, rod: ri });
    }
    if (rod.cen >= 0) {
      const p = pts[base + Math.min(Math.round((sc / L) * n), pts.length - base - 1)];
      cens.push({ x: p.x, y: p.y, rod: ri });
    }
  });
  const g = { pts, cens };
  glyphCache.set(d, g);
  return g;
}

// ------------------------------------------------------------ the plan
const CX = 14;                            // cell centres, mm either side of the board centre
const ERX = 13, ERY = 24;               // interphase cell ellipse
const AX_T = [-0.5, -SQ3 / 2], AX_U = [0.5, SQ3 / 2];   // division axes: out of the field, on lattice normals
const PERIOD = [3600, 3600, 600, 60];
const OFF = -0.8;                           // a minute's division starts this long before the turn
const DUR = 3.3;                            // division, until the leaving daughter is gone
const PL = 22;                              // metaphase plate length
const RPOLE = 17;

const plans = new Map();
function plan(ctx) {
  const L = ctx.layout;
  if (plans.has(L.key)) return plans.get(L.key);
  const bc = L.panels.map((_, p) => {
    const ls = ctx.leds.filter((l) => l.panel === p);
    return [ls.reduce((s, l) => s + l.x, 0) / ls.length, ls.reduce((s, l) => s + l.y, 0) / ls.length];
  });
  const slots = [0, 1, 2, 3].map((k) => {
    const board = k < 2 ? 0 : 1, side = k % 2 ? 1 : -1, a = side < 0 ? AX_T : AX_U;
    return { k, board, side, a, n: [-a[1], a[0]], c: [bc[board][0] + side * CX, bc[board][1]], period: PERIOD[k] };
  });
  // the hour's wave: uniform speed from slot 0 (starting at -0.8 s) to slot 3 (-0.2 s). Every
  // old digit is gone (S > 0.5) before any new one condenses (S > 1.15), so no wrong time shows
  const x0 = slots[0].c[0], x3 = slots[3].c[0], speed = (x3 - x0) / 0.6;
  const waveAt = (x) => -0.8 + (x - x0) / speed;
  slots.forEach((s) => { s.wave = waveAt(s.c[0]); });
  // tissue sites: a sqrt(3) sub-lattice of the LEDs, outside the digit cells
  const sites = [];
  for (const l of ctx.leds) {
    const [cx, cy] = bc[l.panel], lx = l.x - cx, ly = l.y - cy;
    const q = Math.round(lx / DX), kk = Math.round(ly / 2), b = (kk - q) / 2;
    if ((((q - b) % 3) + 3) % 3 !== 0) continue;
    const inCell = [-1, 1].some((sd) => ((lx - sd * CX) / (ERX + 1.5)) ** 2 + (ly / (ERY + 1.5)) ** 2 < 1);
    if (inCell) continue;
    const r = Math.hypot(lx, ly) || 1, dirs = [[0, 1], [SQ3 / 2, 0.5], [-SQ3 / 2, 0.5]];
    sites.push({
      x: l.x, y: l.y, panel: l.panel, ring: l.ring ?? 5, rx: lx / r, ry: ly / r,
      wave: waveAt(l.x), ax: dirs[Math.floor(hash(l.i, 3) * 3)],
      arrive: -4.3 + 0.17 * (10 - (l.ring ?? 5)) + 0.35 * hash(l.i, 5),
      leave: 1.1 + 0.1 * (10 - (l.ring ?? 5)) + 0.4 * hash(l.i, 9),
    });
  }
  const n = ctx.leds.length;
  const P = {
    bc, slots, sites,
    chrom: new Float32Array(n), tub: new Float32Array(n), act: new Float32Array(n), mag: new Float32Array(n), ves: new Float32Array(n),
    byPanel: L.panels.map((_, p) => ctx.leds.filter((l) => l.panel === p)),
  };
  plans.set(L.key, P);
  return P;
}

// ------------------------------------------------------------ time
const pad2 = (v) => String(v).padStart(2, '0');
const digitsAt = (sec) => { const d = new Date(sec * 1000); return pad2(d.getHours()) + pad2(d.getMinutes()); };

/** The division state of slot s at epoch second `now`. */
function cycle(s, now, tzs) {
  const P = s.period, loc = now - tzs, b0 = Math.floor(loc / P) * P + tzs;
  const T = (B) => B + ((((B - tzs) % 3600) + 3600) % 3600 === 0 ? s.wave : OFF);
  let prevB = null, nextB = null;
  for (const B of [b0 - P, b0, b0 + P]) {
    if (T(B) <= now) prevB = B;
    else if (nextB === null) nextB = B;
  }
  const tp = T(prevB), tn = T(nextB), end = tp + 1.7;
  return {
    B: prevB, s: now - tp, active: now - tp < DUR,
    p: clamp((now - end) / (tn - end)),
    oldD: digitsAt(prevB - 1)[s.k], newD: digitsAt(prevB)[s.k],
  };
}

// ------------------------------------------------------------ drawing
function stamp(ctx, buf, panel, x, y, rIn, rOut, v) {
  if (v <= 0.002) return;
  const leds = ctx.leds;
  for (const i of ctx.layout.index.near(x, y, rOut)) {
    const l = leds[i];
    if (l.panel !== panel) continue;
    const f = v * (1 - sst(rIn, rOut, Math.hypot(l.x - x, l.y - y)));
    if (f > buf[i]) buf[i] = f;
  }
}
function line(ctx, buf, panel, ax, ay, bx, by, w, v) {
  if (v <= 0.002) return;
  const mx = (ax + bx) / 2, my = (ay + by) / 2, r = Math.hypot(bx - ax, by - ay) / 2 + w;
  for (const i of ctx.layout.index.near(mx, my, r)) {
    const l = ctx.leds[i];
    if (l.panel !== panel) continue;
    const f = v * (1 - sst(w * 0.25, w, kit.segDist(l.x, l.y, ax, ay, bx, by)));
    if (f > buf[i]) buf[i] = f;
  }
}

/** Rest position of a chromatin sample: the digit, jostling gently. */
function restPos(c, pt, k, t) {
  const sd = pt.rod * 2.1 + k * 5.3, rot = 0.06 * Math.sin(t * 0.07 + k * 1.9), cs = Math.cos(rot), sn = Math.sin(rot);
  const x = XS * pt.x, y = pt.y;
  return [c[0] + cs * x - sn * y + 0.45 * Math.sin(t * 0.83 + sd) + 0.2 * Math.sin(t * 2.1 + pt.y * 0.4),
          c[1] + sn * x + cs * y + 0.45 * Math.sin(t * 0.61 + sd * 1.7)];
}
/** Where a cell has crawled to: a slow wander round its home. */
function crawl(s, t) {
  return [s.c[0] + 1.6 * (kit.noise2(t * 0.045, s.k * 9.1) - 0.5) * 2, s.c[1] + 2.2 * (kit.noise2(s.k * 4.7, t * 0.04) - 0.5) * 2];
}

const plateCache = new Map();
/** Rank of each sample of digit d along the plate direction n: u in -1..1. */
function plateU(d, n) {
  const key = d + (n[0] > 0 ? '+' : '-');
  if (plateCache.has(key)) return plateCache.get(key);
  const pts = glyph(d).pts, idx = pts.map((p, i) => [p.x * n[0] + p.y * n[1], i]).sort((a, b) => a[0] - b[0]);
  const u = new Float32Array(pts.length);
  idx.forEach(([, i], r) => { u[i] = pts.length > 1 ? (2 * r) / (pts.length - 1) - 1 : 0; });
  plateCache.set(key, u);
  return u;
}

const disc = (i, salt, R) => { const a = hash(i, salt) * kit.TAU, r = Math.sqrt(hash(i, salt + 1)) * R; return [Math.cos(a) * r, Math.sin(a) * r]; };

/** Signed distance (approx.) to the interphase cell ellipse, clipped by the shared wall. */
function cellSDF(x, y, side, t = 0) {
  const w = 0.9 * Math.sin(Math.atan2(y, x) * 3 + t * 0.7 + side) + 0.6 * Math.sin(Math.atan2(y, x) * 5 - t * 0.5 + 2 * side);
  x *= 1 + 0.055 * w; y *= 1 + 0.055 * w;
  const kx = x / ERX, ky = y / ERY, k = Math.hypot(kx, ky) || 1e-6;
  const g = Math.hypot(x / (ERX * ERX), y / (ERY * ERY)) / k || 1e-6;
  const de = (k - 1) / g;
  return de;
}
const circ = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;
const smin = (a, b, k) => { const h = clamp(0.5 + (0.5 * (b - a)) / k); return kit.lerp(b, a, h) - k * h * (1 - h); };

/** Angle on the cell ellipse to a point at 0.82 of its radius. */
function onCell(angle) {
  const c = Math.cos(angle), s = Math.sin(angle), r = 1 / Math.hypot(c / ERX, s / ERY);
  return [c * r * 0.82, s * r * 0.82];
}

function aster(ctx, P, panel, x, y, len, v, t, seed) {
  if (v <= 0.002) return;
  const N = 6, r0 = len + 1;
  stamp(ctx, P.tub, panel, x, y, 0.6, 3.0, Math.min(1, v * 3.2));
  for (const i of ctx.layout.index.near(x, y, r0)) {
    const l = ctx.leds[i];
    if (l.panel !== panel) continue;
    const dx = l.x - x, dy = l.y - y, d = Math.hypot(dx, dy);
    if (d < 1.5) continue;
    const ph = Math.atan2(dy, dx) - seed, j = Math.round(ph / (kit.TAU / N)), del = ph - j * (kit.TAU / N);
    // dynamic instability: each microtubule grows and suddenly shrinks
    const g = kit.fract(t * (0.13 + 0.05 * hash(j + 20, seed * 10 | 0)) + hash(j, seed * 7 | 0));
    const Lj = len * (0.35 + 0.65 * (g < 0.85 ? g / 0.85 : 1 - (g - 0.85) / 0.15));
    const perp = d * Math.abs(Math.sin(del));
    const f = v * (1 - sst(0.4, 1.5, perp)) * (1 - sst(Lj - 2.5, Lj, d)) * (1 - 0.5 * d / len);
    if (f > P.tub[i]) P.tub[i] = f;
  }
}

/** One digit cell: interphase, or a division in progress. */
function drawCell(ctx, P, s, now, tzs, dim) {
  const { t } = ctx, cy = cycle(s, now, tzs), [ax, ay] = s.a, [nx, ny] = s.n, panel = s.board;
  const c = s.cur, S = cy.s, act = cy.active;
  const A = (k) => [c[0] + ax * k, c[1] + ay * k];
  const lv = dim;
  const kin = (ce, v) => {
    const [x, y] = restPos(c, ce, s.k, t);
    stamp(ctx, P.mag, panel, x, y, 0.6, 2.6, 0.75 * v * lv * (0.8 + 0.2 * Math.sin(t * 2.3 + ce.rod + s.k)));
  };

  // ---- chromatin
  let poleA = null, poleB = null, cBd = 0;
  if (!act) {
    const g = glyph(digitsAt(now)[s.k]);
    for (const pt of g.pts) {
      const [x, y] = restPos(c, pt, s.k, t);
      stamp(ctx, P.chrom, panel, x, y, 1.25 * pt.wf, 3.3 * pt.wf, pt.b * lv);
    }
    for (const ce of g.cens) kin(ce, 1);
  } else {
    const old = glyph(cy.oldD), U = plateU(cy.oldD, s.n), N = old.pts.length;
    const eAna = ease.inOut(clamp((S - 0.7) / 0.55));
    const dB = 3 + 11 * eAna + 34 * ease.inOut(clamp((S - 1.05) / 2.0));
    cBd = dB;
    const jig = 0.6 * Math.sin(S * 13);
    const cA = -7 + 7 * ease.inOut(clamp((S - 1.15) / 0.7));
    if (S < 0.7) {
      for (let i = 0; i < N; i++) {
        const pt = old.pts[i], [rx, ry] = restPos(c, pt, s.k, t);
        const e = ease.inOut(clamp((S - 0.12 * hash(i, 11)) / 0.4));
        const u = U[i] * PL / 2;
        const th = 3 + jig * e + 3.2 * (hash(i, 7) - 0.5) * e;
        const px = c[0] + ax * th + nx * u, py = c[1] + ay * th + ny * u;
        stamp(ctx, P.chrom, panel, kit.lerp(rx, px, e), kit.lerp(ry, py, e), 1.25 * kit.lerp(pt.wf, 0.95, e), 3.3 * kit.lerp(pt.wf, 0.95, e), pt.b * lv);
      }
      for (const ce of old.cens) {
        const [x, y] = restPos(c, ce, s.k, t);
        stamp(ctx, P.mag, panel, x, y, 0.4, 2.4, 0.5 * lv * (1 - clamp(S / 0.3)));
      }
    } else if (S < 1.4) {
      // sister chromatids: band A to the staying pole, band B outward; arms trail
      const dec = ease.out(clamp((S - 0.95) / 0.35)), fade = 1 - clamp((S - 1.15) / 0.25);
      for (let i = 0; i < N; i += 1) {
        const u = U[i], pt = old.pts[i];
        for (const side of [-1, 1]) {
          if (side > 0 && S < 0.7) continue;
          const along = (side < 0 ? 3 - 10 * eAna : dB) + 3.2 * (hash(i, 7) - 0.5) * (1 - 0.5 * eAna), trail = -side * 3.2 * u * u * eAna;
          const ctr = side < 0 ? cA : dB;
          const [qx, qy] = disc(i, side < 0 ? 31 : 41, 5.2);
          const bx = c[0] + ax * (along + trail) + nx * u * PL / 2 * (1 - 0.15 * eAna);
          const by = c[1] + ay * (along + trail) + ny * u * PL / 2 * (1 - 0.15 * eAna);
          const kx = c[0] + ax * ctr + qx, ky = c[1] + ay * ctr + qy;
          const v = (side < 0 ? fade : 1) * kit.lerp(1, 0.42, dec);
          stamp(ctx, P.chrom, panel, kit.lerp(bx, kx, dec), kit.lerp(by, ky, dec), 1.2 + 0.4 * dec, 3.2 + 0.6 * dec, pt.b * v * lv);
        }
      }
    }
    // the leaving daughter's decondensed nucleus
    if (S >= 1.4) {
      const out = 1 - sst(2.6, DUR, S), bx = c[0] + ax * dB, by = c[1] + ay * dB;
      for (let i = 0; i < N; i += 2) {
        const [qx, qy] = disc(i, 41, 5.2);
        stamp(ctx, P.chrom, panel, bx + qx, by + qy, 1.6, 3.8, 0.42 * old.pts[i].b * out * lv);
      }
    }
    // the new digit condenses out of the staying daughter's chromatin
    if (S >= 1.05) {
      const g = glyph(cy.newD), M = g.pts.length;
      for (let j = 0; j < M; j++) {
        const pt = g.pts[j], [rx, ry] = restPos(c, pt, s.k, t);
        const e = ease.inOut(clamp((S - 1.05 - 0.1 * hash(j, 13)) / 0.45));
        const [qx, qy] = disc(j, 31, 5.2);
        const kx = c[0] + ax * cA + qx, ky = c[1] + ay * cA + qy;
        const v = kit.lerp(0.42, 1, e) * clamp((S - 1.05) / 0.2);
        stamp(ctx, P.chrom, panel, kit.lerp(kx, rx, e), kit.lerp(ky, ry, e), kit.lerp(1.6, 1.25 * pt.wf, e), kit.lerp(3.8, 3.3 * pt.wf, e), pt.b * v * lv);
      }
      const ce = clamp((S - 1.45) / 0.25);
      for (const cn of g.cens) kin(cn, ce);
    }
    // spindle
    const sp = sst(0.1, 0.4, S) * (1 - sst(1.25, 1.7, S));
    poleA = A(-RPOLE);
    poleB = A(Math.max(RPOLE, dB + 6));
    if (sp > 0) {
      for (let q = 0; q < 5; q++) {
        const u = (q / 4 - 0.5) * 1.6, w = u * PL / 2 * (1 - 0.15 * eAna);
        const kA = 3 + jig * (1 - eAna) - 10 * eAna + 3.2 * u * u * eAna;
        const kB = S < 0.7 ? 3 + jig : dB - 3.2 * u * u * eAna;
        const kxA = c[0] + ax * kA + nx * w, kyA = c[1] + ay * kA + ny * w;
        const kxB = c[0] + ax * kB + nx * w, kyB = c[1] + ay * kB + ny * w;
        if (q % 2 === 0) line(ctx, P.tub, panel, poleA[0], poleA[1], kxA, kyA, 1.5, 0.3 * sp * lv);
        if (q % 2 === 0) line(ctx, P.tub, panel, poleB[0], poleB[1], kxB, kyB, 1.5, 0.3 * sp * lv);
        const km = 0.55 * sst(0.2, 0.5, S) * (1 - sst(1.0, 1.3, S)) * lv;
        stamp(ctx, P.mag, panel, kxA, kyA, 0.4, 2.2, km);
        if (S >= 0.7) stamp(ctx, P.mag, panel, kxB, kyB, 0.4, 2.2, km);
      }
    }
    // midbody: the spindle's last green spark in the furrow
    const mb = sst(1.2, 1.4, S) * (1 - sst(1.7, 2.1, S));
    if (mb > 0) { const m = dB / 2; stamp(ctx, P.tub, panel, c[0] + ax * m, c[1] + ay * m, 0.5, 2.8, 0.8 * mb * lv); }
  }

  // ---- centrosomes and asters
  const th = (v) => Math.atan2(v[1], v[0]);
  const angA = th([-ax, -ay]), angH = th([-s.n[0], -s.n[1]]), angB = th(s.a);
  if (act && S < 1.7) {
    const g = 1 + 0.5 * sst(0.1, 0.5, S);
    aster(ctx, P, panel, poleA[0], poleA[1], 6 * g, 0.18 * lv, t, s.k * 1.3);
    aster(ctx, P, panel, poleB[0], poleB[1], 6 * g, 0.18 * lv, t, s.k * 1.3 + 2);
  } else {
    const p = act ? 0 : cy.p;
    let cents;
    if (p < 0.12) {
      // after division the centrosome glides from the old pole to its home beside the nucleus
      const e = ease.inOut(p / 0.12), a = angA + (((angH - angA + 3 * Math.PI) % kit.TAU) - Math.PI) * e;
      cents = [onCell(a)];
    } else {
      const e = ease.inOut(clamp((p - 0.15) / 0.85)), sep = Math.min(1, (p - 0.12) / 0.03) * 0.15;
      const dA = ((angA - angH + 3 * Math.PI) % kit.TAU) - Math.PI, dB2 = ((angB - angH + 3 * Math.PI) % kit.TAU) - Math.PI;
      cents = [onCell(angH + dA * Math.max(e, sep)), onCell(angH + dB2 * Math.max(e, sep))];
    }
    cents.forEach(([x, y], j) => aster(ctx, P, panel, c[0] + x, c[1] + y, 13, 0.15 * lv, t, s.k * 1.3 + j * 2));
    // vesicles riding the microtubules out and back
    const [hx, hy] = cents[0];
    for (let v = 0; v < 3; v++) {
      const T = 3.5 + v * 0.9, ph = now / T + hash(v, s.k), trip = Math.floor(ph), f = ph - trip;
      const a = hash(trip, v, s.k) * kit.TAU, r = 13 * Math.sin(Math.PI * ease.inOut(f));
      const x = hx + Math.cos(a) * r, y = hy + Math.sin(a) * r;
      if (cellSDF(x, y, s.side) < -1.5) stamp(ctx, P.ves, panel, c[0] + x, c[1] + y, 0.5, 2.4, 0.4 * lv * Math.sin(Math.PI * f));
    }
  }
  return { cy, cBd };
}

/** Membranes of a board's two cells (and any leaving daughters): red rim. */
function drawMembranes(ctx, P, board, states, dim) {
  const cells = P.slots.filter((s) => s.board === board);
  for (const l of P.byPanel[board]) {
    let rim = 0;
    for (const s of cells) {
      const st = states[s.k], x = l.x - s.cur[0], y = l.y - s.cur[1];
      let d = cellSDF(x, y, s.side, ctx.t), ring = 0;
      if (st.cy.active) {
        const S = st.cy.s, [ax, ay] = s.a;
        const round = sst(0, 0.45, S) * (1 - sst(1.6, 2.4, S));
        const dA = circ(x, y, -ax * 6 * sst(0.7, 1.3, S), -ay * 6 * sst(0.7, 1.3, S), kit.lerp(14.5, 12, sst(0.7, 1.4, S)));
        let dd = dA;
        if (S > 0.6) {
          const dB = circ(x, y, ax * st.cBd, ay * st.cBd, kit.lerp(14.5, 9, sst(0.7, 1.4, S)));
          const kk = kit.lerp(10, 1.5, sst(0.9, 1.7, S));
          dd = smin(dA, dB, kk);
          const pinch = Math.min(dA, dB) - dd;           // largest at the neck
          ring = sst(1.0, 1.2, S) * (1 - sst(1.6, 2.0, S)) * clamp(pinch / 1.4) * (1 - sst(1.0, 3.2, Math.abs(dd)));
          if (S > 1.6) { const away = 1 - sst(2.6, DUR, S); rim = Math.max(rim, away * 0.16 * (1 - sst(0.6, 2.2, Math.abs(dB)))); }
        }
        d = kit.lerp(d, dd, round);
      }
      // actin ruffles travel round the cortex
      const ang = Math.atan2(y, x), ruffle = 0.55 + 0.45 * Math.max(0, Math.sin(2 * ang - ctx.t * (0.9 + 0.15 * s.k) + s.k)) ** 2 + 0.2 * kit.noise2(l.x * 0.2 + ctx.t * 0.3, l.y * 0.2 - ctx.t * 0.2);
      rim = Math.max(rim, 0.085 * ruffle * (1 - sst(0.6, 2.2, Math.abs(d))), 1.0 * ring);
    }
    if (rim > P.act[l.i]) P.act[l.i] = rim * dim;
  }
}

/** The hour: a tissue fills the fields, a mitotic wave sweeps, the fields clear. */
function drawTissue(ctx, P, u, dim) {
  if (u < -4.8 || u > 5.5) return;
  for (const st of P.sites) {
    const ea = ease.out(clamp((u - st.arrive) / 1.4));
    if (ea <= 0) continue;
    const el = ease.in(clamp((u - st.leave) / 1.6));
    if (el >= 1) continue;
    const push = 11 * (1 - ea) + 16 * el;
    const x = st.x + st.rx * push, y = st.y + st.ry * push;
    const tau = u - st.wave;
    const v = 0.17 * ea * (1 - el) * dim * (tau > 0.5 ? 0.62 : 1);
    if (tau < 0) { stamp(ctx, P.chrom, st.panel, x, y, 0.8, 3.0, v); continue; }
    const split = ease.inOut(clamp((tau - 0.25) / 0.5)) * 2.1;
    const elong = sst(0, 0.25, tau) * (1 - sst(0.25, 0.5, tau));
    const [qx, qy] = st.ax, nxp = -qy, nyp = qx;
    if (split < 0.05) {
      stamp(ctx, P.chrom, st.panel, x + nxp * 1.2 * elong, y + nyp * 1.2 * elong, 0.8, 3.0, v);
      stamp(ctx, P.chrom, st.panel, x - nxp * 1.2 * elong, y - nyp * 1.2 * elong, 0.8, 3.0, v);
    } else {
      stamp(ctx, P.chrom, st.panel, x + qx * split, y + qy * split, 0.8, 3.0, v);
      stamp(ctx, P.chrom, st.panel, x - qx * split, y - qy * split, 0.8, 3.0, v);
    }
    const flash = sst(0.0, 0.08, tau) * (1 - sst(0.12, 0.3, tau));
    if (flash > 0) stamp(ctx, P.tub, st.panel, x, y, 0.6, 3.0, 0.45 * flash * ea * dim);
  }
}

export default {
  name: 'Mitosis',
  blurb: 'chromosomes condensed into digits; each minute a cell divides and the old minute swims away',
  layouts: ['hex-pair'], look: { look: 'opal', gap: 3.0 }, fps: 60, brightness: 0.6, dither: true,
  frame(ctx) {
    const P = plan(ctx), now = ctx.date.getTime() / 1000, tzs = ctx.date.getTimezoneOffset() * 60;
    const dim = 1 - 0.8 * ctx.night;
    P.chrom.fill(0); P.tub.fill(0); P.act.fill(0); P.mag.fill(0); P.ves.fill(0);
    for (const s of P.slots) s.cur = crawl(s, ctx.t);
    const states = P.slots.map((s) => drawCell(ctx, P, s, now, tzs, dim));
    drawMembranes(ctx, P, 0, states, dim);
    drawMembranes(ctx, P, 1, states, dim);
    const loc = now - tzs, H = Math.round(loc / 3600) * 3600;
    drawTissue(ctx, P, loc - H, dim);
    const o = ctx.out;
    for (let i = 0; i < ctx.n; i++) {
      const ch = P.chrom[i], occ = 1 - clamp(1.6 * ch), tb = P.tub[i] * occ, ac = P.act[i] * occ, mg = P.mag[i], vs = P.ves[i] * occ, core = ch * ch * ch;
      o[3 * i] = CHROM[0] * ch + CORE[0] * core + TUB[0] * tb + ACT[0] * ac + CEN[0] * mg + VES[0] * vs;
      o[3 * i + 1] = CHROM[1] * ch + CORE[1] * core + TUB[1] * tb + ACT[1] * ac + CEN[1] * mg + VES[1] * vs;
      o[3 * i + 2] = CHROM[2] * ch + CORE[2] * core + TUB[2] * tb + ACT[2] * ac + CEN[2] * mg + VES[2] * vs;
    }
    // below 4/255 a WS2812 shows nothing reliable: drop it rather than let it flicker
    for (let k = 0; k < o.length; k++) if (o[k] < CUT) o[k] = 0;
  },
};
