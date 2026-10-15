// The reference point: what almost every 1602 clock on the internet does.
// Stock ROM font, stock layout, no motion. Kept so new work can be compared
// against it rather than argued about in the abstract.

export default {
  name: 'Classic',
  blurb: 'Stock ROM font, centred HH:MM:SS. The baseline every other design is measured against.',
  bus: 'i2c100',
  panel: 'green',
  fps: 1,

  frame(lcd, api, { fields }) {
    lcd.textAt(4, 0, `${fields.hh}:${fields.mm}:${fields.ss}`);
    lcd.textAt(3, 1, '1602 CLOCK');
  },
};