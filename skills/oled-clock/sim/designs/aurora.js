// Aurora — the time is written in the aurora borealis.
//
// Nothing on this face is a letterform drawn in ink: the sky is full of
// aurora — long curtains of light whose lower edge is sharp, whose light
// fades upward and which are raved by the vertical striations every curtain
// has — and the time is where the light thickens. Each numeral is a
// single-stroke hand carried as a curtain: the stroke is the curtain's
// bright lower edge, the light climbs from it, and the rays run up through
// it into the sky, so a digit is a set of glowing veils hanging in the air.
// The strokes flow rather than stand (the hand is drawn in smooth curves,
// a drooping 7, an open 4) because a curtain does not have corners.
//
// Behind them the sky is aurora too: a bright arc along the horizon whose
// lower edge waves and travels, a few faint veils standing at the edges of
// the frame, stars showing through the thin parts and hidden where the light
// is thick. Beneath it a black ridge with pines, and a snowfield that catches
// the glow of the sky above it — so the ground is lit by the same light the
// time is made of.
//
// The seconds are the surge: an auroral bulge that travels along the arc
// from the left edge to the right in one minute, brightening the curtains as
// it passes and pressing their lower border down, the snow brightening under
// it. Its leading edge on the glass is the second. The colon is two short
// vertical pillars of light between the hours and the minutes.
//
// The minute: the changed numeral's curtains let go. The stroke's light
// dims, the veil above it streams away upward and the stroke itself drifts
// on the wind to where the next numeral's stroke goes, while the new edge
// condenses out of the dark below it; then the curtain thickens and the rays
// settle. Surplus light drains away, new light is born with a flare.
//
// The hour: a substorm. From :58 the whole arc blazes and draws itself up
// into a corona — the rays stop running vertically and gather to a point
// overhead, the way an aurora does when it passes over you — the ground
// lights up, and the new hour's curtains hang themselves in the bright sky
// before it settles back to the arc.
//
// Everything luminous goes through one field and is developed against a
// noise pattern re-dealt each minute. Burn-in: the scene walks kit.orbit,
// the arc travels, the stars twinkle, and from 23:00 to 07:00 the panel dims.

import { orbit, clamp, ease, noise, smoothNoise, clockFields, previousMinute } from '../js/kit.js';

const W = 128, H = 64;
const TAU = Math.PI * 2;

// ------------------------------------------------------------ light field

const E = new Float32Array(W * H);     // the sky's own light, before the rays
const S = new Float32Array(W * H);     // the time's ink
const V = new Float32Array(W * H);     // the time's veils, after the climb

const TH = new Float32Array(128 * 64);
for (let y = 0; y < 64; y++)
  for (let x = 0; x < 128; x++)
    TH[(y << 7) | x] = (52.9829189 * ((0.06711056 * x + 0.00583715 * y) % 1)) % 1;

/** Add light in a small round kernel. */
function splat(x, y, I, sig = 1.7, R = 2) {
  if (I < 0.02) return;
  const x0 = Math.max(0, Math.floor(x - R)), x1 = Math.min(W - 1, Math.ceil(x + R));
  const y0 = Math.max(0, Math.floor(y - R)), y1 = Math.min(H - 1, Math.ceil(y + R));
  for (let py = y0; py <= y1; py++) {
    const dy = py + 0.5 - y, dy2 = dy * dy;
    for (let px = x0; px <= x1; px++) {
      const dx = px + 0.5 - x;
      E[py * W + px] += I * Math.exp(-(dx * dx + dy2) / sig);
    }
  }
}

// ------------------------------------------------------------ the letterforms
//
// A numeral is one flowing stroke (a list of runs of control points) in a
// 19 x 31 box, y down. The strokes are the curtains' lower edges.

const FIG = {
  0: { s: [[[9.5, 1], [15, 4], [17.2, 14], [15, 24], [9.5, 30.5], [4, 25], [1.8, 14], [3.5, 4], [9.5, 1]]] },
  1: { s: [[[2, 9.5], [6, 6], [9.6, 2.2], [9.6, 30.5]], [[4, 30.5], [15.5, 29.5]]] },
  2: { s: [[[1.8, 8], [4, 2.5], [10, 0.8], [15.5, 3.6], [16.5, 9.5], [12, 16], [5.5, 24], [2.2, 30], [17, 29.5]]] },
  3: { s: [[[2, 4], [7.5, 1], [14.5, 3], [15.5, 9], [10, 14], [6.5, 15.5], [10.5, 16], [15.5, 20.5], [15.5, 27], [9, 31], [2.5, 28.5]]] },
  4: { s: [[[12.5, 30.5], [12.5, 1.5], [1.8, 21.5], [17.5, 21]]] },
  5: { s: [[[15.5, 1.5], [4.5, 1.5], [3, 12.5], [8.5, 10.8], [14.5, 12.5], [17, 19.5], [14, 27], [8, 31], [1.8, 28]]] },
  6: { s: [[[14.5, 2.8], [9.5, 0.8], [4.5, 3.5], [2, 12], [2.5, 22], [6.5, 29.5], [12.5, 30.8], [16.5, 25.5], [14.5, 18.5], [9, 16.5], [3.5, 19.5]]] },
  7: { s: [[[1.8, 3.5], [3, 1.2], [17, 1.2], [12.5, 12], [9.5, 21.5], [7.5, 30.5]], [[5.5, 16.5], [14.5, 16]]] },
  8: { s: [[[4, 7.5], [9, 0.8], [15, 5], [9.5, 15.5], [16, 22], [11, 30.5], [3.5, 25.5], [9.5, 15.5]]] },
  9: { s: [[[15, 10.5], [11.5, 15], [6.5, 15.5], [2.5, 11.5], [3, 4.5], [8, 0.8], [14, 3], [16.5, 10], [15.5, 21], [11.5, 29], [5, 30.8]]] },
};

/** A figure as runs of control points, with each stroke's length. */
function buildFigure(d) {
  const runs = FIG[d].s.map((st) => st.map(([x, y]) => ({ x, y })));
  let n = 0;
  for (const r of runs) n += r.length;
  return { runs, n };
}
const FIGS = Array.from({ length: 10 }, (_, d) => buildFigure(d));

/** Centripetal-ish Catmull-Rom through `pts`, `n` samples per span. */
function spline(pts, n = 5) {
  if (pts.length < 3) return pts.map((p) => [p[0], p[1]]);
  const P = [pts[0], ...pts, pts.at(-1)];
  const out = [];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t
        + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2
        + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push([pts.at(-1)[0], pts.at(-1)[1]]);
  return out;
}

// ------------------------------------------------------------ layout

const GW = 19, GH = 31;
const SLOT_X = [6, 27, 72, 93];
const TOP = 6;
const COLON_X = [56, 61.5], COLON_Y = 21;

// ------------------------------------------------------------ the digit as a curtain

const PX = new Float32Array(16), PY = new Float32Array(16), PI = new Float32Array(16);

/**
 * The control points of slot `k` at event phase `tau`, morphed from the old
 * numeral to the new one and written into PX/PY with intensities in PI.
 */
function figureAt(k, fromD, toD, tau, T, off) {
  const A = FIGS[fromD], B = FIGS[toD];
  const n = Math.max(A.n, B.n);
  const cx = SLOT_X[k] + GW / 2, cy = TOP + GH / 2;
  const dt = 0.07, dur = 0.62, t0 = -1.10;
  // flatten both figures into one path order
  let q = 0;
  const ai = [], bi = [];
  for (const r of A.runs) for (const p of r) ai.push({ ...p, i: q++ });
  q = 0;
  for (const r of B.runs) for (const p of r) bi.push({ ...p, i: q++ });
  for (let j = 0; j < n; j++) {
    const a = ai[j], b = bi[j];
    const u = ease.inOutCubic(clamp((tau - t0 - j * dt) / dur, 0, 1));
    let x0, y0, x1, y1;
    if (a) { x0 = a.x + SLOT_X[k] + off[0]; y0 = a.y + TOP + off[1]; }
    else { x0 = cx + off[0] + (noise(j, k * 7 + 3) - 0.5) * 70; y0 = cy + off[1] + (noise(j, k * 7 + 4) - 0.5) * 40; }
    if (b) { x1 = b.x + SLOT_X[k] + off[0]; y1 = b.y + TOP + off[1]; }
    else { x1 = cx + off[0] + (noise(j, k * 7 + 5) - 0.5) * 50; y1 = cy + off[1] - 10 + noise(j, k * 7 + 6) * 20; }
    // a curtain drifts rather than flies: a shallow arc, highest in the middle
    const bow = (noise(j, k * 5 + 9) - 0.5) * 0.35;
    const mx = (x0 + x1) / 2 - (y1 - y0) * bow, my = (y0 + y1) / 2 + (x1 - x0) * bow - 5;
    const w = 1 - u, e = u;
    PX[j] = w * w * x0 + 2 * w * e * mx + e * e * x1;
    PY[j] = w * w * y0 + 2 * w * e * my + e * e * y1;
    let I = b ? 1 : 0;
    if (a && b) {
      I = 1 - 0.55 * Math.sin(Math.PI * u);                    // the veil thins in flight
      I += 0.55 * Math.exp(-Math.max(0, tau - (t0 + j * dt + dur)) / 0.30);   // and blooms as it lands
    } else if (!a && b) {
      I = clamp((tau - t0 - j * dt) / 0.3, 0, 1) * (1 + 1.4 * Math.exp(-Math.max(0, tau - t0 - j * dt) / 0.25));
    } else I = 1 - u;                                          // the doomed stroke drains
    PI[j] = I;
  }
  return n;
}

/**
 * The stroke runs of the morphed figure. The control points arrive in path
 * order in PX/PY, so the new figure's runs are the first B.n of them; points
 * the new figure has no place for trail off as one last strand.
 */
const RUNS = [];
function figureInk(fromD, toD) {
  const A = FIGS[fromD], B = FIGS[toD];
  RUNS.length = 0;
  let j = 0;
  for (const r of B.runs) {
    const run = [];
    for (let i = 0; i < r.length; i++) run.push([PX[j], PY[j], PI[j]]), j++;
    RUNS.push(run);
  }
  if (A.n > B.n) {
    const run = [];
    for (; j < A.n; j++) run.push([PX[j], PY[j], PI[j]]);
    RUNS.push(run);
  }
  return RUNS;
}

/** The smoothed centre-line of a run, still carrying its intensity. */
function smoothRun(run) {
  const pts = run.map((p) => [p[0], p[1]]);
  const sm = spline(pts, 6);
  // intensity along the run: interpolate by index
  return sm.map((p, i) => {
    const t = (i / (sm.length - 1 || 1)) * (run.length - 1);
    const a = run[Math.floor(t)], b = run[Math.min(run.length - 1, Math.ceil(t))];
    return [p[0], p[1], a[2] + (b[2] - a[2]) * (t - Math.floor(t))];
  });
}

// ------------------------------------------------------------ the sky's own aurora

/** The profile of a curtain: a sharp lower edge, light fading upward. */
const PROF = new Float32Array(72);
for (let d = 0; d < 72; d++) PROF[d] = 0.22 * Math.exp(-d / 18) + 1.30 * Math.exp(-((d / 2.6) ** 2));
/** The same, for a fainter, higher veil. */
const PROF2 = new Float32Array(72);
for (let d = 0; d < 72; d++) PROF2[d] = 0.17 * Math.exp(-d / 16) + 0.50 * Math.exp(-((d / 3.6) ** 2));

/**
 * The sky's own curtains: a handful of veils standing across the frame, each
 * a band in x with its own lower edge and brightness, so the sky has the
 * structure of an aurora — light, gap, light — rather than an even fog.
 */
const CUR = [{ cx: 64, w: 260, y0: 0, amp: 0.80, ph: 0.4, drift: 0, thin: false, horizon: true }];
for (let i = 0; i < 4; i++) {
  CUR.push({
    cx: [10, 34, 116, 132][i] + (noise(i, 41) - 0.5) * 14,
    w: 14 + noise(i, 42) * 16,
    y0: 30 + noise(i, 43) * 18,
    amp: 0.20 + noise(i, 44) * 0.26,
    ph: noise(i, 45) * TAU,
    drift: (noise(i, 46) - 0.5) * 8,
    thin: noise(i, 47) < 0.5,
  });
}

// ------------------------------------------------------------ the scene

/** The ridge line: a jagged silhouette across the bottom third. */
const RIDGE = new Int16Array(W);
for (let x = 0; x < W; x++) {
  const t = x / W;
  RIDGE[x] = Math.round(53 + 5.4 * Math.sin(t * 7.1 + 1.2) + 3.0 * Math.sin(t * 17.3) + 1.4 * Math.sin(t * 39));
}
/** Two pines: hand-drawn silhouettes standing on the ridge. */
const PINES = [];
for (const [px, h] of [[1, 12], [5, 8], [116, 15], [121, 11], [126, 8]]) {
  const base = RIDGE[px] + 1, pts = [[px - 0.5, base], [px, base - h]];
  PINES.push({ px, base, h });
}

/** Stars behind the aurora. */
const SKY = [];
for (let i = 0; i < 120; i++) {
  SKY.push({
    x: 2 + noise(i, 11) * 124, y: 1 + noise(i, 12) * 40,
    m: 0.25 + noise(i, 13) ** 1.8 * 0.75,
    p: noise(i, 14) * TAU, f: 1.5 + noise(i, 15) * 2.4,
  });
}

// ------------------------------------------------------------ the frame

export default {
  name: 'Aurora',
  blurb: 'The aurora borealis over a black ridge: the numerals are curtains of light whose raved veils hang in the sky, the seconds are a surge travelling the arc, the minutes re-hang the changed veil and the hour draws the whole sky up into a corona.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, ctx) {
    const { date, fields: f, oled, night } = ctx;
    const T = date.getTime() / 1000;
    const ms = date.getTime();
    const [ox, oy] = orbit(date, 3, 3);
    const off = [ox, oy];

    // -------------------------------------------------- phase
    const sec = f.sec;
    let tau = null, oldF = f, newF = f;
    if (sec >= 56) { tau = sec - 60; oldF = f; newF = clockFields(new Date(ms + 60000)); }
    else if (sec < 5) { tau = sec; oldF = previousMinute(date); newF = f; }
    const hour = newF.m === 0 && tau !== null;
    // substorm: the arc blazes and draws itself into a corona
    const sub = hour ? clamp((tau + 2.4) / 1.9, 0, 1) * clamp((2.4 - tau) / 1.9, 0, 1) : 0;

    // -------------------------------------------------- the surge (seconds)
    const sx = (sec / 60) * 168 - 20;
    const surgeAt = (x) => Math.exp(-(((x - sx) / 22) ** 2));

    E.fill(0);
    S.fill(0);

    // -------------------------------------------------- the sky's own curtains
    const ACT = [];
    for (let x = 0; x < W; x++) {
      const sg = surgeAt(x);
      let kk = 0, y1 = 0;
      for (const c of CUR) {
        const cx = c.cx + c.drift * Math.sin(T * 0.045 + c.ph) - sub * 8;
        const win = Math.exp(-(((x - cx) / c.w) ** 2));
        if (win < 0.035) continue;
        const edge = (c.horizon ? RIDGE[x] - 1 : c.y0)
          + 3.4 * Math.sin(x * 0.05 + T * 0.30 + c.ph)
          + 1.5 * Math.sin(x * 0.13 - T * 0.55 + c.ph * 2)
          - 6 * sg * win - sub * 9;
        ACT[kk++] = { edge, amp: c.amp * win * (1 + 0.9 * sg) * (1 + 1.1 * sub), prof: c.thin ? PROF2 : PROF };
        if (edge > y1) y1 = edge;
      }
      const lim = Math.min(H - 1, Math.ceil(y1));
      for (let y = 0; y <= lim; y++) {
        let v = 0;
        for (let a = 0; a < kk; a++) {
          const A = ACT[a], d = A.edge - y;
          if (d < 0) continue;
          const q = A.prof[Math.min(71, d | 0)] * A.amp;
          if (q > v) v = q;
        }
        if (v > 0.02) E[y * W + x] = v;
      }
    }

    // -------------------------------------------------- the time's curtains
    const was = `${oldF.hh}${oldF.mm}`, now = `${newF.hh}${newF.mm}`;
    const t = tau === null ? 0 : tau;
    for (let k = 0; k < 4; k++) {
      const n = figureAt(k, +was[k], +now[k], t, T, off);
      const runs = figureInk(+was[k], +now[k]);
      for (const run of runs) {
        const pts = smoothRun(run);
        for (let i = 0; i < pts.length; i++) {
          const [x, y, I] = pts[i];
          if (I <= 0.03) continue;
          // the flicker every curtain has, and a slow breathing
          const fl = 0.80 + 0.26 * smoothNoise(T * (3.2 + 2.4 * noise(k * 3 + i, 3)) + i * 0.7, 9)
            + 0.10 * smoothNoise(T * 9 + i, 4);
          splat(x + ox, y + oy, I * fl * 2.5, 1.45, 2);
        }
      }
    }

    // the colon: two short pillars of light
    for (let c = 0; c < 2; c++) {
      const px = COLON_X[c] + ox + 0.7 * Math.sin(T * 0.7 + c * 2.1);
      const hh = 7.5 + 1.4 * Math.sin(T * 1.3 + c * 1.7) + 1.6 * surgeAt(px);
      for (let y = COLON_Y - hh; y <= COLON_Y + hh; y++) {
        const q = 1 - Math.abs(y - COLON_Y) / (hh + 1.5);
        const iy = Math.round(y + oy);
        if (iy < 0 || iy >= H) continue;
        for (let d = 0; d <= 1; d++) {
          const ix = Math.round(px) + d;
          if (ix < 0 || ix >= W) continue;
          S[iy * W + ix] = Math.max(S[iy * W + ix], 1.5 * q * q);
        }
      }
    }

    // -------------------------------------------------- the veils: every stroke's
    // light climbs from it into the sky. While a numeral is re-hanging its
    // light streams: the veil stretches up and thins as it goes.
    const stretch = tau === null ? 0 : ease.inOutCubic(clamp((tau + 1.1) / 0.8, 0, 1)) * (1 - ease.outCubic(clamp((tau - 0.5) / 0.8, 0, 1)));
    const decay = 0.82 + 0.11 * stretch;
    V.fill(0);
    for (let x = 0; x < W; x++) {
      let cur = 0;
      for (let y = H - 1; y >= 0; y--) {
        const i = y * W + x;
        cur = S[i] + cur * decay;
        if (cur > 0.004) V[i] = cur;
      }
    }

    // -------------------------------------------------- the ground
    // The snow catches the sky's glow: it is lit in proportion to the light
    // standing over it, and the pines are black against it.
    const SNOW = new Float32Array(W), BLUR = new Float32Array(W);
    let best = 1;
    for (let x = 0; x < W; x++) {
      const top = RIDGE[x] + oy;
      let s = 0;
      for (let y = 0; y < Math.min(H, top); y++) s += Math.min(1.6, E[y * W + x] + 0.7 * V[y * W + x]);
      SNOW[x] = s;
      best = Math.max(best, s);
    }
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let d = -10; d <= 10; d++) s += SNOW[Math.min(W - 1, Math.max(0, x + d))] * (1 - Math.abs(d) / 11);
      BLUR[x] = s;
    }
    let bb = 1;
    for (let x = 0; x < W; x++) bb = Math.max(bb, BLUR[x]);
    for (let x = 0; x < W; x++) {
      const lvl = (BLUR[x] / bb) ** 1.1 * (0.72 + 0.30 * sub);
      const top = Math.max(0, RIDGE[x] + oy);
      for (let y = top; y < H; y++) {
        const u = (y - top) / (H - top);
        E[y * W + x] = lvl * (0.10 + 0.90 * Math.exp(-u * 5.5));
      }
    }

    // -------------------------------------------------- the ridge and pines
    // The ground's near edge is black; a few pines stand up out of it.
    for (let x = 0; x < W; x++) {
      const top = Math.max(0, RIDGE[x] + oy);
      for (let y = top; y < top + 2 && y < H; y++) E[y * W + x] = 0;
    }
    for (const p of PINES) {
      const px = p.px + ox, base = p.base + oy;
      for (let i = 0; i <= p.h; i++) {
        const y = base - i, w = 0.4 + (i / p.h) * 3.4;
        for (let d = -w; d <= w; d++) {
          const xx = Math.round(px + d);
          if (xx >= 0 && xx < W && y >= 0 && y < H) E[y * W + xx] = 0;
        }
      }
    }

    // -------------------------------------------------- rays and the corona
    // The vertical striations every curtain has; on the hour they gather to a
    // point overhead, the way an aurora does when it passes over you.
    const zx = 64 + ox, zy = -8 + oy;
    const corona = sub;
    const nx = (f.minuteKey * 7) & 127, ny = (f.minuteKey * 13) & 63;
    // the ray phase and the corona's wobble are per column: computing them
    // once instead of once per pixel is most of this frame's cost
    const PH = new Float32Array(W);
    for (let x = 0; x < W; x++)
      PH[x] = x * 0.95 + 2.6 * smoothNoise(x * 0.048 + T * 0.17, 31) + 0.4 * smoothNoise(x * 0.12 + T * 0.5, 34);
    for (let y = 0; y < H; y++) {
      const tr = (y + ny) & 63;
      const sway = Math.sin(y * 0.055 + T * 0.75) * 0.55;
      for (let x = 0; x < W; x++) {
        const ea = E[y * W + x], ev = V[y * W + x];
        if (ea + ev < 0.045) continue;
        let ray = 0.56 + 0.62 * (0.5 + 0.5 * Math.sin(PH[x] + sway));
        if (corona > 0.02) {
          const ang = Math.atan2(y - zy, x - zx) * 15 + PH[x] * 0.5;
          ray += corona * (0.40 + 1.05 * (0.5 + 0.5 * Math.sin(ang)) - ray);
        }
        // the sky is raved through; the time's own veils keep more of their
        // body, so a stroke still reads as a stroke
        const e = ea * ray + ev * (0.62 + 0.38 * ray);
        if (e > 0.05 + 0.95 * TH[(tr << 7) | ((x + nx) & 127)]) g.pixel(x, y, 1);
      }
    }

    // -------------------------------------------------- stars, behind the aurora
    for (const s of SKY) {
      const x = Math.round(s.x + ox), y = Math.round(s.y + oy);
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      const e = E[y * W + x];
      const tw = 0.7 + 0.5 * smoothNoise(T * s.f * 0.7 + s.p * 9, 5);
      const m = s.m * tw * (1 - clamp(e * 0.7, 0, 0.95));
      if (m < 0.22) continue;
      g.pixel(x, y, 1);
      if (m > 0.7) { g.pixel(x - 1, y, 1); g.pixel(x + 1, y, 1); g.pixel(x, y - 1, 1); g.pixel(x, y + 1, 1); }
    }

    oled.contrast(0xc6 + (0x1a - 0xc6) * night + 0x22 * sub);
  },
};
