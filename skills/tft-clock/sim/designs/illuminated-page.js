// The page for 'illuminated': vellum, ruled text in a textura hand, the
// rubric, the ivy border, the great hour initial and the minute champs, as
// albedo (RGB565) plus a gold-leaf layer (mask and pillowed normals). Built
// once per hour (the page) or once at start-up (the initials); the face
// lights it every frame.

import { Gfx, hex, mix, scale, R, G, B, rand, noise2, clamp, to565, from565, sprite } from '../js/kit.js';
import { buildDigit } from './illuminated-glyphs.js';

export const W = 160, H = 80, GUT = 80;

// ------------------------------------------------------------ palette
// Vellum and iron-gall ink; the illuminator's pigments: ultramarine (lapis),
// vermilion, white lead, verdigris for the ivy stems; burnished gold leaf.
export const P = {
  vel: hex('eee0c0'), velD: hex('d8c49a'), velEdge: hex('b89c70'),
  ink: hex('2e1c10'), inkL: hex('6a4a30'), rule: hex('d6b89a'),
  lapis: hex('2a4cb0'), lapisD: hex('182c78'), lapisL: hex('5a80e0'),
  verm: hex('d4442a'), vermD: hex('9a2a18'), vermL: hex('f08060'),
  white: hex('fbf6ea'), rubric: hex('c23a22'),
  green: hex('3c7a48'), greenL: hex('6aa46a'),
  goldBase: hex('b8902e'),
};

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// ------------------------------------------------------------ layout
export const HB = { x: 4, y: 4, w: 70, h: 72 };               // the great initial: the hour
export const HD = [{ x: 11, y: 15 }, { x: 41, y: 15 }];       // its two numerals (glyph boxes incl. pad)
export const HG = { w: 25, h: 46, thick: 7, thin: 2.6, pad: 2 };
export const MB = [{ x: 86, y: 13, w: 25, h: 44 }, { x: 113, y: 13, w: 25, h: 44 }];  // champs: the minutes
export const MG = { w: 15, h: 30, thick: 4.6, thin: 1.9, pad: 2 };
const TEXT_X0 = 141, TEXT_X1 = 153;

// ------------------------------------------------------------ the numerals
export const HGLYPH = Array.from({ length: 10 }, (_, d) => buildDigit(d, HG.w, HG.h, HG.thick, HG.thin, HG.pad));
export const MGLYPH = Array.from({ length: 10 }, (_, d) => buildDigit(d, MG.w, MG.h, MG.thick, MG.thin, MG.pad));

/** Pillowed gesso under gold: a height per pixel from the distance inside, normals by differences. */
function pillow(s, r) { if (s <= 0) return 0; if (s >= r) return 1; const q = 1 - s / r; return Math.sqrt(1 - q * q); }

/**
 * A layer: albedo (565), gold mask, normals, over a w x h box. `kind` per
 * pixel lets the face reveal it in stages; `ord` is the order within a stage.
 */
function layer(w, h) {
  return {
    w, h, alb: new Uint16Array(w * h), alb2: new Uint16Array(w * h), gold: new Uint8Array(w * h),
    nx: new Int8Array(w * h), ny: new Int8Array(w * h),
    kind: new Uint8Array(w * h), ord: new Uint8Array(w * h),
  };
}
export const K = { NONE: 0, FRAME: 1, GOLD: 2, PAINT: 3, LINE: 4, WHITE: 5, GROUND: 6 };

/** Normals from a height map (Float32, w x h), scaled to -127..127, plus grain. */
function normals(L, hgt, gain, seed) {
  const { w, h } = L;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!L.gold[i]) continue;
      const hl = hgt[y * w + Math.max(0, x - 1)], hr = hgt[y * w + Math.min(w - 1, x + 1)];
      const hu = hgt[Math.max(0, y - 1) * w + x], hd = hgt[Math.min(h - 1, y + 1) * w + x];
      const grain = (rand(x, y, seed) - 0.5) * 22;
      L.nx[i] = clamp(Math.round(-(hr - hl) * gain + grain), -127, 127);
      L.ny[i] = clamp(Math.round(-(hd - hu) * gain + (rand(y, x, seed + 1) - 0.5) * 22), -127, 127);
    }
}

/** Flood the outside of a glyph from the box edge: pixels not reached (and not ink) are counters. */
function counters(gl) {
  const { w, h, dist } = gl, seen = new Uint8Array(w * h), st = [];
  for (let x = 0; x < w; x++) { st.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { st.push(y * w, y * w + w - 1); }
  while (st.length) {
    const i = st.pop();
    if (seen[i] || dist[i] < 0.6) continue;
    seen[i] = 1;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) st.push(i - 1); if (x < w - 1) st.push(i + 1);
    if (y > 0) st.push(i - w); if (y < h - 1) st.push(i + w);
  }
  return seen;   // 1 = outside
}

// ------------------------------------------------------------ the hour initial
// Built from start-up tables (flash on the device): the block (frame, lapis
// ground, filigree) once, and each numeral in each of the two places once,
// as a layer over its glyph box (gold with normals, keyline, vermilion
// counters). The hour's initial is the block with two numeral layers pasted.

/** The block: keyline, 3 px of gold, keyline, a lapis ground with a white diaper of trefoil dots. */
export const BLOCK = (() => {
  const { w, h } = HB, L = layer(w, h), hgt = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x, e = Math.min(x, y, w - 1 - x, h - 1 - y), X = HB.x + x, Y = HB.y + y;
      if (e === 0 || e === 4) { L.alb[i] = to565(P.ink); L.kind[i] = K.LINE; }
      else if (e < 4) { L.gold[i] = 1; L.kind[i] = K.FRAME; hgt[i] = e === 2 ? 1 : 0.55; }
      else {
        const cx = (x - w / 2) / (w / 2), cy = (y - h / 2) / (h / 2), v = 1 - 0.25 * (cx * cx + cy * cy);
        L.alb[i] = dith(mix(P.lapisD, P.lapis, clamp(v, 0, 1)), X, Y); L.kind[i] = K.GROUND;
        const gx = (x - 5) % 8, gy = (y - 5) % 8, odd = (((x - 5) >> 3) + ((y - 5) >> 3)) & 1;
        if (e > 7 && odd && ((gx === 4 && gy === 3) || (gx === 3 && gy === 4) || (gx === 5 && gy === 4) || (gx === 4 && gy === 5))) {
          L.alb[i] = to565(gx === 4 && gy === 4 ? P.white : mix(P.white, P.lapis, 0.35)); L.kind[i] = K.WHITE;
        }
      }
    }
  normals(L, hgt, 120, 7);
  return L;
})();

/** Numeral d in place k of the great initial: raised gold, an ink keyline, vermilion counters with white dots. */
export const HLAYER = [0, 1].map((k) => Array.from({ length: 10 }, (_, d) => {
  const gl = HGLYPH[d], out = counters(gl), L = layer(gl.w, gl.h), hgt = new Float32Array(gl.w * gl.h);
  for (let y = 0; y < gl.h; y++)
    for (let x = 0; x < gl.w; x++) {
      const j = y * gl.w + x, dd = gl.dist[j], X = HD[k].x + x, Y = HD[k].y + y;
      if (dd < 0) { L.gold[j] = 1; L.kind[j] = K.GOLD; hgt[j] = pillow(-dd, 2.6); }
      else if (dd < 1.25) { L.alb[j] = to565(P.ink); L.kind[j] = K.LINE; }
      else if (!out[j]) {
        L.alb[j] = dith(mix(P.vermD, P.verm, clamp((dd - 1) / 3, 0, 1)), X, Y); L.kind[j] = K.GROUND;
        if (dd > 2.6 && (X * 3 + Y * 5) % 11 === 0) { L.alb[j] = to565(P.white); L.kind[j] = K.WHITE; }
      }
    }
  normals(L, hgt, 120, 7 + k * 3 + d);
  return L;
}));

// ------------------------------------------------------------ the minute champs
/**
 * A champ initial for digit d: a square of burnished gold edged in ink, the
 * numeral painted on it in lapis (slot 0) or vermilion (slot 1), modelled
 * lighter to the middle, with a white-lead line along its lit inner edge.
 */
export const CHAMPS = [0, 1].map((slot) => Array.from({ length: 10 }, (_, d) => champ(d, slot)));
function champ(d, slot) {
  const { w, h } = MB[slot], L = layer(w, h), hgt = new Float32Array(w * h);
  const gl = MGLYPH[d], ox = Math.round((w - gl.w) / 2), oy = Math.round((h - gl.h) / 2);
  const base = slot === 0 ? P.lapis : P.verm, dark = slot === 0 ? P.lapisD : P.vermD, lite = slot === 0 ? P.lapisL : P.vermL;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x, e = Math.min(x, y, w - 1 - x, h - 1 - y);
      if (e === 0) { L.alb[i] = to565(P.ink); L.kind[i] = K.LINE; L.ord[i] = 0; continue; }
      // gold ground: a cushion of gesso, a row of punched dots inside the edge
      L.gold[i] = 1; L.kind[i] = K.FRAME;
      hgt[i] = pillow(e - 0.5, 3.2);
      if (e === 3 && (x + y) % 3 === 0) hgt[i] -= 0.9;
      const gx = x - ox, gy = y - oy;
      if (gx < 0 || gy < 0 || gx >= gl.w || gy >= gl.h) continue;
      const j = gy * gl.w + gx, dd = gl.dist[j];
      if (dd < 0) {
        // the painted numeral; gradient for the lit edge
        const dl = gl.dist[j - 1] ?? dd, dr = gl.dist[j + 1] ?? dd, du = gl.dist[j - gl.w] ?? dd, dn = gl.dist[j + gl.w] ?? dd;
        const lit = -(dr - dl) - (dn - du);   // > 0 where the edge faces up-left
        let c = mix(dark, mix(base, lite, 0.35), clamp(-dd / 2.2, 0, 1));
        L.gold[i] = 0; L.kind[i] = K.PAINT; L.ord[i] = Math.round(gl.order[j] * 255);
        L.alb2[i] = dith(c, x, y);
        if (dd > -1.9 && dd < -0.75 && lit > 0.5) { c = P.white; L.kind[i] = K.WHITE; }
        L.alb[i] = dith(c, x, y);
      } else if (dd < 1.15) { L.gold[i] = 0; L.alb[i] = to565(P.ink); L.kind[i] = K.LINE; L.ord[i] = Math.round(gl.order[j] * 255); }
    }
  normals(L, hgt, 110, 11 + slot);
  return L;
}

function dith(c, x, y) {
  const t = BAYER[((y & 3) << 2) | (x & 3)] * 16 + 8;
  const r5 = (R(c) * 7967 + t * 255) >> 16, g6 = (G(c) * 16191 + t * 255) >> 16, b5 = (B(c) * 7967 + t * 255) >> 16;
  return (r5 << 11) | (g6 << 5) | b5;
}

/** Paste a layer fully drawn into page buffers at (x, y). */
export function paste(pg, L, x0, y0) {
  for (let y = 0; y < L.h; y++)
    for (let x = 0; x < L.w; x++) {
      const j = y * L.w + x, i = (y0 + y) * W + x0 + x;
      if (L.gold[j]) { pg.gold[i] = 1; pg.nx[i] = L.nx[j]; pg.ny[i] = L.ny[j]; }
      else if (L.kind[j]) { pg.gold[i] = 0; pg.alb[i] = L.alb[j]; }
    }
}

// ------------------------------------------------------------ textura
// A tiny textura of my own for the rubric: 7 rows (2 ascender, 4 x-height,
// 1 descender), lozenge feet, broken bows. Only the letters the offices need.
const TX = {
  A: ['.##.', '#..#', '#..#', '####', '#..#', '#..#', '#..#'],
  C: ['.##.', '#..#', '#...', '#...', '#...', '#..#', '.##.'],
  a: ['....', '....', '###.', '...#', '.###', '#..#', '.###'],
  c: ['...', '...', '.##', '#..', '#..', '#..', '.##'],
  d: ['...#', '...#', '.###', '#..#', '#..#', '#..#', '.##.'],
  e: ['...', '...', '.##', '#.#', '##.', '#..', '.##'],
  i: ['.', '#', '.', '#', '#', '#', '#'],
  l: ['#', '#', '#', '#', '#', '#', '#'],
  m: ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#.#.#', '#.#.#'],
  n: ['...', '...', '##.', '#.#', '#.#', '#.#', '#.#'],
  o: ['...', '...', '.#.', '#.#', '#.#', '#.#', '.#.'],
  p: ['...', '...', '##.', '#.#', '#.#', '##.', '#..'],
  r: ['..', '..', '##', '#.', '#.', '#.', '#.'],
  s: ['...', '...', '.##', '#..', '.#.', '..#', '##.'],
  t: ['..', '#.', '##', '#.', '#.', '#.', '.#'],
  u: ['...', '...', '#.#', '#.#', '#.#', '#.#', '.##'],
  x: ['...', '...', '#.#', '#.#', '.#.', '#.#', '#.#'],
  v: ['...', '...', '#.#', '#.#', '#.#', '.#.', '.#.'],
};
const TXS = Object.fromEntries(Object.entries(TX).map(([k, rows]) => [k, sprite(rows, { '#': 0xffffff })]));
/** Rubric text in the textura; returns the end x. */
export function textura(g, str, x, y, c) {
  for (const ch of str) {
    if (ch === ' ') { x += 3; continue; }
    const s = TXS[ch];
    if (!s) continue;
    g.blit(s, x, y, { c });
    x += s.w + 1;
  }
  return x;
}

/** The office read at hour h: the canonical hours, three hours apiece. */
export function office(h) {
  return ['Ad matutinas', 'Ad laudes', 'Ad primam', 'Ad tertiam', 'Ad sextam', 'Ad nonam', 'Ad vesperas', 'Completorium'][Math.floor(h / 3)];
}

// ------------------------------------------------------------ the page
// Start-up tables: the bare vellum of the spread (warm cream, hair-side
// grain, faint blotches, darker to the edges of each leaf), its scraped
// version (paler, rougher, where an initial was taken off), and the ivy
// border with its gold leaves.
const VELLUM = new Uint16Array(W * H), SCRAPED = new Uint16Array(W * H);
const IVY = { gold: new Uint8Array(W * H), nx: new Int8Array(W * H), ny: new Int8Array(W * H) };
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const px = x < GUT ? x : x - GUT, edge = Math.min(px, GUT - 1 - px, y, H - 1 - y);
    let k = 1 + (rand(x, y, 3) - 0.5) * 0.05 + (noise2(x * 0.08, y * 0.1, 6) - 0.5) * 0.08;
    if (rand(x, y, 9) > 0.985) k -= 0.06;
    const col = mix(P.velEdge, scale(P.vel, k), clamp(edge / 2.5, 0, 1) * 0.85 + 0.15);
    VELLUM[y * W + x] = dith(col, x, y);
    SCRAPED[y * W + x] = dith(mix(col, hex('f6ecd6'), 0.35 + 0.25 * rand(x, y, 77)), x, y);
  }
{
  const g = new Gfx(W, H);
  g.buf = VELLUM;
  for (let y = 2; y < H - 2; y++) {
    const x = 156.5 + 1.2 * Math.sin(y * 0.33 + 5);
    g.pixel(x, y, P.green);
    if (y % 9 !== 4) continue;
    const lx = x + (Math.floor(y / 9) % 2 ? -2 : 2);
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 2 || (dx === 0 && dy === 2)) continue;
        const X = Math.round(lx + dx), Y = y + dy, i = Y * W + X;
        if (X < 0 || X >= W) continue;
        IVY.gold[i] = 1; IVY.nx[i] = dx * 34 + (rand(X, Y, 1) - 0.5) * 20; IVY.ny[i] = dy * 34;
      }
    g.pixel(Math.round(lx), y + 3, P.ink);
  }
}

// Pen-flourishing round the champs, in the other colour of each (red pen by
// the blue numeral, blue by the red): a hairline down the inner margin and
// along the foot, beaded, with curls; drawn anti-aliased, then pressed into
// the vellum so it is lit with the page.
{
  const pw = new Gfx(W, H);
  pw.buf = VELLUM;
  const red = mix(P.verm, P.vel, 0.12), blue = mix(P.lapis, P.vel, 0.08);
  const o = { aa: true, a: 1 };
  const curl = (cx, cy, r, a0, dir, c) => {
    const pts = [];
    for (let k = 0; k <= 12; k++) { const u = k / 12, a = a0 + dir * u * 4.8, rr = r * (1 - 0.7 * u); pts.push([cx + rr * Math.sin(a), cy - rr * Math.cos(a)]); }
    pw.stroke(pts, 0.6, c, o);
  };
  // red: down the inner margin beside the first champ, curling out at both ends
  pw.stroke([[83.5, 14], [84.1, 26], [83.3, 38], [84.1, 50], [83.5, 57]], 0.8, red, o);
  curl(82.6, 11.5, 2.4, Math.PI * 0.9, 1, red); curl(82.6, 59.4, 2.4, 0.1, -1, red);
  for (let y = 18; y < 56; y += 6) pw.fillCircle(84.6 + (y % 12 ? 0.4 : -1.6), y, 0.55, red, o);
  // blue: a hairline up between them, beaded
  pw.stroke([[112, 14], [112, 56]], 0.6, blue, { aa: true, a: 0.7 });
  for (let y = 20; y < 56; y += 9) pw.fillCircle(112, y, 0.7, blue, o);
  curl(112, 10.6, 1.8, Math.PI, 1, blue);
}

/**
 * The spread for hour h (digits hh): the vellum, this hour's text (its own
 * words, seeded by the hour) and rubric, the border, the great initial; the
 * champs' places left as bare vellum. Cheap: copies and a few hundred short
 * lines, no per-pixel maths.
 */
export function buildPage(h, hh) {
  const c = new Gfx(W, H);
  c.buf.set(VELLUM);
  const seed = h * 37 + 5;
  const rule = mix(P.rule, P.vel, 0.4);
  const rows = [];
  for (let y = 15; y <= 52; y += 6) rows.push([TEXT_X0, TEXT_X1, y]);
  rows.push([85, 153, 58]);
  for (const [x0, x1, y] of rows) {
    c.hline(x0, y + 4, x1 - x0, rule);
    let x = x0, n = 0;
    while (x < x1 - 1) {
      // a word: 2-5 letters of 1-3 minims
      const letters = 2 + ((rand(x, y, seed + n) * 4) | 0);
      for (let L = 0; L < letters && x < x1 - 1; L++) {
        const minims = 1 + ((rand(x, y + L, seed) * 2.6) | 0);
        const asc = rand(x, y, seed + 2) > 0.82, desc = !asc && rand(x, y, seed + 3) > 0.9;
        for (let m = 0; m < minims && x < x1; m++) {
          c.vline(x, y + (asc && m === 0 ? -2 : 0) + 1, (asc && m === 0 ? 2 : 0) + 3 + (desc && m === 0 ? 2 : 0), P.ink);
          if (m < minims - 1) c.pixel(x + 1, y + 1, P.inkL);
          x += 2;
        }
        x += 1;
      }
      x += 2; n++;
    }
  }
  textura(c, office(h), 86, 3, P.rubric);
  const pg = { alb: c.buf, gold: IVY.gold.slice(), nx: IVY.nx.slice(), ny: IVY.ny.slice(), scraped: SCRAPED };
  paste(pg, BLOCK, HB.x, HB.y);
  for (let k = 0; k < 2; k++) paste(pg, HLAYER[k][+hh[k]], HD[k].x, HD[k].y);
  return pg;
}

// ------------------------------------------------------------ the rinceau
// A gold ivy garland that grows round the inside of the great initial's
// frame over the hour, clockwise from the top-left corner: a white-lead
// stem that waves, a gold ivy leaf every 9 px, alternately on the stem and
// toward the middle. As a table: every pixel with the moment (0..1 of the
// hour) it appears, and for leaves a normal; plus the stem's path, for the
// bud at the growing tip.
export const VINE = (() => {
  const x0 = HB.x + 6.5, y0 = HB.y + 6.5, x1 = HB.x + HB.w - 6.5, y1 = HB.y + HB.h - 6.5;
  const side = [x1 - x0, y1 - y0, x1 - x0, y1 - y0], per = side.reduce((a, b) => a + b, 0);
  const at = (d) => {      // a point d px along the inset rectangle, and the inward normal
    let q = d;
    if (q < side[0]) return [x0 + q, y0, 0, 1];
    q -= side[0]; if (q < side[1]) return [x1, y0 + q, -1, 0];
    q -= side[1]; if (q < side[2]) return [x1 - q, y1, 0, -1];
    q -= side[2]; return [x0, y1 - Math.min(q, side[3]), 1, 0];
  };
  const path = [];
  for (let d = 0; d <= per; d += 0.5) {
    const [x, y, nx, ny] = at(d), w = 0.7 * Math.sin(d * 0.7);
    path.push([x + nx * w, y + ny * w, d / per]);
  }
  const px = new Map();   // pixel index -> [order, kind (0 stem, 1 leaf), nx, ny]
  for (const [x, y, u] of path) {
    const i = Math.floor(y) * W + Math.floor(x);
    if (!px.has(i)) px.set(i, [u, 0, 0, 0]);
  }
  let n = 0;
  for (let d = 6; d < per - 3; d += 9, n++) {
    const [x, y, nx, ny] = at(d), u = d / per, inward = n % 2 ? 2.2 : 0.9;
    const cx = x + nx * inward, cy = y + ny * inward;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const r = Math.abs(dx) + Math.abs(dy);
        if (r > 2) continue;
        const X = Math.round(cx + dx - 0.5), Y = Math.round(cy + dy - 0.5), i = Y * W + X;
        px.set(i, [u + 0.004 + r * 0.0015, 1, dx * 36 + Math.round((rand(X, Y, 4) - 0.5) * 20), dy * 36]);
      }
  }
  const list = [...px.entries()].sort((a, b) => a[1][0] - b[1][0]);
  return {
    idx: Uint16Array.from(list.map((e) => e[0])),
    ord: Uint16Array.from(list.map((e) => Math.round(e[1][0] * 65535))),
    leaf: Uint8Array.from(list.map((e) => e[1][1])),
    nx: Int8Array.from(list.map((e) => e[1][2])), ny: Int8Array.from(list.map((e) => e[1][3])),
    path,
    stem: to565(mix(P.white, P.lapis, 0.18)),
  };
})();
