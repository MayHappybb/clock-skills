// Marbling: the renderer (see marbling.js for the idea, palette and cost).
//
// One integer pass over the glass. Each pixel becomes a colour code (two
// palette entries and a blend in eighths) and one table lookup turns it into
// RGB565. The work is counted as it is done (OPS, in simple integer ops, each
// charged to the estimate as one scanned pixel: 3 cycles).

import { clockFields, previousMinute, clamp, progress, ease, hash, to565, R, G, B } from '../js/kit.js';
import { pathMap, pointAt, MARGIN } from './marbling-glyphs.js';
import { makeBath, bathTables, newTables, STONES, TILE, FX0 } from './marbling-bath.js';

const W = 160, H = 80;
const BAYER = Float32Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], (v) => (v + 0.5) / 16);

// ------------------------------------------------------------ colour slots and tables

const C = { BATH: 0, VEIN: 5, OX: 6, OCH: 7, CRM: 8, KEY: 9, EDGE: 10, INK: 11 };   // 1..4: the hour's stones
const NC = 12, NQ = 8, NL = 4;

// the stones change with the hour (a fresh bath is laid each hour); the paint of the numerals never does
const GROUNDS = [
  [0x24386e, 0x2c5b8e, 0x3a8a91, 0x285f6e],   // indigo, lapis, turquoise, teal
  [0x2c5547, 0x467a5a, 0x6a9670, 0x356564],   // verdigris and sage
  [0x393f63, 0x585f86, 0x767b9a, 0x2e344d],   // slate and lilac grey
  [0x3a2a4f, 0x584472, 0x77628f, 0x2b2441],   // aubergine and violet
];
const DAY = { bath: 0xe9dfc4, vein: 0x9fb4c6, ox: 0x7c1d22, och: 0xe2a338, crm: 0xf7edd3, key: 0x4e1015, edge: 0x8a7d66, ink: 0x1f2c66 };
const NIGHT = { bath: 0xc4b48e, vein: 0x6f7a7c, ox: 0x6e1a20, och: 0xd2922e, crm: 0xeedcb4, key: 0x1e0c0e, edge: 0x5a5244, ink: 0x1a2350 };
const PAPER = 0xf1e8d2, PAPER_N = 0xd2c6a8;

function mixc(a, b, u) {
  return (Math.round(R(a) + (R(b) - R(a)) * u) << 16) | (Math.round(G(a) + (G(b) - G(a)) * u) << 8) | Math.round(B(a) + (B(b) - B(a)) * u);
}

function palette(hour, night, kind) {
  const P = night ? NIGHT : DAY;
  const st = GROUNDS[hour % 4].map((c) => (night ? mixc(c, 0x0a0e1c, 0.3) : c));
  const p = new Array(NC).fill(0);
  p[C.BATH] = P.bath; p[1] = st[0]; p[2] = st[1]; p[3] = st[2]; p[4] = st[3];
  p[C.VEIN] = P.vein; p[C.OX] = P.ox; p[C.OCH] = P.och; p[C.CRM] = P.crm; p[C.KEY] = P.key; p[C.EDGE] = P.edge; p[C.INK] = P.ink;
  const paper = night ? PAPER_N : PAPER;
  // the sheet lying on the bath, wet: the paint shows through it
  if (kind === 'paper') return p.map((c, i) => (i === C.EDGE ? c : mixc(c, paper, 0.68)));
  if (kind === 'shadow') return p.map((c, i) => (i === C.EDGE ? c : mixc(mixc(c, paper, 0.68), P.key, 0.25)));
  // the printed face of the sheet: where there was only size, the paper itself
  if (kind === 'print') { const q = p.slice(); q[C.BATH] = mixc(paper, 0xffffff, 0.3); q[C.VEIN] = mixc(P.vein, paper, 0.5); return q; }
  return p;
}

const LUTS = new Map();
/**
 * (a, b, q[, sheen]) -> RGB565: a blended toward b by q/8. The bath's tables
 * also have 4 levels of the wet sheen (9.2 KB); the paper's have none (2.3 KB).
 */
function lutFor(hour, night, kind = 'bath') {
  const key = `${hour % 4}:${night ? 1 : 0}:${kind}`;
  let t = LUTS.get(key);
  if (t) return t;
  const p = palette(hour, night, kind), nl = kind === 'bath' ? NL : 1;
  const sheenC = night ? 0xb8c4d0 : 0xffffff, smax = night ? 0.16 : 0.3;
  t = new Uint16Array(NC * NC * NQ * nl);
  for (let a = 0; a < NC; a++)
    for (let b = 0; b < NC; b++)
      for (let q = 0; q < NQ; q++) {
        const c = mixc(p[a], p[b], q / NQ);
        for (let l = 0; l < nl; l++) t[((a * NC + b) * NQ + q) * nl + l] = to565(mixc(c, sheenC, (l / (NL - 1)) * smax));
      }
  LUTS.set(key, t);
  return t;
}
// (the sim builds them all now; the device builds the hour's when it needs them, ~10 k ops each)
for (let h = 0; h < 4; h++) for (const nt of [false, true]) for (const k of ['bath', 'paper', 'shadow', 'print']) lutFor(h, nt, k);

// sqrt over r^2 in eighths up to 200 (flash, 3.2 KB as bytes of 1/8 px)
const SQ_N = 1601, SQ = new Float32Array(SQ_N);
for (let i = 0; i < SQ_N; i++) SQ[i] = Math.round(Math.sqrt(i / 8) * 8) / 8;
const sqrtT = (v) => { const i = (v * 8) | 0; return i >= SQ_N ? SQ[SQ_N - 1] : SQ[i]; };

// ------------------------------------------------------------ layout

// hours tall at the left, minutes set lower right; the stroke is the drop's width
export const SLOTS = [
  { x: 3, y: 7, w: 34, h: 66, hw: 5.2, mo: 1.4 },
  { x: 40, y: 7, w: 34, h: 66, hw: 5.2, mo: 1.4 },
  { x: 89, y: 21, w: 32, h: 55, hw: 4.7, mo: 1.5 },
  { x: 124, y: 21, w: 32, h: 55, hw: 4.7, mo: 1.5 },
];
const PAD = 12;          // how far the paint's push on the stones reaches, px
const KEY_W = 1.15;      // the dark keyline inside the stroke's edge
const FLOW = 2.6;        // px/s: the hearts creep along every stroke

/** The paint's push on the stones round a stroke: how far a ground pixel at distance d came from. */
function pushAt(d, Hp) {
  const t = 1 - (d / PAD) * (d / PAD), w = t > 0 ? t * t : 0;
  return d > Hp ? (d - Math.sqrt(d * d - Hp * Hp)) * w : d * w;
}

// Each slot has one map buffer (5 B a pixel, built in place); the sim keeps
// every digit's map, the device only the one shown in each slot.
const MAPS = new Map();
function mapFor(ch, k) {
  const sl = SLOTS[k], key = `${ch}:${k < 2 ? 0 : 2}`;
  let m = MAPS.get(key);
  if (!m) {
    const ext = sl.hw + sl.mo;
    m = pathMap(ch, sl.w, sl.h, sl.hw, ext, (e) => pushAt(e, ext * 1.15));
    // bead spacing per path: a whole number of hearts round a closed loop
    const P0 = 2.0 * sl.hw;
    m.P = m.lens.map((L, i) => (m.closed[i] ? L / Math.max(1, Math.round(L / P0)) : P0));
    m.iP = m.P.map((p) => 1 / p);
    // a digit drawn in stroke order (the 7): the length of its first straight stroke
    m.bar = 0;
    if (m.order[0]) for (const g of m.segs) { if (Math.abs(g.by - g.ay) > 0.01 * g.L) break; m.bar += g.L; }
    // the hearts' pull, by rest distance (a table per slot size)
    m.G = Float32Array.from({ length: 256 }, (_, i) => (1.15 * sl.hw * 0.5 * sl.hw) / (i / 8 + 0.5 * sl.hw));
    // building it: brushing each segment, then packing every pixel
    m.ops = m.visits * 12 + m.w * m.h * 30;
    MAPS.set(key, m);
  }
  return m;
}
for (let ch = 0; ch < 10; ch++) { mapFor(String(ch), 0); mapFor(String(ch), 2); }

// which slot's map each column reads (the gaps between the slots split evenly)
const COLOWN = new Int8Array(W).fill(-1);
for (let x = 0; x < W; x++)
  SLOTS.forEach((s, k) => {
    const prev = SLOTS[k - 1], next = SLOTS[k + 1];
    const lo = prev ? Math.max(s.x - MARGIN, (prev.x + prev.w + s.x) / 2) : s.x - MARGIN;
    const hi = next ? Math.min(s.x + s.w + MARGIN, (s.x + s.w + next.x) / 2) : s.x + s.w + MARGIN;
    if (x + 0.5 >= lo && x + 0.5 < hi) COLOWN[x] = k;
  });

const BATHS = new Map();
function bathFor(hk) {
  let b = BATHS.get(hk);
  if (!b) {
    b = makeBath(hk);
    BATHS.set(hk, b);
    if (BATHS.size > 3) BATHS.delete(BATHS.keys().next().value);
  }
  return b;
}

// the comb's tines and their pull across the columns
const TINE = 6, LAMBDA = 1.6;
const TINES = [];
for (let tx = 3; tx <= W - 2; tx += TINE) TINES.push(tx);
const FULL_P = Float32Array.from({ length: W }, (_, x) => {
  let d = 1e9;
  for (const tx of TINES) d = Math.min(d, Math.abs(x + 0.5 - tx));
  return LAMBDA / (d + LAMBDA);
});

// ------------------------------------------------------------ per-pixel shading

let OUT = 0, RIP = 0, OPS = 0;   // shade()'s results, and the work it did

/** The ground's code at bath point (gx, gy), seen at screen pixel (x, y). */
function groundCode(Wd, gx, gy, x, y) {
  const b = Wd.bath, tab = Wd.tab;
  // the comb's inverse: which point of the tile came here
  const xs = gx + tab.XR[y] + 256;
  const ix = ((xs - b.tx - 256 - FX0) * 4) | 0;
  const ys = gy + tab.WY[x] - (tab.flat ? tab.F[ix] : tab.F[ix] * tab.A[y]);
  const k = ((ys | 0) & (TILE - 1)) * TILE + ((xs | 0) & (TILE - 1));
  const id = STONES.id[k], stone = STONES.col[id], en = STONES.e[k];
  OPS += 13;
  if (Wd.bloomT > -9) {
    // the fresh bath: each drop lands and spreads to fill its stone (its outline
    // grows from the stone's middle out, as the paint spreads to meet the next)
    OPS += 6;
    const u = (Wd.bloomT - b.land[id]) * 2;
    if (u <= 0) return 0;
    if (u < 1) {
      const cov = en / 16 - STONES.emax[id] * (1 - ease.outCubic(u)) * 1.1 + 0.5;
      if (cov <= 0) return 0;
      if (cov < 1) return (stone * NC + C.BATH) * NQ + (((1 - cov) * NQ) | 0);
      return (stone * NC + stone) * NQ;
    }
  }
  if (en >= 32 || Wd.cheap) return (stone * NC + stone) * NQ;   // (under the wet paper the veins don't show)
  // near a vein: the edge distance blended between two texels down the column
  // (the bath moves mostly down), so the vein glides
  OPS += 8;
  const fy = ys - 0.5, y0 = fy | 0, uy = fy - y0, i0 = (xs | 0) & (TILE - 1), E = STONES.e;
  const e = (E[(y0 & (TILE - 1)) * TILE + i0] * (1 - uy) + E[((y0 + 1) & (TILE - 1)) * TILE + i0] * uy) / 16;
  const VW = 0.65;
  if (e < VW - 0.5) return (C.VEIN * NC + C.VEIN) * NQ;
  if (e < VW + 0.5) return (stone * NC + C.VEIN) * NQ + (((VW + 0.5 - e) * NQ) | 0);
  return (stone * NC + stone) * NQ;
}

// each drop is a cream eye in a ring on the ochre body (more rings vanish at this pitch);
// alternate drops are ringed in indigo instead of oxblood, as a marbler drops two colours in turn
const R1 = 0.3, R2 = 0.7;
function band(rr, hw, alt) {
  const ring = alt ? C.INK : C.OX, r1 = R1 * hw, r2 = R2 * hw;
  if (rr < r1 - 0.5) return (C.CRM * NC + C.CRM) * NQ;
  if (rr < r1 + 0.5) return (C.CRM * NC + ring) * NQ + (((rr - r1 + 0.5) * NQ) | 0);
  if (rr < r2 - 0.5) return (ring * NC + ring) * NQ;
  if (rr < r2 + 0.5) return (ring * NC + C.OCH) * NQ + (((rr - r2 + 0.5) * NQ) | 0);
  return (C.OCH * NC + C.OCH) * NQ;
}
/** The colour a code mostly is. */
const major = (code) => { const ab = (code / NQ) | 0; return (code % NQ) < NQ / 2 ? (ab / NC) | 0 : ab % NC; };

/** The edge of the paint (keyline, moat) round a ring code at rest distance e. */
function edged(e, hw, ext, ring) {
  if (e < hw - KEY_W - 0.5) return ring;
  if (e < hw - KEY_W + 0.5) return (major(ring) * NC + C.KEY) * NQ + (((e - (hw - KEY_W) + 0.5) * NQ) | 0);
  if (e < hw - 0.5) return (C.KEY * NC + C.KEY) * NQ;
  if (e < hw + 0.5) return (C.KEY * NC + C.BATH) * NQ + (((e - hw + 0.5) * NQ) | 0);
  if (e < ext - 0.5) return 0;
  return -1;
}

/** Shade screen pixel (x, y) of a world. Sets OUT (the colour code) and RIP (a sheen boost). */
function shade(Wd, x, y) {
  RIP = 0;
  OPS += 2;
  const k = COLOWN[x];
  const py = y + 0.5;
  let code = -1, gEdge = -1, gx = x + 0.5, gy = py;
  if (k >= 0) {
    const st = Wd.slots[k];
    if (st.on) {
      const m = st.map, mx = x - st.mx0;
      // the comb drags the paint down along its tines
      let qy = py;
      const c = st.comb;
      if (c && py >= c.y0 && py < c.yT) {
        OPS += 6;
        const f = c.yT - py;
        qy -= FULL_P[x] * c.edge[x] * (f > c.Z ? c.Z : f);
      }
      OPS += 1;
      const my = ((qy - st.my0 + 64) | 0) - 64;
      OPS += 5;
      if (my >= 0 && my < m.h) {
        const i = my * m.w + mx, e8 = m.e[i];
        if (e8 < 255) {
          const sv = m.s[i], pIdx = sv >> 15, sLoc = (sv & 32767) / 32, P = m.P[pIdx], hw = st.sl.hw, ext = hw + st.sl.mo;
          const e = (e8 / 8) * st.sc;
          OPS += 4;
          if (st.mode === 2 && (st.sty <= 0 || sLoc + m.starts[pIdx] > st.sty)) {
            // a drop not yet reached by the stylus: a bullseye, spreading
            if (e8 < st.reach8) {
              // which drop this pixel belongs to, and how far from its centre (9 ops)
              OPS += 9;
              const ph = sLoc - st.flowP[pIdx] - P / 2, kb = ((ph * m.iP[pIdx] + 64.5) | 0) - 64, bi = (kb & 63) + 64 * pIdx;
              const q = ph - kb * P, r2 = q * q + (e8 * e8) * (1 / 64);
              // against its radius and its ripple, from this frame's per-drop table (3 ops)
              if (r2 < st.bR2[bi]) {
                OPS += 14;
                const r = sqrtT(r2), Rb = st.bR[bi];
                // the ripple of its landing on the surface round it
                if (r > st.bP0[bi] && r < st.bP1[bi]) RIP = st.bPa[bi];
                if (Rb > 0.3) {
                  // the bead's rings, scaled with its radius
                  const rr = (r * hw) / Rb;
                  if (rr < ext + 0.5) {
                    code = edged(rr, hw, ext, band(rr, hw, kb & 1));
                    if (code < 0) gEdge = rr - (ext - 0.5);
                  }
                }
              }
            }
          } else if (e < ext + 0.5) {
            if (e < hw - KEY_W + 0.5) {
              // the hearts: drops pulled along the path, their rings drawn out into chevrons
              OPS += 26;
              const A = st.mode === 2 ? clamp((st.sty - sLoc - m.starts[pIdx]) * (1 / 14), 0, 1) : 1;
              const v = sLoc - A * m.G[e8] - st.flowP[pIdx], kq = (v * m.iP[pIdx]) | 0, q = v - kq * P - P / 2;
              code = edged(e, hw, ext, band(sqrtT(q * q + e * e), hw, kq & 1));
            } else code = edged(e, hw, ext, 0);
            if (code < 0) gEdge = e - (ext - 0.5);     // the moat's outer edge: blend into the ground
          }
          // a leaving numeral breaks up evenly, like a film of paint
          if (code >= 0 && st.fade > 0 && st.fade > BAYER[((y & 3) << 2) | (x & 3)]) code = -1;
        }
      }
      if (code < 0) {
        // the stones round a stroke have been pushed aside by its paint (at rest, from the map)
        const pm = y - st.my0;
        if (pm >= 0 && pm < m.h && st.push > 0 && !Wd.cheap) {
          OPS += 6;
          const j = 2 * (pm * m.w + mx), ps = st.push * (1 / 16);
          gx -= m.pu[j] * ps; gy -= m.pu[j + 1] * ps;
        }
      }
    }
  }
  if (code >= 0) { OUT = code; return; }
  const gc = groundCode(Wd, gx, gy, x, y);
  OUT = gEdge >= 0 ? (C.BATH * NC + major(gc)) * NQ + ((clamp(gEdge, 0, 0.999) * NQ) | 0) : gc;
}

// ------------------------------------------------------------ building a moment

const hourKeyOf = (f) => f.year * 1000000 + f.mon * 10000 + f.day * 100 + f.h;

function slot(ch, k, seed) {
  const sl = SLOTS[k], map = mapFor(ch, k);
  return {
    map, k, sl, mode: 0, seed, sc: 1, push: 1, sty: 1e9, tl: 0, on: true, fade: 0, comb: null, reach8: 0,
    mx0: sl.x - MARGIN, my0: sl.y - MARGIN, flowP: new Float32Array(map.P.length), land: null,
  };
}

function setFlow(st, flow) {
  for (let i = 0; i < st.map.P.length; i++) { const P = st.map.P[i]; st.flowP[i] = (flow % (64 * P)) - 128 * P; }
}

/**
 * When each drop of an arriving numeral lands (64 per path, a table per
 * minute): scattered over `stag` s, or in stroke order for a digit that
 * reads wrong half-dropped (the 7's bar lands before its stem).
 */
function landing(st, stag) {
  const m = st.map, t = new Float32Array(128);
  const off = (st.seed & 255) / 256;
  for (let p = 0; p < m.P.length; p++) {
    const nb = Math.max(1, Math.round(m.lens[p] / m.P[p]));
    for (let kb = 0; kb < 64; kb++) {
      if (m.order[0]) {
        // (table entry kb is the drop whose centre is at kb P + P/2 + the flow, wrapped)
        const P = m.P[p], c = ((((kb + 0.5) * P + st.flowP[p]) % (64 * P)) + 64 * P) % (64 * P);
        const sG = m.starts[p] + c;
        t[kb + 64 * p] = 0.3 + 0.3 * clamp((sG - m.bar) / (m.total - m.bar), 0, 1) + 0.05 * ((hash(kb, p, st.seed) & 1023) / 1024);
      } else {
        // evenly spread (a golden-ratio sequence along the line): at any moment the
        // drops that have landed are thinned evenly over the whole numeral, so a
        // half-dropped 9 is never just its bowl
        const k = ((kb % nb) + nb) % nb;
        t[kb + 64 * p] = stag * ((k * 0.618034 + off + p * 0.37) % 1);
      }
    }
  }
  return t;
}

/**
 * This frame's state of every drop of an arriving numeral (128 entries): its
 * radius, the square of how far it reaches (its edge or its ripple, whichever
 * is further), and the ripple's ring. ~12 ops a drop, charged here.
 */
function dropTable(st) {
  const hw = st.sl.hw, ext = hw + st.sl.mo, n = 64 * st.map.P.length;
  st.bR = new Float32Array(n); st.bR2 = new Float32Array(n);
  st.bP0 = new Float32Array(n); st.bP1 = new Float32Array(n); st.bPa = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const tb = st.tl - st.land[i];
    if (tb <= 0) continue;
    const u = tb * (1 / 0.3), Rb = u >= 1 ? hw : hw * ease.outCubic(u) * (1 + 0.5 * u * (1 - u));
    const Rx = (Rb * (ext + 0.5)) / hw;
    st.bR[i] = Rb;
    let reach = Rx;
    if (tb > 0.04 && tb < 0.5) {
      const rp = (tb - 0.04) * 14;
      st.bP0[i] = rp - 1.2; st.bP1[i] = rp + 1.2; st.bPa[i] = (1 - (tb - 0.04) / 0.46) * 2.6;
      if (rp + 1.2 > reach) reach = rp + 1.2;
    } else st.bP1[i] = -1;
    st.bR2[i] = reach * reach;
  }
  OPS += n * 12;
}

// the fold of the peeled sheet: n . p = peelC(T), T seconds from the hour
const FOLD_NX = 0.857, FOLD_NY = 0.514;
const peelC = (T) => -8 + 196 * ease.inOutQuad(progress(T, -0.35, 0.55));
// when the fold has uncovered each slot: its new numeral is only dropped after that
const UNCOVER = SLOTS.map((sl) => {
  const v = FOLD_NX * (sl.x + sl.w) + FOLD_NY * (sl.y + sl.h);
  let lo = -0.35, hi = 0.55;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (peelC(m) < v) lo = m; else hi = m; }
  return Math.max(0, hi);
});

// when the fold has crossed the whole glass
let PEEL_DONE = 0;
for (let T = 0; T < 0.6; T += 0.005) if (peelC(T) >= FOLD_NX * W + FOLD_NY * H + 2) { PEEL_DONE = T; break; }

// the comb is drawn down the whole bath at every minute turn; a leaving
// numeral is dragged by the tines over it (edge: only over its own columns)
const combY = (s) => -6 + (H + 12) * ease.inOutQuad(progress(s, 58.3, 59.6));
const SLOT_EDGE = SLOTS.map((s) => Float32Array.from({ length: W }, (_, x) => clamp(1 - Math.max(0, s.x - 2 - x, x - (s.x + s.w + 2)) / 5, 0, 1)));
const ONES = new Float32Array(W).fill(1);
const hourCombY = (s) => -6 + (H + 12) * ease.inOutQuad(progress(s, 58.5, 59.45));

/** The bath as it is at second s of the minute whose fields are f. */
function worldAt(f, s, flow, opt) {
  const prv = opt.prv, nxt = opt.nxt;
  const cur = f.hh + f.mm, pd = prv.hh + prv.mm, nd = nxt.hh + nxt.mm;
  const hourOut = nxt.h !== f.h && s >= 57, hourIn = prv.h !== f.h && s < 4;
  const slots = [];
  const mk = f.minuteKey;
  for (let k = 0; k < 4; k++) {
    const st = slot(cur[k], k, hash(mk, k, 5) & 255);
    setFlow(st, flow);
    if ((hourOut || (s >= 58.3 && cur[k] !== nd[k])) && !opt.fresh) {
      // leaving: the comb drags it into feathers, its paint draws out thin and breaks up
      const th = 0.55 * ease.inQuad(hourOut ? progress(s, 58.8, 59.7) : progress(s, 58.6, 59.6));
      st.fade = hourOut ? progress(s, 59.15, 59.7) : progress(s, 59.0, 59.6);
      st.mode = 1; st.sc = 1 / (1 - th); st.push = 1 - st.fade; st.on = st.fade < 1;
      st.comb = hourOut
        ? { y0: -6, yT: hourCombY(s), Z: 12, edge: ONES }
        : { y0: SLOTS[k].y - 5, yT: combY(s), Z: 0.32 * SLOTS[k].h, edge: SLOT_EDGE[k] };
    } else if (hourIn || (s < 3 && cur[k] !== pd[k])) {
      // arriving: a row of drops falls along the path, then the stylus draws through them
      const t0 = hourIn ? UNCOVER[k] : 0;
      st.mode = 2; st.tl = s - 0.05 - t0;
      st.land = landing(st, hourIn ? 0.16 : 0.25);
      dropTable(st);
      st.sty = st.map.total * ease.inOutQuad(progress(s, 0.75 + t0, 1.95 + t0));
      // the 7 reads as '?' half-dropped: its bar is drawn at once with a loaded
      // stylus, its stem is dropped after (down from the bar) and drawn through
      if (st.map.bar > 0) {
        const m = st.map;
        st.sty = s < 0.75 + t0 ? m.bar * ease.inOutQuad(progress(s, 0.05 + t0, 0.4 + t0))
          : m.bar + (m.total - m.bar) * ease.inOutQuad(progress(s, 0.95 + t0, 1.95 + t0));
      }
      st.push = ease.outCubic(progress(st.tl, 0, 0.6));
      st.on = st.tl > 0;
      // the drops (and while they ripple, the surface round them) are worked out this far out
      // (the ripples' reach, 8 px; once they are done, the grown drops' own edge)
      st.reach8 = st.tl < (hourIn ? 0.16 : 0.25) + 0.5 ? 64 : Math.ceil((st.sl.hw + st.sl.mo + 0.5) * 8);
    }
    if (opt.fresh) st.on = false;
    slots.push(st);
  }
  const bath = bathFor(hourKeyOf(f)), tab = opt.tab;
  // The hour's bath starts as plain stones; each minute turn the marbler draws
  // the combs a little further, so the feathers grow through the hour (the
  // hour's progress is in the pattern) and the print takes them at the hour.
  // Before the print the bath is combed once more, and harder.
  const amt = (m) => 0.12 + 0.88 * Math.sqrt(m / 60);
  let tines = null, ops;
  if (opt.fresh) ops = bathTables(bath, opt.T, 0, 0, -99, tab);
  else if (s >= 58.3) {
    const yT = hourOut ? hourCombY(s) : combY(s);
    ops = bathTables(bath, opt.T, amt(f.m), hourOut ? amt(60) + 0.35 : amt(f.m + 1), yT, tab);
    tines = { yT, live: yT > -5 && yT < H + 5 };
  } else ops = bathTables(bath, opt.T, amt(f.m), amt(f.m), -99, tab);
  OPS += ops + 200;
  return { tines, bath, tab, hour: f.h, slots, cheap: false, bloomT: opt.fresh ? s - 60 : hourIn ? s : -99 };
}

const TABS = [newTables(), newTables()];
const SH = new Float32Array(240), ROWOFF = Int16Array.from({ length: H }, (_, y) => (0.7 * y) | 0);

/** Building the next numerals' maps, in place, in the gap between the old paint leaving and the new arriving. */
function buildOps(f, s, prv, nxt) {
  const hourOut = nxt.h !== f.h, cur = f.hh + f.mm, nd = nxt.hh + nxt.mm;
  const a = hourOut ? 59.72 : 59.62, b = 60.02;
  if (s < a || s >= b) return 0;
  let ops = 0;
  for (let k = 0; k < 4; k++) if (cur[k] !== nd[k]) ops += mapFor(nd[k], k).ops;
  return Math.ceil(ops / ((b - a) * 60));
}

// ------------------------------------------------------------ the frame

export function frame(g, ctx) {
  const f = ctx.fields, s = f.sec, date = ctx.date, nt = ctx.night;
  ctx.lcd.backlight(1 - 0.6 * nt);
  const T = date.getTime() / 1000;
  const prv = previousMinute(date), nxt = clockFields(new Date(date.getTime() + 60000));
  OPS = 0;

  // the wet sheen: a soft band of reflected light that slides across the size now and then
  const sp = (T % 17) / 9, pos = -40 + 300 * sp;
  for (let i = 0; i < 240; i++) { const u = 1 - Math.abs(i - pos) / 34; SH[i] = sp < 1 && u > 0 ? 2.9 * u * u * (3 - 2 * u) : 0; }
  OPS += 240 * 6;

  const flow = FLOW * T;
  const night = nt >= 0.5;
  const cur = worldAt(f, s, flow, { prv, nxt, T, tab: TABS[0] });
  const buf = g.buf;

  // the hour: the sheet is laid on the bath and peeled off with the pattern
  const hourOut = nxt.h !== f.h && s >= 59.05, hourIn = prv.h !== f.h && s < PEEL_DONE;
  if (!hourOut && !hourIn) {
    const lutD = lutFor(f.h, false, 'bath'), lutN = lutFor(f.h, true, 'bath');
    const fading = nt > 0 && nt < 1, lut = night ? lutN : lutD;
    for (let y = 0, i = 0; y < H; y++) {
      const ro = ROWOFF[y], by = (y & 3) << 2;
      for (let x = 0; x < W; x++, i++) {
        shade(cur, x, y);
        const b = BAYER[by | (x & 3)];
        let lv = SH[x + ro] + RIP + b;
        lv = lv >= 3 ? 3 : lv | 0;
        // over the minute night fades in or out, the two palettes dissolve into each other
        buf[i] = (fading ? (nt > b ? lutN : lutD) : lut)[OUT * NL + lv];
      }
    }
    OPS += W * H * 8;
  } else sheet(g, f, s, flow, night, cur, prv, nxt, hourOut, date);
  g.cost.px += W * H;
  g.cost.box += OPS + buildOps(f, s, prv, nxt);

  overlay(g, cur, s, night);
}

/** The print: the old bath (under the sheet, and on the peeled flap) and the new one. */
function sheet(g, f, s, flow, night, cur, prv, nxt, hourOut, date) {
  const T = date.getTime() / 1000;
  let oldW, newW, oldH, newH;
  if (hourOut) {
    oldW = cur; oldH = f.h; newH = nxt.h;
    // (the fresh bath is only seen once the fold starts to move)
    newW = s >= 59.6 ? worldAt(nxt, s, flow, { prv: f, nxt, fresh: true, T, tab: TABS[1] }) : null;
    if (newW) newW.bloomT = s - 60;
  } else {
    const p2 = clockFields(new Date(date.getTime() - 120000));
    oldW = worldAt(prv, 59.99, flow, { prv: p2, nxt: f, T, tab: TABS[1] });
    newW = cur; oldH = prv.h; newH = f.h;
  }
  const Tm = hourOut ? s - 60 : s;
  const xP = -14 + 190 * ease.inOutQuad(progress(s, 59.05, 59.55));   // the sheet rolling on from the left
  const c = peelC(Tm), nx = FOLD_NX, ny = FOLD_NY;                    // the fold, peeling from the top left corner
  const lutBN = lutFor(newH, night, 'bath'), lutBO = lutFor(oldH, night, 'bath');
  const lutP = lutFor(oldH, night, 'paper'), lutS = lutFor(oldH, night, 'shadow'), lutF = lutFor(oldH, night, 'print');
  const buf = g.buf;
  const EDGE = (C.EDGE * NC + C.EDGE) * NQ;
  if (Tm < -0.35) {
    // the sheet rolling on from the left: per row, the paper up to its edge, the bath beyond
    for (let y = 0, i = 0; y < H; y++) {
      const ro = ROWOFF[y], by = (y & 3) << 2, xb = xP - 0.3 * (y + 0.5 - 40);
      OPS += 10;
      for (let x = 0; x < W; x++, i++) {
        OPS += 8;
        const d = xb - (x + 0.5);
        if (d > 1.2) {
          // lying on the bath: the paint seen through the wet sheet
          oldW.cheap = true; shade(oldW, x, y); oldW.cheap = false;
          buf[i] = lutP[OUT];
        } else if (d > 0) buf[i] = lutP[EDGE];
        else {
          shade(oldW, x, y);
          let lv = SH[x + ro] + RIP + BAYER[by | (x & 3)]; lv = lv >= 3 ? 3 : lv | 0;
          buf[i] = lutBO[OUT * NL + lv];
        }
      }
    }
    return;
  }
  for (let y = 0, i = 0; y < H; y++) {
    const py = y + 0.5, ro = ROWOFF[y], by = (y & 3) << 2;
    for (let x = 0; x < W; x++, i++) {
      const px = x + 0.5;
      OPS += 10;
      const laid = Tm >= -0.45 || px + 0.3 * (py - 40) < xP;
      if (!laid) {
        shade(oldW, x, y);
        let lv = SH[x + ro] + RIP + BAYER[by | (x & 3)]; lv = lv >= 3 ? 3 : lv | 0;
        buf[i] = lutBO[OUT * NL + lv];
        continue;
      }
      const dn = nx * px + ny * py - c;
      if (dn < 0) {
        // peeled: the fresh bath
        shade(newW, x, y);
        let lv = SH[x + ro] + RIP + BAYER[by | (x & 3)]; lv = lv >= 3 ? 3 : lv | 0;
        buf[i] = lutBN[OUT * NL + lv];
        continue;
      }
      // the flap lies folded back over the sheet: its face is the print, mirrored
      // (by now the old numerals have left the bath: the print is of the stones)
      const qx = px - 2 * dn * nx, qy = py - 2 * dn * ny;
      if (qx > -1.5 && qy > -1.5) {
        if (qx < -0.4 || qy < -0.4) { buf[i] = lutF[EDGE]; continue; }
        buf[i] = lutF[groundCode(oldW, qx, qy, clamp(qx | 0, 0, W - 1), clamp(qy | 0, 0, H - 1))];
        continue;
      }
      // the edge of the sheet as it is laid
      if (px + 0.3 * (py - 40) > xP - 1.2 && Tm < -0.45) { buf[i] = lutP[EDGE]; continue; }
      // still lying on the bath: the paint seen through the wet sheet (a flat shadow under the flap's edge)
      const sx = px - 1.6, sy = py - 2.2, ds = nx * sx + ny * sy - c;
      const shadow = ds > 0 && sx - 2 * ds * nx > -1.5 && sy - 2 * ds * ny > -1.5;
      oldW.cheap = true;
      shade(oldW, x, y);
      oldW.cheap = false;
      buf[i] = (shadow ? lutS : lutP)[OUT];
    }
  }
}

/** Tools on the bath: the comb's tines and the stylus. */
function overlay(g, Wd, s, night) {
  const ink = night ? 0x140a0a : 0x1d0d10;
  const c = Wd.tines;
  if (c && c.live) {
    const xP = s >= 59.05 ? -14 + 190 * ease.inOutQuad(progress(s, 59.05, 59.55)) : -99;   // under the sheet once it is laid
    for (const tx of TINES) if (tx + 0.3 * (c.yT - 40) > xP) g.fillCircle(tx, c.yT, 1.1, ink, { aa: true });
  }
  for (const st of Wd.slots) {
    if (st.mode !== 2 || !st.on || st.sty <= 0.5 || st.sty >= st.map.total - 0.5) continue;
    const [bx, by] = pointAt(st.map, st.sty);
    g.fillCircle(st.sl.x + bx, st.sl.y + by, 1.4, ink, { aa: true });
  }
}

