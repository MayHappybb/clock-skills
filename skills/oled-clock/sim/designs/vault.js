// Vault — the time is cut through the steel of a bank vault door.
//
// We stand close in front of a vault door. Its curved top edge arcs across
// the glass, bolt bars are driven up out of the rim, and the door's black
// steel — machined in circles about a centre far below the frame — falls
// away from the light raking its edge. Four combination wheels are cut
// straight through the steel in a row, and between the hour pair and the
// minute pair sits the vault's little time-lock dial, its needle sweeping
// the minute away.
//
// The numerals are not type laid on the door: they are the door's material.
// Each is a figure cut clean through a steel plate, and a ring of light comes
// up through the cut from the vault's interior — so every closed counter (the
// hole of a 0, the loops of a 6 or an 8) is a steel island held on a stencil
// bridge, as a cut plate must be. The plate is drawn once, as a distance
// field and a three-way class per pixel — aperture, island, steel — and the
// field is sampled whenever a digit must be drawn, at any size, any squash.
//
// Each window is a wheel behind a counterbore. Through the minute the wheels
// that change roll one numeral up: the old leaves through the top of its
// window, the new rises into the bottom, dark drum between them, so no
// instant ever puts two numerals where one belongs. The roll begins a hair
// before the turn and sweeps after it — quintic, so the reading at :00 is
// untouched — and drops into its detent with a small overshoot.
//
// On the hour the lock is worked: the bolts draw fully in over two and a
// half seconds and the vault's light comes up in the gap along the door's
// edge, as it would with the door ajar on its latch; the time-lock dial is
// spun like a combination, a turn and three quarters slowing through its
// graduations; the changing wheels roll down onto the new hour with weight;
// then the bolts slam home and the steel shudders a pixel.
//
// Burn-in: the whole door walks a 2 px orbit every three minutes; the wheels
// change every minute; 23:00-07:00 the panel dims (ctx.night).

import { dither, clamp, ease, progress, clockFields, previousMinute, orbit } from '../js/kit.js';

const TAU = Math.PI * 2;
const W = 128, H = 64;

// ------------------------------------------------------------ the stencil hand
// Numerals cut from steel plate: a heavy machined hand on an 11 x 14 grid
// with a constant stroke. Counters are held by a stencil bridge.

const DW = 11, DH = 14, SR = 1.28;
const BOXW = DW + 2 * SR, BOXH = DH + 2 * SR;

const POLY = {
  0: [[[2.8, 0], [8.2, 0], [11, 2.8], [11, 11.2], [8.2, 14], [2.8, 14], [0, 11.2], [0, 2.8], [2.8, 0]]],
  1: [[[2.4, 3.8], [5.6, 0], [5.6, 14]], [[1.8, 14], [9.2, 14]]],
  2: [[[1.2, 2.4], [1.2, 1.2], [2.4, 0], [8.6, 0], [9.8, 1.2], [9.8, 3.4], [8.2, 5.8], [2.4, 11.6], [1.2, 14], [9.8, 14]]],
  3: [[[1.2, 1.2], [2.4, 0], [8.6, 0], [9.8, 1.4], [9.7, 3.6], [7.6, 5.8], [5.6, 7]],
    [[5.6, 7], [7.8, 8.4], [9.7, 10.4], [9.8, 12.4], [8.4, 14], [4.4, 14], [2.2, 13.0], [1.1, 11.6]]],
  4: [[[7.0, 14], [7.0, 1.0], [1.2, 10.0], [10.4, 10.0]]],
  5: [[[9.8, 0], [1.4, 0], [1.4, 6.2], [5.4, 5.2], [8.6, 6.4], [9.8, 8.8], [9.8, 12.2], [8.4, 14], [2.6, 14], [1.2, 12.6]]],
  6: [[[9.4, 1.0], [7.6, 0], [4.0, 0], [2.0, 1.8], [1.2, 5.0], [1.2, 11.6], [2.4, 13.6], [4.6, 14], [7.4, 14], [9.2, 11.8], [9.2, 9.4], [7.4, 7.6], [4.6, 7.6], [2.6, 9.2], [1.2, 11.6]]],
  7: [[[0.8, 1.2], [0.8, 0], [10.2, 0], [6.6, 7.4], [5.6, 14]], [[3.2, 7.8], [8.4, 7.8]]],
  8: [[[3, 0], [8, 0], [9.8, 1.8], [9.8, 5.0], [8, 6.8], [3, 6.8], [1.2, 5.0], [1.2, 1.8], [3, 0]],
    [[3, 7.2], [8, 7.2], [9.8, 9.0], [9.8, 12.2], [8, 14], [3, 14], [1.2, 12.2], [1.2, 9.0], [3, 7.2]]],
};
POLY[9] = POLY[6].map((s) => s.map(([x, y]) => [DW - x, DH - y]));

/** Stencil bridges: rectangles (x0, y0, x1, y1) in grid units, removed. */
const BREAK = {
  0: [[9.4, 6.0, 13.0, 8.0]],
  4: [[1.6, 5.6, 4.6, 8.4]],
  6: [[-0.9, 8.6, 3.0, 10.8]],
  8: [[7.9, 2.1, 11.5, 4.3], [-1.5, 9.7, 2.1, 11.9]],
};
BREAK[9] = BREAK[6].map(([a, b, c, d]) => [DW - c, DH - d, DW - a, DH - b]);

const segDistF = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const u = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - ax - u * dx, py - ay - u * dy);
};

// ------------------------------------------------------------ the digit mask
// A distance field and a three-way class per digit, built once: aperture,
// steel island (an enclosed counter), or outside plate. Sampling the mask
// draws a digit at any size and any squash and keeps its counters steel.

const DU = 0.22;
const U0 = -SR - 2.6, V0 = -SR - 2.6;
const MW = Math.ceil((DW + 2 * SR + 5.2) / DU);
const MH = Math.ceil((DH + 2 * SR + 5.2) / DU);

function buildMask(d) {
  const dist = new Float32Array(MW * MH), cls = new Uint8Array(MW * MH);
  const br = BREAK[d] ?? [];
  for (let j = 0; j < MH; j++) {
    const v = V0 + (j + 0.5) * DU;
    for (let i = 0; i < MW; i++) {
      const u = U0 + (i + 0.5) * DU;
      let broke = false;
      for (const [x0, y0, x1, y1] of br) if (u >= x0 && u <= x1 && v >= y0 && v <= y1) { broke = true; break; }
      let best = 1e9;
      if (!broke)
        for (const poly of POLY[d])
          for (let k = 1; k < poly.length; k++) {
            const q = segDistF(u, v, poly[k - 1][0], poly[k - 1][1], poly[k][0], poly[k][1]);
            if (q < best) best = q;
          }
      const idx = j * MW + i;
      dist[idx] = best;
      cls[idx] = best <= SR ? 1 : 0;
    }
  }
  const stack = [];
  const push = (i, j) => { const k = j * MW + i; if (cls[k] === 0) { cls[k] = 3; stack.push(k); } };
  for (let i = 0; i < MW; i++) { push(i, 0); push(i, MH - 1); }
  for (let j = 0; j < MH; j++) { push(0, j); push(MW - 1, j); }
  while (stack.length) {
    const k = stack.pop(), i = k % MW, j = (k - i) / MW;
    if (i > 0) push(i - 1, j);
    if (i < MW - 1) push(i + 1, j);
    if (j > 0) push(i, j - 1);
    if (j < MH - 1) push(i, j + 1);
  }
  for (let k = 0; k < cls.length; k++) if (cls[k] === 0) cls[k] = 2;
  return { dist, cls };
}
const MASK = Array.from({ length: 10 }, (_, d) => buildMask(d));

/**
 * Draw digit `d` cut through steel: its outer box is (x0, y0, w, h), the
 * aperture is lit, ringed by the dark chamfer of the cut. `squash` compresses
 * the plate vertically about the box centre; `lit` scales the glow.
 */
function cutDigit(g, d, x0, y0, w, h, { squash = 1, lit = 1 } = {}) {
  if (squash < 0.08) return;
  const s = w / BOXW;
  const M = MASK[d];
  const xc = x0 + w / 2, yc = y0 + h / 2;
  const ya = Math.max(0, Math.floor(yc - (h / 2) * squash - 2));
  const yb = Math.min(H - 1, Math.ceil(yc + (h / 2) * squash + 2));
  const xa = Math.max(0, Math.floor(x0 - 2)), xb = Math.min(W - 1, Math.ceil(x0 + w + 2));
  for (let py = ya; py <= yb; py++) {
    const v = DH / 2 + (py + 0.5 - yc) / (s * squash);
    const j = Math.floor((v - V0) / DU);
    if (j < 0 || j >= MH) continue;
    for (let px = xa; px <= xb; px++) {
      const u = ((px + 0.5) - x0) / s - SR;
      const i = Math.floor((u - U0) / DU);
      if (i < 0 || i >= MW) continue;
      const k = j * MW + i, q = M.dist[k];
      if (M.cls[k] === 1) {
        // the aperture is light: a cut slot, lit from the vault inside
        if (q <= SR || dither(px, py, (((SR + 0.45 - q) / 0.45) * 0.6 + 0.4) * lit)) g.pixel(px, py, 1);
        else g.pixel(px, py, 0);
      } else if (q <= SR + 1.0) g.pixel(px, py, 0);
    }
  }
}

// ------------------------------------------------------------ the door
// A huge door seen close: its edge is a circle centred well below the glass.

const CX = 64, DCY = 250, RIM = 240;
const RIM_IN = RIM - 5;
const BOLT_X = [18, 41, 64, 87, 110];

// the four wheel windows cut straight through the steel
const WIN = { w: 19, h: 26, y0: 25 };
const WINX = [8, 30, 79, 101];
const DIG_W = 17.2, DIG_H = 21;

// the time-lock dial, in the rib between the pairs
const DIAL = { cx: 64, cy: 38, r: 10 };
const STEP = TAU / 10;
const PITCH = 1.45 * DIG_H;
const WR = PITCH / (2 * Math.sin(Math.PI / 10));

/** Where a numeral at relative step `rel` sits on the wheel, and its squash. */
const wheelAt = (rel) => { const a = rel * STEP; return [WR * Math.sin(a), Math.cos(a)]; };

/** The wheel behind a window: a drum, dark steel turning away at its edges,
 *  with engraved rings that turn with it. */
function wheelFace(g, wx, wy, w, h, pos, lit) {
  g.fillRect(wx, wy, w, h, 0);
  const yc = wy + h / 2;
  for (let m = -2; m <= 2; m++) {
    const [dy] = wheelAt(m * 0.5 - pos);
    const y = Math.round(yc + dy);
    if (y < wy || y >= wy + h) continue;
    g.fillRect(wx, y, w, 1, 0);
    if (dither(wx, y, 0.30 * lit)) g.hline(wx, y, w, 1);
  }
}

/** One window: the wheel behind it and the numeral rolled to `pos`. */
function window_(g, wx, wy, w, h, pos, lit) {
  g.clip(wx, wy, w, h);
  wheelFace(g, wx, wy, w, h, pos, lit);
  const base = Math.round(pos);
  for (let d = base - 1; d <= base + 1; d++) {
    const [oy, sq] = wheelAt(d - pos);
    if (Math.abs(oy) > h / 2 + DIG_H || sq < 0.2) continue;
    // A numeral turning away from the window faces the light less: its glow
    // falls off with the squash, so the roll reads as a lit curved surface.
    cutDigit(g, ((d % 10) + 10) % 10, wx + (w - DIG_W) / 2, wy + h / 2 + oy - DIG_H / 2, DIG_W, DIG_H,
      { squash: sq, lit: lit * (0.30 + 0.70 * sq) });
  }
  g.unclip();
  // the counterbore the wheel turns in: lit on the upper lip, dark below
  g.shade(wx - 1, wy - 1, w + 2, 1, 0.75);
  g.hline(wx - 1, wy + h, w + 2, 0);
  g.vline(wx - 1, wy, h, 0);
  g.vline(wx + w, wy, h, 0);
}

/** The time-lock dial: graduations, a sweeping needle, a hub. */
function timeLock(g, cx, cy, r, spin, lit) {
  g.fillCircle(cx, cy, r + 1.6, 0);
  g.circle(cx, cy, r, 1);
  g.circle(cx, cy, r - 1.4, 0);
  for (let i = 0; i < 8; i++) {
    const a = (i * TAU) / 8;
    const long = i % 2 === 0;
    const r0 = r - (long ? 4.6 : 3.2);
    g.thickLine(cx + r0 * Math.sin(a), cy - r0 * Math.cos(a), cx + (r - 1.6) * Math.sin(a), cy - (r - 1.6) * Math.cos(a), long ? 1.7 : 1, 1);
  }
  const na = spin;
  g.thickLine(cx - 3 * Math.sin(na), cy + 3 * Math.cos(na), cx + (r - 3) * Math.sin(na), cy - (r - 3) * Math.cos(na), 2.4, 1);
  g.fillCircle(cx + (r - 3) * Math.sin(na), cy - (r - 3) * Math.cos(na), 1.5, 1);
  g.fillCircle(cx, cy, 2.4, 1);
  g.fillCircle(cx, cy, 1.1, 0);
}

// ------------------------------------------------------------ choreography

/**
 * The wheel position of each of the four slots at `tau`. Before the turn the
 * wheels sit on the minute showing; after it they roll one step up from the
 * minute just gone — never through any third value.
 */
function wheelPositions(date, f, tau, hour) {
  const was = tau < 0 ? f : previousMinute(date);
  const to = `${f.hh}${f.mm}`.split('').map(Number);
  const from = `${was.hh}${was.mm}`.split('').map(Number);
  return to.map((v, k) => {
    const delta = (v - from[k] + 10) % 10;
    if (!delta) return v;
    // The roll begins a hair before the turn and sweeps after it; quintic, so
    // nothing moves until the turn is past and the reading at :00 is the old
    // one, untouched. The new numeral is home by about :00.9.
    const t1 = 0.95 + k * 0.06 + (hour ? 0.45 : 0);
    const u = clamp((tau + 0.12) / (t1 + 0.12), 0, 1);
    const u1 = clamp(u / 0.86, 0, 1);
    const e = u1 * u1 * u1 * (u1 * (u1 * 6 - 15) + 10)
      // the detent: the wheel tips past its home and drops back into it
      + (u > 0.86 ? 0.07 * Math.sin((Math.PI * (u - 0.86)) / 0.14) : 0);
    return from[k] + delta * e;
  });
}

// ------------------------------------------------------------ the design

export default {
  name: 'Vault',
  blurb: 'A bank vault door: the time is cut through its steel and lit from inside; four combination wheels turn it over, the time-lock dial between them sweeps the minute, and the bolts draw on the hour.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, ctx) {
    const f = ctx.fields, T = ctx.date.getTime() / 1000, sec = f.sec;
    const tau = sec > 57 ? sec - 60 : sec;
    // the turn coming, or the one just struck: the hour's work runs either
    // side of :00, so it is keyed off whichever minute carries the hour
    const hour = f.m === 0 || (tau < 0 && clockFields(new Date(ctx.date.getTime() + 60000)).m === 0);
    // the bolts slam home and the steel shudders
    const slam = hour ? Math.exp(-Math.max(0, tau - 1.0) * 9) * (tau > 0.9 ? 1 : 0) : 0;
    const [ox0, oy0] = orbit(ctx.date, 2, 3);
    const ox = ox0, oy = oy0 + Math.round(slam);
    const cx = CX + ox, dcy = DCY + oy;

    // the stone above the door: black, with a course running behind the bolts
    g.shade(0, Math.round(9 + oy), 128, 1, 0.10);
    g.vline(Math.round(37 + ox), 9 + oy, 7, dither(0, 9, 0.10) ? 1 : 0);

    // the door's face is black steel; a bright sheen runs just inside the
    // rim, where the door's curve catches the light
    g.fillWhere((x, y) => {
      const d = Math.hypot(x - cx, y - dcy);
      return d > RIM_IN - 3.2 && d < RIM_IN - 1.6;
    }, 1, [0, 0, 128, 40]);

    // the rim: the door's edge, lit along its top, in shadow below
    g.fillWhere((x, y) => {
      const d = Math.hypot(x - cx, y - dcy);
      if (d > RIM || d < RIM_IN) return false;
      const t = (d - RIM_IN) / (RIM - RIM_IN);
      return t < 0.4 ? dither(x, y, 0.18) : t < 0.85 ? false : true;
    }, 1, [0, 0, 128, 28]);

    // unlatched: with the bolts drawn the door stands ajar on its latch, and
    // the vault's light comes up through the gap along its edge
    const latch = hour ? ease.inOutCubic(progress(tau, -3.0, -0.8)) * (1 - ease.inCubic(progress(tau, 0.5, 1.0))) : 0;
    if (latch > 0.01) {
      g.fillWhere((x, y) => {
        const d = Math.hypot(x - cx, y - dcy);
        if (d < RIM || d > RIM + 5) return false;
        const t = (d - RIM) / 5;
        return t < 0.34 ? latch > 0.35 : dither(x, y, 0.34 * (1 - (t - 0.34) / 0.66) * latch);
      }, 1, [0, 0, 128, 32]);
    }

    // the bolt bars, driven up out of the rim into the stone
    const draw = 7.5 * latch;
    for (const bx of BOLT_X) {
      const px = bx + ox, py = dcy - Math.sqrt(RIM * RIM - (px - cx) * (px - cx));
      const nx = (px - cx) / RIM, ny = (py - dcy) / RIM;
      const r0 = RIM - 4 - draw, r1 = RIM + 6.5 - draw;
      g.thickLine(cx + nx * r0, dcy + ny * r0, cx + nx * r1, dcy + ny * r1, 5.4, 0);
      g.thickLine(cx + nx * (r0 + 0.8), dcy + ny * (r0 + 0.8), cx + nx * (r1 - 0.8), dcy + ny * (r1 - 0.8), 3.6, 1);
      g.fillCircle(cx + nx * (r1 - 1.1), dcy + ny * (r1 - 1.1), 1.5, 0);
    }

    // the four wheels, each cut straight through the door's steel and lit by
    // the vault's interior
    const glow = 0.94 + 0.06 * Math.sin(T * 0.9);
    const pos = wheelPositions(ctx.date, f, tau, hour);
    for (let k = 0; k < 4; k++) window_(g, WINX[k] + ox, WIN.y0 + oy, WIN.w, WIN.h, pos[k], glow);

    // the time-lock dial between the pairs; it is spun on the hour
    const spin = TAU * (sec / 60) + (hour ? TAU * 1.75 * ease.inOutCubic(progress(tau, -2.9, 0.45)) : 0);
    timeLock(g, DIAL.cx + ox, DIAL.cy + oy, DIAL.r, spin, 0.9 + 0.1 * Math.exp(-(sec % 1) * 4));

    // the rib across the foot of the door, bolted through
    const ry = 56 + oy;
    g.shade(0, ry, 128, 1, 0.85);
    g.shade(0, ry + 1, 128, 1, 0.30);
    for (let bx = 22 + ox; bx < 122; bx += 42) {
      g.fillCircle(bx, ry + 3.4, 1.8, 1);
      g.pixel(bx, ry + 3.4, 0);
    }

    ctx.oled.contrast(0xcf + (0x20 - 0xcf) * ctx.night);
  },
};
