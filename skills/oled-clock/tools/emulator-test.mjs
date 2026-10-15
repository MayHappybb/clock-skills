// Regression tests for the controller emulator and the scan-out.
//
//   node tools/emulator-test.mjs
//
// Each test drives the emulator with raw bytes, as firmware would, and checks
// what the glass shows. Exits non-zero on the first failure count > 0.

import { OLED, transactionUs } from '../sim/js/ssd1306.js';
import { initSequence, flush } from '../sim/js/driver.js';
import { MODULES } from '../sim/js/modules.js';
import { scanout } from '../sim/js/player.js';
import { Gfx } from '../sim/js/gfx.js';

let failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`ok   ${name}`); }
  catch (err) { failed++; console.log(`FAIL ${name}\n     ${err.message}`); }
}
function eq(a, b, what) { if (a !== b) throw new Error(`${what}: expected ${b}, got ${a}`); }

const mod = (key) => ({ key, ...MODULES[key] });
const lit = (lv, m, x, y) => lv[y * m.cols + x] > 0;

/** A controller for module `key`, initialised, with one marker pixel drawn at (x, y). */
function marked(key, x, y, extra = [], before = []) {
  const m = mod(key);
  const oled = new OLED({ chip: m.chip });
  oled.commands(initSequence(m.chip, m.rows));
  if (before.length) oled.commands(before);
  const g = new Gfx(m.cols, m.rows);
  g.pixel(x, y);
  flush(oled, g.toPages(), { width: m.cols, pageCount: m.rows / 8, colOffset: m.colOffset ?? 0 });
  if (extra.length) oled.commands(extra);
  return { m, oled, lv: scanout(oled, m) };
}

function onlyLit(lv, m) {
  const out = [];
  for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) if (lit(lv, m, x, y)) out.push(`${x},${y}`);
  return out.join(' ');
}

for (const key of Object.keys(MODULES)) {
  test(`${key}: the standard init shows the canvas upright`, () => {
    for (const [x, y] of [[0, 0], [127, 0], [5, 9], [0, MODULES[key].rows - 1], [127, MODULES[key].rows - 1]]) {
      const { m, lv } = marked(key, x, y);
      eq(onlyLit(lv, m), `${x},${y}`, `pixel drawn at ${x},${y}`);
    }
  });
}

test('GDDRAM byte: LSB is the top row of the page', () => {
  const o = new OLED();
  o.commands(0x20, 0x00, 0x21, 0, 127, 0x22, 0, 7);
  o.data([0x01, 0x80]);
  eq(o.ramPixel(0, 0), 1, 'col 0 row 0'); eq(o.ramPixel(1, 7), 1, 'col 1 row 7'); eq(o.ramPixel(1, 0), 0, 'col 1 row 0');
});

test('horizontal addressing wraps column then page within the window', () => {
  const o = new OLED();
  o.commands(0x20, 0x00, 0x21, 10, 11, 0x22, 2, 3);
  o.data([1, 2, 3, 4]);
  eq(o.ram[2 * 128 + 10], 1, 'p2 c10'); eq(o.ram[2 * 128 + 11], 2, 'p2 c11');
  eq(o.ram[3 * 128 + 10], 3, 'p3 c10'); eq(o.ram[3 * 128 + 11], 4, 'p3 c11');
  eq(o.page, 2, 'page wrapped to start');
  o.data([5]);
  eq(o.ram[2 * 128 + 10], 5, 'fifth byte lands back at p2 c10');
});

test('vertical addressing walks pages first', () => {
  const o = new OLED();
  o.commands(0x20, 0x01, 0x21, 0, 127, 0x22, 0, 1);
  o.data([7, 8, 9]);
  eq(o.ram[0], 7, 'p0 c0'); eq(o.ram[128], 8, 'p1 c0'); eq(o.ram[1], 9, 'p0 c1');
});

test('page addressing: column wraps, page does not', () => {
  const o = new OLED();
  o.commands(0x20, 0x02, 0xb3, 0x0e, 0x17);   // page 3, column 0x7e
  o.data([1, 2, 3]);
  eq(o.ram[3 * 128 + 126], 1, 'c126'); eq(o.ram[3 * 128 + 127], 2, 'c127'); eq(o.ram[3 * 128 + 0], 3, 'wrapped to c0, same page');
});

test('SH1106 has no 0x20: it is reported, not obeyed', () => {
  const o = new OLED({ chip: 'sh1106' });
  o.commands(0x20, 0x00);
  if (!o.report().warnings.some((w) => /0x20/.test(w))) throw new Error('no warning for 0x20 on SH1106');
});

test('128x64 with sequential COM config (0xDA 0x02) interleaves the picture', () => {
  const { m, lv } = marked('096-128x64', 10, 1, [0xda, 0x02]);
  const where = onlyLit(lv, m);
  if (where === '10,1') throw new Error('picture unchanged: COM pin configuration has no effect');
});

test('128x32 with alternative COM config (0xDA 0x12) breaks the picture', () => {
  const { m, lv } = marked('091-128x32', 10, 1, [0xda, 0x12]);
  if (onlyLit(lv, m) === '10,1') throw new Error('picture unchanged');
});

test('0xA0 mirrors data written after it, not data already in RAM (S11 §10.1.8)', () => {
  let r = marked('096-128x64', 3, 5, [], [0xa0]);
  eq(onlyLit(r.lv, r.m), '124,5', '0xA0 then write');
  r = marked('096-128x64', 3, 5, [0xa0]);
  eq(onlyLit(r.lv, r.m), '3,5', 'write then 0xA0');
});

test('0xC0 mirrors top-bottom at once', () => {
  const r = marked('096-128x64', 3, 5, [0xc0]);
  eq(onlyLit(r.lv, r.m), '3,58', '0xC0');
});

test('frame rate: 128x64, standard init, ~87.6 Hz (S11 §8.3)', () => {
  const o = new OLED();
  o.commands(initSequence('ssd1306', 64));
  if (Math.abs(o.frameRate() - 87.6) > 0.1) throw new Error(`got ${o.frameRate().toFixed(2)} Hz`);
});

test('0x23 takes a parameter byte, so the next command is not eaten', () => {
  const o = new OLED();
  o.commands(0x23, 0x30, 0xa7);
  eq(o.r.inverse, true, 'inverse after 0x23 xx');
});

test('display offset rolls the picture on the COMs', () => {
  const { m, lv } = marked('096-128x64', 3, 5, [0xd3, 2]);
  if (onlyLit(lv, m) === '3,5') throw new Error('offset had no effect');
});

test('display start line rolls the picture up', () => {
  const { m, lv } = marked('096-128x64', 3, 5, [0x40 | 2]);
  eq(onlyLit(lv, m), '3,3', 'start line 2');
});

test('inverse, entire-on, display off', () => {
  let r = marked('096-128x64', 3, 5, [0xa7]);
  eq(r.lv.filter((v) => v > 0).length, 128 * 64 - 1, 'inverse lights all but one');
  r = marked('096-128x64', 3, 5, [0xa5]);
  eq(r.lv.filter((v) => v > 0).length, 128 * 64, 'entire on');
  r = marked('096-128x64', 3, 5, [0xae]);
  eq(r.lv.filter((v) => v > 0).length, 0, 'display off');
});

test('charge pump off leaves a charge-pump module dark', () => {
  const r = marked('096-128x64', 3, 5, [0x8d, 0x10]);
  eq(r.lv.filter((v) => v > 0).length, 0, 'lit pixels');
});

test('bus cost: a full 128x64 frame on I2C 400 kHz', () => {
  const o = new OLED({ bus: 'i2c400' });
  o.commands(initSequence('ssd1306', 64));
  o.beginFrame();
  flush(o, new Uint8Array(1024), { width: 128, pageCount: 8 });
  const r = o.report();
  eq(r.ramBytes, 1024, 'RAM bytes');
  eq(r.transactions, 1 + Math.ceil(1024 / 31), 'transactions');
  const expect = transactionUs('i2c400', 6) + 33 * transactionUs('i2c400', 31) + transactionUs('i2c400', 1024 - 33 * 31);
  if (Math.abs(r.busUs - expect) > 1e-6) throw new Error(`busUs ${r.busUs} != ${expect}`);
});

test('dirty driver sends only what changed', () => {
  const o = new OLED({ bus: 'i2c400' });
  o.commands(initSequence('ssd1306', 64));
  const g = new Gfx(128, 64);
  flush(o, g.toPages(), { width: 128, pageCount: 8 });
  o.beginFrame();
  g.pixel(40, 20).pixel(44, 20);
  flush(o, g.toPages(), { width: 128, pageCount: 8, mode: 'dirty' });
  eq(o.report().ramBytes, 5, 'one page, columns 40..44');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
