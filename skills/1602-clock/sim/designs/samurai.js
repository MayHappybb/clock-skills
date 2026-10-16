// Samurai — work in progress (glyph sheet).

import { clockFields } from '../js/kit.js';

const pic = (s) => s.trim().split('\n').map((l) => l.trim());

// ------------------------------------------------------------- minute digits
// 5x16 brush numerals, built from a top half and a bottom half that meet at
// the row seam. Characters 1-3 are the stroke each dot belongs to (the order
// the digit is inked in); '.' is empty.
const TOP = {
  0: pic(`
    .111.
    11.11
    11..1
    11..1
    11..1
    11..1
    11..1
    11..1`),
  1: pic(`
    ..11.
    .111.
    1.11.
    ..11.
    ..11.
    ..11.
    ..11.
    ..11.`),
  2: pic(`
    .111.
    11.11
    ...11
    ...11
    ...11
    ..11.
    ..11.
    .11..`),
  3: pic(`
    1111.
    ...11
    ...11
    ...11
    ...11
    ..11.
    .222.
    ...22`),
  4: pic(`
    ...11
    ..111
    .1.11
    .1.11
    1..11
    1..11
    22222
    ...11`),
  5: pic(`
    11111
    11...
    11...
    11...
    11...
    2222.
    ...22
    ...22`),
  6: pic(`
    ..111
    .11..
    11...
    11...
    11...
    11...
    11222
    11..2`),
  7: pic(`
    11111
    1..11
    ...11
    ..11.
    ..11.
    ..11.
    .11..
    .11..`),
  8: pic(`
    .111.
    11.11
    11..1
    .1.11
    ..11.
    .2.22
    22..2
    22..2`),
  9: pic(`
    .111.
    11.11
    11..1
    11..1
    11..1
    .1111
    ...11
    ...11`),
};
const BOT = {
  U: pic(`
    22..2
    22..2
    22..2
    22..2
    22..2
    22.22
    .222.
    .....`),
  J: pic(`
    ...22
    ...22
    ...22
    ...22
    ...22
    3..22
    .333.
    .....`),
  B1: pic(`
    ..22.
    ..22.
    ..22.
    ..22.
    ..22.
    ..22.
    .2222
    .....`),
  B2: pic(`
    .22..
    22...
    22...
    22...
    22...
    22..3
    33333
    .....`),
  B4: pic(`
    ...22
    ...22
    ...22
    ...22
    ...22
    ...22
    ...22
    .....`),
  B7: pic(`
    .22..
    .22..
    .22..
    .22..
    .22..
    .22..
    .22..
    .....`),
};
const DIGIT_BOT = ['U', 'B1', 'B2', 'J', 'B4', 'J', 'U', 'B7', 'U', 'J'];
const DIGIT = (d) => [...TOP[d], ...BOT[DIGIT_BOT[d]]];

// ------------------------------------------------------------------- scene
class Scene {
  constructor() {
    this.code = Array(32).fill(0x20);
    this.bits = Array(32).fill(null);
    this.pri = Array(32).fill(0);
    this.fb = Array(32).fill(0x20);
  }
  rom(col, row, code) {
    if (col < 0 || col > 15 || row < 0 || row > 1) return;
    const i = row * 16 + col;
    this.code[i] = code; this.bits[i] = null; this.fb[i] = code;
  }
  dot(x, y, pri, on = true) {
    const col = Math.floor(x / 6), dx = x - col * 6;
    if (dx > 4 || col < 0 || col > 15 || y < 0 || y > 15) return;
    const i = (y >> 3) * 16 + col;
    if (!this.bits[i]) { this.bits[i] = Array(8).fill(0); this.fb[i] = this.code[i]; }
    const m = 0x10 >> dx;
    if (on) this.bits[i][y & 7] |= m; else this.bits[i][y & 7] &= ~m;
    this.pri[i] = Math.max(this.pri[i], pri);
  }
  /** rows: strings; any char but '.' and ' ' is a dot. keep(ch) filters. */
  sprite(rows, x, y, pri, flip = false, keep = null) {
    const w = Math.max(...rows.map((r) => r.length));
    rows.forEach((line, r) => [...line].forEach((ch, i) => {
      if (ch === '.' || ch === ' ') return;
      if (keep && !keep(ch, i, r)) return;
      this.dot(x + (flip ? w - 1 - i : i), y + r, pri);
    }));
  }
  draw(lcd) {
    const groups = new Map();
    this.bits.forEach((b, i) => {
      if (!b) return;
      if (b.every((v) => v === 0)) { this.bits[i] = null; this.code[i] = 0x20; return; }
      if (b.every((v) => v === 0x1f)) { this.bits[i] = null; this.code[i] = 0xff; return; }
      const k = b.join(',');
      const g = groups.get(k) ?? { b, pri: 0, cells: [] };
      g.pri = Math.max(g.pri, this.pri[i]); g.cells.push(i); groups.set(k, g);
    });
    const order = [...groups.values()].sort((a, b) => b.pri - a.pri);
    this.overflow = Math.max(0, order.length - 8);
    const out = this.code.slice();
    order.forEach((g, slot) => {
      if (slot < 8) { lcd.defineChar(slot, g.b); g.cells.forEach((i) => { out[i] = slot; }); }
      else g.cells.forEach((i) => { out[i] = this.fb[i]; });
    });
    for (let row = 0; row < 2; row++) {
      lcd.setCursor(0, row);
      for (let c = 0; c < 16; c++) lcd.data(out[row * 16 + c]);
    }
  }
}

export default {
  name: 'Samurai',
  blurb: 'Placeholder.',
  bus: 'i2c100',
  panel: 'green',
  fps: 10,
  frame(lcd, api, { date, fields }) {
    const sc = new Scene();
    const base = fields.m % 3 * 4; // glyph sheet: four digits per minute
    for (let k = 0; k < 4; k++) {
      const d = (base + k) % 10;
      sc.sprite(DIGIT(d), (2 + k * 3) * 6, 0, 100);
    }
    sc.draw(lcd);
  },
};
