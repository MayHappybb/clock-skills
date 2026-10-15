// The kit's type and edges, side by side: hard pixels against anti-aliased.

import { font3x5, font5x7, strokeText, segDigit } from '../js/kit.js';

export default {
  name: 'Specimen',
  blurb: 'The kit: 3x5, 5x7, vector digits hard and anti-aliased, seven-segment, shapes.',
  fps: 1,
  utility: true,
  frame(g) {
    g.clear(0x101418);
    g.text('3X5 ABC 0123456789', 2, 2, { font: font3x5, c: 0xc8d0d8 });
    g.text('5x7 Abc 0123', 2, 9, { font: font5x7, c: 0xc8d0d8 });
    strokeText(g, '09', 2, 20, { w: 14, h: 24, weight: 3, c: 0xffb000 });
    strokeText(g, '09', 38, 20, { w: 14, h: 24, weight: 3, c: 0xffb000, aa: true });
    segDigit(g, 4, 74, 20, 13, 24, { t: 3, c: 0xff3040, ghost: 0x2a1418 });
    segDigit(g, 2, 90, 20, 13, 24, { t: 3, c: 0xff3040, ghost: 0x2a1418, aa: true });
    g.fillCircle(118, 31, 9, 0x40c0ff);
    g.fillCircle(144, 31, 9, 0x40c0ff, { aa: true });
    g.thickLine(4, 74, 76, 50, 1, 0xffffff);
    g.thickLine(82, 74, 156, 50, 1, 0xffffff, { aa: true });
    g.text('HARD', 2, 52, { font: font3x5, c: 0x808890 });
    g.text('AA', 140, 70, { font: font3x5, c: 0x808890 });
  },
};
