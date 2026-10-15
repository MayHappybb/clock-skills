// Cracktro: the glass is a 1980s demo-group intro, and the time is the
// group's big logo. Four numerals in the demo's own angular logo face (cut
// at 45 degrees, solid ink with a 1-px inline cut and thin cuts scrolling up
// through the stroke, which close where a raster band slides down through
// them; a 4-px black moat round each) swing like the
// classic bouncing logo, bob on a sine one after another, ripple column by
// column like a flag and thump on every kick of the imaginary chip tune
// (120 bpm). Hours big, minutes smaller, with a VU
// equaliser riding over them. Behind: the demo's current "part" (starfield,
// plasma iso-lines, checker tunnel or rotozoomer, switching every hour); under
// it all a sine scroller in the demo's 8x8 font sends greetings to invented
// groups. Every ~12 s the logo does a trick: a flag-wave surge, a glint, a
// copper storm, a hop wave.
//
// Minute turn: the changing numeral bursts into its own pixels, which fly
// out on sine paths (it thins evenly, gone before :00) and fly back in after
// :00 as the new numeral, outline first. Hour: a megademo "part change":
// every numeral bursts, the dots spin in a galaxy round the screen, the
// screen flashes and dissolves in ordered dither, the background part
// switches, the logo lands with a bounce and the scroller announces the hour
// in words.
//
// Colour: strictly two values, hot magenta #ff2a9a ink on black: the loud
// single colour of a cracktro's logo on a black screen, here the only one,
// so the demo's shading is all 1-bit (ordered dither, rasters, stripes):
// the logo is the densest ink on the glass, every background part a sparse
// dust and thin lines (about 12-15 % ink).
// Every frame is built in a byte mask and written as those two values.
// Night dims through the backlight only.
//
// Cost: the mask is filled by integer loops (charged to the estimate as box
// work): one background effect (at most a few table lookups a pixel), the
// four numerals from precomputed style maps (~7k lookups), the scroller
// (160 columns) and at a turn up to ~4.5k flying dots at the hour (two or
// three table sines each). Nothing is drawn off-canvas. Flash: numeral
// style maps 30 KB, order maps 60 KB, dot lists 66 KB, tunnel tables 39 KB,
// font and small tables 2 KB (~197 KB). RAM: the 12.8 KB mask plus a few
// hundred bytes of per-frame arrays.

import { to565, sin, hash, clockFields, previousMinute } from '../js/kit.js';
import { BIG, SMALL, MOAT, FONT } from './cracktro-glyphs.js';
import { background, copper, BAYER, PART_NAMES } from './cracktro-fx.js';

const W = 160, H = 80, N = W * H, TAU = Math.PI * 2;
const INK = to565(0xff2a9a), GND = to565(0x000000);
const M = new Uint8Array(N);
const WAVE = new Int8Array(W);
const SX = new Int16Array(4), SY = new Int16Array(4), TURN = new Uint8Array(4);

// ------------------------------------------------------------ order maps (flash)
// For each glyph: when each box pixel leaves (rand order) or arrives (outline
// first), as a byte 0..255; moat pixels get a hashed byte so the moat
// dissolves and forms with the digit.
for (const set of [BIG, SMALL]) for (let d = 0; d < 10; d++) {
  const G = set[d], n = G.n;
  G.ordR = new Uint8Array(G.bw * G.bh); G.ordE = new Uint8Array(G.bw * G.bh);
  for (let i = 0; i < G.map.length; i++) if (G.map[i] === 1 || G.map[i] === 5) G.ordR[i] = G.ordE[i] = hash(i, d, 77) & 255;
  for (let k = 0; k < n; k++) {
    const pr = G.rand[k], pe = G.edge[k];
    G.ordR[(pr >> 8) * G.bw + (pr & 255)] = ((k * 256) / n) | 0;
    G.ordE[(pe >> 8) * G.bw + (pe & 255)] = ((k * 256) / n) | 0;
  }
}

// ------------------------------------------------------------ layout

const SLOTS = [
  { set: BIG, x: 15, y: 4 },
  { set: BIG, x: 50, y: 4 },
  { set: SMALL, x: 94, y: 16 },
  { set: SMALL, x: 121, y: 16 },
];
const COLON_X = 88, COLON_Y = [27, 41];
const SCROLL_Y = 63;

// the minute's schedule (seconds from the turn): departures, then arrivals
const MIN_T = { d0: -0.95, d1: -0.5, a0: 0.0, a1: 0.45 };
const HOUR_T = { d0: -0.95, d1: -0.5, a0: 0.0, a1: 0.5 };

// ------------------------------------------------------------ the scroller text

const GREET = '      THE TIME CRACKERS PROUDLY PRESENT ... THE CLOCK ... CRACKED, TRAINED AND ' +
  'SPREAD BY TICK & TOCK ... MUSIC BY DJ BLEEP ... GREETINGS FLY OUT TO: THE SINE BROTHERS ' +
  '* BITPLANE BUTCHERS * DITHER DUKES * VBLANK VANDALS * MAGENTA MOB * THE BLITTER BAKERS ' +
  '* RASTER RASCALS * COPPER COWBOYS * SCROLL SAINTS * KERNEL KOALAS * THE LOOP LEGION ... ' +
  'NO LAMERS WERE HARMED IN THE MAKING OF THIS INTRO ... PRESS FIRE TO CONTINUE ... OR DON\'T, ' +
  'WE ARE A CLOCK ...      ';
const PRE = '      GET READY FOR THE NEXT PART ... HOLD ON TO YOUR JOYSTICK ...   ';
const HOUR_WORDS = ['MIDNIGHT', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
  'TEN', 'ELEVEN', 'NOON', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN'];
const ANN = HOUR_WORDS.map((w, h) => {
  const when = h === 0 || h === 12 ? `IT IS ${w}` : `IT IS ${w} O'CLOCK`;
  return `  *** PART: ${PART_NAMES[h % 4]} ***   ${when}  ***   `;
});
const CHARS_PER_HOUR = 27000;   // 7.5 characters a second

function scrollChar(k) {
  const kh = ((k % CHARS_PER_HOUR) + CHARS_PER_HOUR) % CHARS_PER_HOUR;
  const hour = (Math.floor(k / CHARS_PER_HOUR) % 24 + 24) % 24;
  const ann = ANN[hour];
  if (kh < ann.length) return ann.charCodeAt(kh);
  if (kh >= CHARS_PER_HOUR - PRE.length) return PRE.charCodeAt(kh - (CHARS_PER_HOUR - PRE.length));
  return GREET.charCodeAt((kh - ann.length) % GREET.length);
}

function scroller(L, tDay) {
  const P = Math.floor(L * 60);   // one pixel a frame
  const ph = tDay * 2.2;
  for (let x = 0; x < W; x++) {
    const q = P - 159 + x, k = Math.floor(q / 8), col = q - k * 8;
    const y0 = SCROLL_Y + Math.round(4 * sin(x * 0.07 + ph));
    // the ribbon: a ground band carrying the letters, dotted rails above and below
    for (let y = y0 - 2; y <= y0 + 8; y++) M[y * W + x] = 0;
    if (((q >> 1) & 1) === 0) { M[(y0 - 3) * W + x] = 1; M[(y0 + 9) * W + x] = 1; }
    const code = scrollChar(k);
    const bits = col < 7 ? FONT[(code & 127) * 8 + col] : 0;
    if (bits) for (let r = 0; r < 7; r++) if (bits & (1 << r)) M[(y0 + r) * W + x] = 1;
  }
  return W * 18;
}

// ------------------------------------------------------------ the numerals

/**
 * Draw glyph G with its box's top-left at (X, Y) (column wave added).
 * mode 0: whole, with moat; 1: leaving (pixels with ordR > cut); 2: arriving (ordE < cut);
 * 3: arriving with the whole moat (the hour, over the flash).
 * pass 0 draws only the ground (moat and counters), pass 1 only the ink, so
 * every numeral's moat is laid before any numeral's ink and none clips another.
 */
function glyph(G, X, Y, mode, cut, stripe, glint, rb, pass) {
  const bw = G.bw, bh = G.bh, map = G.map, ord = mode >= 2 ? G.ordE : G.ordR;
  let ops = 0;
  for (let bx = 0; bx < bw; bx++) {
    const sx = X + bx;
    if (sx < 0 || sx >= W) continue;
    const top = Y + WAVE[sx];
    for (let by = 0; by < bh; by++) {
      const i = by * bw + bx, cls = map[i];
      if (cls === 0 || (pass === 0) !== (cls === 1 || cls === 5)) continue;
      if (mode === 1 ? ord[i] <= cut : mode === 2 ? ord[i] >= cut : mode === 3 ? ord[i] >= cut && (cls === 2 || cls === 3 || cls === 4) : false) continue;
      const sy = top + by;
      if (sy < 0 || sy >= H) continue;
      // solid ink: the rim, then a 1-px inline cut, then the body with thin
      // cuts scrolling up through it; inside the raster band the cuts close
      let v = 0;
      if (pass === 1) {
        const inBand = sy - rb >= 0 && sy - rb < 6;
        v = cls === 2 || inBand ? 1 : cls === 4 ? (((sy + stripe) & 7) !== 0 ? 1 : 0) : 0;
      }
      if (cls >= 2 && cls < 5 && glint !== -999) {
        const gg = sx + ((H - sy) >> 1) - glint;
        if (gg >= 0 && gg < 4) v ^= 1;
      }
      M[sy * W + sx] = v;
    }
    ops += bh;
  }
  return ops * 4;
}

/** The flying dots of one slot: old pixels out on sine paths, back in as the new digit. */
function flight(Go, Gn, xo, yo, xn, yn, tau, T, hour, seed) {
  const No = Go.n, Nn = Gn.n, Nd = No > Nn ? No : Nn;
  const ds = T.d1 - T.d0, as = T.a1 - T.a0;
  const hcx = Go.bw >> 1, hcy = Go.bh >> 1;
  let ops = 0;
  for (let i = hour ? 0 : 1; i < Nd; i += hour ? 1 : 2) {   // a minute flies every other pixel: sparks, not fog
    const io = i % No, inn = i % Nn;
    const td = T.d0 + (ds * io) / No;
    if (tau < td) continue;
    const ta = T.a0 + (as * inn) / Nn;
    if (tau >= ta) continue;
    const u = (tau - td) / (ta - td), e = u * u * (3 - 2 * u);
    const po = Go.rand[io], pn = Gn.edge[inn];
    const obx = po & 255, oby = po >> 8;
    let ax = xo + obx; const ay = yo + oby + WAVE[ax < 0 ? 0 : ax > 159 ? 159 : ax];
    let bx = xn + (pn & 255); const by = yn + (pn >> 8) + WAVE[bx < 0 ? 0 : bx > 159 ? 159 : bx];
    const h1 = hash(i, seed), r1 = (h1 & 1023) / 1023, r2 = ((h1 >>> 10) & 1023) / 1023, r3 = ((h1 >>> 20) & 1023) / 1023;
    let bulge = sin(Math.PI * u); bulge = bulge * (2 - bulge);   // out fast, hang, in fast
    let x = ax + (bx - ax) * e, y = ay + (by - ay) * e;
    if (hour) {
      // a galaxy: the dots ride a spinning elliptical ring round the glass
      const th = r1 * TAU + tau * 2.4;
      const rx = 56 + 20 * r2, ry = 22 + 12 * r3;
      const gx = 80 + rx * sin(th + Math.PI / 2), gy = 36 + ry * sin(th);
      x += (gx - x) * bulge; y += (gy - y) * bulge;
    } else {
      // a burst: thrown out from the numeral's centre, a sine wobble on the way
      const vx = ((obx - hcx) / hcx) * 44 + (r1 - 0.5) * 60, vy = ((oby - hcy) / hcy) * 26 + (r2 - 0.5) * 40 - 6;
      x += vx * bulge;
      y += vy * bulge + 3 * sin(TAU * (2 * u + r3));
    }
    const px = x | 0, py = y | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) M[py * W + px] = 1;
    ops++;
  }
  return ops * 30;
}

// ------------------------------------------------------------ small parts

function vu(bi, bp, x0) {
  const fall = (1 - bp) * (1 - bp);
  for (let k = 0; k < 8; k++) {
    const r = (hash(k, bi, 5) & 255) / 255;
    const lv = Math.min(4, Math.floor(1 + 3.99 * (0.25 + 0.75 * r) * fall + ((hash(k, bi >> 1, 9) & 1))));
    const x = x0 + k * 6;
    for (let j = 0; j < lv; j++) {
      const y = 9 - 3 * j;
      for (let yy = y; yy <= y + 1; yy++) for (let xx = x; xx < x + 4; xx++) if (xx >= 0 && xx < W) M[yy * W + xx] = 1;
    }
  }
  return 8 * 4 * 8;
}

function colon(x, y, r) {
  for (let dy = -r - 1; dy <= r + 1; dy++) for (let dx = -r - 1; dx <= r + 1; dx++) {
    const d = (dx < 0 ? -dx : dx) + (dy < 0 ? -dy : dy), i = (y + dy) * W + x + dx;
    if (d <= r) M[i] = 1; else if (d <= r + 1) M[i] = 0;
  }
}

const bump = (s, a, len) => { const p = (s - a) / len; return p <= 0 || p >= 1 ? 0 : sin(Math.PI * p); };

// ------------------------------------------------------------ the frame

export default {
  name: 'Cracktro',
  blurb: 'A 1980s demo intro in 1-bit magenta: the time is the group logo, swinging, bobbing and rippling over starfields, plasma, tunnels and vector balls, with a sine scroller of greetings.',
  fps: 60,

  frame(g, ctx) {
    const date = ctx.date, f = ctx.fields, sec = f.sec;
    ctx.lcd.backlight(1 - 0.7 * ctx.night);
    const L = date.getTime() / 1000 - date.getTimezoneOffset() * 60;   // local seconds since the epoch
    const tDay = ((L % 86400) + 86400) % 86400;

    // the beat: 120 bpm, a kick on every half second
    const beat = tDay * 2, bi = Math.floor(beat), bp = beat - bi;
    const kick = bp < 0.25 ? (1 - bp * 4) * (1 - bp * 4) : 0;
    const kp = bp < 0.25 ? 1 - (1 - bp * 4) ** 3 : 1;           // the kick's travel so far, 0..1
    const warp = (bi + kp) / 12 * 0.5;                            // extra star travel the kicks have added (s)

    // this minute's job: which numerals turn, and where we are in the turn
    let tau = 99, from = null, to = null, hourTurn = false;
    const now = f.hh + f.mm;
    if (sec >= 57) { tau = sec - 60; from = now; const nf = clockFields(new Date(date.getTime() + 60000)); to = nf.hh + nf.mm; hourTurn = nf.m === 0; }
    else if (sec < 3) { tau = sec; const pf = previousMinute(date); from = pf.hh + pf.mm; to = now; hourTurn = f.m === 0; }
    const T = hourTurn ? HOUR_T : MIN_T;

    // the flourish of the moment (every 12 s)
    const surge = bump(sec, 6, 3), glintOn = sec >= 18 && sec < 21, storm = sec >= 30 && sec < 33.5;

    // the logo's motion
    const swing = Math.round(3 * sin((TAU * tDay) / 4));
    const thump = Math.round(2 * kick);
    const amp = 1.4 + 1.7 * surge * surge, wsp = 5 + 4 * surge;
    for (let x = 0; x < W; x++) WAVE[x] = Math.round(amp * sin(x * 0.16 - tDay * wsp));
    let landing = 0;
    if (hourTurn && tau >= T.a1 && tau < T.a1 + 1.5) {
      const p = (tau - T.a1) / 1.5;
      landing = -Math.round(5 * Math.abs(sin(Math.PI * 2.5 * p)) * (1 - p));
    }
    const stripe = -Math.floor(tDay * 12);
    const rb = Math.floor((tDay * 30) % 80) - 14;   // the raster band sliding down through the logo
    const glint = glintOn ? Math.floor((sec - 18) * 70) - 40 : -999;

    M.fill(0);
    let ops = N;

    // background: the part, the copper bars
    const part = f.h % 4;
    ops += background(M, part, tDay, warp, kick);
    if (storm) for (let k = 0; k < 4; k++) {
      const y = -6 + (sec - 30 - k * 0.4) * 44;
      if (y > -6 && y < 86) ops += copper(M, y | 0);
    }

    // the numerals: where each is, then the flying dots (behind), then the glyphs
    const pd = (tau - T.d0) / (T.d1 - T.d0), pa = (tau - T.a0) / (T.a1 - T.a0);
    for (let i = 0; i < 4; i++) {
      const S = SLOTS[i];
      const hop = -Math.round(4 * (bump(sec, 42 + i * 0.22, 0.5) + bump(sec, 43.6 + i * 0.22, 0.5)));
      let dy = Math.round(2 * sin(TAU * (tDay / 2) - i * 0.9)) + thump + hop + landing;
      if (dy < 1 - S.y) dy = 1 - S.y;
      SX[i] = S.x - MOAT + swing; SY[i] = S.y - MOAT + dy;
      TURN[i] = tau !== 99 && (from[i] !== to[i] || hourTurn) ? 1 : 0;
      if (TURN[i] && pd > 0 && pa < 1) {
        ops += flight(S.set[from.charCodeAt(i) - 48], S.set[to.charCodeAt(i) - 48], SX[i], SY[i], SX[i], SY[i],
          tau, T, hourTurn, (f.minuteKey + (tau < 0 ? 0 : -1)) * 4 + i);
      }
    }
    // the hour's flash: an ink flood dissolving in ordered dither, behind the logo
    let flash = 0;
    if (hourTurn && tau >= 0 && tau < 0.5) flash = tau < 0.05 ? 16 : Math.round(16 * (1 - (tau - 0.05) / 0.45));
    if (flash) {
      for (let y = 0; y < H; y++) {
        const by = (y & 3) << 2, row = y * W;
        for (let x = 0; x < W; x++) if (BAYER[by | (x & 3)] < flash) M[row + x] ^= 1;
      }
      ops += N * 3;
    }
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < 4; i++) {
      const S = SLOTS[i], X = SX[i], Y = SY[i];
      if (!TURN[i]) { ops += glyph(S.set[now.charCodeAt(i) - 48], X, Y, 0, 0, stripe, glint, rb, pass); continue; }
      const Go = S.set[from.charCodeAt(i) - 48], Gn = S.set[to.charCodeAt(i) - 48];
      if (pd <= 0) ops += glyph(Go, X, Y, 0, 0, stripe, glint, rb, pass);
      else if (pd < 1) ops += glyph(Go, X, Y, 1, pd * 256, stripe, glint, rb, pass);
      if (pa >= 1) ops += glyph(Gn, X, Y, 0, 0, stripe, glint, rb, pass);
      else if (pa > 0) ops += glyph(Gn, X, Y, hourTurn ? 3 : 2, pa * 256, stripe, glint, rb, pass);
    }

    // the colon, the equaliser, the scroller
    const cr = 2 + (kick > 0.3 ? 1 : 0);
    colon(COLON_X + swing, COLON_Y[0], cr); colon(COLON_X + swing, COLON_Y[1], cr);
    ops += vu(bi, bp, 96 + swing);
    ops += scroller(L, tDay);

    // out to the glass: two colours
    const buf = g.buf;
    for (let i = 0; i < N; i++) buf[i] = M[i] ? INK : GND;
    g.cost.px += N; g.cost.box += ops + N;
  },
};
