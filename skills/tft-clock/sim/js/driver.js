// What the firmware sends: the init sequence at boot, and each frame.
//
// The init is the module's (modules.js `init`), sent once at power-up. A
// frame is the canvas, RGB565 big-endian (the chip takes the high byte
// first; on a little-endian MCU the firmware keeps its buffer byte-swapped),
// written into the window the glass shows.

import { CMD } from './st7735.js';

/** The boot sequence as [cmd, ...params] entries and { delay: ms } pauses. */
export function initSequence(mod) {
  const i = mod.init;
  return [
    [CMD.SWRESET], { delay: 150 },
    [CMD.SLPOUT], { delay: 120 },
    ...(i.extra ?? []),
    [CMD.FRMCTR1, ...i.frmctr1],
    [i.invert ? CMD.INVON : CMD.INVOFF],
    [CMD.COLMOD, 0x05],
    [CMD.MADCTL, i.madctl],
    [CMD.CASET, ...be16(i.xoff), ...be16(i.xoff + mod.cols - 1)],
    [CMD.RASET, ...be16(i.yoff), ...be16(i.yoff + mod.rows - 1)],
    [CMD.DISPON], { delay: 20 },
  ];
}

const be16 = (v) => [(v >> 8) & 255, v & 255];

/** The canvas as the bytes RAMWR sends, for a box of it (whole canvas by default). */
export function pixelBytes(canvas, x0 = 0, y0 = 0, w = canvas.width, h = canvas.height) {
  const out = new Uint8Array(w * h * 2);
  let o = 0;
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      const v = canvas.buf[y * canvas.width + x];
      out[o++] = v >> 8; out[o++] = v & 255;
    }
  return out;
}

/**
 * Send a frame. `mode`:
 *   'full'   the whole window every frame (25,600 bytes): simple, constant cost
 *   'dirty'  only the bounding box of pixels that changed since the last
 *            frame sent, as one window; nothing at all if nothing changed
 * `last` is the previous frame's buffer (Uint16Array) for 'dirty'.
 */
export function flush(lcd, canvas, mod, { mode = 'full', last = null, chunk = Infinity } = {}) {
  let x0 = 0, y0 = 0, x1 = canvas.width, y1 = canvas.height;
  if (mode === 'dirty' && last) {
    x0 = canvas.width; y0 = canvas.height; x1 = 0; y1 = 0;
    for (let y = 0; y < canvas.height; y++)
      for (let x = 0; x < canvas.width; x++) {
        const i = y * canvas.width + x;
        if (canvas.buf[i] !== last[i]) { if (x < x0) x0 = x; if (x >= x1) x1 = x + 1; if (y < y0) y0 = y; if (y >= y1) y1 = y + 1; }
      }
    if (x1 <= x0) return { x: 0, y: 0, w: 0, h: 0 };
  } else if (mode !== 'full' && mode !== 'dirty') throw new Error(`unknown driver '${mode}' (full | dirty)`);
  const { xoff, yoff } = mod.init;
  lcd.command(CMD.CASET, ...be16(xoff + x0), ...be16(xoff + x1 - 1));
  lcd.command(CMD.RASET, ...be16(yoff + y0), ...be16(yoff + y1 - 1));
  lcd.ramwr(pixelBytes(canvas, x0, y0, x1 - x0, y1 - y0), chunk);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
