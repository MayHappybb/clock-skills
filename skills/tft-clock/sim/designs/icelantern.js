// Ice Lantern (冰灯): a night at the Harbin Ice and Snow World. The time is
// the palace itself: four buildings sawn from river ice, the hours as two
// tall towers, the minutes as the lower east wing, every numeral built of
// block courses and voussoir arches and crowned with an onion dome, a spire
// or battlements. LEDs inside each building cycle slowly (cyan, magenta,
// amber, green) and the colour flows upward through the ice; the joints
// glow frosty white, the edges refract, bubbles glint. Snow falls in three
// layers, bundled-up visitors stroll the plaza puffing breath, sledders
// take the ice slide down the east side, the terrace wall runs a chase
// under swinging red lanterns, and now and then a visitor stops to take a
// photo of the palace (a flash pops).
//
// Minute turn: an ice carver in an orange suit rides a scissor lift up
// beside each changing digit; its lights die and his chainsaw cuts it down
// course by course in a spray of ice chips, done before :00. After :00 a
// crane lowers a raw block with the new numeral already glowing faintly
// inside it, and the carver rides back up carving the excess away, the
// finished building lighting up below his saw. Hour: fireworks over the
// palace, flashing in the ice and on the snow, then the whole palace
// switches to a new colour scheme in a wave from west to east. By day the
// shells are deep red and orange so they show on blue, and the LEDs light
// the sunlit ice in a wave for a few seconds.
//
// Day: blue-white ice in low winter sun, the shadow side of every stroke
// sharp blue, a sun glint sweeping across; dusk warms the sky and at 16:30
// the lights come on building by building.
//
// Palette: a deep indigo night (never black; violet toward the city glow on
// the horizon, darker in the corners) so the coloured ice is the brightest
// thing; snow takes the ice's colours; people and carvers are the only warm
// saturated solids (orange suits, red parkas, yellow helmets) with navy
// outlines so they read as figures against glowing ice. By day a deep
// winter blue sky keeps the pale ice from washing out.
//
// Hard pixels for the characters (sprites drawn at sub-pixel positions by
// a bilinear gather, so they glide); AA for the ice edges, snow, chips,
// fireworks. Sky and snow are one g.coarse pass with the buildings' glow
// precomputed per digit on its grid.
//
// Cost: ~5 ms mean, 7 ms worst on esp32c3 (check.mjs). Off-canvas work: the
// glow grid for a (slot, digit) the first time it is shown, ~3 k pixel
// deposits plus four 41 x 21 blur passes (~0.2 ms), cached; everything else
// is start-up tables. Flash: glyph maps 113 KB, glow grids 40 x 861 bytes =
// 34 KB, wall map 1.3 KB, sprites ~1 KB: about 150 KB.

import { hex, R, G, B, sin, clamp, rand, progress, ease, clockFields } from '../js/kit.js';
import { buildGlyph, SIZES } from './icelantern-glyphs.js';
import { drawIce, ROW, DAY } from './icelantern-ice.js';
import { blitSub, splat, CARVER, CARVER_SAW_X, CARVER_SAW_Y, VISITORS, SLEDDER, NAVY, LANTERN } from './icelantern-art.js';

const ICE_MID = hex('a8d0f0'), ICE_SHADOW = hex('2e5cc0');
const W = 160, H = 80, BASE = 62, GROUND = 68, WALL0 = 62, WALL1 = 70;
const GLYPHS = { hour: [], min: [] };
for (let d = 0; d < 10; d++) { GLYPHS.hour.push(buildGlyph(d, SIZES.hour)); GLYPHS.min.push(buildGlyph(d, SIZES.min)); }

const SLOTS = [
  { x: 4, size: 'hour' }, { x: 34, size: 'hour' },
  { x: 77, size: 'min' }, { x: 101, size: 'min' },
].map((s) => ({ ...s, w: SIZES[s.size].w, h: SIZES[s.size].h, y: BASE - SIZES[s.size].h }));

// ------------------------------------------------------------ colour schemes, one per hour
const SCHEMES = [
  ['20e0ff', 'ff3cc8', 'ffb020', '40ff70'],   // the festival's own
  ['2a90ff', '50f0ff', 'a060ff', '80ffe0'],   // arctic
  ['ff4a20', 'ffb030', 'ff3088', 'ffe060'],   // lantern fire
  ['30ff90', '20c8ff', '9a60ff', '60ffc8'],   // aurora
  ['ff58c0', '58c0ff', 'ffd040', 'b070ff'],   // candy
  ['40ffb0', 'ffc040', '40b8ff', 'ff6a50'],   // jade and gold
].map((s) => s.map(hex));

function ledOf(scheme, ph) {
  const n = scheme.length;
  let u = ph % n; if (u < 0) u += n;
  const i = u | 0, f = u - i, a = scheme[i], b = scheme[(i + 1) % n];
  const s = f * f * (3 - 2 * f);
  return (((R(a) + (R(b) - R(a)) * s) | 0) << 16) | (((G(a) + (G(b) - G(a)) * s) | 0) << 8) | ((B(a) + (B(b) - B(a)) * s) | 0);
}
const mixc = (a, b, u) => (((R(a) + (R(b) - R(a)) * u) | 0) << 16) | (((G(a) + (G(b) - G(a)) * u) | 0) << 8) | ((B(a) + (B(b) - B(a)) * u) | 0);

// ------------------------------------------------------------ glow grids (sky and snow take the ice's light)
const GW = 41, GHN = 21;
const GLOWS = new Map();
function glowFor(k, d) {
  const key = k * 10 + d;
  let gr = GLOWS.get(key);
  if (gr) return gr;
  const S = SLOTS[k], gl = GLYPHS[S.size][d];
  gr = new Float32Array(GW * GHN);
  const tmp = new Float32Array(GW * GHN);
  for (let j = 0; j < gl.gh; j++)
    for (let i = 0; i < gl.gw; i++) {
      const a = gl.A[j * gl.gw + i];
      if (!a) continue;
      const x = S.x - gl.ox + i, y = S.y - gl.oy + j;
      const n = Math.min(GHN - 1, Math.max(0, Math.round(y / 4))) * GW + Math.min(GW - 1, Math.max(0, Math.round(x / 4)));
      gr[n] += a / 255;
    }
  for (let pass = 0; pass < 4; pass++) {
    for (let j = 0; j < GHN; j++) for (let i = 0; i < GW; i++) { const n = j * GW + i; tmp[n] = (gr[i > 0 ? n - 1 : n] + 2 * gr[n] + gr[i < GW - 1 ? n + 1 : n]) / 4; }
    for (let j = 0; j < GHN; j++) for (let i = 0; i < GW; i++) { const n = j * GW + i; gr[n] = (tmp[j > 0 ? n - GW : n] + 2 * tmp[n] + tmp[j < GHN - 1 ? n + GW : n]) / 4; }
  }
  for (let n = 0; n < gr.length; n++) gr[n] = Math.min(1, gr[n] / 9);
  GLOWS.set(key, gr);
  return gr;
}
const VIG = new Float32Array(GW * GHN);
for (let j = 0; j < GHN; j++) for (let i = 0; i < GW; i++) {
  const dx = (i - 20) / 20, dy = (j - 9) / 12;
  VIG[j * GW + i] = 1 - 0.32 * Math.min(1, dx * dx * 0.8 + dy * dy * 0.6);
}

// warm pools of light on the snow under the wall's red lanterns
const LANTERNS = [18, 48, 69, 88, 112, 140];
const LANT = new Float32Array(GW * GHN);
for (let j = 0; j < GHN; j++) for (let i = 0; i < GW; i++) {
  if (j * 4 < GROUND) continue;
  let v = 0;
  for (const lx of LANTERNS) { const dx = (i * 4 - lx) / 7, dy = (j * 4 - 70) / 6; v += 1 / (1 + dx * dx + dy * dy); }
  LANT[j * GW + i] = v;
}

// per-frame sky state, read by the coarse callback (monomorphic module state)
const SR = new Float32Array(GHN), SG = new Float32Array(GHN), SB = new Float32Array(GHN);
const GLW = [null, null, null, null], GR_ = new Float32Array(4), GG_ = new Float32Array(4), GB_ = new Float32Array(4);
let FLX = 0, FLY = 0, FLR = 0, FLG = 0, FLB = 0, FLA = 0, MOX = 0, MOY = 0, MOA = 0, MOC = 0, VIGK = 1, GROUNDK = 1.7, LANTK = 0;
function skyNode(x, y) {
  const j = y >> 2, n = j * GW + (x >> 2);
  let r = SR[j], gg = SG[j], b = SB[j];
  const gm = y >= GROUND ? GROUNDK : 1;
  for (let k = 0; k < 4; k++) {
    const gl = GLW[k];
    if (!gl) continue;
    const w = gl[n] * gm;
    r += w * GR_[k]; gg += w * GG_[k]; b += w * GB_[k];
  }
  if (LANTK > 0) { const w = LANT[n] * LANTK; r += 255 * w; gg += 120 * w; b += 50 * w; }
  if (FLA > 0) {   // a firework's flash
    const dx = x - FLX, dy = y - FLY, w = FLA / (1 + (dx * dx + dy * dy) * 0.0012);
    r += FLR * w; gg += FLG * w; b += FLB * w;
  }
  if (MOA > 0) {   // the moon's (or sun's) halo
    const dx = x - MOX, dy = y - MOY, w = MOA / (1 + (dx * dx + dy * dy) * 0.012);
    r += ((MOC >>> 16) & 255) * w; gg += ((MOC >>> 8) & 255) * w; b += (MOC & 255) * w;
  }
  const v = 1 - (1 - VIG[n]) * VIGK;
  r *= v; gg *= v; b *= v;
  r = r > 255 ? 255 : r; gg = gg > 255 ? 255 : gg; b = b > 255 ? 255 : b;
  return ((r | 0) << 16) | ((gg | 0) << 8) | (b | 0);
}

// ------------------------------------------------------------ the day
// hour, sky top, sky horizon, snow, daylight
const DAYS = [
  [0, '0a0a2c', '2a1e5c', '5a5ca6', 0], [6.3, '0a0a2c', '2a1e5c', '5a5ca6', 0],
  [7.2, '2c3c80', 'e89a80', '8a90b8', 0.5], [8.2, '1e58c4', '78b0e8', 'e4eef8', 1],
  [15.3, '1e58c4', '78b0e8', 'e4eef8', 1], [16.2, '3a4c98', 'f0a070', 'b8b0c8', 0.55],
  [17.2, '141444', '5a3470', '4a4a80', 0], [18.2, '0a0a2c', '2a1e5c', '5a5ca6', 0], [24, '0a0a2c', '2a1e5c', '5a5ca6', 0],
].map(([h, a, b, c, d]) => [h, hex(a), hex(b), hex(c), d]);
function dayAt(hr) {
  let k = 1;
  while (DAYS[k][0] < hr) k++;
  const a = DAYS[k - 1], b = DAYS[k], u = (hr - a[0]) / (b[0] - a[0]);
  return { top: mixc(a[1], b[1], u), hor: mixc(a[2], b[2], u), snow: mixc(a[3], b[3], u), dl: a[4] + (b[4] - a[4]) * u };
}

// ------------------------------------------------------------ fixed scenery
const STARS = Array.from({ length: 34 }, (_, i) => [Math.floor(rand(i, 1, 7) * 160), Math.floor(rand(i, 2, 7) * 46), rand(i, 3, 7) * 6.28, 0.25 + rand(i, 4, 7) * 0.5]);
const SPARKS = Array.from({ length: 26 }, (_, i) => [Math.floor(rand(i, 1, 9) * 160), 71 + Math.floor(rand(i, 2, 9) * 9), rand(i, 3, 9) * 6.28]);
// snow: [x0, y0, speed px/s, drift px/s, sway amp, size(0 far,1 mid,2 near), phase]
const FLAKES = Array.from({ length: 64 }, (_, i) => {
  const layer = i < 30 ? 0 : i < 52 ? 1 : 2;
  return [rand(i, 1, 3) * 170, rand(i, 2, 3) * 90, [5, 10, 19][layer] * (0.8 + 0.4 * rand(i, 3, 3)), [-1.5, -2.5, -4][layer], [0.6, 1.2, 2.2][layer], layer, rand(i, 4, 3) * 6.28];
});
// the terrace wall: block courses, light per pixel
const WALL_L = new Uint8Array(W * (WALL1 - WALL0));
for (let y = 0; y < WALL1 - WALL0; y++)
  for (let x = 0; x < W; x++) {
    let l = y < 2 ? 255 : 150;                                   // snow cap on the top courses
    if (y === 2) l = 210;
    if (y >= 2 && ((y - 2) % 3 === 2 || ((x + ((y - 2) / 3 | 0) * 5) % 10) === 0)) l = 100;   // joints
    if (y === 0 && rand(x, 0, 5) > 0.6) l = 230;
    WALL_L[y * W + x] = l;
  }

// the slide: a stair tower east of the minutes and a chute curving down off the edge
const CHUTE = [];
for (let i = 0; i <= 14; i++) {
  const u = i / 14, a = [131, 38], b = [149, 39], c = [166, 62];
  CHUTE.push([(1 - u) * (1 - u) * a[0] + 2 * u * (1 - u) * b[0] + u * u * c[0], (1 - u) * (1 - u) * a[1] + 2 * u * (1 - u) * b[1] + u * u * c[1]]);
}
function chuteAt(u) {
  const a = [131, 38], b = [149, 39], c = [166, 62];
  return [(1 - u) * (1 - u) * a[0] + 2 * u * (1 - u) * b[0] + u * u * c[0], (1 - u) * (1 - u) * a[1] + 2 * u * (1 - u) * b[1] + u * u * c[1]];
}

// ------------------------------------------------------------ minute jobs
// Times (seconds into the minute) for one slot; `st` staggers the slots.
const OLD0 = 57.15, LIFT_UP = 0.5, CUT = 2.2;               // old: lift up, then cut down (ends <= 59.95)
const DROP = 0.8, CARVE0 = 1.0, CARVE1 = 2.7, AWAY = 3.2;     // new: block lowered, carved bottom-up

function crownTopY(k, d) { const S = SLOTS[k], gl = GLYPHS[S.size][d]; return S.y - gl.oy + gl.top; }

/** Where slot k's saw line is at time s for its old (dir -1) or new (dir 1) job. */
function oldCut(k, d, s, st) {
  const S = SLOTS[k], top = crownTopY(k, d) - 1, u = progress(s, OLD0 + st + LIFT_UP, OLD0 + st + CUT);
  return top + (BASE - top) * ease.inOutQuad(u);
}
function newCarve(k, d, s, st) {
  const top = crownTopY(k, d) - 1, u = progress(s, st + CARVE0, st + CARVE1);
  return BASE - (BASE - top) * ease.inOutQuad(u);
}

const CHIP_N = 64;
function drawChips(g, k, xL, lineAt, t0, t1, s, tone) {
  const dur = t1 - t0;
  for (let i = 0; i < CHIP_N; i++) {
    const te = t0 + (i + rand(i, k, 11)) * dur / CHIP_N;
    const a = s - te;
    if (a < 0 || a > 0.9) continue;
    const ye = lineAt(te);
    const xt = xL + CARVER_SAW_X - 3 + 3 * sin(te * 40) + rand(i, k, 12) * 6;
    const vx = (rand(i, k, 13) - 0.25) * 70, vy = -(15 + rand(i, k, 14) * 45);
    const x = xt + vx * a, y = ye + vy * a + 90 * a * a;
    if (y > WALL1) continue;
    const big = rand(i, k, 15) > 0.7;
    splat(g, x, y, tone, (1 - a / 0.9) * 0.95);
    if (big) splat(g, x + 0.8, y + 0.5, tone, (1 - a / 0.9) * 0.6);
  }
}

function drawLift(g, xL, py, tod, sawing) {
  // platform top at py (screen y of the carver's boots); everything behind the wall
  g.clip(0, 0, W, WALL0 + 1);
  const x0 = xL - 1, x1 = xL + 13;
  const yB = WALL0 + 6;
  if (py < yB) {
    const n = Math.max(1, Math.round((yB - py) / 6)), hseg = (yB - py - 2) / n;
    for (let i = 0; i < n; i++) {
      const ya = py + 2 + i * hseg, yb = ya + hseg;
      g.thickLine(x0 + 1, ya, x1 - 1, yb, 1.3, 0x7a6a3a, { aa: true });
      g.thickLine(x1 - 1, ya, x0 + 1, yb, 1.3, 0xc8a030, { aa: true });
    }
  }
  g.fillRect(Math.round(x0), Math.round(py), 15, 2, 0xf0c020);
  g.fillRect(Math.round(x0), Math.round(py) + 1, 15, 1, 0x8a6a10);
  const jx = sawing ? 0.6 * sin(tod * 47) : 0;
  blitSub(g, CARVER, xL - 2 + jx, py - CARVER.h, false, 256);
  g.unclip();
}

// ------------------------------------------------------------ fireworks (hour show)
const FW_COLS = [hex('ffd040'), hex('ff3a30'), hex('ffffff'), hex('ff50d0'), hex('60ff90'), hex('50c8ff')];
const FW_DAY = [hex('ff9a00'), hex('e01818'), hex('d018b0'), hex('ffc000'), hex('e83a80'), hex('ff5a00')];   // daytime shells: deep colours that show on blue
const BURSTS = [0.2, 1.3, 2.3, 3.0, 4.2, 5.1, 6.4, 7.6, 8.5, 10.0];
function burstOf(i, hourKey) {
  const r = (q) => rand(i, hourKey, q);
  return { i, t: BURSTS[i], x: 16 + r(1) * 132, y: 8 + r(2) * 16, x0: 30 + r(3) * 110, c: (r(4) * 6) | 0, n: 34 + (r(5) * 8 | 0), v: 34 + r(6) * 18 };
}

export default {
  name: 'Ice Lantern',
  blurb: 'An ice-lantern palace whose buildings are the digits; carvers saw each minute down and carve the next from a fresh block.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, tod = f.h * 3600 + f.m * 60 + s, hr = tod / 3600;
    ctx.lcd.backlight(1 - 0.55 * ctx.night);
    const day = dayAt(hr), dl = day.dl;
    const cur = f.hh + f.mm;
    const nxtF = clockFields(new Date(ctx.date.getTime() + 60000)), prvF = clockFields(new Date(ctx.date.getTime() - 60000));
    const nxt = nxtF.hh + nxtF.mm, prv = prvF.hh + prvF.mm;
    const hourTurn = f.m === 0, hourKey = Math.floor(f.minuteKey / 60);

    // ---- the colour scheme: this hour's, swept in after the hour turn
    const schemeNow = SCHEMES[f.h % SCHEMES.length], schemeOld = SCHEMES[prvF.h % SCHEMES.length];
    // the scenery's lights (wall, tower, snow) change with the same west-to-east wave as the palace
    const envLed = (ph, x) => {
      if (!hourTurn || s > 5.5) return ledOf(schemeNow, ph);
      const u = ease.inOutQuad(progress(s, 3.6 + x * 0.0135, 4.2 + x * 0.0135));
      return u >= 1 ? ledOf(schemeNow, ph) : mixc(ledOf(schemeOld, ph), ledOf(schemeNow, ph), u);
    };

    // ---- jobs: which slots are being demolished or carved
    const jobs = [];
    let orderOld = 0, orderNew = 0;
    for (let k = 3; k >= 0; k--) {
      if (cur[k] !== nxt[k] && s >= OLD0 - 0.1) jobs.push({ k, old: true, d: +cur[k], st: (orderOld++) * 0.18 });
      if (cur[k] !== prv[k] && s < AWAY + 0.8) jobs.push({ k, old: false, d: +cur[k], st: (orderNew++) * 0.18 });
    }
    const jobOf = [null, null, null, null];
    for (const j of jobs) jobOf[j.k] = j;

    // ---- light per slot
    const lights = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) {
      const on = 16.5 * 3600 + k * 0.7, off = 7.5 * 3600 + k * 0.7;
      let lv = tod >= on ? clamp((tod - on) / 0.5, 0, 1) : tod < off ? clamp((off - tod) / 0.5, 0, 1) : 0;
      if (lv > 0 && lv < 1 && sin(tod * 70 + k) > 0.2) lv *= 0.3;   // flickering on
      const J = jobOf[k];
      if (J && J.old) {
        const u = progress(s, OLD0 + J.st + 0.25, OLD0 + J.st + 0.7);
        let m = 1 - u;
        if (u > 0 && u < 1 && sin(s * 90 + k) > 0) m *= 0.35;
        lv *= m;
      }
      lights[k] = lv;
    }
    const ledOn = Math.max(...lights);

    // ---- per-slot LED colours (rows) and glow colour
    const fw = hourTurn && s < 12;
    let flash = 0, flashC = 0;
    const bursts = [];
    if (fw) for (let i = 0; i < BURSTS.length; i++) {
      const b = burstOf(i, hourKey), age = s - b.t - 0.7;
      if (s < b.t || age > 2.2) continue;
      b.age = age; bursts.push(b);
      if (age > 0) { const fl = Math.exp(-age * 3.2); if (fl > flash) { flash = fl; flashC = FW_COLS[b.c]; FLX = b.x; FLY = b.y; } }
    }
    const flashR = R(flashC), flashG = G(flashC), flashB = B(flashC);

    // ---- sky
    const top = day.top, hor = day.hor, snow = day.snow;
    for (let j = 0; j < GHN; j++) {
      const y = j * 4;
      if (y >= GROUND) {
        const u = (y - GROUND) / 12, tn = 0.28 * ledOn * (1 - dl), lc = envLed(tod * 0.3 - 1.5, 80);
        SR[j] = R(snow) * (0.92 + 0.08 * u) + R(lc) * tn; SG[j] = G(snow) * (0.92 + 0.08 * u) + G(lc) * tn; SB[j] = B(snow) * (0.95 + 0.05 * u) + B(lc) * tn;
        continue;
      }
      const u = Math.pow(y / GROUND, 1.6);
      SR[j] = R(top) + (R(hor) - R(top)) * u; SG[j] = G(top) + (G(hor) - G(top)) * u; SB[j] = B(top) + (B(hor) - B(top)) * u;
    }
    const glowK = [1, 1, 1, 1];
    for (let k = 0; k < 4; k++) {
      const J = jobOf[k];
      const shown = J && J.old && s > OLD0 + J.st + CUT ? -1 : +cur[k];
      GLW[k] = shown >= 0 && lights[k] > 0 ? glowFor(k, shown) : null;
      glowK[k] = J && !J.old ? progress(s - J.st, CARVE0, CARVE1) : 1;
    }
    FLA = flash * 0.6; FLR = flashR; FLG = flashG; FLB = flashB;
    VIGK = 1 - dl * 0.7; LANTK = 0.22 * (1 - dl); GROUNDK = 1.6 + 1.0 * (1 - dl);
    // moon by night, sun by day
    const sunU = (hr - 7.4) / 9;
    if (dl > 0.05 && sunU > 0 && sunU < 1) { MOX = 112 + 40 * sunU; MOY = 18 - 12 * Math.sin(sunU * Math.PI); MOA = 0.5 * dl; MOC = 0xfff0d0; }
    else { MOX = 146; MOY = 10; MOA = 0.22 * (1 - dl); MOC = 0x8090d0; }

    // per-slot row colours: the LED colour flows upward through the ice
    const flowT = tod * 0.055;
    const glowCols = [0, 0, 0, 0];
    const rowCols = [];
    for (let k = 0; k < 4; k++) {
      let sw = 1;
      if (hourTurn) sw = ease.inOutQuad(progress(s, 3.6 + k * 0.45, 4.2 + k * 0.45));
      const front = hourTurn ? Math.max(0, 1 - Math.abs(s - (3.9 + k * 0.45)) / 0.35) : 0;
      rowCols.push([sw, front]);
      const mph = flowT + k * 0.55 + (SLOTS[k].y + 20) * 0.022;
      const mid = sw < 1 ? mixc(ledOf(schemeOld, mph), ledOf(schemeNow, mph), sw) : ledOf(schemeNow, mph);
      glowCols[k] = mid;
      const gk = 0.55 * lights[k] * glowK[k] * (1 - dl * 0.8);
      GR_[k] = R(mid) * gk; GG_[k] = G(mid) * gk; GB_[k] = B(mid) * gk;
    }

    g.coarse(skyNode, { cell: 4 });

    // ---- stars and moon (night)
    if (dl < 0.7) {
      const sa = 1 - dl / 0.7;
      for (let i = 0; i < STARS.length; i++) {
        const st = STARS[i], tw = st[3] * (0.6 + 0.4 * sin(tod * 1.7 + st[2])) * sa;
        g.put(st[0], st[1], 0xe8eaff, tw > 1 ? 1 : tw);
      }
      g.fillCircle(146, 10, 4.6, 0xf4f0d8, { aa: true, a: sa });
      g.fillCircle(148.2, 8.8, 4.1, mixc(top, hor, 0.05), { aa: true, a: sa });
    }
    if (MOA > 0 && dl > 0.05 && MOC === 0xfff0d0) g.fillCircle(MOX, MOY, 3.5, 0xfffbe8, { aa: true, a: dl });

    // ---- fireworks, behind the palace
    for (const b of bursts) {
      const col = dl > 0.5 ? FW_DAY[b.c] : FW_COLS[b.c];
      if (b.age < 0) {   // the rocket climbing
        const u = (s - b.t) / 0.7, x = b.x0 + (b.x - b.x0) * u, y = WALL0 - (WALL0 - b.y) * (1 - (1 - u) * (1 - u));
        splat(g, x, y, 0xfff0c0, 0.9);
        splat(g, x - (b.x - b.x0) * 0.04, y + 3, 0xffc070, 0.4);
        continue;
      }
      const a = b.age, k2 = 2.4, fade = 1 - a / 2.2;
      const dr0 = (1 - Math.exp(-a * k2)) / k2, dr1 = (1 - Math.exp(-Math.max(0, a - 0.07) * k2)) / k2, dr2 = (1 - Math.exp(-Math.max(0, a - 0.15) * k2)) / k2;
      const fall = 7 * a * a;
      for (let p = 0; p < b.n; p++) {
        const ang = (p / b.n) * 6.283 + b.c * 0.7 + rand(p, b.i, 21) * 0.3, cs = sin(ang + 1.5708), sn = sin(ang);
        const v = b.v * (0.5 + 0.5 * rand(p, b.i, 22));
        const tw = a > 1.1 && sin(tod * 40 + p * 2.1) < -0.3 ? 0.25 : 1;   // glitter as it dies
        const c0 = a < 0.25 && dl < 0.5 ? 0xffffff : col;
        const hx = b.x + cs * v * dr0, hy = b.y + sn * v * dr0 + fall;
        splat(g, hx, hy, c0, 1.6 * fade * tw);
        splat(g, hx + 0.7, hy + 0.3, c0, 0.9 * fade * tw);
        splat(g, b.x + cs * v * dr1, b.y + sn * v * dr1 + fall * 0.9, col, fade * 0.9 * tw);
        splat(g, b.x + cs * v * dr2, b.y + sn * v * dr2 + fall * 0.8, col, fade * 0.45);
      }
    }

    // ---- the slide tower and chute (east)
    const iceDim = mixc(mixc(0x34407a, 0xc8dcf0, dl), envLed(flowT + 2.2, 131), 0.6 * ledOn * (1 - dl));
    // the tower: courses of ice blocks, tapering, battlements on top
    {
      const ir = R(iceDim), ig = G(iceDim), ib = B(iceDim);
      for (let y = 37; y < BASE; y++) {
        const hw = y < 40 ? 4.5 : 4.5 + (y - 40) * 0.17, cx = 131.5;
        const xa = Math.floor(cx - hw), xb = Math.ceil(cx + hw);
        const course = (y - 37) / 3 | 0, jointRow = (y - 37) % 3 === 2;
        for (let x = xa - 1; x <= xb; x++) {
          g.cost.box += 6;
          if (y < 39 && ((x - xa) % 3 === 2)) continue;   // merlons
          const edge = x === xa - 1 || x === xb;
          if (edge) { g.put(x, y, 0x0a0820, 0.6); continue; }
          let k = jointRow || (x + course * 2) % 5 === 0 ? 1.35 : x < cx - 1 ? 1.1 : 0.82;
          if (x === xa) k = 1.5;
          const r = ir * k > 255 ? 255 : ir * k, gg = ig * k > 255 ? 255 : ig * k, bb = ib * k > 255 ? 255 : ib * k;
          g.put(x, y, ((r | 0) << 16) | ((gg | 0) << 8) | (bb | 0), 1);
        }
      }
    }
    g.stroke(CHUTE, 3, mixc(iceDim, 0xffffff, 0.2), { aa: true });
    g.stroke(CHUTE.map(([x, y]) => [x, y - 1.3]), 1, mixc(iceDim, 0xffffff, 0.6), { aa: true });
    // sledders: one every 5 s, a pause at the top, then down accelerating
    for (let n = 0; n < 2; n++) {
      const per = 5, ph = (tod + n * 2.5) % per, who = SLEDDER[(Math.floor((tod + n * 2.5) / per) & 1)];
      if (ph < 0.6) { blitSub(g, who, 126, 38 - who.h + 1.5, false, tonek(dl)); continue; }
      const u = Math.min(1.2, ((ph - 0.6) / 1.5) ** 2);
      if (u >= 1.1) continue;
      const [x, y] = chuteAt(u);
      blitSub(g, who, x - 4, y - who.h + 1.5, false, tonek(dl));
    }

    // ---- the palace
    // day ice by facing: sunlit edges white, the far side sharp blue
    for (let i = 0; i < 16; i++) {
      const fc = (i * 16 + 8 - 128) / 127;
      const c = fc < 0 ? mixc(ICE_MID, ICE_SHADOW, Math.min(1, -fc * 1.6)) : mixc(ICE_MID, 0xffffff, Math.min(1, fc * 1.4));
      DAY.r[i] = R(c); DAY.g[i] = G(c); DAY.b[i] = B(c);
    }
    DAY.frost = mixc(0x5a70a8, 0xc8def4, dl);
    DAY.key = mixc(0x0a0820, 0x0c1a48, dl);
    const glint = dl > 0.2 ? ((tod * 14) % 260) - 50 : -999;
    for (let k = 0; k < 4; k++) {
      const S = SLOTS[k], J = jobOf[k];
      let d = +cur[k];
      const show = hourTurn ? progress(s, 3.6 + k * 0.45, 4.3 + k * 0.45) * (1 - progress(s, 10 + k * 0.3, 11.5 + k * 0.3)) : 0;
      const o = { lt: lights[k], dl, hide: -999, hot: -999, frost: -999, glint, show };
      let y0 = S.y;
      if (J && J.old) {
        if (s >= OLD0 + J.st + LIFT_UP) { const yc = oldCut(k, d, s, J.st); o.hide = yc; o.hot = yc; }
        if (s >= OLD0 + J.st + CUT) continue;
      } else if (J && !J.old) {
        const tau = s - J.st;
        if (tau < 0) continue;
        const u = clamp(tau / DROP, 0, 1);
        y0 = S.y - (BASE + 4) * (1 - ease.outCubic(u));
        if (tau > DROP && tau < DROP + 0.4) y0 += 0.9 * Math.sin((tau - DROP) * 24) * (1 - (tau - DROP) / 0.4);
        o.frost = newCarve(k, d, s, J.st);
        if (tau >= CARVE0 && tau < CARVE1) o.hot = o.frost;
      }
      // light rows for this building
      const [sw, front] = rowCols[k];
      const gl = GLYPHS[S.size][d];
      const yA = Math.max(0, Math.floor(y0 - gl.oy)), yB = Math.min(H, Math.ceil(y0 - gl.oy + gl.gh) + 1);
      for (let y = yA; y < yB; y++) {
        const ph = flowT + k * 0.55 + y * 0.022;
        let c = ledOf(schemeNow, ph), cc = ledOf(schemeNow, ph + 2.1);
        if (sw < 1) { c = mixc(ledOf(schemeOld, ph), c, sw); cc = mixc(ledOf(schemeOld, ph + 2.1), cc, sw); }
        cc = mixc(cc, 0xfff0c0, 0.45);
        let r = R(c), gg = G(c), b = B(c), r2 = R(cc), g2 = G(cc), b2 = B(cc);
        const add = front * 180 + flash * 160;
        if (add > 0) {
          const fr = front * 180, fl = flash * 0.75;
          r += fr + flashR * fl; gg += fr + flashG * fl; b += fr + flashB * fl;
          r2 += fr + flashR * fl; g2 += fr + flashG * fl; b2 += fr + flashB * fl;
        }
        ROW.br[y] = r; ROW.bg[y] = gg; ROW.bb[y] = b; ROW.cr[y] = r2; ROW.cg[y] = g2; ROW.cb[y] = b2;
      }
      drawIce(g, gl, S.x, y0, o);
      // the crane's cable while the block comes down and the hook lifts away
      if (J && !J.old) {
        const tau = s - J.st;
        const hookY = tau < DROP + 0.2 ? y0 - gl.oy + gl.top - 1 : (y0 - gl.oy + gl.top - 1) - (tau - DROP - 0.2) * 70;
        if (hookY > -2 && tau >= 0) {
          const cx = S.x + S.w / 2, sl = 5;
          g.thickLine(cx, -1, cx, hookY - sl, 1, 0x1a1c2a, { aa: true });
          if (tau < DROP + 0.2) {
            g.thickLine(cx, hookY - sl, S.x + 1, hookY + 0.5, 0.9, 0x2a2c3a, { aa: true });
            g.thickLine(cx, hookY - sl, S.x + S.w - 1, hookY + 0.5, 0.9, 0x2a2c3a, { aa: true });
          }
          g.fillRect(Math.round(cx - 1.5), Math.round(hookY - sl - 1), 3, 2, 0xf0c020);
        }
      }
    }

    // ---- carvers, lifts, chips
    const chipTone = mixc(0xc8e4ff, 0xffffff, dl);
    for (const J of jobs) {
      const k = J.k, S = SLOTS[k], xL = S.x - 3, d = J.d, top = crownTopY(k, d);
      let py = 999, sawing = false;
      if (J.old) {
        const t0 = OLD0 + J.st;
        if (s < t0) continue;
        if (s < t0 + LIFT_UP) py = WALL0 + 18 - (WALL0 + 18 - (top - 1 + 6)) * ease.outCubic((s - t0) / LIFT_UP);
        else if (s < t0 + CUT + 0.6) { const yc = oldCut(k, d, s, J.st); py = (s < t0 + CUT ? yc : BASE + (s - t0 - CUT) * 30) + 6; sawing = s < t0 + CUT; }
        else continue;
        drawLift(g, xL, py, tod, sawing);
        drawChips(g, k, xL, (te) => oldCut(k, d, te, J.st), t0 + LIFT_UP, t0 + CUT, s, chipTone);
      } else {
        const tau = s - J.st;
        if (tau < 0.4 || tau > AWAY + 0.6) continue;
        if (tau < CARVE0) py = WALL0 + 18 - (WALL0 + 18 - (BASE + 6)) * ease.outCubic(clamp((tau - 0.4) / 0.6, 0, 1));
        else if (tau < CARVE1) { py = newCarve(k, d, s, J.st) + 6; sawing = true; }
        else py = top - 1 + 6 + (tau - CARVE1) * 75;
        if (py < WALL0 + 17) drawLift(g, xL, py, tod, sawing);
        drawChips(g, k, xL, (te) => newCarve(k, d, te, J.st), J.st + CARVE0, J.st + CARVE1, s, chipTone);
      }
    }

    // ---- the terrace wall, running a slow colour chase
    const wallDay = mixc(0xa8c0e0, 0xeef6ff, 0.4);
    for (let x = 0; x < W; x++) {
      const c = envLed(tod * 0.3 - x * 0.025, x);
      const lw = 0.75 * ledOn * (1 - dl);
      const amb = mixc(0x34428a, wallDay, dl);
      const cr = R(amb) + R(c) * lw, cg = G(amb) + G(c) * lw, cb = B(amb) + B(c) * lw;
      for (let y = WALL0; y < WALL1; y++) {
        const l = WALL_L[(y - WALL0) * W + x];
        let r = (cr * l) >> 8, gg = (cg * l) >> 8, b = (cb * l) >> 8;
        if (y < WALL0 + 2) { r = (r + 230 * (0.4 + 0.6 * dl)) / 2; gg = (gg + 238 * (0.4 + 0.6 * dl)) / 2; b = (b + 255 * (0.5 + 0.5 * dl)) / 2; }
        r = r > 255 ? 255 : r; gg = gg > 255 ? 255 : gg; b = b > 255 ? 255 : b;
        g.cost.box += 6;
        g.put(x, y, ((r | 0) << 16) | ((gg | 0) << 8) | (b | 0), 1);
      }
    }
    g.fillRect(0, WALL1, W, 1, mixc(0x141838, 0x8aa0c8, dl));

    // ---- red lanterns on the wall, swinging a little in the wind
    for (let i = 0; i < LANTERNS.length; i++) {
      const lx = LANTERNS[i], sw = 0.6 * sin(tod * 1.3 + i * 1.7);
      g.thickLine(lx + 0.5, WALL0 + 1, lx + 0.5 + sw * 0.5, WALL0 + 2.5, 0.8, 0x302010, { aa: true });
      blitSub(g, LANTERN, lx - 1.5 + sw, WALL0 + 2.2, false, 256 - ((dl * 40) | 0));
      if (dl < 0.9) g.fillCircle(lx + 0.5 + sw, WALL0 + 5, 4, 0xffa040, { aa: true, a: 0.18 * (1 - dl) });
    }

    // ---- plaza sparkle, visitors and their breath
    for (const [x, y, p] of SPARKS) { const v = sin(tod * 2.3 + p); if (v > 0.6) g.put(x, y, 0xffffff, (v - 0.6) * 1.8); }
    const tk = tonek(dl);
    for (let i = 0; i < VISITORS.length; i++) {
      const V = VISITORS[i], span = W + 24;
      // the photographer walks 20 s, then stops 4 s for a picture of the palace
      let dist = V.v * tod, still = false, pt = 0;
      if (V.photo) { const P = 24, c = Math.floor(tod / P); pt = tod - c * P; dist = V.v * (c * 20 + Math.min(pt, 20)); still = pt > 20; }
      let x = (V.x0 + dist) % span; if (x < 0) x += span; x -= 12;
      const step = Math.floor(Math.abs(dist) / 2.5) & 1, left = V.v < 0;
      const fr = still ? V.spr[2] : V.spr[step];
      const bob = still ? 0 : step * 0.4;
      blitSub(g, fr, x, V.y + bob, left, tk, NAVY, 0);
      if (still && pt > 21.8 && pt < 22.3) {   // the flash
        const fa = 1 - (pt - 21.8) / 0.5, fx = left ? x - 0.5 : x + 8.5;
        g.fillCircle(fx, V.y + 4.5, 1.2 + 4 * (1 - fa), 0xffffff, { aa: true, a: 0.85 * fa });
        g.fillCircle(fx, V.y + 4.5, 9, 0xffffff, { aa: true, a: 0.12 * fa });
      }
      // breath: a puff every 2.6 s from the face
      const pa = (tod + V.puff) % 2.6;
      if (pa < 1.3) {
        const dir = left ? -1 : 1, fx = x + (left ? 0.5 : fr.w - 0.5), fy = V.y + 4;
        const px = fx + dir * (1 + pa * 3), py = fy - pa * 3.5, rr = 0.7 + pa * 1.3;
        g.fillCircle(px, py, rr, 0xf0f4ff, { aa: true, a: 0.55 * (1 - pa / 1.3) });
      }
    }

    // ---- snow, three layers in parallax
    for (let i = 0; i < FLAKES.length; i++) {
      const [x0, y0, v, dr, amp, layer, ph] = FLAKES[i];
      let y = (y0 + v * tod) % 90; y -= 5;
      let x = (x0 + dr * tod + amp * sin(tod * 0.9 + ph)) % 170; if (x < 0) x += 170; x -= 5;
      const a = layer === 0 ? 0.35 : layer === 1 ? 0.65 : 0.9;
      splat(g, x, y, 0xf4f8ff, a);
      if (layer === 2) { splat(g, x + 0.7, y + 0.2, 0xf4f8ff, 0.5); splat(g, x + 0.2, y + 0.8, 0xf4f8ff, 0.5); }
    }
  },
};

function tonek(dl) { return Math.round(200 + 56 * dl); }
