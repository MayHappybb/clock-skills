// The world of "crayon": what else the child coloured on the page, in
// crayon only (no felt-tip line, so it stays softer than the monsters):
// a corner sun (a moon at night), a cloud, a strip of grass, party hats.
// Each is a byte map of crayon codes (0 paper, 1 light, 2 crayon, 3 pressed
// hard at the edge) in three boil drawings, built at load from a distance
// function (flash: ~12 KB).

import { hash } from '../js/kit.js';
import { BOIL } from './crayon-glyphs.js';

const rnd = (a, b, c) => hash(a, b, c) / 4294967296;
function vnoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = rnd(ix, iy, seed), b = rnd(ix + 1, iy, seed), c = rnd(ix, iy + 1, seed), d = rnd(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/**
 * Colour a region in with crayon. `sdf(x, y)` < 0 inside. `press` 0..1 is how
 * hard the child pressed (how little paper shows through the hatching).
 */
function crayonBlob(w, h, sdf, seed, { press = 0.6, slant = 0.5, period = 3, edge = 1.3 } = {}) {
  const maps = [];
  for (let k = 0; k < BOIL; k++) {
    const map = new Uint8Array(w * h);
    const sd = seed * 31 + k * 7;
    const ph = rnd(seed, k, 3) * period;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const px = x + 0.5, py = y + 0.5;
        const d = sdf(px + (vnoise(px / 5, py / 5, sd) - 0.5) * 1.8, py + (vnoise(px / 5, py / 5, sd + 1) - 0.5) * 1.8);
        if (d >= 0) continue;
        const hh = px * slant + py + (vnoise(px / 8, py / 8, sd + 2) - 0.5) * 2.4 + ph;
        const f = ((hh % period) + period) % period;
        const r = rnd(x * 97 + y, k, sd + 5);
        if (d > -edge) map[y * w + x] = r < 0.8 ? 3 : 2;
        else if (f < period * press) map[y * w + x] = r < 0.15 ? 1 : 2;
        else if (r < 0.35) map[y * w + x] = 1;
      }
    }
    maps.push(map);
  }
  return { w, h, maps };
}

// the sun: a disc in the top-right corner, centre (SUN_CX, SUN_CY) on screen
export const SUN_CX = 158, SUN_CY = 1, SUN_R = 12;
export const SUN = crayonBlob(28, 28, (x, y) => Math.hypot(x - 14, y - 14) - SUN_R, 5, { press: 0.75 });
// the moon: a crescent in the same corner
export const MOON = crayonBlob(28, 28, (x, y) => Math.max(Math.hypot(x - 14, y - 14) - 10.5, 8.5 - Math.hypot(x - 8, y - 17)), 6, { press: 0.8 });

// the cloud: three puffs
export const CLOUD = crayonBlob(30, 14, (x, y) => Math.min(
  Math.hypot((x - 9) / 1.1, y - 8.5) - 5,
  Math.hypot((x - 16) / 1.15, y - 6.5) - 6,
  Math.hypot((x - 23) / 1.1, y - 8.5) - 4.6,
  Math.max(Math.abs(x - 16) - 11, Math.abs(y - 10.5) - 2.6)), 7, { press: 0.35, slant: -0.6 });

// the grass: a zigzag of crayon blades drawn as one hard line, with a light
// scribble of green under it
export const GRASS_Y = 70;
const GRASS_FILL = crayonBlob(160, 10, (x, y) => 5.5 - y, 8, { press: 0.22, slant: -2.5, edge: 0 });
export const GRASS = (() => {
  const maps = GRASS_FILL.maps.map((m, k) => {
    const out = Uint8Array.from(m);
    for (let x = 0; x < 160; x++) {
      for (let y = 0; y < 10; y++) {
        const px = x + 0.5 + (vnoise(x / 5, y / 5, 60 + k) - 0.5) * 1.4, py = y + 0.5;
        const p = ((px + 0.7) % 4.2) / 4.2;
        const zig = 1.2 + 9 * Math.abs(p - 0.5);                 // blade tips at y 1.2, roots at y 5.7
        if (Math.abs(py - zig) < 0.95 && py < 6.4) out[y * 160 + x] = 3;
      }
    }
    return out;
  });
  return { w: 160, h: 10, maps };
})();

// a party hat: a cone 10 wide, 11 tall, its brim at the bottom centre
export const HAT = crayonBlob(12, 13, (x, y) => {
  const t = (y - 1) / 11;                                        // 0 at the tip, 1 at the brim
  return Math.max(Math.abs(x - 6) - t * 5, 1 - y, y - 12);
}, 9, { press: 0.85, slant: 0, period: 4, edge: 0.9 });

/** A five-pointed kid's star, r ~4, three drawings. */
export const STAR = crayonBlob(11, 11, (x, y) => {
  const dx = x - 5.5, dy = y - 5.8, a = Math.atan2(dy, dx) + Math.PI / 2, r = Math.hypot(dx, dy);
  const k = Math.cos(((a % (Math.PI * 0.4)) + Math.PI * 0.4) % (Math.PI * 0.4) - Math.PI * 0.2);
  return r - (2.1 + 2.9 * Math.pow(Math.max(0, k * 1.24 - 0.24), 3));
}, 10, { press: 0.9, edge: 0.8 });
