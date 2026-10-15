// Black-figure: the glass is the frieze of an Attic amphora, c. 530 BC. The
// numerals are the figures painted on it in black slip, standing on the
// groundline between a meander on the shoulder and a band of galloping
// horsemen below; Athena's owl stands between hours and minutes. Each digit
// is a figure whose body and gear are the numeral's strokes (glyphs.js): a
// hoplite behind his round shield is 0, a robed elder 1, a swan 2, a bearded
// serpent 3, an aulos player (his pipes the diagonal) 4, a kneeling spearman
// 5, a crouching hoplite whose crest sweeps over 6, a javelin thrower 7, a
// hoplite behind a Boeotian shield 8, a hoplite striding from under his
// raised shield 9. Details are incised to bare clay, with added red and white.
//
// Always alive: the horsemen gallop along the lower band a pixel a frame,
// crests sway, the elder gestures, the swan dips its head, the piper plays,
// the serpent's tongue flickers, the owl blinks and glances about.
// Minute turn: the painter's own process. A sea sponge dabs the old figure
// off the unfired pot (it fades as a whole, so a half-wiped figure is never
// part of another numeral), leaving wet clay that dries back; it is gone by
// :00. Then the painter lays a thin sketch of the whole new figure, fills it
// with slip stroke by stroke, the graver scratches the incisions, and the
// added colours go on. The owl watches the brush. Changed digits are painted
// in turn, alternating hours and minutes, so neither pair is blank for long.
// Hour: the vase turns beneath the figures. The ground (the bands, the big
// palmette under the handle, the horsemen) scrolls 320 px past while the
// numerals and the owl stay pinned to the glass. It is a bilingual amphora:
// where the handle line passes, the technique flips, black-figure for even
// hours, red-figure (the same drawings reserved in clay on a black glaze)
// for odd. The numerals still change only by sponge and brush, so no number
// is ever cut off at an edge. At midnight the hours are blank ~0.3 s, the
// minutes ~0.9 s.
// A slow glint runs along the glaze every few seconds: two flat steps, no shading.
//
// Palette: the potter's own few materials. Attic clay orange (the field),
// black slip (warm, not neutral), incisions in bare clay, added red (a
// purple-red) and added white; wet and damp clay for the sponge. Red-figure
// swaps ground and figure through the same tables, on a deep warm glaze
// black, so the dark is the vase's glaze, never the panel's grey. Night
// dims the backlight; the clay figures still carry the time.
//
// Hard pixels for everything drawn on the pot (the figures' big curves are
// 4x4 supersampled once, so their edges are clean while still exact codes);
// AA only for the painter's tools, which glide.
//
// Cost: every pixel is a byte code looked up in a 32-entry palette. Per
// frame: copy the scene codes, stamp four figure maps (~2.1k px each), lay
// the small sway rasters over them, one palette pass, the horsemen. The hour
// scroll blends two palette lookups per pixel. Nothing is built per minute;
// all maps are made at load (flash on the device, ~225 KB).

import { to565, clockFields, hash, rand, sin } from '../js/kit.js';
import { GLYPHS, BASE, SWAY, SWAY_N, MW, MH, MOX, MOY } from './blackfigure-glyphs.js';
import { INC, RED, WHT } from './blackfigure-raster.js';
import { W, H, N, BANDS, PINNED, HANDLE, OWL_X, OWL_Y, OWL_EYES, HORSE, HORSE_DY } from './blackfigure-scene.js';

const WET = 20, DAMP = 21, SKETCH = 26;

// ------------------------------------------------------------ palettes (flash)
const CLAY = 0xd8763a, SLIP = 0x1c1412, GLAZE = 0x24150f;
const mixc = (a, b, u) => {
  const r = ((a >> 16) & 255) * (1 - u) + ((b >> 16) & 255) * u;
  const g = ((a >> 8) & 255) * (1 - u) + ((b >> 8) & 255) * u;
  const bl = (a & 255) * (1 - u) + (b & 255) * u;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};
function palette(ground, figure, inc, red, wht, wet, damp, glazeCode, sketch) {
  const p = new Uint16Array(32);
  for (let i = 0; i <= 16; i++) p[i] = to565(mixc(ground, figure, i / 16));
  p[INC] = to565(inc); p[RED] = to565(red); p[WHT] = to565(wht);
  p[WET] = to565(wet); p[DAMP] = to565(damp); p[22] = to565(mixc(ground, figure, 0.07));
  // the glint lifts the glaze black toward a warm grey-brown, two flat steps
  const glaze = glazeCode ? figure : ground;
  p[23] = to565(mixc(glaze, 0x8a7060, 0.34)); p[24] = to565(mixc(glaze, 0x8a7060, 0.16));
  p[26] = to565(sketch);
  p[25] = glazeCode;   // not a colour: which code is the glaze (16 slip in black-figure, 0 ground in red-figure)
  return p;
}
// black-figure: slip on clay, incisions show the clay; red-figure: the same
// drawing reserved in clay on a black ground, relief lines in black
const PAL = [
  palette(CLAY, SLIP, 0xe8925a, 0x8e2a1e, 0xf2e4c8, 0xa8582a, 0xc2672f, 16, 0x5a2814),
  palette(GLAZE, CLAY, GLAZE, 0x9a3020, 0xf2dcb4, 0x3e2619, 0x2e1c13, 0, 0xa8603a),
];
const techOf = (h) => h & 1;

// ------------------------------------------------------------ layout and timing
const SLOT_X = [4, 36, 94, 126], SLOT_Y = 12;
const WIPE0 = 58.7, WIPE1 = 59.94, WD = WIPE1 - WIPE0, DRY = 0.5;
const PAINT0 = 0.08, PAINT1 = 2.8;
const PH_S = 0.1, PH_K = 0.66, PH_I = 0.86;      // job phases: sketch, slip, incision, added colour
const TURN0 = 58.7, TURN_T = 2.3, TURN_D = 320;  // the hour: the ground turns; the handle line crosses the glass ~59.4 to ~0.05
const ORDER = [0, 2, 1, 3];                      // paint order: an hour digit, a minute digit, ...
const GLINT_P = 9.3, GLINT_T = 2.6;              // a glint every 9.3 s, 2.6 s across
const GLINT1 = 23, GLINT2 = 24, GLAZE_CODE = 25; // palette slots: glint core, glint edge, which code is the glaze

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
// the sponge's path over a glyph box: five strokes back and forth, top to bottom
const SP = [];
for (let r = 0; r < 5; r++) {
  const y = 9 + r * 10.5, a = r & 1 ? 35 : 3, b = r & 1 ? 3 : 35;
  SP.push([a, y], [b, y + 2]);
}
const SPL = [];
let spTot = 0;
for (let i = 1; i < SP.length; i++) { const l = Math.hypot(SP[i][0] - SP[i - 1][0], SP[i][1] - SP[i - 1][1]); SPL.push(l); spTot += l; }
function spongeAt(u) {
  let d = Math.max(0, Math.min(1, u)) * spTot;
  for (let i = 0; i < SPL.length; i++) {
    if (d <= SPL[i] || i === SPL.length - 1) { const v = Math.min(1, d / SPL[i]); return [SP[i][0] + (SP[i + 1][0] - SP[i][0]) * v, SP[i][1] + (SP[i + 1][1] - SP[i][1]) * v]; }
    d -= SPL[i];
  }
  return SP[SP.length - 1];
}
// where the sponge first reaches each pixel of a glyph box (0..255), a little ragged
const WKEY = new Uint8Array(MW * MH).fill(255);
for (let n = 0; n <= 600; n++) {
  const [cx, cy] = spongeAt(n / 600), key = Math.floor((n / 600) * 250);
  for (let j = Math.floor(cy - 8); j <= cy + 8; j++)
    for (let i = Math.floor(cx - 8); i <= cx + 8; i++) {
      if (i < 0 || j < 0 || i >= MW || j >= MH) continue;
      const r = 5.6 + rand(i, j, 7) * 1.6;
      if ((i + 0.5 - cx) ** 2 + (j + 0.5 - cy) ** 2 < r * r && key < WKEY[j * MW + i]) WKEY[j * MW + i] = key;
    }
}
// anything the strokes miss (a crest tip above the box) goes with the first stroke
for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) if (WKEY[j * MW + i] === 255) WKEY[j * MW + i] = Math.min(250, Math.floor((i / MW) * 50 + (j / MH) * 200));
// The slip lifts in dabs all over the figure, only a little ahead where the
// sponge is: a half-wiped figure is a faded whole, never part of a numeral
// (the lower loop of an 8 alone would read 0).
for (let j = 0; j < MH; j++)
  for (let i = 0; i < MW; i++) {
    const n = (rand(i >> 2, j >> 2, 9) * 0.6 + rand(i >> 1, j >> 1, 10) * 0.4) * 250;
    WKEY[j * MW + i] = Math.floor(WKEY[j * MW + i] * 0.25 + n * 0.75);
  }
// The painter's preliminary sketch: the whole figure's outline, laid first, so
// a half-painted figure still reads as its own numeral (a 9's shield alone
// would read 0). Outline: slip pixels with a bare neighbour.
const SKETCHES = GLYPHS.map((gl) => {
  const m = new Uint8Array(MW * MH), on = (i, j) => i >= 0 && j >= 0 && i < MW && j < MH && gl.k[j * MW + i] >= 8;
  for (let j = 0; j < MH; j++)
    for (let i = 0; i < MW; i++)
      if (on(i, j) && (!on(i - 1, j) || !on(i + 1, j) || !on(i, j - 1) || !on(i, j + 1))) m[j * MW + i] = 1;
  return m;
});

const FR = new Uint8Array(N);
const SPONGE = 0xb5813f, PORES = [[-4, 0], [-1, -2], [1, 1], [3, -2], [4, 1], [-2, 2], [2, -3]];

// ------------------------------------------------------------ stamping glyphs into a code map

let costBox = 0;
function stampWhole(map, gl, sx, sy) {
  const x0 = sx - MOX, y0 = sy - MOY;
  for (let j = 0; j < MH; j++) {
    const row = (y0 + j) * W + x0, gr = j * MW;
    for (let i = 0; i < MW; i++) {
      const k = gr + i, o = gl.o[k], v = gl.k[k];
      if (o) map[row + i] = o;
      else if (v) { const c = map[row + i]; if (c > 16 || v > c) map[row + i] = v; }
    }
  }
  costBox += MW * MH * 3;
}

/** The old figure being sponged off, then drying: `tr` seconds since the sponge began. */
function stampWipe(map, gl, sx, sy, tr) {
  const x0 = sx - MOX, y0 = sy - MOY, kt = (tr / WD) * 256;
  for (let j = 0; j < MH; j++) {
    const row = (y0 + j) * W + x0, gr = j * MW;
    for (let i = 0; i < MW; i++) {
      const k = gr + i, o = gl.o[k], v = gl.k[k];
      if (!o && !v) continue;
      const key = WKEY[k];
      if (key >= kt) {
        if (o) map[row + i] = o;
        else { const c = map[row + i]; if (c > 16 || v > c) map[row + i] = v; }
        continue;
      }
      if ((v < 6 && !o) || y0 + j < 8) continue;
      // wiped: the clay is wet, darker, and dries back over DRY seconds
      const age = tr - (key / 256) * WD, q = age / DRY;
      if (q >= 1) continue;
      const c = map[row + i];
      if (c && c <= 16) continue;
      map[row + i] = q < 0.35 ? WET : (q - 0.35) / 0.65 * 16 < BAYER[((j & 3) << 2) | (i & 3)] ? DAMP : 0;
    }
  }
  costBox += MW * MH * 4;
}

/** The new figure being painted: u 0..1 through its job (slip, then incisions, then colour). */
function stampPaint(map, gl, sk, sx, sy, u) {
  const x0 = sx - MOX, y0 = sy - MOY;
  const pK = u >= PH_K ? 999 : u < PH_S ? -1 : ((u - PH_S) / (PH_K - PH_S)) * 262;
  const pS = (u / PH_S) * 16;
  const pI = u < PH_K ? -1 : u >= PH_I ? 999 : ((u - PH_K) / (PH_I - PH_K)) * 256;
  const pC = u < PH_I ? -1 : ((u - PH_I) / (1 - PH_I)) * 256;
  for (let j = 0; j < MH; j++) {
    const row = (y0 + j) * W + x0, gr = j * MW;
    for (let i = 0; i < MW; i++) {
      const k = gr + i, o = gl.o[k];
      let v = gl.k[k];
      if (!o && !v) continue;
      if (sk[k] && gl.ordK[k] >= pK - 6 && BAYER[((j & 3) << 2) | (i & 3)] < pS) {
        // the sketch line, until the slip covers it
        const d = pK - gl.ordK[k];
        if (d < 6) { const c = map[row + i]; if (!c || c > 16) map[row + i] = SKETCH; continue; }
      }
      if (v) {
        const d = pK - gl.ordK[k];
        if (d <= 0) v = 0; else if (d < 6) v = ((v * d) / 6) | 0;   // the brush's soft leading edge
      }
      let out = v;
      if (o === INC) { if (v >= 12 && gl.ordO[k] < pI) out = INC; }
      else if (o) { if (gl.ordO[k] < pC) out = o; }
      if (!out) continue;
      const c = map[row + i];
      if (out > 16 || c > 16 || out > c) map[row + i] = out;
    }
  }
  costBox += MW * MH * 5;
}

/** A swaying part (crest, arm, spear, tongue) laid over the still figure. */
function stampSway(map, sw, sx, sy) {
  const x0 = sx - MOX + sw.x0, y0 = sy - MOY + sw.y0;
  for (let j = 0; j < sw.h; j++) {
    const row = (y0 + j) * W + x0, gr = j * sw.w;
    for (let i = 0; i < sw.w; i++) {
      const k = gr + i, o = sw.o[k], v = sw.k[k];
      if (o) map[row + i] = o;
      else if (v) { const c = map[row + i]; if (c > 16 || v > c) map[row + i] = v; }
    }
  }
  costBox += sw.w * sw.h * 3;
}

/** How each figure moves while it stands, -1..1 (the serpent's tongue: 0 in, 1 out). */
function drive(d, t, k) {
  switch (d) {
    case 1: return sin(t * 0.83 + k * 1.7);
    case 3: { const c = Math.floor(t / 2.7 + k * 0.37), lt = t - (c - k * 0.37) * 2.7; return hash(c, k, 3) % 3 === 0 || lt > 0.5 ? 0 : sin(lt * 12.566) * sin(lt * 12.566); }
    case 5: return sin(t * 1.21 + k);
    case 2: { const c = Math.floor(t / 3.1 + k * 0.29), lt = t - (c - k * 0.29) * 3.1; return lt < 1.4 ? sin(lt * 2.244) : 0; }
    case 4: return sin(t * 3.3 + k) * (0.55 + 0.45 * sin(t * 0.7));
    case 6: return sin(t * 2.3 + k);
    case 7: return sin(t * 1.05 + k * 2.1);
    default: return sin(t * 1.9 + k * 1.3);
  }
}

/** Brush / stylus position at order p (0..255) along a tip table, smoothed so it glides between strokes. */
function tipAt(tab, p) {
  let x = 0, y = 0, n = 0;
  for (let d = 0; d <= 12; d += 2) {
    const q = Math.max(0, Math.min(255, (p - d) | 0));
    x += tab[q * 2]; y += tab[q * 2 + 1]; n++;
  }
  return [x / n, y / n];
}

// ------------------------------------------------------------ the owl

function owlEyes(map, gaze, lid) {
  // eyes: white discs; pupils 2 x 2 shifted by gaze; lids close from the top
  for (let e = 0; e < 2; e++) {
    const ex = OWL_X + Math.floor(OWL_EYES[e][0]) - 1, ey = OWL_Y + Math.floor(OWL_EYES[e][1]) - 1;
    const px = ex + gaze;
    for (let y = ey - 2; y <= ey + 3; y++)
      for (let x = ex - 2; x <= ex + 3; x++) {
        const q = y * W + x;
        if (map[q] !== WHT) continue;
        if (y - (ey - 2) < lid * 6.2) map[q] = 16;
        else if ((x === px || x === px + 1) && (y === ey || y === ey + 1)) map[q] = 16;
      }
  }
}

// ------------------------------------------------------------ the horsemen of the lower band

function horsemen(buf, t, D, palL, palR, split) {
  const run = Math.floor(t * 60);                // exactly a pixel a frame
  for (let r = 0; r < 3; r++) {
    let x = W + 24 - ((run + r * 83 + (r & 1) * 17) % 249) - Math.round(D);
    x = ((x % 320) + 320) % 320 - 48;
    if (x < -20 || x >= W) continue;
    const spr = HORSE[(Math.floor(t * 18) + r * 3) & 7];
    for (let j = 0; j < spr.h; j++) {
      const y = HORSE_DY + j, row = y * W;
      for (let i = 0; i < spr.w; i++) {
        const xx = x + i;
        if (xx < 0 || xx >= W) continue;
        const k = j * spr.w + i, o = spr.o[k], v = spr.k[k];
        if (!o && v < 3) continue;
        const pal = xx + D < split ? palL : palR;
        buf[row + xx] = pal[o || v];
      }
    }
    costBox += spr.w * spr.h * 4;
  }
}

// ------------------------------------------------------------ composing the glass

/**
 * Pinned codes (FR) over the vase ground scrolled by D px (bands, then the
 * handle's palmette at W..2W, then bands again). Glass pixels left of the
 * handle line use the old side's palette, right of it the new one. A slow
 * glint travels along the glaze now and then: the black gloss of the slip
 * catching the lamp, two flat steps, no shading.
 */
function compose(buf, D, pa, pb, t) {
  const xs = Math.floor(D), fx = Math.floor((D - xs) * 256), split = W + 80 - D;
  const gc = Math.floor(t / GLINT_P), gt = t - gc * GLINT_P;
  const gpos = gt < GLINT_T ? -24 + (gt / GLINT_T) * 232 : -999;
  for (let y = 0; y < H; y++) {
    const row = y * W, g0 = gpos - (y >> 1);
    for (let x = 0; x < W; x++) {
      const pal = x >= split ? pb : pa;
      let code = FR[row + x];
      if (!code) {
        const sx = x + xs;
        code = sx >= W && sx < 2 * W ? HANDLE[row + sx - W] : BANDS[row + (sx % W)];
        if (fx) {
          // the ground glides by fractions of a pixel: blend with the next column
          const sx1 = sx + 1, c1 = sx1 >= W && sx1 < 2 * W ? HANDLE[row + sx1 - W] : BANDS[row + (sx1 % W)];
          if (c1 !== code) {
            const a = pal[code], b = (x + 1 >= split ? pb : pa)[c1];
            const r = ((a >> 11) * (256 - fx) + (b >> 11) * fx) >> 8;
            const gg = (((a >> 5) & 63) * (256 - fx) + ((b >> 5) & 63) * fx) >> 8;
            const bl = ((a & 31) * (256 - fx) + (b & 31) * fx) >> 8;
            buf[row + x] = (r << 11) | (gg << 5) | bl;
            continue;
          }
        }
      }
      if (code === pal[GLAZE_CODE]) {
        const dx = x - g0;
        if (dx > -5 && dx < 5) { buf[row + x] = pal[dx > -2 && dx < 2 ? GLINT1 : GLINT2]; continue; }
      }
      buf[row + x] = pal[code];
    }
  }
  costBox += N * (D ? 9 : 4);
}

// ------------------------------------------------------------ the frame

const digitsOf = (f) => f.hh + f.mm;
const ss = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

export default {
  name: 'Black-figure',
  blurb: 'An Attic amphora frieze: the numerals are black-figure heroes, beasts and shields; each minute the painter sponges one off and paints the next, and each hour the bilingual vase turns beneath them and they flip to red-figure.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, t = ctx.t;
    ctx.lcd.backlight(1 - 0.55 * ctx.night);
    costBox = 0;
    const now = ctx.date.getTime();
    const prv = clockFields(new Date(now - 60000)), nxt = clockFields(new Date(now + 60000));
    const buf = g.buf;
    const cur = digitsOf(f);

    // ---- the hour: the vase turns beneath the figures. Only the ground
    // scrolls (bands, the palmette under the handle, the horsemen); the
    // numerals and the owl stay pinned to the glass and change only by the
    // sponge and the brush, so the time is never cut off at an edge. The
    // technique flips where the handle line passes.
    let D = 0, ta = f.h, tb = f.h;
    if (nxt.h !== f.h && s >= TURN0) { D = TURN_D * ss((s - TURN0) / TURN_T); tb = nxt.h; }
    else if (prv.h !== f.h && s < TURN0 + TURN_T - 60) { D = TURN_D * ss((s + 60 - TURN0) / TURN_T); ta = prv.h; }
    const pa = PAL[techOf(ta)], pb = PAL[techOf(tb)];

    // ---- every minute: wipe what changes next, paint what changed
    FR.set(PINNED);
    const pd = digitsOf(prv), nd = digitsOf(nxt), wiping = s >= WIPE0;
    // paint order alternates hours and minutes, so neither pair is blank for long
    const jobs = ORDER.filter((k) => cur[k] !== pd[k]);
    let tip = null, tool = 0;
    const sponges = [];
    for (let k = 0; k < 4; k++) {
      const gl = GLYPHS[+cur[k]];
      const ji = jobs.indexOf(k);
      if (wiping && nd[k] !== cur[k]) {
        stampWipe(FR, gl, SLOT_X[k], SLOT_Y, s - WIPE0);
        const u = (s - WIPE0) / WD;
        if (u < 1.04) { const [x, y] = spongeAt(u); sponges.push([SLOT_X[k] - MOX + x, SLOT_Y - MOY + y, Math.min(1, (1.04 - u) * 8)]); }
        continue;
      }
      if (ji >= 0 && s < PAINT1 + 0.2) {
        // last minute's figure is still drying under the new one
        stampWipe(FR, GLYPHS[+pd[k]], SLOT_X[k], SLOT_Y, s + 60 - WIPE0);
        const span = (PAINT1 - PAINT0) / jobs.length, a = PAINT0 + ji * span;
        const u = (s - a) / span;
        if (u >= 1) stampWhole(FR, gl, SLOT_X[k], SLOT_Y);
        else if (u > 0) {
          stampPaint(FR, gl, SKETCHES[+cur[k]], SLOT_X[k], SLOT_Y, u);
          const ox = SLOT_X[k] - MOX, oy = SLOT_Y - MOY;
          if (u < PH_S) tip = null;
          else if (u < PH_K) { const [x, y] = tipAt(gl.tipK, ((u - PH_S) / (PH_K - PH_S)) * 262); tip = [ox + x, oy + y]; tool = 0; }
          else if (u < PH_I) { const [x, y] = tipAt(gl.tipO, ((u - PH_K) / (PH_I - PH_K)) * 256); tip = [ox + x, oy + y]; tool = 1; }
          else { tip = null; }
        }
        continue;
      }
      // at rest: the still figure and its swaying part, faded in after it is painted and out before it goes
      const d = +cur[k], sw = SWAY[d];
      stampWhole(FR, sw ? BASE[d] : gl, SLOT_X[k], SLOT_Y);
      if (sw) {
        const start = ji >= 0 ? PAINT1 + 0.2 : -10;
        const end = nd[k] !== cur[k] ? WIPE0 - 0.1 : 99;
        const env = Math.max(0, Math.min(1, (s - start) / 1.2, (end - s) / 0.8));
        const a = env * drive(d, t, k);
        stampSway(FR, sw[Math.round((a + 1) * 0.5 * (SWAY_N - 1))], SLOT_X[k], SLOT_Y);
      }
    }

    // ---- the owl blinks now and then, and watches the brush
    const bc = Math.floor(t / 3.7), bt = t - bc * 3.7, bon = hash(bc, 11) % 3 !== 0;
    const lid = bon && bt < 0.22 ? (bt < 0.11 ? bt / 0.11 : (0.22 - bt) / 0.11) : 0;
    let gaze = 0;
    if (tip) gaze = tip[0] < OWL_X + 4 ? -1 : tip[0] > OWL_X + 12 ? 1 : 0;
    else { const gc = Math.floor(t / 2.9); gaze = (hash(gc, 5) % 3) - 1; }
    owlEyes(FR, gaze, lid);

    compose(buf, D, pa, pb, t);
    horsemen(buf, t, D, pa, pb, W + 80);

    // ---- the painter's tools: a sea sponge for wiping, the brush, the graver
    for (const [x, y, a] of sponges) {
      // a lumpy sea sponge, one flat colour, pocked with holes
      g.fillEllipse(x, y, 5.2, 3.4, SPONGE, { aa: true, a });
      g.fillEllipse(x + 2.2, y - 1.6, 3.2, 2.6, SPONGE, { aa: true, a });
      g.fillEllipse(x - 3, y + 0.8, 2.8, 2.4, SPONGE, { aa: true, a });
      const ix = Math.floor(x), iy = Math.floor(y);
      for (const [dx, dy] of PORES) g.pixel(ix + dx, iy + dy, 0x6e4a22, { a });
    }
    if (tip) {
      const [x, y] = tip, w = sin(t * 7) * 0.6;
      if (tool === 0) {
        // a full brush: the loaded tip, a bound ferrule, a long pale reed handle
        g.thickLine(x, y, x + 2.6 + w, y - 4.4, 2.0, SLIP, { aa: true });
        g.thickLine(x + 1.4 + w, y - 2.6, x + 3.2 + w, y - 5.6, 3.0, SLIP, { aa: true });
        g.thickLine(x + 3.2 + w, y - 5.6, x + 4 + w, y - 7, 2.6, 0x8e2a1e, { aa: true });
        g.thickLine(x + 4 + w, y - 7, x + 10 + w * 2, y - 19, 1.7, 0xe6c58a, { aa: true });
      } else {
        // the graver: a bronze point in a bone grip
        g.thickLine(x, y, x + 3.6 + w, y - 9, 1.1, 0xc8a860, { aa: true });
        g.thickLine(x + 3.4 + w, y - 8.4, x + 6.4 + w, y - 16, 2.2, 0xf0e2c4, { aa: true });
      }
    }
    g.cost.px += N; g.cost.box += costBox;
  },
};
