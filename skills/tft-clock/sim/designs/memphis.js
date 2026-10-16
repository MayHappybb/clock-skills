// memphis: an anamorphic Memphis sculpture.
//
// The time is a Sottsass-style assemblage of bold objects (striped bars,
// polka-dot slabs, zebra half-rings, squiggle-printed wedges) hanging at
// very different depths in an empty room. Only from one point of view do
// they line up into the numerals; the camera lives near that point and
// drifts, so the pieces slide against each other by a pixel or so in
// parallax. Before each minute the camera swings away and the sculpture
// falls apart into a confetti of objects in depth; the objects of the
// changing numerals tumble through space to new places; the camera swings
// back and the new time clicks together. On the hour the camera orbits the
// whole sculpture once.
//
// Palette: Memphis primaries-gone-pastel on a warm paper ground, with ink
// black for patterns and the hard offset shadows Memphis graphics use.
// Everything is anti-aliased: the pieces move by fractions of a pixel.

import { clockFields, previousMinute, rand, rng, sin, cos, clamp, progress, ease, TAU } from '../js/kit.js';
import { GLYPHS } from './memphis-glyphs.js';

const INK = 0x16141a, PAPER = 0xf3ecdf, WHITE = 0xfdfbf6;
const PINK = 0xff8db4, MINT = 0x4fcfb0, YELLOW = 0xffcf2e, BLUE = 0x2f5ee0, RED = 0xf0442e, LILAC = 0xa98bff;

// Fill and print of an object. p: stripes | dots | wave | (solid)
const STYLES = [
  { f: PINK },
  { f: WHITE, p: 'stripes', pc: INK },
  { f: YELLOW, p: 'dots', pc: INK },
  { f: BLUE },
  { f: MINT, p: 'wave', pc: INK },
  { f: RED },
  { f: INK, p: 'dots', pc: WHITE },
  { f: LILAC },
  { f: YELLOW, p: 'stripes', pc: INK },
  { f: PINK, p: 'wave', pc: INK },
];

const F = 160, Z0 = 190;                       // focal length (px), pivot depth
const SLOT_X = [8, 42, 90, 124], CELL_Y = 15;
const AA = { aa: true };

// ------------------------------------------------------------ objects

/** Turn a glyph shape at a screen position into an object: anchor, local geometry, depth. */
function makeObject(sh, ox, oy, z, style) {
  const o = { style, z };
  if (sh.k === 'bar' || sh.k === 'slab') {
    let ax, ay, hl, hs, ang;
    if (sh.k === 'bar') {
      ax = ox + sh.x + sh.w / 2; ay = oy + sh.y + sh.h / 2;
      if (sh.w >= sh.h) { hl = sh.w / 2; hs = sh.h / 2; ang = 0; } else { hl = sh.h / 2; hs = sh.w / 2; ang = Math.PI / 2; }
    } else {
      ax = ox + (sh.x0 + sh.x1) / 2; ay = oy + (sh.y0 + sh.y1) / 2;
      hl = Math.hypot(sh.x1 - sh.x0, sh.y1 - sh.y0) / 2; hs = sh.w / 2; ang = Math.atan2(sh.y1 - sh.y0, sh.x1 - sh.x0);
    }
    Object.assign(o, { k: 'rect', ax, ay, hl, hs, ang });
  } else if (sh.k === 'arc' || sh.k === 'ring') {
    const d = Math.PI / 180;
    Object.assign(o, {
      k: 'arc', ax: ox + sh.cx, ay: oy + sh.cy, r0: sh.r0, r1: sh.r1,
      a0: sh.k === 'ring' ? 0 : sh.a0 * d, a1: sh.k === 'ring' ? TAU : sh.a1 * d,
    });
  } else if (sh.k === 'tri') {
    const cx = (sh.pts[0][0] + sh.pts[1][0] + sh.pts[2][0]) / 3, cy = (sh.pts[0][1] + sh.pts[1][1] + sh.pts[2][1]) / 3;
    Object.assign(o, { k: 'tri', ax: ox + cx, ay: oy + cy, pts: sh.pts.map(([x, y]) => [x - cx, y - cy]) });
  } else if (sh.k === 'disc') {
    Object.assign(o, { k: 'disc', ax: ox + sh.cx, ay: oy + sh.cy, r: sh.r });
  } else if (sh.k === 'squig') {
    Object.assign(o, { k: 'squig', ax: ox + sh.cx, ay: oy + sh.cy, len: sh.len, amp: sh.amp, w: sh.w });
  }
  // World position: the point that projects to the anchor from the rest camera.
  o.X = ((o.ax - 80) * z) / F; o.Y = ((o.ay - 40) * z) / F; o.Z = z;
  return o;
}

// Every numeral in every slot, built once: [slot][digit] -> objects.
const SCULPT = SLOT_X.map((sx, slot) => Array.from({ length: 10 }, (_, d) => {
  const base = (rand(slot, d, 11) * STYLES.length) | 0;
  return GLYPHS[d].map((sh, i) => {
    const z = 122 + 136 * rand(slot * 10 + d, i, 3);
    return makeObject(sh, sx, CELL_Y, z, STYLES[(base + i * 3) % STYLES.length]);
  });
}));

// The colon: two balls far apart in depth.
const COLON = [
  makeObject({ k: 'disc', cx: 0, cy: 0, r: 3.6 }, 80, 31, 128, STYLES[3]),
  makeObject({ k: 'disc', cx: 0, cy: 0, r: 3.6 }, 80, 49, 250, STYLES[0]),
];

// Free confetti: never part of the time, parked in the margins.
const CONFETTI = (() => {
  const r = rng(1986), out = [];
  const kinds = ['tri', 'disc', 'squig', 'tri', 'squig', 'disc', 'bar'];
  for (let i = 0; i < 16; i++) {
    const top = i % 2 === 0;
    const x = 4 + (i >> 1) * 20 + r() * 12, y = top ? 3 + r() * 7 : 70 + r() * 7;
    const z = 95 + r() * 210, k = kinds[i % kinds.length], st = STYLES[(i * 7 + 2) % STYLES.length];
    let sh;
    if (k === 'tri') { const s = 3 + r() * 2; sh = { k: 'tri', pts: [[0, -s], [s * 0.9, s * 0.6], [-s * 0.9, s * 0.6]] }; }
    else if (k === 'disc') sh = { k: 'disc', cx: 0, cy: 0, r: 1.6 + r() * 1.4 };
    else if (k === 'bar') sh = { k: 'bar', x: -5, y: -1.5, w: 10, h: 3 };
    else sh = { k: 'squig', cx: 0, cy: 0, len: 12, amp: 1.8, w: 1.6 };
    const o = makeObject(sh, x, y, z, k === 'squig' ? { f: [INK, BLUE, RED][i % 3] } : { f: st.f });
    o.spin = (r() - 0.5) * 1.2; o.rot0 = r() * TAU; o.ph = r() * TAU;
    out.push(o);
  }
  return out;
})();

// ------------------------------------------------------------ drawing

/** Screen point of local (lx, ly) for anchor (x, y), scale s, rotation (c, n). */
const tp = (P, lx, ly) => [P.x + P.s * (P.c * lx - P.n * ly), P.y + P.s * (P.n * lx + P.c * ly)];

function rectPts(P, l0, l1, s0, s1, ang) {
  // corners of the local box [l0,l1] x [s0,s1] along axis `ang` (precomputed cos/sin in P.ac, P.an)
  const ca = P.ac, na = P.an;
  const L = (l, s) => tp(P, ca * l - na * s, na * l + ca * s);
  return [L(l0, s0), L(l1, s0), L(l1, s1), L(l0, s1)];
}

function drawBase(g, o, P, c) {
  if (o.k === 'rect') g.fillPolygon(rectPts(P, -o.hl, o.hl, -o.hs, o.hs), c, AA);
  else if (o.k === 'arc') {
    const r0 = o.r0 * P.s, r1 = o.r1 * P.s;
    if (o.a1 - o.a0 >= TAU - 1e-6) g.ring(P.x, P.y, r0, r1, c, AA);
    else g.arc(P.x, P.y, r0, r1, o.a0 + P.rot, o.a1 + P.rot, c, AA);
  } else if (o.k === 'tri') g.fillPolygon(o.pts.map(([x, y]) => tp(P, x, y)), c, AA);
  else if (o.k === 'disc') g.fillCircle(P.x, P.y, o.r * P.s, c, AA);
}

function drawPrint(g, o, P, t) {
  const st = o.style, pc = st.pc;
  if (!st.p) return;
  if (o.k === 'rect') {
    const { hl, hs } = o;
    if (st.p === 'stripes') {
      for (let l = -hl + 2.2; l < hl - 1; l += 4) g.fillPolygon(rectPts(P, l - 0.8, l + 0.8, -hs, hs), pc, AA);
    } else if (st.p === 'dots') {
      const rows = hs * 2 >= 10 ? [-hs / 2, hs / 2] : [0];
      for (const sv of rows) for (let l = -hl + 2.6; l < hl - 1.5; l += 4.4) {
        const [x, y] = tp(P, P.ac * l - P.an * sv, P.an * l + P.ac * sv);
        g.fillCircle(x, y, 1.15 * P.s, pc, AA);
      }
    } else if (st.p === 'wave') {
      const A = hs - 1.7, k = 0.9;
      let prev = null;
      for (let l = -hl + 1.2; l <= hl - 1.2 + 0.01; l += 2) {
        const sv = A * sin(l * k + t * 2.2);
        const q = tp(P, P.ac * l - P.an * sv, P.an * l + P.ac * sv);
        if (prev) g.thickLine(prev[0], prev[1], q[0], q[1], 1.4 * P.s, pc, AA);
        prev = q;
      }
    }
  } else if (o.k === 'arc') {
    const full = o.a1 - o.a0 >= TAU - 1e-6;
    const mr = (o.r0 + o.r1) / 2, h = (o.r1 - o.r0) / 2;
    if (st.p === 'stripes') {
      const step = 0.42;
      for (let a = o.a0; a < o.a1 - 0.05; a += step * 2) {
        g.arc(P.x, P.y, o.r0 * P.s, o.r1 * P.s, a + P.rot, Math.min(a + step, o.a1) + P.rot, pc, AA);
      }
    } else if (st.p === 'dots') {
      const step = 4.4 / mr;
      for (let a = o.a0 + step / 2; a < o.a1 - step * 0.3; a += step) {
        g.fillCircle(P.x + mr * P.s * sin(a + P.rot), P.y - mr * P.s * cos(a + P.rot), 1.15 * P.s, pc, AA);
      }
    } else if (st.p === 'wave') {
      const step = 2 / mr, A = h - 1.7;
      let prev = null;
      for (let a = o.a0 + (full ? 0 : 0.12); a <= o.a1 - (full ? 0 : 0.12) + 1e-6; a += step) {
        const rr = (mr + A * sin(a * mr * 0.9 + t * 2.2)) * P.s;
        const q = [P.x + rr * sin(a + P.rot), P.y - rr * cos(a + P.rot)];
        if (prev) g.thickLine(prev[0], prev[1], q[0], q[1], 1.4 * P.s, pc, AA);
        prev = q;
      }
    }
  } else if (o.k === 'tri') {
    g.fillPolygon(o.pts.map(([x, y]) => tp(P, x * 0.42, y * 0.42)), pc, AA);
  } else if (o.k === 'disc') {
    g.fillCircle(P.x, P.y, o.r * 0.4 * P.s, pc, AA);
  }
}

function drawSquig(g, o, P, t) {
  let prev = null;
  for (let i = 0; i <= 6; i++) {
    const l = -o.len / 2 + (o.len * i) / 6, sv = o.amp * sin(i * 1.6 + t * 3 + o.ph);
    const q = tp(P, l, sv);
    if (prev) g.thickLine(prev[0], prev[1], q[0], q[1], o.w * P.s, o.style.f, AA);
    prev = q;
  }
}

// ------------------------------------------------------------ camera

const smooth = (u) => u * u * (3 - 2 * u);

/** Camera pose for this instant: yaw, pitch (radians) about the pivot, distance. */
function pose(f, tms, tau, turnKey, hourly) {
  // A slow wander round the sweet spot: the pieces slide a pixel against each other.
  const w = tms / 1000;
  let psi = 0.018 * sin(w * 0.61) + 0.008 * sin(w * 1.93 + 1.3);
  let phi = 0.012 * sin(w * 0.47 + 2.1) + 0.006 * sin(w * 1.37);
  let D = Z0;
  if (tau !== null) {
    if (hourly) {
      const u = progress(tau, -3.4, 5.2), e = ease.inOutCubic(u);
      psi += TAU * e;
      phi += -0.28 * sin(Math.PI * e);
      D *= 1 - 0.12 * sin(Math.PI * e);
    } else {
      const e = smooth(progress(tau, -3.2, -0.6)) * (1 - smooth(progress(tau, 1.3, 4.0)));
      // always rising to look down a little, so the floor and the objects' shadows come into view
      const sx = rand(turnKey, 1) < 0.5 ? -1 : 1, sy = 1;
      psi += e * sx * (0.46 + 0.1 * rand(turnKey, 3));
      phi += e * sy * (0.2 + 0.1 * rand(turnKey, 4));
      D *= 1 - 0.16 * e;
    }
  }
  return { cp: cos(psi), sp: sin(psi), cf: cos(phi), sf: sin(phi), D };
}

/** Project a world point: screen x, y, scale relative to the rest view, camera depth. */
function project(cam, X, Y, Z, z0) {
  const dz = Z - Z0;
  const x1 = X * cam.cp - dz * cam.sp, z1 = X * cam.sp + dz * cam.cp;
  const y2 = Y * cam.cf - z1 * cam.sf, z2 = Y * cam.sf + z1 * cam.cf;
  const zc = z2 + cam.D;
  return { x: 80 + (F * x1) / zc, y: 40 + (F * y2) / zc, s: z0 / zc, zc };
}

// ------------------------------------------------------------ the floor

const FY = 66, FH = 215;                       // floor height below the pivot, slab half-size
const FLECKS = (() => {
  const r = rng(1981), out = [], cols = [INK, PINK, BLUE, YELLOW, MINT, RED, WHITE];
  for (let i = 0; i < 150; i++) out.push([(r() * 2 - 1) * FH, Z0 + (r() * 2 - 1) * FH, cols[i % cols.length], r() < 0.3]);
  return out;
})();

/** Camera-space point (before projection) of a world point. */
function toCam(cam, X, Y, Z) {
  const dz = Z - Z0;
  const x1 = X * cam.cp - dz * cam.sp, z1 = X * cam.sp + dz * cam.cp;
  return [x1, Y * cam.cf - z1 * cam.sf, Y * cam.sf + z1 * cam.cf + cam.D];
}
const NEAR = 12;
const scr = ([x, y, z]) => [80 + (F * x) / z, 40 + (F * y) / z];

/** Clip a camera-space polygon to z > NEAR and project it. */
function clipProject(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const ia = a[2] > NEAR, ib = b[2] > NEAR;
    if (ia) out.push(scr(a));
    if (ia !== ib) {
      const u = (NEAR - a[2]) / (b[2] - a[2]);
      out.push(scr([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, NEAR]));
    }
  }
  return out;
}

const FLOOR = 0xe6d9d2, FLOOR_EDGE = 0xcdbdb6;

function drawFloor(g, cam) {
  const C = [[-FH, Z0 - FH], [FH, Z0 - FH], [FH, Z0 + FH], [-FH, Z0 + FH]].map(([x, z]) => toCam(cam, x, FY, z));
  const poly = clipProject(C);
  if (poly.length < 3) return;
  // the slab's front face: a band of ink under the near edge reads as thickness
  const T = C.map(([x, y, z], i) => toCam(cam, [-FH, FH, FH, -FH][i], FY + 10, [Z0 - FH, Z0 - FH, Z0 + FH, Z0 + FH][i]));
  for (let i = 0; i < 4; i++) {
    const side = clipProject([C[i], C[(i + 1) % 4], T[(i + 1) % 4], T[i]]);
    if (side.length >= 3) g.fillPolygon(side, i % 2 ? BLUE : INK, AA);
  }
  g.fillPolygon(poly, FLOOR, AA);
  for (const [x, z, c, big] of FLECKS) {
    const q = toCam(cam, x, FY, z);
    if (q[2] < 30) continue;
    const [sx, sy] = scr(q);
    if (sx < -2 || sx > 162 || sy < -2 || sy > 82) continue;
    const k = (big ? 2.4 : 1.4) * (F / q[2]) * 0.9;
    if (k < 0.9) g.pixel(sx | 0, sy | 0, c);
    else g.fillRect(sx - k / 2, sy - k / 4, k, Math.max(1, k / 2), c);
  }
}

function floorShadow(g, cam, it) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * TAU) / 8;
    pts.push(toCam(cam, it.X + it.r * cos(a), FY, it.Z + it.r * sin(a)));
  }
  const poly = clipProject(pts);
  if (poly.length < 3) return;
  let minY = 99;
  for (const p of poly) if (p[1] < minY) minY = p[1];
  if (minY > 80) return;
  g.fillPolygon(poly, INK, { aa: true, a: 0.22 });
}

// ------------------------------------------------------------ the face

export default {
  name: 'Memphis',
  blurb: 'An anamorphic Memphis sculpture: striped, dotted and squiggled objects scattered in depth line up into the time from one viewpoint; each minute the camera swings away and the pieces regroup.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, date = ctx.date, tms = date.getTime();
    ctx.lcd.backlight(1 - 0.7 * ctx.night);
    const t = (tms % 600000) / 1000;

    // Where are we relative to a minute turn?
    let tau = null, prev = f, cur = f, turnKey = f.minuteKey;
    if (f.sec >= 50) { tau = f.sec - 60; turnKey = f.minuteKey + 1; }
    else if (f.sec < 10) { tau = f.sec; prev = previousMinute(date); }
    const nextM = tau !== null && tau < 0 ? clockFields(new Date(tms + 60000)).m : f.m;
    const hourly = tau !== null && nextM === 0;
    const cam = pose(f, tms, tau, turnKey, hourly);

    // ---- the room: paper void, a terrazzo floor slab below the sculpture
    g.clear(PAPER);
    drawFloor(g, cam);

    // ---- collect what to draw this frame
    const items = [];
    const put = (o, X, Y, Z, rot, m, style, shape) => {
      const p = project(cam, X, Y, Z, o.Z);
      if (p.zc < 20 || m <= 0.02) return;
      p.s *= m; p.rot = rot; p.c = cos(rot); p.n = sin(rot);
      items.push({ o: shape || o, p, style: style || o.style, X, Z, r: o.k === 'squig' ? 4 : 9 * (o.Z / F) });
    };

    const digits = (ff) => [ff.hh[0], ff.hh[1], ff.mm[0], ff.mm[1]].map(Number);
    const now = digits(cur), was = digits(prev);
    for (let slot = 0; slot < 4; slot++) {
      const N = SCULPT[slot][now[slot]];
      if (tau === null || tau < 0 || was[slot] === now[slot]) {
        for (const o of N) put(o, o.X, o.Y, o.Z, 0, 1);
        continue;
      }
      // This numeral changes: its objects tumble through space to their new places.
      const O = SCULPT[slot][was[slot]], n = Math.max(O.length, N.length);
      for (let i = 0; i < n; i++) {
        const st = 0.08 + 0.13 * i + 0.07 * slot;
        const u = ease.inOutCubic(progress(tau, st, st + 1.5));
        const a = O[i] ?? O[i % O.length], b = N[i] ?? N[i % N.length];
        const lift = sin(Math.PI * u);
        const X = a.X + (b.X - a.X) * u, Y = a.Y + (b.Y - a.Y) * u - 26 * lift, Z = a.Z + (b.Z - a.Z) * u - 30 * lift;
        const spin = (rand(slot, i, now[slot]) < 0.5 ? -1 : 1) * TAU * u;
        const m = Math.abs(cos(Math.PI * u));
        if (u < 0.5) { if (O[i]) put(O[i], X, Y, Z, spin, m); }
        else if (N[i]) put(N[i], X, Y, Z, spin, m);
      }
    }
    for (const o of COLON) put(o, o.X, o.Y, o.Z, 0, 1);
    for (const o of CONFETTI) {
      const bob = 0.8 * sin(t * 0.9 + o.ph);
      put(o, o.X, o.Y + (bob * o.Z) / F, o.Z, o.rot0 + o.spin * t, 1);
    }

    // ---- the objects' shadows on the floor (only in view when the camera swings)
    for (const it of items) floorShadow(g, cam, it);

    // ---- far to near, each with its hard ink shadow
    items.sort((a, b) => b.p.zc - a.p.zc);
    for (const it of items) {
      const o = it.o, P = it.p;
      if (o.k === 'rect') { const A = o.ang + P.rot; P.ac = cos(A); P.an = sin(A); }
      if (o.k === 'squig') { drawSquig(g, o, P, t); continue; }
      const sh = 1.6 * P.s;
      const S = { ...P, x: P.x + sh, y: P.y + sh };
      drawBase(g, o, S, INK);
      drawBase(g, o, P, it.style.f);
      drawPrint(g, { ...o, style: it.style }, P, t);
    }
  },
};
