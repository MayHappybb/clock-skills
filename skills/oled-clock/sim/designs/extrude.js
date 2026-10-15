// Extrude — 80s chrome title type, ray-cast in real 3D.
//
// HH:MM is a title card hovering over a synthwave floor: four heavy,
// italic, squared-off digits, each a solid block. The profile of a digit
// is a signed distance field built from rounded boxes (union and
// difference), sheared for the lean, and tabulated at 4 samples per px at
// load. Extruded 14 px along z, it is a solid that every frame is
// ray-cast against, pixel by pixel. A ray from the camera through each pixel
// is taken into the digit's own frame, clipped to its box, and marched
// through the depth until it enters the profile. It hits the front face, the
// back face or a wall, and a wall's normal is the gradient of the distance
// field. A depth buffer orders the digits where their blocks overlap.
//
// Shading is a lighting model in 1 bit. The front face is chrome: solid,
// with a dark horizon line across the middle and a thinner reflection
// below it. Walls are hatched by orientation, vertical lines on walls that
// face sideways and horizontal lines on caps that face up or down, at a pitch
// set by Lambert light from low at the front left (the glow off the floor).
// Ambient occlusion keeps a counter open: a wall whose normal runs back into
// its own glyph within 17 px (the inside of a 0, 6, 8 or 9) gets no light
// and stays black. A one-pixel keyline separates face from wall and the
// solid from the scene, and the outer silhouette of the walls is lit solid so
// each block closes.
//
// The camera wanders. Its height sets the horizon, and the vanishing point
// of the extrusion (the same point the floor's lanes run to) drifts 30 px to
// either side, so the walls swing from one side of the digits to the other.
// The card yaws and pitches a few degrees and bobs, like a hovering logo.
// The floor's depth lines scroll towards the viewer. Behind the card a slit
// sun sits on the horizon and sinks 8 px through each hour, rising again as
// the hour turns. The colon is two small cubes that tick a quarter turn each
// second, in opposite directions.
//
// On the minute the changing digit spins about its vertical axis through
// 180°, showing its extruded side mid-turn, and lands as the new digit. Every
// changing digit is exactly edge-on at :00.000, and that is the only place a
// shape is swapped, so no instant shows an old digit next to a new one. On the
// hour all four spin a full 360° in a wave: the leftmost starts first and
// stops first, all four are edge-on together at :00, and their speeds make
// the wave. The 1 has a foot so that, foreshortened mid-spin, it never reads
// as a 7.
//
// Every frame is a function of ctx.date: camera, wobble and floor from the
// time, spins from the seconds around :00, digits from this minute and its
// neighbour.
//
// Burn-in: front faces sit on the projection plane, so the drifting camera
// does not move them. The card walks a 2-pixel orbit, bobs, and wobbles,
// the colon turns, the floor scrolls, the sun sinks, and from 23:00 to 07:00
// the panel runs at low contrast.
//
// Bus: most of the screen changes every frame, so it runs on SPI at 60 fps.
// A frame costs about 1.5 ms to compute.

import { orbit, clockFields, clamp, dither, ease } from '../js/kit.js';

const W = 128, H = 64, PI = Math.PI, DEG = PI / 180;

// ------------------------------------------------------------ glyphs
// Profiles are signed distance fields built from rounded boxes (CSG), on
// a GW x GH box, then sheared for the italic and tabulated at GS samples/px.

const GW = 20, GH = 26, SHEAR = 0.14;           // glyph box; italic lean (px of x per px of y)
const SH_W = GW + SHEAR * GH;                    // sheared width
const ST = 6, BAR = 5;                           // stem width, bar height
const RO = 6, RI = 1.5;                          // outer, inner corner radii

function rbox(x0, y0, x1, y1, r) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hx = (x1 - x0) / 2, hy = (y1 - y0) / 2;
  r = Math.min(r, hx, hy);
  return (x, y) => {
    const qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  };
}
const U = (...fs) => (x, y) => Math.min(...fs.map((f) => f(x, y)));
const S = (a, ...bs) => (x, y) => Math.max(a(x, y), ...bs.map((b) => -b(x, y)));
const mirrorX = (f) => (x, y) => f(GW - x, y);
const turn = (f) => (x, y) => f(GW - x, GH - y);

const XR = GW - ST;                 // left edge of the right stem
const Y1 = BAR, Y2 = (GH - BAR) / 2, Y3 = Y2 + BAR, Y4 = GH - BAR;   // bar edges
const two = U(
  S(rbox(0, 0, GW, Y3, RO), rbox(-9, Y1, XR, Y2, RI)),
  S(rbox(0, Y2, GW, GH, RO), rbox(ST, Y3, GW + 9, Y4, RI)),
  rbox(0, Y4, GW, GH, 1),
);
const six = S(rbox(0, 0, GW, GH, RO), rbox(ST, Y1, GW + 9, Y2, RI), rbox(ST, Y3, XR, Y4, RI));
const PROFILES = [
  S(rbox(0, 0, GW, GH, RO), rbox(ST, Y1, XR, Y4, RI)),
  U(rbox(8, 0, 15, GH, 1), rbox(3, 0, 15, BAR, 1), rbox(3, Y4, GW, GH, 1)),
  two,
  S(rbox(0, 0, GW, GH, RO), rbox(-9, Y1, XR, Y2, RI), rbox(-9, Y3, XR, Y4, RI), rbox(-9, Y1, 4, Y4, 0)),
  U(rbox(0, 0, ST, Y3, 1), rbox(0, Y2, GW, Y3, 1), rbox(XR, 5, GW, GH, 1)),
  U(mirrorX(two), rbox(GW / 2, 0, GW, BAR, 0)),
  six,
  U(rbox(0, 0, GW, BAR, 1), rbox(XR, 0, GW, GH, 1)),
  S(rbox(0, 0, GW, GH, RO), rbox(ST, Y1, XR, Y2, RI), rbox(ST, Y3, XR, Y4, RI)),
  turn(six),
];
const CUBE = 6;

const GS = 4, GM = 2;   // samples per px, margin px
function tabulate(f, w, h, shear) {
  const nu = Math.ceil((w + 2 * GM) * GS), nv = Math.ceil((h + 2 * GM) * GS);
  const a = new Float32Array(nu * nv);
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const u = (i + 0.5) / GS - GM, v = (j + 0.5) / GS - GM;
      // Italic: the top leans right. Unshear into the upright glyph.
      a[j * nu + i] = f(u - shear * (h - v), v);
    }
  return { a, nu, nv, w, h };
}
const TABLES = PROFILES.map((f) => tabulate(f, SH_W, GH, SHEAR));
const CUBE_T = tabulate(rbox(0, 0, CUBE, CUBE, 1), CUBE, CUBE, 0);

function sdf(t, u, v) {
  const i = Math.floor((u + GM) * GS), j = Math.floor((v + GM) * GS);
  if (i < 0 || j < 0 || i >= t.nu || j >= t.nv) return 9;
  return t.a[j * t.nu + i];
}

// ------------------------------------------------------------ scene

const F = 45;            // camera distance
const D = 14;            // extrusion depth
const TOP = 3;           // glyph top on screen
const SLOT_X = [5, 29, 75, 99];
const COLON_X = 64;
const HORIZON = 46;
const SUNSET = 8;         // px the sun sinks over an hour
const CHROME = [[12.4, 13.6], [18.2, 19.1]];

const mat = {
  ry: (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; },
  rx: (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; },
  mul: (A, B) => {
    const C = new Array(9);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) C[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
    return C;
  },
  ap: (A, x, y, z) => [A[0] * x + A[1] * y + A[2] * z, A[3] * x + A[4] * y + A[5] * z, A[6] * x + A[7] * y + A[8] * z],
  apT: (A, x, y, z) => [A[0] * x + A[3] * y + A[6] * z, A[1] * x + A[4] * y + A[7] * z, A[2] * x + A[5] * y + A[8] * z],
};

const LIGHT = (() => { const l = [-0.55, 0.6, -0.55], n = Math.hypot(...l); return l.map((v) => v / n); })();

/**
 * Ray-cast one extruded object into the hit buffers. `o`: { t (table), R
 * (local->world rotation), O (world position of the local centre) }.
 */
function cast(o, cam, zbuf, kind, shade) {
  const t = o.t, D = o.d, cu = t.w / 2, cv = t.h / 2, cw = D / 2;
  const [ex, ey, ez] = mat.apT(o.R, cam.x - o.O[0], cam.y - o.O[1], -F - o.O[2]);
  const ox = ex + cu, oy = ey + cv, oz = ez + cw;
  // Screen box: project the 8 corners.
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  for (const a of [-GM, t.w + GM]) for (const b of [-GM, t.h + GM]) for (const c of [0, D]) {
    const [X, Y, Z] = mat.ap(o.R, a - cu, b - cv, c - cw);
    const k = F / (Z + o.O[2] + F);
    const sx = cam.x + (X + o.O[0] - cam.x) * k, sy = cam.y + (Y + o.O[1] - cam.y) * k;
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  x0 = Math.max(0, Math.floor(x0)); x1 = Math.min(W, Math.ceil(x1)); y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(H, Math.ceil(y1));
  const uMin = -GM, uMax = t.w + GM, vMin = -GM, vMax = t.h + GM;
  for (let py = y0; py < y1; py++)
    for (let px = x0; px < x1; px++) {
      const [dx, dy, dz] = mat.apT(o.R, px + 0.5 - cam.x, py + 0.5 - cam.y, F);
      // Slab intersection.
      let s0 = 0, s1 = Infinity, face = -1;
      const slabs = [[ox, dx, uMin, uMax, 0], [oy, dy, vMin, vMax, 1], [oz, dz, 0, D, 2]];
      let ok = true;
      for (const [p, d, lo, hi, ax] of slabs) {
        if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { ok = false; break; } continue; }
        let ta = (lo - p) / d, tb = (hi - p) / d;
        if (ta > tb) { const q = ta; ta = tb; tb = q; }
        if (ta > s0) { s0 = ta; face = ax; }
        if (tb < s1) s1 = tb;
      }
      if (!ok || s0 >= s1) continue;
      const q = py * W + px;
      if (s0 >= zbuf[q]) continue;
      let u = ox + s0 * dx, v = oy + s0 * dy, w = oz + s0 * dz;
      if (face === 2 && sdf(t, u, v) < 0) {
        zbuf[q] = s0;
        kind[q] = w < cw ? 1 : 2;
        shade[q] = v;       // for the chrome bands
        continue;
      }
      const duv = Math.hypot(dx, dy);
      const step = duv > 1e-6 ? 0.3 / duv : (s1 - s0);
      let sp = s0, hit = -1;
      for (let s = s0 + step, n = 0; n < 400; s += step, n++) {
        const ss = Math.min(s, s1);
        if (sdf(t, ox + ss * dx, oy + ss * dy) < 0) { hit = ss; break; }
        sp = ss;
        if (ss >= s1) break;
      }
      if (hit < 0) continue;
      let a = sp, b = hit;
      for (let k = 0; k < 4; k++) { const m = (a + b) / 2; if (sdf(t, ox + m * dx, oy + m * dy) < 0) b = m; else a = m; }
      if (b >= zbuf[q]) continue;
      u = ox + b * dx; v = oy + b * dy; w = oz + b * dz;
      const e = 1 / GS;
      let gu = sdf(t, u + e, v) - sdf(t, u - e, v), gv = sdf(t, u, v + e) - sdf(t, u, v - e);
      const gl = Math.hypot(gu, gv) || 1;
      // Ambient occlusion: a wall that faces back into its own glyph (the
      // inside of a counter) gets no light and stays dark, so the counters
      // stay open and the digit keeps its shape.
      let occluded = false;
      for (const r of [2.5, 4.5, 7, 10, 13, 17]) if (sdf(t, u + (gu / gl) * r, v + (gv / gl) * r) < 0) { occluded = true; break; }
      const [nx, ny, nz] = mat.ap(o.R, gu / gl, gv / gl, 0);
      const lam = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
      zbuf[q] = b;
      // Side walls (facing left or right on screen) and caps (facing up or down).
      kind[q] = occluded ? 5 : Math.abs(nx) > Math.abs(ny) ? 3 : 4;
      shade[q] = lam;
    }
}

const digitsOf = (f) => [...`${f.hh}${f.mm}`].map(Number);

// ------------------------------------------------------------ the spin
//
// Every changing digit is edge-on at exactly :00.000, and that is where its
// shape is swapped, so no instant shows old and new digits together. The
// wave is in the speeds: each digit starts turning at its own time, all
// arrive edge-on together, and each finishes at its own time.

const BEFORE = { minute: [0, 0, 0.55, 0.7], hour: [1.1, 0.9, 0.7, 0.5] };   // s from start to edge-on
const AFTER = { minute: [0, 0, 0.6, 0.45], hour: [0.6, 0.8, 1.0, 1.2] };     // s from edge-on to rest

/**
 * The spin of slot `s` at `u` seconds from :00 (negative before), turning
 * `turn` degrees in all. Returns { deg: degrees turned, now: whether the new digit shows }.
 */
function spin(s, u, kind, turn) {
  const b = BEFORE[kind][s], a = AFTER[kind][s];
  if (u < 0) {
    if (u <= -b) return { deg: 0, now: false };
    const p = 1 + u / b;
    return { deg: 90 * p * p, now: false };            // accelerating from rest
  }
  if (u >= a) return { deg: turn, now: true };
  const p = u / a;
  return { deg: 90 + (turn - 90) * (1 - (1 - p) ** 3), now: true };   // decelerating, a little past nothing
}

export default {
  name: 'Extrude',
  blurb: 'Ray-cast chrome title type over a synthwave grid; digits spin on their axis at the minute, a wave of 360s on the hour.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { fields: f, date, oled, night }) {
    oled.contrast(0xcf + (0x18 - 0xcf) * night);  // night dimming, 23:00-07:00 (ctx.night)
    const tt = date.getTime() / 1000 - 1.7e9;
    // The camera wanders, so the vanishing point drifts and the walls swing
    // from side to side; the card itself yaws and pitches a few degrees and
    // bobs, and walks a 2-pixel orbit for burn-in.
    const cam = { x: 64 + 30 * Math.sin(tt * 2 * PI / 41), y: HORIZON + 1.5 * Math.sin(tt * 2 * PI / 29) };
    const Rg = mat.mul(mat.ry(3 * DEG * Math.sin(tt * 2 * PI / 23)), mat.rx(2 * DEG * Math.sin(tt * 2 * PI / 31)));
    const [ox, oy] = orbit(date, 2, 3);
    const bob = 1.2 * Math.sin(tt * 2 * PI / 7.3);
    const G = [64 + ox, TOP + GH / 2 + oy + bob, D / 2];

    const u = f.sec >= 30 ? f.sec - 60 : f.sec;
    const before = u < 0 ? f : clockFields(new Date(date.getTime() - 60000));
    const after = u < 0 ? clockFields(new Date(date.getTime() + 60000)) : f;
    const from = digitsOf(before), to = digitsOf(after);
    const hour = after.m === 0;
    const kindT = hour ? 'hour' : 'minute', turnDeg = hour ? 360 : 180;
    const zbuf = new Float32Array(W * H).fill(Infinity), kind = new Uint8Array(W * H), shade = new Float32Array(W * H);
    const objs = [];
    for (let s = 0; s < 4; s++) {
      let d = u < 0 ? from[s] : to[s], ang = 0;
      if (hour || from[s] !== to[s]) {
        const sp = spin(s, u, kindT, turnDeg);
        d = sp.now ? to[s] : from[s];
        ang = sp.deg;
      }
      // Fold the turn into [-90, 90]: the glyph is on both faces of its block.
      ang = ((((ang + 90) % 180) + 180) % 180) - 90;
      objs.push({ t: TABLES[d], d: D, x: SLOT_X[s] + SH_W / 2, y: TOP + GH / 2, spin: ang * DEG });
    }
    // The colon: two cubes that tick a quarter turn every second.
    const tick = 90 * (f.s + ease.outBack(clamp((f.sec - f.s) / 0.35, 0, 1)));
    for (const [cy, dir] of [[TOP + 7, 1], [TOP + GH - 7, -1]]) {
      const a = ((dir * tick) % 90 + 90) % 90 - 45;
      objs.push({ t: CUBE_T, d: CUBE, x: COLON_X + (TOP + GH / 2 - cy) * SHEAR, y: cy, spin: a * DEG });
    }
    for (const o of objs) {
      const P = [o.x + ox - G[0], o.y + oy + bob - G[1], o.d / 2 - G[2]];
      const [X, Y, Z] = mat.ap(Rg, ...P);
      o.O = [G[0] + X, G[1] + Y, G[2] + Z];
      o.R = mat.mul(Rg, mat.ry(o.spin));
      cast(o, cam, zbuf, kind, shade);
    }

    // Keylines: a wall pixel touching the face, or an empty pixel touching
    // the solid, stays dark.
    const key = new Uint8Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const q = y * W + x, k = kind[q];
        if (k === 1) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const X = x + dx, Y = y + dy;
          if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
          const kn = kind[Y * W + X];
          if ((k >= 3 && kn === 1) || (k === 0 && kn !== 0)) { key[q] = 1; break; }
          // A wall pixel on the silhouette is the block's edge: lit solid.
          if ((k === 3 || k === 4) && kn === 0) key[q] = 2;
        }
      }

    const hz = cam.y;
    const SPACING = 24, LANE = 14, CAMH = 17;
    const scroll = tt * 18;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const q = y * W + x;
        const k = kind[q];
        if (key[q] === 1) continue;
        let on = key[q] === 2;
        if (k === 1) {
          // Chrome: a bright upper half, then a dark horizon line and
          // reflections that close up towards the foot, like the sun's.
          const v = shade[q];
          on = !CHROME.some(([a, b]) => v > a && v < b);
        } else if (k === 2) on = dither(x, y, 0.3);
        else if (k === 5) on = false;
        else if (k >= 3 && !on) {
          // Hatch by orientation: side walls in vertical lines, caps in
          // horizontal ones; the light sets the pitch (1 in 2 lit, or 1 in 3).
          const c = k === 3 ? x : y, l = shade[q];
          on = l > 1.5 || (l > 0.7 ? c % 3 !== 0 : l > 0.35 ? (c & 1) === 0 : c % 3 === 0);
        }
        else if (y + 0.5 > hz + 0.5) {
          on = false;
        } else {
          // Sun.
          // It sets through the hour and is back up as the hour turns.
          const sink = f.m === 0 && f.sec < 2 ? 1 - ease.outCubic(f.sec / 2) : (f.m + f.sec / 60) / 60;
          const sx = 64 + ox, sy = hz - 1 + SUNSET * sink, r = 16;
          const dd = Math.hypot(x + 0.5 - sx, y + 0.5 - sy);
          if (dd < r) {
            // Slits fixed to the horizon, widening towards it, drifting down.
            const hgt = hz - (y + 0.5);                // px above the horizon
            const band = (((y - tt * 3) % 4) + 4) % 4;
            const slit = hgt < 11 && band < (11 - hgt) / 4;
            on = !slit;
          }
        }
        if (on) g.pixel(x, y, 1);
      }

    // The floor, drawn where nothing stands in front of it.
    const floorPx = (x, y) => { if (y > hz && y < H && x >= 0 && x < W && !kind[y * W + x] && !key[y * W + x]) g.pixel(x, y, 1); };
    const hzRow = Math.ceil(hz);
    for (let x = 0; x < W; x++) floorPx(x, hzRow);
    // Lines of constant depth, scrolling towards the viewer.
    const z0 = ((scroll % SPACING) + SPACING) % SPACING;
    let prev = Infinity;
    for (let k = 0; k < 40; k++) {
      const z = k * SPACING - z0;
      if (z + F <= 0) continue;
      const yy = hz + (CAMH * F) / (z + F);
      if (yy >= H) continue;
      if (prev - yy < 2.2) break;
      prev = yy;
      const r = Math.floor(yy);
      if (r <= hzRow) break;
      for (let x = 0; x < W; x++) floorPx(x, r);
    }
    // Lanes receding to the vanishing point, from where they are 3 px apart.
    for (let j = -40; j <= 40; j++) {
      const xw = j * LANE, m = (xw - cam.x) / CAMH;
      // Where neighbouring lanes are 2.5 px apart, measured across them.
      const dStart = (2.5 * CAMH * Math.hypot(1, m)) / LANE;
      if (hz + dStart >= H) continue;
      const xa = cam.x + (xw - cam.x) * dStart / CAMH, ya = hz + dStart;
      const xb = cam.x + (xw - cam.x) * (H - hz) / CAMH, yb = H;
      if (Math.max(xa, xb) < 0 || Math.min(xa, xb) >= W) continue;
      // Walk it row by row (and column by column where it is shallow).
      const n = Math.ceil(Math.max(Math.abs(xb - xa), yb - ya) * 1.5);
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        floorPx(Math.floor(xa + (xb - xa) * u), Math.floor(ya + (yb - ya) * u));
      }
    }
  },
};
