// The cast of "cats": ten numerals, each one cat (the 4 is an open 4: the
// cat sits tall as the stem, its long tail is the arm and crossbar) whose body IS the stroke, after Kuniyoshi's prints of cats
// twisted into the letters of fish names. Each body is a set of centre lines
// stroked R = 3 px (a 6 px coat) with a 1 px sumi keyline; the cat's head is
// the numeral's ball terminal, drawn as a pixel sprite (cats.js), and its
// tail runs free from the stroke's end.
//
// At load each digit becomes, on a 32 x 48 grid (glyph box 24 x 40 plus a
// 4 px margin):
//   SDF  Int8, distance to the coat edge in 1/8 px (negative inside)
//   COAT Uint8, the coat's flat marking at that pixel: 0 base, 1 patch,
//        2 second patch, 3 tabby stripe. Markings sit on the cat's back
//        half (the outer side of the stroke), so a dark patch never cuts
//        across the stroke and the numeral never reads broken.
// 1.5 KB + 1.5 KB a digit, 30 KB of flash for the set.

export const GW = 24, GH = 40, M = 4, SW = GW + 2 * M, SH = GH + 2 * M, R = 3;

const arc = (cx, cy, rx, ry, a0, a1, n = 36) => {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
};

// centre lines per digit (angles: 0 right, 90 down); the first point of the
// first line is where the head sits
const SKEL = {
  0: [arc(12, 20.5, 8, 15.5, -90, 270, 48)],
  1: [[[12.5, 5], [12.5, 36]], [[12.5, 12.5], [6, 17.5]]],
  2: [[...arc(12, 12, 7.5, 7.5, 192, 382), [4.5, 36], [19.5, 36]]],
  3: [[...arc(12, 11, 7, 7, 208, 442), [8.6, 19.6], ...arc(12, 28, 8, 8.3, 245, 518)]],
  4: [[[18, 5], [18, 36]], [[5.8, 14], [4.2, 25], [21.6, 25]]],
  5: [[[19, 4.5], [6, 4.5], [5.4, 18.4], ...arc(11.5, 26.6, 8, 9.4, 236, 518)]],
  6: [[...arc(17.5, 26, 14, 22, 262, 180, 24), ...arc(11.5, 27, 8, 9, 180, 540, 40)]],
  7: [[[4.5, 4.5], [19.5, 4.5], [9, 36]]],
  8: [[...arc(12, 11.6, 6.8, 7.4, -90, 270, 40)], [...arc(12, 28, 8, 8.2, -90, 270, 40)]],
  9: [arc(12, 12.5, 7.5, 9, -90, 270, 40), arc(4.5, 14, 14, 22, 0, 82, 24)],
};

// head: sprite centre, in glyph units. tail: its root on the cat's seat;
// it hangs down over the eave, and curl is which way its tip hooks.
// coat: which markings this cat wears.
export const CAST = {
  0: { head: [12, 4.5], tail: [13, 36], curl: 1, coat: 'calico' },
  1: { head: [12.5, 4.5], tail: [12.5, 36], curl: -1, coat: 'ginger' },
  2: { head: [4.6, 10.4], tail: [15, 36], curl: 1, coat: 'tabby' },
  3: { head: [5.6, 7.6], tail: [12, 36.2], curl: -1, coat: 'hachi' },
  4: { head: [18, 4.5], tail: [18, 36], curl: 1, coat: 'calico' },
  5: { head: [19.5, 4.5], tail: [11, 36], curl: -1, coat: 'ginger' },
  6: { head: [15.2, 4.6], tail: [12, 36], curl: 1, coat: 'hachi' },
  7: { head: [4.5, 4.5], tail: [9, 36], curl: -1, coat: 'tabby' },
  8: { head: [12, 4.5], tail: [12, 36.2], curl: 1, coat: 'calico' },
  9: { head: [12, 4.5], tail: [8, 36], curl: -1, coat: 'ginger' },
};

function nearest(px, py, lines) {
  let best = 1e9, bs = 0, bo = 0, run = 0;
  for (const pl of lines) {
    for (let k = 1; k < pl.length; k++) {
      const [ax, ay] = pl[k - 1], [bx, by] = pl[k];
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, L = Math.sqrt(l2);
      let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const ex = px - ax - u * dx, ey = py - ay - u * dy, e = Math.sqrt(ex * ex + ey * ey);
      if (e < best) {
        best = e; bs = run + u * L;
        // signed offset across the stroke: + is the left of the heading (the cat's back on these paths)
        bo = L ? (dx * (py - ay) - dy * (px - ax)) / L : 0;
      }
      run += L;
    }
    run += 20;
  }
  return [best, bs, bo];
}

const hash = (a, b) => {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
};
const vnoise = (x, seed) => {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hash(i, seed) * (1 - u) + hash(i + 1, seed) * u;
};

/** The marking at a coat pixel: arc length s, offset o across the stroke (-R..R). */
function marking(coat, d, s, o) {
  const back = -o; // these paths wind so that the outer side is negative o; flip so back > 0 is outside
  switch (coat) {
    case 'calico': {
      const n = vnoise(s / 6, d * 7 + 1);
      if (back > -0.6 && n > 0.62) return 1;                    // orange, may span most of the coat
      if (back > 0.2 && vnoise(s / 5 + 9, d * 3 + 2) > 0.62) return 3; // dilute calico: grey on the outer half
      return 0;
    }
    case 'ginger':
      if (back > -1.2 && vnoise(s / 5, d * 5 + 3) > 0.5) return 1;
      return 0;
    case 'tabby':
      if (back > -0.8 && ((s + back * 0.8) % 5 + 5) % 5 < 1.7) return 3;
      return 0;
    case 'hachi':
      if (back > 0.2 && vnoise(s / 7, d * 11 + 4) > 0.45) return 3;
      return 0;
  }
  return 0;
}

export const SDF = [], COAT = [];
for (let d = 0; d < 10; d++) {
  const f = new Int8Array(SW * SH), c = new Uint8Array(SW * SH);
  for (let j = 0; j < SH; j++)
    for (let i = 0; i < SW; i++) {
      const px = i + 0.5 - M, py = j + 0.5 - M;
      const [e, s, o] = nearest(px, py, SKEL[d]);
      const v = Math.round((e - R) * 8);
      f[j * SW + i] = v < -127 ? -127 : v > 127 ? 127 : v;
      c[j * SW + i] = e <= R + 0.5 ? marking(CAST[d].coat, d, s, Math.sign(o) * Math.min(e, R)) : 0;
    }
  SDF.push(f); COAT.push(c);
}
