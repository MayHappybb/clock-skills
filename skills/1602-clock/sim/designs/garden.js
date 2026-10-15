// Garden — a tulip whose growth is the time of day, under a sun that is
// the hour hand.
//
//   [tulip]  .  *   (     the sky: the sun by day, the moon and stars by night
//   [ pot ]  10:09 BLOOM  the time, and what the plant is doing
//
// The left three cells are a 15x16 canvas (six tiles) holding a tulip in a
// pot. Its life is one day long, worked out from the clock alone:
//
//   00:00  a seed on the soil          12:00  a tulip; a bee visits
//   01:00  it sprouts                  14:00  it opens wide
//   02:00  two blades rise either      17:00  it nods, and from 17:30 drops
//          side of the stem                   a petal an hour
//   08:00  a bud forms and swells      20:30  a seed head forms, a dandelion
//   10:30  the bud opens                      clock of eight seeds
//   22:00  the seeds blow away one at a time, out over the sky
//   23:00  the plant goes back into the soil; at 23:59 a seed drifts down
//
// Something has visibly grown every few minutes, and it is alive between:
// the tulip leans and the blade tips lift in the breeze (each pose held
// 0.6 s), the bee loops round the flower and lands on it, petals and seeds
// fall and fly. The sun rises on the left of the sky at 06:00, is highest at
// noon and sets on the right at 18:00, a dot every ten minutes; the moon does
// the same by night. It is a sprite (`Stage`), one tile or two when it
// straddles cells, so with the canvas the frame never needs more than eight.
// Stars, birds (v and ^, which flap because they sit at different heights),
// the seeds once they leave the canvas, and the text are all ROM.
//
// Tried and dropped: a daisy drawn in mm, as `frog` is. At this size its
// petals sit exactly where the gaps between cells are, so it read as a box.
// The head now always fits in the middle cell, which no gap crosses, and the
// tulip, a cup with three tips, is the flower that shape suits. Leaves made
// of one-dot diagonals looked like noise; tulip blades rising from the soil
// read. Petals falling straight down vanished into the stem, so they drift
// out past the blades first. With the horizon at the bottom of the top row
// the setting sun sat on the text, so it is two rows higher. The bee moving
// every 200 ms never reached full contrast; it steps every 300 ms, and only
// its wings flicker every frame, on purpose, as a blur.

import { Stage, noise, smoothNoise, clamp } from '../js/kit.js';

const FPS = 10;
const CW = 15, CH = 16;                    // the canvas: cells 0-2, both rows

// ------------------------------------------------------------- the plant

const POT = [[12, 1, 13], [13, 2, 12], [14, 2, 12], [15, 3, 11]];   // [row, from, to]
const BASE = 11;                           // the soil: the stem rises from here
const STEM_COL = 7;                        // middle dot of the middle cell
const FULL = 7;                            // stem height, rows, when grown
const HEAD_BOTTOM = BASE - FULL + 1;       // the head sits on the stem's top dot
// Two blades rise from the soil either side of the stem, as a tulip's do,
// listed base first in the order they grow. The first two dots of each are
// the seed leaves at 02:00. The top two lean outward in a gust.
const BLADES = [
  { side: -1, t0: 2.0, t1: 6.0, dots: [[10, 6], [9, 5], [9, 6], [8, 5], [8, 4], [7, 4], [7, 3], [6, 3], [5, 2]] },
  { side: 1, t0: 2.0, t1: 7.0, dots: [[10, 8], [9, 9], [9, 8], [8, 9], [8, 10], [7, 10], [7, 11], [6, 11]] },
];

// The head, always inside the middle cell so no gap ever cuts it. Bottom row
// sits on the top of the stem.
const HEADS = {
  bud0: ['..#..', '.###.'],
  bud1: ['..#..', '.###.', '.###.'],
  bud2: ['..#..', '.###.', '.###.', '#.#.#'],
  open: ['.#.#.', '.###.', '#####', '.###.'],
  tulip: ['#.#.#', '#####', '#####', '#####', '.###.'],
  leanL: ['#.#..', '####.', '#####', '.####', '..##.'],
  leanR: ['..#.#', '.####', '#####', '####.', '.##..'],
  wide: ['#...#', '##.##', '#####', '#####', '.###.'],
  drop1: ['..#.#', '..###', '..###', '.####', '.###.'],
  drop2: ['..#..', '..#..', '.###.', '.###.', '.###.'],
  pod: ['.###.', '.###.', '.###.', '..#..'],
};
// The seed head: a dandelion clock, eight seeds round a centre.
const PUFF = [[0, 1], [0, 3], [1, 0], [1, 4], [3, 0], [3, 4], [4, 1], [4, 3]];   // [row, col] in a 5x5
const PUFF_TOP = HEAD_BOTTOM - 4;
const SEEDS = PUFF.length;
// Three petals fall in the evening: left, right, then the middle one.
// Each drifts out past the blades first, so it falls through clear air.
const PETALS = [
  { at: 17.5, from: [2, 4], out: 1 },
  { at: 18.5, from: [2, 10], out: 13 },
  { at: 19.5, from: [1, 10], out: 12 },
];
const FALL = 0.4;                          // seconds per row as a petal falls

const lerp = (a, b, u) => a + (b - a) * clamp(u, 0, 1);
const phaseOf = (H, t0, t1) => clamp((H - t0) / (t1 - t0), 0, 1);
const seedLeave = (k) => 22 + (k + 0.5) / SEEDS;

/** Stem height in rows at hour H. */
function stemHeight(H) {
  if (H < 1) return 0;
  if (H < 3) return Math.round(lerp(0, 2, (H - 1) / 2));
  if (H < 23) return Math.round(lerp(2, FULL, (H - 3) / 5));
  return Math.round(lerp(FULL, 0, H - 23));
}

/** Which head the plant has at hour H, given the breeze. */
function headAt(H, sway) {
  if (H < 8 || H >= 23) return null;
  if (H < 9) return 'bud0';
  if (H < 9.8) return 'bud1';
  if (H < 10.5) return 'bud2';
  if (H < 11.2) return 'open';
  if (H < 14) return sway < 0 ? 'leanL' : sway > 0 ? 'leanR' : 'tulip';
  if (H < 17) return 'wide';
  if (H < 17.5) return 'leanR';             // it nods
  if (H < 18.5) return 'drop1';
  if (H < 19.5) return 'drop2';
  if (H < 20.5) return 'pod';
  return 'puff';
}

/** What the plant is called at hour H, for the label. */
function stage(H) {
  if (H < 1) return 'SEED';
  if (H < 3) return 'SPROUT';
  if (H < 8) return 'LEAFY';
  if (H < 10.5) return 'BUD';
  if (H < 12) return 'OPEN';
  if (H < 17) return 'BLOOM';
  if (H < 20.5) return 'WILT';
  if (H < 23) return 'SEEDS';
  return 'REST';
}

function plant(H, T, sec) {
  const px = Array.from({ length: CH }, () => Array(CW).fill(false));
  const set = (r, c, v = true) => { if (r >= 0 && r < CH && c >= 0 && c < CW) px[r][c] = v; };
  for (const [r, a, b] of POT) for (let c = a; c <= b; c++) set(r, c);

  // The breeze: -1, 0 or 1, each held 0.6 s. The tulip leans with it and
  // the leaf tips lift.
  const gust = smoothNoise((Math.floor(T / 0.6) * 0.6) / 3.5, 4);
  const sway = gust < 0.3 ? -1 : gust > 0.7 ? 1 : 0;

  const height = stemHeight(H);
  if (H < 1.1) { set(BASE, 6); set(BASE, 7); set(BASE, 8); set(BASE - 1, 7); }   // the seed
  for (let i = 0; i < height; i++) set(BASE - i, STEM_COL);

  // The blades grow a dot at a time, and shrink again before the stem goes.
  const wither = 1 - phaseOf(H, 22.5, 23.3);
  for (const b of BLADES) {
    const n = Math.round(b.dots.length * phaseOf(H, b.t0, b.t1) * wither);
    b.dots.slice(0, n).forEach(([r, c], k) => {
      const lean = sway === b.side && k >= b.dots.length - 2 ? b.side : 0;
      set(r, c + lean);
    });
  }

  // The head.
  const head = height >= FULL ? headAt(H, sway) : null;
  if (head === 'puff') {
    set(PUFF_TOP + 2, STEM_COL);
    for (let r = PUFF_TOP + 3; r < HEAD_BOTTOM; r++) set(r, STEM_COL);
    const grown = phaseOf(H, 20.5, 21);
    PUFF.forEach(([r, c], k) => {
      if (H >= seedLeave(k)) {
        // Blown off: it flies out of the right of the canvas, a dot every 0.2 s.
        const since = (H - seedLeave(k)) * 3600;
        const x = 5 + c + Math.floor(since / 0.2), y = PUFF_TOP + r - Math.floor(since / 0.6);
        if (x < CW) set(y, x);
        return;
      }
      // While the puff forms, the seeds fill in from the inside out.
      if (grown >= (k + 1) / SEEDS) set(PUFF_TOP + r, 5 + c);
    });
  } else if (head) {
    const art = HEADS[head];
    art.forEach((line, k) => [...line].forEach((ch, i) => {
      if (ch === '#') set(HEAD_BOTTOM - art.length + 1 + k, 5 + i);
    }));
  }

  // Petals fall in the evening and lie on the soil until the plant has gone.
  if (H >= 17.5 && H < 23.5) {
    for (const p of PETALS) {
      const t = (H - p.at) * 3600;
      if (t < 0) continue;
      const [r0, c0] = p.from, rows = BASE - r0;
      if (t < rows * FALL) {
        // Falling, a row at a time: out to the side, then rocking down.
        const k = Math.floor(t / FALL);
        const inward = p.out < STEM_COL ? 1 : -1;
        const c = Math.round(c0 + (p.out - c0) * Math.min(1, k / 3)) + (k > 3 && k % 2 ? inward : 0);
        set(r0 + k - 1, c); set(r0 + k, c);
      } else set(BASE, p.out);
    }
  }

  // At 23:59 the last seed drifts down into the pot.
  if (H >= 23 + 59 / 60 && sec >= 50) {
    const u = (sec - 50) / 9.5;
    set(Math.min(BASE, Math.floor(u * BASE)), 7 + (Math.floor(sec / 0.9) % 3) - 1);
  }
  return { px, sway };
}

/** A bee for the hours the flower is open: it flies round it and settles. */
function bee(px, H, T, frame) {
  if (H < 12 || H >= 17) return;
  const cyc = T % 20;
  const set = (r, c) => { if (r >= 0 && r < CH && c >= 0 && c < CW) px[r][c] = true; };
  let r, c;
  if (cyc >= 11 && cyc < 16) {                                     // on the flower, wings folded
    px[0][6] = px[0][7] = true;
    return;
  }
  else {
    // A loop round the flower, a dot or so every 0.3 s: slow enough that
    // the glass shows the bee at full contrast at each stop.
    const q = Math.floor(T / 0.3) * 0.3;
    r = Math.round(4 + 3 * Math.sin(q * 0.55));
    c = Math.round(7 + 6 * Math.sin(q * 0.4 + 1));
  }
  r = clamp(r, 1, 9); c = clamp(c, 0, CW - 2);
  set(r, c); set(r, c + 1);
  if (frame % 2) { set(r - 1, c); set(r - 1, c + 1); }            // the wings, a blur
}

// --------------------------------------------------------------- the sky

const SKY = { from: 3, to: 15 };           // top-row cells
const SUN = [
  ['#...#', '.###.', '.###.', '.###.', '#...#'],
  ['..#..', '.###.', '#####', '.###.', '..#..'],
];
const MOON = ['.##..', '##...', '##...', '##...', '.##..'];
// The sun and moon are clipped below this dot row of the top line, so a
// sunset leaves two dark rows above the text instead of sitting on it.
const HORIZON = 5;

/** Sun (or moon) position: glass column of its left edge, dot row of its top. */
function skyBody(H) {
  const day = H >= 6 && H < 18;
  const u = ((H - (day ? 6 : 18) + 24) % 24) / 12;
  const x = Math.round(SKY.from * 6 + u * ((SKY.to - SKY.from) * 6));
  const y = Math.round(HORIZON - HORIZON * Math.sin(Math.PI * u));
  return { day, x, y };
}

// ---------------------------------------------------------------- design

export default {
  name: 'Garden',
  blurb: 'A flower that sprouts at midnight, blooms by noon and goes to seed at night, under a sun that is the hour hand.',
  bus: 'i2c100',
  panel: 'green',
  fps: FPS,

  frame(lcd, api, { t, fields, date }) {
    const sec = fields.s + fields.ms / 1000;
    const H = fields.h + fields.m / 60 + sec / 3600;
    const T = date.getTime() / 1000;
    const frame = Math.round(t * FPS);

    const { px } = plant(H, T, sec);
    bee(px, H, T, frame);

    const st = new Stage(lcd);
    for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
      const tile = px.slice(row * 8, row * 8 + 8).map((l) => l.slice(col * 5, col * 5 + 5).map((v) => (v ? '#' : '.')).join(''));
      st.put(col, row, tile.every((l) => l === '.....') ? 0x20 : tile);
    }

    // The sun or moon, clipped at the horizon.
    const body = skyBody(H);
    const art = body.day ? SUN[Math.floor(T / 0.6) % 2] : MOON;
    const bodyCells = new Set([Math.floor(body.x / 6), Math.floor((body.x + 4) / 6)]);
    art.forEach((line, r) => [...line].forEach((ch, i) => {
      if (ch === '#' && body.y + r <= HORIZON) st.dot(body.x + i, body.y + r);
    }));
    const free = (c) => c >= SKY.from && c <= SKY.to && !bodyCells.has(c);

    // Stars by night, twinkling.
    if (H >= 19 || H < 5) {
      for (const c of [4, 6, 9, 11, 13, 15]) {
        const tw = smoothNoise(T / 2.5 + c * 1.7, 6);
        if (free(c) && tw > 0.35) st.put(c, 0, tw > 0.8 ? 0x2a : 0x2e);
      }
    }
    // A bird now and then by day, flapping: v and ^ sit at different heights.
    if (H >= 7 && H < 17) {
      const k = Math.floor(T / 37), at = T - k * 37;
      if (noise(k, 12) > 0.4 && at < 13 * 0.35) {
        const step = Math.floor(at / 0.35), c = SKY.to - step;
        if (free(c)) st.put(c, 0, step % 2 ? 0x5e : 0x76);
      }
    }
    // Seeds blown off the puff drift out over the sky, once they have left
    // the canvas (about two seconds).
    if (H >= 22 && H < 23.1) {
      for (let k = 0; k < SEEDS; k++) {
        const since = (H - seedLeave(k)) * 3600 - 2;
        const c = SKY.from + Math.floor(since / 0.4);
        if (since >= 0 && c <= SKY.to && free(c)) st.put(c, 0, 0x27);
      }
    }

    // The time and the plant's stage, under the horizon.
    st.text(4, 1, `${fields.hh}${fields.ms < 500 ? ':' : ' '}${fields.mm}`);
    const label = stage(H);
    st.text(16 - label.length, 1, label);

    st.draw();
  },
};
