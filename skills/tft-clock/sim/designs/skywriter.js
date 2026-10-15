// Skywriter: a 1930s Art Deco air-pageant poster, and the time is being
// written on the sky by the display team. Each numeral is a smoke trail,
// and a little red racer flies it for ever: it runs the stroke, loops off
// the end with the smoke cut, comes back along it, so every digit is
// re-written once every two seconds and its smoke is never the same twice.
// The glyphs (skywriter-glyphs.js) are a Deco skeleton drawn as flight
// plans: an oval 0, a flagged 1, a flat-topped 3, an open 4, a high-waisted
// 8 of two stacked circles, 6 and 9 of a circle and a tangent stem, with a
// forward lean, climbing left to right like the formation.
//
// The time is alive every second. The smoke is a chain of puffs whose life
// is closed-form from the plane's pass: fresh smoke is white and thin, it
// billows to full width in a quarter second, then dulls to cream and drifts
// downwind, so a freshness front chases round every numeral; where the
// plane re-writes it, the older trail lingers a moment as an airbrushed
// haze and is gone. The beat: on every whole second the whole trail
// billows out and settles, and each plane fires a smoke burst, a fat knot
// of white in its trail that relaxes over the next second; a beacon on the
// control tower blinks with it. Every 15 s a
// flourish: an opposition pass, two solo planes crossing low in front of
// the sun trailing red and blue ribbons, and the four writers fire their
// bursts as they cross. The world, calmer: the Deco sunburst turns slowly
// behind everything; at night it is two searchlights sweeping the dark.
//
// Minute turn: from :58.4 the plane of each changing numeral cuts its smoke
// and climbs away; the abandoned trail drifts up on the wind and thins out
// puff by puff in a fixed random order (never closing an open side), gone
// by :59.75. Three planes per new numeral dive in from above and, from
// :00.0, write it together, each a third of its tour, so the half-written
// numeral is three growing dashes of the right shape, whole by :00.67; two
// peel away, one stays to fly it. Hour: the team arrives in a vic from the
// lower left, climbs to the centre trailing coloured smoke and bomb-bursts
// at :59, every plane curving to its numeral; the new hour is written in
// the team's red and gold, the sunburst spins a full ray, the sky changes
// to the next time of day ray by ray, and the whole time stays in team
// colours for 12 s, until each plane switches back to white and its next
// pass re-writes the numeral in white, a colour front chasing round.
//
// Palette: the poster's limited inks, one set per time of day (dawn, day,
// dusk, night): a sky of four to six flat bands, airbrushed only at their
// seams, its sunburst one step lighter, a flat sun, a deep land ink, cream smoke with one flat shade
// (the lithographer's single shadow tone, not a modelled volume), the
// team's vermilion and gold. Hard pixels for the smoke and the land (flat
// colour, as printed), ordered dither as the airbrush (band seams, haze,
// fading trails), AA only for the little planes, which glide. Night: the deep
// palette, the smoke lit pale by searchlights, backlight to 50 %.
//
// Cost: the sky is one integer pass (a per-pixel angle table and per-row
// band colours); smoke puffs are stamped as integer discs from a span
// table (~300 a frame, two passes); planes (~10 px, red with a maroon
// wing and fin, a cream cheat line) are three AA polygons and a line each.
// No per-minute caches: every frame is built cold from the clock.
// Flash: angle table 25.6 KB, sky rows 4 palettes x 2 x 1280 x 2 B = 20 KB,
// tours (~1,700 samples: x, y, heading, smoke flag) and puffs (~470: home,
// size, rank) ~40 KB as floats: ~86 KB in all. RAM: ~7.5 KB of puff scratch
// beyond the frame buffer.

import { clockFields, to565, clamp, progress, ease, sin, cos, mix, hex } from '../js/kit.js';
import { TOURS, TITLE, titleWidth, GW, GH } from './skywriter-glyphs.js';

const W = 160, H = 80;
const P = 2.0;                                   // seconds per circuit of a numeral
const SLOT_X = [3, 37, 94, 128], SLOT_Y = [19, 14, 8, 4];     // the writing climbs, as the team does
const SUN_X = 80, SUN_Y = 69, HORIZON = 68;
const WIND_X = 0.55, WIND_Y = -0.25;             // px per second of smoke age
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

// ------------------------------------------------------------ palettes (flash)

const PAL = {
  dawn: {
    sky: [[0, '#2b3d76'], [10, '#565a92'], [30, '#9a77a4'], [48, '#dc9f9e'], [62, '#f3cfa0']],
    ray: 0.09, sun: '#f7cf7e', land: '#2a2440', bldg: '#3d3456', title: '#d9a77a',
    fresh: '#fffaf2', body: '#f4e4d6', old: '#e2cbc6', shade: '#a98aa6',
  },
  day: {
    sky: [[0, '#1b3672'], [8, '#1f4889'], [25, '#2f69a5'], [43, '#5590bd'], [57, '#97bfcf'], [65, '#d9dcbf']],
    ray: 0.08, sun: '#f2b33a', land: '#1d3a42', bldg: '#2c5560', title: '#d8b06a',
    fresh: '#fffdf4', body: '#f2e6cc', old: '#dccfb9', shade: '#a99aae',
  },
  dusk: {
    sky: [[0, '#1a1c4c'], [9, '#36296a'], [27, '#713c7c'], [44, '#bb5379'], [57, '#e8855a'], [65, '#f5b664']],
    ray: 0.08, sun: '#f9d474', land: '#251836', bldg: '#3a2649', title: '#e4a868',
    fresh: '#fff6e6', body: '#f6dec4', old: '#e4c2b0', shade: '#9a6a8e',
  },
  night: {
    sky: [[0, '#060a1c'], [5, '#0b1531'], [60, '#132348'], [65, '#1f365c']],   // one deep band: the searchlights are the night's texture
    ray: 0, sun: '#e6e0c4', land: '#05070f', bldg: '#0d1424', title: '#8492b4',
    fresh: '#f2f5fb', body: '#c8d3e6', old: '#a9b6d0', shade: '#5e6f98',
  },
};
const PAL_KEYS = ['dawn', 'day', 'dusk', 'night'];
const palOf = (h) => (h >= 5 && h < 7 ? 'dawn' : h >= 7 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'dusk' : 'night');

const TEAM = [0xe4513a, 0xf2b33d, 0xe4513a, 0xf2b33d];   // the hour's coloured smoke, per slot
const TEAM_FRESH = TEAM.map((c) => to565(mix(c, 0xffffff, 0.35)));
const TEAM_BODY = TEAM.map((c) => to565(c));
const TEAM_OLD = TEAM.map((c) => to565(mix(c, 0x6a3040, 0.18)));
const TEAM_SHADE = TEAM.map((c) => to565(mix(c, 0x1a1830, 0.45)));
const PLANE = 0xd83c28, PLANE_DARK = 0x7a1f1c, PLANE_LIGHT = 0xf4e6c8;
const RIBBON = [0xe4513a, 0x2f55b0];

function skyAt(stops, y) {
  for (let k = 1; k < stops.length; k++) {
    if (y <= stops[k][0]) {
      const [y0, c0] = stops[k - 1], [y1, c1] = stops[k];
      return mix(hex(c0), hex(c1), (y - y0) / (y1 - y0));
    }
  }
  return hex(stops[stops.length - 1][1]);
}
// The poster's sky is flat bands of airbrushed colour: one ink per band, with
// a 3-row airbrushed seam (ordered dither) where two bands meet. Built once.
function bandAt(stops, y) {
  let k = 0;
  while (k < stops.length - 1 && y >= stops[k + 1][0]) k++;          // stops are band tops
  return hex(stops[k][1]);
}
const PT = {};
for (const k of PAL_KEYS) {
  const p = PAL[k], rows = [new Uint16Array(H * 4 * 4), new Uint16Array(H * 4 * 4)];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < 4; x++) {
      const c = bandAt(p.sky, y + 0.5 + (BAYER[((y & 3) << 2) | x] - 0.5) * 3), cr = mix(c, hex(p.sun), p.ray);
      for (let yy = 0; yy < 4; yy++) {
        rows[0][(y << 4) | (yy << 2) | x] = to565(c);
        rows[1][(y << 4) | (yy << 2) | x] = to565(cr);
      }
    }
  }
  PT[k] = {
    rows, sun: hex(p.sun), land: hex(p.land), bldg: hex(p.bldg), title: hex(p.title),
    fresh: to565(hex(p.fresh)), body: to565(hex(p.body)), old: to565(hex(p.old)), shade: to565(hex(p.shade)), haze: to565(mix(hex(p.body), skyAt(p.sky, 30), 0.15)),
  };
}

// the sunburst: angle of every pixel round the sun, 0..65535 a turn (flash)
const ANG = new Uint16Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
  ANG[y * W + x] = ((Math.atan2(y + 0.5 - SUN_Y, x + 0.5 - SUN_X) / (Math.PI * 2)) * 65536) & 0xffff;
const RAYS = 24;                                 // wedges round the full turn; the pattern repeats every 2

// disc spans: SQ[i] = sqrt(i / 16)
const SQ = new Float32Array(16 * 100);
for (let i = 0; i < SQ.length; i++) SQ[i] = Math.sqrt(i / 16);

// ------------------------------------------------------------ stamping

let STAMPED = 0;
function stamp(buf, cx, cy, r, c) {
  const y0 = Math.max(0, ((cy - r - 0.5 + 64) | 0) - 63), y1 = Math.min(H - 1, ((cy + r - 0.5 + 64) | 0) - 64);
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy, h2 = r2 - dy * dy;
    if (h2 < 0) continue;
    const hw = SQ[(h2 * 16) | 0];
    const xa = Math.max(0, ((cx - hw - 0.5 + 64) | 0) - 63), xb = Math.min(W - 1, ((cx + hw - 0.5 + 64) | 0) - 64);
    const row = y * W;
    for (let x = xa; x <= xb; x++) buf[row + x] = c;
    if (xb >= xa) STAMPED += xb - xa + 1;
  }
}
function stampDither(buf, cx, cy, r, c, lvl) {
  if (lvl <= 0) return;
  const y0 = Math.max(0, ((cy - r - 0.5 + 64) | 0) - 63), y1 = Math.min(H - 1, ((cy + r - 0.5 + 64) | 0) - 64);
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy, h2 = r2 - dy * dy;
    if (h2 < 0) continue;
    const hw = SQ[(h2 * 16) | 0];
    const xa = Math.max(0, ((cx - hw - 0.5 + 64) | 0) - 63), xb = Math.min(W - 1, ((cx + hw - 0.5 + 64) | 0) - 64);
    const row = y * W, by = (y & 3) << 2;
    for (let x = xa; x <= xb; x++) if (BAYER[by | (x & 3)] < lvl) buf[row + x] = c;
    if (xb >= xa) STAMPED += xb - xa + 1;
  }
}

// ------------------------------------------------------------ the smoke of one numeral

// scratch for one numeral's puffs (two generations)
const MAXP = 256;
const QX = new Float32Array(MAXP), QY = new Float32Array(MAXP), QR = new Float32Array(MAXP), QT = new Uint8Array(MAXP);
const GXs = new Float32Array(MAXP), GYs = new Float32Array(MAXP), GRs = new Float32Array(MAXP), GLs = new Float32Array(MAXP);
let PUFFS = 0;

/**
 * Lay out and draw one numeral's smoke.
 *   tp     seconds since this numeral was first written (its writers started at tp = 0)
 *   stop   tp at which its plane cut the smoke (Infinity while it flies it)
 *   q      dissolve 0..1 (the minute turn), gx, gy its wind gust offset
 *   wall   wall seconds into the minute (the beat), t the animation clock
 *   team   -1, or the slot whose team colour this numeral wears while lp (wall s) < teamUntil
 */
function smoke(buf, d, ox, oy, tp, stop, q, gx, gy, wall, t, pt, team, teamUntil, salute) {
  const T = TOURS[d], np = T.np, PU = T.PU, PX = T.PX, PY = T.PY, PR = T.PR, PK = T.PK;
  const tc = tp < stop ? tp : stop;
  const phase = tc / P - ((tc / P) | 0);
  // oldest first: start just ahead of the plane
  let j0 = 0;
  while (j0 < np && PU[j0] <= phase) j0++;
  let n = 0, ng = 0;
  const shrink = 1 - 0.15 * q;
  // the beat: every whole second the whole trail billows out and settles
  const fr = wall - Math.floor(wall), pulse = fr < 0.5 ? 0.75 * (1 - fr * 2) * (1 - fr * 2) : 0;
  for (let kk = 0; kk < np; kk++) {
    const j = (j0 + kk) % np;
    // the turn: each puff in its fixed random turn shrinks away (never a pop)
    let fade = 1;
    if (q > 0) { fade = (PK[j] * 1.15 + 0.12 - q * 1.27) / 0.14; if (fade <= 0) continue; if (fade > 1) fade = 1; }
    const u = PU[j], up = u * P, k3 = (u * 3) | 0, wp = (u - k3 / 3) * P;
    let lp, prev = -1;
    if (tc >= up) {
      lp = up + (((tc - up) / P) | 0) * P;
      if (lp >= up + P) prev = lp - P; else if (k3 >= 1) prev = wp;
    } else if (k3 >= 1 && tc >= wp) lp = wp;
    else continue;
    const age = tp - lp;
    // the beat: smoke laid in the first 0.14 s of a wall second is a burst
    let e = wall - age; e -= Math.floor(e);
    let bonus = 0;
    if (e < 0.14 && age < 1.1) bonus = (salute > 0 ? 1.0 + 0.6 * salute : 1.0) * (1 - age / 1.1) * (1 - e / 0.14 * 0.5);
    const g1 = age < 0.25 ? age / 0.25 : 1;
    const r = (2.4 + 0.7 * g1 * (2 - g1) + 0.1 * (age < 3 ? age : 3) + PR[j] * g1 + 0.35 * sin(t * 2.3 + j * 1.7) + pulse + bonus) * shrink * fade;
    if (r < 0.9) continue;
    QX[n] = ox + PX[j] + WIND_X * age + gx;
    QY[n] = oy + PY[j] + WIND_Y * age + gy;
    QR[n] = r;
    const coloured = team >= 0 && lp - tp + wall >= 0 && lp - tp + wall < teamUntil;
    QT[n] = (coloured ? 3 : 0) + (age < 0.32 || bonus > 0.3 ? 0 : age < 1.25 ? 1 : 2);
    n++;
    // the previous pass's trail lingers a moment where the plane re-writes it
    if (prev >= 0 && age < 0.6 && q === 0) {
      const ag = tp - prev;
      GXs[ng] = ox + PX[j] + WIND_X * ag; GYs[ng] = oy + PY[j] + WIND_Y * ag;
      GRs[ng] = 3.4 + PR[j]; GLs[ng] = 0.55 * (1 - age / 0.6);
      ng++;
    }
  }
  PUFFS += n + ng;
  for (let i = 0; i < ng; i++) stampDither(buf, GXs[i], GYs[i], GRs[i], pt.haze, GLs[i]);
  // one flat shade, offset down-wind of the light (the sun is high behind the viewer)
  for (let i = 0; i < n; i++) stamp(buf, QX[i] + 0.9, QY[i] + 1.1, QR[i], QT[i] >= 3 ? TEAM_SHADE[team] : pt.shade);
  for (let i = 0; i < n; i++) {
    const tt = QT[i];
    const c = tt === 0 ? pt.fresh : tt === 1 ? pt.body : tt === 2 ? pt.old : tt === 3 ? TEAM_FRESH[team] : tt === 4 ? TEAM_BODY[team] : TEAM_OLD[team];
    stamp(buf, QX[i], QY[i], QR[i] - 0.45, c);
  }
}

/** The plane's place on a tour at fraction ph: [x, y, hx, hy]. */
function onTour(d, ox, oy, ph, out) {
  const T = TOURS[d], n = T.n;
  let f = (ph - Math.floor(ph)) * n;
  const i0 = f | 0, i1 = (i0 + 1) % n, w = f - i0;
  out[0] = ox + T.X[i0] + (T.X[i1] - T.X[i0]) * w;
  out[1] = oy + T.Y[i0] + (T.Y[i1] - T.Y[i0]) * w;
  const hx = T.HX[i0] + (T.HX[i1] - T.HX[i0]) * w, hy = T.HY[i0] + (T.HY[i1] - T.HY[i0]) * w, l = Math.hypot(hx, hy) || 1;
  out[2] = hx / l; out[3] = hy / l;
  return out;
}

function bez(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y, u, out) {
  const v = 1 - u;
  out[0] = v * v * v * p0x + 3 * v * v * u * p1x + 3 * v * u * u * p2x + u * u * u * p3x;
  out[1] = v * v * v * p0y + 3 * v * v * u * p1y + 3 * v * u * u * p2y + u * u * u * p3y;
  const dx = 3 * v * v * (p1x - p0x) + 6 * v * u * (p2x - p1x) + 3 * u * u * (p3x - p2x);
  const dy = 3 * v * v * (p1y - p0y) + 6 * v * u * (p2y - p1y) + 3 * u * u * (p3y - p2y);
  const l = Math.hypot(dx, dy) || 1;
  out[2] = dx / l; out[3] = dy / l;
  return out;
}

// a dive from above onto a start point (u: 0 off-screen .. 1 arriving)
function entry(sx, sy, hx, hy, u, out) {
  const ex = sx - hx * 26 + (hx >= 0 ? -8 : 8), ey = -14;
  return bez(ex, ey, ex, ey + 22, sx - hx * 18, sy - hy * 18, sx, sy, u, out);
}
// a climb away off the top (u: 0 leaving .. 1 gone)
function exit(sx, sy, hx, hy, u, out) {
  const ex = sx + hx * 22 + (hx >= 0 ? 10 : -10), ey = -16;
  return bez(sx, sy, sx + hx * 18, sy + hy * 18, ex, ey + 22, ex, ey, u, out);
}

// ------------------------------------------------------------ planes

const PLANES = [];        // [x, y, hx, hy] for this frame
const FUS = [[5.6, 0], [3.6, -1.5], [-2, -1.3], [-5.2, -0.6], [-5.2, 0.7], [-2, 1.4], [3.6, 1.5]];
const FIN = [[-2.8, -1], [-5.3, -3.9], [-6.4, -3.9], [-5.6, -0.4]];
const WING = [[2.2, 0.3], [-1.2, 0.3], [-2.8, 3.1], [0.6, 3.1]];
const PS = 0.85;                                  // plane scale: about 10 px nose to tail
function place(pts, x, y, hx, hy, fy) {
  return pts.map(([a, b]) => [x + PS * (a * hx - b * fy * hy), y + PS * (a * hy + b * fy * hx)]);
}
function plane(g, x, y, hx, hy, nightLit) {
  const fy = hx < 0 ? -1 : 1;                     // keep the fin up whichever way it flies
  g.fillPolygon(place(WING, x, y, hx, hy, fy), PLANE_DARK, { aa: true });
  g.fillPolygon(place(FUS, x, y, hx, hy, fy), nightLit ? 0xe8604a : PLANE, { aa: true });
  g.fillPolygon(place(FIN, x, y, hx, hy, fy), PLANE_DARK, { aa: true });
  // the cheat line
  g.thickLine(x + 2.6 * hx, y + 2.6 * hy, x - 3.4 * hx, y - 3.4 * hy, 0.7, PLANE_LIGHT, { aa: true, a: 0.8 });
}

// ------------------------------------------------------------ helpers of the clock

const DIG = (f) => [+f.hh[0], +f.hh[1], +f.mm[0], +f.mm[1]];
/** Seconds since slot k's numeral was last changed (its writers started then). */
function sinceWritten(k, f) {
  const M = f.h * 60 + f.m;
  const T = k === 3 ? M : k === 2 ? M - (f.m % 10) : k === 1 ? M - f.m : Math.floor(f.h / 10) * 600;
  return (M - T) * 60 + f.sec;
}

// the hour's formation: a vic climbing from the lower left to the centre, bursting at -1.0
const F_T0 = -2.4, F_T1 = -1.0;
function leader(tt, out) {
  return bez(-26, 74, 18, 66, 52, 44, 80, 30, progress(tt, F_T0, F_T1), out);
}
function vicOffset(j) { const r = (j + 1) >> 1; return [-6.5 * r, (j & 1 ? -1 : 1) * 5 * r]; }

const TMP = [0, 0, 0, 0], TMP2 = [0, 0, 0, 0];

export default {
  name: 'Skywriter',
  blurb: 'A 1930s Deco air-pageant poster: the time is smoke, written and re-written by little racers looping round their numerals.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, buf = g.buf;
    const t = f.h * 3600 + f.m * 60 + s;              // the animation clock: seconds since midnight
    ctx.lcd.backlight(1 - 0.5 * ctx.night);
    STAMPED = 0; PUFFS = 0; PLANES.length = 0;

    // ---- the turn we are nearest to: A before it, B after it, tt relative to it
    const date = ctx.date;
    const fA = s >= 30 ? f : clockFields(new Date(date.getTime() - 60000));
    const fB = s >= 30 ? clockFields(new Date(date.getTime() + 60000)) : f;
    const tt = s >= 30 ? s - 60 : s;
    const dA = DIG(fA), dB = DIG(fB), dNow = DIG(f);
    const hourTurn = fA.h !== fB.h;
    const showHour = hourTurn && tt > -3 && tt < 14;

    // ---- the sky: palette (changes ray by ray at the hour), sunburst
    let palNew = palOf(fB.h), palOld = palOf(fA.h);
    let sweep = 65536;                               // pixels with ANG < sweep use the new palette
    if (palNew !== palOld) {
      if (tt < 1) sweep = 0;
      else if (tt < 4) sweep = 32768 + Math.floor(ease.inOutQuad(progress(tt, 1, 4)) * 12.0001) * 2731;
    }
    if (sweep === 0) palNew = palOld;
    const ptN = PT[palNew], ptO = PT[palOld];
    const spin = showHour ? ease.inOutCubic(progress(tt, 0.2, 3.6)) * (65536 / 12) : 0;
    const rot = (((t * 1.5) / 360) * 65536 + spin) & 0xffff;
    {
      const rowsN0 = ptN.rows[0], rowsN1 = ptN.rows[1], rowsO0 = ptO.rows[0], rowsO1 = ptO.rows[1];
      const raysN = PAL[palNew].ray > 0, raysO = PAL[palOld].ray > 0, split = sweep > 0 && sweep < 65536;
      for (let y = 0, i = 0; y < HORIZON; y++) {
        const ry = (y << 4) | ((y & 3) << 2);
        for (let x = 0; x < W; x++, i++) {
          const a = ANG[i], wedge = (((a + rot) & 0xffff) * RAYS) >> 16 & 1;
          const nw = !split || a < sweep || a < 32768;
          buf[i] = nw ? (raysN && wedge ? rowsN1 : rowsN0)[ry | (x & 3)] : (raysO && wedge ? rowsO1 : rowsO0)[ry | (x & 3)];
        }
      }
      g.cost.px += W * HORIZON; g.cost.box += W * HORIZON * 3;
    }
    const pt = hourTurn && tt >= 0 && tt < 2.5 ? ptO : PT[palOf(f.h)];
    const night = palOf(f.h) === 'night';

    // ---- sun (or moon), searchlights
    if (night) {
      for (const [bx, w0, ph] of [[28, 0.19, 0.4], [134, 0.15, 2.6]]) {
        const th = -Math.PI / 2 + 0.55 * sin(t * w0 + ph), hw = 0.075, L = 120;
        const ax = bx + L * cos(th - hw), ay = HORIZON + L * sin(th - hw), cx2 = bx + L * cos(th + hw), cy2 = HORIZON + L * sin(th + hw);
        g.fillPolygon([[bx - 1, HORIZON], [ax, ay], [cx2, cy2], [bx + 1, HORIZON]], 0x9fb6dc, { a: 0.13 });
      }
      g.fillCircle(SUN_X, SUN_Y, 9, PT.night.sun);
    } else {
      g.fillCircle(SUN_X, SUN_Y, 12.5, ptN.sun);
    }

    // ---- the smoke, slot by slot
    const wallSec = s;
    const salute = (() => {                           // the opposition pass's crossing: bigger bursts
      const k = Math.floor(s / 15), s0 = k * 15;
      if (k < 1 || k > 3) return 0;
      const c = s - (s0 + 1.45);
      return c > -0.3 && c < 1.2 ? 1 : 0;
    })();
    const teamUntil = showHour ? 12 : -1;
    for (let k = 0; k < 4; k++) {
      const ox = SLOT_X[k], oy = SLOT_Y[k];
      const changing = dA[k] !== dB[k];
      const team = showHour && tt >= 0 ? k : -1;
      if (changing && tt < 0) {
        // the old numeral: its plane leaves at -1.6, the smoke drifts and thins
        const tpA = sinceWritten(k, f), stop = tpA - (tt + 1.6);
        if (tt < -1.6) {
          smoke(buf, dA[k], ox, oy, tpA, Infinity, 0, 0, 0, wallSec, t, pt, -1, -1, salute);
          onTour(dA[k], ox, oy, tpA / P, TMP); PLANES.push([TMP[0], TMP[1], TMP[2], TMP[3]]);
        } else {
          const q = ease.inOutQuad(progress(tt, -1.5, -0.25));
          if (q < 1) smoke(buf, dA[k], ox, oy, tpA, stop, q, 2.5 * q * q, -3.5 * q, wallSec, t, pt, -1, -1, 0);
          const u = progress(tt, -1.6, -0.6);
          if (u < 1) {
            onTour(dA[k], ox, oy, stop / P, TMP);
            exit(TMP[0], TMP[1], TMP[2], TMP[3], ease.inQuad(u) * 0.6 + u * 0.4, TMP2); PLANES.push([TMP2[0], TMP2[1], TMP2[2], TMP2[3]]);
          }
        }
        continue;
      }
      // a numeral being flown (it may have been written moments ago)
      const tp = sinceWritten(k, f);
      smoke(buf, dNow[k], ox, oy, tp, Infinity, 0, 0, 0, wallSec, t, pt, team, teamUntil, salute);
      onTour(dNow[k], ox, oy, tp / P, TMP); PLANES.push([TMP[0], TMP[1], TMP[2], TMP[3]]);
    }

    // ---- writers: entering before the turn, two of each trio peeling off after it
    const writers = [];
    for (let k = 0; k < 4; k++) if (dA[k] !== dB[k]) for (let w = 0; w < 3; w++) writers.push([k, w]);
    if (writers.length) {
      if (tt < 0 && tt > (hourTurn ? F_T0 : -0.8)) {
        if (hourTurn) formation(g, buf, writers, dB, tt, pt);
        else for (const [k, w] of writers) {
          if (w === 0 && false) continue;
          onTour(dB[k], SLOT_X[k], SLOT_Y[k], w / 3, TMP);
          entry(TMP[0], TMP[1], TMP[2], TMP[3], progress(tt, -0.8, 0), TMP2);
          PLANES.push([TMP2[0], TMP2[1], TMP2[2], TMP2[3]]);
        }
      } else if (tt >= 0 && tt < P / 3 + 1.0) {
        if (hourTurn && tt < 1.0) formation(g, buf, writers, dB, tt, pt);  // the burst's trails, fading
        for (const [k, w] of writers) {
          if (w === 0) continue;
          if (tt < P / 3) { onTour(dB[k], SLOT_X[k], SLOT_Y[k], w / 3 + tt / P, TMP); PLANES.push([TMP[0], TMP[1], TMP[2], TMP[3]]); continue; }
          onTour(dB[k], SLOT_X[k], SLOT_Y[k], (w + 1) / 3, TMP);
          const u = progress(tt, P / 3, P / 3 + 1.0);
          exit(TMP[0], TMP[1], TMP[2], TMP[3], ease.inQuad(u) * 0.6 + u * 0.4, TMP2);
          PLANES.push([TMP2[0], TMP2[1], TMP2[2], TMP2[3]]);
        }
      }
    }

    // ---- the opposition pass every 15 s
    {
      const k = Math.floor(s / 15), s0 = k * 15;
      if (k >= 1 && k <= 3 && s - s0 < 5.6) opposition(g, buf, s - s0, t);
    }

    // ---- land, buildings, title
    land(g, ptN, f, s);
    for (const p of PLANES) if (p[0] > -10 && p[0] < W + 10 && p[1] > -10 && p[1] < H + 10) plane(g, p[0], p[1], p[2], p[3], night);

    g.cost.px += STAMPED; g.cost.box += STAMPED + PUFFS * 30;
  },
};

// ------------------------------------------------------------ the hour's formation

function formation(g, buf, writers, dB, tt, pt) {
  // targets, and formation places sorted by x so the burst fans without crossing much
  const n = writers.length;
  const tgt = writers.map(([k, w]) => { onTour(dB[k], SLOT_X[k], SLOT_Y[k], w / 3, TMP); return [TMP[0], TMP[1], TMP[2], TMP[3]]; });
  const order = tgt.map((_, i) => i).sort((a, b) => tgt[a][0] - tgt[b][0]);
  leader(F_T1, TMP);
  const lhx = TMP[2], lhy = TMP[3];
  const slots = [];
  for (let j = 0; j < n; j++) { const [a, b] = vicOffset(j); slots.push([j, TMP[0] + a * lhx - b * lhy]); }
  slots.sort((p, q) => p[1] - q[1]);
  const vicOf = new Array(n);
  for (let r = 0; r < n; r++) vicOf[order[r]] = slots[r][0];
  const pos = (i, time, out) => {
    const [a, b] = vicOffset(vicOf[i]);
    if (time < F_T1) {
      leader(time, out);
      const hx = out[2], hy = out[3];
      out[0] += a * hx - b * hy; out[1] += a * hy + b * hx;
      return out;
    }
    leader(F_T1, out);
    const hx = out[2], hy = out[3], px = out[0] + a * hx - b * hy, py = out[1] + a * hy + b * hx;
    const [sx, sy, shx, shy] = tgt[i];
    return bez(px, py, px + hx * 16, py + hy * 16, sx - shx * 16, sy - shy * 16, sx, sy, ease.inOutQuad(progress(time, F_T1, 0)), out);
  };
  // trails: coloured smoke laid behind every plane until it reaches its numeral
  for (let i = 0; i < n; i++) {
    const c = to565([0xe4513a, 0xf2b33d, 0xf4ead2][i % 3]);
    for (let e = Math.min(tt, 0) - 0.02; e > F_T0 && tt - e < 1.2; e -= 1 / 30) {
      pos(i, e, TMP2);
      const age = tt - e;
      stampDither(buf, TMP2[0] + WIND_X * age, TMP2[1] + WIND_Y * age, 1.2 + age * 0.9, c, 0.9 * (1 - age / 1.2));
      PUFFS++;
    }
  }
  if (tt < 0) for (let i = 0; i < n; i++) { pos(i, tt, TMP2); PLANES.push([TMP2[0], TMP2[1], TMP2[2], TMP2[3]]); }
}

// ------------------------------------------------------------ the opposition pass

function opposition(g, buf, u, t) {
  const V = 64, L = 2.4;
  for (let p = 0; p < 2; p++) {
    const dir = p ? -1 : 1, y0 = p ? 64.5 : 61.5, c = to565(RIBBON[p]);
    const xAt = (e) => (p ? W + 14 - e * V : -14 + e * V);
    for (let e = Math.min(u, 3.2); e > 0 && u - e < L; e -= 1 / 40) {
      const x = xAt(e);
      if (x < -4 || x > W + 4) continue;
      const age = u - e;
      stampDither(buf, x + WIND_X * age, y0 + WIND_Y * age + 0.6 * sin(e * 5 + p), 1.3 + age * 0.35, c, 1.0 - age / L);
      PUFFS++;
    }
    if (u < 3.2) PLANES.push([xAt(u), y0 + 0.6 * sin(u * 5 + p), dir, 0]);
  }
}

// ------------------------------------------------------------ the airfield and the title

function land(g, pt, f, s) {
  g.gradient(0, HORIZON, W, H - HORIZON, [pt.bldg, pt.land, pt.land]);   // the airfield, airbrushed dark toward the frame
  // hangar: a Deco arched roof
  g.fillRect(6, 63, 30, 5, pt.bldg);
  g.fillEllipse(21, 63.5, 15, 3.5, pt.bldg);
  g.fillRect(12, 64, 6, 4, pt.land);
  g.fillRect(24, 64, 6, 4, pt.land);
  // control tower with its beacon on the beat
  g.fillRect(140, 58, 4, 10, pt.bldg);
  g.fillRect(137, 56, 10, 3, pt.bldg);
  g.fillRect(141, 54, 2, 2, pt.bldg);
  const beat = s - Math.floor(s);
  g.fillRect(141, 53, 2, 1, beat < 0.16 ? 0xff5a3c : 0x5a2a2a);
  // windsock
  g.fillRect(152, 60, 1, 8, pt.bldg);
  const fl = 0.8 * sin(s * 3.1);
  g.fillPolygon([[153, 60], [159, 60.6 + fl], [159, 62 + fl], [153, 62.4]], 0xd85a3a, { aa: true });
  // the poster's title: weekday, day, month in its Deco capitals
  const str = `${f.dow} ${f.day} ${f.month}`;
  const x0 = Math.round(80 - titleWidth(str) / 2), y = 72;
  let x = x0;
  for (const ch of str) {
    if (ch === ' ') { x += 3; continue; }
    const gl = TITLE[ch];
    if (!gl) { x += 4; continue; }
    for (let i = 0; i < gl.px.length; i += 2) g.buf[(y + gl.px[i + 1]) * W + x + gl.px[i]] = to565(pt.title);
    g.cost.blit += gl.px.length / 2;
    x += gl.w + 1;
  }
  // a thin rule each side of it
  g.fillRect(8, 74, x0 - 12, 1, pt.bldg);
  g.fillRect(x + 3, 74, W - 8 - x - 3, 1, pt.bldg);
}
