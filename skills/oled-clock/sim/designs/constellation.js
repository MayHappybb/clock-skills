// Constellation — the time is a constellation on a star chart.
//
// Nothing here is a font: each digit is a small figure of stars, joined by
// sight-lines the way a chart joins the stars of a constellation. The stars
// are plotted first and the lines drawn between them, so the shapes are the
// sky's own material — an irregular ring of eight stars for 0, a bent run of
// six and a crossbar for 7, a figure-eight of two loops for 8. They lie on a
// shallow diagonal across the middle of the plate, not in a row: a chart, not
// a display.
//
// Behind them is the plate: a Milky Way drawn as a settled drift of grains
// along a diagonal band with a rift through it, and a sky of stars. Every
// star turns about the pole star in the top-left corner, one revolution in
// twenty minutes — slow enough to read as the sky turning, fast enough that
// every point on the glass is moving every second, and each star
// scintillates on its own phase, which is what keeps the field alive between
// events. A faint dotted circle round the pole is the circumpolar ring: the
// stars inside it never set. Everything luminous — figure, stars, haze,
// satellite, label — is summed into one light field and thresholded against
// a noise pattern re-dealt each minute, so a star glows with a dithered halo
// and its motion is sub-pixel.
//
// The seconds are a satellite: one bright star arcing over the top of the
// sky, entering and leaving the frame inside the minute, a fading train
// behind it, flaring as it passes the middle — a moving star whose place on
// its arc is the second. The colon is a binary: two close stars swinging
// about their common centre on a long ellipse, always two dots, marking the
// hours off from the minutes.
//
// The minute: from :58.95 the changed figure's stars leave their places and
// fly — each on its own eased arc, one after another in drawing order — to
// the new digit's stars. The same dots are re-lined, so the old constellation
// becomes the new one in the air; the sight-lines thin to faint threads for
// the flight, and as the last star arrives they ink back on, segment by
// segment, in the order a chart draws a figure. A star the new figure has
// spare is born with a flare; one it has no place for dims away.
//
// The hour: from :57.3 the chart is exposed — the sky's turning runs away,
// comes round a whole turn by :59.4 and is still again, the brighter stars
// drawing their long-exposure arcs round the pole, the pole star blazing at
// the peak and the whole panel brightening; then the time re-lines itself on
// a still sky and the plate settles.
//
// Burn-in: everything walks kit.orbit, the haze drifts, the threshold noise
// is re-dealt every minute, the date moves to the other end of the bottom
// edge every five minutes, and from 23:00 to 07:00 the panel dims.

import { orbit, clamp, ease, noise, smoothNoise, clockFields, previousMinute } from '../js/kit.js';

const W = 128, H = 64;
const TAU = Math.PI * 2;
const POLE = [16, 12];
const SKY_REV = 1200;          // seconds for one revolution of the sky

// ------------------------------------------------------------ light field
//
// Everything luminous is summed here, then thresholded against a noise
// pattern that is fixed within the minute. A tight kernel gives a crisp core
// with a dithered fringe, so a star is round and its faint halo is grain;
// chains of them make an anti-aliased sight-line that stays smooth when it
// moves.

const E = new Float32Array(W * H);

// The threshold the light field is developed against: one interleaved
// gradient noise pattern, tabulated once (128 x 64, so the seam falls on the
// frame's edge) and indexed with a per-minute offset, which costs a lookup
// where the arithmetic cost two divisions per pixel.
const TH = new Float32Array(128 * 64);
for (let y = 0; y < 64; y++)
  for (let x = 0; x < 128; x++)
    TH[(y << 7) | x] = (52.9829189 * ((0.06711056 * x + 0.00583715 * y) % 1)) % 1;

function splat(x, y, I, sig = 1.9, R = 2) {
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

/** A chain of splats from a to b: a hairline, `I` at every step. */
function thread(ax, ay, bx, by, I, step = 0.8, sig = 1.6) {
  const d = Math.hypot(bx - ax, by - ay);
  const n = Math.max(1, Math.ceil(d / step));
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    splat(ax + (bx - ax) * u, ay + (by - ay) * u, I, sig, 2);
  }
}

// ------------------------------------------------------------ the figures
//
// Each digit is a figure in a 20 x 30 box (y down). A figure is a list of
// strokes; a stroke is a run of stars, each with a magnitude (0..1). 'closed'
// joins the last star back to the first. Straight sight-lines between them,
// as a chart draws them.

const FIG = {
  0: { s: [[[4, 3, .45], [11, 1, .8], [17, 5, .5], [18, 14, .4], [14, 25, .65], [6, 29, .9], [2, 20, .35], [1, 9, .5]]], closed: [1] },
  1: { s: [[[3, 8, .5], [7, 4, .7], [10, 1, .9], [13, 7, .6], [13, 29, .85]], [[4, 29, .4], [17, 27, .45]]] },
  2: { s: [[[2, 6, .6], [5, 1, .85], [12, 1, .55], [17, 5, .75], [16, 11, .45], [11, 17, .4], [5, 24, .5], [2, 29, .8], [18, 28, .5]]] },
  3: { s: [[[2, 4, .6], [8, 1, .85], [15, 3, .55], [16, 9, .45], [11, 14, .7], [7, 16, .35], [13, 17, .6], [17, 22, .5], [15, 28, .7], [8, 30, .85], [1, 27, .45]]] },
  4: { s: [[[13, 29, .85], [13, 4, .9], [2, 21, .55], [18, 21, .6]]] },
  5: { s: [[[16, 2, .7], [5, 1, .6], [4, 13, .45], [10, 11, .85], [16, 13, .45], [18, 20, .4], [14, 26, .55], [7, 29, .85], [1, 25, .5]]] },
  6: { s: [[[14, 3, .6], [8, 1, .8], [3, 5, .55], [1, 14, .4], [2, 23, .55], [6, 29, .7], [13, 29, .9], [18, 24, .55], [14, 18, .7], [8, 17, .45], [2, 20, .4]]] },
  7: { s: [[[2, 3, .55], [5, 1, .85], [18, 2, .6], [13, 11, .45], [9, 21, .5], [7, 29, .8]], [[6, 15, .4], [14, 15, .5]]] },
  8: { s: [[[3, 8, .55], [9, 1, .85], [16, 6, .55], [10, 15, .9], [17, 21, .5], [11, 29, .8], [4, 24, .45], [10, 15, .9]]] },
  9: { s: [[[15, 3, .8], [17, 8, .5], [13, 13, .65], [7, 14, .45], [2, 11, .35], [3, 4, .6], [9, 1, .8]], [[16, 7, .5], [16, 17, .45], [12, 25, .6], [5, 29, .85]]] },
};

/** A figure flattened to a path: every star in drawing order, with its length along the path. */
function buildFigure(d) {
  const pts = [];
  const segs = [];
  let len = 0;
  for (let k = 0; k < FIG[d].s.length; k++) {
    const st = FIG[d].s[k];
    const first = pts.length;
    for (const [x, y, m] of st) pts.push({ x, y, m, phase: noise(pts.length * 3.7 + d * 11, 7) });
    for (let i = 0; i < st.length - 1; i++) segs.push([first + i, first + i + 1]);
    if (FIG[d].closed && FIG[d].closed.includes(k)) segs.push([first + st.length - 1, first]);
  }
  // length along the path, for drawing the figure on in order
  segs.forEach(([a, b]) => {
    const l = Math.hypot(pts[b].x - pts[a].x, pts[b].y - pts[a].y);
    pts[a].at = len; len += l; pts[b].at = len;
  });
  const total = len || 1;
  for (const p of pts) p.t = p.at / total;
  // the star's own arrival order (0..1) in the drawing sequence
  const order = pts.map((p, i) => [p.at, i]).sort((a, b) => a[0] - b[0]);
  order.forEach(([, i], q) => { pts[i].order = q / Math.max(1, pts.length - 1); });
  return { pts, segs, n: pts.length };
}
const FIGS = Array.from({ length: 10 }, (_, d) => buildFigure(d));

// ------------------------------------------------------------ layout

const GW = 20, GH = 30;
const SLOT_X = [6, 28, 70, 92];
const TOP = 17;
const COLON = [59, 32];
/** The slots sit on a shallow diagonal, hours low left, minutes high right. */
const slotY = (cx) => TOP - (cx - 59) * 0.05;

// ------------------------------------------------------------ the sky

/** Background stars, in polar coordinates about the pole. */
const SKY = [];
for (let i = 0; i < 260; i++) {
  const q = noise(i, 21);
  const m = q < 0.88 ? 0.22 + q * 0.18 : (q - 0.88) * 5.6;    // mostly single points, a few brighter
  SKY.push({
    r: 5 + noise(i, 23) ** 0.66 * 126,
    a: noise(i, 24) * TAU,
    m,
    p: noise(i, 25) * TAU,                                // scintillation phase
    f: 1.6 + noise(i, 26) * 2.6,                          // scintillation rate
  });
}

/**
 * The Milky Way: a band of clouds across the plate, in plate coordinates
 * (it drifts, it does not turn with the point stars — it is the chart's
 * haze). The band runs from the lower left to the upper right; a rift is
 * cut through its middle by thinning a strip of it.
 */
const CLOUDS = [];
for (let i = 0; i < 440; i++) {
  const u = noise(i, 31);
  const x = -24 + u * 176;
  const x0 = x / 1.3;
  const y = 70 - x * 0.40 + (noise(i, 32) - 0.5) * 26 * (0.4 + smoothNoise(x0 * 0.06, 38));
  const d = Math.abs(y - (70 - x * 0.40));
  const clump = smoothNoise(x0 * 0.09 + noise(i, 33) * 0.5, 34);
  const rift = Math.abs(noise(i, 35) - 0.5) < 0.12 ? 0.15 : 1;
  CLOUDS.push({
    x, y, r: 0.85,
    i: (0.5 + 0.85 * clump * clump) * rift * Math.exp(-((d / 10) ** 2)),
  });
}

// ------------------------------------------------------------ star drawing

/**
 * A star of magnitude `m` at (x, y): a compact dot for a faint one, and for
 * a bright one the same dot with a four-point flare and, at the top of the
 * scale, a wide haze — magnitude is size, as it is on a chart. `tw` is the
 * scintillation multiplying it.
 */
function star(x, y, m, tw = 1) {
  const M = m * tw;
  if (M <= 0.02) return;
  if (M < 0.40) { splat(x, y, 1.55, 1.05, 1); return; }        // one point of light
  if (M < 0.60) { splat(x, y, 1.5, 1.45, 2); return; }         // a small round dot
  splat(x, y, 0.6 + 2.4 * M, 1.5, 2);                          // a disc, and a flare
  const f = 0.2 + 0.6 * M;
  splat(x - 2, y, f, 1.2, 1); splat(x + 2, y, f, 1.2, 1);
  splat(x, y - 2, f, 1.2, 1); splat(x, y + 2, f, 1.2, 1);
  if (M > 0.9) splat(x, y, 0.16 * M, 7, 3);
}

// ------------------------------------------------------------ the plate

const MASK = [];   // rectangles kept clear of the haze
for (let k = 0; k < 4; k++) {
  const cx = SLOT_X[k] + GW / 2;
  MASK.push([SLOT_X[k] - 2, slotY(cx) - 2, GW + 4, GH + 4]);
}
MASK.push([COLON[0] - 9, COLON[1] - 11, 18, 22]);
// The date sits at one end of the bottom edge or the other; it changes end
// every five minutes, so neither corner's glass carries it all day.
const LABEL_Y = 55, LABEL_W = 30;
MASK.push([2, LABEL_Y, LABEL_W + 2, 8], [W - LABEL_W - 4, LABEL_Y, LABEL_W + 2, 8]);
const labelX = (date) => (Math.floor((date.getTime() - 30000) / 300000) % 2 ? W - LABEL_W - 2 : 3);

function hazeAt(x, y) {
  for (const [mx, my, mw, mh] of MASK) if (x >= mx && x < mx + mw && y >= my && y < my + mh) return 0.12;
  return 1;
}

// ------------------------------------------------------------ the date, in star-letters
//
// The chart's annotation, in the same material as everything else: small
// hand-drawn letters plotted as stars, not a font from anywhere.

const G3 = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'], D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'], J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], N: ['#.#', '###', '###', '###', '#.#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'], P: ['##.', '#.#', '##.', '#..', '#..'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'], S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  V: ['#.#', '#.#', '#.#', '.#.', '.#.'], W: ['#.#', '#.#', '###', '###', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], 0: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'], 4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '##.', '..#', '##.'], 6: ['.##', '#..', '##.', '#.#', '.#.'],
  7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['.#.', '#.#', '.#.', '#.#', '.#.'],
  9: ['.#.', '#.#', '.#.', '..#', '##.'],
};

/** Plot a string as stars, 3 x 5, top-left at (x, y). */
function starText(s, x, y) {
  let cx = x;
  for (const ch of s) {
    const g = G3[ch];
    if (g) for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j][i] === '#') splat(cx + i, y + j, 0.62, 1.6, 2);
    cx += 4;
  }
}

// ------------------------------------------------------------ the figures on the plate

const PX = new Float32Array(14), PY = new Float32Array(14), PI = new Float32Array(14);

/**
 * The state of slot `k` at event phase `tau`. Writes up to 14 star positions
 * into PX/PY and intensities into PI; returns how many.
 */
function figureAt(k, fromD, toD, tau, T, off) {
  const A = FIGS[fromD], B = FIGS[toD];
  const n = Math.max(A.n, B.n);
  const cx = SLOT_X[k] + GW / 2, cy = slotY(cx) + GH / 2;
  const dt = 0.06, dur = 0.5, t0 = -1.05;
  for (let j = 0; j < n; j++) {
    const a = A.pts[j], b = B.pts[j];
    const u = ease.inOutCubic(clamp((tau - t0 - j * dt) / dur, 0, 1));
    let x0, y0, x1, y1;
    if (a) { x0 = a.x + SLOT_X[k] + off[0]; y0 = a.y + slotY(cx) + off[1]; }
    else { const h = noise(j, k * 7 + 3); x0 = cx + off[0] + (h - 0.5) * 60; y0 = cy + off[1] + (noise(j, k * 7 + 4) - 0.5) * 46; }
    if (b) { x1 = b.x + SLOT_X[k] + off[0]; y1 = b.y + slotY(cx) + off[1]; }
    else { x1 = cx + off[0] + (noise(j, k * 7 + 5) - 0.5) * 44; y1 = cy + off[1] + (noise(j, k * 7 + 6) - 0.5) * 34; }
    // The flight is an arc, not a straight line: the star is carried round.
    const bow = (noise(j, k * 5 + 9) - 0.5) * 0.5;
    const mx = (x0 + x1) / 2 - (y1 - y0) * bow, my = (y0 + y1) / 2 + (x1 - x0) * bow;
    const w = 1 - u, e = u;
    PX[j] = w * w * x0 + 2 * w * e * mx + e * e * x1;
    PY[j] = w * w * y0 + 2 * w * e * my + e * e * y1;
    const mag = (b ? b.m : a.m) * (a && b ? 1 : 1);
    // a star in flight is dimmer; a star being born flares; a doomed one dims
    let I = mag * (1 - 0.34 * Math.sin(Math.PI * u));
    if (!a && b) I *= clamp((tau - t0 - j * dt) / 0.25, 0, 1) * (1 + 1.2 * Math.exp(-Math.max(0, tau - t0 - j * dt) / 0.22));
    if (a && !b) I *= 1 - u;
    // scintillation
    const ph = b ? b.phase : a.phase;
    I *= 0.86 + 0.30 * smoothNoise(T * (1.1 + 1.9 * ph) + ph * 9, 5);
    PI[j] = I;
  }
  return n;
}

/**
 * One figure's sight-lines, joining the stars where they are now (PX/PY).
 * `I` is the thread's strength and `pAt(t)` how much of the segment whose
 * first star sits at path fraction `t` has been drawn, so a figure can ink
 * itself on in the order it is written.
 */
function linesOf(figD, I, pAt) {
  if (I <= 0.03) return;
  for (const [i, j] of FIGS[figD].segs) {
    const p = pAt(FIGS[figD].pts[i].t);
    if (p <= 0.002) continue;
    thread(PX[i], PY[i], PX[i] + (PX[j] - PX[i]) * p, PY[i] + (PY[j] - PY[i]) * p, I * (0.3 + 0.7 * p));
  }
}

/**
 * The sight-lines through the turn: the old figure's are fully drawn until
 * the stars leave, then thin to faint threads that stretch with them; the
 * new figure's ink themselves on segment by segment as the stars arrive,
 * ending on the last star of the last stroke.
 */
function figureLines(fromD, toD, tau) {
  if (tau === null) { linesOf(toD, 1.0, () => 1); return; }
  const old = tau < -1.4 ? 1
    : tau < -0.95 ? 1 - 0.62 * ((tau + 1.4) / 0.45)
      : tau < 0.0 ? 0.38
        : tau < 0.34 ? 0.38 * (1 - ease.inOutCubic(tau / 0.34)) : 0;
  linesOf(fromD, 1.0 * old, () => 1);
  linesOf(toD, 1.0, (t) => ease.outCubic(clamp((tau - (INK_T0 + t * 0.95)) / 0.30, 0, 1)));
}

// ------------------------------------------------------------ event schedule

// Minutes: the figure re-lines from :58.95 and the lines ink back from :00.15.
const INK_T0 = 0.15;
// Hours: the sky's turning runs away from :57.3, comes round a whole turn by
// :59.4 and is still again before the time re-lines — two beats, not one.
const HOUR_A = 2.7, HOUR_B = 0.6;

/** Extra rotation of the sky during the hour event (a long exposure). */
function hourSpin(tau) {
  if (tau === null) return 0;
  return TAU * ease.inOutCubic(clamp((tau + HOUR_A) / (HOUR_A - HOUR_B), 0, 1));
}
/** How strong the long exposure is (for the star trails and the flare). */
function exposure(tau) {
  if (tau === null) return 0;
  const u = (tau + HOUR_A) / (HOUR_A - HOUR_B);
  if (u <= 0 || u >= 1) return 0;
  return Math.sin(Math.PI * u) ** 0.7;
}

// ------------------------------------------------------------ the frame

export default {
  name: 'Constellation',
  blurb: 'A star chart whose constellations are the time, joined by sight-lines: the changed figure re-lines itself star by star, the seconds are a satellite crossing the sky, and on the hour the whole sky turns a revolution in long exposure.',
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

    // -------------------------------------------------- event phase
    const sec = f.sec;
    let tau = null, oldF = f, newF = f;
    if (sec >= 56) { tau = sec - 60; oldF = f; newF = clockFields(new Date(ms + 60000)); }
    else if (sec < 5) { tau = sec; oldF = previousMinute(date); newF = f; }
    const hour = newF.m === 0 && tau !== null;
    const expo = hour ? exposure(tau) : 0;
    const spin = hour ? hourSpin(tau) : 0;

    E.fill(0);

    // -------------------------------------------------- the sky
    const key = f.minuteKey;
    const skyAng = -(T % SKY_REV) / SKY_REV * TAU;
    const ang = skyAng + spin;
    const pr = 0.30 * smoothNoise(T * 0.004, 61);          // the haze's slow drift
    const trails = expo > 0.06;

    for (const c of CLOUDS) {
      const x = c.x + pr + ox, y = c.y - pr * 0.4 + oy;
      if (x < -8 || x > W + 8 || y < -8 || y > H + 8) continue;
      const h = hazeAt(x, y);
      if (h <= 0) continue;
      splat(x, y, c.i * h, c.r, 2);
    }

    // Rotate the sky about the pole. On the hour the turning runs away and
    // the brighter stars draw their long-exposure arcs round the pole.
    for (const s of SKY) {
      const x = POLE[0] + ox + s.r * Math.cos(s.a + ang);
      const y = POLE[1] + oy + s.r * Math.sin(s.a + ang);
      if (trails && s.m > 0.35) {
        const span = 0.78 * expo, N = 14;
        let px = x, py = y;
        for (let q = 1; q <= N; q++) {
          const aq = ang - (span * q) / N;
          const qx = POLE[0] + ox + s.r * Math.cos(s.a + aq);
          const qy = POLE[1] + oy + s.r * Math.sin(s.a + aq);
          thread(px, py, qx, qy, (0.14 + 0.38 * s.m) * expo * (1 - q / N) ** 1.1, 1.3, 1.6);
          px = qx; py = qy;
        }
      }
      if (x < -4 || x > W + 4 || y < -4 || y > H + 4) continue;
      const tw = 0.82 + 0.34 * smoothNoise(T * s.f * 0.8 + s.p * 9, 5);
      star(x, y, s.m * (1 + 0.6 * expo), tw);
    }

    // the pole star: fixed, flaring with the exposure. The dotted ring is
    // the chart's circumpolar circle — the stars inside it never set.
    for (let a = 0; a < 64; a += 2) {
      const th = (a / 64) * TAU;
      splat(POLE[0] + ox + 25 * Math.cos(th), POLE[1] + oy + 25 * Math.sin(th), 0.85, 0.9, 1);
    }
    star(POLE[0] + ox, POLE[1] + oy, 0.95 + 0.9 * expo, 1);

    // -------------------------------------------------- the time
    const was = `${oldF.hh}${oldF.mm}`, now = `${newF.hh}${newF.mm}`;
    const t = tau === null ? 0 : tau;
    for (let k = 0; k < 4; k++) {
      const n = figureAt(k, +was[k], +now[k], t, T, off);
      figureLines(+was[k], +now[k], tau);
      for (let j = 0; j < n; j++) {
        const m = PI[j];
        if (m <= 0.03) continue;
        star(PX[j], PY[j], Math.min(0.98, m * 1.08), 1);
      }
    }

    // -------------------------------------------------- the binary (colon)
    const ba = T * (TAU / 9);                              // period 9 s
    const bx = COLON[0] + ox, by = COLON[1] + oy;
    const ex = 3.4 * Math.sin(ba), ey = 6.6 * Math.cos(ba);
    star(bx + ex, by + ey, 0.95 + 0.12 * Math.sin(T * 2.1), 1);
    star(bx - ex, by - ey, 0.8 + 0.12 * Math.sin(T * 2.1 + 2), 1);

    // -------------------------------------------------- the satellite (seconds)
    const sv = (sec / 60) * 208 - 40;                      // crosses in the minute
    const arc = (sv - 64) / 70;
    const sy = 6.5 + arc * arc * 6;                        // it arcs over the sky
    const slope = (arc * 12) / 70;
    const mid = clamp(1 - Math.abs(sv - 64) / 55, 0, 1);
    const flare = 1 + 1.4 * mid ** 2.4;
    for (let q = 1; q < 30; q++) {
      const d = q * 1.3, fq = 1 - q / 30;
      splat(sv - d, sy - d * slope, 0.30 * fq * fq * (0.35 + 0.65 * mid), 1.4, 1);
    }
    if (sv > -14 && sv < 142) {
      star(sv + ox, sy + oy, 0.8 * flare, 1);
      splat(sv + ox, sy + oy, 0.5 * flare, 5, 2);
    }

    // -------------------------------------------------- the chart's annotation
    starText(`${f.dow} ${f.day}`, labelX(date) + ox, LABEL_Y + 1 + oy);


    // -------------------------------------------------- develop
    const nx = (key * 7) & 127, ny = (key * 13) & 63;
    for (let y = 0; y < H; y++) {
      const row = E.subarray(y * W, y * W + W), tr = (y + ny) & 63;
      for (let x = 0; x < W; x++) {
        const e = row[x];
        if (e < 0.045) continue;
        if (e > 0.05 + 0.95 * TH[(tr << 7) | ((x + nx) & 127)]) g.pixel(x, y, 1);
      }
    }

    oled.contrast(0xc8 + (0x1a - 0xc8) * night + 0x18 * expo);
  },
};
