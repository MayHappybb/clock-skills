// vitals-glyphs: the ECG trace's handwriting. Each digit is one pen path
// that leaves the baseline at the left of its box and comes back to it at
// the right, so the heartbeat can write it without lifting the pen. Where a
// stroke has a free end (the flag of a 1, the tail of a 3) the pen goes out
// and comes back along itself, the way a trace has to.
//
// Unit box: u 0..1 across, v 0..1 down, v = 1 is the baseline. Angles are
// screen angles in degrees (0 = right, 90 = down), so increasing angle runs
// clockwise on the glass.

const D = Math.PI / 180;

/** Points along an ellipse from a0 to a1 (degrees, either direction). */
function arc(cx, cy, rx, ry, a0, a1) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 7));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + (a1 - a0) * (i / n)) * D;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
}
const back = (pts) => pts.slice(0, -1).reverse();     // retrace, without repeating the turn point
const P = (...parts) => parts.flat();          // concatenate point lists

// --- the ten digits
const G = {};

G[0] = P([[0, 1], [0.5, 1]], arc(0.5, 0.5, 0.46, 0.5, 90, 450), [[1, 1]]);

{
  const up = [[0.58, 1], [0.58, 0], [0.2, 0.26]];
  G[1] = P([[0, 1]], up, back(up), [[1, 1]]);
}

{
  // the hook and the diagonal, out from the bottom-left corner and back
  const out = P([[0.04, 1]], arc(0.5, 0.29, 0.45, 0.29, 32, -168));
  G[2] = P([[0, 1]], out, back(out), [[1, 1]]);
}

{
  const lower = arc(0.5, 0.735, 0.48, 0.265, 90, -90);     // bottom, up the right, to the waist
  const upper = arc(0.48, 0.24, 0.42, 0.235, 90, -160);    // waist, up the right, over the top
  const tail = arc(0.5, 0.735, 0.48, 0.265, 90, 158);
  const out = P(lower.slice(1), upper.slice(1));
  G[3] = P([[0, 1], [0.5, 1]], out, back(out), tail.slice(1), back(tail), [[1, 1]]);
}

{
  G[4] = P([[0, 1], [0.7, 1], [0.7, 0], [0.0, 0.68], [1, 0.68], [0.7, 0.68], [0.7, 1], [1, 1]]);
}

{
  const bowlUp = arc(0.5, 0.69, 0.47, 0.31, 90, -150);     // bottom, round the right, to the stem
  const stem = [[0.12, 0.48], [0.15, 0], [0.94, 0]];
  const tail = arc(0.5, 0.69, 0.47, 0.31, 90, 152);
  const out = P(bowlUp.slice(1), stem);
  G[5] = P([[0, 1], [0.5, 1]], out, back(out), tail.slice(1), back(tail), [[1, 1]]);
}

{
  const toLeft = arc(0.5, 0.7, 0.47, 0.3, 90, 180);
  const stem = [[0.05, 0.46], [0.13, 0.22], [0.32, 0.05], [0.56, 0], [0.84, 0.06]];
  const loop = arc(0.5, 0.7, 0.47, 0.3, 180, 450);
  G[6] = P([[0, 1]], toLeft, stem, back(stem), loop.slice(1), [[1, 1]]);
}

{
  const up = [[0.34, 1], [0.6, 0.45], [0.98, 0], [0.02, 0]];
  G[7] = P([[0, 1]], up, back(up), [[1, 1]]);
}

{
  const lowR = arc(0.5, 0.735, 0.47, 0.265, 90, -90);
  const upper = arc(0.5, 0.235, 0.38, 0.235, 90, 450);
  const lowL = arc(0.5, 0.735, 0.47, 0.265, -90, -270);
  G[8] = P([[0, 1], [0.5, 1]], lowR.slice(1), upper.slice(1), lowL.slice(1), [[1, 1]]);
}

{
  const stem = [[0.8, 1], [0.86, 0.62], [0.92, 0.3]];
  const loop = arc(0.48, 0.3, 0.44, 0.3, 0, -360);
  G[9] = P([[0, 1]], stem, loop.slice(1), back(stem), [[1, 1]]);
}

export const GLYPHS = G;
