// Teletext: Ceefax page 302, the weather map, and the time is the weather.
// The four numerals are white mosaic clouds over a blocky British Isles: the
// hours a front coming in over the Atlantic and Ireland, the minutes a front
// over the North Sea and the Low Countries. Each is a hand-drawn sixel digit
// (teletext-glyphs.js) with a cumulus rim that billows on its outer
// silhouette only, and a flat base it rains from.
//
// Everything on the glass is a real teletext page (teletext-page.js): 40 x 13
// character cells of 2 x 3 sixels, the eight teletext colours, every colour
// change paid for with a control-code cell that shows as a black space. The
// scene is drawn as sixels, encoded into page bytes as an editor would have
// to, then decoded like an SAA5050, so the medium's accidents are real: one
// colour per cell, black notches where the cloud meets the land, colour runs.
//
// At rest the time is never still. The puffs on each cloud's top and sides
// drift downwind (a sixel step every 12 frames). Once a second the page
// "updates": a gust row sweeps down the glass top to bottom, shearing each
// cloud a sixel east as it passes and swelling its puffs, and every cloud
// lets go a burst of blue rain from its underside that falls, slanted by
// the wind, until it meets the land. The sun's rays blink on the teletext
// flash attribute (on 3/4 of each second), the wind arrows step a cell on
// the beat, and the header row rolls through the pages of magazine 3 as they
// go by. Every 12 s a flourish: lightning out of a cloud (the cloud flashes
// yellow), a downpour, a sunburst or a gale.
//
// Minute turn: the old cloud rains itself out (its sixels leave in a fixed
// random order, evenly, each one falling as rain) and is gone by :59.7; the
// new one blows in from the west as cyan vapour that condenses white, one
// sixel at a time, from :00.15 to :00.95. Hour: a thunderstorm over the new
// time (three strikes, each cloud pair flashing yellow), then page 302 turns
// to its next sub-page as a real set does: the page clears to its header and
// the four clouds (nothing else is kept), the header's page counter races
// while it searches, the new sub-page (other weather, other caption) arrives
// row by row, top to bottom, and a warm and a cold front sweep across the new
// map. The clouds are drawn the same throughout, so the time always reads.
//
// Palette: the eight level-1 teletext colours and nothing else, at full
// saturation on black, because that is all a teletext decoder can show. White
// is reserved for the time (the strongest contrast on the glass); the land is
// green and half "shaded" (checkered sixels), rain blue, vapour and wind
// cyan, sun and lightning yellow. Night is page 302's TONIGHT: the backlight
// dims, the map is drawn as its coastline only, the sun is a moon; the
// colours stay pure, as a decoder's would.
//
// Cost: the scene is a byte layer of 80 x 39 sixels; the encoder makes one
// pass over 480 cells, the decoder writes the 12,480 pixels of the page like
// a character generator (both billed to the estimate as box work; the hour's
// reload builds a second, bare layer). No per-pixel callbacks, no float in
// the hot loops. RAM: two 3.1 KB sixel layers, two 520 B pages, 2 x 1 KB of
// fixed-text cells. Flash: ten glyph tables (~6 KB), the map, fall and sea
// tables (~9 KB), the 1 KB billow field and the font: under 20 KB.

import { clockFields, hash, clamp, progress } from '../js/kit.js';
import { GLYPHS, FW, GW, M } from './teletext-glyphs.js';
import {
  COLS, ROWS, SW, SH, encode, decode, bytes,
  L_LAND, L_RAIN, L_VAPOUR, L_WIND, L_SUN, L_BOLT, L_CLOUD, L_STRUCK, L_WARM, L_COLD,
} from './teletext-page.js';
import { LAND, COAST } from './teletext-map.js';

const W = 160;

// ------------------------------------------------------------ layout (sixels)

// field origins (the field is the base digit plus its rim margin)
const SLOT_X = [2, 16, 52, 66];
const SLOT_Y = [3, 3, 14, 14];

// the sea's wave marks: rows of sea away from the coast and from the clouds
const SEA = new Uint8Array(SW * SH);
for (let y = 1; y < SH; y += 3)
  for (let x = 0; x < SW; x++) {
    let near = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < SW && yy < SH && LAND[yy * SW + xx]) near = true;
    }
    if (!near) SEA[y * SW + x] = 1 + (hash(y, 3) % 12);
  }

// rain falls one column east for every four rows; how far it can fall from each sixel before land or the bottom
const SLANT = (k) => (k + 2) >> 2;
const FALL = new Uint8Array(SW * SH);
for (let y = 0; y < SH; y++)
  for (let x = 0; x < SW; x++) {
    let k = 1;
    for (; y + k < SH; k++) { const xx = x + SLANT(k); if (xx >= SW || LAND[(y + k) * SW + xx]) break; }
    FALL[y * SW + x] = k;
  }

// the billow field: smooth blobs, 32 x 32, looked up at a drifting offset
const PUFF = new Uint8Array(32 * 32);
{
  const g = new Float32Array(8 * 8);
  for (let i = 0; i < 64; i++) g[i] = (hash(i, 77) & 255) / 255;
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const fx = x / 4, fy = y / 4, ix = fx | 0, iy = fy | 0, ux = fx - ix, uy = fy - iy;
      const sx = ux * ux * (3 - 2 * ux), sy = uy * uy * (3 - 2 * uy);
      const a = g[(iy & 7) * 8 + (ix & 7)], b = g[(iy & 7) * 8 + ((ix + 1) & 7)];
      const c = g[((iy + 1) & 7) * 8 + (ix & 7)], d = g[((iy + 1) & 7) * 8 + ((ix + 1) & 7)];
      PUFF[y * 32 + x] = Math.round(255 * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy));
    }
}

// ------------------------------------------------------------ sprites (sixel pictures)

const pic = (s) => s.split('\n').map((r) => r.trim()).filter(Boolean);
const SUN_DISC = pic(`
  .XXX.
  XXXXX
  XXXXX
  XXXXX
  .XXX.`);
const MOON = pic(`
  .XXX.
  XX...
  XX...
  XX...
  .XXX.`);
const ARROW = pic(`
  ...X.
  XXXXX
  ...X.`);
// the sun's eight rays: [dx, dy] from the disc centre, short and long
const RAYS = [[0, -4], [3, -3], [4, 0], [3, 3], [0, 4], [-3, 3], [-4, 0], [-3, -3]];

const SUN_X = 48, SUN_Y = 8;                 // the sun's centre, over the North Sea
const ARROWS = [                              // wind tracks: [row, from col, to col]
  [24, 1, 15], [33, 2, 14], [11, 42, 50],
];

// ------------------------------------------------------------ sub-pages

const SUBS = [
  { cap: 'SHOWERS', rain: 0.7, sun: 1, arrows: 2, bolts: 0.2 },
  { cap: 'SUNNY SPELLS', rain: 0.25, sun: 2, arrows: 3, bolts: 0.1 },
  { cap: 'THUNDERY RAIN', rain: 0.9, sun: 0, arrows: 2, bolts: 0.5 },
];
const subOf = (h) => h % 3;

// ------------------------------------------------------------ the page's fixed text

const FIXED = new Int16Array(COLS * ROWS);
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function setRow(r, c0, arr) { for (let k = 0; k < arr.length && c0 + k < COLS; k++) FIXED[r * COLS + c0 + k] = arr[k]; }

function fixedText(date, rolling, sub, night) {
  FIXED.fill(-1);
  // the header: decoder page number, service, the page going by, the date
  const n = String(rolling).padStart(3, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const row0 = bytes('P302', 0x03, 'CEEFAX 1', 0x02, n, 0x07, ' ');
  while (row0.length < 28) row0.push(0x20);
  row0.push(...bytes(0x06, DOW[date.getDay()], ' ', dd, ' ', MON[date.getMonth()]));
  while (row0.length < COLS) row0.push(0x20);
  setRow(0, 0, row0);
  // the page title and sub-page
  setRow(1, 28, bytes(0x03, 'WEATHER', 0x07, `${sub + 1}/3`));
  // the caption, bottom left, over the sea
  const cap = night ? 'TONIGHT' : SUBS[sub].cap;
  setRow(12, 0, bytes(0x06, cap));
}

// ------------------------------------------------------------ drawing into the sixel layer

const LAYER = new Uint8Array(SW * SH), LAYER_B = new Uint8Array(SW * SH);
const PAGE = new Uint8Array(COLS * ROWS), PAGE_B = new Uint8Array(COLS * ROWS);
const FIXED_B = new Int16Array(COLS * ROWS);

const isTime = (v) => v === L_CLOUD || v === L_STRUCK;
function plot(L, x, y, v) {
  if (x < 0 || y < 0 || x >= SW || y >= SH) return;
  const i = y * SW + x;
  if (!isTime(L[i])) L[i] = v;
}
function plotPic(L, p, x0, y0, v) {
  for (let y = 0; y < p.length; y++) for (let x = 0; x < p[y].length; x++) if (p[y][x] === 'X') plot(L, x0 + x, y0 + y, v);
}

/** A raindrop: a head and a tail one row up. */
function drop(L, x, y, len) {
  plot(L, x, y, L_RAIN);
  if (len > 1) plot(L, x, y - 1, L_RAIN);
}

/** Rain let go at time t0 from (x0, y0); drawn if still falling at s. */
function rainFrom(L, x0, y0, t0, s, life = 99) {
  const a = s - t0;
  if (a < 0) return;
  const k = (a * 24) | 0;                     // 24 sixels a second: under a pixel a frame
  if (k < 1 || k >= life) return;
  if (x0 < 0 || x0 >= SW || y0 < 0 || y0 >= SH) return;
  if (y0 + k >= SH) return;
  drop(L, x0 + SLANT(k), y0 + k, k > 1 ? 2 : 1);
}

/** The gust that sweeps down the glass each second: which sixel rows are sheared a sixel east. */
function shearAt(s, y) {
  const p = s - Math.floor(s);
  const yc = p * 70 - 6;                       // top to bottom in ~0.65 s
  return y > yc - 3 && y < yc + 3 ? 1 : 0;
}

/**
 * One cloud numeral. `keep` in [0, 1]: sixels with rank below it are gone
 * (rained out); `arrive`: the blow-in clock (s), or -1 when settled.
 */
function cloud(L, d, slot, s, v, keep, arrive, swell, drift) {
  const G = GLYPHS[d], ox = SLOT_X[slot], oy = SLOT_Y[slot];
  const base = G.base, rank = G.rank;
  for (let k = 0; k < base.length; k++) {
    const fy = (base[k] / FW) | 0, fx = base[k] - fy * FW;
    const y = oy + fy, dx = shearAt(s, y);
    const r = rank[k];
    if (arrive >= 0) {
      const at = 0.3 + 0.7 * r * r;            // arrival after :00: half of it by :00.48
      if (arrive < at) {
        // in flight (never before :00): cyan vapour coming in on the west wind
        const u = (arrive - (at - 0.3)) / 0.3;
        if (u > 0) {
          const h = hash(k, d, slot);
          const D = 6 + (h % 26), dy = ((h >>> 8) % 7) - 3;
          const q = 1 - u;
          plot(L, ox + fx - ((D * q + 0.5) | 0), y + ((dy * q + 0.5) | 0), L_VAPOUR);
        }
        continue;
      }
    } else if (r < keep) {
      continue;
    }
    const x = ox + fx + dx;
    if (x >= 0 && x < SW) L[y * SW + x] = v;
  }
  // the cumulus rim: puffs where the billow field is high
  let fill = 1;
  if (arrive >= 0) fill = clamp((arrive - 0.5) / 0.6, 0, 1);
  if (keep > 0) fill = Math.min(fill, 1 - keep);
  if (fill <= 0) return;
  const t1 = 95 - swell, thr1 = 255 - (255 - t1) * fill, thr2 = thr1 + 40;
  const R1 = G.rim1, R2 = G.rim2, P2 = G.par2;
  const lit = RIM_LIT;
  // no puffs on the side facing the other digit of the pair: the gap between them stays open
  const lo = slot & 1 ? M : 0, hi = slot & 1 ? FW : M + GW;
  for (let k = 0; k < R1.length; k++) {
    const fy = (R1[k] / FW) | 0, fx = R1[k] - fy * FW;
    const x = ox + fx, y = oy + fy;
    const p = PUFF[(y & 31) * 32 + ((x - drift) & 31)];
    lit[k] = p > thr1 && fx >= lo && fx < hi ? 1 : 0;
    if (lit[k]) { const xx = x + shearAt(s, y); if (xx >= 0 && xx < SW && !isTime(L[y * SW + xx])) L[y * SW + xx] = v; }
  }
  for (let k = 0; k < R2.length; k++) {
    if (!lit[P2[k]]) continue;
    const fy = (R2[k] / FW) | 0, fx = R2[k] - fy * FW;
    const x = ox + fx, y = oy + fy;
    const p = PUFF[(y & 31) * 32 + ((x - drift) & 31)];
    if (p > thr2 && fx >= lo && fx < hi) { const xx = x + shearAt(s, y); if (xx >= 0 && xx < SW && !isTime(L[y * SW + xx])) L[y * SW + xx] = v; }
  }
}
const RIM_LIT = new Uint8Array(256);

/** The rain a settled cloud lets go on each beat, from its drip points. */
function cloudRain(L, d, slot, s, density, mk) {
  const G = GLYPHS[d], ox = SLOT_X[slot], oy = SLOT_Y[slot], D = G.drip;
  // eight lets-go a second: the one on the beat is the heavy one
  const n0 = Math.floor(s * 8);
  for (let n = n0 - 5; n <= n0; n++) {
    const p = (n & 7) === 0 ? density * 1.6 : density * 0.8;
    for (let j = 0; j < D.length; j++) {
      const h = hash(mk * 241 + n, j, slot);
      if ((h & 1023) > p * 1024) continue;
      const fy = (D[j] / FW) | 0, fx = D[j] - fy * FW;
      // like the rain under a weather symbol: a short slanted fall, over land or sea
      rainFrom(L, ox + fx, oy + fy - 1, n / 8 + ((h >>> 12) & 255) / 255 * 0.06, s, 8 + ((h >>> 20) & 15));
    }
  }
}

/** The old cloud raining itself out: each sixel falls from where it was, after it leaves. */
function rainOut(L, d, slot, s, t0, t1) {
  const G = GLYPHS[d], ox = SLOT_X[slot], oy = SLOT_Y[slot];
  for (let k = 0; k < G.base.length; k++) {
    const fy = (G.base[k] / FW) | 0, fx = G.base[k] - fy * FW;
    rainFrom(L, ox + fx, oy + fy, t0 + (t1 - t0) * G.srank[k], s, 22 - (fy >> 1));
  }
}

/** A lightning bolt from (x0, y0) down to the ground: a mosaic zigzag, grown over a few frames. */
function bolt(L, x0, y0, seed, u) {
  const fall = FALL[y0 * SW + x0];
  const len = Math.min(fall + 1, ((u * 4) | 0) * 6 + 6);
  let x = x0;
  for (let k = 0; k < len && y0 + k < SH; k++) {
    if (k > 0 && k % 3 === 0) x += ((hash(seed, k) & 3) === 0 ? -1 : 1);
    plot(L, x, y0 + k, L_BOLT);
    if (k % 3 === 1) plot(L, x + 1, y0 + k, L_BOLT);
  }
}

/**
 * The hour's weather fronts crossing the map west to east: a warm front
 * (red, semicircles) and the cold front behind it (blue, triangles), drawn
 * as a teletext artist would, a sixel line with its symbols on the leading side.
 */
function fronts(L, X) {
  for (let f = 0; f < 2; f++) {
    const x0 = X - f * 16, v = f === 0 ? L_WARM : L_COLD;
    for (let y = 3; y < SH; y++) {
      const dy = y - 21, x = x0 - ((dy * dy) >> 5) + (y >> 3);
      plot(L, x, y, v);
      const k = (y + f * 3) % 7;
      if (f === 0) {
        // a semicircle: two sixels out, three rows tall
        if (k === 1 || k === 3) plot(L, x + 1, y, v);
        if (k === 2) { plot(L, x + 1, y, v); plot(L, x + 2, y, v); }
      } else {
        // a triangle: its point three sixels out
        if (k === 1 || k === 5) plot(L, x + 1, y, v);
        if (k === 2 || k === 4) { plot(L, x + 1, y, v); plot(L, x + 2, y, v); }
        if (k === 3) { plot(L, x + 1, y, v); plot(L, x + 2, y, v); plot(L, x + 3, y, v); }
      }
    }
  }
}

// ------------------------------------------------------------ the scene

const digitsOf = (f) => [+f.hh[0], +f.hh[1], +f.mm[0], +f.mm[1]];

function scene(L, ctx, sub, st) {
  const { s, f, pv, nx, mk, hourShow } = st;
  const S = SUBS[sub];
  const night = ctx.night > 0.5, bare = st.bare;
  // the land, with cloud shadows sliding east across it: shaded sixels thin out under a shadow
  const sh = Math.floor((st.mk * 60 + s) * 5);
  for (let y = 0; y < SH; y++) {
    const row = y * SW, py = ((y * 3) >> 1) & 31, gust = shearAt(s, y);
    for (let x = 0; x < SW; x++) {
      if (!LAND[row + x] || bare) { L[row + x] = 0; continue; }
      if (COAST[row + x]) { L[row + x] = L_LAND; continue; }
      if (night) { L[row + x] = 0; continue; }          // by night the map is its coastline only
      // inland is shaded (a checker); the beat's gust shifts it a sixel as it crosses, like wind over fields
      const shade = PUFF[py * 32 + (((x - sh) >> 1) & 31)] > 150;
      const xs = x + gust;
      L[row + x] = (shade ? (xs & 1) === 0 && (y & 1) === 0 : ((xs + y) & 1) === 0) ? L_LAND : 0;
    }
  }


  // the flourish of this 12 s block (not near the turn): lightning, downpour, sunburst, gale
  const blk = Math.floor(s / 12), bt = s - blk * 12;
  let kind = -1;
  if (blk >= 1 && blk <= 4 && !hourShow) {
    kind = hash(mk, blk, 5) % 4;
    if (kind === 0 && hash(mk, blk, 6) % 100 > 30 + S.bolts * 100) kind = 1;
  }
  const flour = kind >= 0 ? progress(bt, 0, 0.1) * (1 - progress(bt, 1.8, 2.0)) : 0;

  // wind arrows: a cell forward on every beat
  const gale = kind === 3 ? flour : 0;
  for (let a = 0; a < (bare ? 0 : S.arrows) && a < ARROWS.length; a++) {
    const [ry, c0, c1] = ARROWS[a];
    const span = c1 - c0 + 1;
    const step = Math.floor(s) * 2 + (gale ? ((s * 8) | 0) * 2 : 0) + a * 5;
    plotPic(L, ARROW, c0 + (step % span), ry, L_WIND);
  }

  // the sun (or the moon), its rays on the flash attribute
  if ((S.sun || night) && !bare) {
    const flashOn = s - Math.floor(s) < 0.75;
    const burst = kind === 2 ? flour : 0;
    if (night) plotPic(L, MOON, SUN_X - 2, SUN_Y - 2, L_SUN);
    else {
      plotPic(L, SUN_DISC, SUN_X - 2, SUN_Y - 2, L_SUN);
      if (flashOn || burst) {
        const long = burst ? (((s * 4) | 0) & 1) + 1 : S.sun > 1 ? 1 : 0;
        for (const [dx, dy] of RAYS) {
          const ux = Math.sign(dx), uy = Math.sign(dy);
          plot(L, SUN_X + dx, SUN_Y + dy, L_SUN);
          for (let e = 1; e <= long; e++) plot(L, SUN_X + dx + ux * e, SUN_Y + dy + uy * e, L_SUN);
        }
      }
    }
  }

  // the clouds: which digit, and where in its life
  const now = digitsOf(f), before = digitsOf(pv), next = digitsOf(nx);
  const swell = Math.max(0, 1 - (s - Math.floor(s)) / 0.3) * 45;
  const drift = Math.floor((mk * 60 + s) * 5) & 31;
  const rainMul = kind === 1 ? 2.2 * flour + 1 : 1;
  let struck = -1;
  if (kind === 0 && bt < 1.2) struck = hash(mk, blk, 7) & 1;
  if (hourShow && s > 1.4 && s < 4.6) {
    const k = Math.floor((s - 1.4) / 1.05), lt = s - 1.4 - k * 1.05;
    if (lt < 0.5) struck = k & 1 ? 1 : 0;
  }

  for (let i = 0; i < 4; i++) {
    const pair = i >> 1;
    let v = L_CLOUD;
    if (struck === pair) {
      const lt = hourShow ? (s - 1.4) % 1.05 : bt;
      if (lt < 0.08 || (lt > 0.18 && lt < 0.24)) v = L_STRUCK;
    }
    const leaving = s >= 58.9 && next[i] !== now[i];
    const coming = s < 1.4 && before[i] !== now[i];
    if (leaving) {
      const p = progress(s, 58.9, 59.85), q = p * p;     // most of it leaves late: it reads until ~:59.6
      rainOut(L, now[i], i, s, 58.9, 59.85);
      if (q < 1) cloud(L, now[i], i, s, v, q, -1, swell, drift);
    } else if (coming) {
      // the rain-out of the old one is still falling
      rainOut(L, before[i], i, s + 60, 58.9, 59.85);
      cloud(L, now[i], i, s, v, 0, s, swell, drift);
    } else {
      cloud(L, now[i], i, s, v, 0, -1, swell, drift);
      if (!bare) cloudRain(L, now[i], i, s, Math.min(1, S.rain * rainMul * (night ? 0.8 : 1)), mk);
    }
  }

  // the sea: wave dashes running east with the wind, a sixel every 10 frames,
  // kept two sixels (4 px) clear of the clouds
  if (!bare) {
    const wv = Math.floor((st.mk * 60 + s) * 6);
    for (let y = 1; y < SH; y += 3) {
      const row = y * SW;
      for (let x = 0; x < SW; x++) {
        const o = SEA[row + x];
        if (!o || ((x - wv + o * 7) % 12 + 12) % 12 >= 4 || L[row + x]) continue;
        let clear = true;
        for (let dy = -2; dy <= 2 && clear; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= SH) continue;
          for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx;
            if (xx >= 0 && xx < SW && isTime(L[yy * SW + xx])) { clear = false; break; }
          }
        }
        if (clear) L[row + x] = L_RAIN;
      }
    }
  }

  if (st.front > -99) fronts(L, Math.round(st.front));

  // lightning from the struck pair
  if (struck >= 0) {
    const lt = hourShow ? (s - 1.4) % 1.05 : bt;
    if (lt < 0.3) {
      const i = struck * 2 + (hash(mk, blk, 9) & 1);
      const G = GLYPHS[now[i]];
      const dp = G.drip[hash(mk, blk, 11) % G.drip.length];
      const fy = (dp / FW) | 0, fx = dp - fy * FW;
      bolt(L, SLOT_X[i] + fx, SLOT_Y[i] + fy, mk * 7 + blk, lt / 0.12);
    }
  }
}

// ------------------------------------------------------------ the face

export default {
  name: 'Teletext',
  blurb: 'Ceefax page 302: the time is the weather, four mosaic clouds raining over a blocky British Isles; the page reloads row by row at the hour.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    const pv = clockFields(new Date(ctx.date.getTime() - 60000));
    const nx = clockFields(new Date(ctx.date.getTime() + 60000));
    const hourShow = pv.h !== f.h && s < 12;
    // the hour's fronts sweep the new sub-page from :07 to :12
    const front = hourShow && s > 7 && s < 12 ? -14 + (s - 7) * 22 : -99;
    const st = { s, f, pv, nx, mk, hourShow, front, bare: false };
    const night = ctx.night > 0.5;
    const flashOn = s - Math.floor(s) < 0.75;

    // the header rolls through magazine 3 as its pages go by; at the hour it searches fast
    const tt = mk * 60 + s;
    let rolling = 300 + (Math.floor(tt * 9) % 100);
    const sub = subOf(f.h);
    // the hour: the set asks for the next sub-page; the page clears to its header and the
    // time (a decoder keeps nothing else), the header searches, then the new rows arrive top down
    let reload = 99;
    if (hourShow && s >= 4.6) {
      if (s < 5.8) rolling = 300 + (Math.floor(tt * 40) % 100);
      reload = s < 5.8 ? 0 : Math.floor((s - 5.8) / 0.12) + 1;   // rows arrived so far
      if (reload > ROWS) reload = 99;
    }

    fixedText(ctx.date, rolling, sub, night);
    scene(LAYER, ctx, sub, st);
    encode(PAGE, LAYER, FIXED, 0, ROWS);
    if (reload < ROWS) {
      // rows not yet received hold only the time (the clouds), with no fixed text
      st.bare = true;
      scene(LAYER_B, ctx, sub, st);
      FIXED_B.fill(-1);
      encode(PAGE_B, LAYER_B, FIXED_B, 1, ROWS);
      for (let r = Math.max(1, reload); r < ROWS; r++) for (let c = 0; c < COLS; c++) PAGE[r * COLS + c] = PAGE_B[r * COLS + c];
      g.cost.box += SW * SH * 3 + COLS * ROWS * 16;
    }
    const n = decode(g.buf, PAGE, flashOn);
    g.buf.fill(0, ROWS * 6 * W);
    g.cost.px += n + 2 * W;
    g.cost.box += n + SW * SH * 3 + COLS * ROWS * 16;
  },
};
