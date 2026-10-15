// Phantom — a character LCD pretending to be a segment LCD, ghosts and all.
//
// On a real seven-segment clock you can see the unlit segments: a faint 88:88
// behind the time. This face does that with the free grey. Every third frame,
// the unlit segments are switched on too. The controller updates at 60 fps
// and the glass takes 150 ms to follow, so a dot that is on one frame in three
// never gets above about 40% contrast and settles near a third: a ghost. The
// colon blinks between lit and ghost, and the AM/PM that is not in force
// stays as a ghost, as on the real thing.
//
// The face is laid out like a 12-hour segment display: the first hour digit
// only ever shows 1, so it has only its b and c segments.
//
// Eight tiles, all static, so they are written once in `setup`, as firmware
// would at power-on: a frame is then only the 32 cell codes, 13.6 ms on
// 100 kHz I2C, which is what lets it run at 60 fps. The segments line up with
// cells, so a digit is three cells and a segment is never cut by a gap:
//
//   L      C      R        L: f / e, 3 dots wide, against the cell's right edge
//   ..### #####  ###..     C: a (rows 0-1), g (row 7 + row 0 of the cell below),
//   ..### .....  ###..        d (rows 6-7), in every combination they occur
//   ..### #####  ###..     R: b / c, against the cell's left edge
//
// The grey is the renderer's linear model of the glass. Real liquid crystal
// responds to the RMS drive voltage, which is not linear, so the ghost's
// strength needs setting on the bench: GHOST_EVERY is the knob.

const FPS = 60;
const GHOST_EVERY = 3;            // ghosts are lit on one frame in this many

const ROWS = (lit) => Array.from({ length: 8 }, (_, r) => (lit.includes(r) ? '#####' : '.....'));
const vertical = (cols) => Array.from({ length: 8 }, (_, r) => (r >= 1 && r <= 6 ? cols : '.....'));

const TILES = [
  vertical('..###'),              // 0 VL: f or e
  vertical('###..'),              // 1 VR: b or c
  ROWS([0, 1]),                   // 2 a
  ROWS([7]),                      // 3 g, top half
  ROWS([0, 1, 7]),                // 4 a + g
  ROWS([0]),                      // 5 g, bottom half
  ROWS([6, 7]),                   // 6 d
  ROWS([0, 6, 7]),                // 7 g + d
];
const [VL, VR, A, G, AG, Gb, D, GbD] = TILES.map((_, i) => i);

const SEGMENTS = {
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg',
  5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
};

/** A digit's six cells [row][L, C, R], as codes, blank (0x20) where unlit. */
function cells(segs) {
  const on = (s) => segs.includes(s);
  const top = on('a') && on('g') ? AG : on('a') ? A : on('g') ? G : 0x20;
  const bottom = on('g') && on('d') ? GbD : on('g') ? Gb : on('d') ? D : 0x20;
  return [
    [on('f') ? VL : 0x20, top, on('b') ? VR : 0x20],
    [on('e') ? VL : 0x20, bottom, on('c') ? VR : 0x20],
  ];
}

// Columns on the glass. The half digit (1 or nothing) is just a right column.
const HALF_COL = 1;
const DIGIT_COLS = [2, 6, 9];     // left cell of the hours' ones, then the minutes
const COLON_COL = 5;
const AMPM_COL = 13;

export default {
  name: 'Phantom',
  blurb: 'A 12-hour seven-segment LCD with the unlit segments ghosting behind the time, in a grey the hardware does not have.',
  bus: 'i2c100',
  panel: 'gray',
  fps: FPS,

  setup(lcd) {
    TILES.forEach((tile, slot) => lcd.defineChar(slot, tile));
  },

  frame(lcd, api, { t, fields }) {
    const ghost = Math.round(t * FPS) % GHOST_EVERY === 0;
    const h12 = fields.h % 12 === 0 ? 12 : fields.h % 12;
    const grid = [Array(16).fill(0x20), Array(16).fill(0x20)];

    // On a ghost frame every segment is lit, so the unlit ones show faintly.
    const show = (segs) => (ghost ? SEGMENTS[8] : segs);

    if (ghost || h12 >= 10) { grid[0][HALF_COL] = VR; grid[1][HALF_COL] = VR; }
    const digits = [String(h12 % 10), fields.mm[0], fields.mm[1]];
    digits.forEach((d, k) => {
      cells(show(SEGMENTS[d])).forEach((row, r) => row.forEach((code, i) => {
        grid[r][DIGIT_COLS[k] + i] = code;
      }));
    });

    // The colon is lit for the first half of each second, a ghost for the rest.
    if (ghost || fields.ms < 500) { grid[0][COLON_COL] = 0xa5; grid[1][COLON_COL] = 0xa5; }

    // The annunciator in force is lit; the other is only there on ghost frames.
    const pm = fields.h >= 12;
    if (ghost || !pm) grid[0].splice(AMPM_COL, 2, 0x41, 0x4d);   // AM
    if (ghost || pm) grid[1].splice(AMPM_COL, 2, 0x50, 0x4d);    // PM

    grid.forEach((codes, row) => { lcd.setCursor(0, row); codes.forEach((c) => lcd.data(c)); });
  },
};
