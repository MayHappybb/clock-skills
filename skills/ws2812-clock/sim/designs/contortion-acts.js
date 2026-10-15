// Contortion: the choreography (what every acrobat does at each instant of
// the minute), the costumes, the eyes, and the high wire.
import * as kit from '../js/kit.js';

export const bump = (x, a, b) => (x <= a || x >= b ? 0 : Math.sin(Math.PI * (x - a) / (b - a)));
export const win = (x, a, b) => kit.clamp((x - a) / (b - a));

const BLUE = kit.hex('#1c8ff0'), CREAM = kit.hex('#cfe9ff'), GOLDB = kit.hex('#f0a018'), GOLDD = kit.hex('#a85006');
const SPARK = [1, 0.95, 0.8];

/** Costumes: candy-striped strongmen, gold-sequinned wire walkers. */
export const look = {
  tmp: [0, 0, 0], plain: 0, skin: kit.hex('#ffae84'), mitt: kit.hex('#fff4e6'), gloss: 0.4, seg: 1, gold: false, now: 0,
  body(s, nx, ny) {
    const c = this.tmp;
    if (this.gold) {
      const cell = Math.floor(s * 1.4), lat = Math.floor(nx * 1.6 + 2);
      const g = kit.hash(cell, lat, Math.floor(this.now * 6 + 7 * kit.hash(cell, lat)));
      const k = 0.5 + 0.5 * (1 - this.plain) * Math.cos((s * this.seg / 2.2 + ny) * Math.PI);
      c[0] = GOLDD[0] + (GOLDB[0] - GOLDD[0]) * k; c[1] = GOLDD[1] + (GOLDB[1] - GOLDD[1]) * k; c[2] = GOLDD[2] + (GOLDB[2] - GOLDD[2]) * k;
      if (g > 0.86) { c[0] += SPARK[0] * 0.8; c[1] += SPARK[1] * 0.8; c[2] += SPARK[2] * 0.8; }
    } else {
      const ph = kit.fract(s * this.seg / 4.6 + ny * 0.45), tri = Math.abs(ph - 0.5) * 2;
      const st = 0.8 * (1 - this.plain) * kit.smoothstep(0.62, 0.8, tri);
      c[0] = BLUE[0] + (CREAM[0] - BLUE[0]) * st; c[1] = BLUE[1] + (CREAM[1] - BLUE[1]) * st; c[2] = BLUE[2] + (CREAM[2] - BLUE[2]) * st;
    }
  },
};

/** Saccading gaze: holds a look, then flicks to the next one. */
export function gaze(now, j) {
  const u = now / 2.3 + j * 0.37, k = Math.floor(u), f = kit.smoothstep(0, 0.05, u - k);
  const h = (n, c) => kit.hash(n, j, c) * 2 - 1;
  return [h(k - 1, 1) + (h(k, 1) - h(k - 1, 1)) * f, 0.7 * (h(k - 1, 2) + (h(k, 2) - h(k - 1, 2)) * f)];
}

// the hour act: crouch on the wire, launch, tuck into a ball and somersault,
// open out as the new hour, land with a bounce, bow under confetti
export const HOUR = { launch: 0.6, land: 2.35, m0: 0.85, m1: 2.05, bow0: 2.9, bow1: 3.9, conf: 2.45 };

/**
 * What acrobat j is doing at `sec` into the minute. e: progress through the
 * contortion, 0..1 (curl up to 0.4, ball to 0.6, unroll to 1), -1 = none.
 * roll: px the ball rolls sideways (it turns by roll / radius). spin: an
 * extra somersault (radians). force: contort even if the digit is unchanged.
 */
export function act(sec, hour, changed, j) {
  const fly = j < 2, a = { e: -1, c: 0, bow: 0, air: 0, spin: 0, roll: 0, jig: 0, force: false };
  if (hour) {
    a.force = fly;
    if (changed || fly) a.e = win(sec, HOUR.m0, HOUR.m1);
    if (fly) {
      a.c = 0.16 * kit.smoothstep(0, 0.55, sec) * (1 - kit.smoothstep(0.55, 0.68, sec)) - 0.08 * bump(sec, 0.6, 0.9)
          + 0.13 * bump(sec, HOUR.land - 0.02, HOUR.land + 0.4);
      a.air = win(sec, HOUR.launch, HOUR.land);
      a.spin = 2 * kit.TAU * kit.smoothstep(0.2, 0.97, a.e);   // a double somersault
    } else {
      a.c = 0.06 * bump(sec, 0.2, 0.7) + 0.12 * bump(a.e, 0.38, 0.62);
    }
    a.bow = 0.24 * bump(sec, HOUR.bow0, HOUR.bow1);
    const tl = sec - HOUR.land;
    a.jig = tl > 0 ? Math.exp(-tl * 4) * Math.sin(tl * 17) : 0;
  } else if (changed) {
    a.e = win(sec, 0.3, 2.0);
    a.c = 0.1 * bump(sec, 0, 0.45) - 0.05 * bump(sec, 0.3, 0.6);
    a.c += 0.12 * bump(a.e, 0.38, 0.62);   // a push-up in the bridge
    a.jig = sec > 2.0 ? Math.exp(-(sec - 2.0) * 4) * Math.sin((sec - 2.0) * 16) : 0;
    a.bow = 0.22 * bump(sec, 2.35, 3.3);
  }
  return a;
}

export const WIRE = { y: 23.6, x0: 6.5, x1: 57.5 };
/** How far the wire sags under walker j: it bobs with their sway, and on the hour it is the springboard. */
export function sag(now, sec, hour, j) {
  const rest = 1.3 + 0.35 * Math.sin(now * 2.5 + j * 1.9);
  if (!hour || sec > 6) {
    const t = hopT(now, sec, hour, j);
    if (t < 0) return rest;
    if (t < 0.15) return rest + 1.5 * kit.smoothstep(0, 0.15, t);
    if (t < 0.55) return rest + 1.5 * Math.exp(-(t - 0.15) * 10) * Math.cos((t - 0.15) * 25);
    return rest + 1.2 * Math.exp(-(t - 0.55) * 6) * Math.sin((t - 0.55) * 18);
  }
  if (sec < HOUR.launch) return rest + 3 * kit.smoothstep(0, 0.55, sec);
  if (sec < HOUR.land) {
    const t = sec - HOUR.launch, d0 = rest + 3;
    return d0 * Math.exp(-t * 6) * Math.cos(t * 21);
  }
  const t = sec - HOUR.land;
  return rest * (1 - Math.exp(-t * 9)) + 3.4 * Math.exp(-t * 4) * Math.sin(t * 15);
}

/** The wire's height at x, sagging to points (px, py) under each walker. */
export function wireY(x, p) {
  const W0 = WIRE.x0, W1 = WIRE.x1, Y = WIRE.y;
  if (x <= p[0][0]) return Y + (p[0][1] - Y) * (x - W0) / (p[0][0] - W0);
  if (x <= p[1][0]) return p[0][1] + (p[1][1] - p[0][1]) * (x - p[0][0]) / (p[1][0] - p[0][0]);
  return p[1][1] + (Y - p[1][1]) * (x - p[1][0]) / (W1 - p[1][0]);
}

/** Between acts each walker gives a little hop on the wire every 13 s: seconds into it, or -1. */
export function hopT(now, sec, hour, j) {
  if (hour && sec < 7) return -1;
  const t = kit.fract(now / 13 + j * 0.47) * 13;
  return t < 1.4 ? t : -1;
}
/** The walker's height above the wire in a hop, and its crouch. */
export function hop(now, sec, hour, j) {
  const t = hopT(now, sec, hour, j);
  if (t < 0) return [0, 0];
  const v = kit.clamp((t - 0.15) / 0.4);
  const h = v > 0 && v < 1 ? 10 * v * (1 - v) - 1.5 * (1 - v) + 1.5 * Math.exp(-(t - 0.15) * 10) * Math.cos((t - 0.15) * 25) : 0;
  return [h, 0.08 * bump(t, 0, 0.3) + 0.07 * bump(t, 0.52, 0.85)];
}
