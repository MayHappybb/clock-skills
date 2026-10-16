// saulbass: the five shots of the title sequence. Each one is a function of
// its own local time `lt` (seconds since the shot's first frame) and the
// minute's fields, and draws a whole frame inside the current clip (so two
// shots can share the glass during a wipe).

import { ease, clamp, lerp, progress, rand, sin, cos } from '../js/kit.js';
import { GLYPHS, COLON, UW, UH, place, placeAffine, turn, centre, clipHalf, shift, fillPoly, layout } from './saulbass-type.js';

export const P = {
  orange: 0xe8541c,
  red: 0xc0301a,
  black: 0x17140f,
  paper: 0xf2ead6,
  shade: 0xcfc4ab,     // paper's shadow on paper
  mustard: 0xf0b323,
  green: 0x8ba63f,
  leaf: 0xa9c25c,      // a lit window on the green facade
  navy: 0x1d2433,
  rule: 0x55702a,      // the facade's rules, darker green
  grey: 0x8c8a84,
  dgrey: 0x3c3b38,
};

const W = 160, H = 80, BEAT = 0.5;

/** The four digits and colon of the time, placed flat. */
function setTime(F, h, cx = 80, cy = 40, opts) {
  return layout(F.hh, F.mm, h, cx, cy, opts);
}

const fillAll = (g, list, c, o) => { for (const cs of list) fillPoly(g, cs, c, o); };

// ------------------------------------------------------------------ 1 VERTIGO
// An orange field; a red two-centre spiral turns and dolly-zooms out while
// the paper numerals spin out of its eye one by one and sway in a slow wave.
// At the top of the hour the hour comes out alone, huge, first.

export function spiral(g, lt, F) {
  g.fillRect(0, 0, W, H, P.orange);
  const hour = F.m === 0;
  const spin = hour ? 2.6 : 1.5;
  const th = -lt * spin;
  const step = lerp(5.5, 8.5, ease.inOutCubic(clamp(lt / 13, 0, 1)));
  const born = ease.outCubic(progress(lt, 0, 1.0));     // the spiral unwinds out of a point
  const ux = sin(th), uy = -cos(th);
  const K = Math.ceil(95 / step) + 1, kmax = born * K;
  for (let k = 0; k < kmax; k++) {
    const sgn = k & 1 ? 1 : -1;
    const cx = 80 + sgn * ux * step / 2, cy = 40 + sgn * uy * step / 2;
    const r = (k + 1) * step, w = step * 0.5;
    const a0 = th + k * Math.PI;
    // The last half-turn grows in by angle.
    const span = k + 1 > kmax ? (kmax - k) * Math.PI : Math.PI;
    g.arc(cx, cy, r - w, r + w, a0, a0 + span, P.red);
  }
  // The eye: a paper disc with a black pupil, until the type covers it.
  const eye = 1 - progress(lt, 0.2, 0.7);
  if (eye > 0) {
    g.fillCircle(80, 40, 6 * eye + 0.01, P.paper, { aa: true });
    g.fillCircle(80, 40, 3 * eye + 0.01, P.black, { aa: true });
  }

  const shrink = 1 - 0.07 * ease.inOutCubic(clamp(lt / 13, 0, 1));
  const L = setTime(F, 44 * shrink);
  const big = hour ? setTime(F, 70, 80, 40) : null;
  const glyphs = [];
  for (const sl of L.slots) {
    let x = sl.x, y = sl.y, s = sl.s, rot;
    const isH = sl.i < 2;
    let t0 = 0.45 + sl.i * 0.3 + (sl.i >= 2 ? 0.15 : 0);
    if (hour) {
      if (isH) {
        // Out of the eye at 70 px, then down to the line at 5.0..6.0 s.
        const hx = 80 + (sl.i ? 1 : -1) * (big.slots[1].x - big.slots[0].x) / 2;
        const k = ease.inOutCubic(progress(lt, 5.0, 6.0));
        x = lerp(hx, sl.x, k); s = lerp(70 / UH, sl.s, k);
      } else t0 = 5.6 + (sl.i - 2) * 0.3;
    }
    const u = progress(lt, t0, t0 + 0.75);
    if (u <= 0) continue;
    const e = ease.outBack(u);
    const k = ease.outCubic(u);
    x = lerp(80, x, k); y = lerp(40, y, k);
    s *= clamp(e, 0, 1.2);
    rot = (1 - k) * -3.2 + 0.06 * sin((lt / 4.2) * 6.283 - sl.i * 0.9);
    glyphs.push(place(GLYPHS[sl.d], x, y, s, { rot }));
  }
  const cu = progress(lt, hour ? 6.3 : 1.7, hour ? 6.8 : 2.1);
  if (cu > 0) glyphs.push(place(COLON, L.colon.x, L.colon.y, L.colon.s * ease.outBack(cu), { ox: 0, rot: 0.06 * sin((lt / 4.2) * 6.283 - 1.5 * 0.9) }));
  // Cut card lying on the spiral: a hard black shadow, then the paper.
  for (const cs of glyphs) fillPoly(g, shift(cs, 1.5, 1.5), P.black);
  for (const cs of glyphs) fillPoly(g, cs, P.paper);
}

// ------------------------------------------------------------------ 2 PSYCHO
// Black; grey bars race across at their own speeds. The numerals are sliced
// into six strips that slide in from alternate sides and lock; on the
// off-beats a strip jumps sideways and snaps back.

export function slices(g, lt, F) {
  g.fillRect(0, 0, W, H, P.black);
  for (let i = 0; i < 11; i++) {
    const y = Math.floor(rand(i, 3) * 76), hh = 1 + Math.floor(rand(i, 4) * 4);
    const len = 30 + rand(i, 5) * 90, v = (50 + rand(i, 6) * 170) * (i & 1 ? -1 : 1);
    const span = W + len;
    let x = (rand(i, 7) * span + v * lt) % span;
    if (x < 0) x += span;
    x -= len;
    g.fillRect(x, y, len, hh, rand(i, 8) < 0.25 ? P.grey : P.dgrey);
  }
  // Tall condensed type: 60 px high, set to the width of 46 px type.
  const L = setTime(F, 46.5, 80, 40), SY = 4;
  const glyphs = L.slots.map((sl) => place(GLYPHS[sl.d], sl.x, sl.y, [sl.s, SY]));
  glyphs.push(place(COLON, L.colon.x, L.colon.y, [L.colon.s, SY], { ox: 0 }));
  const top = 40 - 30, N = 6, bh = 60 / N;
  for (let k = 0; k < N; k++) {
    const y0 = Math.round(top + k * bh), y1 = Math.round(top + (k + 1) * bh);
    const dir = k & 1 ? 1 : -1;
    const e = ease.outCubic(progress(lt, 0.25 + 0.09 * k, 0.95 + 0.09 * k));
    let dx = (1 - e) * 175 * dir;
    // Jolts: each beat after the type has landed, one strip may jump.
    const b = Math.floor(lt / BEAT), ub = lt / BEAT - b;
    if (b >= 3) {
      const pick = Math.floor(rand(b, F.key, 11) * 9);   // 6..8: a rest beat
      if (pick === k) {
        const amp = (4 + rand(b, F.key, 12) * 10) * (rand(b, F.key, 13) < 0.5 ? -1 : 1);
        const tt = ub * BEAT;
        dx += tt < 0.05 ? amp * tt / 0.05 : tt < 0.2 ? amp : amp * (1 - ease.inOutCubic(progress(tt, 0.2, 0.45)));
      }
    }
    g.clip(0, y0, W, y1 - y0);
    fillAll(g, glyphs.map((cs) => shift(cs, dx, 0)), P.paper);
    g.unclip();
  }
}

// ------------------------------------------------------------------ 3 NORTH BY NORTHWEST
// A green field ruled by a navy facade grid in steep perspective. The
// numerals lie flat on the facade and ride its lines in like lifts; windows
// light and go out on the beat; the camera drifts along the building.

const U = [1, -0.22], V = [0.3, 1];
const CU = 13, CV = 9;

export function grid(g, lt, F) {
  g.fillRect(0, 0, W, H, P.green);
  const pan = (lt - 6.5) * 2.2;
  const ox = 80 + pan * U[0], oy = 40 + pan * U[1];
  const at = (u, v) => [ox + u * U[0] + v * V[0], oy + u * U[1] + v * V[1]];
  // Windows: cells of the facade, lit for a beat or two.
  const b = Math.floor(lt / BEAT);
  for (let i = -8; i <= 8; i++)
    for (let j = -6; j <= 6; j++) {
      const r = rand(i + 50, j + 50, Math.floor((b + rand(i, j, 5) * 4) / 3) + F.key * 7);
      if (r > 0.12) continue;
      const p0 = at(i * CU, j * CV), p1 = at((i + 1) * CU, j * CV), p2 = at((i + 1) * CU, (j + 1) * CV), p3 = at(i * CU, (j + 1) * CV);
      fillPoly(g, [[p0[0], p0[1], p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]]], r < 0.03 ? P.mustard : P.leaf);
    }
  // The rules.
  for (let i = -9; i <= 9; i++) {
    const a = at(i * CU, -70), c = at(i * CU, 70);
    g.line(a[0], a[1], c[0], c[1], P.rule);
  }
  for (let j = -7; j <= 7; j++) {
    const a = at(-130, j * CV), c = at(130, j * CV);
    g.line(a[0], a[1], c[0], c[1], P.rule);
  }
  // Type on the facade: 4 cells wide, 5 rows tall per digit.
  const L = setTime(F, 1, 0, 0);
  const s = 2.95;  // px per unit along each axis
  const m = [s * U[0], s * V[0], s * U[1], s * V[1]];
  const glyphs = [];
  L.slots.forEach((sl, i) => {
    const du = sl.x / L.slots[0].s * s * 1.0;              // slot offset along U, in px of U
    const from = i & 1 ? 1 : -1;
    const t0 = 0.35 + i * 0.32;
    const k = ease.outCubic(progress(lt, t0, t0 + 0.9));
    let dv = (1 - k) * 95 * from;
    // Lift bob: on some beats one digit steps a row and back.
    const bb = Math.floor(lt / 1.0);
    if (lt > 2.5 && Math.floor(rand(bb, F.key, 21) * 6) === i) {
      const tt = lt - bb;
      dv += CV * 0.5 * (rand(bb, F.key, 22) < 0.5 ? -1 : 1) * (tt < 0.15 ? tt / 0.15 : tt < 0.55 ? 1 : 1 - progress(tt, 0.55, 0.85));
    }
    const p = at(du, dv);
    glyphs.push(placeAffine(GLYPHS[sl.d], p[0], p[1], m));
  });
  const ck = ease.outCubic(progress(lt, 1.6, 2.2));
  if (ck > 0) {
    const p = at((L.colon.x / L.slots[0].s) * s + (1 - ck) * 120, 0);
    glyphs.push(placeAffine(COLON, p[0], p[1], m, { ox: 0 }));
  }
  fillAll(g, glyphs, P.navy);
}

// ------------------------------------------------------------------ 4 ANATOMY
// Paper. An orange field slams in from the left and a black bar across the
// foot. Each numeral is cut in three with scissors; the pieces fly in from
// all sides, spinning, casting shadows, and slap down with the cuts showing.
// Now and then a numeral's cuts open a little, like a breath.

export function pieces(g, lt, F) {
  g.fillRect(0, 0, W, H, P.paper);
  const fo = ease.outCubic(progress(lt, 0.15, 0.5));
  g.fillRect(0, 0, Math.round(52 * fo), H, P.orange);
  const fb = ease.outCubic(progress(lt, 0.35, 0.75));
  g.fillRect(Math.round(W - W * fb), 70, W, 4, P.black);

  const L = setTime(F, 50, 80, 38);
  const drawn = [];
  L.slots.forEach((sl, i) => {
    const base = place(GLYPHS[sl.d], sl.x, sl.y, sl.s);
    const top = sl.y - 25;
    // Two scissor cuts per numeral, at fixed slants from a hash of its slot and digit.
    const a1 = (rand(i, +sl.d, 31) - 0.5) * 0.8, a2 = (rand(i, +sl.d, 32) - 0.5) * 0.8;
    const n1 = [sin(a1), cos(a1)], n2 = [sin(a2), cos(a2)];
    const k1 = n1[0] * sl.x + n1[1] * (top + 50 * (0.34 + rand(i, 33) * 0.08));
    const k2 = n2[0] * sl.x + n2[1] * (top + 50 * (0.64 + rand(i, 34) * 0.08));
    // Breath: the cuts open by a pixel or so on chosen beats.
    const bb = Math.floor(lt / BEAT), tt = lt - bb * BEAT;
    let open = 0.55;
    if (lt > 3 && Math.floor(rand(bb, F.key, 35) * 7) === i) open += 1.6 * sin(Math.PI * clamp(tt / BEAT, 0, 1));
    const parts = [
      { cs: clipHalf(base, n1[0], n1[1], k1), n: n1, s: -1 },
      { cs: clipHalf(clipHalf(base, -n1[0], -n1[1], -k1), n2[0], n2[1], k2), n: n1, s: 0 },
      { cs: clipHalf(base, -n2[0], -n2[1], -k2), n: n2, s: 1 },
    ];
    parts.forEach((pt, j) => {
      if (!pt.cs.length) return;
      const order = (i * 3 + j * 5 + Math.floor(rand(i, j, 36) * 4)) % 12;
      const t0 = 0.6 + order * 0.16;
      const u = progress(lt, t0, t0 + 0.55);
      if (u <= 0) return;
      const k = ease.outBack(u), lift = 1 - ease.outCubic(u);
      const dirA = rand(i, j, 37) * 6.283;
      const dist = 110 * (1 - k);
      const dx = (pt.s === 0 ? (i < 2 ? -1 : 1) * 0.8 : sin(dirA) * 0.4) * dist + pt.n[0] * pt.s * open;
      const dy = (pt.s === 0 ? sin(dirA) * 0.3 : pt.s) * dist + pt.n[1] * pt.s * open;
      const rot = (rand(i, j, 38) - 0.5) * 2.4 * (1 - k);
      const [px, py] = centre(pt.cs);
      const cs = turn(pt.cs, px, py, rot, dx, dy);
      drawn.push({ cs, lift });
    });
  });
  // Pieces in the air cast shadows; then the black card.
  for (const d of drawn) if (d.lift > 0.02) fillPoly(g, shift(d.cs, 2 + 6 * d.lift, 2 + 6 * d.lift), P.shade, { a: 0.8 });
  for (const d of drawn) fillPoly(g, d.cs, P.black);
  const ck = progress(lt, 2.6, 2.9);
  if (ck > 0) fillPoly(g, place(COLON, L.colon.x, L.colon.y - (1 - ease.outBack(ck)) * 50, L.colon.s, { ox: 0 }), P.red);
}

// ------------------------------------------------------------------ 5 THE GOLDEN ARM
// Black. White bars shoot in from the four edges and frame the title; the
// numerals are windows cut in the black onto a crowd of coloured stripes
// that run faster and faster. At the end the windows shut like shutters and
// the bars leave: the old minute is gone before :00.

const STRIPES = [P.orange, P.mustard, P.paper, P.green, P.red, P.mustard];

export function windows(g, lt, F) {
  const L = setTime(F, 52, 80, 40, { gap: 1.0 });
  const run = 22 * lt + 4.5 * lt * lt;
  const cw = L.slots[0].s * UW;
  L.slots.forEach((sl, i) => {
    const open = ease.outCubic(progress(lt, 0.25 + i * 0.12, 0.75 + i * 0.12));
    const shut = ease.inCubic(progress(lt, 8.7 + i * 0.16, 9.25 + i * 0.16));
    const sy = open * (1 - shut);
    const x0 = Math.floor(sl.x - cw / 2 - 2), x1 = Math.ceil(sl.x + cw / 2 + 2);
    g.clip(x0, 0, x1 - x0, H);
    g.fillRect(0, 0, W, H, P.black);
    if (sy > 0.01) {
      // Stripes at ±50 degrees, alternating by numeral, running.
      const ang = (i & 1 ? 1 : -1) * 0.87, nx = cos(ang), ny = sin(ang), tx = -ny, ty = nx;
      const sw = 7, off = ((run * (i & 1 ? 1 : -1.15)) % (sw * STRIPES.length) + sw * STRIPES.length) % (sw * STRIPES.length);
      for (let k = -8; k < 10; k++) {
        const d = k * sw + off - 40;
        const cx = sl.x + nx * d, cy = 40 + ny * d;
        const c = STRIPES[((k % STRIPES.length) + STRIPES.length) % STRIPES.length];
        fillPoly(g, [[cx - tx * 80, cy - ty * 80, cx + tx * 80, cy + ty * 80, cx + tx * 80 + nx * sw, cy + ty * 80 + ny * sw, cx - tx * 80 + nx * sw, cy - ty * 80 + ny * sw]], c);
      }
      fillPoly(g, place(GLYPHS[sl.d], sl.x, sl.y, [sl.s, sl.s * sy]), P.black, { inverse: true });
    }
    g.unclip();
  });
  // The gaps between columns and the colon's column.
  g.clip(0, 0, W, H);
  const cols = L.slots.map((sl) => [Math.floor(sl.x - cw / 2 - 2), Math.ceil(sl.x + cw / 2 + 2)]);
  let x = 0;
  for (const [a, b] of cols) { if (a > x) g.fillRect(x, 0, a - x, H, P.black); x = Math.max(x, b); }
  if (x < W) g.fillRect(x, 0, W - x, H, P.black);
  g.unclip();
  const cOpen = progress(lt, 0.9, 1.1) * (1 - progress(lt, 9.3, 9.5));
  if (cOpen > 0) fillPoly(g, place(COLON, L.colon.x, L.colon.y, [L.colon.s, L.colon.s * cOpen], { ox: 0 }), P.paper);
  // Four bars from the four edges.
  const bars = [
    [0.5, 'l', 2, 3], [0.65, 'r', 75, 3], [0.8, 't', 3, 2], [0.95, 'b', 154, 2],
  ];
  for (const [t0, side, pos, th] of bars) {
    const k = ease.outCubic(progress(lt, t0, t0 + 0.35)) * (1 - ease.inCubic(progress(lt, 9.3 + t0 * 0.3, 9.65 + t0 * 0.3)));
    if (k <= 0) continue;
    if (side === 'l') g.fillRect(0, pos, Math.round(W * k), th, P.paper);
    if (side === 'r') g.fillRect(Math.round(W - W * k), pos, W, th, P.paper);
    if (side === 't') g.fillRect(pos, 0, th, Math.round(H * k), P.paper);
    if (side === 'b') g.fillRect(pos, Math.round(H - H * k), th, H, P.paper);
  }
  // Match cut: an eye opens in the dark, and the next minute's Vertigo
  // spiral starts from the same eye.
  const eye = ease.outBack(progress(lt, 9.35, 9.85));
  if (eye > 0) {
    g.fillCircle(80, 40, 6 * eye, P.paper, { aa: true });
    g.fillCircle(80, 40, 3 * eye, P.black, { aa: true });
  }
}
