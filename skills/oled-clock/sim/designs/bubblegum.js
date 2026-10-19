// Bubblegum: a kid blows the minute as a bubble-letter gum bubble.
import { clamp, lerp, progress, ease, orbit, segDist, sprite, previousMinute } from '../js/kit.js';

const D2R = Math.PI / 180;

// ---------------------------------------------------------------- gum numerals
// Bubble letters, blown: each numeral is a swollen gum tube round a centre
// line in a 32 x 48 cell, smooth-unioned so every joint bulges like a real
// bubble does where two lobes meet. Free ends swell into round terminals.
const BW = 32, BH = 48, R = 4.7;
const arc = (cx, cy, rx, ry, a0, a1, n) => {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + (a1 - a0) * i / n) * D2R;
    p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return p;
};
const poly = (pts, r = R) => pts.slice(1).map((b, i) => [pts[i][0], pts[i][1], b[0], b[1], r]);
const blob = (x, y, r = R + 0.8) => [[x, y, x, y, r]];

const GUM = [
  /* 0 */ [...poly(arc(16, 24, 10, 18, 0, 360, 16))],
  /* 1 */ [...poly([[8.5, 13.5], [17.5, 6.5], [17.5, 42]]), ...blob(8.5, 13.5, R + 0.6), ...blob(17.5, 42, R + 0.4)],
  /* 2 */ [...poly([...arc(16, 15.5, 10, 9.5, 190, 385, 9), [6, 42], [26.5, 42]]), ...blob(6.3, 13.5, R + 0.6), ...blob(26, 42, R + 0.4)],
  /* 3 */ [...poly(arc(15.5, 14.5, 9.5, 8.5, 200, 450, 9)), ...poly(arc(15.5, 32, 10.5, 10, 270, 520, 10)),
           ...blob(6.6, 11.6, R + 0.6), ...blob(5.6, 35.5, R + 0.6)],
  /* 4 */ [...poly([[6.5, 6.5], [5, 28.5], [27.5, 28.5]]), ...poly([[23.5, 14], [23.5, 42]]), ...blob(6.5, 6.5, R + 0.5), ...blob(27.5, 28.5, R + 0.2), ...blob(23.5, 13.5, R + 0.4), ...blob(23.5, 42, R + 0.4)],
  /* 5 */ [...poly([[25.5, 6.5], [9, 6.5], [8.5, 21.5]]), ...poly(arc(15.5, 30.5, 10.5, 11, 235, 515, 10)),
           ...blob(25.5, 6.5, R + 0.4), ...blob(6, 35.2, R + 0.6)],
  /* 6 */ [...poly(arc(16.3, 30.6, 11, 11.6, 0, 360, 14), R - 0.2), ...poly([[5.3, 30.6], [5.8, 21.5], [9, 13.5], [15.5, 7.8], [23.5, 6.5]]),
           ...blob(23.5, 6.8, R + 0.6)],
  /* 7 */ [...poly([[6, 6.5], [26, 6.5], [13.5, 42]]), ...blob(6, 6.5, R + 0.4), ...blob(13.5, 42, R + 0.4)],
  /* 8 */ [...poly(arc(16, 12.8, 9.6, 8.4, 0, 360, 12), R - 0.3), ...poly(arc(16, 32.4, 11, 10.4, 0, 360, 14), R - 0.2)],
  null,
];
GUM[9] = GUM[6].map(([ax, ay, bx, by, r]) => [BW - ax, BH - ay, BW - bx, BH - by, r]);
// Where the neck from the lips joins each numeral (cell units).
const ATTACH = [[8, 38], [14, 42], [6, 42], [6, 36], [18, 42], [6, 36], [7, 37], [13, 42], [7, 38], [9, 42]];
// Precomputed bounding boxes of each numeral, cell units.
const GBOX = GUM.map((ps) => {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [ax, ay, bx, by, r] of ps) {
    x0 = Math.min(x0, ax - r, bx - r); x1 = Math.max(x1, ax + r, bx + r);
    y0 = Math.min(y0, ay - r, by - r); y1 = Math.max(y1, ay + r, by + r);
  }
  return [x0 - 2, y0 - 2, x1 + 2, y1 + 2];
});

function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// Each numeral's tubes packed for the inner loop: ax, ay, dx, dy, 1/len2, r.
const PACK = GUM.map((ps) => {
  const a = new Float64Array(ps.length * 6);
  ps.forEach(([ax, ay, bx, by, r], i) => {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    a.set([ax, ay, dx, dy, l2 ? 1 / l2 : 0, r], i * 6);
  });
  return a;
});

/** Signed distance (cell units) to numeral d, its tubes swollen by `rad`. */
function gumDist(d, u, v, rad) {
  const p = PACK[d], n = p.length;
  let best = 1e9;
  for (let i = 0; i < n; i += 6) {
    const qx = u - p[i], qy = v - p[i + 1], dx = p[i + 2], dy = p[i + 3];
    let t = (qx * dx + qy * dy) * p[i + 4];
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = qx - t * dx, ey = qy - t * dy;
    const e = Math.sqrt(ex * ex + ey * ey) - p[i + 5] * rad;
    if (e < best + 2.4) best = smin(best, e, 2.4);
  }
  return best;
}

/**
 * A blown numeral at screen centre (cx, cy), scale s, squash q (x wider, y
 * shorter when q > 0), tube swelling rad. Returns a sampler (px, py) -> signed
 * screen distance, and its screen box.
 */
function gumShape(d, cx, cy, s, q, rad) {
  const sx = s * (1 + q), sy = s * (1 - q);
  const b = GBOX[d];
  const box = [cx + (b[0] - BW / 2) * sx * rad - 2, cy + (b[1] - BH / 2) * sy * rad - 2,
    (b[2] - b[0]) * sx * rad + 4, (b[3] - b[1]) * sy * rad + 4];
  const dist = (px, py) => gumDist(d, (px - cx) / sx + BW / 2, (py - cy) / sy + BH / 2, rad) * s;
  return { dist, box, sx, sy, cx, cy };
}

/**
 * Sample a shape's signed distance once per pixel over its box (clipped to a
 * W x H canvas), skipping 4x4 blocks whose centre is far outside. `extra` is
 * smooth-unioned in (the neck from the lips).
 */
const SLOTS = [new Float32Array(256 * 128), new Float32Array(256 * 128)];
function field(shape, W, H, extra = null, slot = 0) {
  const x0 = Math.max(0, Math.floor(shape.box[0]) - 2), y0 = Math.max(0, Math.floor(shape.box[1]) - 2);
  const x1 = Math.min(W, Math.ceil(shape.box[0] + shape.box[2]) + 2), y1 = Math.min(H, Math.ceil(shape.box[1] + shape.box[3]) + 2);
  const w = Math.max(0, x1 - x0), h = Math.max(0, y1 - y0);
  const d = SLOTS[slot].subarray(0, w * h).fill(99);
  const at = (px, py) => {
    let v = shape.dist(px, py);
    if (extra) v = smin(v, extra(px, py), 3);
    return v;
  };
  for (let by = 0; by < h; by += 4)
    for (let bx = 0; bx < w; bx += 4) {
      if (at(x0 + bx + 2, y0 + by + 2) > 4) continue;
      for (let j = by; j < Math.min(h, by + 4); j++)
        for (let i = bx; i < Math.min(w, bx + 4); i++) d[j * w + i] = at(x0 + i + 0.5, y0 + j + 0.5);
    }
  return { x0, y0, w, h, d, shineMaxY: shape.cy - 0.08 * BH * shape.sy };
}

/**
 * Fill a sampled gum shape with its gloss: lit, with a black shine band just
 * inside every edge that faces the light (upper left), like a drawn bubble letter.
 */
function fillGum(g, F) {
  const { x0, y0, w, h, d, shineMaxY } = F;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const v = d[j * w + i];
      if (v >= 0) continue;
      if (v > -3.2 && v < -1.9 && y0 + j + 0.5 < shineMaxY) {
        const up = i > 0 && j > 0 ? d[(j - 1) * w + i - 1] : 99;
        if ((up - v) / 1.414 > 0.88) continue;
      }
      g.pixel(x0 + i, y0 + j, 1);
    }
}

/** Clear a moat round a shape so the shape in front reads as in front. */
function moat(g, F, mw = 1.4) {
  const { x0, y0, w, h, d } = F;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) if (d[j * w + i] < mw) g.pixel(x0 + i, y0 + j, 0);
}

/** Digit specimen for the review sheet: all ten at rest, 0..4 over 5..9. */
export function specimen(g, t = 0) {
  for (let i = 0; i < 10; i++) {
    const cx = 20 + (i % 5) * 36, cy = 28 + Math.floor(i / 5) * 54;
    fillGum(g, field(gumShape(i, cx, cy, 1, 0, 1), g.width, g.height));
  }
}

// ---------------------------------------------------------------- cap numerals
// The hour is the kid's team number, felt block numerals sewn on the cap.
const CAPD = [
  ['.#####.', '##...##', '##...##', '##...##', '##...##', '##...##', '##...##', '##...##', '##...##', '.#####.'],
  ['..###..', '.####..', '##.##..', '...##..', '...##..', '...##..', '...##..', '...##..', '...##..', '.######'],
  ['.#####.', '##...##', '.....##', '.....##', '....##.', '...##..', '..##...', '.##....', '##.....', '#######'],
  ['######.', '.....##', '.....##', '....##.', '..###..', '....##.', '.....##', '.....##', '##...##', '.#####.'],
  ['....##.', '...###.', '..####.', '.##.##.', '##..##.', '#######', '....##.', '....##.', '....##.', '....##.'],
  ['#######', '##.....', '##.....', '######.', '.....##', '.....##', '.....##', '.....##', '##...##', '.#####.'],
  ['.#####.', '##...##', '##.....', '######.', '##...##', '##...##', '##...##', '##...##', '##...##', '.#####.'],
  ['#######', '.....##', '.....##', '....##.', '....##.', '...##..', '...##..', '..##...', '..##...', '..##...'],
  ['.#####.', '##...##', '##...##', '##...##', '.#####.', '##...##', '##...##', '##...##', '##...##', '.#####.'],
  ['.#####.', '##...##', '##...##', '##...##', '##...##', '.######', '.....##', '.....##', '##...##', '.#####.'],
].map((rows) => sprite(rows));

const EYE = sprite(['..###..', '.#...#.', '#.....#', '#.....#', '#.....#', '.#...#.', '..###..']);
const LIPS = sprite(['.###.', '#...#', '#...#', '.###.']);
const SHOE = sprite(['.####.', '######', '######']);
// T-shirt, hand drawn: neck at the top, sleeve and fist forward.
const TEE = sprite([
  '.....####.......',
  '...########.....',
  '.############...',
  '##############..',
  '###.########.##.',
  '###.########..##',
  '##..########..##',
  '##..########...#',
  '....########....',
  '....########....',
  '....########....',
]);

// ---------------------------------------------------------------- the kid
// Profile, facing right, head centre (x, y). The head is a hand-placed
// silhouette (skull, nose, cheek and chin) drawn as a bold 2 px contour.
const RING = [[1.8, 0], [-1.8, 0], [0, 1.8], [0, -1.8], [1.3, 1.3], [-1.3, 1.3], [1.3, -1.3], [-1.3, -1.3]];
function headIn(x, y, jaw, px, py) {
  const dx = px - x, dy = py - y - 3;
  if ((dx / 13) ** 2 + (dy / 12.4) ** 2 < 1) return true;
  if ((px - x - 12.8) ** 2 + (py - y - 2.8) ** 2 < 5.3) return true;           // nose
  const cy = y + 10 + jaw;
  return ((px - x - 6.5) / 6) ** 2 + ((py - cy) / 4.6) ** 2 < 1;              // chin, drops when chewing
}

function drawKid(g, x, y, k) {
  // legs (they swing when he is lifted) and sneakers, then the tee
  const sw = k.swing * k.dangle;
  for (const [hx, ph] of [[x - 4, 0], [x + 1, 1.7]]) {
    const ang = sw * Math.sin(ph + 0.5) + 0.15 * k.dangle;
    const fx = hx + 5 * Math.sin(ang), fy = y + 26 + 5 * Math.cos(ang) + k.dangle;
    g.thickLine(Math.round(hx), Math.round(y + 26), Math.round(fx), Math.round(fy), 2);
    g.blit(SHOE, fx - 2, fy - 0.5);
  }
  g.blit(TEE, x - 9, y + 15);
  // head
  const jaw = k.jaw * 1.4;
  const box = [x - 15, y - 12, 31, 31];
  g.fillWhere((px, py) => headIn(x, y, jaw, px, py), 0, box);
  g.fillWhere((px, py) => {
    if (!headIn(x, y, jaw, px, py)) return false;
    for (const [ux, uy] of RING) if (!headIn(x, y, jaw, px + ux, py + uy)) return true;
    return false;
  }, 1, box);
  // hair tuft at the back, under the cap
  g.fillPolygon([[x - 13, y - 2], [x - 8, y - 2], [x - 12, y + 3], [x - 11, y], [x - 15, y + 2]]);
  // eye: big, with a pupil that follows the bubble
  const ex = Math.round(x + 2), ey = Math.round(y - 0.5);
  if (k.blink > 0.5) {
    g.hline(ex, ey + 4, 7); g.hline(ex + 1, ey + 5, 5);
  } else {
    g.blit(EYE, ex, ey);
    const sz = k.wide ? 2 : 3;
    const pxp = ex + 2 + Math.round(clamp(k.gx, -1, 1) * 1.4 - (sz - 3) * 0.5);
    const pyp = ey + 2 + Math.round(clamp(k.gy, -1, 1) * 1.2 - (sz - 3) * 0.5);
    g.fillRect(pxp, pyp, sz, sz);
  }
  const bl = Math.round(k.brow * 1.5);
  g.line(ex + 1, ey - 2 - bl, ex + 6, ey - 2 - bl + (k.brow > 0.5 ? -1 : 0));
  // cheek and mouth
  if (k.puff > 0.35) g.arc(x + 5, y + 10, 1.5 + k.puff * 1.2, 2.6 + k.puff * 1.2, 70 * D2R, 170 * D2R);
  if (k.mouth === 'blow') {
    g.fillRect(Math.round(x + 11), Math.round(y + 7), 5, 4, 0);
    g.blit(LIPS, Math.round(x + 11), Math.round(y + 7));
  } else {
    const mx = Math.round(x + 9), my = Math.round(y + 8 + jaw * 0.6);
    if (k.jaw > 0.4) { g.fillRect(mx, my - 1, 4, 3); g.fillRect(mx + 1, my, 2, 1, 0); }
    else g.hline(mx, my, 4);
  }
  // gum stuck all over the face after a pop: a draped sheet with a hole
  // where the eye blinks out, strings hanging off the chin and the brim
  if (k.plaster > 0) {
    const pl = k.plaster, cx = lerp(x + 15, x + 8, pl), cy = lerp(y + 8, y + 4.5, pl);
    const blobs = [[cx, cy, 8 * pl], [cx + 5 * pl, cy - 4 * pl, 5 * pl], [cx - 5 * pl, cy - 3 * pl, 5 * pl],
      [cx + 6 * pl, cy + 5 * pl, 4.6 * pl], [cx - 3 * pl, cy + 7 * pl, 4 * pl], [cx + 10 * pl, cy, 3.4 * pl]];
    const strings = [[cx - 4, 4 + 6 * k.drip], [cx + 1, 6 + 9 * k.drip], [cx + 7, 5 + 4 * k.drip]];
    g.fillWhere((px, py) => {
      for (const [bx2, by2, r] of blobs) if ((px - bx2) ** 2 + (py - by2) ** 2 < r * r) return true;
      if (pl < 0.7) return false;
      for (const [sx, len] of strings) {
        const top = cy + 8, u = (py - top) / len;
        if (u > 0 && u < 1 && Math.abs(px - sx - 1.5 * Math.sin(u * 3)) < (u > 0.85 ? 1.4 : 0.8)) return true;
      }
      return false;
    }, 1, [cx - 14, cy - 13, 30, 40]);
    if (pl > 0.6) {
      // the eye blinks through the gum
      g.fillEllipse(ex + 3.5, ey + 3.5, 3.6, 3.3, 0);
      if (k.blink > 0.5) g.hline(ex + 1, ey + 4, 5);
      else g.fillRect(ex + 2, ey + 2, 3, 3);
    }
  }
  drawCap(g, x + k.cap.dx, y + k.cap.dy, k.cap.c, k.hour);
}

/** The cap, its crown a boxy dome with the hour sewn on, brim forward. c = cos(spin). */
function drawCap(g, x, y, c, hour) {
  const cs = Math.max(0.12, Math.abs(c)), dir = c >= 0 ? 1 : -1;
  const ccx = x - 1 * dir, base = y - 2;
  const se = (dx, dy, rx, ry) => Math.abs(dx / rx) ** 2.6 + Math.abs(dy / ry) ** 2.6 < 1;
  const box = [ccx - 17, base - 17, 34, 19];
  // clear what the cap hides, then the crown outline and its 2 px band
  g.fillWhere((px, py) => py <= base + 1 && se((px - ccx) / cs, py - base, 16.4, 16), 0, box);
  g.fillWhere((px, py) => {
    if (py > base + 1) return false;
    const dx = (px - ccx) / cs, dy = py - base;
    if (!se(dx, dy, 16, 15.6)) return false;
    return py >= base - 1 || !se(dx * cs > 0 ? dx + (1 - cs) * 0 : dx, dy, 16 - 2 / cs, 13.6);
  }, 1, box);
  g.fillRect(Math.round(ccx - 1.5 * cs), Math.round(base - 16.6), Math.max(1, Math.round(3 * cs)), 1);
  // brim
  const b0 = ccx + 13 * cs * dir, b1 = ccx + 26 * cs * dir;
  g.fillPolygon([[b0, base - 1], [b1, base + 0.6], [b1, base + 2.4], [b0, base + 2]]);
  // the hour: two felt numerals, squeezed with the spin
  const d0 = CAPD[+hour[0]], d1 = CAPD[+hour[1]];
  const top = Math.round(base - 12);
  g.fillWhere((px, py) => {
    const u = (px - ccx) / cs + 7.5, v = Math.floor(py - top);
    if (v < 0 || v > 9 || u < 0 || u >= 15) return false;
    const ui = Math.floor(u);
    if (ui < 7) return d0.data[v * 7 + ui] === 1;
    if (ui > 7) return d1.data[v * 7 + ui - 8] === 1;
    return false;
  }, 1, [ccx - 9, top, 18, 10]);
}

// ---------------------------------------------------------------- the scene
const HX = 21, HY = 28;                  // the kid's head at rest
const TX = 64, UX = 94, DY = 31;         // the two numerals at rest
const POP = { shreds: [0.03, 0.24], plaster: [0.2, 0.62], slurp: [0.62, 0.86], chew: [0.86, 1.1], blow: [1.05, 2.0] };
const LIFT = 13;

function burst(g, cx, cy, t) {
  // comic pop: one jagged starburst where the bubble was, a tenth of a second
  const u = t / 0.11;
  if (u < 0 || u >= 1) return;
  const pts = [];
  const sc = 0.85 + 0.3 * ease.outQuad(u);
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const r = (i % 2 ? 0.62 : 1) * sc * (1 + 0.12 * Math.sin(i * 2.7));
    pts.push([cx + 30 * r * Math.cos(a), cy + 25 * r * Math.sin(a)]);
  }
  pts.push(pts[0]);
  g.stroke(pts, 2);
}

/** The gum snapping back like a rubber band, from where the bubble was into the face. */
function snapBack(g, face, from, u) {
  const e = ease.inCubic(u);
  for (const [dy, w, lag] of [[0, 1, 0], [-9, 0.7, 0.12], [8, 0.75, 0.2]]) {
    const v = clamp((e - lag) / (1 - lag), 0, 1);
    const tx = lerp(from[0], face[0] + 2, v), ty = lerp(from[1] + dy, face[1] + dy * 0.2, v) + 3 * Math.sin(Math.PI * v) * (dy ? Math.sign(dy) : -1);
    const r0 = 1.2 * w, r1 = (2.6 + 2 * v) * w;
    const dx = tx - face[0], dyy = ty - face[1], L2 = dx * dx + dyy * dyy || 1;
    g.fillWhere((px, py) => {
      const q = clamp(((px - face[0]) * dx + (py - face[1]) * dyy) / L2, 0, 1);
      return Math.hypot(px - face[0] - q * dx, py - face[1] - q * dyy) < lerp(r0, r1, q * q);
    }, 1, [Math.min(face[0], tx) - 6, Math.min(face[1], ty) - 6, Math.abs(dx) + 12, Math.abs(dyy) + 12]);
  }
}

export default {
  name: 'Bubblegum',
  blurb: 'A kid blows the minute as a bubble-letter gum bubble that breathes and wobbles; each minute it swells too far and POPS all over his face, he slurps it back, chews and blows the next one. The hour is the number on his cap, and on the hour the bubble floats him off his feet, pops, and the cap spins round to the new hour.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  frame(g, ctx) {
    const { fields: f, date, oled } = ctx;
    oled.contrast(Math.round(0xcf + (0x24 - 0xcf) * ctx.night));
    const [ox, oy] = orbit(date, 2, 3);
    const T = (date.getTime() / 1000) % 86400;
    const sec = f.sec;
    const prev = previousMinute(date);

    // the kid's lift on the hour: up through :59:52-:59:59.6, dropped at :00
    let lift = 0, dangle = 0;
    if (f.m === 59) { lift = LIFT * ease.inOutCubic(progress(sec, 52, 59.7)); dangle = progress(sec, 52, 54); }
    else if (f.m === 0 && sec < 0.32) { lift = LIFT * (1 - (sec / 0.32) ** 2); dangle = 1; }
    const land = f.m === 0 && sec >= 0.32 && sec < 0.6 ? Math.sin(Math.PI * progress(sec, 0.32, 0.6)) : 0;
    const sway = f.m === 59 ? 2.2 * Math.sin(T * 2.1) * dangle : 0;
    const kx = HX + ox + sway, ky = HY + oy - lift + land * 1.2;

    // breathing and wobble at rest
    const breath = Math.sin(2 * Math.PI * T / 3.4);
    const puffEv = sec > 3 ? Math.max(0, Math.sin(Math.PI * progress(sec % 15, 0, 1.1))) * (sec % 15 < 1.1 ? 1 : 0) : 0;
    const over = f.m === 59 ? 0.6 * ease.inQuad(progress(sec, 50, 60)) : progress(sec, 56.8, 60) ** 2.2;
    const shake = progress(sec, 59.3, 60);

    const k = {
      jaw: 0, mouth: 'blow', gx: 1, gy: 0, blink: 0, brow: 0, puff: 0.3 + 0.3 * breath + puffEv + over,
      dangle, swing: Math.sin(T * 6.5) * 0.8, wide: over > 0.5, drip: 0, plaster: 0,
      cap: { dx: 0, dy: 0, c: 1 }, hour: f.hh,
    };
    k.brow = over > 0.3 ? 1 : 0;
    if ((T % 5.3) < 0.13 && over < 0.3) k.blink = 1;
    // now and then he glances up at his cap
    const glance = (sec > 20 && sec < 22.5) || (sec > 40 && sec < 41.5);
    if (glance) { k.gx = -0.3; k.gy = -1; }

    // ---------------------------------------- the turn: pop, plaster, slurp, chew
    const turning = sec < POP.blow[1];
    let blowE = 1;
    if (turning) {
      k.puff = 0;
      if (sec < POP.slurp[1]) {
        const pl = sec < POP.plaster[0] ? progress(sec, POP.shreds[0], POP.plaster[0]) * 0.8
          : sec < POP.slurp[0] ? 1 : 1 - ease.inQuad(progress(sec, POP.slurp[0], POP.slurp[1]));
        k.plaster = pl; k.drip = progress(sec, 0.25, 0.6);
        k.blink = (sec > 0.3 && sec < 0.4) || (sec > 0.5 && sec < 0.56) ? 1 : 0;
        k.mouth = 'chew'; k.brow = 1;
      } else if (sec < POP.blow[0]) {
        k.mouth = 'chew'; k.jaw = Math.sin(Math.PI * progress(sec, POP.chew[0] - 0.12, POP.chew[1])) ;
      }
      blowE = sec < POP.blow[0] ? 0 : ease.outBack(progress(sec, POP.blow[0], POP.blow[1]));
      if (sec >= POP.blow[0]) k.puff = 1 - progress(sec, POP.blow[0], POP.blow[1]);
    }
    // the cap on the hour: knocked up at the pop, spins once, lands
    if (f.m === 0 && sec < 1.5) {
      const t = sec;
      let dy = t < 1.2 ? -LIFT - 10 * t + 15.3 * t * t : -2 * Math.sin(Math.PI * progress(t, 1.2, 1.45));
      dy += lift + -land * 1.2;   // the cap is not tied to the falling head
      const phi = Math.PI / 2 + 1.5 * Math.PI * ease.outQuad(progress(t, 0, 1.2));
      k.cap = { dx: 0, dy, c: Math.cos(phi) };
    }

    drawKid(g, kx, ky, k);
    // the kerb he stands on: paving joints that step along every minute
    for (let x = 1 + ox; x < 39 + ox; x++) if ((x + f.minuteKey) % 7 !== 0) g.pixel(x, 63);
    // his shadow on the kerb, shrinking as the bubble lifts him off his feet
    if (lift > 0.5) {
      const sw2 = Math.round(16 * (1 - 0.6 * lift / LIFT));
      g.fillRect(Math.round(kx - 1 - sw2 / 2), 61, sw2, 1);
      g.fillRect(Math.round(kx - 1 - sw2 / 2) + 1, 60, Math.max(0, sw2 - 2), 1, 0);
    }

    // ---------------------------------------- the gum numerals
    const lips = [kx + 15, ky + 9];
    const digits = turning && sec < POP.blow[0] ? null : f.mm;
    if (turning && sec < 0.11) burst(g, (TX + UX) / 2 + ox, DY + oy, sec);
    if (turning && sec > POP.shreds[0] && sec < POP.shreds[1])
      snapBack(g, [kx + 14, ky + 6], [UX + 8 + ox, DY + oy], progress(sec, POP.shreds[0], POP.shreds[1]));
    if (digits) {
      const lifted = f.m === 59 ? lift * 0.25 : 0;
      const shapes = [];
      for (let i = 0; i < 2; i++) {
        const d = +digits[i];
        const ph = i * 2.1;
        const e = turning ? ease.outBack(progress(sec, POP.blow[0] + i * 0.12, POP.blow[1] + i * 0.12)) : 1;
        const restX = (i ? UX : TX) + ox, restY = DY + oy;
        const amp = 1 + 2.5 * over;
        let cx = lerp(lips[0] + 6 + i * 4, restX, e) + 0.6 * Math.sin(2 * Math.PI * T / 3.7 + ph) * amp;
        let cy = lerp(lips[1], restY, e) + 0.9 * Math.sin(2 * Math.PI * T / 2.3 + ph) * amp - lifted;
        if (shake > 0) { cx += 0.8 * shake * Math.sin(T * 71 + ph); cy += 0.6 * shake * Math.sin(T * 53 + ph); }
        const q = 0.035 * Math.sin(2 * Math.PI * T / 1.15 + ph) * amp;
        const s = lerp(0.3, 1, e) * (1 + 0.015 * breath + 0.03 * puffEv + 0.16 * over);
        const rad = lerp(0.2, 1, e) * (1 + 0.07 * breath + 0.12 * puffEv + 0.16 * over);
        // the units numeral sits a little forward of the tens, toward the viewer
        if (i === 1) cx = Math.max(cx, (shapes[0]?.cx ?? 0) + 18 * s);
        shapes.push(gumShape(d, cx, cy, s, q, rad));
      }
      // the neck from the lips into the tens numeral
      const s0 = shapes[0], at = ATTACH[+digits[0]];
      const ax = s0.cx + (at[0] - BW / 2) * s0.sx, ay = s0.cy + (at[1] - BH / 2) * s0.sy;
      // a sagging gum strand: quadratic from the lips, dipping, into the numeral
      const mxp = (lips[0] + ax) / 2, myp = Math.max(lips[1], ay) + 4;
      const segs = [];
      let px0 = lips[0], py0 = lips[1];
      for (let j = 1; j <= 5; j++) {
        const u = j / 5, w0 = (1 - u) ** 2, w1 = 2 * u * (1 - u), w2 = u * u;
        const qx = w0 * lips[0] + w1 * mxp + w2 * ax, qy = w0 * lips[1] + w1 * myp + w2 * ay;
        segs.push([px0, py0, qx, qy, 1.0 + 1.1 * u * u]);
        px0 = qx; py0 = qy;
      }
      const neck = (px, py) => {
        let d = 1e9;
        for (const q of segs) d = Math.min(d, segDist(px, py, q[0], q[1], q[2], q[3]) - q[4]);
        return d;
      };
      g.fillWhere((px, py) => neck(px, py) < 0, 1, [Math.min(lips[0], ax) - 4, Math.min(lips[1], ay) - 4, Math.abs(ax - lips[0]) + 8, myp - Math.min(lips[1], ay) + 8]);
      fillGum(g, field(s0, 128, 64, neck));
      const F1 = field(shapes[1], 128, 64, null, 1);
      moat(g, F1);
      fillGum(g, F1);
    }
  },
};
