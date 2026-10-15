// Ripple — the time lies on the bed of a pond, seen through the water.
//
// The digits are pale stones cut in a modern (Didone) face, thick going
// down and thin across, with ball terminals like pebbles, laid on a dark
// bed. Above them is a water surface, a height field: a breeze swell of
// three long waves whose strength comes and goes, plus a ring wave for
// every drop that has hit it. Each pixel looks down through the surface,
// so the bed it sees is shifted by the slope there (refraction): the stones'
// edges wobble and, under a ring, swell and smear. The light on the bed is
// traced, not faked: every sample of sunlight is moved by the slope and
// splatted where it lands, so the swell focuses it into the moving web of
// a pool floor (caustics). Steep water reflects what is round the pond, the
// sky on one flank and the dark trees on the other, so ring crests show as
// arcs of light and shadow; and now and then the sun glints off a slope.
//
// The minute: the pond holds still for a moment (the breeze drops), a drop
// falls onto each digit that will change, shrinking as it falls away from
// us, its shadow on the stones running in to meet it. It lands at :59.4: a
// crater, a crown of water thrown up and breaking into droplets (each lands
// with its own ring), a jet that rises out of the crater and drops back.
// The ring wave sweeps over the digit, and the splash kicks up silt from
// the bed, a pale billowing cloud that swallows the old digit; at :00 the
// stone underneath is the new digit, and it shows through as the silt
// settles and the rings run out. The old digit is gone before :00 and the
// new one only appears after, so no wrong time is shown in between.
//
// The hour (odd hours): a tancho koi swims in from the left along the bed,
// its tail stirring the silt over each digit as it passes, so the old time
// is swallowed digit by digit while its wake rocks the stones. Off the
// right edge it turns, leaps back in over the minutes at :00 (above the
// water, so it is drawn sharp and grows as it rises), and lands with a big
// splash whose wave washes the silt off the new time, outwards from where
// it fell. Even hours: a summer shower. The sun goes in (the caustics fade
// and the panel dims), lightning flickers, the breeze rises, and rain
// patters over the whole pond, heaviest across :00, a heavy drop onto
// every digit; then it eases off and the sun comes back out.
//
// Everything comes from the clock: drops, droplets, rings, silt and the
// koi are listed per turn from a hash of its minute (cached), each ring a
// closed-form function of the time since it fell (a tabulated radial
// profile per ring, so a grid point costs a square root and a lookup).
// Drips from the leaves now and then away from the turns.
//
// Burn-in: the bed walks kit.orbit, everything lit wobbles with the water,
// and 23:00-07:00 the panel dims.

import { dither, smoothNoise, clockFields, orbit } from '../js/kit.js';

const W = 128, H = 64;
const TAU = Math.PI * 2;
const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
const bump = (t, a, b, c, d) => smooth((t - a) / (b - a)) * (1 - smooth((t - c) / (d - c)));

/** A good integer hash as a float in [0, 1). */
function hash(a, b, c) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ------------------------------------------------------------ letterforms
//
// A modern (Didone) face, as if cut in pale stone and laid on the bed: the
// stress is vertical, so a stroke's width follows its direction, thick going
// down and thin going across, with ball terminals like pebbles. Centre-lines
// in a DW x DH box; clock angles in degrees (0 = up, clockwise).

const DW = 24, DH = 42;
const THIN = 2.8, THICK = 6.4;

function arc(cx, cy, rx, ry, a0, a1, n = 32) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    pts.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return pts;
}
function quad(a, c, b, n = 16) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, v = 1 - u;
    pts.push([v * v * a[0] + 2 * u * v * c[0] + u * u * b[0], v * v * a[1] + 2 * u * v * c[1] + u * u * b[1]]);
  }
  return pts;
}
const L = (...p) => p;

// Each digit: { s: strokes (polylines), b: balls [x, y, r] }.
const GLYPH = {
  0: { s: [arc(12, 21, 8.6, 18.6, 0, 360, 48)], b: [] },
  1: { s: [L([13, 2.6], [13, 39.5]), L([13, 2.6], [6, 8.6]), L([6.4, 39.6], [19.6, 39.6])], b: [] },
  2: { s: [[...arc(12, 12.5, 7.8, 9, -60, 140, 26), [4, 39.4]], L([4, 39.6], [20.5, 39.6]), L([20.5, 39.6], [20.5, 35.6])], b: [[5.5, 9.6, 3.4]] },
  3: { s: [arc(12, 11, 7, 8.5, -60, 185, 26), arc(12, 29.5, 8.6, 10.2, -5, 235, 30)], b: [[5.4, 8.8, 3.3], [5.4, 34.4, 3.5]] },
  4: { s: [L([16.5, 2.5], [16.5, 39.5]), L([16.5, 2.5], [3, 29.5]), L([3, 29.5], [22.5, 29.5]), L([11, 39.6], [21.6, 39.6])], b: [] },
  5: { s: [L([7.2, 3], [20.5, 3]), L([7.2, 3], [6.3, 19.5]), [[6.3, 19.5], ...arc(12, 28.6, 8.6, 10.6, -42, 235, 30)]], b: [[5.4, 34.4, 3.5]] },
  6: { s: [arc(12.3, 30, 8.3, 10, 0, 360, 40), arc(14.5, 23, 9.8, 20, -105, 50, 30)], b: [[20.4, 9.4, 3.3]] },
  7: { s: [L([3.5, 3], [20.5, 3]), L([3.5, 3], [3.5, 8]), quad([20.5, 3], [13.5, 18], [10.2, 39.5])], b: [] },
  8: { s: [arc(12, 11.6, 6.9, 8.6, 0, 360, 36), arc(12, 30.4, 8.6, 10.6, 0, 360, 40)], b: [] },
};
GLYPH[9] = {
  s: GLYPH[6].s.map((p) => p.map(([x, y]) => [DW - x, DH - y])),
  b: GLYPH[6].b.map(([x, y, r]) => [DW - x, DH - y, r]),
};

// Each digit as a signed distance field, tabulated at pixel centres in a
// tile with a margin, so the bed can be sampled at sub-pixel positions.
const TM = 6, TW = DW + 2 * TM, TH = DH + 2 * TM;
const SDF = {};
for (const [d, gl] of Object.entries(GLYPH)) {
  const segs = [];
  for (const p of gl.s)
    for (let i = 1; i < p.length; i++) {
      const [ax, ay] = p[i - 1], [bx, by] = p[i];
      const l = Math.hypot(bx - ax, by - ay) || 1;
      const uy = (by - ay) / l;
      segs.push([ax, ay, bx, by, (THIN + (THICK - THIN) * uy * uy) / 2]);
    }
  const f = new Float32Array(TW * TH);
  for (let j = 0; j < TH; j++)
    for (let i = 0; i < TW; i++) {
      const px = i + 0.5 - TM, py = j + 0.5 - TM;
      let best = 99;
      for (const [ax, ay, bx, by, hw] of segs) {
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        const u = l2 ? clamp01(((px - ax) * dx + (py - ay) * dy) / l2) : 0;
        const e = Math.hypot(px - ax - u * dx, py - ay - u * dy) - hw;
        if (e < best) best = e;
      }
      for (const [bx, by, r] of gl.b) { const e = Math.hypot(px - bx, py - by) - r; if (e < best) best = e; }
      f[j * TW + i] = best;
    }
  SDF[d] = f;
}

/** Signed distance of tile `f` at digit coordinates (x, y), bilinear. */
function sdfAt(f, x, y) {
  const fx = x + TM - 0.5, fy = y + TM - 0.5;
  if (fx < 0 || fy < 0 || fx >= TW - 1 || fy >= TH - 1) return 99;
  const ix = fx | 0, iy = fy | 0, ax = fx - ix, ay = fy - iy, i = iy * TW + ix;
  return (f[i] * (1 - ax) + f[i + 1] * ax) * (1 - ay) + (f[i + TW] * (1 - ax) + f[i + TW + 1] * ax) * ay;
}

// ------------------------------------------------------------ layout

const SLOT_X = [5, 32, 72, 99];
const TOP = 11;
const COLON = [[64, 25.5], [64, 38.5]];

// ------------------------------------------------------------ the water
//
// The surface is a height field, sampled at the corners of the pixels (and a
// margin round the glass): a breeze swell of three long waves, plus a ring
// wave for every drop that has hit the water in the last few seconds. Its
// gradient bends the view of the bed (refraction) and, cast from the sun,
// focuses light into a moving web on the bed (caustics, found by actually
// tracing the light: each sample of sunlight is moved by the slope and
// splatted where it lands).

const MG = 8;                                // margin
const GW = W + 2 * MG, GH = H + 2 * MG;      // pixel-centre grid
const CW = GW + 1, CH = GH + 1;              // corner grid
const HC = new Float32Array(CW * CH);   // the swell
const HR = new Float32Array(CW * CH);   // the rings
const GX = new Float32Array(GW * GH), GY = new Float32Array(GW * GH);   // slope, for the view
const LX = new Float32Array(GW * GH), LY = new Float32Array(GW * GH);   // slope, for the light
const LIGHT = new Float32Array(W * H);

const SWELL = [
  // wavelength px, direction deg, phase speed px/s, slope
  [34, 18, 6.5, 0.34],
  [23, 141, 5.2, 0.3],
  [16, 255, 4.1, 0.24],
];
const SC = SWELL.map(() => [new Float32Array(CW), new Float32Array(CW)]);
const SR = SWELL.map(() => [new Float32Array(CH), new Float32Array(CH)]);

function addSwell(T, amp) {
  for (let w = 0; w < SWELL.length; w++) {
    const [lam, dir, c, slope] = SWELL[w];
    const k = TAU / lam, a = (amp * slope) / k;
    const kx = k * Math.cos((dir * Math.PI) / 180), ky = k * Math.sin((dir * Math.PI) / 180);
    const ph = -k * c * T + w * 1.7;
    const [cs, sn] = SC[w], [rc, rs] = SR[w];
    for (let i = 0; i < CW; i++) { const v = kx * (i - MG); cs[i] = Math.cos(v); sn[i] = Math.sin(v); }
    for (let j = 0; j < CH; j++) { const v = ky * (j - MG) + ph; rc[j] = a * Math.cos(v); rs[j] = a * Math.sin(v); }
    for (let j = 0; j < CH; j++) {
      const o = j * CW, c1 = rc[j], s1 = rs[j];
      for (let i = 0; i < CW; i++) HC[o + i] += sn[i] * c1 + cs[i] * s1;   // sin(kx x + ky y + ph)
    }
  }
}

// A ring wave: a packet travelling out at group speed RC, its crests moving
// faster (as on water, crests are born at the back and die at the front),
// widening and fading as it goes; and for the first instants the crater the
// drop punched. `life` is the fade time, `spread` how fast the packet widens.
// The radial profile is tabulated per ring (PROF, 4 samples a pixel), so a
// grid point costs a square root and a lookup.
const RC = 24, RCP = 38, RK = TAU / 6.5;
const PROF = new Float32Array(1 << 12);
function addRing(sx, sy, tau, A, life = 1.5, spread = 3.2) {
  const R = RC * tau, sg = 2.2 + spread * tau;
  const amp = A * Math.exp(-tau / life);
  if (amp / Math.sqrt(1 + Math.max(0, R - sg) / 5) < 0.06) return;
  const ro = R + 2.4 * sg, ri = Math.max(0, R - 2.4 * sg);
  const crater = tau < 0.35 ? -A * 0.9 * Math.exp(-tau / 0.09) : 0;
  const isg2 = 1 / (sg * sg), ph = RCP * tau;
  const n = Math.min(PROF.length - 2, Math.ceil((ro - ri) * 4) + 1);
  for (let q = 0; q <= n + 1; q++) {
    const r = ri + q / 4, u = r - R;
    let h = amp * Math.exp(-u * u * isg2) * Math.cos(RK * (r - ph)) / Math.sqrt(1 + r / 5);
    if (crater) h += crater * Math.exp(-r * r / 7);
    PROF[q] = h;
  }
  const cx = sx + MG, cy = sy + MG;
  const j0 = Math.max(0, Math.ceil(cy - ro)), j1 = Math.min(CH - 1, Math.floor(cy + ro));
  for (let j = j0; j <= j1; j++) {
    const dy = j - cy, dy2 = dy * dy;
    const xo = Math.sqrt(Math.max(0, ro * ro - dy2));
    const xi = dy2 < ri * ri ? Math.sqrt(ri * ri - dy2) : -1;
    const o = j * CW;
    // One span across the disc, or two either side of the calm middle.
    for (let side = 0; side < (xi < 0 ? 1 : 2); side++) {
      const a = xi < 0 ? cx - xo : side ? cx + xi : cx - xo;
      const b = xi < 0 ? cx + xo : side ? cx + xo : cx - xi;
      const i0 = Math.max(0, Math.ceil(a)), i1 = Math.min(CW - 1, Math.floor(b));
      for (let i = i0; i <= i1; i++) {
        const dx = i - cx, f = (Math.sqrt(dx * dx + dy2) - ri) * 4;
        if (f < 0 || f > n) continue;
        const q = f | 0;
        HR[o + i] += PROF[q] + (PROF[q + 1] - PROF[q]) * (f - q);
      }
    }
  }
}

// The rings' slopes are scaled down for the light (RL): at full strength
// they fold the light into noise; scaled, each crest focuses a clean circle.
const RL = 0.2;
const DC = 12;      // how far below the surface the bed lies, for the light
const DV = 0.8;   // ... and for the view
const SUN = [0.5, 0.3];   // the sun is not overhead: the web is cast this far aside, px

function surfaceAndLight() {
  // Gradient at pixel centres.
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const a = j * CW + i, b = a + CW;
      const h00 = HC[a], h10 = HC[a + 1], h01 = HC[b], h11 = HC[b + 1];
      const r00 = HR[a], r10 = HR[a + 1], r01 = HR[b], r11 = HR[b + 1];
      const sx = 0.5 * (h10 - h00 + h11 - h01), sy = 0.5 * (h01 - h00 + h11 - h10);
      const rx = 0.5 * (r10 - r00 + r11 - r01), ry = 0.5 * (r01 - r00 + r11 - r10);
      GX[j * GW + i] = sx + rx; GY[j * GW + i] = sy + ry;
      LX[j * GW + i] = sx + RL * rx; LY[j * GW + i] = sy + RL * ry;
    }
  // Sunlight: 2x2 samples per pixel, each moved by the (interpolated) slope.
  LIGHT.fill(0);
  for (let j = 0; j < GH - 1; j++)
    for (let i = 0; i < GW - 1; i++) {
      const k = j * GW + i;
      const gx00 = LX[k], gx10 = LX[k + 1], gx01 = LX[k + GW], gx11 = LX[k + GW + 1];
      const gy00 = LY[k], gy10 = LY[k + 1], gy01 = LY[k + GW], gy11 = LY[k + GW + 1];
      for (let s = 0; s < 4; s++) {
        const u = s & 1 ? 0.75 : 0.25, v = s & 2 ? 0.75 : 0.25;
        const gx = (gx00 * (1 - u) + gx10 * u) * (1 - v) + (gx01 * (1 - u) + gx11 * u) * v;
        const gy = (gy00 * (1 - u) + gy10 * u) * (1 - v) + (gy01 * (1 - u) + gy11 * u) * v;
        // Pixel-centre coordinates of the sample, in glass pixels.
        const qx = i - MG + u + DC * gx + SUN[0], qy = j - MG + v + DC * gy + SUN[1];
        const ix = Math.floor(qx), iy = Math.floor(qy);
        if (ix < 0 || iy < 0 || ix >= W - 1 || iy >= H - 1) continue;
        const ax = qx - ix, ay = qy - iy, o = iy * W + ix;
        LIGHT[o] += 0.25 * (1 - ax) * (1 - ay); LIGHT[o + 1] += 0.25 * ax * (1 - ay);
        LIGHT[o + W] += 0.25 * (1 - ax) * ay; LIGHT[o + W + 1] += 0.25 * ax * ay;
      }
    }
}

// ------------------------------------------------------------ events
//
// Everything that hits the water is listed from the clock: this turn's
// drops (and the droplets their splash throws back), the hour's shower, and
// now and then a drip from the overhanging leaves. Times are wall-clock
// seconds (E), so a drop's waves carry across the turn.

const fieldsCache = new Map();
function fieldsOf(key) {
  let f = fieldsCache.get(key);
  if (!f) {
    f = clockFields(new Date(key * 60000));
    fieldsCache.set(key, f);
    if (fieldsCache.size > 8) fieldsCache.delete(fieldsCache.keys().next().value);
  }
  return f;
}
const digitsOf = (f) => `${f.hh}${f.mm}`;

/** The turn this instant belongs to, and what changes at it. */
function turnOf(f) {
  const late = f.sec >= 40;
  const key = f.minuteKey + (late ? 1 : 0);
  const tau = late ? f.sec - 60 : f.sec;
  const a = digitsOf(fieldsOf(key - 1)), b = digitsOf(fieldsOf(key));
  const changed = [0, 1, 2, 3].filter((k) => a[k] !== b[k]);
  return { key, tau, hour: fieldsOf(key).m === 0, changed };
}

const FALL = 1.25;      // a big drop is seen for this long before it lands
const CROWN = 11;       // droplets thrown by a big splash

// ------------------------------------------------------------ the koi
//
// A tancho koi (white, with one red cap on its head: dark here), seen from
// above. Its spine is a line from the head back, with a travelling wave
// that grows towards the tail; the body is a chain of discs along it, the
// tail a forked fan.

const KL = 25, KT = 7;        // body length, tail length
const KOI_V = 52;
const KS = 1.15;              // the koi's size             // px/s
const KOI_IN = -3.6;          // the head enters at the left edge
const KOI_LEAP = -0.5, KOI_LAND = 0.45;

function koiHalfWidth(s) {
  const u = s / KL;
  if (u < 0.24) return 1.6 + 4.4 * Math.sqrt(u / 0.24);
  return Math.max(0.8, 6 - 5.2 * ((u - 0.24) / 0.76) ** 1.1);
}

const KHW = Array.from({ length: KL + 1 }, (_, s) => koiHalfWidth(s));

/** Spine of the koi: n points [x, y, halfWidth, nx, ny] from the nose back. */
function koiSpine(hx, hy, ang, t, scale, curl) {
  const tx = Math.cos(ang), ty = Math.sin(ang), nx = -ty, ny = tx;
  const pts = [];
  for (let s = 0; s <= KL + KT; s += 1) {
    const amp = 0.3 + 2.8 * (s / (KL + KT)) ** 2;
    const off = amp * Math.sin(0.2 * s - 10 * t) + curl * (s / KL) ** 2 * 7;
    pts.push([hx - tx * s * scale + nx * off * scale, hy - ty * s * scale + ny * off * scale, s]);
  }
  return { pts, tx, ty, nx, ny, scale };
}

/** Where the swimming koi's head is `t` s after it entered, and its heading. */
function koiSwim(t, seed) {
  const x = -8 + KOI_V * t;
  const y = 33 + 7 * Math.sin(x / 26 + seed) ;
  const dy = (7 / 26) * Math.cos(x / 26 + seed);
  return [x, y, Math.atan2(dy, 1)];
}

/**
 * Rasterise the koi into `mask` (1 lit body, 2 dark: the cap, patches and
 * rim) over the glass, offset by (mx, my) (a shadow uses the same mask).
 */
const KMASK = new Uint8Array(W * H);
function koiRaster(sp, mask, val) {
  const { pts, nx, ny, scale } = sp;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const pad = 7 * scale;
  const X0 = Math.max(0, Math.floor(x0 - pad)), X1 = Math.min(W - 1, Math.ceil(x1 + pad));
  const Y0 = Math.max(0, Math.floor(y0 - pad)), Y1 = Math.min(H - 1, Math.ceil(y1 + pad));
  const tail = pts[KL], tip = pts[KL + KT];
  for (let y = Y0; y <= Y1; y++)
    for (let x = X0; x <= X1; x++) {
      const px = x + 0.5, py = y + 0.5;
      let best = 1e9, bs = 0, bv = 0;
      for (let i = 0; i <= KL; i++) {
        const p = pts[i];
        const dx = px - p[0], dy = py - p[1];
        const e = Math.sqrt(dx * dx + dy * dy) - KHW[i] * scale;
        if (e < best) { best = e; bs = i; bv = (dx * nx + dy * ny) / scale; }
      }
      let v = 0;
      if (best <= 0) {
        // The red cap, a patch on the back, the eyes, and a dark rim.
        const s = bs;
        if (best > -0.9) v = 2;
        else if ((s - 3.2) ** 2 + bv * bv < 5.5) v = 2;
        else if ((s - 13) ** 2 / 9 + (bv - 1.4) ** 2 / 2 < 1) v = 2;
        else v = 1;
        if (s >= 2 && s <= 3 && Math.abs(Math.abs(bv) - 2.9) < 0.6) v = 2;
      } else {
        // The tail fan: between the peduncle and two lobes, forked.
        const ax = tip[0] - tail[0], ay = tip[1] - tail[1], al = Math.hypot(ax, ay) || 1;
        const u = ((px - tail[0]) * ax + (py - tail[1]) * ay) / (al * al);
        if (u >= 0 && u <= 1) {
          const lat = Math.abs((px - tail[0]) * (-ay) + (py - tail[1]) * ax) / al;
          const half = (0.8 + 4.2 * u) * scale;
          const fork = u > 0.62 && lat < (u - 0.62) * 9 * scale;
          if (lat <= half && !fork) v = lat > half - 0.9 ? 2 : 1;
        }
        // Pectoral fins: two small paddles behind the head.
        const fp = pts[6];
        for (const sd of [-1, 1]) {
          const fx = fp[0] + sd * nx * 5.2 * scale - sp.tx * 1.8 * scale, fy = fp[1] + sd * ny * 5.2 * scale - sp.ty * 1.8 * scale;
          if ((px - fx) ** 2 + (py - fy) ** 2 < 2.4 * scale * scale) v = 1;
        }
      }
      if (v) mask[y * W + x] = val ? val : v;
    }
}

// ------------------------------------------------------------ events

/**
 * The events of a turn, cached by turn: big drops (one onto each changing
 * digit), the hour's shower or koi, and the rings they all make, including
 * the crown's droplets landing and the jet's drop falling back. Also when
 * each slot's digit fades into the silt and back out (absolute seconds),
 * and where the silt is stirred up.
 */
const eventCache = new Map();
function eventsOf(turn, ox, oy) {
  const ck = `${turn.key}:${ox}:${oy}`;
  let ev = eventCache.get(ck);
  if (ev) return ev;
  const E0 = turn.key * 60;
  const big = [], small = [], rings = [], silt = [], fade = [null, null, null, null];
  const kind = !turn.hour ? 'minute' : fieldsOf(turn.key).h % 2 ? 'koi' : 'shower';
  const splash = (x, y, E, A, k, salt, fall = true) => {
    const d = { x, y, E, A, k, crown: [], fall };
    for (let i = 0; i < CROWN; i++) {
      const th = ((i + 0.4 * hash(turn.key, i, salt + 2)) / CROWN) * TAU;
      const v = (15 + 11 * hash(turn.key, i, salt + 3)) * (A > 9 ? 1.4 : 1), tf = 0.3 + 0.22 * hash(turn.key, i, salt + 4);
      d.crown.push({ th, v, tf });
      const r = 2.5 + v * tf;
      rings.push({ x: x + r * Math.cos(th), y: y + r * Math.sin(th) * 0.95, E: E + 0.05 + tf, A: 1.1, life: 0.9, spread: 2 });
    }
    big.push(d);
    rings.push({ x, y, E, A, life: 1.15, spread: 2.8 });
    rings.push({ x, y, E: E + 0.82, A: A * 0.38, life: 1.1, spread: 2.4 });   // the jet's drop falls back
  };
  const slotXY = (k, salt) => [SLOT_X[k] + ox + DW / 2 + (hash(turn.key, k, salt) - 0.5) * 6, TOP + oy + DH / 2 + (hash(turn.key, k, salt + 1) - 0.5) * 10];
  // The slot fades from tOut (over 0.4 s) and comes back from tIn (over 1.1 s).
  const fadeSlot = (k, tOut, tIn) => { fade[k] = [tOut, tOut + 0.4, Math.max(tIn, E0 + 0.05), Math.max(tIn, E0 + 0.05) + 1.1]; };

  if (kind === 'minute') {
    [...turn.changed].reverse().forEach((k, rank) => {
      const [x, y] = slotXY(k, 1), E = E0 - 0.62 - 0.24 * rank;
      splash(x, y, E, 9, k, 1);
      silt.push({ x, y, E, seed: k });
      fadeSlot(k, E + 0.05, E0 + 0.2);
    });
  } else if (kind === 'shower') {
    for (let k = 0; k < 4; k++) {
      const [x, y] = slotXY(k, 20), E = E0 - 0.5 - 0.16 * ((k * 3 + 1) % 4);
      splash(x, y, E, 7.5, k, 20);
      silt.push({ x, y, E, seed: k });
      fadeSlot(k, E + 0.05, E0 + 0.2);
    }
    for (let i = 0; i < 120; i++) {
      const r = hash(turn.key, i, 11);
      // Bunched round :00: the rain builds, pours and eases off.
      const t0 = -0.5 + 4.6 * Math.sign(r - 0.5) * Math.abs(2 * r - 1) ** 1.7;
      const d = { x: -4 + 136 * hash(turn.key, i, 12), y: -4 + 72 * hash(turn.key, i, 13), E: E0 + t0, A: 2.6 + 1.8 * hash(turn.key, i, 14) };
      small.push(d);
      rings.push({ x: d.x, y: d.y, E: d.E, A: d.A, life: 0.9, spread: 2 });
    }
  } else {
    // The koi: it swims in from the left along the bed, and its tail stirs
    // the silt over each digit as it passes, so the old time is swallowed
    // digit by digit. Off the right edge it turns, leaps back in at :00 and
    // lands on the minutes; the wave of its landing washes the silt off the
    // new time.
    const seed = hash(turn.key, 1, 40) * 6;
    const koi = { seed, E: E0 + KOI_IN };
    // Its wake: a small ring from the tail at every beat.
    for (let t = 0.2; t < 5; t += 0.16) {
      const [hx, hy, a] = koiSwim(t, seed);
      const tx = hx - Math.cos(a) * (KL + 2), ty = hy - Math.sin(a) * (KL + 2);
      if (tx > -10 && tx < W + 10) rings.push({ x: tx, y: ty, E: koi.E + t, A: 1.5, life: 0.7, spread: 1.6 });
    }
    const LX = 88 + ox, LY = 31 + oy;
    for (let k = 0; k < 4; k++) {
      const cx = SLOT_X[k] + ox + DW / 2;
      const tPass = koi.E + (cx + 8 + KL * 0.6) / KOI_V;     // the tail over the slot
      silt.push({ x: cx, y: TOP + oy + DH / 2, E: tPass + 0.1, seed: k });
      const reach = E0 + KOI_LAND + Math.abs(cx - LX) / 55 + 0.1;
      const tHead = koi.E + (SLOT_X[k] + ox + 10) / KOI_V;       // the head reaches the slot
      fadeSlot(k, Math.min(tHead, E0 - 0.45), reach);
    }
    splash(LX, LY, E0 + KOI_LAND, 11, 2, 41, false);
    koi.land = [LX, LY];
    ev = { big, small, rings, silt, fade, kind, koi };
  }
  ev = ev ?? { big, small, rings, silt, fade, kind };
  eventCache.set(ck, ev);
  if (eventCache.size > 4) eventCache.delete(eventCache.keys().next().value);
  return ev;
}

/** Drips from the leaves: now and then, never near a turn. */
function drips(E) {
  const out = [];
  const n = Math.floor(E / 5);
  for (let m = n - 3; m <= n; m++) {
    if (hash(m, 1, 7) > 0.45) continue;
    const Ed = m * 5 + 5 * hash(m, 2, 7);
    const s = ((Ed % 60) + 60) % 60;
    if (s > 50 || s < 8) continue;
    out.push({ x: 6 + 116 * hash(m, 3, 7), y: 4 + 56 * hash(m, 4, 7), E: Ed, A: 1.5 + hash(m, 5, 7), life: 1.1, spread: 2 });
  }
  return out;
}

/** 2D value noise in [0, 1). */
function vnoise(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

// ------------------------------------------------------------ above the water

/** A lit disc with a dark rim, so it reads on a lit digit as on the dark bed. */
function bead(g, x, y, r) {
  g.fillCircle(x, y, r + 0.9, 0);
  g.fillCircle(x, y, r, 1);
}

function drawBig(g, d, E) {
  const t = E - d.E;
  if (t < -FALL || t > 1.2) return;
  if (t < 0) {
    if (!d.fall) return;
    // Falling away from us: it shrinks, drifts towards the middle of the
    // view, and its shadow on the bed runs in to meet it.
    const u = 1 + t / FALL, z = 1 - u * u;
    const sx = d.x + z * 20, sy = d.y + z * 11;
    g.fillCircle(sx, sy, 1.6 + 1.6 * z, 0);
    bead(g, d.x + (d.x - 64) * 0.4 * z, d.y + (d.y - 32) * 0.4 * z - 8 * z, 1.3 + 4.2 * z);
    // A glint on the drop.
    if (z > 0.25) g.pixel(Math.round(d.x + (d.x - 64) * 0.4 * z - 1.2 * z), Math.round(d.y + (d.y - 32) * 0.4 * z - 8 * z - 1.2 * z), 0);
    return;
  }
  // The crown: a wall thrown up round the crater, breaking into droplets.
  if (t < 0.22) {
    const r = 2 + 10 * Math.sqrt(t / 0.22), w = 1.6 * (1 - t / 0.22) + 0.6;
    g.fillWhere((px, py) => {
      const dd = Math.hypot(px - d.x, py - d.y);
      if (dd > r + w + 1) return false;
      if (dd > r + w) return 0;
      return dd >= r - w ? 1 : false;
    }, 1, [d.x - r - 4, d.y - r - 4, 2 * r + 8, 2 * r + 8]);
    // A dark moat inside the wall: the crater.
    g.fillCircle(d.x, d.y, Math.max(0, r - w - 0.5), 0);
  }
  for (const c of d.crown) {
    const tt = t - 0.05;
    if (tt < 0 || tt > c.tf) continue;
    const u = tt / c.tf, z = 4 * u * (1 - u);
    const r = 2.5 + c.v * tt;
    bead(g, d.x + r * Math.cos(c.th), d.y + r * Math.sin(c.th) * 0.95, 0.6 + 1.5 * z);
  }
  // The jet: a column rising out of the crater (seen end on, a growing
  // bead), which pinches off a drop that falls back.
  if (t > 0.2 && t < 0.82) {
    const u = (t - 0.2) / 0.62;
    bead(g, d.x, d.y, 0.6 + 2.2 * Math.sin(Math.PI * Math.min(1, u * 1.3)) * (u < 0.77 ? 1 : 0.6));
  }
}

function drawSmall(g, d, E) {
  const t = E - d.E;
  if (t < -0.22 || t > 0.14) return;
  if (t < 0) { bead(g, d.x, d.y, 0.5 + 2 * (-t / 0.22)); return; }
  const r = 1 + 18 * t;
  g.fillWhere((px, py) => Math.abs(Math.hypot(px - d.x, py - d.y) - r) < 0.7, 1, [d.x - r - 2, d.y - r - 2, 2 * r + 4, 2 * r + 4]);
}

// ------------------------------------------------------------ the face

const BED = 0.1, STONE = 0.82;
const SKY = [0.6, -0.8], SKY0 = 0.9;
const GLINT = [0.85, -0.6], GLINT_R2 = 0.16 * 0.16;

export default {
  name: 'Ripple',
  blurb: 'Stone digits on a pond bed, seen through moving water with real caustics: a raindrop splashes each changing digit away in silt; a koi or a summer shower on the hour.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { date, fields: f, oled, night }) {
    const E = date.getTime() / 1000;
    const T = E - 1.7e9;
    const [ox, oy] = orbit(date, 2, 3);
    const turn = turnOf(f);
    const tau = turn.tau;
    const digits = digitsOf(f);
    const ev = eventsOf(turn, ox, oy);

    // The breeze comes and goes; the pond holds still before a drop; the
    // shower brings wind.
    let amp = 0.5 + 0.4 * smoothNoise(T / 9, 3);
    const shower = ev.kind === 'shower';
    if (shower) amp *= 1 + 0.6 * bump(tau, -5, -3, 2, 5);
    else if (ev.kind === 'minute') amp *= 1 - 0.75 * bump(tau, -3.2, -2.2, -0.9, -0.3);
    else amp *= 1 - 0.6 * bump(tau, -6, -5, 1, 3);
    // The sun goes in for the shower, with lightning; then comes out again.
    const sun = shower ? 1 - 0.85 * bump(tau, -8, -5.5, 2.5, 6.5) : 1;
    const flash = shower ? Math.max(bump(tau, -4.45, -4.43, -4.38, -4.36), 0.7 * bump(tau, -4.2, -4.18, -4.08, -4.02)) : 0;

    HC.fill(0); HR.fill(0);
    addSwell(T, amp);
    for (const r of ev.rings) { const t = E - r.E; if (t > 0 && t < 5) addRing(r.x, r.y, t, r.A, r.life, r.spread); }
    for (const r of drips(E)) { const t = E - r.E; if (t > 0 && t < 4) addRing(r.x, r.y, t, r.A, r.life, r.spread); }
    surfaceAndLight();

    // Silt stirred up from the bed (by a splash, or the koi's tail): a pale,
    // billowing cloud that veils its digit while it changes, then settles.
    const silt = [];
    for (const c of ev.silt) {
      const t = E - c.E;
      if (t <= 0 || t > 4.5) continue;
      const P = 0.9 * smooth(t / 0.3) * (1 - smooth((t - 0.8 - Math.max(0, turn.key * 60 - c.E - 1)) / 2.4));
      if (P <= 0.01) continue;
      silt.push({ x: c.x, y: c.y, P, R: 5 + 13 * (1 - Math.exp(-t / 0.55)), s: 1 + 0.4 * Math.min(t, 3), t, seed: c.seed * 31 + turn.key });
    }

    // A changing digit is swallowed by the silt, and the new one shows
    // through as it settles: the slot is empty water at the instant the
    // digit changes.
    const tiles = [...digits].map((c) => SDF[c]);
    const dim = [1, 1, 1, 1, 1];
    ev.fade.forEach((fd, k) => { if (fd) dim[k] = 1 - 0.94 * bump(E, ...fd); });

    // The koi, under the water (seen through it, with its shadow on the
    // bed) or, leaping, above it.
    let koiMask = false, leap = null;
    if (ev.koi) {
      const t = E - ev.koi.E;
      KMASK.fill(0);
      if (t > 0 && t < 5.2) {
        const [hx, hy, a] = koiSwim(t, ev.koi.seed);
        const sp = koiSpine(hx + ox, hy + oy, a, t, KS, 0);
        koiRaster(koiSpine(hx + ox + 6, hy + oy + 5, a, t, KS, 0), KMASK, 3);
        koiRaster(sp, KMASK, 0);
        koiMask = true;
      }
      const tl = E - (turn.key * 60 + KOI_LEAP), dur = KOI_LAND - KOI_LEAP;
      if (tl > 0 && tl < dur) {
        const u = tl / dur, z = Math.sin(Math.PI * u);
        const [lx, ly] = ev.koi.land;
        const hx = 150 + (lx - 12 - 150) * u, hy = 14 + (ly - 14) * u - 8 * z;
        leap = koiSpine(hx, hy, Math.PI - 0.5 + 0.9 * u, tl * 0.6, 1.1 + 0.7 * z, 1.4 * z - 0.4);
        koiRaster(koiSpine(hx + 16 * z + 4, hy + 9 * z + 3, Math.PI - 0.5 + 0.9 * u, tl * 0.6, 1 + 0.2 * z, 1.4 * z - 0.4), KMASK, 3);
        koiMask = true;
      }
    }

    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const k = (y + MG) * GW + x + MG;
        const gx = GX[k], gy = GY[k];
        // Sunlight glancing off the surface into the eye.
        const ex = gx - GLINT[0], ey = gy - GLINT[1];
        if (ex * ex + ey * ey < GLINT_R2 * (0.4 + 0.6 * sun)) { g.pixel(x, y, 1); continue; }
        const sx = x + 0.5 - DV * gx, sy = y + 0.5 - DV * gy;
        // Distance to the nearest stone.
        let d = 99, dk = 0;
        for (let s = 0; s < 4; s++) {
          const lx = sx - SLOT_X[s] - ox, ly = sy - TOP - oy;
          if (lx < -TM || lx > DW + TM) continue;
          const e = sdfAt(tiles[s], lx, ly);
          if (e < d) { d = e; dk = s; }
        }
        for (const [cx, cy] of COLON) {
          const e = Math.hypot(sx - cx - ox, (sy - cy - oy) * 1.1) - 2.7;
          if (e < d) { d = e; dk = 4; }
        }
        const cov = clamp01(0.5 - d);
        let alb = BED + (STONE * dim[dk] - BED) * cov, koiPx = 0;
        if (koiMask) {
          const mx = Math.floor(sx - 0.6 * gx), my = Math.floor(sy - 0.6 * gy);   // the koi swims above the bed: less bent
          const m = mx >= 0 && my >= 0 && mx < W && my < H ? KMASK[my * W + mx] : 0;
          if (m === 1) koiPx = 1; else if (m === 2) koiPx = 2; else if (m === 3) alb *= 0.15;
        }
        // Light on the bed where we see it.
        const lx = Math.min(W - 1, Math.max(0, Math.round(sx - 0.5))), ly = Math.min(H - 1, Math.max(0, Math.round(sy - 0.5)));
        let Lt = 1 + sun * (LIGHT[ly * W + lx] - 1);
        if (flash) Lt = Lt * (1 - flash) + 1.5 * flash;
        let lum = alb * (cov > 0.5 ? 0.5 + 0.5 * Lt : Lt);
        if (koiPx) { if (koiPx === 1 && dither(x, y, 0.75 + 0.25 * Lt)) g.pixel(x, y, 1); continue; }
        for (const c of silt) {
          const dx = sx - c.x, dy = sy - c.y, r = Math.hypot(dx, dy);
          if (r > c.R) continue;
          const qx = dx / c.s + 40, qy = dy / c.s + c.t * 1.2 + 40;
          const tex = 0.65 * vnoise(qx / 4.5, qy / 4.5, c.seed) + 0.35 * vnoise(qx / 2, qy / 2 - c.t, c.seed + 9);
          const dens = clamp01(c.P * (1 - smooth((r - 0.4 * c.R) / (0.6 * c.R))) * smooth((tex - 0.28) / 0.38) * 1.15);
          lum = lum * (1 - dens) + dens * 0.5 * (0.6 + 0.4 * Lt);
        }
        // Steep water reflects what is round the pond: the sky on the flank
        // that faces it, the dark trees on the other. So every ring crest is
        // a bright arc and a dark one, on the bed and on the stones alike.
        const sl = Math.hypot(gx, gy);
        if (sl > SKY0) {
          const steep = smooth((sl - SKY0) / 0.9), c = (gx * SKY[0] + gy * SKY[1]) / sl;
          if (c > 0) lum = Math.max(lum, 0.1 + 0.42 * steep * smooth((c - 0.05) / 0.5));
          else lum *= 1 - 0.55 * steep * smooth((-c - 0.05) / 0.5);
        }
        if (dither(x, y, (lum - 0.1) / 0.8)) g.pixel(x, y, 1);
      }

    if (leap) {
      KMASK.fill(0);
      koiRaster(leap, KMASK, 0);
      for (let i = 0; i < W * H; i++) if (KMASK[i] === 1 || KMASK[i] === 2) g.pixel(i % W, (i / W) | 0, KMASK[i] === 1 ? 1 : 0);
    }
    for (const d of ev.small) drawSmall(g, d, E);
    for (const d of ev.big) drawBig(g, d, E);

    const day = 0xcf * (0.55 + 0.45 * sun);
    oled.contrast(flash ? 0xff : Math.round(day + (0x18 - day) * night));
  },
};
