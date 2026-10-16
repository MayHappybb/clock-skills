// Glassblower: the shop around the glass. The wall and the steel marver as
// one indexed picture lit by a coarse grid of furnace light; the furnace with
// its glory hole, sliding doors, fire and flames; embers; the gather; the
// colon marbles; the reflection in the marver; the hour's bubble and its
// burst. Colours of the glass: the batch of the hour.

import { hash, rand, noise2, sin, cos, to565, from565 } from '../js/kit.js';
import { M } from './glassblower-glyphs.js';

export const W = 160, H = 80, MARVER = 66;
export const PORT_X = 148, PORT_Y = 31, PORT_R = 9;
export const FOOT_MX = M + 15, FOOT_MY = M + 52;

const R8 = (c) => (c >> 16) & 255, G8 = (c) => (c >> 8) & 255, B8 = (c) => c & 255;
const rgb = (r, g, b) => (Math.max(0, Math.min(255, Math.round(r))) << 16) | (Math.max(0, Math.min(255, Math.round(g))) << 8) | Math.max(0, Math.min(255, Math.round(b)));
const mixc = (a, b, u) => rgb(R8(a) + (R8(b) - R8(a)) * u, G8(a) + (G8(b) - G8(a)) * u, B8(a) + (B8(b) - B8(a)) * u);
const mul = (a, k) => rgb(R8(a) * k, G8(a) * k, B8(a) * k);
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// ------------------------------------------------------------ glass: the batches

// body, rim (the dark edge a rod of glass shows), flat highlight, latticino thread
export const SETS = {
  cobalt: [0x3f72ff, 0x1a2c8e, 0xbcd4ff, 0xe4eeff],
  amber: [0xf59a1c, 0x7a3a06, 0xffe4a4, 0xfff2d8],
  ruby: [0xf23c6c, 0x780c30, 0xffc4d6, 0xffecf2],
  aqua: [0x24c8da, 0x0a5464, 0xc4f8ff, 0xecfeff],
  emerald: [0x24c86e, 0x0a5a2e, 0xb4f6cc, 0xeafff0],
  violet: [0xa868ff, 0x44208e, 0xe4d4ff, 0xf4eeff],
};
// hours, minutes: a complementary pair per hour
export const PAIRS = [['cobalt', 'amber'], ['ruby', 'aqua'], ['emerald', 'violet'], ['amber', 'cobalt'], ['aqua', 'ruby'], ['violet', 'emerald']];
export const pairFor = (h) => h % 6;

// incandescence: what glass shows by its own light, from dull red to white heat
const HOT = [[0, 0x9a2208], [0.2, 0xb82a08], [0.4, 0xd8380c], [0.6, 0xff7a1c], [0.8, 0xffc24e], [1, 0xfff4d6]];
export function hot(u) {
  if (u <= 0) return HOT[0][1];
  for (let k = 1; k < HOT.length; k++) if (u <= HOT[k][0]) return mixc(HOT[k - 1][1], HOT[k][1], (u - HOT[k - 1][0]) / (HOT[k][0] - HOT[k - 1][0]));
  return HOT[HOT.length - 1][1];
}

function lutFor(set) {
  const [body, rim, hi, thr] = SETS[set];
  const t = new Uint16Array(68);
  const add = (a, b, k) => rgb(R8(a) + R8(b) * k, G8(a) + G8(b) * k, B8(a) + B8(b) * k);
  for (let T = 0; T < 16; T++) {
    // a little heat adds light to the cold colour (a glowing seam brightens it); more replaces it
    const u = T / 15, a = 0.7 * sm(u / 0.3), w = sm((u - 0.2) / 0.5);
    const hb = [mul(hot(u * 0.8), 0.8), hot(u), hot(Math.min(1, u + 0.2)), hot(Math.min(1, u + 0.07))];
    const cb = [rim, body, hi, thr];
    for (let b = 0; b < 4; b++) t[(T << 2) | b] = to565(mixc(add(cb[b], hb[b], b === 0 ? a * 0.6 : a), hb[b], w));
  }
  // the edge that faces the glory hole catches its light: four strengths
  for (let l = 0; l < 4; l++) t[64 + l] = to565(mul(0xffa050, 0.45 + 0.17 * l));
  return t;
}
const LUTS = Object.fromEntries(Object.keys(SETS).map((k) => [k, lutFor(k)]));
const PAIR_LUTS = PAIRS.map(([a, b]) => ({ h: LUTS[a], m: LUTS[b] }));
export const glassLUT = (pair) => PAIR_LUTS[pair];

// ------------------------------------------------------------ the shop picture (flash: 12.8 KB index map)

//            wall      mortar    lip       marver    streak    under     brick     bmortar   shadow    ring      ringlit   port      edge
const DAY = [0x1b1722, 0x141119, 0x9aa0ae, 0x343740, 0x3f424c, 0x1d1f25, 0x4a2a22, 0x2a1610, 0x110c10, 0x5c5f6c, 0xa0a6b6, 0x200604, 0x6e3c2c];
const NIGHT = [0x0f0d14, 0x0b0a0f, 0x5e626e, 0x1f2127, 0x26282f, 0x111216, 0x2e1915, 0x1a0d0a, 0x09070a, 0x3a3c46, 0x62666f, 0x160402, 0x40221a];
// how much furnace light each surface takes (steel reflects most)
const TAKE = [0.34, 0.24, 0.55, 0.42, 0.5, 0.18, 0.32, 0.2, 0.05, 0.4, 0.5, 0, 0.4];
const LIGHT = 0xff6a20;
const BG = new Uint8Array(W * H);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    let v;
    if (x >= 133) {
      const d = Math.hypot(x + 0.5 - PORT_X, y + 0.5 - PORT_Y);
      if (x === 133) v = 8;
      else if (x === 134) v = 12;
      else if (d < PORT_R) v = 11;
      else if (d < PORT_R + 2.6) v = x + 0.5 - PORT_X > -(y + 0.5 - PORT_Y) * 0.6 && y + 0.5 < PORT_Y + 3 ? 10 : 9;
      else {
        const row = Math.floor(y / 5);
        v = y % 5 === 0 || (x + (row & 1) * 5) % 10 === 0 ? 7 : 6;
      }
    } else if (y >= MARVER) v = y === MARVER ? 2 : y >= 77 ? 5 : y === 69 || y === 73 ? 4 : 3;
    else {
      v = 0;
    }
    BG[y * W + x] = v;
  }
const BG_LUT = [DAY, NIGHT].map((base) => {
  const t = new Uint16Array(13 * 16);
  for (let i = 0; i < 13; i++)
    for (let l = 0; l < 16; l++) {
      const k = (l / 15) * TAKE[i];
      t[i * 16 + l] = to565(rgb(R8(base[i]) * (1 + k) + R8(LIGHT) * k * 0.55, G8(base[i]) * (1 + k * 0.5) + G8(LIGHT) * k * 0.55, B8(base[i]) + B8(LIGHT) * k * 0.4));
    }
  return t;
});

// the light grid: a point every 4 px
const GW = 41, GH = 21;
const STATIC = new Uint16Array(GW * GH);
for (let j = 0; j < GH; j++)
  for (let i = 0; i < GW; i++) {
    const x = i * 4, y = j * 4;
    const d = Math.hypot(x - PORT_X, (y - PORT_Y) * 1.3);
    STATIC[j * GW + i] = Math.round(255 * Math.exp(-d / (x >= 134 ? 22 : 58)));
  }
const KER = [];
for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) KER.push([di, dj, Math.max(0, 1 - Math.hypot(di, dj) / 2.6)]);

// the light falls in flat pools, screen-print style: four tones, no gradient
const BAND = Uint8Array.from({ length: 16 }, (_, i) => (i < 2 ? 0 : i < 5 ? 4 : i < 9 ? 8 : 13));
/** Per pixel: the surface's colour under the light at that point (bilinear from the grid, posterised). */
export function bgPass(g, GLOW, night, T) {
  const buf = g.buf, nightLut = BG_LUT[1], dayLut = BG_LUT[0];
  const nt = (night * 16) | 0;
  for (let y = 0; y < H; y++) {
    const ly = y >= MARVER + 1 ? 2 * MARVER - y : y;       // the marver shows the light of what stands on it
    const j = ly >> 2, fy = ly & 3, j1 = j + 1 < GH ? j + 1 : j;
    for (let x = 0; x < W; x++) {
      const i = x >> 2, fx = x & 3, i1 = i + 1 < GW ? i + 1 : i;
      const top = GLOW[j * GW + i] * (4 - fx) + GLOW[j * GW + i1] * fx;
      const bot = GLOW[j1 * GW + i] * (4 - fx) + GLOW[j1 * GW + i1] * fx;
      let v = (top * (4 - fy) + bot * fy) >> 4;
      if (v > 255) v = 255;
      const bd = BAYER[((y & 3) << 2) | (x & 3)];
      const k = y * W + x;
      buf[k] = (nt > bd ? nightLut : dayLut)[BG[k] * 16 + BAND[v >> 4]];
    }
  }
  g.cost.px += W * H; g.cost.box += W * H * 7;
}

// ------------------------------------------------------------ the furnace

const TILE = new Uint8Array(32 * 32);
for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
  // tileable value noise: sum of two octaves on a torus
  const a = noise2(x / 8, y / 8, 11), b = noise2(x / 4, y / 4, 12);
  const a2 = noise2((x + 32) / 8, y / 8, 11), b2 = noise2((x + 32) / 4, y / 4, 12);
  const u = x / 32;
  TILE[y * 32 + x] = Math.round(255 * ((a * (1 - u) + a2 * u) * 0.65 + (b * (1 - u) + b2 * u) * 0.35));
}
const FIRE = [0x3a0804, 0x5a0e04, 0x801606, 0xa82208, 0xc8320a, 0xe0460e, 0xf05e14, 0xfa7a1c, 0xff9428, 0xffab36, 0xffc04a, 0xffd264, 0xffe084, 0xffeaa4, 0xfff2c4, 0xfff8e0].map(to565);
const PORT_PX = [];
for (let y = PORT_Y - PORT_R - 1; y <= PORT_Y + PORT_R + 1; y++)
  for (let x = PORT_X - PORT_R - 1; x <= PORT_X + PORT_R + 1; x++) {
    const d = Math.hypot(x + 0.5 - PORT_X, y + 0.5 - PORT_Y);
    if (d < PORT_R) PORT_PX.push([x, y, Math.round((1 - d / PORT_R) * 255)]);
  }
const DOOR = to565(0x2c2e36), DOOR_EDGE = to565(0x50535e), DOOR_HOT = to565(0xc8400c);

export const furnace = {
  glow(GLOW, amt) {
    const k = (amt * 256) | 0;
    for (let i = 0; i < GLOW.length; i++) GLOW[i] += (STATIC[i] * k) >> 8;
  },
  addGlow(GLOW, x, y, amp) {
    const i0 = (x + 2) >> 2, j0 = (y + 2) >> 2;
    for (const [di, dj, w] of KER) {
      const i = i0 + di, j = j0 + dj;
      if (i < 0 || j < 0 || i >= GW || j >= GH || w <= 0) continue;
      GLOW[j * GW + i] += (amp * w) | 0;
    }
  },
  /** The glory hole: fire inside, two steel doors sliding apart by `open`, flames licking out above. */
  draw(g, T, open, flick, night) {
    const buf = g.buf, half = 1.5 + 8 * Math.min(1, open);
    const ox = (T * 9) | 0, oy = (T * 26) | 0, oy2 = (T * 15) | 0;
    const br = (0.55 + 0.45 * Math.min(1, open)) * flick * (1 - 0.3 * night);
    for (let k = 0; k < PORT_PX.length; k++) {
      const [x, y, c] = PORT_PX[k];
      const dx = x + 0.5 - PORT_X, i = y * W + x;
      if (dx < -half || dx > half) { buf[i] = dx < -half - 1 || dx > half + 1 ? DOOR : DOOR_EDGE; continue; }
      const n = TILE[((y + oy) & 31) * 32 + ((x + ox) & 31)] + TILE[((y + oy2) & 31) * 32 + ((x * 2 - ox) & 31)];
      let v = ((n * 0.3 + c * 0.75) * br) | 0;
      v = v >> 4; if (v > 15) v = 15;
      buf[i] = FIRE[v];
    }
    // the doors' inner edges glow from the fire
    for (let y = PORT_Y - 7; y <= PORT_Y + 7; y++) {
      const xl = Math.floor(PORT_X - half - 1), xr = Math.ceil(PORT_X + half);
      if (Math.hypot(xl + 0.5 - PORT_X, y + 0.5 - PORT_Y) < PORT_R) buf[y * W + xl] = DOOR_HOT;
      if (Math.hypot(xr + 0.5 - PORT_X, y + 0.5 - PORT_Y) < PORT_R) buf[y * W + xr] = DOOR_HOT;
    }
    // flames out of the gap, leaning left with the draught
    const fl = Math.min(1, open) * flick;
    if (fl > 0.3) {
      const lip = PORT_Y - PORT_R + 1, top = Math.max(1, lip - Math.round(20 * fl));
      for (let y = top; y < lip; y++) {
        const ny = (lip - y) / (lip - top + 1);
        const cx = PORT_X - ny * ny * 9, hw = (half + 1.5) * (1 - ny * 0.7);
        for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
          if (x < 135 || x >= W) continue;
          const n = TILE[((y + oy) & 31) * 32 + ((x * 2 + ox) & 31)];
          const edge = Math.abs(x + 0.5 - cx) / hw;
          const v = n - 255 * (ny * 0.85 + edge * 0.55) + 120 * fl;
          if (v > 0) buf[y * W + x] = FIRE[Math.min(13, 3 + (v >> 4))];
        }
      }
      g.cost.box += 300 * 6;
    }
    g.cost.box += PORT_PX.length * 6;
  },
};

// ------------------------------------------------------------ embers

const EMBER = [0xfff0b0, 0xffc040, 0xff8020, 0xd04010, 0x802008].map(to565);
export function embers(g, T, open) {
  const n = 4 + Math.round(6 * Math.min(1, open)), buf = g.buf;
  for (let k = 0; k < n; k++) {
    const P = 2.8, off = k * 0.61, c = Math.floor((T + off) / P), a = ((T + off) % P) / P;
    const h = hash(c, k, 5);
    const x = Math.round(142 + (h % 9) - a * (30 + (h >>> 8) % 16) + 1.5 * sin(T * 3 + k));
    const y = Math.round(PORT_Y - PORT_R - 1 - a * (24 + ((h >>> 16) % 8)));
    if (y < 0 || x < 96 || x >= W) continue;
    const col = EMBER[Math.min(4, (a * 5) | 0)];
    buf[y * W + x] = col;
    if (a < 0.3 && x + 1 < W) buf[y * W + x + 1] = col;
  }
  g.cost.box += n * 20;
}

// ------------------------------------------------------------ the gather

const GATHER = [0xc8380c, 0xff8a24, 0xffc860, 0xfff4d4].map((c) => c);
export const BLOB = {
  draw(g, b, T) {
    const r = b.r;
    g.fillCircle(b.x, b.y, r, GATHER[0], { aa: true });
    if (r > 1.6) g.fillCircle(b.x, b.y, r - 1.2, GATHER[1], { aa: true });
    if (r > 3) g.fillCircle(b.x + r * 0.12, b.y - r * 0.12, r * 0.62, GATHER[2], { aa: true });
    if (r > 4) {
      const a = T * 5 + (b.roll ?? 0);                    // it turns on the pipe (and as it rolls): a bright seam winds round it
      g.arc(b.x, b.y, r * 0.3, r * 0.62, a, a + 1.4, GATHER[3], { aa: true });
      g.fillCircle(b.x + r * 0.42, b.y - r * 0.45, Math.max(0.9, r * 0.14), 0xffffff, { aa: true });
    }
  },
};

/** Sparks thrown off the gather as the new strand is drawn out of it. */
const SPARK = [0xfff4c0, 0xffc040, 0xff8020, 0xc83a0c].map(to565);
export function sparks(g, b, seed) {
  const t = b.tau - 0.1;
  if (t < 0 || t > 0.9) return;
  const buf = g.buf;
  for (let k = 0; k < 7; k++) {
    const h = hash(seed, k, 9), an = -1.57 + ((h % 1000) / 1000 - 0.5) * 2.2, v = 42 + ((h >>> 10) % 30);
    const life = 0.5 + ((h >>> 20) % 40) / 100;
    if (t > life) continue;
    const x = Math.round(b.x + cos(an) * (b.r + v * t)), y = Math.round(b.y + sin(an) * (b.r + v * t) + 70 * t * t);
    if (x < 0 || x >= W || y < 0 || y >= MARVER) continue;
    buf[y * W + x] = SPARK[Math.min(3, ((t / life) * 4) | 0)];
  }
  g.cost.box += 7 * 12;
}

// ------------------------------------------------------------ the colon: two clear marbles

export function colonMarble(g, x, y, heat, night) {
  const u = Math.min(1, heat / 255), w = sm(u / 0.5);
  const body = mixc(0x9fd2e0, hot(u), w), rim = mixc(0x34566a, mul(hot(u * 0.8), 0.8), w);
  g.fillCircle(x, y, 2.9, rim, { aa: true });
  g.fillCircle(x, y, 2.0, body, { aa: true });
  g.fillRect(Math.round(x), Math.round(y - 2), 1, 1, 0xffffff);
}

// ------------------------------------------------------------ the marver's reflection

export function reflect(g, GLASS, jobs) {
  const buf = g.buf;
  let n = 0;
  for (let y = MARVER + 1; y < 78; y++) {
    const src = 2 * MARVER - y, a = ((0.4 * (1 - (y - MARVER - 1) / 11)) * 256) | 0;
    if (src < 52 || a <= 0) continue;
    for (let x = 0; x < 132; x++) {
      if (!GLASS[(src - 52) * W + x]) continue;
      const d = buf[y * W + x], s = buf[src * W + x];
      const r = ((d >> 11) * (256 - a) + (s >> 11) * a) >> 8;
      const gg = (((d >> 5) & 63) * (256 - a) + ((s >> 5) & 63) * a) >> 8;
      const b = ((d & 31) * (256 - a) + (s & 31) * a) >> 8;
      buf[y * W + x] = (r << 11) | (gg << 5) | b;
      n++;
    }
  }
  g.cost.blend += n; g.cost.box += 132 * 11;
  g.clip(0, MARVER + 1, 132, 11);
  for (const j of jobs) if (j.blob) g.fillEllipse(j.blob.x, 2 * MARVER + 1 - j.blob.y, j.blob.r * 0.95, j.blob.r * 0.8, 0xff9a30, { aa: true, a: 0.3 });
  g.unclip();
}

// ------------------------------------------------------------ the hour: a bubble blown out of the glory hole

const BUB0 = 2.0;
export const bubble = {
  cx1: 116, cy1: 35,
  draw(g, s, pairOld, pairNew, BURST) {
    const set = SETS[PAIRS[pairNew][0]];
    if (s < BUB0) return;
    // the film thins out over a few frames as it bursts (the flakes fly from its rim)
    const q = s < BURST ? 1 : 1 - (s - BURST) / 0.3;
    if (q > 0) {
      const u = Math.min(1, (s - BUB0) / (BURST - BUB0)), e = 1 - (1 - u) ** 2.2;
      const r = (2 + 27 * e) * (1 + 0.03 * sin(Math.min(s, BURST) * 9) * q) + (1 - q) * 3;
      const x = PORT_X - 32 * sm(u), y = PORT_Y + 4 * sm(u);
      const heat = 1 - sm(u * 1.6);
      const rimc = mixc(set[0], hot(0.75), heat), tint = mixc(set[0], hot(0.6), heat);
      g.fillCircle(x, y, r, tint, { aa: true, a: (0.14 + 0.2 * heat) * q });
      g.ring(x, y, Math.max(0, r - 1.5), r, rimc, { aa: true, a: 0.9 * q });
      if (r > 6) {
        g.arc(x, y, r - 4.2, r - 2.6, 0.25, 1.35, mixc(set[2], 0xffffff, 0.4), { aa: true, a: 0.85 * q });
        g.fillCircle(x - r * 0.5, y - r * 0.42, 1.3, 0xffffff, { aa: true, a: 0.9 * q });
        g.arc(x, y, r - 3.4, r - 2.4, 3.6, 4.3, set[2], { aa: true, a: 0.5 * q });
      }
    }
    if (s >= BURST) {
      const wr = (s - BURST) * 95;
      if (wr < 175) g.ring(this.cx1, this.cy1, Math.max(0, wr - 1.3), wr, mixc(set[2], 0xffffff, 0.5), { aa: true, a: 0.75 * (1 - wr / 175) });
    }
  },
};

/** The burst: the over-blown bubble shatters into tissue-thin flakes that glitter as they fall. */
export function flakes(g, s, BURST) {
  const dt = s - BURST;
  if (dt < 0 || dt > 4.2) return;
  const dd = (1 - Math.exp(-1.6 * dt)) / 1.6, buf = g.buf;
  const F = Math.floor(s * 14);
  for (let k = 0; k < 40; k++) {
    if (dt > 2.6 + (k % 7) * 0.22) continue;
    const an = (k / 40) * 6.2832 + rand(k, 1) * 0.3, v = 34 + rand(k, 2) * 40, rr = 24 + rand(k, 3) * 4;
    const x = Math.round(bubble.cx1 + cos(an) * (rr + v * dd));
    const y = Math.round(bubble.cy1 + sin(an) * (rr + v * dd) * 0.8 + 7 * dt * dt);
    if (x < 0 || x >= W || y < 0 || y >= MARVER) continue;
    const tw = hash(k, F) & 3;
    buf[y * W + x] = tw === 0 ? 0xffff : to565(0xc8d8e8);
  }
  g.cost.box += 40 * 12;
}
