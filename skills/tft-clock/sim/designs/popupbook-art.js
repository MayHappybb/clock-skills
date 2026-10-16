// Pop-up Book: the printed spreads, and every colour on the glass.
//
// A spread is one 154 x 68 byte picture (both pages, 77 columns each, the
// gutter between columns 76 and 77), printed in flat inks on cream paper,
// drawn once at load (flash). The art is kept sparse and low so the paper
// stays the commonest colour on the glass and the pop-ups, not the print,
// carry the time: a horizon along the far edge, a few things in the
// foreground, and the slots the pop-ups' glue tabs go into.
//
// Colours come through palettes of 32 page inks x 8 tones (tone 5 is as
// printed; lower tones are the gutter, shadows and a page turned away from
// the lamp; higher, a page turned to it), one per spread, by day and by
// night. Cards (the numerals) have their own small palette per slot.

import { to565 } from '../js/kit.js';

export const TW = 154, TH = 68;          // a spread's texture
export const PX0 = 3, PY0 = 8;           // its top-left on the glass

// ------------------------------------------------------------ fixed inks (every spread)
export const I_PAPER = 0, I_COVER = 1, I_COVER_D = 2, I_BLOCK = 3, I_BLOCK_L = 4, I_WALL = 5, I_SLOT = 6, I_KEY = 7;
const FIXED = [0xf4ead2, 0x9b2f2b, 0x6a1f22, 0xe4d8ba, 0xb3a37f, 0x2a2333, 0x4a3a30, 0x2a2030];

// tones: what light falls on the paper
export const TONES = [0.5, 0.62, 0.74, 0.84, 0.93, 1, 1.06, 1.12];
export const T_FLAT = 5, T_SHADOW = 3;

const ch = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const pack = (r, g, b) => (Math.round(Math.max(0, Math.min(255, r))) << 16) | (Math.round(Math.max(0, Math.min(255, g))) << 8) | Math.round(Math.max(0, Math.min(255, b)));
export const mixc = (a, b, u) => { const A = ch(a), B = ch(b); return pack(A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u, A[2] + (B[2] - A[2]) * u); };
function tone(c, f) {
  const [r, g, b] = ch(c);
  if (f <= 1) return pack(r * f, g * f * 0.99, b * Math.min(1, f * 1.06));      // shade goes a touch cool
  const u = (f - 1) * 1.6;
  return pack(r + (255 - r) * u * 0.7, g + (252 - g) * u * 0.7, b + (236 - b) * u * 0.7);
}
// night: the room lamp is off; a cool dusk on the paper, the inks keep their hue
function night(c) {
  const [r, g, b] = ch(c);
  const l = 0.3 * r + 0.55 * g + 0.15 * b;
  return pack((r * 0.22 + l * 0.08) * 0.9, (g * 0.25 + l * 0.08) * 0.95, (b * 0.34 + l * 0.1) * 1.25);
}
// the cards keep their colour at night (the time stays the brightest thing), a touch cooler
const cardNight = (c) => { const [r, g, b] = ch(c); return pack(r * 0.88, g * 0.9, Math.min(255, b * 0.95 + 12)); };

// ------------------------------------------------------------ the spreads
// Each: name, its 16 inks (indices 8..23), the four cards (the numerals'
// colours, slot by slot) and a drawing of the printed art.

function canvas() {
  const t = new Uint8Array(TW * TH);
  const S = (x, y, v) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < TW && y < TH) t[y * TW + x] = v; };
  // all in glass coordinates
  const P = {
    t,
    px: (x, y, v) => S(x - PX0, y - PY0, v),
    rect: (x, y, w, h, v) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) S(x + i - PX0, y + j - PY0, v); },
    ell: (cx, cy, rx, ry, v) => {
      for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) S(x - PX0, y - PY0, v);
      }
    },
    tri: (x0, y0, x1, y1, x2, y2, v) => {
      const minx = Math.floor(Math.min(x0, x1, x2)), maxx = Math.ceil(Math.max(x0, x1, x2));
      const miny = Math.floor(Math.min(y0, y1, y2)), maxy = Math.ceil(Math.max(y0, y1, y2));
      const e = (ax, ay, bx, by, px, py) => (bx - ax) * (py - ay) - (by - ay) * (px - ax);
      const A = e(x0, y0, x1, y1, x2, y2);
      for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = e(x1, y1, x2, y2, px, py), w1 = e(x2, y2, x0, y0, px, py), w2 = e(x0, y0, x1, y1, px, py);
        if (A > 0 ? w0 >= 0 && w1 >= 0 && w2 >= 0 : w0 <= 0 && w1 <= 0 && w2 <= 0) S(x - PX0, y - PY0, v);
      }
    },
    // a band from y0(x) to y1(x)
    band: (xa, xb, f, v) => { for (let x = xa; x < xb; x++) { const [a, b] = f(x + 0.5); for (let y = Math.round(a); y < Math.round(b); y++) S(x - PX0, y - PY0, v); } },
  };
  return P;
}

const sinx = Math.sin;
// Places on the page kept free of print: where the numerals stand and their slots.
const NEAR_HH = 61, NEAR_MM = 65;
const tufts = (P, v, pts) => { for (const [x, y] of pts) { P.px(x, y, v); P.px(x + 2, y, v); P.px(x + 1, y + 1, v); P.px(x - 1, y - 1, v); P.px(x + 3, y - 1, v); } };

export const SPREADS = [
  {
    name: 'meadow',
    slide: { y: 68, pic: ['.ww.ww.', 'wwwwwwk', 'wwwwwkk', '.l..l..'], ink: { w: 17, k: 18, l: 18 } },
    inks: [0xb9cf93, 0x8fb06a, 0x5f8a49, 0x6c9a4c, 0xe0573f, 0xf2c24a, 0xe7c995, 0xd5b47c, 0x9cc6e0, 0xfdf9ef, 0x4a3a34],
    cards: [0xde3f2b, 0xf0861a, 0x23924a, 0x2c5cc6],
    art(P) {
      // rolling hills on the far edge, two greens, trees on the ridge
      for (const [x, r, v] of [[14, 13, 8], [47, 10, 9], [80, 15, 8], [114, 11, 9], [146, 12, 8]]) P.ell(x, 20, r, 6, v);
      for (const x of [26, 64, 98, 132]) { P.tri(x - 2.5, 13, x + 2.5, 13, x, 8, 10); P.rect(x, 13, 1, 2, 18); }
      // a sandy path winding from the near edge into the gutter
      P.band(60, 101, (x) => { const c = 80; const w = Math.abs(x - c); return w < 9 ? [76 - (9 - w) * 0.6, 76] : [76, 76]; }, 14);
      // grass tufts and flowers in the foreground
      tufts(P, 11, [[6, 70], [24, 72], [44, 69], [62, 73], [98, 72], [114, 74], [133, 71], [150, 73], [12, 66], [140, 68]]);
      for (const [x, y, v] of [[16, 72, 12], [36, 74, 13], [55, 70, 12], [107, 70, 13], [124, 73, 12], [145, 69, 13]]) { P.rect(x, y, 2, 2, v); }
    },
  },
  {
    name: 'seaside',
    slide: { y: 9, pic: ['...w...', '..ww...', '.www.r.', 'wwww.rr', 'hhhhhhh', '.hhhhh.'], ink: { w: 14, r: 13, h: 15 } },
    inks: [0x7fb6d8, 0x4f8fc2, 0xd8ecf2, 0xe8d29c, 0xd9b978, 0xef7b5c, 0xf5f0e0, 0xb5564a, 0xc8a46a],
    cards: [0xe9533f, 0x168a88, 0x2a4ea6, 0xe39a12],
    art(P) {
      // the sea along the far edge, wave crests, a sail
      P.band(3, 157, (x) => [14 + 1 * sinx(x / 3), 17 + 1 * sinx(x / 3)], 8);
      P.band(3, 157, (x) => [17 + 1 * sinx(x / 3), 18 + 1 * sinx(x / 3)], 9);
      for (let x = 7; x < 156; x += 16) P.rect(x, 12, 4, 1, 9);
      for (let k = 0; k < 9; k++) P.band(6 + k * 17, 17 + k * 17, (x) => [70 + (k % 3) + 0.8 * sinx(x / 2), 71 + (k % 3) + 0.8 * sinx(x / 2)], 12);
      // shells and a starfish
      for (const [x, y] of [[14, 67], [58, 73], [104, 71], [146, 74]]) { P.ell(x, y, 2, 1.5, 13); P.px(x, y, 15); }
      for (const [x, y] of [[33, 72], [128, 68]]) { P.rect(x - 2, y, 5, 1, 13); P.rect(x, y - 2, 1, 5, 13); }
    },
  },
  {
    name: 'snowfield',
    slide: { y: 68, pic: ['..r....', '.rrr...', 'bbbbbb.', '.y..y..', 'yyyyyyy'], ink: { r: 14, b: 15, y: 15 } },
    inks: [0x9fb2c9, 0x6f86a6, 0xf8fbff, 0x2d6b4f, 0x4c8a63, 0xcfdcec, 0xc0573f, 0x8a5a3c],
    cards: [0xc62e5a, 0x2e6ccd, 0x1d7a4d, 0xec6a1e],
    art(P) {
      // a line of mountains with snow caps
      const peaks = [[12, 10], [44, 13], [80, 9], [116, 12], [148, 10]];
      for (const [x, y] of peaks) { P.tri(x - 11, 21, x + 11, 21, x, y, 9); P.tri(x - 4, y + 4, x + 4, y + 4, x, y, 10); }
      // drifts and a few pines in front
      for (const [x, y] of [[8, 71], [52, 74], [99, 73], [150, 70]]) P.ell(x, y, 7, 2.5, 13);
      for (const [x, y] of [[20, 74], [40, 71], [116, 75], [138, 72]]) { P.tri(x - 3, y, x + 3, y, x, y - 7, 11); P.tri(x - 4, y + 2, x + 4, y + 2, x, y - 3, 12); }
    },
  },
  {
    name: 'farm',
    slide: { y: 13, pic: ['..ww...', '..wwrr.', 'rrrrrrr', 'rrrrrrr', '.k...k.'], ink: { w: 15, r: 14, k: 12 } },
    inks: [0xe4c368, 0xb9cc6d, 0x8fae4e, 0x9a6a40, 0x6e4a2e, 0x4f8a3b, 0xd8492f, 0xf2e6c4],
    cards: [0xd03a2a, 0x3c9638, 0x7a42aa, 0x2d82d2],
    art(P) {
      // striped fields on the far edge and a rail fence
      P.rect(3, 18, 154, 1, 11); P.rect(3, 15, 154, 1, 11);
      for (let x = 5; x < 157; x += 12) P.rect(x, 14, 1, 6, 12);
      for (const x of [20, 62, 100, 140]) { P.ell(x, 11, 4, 3, 8); P.rect(x - 4, 11, 9, 2, 8); P.rect(x - 2, 9, 1, 1, 10); }
      // rows of crops in front
      for (let r = 0; r < 3; r++) for (let x = 5 + r * 3; x < 156; x += 7) P.rect(x, 67 + r * 3, 3, 1, 13);
      for (const [x, y] of [[30, 68], [118, 71]]) { P.ell(x, y, 1.5, 1.5, 14); }
    },
  },
  {
    name: 'town',
    slide: { y: 68, pic: ['yyyyyyyyy', 'ywwywwyyy', 'yyyyyyyyy', '.kk...kk.'], ink: { y: 15, w: 13, k: 11 } },
    inks: [0xd77a55, 0xe9c6a0, 0x8f5b4a, 0x3d4e6e, 0xb7b0a4, 0xf6eedd, 0x7c8b9c, 0xe7b84c],
    cards: [0xd6377a, 0xec761b, 0x158e8c, 0x3f40a6],
    art(P) {
      // a row of little houses along the far edge
      for (let x = 4, k = 0; x < 154; x += 13, k++) {
        const h = 6 + (k * 5) % 4;
        P.rect(x, 22 - h, 10, h, 9);
        P.tri(x - 1, 22 - h, x + 11, 22 - h, x + 5, 22 - h - 5, k & 1 ? 8 : 10);
        P.rect(x + 2, 22 - h + 2, 2, 2, 11); P.rect(x + 6, 22 - h + 2, 2, 2, 11);
      }
      // a road with a dashed line across the foreground
      P.rect(3, 69, 154, 5, 12);
      for (let x = 6; x < 156; x += 8) P.rect(x, 71, 4, 1, 13);
      for (const [x, y] of [[10, 66], [70, 76], [140, 66]]) P.ell(x, y, 1.5, 1, 14);
    },
  },
  {
    name: 'pond',
    slide: { y: 70, pic: ['....bb.', '...bbbo', 'wwwbb..', 'wwwwww.', '.wwww..'], ink: { b: 12, o: 15, w: 14 } },
    inks: [0x5fa36b, 0x3f7f52, 0x86c3d9, 0x5c9fc4, 0x3f8f5a, 0xf0a8c0, 0xd9e9a8, 0xb07a4a],
    cards: [0x8843c2, 0xe6552d, 0x14996a, 0x2a76ce],
    art(P) {
      // reeds and big leaves on the far edge
      for (let x = 4; x < 156; x += 7) { const h = 5 + ((x * 7) % 5); P.rect(x, 21 - h, 1, h, (x & 1) ? 8 : 9); P.rect(x, 21 - h - 2, 1, 2, 15); }
      for (const x of [26, 96, 136]) P.ell(x, 19, 6, 2.5, 9);
      // a pond in front with lily pads and a pink flower
      P.ell(80, 74, 70, 6.5, 10);
      P.band(10, 150, (x) => [72 + 0.6 * sinx(x / 2.5), 73 + 0.6 * sinx(x / 2.5)], 11);
      for (const [x, y] of [[30, 75], [64, 73], [100, 76], [128, 73]]) { P.ell(x, y, 3, 1.5, 12); }
      P.rect(64, 72, 2, 1, 13);
    },
  },
  {
    name: 'circus',
    slide: { y: 66, pic: ['..b..', '.bbb.', 'bbybb', '.bbb.', '..b..'], ink: { b: 10, y: 11 } },                     // the hour's chapter spread
    inks: [0xe85a4a, 0xf4e2c4, 0x2f5bb8, 0xf2b636, 0x7a9f5a, 0xb33a2e, 0xe9d3a0, 0x3d6b3a],
    cards: [0xdd2f2e, 0x2b54c6, 0x1f8f55, 0xe8960e],
    art(P) {
      // the ring: sawdust and a painted kerb in front, a few stars printed on the far edge
      for (const x of [14, 46, 114, 146]) { P.rect(x - 2, 12, 5, 1, 11); P.rect(x, 10, 1, 5, 11); }
      P.ell(80, 73, 74, 4.5, 14);
      P.ell(80, 73, 70, 3, 9);
      for (const x of [12, 40, 120, 148]) { P.rect(x, 66, 3, 3, [8, 10][x & 1]); }
    },
  },
];
export const CIRCUS = SPREADS.length - 1;

// ------------------------------------------------------------ textures and palettes

/** The slots the pop-ups stand in, the same on every spread: x0, x1, y (glass). */
export const SLOTS = [];

function build(sp, slots) {
  const P = canvas();
  sp.art(P);
  // keep the stands clean: the pop-ups' own places on the page are bare paper under them
  for (const [x0, x1, y] of slots) { P.rect(x0 - 1, y - 2, x1 - x0 + 2, 3, I_PAPER); P.rect(x0, y, x1 - x0, 1, I_SLOT); }
  return P.t;
}

/** Each spread's slider: a small printed piece that runs in a slot. */
export const SLIDES = SPREADS.map((sp) => {
  const { pic, ink, y } = sp.slide, w = pic[0].length, h = pic.length;
  const d = new Int8Array(w * h).fill(-1);
  pic.forEach((row, j) => [...row].forEach((c, i) => { if (c !== '.') d[j * w + i] = ink[c]; }));
  return { w, h, d, y };
});

export function buildSpreads(slots) {
  SLOTS.push(...slots);
  return SPREADS.map((sp) => build(sp, slots));
}

/** PAL[spread][night 0|1][tone * 32 + ink] as RGB565. */
export const PAL = SPREADS.map((sp) => [0, 1].map((nt) => {
  const p = new Uint16Array(8 * 32);
  const inks = [...FIXED, ...sp.inks];
  while (inks.length < 32) inks.push(0xff00ff);
  for (let t = 0; t < 8; t++) for (let i = 0; i < 32; i++) {
    let c = tone(inks[i], TONES[t]);
    if (nt) c = night(c);
    p[t * 32 + i] = to565(c);
  }
  return p;
}));

/**
 * CARD[spread][night][slot]: the codes of a card sprite as RGB565:
 * 0 -, 1 keyline, 2 face, 3 cut edge, 4 face shade, 5 print (pattern), 6 tab.
 */
export const CARD = SPREADS.map((sp) => [0, 1].map((nt) => sp.cards.map((c) => {
  const cols = [0, FIXED[I_KEY], c, mixc(c, 0xfff8e8, 0.62), mixc(c, 0x000000, 0.28), mixc(c, 0xfff4e0, 0.3), mixc(c, 0x1a1010, 0.4)];
  return Uint16Array.from(cols.map((v, k) => to565(nt ? (k === 1 ? 0x0c0a14 : cardNight(v)) : v)));
})));

// ------------------------------------------------------------ the hour's centrepiece
// A big top in two pieces, body and roof, die-cut like the numerals:
// codes as the cards' (2 face, 5 print = its red stripes, 7 the dark door).
function spriteOf(w, h, f) {
  const d = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = f(x + 0.5, y + 0.5);
  return { d, w, h };
}
export const TENT_BODY = spriteOf(58, 17, (x, y) => {
  const door = y > 4 && Math.abs(x - 29) < (y - 4) * 0.42 + 0.5;
  return door ? 7 : x > 2 && x < 56 ? 2 : 0;
});
export const TENT_ROOF = spriteOf(64, 17, (x, y) => {
  const cone = y > 1 && Math.abs(x - 32) < (y - 1) * 2.0 + 1;
  const scal = y > 12 && ((x - 32) * (x - 32) / 900 + 0) < 1 && ((((x + 2) % 8) - 4) ** 2 + (y - 12.5) ** 2) < 16 && Math.abs(x - 32) < 30;
  return cone && y <= 13.5 ? 2 : scal ? 2 : 0;
});
const TENT_COLS = [0, FIXED[I_KEY], 0xfbf3e2, 0xffffff, 0xd9cbb0, 0xe0523f, 0x5a1c18, 0x2a2030];
export const TENT_PAL = [0, 1].map((nt) => Uint16Array.from(TENT_COLS.map((v) => to565(nt ? mixc(v, night(v), 0.55) : v))));
export const BUNTING = [0xe0402c, 0x2f5bc8, 0xf0a010, 0x1f9a5a].map((c) => [to565(c), to565(cardNight(mixc(c, 0, 0.25)))]);
