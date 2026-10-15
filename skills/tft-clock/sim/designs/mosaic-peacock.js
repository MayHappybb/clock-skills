// The peacock for mosaic.js: the bird of the Ravenna mosaics (San Vitale,
// the sarcophagi), in profile, set in the same tesserae as the numerals and
// the ground: every part has its own andamento. The train is rows that run
// along its curved centre line, dropping out as it tapers (the outer row
// follows the outline to the tip), with five eye-spots set as a lapis centre
// in a ring of gold tesserae; the neck is two rows running up its S curve;
// the body is rings following its outline; head, beak and crest are a few
// small pieces. 1 px grout between tesserae, a dark keyline round the figure.
// Built once at load (flash: 5 poses x 61 x 28 x 2 B = 17 KB). The eyes'
// centre pixels are listed so mosaic.js can roll a shimmer through them.

import { Gfx, hash } from '../js/kit.js';

export const PW = 61, PH = 28;
export const OCELLUS = [0x14245e, 0x1e5ea0, 0x34b4c8, 0xbff2e8];   // eye centre: rest .. shimmer peak
const LINE = 0x0b1418;

// materials: tesserae tones and the grout between them (null: solid, no grout)
const M = {
  trainEdge: { tones: [0x2a6c30, 0x2f7434], grout: 0x123018 },
  train: { tones: [0x3e9c44, 0x48aa4a, 0x37903e], grout: 0x184020 },
  ring: { tones: [0xe0b23e, 0xd0a034, 0xeac050], grout: null },
  eye: { tones: [OCELLUS[0]], grout: null },
  bodyEdge: { tones: [0x16468a, 0x1a4c92], grout: 0x0a2244 },
  body: { tones: [0x1f5ca8, 0x2464b0], grout: 0x0a2244 },
  neck: { tones: [0x1f88b8, 0x2896c2], grout: 0x0b3850 },
  head: { tones: [0x1a70b0, 0x1c78b8], grout: null },
  beak: { tones: [0xc8862a], grout: null },
  leg: { tones: [0xa86a26], grout: null },
  white: { tones: [0xf4eee2], grout: null },
  line: { tones: [LINE], grout: null },
  crest: { tones: [0x3cbcd0], grout: null },
};
const MAT = Object.keys(M);

// ------------------------------------------------------------ curves

function bezier(P, n = 48) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, m = 1 - t;
    pts.push([
      m * m * m * P[0][0] + 3 * m * m * t * P[1][0] + 3 * m * t * t * P[2][0] + t * t * t * P[3][0],
      m * m * m * P[0][1] + 3 * m * m * t * P[1][1] + 3 * m * t * t * P[2][1] + t * t * t * P[3][1],
    ]);
  }
  const S = [0];
  for (let i = 1; i < pts.length; i++) S.push(S[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, S, L: S[S.length - 1] };
}
/** Nearest point on a curve: arc length s, u = s / L, signed distance d. */
function near(c, px, py) {
  let bd = Infinity, bs = 0, sg = 1;
  for (let i = 0; i + 1 < c.pts.length; i++) {
    const [ax, ay] = c.pts[i], [bx, by] = c.pts[i + 1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let u = ((px - ax) * dx + (py - ay) * dy) / l2;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const ex = px - ax - u * dx, ey = py - ay - u * dy, d = Math.hypot(ex, ey);
    if (d < bd) { bd = d; bs = c.S[i] + u * Math.sqrt(l2); sg = dx * (py - ay) - dy * (px - ax) >= 0 ? 1 : -1; }
  }
  return { s: bs, u: bs / c.L, d: bd * sg };
}
const lerpP = (a, b, k) => a.map((p, i) => [p[0] + (b[i][0] - p[0]) * k, p[1] + (b[i][1] - p[1]) * k]);

// ------------------------------------------------------------ the figure

const TRAIN = bezier([[15, 14.5], [31, 12.5], [45, 25.5], [59.6, 22.6]]);
const hwTrain = (u) => 1.6 + 5.4 * (1 - u) ** 0.6;
const EYES = [[0.19, 1.12], [0.37, 1.06], [0.54, 0.96], [0.7, 0.86], [0.85, 0.74]];
const NECK_UP = [[12.5, 16.5], [4.5, 14.5], [11.5, 11], [6.5, 8]];
const NECK_DOWN = [[12.5, 16.5], [5, 16], [7.5, 13.5], [4.4, 12.2]];
const BODY = { cx: 15.5, cy: 18.3, rx: 7.2, ry: 5.2 };

/** One pose: `down` 0 head up .. 1 dipped; `train` false for the display (the fan is drawn by drawFan). */
function pose(down, train = true) {
  const N = PW * PH;
  const mat = new Int8Array(N).fill(-1), key = new Array(N).fill(null);
  const set = (i, m, k) => { mat[i] = MAT.indexOf(m); key[i] = k; };
  const neck = bezier(lerpP(NECK_UP, NECK_DOWN, down));
  const [hx, hy] = neck.pts[neck.pts.length - 1];
  const eyeC = EYES.map(([u, k]) => {
    const i = Math.round(u * (TRAIN.pts.length - 1));
    return [TRAIN.pts[i][0], TRAIN.pts[i][1], k];
  });

  // small pieces drawn with the kit's hard fills, sampled as masks
  const g = new Gfx(PW, PH);
  const mask = (fn) => { g.clear(0); fn(g); return Uint8Array.from(g.buf, (v) => (v ? 1 : 0)); };
  const ON = 0xffffff;
  const legs = mask((c) => { c.fillRect(12, 22, 1, 5, ON); c.fillRect(17, 22, 1, 5, ON); c.fillRect(10, 26, 3, 1, ON); c.fillRect(15, 26, 3, 1, ON); });
  const beak = mask((c) => c.fillPolygon([[hx - 1.6, hy - 1.1], [hx - 5, hy + 0.3 + down * 1.2], [hx - 1.6, hy + 1.1]], ON));
  const stalks = mask((c) => { for (let k = -1; k <= 1; k++) c.line(Math.round(hx), Math.round(hy - 2.5), Math.round(hx + k * 3 + 0.4), Math.round(hy - 4.8 + Math.abs(k) * 0.8), ON); });

  for (let y = 0; y < PH; y++)
    for (let x = 0; x < PW; x++) {
      const i = y * PW + x, px = x + 0.5, py = y + 0.5;
      if (train) {
        const t = near(TRAIN, px, py), hw = hwTrain(Math.min(1, t.u));
        const ad = Math.abs(t.d);
        if (ad < hw) {
          const e = hw - ad, row = Math.floor(e / 2.6), side = t.d > 0 ? 1 : 0;
          const j = Math.floor((t.s + row * 1.7 + side * 1.9) / 3.6);
          set(i, row === 0 ? 'trainEdge' : 'train', `t${side}:${row}:${j}`);
          for (let k = 0; k < eyeC.length; k++) {
            const [ex, ey, sc] = eyeC[k], dx = (px - ex) / (3.3 * sc), dy = (py - ey) / (2.9 * sc), q = dx * dx + dy * dy;
            if (q < 0.4) set(i, 'eye', `e${k}`);
            else if (q < 1) set(i, 'ring', `r${k}:${Math.floor(((Math.atan2(dy, dx) / Math.PI + 1) * 3.5) % 7)}`);
          }
        }
      }
      if (legs[i]) set(i, 'leg', 'leg');
      // the body: rings following its outline
      const bx = (px - BODY.cx) / BODY.rx, by = (py - BODY.cy) / BODY.ry, bq = Math.sqrt(bx * bx + by * by);
      if (bq < 1) {
        const e = (1 - bq) * BODY.ry, row = Math.floor(e / 2.5);
        const per = 2 * Math.PI * Math.max(1, BODY.ry - row * 2.5);
        const j = Math.floor(((Math.atan2(by, bx) / (2 * Math.PI) + 0.5) * per + row * 1.3) / 3.4);
        set(i, row === 0 ? 'bodyEdge' : 'body', `b${row}:${j}`);
      }
      // the neck: two rows up its S curve
      const n = near(neck, px, py), nw = 2.4 - 0.7 * n.u;
      if (Math.abs(n.d) < nw && n.u > 0.02) set(i, 'neck', `n${n.d > 0 ? 1 : 0}:${Math.floor((n.s + (n.d > 0 ? 1.5 : 0)) / 3.2)}`);
      // the head, two pieces split behind the eye
      if ((px - hx) ** 2 + (py - hy) ** 2 < 3 * 3) set(i, 'head', 'h');
      if (beak[i]) set(i, 'beak', 'beak');
      if (stalks[i] && mat[i] < 0) set(i, 'line', 'line');
    }
  // crest tips: three small turquoise tesserae on the stalks
  for (let k = -1; k <= 1; k++) {
    const cx = Math.round(hx + k * 3 + 0.4), cy = Math.round(hy - 5.6 + Math.abs(k) * 0.8);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const x = cx + dx - 1, y = cy + dy - 1;
      if (x >= 0 && y >= 0 && x < PW && y < PH) set(y * PW + x, 'crest', `c${k}`);
    }
  }
  // the eye: a white piece with a dark pupil, and the white face stripe
  const ex = Math.round(hx - 0.7), ey = Math.round(hy - 0.8);
  set(ey * PW + ex, 'line', 'pupil');
  set(ey * PW + ex + 1, 'white', 'w');
  set((ey + 1) * PW + ex + 1, 'white', 'w');
  set((ey + 1) * PW + ex + 2, 'white', 'w');

  // colours: each tessera one tone, grout on its right and lower edge, keyline outside
  const data = new Int32Array(N).fill(-1), eyes = EYES.map(() => []);
  for (let y = 0; y < PH; y++)
    for (let x = 0; x < PW; x++) {
      const i = y * PW + x, m = mat[i];
      if (m < 0) continue;
      const Mm = M[MAT[m]], k = key[i];
      let h = 0;
      for (let c = 0; c < k.length; c++) h = (h * 31 + k.charCodeAt(c)) | 0;
      let c = Mm.tones[hash(h, 5) % Mm.tones.length];
      const kr = x + 1 < PW && mat[i + 1] >= 0 ? key[i + 1] : k, kb = y + 1 < PH && mat[i + PW] >= 0 ? key[i + PW] : k;
      const grout = Mm.grout !== null && (kr !== k || kb !== k);
      if (grout) c = Mm.grout;
      data[i] = c;
      if (!grout && MAT[m] === 'eye') eyes[+k.slice(1)].push(i);
    }
  for (let y = 0; y < PH; y++)
    for (let x = 0; x < PW; x++) {
      const i = y * PW + x;
      if (mat[i] >= 0) continue;
      const nb = (x > 0 && mat[i - 1] >= 0) || (x < PW - 1 && mat[i + 1] >= 0) || (y > 0 && mat[i - PW] >= 0) || (y < PH - 1 && mat[i + PW] >= 0);
      if (nb) data[i] = LINE;
    }
  return { sprite: { w: PW, h: PH, data }, eyes };
}

/**
 * The display: the train raised into a fan behind the bird. `open` 0..1;
 * (bx, by) the sprite's corner. Flat feathers, hard pixels, drawn behind it.
 */
export function drawFan(g, bx, by, open, shimmer) {
  if (open <= 0) return;
  const px = bx + 15.5, py = by + 17, N = 13, R = 24;
  const ang = (k) => ((96 + (-80 + (k * 176) / (N - 1) - 96) * open) * Math.PI) / 180;
  // the fan's ground: a flat green sector, keylined, then the feathers' eyes in two rows
  const a0 = ang(0), a1 = ang(N - 1), sp = a1 - a0 + 0.2;
  if (open > 0.05) {
    g.arc(px, py, 0, R + 1.2, a0 - 0.1, a0 - 0.1 + sp, LINE);
    g.arc(px, py, 0, R, a0 - 0.06, a0 - 0.14 + sp, 0x2c6e34);
    g.arc(px, py, 0, R - 8, a0 - 0.06, a0 - 0.14 + sp, 0x3d8a3c);
  }
  for (let k = 0; k < N; k++) {
    const a = ang(k), sx = Math.sin(a), cy = -Math.cos(a);
    g.thickLine(px, py, px + sx * (R - 1), py + cy * (R - 1), 1, 0x1e4a24);
    for (const [r, rr] of [[R - 3.4, 2.7], [R - 11.5, 2.0]]) {
      if (rr < 2.5 && k % 2) continue;
      const ex = px + sx * r, ey = py + cy * r;
      g.fillCircle(ex, ey, rr + 0.6, LINE);
      g.fillCircle(ex, ey, rr, 0xd8a838);
      g.fillCircle(ex, ey, rr * 0.5, OCELLUS[shimmer(k)]);
    }
  }
}

export const POSES = [pose(0), pose(0.34), pose(0.67), pose(1)];
export const DISPLAY = pose(0, false);
