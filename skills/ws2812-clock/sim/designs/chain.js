// Wiring test, not a clock. Run it on the real boards first: a white head
// runs down the chain in data order, leaving a trail in the board's colour;
// each board's first LED blinks. If the head jumps around on the hardware,
// the map in panels.js is wrong for that board.
import * as kit from '../js/kit.js';

const HUES = [0.0, 0.33, 0.6, 0.12, 0.8, 0.5, 0.95, 0.22];

export default {
  name: 'Chain test', blurb: 'data order, board by board: run this on the hardware first',
  layouts: ['*'], fps: 60, brightness: 0.35,
  frame(ctx) {
    const { leds, layout: L, t } = ctx;
    const speed = 40;                                  // LEDs a second
    for (const lane of L.lanes) {
      const first = L.panels[lane.panels[0]].start;
      const head = (t * speed) % lane.count;
      for (let k = 0; k < lane.count; k++) {
        const l = leds[first + k];
        const behind = (head - k + lane.count) % lane.count;
        const hue = HUES[l.panel % HUES.length];
        kit.set(ctx, l.i, kit.hsv(hue, 1, 1), 0.06 + 0.9 * Math.exp(-behind / 14));
        if (behind < 1) kit.set(ctx, l.i, [1, 1, 1]);
      }
    }
    for (const p of L.panels) if (Math.floor(t * 2) % 2 === 0) kit.set(ctx, p.start, [1, 1, 1]);
  },
};
