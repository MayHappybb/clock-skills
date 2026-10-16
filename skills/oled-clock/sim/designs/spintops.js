// Tippe Tops — the time painted on two tippe tops spinning on a turned tray.
//
// A tippe top is a ball with a flat cut and a short stem. Spun ball-down, it
// turns itself upside down and spins on its stem: physics' best party trick.
// Here each top carries its number on the pole of the ball, so the number is
// underneath (hidden) until the top flips itself over and shows it.
//
// The life of a top is the unit it shows. The minute top is dropped on its
// string at :59.3, lands ball-down, and at :00 flips over to show the new
// minute. Over the minute its spin decays: its painted gores, a grey blur at
// first, come out as stripes, its wobble widens and its precession speeds up
// (the rate goes as 1/spin), until at :57 it staggers, tips onto its rim
// with its face turned to you, and rolls away. The hour top lives the hour
// the same way, its stripes coming out over the last half hour.
//
// Rendering: real 3D. Each top is a truncated sphere plus a stem, under an
// orthographic camera 52 degrees above the tray. The ball is ray-cast per
// pixel (front hit, normal, its colatitude from the pole and longitude in the
// spinning frame), the flat face is found by continuing the ray to the cut
// plane, the stem is drawn before or after the ball by which way it faces.
// The numerals are a decal along the pole axis, kept upright to the viewer
// (the cap rides on a bearing). The height of the ball above the tray comes
// from the lowest of its support points (ball, rim, stem tip), so tipping,
// flipping and falling all rest on the tray.

import { dither, clamp, lerp, ease, progress, clockFields, orbit } from '../js/kit.js';

const TAU = Math.PI * 2;
const W = 128, H = 64;

// ------------------------------------------------------------ camera
const E = 0.9, SE = Math.sin(E), CE = Math.cos(E);
const Y0 = 57;
const TV = [0, -CE, SE];             // towards the camera
const UV = [0, SE, CE];              // screen up
const project = (x, y, z) => [64 + x, Y0 - (y * SE + z * CE)];

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const axisOf = (th, ps) => [Math.sin(th) * Math.cos(ps), Math.sin(th) * Math.sin(ps), Math.cos(th)];

// ------------------------------------------------------------ numerals
// A round, chunky toy-paint hand, drawn as thick strokes in a 10 x 16 box.
const arc = (cx, cy, rx, ry, a0, a1, n = 18) => {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return p;
};
const GLYPHS = {
  0: [arc(5, 8, 3.3, 6.3, 0, 360, 36)],
  1: [[[2.6, 4.4], [5.6, 1.7], [5.6, 14.3]], [[2.6, 14.3], [8.4, 14.3]]],
  2: [[...arc(5, 5, 3.3, 3.3, 195, 380), [1.7, 14.3], [8.5, 14.3]]],
  3: [arc(5, 4.6, 3.1, 2.9, 200, 450), arc(5, 11, 3.4, 3.3, 270, 520)],
  4: [[[6.8, 14.3], [6.8, 1.7], [1.5, 10.6], [8.6, 10.6]]],
  5: [[[8.2, 1.7], [2.7, 1.7], [2.3, 7.4], ...arc(5, 10.4, 3.4, 3.9, 232, 520)]],
  6: [arc(5, 10.6, 3.3, 3.7, 0, 360, 30), arc(8.6, 10.6, 6.9, 8.9, 180, 250)],
  7: [[[1.7, 1.7], [8.4, 1.7], [4.4, 14.3]]],
  8: [arc(5, 4.6, 2.9, 2.9, 0, 360, 26), arc(5, 11, 3.4, 3.3, 0, 360, 28)],
};
GLYPHS[9] = GLYPHS[6].map((s) => s.map(([x, y]) => [10 - x, 16 - y]));
const SW = 3.3;                       // stroke width, in box units
const MS = 4;                         // mask samples per unit
const MW = 10 * MS, MH = 16 * MS;
function segD2(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const u = clamp(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1), 0, 1);
  const dx = px - ax - u * vx, dy = py - ay - u * vy;
  return dx * dx + dy * dy;
}
const MASK = [];
for (let d = 0; d < 10; d++) {
  const m = new Uint8Array(MW * MH);
  for (let j = 0; j < MH; j++)
    for (let i = 0; i < MW; i++) {
      const x = (i + 0.5) / MS, y = (j + 0.5) / MS;
      let best = 1e9;
      for (const s of GLYPHS[d]) for (let k = 1; k < s.length; k++) best = Math.min(best, segD2(x, y, s[k - 1][0], s[k - 1][1], s[k][0], s[k][1]));
      m[j * MW + i] = best <= (SW / 2) ** 2 ? 1 : 0;
    }
  MASK.push(m);
}
/** Is (gx, gy) in box units of a two-digit string inside a stroke? Box 21 x 16. */
function inText(text, gx, gy) {
  if (gy < 0 || gy >= 16) return false;
  let d, x;
  if (gx >= 0 && gx < 10) { d = text.charCodeAt(0) - 48; x = gx; }
  else if (gx >= 11 && gx < 21) { d = text.charCodeAt(1) - 48; x = gx - 11; }
  else return false;
  return MASK[d][((gy * MS) | 0) * MW + ((x * MS) | 0)] === 1;
}

// ------------------------------------------------------------ the top's body
const CAP = Math.cos((68 * Math.PI) / 180);    // medallion edge (colatitude from the pole)
const BAND = Math.cos((78 * Math.PI) / 180);   // white band below it
const KU = 17, KV = 14.2;                       // text box units per ball radius, across and up
const LIGHT = norm([-0.5, 0.25, 0.9]);
const HALF = norm([LIGHT[0] + TV[0], LIGHT[1] + TV[1], LIGHT[2] + TV[2]]);

function makeTop(R) {
  const c = 0.5 * R, Ls = 0.62 * R;
  return { R, c, Ls, rho: Math.sqrt(R * R - c * c), stemW: Math.max(3, 0.24 * R) };
}

/** Height of the ball's centre above the tray and its horizontal offset from the contact (soft-min of the supports). */
function support(top, a) {
  const { R, c, Ls, rho } = top;
  const cand = [];
  if (a[2] <= c / R) cand.push([0, 0, -R]);
  cand.push([-(c + Ls) * a[0], -(c + Ls) * a[1], -(c + Ls) * a[2]]);
  const w = [-a[2] * a[0], -a[2] * a[1], -1 + a[2] * a[2]];     // -z made perpendicular to a
  const wl = Math.hypot(w[0], w[1], w[2]);
  if (wl > 1e-3) cand.push([-c * a[0] + (rho * w[0]) / wl, -c * a[1] + (rho * w[1]) / wl, -c * a[2] + (rho * w[2]) / wl]);
  let zmin = Infinity;
  for (const v of cand) zmin = Math.min(zmin, v[2]);
  let sw = 0, sx = 0, sy = 0;
  for (const v of cand) { const k = Math.exp(-(v[2] - zmin) / 1.2); sw += k; sx += k * v[0]; sy += k * v[1]; }
  return [-sx / sw, -sy / sw, -zmin];
}

function drawStem(g, S0, S1, wd) {
  g.thickLine(S0[0], S0[1], S1[0], S1[1], wd + 2, 0);
  g.fillCircle(S1[0], S1[1], wd / 2 + 1, 0);
  g.thickLine(S0[0], S0[1], S1[0], S1[1], wd, 1);
  g.fillCircle(S1[0], S1[1], wd / 2, 1);
}

/**
 * Draw one top. st: { top, C (world centre), a (pole axis), spin, blur, drift, text, ox, oy }
 */
function drawTop(g, st) {
  const { top, C, a, spin, blur, drift, text } = st;
  const { R, c, Ls, rho } = top;
  const [cx0, cy0] = project(C[0], C[1], C[2]);
  const cx = cx0 + st.ox, cy = cy0 + st.oy;
  const Ta = dot(TV, a);
  // stem, in screen space
  const S0w = [C[0] - c * a[0], C[1] - c * a[1], C[2] - c * a[2]];
  const S1w = [C[0] - (c + Ls) * a[0], C[1] - (c + Ls) * a[1], C[2] - (c + Ls) * a[2]];
  const S0 = project(...S0w), S1 = project(...S1w);
  S0[0] += st.ox; S0[1] += st.oy; S1[0] += st.ox; S1[1] += st.oy;
  const stemFront = Ta < 0;
  if (!stemFront) drawStem(g, S0, S1, top.stemW);

  // decal frame, upright to the viewer, plus the bearing's drift
  let e1 = [1 - a[0] * a[0], -a[0] * a[1], -a[0] * a[2]];
  if (Math.hypot(...e1) < 0.05) e1 = [UV[0] - Ta * 0, UV[1], UV[2]];
  e1 = norm(e1);
  let e2 = cross(a, e1);
  const cd = Math.cos(drift), sd = Math.sin(drift);
  const d1 = [cd * e1[0] + sd * e2[0], cd * e1[1] + sd * e2[1], cd * e1[2] + sd * e2[2]];
  const d2 = [-sd * e1[0] + cd * e2[0], -sd * e1[1] + cd * e2[1], -sd * e1[2] + cd * e2[2]];
  const cs = Math.cos(spin), ss = Math.sin(spin);
  const g1 = [cs * e1[0] + ss * e2[0], cs * e1[1] + ss * e2[1], cs * e1[2] + ss * e2[2]];
  const g2 = [-ss * e1[0] + cs * e2[0], -ss * e1[1] + cs * e2[1], -ss * e1[2] + cs * e2[2]];

  const cR = c / R, R2 = R * R, edge2 = (R - 1.3) ** 2, lip = -cR + 1.4 / R;
  const x0 = Math.max(0, Math.floor(cx - R - 1)), x1 = Math.min(g.width, Math.ceil(cx + R + 1));
  const y0 = Math.max(0, Math.floor(cy - R - 1)), y1 = Math.min(g.height, Math.ceil(cy + R + 1));
  const dox = Math.round(cx), doy = Math.round(cy);
  for (let y = y0; y < y1; y++) {
    const dyu = cy - (y + 0.5);
    for (let x = x0; x < x1; x++) {
      const dx = x + 0.5 - cx;
      const r2 = dx * dx + dyu * dyu;
      const q = R2 - r2;
      if (q < 0) continue;
      const t = Math.sqrt(q);
      const px = dx, py = dyu * SE - t * CE, pz = dyu * CE + t * SE;
      const na = (px * a[0] + py * a[1] + pz * a[2]) / R;
      let on;
      if (na < -cR) {
        if (Ta > -0.03) continue;                 // looking into the cut from behind: nothing there
        const s = (R * na + c) / Ta;
        const fx = px - s * TV[0] + c * a[0], fy = py - s * TV[1] + c * a[1], fz = pz - s * TV[2] + c * a[2];
        const f2 = fx * fx + fy * fy + fz * fz;
        if (f2 > rho * rho + 2) continue;
        on = f2 > (rho - 1.4) ** 2 || (f2 > (0.55 * rho) ** 2 && f2 < (0.55 * rho + 1.2) ** 2);
      } else if (r2 > edge2 || na < lip) {
        on = true;
      } else {
        const nx = px / R, ny = py / R, nz = pz / R;
        if (na > CAP) {
          const u = nx * d1[0] + ny * d1[1] + nz * d1[2];
          const v = nx * d2[0] + ny * d2[1] + nz * d2[2];
          on = inText(text, u * KU + 10.5, 8 - v * KV);
        } else if (na > BAND) {
          on = true;
        } else {
          const lam = Math.atan2(nx * g2[0] + ny * g2[1] + nz * g2[2], nx * g1[0] + ny * g1[1] + nz * g1[2]);
          const crisp = Math.cos(lam * 6) > 0 ? 1 : 0;
          on = dither(x - dox, y - doy, blur * 0.5 + (1 - blur) * crisp);
          if (nx * HALF[0] + ny * HALF[1] + nz * HALF[2] > 0.97) on = !on;
        }
      }
      g.pixel(x, y, on ? 1 : 0);
    }
  }
  if (stemFront) drawStem(g, S0, S1, top.stemW);
}

// ------------------------------------------------------------ choreography
const MIN = { top: makeTop(18.5), home: [24, -7], wander: 3, r0: 0.8, th0: 0.07, th1: 0.3, side: 1 };
const HOUR = { top: makeTop(15.5), home: [-31, 17], wander: 3.5, r0: 0.35, th0: 0.05, th1: 0.24, side: -1 };
const U_LAND = 0.55, U_FLIP0 = 0.8, U_FLIP1 = 2.0;

/** The state of a top `u` seconds after it was dropped, for a life of `Lf` seconds. Null once gone. */
function topState(kind, u, Lf, text) {
  const { top, home, side } = kind;
  const Ld = Lf - 2.5, F1 = Lf - 0.8, OUT = Lf + 1.6;
  if (u < 0 || u > OUT) return null;
  const p = clamp(u / Ld, 0, 1);
  // precession: rate r0 / (1 - 0.9 p), integrated
  const psRaw = (uu) => (-kind.r0 * Ld / 0.9) * Math.log(1 - 0.9 * clamp(uu / Ld, 0, 1));
  const rEnd = kind.r0 / 0.1;
  const psAt = (uu) => {
    if (uu <= Ld) return psRaw(uu);
    const k = Math.min(uu, F1) - Ld;
    return psRaw(Ld) + rEnd * k * (1 - k / (2 * (F1 - Ld)));
  };
  const psT = -Math.PI / 2 + 0.45 * side;                     // fall towards the viewer, outwards
  const psOff = psT - psAt(F1);
  let ps = psOff + psAt(u);
  const thLife = (uu) => {
    const pp = clamp(uu / Ld, 0, 1);
    return kind.th0 + kind.th1 * pp ** 3 + (0.015 + 0.06 * pp * pp) * Math.sin(uu * 15);
  };
  const thRest = Math.acos(top.c / top.R) - 0.02;
  let th, cz = 0, wob = 0;
  let cxy = [home[0] + kind.wander * Math.sin(u * 0.23 + side), home[1] + kind.wander * 0.6 * Math.sin(u * 0.17 + 2)];
  let str = null;
  if (u < U_LAND) {
    const k = u / U_LAND;
    th = Math.PI - 0.25 + 0.1 * Math.sin(u * 20);
    cz = 52 * (1 - k * k);
    cxy = [home[0] + 10 * side * (1 - k), home[1] + 3];
    str = { k: 0 };
  } else if (u < U_FLIP0) {
    const k = (u - U_LAND) / (U_FLIP0 - U_LAND);
    th = Math.PI - 0.12 * (1 - k);
    cz = 3 * Math.sin(Math.PI * k);
    cxy = [home[0], home[1] + 3 * (1 - k)];
    str = { k };
  } else if (u < U_FLIP1) {
    const k = ease.inOutQuad((u - U_FLIP0) / (U_FLIP1 - U_FLIP0));
    th = lerp(Math.PI - 0.02, thLife(u) - 0.1 * Math.sin(Math.PI * k), k);
    ps += 4 * (1 - k);                                         // the flip whirls round as it rises
    const k0 = (u - U_FLIP0) / (U_FLIP1 - U_FLIP0);
    cxy = [lerp(home[0], cxy[0], k0), lerp(home[1], cxy[1], k0)];
  } else if (u < Ld) {
    th = thLife(u);
  } else if (u < F1) {
    const k = (u - Ld) / (F1 - Ld);
    th = lerp(thLife(Ld), thRest, k ** 2.4);
  } else {
    const k = u - F1;
    th = thRest + 0.14 * Math.exp(-5 * k) * Math.sin(k * 16);
    const kr = progress(u, F1 + 0.15, OUT);
    const roll = ease.inQuad(kr);
    cxy = [cxy[0] + side * 95 * roll, cxy[1] - 6 * roll];
    ps += side * 2.4 * roll;
    wob = roll;
  }
  const a = axisOf(th, ps);
  const sup = support(top, a);
  const C = [cxy[0] + sup[0], cxy[1] + sup[1], sup[2] + cz];
  // spin of the painted gores: fast and blurred, slowing to visible stripes
  const blur = u < F1 ? 1 - progress(u / Lf, 0.55, 0.93) : 0;
  const spin = (u < F1 ? 1 : 1) * (TAU * (2.6 * u - (1.9 * u * u) / (2 * Lf))) + wob * 9;
  const drift = 0.1 * Math.sin(u * 0.6 + side) * (u < Ld ? 1 : 0);
  return { top, C, a, spin, blur, drift, text, str, side };
}

function drawString(g, st, ox, oy) {
  // the launching string: from the stem up out of the glass; on landing it whips away
  const { top, C, a } = st;
  const tipW = [C[0] - (top.c + top.Ls) * a[0], C[1] - (top.c + top.Ls) * a[1], C[2] - (top.c + top.Ls) * a[2]];
  const [tx, ty] = project(...tipW);
  const ax = tx + 26 * st.side + ox, ay = -3;
  const k = ease.inQuad(st.str.k);
  const bx = lerp(tx + ox, ax, k), by = lerp(ty + oy, ay, k);
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const s = i / 10;
    const wave = (3 + 6 * k) * Math.sin(Math.PI * s) * Math.sin(s * 9 - k * 14);
    const x = lerp(bx, ax, s), y = lerp(by, ay, s);
    pts.push([x + wave * 0.7, y + wave * 0.4]);
  }
  g.stroke(pts, 1.6, 1);
}

// ------------------------------------------------------------ the tray
function drawTray(g, ox, oy, shadows) {
  for (const r of [46, 60, 76]) {
    let prev = null;
    for (let i = 0; i <= 96; i++) {
      const an = (i / 96) * TAU;
      const p = project(r * 1.15 * Math.cos(an), 6 + r * Math.sin(an), 0);
      p[0] += ox; p[1] += oy;
      if (prev) g.line(Math.round(prev[0]), Math.round(prev[1]), Math.round(p[0]), Math.round(p[1]), 1);
      prev = p;
    }
  }
  // shadows: the grooves vanish under each top, cast down and to the right
  for (const s of shadows) {
    const gx = s.C[0] + s.C[2] * 0.45, gy = s.C[1] - s.C[2] * 0.25;
    const [sx, sy] = project(gx, gy, 0);
    g.fillEllipse(sx + ox, sy + oy, s.top.R * 1.05, s.top.R * 0.62, 0);
  }
}

// ------------------------------------------------------------ the face
function scene(g, ms) {
  const T = ms / 1000;
  const Mst = Math.floor(T / 60) * 60;
  const Hst = Math.floor(T / 3600) * 3600;
  const [ox, oy] = orbit(new Date(ms), 2, 4);
  const tops = [];
  const mmOf = (s) => clockFields(new Date(s * 1000)).mm;
  const hhOf = (s) => clockFields(new Date(s * 1000)).hh;
  for (const M of [Mst - 60, Mst, Mst + 60]) {
    const st = topState(MIN, T - (M - 0.7), 60, mmOf(M));
    if (st) tops.push(st);
  }
  for (const Hs of [Hst - 3600, Hst, Hst + 3600]) {
    const st = topState(HOUR, T - (Hs - 0.7), 3600, hhOf(Hs));
    if (st) tops.push(st);
  }
  drawTray(g, ox, oy, tops);
  tops.sort((p, q) => (q.C[1] * CE - q.C[2] * SE) - (p.C[1] * CE - p.C[2] * SE));
  for (const st of tops) {
    st.ox = ox; st.oy = oy;
    drawTop(g, st);
    if (st.str) drawString(g, st, ox, oy);
  }
}

/** Specimen of the numerals, for review: flat masks at 1x, then on still tops. */
export function specimen(g, t = 0) {
  for (let d = 0; d < 10; d++) {
    const m = MASK[d];
    for (let j = 0; j < 16; j++) for (let i = 0; i < 10; i++)
      if (m[(j * MS + 2) * MW + i * MS + 2]) g.pixel(4 + d * 16 + i, 4 + j, 1);
  }
  const top = makeTop(18.5);
  ['01', '23', '45', '67', '89'].forEach((text, i) => {
    const a = axisOf(0.1, -1.4 + t);
    drawTop(g, { top, C: [0, 0, 0], a, spin: t * 3, blur: 1, drift: 0, text, ox: -64 + 20 + (i % 3) * 42 + (i > 2 ? 21 : 0), oy: -Y0 + (i > 2 ? 98 : 50) });
  });
}

export default {
  name: 'Tippe Tops',
  blurb: 'Two tippe tops on a turned tray carry the time on their balls: each lives as long as its number, wobbling wider as it slows, falls on its side and rolls away, and the next is dropped ball-down and flips itself over to show the new number.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  frame(g, ctx) {
    scene(g, ctx.date.getTime());
    ctx.oled.contrast(Math.round(207 + (40 - 207) * ctx.night));
  },
};
