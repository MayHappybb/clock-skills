// Shatter — the time in cut glass, and every minute it breaks.
//
// The digits are slabs of cut crystal: each stroke is a prism with a lit
// facet towards the light (upper left), a dark facet away from it, a bright
// bevel round the outline, and 45-degree chamfers instead of curves. They
// stand on a polished floor that reflects them. A light sweep runs across
// the glass every ten seconds, and the colon is two octahedral gems turning
// on their axes, a facet flaring each time it faces the light.
//
// The minute: an impact star appears on each digit that is about to change
// and cracks creep out of it, radial ones first, then the concentric rings
// between them, faster and faster. At :58.85 the digit bursts into shards
// (the cells of a Voronoi diagram whose seeds lie on rings round the impact
// point, so they are small near it and big far off, as in real glass). Each
// shard is a rigid 3D body: it flies out, tumbles about its own axis
// (drawn foreshortened, its facets flaring as it faces the light), falls
// under gravity, bounces two or three times off the floor and slides to
// rest lying flat, a sliver. Then the film runs backwards: the same pieces
// of glass, re-cut to the new digit, hop up off the floor, fly back and
// fuse, and the cracks heal back into the impact point with a sparkle.
// Old and new digits share the Voronoi cells and so their trajectories:
// at the instant the shards lie still, the old heap and the new are the
// same pieces in the same places, and the switch is invisible.
//
// The hour: bullet time. A bullet crosses the glass in slow motion, trailing
// vapour rings, and passes through all four digits; each cracks where it
// enters and bursts along the bullet's path, the shards drifting and
// turning slowly in the slowed time. Once the bullet has left, time snaps
// back to speed, the shards drop and bounce, and the new hour rewinds
// together out of the heap in a wave from left to right.
//
// Pure function of the clock: shard sets and bounce schedules are built
// (closed form) from the turn's minute key and the two digits, and cached;
// the pose of every shard is a function of its own simulation time, which
// is a function of the wall clock (warped, in bullet time).
//
// Burn-in: the face walks kit.orbit; the glass is mostly dither; the gems
// turn; 23:00-07:00 the panel dims.

import { dither, orbit, clockFields, previousMinute } from '../js/kit.js';

const W = 128, H = 64;
const DW = 24, DH = 44;                 // a digit's box
const TOP = 7;                          // top of the digit boxes; the floor is at TOP + DH
const SLOT_X = [3, 30, 74, 101];
const COLON_X = 64;
const HW = 3.5;                         // a stroke's half width (octagonal norm)

// ------------------------------------------------------------ helpers

function hash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
const inQuad = (u) => { u = clamp01(u); return u * u; };

// ------------------------------------------------------------ letterforms
// Centre-lines in the 24 x 44 box; strokes are octagonal-norm thick lines,
// so ends and joints come out chamfered like cut glass.

const a = 3.5, b = 20.5, t = 3.5, B = 40.5, c = 5;
const P = (...pts) => pts;
const SKEL = {
  0: [P([a + c, t], [b - c, t], [b, t + c], [b, B - c], [b - c, B], [a + c, B], [a, B - c], [a, t + c], [a + c, t])],
  1: [P([5, 11], [12.5, t], [12.5, B]), P([6, B], [19.5, B])],
  2: [P([a, t + c + 2], [a + c, t], [b - c, t], [b, t + c], [b, 16.5], [a, 35], [a, B], [b, B])],
  3: [P([a, t], [b, t], [11.5, 19.5], [b - c, 19.5], [b, 19.5 + c], [b, B - c], [b - c, B], [a + c, B], [a, B - c - 1])],
  4: [P([15.5, B], [15.5, t], [a, 29.5], [b, 29.5])],
  5: [P([b, t], [a, t], [a, 20], [b - c, 20], [b, 20 + c], [b, B - c], [b - c, B], [a, B])],
  6: [P([b - 1, t], [a + c, t], [a, t + c], [a, B - c], [a + c, B], [b - c, B], [b, B - c], [b, 22.5 + c], [b - c, 22.5], [a, 22.5])],
  7: [P([a, t + 4], [a, t], [b, t], [b, t + 5], [10, B])],
  8: [P([a + 1 + c - 1, t], [b - c, t], [b - 1, t + c - 1], [b - 1, 15.5], [b - 1 - 4.5, 20.5], [a + 1 + 4.5, 20.5], [a + 1, 15.5], [a + 1, t + c - 1], [a + c, t]),
    P([a + 4.5, 20.5], [b - 4.5, 20.5], [b, 25], [b, B - c], [b - c, B], [a + c, B], [a, B - c], [a, 25], [a + 4.5, 20.5])],
};
SKEL[9] = SKEL[6].map((p) => p.map(([x, y]) => [DW - x, DH - y]));

const LXY = [-0.6, -0.8];               // light direction in the picture plane (towards upper left)

/** A digit as a pixel mask with a glass level per pixel. */
function buildGlyph(d) {
  const segs = [];
  for (const p of SKEL[d]) for (let i = 1; i < p.length; i++) segs.push([p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]]);
  const n = DW * DH;
  const mask = new Uint8Array(n), level = new Float32Array(n);
  for (let y = 0; y < DH; y++)
    for (let x = 0; x < DW; x++) {
      const px = x + 0.5, py = y + 0.5;
      let best = Infinity, bdx = 0, bdy = 0;
      for (const [ax, ay, bx, by] of segs) {
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        const u = l2 ? clamp01(((px - ax) * dx + (py - ay) * dy) / l2) : 0;
        const ex = px - (ax + u * dx), ey = py - (ay + u * dy);
        const ox = Math.abs(ex), oy = Math.abs(ey);
        const oct = Math.max(ox, oy, (ox + oy) * 0.7071);
        if (oct < best) { best = oct; bdx = ex; bdy = ey; }
      }
      if (best > HW) continue;
      const i = y * DW + x;
      mask[i] = 1;
      const r = Math.hypot(bdx, bdy);
      const dot = r < 0.75 ? 0 : (bdx * LXY[0] + bdy * LXY[1]) / r;
      level[i] = dot > 0.3 ? 0.3 : dot < -0.3 ? 0.0 : 0.12;
      // Two streaks of reflected window light, the classic glass cue.
      const u = px + 0.55 * py;
      if (Math.abs(u - 21.5) < 0.75 || Math.abs(u - 25) < 0.5) level[i] = 1;
    }
  const edge = new Uint8Array(n);
  for (let y = 0; y < DH; y++)
    for (let x = 0; x < DW; x++) {
      const i = y * DW + x;
      if (!mask[i]) continue;
      const out = (xx, yy) => xx < 0 || yy < 0 || xx >= DW || yy >= DH || !mask[yy * DW + xx];
      if (out(x - 1, y) || out(x + 1, y) || out(x, y - 1) || out(x, y + 1)) { edge[i] = 1; level[i] = 1; }
    }
  const list = [];
  for (let i = 0; i < n; i++) if (mask[i]) list.push(i);
  return { mask, level, edge, list: Int32Array.from(list) };
}
const GLYPHS = {};
for (let d = 0; d <= 9; d++) GLYPHS[d] = buildGlyph(d);

// ------------------------------------------------------------ the break
// A break is built for one slot and one turn: the impact point, the Voronoi
// cells, and for each cell a rigid-body flight. The cells are cut out of the
// old digit for the shattering and out of the new one for the rewind.

const G = 420;                          // gravity, px/s^2 (simulation time)
const REST = 0.38;                      // restitution at the floor
const SLIDE = 0.1;                      // friction time constant once resting
const RINGS = [[0, 1], [3.6, 3], [7.5, 5], [12, 6], [17.5, 7], [24, 8], [31, 9], [39, 10], [48, 10]];

function pickImpact(gOld, gNew, seed, mode, by) {
  if (mode === 'hour') {
    for (let dy = 0; dy < 6; dy++)
      for (const y of [by + dy, by - dy]) {
        if (y < 0 || y >= DH) continue;
        for (let x = 0; x < DW; x++) if (gOld.mask[y * DW + x]) return [x + 0.5, y + 0.5];
      }
    return [DW / 2, by + 0.5];
  }
  // Somewhere both digits have glass, away from the outline, so the crack
  // starts on the old digit and the new one heals into the same point.
  const both = [], one = [];
  for (const i of gOld.list) {
    if (gOld.edge[i]) continue;
    const y = (i / DW) | 0;
    if (y < 6 || y > DH - 8) continue;
    (gNew.mask[i] && !gNew.edge[i] ? both : one).push(i);
  }
  const pool = both.length ? both : one.length ? one : Array.from(gOld.list);
  const i = pool[Math.floor(hash(seed, 3, 17) * pool.length)];
  return [(i % DW) + 0.5, ((i / DW) | 0) + 0.5];
}

function buildBreak(oldD, newD, seed, mode, by) {
  const gOld = GLYPHS[oldD], gNew = GLYPHS[newD];
  const [ix, iy] = pickImpact(gOld, gNew, seed, mode, by);
  // Seeds on rings round the impact: small cells near it, big ones far off.
  const sx = [], sy = [], ring = [];
  RINGS.forEach(([r, n], k) => {
    const a0 = hash(seed, k, 5) * Math.PI * 2;
    for (let j = 0; j < n; j++) {
      const ang = a0 + ((j + 0.35 * (hash(seed, k * 31 + j, 6) - 0.5)) * Math.PI * 2) / n;
      const rr = r * (1 + 0.28 * (hash(seed, k * 31 + j, 7) - 0.5));
      const x = ix + rr * Math.cos(ang), y = iy + rr * Math.sin(ang) * 1.15;
      if (x < -8 || x > DW + 8 || y < -8 || y > DH + 8) continue;
      sx.push(x); sy.push(y); ring.push(k);
    }
  });
  const ns = sx.length, n = DW * DH;
  const cell = new Int16Array(n);
  const cxs = new Float64Array(ns), cys = new Float64Array(ns), cnt = new Float64Array(ns);
  for (let y = 0; y < DH; y++)
    for (let x = 0; x < DW; x++) {
      let best = Infinity, bi = 0;
      for (let s = 0; s < ns; s++) {
        const d = (x + 0.5 - sx[s]) ** 2 + (y + 0.5 - sy[s]) ** 2;
        if (d < best) { best = d; bi = s; }
      }
      cell[y * DW + x] = bi;
      cxs[bi] += x + 0.5; cys[bi] += y + 0.5; cnt[bi]++;
    }
  for (let s = 0; s < ns; s++) if (cnt[s]) { cxs[s] /= cnt[s]; cys[s] /= cnt[s]; }

  // Each digit's pieces: the cell's pixels in that digit, with the outline
  // a flying shard shows (the digit's own bevel plus its fracture faces),
  // and the cracks as drawn on the unbroken glass.
  const cut = (gl) => {
    const pix = Array.from({ length: ns }, () => []);
    const flight = new Uint8Array(n);
    const cracks = [];
    let rmax = 1;
    for (const i of gl.list) {
      const x = i % DW, y = (i / DW) | 0, cI = cell[i];
      pix[cI].push(i);
      let e = gl.edge[i];
      for (const [xx, yy] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (xx < 0 || yy < 0 || xx >= DW || yy >= DH) continue;
        const j = yy * DW + xx;
        if (gl.mask[j] && cell[j] !== cI) e = 1;
      }
      flight[i] = e;
      // A crack pixel on the whole glass: one side of a boundary only.
      for (const [xx, yy] of [[x + 1, y], [x, y + 1]]) {
        if (xx >= DW || yy >= DH) continue;
        const j = yy * DW + xx;
        if (gl.mask[j] && cell[j] !== cI && !gl.edge[i]) {
          const dist = Math.hypot(x + 0.5 - ix, y + 0.5 - iy);
          const radial = ring[cI] === ring[cell[j]];
          cracks.push([i, dist, radial ? 1 : 0]);
          if (dist > rmax) rmax = dist;
          break;
        }
      }
    }
    const box = pix.map((p, cI) => {
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const i of p) {
        const u = (i % DW) - cxs[cI], v = ((i / DW) | 0) - cys[cI];
        if (u < u0) u0 = u; if (u + 1 > u1) u1 = u + 1; if (v < v0) v0 = v; if (v + 1 > v1) v1 = v + 1;
      }
      return [u0, u1, v0, v1];
    });
    return { gl, pix: pix.map((p) => Int32Array.from(p)), flight, cracks, rmax, box };
  };
  const old = cut(gOld), nu = cut(gNew);

  // Flights. Every cell has one, whichever digit's glass is in it.
  const flights = [];
  let D = 0;
  for (let s = 0; s < ns; s++) {
    if (!old.pix[s].length && !nu.pix[s].length) { flights.push(null); continue; }
    const h = (k) => hash(seed, s * 13 + k, 29);
    const ox = cxs[s], oy = cys[s];
    let dx = ox - ix, dy = oy - iy;
    const dist = Math.hypot(dx, dy) || 1;
    dx /= dist; dy /= dist;
    let vx, vy, vz;
    if (mode === 'hour') {
      const k = 1 - 0.65 * clamp01(dist / 26);
      vx = 70 * k + 25 * dx + 20 * h(1);
      vy = 30 * dy - 35 * k - 15 * h(2);
      vz = 10 + 40 * h(3) * k;
    } else {
      const sp = (30 + 40 * h(1)) * (1 - 0.45 * clamp01(dist / 30));
      vx = dx * sp * 1.25 + 8 * (h(2) - 0.5);
      vy = dy * sp * 0.8 - 45 - 35 * h(3);
      vz = 15 + 35 * h(4);
    }
    const sgn = (k) => (h(k) < 0.5 ? -1 : 1);
    flights.push(makeFlight(ox, oy, vx, vy, vz,
      sgn(5) * (5 + 9 * h(6)), sgn(7) * (0.6 + 3.5 * h(8)),
      (h(9) - 0.5) * 1.2, 0.25 + 0.6 * h(10), 4 + 6 * h(11), h(12) * 6.28,
      sgn(13) * (0.3 + 0.25 * h(14)), h(15)));
    D = Math.max(D, flights[s].tEnd);
  }
  // The film runs back from when most pieces lie still (the rest are still
  // sliding: reversed, that reads as the heap stirring).
  const ends = flights.filter(Boolean).map((f) => f.tEnd).sort((p, q) => p - q);
  const DR = Math.min(D, ends[Math.floor(ends.length * 0.85)] ?? D);
  return { ix, iy, cell, ns, old, nu, flights, D: DR, ox: cxs, oy: cys };
}

/**
 * A rigid body's flight: ballistic arcs between floor contacts, closed form,
 * bounces losing speed and spin, then a slide to rest. Its tumble eases to
 * lying flat (a sliver) from the first bounce on.
 */
function makeFlight(x0, y0, vx, vy, vz, wt, wp, th0, bA, bF, bP, tilt, ps0) {
  const Yc = Math.max(DH - 1.4, y0 + 0.01);
  const seg = [];
  let t = 0, x = x0, y = y0, z = 0, th = 0, ps = 0;
  for (let k = 0; k < 4; k++) {
    const dt = (-vy + Math.sqrt(vy * vy + 2 * G * (Yc - y))) / G;
    seg.push({ t, x, y, z, vx, vy, vz, th, wt, ps, wp });
    t += dt; x += vx * dt; z += vz * dt; th += wt * dt; ps += wp * dt;
    const vi = vy + G * dt;
    y = Yc; vy = -REST * vi; vx *= 0.55; vz *= 0.4; wt *= 0.4; wp *= 0.35;
    if (REST * vi < 40 || k === 3) break;
  }
  const tRest = t;
  const t1 = seg.length > 1 ? seg[1].t : tRest;
  // Lie flat: the nearest edge-on tumble angle, plus a small tilt.
  const flat = Math.PI / 2 + Math.round((th - Math.PI / 2) / Math.PI) * Math.PI + tilt;
  return { seg, tRest, t1, rest: { x, y, z, vx, vz, th, ps }, dTh: flat - th, bA, bF, bP, tEnd: tRest + 4 * SLIDE };
}

/** Pose of a flight at simulation time s: [x, y, z, theta, psi, beta]. */
function pose(f, s, out) {
  const blend = smooth((s - f.t1) / Math.max(0.05, f.tRest - f.t1));
  if (s <= 0) { out[0] = f.seg[0].x; out[1] = f.seg[0].y; out[2] = 0; out[3] = 0; out[4] = 0; out[5] = 0; out[6] = 0; return out; }
  if (s < f.tRest) {
    let k = f.seg.length - 1;
    while (k > 0 && f.seg[k].t > s) k--;
    const q = f.seg[k], dt = s - q.t;
    out[0] = q.x + q.vx * dt; out[1] = q.y + q.vy * dt + 0.5 * G * dt * dt; out[2] = q.z + q.vz * dt;
    out[3] = q.th + q.wt * dt + f.dTh * blend;
    out[4] = q.ps + q.wp * dt;
  } else {
    const r = f.rest, e = SLIDE * (1 - Math.exp(-(s - f.tRest) / SLIDE));
    out[0] = r.x + r.vx * e; out[1] = r.y; out[2] = r.z + r.vz * e;
    out[3] = r.th + f.dTh; out[4] = r.ps;
  }
  out[5] = f.bA * Math.sin(f.bF * s) * (1 - blend);
  out[6] = s >= f.tRest ? 1 : blend;
  return out;
}

const BREAKS = new Map();
function getBreak(oldD, newD, seed, mode, by) {
  const k = `${oldD}${newD}:${seed}:${mode}:${by}`;
  let v = BREAKS.get(k);
  if (!v) {
    if (BREAKS.size > 16) BREAKS.delete(BREAKS.keys().next().value);
    v = buildBreak(oldD, newD, seed, mode, by);
    BREAKS.set(k, v);
  }
  return v;
}

// ------------------------------------------------------------ drawing glass

const norm3 = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
const L3 = norm3(-0.45, -0.65, 0.62);
const H3 = norm3(L3[0], L3[1], L3[2] + 1);
const SPEC = 20;
const FAC0 = 0.45 + 0.55 * L3[2], SPEC0 = H3[2] ** SPEC;

/** The light sweep: a bright diagonal band, centre in u = x + 0.55 y. */
function sweepAt(x, y, sw) {
  if (sw === null) return 0;
  const u = x + 0.55 * y - sw;
  if (u < -14 || u > 5) return 0;
  return 0.95 * Math.exp(-((u / 2) ** 2)) + 0.3 * Math.exp(-(((u + 7) / 1.8) ** 2));
}

/** A whole digit of glass, with the cracks within `front` (radial) / `frontC` of the impact. */
function drawGlass(g, gl, X0, Y0, sw, boost = 0, part = null, front = 0, frontC = 0) {
  const L = gl.list;
  for (let k = 0; k < L.length; k++) {
    const i = L[k], px = i % DW, py = (i / DW) | 0;
    const lev = gl.level[i] + boost + sweepAt(X0 + px, Y0 + py, sw);
    if (lev >= 1 || dither(px, py, lev)) g.pixel(X0 + px, Y0 + py);
  }
  if (!part || (front <= 0 && frontC <= 0)) return;
  // A crack is a bright line with a dark border, so it reads over the facets.
  const C = part.cracks;
  for (let pass = 0; pass < 2; pass++)
    for (let k = 0; k < C.length; k++) {
      const [i, dist, radial] = C[k];
      if (dist > (radial ? front : frontC)) continue;
      const x = i % DW, y = (i / DW) | 0;
      if (pass === 1) { g.pixel(X0 + x, Y0 + y); continue; }
      for (const [dx, dy] of NB4) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < DW && yy < DH && !gl.edge[yy * DW + xx]) g.pixel(X0 + xx, Y0 + yy, 0);
      }
    }
}

const NB4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Fold a coordinate into [lo, hi]: the side walls the shards bounce off. */
function fold(x, lo, hi) {
  const L = hi - lo;
  let u = (x - lo) % (2 * L);
  if (u < 0) u += 2 * L;
  return lo + (u > L ? 2 * L - u : u);
}

const POSE = new Float64Array(7);
/** The pieces of one digit (`part`), every shard posed at simulation time s. */
function drawShards(g, br, part, s, X0, Y0, sw, boost = 0) {
  const { gl, pix, flight } = part;
  for (let c = 0; c < br.ns; c++) {
    const P = pix[c];
    if (!P.length) continue;
    pose(br.flights[c], s, POSE);
    const [x, y, z, th, ps, be] = POSE;
    const k = Math.min(1.4, Math.max(0.85, 1 + z / 140));
    const ct = Math.cos(th), st = Math.sin(th), cp = Math.cos(ps), sp = Math.sin(ps), cb = Math.cos(be), sb = Math.sin(be);
    const m00 = k * (cp * cb + sp * st * sb), m01 = k * (-sp * cb + cp * st * sb);
    const m10 = k * sp * ct, m11 = k * cp * ct;
    // Lighting from the face normal: diffuse relative to the glass at rest,
    // and a flare when the face mirrors the light into the eye.
    const nx = ct * sb, ny = -st, nz = ct * cb;
    const nl = Math.abs(nx * L3[0] + ny * L3[1] + nz * L3[2]);
    const nh = Math.abs(nx * H3[0] + ny * H3[1] + nz * H3[2]);
    const fac = (0.45 + 0.55 * nl) / FAC0;
    const spec = Math.max(0, nh ** SPEC - SPEC0) * 1.6 + boost;
    const X = fold(X0 + x, 1, W - 1), Y = Y0 + y;
    const ocx = br.ox[c], ocy = br.oy[c];
    const swc = sweepAt(X, Y, sw);
    const det = m00 * m11 - m01 * m10;
    // Lying on the floor the pieces read as a scatter, not a bar: their bevels thin out.
    const rest = POSE[6], eLev = 1 - 0.5 * rest + spec;
    const lit = (i, px, py) => {
      const lev = flight[i] ? eLev : gl.level[i] * fac * (1 - 0.5 * rest) + spec + swc;
      return lev >= 1 || dither(px, py, lev);
    };
    if (Math.abs(det) < 0.3) {
      // Nearly edge-on: a sliver. Every glass pixel lands on it, nothing is stretched.
      for (let j = 0; j < P.length; j++) {
        const i = P[j], px = i % DW, py = (i / DW) | 0;
        if (!lit(i, px, py)) continue;
        const u = px + 0.5 - ocx, v = py + 0.5 - ocy;
        g.pixel(X + m00 * u + m01 * v, Y + m10 * u + m11 * v);
      }
      continue;
    }
    // Otherwise every screen pixel the shard covers looks up the glass it shows.
    const [u0, u1, v0, v1] = part.box[c];
    let sx0 = Infinity, sx1 = -Infinity, sy0 = Infinity, sy1 = -Infinity;
    for (const [u, v] of [[u0, v0], [u1, v0], [u0, v1], [u1, v1]]) {
      const qx = X + m00 * u + m01 * v, qy = Y + m10 * u + m11 * v;
      if (qx < sx0) sx0 = qx; if (qx > sx1) sx1 = qx; if (qy < sy0) sy0 = qy; if (qy > sy1) sy1 = qy;
    }
    const i00 = m11 / det, i01 = -m01 / det, i10 = -m10 / det, i11 = m00 / det;
    const cell = br.cell, mask = gl.mask;
    for (let sy = Math.max(0, Math.floor(sy0)); sy <= Math.min(H - 1, Math.ceil(sy1)); sy++)
      for (let sx = Math.max(0, Math.floor(sx0)); sx <= Math.min(W - 1, Math.ceil(sx1)); sx++) {
        const dx = sx + 0.5 - X, dy = sy + 0.5 - Y;
        const px = Math.floor(i00 * dx + i01 * dy + ocx), py = Math.floor(i10 * dx + i11 * dy + ocy);
        if (px < 0 || py < 0 || px >= DW || py >= DH) continue;
        const i = py * DW + px;
        if (!mask[i] || cell[i] !== c) continue;
        if (lit(i, px, py)) g.pixel(sx, sy);
      }
  }
}

/** A four-pointed star of light. */
function sparkle(g, x, y, r) {
  if (r <= 0.3) return;
  x = Math.round(x); y = Math.round(y);
  const n = Math.round(r), m = Math.round(r * 0.45);
  for (let i = -n; i <= n; i++) { g.pixel(x + i, y); g.pixel(x, y + i); }
  for (let i = -m; i <= m; i++) { g.pixel(x + i, y + i); g.pixel(x + i, y - i); }
  if (r > 2.5) { g.pixel(x - 1, y - 1, 1); g.pixel(x + 1, y + 1); g.pixel(x + 1, y - 1); g.pixel(x - 1, y + 1); }
}

// ------------------------------------------------------------ the colon: two turning gems

const GEM_V = [[1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1]];
function drawGem(g, cx, cy, phi, size) {
  const r = 3.6 * size, h = 5.6 * size, tilt = 0.32;
  const ct = Math.cos(tilt), st = Math.sin(tilt), cphi = Math.cos(phi), sphi = Math.sin(phi);
  const xf = ([x, y, z]) => {
    const x1 = x * cphi + z * sphi, z1 = -x * sphi + z * cphi;
    return [x1, y * ct - z1 * st, y * st + z1 * ct];
  };
  const ring = GEM_V.map(([x, , z]) => xf([x * r, 0, z * r]));
  const apex = [xf([0, -h, 0]), xf([0, h, 0])];
  for (const ap of apex)
    for (let i = 0; i < 4; i++) {
      const A = ring[i], Bv = ring[(i + 1) % 4];
      const e1 = [A[0] - ap[0], A[1] - ap[1], A[2] - ap[2]], e2 = [Bv[0] - ap[0], Bv[1] - ap[1], Bv[2] - ap[2]];
      let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      n = norm3(...n);
      if (n[2] * (ap === apex[0] ? -1 : 1) > 0) n = n.map((v) => -v);
      if (n[2] <= 0.02) continue;
      const lev = 0.08 + 0.55 * Math.max(0, n[0] * L3[0] + n[1] * L3[1] + n[2] * L3[2]) + 1.5 * Math.max(0, n[0] * H3[0] + n[1] * H3[1] + n[2] * H3[2]) ** 30;
      const tri = [[cx + ap[0], cy + ap[1]], [cx + A[0], cy + A[1]], [cx + Bv[0], cy + Bv[1]]];
      const xs = tri.map((p) => p[0]), ys = tri.map((p) => p[1]);
      const bx = Math.floor(Math.min(...xs)), by = Math.floor(Math.min(...ys));
      g.fillWhere((px, py) => {
        let sgn = 0;
        for (let k = 0; k < 3; k++) {
          const [x1, y1] = tri[k], [x2, y2] = tri[(k + 1) % 3];
          const cr = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1);
          if (cr > 0.01) { if (sgn < 0) return false; sgn = 1; } else if (cr < -0.01) { if (sgn > 0) return false; sgn = -1; }
        }
        return lev;
      }, 1, [bx, by, Math.ceil(Math.max(...xs)) - bx + 1, Math.ceil(Math.max(...ys)) - by + 1]);
      if (lev > 1.1) sparkle(g, cx + (ap[0] + A[0] + Bv[0]) / 3, cy + (ap[1] + A[1] + Bv[1]) / 3, 2.5 * Math.min(1, lev - 1.1));
    }
  // The outline: silhouette edges of the turning crystal.
  const sil = [apex[0], ...[0, 1, 2, 3].map((i) => ring[i]), apex[1]];
  for (let i = 0; i < 4; i++) {
    const A = ring[i];
    if (A[2] > -0.5) { g.line(cx + apex[0][0], cy + apex[0][1], cx + A[0], cy + A[1]); g.line(cx + apex[1][0], cy + apex[1][1], cx + A[0], cy + A[1]); }
    const Bv = ring[(i + 1) % 4];
    if (A[2] + Bv[2] > -0.5) g.line(cx + A[0], cy + A[1], cx + Bv[0], cy + Bv[1]);
  }
  void sil;
}

// ------------------------------------------------------------ the hour: bullet time

const H0 = -3.4;                 // the bullet enters (s from :00)
const RATE0 = 0.1;               // the slowed time's rate
const RAMP_A = -0.75, RAMP_B = -0.05;
const BX0 = -12, VB = 500;       // bullet start, and speed in simulation px/s
const BULLET_Y = 22;             // in the digit box

/** Simulation time of the hour show at wall time tau: slowed, then back to speed. */
function simT(tau) {
  if (tau < RAMP_A) return RATE0 * (tau - H0);
  const sA = RATE0 * (RAMP_A - H0), L = RAMP_B - RAMP_A;
  if (tau < RAMP_B) { const u = tau - RAMP_A; return sA + RATE0 * u + ((1 - RATE0) * u * u) / (2 * L); }
  return sA + RATE0 * L + ((1 - RATE0) * L) / 2 + (tau - RAMP_B);
}
function wallT(S) {
  const sA = RATE0 * (RAMP_A - H0), L = RAMP_B - RAMP_A, sB = sA + RATE0 * L + ((1 - RATE0) * L) / 2;
  if (S < sA) return H0 + S / RATE0;
  if (S < sB) { const k = (1 - RATE0) / (2 * L); return RAMP_A + (-RATE0 + Math.sqrt(RATE0 * RATE0 + 4 * k * (S - sA))) / (2 * k); }
  return RAMP_B + (S - sB);
}

function drawBullet(g, S, y) {
  const x = BX0 + VB * S;
  if (x < -40 || x > W + 60) return;
  // Vapour rings shed along the path, expanding and fading.
  for (let j = 0; ; j++) {
    const sj = j * 0.025 + 0.02;
    if (sj > S) break;
    const age = S - sj;
    if (age > 0.17) continue;
    const xr = BX0 + VB * sj, r = 2.5 + 65 * age, rx = 0.3 * r + 0.8;
    const lev = age < 0.05 ? 1 : 1 - (age - 0.05) / 0.12;
    g.fillWhere((px, py) => {
      const q = Math.hypot((px - xr) / rx, (py - y) / r);
      return Math.abs(q - 1) * r < 0.6 ? lev : false;
    }, 1, [xr - rx - 1, y - r - 1, 2 * rx + 3, 2 * r + 3]);
  }
  const xi = Math.round(x), yi = Math.round(y - 0.5);
  // The trail: a streak of disturbed air.
  for (let i = 11; i < 56; i++) {
    const lev = 0.8 * (1 - i / 56);
    if (dither(xi - i, yi, lev)) g.pixel(xi - i, yi);
  }
  // The bullet, with a dark halo so it reads over the glass.
  g.fillRect(xi - 11, yi - 2, 14, 5, 0);
  g.fillRect(xi - 10, yi - 1, 8, 3);
  g.fillRect(xi - 2, yi - 1, 2, 3);
  g.pixel(xi, yi);
  g.pixel(xi - 1, yi - 1, 0); g.pixel(xi - 1, yi + 1, 0);
  g.vline(xi - 5, yi - 1, 3, 0);
  g.pixel(xi - 3, yi - 1, 1);
}

// ------------------------------------------------------------ timelines

// Minute turn, s relative to :00 (plus each digit's stagger).
const T_HIT = -2.75, CRACK = 1.35, T_BREAK = -1.15, HOLD = 0.3, FWD = 1.1, REV = 1.35, HEAL = 0.75, GLOW = 0.5;
const T_SWEEP = 4;              // the light sweep runs at :04, :14, ...

function minuteSlot(g, br, tl, X0, Y0, sw) {
  const { old, nu } = br;
  if (tl < T_HIT) return drawGlass(g, old.gl, X0, Y0, sw);
  if (tl < T_BREAK) {
    const u = (tl - T_HIT) / CRACK;
    drawGlass(g, old.gl, X0, Y0, sw, 0, old, old.rmax * inQuad(u * 1.15), old.rmax * inQuad((u - 0.3) / 0.7));
    const k = tl - T_HIT;
    sparkle(g, X0 + br.ix - 0.5, Y0 + br.iy - 0.5, k < 0.4 ? 5 * (1 - k / 0.4) + 1 : 1);
    if (tl > T_BREAK - 0.08) sparkle(g, X0 + br.ix - 0.5, Y0 + br.iy - 0.5, 7);
    return;
  }
  const D = br.D;
  const tSwap = Math.max(T_BREAK + D / FWD, 0.05), tRev = tSwap + HOLD, tFuse = tRev + D / REV;
  if (tl < tSwap) return drawShards(g, br, old, Math.min((tl - T_BREAK) * FWD, D), X0, Y0, sw);
  if (tl < tRev) return drawShards(g, br, nu, D, X0, Y0, sw);
  if (tl < tFuse) return drawShards(g, br, nu, D - (tl - tRev) * REV, X0, Y0, sw);
  heal(g, br, tl - tFuse, X0, Y0, sw);
}

/** The new digit just fused: a flash, the cracks drawing back into the impact, a sparkle. */
function heal(g, br, k, X0, Y0, sw) {
  const nu = br.nu;
  const boost = 0.55 * Math.exp(-k / 0.1);
  if (k < HEAL) {
    const u = k / HEAL;
    drawGlass(g, nu.gl, X0, Y0, sw, boost, nu, nu.rmax * (1 - smooth(u)), nu.rmax * (1 - smooth(u * 1.8)));
  } else drawGlass(g, nu.gl, X0, Y0, sw, boost);
  const j = k - HEAL * 0.8;
  if (j > 0 && j < GLOW) sparkle(g, X0 + br.ix - 0.5, Y0 + br.iy - 0.5, 6 * Math.sin((Math.PI * j) / GLOW));
}

function hourSlot(g, br, tau, S, X0, Y0, sw, tR) {
  const { old, nu } = br;
  const Shit = (X0 + br.ix - BX0) / VB;
  const sc = S - Shit;
  if (sc < 0) return drawGlass(g, old.gl, X0, Y0, sw);
  if (sc < 0.09) {
    const u = sc / 0.075;
    drawGlass(g, old.gl, X0, Y0, sw, 0, old, old.rmax * smooth(u), old.rmax * smooth(u - 0.4));
    sparkle(g, X0 + br.ix - 0.5, Y0 + br.iy - 0.5, 6 * (1 - sc / 0.09) + 1);
    return;
  }
  const D = br.D, tFuse = tR + D / REV;
  if (tau < tR - 0.2) return drawShards(g, br, old, Math.min(sc - 0.09, D), X0, Y0, sw);
  if (tau < tR) return drawShards(g, br, nu, D, X0, Y0, sw);
  if (tau < tFuse) return drawShards(g, br, nu, D - (tau - tR) * REV, X0, Y0, sw);
  heal(g, br, tau - tFuse, X0, Y0, sw);
}

// ------------------------------------------------------------ the face

const DIG = (c) => `${c.hh}${c.mm}`;

export default {
  name: 'Shatter',
  blurb: 'Cut-glass digits on a mirror floor: each minute the changing digit cracks, bursts into tumbling 3D shards that bounce on the floor, and rewinds as the new one; bullet time on the hour.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { date, fields: f, oled, night }) {
    const [ox, oy] = orbit(date, 2, 3);
    const late = f.sec >= 50;
    const from = late ? f : previousMinute(date);
    const to = late ? clockFields(new Date(date.getTime() + 60000)) : f;
    const tau = late ? f.sec - 60 : f.sec;
    const hour = to.m === 0;
    const A = DIG(from), Bd = DIG(to);
    const Y0 = TOP + oy, F = Y0 + DH;
    const seed = to.minuteKey;

    // The light sweep.
    const ph = f.sec % 10 - T_SWEEP;
    const sw = ph >= 0 && ph < 1.8 ? -35 + 230 * smooth(ph / 1.8) : null;

    g.clip(0, 0, W, F);
    // The colon gems turn all the time; at the hour the bullet's wake spins them.
    const T = (date.getTime() / 1000) % 3600;
    let spin = 0, S = 0, tRev = null;
    const brs = [];
    // Build this turn's breaks early, one slot per second from :50, so the
    // turn itself never pays for them (a cache only: the result is the same).
    if (late && tau < -6) {
      const k = Math.floor(tau + 10);
      if (hour) getBreak(+A[k], +Bd[k], seed * 7 + k, 'hour', BULLET_Y);
      else if (A[k] !== Bd[k]) getBreak(+A[k], +Bd[k], seed * 7 + k, 'minute', 0);
    }
    if (hour && tau >= H0 - 0.5) {
      S = simT(tau);
      for (let k = 0; k < 4; k++) brs.push(getBreak(+A[k], +Bd[k], seed * 7 + k, 'hour', BULLET_Y));
      // Each digit rewinds once its own pieces lie still, never before :00.
      tRev = brs.map((br, k) => Math.max(wallT((SLOT_X[k] + ox + br.ix - BX0) / VB + 0.09 + br.D) + 0.15, 0.05 + 0.2 * k));
      spin = 2 * Math.PI * smooth((tau - wallT((COLON_X - BX0) / VB)) / 1.6);
    }
    const phi = (2 * Math.PI * T) / 7 + spin;
    drawGem(g, COLON_X + ox, Y0 + 14, phi, 1);
    drawGem(g, COLON_X + ox, Y0 + 30, -phi * 0.8 + 0.6, 1);

    const changing = [];
    for (let k = 3; k >= 0; k--) if (A[k] !== Bd[k]) changing.push(k);
    for (let k = 0; k < 4; k++) {
      const X0 = SLOT_X[k] + ox;
      if (hour && tRev) { hourSlot(g, brs[k], tau, S, X0, Y0, sw, tRev[k]); continue; }
      if (hour) { drawGlass(g, GLYPHS[+A[k]], X0, Y0, sw); continue; }
      const i = changing.indexOf(k);
      if (i < 0) { drawGlass(g, GLYPHS[+Bd[k]], X0, Y0, sw); continue; }
      minuteSlot(g, getBreak(+A[k], +Bd[k], seed * 7 + k, 'minute', 0), tau - 0.18 * i, X0, Y0, sw);
    }
    if (hour && tau > H0) drawBullet(g, S, Y0 + BULLET_Y + 0.5);
    g.unclip();

    // The polished floor: everything above it, mirrored and fading.
    for (let y = F; y < H; y++) {
      const kk = y - F, src = F - 1 - kk, lev = 0.85 * (1 - kk / 11);
      if (kk & 1 || lev <= 0) continue;
      for (let x = 0; x < W; x++) if (g.get(x, src) && dither(x, y, lev)) g.pixel(x, y);
    }
    oled.contrast(0xcf + (0x20 - 0xcf) * night);
  },
};
