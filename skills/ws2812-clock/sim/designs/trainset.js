// Trainset: the eight panels round their empty middle are a picture frame,
// and the frame is a toy railway that runs all the way round a real hole.
// The time is the train's cargo: four carved, lacquered numerals standing
// on four wagons, pulled by a red tin loco driven by a rainbow frog in round
// glasses. Most of the minute the train waits at the station across the top,
// steaming, while cars cross the line, ducks paddle and the platform clock
// sweeps its seconds.
//   Minute: the minute wagons stand on a trestle over the void. The changing
//   figure's hopper floor drops open and the old numeral falls into the hole;
//   a crane hook lowers the new one from above, swinging, onto the empty
//   wagon with a bump, and the frog toots.
//   Hour: the whole train sets off round the frame - over the crossing (the
//   barriers drop, the cars wait), across the pond bridge - into the
//   mountain tunnel. The new hour is loaded in the dark: it comes out of the
//   far portal carrying the new time and pulls back into the station.
// Drawn as a toy tabletop: the track in plan, everything that stands up
// (train, numerals, people, houses) seen side-on. Look: smoked acrylic,
// the classic HUB75 finish, so only the lit layout shows on black.
import * as kit from '../js/kit.js';
import { blit, blitAffine, puff, line, disc, inPoly } from './trainset-paint.js';
import { glyphs, SW, SH, M as GM, GH, GW } from './trainset-glyphs.js';
import {
  W, H, pathAt, LOOP, buildScene, frogSprite, locoSide, locoEnds, wagonSprites, peopleSprites, carSprites, duckSprites,
  MOUNTAIN, PAL, inPond, ROAD, hex,
} from './trainset-scene.js';

const pad = (n) => String(n).padStart(2, '0');
const img = new Float32Array(3 * W * H);
const clamp = kit.clamp, smooth = (a, b, x) => kit.smoothstep(a, b, x);

// ---------------------------------------------------------------- train
// Rest positions (arc length along the loop) and delays: each wagon follows
// the loco a little later, so the couplings stretch on the move and the
// buffers close up again on arrival.
const REST = { loco: 124, wag: [89, 63, 31, 5] }; // M2, M1, H2, H1 (behind the loco)
const SLOT = [3, 2, 1, 0];                        // digit index of each wagon
const KAPPA = 10;                                 // slack in each coupling, px
const CROSS_S = 147 + Math.PI * 4 + 34.5;         // where the road crosses the right leg
const PRE = 5.5, END = 1.9;                        // the run leaves 5.5 s before the hour, is home 1.9 s after
// Running left along the bottom and up the left side the cargo would read
// backwards, so a tarp is drawn over each numeral round the bottom-right
// corner and pulled off round the top-left one.
const TARP_ON = [252, 296], TARP_OFF = [550, 572];
const tarpAt = (s) => { s = ((s % LOOP) + LOOP) % LOOP; return smooth(TARP_ON[0], TARP_ON[1], s) * (1 - smooth(TARP_OFF[0], TARP_OFF[1], s)); };

let S = null;
function setup() {
  const scene = buildScene();
  const fgIdx = [];
  for (let p = 0; p < W * H; p++) if (scene.fg.px[4 * p + 3] > 0.002) fgIdx.push(p);
  const frogs = {
    n: frogSprite(), b: frogSprite({ blink: true }), p: frogSprite({ pull: true }),
    l: frogSprite({ look: -1 }), r: frogSprite({ look: 1 }),
  };
  // pond pixels for the shimmer (not under the bridge)
  const pond = [];
  for (let y = 140; y < 191; y++) for (let x = 110; x < 175; x++) if (inPond(x + 0.5, y + 0.5) && !(y >= 174 && y <= 186)) pond.push(y * W + x);
  S = {
    scene, fgIdx: Int32Array.from(fgIdx), pond: Int32Array.from(pond), G: glyphs(), frogs,
    loco: locoSide(), ends: locoEnds(), wag: wagonSprites(), people: peopleSprites(), cars: carSprites(), ducks: duckSprites(),
  };
  S.PRE = PRE;
  solveRun();
}

// The run is keyframed (time from the hour, distance, speed) and joined by
// cubic Hermite pieces: a gentle start round the top and down past the
// crossing, a fast dash over the bridge and through the mountain, then a
// slow, braking arrival back into the station.
function lapD(tl) {
  const K = S.KF;
  if (tl <= K[0][0]) return 0;
  if (tl >= K[K.length - 1][0]) return LOOP;
  let i = 0;
  while (tl > K[i + 1][0]) i++;
  const [t0, d0, v0] = K[i], [t1, d1, v1] = K[i + 1], h = t1 - t0, u = (tl - t0) / h, u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * d0 + (u3 - 2 * u2 + u) * h * v0 + (-2 * u3 + 3 * u2) * d1 + (u3 - u2) * h * v1;
}
/** Wagon j's distance run when the loco has run D: each coupling takes up its slack in turn on the start, closes up on the stop. */
function wagS(j, D) {
  const R = LOOP - D;
  let off = 0;
  for (let i = 0; i <= j; i++) off += KAPPA * Math.min(clamp((D - KAPPA * i) / KAPPA), clamp((R - KAPPA * i) / KAPPA));
  return REST.wag[j] + D - off;
}
/** Is the numeral on a wagon at arc length s entirely under the mountain? */
const P4 = [0, 0, 0, 0];
function hidden(s) {
  const [x, y] = pathAt(s, P4), b = y + 2;
  const top = b - 9 - GH - 1;
  return inPoly(MOUNTAIN, x - 12, top) && inPoly(MOUNTAIN, x + 12, top) && inPoly(MOUNTAIN, x - 12, b) && inPoly(MOUNTAIN, x + 12, b);
}
const allHidden = (D) => [0, 1, 2, 3].every((j) => { const w = wagS(j, D); return tarpAt(w) >= 1 || hidden(w); });
/** Place the hour turn so every numeral is inside the tunnel then, with the most room either side. */
function solveRun() {
  let best = 420, bestM = -1;
  for (let D = 300; D <= 500; D += 0.5) {
    let m = 0;
    while (m < 60 && allHidden(D - m - 0.5) && allHidden(D + m + 0.5)) m += 0.5;
    if (!allHidden(D)) continue;
    if (m > bestM) { bestM = m; best = D; }
  }
  S.hideMargin = bestM;
  // keyframe speeds chosen so each piece's mean speed matches its distance (no sag)
  // a fast dash through the covered stretch keeps the gap with no readable figure short
  S.KF = [[-PRE, 0, 0], [-2, 130, 75], [-0.5, best - 93, 190], [0, best, 200], [0.4, best + 68, 160], [END, LOOP, 0]];

  S.openAt = -PRE;
  for (let tl = -PRE; tl < END; tl += 0.02) if (wagS(3, lapD(tl)) + REST.wag[3] * 0 > CROSS_S + 16) { S.openAt = tl; break; }
  // a table to invert the run (for smoke left behind)
  S.inv = [];
  for (let tl = -PRE; tl <= END + 1e-9; tl += 0.02) S.inv.push([tl, lapD(tl)]);
}
/** Time (from the hour) at which the loco had run distance D. */
function lapT(D) {
  const T = S.inv;
  let lo = 0, hi = T.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m][1] < D) lo = m; else hi = m; }
  const [t0, d0] = T[lo], [t1, d1] = T[hi];
  return d1 > d0 ? t0 + ((D - d0) / (d1 - d0)) * (t1 - t0) : t0;
}

/** After the stop the buffers spring: a small damped jostle running back down the train. */
function arrivalBump(j, lap) {
  const u = lap - END - j * 0.07;
  if (u <= 0 || u > 2) return 0;
  return -1.1 * Math.exp(-4 * u) * Math.sin(13 * u);
}

// --------------------------------------------------------------- timing
function clock(d) {
  const h = d.getHours(), m = d.getMinutes(), sec = kit.secOf(d);
  // seconds from the nearest hour turn (negative before it)
  let tl = 1e9;
  if (m === 59) tl = sec - 60; else if (m === 0) tl = sec;
  return { h, m, sec, tl, str: pad(h) + pad(m) };
}

// ---------------------------------------------------------------- frame
export default {
  name: 'Trainset',
  blurb: 'a toy railway round the hole in the frame; the time is the cargo, minutes drop into the void, the hour runs the tunnel',
  layouts: ['hub-ring'], look: 'smoke', fps: 60, brightness: 0.35,
  frame(ctx) {
    if (!S) setup();
    const d = ctx.date, now = d.getTime() / 1000, T = clock(d), night = ctx.night;
    const sc = S.scene;
    curStr = T.str;
    // ground: day image dimmed at night, plus lit windows
    const kd = 1 - 0.62 * night, kn = night;
    for (let i = 0; i < img.length; i++) img[i] = sc.day[i] * kd + sc.night[i] * kn;

    drawPond(now, night);
    drawRoad(now, T, night);
    drawDucks(now, night);

    // ----- where everything on the train is
    const lap = Math.abs(T.tl) < 30 ? T.tl : -1e9;
    const Dl = lapD(lap), sL = REST.loco + Dl;
    const sW = REST.wag.map((r, j) => wagS(j, Dl) + arrivalBump(j, lap));
    const moving = lap > -PRE - 0.2 && lap < END + 1;

    // minute: hopper drop (old numeral, before the turn) and crane (new, after it)
    const nextStr = (() => { const n = new Date((Math.floor(now / 60) + 1) * 60000); return pad(n.getHours()) + pad(n.getMinutes()); })();
    const prevStr = (() => { const n = new Date((Math.floor(now / 60) - 1) * 60000); return pad(n.getHours()) + pad(n.getMinutes()); })();
    const drop = [0, 0, 0, 0], lower = [-9, -9, -9, -9];
    if (T.m !== 59 && T.sec >= 59.2) for (const k of [2, 3]) if (nextStr[k] !== T.str[k]) drop[k] = T.sec - 59.2 - (k === 2 ? 0.12 : 0);
    if (T.m !== 0 && T.sec < 3) for (const k of [2, 3]) if (prevStr[k] !== T.str[k]) lower[k] = T.sec - (k === 2 ? 0.15 : 0);

    const items = [];
    const P = [0, 0, 0, 0];
    for (let j = 0; j < 4; j++) {
      pathAt(sW[j], P);
      items.push({ kind: 'wagon', j, slot: SLOT[j], s: sW[j], x: P[0], y: P[1] + 2, hx: P[2], hy: P[3] });
    }
    pathAt(sL, P);
    items.push({ kind: 'loco', s: sL, x: P[0], y: P[1] + 2, hx: P[2], hy: P[3] });
    items.sort((a, b) => a.y - b.y);

    // couplings between neighbours on the same straight
    const dim = 1 - 0.4 * night;
    for (let j = 0; j < 4; j++) {
      const a = items.find((o) => o.kind === 'wagon' && o.j === j);
      const b = j === 0 ? items.find((o) => o.kind === 'loco') : items.find((o) => o.kind === 'wagon' && o.j === j - 1);
      if (Math.abs(a.hx) > 0.9 && Math.abs(b.hx) > 0.9 && Math.abs(a.y - b.y) < 1) {
        const sg = Math.sign(a.hx);
        line(img, W, H, a.x + sg * 13, a.y - 5, b.x - sg * (b.kind === 'loco' ? 23 : 13), b.y - 5, 1, kit.scale(PAL.grey, dim));
      }
    }
    for (const o of items) {
      if (o.kind === 'loco') drawLoco(o, T, lap, dim, night, now);
      else drawWagon(o, T, drop[o.slot], lower[o.slot], dim, night, moving);
    }

    // foreground: trestle, mountain
    const fg = sc.fg.px, fi = S.fgIdx;
    for (let q = 0; q < fi.length; q++) {
      const p = fi[q], a = fg[4 * p + 3];
      img[3 * p] = img[3 * p] * (1 - a) + fg[4 * p] * kd;
      img[3 * p + 1] = img[3 * p + 1] * (1 - a) + fg[4 * p + 1] * kd;
      img[3 * p + 2] = img[3 * p + 2] * (1 - a) + fg[4 * p + 2] * kd;
    }

    drawMountainLife(now, night, sL, lap);

    // crane hooks bringing the new numerals
    for (const k of [2, 3]) if (lower[k] > -5) drawCrane(items.find((o) => o.kind === 'wagon' && o.slot === k), lower[k], dim);

    drawPlatform(now, night, lap);
    drawSignal(lap, night);
    drawSmoke(now, sL, lap, night, T);
    drawStationClock(T.sec, night);
    drawGantry(night);

    kit.blitGrid(ctx, img);
  },
};

// ---------------------------------------------------------------- parts
function drawWagon(o, T, dropT, lowerT, dim, night, moving) {
  const Wg = S.wag, side = smooth(0.3, 0.7, o.hx * o.hx), end = 1 - side;
  const hopper = o.slot >= 2;
  // landing bump of a freshly lowered numeral
  let bump = 0;
  if (lowerT >= 1.5) { const u = lowerT - 1.5; bump = 1.1 * Math.exp(-7 * u) * Math.sin(16 * u); }
  const by = o.y + bump * 0.5;
  // the falling numeral goes behind the wagon
  const g = S.G[+T.str[o.slot]];
  const gx = o.x - SW / 2, gy = by - 9 - (GM + GH);
  if (dropT > 0.15) {
    const u = dropT - 0.15, fall = 0.5 * 430 * u * u;
    const ang = (o.slot === 3 ? 1 : -1) * 0.5 * u * u;
    blitAffine(img, W, H, g, SW / 2, GM + GH, o.x + (o.slot === 3 ? 3 : -3) * u * u, by - 9 + fall, ang, 1, 1, dim);
  }
  if (side > 0.02) {
    const spr = hopper ? Wg.hopper : Wg.flat;
    blit(img, W, H, spr, o.x - Wg.ax, by - Wg.ay, dim, side);
    // wheels: a crank dot turning with the distance run
    for (const wx of [6, 20]) {
      const cx = o.x - 13 + wx, cy = by - 2.4, a = o.s / 2.4;
      disc(img, W, H, cx, cy, 2.4, kit.scale(PAL.grey, dim), side);
      disc(img, W, H, cx, cy, 1.5, kit.scale(PAL.red, dim * 0.8), side);
      disc(img, W, H, cx + 1.1 * Math.cos(a), cy + 1.1 * Math.sin(a), 0.6, kit.scale(PAL.brass, dim), side);
    }
    if (hopper) {
      // hopper doors: two flaps hinged at the deck's split
      const open = dropT > 0 ? kit.ease.out(clamp(dropT / 0.15)) : lowerT > -5 ? 1 - smooth(0.5, 0.9, lowerT) : 0;
      const a = open * 1.25, L = 5.2;
      const hx0 = o.x - 13 + 7.8, hx1 = o.x - 13 + 18.2, hy = by - 8;
      line(img, W, H, hx0, hy, hx0 + L * Math.cos(a), hy + L * Math.sin(a), 1.6, kit.scale(hex('#d09050'), dim), side);
      line(img, W, H, hx1, hy, hx1 - L * Math.cos(a), hy + L * Math.sin(a), 1.6, kit.scale(hex('#d09050'), dim), side);
    }
  }
  if (end > 0.02) blit(img, W, H, Wg.end, o.x - Wg.eax, by - Wg.ay, dim, end);
  // the numeral standing on the deck
  if (dropT <= 0.15 && !(lowerT > -5 && lowerT < 1.5)) blit(img, W, H, g, gx, gy, dim);
  // the tarp: slid down over the figure from the top, roped at the deck
  const tp = tarpAt(o.s);
  if (tp > 0.001) {
    const x0 = gx + GM - 1.5, x1 = gx + GM + GW + 1.5, top = gy + GM - 1.5, bot = by - 9;
    const yb = top + (bot - top) * kit.ease.inOut(tp), TC = kit.scale(hex('#5a7a3a'), dim), TD = kit.scale(hex('#3a5426'), dim);
    for (let y = Math.floor(top); y < Math.ceil(yb); y++) {
      const cov = clamp(Math.min(y + 1 - top, yb - y));
      // a domed top and folds hanging down
      const inset = Math.max(0, 3 - (y - top)) * 0.9;
      for (let x = Math.floor(x0 + inset); x < Math.ceil(x1 - inset); x++) {
        const fold = Math.sin((x - x0) * 1.1 + o.slot) > 0.55 ? TD : TC, p = 3 * (y * W + x);
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        img[p] += (fold[0] - img[p]) * cov; img[p + 1] += (fold[1] - img[p + 1]) * cov; img[p + 2] += (fold[2] - img[p + 2]) * cov;
      }
    }
    if (tp > 0.3) for (const rx of [x0 + 5, x1 - 5]) line(img, W, H, rx, top + 2, rx, yb - 0.5, 0.8, kit.scale(hex('#e0c890'), dim), clamp((tp - 0.3) * 3));
  }
}

function frogFor(T, lap, now) {
  const F = S.frogs;
  const whistle = (lap > -S.PRE - 2.2 && lap < -S.PRE - 0.4) || (lap > END + 0.1 && lap < END + 1.0) ||
    (T.m !== 0 && T.sec > 1.5 && T.sec < 2.1);
  if (whistle) return F.p;
  if (kit.fract(now / 4.3 + kit.hash(Math.floor(now / 4.3)) * 0.5) < 0.035) return F.b;
  if (T.sec > 58.6 || T.sec < 1.6) return F.l;
  const lk = kit.noise2(now * 0.15, 3);
  return lk < 0.32 ? F.l : lk > 0.7 ? F.r : F.n;
}
function drawLoco(o, T, lap, dim, night, now) {
  const Lc = S.loco, E = S.ends, side = smooth(0.3, 0.7, o.hx * o.hx), end = 1 - side;
  const frog = frogFor(T, lap, now);
  // a gentle breathing bob at rest (the boiler simmering)
  const bob = 0;
  if (side > 0.02) {
    const flip = o.hx < 0;
    const x0 = o.x - Lc.ax, y0 = o.y - Lc.ay;
    const body = flip ? flipped(Lc.body, 'body') : Lc.body, wall = flip ? flipped(Lc.wall, 'wall') : Lc.wall;
    blit(img, W, H, body, x0, y0 + bob * 0.3, dim, side);
    const fx = flip ? x0 + Lc.w - 25 : x0 - 1;
    blit(img, W, H, frog, fx, y0 - 4, dim, side);
    blit(img, W, H, wall, x0, y0 + bob * 0.3, dim, side);
    const mx = (lx) => (flip ? x0 + Lc.w - lx : x0 + lx);
    const pins = [];
    for (const [wx, wy, r] of Lc.wheels) {
      const cx = mx(wx), cy = y0 + wy, a = (flip ? -1 : 1) * o.s / r;
      disc(img, W, H, cx, cy, r, kit.scale(PAL.grey, dim), side);
      disc(img, W, H, cx, cy, r - 0.9, kit.scale(hex('#c01810'), dim), side);
      if (r > 3.5) {
        for (let k = 0; k < 3; k++) { const b = a + k * Math.PI / 3; line(img, W, H, cx - (r - 1) * Math.cos(b), cy - (r - 1) * Math.sin(b), cx + (r - 1) * Math.cos(b), cy + (r - 1) * Math.sin(b), 0.7, kit.scale(PAL.brass, dim * 0.8), side); }
        pins.push([cx + 2.3 * Math.cos(a), cy + 2.3 * Math.sin(a)]);
      }
      disc(img, W, H, cx, cy, 0.8, kit.scale(PAL.brass, dim), side);
    }
    if (pins.length === 2) line(img, W, H, pins[0][0], pins[0][1], pins[1][0], pins[1][1], 1.1, kit.scale(hex('#e0e0e8'), dim), side);
    // headlamp at night
    if (night > 0) puff(img, W, H, mx(45), y0 + 6, 5, [1, 0.8, 0.45], 0.5 * night * side, true);
  }
  if (end > 0.02) {
    const front = o.hy > 0, spr = front ? E.front : E.back;
    const x0 = o.x - E.ax, y0 = o.y - E.ay;
    if (front) { blit(img, W, H, frog, x0 + 6, y0 - 9 + bob, dim, end); blit(img, W, H, spr, x0, y0, dim, end); }
    else { blit(img, W, H, spr, x0, y0, dim, end); blit(img, W, H, frog, x0 + 1, y0 - 3 + bob, dim, end); }
    if (front && night > 0) puff(img, W, H, o.x, y0 + 10, 5, [1, 0.8, 0.45], 0.5 * night * end, true);
  }
}
const flipCache = {};
function flipped(s, key) {
  if (!flipCache[key]) {
    const px = new Float32Array(s.px.length);
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) for (let c = 0; c < 4; c++) px[4 * (y * s.w + s.w - 1 - x) + c] = s.px[4 * (y * s.w + x) + c];
    flipCache[key] = { w: s.w, h: s.h, px };
  }
  return flipCache[key];
}

function drawCrane(o, t, dim) {
  // the new numeral comes down on a hook from above the frame, swinging, and lands at t = 1.5
  const restTop = o.y - 9 - (GM + GH);
  const u = clamp(t / 1.5), e = 1 - (1 - u) ** 3;
  if (t < 0) return;
  const y = restTop - 56 * (1 - e);
  const sway = 2.6 * (1 - e) * Math.sin(t * 5.2 + o.slot);
  const g = S.G[+timeDigit(o.slot)];
  if (t < 1.5) blitAffine(img, W, H, g, SW / 2, 1, o.x + sway, y + 1, -sway * 0.035, 1, 1, dim);
  // rope and hook: down with the load, then up and away
  const hookY = t < 1.5 ? y + GM - 2.5 : restTop + GM - 2.5 - (restTop + GM + 1) * smooth(1.55, 2.6, t) ** 1.5;
  const hx = o.x + (t < 1.5 ? sway : 0);
  if (hookY > 4) {
    line(img, W, H, o.x, 4.5, hx, hookY - 1.5, 0.8, kit.scale(hex('#d8d8e0'), dim));
    disc(img, W, H, hx, hookY - 1, 1.4, kit.scale(PAL.brass, dim));
    line(img, W, H, hx, hookY - 0.5, hx + 1.4, hookY + 1.4, 0.9, kit.scale(PAL.brass, dim));
  }
}
let curStr = '0000';
const timeDigit = (k) => curStr[k];

function drawStationClock(sec, night) {
  // a platform clock hung from the canopy between the hours and the minutes: it only sweeps seconds
  const cx = 68.5, cy = 15.5, r = 4.6, k = 1 - 0.3 * night;
  line(img, W, H, cx, 6.5, cx, cy - r, 0.9, kit.scale(PAL.iron, k));
  disc(img, W, H, cx, cy, r + 0.8, [0, 0, 0]);
  disc(img, W, H, cx, cy, r, kit.scale(PAL.cream, k));
  for (let q = 0; q < 12; q += 3) { const a = q * Math.PI / 6; disc(img, W, H, cx + 3.5 * Math.sin(a), cy - 3.5 * Math.cos(a), 0.45, [0, 0, 0]); }
  const a = (sec / 60) * kit.TAU;
  line(img, W, H, cx - 1.2 * Math.sin(a), cy + 1.2 * Math.cos(a), cx + 3.8 * Math.sin(a), cy - 3.8 * Math.cos(a), 0.8, kit.scale(PAL.red, k));
  disc(img, W, H, cx, cy, 0.7, kit.scale(PAL.red, k));
  if (night > 0) puff(img, W, H, cx, cy, 7, [1, 0.85, 0.6], 0.12 * night, true);
}

function drawPlatform(now, night, lap) {
  const ppl = S.people, k = 1 - 0.45 * night;
  // standing passengers shuffle; one strolls up and down
  const stand = [[8, 63, 0], [21, 62, 1], [44, 63, 2], [55, 62.5, 4]];
  for (const [x, y, i] of stand) {
    const sway = 0.35 * Math.sin(now * (0.9 + i * 0.23) + i * 2);
    const wave = lap > -S.PRE - 1 && lap < END ? Math.abs(Math.sin(now * 6 + i)) * 1.2 : 0;
    blit(img, W, H, ppl[i], x - 2.5 + sway, y - 11 - wave * 0.4, k);
  }
  const ph = (now / 26) % 1, tri = ph < 0.5 ? ph * 2 : 2 - ph * 2;
  const wx = 12 + 40 * kit.ease.inOut(tri), step = Math.abs(Math.sin(now * 7)) * 0.6;
  blit(img, W, H, ppl[3], wx - 2.5, 63 - 11 - step, k);
  if (night > 0) for (const lx of [17, 47]) puff(img, W, H, lx, 20, 14, [1, 0.75, 0.4], 0.07 * night, true);
}

function drawSignal(lap, night) {
  // semaphore at the top-right corner: arm clears before the hour run, drops after
  const up = smooth(-S.PRE - 2.2, -S.PRE - 1.2, lap) * (1 - smooth(END + 0.5, END + 1.5, lap));
  const a = -0.75 * up, px = 185.9, py = 19, k = 1 - 0.3 * night;
  line(img, W, H, px, py, px - 9 * Math.cos(a), py + 9 * Math.sin(a), 2.2, kit.scale(PAL.red, k));
  line(img, W, H, px - 6 * Math.cos(a), py + 6 * Math.sin(a), px - 7.3 * Math.cos(a), py + 7.3 * Math.sin(a), 2.3, kit.scale(PAL.cream, k));
  disc(img, W, H, px + 1.6, py + 1, 1.3, up > 0.5 ? hex('#30ff60') : PAL.red);
  if (night > 0) puff(img, W, H, px + 1.6, py + 1, 4, up > 0.5 ? [0.2, 1, 0.4] : [1, 0.15, 0.05], 0.4 * night, true);
}

// ---------------------------------------------------------------- road
const CAR_V = 17, CAR_P = 2.9;
function barrier(lap) {
  // 0 open .. 1 down
  const c0 = -S.PRE - 2.6, c1 = S.openAt;
  return smooth(c0, c0 + 1.2, lap) * (1 - smooth(c1, c1 + 1.2, lap));
}
function drawRoad(now, T, night) {
  const lap = Math.abs(T.tl) < 60 ? T.tl : -1e9;
  const Tabs = now - lap; // the hour turn, absolute
  const c0 = Tabs - S.PRE - 1.6, c1 = Tabs + S.openAt + 0.6;
  const k = 1 - 0.4 * night;
  for (const lane of [0, 1]) {
    const dir = lane === 0 ? 1 : -1, y = lane === 0 ? ROAD.laneE : ROAD.laneW;
    const x0 = lane === 0 ? 112 : 204, stop = lane === 0 ? 163 : 190; // front bumper at the stop line
    const k0 = Math.floor((now - 12) / CAR_P) - 4, k1 = Math.floor(now / CAR_P) + 1;
    let q = 0, lastRelease = -1e9;
    const travel = Math.abs(stop - x0) / CAR_V;
    for (let n = k0 - 6; n <= k1; n++) {
      if (kit.hash(n, lane, 5) < 0.35) continue;      // gaps in the traffic
      const tk = n * CAR_P + kit.hash(n, lane, 9) * 1.4;
      const ak = tk + travel;
      let pos;
      const free = (t) => (t - tk) * CAR_V;           // distance driven
      const queued = (ak >= c0 && ak < c1) || (ak >= c1 && ak < lastRelease + 0.6);
      if (queued) {
        const spotD = Math.abs(stop - x0) - q * 15, rel = Math.max(c1 + 0.3 + q * 0.7, lastRelease + 0.7);
        lastRelease = rel; q++;
        if (now < rel) { const f = free(now); pos = f < spotD - 6 ? f : spotD - 6 * Math.exp(-(f - (spotD - 6)) / 6); }
        else { const u = now - rel; pos = spotD + CAR_V * (u - (1 - Math.exp(-2.5 * u)) / 2.5); }
      } else pos = free(now);
      if (pos < 0) continue;
      const front = x0 + dir * pos;
      if (front < 100 || front > 215) continue;
      const car = S.cars[Math.floor(kit.hash(n, lane, 2) * S.cars.length)];
      const left = dir > 0 ? front - 12 : front;
      blit(img, W, H, dir > 0 ? car.r : car.l, left, y - 6.5, k);
      if (night > 0) puff(img, W, H, front + dir * 2, y - 3, 4, [1, 0.9, 0.6], 0.35 * night, true);
    }
  }
  // barrier arms and their flashing lamps
  const b = barrier(lap), kk = 1 - 0.3 * night;
  for (const [px, py, dn] of [[166, 86, 1], [188, 100, -1]]) {
    const ang = b * Math.PI / 2, L = 11;
    const tx = px, ty = py - 8;
    const ex = tx, ey = ty - L * Math.cos(ang) * 0.9 + dn * L * Math.sin(ang) * 0.75;
    for (let q = 0; q < 4; q++) {
      const a0 = q / 4, a1 = (q + 1) / 4;
      line(img, W, H, tx + (ex - tx) * a0, ty + (ey - ty) * a0, tx + (ex - tx) * a1, ty + (ey - ty) * a1, 1.3, kit.scale(q % 2 ? PAL.cream : PAL.red, kk));
    }
    if (b > 0.02) {
      const on = Math.floor(now * 2.4 + (dn > 0 ? 0 : 0.5)) % 2 === 0;
      if (on) { disc(img, W, H, px, py - 8, 1.3, PAL.red); puff(img, W, H, px, py - 8, 4, [1, 0.1, 0.05], 0.4, true); }
    }
  }
}

// ---------------------------------------------------------------- pond
function drawPond(now, night) {
  const pd = S.pond, hl = PAL.water2, k = (1 - 0.5 * night) * 0.55;
  for (let q = 0; q < pd.length; q++) {
    const p = pd[q], x = p % W, y = (p / W) | 0;
    const w = Math.sin(x * 0.55 + now * 1.3 + Math.sin(y * 0.7 + now * 0.4) * 2) * Math.sin(y * 1.1 - now * 0.9);
    if (w > 0.55) { const f = (w - 0.55) * 2.2 * k; img[3 * p] += hl[0] * f; img[3 * p + 1] += hl[1] * f; img[3 * p + 2] += hl[2] * f; }
  }
}
function drawDucks(now, night) {
  const D = S.ducks, k = 1 - 0.4 * night;
  const ducks = [[140, 158, 0.11, 0], [128, 166, 0.08, 2], [152, 168, 0.095, 4]];
  for (const [cx, cy, w, ph] of ducks) {
    const a = now * w + ph;
    const x = cx + 13 * Math.sin(a), y = cy + 3.5 * Math.sin(2 * a + ph);
    const vx = Math.cos(a), sx = Math.tanh(vx * 4);
    const bob = 0.3 * Math.sin(now * 3 + ph);
    const spr = night > 0.5 ? D.sr : D.r;
    blitAffine(img, W, H, spr, 4, 6, x, y + bob, 0, sx, 1, k);
    // a faint wake
    puff(img, W, H, x - 4 * Math.sign(vx), y + 0.5, 2.5, PAL.water2, 0.25 * k * Math.abs(vx), true);
  }
}

// ---------------------------------------------------------------- smoke
function chimneyAt(s, out) {
  const P = pathAt(s, [0, 0, 0, 0]), side = P[2] * P[2];
  const fx = P[2] >= 0 ? 40.5 - 23 : 23 - 40.5;
  out[0] = P[0] + fx * side; out[1] = P[1] + 2 - 30 + (1 - side) * 2; return out;
}
function drawSmoke(now, sL, lap, night, T) {
  const k = 1 - 0.5 * night, SM = [0.62, 0.62, 0.66], ch = [0, 0];
  const atRest = !(lap > -S.PRE && lap < END);
  // idle puffs from the chimney at the station
  if (atRest || lap < -S.PRE + 0.6) {
    chimneyAt(REST.loco + (atRest && lap > 0 ? 0 : 0), ch);
    const per = 1.35;
    for (let i = 0; i < 4; i++) {
      const born = Math.floor(now / per) * per - i * per, age = now - born;
      const jit = kit.hash(Math.floor(born / per), 4);
      const x = ch[0] - age * (3 + 2 * jit) + Math.sin(age * 1.7 + jit * 6) * 1.2, y = ch[1] - age * 7 - age * age * 0.6;
      puff(img, W, H, x, y, 1.6 + age * 2.2, SM, k * 0.55 * Math.max(0, 1 - age / (per * 4)));
    }
    // a smoke ring now and then
    const rp = 9.5, rb = Math.floor(now / rp) * rp, ra = now - rb;
    if (ra < 4) {
      const x = ch[0] - ra * 2.5, y = ch[1] - 3 - ra * 5.5, rr = 1.8 + ra * 1.6, fade = k * 0.6 * (1 - ra / 4);
      for (let q = 0; q < 14; q++) { const a = q / 14 * kit.TAU; puff(img, W, H, x + rr * Math.cos(a), y + rr * 0.55 * Math.sin(a), 1.3, SM, fade); }
    }
  }
  // on the run: a chuff every 7 px of travel, left where it was born
  if (lap > -S.PRE - 0.1 && lap < END + 3) {
    const D = lapD(lap), i1 = Math.floor(D / 7);
    for (let i = i1; i >= 0 && i > i1 - 40; i--) {
      const di = i * 7, born = lapT(di), age = lap - born;
      if (age > 2.6 || age < 0) continue;
      const s = REST.loco + di;
      chimneyAt(s, ch);
      const sp = pathAt(s, [0, 0, 0, 0]);
      if (inPoly(MOUNTAIN, sp[0], sp[1] + 2)) continue; // in the tunnel
      const x = ch[0] + Math.sin(i * 1.3) * age * 2, y = ch[1] - age * 9;
      puff(img, W, H, x, y, 2 + age * 2.6, SM, k * 0.6 * (1 - age / 2.6));
    }
  }
  // whistle steam: white jets when the frog pulls the cord
  const wh = [];
  if (lap > -S.PRE - 2.2 && lap < -S.PRE - 0.4) wh.push(lap + S.PRE + 2.2);
  if (lap > END + 0.1 && lap < END + 1.6) wh.push(lap - (END + 0.1));
  if (T.m !== 0 && T.sec > 1.5 && T.sec < 2.6) wh.push(T.sec - 1.5);
  for (const t0 of wh) {
    const P = pathAt(sL, [0, 0, 0, 0]);
    const wx = P[0] + (P[2] >= 0 ? 19.7 - 23 : 23 - 19.7) * P[2] * P[2], wy = P[1] + 2 - 30 + 2.5;
    for (let q = 0; q < 8; q++) {
      const age = (t0 * 6 + q / 8) % 1 * 0.7;
      if (age > t0) continue;
      puff(img, W, H, wx + Math.sin(q * 2.1) * age * 3, wy - age * 22, 1.2 + age * 4, [0.95, 0.95, 1], k * 0.7 * (1 - age / 0.7));
    }
  }
}

// ------------------------------------------------------- mountain life
function drawMountainLife(now, night, sL, lap) {
  const k = 1 - 0.55 * night;
  // a windmill on the hillside, sails always turning (faster in the hour's wind)
  {
    const bx = 44, by = 104, k2 = 1 - 0.45 * night, hub = [bx, by - 13];
    const body = kit.scale(hex('#e8dcc0'), k2);
    for (let y = by - 13; y <= by; y++) { const hw = 2.2 + (y - (by - 13)) * 0.22; line(img, W, H, bx - hw, y + 0.5, bx + hw, y + 0.5, 1, body); }
    line(img, W, H, bx - 3.4, by - 14, bx, by - 17, 1.3, kit.scale(PAL.red, k2)); line(img, W, H, bx, by - 17, bx + 3.4, by - 14, 1.3, kit.scale(PAL.red, k2));
    disc(img, W, H, bx, by - 3, 1, kit.scale(hex('#7a3a18'), k2));
    if (night > 0) disc(img, W, H, bx, by - 8, 0.9, [1, 0.75, 0.3], night);
    const spin = Math.abs(lap) < 15 ? 1.6 : 0.55, a0 = now * spin;
    for (let q = 0; q < 4; q++) {
      const a = a0 + q * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
      line(img, W, H, hub[0], hub[1], hub[0] + 10 * ca, hub[1] + 10 * sa, 0.8, kit.scale(hex('#9a6430'), k2));
      // the sail cloth: a strip along each arm
      line(img, W, H, hub[0] + 3 * ca - 1.2 * sa, hub[1] + 3 * sa + 1.2 * ca, hub[0] + 9.6 * ca - 1.2 * sa, hub[1] + 9.6 * sa + 1.2 * ca, 1.6, kit.scale(PAL.cream, k2));
    }
    disc(img, W, H, hub[0], hub[1], 1, kit.scale(PAL.brass, k2));
  }
  // two birds gliding over the massif, wings beating now and then
  for (let b = 0; b < 2; b++) {
    const a = now * (0.13 + b * 0.04) + b * 2.4;
    const x = 52 + 34 * Math.sin(a), y = 148 + 14 * Math.sin(2 * a + b) - b * 18;
    const flap = Math.sin(now * 9 + b) * (kit.noise2(now * 0.4, b * 3) > 0.5 ? 1 : 0.25);
    const c = kit.scale([0.85, 0.85, 0.8], k);
    line(img, W, H, x - 3, y - 1.2 * flap - 0.4, x, y, 0.9, c);
    line(img, W, H, x, y, x + 3, y - 1.2 * flap - 0.4, 0.9, c);
  }
  // inside the tunnel: the portals glow with the headlamp and the vent smokes
  const P = pathAt(sL, [0, 0, 0, 0]);
  const inT = inPoly(MOUNTAIN, P[0], P[1] + 2) && lap > -PRE && lap < END;
  if (inT) {
    const dE = Math.hypot(P[0] - 108, P[1] - 180), dN = Math.hypot(P[0] - 14, P[1] - 70);
    puff(img, W, H, 108, 178, 9, [1, 0.75, 0.35], 0.5 * Math.max(0, 1 - dE / 60), true);
    puff(img, W, H, 14, 69, 9, [1, 0.75, 0.35], 0.5 * Math.max(0, 1 - dN / 60), true);
  }
  // the vent near the summit puffs while the train is underground (and for a while after)
  const tIn = lap + S.PRE;
  if (lap > -6 && lap < 6) {
    for (let i = 0; i < 6; i++) {
      const per = 0.45, born = Math.floor(now / per) * per - i * per, age = now - born;
      const bornLap = lap - age;
      if (bornLap < -3.2 || bornLap > 2.2) continue;
      puff(img, W, H, 47 + age * 3, 66 - age * 8, 1.6 + age * 2.4, [0.75, 0.75, 0.8], 0.6 * (1 - age / 2.7) * k);
    }
  }
  // fireflies over the pond and the forest at night
  if (night > 0) for (let f = 0; f < 9; f++) {
    const a = now * 0.2 + f * 1.7;
    const x = (f < 5 ? 130 : 20) + (f < 5 ? 30 : 40) * kit.noise2(a, f), y = (f < 5 ? 140 : 135) + 30 * kit.noise2(f, a * 0.9);
    const glow = Math.max(0, Math.sin(now * (1.3 + f * 0.17) + f * 2)) ** 3;
    if (glow > 0.02) puff(img, W, H, x, y, 2.2, [0.8, 1, 0.3], 0.7 * glow * night, true);
  }
}

// The goods gantry: a lattice girder run out from the canopy along the top
// edge, with a winch trolley over each minute wagon.
function drawGantry(night) {
  const k = 1 - 0.35 * night, G = kit.scale(hex('#7a8494'), k), G2 = kit.scale(hex('#b8c0cc'), k);
  line(img, W, H, 64, 0.6, 127, 0.6, 1.2, G2);
  line(img, W, H, 64, 3.6, 127, 3.6, 1.2, G);
  for (let x = 66; x < 126; x += 4) line(img, W, H, x, 0.8, x + 2, 3.4, 0.7, G), line(img, W, H, x + 2, 3.4, x + 4, 0.8, 0.7, G);
  line(img, W, H, 126.5, 0, 126.5, 6, 1.4, G2);
  for (const tx of [85, 111]) {
    const P = kit.scale(hex('#e8b030'), k);
    for (let y = 2; y < 6; y++) line(img, W, H, tx - 2.6, y + 0.5, tx + 2.6, y + 0.5, 1, P);
    disc(img, W, H, tx, 4, 1.1, kit.scale(hex('#5a4020'), k));
  }
}
