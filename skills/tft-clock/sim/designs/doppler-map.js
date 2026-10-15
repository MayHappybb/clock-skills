// The basemap, the polar tables and the instrument type for doppler.js.
//
// The basemap is one byte per pixel: a palette index (land, sea, county
// line, state line, river, coast, range ring, road), drawn once at load, so
// the frame pass can colour it through a lookup table like the echoes
// (12.8 KB flash). ANG is each pixel's bearing from the radar site, 16-bit,
// clockwise from north (25.6 KB): the sweep's afterglow, the product wipe
// and the radial velocity are all looked up from it.

export const W = 160, H = 80;
export const SITE = [75.5, 45.5];            // the radar, between hours and minutes

export const LAND = 0, SEA = 1, COUNTY = 2, STATE = 3, RIVER = 4, COAST = 5, RING = 6, ROAD = 7, SHELF = 8;
export const N_IDX = 9;

export const BASE = new Uint8Array(W * H);
export const ANG = new Uint16Array(W * H);

const put = (x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H) BASE[y * W + x] = v; };
function line(x0, y0, x1, y1, v, dash = 0) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, n = 0;
  for (;;) {
    if (!dash || (n % dash) < dash - 1) put(x0, y0, v);
    n++;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
const poly = (pts, v, dash = 0) => { for (let i = 1; i < pts.length; i++) line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], v, dash); };

// the coast: the sea fills the lower right, a bay biting in
const coastY = (x) => 58 + (160 - x) * 0.34 - 7 * Math.exp(-(((x - 128) / 9) ** 2)) + 1.5 * Math.sin(x * 0.45);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const c = coastY(x);
    BASE[y * W + x] = y > c ? (y > c + 5 ? SEA : SHELF) : LAND;
  }
for (let x = 0; x < W; x++) { const c = Math.round(coastY(x)); if (c < H) put(x, c, COAST); }

// counties: the plains' rectilinear grid, with the jogs real survey lines have
const COLS = [[17, 0, 30, 19], [44, 0, 52, 45], [68, 0, 80, 66], [101, 0, 40, 104], [126, 0, 61, 130], [149, 0, 80, 149]];
for (const [x0, ya, yb, x1] of COLS) { line(x0, ya, x0, yb, COUNTY); line(x0, yb, x1, yb, COUNTY); line(x1, yb, x1, H - 1, COUNTY); }
for (const [y, xa, xb] of [[21, 0, 160], [47, 0, 101], [50, 101, 160], [72, 0, 120]]) line(xa, y, xb, y, COUNTY);
// the state line follows a meandering river, then runs straight east
const RIV = [[0, 33], [9, 31], [16, 35], [24, 33], [31, 36], [38, 34], [46, 38], [53, 36], [60, 40], [66, 39]];
poly(RIV, RIVER);
poly([[66, 39], [72, 42], [79, 43], [86, 47], [92, 46], [99, 51], [104, 55], [110, 57], [114, 62], [118, 64]], RIVER);
// east of the river the state line runs on along a survey line, dashed
line(118, 64, 118, 79, STATE, 3);
// an interstate on the diagonal
poly([[0, 62], [30, 55], [60, 47], [75, 45], [96, 30], [126, 16], [160, 4]], ROAD, 3);

// range rings every 25 px round the site
for (const r of [25, 50, 75, 100]) {
  for (let i = 0; i < 1200; i++) {
    const a = (i / 1200) * Math.PI * 2;
    put(Math.round(SITE[0] - 0.5 + r * Math.sin(a)), Math.round(SITE[1] - 0.5 - r * Math.cos(a)), RING);
  }
}

for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    let a = Math.atan2(x + 0.5 - SITE[0], -(y + 0.5 - SITE[1]));
    if (a < 0) a += Math.PI * 2;
    ANG[y * W + x] = Math.round((a / (Math.PI * 2)) * 65536) & 0xffff;
  }

// ------------------------------------------------------------ instrument type
// A squared 4 x 5 face with chamfered bowls, like the labels on a radar
// console; '0' carries a slash so it never reads O.
const GL = {
  0: ['.##.', '#..#', '#.##', '##.#', '.##.'], 1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['###.', '...#', '.##.', '#...', '####'], 3: ['###.', '...#', '.##.', '...#', '###.'],
  4: ['#..#', '#..#', '####', '...#', '...#'], 5: ['####', '#...', '###.', '...#', '###.'],
  6: ['.##.', '#...', '###.', '#..#', '.##.'], 7: ['####', '...#', '..#.', '.#..', '.#..'],
  8: ['.##.', '#..#', '.##.', '#..#', '.##.'], 9: ['.##.', '#..#', '.###', '...#', '.##.'],
  A: ['.##.', '#..#', '####', '#..#', '#..#'], B: ['###.', '#..#', '###.', '#..#', '###.'],
  C: ['.###', '#...', '#...', '#...', '.###'], D: ['###.', '#..#', '#..#', '#..#', '###.'],
  E: ['####', '#...', '###.', '#...', '####'], F: ['####', '#...', '###.', '#...', '#...'],
  G: ['.###', '#...', '#.##', '#..#', '.###'], H: ['#..#', '#..#', '####', '#..#', '#..#'],
  I: ['###', '.#.', '.#.', '.#.', '###'], J: ['..##', '...#', '...#', '#..#', '.##.'],
  K: ['#..#', '#.#.', '##..', '#.#.', '#..#'], L: ['#...', '#...', '#...', '#...', '####'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'], N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['.##.', '#..#', '#..#', '#..#', '.##.'], P: ['###.', '#..#', '###.', '#...', '#...'],
  R: ['###.', '#..#', '###.', '#.#.', '#..#'], S: ['.###', '#...', '.##.', '...#', '###.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#..#', '#..#', '#..#', '#..#', '.##.'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['####', '..#.', '.#..', '#...', '####'],
  '.': ['.', '.', '.', '.', '#'], '-': ['...', '...', '###', '...', '...'], '/': ['..#', '..#', '.#.', '#..', '#..'],
  '°': ['##', '##', '..', '..', '..'], ':': ['.', '#', '.', '#', '.'],
};
const FONT = {};
for (const [k, rows] of Object.entries(GL)) {
  const w = rows[0].length, data = new Int32Array(w * 5).fill(-1);
  rows.forEach((r, y) => { for (let x = 0; x < w; x++) if (r[x] === '#') data[y * w + x] = 0xffffff; });
  FONT[k] = { w, h: 5, data };
}

/** Draw instrument text with its top-left at (x, y); returns the x past the end. */
export function label(g, str, x, y, c, a = 1) {
  for (const ch of str) {
    if (ch === ' ') { x += 3; continue; }
    const s = FONT[ch];
    if (!s) continue;
    g.blit(s, x, y, { c, a });
    x += s.w + 1;
  }
  return x - 1;
}
export function labelWidth(str) {
  let w = 0;
  for (const ch of str) w += ch === ' ' ? 3 : (FONT[ch]?.w ?? 0) + 1;
  return w - 1;
}
