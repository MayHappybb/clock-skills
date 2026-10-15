// Synchro: a water ballet seen straight down from the high board, Busby
// Berkeley style. The time is the team itself: some sixty swimmers floating
// on their backs in starfish pose, side by side, arms raised to hold hands,
// whose formations are the numerals (synchro-digits.js). Heads point into
// every counter, so each bowl is ringed with gold caps, a little Berkeley
// flower; between hours and minutes five soloists hold a turning rosette.
// The four formations ride in a gentle kickline diagonal and bob on it.
//
// Always alive: caustics crawl over the tiles; every swimmer sculls and
// flutter-kicks (foam flickers at the feet), each formation sways as one;
// the rings of 0, 6 and 9 turn like carousels and the 8 is one
// figure-of-eight circuit, swimmers passing through its waist head first;
// every 7 s a "ballet leg" wave runs through the whole team in pen order
// (each swimmer in turn raises a leg straight up at us in a burst of foam);
// chain ends wave their free hand.
//
// Minute turn: the changing numeral's swimmers do surface dives in pen
// order (head under, legs up vertical in foam, gone: a zipper that unwrites
// it, done by :59.8); their soft shadows weave under water trailing
// bubbles (invisible near either mark, so no ghost numeral); after :00 they
// pop up in the new formation in pen order, so it is written by splashes.
// Hour: the old swimmers dive and swim off the glass; the new ones are high
// divers off the board beside the camera, falling in true perspective, big
// and close, from every side, twisting, shrinking onto their marks; each
// lands in a white crown, so the new numeral is first written in foam, then
// the swimmers surface into it. The rosette opens and spins meanwhile.
//
// Palette: Technicolor water ballet: scarlet suits, gold caps, warm skin,
// one warm family for the time against the cool turquoise of white tiles
// seen through water and its white caustics; red, white and blue lane
// ropes frame the strip. Evening warms the caustics gold; at night the
// show's spotlight and the pool's wall lamps light the water a deep
// sapphire, the swimmers stay warm and bright on it, backlight dimmed.
//
// Hard or AA: everything that moves is AA (bodies, divers, foam); ripples
// are pairs of hard 1 px circles blended by the fractional radius; the lane
// floats are hard pixel sprites (they hold still); the water is our own
// per-pixel loop (synchro-pool.js), with soft shadows from a 2 px grid.
//
// Cost (rough C, ESP32-C3): ~9 ms mean, ~12 ms worst (the midnight show).
// Out of frame: the palette (1024 colours) and float sprites are rebuilt
// once a minute (~30k cycles); tables are built at start-up. Flash: the
// digit tables 1771 samples x 4 = 14 KB as int16, the floor map 12.8 KB,
// sine and ramp tables ~2.3 KB: about 29 KB in all.

import { hex, mix, ease, progress, rand, clockFields, sprite } from '../js/kit.js';
import { DIGITS, CW, CH, place } from './synchro-digits.js';
import { drawPool, setPalette, shadeClear, splat, calm, tsin, tcos } from './synchro-pool.js';

const SLOT_X = [2, 33, 98, 129], SLOT_Y = [10, 12, 16, 18];
const ROSE = [80, 40];

// ------------------------------------------------------------ colours
const SUIT = hex('e8303f'), CAP = hex('ffd23a'), SKIN = hex('f2b088');
const FOAM = hex('f4fffe'), SHADOW = hex('0a4560');
const ROPE = [hex('e8303f'), hex('f4f4ee'), hex('2a58c8'), hex('f4f4ee')];

// [hour, tile, grout, caustic, glow, dark, floorAmt, glowAmt, causAmt, night-ness]
const DAY = [
  [0, '1c5cc0', '184ea8', '6ad0ff', '58e0ff', '061a48', 0.15, 0.85, 0.45, 1],
  [5.5, '1c5cc0', '184ea8', '6ad0ff', '58e0ff', '061a48', 0.15, 0.85, 0.45, 1],
  [7, '5cbccc', '4aa6bc', 'ffe0e0', '9fe8f0', '1a5070', 0.8, 0.1, 0.75, 0.2],
  [9, '58ccd6', '44b2c4', 'eefffc', 'a8f0f0', '1a5070', 1, 0, 0.6, 0],
  [16.5, '58ccd6', '44b2c4', 'eefffc', 'a8f0f0', '1a5070', 1, 0, 0.6, 0],
  [18.5, '50bcc0', '40a2b0', 'fff0c0', 'a8f0f0', '1a5070', 1, 0, 0.6, 0.1],
  [20, '2c80b8', '2670a6', 'a8e0ff', '6ae0ff', '0c2a5a', 0.45, 0.5, 0.6, 0.6],
  [21.5, '1c5cc0', '184ea8', '6ad0ff', '58e0ff', '061a48', 0.15, 0.85, 0.45, 1],
  [24, '1c5cc0', '184ea8', '6ad0ff', '58e0ff', '061a48', 0.15, 0.85, 0.45, 1],
].map(([h, ...r]) => [h, ...r.slice(0, 5).map(hex), ...r.slice(5)]);

let palKey = -1, PALNOW = null;
function palette(hour, key) {
  if (key === palKey) return PALNOW;
  let k = 1;
  while (DAY[k][0] < hour) k++;
  const a = DAY[k - 1], b = DAY[k], u = (hour - a[0]) / (b[0] - a[0]);
  const m = (i) => (i <= 5 ? mix(a[i], b[i], u) : a[i] + (b[i] - a[i]) * u);
  PALNOW = { tile: m(1), grout: m(2), caustic: m(3), glow: m(4), dark: m(5), floorAmt: m(6), glowAmt: m(7), causAmt: m(8), dusk: m(9) };
  PALNOW.shade = mix(SHADOW, PALNOW.dark, PALNOW.dusk);
  setPalette(PALNOW);
  buildFloats(PALNOW.dusk);
  palKey = key;
  return PALNOW;
}

// ------------------------------------------------------------ swimmer state, per frame
const MAX = 260;
const X = new Float32Array(MAX), Y = new Float32Array(MAX), HX = new Float32Array(MAX), HY = new Float32Array(MAX);
const DEP = new Float32Array(MAX), KICK = new Float32Array(MAX), LIFT = new Float32Array(MAX);
const FAX = new Float32Array(MAX), FAY = new Float32Array(MAX);   // free hand direction (0,0: none)
let ns = 0;
// under-water swimmers: x, y, heading
const UX = new Float32Array(MAX), UY = new Float32Array(MAX), UHX = new Float32Array(MAX), UHY = new Float32Array(MAX), UA = new Float32Array(MAX);
let nu = 0;
// links: pairs of indices into the surface list, with an opacity
const LA = new Int16Array(MAX * 2), LB = new Int16Array(MAX * 2), LO = new Float32Array(MAX * 2);
let nl = 0;
// rings and splashes: x, y, age (s), kind (0 ring, 1 crown)
const RX = new Float32Array(MAX * 2), RY = new Float32Array(MAX * 2), RAGE = new Float32Array(MAX * 2), RK = new Uint8Array(MAX * 2);
let nr = 0;
// bubbles
const BX = new Float32Array(MAX * 3), BY = new Float32Array(MAX * 3), BAGE = new Float32Array(MAX * 3);
let nb = 0;
// divers in the air: landing point, height 0..1, twist, arms
const DX = new Float32Array(MAX), DY = new Float32Array(MAX), DH = new Float32Array(MAX), DHX = new Float32Array(MAX), DHY = new Float32Array(MAX), DARM = new Float32Array(MAX);
let nd = 0;

// formation positions for a slot (with the formation's sway), per digit
const FX = [new Float32Array(64), new Float32Array(64)], FY = [new Float32Array(64), new Float32Array(64)];
const FHX = [new Float32Array(64), new Float32Array(64)], FHY = [new Float32Array(64), new Float32Array(64)];
const FFX = [new Float32Array(64), new Float32Array(64)], FFY = [new Float32Array(64), new Float32Array(64)];
const PL = new Float32Array(4);
function formation(which, d, k, tt) {
  const D = DIGITS[d], ox = SLOT_X[k], oy = SLOT_Y[k] + 1.1 * tsin(tt * 0.52 - k * 0.95), cx = CW / 2, cy = CH / 2;
  const th = 0.035 * tsin(tt * 0.41 + k * 1.3), c = tcos(th), s = tsin(th);
  const sc = 1 + 0.012 * tsin(tt * 0.67 + k * 2.1);
  const fx = FX[which], fy = FY[which], fhx = FHX[which], fhy = FHY[which], ffx = FFX[which], ffy = FFY[which];
  for (let i = 0; i < D.n; i++) {
    place(D, i, tt, PL);
    const lx = (PL[0] - cx) * sc, ly = (PL[1] - cy) * sc;
    const bob = i * 0.9 + k * 2;
    fx[i] = ox + cx + lx * c - ly * s + 0.22 * tsin(tt * 1.3 + bob);
    fy[i] = oy + cy + lx * s + ly * c + 0.22 * tcos(tt * 1.1 + bob * 1.7);
    fhx[i] = PL[2] * c - PL[3] * s; fhy[i] = PL[2] * s + PL[3] * c;
  }
  // the free hands of a chain's two ends point away from the neighbour
  for (let i = 0; i < D.n; i++) {
    let ux = 0, uy = 0;
    const e = D.end[i];
    if (e === 3) { ux = -fhy[i]; uy = fhx[i]; }
    else if (e & 1) { ux = fx[i] - fx[i + 1]; uy = fy[i] - fy[i + 1]; }
    else if (e & 2) { ux = fx[i] - fx[i - 1]; uy = fy[i] - fy[i - 1]; }
    const fl = Math.sqrt(ux * ux + uy * uy);
    ffx[i] = fl > 0 ? ux / fl : 0; ffy[i] = fl > 0 ? uy / fl : 0;
  }
  g_cost.box += D.n * 12;   // the table lookups and the transform, per swimmer
  return D;
}
let g_cost = null;

/** Add a swimmer at the surface (or partly under: dep 0..1). Returns its index. */
// mode 0: floating; 1: a surface dive, p 0..1 (head and body go under, the
// legs rise vertical, then slip down); 2: surfacing, p 0..1 (the head pops up
// in a splash, the body and then the legs unfold)
const MODE = new Uint8Array(MAX), PH = new Float32Array(MAX);
const VH = new Float32Array(MAX), VT = new Float32Array(MAX), VL = new Float32Array(MAX), VU = new Float32Array(MAX), VF = new Float32Array(MAX);
function addSurface(x, y, hx, hy, mode, p, kick, lift, fax = 0, fay = 0) {
  X[ns] = x; Y[ns] = y; HX[ns] = hx; HY[ns] = hy; MODE[ns] = mode; PH[ns] = p; KICK[ns] = kick; LIFT[ns] = lift; FAX[ns] = fax; FAY[ns] = fay;
  // visibility of head, torso, legs; legs-up; foam
  let h = 1, t = 1, l = 1, up = lift, fo = 0;
  if (mode === 1) {
    h = 1 - progress(p, 0, 0.35); t = 1 - progress(p, 0.1, 0.5); l = 1 - progress(p, 0.7, 1);
    up = Math.max(lift, progress(p, 0.05, 0.45)); fo = Math.sin(Math.PI * progress(p, 0.1, 1));
  } else if (mode === 2) {
    h = progress(p, 0, 0.2); t = progress(p, 0.12, 0.45); l = progress(p, 0.3, 0.75);
    up = 0; fo = Math.sin(Math.PI * progress(p, 0, 0.7));
  }
  VH[ns] = h; VT[ns] = t; VL[ns] = l; VU[ns] = up; VF[ns] = fo; DEP[ns] = 1 - t;
  return ns++;
}
function addUnder(x, y, hx, hy, a) { UX[nu] = x; UY[nu] = y; UHX[nu] = hx; UHY[nu] = hy; UA[nu] = a; nu++; }
function addRing(x, y, age, kind = 0) { if (age >= 0 && age < (kind ? 1.1 : 0.8)) { RX[nr] = x; RY[nr] = y; RAGE[nr] = age; RK[nr] = kind; nr++; } }
function addLink(a, b, o) { if (a >= 0 && b >= 0 && o > 0.02) { LA[nl] = a; LB[nl] = b; LO[nl] = o; nl++; } }
function addBubbles(x, y, age, seed) {
  for (let j = 0; j < 3; j++) {
    const a = age - j * 0.27 - rand(seed, j) * 0.12;
    if (a < 0 || a > 0.55) continue;
    BX[nb] = x + (rand(seed, j, 1) - 0.5) * 5 + 0.8 * tsin(a * 9 + j); BY[nb] = y + (rand(seed, j, 2) - 0.5) * 4; BAGE[nb] = a / 0.55; nb++;
  }
}

// ------------------------------------------------------------ the turn
const DIVE0 = -1.65, DIVE_SPAN = 0.85, DIVE_LEN = 0.6;    // dives end by -0.2 s
const SURF0 = 0.05, SURF_SPAN = 0.85, SURF_LEN = 0.55;
const AIR = 0.75;                                         // a high diver's fall

const exitY = (y) => (y < 40 ? -16 : 96);

/**
 * One slot changing from digit a to b, `u` seconds from the turn
 * (negative before :00). `hour`: the new swimmers come off the high board.
 */
function transition(k, a, b, u, hour, tt, waveAt) {
  const DA = formation(0, a, k, tt), DB = formation(1, b, k, tt);
  const na = DA.n, nb2 = DB.n, n = Math.max(na, nb2);
  const idxA = SURF_A, idxB = SURF_B;
  for (let i = 0; i < n; i++) {
    idxA[i] = -1; idxB[i] = -1;
    const tD = DIVE0 + DIVE_SPAN * (i / Math.max(1, na - 1));
    const tS = hour ? SURF0 + 0.22 * k + 0.9 * (i / Math.max(1, nb2 - 1)) : SURF0 + SURF_SPAN * (i / Math.max(1, nb2 - 1));
    const seed = k * 977 + i * 31 + (hour ? 7 : 0);
    const kick = tt * 5.2 + i * 0.7 + k;
    // leaving: the old formation
    if (i < na) {
      if (u < tD) idxA[i] = addSurface(FX[0][i], FY[0][i], FHX[0][i], FHY[0][i], 0, 0, kick, waveAt(i), FFX[0][i], FFY[0][i]);
      else if (u < tD + DIVE_LEN) {
        const p = (u - tD) / DIVE_LEN;
        idxA[i] = addSurface(FX[0][i], FY[0][i], FHX[0][i], FHY[0][i], 1, p, kick, 0, FFX[0][i], FFY[0][i]);
      }
      if (u >= tD) addRing(FX[0][i], FY[0][i], u - tD);
    }
    // under water: from the old mark to the new one, or off and on at the edges
    const fromX = i < na ? FX[0][i] : (i < nb2 ? FX[1][i] : 0), fromY = i < na ? FY[0][i] : exitY(FY[1][i]);
    const goes = hour || i >= nb2, comes = !hour && i < nb2;
    const t0 = i < na ? tD + 0.3 : -1.25;
    if (goes && i < na) {
      // swim off the glass
      const tx = fromX + (fromX - 80) * 0.25, ty = exitY(fromY);
      const v = progress(u, t0 - 0.1, t0 + 1.3);
      if (u >= tD + 0.15 && v < 1) {
        const e = ease.outQuad(v);
        const x = fromX + (tx - fromX) * e, y = fromY + (ty - fromY) * e;
        const hl = Math.hypot(tx - fromX, ty - fromY) || 1;
        addUnder(x, y, (tx - fromX) / hl, (ty - fromY) / hl, progress(v, 0, 0.18) * (1 - v));
        addBubbles(x, y, u - tD - 0.2, seed);
      }
    }
    if (comes) {
      const tx = FX[1][i], ty = FY[1][i];
      const sx = i < na ? fromX : tx, sy = i < na ? fromY : exitY(ty);
      if (u >= (i < na ? tD + 0.15 : t0) && u < tS + SURF_LEN * 0.5) {
        const v = ease.inOutCubic(progress(u, t0, tS));
        // a curved path: alternate swimmers bow out to either side, weaving
        const dx = tx - sx, dy = ty - sy, dl = Math.hypot(dx, dy) || 1;
        const bow = (i & 1 ? 1 : -1) * (4 + Math.min(7, dl * 0.3)) * Math.sin(Math.PI * v);
        const x = sx + dx * v - (dy / dl) * bow, y = sy + dy * v + (dx / dl) * bow;
        // heading: along the path, turning to the formation's at the end
        let hx = dx / dl, hy = dy / dl;
        const w = progress(u, tS - 0.25, tS + 0.1);
        hx = hx * (1 - w) + FHX[1][i] * w; hy = hy * (1 - w) + FHY[1][i] * w;
        const hl = Math.hypot(hx, hy) || 1;
        // invisible near either mark: no ghost of the old numeral, no preview of the new
        const fade = progress(v, 0, 0.2) * (1 - progress(v, 0.8, 1));
        addUnder(x, y, hx / hl, hy / hl, fade);
        addBubbles(x, y, u - t0, seed);
      }
    }
    // arriving: the new formation
    if (i < nb2) {
      if (hour) {
        const tL = tS - 0.3;
        if (u >= tL - AIR && u < tL) {
          const p = (u - (tL - AIR)) / AIR;
          DX[nd] = FX[1][i]; DY[nd] = FY[1][i]; DH[nd] = 1 - p * p;
          const tw = (1 - p) * 2.6 * (i & 1 ? 1 : -1), c = tcos(tw), s = tsin(tw);
          DHX[nd] = FHX[1][i] * c - FHY[1][i] * s; DHY[nd] = FHX[1][i] * s + FHY[1][i] * c; DARM[nd] = progress(p, 0.7, 0.95); nd++;
        }
        if (u >= tL) addRing(FX[1][i], FY[1][i], (u - tL) * 0.85, 1);
        if (u >= tL && u < tS + SURF_LEN * 0.5) addUnder(FX[1][i], FY[1][i], FHX[1][i], FHY[1][i], 1 - progress(u, tS, tS + SURF_LEN * 0.5));
        if (u >= tL) addBubbles(FX[1][i], FY[1][i], u - tL, seed + 5);
      }
      if (u >= tS) {
        const p = progress(u, tS, tS + SURF_LEN);
        idxB[i] = addSurface(FX[1][i], FY[1][i], FHX[1][i], FHY[1][i], p < 1 ? 2 : 0, p, kick, 0, FFX[1][i], FFY[1][i]);
        if (!hour) addRing(FX[1][i], FY[1][i], u - tS);
      }
    }
  }
  linkUp(DA, idxA);
  linkUp(DB, idxB);
}
const SURF_A = new Int16Array(64), SURF_B = new Int16Array(64), SURF_R = new Int16Array(64);

function linkUp(D, idx) {
  for (let i = 0; i < D.n; i++) {
    const j = D.link[i];
    if (j < 0) continue;
    const a = idx[i], b = idx[j];
    if (a >= 0 && b >= 0) addLink(a, b, VT[a] * VT[b]);
  }
}

function rest(k, d, tt, waveAt) {
  const D = formation(0, d, k, tt);
  for (let i = 0; i < D.n; i++)
    SURF_R[i] = addSurface(FX[0][i], FY[0][i], FHX[0][i], FHY[0][i], 0, 0, tt * 5.2 + i * 0.7 + k, waveAt(i), FFX[0][i], FFY[0][i]);
  linkUp(D, SURF_R);
}

// ------------------------------------------------------------ drawing
let SK = SKIN, SU = SUIT, CA = CAP;

function drawBody(g, i) {
  const x = X[i], y = Y[i], hx = HX[i], hy = HY[i];
  const tA = VT[i], lA = VL[i], lift = VU[i];
  const tx = -hy, ty = hx;
  const kick = tsin(KICK[i]);
  const hipx = x - 1.2 * hx, hipy = y - 1.2 * hy;
  // foam where the body breaks the surface (diving or surfacing)
  if (VF[i] > 0.03) {
    const fo = VF[i], cx = MODE[i] === 2 ? x + 2.4 * hx : hipx, cy = MODE[i] === 2 ? y + 2.4 * hy : hipy;
    g.fillCircle(cx, cy, 1.6 + 1.6 * fo, FOAM, { aa: true, a: 0.75 * fo });
  }
  // legs: a wide V (the starfish), flutter-kicking; lifted, a leg rises
  // towards us, foreshortened, the foot nearer and bigger, foam at the knee
  if (lA > 0.02) {
    // surfacing: the legs unfold out of the hips
    const grow = MODE[i] === 2 ? lA : 1;
    for (let side = -1; side <= 1; side += 2) {
      const up = side > 0 || MODE[i] === 1 ? lift : 0;
      const len = 2.3 * (1 - 0.8 * up) * grow, spread = (2.5 + 0.45 * kick * side) * grow * (1 - 0.6 * (MODE[i] === 1 ? up : 0));
      const fx = hipx - hx * len + tx * side * spread * (1 - up * 0.5), fy = hipy - hy * len + ty * side * spread * (1 - up * 0.5);
      g.thickLine(hipx + tx * side * 0.6, hipy + ty * side * 0.6, fx, fy, 1.45, SK, { aa: true, a: lA });
    }
  }
  // kick foam: a flicker of white at the feet
  if (lA > 0.5 && ((KICK[i] * 0.8) | 0) % 3 === 0) {
    const fx = hipx - hx * 3.1, fy = hipy - hy * 3.1;
    g.pixel(fx + tx * kick * 1.5, fy + ty * kick * 1.5, FOAM, { a: 0.7 * lA });
  }
  if (tA <= 0.02) return;
  // torso: the suit (diving, it tips under head first: it shortens to the hips)
  const top = MODE[i] === 1 ? 1.2 - 2.0 * (1 - tA) : 1.2;
  g.thickLine(x + top * hx, y + top * hy, x - 1.3 * hx, y - 1.3 * hy, 2.9, SU, { aa: true, a: tA });
  // a free hand: raised like the others, sculling
  if (FAX[i] !== 0 || FAY[i] !== 0) {
    const w = 0.35 * tsin(KICK[i] * 0.6);
    const ux = FAX[i] + hx * (0.35 + w), uy = FAY[i] + hy * (0.35 + w);
    const sx = x + 1.1 * hx + FAX[i] * 0.9, sy = y + 1.1 * hy + FAY[i] * 0.9;
    g.thickLine(sx, sy, sx + ux * 2.8, sy + uy * 2.8, 1.2, SK, { aa: true, a: tA });
  }
  // the ballet leg: raised straight up at us, so seen end-on: a pointed
  // foot over the hip, ringed with the foam it threw up
  if (lift > 0.05 && MODE[i] === 0) {
    const fx = hipx - hx * (1.2 - 0.6 * lift), fy = hipy - hy * (1.2 - 0.6 * lift);
    g.fillCircle(fx, fy, 1.3 + 1.5 * lift, FOAM, { aa: true, a: 0.8 * lift });
    g.fillCircle(fx, fy, 0.9 + 0.5 * lift, SK, { aa: true });
  }
}

function drawHead(g, i) {
  const a = VH[i];
  if (a <= 0.02) return;
  const x = X[i] + 2.9 * HX[i], y = Y[i] + 2.9 * HY[i];
  g.fillCircle(x, y, 1.6, CA, { aa: true, a });
}

/** Joined hands: both arms raised to a grip between the two heads. */
function drawLink(g, a, b, o) {
  const mx = (X[a] + X[b] + 2.0 * (HX[a] + HX[b])) * 0.5, my = (Y[a] + Y[b] + 2.0 * (HY[a] + HY[b])) * 0.5;
  for (let q = 0; q < 2; q++) {
    const i = q ? b : a, tx = -HY[i], ty = HX[i];
    const sg = (mx - X[i]) * tx + (my - Y[i]) * ty > 0 ? 0.9 : -0.9;
    g.thickLine(X[i] + 1.1 * HX[i] + tx * sg, Y[i] + 1.1 * HY[i] + ty * sg, mx, my, 1.2, SK, { aa: true, a: o });
  }
}

function drawDiver(g, i, cx, cy) {
  const h = DH[i], kk = 1 / (1 - 0.52 * h);
  const px = DX[i], py = DY[i];
  const x = cx + (px - cx) * kk, y = cy + (py - cy) * kk, sc = kk;
  const hx = DHX[i], hy = DHY[i], tx = -hy, ty = hx;
  // legs together, body straight, arms: spread (swan) to overhead (entry)
  g.thickLine(x - 1.8 * hx * sc, y - 1.8 * hy * sc, x - 5.2 * hx * sc, y - 5.2 * hy * sc, 2.0 * sc, SK, { aa: true });
  g.thickLine(x + 0.8 * hx * sc, y + 0.8 * hy * sc, x - 2.0 * hx * sc, y - 2.0 * hy * sc, 3.0 * sc, SU, { aa: true });
  const arm = DARM[i];
  const sx = x + 1.0 * hx * sc, sy = y + 1.0 * hy * sc;
  for (let side = -1; side <= 1; side += 2) {
    const ax = tx * side * (1 - arm) + hx * (0.25 + 0.75 * arm), ay = ty * side * (1 - arm) + hy * (0.25 + 0.75 * arm);
    const al = Math.hypot(ax, ay) || 1;
    g.thickLine(sx, sy, sx + (ax / al) * 4.6 * sc, sy + (ay / al) * 4.6 * sc, 1.2 * sc, SK, { aa: true });
  }
  g.fillCircle(x + 3.0 * hx * sc, y + 3.0 * hy * sc, 1.75 * sc, CA, { aa: true });
}

// lane ropes: hard-pixel floats (they hold still), one sprite per colour,
// rebuilt with the palette
const FLOAT = ['.ooo.', 'ohhco', 'occco', 'occco', '.ooo.'];
let FLOATS = null;
function buildFloats(night) {
  const dim = (c) => mix(c, 0x0a1a40, night * 0.3);
  FLOATS = ROPE.map((c) => sprite(FLOAT, { o: dim(mix(c, 0x102040, 0.35)), c: dim(c), h: dim(mix(c, 0xffffff, 0.6)) }));
}
function drawRope(g, y0) {
  for (let j = 0; j < 37; j++) {
    const c = (j % 12) < 2 || (j % 12) > 9 ? 0 : 1 + (j & 1);
    g.blit(FLOATS[c], j * 4.4 - 1, y0);
  }
}
/** A ripple ring: two hard 1-px circles, blended by the fractional radius, so it grows smoothly. */
function ripple(g, x, y, r, a) {
  const r0 = Math.floor(r), fr = r - r0;
  if (a * (1 - fr) > 0.03) g.circle(x, y, r0, FOAM, { a: a * (1 - fr) });
  if (a * fr > 0.03) g.circle(x, y, r0 + 1, FOAM, { a: a * fr });
}

// ------------------------------------------------------------ the frame
export default {
  name: 'Synchro',
  blurb: 'A water ballet from the high board: the swimmers\' formations are the numerals; they dive and resurface as the next minute, and at the hour a team of divers drops in.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, date = ctx.date;
    const tt = (date.getTime() % 1e9) / 1000;
    const hour = f.h + f.m / 60 + s / 3600;
    ctx.lcd.backlight(1 - 0.62 * ctx.night);
    const P = palette(hour, f.minuteKey);

    ns = 0; nu = 0; nl = 0; nr = 0; nb = 0; nd = 0; g_cost = g.cost;

    // ---- this minute's jobs
    const cur = f.hh + f.mm;
    const nf = clockFields(new Date(date.getTime() + 60000)), nxt = nf.hh + nf.mm;
    const pf = clockFields(new Date(date.getTime() - 60000)), prv = pf.hh + pf.mm;

    // the ballet-leg wave: through the whole team in pen order, every 7 s
    let order = 0;
    const wt = tt % 7;
    for (let k = 0; k < 4; k++) {
      const base = order;
      const waveAt = (i) => { const d = wt * 24 - (base + i) - 8; return d > 0 && d < 7 ? tsin((d / 7) * Math.PI) : 0; };
      if (s >= 58 && nxt[k] !== cur[k]) transition(k, +cur[k], +nxt[k], s - 60, nf.m === 0, tt, waveAt);
      else if (s < 3 && prv[k] !== cur[k]) transition(k, +prv[k], +cur[k], s, f.m === 0, tt, waveAt);
      else rest(k, +cur[k], tt, waveAt);
      order += DIGITS[+cur[k]].n;
      if (k === 1) order += 5;
    }

    // ---- the rosette: five soloists, heads in, turning
    const hourShow = (s >= 58 && nf.m === 0) ? s - 60 : (s < 4 && f.m === 0 ? s : -9);
    const bloom = hourShow > -2 ? Math.sin(Math.PI * progress(hourShow, -1.5, 3.5)) : 0;
    const spin = tt * 0.21 + 2.2 * ease.inOutCubic(progress(hourShow, -1.5, 3.5));
    const rFirst = ns;
    for (let j = 0; j < 5; j++) {
      const an = spin + (j * Math.PI * 2) / 5, c = tcos(an), sn = tsin(an);
      const rb = 6.3 + 3.2 * bloom;
      SURF_R[j] = addSurface(ROSE[0] + c * rb, ROSE[1] + sn * rb, -c, -sn, 0, 0, tt * 5.2 + j * 1.3, 0);
    }
    for (let j = 0; j < 5; j++) addLink(rFirst + j, rFirst + ((j + 1) % 5), 1);

    // ---- the shade on the floor: shadows (sun from the upper left) and swimmers under water
    shadeClear();
    for (let i = 0; i < ns; i++) {
      const a = 1 - DEP[i];
      if (a < 0.02) continue;
      calm(X[i], Y[i], 2.6 * a);
      const x = X[i] + 2.6, y = Y[i] + 3.2;
      splat(x + 3 * HX[i], y + 3 * HY[i], 1.1 * a); splat(x, y, 1.5 * a); splat(x - 3 * HX[i], y - 3 * HY[i], 1.1 * a);
    }
    for (let i = 0; i < nd; i++) {
      const h = DH[i];
      splat(DX[i] + 2.6 + 9 * h, DY[i] + 3.2 + 7 * h, 3.5 * (1 - 0.6 * h));
    }
    for (let i = 0; i < nu; i++) {
      const x = UX[i], y = UY[i], hx = UHX[i], hy = UHY[i], a = UA[i];
      splat(x + 3 * hx, y + 3 * hy, 1.5 * a); splat(x, y, 2.0 * a); splat(x - 3 * hx, y - 3 * hy, 1.5 * a);
    }
    for (let x = 0; x < 160; x += 4) { splat(x + 1.5, 7.5, 1.4); splat(x + 1.5, 81, 1.4); }
    drawPool(g, tt);
    // rings and crowns
    for (let i = 0; i < nr; i++) {
      const e = RAGE[i];
      if (RK[i] === 0) ripple(g, RX[i], RY[i], 1.8 + 7.5 * Math.sqrt(e / 0.8), 0.7 * (1 - e / 0.8));
      else {
        ripple(g, RX[i], RY[i], 2 + 9 * Math.sqrt(e), 0.9 * (1 - e / 1.1));
        if (e < 0.35) g.fillCircle(RX[i], RY[i], 3.4 * (1 - e / 0.35) + 0.5, FOAM, { aa: true, a: 0.9 });
        for (let j = 0; j < 4 && e < 0.7; j++) {
          const an = j * 1.571 + RX[i], d = 2 + 13 * e;
          g.fillCircle(RX[i] + tcos(an) * d, RY[i] + tsin(an) * d * 0.9, 0.9, FOAM, { aa: true, a: 1 - e / 0.7 });
        }
      }
    }
    for (let i = 0; i < nb; i++) g.fillCircle(BX[i], BY[i], 0.5 + 0.6 * BAGE[i], FOAM, { aa: true, a: 0.75 * (1 - BAGE[i] * BAGE[i]) });

    // swimmers: bodies, then joined hands, then heads
    const night = P.dusk;
    SK = mix(SKIN, 0x3a2a48, night * 0.12); SU = SUIT; CA = CAP;
    for (let i = 0; i < ns; i++) drawBody(g, i);
    for (let i = 0; i < nl; i++) drawLink(g, LA[i], LB[i], LO[i]);
    for (let i = 0; i < ns; i++) drawHead(g, i);

    // lane ropes
    drawRope(g, 0);
    drawRope(g, 75);

    // divers, falling towards the water from beside us
    for (let i = 0; i < nd; i++) drawDiver(g, i, 80, 34);
  },
};
