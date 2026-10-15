// Op Art — the time drawn by nothing but a field of lines.
//
// The whole glass is thin horizontal lines, one pixel lit in four, and waves
// run through them as in Bridget Riley's "Current": a long swell travels
// left to right, its height rising and falling down the screen and over
// time, and the whole field creeps slowly downwards. The digits have no
// outline and no fill of their own. Where a digit is, the water is calm: the
// waves die away over the last few pixels before a stroke, so the lines bend
// as they enter it, run dead straight through it, and inside the stroke each
// line swells from one pixel to three. The time is a change in the texture
// only (wavy and thin outside, straight and thick inside) and the eye
// builds the figure from it. The lines keep creeping through the digits, so
// the figure stands still while its texture flows.
//
// Several fields were tried and judged at true size: half-period phase
// shifts, a doubled line frequency, concentric rings bulging over the
// digits, and diagonals crossing at 90°. They looked fine zoomed in and
// vanished at arm's length, where the eye averages the texture. Horizontal
// against vertical lines read, but as a maze. Calm, swollen lines in a wavy
// field of thin ones read at true size and still look like op art.
//
// The glyphs are drawn for that. A texture edge needs mass, so every
// stroke is 9 px and every counter at least 8 px, in a tall geometric face
// built from stadiums and semicircles (the 9 is the 6 turned half round).
// Each is a centre-line of segments and arcs whose signed distance field is
// tabulated at load. The distance drives both the calm and the swelling, so
// the edges are smooth ramps, not outlines.
//
// The minute turn is a stone dropped in the pond. At :59 a ring expands
// from the changing digits, its crest heaving the lines as it passes, and
// as it reaches each changing digit the digit lets go: its lines unswell and
// the waves flood back in, and it is gone into the ground. At :00 a second
// ring follows from the same point, and as its crest passes each slot the
// new digit is developed: the water goes calm in its shape and the lines
// swell. Each fade or development takes 80 ms. A slower one was tried, and a
// half-developed 0 (strong stems, weak arcs) read as 11, so it snaps, hidden
// under the passing crest. Thinning the strokes instead fails the same way. The first ring clears every changing slot before the second
// starts, so a slot shows its old digit, nothing, or its new digit, never a
// mixture of times. Unchanged digits stay calm: the crest passes under them.
// On the hour the stone drops in the middle at :58.6, the crest is higher,
// the whole pond empties, and all four digits are re-developed outwards.
//
// Every frame is a function of ctx.date: the waves from the time of day, the
// rings from the seconds, the digits from this minute and its neighbour.
//
// Burn-in: the ground is a quarter lit everywhere and always moving, so it
// wears evenly. Inside the digits three rows in four are lit; the lines creep
// through them, so no pixel there is lit steadily, the time block walks a
// 2-pixel orbit, and from 23:00 to 07:00 the panel runs at low contrast.
// The strokes the hour tens always share (the 0/1/2 stems) still wear
// fastest: check.mjs puts the hottest pixel at about 10 h/day of
// full-contrast drive.
//
// Bus: the whole screen changes every frame, so it runs on SPI at 60 fps
// (0.8 ms a frame), where a frame lands well inside one panel refresh and
// does not tear. Everything is timed in seconds, not frames. The field is
// separable (a height per row times a sine per column), so a frame costs
// about a millisecond.

import { orbit, clockFields, clamp } from '../js/kit.js';

const W = 128, H = 64, PI = Math.PI;

// ------------------------------------------------------------ glyphs

const GW = 26, GH = 54, T = 9;        // glyph box and stroke
const M = 8;                          // margin tabulated round it, for the calm
const L = 4.5, R = 21.5, CX = 13, TOP = 4.5, BOT = 49.5, RAD = 8.5;
const seg = (ax, ay, bx, by) => ({ k: 's', ax, ay, bx, by });
const arc = (cx, cy, r, a0, a1) => ({ k: 'a', cx, cy, r, a0, a1 });   // y down, a0 < a1

const PATHS = {
  0: [seg(L, 13, L, 41), seg(R, 13, R, 41), arc(CX, 13, RAD, PI, 2 * PI), arc(CX, 41, RAD, 0, PI)],
  1: [seg(15.5, TOP, 15.5, BOT), seg(6.5, 12, 15.5, TOP)],
  2: [arc(CX, 13, RAD, 1.05 * PI, 2.25 * PI), seg(CX + RAD * Math.SQRT1_2, 13 + RAD * Math.SQRT1_2, L, BOT), seg(L, BOT, R, BOT)],
  3: [arc(CX, 13, RAD, 1.1 * PI, 2 * PI), seg(R, 13, R, 18.5), arc(CX, 18.5, RAD, 0, PI / 2), seg(9, 27, CX, 27),
    arc(CX, 35.5, RAD, -PI / 2, 0), seg(R, 35.5, R, 41), arc(CX, 41, RAD, 0, 0.9 * PI)],
  4: [seg(L, TOP, L, 33), seg(L, 33, R + 0.5, 33), seg(18, 16, 18, BOT)],
  5: [seg(R, TOP, L, TOP), seg(L, TOP, L, 25.5), seg(L, 25.5, CX, 25.5), arc(CX, 34, RAD, -PI / 2, 0), seg(R, 34, R, 41),
    arc(CX, 41, RAD, 0, 0.9 * PI)],
  6: [seg(L, 35, L, 41), seg(R, 35, R, 41), arc(CX, 35, RAD, PI, 2 * PI), arc(CX, 41, RAD, 0, PI), seg(L, 13, L, 35),
    arc(CX, 13, RAD, PI, 1.8 * PI)],
  7: [seg(L, TOP, R, TOP), seg(R, TOP, 9, BOT)],
  8: [arc(CX, 12, 7.5, PI, 2 * PI), arc(CX, 19.5, 7.5, 0, PI), seg(CX - 7.5, 12, CX - 7.5, 19.5), seg(CX + 7.5, 12, CX + 7.5, 19.5),
    arc(CX, 35.5, RAD, PI, 2 * PI), arc(CX, 41, RAD, 0, PI), seg(L, 35.5, L, 41), seg(R, 35.5, R, 41)],
};
PATHS[9] = PATHS[6].map((p) => (p.k === 's'
  ? seg(GW - p.ax, GH - p.ay, GW - p.bx, GH - p.by)
  : arc(GW - p.cx, GH - p.cy, p.r, p.a0 + PI, p.a1 + PI)));

/** Signed distance from (x, y) to a stroked path: negative inside. */
function pathDist(path, x, y) {
  let d = Infinity;
  for (const p of path) {
    if (p.k === 's') {
      const dx = p.bx - p.ax, dy = p.by - p.ay, l2 = dx * dx + dy * dy;
      const u = l2 ? clamp(((x - p.ax) * dx + (y - p.ay) * dy) / l2, 0, 1) : 0;
      d = Math.min(d, Math.hypot(x - p.ax - u * dx, y - p.ay - u * dy));
    } else {
      let a = Math.atan2(y - p.cy, x - p.cx);
      while (a < p.a0) a += 2 * PI;
      while (a > p.a0 + 2 * PI) a -= 2 * PI;
      if (a <= p.a1) d = Math.min(d, Math.abs(Math.hypot(x - p.cx, y - p.cy) - p.r));
      else for (const e of [p.a0, p.a1]) d = Math.min(d, Math.hypot(x - p.cx - p.r * Math.cos(e), y - p.cy - p.r * Math.sin(e)));
    }
  }
  return d - T / 2;
}

const SW = GW + 2 * M, SH = GH + 2 * M;
const SDF = [];
for (let d = 0; d <= 9; d++) {
  const a = new Float32Array(SW * SH);
  for (let j = 0; j < SH; j++)
    for (let i = 0; i < SW; i++) a[j * SW + i] = pathDist(PATHS[d], i - M + 0.5, j - M + 0.5);
  SDF.push(a);
}

const SLOT_X = [2, 31, 71, 100], SLOT_Y = 5;
const COLON = { x: 65, y: [21.5, 41.5], r: 4.2 };

// ------------------------------------------------------------ the field

const P = 4;            // line pitch
const CALM = 5;         // the waves die away over this many px outside a stroke
const SWELL = 2.5;      // lines swell from 1 to 3 px over this many px inside
const DRIFT = 0.7;      // the field creeps down, px/s

// The ground's lines are lifted by (3 + 2 sin(0.05 y + 0.21 t)) sin(0.07 x - 0.9 t):
// a swell 90 px long travelling right at 13 px/s, its height rolling down the
// screen once every 30 s.

// ------------------------------------------------------------ the turn

const SPEED = 60;       // ring speed, px/s
const ERASE_AT = [-1.0, -1.4];  // the first ring drops this long before :00 (minute, hour)
const FADE = 0.08;      // seconds a glyph takes to fade, once its ring reaches it
const GROW = 0.08;      // seconds a new glyph takes to develop
const GROW_LAG = 6;     // px the developing ring runs past a slot before it develops
const CREST = 6;        // half-width of a ring's crest, px

const digitsOf = (f) => [...`${f.hh}${f.mm}`].map(Number);
const smooth = (u) => u * u * (3 - 2 * u);

export default {
  name: 'Op Art',
  blurb: 'Riley lines: the digits are where the waves go calm; each minute a ripple dissolves them and develops the next.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { fields: f, date, oled, night }) {
    oled.contrast(0xcf + (0x14 - 0xcf) * night);  // night dimming, 23:00-07:00 (ctx.night)
    const [ox, oy] = orbit(date, 2, 3);
    // Seconds since a fixed epoch: continuous (no wrap at midnight) and still
    // precise to well under a microsecond in a double.
    const tt = date.getTime() / 1000 - 1.7e9;

    // The turn's window straddles :00, so in the second half of a minute
    // "from" is this minute and "to" the next.
    const u = f.sec >= 30 ? f.sec - 60 : f.sec;
    const before = u < 0 ? f : clockFields(new Date(date.getTime() - 60000));
    const after = u < 0 ? clockFields(new Date(date.getTime() + 60000)) : f;
    const from = digitsOf(before), to = digitsOf(after);
    const hour = after.m === 0;
    const changed = [0, 1, 2, 3].map((s) => hour || from[s] !== to[s]);
    let rcx = 64;
    const rcy = 32 + oy;
    if (!hour) {
      const xs = [0, 1, 2, 3].filter((s) => changed[s]).map((s) => SLOT_X[s] + ox + GW / 2);
      if (xs.length) rcx = (Math.min(...xs) + Math.max(...xs)) / 2;
    }
    const e0 = ERASE_AT[hour ? 1 : 0];
    const erase = u >= e0 ? (u - e0) * SPEED : null;
    const develop = u >= 0 ? u * SPEED : null;
    const ringAmp = hour ? 6 : 4;

    // The figure, as one distance field over the screen, and a strength k
    // per pixel. A changing slot fades out (or develops) all over at once,
    // in three frames, when its ring reaches it.
    const sd = new Float32Array(W * H).fill(99);
    const kk = new Float32Array(W * H);
    for (let s = 0; s < 4; s++) {
      const bx = SLOT_X[s] + ox, by = SLOT_Y + oy;
      let k = 1, D = SDF[to[s]];
      if (changed[s]) {
        const near = Math.hypot(Math.max(bx - rcx, 0, rcx - bx - GW), Math.max(by - rcy, 0, rcy - by - GH));
        if (develop !== null) k = smooth(clamp((develop - near - GROW_LAG) / (SPEED * GROW), 0, 1));
        else {
          D = SDF[from[s]];
          if (erase !== null) k = 1 - smooth(clamp((erase - near) / (SPEED * FADE), 0, 1));
        }
      }
      if (k <= 0) continue;
      for (let j = 0; j < SH; j++) {
        const y = by - M + j;
        if (y < 0 || y >= H) continue;
        for (let i = 0; i < SW; i++) {
          const x = bx - M + i;
          if (x < 0 || x >= W) continue;
          const d = D[j * SW + i], q = y * W + x;
          if (d < sd[q]) { sd[q] = d; kk[q] = k; }
        }
      }
    }
    // The colon breathes, once a second.
    const breathe = 1.2 * (0.5 - 0.5 * Math.cos(2 * PI * f.sec));
    for (const cy of COLON.y)
      for (let y = Math.floor(cy - 10); y <= cy + 10; y++)
        for (let x = COLON.x - 10; x <= COLON.x + 10; x++) {
          const d = Math.hypot(x + 0.5 - COLON.x, y + 0.5 - cy) - COLON.r + breathe;
          const q = (y + oy) * W + x + ox;
          if (d < sd[q]) { sd[q] = d; kk[q] = 1; }
        }

    const drift = tt * DRIFT;
    // wave() is separable: an amplitude per row times a travelling sine per column.
    const amp = new Float32Array(H), sx = new Float32Array(W);
    for (let y = 0; y < H; y++) amp[y] = 3 + 2 * Math.sin(y * 0.05 + tt * 0.21);
    for (let x = 0; x < W; x++) sx[x] = Math.sin(x * 0.07 - tt * 0.9);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const d = sd[y * W + x], k = kk[y * W + x];
        // Calm: 1 in the open, 0 within the strokes.
        const c = 1 - k * (1 - smooth(clamp((d + 1) / (CALM + 1), 0, 1)));
        let lift = amp[y] * sx[x];
        for (const rr of [erase, develop]) {
          if (rr === null) continue;
          const dr = Math.hypot(x + 0.5 - rcx, y + 0.5 - rcy) - rr;
          if (dr > -CREST && dr < CREST) lift += ringAmp * Math.cos((dr / CREST) * PI / 2) ** 2;
        }
        const yy = y - drift + lift * c;
        const ph = ((yy % P) + P) % P;
        const hw = 0.5 + k * clamp((0.5 - d) / SWELL, 0, 1);    // half-width: 0.5 (1 px) to 1.5 (3 px)
        if (ph >= P / 2 - hw && ph < P / 2 + hw) g.pixel(x, y, 1);
      }
  },
};
