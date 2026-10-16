// Miner — prototype: negative digits in rock.
import { TileAllocator } from '../js/kit.js';

const F = 31;
const PART = {
  rock: [F, F, F, F, F, F, F, F],
  hol: [0, 0, 0, 0, 0, 0, 0, 0],
  Vt: [F, 0, 0, 0, 0, 0, 0, 0],
  Vb: [0, 0, 0, 0, 0, 0, 0, F],
  A: [F, 0, 0, F, F, F, F, F],
  G: [F, F, F, F, F, F, 0, 0],
  AG: [F, 0, 0, F, F, F, 0, 0],
  D: [F, F, F, F, 0, 0, 0, F],
};
const DIG = {
  0: ['Vt', 'A', 'Vt', 'Vb', 'D', 'Vb'],
  1: ['rock', 'Vt', 'rock', 'rock', 'Vb', 'rock'],
  2: ['AG', 'AG', 'Vt', 'Vb', 'D', 'D'],
  3: ['AG', 'AG', 'Vt', 'D', 'D', 'Vb'],
  4: ['Vt', 'G', 'Vt', 'rock', 'rock', 'Vb'],
  5: ['Vt', 'AG', 'AG', 'D', 'D', 'Vb'],
  6: ['Vt', 'AG', 'AG', 'Vb', 'D', 'Vb'],
  7: ['A', 'A', 'Vt', 'rock', 'rock', 'Vb'],
  8: ['Vt', 'AG', 'Vt', 'Vb', 'D', 'Vb'],
  9: ['Vt', 'AG', 'Vt', 'D', 'D', 'Vb'],
};


const POSES = `
stand    raise    strike   walk1    walk2    watch    wipe     ears
.##..    ...#.    .##..    .##..    .##..    .##..    .##..    .##..
####.    .##.#    ####.    ####.    ####.    ####.    ####.    ####.
.##..    ####.    .##..    .##..    .##..    .##..    .###.    #..#.
.###.    .##.#    .###.    .##..    .##..    .###.    .##..    .##..
.##.#    .###.    .##.#    .###.    .##..    .####    .##..    ####.
.##.#    .##..    .##.#    .##..    .###.    .##..    .##..    ####.
.#.#.    .#.#.    .#..#    #..#.    .##..    .#.#.    .#.#.    #..#.
`;
function parsePoses(src) {
  const lines = src.trim().split('\n');
  const names = lines[0].trim().split(/\s+/);
  const out = {};
  names.forEach((n, k) => { out[n] = lines.slice(1).map((l) => l.trim().split(/\s+/)[k]); });
  return out;
}
const POSE = parsePoses(POSES);

export default {
  name: 'Miner',
  blurb: 'prototype',
  bus: 'i2c100',
  panel: 'green',
  fps: 10,
  frame(lcd, api, ctx) {
    const f = ctx.fields;
    const h12 = f.h % 12 || 12;
    const g = [0, 1].map(() => Array.from({ length: 16 }, () => PART.rock.slice()));
    if (h12 >= 10) { g[0][1] = PART.Vt.slice(); g[1][1] = PART.Vb.slice(); }
    const put = (c0, d) => DIG[d].forEach((p, i) => { g[i >> 1 ? 1 : 0]; g[Math.floor(i / 3)][c0 + (i % 3)] = PART[p].slice(); });
    put(3, h12 % 10); put(8, Math.floor(f.m / 10)); put(12, f.m % 10);
    if (f.h === 3 && f.m === 33) {
      const names = Object.keys(POSE);
      names.forEach((n, k) => {
        const c = k * 2;
        g[1][c] = PART.Vb.slice(); g[0][c] = PART.Vt.slice();
        POSE[n].forEach((row, r) => { g[1][c][r] = parseInt(row.replace(/#/g, '1').replace(/\./g, '0'), 2); });
      });
    }
    const alloc = new TileAllocator(lcd, 0);
    const codes = g.map((row) => row.map((b) => (b.every((v) => v === F) ? 0xff : b.every((v) => !v) ? 0x20 : alloc.add(b))));
    alloc.flush();
    codes.forEach((row, r) => { lcd.setCursor(0, r); row.forEach((c) => lcd.data(c ?? 0xff)); });
  },
};
