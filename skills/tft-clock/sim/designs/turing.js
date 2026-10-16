// Turing: the time is grown, not drawn. The whole glass is one living
// skin running a reaction-diffusion pattern (the stripes and spots Alan
// Turing predicted in 1952), and the numerals are where the skin expresses
// a different pigment.
//
// The skin: a narrow-band field (six plane waves of one wavelength, the
// linear Turing modes, each drifting and turning at its own slow rate,
// bent by a soft warp) cut at a threshold. Where the threshold sits decides
// the regime, exactly as a reaction's feed rate does: high cuts leave
// spots, a level cut leaves a labyrinth of stripes. Nothing ever repeats;
// spots stretch, pinch in two and fuse, stripes break and reconnect.
//
// How to read it:
//   - HH:MM in four tissue numerals (turing-glyphs.js), warm pigment on the
//     cool skin. Inside them the stripes run along the outline, the way
//     Turing stripes align to a boundary, and they are born on each
//     stroke's spine and flow out to its edge, so every numeral pulses
//     from within. Lateral inhibition keeps a clear moat round each one.
//   - The seconds are a regime front: a growth front crosses the skin
//     left to right once a minute, turning labyrinth into spots (and spots
//     back into labyrinth the next minute). Where the front is, the
//     second is: its left edge at x = 0 is :00, mid-glass :30.
//   - Minute turn: the changing numerals heal away, their stripes pinching
//     into spots at the nucleation seeds that shrink to nothing (:57.6 to
//     :59.5); after :00 the new numerals nucleate as spots at their seeds,
//     ringed by target waves, that swell and fuse into strokes (to :02.2).
//   - Hour: a chemical target wave (Belousov-Zhabotinsky rings) rolls out
//     from the colon across the whole skin.
//
// Palette: an animal's skin, by time of day; a cool ground and its pattern
// colour for the skin, a hot pigment and its stripe colour for the time.
// Morning plum and gold, day cobalt and fire (a mandarinfish), dusk teal
// and coral, night ink and ember. Night (23-07) also dims the backlight.
//
// Hard or AA: every edge is a level set of a smooth field, so every edge is
// anti-aliased from the field's own value (no extra cost).
//
// Cost (C port): the skin's six wave phases are bilinear per 8 px cell
// (the warp lives at the nodes), so a pixel is six adds, six table lookups
// and a threshold; the numerals add a map lookup and one more table lookup;
// colours come from 17-step RGB565 ramps. No per-pixel callbacks and no
// float trig per pixel. Every motion runs a whole number of cycles a day.
import { to565, clamp, noise2, hash } from '../js/kit.js';
import { glyphs, PAD, MW, MH } from './turing-glyphs.js';

const W = 160, H = 80, N = W * H;
const TAU = Math.PI * 2;

// A local sine table (the C port's 1024-entry Int16 table).
const ST = 1024;
const SIN = Float32Array.from({ length: ST + 1 }, (_, i) => Math.sin((i / ST) * TAU));
const tsin = (a) => { let u = (a / TAU) % 1; if (u < 0) u += 1; const f = u * ST, i = f | 0; return SIN[i] + (SIN[i + 1] - SIN[i]) * (f - i); };
const tcos = (a) => tsin(a + Math.PI / 2);

/** Phase in radians of a cycle of `p` seconds at day-second T (p divides 86400). */
const cyc = (T, p) => TAU * ((T / p) % 1);
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

// ------------------------------------------------------------ palettes

// [skin ground, skin pattern, pigment, pigment stripe, front glow]
const PAL = {
  morning: [0x2a1440, 0x8a3a86, 0xffa21e, 0xfff0b8, 0xd86ab0],
  day: [0x0b2462, 0x2a7ad6, 0xff5214, 0xffd24a, 0x58b4ff],
  dusk: [0x0c3036, 0x22907e, 0xff3c54, 0xffc8a0, 0x4ad8b8],
  night: [0x060e1a, 0x123a54, 0xd8461c, 0xf2a048, 0x2a6a8a],
};
// Hour -> palette, crossfaded over the first hour of each.
const SCHEDULE = [[0, 'night'], [6, 'morning'], [9, 'day'], [17, 'dusk'], [21, 'night']];

function mixc(a, b, u) {
  const k = (clamp(u, 0, 1) * 256) | 0, j = 256 - k;
  return (((((a >> 16) & 255) * j + ((b >> 16) & 255) * k) >> 8) << 16)
    | (((((a >> 8) & 255) * j + ((b >> 8) & 255) * k) >> 8) << 8)
    | ((((a & 255) * j + (b & 255) * k) >> 8));
}

function paletteAt(hours) {
  let cur = SCHEDULE[0], prev = SCHEDULE[SCHEDULE.length - 1];
  for (let i = 0; i < SCHEDULE.length; i++) if (hours >= SCHEDULE[i][0]) { cur = SCHEDULE[i]; prev = SCHEDULE[(i + SCHEDULE.length - 1) % SCHEDULE.length]; }
  const u = smooth(hours - cur[0]);
  const a = PAL[prev[1]], b = PAL[cur[1]];
  return a.map((c, i) => mixc(c, b[i], u));
}

// ------------------------------------------------------------ the skin's waves

const NW = 6;
const LAMBDA = 7.2;                       // skin wavelength, px
const WAVES = Array.from({ length: NW }, (_, i) => {
  const r = (k) => (hash(7, i, k) % 100000) / 100000;
  return {
    a0: (i / NW) * Math.PI + (r(1) - 0.5) * 0.9,           // direction (mod pi)
    turn: [1440, 2160, 2880, 3600, 4320, 5400][i] * (r(2) < 0.5 ? -1 : 1), // s per full turn
    k: (TAU / LAMBDA) * (0.93 + 0.14 * r(3)),
    p0: r(4) * TAU,
    drift: [9.6, 12, 14.4, 16, 18, 21.6][(i + 2) % NW] * (r(5) < 0.5 ? -1 : 1), // s per phase cycle
  };
});
const SIGMA = Math.sqrt(NW / 2);
const CELL = 8, NX = W / CELL + 1, NY = H / CELL + 1;

// Per-frame scratch (the C port's static buffers).
const PH = new Float32Array(NW * NX * NY);      // wave phases at the nodes
const SDB = new Float32Array(N);                 // the numerals' signed distance, px
const RS = new Float32Array(64);                // this frame's radius of each nucleation seed
const FRONT = new Float32Array(H);               // the seconds front, x per row
const RAMP_S = new Uint16Array(17), RAMP_P = new Uint16Array(17);

const DIGIT_X = [3, 38, 64, 89, 124];            // slot x of HH, colon, MM (glyph boxes 32 wide)
const DIGIT_Y = 7;
const CX = 80, CY = 40;                          // colon centre, the hour wave's source

// ------------------------------------------------------------ the design

export default {
  name: 'Turing',
  blurb: 'A living reaction-diffusion skin; the time is where it grows a hotter pigment, a growth front sweeps the seconds.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, d = ctx.date;
    const T = f.h * 3600 + f.m * 60 + f.sec;    // day seconds
    const sec = f.sec;
    ctx.lcd.backlight(1 - 0.55 * ctx.night);
    const G = glyphs();
    const pal = paletteAt(T / 3600);
    const [cG, cP, cD, cS, cF] = pal;

    // ---- numerals: which glyph in each slot, and how grown
    const next = ctx.kit.clockFields(new Date(d.getTime() + 60000));
    const prev = ctx.kit.previousMinute(d);
    const now = f.hh + f.mm, nx = next.hh + next.mm, pv = prev.hh + prev.mm;
    const slots = [];
    for (let s = 0; s < 5; s++) {
      if (s === 2) { slots.push({ x: DIGIT_X[s], glyph: 10, grow: 1 }); continue; }
      const k = s > 2 ? s - 1 : s;
      // grow: linear progress 0..1 of the tissue (1 = whole numeral)
      let grow = 1, dir = 0;
      if (now[k] !== nx[k] && sec > 57.7) { grow = 1 - clamp((sec - 57.7) / 1.85, 0, 1); dir = -1; }
      if (now[k] !== pv[k] && sec < 2.2) { grow = clamp((sec - 0.05) / 2.1, 0, 1); dir = 1; }
      slots.push({ x: DIGIT_X[s], glyph: +now[k], grow, dir, k });
    }

    // Breathing: each numeral's tissue swells and slims by a fraction of a pixel.
    SDB.fill(64);
    let work = 0;
    for (const sl of slots) {
      if (sl.grow <= 0) continue;
      const gm = G[sl.glyph];
      // Each seed nucleates on its own delay (popping, not a wipe), and
      // they all finish together, so the whole numeral is whole at grow = 1.
      for (let q = 0; q < gm.seeds.length; q++) {
        const dl = 0.45 * (hash(f.minuteKey, sl.x, q) % 1000) / 1000;
        const u = smooth((sl.grow - dl) / (1 - dl));
        RS[q] = u <= 0 ? -9 : u * (gm.full + 1.5) + 0.6;
      }
      const breath = 0.35 * tsin(cyc(T, 6) + sl.x * 0.07);
      const ox = sl.x - PAD, oy = DIGIT_Y - PAD;
      const growing = sl.grow < 1;
      for (let my = 0; my < MH; my++) {
        const y = oy + my;
        if (y < 0 || y >= H) continue;
        for (let mx = 0; mx < MW; mx++) {
          const x = ox + mx;
          if (x < 0 || x >= W) continue;
          const i = my * MW + mx;
          let v = gm.sd[i] - breath;
          if (growing) {
            const e = gm.seed[i] - RS[gm.near[i]];
            if (e > v) v = e;
          }
          const o = y * W + x;
          if (v < SDB[o]) SDB[o] = v;
          work++;
        }
      }
    }

    // ---- skin wave phases at the nodes (warp included)
    for (let w = 0; w < NW; w++) {
      const wv = WAVES[w];
      const a = wv.a0 + cyc(T, wv.turn), kx = wv.k * Math.cos(a), ky = wv.k * Math.sin(a);
      const ph = wv.p0 + cyc(T, wv.drift);
      for (let j = 0; j < NY; j++)
        for (let i = 0; i < NX; i++) {
          const X = i * CELL, Y = j * CELL;
          const wx = WX[j * NX + i], wy = WY[j * NX + i];
          PH[(w * NY + j) * NX + i] = kx * (X + wx) + ky * (Y + wy) + ph;
        }
    }

    // ---- seconds front, per row (wavy), and its regime
    const odd = (f.h * 60 + f.m) & 1;
    const span = W + 70;
    const fx = -35 + (sec / 60) * span;
    for (let y = 0; y < H; y++) FRONT[y] = fx + 6 * (noise2(y / 14, cyc(T, 60) * 0.3, 5) - 0.5) * 2;
    const TH_SPOT = 1.05, TH_LAB = 0.05, BAND = 26;
    const thBehind = odd ? TH_LAB : TH_SPOT, thAhead = odd ? TH_SPOT : TH_LAB;

    // ---- hour wave
    const hs = f.m === 0 ? sec : f.m === 59 ? sec - 60 : 99;
    const hourOn = hs > -0.01 && hs < 4.2;

    // ---- colour ramps
    for (let q = 0; q <= 16; q++) { RAMP_S[q] = to565(mixc(cG, cP, q / 16)); RAMP_P[q] = to565(mixc(cD, cS, q / 16)); }

    // ---- the pass
    const buf = g.buf;
    const stripePh = cyc(T, 2.4);
    const gainB = 1 / ((TAU / LAMBDA) * 0.95);
    const kD = TAU / 5.6;
    let blends = 0, inside = 0;
    for (let y = 0; y < H; y++) {
      const j = Math.min(NY - 2, (y / CELL) | 0), fy = (y + 0.5 - j * CELL) / CELL;
      const frow = FRONT[y];
      for (let x = 0; x < W; x++) {
        const i = Math.min(NX - 2, (x / CELL) | 0), fxl = (x + 0.5 - i * CELL) / CELL;
        // skin field
        let v = 0;
        for (let w = 0; w < NW; w++) {
          const b = (w * NY + j) * NX + i;
          const p0 = PH[b] + (PH[b + 1] - PH[b]) * fxl, p1 = PH[b + NX] + (PH[b + NX + 1] - PH[b + NX]) * fxl;
          v += tcos(p0 + (p1 - p0) * fy);
        }
        v /= SIGMA;
        // regime threshold: the seconds front
        const u = smooth((frow - x) / BAND + 0.5);
        let th = thAhead + (thBehind - thAhead) * u;
        const o = y * W + x;
        const sd = SDB[o];
        // lateral inhibition: no skin pattern within ~4 px of a numeral
        if (sd < 3.5) th += 2.6 * (1 - Math.max(0, sd) / 3.5);
        let glow = 0;
        if (hourOn) {
          const r = DIST[o] - (8 + hs * 44);
          // three rings, 16 px apart, behind the leading one
          if (r < 2 && r > -34) {
            const ring = tcos((r / 16) * TAU) * (1 - (-r) / 34) * smooth(1 - hs / 4.2);
            if (ring > 0) { th -= 1.6 * ring; glow = ring; }
          }
        }
        // front glow: the growth front is a little brighter
        const fg = 1 - Math.abs(frow - x) / (BAND * 0.6);
        let covS = clamp(0.5 + (v - th) * SIGMA * gainB, 0, 1);
        let skin = RAMP_S[(covS * 16 + 0.5) | 0];
        if (fg > 0 || glow > 0) {
          const lift = Math.max(fg > 0 ? fg * 0.45 : 0, glow);
          skin = to565(mixc(mixc(cG, cP, covS), cF, lift * covS));
        }
        if (sd >= 0.5) { buf[o] = skin; continue; }
        // pigment: stripes along the outline, born on the spine, flowing out
        inside++;
        // the skin's own field bends them a little: forks and wobbles, not an inline font
        const dv = tcos(kD * sd - stripePh + 0.45 * v);
        const covD = clamp(0.5 + (dv - 0.1) * 1.3, 0, 1);
        const pig = RAMP_P[(covD * 16 + 0.5) | 0];
        const m = 0.5 - sd;
        if (m >= 1) buf[o] = pig;
        else {
          blends++;
          buf[o] = to565(mixc(mixc(cG, cP, covS), mixc(cD, cS, covD), m));
        }
      }
    }
    g.cost.px += N;
    g.cost.box += N * 16 + inside * 4 + work * 2 + NW * NX * NY * 4;
    g.cost.blend += blends;
  },
};

// ------------------------------------------------------------ static tables

// Warp at the nodes: a soft displacement, fixed (the waves' own drift and
// turning keep it from ever looking the same).
const WX = new Float32Array(NX * NY), WY = new Float32Array(NX * NY);
for (let j = 0; j < NY; j++)
  for (let i = 0; i < NX; i++) {
    WX[j * NX + i] = 7 * (noise2(i * 0.31, j * 0.31, 11) - 0.5);
    WY[j * NX + i] = 7 * (noise2(i * 0.31, j * 0.31, 23) - 0.5);
  }

// Distance from the colon centre, for the hour's target wave (a 12.8 KB table on the device).
const DIST = new Float32Array(N);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) DIST[y * W + x] = Math.hypot(x + 0.5 - CX, y + 0.5 - CY);
