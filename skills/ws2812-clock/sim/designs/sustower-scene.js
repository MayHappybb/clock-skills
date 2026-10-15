// Su Song tower: the building and its machinery, drawn into a 64 x 192
// linear-light raster. Static carpentry is baked once; the moving parts
// (armillary rings, celestial globe, water wheel, gears, lanterns) are
// drawn each frame by coverage so they glide between pixels.

export const W = 64, H = 192;
export const Y = {
  roof: 0, deck: 27, globe0: 29, eave1: 51, hourL: 56, hour: 58, eave2: 99,
  minL: 104, min: 106, beam: 147, wheel: 151,
};
export const DOORS = [[4, 30, Y.hour], [34, 60, Y.hour], [4, 30, Y.min], [34, 60, Y.min]];
export const WHEEL = { cx: 26, cy: 175, r: 15.5, n: 20 };
export const GLOBE = { cx: 32, cy: 43, r: 11 };
export const ARM = { cx: 32, cy: 14, r: 11.5 };

const sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const C = {
  post: [0.04, 0.005, 0.003], postHi: [0.09, 0.016, 0.007],
  tile: [0.012, 0.03, 0.026], tileHi: [0.03, 0.075, 0.06],
  bronze: [0.13, 0.07, 0.025], gold: [0.6, 0.36, 0.09], goldDim: [0.13, 0.075, 0.018],
  wood: [0.04, 0.018, 0.008], woodHi: [0.09, 0.045, 0.018],
  water: [0.05, 0.22, 0.3], waterHi: [0.4, 0.75, 0.85],
};

export function put(img, x, y, c, a = 1) {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const p = 3 * (y * W + x);
  img[p] += (c[0] - img[p]) * a; img[p + 1] += (c[1] - img[p + 1]) * a; img[p + 2] += (c[2] - img[p + 2]) * a;
}
export function add(img, x, y, c, a = 1) {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const p = 3 * (y * W + x);
  img[p] += c[0] * a; img[p + 1] += c[1] * a; img[p + 2] += c[2] * a;
}
/** Soft additive dot, radius r px (coverage falloff), for glows and splats. */
export function glow(img, x, y, r, c, a) {
  const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(W - 1, Math.ceil(x + r));
  const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(H - 1, Math.ceil(y + r));
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const d2 = ((i + 0.5 - x) ** 2 + (j + 0.5 - y) ** 2) / (r * r);
    if (d2 < 1) add(img, i, j, c, a * (1 - d2) * (1 - d2));
  }
}
/** A 1-px point with bilinear coverage (sub-pixel), painted over. */
export function dot(img, x, y, c, a) {
  x -= 0.5; y -= 0.5;
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  add(img, xi, yi, c, a * (1 - fx) * (1 - fy)); add(img, xi + 1, yi, c, a * fx * (1 - fy));
  add(img, xi, yi + 1, c, a * (1 - fx) * fy); add(img, xi + 1, yi + 1, c, a * fx * fy);
}
/** Anti-aliased line of width w, painted over. */
export function line(img, ax, ay, bx, by, w, c, a = 1) {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - w)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + w));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - w)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + w));
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1e-9;
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const px = i + 0.5, py = j + 0.5;
    let t = ((px - ax) * dx + (py - ay) * dy) / L; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(px - ax - t * dx, py - ay - t * dy);
    const cov = sat(w / 2 + 0.5 - d);
    if (cov > 0) put(img, i, j, c, a * cov);
  }
}
function rect(img, x0, y0, x1, y1, c) { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(img, x, y, c); }

// ------------------------------------------------------- static carpentry
/** An eave: tiled roof band with upturned corners and gold brackets. */
function eave(img, y, h) {
  for (let x = 0; x < W; x++) {
    const e = Math.min(x, W - 1 - x), lift = e < 7 ? (7 - e) ** 2 / 14 : 0;
    const top = y - lift, bot = y + h - lift * 0.6;
    for (let j = Math.floor(top); j < Math.ceil(bot) + 1; j++) {
      const cov = sat(Math.min(j + 1 - top, bot - j));
      if (cov <= 0) continue;
      const row = (j - top) / (bot - top);
      const tileStripe = (x % 3 === 0 ? 0.6 : 1) * (row < 0.3 ? 1.8 : 1);
      put(img, x, j, row > 0.78 ? C.goldDim : [C.tile[0] * tileStripe, C.tile[1] * tileStripe, C.tile[2] * tileStripe], cov);
    }
    if (x % 4 === 1 && e > 3) put(img, x, Math.round(bot) + 1, C.goldDim, 0.8);
  }
  // ridge highlight
  for (let x = 0; x < W; x++) {
    const e = Math.min(x, W - 1 - x), lift = e < 7 ? (7 - e) ** 2 / 14 : 0;
    put(img, x, Math.floor(y - lift), C.tileHi, 0.9);
  }
}
function tier(img, yl, y0, y1) {
  rect(img, 0, yl, W, y0, C.post);
  for (let x = 2; x < W; x += 5) put(img, x, yl, C.goldDim, 0.9);
  for (const [a, b] of [[0, 4], [30, 34], [60, 64]]) {
    rect(img, a, y0, b, y1, C.post);
    for (let y = y0; y < y1; y++) put(img, a, y, C.postHi, 0.8);
    rect(img, a, y0, b, y0 + 1, C.goldDim);
  }
}

let BG = null;
export function background() {
  if (BG) return BG;
  const img = new Float32Array(3 * W * H);
  // roof deck: railing
  rect(img, 0, Y.deck, W, Y.deck + 2, C.wood);
  for (let x = 0; x < W; x++) put(img, x, Y.deck, C.woodHi, 0.9);
  for (let x = 1; x < W; x += 6) { put(img, x, Y.deck - 1, C.woodHi); put(img, x, Y.deck - 2, C.woodHi, 0.6); }
  for (let x = 0; x < W; x++) put(img, x, Y.deck - 3, C.wood, 0.9);
  // globe storey: pillars and the horizon box
  rect(img, 0, Y.globe0 + 2, 3, Y.eave1, C.post); rect(img, 61, Y.globe0 + 2, 64, Y.eave1, C.post);
  for (let y = GLOBE.cy; y < Y.eave1 - 1; y++) for (let x = 17; x < 47; x++) {
    const edge = y === GLOBE.cy || y === GLOBE.cy + 1;
    put(img, x, y, edge ? C.gold : (x + y) % 7 === 0 ? C.woodHi : C.wood, edge ? 0.55 : 1);
  }
  for (let x = 0; x < W; x++) put(img, x, Y.eave1 - 1, C.woodHi, 0.7);
  eave(img, Y.eave1 + 1, 3.5);
  tier(img, Y.hourL, Y.hour, Y.eave2);
  eave(img, Y.eave2 + 1.2, 3.2);
  tier(img, Y.minL, Y.min, Y.beam);
  // the base beam
  rect(img, 0, Y.beam, W, Y.beam + 3, C.wood);
  for (let x = 0; x < W; x++) put(img, x, Y.beam, C.woodHi);
  // wheel house: back posts, the tank and the reservoir
  rect(img, 0, Y.wheel, 2, H, C.post); rect(img, 62, Y.wheel, 64, H, C.post);
  for (let y = 154; y < 168; y++) for (let x = 47; x < 60; x++) {
    const edge = x === 47 || x === 59 || y === 167;
    put(img, x, y, edge ? C.woodHi : y > 156 ? [C.water[0] * 0.25, C.water[1] * 0.25, C.water[2] * 0.25] : [0, 0, 0]);
  }
  // spout from the tank toward the top-right scoop
  line(img, 47, 157, 36.5, 156.2, 1.6, C.bronze);
  BG = img;
  return img;
}

// ------------------------------------------------------------- moving parts
/** The armillary sphere: three bronze rings in 3D, the ecliptic ring turning. */
export function armillary(img, ang, spin, light) {
  const { cx, cy, r } = ARM, tilt = 0.62; // the polar axis, ~35 deg (Kaifeng)
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  // stand: a bronze pillar with a cross-foot
  line(img, cx, cy + r * 0.85, cx, Y.deck - 1, 2, C.bronze, 0.9);
  line(img, cx - 6, Y.deck - 2.5, cx + 6, Y.deck - 2.5, 1.4, C.bronze, 0.9);
  // [kind, rotation about the pole]: meridian (fixed), equator (fixed),
  // declination ring (turns with the stars), ecliptic (inner, turns)
  const rings = [[0, 1.35], [1, 0], [0, ang + spin]];
  const N = 150, lx = -0.6, ly = 0.55, lz = 0.58;
  for (const [kind, rot] of rings) {
    const cr = Math.cos(rot), sr = Math.sin(rot), rr = kind === 2 ? r * 0.74 : r;
    for (let k = 0; k < N; k++) {
      const u = (k / N) * Math.PI * 2, cu = Math.cos(u), su = Math.sin(u);
      let x, y, z;
      if (kind === 0) { x = cu; y = su; z = 0; } else { x = cu; y = 0; z = su; }
      if (kind === 2) { const y2 = -z * 0.41, z2 = z * 0.91; y = y2; z = z2; }
      { const x2 = x * cr - z * sr, z2 = x * sr + z * cr; x = x2; z = z2; }
      // tilt the polar axis (y) toward the viewer
      const y2 = y * ct - z * st, z2 = y * st + z * ct;
      const sx = cx + x * rr, sy = cy - y2 * rr;
      const depth = 0.5 + 0.5 * z2;
      // a bronze band glints where its outward normal faces the light
      const spec = Math.pow(Math.max(0, x * lx + y2 * ly + z2 * lz), 8);
      const col = kind === 1 ? C.gold : C.bronze;
      const a = (0.2 + 0.8 * depth) * light * (2 * Math.PI * rr / N) * 0.95;
      dot(img, sx, sy, col, a * (kind === 1 ? 0.35 : 0.8));
      if (spec > 0.02) dot(img, sx, sy, [1, 0.8, 0.45], a * spec * 3);
    }
  }
  // the sighting tube through the centre, following the declination ring
  const ca = Math.cos(ang * 0.37 + spin + 0.9), sa = Math.sin(ang * 0.37 + spin + 0.9);
  const tx = ca * 0.95, ty = sa * ct * 0.95;
  line(img, cx - tx * r * 0.7, cy + ty * r * 0.7, cx + tx * r * 0.7, cy - ty * r * 0.7, 1.3, C.bronze, 0.9 * light);
  glow(img, cx + tx * r * 0.7, cy - ty * r * 0.7, 1.4, C.gold, 0.25 * light);
}

/** The celestial globe, half sunk in its horizon box, turning with the stars. */
export function globe(img, ang, light, night) {
  const { cx, cy, r } = GLOBE, tilt = 0.62, ct = Math.cos(tilt), st = Math.sin(tilt);
  const ca = Math.cos(ang), sa = Math.sin(ang);
  for (let j = Math.floor(cy - r); j < cy; j++) for (let i = Math.floor(cx - r); i <= Math.ceil(cx + r); i++) {
    const px = (i + 0.5 - cx) / r, py = (j + 0.5 - cy) / r, d2 = px * px + py * py;
    if (d2 >= 1) continue;
    const pz = Math.sqrt(1 - d2), edge = sat((1 - Math.sqrt(d2)) * r);
    // into the globe's frame: untilt, then turn about its pole
    const y1 = -py * ct + pz * st, z1 = py * st + pz * ct;
    const x2 = px * ca - z1 * sa, z2 = px * sa + z1 * ca;
    const lat = Math.asin(Math.max(-1, Math.min(1, y1))), lon = Math.atan2(z2, x2);
    const lamb = 0.35 + 0.65 * Math.max(0, -px * 0.55 - py * 0.35 + pz * 0.75);
    let rr = 0.012 * lamb, gg = 0.022 * lamb, bb = 0.07 * lamb;
    // gold equator and ecliptic bands
    const eq = Math.abs(lat), ec = Math.abs(lat - 0.41 * Math.sin(lon));
    const band = Math.max(sat(1 - eq * r * 1.6), 0.6 * sat(1 - ec * r * 1.8));
    rr += C.gold[0] * 0.28 * band * lamb; gg += C.gold[1] * 0.28 * band * lamb; bb += C.gold[2] * 0.28 * band * lamb;
    // stars: one per lon/lat cell
    const fl = (lon / (Math.PI * 2) + 0.5) * 14, fb = (lat / Math.PI + 0.5) * 7;
    const ci = Math.floor(fl), cj = Math.floor(fb);
    const h = ((ci * 73856093) ^ (cj * 19349663)) >>> 0;
    const sx = ci + 0.2 + 0.6 * ((h & 255) / 255), sy = cj + 0.2 + 0.6 * (((h >> 8) & 255) / 255);
    const ds = Math.hypot((fl - sx) * Math.cos(lat) * 1.4, fb - sy);
    const star = sat(1 - ds * 3.2) * (0.4 + 0.6 * ((h >> 16) & 255) / 255) * pz;
    rr += star * 0.8; gg += star * 0.62; bb += star * 0.3;
    const k = light * edge;
    put(img, i, j, [rr * (1 + 0.3 * night), gg, bb], k);
  }
  // the horizon ring rim
  for (let i = Math.floor(cx - r - 1); i <= Math.ceil(cx + r); i++) put(img, i, cy - 1, C.gold, 0.35 * light);
}

/** The water wheel: rim, spokes and scoops, at angle `ang` (radians, clockwise). */
export function wheel(img, ang, fill, light, slosh) {
  const { cx, cy, r, n } = WHEEL;
  const x0 = Math.floor(cx - r - 4), x1 = Math.ceil(cx + r + 4), y0 = Math.floor(cy - r - 4), y1 = Math.min(H - 1, Math.ceil(cy + r + 4));
  const step = (Math.PI * 2) / n;
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const dx = i + 0.5 - cx, dy = j + 0.5 - cy, d = Math.hypot(dx, dy);
    if (d > r + 4) continue;
    const th = Math.atan2(dx, -dy); // 0 at the top, clockwise
    let c = null, a = 0;
    // rim (two rings) and hub
    const rim = Math.max(sat(1.1 - Math.abs(d - r)), 0.7 * sat(0.9 - Math.abs(d - (r - 2.6))));
    if (rim > 0) { c = rim > 0.6 && (dx < 0 && dy < 0) ? C.woodHi : C.wood; a = rim; c = [c[0] * 1.6, c[1] * 1.6, c[2] * 1.6]; }
    if (d < 2.6) { c = d < 1.3 ? C.gold : C.bronze; a = sat(2.6 - d); }
    // spokes: 8
    if (d > 2 && d < r - 2.4) {
      const sp = Math.PI / 4, rel = th - ang, m = ((rel % sp) + sp * 1.5) % sp - sp / 2;
      const cov = sat(1.1 - Math.abs(m) * d);
      if (cov > a) { c = C.woodHi; a = cov * 0.9; }
    }
    // scoops: boxes outside the rim; nearest scoop by angle
    if (d > r - 0.5 && d < r + 3.6) {
      const rel = th - ang, k = Math.round(rel / step), m = rel - k * step;
      const tang = m * d, rad = d - r;
      const kk = ((k % n) + n) % n;
      const wall = Math.abs(tang) < 1.9 && rad > -0.3 && rad < 3.4;
      if (wall) {
        const inner = Math.abs(tang) < 1.1 && rad > 0.4;
        const sth = ang + k * step, sa = ((sth % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        let lev = fill(sa, kk);
        if (inner) {
          // water sits at the scoop's bottom (outer) side, its own height
          const wl = lev * 3.2;
          if (rad > 3.4 - wl) {
            const sh = 0.75 + 0.25 * Math.sin(i * 1.7 + j * 0.9 + slosh * 9);
            c = [C.water[0] * 2 * sh, C.water[1] * 2 * sh, C.water[2] * 2 * sh]; a = 1;
          } else { c = [0.004, 0.003, 0.002]; a = 1; }
        } else { c = kk === 0 ? C.gold : C.bronze; a = kk === 0 ? 0.9 : 0.75; }
      }
    }
    if (c) put(img, i, j, c, a * light);
  }
}
