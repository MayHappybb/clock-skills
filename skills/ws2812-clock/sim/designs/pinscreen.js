// Pinscreen: the pin-art desk toy, 64 x 64 polished steel pins (one every
// other LED) in a black frame, seen nearly head-on under one low, drifting
// lamp. The frame's lip keeps the low lamp off the resting pins, so only
// what is pushed out catches the light. A fingertip behind
// the screen WRITES the time: every numeral is the relief its round tip left
// as it travelled, so the letterforms are a fingertip's handwriting in pins.
// Each raised pin shows its head displaced toward you, its lit shaft, and the
// shadow it throws across its neighbours.
//
// Alive: a slow swell rolls through the pins, the lamp swings, and a steel
// ball rolls round behind the frame once a minute (the seconds).
// Minute: a palm presses the old numeral flat from the front, then the
// fingertip writes the new one from behind, pins springing up in its wake.
// Hour: the owner's frog presses its face through the empty lower-left
// quarter, the bump runs out through every pin as a ring wave, the frog
// glances at the new hour and the new minutes as they are written, blinks,
// and sinks back.
import * as kit from '../js/kit.js';
import { buildGlyph } from './pinscreen-glyphs.js';
import { frogHeight, FROG } from './pinscreen-frog.js';
import { makeLight } from './pinscreen-light.js';

const N = 64, PITCH = 2, ORG = 1;            // pin lattice in grid px
const NP = N * N;
const ZPX = 9;                               // relief height 1 = 9 px of travel
const SV = [1.4, -3.2];                      // head shift in px per unit Z (eye below-left)
const LIGHT = makeLight(N, PITCH, ORG);

// slots: x, y (top-left of the glyph box, px), box w, h, finger radius, slant
const SLOTS = [
  { x: 6, y: 7, w: 29, h: 60, R: 5.6, slant: 0.2 },
  { x: 42, y: 7, w: 29, h: 60, R: 5.6, slant: 0.2 },
  { x: 62, y: 74, w: 22, h: 44, R: 4.6, slant: 0.2 },
  { x: 92, y: 74, w: 22, h: 44, R: 4.6, slant: 0.2 },
];

const KEY = kit.scale(kit.blackbody(4200), 3.4), FILL = kit.hex('#4a6cc8');

const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => pad(d.getHours()) + pad(d.getMinutes());

// ------------------------------------------------------------ caches
const pinX = new Float32Array(NP), pinY = new Float32Array(NP);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { pinX[j * N + i] = ORG + i * PITCH; pinY[j * N + i] = ORG + j * PITCH; }

/** Per slot and digit: the pins it raises, their relief and when the finger reaches them. */
const glyphCache = new Map();
function slotGlyph(s, d) {
  const k = s * 10 + d;
  if (glyphCache.has(k)) return glyphCache.get(k);
  const S = SLOTS[s], g = buildGlyph(d, S);
  const pins = [], prof = [], arc = [];
  for (let p = 0; p < NP; p++) {
    const gx = pinX[p] - S.x + g.pad, gy = pinY[p] - S.y + g.pad;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    if (x0 < 0 || y0 < 0 || x0 + 1 >= g.W || y0 + 1 >= g.H) continue;
    const fx = gx - x0, fy = gy - y0, c = y0 * g.W + x0;
    const v = (g.prof[c] * (1 - fx) + g.prof[c + 1] * fx) * (1 - fy) + (g.prof[c + g.W] * (1 - fx) + g.prof[c + g.W + 1] * fx) * fy;
    if (v < 0.04) continue;
    let a = 2;
    for (const cc of [c, c + 1, c + g.W, c + g.W + 1]) if (g.prof[cc] > 0) a = Math.min(a, g.arc[cc]);
    pins.push(p); prof.push(v); arc.push(Math.min(1, a));
  }
  const path = g.path.samples.map((q) => ({ x: q.x + S.x, y: q.y + S.y, a: q.a, stroke: q.stroke }));
  const out = { pins: Int32Array.from(pins), prof: Float32Array.from(prof), arc: Float32Array.from(arc), path, R: S.R };
  glyphCache.set(k, out);
  return out;
}

// ------------------------------------------------------------ motion
/** A pin let go at its new height: overshoot and settle. */
const spring = (t) => (t <= 0 ? 0 : 1 - Math.exp(-t * 9) * Math.cos(t * 24));

const T_FLAT = 0.55, T_WRITE0 = 0.45, T_WRITE = 1.45;   // minute turn timing (s)

/** Where the finger is at writing fraction u, and whether it is down. */
function fingerAt(path, u) {
  let lo = 0, hi = path.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (path[m].a < u) lo = m; else hi = m; }
  return path[hi];
}

// ------------------------------------------------------------ frame buffers
const Z = new Float32Array(NP);
let img = null, zb = null;

export default {
  name: 'Pinscreen',
  blurb: 'a pin-art toy: a fingertip behind the pins writes the time in relief; a palm wipes it, the frog presses through on the hour',
  layouts: ['hub-2x2'], look: 'smoke', fps: 60, brightness: 0.5, dither: true,
  frame(ctx) {
    const G = kit.grid(ctx), W = G.w, H = G.h;
    if (!img || img.length !== 3 * W * H) { img = new Float32Array(3 * W * H); zb = new Float32Array(W * H); }
    img.fill(0); zb.fill(-9);
    const now = ctx.date.getTime() / 1000, M = Math.floor(now / 60) * 60, age = now - M;
    const cur = digitsOf(ctx.date), prev = digitsOf(new Date((M - 60) * 1000));
    const hourTurn = ctx.date.getMinutes() === 0;
    const t = now % 86400;

    // --- heights: the swell
    for (let p = 0; p < NP; p++) {
      const x = pinX[p], y = pinY[p];
      Z[p] = 0.07 * Math.sin(x * 0.05 + y * 0.03 - t * 1.1) + 0.05 * Math.sin(x * 0.024 - y * 0.06 - t * 0.71);
    }

    // --- the digits
    const fingers = [];
    for (let s = 0; s < 4; s++) {
      const dNew = +cur[s], dOld = +prev[s];
      const changed = dNew !== dOld && age < T_WRITE0 + T_WRITE + 1.5;
      if (changed) {
        // old: palm presses it flat, pins bounce a little as it lifts
        if (age < T_FLAT + 0.6) {
          const g = slotGlyph(s, dOld);
          for (let k = 0; k < g.pins.length; k++) {
            const p = g.pins[k];
            const q = kit.clamp((age - 0.08 * (pinX[p] - SLOTS[s].x) / 40) / (T_FLAT - 0.08));
            const z = g.prof[k] * (1 - kit.ease.inOut(q)) - (q >= 1 ? 0.06 * Math.exp(-(age - T_FLAT) * 7) * Math.sin((age - T_FLAT) * 30) : 0);
            if (z > Z[p] || q >= 1) Z[p] += z;
          }
        }
        // new: the fingertip writes it
        const g = slotGlyph(s, dNew), u = (age - T_WRITE0) / T_WRITE;
        if (u > 0) {
          for (let k = 0; k < g.pins.length; k++) {
            const tau = (u - g.arc[k]) * T_WRITE;
            if (tau > 0) Z[g.pins[k]] += g.prof[k] * spring(tau);
          }
          if (u < 1) fingers.push({ f: fingerAt(g.path, u), R: g.R });
        }
      } else {
        const g = slotGlyph(s, dNew);
        for (let k = 0; k < g.pins.length; k++) Z[g.pins[k]] += g.prof[k];
      }
    }
    // the fingertip itself pushes its pins further out
    for (const { f, R } of fingers) {
      const r = R * 1.7;
      for (let p = 0; p < NP; p++) {
        const dx = pinX[p] - f.x, dy = pinY[p] - f.y, q = 1 - (dx * dx + dy * dy) / (r * r);
        if (q > 0) Z[p] += 0.7 * q * q;
      }
    }

    // --- seconds: a steel ball rolling round behind the frame
    {
      const sec = kit.secOf(ctx.date) / 60, per = 4 * 118;
      let d = sec * per, bx, by;
      const lo = 5, hi = 123;
      if (d < 118) { bx = lo + d; by = lo; } else if (d < 236) { bx = hi; by = lo + d - 118; }
      else if (d < 354) { bx = hi - (d - 236); by = hi; } else { bx = lo; by = hi - (d - 354); }
      const r = 4.5;
      for (let p = 0; p < NP; p++) {
        const dx = pinX[p] - bx, dy = pinY[p] - by, q = 1 - (dx * dx + dy * dy) / (r * r);
        if (q > 0) Z[p] = Math.max(Z[p], 0.5 * Math.sqrt(q));
      }
    }

    // --- the hour: the frog presses through
    if (hourTurn && age < 6) for (let p = 0; p < NP; p++) {
      // the digits stay proud of the face: the frog lifts them less than the field
      const f = frogHeight(pinX[p], pinY[p], age);
      if (f) Z[p] += f * (1 - 0.6 * kit.clamp(Z[p]));
      // the bump of its face against the screen runs out through every pin
      const ta = age - 0.55;
      if (ta > 0) {
        const r = Math.hypot(pinX[p] - FROG.cx, pinY[p] - FROG.cy), front = 70 * ta - r;
        if (front > 0) Z[p] += 0.16 * Math.sin(front * 0.3) * Math.exp(-front * 0.035) * Math.exp(-ta * 0.6);
      }
    }

    // lamp: low, swinging slowly round the lower left
    const az = 2.36 + 0.5 * Math.sin(t * 0.11) + 0.18 * Math.sin(t * 0.037);
    LIGHT.paint(Z, img, zb, W, { ZPX, SV, az, el: 0.36, key: KEY, fill: FILL });
    kit.blitGrid(ctx, img, 1 - 0.5 * ctx.night);
  },
};
