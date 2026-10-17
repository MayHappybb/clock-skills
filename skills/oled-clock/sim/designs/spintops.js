// Tippe Tops — the time painted on two tippe tops spinning on a turned tray.
//
// A tippe top is a ball with a flat cut and a short stem. Spun ball-down, it
// turns itself upside down and spins on its stem: physics' best party trick.
// Here each top carries its number on the pole of the ball, so the number is
// underneath (hidden) until the top flips itself over and shows it.
//
// The life of a top is the unit it shows. Over the minute the minute top's
// spin decays: its painted gores, a grey blur at first, come out as stripes,
// its wobble widens and its precession speeds up (the rate goes as 1/spin),
// until at :58 it staggers, tips onto its rim with its face turned to you,
// and rolls off the tray just before :00. The next is dropped on its string
// ball-down (number underneath) and flips over at :00 to show the new
// minute. The hour top lives the hour the same way; at the hour a new one is
// dropped ball-down at :56, skitters across and clacks into the old one three
// times, the old one goes over and rolls away, and the newcomer flips.
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
const E = 0.62, SE = Math.sin(E), CE = Math.cos(E);
const Y0 = 54;
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
  0: [arc(5, 8, 3.4, 6.4, 0, 360, 36)],
  1: [[[2.4, 4.2], [5.6, 1.6], [5.6, 14.4]], [[2.4, 14.4], [8.6, 14.4]]],
  2: [[...arc(5, 5.1, 3.5, 3.5, 190, 375, 22), [1.6, 14.4], [8.6, 14.4]]],
  3: [arc(4.9, 4.6, 3.2, 3.0, 205, 448), arc(4.9, 11, 3.6, 3.4, 272, 515)],
  4: [[[7, 14.4], [7, 1.6], [1.5, 10.6], [8.8, 10.6]]],
  5: [[[8.4, 1.6], [2.6, 1.6], [2.2, 7.4], ...arc(5, 10.4, 3.6, 4, 228, 515)]],
  6: [arc(5, 10.5, 3.5, 3.9, 0, 360, 30), arc(9.2, 10.5, 7.7, 8.9, 180, 252)],
  7: [[[1.6, 1.6], [8.6, 1.6], [4.2, 14.4]]],
  8: [arc(5, 4.4, 3.0, 2.8, 0, 360, 26), arc(5, 10.9, 3.6, 3.5, 0, 360, 28)],
};
GLYPHS[9] = GLYPHS[6].map((s) => s.map(([x, y]) => [10 - x, 16 - y]));
const SW = 2.6;                       // stroke width, in box units
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
const WAIST = 0.1, LT = 1.6, KU = 17.5, KV = 15, PW = 9.6, PH = 6.4, PR = 3.4, GORES = 4;                       // text box units per ball radius, across and up
const LIGHT = norm([-0.5, 0.25, 0.9]);
const HALF = norm([LIGHT[0] + TV[0], LIGHT[1] + TV[1], LIGHT[2] + TV[2]]);

export function makeTop(R) {
  const c = 0.5 * R, Ls = 0.85 * R;
  return { R, c, Ls, rho: Math.sqrt(R * R - c * c), stemW: Math.max(3, 0.28 * R) };
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
export function drawTop(g, st) {
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
  // the label faces half-way between the pole and the viewer
  const L = norm([a[0] + LT * TV[0], a[1] + LT * TV[1], a[2] + LT * TV[2]]);
  let e1 = norm([1 - L[0] * L[0], -L[0] * L[1], -L[0] * L[2]]);
  let e2 = cross(L, e1);
  const sp1 = norm([1 - a[0] * a[0], -a[0] * a[1], -a[0] * a[2]]), sp2 = cross(a, sp1);
  const cd = Math.cos(drift), sd = Math.sin(drift);
  const d1 = [cd * e1[0] + sd * e2[0], cd * e1[1] + sd * e2[1], cd * e1[2] + sd * e2[2]];
  const d2 = [-sd * e1[0] + cd * e2[0], -sd * e1[1] + cd * e2[1], -sd * e1[2] + cd * e2[2]];
  const cs = Math.cos(spin), ss = Math.sin(spin);
  const g1 = [cs * sp1[0] + ss * sp2[0], cs * sp1[1] + ss * sp2[1], cs * sp1[2] + ss * sp2[2]];
  const g2 = [-ss * sp1[0] + cs * sp2[0], -ss * sp1[1] + cs * sp2[1], -ss * sp1[2] + cs * sp2[2]];

  const showText = text !== null && a[2] > 0.25;
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
        const u = nx * d1[0] + ny * d1[1] + nz * d1[2];
        const v = nx * d2[0] + ny * d2[1] + nz * d2[2];
        const gx = u * KU + 10.5, gy = 8 - v * KV;
        const nl = nx * L[0] + ny * L[1] + nz * L[2];
        // the numerals painted on the upper half; a waist of gores below
        if (na > WAIST + 0.12) on = showText && nl > 0.2 && inText(text, gx, gy);
        else if (na > WAIST) on = na < WAIST + 0.07;
        else {
          const lam = Math.atan2(nx * g2[0] + ny * g2[1] + nz * g2[2], nx * g1[0] + ny * g1[1] + nz * g1[2]);
          const crisp = Math.cos(lam * GORES) > 0 ? 1 : 0;
          on = dither(x - dox, y - doy, blur * 0.5 + (1 - blur) * crisp);
        }
        if (!on && nx * HALF[0] + ny * HALF[1] + nz * HALF[2] > 0.985) on = true;
      }
      g.pixel(x, y, on ? 1 : 0);
    }
  }
  if (stemFront) drawStem(g, S0, S1, top.stemW);
}

// ------------------------------------------------------------ choreography
export const MIN = { top: makeTop(18.5), home: [26, -2], wander: 3, r0: 0.8, th0: 0.07, th1: 0.3, side: 1, drop: 0.7, fall: 1.25 };
const HOUR = { top: makeTop(14.5), home: [-33, 25], wander: 3.5, r0: 0.35, th0: 0.05, th1: 0.24, side: -1, drop: 4, fall: 0.95, duel: true };
const U_LAND = 0.7;
// The hour duel: wall-clock seconds (relative to the hour) at which the new hour top hits the old one.
const HITS = [-2.6, -1.8, -1.1];

const wanderXY = (kind, u) => [kind.home[0] + kind.wander * Math.sin(u * 0.23 + kind.side), kind.home[1] + kind.wander * 0.6 * Math.sin(u * 0.17 + 2)];

/** Where the new hour top is while it skitters ball-down and duels the old one; w = seconds from the hour. */
function duelXY(w, Lf) {
  const old = (ww) => wanderXY(HOUR, ww + Lf + HOUR.drop);
  const P0 = [-8, 35];
  const hitAt = (ww) => {
    const o = old(ww); const dx = o[0] - P0[0], dy = o[1] - P0[1], l = Math.hypot(dx, dy);
    const k = (2 * HOUR.top.R * 0.92) / l;
    return [o[0] - dx * k, o[1] - dy * k * 1.4];
  };
  const keys = [
    [-3.3, P0, 0], [HITS[0], hitAt(HITS[0]), 1], [-2.2, [P0[0] + 3, P0[1] + 3], 2],
    [HITS[1], hitAt(HITS[1]), 1], [-1.45, [P0[0] + 2, P0[1] - 3], 2], [HITS[2], hitAt(HITS[2]), 1],
    [-0.5, [-18, 33], 2], [0.9, wanderXY(HOUR, 0.9 + HOUR.drop), 3],
  ];
  for (let i = 1; i < keys.length; i++) {
    if (w <= keys[i][0]) {
      const [t0, p0] = keys[i - 1], [t1, p1, kindOf] = keys[i];
      const k = clamp((w - t0) / (t1 - t0), 0, 1);
      const e = kindOf === 1 ? ease.inQuad(k) : kindOf === 2 ? ease.outQuad(k) : ease.inOutQuad(k);
      return [lerp(p0[0], p1[0], e), lerp(p0[1], p1[1], e)];
    }
  }
  return keys[keys.length - 1][1];
}

/**
 * The state of a top `u` seconds after it was dropped; it shows the unit that
 * starts `kind.drop` seconds after the drop and lasts `Lf` seconds. Null once gone.
 */
export function topState(kind, u, Lf, text) {
  const { top, home, side, drop } = kind;
  const uEnd = Lf + drop;
  const UF0 = drop - 0.4, UF1 = drop + 0.4;
  const Ld = uEnd - 3.2, F1 = uEnd - kind.fall, OUT = uEnd - 0.02;
  if (u < 0 || u > OUT) return null;
  // precession: rate r0 / (1 - 0.9 p), integrated, then whirling faster still as it dies
  const psRaw = (uu) => (-kind.r0 * Ld / 0.9) * Math.log(1 - 0.9 * clamp(uu / Ld, 0, 1));
  const rEnd = kind.r0 / 0.1;
  const psAt = (uu) => {
    if (uu <= Ld) return psRaw(uu);
    const k = Math.min(uu, F1) - Ld;
    return psRaw(Ld) + rEnd * k * (1 - k / (2 * (F1 - Ld)));
  };
  const psT = -Math.PI / 2 + 0.95 * side;                     // fall towards the viewer, outwards
  let ps = psT - psAt(F1) + psAt(u);
  const thLife = (uu) => {
    const pp = clamp(uu / Ld, 0, 1);
    return kind.th0 + kind.th1 * pp ** 3 + (0.015 + 0.06 * pp * pp) * Math.sin(uu * 15);
  };
  const thRest = Math.acos(top.c / top.R) - 0.02;
  let th, cz = 0, wob = 0;
  let cxy = wanderXY(kind, u);
  let str = null;
  const w = u - drop;                                          // seconds from the unit's start
  if (u < U_LAND) {
    const k = u / U_LAND;
    th = Math.PI - 0.25 + 0.1 * Math.sin(u * 20);
    cz = 52 * (1 - k * k);
    const land = kind.duel ? duelXY(-3.3, Lf) : home;
    cxy = [land[0] + 10 * side * (1 - k), land[1] + 3];
    str = { k: 0 };
  } else if (u < UF0) {
    const k = (u - U_LAND) / (UF0 - U_LAND);
    th = Math.PI - 0.12 * Math.exp(-4 * (u - U_LAND)) + 0.05 * Math.sin(u * 23);
    cz = 3 * Math.abs(Math.sin(Math.PI * Math.min(1, (u - U_LAND) / 0.25)));
    cxy = kind.duel ? duelXY(w, Lf) : [home[0], home[1] + 3 * (1 - k)];
    if (kind.duel) for (const h of HITS) if (w > h) cz += 4 * Math.exp(-9 * (w - h)) * Math.abs(Math.sin((w - h) * 18));
    str = { k: Math.min(1, (u - U_LAND) / 0.25) };
  } else if (u < UF1) {
    const k = ease.inOutQuad((u - UF0) / (UF1 - UF0));
    th = lerp(Math.PI - 0.04, thLife(u) - 0.1 * Math.sin(Math.PI * k), k);
    ps += 4 * (1 - k);                                         // the flip whirls round as it rises
    if (!kind.duel) {
      const k0 = (u - UF0) / (UF1 - UF0);
      cxy = [lerp(home[0], cxy[0], k0), lerp(home[1], cxy[1], k0)];
    }
  } else if (u < Ld) {
    th = thLife(u);
  } else if (u < F1) {
    const k = (u - Ld) / (F1 - Ld);
    th = lerp(thLife(Ld), thRest, k ** 2.4);
  } else {
    const k = u - F1;
    th = thRest + 0.14 * Math.exp(-5 * k) * Math.sin(k * 16);
    const roll = ease.inCubic(progress(u, F1 + 0.3, OUT));
    cxy = [cxy[0] + side * 95 * roll, cxy[1] - 6 * roll];
    ps += side * 2.4 * roll;
    wob = roll;
  }
  if (kind.duel && u > Ld) {
    // the old hour top takes the hits: knocked back and set rocking
    const wo = u - uEnd;
    for (const h of HITS) if (wo > h) {
      const d = wo - h;
      cxy[0] += -3.5 * (1 - Math.exp(-10 * d));
      cxy[1] += 2 * (1 - Math.exp(-10 * d));
      if (u < F1) { th += 0.16 * Math.exp(-5 * d) * Math.abs(Math.sin(d * 11)); ps += 1.2 * (1 - Math.exp(-6 * d)); }
    }
  }
  const a = axisOf(th, ps);
  const sup = support(top, a);
  const C = [cxy[0] + sup[0], cxy[1] + sup[1], sup[2] + cz];
  // spin of the painted gores: fast and blurred, slowing to visible stripes
  const life = clamp(u / uEnd, 0, 1);
  const blur = u < F1 ? 1 - progress(life, 0.55, 0.93) : 0;
  const spin = TAU * (2.6 * u - (1.9 * u * u) / (2 * uEnd)) + wob * 9;
  const drift = 0.1 * Math.sin(u * 0.6 + side) * (u < Ld ? 1 : 0);
  return { top, C, a, spin, blur, drift, text: w >= 0 ? text : null, str, side };
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
  for (const r of [52, 74]) {
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
function sparks(g, x, y, k) {
  // a clack: short rays bursting from the point of contact
  const r0 = 4 + 9 * k, r1 = r0 + 6 * (1 - k);
  for (let i = 0; i < 8; i++) {
    const an = (i / 8) * TAU + 0.3;
    g.thickLine(x + r0 * Math.cos(an), y + r0 * Math.sin(an) * 0.8, x + r1 * Math.cos(an), y + r1 * Math.sin(an) * 0.8, 1.6, 1);
  }
}

function scene(g, ms) {
  const T = ms / 1000;
  const Mst = Math.floor(T / 60) * 60;
  const hd = new Date(ms); hd.setMinutes(0, 0, 0);
  const Hst = hd.getTime() / 1000;
  const [ox, oy] = orbit(new Date(ms), 2, 4);
  const tops = [];
  const mmOf = (s) => clockFields(new Date(s * 1000)).mm;
  const hhOf = (s) => clockFields(new Date(s * 1000)).hh;
  for (const M of [Mst - 60, Mst, Mst + 60]) {
    const st = topState(MIN, T - (M - MIN.drop), 60, mmOf(M));
    if (st) tops.push(st);
  }
  for (const Hs of [Hst - 3600, Hst, Hst + 3600]) {
    const st = topState(HOUR, T - (Hs - HOUR.drop), 3600, hhOf(Hs));
    if (st) tops.push(st);
  }
  drawTray(g, ox, oy, tops);
  tops.sort((p, q) => (q.C[1] * CE - q.C[2] * SE) - (p.C[1] * CE - p.C[2] * SE));
  for (const st of tops) {
    st.ox = ox; st.oy = oy;
    drawTop(g, st);
    if (st.str && st.str.k < 0.98) drawString(g, st, ox, oy);
  }
  // the clacks of the hour duel
  const toHour = T - (T - Hst > 1800 ? Hst + 3600 : Hst);
  for (const h of HITS) {
    const k = (toHour - h) / 0.3;
    if (k >= 0 && k < 1) {
      const hs = tops.filter((st) => st.top === HOUR.top);
      if (hs.length === 2) {
        const [x0, y0] = project(...hs[0].C), [x1, y1] = project(...hs[1].C);
        sparks(g, (x0 + x1) / 2 + ox, (y0 + y1) / 2 + oy, k);
      }
    }
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
