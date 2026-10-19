// Vending machine artwork: the two numeral faces (drawn here, for this grid),
// the product sprites that carry them, and a tiny display alphabet.
//
// Sprites are { w, h, c: Float32Array(3wh) premultiplied linear RGB,
// a: Float32Array(wh) alpha }, rendered once and cached.
import * as kit from '../js/kit.js';

const clamp = kit.clamp;

// ------------------------------------------------------------ numerals
// One centre-line skeleton per digit in a 10 x 16 box (y down); two cuts are
// drawn from it at different widths, weights and slants: the soda-can cut
// (tall, slanted, sleek, keylined) and the crisp-bag cut (fat bubble with a
// heavy outline and an extruded shadow).
function arc(cx, cy, rx, ry, a0, a1, n = 28) {
  const p = [];
  for (let k = 0; k <= n; k++) {
    const a = ((a0 + (a1 - a0) * k / n) * Math.PI) / 180;
    p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return p;
}
function bez(p0, p1, p2, n = 18) {
  const p = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, s = 1 - t;
    p.push([s * s * p0[0] + 2 * s * t * p1[0] + t * t * p2[0], s * s * p0[1] + 2 * s * t * p1[1] + t * t * p2[1]]);
  }
  return p;
}
const SKEL = {
  0: [arc(5, 8, 4.9, 8, 0, 360, 40)],
  1: [[[1.8, 3.6], [5.6, 0], [5.6, 16]]],
  2: [[...arc(5, 4.7, 4.8, 4.7, 192, 383), [0.4, 16], [10, 16]]],
  3: [arc(5, 4.1, 4.3, 4.1, 200, 450), arc(5, 12, 4.9, 4, 270, 520), [[3.1, 8.1], [5, 8.1]]],
  4: [[[7.4, 16], [7.4, 0], [0, 11], [10, 11]]],
  5: [[[9.3, 0.1], [1.8, 0.1], [1.1, 7.4], ...arc(5, 11, 4.95, 5, 228, 512)]],
  6: [arc(5, 11, 4.95, 5, 0, 360, 36), bez([0.08, 11.2], [0.2, 0.4], [8.9, 0.9])],
  7: [[[0.2, 0.1], [9.8, 0.1], [3.4, 16]]],
  8: [arc(5, 4, 4.1, 4, 0, 360, 32), arc(5, 11.9, 4.9, 4.1, 0, 360, 36)],
  9: [arc(5, 5, 4.95, 5, 0, 360, 36), bez([9.92, 4.8], [9.8, 15.6], [1.1, 15.1])],
};

/**
 * Coverage masks for one cut: fill (the ink) and line (ink + keyline), at
 * gw x gh pixels. The skeleton is fitted inside with a margin for the
 * stroke, then slanted.
 */
function cut(d, gw, gh, { width, line, slant = 0, xs = 1 }) {
  const m = width / 2 + line + 0.4;
  const sx = ((gw - 2 * m - slant * (gh - 2 * m)) / 10) * xs, sy = (gh - 2 * m) / 16;
  const ox = (gw - 2 * m - slant * (gh - 2 * m) - 10 * sx) / 2;
  const segs = [];
  for (const path of SKEL[d]) {
    const pts = path.map(([x, y]) => [m + ox + x * sx + (16 - y) * sy * slant, m + y * sy]);
    for (let k = 0; k + 1 < pts.length; k++) segs.push([...pts[k], ...pts[k + 1]]);
  }
  const fill = new Float32Array(gw * gh), lineM = new Float32Array(gw * gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    let dm = 1e9;
    for (const s of segs) { const dd = kit.segDist(x + 0.5, y + 0.5, s[0], s[1], s[2], s[3]); if (dd < dm) dm = dd; }
    fill[y * gw + x] = clamp(width / 2 - dm + 0.5);
    lineM[y * gw + x] = clamp(width / 2 + line - dm + 0.5);
  }
  return { w: gw, h: gh, fill, line: lineM };
}
function sampleM(M, arr, x, y) {
  x -= 0.5; y -= 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const g = (i, j) => (i < 0 || j < 0 || i >= M.w || j >= M.h ? 0 : arr[j * M.w + i]);
  return (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy;
}

export const CAN = { w: 32, h: 47, gw: 23, gh: 33, gy: 7 };
export const BAG = { w: 42, h: 43, gw: 30, gh: 31, gx: 5, gy: 6 };
const canCut = [], bagCut = [];
for (let d = 0; d < 10; d++) {
  canCut.push(cut(d, CAN.gw, CAN.gh, { width: 4.4, line: 1.3, slant: 0.13 }));
  bagCut.push(cut(d, BAG.gw, BAG.gh, { width: 6.6, line: 1.5, slant: 0.05 }));
}

// ------------------------------------------------------------ flavours
// Packaging colours (sRGB picks), kept mid-dark so the cream numerals lead.
export const SODA = ['#c3121e', '#1f8f3a', '#6b23b5', '#e8620a', '#1a55d0', '#b0124f', '#0b8f8f', '#7a3510', '#2b3240', '#c7a000'].map(kit.hex);
export const CRISP = ['#e3a100', '#d42a1a', '#1c8a3c', '#1f5fd0', '#7b2db0', '#f06a00', '#262c3a', '#0a8f86', '#c82a7a', '#8a5420'].map(kit.hex);
const CREAM = kit.hex('#fff2d8');

function newSprite(w, h) { return { w, h, c: new Float32Array(3 * w * h), a: new Float32Array(w * h) }; }
function put(S, x, y, col, a) {
  const p = y * S.w + x; S.a[p] = a; S.c[3 * p] = col[0] * a; S.c[3 * p + 1] = col[1] * a; S.c[3 * p + 2] = col[2] * a;
}

/** A soda can: cylinder shading, rims, the numeral wrapped round it. d < 0: the back. */
function makeCan(flav, d) {
  const { w, h } = CAN, S = newSprite(w, h), C = SODA[flav], R = w / 2;
  const G = d >= 0 ? canCut[d] : null;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const yc = y + 0.5;
    // silhouette: neck taper at the top, a smaller taper at the foot
    let half = R;
    if (yc < 4) half = R - 3.2 + 3.2 * clamp(yc / 4) ** 0.6;
    else if (yc > h - 3) half = R - 2.2 * clamp((yc - (h - 3)) / 3);
    const dx = x + 0.5 - R, cov = clamp(half - Math.abs(dx) + 0.5);
    if (cov <= 0) continue;
    const u = clamp(dx / R, -0.999, 0.999), n = Math.sqrt(1 - u * u);
    const shade = 0.18 + 0.82 * (0.55 * n + 0.45 * Math.max(0, 0.75 * n - 0.6 * u));
    const spec = Math.exp(-(((u + 0.42) / 0.11) ** 2));
    let col;
    if (yc < 4.2 || yc > h - 3.2) {                 // aluminium rims
      const ring = yc < 4.2 ? (Math.abs(yc - 3.6) < 0.7 ? 0.45 : 1) : (Math.abs(yc - (h - 2.6)) < 0.7 ? 0.5 : 1);
      const v = (0.16 + 0.42 * shade) * ring;
      col = [v * 0.95 + spec * 0.35, v + spec * 0.35, v * 1.08 + spec * 0.38];
    } else {
      const lx = R + Math.asin(u) * R * 0.98;       // label coordinate, wrapped
      col = kit.scale(C, 0.25 + 0.75 * shade);
      // brand band at the shoulder, wave ribbon at the foot
      if (yc > 4.4 && yc < 6.4) col = kit.scale(C, 0.12 * shade + 0.04);
      const wave = h - 5.6 + 1.1 * Math.sin(lx * 0.42 + (flav * 1.7));
      const wv = clamp(0.9 - Math.abs(yc - wave) * 1.3);
      if (wv > 0) col = kit.mix(col, kit.scale(CREAM, 0.35 + 0.4 * shade), wv);
      if (G) {
        const gx = lx - (R - CAN.gw / 2), gy = yc - CAN.gy;
        const li = sampleM(G, G.line, gx, gy), fi = sampleM(G, G.fill, gx, gy);
        if (li > 0) col = kit.mix(col, kit.scale(C, 0.07), li);
        if (fi > 0) col = kit.mix(col, kit.scale(CREAM, 0.42 + 0.58 * shade), fi);
      } else {
        // back: a pale nutrition panel and a barcode
        if (Math.abs(lx - R) < 6 && yc > 12 && yc < 26) col = kit.mix(col, kit.scale(CREAM, 0.2 * shade), 0.8);
        if (Math.abs(lx - R) < 5 && yc > 30 && yc < 36 && Math.floor(lx * 1.3) % 2) col = kit.scale(col, 0.4);
      }
      col = [col[0] + spec * 0.28, col[1] + spec * 0.3, col[2] + spec * 0.32];
    }
    put(S, x, y, col, cov);
  }
  return S;
}

/** A crisp bag: crimped seals, pillow shading, a sunburst behind a bubble numeral. */
function makeBag(flav, d) {
  const { w, h } = BAG, S = newSprite(w, h), C = CRISP[flav];
  const G = d >= 0 ? bagCut[d] : null;
  const cx = w / 2, cy = 21.5;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const xc = x + 0.5, yc = y + 0.5;
    const zig = Math.abs(((xc / 2.6) % 1) - 0.5) * 2;           // crimp teeth
    const top = 0.4 + 1.3 * zig, bot = h - 0.4 - 1.3 * zig;
    const body = clamp((yc - 4.5) / (h - 9)), bulge = Math.sin(Math.PI * body);
    const half = yc < 4.5 || yc > h - 4.5 ? w / 2 - 1.6 : w / 2 - 2.6 + 2.6 * bulge;
    let cov = clamp(half - Math.abs(xc - cx) + 0.5) * clamp(yc - top + 0.5) * clamp(bot - yc + 0.5);
    if (cov <= 0) continue;
    const nx = (xc - cx) / (w / 2), ny = (yc - cy) / (h / 2);
    let col;
    if (yc < 4.5 || yc > h - 4.5) {
      const stripe = Math.floor(xc / 1.3) % 2 ? 1 : 0.7;
      col = kit.scale(kit.mix(C, [1, 1, 1], 0.25), (0.35 + 0.35 * (1 - nx * nx)) * stripe);
    } else {
      const pillow = Math.sqrt(clamp(1 - nx * nx * 0.85)) * Math.sqrt(clamp(1 - ny * ny * 0.6));
      const shade = 0.2 + 0.8 * pillow * (0.8 - 0.25 * nx - 0.15 * ny);
      col = kit.scale(C, shade);
      // crinkle: a soft diagonal sheen
      const sheen = Math.max(0, Math.sin(xc * 0.55 + yc * 0.35) * Math.sin(xc * 0.21 - yc * 0.5 + 1)) ** 3;
      col = [col[0] + 0.05 * sheen, col[1] + 0.05 * sheen, col[2] + 0.05 * sheen];
      if (G) {
        const ang = Math.atan2(yc - cy, xc - cx), ray = Math.cos(ang * 9) > 0.2 ? 1 : 0;
        col = kit.mix(col, kit.scale(kit.mix(C, [1, 0.9, 0.5], 0.5), shade), 0.22 * ray * clamp(1.4 - Math.hypot(nx, ny)));
        const gx = xc - BAG.gx, gy = yc - BAG.gy;
        const sh = sampleM(G, G.line, gx - 1.6, gy - 1.6), li = sampleM(G, G.line, gx, gy), fi = sampleM(G, G.fill, gx, gy);
        if (sh > 0) col = kit.mix(col, kit.scale(C, 0.05), sh * 0.9);
        if (li > 0) col = kit.mix(col, [0.012, 0.006, 0.004], li);
        if (fi > 0) {
          const hl = clamp(1.15 - (gy / BAG.gh) * 0.5);
          col = kit.mix(col, kit.scale(CREAM, (0.5 + 0.5 * pillow) * hl), fi);
        }
      } else if (Math.abs(nx) < 0.35 && Math.abs(ny) < 0.3) col = kit.mix(col, kit.scale(CREAM, 0.18), 0.8);
    }
    put(S, x, y, col, cov);
  }
  return S;
}

/** Candy for the top row (no numerals): 4 product lines. */
export const CANDY = { w: 18, h: 12 };
const CANDYCOL = [['#5a2a12', '#d02020'], ['#1a8a4a', '#e8e8e8'], ['#1b4fb8', '#f0c020'], ['#d86a10', '#5a2a12']].map((p) => p.map(kit.hex));
function makeCandy(line) {
  const { w, h } = CANDY, S = newSprite(w, h), [A, B] = CANDYCOL[line];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const xc = x + 0.5, yc = y + 0.5, end = xc < 2.5 || xc > w - 2.5;
    const zig = Math.abs(((yc / 2) % 1) - 0.5) * 2;
    const inX = Math.min(xc - zig * 0.9, w - zig * 0.9 - xc);
    const top = line === 2 ? 1.5 : 2.5;                         // the mint roll stands taller
    const cov = clamp(inX + 0.5) * clamp(yc - top + 0.5) * clamp(h - 0.5 - yc + 0.5);
    if (cov <= 0) continue;
    const ny = (yc - (top + h - 0.5) / 2) / ((h - top) / 2), shade = 0.25 + 0.75 * Math.sqrt(clamp(1 - ny * ny));
    let col = kit.scale(end ? kit.mix(A, [1, 1, 1], 0.2) : A, shade);
    if (!end) {
      if (line === 0 && Math.abs(yc - 7) < 1.6) col = kit.scale(B, shade);
      if (line === 1 && Math.hypot(xc - 9, yc - 7) < 2.6) col = kit.scale(B, shade * 0.6);
      if (line === 2 && Math.floor(xc / 3) % 2) col = kit.scale(B, shade * 0.8);
      if (line === 3 && Math.hypot(((xc - 3) % 4) - 2, yc - 7.5) < 1.3) col = kit.scale(B, shade);
    }
    put(S, x, y, col, cov);
  }
  return S;
}

const cache = new Map();
export function canSprite(flav, d) { const k = 'c' + flav + ':' + d; if (!cache.has(k)) cache.set(k, makeCan(flav, d)); return cache.get(k); }
export function bagSprite(flav, d) { const k = 'b' + flav + ':' + d; if (!cache.has(k)) cache.set(k, makeBag(flav, d)); return cache.get(k); }
export function candySprite(line) { const k = 'k' + line; if (!cache.has(k)) cache.set(k, makeCandy(line)); return cache.get(k); }

// ---------------------------------------------------- display alphabet
// 3x5 letters for the little selection display (never the time).
const F = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  N: '110101101101101', O: '010101101101010', P: '110101110100100', R: '110101110101101', S: '011100010001110',
  T: '111010010010010', U: '101101101101111', H: '101101111101101', V: '101101101101010', G: '011100101101011', M: '101111111101101', W: '101101111111101', X: '101101010101101', Y: '101101010010010', 1: '010110010010111', 2: '110001010100111', '!': '010010010000010',
  '-': '000000111000000', ' ': '000000000000000', '$': '011110010011110',
};
export function textCols(str) {
  const cols = [];
  for (const ch of str) {
    const g = F[ch] ?? F[' '];
    for (let c = 0; c < 3; c++) { let m = 0; for (let r = 0; r < 5; r++) if (g[r * 3 + c] === '1') m |= 1 << r; cols.push(m); }
    cols.push(0);
  }
  return cols;
}

// build every sprite up front, so no minute turn pays for one mid-animation
for (let d = 0; d < 10; d++) { canSprite(d, d); canSprite(d, -1); bagSprite(d, d); bagSprite(d, -1); }
for (let j = 0; j < 4; j++) candySprite(j);
