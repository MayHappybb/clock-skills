// placeholder while the digits are drawn
const D2R = Math.PI / 180;

// ---------------------------------------------------------------- the numerals
// Ball-terminal circus numerals, designed in a 16 x 24 cell (u right, v down).
// Every stroke end that is free carries a pompom ball, like the bobbles on a
// jester's collar; that is what makes them the jack's own type.
const SR = 2.1;                       // stroke half width (5 px strokes)
const BR = 3.0;                       // pompom ball radius
const S = (ax, ay, bx, by, r = SR) => ({ k: 0, ax, ay, bx, by, r });
const A = (cx, cy, R, a0, a1, r = SR) => ({ k: 1, cx, cy, R, a0: a0 * D2R, a1: a1 * D2R, r });
const E = (cx, cy, rx, ry, r = SR) => ({ k: 2, cx, cy, rx, ry, r });
const B = (cx, cy, r = BR) => ({ k: 3, cx, cy, r });
const P = (cx, cy, R, a) => [cx + R * Math.cos(a * D2R), cy + R * Math.sin(a * D2R)];

function ballAt(cx, cy, R, a, r = BR) { const [x, y] = P(cx, cy, R, a); return B(x, y, r); }

export const GLYPHS = [
  /* 0 */ [E(8, 12, 5.6, 9.5)],
  /* 1 */ [S(9.5, 2.6, 9.5, 21.4), S(9.5, 2.6, 5, 6.4), B(4.6, 6.8), S(5, 21.4, 14, 21.4)],
  /* 2 */ [A(8, 7.6, 5.2, 170, 380), S(...P(8, 7.6, 5.2, 20), 2.6, 21.4), S(2.6, 21.4, 13.6, 21.4), ballAt(8, 7.6, 5.2, 165)],
  /* 3 */ [A(7.6, 6.9, 4.7, 190, 450), A(7.6, 16.2, 5.4, 270, 520), ballAt(7.6, 6.9, 4.7, 190), ballAt(7.6, 16.2, 5.4, 160)],
  /* 4 */ [S(11.6, 2.6, 2.2, 15.6), S(2.2, 15.6, 14.4, 15.6), S(11.6, 5, 11.6, 21.4), B(14.2, 15.6, 2.7)],
  /* 5 */ [S(4.6, 2.6, 12.6, 2.6), B(13, 3), S(4.6, 2.6, 4, 10.6), A(7.8, 15.4, 5.7, 222, 500), ballAt(7.8, 15.4, 5.7, 145)],
  /* 6 */ [E(8, 16.2, 5.6, 5.4), A(16.2, 16.2, 13.6, 180, 236), ballAt(16.2, 16.2, 13.6, 240, 2.8)],
  /* 7 */ [S(3, 2.6, 13.6, 2.6), B(2.8, 2.8), S(13.6, 2.6, 6.4, 21.4)],
  /* 8 */ [E(8, 6.6, 4.9, 4.5), E(8, 16.6, 5.9, 5.2)],
  /* 9 */ null,            // a 6 turned over
];
export const GW = 16, GH = 24;

function primDist(p, u, v) {
  switch (p.k) {
    case 0: {
      const dx = p.bx - p.ax, dy = p.by - p.ay;
      const L = dx * dx + dy * dy;
      let t = L ? ((u - p.ax) * dx + (v - p.ay) * dy) / L : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      return Math.hypot(u - p.ax - t * dx, v - p.ay - t * dy) - p.r;
    }
    case 1: {
      const x = u - p.cx, y = v - p.cy;
      let a = Math.atan2(y, x);
      while (a < p.a0) a += 2 * Math.PI;
      while (a > p.a0 + 2 * Math.PI) a -= 2 * Math.PI;
      if (a <= p.a1) return Math.abs(Math.hypot(x, y) - p.R) - p.r;
      const d0 = Math.hypot(x - p.R * Math.cos(p.a0), y - p.R * Math.sin(p.a0));
      const d1 = Math.hypot(x - p.R * Math.cos(p.a1), y - p.R * Math.sin(p.a1));
      return Math.min(d0, d1) - p.r;
    }
    case 2: {
      const x = (u - p.cx) / p.rx, y = (v - p.cy) / p.ry;
      const k = Math.hypot(x, y) || 1e-6;
      const gx = x / p.rx, gy = y / p.ry;
      const gl = Math.hypot(gx, gy) / k || 1e-6;
      return Math.abs((k - 1) / gl) - p.r;
    }
    default: return Math.hypot(u - p.cx, v - p.cy) - p.r;
  }
}

function exactDist(d, u, v) {
  if (d === 9) { d = 6; u = GW - u; v = GH - v; }
  const g = GLYPHS[d];
  let m = 1e9;
  for (let i = 0; i < g.length; i++) { const q = primDist(g[i], u, v); if (q < m) m = q; }
  return m;
}

// each digit's distance field, sampled every quarter pixel on first use
const FQ = 4, FM = 5, FW = (GW + 2 * FM) * FQ, FH = (GH + 2 * FM) * FQ;
const FIELDS = [];
function field(d) {
  if (FIELDS[d]) return FIELDS[d];
  const a = new Float32Array(FW * FH);
  for (let j = 0; j < FH; j++)
    for (let i = 0; i < FW; i++) a[j * FW + i] = exactDist(d, (i + 0.5) / FQ - FM, (j + 0.5) / FQ - FM);
  return (FIELDS[d] = a);
}
for (let d = 0; d < 10; d++) field(d);

/** Signed distance (px, cell units) from (u, v) to digit d's ink. */
export function glyphDist(d, u, v) {
  const i = Math.floor((u + FM) * FQ), j = Math.floor((v + FM) * FQ);
  if (i < 0 || j < 0 || i >= FW || j >= FH) return 9;
  return field(d)[j * FW + i];
}

// ================================================================ the scene
import { orbit, clamp, sprite } from '../js/kit.js';

const W = 128, H = 64, TAU = Math.PI * 2;
const PHI = 30 * D2R, EL = 20 * D2R, K = 33, DCAM = 7, YS = 0.82;
const BOX_X = 26, BOX_Y = 54;               // screen point under the box's centre
const REST = [92, 36];                      // where the jack's neck rests
const HEAD_TOP = 29, HS = 1.12;                        // local height of the numerals' top above the neck
const smooth = (t) => t * t * (3 - 2 * t);
const prog = (v, a, b) => clamp((v - a) / (b - a), 0, 1);

function hash(i, s = 0) {
  let h = (i * 374761393 + s * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------- projection
function makeCam(yaw, dx, dy) {
  const c = Math.cos(PHI + yaw), s = Math.sin(PHI + yaw), ce = Math.cos(EL), se = Math.sin(EL);
  return {
    p(x, y, z) {
      y *= YS;
      const x1 = x * c - z * s, z1 = x * s + z * c;
      const y2 = y * ce - z1 * se, z2 = z1 * ce + y * se;
      const f = DCAM / (DCAM - z2);
      return [BOX_X + dx + K * x1 * f, BOX_Y + dy - K * y2 * f, z2];
    },
    facing(nx, ny, nz) { const z1 = nx * s + nz * c; return z1 * ce + ny * se; },
  };
}

// unit square -> quad homography, and its inverse
function quadMap(q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / den, h = (dx1 * dy3 - dx3 * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0;
  const d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;
  // inverse of [[a b c][d e f][g h 1]]
  const A = e - f * h, B = c * h - b, C = b * f - c * e;
  const D = f * g - d, E = a - c * g, F = c * d - a * f;
  const G = d * h - e * g, Hh = b * g - a * h, I = a * e - b * d;
  const out = [0, 0];
  return (x, y) => { const w = G * x + Hh * y + I; out[0] = (A * x + B * y + C) / w; out[1] = (D * x + E * y + F) / w; return out; };
}

// box faces: corners TL TR BR BL (u right, w down on the face), outward normal
const FACES = [
  { c: [[-.5, 1, .5], [.5, 1, .5], [.5, 0, .5], [-.5, 0, .5]], n: [0, 0, 1] },     // 0 front
  { c: [[.5, 1, .5], [.5, 1, -.5], [.5, 0, -.5], [.5, 0, .5]], n: [1, 0, 0] },     // 1 right (crank)
  { c: [[.5, 1, -.5], [-.5, 1, -.5], [-.5, 0, -.5], [.5, 0, -.5]], n: [0, 0, -1] }, // 2 back
  { c: [[-.5, 1, -.5], [-.5, 1, .5], [-.5, 0, .5], [-.5, 0, -.5]], n: [-1, 0, 0] }, // 3 left
];

// the hour painted on a face, in face units
function hourInk(hour, u, w) {
  const str = String(hour);
  const cw = 0.4, ch = 0.7, w0 = 0.15;
  const left = str.length === 2 ? 0.5 - 0.02 - cw : 0.5 - cw / 2;
  const cv = (w - w0) / ch * GH;
  if (cv < -4 || cv > GH + 4) return false;
  for (let i = 0; i < str.length; i++) {
    const u0 = left + i * (cw + 0.04);
    const cu = (u - u0) / cw * GW;
    if (cu < -4 || cu > GW + 4) continue;
    if (glyphDist(+str[i], cu, cv) < 0) return true;
  }
  return false;
}

function drawFace(g, cam, face, paint) {
  const q = face.c.map(([x, y, z]) => cam.p(x, y, z));
  const inv = quadMap(q);
  const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(W - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const [u, w] = inv(x + 0.5, y + 0.5);
      if (u < 0 || u > 1 || w < 0 || w > 1) continue;
      g.pixel(x, y, paint && paint(u, w) ? 1 : 0);
    }
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4];
    g.thickLine(a[0], a[1], b[0], b[1], 1.6, 1);
  }
  return q;
}

// ---------------------------------------------------------------- the jack
// Catmull-Rom through the control points, resampled by arc length
function pathOf(ctrl) {
  const pts = [ctrl[0]];
  const P = [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    for (let j = 1; j <= 10; j++) {
      const t = j / 10, t2 = t * t, t3 = t2 * t;
      pts.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, total: cum[cum.length - 1] || 1e-6 };
}

// a coil spring along the path, drawn as a stack of rings like a slinky:
// each ring an ellipse across the path, black inside so the next one up
// overlaps it, with a bold front rim and a thin back rim
function drawSpring(g, path, rings) {
  const { pts: P, cum, total } = path;
  const R = 4.8;
  let j = 1;
  for (let i = 0; i <= rings; i++) {
    const sArc = total * i / rings;
    while (j < P.length - 1 && cum[j] < sArc) j++;
    const a = P[j - 1], b = P[j], seg = cum[j] - cum[j - 1] || 1e-6;
    const q = clamp((sArc - cum[j - 1]) / seg, 0, 1);
    const cx = a[0] + (b[0] - a[0]) * q, cy = a[1] + (b[1] - a[1]) * q;
    let tx = (b[0] - a[0]) / seg, ty = (b[1] - a[1]) / seg;
    if (!isFinite(tx) || (!tx && !ty)) { tx = 0; ty = -1; }
    // rasterise the ring directly: a = across the path, b = along it
    const RB = R * 0.42;
    const x0 = Math.max(0, Math.floor(cx - R - 2)), x1 = Math.min(W - 1, Math.ceil(cx + R + 2));
    const y0 = Math.max(0, Math.floor(cy - R - 2)), y1 = Math.min(H - 1, Math.ceil(cy + R + 2));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const ac = (-dx * ty + dy * tx) / R, al = (dx * tx + dy * ty) / RB;
        const k = Math.hypot(ac, al) || 1e-6;
        const gl = Math.hypot(ac / R, al / RB) / k;
        const d = (k - 1) / gl;                  // ~ pixels from the rim
        if (al >= 0 ? (d > -1.1 && d < 1.1) : (d > -0.55 && d < 0.55)) g.pixel(x, y, 1);
        else if (d <= 0) g.pixel(x, y, 0);
      }
  }
}

// numerals + ruff in head space: lx right, ly up from the neck
function headInk(m, lx, ly) {
  const tens = Math.floor(m / 10), ones = m % 10;
  const cv = HEAD_TOP - ly;
  let d = 1e9;
  if (cv > -4 && cv < GH + 4) d = Math.min(glyphDist(tens, lx + 17, cv), glyphDist(ones, lx - 1, cv));
  if (d < 0) return 1;
  if (d < 1.4) return 0;
  // ruff: a band with a row of round scallops hanging from it
  if (ly > 6 || ly < -6 || lx < -22 || lx > 22) return -1;
  if (Math.abs(lx) < 19 && ly <= 4.4 && ly >= 1.4) return 1;
  for (let i = -2; i <= 2; i++) {
    const q = Math.hypot(lx - i * 7.6, ly - 0.8);
    if (q < 3.2) return 1;
    if (q < 4.3 && ly < 1.4) return 0;
  }
  if (Math.abs(lx) < 20 && ly <= 5.6 && ly >= 0.2) return 0;
  return -1;
}

function drawHead(g, m, neck, ang, sx, sy, bend) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const r = 36 * HS * Math.max(sx, sy, 1);
  const x0 = Math.max(0, Math.floor(neck[0] - r)), x1 = Math.min(W - 1, Math.ceil(neck[0] + r));
  const y0 = Math.max(0, Math.floor(neck[1] - r)), y1 = Math.min(H - 1, Math.ceil(neck[1] + 12));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - neck[0], dy = y + 0.5 - neck[1];
      let lx = dx * c + dy * s, ly = dx * s - dy * c;     // ang > 0 leans it clockwise
      ly /= sy * HS;
      lx = lx / (sx * HS) - bend * (ly / HEAD_TOP) ** 2;
      const v = headInk(m, lx, ly);
      if (v >= 0) g.pixel(x, y, v);
    }
}

// ---------------------------------------------------------------- music notes
const NOTES = [
  sprite(`
    ...##..
    ...###.
    ...#.##
    ...#..#
    ...#...
    ...#...
    ####...
    ####...
    .##....
  `),
  sprite(`
    ...#######
    ...#######
    ...#.....#
    ...#.....#
    ...#.....#
    ####..####
    ####..####
    .##....##.
  `),
]

export default {
  name: 'Jack-in-the-Box',
  blurb: 'A jack-in-the-box: the hour is painted on the box, the minutes are the jack, two pompom numerals on a coil spring that bob to the tune of the crank; each minute the jack ducks in, the lid slams, the box shakes and POP, the new minute shoots out and flops over wobbling; on the hour the box leaps and spins in a burst of confetti.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields;
    ctx.oled.contrast(Math.round(207 + (40 - 207) * ctx.night));
    const [ox, oy] = orbit(ctx.date, 3, 2);
    const sec = f.sec, abs = ctx.date.getTime() / 1000;
    const u = sec - 60;                       // to the coming turn (negative)
    const hourly = f.m === 0;
    const POP = 3.2;
    const popping = sec < POP, ducking = u > -1.25;

    // ---- box: trembles while shut, leaps and spins round on the hour
    let bdx = ox, bdy = oy, yaw = 0, hop = 0;
    if (u > -0.46) bdx += Math.round(Math.sin(u * TAU * 14) * 1.3 * prog(u, -0.46, -0.3));
    if (u > -0.3) bdy += Math.round(Math.sin(u * TAU * 11 + 1) * 0.8);
    if (hourly && sec < 1.1) {
      const k = prog(sec, 0.04, 1.04);
      hop = 9 * 4 * k * (1 - k);
      yaw = -TAU * (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) ** 2);
    } else if (hourly && sec < 1.6) hop = -1.5 * Math.sin((sec - 1.1) / 0.5 * Math.PI);
    const cam = makeCam(yaw, bdx, bdy - hop);
    const hole = cam.p(0, 1, 0);

    // ---- lid: stands open; slams shut before the pop, rattles, flies open
    const OPEN = 138;
    let lid = OPEN;
    if (ducking) {
      const k = prog(u, -0.6, -0.46);
      lid = OPEN * (1 - k * k);
      if (u > -0.46) lid = 7 * Math.abs(Math.sin((u + 0.46) * 9)) * Math.exp(-6 * (u + 0.46)) + 2.5 * Math.abs(Math.sin(u * 47)) * prog(u, -0.4, -0.05);
    } else if (popping) {
      const t = sec;
      lid = OPEN + 40 * Math.exp(-5 * t) * Math.sin(11 * t + 0.0) - OPEN * Math.exp(-30 * t);
    }
    const la = lid * D2R;
    const lidQ = [[-.5, 1, -.5], [.5, 1, -.5], [.5, 1 + Math.sin(la), -.5 + Math.cos(la)], [-.5, 1 + Math.sin(la), -.5 + Math.cos(la)]]
      .map(([x, y, z]) => cam.p(x, y, z));
    const drawLid = () => {
      g.fillPolygon(lidQ.map(([x, y]) => [x, y]), 0);
      for (let i = 0; i < 4; i++) g.thickLine(lidQ[i][0], lidQ[i][1], lidQ[(i + 1) % 4][0], lidQ[(i + 1) % 4][1], 1.6, 1);
    };

    // ---- the jack's pose
    const amp = hourly ? 1.4 : 1;
    const ph = sec % 1;
    const inside = [hole[0], hole[1] + 40];
    const apex = [hole[0] + 3, hole[1] + 13];
    const rest = [REST[0] + ox, REST[1] + oy - 1.6 * Math.cos(ph * TAU)];
    let neck, w = 1, ang = 0.07 + 0.05 * Math.sin(abs * TAU / 3.7) + 0.04 * Math.sin(ph * TAU + 1.2);
    let sy = 1 - 0.07 * Math.cos(ph * TAU), sx = 1, bend = 2 * Math.sin(ph * TAU - 0.9);
    const swingTo = (k) => {                       // apex -> rest along an arc
      const kk = clamp(k, -0.2, 1.12);
      return [apex[0] + (rest[0] - apex[0]) * kk, apex[1] + (rest[1] - apex[1]) * kk - (hourly ? 7 : 4) * Math.sin(Math.PI * clamp(kk, 0, 1))];
    };
    if (popping) {
      const t = sec;
      if (t < 0.16) {                              // shoots straight up, stretched thin
        const k = t / 0.16, e = 1 - (1 - k) * (1 - k);
        neck = [inside[0] + (apex[0] - inside[0]) * e, inside[1] + (apex[1] - inside[1]) * e];
        w = 0; ang = 0; sx = 0.78; sy = 1.32 - 0.12 * k; bend = 0;
      } else {                                     // flops over to the right and settles
        const tt = t - 0.16, calm = prog(t, 0.6, POP);
        w = 1 - Math.exp(-4.6 * tt) * Math.cos(8.5 * tt) * amp;
        neck = swingTo(w);
        if (calm > 0) { neck[0] += (rest[0] - neck[0]) * calm * calm; neck[1] += (rest[1] - neck[1]) * calm * calm; }
        const dw = Math.exp(-4.6 * tt) * (4.6 * Math.cos(8.5 * tt) + 8.5 * Math.sin(8.5 * tt)) * amp;
        ang = ang * calm + (-0.05 * dw + 0.45 * amp * Math.exp(-2 * tt) * Math.sin(TAU * 1.7 * tt)) * (1 - calm);
        const sq = 0.2 * amp * Math.exp(-3.2 * tt) * Math.cos(11 * tt);
        sy = sy * calm + (1.2 - 0.2 * Math.min(1, tt * 8) + sq) * (1 - calm);
        sx = 1 / Math.sqrt(sy);
        bend = bend * calm + 11 * amp * Math.exp(-2.4 * tt) * Math.sin(TAU * 1.7 * tt - 0.9) * (1 - calm);
      }
    } else if (ducking) {
      if (u < -0.85) {                             // swings back up over the box
        const k = prog(u, -1.25, -0.85), e = k * k * (3 - 2 * k);
        w = 1 - e;
        neck = swingTo(w);
        ang = ang * (1 - e) - 0.22 * Math.sin(Math.PI * k);     // dragged, leaning back
        bend = bend * (1 - e) + 6 * Math.sin(Math.PI * k);
        sy = 1 - 0.16 * e; sx = 1 - 0.18 * e;
      } else {                                     // and is stuffed down into it
        const k = prog(u, -0.85, -0.6), e = k * k;
        w = 0;
        neck = [apex[0] + (inside[0] - apex[0]) * e, apex[1] + (inside[1] - apex[1]) * e];
        ang = 0; bend = 0;
        sx = 0.82 - 0.14 * Math.min(1, k * 2.5);              // squeezed through the hole
        sy = 0.84 - 0.1 * Math.min(1, k * 2.5);
      }
    } else neck = rest;

    // the spring: out of the hole, draped over the box's far corner, sagging
    // between box and jack, and up into the neck along the head's axis
    const up = [Math.sin(ang), -Math.cos(ang)];
    const ww = clamp(w, 0, 1);
    const base = [hole[0], hole[1] + 12];
    const straight = (t) => [base[0] + (neck[0] - base[0]) * t, base[1] + (neck[1] - base[1]) * t];
    // a smooth arch: up out of the hole, over, and down into the neck; it
    // straightens out when the jack shoots up
    const top = Math.min(hole[1], neck[1]) - 12 * ww;
    const c1 = [hole[0] + 6 * ww, top - 6 * ww], c2 = [neck[0] - up[0] * 22 * ww - 6 * ww, neck[1] - up[1] * 22 * ww];
    const ctrl = [base, [hole[0], hole[1] - 3]];
    for (let i = 1; i <= 10; i++) {
      const t = i / 10, r = 1 - t;
      ctrl.push([r * r * r * hole[0] + 3 * r * r * t * c1[0] + 3 * r * t * t * c2[0] + t * t * t * neck[0],
        r * r * r * (hole[1] - 3) + 3 * r * r * t * c1[1] + 3 * r * t * t * c2[1] + t * t * t * neck[1]]);
    }

    // ---- draw, back to front
    if (lid > 90) drawLid();
    const topQ = [[-.5, 1, -.5], [.5, 1, -.5], [.5, 1, .5], [-.5, 1, .5]].map(([x, y, z]) => cam.p(x, y, z));
    g.fillPolygon(topQ.map(([x, y]) => [x, y]), 0);
    const path = pathOf(ctrl);
    if (neck[1] < inside[1] - 2) drawSpring(g, path, Math.max(4, Math.round(path.total / 3.7)));
    const headLate = neck[1] < hole[1] - 8 || neck[0] > hole[0] + 24;
    if (!headLate && neck[1] < inside[1] - 2) drawHead(g, f.m, neck, ang, sx, sy, bend);

    const vis = FACES.map((fc, i) => ({ fc, i, z: cam.facing(...fc.n) })).filter((o) => o.z > 0.02).sort((a, b) => a.z - b.z);
    let crankOn = false;
    for (const { fc, i } of vis) {
      let paint = null;
      // mid-spin every side carries the hour, so it never leaves the glass
      if (i === 0 || (hourly && sec < 1.1)) paint = (a, b) => hourInk(f.h, a, b);
      drawFace(g, cam, fc, paint);
      if (i === 1) crankOn = true;
    }
    for (let i = 0; i < 4; i++) g.thickLine(topQ[i][0], topQ[i][1], topQ[(i + 1) % 4][0], topQ[(i + 1) % 4][1], 1.6, 1);
    if (headLate) drawHead(g, f.m, neck, ang, sx, sy, bend);
    if (lid <= 90) drawLid();

    // ---- crank: a turn every two seconds, whirring up as the tune runs out
    let crank = sec / 2;
    if (sec > 58.6) crank += 2.2 * (sec - 58.6) ** 2;
    const ca = crank * TAU;
    if (crankOn) {
      // axle out of the side, an arm turning parallel to it, a fat handle:
      // drawn out over the black beside the box so the turn reads
      const hub = cam.p(.5, .32, 0), sh = cam.p(.92, .32, 0);
      const arm = [0.92, 0.32 + 0.24 * Math.cos(ca), 0.24 * Math.sin(ca)];
      const pa = cam.p(...arm), pk = cam.p(arm[0] + 0.24, arm[1], arm[2]);
      const bar = (a, b, w) => { g.thickLine(a[0], a[1], b[0], b[1], w + 2, 0); g.thickLine(a[0], a[1], b[0], b[1], w, 1); };
      g.fillCircle(hub[0], hub[1], 2.6, 0); g.fillCircle(hub[0], hub[1], 1.8, 1);
      bar(hub, sh, 2);
      bar(sh, pa, 2.4);
      bar(pa, pk, 3.4);
      g.fillCircle(pk[0], pk[1], 3.4, 0); g.fillCircle(pk[0], pk[1], 2.4, 1);
    }

    // ---- the tune: a note a second floats up out of the box
    const now = Math.floor(abs);
    for (let te = now - 3; te <= now; te++) {
      const a = abs - te;
      const sAt = ((te % 60) + 60) % 60;
      if (a < 0.05 || sAt >= 58 || sAt < 1) continue;
      const x = hole[0] - 14 - a * 3 + 2.5 * Math.sin(a * 2.6 + te * 1.3), y = hole[1] - 14 - a * 7;
      if (y < -8) continue;
      const spr = NOTES[Math.floor(hash(te, 3) * NOTES.length)];
      g.fillRect(Math.round(x) - 1, Math.round(y) - 1, spr.w + 2, spr.h + 2, 0);
      g.blit(spr, x, y);
    }

    // ---- the hour: confetti out of the box
    if (hourly && sec < 3.5) {
      for (let i = 0; i < 12; i++) {
        const t = sec - 0.02 - hash(i, 9) * 0.12;
        if (t <= 0) continue;
        const a = (hash(i, 1) - 0.5) * 2.4, sp = 45 + 55 * hash(i, 2);
        const x = 26 + ox + Math.sin(a) * sp * t * Math.exp(-0.6 * t) + 4 * Math.sin(t * 5 + i);
        const y = 22 + oy - Math.cos(a) * sp * t + 34 * t * t;
        if (y > H + 2 || x < -3 || x > W + 3) continue;
        const spin = Math.floor((t * (6 + 6 * hash(i, 4)) + i) % 3);
        const [cw, chh] = spin === 0 ? [5, 2] : spin === 1 ? [3, 3] : [2, 5];
        g.fillRect(Math.round(x) - 1, Math.round(y) - 1, cw + 2, chh + 2, 0);
        g.fillRect(Math.round(x), Math.round(y), cw, chh, 1);
      }
    }
  },
};
