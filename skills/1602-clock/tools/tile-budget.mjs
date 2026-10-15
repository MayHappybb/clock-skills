// Does a multi-cell face actually fit in CGRAM?
//
// A frame can hold eight distinct 5x8 tiles and no more, and every tile it
// needs must be resident at once. A face that draws each digit as its own
// bitmap blows that budget immediately; a face built from shared pieces might
// not. This tool answers the question by construction: give it a way to render
// each digit, and it enumerates every time of day and reports how many distinct
// tiles the worst frame needs.
//
//   node tools/tile-budget.mjs [--cellW 2 --cellH 2]      a seven-segment face
//   node tools/tile-budget.mjs --design slab              a real design
//   node tools/tile-budget.mjs --design all               every registered design
//
// The first form answers the question for one particular face: seven
// segments scaled to the box. Its verdict is about that face, not about the
// geometry -- a face built from parts that line up with cell boundaries can
// put four 15x16 digits on screen with four tiles (see sim/designs/slab.js).
//
// The second form runs an actual design across every minute of the day, at
// several instants in each (including the first half-second, where
// transitions live), and reports CGRAM slots in use, trap-#1 hazards and the
// worst frame cost. That is the check that matters before shipping a design.

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? Number(argv[i + 1]) : dflt;
};

const designAt = argv.indexOf('--design');
if (designAt >= 0) {
  const name = argv[designAt + 1];
  if (name === 'all') {
    // Every registered design: what to run after touching shared code.
    const { DESIGNS } = await import('../sim/js/player.js');
    for (const key of Object.keys(DESIGNS)) await sweepDesign(key);
  } else await sweepDesign(name);
  process.exit(process.exitCode ?? 0);
}

async function sweepDesign(name) {
  const { buildFrame } = await import('../sim/js/player.js');
  const { BUSES } = await import('../sim/js/hd44780.js');
  const instants = [[0, 0], [0, 0.05], [0, 0.1], [0, 0.15], [0, 0.2], [0, 0.3], [0, 0.45], [0, 0.6], [0, 0.8], [30, 0], [59, 0.5]];
  const pad = (n) => String(n).padStart(2, '0');
  const { DESIGNS } = await import('../sim/js/player.js');
  const romFree = DESIGNS[name]?.romFree === true;
  let rom = { n: 0, at: '' };
  let slots = { n: 0, at: 'never' }, cost = { us: 0, at: '' }, bus = '';
  const hazards = [];
  let errors = 0;

  for (let m = 0; m < 1440; m++) {
    for (const [s, t] of instants) {
      const clock = `${pad(Math.floor(m / 60))}:${pad(m % 60)}:${pad(s)}`;
      const at = `${clock} +${t}s`;
      let lcd, report;
      try {
        ({ lcd, report } = buildFrame(name, { clock, t }));
      } catch (err) {
        if (errors++ < 3) console.log(`  ${at}: frame threw: ${err.message}`);
        continue;
      }
      bus = report.bus;
      const shown = new Set();
      for (let row = 0; row < lcd.rows; row++)
        for (let c = 0; c < lcd.cols; c++) {
          const code = lcd.codeAt(c, row);
          if (code < 0x10) shown.add(code & 7);
          else if (romFree && !rom.n++) rom.at = `${at}, cell ${c},${row} = 0x${code.toString(16)}`;
        }
      if (shown.size > slots.n) slots = { n: shown.size, at };
      if (report.totalUs > cost.us) cost = { us: report.totalUs, at, bytes: report.bytes, execUs: report.execUs };
      if (report.hazards.length && hazards.length < 5) hazards.push(`${at} (slot ${report.hazards.join(', ')})`);
    }
  }

  const ms = cost.us / 1000;
  console.log(`${name}: ${1440 * instants.length} frames over every minute of the day`);
  console.log(`  CGRAM slots on screen, worst : ${slots.n} of 8  (at ${slots.at})`);
  console.log(`  frame cost, worst            : ${ms.toFixed(2)} ms on ${bus} (at ${cost.at}) -> ${(1000 / ms).toFixed(0)} fps max`);
  for (const [k, b] of Object.entries(BUSES)) {
    if (b.label === bus) continue;
    // The worst frame on another bus: each byte costs the longer of its wire
    // time and its execution time, so the frame costs at least both totals.
    // Exact for wire-bound buses (I2C), where only clear and home execute
    // longer than a byte takes to send.
    if (k.startsWith('i2c')) console.log(`  ...on ${b.label.padEnd(28)}: ~${(Math.max(cost.bytes * b.perByteUs, cost.execUs) / 1000).toFixed(1)} ms`);
  }
  if (hazards.length) {
    console.log('  TRAP #1: a slot was rewritten after a cell showing it was drawn:');
    hazards.forEach((h) => console.log(`    ${h}`));
    process.exitCode = 1;
  } else console.log('  no slot rewritten under a cell already drawn (trap #1): ok');
  if (romFree) {
    if (rom.n) { console.log(`  ROM-FREE broken: ${rom.n} cells showed factory characters, first at ${rom.at}`); process.exitCode = 1; }
    else console.log('  no factory character on screen (romFree): ok');
  }
  if (errors) { console.log(`  ${errors} frames threw`); process.exitCode = 1; }
}

const CELL_W = arg('cellW', 2); // character cells per digit, horizontally
const CELL_H = arg('cellH', 2);
const W = CELL_W * 5;
const H = CELL_H * 8;

const blank = () => Array.from({ length: H }, () => new Array(W).fill('.'));
const paint = (g, r0, r1, c0, c1) => {
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (g[r] && g[r][c] !== undefined) g[r][c] = '#';
};

/**
 * Seven-segment face scaled to the digit box. Segments are sized so the strokes
 * stay proportional as the box grows, which is the shape most big-digit LCD
 * clocks use.
 */
function sevenSeg(segments) {
  const g = blank();
  const t = Math.max(1, Math.round(H / 8)); // stroke thickness in dots
  const w = Math.max(1, Math.round(W / 5));
  const mid = Math.round(H / 2);
  const S = {
    A: [0, t - 1, w, W - w - 1],
    F: [t, mid - t - 1, 0, w - 1],
    B: [t, mid - t - 1, W - w, W - 1],
    G: [mid - Math.floor(t / 2), mid + Math.floor(t / 2) - (t % 2 ? 0 : 1), w, W - w - 1],
    E: [mid + Math.ceil(t / 2), H - t - 1, 0, w - 1],
    C: [mid + Math.ceil(t / 2), H - t - 1, W - w, W - 1],
    D: [H - t, H - 1, w, W - w - 1],
  };
  for (const s of segments) paint(g, ...S[s]);
  return g;
}

const SEGMENTS = {
  0: 'ABCDEF', 1: 'BC', 2: 'ABGED', 3: 'ABGCD', 4: 'FGBC',
  5: 'AFGCD', 6: 'AFGECD', 7: 'ABC', 8: 'ABCDEFG', 9: 'ABCDFG',
};

const DIGITS = Object.fromEntries(
  Object.entries(SEGMENTS).map(([d, segs]) => [d, sevenSeg([...segs])]),
);

/** The tiles a digit occupies, in reading order. */
function quadrants(g) {
  const out = [];
  for (let cy = 0; cy < CELL_H; cy++) {
    for (let cx = 0; cx < CELL_W; cx++) {
      const rows = [];
      for (let r = 0; r < 8; r++) rows.push(g[cy * 8 + r].slice(cx * 5, cx * 5 + 5).join(''));
      out.push(rows.join('/'));
    }
  }
  return out;
}

const TILES = Object.fromEntries(Object.entries(DIGITS).map(([d, g]) => [d, quadrants(g)]));
const PALETTE = new Set(Object.values(TILES).flat());

// --show HH:MM : print that time's four digits as dot art, and name the tiles.
const showAt = argv.indexOf('--show');
if (showAt >= 0) {
  const time = argv[showAt + 1] ?? '02:30';
  const [hs, ms] = time.split(':');
  const glyphs = [...`${hs}${ms}`].map((d) => DIGITS[d]);
  const used = new Map();
  for (const d of `${hs}${ms}`) for (const t of TILES[d]) if (!used.has(t)) used.set(t, used.size);

  for (let r = 0; r < H; r++) {
    console.log(glyphs.map((g) => g[r].join('')).join('  '));
    if (r === 7) console.log(); // the character-row boundary
  }
  console.log();
  console.log(`${time} needs ${used.size} distinct tiles ` +
    `(${new Set([...`${hs}${ms}`].flatMap((d) => TILES[d])).size} counting the colon's cell separately)`);
  console.log(used.size <= 8 ? 'fits' : `OVER by ${used.size - 8} -- the controller holds eight`);
  process.exit(0);
}

let worst = { n: 0, at: null };
let over = 0;
const histogram = new Map();

for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m++) {
    const text = `${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}`;
    const used = new Set();
    for (const ch of text) for (const t of TILES[ch]) used.add(t);
    const n = used.size;
    histogram.set(n, (histogram.get(n) ?? 0) + 1);
    if (n > 8) over++;
    if (n > worst.n) worst = { n, at: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
  }
}

console.log(`${CELL_W}x${CELL_H}-cell digits (${W}x${H} dots), seven-segment face`);
console.log(`palette across all ten digits : ${PALETTE.size} distinct tiles`);
console.log(`tiles needed, worst time      : ${worst.n}  (at ${worst.at})`);
console.log(`times exceeding the 8 limit   : ${over} of 1440`);
console.log('distribution:');
for (const n of [...histogram.keys()].sort((a, b) => a - b)) {
  console.log(`  ${String(n).padStart(2)} tiles : ${String(histogram.get(n)).padStart(4)} times`);
}