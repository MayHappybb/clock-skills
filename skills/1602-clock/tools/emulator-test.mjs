// Checks the emulator against the behaviours the datasheet pins down.
//
//   node tools/emulator-test.mjs

import assert from 'node:assert/strict';
import { HD44780 } from '../sim/js/hd44780.js';
import { portraitToModule, portraitTile, portraitMM } from '../sim/js/kit.js';

const tests = {
  'codes 0x08-0x0F show CGRAM slots 0-7 (datasheet Table 1, bit 3 ignored)'() {
    const lcd = new HD44780();
    lcd.defineChar(6, ['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '#####']);
    assert.deepEqual(lcd.glyph(0x0e), lcd.glyph(0x06));
    assert.equal(lcd.glyph(0x0e)[0], 0x1f);
  },

  'writing past 0x27 continues on line 2, and past 0x67 back to 0x00'() {
    const lcd = new HD44780();
    lcd.command(0x80 | 0x27).data(0x41).data(0x42);   // 0x27 then 0x40
    assert.equal(lcd.ac, 0x41);
    lcd.command(0x80 | 0x67).data(0x43);              // 0x67 then 0x00
    assert.equal(lcd.ac, 0x00);
    assert.equal(lcd.codeAt(0, 1), 0x42);
  },

  'display shift slides the window over the 40-address line'() {
    const lcd = new HD44780();
    lcd.command(0x80 | 0x10).data(0x5a);              // off screen at rest
    for (let i = 0; i < 16; i++) lcd.command(0x18);   // shift display left x16
    assert.equal(lcd.codeAt(0, 0), 0x5a);
  },

  'return home and clear undo the display shift'() {
    const lcd = new HD44780();
    lcd.command(0x80 | 0x05).data(0x5a);
    lcd.command(0x18).command(0x18);
    assert.equal(lcd.codeAt(3, 0), 0x5a);
    lcd.command(0x02);
    assert.equal(lcd.codeAt(5, 0), 0x5a);
    lcd.command(0x18).command(0x01);
    assert.equal(lcd.shift, 0);
  },

  'portrait: the viewer top-left is the module bottom-left, turned clockwise'() {
    assert.deepEqual(portraitToModule(0, 0), { col: 0, row: 1, i: 0, r: 7 });
    assert.deepEqual(portraitToModule(15, 79), { col: 15, row: 0, i: 4, r: 0 });
    assert.deepEqual(portraitToModule(8, 5), { col: 1, row: 0, i: 0, r: 7 });
    const t = portraitTile(['#.......', '........', '........', '........', '.......#']);
    assert.equal(t[7], '#....');                      // viewer top-left -> stored row 7, column 0
    assert.equal(t[0], '....#');                      // viewer bottom-right -> stored row 0, column 4
    assert.ok(portraitMM(8, 0).x - portraitMM(7, 0).x < portraitMM(1, 0).x - portraitMM(0, 0).x + 0.41);
    assert.ok(portraitMM(0, 5).y - portraitMM(0, 4).y > 1.5 * (portraitMM(0, 1).y - portraitMM(0, 0).y));
  },

  'trap #1 is reported: slot rewritten after a cell using it was drawn'() {
    const lcd = new HD44780();
    lcd.beginFrame();
    lcd.defineChar(0, Array(8).fill('#....'));
    lcd.setCursor(0, 0); lcd.data(0);
    lcd.defineChar(0, Array(8).fill('....#'));
    lcd.setCursor(0, 1); lcd.data(0);
    assert.deepEqual(lcd.report().hazards, [0]);
  },

  'no hazard when every slot is written before it is drawn'() {
    const lcd = new HD44780();
    lcd.beginFrame();
    lcd.defineChar(0, Array(8).fill('#....'));
    lcd.defineChar(1, Array(8).fill('....#'));
    lcd.setCursor(0, 0); lcd.data(0);
    lcd.setCursor(0, 1); lcd.data(1);
    assert.deepEqual(lcd.report().hazards, []);
  },

  'execution overlaps the wire: an op costs the longer of the two'() {
    const i2c = new HD44780({ bus: 'i2c100' });
    i2c.beginFrame(); i2c.data(0x41);
    assert.equal(i2c.frameCostUs(), 400);
    const par = new HD44780({ bus: 'parallel8' });
    par.beginFrame(); par.data(0x41); par.command(0x01);
    assert.equal(par.frameCostUs(), 43 + 1530);         // datasheet: 43 us, 1.53 ms
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log(`ok   ${name}`); }
  catch (err) { failed++; console.log(`FAIL ${name}\n     ${err.message}`); }
}
process.exitCode = failed ? 1 : 0;
