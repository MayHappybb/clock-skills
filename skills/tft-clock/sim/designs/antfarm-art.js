// The animals and things of antfarm.js: hand-drawn 1-bit pixel art, kept
// as offset lists (on the device: const int8 tables in flash, ~2 KB).
//
// A sprite is a list of ink offsets and a list of "clear" offsets (pixels
// forced to ground: a halo for things in front of the sand, the pale body of
// a larva), relative to its anchor.

// ------------------------------------------------------------ the worker

// Hand-drawn in profile, walking on the tunnel floor: east, and north-east
// (climbing). Two gait frames each. The other headings are exact quarter
// turns and mirrors of these, so the legs always point at the wall the ant
// walks on.
const W_E = [`
.##.......#
####.##.##.
###########
.##.#.#.#..
...#..#..#.`, `
.##.......#
####.##.##.
###########
.##..#.#.#.
....#..#..#`];
const W_NE = [`
........#
......##.
.....###.
..##.##..
.####.#..
####.#.#.
.##.#..#.
...#.....
.........`, `
........#
......##.
.....###.
..##.##..
.####.#..
####..##.
.##..#..#
....#....
.........`];

function pic(str) {
  const rows = str.replace(/^\n/, '').split('\n');
  const h = rows.length, w = rows[0].length, cx = (w - 1) >> 1, cy = (h - 1) >> 1, ink = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rows[y][x] === '#') ink.push(x - cx, y - cy);
  return ink;
}
const xf = (ink, f) => { const o = []; for (let i = 0; i < ink.length; i += 2) o.push(...f(ink[i], ink[i + 1])); return o; };
const cw = (x, y) => [-y, x], ccw = (x, y) => [y, -x], mx = (x, y) => [-x, y];
const mk = (ink) => ({ ink: Int8Array.from(ink), clr: new Int8Array(0) });
/** A 1 px ground-colour outline round every ink pixel (8-neighbours), so a sprite reads on any sand. */
function halo(ink, keep = []) {
  const has = new Set();
  for (let i = 0; i < ink.length; i += 2) has.add((ink[i] + 32) * 64 + ink[i + 1] + 32);
  const out = new Set(), clr = [...keep];
  for (let i = 0; i < ink.length; i += 2) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
    const x = ink[i] + k, y = ink[i + 1] + j, key = (x + 32) * 64 + y + 32;
    if (!has.has(key) && !out.has(key)) { out.add(key); clr.push(x, y); }
  }
  return { ink: Int8Array.from(ink), clr: Int8Array.from(clr) };
}
/** All 8 headings from an east and a north-east drawing: E SE S SW W NW N NE. */
function eight(e, ne) {
  const se = xf(ne, cw), s = xf(e, cw), n = xf(e, ccw);
  return [e, se, s, xf(se, mx), xf(e, mx), xf(ne, mx), n, ne];
}

/** WORKER_S[dir][phase]: dir 0 = east, counting clockwise in 45 degree steps (screen y down). */
export const WORKER_S = [0, 1].reduce((acc, p) => {
  eight(pic(W_E[p]), pic(W_NE[p])).forEach((d, i) => { (acc[i] ??= []).push(halo(d)); });
  return acc;
}, []);

// The big worker, for the full-bore galleries of the digits: 15 x 7, with a
// head, a thorax, a waist and a gaster you can tell apart at arm's length.
const B_E = [`
...........##..
.###......#..#.
#####.###.###..
##############.
.###..###.##...
.....#..#..#...
....#...#...#..`, `
...........##..
.###......#..#.
#####.###.###..
##############.
.###..###.##...
......#.#.#....
......#..#.#...`];
const B_NE = [`
...........#
..........#.
........###.
.......####.
......###...
.....###.#..
..##.##.#.#.
.#####.#..#.
######..#...
.####...#...
..##........
............`, `
...........#
..........#.
........###.
.......####.
......###...
.....###....
..##.###.#..
.#####.#.#..
######.#..#.
.####...#...
..##........
............`];
/** BIG_S[dir][phase], haloed. */
export const BIG_S = [0, 1].reduce((acc, p) => {
  eight(pic(B_E[p]), pic(B_NE[p])).forEach((d, i) => { (acc[i] ??= []).push(halo(d)); });
  return acc;
}, []);
// ------------------------------------------------------------ the queen

// In profile, facing east: the great banded gaster, the big thorax with
// its wing scars, a small head. Two states: antennae up, antennae down.
const Q_E = [`
..#####..........###.
.#######........#...#
###.##.##.####.###...
###.##.###########...
###.##.##..###.##....
.#######..#.#.#......
..#####..#..#..#.....
........#...#...#....`, `
..#####..............
.#######.........###.
###.##.##.####.###..#
###.##.###########...
###.##.##..###.##....
.#######..#.#.#......
..#####..#..#..#.....
........#...#...#....`];
/** QUEEN_S[facing 0 east, 1 west][antennae up, down]. */
export const QUEEN_S = [0, 1].map((m) => Q_E.map((q) => { const e = pic(q); return halo(m ? xf(e, mx) : e); }));

// ------------------------------------------------------------ the winged ones (the hour)

// Seen from above, flying up the glass: wings out, wings back. Haloed with
// ground so they read in front of the sand.
const AL = [`
......#.#......
.......#.......
......###......
.###..###..###.
#ooo#.###.#ooo#
#oooo#####oooo#
.#ooo.###.ooo#.
..##o.###.o##..
....##.#.##....
......###......
......###......
......###......
.......#.......`, `
......#.#......
.......#.......
......###......
.....#.#.#.....
....#o###o#....
....#o###o#....
....#o###o#....
....#o###o#....
....#o.#.o#....
.....#####.....
......###......
......###......
.......#.......`];
function haloed(sp) {
  const ink = sp.ink, has = new Set();
  for (let i = 0; i < sp.clr.length; i += 2) has.add(sp.clr[i] * 64 + sp.clr[i + 1]);
  for (let i = 0; i < ink.length; i += 2) has.add(ink[i] * 64 + ink[i + 1]);
  const clr = [...sp.clr];
  for (let y = -8; y <= 8; y++) for (let x = -9; x <= 9; x++) {
    if (has.has(x * 64 + y)) continue;
    let near = false;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (has.has((x + i) * 64 + y + j)) near = true;
    if (near) clr.push(x, y);
  }
  return { ink: Int8Array.from(ink), clr: Int8Array.from(clr) };
}
/** ALATE[flap]: wings out, wings back. */
export const ALATE = AL.map((a) => haloed(pic2(a)));

// ------------------------------------------------------------ brood and loads

// '#' ink, 'o' forced ground (so a pale larva reads on a dark ant).
function pic2(str) {
  const rows = str.replace(/^\n/, '').split('\n');
  const h = rows.length, w = rows[0].length, cx = (w - 1) >> 1, cy = (h - 1) >> 1, ink = [], clr = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (rows[y][x] === '#') ink.push(x - cx, y - cy);
    else if (rows[y][x] === 'o') clr.push(x - cx, y - cy);
  }
  return { ink: Int8Array.from(ink), clr: Int8Array.from(clr) };
}
/** A larva: a pale curled grub, outlined (no dots: they read as eyes). */
export const LARVA = pic2(`
..###.
.#ooo#
#oo##.
#o#...
.#....`);

/** A crumb (carried, dragged or lying about). */
export const CRUMB = pic2(`
o##o
####
.##o`);
/** One grain of sand in the jaws. */
export const GRAIN = pic2(`
##
##`);
/** A seed in the stores: ink rim, a pale hilum. */
export const SEED = pic2(`
.##.
#o##
####
.##.`);

