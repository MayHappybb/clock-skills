// Coin Pusher - the time is the prize on an arcade coin-pusher machine.
//
// Real 3D (a shift-lens camera, so uprights stay upright): a playfield with
// side rails and a front lip, the pusher block sliding in and out at the
// back, a swinging chute dropping a coin every couple of seconds. Coins are
// pucks in perspective (contour, rim band, glint), drawn far to near so they
// overlap and stack; each stroke of the pusher shoves the whole crowd
// forward, and coins tip over the lip and fall into the win tray.
//
// The time is chunky moulded-plastic prize tokens, extruded numerals
// ray-cast per pixel (face lit, extrusion outlined, a black moat round all
// of it). The hour (24 h) rides on top of the pusher, the upper shelf,
// gliding back and forth all day. The minutes stand on the playfield among
// the coins, which flow round them. Each push nudges them nearer the edge:
// the ones token creeps a little every minute, the tens token has been
// there up to ten minutes and creeps right out over the lip, rocking on
// every push - will it go?
//
// The minute: four coins drop at once, the cascade surges the field, the
// old token is shoved to the lip, teeters back and forth, tips forward and
// falls into the tray with the coins; the new token drops from above,
// bounces, wobbles and is pushed into place. The hour: jackpot - the
// cabinet flashes, coins rain from everywhere and the chute gushes, the old
// hour tokens are knocked off the pusher shelf onto the field, face down,
// and a big sweep carries everything over the edge while the new hour drops
// onto the shelf.
//
// frame() is a pure function of the wall clock: every coin's drop time,
// landing place and progress are closed-form (cumulative push counts), and
// the moment a coin crossed the lip is found by bisection.

import { clamp, ease, noise, orbit } from '../js/kit.js';

// ------------------------------------------------------------ digits
// Chunky moulded-plastic prize numerals, like fridge-magnet letters: fat
// round strokes, soft ends, small counters. Each is a signed-distance shape
// in a 10 x 15 box, tabulated once as a 40 x 60 mask.

const DW = 10, DH = 15, RES = 4, MW = DW * RES, MH = DH * RES;
const R = 1.75; // half the stroke

function seg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const u = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - ax - u * dx, py - ay - u * dy);
}
// Distance to an arc of radius r round (cx, cy), from angle a0 to a1 (degrees,
// 0 = right, 90 = down, increasing clockwise on screen), a1 > a0.
function arcd(px, py, cx, cy, rx, ry, a0, a1) {
  const x = px - cx, y = py - cy;
  let a = Math.atan2(y / ry, x / rx) * 180 / Math.PI;
  while (a < a0) a += 360;
  while (a >= a0 + 360) a -= 360;
  if (a <= a1) {
    // first-order distance to the ellipse
    const k = Math.hypot(x / rx, y / ry) || 1e-6;
    const gx = x / (rx * rx * k), gy = y / (ry * ry * k);
    return Math.abs(k - 1) / (Math.hypot(gx, gy) || 1e-6);
  }
  const e = (q) => { const r = q * Math.PI / 180; return Math.hypot(x - rx * Math.cos(r), y - ry * Math.sin(r)); };
  return Math.min(e(a0), e(a1));
}

const SHAPES = [
  (x, y) => arcd(x, y, 5, 7.5, 3.25, 5.75, 0, 360),
  (x, y) => Math.min(seg(x, y, 5.6, 1.9, 5.6, 13.1), seg(x, y, 5.6, 1.9, 2.4, 4.6), seg(x, y, 2.6, 13.1, 8.4, 13.1)),
  (x, y) => Math.min(arcd(x, y, 5, 5.0, 3.2, 3.15, 170, 395), seg(x, y, 7.6, 7.4, 1.8, 13.1), seg(x, y, 1.8, 13.1, 8.3, 13.1)),
  (x, y) => Math.min(arcd(x, y, 5, 4.45, 3.0, 2.6, 190, 450), arcd(x, y, 5, 10.1, 3.25, 3.0, 270, 520)),
  (x, y) => Math.min(seg(x, y, 2.5, 1.8, 1.8, 9.9), seg(x, y, 1.8, 9.9, 8.4, 9.9), seg(x, y, 7.0, 3.6, 7.0, 13.2)),
  (x, y) => Math.min(seg(x, y, 8.2, 1.8, 2.5, 1.8), seg(x, y, 2.5, 1.8, 2.2, 6.9), arcd(x, y, 5, 9.6, 3.25, 3.4, 215, 510)),
  (x, y) => Math.min(arcd(x, y, 5, 9.85, 3.25, 3.4, 0, 360), arcd(x, y, 8.6, 9.6, 6.85, 7.8, 182, 252)),
  (x, y) => Math.min(seg(x, y, 1.8, 1.8, 8.2, 1.8), seg(x, y, 8.2, 1.8, 4.0, 13.2)),
  (x, y) => Math.min(arcd(x, y, 5, 4.3, 2.75, 2.55, 0, 360), arcd(x, y, 5, 10.15, 3.25, 3.1, 0, 360)),
  (x, y) => Math.min(arcd(x, y, 5, 5.15, 3.25, 3.4, 0, 360), arcd(x, y, 1.4, 5.4, 6.85, 7.8, 2, 72)),
];

export const MASKS = SHAPES.map((f) => {
  const m = new Uint8Array(MW * MH);
  for (let j = 0; j < MH; j++)
    for (let i = 0; i < MW; i++) m[j * MW + i] = f((i + 0.5) / RES, (j + 0.5) / RES) <= R ? 1 : 0;
  return m;
});

/** Whether (u, v) in [0,1]^2 (v down) is inside digit d. */
function inMask(m, u, v) {
  if (u < 0 || v < 0 || u >= 1 || v >= 1) return 0;
  return m[((v * MH) | 0) * MW + ((u * MW) | 0)];
}

/** Flat digit, for the digit specimen. */
export function drawFlatDigit(g, d, x, y, w, h) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++)
      if (inMask(MASKS[d], (i + 0.5) / w, (j + 0.5) / h)) g.pixel(x + i, y + j);
}


// ------------------------------------------------------------ camera
// A shift-lens perspective: the camera looks level, its film shifted down, so
// uprights stay upright (tokens are not foreshortened) while the playfield
// recedes. World units: at the front edge (z = 0) one unit is one pixel.
// x right, y up, z away from the viewer.

const F = 130, D = 130, YC = 65;
let CX = 64, CY = -12;
const proj = (X, Y, Z) => { const s = F / (Z + D); return [CX + X * s, CY + (YC - Y) * s, s]; };

const TAU = Math.PI * 2;
const W = 128, H = 64;

// ------------------------------------------------------------ the machine

const RAIL = 62;          // playfield half width
const ZBACK = 104;        // back wall
const HP = 8;             // pusher height
const PP = 3.2;           // pusher period, s
const ZP0 = 80, AP = 9;   // pusher front: retracted z, stroke
const DROP = 2.3;         // a coin from the chute every DROP s
const KICK = 3.9;         // how far a stroke shoves the coins
const CR = 7.2, CT = 2.2; // coin radius, thickness
const CHY = 40, CHZ = 66; // chute exit height and depth
const GRAV = 380;

const TW = 18, THT = 27, TT = 6; // token width, height, thickness

const pusherZ = (T) => ZP0 - AP * (1 - Math.cos(TAU * (T / PP))) / 2;
function pushCount(T) {
  const p = T / PP, n = Math.floor(p), f = p - n;
  return n + (f < 0.5 ? (1 - Math.cos(TAU * f)) / 2 : 1);
}
const MS = 6; // extra strokes of the minute cascade
function minuteSurge(T) {
  const u = T + 1.6, i = Math.floor(u / 60), s = u - i * 60;
  return MS * (i + ease.inOutCubic(clamp(s / 2, 0, 1)));
}
const HS = 13; // the jackpot sweep
function hourSurge(T) {
  const u = T + 1.0, i = Math.floor(u / 3600), s = u - i * 3600;
  return HS * (i + ease.inOutQuad(clamp(s / 4, 0, 1)));
}
const count = (T) => pushCount(T) + minuteSurge(T) + hourSurge(T);
const chuteX = (T) => 20 + 34 * Math.sin(TAU * T / 11) + 5 * Math.sin(TAU * T / 3.7);

// The minute tokens stand in a lane the coins flow round.
const TX = [16, 42];
const LANE0 = TX[0] - TW / 2 - 1, LANE1 = TX[1] + TW / 2 + 1;
function deflect(x, z) {
  const w = ease.inOutQuad(clamp((40 - z) / 16, 0, 1));
  if (w <= 0 || x < LANE0 - CR || x > LANE1 + CR) return x;
  const target = x < (LANE0 + LANE1) / 2 ? Math.min(x, LANE0 - CR) : Math.max(x, LANE1 + CR);
  return x + (target - x) * w;
}

// ------------------------------------------------------------ drawing

let tokBuf = new Uint8Array(64 * 64);

/**
 * A token: digit d extruded TT deep, as a solid in 3D, ray-cast per pixel.
 * pose: x (centre), pivot (py, pz), wp (how far behind the front face the
 * pivot line is), a (tilt forward, radians). The face is lit solid, the
 * extrusion only outlined, with a black moat round all of it.
 */
function drawToken(g, d, { x, py, pz, wp = 0, a = 0 }) {
  const ca = Math.cos(a), sa = Math.sin(a);
  const bx = x - TW / 2, by = py - wp * sa, bz = pz - wp * ca;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const u of [0, TW]) for (const h of [0, THT]) for (const w of [0, TT]) {
    const [sx, sy] = proj(bx + u, by + h * ca + w * sa, bz - h * sa + w * ca);
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  x0 = Math.max(-1, Math.floor(x0) - 1); y0 = Math.max(-1, Math.floor(y0) - 1);
  x1 = Math.min(W, Math.ceil(x1) + 1); y1 = Math.min(H, Math.ceil(y1) + 1);
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  if (bw <= 2 || bh <= 2) return;
  if (tokBuf.length < bw * bh) tokBuf = new Uint8Array(bw * bh);
  const buf = tokBuf; buf.fill(0, 0, bw * bh);
  const m = MASKS[d];
  // camera relative to the token corner, in token axes
  const qx = -bx, qy = YC - by, qz = -D - bz;
  const uq = qx, hq = qy * ca - qz * sa, wq = qy * sa + qz * ca;
  const N = 7;
  for (let j = 1; j < bh - 1; j++) {
    const dy = -(y0 + j + 0.5 - CY) / F;
    const hd0 = dy * ca - sa, wd = dy * sa + ca;
    if (Math.abs(wd) < 1e-6) continue;
    const t0 = -wq / wd, t1 = (TT - wq) / wd;
    const front = t0 < t1, te = front ? t0 : t1, tx = front ? t1 : t0;
    if (tx <= 0) continue;
    for (let i = 1; i < bw - 1; i++) {
      const ud = (x0 + i + 0.5 - CX) / F;
      for (let k = 0; k < N; k++) {
        const t = te + (tx - te) * (k / (N - 1));
        const uu = (uq + t * ud) / TW, vv = 1 - (hq + t * hd0) / THT;
        if (inMask(m, uu, vv)) { buf[j * bw + i] = k === 0 && front ? 2 : 1; break; }
      }
    }
  }
  for (let j = 0; j < bh; j++)
    for (let i = 0; i < bw; i++) {
      const c = buf[j * bw + i];
      const nb = (di, dj) => { const ii = i + di, jj = j + dj; return ii < 0 || jj < 0 || ii >= bw || jj >= bh ? 0 : buf[jj * bw + ii]; };
      const l = nb(-1, 0), r = nb(1, 0), u = nb(0, -1), dn = nb(0, 1);
      if (!c) { if (l || r || u || dn) g.pixel(x0 + i, y0 + j, 0); continue; }
      let on = c === 2;
      if (c === 1 && (!l || !r || !u || !dn)) {
        // the extrusion is drawn as its outline, kept a pixel clear of the face
        on = true;
        for (let dj = -1; dj <= 1 && on; dj++) for (let di = -1; di <= 1; di++) if (nb(di, dj) === 2) { on = false; break; }
      }
      g.pixel(x0 + i, y0 + j, on ? 1 : 0);
    }
}

/** A coin seen from above: top-face ellipse, rim band h deep, contour lines and a highlight. */
export function drawCoin(g, sx, sy, rx, ry, h) {
  if (rx < 0.8) return;
  ry = Math.max(0.6, ry);
  const xa = Math.floor(sx - rx - 1), xb = Math.ceil(sx + rx + 1);
  const ya = Math.floor(sy - ry - 1), yb = Math.ceil(sy + ry + h + 1);
  const e1 = (x, y) => { const u = (x + 0.5 - sx) / rx, v = (y + 0.5 - sy) / ry; return u * u + v * v <= 1; };
  const U = (x, y) => {
    if (e1(x, y)) return true;
    const u = (x + 0.5 - sx) / rx, v = (y + 0.5 - sy - h) / ry;
    if (u * u + v * v <= 1) return true;
    return Math.abs(u) <= 1 && y + 0.5 >= sy && y + 0.5 <= sy + h;
  };
  for (let y = ya; y <= yb; y++)
    for (let x = xa; x <= xb; x++) {
      if (!U(x, y)) continue;
      let on = !U(x - 1, y) || !U(x + 1, y) || !U(x, y - 1) || !U(x, y + 1) || !U(x, y + 2);
      if (!on && rx >= 5 && ry >= 2.4) {
        // a glint: a short stroke following the far rim
        const u = (x + 0.5 - sx) / (rx - 2.2), v = (y + 0.5 - sy) / (ry - 1.1);
        const v2 = (y - 0.5 - sy) / (ry - 1.1);
        if (u > -0.75 && u < -0.05 && u * u + v * v <= 1 && u * u + v2 * v2 > 1) on = true;
      }
      g.pixel(x, y, on ? 1 : 0);
    }
}

function coinOnFloor(g, X, Y, Z) {
  const [sx, sy, s] = proj(X, Y + CT, Z);
  drawCoin(g, sx, sy, CR * s, CR * s * (YC - Y) / (Z + D), CT * s);
}
function coinTipped(g, X, Y, Z, beta, spin = 0) {
  const [sx, sy, s] = proj(X, Y, Z);
  const flat = (YC - Y) / (Z + D);
  const ry = CR * s * Math.abs(flat * Math.cos(beta) + Math.sin(beta)) * Math.abs(Math.cos(spin));
  drawCoin(g, sx, sy - ry, CR * s, ry, CT * s * Math.abs(Math.cos(beta)));
}

// ------------------------------------------------------------ the coins

function crossing(tL, target, T) {
  let lo = tL, hi = T;
  for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (count(mid) < target) lo = mid; else hi = mid; }
  return hi;
}

/** Every coin on the glass at T, as draw items. */
function coins(T, items, edgeItems) {
  const add = (tk, xl, zl, yl, key) => {
    if (tk > T) return;
    const tL = tk + Math.sqrt(2 * yl / GRAV);
    if (T < tL) { // falling from the chute, spinning
      const dt = T - tk, Y = yl - GRAV * dt * dt / 2;
      items.push({ z: zl, draw: (g) => coinTipped(g, xl, Y, zl, Math.PI / 2, dt * 14 + key) });
      return;
    }
    const c0 = count(tL), zc = zl - KICK * (count(T) - c0);
    const bounce = T - tL < 0.3 ? 3 * Math.sin(Math.PI * (T - tL) / 0.3) : 0;
    if (zc > 0) {
      const x = deflect(xl, zc);
      items.push({ z: zc, draw: (g) => coinOnFloor(g, x, bounce, zc) });
      return;
    }
    const tc = crossing(tL, c0 + zl / KICK, T), dt = T - tc;
    const Y = -GRAV * dt * dt / 2;
    if (Y < -70) return;
    const x = deflect(xl, 0), beta = Math.min(Math.PI / 2, dt * 9 + 0.2);
    edgeItems.push({ z: -dt * 20, draw: (g) => coinTipped(g, x, Y, -dt * 20 - 2, beta, dt * 6 * noise(key, 7)) });
  };
  const kNow = Math.floor(T / DROP);
  for (let k = kNow - 40; k <= kNow + 1; k++) {
    const tk = k * DROP + (noise(k, 1) - 0.5) * 1.2;
    add(tk, chuteX(tk) + (noise(k, 2) - 0.5) * 8, CHZ - 2 - noise(k, 3) * 10, CHY, k);
  }
  // every minute a handful drops at once: the cascade that shoves a prize off
  const mt = Math.round(T / 60) * 60;
  for (let j = 0; j < 4; j++) {
    const tk = mt - 3.1 + j * 0.16;
    add(tk, chuteX(tk) + (j - 1.5) * 5, CHZ - 3 - j * 2.5, CHY, 100 + j);
  }
  // the jackpot: the chute gushes and coins rain from above
  const hr = Math.round(T / 3600) * 3600;
  if (T > hr - 4 && T < hr + 120) {
    for (let j = 0; j < 56; j++) {
      const tk = hr - 3.6 + j * 0.11;
      add(tk, (noise(j, 11) - 0.5) * 112, 10 + noise(j, 12) * 54, 70 + noise(j, 13) * 30, j + 0.5);
    }
    for (let j = 0; j < 30; j++) {
      const tk = hr - 3.5 + j * 0.1;
      add(tk, chuteX(tk) + (noise(j, 14) - 0.5) * 10, CHZ - 2 - noise(j, 15) * 14, CHY, j + 0.25);
    }
  }
}

// ------------------------------------------------------------ the prizes

const Z0 = 18, ZH = -2.5, LAMBDA = 0.0135;
const creepCount = (T) => pushCount(T) + minuteSurge(T);
const DEG = Math.PI / 180;
const Y0 = GRAV * 0.55 * 0.55 / 2;

/** Pose of a minute token on the playfield that landed at tL, at T. */
function creepPose(x, tL, T) {
  const z = ZH + (Z0 - ZH) * Math.exp(-LAMBDA * (creepCount(T) - creepCount(tL)));
  const f = T / PP - Math.floor(T / PP);
  const bump = f < 0.5 ? Math.sin(TAU * f) : 0;
  // near the edge it rocks on every push
  const a = 8 * DEG * clamp(-z / 2.5, 0, 1) * bump;
  return z < 0 ? { x, py: 0, pz: 0, wp: -z, a, z } : { x, py: 0, pz: z, wp: 0, a, z };
}

/** A token dropped in at T0 (falls 0.1..0.65 s after it), creeping after. */
function dropPose(x, T0, T, py = 0, pzFn = null) {
  const u = T - T0;
  if (u < 0.1) return null;
  if (u < 0.65) {
    const dt = u - 0.1, Y = Y0 - GRAV * dt * dt / 2;
    return pzFn ? { x, py: py + Y, pz: pzFn(T) } : { x, py: Y, pz: Z0 };
  }
  const hop = u < 1.05 ? Math.sin(Math.PI * (u - 0.65) / 0.4) : 0;
  const wob = u < 1.6 ? -6 * DEG * Math.sin(TAU * (u - 0.65) / 0.45) * (1 - (u - 0.65) / 0.95) : 0;
  if (pzFn) return { x, py: py + 4 * hop, pz: pzFn(T), a: wob };
  const p = creepPose(x, T0 + 0.65, T);
  p.py += 4 * hop; p.a += wob;
  return p;
}

/** The old token shoved off the edge: tau is seconds to the turn (negative before). */
function leavePose(x, zc, tau) {
  if (tau < -1.0) {
    const z = zc + (-3.2 - zc) * ease.inOutCubic(clamp((tau + 2.0) / 1.0, 0, 1));
    return z < 0 ? { x, py: 0, pz: 0, wp: -z } : { x, py: 0, pz: z };
  }
  let a, Y = 0;
  // it teeters on the lip: forward, back, further forward, back...
  if (tau < -0.42) {
    const u = (tau + 1.0) / 0.58;
    a = (4 + 14 * u) * DEG * Math.max(0, Math.sin(Math.PI * 2 * u * 1.5 - 0.3)) ;
  } else a = (4 + 100 * ((tau + 0.42) / 0.5) ** 2) * DEG;
  if (tau > -0.22) Y = -GRAV * (tau + 0.22) ** 2 / 2;
  if (Y < -80) return null;
  return { x, py: Y, pz: 0, wp: 3.2, a: Math.min(a, 170 * DEG) };
}

const HX = [-52, -30];
const hourPz = (T) => pusherZ(T) + 4;

/** The old hour tokens at the jackpot: off the shelf, face down, washed to the edge. */
function hourLeavePose(x, tau, Tturn) {
  if (tau < -0.8) {
    const dz = 4 + (-3.5 - 4) * ease.inOutQuad(clamp((tau + 1.3) / 0.5, 0, 1));
    const zp = pusherZ(Tturn + tau);
    return dz < 0 ? { x, py: HP, pz: zp, wp: -dz } : { x, py: HP, pz: zp + dz };
  }
  if (tau < -0.1) {
    const u = ease.inQuad((tau + 0.8) / 0.7);
    return { x, py: HP - (HP - 3.5) * u, pz: pusherZ(Tturn + tau), wp: 3.5, a: 90 * DEG * u };
  }
  const zl = pusherZ(Tturn - 0.1);
  if (tau < 0.9) {
    const z = zl + (8 - zl) * ease.inQuad((tau + 0.1) / 1.0);
    return { x, py: 3.5, pz: z, wp: 3.5, a: 90 * DEG };
  }
  const dt = tau - 0.9, Y = 3.5 - GRAV * dt * dt / 2;
  if (Y < -80) return null;
  return { x, py: Y, pz: 8 - 40 * dt, wp: 3.5, a: (90 + 80 * Math.min(1, dt * 2)) * DEG };
}

// ------------------------------------------------------------ the scene

function line3(g, a, b) {
  const [x0, y0] = proj(...a), [x1, y1] = proj(...b);
  g.line(Math.round(x0 - 0.5), Math.round(y0 - 0.5), Math.round(x1 - 0.5), Math.round(y1 - 0.5));
}

export default {
  name: 'Coin Pusher',
  blurb: 'An arcade coin pusher in 3D: the hour rides the pusher shelf, the minutes are plastic prize tokens among the coins, nudged nearer the edge with every push; each minute a cascade shoves the old token off the lip into the win tray and a new one drops in, and the hour is a jackpot avalanche.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, ctx) {
    const { date, fields: f, oled, night } = ctx;
    const [ox, oy] = orbit(date, 2, 3);
    CX = 64 + ox; CY = -9 + oy;
    const T = date.getTime() / 1000 - date.getTimezoneOffset() * 60;
    const sec = f.sec, m = f.m, Tm0 = T - sec;
    const zp = pusherZ(T);

    // cabinet: floor rails, back wall
    line3(g, [-RAIL, 0, 0], [-RAIL, 0, zp]);
    line3(g, [RAIL, 0, 0], [RAIL, 0, zp]);
    line3(g, [-RAIL, HP, ZBACK], [RAIL, HP, ZBACK]);
    // the pusher: top shelf edges and front face
    line3(g, [-RAIL, HP, zp], [-RAIL, HP, ZBACK]);
    line3(g, [RAIL, HP, zp], [RAIL, HP, ZBACK]);
    {
      const [xa, ya] = proj(-RAIL, HP, zp), [xb, yb] = proj(RAIL, 0, zp);
      g.fillRect(Math.round(xa), Math.round(ya), Math.round(xb - xa), Math.round(yb - ya), 0);
      g.hline(Math.round(xa), Math.round(ya), Math.round(xb - xa));
      g.hline(Math.round(xa), Math.round(yb) - 1, Math.round(xb - xa));
      g.vline(Math.round(xa), Math.round(ya), Math.round(yb - ya));
      g.vline(Math.round(xb) - 1, Math.round(ya), Math.round(yb - ya));
    }

    // the hour, riding on the pusher
    const hd = [Math.floor(f.h / 10), f.h % 10];
    const fa = T / PP - Math.floor(T / PP);
    const sway = 2.5 * DEG * Math.cos(TAU * fa);
    const hourLeaving = m === 59 && sec >= 58.7;
    const hourNew = m === 0 && sec < 2.6;
    const ph = (f.h + 23) % 24, phd = [Math.floor(ph / 10), ph % 10];
    const items = [], edge = [];
    for (let i = 0; i < 2; i++) {
      if (hourLeaving) items.push({ z: 50, d: hd[i], pose: hourLeavePose(HX[i], sec - 60 - i * 0.08, Tm0 + 60), shelf: true });
      else if (hourNew) {
        items.push({ z: 50, d: phd[i], pose: hourLeavePose(HX[i], sec - i * 0.08, Tm0) });
        items.push({ z: 90, d: hd[i], pose: dropPose(HX[i], Tm0 - 0.22 + i * 0.1, T, HP, hourPz), shelf: true });
      } else items.push({ z: 90, d: hd[i], pose: { x: HX[i], py: HP, pz: hourPz(T), a: sway }, shelf: true });
    }

    // the minutes, on the playfield
    const md = [Math.floor(m / 10), m % 10];
    const pm = (m + 59) % 60, pmd = [Math.floor(pm / 10), pm % 10];
    const born = [Tm0 - (m % 10) * 60 - 0.05, Tm0 - 0.2];
    for (let i = 0; i < 2; i++) {
      const changes = i === 1 || m % 10 === 9;
      const changed = i === 1 || m % 10 === 0;
      if (sec >= 58.2 && changes) {
        const zc = creepPose(TX[i], born[i] + 0.65, T).z;
        items.push({ d: md[i], pose: leavePose(TX[i], zc, sec - 60 + (i ? 0 : 0.15)) });
      } else if (sec < 1.6 && changed) {
        const lp = leavePose(TX[i], -3.5, sec + (i ? 0 : 0.15));
        if (lp) edge.push({ z: -5, d: pmd[i], pose: lp });
        items.push({ d: md[i], pose: dropPose(TX[i], born[i], T) });
      } else items.push({ d: md[i], pose: creepPose(TX[i], born[i] + 0.65, T) });
    }
    for (const it of items) if (it.pose && it.z === undefined) it.z = (it.pose.pz ?? 0) + TT / 2 - (it.pose.wp ?? 0);

    // pusher-shelf tokens first, then the playfield far to near
    const shelf = items.filter((it) => it.shelf && it.pose);
    for (const it of shelf) drawToken(g, it.d, it.pose);
    const field = items.filter((it) => !it.shelf && it.pose).map((it) => ({ z: it.z, draw: (gg) => drawToken(gg, it.d, it.pose) }));
    coins(T, field, edge);
    field.sort((a, b) => b.z - a.z);
    for (const it of field) it.draw(g);

    // the front edge and what falls over it
    line3(g, [-RAIL, 0, 0], [RAIL, 0, 0]);
    line3(g, [-RAIL, -4, 0], [RAIL, -4, 0]);
    edge.sort((a, b) => b.z - a.z);
    for (const it of edge) if (it.draw) it.draw(g); else drawToken(g, it.d, it.pose);

    // the chute, swinging over the field
    {
      const [cx, cy, s] = proj(chuteX(T), CHY, CHZ);
      const w = Math.round((CR + 1.5) * s);
      const x = Math.round(cx), y = Math.round(cy);
      g.fillRect(x - w - 1, 0, 2 * w + 3, y + 1, 0);
      g.vline(x - w, 0, y); g.vline(x + w, 0, y);
      g.hline(x - w - 1, y, 3); g.hline(x + w - 1, y, 3);
    }

    // jackpot: the cabinet lights flash twice
    const tj = T - Math.round(T / 3600) * 3600;
    if ((tj > -3.75 && tj < -3.68) || (tj > -3.5 && tj < -3.43)) oled.invert(true);
    oled.contrast(0xcf + (0x20 - 0xcf) * night);
  },
};
