// HD44780-compatible dot-matrix LCD controller, as used by the 1602 module.
//
// Instruction encodings and execution times are taken from the "Table of
// Commands" in the module datasheet (SunFounder LCD-1602A, Digi-Key document
// CN0295D). The emulator tracks the busy flag and, importantly, the cost of
// pushing bytes over a real bus, so a design can be checked for feasibility on
// actual hardware rather than just looking pretty in the browser.
//
// Character codes 0x00-0x0F all display CGRAM: bit 3 of the code is ignored,
// so 0x08-0x0F are aliases of slots 0-7 (datasheet Table 1, "0000 *000").

import { CGROM_A00, CGROM_ROWS } from './cgrom-a00.js';

export const CHARS_WIDE = 16;
export const CHARS_TALL = 2;
export const DOT_COLS = 5;
export const DOT_ROWS = 8; // visible dot rows per character cell

/** Instruction execution time in microseconds (HD44780 datasheet, fosc = 270 kHz). */
const T_CLEAR = 1530;
const T_HOME = 1530;
const T_INSTR = 39;
const T_DATA = 43;

/** Visible-or-not width of one DDRAM line in two-line mode. */
const LINE_LEN = 0x28;

/**
 * Cost of moving one byte from the host to the controller, in microseconds.
 *
 * On a PCF8574 backpack the LCD runs in 4-bit mode and every nibble needs the
 * expander written twice (E high, E low): four expander bytes, 36 bit times,
 * per LCD byte. The figures assume a driver that streams those in one I2C
 * transaction. The common Arduino LiquidCrystal_I2C library opens a separate
 * transaction per E edge and sleeps between them, which is roughly three
 * times slower than this.
 *
 * The PCF8574 is specified for 100 kHz. Many run at 400 kHz, out of spec.
 */
export const BUSES = {
  parallel8: { label: '8-bit parallel', perByteUs: 1 },
  parallel4: { label: '4-bit parallel', perByteUs: 2 },
  i2c100: { label: 'I2C 100 kHz (PCF8574)', perByteUs: 400 },
  i2c400: { label: 'I2C 400 kHz (PCF8574, out of spec)', perByteUs: 100 },
};

export class HD44780 {
  /**
   * @param {object} [opts]
   * @param {string} [opts.bus] key of BUSES, used for cost accounting
   * @param {number} [opts.cols] visible columns (16)
   * @param {number} [opts.rows] visible rows (2)
   */
  constructor({ bus = 'i2c100', cols = CHARS_WIDE, rows = CHARS_TALL } = {}) {
    this.cols = cols;
    this.rows = rows;
    this.bus = BUSES[bus] ? bus : 'i2c100';
    this.perByteUs = BUSES[this.bus].perByteUs;

    /** 80 bytes of display data RAM: line 1 is addresses 0x00-0x27 (indices
     *  0-39), line 2 is 0x40-0x67 (indices 40-79). */
    this.ddram = new Uint8Array(80);
    /** 64 bytes of character generator RAM: 8 glyphs x 8 dot rows. */
    this.cgram = new Uint8Array(64);
    /** Bumped whenever a slot's picture changes; used to detect trap #1. */
    this.slotVersion = new Uint32Array(8);
    /** Character generator ROM, 256 glyphs x CGROM_ROWS dot rows. */
    this.cgrom = CGROM_A00;
    this.cgromRows = CGROM_ROWS;

    /** Address counter (7 bits) and which RAM it points into. */
    this.ac = 0;
    this.acIsCgram = false;

    this.displayOn = false;
    this.cursorOn = false;
    this.blinkOn = false;
    this.increment = true; // entry mode I/D
    this.autoShift = false; // entry mode S
    this.shift = 0; // accumulated display shift, in columns
    this.twoLine = true;
    this.font5x10 = false;
    this.lineAddresses = [0x00, 0x40];

    this.busyUntilUs = 0;
    this.frame = newFrame();

    this.reset();
  }

  // ---------------------------------------------------------------- lifecycle

  /** Power-on reset, following the datasheet initialisation sequence. */
  reset() {
    this.ddram.fill(0x20); // power-on DDRAM contents are undefined; spaces read best
    this.cgram.fill(0);
    this.ac = 0;
    this.acIsCgram = false;
    this.displayOn = false;
    this.cursorOn = false;
    this.blinkOn = false;
    this.increment = true;
    this.autoShift = false;
    this.shift = 0;
    this.twoLine = true;
    this.font5x10 = false;
    this.busyUntilUs = 0;
    this.frame = newFrame();
    this.command(0x38); // function set: 8-bit, 2 lines, 5x8
    this.command(0x08); // display off
    this.command(0x01); // clear display
    this.command(0x06); // entry mode: increment, no display shift
    this.command(0x0c); // display on, no cursor, no blink
    this.beginFrame();
    return this;
  }

  // ------------------------------------------------------------------ bus I/O

  /**
   * Charge one transferred byte. The controller executes an instruction while
   * the host is already clocking out the next one, so an operation costs the
   * longer of the two, not their sum: on I2C the wire dominates, on a parallel
   * bus the 39/43 us execution time does.
   */
  #charge(execUs, bytes = 1) {
    const wire = this.perByteUs * bytes;
    const cost = Math.max(wire, execUs);
    this.frame.busUs += wire;
    this.frame.execUs += execUs;
    this.frame.costUs += cost;
    this.frame.bytes += bytes;
    this.frame.ops += 1;
    this.busyUntilUs += cost;
  }

  /** Write to the instruction register (RS = 0). */
  command(code) {
    code &= 0xff;
    let execUs = T_INSTR;

    if (code & 0x80) {
      // Set DDRAM address
      this.ac = code & 0x7f;
      this.acIsCgram = false;
    } else if (code & 0x40) {
      // Set CGRAM address
      this.ac = code & 0x3f;
      this.acIsCgram = true;
    } else if (code & 0x20) {
      // Function set: DL N F xx
      this.font5x10 = !!(code & 0x04);
      this.twoLine = !!(code & 0x08);
      this.lineAddresses = this.twoLine ? [0x00, 0x40] : [0x00];
    } else if (code & 0x10) {
      // Cursor or display shift: S/C selects the display, R/L the direction.
      if (code & 0x08) this.shift += code & 0x04 ? 1 : -1;
      // cursor-only moves are not modelled: the emulator exposes no cursor register
    } else if (code & 0x08) {
      // Display on/off control: D C B
      this.displayOn = !!(code & 0x04);
      this.cursorOn = !!(code & 0x02);
      this.blinkOn = !!(code & 0x01);
    } else if (code & 0x04) {
      // Entry mode set: I/D S
      this.increment = !!(code & 0x02);
      this.autoShift = !!(code & 0x01);
    } else if (code & 0x02) {
      // Return home: also undoes any display shift (HD44780U datasheet)
      this.ac = 0;
      this.acIsCgram = false;
      this.shift = 0;
      execUs = T_HOME;
    } else if (code & 0x01) {
      // Clear display, which also undoes any display shift
      this.ddram.fill(0x20);
      this.ac = 0;
      this.acIsCgram = false;
      this.increment = true;
      this.shift = 0;
      execUs = T_CLEAR;
    }
    this.#charge(execUs);
    return this;
  }

  /** Write to the data register (RS = 1), advancing the address counter. */
  data(byte) {
    this.#writeRam(this.ac, byte & 0xff);
    this.#advance();
    this.#charge(T_DATA);
    return this;
  }

  #writeRam(addr, byte) {
    if (this.acIsCgram) {
      const a = addr & 0x3f;
      if ((this.cgram[a] & 0x1f) !== (byte & 0x1f)) this.slotVersion[a >> 3]++;
      this.cgram[a] = byte;
    } else {
      const i = this.#ddramIndex(addr);
      if (i < 0) return;
      this.ddram[i] = byte;
      // Remember which version of the slot this cell was drawn against, so
      // report() can catch trap #1: a slot rewritten after a cell showing it
      // was drawn, which silently changes that cell too.
      if (byte < 0x10) this.frame.drawnAgainst.set(i, this.slotVersion[byte & 7]);
      else this.frame.drawnAgainst.delete(i);
    }
  }

  /** Index into `ddram` for a DDRAM address, or -1 for an unbacked address. */
  #ddramIndex(addr) {
    if (addr < LINE_LEN) return addr;
    if (addr >= 0x40 && addr < 0x40 + LINE_LEN) return LINE_LEN + (addr - 0x40);
    return -1;
  }

  /**
   * The address counter walks linearly. In two-line mode it runs off the end
   * of line 1 (0x27) into line 2 (0x40), and off the end of line 2 (0x67)
   * back to 0x00, as the HD44780 does. CGRAM wraps within its 64 bytes.
   */
  #advance() {
    const step = this.increment ? 1 : -1;
    if (this.acIsCgram) {
      this.ac = (this.ac + step + 0x40) % 0x40;
      return;
    }
    // Linearise the two lines into 0..79, step, and map back.
    const lin = this.ac & 0x40 ? LINE_LEN + (this.ac - 0x40) : this.ac;
    const next = (lin + step + 2 * LINE_LEN) % (2 * LINE_LEN);
    this.ac = next < LINE_LEN ? next : 0x40 + (next - LINE_LEN);
  }

  // ------------------------------------------------------------ display state

  /**
   * DDRAM address backing visible cell (col, row). A display shift slides the
   * 16-cell window along the full 40-address line, so shifted cells show
   * addresses 0x10-0x27 that are normally off screen.
   */
  addressOf(col, row) {
    const base = this.lineAddresses[Math.min(row, this.lineAddresses.length - 1)];
    const c = (((col - this.shift) % LINE_LEN) + LINE_LEN) % LINE_LEN;
    return base + c;
  }

  /** Character code shown at a visible cell. */
  codeAt(col, row) {
    return this.ddram[this.#ddramIndex(this.addressOf(col, row))];
  }

  /**
   * Dot rows for one character code. Codes 0x00-0x0F are CGRAM; bit 3 is
   * ignored, so 0x08-0x0F show the same eight slots as 0x00-0x07.
   * @returns {number[]} DOT_ROWS entries, bit 4 = leftmost dot.
   */
  glyph(code) {
    if (code < 0x10) {
      const base = (code & 7) * 8;
      return Array.from({ length: DOT_ROWS }, (_, r) => this.cgram[base + r] ?? 0);
    }
    const base = code * this.cgromRows;
    return Array.from({ length: DOT_ROWS }, (_, r) => this.cgrom[base + r] ?? 0);
  }

  // ------------------------------------------------------------- design-facing

  /** Move the address counter to a visible cell. */
  setCursor(col, row) {
    return this.command(0x80 | this.addressOf(col, row));
  }

  /** Write a string from the current cursor position. */
  print(text) {
    for (const ch of String(text)) this.data(ch.codePointAt(0) & 0xff);
    return this;
  }

  /** Write a string at an absolute cell. */
  textAt(col, row, text) {
    this.setCursor(col, row);
    return this.print(text);
  }

  /** Fill the whole display with a character code. */
  fill(code = 0x20) {
    for (let row = 0; row < this.rows; row++) {
      this.setCursor(0, row);
      for (let col = 0; col < this.cols; col++) this.data(code);
    }
    return this;
  }

  /**
   * Load one of the eight user-defined glyphs into CGRAM.
   * @param {number} slot 0..7
   * @param {Array<number|string>} rows DOT_ROWS entries: a byte with bit 4 as the
   *   leftmost dot, or a 5-character string such as '.#.#.'.
   */
  defineChar(slot, rows) {
    if (slot < 0 || slot > 7) throw new RangeError(`CGRAM slot must be 0..7, got ${slot}`);
    this.command(0x40 | (slot * 8));
    for (let r = 0; r < DOT_ROWS; r++) this.data(parseRow(rows[r]));
    return this;
  }

  /** Bulk-load all eight slots: `chars[slot]` is an array of DOT_ROWS rows. */
  defineChars(chars) {
    chars.forEach((rows, slot) => this.defineChar(slot, rows));
    return this;
  }

  // ---------------------------------------------------------------- accounting

  /** Start measuring the cost of one animation frame. */
  beginFrame() {
    this.frame = newFrame();
    return this;
  }

  /** Total microseconds the current frame takes to send. */
  frameCostUs() {
    return this.frame.costUs;
  }

  /** Highest sustainable frame rate on the configured bus for the work just done. */
  frameRate() {
    const cost = this.frameCostUs();
    return cost > 0 ? 1e6 / cost : Infinity;
  }

  /** Human-readable feasibility report for the frame just issued. */
  report() {
    const totalUs = this.frameCostUs();
    const fps = this.frameRate();
    const { drawnAgainst, ...counts } = this.frame;
    const hazards = new Set();
    for (const [i, version] of drawnAgainst) {
      const slot = this.ddram[i] & 7;
      if (this.slotVersion[slot] !== version) hazards.add(slot);
    }
    return {
      ...counts,
      /** CGRAM slots rewritten after a cell showing them was drawn this frame. */
      hazards: [...hazards].sort(),
      totalUs,
      fps,
      verdict: fps >= 60 ? 'comfortable' : fps >= 25 ? 'workable' : fps >= 10 ? 'sluggish' : 'too slow',
      bus: BUSES[this.bus].label,
    };
  }
}

function newFrame() {
  return { busUs: 0, execUs: 0, costUs: 0, bytes: 0, ops: 0, drawnAgainst: new Map() };
}

/** Accept either a byte or a '.#.#.' style string for one glyph row. */
export function parseRow(row) {
  if (typeof row === 'number') return row & 0x1f;
  const s = String(row);
  let b = 0;
  for (let i = 0; i < DOT_COLS; i++) if (s[i] === '#' || s[i] === '1' || s[i] === '*') b |= 0x10 >> i;
  return b;
}

export { CGROM_A00, CGROM_ROWS };