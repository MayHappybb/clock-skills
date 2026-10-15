// Not a clock: the type in the kit, at sizes that fit, for choosing a face.
// Top: strokeDigit 0-9 at 20 px tall, weight 3. Middle: segDigit at 18 px.
// Bottom: font3x5 and font5x7.

import { strokeDigit, segDigit, font3x5, font5x7 } from '../js/kit.js';

export default {
  name: 'Specimen',
  blurb: 'The kit\'s type: vector digits, segments, 3x5 and 5x7.',
  module: '096-128x64',
  colour: 'white',
  fps: 1,

  frame(g) {
    for (let d = 0; d < 10; d++) strokeDigit(g, d, 1 + d * 12.7, 0, 11, 20, { weight: 3 });
    for (let d = 0; d < 10; d++) segDigit(g, d, 1 + d * 12.7, 23, 11, 19, { t: 3, gap: 0.5 });
    g.text('ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789', 0, 45, { font: font3x5 });
    g.text('Hello 5x7: 10:09', 0, 53, { font: font5x7 });
  },
};
