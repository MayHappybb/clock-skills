// Etch A Sketch: the doodles the stylus draws in the empty sky while it
// waits, and the bigger panorama it draws after the hour's shake. Each one
// is a single stylus route (4-connected pixels), drawn in local coordinates
// and placed later. Built once at load: flash tables.

import { Route, trace } from './etchasketch-line.js';

const R = (x, y) => new Route(x, y);

// A sitting cat, facing right: ears, whisker, a curled tail.
function cat() {
  return R(4, 21).to(19, 21).to(19, 13).to(22, 11).to(23, 8).to(26, 7).to(23, 8).to(23, 4).to(22, 0).to(19, 3)
    .to(16, 3).to(14, 0).to(13, 5).to(13, 9).to(9, 10).to(6, 13).to(4, 17).to(4, 21).to(1, 21).to(0, 19).to(0, 14).to(2, 12);
}

// The Etch A Sketch classic: a square spiral, wound inward.
function spiral() {
  const r = R(0, 0);
  let x0 = 0, y0 = 0, x1 = 26, y1 = 22;
  r.to(x1, y0);
  while (x1 - x0 > 4 && y1 - y0 > 4) {
    r.to(x1, y1).to(x0, y1); y0 += 3; r.to(x0, y0); x0 += 3; x1 -= 3; r.to(x1, y0); y1 -= 3;
  }
  return r;
}

// A sailboat on two waves.
function boat() {
  return R(0, 17).to(28, 17).to(24, 21).to(4, 21).to(0, 17).to(14, 17).to(14, 0).to(25, 14).to(14, 14)
    .to(14, 3).to(4, 14).to(14, 14).to(14, 17).to(28, 17).to(31, 21).arc(33, 21, 2, 2, 180, 360).arc(37, 21, 2, 2, 180, 360);
}

// A little city: rooftops, a spire, an antenna.
function skyline() {
  return R(0, 24).to(0, 12).to(6, 12).to(6, 6).to(11, 6).to(11, 14).to(14, 14).to(14, 3).to(16, 0).to(18, 3).to(18, 16)
    .to(23, 16).to(23, 8).to(29, 8).to(29, 2).to(29, 8).to(33, 8).to(33, 18).to(37, 18).to(37, 11).to(42, 11).to(42, 24).to(0, 24);
}

// A rocket going up, with a ragged flame.
function rocket() {
  return R(8, 0).to(11, 4).to(11, 15).to(14, 19).to(11, 18).to(10, 21).to(9, 19).to(8, 22).to(7, 19).to(6, 21)
    .to(5, 18).to(2, 19).to(5, 15).to(5, 4).to(8, 0).to(8, 7).arc(8, 9, 2, 2, -90, 270).to(8, 7);
}

// A fish with an eye, swimming left, and a bubble.
function fish() {
  return R(0, 9).arc(11, 9, 11, 7, 180, 360).to(26, 3).to(26, 15).to(22, 9).arc(11, 9, 11, 7, 0, 180)
    .to(5, 7).to(6, 6).to(5, 7).to(0, 9).to(-3, 6).arc(-4, 3, 2, 2, 90, 450);
}

// A Greek key, the knob-only pattern: right, up, left, down, along.
function meander() {
  const r = R(0, 8);
  for (let x = 0; x < 48; x += 8) r.to(x + 6, 8).to(x + 6, 0).to(x, 0).to(x, 4).to(x + 3, 4).to(x + 3, 2);
  return r.to(46, 2).to(48, 8);
}

// A car with round wheels.
function car() {
  return R(0, 15).to(0, 9).to(6, 9).to(10, 3).to(22, 3).to(26, 9).to(32, 9).to(32, 15).to(28, 15).arc(25, 15, 3, 3, 0, -180)
    .to(11, 15).arc(8, 15, 3, 3, 0, -180).to(0, 15).to(8, 15).arc(8, 15, 3, 3, 180, 540).to(25, 15).arc(25, 15, 3, 3, 180, 540)
    .to(25, 12).to(16, 12).to(16, 4).to(16, 9).to(7, 9);
}


// A five-point star, in one stroke, as everyone draws it.
function star() {
  const r = R(10, 0);
  for (let i = 1; i <= 5; i++) {
    const a = (-90 + i * 144) * Math.PI / 180;
    r.to(10 + 10 * Math.cos(a), 10.5 + 10 * Math.sin(a));
  }
  return r;
}

// A heart.
function heart() {
  return R(10, 18).to(1, 9).arc(5, 5, 5, 5, 135, 315).to(10, 4).arc(15, 5, 5, 5, 225, 405).to(10, 18);
}

// A snail: a spiral shell on a foot, two feelers.
function snail() {
  const r = R(0, 18).to(26, 18).to(27, 14).to(29, 10).to(27, 14).to(25, 11).to(26, 15).to(21, 17);
  r.arc(14, 11, 7, 7, 0, -360).arc(14, 11, 5, 5, 0, -300).arc(14, 11, 2, 2, -300, -560);
  return r;
}

// A round tree with a trunk and a swing.
function tree() {
  return R(10, 24).to(10, 14).arc(10, 8, 9, 7, 90, 450).to(10, 14).to(12, 14).to(12, 24).to(16, 24)
    .to(16, 15).to(19, 15).to(19, 21).to(14, 21).to(16, 21).to(16, 15).to(19, 15);
}

const SCALE = { meander: 1, skyline: 1.15, boat: 1.1, tree: 1.1, snail: 1.1, star: 1.2, heart: 1.2 };

/** The doodle library: { path: local pixels, w, h }. */
export const DOODLES = [cat, spiral, boat, skyline, rocket, fish, meander, car, star, heart, snail, tree].map((fn) => {
  const r = fn(), k = SCALE[fn.name] ?? 1.25;
  r.pts = r.pts.map(([x, y]) => [x * k, y * k]);
  const p = r.pixels();
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
  for (let i = 0; i < p.length; i += 2) { p[i] -= x0; p[i + 1] -= y0; }
  return { name: fn.name, path: p, w: x1 - x0 + 1, h: y1 - y0 + 1 };
});

/**
 * The hour's panorama, in screen pixels, starting and ending at (px, py):
 * a mountain range along the top of the glass, left of the smoke over the
 * hours and right of it over the minutes, and the sun (by day, with rays)
 * or a crescent moon (by night) sitting on a peak. One line, out and back.
 */
export function panorama(px, py, night) {
  const r = new Route(px, py).to(px, 27).to(81, 26);
  const ridge = (pts) => { for (const q of pts) if (q === 'sun') orb(r, night); else r.to(q[0], q[1]); };
  const m = r.mark();
  ridge([[74, 19], [68, 22], [57, 11], [47, 19], [39, 13], [29, 19], [15, 5], [5, 13], [0, 10]]);
  r.backTo(m);
  const m2 = r.mark();
  ridge([[92, 16], [100, 24], [110, 13], 'sun', [122, 26], [134, 9], [146, 20], [152, 16], [159, 21]]);
  r.backTo(m2);
  r.backTo(1);
  return r.pixels();
}

// the sun on the peak at (110, 13), rays out and back above the ridge; or the moon
function orb(r, night) {
  const cx = 110, cy = 7, rr = 5;
  if (night) {
    // a crescent, horns to the right: the outer edge round the left, the inner edge back
    const mx = 108, my = 6, R0 = 6.5, R1 = R0 * Math.sin(Math.PI / 3);
    r.to(mx + R0 / 2, my + R1).arc(mx, my, R0, R0, 60, 300).arc(mx + R0 / 2, my, R1 * 0.95, R1, 270, 90).to(110, 13);
    return;
  } else {
    for (let a = 90; a < 450; a += 30) {
      r.arc(cx, cy, rr, rr, a, a + 30);
      const b = a + 30, deg = ((b % 360) + 360) % 360;
      if (deg >= 180 && deg <= 360) {
        const t = b * Math.PI / 180, x0 = cx + rr * Math.cos(t), y0 = cy + rr * Math.sin(t);
        r.to(x0 + 3 * Math.cos(t), Math.max(0, y0 + 3 * Math.sin(t))).to(x0, y0);
      }
    }
  }
  r.to(110, 13);
}

/** A staircase from a to b (the stylus travelling), without the first point. */
export function travel(ax, ay, bx, by) {
  const p = trace([[ax, ay], [bx, by]]);
  return p.subarray(2);
}

/** Join pixel paths end to end. */
export function join(...parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Int16Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** A path walked backwards. */
export function reverse(p) {
  const out = new Int16Array(p.length);
  for (let i = 0, j = p.length - 2; j >= 0; i += 2, j -= 2) { out[i] = p[j]; out[i + 1] = p[j + 1]; }
  return out;
}

/** A path shifted by (dx, dy). */
export function moved(p, dx, dy) {
  const out = new Int16Array(p.length);
  for (let i = 0; i < p.length; i += 2) { out[i] = p[i] + dx; out[i + 1] = p[i + 1] + dy; }
  return out;
}
