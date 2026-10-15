// Demoscene — an Amiga cracktro that happens to be a clock.
//
// The intro: a 3D starfield flies out of the glass, three copper bars
// swing through each other (each a stack of dotted scanlines, as a copper
// gradient bands), and over them the time in a bubbly logo face of its own,
// shaded in chrome scanlines (bright sky, dark horizon, second sky), cut
// out of the background by a black halo, with a dithered drop shadow. The
// digits bounce on the beat in a ripple, squashing as they land; the colon
// is two vector balls. Along the bottom a sine scroller in a chunky 7-row
// font drawn for it (date, credits, greetings) rides a wave.
//
// Each minute is a different effect, in turn (by the minute's number):
//   - dot sphere: the digits crouch, dissolve into dots, and the dots leap
//     off left to right and fly out and round onto a spinning sphere of
//     vector balls (front balls, middle dots, a haze behind), which throbs
//     on :00; then the dots fly off it into the new time, which fills in
//     with chrome and starts to bounce again;
//   - rotozoomer: the time becomes the texture of a rotozoomer tiled over
//     the plane; after a breath in it spins and falls away until each tile
//     is a speck, the texture is swapped while it cannot be read, and the
//     new time spins back in and lands square with a small overshoot;
//   - twister: the strip of digits is a ribbon on a vertical axis whose
//     every row turns; it winds back, twists into a corkscrew and turns
//     over, unwinding with the new time on its back, and wobbles to rest.
//     A face the wrong way round for the moment (the new time before :00,
//     the old one after) shows the ribbon's checkered back instead.
//
// The hour is a part change: the digits crouch together and leap out of
// the top, the stars go to warp, a copper curtain falls; at :00 it opens on
// the Boing room (a dotted wall and floor in perspective) and the checkered
// ball drops in, rolling and bouncing through it under a double-size
// scroller ("IT IS 11 O'CLOCK", greetings); then it rolls out, the room
// folds away and the new digits drop back in one by one, bouncing.
//
// The old time is only shown before :00 and the new one after. Everything
// is closed-form in the clock: bounces, flights, the sphere's spin, the
// rotozoom and the twist are functions of the seconds from the turn; the
// stars' warp is the integral of their boost; textures, dot lists and
// sphere assignments are cached by the digits they were made from.
//
// Burn-in: everything moves except the colon balls' centres, and they bob;
// the face walks a 1 px orbit; 23:00-07:00 the panel dims.

import { Gfx, dither, clamp, ease, clockFields, previousMinute, orbit } from '../js/kit.js';

const W = 128, H = 64;
const TAU = Math.PI * 2;

/** A good integer hash, as a float in [0, 1). */
function hash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const smooth = (a, b, v) => { const u = clamp((v - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const u = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
  return Math.hypot(px - ax - u * dx, py - ay - u * dy);
};

// ------------------------------------------------------------ the logo digits
// Fat rounded strokes along centre-lines in a 22 x 30 box, every corner
// rounded off, so they look poured rather than drawn: the bubbly logo type
// of a cracktro. They are kept as distance fields (half-pixel grid), so
// they can be squashed, stretched and textured at any scale.

const DW = 22, DH = 30, R0 = 2.9;
const xL = 3.1, xR = 18.9, yT = 3.1, yB = 26.9, yM = 15;

/** A polyline with every corner replaced by a rounded bend of radius `rc`. */
function roundPath(pts, rc, closed) {
  const out = [];
  const n = pts.length;
  const at = (i) => pts[((i % n) + n) % n];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    if (!closed && (i === 0 || i === n - 1)) { out.push(p); continue; }
    const a = at(i - 1), b = at(i + 1);
    const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const r = Math.min(rc, la / 2, lb / 2);
    const s = [p[0] + ((a[0] - p[0]) * r) / la, p[1] + ((a[1] - p[1]) * r) / la];
    const e = [p[0] + ((b[0] - p[0]) * r) / lb, p[1] + ((b[1] - p[1]) * r) / lb];
    for (let k = 0; k <= 6; k++) {
      const u = k / 6, v = 1 - u;
      out.push([v * v * s[0] + 2 * u * v * p[0] + u * u * e[0], v * v * s[1] + 2 * u * v * p[1] + u * u * e[1]]);
    }
  }
  if (closed) out.push(out[0]);
  return out;
}

const SK = {
  0: [[[xL, yT], [xR, yT], [xR, yB], [xL, yB]], true],
  1: [[[6, 8], [12, yT], [12, yB]], false],
  2: [[[xL, yT + 2], [xL + 2, yT], [xR, yT], [xR, yM], [xL, yM], [xL, yB], [xR + 1, yB]], false],
  3: [[[xL - 0.5, yT], [xR, yT], [xR, yB], [xL - 0.5, yB]], false, [[[9, yM], [xR, yM]], false]],
  4: [[[xL, yT - 1], [xL, yM + 4], [xR + 1.5, yM + 4]], false, [[[xR - 2, yT + 6], [xR - 2, yB + 1]], false]],
  5: [[[xR + 0.5, yT], [xL, yT], [xL, yM - 1], [xR, yM - 1], [xR, yB], [xL - 0.5, yB]], false],
  6: [[[xR, yT], [xL, yT], [xL, yB], [xR, yB], [xR, yM - 2], [xL, yM - 2]], false],
  7: [[[xL - 0.5, yT], [xR, yT], [xR, yT + 4], [10, yB + 0.5]], false],
  8: [[[xL, yT], [xR, yT], [xR, yB], [xL, yB]], true, [[[xL, yM - 0.5], [xR, yM - 0.5]], false]],
  9: [[[xL, yB], [xR, yB], [xR, yT], [xL, yT], [xL, yM + 2], [xR, yM + 2]], false],
};

const FX = (DW + 8) * 2, FY = (DH + 8) * 2;
/** Strokes ([points, closed] each) as a signed distance field on a half-pixel grid. */
function buildField(strokes) {
  const paths = strokes.map(([pts, closed]) => roundPath(pts, 4, closed));
  const F = new Float32Array(FX * FY);
  for (let j = 0; j < FY; j++)
    for (let i = 0; i < FX; i++) {
      const x = i / 2 - 4 + 0.25, y = j / 2 - 4 + 0.25;
      let d = 99;
      for (const p of paths) for (let k = 1; k < p.length; k++) d = Math.min(d, segDist(x, y, p[k - 1][0], p[k - 1][1], p[k][0], p[k][1]));
      F[j * FX + i] = d - R0;
    }
  return F;
}
// SK entries: [points, closed] or [points, closed, [points, closed]] for a second stroke.
const FIELD = Array.from({ length: 10 }, (_, d) => {
  const s = SK[d];
  return buildField(s[2] ? [[s[0], s[1]], s[2]] : [[s[0], s[1]]]);
});

/** Distance (negative inside) of glyph point (x, y) from digit d's stroke. */
function field(F, x, y) {
  const i = Math.round((x + 4) * 2 - 0.5), j = Math.round((y + 4) * 2 - 0.5);
  if (i < 0 || j < 0 || i >= FX || j >= FY) return 9;
  return F[j * FX + i];
}

/** The chrome of the logo type: bright top, a dark horizon, a second sky below. */
function chrome(v) {
  if (v < 0.47) return 1 - v * 1.3;
  if (v < 0.55) return 0;
  return 0.95 - (v - 0.55) * 1.2;
}
/**
 * Chrome is shaded in whole scanlines, as a copper gradient inside a logo
 * is: dense rows at the top thinning out to a line every fourth row.
 */
const ROWT = [0.08, 0.62, 0.32, 0.85];
const chromeLit = (x, y, lv) => lv > ROWT[y & 3] && (lv > 0.3 || (x & 1) === 0);

// ------------------------------------------------------------ the scroller font
// A chunky 7-row bitmap face with two-pixel stems, drawn for this design.

const FONT_SRC = {
  A: '.####. ##..## ##..## ###### ##..## ##..## ##..##',
  B: '#####. ##..## ##..## #####. ##..## ##..## #####.',
  C: '.####. ##..## ##.... ##.... ##.... ##..## .####.',
  D: '####.. ##.##. ##..## ##..## ##..## ##.##. ####..',
  E: '###### ##.... ##.... #####. ##.... ##.... ######',
  F: '###### ##.... ##.... #####. ##.... ##.... ##....',
  G: '.####. ##..## ##.... ##.### ##..## ##..## .#####',
  H: '##..## ##..## ##..## ###### ##..## ##..## ##..##',
  I: '###### ..##.. ..##.. ..##.. ..##.. ..##.. ######',
  J: '...### ....## ....## ....## ##..## ##..## .####.',
  K: '##..## ##.##. ####.. ###... ####.. ##.##. ##..##',
  L: '##.... ##.... ##.... ##.... ##.... ##.... ######',
  M: '##...## ###.### ####### ##.#.## ##...## ##...## ##...##',
  N: '##..## ###.## ###### ##.### ##..## ##..## ##..##',
  O: '.####. ##..## ##..## ##..## ##..## ##..## .####.',
  P: '#####. ##..## ##..## #####. ##.... ##.... ##....',
  Q: '.####. ##..## ##..## ##..## ##.### ##.##. .##.##',
  R: '#####. ##..## ##..## #####. ####.. ##.##. ##..##',
  S: '.##### ##.... ##.... .####. ....## ....## #####.',
  T: '###### ..##.. ..##.. ..##.. ..##.. ..##.. ..##..',
  U: '##..## ##..## ##..## ##..## ##..## ##..## .####.',
  V: '##..## ##..## ##..## ##..## ##..## .####. ..##..',
  W: '##...## ##...## ##...## ##.#.## ####### ###.### ##...##',
  X: '##..## ##..## .####. ..##.. .####. ##..## ##..##',
  Y: '##..## ##..## ##..## .####. ..##.. ..##.. ..##..',
  Z: '###### ....## ...##. ..##.. .##... ##.... ######',
  0: '.####. ##..## ##.### ###### ###.## ##..## .####.',
  1: '..##.. .###.. ..##.. ..##.. ..##.. ..##.. ######',
  2: '.####. ##..## ....## ..###. .##... ##.... ######',
  3: '#####. ....## ....## ..###. ....## ....## #####.',
  4: '...##. ..###. .####. ##.##. ###### ...##. ...##.',
  5: '###### ##.... #####. ....## ....## ##..## .####.',
  6: '..###. .##... ##.... #####. ##..## ##..## .####.',
  7: '###### ....## ...##. ..##.. .##... .##... .##...',
  8: '.####. ##..## ##..## .####. ##..## ##..## .####.',
  9: '.####. ##..## ##..## .##### ....## ...##. .###..',
  ' ': '.... .... .... .... .... .... ....',
  '.': '.. .. .. .. .. ## ##',
  ',': '.. .. .. .. .. ## .#',
  '!': '## ## ## ## ## .. ##',
  "'": '## ## .# .. .. .. ..',
  ':': '.. ## ## .. ## ## ..',
  '-': '..... ..... ..... ##### ..... ..... .....',
  '*': '...... .#..#. ..##.. ###### ..##.. .#..#. ......',
  '/': '....## ...##. ...##. ..##.. .##... .##... ##....',
  '?': '.####. ##..## ....## ..###. ..##.. ...... ..##..',
};
/** Each glyph as columns: a 7-bit mask per column, bit 0 the top row. */
const FONT = {};
for (const [ch, src] of Object.entries(FONT_SRC)) {
  const rows = src.split(' ');
  const cols = [];
  for (let x = 0; x < rows[0].length; x++) {
    let m = 0;
    for (let y = 0; y < 7; y++) if (rows[y][x] === '#') m |= 1 << y;
    cols.push(m);
  }
  FONT[ch] = cols;
}

const textCache = new Map();
/** A line of text as one strip of column masks, a gap column between glyphs. */
function textStrip(str) {
  let s = textCache.get(str);
  if (s) return s;
  const cols = [];
  for (const ch of str) {
    const g = FONT[ch] ?? FONT[' '];
    cols.push(...g, 0);
  }
  s = Uint8Array.from(cols);
  if (textCache.size > 6) textCache.delete(textCache.keys().next().value);
  textCache.set(str, s);
  return s;
}

// ------------------------------------------------------------ the intro's parts

const SLOT_CX = [15, 39, 89, 113];   // digit centres
const FOOT = 37;                     // the floor the digits bounce on
const COLON_CX = 64;
const BEAT = 0.95;                   // seconds per bounce

/**
 * A logo digit with its foot at (cx, foot), scaled sx, sy about the foot
 * (squash and stretch). Lit outline, chrome inside (dither anchored to the
 * glyph, so it travels with it), a black halo that cuts it out of the
 * background, and a dithered drop shadow. `fill` < 1 fades the chrome.
 */
function drawLogo(g, F, cx, foot, sx, sy, fill = 1) {
  const buf = g.buf;
  const x0 = Math.max(0, Math.floor(cx - (DW / 2 + 4) * sx)), x1 = Math.min(W, Math.ceil(cx + (DW / 2 + 5) * sx));
  const y0 = Math.max(0, Math.floor(foot - (DH + 4) * sy)), y1 = Math.min(H, Math.ceil(foot + 5 * sy));
  const tx = Math.round(cx), ty = Math.round(foot);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const gx = DW / 2 + (x + 0.5 - cx) / sx, gy = DH + (y + 0.5 - foot) / sy;
      const d = field(F, gx, gy);
      const i = y * W + x;
      if (d < 0) {
        const edge = d > -1.0;
        buf[i] = (edge ? fill >= 1 || dither(x - tx + 3, y - ty, fill) : chromeLit(x - tx, y - ty, chrome(gy / DH) * fill)) ? 1 : 0;
      } else if (d < 1.3) buf[i] = 0;
      else if (field(F, gx - 2.2 / sx, gy - 2.2 / sy) < 0) buf[i] = fill > 0.5 && dither(x - tx, y - ty, 0.22) ? 1 : 0;
    }
}

/** A small shaded ball (vector-ball style), cut out of the background. */
function ball(g, cx, cy, r) {
  const L = [-0.48, -0.58, 0.66];
  for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++)
    for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r, q = dx * dx + dy * dy;
      const i = y * W + x;
      if (q <= 1) {
        const dz = Math.sqrt(1 - q);
        const l = Math.max(0, dx * L[0] + dy * L[1] + dz * L[2]);
        g.buf[i] = l > 0.55 || dither(x, y, 0.15 + l) ? 1 : 0;
      } else if (Math.sqrt(q) * r < r + 1.3) g.buf[i] = 0;
    }
}

/** A 3D starfield flying out of the screen; `travel` is distance flown, `streak` the trail length. */
function stars(g, travel, streak = 0) {
  for (let i = 0; i < 70; i++) {
    const sx = hash(i, 1, 5) * 2 - 1, sy = (hash(i, 2, 5) * 2 - 1) * 0.62;
    const z = 0.05 + (1 - (((travel + hash(i, 3, 5)) % 1) + 1) % 1);
    const px = 64 + (sx * 26) / z, py = 32 + (sy * 26) / z;
    if (px < 0 || py < 0 || px >= W || py >= H) continue;
    if (streak > 0) {
      const z2 = z + streak;
      g.line(Math.round(64 + (sx * 26) / z2), Math.round(32 + (sy * 26) / z2), Math.round(px), Math.round(py), 1);
    }
    g.pixel(px, py, 1);
    if (z < 0.32) g.pixel(px + 1, py, 1);
  }
}

/**
 * Copper bars swinging through each other. Each bar is a stack of
 * scanlines: half lit at its heart, thinning to a sparse dotted line every
 * other row at its edges, the way a copper gradient bands on a real screen.
 */
function bars(g, T, { yc = 33, swing = 22, n = 3, half = 4.6, gain = 1 } = {}) {
  for (let i = 0; i < n; i++) {
    const y = yc + swing * Math.sin(T * 1.1 + i * 0.95);
    for (let r = Math.ceil(y - half); r < y + half; r++) {
      if (r < 0 || r >= H) continue;
      const l = gain * (1 - Math.abs(r + 0.5 - y) / half);
      const row = r * W;
      if (l > 0.72) for (let x = (r + i) & 1; x < W; x += 2) g.buf[row + x] = 1;
      else if (l > 0.38) for (let x = (r * 2 + i) & 3; x < W; x += 4) g.buf[row + x] = 1;
      else if (l > 0.1 && (r & 1)) for (let x = (r * 3) & 7; x < W; x += 8) g.buf[row + x] = 1;
    }
  }
}

/**
 * A sine scroller: `str` scrolled `pos` px, each column lifted by a sine
 * wave fixed in screen space, so the letters ride the wave. Cut out with a
 * black halo. `scale` makes it chunkier.
 */
const INK = [];
function scroller(g, str, pos, T, { yc = 54, amp = 3.8, scale = 1, k = 0.065, w = 3.4, x0 = 0, x1 = W } = {}) {
  const strip = textStrip(str), n = strip.length;
  INK.length = 0;
  for (let x = x0; x < x1; x++) {
    const c = Math.floor((x + pos) / scale), m = strip[((c % n) + n) % n];
    if (!m) continue;
    const top = yc - 3.5 * scale + amp * Math.sin(x * k + T * w);
    for (let b = 0; b < 7; b++) if ((m >> b) & 1) INK.push(x, Math.round(top + b * scale));
  }
  for (let i = 0; i < INK.length; i += 2) g.fillRect(INK[i] - 1, INK[i + 1] - 1, 3, scale + 2, 0);
  for (let i = 0; i < INK.length; i += 2) g.fillRect(INK[i], INK[i + 1], 1, scale, 1);
}

const scrollText = (f) => `      *** OLED CREW PRESENTS: THE CLOCKTRO ***   TODAY IS ${f.dow} ${f.dd} ${f.month} ${f.year}   ***   8192 PIXELS, ONE BIT, SIXTY FRAMES A SECOND ON A 0.96 INCH SSD1306   ***   GREETINGS TO THE RAINBOW FROG IN GLASSES, FAIRLIGHT, RAZOR 1911, PARADOX, SANITY, THE BLACK LOTUS AND EVERYONE STILL WRITING COPPER LISTS   ***   `;

/** Where digit k is in its bounce: 0 on the floor, 1 at the top. */
const hop = (k, T) => Math.abs(Math.sin(Math.PI * (T / BEAT + k * 0.17)));

/**
 * The four logo digits bouncing on the beat, with squash on landing, and
 * the colon's two balls. `amp` scales the bounce, `crouch` squashes all of
 * them at once (anticipation), `dy[k]` / `st[k]` move and stretch one digit,
 * `fill` fades the chrome.
 */
function drawTime(g, digits, T, ox, oy, { amp = 1, crouch = 0, dy = null, st = null, fill = 1, colon = true } = {}) {
  for (let k = 0; k < 4; k++) {
    const h = hop(k, T) * amp, sq = Math.max(0, 1 - hop(k, T) / 0.22) * amp + crouch;
    const s = st ? st[k] : 0;
    drawLogo(g, FIELD[digits[k]], SLOT_CX[k] + ox, FOOT + oy - 4 * h + (dy ? dy[k] : 0),
      (1 + 0.08 * sq) / (1 + 0.5 * s), (1 - 0.14 * sq) * (1 + s), fill);
  }
  if (!colon) return;
  const b = 1.3 * Math.sin((T / BEAT) * Math.PI) * amp;
  ball(g, COLON_CX + ox, 18 + oy - b + (dy ? dy[4] ?? 0 : 0), 2.7);
  ball(g, COLON_CX + ox, 30 + oy + b + (dy ? dy[4] ?? 0 : 0), 2.7);
}

const digitsOf = (f) => [...`${f.hh}${f.mm}`].map(Number);


// ------------------------------------------------------------ the time as a texture

const texCache = new Map();
/** The time at rest (no bounce), on black: the texture the rotozoomer and the twister map. */
function timeTex(digits) {
  const key = digits.join('');
  let t = texCache.get(key);
  if (t) return t;
  const tg = new Gfx(W, H);
  drawTime(tg, digits, 0, 0, 0, { amp: 0 });
  t = tg.buf;
  if (texCache.size > 4) texCache.delete(texCache.keys().next().value);
  texCache.set(key, t);
  return t;
}

// ------------------------------------------------------------ minute effect 1: dot sphere

const ptsCache = new Map();
/** The time at rest as dots: points inside the strokes on a 2.6 px grid, and the colon. */
function restPoints(digits) {
  const key = digits.join('');
  let p = ptsCache.get(key);
  if (p) return p;
  const out = [];
  for (let k = 0; k < 4; k++) {
    const F = FIELD[digits[k]];
    for (let gy = 1.3; gy < DH; gy += 2.6)
      for (let gx = 1.3 + ((gy / 2.6) & 1) * 1.3; gx < DW; gx += 2.6)
        if (field(F, gx, gy) < -0.8) out.push([SLOT_CX[k] - DW / 2 + gx, FOOT - DH + gy]);
  }
  for (const cy of [18, 30]) for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) out.push([COLON_CX + dx, cy + dy]);
  out.sort((a, b) => a[0] - b[0]);
  if (ptsCache.size > 4) ptsCache.delete(ptsCache.keys().next().value);
  ptsCache.set(key, out);
  return out;
}

const SPH = { cx: 64, cy: 27, R: 22, tilt: 0.42 };
const spinAt = (tau) => 2.3 * tau + 0.6 * Math.sin(tau * 1.3);

/** Sphere point i of n (a Fibonacci lattice), turned by `a`, projected: [x, y, z]. */
function sphereAt(i, n, a, R, out) {
  const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), ph = i * 2.399963;
  const x = r * Math.cos(ph), z = r * Math.sin(ph);
  const x1 = x * Math.cos(a) + z * Math.sin(a), z1 = -x * Math.sin(a) + z * Math.cos(a);
  const y2 = y * Math.cos(SPH.tilt) - z1 * Math.sin(SPH.tilt), z2 = y * Math.sin(SPH.tilt) + z1 * Math.cos(SPH.tilt);
  const p = 90 / (90 + z2 * R);
  out[0] = SPH.cx + x1 * R * p; out[1] = SPH.cy + y2 * R * p; out[2] = z2;
  return out;
}

const rankCache = new Map();
/** Which sphere point each dot of the old and the new time flies to: sorted by x, so flights are short. */
function ranks(n) {
  let r = rankCache.get(n);
  if (r) return r;
  const tmp = [0, 0, 0];
  const order = (tau) => {
    const xs = Array.from({ length: n }, (_, i) => sphereAt(i, n, spinAt(tau), SPH.R, tmp)[0]);
    const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => xs[a] - xs[b]);
    const rank = new Int32Array(n);
    idx.forEach((i, k) => { rank[i] = k; });
    return rank;
  };
  r = { a: order(-0.9), b: order(1.0) };
  rankCache.set(n, r);
  return r;
}

const FLY = 1.15;
const SP = [0, 0, 0];
/**
 * The dots of the old time leap off the digits, left to right, and fly
 * out and round onto a spinning sphere; the sphere throbs on :00; then its
 * dots fly off it into the new time.
 */
function sphereEffect(g, A, B, tau, ox, oy) {
  const pa = restPoints(A), pb = restPoints(B);
  const n = Math.max(pa.length, pb.length);
  const rk = ranks(n);
  const R = SPH.R * (1 + 0.18 * Math.exp(-((tau / 0.16) ** 2)) - 0.12 * smooth(-0.6, -0.1, tau) * (1 - smooth(-0.1, 0.25, tau)));
  const a = spinAt(tau);
  const showDots = tau > -2.25 && tau < 2.15;
  if (!showDots) return;
  const fadeIn = smooth(1.75, 2.1, tau);
  for (let i = 0; i < n; i++) {
    const ra = rk.a[i], rb = rk.b[i];
    const o = pa[Math.floor((ra * pa.length) / n)], w = pb[Math.floor((rb * pb.length) / n)];
    const tA = -2.0 + 0.55 * (ra / n), tB = 0.45 + 0.55 * (rb / n);
    let x, y, z = 0, on = 0;
    if (tau < tA) { x = o[0] + ox; y = o[1] + oy; }
    else if (tau >= tB + FLY) { x = w[0] + ox; y = w[1] + oy; }
    else {
      sphereAt(i, n, a, R, SP);
      const leg = tau < tB ? clamp((tau - tA) / FLY, 0, 1) : 1 - clamp((tau - tB) / FLY, 0, 1);
      const e = ease.inOutCubic(leg);
      const from = tau < tB ? o : w;
      const fx = from[0] + ox, fy = from[1] + oy;
      // Out and round: a bulge away from the sphere's centre on the way.
      const dx = fx - SPH.cx, dy = fy - SPH.cy, dl = Math.hypot(dx, dy) || 1;
      const bulge = 14 * Math.sin(Math.PI * e);
      x = fx + (SP[0] - fx) * e + (dx / dl) * bulge;
      y = fy + (SP[1] - fy) * e + (dy / dl) * bulge * 0.6;
      z = SP[2] * e; on = e;
    }
    if (fadeIn > 0 && hash(i, 3, 7) < fadeIn) continue;
    const px = Math.round(x), py = Math.round(y);
    // Depth: vector balls in front, dots in the middle, a sparse haze behind.
    if (on > 0.5 && z > 0.3) { if ((i & 1) === 0) g.pixel(px, py, 1); continue; }
    if (on > 0.5 && z < -0.35) {
      g.fillRect(px - 2, py - 2, 5, 5, 0);
      g.fillRect(px - 1, py, 3, 1, 1); g.fillRect(px, py - 1, 1, 3, 1);
      continue;
    }
    g.pixel(px, py, 1); g.pixel(px + 1, py, 1);
    if (on > 0.5 && z < 0.05) g.pixel(px, py + 1, 1);
  }
}

// ------------------------------------------------------------ minute effect 2: rotozoomer

/** Angle and zoom (texture pixels per screen pixel) of the rotozoomer at tau. */
function rotoAt(tau) {
  if (tau < -2.4) {
    const u = (tau + 3) / 0.6;   // a breath in: a little back, a little closer
    return [-0.14 * Math.sin(Math.PI * u), 1 - 0.07 * Math.sin(Math.PI * u)];
  }
  if (tau < 0) { const e = ease.inCubic((tau + 2.4) / 2.4); return [Math.PI * e, 1 + 6.5 * e]; }
  const u = clamp(tau / 2.6, 0, 1);
  return [Math.PI * (1 + ease.outCubic(u)), 1 + 6.5 * (1 - u) ** 3 - 0.22 * Math.sin(Math.PI * u) * u];
}

/**
 * The time is the texture of a rotozoomer, tiled over the plane: it turns
 * and falls away until each tile is a speck, the texture is swapped while
 * the tiles are too small to read, and the new time spins back in and
 * lands square with a little overshoot.
 */
function rotoEffect(g, A, B, tau, ox, oy) {
  const [th, s] = rotoAt(tau);
  const tex = timeTex(tau < 0 ? A : B);
  const c = Math.cos(th) * s, sn = Math.sin(th) * s;
  const cx = 64 + ox, cy = 31 + oy;
  for (let y = 0; y < H; y++) {
    const dy = y + 0.5 - cy;
    let u = cx + c * (0.5 - cx) + sn * dy, v = cy - sn * (0.5 - cx) + c * dy;
    for (let x = 0; x < W; x++, u += c, v -= sn) {
      const iu = ((Math.floor(u - ox) % W) + W) % W, iv = ((Math.floor(v - oy) % H) + H) % H;
      if (tex[iv * W + iu]) g.buf[y * W + x] = 1;
    }
  }
}

// ------------------------------------------------------------ minute effect 3: twister

/** The ribbon's turn (Θ) and twist (A) at tau. */
function twistAt(tau) {
  if (tau < -2.2) return [-0.4 * Math.sin((Math.PI * (tau + 2.8)) / 0.6), 0];
  if (tau < 2.2) { const u = (tau + 2.2) / 4.4; return [Math.PI * ease.inOutCubic(u), 2.3 * Math.sin(Math.PI * u)]; }
  const k = tau - 2.2;
  return [Math.PI - 0.35 * Math.exp(-k * 4) * Math.sin(k * 13), 0];
}

/**
 * The strip of digits is a ribbon on a vertical axis, and every row of it
 * turns: it winds up backwards, twists into a corkscrew, turns over and
 * unwinds with the new time on its back. A face the wrong way round for the
 * moment (the new time before :00, the old one after) shows the ribbon's
 * checkered back instead.
 */
function twistEffect(g, A, B, tau, ox, oy) {
  const [Th, Am] = twistAt(tau);
  const front = tau < 0 ? timeTex(A) : null, back = tau >= 0 ? timeTex(B) : null;
  const cx = 64 + ox;
  for (let y = 0; y < 44; y++) {
    const th = Th + Am * Math.sin(0.085 * y + 2.4 * tau);
    const c = Math.cos(th), ac = Math.abs(c);
    const half = 62 * ac;
    const tex = c >= 0 ? front : back;
    const ty = y - oy;
    if (ty < 0 || ty >= H) continue;
    const row = y * W;
    for (let x = Math.max(0, Math.ceil(cx - half)); x <= Math.min(W - 1, cx + half); x++) {
      const iu = Math.round(cx + (x + 0.5 - cx) / Math.max(ac, 0.02) - ox);
      let v;
      if (iu < 0 || iu >= W) v = 0;
      else if (tex) v = tex[ty * W + iu];
      else v = ((iu >> 3) + (ty >> 3)) & 1 ? dither(iu, ty, 0.3) : 0;
      if (v && ac < 0.75 && !dither(x, y, ac / 0.75 + 0.12)) v = 0;
      g.buf[row + x] = v;
    }
    // The ribbon's edges.
    if (ac < 0.985) { g.pixel(Math.round(cx - half - 0.5), y, 1); g.pixel(Math.round(cx + half - 0.5), y, 1); }
  }
}

// ------------------------------------------------------------ the hour: part two, BOING

/** The Boing room: a back wall of squares and a floor in perspective, dotted. */
function room(g, open) {
  const wallB = 44;
  const top = Math.round(wallB - 44 * open);
  for (let i = 0; i < 8; i++) {
    const x = 8 + 16 * i;
    for (let y = top; y <= wallB; y += 2) g.pixel(x, y, 1);
    // Floor rays to a vanishing point far above the wall.
    const xb = 64 + (x - 64) * 1.75;
    const len = 19 * open;
    for (let k = 0; k <= len; k += 1.5) g.pixel(Math.round(x + ((xb - x) * k) / 19), wallB + Math.round(k), 1);
  }
  for (let j = 0; j < 6; j++) {
    const y = wallB - 8 * j;
    if (y < top) break;
    for (let x = 8; x <= 120; x += 2) g.pixel(x, y, 1);
  }
  for (const y of [48, 53, 60]) {
    if (y > wallB + 19 * open) break;
    const k = (y - wallB) / 19, hw = 56 * (1 + 0.75 * k);
    for (let x = Math.ceil(64 - hw); x <= 64 + hw; x += 2) g.pixel(x, y, 1);
  }
}

/** The Boing ball: a tilted checkered sphere, rolling, shaded, with its shadow on the wall. */
function boing(g, cx, cy, r, roll) {
  // The shadow, on the wall behind and to the right.
  g.fillWhere((px, py, x, y) => (((px - cx - 7) / r) ** 2 + ((py - cy + 1) / r) ** 2 <= 1 ? true : false), 0, [cx + 7 - r - 1, cy - r - 2, 2 * r + 3, 2 * r + 3]);
  const tilt = 0.36, ct = Math.cos(tilt), st = Math.sin(tilt);
  const L = [-0.5, -0.55, 0.67];
  for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++)
    for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r, q = dx * dx + dy * dy;
      const i = y * W + x;
      if (q > 1) { if (Math.sqrt(q) * r < r + 1.4) g.buf[i] = 0; continue; }
      const dz = Math.sqrt(1 - q);
      const tx = dx * ct + dy * st, ty = -dx * st + dy * ct;
      const lat = Math.asin(clamp(ty, -1, 1)), lon = Math.atan2(tx, dz) + roll;
      const chk = (Math.floor(lat / (Math.PI / 8) + 8) + Math.floor(lon / (Math.PI / 8) + 160)) & 1;
      const l = Math.max(0, dx * L[0] + dy * L[1] + dz * L[2]);
      const rim = Math.sqrt(q) > 0.9;
      g.buf[i] = rim || (chk ? l > 0.18 || dither(x, y, 0.3 + l * 3) : l > 0.95) ? 1 : 0;
    }
}

const H_START = -3.2, H_END = 9.6;

/**
 * The hour is a part change. The digits crouch together and leap out of
 * the top, the stars go to warp, a copper curtain falls; at :00 it opens on
 * the Boing room, the ball drops in and bounces through it under a
 * double-size scroller greeting the hour; then the ball rolls out, the
 * room folds away and the new digits drop back in, bouncing.
 */
function hourShow(g, A, B, f, tau, T, ox, oy) {
  if (tau < 0) {
    // Warp: the stars' travel speeds up (closed form: the integral of the boost).
    const w = smooth(-2.6, -0.8, tau);
    stars(g, T * 0.16 + 1.6 * ease.inQuad(clamp((tau + 2.6) / 2.6, 0, 1)), 0.06 * w);
    bars(g, T, { swing: 21 * (1 - smooth(-3.2, -2.4, tau)) + 2 });
    const crouch = Math.sin(Math.PI * clamp((tau + 3.0) / 0.55, 0, 1)) * (tau < -2.45 ? 1 : 0);
    const dy = [], st = [];
    for (let k = 0; k < 5; k++) {
      const t = tau - (-2.45 + 0.12 * k);
      dy.push(t > 0 ? -(90 * t + 260 * t * t) : 0);
      st.push(t > 0 ? Math.min(0.3, t * 1.2) : 0);
    }
    drawTime(g, A, T, ox, oy, { amp: 1 - smooth(-3.2, -2.8, tau), crouch: 0.9 * crouch, dy, st });
    // The copper curtain falls from the top.
    const cur = smooth(-1.1, -0.1, tau);
    if (cur > 0) {
      const yb = Math.round(64 * cur);
      g.fillRect(0, 0, W, yb, 0);
      bars(g, T * 3, { yc: yb / 2, swing: yb / 2.4, n: 5, half: 5 });
      for (let x = 0; x < W; x++) g.pixel(x, yb, 1);
    }
    scroller(g, scrollText(f), T * 38, T);
    return;
  }
  const open = smooth(0, 0.6, tau) * (1 - smooth(7.6, 8.4, tau));
  if (open > 0) room(g, open);
  // The ball: drops in from the top left, bounces through the room, rolls out right.
  if (tau > 0.25 && tau < 8.6) {
    const t = tau - 0.25;
    const x = 18 + 92 * (0.5 - 0.5 * Math.cos(Math.min(t, 7.4) * 0.85)) + (t > 7.4 ? (t - 7.4) * 90 : 0);
    const bounce = Math.abs(Math.sin((Math.PI * t) / 1.15 + 0.35));
    const y = 39 - 13 * bounce;
    boing(g, x, y, 13, x / 13);
  }
  // Part two's scroller: double size, across the top, greeting the hour.
  if (tau < 8.2) {
    const txt = `                IT IS ${f.hh} O'CLOCK   ***   GREETINGS TO THE RAINBOW FROG IN GLASSES   ***   `;
    scroller(g, txt, (tau - 0.2) * 72, T, { yc: 9, amp: 2.5, scale: 2, k: 0.05, w: 2.6 });
  }
  // The digits drop back in, one by one, and bounce to rest.
  if (tau > 7.6) {
    stars(g, T * 0.16);
    bars(g, T, { swing: 21 * smooth(8.6, 9.6, tau) });
    const dy = [];
    for (let k = 0; k < 5; k++) {
      const u = clamp((tau - (7.9 + 0.13 * k)) / 0.9, 0, 1);
      dy.push(-60 * (1 - ease.outBounce(u)));
    }
    drawTime(g, B, T, ox, oy, { amp: smooth(9.0, 9.6, tau), dy });
    scroller(g, scrollText(f), T * 38, T);
  }
}

// ------------------------------------------------------------ the design

const EFFECTS = ['sphere', 'roto', 'twister'];
const SPAN = { sphere: [-3.0, 3.4], roto: [-3.0, 3.4], twister: [-2.8, 3.4] };

export default {
  name: 'Demoscene',
  blurb: 'An Amiga cracktro that tells the time: copper bars, starfield, sine scroller, bouncing chrome digits; each minute a dot-sphere morph, a rotozoomer or a twister; the Boing ball on the hour.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { date, fields: f, oled, night }) {
    oled.contrast(0xcf + (0x20 - 0xcf) * night);
    const T = date.getTime() / 1000;
    const [ox, oy] = orbit(date, 1, 3);
    const late = f.sec >= 50;
    const from = late ? f : previousMinute(date);
    const to = late ? clockFields(new Date(date.getTime() + 60000)) : f;
    const tau = late ? f.sec - 60 : f.sec;
    const A = digitsOf(from), B = digitsOf(to);
    if (to.m === 0 && tau >= H_START && tau < H_END) return hourShow(g, A, B, f, tau, T, ox, oy);
    const eff = EFFECTS[((to.minuteKey % 3) + 3) % 3];
    const [t0, t1] = SPAN[eff];
    if (tau < t0 || tau >= t1) {
      stars(g, T * 0.16);
      bars(g, T);
      drawTime(g, digitsOf(f), T, ox, oy);
      scroller(g, scrollText(f), T * 38, T);
      return;
    }
    // A minute effect: the digits stop bouncing and crouch (anticipation),
    // the effect carries the old time into the new, and they bounce again.
    const D = tau < 0 ? A : B;
    const calm = smooth(t0, t0 + 0.4, tau) * (1 - smooth(t1 - 1.0, t1, tau));
    const crouch = Math.sin(Math.PI * clamp((tau - (t0 + 0.25)) / 0.45, 0, 1));
    stars(g, T * 0.16);
    bars(g, T, { gain: 1 - calm });
    if (eff === 'sphere') {
      if (tau < -2.0) drawTime(g, A, T, ox, oy, { amp: 1 - calm, crouch: 0.8 * crouch, fill: 1 - smooth(-2.25, -2.0, tau) });
      if (tau > 1.75) drawTime(g, B, T, ox, oy, { amp: 1 - calm, fill: smooth(1.75, 2.1, tau) });
      sphereEffect(g, A, B, tau, ox, oy);
    } else if (eff === 'roto') {
      if (tau < -2.95 || tau >= 2.6) drawTime(g, D, T, ox, oy, { amp: 1 - calm });
      else rotoEffect(g, A, B, tau, ox, oy);
    } else {
      if (tau < -2.75 || tau >= 3.0) drawTime(g, D, T, ox, oy, { amp: 1 - calm });
      else twistEffect(g, A, B, tau, ox, oy);
    }
    scroller(g, scrollText(f), T * 38, T);
  },
};
