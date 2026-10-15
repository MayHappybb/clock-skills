// Contour — after Apple Watch's Contour face (and its Metropolitan and
// Typograph faces, whose numerals change weight and width).
//
// On the watch (studied from Apple's own image of it, TDC 2022) the twelve
// numerals are a custom variable face packed into a band round the edge of
// the display: far hours are monoline hairlines, condensed on the sides and
// extended across the top, and the numerals near the current hour swell
// towards black, bulging in from the edge.
//
// Here the band is a rounded rectangle round the 128x64 glass, and the
// numerals sit where a dial's would on a 2:1 rectangle: 10, 11, 12, 1, 2
// across the top, 3 and 9 alone on the short sides, 4 to 8 along the
// bottom. Every numeral has a focus, 0..1, and every axis follows it: its
// weight (a 1 px hairline to a black that keeps its counters open), its depth
// into the band, and its share of the run's length, so a swelling numeral
// shoulders its neighbours along the edge. The current hour is always at
// full focus and everything else is held at least 0.25 below it, so the
// hour is the one big black numeral at a glance; the minutes stand in the
// middle in the same face, as large as the free space allows.
//
// The typeface is drawn here: each digit a few polylines in a unit box,
// swept by a round brush. Fillets are applied in pixels after the box is
// sized, so a tall digit keeps straight sides and round ends and a wide one
// straight top and bottom (out/contour-digits.png shows the axes). Every
// point is then carried through the band's (along, depth) coordinates, so
// the numerals hug the edge and the end ones bend round the corners (only as
// far as their depth allows: deeper than the corner radius would pinch).
//
// The seconds: a comet rides the band's inner contour once round a minute
// from 12, and each numeral it passes turns bolder for a moment, a wave of
// weight flowing numeral to numeral.
// The minute: a weight ripple runs both ways round from the hour; the
// minute digit that changes thins to a hairline and narrows over the last
// half second, and the new one swells back from there at :00.
// The hour: in the last second the hour lets go a little and the next one
// tenses; exactly at :00 they swap (the new hour pops to black with an
// overshoot, the old one deflates), then a wave of weight runs once round
// the whole dial clockwise from the new hour, every numeral rising and
// jostling its neighbours as it passes, the minutes squeezed as it goes by.
//
// Everything is a function of fields (h12, m, sec); nothing is remembered.
// Burn-in: hairlines are thin and move as the swelling hour reflows each run;
// the whole face walks a 1 px orbit (the band starts 1 px in so nothing is
// pushed off the glass). Night (ctx.night) dims through oled.contrast().

import { clamp, lerp, progress, orbit, ease, dither, ON } from '../js/kit.js';

const W = 128, H = 64;

// ------------------------------------------------------------ the typeface
//
// One variable family, drawn as a centre-line swept by a round brush, with
// two axes: weight (the brush diameter, a 1 px hairline to a black) and
// width (the box the centre-line is fitted to). Each digit is a few
// polylines in a unit box, x right and y down; every vertex carries a
// fillet, as a fraction of the box's shorter side. The fillets are applied
// after the box is sized, in pixels, so a digit stretched tall keeps round
// ends and straight sides (a condensed grotesque) and one stretched wide
// keeps straight top and bottom (an extended one), the way a real variable
// face's masters differ, instead of its curves turning into ellipses.

const P = (u, v, f = 0) => [u, v, f];
const SKEL = {
  0: [{ closed: true, pts: [P(0, 0, 0.5), P(1, 0, 0.5), P(1, 1, 0.5), P(0, 1, 0.5)] }],
  1: [{ pts: [P(0, 0.3), P(1, 0, 0), P(1, 1)] }],
  2: [{ pts: [P(0, 0.24), P(0, 0, 0.5), P(1, 0, 0.5), P(1, 0.38, 0.5), P(0, 0.72, 0.3), P(0, 1, 0), P(1, 1)] }],
  3: [
    { pts: [P(0, 0.2), P(0, 0, 0.42), P(1, 0, 0.5), P(1, 0.47, 0.42), P(0.3, 0.47)] },
    { pts: [P(0.3, 0.47), P(1, 0.47, 0.5), P(1, 1, 0.5), P(0, 1, 0.42), P(0, 0.8)] },
  ],
  4: [{ pts: [P(0.74, 1), P(0.74, 0, 0), P(0, 0.68, 0), P(1, 0.68)] }],
  5: [{ pts: [P(1, 0), P(0, 0, 0), P(0, 0.44, 0), P(1, 0.44, 0.5), P(1, 1, 0.5), P(0, 1, 0.4), P(0, 0.82)] }],
  6: [{ pts: [P(1, 0.16), P(1, 0, 0.5), P(0, 0, 0.5), P(0, 1, 0.5), P(1, 1, 0.5), P(1, 0.44, 0.5), P(0, 0.44, 0.5), P(0, 0.6)] }],
  7: [{ pts: [P(0, 0), P(1, 0, 0), P(0.32, 1)] }],
  8: [
    { closed: true, pts: [P(0.07, 0, 0.5), P(0.93, 0, 0.5), P(0.93, 0.46, 0.5), P(0.07, 0.46, 0.5)] },
    { closed: true, pts: [P(0, 0.46, 0.5), P(1, 0.46, 0.5), P(1, 1, 0.5), P(0, 1, 0.5)] },
  ],
};
// 9 is 6 turned half a turn.
SKEL[9] = SKEL[6].map((s) => ({ ...s, pts: s.pts.map(([u, v, f]) => [1 - u, 1 - v, f]) }));

/** How wide each digit sets, relative to the others. */
const ADV = { 1: 0.5 };
const adv = (d) => ADV[d] ?? 1;

/**
 * A digit's centre-line in pixels, fitted to the box (x, y, w, h) with the
 * brush radius r inset, fillets applied, flattened to points about `step`
 * apart. Returns a list of polylines.
 */
function digitPaths(d, x, y, w, h, r, step = 0.7) {
  const iw = Math.max(0.01, w - 2 * r), ih = Math.max(0.01, h - 2 * r);
  const m = Math.min(iw, ih);
  const out = [];
  for (const st of SKEL[d]) {
    const pts = st.pts.map(([u, v, f]) => [x + r + u * iw, y + r + v * ih, f * m]);
    out.push(flatten(pts, !!st.closed, step));
  }
  return out;
}

/** A polyline with each vertex rounded by a quadratic Bezier of tangent length f, sampled evenly. */
function flatten(pts, closed, step) {
  const n = pts.length, dense = [];
  const seg = (i) => pts[(i + n) % n];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const end = !closed && (i === 0 || i === n - 1);
    if (end || p[2] <= 0) { dense.push([p[0], p[1]]); continue; }
    const a = seg(i - 1), b = seg(i + 1);
    const la = Math.hypot(p[0] - a[0], p[1] - a[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    // Tangent length: the fillet, but never more than the half of a segment
    // shared with another fillet (all of it towards a free end).
    const ka = !closed && i - 1 === 0 ? 0.98 : 0.5, kb = !closed && i + 1 === n - 1 ? 0.98 : 0.5;
    const t = Math.min(p[2], la * ka, lb * kb);
    const A = [p[0] + ((a[0] - p[0]) * t) / (la || 1), p[1] + ((a[1] - p[1]) * t) / (la || 1)];
    const B = [p[0] + ((b[0] - p[0]) * t) / (lb || 1), p[1] + ((b[1] - p[1]) * t) / (lb || 1)];
    for (let k = 0; k <= 6; k++) {
      const u = k / 6, q = 1 - u;
      dense.push([q * q * A[0] + 2 * q * u * p[0] + u * u * B[0], q * q * A[1] + 2 * q * u * p[1] + u * u * B[1]]);
    }
  }
  if (closed) dense.push(dense[0]);
  // Resample by arc length.
  const out = [dense[0]];
  let acc = 0;
  for (let i = 1; i < dense.length; i++) {
    const [x0, y0] = dense[i - 1], [x1, y1] = dense[i];
    const L = Math.hypot(x1 - x0, y1 - y0);
    let s = step - acc;
    while (s <= L) { out.push([x0 + ((x1 - x0) * s) / L, y0 + ((y1 - y0) * s) / L]); s += step; }
    acc = L - (s - step);
  }
  out.push(dense[dense.length - 1]);
  return out;
}

/** Sweep a round brush of radius r along screen-space points. */
function brush(g, pts, r, c = ON) {
  const rr = r * r;
  for (const [x, y] of pts) {
    g.pixel(x + 0.002, y + 0.002, c);   // nudge: a line exactly on a pixel boundary must not flicker between rows
    if (r < 0.75) continue;              // under 1.5 px the brush is a hairline
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r), y0 = Math.floor(y - r), y1 = Math.floor(y + r);
    for (let py = y0; py <= y1; py++)
      for (let px = x0; px <= x1; px++) {
        const dx = px + 0.5 - x, dy = py + 0.5 - y;
        if (dx * dx + dy * dy <= rr) g.pixel(px, py, c);
      }
  }
}

// ------------------------------------------------------------ the contour
//
// The band runs round the edge of the glass, a rounded rectangle with
// corners of radius RC. A point in it is (s, d): s the distance along the
// outer edge, clockwise from the top centre, d the depth in from the edge.
// On the straight runs that is just x and y; round a corner, depth is
// measured towards the corner's centre, so whatever lies there bends with
// the corner.

const RC = 14;
const INSET = 1;            // the band starts a pixel in, so the burn-in orbit never pushes ink off the glass
const TS = W - 2 * RC, SS = H - 2 * RC, ARC = (Math.PI / 2) * RC;
const PERIM = 2 * TS + 2 * SS + 4 * ARC;
const PIECES = (() => {
  const L = (len, p0, dir, n) => ({ len, p0, dir, n });
  const A = (c, th0) => ({ len: ARC, c, th0 });
  return [
    L(TS / 2, [W / 2, 0], [1, 0], [0, 1]),
    A([W - RC, RC], -Math.PI / 2),
    L(SS, [W, RC], [0, 1], [-1, 0]),
    A([W - RC, H - RC], 0),
    L(TS, [W - RC, H], [-1, 0], [0, -1]),
    A([RC, H - RC], Math.PI / 2),
    L(SS, [0, H - RC], [0, -1], [1, 0]),
    A([RC, RC], Math.PI),
    L(TS / 2, [RC, 0], [1, 0], [0, 1]),
  ];
})();

/** Screen point at (s, d), plus the orbit offset. */
function bandPoint(s, d, ox = 0, oy = 0) {
  s = ((s % PERIM) + PERIM) % PERIM;
  d += INSET;
  for (const p of PIECES) {
    if (s <= p.len) {
      if (p.dir) return [p.p0[0] + p.dir[0] * s + p.n[0] * d + ox, p.p0[1] + p.dir[1] * s + p.n[1] * d + oy];
      const th = p.th0 + (s / ARC) * (Math.PI / 2), r = Math.max(RC - d, 0);
      return [p.c[0] + r * Math.cos(th) + ox, p.c[1] + r * Math.sin(th) + oy];
    }
    s -= p.len;
  }
  return [W / 2 + ox, d + oy];
}

// The four runs, clockwise. The numerals sit where a dial's would on a 2:1
// rectangle (a ray from the centre at 30-degree steps meets the top edge for
// 10, 11, 12, 1 and 2), so the long runs carry five numerals each and the
// short sides only the 3 and the 9. The end numerals of the long runs reach
// a little way round the corners (CORNER px of the outer edge), and bend.
const CORNER = 7;
const EDGES = [
  { side: 'top', mid: 0, half: TS / 2 + CORNER, arcs: CORNER, hours: [10, 11, 12, 1, 2] },
  { side: 'right', mid: TS / 2 + ARC + SS / 2, half: SS / 2, arcs: 0, hours: [3] },
  { side: 'bottom', mid: TS + 2 * ARC + SS, half: TS / 2 + CORNER, arcs: CORNER, hours: [4, 5, 6, 7, 8] },
  { side: 'left', mid: TS * 1.5 + SS * 1.5 + 3 * ARC, half: SS / 2, arcs: 0, hours: [9] },
];
const EDGE_OF = {};
EDGES.forEach((e, ei) => e.hours.forEach((h, k) => { EDGE_OF[h] = { e, ei, k }; }));
/** Where numeral h sits when nothing is swelling: the middle of its even share of the run. */
const REST_S = Object.fromEntries(Object.entries(EDGE_OF).map(([h, { e, k }]) => [h, e.mid - e.half + ((k + 0.5) * 2 * e.half) / e.hours.length]));

/** Glyph-local (X, Y) in a box gw x gh centred at s = sc on edge e, to (s, d). */
function toBand(side, sc, gw, gh, X, Y) {
  switch (side) {
    case 'top': return [sc - gw / 2 + X, Y];
    case 'right': return [sc - gh / 2 + Y, gw - X];
    case 'bottom': return [sc + gw / 2 - X, gh - Y];
    default: return [sc + gh / 2 - Y, X];
  }
}

// ------------------------------------------------------------ focus
//
// Each numeral has a focus, 0..1, and every axis follows it: weight, the
// band's depth (the numeral's size across the band) and its share of the
// run's length (so a swelling numeral shoulders its neighbours along).

const SIG = 16;                                       // px along the band a wave spans
const circ = (a, b) => { const d = (((a - b) % PERIM) + PERIM) % PERIM; return Math.min(d, PERIM - d); };
const bump = (ds, sig = SIG) => Math.exp(-((ds / sig) ** 2));

/**
 * Focus of every numeral now. The hour's own numeral is always the heaviest
 * by a clear margin (everything else is held 0.25 below it), and the swap
 * from one hour to the next happens exactly at :00.
 */
function focusOf(f) {
  const cur = f.h12, next = (cur % 12) + 1, prev = ((cur + 10) % 12) + 1;
  const sec = f.sec, m = f.m;
  const F = new Array(13).fill(0), Wt = new Array(13).fill(0);
  let fc = 1;
  // The next hour leans in over the hour.
  F[next] = 0.3 * ((m + sec / 60) / 60) ** 2;
  if (m === 59 && sec > 59) {
    // The last second: the hour lets go a little, the next one tenses.
    const u = ease.inOutQuad(sec - 59);
    fc = 1 - 0.3 * u;
    F[next] = lerp(F[next], 0.45, u);
  }
  if (m === 0 && sec < 3.5) {
    // The new hour pops in from 0.7, overshooting; the old one lets go.
    fc = Math.min(1.08, 0.7 + 0.3 * ease.outBack(progress(sec, 0, 0.8)));
    F[prev] = 0.45 * (1 - ease.inOutQuad(progress(sec, 0, 1.8)));
  }
  F[cur] = fc;
  const sweep = (sec / 60) * PERIM;
  for (let h = 1; h <= 12; h++) {
    if (h === cur) continue;
    const s = REST_S[h];
    // The seconds sweep passing makes a numeral bolder, hardly bigger.
    const sw = bump(circ(s, sweep), 13);
    let b = 0.04 * sw;
    Wt[h] = 0.3 * sw;
    if (m !== 0 && sec < 1.3) {
      // The minute: a ripple runs both ways round from the hour.
      const front = (PERIM / 2) * ease.outQuad(progress(sec, 0, 1.1));
      const amp = 0.42 * (1 - progress(sec, 0.7, 1.3));
      b = Math.max(b, amp * bump(Math.abs(circ(s, REST_S[cur]) - front), 18));
    }
    if (m === 0 && sec < 3.4) {
      // The hour: a wave of weight runs once round the whole dial,
      // clockwise from the new hour, and every numeral rises as it passes.
      const u = progress(sec, 0.35, 3.0);
      const front = REST_S[cur] + PERIM * ease.inOutQuad(u);
      const ds = (((s - front) % PERIM) + PERIM) % PERIM;
      const near = Math.min(ds, PERIM - ds);
      b = Math.max(b, 0.75 * bump(near, 26) * Math.sin(Math.PI * Math.min(1, u * 1.15)) ** 0.3);
    }
    F[h] = clamp(F[h] + b, 0, fc - 0.25);
    Wt[h] = clamp(Math.max(F[h], Wt[h] + F[h]), 0, fc - 0.25);
  }
  Wt[cur] = fc;
  return { F, Wt };
}

// ------------------------------------------------------------ layout

const SLOT_GAP = 3;              // px between neighbours along the band
const ASPECT = 1.8;              // widest a digit may get, as width / height
const depthOf = (side, f) => (side === 'top' || side === 'bottom' ? 9.5 + 14.5 * f : 11 + 15 * f);
const weightOf = (f) => 1.2 + 5.3 * Math.max(0, f) ** 1.3;

/** Slots along each run: centre, length, depth, weight and glyph metrics for every numeral. */
function layout({ F, Wt }) {
  const slots = {};
  for (const e of EDGES) {
    const side = e.side, flat = side === 'top' || side === 'bottom';
    // Shares of the run, but nobody squeezed below a readable minimum.
    const MIN = flat ? 17 : 14, total = 2 * e.half;
    let b = e.hours.map((h) => 1 + 2.2 * F[h]);
    let len = b.map((x) => (total * x) / b.reduce((p, q) => p + q, 0));
    for (let it = 0; it < 3; it++) {
      const short = len.map((l) => l < MIN);
      const fixed = short.reduce((a, sh) => a + (sh ? MIN : 0), 0);
      const rest = b.reduce((a, x, k) => a + (short[k] ? 0 : x), 0);
      len = b.map((x, k) => (short[k] ? MIN : ((total - fixed) * x) / rest));
    }
    if (!flat) len = [Math.min(total, 22 + 16 * F[e.hours[0]])];
    let s = e.mid - (flat ? e.half : len[0] / 2);
    e.hours.forEach((h, k) => {
      const sl = { side, e, s0: s, s1: s + len[k], D: depthOf(side, F[h]), w: weightOf(Wt[h]), f: F[h] };
      s += len[k];
      Object.assign(sl, usable(sl));
      // Fit the numeral: its digits' width and height (the width axis).
      const ds = [...String(h)];
      const sumAdv = ds.reduce((a, d) => a + adv(d), 0);
      let gd = 1.6 + 0.5 * sl.w;
      if (flat) {
        sl.gh = sl.D;
        sl.dw = Math.min(ASPECT * sl.gh, (sl.len - SLOT_GAP - gd * (ds.length - 1)) / sumAdv);
        sl.gw = sumAdv * sl.dw + gd * (ds.length - 1);
        sl.x0 = 0;
      } else {
        sl.gh = sl.len - SLOT_GAP;
        // Upright digits stay condensed: no wider than 0.8 of their height.
        sl.dw = Math.min(0.8 * sl.gh, (sl.D - gd * (ds.length - 1)) / sumAdv);
        const used = sumAdv * sl.dw + gd * (ds.length - 1);
        sl.D = sl.gw = used;                       // the band is as deep as the numeral
        sl.x0 = 0;
      }
      // Black, but not so black the counters close.
      sl.w = Math.min(sl.w, 0.3 * sl.dw, 0.27 * sl.gh);
      sl.ds = ds; sl.gd = 1.6 + 0.5 * sl.w;
      slots[h] = sl;
    });
  }
  return slots;
}

/**
 * The part of a slot a glyph may use. Round a corner, depth runs towards the
 * corner's centre, and anything deeper than the corner radius would be
 * pinched to a point there; so a numeral reaches round a corner only as far
 * as its depth allows: the whole half-corner when it is shallow, none of it
 * when it is deep.
 */
function usable(sl) {
  const e = sl.e, a0 = e.mid - e.half + e.arcs, a1 = e.mid + e.half - e.arcs;
  const reach = e.arcs * clamp(1 - (sl.D - 10) / 6, 0, 1);
  const s0 = Math.max(sl.s0, a0 - reach), s1 = Math.min(sl.s1, a1 + reach);
  return { s0, s1, len: s1 - s0, sc: (s0 + s1) / 2 };
}

/**
 * Draw numeral h in its slot, the brush at the slot's weight, every point
 * carried through the band so the numeral hugs the edge and bends round a
 * corner.
 */
function drawNumeral(g, h, sl, ox, oy) {
  const r = sl.w / 2;
  let x = sl.x0;
  for (const d of sl.ds) {
    const bw = sl.dw * adv(d);
    for (const path of digitPaths(d, x, 0, bw, sl.gh, r)) {
      const pts = path.map(([X, Y]) => {
        const [s, dd] = toBand(sl.side, sl.sc, sl.gw, sl.gh, X, Y);
        return bandPoint(s, dd, ox, oy);
      });
      brush(g, pts, r);
    }
    x += bw + sl.gd;
  }
}

/** The band's inner edge at s: the depth of the numeral there, eased across slot joins. */
function depthAt(slots, s) {
  s = ((s % PERIM) + PERIM) % PERIM;
  const list = Object.values(slots);
  for (const sl of list) {
    const a = ((sl.s0 % PERIM) + PERIM) % PERIM;
    const u = (((s - a) % PERIM) + PERIM) % PERIM;
    if (u <= sl.len) {
      const nb = list.find((o) => Math.abs(((((o.s0 - sl.s1) % PERIM) + PERIM) % PERIM)) < 0.01);
      const pv = list.find((o) => Math.abs(((((sl.s0 - o.s1) % PERIM) + PERIM) % PERIM)) < 0.01);
      if (nb && sl.len - u < 4) return lerp(sl.D, (sl.D + nb.D) / 2, 1 - (sl.len - u) / 4);
      if (pv && u < 4) return lerp(sl.D, (sl.D + pv.D) / 2, 1 - u / 4);
      return sl.D;
    }
  }
  return 10;
}

// ------------------------------------------------------------ the minutes

const MIN_GAP = 5.5;               // clearance between the band and the minutes
const MIN_W = 2.8;               // the minutes' weight

/** The free rectangle inside the band. */
function interior(slots) {
  let L = 0, R = 0;
  L = slots[9].D; R = slots[3].D;
  const x0 = L + MIN_GAP, x1 = W - R - MIN_GAP;
  let T = 0, B = 0;
  // Only the numerals above and below the minutes' span push them in.
  for (const h of EDGES[0].hours) {
    const a = W / 2 + slots[h].s0, b = W / 2 + slots[h].s1;
    if (b > x0 && a < x1) T = Math.max(T, slots[h].D);
  }
  for (const h of EDGES[2].hours) {
    const a = W / 2 - (slots[h].s1 - EDGES[2].mid), b = W / 2 - (slots[h].s0 - EDGES[2].mid);
    if (b > x0 && a < x1) B = Math.max(B, slots[h].D);
  }
  return [x0, T + MIN_GAP, x1 - x0, H - B - MIN_GAP - (T + MIN_GAP)];
}

/**
 * The minutes, centred in the free rectangle, as large as it allows. A
 * digit that is about to change thins to a hairline and narrows over the
 * last half second; at :00 the new one starts there and swells back.
 */
function drawMinutes(g, f, box, ox, oy) {
  const [bx, by, bw, bh] = box;
  const sec = f.sec;
  const mm = f.mm;
  const nextMM = String((f.m + 1) % 60).padStart(2, '0');
  const prevMM = String((f.m + 59) % 60).padStart(2, '0');
  const gap = 3 + MIN_W * 0.6;
  const dw = Math.min((bw - gap) / 2, bh * 0.68, 19);
  const total = 2 * dw + gap;
  let x = bx + (bw - total) / 2;
  const y = by + (bh - Math.min(bh, dw / 0.62)) / 2, hh = Math.min(bh, dw / 0.62);
  for (let i = 0; i < 2; i++) {
    let k = 1;
    if (sec > 59.45 && nextMM[i] !== mm[i]) k = 1 - ease.inQuad(progress(sec, 59.45, 60));
    if (sec < 0.6 && prevMM[i] !== mm[i]) k = ease.outBack(progress(sec, 0, 0.6));
    const wk = lerp(1, MIN_W, clamp(k, 0, 1.2)), bwk = dw * lerp(0.3, 1, clamp(k, 0, 1.1));
    const r = wk / 2;
    for (const path of digitPaths(mm[i], x + (dw - bwk) / 2, y, bwk, hh, r))
      brush(g, path.map(([px, py]) => [px + ox, py + oy]), r);
    x += dw + gap;
  }
}

// ------------------------------------------------------------ the sweep

/** The seconds: a comet riding the band's inner edge, once round a minute from 12. */
function drawSweep(g, slots, sec, ox, oy) {
  const S = (sec / 60) * PERIM, TAIL = 30;
  for (let t = 0; t <= TAIL; t += 0.4) {
    const s = S - t;
    const [x, y] = bandPoint(s, depthAt(slots, s) + 2.5, ox, oy);
    const lv = (1 - t / TAIL) ** 1.3;
    if (t < 3 || dither(Math.floor(x), Math.floor(y), lv)) g.pixel(x, y, ON);
  }
  // The head: a bright bead.
  const [hx, hy] = bandPoint(S, depthAt(slots, S) + 2.5, ox, oy);
  g.fillCircle(hx, hy, 1.3, ON);
}

// ------------------------------------------------------------ the clock

const DAY = 0xcf, NIGHT = 0x12;

/**
 * For review (out/contour-digits.png, 220 x 96): the digits along the axes.
 * Rows: hairline condensed, regular condensed, black condensed, then the
 * extended widths at hairline and bold, as the long runs use them.
 */
export function specimen(g) {
  const rows = [[1.2, 9, 16], [2.8, 9, 16], [4.2, 14, 22], [1.2, 17, 9], [3.2, 20, 12]];
  let y = 1;
  for (const [w, dw, h] of rows) {
    let x = 1;
    for (let d = 0; d <= 9; d++) {
      const bw = dw * adv(String(d));
      for (const path of digitPaths(String(d), x, y, bw, h, w / 2)) brush(g, path, w / 2);
      x += bw + 3 + w * 0.5;
    }
    y += h + 2;
  }
}

export default {
  name: 'Contour',
  blurb: 'Numerals of a variable typeface hug the edge; the hour swells to black, a wave of weight follows the seconds.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { fields: f, date, oled, night }) {
    oled.contrast(DAY + (NIGHT - DAY) * night);
    const [ox, oy] = orbit(date, 1, 4);
    const F = focusOf(f);
    const slots = layout(F);
    for (let h = 1; h <= 12; h++) drawNumeral(g, h, slots[h], ox, oy);
    drawMinutes(g, f, interior(slots), ox, oy);
    drawSweep(g, slots, f.sec, ox, oy);
  },
};
