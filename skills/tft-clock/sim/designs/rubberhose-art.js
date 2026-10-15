// Small hand-drawn sprites for "rubberhose": eyes, gloves, shoes, notes,
// puffs. Every sprite is two-tone: '#' ink, 'o' ground (opaque), '.' clear.
import { sprite, to565 } from '../js/kit.js';

export const INK_C = 0x141210, GROUND_C = 0xefe6cf;
export const INK = to565(INK_C), GROUND = to565(GROUND_C);
const P = { '#': INK_C, o: GROUND_C };
const sp = (s) => sprite(s, P);

// white gloves: open palm (left hand, thumb up-right) and a pointing fist
export const GLOVE = sp(`
  .####..
  #oooo#.
  #oooo##
  #oo#oo#
  #oooo#.
  .#oo#..
  ..##...`);
export const GLOVE_UP = sp(`
  .#.#.#.
  #o#o#o#
  #ooooo#
  #ooooo#
  .#ooo#.
  ..###..
  ..#o#..`);

// big shoes (toe to the left; flip for the right foot); ankle at column 6
export const SHOE = sp(`
  ...#####.
  .##o#####
  #########
  #########
  .#######.`);
export const SHOE_ANKLE = 6;

// notes: ink cores, given a ground-coloured outline so they read on anything
function outlined(core) {
  const rows = core.trim().split('\n').map((r) => r.trim());
  const h = rows.length + 2, w = Math.max(...rows.map((r) => r.length)) + 2;
  const at = (x, y) => (y >= 1 && y <= rows.length && rows[y - 1][x - 1] === '#');
  const out = [];
  for (let y = 0; y < h; y++) {
    let line = '';
    for (let x = 0; x < w; x++) {
      if (at(x, y)) { line += '#'; continue; }
      let near = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy)) near = true;
      line += near ? 'o' : '.';
    }
    out.push(line);
  }
  return sp(out);
}
export const NOTE = outlined(`
  ...#..
  ...##.
  ...#.#
  ...#..
  .###..
  ####..
  .##...`);
export const NOTES2 = outlined(`
  ...#######
  ...#######
  ...#.....#
  ...#.....#
  .###...###
  ####..####
  .##....##.`);

// a dust puff (three sizes)
export const PUFF = [sp(`
  .##.
  #oo#
  .##.`), sp(`
  ..##..
  .#oo##
  #oooo#
  .####.`), sp(`
  ..###...
  .#ooo##.
  #oooooo#
  #oooooo#
  .######.`)];

// a star of impact (heel click, ball hit)
export const STAR = sp(`
  ...#...
  ...#...
  ##.#.##
  ..###..
  ##.#.##
  ...#...
  ...#...`);

// a tiny tulip head
export const TULIP = sp(`
  #.#.#
  #o#o#
  #ooo#
  .###.`);
