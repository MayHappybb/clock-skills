// Lava Lamp: the wax numerals.
//
// Each digit is poured wax, drawn as a skeleton of strokes (polylines and
// ellipse arcs) whose radius grows towards the bottom (wax sags: every digit
// is pear-shaped, light at the top and heavy at the foot, like the lamp's own
// taper), joined with a smooth union so every joint has a wax fillet, and
// every open end finishes in a drip bulb. Stored as a signed distance map,
// 1/16 px per step, so the face can thin it evenly (the minute's beading),
// swell it (the beat) and resample it (wobble, squash, bob) per frame.
//
// Also per glyph: BEADS, the points the digit beads into when it breaks up
// (spread evenly along its skeleton, as a liquid thread breaks), and the top
// and bottom anchors where blobs bud off and where pool blobs kiss it.
//
// Flash: 10 maps of GW x GH bytes (14 KB) and a few hundred bytes of beads.

export const GW = 32, GH = 44;      // map size; the glyph's own box is 24 x 36 at (OX, OY)
export const OX = 4, OY = 4;
export const BEAD_GAP = 5.2;        // skeleton length per bead: a string of pearls that just touch
const D = Math.PI / 180;

/** Points along an ellipse arc, angles in degrees (0 = right, 90 = down). */
function arc(cx, cy, rx, ry, a0, a1, n = 24, rxf = null) {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + ((a1 - a0) * i) / n) * D;
    const k = rxf ? rxf(a) : 1;
    p.push([cx + rx * k * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return p;
}
const cat = (...ps) => ps.flat();

// Each glyph: { strokes: [polyline, ...], bulbs: [[x, y, k], ...] } (k scales the local radius).
const G = {
  0: { strokes: [arc(12, 18.3, 7.5, 14.8, 0, 360, 48, (a) => 1 + 0.12 * Math.sin(a))], bulbs: [] },
  1: {
    strokes: [[[5.6, 9.0], [9.0, 7.0], [12.0, 4.8], [14.0, 3.3]], [[14.0, 3.3], [14.0, 33.0]]],
    bulbs: [[5.6, 9.0, 1.25], [14.0, 33.0, 1.22]],
  },
  2: {
    strokes: [cat(arc(12, 11, 7.2, 7.6, 195, 360, 20), arc(12, 11, 7.2, 7.6, 0, 38, 6), [[4.8, 32.6]]), [[4.8, 32.6], [20.0, 32.6]]],
    bulbs: [[5.0, 9.2, 1.2], [20.0, 32.6, 1.15]],
  },
  3: {
    strokes: [arc(12, 10, 6.4, 6.6, 205, 450, 28), [[12, 16.6], [8.6, 16.6]], arc(12, 24.6, 7.9, 8.3, 270, 515, 30)],
    bulbs: [[6.2, 7.2, 1.15], [8.6, 16.6, 1.0], [4.8, 28.1, 1.2]],
  },
  4: {
    strokes: [[[11.8, 3.8], [2.6, 25.0]], [[2.6, 25.0], [21.8, 25.0]], [[17.6, 13.0], [17.6, 33.2]]],
    bulbs: [[11.8, 3.8, 1.2], [17.6, 13.0, 1.1], [21.8, 25.0, 1.1], [17.6, 33.2, 1.2]],
  },
  5: {
    strokes: [[[19.5, 3.4], [6.6, 3.4]], [[6.6, 3.4], [6.2, 16.0]], arc(11.5, 23.4, 8.2, 8.7, 236, 510, 30)],
    bulbs: [[19.5, 3.4, 1.15], [4.4, 27.6, 1.2]],
  },
  6: {
    strokes: [arc(12, 24.2, 8.0, 8.6, 0, 360, 36), [[4.0, 24.2], [4.3, 17.0], [5.6, 11.0], [8.2, 6.4], [12.0, 3.9], [16.6, 3.5]]],
    bulbs: [[16.6, 3.5, 1.2]],
  },
  7: {
    strokes: [[[4.6, 3.4], [19.6, 3.4]], [[19.6, 3.4], [17.6, 9.4], [14.6, 17.0], [12.4, 25.0], [11.6, 33.0]]],
    bulbs: [[4.6, 3.4, 1.15], [11.6, 33.0, 1.22]],
  },
  8: {
    strokes: [arc(12, 10.2, 5.9, 6.7, 0, 360, 32), arc(12, 24.7, 7.9, 8.4, 0, 360, 40)],
    bulbs: [],
  },
  9: {
    strokes: [arc(12, 11.4, 7.2, 7.9, 0, 360, 36), [[19.2, 11.4], [19.2, 19.0], [18.0, 25.6], [14.8, 30.8], [10.2, 33.0], [7.0, 32.8]]],
    bulbs: [[7.0, 32.8, 1.22]],
  },
};

const rad = (y) => 2.45 + 0.9 * (y / 36);          // the sag: thicker towards the foot

function segD(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const ex = px - ax - u * dx, ey = py - ay - u * dy;
  return [Math.sqrt(ex * ex + ey * ey), ay + u * dy];
}
// smooth max: the wax fillet where strokes meet
function smax(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + (h * h * k) / 4;
}

function build(d) {
  const { strokes, bulbs } = G[d];
  const m = new Uint8Array(GW * GH);
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const px = i + 0.5 - OX, py = j + 0.5 - OY;
      let s = -99;
      for (const st of strokes) {
        let best = -99;
        for (let k = 1; k < st.length; k++) {
          const [dd, yy] = segD(px, py, st[k - 1][0], st[k - 1][1], st[k][0], st[k][1]);
          best = Math.max(best, rad(yy) - dd);
        }
        s = s === -99 ? best : smax(s, best, 1.6);
      }
      for (const [bx, by, k] of bulbs) s = smax(s, rad(by) * k - Math.hypot(px - bx, py - by), 1.2);
      m[j * GW + i] = Math.max(0, Math.min(255, Math.round(128 + 16 * s)));
    }
  return m;
}

/** Evenly spaced points along a glyph's skeleton (the beads it breaks into). */
function beads(d) {
  const segs = [];
  let L = 0;
  for (const st of G[d].strokes)
    for (let k = 1; k < st.length; k++) {
      const [a, b] = [st[k - 1], st[k]], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      segs.push([a, b, L, l]); L += l;
    }
  const out = [], NB = Math.max(5, Math.round(L / BEAD_GAP));
  for (let n = 0; n < NB; n++) {
    const at = ((n + 0.5) / NB) * L;
    const s = segs.find(([, , l0, l]) => at <= l0 + l) ?? segs[segs.length - 1];
    const u = Math.min(1, (at - s[2]) / (s[3] || 1));
    out.push([s[0][0] + (s[1][0] - s[0][0]) * u, s[0][1] + (s[1][1] - s[0][1]) * u]);
  }
  // bead order by height, so the paths of a digit's break-up do not cross much
  return out.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

/** Where a blob buds off the top (and lands back), and where pool blobs kiss the foot. */
function anchors(m) {
  // the middle of the run of ink nearest the centre line in an extreme row
  const pick = (rows) => {
    let best = null;
    for (const j of rows) for (let i = 0; i < GW; i++)
      if (m[j * GW + i] >= 128 && (!best || Math.abs(i - 15.5) < Math.abs(best[0] - 15.5))) best = [i, j];
    let a = best[0], b = best[0];
    while (a > 0 && m[best[1] * GW + a - 1] >= 128) a--;
    while (b < GW - 1 && m[best[1] * GW + b + 1] >= 128) b++;
    return [(a + b) / 2, best[1]];
  };
  let j0 = 0, j1 = GH - 1;
  while (!m.slice(j0 * GW, j0 * GW + GW).some((v) => v >= 128)) j0++;
  while (!m.slice(j1 * GW, j1 * GW + GW).some((v) => v >= 128)) j1--;
  const top = pick([j0, j0 + 1]), bot = pick([j1, j1 - 1]);
  return { top: [top[0] + 0.5 - OX, j0 - OY], bot: [bot[0] + 0.5 - OX, j1 + 1 - OY] };
}

export const MAPS = [], BEADS = [], ANCH = [];
for (let d = 0; d < 10; d++) {
  MAPS.push(build(d));
  BEADS.push(beads(d));
  ANCH.push(anchors(MAPS[d]));
}
