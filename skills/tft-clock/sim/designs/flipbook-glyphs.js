// flipbook: the hand-written numerals, and what each one turns into.
//
// The numerals are quick pencil handwriting in a unit box (u right, v down,
// 0..1), split into strokes at the corners a hand would stop at. Each digit
// has a doodle hidden in it, the old game of drawing animals out of
// numbers: the 2 is a swan, the 4 a sailboat, the 9 a balloon. A doodle is
// the numeral itself plus a few extra marks (`extras`), so while it plays
// the numeral is still there, inked in graphite, inside the drawing.
//
// extras(phi, kind, p) returns marks in the same unit box:
//   { p: [[u, v], ...], c, sharp?, w? }       a pencil line
//   { h: [[u, v], ...], c }                   coloured-pencil hatching inside a polygon
//   { d: [u, v], r, c }                       a pressed dot (r in px)
//   fixed: true                               stays where the numeral was (smoke left behind)
// phi: seconds, for idle wiggles; kind: 'idle' | 'exit' | 'enter'; p: progress of the move.
// move(kind, p, x, y, w, h) gives the whole doodle's offset { dx, dy, rot } while it leaves
// or arrives; idle(phi, grow) its small in-place act.

import { sin, cos, ease, clamp } from '../js/kit.js';

export const INK = {
  graphite: 0x2c2c34,
  red: 0xc8322a,
  orange: 0xe2761e,
  blue: 0x2f62b8,
  green: 0x3d8a3a,
  brown: 0x8a5426,
  sky: 0x6f9fd8,
};

function ell(cx, cy, rx, ry, a0, n, turns = 1, over = 0) {
  const pts = [];
  const m = Math.round(n * turns) + over;
  for (let i = 0; i <= m; i++) {
    const a = a0 - (i / n) * Math.PI * 2;
    pts.push([cx + rx * cos(a), cy + ry * sin(a)]);
  }
  return pts;
}

/** Strokes of each numeral, in a unit box. */
export const DIGITS = {
  0: [ell(0.5, 0.5, 0.44, 0.49, -Math.PI / 2 + 0.35, 16, 1, 2)],
  1: [[[0.16, 0.25], [0.56, 0.0]], [[0.56, 0.0], [0.545, 0.5], [0.53, 1.0]]],
  2: [[[0.06, 0.27], [0.16, 0.1], [0.36, 0.01], [0.6, 0.0], [0.82, 0.1], [0.9, 0.28], [0.83, 0.47], [0.62, 0.66], [0.34, 0.84], [0.05, 1.0]],
    [[0.05, 1.0], [0.5, 0.985], [0.97, 0.98]]],
  3: [[[0.08, 0.13], [0.3, 0.02], [0.58, 0.0], [0.8, 0.09], [0.86, 0.24], [0.74, 0.39], [0.44, 0.47]],
    [[0.44, 0.47], [0.74, 0.53], [0.93, 0.68], [0.9, 0.85], [0.74, 0.97], [0.46, 1.0], [0.18, 0.95], [0.03, 0.83]]],
  4: [[[0.7, 0.0], [0.05, 0.66]], [[0.05, 0.66], [0.98, 0.66]], [[0.7, 0.0], [0.7, 0.5], [0.7, 1.0]]],
  5: [[[0.92, 0.02], [0.55, 0.02], [0.22, 0.03]], [[0.22, 0.03], [0.17, 0.45]],
    [[0.17, 0.45], [0.42, 0.37], [0.68, 0.4], [0.88, 0.53], [0.94, 0.72], [0.85, 0.89], [0.63, 0.99], [0.38, 1.0], [0.16, 0.93], [0.03, 0.82]]],
  6: [[[0.86, 0.07], [0.62, 0.0], [0.38, 0.07], [0.2, 0.24], [0.1, 0.46], [0.08, 0.7], [0.16, 0.88], [0.36, 0.99], [0.62, 0.99],
    [0.84, 0.88], [0.92, 0.7], [0.84, 0.53], [0.64, 0.43], [0.38, 0.43], [0.18, 0.52], [0.09, 0.64]]],
  7: [[[0.03, 0.04], [0.5, 0.03], [0.97, 0.02]], [[0.97, 0.02], [0.76, 0.3], [0.57, 0.62], [0.42, 1.0]]],
  8: [ell(0.5, 0.245, 0.33, 0.245, -Math.PI / 2, 12, 1, 1), ell(0.5, 0.73, 0.43, 0.27, -Math.PI / 2, 14, 1, 1)],
  9: [ell(0.47, 0.28, 0.4, 0.28, 0, 14, 1, 1), [[0.87, 0.24], [0.86, 0.62], [0.8, 1.0]]],
};

/** THE END, for the last page of the hour. */
export const LETTERS = {
  T: [[[0, 0], [1, 0]], [[0.5, 0], [0.5, 1]]],
  H: [[[0, 0], [0, 1]], [[1, 0], [1, 1]], [[0, 0.5], [1, 0.5]]],
  E: [[[1, 0], [0, 0]], [[0, 0], [0, 1]], [[0, 1], [1, 1]], [[0, 0.5], [0.75, 0.5]]],
  N: [[[0, 1], [0, 0]], [[0, 0], [1, 1]], [[1, 1], [1, 0]]],
  D: [[[0, 0], [0, 1]], [[0, 0], [0.5, 0.02], [0.88, 0.22], [1, 0.5], [0.88, 0.78], [0.5, 0.98], [0, 1]]],
  ' ': [],
};

const G = INK.graphite;
const rot = (pts, cx, cy, a) => {
  const c = cos(a), s = sin(a);
  return pts.map(([u, v]) => [cx + (u - cx) * c - (v - cy) * s, cy + (u - cx) * s + (v - cy) * c]);
};
const wave = (u0, u1, v, amp, ph, n = 8) => {
  const pts = [];
  for (let i = 0; i <= n; i++) { const u = u0 + ((u1 - u0) * i) / n; pts.push([u, v + amp * sin(i * 1.7 + ph)]); }
  return pts;
};
const circ = (cu, cv, ru, rv, n = 8) => ell(cu, cv, ru, rv, 0, n, 1, 0);

// Off the page: the numeral leaves (or arrives) by the doodle's own means.
const OFF_L = (x) => -(x + 52), OFF_R = (x) => 178 - x, OFF_U = (y) => -(y + 70), OFF_D = (y) => 84 - y;

export const DOODLES = {
  0: { // a fish, nose to the left
    name: 'fish',
    extras(phi, kind) {
      const wag = sin(phi * (kind === 'idle' ? 7 : 16)) * 0.28;
      const tail = rot([[0.94, 0.5], [1.34, 0.26], [1.26, 0.5], [1.34, 0.74]], 0.94, 0.5, wag);
      const b = (phi * 0.5) % 1;
      return [
        { d: [0.3, 0.33], r: 1.7, c: G },
        { p: tail.concat([tail[0]]), c: INK.orange, sharp: true },
        { h: tail, c: INK.orange },
        { p: [[0.42, 0.04], [0.56, -0.13], [0.72, 0.05]], c: INK.orange, sharp: true },
        { p: [[0.5, 0.26], [0.56, 0.5], [0.5, 0.74]], c: G, w: 1 },
        { h: [[0.62, 0.12], [0.88, 0.32], [0.88, 0.68], [0.62, 0.88], [0.56, 0.5]], c: INK.orange },
        { p: circ(-0.12, 0.42 - b * 0.4, 0.07, 0.05, 6), c: INK.sky, w: 1 },
        { p: circ(-0.22, 0.2 - b * 0.3, 0.05, 0.035, 6), c: INK.sky, w: 1 },
      ];
    },
    idle: (phi, k) => ({ dx: 0, dy: sin(phi * 3) * 1.2 * k, rot: 0 }),
    move(kind, p, x, y) {
      const e = kind === 'exit' ? ease.inQuad(p) : 1 - ease.outQuad(p);
      return { dx: (kind === 'exit' ? OFF_L(x) : OFF_R(x)) * e, dy: sin(p * 14) * 2, rot: 0 };
    },
  },

  1: { // a rocket
    name: 'rocket',
    extras(phi, kind, p) {
      const fl = 0.22 + 0.07 * sin(phi * 40) + (kind === 'idle' ? 0 : 0.12);
      const out = [
        { p: [[0.5, 0.66], [0.18, 0.96], [0.5, 0.9]], c: INK.red, sharp: true },
        { h: [[0.5, 0.66], [0.18, 0.96], [0.5, 0.9]], c: INK.red },
        { p: [[0.58, 0.66], [0.9, 0.96], [0.58, 0.9]], c: INK.red, sharp: true },
        { h: [[0.58, 0.66], [0.9, 0.96], [0.58, 0.9]], c: INK.red },
        { p: circ(0.56, 0.36, 0.14, 0.08, 8).concat([[0.7, 0.36]]), c: INK.blue },
        { p: [[0.36, 1.03], [0.53, 1.03 + fl], [0.7, 1.03]], c: INK.red, sharp: true },
        { h: [[0.36, 1.03], [0.53, 1.03 + fl], [0.7, 1.03]], c: INK.orange },
      ];
      if (kind === 'exit') {
        const r = 0.08 + p * 0.5;
        for (let i = 0; i < 3; i++)
          out.push({ p: circ(0.53 + (i - 1) * (0.2 + p * 0.6), 1.08 - p * 0.05, r * 0.7, r * 0.22, 8).concat([[0.53 + (i - 1) * (0.2 + p * 0.6) + r * 0.7, 1.08 - p * 0.05]]), c: G, w: 1, fixed: true });
      }
      return out;
    },
    idle: (phi, k) => ({ dx: 0, dy: -k * 2 + sin(phi * 9) * 0.5 * k, rot: 0 }),
    move(kind, p, x, y) {
      return kind === 'exit' ? { dx: 0, dy: OFF_U(y) * p * p, rot: 0 } : { dx: 0, dy: OFF_U(y) * (1 - ease.outCubic(p)), rot: 0 };
    },
  },

  2: { // a swan, its head the start of the stroke
    name: 'swan',
    extras(phi) {
      return [
        { d: [0.17, 0.2], r: 1.4, c: G },
        { p: [[0.07, 0.24], [-0.16, 0.3], [0.05, 0.34]], c: INK.orange, sharp: true },
        { h: [[0.07, 0.24], [-0.16, 0.3], [0.05, 0.34]], c: INK.orange },
        { p: [[0.32, 0.86], [0.46, 0.72], [0.6, 0.82], [0.74, 0.7], [0.92, 0.84]], c: G, w: 1 },
        { p: [[0.97, 0.98], [1.12, 0.8], [1.06, 0.98]], c: G, w: 1, sharp: true },
        { p: wave(-0.2, 1.25, 1.13, 0.03, phi * 5), c: INK.blue },
        { p: wave(0.1, 0.9, 1.25, 0.025, phi * 5 + 2, 6), c: INK.sky, w: 1 },
      ];
    },
    idle: (phi, k) => ({ dx: 0, dy: sin(phi * 2.4) * k, rot: 0 }),
    move(kind, p, x) {
      const e = kind === 'exit' ? ease.inQuad(p) : 1 - ease.outQuad(p);
      return { dx: (kind === 'exit' ? OFF_R(x) : OFF_L(x)) * e, dy: sin(p * 9), rot: 0 };
    },
  },

  3: { // a plump bird facing right
    name: 'bird',
    extras(phi, kind) {
      const flap = kind === 'idle' ? 0.1 * sin(phi * 3) : 0.34 * sin(phi * 22);
      return [
        { d: [0.64, 0.19], r: 1.5, c: G },
        { p: [[0.84, 0.17], [1.1, 0.25], [0.84, 0.32]], c: INK.orange, sharp: true },
        { h: [[0.84, 0.17], [1.1, 0.25], [0.84, 0.32]], c: INK.orange },
        { p: [[0.38, 0.02], [0.3, -0.14]], c: G, w: 1 },
        { p: [[0.47, 0.0], [0.46, -0.15]], c: G, w: 1 },
        { p: [[0.3, 0.55], [-0.12, 0.42 - flap], [0.12, 0.66]], c: INK.blue, sharp: true },
        { h: [[0.3, 0.55], [-0.12, 0.42 - flap], [0.12, 0.66]], c: INK.sky },
        { p: [[0.04, 0.84], [-0.18, 0.96]], c: G, w: 1 },
        { p: [[0.06, 0.8], [-0.16, 0.8]], c: G, w: 1 },
        { p: [[0.42, 1.0], [0.4, 1.17], [0.3, 1.2]], c: INK.orange, w: 1, sharp: true },
        { p: [[0.6, 1.0], [0.62, 1.17], [0.72, 1.19]], c: INK.orange, w: 1, sharp: true },
      ];
    },
    idle: (phi, k) => ({ dx: 0, dy: -Math.abs(sin(phi * 4)) * 3 * k, rot: 0 }),
    move(kind, p, x, y) {
      if (kind === 'exit') { const e = ease.inQuad(p); return { dx: 130 * e, dy: OFF_U(y) * e, rot: -0.2 * e }; }
      const e = 1 - ease.outCubic(p);
      return { dx: -(x + 40) * e, dy: OFF_U(y) * e, rot: 0.2 * e };
    },
  },

  4: { // a sailboat: the closed 4 is the sail
    name: 'sailboat',
    extras(phi) {
      return [
        { h: [[0.66, 0.08], [0.13, 0.62], [0.66, 0.62]], c: INK.blue },
        { p: [[-0.06, 1.0], [1.06, 1.0], [0.86, 1.18], [0.1, 1.18], [-0.06, 1.0]], c: INK.brown, sharp: true },
        { h: [[-0.06, 1.0], [1.06, 1.0], [0.86, 1.18], [0.1, 1.18]], c: INK.brown },
        { p: [[0.71, 0.0], [0.96, -0.07 + 0.03 * sin(phi * 12)], [0.71, -0.13]], c: INK.red, sharp: true },
        { p: wave(-0.25, 1.3, 1.24, 0.035, phi * 4), c: INK.blue },
      ];
    },
    idle: (phi, k) => ({ dx: 0, dy: sin(phi * 2.2 + 1) * k, rot: sin(phi * 2.2) * 0.07 * k }),
    move(kind, p, x) {
      const e = kind === 'exit' ? ease.inQuad(p) : 1 - ease.outQuad(p);
      return { dx: (kind === 'exit' ? OFF_R(x) : OFF_L(x)) * e, dy: sin(p * 10) * 1.5, rot: sin(p * 10) * 0.08 };
    },
  },

  5: { // a snake, head at the tail of the stroke
    name: 'snake',
    extras(phi) {
      const flick = sin(phi * 6) > 0;
      const out = [
        { p: circ(0.0, 0.8, 0.1, 0.065, 8).concat([[0.1, 0.8]]), c: INK.green },
        { d: [-0.02, 0.77], r: 1.2, c: G },
        { p: [[0.94, -0.03], [0.99, 0.07], [1.04, -0.03], [1.09, 0.07], [1.14, -0.02]], c: G, w: 1, sharp: true },
        { p: [[0.4, 0.31], [0.42, 0.45]], c: INK.green, w: 2 },
        { p: [[0.72, 0.33], [0.65, 0.47]], c: INK.green, w: 2 },
        { p: [[0.98, 0.6], [0.86, 0.66]], c: INK.green, w: 2 },
        { p: [[0.97, 0.88], [0.85, 0.82]], c: INK.green, w: 2 },
        { p: [[0.64, 1.06], [0.64, 0.93]], c: INK.green, w: 2 },
        { p: [[0.36, 1.06], [0.38, 0.94]], c: INK.green, w: 2 },
      ];
      if (flick) out.splice(2, 0, { p: [[-0.1, 0.84], [-0.22, 0.86], [-0.28, 0.8]], c: INK.red, w: 1, sharp: true },
        { p: [[-0.22, 0.86], [-0.28, 0.93]], c: INK.red, w: 1 });
      return out;
    },
    idle: (phi, k) => ({ dx: 0, dy: 0, rot: sin(phi * 2) * 0.05 * k }),
    move(kind, p, x) {
      const e = kind === 'exit' ? ease.inQuad(p) : 1 - ease.outQuad(p);
      return { dx: (kind === 'exit' ? OFF_L(x) : OFF_R(x)) * e, dy: sin(p * 16) * 2.5, rot: sin(p * 16 + 1) * 0.08 };
    },
  },

  6: { // a snail: the loop is the shell, the stem its neck
    name: 'snail',
    extras(phi) {
      const wig = sin(phi * 5) * 0.04;
      const spiral = [];
      for (let i = 0; i <= 14; i++) { const a = i * 0.75, r = 0.3 * (1 - i / 17); spiral.push([0.5 + r * cos(a) * 1.1, 0.71 + r * sin(a) * 0.85]); }
      return [
        { d: [0.74, 0.09], r: 1.3, c: G },
        { p: [[0.8, 0.04], [0.74 + wig, -0.14]], c: G, w: 1 },
        { d: [0.74 + wig, -0.15], r: 1.1, c: G },
        { p: [[0.86, 0.05], [0.98 - wig, -0.11]], c: G, w: 1 },
        { d: [0.98 - wig, -0.12], r: 1.1, c: G },
        { p: spiral, c: INK.brown, w: 1 },
        { h: [[0.2, 0.5], [0.5, 0.42], [0.82, 0.52], [0.9, 0.72], [0.8, 0.92], [0.5, 0.98], [0.2, 0.9], [0.1, 0.7]], c: INK.orange },
        { p: [[0.3, 1.04], [0.9, 1.05], [1.22, 1.02], [1.3, 0.93]], c: G, w: 1 },
        { p: [[-0.35, 1.08], [-0.25, 1.08]], c: INK.sky, w: 1 },
        { p: [[-0.15, 1.08], [-0.05, 1.08]], c: INK.sky, w: 1 },
      ];
    },
    idle: (phi, k) => ({ dx: sin(phi * 1.3) * 1.5 * k, dy: 0, rot: 0 }),
    move(kind, p, x) {
      const e = kind === 'exit' ? ease.inQuad(p) : 1 - ease.outQuad(p);
      return { dx: (kind === 'exit' ? OFF_R(x) : OFF_L(x)) * e, dy: 0, rot: sin(p * 20) * 0.03 };
    },
  },

  7: { // a boomerang
    name: 'boomerang',
    extras(phi, kind) {
      const out = [
        { p: [[0.03, -0.1], [0.6, -0.11], [1.12, -0.1], [0.86, 0.34], [0.64, 0.68], [0.52, 1.03]], c: INK.brown, sharp: true },
        { p: [[0.03, -0.1], [0.03, 0.04]], c: INK.brown, w: 1 },
        { p: [[0.42, 1.0], [0.52, 1.03]], c: INK.brown, w: 1 },
        { h: [[0.03, -0.09], [1.1, -0.09], [0.6, 0.7], [0.48, 1.02], [0.42, 1.0], [0.6, 0.55], [0.95, 0.03], [0.03, 0.04]], c: INK.brown },
        { p: [[0.3, -0.04], [0.36, -0.04]], c: INK.red, w: 1 },
        { p: [[0.6, -0.04], [0.66, -0.04]], c: INK.red, w: 1 },
      ];
      if (kind !== 'idle' || (phi > 3.4 && phi < 5.0)) {
        out.push({ p: ell(0.5, 0.5, 0.85, 0.85, 0.4, 16, 0.3), c: G, w: 1 });
        out.push({ p: ell(0.5, 0.5, 0.95, 0.95, 3.5, 16, 0.25), c: G, w: 1 });
      }
      return out;
    },
    idle: (phi, k) => ({ dx: 0, dy: 0, rot: k >= 1 ? Math.PI * 2 * ease.inOutCubic(clamp((phi - 3.4) / 1.6, 0, 1)) : 0 }),
    move(kind, p, x, y) {
      if (kind === 'exit') { const e = ease.inQuad(p); return { dx: OFF_R(x) * e, dy: -50 * sin(Math.PI * e * 0.8), rot: Math.PI * 6 * e }; }
      const e = 1 - ease.outCubic(p);
      return { dx: OFF_R(x) * e, dy: -40 * sin(Math.PI * e), rot: -Math.PI * 6 * e };
    },
  },

  8: { // a snowman
    name: 'snowman',
    extras(phi, kind) {
      const wave = kind === 'idle' ? 0.16 * sin(phi * 6) : 0.06 * sin(phi * 12);
      return [
        { p: [[0.12, 0.02], [0.88, -0.01]], c: G, w: 2 },
        { h: [[0.28, 0.0], [0.3, -0.26], [0.7, -0.27], [0.72, -0.01]], c: G },
        { p: [[0.28, 0.0], [0.3, -0.26], [0.7, -0.27], [0.72, -0.01]], c: G, w: 1, sharp: true },
        { d: [0.38, 0.17], r: 1.4, c: G },
        { d: [0.62, 0.17], r: 1.4, c: G },
        { p: [[0.5, 0.25], [0.8, 0.3], [0.5, 0.33]], c: INK.orange, sharp: true },
        { p: [[0.2, 0.47], [0.5, 0.5], [0.8, 0.47]], c: INK.red, w: 2 },
        { p: [[0.68, 0.49], [0.8, 0.68]], c: INK.red, w: 2 },
        { d: [0.5, 0.62], r: 1.3, c: G },
        { d: [0.5, 0.8], r: 1.3, c: G },
        { p: [[0.1, 0.6], [-0.24, 0.44], [-0.33, 0.36]], c: INK.brown, w: 1 },
        { p: [[0.9, 0.6], [1.22, 0.42 - wave * 2], [1.3, 0.3 - wave * 3]], c: INK.brown, w: 1 },
        { p: wave0(), c: INK.sky, w: 1 },
      ];
    },
    idle: () => ({ dx: 0, dy: 0, rot: 0 }),
    move(kind, p, x) {
      const e = kind === 'exit' ? p : 1 - p;
      return { dx: (kind === 'exit' ? OFF_R(x) : OFF_L(x)) * e, dy: -Math.abs(sin(Math.PI * 5 * p)) * 7, rot: 0 };
    },
  },

  9: { // a balloon on its string
    name: 'balloon',
    extras(phi) {
      const s = sin(phi * 3) * 0.05;
      return [
        { h: [[0.1, 0.2], [0.3, 0.03], [0.62, 0.02], [0.84, 0.18], [0.84, 0.4], [0.62, 0.54], [0.3, 0.54], [0.1, 0.38]], c: INK.red },
        { p: [[0.82, 0.5], [0.92, 0.58], [0.76, 0.58], [0.82, 0.5]], c: INK.red, sharp: true },
        { p: [[0.8, 1.0], [0.86 + s, 1.12], [0.76 - s, 1.24], [0.82 + s, 1.36]], c: G, w: 1 },
      ];
    },
    idle: (phi, k) => ({ dx: 0, dy: -sin(phi * 1.3) * 1.5 * k, rot: sin(phi * 1.8) * 0.07 * k }),
    move(kind, p, x, y) {
      if (kind === 'exit') { const e = ease.inQuad(p); return { dx: sin(p * 7) * 4, dy: OFF_U(y) * e, rot: sin(p * 7) * 0.08 }; }
      const e = 1 - ease.outCubic(p);
      return { dx: sin(p * 7) * 4, dy: OFF_D(y) * e, rot: sin(p * 7) * 0.08 };
    },
  },
};

function wave0() { return [[-0.12, 1.03], [0.3, 1.01], [0.7, 1.04], [1.12, 1.02]]; }
