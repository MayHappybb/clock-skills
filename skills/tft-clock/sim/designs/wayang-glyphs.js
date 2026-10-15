// Wayang: the numerals as carved leather puppets (flash tables, built at load).
//
// Every digit body is drawn as tapered brush strokes the way a tatah-carver
// lays out a puppet: fat swelling strokes with pointed, curled (ukel)
// terminals, and a row of punched holes (bubukan) running down the middle of
// every thick stroke. The strokes are stamped as discs on a 4x grid, the
// holes are punched out of it, and an exact distance transform turns the
// mask into a signed distance table (Int8, 1/4 px units). A soft shadow is
// then only a different ramp on the same distance: when a puppet leaves the
// screen its penumbra widens and the 2 px holes fill in by themselves, as
// they do on a real kelir.
//
// Heads are separate small tables (pixel-drawn profiles, mirrored when the
// puppet faces left). Each table carries a paint map too: what the painted
// side of the leather shows when the puppet is pressed against the screen
// (gold prada on the rims, a character colour in the core).

export const Q = 4;          // distance units per pixel
export const M = 7;          // table margin, px (room for the penumbra)
export const BW = 24, BH = 46;   // digit body, px
export const TW = BW + 2 * M, TH = BH + 2 * M;

// ------------------------------------------------------------ stroke stamping

/** A 4x-supersampled mask for a w x h px area whose origin is at (-m, -m) in glyph px. */
function mask(w, h, m) {
  const W4 = w * 4, H4 = h * 4;
  return { W4, H4, m, a: new Uint8Array(W4 * H4) };
}

function disc(mk, x, y, r, v) {
  const { W4, H4, m, a } = mk;
  const cx = (x + m) * 4, cy = (y + m) * 4, R = r * 4;
  const x0 = Math.max(0, Math.floor(cx - R - 1)), x1 = Math.min(W4 - 1, Math.ceil(cx + R + 1));
  const y0 = Math.max(0, Math.floor(cy - R - 1)), y1 = Math.min(H4 - 1, Math.ceil(cy + R + 1));
  const R2 = R * R;
  for (let j = y0; j <= y1; j++) {
    const dy = j + 0.5 - cy;
    for (let i = x0; i <= x1; i++) {
      const dx = i + 0.5 - cx;
      if (dx * dx + dy * dy <= R2) a[j * W4 + i] = v;
    }
  }
}

/** Sample a path function u -> [x, y] into points spaced <= 0.2 px, with radius r(u). */
function sample(fn, rfn) {
  const pts = [];
  let [px, py] = fn(0), len = 0;
  const N = 400;
  for (let k = 0; k <= N; k++) {
    const u = k / N, [x, y] = fn(u);
    len += Math.hypot(x - px, y - py); px = x; py = y;
    pts.push([x, y, rfn(u), len]);
  }
  return pts;
}

const lerp = (a, b, u) => a + (b - a) * u;
const D2R = Math.PI / 180;

// path builders: each returns u -> [x, y]
const L = (x0, y0, x1, y1) => (u) => [lerp(x0, x1, u), lerp(y0, y1, u)];
const E = (cx, cy, rx, ry, a0, a1) => (u) => { const a = lerp(a0, a1, u) * D2R; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; };
const B = (p0, p1, p2, p3) => (u) => {
  const v = 1 - u;
  return [v * v * v * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0],
    v * v * v * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1]];
};
/** A spiral (the ukel curl): radius shrinking from r0 to r1 while the angle runs a0 -> a1. */
const S = (cx, cy, r0, r1, a0, a1) => (u) => { const a = lerp(a0, a1, u) * D2R, r = lerp(r0, r1, u); return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };

// radius profiles
const K = (r) => () => r;
const T = (r0, r1) => (u) => lerp(r0, r1, u);
/** swell: r0 at the start, rm in the middle, r1 at the end */
const W3 = (r0, rm, r1) => (u) => (u < 0.5 ? lerp(r0, rm, Math.sin(u * Math.PI)) : lerp(r1, rm, Math.sin(u * Math.PI)));

// A stroke: [path, radius, holes?]. Holes are punched along strokes whose radius >= 2.9.
const DIGITS = [
  // 0: a tall almond, swelling at the sides
  [[E(12, 23, 8.4, 19.4, 0, 360), (u) => 2.7 + 1.0 * Math.abs(Math.cos(u * 2 * Math.PI)), 1]],
  // 1: a straight stem with a long curled flag
  [[L(14, 3, 14, 44), T(3.3, 3.7), 1],
    [B([14, 3.2], [10, 3.6], [6.5, 6.5], [5.2, 10.5]), T(3.2, 2.2), 0],
    [S(7.6, 10.6, 2.4, 1.4, 180, 30), T(2.2, 1.2), 0]],
  // 2: curled hook, swan neck, flat foot with an upturned tip
  [[S(7.2, 12.2, 2.6, 1.6, 0, -170), T(2.4, 1.3), 0],
    [E(12, 11.4, 7.6, 7.8, 180, 385), W3(2.6, 3.6, 3.4), 1],
    [B([19.1, 14.6], [17.5, 24], [8, 31], [4, 42.4]), T(3.4, 3.4), 1],
    [L(4, 42.4, 20.5, 42.4), K(3.4), 1],
    [B([20.5, 42.4], [21.8, 42.4], [22.5, 41.5], [23, 39]), T(3.2, 1.4), 0]],
  // 3: two bowls, a pointed middle tongue, a curled foot
  [[S(6.4, 9.6, 2.4, 1.6, 20, -160), T(2.2, 1.2), 0],
    [E(11.5, 10.6, 7.6, 7.4, 180, 450), W3(2.4, 3.3, 3.0), 1],
    [L(11.5, 18.4, 7.5, 18.6), T(3.0, 1.4), 0],
    [E(11.5, 30.6, 8.8, 11.6, 272, 488), W3(3.0, 3.8, 2.6), 1],
    [S(5.6, 38.2, 2.6, 1.4, 128, 300), T(2.4, 1.2), 0]],
  // 4: open top, two stems, the right one long
  [[L(6.2, 3.4, 4.6, 29.8), T(2.8, 3.4), 1],
    [L(4.6, 29.8, 21.4, 29.8), K(3.1), 1],
    [L(17.8, 2.6, 17.8, 44), T(3.0, 3.7), 1]],
  // 5: flag with a flicked tip, a back stroke, a full belly, a curled foot
  [[L(7.6, 3.6, 20, 3.6), K(3.2), 1],
    [B([20, 3.6], [21.2, 3.6], [22, 3], [22.6, 1.4]), T(3.0, 1.3), 0],
    [L(7.4, 3.6, 6.4, 21.4), K(3.3), 1],
    [E(11.6, 30.6, 9, 11.5, 232, 482), W3(3.0, 3.8, 2.6), 1],
    [S(6.2, 38.6, 2.6, 1.4, 126, 300), T(2.4, 1.2), 0]],
  // 6: a swept ascender with a curled tip falling into a round belly
  [[E(12, 32.2, 8.4, 10.4, 0, 360), (u) => 2.8 + 0.9 * Math.abs(Math.cos(u * 2 * Math.PI)), 1],
    [B([3.7, 31], [3.4, 16], [8.6, 4.2], [17.4, 3.6]), T(3.6, 2.6), 1],
    [S(17.6, 6.2, 2.6, 1.4, -90, 60), T(2.4, 1.2), 0]],
  // 7: a bar with a dropped serif, a long sweeping leg
  [[L(4, 3.6, 20.6, 3.6), K(3.3), 1],
    [B([4, 3.6], [3.4, 5], [3.2, 7], [3.4, 9.6]), T(3.0, 1.4), 0],
    [B([20.6, 3.6], [19.4, 16], [12.6, 28], [10.6, 43.6]), T(3.5, 3.0), 1]],
  // 8: a small head loop over a large belly loop
  [[E(12, 11.8, 7.0, 7.8, 0, 360), K(3.0), 1],
    [E(12, 32.2, 8.6, 10.4, 0, 360), (u) => 2.9 + 0.8 * Math.abs(Math.cos(u * 2 * Math.PI)), 1]],
  // 9: a round head and a tail sweeping to a curled tip
  [[E(12, 13.8, 8.4, 10.4, 0, 360), (u) => 2.8 + 0.9 * Math.abs(Math.cos(u * 2 * Math.PI)), 1],
    [B([20.4, 15], [20.6, 32], [17, 41.4], [8.4, 43]), T(3.6, 2.6), 1],
    [S(6.6, 40.6, 2.6, 1.4, 90, 260), T(2.4, 1.2), 0]],
];

// ------------------------------------------------------------ the distance transform

const INF = 1e12;
function edt1(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s;
    for (;;) {
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      if (s <= z[k]) { k--; continue; }
      break;
    }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}
/** Squared distance (in 4x cells) from every cell to the nearest cell where on[i] is true. */
function edt(on, W4, H4) {
  const n = Math.max(W4, H4);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  const g = new Float64Array(W4 * H4);
  for (let i = 0; i < W4 * H4; i++) g[i] = on[i] ? 0 : INF;
  for (let x = 0; x < W4; x++) {
    for (let y = 0; y < H4; y++) f[y] = g[y * W4 + x];
    edt1(f, H4, d, v, z);
    for (let y = 0; y < H4; y++) g[y * W4 + x] = d[y];
  }
  for (let y = 0; y < H4; y++) {
    for (let x = 0; x < W4; x++) f[x] = g[y * W4 + x];
    edt1(f, W4, d, v, z);
    for (let x = 0; x < W4; x++) g[y * W4 + x] = d[x];
  }
  return g;
}

/** Mask -> Int8 signed distance at the 1x pixel centres (negative inside), 1/Q px units. */
function toSDF(mk, w, h) {
  const { W4, H4, a } = mk;
  const inside = edt(a, W4, H4);                          // distance to leather (outside cells)
  const notA = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) notA[i] = a[i] ? 0 : 1;
  const outside = edt(notA, W4, H4);                      // distance to ground (inside cells)
  const sdf = new Int8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      // the pixel centre sits between four 4x cells: average them
      let s = 0;
      for (const [ox, oy] of [[1, 1], [2, 1], [1, 2], [2, 2]]) {
        const i = (y * 4 + oy) * W4 + x * 4 + ox;
        s += a[i] ? -(Math.sqrt(outside[i]) - 0.5) : Math.sqrt(inside[i]) - 0.5;
      }
      const dpx = s / 4 / 4;                              // 4x cells -> px
      sdf[y * w + x] = Math.max(-127, Math.min(127, Math.round(dpx * Q)));
    }
  return sdf;
}

// ------------------------------------------------------------ digit bodies

export const PAINT_NONE = 0, PAINT_GOLD = 1, PAINT_RED = 2, PAINT_BLUE = 3;
const CORE = [PAINT_RED, PAINT_BLUE, PAINT_RED, PAINT_BLUE, PAINT_RED, PAINT_BLUE, PAINT_RED, PAINT_BLUE, PAINT_RED, PAINT_BLUE];

function buildDigit(d) {
  const mk = mask(TW, TH, M);
  const holes = [];
  for (const [path, rfn, punch] of DIGITS[d]) {
    const pts = sample(path, rfn);
    for (const [x, y, r] of pts) disc(mk, x, y, r, 1);
    if (!punch) continue;
    const total = pts[pts.length - 1][3];
    let next = 2.6;
    for (const [x, y, r, s] of pts) {
      if (s < next || s > total - 2.4) continue;
      next = s + 4.2;
      if (r < 2.9) continue;
      if (holes.some(([hx, hy]) => (hx - x) ** 2 + (hy - y) ** 2 < 3.6 * 3.6)) continue;
      holes.push([x, y]);
    }
  }
  for (const [x, y] of holes) disc(mk, x, y, 1.05, 0);
  const sdf = toSDF(mk, TW, TH);
  // paint: a gold rim, the character colour in the core
  const paint = new Uint8Array(TW * TH);
  for (let i = 0; i < sdf.length; i++) paint[i] = sdf[i] >= 0 ? 0 : sdf[i] > -2.2 * Q ? PAINT_GOLD : CORE[d];
  // where the head joins: the top of the digit's top stroke
  let neck = 12;
  for (let y = 0; y < TH && neck === 12; y++) {
    let a = -1, b = -1;
    for (let x = 0; x < TW; x++) if (sdf[y * TW + x] < -Q) { if (a < 0) a = x; b = x; }
    if (a >= 0) neck = (a + b + 1) / 2 - M;
  }
  return { sdf, paint, neck, holes };
}

/** Where each digit's head sits (x in body px) and the shoulder its arm hangs from. */
const NECK_X = [12, 14, 12, 11.5, 17.8, 13, 12.8, 12.4, 12, 12];

export const BODIES = Array.from({ length: 10 }, (_, d) => {
  const b = buildDigit(d);
  b.neck = NECK_X[d];
  // the outer edge of the leather at shoulder height (y 14..22), each side: arms hang outside it
  let l = BW, r = 0;
  for (let y = M + 14; y < M + 22; y++) for (let x = 0; x < TW; x++) if (b.sdf[y * TW + x] < 0) { l = Math.min(l, x - M); r = Math.max(r, x - M + 1); }
  b.shoulderL = l; b.shoulderR = r;
  // the foot: where the main rod (gapit) leaves the leather at the bottom
  for (let y = TH - 1; y >= 0; y--) {
    let a = 0, n = 0;
    for (let x = 0; x < TW; x++) if (b.sdf[y * TW + x] < -Q) { a += x; n++; }
    if (n >= 2) { b.footX = a / n - M + 0.5; b.footY = y - M; break; }
  }
  return b;
});

// ------------------------------------------------------------ heads (facing right)

// '#' plain leather (black-painted face), 'g' gold, 'r' red, 'o' a punched hole, '.' nothing.
// The bottom row is the neck; its centre column is marked by the 'n' below it (not drawn).
const HEADS = {
  // a ksatria: the forehead sloping straight into a long nose, a slit eye, the gelung bun curling at the back
  ksatria: `
.....ggg........
....gg.gg.......
....g..ggg......
.......ggggg....
......gggggg....
.....g#######...
....gg########..
....g##oo######.
....g##########.
.....###########
.....######.....
......#####.....
......####......
.......###......
.......###......
........n.......`,
  // a king: a tall tiered crown, the garuda ornament hooked at its back, a black face
  raja: `
.......g........
......ggg.......
......ggg.......
.....ggogg......
..g..ggggg......
.gg.gggogggg....
.g.gggggggggg...
...g#########...
...g##oo######..
...g###########.
....############
....######......
.....#####......
......###.......
......###.......
.......n........`,
  // an ogre: a heap of curls for a crown, a round staring eye, a bulb of a nose, fangs
  buta: `
..r.rr.rr.......
.rrrrrrrrr......
.rr#rr#rrrr.....
..rrrrrrrrr.....
..##########....
.###oo#######...
.###oo########..
.#############..
.##############.
.############...
..###.o.o###....
..##########....
...########.....
.....####.......
.....###........
......n.........`,
  // the clown Semar: a round head, the forelock tuft curling forward, a snub nose
  semar: `
........gg......
.........gg.....
..........g.....
....#######.....
...#########....
..###########...
..####oo######..
..####oo#######.
..#############.
..############..
...##########...
....########....
.....######.....
......####......
......###.......
.......n........`,
};
const HEAD_OF = ['semar', 'ksatria', 'raja', 'buta', 'ksatria', 'raja', 'semar', 'buta', 'raja', 'ksatria'];
export const HM = 6;    // head table margin

function buildHead(art) {
  const rows = art.trim().split('\n').map((r) => r.trim());
  const w = rows[0].length, h = rows.length - 1;
  const nx = rows[h].indexOf('n') + 0.5;
  const tw = w + 2 * HM, th = h + 2 * HM;
  const mk = mask(tw, th, HM);
  const pic = new Uint8Array(tw * th);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = rows[y][x];
      if (c === '.' || c === 'o') continue;
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) mk.a[((y + HM) * 4 + j) * mk.W4 + (x + HM) * 4 + i] = 1;
      pic[(y + HM) * tw + x + HM] = c === 'g' ? PAINT_GOLD : c === 'r' ? PAINT_RED : PAINT_NONE;
    }
  const sdf = toSDF(mk, tw, th);
  return { sdf, paint: pic, w: tw, h: th, nx, ny: h };   // neck bottom centre at (nx, ny) in art px
}
const HEAD_TABLES = Object.fromEntries(Object.entries(HEADS).map(([k, a]) => [k, buildHead(a)]));
export const HEAD = HEAD_OF.map((k) => HEAD_TABLES[k]);

export const FLASH_BYTES = BODIES.length * TW * TH * 2 + Object.values(HEAD_TABLES).reduce((a, t) => a + t.w * t.h * 2, 0);
