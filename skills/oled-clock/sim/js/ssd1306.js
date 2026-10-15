// SSD1306 / SH1106 dot-matrix OLED controller emulator.
//
// What it models, and why it matters for a design (sources in
// references/hardware.md; "S11" is the SSD1306 datasheet Rev 1.1, "SH23" the
// SH1106 datasheet V2.3):
//   - GDDRAM as the chip holds it: 8 pages of 8 rows, one byte per column per
//     page, D0 at the top (S11 §8.7). 128 columns on the SSD1306, 132 on the
//     SH1106.
//   - the command set, byte for byte, including multi-byte commands, so an
//     init sequence or a hardware trick can be checked by running it.
//   - the three addressing modes and how the pointers wrap (S11 §10.1.3).
//     The SH1106 has page addressing only (SH23 p31).
//   - segment remap (0xA0/0xA1) applied when data is WRITTEN, not when it is
//     shown: "only affects subsequent data input" (S11 §10.1.8). So RAM here
//     is stored in SEG order.
//   - how RAM reaches the glass: start line, display offset, multiplex ratio,
//     COM scan direction (immediate, S11 §10.1.14) and the COM pin
//     configuration (S11 Tables 10-1..10-3). A wrong 0xDA interleaves the
//     image here as it does on the bench.
//   - contrast, inverse, entire-display-on, display on/off, charge pump.
//   - continuous horizontal scroll (0x26/0x27, 0x2E/0x2F), SSD1306 only.
//   - the panel refresh rate from the oscillator settings (S11 §8.3), and
//     when each row is scanned, so tearing can be shown.
//   - what every byte costs on the wire (see BUSES), and when each RAM byte
//     landed, for the tearing model.
//
// The SSD1309 (2.42" modules) is close to the SSD1306 but differs in its
// scroll interval codes, its frame timing and its supply; it is not modelled.

/**
 * Per-chip facts.
 * `fosc(n)` is the typical oscillator frequency in kHz for 0xD5 A[7:4] = n.
 * SSD1306: read off the Fosc-vs-setting graph in datasheet Rev 1.5 (Fig 10-7;
 * Rev 1.1 lacks it), +-5 kHz reading error, with n = 8 set to the 370 kHz
 * typical of Table 13-1. SH1106: 360 kHz typ at the reset setting 5, in 5%
 * steps from -25% at 0 to +50% at 15 (SH23 p25, p36).
 */
const SSD1306_FOSC = [270, 280, 290, 300, 316, 326, 338, 352, 370, 390, 408, 430, 450, 477, 505, 535];
export const CHIPS = {
  ssd1306: {
    label: 'SSD1306', ramCols: 128, hasAddressingModes: true, hasScroll: true,
    reset: { contrast: 0x7f, foscSetting: 8, vcomh: 0x20, chargePump: false },
    fosc: (n) => SSD1306_FOSC[n],
    minMux: 16, maxSpiHz: 10e6,
  },
  sh1106: {
    label: 'SH1106', ramCols: 132, hasAddressingModes: false, hasScroll: false,
    reset: { contrast: 0x80, foscSetting: 5, vcomh: 0x35, chargePump: true },
    fosc: (n) => 360 * (0.75 + 0.05 * n),
    minMux: 1, maxSpiHz: 4e6,
  },
};

/**
 * Buses, and what a byte costs on each.
 *
 * I2C: every byte is 9 clocks (8 data + ACK). A write transaction is START,
 * the address byte, a control byte (0x00 commands, 0x40 data), the payload,
 * STOP (S11 §8.1.5.1). Drivers split frame data into transactions because the
 * MCU's I2C buffer is small: Adafruit_SSD1306 on AVR sends 31 data bytes per
 * transaction (a 32-byte Wire buffer less the control byte). START + STOP
 * are counted as 2 clocks. MCU overhead between transactions is not counted,
 * so real hardware is somewhat slower. Both chips are specified to 400 kHz
 * (S11 Table 13-6, SH23 p43).
 *
 * SPI (4-wire): 8 clocks a byte, D/C# on its own pin. SSD1306 to 10 MHz
 * (S11 Table 13-4); SH1106 to 4 MHz at 2.4-3.5 V (SH23 p41).
 */
export const BUSES = {
  i2c100: { label: 'I2C 100 kHz', kind: 'i2c', hz: 100e3, chunk: 31 },
  i2c400: { label: 'I2C 400 kHz', kind: 'i2c', hz: 400e3, chunk: 31 },
  i2c1000: { label: 'I2C 1 MHz (out of spec)', kind: 'i2c', hz: 1e6, chunk: 31 },
  spi4: { label: 'SPI 4 MHz', kind: 'spi', hz: 4e6 },
  spi8: { label: 'SPI 8 MHz', kind: 'spi', hz: 8e6 },
  spi10: { label: 'SPI 10 MHz', kind: 'spi', hz: 10e6 },
};

/** Time on the wire for one transaction carrying `n` payload bytes, in µs. */
export function transactionUs(bus, n) {
  const b = BUSES[bus];
  if (b.kind === 'spi') return (n * 8 * 1e6) / b.hz;
  return ((9 * (2 + n) + 2) * 1e6) / b.hz;
}

/**
 * Horizontal scroll step interval, in frames, for the 3-bit code in the
 * scroll setup commands (S11 p28-29). The SSD1309's table differs.
 */
export const SCROLL_INTERVAL = [5, 64, 128, 256, 3, 4, 25, 2];

export class OLED {
  /**
   * @param {object} opts
   * @param {string} [opts.chip] key of CHIPS
   * @param {string} [opts.bus] key of BUSES
   */
  constructor({ chip = 'ssd1306', bus = 'i2c400' } = {}) {
    if (!CHIPS[chip]) throw new Error(`unknown chip ${chip} (have: ${Object.keys(CHIPS).join(', ')})`);
    if (!BUSES[bus]) throw new Error(`unknown bus ${bus} (have: ${Object.keys(BUSES).join(', ')})`);
    this.chip = chip;
    this.spec = CHIPS[chip];
    this.bus = bus;
    this.ramCols = this.spec.ramCols;
    this.ramRows = 64;
    /** GDDRAM, indexed [page * ramCols + SEG]. */
    this.ram = new Uint8Array(8 * this.ramCols);
    this.reset();
  }

  /** Notes about the bus being outside the chip's specification. */
  busNotes() {
    const b = BUSES[this.bus];
    if (b.kind === 'i2c' && b.hz > 400e3) return [`${b.label} is above the ${this.spec.label}'s 400 kHz I2C maximum`];
    if (b.kind === 'spi' && b.hz > this.spec.maxSpiHz) return [`${b.label} is above the ${this.spec.label}'s ${this.spec.maxSpiHz / 1e6} MHz SPI maximum`];
    return [];
  }

  // ------------------------------------------------------------ state

  /** Hardware reset: register values from the command table's reset column. */
  reset() {
    const z = this.spec.reset;
    this.ram.fill(0);
    this.r = {
      contrast: z.contrast,
      entireOn: false,
      inverse: false,
      displayOn: false,
      mode: 2,              // 0 horizontal, 1 vertical, 2 page
      colStart: 0, colEnd: this.ramCols - 1,
      pageStart: 0, pageEnd: 7,
      startLine: 0,
      segRemap: false,      // 0xA1: column address 127 (131) -> SEG0, for data written from now on
      mux: 64,
      comRemap: false,      // 0xC8: scan from COM[N-1] to COM0
      offset: 0,            // 0xD3
      comAlt: true,         // 0xDA A[4]: alternative COM pin configuration (reset 0x12)
      comLR: false,         // 0xDA A[5]: COM left/right remap (SSD1306 only)
      clockDiv: 1,          // 0xD5 A[3:0] + 1
      foscSetting: z.foscSetting, // 0xD5 A[7:4]
      phase1: 2, phase2: 2, // 0xD9, reset 0x22
      vcomh: z.vcomh,
      chargePump: z.chargePump,
      scroll: null,         // { dir, startPage, endPage, interval } once set up
      scrollOn: false,
    };
    this.col = 0;
    this.page = 0;
    this.pending = null;    // multi-byte command being collected
    this.frame = newFrame();
    this.warnings = new Set();
    /** Bus time (µs into the frame) at which each RAM byte was last written, or -1. Same index as `ram`. */
    this.writeAt = new Float64Array(this.ram.length).fill(-1);
    /** RAM as it was when the frame began, for diffing and tearing. */
    this.ramBefore = Uint8Array.from(this.ram);
    /** Register snapshots taken during the frame, for the tearing model. */
    this.regLog = [];
    /** Set by 0x2E after an active scroll: RAM must be rewritten (S11 p29). */
    this.ramStale = false;
    return this;
  }

  /** Start costing a new frame. RAM and registers carry over, as on the chip. */
  beginFrame() {
    this.frame = newFrame();
    this.writeAt.fill(-1);
    this.ramBefore = Uint8Array.from(this.ram);
    this.regLog = [{ at: 0, r: { ...this.r } }];
    this.warnings = new Set();
    return this;
  }

  /** Frame cost summary. `fps` is the most the bus allows at this cost. */
  report() {
    const us = this.frame.busUs;
    return {
      bus: BUSES[this.bus].label,
      busUs: us,
      totalUs: us,
      bytes: this.frame.bytes,
      ramBytes: this.frame.ramBytes,
      transactions: this.frame.transactions,
      fps: us > 0 ? 1e6 / us : Infinity,
      warnings: [...this.warnings],
      notes: this.busNotes(),
    };
  }

  // ------------------------------------------------------------ bus

  /** Send command bytes in one transaction (control byte 0x00 on I2C; D/C# low on SPI). */
  commands(...bytes) {
    bytes = bytes.flat();
    if (!bytes.length) return this;
    this.#charge(bytes.length, false);
    for (const b of bytes) this.#commandByte(b & 0xff);
    this.regLog.push({ at: this.frame.busUs, r: { ...this.r } });
    return this;
  }

  /** Send display data, split into transactions as the bus driver would. */
  data(bytes) {
    const b = BUSES[this.bus];
    const chunk = b.kind === 'i2c' ? b.chunk : bytes.length;
    for (let i = 0; i < bytes.length; i += chunk) {
      const part = bytes.slice(i, i + chunk);
      const t0 = this.frame.busUs;
      const per = transactionUs(this.bus, part.length) / part.length;
      this.#charge(part.length, true);
      part.forEach((v, j) => this.#dataByte(v & 0xff, t0 + per * (j + 1)));
    }
    return this;
  }

  #charge(n, isData) {
    this.frame.busUs += transactionUs(this.bus, n);
    this.frame.bytes += n + (BUSES[this.bus].kind === 'i2c' ? 2 : 0);
    if (isData) this.frame.ramBytes += n;
    this.frame.transactions += 1;
  }

  // ------------------------------------------------------------ RAM

  /** The SEG a column address is stored at, under the current remap. */
  segOf(col, r = this.r) {
    return r.segRemap ? this.ramCols - 1 - col : col;
  }

  /** The RAM byte at (page, column address), as a write there now would address it. */
  ramByte(page, col) {
    return this.ram[page * this.ramCols + this.segOf(col)];
  }

  /** A RAM pixel by column address and RAM row (0-63). */
  ramPixel(col, y) {
    return (this.ramByte(y >> 3, col) >> (y & 7)) & 1;
  }

  #dataByte(v, at) {
    if (this.r.scrollOn) this.warnings.add('RAM written while scrolling is active: the datasheet prohibits it (send 0x2E first)');
    const i = this.page * this.ramCols + this.segOf(this.col);
    this.ram[i] = v;
    this.writeAt[i] = at;
    const r = this.r;
    if (r.mode === 2 || !this.spec.hasAddressingModes) {
      // Page mode: the column advances and wraps; the page does not change.
      // (Where it wraps to is not specified; 0 is assumed. SH23 p19, S11 p34.)
      this.col = this.col >= this.ramCols - 1 ? 0 : this.col + 1;
    } else if (r.mode === 0) {
      if (this.col >= r.colEnd) {
        this.col = r.colStart;
        this.page = this.page >= r.pageEnd ? r.pageStart : this.page + 1;
      } else this.col++;
    } else {
      if (this.page >= r.pageEnd) {
        this.page = r.pageStart;
        this.col = this.col >= r.colEnd ? r.colStart : this.col + 1;
      } else this.page++;
    }
  }

  // ------------------------------------------------------------ commands

  #commandByte(b) {
    if (this.pending) {
      this.pending.args.push(b);
      if (this.pending.args.length >= this.pending.need) {
        const { op, args } = this.pending;
        this.pending = null;
        this.#apply(op, args);
      }
      return;
    }
    const need = this.#argCount(b);
    if (need > 0) this.pending = { op: b, need, args: [] };
    else this.#apply(b, []);
  }

  /** Parameter bytes that follow each command (S11 Table 9-1 and Rev 1.5; SH23 command table). */
  #argCount(b) {
    if (this.chip === 'sh1106') {
      if ([0x81, 0xa8, 0xd3, 0xd5, 0xd9, 0xda, 0xdb, 0xad].includes(b)) return 1;
      return 0;
    }
    if ([0x81, 0x20, 0xa8, 0xd3, 0xd5, 0xd9, 0xda, 0xdb, 0x8d, 0x23, 0xd6].includes(b)) return 1;
    if ([0x21, 0x22, 0xa3].includes(b)) return 2;
    if (b === 0x26 || b === 0x27) return 6;
    if (b === 0x29 || b === 0x2a) return 5;
    return 0;
  }

  #apply(op, a) {
    const r = this.r, sh = this.chip === 'sh1106';
    if (op <= 0x0f) { this.col = (this.col & 0xf0) | op; return; }
    if (op >= 0x10 && op <= 0x1f) { this.col = Math.min(this.ramCols - 1, ((op & 0x0f) << 4) | (this.col & 0x0f)); return; }
    if (op >= 0x40 && op <= 0x7f) { r.startLine = op & 0x3f; return; }
    if (op >= 0xb0 && op <= 0xb7) { this.page = op & 7; return; }
    switch (op) {
      case 0x81: r.contrast = a[0]; return;
      case 0xa4: r.entireOn = false; return;
      case 0xa5: r.entireOn = true; return;
      case 0xa6: r.inverse = false; return;
      case 0xa7: r.inverse = true; return;
      case 0xae: r.displayOn = false; return;
      case 0xaf: r.displayOn = true; return;
      case 0xa0: r.segRemap = false; return;
      case 0xa1: r.segRemap = true; return;
      case 0xc0: r.comRemap = false; return;
      case 0xc8: r.comRemap = true; return;
      case 0xa8: {
        const n = (a[0] & 0x3f) + 1;
        if (n < this.spec.minMux) { this.warnings.add(`multiplex ratio ${n} is invalid (${this.spec.minMux}-64)`); return; }
        r.mux = n; return;
      }
      case 0xd3: r.offset = a[0] & 0x3f; return;
      case 0xda:
        r.comAlt = !!(a[0] & 0x10);
        if (sh && a[0] & 0x20) this.warnings.add('the SH1106 has no COM left/right remap (0xDA bit 5)');
        r.comLR = !sh && !!(a[0] & 0x20);
        return;
      case 0xd5: r.clockDiv = (a[0] & 0x0f) + 1; r.foscSetting = a[0] >> 4; return;
      case 0xd9:
        if (!(a[0] & 0x0f) || !(a[0] >> 4)) { this.warnings.add('pre-charge phase of 0 is invalid'); return; }
        r.phase1 = a[0] & 0x0f; r.phase2 = a[0] >> 4; return;
      case 0xdb: r.vcomh = a[0]; return;
      case 0xe3: return; // NOP
    }
    if (!sh) {
      switch (op) {
        case 0x20:
          if ((a[0] & 3) === 3) { this.warnings.add('addressing mode 11b is invalid'); return; }
          r.mode = a[0] & 3; return;
        case 0x21: r.colStart = a[0] & 0x7f; r.colEnd = a[1] & 0x7f; this.col = r.colStart; return;
        case 0x22: r.pageStart = a[0] & 7; r.pageEnd = a[1] & 7; this.page = r.pageStart; return;
        case 0x8d: r.chargePump = !!(a[0] & 0x04); return;
        case 0x26: case 0x27:
          if (r.scrollOn) this.warnings.add('scroll set up while a scroll is active: the datasheet requires 0x2E first');
          if ((a[3] & 7) < (a[1] & 7)) this.warnings.add('scroll end page is before its start page');
          r.scroll = { dir: op === 0x26 ? 1 : -1, startPage: a[1] & 7, interval: SCROLL_INTERVAL[a[2] & 7], endPage: a[3] & 7 };
          return;
        case 0x29: case 0x2a: case 0xa3:
          this.warnings.add(`command 0x${op.toString(16)} (vertical scroll) is parsed but not simulated`); return;
        case 0x2e:
          if (r.scrollOn) this.ramStale = true;
          r.scrollOn = false; return;
        case 0x2f:
          if (!r.scroll) { this.warnings.add('0x2F with no scroll set up'); return; }
          r.scrollOn = true; return;
        case 0x23: case 0xd6:
          this.warnings.add(`command 0x${op.toString(16)} (${op === 0x23 ? 'fade/blink' : 'zoom'}) exists only from SSD1306 Rev 1.2 and is not simulated`); return;
      }
    } else {
      switch (op) {
        case 0xad: r.chargePump = (a[0] & 0x01) === 1; return; // DC-DC: 0x8B on, 0x8A off
        case 0xe0: case 0xee: return; // read-modify-write start/end
      }
      if (op >= 0x30 && op <= 0x33) return; // pump voltage
    }
    this.warnings.add(`unknown ${this.spec.label} command 0x${op.toString(16).padStart(2, '0')}`);
  }

  // ------------------------------------------------------------ scan-out

  /** Panel refresh rate in Hz for the current oscillator settings. */
  frameRate(r = this.r) {
    // Ffrm = Fosc / (D x K x MUX), K = phase1 + phase2 + 50 DCLKs (S11 §8.3).
    const fosc = this.spec.fosc(r.foscSetting) * 1000;
    const K = r.phase1 + r.phase2 + 50;
    return fosc / (r.clockDiv * K * r.mux);
  }

  /** Die pin that COM output `com` (scan order, before remap) comes out of, under 0xDA (S11 Table 10-3). */
  pinOf(com, r = this.r) {
    let pin = r.comAlt ? (com & 1 ? 32 + (com >> 1) : com >> 1) : com;
    if (r.comLR) pin = (pin + 32) & 63;
    return pin;
  }

  /**
   * Row counter value (0 .. mux-1) shown on COM output `com`, or -1 if blank.
   * S11 Tables 10-1/10-2: COM c shows row L = (c + offset) mod 64, or
   * (mux - 1 - c + offset) mod 64 when remapped; L >= mux is blank.
   * The row shows RAM row (L + start line) mod 64.
   */
  rowCounterOf(com, r = this.r) {
    const L = ((((r.comRemap ? r.mux - 1 - com : com) + r.offset) % 64) + 64) % 64;
    return L < r.mux ? L : -1;
  }
}

function newFrame() {
  return { busUs: 0, bytes: 0, ramBytes: 0, transactions: 0 };
}
