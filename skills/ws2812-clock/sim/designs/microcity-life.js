// Microcity: the life round the avenues. Side-street traffic, the river
// (ripples, sun glints, boats with wakes), the harbour ferry, the train on
// its viaduct, stadium floodlights, rooftop beacons, a plane crossing, and
// the hour's fireworks. All closed-form in time.
import * as kit from '../js/kit.js';
import * as C from './microcity-city.js';
import { img, addPt, mulPt, overPt } from './microcity-px.js';

const { GW, GH } = C;
const HEAD = [1, 0.9, 0.75];
const stadPix = [];
for (let p = 0; p < C.N; p++) if (C.type[p] === C.T.STADIUM) stadPix.push(p);
const FW = [kit.hex('#ffc040'), kit.hex('#ff3a30'), kit.hex('#fff4e0'), kit.hex('#50ff80'), kit.hex('#ff70d0'), kit.hex('#50d0ff')];
const FLOOD = [[-15, -21], [15, -21], [-15, 21], [15, 21]];   // corner towers just outside the arena

function underLayer(e) {
  const { tt, D, nightK, amb } = e;
  // side streets: sparse, dim cars, both ways on a 1 px street
  for (let li = 0; li < C.minorLanes.length; li++) {
    const ln = C.minorLanes[li], L = ln.len;
    const n = Math.max(1, Math.floor(L / 34));
    for (const dir of [1, -1]) {
      const v = 5.5 + 1.5 * kit.hash(li, dir + 5);
      for (let j = 0; j < n; j++) {
        const s0 = (j * (L + 8)) / n + 9 * kit.hash(li, j, dir + 9);
        const s = ((((s0 + dir * v * tt) % (L + 8)) + (L + 8)) % (L + 8)) - 4;
        if (s < 0 || s > L) continue;
        const a = Math.min(1, s / 2, (L - s) / 2);
        const x = ln.horiz ? ln.x0 + s : ln.x0, y = ln.horiz ? ln.y0 : ln.y0 + s;
        const day = 0.16 * D * a, nk = nightK * a;
        const isHead = dir > 0;
        const r = day + (isHead ? 0.3 : 0.32) * nk, g = day + (isHead ? 0.27 : 0.02) * nk, b = day * 1.05 + (isHead ? 0.2 : 0.01) * nk;
        if (ln.horiz) addPt(x, y, r, g, b); else addPt(x, y, r, g, b);
      }
    }
  }
  // water: ripples and sun glints by day, city glow shimmering at night
  const W = C.water, it = Math.floor(tt * 6), fr = tt * 6 - it;
  for (let w = 0; w < W.length; w++) {
    const p = W[w], x = p % GW, y = (p - x) / GW, q = 3 * p;
    const rip = Math.sin(x * 0.6 + y * 0.25 - tt * 1.3 + 2 * Math.sin(y * 0.4 + tt * 0.5));
    img[q] *= 1 + 0.18 * rip; img[q + 1] *= 1 + 0.18 * rip; img[q + 2] *= 1 + 0.22 * rip;
    if (D > 0.05) {
      const g0 = kit.hash(p, it), g1 = kit.hash(p, it + 1);
      const gl = (g0 > 0.985 ? 1 - fr : 0) + (g1 > 0.985 ? fr : 0);
      if (gl > 0) { const v = 0.5 * gl * D * amb * 2.2; img[q] += v; img[q + 1] += v; img[q + 2] += v * 0.95; }
    }
    if (nightK > 0) {
      const sh = 0.5 + 0.5 * Math.sin(x * 0.9 - tt * 0.8 + Math.sin(y * 1.3 + tt * 1.1) * 2);
      img[q] += 0.006 * nightK * sh; img[q + 1] += 0.009 * nightK * sh; img[q + 2] += 0.02 * nightK * sh;
    }
  }
  // the stadium's floodlit pitch in the evening and on the hour
  const flood = floodLevel(e);
  if (flood > 0) {
    for (const p of stadPix) {
      const x = p % GW, y = (p - x) / GW, q = 3 * p;
      const pitch = Math.abs(x - C.STAD.cx) <= C.STAD.px && Math.abs(y - C.STAD.cy) <= C.STAD.py;
      const k = flood * (pitch ? 1 : 0.25) * 0.45;
      img[q] += C.alb[q] * k; img[q + 1] += C.alb[q + 1] * k; img[q + 2] += C.alb[q + 2] * k;
    }
  }
}

function floodLevel(e) {
  const { mins, dk, hourShow, tt } = e;
  const h = mins / 60;
  let f = h >= 17.5 && h < 22.5 ? kit.smoothstep(0.15, 0.4, dk) : 0;
  if (hourShow >= 0) f = Math.max(f, Math.min(1, hourShow * 3, (11 - hourShow) / 1.5) * (0.75 + 0.25 * Math.sin(tt * 9)));
  return f;
}

function overLayer(e) {
  const { tt, D, dk, nightK, amb, sun, hourShow } = e;
  // the river mirrors the banks' lights, broken up by ripples
  if (nightK > 0) {
    const R = C.riverPix;
    for (let r = 0; r < R.length; r += 2) {
      const p = R[r], x = p % GW, y = (p - x) / GW;
      const wob = Math.round(1.2 * Math.sin(y * 1.7 + tt * 2.3 + Math.sin(x * 0.3 - tt)));
      const m = R[r + 1] + wob, q = 3 * p, qm = 3 * Math.max(0, Math.min(C.N - 1, m));
      const k = 0.35 * nightK * (0.6 + 0.4 * Math.sin(x * 0.8 + tt * 3 + y));
      img[q] += img[qm] * k; img[q + 1] += img[qm + 1] * k; img[q + 2] += img[qm + 2] * k * 1.1;
    }
  }
  // train on the viaduct: five cars, every 26 s, alternating direction
  {
    const per = 26, k = Math.floor(tt / per), ph = tt - k * per, dir = k % 2 ? -1 : 1;
    const len = 38, x = -len - 4 + ph * 34, head = dir > 0 ? x + len : GW - x - len;
    if (x < GW + 4) {
      const x0 = dir > 0 ? x : GW - x - len, x1 = x0 + len;
      for (let X = Math.max(0, Math.floor(x0)); X <= Math.min(GW - 1, Math.ceil(x1)); X++) {
        const cov = Math.max(0, Math.min(X + 1, x1) - Math.max(X, x0));
        if (cov <= 0) continue;
        const rel = (X + 0.5 - x0) / len * 5, inCar = rel - Math.floor(rel), gap = inCar < 0.08 ? 0.3 : 1;
        for (const Y of [C.RAIL_Y, C.RAIL_Y + 1]) {
          const q = 3 * (Y * GW + X);
          const win = (X % 2 === 0) ? 1 : 0.55;
          const dr = 0.45 * amb * gap, nr = 0.3 * nightK * win * gap;
          const c0 = Y === C.RAIL_Y ? [0.75, 0.75, 0.8] : [0.7, 0.12, 0.1];
          img[q] = img[q] * (1 - cov) + cov * (c0[0] * dr * sun[0] + 0.75 * nr);
          img[q + 1] = img[q + 1] * (1 - cov) + cov * (c0[1] * dr * sun[1] + 0.9 * nr);
          img[q + 2] = img[q + 2] * (1 - cov) + cov * (c0[2] * dr * sun[2] + 1.0 * nr);
        }
      }
      const hl = 0.9 * nightK + 0.3 * D;
      addPt(head + dir * 0.5, C.RAIL_Y + 0.5, HEAD[0] * hl, HEAD[1] * hl, HEAD[2] * hl);
      addPt(head + dir * 2.5, C.RAIL_Y + 0.5, 0.2 * nightK, 0.18 * nightK, 0.14 * nightK);
    }
  }
  // boats on the river, with wakes
  for (let b = 0; b < 3; b++) {
    const v = (b === 1 ? -1 : 1) * (3.2 + b * 0.7), span = GW + 30;
    const x = ((((b * 71 + v * tt) % span) + span) % span) - 15;
    const y = C.riverY(x) + (v > 0 ? 1.8 : -1.8), dir = Math.sign(v);
    const dy = C.riverY(x + 1) - C.riverY(x);
    for (let w = 1; w < 12; w++) {          // the V of the wake
      const f = (1 - w / 12) ** 1.5, sp = w * 0.35;
      const v1 = (0.11 * D * amb * 3 + 0.03 * nightK) * f;
      addPt(x - dir * w, y - dy * dir * w - sp, v1, v1, v1);
      addPt(x - dir * w, y - dy * dir * w + sp, v1, v1, v1);
    }
    const hv = 0.5 * amb * 2 * D;
    addPt(x, y, hv, hv, hv * 0.95); addPt(x - dir, y - dy * dir, hv * 0.8, hv * 0.8, hv * 0.8);
    addPt(x - dir * 2, y - dy * dir * 2, hv * 0.8, hv * 0.3, hv * 0.2);
    addPt(x, y, 0.6 * nightK, 0.6 * nightK, 0.55 * nightK);
    addPt(x - dir * 2, y - 0.7, 0.4 * nightK, 0, 0); addPt(x - dir * 2, y + 0.7, 0, 0.4 * nightK, 0.05 * nightK);
  }
  // harbour ferry, a slow loop round the basin
  {
    const a = tt * 0.11, x = C.BASIN.cx + 8 + 16 * Math.cos(a), y = C.BASIN.cy + 4 + 11 * Math.sin(a);
    const dx = -Math.sin(a), dy = Math.cos(a) * 0.7, l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l;
    for (let w = 1; w < 14; w++) { const f = 0.08 * (1 - w / 14) * (D * amb * 3 + nightK * 0.4); addPt(x - ux * w, y - uy * w, f, f, f); }
    for (let m = 0; m < 4; m++) {
      const dv = 0.45 * amb * 2 * D, nv = 0.45 * nightK;
      addPt(x - ux * m, y - uy * m, dv * 0.95 + nv, dv * 0.95 + nv * 0.85, dv * 0.9 + nv * 0.6);
    }
  }
  // stadium floodlight heads
  const flood = floodLevel(e);
  if (flood > 0) for (const [fx, fy] of FLOOD) {
    const x = C.STAD.cx + fx, y = C.STAD.cy + fy;
    addPt(x, y, flood * 0.9, flood * 0.95, flood);
    addPt(x + 0.8, y, flood * 0.3, flood * 0.3, flood * 0.32);
    addPt(x, y + 0.8, flood * 0.3, flood * 0.3, flood * 0.32);
  }
  // aviation beacons on the towers
  if (nightK > 0) for (const [x, y, ph] of C.beacons) {
    const b = Math.max(0, Math.sin((tt * 0.9 + ph) * kit.TAU)) ** 3 * 0.55 * nightK;
    addPt(x, y, b, b * 0.03, b * 0.02);
  }
  plane(e);
  if (hourShow >= 0) fireworks(e);
}

function plane(e) {
  const { tt, D, nightK, amb } = e;
  const per = 47, k = Math.floor(tt / per), ph = tt - k * per;
  if (ph > 18) return;
  const ang = kit.hash(k, 3) * kit.TAU, off = (kit.hash(k, 5) - 0.5) * 80;
  const ux = Math.cos(ang), uy = Math.sin(ang), vx = -uy, vy = ux;
  const d = (ph - 9) * 17, x = 96 + ux * d + vx * off, y = 96 + uy * d + vy * off;
  const shape = [];
  for (let m = -4; m <= 4; m += 0.5) shape.push([m, 0]);                 // fuselage
  for (let m = -4.5; m <= 4.5; m += 0.5) shape.push([0.8 - Math.abs(m) * 0.35, m]);   // swept wings
  for (let m = -2; m <= 2; m += 0.5) shape.push([-3.6, m]);              // tailplane
  // shadow, then body by day
  if (D > 0.05) {
    for (const [a, b] of shape) mulPt(x + ux * a + vx * b + 9, y + uy * a + vy * b + 7, 0.28 * D);
    for (const [a, b] of shape) { const v = 0.32 * D * amb * 3; addPt(x + ux * a + vx * b, y + uy * a + vy * b, v, v, v * 1.02); }
  }
  // navigation lights: red port, green starboard, white strobe double-flash
  const nl = 0.3 + 0.7 * nightK;
  addPt(x + ux * -0.8 - vx * 4.5, y + uy * -0.8 - vy * 4.5, 0.7 * nl, 0.02, 0.01);
  addPt(x + ux * -0.8 + vx * 4.5, y + uy * -0.8 + vy * 4.5, 0.02, 0.6 * nl, 0.15 * nl);
  const sp = ph % 1.2, strobe = sp < 0.06 || (sp > 0.16 && sp < 0.22) ? 1 : 0;
  if (strobe) { addPt(x - ux * 4, y - uy * 4, 1, 1, 1); addPt(x - vx * 4.5 - ux * 0.8, y - vy * 4.5 - uy * 0.8, 0.6, 0.6, 0.6); addPt(x + vx * 4.5 - ux * 0.8, y + vy * 4.5 - uy * 0.8, 0.6, 0.6, 0.6); }
  const bc = Math.max(0, Math.sin(ph * 5)) ** 4 * 0.6 * nl;
  addPt(x + ux, y + uy, bc, 0.02 * bc, 0);
}

// Fireworks seen from above: shells rise from the stadium (a climbing spark
// that grows as it nears you), burst into rings of stars that spread, slow,
// droop and twinkle out, and flash-light the roofs below.
function fireworks(e) {
  const { hourShow: s0, tt, mins, D, amb } = e;
  const hr = Math.floor(mins / 60);
  for (let i = 0; i < 16; i++) {
    const tb = 0.4 + i * 0.6 + 0.3 * kit.hash(i, hr, 1);       // burst time
    const age = s0 - tb;
    if (age < -0.7 || age > 2.2) continue;
    const pick = kit.hash(i, hr, 2);
    // the first shell over the stadium, then a tour of the city on a jittered 4 x 4 grid
    const cell = i === 0 ? -1 : (i * 7 + hr * 5) % 16;
    const cx = cell < 0 ? C.STAD.cx : 24 + 48 * (cell % 4) + (kit.hash(i, hr, 3) - 0.5) * 20;
    const cy = cell < 0 ? C.STAD.cy : 24 + 48 * Math.floor(cell / 4) + (kit.hash(i, hr, 4) - 0.5) * 20;
    const col = FW[Math.floor(pick * FW.length)], col2 = FW[Math.floor(kit.hash(i, hr, 5) * FW.length)];
    if (age < 0) {                                    // the climbing shell
      const u = (age + 0.7) / 0.7, x = kit.lerp(C.STAD.cx, cx, u), y = kit.lerp(C.STAD.cy, cy, u);
      const v = 0.35 + 0.5 * u;
      addPt(x, y, v, v * 0.8, v * 0.5);
      addPt(kit.lerp(C.STAD.cx, cx, u - 0.06), kit.lerp(C.STAD.cy, cy, u - 0.06), v * 0.3, v * 0.2, v * 0.1);
      continue;
    }
    const R = 28 + 16 * kit.hash(i, hr, 6), n = 48;
    // flash: the burst lights the city below
    if (age < 0.6) {
      const fl = (1 - age / 0.6) ** 2 * 0.3, rr = 44;
      for (let y = Math.max(0, Math.floor(cy - rr)); y <= Math.min(GH - 1, cy + rr); y++)
        for (let x = Math.max(0, Math.floor(cx - rr)); x <= Math.min(GW - 1, cx + rr); x++) {
          const d2 = ((x - cx) ** 2 + (y - cy) ** 2) / (rr * rr);
          if (d2 >= 1) continue;
          const q = 3 * (y * GW + x), k = fl * (1 - d2) * (1 - d2);
          img[q] += (C.alb[q] * 2 + 0.04) * k * col[0]; img[q + 1] += (C.alb[q + 1] * 2 + 0.04) * k * col[1]; img[q + 2] += (C.alb[q + 2] * 2 + 0.04) * k * col[2];
        }
    }
    const life = 2.4, fade = Math.max(0, 1 - age / life) ** 1.3;
    for (let m = 0; m < n; m++) {
      const a = (m / n) * kit.TAU + kit.hash(i, m, hr) * 0.3;
      const z = 2 * kit.hash(m, i, 9) - 1, sp = Math.sqrt(1 - z * z) * (0.92 + 0.12 * kit.hash(m, i, 7));   // a sphere of stars seen from above
      const c = m % 3 ? col : col2;
      for (let tr = 0; tr < 8; tr++) {
        const ta = Math.max(0, age - tr * 0.06);
        const r = R * sp * (1 - Math.exp(-3 * ta));
        const droop = 3.5 * ta * ta;           // stars fall away, drifting south in plan
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r + droop;
        const tw = age > 1.4 ? (kit.hash(m, i, Math.floor(tt * 14)) > 0.4 ? 1 : 0.15) : 1;
        const v = fade * tw * (tr === 0 ? 1.1 : 0.45 / tr);
        addPt(x, y, c[0] * v, c[1] * v, c[2] * v);
        if (D > 0.05 && tr < 3) { const k = amb * 2.4; overPt(x, y, c[0] * k, c[1] * k, c[2] * k, D * fade * tw * (tr ? 0.5 : 0.95)); }   // by day: confetti
        if (tr === 0) { const h = v * 0.3; addPt(x + 0.9, y, c[0] * h, c[1] * h, c[2] * h); addPt(x - 0.9, y, c[0] * h, c[1] * h, c[2] * h); addPt(x, y + 0.9, c[0] * h, c[1] * h, c[2] * h); addPt(x, y - 0.9, c[0] * h, c[1] * h, c[2] * h); }
      }
    }
    if (age < 0.15) { const v = 1 - age / 0.15; addPt(cx, cy, v, v, v); }
  }
}

export function drawExtras(e) {
  if (e.phase === 'under') underLayer(e); else overLayer(e);
}
