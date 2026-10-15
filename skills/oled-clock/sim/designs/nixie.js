// Nixie — four IN-14 tubes and a pair of INS-1 neons on a board.
//
// Each tube is drawn the way the real one is built (measured from the
// IN-14 drawing in the Soviet indicator handbook: 19 mm glass, 18 mm digits,
// a pumping tip on the dome, two decimal points, a hexagonal anode mesh with
// a rivet top and bottom). Inside, the ten cathodes are bent wire numerals
// stacked one behind another in the IN-14 order, front to back
// 1 6 2 7 5 0 4 9 8 3 (the order clock firmwares use for their
// anti-poisoning roll). The unlit nine show as faint one-pixel wire, each a
// little smaller the deeper it sits; a slow sway of the viewpoint makes the
// stack shift in parallax, the mesh in front moving most. The lit cathode
// is a bright two-pixel wire wrapped in a dithered glow; the mesh in front
// cuts dark wires across the glow and catches its light further out, so the
// honeycomb shows round the digit and fades away from it; cathodes in front
// of the lit one cut its glow too.
//
// The numerals are the IN-14's own: a stadium 0, a bare 1, a 3 with a round
// top, a closed 4, the 5 that is an upside-down 2, and a 9 that is the 6
// turned round.
//
// Minute turn: the changing tube's old cathode fades as the new one strikes:
// the glow runs over the wire from one point, then stutters twice before it
// holds. Everything happens after :00, so no instant shows a time early.
// Hour turn: the anti-cathode-poisoning roll. Every tube runs through all
// ten cathodes, front to back and round again, the glow leaping in depth,
// and they settle left to right, each with a strike and a pop of the supply;
// the INS-1s flash alternately while it runs. A settled tube always shows
// the new time, so what reads is a prefix of it.
//
// Pure function of the clock: transitions are keyed to fields.sec, the sway
// and gas flicker to absolute time through noise(). Distance fields for the
// ten numerals at their depths are computed once at load.
//
// Burn-in: the board, tubes and all walk a 2 px orbit; the glow itself moves
// a pixel with the parallax; 23:00-07:00 the panel dims.

import { dither, noise, orbit, previousMinute, clamp } from '../js/kit.js';

// ------------------------------------------------------------ geometry
// Tube-local coordinates: x 0..24 across the glass, y down the screen.

const TW = 25;
const TUBE_X = [5, 32, 71, 98];
const TUBE_Y = 2;                                        // headroom for the orbit
const COLON_X = 61;
const DIG_W = 15, DIG_H = 32, DIG_X = 4.5, DIG_Y = 14;
const STACK = [1, 6, 2, 7, 5, 0, 4, 9, 8, 3];          // front to back
const DEPTH = [];
STACK.forEach((d, k) => { DEPTH[d] = k; });
const MESH = { x0: 4, x1: 21, y0: 10, y1: 50 };         // the anode's honeycomb
const MAP = { x0: 0, y0: 8, w: TW, h: 46 };              // where distance fields live

/** An elliptical arc as points, clock angles in degrees (0 up, clockwise). */
function ell(cx, cy, rx, ry, a0, a1, step = 4) {
  const pts = [], n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step));
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return pts;
}

/** A superellipse (straight-sided oval), the IN-14 zero. */
function superEll(cx, cy, rx, ry, p) {
  const pts = [];
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * 2 * Math.PI, s = Math.sin(a), c = Math.cos(a);
    pts.push([cx + rx * Math.sign(s) * Math.abs(s) ** (2 / p), cy - ry * Math.sign(c) * Math.abs(c) ** (2 / p)]);
  }
  return pts;
}

const turn = (stroke) => stroke.map(([x, y]) => [DIG_W - x, DIG_H - y]);
const flip = (stroke) => stroke.map(([x, y]) => [x, DIG_H - y]);

// Centre-lines in a 15 x 32 box. 5 is 2 upside down and 9 is 6 turned
// round, as on the IN-14.
const TWO = [...ell(7.5, 7.5, 6.5, 6.5, 290, 480), [10.8, 15.5], [5.8, 23], [1, 31], [14, 31]];
const SIX = [...ell(7.5, 23, 6.5, 7.5, 270, 630), [1, 16], [1.5, 9], [3.2, 4], [6.5, 1.2], [10.5, 1.2], [12.8, 2.8]];
const NUMERALS = {
  0: [superEll(7.5, 16, 6.5, 15, 2.6)],
  1: [[[7.5, 1], [7.5, 31]]],
  2: [TWO],
  3: [[...ell(7.5, 7, 6, 6, 290, 525), [5.5, 14.3], ...ell(7.5, 22.5, 6.5, 8.5, 340, 600)]],
  4: [[[11, 31], [11, 1], [0.5, 21], [14.5, 21]]],
  5: [flip(TWO)],
  6: [SIX],
  7: [[[1, 1], [14, 1], [5, 31]]],
  8: [ell(7.5, 8, 5.5, 7, 0, 360), ell(7.5, 23.5, 6.5, 7.5, 0, 360)],
  9: [turn(SIX)],
};

/** Points every ~0.25 px along a set of strokes, scaled about the box centre. */
function samples(strokes, s) {
  const out = [];
  for (const st of strokes)
    for (let i = 1; i < st.length; i++) {
      const [ax, ay] = st[i - 1], [bx, by] = st[i];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.25));
      for (let k = 0; k <= n; k++) {
        const x = ax + ((bx - ax) * k) / n, y = ay + ((by - ay) * k) / n;
        out.push([DIG_X + 7.5 + (x - 7.5) * s, DIG_Y + 16 + (y - 16) * s]);
      }
    }
  return out;
}

/** Distance from each pixel centre of the map to the nearest sample. */
function field(pts) {
  const f = new Float32Array(MAP.w * MAP.h);
  for (let j = 0; j < MAP.h; j++)
    for (let i = 0; i < MAP.w; i++) {
      const x = MAP.x0 + i + 0.5, y = MAP.y0 + j + 0.5;
      let best = 1e9;
      for (const p of pts) {
        const dx = p[0] - x, dy = p[1] - y;
        const d = dx * dx + dy * dy;
        if (d < best) best = d;
      }
      f[j * MAP.w + i] = Math.sqrt(best);
    }
  return f;
}

// Deeper cathodes are drawn a touch smaller: 0.7% per place in the stack.
const FIELDS = Array.from({ length: 10 }, (_, d) => field(samples(NUMERALS[d], 1 - 0.007 * DEPTH[d])));
// The two decimal points: little wire rings low left and right.
const DP_FIELD = field([...ell(2.6, 45.5, 1, 1, 0, 360, 30), ...ell(22.4, 45.5, 1, 1, 0, 360, 30)]);

/** Distance at tube-local pixel (lx, ly), shifted sideways by `sh`. */
function at(f, lx, ly, sh = 0) {
  const i = lx - sh - MAP.x0, j = ly - MAP.y0;
  if (i < 0 || j < 0 || i >= MAP.w || j >= MAP.h) return 99;
  return f[j * MAP.w + i];
}

// The anode: a honeycomb of pointy-topped cells 6 px across, as a tile
// (a true hexagon grid at this pitch rasterises unevenly; this one is even).
const HEX = [
  '#...',
  '#...',
  '.#.#',
  '..#.',
  '..#.',
  '.#.#',
].map((r) => [...r].map((ch) => ch === '#'));
const onMesh = (x, y) => HEX[((y % 6) + 6) % 6][((x % 4) + 4) % 4];

// ------------------------------------------------------------ drawing

const halo = (d) => (d < 2.2 ? 1 : 0);

/**
 * One tube's insides. `lit` is a list of { d, v, spread } (cathode, level
 * 0..1, optional { x, y, r } the glow has reached); `p` the parallax sway,
 * `flick` a gas flicker that thins the halo.
 */
function drawStack(g, tx, ty, lit, p, flick, flash = 0) {
  const sh = (d) => Math.round(p * (DEPTH[d] - 4.5) / 4.5);
  const mesh = Math.round(p * -1.6);
  const front = lit.length ? Math.min(...lit.map((e) => DEPTH[e.d])) : 10;
  for (let ly = MESH.y0; ly < MESH.y1; ly++)
    for (let lx = 1; lx < TW - 1; lx++) {
      const X = tx + lx, Y = ty + ly;
      let core = 0, glow = 0, light = 0;
      for (const e of lit) {
        const d = at(FIELDS[e.d], lx, ly, sh(e.d));
        if (e.spread && Math.hypot(lx + 0.5 - e.spread.x, ly + 0.5 - e.spread.y) > e.spread.r) continue;
        if (d < 1.2) core = Math.max(core, e.v);
        else glow = Math.max(glow, e.v * halo(d) * flick);
        if (d < 6) light = Math.max(light, e.v * (1 - d / 6));
      }
      const inMesh = lx >= MESH.x0 && lx < MESH.x1;
      const m = inMesh && onMesh(lx - mesh + 1, ly + 2);
      if (core > 0) {
        if (dither(X - tx, Y - ty, core)) g.pixel(X, Y, 1);
        continue;
      }
      if (glow > 0) {
        if (m) continue;                       // the mesh in front of the glow
        let shadowed = false;                  // a cathode in front of the lit one
        for (let k = 0; k < front && !shadowed; k++) shadowed = at(FIELDS[STACK[k]], lx, ly, sh(STACK[k])) < 0.5;
        if (!shadowed && dither(X - tx, Y - ty, glow)) g.pixel(X, Y, 1);
        continue;
      }
      if (m) {
        // The mesh shows only when the gas flashes over it as a cathode strikes.
        if (flash > 0 && dither(X - tx, Y - ty, flash * (1 + light))) g.pixel(X, Y, 1);
        continue;
      }
      if (light > 0.3) continue;              // the glow drowns the wires near it
      let wire = at(DP_FIELD, lx, ly) < 0.55;
      for (let k = 0; k < 10 && !wire; k++) wire = at(FIELDS[STACK[k]], lx, ly, sh(STACK[k])) < 0.5;
      if (wire && dither(X - tx, Y - ty, 0.5)) g.pixel(X, Y, 1);
    }
}

/** Plot a list of [x, y] points (rounded) at an offset. */
function plot(g, pts, ox, oy, keep = () => true) {
  for (const [x, y] of pts) {
    const X = Math.round(x + ox - 0.5), Y = Math.round(y + oy - 0.5);
    if (keep(X - ox, Y - oy)) g.pixel(X, Y, 1);
  }
}

// The glass, as points in tube coordinates: the dome with its pumping tip,
// the walls, the rounded foot; the window highlight down the left.
const DOME = ell(12.5, 9.5, 12, 7.5, 272, 448, 2);
const FOOT = ell(12.5, 50.5, 12, 4, 92, 268, 3);
const TIP = [[11.5, 1.5], [12.5, 1.5], [13.5, 1.5], [12.5, 0.5]];
const GLINT = ell(12.5, 9.5, 9, 5.5, 296, 328, 3);

function drawGlass(g, tx, ty) {
  plot(g, DOME, tx, ty);
  plot(g, TIP, tx, ty);
  plot(g, FOOT, tx, ty, (x, y) => (x + y) % 2 === 0);
  plot(g, GLINT, tx, ty);
  for (let y = 10; y < 51; y++) {
    if ((y & 1) === 0) { g.pixel(tx, ty + y, 1); g.pixel(tx + TW - 1, ty + y, 1); }
    // the window reflected in the glass, in two panes
    if ((y >= 13 && y < 27) || (y >= 29 && y < 35)) g.pixel(tx + 2, ty + y, 1);
    if (y >= 15 && y < 21) g.pixel(tx + TW - 3, ty + y, 1);
  }
  // the anode frame's rivets, top and bottom
  g.fillRect(tx + 12, ty + 9, 1, 2, 1);
  g.fillRect(tx + 12, ty + 49, 1, 2, 1);
  // leads down through the pinch, and the pins into the board
  for (const x of [6, 9, 12, 15, 18]) {
    for (let y = 51; y < 54; y += 2) g.pixel(tx + x, ty + y, 1);
    g.vline(tx + x, ty + 55, 4, 1);
  }
}

// The capsule's outline as pixels in order round it, so it can be dotted.
const CAPSULE = [[1, 0], [2, 0], [3, 0], [4, 1], [4, 2], [4, 3], [4, 4], [4, 5], [4, 6], [4, 7], [3, 8], [2, 8], [1, 8],
  [0, 7], [0, 6], [0, 5], [0, 4], [0, 3], [0, 2], [0, 1]];

/** An INS-1 neon: a little glass capsule with its glow, on long leads. */
function drawIns(g, x, y, on, legTo, tip = 0, phase = 0) {
  // dotted glass, the dots changing places each minute (wear)
  CAPSULE.forEach(([cx, cy], i) => { if ((i + phase) % 2 === 0) g.pixel(x + cx, y + cy, 1); });
  for (let yy = y + 9; yy < legTo; yy += 2) { g.pixel(x + 1, yy, 1); g.pixel(x + 3, yy + 1, 1); }
  if (!on) { g.pixel(x + 2, y + 3, 1); g.pixel(x + 2, y + 5, 1); return; }
  g.fillWhere((px, py) => {
    const d = Math.hypot(px - (x + 2.5), py - (y + 4.5 + tip));
    return d <= 1.6 ? true : d <= 3.6 ? 0.5 - 0.4 * (d - 1.6) / 2 : false;
  }, 1, [x - 2, y - 1, 9, 11]);
}

// ------------------------------------------------------------ timing

const SETTLE = [1.3, 1.75, 2.2, 2.65];   // hour roll: when each tube lands
const RATE = [16, 19, 17, 21];            // cathodes per second in the roll, per tube
const DAY = 0xcf, NIGHT = 0x20;
const digitsOf = (f) => [...`${f.hh}${f.mm}`].map(Number);

/**
 * The glow changing cathode, `s` seconds into it: the old one fades, the
 * new one runs over its wire from one point and stutters before it holds.
 */
function strike(s, from, to, seed) {
  const lit = [];
  if (from !== null && s < 0.22) lit.push({ d: from, v: 1 - s / 0.22 });
  if (s >= 0.03) {
    let v = 1;
    const slot = Math.floor(s * 20);
    if (s > 0.22 && s < 0.5 && noise(slot, seed) < 0.35) v = 0.4;
    const top = noise(seed, 7) < 0.5;
    const spread = { x: DIG_X + 3 + 9 * noise(seed, 8), y: DIG_Y + (top ? 2 : 30), r: ((s - 0.03) / 0.16) * 40 };
    lit.push({ d: to, v, spread: spread.r < 40 ? spread : null });
  }
  return lit;
}

export default {
  name: 'Nixie',
  blurb: 'Four IN-14 Nixie tubes: wire numerals stacked in the glass, a glow behind the honeycomb anode, and the anti-poisoning roll on the hour.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { fields: f, date, oled, night }) {
    const sec = f.sec, t = date.getTime() / 1000;
    const [ox, oy] = orbit(date, 2, 3);
    const now = digitsOf(f), was = digitsOf(previousMinute(date));
    const key = f.minuteKey % 9973;
    const hourTurn = f.m === 0 && sec < SETTLE[3] + 0.8;
    let c = DAY + (NIGHT - DAY) * night;

    // The viewpoint sways a little: the stack shifts in parallax.
    const p = 1.2 * Math.sin((2 * Math.PI * t) / 41) + 0.4 * Math.sin((2 * Math.PI * t) / 13.7);

    for (let i = 0; i < 4; i++) {
      const tx = TUBE_X[i] + ox, ty = TUBE_Y + oy;
      let lit, flash = 0;
      const ion = (s) => (s >= 0.03 && s < 0.5 ? (1 - (s - 0.03) / 0.47) ** 1.5 : 0);
      if (hourTurn && sec < SETTLE[i]) {
        // Two cathodes share the glow as it hops back through the stack,
        // so a still of the roll never reads as a time.
        const left = (SETTLE[i] - sec) * RATE[i], n = Math.ceil(left), ph = n - left;
        const k = (((DEPTH[now[i]] - n) % 10) + 10) % 10;
        lit = [{ d: STACK[k], v: 0.95 - 0.5 * ph }, { d: STACK[(k + 1) % 10], v: 0.4 + 0.5 * ph }];
      } else if (hourTurn) {
        const s = sec - SETTLE[i];
        if (s < 0.07) c = Math.min(255, c * 1.3);
        lit = strike(s + 0.03, null, now[i], key + i);
        flash = ion(s + 0.03);
      } else if (now[i] !== was[i] && sec < 0.6) {
        lit = strike(sec, was[i], now[i], key + i);
        flash = ion(sec);
      } else lit = [{ d: now[i], v: 1 }];
      // Neon gas: now and then the glow thins for a frame or two.
      const flick = noise(Math.floor(t * 20) + i * 977, 5) < 0.015 ? 0.45 : 1;
      drawStack(g, tx, ty, lit, p, flick, flash);
      drawGlass(g, tx, ty);
    }

    // The INS-1 pair blinks the seconds; in the roll they flash in turn.
    // They walk their own wider orbit, out of step with the tubes, and the
    // glow sits on whichever electrode tip it struck on this minute.
    const [qx, qy] = orbit(new Date(date.getTime() + 7 * 60000), 2, 2);
    const cx = COLON_X + qx, cy = qy;
    const tipY = Math.floor(noise(key, 61) * 3) - 1;
    let up = sec % 1 < 0.5, down = up;
    if (hourTurn) { up = Math.floor(sec * 8) % 2 === 0; down = !up; }
    drawIns(g, cx, 20 + cy, up, 34 + cy, tipY, f.m);
    drawIns(g, cx, 35 + cy, down, 61 + oy, -tipY, f.m);

    // The board the tubes stand in.
    for (let x = 0; x < 128; x++) if ((x + ox) % 2 === 0) g.pixel(x, 61 + oy, 1);

    oled.contrast(c);
  },
};
