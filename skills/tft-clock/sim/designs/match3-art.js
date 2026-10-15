// Match-3 art: every picture the face blits, rendered once at load (on the
// device: tables in flash), and the blitter that draws them.
//
// Sprites are RGB565 + a 5-bit alpha (0..32), supersampled 4x4 when made, so
// their edges are anti-aliased and a gem can sit at quarter-pixel offsets:
// each moving piece has 4 x 4 sub-pixel copies, which is how a gem glides by
// fractions of a pixel without any per-pixel maths at run time.
//
// The blitter writes the frame buffer directly with integer RGB565 blends and
// charges the canvas's cost counters honestly (box per pixel scanned, px or
// blend per pixel written), the way vector-beam.js does.

import { R, G, B, hex } from '../js/kit.js';

export const CELL = 8;
export const SPR = 10;            // a gem sprite's box: the cell plus 1 px all round

// ------------------------------------------------------------ sprite making

const to565 = (r, g, b) => {
  r = r < 0 ? 0 : r > 255 ? 255 : r; g = g < 0 ? 0 : g > 255 ? 255 : g; b = b < 0 ? 0 : b > 255 ? 255 : b;
  return (((r * 31 + 127) / 255) << 11) | (((g * 63 + 127) / 255) << 5) | ((b * 31 + 127) / 255);
};

/** fn(x, y) -> 0xRRGGBB or -1 (outside), x/y continuous sprite coords; or [colour, alpha 0..1]. */
export function makeSprite(w, h, fn, ss = 4) {
  const col = new Uint16Array(w * h), a = new Uint8Array(w * h), rgb = new Uint32Array(w * h);
  const n = ss * ss;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, cov = 0;
      for (let j = 0; j < ss; j++)
        for (let i = 0; i < ss; i++) {
          let c = fn(x + (i + 0.5) / ss, y + (j + 0.5) / ss), al = 1;
          if (Array.isArray(c)) { al = c[1]; c = c[0]; }
          if (c < 0 || al <= 0) continue;
          r += R(c) * al; g += G(c) * al; b += B(c) * al; cov += al;
        }
      if (cov <= 0) continue;
      const k = y * w + x;
      col[k] = to565(r / cov, g / cov, b / cov);
      rgb[k] = ((r / cov) << 16) | ((g / cov) << 8) | (b / cov);
      a[k] = Math.round((cov / n) * 32);
    }
  return { w, h, col, a, rgb };
}

// ------------------------------------------------------------ the blitter

/** Blit with alpha; `am` scales the alpha (0..32). */
export function blit(g, s, x, y, am = 32) {
  const buf = g.buf, W = g.width, H = g.height, w = s.w, h = s.h, col = s.col, al = s.a;
  let np = 0, nb = 0;
  for (let j = 0; j < h; j++) {
    const yy = y + j;
    if (yy < 0 || yy >= H) continue;
    const row = yy * W;
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      let a = al[k];
      if (!a) continue;
      const xx = x + i;
      if (xx < 0 || xx >= W) continue;
      if (am < 32) a = (a * am) >> 5;
      if (a >= 32) { buf[row + xx] = col[k]; np++; }
      else if (a > 0) {
        const d = buf[row + xx], c = col[k];
        const dr = d >> 11, dg = (d >> 5) & 63, db = d & 31;
        const r = dr + ((((c >> 11) - dr) * a) >> 5), gg = dg + (((((c >> 5) & 63) - dg) * a) >> 5), b = db + ((((c & 31) - db) * a) >> 5);
        buf[row + xx] = (r << 11) | (gg << 5) | b; nb++;
      }
    }
  }
  g.cost.calls++; g.cost.box += w * h; g.cost.px += np; g.cost.blend += nb;
}

/** Blit one colour through a sprite's alpha only (shadows, moats): the colour data is not used. */
export function blitTint(g, s, x, y, c, am = 32) {
  const buf = g.buf, W = g.width, H = g.height, w = s.w, h = s.h, al = s.a;
  const cr = c >> 11, cg = (c >> 5) & 63, cb = c & 31;
  let nb = 0;
  for (let j = 0; j < h; j++) {
    const yy = y + j;
    if (yy < 0 || yy >= H) continue;
    const row = yy * W;
    for (let i = 0; i < w; i++) {
      let a = al[j * w + i];
      if (!a) continue;
      const xx = x + i;
      if (xx < 0 || xx >= W) continue;
      a = (a * am) >> 5;
      if (!a) continue;
      const d = buf[row + xx], dr = d >> 11, dg = (d >> 5) & 63, db = d & 31;
      buf[row + xx] = ((dr + (((cr - dr) * a) >> 5)) << 11) | ((dg + (((cg - dg) * a) >> 5)) << 5) | (db + (((cb - db) * a) >> 5));
      nb++;
    }
  }
  g.cost.calls++; g.cost.box += w * h; g.cost.blend += nb;
}

/** Additive blit (light): adds the sprite's colour times its alpha (and `am`). */
export function blitAdd(g, s, x, y, am = 32) {
  const buf = g.buf, W = g.width, H = g.height, w = s.w, h = s.h, col = s.col, al = s.a;
  let nb = 0;
  for (let j = 0; j < h; j++) {
    const yy = y + j;
    if (yy < 0 || yy >= H) continue;
    const row = yy * W;
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      let a = al[k];
      if (!a) continue;
      const xx = x + i;
      if (xx < 0 || xx >= W) continue;
      a = (a * am) >> 5;
      if (!a) continue;
      const d = buf[row + xx], c = col[k];
      let r = (d >> 11) + (((c >> 11) * a) >> 5), gg = ((d >> 5) & 63) + ((((c >> 5) & 63) * a) >> 5), b = (d & 31) + (((c & 31) * a) >> 5);
      if (r > 31) r = 31; if (gg > 63) gg = 63; if (b > 31) b = 31;
      buf[row + xx] = (r << 11) | (gg << 5) | b; nb++;
    }
  }
  g.cost.calls++; g.cost.box += w * h; g.cost.blend += nb;
}

/** A light dot at a fractional position: bilinear 2x2 additive splat. */
export function spark(g, x, y, c565, k) {
  x -= 0.5; y -= 0.5;
  const ix = x | 0, iy = y | 0, u = x - ix, v = y - iy;
  addPx(g, ix, iy, c565, (1 - u) * (1 - v) * k); addPx(g, ix + 1, iy, c565, u * (1 - v) * k);
  addPx(g, ix, iy + 1, c565, (1 - u) * v * k); addPx(g, ix + 1, iy + 1, c565, u * v * k);
  g.cost.box += 10;
}
function addPx(g, x, y, c, k) {
  if (x < 0 || y < 0 || x >= g.width || y >= g.height || k < 0.03) return;
  const a = (k > 1 ? 32 : (k * 32) | 0), i = y * g.width + x, d = g.buf[i];
  let r = (d >> 11) + (((c >> 11) * a) >> 5), gg = ((d >> 5) & 63) + ((((c >> 5) & 63) * a) >> 5), b = (d & 31) + (((c & 31) * a) >> 5);
  if (r > 31) r = 31; if (gg > 63) gg = 63; if (b > 31) b = 31;
  g.buf[i] = (r << 11) | (gg << 5) | b; g.cost.blend++;
}
/** A solid dot (mix towards c565 by k), for shards. */
export function dot(g, x, y, c, k) {
  x -= 0.5; y -= 0.5;
  const ix = x | 0, iy = y | 0, u = x - ix, v = y - iy;
  mixPx(g, ix, iy, c, (1 - u) * (1 - v) * k); mixPx(g, ix + 1, iy, c, u * (1 - v) * k);
  mixPx(g, ix, iy + 1, c, (1 - u) * v * k); mixPx(g, ix + 1, iy + 1, c, u * v * k);
  g.cost.box += 10;
}
function mixPx(g, x, y, c, k) {
  if (x < 0 || y < 0 || x >= g.width || y >= g.height || k < 0.04) return;
  const a = (k > 1 ? 32 : (k * 32) | 0), i = y * g.width + x, d = g.buf[i];
  const dr = d >> 11, dg = (d >> 5) & 63, db = d & 31;
  g.buf[i] = ((dr + ((((c >> 11) - dr) * a) >> 5)) << 11) | ((dg + (((((c >> 5) & 63) - dg) * a) >> 5)) << 5) | (db + ((((c & 31) - db) * a) >> 5));
  g.cost.blend++;
}
export const c565 = (c) => to565(R(c), G(c), B(c));

// ------------------------------------------------------------ gems

const mixc = (a, b, u) => {
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  return ((R(a) + (R(b) - R(a)) * u) << 16) | ((G(a) + (G(b) - G(a)) * u) << 8) | (B(a) + (B(b) - B(a)) * u);
};
const ramp3 = (d, m, l, u) => (u < 0.5 ? mixc(d, m, u * 2) : mixc(m, l, (u - 0.5) * 2));

const L3 = (() => { const x = -0.5, y = -0.72, z = 1.0, n = Math.hypot(x, y, z); return [x / n, y / n, z / n]; })();

function poly(n, r, rot = 0, sx = 1, sy = 1, dy = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = rot + (i / n) * Math.PI * 2; pts.push([Math.sin(a) * r * sx, -Math.cos(a) * r * sy + dy]); }
  return pts;
}
/** Edges of a convex polygon as [nx, ny, h]: inside where nx*x + ny*y <= h. */
function edges(pts) {
  const E = [];
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    let nx = by - ay, ny = -(bx - ax);
    const l = Math.hypot(nx, ny); nx /= l; ny /= l;
    let h = nx * ax + ny * ay;
    if (h < 0) { nx = -nx; ny = -ny; h = -h; }
    E.push([nx, ny, h]);
  }
  return E;
}

// The five jewels: a silhouette each (read by shape as well as colour), and
// a dark / body / light ramp. No yellow and no white among them: gold and
// white belong to the time.
export const GEMS = [
  { name: 'ruby', E: edges([[-3.4, -2.1], [-2.1, -3.4], [2.1, -3.4], [3.4, -2.1], [3.4, 2.1], [2.1, 3.4], [-2.1, 3.4], [-3.4, 2.1]]), d: hex('5c0418'), m: hex('e8183c'), l: hex('ff9cb0'), bevel: 1.25 },
  { name: 'topaz', E: edges(poly(6, 3.95)), d: hex('6a2400'), m: hex('ff7410'), l: hex('ffd28a'), bevel: 1.3 },
  { name: 'emerald', E: edges(poly(4, 1, 0, 3.55, 4.05)), d: hex('04461c'), m: hex('18c04a'), l: hex('b4ffbc'), bevel: 1.25 },
  { name: 'sapphire', round: 3.75, d: hex('081c6a'), m: hex('2470ff'), l: hex('b8dcff') },
  { name: 'amethyst', E: edges(poly(3, 4.5, 0, 1, 1, 0.75)), d: hex('34085c'), m: hex('a83cf0'), l: hex('eebcff'), bevel: 1.2 },
];

/**
 * Colour of gem type t at gem-local (u, v) (pixels from its centre), or -1.
 * act 0..1: 0 calm (the board at rest: desaturated, dimmer), 1 full (a jewel
 * that is acting: swapping, falling, popping); act < 0 sinks it further (the
 * moat round the time). flash 0..1 goes to white (a pop), s scales.
 */
function gemAt(t, u, v, act = 1, flash = 0, s = 1) {
  const G0 = GEMS[t];
  u /= s * JEWEL_SIZE; v /= s * JEWEL_SIZE;
  let col;
  if (G0.round) {
    const r = Math.hypot(u, v), R0 = G0.round;
    if (r > R0) return -1;
    const nx = u / R0, ny = v / R0, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    let lam = nx * L3[0] + ny * L3[1] + nz * L3[2];
    // a cabochon: smooth dome, bright inner glow low-right (light through the stone)
    const glow = Math.max(0, 1 - Math.hypot(u - 1.1, v - 1.2) / 2.6) * 0.35;
    col = ramp3(G0.d, G0.m, G0.l, lam * 0.85 + glow);
    if (R0 - r < 0.55) col = mixc(col, G0.d, 0.55);
    const sp = Math.hypot(u + 1.25, v + 1.35);
    if (sp < 0.85) col = mixc(col, G0.l, 0.95 - sp * 0.5);
  } else {
    let m = -1e9, e = 0;
    for (let i = 0; i < G0.E.length; i++) { const d = G0.E[i][0] * u + G0.E[i][1] * v - G0.E[i][2]; if (d > m) { m = d; e = i; } }
    if (m > 0) return -1;
    const depth = -m;
    let lam;
    if (depth < G0.bevel) {
      const [nx, ny] = G0.E[e], l = Math.hypot(nx, ny, 0.95);
      lam = (nx * L3[0] + ny * L3[1] + 0.95 * L3[2]) / l;
      lam = 0.15 + lam * 0.95;
    } else {
      lam = 0.62 - 0.07 * (u + v);    // the table: flat, a little darker low-right
    }
    col = ramp3(G0.d, G0.m, G0.l, lam);
    if (depth < 0.42) col = mixc(col, G0.d, 0.6);      // a dark rim keeps the silhouette crisp
    const sp = Math.hypot(u + 1.05, v + 1.15);
    if (depth >= G0.bevel && sp < 0.85) col = mixc(col, G0.l, 0.9 - sp * 0.5);
  }
  // calm: the jewels at rest sit well below the time, greyed and dimmed;
  // acting ones come up to full colour
  const a = act < 0 ? 0 : act;
  const sat = CALM_SAT + (1 - CALM_SAT) * a, val = (CALM_VAL + (1 - CALM_VAL) * a) * (act < 0 ? 1 + act * 0.2 : 1);
  const l = R(col) * 0.3 + G(col) * 0.59 + B(col) * 0.11;
  col = mixc(0, mixc((l << 16) | (l << 8) | l, col, sat), val);
  if (flash > 0) col = mixc(col, mixc(G0.l, 0xffffff, 0.3), flash);
  return col;
}
const CALM_SAT = 0.6, CALM_VAL = 0.56;
export const JEWEL_SIZE = 0.86;   // the jewels a size below the time's stones

// The time's stone: a cut diamond seen from above, in a gold bezel. A small
// white table; round it a crown of eight facet wedges, alternately cool
// blue-white and deep steel blue, lit from the upper left; one rainbow fire
// pixel, at position `fire` (0..7) round the crown, in that position's hue.
const GOLD_D = hex('7a4a08'), GOLD = hex('f2b632'), GOLD_L = hex('fff2a8');
export const GOLD565 = c565(GOLD), GOLDL565 = c565(GOLD_L), GOLDD565 = c565(GOLD_D);
const FIREC = ['ff5070', 'ffa030', 'fff050', '60f070', '40e0ff', '6090ff', 'c070ff', 'ff60d0'].map(hex);
const DIA_E = edges(poly(8, 3.95, Math.PI / 8));
const DK = hex('1c2468'), BODY = hex('9cb6ee'), ICE = hex('f4f8ff');
function diamondAt(u, v, fire = -1, lit = 0, flash = 0, s = 1) {
  u /= s; v /= s;
  let m = -1e9;
  for (let i = 0; i < 8; i++) { const d = DIA_E[i][0] * u + DIA_E[i][1] * v - DIA_E[i][2]; if (d > m) m = d; }
  if (m > 0) return -1;
  const depth = -m;
  let col;
  if (depth < 0.8) {
    const lam = 0.5 - 0.13 * (u + v);                        // the gold bezel
    col = ramp3(GOLD_D, GOLD, GOLD_L, lam);
  } else {
    const r = Math.hypot(u, v), a = Math.atan2(u, -v);
    const k = ((Math.floor((a / (Math.PI * 2)) * 8 + 8)) % 8 + 8) % 8;        // wedge 0..7, clockwise from 12
    const mid = ((k + 0.5) / 8) * Math.PI * 2, face = Math.cos(mid + Math.PI * 0.25);   // 1 facing the upper left
    if (r < 1.15) col = 0xffffff;                                               // the table
    else {
      const tone = k & 1 ? 0.12 + 0.3 * (face + 1) / 2 : 0.5 + 0.5 * (face + 1) / 2;
      col = ramp3(DK, BODY, ICE, tone);
      if (fire >= 0) {
        const fa = ((fire + 0.5) / 8) * Math.PI * 2, fx = 2.1 * Math.sin(fa), fy = -2.1 * Math.cos(fa);
        if (Math.abs(u - fx) < 0.8 && Math.abs(v - fy) < 0.8) col = FIREC[fire];
      }
    }
    if (depth < 1.2) col = mixc(col, hex('1c2060'), 0.35);                      // the girdle's shadow
  }
  if (lit > 0) col = mixc(col, 0xffffff, lit * 0.35);
  if (flash > 0) col = mixc(col, 0xffffff, flash);
  return col;
}

// The colour bomb (hour show): a prism orb, rainbow bands turning.
const RAIN = ['ff3050', 'ff9020', 'ffe040', '40e060', '30a0ff', 'b050ff'].map(hex);
function bombAt(u, v, ph = 0) {
  const r = Math.hypot(u, v), R0 = 5.4;
  if (r > R0) return -1;
  const nx = u / R0, ny = v / R0, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  const lam = nx * L3[0] + ny * L3[1] + nz * L3[2];
  const band = Math.floor(((Math.atan2(nx, nz) + ny * 1.2) / Math.PI) * 3 + ph * 6 + 60) % 6;
  let col = mixc(hex('300a40'), mixc(RAIN[band], 0xffffff, lam > 0.8 ? (lam - 0.8) * 2 : 0), 0.55 + lam * 0.45);
  if (R0 - r < 0.6) col = mixc(col, hex('200830'), 0.6);
  const sp = Math.hypot(u + 1.5, v + 1.6);
  if (sp < 1.2) col = mixc(col, 0xffffff, 1 - sp / 1.2 * 0.4);
  return col;
}

// ------------------------------------------------------------ the sprite sets

const C0 = SPR / 2;     // gem centre in sprite coords (cell centre + 1)
/** MOVE[t][fy*4 + fx]: gem t at sub-pixel offset (fx/4, fy/4); t = 5 is the diamond. */
export const MOVE = [];
/** REST[t][lv]: gem t at rest, lv 0 moat-deep, 1 calm, 2, 3, 4 full (acting). */
export const REST = [];
/** POP[t][k]: gem t popping, k = 0..3 (flash, shrink). */
export const POP = [];
/** DIA[fire][lit]: the diamond at rest, fire pixel at 0..7 round the crown, sweep light 0..3. */
export const DIA = [];
for (let t = 0; t < 6; t++) {
  const at = (u, v, act, flash, s) => (t < 5 ? gemAt(t, u, v, act, flash, s) : diamondAt(u, v, -1, 0, flash, s));
  const mv = [];
  for (let fy = 0; fy < 4; fy++)
    for (let fx = 0; fx < 4; fx++)
      mv.push(makeSprite(SPR, SPR, (x, y) => at(x - C0 - fx / 4, y - C0 - fy / 4, 1, 0, 1)));
  MOVE.push(mv);
  if (t < 5) REST.push([-1, 0, 0.33, 0.67, 1].map((l) => makeSprite(SPR, SPR, (x, y) => at(x - C0, y - C0, l, 0, 1))));
  POP.push([[0, 0.85, 1.12], [1, 0.6, 1.0], [2, 0.35, 0.72], [3, 0.15, 0.42]].map(([, fl, s]) => makeSprite(SPR, SPR, (x, y) => at(x - C0, y - C0, 1, fl, s))));
}
for (let f = 0; f < 8; f++) DIA.push([0, 1, 2, 3].map((l) => makeSprite(SPR, SPR, (x, y) => diamondAt(x - C0, y - C0, f, l / 3))));
/** BOMB[phase 0..7], 14 x 14, centred at 7. */
export const BOMB = Array.from({ length: 8 }, (_, p) => makeSprite(14, 14, (x, y) => bombAt(x - 7, y - 7, p / 8)));
/** The bomb's halo, 28 x 28 centred at 14 (additive). */
export const HALO = makeSprite(28, 28, (x, y) => { const d = Math.hypot(x - 14, y - 14) / 13.5; return d >= 1 ? -1 : [hex('ffc8f0'), Math.min(1, 1.3 * Math.pow(1 - d, 1.4))]; }, 2);

/** Soft glow discs (additive), radius r, colour c: 16 x 16, centred at 8. */
function glow(c, r) {
  return makeSprite(16, 16, (x, y) => { const d = Math.hypot(x - 8, y - 8) / r; return d >= 1 ? -1 : [c, (1 - d) * (1 - d)]; }, 2);
}
export const GLOW_GOLD = glow(hex('ffc850'), 7.5);
export const GLOW_WHITE = glow(hex('d8e8ff'), 7.5);
export const GLOW_BIG = makeSprite(24, 24, (x, y) => { const d = Math.hypot(x - 12, y - 12) / 11.5; return d >= 1 ? -1 : [hex('fff0d0'), (1 - d) * (1 - d)]; }, 2);

/** Four-point star sparkles (additive), sizes 0..4: 11 x 11 centred at 5.5. */
export const STAR = [1.4, 2.4, 3.4, 4.4, 5.2].map((L) => makeSprite(11, 11, (x, y) => {
  const ax = Math.abs(x - 5.5), ay = Math.abs(y - 5.5);
  const f = (a, b) => Math.max(0, 1 - a / L) * Math.max(0, 1 - b / 0.75);
  const v = Math.max(f(ax, ay), f(ay, ax), Math.max(0, 1 - Math.hypot(ax, ay) / 1.3));
  return v <= 0 ? -1 : [0xffffff, Math.min(1, v * 1.3)];
}));

// ------------------------------------------------------------ type: the game's own lettering
//
// A chunky arcade face, 5 x 6 with two-pixel stems, cut like the gems:
// a bevel of light on top, gold to orange down the letter, a plum keyline.

const GLYPHS = {
  A: ['.###.', '##.##', '##.##', '#####', '##.##', '##.##'],
  C: ['.####', '##...', '##...', '##...', '##...', '.####'],
  E: ['#####', '##...', '####.', '##...', '##...', '#####'],
  G: ['.####', '##...', '##.##', '##..#', '##..#', '.####'],
  I: ['##', '##', '##', '##', '##', '##'],
  L: ['##...', '##...', '##...', '##...', '##...', '#####'],
  N: ['##..#', '###.#', '#####', '##.##', '##..#', '##..#'],
  P: ['####.', '##.##', '##.##', '####.', '##...', '##...'],
  R: ['####.', '##.##', '##.##', '####.', '##.##', '##.##'],
  S: ['.####', '##...', '.###.', '...##', '...##', '####.'],
  T: ['#####', '.##..', '.##..', '.##..', '.##..', '.##..'],
  U: ['##.##', '##.##', '##.##', '##.##', '##.##', '.###.'],
  V: ['##.##', '##.##', '##.##', '##.##', '.###.', '..#..'],
  '!': ['##', '##', '##', '##', '..', '##'],
  ' ': ['..'],
};

/** A word as a bitmap: rows of 0/1, with `sc` pixels per glyph pixel. */
function wordBits(str) {
  const rows = Array.from({ length: 6 }, () => []);
  for (const ch of str) {
    const gl = GLYPHS[ch];
    for (let j = 0; j < 6; j++) { const line = gl[j] ?? gl[0].replace(/./g, '.'); for (const c of line) rows[j].push(c === '#' ? 1 : 0); rows[j].push(0); }
  }
  for (const r of rows) r.pop();
  return rows;
}

/**
 * A word sprite with a 1 px plum keyline, at vertical sub-pixel offset fy/4.
 * `top`/`bot` colour the letter's face top to bottom.
 */
export function wordSprite(str, fy = 0, top = hex('fff6c0'), bot = hex('ff9a20'), key = hex('2a0634')) {
  const bits = wordBits(str), bw = bits[0].length, bh = 6;
  const w = bw + 2, h = bh + 3;
  const inside = (x, y) => { x = Math.floor(x); y = Math.floor(y); return x >= 0 && y >= 0 && x < bw && y < bh && bits[y][x] === 1; };
  return makeSprite(w, h, (x, y) => {
    const lx = x - 1, ly = y - 1 - fy / 4;
    if (inside(lx, ly)) {
      const up = !inside(lx, ly - 1);
      const c = mixc(top, bot, ly / bh);
      return up ? mixc(c, 0xffffff, 0.6) : c;
    }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inside(lx + dx, ly + dy)) return key;
    if (inside(lx - 1, ly - 2) || inside(lx, ly - 2)) return key;   // a deeper shadow below
    return -1;
  });
}

// call-outs in candy pink, so they never look like the time's gold
export const WORDS = ['NICE!', 'GREAT!', 'SUPER!'].map((w) => [0, 1, 2, 3].map((fy) => wordSprite(w, fy, hex('ffe8f6'), hex('ff4aa8'), hex('2a0634'))));

/** The LEVEL UP ribbon: a candy-pink banner with gold edges, 4 horizontal sub-pixel phases. */
export const BANNER = [0, 1, 2, 3].map((fx) => {
  const word = wordSprite('LEVEL UP!', 0, hex('ffffff'), hex('ffe070'), hex('4a0630'));
  const w = 74, h = 17, wx = Math.round((w - word.w) / 2), wy = 4;
  return makeSprite(w + 1, h, (x, y) => {
    x -= fx / 4;
    if (x < 0 || x >= w || y < 0 || y >= h) return -1;
    // notched ribbon ends
    const nd = Math.abs(y - h / 2) * 0.55;
    if (x < 4 - nd || x > w - 4 + nd) return -1;
    const ix = Math.floor(x) - wx, iy = Math.floor(y) - wy;
    if (ix >= 0 && iy >= 0 && ix < word.w && iy < word.h && word.a[iy * word.w + ix] > 16) return word.rgb[iy * word.w + ix];
    if (y < 1.5 || y > h - 1.5) return y < 1.5 ? GOLD_L : GOLD_D;
    if (y < 2.5 || y > h - 2.5) return GOLD;
    return mixc(hex('ff4aa0'), hex('a0105a'), (y - 2) / (h - 4));
  });
});

export { GOLD, GOLD_L, GOLD_D, mixc };
