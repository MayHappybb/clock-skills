// Bring-up card, not a face. Run it first on real hardware: if what the
// glass shows differs from the render, the module's init in modules.js is
// wrong, and this card says how.
//
//   - a 1-pixel white frame round the edge: every side visible means the
//     window offset (xoff, yoff) is right; a missing side or a stripe of
//     noise on the opposite one means it is off by that much
//   - R, G, B in the top-left, top-middle and top-right boxes: red and blue
//     swapped means MADCTL's BGR bit is wrong for the panel
//   - black background: if it shows white, inversion is wrong
//   - the arrow points up and right: a mirror image means MX/MY are wrong
//   - ramps of each channel along the bottom: the 32 or 64 steps, and how
//     the dark end looks

import { font3x5, rgb } from '../js/kit.js';

export default {
  name: 'Test card',
  blurb: 'Bring-up: edge frame, R/G/B boxes, orientation arrow, channel ramps.',
  fps: 1,
  utility: true,
  frame(g) {
    g.clear(0x000000);
    g.rect(0, 0, 160, 80, 0xffffff);
    const boxes = [[0xff0000, 'R'], [0x00ff00, 'G'], [0x0000ff, 'B']];
    boxes.forEach(([c, l], i) => {
      const x = 4 + i * 52;
      g.fillRect(x, 4, 48, 14, c);
      g.text(l, x + 22, 8, { font: font3x5, c: i === 1 ? 0x000000 : 0xffffff });
    });
    // Orientation arrow: up and to the right.
    g.thickLine(20, 52, 44, 26, 3, 0xffff00);
    g.fillPolygon([[46, 22], [34, 26], [42, 34]], 0xffff00);
    g.text('UP', 60, 28, { font: font3x5, c: 0xffffff });
    // Ramps: 0..255 in each channel and grey, each 4 px tall.
    for (let x = 0; x < 152; x++) {
      const v = (x / 151) * 255;
      g.fillRect(4 + x, 58, 1, 4, rgb(v, 0, 0));
      g.fillRect(4 + x, 62, 1, 4, rgb(0, v, 0));
      g.fillRect(4 + x, 66, 1, 4, rgb(0, 0, v));
      g.fillRect(4 + x, 70, 1, 5, rgb(v, v, v));
    }
    // Corner marks, one pixel each, in the very corners inside the frame.
    g.pixel(1, 1, 0xff0000).pixel(158, 1, 0x00ff00).pixel(1, 78, 0x0000ff).pixel(158, 78, 0xffffff);
  },
};
