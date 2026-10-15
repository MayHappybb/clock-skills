// The world of "graffiti": the brick abutment under a railway bridge, the
// riveted lattice girder across the top, the kerb, the colourways the crew
// paints in, and the small flat props (the can, the buff roller, the shine
// star, spray mist). All flat fills from fixed palettes; no shading.
import { to565, hash } from '../js/kit.js';

export const W = 160, H = 80;
export const GIRDER = 10, KERB = 74;       // the girder is y 0..9, the pavement from y 74

// ------------------------------------------------------------ palettes
// Day: shaded old brick (calm, warm, low contrast) so the piece is the loudest
// thing; a pale sky through the lattice. Night: the same wall under no light,
// a deliberate deep plum-brown, darker than the paint by far.
const DAY = { brick: 0x6a3f36, brick2: 0x5f3830, mortar: 0x4a2e29, steel: 0x2a3d36, steel2: 0x3d564c, steelD: 0x1a2824, sky: 0xb9c9cc, kerb: 0x5a585e, pave: 0x3a393f, paveD: 0x2e2d33 };
const NIGHT = { brick: 0x2e2130, brick2: 0x281c2a, mortar: 0x1c1420, steel: 0x162020, steel2: 0x223230, steelD: 0x0e1414, sky: 0x10182e, kerb: 0x2c2a32, pave: 0x1c1b22, paveD: 0x16151b };

function buildWall(P) {
  const b = new Uint16Array(W * H), c = {};
  for (const k in P) c[k] = to565(P[k]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let v;
      if (y < GIRDER) {
        // a Warren truss: chords top and bottom, diagonals between, sky in the gaps
        if (y < 2) v = c.steel2;
        else if (y >= GIRDER - 2) v = y === GIRDER - 1 ? c.steelD : c.steel;
        else {
          const p = (x + 3) % 16, dyy = y - 2, d1 = Math.abs(p - dyy), d2 = Math.abs(p - (15 - dyy));
          v = d1 < 1.5 || d2 < 1.5 || p >= 15 ? c.steel : c.sky;
        }
        if ((y === 0 || y === GIRDER - 2) && (x + 3) % 8 === 4) v = c.steelD; // rivets
      } else if (y >= KERB) {
        v = y === KERB ? c.kerb : (x + (y - KERB) * 3) % 23 === 0 ? c.paveD : c.pave;
      } else {
        const row = ((y - GIRDER) / 5) | 0, ry = (y - GIRDER) % 5, off = row & 1 ? 5 : 0;
        const col = ((x + off) / 10) | 0;
        if (ry === 4 || (x + off) % 10 === 9) v = c.mortar;
        else v = hash(col, row, 11) % 7 === 0 ? c.brick2 : c.brick;
      }
      b[y * W + x] = v;
    }
  return b;
}
export const WALL_DAY = buildWall(DAY), WALL_NIGHT = buildWall(NIGHT);
/** Where the lattice shows sky (the train is seen through these gaps). */
export const GAP = new Uint8Array(W * H);
{
  const sk = to565(DAY.sky);
  for (let i = 0; i < W * H; i++) GAP[i] = WALL_DAY[i] === sk ? 1 : 0;
}
export const SKY_DAY = to565(DAY.sky), SKY_NIGHT = to565(NIGHT.sky);

// ------------------------------------------------------------ colourways
// One per hour, in turn: the crew's paint for the fill fade (top, mid,
// bottom), the 3D block and the cutback border. Outline is always the
// near-black, highlights always white.
export const OUTLINE = 0x141018, SHINE_C = 0xffffff;
// fill top, mid, bottom, 3D block, cutback border, backdrop, backdrop bubbles
const WAYS = [
  [0xffd23a, 0xff8a1e, 0xe8322e, 0x3a1e6e, 0xf4f0e0, 0x1d5560, 0x266673], // sunset: yellow-orange-red, purple block, on deep teal
  [0xe6fbff, 0x4fd0ff, 0x2f5ce8, 0x1b1d4e, 0xffe14a, 0x4a2448, 0x5a2e58], // ice: white-cyan-blue, yellow cutback, on aubergine
  [0xf0ff6a, 0x7be83a, 0x12a058, 0x46145a, 0xffffff, 0x232c56, 0x2c3866], // toxic: lime-green, violet block, on navy
  [0xffd6ee, 0xff5cb8, 0xb0218c, 0x1d2c5a, 0xb8f4ff, 0x1d4a3c, 0x255a49], // bubblegum: pinks, ice cutback, on bottle green
  [0x8ff6ff, 0xff58d6, 0x7a34ff, 0x1a1040, 0xfff6c8, 0x3e3a1c, 0x4c4822], // electric: cyan-magenta-violet, on olive
  [0xfbfbfb, 0xcdd3df, 0xa3abc2, 0xd0242c, 0xffe24a, 0x1c2c4c, 0x24385c], // silver burner: chrome flats, red block, on navy
];
/** Per colourway, RGB565: [top, mid, bottom, outline, block, border, shine, backdrop, bubble]. */
export const WAY565 = WAYS.map((w) => [w[0], w[1], w[2], OUTLINE, w[3], w[4], SHINE_C, w[5], w[6]].map(to565));
/** The same rows as 0xRRGGBB, for the kit's shape calls. */
export const WAYC = WAYS.map((w) => [w[0], w[1], w[2], OUTLINE, w[3], w[4], SHINE_C, w[5], w[6]]);
export const wayOf = (h) => h % WAYS.length;
// By night the backdrop sinks (the paint of the letters stays loud, the ground goes quiet)
const sinkC = (c) => { const r = (((c >> 16) & 255) * 0.62) | 0, g = (((c >> 8) & 255) * 0.62) | 0, b = (((c & 255) * 0.62) | 0); return (r << 16) | (g << 8) | b; };
export const WAYC_N = WAYC.map((w) => w.map((c, k) => (k >= 7 ? sinkC(c) : c)));
export const WAY565_N = WAYC_N.map((w) => w.map(to565));

// ------------------------------------------------------------ stipple rank
/** A fixed 16 x 16 rank (0..255) per pixel: spray builds up and thins by it. */
// ------------------------------------------------------------ the backdrop
// The crew's own background behind the piece: a puffy flat cloud with a
// keyline and a light rim, cut off at the top by the girder. 1 fill, 2 keyline, 3 rim.
export const CLOUD = new Uint8Array(W * H);
export const CLOUD_BOT = new Int16Array(W);
{
  const bumps = [];
  for (let k = 0; k < 9; k++) bumps.push([9 + 18 * k + (hash(k, 1) % 5), 15 + (hash(k, 2) % 3), 7 + (hash(k, 3) % 3)]);
  for (let k = 0; k < 9; k++) bumps.push([14 + 17 * k + (hash(k, 4) % 5), 67 + (hash(k, 5) % 2), 5 + (hash(k, 6) % 3)]);
  bumps.push([7, 40, 12], [153, 42, 12]);
  const inside = (x, y) => {
    const qx = Math.max(Math.abs(x - 80) - (76 - 9), 0), qy = Math.max(Math.abs(y - 41.5) - (29 - 9), 0);
    if (qx * qx + qy * qy < 81) return true;
    for (const [bx, by, r] of bumps) if ((x - bx) ** 2 + (y - by) ** 2 < r * r) return true;
    return false;
  };
  const m = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) m[y * W + x] = y < KERB && inside(x + 0.5, y + 0.5) ? 1 : 0;
  const near = (x, y, r) => { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const X = x + i, Y = y + j; if (i * i + j * j <= r * r + 1 && X >= 0 && Y >= 0 && X < W && Y < H && m[Y * W + X]) return true; } return false; };
  for (let y = GIRDER; y < KERB; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      CLOUD[i] = m[i] ? 1 : near(x, y, 2) ? 2 : near(x, y, 3) ? 3 : 0;
    }
  for (let x = 0; x < W; x++) { CLOUD_BOT[x] = GIRDER; for (let y = GIRDER; y < KERB; y++) if (CLOUD[y * W + x] === 1) CLOUD_BOT[x] = y; }
}

export const RANK = new Uint8Array(256);
{
  const order = [...Array(256).keys()].sort((a, b) => hash(a, 5) - hash(b, 5));
  order.forEach((p, r) => { RANK[p] = r; });
}
export const BAYER = new Float32Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16));

// ------------------------------------------------------------ props

/** The spray can, tilted: body along (ax, ay) from its base to the cap. */
const CAN_BODY = 0x3c4452;
export function can(g, x, y, ax, ay, body, label) {
  const nx = -ay, ny = ax;
  const quad = (s0, s1, w, c) => g.fillPolygon([
    [x + ax * s0 + nx * w, y + ay * s0 + ny * w], [x + ax * s1 + nx * w, y + ay * s1 + ny * w],
    [x + ax * s1 - nx * w, y + ay * s1 - ny * w], [x + ax * s0 - nx * w, y + ay * s0 - ny * w]], c);
  quad(-1, 13.2, 3.9, OUTLINE);
  quad(0, 9, 2.9, CAN_BODY);
  quad(2.6, 6.2, 2.9, label);
  quad(9.6, 12.2, 2.1, 0xf2f2f2);
  quad(12.2, 13.4, 0.9, OUTLINE);
}

/** The buff roller on its pole: the sleeve centred at (x, y), the pole down to the bottom edge. */
export function roller(g, x, y, sleeve) {
  const X = Math.round(x), Y = Math.round(y);
  g.fillRect(X + 3, Y + 2, 2, 3, OUTLINE);          // the frame
  g.thickLine(X + 4, Y + 4, X + 9, H + 2, 2, 0x2a2420);  // the pole, out of frame
  g.fillRect(X - 5, Y - 3, 11, 6, OUTLINE);
  g.fillRect(X - 4, Y - 2, 9, 4, sleeve);
}

/** A four-point shine star of reach r (1..5) at an integer pixel. */
export function star(g, x, y, r, c) {
  x = Math.round(x); y = Math.round(y);
  if (r < 0.6) return;
  const L = Math.round(r);
  g.fillRect(x - L, y, 2 * L + 1, 1, c);
  g.fillRect(x, y - L, 1, 2 * L + 1, c);
  if (r > 2.2) { g.fillRect(x - 1, y - 1, 3, 3, c); }
  if (r > 3.4) { g.pixel(x - 2, y - 2, c); g.pixel(x + 2, y - 2, c); g.pixel(x - 2, y + 2, c); g.pixel(x + 2, y + 2, c); }
}

/** A puff of spray grain: n dots in a disc of radius r round (x, y), kept by rank below dens. */
export function mist(g, x, y, r, n, dens, c565, seed) {
  const buf = g.buf, thr = (dens * 255) | 0;
  let k = 0;
  for (let j = 0; j < n; j++) {
    const h = hash(seed, j, 9);
    if ((h & 255) >= thr) continue;
    const a = ((h >>> 8) & 255) / 256, q = ((h >>> 16) & 255) / 256;
    const rr = r * (0.25 + 0.75 * q);
    const px = (x + rr * COS[(a * 64) | 0]) | 0, py = (y + rr * SIN[(a * 64) | 0]) | 0;
    if (px >= 0 && py >= 0 && px < W && py < H) { buf[py * W + px] = c565; k++; }
  }
  g.cost.px += k; g.cost.box += n * 6;
}
const SIN = new Float32Array(64), COS = new Float32Array(64);
for (let i = 0; i < 64; i++) { SIN[i] = Math.sin((i / 64) * Math.PI * 2); COS[i] = Math.cos((i / 64) * Math.PI * 2); }
