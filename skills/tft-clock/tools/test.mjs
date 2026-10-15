// Regression tests for the emulator, the driver, the canvas and the colour
// maths. Run after touching anything in sim/js/.
//
//   node tools/test.mjs

import { ST7735, CMD, RAM_W, expand565 } from '../sim/js/st7735.js';
import { initSequence, flush } from '../sim/js/driver.js';
import { MODULES } from '../sim/js/modules.js';
import { buildFrame, transmittance, wiring, DESIGNS } from '../sim/js/player.js';
import { Gfx, to565, from565, dither565, hex, mix } from '../sim/js/kit.js';

let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  if (ok) pass++;
  else { fail++; console.log(`FAIL  ${name}${detail ? `: ${detail}` : ''}`); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const mod = { key: 'air101-lcd', ...MODULES['air101-lcd'] };

// ---- controller
{
  const lcd = new ST7735({ bus: 'spi40' });
  lcd.run(initSequence(mod));
  check('init leaves the panel on and awake', lcd.r.displayOn && !lcd.r.sleep);
  check('init sets RGB565', lcd.r.colmod === 5);
  check('init sets MADCTL', lcd.r.madctl === mod.init.madctl);
  check('frame rate for 05/3C/3C is ~59.9 Hz', near(lcd.frameRate(), 59.86, 0.05), lcd.frameRate().toFixed(2));
  lcd.r.frmctr1 = [0x05, 0x3a, 0x3a];
  check('reset-default frame rate ~60.7 Hz', near(lcd.frameRate(), 60.71, 0.05), lcd.frameRate().toFixed(2));
}
{
  // Window wrap: a 2x2 window takes 4 pixels and then starts over.
  const lcd = new ST7735();
  lcd.command(CMD.COLMOD, 5).command(CMD.MADCTL, 0x00);
  lcd.command(CMD.CASET, 0, 10, 0, 11).command(CMD.RASET, 0, 20, 0, 21);
  const px = (v) => [v >> 8, v & 255];
  lcd.ramwr(Uint8Array.from([...px(0xf800), ...px(0x07e0), ...px(0x001f), ...px(0xffff), ...px(0x0000)]));
  check('window: first pixel at (10,20)', lcd.ram[20 * RAM_W + 10] === 0, 'wrapped write should have overwritten it with black');
  check('window: second pixel at (11,20)', lcd.ram[20 * RAM_W + 11] === expand565(0x07e0));
  check('window: third pixel wraps to (10,21)', lcd.ram[21 * RAM_W + 10] === expand565(0x001f));
  check('RGB565 expansion of white is 6-bit white', expand565(0xffff) === 0x3f3f3f);
  check('RGB565 expansion of pure red', expand565(0xf800) === 0x3f0000);
}
{
  // MV exchanges the axes; MX mirrors the column address.
  const lcd = new ST7735();
  check('MADCTL 00: (c, r) -> row r, col c', lcd.addressOf(5, 7, 0x00) === 7 * RAM_W + 5);
  check('MADCTL MV: (c, r) -> row c, col r', lcd.addressOf(5, 7, 0x20) === 5 * RAM_W + 7);
  check('MADCTL MX: column mirrored', lcd.addressOf(0, 0, 0x40) === RAM_W - 1);
  check('MADCTL MV|MX: column counter mirrored along the 162 rows', lcd.addressOf(0, 0, 0x60) === 161 * RAM_W);
}
{
  // Bus time: a full 160x80 frame at 40 MHz.
  const lcd = new ST7735({ bus: 'spi40' });
  lcd.run(initSequence(mod));
  lcd.beginFrame();
  const g = new Gfx(160, 80);
  flush(lcd, g, mod);
  const r = lcd.report();
  check('full frame is 25,600 pixel bytes plus 11 command bytes', r.bytes === 25611, String(r.bytes));
  check('full frame at 40 MHz takes ~5.1 ms', near(r.ms, 5.15, 0.05), r.ms.toFixed(3));
  // Dirty: nothing changed -> nothing sent; one pixel -> a 1x1 window.
  lcd.lastBuf = g.buf.slice();
  lcd.beginFrame();
  check('dirty driver sends nothing for an unchanged frame', flush(lcd, g, mod, { mode: 'dirty', last: lcd.lastBuf }).w === 0 && lcd.report().bytes === 0);
  const g2 = new Gfx(160, 80); g2.pixel(40, 20, 0xffffff);
  lcd.beginFrame();
  const box = flush(lcd, g2, mod, { mode: 'dirty', last: g.buf });
  check('dirty driver sends a 1x1 window for one pixel', box.w === 1 && box.h === 1 && lcd.report().bytes === 13, JSON.stringify(box));
}

// ---- the glass: the module's init shows the canvas upright and in true colour
{
  const map = wiring(mod);
  check('wiring maps every glass pixel to a distinct memory cell', new Set(map).size === map.length && !map.includes(-1));
  const probe = {
    name: 'probe', fps: 1,
    frame(g) { g.clear(0); g.pixel(0, 0, 0xff0000).pixel(159, 0, 0x00ff00).pixel(0, 79, 0x0000ff).pixel(159, 79, 0xffffff); },
  };
  DESIGNS.__probe = probe;
  const b = buildFrame('__probe', {});
  const T = transmittance(b.lcd, b.module);
  const at = (x, y) => [0, 1, 2].map((c) => T[(y * 160 + x) * 3 + c]);
  const is = (v, w) => v.every((x, i) => near(x, w[i], 0.01));
  check('top-left shows red', is(at(0, 0), [1, 0, 0]), at(0, 0).join());
  check('top-right shows green', is(at(159, 0), [0, 1, 0]), at(159, 0).join());
  check('bottom-left shows blue', is(at(0, 79), [0, 0, 1]), at(0, 79).join());
  check('bottom-right shows white', is(at(159, 79), [1, 1, 1]));
  check('black shows black', is(at(80, 40), [0, 0, 0]));
  delete DESIGNS.__probe;
  // ctx.lcd.invert() flips everything.
  DESIGNS.__inv = { name: 'inv', fps: 1, frame(g, ctx) { g.clear(0); ctx.lcd.invert(); } };
  const bi = buildFrame('__inv', {});
  check('ctx.lcd.invert() turns black to white', near(transmittance(bi.lcd, bi.module)[0], 1, 0.01));
  delete DESIGNS.__inv;
}

// ---- colour
{
  check('to565/from565 round-trips pure colours', [0xff0000, 0x00ff00, 0x0000ff, 0xffffff, 0].every((c) => from565(to565(c)) === c));
  check('hex parses #rgb', hex('#f80') === 0xff8800);
  check('mix halfway', mix(0x000000, 0xffffff, 0.5) === 0x808080);
  // Dither keeps the mean: a 4x4 tile of a level between two RGB565 steps.
  let sum = 0;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) sum += (dither565(0, 0, 100, x, y) & 31) * 255 / 31;
  check('dither565 preserves the mean level', near(sum / 16, 100, 4), (sum / 16).toFixed(1));
}

// ---- canvas
{
  const g = new Gfx(160, 80);
  g.fillCircle(80, 40, 20, 0xffffff);
  const n = g.buf.reduce((a, v) => a + (v ? 1 : 0), 0);
  check('hard disc area ~ pi r^2', near(n, Math.PI * 400, 30), String(n));
  const h = new Gfx(160, 80);
  h.fillCircle(80, 40, 20, 0xffffff, { aa: true });
  let cov = 0;
  for (const v of h.buf) cov += (from565(v) & 255) / 255;
  check('AA disc coverage sums to pi r^2', near(cov, Math.PI * 400, 6), cov.toFixed(1));
  const c = new Gfx(160, 80);
  c.clip(10, 10, 20, 20).fillRect(0, 0, 160, 80, 0xffffff).unclip();
  check('clip limits a fill', c.buf.reduce((a, v) => a + (v ? 1 : 0), 0) === 400);
  const a = new Gfx(160, 80);
  a.arc(80, 40, 10, 20, 0, Math.PI / 2, 0xffffff);
  check('quarter arc lights the upper right only', a.get(90, 30) !== 0 && a.get(70, 30) === 0 && a.get(90, 50) === 0);
  const w = new Gfx(160, 80);
  w.arc(80, 40, 10, 20, 0, 1.5 * Math.PI, 0xffffff);
  check('three-quarter arc leaves the upper left empty', w.get(70, 30) === 0 && w.get(70, 50) !== 0 && w.get(90, 50) !== 0);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
