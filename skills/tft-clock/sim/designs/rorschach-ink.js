// rorschach-ink.js: the ink of one minute's card.
//
// Everything here is in WING coordinates: the right half of the card,
// u = x - 80 (0 at the crease, 79 at the right edge), y = 0..79. The left
// half is the same field read through the mirror.
//
// At load, for each digit in three variants, an INK GLYPH is built once
// (on the device: const tables in flash, about 30 x 2.2 KB x 4 bytes):
//   sd   signed distance to the wet ink (px, < 0 inside): the stroke as a
//        capsule chain whose radius wanders and pools at the stroke ends,
//        the splats where drops land, their satellite spatter, a ragged edge
//   sp   the same after the press: spread a little, with viscous fingers
//   arr  when the ink reaches each pixel, in s after the numeral's first
//        drop: the ink runs along the stroke from each splat (a geodesic
//        arrival map, chamfer passes)
//   lit  wet sheen on the strokes' upper-left shoulders (0..1)
//   drops: where and when (relative) its drops fall
//
// Per minute, inkFor() merges the four numerals' glyphs into wing arrays
// (a min per pixel, about 8,000 compares) and lays out the body's balls;
// it is cached by minute, so a frame stays a pure function of time.
import { digitSegments, rng, noise2 } from '../js/kit.js';

export const WW = 80, WH = 80, WN = WW * WH;
export const DW = 26, DH = 30;
/** Top-left of each numeral's box in wing coords: H1 H2 over M1 M2. */
export const SLOTS = [[9, 5], [44, 5], [9, 45], [44, 45]];
const RUN = 42;           // ink run speed along a stroke, px/s
const PAD = 9;
const GW = DW + 2 * PAD, GH = DH + 2 * PAD, GN = GW * GH;
const VARIANTS = 3;

/** When each numeral's first drop lands (s into the minute). */
export const DROP_AT = [0.95, 1.4, 1.85, 2.3];
/** Spine pour: drops on the crease. */
const POUR_AT = [0.12, 0.27, 0.42, 0.57, 0.72];

// ------------------------------------------------------------ glyphs (built at load)

function buildGlyph(d, v) {
  const seed = 1000 + d.charCodeAt(0) * 17 + v * 131;
  const r = rng(seed);
  const segs = digitSegments(d, PAD, PAD, DW, DH, 5.4);
  const verts = [];
  for (const s of segs) { verts.push([s[0], s[1]]); verts.push([s[2], s[3]]); }
  const isEnd = (x, y) => {
    let n = 0;
    for (const p of verts) if (Math.abs(p[0] - x) < 0.01 && Math.abs(p[1] - y) < 0.01) n++;
    return n < 2;
  };
  const vr = (x, y) => 2.45 + 0.7 * (noise2(x * 0.18, y * 0.18, seed + 101) - 0.5) + (isEnd(x, y) ? 0.75 : 0);
  const rad = segs.map((s) => [vr(s[0], s[1]), vr(s[2], s[3])]);

  // Drop points along the skeleton by arc length.
  let total = 0;
  const lens = segs.map((s) => { const l = Math.hypot(s[2] - s[0], s[3] - s[1]); total += l; return l; });
  const nd = d === '1' || d === '7' ? 2 : 3;
  const pts = [];
  for (let j = 0; j < nd; j++) {
    const at = total * ((j + 0.5 + (r() - 0.5) * 0.5) / nd);
    let acc = 0;
    for (let i = 0; i < segs.length; i++) {
      if (acc + lens[i] >= at || i === segs.length - 1) {
        const u = lens[i] ? Math.min(1, (at - acc) / lens[i]) : 0, s = segs[i];
        pts.push([s[0] + (s[2] - s[0]) * u, s[1] + (s[3] - s[1]) * u]);
        break;
      }
      acc += lens[i];
    }
  }
  const sources = [], blobs = [], drops = [];
  pts.forEach((p, j) => {
    const dt = j * 0.13 + r() * 0.05;
    blobs.push([p[0], p[1], 2.9 + r() * 0.7]);
    sources.push([p[0], p[1], dt]);
    drops.push({ x: p[0], y: p[1], dt, size: 1 + r() * 0.3 });
    const ns = 2 + ((r() * 3) | 0);
    for (let q = 0; q < ns; q++) {
      const a = r() * Math.PI * 2, dist = 5 + r() * 5;
      const sx = p[0] + Math.cos(a) * dist, sy = p[1] + Math.sin(a) * dist;
      if (sx < 3 || sx > GW - 3 || sy < 3 || sy > GH - 3) continue;
      blobs.push([sx, sy, 0.6 + r() * 0.7]);
      sources.push([sx, sy, dt + 0.05 + dist * 0.008]);
    }
  });

  const sd = new Float32Array(GN), sp = new Float32Array(GN), arr = new Float32Array(GN).fill(1e9), lit = new Float32Array(GN);
  for (let y = 0; y < GH; y++)
    for (let x = 0; x < GW; x++) {
      const px = x + 0.5, py = y + 0.5;
      let best = 99;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        const dx = s[2] - s[0], dy = s[3] - s[1], L2 = dx * dx + dy * dy || 1e-6;
        let t = ((px - s[0]) * dx + (py - s[1]) * dy) / L2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = px - (s[0] + dx * t), ey = py - (s[1] + dy * t);
        const e = Math.sqrt(ex * ex + ey * ey) - (rad[i][0] + (rad[i][1] - rad[i][0]) * t);
        if (e < best) best = e;
      }
      for (const b of blobs) {
        const e = Math.hypot(px - b[0], py - b[1]) - b[2];
        if (e < best) best = e;
      }
      best += 0.55 * (noise2(px * 0.45, py * 0.45, seed + 31) - 0.5);   // a ragged edge
      const i = y * GW + x;
      sd[i] = best;
      const fn = noise2(px * 0.6, py * 0.6, seed + 7);                   // viscous fingers
      sp[i] = best - 0.55 - (fn > 0.55 ? (fn - 0.55) * 4.2 : 0);
    }

  // Arrival: geodesic time from the sources through the ink.
  const inside = (i) => sd[i] < 1.2;
  for (const s of sources) {
    const sx = Math.floor(s[0]), sy = Math.floor(s[1]);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const xx = sx + dx, yy = sy + dy;
        if (xx < 0 || yy < 0 || xx >= GW || yy >= GH) continue;
        const i = yy * GW + xx;
        if (inside(i)) arr[i] = Math.min(arr[i], s[2]);
      }
  }
  const st = 1 / RUN, dg = Math.SQRT2 / RUN;
  for (let it = 0; it < 10; it++) {
    let changed = false;
    for (let y = 0; y < GH; y++)
      for (let x = 0; x < GW; x++) {
        const i = y * GW + x;
        if (!inside(i)) continue;
        let w = arr[i];
        if (x > 0 && arr[i - 1] + st < w) w = arr[i - 1] + st;
        if (y > 0) {
          if (arr[i - GW] + st < w) w = arr[i - GW] + st;
          if (x > 0 && arr[i - GW - 1] + dg < w) w = arr[i - GW - 1] + dg;
          if (x < GW - 1 && arr[i - GW + 1] + dg < w) w = arr[i - GW + 1] + dg;
        }
        if (w < arr[i]) { arr[i] = w; changed = true; }
      }
    for (let y = GH - 1; y >= 0; y--)
      for (let x = GW - 1; x >= 0; x--) {
        const i = y * GW + x;
        if (!inside(i)) continue;
        let w = arr[i];
        if (x < GW - 1 && arr[i + 1] + st < w) w = arr[i + 1] + st;
        if (y < GH - 1) {
          if (arr[i + GW] + st < w) w = arr[i + GW] + st;
          if (x < GW - 1 && arr[i + GW + 1] + dg < w) w = arr[i + GW + 1] + dg;
          if (x > 0 && arr[i + GW - 1] + dg < w) w = arr[i + GW - 1] + dg;
        }
        if (w < arr[i]) { arr[i] = w; changed = true; }
      }
    if (!changed) break;
  }

  // Sheen: where the surface faces the light (upper left).
  for (let y = 1; y < GH - 1; y++)
    for (let x = 1; x < GW - 1; x++) {
      const i = y * GW + x, s = sd[i];
      if (s > -0.7 || s < -2.6) continue;
      const gx = sd[i + 1] - sd[i - 1], gy = sd[i + GW] - sd[i - GW];
      const gl = Math.hypot(gx, gy) || 1;
      const face = -(gx + gy) / (gl * Math.SQRT2);   // > 0: the edge is up-left
      if (face > 0.35) lit[i] = Math.min(1, (face - 0.35) * 2.2) * Math.max(0, 1 - Math.abs(s + 1.5) / 1.2);
    }
  return { sd, sp, arr, lit, drops };
}

const GLYPHS = {};
for (const d of '0123456789') GLYPHS[d] = Array.from({ length: VARIANTS }, (_, v) => buildGlyph(d, v));

// ------------------------------------------------------------ per minute

const CACHE = new Map();

/** The ink of the card that shows `digits` ('hhmm') in minute `key`. Returns it and the merge work done. */
export function inkFor(digits, key) {
  const id = digits + '@' + key;
  let c = CACHE.get(id);
  if (!c) {
    c = build(digits, key);
    CACHE.set(id, c);
    if (CACHE.size > 4) CACHE.delete(CACHE.keys().next().value);
    c.fresh = true;
  } else c.fresh = false;
  return c;
}

function build(digits, key) {
  const SDW = new Float32Array(WN).fill(99);
  const SDP = new Float32Array(WN).fill(99);
  const ARR = new Float32Array(WN).fill(1e9);
  const LIT = new Float32Array(WN);
  const drops = [];
  for (let k = 0; k < 4; k++) {
    const gl = GLYPHS[digits[k]][(key + k * 2) % VARIANTS];
    const ox = SLOTS[k][0] - PAD, oy = SLOTS[k][1] - PAD, t0 = DROP_AT[k];
    for (let y = 0; y < GH; y++) {
      const wy = oy + y;
      if (wy < 0 || wy >= WH) continue;
      for (let x = 0; x < GW; x++) {
        const wx = ox + x;
        if (wx < 0 || wx >= WW) continue;
        const gi = y * GW + x, wi = wy * WW + wx;
        const s = gl.sd[gi];
        if (s < SDW[wi]) { SDW[wi] = s; LIT[wi] = gl.lit[gi]; }
        if (gl.sp[gi] < SDP[wi]) SDP[wi] = gl.sp[gi];
        const a = gl.arr[gi] + t0;
        if (a < ARR[wi]) ARR[wi] = a;
      }
    }
    for (const d of gl.drops) drops.push({ u: ox + d.x, y: oy + d.y, land: t0 + d.dt, size: d.size, slot: k });
  }

  // Spine pour drops and the body's balls.
  const r = rng(key * 7 + 13);
  const balls = [];
  const order = [0, 1, 2, 3, 4];
  for (let j = 4; j > 0; j--) { const q = (r() * (j + 1)) | 0; [order[j], order[q]] = [order[q], order[j]]; }
  for (let i = 0; i < 5; i++) {
    const y = 6 + i * 17 + (r() - 0.5) * 5;
    const u = r() * 2.5;
    const land = POUR_AT[order[i]];
    drops.push({ u, y, land, size: 1.25, slot: -1 });
    balls.push({ kind: 'spine', u, y, r0: 2.3, r1: 2.9 + r() * 1.3, au: 1.5 + r() * 2, ay: 2 + r() * 3,
      pu: 4 + r() * 5, py: 5 + r() * 6, phu: r() * 6.28, phy: r() * 6.28, land, grp: 0 });
  }
  // squeezed out by the press: arms in the row gap, lobes in the margins, a bead on the crease
  const arms = [[14 + r() * 6, 40], [30 + r() * 8, 40.5], [50 + r() * 10, 39.5], [66 + r() * 6, 40]];
  for (const [u, y] of arms) balls.push({ kind: 'arm', u, y, r0: 0, r1: 2.2 + r() * 1.0, au: 3 + r() * 4, ay: 1 + r() * 1.2,
    pu: 6 + r() * 7, py: 4 + r() * 5, phu: r() * 6.28, phy: r() * 6.28, grp: 1 });
  const margins = [[10 + r() * 14, 0.5], [40 + r() * 20, -0.5], [12 + r() * 16, 79.5], [44 + r() * 20, 80.5]];
  for (const [u, y] of margins) balls.push({ kind: 'margin', u, y, r0: 0, r1: 2.6 + r() * 1.3, au: 5 + r() * 6, ay: 1,
    pu: 7 + r() * 8, py: 5, phu: r() * 6.28, phy: r() * 6.28, grp: 2 });
  balls.push({ kind: 'bead', u: 0, y: 40, r0: 0, r1: 3.2 + r() * 1.3, au: 2, ay: 1.5, pu: 9, py: 7,
    phu: r() * 6.28, phy: r() * 6.28, grp: 1 });

  return { SDW, SDP, ARR, LIT, drops, balls, seed: key, work: 4 * GN * 3 };
}

