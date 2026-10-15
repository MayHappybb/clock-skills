// Claude — the spark, thinking, with the time in a prompt.
//
//   ✺✺✺ > 10:09:42_
//   ✺✺✺ ✻ Pondering…
//
// The left three cells are a 15x16 canvas holding the Claude spark, measured
// off the symbol: twelve tapered rays at its uneven angles and lengths round
// a small solid centre. The first version was drawn from memory, twelve thin
// rays evenly spaced with a gap round a dot, and read as a snowflake or an
// asterisk; the irregular spacing, the solid centre and rays that widen to
// the tip are what make it the mark. While it "thinks", a gentle wave runs
// round it, trimming each ray by a dot in turn (rotating it instead
// re-aliases every ray against the dot grid each frame, a shimmer). Beside it, the CLI's own status line: the spinner that blooms and
// folds, · ✢ ✳ ✶ ✻ ✽ and back, and a whimsical verb that changes every ten
// seconds.
//
// When the minute turns, the job is done: the spark pulls in to its core and
// bursts back out past full size, the spinner stops on ✻, and the line says
// what it did ("✻ Pondered") for three seconds before starting again.
//
// The spark is drawn in millimetres at the real dot centres. Six tiles; the
// spinner and the single-cell ellipsis take the other two.

import { noise, clamp, ease } from '../js/kit.js';
import { MODULE } from '../js/panel.js';

const FPS = 10;
const mmX = (c) => Math.floor(c / 5) * MODULE.charPitchX + (c % 5) * MODULE.dotPitchX;
const mmY = (r) => Math.floor(r / 8) * MODULE.charPitchY + (r % 8) * MODULE.dotPitchY;

// The spark, measured off the Claude symbol (Wikimedia Commons, "Claude AI
// symbol.svg"): twelve rays at uneven angles (degrees clockwise from up)
// and of uneven length (as a fraction of the longest), round a small solid
// centre. The spacing is part of the likeness: 82 and 104 nearly pair up,
// 134 and 150 too, and the lower left fans out.
const RAYS = [[8, 0.870], [41, 0.900], [82, 0.889], [104, 0.917], [134, 0.942], [150, 0.919],
  [185, 0.951], [214, 0.956], [236, 0.914], [270, 0.951], [301, 0.949], [332, 1.000]];
const R = 5.5;                               // mm, the longest ray; the glass is 10.85 mm tall
const HUB = 1.5, ROOT = 0.5, TIP = 0.95;     // mm: centre radius, ray width at the root and tip
const CENTRE = { x: mmX(7), y: mmY(7) };     // a real dot, so the near-vertical rays have a column
const DOTS = [];
for (let r = 0; r < 16; r++) for (let c = 0; c < 15; c++) DOTS.push({ r, c, x: mmX(c) - CENTRE.x, y: mmY(r) - CENTRE.y });

/**
 * The spark as 16 rows of 15, ray `i` scaled by `lens[i]`. Each ray is a
 * tapered bar with a round tip, widening from root to tip as the symbol's
 * do. On top of that, the dot nearest each point along every ray's centre
 * line is lit, so a ray crossing a cell gap is never broken by it.
 */
function spark(lens, hub = 1) {
  const on = new Set();
  for (const d of DOTS) {
    if (Math.hypot(d.x, d.y) <= HUB * hub) on.add(d.r * 15 + d.c);
    RAYS.forEach(([deg, len], i) => {
      const a = (deg * Math.PI) / 180, ux = Math.sin(a), uy = -Math.cos(a);
      const L = len * R * lens[i], s = d.x * ux + d.y * uy, p = Math.abs(d.y * ux - d.x * uy);
      const w = ROOT + (TIP - ROOT) * clamp(s / L, 0, 1);
      if ((s >= 0 && s <= L - w / 2 && p <= w / 2) || Math.hypot(s - (L - w / 2), p) <= w / 2) on.add(d.r * 15 + d.c);
    });
  }
  RAYS.forEach(([deg, len], i) => {
    const a = (deg * Math.PI) / 180, L = len * R * lens[i] - TIP / 2;
    for (let s = 0; s <= L; s += 0.1) {
      const x = Math.sin(a) * s, y = -Math.cos(a) * s;
      let best = null, bd = Infinity;
      for (const d of DOTS) { const dd = (d.x - x) ** 2 + (d.y - y) ** 2; if (dd < bd) { bd = dd; best = d; } }
      if (bd < 0.25) on.add(best.r * 15 + best.c);
    }
  });
  return Array.from({ length: 16 }, (_, r) => Array.from({ length: 15 }, (_, c) => (on.has(r * 15 + c) ? '#' : '.')).join(''));
}

// The CLI spinner, 5x7 in a 5x8 cell: · ✢ ✳ ✶ ✻ ✽, played forward then back.
const SPIN = [
  ['.....', '.....', '.....', '..#..', '.....', '.....', '.....', '.....'],
  ['.....', '.....', '..#..', '.###.', '..#..', '.....', '.....', '.....'],
  ['.....', '.#.#.', '..#..', '#####', '..#..', '.#.#.', '.....', '.....'],
  ['.....', '#.#.#', '.###.', '##.##', '.###.', '#.#.#', '.....', '.....'],
  ['.....', '..#..', '#.#.#', '.###.', '#.#.#', '..#..', '.....', '.....'],
  ['.....', '.#.#.', '#####', '.###.', '#####', '.#.#.', '.....', '.....'],
];
const SPIN_ORDER = [0, 1, 2, 3, 4, 5, 4, 3, 2, 1];
const SPIN_STEP = 0.2;                       // each glyph holds two frames
const DONE = SPIN[4];                        // ✻, where Claude Code stops
const ELLIPSIS = ['.....', '.....', '.....', '.....', '.....', '.....', '#.#.#', '.....'];

const VERBS = [
  ['Pondering', 'Pondered'], ['Thinking', 'Thought'], ['Musing', 'Mused'], ['Brewing', 'Brewed'],
  ['Clauding', 'Clauded'], ['Noodling', 'Noodled'], ['Simmering', 'Simmered'], ['Mulling', 'Mulled'],
  ['Moseying', 'Moseyed'], ['Vibing', 'Vibed'], ['Conjuring', 'Conjured'], ['Honking', 'Honked'],
  ['Wrangling', 'Wrangled'], ['Tinkering', 'Tinkered'], ['Puttering', 'Puttered'], ['Smooshing', 'Smooshed'],
  ['Herding', 'Herded'], ['Hatching', 'Hatched'], ['Forging', 'Forged'], ['Baking', 'Baked'],
  ['Churning', 'Churned'], ['Finagling', 'Finagled'], ['Spinning', 'Spun'], ['Whisking', 'Whisked'],
];
const verbAt = (minuteKey, slot) => VERBS[Math.floor(noise(minuteKey * 7 + slot, 31) * VERBS.length)];

const DONE_FOR = 3;                          // seconds the "done" line stays up
const BURST = { in: 0.3, out: 0.7, settle: 0.4 };

export default {
  name: 'Claude',
  blurb: 'The Claude spark thinking in waves beside the CLI spinner and a whimsical verb; at each minute it bursts and says what it did.',
  bus: 'i2c100',
  panel: 'amber',
  fps: FPS,

  frame(lcd, api, { t, fields, date }) {
    const sec = fields.s + fields.ms / 1000;
    const key = Math.floor(date.getTime() / 60000);
    const T = date.getTime() / 1000;

    // The spark's ray lengths. Thinking: a wave runs round clockwise once
    // every 2.4 s. Done: in to the core, out past full size, settle.
    let lens;
    const b = sec;
    if (b < BURST.in + BURST.out + BURST.settle) {
      let k;
      if (b < BURST.in) k = 1 - 0.85 * (b / BURST.in);
      else if (b < BURST.in + BURST.out) k = 0.15 + 1.0 * ease.outBack((b - BURST.in) / BURST.out);
      else k = 1.15 - 0.15 * ((b - BURST.in - BURST.out) / BURST.settle);
      lens = RAYS.map(() => clamp(k, 0, 1.15));
    } else {
      // A gentle wave round the rays, clockwise, once every 2.4 s. It only
      // ever trims a ray by a dot or so, so the silhouette stays the mark's.
      const ph = (2 * Math.PI * T) / 2.4;
      lens = RAYS.map(([deg]) => 0.96 + 0.12 * (0.5 + 0.5 * Math.cos(ph - (deg * Math.PI) / 180)));
    }
    const art = spark(lens, clamp(Math.min(...lens) / 0.95, 0.5, 1));
    for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
      lcd.defineChar(row * 3 + col, art.slice(row * 8, row * 8 + 8).map((l) => l.slice(col * 5, col * 5 + 5)));
    }

    const done = sec < DONE_FOR;
    lcd.defineChar(6, done ? DONE : SPIN[SPIN_ORDER[Math.floor(T / SPIN_STEP) % SPIN_ORDER.length]]);
    lcd.defineChar(7, ELLIPSIS);

    const top = Array(16).fill(0x20), bottom = Array(16).fill(0x20);
    for (let col = 0; col < 3; col++) { top[col] = col; bottom[col] = 3 + col; }
    const put = (arr, col, text) => [...text].forEach((ch, i) => { arr[col + i] = ch.charCodeAt(0); });

    // The prompt: the time typed in, and a cursor blinking after it.
    put(top, 4, `> ${fields.hh}:${fields.mm}:${fields.ss}`);
    if (fields.ms < 500) top[14] = 0x5f;

    bottom[4] = 6;
    if (done) {
      put(bottom, 6, verbAt(key - 1, 5)[1]);             // what the last minute was spent doing
    } else {
      const [verb] = verbAt(key, Math.floor((sec - DONE_FOR) / 10));
      put(bottom, 6, verb);
      bottom[6 + verb.length] = 7;
    }

    lcd.setCursor(0, 0); top.forEach((c) => lcd.data(c));
    lcd.setCursor(0, 1); bottom.forEach((c) => lcd.data(c));
  },
};
