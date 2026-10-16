// bullethell: sprites and palettes. Hard pixels throughout the bullets and
// the ship (a sprite game); the boss's magic circle is the one AA element,
// because it turns.
import { sprite, mix, hex } from '../js/kit.js';

const WHITE = 0xffffff;

// Per pattern: decoy colours, the numeral colour that fights them, the
// spell background's base and nebula tones.
export const PAL = [
  { dec: [hex('#9a72ff'), hex('#4f8cff')], dig: hex('#ffc93c'), bg: hex('#0e0722'), neb: hex('#3a1a72') },
  { dec: [hex('#ff4458'), hex('#ff8ac8')], dig: hex('#3fe6ff'), bg: hex('#1a0612'), neb: hex('#5c1236') },
  { dec: [hex('#48ec84'), hex('#e0f040')], dig: hex('#ff4fb0'), bg: hex('#041614'), neb: hex('#0c4a3a') },
  { dec: [hex('#40d0ff'), hex('#90fff0')], dig: hex('#ff8a30'), bg: hex('#060e24'), neb: hex('#143e70') },
];

const cache = new Map();
const memo = (k, make) => { let s = cache.get(k); if (!s) { s = make(); cache.set(k, s); } return s; };

/** The numerals' bullet: a 5 px orb, white-hot core, coloured body, saturated rim. */
export const orb5 = (c) => memo('o' + c, () => sprite(`
  .rrr.
  rmmmr
  rmwmr
  rmmmr
  .rrr.`, { r: c, m: mix(c, WHITE, 0.5), w: WHITE }));

/** Numeral bullet catching the light (the glint that sweeps the frozen time). */
export const orb5hot = (c) => memo('h' + c, () => sprite(`
  .mmm.
  mwwwm
  mwwwm
  mwwwm
  .mmm.`, { m: mix(c, WHITE, 0.6), w: WHITE }));

/** The dark moat each numeral bullet sits in, so decoys behind it never touch its outline. */
export const HALO = sprite(`
  ..sss..
  .sssss.
  sssssss
  sssssss
  sssssss
  .sssss.
  ..sss..`, { s: 0x000000 });

/** A faint copy one step back along a flying bullet's path. */
export const trail = (c) => memo('t' + c, () => sprite(`
  .r.
  rrr
  .r.`, { r: mix(c, 0x000000, 0.35) }));

/** Decoys: small and darker-cored, so the numerals stay the brightest thing on the glass. */
export const decoy = (shape, c) => memo('d' + shape + '_' + c, () => {
  const core = mix(c, WHITE, 0.3);
  if (shape === 0) return sprite(`
    .r.
    rwr
    .r.`, { r: c, w: core });
  if (shape === 1) return sprite(`
    .rr.
    r..r
    r..r
    .rr.`, { r: c });
  return sprite(`
    .rr.
    rwwr
    rwwr
    .rr.`, { r: mix(c, 0x000000, 0.15), w: core });
});

/** Items: blue point items from decoys, red power items from the numerals. */
export const ITEM_POINT = sprite(`
  bbb
  bwb
  bbb`, { b: hex('#3a6cff'), w: hex('#d8e4ff') });
export const ITEM_POWER = sprite(`
  rrr
  rwr
  rrr`, { r: hex('#ff3040'), w: hex('#ffe0e0') });

/** The ship, nose right: silver hull, blue canopy, red fins. */
export const SHIP = sprite(`
  .ff.....
  .hhh....
  hbbbhwc.
  hbbbbbwk
  hbbbhwc.
  .hhh....
  .ff.....`, { f: hex('#e8404a'), h: hex('#9aa6c0'), b: hex('#e8eef8'), w: hex('#4ab8ff'), c: hex('#2a5aa8'), k: WHITE });
export const FLAME = [
  sprite(`
    yo
    oy`, { y: hex('#fff07a'), o: hex('#ff8a20') }),
  sprite(`
    .o
    yy`, { y: hex('#fff07a'), o: hex('#ff8a20') }),
];

/** Boss colour by hour: each hour's boss is a different being. */
export const BOSS = ['#ff5a8a', '#6ae0ff', '#ffd04a', '#b88cff', '#5aff9a', '#ff8a4a'].map(hex);
