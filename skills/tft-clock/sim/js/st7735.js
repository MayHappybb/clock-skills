// ST7735S controller emulator: runs the bytes firmware sends over SPI.
//
// The chip holds a 132 x 162 frame memory, 18 bits a pixel (6 per channel),
// and scans it onto the glass on its own oscillator, one gate line after
// another, whatever the bus is doing. The host writes a window of it: CASET
// and RASET set the window, RAMWR streams pixels into it. MADCTL decides how
// the window's columns and rows map onto the memory (rotation and mirror),
// which way the panel refreshes, and whether data goes out as RGB or BGR.
//
// What is modelled: the commands below, the window and its wrap, MADCTL's
// address mapping, COLMOD (12/16/18-bit), inversion, idle (8-colour) mode,
// display and sleep, the gamma curve select, the frame-rate registers, and
// the time every byte takes on the wire, so a frame's cost and the instant
// each pixel lands are known (the tearing model in player.js uses them).
// Facts and their sources: references/hardware.md.

/**
 * SPI clocks. The datasheet's minimum write cycle (66 ns) rates the chip at
 * 15 MHz; boards like this one run 20-40 MHz in practice (hardware.md).
 */
export const BUSES = {
  spi15: { label: 'SPI 15 MHz (datasheet rating)', hz: 15e6 },
  spi20: { label: 'SPI 20 MHz', hz: 20e6 },
  spi27: { label: 'SPI 26.7 MHz', hz: 80e6 / 3 },
  spi40: { label: 'SPI 40 MHz', hz: 40e6 },
};

/** Fixed cost of one SPI transaction in ESP-IDF (queue, CS, DMA set-up), µs. An estimate. */
export const TRANSACTION_US = 8;

export const RAM_W = 132, RAM_H = 162;

export const CMD = {
  NOP: 0x00, SWRESET: 0x01, SLPIN: 0x10, SLPOUT: 0x11, PTLON: 0x12, NORON: 0x13,
  INVOFF: 0x20, INVON: 0x21, GAMSET: 0x26, DISPOFF: 0x28, DISPON: 0x29,
  CASET: 0x2a, RASET: 0x2b, RAMWR: 0x2c, PTLAR: 0x30, SCRLAR: 0x33, TEOFF: 0x34, TEON: 0x35,
  MADCTL: 0x36, VSCSAD: 0x37, IDMOFF: 0x38, IDMON: 0x39, COLMOD: 0x3a,
  FRMCTR1: 0xb1, FRMCTR2: 0xb2, FRMCTR3: 0xb3, INVCTR: 0xb4,
  PWCTR1: 0xc0, PWCTR2: 0xc1, PWCTR3: 0xc2, PWCTR4: 0xc3, PWCTR5: 0xc4, VMCTR1: 0xc5,
  GMCTRP1: 0xe0, GMCTRN1: 0xe1,
};
const NAMES = Object.fromEntries(Object.entries(CMD).map(([k, v]) => [v, k]));
export const cmdName = (c) => NAMES[c] ?? `0x${c.toString(16).padStart(2, '0')}`;

/** Commands that are accepted and only stored (power, gamma tables): they do not change the picture in this model. */
const STORED = new Set([CMD.FRMCTR2, CMD.FRMCTR3, CMD.INVCTR, CMD.PWCTR1, CMD.PWCTR2, CMD.PWCTR3,
  CMD.PWCTR4, CMD.PWCTR5, CMD.VMCTR1, CMD.GMCTRP1, CMD.GMCTRN1, CMD.NOP]);

/** Register state after a hardware or software reset (datasheet reset table). */
export function resetRegisters() {
  return {
    sleep: true, displayOn: false, inverse: false, idle: false, partial: false,
    madctl: 0x00, colmod: 0x06, gamma: 1, te: false,
    xs: 0, xe: RAM_W - 1, ys: 0, ye: RAM_H - 1,
    frmctr1: [0x05, 0x3a, 0x3a],
  };
}

export class ST7735 {
  constructor({ bus = 'spi40' } = {}) {
    if (!BUSES[bus]) throw new Error(`unknown bus '${bus}' (have: ${Object.keys(BUSES).join(', ')})`);
    this.bus = bus;
    this.hz = BUSES[bus].hz;
    /** Frame memory: one entry per pixel, 0x00RRGGBB with 6-bit channels (0..63). */
    this.ram = new Uint32Array(RAM_W * RAM_H);
    // Power-on memory is random on the chip; a fixed pattern keeps renders reproducible.
    for (let i = 0; i < this.ram.length; i++) this.ram[i] = (i * 2654435761) >>> 8 & 0x3f3f3f;
    this.r = resetRegisters();
    this.warnings = [];
    this.beginFrame();
  }

  /** Start costing a new frame: the clock restarts at 0 µs. */
  beginFrame() {
    this.us = 0;
    this.bytes = 0;
    this.transactions = 0;
    this.pixels = 0;
    this.ramBefore = this.ram.slice();
    /** µs into the frame when each memory cell was last written; -1 if not this frame. */
    this.writeAt = new Float32Array(RAM_W * RAM_H).fill(-1);
    /** Register snapshots with the time they took effect, for the tearing model. */
    this.regLog = [{ at: 0, r: { ...this.r } }];
  }

  /** Time for n bytes on the wire, µs. */
  wire(n) { return (n * 8 * 1e6) / this.hz; }

  /**
   * One command with its parameter bytes, as one transaction (DC low for the
   * command byte, high for the parameters). RAMWR takes its pixel bytes
   * separately: ramwr().
   */
  command(c, ...params) {
    if (params.length === 1 && params[0]?.length !== undefined) params = [...params[0]];
    this.transactions++;
    this.us += TRANSACTION_US + this.wire(1 + params.length);
    this.bytes += 1 + params.length;
    this.apply(c, params);
    return this;
  }

  /** A sequence of [cmd, ...params] entries; anything else (a delay) is skipped. */
  run(seq) {
    for (const s of seq) if (Array.isArray(s)) this.command(s[0], ...s.slice(1));
    return this;
  }

  apply(c, p) {
    const r = this.r;
    switch (c) {
      case CMD.SWRESET: Object.assign(r, resetRegisters()); break;
      case CMD.SLPIN: r.sleep = true; break;
      case CMD.SLPOUT: r.sleep = false; break;
      case CMD.NORON: r.partial = false; break;
      case CMD.PTLON: r.partial = true; this.warn('partial mode is not modelled'); break;
      case CMD.INVOFF: r.inverse = false; break;
      case CMD.INVON: r.inverse = true; break;
      case CMD.GAMSET: r.gamma = p[0] ?? 1; break;
      case CMD.DISPOFF: r.displayOn = false; break;
      case CMD.DISPON: r.displayOn = true; break;
      case CMD.IDMOFF: r.idle = false; break;
      case CMD.IDMON: r.idle = true; break;
      case CMD.TEOFF: r.te = false; break;
      case CMD.TEON: r.te = true; break;
      case CMD.MADCTL: r.madctl = p[0] ?? 0; break;
      case CMD.COLMOD: r.colmod = (p[0] ?? 6) & 7; break;
      case CMD.FRMCTR1: r.frmctr1 = [p[0] ?? 1, p[1] ?? 0x2c, p[2] ?? 0x2d]; break;
      case CMD.CASET: r.xs = ((p[0] << 8) | p[1]) >>> 0; r.xe = ((p[2] << 8) | p[3]) >>> 0; break;
      case CMD.RASET: r.ys = ((p[0] << 8) | p[1]) >>> 0; r.ye = ((p[2] << 8) | p[3]) >>> 0; break;
      case CMD.RAMWR: this.ptr = { c: r.xs, r: r.ys }; if (p.length) this.pixelBytes(p); break;
      case CMD.SCRLAR: case CMD.VSCSAD: case CMD.PTLAR: this.warn(`${cmdName(c)} (scrolling / partial area) is not modelled`); break;
      default: if (!STORED.has(c)) this.warn(`command ${cmdName(c)} is not modelled`);
    }
    if (c !== CMD.RAMWR) this.regLog.push({ at: this.us, r: { ...r } });
  }

  warn(msg) { if (!this.warnings.includes(msg)) this.warnings.push(msg); }

  /**
   * RAMWR with its pixel data as one DMA transaction: the command byte, then
   * `bytes` (Uint8Array). ESP-IDF splits transfers larger than the bus's
   * max_transfer_sz into several; `chunk` models that.
   */
  ramwr(bytes, chunk = Infinity) {
    const n = bytes.length;
    const pieces = Math.max(1, Math.ceil(n / chunk));
    this.transactions += pieces;
    this.bytes += 1 + n;
    // The command byte goes first; pixel bytes then land one by one.
    this.us += TRANSACTION_US + this.wire(1);
    this.ptr = { c: this.r.xs, r: this.r.ys };
    this.pixelBytes(bytes, pieces > 1 ? chunk : Infinity);
    return this;
  }

  /** Stream pixel bytes into the window, advancing the clock byte by byte. */
  pixelBytes(bytes, chunk = Infinity) {
    const r = this.r;
    if (!this.ptr) this.ptr = { c: r.xs, r: r.ys };
    const byteUs = this.wire(1);
    let acc = [], sent = 0;
    const land = (rgb6) => {
      const a = this.addressOf(this.ptr.c, this.ptr.r);
      if (a >= 0) { this.ram[a] = rgb6; this.writeAt[a] = this.us; }
      this.pixels++;
      // Window wrap: column first, then row; past the end it starts again.
      if (++this.ptr.c > r.xe) { this.ptr.c = r.xs; if (++this.ptr.r > r.ye) this.ptr.r = r.ys; }
    };
    for (let i = 0; i < bytes.length; i++) {
      this.us += byteUs;
      if (++sent % chunk === 0 && i < bytes.length - 1) this.us += TRANSACTION_US;
      acc.push(bytes[i]);
      if (r.colmod === 5 && acc.length === 2) {
        const v = (acc[0] << 8) | acc[1];
        land(expand565(v));
        acc = [];
      } else if (r.colmod === 6 && acc.length === 3) {
        land(((acc[0] >> 2) << 16) | ((acc[1] >> 2) << 8) | (acc[2] >> 2));
        acc = [];
      } else if (r.colmod === 3 && acc.length === 3) {
        // 12-bit: two pixels in three bytes, 4 bits a channel.
        const p0 = (acc[0] << 4) | (acc[1] >> 4), p1 = ((acc[1] & 15) << 8) | acc[2];
        for (const v of [p0, p1]) land(expand444(v));
        acc = [];
      }
    }
  }

  /**
   * Memory cell (index into ram) for window address (column c, row r) under
   * the current MADCTL, or -1 outside the memory. MX and MY mirror the
   * column and row address; MV exchanges them, so the column counter then
   * walks along the memory's rows.
   */
  addressOf(c, row, madctl = this.r.madctl) {
    const mx = madctl & 0x40, my = madctl & 0x80, mv = madctl & 0x20;
    const cMax = mv ? RAM_H - 1 : RAM_W - 1, rMax = mv ? RAM_W - 1 : RAM_H - 1;
    if (c > cMax || row > rMax) return -1;
    const cc = mx ? cMax - c : c, rr = my ? rMax - row : row;
    const col = mv ? rr : cc, line = mv ? cc : rr;
    return line * RAM_W + col;
  }

  /**
   * Panel refresh rate in Hz for registers r, from FRMCTR1 (normal mode):
   * fosc / ((RTNA x 2 + 40) x (LINE + FPA + BPA + 2)), LINE = 162 gate lines.
   */
  frameRate(r = this.r) {
    const [rtna, fpa, bpa] = r.frmctr1;
    return FOSC / (((rtna & 15) * 2 + 40) * (LINES + (fpa & 63) + (bpa & 63) + 2));
  }

  /** Whether the panel refreshes bottom to top (MADCTL ML). */
  scanReversed(r = this.r) { return !!(r.madctl & 0x10); }

  /** Cost of the frame so far. */
  report() {
    return { bus: this.bus, us: this.us, ms: this.us / 1000, bytes: this.bytes, transactions: this.transactions, pixels: this.pixels };
  }
}

/**
 * Oscillator frequency and line count used by the frame-rate formula. The
 * datasheet never defines LINE; 162 (the gate count) puts every reset
 * default at about 60 Hz (references/hardware.md).
 */
export const FOSC = 850e3;
export const LINES = 162;

/**
 * RGB565 as the chip stores it in 18-bit memory: 5-bit red and blue become
 * 6 bits. The chip does this through a lookup table (RGBSET) whose power-on
 * contents are undocumented; repeating the top bit into the bottom is the
 * model here (an assumption, see hardware.md). Green is already 6 bits.
 */
export function expand565(v) {
  const r = (v >> 11) & 31, g = (v >> 5) & 63, b = v & 31;
  return (((r << 1) | (r >> 4)) << 16) | (g << 8) | ((b << 1) | (b >> 4));
}

function expand444(v) {
  const e = (x) => (x << 2) | (x >> 2);
  return (e((v >> 8) & 15) << 16) | (e((v >> 4) & 15) << 8) | e(v & 15);
}
