// Ferris Wheel: the eight panels round their empty middle are the frame of
// a fairground at dusk, and a big wheel turns round the hole. Its hub is
// hidden in the night (the missing panel): the spokes reach into the dark
// and their chasing lights run in and vanish.
//   The time rides the wheel. Six gondolas hang from the rim, always
//   upright, swinging. The one at the crown carries the hour, the one at the
//   loading deck carries the minutes, spelled in marquee bulbs on their
//   sign boards.
//   Minute: the wheel lets the riders off and steps round one gondola,
//   every gondola swinging on its pivot from the lurch. The old minute's
//   bulbs go out one by one, glowing red as the filaments cool; the next
//   gondola swings down onto the deck and its bulbs warm up in a chase
//   along the strokes. The crown hands the hour on the same way. The
//   queue shuffles forward, two people board, the last riders walk off.
//   Hour: the leaving gondola takes the old hour away dark; a rocket climbs
//   out of the hole and bursts over the crown, and its falling sparks land
//   on the new gondola's board one by one, each lighting a bulb of the new
//   hour. Then the sky behind the wheel fills with fireworks and the crowd
//   cheers.
// Look: smoked acrylic. The black GOB face under smoke is the night itself,
// so only the lights of the fair exist; bulbs glow out of nothing.
import * as kit from '../js/kit.js';
import { W, H, glow } from './ferriswheel-paint.js';
import { BULBS } from './ferriswheel-glyphs.js';
import { CX, CY, R, RI, FLOOR, PAL, buildBackground, personLook, person } from './ferriswheel-scene.js';

const clamp = kit.clamp, smooth = kit.smoothstep, TAU = Math.PI * 2;
const NC = 6, STEP = TAU / NC;
const T0 = 0.25, TD = 2.3;                 // the wheel's step: starts 0.25 s into the minute, lasts 2.3 s
const img = new Float32Array(3 * W * H);
let BG = null;

// ------------------------------------------------------------ gondolas
// Sprites in local coordinates: origin at the pivot, y down the hanger.
const SW = 50, SH = 50, OX = 25, OY = 1;
const PAINTS = ['#d8343c', '#1e9c94', '#7a48c8', '#2f6fd0', '#3aa055', '#d0408c', '#e07a20', '#2a8ad0'];
const backs = [], fronts = [], boardMask = new Float32Array(SW * SH);
const work = new Float32Array(4 * SW * SH);

function sdBox(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r, qy = Math.abs(py - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
function sdSeg(px, py, ax, ay, bx, by) { return kit.segDist(px, py, ax, ay, bx, by); }
/** Paint coverage `a` of colour c over premultiplied RGBA sprite pixel p. */
function sOver(spr, p, c, a) {
  if (a <= 0) return;
  spr[p] = spr[p] * (1 - a) + c[0] * a; spr[p + 1] = spr[p + 1] * (1 - a) + c[1] * a;
  spr[p + 2] = spr[p + 2] * (1 - a) + c[2] * a; spr[p + 3] = spr[p + 3] * (1 - a) + a;
}
const cov = (d) => clamp(0.5 - d);

function buildCabins() {
  const steel = PAL.steelHi, cream = kit.scale(kit.hex('#ffe6bf'), 0.3);
  for (let k = 0; k < NC; k++) {
    const paint = kit.scale(kit.hex(PAINTS[k]), 0.11), paintHi = kit.scale(kit.hex(PAINTS[k]), 0.8), paintLo = kit.scale(kit.hex(PAINTS[k]), 0.03);
    const back = new Float32Array(4 * SW * SH), front = new Float32Array(4 * SW * SH);
    for (let j = 0; j < SH; j++) for (let i = 0; i < SW; i++) {
      const u = i + 0.5 - OX, v = j + 0.5 - OY, p = 4 * (j * SW + i);
      // hanger yoke and pivot bolt
      sOver(back, p, steel, cov(sdSeg(u, v, 0, 0, -11, 3.2) - 0.55));
      sOver(back, p, steel, cov(sdSeg(u, v, 0, 0, 11, 3.2) - 0.55));
      // canopy posts
      sOver(back, p, steel, cov(sdSeg(u, v, -20.5, 6, -20.5, 18) - 0.5));
      sOver(back, p, steel, cov(sdSeg(u, v, 20.5, 6, 20.5, 18) - 0.5));
      // under-canopy lamp light (lights the riders)
      const lamp = Math.exp(-((u / 15) ** 2) - (((v - 13) / 4) ** 2));
      sOver(back, p, [0.05, 0.03, 0.012], 0.8 * lamp * (v > 7 && v < 18 ? 1 : 0));
      // striped canopy with scalloped valance
      const roof = sdBox(u, v, 0, 4.6, 23, 2.0, 1.4);
      const stripe = Math.floor((u + 23) / 5.75) & 1;
      sOver(back, p, stripe ? cream : paint, cov(roof));
      const sx = ((u + 23) % 5.75 + 5.75) % 5.75 - 2.875;
      if (Math.abs(u) < 23) sOver(back, p, stripe ? cream : paint, cov(Math.hypot(sx, v - 6.6) - 1.9) * (v > 6.4 ? 1 : 0));
      sOver(back, p, paintHi, cov(sdSeg(u, v, -2.5, 2.2, 2.5, 2.2) - 0.6));      // roof finial
      // tub: painted shell, lighter lip, dark sign board (the time's moat)
      const tub = Math.max(sdBox(u, v, 0, 32.5, 23, 15.3, 4.5), Math.hypot((u) / 1.0, Math.max(0, v - 22) * 1.35) - 31);
      const shade = kit.mix(paint, paintLo, clamp((v - 18) / 30)) ;
      sOver(front, p, shade, cov(tub));
      sOver(front, p, paintHi, cov(Math.abs(tub + 0.6) - 0.6));               // piped edge
      sOver(front, p, kit.scale(paintHi, 0.45), cov(Math.abs(v - 25) - 0.5) * cov(tub + 1.5));   // rail
      const rv = ((u + 23) % 4 + 4) % 4 - 2;
      sOver(front, p, kit.scale(paintHi, 0.5), cov(Math.hypot(rv, v - 43) - 0.7) * cov(tub + 2));  // rivets
      sOver(front, p, paintHi, cov(sdBox(u, v, 0, 17.8, 23, 1.0, 1)));
      // the sign plaque only exists while its bulbs are lit (a dark moat behind them)
      if (k === 0) boardMask[j * SW + i] = cov(sdBox(u, v, 0, 33.4, 20.2, 13.6, 3));
    }
    backs.push(back); fronts.push(front);
  }
}

/** Riders' heads poke over the tub lip; `sink` 0..1 hides one below it. */
function drawRiders(spr, riders, wave, now) {
  for (let r = 0; r < riders.length; r++) {
    const rd = riders[r];
    if (rd.sink >= 1) continue;
    const hx = rd.x + 0.7 * Math.sin(now * 0.6 + r * 2.4 + rd.look.tall), hy = 12.4 + rd.sink * 8 - 0.4 * Math.max(0, Math.sin(now * 1.3 + r * 1.7 + rd.look.tall * 3)) + (rd.look.kid ? 1.2 : 0);
    const j0 = Math.max(0, Math.floor(hy - 6 + OY)), j1 = Math.min(SH - 1, Math.ceil(hy + 4 + OY));
    const i0 = Math.max(0, Math.floor(hx - 5 + OX)), i1 = Math.min(SW - 1, Math.ceil(hx + 5 + OX));
    const armUp = wave * (0.5 + 0.5 * Math.sin(now * 9 + r * 2));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const u = i + 0.5 - OX, v = j + 0.5 - OY, p = 4 * (j * SW + i);
      sOver(spr, p, rd.look.shirt, cov(sdBox(u, v, hx, hy + 4.2, 2.6, 1.8, 1)));
      sOver(spr, p, rd.look.skin, cov(Math.hypot(u - hx, v - hy) - 2.8));
      sOver(spr, p, rd.look.hair, cov(Math.hypot(u - hx, v - hy + 0.9) - 2.8) * (v < hy - 0.8 ? 1 : 0));
      if (wave > 0.02) {
        const ax = hx + (r ? -3.2 : 3.2), ay = hy + 3;
        sOver(spr, p, rd.look.shirt, cov(sdSeg(u, v, ax, ay, ax + (r ? -1.5 : 1.5), ay - 3 - 3.5 * armUp) - 0.6));
      }
    }
  }
}

/** Composite sprite spr, turned by phi about the pivot (px, py), over img. */
function blitCabin(spr, px, py, phi) {
  const c = Math.cos(phi), s = Math.sin(phi);
  const ext = 40;
  const x0 = Math.max(0, Math.floor(px - ext)), x1 = Math.min(W - 1, Math.ceil(px + ext));
  const y0 = Math.max(0, Math.floor(py - 6)), y1 = Math.min(H - 1, Math.ceil(py + SH + 2));
  for (let y = y0; y <= y1; y++) {
    const wy = y + 0.5 - py;
    for (let x = x0; x <= x1; x++) {
      const wx = x + 0.5 - px;
      const u = wx * c - wy * s + OX - 0.5, v = wx * s + wy * c + OY - 0.5;
      if (u < -1 || v < -1 || u >= SW || v >= SH) continue;
      const iu = Math.floor(u), iv = Math.floor(v), fu = u - iu, fv = v - iv;
      let r = 0, g = 0, b = 0, a = 0;
      for (let q = 0; q < 4; q++) {
        const ii = iu + (q & 1), jj = iv + (q >> 1);
        if (ii < 0 || jj < 0 || ii >= SW || jj >= SH) continue;
        const wgt = (q & 1 ? fu : 1 - fu) * (q >> 1 ? fv : 1 - fv), p = 4 * (jj * SW + ii);
        r += spr[p] * wgt; g += spr[p + 1] * wgt; b += spr[p + 2] * wgt; a += spr[p + 3] * wgt;
      }
      if (a <= 0.002) continue;
      const o = 3 * (y * W + x);
      img[o] = img[o] * (1 - a) + r; img[o + 1] = img[o + 1] * (1 - a) + g; img[o + 2] = img[o + 2] * (1 - a) + b;
    }
  }
}

// --------------------------------------------------------------- bulbs
// Filament colour by how lit it is: deep red when barely glowing, warm
// gold-white when full (a bulb warming up or cooling down).
const FIL = [];
for (let i = 0; i <= 64; i++) {
  const l = i / 64, K = 1000 + 1750 * Math.sqrt(l), c = kit.blackbody(K);
  FIL.push(kit.mix(c, [1, 0.86, 0.62], 0.35 * l * l));
}
const filament = (l) => FIL[Math.round(clamp(l) * 64)];

// The two digits of a board, laid out once: [{ x, y, o }] in local coordinates.
const BX0 = -17.3, BX1 = 1.3, BY = 20.4;
const pairCache = new Map();
function boardBulbs(str) {
  let b = pairCache.get(str);
  if (b) return b;
  const a = BULBS[+str[0]], c = BULBS[+str[1]];
  const n = a.length + c.length;
  b = [];
  a.forEach((q, i) => b.push({ x: BX0 + q.x, y: BY + q.y, o: i / Math.max(1, a.length - 1), h: kit.hash(i, +str[0], 3), l: 0 }));
  c.forEach((q, i) => b.push({ x: BX1 + q.x, y: BY + q.y, o: i / Math.max(1, c.length - 1), h: kit.hash(i, +str[1], 5), l: 0 }));
  pairCache.set(str, b);
  return b;
}

// --------------------------------------------------------------- swing
// Each gondola is a damped pendulum hung from a pivot that the wheel
// accelerates during its step; integrated from the start of the minute
// (the last step's swing has died away by then), so frame() stays pure.
const W0 = TAU / 1.75, ZETA = 0.11, GL = W0 * W0;   // g / l
const phis = new Float64Array(NC), phid = new Float64Array(NC);
function wheelProgress(s) {
  const u = clamp((s - T0) / TD);
  return { e: (1 - Math.cos(Math.PI * u)) / 2, w: u > 0 && u < 1 ? (Math.PI / 2) * Math.sin(Math.PI * u) / TD : 0, al: u > 0 && u < 1 ? (Math.PI * Math.PI / 2) * Math.cos(Math.PI * u) / (TD * TD) : 0 };
}
function swing(s, nm) {
  phis.fill(0); phid.fill(0);
  const end = Math.min(s, 24), dt = 1 / 120;
  for (let t = T0; t < end; t += dt) {
    const { e, w, al } = wheelProgress(t);
    const om = w * STEP, alp = al * STEP;
    for (let k = 0; k < NC; k++) {
      const th = -Math.PI / 2 + (k + nm + e) * STEP, cs = Math.cos(th), sn = Math.sin(th);
      const ax = R * (-sn * alp - cs * om * om), ay = R * (cs * alp - sn * om * om);
      const f = phis[k], acc = -GL * Math.sin(f) - (1 / 70) * (ax * Math.cos(f) - ay * Math.sin(f)) - 2 * ZETA * W0 * phid[k];
      phid[k] += acc * dt; phis[k] += phid[k] * dt;
    }
  }
}

// ----------------------------------------------------------- fireworks
const FW_COL = [kit.hex('#ffcf6a'), kit.hex('#ff4f8f'), kit.hex('#3fe8d8'), kit.hex('#fff2dc')];
const SHOW = [
  { t: 2.3, x: 34, y: 34, c: 1 }, { t: 2.8, x: 160, y: 30, c: 2 }, { t: 3.4, x: 24, y: 100, c: 0 },
  { t: 3.9, x: 170, y: 96, c: 1 }, { t: 4.4, x: 60, y: 16, c: 3 }, { t: 4.9, x: 134, y: 14, c: 0 },
  { t: 5.5, x: 30, y: 60, c: 2 }, { t: 6.0, x: 164, y: 62, c: 1 }, { t: 6.6, x: 96, y: 22, c: 0 },
  { t: 7.2, x: 46, y: 130, c: 2 }, { t: 7.6, x: 148, y: 128, c: 3 }, { t: 8.3, x: 96, y: 10, c: 1 },
];
const CROWN = { x: 96, y: 6, tb: 1.05 };      // the burst that lights the hour
function burst(bx, by, tb, col, s, nSp, speed, seed, life = 1.9) {
  const tau = s - tb;
  if (tau < 0 || tau > life) return;
  for (let i = 0; i < nSp; i++) {
    const ang = (i / nSp) * TAU + kit.hash(i, seed) * 0.3, v = speed * (0.55 + 0.45 * kit.hash(i, seed, 2));
    for (let tr = 0; tr < 4; tr++) {
      const tt = tau - tr * 0.05;
      if (tt < 0) continue;
      const d = (v / 1.7) * (1 - Math.exp(-1.7 * tt));
      const x = bx + Math.cos(ang) * d, y = by + Math.sin(ang) * d + 9 * tt * tt;
      const fade = (1 - tt / life) ** 1.6, tw = tt > life * 0.55 ? 0.5 + 0.5 * Math.sin(tt * 40 + i * 3) : 1;
      const cc = tt < 0.12 ? [1, 0.95, 0.85] : kit.mix(col, [1, 0.45, 0.12], clamp(tt / life));
      glow(img, x, y, 1.5, cc, (tr ? 0.6 / tr : 1.6) * fade * tw, 0.16);
    }
  }
  if (tau < 0.3) glow(img, bx, by, 5 + tau * 40, [1, 0.9, 0.7], 0.35 * (1 - tau / 0.3), 0.25);
}
function rocket(bx, by, tb, s, seed) {
  const tl = tb - 0.75;
  if (s < tl || s > tb) return;
  const u = (s - tl) / 0.75, x0 = 96 + (kit.hash(seed, 9) - 0.5) * 50, y0 = 64;   // out of the hole
  for (let tr = 0; tr < 6; tr++) {
    const uu = u - tr * 0.03;
    if (uu < 0) continue;
    const k = 1 - (1 - uu) ** 2;
    glow(img, kit.lerp(x0, bx, uu), kit.lerp(y0, by, k), 0.9, [1, 0.7, 0.35], (tr ? 0.25 : 0.8) * (1 - tr / 6), 0.1);
  }
}

// ---------------------------------------------------------------- time
const pad = (n) => String(n).padStart(2, '0');
const mod = (a, m) => ((a % m) + m) % m;
const onAt = (s, start) => smooth(0, 0.16, s - start);           // a bulb warming up from `start`
const offAt = (s, start) => 1 - smooth(0, 0.3, s - start);        // and cooling down

function riderSet(k, n, s) {
  // riders of gondola k: changed when it is at the deck
  const dn = mod(k + n + 1 - NC / 2, NC), nd = n - dn;
  const out = [];
  const mk = (seed, sink) => {
    const cnt = 2;
    for (let r = 0; r < cnt; r++) out.push({ x: cnt === 1 ? 0 : r ? 8 : -8, look: personLook(seed * 2 + r), sink: sink(r) });
  };
  if (dn !== 0) mk(nd, () => 0);
  else if (s < 4.2) mk(nd - NC, (r) => smooth(3.4 + r * 0.25, 3.9 + r * 0.25, s));
  else mk(nd, (r) => 1 - smooth(6.0 + r * 0.4, 6.5 + r * 0.4, s));
  return out;
}

let cabinsBuilt = false;
const HOUR_ON = 1.3;                       // the hour's sparks start landing
/** Level 0..1 of bulb b on a board in `mode` at s seconds into the minute. */
function bulbLevel(mode, b, s) {
  switch (mode) {
    case 1: return onAt(s, 1.25 + b.o * 0.8);                   // new minute warms up as it reaches the deck
    case 2: return offAt(s, 0.45 + b.o * 0.55);                 // the leaving minute cools as it goes
    case 3: return offAt(s, 0.5 + b.o * 0.6);                   // same hour handed on: the old board cools as it leaves...
    case 4: return onAt(s, 1.25 + b.o * 0.7);                    // ...as the next one warms up arriving at the crown
    case 6: return offAt(s, 0.35 + b.o * 0.5);                  // the hour: the old hour goes dark at once
    case 5: return onAt(s, HOUR_ON + (0.75 * b.o + 0.25 * b.h) * 0.9);   // lit by falling sparks
  }
  return 0;
}

export default {
  name: 'Ferris Wheel',
  blurb: 'a fairground wheel turns round the hole; the gondolas at the crown and the deck carry the hour and minute in marquee bulbs, fireworks light the new hour',
  layouts: ['hub-ring'], look: 'smoke', fps: 60, brightness: 0.5, dither: true,
  frame(ctx) {
    const G = kit.grid(ctx);
    if (!BG) BG = buildBackground();
    if (!cabinsBuilt) { buildCabins(); cabinsBuilt = true; }
    const d = ctx.date, now = d.getTime() / 1000;
    const n = Math.floor(now / 60), s = now - n * 60, nm = mod(n, NC);
    const prev = new Date((n - 1) * 60000);
    const hNow = pad(d.getHours()), mNow = pad(d.getMinutes()), hPrev = pad(prev.getHours()), mPrev = pad(prev.getMinutes());
    const hourTurn = hNow !== hPrev;
    const showS = hourTurn ? s : 1e9;                // seconds into the hour's show
    img.set(BG);

    // stars, twinkling in the high sky
    for (let i = 0; i < 70; i++) {
      const x = kit.hash(i, 1) * W, y = kit.hash(i, 2) * 120;
      if (y > 130) continue;
      const tw = 0.5 + 0.5 * Math.sin(now * (0.7 + kit.hash(i, 3) * 1.6) + i * 2.1);
      const b = (0.03 + 0.08 * kit.hash(i, 4)) * (0.4 + 0.6 * tw) * (1 - y / 140);
      glow(img, x, y, 0.8, [0.8, 0.85, 1], b, 0);
    }

    // fireworks behind the wheel (hour only)
    if (showS < 12.5) {
      rocket(CROWN.x, CROWN.y, CROWN.tb, showS, 99);
      burst(CROWN.x, CROWN.y, CROWN.tb, FW_COL[0], showS, 44, 60, 7, 1.6);
      SHOW.forEach((f, i) => { rocket(f.x, f.y, f.t, showS, i); burst(f.x, f.y, f.t, FW_COL[f.c], showS, 80, 110 + 40 * kit.hash(i, 5), i + 11, 2.6); });
    }

    // ------------------------------------------------------ the wheel
    const wp = wheelProgress(s), wang = (nm + wp.e) * STEP;     // wheel turn
    const showLights = showS < 10 ? smooth(1.4, 2.2, showS) * (1 - smooth(8, 10, showS)) : 0;
    const steel = PAL.steel, steelHi = PAL.steelHi, idx = G.idx;
    const RO2 = (R + 2.6) ** 2;
    const ROSE = PAL.rose, TEAL = PAL.teal;
    const chase = now * 0.55, spokeRun = now * 0.32;
    for (let y = CY - R - 3; y <= CY + R + 3; y++) {
      if (y < 0 || y >= H) continue;
      const dy = y + 0.5 - CY;
      for (let x = CX - R - 3; x <= CX + R + 3; x++) {
        const gi = y * W + x;
        if (idx[gi] < 0) continue;
        const dx = x + 0.5 - CX, r2 = dx * dx + dy * dy;
        if (r2 > RO2) continue;
        const r = Math.sqrt(r2);
        let a = Math.atan2(dy, dx) - wang;
        a -= Math.floor(a / TAU) * TAU;
        // steel: outer rim, inner rim, the truss between, spokes
        let c = clamp(1.6 - Math.abs(r - R)), hi = c;
        c = Math.max(c, clamp(1.05 - Math.abs(r - RI)));
        if (r > RI && r < R) {
          const cell = (a * 96) / TAU, u = cell - Math.floor(cell), rt = RI + (R - RI) * Math.abs(2 * u - 1);
          c = Math.max(c, 0.75 * clamp(0.95 - Math.abs(r - rt) / 2.4));
        }
        const sa = (a * 16) / TAU, sk = Math.round(sa), arcd = Math.abs(sa - sk) * (TAU / 16) * r;
        if (r < RI + 0.5) c = Math.max(c, clamp(1.0 - arcd) * smooth(4, 30, r));
        const p = 3 * gi;
        if (c > 0) {
          const sc = hi > 0.3 ? steelHi : steel;
          img[p] += (sc[0] - img[p]) * c; img[p + 1] += (sc[1] - img[p + 1]) * c; img[p + 2] += (sc[2] - img[p + 2]) * c;
        }
        // rim bulbs: 36, rose and teal, a slow chase round the rim
        const ba = (a * 48) / TAU, bk = Math.round(ba), bd = (ba - bk) * (TAU / 48) * R, rr = r - R;
        const d2 = bd * bd + rr * rr;
        if (d2 < 6) {
          const kk = mod(bk, 48), ph = kk / 8 - chase;
          let lv = 0.25 + 0.75 * (0.5 + 0.5 * Math.cos(TAU * ph)) ** 4;
          lv = kit.lerp(lv, 0.4 + 0.6 * (0.5 + 0.5 * Math.cos(TAU * (kk / 48 * 4 - now * 2))), showLights);
          const col = kk & 1 ? TEAL : ROSE, w = (1 - d2 / 6) ** 2 * lv * 2.6;
          img[p] += col[0] * w; img[p + 1] += col[1] * w; img[p + 2] += col[2] * w;
        }
        // spoke lights run inward and vanish into the hole
        if (r < RI - 1 && arcd < 1.4) {
          const v = (RI - r) / RI * 3 - spokeRun - mod(sk, 16) * 0.25, vd = Math.abs(v - Math.round(v)) * RI / 3;
          const dd = vd * vd + arcd * arcd;
          if (dd < 2) {
            const w = (1 - dd / 2) ** 2 * 0.6 * smooth(10, 40, r) * (1 + showLights);
            img[p] += TEAL[0] * w * 0.6 + ROSE[0] * w * 0.4; img[p + 1] += TEAL[1] * w * 0.6 + ROSE[1] * w * 0.4; img[p + 2] += TEAL[2] * w * 0.6 + ROSE[2] * w * 0.4;
          }
        }
      }
    }

    // --------------------------------------------------- gondolas
    swing(s, nm);
    const kTop = mod(-n - 1, NC), kTopOld = mod(-n, NC), kBot = mod(NC / 2 - 1 - n, NC), kBotOld = mod(NC / 2 - n, NC);
    const cheer = showS < 12 ? smooth(1.9, 2.6, showS) * (1 - smooth(9, 11, showS)) : 0;
    const sparks = [];
    for (let k = 0; k < NC; k++) {
      const th = -Math.PI / 2 + (k + nm + wp.e) * STEP;
      const px = CX + R * Math.cos(th), py = CY + R * Math.sin(th);
      const phi = phis[k] + 0.022 * Math.sin(now * 0.83 + k * 1.7) + 0.012 * Math.sin(now * 2.1 + k * 0.9);
      // what its sign board says, and how lit each bulb is
      let str = null, mode = 0;
      if (k === kBot) { str = mNow; mode = 1; }
      else if (k === kBotOld) { str = mPrev; mode = 2; }
      else if (k === kTopOld) { str = hPrev; mode = hourTurn ? 6 : 3; }
      else if (k === kTop) { str = hNow; mode = hourTurn ? 5 : 4; }
      const bl = str ? boardBulbs(str) : null;
      let lit = 0;
      if (bl) for (const b of bl) { b.l = bulbLevel(mode, b, s); if (b.l > lit) lit = b.l; }
      work.set(backs[k]);
      drawRiders(work, riderSet(k, n, s), cheer, now);
      const fr = fronts[k], dark = 0.94 * smooth(0, 0.35, lit);
      for (let q = 0, m = 0; q < work.length; q += 4, m++) {
        const a = fr[q + 3];
        if (a <= 0) continue;
        const f = 1 - dark * boardMask[m];
        work[q] = work[q] * (1 - a) + fr[q] * f; work[q + 1] = work[q + 1] * (1 - a) + fr[q + 1] * f;
        work[q + 2] = work[q + 2] * (1 - a) + fr[q + 2] * f; work[q + 3] = work[q + 3] * (1 - a) + a;
      }
      blitCabin(work, px, py, phi);
      const cs = Math.cos(phi), sn = Math.sin(phi);
      for (let q = 0; q < 7; q++) {                                 // the canopy's own little lamps
        const lx = -18 + q * 6, ly = 6.8, lv = 0.3 + 0.7 * (0.5 + 0.5 * Math.cos(TAU * (q / 7 - now * 0.9 + k * 0.3))) ** 3;
        glow(img, px + lx * cs + ly * sn, py - lx * sn + ly * cs, 0.9, PAL.amber, 0.5 * lv, 0.1);
      }
      if (!bl) continue;
      for (const b of bl) {
        const wx = px + b.x * cs + b.y * sn, wy = py - b.x * sn + b.y * cs;
        if (mode === 5) {
          const tLand = HOUR_ON + (0.75 * b.o + 0.25 * b.h) * 0.9;
          if (s > CROWN.tb && s < tLand) sparks.push(wx, wy, tLand, b.h);
        }
        const l = b.l;
        // a dark socket for every bulb, so the board reads as a marquee even unlit
        if (l < 0.5) glow(img, wx, wy, 1.0, [0.05, 0.035, 0.02], 0.5 - l, 0);
        if (l <= 0.004) continue;
        const flick = 0.97 + 0.03 * Math.sin(now * 23 + b.h * 40);
        glow(img, wx, wy, 1.45, filament(l), 1.5 * l * flick, 0.14);
      }
    }

    // ------------------------------------------------- people
    const wq = smooth(3.8, 6.0, s), cheerQ = cheer;
    for (let j = 0; j <= 5; j++) {
      const pid = 2 * n + j, look = personLook(pid);
      const jf = j - 2 * wq;
      let x, a = 1;
      if (jf >= 0) x = 62 - 7.5 * jf;
      else { x = 62 + -jf * 14; a = 1 - smooth(-0.6, -1.0, jf); }
      const moving = wq > 0 && wq < 1;
      const stride = moving ? Math.sin(jf * Math.PI * 2.2) : 0;
      const sway = 0.25 * Math.sin(now * 1.1 + pid * 1.3);
      person(img, x + sway, FLOOR, look, stride, cheerQ * (0.6 + 0.4 * Math.sin(now * 7 + pid)), a);
    }
    // the last riders walk off to the right
    if (s > 3.6 && s < 16) {
      const nd = n - NC, cnt = 2;
      for (let r = 0; r < cnt; r++) {
        const tt = s - 3.6 - r * 0.5;
        if (tt < 0) continue;
        const x = 110 + r * 4 + tt * 8.5;
        const a = smooth(0, 0.4, tt);
        person(img, x, FLOOR, personLook(nd * 2 + r), Math.sin(tt * 5.5), cheer * 0.8, a);
      }
    }
    // deck lights and the string of lamps from the tent to the A-frame
    for (let i = 0; i < 12; i++) {
      const x = 68 + i * 5, lv = 0.35 + 0.65 * (0.5 + 0.5 * Math.cos(TAU * (i / 4 - now * 0.7))) ** 4;
      glow(img, x, 190.6, 0.9, i & 1 ? PAL.rose : PAL.amber, 0.22 * lv, 0.1);
    }
    for (const [x0, y0, x1, y1, sag] of [[13, 140, 60, 160, 8], [129, 153, 181, 122, 8]]) {
      for (let i = 0; i <= 10; i++) {
        const t = i / 10, x = kit.lerp(x0, x1, t), y = kit.lerp(y0, y1, t) + sag * 4 * t * (1 - t) + 0.5 * Math.sin(now * 1.3 + i);
        const lv = 0.5 + 0.5 * Math.sin(now * 2.3 + i * 1.9);
        glow(img, x, y, 0.85, [PAL.rose, PAL.teal, PAL.amber][i % 3], 0.12 + 0.12 * lv, 0.1);
      }
    }

    // the igniting sparks fall onto the new hour's bulbs
    for (let q = 0; q < sparks.length; q += 4) {
      const tx = sparks[q], ty = sparks[q + 1], tl = sparks[q + 2], h = sparks[q + 3];
      const u = (s - CROWN.tb) / (tl - CROWN.tb);
      for (let tr = 0; tr < 3; tr++) {
        const uu = u - tr * 0.05;
        if (uu < 0) continue;
        const bulge = (h - 0.5) * 30 * Math.sin(Math.PI * uu);
        const x = kit.lerp(CROWN.x, tx, uu) + bulge, y = kit.lerp(CROWN.y, ty, uu * uu) - 10 * Math.sin(Math.PI * uu);
        glow(img, x, y, 0.95, [1, 0.85, 0.55], tr ? 0.3 / tr : 0.9, 0.12);
      }
    }

    kit.blitGrid(ctx, img, 1 - 0.6 * ctx.night);
  },
};
