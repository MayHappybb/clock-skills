// Mitosis: a live culture under a fluorescence microscope. The numerals
// are giant amoebae, stained the way biologists stain cells (membrane dye,
// DAPI nuclei, mitochondria), lying on a deep coloured field; a paramecium
// beats its way across behind them and diatoms glide, glowing red with
// their own chlorophyll.
//
// A digit changes the way a cell does. A second before the minute the old
// cell pulls its pseudopods in and rounds up; its nucleus dissolves into
// condensed chromosomes that line up on a plate between the spindle poles.
// At :00 the chromosomes are pulled apart, a cleavage furrow pinches the
// cell in two, and one daughter spreads out, nucleus first and tips last,
// into the new numeral while its sister sinks out of focus. The old digit is
// a round cell (no number) before :00; the new one only grows after it.
// The hour: the stain is washed out and a new one perfused in. The new dye
// arrives as a glowing front with the parabolic profile of flow in a
// channel and every cell it passes changes colour, while the changing
// digits divide as at any minute.
//
// Letterforms: one cell per digit, drawn as a tube of capsules along a
// skeleton designed for this grid (mitosis-cells.js): 11 px bodies, open
// counters, free ends swelling like pseudopod tips, the nucleus bulging the
// membrane where it sits. The hours are two big cells, the minutes two
// smaller ones staggered on the right, the way cells lie in a dish.
// All AA: everything here is soft and moves by fractions of a pixel.
//
// Colour: a fluorophore set per hour, cycling through four real stain
// combinations, each a membrane / nuclear / mitochondrial triple chosen so
// the three are far apart in hue, over a deep field tinted to complement
// them (never black: an LCD's black glows, so the dark is a deliberate
// navy or plum with the out-of-focus haze of the stain round each cell and
// a vignette from the field stop). The membrane is the brightest thing on
// the glass, so the time reads first; the nucleus is the second.
//
// Cost: resting cells are sprites, drawn once per stain at load (flash
// tables on the device, ~0.5 MB); only cells in transition are drawn live.
// The field is a coarse shader with the cells' haze looked up from tables.

import { Gfx, hex, mix, scale, sin, cos, clamp, rand, progress, ease, lerp, clockFields } from '../js/kit.js';
import { GEO, SLOTS, ROUND, VIGNETTE, GW, GH } from './mitosis-cells.js';

const TAU = Math.PI * 2;
const STAINS = [
  // GFP membrane, DAPI nuclei, mCherry mitochondria, on navy
  { field: '16285c', deep: '081030', haze: '1a6a52', mem: '6cfa8e', cyto: '0d3a2b', core: '1b5e44', nuc: '5272ff', nucHi: 'b0c2ff', mito: 'ff4f72', chrom: 'd6deff', tub: 'c8ffd8' },
  // mCherry membrane, Hoechst nuclei, YFP mitochondria, on plum
  { field: '2e1048', deep: '120620', haze: '6a1c50', mem: 'ff6a8c', cyto: '3e0f26', core: '64203e', nuc: '3aa4ff', nucHi: 'b4e0ff', mito: 'ffdc48', chrom: 'd8f0ff', tub: 'ffd0dc' },
  // YFP membrane (a clean yellow-green), DAPI nuclei, cyan mitochondria, on deep teal-indigo
  { coreMix: 0.34, field: '1c4c86', deep: '0e2856', haze: '2a8a5a', mem: 'f0ffa0', cyto: '0e5464', core: '3a6a22', nuc: '8a6cff', nucHi: 'd4c8ff', mito: '42f4d4', chrom: 'e4dcff', tub: 'f0ffc0' },
  // CFP membrane, magenta nuclei, lime mitochondria, on indigo
  { field: '1a1450', deep: '0a0824', haze: '125070', mem: '56dcff', cyto: '0a2c42', core: '15506c', nuc: 'ff5cd4', nucHi: 'ffc4f0', mito: 'b0ff52', chrom: 'ffd8f4', tub: 'd0f4ff' },
].map((p) => {
  const cm = p.coreMix ?? 0.5;
  const q = Object.fromEntries(Object.entries(p).filter(([k]) => k !== 'coreMix').map(([k, v]) => [k, hex(v)]));
  // the cytoplasm glows too, brightest where the cell is thickest (a cool cytoplasm under the
  // yellow-green YFP set takes less of the membrane colour, so it never turns olive when dimmed)
  q.core = mix(q.cyto, q.mem, cm);
  q.mid = mix(q.cyto, q.mem, cm * 0.52);
  q.memHi = mix(q.mem, 0xffffff, 0.4);
  q.memLo = mix(q.mem, q.cyto, 0.3);
  // what the field looks like just outside a membrane: the resting sprites' AA edges are blended onto it
  q.edge = mix(mix(q.deep, q.field, 0.8), q.haze, 0.75);
  return q;
});
const KEYS = Object.keys(STAINS[0]);

const MEM = 1.5;                 // membrane thickness
const MIDF = 0.68;               // the thicker, brighter middle of the cytoplasm, as a fraction of the width
const CORE0 = 0.36, CORE1 = 0.68;  // the bright endoplasm, as a fraction of the radius: resting, round
const RHO = 0.4, RDF = 0.6;      // a round cell is capsules of radius RDF*R on a ring of radius RHO*R
const PAD = 5;

// the turn, in seconds from :00 (per slot, shifted a little so they are not in lockstep)
// T0 rounding starts, T1 round, 0 anaphase, T2 cleaved, T3 abscission, T4 spread, TB sister gone.
// dl: how far the far tips lag the nucleus as it rounds (dlIn: as it spreads, kept small so a
// half-spread cell is a fat small copy of its digit, never a blob with a tail that reads as 9); quick: at the hour the cell rounds over a short window (it passes through the in-between shapes,
// which could read as another digit, in a few frames), and spreading
// shapes it early. At the hour, when up to all four digits change at once, the cells divide fast so
// the time is never gone for much more than a second.
const MINUTE = { T0: -1.25, T1: -0.5, T2: 0.6, T3: 0.8, T4: 2.0, TB: 2.2, dl: 0.4, dlIn: 0.12, quick: false };
const HOUR = { T0: -0.62, T1: -0.28, T2: 0.36, T3: 0.46, T4: 1.45, TB: 1.7, dl: 0.15, dlIn: 0, quick: true };
const LAG = [0.09, 0.06, 0.03, 0];

// ------------------------------------------------------------ cells

const NMAX = 64;
const PX = new Float32Array(NMAX), PY = new Float32Array(NMAX), PR = new Float32Array(NMAX), PC = new Float32Array(NMAX), PE = new Float32Array(NMAX);

/** A cell body: three passes of capsules (membrane, cytoplasm, endoplasm). */
function drawBody(g, seg, tone, X, Y, R, CF, P, dx, dy) {
  // the membrane and its inner edge are AA; the low-contrast layers inside are hard (an AA edge costs ~30 hard pixels)
  const o = { aa: true }, h = { aa: false };
  for (let q = 0; q < seg.length; q += 2) {
    const i = seg[q], j = seg[q + 1], k = tone[q >> 1];   // the dye takes up patchily
    g.thickLine(X[i] + dx, Y[i] + dy, X[j] + dx, Y[j] + dy, R[i] + R[j], k > 0 ? P.memHi : k < 0 ? P.memLo : P.mem, o);
  }
  for (let q = 0; q < seg.length; q += 2) {
    const i = seg[q], j = seg[q + 1];
    g.thickLine(X[i] + dx, Y[i] + dy, X[j] + dx, Y[j] + dy, R[i] + R[j] - 2 * MEM, P.cyto, o);
  }
  for (let q = 0; q < seg.length; q += 2) {
    const i = seg[q], j = seg[q + 1];
    g.thickLine(X[i] + dx, Y[i] + dy, X[j] + dx, Y[j] + dy, (R[i] + R[j]) * MIDF, P.mid, h);
  }
  for (let q = 0; q < seg.length; q += 2) {
    const i = seg[q], j = seg[q + 1];
    g.thickLine(X[i] + dx, Y[i] + dy, X[j] + dx, Y[j] + dy, R[i] * CF[i] + R[j] * CF[j], P.core, h);
  }
}

/** A round cell, the same three layers: matches drawBody's fully rounded state. */
function drawRound(g, x, y, R, P, a = 1) {
  const o = { aa: true, a }, h = { aa: false, a };
  g.fillCircle(x, y, R, P.mem, o);
  g.fillCircle(x, y, R - MEM, P.cyto, o);
  g.fillCircle(x, y, (RHO + MIDF * RDF) * R, P.mid, h);
  g.fillCircle(x, y, (RHO + CORE1 * RDF) * R, P.core, h);
}

// resting cells: one sprite per stain, slot and digit
const SPR = STAINS.map((P) => SLOTS.map((S, sl) => GEO[sl].map((geo) => {
  const c = new Gfx(S.w + 2 * PAD, S.h + 2 * PAD);
  c.clear(P.edge);
  const cf = new Float32Array(geo.n).fill(CORE0);
  drawBody(c, geo.seg, geo.tone, geo.x, geo.y, geo.r, cf, P, PAD - S.x, PAD - S.y);
  return { c, key: P.edge, x: S.x - PAD, y: S.y - PAD, w: S.w + 2 * PAD, h: S.h + 2 * PAD };
})));

// the same cells lit by the arriving dye: drawn, translucent, just behind the wash front
const FLASH = STAINS.map((P) => {
  const q = { ...P };
  q.mem = q.memHi = q.memLo = mix(P.mem, 0xffffff, 0.75);
  q.cyto = mix(P.cyto, P.mem, 0.55); q.mid = mix(P.cyto, P.mem, 0.7); q.core = mix(P.mem, 0xffffff, 0.3);
  return q;
});
const SPF = FLASH.map((P, pi) => SLOTS.map((S, sl) => GEO[sl].map((geo) => {
  const c = new Gfx(S.w + 2 * PAD, S.h + 2 * PAD), key = STAINS[pi].edge;
  c.clear(key);
  drawBody(c, geo.seg, geo.tone, geo.x, geo.y, geo.r, new Float32Array(geo.n).fill(CORE0), P, PAD - S.x, PAD - S.y);
  return { c, key, x: S.x - PAD, y: S.y - PAD };
})));

/**
 * The cell's points between rest (k = 0) and round (k = 1), round about
 * (cx, cy) with radius R. Each point has its own progress: near the nucleus
 * first, the far tips last, so pseudopods trail as it rounds and reach out
 * last as it spreads. A ruffle runs along the membrane while it moves.
 */
function shapeAt(geo, k, cx, cy, R, t, spread, L) {
  const lag = spread ? L.dlIn : L.dl, rD = RDF * R, rho = RHO * R, span = 1 - lag;
  for (let i = 0; i < geo.n; i++) {
    const dl = lag * geo.delay[i];
    const q = spread ? clamp((1 - k - dl) / span, 0, 1) : clamp((k - dl) / span, 0, 1);
    if (L.quick && !spread) {
      // the hour: the digit first swells and draws in on itself until its counters close (a fat
      // blob, never another digit's shape), then settles into a disc
      const e1 = ease.inOutQuad(clamp(q / 0.45, 0, 1)), e2 = ease.inOutQuad(clamp((q - 0.28) / 0.45, 0, 1));
      const sx = cx + (geo.x[i] - cx) * (1 - 0.55 * e1), sy = cy + (geo.y[i] - cy) * (1 - 0.55 * e1);
      PX[i] = lerp(sx, cx + rho * geo.cth[i], e2);
      PY[i] = lerp(sy, cy + rho * geo.sth[i], e2);
      PR[i] = lerp(geo.r[i], rD, e1);
      PC[i] = lerp(CORE0, CORE1, e2);
      PE[i] = e2;
      continue;
    }
    const e = L.quick ? 1 - ease.outCubic(q) : ease.inOutQuad(spread ? 1 - q : q);
    const ruffle = 3.2 * e * (1 - e) * sin(t * 7 + i * 0.9);
    PX[i] = lerp(geo.x[i], cx + rho * geo.cth[i], e) + geo.nx[i] * ruffle;
    PY[i] = lerp(geo.y[i], cy + rho * geo.sth[i], e) + geo.ny[i] * ruffle;
    PR[i] = lerp(geo.r[i], rD, e);
    PC[i] = lerp(CORE0, CORE1, e);
    PE[i] = e;
  }
}

/** The nucleus: a capsule along the cell, DAPI-bright, with a nucleolus drifting in it. */
function nucleus(g, x, y, ang, half, w, P, t, a) {
  if (a <= 0) return;
  const ux = cos(ang) * half, uy = sin(ang) * half;
  g.thickLine(x - ux, y - uy, x + ux, y + uy, w, P.nuc, { aa: true, a });
  const d = 0.55 * sin(t * 0.37);
  g.fillCircle(x + ux * d + 0.4, y + uy * d - 0.3, Math.min(1.35, w * 0.22), P.nucHi, { aa: true, a: 0.9 * a });
}

/** Mitochondria streaming along the cell: out along one side, back along the other. */
function organelles(g, geo, X, Y, lat, t, sl, P, a) {
  if (a <= 0.02) return;
  const o = { aa: true, a };
  for (let p = 0; p < geo.paths.length; p++) {
    const [first, cnt, len, closed] = geo.paths[p];
    const m = Math.max(1, Math.round(len / 17));
    for (let j = 0; j < m; j++) {
      const ph = t * (24 / len) + (j * TAU) / m + sl * 1.7 + p * 2.1;
      let pos, side;
      if (closed) { pos = ((t * 9 + (j * len) / m + sl * 13) % len + len) % len; side = 0.55 * sin(ph * 2.3 + j); }
      else { pos = len * (0.5 - 0.5 * cos(ph)); side = 0.75 * sin(ph); }
      const fi = (pos / len) * (cnt - 1), i0 = Math.min(cnt - 2, Math.floor(fi)), fr = fi - i0, i = first + i0;
      const nx = lerp(geo.nx[i], geo.nx[i + 1], fr), ny = lerp(geo.ny[i], geo.ny[i + 1], fr);
      const off = side * (geo.r[i] - MEM - 1.7) * lat;
      const x = lerp(X[i], X[i + 1], fr) + nx * off, y = lerp(Y[i], Y[i + 1], fr) + ny * off;
      const tx = ny * 1.3, ty = -nx * 1.3;
      g.thickLine(x - tx, y - ty, x + tx, y + ty, 1.7, P.mito, o);
    }
  }
}

/** Five chromosomes: scattered in the nucleus, then on the plate, then pulled to the poles. */
function chromosomes(g, cx, cy, ax, ay, R, gather, split, sep, key, P, a) {
  if (a <= 0.02) return;
  const px = -ay, py = ax;   // along the plate
  for (let c = 0; c < 5; c++) {
    const sx = (rand(key, c, 1) - 0.5) * R * 0.7, sy = (rand(key, c, 2) - 0.5) * R * 0.7;
    const plate = (c - 2) * R * 0.17;
    const x = cx + lerp(sx, px * plate, gather), y = cy + lerp(sy, py * plate, gather);
    const ang = lerp(rand(key, c, 3) * 3, 0, gather);
    const dx = lerp(cos(ang) * px + sin(ang) * ax, ax, gather), dy = lerp(cos(ang) * py + sin(ang) * ay, ay, gather);
    if (split <= 0) {
      g.thickLine(x - dx * 1.6, y - dy * 1.6, x + dx * 1.6, y + dy * 1.6, 1.7, P.chrom, { aa: true, a });
    } else {
      for (const s of [-1, 1]) {
        const ox = x + ax * s * sep, oy = y + ay * s * sep;
        // the arms trail behind the kinetochore as they are pulled
        const tr = 1.3 + 0.5 * split;
        g.thickLine(ox - ax * s * tr - px * 0.5, oy - ay * s * tr - py * 0.5, ox, oy, 1.3, P.chrom, { aa: true, a });
        g.thickLine(ox - ax * s * tr + px * 0.5, oy - ay * s * tr + py * 0.5, ox, oy, 1.3, P.chrom, { aa: true, a });
      }
    }
  }
}

function spindle(g, cx, cy, ax, ay, R, sep, P, a) {
  if (a <= 0.02) return;
  const px = -ay, py = ax, o = { aa: true, a: 0.32 * a };
  for (const s of [-1, 1]) {
    const qx = cx + ax * s * (0.75 * R + sep * 0.3), qy = cy + ay * s * (0.75 * R + sep * 0.3);
    for (let c = 0; c < 5; c++) {
      const plate = (c - 2) * R * 0.17;
      g.thickLine(qx, qy, cx + px * plate + ax * s * sep, cy + py * plate + ay * s * sep, 0.7, P.tub, o);
    }
  }
}
/** The flow front of a stain wash at row y: parabolic, the middle of the channel leads. */
const frontX = (F, y) => F + 26 * (1 - ((y - 40) / 40) ** 2);

/** A resting cell: its sprite in the old stain, and in the new one where the dye has reached. */
function drawRest(g, sl, d, po, pn, F) {
  const a = SPR[po][sl][d], b = SPR[pn][sl][d];
  if (F >= a.x + a.w) { g.draw(b.c, b.x, b.y, { key: b.key }); return; }
  if (frontX(F, a.y) <= a.x && frontX(F, a.y + a.h) <= a.x && frontX(F, 40) <= a.x) { g.draw(a.c, a.x, a.y, { key: a.key }); return; }
  g.draw(a.c, a.x, a.y, { key: a.key });
  const fl = SPF[pn][sl][d];
  for (let y = a.y; y < a.y + a.h; y += 4) {
    const xb = frontX(F, y + 2);
    if (xb <= a.x) continue;
    g.clip(0, y, xb, 4);
    g.draw(b.c, b.x, b.y, { key: b.key });
    g.unclip();
    // the dye front lights the cell as it passes: two bands, brighter at the front
    if (xb - 18 > a.x + a.w) continue;
    g.clip(xb - 7, y, 7, 4);
    g.draw(fl.c, fl.x, fl.y, { key: fl.key, a: 0.75 });
    g.unclip();
    g.clip(xb - 18, y, 11, 4);
    g.draw(fl.c, fl.x, fl.y, { key: fl.key, a: 0.3 });
    g.unclip();
  }
}

/** The life inside a resting cell: its nucleus and streaming mitochondria. */
function restLife(g, sl, d, t, P, calm) {
  const geo = GEO[sl][d], r = SLOTS[sl].r, RD = ROUND[sl];
  // filopodia: fine fingers felt out from the outer membrane and drawn back, four at a time, each somewhere new
  if (calm > 0)
    for (let b = 0; b < 4; b++) {
      const per = 3.1 + 0.6 * b, u = (t + b * 1.7 + sl * 0.9) / per, c = Math.floor(u), ph = u - c;
      const len = 5.5 * calm * sin(Math.PI * ph);
      if (len < 0.4) continue;
      const i = Math.floor(rand(c, b, sl * 10 + d) * geo.n);
      let nx = geo.nx[i], ny = geo.ny[i];
      if (nx * (geo.x[i] - RD.cx) + ny * (geo.y[i] - RD.cy) < 0) { nx = -nx; ny = -ny; }   // the outer side
      const sw = 0.35 * sin(t * 1.3 + b), fx = nx - ny * sw, fy = ny + nx * sw;
      const bx = geo.x[i] + nx * (geo.r[i] - 0.5), by = geo.y[i] + ny * (geo.r[i] - 0.5);
      g.thickLine(bx, by, bx + fx * len, by + fy * len, 0.9, P.mem, { aa: true, a: 0.85 });
    }
  organelles(g, geo, geo.x, geo.y, 1, t, sl, P, 1);
  nucleus(g, geo.nucX, geo.nucY, geo.nucA, r * 0.42, r * 1.25, P, t + sl, 1);
}

/** A digit-cell through the turn at time tau (seconds from :00). */
function drawTurn(g, sl, dOld, dNew, tau, P, t, key, L) {
  const { T0, T1, T2, T3, T4, TB } = L, pro = -T1;
  const S = SLOTS[sl], RD = ROUND[sl], R = RD.R, Rd = 0.8 * R, r = S.r;
  const cx = RD.cx, cy = RD.cy;
  // the division axis: diagonal, never upright, so two daughters one above the other cannot read as an 8
  const tl = (S.tilt * Math.PI) / 180 + (key & 2 ? 0.95 : -0.95), ax = -Math.sin(tl), ay = Math.cos(tl);
  const flip = key & 1 ? -1 : 1;                                                // which daughter stays
  if (tau < T1) {
    // rounding up
    const geo = GEO[sl][dOld], k = progress(tau, T0, T1), ke = ease.inOutQuad(k);
    shapeAt(geo, k, cx, cy, R, t, false, L);
    drawBody(g, geo.seg, geo.tone, PX, PY, PR, PC, P, 0, 0);
    organelles(g, geo, PX, PY, 1 - ke, t, sl, P, 1 - k);
    nucleus(g, lerp(geo.nucX, cx, ke), lerp(geo.nucY, cy, ke), geo.nucA, lerp(r * 0.42, 0, ke), lerp(r * 1.25, 0.9 * R, ke), P, t + sl, 1);
  } else if (tau < 0) {
    // prophase to metaphase: a round, bright cell; the nucleus gives way to chromosomes on a plate
    drawRound(g, cx, cy, R + 0.35 * sin(t * 5), P);
    nucleus(g, cx, cy, 0, 0, 0.9 * R, P, t + sl, 1 - progress(tau, T1, T1 + 0.6 * pro));
    spindle(g, cx, cy, ax, ay, R, 0, P, progress(tau, T1 + 0.3 * pro, T1 + 0.8 * pro));
    chromosomes(g, cx, cy, ax, ay, R, ease.inOutQuad(progress(tau, T1 + 0.24 * pro, -0.1 * pro)), 0, 0, key, P, progress(tau, T1, T1 + 0.44 * pro));
  } else if (tau < T3) {
    // anaphase and cytokinesis: pulled apart, pinched in two
    const v = ease.inOutQuad(progress(tau, 0, T2));
    const e = v * 1.02 * Rd, rc = lerp(R, Rd, v);
    const bw = tau < T2 ? lerp(1.9 * R, 2.2, v) : lerp(2.2, 0, progress(tau, T2, T3));
    const x0 = cx - ax * e, y0 = cy - ay * e, x1 = cx + ax * e, y1 = cy + ay * e, o = { aa: true };
    g.fillCircle(x0, y0, rc, P.mem, o); g.fillCircle(x1, y1, rc, P.mem, o);
    if (bw > 0.05) g.thickLine(x0, y0, x1, y1, bw, P.mem, o);
    g.fillCircle(x0, y0, rc - MEM, P.cyto, o); g.fillCircle(x1, y1, rc - MEM, P.cyto, o);
    if (bw > 2 * MEM) g.thickLine(x0, y0, x1, y1, bw - 2 * MEM, P.cyto, o);
    const mr = (RHO + MIDF * RDF) * rc, cr = (RHO + CORE1 * RDF) * rc;
    const h = { aa: false };
    g.fillCircle(x0, y0, mr, P.mid, h); g.fillCircle(x1, y1, mr, P.mid, h);
    if (bw > 2 * MEM + 1) g.thickLine(x0, y0, x1, y1, (bw - 2 * MEM) * 0.7, P.mid, h);
    g.fillCircle(x0, y0, cr, P.core, h); g.fillCircle(x1, y1, cr, P.core, h);
    if (bw > 2 * MEM + 2) g.thickLine(x0, y0, x1, y1, (bw - 2 * MEM) * 0.45, P.core, h);
    const sep = lerp(0.8, e * 0.8, ease.outQuad(progress(tau, 0, T2 * 0.9)));
    spindle(g, cx, cy, ax, ay, R, sep, P, 1 - progress(tau, T2 * 0.6, T2));
    chromosomes(g, cx, cy, ax, ay, R, 1, progress(tau, 0, 0.25 * T2), sep, key, P, 1 - progress(tau, T2, T3));
    const na = progress(tau, T2 - 0.1 * T2, T3);
    nucleus(g, x0, y0, 0, 0, 0.9 * Rd, P, t + sl, na);
    nucleus(g, x1, y1, 0, 0, 0.9 * Rd, P, t + sl + 3, na);
  } else {
    // the sister sinks out of focus; the other daughter spreads into the new digit
    const fb = progress(tau, T3, TB), eb = 1.02 * Rd + 9 * ease.outQuad(fb);
    if (fb < 1) {
      // sharp at first, then only a soft glow as it leaves the focal plane
      const bx = cx + flip * ax * eb, by = cy + flip * ay * eb, sh = 1 - progress(tau, T3, T3 + 0.22 * (T4 - T3)), fa = 1 - fb;
      const rb = Rd * (1 + 0.5 * fb);
      g.fillCircle(bx, by, rb, P.mid, { aa: true, a: 0.45 * fa * (1 - sh) });
      g.fillCircle(bx, by, rb * 0.5, P.nuc, { aa: true, a: 0.35 * fa * (1 - sh) });
      if (sh > 0) {
        drawRound(g, bx, by, rb, P, sh);
        nucleus(g, bx, by, 0, 0, 0.9 * rb, P, t + sl + 3, sh);
      }
    }
    const Ax = cx - flip * ax * 1.02 * Rd, Ay = cy - flip * ay * 1.02 * Rd;
    if (tau < T4) {
      const geo = GEO[sl][dNew], k = 1 - progress(tau, T3, T4), ke = ease.inOutQuad(k);
      shapeAt(geo, k, Ax, Ay, Rd, t, true, L);
      drawBody(g, geo.seg, geo.tone, PX, PY, PR, PC, P, 0, 0);
      organelles(g, geo, PX, PY, 1 - ke, t, sl, P, 1 - k);
      nucleus(g, lerp(geo.nucX, Ax, ke), lerp(geo.nucY, Ay, ke), geo.nucA, lerp(r * 0.42, 0, ke), lerp(r * 1.25, 0.9 * Rd, ke), P, t + sl, 1);
    } else return false;   // at rest: the caller draws the sprite
  }
  return true;
}

// ------------------------------------------------------------ the pond life behind the cells

const RIM = hex('bef2ff'), BODY = hex('2a5870'), GROOVE = hex('0c1826'), MAC = hex('a8bce0'), CV = hex('d0f4ff');

function paramecium(g, t, P) {
  const W = 0.13, x = 80 + 125 * sin(t * W), y = 41 + 17 * sin(t * W * 1.7 + 1);
  if (x < -32 || x > 192) return;
  const vx = 125 * W * cos(t * W), vy = 17 * W * 1.7 * cos(t * W * 1.7 + 1);
  const vl = Math.hypot(vx, vy) || 1, ux = vx / vl, uy = vy / vl, nx = -uy, ny = ux;
  const at = (al, ac) => [x + ux * al + nx * ac, y + uy * al + ny * ac];
  // cilia first, so the body's rim sits over their roots; a metachronal wave runs back along each flank
  const co = { aa: true, a: 0.7 };
  for (let side = -1; side <= 1; side += 2)
    for (let k = 0; k < 9; k++) {
      const al = 11 - k * 2.8, w = side * (al > 6 ? 4.6 - (al - 6) * 0.25 : 5.2);
      const b = 0.55 + 0.7 * sin(t * 13 - k * 1.05 + side);
      const dx = nx * side * cos(b) - ux * sin(b), dy = ny * side * cos(b) - uy * sin(b);
      const [bx, by] = at(al, w);
      g.thickLine(bx, by, bx + dx * 2.6, by + dy * 2.6, 0.75, RIM, co);
    }
  for (let k = -1; k <= 1; k++) {   // the caudal tuft
    const [bx, by] = at(-12, k * 1.6), b = 0.25 * sin(t * 9 + k);
    g.thickLine(bx, by, bx - ux * 3.6 + nx * (k * 1.2 + b), by - uy * 3.6 + ny * (k * 1.2 + b), 0.8, RIM, co);
  }
  // the body: a slipper, blunt in front, with the oral groove on whichever side the roll brings round
  const [hx, hy] = at(10.5, 0), [tx, ty] = at(-10.5, 0);
  g.thickLine(tx, ty, hx, hy, 10.8, RIM, { aa: true, a: 0.75 });
  g.thickLine(tx, ty, hx, hy, 8.8, BODY, { aa: true, a: 0.85 });
  const roll = sin(t * 2.1);
  const [g0x, g0y] = at(8, roll * 3), [g1x, g1y] = at(0, roll * 1.2);
  g.thickLine(g0x, g0y, g1x, g1y, 1.8, GROOVE, { aa: true, a: 0.7 });
  const [mx, my] = at(-1.5, -roll * 0.8);
  g.fillEllipse(mx, my, 2.6, 2.6, MAC, { aa: true, a: 0.32 });
  // food vacuoles, circulating (cyclosis), lit by the stain they ate
  for (let v = 0; v < 3; v++) {
    const ang = t * 0.6 + v * 2.1, [fx, fy] = at(6.5 * cos(ang), 2.2 * sin(ang));
    g.fillCircle(fx, fy, 1.15, P.mito, { aa: true, a: 0.7 });
  }
  for (const cv of [-7.5, 6.5]) {   // contractile vacuoles fill and snap shut
    const ph = ((t * 0.7 + cv * 0.1) % 1 + 1) % 1, rr = ph < 0.85 ? 0.5 + 1.2 * (ph / 0.85) : 1.7 * (1 - (ph - 0.85) / 0.15);
    const [qx, qy] = at(cv, -1.6);
    g.fillCircle(qx, qy, rr, CV, { aa: true, a: 0.55 });
  }
}

// Pennate diatoms: glass frustules, lanceolate (pointed at both ends), with
// the raphe slit down the middle and its central nodule, fine transverse
// striae, and the chloroplasts only a faint red glow inside the glass. They
// glide along their raphe, as pennate diatoms do.
const DIATOMS = [
  { x: 30, y: 74.5, amp: 22, w: 0.07, ph: 0.4, L: 10, W: 2.9 },
  { x: 112, y: 5, amp: 18, w: 0.055, ph: 2.6, L: 8.5, W: 2.5 },
];
const GLASS = hex('d4e69a'), GLASS_IN = hex('1a2a1e'), RAPHE = hex('f2ffd0'), CHL = hex('ff4a2a');
// the lens outline, unit half-length and half-width, as a polygon (precomputed)
const LENS = [];
for (let k = 0; k <= 10; k++) { const u = -1 + k / 5; LENS.push([u, Math.pow(Math.max(0, 1 - u * u), 0.75)]); }
for (let k = 10; k >= 0; k--) { const u = -1 + k / 5; LENS.push([u, -Math.pow(Math.max(0, 1 - u * u), 0.75)]); }
const LP = LENS.map(() => [0, 0]);
const STRIA = Float32Array.from({ length: 9 }, (_, i) => Math.pow(1 - ((i - 4) * 0.21) ** 2, 0.75));   // rib lengths
const lens = (x, y, L, W) => { for (let i = 0; i < LENS.length; i++) { LP[i][0] = x + LENS[i][0] * L; LP[i][1] = y + LENS[i][1] * W; } return LP; };

function diatoms(g, t) {
  const o = { aa: true };
  for (const D of DIATOMS) {
    const x = D.x + D.amp * sin(t * D.w + D.ph), y = D.y, L = D.L, W = D.W;
    g.fillPolygon(lens(x, y, L + 0.8, W + 0.7), GLASS, { aa: true, a: 0.85 });     // the glass wall
    g.fillPolygon(lens(x, y, L - 0.6, W - 0.8), GLASS_IN, { aa: true, a: 0.7 });   // seen through the valve
    g.fillEllipse(x, y, L * 0.5, W * 0.4, CHL, { aa: true, a: 0.22 });            // chloroplasts, a faint glow
    // striae: fine ribs across the valve, either side of the raphe
    for (let k = -4; k <= 4; k++) {
      if (k === 0) continue;
      const sx = x + k * L * 0.21, h = (W - 0.8) * STRIA[k + 4];
      g.thickLine(sx, y - h, sx, y - 0.75, 0.55, GLASS, { aa: true, a: 0.5 });
      g.thickLine(sx, y + 0.75, sx, y + h, 0.55, GLASS, { aa: true, a: 0.5 });
    }
    // the raphe: a slit along the middle, broken by the central nodule
    g.thickLine(x - L * 0.85, y, x - 1, y, 0.6, RAPHE, { aa: true, a: 0.75 });
    g.thickLine(x + 1, y, x + L * 0.85, y, 0.6, RAPHE, { aa: true, a: 0.75 });
    g.fillCircle(x, y, 0.85, GLASS, o);
  }
}

// ------------------------------------------------------------ the colon: two budding yeast cells

// Each grows a bud over the minute (a quiet seconds hand) that pinches off
// at :00 and drifts away as the next one starts.
const YEAST = [{ x: 77.5, y: 31, ang: -0.9 }, { x: 76.5, y: 48, ang: 2.3 }];

function yeast(g, s, t, P) {
  const body = mix(P.mem, P.field, 0.3), inner = mix(P.cyto, P.mem, 0.2), o = { aa: true };
  for (let k = 0; k < 2; k++) {
    const Y = YEAST[k], x = Y.x + 0.4 * sin(t * 0.7 + k), y = Y.y + 0.4 * sin(t * 0.55 + k * 2);
    const ux = cos(Y.ang), uy = sin(Y.ang);
    // last minute's bud, let go
    const age = s;
    if (age < 1.6) {
      const a = 1 - age / 1.6, d = 5.05 + age * 4;
      g.fillCircle(x + ux * d, y + uy * d, 2.2, body, { aa: true, a });
      g.fillCircle(x + ux * d, y + uy * d, 1.0, inner, { aa: true, a });
    }
    const rb = 0.5 + 1.7 * (s / 60), d = 3.4 + rb * 0.75;
    g.fillCircle(x + ux * d, y + uy * d, rb, body, o);
    g.fillCircle(x, y, 3.4, body, o);
    g.fillCircle(x, y, 2.1, inner, o);
    if (rb > 1.3) g.fillCircle(x + ux * d, y + uy * d, rb - 1.1, inner, o);
  }
}

// ------------------------------------------------------------ the face

const HZ = new Float32Array(GW * GH), BX = new Float32Array(3), BY = new Float32Array(3);
const MIXP = SLOTS.map(() => ({ ...STAINS[0] })), YP = { ...STAINS[0] };

/** mix() in integer channel arithmetic, for the per-pixel callback (no library rounding). */
function mixi(a, b, u) {
  const ar = a >> 16, ag = (a >> 8) & 255, ab = a & 255;
  return ((ar + ((b >> 16) - ar) * u) << 16) | ((ag + (((b >> 8) & 255) - ag) * u) << 8) | ((ab + ((b & 255) - ab) * u) | 0);
}

function addGlow(src, w) {
  if (w <= 0) return;
  for (let k = 0; k < HZ.length; k++) HZ[k] += src[k] * w;
}

export default {
  name: 'Mitosis',
  blurb: 'Stained amoebae under a microscope are the numerals; each changing digit divides into the new one, and every hour a new stain floods in.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, night = ctx.night;
    // the time the life runs on: a free-running millisecond counter, as a uint32 on the device
    // (it wraps every 49.7 days, not every midnight, so nothing jumps at 00:00)
    const t = (ctx.date.getTime() % 4294967296) / 1000;
    ctx.lcd.backlight(1 - 0.62 * night);

    // ---- this hour's stain, and the wash that brings the next one in
    let tauH, pn;
    if (f.m === 59 && s >= 58) { tauH = s - 60; pn = (f.h + 1) % 4; } else { tauH = f.m * 60 + s; pn = f.h % 4; }
    const po = (pn + 3) % 4, O = STAINS[po], N = STAINS[pn];
    const washing = tauH > -0.6 && tauH < 2.9;
    const F = washing ? lerp(-40, 200, ease.inOutQuad(progress(tauH, -0.6, 2.9))) : tauH < 0 ? -400 : 400;
    const wAt = (x, y) => (washing ? clamp((frontX(F, y) - x) / 8 + 0.5, 0, 1) : F > 0 ? 1 : 0);

    // ---- the digits this minute, and the jobs at the turns
    const cur = f.hh + f.mm;
    const nf = clockFields(new Date(ctx.date.getTime() + 60000)), pf = clockFields(new Date(ctx.date.getTime() - 60000));
    const nxt = nf.hh + nf.mm, prv = pf.hh + pf.mm;
    const LN = nf.m === 0 ? HOUR : MINUTE, LP = f.m === 0 ? HOUR : MINUTE;   // the turn ahead, the turn just past
    const job = [];
    HZ.fill(0);
    for (let sl = 0; sl < 4; sl++) {
      let J = null;
      const up = s - 60 - LAG[sl], dn = s - LAG[sl];
      if (cur[sl] !== nxt[sl] && up >= LN.T0) J = { a: +cur[sl], b: +nxt[sl], tau: up, key: f.minuteKey + 1, L: LN };
      else if (prv[sl] !== cur[sl] && dn < LP.TB) J = { a: +prv[sl], b: +cur[sl], tau: dn, key: f.minuteKey, L: LP };
      job.push(J);
      const pulse = 0.85 + 0.15 * sin(t * 0.9 + sl * 1.9);
      if (!J) { addGlow(GEO[sl][+cur[sl]].glow, pulse); continue; }
      const { T0, T1, T3, T4 } = J.L, rnd = J.tau < T1 ? progress(J.tau, T0, T1) : J.tau < T3 ? 1 : 1 - progress(J.tau, T3, T4);
      const dg = J.tau < 0 ? J.a : J.b;
      addGlow(GEO[sl][dg].glow, pulse * (1 - rnd));
      addGlow(ROUND[sl].glow, pulse * rnd * 1.15);
    }

    // ---- the field: deep, tinted, vignetted, with the stain's haze round each cell
    for (let q = 0; q < 3; q++) {
      BX[q] = 80 + 70 * sin(t * 0.011 + q * 2.1);
      BY[q] = 40 + 26 * sin(t * 0.017 + q * 1.3 + 0.5);
    }
    const dim = 1 - 0.12 * night;   // the backlight does the dimming; the dark keeps its colour
    const fO = scale(O.field, dim), fN = scale(N.field, dim), dO = scale(O.deep, dim), dN = scale(N.deep, dim);
    g.coarse((x, y) => {
      const k = (y >> 2) * GW + (x >> 2);
      const w = wAt(x, y);
      const mott = 0.5 + 0.5 * sin(x * 0.08 + t * 0.21 + 1.6 * sin(y * 0.11 - t * 0.13));
      let c = mixi(w >= 1 ? dN : mixi(dO, dN, w), w >= 1 ? fN : mixi(fO, fN, w), VIGNETTE[k] * (0.7 + 0.3 * mott));
      // cells deeper in the dish, far out of focus: soft discs of the stain drifting very slowly
      let deepC = 0;
      for (let q = 0; q < 3; q++) {
        const dx = (x - BX[q]) * 0.045, dy = (y - BY[q]) * 0.07, r2 = dx * dx + dy * dy;
        if (r2 < 1) deepC += (1 - r2) * (1 - r2);
      }
      const hz0 = HZ[k] + deepC * 0.45, hz = hz0 > 1 ? 1 : hz0;
      c = mixi(c, w >= 1 ? N.haze : mixi(O.haze, N.haze, w), hz * 0.85);
      if (washing) {
        const d = x - frontX(F, y), b = 1 - (d < 0 ? -d : d) / 12;
        if (b > 0) c = mixi(c, N.mem, b * b * 0.5);
      }
      return c;
    }, { cell: 4 });

    // ---- pond life, behind the cells (a deeper focal plane)
    diatoms(g, t);
    paramecium(g, t, N);

    // ---- the colon, then the cells
    {
      const w = wAt(77, 40);
      for (const k of KEYS) YP[k] = w >= 1 ? N[k] : mix(O[k], N[k], w);
      yeast(g, s, t, YP);
    }
    for (let sl = 0; sl < 4; sl++) {
      const RD = ROUND[sl], J = job[sl];
      const w = wAt(RD.cx, RD.cy), P = MIXP[sl];
      for (const k of KEYS) P[k] = w >= 1 ? N[k] : mix(O[k], N[k], w);
      if (J && drawTurn(g, sl, J.a, J.b, J.tau, P, t, J.key, J.L)) continue;
      drawRest(g, sl, +cur[sl], po, pn, F);
      // filopodia are drawn back before the cell rounds, and only reach out again once it has spread
      const calm = (cur[sl] !== nxt[sl] ? 1 - progress(s, 57, 58.4) : 1) * (prv[sl] !== cur[sl] ? progress(s, 2.3, 3.5) : 1);
      restLife(g, sl, +cur[sl], t, P, calm);
    }
  },
};
