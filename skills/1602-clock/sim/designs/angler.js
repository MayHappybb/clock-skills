// glyph test
const D = {
  0: ['.###.', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.'],
  1: ['.##..', '###..', '.##..', '.##..', '.##..', '.##..', '####.'],
  9: ['.###.', '##.##', '##.##', '.####', '...##', '...##', '.###.'],
};
const TA = ['.....', '##...', '.##..', '..###', '..###', '.##..', '##...', '.....'];
export default {
  name: 'angler',
  blurb: 'Placeholder.',
  bus: 'i2c100',
  panel: 'green',
  fps: 1,
  frame(lcd) {
    lcd.defineChar(0, [...D[1], '.....']);
    lcd.defineChar(1, [...D[0], '.....']);
    lcd.defineChar(2, [...D[9], '.....']);
    lcd.defineChar(3, TA);
    const put = (c, r, code) => { lcd.setCursor(c, r); lcd.data(code); };
    [[1, 0], [3, 1], [6, 1], [8, 2]].forEach(([c, d]) => { put(c - 1, 0, 3); put(c, 0, d); put(c - 1, 1, 0x3e); put(c, 1, d); });
    put(4, 0, 0xa5); put(4, 1, 0x2e);
  },
};
