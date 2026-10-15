// Thermal: the glass is a thermal imager's live view of a shelf in a cool
// room. Ten everyday things sit there, all of them always, and at room
// temperature they are invisible: a thermal camera sees heat, not shape. The
// time is whichever four are switched on, lit or freshly baked. A cat asleep
// curled nose to tail is a 0, a candle with its draught-bent flame a 1, a
// gooseneck lamp a 2, two croissants a 3, a clothes iron on its heel a 4,
// three linked grilled sausages a 5, a churro bent into a loop a 6, a
// running hair dryer a 7, a salted soft pretzel an 8, a frying pan with a
// cold egg cracked in it a 9 (the cold egg is the counter: thermal
// inversion). Two tea-lights are the colon.
//
// The scene: the hours stand on a windowsill in front of a winter window
// (its cold glass is the deep dark behind them), the minutes on a small wall
// shelf to the right, the colon two tea-lights between.
//
// The image is flat heat: every pixel is a temperature, mapped through the
// camera's palette in 24 flat isotherm bands (no shading: the bands are the
// medium's own texture, the way an imager posterises), so a hot core is
// ringed by cooler bands where its heat bleeds into the air and the wood.
// Overlay: the spot meter's crosshair with a live readout, the colour scale
// with its span, the view's name, in an OSD face drawn for the panel
// (thermal-osd.js).
//
// Always alive: steam and hot air rise off things as warm wisps, the dryer
// blows a hot jet, the iron puffs, the pan spits, flames flicker, the cat
// breathes (its heat pulses in and out of a band), warm air convects slowly
// up the wall, and the spot meter hunts between hot points, its number
// changing as it goes.
//
// Minute turn: the old object is switched off and cools as a whole, its
// colours sliding down the palette (the parts by its heat source last) while
// its heat lifts off it as a haze of wisps; it is gone before :00. After :00
// the new one warms up the palette from its source outward (the flame, the
// bulb, the soleplate, the nozzle). It is always its own digit, only fainter.
// The hour: the operator steps through the camera's views in downward scan
// wipes (rainbow, white hot, black hot, arctic), then narrows the span to
// 19-25 °C: the hot things burn white, the room's air shows its convection,
// and the cat's paw prints, a few tenths of a degree, come up along the
// sill; then back to ironbow.
//
// Palette: the imager's own, kept honest: one temperature per pixel through
// a lookup table. Ironbow's cold end is a deep indigo-violet, so the "dark"
// of the face is a deliberate coloured dark: the cold window, darker corners
// (lens vignetting, real on these cameras); the time is the hot end, magenta
// to white. Hard pixels for the image (it is a sensor), AA only for the
// crosshair, which glides.
//
// Cost: the frame is a field of 12,800 16-bit temperatures: the room copied
// in with a scrolling convection tile, the six sprites added (about 13k
// integer adds, gated per pixel during turns), a few hundred to a few
// thousand pixels of wisps, then one table lookup per pixel. All heat maps
// and tables are built at load (flash, ~215 KB: sprites 162, room 25, convection 16, views 12); nothing is redrawn per minute.

import { hash, clockFields, to565, from565, clamp, progress, ease, sin, cos, noise } from '../js/kit.js';
import { DIGIT_H, DIGIT_M, TEA, T_MIN, T_MAX, UNIT_PER_C, AMB } from './thermal-art.js';
import { osd } from './thermal-osd.js';

const W = 160, H = 80, N = W * H;
const UPC = UNIT_PER_C;
const TAU = Math.PI * 2;

// ------------------------------------------------------------ palettes (flash: a few colours each)

const BANDS = 24;
const PALETTES = [
  ['IRONBOW', [[0, 0x050316], [0.1, 0x170a4c], [0.2, 0x34097a], [0.32, 0x6a0c8e], [0.44, 0xa8167f], [0.56, 0xd83a52], [0.67, 0xf26a20], [0.78, 0xfaa214], [0.89, 0xffd84c], [1, 0xfffbe6]]],
  ['RAINBOW', [[0, 0x0a0626], [0.14, 0x1a1c9a], [0.28, 0x0a64d0], [0.42, 0x10b0a8], [0.55, 0x58cc3a], [0.68, 0xf0dc20], [0.8, 0xf8881a], [0.91, 0xe4241e], [1, 0xfff2f0]]],
  ['WHITE HOT', [[0, 0x0c0c12], [0.14, 0x26262c], [0.5, 0xc4c2bc], [1, 0xfafaf2]]],
  ['BLACK HOT', [[0, 0xf4f2ea], [0.14, 0xd6d4cc], [0.5, 0x3c3a40], [1, 0x0e0e12]]],
  ['ARCTIC', [[0, 0x020a20], [0.16, 0x0a2c66], [0.36, 0x2668bc], [0.52, 0x88c0e8], [0.62, 0xeee4c4], [0.78, 0xf2a62a], [1, 0xfff4c0]]],
];
function sample(st, u) {
  if (u <= st[0][0]) return st[0][1];
  for (let k = 1; k < st.length; k++) if (u <= st[k][0]) {
    const [p0, c0] = st[k - 1], [p1, c1] = st[k], f = (u - p0) / (p1 - p0);
    const ch = (s) => Math.round(((c0 >> s) & 255) + ((((c1 >> s) & 255) - ((c0 >> s) & 255)) * f));
    return (ch(16) << 16) | (ch(8) << 8) | ch(0);
  }
  return st[st.length - 1][1];
}
const BANDC = PALETTES.map(([, st]) => Array.from({ length: BANDS }, (_, b) => sample(st, (b + 0.5) / BANDS)));
// the camera's views: a palette over a span (°C). The last-but-one is the
// operator's narrow span, where the room's own air becomes visible.
const VIEWS = [
  ['IRONBOW', 0, T_MIN, T_MAX], ['RAINBOW', 1, T_MIN, T_MAX], ['WHITE HOT', 2, T_MIN, T_MAX],
  ['BLACK HOT', 3, T_MIN, T_MAX], ['ARCTIC', 4, T_MIN, T_MAX], ['HI SENS', 0, 19, 25],
];
// field units to RGB565, per view: on the device 1024 halfwords each
const LUT = VIEWS.map(([, p, lo, hi]) => {
  const t = new Uint16Array(1024);
  for (let v = 0; v < 1024; v++) {
    const u = (T_MIN + v / UPC - lo) / (hi - lo);
    t[v] = to565(BANDC[p][clamp(Math.floor(u * BANDS), 0, BANDS - 1)]);
  }
  return t;
});

// ------------------------------------------------------------ the room (flash)

// the wall: warmer air under the ceiling, the lens vignette; the shelf: a touch warmer
const SHELF_Y = 72, WIN = [0, 0, 74, 72];   // x, y, w, h
const BASE = new Int16Array(N);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const nx = (x + 0.5 - 80) / 80, ny = (y + 0.5 - 40) / 40, r2 = nx * nx + ny * ny;
    let T = AMB + 1.05 * Math.max(0, 1 - y / 46) - 0.75 * Math.max(0, r2 - 0.55);
    // a winter window behind the left of the shelf: cold glass, a cool frame and glazing bars
    const wx = x - WIN[0], wy = y - WIN[1];
    if (wx >= 0 && wy >= 0 && wx < WIN[2] && wy < WIN[3]) {
      const bar = wx < 3 || wy < 3 || wx >= WIN[2] - 3 || Math.abs(wx - WIN[2] / 2 + 0.5) < 1.5 || Math.abs(wy - 27) < 1.5;
      T = bar ? 18.9 : 16.6 + 0.9 * (1 - wy / WIN[3]) + 0.25 * (wx / WIN[2]);
    }
    // a wall shelf on the right for the minutes, on two brackets
    if (x >= 82 && x < 142 && y >= 58 && y < 61) T = AMB + 1.3 - (y === 58 ? 0.5 : 0);
    if ((x === 90 || x === 91 || x === 133 || x === 134) && y >= 61 && y < 63) T = AMB + 0.9;
    if (y >= SHELF_Y) T = AMB + 1.05 - 0.75 * Math.max(0, r2 - 0.55) - (y === SHELF_Y ? 0.4 : 0);
    BASE[y * W + x] = Math.round((T - T_MIN) * UPC);
  }
// the cat's paw prints along the sill, a few tenths of a degree: lost in the wide span,
// they come up only when the operator narrows it at the hour
for (let k = 0; k < 11; k++) {
  const px = 9 + k * 13.6, py = k & 1 ? 74.6 : 77.4;
  for (const [dx, dy, r] of [[0, 0.6, 1.5], [-1.9, -1.6, 0.8], [0, -2.2, 0.8], [1.9, -1.6, 0.8]])
    for (let y = Math.floor(py + dy - 2); y <= py + dy + 2; y++)
      for (let x = Math.floor(px + dx - 2); x <= px + dx + 2; x++) {
        if (y < SHELF_Y + 1 || y >= H || x < 0 || x >= W) continue;
        const d = Math.hypot(x + 0.5 - px - dx, y + 0.5 - py - dy);
        if (d < r + 0.3) BASE[y * W + x] = Math.max(BASE[y * W + x], Math.round((AMB + 1.05 - 0.75 * 0.5 + 0.55 - T_MIN) * UPC));
      }
}
// convection: a tileable 128 x 128 smooth noise, scrolled up the wall
const NT = new Int8Array(128 * 128);
{
  const lat = (i, j, p, s) => (hash(i & (p - 1), j & (p - 1), s) / 4294967296) * 2 - 1;
  const vn = (x, y, cell, s) => {
    const p = 128 / cell, fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy);
    let u = fx - ix, v = fy - iy; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
    const a = lat(ix, iy, p, s), b = lat(ix + 1, iy, p, s), c = lat(ix, iy + 1, p, s), d = lat(ix + 1, iy + 1, p, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++)
    NT[y * 128 + x] = Math.round((vn(x, y, 32, 1) * 0.7 + vn(x, y, 16, 2) * 0.3) * 0.5 * UPC);
}

// a wisp's fall-off by squared distance in its radius (on the device: 64 bytes)
const FALL = Uint16Array.from({ length: 64 }, (_, k) => Math.round(256 * Math.exp(-(k / 16) * 1.6) * (1 - k / 64)));

// ------------------------------------------------------------ layout

// [sprite set, design box x, y]; sprite origin = box - its margin
const SLOTS = [[DIGIT_H, 6, 11], [DIGIT_H, 38, 11], [DIGIT_M, 87, 12.4], [DIGIT_M, 112, 12.4]];
const TEAS = [[77.5, 31], [77.5, 50]];
const COOL0 = 57.7, COOL1 = 59.85, WARM0 = 0.05, WARM1 = 2.7, WF = 64, REST = 255 + WF, BQ = 110;
const F = new Int16Array(N);
let work = 0;   // integer ops this frame outside the canvas calls, billed as box work

// ------------------------------------------------------------ heat into the field

/** Add a sprite's heat at its origin; during a turn each pixel is gated by how far it is from the source. */
function addSprite(spr, ox, oy, front, gain) {
  const { w, h, heat, ord } = spr;
  const x0 = Math.max(0, -ox), x1 = Math.min(w, W - ox), y0 = Math.max(0, -oy), y1 = Math.min(h, H - oy);
  if (front <= 0 || x1 <= x0 || y1 <= y0) return;
  const fr = front | 0;
  if (fr >= REST) {
    for (let y = y0; y < y1; y++)
      for (let x = x0, k = y * w + x0, d = (y + oy) * W + ox + x0; x < x1; x++, k++, d++) F[d] += (heat[k] * gain) >> 8;
    work += (x1 - x0) * (y1 - y0) * 2;
  } else {
    // the whole object warms or cools together (so it is always its own digit, only fainter);
    // the parts near the source lead by up to BQ/256
    const P = ((fr * (256 + BQ)) / REST) | 0;
    for (let y = y0; y < y1; y++)
      for (let x = x0, k = y * w + x0, d = (y + oy) * W + ox + x0; x < x1; x++, k++, d++) {
        let q = P - ((ord[k] * BQ) >> 8);
        if (q <= 0) continue;
        if (q > 256) q = 256;
        F[d] += (heat[k] * q * gain) >> 16;
      }
    work += (x1 - x0) * (y1 - y0) * 4;
  }
}

/** A soft warm wisp of air, `amp` field units at its centre. */
function blob(cx, cy, r, amp) {
  if (amp < 1 || r <= 0) return;
  const R = 2 * r;
  const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(W - 1, Math.ceil(cx + R));
  const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(H - 1, Math.ceil(cy + R));
  const k = 16 / (r * r), A = amp | 0;
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy, dy2 = dy * dy;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, q = ((dx * dx + dy2) * k) | 0;
      if (q < 64) F[y * W + x] += (A * FALL[q]) >> 8;
    }
  }
  if (x1 >= x0 && y1 >= y0) work += (x1 - x0 + 1) * (y1 - y0 + 1) * 6;
}

const frac = (v) => v - Math.floor(v);

/** The life of one object: steam, plumes, jets, flames. `tm` is seconds into the hour; every period divides 3600. */
function effects(fx, ox, oy, alive, seed, tm) {
  if (alive <= 0.02) return;
  for (const e of fx) {
    const ex = ox + e.x, ey = oy + e.y, sc = e.sc;
    if (e.k === 'steam' || e.k === 'plume') {
      const st = e.k === 'steam', life = st ? 3.0 : 2.4, n = 4;
      const hot = (st ? 5 : 8 * (e.a ?? 1)) * UPC * alive, rise = (st ? 6.5 : 9) * sc;
      for (let j = 0; j < n; j++) {
        const ph = tm / life + j / n + (hash(seed, j) & 255) / 1024, u = frac(ph), cyc = Math.floor(ph);
        const lean = (hash(seed, j, cyc) & 1023) / 1023 - 0.5;
        const x = ex + lean * 5 * sc * u + 1.5 * sc * u * sin(TAU * (u * 1.2 + j * 0.37));
        blob(x, ey - rise * life * u, (1.2 + 2.6 * u) * sc, hot * Math.min(1, u * 6) * (1 - u));
      }
    } else if (e.k === 'flame') {
      const n1 = noise(tm * 6, seed), n2 = noise(tm * 9.5, seed + 7);
      blob(ex + (n1 - 0.5) * 1.6 * sc, ey - (0.3 + n2) * 1.3 * sc, 1.5 * sc, (10 + 18 * n2) * UPC * alive);
    } else if (e.k === 'jet') {
      for (let j = 0; j < 6; j++) {
        const ph = tm / 0.9 + j / 6, u = frac(ph), cyc = Math.floor(ph);
        const lean = ((hash(seed, j, cyc) & 1023) / 1023 - 0.5) * 2;
        blob(ex - u * 24 * sc, ey + lean * u * 3.5 * sc, (1.1 + 2.3 * u) * sc, 11 * UPC * alive * (1 - u) * Math.min(1, u * 8));
      }
    } else if (e.k === 'puff') {
      const pt = frac(tm / 7.2 + (seed & 7) / 8) * 7.2;
      for (let j = 0; j < 4; j++) {
        const u = (pt - j * 0.14) / 1.7;
        if (u <= 0 || u >= 1) continue;
        blob(ex - u * 9 * sc - j * 0.8, ey - u * 13 * sc, (1.3 + 2.6 * u) * sc, 7 * UPC * alive * (1 - u) * Math.min(1, u * 6));
      }
    } else if (e.k === 'spit') {
      for (let j = 0; j < 3; j++) {
        const ph = tm / 1.2 + j / 3, u = frac(ph) / 0.4, cyc = Math.floor(ph);
        if (u >= 1) continue;
        const a = (hash(seed, j, cyc) & 1023) / 1023 * TAU, rr = 0.55 + (hash(seed, j, cyc + 9) & 255) / 700;
        blob(ex + e.rx * rr * cos(a), ey + e.ry * rr * sin(a) - u * 4 * sc, 0.9 * sc, 20 * UPC * alive * (1 - u));
      }
    }
  }
}

// ------------------------------------------------------------ what each slot is doing

function frontOf(out, inn, s) {
  if (out && s >= COOL0) return (1 - ease.inOutQuad(progress(s, COOL0, COOL1))) * REST;
  if (inn && s < WARM1) return ease.outQuad(progress(s, WARM0, WARM1)) * REST;
  return REST;
}
// where a cooling object gives its heat up to the air: the hottest pixel of each 6 px cell
const REL = new Map();
for (const spr of [...DIGIT_H, ...DIGIT_M]) {
  const pts = [];
  for (let cy = 0; cy < spr.h; cy += 7)
    for (let cx = 0; cx < spr.w; cx += 7) {
      let best = 10 * UPC, bi = -1;
      for (let y = cy; y < Math.min(spr.h, cy + 7); y++) for (let x = cx; x < Math.min(spr.w, cx + 7); x++) if (spr.heat[y * spr.w + x] > best) { best = spr.heat[y * spr.w + x]; bi = y * spr.w + x; }
      if (bi >= 0) pts.push([(bi % spr.w) + 0.5, Math.floor(bi / spr.w) + 0.5, hash(bi, spr.w) & 255]);
    }
  REL.set(spr, pts);
}
/** The old object's heat lifting off it as it cools: soft wisps rising from all along it. */
function release(spr, ox, oy, s) {
  const sc = spr.s;
  for (const [px, py, hs] of REL.get(spr)) {
    const t0 = COOL0 + 0.15 + (hs & 15) * 0.045, u = progress(s, t0, t0 + 1.7);
    if (u <= 0 || u >= 1) continue;
    const lean = ((hs >> 4) - 7.5) / 7.5;
    blob(ox + px + lean * 6 * sc * u, oy + py - u * (8 + (hs & 15) * 0.9) * sc, (2.2 + 3.2 * u) * sc, 5 * UPC * sin(Math.PI * u));
  }
}

const origin = (i) => { const [set, bx, by] = SLOTS[i], m = set[0].m; return [Math.round(bx - m), Math.round(by - m)]; };
const teaOrigin = (k) => [Math.round(TEAS[k][0] - TEA.m - 5), Math.round(TEAS[k][1] - TEA.m - 5)];

// ------------------------------------------------------------ the spot meter

const CYC_MS = 3600;   // it moves to a new hot point every 3.6 s
function targetAt(C) {
  const f = clockFields(new Date(C * CYC_MS)), dg = f.hh + f.mm, list = [];
  for (let i = 0; i < 4; i++) {
    const spr = SLOTS[i][0][+dg[i]], [ox, oy] = origin(i);
    for (const [hx, hy] of spr.hot) list.push([ox + hx, oy + hy]);
  }
  list.push([TEAS[0][0], TEAS[0][1]]);
  let k = hash(C, 5) % list.length;
  if (k === hash(C - 1, 5) % list.length) k = (k + 3) % list.length;
  return list[k];
}
function readAt(x, y) {
  const ix = clamp(Math.floor(x - 0.5), 0, W - 2), iy = clamp(Math.floor(y - 0.5), 0, H - 2);
  const fx = clamp(x - 0.5 - ix, 0, 1), fy = clamp(y - 0.5 - iy, 0, 1), i = iy * W + ix;
  const v = (F[i] * (1 - fx) + F[i + 1] * fx) * (1 - fy) + (F[i + W] * (1 - fx) + F[i + W + 1] * fx) * fy;
  return T_MIN + v / UPC;
}

// ------------------------------------------------------------ the hour: the palettes in wipes

// [start s, view]: each wipe runs down the glass in P_WIPE s
const SHOW = [[3.0, 1], [4.6, 2], [6.2, 3], [7.8, 4], [9.4, 5], [13.2, 0]], P_WIPE = 0.9, SHOW_END = 14.2;
function paletteState(hourShow, s) {
  if (!hourShow || s < SHOW[0][0]) return [0, 0, H];
  let k = 0;
  while (k + 1 < SHOW.length && s >= SHOW[k + 1][0]) k++;
  const lt = s - SHOW[k][0], prev = k > 0 ? SHOW[k - 1][1] : 0;
  return [prev, SHOW[k][1], lt < P_WIPE ? Math.round(ease.inOutQuad(lt / P_WIPE) * (H + 1)) : H + 1];
}
/** The colour of scale-bar row u (0 bottom .. 1 top) in a view. */
const scaleColour = (view, u) => from565(LUT[view][clamp(Math.round((VIEWS[view][2] + u * (VIEWS[view][3] - VIEWS[view][2]) - T_MIN) * UPC), 0, 1023)]);

const OSD = 0xf6f4ee, OSD_DIM = 0xcfc6dc, EDGE = 0x08040e;

export default {
  name: 'Thermal',
  blurb: 'A thermal imager on a shelf of things: the time is whichever four are hot (a sleeping cat, a candle, croissants, an iron...); the old one cools away, the new one warms up.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, ms = ctx.date.getTime();
    const tm = (((ms % 3600000) + 3600000) % 3600000) / 1000;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    work = 0;
    const prv = clockFields(new Date(ms - 60000)), nxt = clockFields(new Date(ms + 60000));
    const cur = f.hh + f.mm, old = prv.hh + prv.mm, nw = nxt.hh + nxt.mm;

    // ---- the room: the wall and shelf, with warm air convecting up the wall
    const oy = tm * 3.2, oyi = Math.floor(oy), fy = ((oy - oyi) * 256) | 0;
    const oxi = Math.floor(6 * sin(TAU * tm / 120) + 64);
    for (let y = 0, i = 0; y < H; y++) {
      const ra = ((y + oyi) & 127) * 128, rb = ((y + oyi + 1) & 127) * 128;
      const wall = y < SHELF_Y ? 1 : 0;
      for (let x = 0; x < W; x++, i++) {
        const xx = (x + oxi) & 127;
        F[i] = BASE[i] + (wall ? (NT[ra + xx] * (256 - fy) + NT[rb + xx] * fy) >> 8 : 0);
      }
    }
    work += N * 3;

    // ---- the things: four digits and two tea-lights
    const fronts = [];
    for (let i = 0; i < 4; i++) {
      const d = +cur[i], spr = SLOTS[i][0][d], [ox, oy2] = origin(i);
      const fr = frontOf(nw[i] !== cur[i], old[i] !== cur[i], s);
      const gain = d === 0 ? 256 - Math.round(30 * (0.5 + 0.5 * sin(TAU * tm / 3.6 + i))) : 256;   // the cat breathes
      addSprite(spr, ox, oy2, fr, gain);
      fronts.push(fr);
    }
    for (let k = 0; k < 2; k++) { const [ox, oy2] = teaOrigin(k); addSprite(TEA, ox, oy2, REST, 256); }

    // ---- the spot meter reads the surfaces (before the air)
    const C = Math.floor(ms / CYC_MS), lt = (ms - C * CYC_MS) / 1000;
    const from = targetAt(C - 1), to = targetAt(C);
    const u = ease.inOutCubic(progress(lt, 0, 1.8)), dw = progress(lt, 1.8, 2.5);
    const lx = clamp(from[0] + (to[0] - from[0]) * u + dw * 0.8 * sin(TAU * tm / 4.5), 6, W - 12);
    const ly = clamp(from[1] + (to[1] - from[1]) * u + dw * 0.6 * cos(TAU * tm / 2.4), 6, H - 6);
    const reading = readAt(lx, ly);

    // ---- the air: steam, plumes, jets, flames
    for (let i = 0; i < 4; i++) {
      const d = +cur[i], spr = SLOTS[i][0][d], [ox, oy2] = origin(i);
      effects(spr.fx, ox, oy2, clamp(fronts[i] / REST, 0, 1) ** 2, 31 * i + d, tm);
      if (nw[i] !== cur[i] && s >= COOL0) release(spr, ox, oy2, s);
    }
    for (let k = 0; k < 2; k++) { const [ox, oy2] = teaOrigin(k); effects(TEA.fx, ox, oy2, 1, 200 + k, tm); }

    // ---- the image: one temperature a pixel through the palette
    const hourShow = prv.h !== f.h && s < SHOW_END;
    const [pOld, pNew, wy] = paletteState(hourShow, s);
    const buf = g.buf, LO = LUT[pOld], LN = LUT[pNew];
    for (let y = 0, i = 0; y < H; y++) {
      const lut = y < wy ? LN : LO;
      for (let x = 0; x < W; x++, i++) { const v = F[i]; buf[i] = lut[v < 0 ? 0 : v > 1023 ? 1023 : v]; }
    }
    g.cost.px += N; work += N * 2;
    if (wy > 0 && wy < H) g.fillRect(0, wy, W, 1, 0xffffff, { a: 0.75 });

    // ---- the overlay
    overlay(g, lx, ly, reading, pOld, pNew, wy);
    g.cost.box += work;
  },
};

function overlay(g, lx, ly, reading, pOld, pNew, wy) {
  // the crosshair: four arms round a gap, white on a dark edge, gliding
  for (const [ux, uy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    g.thickLine(lx + ux * 2, ly + uy * 2, lx + ux * 5.5, ly + uy * 5.5, 2.8, EDGE, { aa: true, a: 0.55 });
    g.thickLine(lx + ux * 2, ly + uy * 2, lx + ux * 5.5, ly + uy * 5.5, 1.0, OSD, { aa: true });
  }
  // the readout and the palette's name
  const r = Math.round(reading * 10) / 10;
  osd(g, "SP", 86, 64, OSD_DIM, EDGE);
  osd(g, `${r.toFixed(1)}°C`, 98, 64, OSD, EDGE);
  const pal = wy > 4 ? pNew : pOld;
  osd(g, VIEWS[pal][0], 86, 72, OSD_DIM, EDGE);
  // the colour scale and its span
  const X = 153, Y0 = 12, Y1 = 67;
  g.rect(X - 1, Y0 - 1, 6, Y1 - Y0 + 2, EDGE);
  for (let y = Y0; y < Y1; y++) {
    g.fillRect(X, y, 4, 1, scaleColour(y < wy ? pNew : pOld, 1 - (y - Y0 + 0.5) / (Y1 - Y0)));
  }
  const sv = VIEWS[wy > 40 ? pNew : pOld];
  osd(g, String(sv[3]), 150, 3, OSD, EDGE);
  osd(g, String(sv[2]), 150, 71, OSD, EDGE);
}
