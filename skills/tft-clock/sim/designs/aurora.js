// Aurora: the northern lights over a frozen lake, and the time is the
// aurora. Each numeral is one aurora curtain hung in the sky in the shape of
// its digit (aurora-glyphs.js: one continuous ribbon per digit, drawn as the
// sky draws it): every stroke has the curtain's sharp pink lower hem, a
// white-hot core above it and green fading upward, vertical rays running
// through it, its weight sunk to the hem, and faint rays rising off the
// head of each digit. The four curtains recede in perspective: the far
// hours small and low over the horizon, the near minutes tall and high;
// two stars are the colon. Under them a far spruce line, tall snowy spruces
// at the edges, and the black ice of the lake, a still mirror: the sky
// comes back as itself, the curtains dimmed in it, across drifted snow.
//
// The time is alive: folds run along every ribbon, its rays drift along
// it, a brightening laps each ribbon every ~2 s and the hems sway. On every
// second, the beat: the rays over the heads shoot up, a glow blooms round
// each curtain and fades, the folds shiver and the hems flare. At :15, :30
// and :45 a surge runs along the whole curtain (east to west at :30): each
// digit kinks and brightens as it passes, its rays stand tall, and a glint
// crosses the ice under it. Far behind, a faint rayed veil drifts the other
// way.
//
// Minute turn, the aurora's own breakup: each changing curtain gathers and
// dips (:58.5), then breaks into rays from west to east that shoot up into
// the sky, accelerating, and drift east (:59.2-:59.6); while they hang, the
// ribbon underneath re-forms point by point into the new digit (:59.7-:00.25);
// then the rays fall, decelerating, and land west to east on the new shape,
// each column's hem sagging a pixel and springing back (to :01.5). Old
// digits are rays before :00, new ones read after it; the rayed window is
// about 1.1 s, never blank. Hour: as the new hours land, a corona bursts
// overhead: rays converging on the magnetic zenith above the glass sweep
// down the whole sky and flicker on the beat for ~10 s, a dark moat keeps
// every curtain clear of them, and the sky and the aurora turn to the new
// hour's colours.
//
// Palette: an aurora's real emissions, flat: oxygen green, the nitrogen pink
// of a strong display's lower border, the white of its brightest core, a
// red or violet top; three colourways that rotate by the hour (green and
// pink; cyan and magenta; the rare lime and crimson), on a sky that follows
// the polar winter day (navy night, a deep twilight blue at noon, violet
// dusk). The curtains are the only bright, saturated thing on the glass; the
// ground is the one flat sky colour, the spruces near black, the snow a dim
// blue lit by the aurora. Night (23-07) is the navy sky with the backlight
// at 50 %: the curtains stay full strength, so nothing goes muddy.
//
// Cost: the curtains are stamped from 96 points each (soft discs, or
// vertical rays in a turn) into two byte maps, coverage and glow (~30-50k
// integer pixel visits); one integer pass colours the sky column by column
// from the horizon up through small colour tables (depth above a stroke's
// lower edge -> hem/core/green), the veil and the corona are table lookups,
// the lake one integer mix a pixel. No per-pixel callbacks, no float maths
// per pixel, nothing cached across frames: every frame is built cold.
// Every motion runs a whole number of cycles a day, so midnight is seamless.
import { clockFields, to565, clamp, progress, sin, noise, hash } from '../js/kit.js';
import { GLYPHS, N, PAIR } from './aurora-glyphs.js';

const W = 160, H = 80;
const HZ = 58;                 // first lake row
const SKY = HZ * W;

const smooth = (u) => u * u * (3 - 2 * u);
const TAU = Math.PI * 2;
// every motion runs a whole number of cycles a day, so midnight is seamless:
// phase(n, T) is n cycles per day at T seconds into the day
const DAY = 86400;
const cyc = (w) => Math.round((w * DAY) / TAU);
const phase = (n, T) => ((n * T) % DAY) * (TAU / DAY);
const W_SWAY = cyc(0.83), W_FOLD = cyc(5.0), W_KINK = cyc(3.0), W_VEIL1 = cyc(0.21), W_VEIL2 = cyc(0.37);
// periodic value noise (lattice period 64) for the rays
const NTAB = Float32Array.from({ length: 64 * 4 }, (_, i) => (hash(i & 63, i >> 6, 5) >>> 8) / 16777216);
function pnoise(x, row) {
  const i = x | 0, fx = x - i, u = fx * fx * (3 - 2 * fx), a = NTAB[(row << 6) | (i & 63)], b = NTAB[(row << 6) | ((i + 1) & 63)];
  return a + (b - a) * u;
}
// a gaussian bump exp(-d*d) for |d| < 3, from a table
const GT = Float32Array.from({ length: 97 }, (_, i) => Math.exp(-(((i - 48) / 16) ** 2)));
const gauss = (d) => (d > -3 && d < 3 ? GT[((d + 3) * 16 + 0.5) | 0] : 0);

// ------------------------------------------------------------ layout: one curtain receding to the left
// far hours small and low, near minutes big and high: the lower border of a
// curtain descends toward the horizon with distance
const SLOTS = [
  { x: 17, y: 18, w: 22, h: 34, r: 2.35 },
  { x: 42, y: 14, w: 24, h: 37, r: 2.55 },
  { x: 76, y: 7, w: 27.5, h: 43, r: 2.95 },
  { x: 106, y: 2, w: 30, h: 47, r: 3.25 },
];
const COLON = [[70, 27], [70, 39]];

// ------------------------------------------------------------ colour
const hx = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const mixc = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
const c565 = (c) => to565((clamp(Math.round(c[0]), 0, 255) << 16) | (clamp(Math.round(c[1]), 0, 255) << 8) | clamp(Math.round(c[2]), 0, 255));

const SKYKEYS = [[0, '#060c1f'], [4, '#070a1c'], [7, '#11123a'], [10, '#1a2a5e'], [12, '#21376e'], [14, '#1c2b60'], [16, '#25184f'], [19, '#150e36'], [21, '#0a0f29'], [24, '#060c1f']]
  .map(([h, c]) => [h, hx(c)]);
const SETS = [
  // classic oxygen green with the nitrogen-pink hem of a strong display
  ['#ff3d9a', '#ffc4e4', '#dcffe6', '#80ffae', '#3fe884', '#2cc470', '#26a068', '#9a5cff', '#4ee88a'],
  // a cyan night
  ['#ff4fd6', '#ffd2f4', '#dcfffa', '#80fff0', '#3fe0dc', '#2db8d2', '#2b90cc', '#7a6cff', '#46d4e6'],
  // the rare one: lime curtains, crimson hems and red tops
  ['#ff3050', '#ffcfb2', '#fffadc', '#d8ff7a', '#a8f050', '#82d044', '#64b044', '#ff4a3c', '#b4f060'],
].map((s) => s.map(hx));

function paletteFor(h) {
  let sky = SKYKEYS[0][1];
  for (let i = 0; i < SKYKEYS.length - 1; i++) {
    const [h0, c0] = SKYKEYS[i], [h1, c1] = SKYKEYS[i + 1];
    if (h + 0.5 >= h0 && h + 0.5 <= h1) { sky = mixc(c0, c1, (h + 0.5 - h0) / (h1 - h0)); break; }
  }
  const s = SETS[h % 3];
  return { sky, band: s.slice(0, 7), fringe: s[7], corona: s[8] };
}
function lerpPal(a, b, u) {
  if (u <= 0) return a; if (u >= 1) return b;
  return { sky: mixc(a.sky, b.sky, u), band: a.band.map((c, i) => mixc(c, b.band[i], u)), fringe: mixc(a.fringe, b.fringe, u), corona: mixc(a.corona, b.corona, u) };
}

// depth from a stroke's lower edge -> colour bucket: the hem is pink, the core white-hot, then green fading up
const DEPB = Uint8Array.from({ length: 64 }, (_, d) => (d < 9 ? [0, 0, 1, 2, 3, 3, 4, 4, 4][d] : d < 16 ? 5 : d < 24 ? 6 : 7));
const GAIN = [1, 1, 1, 1, 0.97, 0.93, 0.9, 0.86];
const NB = 8, NL = 32;
const LUTB = new Uint16Array(NB * NL), LUTF = new Uint16Array(8 * NL), LUTG = new Uint16Array(16), LUTC = new Uint16Array(4 * 16), LUTV = new Uint16Array(8);
let lutKey = '';
let SKY565 = 0;
function buildLuts(p, key) {
  if (key === lutKey) return 0;
  lutKey = key;
  const top = mixc(p.band[6], p.fringe, 0.2), bands = [...p.band, top];
  for (let b = 0; b < NB; b++) for (let l = 0; l < NL; l++) {
    const u = Math.min(1, (l / (NL - 1)) * GAIN[b] * 1.12);
    LUTB[b * NL + l] = c565(mixc(p.sky, bands[b], u));
  }
  for (let f = 0; f < 8; f++) for (let l = 0; l < NL; l++) {
    const col = mixc(p.band[4], p.fringe, Math.min(1, f / 5));
    LUTF[f * NL + l] = c565(mixc(p.sky, col, 0.45 * (l / (NL - 1)) * (1 - f / 10)));
  }
  for (let l = 0; l < 16; l++) LUTG[l] = c565(mixc(p.sky, p.band[4], 0.2 * l / 15));
  for (let l = 0; l < 8; l++) LUTV[l] = c565(mixc(p.sky, mixc(p.band[5], p.fringe, 0.45), 0.32 * l / 7));
  for (let r = 0; r < 4; r++) for (let l = 0; l < 16; l++) {
    const col = mixc(p.fringe, p.corona, r / 3);
    LUTC[r * 16 + l] = c565(mixc(p.sky, col, 0.6 * l / 15));
  }
  SKY565 = c565(p.sky);
  return NB * NL + 8 * NL + 16 + 64;
}

// ------------------------------------------------------------ the corona's geometry (flash): angle and distance from the magnetic zenith
const ZX = 92, ZY = -34;
const ANG = new Uint8Array(SKY), RAD = new Uint8Array(SKY);
for (let y = 0; y < HZ; y++) for (let x = 0; x < W; x++) {
  const dx = x + 0.5 - ZX, dy = y + 0.5 - ZY;
  ANG[y * W + x] = clamp(Math.round(128 + Math.atan2(dx, dy) * 120), 0, 255);
  RAD[y * W + x] = clamp(Math.round(Math.hypot(dx, dy)), 0, 255);
}

// ------------------------------------------------------------ the shore (flash): far spruce line, tall spruces at the edges, snow
// PINE: 0 none, 1 needles, 2 snow on a bough, 3 shore snow
const PINE = new Uint8Array(SKY);
function spruce(cx, ty, by) {
  for (let y = Math.max(0, ty); y < by; y++) {
    const d = y - ty, tier = d % 4;
    const hw = (0.5 + d * 0.3) * (0.62 + 0.38 * tier / 3);
    for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
      if (x < 0 || x >= W || Math.abs(x + 0.5 - cx) > hw + 0.25) continue;
      const i = y * W + x;
      PINE[i] = tier === 0 && d > 2 && Math.abs(x + 0.5 - cx) > 0.6 ? 2 : (PINE[i] === 2 ? 2 : 1);
    }
  }
}
(function shore() {
  // the far forest under the curtain: a low comb of tiny spires
  for (let x = 0; x < W; x++) {
    const h = 2 + Math.round(2.2 * noise(x / 3.1, 11) + (hash(x, 5) % 7 === 0 ? 2 : 0));
    for (let y = HZ - 2 - h; y < HZ - 2; y++) PINE[y * W + x] = 1;
  }
  // tall spruces where there is no curtain: the left edge, the gap, the right edge
  for (const [cx, ty] of [[3, 30], [10.5, 37], [-1, 42], [70.5, 47], [146, 33], [153.5, 26], [140.5, 41], [160, 38]]) spruce(cx, ty, HZ - 2);
  for (let x = 0; x < W; x++) for (let y = HZ - 2; y < HZ; y++) PINE[y * W + x] = 3;
})();
const PINE_IDX = [];
for (let i = 0; i < SKY; i++) if (PINE[i]) PINE_IDX.push(i);
const PINE_LIST = Int32Array.from(PINE_IDX);

// ------------------------------------------------------------ the frozen lake (flash): drifted snow on black ice
const DRIFT = new Uint8Array((H - HZ) * W);
for (let y = 0; y < H - HZ; y++) for (let x = 0; x < W; x++) {
  const n = noise(x / 13 + y * 0.9, 21 + y) * 0.7 + noise(x / 5, 40 + y) * 0.3;
  const thr = 0.79 - y * 0.012;
  DRIFT[y * W + x] = n > thr ? (n > thr + 0.08 ? 2 : 1) : 0;
}

// ------------------------------------------------------------ stars (flash)
const STARS = [];
{
  let k = 0;
  while (STARS.length < 34 && k < 999) {
    const x = hash(k, 1) % W, y = hash(k, 2) % 46; k++;
    // never inside a curtain's box or by the colon: a dot there would read as part of the time
    if (SLOTS.some((sl) => x >= sl.x - 3 && x < sl.x + sl.w + 3 && y >= sl.y - 3 && y < sl.y + sl.h + 3) || (x > 64 && x < 78 && y > 20 && y < 46)) continue;
    STARS.push([x, y, (hash(k, 3) % 1000) / 1000 * 6.28, cyc(1.2 + (hash(k, 4) % 100) / 40), hash(k, 5) % 3]);
  }
}

// ------------------------------------------------------------ working buffers (RAM)
const COV = new Uint8Array(SKY), HALO = new Uint8Array(SKY);
const TOPY = new Int16Array(W), TOPOK = new Uint8Array(W);
const RAY = new Uint16Array(W), RAYN = new Float32Array(W), FRF = new Float32Array(W);
const CR = new Uint8Array(256), CRAD = new Uint8Array(256);
const VY = new Float32Array(W), VH = new Float32Array(W), VK = new Float32Array(W), VL = new Uint8Array(W);
// the veil keeps out of each curtain's box (flash, per column)
const VB0 = new Int16Array(W).fill(999), VB1 = new Int16Array(W).fill(-999);
for (const sl of SLOTS) for (let x = Math.floor(sl.x - 5); x < sl.x + sl.w + 5; x++) { VB0[x] = Math.min(VB0[x], Math.floor(sl.y - 5)); VB1[x] = Math.max(VB1[x], Math.ceil(sl.y + sl.h + 4)); }


// ------------------------------------------------------------ timing of the turn

/** Stamp one ribbon point, or a vertical ray from (cx, cy0) down to (cx, cy1): soft-edged coverage of radius r and a halo, max-combined. */
let stampOps = 0;
function stamp(cx, cy0, cy1, r, inten, hr, hg, track) {
  const R = r + hr;
  const x0 = Math.max(0, (cx - R) | 0), x1 = Math.min(W - 1, (cx + R) | 0);
  const y0 = Math.max(0, (cy0 - R) | 0), y1 = Math.min(HZ - 1, (cy1 + R) | 0);
  if (x1 < x0 || y1 < y0 || cy1 + R < 0) return;
  const r0 = (r - 0.55) * (r - 0.55), r1 = (r + 0.55) * (r + 0.55), inv = inten / (r1 - r0);
  const R2 = R * R, rr = r * r, hk = (255 * hg) / (R2 - rr), hmax = 255 * hg;
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5, dy = yc < cy0 ? yc - cy0 : yc > cy1 ? yc - cy1 : 0, dy2 = dy * dy, row = y * W;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, d2 = dx * dx + dy2;
      if (d2 >= R2) continue;
      const i = row + x;
      if (d2 < r1) {
        const c = d2 <= r0 ? inten : (r1 - d2) * inv;
        if (c > COV[i]) COV[i] = c;
        if (track && c >= 64 && y < TOPY[x]) TOPY[x] = y;
      }
      const h = d2 < rr ? hmax : (R2 - d2) * hk;
      if (h > HALO[i]) HALO[i] = h;
    }
  }
  stampOps += (x1 - x0 + 1) * (y1 - y0 + 1);
}

// ------------------------------------------------------------ the turn, per column (srel: seconds from :00)
// rays shoot up accelerating (-0.85 .. -0.42), hang while the curtain re-forms
// (-0.3 .. 0.25), then fall and decelerate onto the new shape (0.33 .. 1.05)
function rayState(q) {
  if (q <= -0.85 || q >= 1.05) return 0;
  if (q < -0.42) { const u = (q + 0.85) / 0.43; return u * u; }
  if (q < 0.33) return 1;
  const u = (q - 0.33) / 0.72; return (1 - u) * (1 - u);
}
/** After landing, the hem sags a pixel and springs back. */
function landing(q) {
  if (q <= 1.0 || q >= 1.5) return 0;
  const u = (q - 1.0) / 0.5;
  return 1.1 * sin(Math.PI * u) * (1 - u);
}
/** Each column's offset on the turn's clock: the curtain breaks up and lands in a ripple, not all at once. */
// A sweep from west to east (the west side breaks first and lands first), roughened per column.
function stagger(x, i) {
  const sl = SLOTS[i], u = clamp((x - sl.x - sl.w / 2) / (sl.w / 2), -1, 1);
  return 0.13 * u + 0.04 * (2 * pnoise(x / 3 + 17 * i, 1) - 1);
}

function fieldsAt(mk) { return clockFields(new Date(mk * 60000)); }

export default {
  name: 'Aurora',
  blurb: 'The northern lights over a frozen lake: each numeral is an aurora curtain; every minute the changing curtains break up into rays, shoot up, and fall into the new time.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey;
    const T = (mk % 1440) * 60 + s;                                   // seconds of the day, continuous
    ctx.lcd.backlight(1 - 0.5 * ctx.night);
    stampOps = 0;
    let box = 0;

    const prv = fieldsAt(mk - 1), nxt = fieldsAt(mk + 1);
    const cur = f.hh + f.mm, pd = prv.hh + prv.mm, nd = nxt.hh + nxt.mm;

    // ---- the hour: corona, and the sky turns to the new hour's colours
    const hourShow = prv.h !== f.h && s < 14;
    // (the blend steps at 30 Hz, and the colour tables are cached by that step, so any frame rebuilds cold the same)
    const sq = Math.floor(s * 30) / 30;
    const pal = hourShow ? lerpPal(paletteFor(prv.h), paletteFor(f.h), smooth(progress(sq, 0.6, 4.2))) : paletteFor(f.h);
    const pkey = hourShow && s < 4.3 ? `${f.h}:${(s * 30) | 0}` : `${f.h}`;
    box += buildLuts(pal, pkey) * 12;

    // ---- the beat: once a second, attack over 4 frames, decay
    const fr = s - Math.floor(s);
    const beat = fr < 0.07 ? smooth(fr / 0.07) : Math.exp(-(fr - 0.07) * 4.2);
    // ---- the flourish: a surge runs along the curtain at :15, :30, :45
    let surgeX = -999, surge = 0;
    const q = Math.floor(s / 15), qs = s - q * 15;
    if (q >= 1 && q <= 3 && qs < 2.6) {
      const u = progress(qs, 0, 2.6);
      surgeX = q === 2 ? 175 - 200 * u : -15 + 200 * u;
      surge = q === 2 ? 1.25 : 1;
    }
    const sb = (x) => { if (surge === 0) return 0; return surge * gauss((x - surgeX) / 16); };

    // ---- rays: a per-column brightness that runs along the curtain
    const o1 = (2 * T) % 64, o2 = 64 - ((2.4 * T) % 64);
    for (let x = 0; x < W; x++) {
      const n = 0.6 * pnoise(x / 4.3 + o1, 0) + 0.4 * pnoise(x / 2.6 + o2 + 64, 1);
      RAYN[x] = n;
      const sx = sb(x);
      RAY[x] = 236 + 100 * n + 40 * beat + 70 * sx;
    }
    box += W * 8;

    // the glow round the curtains blooms on the beat and on a surge; during the corona it stays, as a dark moat
    const hourShow0 = prv.h !== f.h && s < 14;
    const moat = hourShow0 ? smooth(progress(s, 0.2, 1.0)) * (1 - smooth(progress(s, 12, 13.5))) : 0;
    const surgeGlow = surge > 0 ? 1 : 0;
    // ---- stamp the four curtains
    COV.fill(0); HALO.fill(0); TOPY.fill(999);
    g.cost.px += SKY / 2;
    const hr = 2.0 + 1.4 * beat, hg = Math.min(1, 0.95 * beat + 0.2 * surgeGlow + 0.7 * moat);
    const srel = s >= 30 ? s - 60 : s;                  // seconds from the nearest minute turn
    for (let i = 0; i < 4; i++) {
      const sl = SLOTS[i], kx = sl.w / 10, ky = sl.h / 16;
      // which shapes: a changing curtain breaks up into rays, drifts, and re-forms as the new digit
      let A = +cur[i], B = A, turn = false;
      if (srel < 0 && srel > -2 && nd[i] !== cur[i]) { B = +nd[i]; turn = true; }
      else if (srel >= 0 && srel < 1.6 && pd[i] !== cur[i]) { A = +pd[i]; turn = true; }
      const ga = GLYPHS[A], gb = GLYPHS[B], [ta, tb] = PAIR(A, B);
      const m = turn ? smooth(progress(srel, -0.3, 0.25)) : 0;
      const ant = turn ? sin(Math.PI * progress(srel, -1.55, -0.85)) : 0;   // anticipation: the curtain gathers and dips
      const amp = (0.65 + 0.75 * beat) * (sl.r / 3);
      const sway = 0.7 * sin(phase(W_SWAY, T) + i * 1.7), fold = phase(W_FOLD, T), kink = phase(W_KINK, T);
      const lap = (T * 0.55 + i * 0.29) % 1, pk = lap * (N + 36) - 18;
      for (let k = 0; k < N; k++) {
        let gx, gy, nx, ny, v;
        // ribbon point k: at rest point k of the digit; in a turn, from point ta[k] of the old to tb[k] of the new
        const a = turn ? ta[k] : k, b = turn ? tb[k] : k;
        if (m <= 0) { gx = ga.x[a]; gy = ga.y[a]; nx = ga.nx[a]; ny = ga.ny[a]; v = ga.v[a]; }
        else if (m >= 1) { gx = gb.x[b]; gy = gb.y[b]; nx = gb.nx[b]; ny = gb.ny[b]; v = gb.v[b]; }
        else {
          gx = ga.x[a] + (gb.x[b] - ga.x[a]) * m; gy = ga.y[a] + (gb.y[b] - ga.y[a]) * m;
          nx = ga.nx[a] + (gb.nx[b] - ga.nx[a]) * m; ny = ga.ny[a] + (gb.ny[b] - ga.ny[a]) * m;
          v = ga.v[a] + (gb.v[b] - ga.v[a]) * m;
        }
        if (v < 0.04) continue;
        gx = sl.x + gx * kx; gy = sl.y + gy * ky;
        gx += sway * (gy - sl.y) / sl.h;
        // a fold runs along the ribbon; the beat shivers it; a surge kinks it
        // (in a turn the ribbon's order is the morph's, so its folds and pulses stand still in the air)
        const sx = sb(gx), q = turn ? srel - stagger(gx, i) : 0, R = turn ? rayState(q) : 0, calm = 1 - R;
        const off = (amp * sin(k * 0.42 - fold + i) + (sx > 0 ? 1.3 * sx * sin(k * 0.21 - kink) : 0)) * calm;
        gx += nx * off; gy += ny * off;
        const bump = gauss((k - pk) / 10) * calm;
        // the weight sinks to the hem: a curtain is brightest and broadest at its lower border
        let inten = (215 + 40 * bump + 50 * sx) * v, r = sl.r * (0.8 + 0.32 * clamp((gy - sl.y) / sl.h, 0, 1)), top = gy, track = true;
        if (turn) {
          // each column of the curtain on its own clock: rays shoot up, hang, fall and land
          gy += 1.2 * ant + landing(q);
          gx += 2.4 * R;                                   // the broken curtain drifts east while it re-forms
          const rise = R * sl.h * (0.13 + 0.27 * pnoise(gx / 2.4 + 9 * i, 3));
          top = gy - rise; gy = top + R * (4 + 9 * pnoise(gx / 3.1 + 5 * i, 2));
          r *= 1 - 0.4 * R;
          inten *= (1 + 0.12 * R) * (1 + 0.18 * ant);
          track = R < 0.1;
        } else top = gy;
        stamp(gx, top, gy, r, Math.min(255, inten), hr + 1.5 * sx, hg, track);
      }
    }
    box += stampOps * 4;
    box += 4 * N * 80;               // the per-point maths (fixed point on the device: lerps, table sines, bounds, two divides)
    // the broken curtain is rayed: dark gaps open between its columns while it is in the air
    FRF.fill(1);
    for (let i = 0; i < 4; i++) {
      const changing = srel < 0 ? srel > -2 && nd[i] !== cur[i] : srel < 1.6 && pd[i] !== cur[i];
      if (!changing) continue;
      const sl = SLOTS[i];
      for (let x = Math.max(0, (sl.x - 4) | 0); x < Math.min(W, sl.x + sl.w + 8); x++) {
        const R = rayState(srel - stagger(x, i));
        if (R <= 0) continue;
        FRF[x] = clamp(1 - 10 * R, 0, 1);           // the head rays come back only once the column has landed
        const st = 0.5 + 0.5 * sin(x * 1.9 + srel * 4 + i);
        RAY[x] = RAY[x] * (1 - 0.85 * R * st * st);
      }
      box += (sl.w + 12) * 12;
    }


    // ---- which columns may grow rays above their top edge (only above a digit's head, never into a notch)
    for (let x = 0; x < W; x++) {
      TOPOK[x] = 0;
      if (TOPY[x] > 900) continue;
      for (const sl of SLOTS) if (x >= sl.x - 3 && x < sl.x + sl.w + 3 && TOPY[x] <= sl.y + sl.h * 0.12) TOPOK[x] = 1;
    }

    // ---- the corona: rays from the magnetic zenith, bursting down at the hour
    let corona = 0;
    if (hourShow) {
      const burst = smooth(progress(s, 0.3, 2.1)), fade = 1 - smooth(progress(s, 9, 13.5));
      corona = burst * fade;
      if (corona > 0.01) {
        const front = 30 + 110 * burst;
        for (let a = 0; a < 256; a++) {
          const n = noise(a / 4.5 + s * 0.3, 77) * 0.75 + noise(a / 2.2 - s * 0.5, 78) * 0.25;
          const e = clamp((n - 0.38) / 0.4, 0, 1);
          CR[a] = 255 * clamp(e * e * (3 - 2 * e) * (0.85 + 0.25 * beat), 0, 1);
        }
        for (let d = 0; d < 256; d++) {
          const edge = clamp((front - d) / 14, 0, 1), fall = clamp(1.15 - (d - 34) / 95, 0, 1);
          CRAD[d] = 255 * edge * fall * corona;
        }
        box += 512 * 10;
      }
    }

    // ---- the distant veil: a faint rayed arc far behind the curtains, drifting the other way
    {
      const p1 = phase(W_VEIL1, T), p2 = phase(W_VEIL2, T), o3 = 64 - ((0.8 * T) % 64);
      for (let x = 0; x < W; x++) {
        VY[x] = 9 + 0.06 * x + 3.5 * sin(x * 0.045 + p1) + 1.4 * sin(x * 0.11 - p2);
        VH[x] = 2.2 + 1.6 * pnoise(x / 9 + o3, 2);
        VK[x] = 7 / VH[x];
        const n = pnoise(x / 2.2 + o3 * 2, 3);
        VL[x] = (2 + 6 * n * n) * (1 + 0.25 * beat) | 0;
      }
      box += W * 30;
    }

    // ---- the sky, column by column from the horizon up: curtains coloured by their depth above their lower edge
    const buf = g.buf;
    for (let x = 0; x < W; x++) {
      let dep = 0;
      const ray = RAY[x];
      // the distant veil in this column: its band (never inside a curtain's box), and how lit it is
      const vy = VY[x], vk = VK[x], vl = VL[x];
      let v0 = Math.ceil(vy - VH[x]), v1 = Math.floor(vy + VH[x]) + 1;
      if (v0 < 0) v0 = 0;
      if (v1 > VB0[x] && v0 < VB1[x]) { if (vy < VB0[x]) v1 = VB0[x]; else v0 = VB1[x]; }
      for (let y = HZ - 1; y >= 0; y--) {
        const i = y * W + x, c = COV[i];
        if (c) {
          let l = (c * ray) >> 11; if (l > NL - 1) l = NL - 1;
          buf[i] = LUTB[DEPB[dep > 63 ? 63 : dep] * NL + l];
          if (c >= 64) dep++;
        } else {
          dep = 0;
          const h = HALO[i];
          if (h) buf[i] = LUTG[h >> 4];
          else {
            let o = SKY565;
            if (y >= v0 && y < v1) { const d = (y - vy) * vk, a = d < 0 ? -d : d; if (a < 7) o = LUTV[vl * (7 - a) >> 3]; }
            if (corona > 0.01) {
              const l = (CR[ANG[i]] * CRAD[RAD[i]]) >> 12;
              if (l) o = LUTC[((RAD[i] >> 5) > 3 ? 3 : RAD[i] >> 5) * 16 + l];
            }
            buf[i] = o;
          }
        }
      }
    }
    g.cost.px += SKY; box += SKY * (corona > 0.01 ? 9 : 6);

    // ---- rays rising above the curtains' heads
    let fo = 0;
    for (let x = 0; x < W; x++) {
      if (!TOPOK[x]) continue;
      const n = RAYN[x], sx = sb(x);
      const F = (1 + 5 * n * n) * (1 + 0.8 * beat + 1.2 * sx);
      const I = (12 + 19 * n) * (0.75 + 0.25 * beat + 0.3 * sx) * FRF[x];
      for (let dy = 1; dy <= F; dy++) {
        const y = TOPY[x] - dy; if (y < 0) break;
        const i = y * W + x;
        if (COV[i] >= 64) break;
        if (COV[i]) continue;
        const l = Math.min(NL - 1, (I * (1 - dy / (F + 1))) | 0);
        if (l > 0) buf[i] = LUTF[Math.min(7, ((dy * 8) / (F + 1)) | 0) * NL + l];
        fo++;
      }
    }
    box += fo * 6;

    // ---- stars (behind everything), and the colon: two bright stars
    for (const [x, y, ph, w, kind] of STARS) {
      const i = y * W + x;
      if (buf[i] !== SKY565) continue;
      const tw = 0.5 + 0.5 * sin(phase(w, T) + ph);
      buf[i] = c565(mixc(pal.sky, kind === 0 ? [255, 236, 210] : [200, 220, 255], 0.2 + 0.35 * tw));
    }
    for (const [x, y] of COLON) {
      const cc = c565([235, 245, 255]);
      g.fillRect(x, y, 2, 2, 0xeef6ff);
      const a = 0.25 + 0.55 * beat;
      for (const [dx, dy] of [[-1, 0], [2, 0], [0, -1], [1, -1], [0, 2], [1, 2]]) g.pixel(x + dx, y + dy, 0xb8d8ff, { a });
      void cc;
    }

    // ---- the shore: spruces lit faintly by the aurora, snow on the boughs
    const glowAll = 0.55 + 0.25 * beat;
    const needle = c565(mixc([4, 10, 14], pal.band[5], 0.06 * glowAll));
    const snow = c565(mixc(mixc([58, 70, 102], pal.sky, 0.3), pal.band[4], 0.16 * glowAll));
    const bank = c565(mixc(mixc([70, 82, 118], pal.sky, 0.25), pal.band[4], 0.12 * glowAll));
    for (let j = 0; j < PINE_LIST.length; j++) {
      const i = PINE_LIST[j], p = PINE[i];
      buf[i] = p === 1 ? needle : p === 2 ? snow : bank;
    }
    g.cost.px += PINE_LIST.length; box += PINE_LIST.length * 2;

    // ---- the frozen lake: the sky in black ice, squashed, darkened; drifted snow on top
    const sr = (SKY565 >> 11) << 3, sg = ((SKY565 >> 5) & 63) << 2, sbl = (SKY565 & 31) << 3;
    const dr1 = mixc(mixc([40, 50, 80], pal.sky, 0.3), pal.band[4], 0.08 * glowAll), dr2 = mixc(dr1, [120, 132, 168], 0.35);
    const D1 = c565(dr1), D2 = c565(dr2);
    const glint = surge > 0 ? surgeX : -999;
    for (let y = HZ; y < H; y++) {
      const ly = y - HZ, sy = HZ - 3 - ((ly * 3) >> 1);
      for (let x = 0; x < W; x++) {
        const i = y * W + x, dd = DRIFT[ly * W + x];
        if (dd) { buf[i] = dd === 2 ? D2 : D1; continue; }
        // black ice is a still mirror: the sky comes back as itself, the aurora (and the shore) dimmed toward it
        const v = buf[sy * W + x];
        if (v === SKY565) { buf[i] = v; continue; }
        let k = 120 - ly * 3;
        const gd = x + ly * 2 - glint;
        if (gd > -8 && gd < 8) k += (8 - (gd < 0 ? -gd : gd)) * 12;
        const r = sr + ((((v >> 11) << 3) - sr) * k >> 8), gg = sg + (((((v >> 5) & 63) << 2) - sg) * k >> 8), b = sbl + ((((v & 31) << 3) - sbl) * k >> 8);
        buf[i] = ((r >> 3) << 11) | ((gg >> 2) << 5) | (b >> 3);
      }
    }
    g.cost.px += (H - HZ) * W; box += (H - HZ) * W * 9;
    g.cost.box += box;
  },
};
