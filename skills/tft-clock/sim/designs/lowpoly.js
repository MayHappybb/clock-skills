// Lowpoly ("Viewpoint"): a whole small PlayStation-1 world on 160 x 80,
// and the time is a trick of perspective inside it.
//
// The numerals are drawn with a tiny polygon budget (octagon curves,
// mitred strokes, lowpoly-glyphs.js), and every stroke is a separate slab
// of stone floating over the sea at its own distance, from 7 to 13 units
// away, scaled so that from ONE point in the world they line up into
// "10:09". The camera stands at that point, or nearly: it sways by hand, so
// the slabs slide a pixel or three against each other, their side faces
// flicker into view and their blob shadows lie scattered on the water. The
// colon is two spinning octahedral gems.
//
// Minute turn: from :57.4 the camera walks off the viewpoint (40 degrees
// round, up, back) and the time falls apart into the loose cloud of slabs
// it really is; the slabs of each changing digit tumble into the sea with a
// splash and are gone before :00; after :00 the new slabs leap out of the
// sea into their places with an overshoot, and the camera swings back onto
// the one point where they read, by :02.5. Nothing can read as a wrong
// number: off the viewpoint nothing reads at all. Hour: the camera flies a
// full circle round the cloud (all the islands, the far side of the time),
// the old slabs burst outward and splash down, and the new hour is only
// assembled when the circle closes.
//
// The look is the 1995 GPU's (lowpoly-raster.js): flat-shaded triangles,
// vertices snapped to whole pixels (they swim as the camera moves), an
// affine checker texture on the slab faces that bends when seen at an
// angle, ordered dither, painter's sorting, distance fog, a sea of
// wobbling flat facets with glints (lowpoly-world.js), fogged low-poly
// islands, billboard clouds, a lens flare. The texture coordinates are the
// glass position at the viewpoint, so the checker runs seamless across all
// the slabs exactly when the time lines up, and breaks when it doesn't.
//
// The day is real: dawn pink, blue noon, orange dusk with the sun setting
// in frame, night with stars and a low moon crossing right to left, its
// path glittering on the sea. Backlight dims at night.
//
// Palette: per time of day, interpolated; sea deep/lit/glint, sky top and
// horizon (the fog), warm stone slabs by day, moonlit blue-white by night,
// one hot pink-red for the gems. Hard pixels everywhere (PS1 had no AA).
//
// Cost: a C port would do the 3D in fixed point, as the PS1's GTE did; the
// rasteriser charges each vertex, triangle and pixel to g.cost at those
// prices (see the two helper files).
import { hex, sin, cos, clamp, rand, clockFields, previousMinute } from '../js/kit.js';
import { normStops } from '../js/gfx.js';
import * as gl from './lowpoly-raster.js';
import { mix, rsqrt } from './lowpoly-raster.js';
import * as w from './lowpoly-world.js';
import { GLYPHS } from './lowpoly-glyphs.js';

const { F, CX, CY, add, sub, mul, dot, cross, unit, project, unproject, lookAt } = w;

// ------------------------------------------------------------ the one viewpoint
const PITCH0 = Math.atan(25 / F);           // horizon 25 px above centre
const PIVOT_D = 10;
const E0 = [0, 0, 0];
const CAM0 = lookAt(E0, [0, -PIVOT_D * Math.tan(PITCH0), PIVOT_D]);
const PIVOT = add(E0, mul(CAM0.f, PIVOT_D));

// glyph layout on the glass as seen from the viewpoint
const S = 5, TOPY = 22;
const SLOT_X = [5, 38, 92, 125];
const DMIN = 7.2, DMAX = 12.6, THICK = 0.8;

// ------------------------------------------------------------ palettes by hour
const KEYS = [
  [0, { top: '070a26', hor: '1c2552', deep: '040a22', lit: '1c2f62', glint: 'a8c0ff', gk: 0.8, piece: 'c4d0ff', land0: '0a1030', land1: '1a2450', gem: 'ff4fa0', amb: 0.3, stars: 1, cloud: '1a2048' }],
  [5.2, { top: '0a0c2c', hor: '2a2a5c', deep: '060c26', lit: '262f66', glint: 'b0b8ff', gk: 0.6, piece: 'cfd2ff', land0: '0d1236', land1: '22285a', gem: 'ff4fa0', amb: 0.3, stars: 0.8, cloud: '2a2c5a' }],
  [6.4, { top: '2b2a6c', hor: 'f39a7c', deep: '241d4c', lit: '7a4c7c', glint: 'ffd6a6', gk: 1, piece: 'ffe4cc', land0: '2a1f4a', land1: '6a4068', gem: 'ff3d6e', amb: 0.35, stars: 0, cloud: 'ffb4a0' }],
  [8, { top: '3a6cc8', hor: 'cfe2ee', deep: '13427a', lit: '3c86ae', glint: 'fff4dc', gk: 0.9, piece: 'ffe9b4', land0: '2f5a6a', land1: '5f9a8a', gem: 'ff3d6e', amb: 0.35, stars: 0, cloud: 'ffffff' }],
  [12, { top: '2a64d0', hor: 'b4dcf4', deep: '0b467a', lit: '2a8cb4', glint: 'ffffff', gk: 0.8, piece: 'ffe9b0', land0: '2a5a5a', land1: '64a07a', gem: 'ff3d6e', amb: 0.35, stars: 0, cloud: 'ffffff' }],
  [16.5, { top: '2e5cc4', hor: 'c4dcf0', deep: '0e3f74', lit: '3a7eaa', glint: 'fff0c8', gk: 0.9, piece: 'ffe6a8', land0: '2c4f5c', land1: '6a9478', gem: 'ff3d6e', amb: 0.35, stars: 0, cloud: 'fff6ec' }],
  [18.6, { top: '26185c', hor: 'ff8c4c', deep: '2a1442', lit: '8c3a5c', glint: 'ffd27a', gk: 1, piece: 'ffe2c2', land0: '2a1236', land1: '6a2a4a', gem: 'ff3d6e', amb: 0.35, stars: 0, cloud: 'ff9c7c' }],
  [20, { top: '0d0e34', hor: '3a2a5e', deep: '080c28', lit: '2a2c62', glint: 'c0b0ff', gk: 0.7, piece: 'd2ccff', land0: '0e1034', land1: '262658', gem: 'ff4fa0', amb: 0.3, stars: 0.6, cloud: '30285a' }],
  [21.5, { top: '070a26', hor: '1c2552', deep: '040a22', lit: '1c2f62', glint: 'a8c0ff', gk: 0.8, piece: 'c4d0ff', land0: '0a1030', land1: '1a2450', gem: 'ff4fa0', amb: 0.3, stars: 1, cloud: '1a2048' }],
  [24, { top: '070a26', hor: '1c2552', deep: '040a22', lit: '1c2f62', glint: 'a8c0ff', gk: 0.8, piece: 'c4d0ff', land0: '0a1030', land1: '1a2450', gem: 'ff4fa0', amb: 0.3, stars: 1, cloud: '1a2048' }],
].map(([h, p]) => [h, Object.fromEntries(Object.entries(p).map(([k, v]) => [k, typeof v === 'string' ? hex(v) : v]))]);

function paletteAt(hour) {
  let k = 1;
  while (KEYS[k][0] < hour) k++;
  const [h0, a] = KEYS[k - 1], [h1, b] = KEYS[k];
  const u = (hour - h0) / (h1 - h0);
  const p = {};
  for (const key of Object.keys(a)) p[key] = key === 'gk' || key === 'amb' || key === 'stars' ? a[key] + (b[key] - a[key]) * u : mix(a[key], b[key], u);
  p.fog = p.hor;
  p.sun = mix(0xfff2c0, p.hor, 0.25);
  p.moon = 0xe8ecff;
  // the sea hazes to its own colour, darker than the sky at the horizon
  p.seaFog = mix(p.lit, p.hor, 0.5);
  p.key = unit([-0.45, 0.45, -0.77]);       // the key light on the pieces: upper left, from the camera's side
  return p;
}

/**
 * Sun or moon for the hour, as a direction pointing at it. The sun rises
 * on the left, stands high at noon (out of frame; its glints stay on the
 * sea) and sets on the right. The moon keeps low all night and crosses the
 * frame right to left, its path glittering on the water.
 */
function lightAt(hour) {
  const day = (hour - 6) / 12;              // 0 at 06:00, 1 at 18:00
  if (day >= -0.04 && day <= 1.04) {
    const el = 0.015 + 0.55 * sin(Math.PI * clamp(day, 0, 1)), az = -1.3 + 2.6 * day;
    return { dir: unit([sin(az) * cos(el), sin(el), cos(az) * cos(el)]), moon: false };
  }
  const nt = (((hour - 18.48) % 24) + 24) % 24 / 11.04;   // 0 .. 1 across the night
  const el = 0.07 + 0.07 * sin(Math.PI * nt), az = 1.25 - 2.5 * nt;
  return { dir: unit([sin(az) * cos(el), sin(el), cos(az) * cos(el)]), moon: true };
}

const fog = (d) => { const u = clamp((d - 14) / 140, 0, 1); return u * (2 - u); };

// ------------------------------------------------------------ pieces

/** The pieces of digit `v` in slot `i`: front polygon on the glass and depth. */
function digitPieces(i, v) {
  const polys = GLYPHS[v];
  const n = polys.length;
  // stratified depths: neighbours rarely share a depth
  const order = polys.map((_, k) => k).sort((p, q) => rand(i * 10 + v, p, 7) - rand(i * 10 + v, q, 7));
  return polys.map((poly, k) => {
    const rank = order.indexOf(k);
    const d = DMIN + (DMAX - DMIN) * ((rank + 0.2 + 0.6 * rand(i, v, k)) / n);
    const pts = poly.map(([x, y]) => [SLOT_X[i] + x * S, TOPY + y * S]);
    return { pts, d, slot: i, k };
  });
}

/** World geometry of a piece: front and back rings of vertices. */
function pieceMesh(p, tf) {
  let front = p.pts.map(([x, y]) => unproject(CAM0, x, y, p.d));
  let back = p.pts.map(([x, y]) => unproject(CAM0, x, y, p.d + THICK));
  const c = centroid(front.concat(back));
  const sgn = dot(newell(front), sub(E0, centroid(front))) > 0 ? 1 : -1;
  if (tf) {
    // rotate about the centroid (Rodrigues), then move
    const k = tf.axis, ca = cos(tf.ang), sa = sin(tf.ang);
    const rot = (q) => {
      const v = sub(q, c);
      const kv = cross(k, v), kd = dot(k, v) * (1 - ca);
      return add(add(c, tf.move), [v[0] * ca + kv[0] * sa + k[0] * kd, v[1] * ca + kv[1] * sa + k[1] * kd, v[2] * ca + kv[2] * sa + k[2] * kd]);
    };
    front = front.map(rot); back = back.map(rot);
  }
  return { front, back, c: tf ? add(c, tf.move) : c, uv: p.pts, sgn };
}
const pos = (v) => (v > 0 ? v : 0);
const centroid = (pts) => mul(pts.reduce((s, q) => add(s, q), [0, 0, 0]), 1 / pts.length);

// a quiet stone texture: 8x8 checker squares two tones apart
const TW = 16, TH = 16;
const TEX = new Uint8Array(TW * TH);
for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) TEX[y * TW + x] = ((x >> 3) + (y >> 3)) & 1;

function newell(pts) {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return unit([nx, ny, nz]);
}

/** Push a piece's visible faces into the ordering table. */
function pushPiece(cam, mesh, pal, ot, extra = {}) {
  const { front, back } = mesh;
  const n = front.length;
  const PF = front.map((p) => project(cam, p)), PB = back.map((p) => project(cam, p));
  if (PF.some((p) => !p) || PB.some((p) => !p)) return;
  // outward sign from the front face (it faces the viewpoint)
  const fc = front.reduce((s, p) => add(s, p), [0, 0, 0]).map((v) => v / n);
  const nf = newell(front);
  // the solid is closed and wound one way, so one sign serves every face;
  // take it from the front face, which faces the viewpoint before any spin
  const sgn = mesh.sgn ?? (dot(nf, sub(E0, fc)) > 0 ? 1 : -1);
  const dist = w.len(sub(fc, cam.e));
  const fogK = fog(dist) + (extra.fogAdd ?? 0);
  const faces = [{ ring: [...front.keys()].map((k) => k), world: front, front: true }];
  faces.push({ world: back.slice().reverse(), proj: PB.slice().reverse() });
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    faces.push({ world: [front[k1], front[k], back[k], back[k1]], proj: [PF[k1], PF[k], PB[k], PB[k1]] });
  }
  faces[0].proj = PF;
  for (const f of faces) {
    const P = f.proj;
    // screen winding (y down): the front face winds positive when seen from outside
    let s = 0;
    for (let k = 0; k < P.length; k++) { const a = P[k], b = P[(k + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; }
    if (s <= 0) continue;
    const nrm = mul(newell(f.world), sgn);
    const lit = pal.amb + (1 - pal.amb) * pos(dot(nrm, pal.key));
    let col = mix(0, pal.piece, clamp(lit, 0, 1.2));
    col = mix(col, pal.fog, clamp(fogK, 0, 1));
    const z = P.reduce((m, p) => m + p[2], 0) / P.length;
    if (f.front && !extra.flat) {
      const c2 = mix(col, 0, 0.16);
      const pats = new Uint16Array(32);
      gl.patternOf(col, pats.subarray(0, 16)); gl.patternOf(c2, pats.subarray(16, 32));
      // texture coordinates: the glass position at the viewpoint, so all
      // pieces share one texture when the time lines up
      const uv = mesh.uv;
      ot.push({ z, draw: () => {
        for (let k = 1; k < P.length - 1; k++)
          gl.triTex(P[0][0], P[0][1], uv[0][0], uv[0][1], P[k][0], P[k][1], uv[k][0], uv[k][1], P[k + 1][0], P[k + 1][1], uv[k + 1][0], uv[k + 1][1], TEX, TW, TH, pats);
      } });
    } else {
      ot.push({ z, draw: () => {
        const pat = gl.patternOf(col);
        for (let k = 1; k < P.length - 1; k++) gl.tri(P[0][0], P[0][1], P[k][0], P[k][1], P[k + 1][0], P[k + 1][1], pat);
      } });
    }
  }
}

// ------------------------------------------------------------ the colon: two spinning gems

function pushGem(cam, c, r, spin, pal, ot) {
  const top = add(c, [0, r * 1.35, 0]), bot = add(c, [0, -r * 1.35, 0]);
  const eq = [0, 1, 2, 3].map((k) => add(c, [r * cos(spin + k * Math.PI / 2), 0, r * sin(spin + k * Math.PI / 2)]));
  const faces = [];
  for (let k = 0; k < 4; k++) { const k1 = (k + 1) % 4; faces.push([top, eq[k1], eq[k]], [bot, eq[k], eq[k1]]); }
  const dist = w.len(sub(c, cam.e));
  for (const f of faces) {
    const P = f.map((p) => project(cam, p));
    if (P.some((p) => !p)) return;
    const s = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]);
    const nrm = unit(cross(sub(f[1], f[0]), sub(f[2], f[0])));
    const outward = dot(nrm, sub(add(add(f[0], f[1]), f[2]).map((v) => v / 3), c)) > 0 ? nrm : mul(nrm, -1);
    if (dot(outward, sub(cam.e, f[0])) <= 0) continue;
    void s;
    const lit = 0.35 + 0.65 * pos(dot(outward, pal.key)) + 0.5 * pos(dot(outward, pal.key)) ** 8;
    let col = lit > 1 ? mix(pal.gem, 0xffffff, lit - 1) : mix(0, pal.gem, lit);
    col = mix(col, pal.fog, fog(dist));
    const z = (P[0][2] + P[1][2] + P[2][2]) / 3;
    ot.push({ z, draw: () => gl.tri(P[0][0], P[0][1], P[1][0], P[1][1], P[2][0], P[2][1], gl.patternOf(col)) });
  }
}

// ------------------------------------------------------------ the sky

function sky(g, cam, pal, L, ts) {
  // the horizon: where level directions at infinity land
  const hf = unit([cam.f[0], 0, cam.f[2]]), hr = unit([hf[2], 0, -hf[0]]);
  const a = w.projectDir(cam, unit(add(hf, mul(hr, -0.6)))), b = w.projectDir(cam, unit(add(hf, mul(hr, 0.6))));
  let nx = 0, ny = -1, c0 = 0;
  if (a && b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    nx = dy / l; ny = -dx / l;                // points up (screen y down)
    c0 = -(nx * a[0] + ny * a[1]);
  }
  const SKYH = 26;
  const st = normStops([[0, pal.seaFog], [0.499, pal.seaFog], [0.5, pal.fog], [0.75, mix(pal.fog, pal.top, 0.55)], [1, pal.top]]);
  // below the horizon the sea covers; fog colour under any gap it leaves
  g.fillRect(0, 0, 160, 80, pal.seaFog);
  const yAt = (x) => (Math.abs(ny) > 1e-3 ? -(nx * x + c0) / ny : 80);
  const yb = clamp(Math.ceil(Math.max(yAt(0), yAt(160))) + 2, 0, 80);
  if (yb > 0) g.ramp((px, py) => clamp(0.5 + (nx * px + ny * py + c0) / (2 * SKYH), 0, 1), st, [0, 0, 160, yb]);
}

// stars: fixed directions, a table
const STARS = Array.from({ length: 70 }, (_, k) => {
  const az = rand(k, 1) * Math.PI * 2, el = 0.015 + 0.42 * rand(k, 2) ** 1.4;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el), 0.35 + 0.65 * rand(k, 3)];
});

// clouds: low-poly billboards far out, three flattened hexagons each
const CLOUDS = Array.from({ length: 9 }, (_, k) => [rand(k, 11) * Math.PI * 2, 170 + 50 * rand(k, 12), 9 + 12 * rand(k, 13), 0.7 + 0.6 * rand(k, 14)]);

function heavens(cam, pal, L, ts) {
  // stars
  if (pal.stars > 0.02)
    for (let k = 0; k < STARS.length; k++) {
      const s = STARS[k];
      const p = w.projectDir(cam, s);
      if (!p) continue;
      const x = p[0] | 0, y = p[1] | 0;
      if (x < 0 || y < 0 || x >= 160 || y >= 80) continue;
      const tw = 0.75 + 0.25 * sin(ts * (1.3 + s[3]) + k);
      gl.put(x, y, mix(pal.top, 0xf4f0ff, pal.stars * s[3] * tw));
    }
  // clouds
  for (const [az0, d, alt, sz] of CLOUDS) {
    const az = az0 + ts * 0.0012;
    const c = [PIVOT[0] + sin(az) * d, alt, PIVOT[2] + cos(az) * d];
    const rt = [cos(az), 0, -sin(az)];
    const col = mix(pal.cloud, pal.fog, 0.35);
    const col2 = mix(pal.cloud, pal.fog, 0.6);
    for (let b = 0; b < 3; b++) {
      const bx = (b - 1) * 11 * sz, rx = (b === 1 ? 13 : 9) * sz, ry = (b === 1 ? 4.2 : 3) * sz;
      const ctr = add(c, add(mul(rt, bx), [0, b === 1 ? 1.5 : 0, 0]));
      const P = [];
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const q = project(cam, add(ctr, add(mul(rt, rx * cos(a)), [0, Math.max(-0.4, sin(a)) * ry, 0])));
        if (!q) break;
        P.push(q);
      }
      if (P.length < 6 || P.every((q) => q[1] > 80 || q[1] < -10 || q[0] < -30 || q[0] > 190)) continue;
      const pat = gl.patternOf(b === 1 ? col : col2);
      for (let k = 1; k < 5; k++) gl.tri(P[0][0], P[0][1], P[k][0], P[k][1], P[k + 1][0], P[k + 1][1], pat);
    }
  }
  // the sun or moon, with a glow
  const p = w.projectDir(cam, L.dir);
  if (p && p[0] > -30 && p[0] < 190 && p[1] > -30 && p[1] < 110) {
    const disc = L.moon ? pal.moon : pal.sun;
    const r = L.moon ? 3.6 : 5;
    ngon(p[0], p[1], r * 3, 8, disc, 0.12);
    ngon(p[0], p[1], r * 1.8, 8, disc, 0.22);
    ngon(p[0], p[1], r, 8, disc, 1);
  }
}

/** A regular n-gon on screen (a fan), opaque or blended. */
function ngon(cx, cy, r, n, c, a, rot = 0) {
  const pat = a >= 1 ? gl.patternOf(c) : null;
  let x0 = cx + r * cos(rot), y0 = cy + r * sin(rot);
  for (let k = 1; k < n - 1; k++) {
    const a1 = rot + (k / n) * Math.PI * 2, a2 = rot + ((k + 1) / n) * Math.PI * 2;
    const x1 = cx + r * cos(a1), y1 = cy + r * sin(a1), x2 = cx + r * cos(a2), y2 = cy + r * sin(a2);
    if (pat) gl.tri(x0, y0, x1, y1, x2, y2, pat); else gl.triBlend(x0, y0, x1, y1, x2, y2, c, a);
  }
}

/** The PS1 lens flare: hexagons strung through the screen centre, when the sun is in frame. */
function flare(cam, pal, L) {
  if (L.moon) return;
  const p = w.projectDir(cam, L.dir);
  if (!p || p[0] < -10 || p[0] > 170 || p[1] < -10 || p[1] > 90) return;
  const dx = CX - p[0], dy = CY - p[1];
  for (const [k, r, a] of [[0.55, 2.5, 0.22], [1.15, 5.5, 0.12], [1.5, 3, 0.18], [1.9, 8, 0.08]])
    ngon(p[0] + dx * k, p[1] + dy * k, r, 6, pal.sun, a, 0.3);
}

// ------------------------------------------------------------ splashes and shadows

/** A low-poly splash at world point p, age a (s): a crown of foam and four drops. */
function pushSplash(cam, p, a, pal, ot) {
  const D = 0.75;
  if (a < 0 || a > D) return;
  const u = a / D, rr = 0.3 + 0.9 * u, hgt = 1.4 * sin(Math.PI * Math.min(1, u * 1.25)) * (1 - 0.3 * u);
  const foam = mix(mix(pal.piece, 0xffffff, 0.5), pal.seaFog, 0.15);
  const N = 7;
  for (let k = 0; k < N; k++) {
    const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2, am = (a0 + a1) / 2;
    const b0 = add(p, [rr * cos(a0), 0, rr * sin(a0)]), b1 = add(p, [rr * cos(a1), 0, rr * sin(a1)]);
    const tip = add(p, [rr * 1.25 * cos(am), hgt * (0.7 + 0.3 * rand(k, 3)), rr * 1.25 * sin(am)]);
    const P = [b0, b1, tip].map((q) => project(cam, q));
    if (P.some((q) => !q)) continue;
    const col = k & 1 ? foam : mix(foam, pal.lit, 0.3);
    ot.push({ z: (P[0][2] + P[1][2] + P[2][2]) / 3, draw: () => gl.tri(P[0][0], P[0][1], P[1][0], P[1][1], P[2][0], P[2][1], gl.patternOf(col)) });
  }
  for (let k = 0; k < 4; k++) {
    const ang = k * 1.7 + 0.4, v = 2.2 + rand(k, 9);
    const q = add(p, [cos(ang) * v * a, 7 * a - 14 * a * a + 0.3, sin(ang) * v * a]);
    const P = project(cam, q);
    if (!P || q[1] < p[1]) continue;
    const r = 7 / P[2] > 0.6 ? 7 / P[2] : 0.6;
    ot.push({ z: P[2], draw: () => gl.tri(P[0] - r, P[1], P[0] + r, P[1], P[0], P[1] - 2 * r, gl.patternOf(foam)) });
  }
}

/** A round blob shadow on the sea under world point c (the PS1 way: straight down). */
function pushShadow(cam, c, r, ts, pal) {
  const y = w.seaHeight(c[0], c[2], ts) + 0.05;
  const N = 6, P = [];
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    const q = project(cam, [c[0] + r * cos(a), y, c[2] + r * sin(a)]);
    if (!q) return;
    P.push(q);
  }
  const lift = clamp((c[1] - y) / 10, 0, 1);
  for (let k = 1; k < N - 1; k++) gl.triBlend(P[0][0], P[0][1], P[k][0], P[k][1], P[k + 1][0], P[k + 1][1], pal.deep, 0.45 * (1 - 0.5 * lift));
}

// ------------------------------------------------------------ the minute turn
//
// u: seconds from the turn (negative before :00). Before :00 the camera
// swings off the viewpoint, the time comes apart into the cloud it really
// is, and the pieces of each changing digit drop into the sea; after :00
// the new pieces leap out of the sea into their places, and the camera
// swings back onto the one point where they line up.

const GRAV = 30;
const ease3 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const ease5 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (x * 6 - 15) + 10));
const outBack = (x) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; };

/** Camera envelope for the turn: [swing 0..1, yaw of the hour's full orbit]. */
function swingAt(u, hourTurn) {
  if (hourTurn) {
    const env = ease5((u + 4.6) / 1.6) * (1 - ease5((u - 2.8) / 1.8));
    return { amt: env, orbit: 2 * Math.PI * ease5((u + 4.2) / 8.8) };
  }
  return { amt: ease5((u + 2.6) / 1.4) * (1 - ease5((u - 1.0) / 1.5)), orbit: 0 };
}

/** Where a leaving piece is: transform, or null once it has sunk; and its splash age. */
function leaving(p, mesh0, u, hourTurn, ts) {
  const r = rand(p.slot * 31 + p.k, p.v, 5);
  const t0 = hourTurn ? -2.0 + 0.6 * r : -1.5 + 0.5 * r;
  const tau = u - t0;
  if (tau <= 0) return { tf: null };
  const c = mesh0.c;
  let vx = 0, vz = 0, vy = 1.5;
  if (hourTurn) {
    const out = sub(c, PIVOT);
    const hl = w.hdist(out[0], out[2]) || 1;
    vx = out[0] / hl * 5; vz = out[2] / hl * 5; vy = 7;
  } else { vx = (rand(p.k, p.v, 2) - 0.5) * 1.5; vz = (rand(p.k, p.v, 3) - 0.5) * 1.5; }
  const sea = w.SEA_Y;
  // time to reach the sea: c.y + vy t - G t^2 / 2 = sea
  const q2 = vy * vy + 2 * GRAV * (c[1] - sea), hit = (vy + q2 * rsqrt(q2)) / GRAV;
  const at = Math.min(tau, hit);
  const move = [vx * at, vy * at - GRAV * at * at / 2, vz * at];
  const axis = unit([rand(p.k, 1, p.slot) - 0.5, rand(p.k, 2, p.slot) - 0.5, rand(p.k, 3, p.slot) - 0.5]);
  const tf = { move, axis, ang: (4 + 5 * r) * at };
  const splashAt = add(c, [move[0], 0, move[2]]);
  splashAt[1] = w.seaHeight(splashAt[0], splashAt[2], ts);
  return { tf, gone: tau >= hit, splash: tau - hit, splashAt };
}

/** Where an arriving piece is: transform, hidden before it breaks the surface. */
function arriving(p, mesh0, u, hourTurn, ts) {
  const r = rand(p.slot * 17 + p.k, p.v, 6);
  const t1 = hourTurn ? 0.1 + 0.9 * r : 0.05 + 0.4 * r;
  const dur = hourTurn ? 1.1 : 0.85;
  const tau = u - t1;
  const c = mesh0.c;
  const sea = w.seaHeight(c[0], c[2], ts);
  const splash = { splash: tau, splashAt: [c[0], sea, c[2]] };
  if (tau <= 0) return { hidden: true, ...splash };
  if (tau >= dur) return { tf: null, ...splash };
  const e = outBack(tau / dur);
  const depth = sea - 1.2 - c[1];         // start just under the surface
  if (c[1] + depth * (1 - e) < sea + 0.1) return { hidden: true, ...splash };   // still under water
  const axis = unit([rand(p.k, 4, p.slot) - 0.5, 0.3, rand(p.k, 5, p.slot) - 0.5]);
  return { tf: { move: [0, depth * (1 - e), 0], axis, ang: (1 - e) * (5 + 4 * r) }, ...splash };
}

// ------------------------------------------------------------ the frame

function render(g, ctx) {
  const f = ctx.fields, date = ctx.date;
  gl.begin(g); w.begin(g);
  const hour = f.h + f.m / 60 + f.sec / 3600;
  const ts = f.h * 3600 + f.m * 60 + f.sec;
  const pal = paletteAt(hour);
  const L = lightAt(hour);

  // which turn is near, and the digits on each side of it
  let u = 99, oldD = null, newD = null, hourTurn = false, side = 1;
  if (f.sec >= 55) {
    const nx = clockFields(new Date(date.getTime() + 60000));
    u = f.sec - 60; oldD = f.hh + f.mm; newD = nx.hh + nx.mm; hourTurn = nx.m === 0; side = (f.minuteKey + 1) & 1 ? 1 : -1;
  } else if (f.sec < 5) {
    const pv = previousMinute(date);
    u = f.sec; oldD = pv.hh + pv.mm; newD = f.hh + f.mm; hourTurn = f.m === 0; side = f.minuteKey & 1 ? 1 : -1;
  }
  const sw = u < 90 ? swingAt(u, hourTurn) : { amt: 0, orbit: 0 };

  // the camera: a slow handheld sway about the pivot at rest, small enough
  // that the pieces slide a pixel or three apart and back; the swing off
  // the viewpoint at the turn; a full orbit at the hour
  // once a minute (:18-:26) the sway breathes deeper: the time loosens
  // into its pieces a little further and pulls itself together again
  const breath = 1 + 1.3 * Math.max(0, sin(Math.PI * clamp((f.sec - 18) / 8, 0, 1)));
  const yaw = breath * (0.05 * sin(ts * 0.86) + 0.022 * sin(ts * 2.03 + 1)) + sw.amt * 0.72 * side + sw.orbit * side;
  const elev = breath * 0.03 * sin(ts * 0.61 + 2) + sw.amt * (hourTurn ? 0.5 : 0.34);
  const dist = 1 + sw.amt * (hourTurn ? 0.55 : 0.22);
  const e = add(PIVOT, orbit(mul(sub(E0, PIVOT), dist), yaw, elev));
  const look = add(PIVOT, [0.12 * sin(ts * 0.37), 0.08 * sin(ts * 0.53 + 1) - sw.amt * 1.2, 0]);
  const cam = lookAt(e, look, 0.02 * sin(ts * 0.29) - sw.amt * 0.08 * side);

  sky(g, cam, pal, L, ts);
  heavens(cam, pal, L, ts);
  const ot = [];
  w.sea(cam, PIVOT, ts, pal, L.dir, fog, ot);
  w.islands(cam, pal, L.dir, fog, ot);
  ot.sort((p, q) => q.z - p.z);
  for (const o of ot) o.draw();

  // the pieces, and what the turn is doing to them
  const ot2 = [], shadows = [];
  const shown = oldD ?? (f.hh + f.mm);
  for (let i = 0; i < 4; i++) {
    const changing = oldD && oldD[i] !== newD[i];
    const sets = changing ? [[+oldD[i], 'out'], [+newD[i], 'in']] : [[+shown[i], 'stay']];
    for (const [v, mode] of sets)
      for (const p of digitPieces(i, v)) {
        p.v = v;
        const mesh0 = pieceMesh(p);
        let st = { tf: null };
        if (mode === 'out') st = leaving(p, mesh0, u, hourTurn, ts);
        else if (mode === 'in') st = arriving(p, mesh0, u, hourTurn, ts);
        if (st.splash !== undefined) pushSplash(cam, st.splashAt, st.splash, pal, ot2);
        if (st.gone || st.hidden) continue;
        const mesh = st.tf ? pieceMesh(p, st.tf) : mesh0;
        pushPiece(cam, mesh, pal, ot2);
        if (sw.amt > 0.02) shadows.push(mesh.c);
      }
  }
  for (const c of shadows) pushShadow(cam, c, 0.9, ts, pal);
  const spin = ts * 2.4 + 6 * ease5((u + 2) / 4);
  for (const gy of [39, 57]) pushGem(cam, unproject(CAM0, 80, gy, PIVOT_D), 0.42, spin, pal, ot2);
  ot2.sort((p, q) => q.z - p.z);
  for (const o of ot2) o.draw();
  flare(cam, pal, L);
}

/** Rotate an offset vector by yaw (about y) then elevation (about the horizontal axis across it). */
function orbit(o, yaw, elev) {
  const cy = cos(yaw), sy = sin(yaw);
  const x = o[0] * cy + o[2] * sy, z = -o[0] * sy + o[2] * cy, y = o[1];
  const hl = w.hdist(x, z), ce = cos(elev), se = sin(elev);
  const nh = hl * ce - y * se, ny = hl * se + y * ce;
  return [x / (hl || 1) * nh, ny, z / (hl || 1) * nh];
}

export default {
  name: 'Viewpoint',
  blurb: 'PS1-era low-poly world: the time is stone slabs floating at different depths over a wobbling sea, lined up from one camera position; each minute the camera walks off and it falls apart.',
  fps: 60,
  frame(g, ctx) {
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    render(g, ctx);
  },
};
