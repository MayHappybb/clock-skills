// Murmuration: winter dusk over a reed bed, and the time is a flock of
// starlings. Some 1,600-3,000 birds (1-2 px specks at sub-pixel positions)
// wheel in the afterglow, and their density draws the numerals: ten "flock
// numerals" made of swelling, slanted ribbons with dense cores and feathered
// edges (murmuration-glyphs.js). Hours ride high on the left, minutes dip low
// on the right, one flock banking across the sky.
//
// Always alive: closed bowls (0, 8, the bowl of 9) are loops the birds
// circle; density waves roll along every ribbon, each ribbon snakes and
// breathes, every bird flutters, a few stragglers peel off on a loop and
// rejoin, and every 5.5 s the "black wave" (a dark band of banking birds)
// sweeps through the whole flock. Reeds sway, cloud streaks drift, a few near
// starlings flap across the empty sky.
//
// Minute turn (58.6 to 61.5): the changing numeral's birds peel off at random
// (an even dissolve, never a partial glyph), rise in a twisting ribbon that
// loops through the sky on that numeral's own side, come back over the slot
// as a haze, and condense into the new numeral. Every old bird has left by
// :59.8; none settles before :00. Hour: a peregrine (a flat sickle-winged
// silhouette seen from below) stoops down the gap between hours and minutes
// and climbs out through them; the flock tears open round it in an
// area-preserving hole and swirls, the black wave chases it, and the changing
// numerals' rivers all feed one great tilted wheel across the sky before they
// pour back into the new hour (faster, so no numeral is empty for over ~1 s).
//
// Colour, one hue (ember amber, 25 deg, murmuration-ramp.js): nine named
// shades from burnt umber to a pale peach glow, the colours of a sky ten
// minutes after sunset, made into 65 steps snapped to on-hue RGB565 values;
// every pixel is one of them, in-betweens are an ordered dither between
// neighbours. By day the birds and silhouettes are umber on the glow. Night
// arrives as a dithered front from the top left over the 23:00 fade minute
// (each pixel is wholly day or night, so the digits never cross the sky's
// value): a soot sky, a pale moon, and the birds' winter spangles catch the
// moonlight, pale on the dark, at 40 % backlight.
//
// Cost: one integer pass over the glass (sky value from separable row and
// column tables plus a drifting cloud strip, flock coverage from the density
// map, a ramp lookup), and per bird a table lookup on its ribbon, a few
// multiplies and a bilinear splat into the density map; per-frame wave tables
// per sample (~1,000 kit.sin a frame). All charged to g.cost.box. Worst frame
// is midnight (four rivers). Nothing is redrawn per minute.
// Flash: numeral tables 44.6 KB, cloud strip 20.5 KB, moon 1.7 KB, ramp and
// small tables ~1.5 KB: ~68 KB. RAM: density map 12.8 KB, wave tables
// 8 x 256 x 3 int16 = 12.3 KB, sky tables ~1.5 KB: ~27 KB.

import { sin, cos, clockFields, rand, hash, from565 } from '../js/kit.js';
import { RAMP, BAYER } from './murmuration-ramp.js';
import { GLYPHS } from './murmuration-glyphs.js';
import { W, H, TOP, CLOUD, STEMS, PYLON, WIRES } from './murmuration-scene.js';

const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };

// ------------------------------------------------------------ layout
// hours high on the left, minutes low on the right: one flock dipping across the sky
const SLOTS = [[3, 3], [32, 3], [98, 25], [128, 25]];
const GW2 = 14, GH2 = 21;                 // glyph centre (slanted box)
// each slot's river: a loop out of the slot and back on its own side, away from its neighbours
// [Ax: how far out sideways, Lx: how wide the loop opens, Ay: how high, Ly]
const RIVER = [[-20, -10, 30, 6], [26, 11, 30, -6], [-24, -9, 40, 6], [16, 3, 50, 0]];

// ------------------------------------------------------------ working buffers (RAM)
const D = new Uint8ClampedArray(W * H);  // flock density, 12.8 KB
const COV = new Uint16Array(256);          // density -> coverage 0..256
for (let d = 0; d < 256; d++) COV[d] = Math.min(256, Math.round(256 * Math.pow(d / 250, 0.8)));
const rowV = new Int16Array(H), gy = new Int16Array(H), vy = new Int16Array(H);
const gx = new Int16Array(W), vx = new Int16Array(W);
const rowN = new Int16Array(H);           // the night sky by row
const FRX = new Int16Array(W), FRY = new Int16Array(H);   // the night front: when each pixel goes over
const BANDX = new Uint16Array(W + 1);     // the black wave: bird weight by x
const FX = new Float32Array(64), FY = new Float32Array(64);
const TB = 256;                            // table region per glyph instance (max 236 samples)
const WAVE = new Float32Array(8 * TB), BREA = new Float32Array(8 * TB), LAT = new Float32Array(8 * TB);

// ------------------------------------------------------------ the flock
let ops = 0;   // integer work this frame, charged to the estimate

function splat(x, y, w) {
  if (x < 0 || y < 0 || x >= W - 1 || y >= H - 1) return;
  const ix = x | 0, iy = y | 0, fx = x - ix, fy = y - iy;
  const i = iy * W + ix;
  const a = w * (1 - fy), b = w * fy;
  D[i] += a * (1 - fx); D[i + 1] += a * fx; D[i + W] += b * (1 - fx); D[i + W + 1] += b * fx;
}

/** Per-frame tables for one digit: density wave and breathing per sample. */
function digitTables(G, base, t, ph) {
  for (const { s0, n, closed } of G.strokes) {
    // a closed loop carries a whole number of waves, so there is no seam where it wraps
    const kw = closed ? (TAU * Math.max(1, Math.round((0.085 * n) / TAU))) / n : 0.085;
    const kb = closed ? (TAU * Math.max(1, Math.round((0.05 * n) / TAU))) / n : 0.05;
    const kl = closed ? (TAU * Math.max(1, Math.round((0.11 * n) / TAU))) / n : 0.11;
    for (let k = 0; k < n; k++) {
      const env = G.env[s0 + k];
      WAVE[base + s0 + k] = 6 * env * sin(kw * k - 2.7 * t + ph);
      BREA[base + s0 + k] = 1 + 0.24 * sin(kb * (s0 + k) - 1.5 * t + ph * 1.7);
      // the ribbon snakes: a transverse ripple running along it
      LAT[base + s0 + k] = 0.95 * (0.4 + 0.6 * env) * sin(kl * k - 3.1 * t + ph * 2.3);
    }
  }
  ops += G.samples * 9;
}

// scratch for one bird's rest position
let BX = 0, BY = 0;
/** Rest position of bird i of glyph G at slot origin (ox, oy), time t. */
function restPos(G, base, i, ox, oy, t) {
  const B = G.birds, st = G.strokes[B.st[i]], n = st.n;
  let u = B.u[i];
  if (st.closed) { u += 7 * t + WAVE[base + st.s0 + (u | 0)]; u %= n; if (u < 0) u += n; }
  else { u += WAVE[base + st.s0 + (u | 0)]; if (u < 0) u = 0; else if (u > n - 1.001) u = n - 1.001; }
  const k = u | 0, f = u - k, j = st.s0 + k, j2 = st.closed ? st.s0 + ((k + 1) % n) : j + 1;
  const px = G.sx[j] + (G.sx[j2] - G.sx[j]) * f, py = G.sy[j] + (G.sy[j2] - G.sy[j]) * f;
  const sd = B.seed[i];
  let v = B.v[i] * G.hw[j] * BREA[base + j] + LAT[base + j];
  // edge birds stream and ripple
  if (B.v[i] > 1 || B.v[i] < -1) v += (B.v[i] > 0 ? 0.9 : -0.9) * (0.5 + FX[(sd + 17) & 63]);
  let x = ox + px + G.nx[j] * v + FX[sd & 63], y = oy + py + G.ny[j] * v + FY[sd & 63];
  // stragglers peel away on a loop and rejoin
  if (sd < 3) {
    const P = 8 + (sd % 3) * 1.7, ph = ((t + sd * 1.37) % P) / P;
    if (ph < 0.42) {
      const e = sin((Math.PI * ph) / 0.42), R = 8 + sd * 3, a = (TAU * ph) / 0.42 + sd;
      x += e * R * cos(a) * 1.2; y += e * R * sin(a) * 0.7;
    }
  }
  BX = x; BY = y;
  ops += 30;
}

// the falcon: where it is this frame and how wide a hole the flock tears round it (0: no falcon)
let HX = -99, HY = -99, HR = 0;
const REACH2 = 26 * 26;

/** One bird into the density map: shied from the falcon, weighted by the black wave. */
function bird(x, y, w) {
  if (HR > 0) {
    const dx = x - HX, dy = y - HY, d2 = dx * dx + dy * dy;
    if (d2 < REACH2) {
      // an area-preserving hole of radius HR opens round the falcon, fading out by the reach,
      // and the birds nearest it are flung round it: the vortex
      const h2 = HR * HR, fall = (1 - d2 / REACH2) * (1 - d2 / REACH2);
      const k = 1 + (Math.sqrt(1 + h2 / (d2 + 0.25)) - 1) * fall;
      const a = (0.55 * h2 * fall) / (d2 + h2), c = cos(a), sn = sin(a);
      const ex = dx * k, ey = dy * k;
      x = HX + ex * c - ey * sn; y = HY + ex * sn + ey * c;
      ops += 24;
    }
  }
  const xi = x < 0 ? 0 : x > W ? W : x | 0;
  splat(x, y, (w * BANDX[xi]) >> 8);
}

function drawRest(G, base, t, ox, oy) {
  for (let i = 0; i < G.n; i++) {
    restPos(G, base, i, ox, oy, t);
    bird(BX, BY, 125);
  }
  ops += G.n * 12;
}

/**
 * The changing slot's birds: they peel off the old numeral, ride a river
 * through the sky and pour into the new one. sT: seconds into the old minute
 * (58.x .. 61.x). Every old bird has left its place by :59.7; none settles
 * into the new numeral before :00. At the hour the rivers all feed one great
 * vortex wheeling in the middle of the sky instead of each its own loop.
 */
function drawRiver(Go, Gn, slot, t, sT, ox, oy, mk, hour) {
  const [Ax, Lx, Ay, Ly] = RIVER[slot];
  const cx = ox + GW2, cy = oy + GH2, bo = slot * 2 * TB, bn = bo + TB;
  const M = Go.n > Gn.n ? Go.n : Gn.n;
  for (let i = 0; i < M; i++) {
    const TM = hour ? TIMING[1] : TIMING[0], FLY = TM[0];
    const tau = (sT - (TM[1] + TM[2] * rand(i, slot, mk & 0xffff))) / FLY;
    let w = 125, x, y;
    if (tau <= 0) {
      if (i >= Go.n) continue;
      restPos(Go, bo, i, ox, oy, t); x = BX; y = BY;
    } else if (tau >= 1) {
      if (i >= Gn.n) continue;
      restPos(Gn, bn, i, ox, oy, t); x = BX; y = BY;
    } else {
      const a = smooth(tau / OUTF), b = smooth((tau - (1 - INF)) / INF);
      let sx, sy;
      // the spine flies its loop between leaving and settling: by the time a bird starts to settle
      // its river is back over the slot as a haze, so a numeral only ever condenses out of a cloud
      const ts = clamp01((tau - 0.05) / (1 - INF - 0.07));
      if (!hour) {
        // the spine: a loop up out of the slot and back down into it
        const s1 = sin(Math.PI * ts), s2 = s1 * s1, s3 = sin(TAU * ts);
        sx = cx + Ax * s2 + Lx * s3; sy = cy - Ay * s2 - Ly * s3;
      } else {
        // into the vortex and out again: a flat, tilted wheel across the whole sky
        const m = smooth(ts / 0.3) * smooth((1 - ts) / 0.3);
        const th = slot * 1.57 + TAU * 1.2 * ts, ct = cos(th);
        const vx = VX + 58 * ct, vy = VY + 6 * sin(th) + 0.2 * 58 * ct + 3 * sin(5 * th);
        sx = cx + (vx - cx) * m; sy = cy + (vy - cy) * m;
      }
      // across the river: a twisting ribbon in flight, a shapeless swarm over the slot
      // as the birds leave and as they arrive, so no stream is ever joined to a numeral
      const tw = 2.2 + 5 * Math.abs(sin(3 * Math.PI * ts + slot));
      const r1 = rand(i, slot, 11) - 0.5, r2 = rand(i, slot, 12) - 0.5;
      // haze while the spine is inside the numeral's own box, ribbon once it is out in the sky
      const bxo = sx < ox ? ox - sx : sx > ox + 30 ? sx - ox - 30 : 0, byo = sy < oy ? oy - sy : sy > oy + 44 ? sy - oy - 44 : 0;
      const dout = bxo > byo ? bxo : byo;
      const sw = 1 - smooth(dout / 14);
      const sd = hash(i, slot, 13) & 63;
      const rx = 2 * tw + (26 - 2 * tw) * sw, ry = 1.4 * tw + (28 - 1.4 * tw) * sw;
      const px = sx + r1 * rx + FX[sd] * 2, py = sy + r2 * ry + FY[sd] * 2;
      x = px; y = py;
      if (a < 1) { restPos(Go, bo, i % Go.n, ox, oy, t); x += (BX - px) * (1 - a); y += (BY - py) * (1 - a); }
      if (b > 0) { restPos(Gn, bn, i % Gn.n, ox, oy, t); x += (BX - px) * b; y += (BY - py) * b; }
      // thinner in flight: a river is a haze of birds, never as dark as a numeral's stroke
      w *= 1 - 0.45 * (a < 1 - b ? a : 1 - b);
      if (i >= Go.n) w *= a;
      if (i >= Gn.n) w *= 1 - b;
      ops += 44;
    }
    bird(x, y, w);
  }
  ops += M * 14;
}
// the turn's timing (seconds of the old minute): departures from DEP0 over DEPS, each flight FLY long;
// a bird is off its old place OUTF of the way in and starts to settle INF before the end,
// so the last old bird is gone by DEP0 + DEPS + OUTF * FLY = 59.8 and no new one settles before 60.0
// so the last old bird is gone by 59.8 and no new one settles before 60.0. The hour flies faster,
// so its three changing numerals are never empty for more than about a second.
const OUTF = 0.14, INF = 0.32;
const TIMING = [2.0, 1.65].map((FLY) => { const d0 = 60 - (1 - INF) * FLY; return [FLY, d0, 59.8 - OUTF * FLY - d0]; });
const VX = 98, VY = 22;     // the hour's vortex: over the changing numerals, clear of the first hour digit (which may stay)

// ------------------------------------------------------------ the falcon

const FAL0 = 58.6, FALD = 3.0;    // the stoop, in seconds of the old minute
/** The falcon's flight at u (0..1): a stoop down the gap between hours and minutes, then a long climb out through the minutes and the vortex. */
function falconAt(u) {
  const x = 60 + 116 * u;
  let y;
  if (u < 0.3) { const q = (u - 0.3) / 0.3; y = 46 - 62 * q * q; }
  else { const q = (u - 0.3) / 0.7; y = 46 - 58 * q * q; }
  return [x, y];
}

/**
 * The peregrine seen from below, nose along +x: long sickle wings swept back
 * in the stoop (spread 0) or open (1), a narrow barred tail, a blunt head.
 */
const FAL_S = 1.5;
function drawFalcon(g, x, y, ang, spread, flap, c) {
  const ca = Math.cos(ang) * FAL_S, sa = Math.sin(ang) * FAL_S;
  // the wing: a sickle from the shoulder, bent forward at the wrist, swept back to a sharp tip;
  // flap 0..1 is the beat (seen from below the span shortens as the wings come down)
  const sp = spread * flap;
  const tx = -4.0 - 3.4 * (1 - spread) + 1.2 * sp, ty = 2.8 + 6.4 * sp;            // tip
  const mx = 1.2 - 1.6 * (1 - spread), my = 1.6 + 3.4 * sp;                        // wrist, leading edge
  const rx = -2.6 + 0.6 * sp, ry = 1.4 + 2.6 * sp;                                  // trailing edge, inner
  const half = [[5.6, 0], [5.2, 0.8], [3.8, 1.0], [2.6, 1.3], [mx, my], [tx + 0.8, ty - 0.2], [tx, ty], [tx + 1.2, ty - 1.4], [rx, ry], [-3.0, 1.1],
    [-4.0, 0.9], [-7.6, 1.6], [-8.2, 0.7], [-8.4, 0]];
  const P = [...half, ...half.slice(0, -1).reverse().map(([px, py]) => [px, -py])].slice(0, -1);
  g.fillPolygon(P.map(([px, py]) => [x + px * ca - py * sa, y + px * sa + py * ca]), c, { aa: true });
}

// ------------------------------------------------------------ near starlings

/** Three starlings close to the glass cross the empty sky over the minutes now and then. */
function nearBirds(g, t, c) {
  for (let k = 0; k < 3; k++) {
    const P = 11 + k * 3.3, ph = ((t + k * 4.1) % P) / P;
    if (ph > 0.5) continue;
    const u = ph / 0.5;
    const x = 168 - 108 * u, y = 6 + k * 4.5 + 2.5 * sin(u * 7 + k) - 3 * sin(Math.PI * u);
    // a starling's flapping V: tips up on the upstroke, a flat dash at the bottom of the beat
    const fl = sin(t * 22 + k * 2), span = 2.4 + 0.3 * k, ty = y - 1.7 * fl;
    g.thickLine(x - span, ty, x, y + 0.3, 1.0, c, { aa: true });
    g.thickLine(x, y + 0.3, x + span, ty, 1.0, c, { aa: true });
  }
}

// ------------------------------------------------------------ the moon (flash): value added to the night sky
const MX = 82, MY = 11, MW = 32, MH = 26, MX0 = MX - 16, MY0 = 0;
const MOON = new Int16Array(MW * MH);
for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
  const d = Math.hypot(MX0 + i + 0.5 - MX, MY0 + j + 0.5 - MY);
  const disc = clamp01(4.9 - d);
  MOON[j * MW + i] = Math.round(200 * disc + (1 - disc) * 36 * Math.exp(-Math.max(0, d - 4.5) / 4.5));
}

// ------------------------------------------------------------ the sky
// flash tables: the sky's vertical curves, and the afterglow's spread
const Q15 = new Int16Array(H), Q18 = new Int16Array(H), GAUSS = new Int16Array(W + 1);
for (let y = 0; y < H; y++) { const q = Math.min(1, y / 72); Q15[y] = Math.round(256 * q ** 1.5); Q18[y] = Math.round(256 * q ** 1.8); }
for (let d = 0; d <= W; d++) GAUSS[d] = Math.round(256 * Math.exp(-((d / 48) ** 2)));

function skyTables(f, night) {
  const hr = f.h + f.m / 60 + f.sec / 3600;
  const noonK = smooth(1 - Math.abs(hr - 13) / 5.5);
  // noon is high-key and flat; dawn and dusk are deep overhead with a strong afterglow low down
  const duskK = smooth(1 - Math.abs(hr - 18.3) / 2.6) + smooth(1 - Math.abs(hr - 7.6) / 1.8);
  const T = 104 + 62 * noonK - 22 * duskK, Hz = 226 + 12 * noonK, Gs = 40 - 30 * noonK + 26 * duskK;
  const Gx = hr < 12.5 ? 34 : 124;
  for (let y = 0; y < H; y++) {
    const q = y / 72, qq = q > 1 ? 1 : q;
    rowV[y] = T + (((Hz - T) * Q15[y]) >> 8);
    rowN[y] = 22 + ((46 * Q18[y]) >> 8);
    gy[y] = 256 * qq * qq * qq;
    vy[y] = 256 * (1 - q) * (1 - q);
    FRY[y] = 2 * y;
  }
  for (let x = 0; x < W; x++) {
    const d = x - Gx;
    gx[x] = (Gs * GAUSS[d < 0 ? -d : d]) >> 8;
    const e = (x - 80) / 80;
    vx[x] = 34 * e * e;
    FRX[x] = x;
  }
  ops += (W + H) * 14;
}

// ------------------------------------------------------------ the face

export default {
  name: 'Murmuration',
  blurb: 'Starlings over a reed bed at winter dusk: the flock\'s density draws the time; each minute a numeral peels off in a river and pours back in, and at the hour a falcon tears through.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, t = (ctx.date.getTime() / 1000) % 86400, mk = f.minuteKey;
    const night = ctx.night;
    ctx.lcd.backlight(1 - 0.6 * night);
    ops = 0;
    D.fill(0);
    for (let k = 0; k < 64; k++) {
      FX[k] = 0.45 * sin(t * (2.1 + (k & 7) * 0.31) + k * 2.4);
      FY[k] = 0.4 * cos(t * (1.7 + (k >> 3) * 0.27) + k * 1.3);
    }

    // which digits, and is a turn under way
    let cur = f.hh + f.mm, old = null, sT = 0, mkT = mk;
    if (s >= 58) { old = cur; const n = clockFields(new Date(ctx.date.getTime() + 60000)); cur = n.hh + n.mm; sT = s; }
    else if (s < 2) { const p = clockFields(new Date(ctx.date.getTime() - 60000)); old = p.hh + p.mm; sT = s + 60; mkT = mk - 1; }
    const hour = old !== null && old[0] + old[1] !== cur[0] + cur[1];

    // the falcon at the hour
    HR = 0;
    let fal = null;
    if (hour) {
      const u = (sT - FAL0) / FALD;
      if (u > 0 && u < 1) {
        const [x, y] = falconAt(u), [x2, y2] = falconAt(Math.min(1, u + 0.01));
        fal = [x, y, Math.atan2(y2 - y, x2 - x), u];
        HX = x - 2 * Math.cos(fal[2]); HY = y - 2 * Math.sin(fal[2]);
        HR = 6 * Math.sqrt(sin(Math.PI * u));
      }
    }
    // the black wave: a dark band of banking birds sweeps through the flock every 7 s;
    // at the hour it is the flock's escape wave, chasing the falcon
    {
      let X, amp = 380;
      if (fal) { X = fal[0] - 14; amp = 300; }
      else { const P = 5.5, ph = (t % P) / P; X = -40 + ph * 260; }
      for (let x = 0; x <= W; x++) {
        const d = (x - X) / 11;
        BANDX[x] = 256 + (d > -1 && d < 1 ? amp * (1 - d * d) * (1 - d * d) : 0);
      }
    }

    for (let k = 0; k < 4; k++) {
      const [x0, y0] = SLOTS[k];
      const ox = x0 + 0.8 * sin(t * 0.5 + k * 1.9), oy = y0 + 0.7 * sin(t * 0.37 + k * 2.3);
      const Gn = GLYPHS[cur.charCodeAt(k) - 48];
      if (old !== null && old[k] !== cur[k]) {
        const Go = GLYPHS[old.charCodeAt(k) - 48];
        digitTables(Go, k * 2 * TB, t, k * 1.3);
        digitTables(Gn, (k * 2 + 1) * TB, t, k * 1.3);
        drawRiver(Go, Gn, k, t, sT, ox, oy, mkT, hour);
      } else {
        digitTables(Gn, k * 2 * TB, t, k * 1.3);
        drawRest(Gn, k * 2 * TB, t, ox, oy);
      }
    }

    // ---- composite: the sky's value, the flock over it, through the ramp.
    // By day the birds are umber on the glow; by night the sky is soot and the
    // birds' winter spangles catch the moon, pale on the dark. Night comes as a
    // front from the top left: each pixel is wholly one or the other.
    skyTables(f, night);
    const buf = g.buf, ci = (t * 1.6) % 256, c0 = ci | 0, cf = ((ci - c0) * 256) | 0;
    const VB = 8, VBN = 206, SILD = RAMP[1], SILN = RAMP[0];
    const fading = night > 0 && night < 1, allN = night >= 1;
    const FT = Math.round(night * 500) - 22;     // the front's position in (x + 2y + dither) units
    for (let y = 0; y < H; y++) {
      const rv = rowV[y], rn = rowN[y], gyy = gy[y], vyy = vy[y], crow = y * 256, by = (y & 3) << 2;
      const inMoon = y < MH;
      for (let x = 0; x < W; x++) {
        const i = y * W + x, bay = BAYER[by | (x & 3)];
        const nt = allN || (fading && FRX[x] + FRY[y] + bay * 1.4 < FT);
        if (y >= TOP[x]) { buf[i] = nt ? SILN : SILD; continue; }
        const cA = CLOUD[crow + ((x + 256 - c0) & 255)], cB = CLOUD[crow + ((x + 255 - c0) & 255)];
        const cl = (cA * (256 - cf) + cB * cf) >> 8;
        let v, vb;
        if (!nt) { v = rv + ((gx[x] * gyy) >> 8) - ((vx[x] * vyy) >> 8) + cl; vb = VB; }
        else {
          v = rn + (cl >> 1) - ((vx[x] * vyy) >> 9); vb = VBN;
          if (inMoon && x >= MX0 && x < MX0 + MW) v += MOON[y * MW + x - MX0];
        }
        const d = D[i];
        if (d) v += ((vb - v) * COV[d]) >> 8;
        v += bay >> 2;
        buf[i] = RAMP[v < 0 ? 0 : v > 259 ? 64 : v >> 2];
      }
    }
    g.cost.px += W * H; g.cost.box += W * H * 6;

    // ---- in front: the pylon and its wires, the reeds, the near birds, the falcon
    const dark = 0x211410;
    const nearC = night > 0.5 ? from565(RAMP[VBN >> 2]) : from565(RAMP[VB >> 2]);
    for (const [a, b, c, d] of PYLON) g.line(a, b, c, d, dark);
    for (const [x0, y0, x1, y1, sag] of WIRES) {
      let px = x0, py = y0;
      for (let k = 1; k <= 8; k++) {
        const u = k / 8, x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u + sag * 4 * u * (1 - u);
        g.line(px, py, x, y, dark); px = x; py = y;
      }
    }
    for (const [x, tall, lean, ph] of STEMS) {
      // a reed: a hairline from the bed, its tip bowing in the wind
      const sw = lean + 0.9 * sin(t * 1.3 + ph + x * 0.05) + 0.3 * sin(t * 2.9 + ph * 2);
      const by = TOP[x | 0] + 1;
      g.thickLine(x, by, x + sw, by - tall, 0.9, dark, { aa: true });
    }
    if (!fal) nearBirds(g, t, nearC);
    if (fal) {
      const u = fal[3], spread = smooth((u - 0.26) / 0.2);
      drawFalcon(g, fal[0], fal[1], fal[2], spread, 0.55 + 0.45 * Math.abs(sin(t * 12)), nearC);
    }
    g.cost.box += ops;
  },
};
