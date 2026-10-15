// Glory Hole — a glass studio at night, and the time is hot glass.
//
// Every numeral is a single trail of glass pulled up out of its own molten
// foot: a puddle on the steel, a thick stem that thins as it climbs, and a
// pulled tail that ends in a bead or a curl where the jacks let go. The ten
// figures are drawn for that process (a 1 with a shepherd's crook, a 7
// whose bar ends in a hanging drip, a 6 that coils round its own bowl), so
// they are heavy at the floor and fine at the top, the way glass hangs.
//
// Glass is as hot as it is new. A numeral comes off the jacks white hot,
// with a halo and heat shimmer, and cools while you watch: the core goes
// from solid to an orange dither to dark, leaving a cold rod whose rim is
// lit from the furnace side, with glints crawling along it. So the minute
// is still glowing at :10, dull red at :40, and the hours, made at the top
// of the hour, are cold glass on the shelf.
//
// The minute: the glory hole's door slides open, the old numeral flares,
// sags and slumps back into its foot as a gob, and the jacks come down,
// grip the gob and pull the new numeral up out of it along its own path,
// then let go. Two changing digits are pulled one after the other.
//
// The hour: the door is thrown wide and the studio floods with furnace
// light, every piece of glass throwing a long shadow to the left. The old
// hour slumps; a gather on a blowpipe swings out of the furnace and pours
// the new hour in a thread, the way the trail of a vessel is laid.
//
// Rendering: every piece of glass is a chain of round segments with a
// radius profile; they are stamped into one signed-distance field (with the
// arc length of the nearest segment) and that field is shaded: core by
// heat, rim by the furnace light, halo and reflection by heat, glints by
// arc length, the flood's shadows by projecting the field from the port.
// Everything is a function of the clock.
//
// Burn-in: the scene walks a 2 px orbit, cold glass is mostly outline, and
// from 23:00 to 07:00 the panel runs at low contrast.

import { noise, smoothNoise, orbit, clockFields, previousMinute, clamp, lerp, progress, ease } from '../js/kit.js';

const W = 128, H = 64;

// ------------------------------------------------------------ the numerals
// Control points in a 10 x 16 cell, floor at y = 16. The first point is the
// foot; the trail runs from there to its pulled end.
const GLYPHS = {
  0: [[5, 15.2], [7.9, 14.2], [9.1, 10.5], [9, 5.5], [7.6, 1.9], [5, 0.8], [2.4, 1.9], [1, 5.5], [0.9, 10.5], [2.1, 13.8], [3.8, 15.0]],
  1: [[5.4, 15.2], [5.4, 11], [5.4, 6], [5.4, 2.4], [5.1, 0.8], [3.8, 1.6], [2.4, 3.0], [1.6, 4.4]],
  2: [[8.4, 15.2], [5.5, 15.1], [2.4, 15], [1.2, 14.4], [1.4, 13], [3.2, 11.2], [6.6, 8.2], [8.6, 5.4], [8.5, 2.8], [6.8, 1], [4.4, 0.8], [2.4, 1.6], [1.3, 2.9], [1.8, 4.2], [3.0, 4.2], [3.2, 3.1]],
  3: [[3.4, 15.2], [6.4, 15], [8.6, 13.4], [9, 10.8], [7.6, 8.6], [4.6, 7.7], [7.4, 6.6], [8.6, 4.2], [7.6, 1.6], [5.2, 0.8], [2.9, 1.1], [1.4, 2.4], [1.6, 3.8], [2.9, 3.9], [3.1, 2.8]],
  4: [[7, 15.2], [7, 11], [7, 6], [7, 1.6], [6.4, 0.9], [5, 2.4], [2.6, 6.4], [1, 10.2], [1.6, 10.9], [5, 11.2], [8, 10.9], [9.4, 10.2], [9.6, 9.0]],
  5: [[2.2, 15.2], [5.4, 15.2], [8.2, 13.8], [9.2, 11], [8.4, 8.4], [6, 7], [3.4, 7.2], [1.8, 8.0], [1.9, 5], [2.2, 1.1], [5.2, 1.7], [7.8, 1.2], [9.2, 1.0], [9.7, 2.2], [9.0, 3.1], [8.1, 2.6]],
  6: [[5, 15.2], [1.8, 14], [1.0, 10.8], [2.6, 8.2], [5.4, 7.6], [8.2, 8.8], [9, 11.6], [7.6, 14.3], [4.6, 14.9], [2, 13.6], [1.0, 10], [1.3, 5.6], [3, 2.2], [5.6, 0.8], [7.8, 1.0], [8.9, 2.2], [8.4, 3.4], [7.4, 3.0]],
  7: [[4, 15.2], [4.4, 12], [5.6, 8], [7.6, 3.6], [8.8, 1.0], [6, 1.7], [3, 1.5], [1.2, 1.1], [0.6, 2.3], [0.8, 3.6]],
  8: [[5, 15.2], [8.2, 14], [8.8, 11.2], [7.2, 8.9], [5, 7.9], [2.6, 6.6], [1.8, 3.8], [3, 1.4], [5, 0.8], [7, 1.4], [8.2, 3.8], [7.4, 6.6], [5, 7.9], [2.8, 9], [1.2, 11.4], [1.8, 14], [3.6, 14.8]],
  9: [[5, 15.2], [7.4, 13.6], [8.6, 10], [8.8, 5.4], [7.8, 2], [5.2, 0.8], [2.4, 1.6], [1.1, 4.4], [2, 7.4], [4.8, 8.4], [7.4, 7.4], [8.6, 5.6]],
};

/** Centripetal Catmull-Rom through `pts`, `n` samples per span. */
function spline(pts, n = 14) {
  const P = [[2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]], ...pts,
    [2 * pts.at(-1)[0] - pts.at(-2)[0], 2 * pts.at(-1)[1] - pts.at(-2)[1]]];
  const tj = (a, b) => Math.max(1e-4, Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5);
  const out = [];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    const t1 = tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
    for (let k = 0; k < n; k++) {
      const t = t1 + ((t2 - t1) * k) / n;
      const L = (a, b, ta, tb) => [((tb - t) * a[0] + (t - ta) * b[0]) / (tb - ta), ((tb - t) * a[1] + (t - ta) * b[1]) / (tb - ta)];
      const A1 = L(p0, p1, 0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
      const B1 = L(A1, A2, 0, t2), B2 = L(A2, A3, t1, t3);
      out.push(L(B1, B2, t1, t2));
    }
  }
  out.push([...pts.at(-1)]);
  return out;
}

/** Resample a polyline at a fixed arc-length step. */
function resample(poly, step) {
  const out = [[...poly[0]]];
  let carry = 0;
  for (let i = 1; i < poly.length; i++) {
    const [ax, ay] = poly[i - 1], [bx, by] = poly[i];
    const seg = Math.hypot(bx - ax, by - ay);
    let d = step - carry;
    while (d <= seg) { const u = d / seg; out.push([ax + (bx - ax) * u, ay + (by - ay) * u]); d += step; }
    carry = seg - (d - step);
  }
  out.push([...poly.at(-1)]);
  return out;
}

/** A glyph as samples along its trail: position, arc fraction, radius (cell units). */
function buildGlyph(pts) {
  const s = resample(spline(pts), 0.42);
  const n = s.length;
  const len = (n - 1) * 0.42;
  const xs = new Float32Array(n), ys = new Float32Array(n), us = new Float32Array(n), rs = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), a = u * len;
    xs[i] = s[i][0]; ys[i] = s[i][1]; us[i] = u;
    // Thick where it leaves the foot, thinning as it was pulled, a bead at the end.
    rs[i] = 0.62 + 0.78 * (1 - u) ** 1.6 + 0.4 * Math.exp(-((a / 1.8) ** 2)) + 0.72 * Math.exp(-(((len - a) / 0.55) ** 2));
  }
  return { xs, ys, us, rs, n, len, footX: pts[0][0] };
}

const GLYPH = {};
for (const k of Object.keys(GLYPHS)) GLYPH[k] = buildGlyph(GLYPHS[k]);

// ------------------------------------------------------------ the glass field
// One signed-distance field for all the glass on screen, with the arc
// position and the owner of the nearest segment, rebuilt every frame.
const BIG = 99;
const D = new Float32Array(W * H), U = new Float32Array(W * H), OWN = new Int16Array(W * H);
let pieces = [], box = [W, H, -1, -1];

function resetField() {
  D.fill(BIG); OWN.fill(-1); pieces = []; box = [W, H, -1, -1];
}

function touch(x0, y0, x1, y1) {
  if (x0 < box[0]) box[0] = x0; if (y0 < box[1]) box[1] = y0;
  if (x1 > box[2]) box[2] = x1; if (y1 > box[3]) box[3] = y1;
}

/** A round-ended cone from (ax,ay,ar) to (bx,by,br), stamped with min(). */
function stampSeg(ax, ay, ar, au, bx, by, br, bu, id, M) {
  const R = Math.max(ar, br) + M;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - R)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + R));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - R)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + R));
  if (x0 > x1 || y0 > y1) return;
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-6;
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5;
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      let t = ((px - ax) * dx + (py - ay) * dy) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - ax - t * dx, ey = py - ay - t * dy;
      const d = Math.sqrt(ex * ex + ey * ey) - (ar + t * (br - ar));
      const i = y * W + x;
      if (d < D[i]) { D[i] = d; U[i] = au + t * (bu - au); OWN[i] = id; }
    }
  }
  touch(x0, y0, x1, y1);
}

/** A flattened puddle (the foot) or a round gob. */
function stampEllipse(cx, cy, rx, ry, id, M) {
  const x0 = Math.max(0, Math.floor(cx - rx - M)), x1 = Math.min(W - 1, Math.ceil(cx + rx + M));
  const y0 = Math.max(0, Math.floor(cy - ry - M)), y1 = Math.min(H - 1, Math.ceil(cy + ry + M));
  const m = Math.min(rx, ry);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const qx = dx / rx, qy = dy / ry, k = Math.sqrt(qx * qx + qy * qy);
      const gl = Math.sqrt((qx / rx) ** 2 + (qy / ry) ** 2);
      const d = k < 1e-3 ? -m : Math.max(-m, ((k - 1) * k) / gl);
      const i = y * W + x;
      if (d < D[i]) { D[i] = d; U[i] = 0; OWN[i] = id; }
    }
  touch(x0, y0, x1, y1);
}

function addPiece(p) { p.id = pieces.length; pieces.push(p); return p; }

/**
 * Place numeral `key` with its cell's top-left at (ox, oy), `sc` px per unit.
 * st: heat 0..1; e how much of the trail is pulled (0..1); slump 0..1;
 * gob 0..1 how much of the glass sits in the foot; gobX where the gob is;
 * sway the hot glass's sideways lean (units); glint arc position or -1.
 */
function place(key, ox, oy, sc, st) {
  const gl = GLYPH[key];
  const e = st.e ?? 1, s = st.slump ?? 0, sway = st.sway ?? 0, gobA = st.gob ?? 0;
  const fx = gl.footX, fy = 15;
  const sx = ease.inQuad(clamp(s * 1.35 - 0.35, 0, 1)), sy = ease.inOutQuad(clamp(s * 1.5, 0, 1));
  const M = 2.2;
  const p = addPiece({ heat: st.heat, front: st.front ?? 2, white: st.white ?? 0, len: gl.len * sc, glint: st.glint ?? -1, halo: 2 + 4 * st.heat,
    x0: ox, y0: oy, x1: ox + 10 * sc, y1: oy + 16 * sc, shimmer: st.shimmer ?? st.heat });
  const gx = lerp(fx, st.gobX ?? fx, gobA);
  const rx = lerp(3.0, 2.9, gobA) * sc, ry = lerp(0.8, 2.5, gobA) * sc;
  stampEllipse(ox + gx * sc, oy + 16 * sc - ry, rx, ry, p.id, M);
  let px = 0, py = 0, pr = 0, pu = 0;
  for (let i = 0; i < gl.n; i++) {
    const u = gl.us[i];
    if (u > e) break;
    let x = gl.xs[i], y = gl.ys[i], r = gl.rs[i];
    if (e < 1) r *= 0.45 + 0.55 * clamp(((e - u) * gl.len) / 2.5, 0, 1);  // the thread thins at the jacks
    if (s > 0) { x += (fx - x) * sx + (x - fx) * 0.35 * Math.sin(Math.PI * clamp(s * 1.4, 0, 1)); y += (fy - y) * sy; r *= 1 + 0.6 * s; }
    if (sway) x += sway * ((16 - y) / 16) ** 1.6;
    const X = ox + x * sc, Y = oy + y * sc, R = r * sc;
    if (i > 0) stampSeg(px, py, pr, pu, X, Y, R, u, p.id, M);
    px = X; py = Y; pr = R; pu = u;
  }
  p.head = [px, py];
  return p;
}

/** Where the trail of `key` is at arc fraction `u`, in screen coordinates. */
function trailAt(key, u, ox, oy, sc) {
  const gl = GLYPH[key];
  const i = clamp(Math.round(u * (gl.n - 1)), 0, gl.n - 1);
  return [ox + gl.xs[i] * sc, oy + gl.ys[i] * sc];
}

// ------------------------------------------------------------ shading the glass
// Bayer 8x8, as gfx.dither, inlined for the per-pixel passes.
const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38,
  60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];
const dz = (x, y, v) => v * 64 > BAYER[((y & 7) << 3) | (x & 7)] + 0.5;

/**
 * Light the glass. (Lx, Ly) is the glory hole, `light` how open it is,
 * `flood` the hour's wash (glass then gets a dark keyline), `roil` the
 * drift of the hot cores' dither.
 */
function shadeGlass(g, Lx, Ly, light, flood, roil) {
  const buf = g.buf;
  const [bx0, by0, bx1, by1] = box;
  for (let y = Math.max(1, by0); y <= Math.min(H - 2, by1); y++)
    for (let x = Math.max(1, bx0); x <= Math.min(W - 2, bx1); x++) {
      const i = y * W + x, d = D[i];
      if (d >= BIG - 1) continue;
      const p = pieces[OWN[i]];
      // Heat is local: thin ends cool first, the foot last.
      const h = p.heat * clamp((p.front - U[i]) * 4.5, 0, 1);
      if (d < 0) {
        const depth = -d;
        let on;
        let f = 0;
        if (depth < 2.2) {
          const gx = D[i + 1] - D[i - 1], gy = D[i + W] - D[i - W];
          const lx = Lx - x - 0.5, ly = Ly - y - 0.5;
          f = (gx * lx + gy * ly) / (Math.hypot(gx, gy) * Math.hypot(lx, ly) + 1e-6);
        }
        if (depth < 1 || (depth < 2 && f * light > 0.45)) {
          // The rim, and a second pixel of it on the side facing the furnace.
          on = true;
        } else {
          // Hot glass: light flows up the trail in slow pulses; white hot
          // (just pulled, or reheated) it is solid.
          const flow = 0.5 + 0.5 * Math.sin(6.283 * ((U[i] * p.len) / 7 - roil));
          const v = p.white ? h : h * (0.25 + 0.75 * flow) * (0.55 + 0.45 * h);
          on = h > 0.02 && dz(x, y, v);
          // A glint crawling along the cold rod.
          if (!on && h < 0.3 && p.glint >= 0 && Math.abs(U[i] - p.glint) * p.len < 1.1) on = true;
        }
        buf[i] = on ? 1 : 0;
      } else if (flood > 0 && d < 1.2) {
        buf[i] = 0;  // keyline against the flood
      } else if (h > 0.03 && d < 3) {
        // White-hot glass blooms a pixel past its edge where it is thickest.
        if (h > 0.9 && d < 0.6 && p.bloom) buf[i] = 1;
      }
    }
}

/** Heat shimmer: the rows above and through hot glass wobble sideways. */
function shimmer(g, t) {
  const buf = g.buf, row = new Uint8Array(W);
  for (const p of pieces) {
    const h = p.shimmer;
    if (h < 0.12) continue;
    const x0 = Math.max(0, Math.floor(p.x0 - 5)), x1 = Math.min(W - 1, Math.ceil(p.x1 + 5));
    const top = p.y0 - 12, mid = p.y0 + (p.y1 - p.y0) * 0.12;
    for (let y = Math.max(0, Math.floor(top)); y < Math.min(H, mid); y++) {
      const w = y < p.y0 ? (y - top) / 12 : 1 - (y - p.y0) / (mid - p.y0);
      const s = Math.round(0.9 * h * w * Math.sin(y * 0.85 - t * 7.5 + p.id * 1.9));
      if (!s) continue;
      for (let x = x0; x <= x1; x++) row[x] = buf[y * W + x];
      for (let x = x0; x <= x1; x++) {
        const sx = x - s;
        buf[y * W + x] = sx >= x0 && sx <= x1 ? row[sx] : 0;
      }
    }
  }
}

/** Heat rising off hot glass: thin wisps that waver up and thin out. */
function wisps(g, t) {
  for (const p of pieces) {
    const h = p.shimmer;
    if (h < 0.35 || p.y0 < 6) continue;
    const wdt = p.x1 - p.x0;
    for (let k = 0; k < 2; k++) {
      const ph = (t * 0.32 + k * 0.5 + p.id * 0.37) % 1;     // each wisp rises and is replaced
      const x0 = p.x0 + wdt * (0.3 + 0.4 * k);
      const head = p.y0 - 2 - ph * 12, len = (3 + 6 * h) * Math.sin(Math.PI * ph);
      for (let j = 0; j < len; j += 0.5) {
        const y = head + j;
        if (y < 0 || y > p.y0 - 2) continue;
        g.pixel(Math.round(x0 + Math.sin(y * 0.55 + t * 2.2 + k * 2) * 1.6), Math.floor(y));
      }
    }
  }
}

/** The hot glass mirrored in the polished marver, fading down. */
function reflect(g, my, xa, xb) {
  const buf = g.buf;
  for (let y = my + 1; y < Math.min(H, my + 9); y++) {
    const sy = 2 * my - y;
    if (sy < 0) continue;
    const fade = 1 - (y - my) / 9;
    for (let x = xa; x <= xb; x++) {
      const j = sy * W + x, d = D[j];
      if (d >= 0.5) continue;
      const h = pieces[OWN[j]].heat;
      if (h > 0.25 && dz(x, y, 0.55 * h * fade * fade)) buf[y * W + x] = 1;
    }
  }
}

/** For the digit sheet: numerals `keys` at one temperature, on a 128x64 canvas. */
export function drawDigitBatch(g, keys, heat, sc = 2) {
  resetField();
  keys.forEach((k, j) => place(String(k), 3 + j * (12 * sc), 3, sc, { heat, glint: heat ? -1 : 0.35 }));
  shadeGlass(g, 1000, -300, 1, 0, 0);
}

// ------------------------------------------------------------ the studio
const PORT = { x: 125, y: 33, r: 10 };
const MIN = { sc: 2, y: 22, x: [44, 69] };      // cells 20 x 32; floor at y 54
const HOUR = { sc: 1.5, y: 9, x: [3, 20] };     // cells 15 x 24; floor at y 33
const MARVER = { y: 54, x0: 36, x1: 104 };
const SHELF = { y: 33, x0: 0, x1: 38 };
const COOL = 58;                                // seconds for a numeral's glow to drain to its foot
const PULL = 0.9, HOP = 0.22, POUR = 0.8, POURHOP = 0.14;

/**
 * The glory hole: a firebrick drum seen end on, half off the glass, its
 * mouth roaring. `o` is how hard the burner is running (0.35 idle, 1 at the
 * hour): the fire's licks reach out of the mouth and curl upwards.
 */
function furnace(g, o, t, ox, oy) {
  const buf = g.buf;
  const px = PORT.x + ox, py = PORT.y + oy, r = PORT.r;
  // The drum: black, so it hides what is behind it, with its shell and ring.
  g.fillWhere((x, y) => Math.hypot(x - px, y - py) < r + 7.5, 0, [px - r - 9, py - r - 9, 2 * r + 18, 2 * r + 18]);
  g.clip(0, 0, W - 1, H);
  g.circle(px, py, r + 7);
  g.unclip();
  g.circle(px, py, r + 1.5);
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2 + 0.2;
    if (Math.cos(a) > 0.5) continue;
    g.line(Math.round(px + Math.cos(a) * (r + 2.5)), Math.round(py + Math.sin(a) * (r + 2.5)),
      Math.round(px + Math.cos(a) * (r + 6)), Math.round(py + Math.sin(a) * (r + 6)));
  }
  // Its stand.
  g.line(Math.round(px - 9), Math.round(py + r + 6), Math.round(px - 14), H - 1);
  g.line(Math.round(px - 8), Math.round(py + r + 7), Math.round(px - 13), H - 1);
  // The fire: white hot deep inside, licks turning round the mouth.
  for (let y = Math.max(0, Math.floor(py - r)); y <= Math.min(H - 1, py + r); y++)
    for (let x = Math.floor(px - r); x <= Math.min(W - 1, px + r); x++) {
      const dx = x + 0.5 - px, dy = y + 0.5 - py, rr = Math.hypot(dx, dy);
      if (rr > r) continue;
      const a = Math.atan2(dy, dx);
      // Spiral arms of flame wheeling round the mouth: solid, not dithered.
      const v = Math.sin(a * 3 + rr * 0.75 - t * 3.1) + 0.6 * Math.sin(a * 5 - rr * 0.5 + t * 4.3);
      buf[y * W + x] = v > -0.6 + 1.5 * (rr / r) ** 1.5 - 0.6 * o ? 1 : 0;
    }
  // Flames rolling out of the top of the mouth and curling up the drum.
  for (let k = 0; k < 4; k++) {
    const a0 = -2.5 + k * 0.42;                      // round the upper-left lip
    const reach = (1.5 + 9 * o * o) * (0.5 + 0.5 * smoothNoise(t * 4 + k * 7.3, k));
    if (reach < 1.2) continue;
    const bx = px + Math.cos(a0) * (r - 1), by = py + Math.sin(a0) * (r - 1);
    const pts = [];
    for (let j = 0; j <= 5; j++) {
      const u = j / 5;
      pts.push([bx + Math.cos(a0) * reach * u * 0.8 + Math.sin(t * 8 + k * 2 + u * 4) * u, by - reach * u * 1.1]);
    }
    g.stroke(pts.slice(0, 4), 3, 0); g.stroke(pts.slice(0, 3), 2); g.stroke(pts.slice(2), 1);
  }
}

/** The jacks: two blades from a spring bow, tips at (tx, ty), `open` 0..1. */
function jacks(g, tx, ty, open, lean) {
  const gap = 0.7 + 3.4 * open, L = 24;
  const hx = tx + lean * L, hy = ty - L;
  const blades = [[tx - gap, ty, hx - 4.5, hy], [tx + gap, ty, hx + 4.5, hy]];
  for (const [ax, ay, bx, by] of blades) g.thickLine(ax, ay, bx, by, 3.4, 0);
  for (const [ax, ay, bx, by] of blades) g.thickLine(ax, ay, bx, by, 1.8, 1);
  // The bow.
  for (let k = 0; k <= 10; k++) {
    const a = Math.PI * (k / 10);
    const x = hx - 4.5 * Math.cos(a), y = hy - 5 * Math.sin(a);
    g.fillCircle(x, y, 0.9);
  }
  // Tips bent inwards.
  g.pixel(Math.round(tx - gap + 0.5), Math.round(ty + 0.5)); g.pixel(Math.round(tx + gap - 1.5), Math.round(ty + 0.5));
}

/**
 * The hour's flood: with the burner roaring, light streams out of the mouth
 * in rays across the studio, and every piece of glass stops the rays that
 * hit it, so it throws a long dark wedge of shadow away from the furnace.
 */
function flood(g, f, t, ox, oy) {
  const buf = g.buf, Lx = PORT.x + ox, Ly = PORT.y + oy;
  const n = 23;
  for (let k = 0; k < n; k++) {
    const a = Math.PI * (0.62 + 0.78 * (k + 0.5) / n) + 0.012 * Math.sin(t * 3 + k * 1.7);
    const reach = f * (50 + 90 * smoothNoise(k * 1.7 + t * 1.2, 3)) * (k % 2 ? 0.7 : 1);
    const cx = Math.cos(a), cy = -Math.sin(a);
    for (let r = PORT.r + 9 + (k % 3) * 4; r < reach; r += 0.7) {
      const x = Math.floor(Lx + cx * r), y = Math.floor(Ly + cy * r);
      if (x < 0 || y < 0 || x >= W || y >= H) break;
      const i = y * W + x;
      if (D[i] < 0.4) break;                  // the glass stops it: shadow behind
      if (D[i] < 1.6) continue;               // keep the glass's edge clear
      if (dz(x, y, 1.6 - 1.6 * r / reach)) buf[i] = 1;
    }
  }
}

// ------------------------------------------------------------ the clock
const io = ease.inOutQuad;

/** Seconds since the glass at each position (hh, mm) was finished. */
function ages(f) {
  const pullsAtTurn = f.m % 10 === 0 ? 2 : 1, poursAtTurn = f.h % 10 === 0 ? 2 : 1;
  return [
    ((f.h % 10) * 60 + f.m) * 60 + f.sec - POUR,
    f.m * 60 + f.sec - (POUR * poursAtTurn + POURHOP * (poursAtTurn - 1)),
    (f.m % 10) * 60 + f.sec - PULL,
    f.sec - (PULL * pullsAtTurn + HOP * (pullsAtTurn - 1)),
  ];
}

export default {
  name: 'Glory Hole',
  blurb: 'A glass studio at night: each numeral is a thread of hot glass pulled up from its own molten foot, glowing as new as it is; on the minute it slumps back into a gob and the jacks pull the next one out of it; on the hour the furnace door is thrown open and a gather pours the new hour.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, ctx) {
    const { date, fields: f, t, oled, night } = ctx;
    const [ox, oy] = orbit(date, 2, 3);
    resetField();
    const before = f.sec >= 55;
    const T = before ? f.sec - 60 : f.sec;          // seconds from the nearest turn
    const A = before ? f : previousMinute(date);
    const B = before ? clockFields(new Date(date.getTime() + 60000)) : f;
    const old = A.hh + A.mm, nu = B.hh + B.mm;
    const ch = [0, 1, 2, 3].map((i) => old[i] !== nu[i]);
    const mList = [2, 3].filter((i) => ch[i]), hList = [0, 1].filter((i) => ch[i]);
    const start = [];
    mList.forEach((i, k) => { start[i] = k * (PULL + HOP); });
    hList.forEach((i, k) => { start[i] = k * (POUR + POURHOP); });
    const mEnd = mList.length ? start[mList.at(-1)] + PULL : 0;
    const hEnd = hList.length ? start[hList.at(-1)] + POUR : 0;
    const hourTurn = hList.length > 0;

    // The door and the light.
    const up = (a, b) => io(progress(T, a, b));
    let o = 0.36, wash = 0;
    if (hourTurn) {
      const env = up(-3, -1.8) * (1 - up(3.4, 5));
      o += 0.64 * env;
      wash = up(-2.6, -1.4) * (1 - up(3, 4.6));
    } else if (mList.length) {
      o += 0.36 * up(-2.2, -1.2) * (1 - up(mEnd + 0.2, mEnd + 1.4));
    }
    o += 0.04 * Math.sin(t * 1.3);
    const light = 0.35 + 0.65 * o;
    const Lx = PORT.x + ox, Ly = PORT.y + oy;

    // ---- the glass
    resetField();
    const age = ages(f);
    const pieceAt = [];
    for (let i = 0; i < 4; i++) {
      const hour = i < 2, S = hour ? HOUR : MIN, sc = S.sc;
      const x = S.x[i % 2] + ox, y = S.y + oy;
      // The glow drains from the pulled end back to the foot over a minute.
      const front = 1.25 - 1.3 * Math.max(0, age[i]) / COOL;
      const len = hour ? POUR : PULL;
      const glint = ((t * 0.16 + i * 0.29) % 1) / 0.62;
      const st = { heat: front > 0 ? 1 : 0, front, glint: glint <= 1 ? glint : -1, white: age[i] < 1.2 ? 1 : 0 };
      let key = nu[i];
      if (ch[i] && T < 0 && T > -2.4) {
        key = old[i];
        const re = up(-2.1, -1.1);                   // reheated: the glow climbs back up
        st.heat = 1; st.front = lerp(Math.max(-0.3, front), 1.3, re); st.white = re > 0.6 ? 1 : 0;
        st.slump = st.gob = io(progress(T, -1.0, -0.05));
        st.glint = -1;
      } else if (ch[i] && T >= 0 && T < start[i] + len) {
        const ps = start[i];
        st.heat = 1; st.front = 2; st.glint = -1; st.white = 1;
        st.e = hour ? io(progress(T, ps, ps + POUR)) : io(progress(T, ps + 0.1, ps + PULL - 0.08));
        st.gob = 1 - st.e;
        st.gobX = GLYPH[old[i]].footX;
      } else if (ch[i] && T < 0) key = old[i];
      st.shimmer = clamp(st.front, 0, 1) * st.heat;
      st.sway = st.shimmer * (0.3 * Math.sin(t * 1.9 + i * 2.1) + 0.1 * Math.sin(t * 3.4 + i));
      pieceAt[i] = { p: place(key, x, y, sc, st), key, x, y, sc };
    }

    // The gather on its blowpipe, pouring the new hour.
    let gather = null;
    if (hourTurn && T > -2 && T < hEnd + 1.4) {
      const rest = [150, -14];
      const over = (i) => [HOUR.x[i % 2] + ox + GLYPH[nu[i]].footX * HOUR.sc, HOUR.y + oy - 4];
      const first = over(hList[0]);
      let gp, pouring = null;
      if (T < 0) gp = [lerp(rest[0], first[0], io(progress(T, -1.9, -0.15))), lerp(rest[1], first[1], ease.outCubic(progress(T, -1.9, -0.15)))];
      else {
        gp = first;
        for (let k = 0; k < hList.length; k++) {
          const i = hList[k], ps = start[i];
          if (T >= ps && T < ps + POUR) { const hd = pieceAt[i].p.head; gp = [hd[0] + 1, HOUR.y + oy - 4]; pouring = hd; }
          else if (T >= ps + POUR) {
            const end = pieceAt[i].p.head;
            const nxt = k + 1 < hList.length ? over(hList[k + 1]) : null;
            if (nxt) gp = [lerp(end[0] + 1, nxt[0], io(progress(T, ps + POUR, ps + POUR + POURHOP))), HOUR.y + oy - 4];
            else gp = [lerp(end[0] + 1, rest[0], io(progress(T, ps + POUR, ps + POUR + 1.3))), lerp(HOUR.y + oy - 4, rest[1], ease.inCubic(progress(T, ps + POUR, ps + POUR + 1.3)))];
          }
        }
      }
      const gq = addPiece({ heat: 1, len: 1, glint: -1, halo: 5, x0: gp[0] - 4, y0: gp[1] - 4, x1: gp[0] + 4, y1: gp[1] + 4, shimmer: 0.7 });
      const wob = 0.4 * Math.sin(t * 11);
      stampEllipse(gp[0], gp[1], 4.2 + wob, 3.8 - wob, gq.id, 4);
      if (pouring) {
        // The thread from the gather to where it lands.
        const [hx, hy] = pouring, n = 6;
        let ax = gp[0], ay = gp[1] + 3;
        for (let k = 1; k <= n; k++) {
          const u = k / n;
          const bx = lerp(gp[0], hx, u) + Math.sin(t * 13 + u * 4) * 0.5 * u * (1 - u) * 4, by = lerp(gp[1] + 3, hy, u);
          stampSeg(ax, ay, 1.0 - 0.3 * u, 0, bx, by, 1.0 - 0.3 * u, 0, gq.id, 4);
          ax = bx; ay = by;
        }
      }
      gather = gp;
    }

    // ---- paint
    const buf = g.buf;
    if (wash > 0) flood(g, wash, t, ox, oy);
    // The marver and the shelf.
    g.hline(MARVER.x0 + ox, MARVER.y + oy, MARVER.x1 - MARVER.x0);
    g.hline(SHELF.x0 + ox, SHELF.y + oy, SHELF.x1 - SHELF.x0);
    for (const bx of [SHELF.x0 + 5, SHELF.x1 - 6]) { g.vline(bx + ox, SHELF.y + oy + 1, 4); g.line(bx + ox + 1, SHELF.y + oy + 1, bx + ox + 3, SHELF.y + oy + 1); }
    shadeGlass(g, Lx, Ly, light, wash, t * 0.6);
    furnace(g, o, t, ox, oy);

    // The jacks: idle above the minute, down to the gob, along the new trail.
    const idle = [99 + ox + 1.2 * Math.sin(t * 0.7), 29 + oy + 1.5 * Math.sin(t * 1.1)];
    let jp = idle, jo = 0.5 + 0.2 * Math.sin(t * 1.3), lean = -0.12 + 0.03 * Math.sin(t * 0.9);
    if (mList.length && T > -1.2 && T < mEnd + 0.9) {
      const gobOf = (i) => [MIN.x[i - 2] + ox + GLYPH[old[i]].footX * MIN.sc, MIN.y + oy + 32 - 6];
      const g0 = gobOf(mList[0]);
      if (T < 0) { const u = io(progress(T, -1.0, -0.05)); jp = [lerp(idle[0], g0[0], u), lerp(idle[1], g0[1], u)]; jo = lerp(jo, 1, u); }
      else {
        for (let k = 0; k < mList.length; k++) {
          const i = mList[k], ps = start[i], gb = gobOf(i), hd = pieceAt[i].p.head;
          if (T < ps) break;
          if (T < ps + 0.1) { jp = gb; jo = 1 - progress(T, ps, ps + 0.1); }
          else if (T < ps + PULL - 0.08) { jp = hd; jo = 0; }
          else if (T < ps + PULL) { const u = progress(T, ps + PULL - 0.08, ps + PULL); jp = [hd[0], hd[1] - 2 * u]; jo = u; }
          else {
            const nxt = k + 1 < mList.length ? gobOf(mList[k + 1]) : null;
            const from = [hd[0], hd[1] - 2];
            if (nxt) { const u = io(progress(T, ps + PULL, ps + PULL + HOP)); jp = [lerp(from[0], nxt[0], u), lerp(from[1], nxt[1], u)]; jo = 1; }
            else { const u = io(progress(T, ps + PULL, ps + PULL + 0.9)); jp = [lerp(from[0], idle[0], u), lerp(from[1], idle[1], u)]; jo = lerp(1, jo, u); }
          }
        }
      }
      lean = 0.1 * Math.sin(T * 2);
    }
    else {
      // Between turns the gaffer tends the hot minute: at :20 and :40 the
      // jacks swing over and nip the bead at the end of its trail.
      for (const s0 of [20, 40]) {
        const u = progress(f.sec, s0, s0 + 1.8);
        if (u <= 0 || u >= 1) continue;
        const hd = pieceAt[3].p.head, k = Math.sin(Math.PI * u) ** 0.8;
        jp = [lerp(idle[0], hd[0], k), lerp(idle[1], hd[1] - 1, k)];
        jo = lerp(jo, 0, clamp((k - 0.75) * 4, 0, 1));
        lean = lerp(lean, 0.1, k);
      }
    }
    jacks(g, jp[0], jp[1], jo, lean);

    if (gather) {
      // The blowpipe, out to the gaffer beyond the top right.
      const [gx, gy] = gather, ex = gx + 80, ey = gy - 22;
      g.thickLine(gx + 3, gy - 2, ex, ey, 4, 0);
      g.thickLine(gx + 3, gy - 2, ex, ey, 2, 1);
    }

    shimmer(g, t);
    wisps(g, t);

    const base = 0xcf + (0x30 - 0xcf) * night;     // night dimming, 23:00-07:00 (ctx.night)
    oled.contrast(Math.round(base + (0xff - base) * wash * (1 - night * 0.6)));
  },
};
