// Calibrate — a test card for checking the simulator against a real module.
//
// The simulator models the glass as a linear first-order lag (150 ms 10-90%).
// Real liquid crystal is threshold-like and set by the contrast pot, so any
// design that relies on greys or flicker should be checked on the bench. Run
// this on the module, look at it (or film it in slow motion), and compare it
// with `node tools/render.mjs calibrate --scale 12 --crop view --style clean`.
//
//   top row, left to right: eight patches, a blank cell between each
//     1     solid in every frame (ROM 0xff): full contrast, the reference
//     3/4   solid in 3 frames of 4
//     2/3   solid in 2 of 3
//     1/2   solid in alternate frames
//     1/3   solid in 1 of 3
//     1/4   solid in 1 of 4
//     1/2c  a checkerboard and its complement in alternate frames: the same
//           average as 1/2, but every frame lights half the dots, so the
//           flicker should cancel at a distance
//     1/2s  a static checkerboard: half the dots, no flicker, for comparison
//
//   bottom row: the cell's ROM block switched on and off (costs no CGRAM)
//     cell 0   every 1 s      the step response: watch the rise and the fall
//     cell 2   every 0.5 s
//     cell 4   every 250 ms
//     cell 6   every 125 ms   (3 frames)
//     cell 8   every frame    (24 per second: should be a steady grey)
//     cell 10  always on      reference
//     cell 12  always off     reference
//     cells 14-15  the seconds, in ROM, so a photo can be matched to a time
//
// What to look for: whether the patches form an even ramp (the model says
// 75, 67, 50, 33, 25%); whether 1/2c flickers less than 1/2; whether the
// fast toggles look grey or flicker; whether rise and fall in cell 0 take
// the same time. Then adjust the contrast pot and look again: the greys are
// expected to move a lot, the solid and blank patches not at all.
//
// It runs at 24 fps, which 100 kHz I2C can sustain with this card (seven
// slots rewritten every frame). Faster buses make the greys steadier.

const FPS = 24;
const SOLID = Array(8).fill('#####');
const BLANK = Array(8).fill('.....');
const CHECK = Array.from({ length: 8 }, (_, r) => (r % 2 ? '.#.#.' : '#.#.#'));
const CHECK_INV = Array.from({ length: 8 }, (_, r) => (r % 2 ? '#.#.#' : '.#.#.'));

/** Duty patches as [lit frames, of every n]. */
const DUTY = [[3, 4], [2, 3], [1, 2], [1, 3], [1, 4]];
/** Bottom-row toggles: [cell, half-period in frames]. */
const TOGGLES = [[0, 24], [2, 12], [4, 6], [6, 3], [8, 1]];

export default {
  name: 'Calibrate',
  blurb: 'A bench test card: grey patches made by alternating frames, and flicker tests, to compare the simulator with real glass.',
  bus: 'i2c100',
  panel: 'gray',
  fps: FPS,

  frame(lcd, api, { t, fields }) {
    const k = Math.round(t * FPS);
    DUTY.forEach(([lit, n], j) => lcd.defineChar(j, k % n < lit ? SOLID : BLANK));
    lcd.defineChar(5, k % 2 ? CHECK_INV : CHECK);
    lcd.defineChar(6, CHECK);

    const top = Array(16).fill(0x20), bottom = Array(16).fill(0x20);
    top[0] = 0xff;
    DUTY.forEach((_, j) => { top[2 + 2 * j] = j; });
    top[12] = 5;
    top[14] = 6;

    for (const [cell, half] of TOGGLES) bottom[cell] = Math.floor(k / half) % 2 ? 0x20 : 0xff;
    bottom[10] = 0xff;
    bottom[14] = fields.ss.charCodeAt(0);
    bottom[15] = fields.ss.charCodeAt(1);

    lcd.setCursor(0, 0); top.forEach((c) => lcd.data(c));
    lcd.setCursor(0, 1); bottom.forEach((c) => lcd.data(c));
  },
};
