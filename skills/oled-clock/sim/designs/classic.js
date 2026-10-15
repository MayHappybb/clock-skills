// The baseline: what most SSD1306 clocks are. The library's default 5x7 font
// at size 2, centred, the date under it at size 1. Here to be beaten.

import { font5x7 } from '../js/kit.js';

export default {
  name: 'Classic',
  blurb: 'The default font at size 2, centred. What everyone builds first.',
  module: '096-128x64',
  colour: 'white',
  bus: 'i2c400',
  fps: 1,

  frame(g, { fields: f, W }) {
    const time = `${f.hh}:${f.mm}:${f.ss}`;
    const w = font5x7.measure(time, 2);
    g.text(time, Math.round((W - w) / 2), 22, { font: font5x7, scale: 2 });
    const date = `${f.dow} ${f.dd} ${f.month} ${f.year}`;
    g.text(date, Math.round((W - font5x7.measure(date)) / 2), 44, { font: font5x7 });
  },
};
