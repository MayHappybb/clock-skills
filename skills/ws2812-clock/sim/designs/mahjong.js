// Mahjong: a close-up of a mahjong table under one warm lamp, in real 3D.
// The time is four tiles of your hand, propped up to face you: the hours in
// the characters suit (一 二 三 ... over a red 萬), the minutes in the circles
// suit, the white dragon (a blank tile with a blue frame) as zero. The rest
// of the hand stands in shadow and is re-sorted by an unseen player's
// fingers; the other players toss discards into the pond; the wall across
// the table shrinks tile by tile through the hour (64 draws: an hour's worth).
// Minute: a tile is drawn from the wall, slid across face down, dropped into
// the slot and flipped face up while the old tile is discarded to the pond.
// Hour: the hand is declared and pushed down face up in a clattering wave,
// the camera rises over the table, every other tile is turned and washed in
// two swirls, the new time tiles are dealt into place, the wall is rebuilt
// and the hand stands back up.
import * as kit from '../js/kit.js';
import { buildFaces } from './mahjong-faces.js';
import * as R from './mahjong-render.js';
import { scene, CUP } from './mahjong-scene.js';

const FACES = buildFaces();

export default {
  name: 'Mahjong',
  blurb: 'your hand tells the time: hours in characters, minutes in circles; draw-and-discard each minute, a winning hand and a wash on the hour',
  layouts: ['hub-x4'], look: 'smoke', fps: 60, brightness: 0.4, dither: true,
  frame(ctx) {
    const dim = 1 - 0.6 * ctx.night;
    const tiles = scene(ctx.date, FACES);
    R.clearShadow();
    for (let i = 0; i < tiles.length; i++) R.castShadow(tiles[i]);
    R.drawTable(dim);
    for (let i = 0; i < tiles.length; i++) tiles[i].depth = R.depthOf(tiles[i]);
    tiles.sort((a, b) => b.depth - a.depth);
    // the tea bowl takes its place in the depth order; steam rises over everything behind the hand
    const cupDepth = R.depthOf({ x: CUP.x, y: CUP.y, z: CUP.h / 2 });
    let i = 0;
    for (; i < tiles.length && tiles[i].depth > cupDepth; i++) R.drawTile(tiles[i], dim);
    const [sx, sy, sc] = R.drawCup(CUP.x, CUP.y, CUP.r, CUP.h, dim);
    R.drawSteam(sx, sy, sc, ctx.date.getTime() / 1000 % 3600, dim, kit.noise2);
    for (; i < tiles.length; i++) R.drawTile(tiles[i], dim);
    kit.blitGrid(ctx, R.img);
  },
};
