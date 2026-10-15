// Ice-script digits: carved in one continuous blade stroke per numeral, the
// way a figure skater would trace it in a single pass, with a small hook
// flourish at the entry and exit of the stroke (the way a skater curls out
// of a figure before gliding on). Paths are polylines in a 10 x 16 unit box
// (x right, y down); arcs are flattened to short segments so they still read
// as curves at low LED density. Not a skeleton font: every digit is drawn
// as the single path a blade would actually trace, with its own entry/exit
// curls sized and placed per digit, not a generic stroke shape.
const RAD = Math.PI / 180;
function arc(cx, cy, r, a0, a1, n = 10, ry = r) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (a0 + ((a1 - a0) * i) / n) * RAD;
    return [cx + r * Math.cos(a), cy + ry * Math.sin(a)];
  });
}
// A small flourish curl at the end of a stroke: a tightening spiral hook,
// `dir` the heading in degrees the blade arrives with, `hand` +1/-1 which way it curls.
function hook(x, y, dir, hand, size = 1.6) {
  const pts = [];
  const turns = 240; // degrees of curl
  for (let i = 1; i <= 8; i++) {
    const a = dir + hand * turns * (i / 8);
    const r = size * (1 - 0.7 * (i / 8));
    pts.push([x + r * Math.cos(a * RAD), y + r * Math.sin(a * RAD)]);
  }
  return pts;
}
const cat = (...parts) => parts.flat();

// Each glyph: array of paths (a path is a polyline the blade draws without
// lifting), coordinates kept inside roughly x:[0.3,9.7] y:[0.3,15.7] (box is
// 10 x 16). Most digits are one path; a couple need a second stroke (the
// 4 and 7 cross-bars, which a skater cuts as a second quick pass).
export const ICE = {
  width: 10, height: 16,
  glyphs: {
    // oval traced from the top, round and tall, with a small entry hook
    '0': [cat(
      hook(5, 0.9, 160, -1, 1.1),
      arc(5, 8, 4.3, -90, 270, 28, 7.1),
    )],
    // flag stroke in, then the long glide down, with a tail flourish
    '1': [cat(
      hook(2.4, 2.6, 20, 1, 1.1),
      [[2.4, 2.6], [5, 1], [5, 15]],
      hook(5, 15, 90, 1, 1.1),
    )],
    // top curve, diagonal down to the base, base stroke with an exit hook
    '2': [cat(
      arc(5, 4, 3.3, 200, 440, 18),
      [[7.6, 5.3], [1.3, 14.6]],
      [[1.3, 14.6], [8.7, 14.6]],
      hook(8.7, 14.6, 0, 1, 1.1),
    )],
    // double bulge, like a figure-8 half, with a hook where the strokes meet
    '3': [cat(
      hook(2, 1.6, 250, -1, 1.0),
      arc(4.3, 4, 2.7, 220, 470, 16),
      arc(4.6, 11.6, 3.4, 250, 480, 18),
      hook(2.6, 14.6, 150, -1, 1.1),
    )],
    // the diagonal and crossbar as one path (down, across, then the drop),
    // the vertical cut as a second stroke
    '4': [
      [[6.4, 1], [1.4, 10.2], [8.8, 10.2]],
      [[7, 6.4], [7, 15.4]],
    ],
    // top bar, down the left, round the bottom bowl, exit hook
    '5': [cat(
      hook(8.2, 1, 190, 1, 1.0),
      [[8.2, 1], [2, 1], [1.5, 6.8]],
      arc(4.8, 10, 4, 215, 470, 20),
      hook(3.6, 14.9, 70, 1, 1.1),
    )],
    // a long swooping hook down the left, curling into a closed bowl at
    // the base (the 9's construction, upside down)
    '6': [cat(
      hook(7.6, 1.6, 20, 1, 1.0),
      arc(5.3, 5.6, 3.9, 220, 20, 20, 4.6),
      arc(5, 11, 4, -90, -450, 22),
    )],
    // top bar, long diagonal glide to the base, crossbar as a second stroke
    '7': [
      [[1.2, 1], [8.8, 1], [3.8, 15.4]],
      [[2.8, 8.2], [6.6, 8.2]],
    ],
    // two bowls stacked, traced as one continuous figure-8
    '8': [cat(
      hook(5, 1, 160, -1, 0.9),
      arc(5, 4, 3, -90, 270, 16),
      arc(5, 11, 4.3, -90, 272, 20),
    )],
    // closed bowl at the top (one clean loop, no overlap), a single stem
    // continuing straight from the bowl's own closing point down to the
    // base, exit hook
    '9': (() => {
      const bowl = arc(5, 4.6, 3.6, -20, 340, 26);
      const stemStart = bowl[bowl.length - 1];
      const stemEnd = [stemStart[0] - 1.1, 14.4];
      return [cat(bowl, [stemStart, stemEnd], hook(stemEnd[0], stemEnd[1], 100, 1, 1.2))];
    })(),
  },
};

/** Flatten a glyph's paths at box size (w, h) placed at (x, y), into
 * segments [ax, ay, bx, by]. Pure geometry: no colour. */
export function iceSegs(ch, x, y, w, h) {
  const g = ICE.glyphs[ch];
  if (!g) return [];
  const sx = w / ICE.width, sy = h / ICE.height, segs = [];
  for (const path of g) {
    for (let k = 0; k + 1 < path.length; k++) {
      const [ax, ay] = path[k], [bx, by] = path[k + 1];
      segs.push([x + ax * sx, y + ay * sy, x + bx * sx, y + by * sy]);
    }
  }
  return segs;
}
