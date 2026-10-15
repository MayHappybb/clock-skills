// Card Stunt: the glass is a stand across the stadium, seen square on: two
// sections of fans either side of a stairway aisle, every seat a fan holding
// a coloured card over their head. The time is the picture the stand holds
// up. Each numeral is drawn seat by seat in an athletic block face made for
// this grid (cardstunt-glyphs.js): cream cards, 45-degree chamfers printed
// as two-colour diagonal cards, and a navy drop shadow one seat down-right,
// the way jersey numbers are lettered. The colon is two fans on the aisle
// steps with a card each.
//
// The time is never still: on every beat a ripple of card flips spreads out
// from the colon through the numerals (each card turns edge-on, the fan's
// face shows for a moment, and it opens on its other side: cream one second,
// gold the next). Behind the numerals the rest of the stand runs this
// minute's background stunt in two crimsons (a turning sunburst, rolling
// stripes, rings, chevrons, diamonds), one card flip at a time, calmer than
// the numerals. Every 12 s a flourish: a Mexican wave runs along the stand
// with the time still held up (cards lift, arms and faces show underneath),
// or the whole stand bounces on the beat. Phone flashes pop here and there.
//
// Minute turn: from :58.9 the cards of each changing numeral flip over to
// the background side one by one, in an order ranked once per digit, so the
// digit thins evenly and is gone by :59.8. After :00 a flip front runs out
// of the aisle both ways: every card turns as it passes, the background
// changes to the next minute's stunt, and the new numerals' cards flip up
// just behind it. The hour: the big stunt. The stand plays card fireworks
// behind the held time (rockets climb as a line of flipping cards and burst
// in rings of gold, white and magenta), the numerals flip at double time and
// the phone flashes go off all over the stand.
//
// Palette, a college card section: two crimsons for the field, cream and
// gold for the lettering, navy for the shadow, near-black crowd between the
// rows, concrete steps. All flat; the only texture is the medium's own (the
// row gaps, the hands holding the cards, faces in mid-flip). Night: the
// floodlights are down: the field goes to deep maroon, the lettering to warm
// bone and amber, the backlight to 45 %.
//
// Cost: one integer pass over 684 seats (a few table lookups each, charged
// to g.cost.box) writing each card's 12 pixels straight into the frame; at
// the hour each seat also tests the live firework rings (a square root only
// for seats inside a ring). Digit masks and ranks (11 KB), field phases and
// per-seat delays (~25 KB) and the show's seat table (6 KB) are flash
// tables. No per-minute caches, no scratch frame: every frame is built cold.

import { clockFields, hash, sin, TAU } from '../js/kit.js';
import { DIGITS, SW, SH } from './cardstunt-glyphs.js';
import { fireworks, FW_COLOURS } from './cardstunt-show.js';

const W = 160, H = 80;
const COLS = 36, ROWS = 19, NC = COLS * ROWS;   // the last 4 px are the stand's front wall
const SLOT_COL = [0, 9, 18, 27], DROW = 2;           // a numeral's seat grid (9 x 15 with its shadow)
const CX = new Int16Array(COLS);
for (let c = 0; c < COLS; c++) CX[c] = c < 18 ? 4 + 4 * c : 84 + 4 * (c - 18);

const D = 0.2;                  // one card flip, s
const RIP_V = 150;              // the beat ripple, px/s, out of the colon
const ORX = 80, ORY = 38;
const OUT_T0 = 59.1, OUT_SPAN = 0.5;    // old numerals leave, ranked
const REVEAL = 0.25;            // new numerals arrive behind the front, ranked
const FRONT_V = 260;            // the minute's flip front, px/s
const TURN_END = 2;
const WALL_Y = ROWS * 4;
const SKY_ON = 1.3, SKY_OFF = 10.6, SKY_V = 120;   // the hour's night sky
const SWELL = new Uint8Array(COLS);
const HOP = Uint8Array.from({ length: 16 }, (_, i) => Math.round(2.4 * Math.sin(Math.PI * (i + 0.5) / 16)));

// ------------------------------------------------------------ flash tables, per seat

const DELAY = new Float32Array(NC), TFRONT = new Float32Array(NC), SEATX = new Float32Array(NC), SEATY = new Float32Array(NC);
const SLOT = new Int8Array(NC), LOCAL = new Int16Array(NC), FACE = new Uint8Array(NC);
const MOTIFS = [
  { v: 0.30, f: (x, y) => ((Math.atan2(y - ORY, x - ORX) / (2 * Math.PI)) + 0.5) * 12 },   // sunburst, turning
  { v: 0.40, f: (x, y) => (x - 0.7 * y) / 12 },                                            // stripes, rolling
  { v: 0.45, f: (x, y) => Math.hypot(x - ORX, (y - ORY) * 1.3) / 9 },                     // rings, outward
  { v: 0.40, f: (x, y) => (-y + Math.abs(x - ORX) * 0.55) / 9 },                           // chevrons, climbing
  { v: 0.35, f: (x, y) => (Math.abs(x - ORX) + 2 * Math.abs(y - ORY)) / 11 },              // diamonds, growing
];
const PHI = MOTIFS.map(() => new Float32Array(NC));
for (let r = 0; r < ROWS; r++)
  for (let c = 0; c < COLS; c++) {
    const k = r * COLS + c, x = CX[c] + 2, y = r * 4 + 1.5;
    DELAY[k] = Math.hypot(x - ORX, y - ORY) / RIP_V;
    SEATX[k] = x; SEATY[k] = y;
    const i = c < 9 ? 0 : c < 18 ? 1 : c < 27 ? 2 : 3;
    const inRows = r >= DROW && r < DROW + SH;
    SLOT[k] = inRows ? i : -1;
    LOCAL[k] = inRows ? (r - DROW) * SW + (c - SLOT_COL[i]) : 0;
    FACE[k] = hash(k, 77) & 0xff;
    MOTIFS.forEach((m, n) => { PHI[n][k] = m.f(x, y); });
  }
const SLOT_FRONT = new Float32Array(4);
// The minute's front runs out of the aisle both ways (where the caller sits);
// a new numeral starts flipping up when it reaches the numeral's near edge.
for (let k = 0; k < NC; k++) TFRONT[k] = 0.02 + (Math.abs(SEATX[k] - ORX) + 0.25 * Math.abs(SEATY[k] - ORY)) / FRONT_V;
for (let i = 0; i < 4; i++) {
  const a = CX[SLOT_COL[i]], b = a + 36;
  SLOT_FRONT[i] = 0.02 + Math.min(Math.abs(a - ORX), Math.abs(b - ORX)) / FRONT_V;
}

// ------------------------------------------------------------ palette

const to565 = (c) => (((c >> 19) & 0x1f) << 11) | (((c >> 10) & 0x3f) << 5) | ((c >> 3) & 0x1f);
function mixI(a, b, u) {
  const k = (u * 256) | 0, j = 256 - k;
  const r = (((a >> 16) & 255) * j + ((b >> 16) & 255) * k) >> 8;
  const g = (((a >> 8) & 255) * j + ((b >> 8) & 255) * k) >> 8;
  const bl = ((a & 255) * j + (b & 255) * k) >> 8;
  return (r << 16) | (g << 8) | bl;
}
// day / night pairs
const PAL_DAY = {
  crowd: 0x15161f, hand: 0x8a5a44, shirt: 0x6e1a22,
  g0: 0xc8352e, g1: 0x9c2029, sky0: 0x231a4a, sky1: 0x1a1338,
  d0: 0xf7edd2, d1: 0xf3b21c, shadow: 0x223070,
  tread: 0x4b4c58, nose: 0x7c7d88, rail: 0x9a9ca8, rail1: 0xd8dae2, wall: 0x1b2036,
  flash: 0xffffff, spark: 0xffe9b0,
};
const PAL_NIGHT = {
  crowd: 0x0b0b10, hand: 0x4a3024, shirt: 0x3a0e14,
  g0: 0x5c1620, g1: 0x430f19, sky0: 0x150f2c, sky1: 0x0f0b20,
  d0: 0xeadcb8, d1: 0xe39a22, shadow: 0x14193e,
  tread: 0x24252c, nose: 0x3c3d46, rail: 0x4a4c56, rail1: 0x8a8c96, wall: 0x0c0e18,
  flash: 0xfff4d8, spark: 0xb89a60,
};
const SKIN_DAY = [0xe9b68e, 0xc78a5e, 0x8e5838, 0xf0c8a4], SKIN_NIGHT = [0x8a6450, 0x745038, 0x50301e, 0x8e7058];
const HAIR_DAY = [0x2a1c14, 0x5c3620, 0xd8b35a, 0x161618], HAIR_NIGHT = [0x140e0a, 0x2c1a10, 0x6a5630, 0x0c0c0e];
const P = {};                                   // this frame's colours, RGB565
const SKIN = new Uint16Array(4), HAIR = new Uint16Array(4), FW = new Uint16Array(FW_COLOURS.length);
let palNight = -1;
function palette(n) {
  if (n === palNight) return;
  palNight = n;
  for (const key in PAL_DAY) P[key] = to565(mixI(PAL_DAY[key], PAL_NIGHT[key], n));
  for (let i = 0; i < 4; i++) { SKIN[i] = to565(mixI(SKIN_DAY[i], SKIN_NIGHT[i], n)); HAIR[i] = to565(mixI(HAIR_DAY[i], HAIR_NIGHT[i], n)); }
  FW_COLOURS.forEach((c, i) => { FW[i] = to565(mixI(c, mixI(c, 0, 0.45), n)); });
}

// ------------------------------------------------------------ the ground stunt

let gTone = 0, gPrev = 0, gP = 1;       // tone now, tone before the last change, progress of that change
/** The background stunt's tone at a seat, and how far through its last flip it is. */
function ground(m, k, t) {
  const v = MOTIFS[m].v, q = PHI[m][k] - v * t, fl = Math.floor(q), fq = q - fl;
  gTone = fl & 1; gPrev = gTone ^ 1;
  gP = fq > 0 ? (1 - fq) / v / D : 0;
}

// ------------------------------------------------------------ flourishes

/** Lift of a seat's card in px (Mexican wave or the bounce). */
function liftAt(s, c, r) {
  for (let n = 0; n < 4; n++) {
    const t0 = 12 + 12 * n, u = s - t0;
    if (u < 0 || u > 4) continue;
    if (n === 1 || n === 3) {
      // the bounce: four jumps on the beat, front rows first
      const ph = u * 2 - (ROWS - 1 - r) * 0.035;
      if (ph < 0 || ph >= 4) return 0;
      const f = ph - Math.floor(ph);
      return Math.round(10 * f * (1 - f) * 1.0);          // 0..2.5 px
    }
    const xc = n === 0 ? -24 + u * 52 : W + 24 - u * 52;   // ~0.9 px a frame
    const d = (CX[c] + 2 - xc) / 15;
    if (d <= -1 || d >= 1) return 0;
    const b = 1 - d * d;
    return Math.round(3.4 * b * b);
  }
  return 0;
}

// ------------------------------------------------------------ the frame

let dm0 = 0, sm0 = 0, dm1 = 0, sm1 = 0, side0 = 0, side1 = 0, tone0 = 0, tone1 = 0, fp = 1;
let flipsDigit = false;

export default {
  name: 'Card Stunt',
  blurb: 'A stand of fans holds up the time in coloured cards: a flip ripple through the numerals on every beat, a Mexican wave, a flip front each minute, card fireworks at the hour.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey;
    const night = ctx.night;
    ctx.lcd.backlight(1 - 0.55 * night);
    palette(Math.round(night * 16) / 16);

    const prv = clockFields(new Date(ctx.date.getTime() - 60000));
    const nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm, old = prv.hh + prv.mm, nw = nxt.hh + nxt.mm;
    const inPhase = s < TURN_END, outPhase = s >= OUT_T0;
    const CUR = [0, 1, 2, 3].map((i) => DIGITS[+cur[i]]);
    const chIn = [0, 1, 2, 3].map((i) => inPhase && old[i] !== cur[i]);
    const chOut = [0, 1, 2, 3].map((i) => outPhase && nw[i] !== cur[i]);
    const mo = ((mk % 5) + 5) % 5, mPrev = (mo + 4) % 5;
    const hourShow = prv.h !== f.h && s < 12;
    const show = hourShow ? fireworks(mk, s) : null;

    const buf = g.buf;
    // ---- the crowd between the rows, and the aisles
    for (let y = 0; y < WALL_Y; y++) {
      const row = y * W, gap = (y & 3) === 3;
      const stair = (y & 3) === 0 ? P.nose : P.tread;
      for (let x = 0; x < 4; x++) { buf[row + x] = stair; buf[row + 156 + x] = stair; }
      for (let x = 76; x < 84; x++) buf[row + x] = stair;
      if (gap) {
        for (let x = 4; x < 156; x++) buf[row + x] = (x & 7) === 0 ? P.hand : P.crowd;
      }
    }
    g.cost.px += 19 * 152 + 76 * 16; g.cost.box += 19 * 152;
    // the front wall: a rail with a glint running along it every few seconds, and the wall
    const gx = ((s % 7.5) / 7.5) * 260 - 50;
    for (let x = 0; x < W; x++) {
      const d = x - gx, glint = d > -6 && d < 6 ? (d > -2 && d < 2 ? 2 : 1) : 0;
      buf[WALL_Y * W + x] = glint === 2 ? P.flash : glint === 1 ? P.rail1 : P.rail;
      for (let y = WALL_Y + 1; y < H; y++) buf[y * W + x] = P.wall;
    }
    g.cost.px += 4 * W; g.cost.box += 2 * W;

    // the swell: a slow 1-px wave rolling through the held numerals, left to right
    for (let c = 0; c < COLS; c++) SWELL[c] = sin(TAU * (0.55 * s - (CX[c] + 2) / 72)) > 0.35 ? 1 : 0;

    // ---- the seats, back rows first (a nearer row covers the one behind when it lifts)
    let px = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const k = r * COLS + c;
        // the background stunt at this seat
        let tA, tB, tp;
        if (inPhase && s < TFRONT[k]) { ground(mPrev, k, s + 60); tA = gPrev; tB = gTone; tp = gP; }
        else {
          ground(mo, k, s);
          tA = gPrev; tB = gTone; tp = gP;
          if (inPhase && s - TFRONT[k] < tp * D) {
            // the front's flip is the latest thing this card did
            const nowTone = gTone;
            ground(mPrev, k, TFRONT[k] + 60);
            tA = gTone; tB = nowTone; tp = (s - TFRONT[k]) / D;
          }
        }
        // the hour: the field flips to a night sky (out from the aisle), and back
        let skyA = 0, skyB = 0;
        if (hourShow) {
          const dx = Math.abs(SEATX[k] - ORX) / SKY_V, tOn = SKY_ON + dx, tOff = SKY_OFF + dx;
          skyB = s >= tOn && s < tOff ? 1 : 0; skyA = skyB;
          const te = s >= tOff ? tOff : s >= tOn ? tOn : -9;
          if (s - te < D && s - te < tp * D) { skyA = skyB ^ 1; tA = tB; tp = (s - te) / D; }
        }
        // the hour's fireworks recolour the field
        let fwA = -1, fwB = -1;
        if (show) {
          const e = show.at(k, s);
          if (e) { fwA = e.a; fwB = e.b; tp = e.p; tA = tB; }
        }

        // the numeral at this seat
        flipsDigit = false;
        const i = SLOT[k];
        if (i >= 0) digitSeat(i, k, s, CUR[i], chIn[i], chOut[i], hourShow, tA, tB);
        let p;
        if (flipsDigit) p = fp;
        else { dm0 = sm0 = dm1 = sm1 = 0; tone0 = tA; tone1 = tB; p = tp; }
        // card geometry: squash in mid-flip, lift in a flourish
        const stage = p >= 1 ? 4 : p < 0.2 ? 4 : p < 0.44 ? 2 : p < 0.56 ? 0 : p < 0.8 ? 2 : 4;
        const useNew = p >= 0.5;
        const dm = useNew ? dm1 : dm0, sm = useNew ? sm1 : sm0;
        const dc = (useNew ? side1 : side0) ? P.d1 : P.d0;
        const tone = useNew ? tone1 : tone0;
        let gc = (useNew ? skyB : skyA) ? (tone ? P.sky1 : P.sky0) : tone ? P.g1 : P.g0;
        const fw = useNew ? fwB : fwA;
        if (fw >= 0) gc = FW[fw];
        // the half of a two-colour card that is field shows the field as it is now
        const gNow = fwB >= 0 ? FW[fwB] : skyB ? (tB ? P.sky1 : P.sky0) : (tB ? P.g1 : P.g0);
        // a numeral's card hops as it turns: the fan pushes it up to flip it
        let L = liftAt(s, c, r);
        if (flipsDigit) {
          if (p > 0 && p < 1) { const hp = HOP[(p * 16) | 0]; if (hp > L) L = hp; }
          else if (L === 0) L = SWELL[c];          // between beats the held picture swells, a seat-high wave
        }
        const x0 = CX[c], y0 = r * 4;
        // the fan behind the card: seen in mid-flip, or under a lifted card
        if (stage < 4 || L > 0) {
          const fc = FACE[k], sk = SKIN[fc & 3], hr = HAIR[(fc >> 2) & 3];
          // standing in the wave: arms up either side of the face; a card lifted a
          // little shows the team shirt under it; a turning card shows the face
          const arm = L >= 3 ? sk : P.crowd;
          for (let j = 0; j < 3; j++) {
            const o = (y0 + j) * W + x0;
            if (L > 0 && L < 3 && j >= 3 - L) { buf[o] = buf[o + 1] = buf[o + 2] = buf[o + 3] = P.crowd; continue; }
            buf[o] = arm; buf[o + 3] = arm;
            buf[o + 1] = buf[o + 2] = j === 0 ? hr : j === 2 && L >= 3 ? P.g1 : sk;
          }
          if (L >= 3) { const o = (y0 + 3) * W + x0; buf[o] = buf[o + 1] = buf[o + 2] = buf[o + 3] = P.g1; }
          px += 16;
        }
        if (stage > 0) {
          const ia = (4 - stage) >> 1, ib = ia + stage;
          for (let j = 0; j < 3; j++) {
            const y = y0 + j - L;
            if (y < 0) continue;
            const o = y * W + x0;
            for (let ii = ia; ii < ib; ii++) {
              const bit = 1 << (j * 4 + ii);
              buf[o + ii] = dm & bit ? dc : sm & bit ? P.shadow : (dm | sm) ? gNow : gc;
            }
          }
          px += 3 * stage;
        }
      }
    }
    g.cost.px += px; g.cost.box += NC * 40 + px * 2;

    // ---- the colon: two fans on the aisle steps, flipping first on every beat
    colon(g, s, inPhase, hourShow);
    // ---- phone flashes
    flashes(g, ctx, s, hourShow);
  },
};

/**
 * Work out a seat of a numeral: the card masks and sides before and after
 * its latest flip (dm0/sm0/side0 -> dm1/sm1/side1) and that flip's
 * progress fp. Leaves flipsDigit false if the seat holds field only.
 */
function digitSeat(i, k, s, dig, chIn, chOut, hourShow, tA, tB) {
  const lk = LOCAL[k];
  const fm = dig.face[lk], sh = dig.shadow[lk];
  if (!(fm | sh)) return;
  const dl = DELAY[k];
  if (chIn) {
    // the new numeral: flips up behind the front, ranked
    const tIn = SLOT_FRONT[i] + dig.rank[lk] * REVEAL;
    if (s < tIn) return;                            // still field
    const kb = Math.floor(s - dl), tb = kb + dl;
    flipsDigit = true;
    dm1 = fm; sm1 = sh; tone0 = tone1 = tB;
    if (kb >= 1 && tb >= tIn + D) { side1 = kb & 1; side0 = side1 ^ 1; dm0 = fm; sm0 = sh; fp = (s - tb) / D; }
    else { dm0 = sm0 = 0; side0 = side1 = 0; tone0 = tA; fp = (s - tIn) / D; }
    return;
  }
  flipsDigit = true;
  tone0 = tone1 = tB;
  beat(k, s, dl, hourShow);
  dm0 = dm1 = fm; sm0 = sm1 = sh;
  if (chOut) {
    const tOut = OUT_T0 + dig.rank[lk] * OUT_SPAN;
    if (s >= tOut) {
      if (s >= tOut + D) { flipsDigit = false; return; }
      beat(k, tOut, dl, hourShow);
      side0 = side1;
      dm1 = sm1 = 0; fp = (s - tOut) / D;
    }
  }
}

/** The beat: which side a numeral's card shows, and its latest flip. */
function beat(k, s, dl, hourShow) {
  const u = s - dl;
  if (s < TURN_END && u < 1) {
    // the minute's front replaces the beat at :00
    const tf = TFRONT[k];
    if (s >= tf) { side1 = 0; fp = (s - tf) / D; }
    else { side1 = 1; fp = (s - (dl - 1)) / D; }
  } else if (hourShow && u >= 2 && u < 10) {
    const kb = Math.floor(u * 2);
    side1 = kb & 1; fp = (u - kb / 2) / D;
  } else {
    const kb = Math.floor(u);
    side1 = kb & 1; fp = (u - kb) / D;
  }
  side0 = side1 ^ 1;
}

function colon(g, s, inPhase, hourShow) {
  const buf = g.buf;
  let side, p;
  const u = s - 0.02;
  if (hourShow && u >= 2 && u < 10) { const kb = Math.floor(u * 2); side = kb & 1; p = (u - kb / 2) / D; }
  else { const kb = Math.floor(u); side = kb & 1; p = (u - kb) / D; }
  const stage = p >= 1 ? 6 : p < 0.2 ? 6 : p < 0.44 ? 4 : p < 0.56 ? 0 : p < 0.8 ? 4 : 6;
  const sd = p >= 0.5 ? side : side ^ 1;
  const col = sd ? P.d1 : P.d0;
  const L = liftAt(s, 18, 9);   // the aisle's fans join the wave
  for (const ry of [24, 44]) {
    // the fan: a head under the card
    for (let j = 0; j < 4; j++) {
      const o = (ry + j) * W + 78;
      for (let ii = 0; ii < 4; ii++) buf[o + ii] = j === 0 ? HAIR[1] : j === 3 ? P.shirt : SKIN[0];
    }
    const ia = 77 + ((6 - stage) >> 1);
    for (let j = 0; j < 3; j++) {
      const o = (ry - L + j) * W;
      for (let x = ia; x < ia + stage; x++) buf[o + x] = col;
    }
  }
  g.cost.px += 2 * (16 + 18); g.cost.box += 60;
}

function flashes(g, ctx, s, hourShow) {
  const buf = g.buf, rate = hourShow && s > 1.5 ? 14 : 2.5;
  const T = ctx.date.getTime() / 1000, n1 = Math.floor(T * rate);
  for (let n = n1 - 1; n <= n1; n++) {
    const tn = (n + (hash(n, 5) % 1000) / 1000) / rate, age = T - tn;
    if (age < 0 || age >= 0.05) continue;
    const k = hash(n, 9) % NC, c = k % COLS, r = (k / COLS) | 0;
    const x0 = CX[c], y0 = r * 4;
    for (let j = 0; j < 3; j++) for (let ii = 0; ii < 4; ii++) buf[(y0 + j) * W + x0 + ii] = P.flash;
    if (age < 0.025) {
      if (y0 > 0) { buf[(y0 - 1) * W + x0 + 1] = P.spark; buf[(y0 - 1) * W + x0 + 2] = P.spark; }
      if (y0 + 3 < H) { buf[(y0 + 3) * W + x0 + 1] = P.spark; buf[(y0 + 3) * W + x0 + 2] = P.spark; }
      if (x0 > 0) buf[(y0 + 1) * W + x0 - 1] = P.spark;
      if (x0 + 4 < W) buf[(y0 + 1) * W + x0 + 4] = P.spark;
    }
    g.cost.px += 20; g.cost.box += 20;
  }
}
