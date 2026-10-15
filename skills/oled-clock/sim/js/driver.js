// What the firmware sends: the init sequence at power-up, and each frame's
// buffer. Modelled on Adafruit_SSD1306 / Adafruit_SH110X / U8g2 full-buffer
// mode, so the bus cost the simulator reports is the cost those libraries
// actually pay.

/**
 * Power-up sequences. Each is the vendor/library sequence for that
 * controller and panel size; see references/hardware.md for where each comes
 * from. `h` is the panel height (64 or 32).
 */
export function initSequence(chip, h) {
  if (chip === 'sh1106') {
    return [
      0xae,             // display off
      0xd5, 0x80,       // clock divide 1, oscillator setting 8
      0xa8, h - 1,      // multiplex ratio
      0xd3, 0x00,       // display offset 0
      0x40,             // start line 0
      0xad, 0x8b,       // DC-DC (charge pump) on
      0xa1,             // segment remap: column 131 -> SEG0
      0xc8,             // COM scan remapped: COM[N-1] -> COM0
      0xda, 0x12,       // alternative COM pin configuration
      0x81, 0x80,       // contrast
      0xd9, 0x22,       // pre-charge 2 / 2
      0xdb, 0x35,       // VCOM deselect level
      0xa4, 0xa6,       // show RAM, not inverted
      0xaf,             // display on
    ];
  }
  const seq = [
    0xae,
    0xd5, 0x80,
    0xa8, h - 1,
    0xd3, 0x00,
    0x40,
  ];
  if (chip === 'ssd1306') seq.push(0x8d, 0x14); // internal charge pump on
  seq.push(
    0x20, 0x00,                       // horizontal addressing
    0xa1,
    0xc8,
    0xda, h === 64 ? 0x12 : 0x02,     // alternative for 64 rows, sequential for 32
    0x81, h === 64 ? 0xcf : 0x8f,
    0xd9, chip === 'ssd1306' ? 0xf1 : 0x22,
    0xdb, 0x40,
    0xa4, 0xa6,
    0x2e,                             // no scroll
    0xaf,
  );
  return seq;
}

/**
 * Send a 1-bit canvas to the controller.
 *
 * `mode: 'full'` sends every byte of the pages, as Adafruit's display() and
 * U8g2's sendBuffer() do. `mode: 'dirty'` sends, per page, only the span of
 * columns that differs from `before` (the RAM as it stood), with its own
 * address window: cheaper when little changes, dearer per byte.
 *
 * @param {import('./ssd1306.js').OLED} oled
 * @param {Uint8Array} pages  canvas.toPages(): pages x width bytes
 * @param {object} o
 * @param {number} o.width    canvas width (visible columns)
 * @param {number} o.firstPage, o.pageCount  which RAM pages to send
 * @param {number} o.colOffset  RAM column of the canvas's x = 0 (2 on an SH1106 panel)
 */
export function flush(oled, pages, { width, firstPage = 0, pageCount, colOffset = 0, mode = 'full' }) {
  const addressing = oled.spec.hasAddressingModes;

  if (mode === 'full' && addressing) {
    oled.commands(0x22, firstPage, firstPage + pageCount - 1, 0x21, colOffset, colOffset + width - 1);
    oled.data(pages.subarray(0, pageCount * width));
    return;
  }
  for (let p = 0; p < pageCount; p++) {
    let x0 = 0, x1 = width - 1;
    if (mode === 'dirty') {
      x0 = -1;
      for (let x = 0; x < width; x++) {
        if (pages[p * width + x] !== oled.ramByte(firstPage + p, colOffset + x)) { if (x0 < 0) x0 = x; x1 = x; }
      }
      if (x0 < 0) continue;
    }
    const col = colOffset + x0;
    if (addressing) oled.commands(0x22, firstPage + p, firstPage + p, 0x21, col, colOffset + x1);
    else oled.commands(0xb0 | (firstPage + p), col & 0x0f, 0x10 | (col >> 4));
    oled.data(pages.subarray(p * width + x0, p * width + x1 + 1));
  }
}
