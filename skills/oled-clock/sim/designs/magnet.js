// Magnet — the time in iron filings.
//
// A card sprinkled with iron filings over a stencil face whose strips are
// hairpins of wire threaded through the card (current up through the paper
// along one edge of a strip, down along the other). The field is computed
// exactly from those line currents (2-D Biot-Savart), with its stream
// function, so field lines are its level sets. A filing shows where it lies
// on a field line (the lines crowd together where the field is strong, as
// filings chain up) or where the field between a strip's wires packs the
// filings solid, and it lies along the field: the strips read as combed
// bands of filings, the lines turning round each strip's ends. A few stray
// filings in the open lie along the whole field. Six compass needles round
// the edge are damped pendulums in the field; the colon is a small bar
// magnet on a pivot turning once a minute (a seconds hand), stirring the
// filings round it all the time.
//
// The minute: from :57.3 the old digit's little magnets turn across their
// strips at random (the combed band dissolves into a ladder, then chaos),
// lift at :58.5, fly through a scattered cloud spinning whole turns, land
// across the new strips by about :01.5, and turn into line behind a front
// running along each strip: the field lines zip up into the new digit. The
// compasses swing with it.
//
// The hour: a big bar magnet (N up) slides across the card from :56.6,
// with the classic bar-magnet pattern of field lines round it; it wipes the
// old time as it passes, ploughs a drift of filings ahead of it off the
// right edge and drags the rest a little. At :00 the new time snaps in left
// to right and a fresh sprinkle of filings lands.
//
// Never a wrong time: the old digits only before :00 (whole or dissolving),
// a shapeless cloud across it, the new digits only after it.
//
// Everything is a function of the clock; the compass needles are simulated
// with a fixed step from just before each turn, cached and stepped on.
//
// Burn-in: the face walks kit.orbit, the compasses their own smaller orbit,
// the filings are new every hour, and the panel dims at night (ctx.night).

import { clamp, ease, clockFields, previousMinute, orbit, font3x5 } from '../js/kit.js';

const W = 128, H = 64, TAU = Math.PI * 2;
const DW = 22, DH = 38, TOP = 13;
const SLOT_X = [5, 31, 75, 101];
const ROTOR = [64, 32];
const COMPASS = [[8, 6], [64, 6], [120, 6], [8, 57], [64, 57], [120, 57]];

/** An integer hash as a float in [0, 1). */
function hash(a, b, c) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };

// ------------------------------------------------------------ letterforms
//
// A stencil face: every digit is cut from a few strips, with gaps between
// them, so each strip shows as its own combed band whose field lines turn
// round its ends, and the gaps stay open. Box 22 x 38.
const SKM = {
  0: [[[[9.4, 2.8], [4.6, 6.5], [3.4, 19], [4.6, 31.5], [9.4, 35.2]]], [[[12.6, 35.2], [17.4, 31.5], [18.6, 19], [17.4, 6.5], [12.6, 2.8]]]],
  1: [[[[5, 10.2], [12.4, 3]], [[12.4, 3], [12.4, 35.5]]]],
  2: [[[[3.4, 10], [5.4, 4.6], [11, 2.9], [16.6, 4.6], [18.6, 10], [16.6, 16], [4.4, 31.3]]], [[[4, 35.4], [19, 35.4]]]],
  3: [[[[3.6, 3.2], [16.4, 3.2]]], [[[18.4, 5.2], [10.6, 15.2]]],
    [[[12, 16.6], [17, 19], [18.8, 25.5], [16.6, 32.4], [11, 35.5], [5.6, 34], [3.4, 30]]]],
  4: [[[[13.2, 3.4], [3.4, 27]], [[3.4, 27], [19.6, 27]]], [[[16, 3], [16, 23.4]]], [[[16, 30.4], [16, 35.5]]]],
  5: [[[[18.6, 3.2], [6.6, 3.2]]], [[[5, 5.2], [4.4, 15.6]]],
    [[[6.4, 15.4], [12, 14], [17.4, 17], [19, 24.5], [17, 32], [11.5, 35.5], [5.6, 34], [3.4, 30]]]],
  6: [[[[16.4, 4], [11, 2.9], [6, 5.5], [3.8, 12], [3.4, 20], [4, 28], [7, 34], [10.6, 35.5]]],
    [[[13, 35.5], [17, 33.4], [18.7, 27], [17, 21], [12, 18.6], [7.4, 20], [5.6, 22.6]]]],
  7: [[[[3.4, 3.2], [16.6, 3.2]]], [[[18.8, 4.6], [13, 17], [9.6, 35.5]]]],
  8: [[[[12.6, 2.9], [17, 5], [17.6, 10], [15, 15], [11, 18.6], [5.4, 22], [3.4, 27.5], [5, 33], [9.4, 35.5]]],
    [[[12.6, 35.5], [17, 33], [18.6, 27.5], [16.6, 22], [11, 18.6], [7, 15], [4.4, 10], [5, 5], [9.4, 2.9]]]],
};
SKM[9] = SKM[6].map((st) => st.map((pc) => pc.map(([x, y]) => [DW - x, DH - y])));
/** Catmull-Rom through a piece's points, finely sampled. */
function smoothPiece(pts) {
  if (pts.length < 3) return pts.map((p) => [...p]);
  const n = pts.length - 1;
  const at = (i) => (i < 0 ? [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]]
    : i > n ? [2 * pts[n][0] - pts[n - 1][0], 2 * pts[n][1] - pts[n - 1][1]] : pts[i]);
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let k = 0; k < 12; k++) {
      const t = k / 12, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  out.push([...pts[n]]);
  return out;
}

// ------------------------------------------------------------ magnets
//
// Each strip is resampled into little magnets DS apart (each a hairpin of
// wire, below), each pointing along the strip, weaker at the strip's ends. A
// digit model lists them (slot coordinates) with their direction, weight and
// how far along their strip they sit (u, 0..1).
const DS = 2.4;

function buildModel(strips) {
  const x = [], y = [], tx = [], ty = [], u = [], w = [];
  for (const pieces of strips) {
    let raw = [];
    for (const pc of pieces) { const s = smoothPiece(pc); if (raw.length) s.shift(); raw.push(...s); }
    const cum = [0];
    for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
    const L = cum.at(-1), n = Math.max(2, Math.round(L / DS)), step = L / n;
    const at = (sk) => {
      let j = 0;
      while (j < raw.length - 2 && cum[j + 1] < sk) j++;
      const f = (sk - cum[j]) / (cum[j + 1] - cum[j] || 1);
      return [raw[j][0] + (raw[j + 1][0] - raw[j][0]) * f, raw[j][1] + (raw[j + 1][1] - raw[j][1]) * f];
    };
    for (let k = 0; k < n; k++) {
      const sk = (k + 0.5) * step;
      const [px, py] = at(sk), [ax, ay] = at(Math.max(0, sk - 0.6)), [bx, by] = at(Math.min(L, sk + 0.6));
      const l = Math.hypot(bx - ax, by - ay) || 1;
      x.push(px); y.push(py); tx.push((bx - ax) / l); ty.push((by - ay) / l); u.push(sk / L);
      w.push(Math.min(1, 0.45 + 0.4 * Math.min(k, n - 1 - k)));   // the ends taper, so lines leave them gently
    }
  }
  return { n: x.length, x, y, tx, ty, u, w, a: tx.map((c, i) => Math.atan2(ty[i], c)) };
}
const MODELS = {};
for (const d of Object.keys(SKM)) MODELS[d] = buildModel(SKM[d]);

// The sources of the field this frame. Each little magnet of a strip is a
// hairpin of wire threaded through the card: current up through the paper
// on one side of the strip and down on the other. Between the two rows of
// wire the field runs strongly along the strip; outside it the two rows
// nearly cancel, so the filings comb into a tight band and the field lines
// run along the strip and turn round its ends. A pair is stored by its
// centre, the half-offset to its wires and its current. Plus the rotor (a
// dipole) and, at the hour, the big magnet's two poles.
const MAXP = 600;
const PX = new Float32Array(MAXP), PY = new Float32Array(MAXP), PNX = new Float32Array(MAXP), PNY = new Float32Array(MAXP), PI = new Float32Array(MAXP);
let NP = 0;
const PD = 3.6, I0 = 0.15;
const dip = (x, y, a, m) => {
  PX[NP] = x; PY[NP] = y; PNX[NP] = (-Math.sin(a) * PD) / 2; PNY[NP] = (Math.cos(a) * PD) / 2; PI[NP] = I0 * m; NP++;
};
const ROT = [0, 0, 0, 0];   // x, y, mx, my
const POLES = [];           // [x, y, q]

// Pairs are binned in 8 px cells; filings sum the pairs within RC1 (their
// field falls off fast), with a smooth cut-off so nothing jumps.
const CELL = 8, NCX = 16, NCY = 8, RC0 = 5.5, RC1 = 8;
const binStart = new Int32Array(NCX * NCY + 1), binIdx = new Int32Array(MAXP), binOf = new Int32Array(MAXP);
function binPairs() {
  binStart.fill(0);
  for (let i = 0; i < NP; i++) {
    const c = clamp(Math.floor(PY[i] / CELL), 0, NCY - 1) * NCX + clamp(Math.floor(PX[i] / CELL), 0, NCX - 1);
    binOf[i] = c; binStart[c + 1]++;
  }
  for (let c = 0; c < NCX * NCY; c++) binStart[c + 1] += binStart[c];
  const fill = binStart.slice(0, NCX * NCY);
  for (let i = 0; i < NP; i++) binIdx[fill[binOf[i]]++] = i;
}

const EPS2 = 0.4;
const OUT = [0, 0, 0, 0];
let acc0 = 0, acc1 = 0, acc2 = 0;
function addPair(i, x, y, w) {
  const I = PI[i] * w;
  const ax = x - PX[i] - PNX[i], ay = y - PY[i] - PNY[i], bx = x - PX[i] + PNX[i], by = y - PY[i] + PNY[i];
  const ra = ax * ax + ay * ay + EPS2, rb = bx * bx + by * by + EPS2;
  acc0 += I * (-ay / ra + by / rb); acc1 += I * (ax / ra - bx / rb);
  acc2 -= 0.5 * I * Math.log(ra / rb);
}
function addOthers(x, y) {
  const dx = x - ROT[0], dy = y - ROT[1], inv = 1 / (dx * dx + dy * dy + 1);
  const pr = 2 * (ROT[2] * dx + ROT[3] * dy) * inv;
  acc0 += (pr * dx - ROT[2]) * inv; acc1 += (pr * dy - ROT[3]) * inv; acc2 += (ROT[2] * dy - ROT[3] * dx) * inv;
  for (const [px, py, q] of POLES) {
    const ex = x - px, ey = y - py, iq = q / (ex * ex + ey * ey + 12);
    acc0 += ex * iq; acc1 += ey * iq; acc2 += q * Math.atan2(ey, ex);
  }
}
/**
 * The field at (x, y) and its stream function psi: field lines are the level
 * sets of psi, so filings lying on a level set (every DPSI) form lines,
 * closer together where the field is stronger, as filings chain up.
 * out = [Bx, By, psi]. Near field only (what the filings feel).
 */
function field(x, y, out = OUT) {
  acc0 = acc1 = acc2 = 0;
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
  for (let j = Math.max(0, cy - 1); j <= Math.min(NCY - 1, cy + 1); j++)
    for (let i = Math.max(0, cx - 1); i <= Math.min(NCX - 1, cx + 1); i++) {
      const c = j * NCX + i;
      for (let k = binStart[c]; k < binStart[c + 1]; k++) {
        const p = binIdx[k], dx = x - PX[p], dy = y - PY[p], d2 = dx * dx + dy * dy;
        if (d2 >= RC1 * RC1) continue;
        let w = 1;
        if (d2 > RC0 * RC0) { const u = (Math.sqrt(d2) - RC0) / (RC1 - RC0); w = 1 - u * u * (3 - 2 * u); }
        addPair(p, x, y, w);
      }
    }
  out[3] = Math.hypot(acc0, acc1);   // the strips' own field, which packs filings solid
  addOthers(x, y);
  out[0] = acc0; out[1] = acc1; out[2] = acc2;
  return out;
}
/** The whole field, every source (what a compass needle feels); no psi. */
function fieldAll(x, y, out = OUT) {
  acc0 = acc1 = acc2 = 0;
  for (let p = 0; p < NP; p++) {
    const I = PI[p];
    const ax = x - PX[p] - PNX[p], ay = y - PY[p] - PNY[p], bx = x - PX[p] + PNX[p], by = y - PY[p] + PNY[p];
    const ra = ax * ax + ay * ay + EPS2, rb = bx * bx + by * by + EPS2;
    acc0 += I * (-ay / ra + by / rb); acc1 += I * (ax / ra - bx / rb);
  }
  addOthers(x, y);
  out[0] = acc0; out[1] = acc1; out[2] = acc2;
  return out;
}
// ------------------------------------------------------------ choreography
//
// Seconds from the :00 of the turn.
const UNZIP0 = -2.7, UNZIP = 0.7;          // the old strips' magnets turn across, one after another
const LIFT0 = -1.5, LIFT_J = 0.4, FLY = 2.5; // they lift, scatter, spin, and land on the new strips
const ZIP0 = 1.25, ZIP = 0.8;              // and turn into line, a front running along each strip
const MIN_END = ZIP0 + ZIP + 0.4;
const SWEEP0 = -3.4, SWEEP1 = -0.3;        // the hour: a big bar magnet crosses the face
const SNAP0 = 0.05, SNAP_W = 0.55;         // and the new time snaps in behind it, left to right
const H_END = 1.4;
const MD = 1, MR = 1.6, QB = (36 * 0.75) / TAU;          // a strip magnet, the rotor, the big magnet's poles

/** Where the big bar magnet is (its centre x) during the hour sweep. */
const bigX = (tau) => -16 + 162 * ease.inOutQuad(clamp((tau - SWEEP0) / (SWEEP1 - SWEEP0), 0, 1));
/** The rotor in the colon is a seconds hand: north up at :00. */
const rotorAngle = (tau) => -Math.PI / 2 + ((((tau % 60) + 60) % 60) / 60) * TAU;

function restSlot(m, k, s = 1) {
  for (let i = 0; i < m.n; i++) dip(SLOT_X[k] + m.x[i], TOP + m.y[i], m.a[i], MD * s * m.w[i]);
}

/**
 * A changing digit. Its magnets turn across their strips one after another
 * (the field lines along the strip unzip), lift, fly through a scattered
 * cloud spinning a whole number of turns, land across the new strips, and
 * turn into line behind a front running along each strip (they zip up).
 * Before :00 the cloud is still mostly the old digit's, after it the new one's.
 */
function flight(k, dA, dB, tau, key) {
  const mA = MODELS[dA], mB = MODELS[dB], N = Math.max(mA.n, mB.n);
  const x0 = SLOT_X[k], y0 = TOP;
  for (let j = 0; j < N; j++) {
    const ia = Math.floor((j * mA.n) / N), ib = Math.floor((j * mB.n) / N);
    const h1 = hash(j, k, key), h2 = hash(j, k + 7, key), h3 = hash(j, k + 13, key), h4 = hash(j, k + 19, key);
    const e = ease.inOutCubic(clamp((tau - LIFT0 - LIFT_J * h1) / FLY, 0, 1));
    const ax = mA.x[ia], ay = mA.y[ia], bx = mB.x[ib], by = mB.y[ib];
    const qx = 2 * (DW / 2 + (h2 - 0.5) * 34) - (ax + bx) / 2, qy = 2 * (DH / 2 + (h3 - 0.5) * 44) - (ay + by) / 2;
    const px = (1 - e) * (1 - e) * ax + 2 * (1 - e) * e * qx + e * e * bx;
    const py = (1 - e) * (1 - e) * ay + 2 * (1 - e) * e * qy + e * e * by;
    const zA = smooth((tau - UNZIP0 - UNZIP * h1) / 0.3);   // the old digit dissolves all over, not end to end
    const zB = smooth((tau - ZIP0 - ZIP * mB.u[ib]) / 0.3);
    const turns = (h4 < 0.5 ? -1 : 1) * (1 + (Math.floor(h4 * 4) % 2)) * TAU;
    const aA = mA.a[ia] + (zA * Math.PI) / 2, aB = mB.a[ib] + Math.PI / 2 + turns;
    const fly = (1 - 0.45 * Math.sin(Math.PI * e)) * (mA.w[ia] + (mB.w[ib] - mA.w[ia]) * e);   // weaker while scattered, so the swirl shows as lines
    dip(x0 + px, y0 + py, aA + (aB - aA) * e - (zB * Math.PI) / 2, (fly * MD * (mA.n + (mB.n - mA.n) * e)) / N);
  }
}

/** The hour: the big magnet drags the old strips' magnetism off; the new time snaps in after it. */
function hourSlot(k, dA, dB, tau) {
  const x0 = SLOT_X[k], y0 = TOP;
  if (tau < 0) {
    const m = MODELS[dA], front = bigX(tau) + 6;
    for (let i = 0; i < m.n; i++) {
      const x = x0 + m.x[i];
      if (x >= front) { dip(x, y0 + m.y[i], m.a[i], MD * m.w[i]); continue; }
      const c = front - x;
      if (c < 40) dip(front - 1 + 2 * hash(i, k, 3), y0 + m.y[i], m.a[i] + c * 0.15, MD * Math.exp(-c / 8));
    }
    return;
  }
  const m = MODELS[dB];
  for (let i = 0; i < m.n; i++) {
    const x = x0 + m.x[i], s = smooth((tau - SNAP0 - SNAP_W * (x / W)) / 0.22);
    if (s > 0) dip(x, y0 + m.y[i], m.a[i] + (1 - s) * (hash(i, k, 5) < 0.5 ? 1.6 : -1.6), MD * s * m.w[i]);
  }
}

/** Every source of the field at time tau of turn `st`. */
function sources(st, tau) {
  NP = 0; POLES.length = 0;
  const { A, B, hour, key } = st;
  const sweeping = hour && tau >= SWEEP0 && tau < H_END;
  for (let k = 0; k < 4; k++) {
    if (sweeping) hourSlot(k, A[k], B[k], tau);
    else if (!hour && A[k] !== B[k] && tau >= UNZIP0 && tau < MIN_END) flight(k, A[k], B[k], tau, key);
    else restSlot(MODELS[tau < 0 ? A[k] : B[k]], k);
  }
  const ra = rotorAngle(tau);
  ROT[0] = ROTOR[0]; ROT[1] = ROTOR[1]; ROT[2] = MR * Math.cos(ra); ROT[3] = MR * Math.sin(ra);
  if (sweeping && tau < SWEEP1 + 0.1) {
    const x = bigX(tau);
    POLES.push([x, 32 - 21, QB], [x, 32 + 21, -QB]);
  }
  binPairs();
}
// ------------------------------------------------------------ filings
//
// Filings are sprinkled on a jittered grid, fresh every hour (the hour's
// sweep clears the paper). Each one shows if the field is strong enough to
// have pulled it into a chain (always where the field is strong, rarely in
// the open), longer the stronger the field, and lies along the field.
const NFX = 64, NFY = 32;
const DPSI = 0.75, LINE_W = 0.6, B_LEN = 0.32, P_MIN = 0.04, B_CORE = 0.12;

const sprinkles = new Map();
function sprinkle(seed) {
  let s = sprinkles.get(seed);
  if (s) return s;
  const n = NFX * NFY, x = new Float32Array(n), y = new Float32Array(n), v = new Float32Array(n), l = new Float32Array(n);
  for (let j = 0, i = 0; j < NFY; j++)
    for (let k = 0; k < NFX; k++, i++) {
      x[i] = ((k + 0.5) * W) / NFX + (hash(i, seed, 1) - 0.5) * 1.9;
      y[i] = ((j + 0.5) * H) / NFY + (hash(i, seed, 2) - 0.5) * 1.9;
      v[i] = hash(i, seed, 3); l[i] = 0.8 + 0.4 * hash(i, seed, 4);
    }
  s = { n, x, y, v, l, seed };
  if (sprinkles.size > 3) sprinkles.clear();
  sprinkles.set(seed, s);
  return s;
}

function plot(buf, x, y, c = 1) {
  x = Math.floor(x); y = Math.floor(y);
  if (x >= 0 && y >= 0 && x < W && y < H) buf[y * W + x] = c;
}

/** One filing at (x, y) in the field there; `grow` 0..1 as it lands. */
function filing(buf, x, y, v, l, ox, oy, grow = 1) {
  const B = field(x, y), m = Math.hypot(B[0], B[1]);
  // On a field line? (distance to the nearest level set, in pixels)
  const q = B[2] / DPSI, off = (Math.abs(q - Math.round(q)) * DPSI) / Math.max(m, 1e-5);
  if (off > LINE_W * (0.7 + 0.6 * v) && v > P_MIN && B[3] < B_CORE * (0.6 + 0.8 * v)) return;
  let ux = m ? B[0] / m : 1, uy = m ? B[1] / m : 0;
  if (m < 0.02) {
    // A stray filing out in the open lies along the whole field, far sources and all.
    const A = fieldAll(x, y), ma = Math.hypot(A[0], A[1]);
    if (ma > 0) { ux = A[0] / ma; uy = A[1] / ma; }
  }
  const len = (1.4 + 2.2 * clamp(m / B_LEN, 0, 1)) * l * grow;
  const n = Math.ceil(len * 1.6) + 1;
  for (let k = 0; k < n; k++) {
    const t = n > 1 ? k / (n - 1) - 0.5 : 0;
    plot(buf, x + ox + ux * len * t, y + oy + uy * len * t);
  }
}

function drawFilings(buf, st, tau, seedA, seedB, ox, oy) {
  const sweep = st.hour && tau >= SWEEP0 && tau < 0;
  const after = st.hour && tau >= 0 && tau < 1.2;
  const S = sprinkle(tau < 0 ? seedA : seedB);
  if (!sweep && !after) {
    for (let i = 0; i < S.n; i++) filing(buf, S.x[i], S.y[i], S.v[i], S.l[i], ox, oy);
    return;
  }
  // The sweep: filings the magnet has reached are pushed ahead of it in a
  // drift, or dragged a little and dropped; after :00 fresh filings land.
  const O = sprinkle(seedA), front = bigX(Math.min(tau, SWEEP1)) + 6;
  for (let i = 0; i < O.n; i++) {
    if (after && tau >= 0.9 * hash(i, seedB, 47)) continue;
    let x = O.x[i];
    if (x < front) {
      const c = front - x;
      if (hash(i, seedA, 41) < 0.4) { x = front + 0.3 + 3.5 * hash(i, seedA, 43); if (x > W + 2) continue; }
      else x += Math.min(c, 3 + 9 * hash(i, seedA, 44));
    }
    filing(buf, x, O.y[i], O.v[i], O.l[i], ox, oy);
  }
  if (after) {
    const N = sprinkle(seedB);
    for (let i = 0; i < N.n; i++) {
      const t = tau - 0.9 * hash(i, seedB, 47);
      if (t >= 0) filing(buf, N.x[i], N.y[i], N.v[i], N.l[i], ox, oy, smooth(t / 0.15));
    }
  }
}
// ------------------------------------------------------------ compasses
//
// Each needle is a damped pendulum in the local field, simulated with a fixed
// step from shortly before a turn (when the field starts to change) to now;
// the state is cached and stepped on, so a run of frames costs a few steps
// each. Outside a turn the field barely moves and the needle simply lies
// along it.
const CDT = 1 / 60, CK = 200, CC = 5;
const csim = { key: null, t: 0, th: new Float64Array(COMPASS.length), om: new Float64Array(COMPASS.length) };

function needles(st, tau) {
  const w0 = st.hour ? SWEEP0 - 0.4 : UNZIP0 - 0.3, w1 = st.hour ? 5 : 4.6;
  const out = [];
  if (tau < w0 || tau > w1) {
    sources(st, tau);
    for (const [x, y] of COMPASS) { const B = fieldAll(x, y); out.push(Math.atan2(B[1], B[0])); }
    return out;
  }
  if (csim.key !== st.key || csim.t > tau + 1e-9) {
    sources(st, w0);
    COMPASS.forEach(([x, y], c) => { const B = fieldAll(x, y); csim.th[c] = Math.atan2(B[1], B[0]); csim.om[c] = 0; });
    csim.t = w0; csim.key = st.key;
  }
  while (csim.t + CDT <= tau + 1e-9) {
    sources(st, csim.t);
    COMPASS.forEach(([x, y], c) => {
      const B = fieldAll(x, y), m = Math.min(1, Math.hypot(B[0], B[1]) / 0.02);
      csim.om[c] += (CK * m * Math.sin(Math.atan2(B[1], B[0]) - csim.th[c]) - CC * csim.om[c]) * CDT;
      csim.th[c] += csim.om[c] * CDT;
    });
    csim.t += CDT;
  }
  const f = tau - csim.t;   // the part step to now
  COMPASS.forEach((_, c) => out.push(csim.th[c] + csim.om[c] * f));
  return out;
}

function drawCompass(g, cx, cy, a, ox, oy) {
  cx += ox; cy += oy;
  g.fillCircle(cx + 0.5, cy + 0.5, 6.6, 0);
  g.circle(cx, cy, 5);
  const ux = Math.cos(a), uy = Math.sin(a);
  g.thickLine(cx + 0.5, cy + 0.5, cx + 0.5 + ux * 3.8, cy + 0.5 + uy * 3.8, 1.7);   // north: the heavy half
  g.line(Math.round(cx - ux * 1.2), Math.round(cy - uy * 1.2), Math.round(cx - ux * 3.4), Math.round(cy - uy * 3.4));
  g.pixel(cx, cy, 0);
}

/** The colon: a little bar magnet on a pivot, turning once a minute. */
function drawRotor(g, a, ox, oy) {
  const cx = ROTOR[0] + ox, cy = ROTOR[1] + oy, ux = Math.cos(a), uy = Math.sin(a);
  g.fillCircle(cx, cy, 6.4, 0);
  g.thickLine(cx, cy, cx + ux * 5, cy + uy * 5, 3.2);                  // north: solid
  g.thickLine(cx, cy, cx - ux * 5, cy - uy * 5, 3.2);                  // south: hollow
  g.thickLine(cx - ux * 1.5, cy - uy * 1.5, cx - ux * 3.6, cy - uy * 3.6, 1.1, 0);
  g.fillCircle(cx, cy, 1.1, 0);
}

/** The hour's big bar magnet, N up, sliding across. */
function drawBig(g, x, ox, oy) {
  const x0 = Math.round(x - 5) + ox, y0 = 4 + oy;
  g.fillRect(x0 - 1, y0 - 1, 12, 58, 0);
  g.fillRoundRect(x0, y0, 10, 28, 2);
  g.roundRect(x0, y0 + 28, 10, 28, 2);
  g.text('N', x0 + 4, y0 + 4, { font: font3x5, c: 0 });
  g.text('S', x0 + 4, y0 + 47, { font: font3x5 });
}
// ------------------------------------------------------------ the face

const DAY = 0xcf, NIGHT_C = 0x18;

export default {
  name: 'Magnet',
  blurb: 'Iron filings comb themselves along stencil digits cut from strip magnets; on the minute the magnets unzip, swarm and zip up as the new digit, and compasses swing; on the hour a big bar magnet sweeps the paper clean.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { fields: f, date, oled, night }) {
    const [ox, oy] = orbit(date, 2, 3);
    const late = f.sec >= 30;
    const from = late ? f : previousMinute(date);
    const to = late ? clockFields(new Date(date.getTime() + 60000)) : f;
    const tau = late ? f.sec - 60 : f.sec;
    const st = { A: `${from.hh}${from.mm}`, B: `${to.hh}${to.mm}`, hour: to.m === 0, key: to.minuteKey };
    const seedA = Math.floor(from.minuteKey / 60), seedB = Math.floor(to.minuteKey / 60);

    const ang = needles(st, tau);
    sources(st, tau);
    drawFilings(g.buf, st, tau, seedA, seedB, ox, oy);
    drawRotor(g, rotorAngle(tau), ox, oy);
    const [cx, cy] = orbit(new Date(date.getTime() + 5 * 60000), 1, 4);
    COMPASS.forEach(([x, y], c) => drawCompass(g, x, y, ang[c], cx, cy));
    if (st.hour && tau >= SWEEP0 && tau < SWEEP1 + 0.1) drawBig(g, bigX(tau), ox, oy);
    oled.contrast(DAY + (NIGHT_C - DAY) * night);
  },
};
