// The baseline: what most small-TFT clock sketches show. A library font at
// size 3, centred, white on black, the date under it. Every new face should
// beat this.

import { font5x7 } from '../js/kit.js';

export default {
  name: 'Classic',
  blurb: 'The library default: 5x7 at size 3, white on black, date below. The baseline.',
  fps: 2,
  utility: true,
  frame(g, { fields: f }) {
    g.clear(0x000000);
    const t = `${f.hh}:${f.mm}:${f.ss}`;
    g.text(t, (160 - font5x7.measure(t, 3)) / 2, 18, { font: font5x7, scale: 3, c: 0xffffff });
    const d = `${f.dow} ${f.dd} ${f.month} ${f.year}`;
    g.text(d, (160 - font5x7.measure(d)) / 2, 56, { font: font5x7, c: 0x00ffff });
  },
};
