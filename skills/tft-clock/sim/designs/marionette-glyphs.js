// marionette: the ten numerals, cut from plywood in two or three pieces and
// pinned together with brass pins, the way a marionette's limbs are joined.
//
// Each glyph is in local units: x across -6..6, y down 0..22 (centrelines;
// the pieces are stroked 5 wide, so the cut wood spans about 17 x 27 px).
// Besides its pieces and pins a glyph says where its strings and limbs go:
//   top  the two screw-eyes the head strings tie to
//   sh   the shoulders (arm pivots)
//   hip  the hips (leg pivots)

const D2R = Math.PI / 180;

/** Points on an ellipse arc, angles in degrees, y down (90 = bottom). */
function arc(cx, cy, rx, ry, a0, a1, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + ((a1 - a0) * i) / n) * D2R;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
}

const SIX = {
  pieces: [
    [[5, 1.2], [2, 0.1], [-1.5, 0.6], [-4.3, 2.8], [-5.8, 6.8], [-6.1, 11], [-6, 15.5]],
    arc(0, 15.5, 6, 6.5, 180, 540, 14),
  ],
  pins: [[-6, 15.5]],
  top: [[-3.5, 0.6], [4, 0.6]],
  sh: [[-8.2, 9], [8.2, 14]],
  hip: [[-3.2, 23.5], [3.2, 23.5]],
};
const rot = (p) => [-p[0], 22 - p[1]];
const NINE = {
  pieces: SIX.pieces.map((pc) => pc.map(rot)),
  pins: SIX.pins.map(rot),
  top: [[-4, -0.6], [4, -0.6]],
  sh: [[-8.2, 8], [8.2, 9]],
  hip: [[-2.4, 23.5], [2.8, 23.5]],
};

export const GLYPHS = [
  { // 0
    pieces: [arc(0, 11, 6, 11, 90, 270, 9), arc(0, 11, 6, 11, -90, 90, 9)],
    pins: [[0, 0], [0, 22]],
    top: [[-4, 0.9], [4, 0.9]],
    sh: [[-8.2, 9], [8.2, 9]],
    hip: [[-3.2, 23.2], [3.2, 23.2]],
  },
  { // 1
    pieces: [[[-4.6, 4.6], [0.5, 0]], [[0.5, 0], [0.5, 22]], [[-3.5, 22], [4.5, 22]]],
    pins: [[0.5, 0], [0.5, 22]],
    top: [[-3.6, 3.6], [0.5, -1.4]],
    sh: [[-2.2, 10], [3.2, 10]],
    hip: [[-2.6, 24.2], [3.6, 24.2]],
  },
  { // 2
    pieces: [
      [...arc(0, 6, 6, 6, 195, 375, 10), [3.6, 12], [-6, 22]],
      [[-6, 22], [6, 22]],
    ],
    pins: [[-6, 22]],
    top: [[-4.5, 1.6], [4.5, 1.6]],
    sh: [[-8.2, 7], [8.2, 8]],
    hip: [[-3.6, 24.2], [3.6, 24.2]],
  },
  { // 3
    pieces: [
      [...arc(0, 5.5, 5.5, 5.5, 200, 450, 11), [-1.5, 11]],
      [[-1.5, 11], ...arc(0, 16.5, 6, 5.5, 270, 520, 11)],
    ],
    pins: [[0, 11]],
    top: [[-4.2, 1.2], [4.2, 1.2]],
    sh: [[-7.6, 7], [8.2, 13]],
    hip: [[-3.4, 24], [3.4, 24]],
  },
  { // 4
    pieces: [[[3, 0], [-6, 15], [6.5, 15]], [[3, 0], [3, 22]]],
    pins: [[3, 0], [3, 15]],
    top: [[-1.2, 5.6], [3, -1.6]],
    sh: [[-8.2, 15], [8.8, 15]],
    hip: [[0.4, 24], [5.4, 24]],
  },
  { // 5
    pieces: [
      [[6, 0], [-5, 0], [-5, 9]],
      [[-5, 9], ...arc(0, 15.3, 6, 6.6, 228, 500, 12)],
    ],
    pins: [[-5, 0], [-5, 9]],
    top: [[-5, -1.6], [5, -1.6]],
    sh: [[-7.4, 5], [8.2, 15]],
    hip: [[-3.2, 23.8], [3.2, 23.8]],
  },
  SIX,
  { // 7
    pieces: [[[-6, 0], [6, 0]], [[6, 0], [-1.5, 22]]],
    pins: [[6, 0]],
    top: [[-5, -1.6], [5, -1.6]],
    sh: [[-8.2, 1], [6.8, 9]],
    hip: [[-4.4, 24], [1.2, 24]],
  },
  { // 8
    pieces: [arc(0, 5.2, 4.8, 5.2, 90, 450, 14), arc(0, 16, 6, 6, -90, 270, 14)],
    pins: [[0, 10.3]],
    top: [[-3.4, 1.2], [3.4, 1.2]],
    sh: [[-7.4, 6], [7.4, 6]],
    hip: [[-3.2, 24], [3.2, 24]],
  },
  NINE,
];
