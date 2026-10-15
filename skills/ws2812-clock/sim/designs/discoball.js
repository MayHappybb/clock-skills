// Discoball: a mirror ball turns under the ceiling of a dark club. Two pin
// spots hit it and its ~250 facets throw real reflections onto the back wall
// and the dance floor: rows of light sweeping sideways as it spins. Some of
// those reflections have gathered, impossibly, into the time: a 70s italic
// strung from light spots, hung on a smile-shaped arc round the ball (hours
// gold on the left, minutes rose on the right). At 120 BPM the floor tiles
// pulse, the digit spots chase like marquee bulbs and the rainbow frog in
// round glasses dances.
// Minute turn: the ball whirls, the changing digit's spots peel off one by
// one, swing a full orbit round the room and land as the new digit.
// Hour: strobe, a rainbow wash through every reflection, the spots swing a
// wider rainbow orbit and the frog drops into the splits.
import * as kit from '../js/kit.js';
import { W, H, img, mask, owner, clear, dot, stampMask, star } from './discoball-raster.js';
import { buildSpots } from './discoball-glyphs.js';
import { drawFrog } from './discoball-frog.js';

// ---------------------------------------------------------------- scene
const BX = 32, BY = 11.5, BR = 9.6;               // the ball on screen (px)
const F = 64, ZC = 8, DZ = 6, FY = 8;             // camera focal (px), camera z, back wall z = -DZ, floor y = FY (world units, ball at 0)
const HORIZON = BY + F * FY / (ZC + DZ);           // where back wall meets floor on screen
const SLOTS = [[7.9, 19], [20.9, 39], [43.1, 39], [56.1, 19]];
const GOLD = kit.hex('#ffb648'), ROSE = kit.hex('#ff4f8f');
const SILVER = [0.78, 0.84, 1.0], VIOLET = kit.hex('#8d5bff');
const SLOT_COL = [GOLD, GOLD, ROSE, ROSE];
const LIGHTS = [
  { d: norm(-0.35, -0.8, 0.5), c: SILVER, k: 1.0 },
  { d: norm(0.95, -0.3, 0.05), c: VIOLET, k: 0.9 },
  { d: norm(-0.9, -0.2, -0.3), c: SILVER, k: 0.6 },
];
function norm(x, y, z) { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; }

// ---------------------------------------------------------------- facets
const NB = 14;
const bandN = [], bandOff = [];
let NF = 0;
for (let b = 0; b < NB; b++) {
  const latc = ((b + 0.5) / NB - 0.5) * Math.PI;
  const n = Math.max(6, Math.round(2 * NB * Math.cos(latc)));
  bandN.push(n); bandOff.push(NF); NF += n;
}
const facetLum = new Float32Array(NF * 3);   // shaded colour of each facet this frame
const facetSpec = new Float32Array(NF);
const JIT = new Float32Array(2 * NF);
for (let f = 0; f < NF; f++) { JIT[2 * f] = (kit.hash(f, 1) - 0.5) * 0.16; JIT[2 * f + 1] = (kit.hash(f, 2) - 0.5) * 0.16; }

// ---------------------------------------------------------------- glyph spots
const SPOTS = buildSpots({ u: 1.16, ux: 0.86, slant: 0.14 });
// order every digit's spots by angle round its centre, from 12 o'clock clockwise
for (let d = 0; d <= 9; d++) {
  const key = (s) => kit.fract(Math.atan2(s.x, -s.y) / kit.TAU);
  SPOTS[d].sort((a, b) => key(a) - key(b));
}

const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (date) => pad(date.getHours()) + pad(date.getMinutes());

// --------------------------------------------------------------- the frame
const rowLut = new Float32Array(3 * H);

function flightOf(age, hour, j, n) {
  // per-spot flight progress 0..1, staggered along the stroke
  const delay = (hour ? 0.3 : 0.45) * (n > 1 ? j / (n - 1) : 0) + (hour ? 0.25 : 0.35) * kit.hash(j, n), dur = hour ? 1.6 : 1.5;
  return kit.clamp((age - delay) / dur);
}

export default {
  name: 'Mirror Ball',
  blurb: 'a 3D mirror ball throws real reflections round a club; some gather into the time, the rest sweep the room while a frog dances',
  layouts: ['hub'], look: 'smoke', fps: 60, brightness: 0.4, dither: true,
  frame(ctx) {
    const now = ctx.date.getTime() / 1000;
    const M = Math.floor(now / 60) * 60, age = now - M;
    const cur = digitsOf(ctx.date), prev = digitsOf(new Date((M - 60) * 1000));
    const hourTurn = prev.slice(0, 2) !== cur.slice(0, 2);
    const night = ctx.night;
    const beat = now * 2;                                  // 120 BPM
    const turnT = 2.4;
    const turnP = kit.clamp(age / turnT);
    // ball spin: steady, plus a whirl of one (hour: two) extra turns at the turn;
    // the jump of a whole turn at the next minute is invisible (the ball is symmetric)
    const phi = kit.TAU * kit.fract(now / 18) + kit.TAU * (hourTurn ? 2 : 1) * kit.ease.inOut(turnP);
    // hour show envelope (0..1)
    const show = hourTurn ? kit.smoothstep(0, 0.4, age) * (1 - kit.smoothstep(4.5, 6.5, age)) : 0;
    const dimAmb = 1 - 0.8 * night, dimDig = 1 - 0.45 * night;

    clear();

    // ---- the time's spots: positions + colours (also stamps the dark margin)
    const live = [];                                       // [x, y, r, cr, cg, cb, a, sparkleSeed]
    for (let s = 0; s < 4; s++) {
      const [sx, sy] = SLOTS[s], col = SLOT_COL[s];
      const dNew = +cur[s], dOld = +prev[s];
      const changing = dNew !== dOld && age < turnT + 0.1;
      if (!changing) {
        const sp = SPOTS[dNew];
        for (let j = 0; j < sp.length; j++) live.push(restSpot(sx, sy, sp[j], j, s, col, now, beat));
        continue;
      }
      const A = SPOTS[dOld], B = SPOTS[dNew], n = Math.max(A.length, B.length);
      for (let j = 0; j < n; j++) {
        // pair spots j <-> j along the stroke; extras fade on their flight
        const ja = Math.floor((j * A.length) / n), jb = Math.floor((j * B.length) / n);
        const a = A[ja], b = B[jb];
        const fa = A.length === n || (j * A.length) % n < A.length;  // first spot mapped to ja
        const fb = B.length === n || (j * B.length) % n < B.length;
        const p = kit.ease.inOut(flightOf(age, hourTurn, j, n));
        const ra = restSpot(sx, sy, a, ja, s, col, now, beat), rb = restSpot(sx, sy, b, jb, s, col, now, beat);
        let alpha = 1;
        if (!fa) alpha *= kit.smoothstep(0.2, 0.7, p);
        if (!fb) alpha *= 1 - kit.smoothstep(0.3, 0.8, p);
        flight(live, ra, rb, p, hourTurn, alpha, now, s, j);
      }
    }
    // resting spots claim their ground first; spots in flight fade where they
    // cross a digit at rest, so a passing swarm never re-reads another number
    live.forEach((L, k) => { L[8] = 0; if (L[7] >= 0) stampMask(L[0], L[1], 3.3, Math.min(1, L[6]), k); });
    for (const L of live) if (L[7] < 0) {
      const qx = Math.round(L[0]), qy = Math.round(L[1]);
      if (qx >= 0 && qy >= 0 && qx < W && qy < H) L[6] *= 1 - 0.9 * mask[qy * W + qx];
    }
    for (const L of live) if (L[7] < 0) stampMask(L[0], L[1], 2.6, Math.min(1, L[6]));

    // ---- the room: floor, then the ball's reflections on wall and floor
    drawFloor(beat, show, now, dimAmb);
    shadeFacets(phi, show, now);
    drawReflections(phi, show, now, dimAmb, beat, live);
    // strobe on the hour: quick flashes on the beat, walls only
    if (show > 0) {
      const sb = beat * 2, fl = Math.exp(-kit.fract(sb) * 16) * show * (age < 3.2 ? 1 : 0.4) * 0.03 * (1 - night);
      if (fl > 0.002) for (let p = 0; p < W * H; p++) {
        const k = fl * (1 - mask[p]);
        img[3 * p] += k; img[3 * p + 1] += k; img[3 * p + 2] += k;
      }
    }


    // ---- the time
    for (const L of live) {
      const fl = Math.min(1, L[8]);
      const k = L[6] * dimDig * (1 + 0.55 * fl);
      dot(L[0], L[1], L[2], L[3] + fl * 0.25, L[4] + fl * 0.25, L[5] + fl * 0.25, k);
    }
    // a facet flash crosses a digit spot now and then: a star glint
    for (const L of live) {
      const g = sparkle(L[7], now);
      if (g > 0.02) star(L[0], L[1], 3, 1, 0.95, 0.9, g * 0.8 * dimDig);
    }

    // ---- the frog on the dance floor, in front of the wall
    drawFrog(rowLut, { now, beat, age, hourTurn, night, show, cx: 32, feetY: 61.6 });

    // ---- the ball itself, over the wall
    drawBall(phi, show, now, dimAmb);

    kit.blitGrid(ctx, img);
  },
};

/** A resting spot: marquee chase on the beat, a tiny swim, the slot colour. */
function restSpot(sx, sy, s, j, slot, col, now, beat) {
  const ph = j / 5 - beat * 0.5 + slot * 0.25;
  const chase = 0.84 + 0.16 * Math.cos(kit.TAU * ph);
  const sw = 0.22, k = j * 1.7 + slot * 3.1;
  const x = sx + s.x + sw * Math.sin(now * 1.3 + k), y = sy + s.y + sw * Math.cos(now * 1.1 + k * 0.7);
  return [x, y, s.r, col[0], col[1], col[2], chase, slot * 97 + j, 0];
}

/** A spot's flight from rest a to rest b: an orbit round the ball. */
function flight(out, a, b, p, hour, alpha, now, slot, j) {
  if (p <= 0) { a[6] *= alpha; out.push(a); return; }
  if (p >= 1) { b[6] *= alpha; out.push(b); return; }
  const turns = 1, wide = hour ? 7 : 3;
  const t0 = Math.atan2(a[1] - BY, a[0] - BX), r0 = Math.hypot(a[0] - BX, a[1] - BY);
  let t1 = Math.atan2(b[1] - BY, b[0] - BX); const r1 = Math.hypot(b[0] - BX, b[1] - BY);
  while (t1 < t0) t1 += kit.TAU;
  t1 += kit.TAU * (turns - 1) + (t1 - t0 > Math.PI ? 0 : kit.TAU);  // at least ~one full turn, clockwise on screen
  if (t1 - t0 > kit.TAU * turns + Math.PI) t1 -= kit.TAU;
  const bulge = Math.sin(Math.PI * p);
  const col = hour ? kit.mix([a[3], a[4], a[5]], kit.hsv(kit.fract(j / 9 + now * 0.6)), 0.75 * bulge) : [a[3], a[4], a[5]];
  for (let k = 0; k < 3; k++) {                              // the spot and a short motion trail
    const q = Math.max(0, p - k * 0.018);
    const bq = Math.sin(Math.PI * q);
    const th = kit.lerp(t0, t1, q), rr = kit.lerp(r0, r1, q) + wide * bq;
    const x = BX + rr * Math.cos(th), y = (BY + 9 * bq) + rr * Math.sin(th) * (1 - 0.38 * bq);
    const r = kit.lerp(a[2], b[2], q) * (1 - 0.25 * bq);
    const aa = kit.lerp(a[6], b[6], q) * alpha * (k === 0 ? 1 : 0.4 / k) * (1 + 0.3 * bq);
    out.push([x, y, r, col[0], col[1], col[2], aa, -1, 0]);
  }
}

/** Occasional star glint on a digit spot: brief, hash-timed. */
function sparkle(seed, now) {
  if (seed < 0) return 0;
  const per = 7, t = now / per + kit.hash(seed, 7);
  const cyc = Math.floor(t), f = t - cyc;
  if (kit.hash(seed, cyc) > 0.35) return 0;
  const x = f * per;                                         // seconds into this cycle
  return x < 0.5 ? Math.sin(Math.PI * x / 0.5) ** 2 : 0;
}

// --------------------------------------------------------------- the floor
const TILE_COLS = [kit.hex('#8d5bff'), kit.hex('#ff4f8f'), kit.hex('#ffb648')];
function drawFloor(beat, show, now, dim) {
  const bi = Math.floor(beat), bf = beat - bi;
  const pulse = Math.exp(-bf * 3.2);
  for (let py = Math.ceil(HORIZON); py < H; py++) {
    const d = F * FY / (py - BY);                          // distance from camera
    const z = ZC - d, pw = d / F;                          // world size of one pixel
    for (let px = 0; px < W; px++) {
      const x = (px - BX) * pw;
      const u = x / 1.4 + 0.5, v = (z + DZ) / 1.4;
      const tu = Math.floor(u), tv = Math.floor(v);
      const fu = u - tu, fv = v - tv;
      // grout: dark lines between tiles, anti-aliased by the pixel's footprint
      const e = Math.min(fu, 1 - fu, fv, 1 - fv) * 1.4 / pw;
      const tile = kit.smoothstep(0.15, 0.9, e);
      // which tiles fire on this beat: a diagonal checker that walks
      const on = ((tu + tv + bi) & 1) === 0 ? 1 : 0;
      const ci = (((tu * 7 + tv * 3 + (bi >> 1)) % 3) + 3) % 3;
      let c = TILE_COLS[ci];
      if (show > 0) c = kit.mix(c, kit.hsv(kit.fract(tu * 0.09 + tv * 0.05 - now * 0.7), 1, 1), show);
      const glow = (0.015 + (0.07 + 0.12 * show) * on * (0.35 + 0.65 * pulse)) * tile * dim;
      const fade = kit.smoothstep(HORIZON - 0.5, HORIZON + 3, py);
      const p = 3 * (py * W + px);
      img[p] += c[0] * glow * fade; img[p + 1] += c[1] * glow * fade; img[p + 2] += c[2] * glow * fade;
    }
  }
}

// ---------------------------------------------------------------- the ball
function facetNormal(b, l, phi, out) {
  let latc = ((b + 0.5) / NB - 0.5) * Math.PI; let lonc = ((l + 0.5) / bandN[b]) * kit.TAU - phi;
  const f = bandOff[b] + l;
  latc += JIT[2 * f]; lonc += JIT[2 * f + 1];          // mirror tiles are never quite flush
  const cl = Math.cos(latc);
  out[0] = cl * Math.sin(lonc); out[1] = Math.sin(latc); out[2] = cl * Math.cos(lonc);
  return out;
}
const nTmp = [0, 0, 0];
function shadeFacets(phi, show, now) {
  for (let b = 0; b < NB; b++) for (let l = 0; l < bandN[b]; l++) {
    const f = bandOff[b] + l, n = facetNormal(b, l, phi, nTmp);
    // what the camera sees in this mirror: reflect the view ray (0,0,-1)
    const rx = 2 * n[2] * n[0], ry = 2 * n[2] * n[1], rz = 2 * n[2] * n[2] - 1;
    let cr = 0, cg = 0, cb = 0, sp = 0;
    for (const Lk of LIGHTS) {
      const dd = rx * Lk.d[0] + ry * Lk.d[1] + rz * Lk.d[2];
      if (dd > 0) { const s = dd ** 40 * Lk.k * 2.5; cr += Lk.c[0] * s; cg += Lk.c[1] * s; cb += Lk.c[2] * s; sp += s; }
    }
    // the room seen in the facet: dim, with a little of the floor's colour below
    const h = kit.hash(b, l);
    const base = 0.015 + 0.4 * h * h * h * h + 0.04 * Math.max(0, -ry);
    let tr = base * 0.85, tg = base * 0.85, tb = base * 1.1;
    if (ry > 0.3) { tr += 0.03 * ry; tb += 0.05 * ry; }
    if (show > 0) {
      const c = kit.hsv(kit.fract(b / NB + l / bandN[b] + now * 0.4));
      tr += c[0] * 0.12 * show; tg += c[1] * 0.12 * show; tb += c[2] * 0.12 * show;
    }
    facetLum[3 * f] = tr + cr; facetLum[3 * f + 1] = tg + cg; facetLum[3 * f + 2] = tb + cb;
    facetSpec[f] = sp;
  }
}

const SS = [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]];
function drawBall(phi, show, now, dim) {
  // the chain it hangs from
  for (let y = 0; y < BY - BR + 0.5; y++) { const p = 3 * (y * W + BX); img[p] = img[p + 1] = img[p + 2] = 0.05 * dim; }
  const x0 = Math.floor(BX - BR - 1), x1 = Math.ceil(BX + BR + 1), y0 = Math.max(0, Math.floor(BY - BR - 1)), y1 = Math.ceil(BY + BR + 1);
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    let cr = 0, cg = 0, cb = 0, cov = 0;
    for (const [ox, oy] of SS) {
      const sx = (px + ox - BX) / BR, sy = (py + oy - BY) / BR, r2 = sx * sx + sy * sy;
      if (r2 >= 1) continue;
      const sz = Math.sqrt(1 - r2);
      const bandF = (Math.asin(sy) / Math.PI + 0.5) * NB;
      const b = Math.min(NB - 1, Math.floor(bandF));
      const nL = bandN[b];
      const lonF = kit.fract((Math.atan2(sx, sz) + phi) / kit.TAU) * nL;
      const l = Math.floor(lonF) % nL;
      const fb = bandF - b, fl = lonF - Math.floor(lonF);
      const e = Math.min(fb, 1 - fb, fl, 1 - fl);
      const grout = 0.5 + 0.5 * kit.smoothstep(0.02, 0.16, e);
      const f = 3 * (bandOff[b] + l);
      const limb = 0.55 + 0.45 * sz;
      cr += facetLum[f] * grout * limb; cg += facetLum[f + 1] * grout * limb; cb += facetLum[f + 2] * grout * limb;
      cov++;
    }
    if (!cov) continue;
    const a = cov / 4, p = 3 * (py * W + px);
    img[p] += (cr / cov * dim - img[p]) * a; img[p + 1] += (cg / cov * dim - img[p + 1]) * a; img[p + 2] += (cb / cov * dim - img[p + 2]) * a;
  }
  // glints: the brightest facets flare into little stars
  for (let b = 0; b < NB; b++) for (let l = 0; l < bandN[b]; l++) {
    const f = bandOff[b] + l, s = facetSpec[f];
    if (s < 0.3) continue;
    const n = facetNormal(b, l, phi, nTmp);
    if (n[2] < 0.15) continue;
    const g = kit.smoothstep(0.3, 1.0, s);
    star(BX + BR * n[0] * 0.97, BY + BR * n[1] * 0.97, 1 + Math.round(3 * g), 1, 0.97, 1, g * 0.9 * dim);
  }
}

// ------------------------------------------------------- the reflections
// Each lit facet reflects each pin spot into the room. Trace the ray from
// the ball, find where it lands on the back wall or the floor, project it.
function drawReflections(phi, show, now, dim, beat, live) {
  const n = nTmp;
  for (let b = 0; b < NB; b++) for (let l = 0; l < bandN[b]; l++) {
    facetNormal(b, l, phi, n);
    for (let k = 0; k < LIGHTS.length; k++) {
      const Lk = LIGHTS[k];
      const ix = -Lk.d[0], iy = -Lk.d[1], iz = -Lk.d[2];            // light travelling toward the ball
      const dn = ix * n[0] + iy * n[1] + iz * n[2];
      if (dn > -0.05) continue;                                      // facet not lit
      const rx = ix - 2 * dn * n[0], ry = iy - 2 * dn * n[1], rz = iz - 2 * dn * n[2];
      // back wall z = -DZ, floor y = FY
      let t = Infinity, floor = false;
      if (rz < -1e-3) t = DZ / -rz;
      if (ry > 1e-3 && FY / ry < t) { t = FY / ry; floor = true; }
      if (t === Infinity) continue;
      const wx = rx * t, wy = ry * t, wz = rz * t;
      if (Math.abs(wx) > 7.5) continue;                              // side walls: out of view
      const dcam = ZC - wz;
      if (dcam < 2) continue;
      const sx = BX + F * wx / dcam, sy = BY + F * wy / dcam;
      if (sx < -2 || sx > W + 1 || sy < -2 || sy > H + 1) continue;
      if (!floor && sy > HORIZON + 0.5) continue;
      // hidden behind the ball
      if ((sx - BX) ** 2 + (sy - BY) ** 2 < BR * BR) continue;
      const q = (Math.round(Math.min(H - 1, Math.max(0, sy))) * W + Math.round(Math.min(W - 1, Math.max(0, sx))));
      const m = 1 - mask[q];
      const edge = kit.smoothstep(0.05, 0.3, -dn);                   // spots bloom in and out as facets turn
      const tw = 0.75 + 0.25 * Math.sin(now * 7 + b * 3.1 + l * 1.7);
      // a reflection sweeping into a numeral is caught by it: that spot flares
      if (owner[q] >= 0) live[owner[q]][8] += (1 - m) * edge * Lk.k;
      if (m <= 0.02) continue;
      let a = 0.5 * Lk.k * edge * tw * m * dim * (floor ? 1.15 : 1);
      let c = Lk.c;
      if (show > 0) { c = kit.mix(c, kit.hsv(kit.fract(sx / 70 + sy / 140 - now * 0.5)), show); a *= 1 + 0.8 * show; }
      const r = (floor ? 0.62 : 0.5) * 14 / dcam;
      dot(sx, sy, r, c[0], c[1], c[2], a);
    }
  }
}

