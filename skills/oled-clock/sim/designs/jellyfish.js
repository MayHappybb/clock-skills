// Jellyfish — sea nettles rowing through black water, behind a time
// written in living light.
//
// The jellies are Pacific sea nettles (Chrysaora fuscescens), drawn from a
// photograph: a domed bell with a scalloped margin and a faint star of rays,
// four long frilly oral arms about twice the bell's width, and long thin
// marginal tentacles. They swim the way medusae do, by rowing: a quick
// contraction (the bell narrows and gets taller), a slower elastic
// relaxation and a pause; the body surges on the stroke, glides, and gets a
// second small push in the pause from the vortex ring under the bell
// (Gemmell et al., PNAS 2013). Arms and tentacles trail as analytic waves:
// a point d pixels down sits where the bell was d pixels back along its
// path, d/24 s ago, so every surge runs down them and a turn is followed,
// not copied. The bell is translucent, blue-noise dithered and anchored to
// the jelly; small jellies are far and fainter. Marine snow sinks past.
//
// Jellies are scheduled, not simulated: one may set out from below every
// 23 s on a gently curving arc, so where any of them is at any instant is a
// formula of the clock (pulse count, the stroke's distance profile, arc).
//
// The digits are tall monoline strokes made of light organs, 2x2 dots on a
// 3-pixel pitch, with a shimmer running along each stroke like the beating
// comb rows of a comb jelly. Jellies swim behind them: near the dots and
// inside each digit's box the jelly is thinned to a faint veil (depth of
// field), so the time reads through any jelly.
//
// Minute: at :59 the jelly nearest the middle flashes, as startled jellies
// do, and a ring of light runs out from it. Each light organ of a changing
// digit flares as the ring reaches it, comes loose and drifts off dimming;
// all are out before :00. Digits that stay just glow as it passes. At :00
// the new digits are written organ by organ along their strokes. A slot is
// empty for a moment; old and new are never lit together.
// Hour: a double ring, and a bloom of two dozen tiny medusae, each pulsing
// on its own beat, rises from below past the digits for the next ~15 s.
//
// Burn-in: the digits walk a 2-pixel orbit; the shimmer moves the bright
// dots along them. Night: dims via ctx.night.

import { orbit, noise, smoothNoise, clamp, ease, progress, clockFields, previousMinute, dither, OFF, ON } from '../js/kit.js';

// A 32x32 blue-noise threshold matrix (void-and-cluster), ranks 0..1023 as
// two base64 digits each: smooth translucency without the Bayer cross-hatch.
const BLUE =
  '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';
const W = 128, H = 64;
const TAU = Math.PI * 2;

// ------------------------------------------------------------ swimming

// A medusa swims by rowing: the bell contracts fast (muscle), relaxes more
// slowly (elastic recoil), pauses, and contracts again. It surges forward
// during the contraction, glides as it relaxes, and gets a second, smaller
// push during the pause, when the vortex ring under the relaxed bell
// presses on it ("passive energy recapture", Gemmell et al., PNAS 2013).
const C_END = 0.3, R_END = 0.85;          // contraction, relaxation ends (fraction of a pulse)

/** How contracted the bell is, 0 relaxed .. 1, at pulse phase ph (0..1). */
function contraction(ph) {
  if (ph < C_END) return Math.sin((Math.PI / 2) * (ph / C_END)) ** 2;
  if (ph < R_END) return Math.cos((Math.PI / 2) * ((ph - C_END) / (R_END - C_END))) ** 2;
  return 0;
}

/** Swimming speed over a pulse (arbitrary units): the stroke, the glide, the second push. */
function speed(ph) {
  const stroke = ph < 0.5 ? Math.sin(Math.PI * (ph / 0.5)) ** 2 : 0;
  const per = Math.exp(-(((ph - 0.93) / 0.07) ** 2)) * 0.32;
  return stroke + per + 0.04;
}

/** Distance covered by phase ph, as a fraction of one pulse's distance (tabulated once). */
const GAIN = new Float32Array(257);
{
  let acc = 0;
  for (let k = 1; k <= 256; k++) { acc += speed((k - 0.5) / 256); GAIN[k] = acc; }
  for (let k = 0; k <= 256; k++) GAIN[k] /= acc;
}
function gained(ph) {
  const x = ph * 256, i = Math.min(255, Math.floor(x));
  return GAIN[i] + (GAIN[i + 1] - GAIN[i]) * (x - i);
}

// ------------------------------------------------------------ the jellies

// Jellies rise through the water on a schedule: one may set out from below
// the glass every SLOT seconds, on a gently curving path (a circular arc,
// so position at any arc length is a formula). Each is a sea nettle
// (Chrysaora): a domed bell with a scalloped margin and a faint star of
// rays, four long frilly oral arms about twice the bell's width, and long
// thin marginal tentacles. Size sets depth: small ones are far, fainter.
const SLOT = 23;

function jellyOf(n) {
  if (noise(n, 1) > 0.86) return null;
  const R0 = 7.5 + 6.5 * noise(n, 3) ** 0.8;
  const period = 1.45 + 0.5 * noise(n, 4);
  const x0 = -10 + 148 * noise(n, 5), tx = 18 + 92 * noise(n, 6);
  const S = [x0, H + R0 * 1.3 + 2];
  const th0 = Math.atan2(tx - x0, S[1] + 40);       // aim at a point above the glass
  return {
    n, R0, H0: R0 * 1.02, period,
    t0: n * SLOT + 5 * noise(n, 2),
    phase0: noise(n, 7),
    S, th0, k: (noise(n, 8) - 0.5) * 0.014,
    D: 0.75 * R0,                                    // distance per pulse
    depth: clamp((R0 - 7.5) / 6.5, 0, 1),            // 0 far .. 1 near
    arms: 1.8 * 2 * R0, tent: 3.0 * 2 * R0,
    nT: R0 > 11 ? 9 : 7,
  };
}

/** Arc length travelled by time T (pulsed: surges and glides). */
function travelled(J, T) {
  const p = (T - J.t0) / J.period + J.phase0;
  if (p < J.phase0) return 0;
  const k = Math.floor(p), ph = p - k;
  return J.D * (k + gained(ph) - J.phase0);
}
const phaseAt = (J, T) => {
  const p = (T - J.t0) / J.period + J.phase0;
  return p - Math.floor(p);
};

/** Point on the path at arc length s, and its heading (clock angle). */
function pathAt(J, s) {
  if (s <= 0) return [J.S[0] + Math.sin(J.th0) * s, J.S[1] - Math.cos(J.th0) * s, J.th0];
  const th = J.th0 + J.k * s;
  if (Math.abs(J.k) < 1e-6) return [J.S[0] + Math.sin(J.th0) * s, J.S[1] - Math.cos(J.th0) * s, th];
  return [J.S[0] + (Math.cos(J.th0) - Math.cos(th)) / J.k, J.S[1] - (Math.sin(th) - Math.sin(J.th0)) / J.k, th];
}

/** Bell margin radius at time t (the bell narrows as it contracts). */
const radiusAt = (J, t) => J.R0 * (1 - 0.22 * contraction(phaseAt(J, t)));

// Tentacles and arms trail the bell along the path it has swum, and with a
// lag: a point d pixels down a tentacle sits where the bell was d pixels
// back along its path, as of d / CW seconds ago. So each surge of the bell
// runs down the tentacles as a wave, and a turn is followed, not copied.
const CW = 24;

/** A point d pixels down the trail, `lat` pixels to the side of the path. */
function trail(J, T, d, lat) {
  const [x, y, th] = pathAt(J, travelled(J, T - d / CW) - d);
  return [x + Math.cos(th) * lat, y + Math.sin(th) * lat];
}

/** Blue-noise threshold at integer (x, y), 0..1. */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BN = new Float32Array(1024);
for (let k = 0; k < 1024; k++) BN[k] = (B64.indexOf(BLUE[2 * k]) * 64 + B64.indexOf(BLUE[2 * k + 1]) + 0.5) / 1024;
const blue = (x, y) => BN[((y & 31) << 5) | (x & 31)];

/** Marginal tentacles: thin, long, tapering; the far side's drawn fainter, behind the arms. */
function drawTentacles(g, J, T, front, ax, ay, lum) {
  for (let i = 0; i < J.nT; i++) {
    const a = ((i + 0.5) / J.nT) * TAU + J.n * 0.7;
    if ((Math.sin(a) > 0) !== front) continue;
    const L = J.tent * (0.6 + 0.4 * noise(J.n * 31 + i, 20));
    const bx = Math.cos(a), w = (i * 1.9 + J.n) % TAU, kw = 0.07 + 0.07 * noise(J.n * 13 + i, 22);
    for (let d = 0; d <= L; d += 0.5) {
      const r = radiusAt(J, T - d / 20);
      const lat = bx * r * (0.9 + 0.2 * Math.sin(Math.min(1, d / L) * Math.PI))
        + (0.3 + d * 0.11) * Math.sin(d * kw - (TAU * T) / (J.period * 1.8) + w);
      const [x, y] = trail(J, T, d + 0.3, lat);
      const u = d / L;
      const lvl = lum * (front ? 0.72 : 0.32) * (u < 0.5 ? 1 : 1 - (u - 0.5) / 0.5);
      const ix = Math.floor(x), iy = Math.floor(y);
      if (lvl >= 1 || lvl > blue(ix - ax, iy - ay)) g.pixel(ix, iy);
    }
  }
}

/**
 * The four oral arms: long ruffled ribbons that spiral slowly as they
 * trail, drawn by their two frilly edges (one-pixel lines read better than
 * a dithered fill at this size), the far edge fainter.
 */
function drawArms(g, J, T, ax, ay, lum) {
  for (let i = 0; i < 4; i++) {
    const L = J.arms * (0.7 + 0.3 * noise(J.n * 17 + i, 21));
    const base = (i - 1.5) * 0.22 * J.R0;
    for (let d = 1; d <= L; d += 0.45) {
      const u = d / L;
      const frill = Math.sin(d * 1.1 - T * 2.4 + i * 2.3) * 0.9 + Math.sin(d * 2.7 + i) * 0.4;
      const half = (0.2 * J.R0 + frill) * (1 - u) ** 0.5 + 0.6;
      const twist = Math.cos(d * 0.11 - T * 0.9 + i * 1.7);     // the ribbon turning edge-on and back
      const lat = base * (1 - 0.3 * u) + (0.6 + 0.08 * d) * Math.sin(d * 0.15 - (TAU * T) / (J.period * 2.4) + i * 1.6);
      // A faint curtain between the edges.
      for (let k = -1; k <= 1; k++) {
        const [x, y] = trail(J, T, d + 1, lat + k * half * 0.5 * Math.abs(twist));
        const ix = Math.floor(x), iy = Math.floor(y);
        if (lum * 0.16 * (1 - u) > blue(ix - ax + 7, iy - ay + 3)) g.pixel(ix, iy);
      }
      for (const side of [-1, 1]) {
        const [x, y] = trail(J, T, d + 1, lat + side * half * Math.abs(twist));
        const lvl = lum * (side * twist > 0 ? 0.9 : 0.25) * (u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3);
        const ix = Math.floor(x), iy = Math.floor(y);
        if (lvl > blue(ix - ax, iy - ay)) g.pixel(ix, iy);
      }
    }
  }
}

/**
 * The bell, side on: a dome over a scalloped margin, its opening seen as a
 * thin ellipse. Translucent: a bright silhouette rim where we look through
 * the most jelly, a faint body with a star of rays, the darker
 * subumbrellar cavity inside with its own faint wall. Contraction narrows
 * it and makes it taller.
 */
function drawBell(g, J, T, ax, ay, lum, glow) {
  const s = travelled(J, T);
  const [ox, oy, th] = pathAt(J, s);
  const c = contraction(phaseAt(J, T));
  const R = J.R0 * (1 - 0.22 * c), Hh = J.H0 * (1 + 0.2 * c);
  const fx = Math.sin(th), fy = -Math.cos(th), lx = Math.cos(th), ly = Math.sin(th);
  const e = 0.17 * R, Ri = R - 2.3, Hi = Hh - 3.2;
  const box = Math.max(R, Hh) + 3;
  g.fillWhere((px, py, ix, iy) => {
    const dx = px - ox, dy = py - oy;
    const x = dx * lx + dy * ly, y = dx * fx + dy * fy;
    const xr = x / R;
    if (xr * xr >= 1) return false;
    const m = e * Math.sqrt(1 - xr * xr);
    const lap = 0.9 * Math.abs(Math.sin(xr * Math.PI * 4));
    const q = xr * xr + (y / Hh) ** 2;
    if (y >= 0 ? q > 1 : y < -m - 0.4 - lap * 0.8) return false;
    // Distance in pixels inside the silhouette, roughly.
    const inset = (1 - Math.sqrt(q)) * Math.min(R, Hh);
    let lvl;
    if (y < -m + 0.6) lvl = 1;                                    // the margin and its lappets
    else if (inset < 1.05) lvl = 1;                               // silhouette rim
    else if (inset < 2.6) lvl = 0.3 * (2.6 - inset);              // light gathered near the rim
    else {
      const lon = Math.asin(clamp(xr / Math.sqrt(Math.max(0.05, 1 - (y / Hh) ** 2)), -1, 1));
      lvl = Math.cos(lon * 8) > 0.93 && y > m + 1 ? 0.45 : 0.03;  // the star of rays
    }
    lvl = Math.min(1, lvl * lum + glow);
    return lvl >= 1 || lvl > blue(ix - ax, iy - ay);
  }, ON, [ox - box, oy - box, 2 * box, 2 * box]);
  return [ox + fx * Hh * 0.4, oy + fy * Hh * 0.4];
}

/** One whole jelly at time T; returns its bell's centre (or null if off the glass). */
function drawJelly(g, J, T, glow = 0) {
  const [ox, oy] = pathAt(J, travelled(J, T));
  if (ox < -60 || ox > W + 60 || oy < -30) return null;
  const ax = Math.round(ox), ay = Math.round(oy);       // dither anchored to the jelly
  const lum = 0.62 + 0.38 * J.depth;
  drawTentacles(g, J, T, false, ax, ay, lum);
  drawArms(g, J, T, ax, ay, lum);
  drawTentacles(g, J, T, true, ax, ay, lum);
  return drawBell(g, J, T, ax, ay, lum, glow);
}

const LIFE = 70;                                  // seconds a jelly can be on its way

/** The jellies under way at T, far ones first. */
function jelliesAt(T) {
  const out = [];
  for (let n = Math.floor((T - LIFE) / SLOT); n <= Math.floor(T / SLOT); n++) {
    const J = jellyOf(n);
    if (J && T >= J.t0) out.push(J);
  }
  return out.sort((a, b) => a.depth - b.depth);
}

// ------------------------------------------------------------ numerals

/** Flatten a path ('M x y', 'L x y', 'C x1 y1 x2 y2 x y', 'E cx cy rx ry') to points with unit tangents. */
function flatten(d) {
  const tok = d.trim().split(/\s+/), pts = [];
  let i = 0, x = 0, y = 0;
  const push = (px, py, tx, ty) => { const l = Math.hypot(tx, ty) || 1; pts.push([px, py, tx / l, ty / l]); };
  while (i < tok.length) {
    const c = tok[i++], n = () => Number(tok[i++]);
    if (c === 'M') { x = n(); y = n(); }
    else if (c === 'L') {
      const x1 = n(), y1 = n(), steps = Math.ceil(Math.hypot(x1 - x, y1 - y) / 0.15) || 1;
      for (let k = 0; k <= steps; k++) push(x + ((x1 - x) * k) / steps, y + ((y1 - y) * k) / steps, x1 - x, y1 - y);
      x = x1; y = y1;
    } else if (c === 'C') {
      const a = n(), b = n(), cc = n(), dd = n(), x1 = n(), y1 = n();
      for (let k = 0; k <= 80; k++) {
        const t = k / 80, s = 1 - t;
        push(s * s * s * x + 3 * s * s * t * a + 3 * s * t * t * cc + t * t * t * x1,
          s * s * s * y + 3 * s * s * t * b + 3 * s * t * t * dd + t * t * t * y1,
          3 * s * s * (a - x) + 6 * s * t * (cc - a) + 3 * t * t * (x1 - cc),
          3 * s * s * (b - y) + 6 * s * t * (dd - b) + 3 * t * t * (y1 - dd));
      }
      x = x1; y = y1;
    } else if (c === 'E') {
      const cx = n(), cy = n(), rx = n(), ry = n();
      for (let k = 0; k <= 160; k++) {
        const a = (k / 160) * 2 * Math.PI;
        push(cx + rx * Math.sin(a), cy - ry * Math.cos(a), rx * Math.cos(a), ry * Math.sin(a));
      }
    }
  }
  return pts;
}

// The time is written in bioluminescence: tall, thin monoline digits whose
// strokes are rows of light organs, two-pixel dots on a three-pixel pitch,
// like the comb rows of a comb jelly. A shimmer runs along every row, as
// the beating combs of a ctenophore scatter light in travelling waves.
const DW = 18, DH = 36, PITCH = 3;

const DIGIT_PATHS = {
  0: ['E 9 18 7.9 17'],
  1: ['M 4 6.6 L 10.5 1 L 10.5 35'],
  2: ['M 1.5 8.6 C 1.8 3.8 5 1 9 1 C 13.4 1 16.6 4 16.6 8.6 C 16.6 13 13.8 16 10 20 L 1.3 35 L 17 35'],
  3: ['M 1.6 6.4 C 3 2.8 5.8 1 9 1 C 13.2 1 16 3.8 16 8.3 C 16 13 12.6 16.6 7.5 16.6',
    'M 7.5 16.6 C 13.4 16.6 17 20.4 17 25.6 C 17 31.4 13.4 35 8.8 35 C 5.2 35 2.4 33 1.2 29.6'],
  4: ['M 13 35 L 13 1 L 1 25 L 17.2 25'],
  5: ['M 16 1 L 3 1 L 2 16 C 4 14.2 6.4 13.2 9 13.2 C 13.8 13.2 17 17 17 23.8 C 17 30.6 13.6 35 8.8 35 C 5.2 35 2.4 33.2 1.2 29.6'],
  6: ['M 14.6 3.8 C 13.4 2 11.4 1 9.2 1 C 4 1 1 7 1 18 C 1 29 4 35 9 35 C 13.8 35 17 31.4 17 26 C 17 20.6 13.8 17 9 17 C 5 17 2 19.6 1.1 23.4'],
  7: ['M 1 1 L 17 1 L 6.5 35'],
  8: ['E 9 9 6.9 8', 'E 9 26 7.9 9'],
};
DIGIT_PATHS[9] = DIGIT_PATHS[6].map((d) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g,
  (m, x, y) => `${+(DW - x).toFixed(3)} ${+(DH - y).toFixed(3)}`));

/**
 * A digit's light organs: dots spaced evenly along each stroke (ends
 * included), with `s`, the distance along the digit, for the shimmer and
 * for the order it is written in.
 */
function digitDots(d) {
  const dots = [];
  let s0 = 0;
  for (const path of DIGIT_PATHS[d]) {
    const pts = flatten(path), cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const len = cum[cum.length - 1], closed = path.startsWith('E');
    const n = Math.max(1, Math.round(len / PITCH));
    for (let k = 0; k <= (closed ? n - 1 : n); k++) {
      const at = (len * k) / n;
      let i = 1;
      while (i < cum.length - 1 && cum[i] < at) i++;
      const u = (at - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
      const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, y = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u;
      const px = Math.round(x - 1), py = Math.round(y - 1);
      if (dots.some((o) => Math.abs(o.x - px) < 2 && Math.abs(o.y - py) < 2)) continue;
      dots.push({ x: px, y: py, s: s0 + at });
    }
    s0 += len;
  }
  return { dots, len: s0 };
}
const DOTS = {};
for (let d = 0; d <= 9; d++) DOTS[d] = digitDots(d);

/** A light organ: a 2x2 dot, or lit up, a rounded 4x4 glow; on a dark keyline. */
function organ(g, x, y, bright) {
  g.fillRect(x - 1 - bright, y - 1 - bright, 4 + 2 * bright, 4 + 2 * bright, OFF);
  g.fillRect(x, y, 2, 2);
  if (bright) { g.hline(x, y - 1, 2).hline(x, y + 2, 2).vline(x - 1, y, 2).vline(x + 2, y, 2); }
}


// ------------------------------------------------------------ marine snow

const SNOW = [];
for (let i = 0; i < 34; i++) SNOW.push({ x: noise(i, 41) * 136, y: noise(i, 42) * 72, z: 0.25 + 0.75 * noise(i, 43), i });

/** Marine snow: specks sinking and drifting, nearer ones faster; a few catch the light. */
function drawSnow(g, T) {
  for (const p of SNOW) {
    const x = (((p.x + T * (noise(p.i, 44) - 0.5) * 2 * p.z + 1.5 * Math.sin(T * 0.25 + p.i)) % 136) + 136) % 136 - 4;
    const y = (((p.y + T * (0.5 + 1.8 * p.z)) % 72) + 72) % 72 - 4;
    g.pixel(x, y);
    if (p.z > 0.85 && smoothNoise(T * 0.8 + p.i * 5, p.i) > 0.8) g.pixel(x + 1, y).pixel(x - 1, y).pixel(x, y - 1).pixel(x, y + 1);
  }
}

// ------------------------------------------------------------ the minute: a flash

// At :59 the jelly nearest the middle flashes, as startled jellies do, and
// a ring of light runs out from it through the water. Where it meets a
// digit that is about to change, each light organ flares, comes loose and
// drifts off dimming; every one is out before :00. Digits that stay just
// glow as it passes. At :00 the new digits light up organ by organ along
// their strokes, as if written. (A slot is empty for a moment; old and new
// are never lit together.)
const EV0 = 59, RING_V = 210, HIT_MAX = 0.72, WRITE_V = 150;

/** The ripple's source for the event starting at T0: the bell nearest the middle, or the deep. */
function rippleSource(T0) {
  let best = null, bd = Infinity;
  for (const J of jelliesAt(T0)) {
    const [x, y] = pathAt(J, travelled(J, T0));
    if (x < 4 || x > W - 4 || y < 2 || y > H - 2) continue;
    const dd = Math.hypot(x - 64, y - 32);
    if (dd < bd) { bd = dd; best = J; }
  }
  if (!best) return { J: null, at: [64, H + 12] };
  const [x, y, th] = pathAt(best, travelled(best, T0));
  return { J: best, at: [x + Math.sin(th) * best.R0 * 0.5, y - Math.cos(th) * best.R0 * 0.5] };
}

function drawRing(g, cx, cy, r, lvl) {
  if (lvl <= 0) return;
  g.fillWhere((px, py, ix, iy) => Math.abs(Math.hypot(px - cx, py - cy) - r) < 0.8 && lvl > blue(ix + 5, iy + 11),
    ON, [cx - r - 2, cy - r - 2, 2 * r + 4, 2 * r + 4]);
}

// ------------------------------------------------------------ the hour: a bloom

// On the hour a bloom of young medusae rises from below: a couple of
// dozen tiny pulsing bells, each with a wisp of tentacles, swimming up
// past the digits.
const BLOOM = 22;

function drawBloom(g, sec, key) {
  for (let i = 0; i < BLOOM; i++) {
    const t = sec - 0.2 - 3 * noise(i, key % 997 + 60);
    if (t < 0) continue;
    const per = 0.65 + 0.35 * noise(i, 61), p = t / per, k = Math.floor(p), ph = p - k;
    const rise = (8 + 5 * noise(i, 62)) * (k + gained(ph));
    const y = H + 6 - rise;
    if (y < -12) continue;
    const x = 6 + 116 * noise(i, key % 991 + 63) + 3 * Math.sin(t * 0.7 + i);
    const c = contraction(ph), r = (2.2 + 1.3 * noise(i, 64)) * (1 - 0.2 * c), h = r * (1 + 0.25 * c);
    g.fillWhere((px, py) => {
      const q = ((px - x) / r) ** 2 + ((py - y) / h) ** 2;
      return py <= y + 0.6 && q <= 1 && q > 0.3;
    }, ON, [x - r - 1, y - h - 1, 2 * r + 2, h + 3]);
    for (let a = -1; a <= 1; a++)
      for (let d = 1; d < 6 + 2 * noise(i, 65 + a); d += 0.7) {
        const tx = x + a * r * 0.6 + Math.sin(d * 0.6 - t * 5 + a) * 0.6 * d * 0.25, ty = y + 0.5 + d;
        if (d < 4 || ((Math.floor(tx) + Math.floor(ty)) & 1)) g.pixel(tx, ty);
      }
  }
}

// ------------------------------------------------------------ depth of field

// Jellies pass behind the digits. Near the light organs the water is thinned
// out, as if the digits were in front and the jelly a little out of focus,
// so the time reads through any jelly: nothing of the jelly is kept right
// round a dot, and within a digit's box only a faint veil of it. Cached for the digits on show.
const veil = { key: null, keep: new Float32Array(W * H), box: [0, 0, 0, 0] };

function buildVeil(strs, ox, oy) {
  const key = strs.join('|') + ox + ',' + oy;
  if (veil.key === key) return veil;
  veil.keep.fill(1);
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  // Inside a digit's box the jelly is at most a faint veil.
  for (let k = 0; k < 4; k++)
    for (let y = Math.max(0, DY + oy - 2); y < Math.min(H, DY + oy + DH + 3); y++)
      for (let x = Math.max(0, DX[k] + ox - 2); x < Math.min(W, DX[k] + ox + DW + 3); x++) veil.keep[y * W + x] = 0.2;
  for (const str of strs)
    for (let k = 0; k < 4; k++)
      for (const o of DOTS[str[k]].dots) {
        const cx = DX[k] + ox + o.x + 1, cy = DY + oy + o.y + 1;
        x0 = Math.min(x0, DX[0] + ox - 2); x1 = Math.max(x1, DX[3] + ox + DW + 2);
        y0 = Math.min(y0, DY + oy - 2); y1 = Math.max(y1, DY + oy + DH + 2);
        for (let y = Math.max(0, Math.floor(cy - 7)); y < Math.min(H, cy + 7); y++)
          for (let x = Math.max(0, Math.floor(cx - 7)); x < Math.min(W, cx + 7); x++) {
            const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - 1;
            const kp = clamp((d - 0.9) * 0.2, 0, 1);
            if (kp < veil.keep[y * W + x]) veil.keep[y * W + x] = kp;
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
      }
  veil.key = key; veil.box = [x0, y0, x1, y1];
  return veil;
}

function thin(g, v) {
  const [x0, y0, x1, y1] = v.box;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const kp = v.keep[y * W + x];
      if (kp < 1 && g.buf[y * W + x] && blue(x + 3, y + 17) > kp) g.buf[y * W + x] = 0;
    }
}

// ------------------------------------------------------------ layout

const DX = [15, 38, 72, 95], DY = 14;
const DAY_CONTRAST = 0xcf, NIGHT_CONTRAST = 0x12;
const SHIMMER = { wave: 26, period: 2.4 };

export default {
  name: 'Jellyfish',
  blurb: 'Sea nettles row through black water behind digits of living light; each minute a flash rewrites them, each hour a bloom rises.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, ctx) {
    const { fields: f, date, oled } = ctx;
    const ms = date.getTime(), T = ms / 1000, sec = f.sec;
    const [ox, oy] = orbit(date, 2, 4);

    // The minute's event: e is seconds since :59, the turn at e = 1.
    let e = null, oldF = f, newF = f;
    if (sec >= EV0) { e = sec - EV0; newF = clockFields(new Date(ms + 60000)); }
    else if (sec < 1.6) { e = sec + 60 - EV0; oldF = previousMinute(date); }
    const src = e === null ? null : rippleSource(T - e);

    drawSnow(g, T);
    if (newF.m === 0 && e === null && sec < 20) drawBloom(g, sec, newF.minuteKey);
    if (e !== null && newF.m === 0) drawBloom(g, e - 1, newF.minuteKey);
    for (const J of jelliesAt(T)) {
      const flash = src && src.J && src.J.n === J.n ? 0.4 * Math.max(0, 1 - e / 0.8) ** 1.5 : 0;
      drawJelly(g, J, T, flash);
    }
    if (src) {
      drawRing(g, src.at[0], src.at[1], RING_V * e, 0.75 * (1 - e / 1.0));
      if (newF.m === 0) drawRing(g, src.at[0], src.at[1], RING_V * (e - 0.22), 0.6 * (1 - (e - 0.22) / 1.0));
    }

    const was = oldF.hh + oldF.mm, now = newF.hh + newF.mm;
    thin(g, buildVeil(was === now ? [now] : [was, now], ox, oy));
    for (let k = 0; k < 4; k++) {
      const x0 = DX[k] + ox, y0 = DY + oy;
      const changing = e !== null && was[k] !== now[k];
      const d = changing && e < 1 ? was[k] : now[k];
      for (const o of DOTS[d].dots) {
        const x = x0 + o.x, y = y0 + o.y;
        const sh = (((o.s + k * 9) / SHIMMER.wave - T / SHIMMER.period) % 1 + 1) % 1;
        let bright = sh < 0.1 ? 1 : 0;
        if (e !== null) {
          const hit = Math.min(HIT_MAX, Math.hypot(x + 1 - src.at[0], y + 1 - src.at[1]) / RING_V);
          if (changing && e < 1) {
            // Struck: flare, come loose, drift off dimming, gone before :00.
            const a = e - hit;
            if (a >= 0) {
              const life = Math.min(0.4, 0.96 - hit - 0.08) * (0.6 + 0.4 * noise(o.s + k, 66));
              if (a < 0.08) { organ(g, x, y, 1); continue; }
              const u = (a - 0.08) / life;
              if (u >= 1) continue;
              const dx = x + 1 - src.at[0], dy = y + 1 - src.at[1], l = Math.hypot(dx, dy) || 1;
              const push = 6 * (1 - Math.exp(-5 * (a - 0.08)));
              const px = x + (dx / l) * push, py = y + (dy / l) * push + 2 * u;
              if (u < 0.5) g.fillRect(Math.round(px), Math.round(py), 2, 2);
              else if (1 - u > blue(Math.round(px), Math.round(py)) * 0.5) g.pixel(px, py);
              continue;
            }
          } else if (changing) {
            // Written: each organ lights as the stroke reaches it, with a flare.
            const a = (e - 1) - o.s / WRITE_V;
            if (a < 0) continue;
            if (a < 0.12) bright = 1;
          } else if (e - hit >= 0 && e - hit < 0.12) bright = 1;     // the ring passing
        }
        organ(g, x, y, bright);
      }
    }
    for (const cy of [26, 37]) organ(g, 63 + ox, DY - 14 + cy + oy, 0);
    oled.contrast(DAY_CONTRAST + (NIGHT_CONTRAST - DAY_CONTRAST) * ctx.night);
  },
};
