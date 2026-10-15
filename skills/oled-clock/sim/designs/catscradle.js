// Cat's Cradle — the time is a string figure held between two hands.
//
// A pair of hands, palms out, fingers up, hold loops of string on their
// fingertips. Each numeral is ONE piece of that string pulled taut, so it
// is all straight runs and corners (a hexagonal 0, an 8 that is just the
// loop given a twist); its two ends run on, as fainter dotted free string,
// to the loops round two fingers. The hour hangs small at the top from the
// middle fingers like a tent; the minutes, large, are strung from index
// fingers and thumbs. Which way a numeral is strung and to which fingers
// is chosen once, on the hands at rest, so no free strand ever cuts across
// its own numeral and nothing flips while the hands sway.
//
// Always: the hands sway and, over minutes, drift and stretch apart, every
// string following them. A kitten peeks up from below, under the
// game; it watches what moves, blinks, and two or three times a minute
// bats the minute numerals with a paw, which sets that string ringing.
//
// The minute: the other player's thumb and index reach in from above,
// pinch the changing numeral in the middle of its string and lift it into
// a hanging bundle; the loops slide across from finger to finger; the
// pinch lets go and the string springs open as the new numeral,
// overshooting and ringing (0 to 3.2 s after :00; the old figure is only
// ever the old numeral or the bundle, never another digit).
//
// The hour: both of the other player's hands come in and take the whole
// figure, all numerals into two bundles, then pull it out into the classic
// cradle (top and bottom strings with the X between), the kitten jumps for
// it as it turns over, and it is handed back down as the new time.
//
// Every position is a function of the wall clock. Burn-in: the drift
// moves the hands, the figure and the kitten; 23:00-07:00 the panel dims.

import { clamp, ease, previousMinute, progress, dither, noise, sprite } from '../js/kit.js';

const SPECIMEN = false;
const W = 128, H = 64;
const N = 10;                       // points per numeral once resampled
const HAND_FILL = 0;                // the hands' body, as a sparse dither
const DOTS = true;                  // free string drawn dotted

// ------------------------------------------------------------ numerals
// Each numeral is ONE piece of string: a polyline in a unit box (x right,
// y down). The string is taut, so every stroke is straight; corners are
// where it bends round a crossing. Its two ends run on to fingertips.
const GLYPH = {
  0: [[0.5, 0], [1, 0.2], [1, 0.8], [0.5, 1], [0, 0.8], [0, 0.2], [0.5, 0]],
  1: [[0.1, 0.28], [0.62, 0], [0.62, 1]],
  2: [[0, 0.22], [0.5, 0], [1, 0.22], [1, 0.42], [0, 1], [1, 1]],
  3: [[0, 0], [1, 0], [0.38, 0.44], [1, 0.62], [1, 0.84], [0.5, 1], [0, 0.84]],
  4: [[0.76, 1], [0.76, 0], [0, 0.7], [1, 0.7]],
  5: [[1, 0], [0.04, 0], [0, 0.46], [0.55, 0.4], [1, 0.6], [1, 0.84], [0.5, 1], [0, 0.84]],
  6: [[0.9, 0], [0, 0.6], [0, 0.84], [0.5, 1], [1, 0.84], [1, 0.6], [0.5, 0.44], [0, 0.6]],
  7: [[0, 0], [1, 0], [0.3, 1]],
  8: [[0.5, 0], [0.92, 0.2], [0, 0.78], [0.5, 1], [1, 0.78], [0.08, 0.2], [0.5, 0]],
  9: [[0.5, 0.56], [0, 0.4], [0, 0.16], [0.5, 0], [1, 0.16], [1, 0.4], [0.1, 1]],
};

// ------------------------------------------------------------ raster

/** Set every pixel within r of any segment [ax,ay,bx,by] to c (1 lit, 0 clear). */
function paint(g, segs, r, c, dots = false) {
  if (!segs.length) return;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const s of segs) {
    x0 = Math.min(x0, s[0], s[2]); x1 = Math.max(x1, s[0], s[2]);
    y0 = Math.min(y0, s[1], s[3]); y1 = Math.max(y1, s[1], s[3]);
  }
  const X0 = Math.max(0, Math.floor(x0 - r - 1)), X1 = Math.min(W - 1, Math.ceil(x1 + r + 1));
  const Y0 = Math.max(0, Math.floor(y0 - r - 1)), Y1 = Math.min(H - 1, Math.ceil(y1 + r + 1));
  const r2 = r * r, buf = g.buf, n = segs.length;
  for (let y = Y0; y <= Y1; y++) {
    const py = y + 0.5;
    for (let x = X0; x <= X1; x++) {
      const px = x + 0.5;
      for (let i = 0; i < n; i++) {
        const s = segs[i];
        if (px < (s[0] < s[2] ? s[0] : s[2]) - r || px > (s[0] > s[2] ? s[0] : s[2]) + r ||
            py < (s[1] < s[3] ? s[1] : s[3]) - r || py > (s[1] > s[3] ? s[1] : s[3]) + r) continue;
        const dx = s[2] - s[0], dy = s[3] - s[1];
        const L2 = dx * dx + dy * dy;
        let u = L2 ? ((px - s[0]) * dx + (py - s[1]) * dy) / L2 : 0;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const ex = px - s[0] - u * dx, ey = py - s[1] - u * dy;
        if (ex * ex + ey * ey <= r2) {
          // dotted: every other pixel along the strand, so free string reads fainter than the numerals
          if (dots && ((u * Math.sqrt(L2) + 0.5) & 1)) continue;
          buf[y * W + x] = c; break;
        }
      }
    }
  }
}

/**
 * A union of capsules [ax,ay,bx,by,r]: lit outline, interior a sparse
 * dither (`fill`, 0 = black) so the hand has a little body behind the string.
 */
function capsules(g, caps, fill = 0) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const c of caps) {
    x0 = Math.min(x0, c[0] - c[4], c[2] - c[4]); x1 = Math.max(x1, c[0] + c[4], c[2] + c[4]);
    y0 = Math.min(y0, c[1] - c[4], c[3] - c[4]); y1 = Math.max(y1, c[1] + c[4], c[3] + c[4]);
  }
  const X0 = Math.max(0, Math.floor(x0 - 1)), X1 = Math.min(W - 1, Math.ceil(x1 + 1));
  const Y0 = Math.max(0, Math.floor(y0 - 1)), Y1 = Math.min(H - 1, Math.ceil(y1 + 1));
  for (let y = Y0; y <= Y1; y++)
    for (let x = X0; x <= X1; x++) {
      const px = x + 0.5, py = y + 0.5;
      let d = 1e9;
      for (const c of caps) {
        const dx = c[2] - c[0], dy = c[3] - c[1], L2 = dx * dx + dy * dy;
        let u = L2 ? ((px - c[0]) * dx + (py - c[1]) * dy) / L2 : 0;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const ex = px - c[0] - u * dx, ey = py - c[1] - u * dy;
        const e = Math.sqrt(ex * ex + ey * ey) - c[4];
        if (e < d) d = e;
      }
      if (d <= 0.5) g.buf[y * W + x] = d > -0.5 ? 1 : (d < -1.5 && dither(x, y, fill)) ? 1 : 0;
    }
}

const polySegs = (p) => {
  const out = [];
  for (let i = 1; i < p.length; i++) out.push([p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]]);
  return out;
};

// ------------------------------------------------------------ hands
// The near player's hands, palms out, fingers up. Capsules for the left
// hand in screen coordinates; the right hand is its mirror.
const HAND = [
  { pts: [[10, 57], [16, 63]], r: 10 },                 // palm
  { pts: [[6, 50], [2.5, 36]], r: 2.4 },                // little
  { pts: [[10, 48], [8.5, 28]], r: 2.6 },               // ring
  { pts: [[14.5, 47], [15, 24]], r: 2.7 },              // middle
  { pts: [[19, 48], [22, 29]], r: 2.6 },                // index
  { pts: [[22, 58], [28, 50], [32, 44]], r: 2.8 },      // thumb
];
const LITTLE = 0, RING = 1, MIDDLE = 2, INDEX = 3, THUMB = 4;

/** Capsules and fingertips of one near hand, swayed by (dx, dy). */
function nearHand(mirror, dx, dy, flex) {
  const X = (x) => (mirror ? W - x - dx : x + dx);
  const caps = [], tips = [], bands = [];
  HAND.forEach((p, k) => {
    const pts = p.pts.map(([x, y], i) => {
      // fingers bend a little towards the figure when flexing
      const f = k > 0 && i === p.pts.length - 1 ? flex[k - 1] : 0;
      return [X(x + f * 1.5), y + dy + f * 1.2];
    });
    for (let i = 1; i < pts.length; i++) caps.push([...pts[i - 1], ...pts[i], p.r]);
    if (k > 0) {
      // the loop sits just below the fingertip, across the finger
      const [bx, by] = pts[pts.length - 2], [tx, ty] = pts[pts.length - 1];
      const l = Math.hypot(tx - bx, ty - by), ux = (tx - bx) / l, uy = (ty - by) / l;
      const at = [tx - ux * 2.4, ty - uy * 2.4], w = p.r + 0.9;
      tips.push(at);
      bands.push([at[0] - uy * w, at[1] + ux * w, at[0] + uy * w, at[1] - ux * w]);
    }
  });
  return { caps, tips, bands };
}

/** The other player's hand reaching in to pinch at P, its arm from `from`. */
function pinchHand(P, from, open) {
  const ax = P[0] - from[0], ay = P[1] - from[1], L = Math.hypot(ax, ay) || 1;
  const ux = ax / L, uy = ay / L, nx = -uy, ny = ux;
  const at = (s, n) => [P[0] - ux * s + nx * n, P[1] - uy * s + ny * n];
  // two long fingers, thumb and index, the hand itself above the glass
  return {
    caps: [
      [...at(34, -7), ...at(0.8, -1 - open), 2.3],     // index
      [...at(30, 9), ...at(0.8, 1 + open), 2.6],       // thumb
    ],
    nails: [
      [...at(2.2, -1.9 - open), ...at(4.6, -2.3 - open), 0.9],
      [...at(2.2, 2.1 + open), ...at(4.8, 2.6 + open), 1.0],
    ],
  };
}

// ------------------------------------------------------------ figure

const place = (d, x, y, w, h) => GLYPH[d].map(([u, v]) => [x + u * w, y + v * h]);

/** Insert midpoints on the longest segments until the polyline has n points. */
function resample(p, n) {
  p = p.map((q) => [...q]);
  while (p.length < n) {
    let k = 1, best = -1;
    for (let i = 1; i < p.length; i++) {
      const L = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      if (L > best) { best = L; k = i; }
    }
    p.splice(k, 0, [(p[k - 1][0] + p[k][0]) / 2, (p[k - 1][1] + p[k][1]) / 2]);
  }
  return p;
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const centre = (p) => {
  let x = 0, y = 0;
  for (const q of p) { x += q[0]; y += q[1]; }
  return [x / p.length, y / p.length];
};

/**
 * Hang one numeral between two fingertips: pick the winding and the pair of
 * fingers that leave the least free string. Returns the resampled points
 * and the two fingertips its ends run to.
 */
function hang(fg, tipsL, tipsR) {
  const key = `${fg.key}`;
  let ch = HANG.get(key);
  if (!ch) HANG.set(key, ch = chooseHang(fg.rest, fg));
  const w = ch.reverse ? [...fg.p].reverse() : fg.p;
  const ring = ch.rot ? [...w.slice(ch.rot, -1), ...w.slice(0, ch.rot + 1)] : w;
  const T = (side, i) => (side === 'L' ? tipsL : tipsR)[i];
  return { pts: resample(ring, N), a: T(...ch.a), b: T(...ch.b), r: fg.r, slot: fg.slot };
}

const HANG = new Map();
const REST_L = nearHand(false, 0, 0, [0, 0, 0, 0, 0]).tips, REST_R = nearHand(true, 0, 0, [0, 0, 0, 0, 0]).tips;

/** Do segments ab and cd cross (not merely touch at an end)? */
function crosses(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return d1 * d2 < -1e-6 && d3 * d4 < -1e-6;
}

/**
 * Which way to string a numeral and to which two fingers, decided once on
 * the hands at rest: the least free string, and never a free strand across
 * the numeral itself (it would read as another stroke).
 */
function chooseHang(p, fg) {
  const closed = dist(p[0], p[p.length - 1]) < 1e-6;
  const opts = [];
  for (const reverse of [false, true]) {
    const w = reverse ? [...p].reverse() : p;
    const rots = closed ? [...Array(p.length - 1).keys()] : [0];
    for (const rot of rots) opts.push({ reverse, rot, w: rot ? [...w.slice(rot, -1), ...w.slice(0, rot + 1)] : w });
  }
  const pairs = [];
  for (const i of fg.fingers) for (const j of fg.fingers) {
    if (fg.side === 'both') pairs.push([['L', i], ['R', j]], [['R', j], ['L', i]]);
    else if (i !== j) pairs.push([[fg.side, i], [fg.side, j]]);
  }
  const tip = ([s, i]) => (s === 'L' ? REST_L : REST_R)[i];
  let best = null, bl = 1e9;
  for (const o of opts) for (const [A, B] of pairs) {
    const w = o.w, a = tip(A), b = tip(B);
    let cost = dist(a, w[0]) + dist(w[w.length - 1], b);
    for (const [e, f] of [[a, w[0]], [w[w.length - 1], b]])
      for (let k = 1; k < w.length; k++) if (crosses(e, f, w[k - 1], w[k])) cost += 200;
    if (crosses(a, w[0], w[w.length - 1], b)) cost += 40;
    if (cost < bl) { bl = cost; best = { reverse: o.reverse, rot: o.rot, a: A, b: B }; }
  }
  return best;
}

// ------------------------------------------------------------ layout

const HOUR = { y: 3, w: 9, h: 14, gap: 4, r: 0.75 };
const MIN = { y: 21, w: 21, h: 28, r: 1.1, x: [38, 69] };

/** The figure for a time: the hour small at the top, the minutes below. */
function layout(fl, L, R, off) {
  const h12 = String(fl.h12), out = [];
  const x0 = 64 - (h12.length * HOUR.w + (h12.length - 1) * HOUR.gap) / 2;
  [...h12].forEach((c, i) => out.push(hang({
    p: place(+c, x0 + i * (HOUR.w + HOUR.gap) + off[0], HOUR.y + off[1] * 0.5, HOUR.w, HOUR.h), r: HOUR.r, slot: 'h',
    rest: place(+c, x0 + i * (HOUR.w + HOUR.gap), HOUR.y, HOUR.w, HOUR.h), key: `h${h12}${i}`,
    side: h12.length === 1 ? 'both' : i ? 'R' : 'L', fingers: [MIDDLE, INDEX],
  }, L.tips, R.tips)));
  for (let k = 0; k < 2; k++) out.push(hang({
    p: place(+fl.mm[k], MIN.x[k] + off[0], MIN.y + off[1], MIN.w, MIN.h), r: MIN.r, slot: 'm' + k,
    rest: place(+fl.mm[k], MIN.x[k], MIN.y, MIN.w, MIN.h), key: `m${k}${fl.mm[k]}`,
    side: k ? 'R' : 'L', fingers: [INDEX, THUMB],
  }, L.tips, R.tips));
  return out;
}

// ------------------------------------------------------------ motion

const lerp2 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
const smooth = (u) => u * u * (3 - 2 * u);
/** A released string settling: overshoots, rings, comes to rest at 1. */
const spring = (u) => (u >= 1 ? 1 : 1 - Math.exp(-5 * u) * Math.cos(8.5 * u) * (1 - u));
const MID = (N - 1) / 2;
/** 0 at the middle of a numeral's string, 1 at its ends. */
const fromMid = (i) => Math.abs(i - MID) / MID;

/** A numeral's string gathered up by a pinch at P: a narrow hanging V. */
function bundle(P) {
  const out = [];
  for (let i = 0; i < N; i++) {
    const v = fromMid(i), s = i < MID ? -1 : 1;
    out.push([P[0] + s * (0.4 + 1.1 * v), P[1] + 1.5 + 7.5 * v]);
  }
  return out;
}

/** The cradle: top and bottom strings with the X between, as one closed path. */
function cradle(QL, QR, half, flip, right) {
  const cy = (QL[1] + QR[1]) / 2 + half * 0.3;
  const y = (s) => cy + s * half * flip;
  // a numeral from the right-hand side is strung starting at the right
  const path = right
    ? [[QR[0], y(-1)], [QL[0], y(-1)], [QR[0], y(1)], [QL[0], y(1)], [QR[0], y(-1)]]
    : [[QL[0], y(-1)], [QR[0], y(-1)], [QL[0], y(1)], [QR[0], y(1)], [QL[0], y(-1)]];
  const lens = polySegs(path).map((s) => Math.hypot(s[2] - s[0], s[3] - s[1]));
  const total = lens.reduce((a, b) => a + b, 0), out = [];
  for (let i = 0; i < N; i++) {
    let d = (i / (N - 1)) * total, k = 0;
    while (k < lens.length - 1 && d > lens[k]) { d -= lens[k]; k++; }
    out.push(lerp2(path[k], path[k + 1], lens[k] ? d / lens[k] : 0));
  }
  return out;
}

/** Points staggered from the middle of the string outwards (the pinched part goes first). */
function stagger(A, B, tau, t0, t1, fn, spread = 0.18) {
  return A.map((p, i) => {
    const d = fromMid(i) * spread;
    return lerp2(p, B[i], fn(progress(tau, t0 + d, t1 + d)));
  });
}

// The minute turn, in seconds after :00. A hand of the other player
// reaches in, pinches the numeral in the middle of its string and lifts it
// off into a bundle; the loops slide from finger to finger; the pinch
// lets go and the string springs open as the new numeral, ringing.
const MT = { arrive: [0, 0.45], gather: [0.38, 1.0], pass: [1.0, 1.35], spread: [1.35, 2.25], leave: [1.4, 2.2], ring: 1.6, end: 3.2 };
// The hour: both of the other player's hands take the whole figure off,
// pull it out into the cradle, turn it over and give it back as the new time.
const HT = { arrive: [0, 0.6], gather: [0.45, 1.25], pull: [1.25, 2.1], flip: [2.2, 2.75], spread: [2.8, 3.8], leave: [2.9, 3.7], ring: 3.0, end: 5.0 };

/** A pinch hand's tip: in from `far`, holding at the pinch, back out to `far`. */
function reach(far, P, tau, arrive, leave) {
  const u = ease.outCubic(progress(tau, arrive[0], arrive[1]));
  const v = ease.inCubic(progress(tau, leave[0], leave[1]));
  return lerp2(lerp2(far, P, u), far, v);
}

/** Everything moving at `tau` seconds into the minute: figures and visiting hands. */
function scene(f, prev, tau, L, R, off) {
  const now = layout(f, L, R, off);
  const hourTurn = prev.h12 !== f.h12;
  const pinches = [];
  if (hourTurn && tau < HT.end) {
    const old = layout(prev, L, R, off);
    const lift = smooth(progress(tau, HT.gather[0], HT.gather[1]));
    const pull = ease.inOutCubic(progress(tau, HT.pull[0], HT.pull[1]));
    const QL = lerp2([46, 22 - 6 * lift], [22, 12], pull), QR = lerp2([82, 22 - 6 * lift], [106, 12], pull);
    const flipU = progress(tau, HT.flip[0], HT.flip[1]);
    const flip = Math.cos(Math.PI * ease.inOutCubic(flipU));
    const half = 4 + 4 * pull;
    const crL = cradle(QL, QR, half, flip, false), crR = cradle(QL, QR, half, flip, true);
    const crFor = (fg) => (centre(fg.pts)[0] < 64 ? crL : crR);
    const ends = smooth(progress(tau, HT.flip[0], HT.flip[1] + 0.1));
    let figs;
    if (tau < HT.flip[0]) {
      figs = old.map((o) => {
        const Q = centre(o.pts)[0] < 64 ? QL : QR;
        const B = stagger(o.pts, bundle(Q), tau, HT.gather[0], HT.gather[1] - 0.18, ease.inOutCubic);
        return { ...o, pts: stagger(B, crFor(o), tau, HT.pull[0], HT.pull[1] - 0.18, ease.inOutCubic) };
      });
    } else {
      figs = now.map((n, k) => {
        const o = old[Math.min(k, old.length - 1)];
        return {
          ...n, a: lerp2(o.a, n.a, ends), b: lerp2(o.b, n.b, ends),
          pts: stagger(crFor(o), n.pts, tau, HT.spread[0], HT.spread[1] - 0.18, spring),
        };
      });
    }
    const amp = tau > HT.ring ? 1.6 * Math.exp(-2.2 * (tau - HT.ring)) * smooth(progress(tau, HT.ring, HT.ring + 0.2)) : 0;
    const pullAmp = 0.8 * Math.sin(Math.PI * progress(tau, HT.pull[1] - 0.2, HT.flip[0] + 0.2));
    // stretched out in the cradle the string is one strand, thin
    const thin = smooth(progress(tau, HT.pull[0], HT.pull[1])) * (1 - smooth(progress(tau, HT.spread[0] + 0.2, HT.spread[1])));
    for (const fg of figs) { fg.amp = Math.max(amp, pullAmp); fg.r = fg.r + (0.55 - fg.r) * thin; }
    pinches.push({ tip: reach([-4, -16], QL, tau, HT.arrive, HT.leave), from: [-24, -40], open: 1 - smooth(progress(tau, HT.arrive[1] - 0.15, HT.arrive[1])) + smooth(progress(tau, HT.leave[0] - 0.1, HT.leave[0] + 0.1)) });
    pinches.push({ tip: reach([132, -16], QR, tau, HT.arrive, HT.leave), from: [152, -40], open: pinches[0].open });
    return { figs, pinches, hour: true };
  }
  if (tau >= MT.end) return { figs: now.map((n) => ({ ...n, amp: 0 })), pinches };
  const old = layout(prev, L, R, off);
  const figs = now.map((n, k) => {
    const o = old[old.length - now.length + k] ?? n;
    if (n.slot === 'h' || prev.mm[+n.slot[1]] === f.mm[+n.slot[1]]) return { ...n, amp: 0 };
    const side = n.slot === 'm0' ? -1 : 1;
    const C = [MIN.x[+n.slot[1]] + MIN.w / 2 + off[0], MIN.y + 2 + off[1]];
    const lift = smooth(progress(tau, MT.gather[0], MT.gather[1]));
    const sway = 2.5 * side * Math.sin(Math.PI * progress(tau, MT.pass[0] - 0.1, MT.spread[0] + 0.1));
    const P = [C[0] + sway, C[1] - 7 * lift];
    const B = bundle(P);
    const ends = smooth(progress(tau, MT.pass[0], MT.pass[1]));
    const fig = tau < MT.pass[1]
      ? { ...o, pts: stagger(o.pts, B, tau, MT.gather[0], MT.gather[1] - 0.18, ease.inOutCubic) }
      : { ...n, pts: stagger(B, n.pts, tau, MT.spread[0], MT.spread[1] - 0.18, spring) };
    fig.a = lerp2(o.a, n.a, ends); fig.b = lerp2(o.b, n.b, ends);
    fig.amp = tau > MT.ring ? 1.3 * Math.exp(-2.6 * (tau - MT.ring)) * smooth(progress(tau, MT.ring, MT.ring + 0.15)) : 0;
    const far = [C[0] + side * 30, -14];
    const open = 1 - smooth(progress(tau, MT.arrive[1] - 0.12, MT.arrive[1])) + smooth(progress(tau, MT.spread[0] - 0.05, MT.spread[0] + 0.12));
    pinches.push({ tip: reach(far, P, tau, MT.arrive, MT.leave), from: [C[0] + side * 52, -30], open });
    return fig;
  });
  return { figs, pinches };
}

/** Segments of a polyline whose spans bow sideways by `amp`, ringing at time t. */
function bowed(pts, amp, t, seed) {
  if (amp < 0.05) return polySegs(pts);
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const L = Math.hypot(bx - ax, by - ay);
    if (L < 2) { out.push([ax, ay, bx, by]); continue; }
    const nx = -(by - ay) / L, ny = (bx - ax) / L;
    const a = amp * Math.min(1, L / 12) * Math.sin(t * 38 + i * 1.7 + seed);
    let px = ax, py = ay;
    for (let k = 1; k <= 4; k++) {
      const s = k / 4, b = a * Math.sin(Math.PI * s);
      const qx = ax + (bx - ax) * s + nx * b, qy = ay + (by - ay) * s + ny * b;
      out.push([px, py, qx, qy]); px = qx; py = qy;
    }
  }
  return out;
}

function render(g, sc, L, R, t) {
  capsules(g, L.caps, HAND_FILL); capsules(g, R.caps, HAND_FILL);
  const strands = [], cords = [], knots = [];
  // a loop round every finger that holds string
  const held = new Set();
  for (const fg of sc.figs) for (const e of [fg.a, fg.b])
    [L, R].forEach((hd, s) => hd.tips.forEach((tp, i) => { if (dist(tp, e) < 1.5) held.add(s * 5 + i); }));
  for (const k of held) strands.push((k < 5 ? L : R).bands[k % 5]);
  sc.figs.forEach((fg, k) => {
    const p = fg.pts;
    strands.push(...bowed([fg.a, p[0]], fg.amp, t, k * 3), ...bowed([p[p.length - 1], fg.b], fg.amp, t, k * 3 + 1));
    cords.push([bowed(p, fg.amp, t, k * 5), fg.r]);
    knots.push(p[0], p[p.length - 1]);
  });
  paint(g, strands, 1.4, 0);
  paint(g, strands, 0.55, 1, DOTS);
  for (const [s, r] of cords) { paint(g, s, r + 1, 0); paint(g, s, r, 1); }
  for (const k of knots) paint(g, [[...k, ...k]], 1.5, 1);
  for (const pc of sc.pinches) {
    const hd = pinchHand(pc.tip, pc.from, 1.6 * clamp(pc.open, 0, 1));
    capsules(g, hd.caps);
    for (const n of hd.nails) capsules(g, [n]);
  }
}

export default {
  name: "Cat's Cradle",
  blurb: 'The time is a string figure between two hands: a pinch lifts each minute off and it springs open anew; the hour is the whole cradle, turned over.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',
  frame(g, ctx) {
    const f = ctx.fields;
    if (SPECIMEN) return specimen(g);
    // every motion is a function of the wall clock (seconds into the day)
    const t = f.h * 3600 + f.m * 60 + f.sec;
    ctx.oled.contrast(0xcf + (0x20 - 0xcf) * ctx.night);   // night dimming, 23:00-07:00
    const sway = (k) => Math.sin(t * (0.9 + k * 0.17) + k * 2);
    // the player shifts and stretches over minutes (spreads the wear too)
    const gx = 2.5 * Math.sin(t * 2 * Math.PI / 431), gy = 1.5 * Math.sin(t * 2 * Math.PI / 617);
    const spread = 1.5 * Math.sin(t * 2 * Math.PI / 293);
    const flex = [0, 0, 0, 0, 0];
    const L = nearHand(false, gx - spread + 0.7 * sway(0), gy + 0.6 * sway(1), flex);
    const R = nearHand(true, -(gx + spread) + 0.7 * sway(2), gy + 0.6 * sway(3), flex);
    const sc = scene(f, previousMinute(ctx.date), f.sec, L, R, [gx, gy]);
    const cat = kitten(f, sc, 7 * Math.sin(t * 2 * Math.PI / 353), Math.sin(t * 2 * Math.PI / 211) > 0.3 ? 1 : 0);
    render(g, sc, L, R, t);
    drawKitten(g, cat);
  },
};

// ------------------------------------------------------------ the kitten
// Sitting under the game, only its head showing: it watches whatever
// is moving, blinks, and now and then bats the minutes with a paw, which
// sets the string ringing.

const HEAD = sprite(`
  .#...................#.
  .##.................##.
  .#.#...............#.#.
  .#..#.............#..#.
  .#...#############...#.
  #.....................#
  #.....................#
  #.....................#
  #.....................#
  #.....................#
  #.....................#
`);
const CAT = { x: 52.5, y: 53 };
const EYES = [[7, 7], [15, 7]];
const EYE = sprite(`
  .###.
  #####
  #####
  .###.
`);

/** Swat times this minute: two or three, kept clear of the minute turn. */
function swats(minuteKey) {
  const out = [];
  for (let k = 0; k < 3; k++) {
    const s = 8 + k * 17 + noise(minuteKey * 3 + k, 7) * 9;
    if (noise(minuteKey * 5 + k, 3) < 0.8) out.push({ s, paw: (minuteKey + k) & 1 });
  }
  return out;
}
const SWAT = 0.75;                  // seconds a swat takes, up and down

function kitten(f, sc, cx, cy) {
  const sec = f.sec;
  // what it looks at: a visiting hand if there is one, else the minutes
  let look = [CAT.x + 11.5 + 9 * Math.sin(f.sec * 0.4), 34];
  if (sc.pinches.length) look = sc.pinches[sc.pinches.length - 1].tip;
  let paw = null;
  for (const sw of swats(f.minuteKey)) {
    const u = (sec - sw.s) / SWAT;
    if (u >= 0 && u < 1) {
      paw = { side: sw.paw, lift: Math.sin(Math.PI * u) ** 0.7 };
      look = [sw.paw ? 76 : 46, 50];
    }
    // the string it hit rings for a while after
    const since = sec - sw.s - SWAT * 0.5;
    if (since > 0 && since < 2.5) {
      const fig = sc.figs.find((fg) => fg.slot === (sw.paw ? 'm1' : 'm0'));
      if (fig) fig.amp = Math.max(fig.amp, 1.1 * Math.exp(-2.2 * since));
    }
  }
  const blink = (sec % 4.3) < 0.14 || (sec % 7.1) < 0.12;
  // on the hour it jumps up at the cradle as it turns over
  let hop = 0;
  if (sc.hour) {
    hop = Math.sin(Math.PI * progress(sec, HT.flip[0] - 0.35, HT.flip[1] + 0.25)) ** 0.8;
    if (hop > 0) paw = { side: 2, lift: hop };
  }
  return { look, paw, blink: blink && !hop, hop, cx, cy };
}

function drawKitten(g, cat) {
  const x = Math.round(CAT.x + cat.cx), y = Math.round(CAT.y + cat.cy - 6 * cat.hop);
  g.fillRect(x, y + 4, HEAD.w, H - y, 0);
  g.blit(HEAD, x, y);
  for (const [ex, ey] of EYES) {
    const ox = x + ex - 2, oy = y + ey - 2;
    if (cat.blink) { g.hline(ox, oy + 2, 5); g.pixel(ox, oy + 1); g.pixel(ox + 4, oy + 1); continue; }
    g.blit(EYE, ox, oy);
    // the pupil: a 1x2 slit, one of three columns, high or level
    const dx = cat.look[0] - (ox + 2), dy = cat.look[1] - (oy + 2);
    const c = 2 + (dx > 5 ? 1 : dx < -5 ? -1 : 0), r = dy < -4 ? 0 : 1;
    g.pixel(ox + c, oy + r, 0); g.pixel(ox + c, oy + r + 1, 0);
  }
  // nose and whiskers
  g.hline(x + 10, y + 10, 3); g.pixel(x + 11, y + 11);
  g.line(x - 2, y + 8, x - 6, y + 7); g.line(x - 2, y + 10, x - 6, y + 11);
  g.line(x + HEAD.w + 1, y + 8, x + HEAD.w + 5, y + 7); g.line(x + HEAD.w + 1, y + 10, x + HEAD.w + 5, y + 11);
  if (cat.paw) for (const side of cat.paw.side === 2 ? [0, 1] : [cat.paw.side]) {
    const px = side ? x + 19 : x + 4, py = H + 2 - cat.paw.lift * 16;
    capsules(g, [[px, H + 6, px + (side ? 1.5 : -1.5), py, 3]]);
    // toe beans
    const tx = px + (side ? 1.5 : -1.5);
    g.pixel(Math.round(tx - 1.5), Math.round(py - 0.5)); g.pixel(Math.round(tx), Math.round(py - 1.5)); g.pixel(Math.round(tx + 1.5), Math.round(py - 0.5));
  }
}

/** All ten numerals, strung as in the face: cord, end knots, and the free string leaving. */
function specimen(g) {
  for (let d = 0; d < 10; d++) {
    const x = 5 + (d % 5) * 25, y = 3 + Math.floor(d / 5) * 32;
    const p = place(d, x + 1, y + 2, 18, 26);
    const ends = [];
    for (const [e, f] of [[p[0], p[1]], [p[p.length - 1], p[p.length - 2]]]) {
      const l = dist(e, f) || 1;
      ends.push([e[0], e[1], e[0] + (e[0] - f[0]) / l * 4, e[1] + (e[1] - f[1]) / l * 4]);
    }
    paint(g, ends, 0.55, 1, true);
    paint(g, polySegs(p), 2.1, 0);
    paint(g, polySegs(p), 1.1, 1);
    for (const e of [p[0], p[p.length - 1]]) paint(g, [[...e, ...e]], 1.5, 1);
  }
}
