// Delft: the glass is a stretch of a Dutch kitchen wall in tin-glazed tiles,
// 10 x 5 tiles of 16 px, painted in cobalt. The time is a tile picture set
// into the wall: the hours across two columns of five tiles, the minutes
// across two columns of three, in brushed figures of my own after the
// 17th-century Delft painters (delft-glyphs.js): a dark 'trek' line drawn
// first, a lighter 'dik' wash laid inside by a second brush, a touch
// off-register so a sliver of bare glaze shows, the wash pooling darker
// where the loaded brush first touched, ball and flag terminals, hairlines
// no finer than 3 px. Grout runs through the figures as it does through any
// tableau. Round them the wall goes on: a landscape painted across 6 x 2
// tiles over the minutes (a polder, a harbour, a frozen canal, by the hour)
// and the classic vase of tulips across 2 x 3 tiles.
//
// Always alive, and only the way a tiled wall can be: a window is reflected
// in the glaze and slides across the wall, broken at every joint because no
// two tiles lie in quite the same plane, each glaze shining a little
// differently and glinting where it rolls over a tile's edge; the windmill
// turns; boats, skaters and gulls glide across the tableau tile to tile (in
// eighth-pixel steps); a slow wave of wind nods through the tulips.
//
// Minute: from :59.06 the old figure's tiles are prised out, middle row
// first (so what is left still reads as the old digit), each lifting with a
// flat cast shadow and dropping off the wall, leaving the combed plaster;
// all gone by :59.95. After :00 fresh blank tiles drop into the gap from
// above, bottom row first; at ~:00.5 the pounce dots of the pricked stencil
// give the whole new outline at once, then the trek brush draws the line
// and the dik brush follows with the wash, done by ~:02. Never a wrong digit:
// old tiles only leave before :00, new paint only arrives after.
// Hour: the same for the changed figures, and the field tiles turn over in a
// wave from left to right (old face narrows, the buff clay back with its
// maker's mark swings past, the new set opens), so a warm front sweeps the
// wall and the next picture and vase are up by ~:03. At 23:00 the wave turns
// up night tiles: 'poederblauw', sponged cobalt grounds with the figures
// reserved in white, so the white tiles of the time are the brightest thing
// at 40 % backlight; at 07:00 the day tiles come back the same way.
//
// Palette: Delft's own. Four tin-glaze whites (one per tile, a hair apart),
// one dark cobalt for the line, a wash and a pooled darker wash for the
// figures, a mid and a pale blue for the quieter field painting, a hint of
// manganese on the vase's band, grey grout, buff plaster and clay only
// where tiles are gone or turning, a wooden brush. The reflection lifts
// glaze most, paint a little, plaster not at all. Hard pixels throughout, as
// a painted tile is; coverage steps (four blues between glaze and mid) only
// on things that glide.
//
// Cost: one byte per pixel of palette index is composed each frame from
// byte maps (tiles, glyph maps, pictures; a few integer ops a pixel), then
// one pass through a 8 x 32 colour table with the reflection (charged as box
// work). Once an hour a set of 18 field tiles is cut from the pictures
// (~5k byte ops, outside the canvas, charged to nothing: tiny). Flash:
// glyph maps 2 x 10 x (32x80 + 32x48) x 2 B (class + order) = 82 KB, brush
// paths ~6 KB, sails 32 x 25 x 25 = 20 KB, gliders ~3 KB, pictures painted
// at load (on the device: 3 x (96x32 + 32x48) = 14 KB): ~125 KB.

import { hash, clockFields, to565, R, G, B } from '../js/kit.js';
import { GLYPHS, brushAt } from './delft-glyphs.js';
import { I, NI, NIGHT_MAP, GULLS, FLUYT, BARGE, SKATER_A, SKATER_B, TULIP } from './delft-art.js';
import { TW, TH, HUB, SAILS2, SAIL_BOX, SAIL_STEPS2, paintTableau, VW, paintVase } from './delft-scene.js';

const W = 160, H = 80;

// ------------------------------------------------------------ palette
const RGB = new Int32Array(NI).fill(0xff00ff);
RGB[I.GROUT] = 0xcdc9bd;
RGB[I.G0] = 0xe3e8e8; RGB[I.G0 + 1] = 0xe8e9e2; RGB[I.G0 + 2] = 0xdfe5ea; RGB[I.G0 + 3] = 0xe6e8e1;
RGB[I.TREK] = 0x1b2a72; RGB[I.WASH] = 0x6584cf; RGB[I.MID] = 0x5a78c4; RGB[I.LIGHT] = 0xadbee3; RGB[I.MANG] = 0x6a4672;
RGB[I.PLASTER] = 0xaa9f8b; RGB[I.PLASTER2] = 0x968b77; RGB[I.SHADOW] = 0x6c6354; RGB[I.POUNCE] = 0x47474e;
RGB[I.P0] = 0x2b4797; RGB[I.P1] = 0x233c86; RGB[I.NW] = 0xe3e8ec; RGB[I.NL] = 0x8aa0da;
RGB[I.POOL] = 0x4566bd; RGB[I.BISCUIT] = 0xcf9c6a; RGB[I.BISCUIT2] = 0xb88553; RGB[I.WOOD] = 0x8a6440; RGB[I.FERRULE] = 0x9a9aa2;
const mixc = (a, b, u) => ((R(a) + (R(b) - R(a)) * u) << 16) | ((G(a) + (G(b) - G(a)) * u) << 8) | (B(a) + (B(b) - B(a)) * u);
const GL = RGB[I.G0];
RGB[I.M1] = mixc(GL, RGB[I.MID], 0.25); RGB[I.M2] = mixc(GL, RGB[I.MID], 0.5); RGB[I.M3] = mixc(GL, RGB[I.MID], 0.75);
RGB[I.L1] = mixc(GL, RGB[I.LIGHT], 0.5);
RGB[I.NM1] = mixc(RGB[I.P0], RGB[I.NW], 0.25); RGB[I.NM2] = mixc(RGB[I.P0], RGB[I.NW], 0.5); RGB[I.NM3] = mixc(RGB[I.P0], RGB[I.NW], 0.75);
RGB[I.NL1] = mixc(RGB[I.P0], RGB[I.NL], 0.5);
// how much the window's reflection lifts each material: glaze most, paint a little, plaster not at all
const GLOSS = new Float32Array(NI).fill(0.3);
for (let k = 0; k < 4; k++) GLOSS[I.G0 + k] = 0.9;
GLOSS[I.PLASTER] = GLOSS[I.PLASTER2] = GLOSS[I.SHADOW] = GLOSS[I.POUNCE] = 0; GLOSS[I.GROUT] = 0.2;
GLOSS[I.NW] = 0.6; GLOSS[I.WOOD] = GLOSS[I.BISCUIT] = GLOSS[I.BISCUIT2] = 0;
const NL = 8, SKY = 0xfdfcf6;
const LUT = new Uint16Array(NL * NI);
for (let l = 0; l < NL; l++) for (let i = 0; i < NI; i++) LUT[l * NI + i] = to565(mixc(RGB[i], SKY, (l / (NL - 1)) * GLOSS[i]));

// ------------------------------------------------------------ the wall
const TINT = new Uint8Array(50), TDX = new Int16Array(50), TDY = new Int8Array(50), GAIN = new Uint8Array(50);
for (let c = 0; c < 50; c++) {
  TINT[c] = hash(c, 7) & 3;
  TDX[c] = (hash(c, 8) % 17) - 8;           // no two tiles lie in quite the same plane: the reflection breaks at every joint
  TDY[c] = (hash(c, 9) % 5) - 2;
  GAIN[c] = 5 + (hash(c, 10) % 4);          // and each glaze shines a little differently (x/8)
}
// digit slots: hours 2 x 5 tiles at the left, minutes 2 x 3 tiles at the bottom right
const SLOTS = [
  { tx: 0, ty: 0, cols: 2, rows: 5, s: 'H' }, { tx: 2, ty: 0, cols: 2, rows: 5, s: 'H' },
  { tx: 6, ty: 2, cols: 2, rows: 3, s: 'M' }, { tx: 8, ty: 2, cols: 2, rows: 3, s: 'M' },
];
// field tiles: a vase of tulips across 2 x 3 tiles between hours and
// minutes, and the tableau, a landscape across 6 x 2 tiles over the minutes
const SINGLES = [24, 25, 34, 35, 44, 45];
const VX0 = 64, VY0 = 32;                        // the vase panel's corner on the glass
const TAB = [4, 5, 6, 7, 8, 9, 14, 15, 16, 17, 18, 19];
const SCN = SINGLES.concat(TAB), NS = SINGLES.length;
const TX0 = 64;                                  // the tableau's left edge on the glass

// ------------------------------------------------------------ the hour's set of field tiles
const SETS = new Map();
const KINDS = ['polder', 'harbour', 'winter'];
function setFor(hk, h) {
  let S = SETS.get(hk);
  if (S) return S;
  const night = h >= 23 || h < 7;
  const kind = KINDS[((hk % 3) + 3) % 3];
  const vase = paintVase(((hk % 3) + 3) % 3, (k) => I.G0 + TINT[SINGLES[k]]);
  const tab = paintTableau(kind, (k) => I.G0 + TINT[TAB[k]]);
  const tiles = [];
  for (let j = 0; j < SCN.length; j++) {
    const c = SCN[j];
    let t;
    t = new Uint8Array(256);
    if (j < NS) {
      const ox = (j % 2) * 16, oy = ((j / 2) | 0) * 16;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) t[y * 16 + x] = x === 15 || y === 15 ? I.GROUT : vase.img[(oy + y) * VW + ox + x];
    } else {
      const k = j - NS, ox = (k % 6) * 16, oy = ((k / 6) | 0) * 16;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) t[y * 16 + x] = x === 15 || y === 15 ? I.GROUT : tab[(oy + y) * TW + ox + x];
    }
    if (night) {                              // poederblauw: sponged ground, figures reserved white
      const ox = (c % 10) * 16, oy = ((c / 10) | 0) * 16;
      for (let k = 0; k < 256; k++) {
        let v = NIGHT_MAP[t[k]];
        if (v === I.P0 && (hash(ox + (k & 15), oy + (k >> 4), 5) & 7) < 3) v = I.P1;
        t[k] = v;
      }
    }
    tiles.push(t);
  }
  S = { night, kind, tiles, heads: vase.heads };
  SETS.set(hk, S);
  if (SETS.size > 4) SETS.delete(SETS.keys().next().value);
  return S;
}

// ------------------------------------------------------------ timing of a digit's turn
const REM0 = 59.06, RANK = 0.16, COLD = 0.08, KOFF = 0.03, LIFT = 0.12, GF = 2600;
const IN0 = 0, ROWD = 0.03, GI = 3000, BOUNCE = 0.08, Y0 = -18;
const DOTS = 0.1, TREK_D = 0.85, DIK_LAG = 0.3, DIK_D = 0.8;
const FLIP0 = 0.3, FLIP_D = 0.9;
// a tile's back: unglazed buff clay, speckled, with the maker's mark pressed in
const BACK = new Uint8Array(256);
for (let k = 0; k < 256; k++) BACK[k] = (k & 15) === 15 || k >> 4 === 15 ? I.GROUT : (hash(k, 77) & 7) < 2 ? I.BISCUIT2 : I.BISCUIT;
for (const [x, y] of [[6, 6], [7, 6], [8, 6], [6, 7], [8, 7], [6, 8], [7, 8], [8, 8]]) BACK[y * 16 + x] = I.BISCUIT2;

const idx = new Uint8Array(W * H);
let ops = 0;

const plasterAt = (x, y) => (((x + 2 * y) % 5) === 0 ? I.PLASTER2 : I.PLASTER);
function plasterCell(c) {
  const ox = (c % 10) * 16, oy = ((c / 10) | 0) * 16;
  for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) idx[(oy + y) * W + ox + x] = plasterAt(ox + x, oy + y);
  ops += 225;
}

/** A digit tile's pixel: glyph fragment painted fully, or blank glaze. */
function tilePix(Gl, cx, cy, lx, ly, blank, glaze) {
  if (blank) return glaze;
  const v = Gl.cls[(cy * 16 + ly) * 32 + cx * 16 + lx] & 7;
  return v === 1 ? I.TREK : v === 2 ? I.WASH : v === 4 ? I.POOL : glaze;
}

/** A loose tile at top-left (x, y), turned by `ang` radians, sampled nearest. */
function looseTile(Gl, cx, cy, blank, glaze, x, y, ang) {
  if (ang === 0) {
    const x0 = Math.round(x), y0 = Math.round(y);
    for (let ly = 0; ly < 15; ly++) {
      const yy = y0 + ly;
      if (yy < 0 || yy >= H) continue;
      for (let lx = 0; lx < 15; lx++) {
        const xx = x0 + lx;
        if (xx >= 0 && xx < W) idx[yy * W + xx] = tilePix(Gl, cx, cy, lx, ly, blank, glaze);
      }
    }
    ops += 225 * 2;
    return;
  }
  const mx = x + 7.5, my = y + 7.5, co = Math.cos(ang), si = Math.sin(ang);
  const x0 = Math.max(0, Math.floor(mx - 11)), x1 = Math.min(W - 1, Math.ceil(mx + 11));
  const y0 = Math.max(0, Math.floor(my - 11)), y1 = Math.min(H - 1, Math.ceil(my + 11));
  for (let yy = y0; yy <= y1; yy++)
    for (let xx = x0; xx <= x1; xx++) {
      const dx = xx + 0.5 - mx, dy = yy + 0.5 - my;
      const sx = co * dx + si * dy + 7.5, sy = -si * dx + co * dy + 7.5;
      if (sx < 0 || sy < 0 || sx >= 15 || sy >= 15) continue;
      idx[yy * W + xx] = tilePix(Gl, cx, cy, sx | 0, sy | 0, blank, glaze);
    }
  ops += (x1 - x0 + 1) * (y1 - y0 + 1) * 6;
}

function shadowRect(x, y) {
  const x0 = Math.round(x), y0 = Math.round(y);
  for (let ly = 0; ly < 15; ly++) for (let lx = 0; lx < 15; lx++) {
    const xx = x0 + lx, yy = y0 + ly;
    if (xx >= 0 && xx < W && yy >= 0 && yy < H) idx[yy * W + xx] = I.SHADOW;
  }
}

/** The painters' brushes: a fine one for the line, a broad one for the wash. */
function brush(x, y, tip, broad) {
  const bx = Math.round(x), by = Math.round(y);
  const put = (px, py, v) => { if (px >= 0 && px < W && py >= 0 && py < H) idx[py * W + px] = v; };
  // handle up and to the right, the ferrule, the loaded tip
  for (let k = 3; k < 13; k++) { put(bx + 1 + (k >> 1), by - k, I.WOOD); put(bx + 2 + (k >> 1), by - k, I.WOOD); }
  put(bx + 1, by - 2, I.FERRULE); put(bx + 2, by - 2, I.FERRULE); put(bx + 1, by - 3, I.FERRULE);
  put(bx, by, tip); put(bx + 1, by, tip); put(bx, by - 1, tip); put(bx + 1, by - 1, tip);
  if (broad) { put(bx - 1, by, tip); put(bx - 1, by - 1, tip); put(bx, by + 1, tip); put(bx + 1, by - 2, tip); }
}

// one field tile's pixels, from the set's static image, squashed to width wf by a turn
function fieldCell(c, t, wf) {
  const ox = (c % 10) * 16, oy = ((c / 10) | 0) * 16;
  if (wf >= 1) {
    for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) idx[(oy + y) * W + ox + x] = t[y * 16 + x];
    ops += 225;
    return;
  }
  plasterCell(c);
  const half = 7.5 * wf, iw = 1 / Math.max(wf, 0.05);
  for (let x = 0; x < 15; x++) {
    const d = x + 0.5 - 7.5;
    if (d < -half || d > half) continue;
    const sx = Math.min(14, Math.max(0, Math.floor(7.5 + d * iw)));
    const edge = wf < 0.35 && (d < -half + 1 || d > half - 1);
    for (let y = 0; y < 15; y++) idx[(oy + y) * W + ox + x] = edge ? I.BISCUIT2 : t[y * 16 + sx];
  }
  ops += 225 * 2;
}

/** The tulip heads nod in a slow wave of wind that runs through the bunch. */
function tulips(S, tday, cellSet, want) {
  const map = S.night ? NIGHT_MAP : null;
  S.heads.forEach(([hx, hy], i) => {
    const x = hx + 0.9 * Math.sin(tday * 1.3 - i * 0.7), xi = Math.floor(x), m = TULIP.phases[Math.floor((x - xi) * 8) & 7];
    for (let j = 0; j < TULIP.h; j++)
      for (let k = 0; k < TULIP.w; k++) {
        const v = m[j * TULIP.w + k], px = xi + k, py = hy + j;
        if (v < 0 || (px & 15) === 15 || (py & 15) === 15 || px < 0 || px >= VW) continue;
        if (cellSet[((VY0 + py) >> 4) * 10 + ((VX0 + px) >> 4)] !== want) continue;
        idx[(VY0 + py) * W + VX0 + px] = map ? map[v] : v;
      }
  });
  ops += 5 * 56 * 2;
}

/** Put a tableau pixel (tableau coords) if its tile shows set `want` and it is not grout. */
function tput(x, y, v, map, cellSet, want) {
  if (x < 0 || x >= TW || y < 0 || y >= TH || (x & 15) === 15 || (y & 15) === 15) return;
  if (cellSet[(y >> 4) * 10 + 4 + (x >> 4)] !== want) return;
  idx[y * W + TX0 + x] = map ? map[v] : v;
}
/** An actor gliding over the tableau at x (float), top y. */
function glide(A, x, y, map, cellSet, want) {
  const xi = Math.floor(x), m = A.phases[Math.floor((x - xi) * 8) & 7];
  for (let j = 0; j < A.h; j++)
    for (let i = 0; i < A.w; i++) {
      const v = m[j * A.w + i];
      if (v >= 0) tput(xi + i, y + j, v, map, cellSet, want);
    }
  ops += A.w * A.h * 2;
}
function tableauLife(S, tday, cellSet, want) {
  const map = S.night ? NIGHT_MAP : null;
  const wrap = (v, lo, hi) => lo + (((v - lo) % (hi - lo)) + (hi - lo)) % (hi - lo);
  if (S.kind !== 'harbour') {                 // the windmill turns, a turn every 9 s
    const m = SAILS2[Math.floor((tday / 9) * 4 * SAIL_STEPS2) % SAIL_STEPS2];
    const x0 = Math.round(HUB[0] - SAIL_BOX / 2), y0 = Math.round(HUB[1] - SAIL_BOX / 2);
    for (let y = 0; y < SAIL_BOX; y++) for (let x = 0; x < SAIL_BOX; x++) { const v = m[y * SAIL_BOX + x]; if (v >= 0) tput(x0 + x, y0 + y, v, map, cellSet, want); }
    ops += SAIL_BOX * SAIL_BOX;
  }
  if (S.kind === 'polder') glide(BARGE, wrap(tday * 2.2, -10, 62), 18, map, cellSet, want);
  else if (S.kind === 'harbour') glide(FLUYT, wrap(tday * 3.2, -16, 100), 12, map, cellSet, want);
  else {
    glide(Math.floor(tday * 1.5) & 1 ? SKATER_B : SKATER_A, wrap(tday * 6, -10, 60), 18, map, cellSet, want);
    glide(Math.floor(tday * 1.5 + 0.5) & 1 ? SKATER_A : SKATER_B, wrap(tday * 4.5 + 30, -10, 60), 19, map, cellSet, want);
  }
  // two gulls cross the sky, slowly, wings beating
  for (let k = 0; k < 2; k++) {
    const x = wrap(-tday * (3 + k) + k * 47, -8, TW + 4), y = 2 + k * 3 + Math.round(Math.sin(tday * 0.7 + k) * 0.6);
    glide(GULLS[[0, 1, 2, 1][Math.floor(tday * 5 + k * 2) & 3]], x, y, map, cellSet, want);
  }
}

// ------------------------------------------------------------ the window's reflection on the glaze
// A window with two panes and a transom, seen in the glaze, sliding left to
// right; quarter-pixel units, period 800 (200 px).
const BAND = new Uint8Array(800);
{
  const pane = (a, b, lvl) => { for (let v = a; v < b; v++) { const e = Math.min(v - a, b - 1 - v); BAND[v] = Math.max(BAND[v], Math.min(lvl, Math.round((e + 1) * lvl / 9))); } };
  pane(0, 46, 7); pane(54, 100, 7); pane(330, 350, 3);
  for (let v = 46; v < 54; v++) BAND[v] = 1;
}
const SPEED4 = 44;   // qpx/s (11 px/s); 86400 * 44 is a whole number of periods: no jump at midnight

export default {
  name: 'Delft',
  blurb: 'A wall of Delft tiles: the time is a tile picture in cobalt brushwork; each minute its tiles are prised out, fresh ones set and painted.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey;
    const tday = f.h * 3600 + f.m * 60 + s;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    ops = 0;
    const prv = clockFields(new Date(ctx.date.getTime() - 60000));
    const nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm, was = prv.hh + prv.mm, will = nxt.hh + nxt.mm;

    // ---- the field tiles: this hour's set, and in the hour's first seconds the flip from the last
    const hk = Math.floor(mk / 60);
    const S1 = setFor(hk, f.h), hourShow = prv.h !== f.h && s < 4;
    const S0 = hourShow ? setFor(hk - 1, prv.h) : S1;
    const cellSet = new Uint8Array(50);     // 1 old set, 2 new set, 0 mid-flip
    for (let j = 0; j < SCN.length; j++) {
      const c = SCN[j];
      let wf = 1, t = S1.tiles[j], which = 2;
      if (hourShow) {
        const u = (s - (FLIP0 + ((c % 10) - 4) * 0.28 + ((c / 10) | 0) * 0.12)) / FLIP_D;
        // the tile turns over: its old face narrows, its clay back swings past, the new face opens
        if (u <= 0) { t = S0.tiles[j]; which = 1; }
        else if (u < 1) {
          which = 0;
          if (u < 1 / 3) { wf = Math.cos(u * 1.5 * Math.PI); t = S0.tiles[j]; }
          else if (u < 2 / 3) { wf = Math.sin((u - 1 / 3) * 3 * Math.PI); t = BACK; }
          else { wf = Math.sin((u - 2 / 3) * 1.5 * Math.PI); t = S1.tiles[j]; }
        }
      }
      cellSet[c] = which;
      fieldCell(c, t, wf);
    }
    tableauLife(S1, tday, cellSet, 2); tulips(S1, tday, cellSet, 2);
    if (hourShow) { tableauLife(S0, tday, cellSet, 1); tulips(S0, tday, cellSet, 1); }

    // ---- the digit tiles
    const loose = [], brushes = [];
    let kOutN = 0, kInN = 0;
    for (let k = 0; k < 4; k++) {
      const SL = SLOTS[k], GS = GLYPHS[SL.s];
      const out = s >= REM0 && will[k] !== cur[k], inn = s < 4 && was[k] !== cur[k];
      const Gc = GS[+cur[k]];
      const kOff = out ? KOFF * kOutN++ : inn ? KOFF * kInN++ : 0;
      // painting progress for a fresh digit
      let pDots = 2, trekO = 256, dikO = 256;
      if (inn) {
        const done = IN0 + kOff + (SL.rows - 1) * ROWD + 0.035 + Math.sqrt((2 * -Y0) / GI) + BOUNCE - 0.04;
        pDots = (s - done) / DOTS;
        const pt = Math.min(1, Math.max(0, (s - done - 0.08) / TREK_D)), pd = Math.min(1, Math.max(0, (s - done - 0.08 - DIK_LAG) / DIK_D));
        trekO = Math.round(pt * 256); dikO = Math.round(pd * 256);
        if (pt > 0 && pt < 1) { const [bx, by] = brushAt(Gc, pt); brushes.push([SL.tx * 16 + bx, SL.ty * 16 + by, I.TREK, false]); }
        if (pd > 0 && pd < 1) { const [bx, by] = brushAt(Gc, pd); brushes.push([SL.tx * 16 + bx, SL.ty * 16 + by, I.WASH, true]); }
      }
      for (let cy = 0; cy < SL.rows; cy++)
        for (let cx = 0; cx < SL.cols; cx++) {
          const c = (SL.ty + cy) * 10 + SL.tx + cx, ox = (c % 10) * 16, oy = ((c / 10) | 0) * 16, glaze = I.G0 + TINT[c];
          let place = true;
          if (out) {
            const rank = Math.floor(Math.abs(cy - (SL.rows - 1) / 2));
            const e = s - (REM0 + kOff + rank * RANK + cx * COLD);
            if (e >= 0) {
              place = false;
              const dir = (cx ? 1 : -1) * (hash(c, mk) & 1 ? 1 : 0.6);
              if (e < LIFT) loose.push([Gc, cx, cy, false, glaze, ox - 1, oy - 1, 0, true]);
              else {
                const tf = e - LIFT;
                const y = oy - 1 + 0.5 * GF * tf * tf;
                if (y < H + 4) loose.push([Gc, cx, cy, false, glaze, ox - 1 + dir * 14 * tf, y, dir * 2.2 * tf, false]);
              }
            }
          } else if (inn) {
            const rb = SL.rows - 1 - cy, e = s - (IN0 + kOff + rb * ROWD + cx * 0.035);
            const df = Math.sqrt((2 * (oy - Y0)) / GI);
            if (e < df + BOUNCE) {
              place = false;
              if (e >= 0) {
                const y = e < df ? Y0 + 0.5 * GI * e * e : oy - 1.4 * Math.sin((Math.PI * (e - df)) / BOUNCE);
                loose.push([Gc, cx, cy, true, glaze, ox, y, 0, false]);
              }
            }
          }
          if (!place) { plasterCell(c); continue; }
          // the tile in its place: its fragment, painted as far as the brushes have got
          for (let ly = 0; ly < 15; ly++) {
            const row = (cy * 16 + ly) * 32 + cx * 16, o = (oy + ly) * W + ox;
            for (let lx = 0; lx < 15; lx++) {
              const v = Gc.cls[row + lx], od = Gc.ord[row + lx], cl = v & 7;
              let id = glaze;
              if (cl === 1 && od < trekO) id = I.TREK;
              else if ((cl === 2 || cl === 4) && od < dikO) id = cl === 4 ? I.POOL : I.WASH;
              else if (v & 8 && pDots > (hash(row + lx, k) & 255) / 256) id = I.POUNCE;
              idx[o + lx] = id;
            }
          }
          ops += 225 * 3;
        }
    }
    // the grout between all tiles
    for (let y = 15; y < H; y += 16) idx.fill(I.GROUT, y * W, y * W + W);
    for (let y = 0; y < H; y++) for (let x = 15; x < W; x += 16) idx[y * W + x] = I.GROUT;
    // loose tiles (lifted ones cast a flat shadow), then the brushes
    for (const L of loose) {
      if (L[8]) shadowRect(L[5] + 2, L[6] + 2);
      looseTile(L[0], L[1], L[2], L[3], L[4], L[5], L[6], L[7]);
    }
    for (const b of brushes) brush(b[0], b[1], b[2], b[3]);

    // ---- colour: every index through the palette, lifted by the reflection where the window falls
    const buf = g.buf, pos4 = Math.floor((tday * SPEED4) % 800);
    const nightGain = ctx.night > 0 ? 1 - 0.5 * ctx.night : 1;
    for (let ty = 0; ty < 5; ty++)
      for (let tx = 0; tx < 10; tx++) {
        const c = ty * 10 + tx, gain = Math.round(GAIN[c] * nightGain * 32), tdx = TDX[c], tdy = TDY[c];
        for (let y = ty * 16; y < ty * 16 + 16; y++) {
          const transom = ((y + tdy) >> 1) === 13, topEdge = (y & 15) === 0;
          for (let x = tx * 16, i = y * W + x; x < tx * 16 + 16; x++, i++) {
            let v = 4 * x + y + tdx - pos4 + 800;
            if (v >= 800) v -= 800;
            if (v >= 800) v -= 800;
            let lvl = (BAND[v] * gain) >> 8;
            if (transom) lvl >>= 2;
            // the glaze rolls over at a tile's top and left edge: there the window glints full
            else if (lvl >= 4 && (topEdge || (x & 15) === 0)) lvl = 7;
            buf[i] = LUT[lvl * NI + idx[i]];
          }
        }
      }
    g.cost.px += W * H; g.cost.box += W * H * 8 + ops;
  },
};
