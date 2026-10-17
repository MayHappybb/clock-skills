// X-Ray — an airport security scanner, seen through its side.
//
// The face is a cut-away of the baggage X-ray tunnel. Bags ride the belt
// through it; outside the tunnel they are opaque suitcases, but inside,
// once they have crossed the beam, you see straight through the shell to
// what is packed in them. The packing IS the time: every numeral is built
// from real luggage, drawn the way an X-ray shows it, outline plus density
// (organics faint, plastic grey, metal solid):
//
//   0 a trouser belt coiled up, buckle and holes     5 a key, an AA cell, headphones
//   1 an electric toothbrush, motor and cell show     6 a magnifying glass
//   2 a banana, a pen (its refill shows), a phone     7 a hair dryer, heating coil and all
//   3 headphones over a banana                        8 handcuffs
//   4 a pen, a toothbrush, a spanner                  9 the magnifying glass, packed upside down
//
// Minutes: the bag in the tunnel. The scanner head rides a rail under the
// roof and sweeps the parked bag all minute, its wake briefly brighter.
// At :00 the belt runs: the bag with the old minutes slides out through the
// lead curtain and turns opaque again, the next bag pushes in through the
// far curtain and is revealed column by column as it crosses the beam.
//
// Hours: the inspection table, lower left, where the last bag that rang
// the alarm was unpacked. Same objects, out in the open, solid.
//
// The hour: the incoming bag sets off the alarm. The beacon on the machine
// spins, a threat box closes on the bag, the old hour's things are tossed
// off the table and the new hour's come flying out of the tunnel mouth,
// tumbling, and land in place.
//
// Pure function of the clock: belt travel from fields.sec, curtain swings
// from the analytic time the bag's tail cleared them, the hour show from
// sec at m = 0. Scene walks a 1 px orbit; night dims through contrast.

import { dither, clamp, lerp, progress, orbit, ease } from '../js/kit.js';

const W = 128, H = 64;

// ------------------------------------------------------------ geometry
// Parts are tubes (polyline with a radius per vertex) or polygons, in a
// 20x32 digit box. Materials: o organic, p plastic, m metal, x cut (hole).
const DENS = { o: 1, p: 2, m: 6, x: 0, g: 1 };

function tube(pts, mat) { return { t: 'tube', pts, mat }; }
function cap(x0, y0, x1, y1, r, mat) { return tube([[x0, y0, r], [x1, y1, r]], mat); }
function disc(x, y, r, mat) { return tube([[x, y, r]], mat); }
function poly(pts, mat) { return { t: 'poly', pts, mat }; }
function box(x0, y0, x1, y1, mat) { return poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], mat); }
/** Tube along an elliptical arc, clock angles in degrees; radius tapers rEnd -> rMid -> rEnd. */
function arc(cx, cy, rx, ry, a0, a1, rEnd, rMid, mat, n = 16) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = (a0 + (a1 - a0) * u) * Math.PI / 180;
    pts.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a), rEnd + (rMid - rEnd) * Math.sqrt(Math.sin(Math.PI * u))]);
  }
  return tube(pts, mat);
}
function ring(cx, cy, rx, ry, r, mat, n = 20) { return arc(cx, cy, rx, ry, 0, 360, r, r, mat, n); }

function obj(kind, parts) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of parts) {
    if (p.t === 'tube') for (const [x, y, r] of p.pts) { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); }
    else for (const [x, y] of p.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    p.bb = bbOf(p);
  }
  return { kind, parts, bb: [x0, y0, x1, y1], c: [(x0 + x1) / 2, (y0 + y1) / 2] };
}
function bbOf(p) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const q of p.pts) { const r = p.t === 'tube' ? q[2] : 0; x0 = Math.min(x0, q[0] - r); y0 = Math.min(y0, q[1] - r); x1 = Math.max(x1, q[0] + r); y1 = Math.max(y1, q[1] + r); }
  return [x0, y0, x1, y1];
}
function inPart(p, x, y) {
  const b = p.bb;
  if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) return false;
  if (p.t === 'tube') {
    const q = p.pts;
    if (q.length === 1) return (x - q[0][0]) ** 2 + (y - q[0][1]) ** 2 <= q[0][2] ** 2;
    for (let i = 1; i < q.length; i++) {
      const ax = q[i - 1][0], ay = q[i - 1][1], dx = q[i][0] - ax, dy = q[i][1] - ay;
      const l2 = dx * dx + dy * dy;
      const u = l2 ? clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1) : 0;
      const r = q[i - 1][2] + (q[i][2] - q[i - 1][2]) * u;
      if ((x - ax - u * dx) ** 2 + (y - ay - u * dy) ** 2 <= r * r) return true;
    }
    return false;
  }
  let inside = false;
  const q = p.pts;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const [xi, yi] = q[i], [xj, yj] = q[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** Density of one object at a local point: sum of its parts, 0 inside a cut. */
function objDensity(o, x, y, opaque = false) {
  const b = o.bb;
  if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) return 0;
  let d = 0, glass = false;
  for (const p of o.parts) if (inPart(p, x, y)) {
    if (p.mat === 'x') return 0;
    if (p.mat === 'g') glass = true;
    d += DENS[p.mat];
  }
  // out in the open, glass is clear: only what is not glass is seen
  if (opaque && glass && d === DENS.g) return 0;
  return d;
}

// ------------------------------------------------------------ the luggage numerals
const pen = (x0, y0, x1, y1) => {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l;
  return obj('pen', [
    cap(x0, y0, x1, y1, 1.6, 'p'),
    cap(x0 + ux * 1.2, y0 + uy * 1.2, x1 - ux * 1.5, y1 - uy * 1.5, 0.4, 'm'),     // refill
    cap(x1 - ux * 0.6, y1 - uy * 0.6, x1 + ux * 0.7, y1 + uy * 0.7, 0.6, 'm'),     // nib
  ]);
};
const banana = (cx, cy, r, a0, a1) => {
  const p0 = [cx + r * Math.sin(a0 * Math.PI / 180), cy - r * Math.cos(a0 * Math.PI / 180)];
  const p1 = [cx + r * Math.sin(a1 * Math.PI / 180), cy - r * Math.cos(a1 * Math.PI / 180)];
  return obj('banana', [arc(cx, cy, r, r, a0, a1, 0.9, 2.7, 'o'), disc(p0[0], p0[1], 1.0, 'p'), disc(p1[0], p1[1], 0.8, 'p')]);
};
const headphones = (cx, cy, r, a0, a1) => {
  const pt = (a) => [cx + r * Math.sin(a * Math.PI / 180), cy - r * Math.cos(a * Math.PI / 180)];
  const [ax, ay] = pt(a0), [bx, by] = pt(a1);
  return obj('headphones', [
    arc(cx, cy, r, r, a0, a1, 1.3, 1.3, 'p'),
    arc(cx, cy, r, r, a0, a1, 0.4, 0.4, 'm'),
    disc(ax, ay, 2.5, 'p'), disc(ax, ay, 1.1, 'm'),
    disc(bx, by, 2.5, 'p'), disc(bx, by, 1.1, 'm'),
  ]);
};
const magnifier = () => obj('magnifier', [
  ring(10.4, 22.4, 7.1, 7.1, 1.3, 'm', 24),
  disc(10.4, 22.4, 5.9, 'g'),
  cap(5.9, 16.2, 14.4, 1.8, 2.2, 'o'),
  cap(5.8, 16.4, 7.0, 14.3, 2.35, 'm'),
]);
const flip = (o) => obj(o.kind, o.parts.map((p) => p.t === 'tube'
  ? tube(p.pts.map(([x, y, r]) => [20 - x, 32 - y, r]), p.mat)
  : poly(p.pts.map(([x, y]) => [20 - x, 32 - y]), p.mat)));

const DIGITS = [
  // 0 belt
  [obj('belt', [
    ring(10, 16, 7.6, 13.6, 2.3, 'o', 28),
    tube([[14.6, 12, 0.8], [20.6, 12, 0.8], [20.6, 20, 0.8], [14.6, 20, 0.8], [14.6, 12, 0.8]], 'm'),
    cap(14.6, 16, 20.6, 16, 0.6, 'm'),
    disc(2.4, 11.5, 0.8, 'x'), disc(2.4, 16, 0.8, 'x'), disc(2.4, 20.5, 0.8, 'x'),
  ])],
  // 1 electric toothbrush: the bristle head is the flag
  [obj('toothbrush', [
    cap(11.6, 14, 11.6, 30.4, 2.6, 'p'),                      // handle
    cap(11.6, 3.2, 11.6, 13, 1.25, 'p'),                      // neck
    box(10.0, 15.6, 13.2, 27.2, 'm'),                         // battery and motor
    cap(11.6, 3.2, 11.6, 15, 0.35, 'm'),                      // drive shaft
    poly([[10.4, 1.4], [5.6, 4.2], [4.8, 7.8], [10.4, 6.6]], 'o'),   // bristles
  ])],
  // 2 banana, pen, phone
  [banana(10, 10.2, 7.4, -75, 128), pen(15.2, 15.6, 3.4, 27.2),
    obj('phone', [poly([[2, 27.6], [19, 27.6], [19.8, 28.4], [19.8, 31.2], [19, 32], [2, 32], [1.2, 31.2], [1.2, 28.4]], 'p'),
      box(5, 28.6, 13.6, 31, 'm'), disc(16.8, 29.8, 0.9, 'm')])],
  // 3 headphones over a banana
  [headphones(9.6, 8.4, 6.6, -60, 200), banana(9.4, 22.6, 8.3, -35, 222)],
  // 4 pen, toothbrush, spanner
  [pen(12.8, 2.2, 2.2, 21.2),
    obj('toothbrush', [cap(0.8, 22.4, 19.6, 22.4, 1.4, 'p'), box(0.6, 23.4, 5.6, 25.8, 'o')]),
    obj('spanner', [cap(14.6, 5.6, 14.6, 27.4, 1.5, 'm'), ring(14.6, 3.4, 2.5, 2.5, 1.0, 'm'), box(13.3, -0.6, 15.9, 2.6, 'x'), ring(14.6, 29.3, 2.1, 2.1, 1.0, 'm')])],
  // 5 key, AA cell, headphones
  [obj('key', [cap(4.6, 3, 14.6, 3, 1.5, 'm'), ring(17.4, 3, 2.3, 2.3, 1.0, 'm'), box(6.5, 0.6, 8, 2, 'm'), box(9.5, 0.6, 11, 2, 'm')]),
    obj('battery', [cap(4, 5.2, 4, 13, 1.9, 'm'), cap(4, 3.9, 4, 5.2, 0.9, 'm')]),
    headphones(9.4, 20.6, 7.4, -38, 222)],
  // 6 magnifier
  [magnifier()],
  // 7 hair dryer
  [obj('dryer', [
    cap(3.4, 5, 16, 5, 3.3, 'p'),
    poly([[0.6, 2.6], [3.6, 2], [3.6, 8], [0.6, 7.4]], 'p'),
    tube([[4.6, 5, 0.4], [5.6, 3.8, 0.4], [6.6, 6.2, 0.4], [7.6, 3.8, 0.4], [8.6, 6.2, 0.4], [9.6, 3.8, 0.4], [10.6, 6.2, 0.4], [11.6, 3.8, 0.4], [12.4, 5, 0.4]], 'm'),
    disc(15.4, 5, 2.0, 'm'),
    cap(19.2, 2.6, 19.2, 7.4, 0.6, 'p'),
    cap(15, 8.2, 7.6, 29.8, 2.5, 'p'),
    cap(14.2, 9.4, 8.2, 28.6, 0.35, 'm'),
    cap(13.6, 12.6, 13, 14.6, 0.75, 'm'),
  ])],
  // 8 handcuffs
  [obj('cuffs', [
    ring(10, 7.6, 5.4, 5.4, 1.35, 'm'),
    ring(10, 23.6, 6.8, 6.8, 1.45, 'm', 24),
    ring(10, 15.4, 1.0, 1.5, 0.5, 'm', 10),
    box(14.2, 5.4, 16.8, 9.8, 'm'),
    box(15.8, 21.2, 18.6, 26, 'm'),
  ])],
  // 9 the magnifier upside down
  [flip(magnifier())],
];

// ------------------------------------------------------------ raster buffers
const dens = new Uint8Array(W * H);
const ids = new Uint8Array(W * H);
const solid = new Uint8Array(W * H);

/**
 * Accumulate one object, posed: local p -> (X, Y) + s * (c + R(a)(p - c)).
 * mode 'x' writes density/ids, 's' writes the solid mask. Clipped to [cx0, cx1).
 */
function stamp(o, X, Y, s, a, mode, id, cx0 = 0, cx1 = W) {
  const [lx0, ly0, lx1, ly1] = o.bb, [ccx, ccy] = o.c;
  const rad = Math.hypot(lx1 - lx0, ly1 - ly0) / 2 + 1;
  const sx = X + s * ccx, sy = Y + s * ccy;
  const x0 = Math.max(cx0, Math.floor(sx - rad * s)), x1 = Math.min(cx1, Math.ceil(sx + rad * s));
  const y0 = Math.max(0, Math.floor(sy - rad * s)), y1 = Math.min(H, Math.ceil(sy + rad * s));
  const co = Math.cos(-a), si = Math.sin(-a);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const qx = (x + 0.5 - sx) / s, qy = (y + 0.5 - sy) / s;
      const d = objDensity(o, ccx + co * qx - si * qy, ccy + si * qx + co * qy, mode === 's');
      if (!d) continue;
      const i = y * W + x;
      if (mode === 's') solid[i] = 1;
      else { dens[i] = Math.min(255, dens[i] + d); ids[i] = id; }
    }
}

const LEVEL = [0, 0.2, 0.45, 0.6, 0.72, 0.85];

/** Resolve the X-ray buffers into lit pixels inside [x0, x1). */
function developXray(g, x0, x1, glow) {
  for (let y = 0; y < H; y++)
    for (let x = x0; x < x1; x++) {
      const i = y * W + x, d = dens[i];
      if (!d) continue;
      let on = d >= 6;
      if (!on) {
        const id = ids[i];
        on = (x === 0 || !dens[i - 1] || ids[i - 1] !== id) || (x === W - 1 || !dens[i + 1] || ids[i + 1] !== id)
          || (y === 0 || !dens[i - W] || ids[i - W] !== id) || (y === H - 1 || !dens[i + W] || ids[i + W] !== id);
        if (!on) on = dither(x, y, Math.min(0.9, LEVEL[Math.min(5, d)] + glow(x)));
      }
      if (on) g.pixel(x, y, 1);
    }
}

// ------------------------------------------------------------ the scene
// (unshifted coordinates; the whole picture is orbited at the end)
const ROOF = 1;          // roof underside row
const LINTEL = 5;        // curtain pivots
const BELT = 39;         // belt top row
const BAG_TOP = 7, BAG_W = 48, BAG_H = BELT - BAG_TOP;
const MOUTH_L = 38;      // left end wall
const BEAM_REST = 119;   // where the beam parks, at the entrance
const REST_X = 56;       // parked bag's left edge
const PITCH = 116;       // belt travel per minute
const TURN = 2.8;        // seconds the belt runs
const DIG_S = 0.86;      // minute digit scale
const HOUR_S = 0.6;      // hour digit scale
const XRAY_X0 = MOUTH_L + 1;
const CURTAIN_L = [41.5, 44.5];
const CURTAIN_R = [123.5, 126.5];

const beltEase = ease.inOutQuad;
const beltInv = (v) => (v < 0.5 ? Math.sqrt(v / 2) : 1 - Math.sqrt((1 - v) / 2));

/** Belt travel this minute, px: 0 .. PITCH over [0, TURN). */
const travel = (sec) => PITCH * beltEase(progress(sec, 0, TURN));

/** Scanner head x. Parked at the entrance across the turn, ping-pong sweeps in between. */
function scanX(sec) {
  const a = 3.4, b = 57, n = 6, P = (b - a) / n;
  if (sec < a || sec >= b) return { x: BEAM_REST, dir: 0 };
  const u = (sec - a) / P, k = Math.floor(u), f = u - k;
  const e = ease.inOutCubic(f);
  const left = MOUTH_L + 8;
  return k % 2 === 0 ? { x: lerp(BEAM_REST, left, e), dir: -1 } : { x: lerp(left, BEAM_REST, e), dir: 1 };
}

function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = Math.imul(n, 9); n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); n ^= n >>> 15; return (n >>> 0) / 4294967296; }

/** Digit layout inside a bag whose left edge is bx. */
function bagDigits(mm, bx) {
  const t = +mm[0], u = +mm[1];
  const dy = BAG_TOP + 2.2;
  const gap = 2, w = 20.6 * DIG_S, x = bx + (BAG_W - 2 * w - gap) / 2;
  return [[t, x, dy], [u, x + w + gap, dy]];
}

function drawBagShell(g, bx, style, cx0, cx1) {
  // style: 'x' x-ray (thin shell, metal handle and wheels) or 'o' opaque
  g.clip(cx0, 0, cx1 - cx0, H);
  const x = Math.round(bx), y = BAG_TOP, w = BAG_W, h = BAG_H;
  const mid = x + w / 2;
  // handle
  g.stroke([[mid - 6, y + 0.5], [mid - 5, y - 2.5], [mid + 5, y - 2.5], [mid + 6, y + 0.5]], style === 'x' ? 1.4 : 2);
  if (style === 'o') {
    g.fillRoundRect(x, y, w, h - 1, 3, 1);
    // ribs of a hard shell, dark
    for (let i = 6; i < w - 4; i += 5) g.vline(x + i, y + 3, h - 7, 0);
    g.hline(x + 2, y + 2, w - 4, 0);
  } else {
    g.roundRect(x, y, w, h - 1, 3, 1);
  }
  // wheels
  g.fillCircle(x + 5, BELT - 1.2, 1.8, 1);
  g.fillCircle(x + w - 5, BELT - 1.2, 1.8, 1);
  g.unclip();
}

function drawBag(g, mm, bx, glow) {
  const x0 = Math.max(XRAY_X0, Math.floor(bx)), x1 = Math.min(BEAM_REST, Math.ceil(bx + BAG_W));
  // opaque parts (outside the scanned window)
  if (bx < XRAY_X0) drawBagShell(g, bx, 'o', 0, XRAY_X0);
  if (bx + BAG_W > BEAM_REST) drawBagShell(g, bx, 'o', BEAM_REST, W);
  if (x1 <= x0) return;
  drawBagShell(g, bx, 'x', x0, x1);
  dens.fill(0, 0, W * H);
  let id = 1;
  for (const [d, X, Y] of bagDigits(mm, bx))
    for (const o of DIGITS[d]) stamp(o, X, Y, DIG_S, 0, 'x', id++, x0, x1);
  developXray(g, x0, x1, glow);
}

// ------------------------------------------------------------ the hour table
const TABLE_Y = 62;
const HOUR_X = [3, 18];
const hourY = () => TABLE_Y - 32 * HOUR_S - 0.4;

/** Poses of the hour items at this instant: [{o, X, Y, a}] */
function hourPoses(f, sec) {
  const now = f.hh;
  const out = [];
  const showT = f.m === 0 ? sec - 1.5 : 99;     // seconds since the alarm
  const old = String((f.h + 23) % 24).padStart(2, '0');
  for (let k = 0; k < 2; k++) {
    const X = HOUR_X[k], Y = hourY();
    const nd = +now[k], od = +old[k];
    if (showT >= 99 || showT > 4 || (showT < 0 && nd === od)) {
      for (const o of DIGITS[nd]) out.push({ o, X, Y, a: 0 });
      continue;
    }
    if (nd === od) {
      // unchanged digit hops on the slammed table
      const q = progress(showT, 0, 0.55);
      const hop = Math.sin(Math.PI * q) * 5;
      for (const o of DIGITS[nd]) out.push({ o, X, Y: Y - hop, a: Math.sin(q * Math.PI * 2) * 0.12 });
      continue;
    }
    if (showT < 0) { for (const o of DIGITS[od]) out.push({ o, X, Y, a: 0 }); continue; }
    // old things tossed off the table to the left
    DIGITS[od].forEach((o, j) => {
      const q = progress(showT, 0.05 * j + 0.04 * k, 0.05 * j + 0.04 * k + 0.85);
      if (q >= 1) return;
      const e = q;
      const tx = lerp(X, -30 - 6 * j, e);
      const ty = lerp(Y, Y - 8, e) - 26 * 4 * e * (1 - e) + 30 * e * e;
      out.push({ o, X: tx, Y: ty, a: -e * (3 + j) * 1.1 });
    });
    // new things thrown out of the tunnel mouth, tumbling, and landing
    DIGITS[nd].forEach((o, j) => {
      const t0 = 0.3 + 0.12 * j + 0.1 * k, q = progress(showT, t0, t0 + 1.0);
      if (q <= 0) return;
      const sx = MOUTH_L - 8, sy = 16;
      const e = ease.outQuad(q);
      const tx = lerp(sx, X, e);
      let ty = lerp(sy, Y, q * q) - 18 * Math.sin(Math.PI * Math.min(1, q * 1.05)) * (1 - q * 0.4);
      // settle bounce
      const b = progress(showT, t0 + 1.0, t0 + 1.35);
      if (b > 0 && b < 1) ty = Y - Math.sin(Math.PI * b) * 2.2;
      if (q >= 1 && b >= 1) ty = Y;
      const spin = (j % 2 ? -1 : 1) * 2 * Math.PI;
      out.push({ o, X: tx, Y: q >= 1 ? ty : ty, a: spin * (1 - ease.outCubic(q)) });
    });
  }
  return out;
}

function drawTable(g, f, sec) {
  solid.fill(0);
  for (const p of hourPoses(f, sec)) stamp(p.o, p.X, p.Y, HOUR_S, p.a, 's', 0);
  for (let i = 0; i < W * H; i++) if (solid[i]) g.buf[i] = 1;
  // stainless table top
  g.fillRect(0, TABLE_Y, 34, 2, 1);
}

// ------------------------------------------------------------ machine furniture
const STRIP = BELT - LINTEL - 1;
/** How far a bag whose leading edge is at x0 has pushed a strip hanging at px. */
const pushed = (px, x0) => Math.min(1.45, Math.atan2(px - x0 + 0.5, STRIP) * 1.2);

function curtainAngle(px, bags, sec, side) {
  // bags: [{x0, x1}] at this instant; strips are pushed toward the left (belt runs right to left)
  for (const b of bags) if (b.x0 < px && b.x1 > px) return pushed(px, b.x0);
  // release: when did the trailing edge of a bag pass px this minute?
  const D = side === 'L' ? REST_X + BAG_W - px : REST_X + BAG_W + PITCH - px;
  if (D <= 0 || D >= PITCH) return 0;
  const tr = TURN * beltInv(D / PITCH);
  const tau = sec - tr;
  if (tau < 0) return 0;
  return 0.32 * Math.exp(-tau / 0.6) * Math.cos(2 * Math.PI * tau / 1.25);
}

function drawCurtain(g, px, theta, bags) {
  const L = STRIP;
  const sx = -Math.sin(theta), sy = Math.cos(theta);
  for (let s = 0; s <= L; s += 0.5) {
    const x = px + sx * s, y = LINTEL + sy * s;
    if (bags.some((b) => x >= b.x0 && x <= b.x1 && y >= BAG_TOP - 0.5)) break;
    g.pixel(Math.floor(x), Math.floor(y), 1);
  }
}

function drawMachine(g, sec, scan, alarm) {
  // roof and rail
  g.fillRect(MOUTH_L - 1, 0, W - MOUTH_L + 1, 2, 1);
  // left end wall above the opening and below the belt
  g.fillRect(MOUTH_L - 1, 0, 2, LINTEL, 1);
  g.fillRect(MOUTH_L - 1, BELT + 2, 2, 3, 1);
  g.hline(MOUTH_L + 1, BELT + 4, W - MOUTH_L - 1, 1);
  // scanner head under the roof, and its beam
  const hx = scan.x;
  g.fillRect(Math.round(hx) - 3, 2, 7, 2, 1);
  g.fillRect(Math.round(hx) - 1, 4, 3, 1, 1);
  const bx = Math.round(hx);
  for (let y = 5; y < BELT; y++) g.pixel(bx, y, 1);
  if (scan.dir) for (let y = 5; y < BELT; y++) if ((y & 1) === 0) g.pixel(bx - scan.dir, y, 1);
  // beacon on the end wall
  const cx = MOUTH_L - 4, cy = 4;
  g.fillRect(cx - 3, 5, 7, 2, 1);
  if (alarm > 0) {
    g.fillCircle(cx + 0.5, cy + 0.5, 3.2, 1);
    const ph = sec * 9;
    const c = Math.cos(ph);
    const len = 4 + 9 * Math.abs(c);
    const dir = c > 0 ? 1 : -1;
    for (const dy of [-1.6, 0, 1.6])
      g.line(cx + dir * 4, cy, Math.round(cx + dir * (4 + len)), Math.round(cy + dy * len / 4), 1);
  } else {
    g.circle(cx, cy, 2, 1);
  }
}

function drawBelt(g, shift) {
  g.hline(0, BELT, W, 1);
  // belt edge with moving cleats
  const off = ((-shift % 6) + 6) % 6;
  for (let x = 0; x < W; x++) if (((x + off) % 6) < 4) g.pixel(x, BELT + 1, 1);
}

// ------------------------------------------------------------ face
const DAY = 0xcf, NIGHT_C = 0x18;

export default {
  name: 'X-Ray',
  blurb: 'An airport baggage scanner seen through its side: the minutes are packed in the bag on the belt, numerals built from toothbrushes, hair dryers and handcuffs that only show once the bag crosses the beam; the hour is laid out on the inspection table, and an alarm repacks it.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, ctx) {
    const { fields: f, date, oled, night } = ctx;
    oled.contrast(DAY + (NIGHT_C - DAY) * night);
    const sec = f.sec;
    const D = travel(sec);
    const prevMM = String((f.m + 59) % 60).padStart(2, '0');
    const curX = REST_X + PITCH - D, oldX = REST_X - D;
    const bags = [];
    if (sec < TURN) bags.push({ mm: prevMM, x: oldX });
    bags.push({ mm: f.mm, x: curX });
    const rects = bags.map((b) => ({ x0: b.x, x1: b.x + BAG_W }));

    const scan = scanX(sec);
    const glow = scan.dir
      ? (x) => { const d = (scan.x - x) * -scan.dir; return d > 0 && d < 18 ? 0.4 * (1 - d / 18) : 0; }
      : () => 0;

    for (const b of bags) drawBag(g, b.mm, b.x, glow);

    const alarm = f.m === 0 && sec > 1.3 && sec < 6.5 ? 1 : 0;
    // threat box closing on the new bag
    if (f.m === 0 && sec > 1.5 && sec < 5) {
      const q = ease.outCubic(progress(sec, 1.5, 2.2));
      const blink = Math.floor((sec - 1.5) * 6) % 2 === 0 || sec > 4;
      if (blink) {
        const m = lerp(14, 2, q);
        const x0 = curX - m, y0 = BAG_TOP - 3 - m * 0.4, x1 = curX + BAG_W + m, y1 = BELT - 2 + m * 0.2;
        const k = 5;
        for (const [ax, ay, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
          g.hline(Math.round(Math.min(ax, ax + sx * k)), Math.round(ay), k, 1);
          g.vline(Math.round(ax), Math.round(Math.min(ay, ay + sy * k)), k, 1);
        }
      }
    }

    drawMachine(g, sec, scan, alarm);
    for (const px of CURTAIN_L) drawCurtain(g, px, curtainAngle(px, rects, sec, 'L'), rects);
    for (const px of CURTAIN_R) drawCurtain(g, px, curtainAngle(px, rects, sec, 'R'), rects);
    drawBelt(g, D);
    drawTable(g, f, sec);

    // the alarm flash: the scanned bag lights up white for a blink
    if (f.m === 0 && sec > 1.5 && sec < 1.58) g.invert(Math.max(XRAY_X0, Math.round(curX)), BAG_TOP, Math.min(BEAM_REST, Math.round(curX) + BAG_W) - Math.max(XRAY_X0, Math.round(curX)), BAG_H - 1);

    const [ox, oy] = orbit(date, 1, 3);
    if (ox || oy) g.shift(ox, oy);
  },
};
