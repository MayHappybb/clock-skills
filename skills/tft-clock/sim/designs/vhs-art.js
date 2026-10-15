// VHS art: palettes, costumes, the VCR's on-screen font, and the studio set
// (vhs.js).
//
// The studio is a 1980s TV-gym set as it was taped: a seamless blue-violet
// cyclorama (wall and floor one sweep of colour), a row of marquee bulbs
// along its top, a boombox on the floor between the hours and the minutes,
// and for the hour's cool-down a striped sunset.
// Everything here is drawn clean; vhs-tape.js wears it.
import { to565, sprite, hash } from '../js/kit.js';

export const W = 160, H = 80;
export const FLOOR = 75;          // the instructors' shoe soles
export const BACK = 58;           // the class's shoe soles
export const HORIZON = 50;        // wall / floor

// ------------------------------------------------------------ colours (taped, before the tape wears them)

export const INK = 0x140a1e;      // keylines, eyes
export const SHOE = 0xd0ccd8, SHOE_D = 0x8a86a0;

/** Costumes, one per numeral: leotard, belt, tights, leg warmers, warmer rib, hair, skin, hair style. */
const C = (top, belt, tights, warm, rib, hair, skin, style) => ({ top, belt, tights, warm, rib, hair, skin, style });
export const COSTUME = [
  C(0xff3d9a, 0xffe14a, 0xc85cff, 0x2ad4c8, 0x16948c, 0xf2d06a, 0xf2b48c, 'perm'),   // 0 hot pink, violet tights, teal warmers, blonde perm
  C(0x2fe0f0, 0xff40c0, 0x4a8aff, 0xff7ab8, 0xc04a88, 0x5a3020, 0xc88a60, 'pony'),   // 1 cyan
  C(0xf4f04a, 0xff3d9a, 0xff9a30, 0x30d8f0, 0x1890b0, 0x2a1a18, 0xe8a880, 'bob'),    // 2 lemon
  C(0xff8a2a, 0x2fe0f0, 0xff4fa8, 0xf4f04a, 0xb0a420, 0xc8401c, 0xf4c09c, 'perm'),   // 3 orange
  C(0x9cf03a, 0xa050ff, 0x2ac8a8, 0xff40c0, 0xa82a80, 0xf2d06a, 0xa8704c, 'pony'),   // 4 lime
  C(0xc070ff, 0x9cf03a, 0xff4fa8, 0xf4f04a, 0xb0a420, 0x8a3a20, 0xf0b890, 'bob'),    // 5 violet
  C(0xff5a5a, 0xf4f4f4, 0xb050f0, 0x30d8f0, 0x1890b0, 0x2a1a18, 0xd89a70, 'perm'),   // 6 coral
  C(0x50f0b0, 0xff8a2a, 0x40a8ff, 0xff7ab8, 0xc04a88, 0x6a4028, 0xf2c0a0, 'pony'),   // 7 mint
  C(0xf060ff, 0x2fe0f0, 0xffd040, 0x9cf03a, 0x60a020, 0xf2d06a, 0xe0a07c, 'bob'),    // 8 magenta
  C(0x4ab4ff, 0xf4f04a, 0xff3d9a, 0x9cf03a, 0x60a020, 0xc8401c, 0xf4c09c, 'perm'),   // 9 sky
];

/** A colour `u` (0..1) of the way from a to b. */
export function mixc(a, b, u) {
  const ar = a >> 16, ag = (a >> 8) & 255, ab = a & 255;
  return (Math.round(ar + ((b >> 16) - ar) * u) << 16) | (Math.round(ag + (((b >> 8) & 255) - ag) * u) << 8) | Math.round(ab + ((b & 255) - ab) * u);
}

// the set, by day and by night (the studio lights down)
export const SET = {
  day: { wall: 0x2e2a60 },
  night: { wall: 0x16143a },
  // the hour's cool-down: the studio goes to sunset
  dusk: { wall: 0x4a2058 },
};
export const SUN = [0xffe86a, 0xffb84a, 0xff7a5a, 0xff4a8a];

// ------------------------------------------------------------ the VCR's on-screen font

const OSD_GLYPHS = {
  P: ['#####.', '##..##', '##..##', '#####.', '##....', '##....', '##....'],
  L: ['##....', '##....', '##....', '##....', '##....', '##....', '######'],
  A: ['.####.', '##..##', '##..##', '######', '##..##', '##..##', '##..##'],
  Y: ['##..##', '##..##', '.####.', '..##..', '..##..', '..##..', '..##..'],
  S: ['.#####', '##....', '##....', '.####.', '....##', '....##', '#####.'],
  E: ['######', '##....', '##....', '#####.', '##....', '##....', '######'],
  U: ['##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '.####.'],
  R: ['#####.', '##..##', '##..##', '#####.', '##.##.', '##..##', '##..##'],
  C: ['.#####', '##....', '##....', '##....', '##....', '##....', '.#####'],
  K: ['##..##', '##.##.', '####..', '###...', '####..', '##.##.', '##..##'],
  I: ['####', '.##.', '.##.', '.##.', '.##.', '.##.', '####'],
  N: ['##..##', '###.##', '######', '##.###', '##..##', '##..##', '##..##'],
  G: ['.#####', '##....', '##....', '##.###', '##..##', '##..##', '.####.'],
  O: ['.####.', '##..##', '##..##', '##..##', '##..##', '##..##', '.####.'],
  D: ['#####.', '##..##', '##..##', '##..##', '##..##', '##..##', '#####.'],
  W: ['##...##', '##...##', '##.#.##', '##.#.##', '#######', '.##.##.', '.##.##.'],
  T: ['######', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..'],
  '>': ['#....', '###..', '####.', '#####', '####.', '###..', '#....'],
  '|': ['##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##'],
  '#': ['###', '###', '###', '###', '###', '###', '###'],
  '-': ['...', '...', '...', '###', '...', '...', '...'],
};
export const OSD = {};
for (const [k, rows] of Object.entries(OSD_GLYPHS)) OSD[k] = sprite(rows, { '#': 0xffffff });

/** Width of a string in the OSD font. */
export function osdWidth(str) {
  let w = 0;
  for (const ch of str) w += (ch === ' ' ? 3 : OSD[ch].w) + 1;
  return w - 1;
}

/**
 * OSD text: glyphs in `c` inside a 1 px edge of `edge` (the VCR keys its
 * characters with a black border). Hard pixels: the VCR's character
 * generator, crisp on top of the worn picture.
 */
export function osdText(g, str, x, y, c, edge, a = 1) {
  const buf = g.buf, c5 = to565(c), e5 = to565(edge);
  let cx = x, n = 0;
  for (const ch of str) {
    if (ch === ' ') { cx += 4; continue; }
    const s = OSD[ch];
    for (let pass = 0; pass < 2; pass++)
      for (let j = 0; j < s.h; j++)
        for (let i = 0; i < s.w; i++) {
          if (s.data[j * s.w + i] < 0) continue;
          if (pass === 0) {
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
              const px = cx + i + dx, py = y + j + dy;
              if (px >= 0 && py >= 0 && px < W && py < H) { if (a >= 1) buf[py * W + px] = e5; else g.pixel(px, py, edge, { a }); n++; }
            }
          } else {
            const px = cx + i, py = y + j;
            if (px >= 0 && py >= 0 && px < W && py < H) { if (a >= 1) buf[py * W + px] = c5; else g.pixel(px, py, c, { a }); n++; }
          }
        }
    cx += s.w + 1;
  }
  g.cost.blit += n;
  return cx - 1;
}

// ------------------------------------------------------------ the set

/**
 * The cyclorama for one palette. `y0..y1`
 * limits the rows (the hour's blinds wipe draws two sets in alternate bands).
 * `sun` (0..1) is how far the cool-down sun has risen behind the class.
 */
export function studio(g, P, y0 = 0, y1 = H, sun = 0, T = 0) {
  g.clip(0, y0, W, y1 - y0);
  // the cyc: one seamless sweep of colour, wall into floor
  g.fillRect(0, 0, W, H, P.wall);
  if (sun > 0) sunset(g, sun, T);
  g.unclip();
}

/**
 * The TV set's marquee: a row of bulbs along the top of the cyc, chasing one
 * bulb per count (all of them lit on a flourish).
 */
export function marquee(g, c, all, night) {
  const on = night ? 0x9a7a58 : 0xe0b878, off = night ? 0x2a2238 : 0x4a3e58;
  for (let k = 0; k < 20; k++) {
    const lit = all || ((k + 400 - (c % 400)) & 3) === 0;
    g.fillRect(3 + k * 8, 1, 3, 2, lit ? on : off);
  }
}

/** The 80s sunset behind the class: a striped disc rising over the horizon. */
function sunset(g, u, T) {
  const cx = 80, r = 19, cy = HORIZON + 4 + (1 - u) * 26;
  const top = Math.max(0, Math.floor(cy - r)), bot = Math.min(HORIZON, Math.ceil(cy + r));
  for (let y = top; y < bot; y++) {
    const dy = y + 0.5 - cy, q = r * r - dy * dy;
    if (q <= 0) continue;
    const hw = Math.sqrt(q), v = (y + 0.5 - (cy - r)) / (2 * r);
    // the cut lines: gaps that thicken towards the bottom and drift down
    const ph = (y - cy + T * 3) % 5;
    if (v > 0.45 && (ph < 0 ? ph + 5 : ph) < (v - 0.45) * 7) continue;
    const c = SUN[Math.min(3, (v * 4) | 0)];
    g.fillRect(Math.round(cx - hw), y, Math.round(2 * hw), 1, c);
  }
}

/**
 * The boombox on the floor between the hours and the minutes: its woofers
 * pump on the beat (`kick` 0..1) and the graphic equaliser between them
 * dances (`c` the count, `p` its phase).
 */
export function boombox(g, kick, c, p, night) {
  const x = 71, y = 66, body = night ? 0x2a2a34 : 0x3a3a48, trim = night ? 0x6a6a7a : 0x9a9aac, cone = 0x16141e;
  const bob = kick > 0.5 ? 1 : 0;
  g.fillRect(x + 4, y - 2 + bob, 10, 1, trim);
  g.fillRect(x + 4, y - 2 + bob, 1, 2, trim);
  g.fillRect(x + 13, y - 2 + bob, 1, 2, trim);
  g.fillRect(x, y + bob, 18, 9 - bob, body);
  g.fillRect(x, y + bob, 18, 1, trim);
  for (const sx of [x + 3.5, x + 14.5]) {
    g.fillCircle(sx, y + 5, 3.1, trim);
    g.fillCircle(sx, y + 5, 2.4, cone);
    g.fillCircle(sx, y + 5, 0.6 + 1.8 * kick, trim);
  }
  // the equaliser: four bars, a new level each count, falling through it
  const eq = night ? 0x6a8a4a : 0x9ce05a, pk = night ? 0x9a5a3a : 0xff7a3a;
  for (let k = 0; k < 4; k++) {
    const hgt = Math.max(1, Math.round((1 + (hash(c, k, 3) % 5)) * (1 - 0.6 * p)));
    g.fillRect(x + 7 + k, y + 8 - hgt, 1, hgt, hgt > 4 ? pk : eq);
  }
}
