// Flow — the whole glass is one living vector field.
//
// The field is curl noise in its cleanest form: the velocity is the curl of a
// stream function built from plane waves, so it has no divergence — nothing is
// created or lost — and the streamlines curl into real eddies. The pattern
// slides across the glass at a few pixels a second while the heading of the
// current turns full circle about once a minute, and every wave drifts a little
// relative to the others, so the eddies fold, braid and re-form instead of
// repeating. The result is ink in water: silky line-work that advects forever.
//
// The picture is drawn by integrating streamlines from seeds scattered on a
// jittered grid. Each seed is followed both ways along the flow (RK2, a fixed
// arc length per step, the direction re-normalised so the samples stay even)
// into a polyline. A line runs long where the water is fast and shrinks to a
// stub, or to nothing, where it idles, and the fastest currents are stroked a
// second time one pixel off the line: so the brisk water reads as bold bright
// ribbons and the slack as black pools — the tone is carried by the flow
// itself, not laid on as a flat dither. A slow travelling set of gaps runs
// downstream along each line, so the ink is visibly carried, not just slid.
//
// The vigour of the whole field breathes as the waves slide past one another,
// so the lengths are measured relative to the field's own mean speed this
// instant; the glass then keeps the same texture however the energy drifts.
//
// Everything is computed from ctx.t and nothing else: any instant renders on
// its own, and the same t always gives the same frame. Nothing is remembered
// between frames — the field is a pure function of (x, y, t).
//
// Burn-in: no pixel can stay lit, because the pattern under it never stops
// moving and re-forming.

const W = 128, H = 64, TAU = Math.PI * 2;

/** Integer hash, as a float in [0, 1). */
function hash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);

// ------------------------------------------------------------ the field
//
// Stream function psi = sum A_i sin(k_i . x + phi_i).  Velocity = curl psi:
// (u, v) = (d psi/dy, -d psi/dx), which is divergence-free by construction,
// whatever wavelengths, directions, amplitudes and phases the waves carry.
// Each wave has its own, and they are carried along together by the drift.

const SPEC = [
  // wavelength px, direction rad, amplitude, own phase speed px/s
  [152, 0.34, 1.20, 0.26],
  [97, 2.05, 1.00, -0.22],
  [121, 3.72, 0.95, 0.18],
  [52, 5.15, 0.60, -0.40],
  [36, 0.95, 0.52, 0.50],
  [43, 2.72, 0.50, -0.34],
  [28, 4.30, 0.40, 0.44],
];
const NW = SPEC.length;
const KX = new Float64Array(NW), KY = new Float64Array(NW);
const UA = new Float64Array(NW), VA = new Float64Array(NW);
const KL = new Float64Array(NW);
const MOR = new Float64Array(NW), PH0 = new Float64Array(NW), PH = new Float64Array(NW);
SPEC.forEach(([lam, d, a, m], i) => {
  const k = TAU / lam, cd = Math.cos(d), sd = Math.sin(d);
  KX[i] = k * cd; KY[i] = k * sd; KL[i] = k; MOR[i] = m;
  UA[i] = a * sd; VA[i] = -a * cd;
  PH0[i] = hash(i, 7, 3) * TAU;
});

// The pattern is carried along by a current whose heading turns: two circular
// drifts of different radii and periods, so the flow swings round like wind
// over water and, because the periods do not divide, never returns to the same
// place — which also keeps any one pixel from being covered too persistently.
const DRIFTS = [
  [48.9, TAU / 64, 0.0],    // the current circling once a minute
  [15, TAU / 239, 2.1],     // a small extra sway, so nothing repeats
];
function setPhase(T) {
  let dx = 0, dy = 0;
  for (let d = 0; d < DRIFTS.length; d++) {
    const a = DRIFTS[d][1] * T + DRIFTS[d][2];
    dx += DRIFTS[d][0] * Math.sin(a);
    dy -= DRIFTS[d][0] * Math.cos(a);
  }
  for (let i = 0; i < NW; i++)
    PH[i] = (PH0[i] + KL[i] * MOR[i] * T - (KX[i] * dx + KY[i] * dy)) % TAU;
}

const FV = [0, 0];
function field(x, y, out) {
  let u = 0, v = 0;
  for (let i = 0; i < NW; i++) {
    const c = Math.cos(KX[i] * x + KY[i] * y + PH[i]);
    u += UA[i] * c; v += VA[i] * c;
  }
  out[0] = u; out[1] = v;
  return out;
}

// ------------------------------------------------------------ the streamlines

const STEP = 1.8;            // px advanced per integration step
const KMAX = 25;             // in the fastest water: this many steps each way
const KMIN = 2;              // in the slackest: a short stub
// Speed thresholds, as fractions of the field's own mean speed this instant.
const SPD_LO = 0.50, SPD_HI = 1.70;   // map to KMIN..KMAX
const SKIP_F = 0.46;                  // slower than this: draw nothing
const DASH_K = 0.145, DASH_W = 2.1;    // gaps running downstream along each line

/** A jittered grid of seeds — scattered, but not clumped. */
const SEEDS = [];
const GX = 10, GY = 6;
for (let j = 0; j < GY; j++)
  for (let i = 0; i < GX; i++) {
    const x = (i + 0.5 + 0.86 * (hash(i, j, 11) - 0.5)) * (W / GX);
    const y = (j + 0.5 + 0.86 * (hash(i, j, 12) - 0.5)) * (H / GY);
    SEEDS.push([x, y]);
  }

/**
 * Follow the flow from (x0, y0) for K steps of length STEP, `dir` = +1 along
 * the field or -1 against it (RK2 with the direction re-normalised each step,
 * so the samples are even along the curve however the speed varies). Returns
 * parallel arrays of position and of the local speed |v|.
 */
function trace(x0, y0, K, dir, px, py, sp) {
  px.push(x0); py.push(y0); sp.push(0);
  let x = x0, y = y0;
  for (let k = 0; k < K; k++) {
    field(x, y, FV);
    let m = Math.sqrt(FV[0] * FV[0] + FV[1] * FV[1]);
    if (m < 1e-6) break;
    let ax = FV[0] / m, ay = FV[1] / m;
    const mx = x + 0.5 * STEP * dir * ax, my = y + 0.5 * STEP * dir * ay;
    field(mx, my, FV);
    m = Math.sqrt(FV[0] * FV[0] + FV[1] * FV[1]);
    if (m < 1e-6) break;
    ax = FV[0] / m; ay = FV[1] / m;
    x += STEP * dir * ax; y += STEP * dir * ay;
    px.push(x); py.push(y); sp.push(m);
    if (x < -8 || x > W + 8 || y < -8 || y > H + 8) break;
  }
}

const BX = [], BY = [], BS = [], FX = [], FY = [], FS = [];
const PX = [], PY = [], PS = [];

export default {
  name: 'Flow',
  blurb: 'A divergence-free curl-noise field: streamlines of ink that advect, braid and re-form forever.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { t }) {
    setPhase(t);
    // The vigour of the whole field drifts as the waves slide past one
    // another; measure it this instant and draw relative to it, so the glass
    // keeps the same texture while the flow's energy breathes.
    let sum = 0;
    for (let s = 0; s < SEEDS.length; s++) {
      field(SEEDS[s][0], SEEDS[s][1], FV);
      sum += Math.sqrt(FV[0] * FV[0] + FV[1] * FV[1]);
    }
    const avg = sum / SEEDS.length;
    const s0 = avg * SPD_LO, s1 = avg * SPD_HI, skip = avg * SKIP_F;

    for (let s = 0; s < SEEDS.length; s++) {
      const sx = SEEDS[s][0], sy = SEEDS[s][1];
      field(sx, sy, FV);
      const spd0 = Math.sqrt(FV[0] * FV[0] + FV[1] * FV[1]);
      if (spd0 < skip) continue;   // slack water: leave it black
      const K = Math.round(KMIN + (KMAX - KMIN) * clamp01((spd0 - s0) / (s1 - s0)));
      BX.length = BY.length = BS.length = FX.length = FY.length = FS.length = 0;
      trace(sx, sy, K, -1, BX, BY, BS);
      trace(sx, sy, K, 1, FX, FY, FS);

      // Walk the whole streamline: the backward half in reverse (from its far
      // end in to the seed), then the forward half out. `center` is the seed.
      const nb = BX.length;
      PX.length = PY.length = PS.length = 0;
      for (let i = nb - 1; i >= 1; i--) { PX.push(BX[i]); PY.push(BY[i]); PS.push(BS[i]); }
      for (let i = 0; i < FX.length; i++) { PX.push(FX[i]); PY.push(FY[i]); PS.push(FS[i]); }
      const center = nb - 1, nSeg = PX.length - 1;
      const dph = s * 2.399 - DASH_W * t;
      for (let i = 0; i < nSeg; i++) {
        const d = i - center;
        const ad = d < 0 ? -d : d;
        if (ad > K - 1) continue;
        // Gaps run downstream along the line, so the ink is visibly carried
        // by the current rather than only sliding with the pattern.
        if (Math.sin(d * DASH_K + dph) < -0.86) continue;
        const vs = clamp01((PS[i] - s0) / (s1 - s0));
        const x0 = PX[i], y0 = PY[i], x1 = PX[i + 1], y1 = PY[i + 1];
        // The fast currents are drawn bold: a second pass one pixel off the
        // line, so they carry weight against the hairlines of the slack water.
        if (vs > 0.78) {
          if ((x1 - x0) * (x1 - x0) >= (y1 - y0) * (y1 - y0)) g.line(x0, y0 + 1, x1, y1 + 1);
          else g.line(x0 + 1, y0, x1 + 1, y1);
        }
        g.line(x0, y0, x1, y1);
      }
    }
  },
};
