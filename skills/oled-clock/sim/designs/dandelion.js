// Dandelion — the time combed out of dandelion fluff.
//
// A dandelion clock on its stem stands at the left of the glass. Every puff
// of its fluff is a pappus: a seed with a fan of fine hairs, and the whole
// head shimmers as the hairs lean in the breeze.
//
// The four numerals to its right are not written but *combed*: each is a
// bundle of loose filaments, four hairs to a stroke, fanning out at every
// end into a little parachute — the same material as the head. A few hairs
// have come loose and drift about the numerals.
//
// The wind is always at it. One seed of the head rides round just outside it,
// a lap a minute, with a short trail behind it: the seconds. Every minute the
// hairs of the numeral that changes let go and are carried off, and a stream
// of filaments is drawn out of the head and settles, hair by hair, into the
// new numeral; the two pappi of the colon drift up and down between the hours
// and the minutes. On the hour the whole head blows away at once — sixty
// pappi tumbling across the glass — and a fresh head opens on the bare stem,
// pappus by pappus spiralling out from the centre, from which the whole time
// is then combed afresh.
//
// Burn-in: the wind and a slow drift walk the picture round a small circle,
// and the pappi that let go are picked from the clock. 23:00-07:00 the panel
// dims (ctx.night).

import { dither, clamp, ease, noise, clockFields } from '../js/kit.js';

const TAU = Math.PI * 2;

// ------------------------------------------------------------ the breeze
// Every point is displaced by this: a two-frequency sway (the head and the
// numerals breathing) plus the burn-in drift, which walks the whole picture
// round a small circle smoothly, so no pixel is lit in the same place all day.

const ENV = { T: 0, gust: 0, ox: 0, oy: 0 };

function blowAt(x, y, amp = 1) {
  const { T, gust, ox, oy } = ENV;
  const a = (0.85 + 2.4 * gust) * amp;
  return [
    ox + a * (0.6 * Math.sin(T * 1.13 + y * 0.1) + 0.4 * Math.sin(T * 0.59 + x * 0.067 + 1.7)),
    oy + a * (0.5 * Math.cos(T * 0.93 + x * 0.087) + 0.5 * Math.cos(T * 0.47 + y * 0.077 + 0.6)),
  ];
}
const blown = (pts, amp = 1) => pts.map(([x, y]) => { const [dx, dy] = blowAt(x, y, amp); return [x + dx, y + dy]; });

// ------------------------------------------------------------ drawing

/** A one-pixel thread, dithered or solid. */
function thread(g, pts, level = 1) {
  if (level <= 0.02 || pts.length < 2) return;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      const x = Math.round(x0 + (x1 - x0) * u), y = Math.round(y0 + (y1 - y0) * u);
      if (level >= 0.999 || dither(x, y, level)) g.pixel(x, y, 1);
    }
  }
}

/** Centripetal Catmull-Rom through `pts`, sampled every ~1.4 px. */
function spline(pts, step = 1.4) {
  if (pts.length < 3) return pts.map((p) => [...p]);
  const P = [[2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]], ...pts,
    [2 * pts.at(-1)[0] - pts.at(-2)[0], 2 * pts.at(-1)[1] - pts.at(-2)[1]]];
  const out = [];
  const tj = (a, b) => Math.max(1e-4, Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5);
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const t1 = tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
    const n = Math.max(2, Math.ceil((t3 - t1) / step * 4));
    for (let k = 0; k < n; k++) {
      const t = t1 + ((t2 - t1) * k) / n;
      const L = (a, b, ta, tb) => [
        ((tb - t) * a[0] + (t - ta) * b[0]) / (tb - ta), ((tb - t) * a[1] + (t - ta) * b[1]) / (tb - ta)];
      const A1 = L(p0, p1, 0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
      out.push(L(L(A1, A2, 0, t2), L(A2, A3, t1, t3), t1, t2));
    }
  }
  out.push([...pts.at(-1)]);
  return out;
}

/** Unit normals along a polyline. */
function normals(pts) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l];
  });
}

// ------------------------------------------------------------ letterforms
// Each numeral is a bundle of hairs: a skeleton in a 15 x 28 box, stroked as
// four parallel filaments, and at every free end a little parachute of hairs
// spreading out — the same pappus the head is made of.

const SKELETON = {
  0: [(t) => 7.5 + (6.2 + 0.6 * Math.sin(t)) * Math.sin(t), (t) => 14 - 13.2 * Math.cos(t), 26],
  1: [[[4.4, 7], [8.6, 0.8], [7.9, 28]], [[2.6, 28], [13, 28]]],
  2: [[[1.4, 6.5], [2.4, 2], [7, 0.2], [11.8, 2.4], [13.2, 7], [10.2, 12.6], [5.2, 18.4], [1.6, 23.6], [1, 27.2], [13.4, 27.2]]],
  3: [[[1.2, 1.5], [12.4, 1.5], [6.6, 11.4], [11.4, 12.4], [13.4, 17], [11.8, 24], [7, 28], [2.2, 26], [1, 22]]],
  4: [[[10, 28], [10, 0.6], [0.9, 17.4], [14.4, 17.4]]],
  5: [[[13.4, 1.5], [2.2, 1.5], [1.5, 11], [6.5, 8.6], [11.8, 11], [13.6, 16.6], [11.6, 24], [5.4, 28], [1.1, 24.4]]],
  6: [[[11.4, 2], [7.5, 0.2], [3.1, 2.6], [1.1, 9], [0.7, 18], [3.1, 25], [8, 28], [12.5, 24], [12.9, 17], [9, 13.1], [3.6, 15], [1.3, 19.5]]],
  7: [[[1, 2.2], [1.9, 0.6], [13.4, 0.6], [9, 10], [6.5, 19], [5.6, 28]], [[2.7, 15.5], [12.9, 15.5]]],
  8: [[[4.1, 0.4], [10.5, 0.4], [13, 4.4], [11.3, 8.6], [7.5, 11.1], [3.7, 8.6], [2.1, 4.4], [4.1, 0.4]],
    [[7.5, 11.1], [12.5, 14.5], [13.5, 20.5], [11, 25.6], [5.8, 28], [1.7, 24.6], [0.9, 18.6], [3.5, 14], [7.5, 11.1]]],
  9: [[[3.6, 2], [7.5, 0.2], [11.9, 2.6], [13.9, 9], [14.3, 18], [11.9, 25], [7, 28], [2.5, 24], [2.1, 17], [6, 13.1], [11.4, 15], [13.7, 19.5]]],
};

/** The skeleton of a numeral as smooth polylines in box coordinates. */
const OUTLINE = {};
for (const [d, spec] of Object.entries(SKELETON)) {
  if (typeof spec[0] === 'function') {
    const [fx, fy, n] = spec;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * TAU;
      pts.push([fx(t), fy(t)]);
    }
    OUTLINE[d] = [pts];
  } else OUTLINE[d] = spec.map((st) => spline(st, 1.3));
}

const HAIR_OFF = [-1.75, 0, 1.75];   // the filaments of a stroke, with air between

/** Every hair of a numeral, in canvas coordinates: a bundle plus its fans. */
function hairsOf(d, x0, y0) {
  const hairs = [];
  OUTLINE[d].forEach((line, si) => {
    const nrm = normals(line);
    for (const off of HAIR_OFF) {
      hairs.push({ pts: line.map(([x, y], i) => [x0 + x + nrm[i][0] * off, y0 + y + nrm[i][1] * off]), si, kind: 'bundle' });
    }
    // A parachute at each free end: hairs spreading out past the tip.
    const closed = line.length > 2 && Math.hypot(line[0][0] - line.at(-1)[0], line[0][1] - line.at(-1)[1]) < 2;
    if (closed) return;
    for (const end of [0, line.length - 1]) {
      const p = line[end];
      const q = line[end === 0 ? Math.min(4, line.length - 1) : Math.max(0, line.length - 5)];
      const dir = Math.atan2(p[1] - q[1], p[0] - q[0]);
      for (let k = -2; k <= 2; k++) {
        const a = dir + k * 0.34;
        const L = 4.2 - Math.abs(k) * 0.5;
        hairs.push({ pts: [[x0 + p[0], y0 + p[1]], [x0 + p[0] + Math.cos(a) * L, y0 + p[1] + Math.sin(a) * L]], si, kind: 'fan' });
      }
    }
  });
  return hairs;
}

// ------------------------------------------------------------ the head
// The seed head: pappi on a Fibonacci spiral, each a short stalk and a fan of
// hairs, denser at the middle so the ball reads round. It shimmers.

const HEAD = [25.5, 33];
const HR = 12.6;
const NSEED = 60;
const SEEDS = Array.from({ length: NSEED }, (_, i) => {
  const ga = Math.PI * (3 - Math.sqrt(5));
  const r = HR * (0.1 + 0.9 * Math.sqrt((i + 0.5) / NSEED));
  const a = i * ga + noise(i, 3) * 0.08;
  return { r, a, i };
});

/**
 * One pappus: a stalk in from the receptacle to the seed at (x, y), and a fan
 * of hairs spreading outwards from it, all leaning in the breeze.
 */
function pappus(g, x, y, a, scale, level, t, seed, stalk = 4.0) {
  if (level <= 0.03 || scale <= 0.02) return;
  const lean = 0.13 * Math.sin(t * 1.5 + seed * 1.7);
  const sx = x - Math.sin(a) * stalk, sy = y + Math.cos(a) * stalk;
  thread(g, [[sx, sy], [x, y]], level);
  for (let k = -3; k <= 3; k++) {
    const ang = a + lean + k * 0.29;
    const L = (3.3 - Math.abs(k) * 0.36) * scale;
    thread(g, [[x, y], [x + Math.sin(ang) * L, y - Math.cos(ang) * L]], level);
  }
}

/**
 * The whole head. On the hour its pappi are torn off in a wave from the rim
 * inward and tumble across the glass; the bare stalks are left, and then a
 * fresh head opens on them, pappus by pappus spiralling out from the middle.
 */
function drawHead(g, tau, kind, t) {
  const [hx, hy] = [HEAD[0] + ENV.ox, HEAD[1] + ENV.oy];
  const spin = t * 0.045;      // the head turns in the breeze (and spreads wear)
  const b = kind === 'hour' ? clamp((tau - H_BLOOM) / H_BLOOM_D, 0, 1) : 1;
  for (const s of SEEDS) {
    const lv0 = clamp(0.86 - 0.3 * (s.r / HR) ** 1.4, 0.36, 0.9);
    const r = Math.max(1.6, s.r * ease.outCubic(b)) + 0.7 * Math.sin(t * 1.4 + s.i * 2.1);
    const [wx, wy] = blowAt(hx + Math.sin(s.a + spin) * r, hy - Math.cos(s.a + spin) * r, 0.95);
    const x = hx + Math.sin(s.a + spin) * r + wx, y = hy - Math.cos(s.a + spin) * r + wy;
    if (kind !== 'hour') { pappus(g, x, y, s.a + spin, 1, lv0, t, s.i, Math.min(4, r * 0.8)); continue; }
    const depart = H_CUT + (1 - s.r / HR) * 0.55;
    if (tau < depart) { pappus(g, x, y, s.a, 1, lv0, t, s.i); continue; }
    const f = (tau - depart) / H_BLOW;
    if (f < 1) {
      const sp = 42 + 78 * noise(s.i, 7);
      const fx = hx + Math.sin(s.a) * s.r + sp * f * f;
      const fy = hy - Math.cos(s.a) * s.r - 30 * f + 40 * f * f + 14 * f * f * noise(s.i, 8);
      pappus(g, fx, fy, s.a + 1.9 * f * (noise(s.i, 9) - 0.4), 1 - 0.25 * f, clamp(1 - (f - 0.6) / 0.4, 0, 1), t, s.i);
      continue;
    }
    if (b <= 0) { thread(g, [[x, y], [x + Math.sin(s.a) * 2.6, y - Math.cos(s.a) * 2.6]], 0.5); continue; }
    pappus(g, x, y, s.a + spin, 0.4 + 0.6 * b, lv0 * (b > 0.85 ? 1 : 0.45 + 0.55 * b), t, s.i);
  }
}

/** How far pappus `i` is out, for a blooming head (a spiral from the middle). */
function setProgress(i, bloom) {
  if (bloom >= 1) return 1;
  const order = i / NSEED;                       // the spiral already runs outwards
  return (bloom * 1.45 - order) * 5.5;
}

// ------------------------------------------------------------ the schedule

const M_CUT = -1.25, M_FALL = 1.05, M_ARRIVE = 0.02, M_FLY = 0.62;
const H_CUT = -2.1, H_FALL = 1.2, H_BLOW = 0.85, H_BLOOM = 0.0, H_BLOOM_D = 1.0, H_DIGIT = 1.1, H_FLY = 0.6, H_STAG = 0.72;

/**
 * A hair's life. Before `cut` it is in place; then it is carried off by the
 * wind for `fall` seconds; then it is gone; then it flies home out of the
 * puff, taking `growD`.
 */
function life(tau, cut, fall, grow, growD) {
  if (tau < cut) return { mode: 'home' };
  if (tau < cut + fall) return { mode: 'out', f: (tau - cut) / fall };
  if (tau < grow) return { mode: 'gone' };
  if (tau < grow + growD) return { mode: 'in', f: (tau - grow) / growD };
  return { mode: 'home' };
}

/** A hair flying home: it unrolls out of the puff and settles into place. */
function midFlight(home, src, f, seed) {
  const t = clamp(f, 0, 1);
  const k = ease.outCubic(t);
  const arc = Math.sin(Math.PI * t) * (2.5 + 6 * noise(seed, 11)) * (noise(seed, 12) < 0.5 ? -1 : 1);
  const cx = home.reduce((a, p) => a + p[0], 0) / home.length;
  const cy = home.reduce((a, p) => a + p[1], 0) / home.length;
  const dx = cx - src[0], dy = cy - src[1];
  const l = Math.hypot(dx, dy) || 1;
  const wx = -dy / l, wy = dx / l;
  // The filament keeps most of its length as it crosses, so what comes out of
  // the puff is recognisably a strand of the numeral that is forming.
  const sc = 0.42 + 0.58 * k;
  return home.map(([x, y]) => {
    const ux = cx + (x - cx) * sc + (src[0] - cx) * (1 - k);
    const uy = cy + (y - cy) * sc + (src[1] - cy) * (1 - k);
    return [ux + wx * arc, uy + wy * arc];
  });
}

/** Where a hair that is being carried off has got to. */
function goneAt(home, f, seed) {
  const t = clamp(f, 0, 1);
  const vx = 16 + 24 * noise(seed, 21), vy = -10 - 20 * noise(seed, 22);
  const dx = vx * t * t, dy = vy * t + 26 * t * t;
  const rot = 0.5 * t * (noise(seed, 23) - 0.5);
  const cx = home[0][0], cy = home[0][1];
  const ca = Math.cos(rot), sa = Math.sin(rot);
  return home.map(([x, y]) => {
    const ux = x - cx, uy = y - cy;
    return [cx + ux * ca - uy * sa + dx, cy + ux * sa + uy * ca + dy];
  });
}

/** The life of each hair of the numeral in slot `i` on the current event. */
function hairLives(kind, tau, i, hairs) {
  let si = -1, n = 0, k = 0;
  return hairs.map((h) => {
    if (h.si !== si) { si = h.si; n = 0; k++; }
    const off = (n++) * 0.012;
    if (kind === 'hour') return life(tau, H_CUT + k * 0.05, H_FALL, H_DIGIT + i * H_STAG + k * 0.06 + off, H_FLY);
    return life(tau, M_CUT + k * 0.06, M_FALL, M_ARRIVE + k * 0.05 + off, M_FLY);
  });
}

// ------------------------------------------------------------ the design

export default {
  name: 'Dandelion',
  blurb: 'The time combed out of dandelion fluff: hair-bundle numerals blown from the seed head, a breath of wind between one and the next, and a fresh head on the hour.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, ctx) {
    const { date, fields: f, oled, night } = ctx;
    const ms = date.getTime();
    const T = ms / 1000;
    const mins = ms / 60000;

    ENV.ox = 3.4 * Math.sin((TAU * mins) / 13);
    ENV.oy = 3.4 * Math.sin((TAU * mins) / 17 + 0.9);

    const turnT = Math.round(ms / 60000) * 60000;
    const tau = (ms - turnT) / 1000;
    const newF = clockFields(new Date(turnT));
    const oldF = clockFields(new Date(turnT - 60000));
    const HOUR = newF.m === 0 && tau > -2.6 && tau < 5.6;
    const kind = HOUR ? 'hour' : (tau > -1.9 && tau < 1.5) ? 'minute' : 'none';
    ENV.T = T;
    ENV.gust = kind === 'hour' ? 0.35 + 1.15 * Math.exp(-(((tau - 0.2) / 1.5) ** 2))
      : kind === 'minute' ? 0.22 * Math.exp(-(((tau + 0.5) / 0.9) ** 2)) : 0;

    const oldKey = `${oldF.hh}${oldF.mm}`, newKey = `${newF.hh}${newF.mm}`;

    // -- the stem, and a leaf at the foot of it -------------------------
    const stem = spline([[HEAD[0], HEAD[1] + HR * 0.75], [HEAD[0] - 1.5, 46], [HEAD[0] + 0.6, 54], [HEAD[0] + 2.4, 63]], 1.6);
    thread(g, blown(stem, 0.4), 0.72);
    // A dandelion leaf, drawn as a comb of fine hairs like everything else.
    const leafBase = [27, 62], leafTip = [48, 51];
    for (let k = 0; k <= 7; k++) {
      const u = k / 7;
      const bx = leafBase[0] + (leafTip[0] - leafBase[0]) * u;
      const by = leafBase[1] + (leafTip[1] - leafBase[1]) * u;
      const w = 8 * Math.sin(Math.PI * u) ** 0.7;
      const jag = (k % 2 ? -0.9 : 0.7) * w * 0.35;
      thread(g, blown([[bx - w * 0.35, by + w], [bx + jag, by + w * 0.45], [bx + w * 0.15, by - w * 0.1]], 0.4), 0.3);
    }
    thread(g, blown(spline([leafBase, [38, 55], leafTip], 1.5), 0.4), 0.4);

    // -- the head --------------------------------------------------------
    const bloomNow = kind === 'hour' ? clamp((tau - H_BLOOM) / H_BLOOM_D, 0, 1) : 1;
    drawHead(g, tau, kind, T);

    // -- the time --------------------------------------------------------
    for (let i = 0; i < 4; i++) {
      const changing = HOUR || oldKey[i] !== newKey[i];
      const [x0, y0] = slotXY(i);
      const shownD = +((changing && tau < 0) ? oldKey[i] : newKey[i]);
      const hairs = hairsOf(shownD, x0, y0);
      const lives = changing ? hairLives(kind, tau, i, hairs) : hairs.map(() => ({ mode: 'home' }));
      hairs.forEach((h, k) => {
        const lf = lives[k];
        if (lf.mode === 'gone') return;
        if (lf.mode === 'home') { thread(g, blown(h.pts, 0.5), h.kind === 'bundle' ? 1 : 0.9); return; }
        const src = [HEAD[0] + Math.sin(k * 1.7) * 4, HEAD[1] + Math.cos(k * 2.3) * 4];
        if (lf.mode === 'out') {
          thread(g, blown(goneAt(h.pts, lf.f, k * 3.1), 1.3), clamp(1 - (lf.f - 0.5) / 0.45, 0, 1));
        } else {
          thread(g, blown(midFlight(h.pts, src, lf.f, k * 3.1), 0.7), clamp((lf.f - 0.3) * 2.2, 0, 1));
        }
      });
    }

    // -- the seconds: a seed of the head riding round just outside it -----
    {
      const [hx, hy] = [HEAD[0] + ENV.ox, HEAD[1] + ENV.oy];
      const u = (f.sec / 60) % 1;
      const R = HR + 6.4;
      if (bloomNow >= 1) {
        for (let k = 7; k >= 1; k--) {
          const a2 = 0.3 - TAU * (u - k * 0.006);
          const lv = 0.85 * Math.exp(-k / 3.4);
          if (lv < 0.15) continue;
          const [wx, wy] = blowAt(hx + Math.sin(a2) * R, hy - Math.cos(a2) * R, 0.9);
          if (dither(k * 3, 1, lv)) g.pixel(hx + Math.sin(a2) * R + wx, hy - Math.cos(a2) * R + wy, 1);
        }
        const a2 = 0.3 - TAU * u;
        const [wx, wy] = blowAt(hx + Math.sin(a2) * R, hy - Math.cos(a2) * R, 0.9);
        const px = hx + Math.sin(a2) * R + wx, py = hy - Math.cos(a2) * R + wy;
        pappus(g, px, py, a2, 1.4, 1, T, 71);
        g.fillCircle(px, py + 2.4, 1.1, 1);
      }
    }

    // -- the colon: two pappi adrift between hours and minutes -----------
    const bob = 1.5 * Math.sin(T * 0.9), sway = 1.1 * Math.sin(T * 0.63 + 1.2);
    for (const [cy, ph] of [[37, 0], [46, 1.6]]) {
      const y = cy + bob * (ph ? -1 : 1) + ENV.oy;
      const x = 84.5 + sway * (ph ? -1 : 1) + ENV.ox;
      pappus(g, x, y, 0.3 + 0.4 * Math.sin(T * 0.5 + ph), 1.25, 1, T, 90 + ph);
      g.fillCircle(x, y + 2.6, 0.9, 1);
    }

    // -- hairs that have come loose, always drifting ---------------------
    for (let k = 0; k < 7; k++) {
      const ph = noise(k * 7.7, 31) * TAU;
      const sp = 0.09 + 0.05 * noise(k, 32);
      const x = (noise(k, 33) * 128 + T * 2.4 * sp * 10) % 150 - 11;
      const y = noise(k, 34) * 62 + 5 * Math.sin(T * 0.5 + ph);
      const a = 0.6 + 0.5 * Math.sin(T * 0.7 + ph);
      thread(g, [[x, y], [x + Math.cos(a) * 3.4, y + Math.sin(a) * 3.4]], 0.75);
    }

    // -- a seed of the head that lets go every few seconds ----------------
    const shed = (f.sec % 9) / 9;
    if (shed < 0.75 && kind !== 'hour') {
      const dk = Math.floor(T / 9);
      const s = SEEDS[Math.floor(noise(dk, 41) * NSEED) % NSEED];
      const sx = HEAD[0] + Math.sin(s.a) * s.r, sy = HEAD[1] - Math.cos(s.a) * s.r;
      const x = sx + 34 * shed * shed, y = sy - 14 * shed - 10 * shed * shed;
      pappus(g, x + ENV.ox, y + ENV.oy, 0.4 + 1.2 * shed, 1 - 0.3 * shed, clamp((0.75 - shed) / 0.2, 0, 1), T, s.i);
    }

    oled.contrast(0xd4 + (0x2a - 0xd4) * night);
  },
};

/** The numeral box for slot i. */
function slotXY(i) {
  const SLOT = [47, 64, 90, 107];
  const y = 20 + 1.6 * Math.sin((Math.PI * (SLOT[i] - 40)) / 84);
  return [SLOT[i], y];
}
