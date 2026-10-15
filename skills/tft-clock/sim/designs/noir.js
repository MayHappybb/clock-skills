// Noir: a private eye's office at night, 1940s film noir, and the time is
// cigarette smoke. A man in a fedora stands at the rain-streaked window, a
// silhouette against the blinds, smoking; the light through the slats
// throws slanting stripes across the wall. The smoke from his cigarette
// hangs in the room as the four numerals (noir-glyphs.js: a tall condensed
// 1940s title face drawn as ribbons of smoke, free ends thinning into
// wisps). The minutes are the fresh smoke, near his mouth and low; the hours
// are older smoke that has risen and drifted, larger, high on the left. The
// blind stripes cut across everything: the smoke glows where a stripe of
// light crosses it and goes grey in the shadow between. On the desk in the
// corner, in silhouette with a rim of window light: a telephone, a bottle of
// rye and a glass.
//
// The time is alive: smoke never holds still. Filaments run along every
// ribbon and billows rise through it; its edges boil, and the ribbon twists
// as it flows (where it turns edge-on it thins). On every beat he draws
// on the cigarette (the ember flares) and a fresh puff runs through the
// numerals: a dense, swelling front travels along each ribbon, minutes
// first, then on up to the hours, as if the smoke were fed from the
// cigarette, and a couple of wisps peel off the top of each numeral and
// curl away upwards. Rain runs down the window and its drops' shadows slide down
// the stripes of light, stopping and starting, over the wall and the smoke.
// The neon sign outside blinks in the panes. Every 15 s: :15 a car passes
// in the street and its headlights sweep a second set of stripes across the
// room; :30 the neon stutters and the room's light buzzes; :45 he blows a
// smoke ring that drifts left along the ceiling.
//
// Minute turn: a draught from the door. The thread of smoke bends, the
// blinds rattle, the steady numerals sway; the changing ones are torn up
// and away in streaks, thinning evenly by a fixed rank until gone (by
// :59.75). He draws, the ember flares, and he blows one puff for each new
// numeral: a soft cloud drifts from his mouth to its place (the hours'
// puffs go over the top of the minutes), arrives after :00 and curls into
// the new digit, its ribbons thickening out of the cloud. Hour: as the old
// smoke goes, the blinds snap open (the wall floods with wide stripes, the
// panes go bright), lightning flashes twice, rain comes harder, and the new
// hours drift in under the storm light; the blinds settle shut over 3 s.
//
// Palette: black and white only, as the films were: 32 pure greys (red,
// green and blue equal), the smoke the brightest thing on the glass, the
// wall a deep LCD black with grey stripes, the window's panes mid grey.
// Film grain at 24 frames a second (2 x 2 px grains, the bold version of
// the real thing) over everything; no other effects. Night: the street
// lamps are off, only the neon is left, the stripes sink, the backlight
// dims to 55 %, and the smoke is lifted so it stays the brightest thing.
//
// Cost: one integer pass makes the light (stripes, window, drop shadows),
// the numerals are sampled from byte maps (edge distance, arc length,
// cross distance) with a filament and a billow texture, one integer pass
// mixes smoke over the set through a grey table with grain. No per-minute
// caches; every frame is built cold.
import { clockFields, sin, cos, hash, clamp, progress, ease } from '../js/kit.js';
import { buildDigits } from './noir-glyphs.js';
import {
  W, H, N, TYPE, PH, VG, OUT, NEON, TA, TB, GRAIN, RANK, PULSE, THREAD,
  WALL, GLASS, FRAME, MAN, CIG, PROP, RIM, WIN_X, EMBER_X, EMBER_Y, MOUTH_X, MOUTH_Y,
} from './noir-scene.js';

// ------------------------------------------------------------ the numerals
const BIG = buildDigits(21, 39, 3.5, 4);     // hours: 28 x 46 outer
const SMALL = buildDigits(18, 32, 3.0, 4);   // minutes: 24 x 38 outer
// outer top-left of each slot; the map origin is 4 px up and left of it
const SLOTS = [
  { x: 2, y: 3, set: BIG, cx: 16, cy: 26, r: 12, haze: 70, dens: 228 },
  { x: 33, y: 3, set: BIG, cx: 47, cy: 26, r: 12, haze: 70, dens: 228 },
  { x: 67, y: 35, set: SMALL, cx: 79, cy: 54, r: 10, haze: 56, dens: 250 },
  { x: 94, y: 35, set: SMALL, cx: 106, cy: 54, r: 10, haze: 56, dens: 250 },
];
const COLON = [[64, 41.5], [64, 50.5]];
// where wisps may peel off each digit: the top edge of every column of its ribbon
for (const set of [BIG, SMALL])
  for (const gl of set) {
    gl.tops = [];
    for (let x = 2; x < gl.w - 2; x += 2)
      for (let y = 0; y < gl.h; y++) if (gl.E[y * gl.w + x] < -8) { gl.tops.push([x + 0.5, y + 0.5]); break; }
  }
const BEAT_DELAY = [0.36, 0.28, 0.1, 0.0];   // the puff reaches the minutes first

// ------------------------------------------------------------ buffers (RAM)
const LT = new Uint8Array(N);    // light falling on each pixel
const S = new Uint8Array(N);     // smoke density
const BAND = new Uint8Array(256), BAND2 = new Uint8Array(256);
const SLAT = new Uint8Array(H);
const SHIFT = new Int8Array(64);
// the ribbon's twist: where it turns edge-on it looks thinner (1/8 px thinner on each side, along 32 px of ribbon)
const TWIST = new Uint8Array(64);
for (let k = 0; k < 64; k++) TWIST[k] = Math.round(10 * (1 - Math.abs(Math.cos((Math.PI * k) / 64))));

// ------------------------------------------------------------ the grey table
const GREY = new Uint16Array(64);
for (let k = 0; k < 64; k++) {
  const v = Math.min(255, k * 4);
  const r5 = Math.round(v / 255 * 31), r8 = (r5 << 3) | (r5 >> 2);
  const g6 = Math.round(r8 / 255 * 63);
  GREY[k] = (r5 << 11) | (g6 << 5) | r5;
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const bump = (x, a, b, c, d) => (x <= a || x >= d ? 0 : x < b ? sm((x - a) / (b - a)) : x <= c ? 1 : 1 - sm((x - c) / (d - c)));

function bandTable(T, duty, soft) {
  // light where the phase is in [0, duty), soft edges `soft` units wide
  const d = duty * 256;
  for (let p = 0; p < 256; p++) {
    const inside = p < d ? Math.min(p, d - p) : -Math.min(p - d, 256 - p);
    T[p] = Math.round(255 * clamp(inside / soft + 0.5, 0, 1));
  }
}

// ------------------------------------------------------------ the smoke numerals
let ops = 0;

/**
 * Sample one digit's maps into the smoke buffer.
 * thin: px the ribbon is drawn thinner (8ths); blowP/blowD: the draught's tear.
 */
function digit(gl, X0, Y0, o) {
  const { E, U, V, w, h } = gl;
  const fa = o.fa & 63, fv = o.fv & 15, bx = o.bx & 31, by = o.by & 31;
  const front = o.front, swell = o.swell, thin = o.thin, dens = o.dens, hz = o.haze;
  const blowD = o.blowD, blowP = o.blowP, shift = o.shift, tw = o.tw & 63;
  let n = 0;
  for (let y = 0; y < h; y++) {
    const Y = Y0 + y, sh = shift ? SHIFT[(Y & 63)] : 0;
    for (let x = 0; x < w; x++) {
      const j = y * w + x;
      const e0 = E[j] + thin;
      if (e0 > 40) continue;
      n++;
      const u = U[j];
      const ta = TA[((u + fa) & 63) | ((((V[j] >> 1) + fv) & 15) << 6)];
      const pu = front > -900 ? PULSE[clamp(front - u, 0, 127) | 0] : 0;
      const e = e0 - ((ta - 128) / 22 | 0) - ((pu * swell) >> 8) + TWIST[((u << 1) + tw) & 63];
      let X = X0 + x + sh, Yy = Y;
      let cov = e <= -4 ? 256 : e < 4 ? (4 - e) << 5 : 0;
      let val = 0;
      const tb = TB[((X + bx) & 31) | (((Yy + by) & 31) << 5)];
      if (cov) {
        const d = 178 + (((ta - 128) * 3) >> 4) + (((tb - 128) * 3) >> 4) + ((pu * 120) >> 8);
        val = (cov * d * dens) >> 16;
      }
      if (e > -4 && e < 40) {
        const hzv = (((((40 - e) * hz) >> 6) * tb >> 8) * (256 + pu * 2)) >> 8;
        if (hzv > val) val = hzv;
      }
      if (val <= 0) continue;
      if (blowP > 0) {
        // torn away: every pixel streams up and right by its own share, and goes at its rank
        const r = RANK[(x & 31) | ((y & 31) << 5)];
        if (r < blowP) continue;
        const k = 128 + ((r * 3) >> 1);
        X += (blowD * k) >> 18; Yy -= (blowD * k) >> 16;
        X += ((tb - 128) * blowD) >> 15;
        val = (val * (300 - blowP)) >> 8;
        if (X < 0 || X >= W || Yy < 0 || Yy >= H - 3) continue;
        // a streak below it: the tear stretches the smoke along its way
        const i2 = Yy * W + X + W, v2 = (val * 3) >> 2;
        if (v2 > S[i2]) S[i2] = v2;
        if (blowD > 1500 && (v2 >> 1) > S[i2 + W]) S[i2 + W] = v2 >> 1;
      } else if (X < 0 || X >= W || Yy < 0 || Yy >= H) continue;
      if (val > 255) val = 255;
      const i = Yy * W + X;
      if (val > S[i]) S[i] = val;
    }
  }
  ops += n * 12 + w * h * 2;
}

/** A soft cloud of smoke: a puff on its way, or the haze a new digit curls out of. */
function blob(cx, cy, r, dens, t) {
  const x0 = Math.max(0, Math.floor(cx - r - 2)), x1 = Math.min(W - 1, Math.ceil(cx + r + 2));
  const y0 = Math.max(0, Math.floor(cy - r - 2)), y1 = Math.min(H - 1, Math.ceil(cy + r + 2));
  const ir2 = 256 / (r * r), rise = Math.floor(t * 9) & 31, sw = Math.floor(t * 4) & 31;
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const q = ((dx * dx + dy * dy) * ir2) | 0;
      if (q >= 256) continue;
      const tb = TB[((x + sw) & 31) | (((y + rise) & 31) << 5)];
      let v = ((256 - q) * dens) >> 8;
      v = (v * (96 + tb)) >> 8;
      if (v > 255) v = 255;
      const i = y * W + x;
      if (v > S[i]) S[i] = v;
    }
  }
  ops += (x1 - x0 + 1) * (y1 - y0 + 1) * 8;
}

/** Put a soft dot of smoke into the buffer. */
function dab(x, y, v) {
  const ix = x | 0, iy = y | 0;
  if (ix < 1 || iy < 0 || ix >= W - 1 || iy >= H) return;
  const i = iy * W + ix;
  if (v > S[i]) S[i] = v;
  const h = v >> 1;
  if (h > S[i - 1]) S[i - 1] = h;
  if (h > S[i + 1]) S[i + 1] = h;
}

// ------------------------------------------------------------ rain
const DROPS_WALL = 16, DROPS_GLASS = 12;
function dropY(k, tt, salt, top, span) {
  const v = 9 + (hash(k, salt, 1) % 1000) / 1000 * 16;           // px/s on average
  const f = 0.35 + (hash(k, salt, 2) % 1000) / 1000 * 0.6;        // stick-slip cycles a second
  const ph = (hash(k, salt, 3) % 1000) / 1000 * 6.283;
  const w = 6.283 * f;
  // speed v (1 - cos(w t)): the drop stops, slides, stops
  const y = (hash(k, salt, 4) % span) + v * (tt - (sin(w * tt + ph) - sin(ph)) / w);
  return top + (y % span);
}

// ------------------------------------------------------------ the face
export default {
  name: 'Noir',
  blurb: 'A private eye smokes at the rainy window; the time is his cigarette smoke, hanging in the slatted light of the blinds.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey, night = ctx.night;
    ctx.lcd.backlight(1 - 0.45 * night);
    ops = 0;

    // ---- which turn we are near, and what changes
    const late = s >= 50;
    const tau = late ? s - 60 : s;                         // time from the nearest turn
    const oldF = late ? f : clockFields(new Date(ctx.date.getTime() - 60000));
    const newF = late ? clockFields(new Date(ctx.date.getTime() + 60000)) : f;
    const oldS = oldF.hh + oldF.mm, newS = newF.hh + newF.mm, curS = f.hh + f.mm;
    const hourTurn = oldF.h !== newF.h;
    const tt = (mk % 60) * 60 + s;                          // seconds into the hour: rain and drift

    // the draught (the turn) and the hour's storm
    const draught = bump(tau, -1.7, -1.2, -0.4, 0.3);
    let open = 0, flash = 0;
    if (hourTurn) {
      open = tau < 2.4 ? sm((tau + 0.2) / 0.18) : 1 - ease.inOutCubic(progress(tau, 2.4, 5.2));
      for (const [t0, a] of [[0.05, 1], [0.42, 0.75], [0.6, 0.5]]) {
        const d = tau - t0;
        if (d >= 0 && d < 0.7) flash = Math.max(flash, a * (d < 0.03 ? 1 : Math.exp(-(d - 0.03) * 9)));
      }
    }
    const storm = hourTurn ? bump(tau, -3, -1, 8, 14) : 0;

    // ---- light: the neon and the street lamp through the blinds
    const sec = s - Math.floor(s);
    const neonOn = (Math.floor(s / 2) & 1) === 0 ? 1 : 0.35;
    let buzz = 1;
    if (!late && s >= 30 && s < 31.5) {
      const k = Math.floor((s - 30) * 14);
      buzz = [1, 0.3, 1, 1, 0.2, 0.15, 1, 0.4, 1, 1, 1, 0.3, 0.25, 1, 1, 1, 0.5, 1, 1, 1, 1][k] ?? 1;
    }
    const lamp = 1 - 0.55 * night;
    const I = Math.round(256 * (0.8 * lamp + 0.2 * neonOn) * buzz);
    const rattle = draught > 0 ? Math.round(draught * 1.3 * sin(s * 70)) : 0;
    bandTable(BAND, 0.42 + 0.33 * open, 26);
    const wallShift = rattle * 26;

    // the wall
    for (let y = 0, i = 0; y < H; y++, i += W) {
      for (let x = 0; x < WIN_X; x++) {
        const vg = VG[i + x];
        LT[i + x] = vg ? (((BAND[(PH[i + x] + wallShift) & 255] * vg) >> 8) * I) >> 8 : 0;
      }
    }
    // the panes: slats tilt open at the hour; the street glows through the gaps
    const slatPhase = rattle;
    const gap = 3 + 1.8 * open;
    for (let y = 0; y < H; y++) {
      const p = (((y + slatPhase) % 5) + 5) % 5;
      SLAT[y] = Math.round(255 * clamp(gap - p, 0, 1));
    }
    const neonG = Math.round(256 * neonOn * buzz), lampG = Math.round(256 * lamp);
    for (let y = 0, i = 0; y < H; y++, i += W) {
      const sl = SLAT[y];
      for (let x = WIN_X; x < W; x++) {
        // the neon sign hangs high outside the left of the pane
        const o = ((OUT[i + x] * lampG) >> 8) + ((NEON[i + x] * neonG) >> 8);
        LT[i + x] = (sl * (o > 255 ? 255 : o)) >> 8;
      }
    }
    ops += N * 5;

    // the headlights of a passing car (:15): a bright set of stripes sweeps the room
    if (!late && s >= 14 && s < 16.6) {
      const u = ease.inOutQuad((s - 14) / 2.6), X = 175 - 215 * u, amp = Math.round(200 * sin(Math.PI * (s - 14) / 2.6) * lamp);
      bandTable(BAND2, 0.35, 30);
      const off = Math.round(u * 140);
      for (let y = 0, i = 0; y < H; y++, i += W) {
        const xc = X - 0.5 * (y - 40);
        const xa = Math.max(0, Math.floor(xc - 26)), xb = Math.min(WIN_X, Math.ceil(xc + 26));
        for (let x = xa; x < xb; x++) {
          const vg = VG[i + x];
          if (!vg) continue;
          const wgt = 26 - Math.abs(x - xc);
          const add = (((BAND2[(PH[i + x] + off) & 255] * amp) >> 8) * wgt / 26) | 0;
          const v = LT[i + x] + add;
          LT[i + x] = v > 255 ? 255 : v;
        }
        ops += (xb - xa) * 6;
      }
    }

    // rain: drop shadows slide down the stripes of light on the wall, and down the panes
    const nW = DROPS_WALL + Math.round(storm * 10);
    for (let k = 0; k < nW; k++) {
      const x = 3 + (hash(k, 7, 5) % 122), y = Math.floor(dropY(k, tt * (1 + storm), 7, -10, 100));
      const wob = (hash(k, Math.floor(y / 6), 9) & 1);
      for (let j = 0; j < 9; j++) {
        const yy = y - j;
        if (yy < 0 || yy >= H) continue;
        const xx = x + (j > 3 ? wob : 0), i = yy * W + xx;
        const mul = j < 2 ? 70 : 150 + j * 10;
        if (xx >= 0 && xx < WIN_X) LT[i] = (LT[i] * mul) >> 8;
        if (j < 2 && xx + 1 < WIN_X) LT[i + 1] = (LT[i + 1] * mul) >> 8;
      }
    }
    for (let k = 0; k < DROPS_GLASS + Math.round(storm * 8); k++) {
      const x = WIN_X + (hash(k, 8, 5) % (W - WIN_X)), y = Math.floor(dropY(k, tt * (1.6 + storm), 8, -8, 92));
      for (let j = 0; j < 6; j++) {
        const yy = y - j;
        if (yy < 0 || yy >= H) continue;
        const i = yy * W + x;
        LT[i] = (LT[i] * (j < 1 ? 60 : 130 + j * 18)) >> 8;
      }
    }

    // ---- smoke
    S.fill(0);
    const wind = draught;
    // the steady numerals sway in the draught: a ripple of whole-pixel row shifts
    for (let y = 0; y < 64; y++) SHIFT[y] = Math.round(wind * 1.6 * sin(y * 0.45 - s * 9));

    // the beat: once a second he draws on the cigarette and a puff runs through the numerals
    const lenOf = (gl) => gl.len;
    const flowA = Math.floor(tt * 11), flowV = Math.floor(tt * 1.3), rise = Math.floor(tt * 7), swayB = Math.floor(3 * sin(tt * 0.4));
    const o = { tw: 0, fa: 0, fv: 0, bx: 0, by: 0, front: -999, swell: 0, thin: 0, dens: 256, haze: 60, blowD: 0, blowP: 0, shift: false };

    let firstLaunch = 99;
    const launches = [0, 0, 0, 0], arrivals = [0, 0, 0, 0], paths = [];
    for (let i = 0; i < 4; i++) {
      const sl = SLOTS[i];
      const dist = i < 2 ? 40 + Math.hypot(sl.cx - 100, sl.cy - 16) + 0 : Math.hypot(sl.cx - EMBER_X, sl.cy - EMBER_Y);
      const travel = dist / 120;
      const L = Math.max(-1.05, 0.05 - travel);
      launches[i] = L; arrivals[i] = Math.max(0.05, L + travel);
      if (oldS[i] !== newS[i]) firstLaunch = Math.min(firstLaunch, L);
    }

    for (let i = 0; i < 4; i++) {
      const sl = SLOTS[i], X0 = sl.x - 4, Y0 = sl.y - 4;
      const changing = oldS[i] !== newS[i];
      o.tw = Math.floor(-tt * 40) + i * 23;
      o.fa = flowA + i * 17; o.fv = flowV + i * 5; o.bx = swayB + i * 9; o.by = rise + i * 3;
      o.dens = sl.dens; o.haze = sl.haze; o.thin = 0; o.blowD = 0; o.blowP = 0;
      // the beat's front, and the freshness it leaves behind
      const bt = sec - BEAT_DELAY[i];
      const ph = bt < 0 ? bt + 1 : bt;
      const set = sl.set, gl = set[+curS[i]];
      o.front = Math.round(ph * (lenOf(gl) + 50) * 1.35);
      o.swell = 14;
      o.shift = !changing && draught > 0;
      const inTurn = changing && (late ? tau >= -1.1 : tau < arrivals[i] + 0.55);
      if (!inTurn) { digit(gl, X0, Y0, o); continue; }
      // leaving: the old digit is torn up and away by the draught
      const gOld = set[+oldS[i]], gNew = set[+newS[i]];
      const pOut = progress(tau, -1.1, -0.2);
      if (tau < 0 && pOut < 1) {
        o.front = -999;
        o.blowP = Math.round(ease.inQuad(pOut) * 256);
        o.blowD = Math.round(ease.inQuad(pOut) * 34 * 256);
        o.shift = false;
        digit(gOld, X0, Y0, o);
      }
      // the puff for the new digit: from his mouth to its place
      const L = launches[i], A = arrivals[i];
      if (tau >= L) {
        const q = progress(tau, L, A), e = ease.outQuad(q);
        let px, py;
        if (i < 2) {
          // over the top of the minutes, then down to the hours
          const c1x = 104, c1y = 10, u = 1 - e;
          px = u * u * (MOUTH_X - 8) + 2 * u * e * c1x + e * e * sl.cx;
          py = u * u * (MOUTH_Y - 1) + 2 * u * e * c1y + e * e * sl.cy;
        } else {
          px = MOUTH_X - 8 + (sl.cx - MOUTH_X + 8) * e;
          py = MOUTH_Y - 1 + (sl.cy - MOUTH_Y + 1) * e - 3 * sin(Math.PI * e);
        }
        const c = progress(tau, A, A + 0.55);
        const r = (2.5 + (sl.r - 2.5) * ease.outCubic(q)) * (1 + 0.15 * c);
        const bd = Math.round((210 - 40 * q) * (1 - ease.inQuad(c)));
        if (bd > 4) blob(px, py, r, bd, tt);
        if (c > 0) {
          // the digit curls out of the cloud: its ribbons thicken from threads
          o.thin = Math.round((1 - ease.outCubic(c)) * 22);
          o.dens = Math.round(sl.dens * (0.45 + 0.55 * ease.outQuad(c)));
          o.fa = flowA + i * 17 + Math.round((1 - c) * 40);
          o.front = Math.round(c * (gNew.len + 50) * 1.35);
          o.swell = 7;
          o.blowP = 0; o.blowD = 0; o.shift = false;
          digit(gNew, X0, Y0, o);
        }
      }
    }
    // wisps: on each beat a few curls peel off the top of each numeral and rise away
    if (!hourTurn || tau > 2 || tau < -2)
      for (let i = 0; i < 4; i++) {
        if ((late && tau > -1.2 && oldS[i] !== newS[i]) || (!late && oldS[i] !== newS[i] && tau < arrivals[i] + 0.6)) continue;
        const sl = SLOTS[i], gl = sl.set[+curS[i]], X0 = sl.x - 4, Y0 = sl.y - 4;
        for (let k = 0; k < 2; k++) {
          const age0 = sec - BEAT_DELAY[i] - 0.15 - k * 0.4;
          const beat = Math.floor(s - BEAT_DELAY[i] - 0.15 - k * 0.4), age = age0 < 0 ? age0 + 1 : age0;
          const hsh = hash(mk, beat * 8 + i * 2 + k, 61);
          const [ox, oy] = gl.tops[hsh % gl.tops.length];
          const dir = (hsh >> 8) & 1 ? 1 : -1, life = 1.25;
          if (age > life) continue;
          for (let j = 0; j < 7; j++) {
            const a = age - j * 0.045;
            if (a < 0) break;
            const x = X0 + ox + dir * (2.2 * sin(a * 5) + a * 2.5), y = Y0 + oy - 1 - a * 11;
            const v = Math.round(150 * (1 - a / life) * (1 - j / 8));
            if (v > 8) dab(x, y, v);
          }
        }
      }

    // the colon: two little knots of smoke
    for (let k = 0; k < 2; k++) {
      const [cx, cy] = COLON[k];
      blob(cx, cy, 2.6, 190, tt + k * 3);
    }

    // the thread of smoke from the cigarette: laminar at the tip, curling as it rises
    {
      const n = THREAD.length;
      const ripple = tt * 2.2;
      for (let k = 2; k < n; k++) {
        const p = THREAD[k];
        const a = Math.min(4, k * 0.06) * sin(k * 0.21 - ripple) + Math.min(2, k * 0.02) * sin(k * 0.53 - ripple * 1.7 + 1);
        const bend = wind * Math.min(18, k * 0.35);
        const x = p.x + p.nx * a + bend, y = p.y + p.ny * a - wind * k * 0.05;
        const v = Math.round(150 * (1 - k / n) * (0.7 + 0.3 * sin(k * 0.13 + tt * 3)));
        if (v > 6) dab(x, y, v);
      }
      ops += n * 10;
    }

    // :45 a smoke ring drifts left along the ceiling, flat in perspective, widening, thinning
    if (!late && s >= 44.5 && s < 49) {
      const u = (s - 44.5) / 4.5, cx = 124 - 52 * ease.outQuad(u), cy = 24 - 12 * ease.outQuad(u);
      const rx = 2.5 + 5 * u, ry = 1.2 + 1.6 * u, v = Math.round(200 * (1 - u) * Math.min(1, u * 8));
      for (let k = 0; k < 40; k++) {
        const a = (k / 40) * 6.283;
        dab(cx + rx * cos(a), cy + ry * sin(a) + 0.4 * sin(a * 3 + s * 4), v);
      }
    }

    // ---- mix: the set, the smoke over it, grain, through the grey table
    const ff = Math.floor(tt * 24);
    const gx = hash(ff, 1, 51) & 63, gy = hash(ff, 2, 51) & 63;
    const gAmp = 7;
    const wk = Math.round((48 - 14 * night) + flash * 150), gk = Math.round(140 - 50 * night + flash * 150);
    const s0 = Math.round(150 + 45 * night + flash * 30), sk = Math.round(105 - 10 * night);
    const buf = g.buf;
    for (let y = 0, i = 0; y < H; y++) {
      const grow = ((((y >> 1) + gy) & 63) << 6);
      for (let x = 0; x < W; x++, i++) {
        const lt = LT[i], t = TYPE[i];
        let base;
        if (t === WALL) base = 11 + ((lt * wk) >> 8);
        else if (t === GLASS) base = 26 + ((lt * gk) >> 8) + ((flash * 255 * SLAT[y]) >> 8);
        else if (t === MAN) base = 7;
        else if (t === PROP) base = 6 + ((lt * 12) >> 8);
        else if (t === RIM) base = 40 + ((lt * wk * 2) >> 8);
        else if (t === FRAME) base = 20;
        else base = 170;
        const sv = S[i];
        let v = base;
        if (sv) {
          const smk = s0 + ((lt * sk) >> 8);
          v = base + (((smk - base) * sv) >> 8);
        }
        v += ((GRAIN[grow | (((x >> 1) + gx) & 63)] * gAmp) >> 7) + (BAYER[((y & 3) << 2) | (x & 3)] >> 2);
        buf[i] = GREY[v <= 0 ? 0 : v >= 255 ? 63 : v >> 2];
      }
    }
    ops += N * 12;

    // ---- the ember: it flares on each beat, and long before each puff of the turn
    let glow = Math.max(0, 1 - sec * 4) * 0.6;
    if (firstLaunch < 99) glow = Math.max(glow, bump(tau, firstLaunch - 0.9, firstLaunch - 0.5, firstLaunch - 0.1, firstLaunch + 0.2));
    const ev = Math.round(150 + 105 * glow);
    g.fillRect(EMBER_X, EMBER_Y, 1, 1, (ev << 16) | (ev << 8) | ev);
    const hv = Math.round(40 + 90 * glow);
    g.fillRect(EMBER_X - 1, EMBER_Y, 1, 1, (hv << 16) | (hv << 8) | hv, { a: 0.8 });

    g.cost.box += ops;
    g.cost.px += N;
  },
};
