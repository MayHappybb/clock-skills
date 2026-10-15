// Griddle: a short-order pancake clock on three HUB75 panels in an L.
//
// The bottom-right panel is a black steel griddle; every minute the cook
// pipes that minute onto it in batter with a squeeze bottle (the real
// pancake-art trick: the lines go down first and brown while the rest is
// drawn, so the first strokes are the darkest), then floods the fill round
// them. Through the minute the pancake sets, bubbles and crisps: the seconds.
// At the turn a spatula slides under it and tosses it, tumbling, out through
// the missing corner of the L (the serving hatch).
//
// The tall left arm is the plate: one pancake per hour, so the stack's
// height IS the hour (1..12). On the hour the :59 pancake is not served: it
// is flung up the tall arm, flips one and a half times and lands browned
// side up on the stack, and syrup pours from above and writes the new hour
// on it, then runs down the sides. At one o'clock the plate of twelve is
// carried off and a fresh plate slides in.
import * as kit from '../js/kit.js';
import { tipAt } from './griddle-glyphs.js';
import { Raster, COL, pancake, drawPancake, drawBand, drawPlate, glow, capsule, layoutNum, sampleLines, S as SL } from './griddle-draw.js';

const sst = kit.smoothstep, E = kit.ease;
const SX = 31, Y0 = 92, LT = 5.2, RS = 29;           // the stack
const MX = 96, MY = 94, RM = 31, TM = 4;             // the minute pancake on the griddle
const PIPE0 = 0.8, PIPED = 1.3, FILL0 = 2.15, FILL1 = 2.75, LAND = 1.5, SYR0 = 1.6, SYRD = 1.2;
const LTT = LT / Math.cos(Math.asin(0.85));          // true thickness that projects to LT
const pad = (n) => String(n).padStart(2, '0');
const h12 = (h) => (h % 12) || 12;
const syrDur = (h) => (h < 10 ? 0.85 : SYRD);   // one digit pours quicker

let R = null, G = null;
const layerX = (k) => SX + (kit.hash(k, 7) - 0.5) * 3;
const layerR = (k) => RS + (kit.hash(k, 3) - 0.5) * 2;

// per-minute caches (deterministic, keyed by the minute)
const placeCache = new Map();
function places(str, big) {
  const k = str + (big ? 'b' : '');
  let p = placeCache.get(k);
  if (!p) { p = layoutNum(str, big); placeCache.set(k, p); }
  return p;
}
let bubKey = -1, bubbles = [];
function bubblesFor(minIdx, pl) {
  if (bubKey === minIdx) return bubbles;
  bubKey = minIdx; bubbles = [];
  for (let i = 0; bubbles.length < 34 && i < 400; i++) {
    const a = kit.hash(minIdx, i, 1) * kit.TAU, r = Math.sqrt(kit.hash(minIdx, i, 2)) * 0.86;
    const u = r * Math.cos(a), v = r * Math.sin(a);
    // never on or right beside a line: bubbles must not close a counter
    let clear = true;
    for (const P of pl) {
      const x = (u - P.u0) / P.s, y = (v - P.v0) / P.s;
      if (x > -2 && x < 12 && y > -2 && y < 18) {
        if (sampleE(P, u, v) < 1.1) clear = false;
      }
    }
    if (!clear) continue;
    bubbles.push({ u, v, tb: 5 + 50 * Math.sqrt(kit.hash(minIdx, i, 3)), r: 0.8 + 0.7 * kit.hash(minIdx, i, 4) });
  }
  return bubbles;
}
function sampleE(P, u, v) { sampleLines([P], u, v); return SL.e; }

const PC = { old: pancake(), cur: pancake(), top: pancake() };

function stackTopY(n, sq) { return Y0 - (n - 1) * LT * sq; }

function drawDrips(Rs, k, cx, cy, Rr, grow, now) {
  // syrup that has run to the front edge and pooled along the rim: a glossy
  // seam, thicker in places, never a stroke that could read as a digit
  if (grow <= 0.02) return;
  let px = 0, py = 0, pr = 0;
  for (let i = 0; i <= 22; i++) {
    const u = -0.86 + (1.72 * i) / 22;
    const x = cx + u * Rr, y = cy + Rr * 0.85 * Math.sqrt(1 - u * u) + 0.6;
    const r = (0.55 + 0.75 * grow) * (0.6 + 0.8 * kit.noise2(u * 3 + k * 1.7, 0.5)) * Math.sqrt(1 - u * u);
    if (i) capsule(Rs, px, py, x, y, pr, r, COL.syrupMid, 1, 0.9 * (0.6 + 0.4 * Math.sin(now * 0.8 + u * 5)));
    px = x; py = y; pr = r;
  }
}

export default {
  name: 'Griddle',
  blurb: 'pancake art: each minute is piped in batter on a griddle, browned and tossed out the hatch; the hours are the stack, written in syrup',
  layouts: ['hub-stair'], look: 'smoke', fps: 60, brightness: 0.32, dither: true,
  frame(ctx) {
    const grid = kit.grid(ctx);
    if (!R || R.w !== grid.w) {
      const mask = new Uint8Array(grid.w * grid.h);
      for (let p = 0; p < mask.length; p++) mask[p] = grid.idx[p] >= 0 ? 1 : 0;
      R = new Raster(grid.w, grid.h, mask);
    }
    R.clear();
    const D = ctx.date, ms = D.getTime(), a = kit.secOf(D);
    const now = (ms % 1e7) / 1000;
    const minIdx = Math.floor(ms / 60000);
    const mm = pad(D.getMinutes()), H = h12(D.getHours());
    const P = new Date(ms - 60000), pmm = pad(P.getMinutes()), pH = h12(P.getHours());
    const hourTurn = D.getMinutes() === 0 && a < 12;
    const reset = hourTurn && H === 1;
    const tHour = D.getMinutes() * 60 + a;

    drawGriddle(R, now, tHour);
    drawLamp(R, now);

    // ------------------------------------------------------------ the stack
    const landed = !hourTurn || a >= LAND;
    const N = landed ? H : pH;
    const bt = hourTurn && a >= LAND ? a - LAND : 99;
    const squash = 1 - 0.16 * Math.exp(-bt * 6) * Math.cos(bt * 19);
    const newDX = -90 * (1 - E.out(sst(0.85, 1.45, a)));
    const sdx = reset ? (landed ? newDX : -95 * E.in(sst(0.55, 1.2, a))) : 0;
    drawPlate(R, SX + sdx, Y0 + LT + 1.5, 33, 1);
    if (reset && !landed && a > 0.85) drawPlate(R, SX + newDX, Y0 + LT + 1.5, 33, 1);  // a fresh plate arrives
    const hourGrow = (k) => (k < N - 1 ? 1 : 1 - Math.exp(-Math.max(0, (landed ? tHour : 3600) - 3.2) / 80));
    for (let k = 0; k < N; k++) {
      const cx = layerX(k) + sdx, cy = Y0 - k * LT * squash, Rr = layerR(k);
      if (k < N - 1) drawBand(R, cx, cy, Rr, LT * squash, k * 3.1, 1);
      else {
        const T = PC.top;
        T.cx = cx; T.cy = cy; T.R = Rr; T.th = Math.PI; T.T = LTT * squash; T.seed = k * 3.1;
        T.places = null; T.syrup = places(String(landed ? H : pH), true);
        T.syrupTau = hourTurn && landed ? (a - SYR0) / syrDur(H) : 1.2;
        T.spread = hourTurn && landed ? 1.05 + 0.3 * sst(SYR0, 9, a) : 1.35;
        T.shade = 1;
        drawPancake(R, T, now);
      }
      if (k === N - 1 && landed) drawDrips(R, k, cx, cy, Rr, hourGrow(k), now);
    }

    // --------------------------------------------- spatula and old pancake
    const spIn = sst(0, 0.38, a), spOut = sst(0.55, 1.1, a);
    if (a < 1.1) {
      const bx = MX + 6 + 60 * (1 - E.out(spIn)) + 60 * E.in(spOut), by = MY + 4 - 4 * sst(0.3, 0.5, a) * (1 - spOut);
      drawSpatula(R, bx, by);
    }
    const O = PC.old;
    const flyEnd = hourTurn ? LAND : 1.5;
    if (a < flyEnd) {
      O.places = places(pmm, false); O.tauNow = 2; O.tNow = 99; O.drawT0 = 0; O.drawDur = 1;
      O.fillR = 1.2; O.cook = 1; O.seed = (minIdx - 1) * 1.7; O.syrup = null; O.syrupTau = -1; O.shade = 1;
      O.R = RM; O.T = TM; O.th = 0; O.cx = MX; O.cy = MY;
      if (a > 0.36) {
        if (hourTurn) {
          const p = sst(0.36, LAND, a), q = E.inOut(p);
          const tx = layerX(H - 1), ty = stackTopY(H, 1);
          // across low (clear of the hatch), then up the tall arm and down onto the stack
          O.cx = kit.lerp(MX, tx, E.inOut(sst(0, 0.65, p)));
          O.cy = kit.lerp(MY, ty, E.inOut(sst(0.3, 1, p))) - 22 * Math.sin(Math.PI * p);
          O.th = 3 * Math.PI * E.out(p);
          O.R = kit.lerp(RM, layerR(H - 1), p) * (1 + 0.22 * Math.sin(Math.PI * p));
          O.T = kit.lerp(TM, LTT, p);
        } else {
          // up off the steel with a full turn in plain view, then out the hatch
          const p = (a - 0.36) / (flyEnd - 0.36);
          O.cx = MX + 8 * p;
          O.cy = MY - 22 * E.out(Math.min(1, p / 0.55)) - 95 * E.in(Math.max(0, (p - 0.45) / 0.55));
          O.th = 2 * Math.PI * E.inOut(Math.min(1, p / 0.8));
          O.R = RM * (1 + 0.18 * Math.sin(Math.PI * Math.min(1, p / 0.8)));
        }
      }
    }

    // ------------------------------------------------- the new pancake
    const Cp = PC.cur;
    Cp.places = places(mm, false); Cp.cx = MX; Cp.cy = MY; Cp.R = RM; Cp.T = TM; Cp.th = 0;
    Cp.seed = minIdx * 1.7; Cp.tNow = a; Cp.drawT0 = PIPE0; Cp.drawDur = PIPED;
    Cp.tauNow = (a - PIPE0) / PIPED; Cp.fillR = 1.2 * E.out(sst(FILL0, FILL1, a));
    Cp.cook = kit.clamp((a - FILL1) / 56); Cp.syrup = null; Cp.syrupTau = -1; Cp.shade = 1;
    if (a > PIPE0) drawPancake(R, Cp, now);
    if (a > FILL1) {
      drawBubbles(R, bubblesFor(minIdx, Cp.places), a, now);
      sizzle(R, MX, MY, RM, now, sst(FILL1, FILL1 + 2, a));
    }
    // the old one: resting until the spatula lifts it, then in the air above
    if (a < flyEnd) drawPancake(R, O, now);

    // --------------------------------------------------------- steam
    const fresh = Math.exp(-Math.max(0, a - FILL1) / 25);
    steam(R, MX, MY - 10, 26, 0.5 + 1.2 * fresh, now, 1);
    const topY = stackTopY(N, squash);
    steam(R, layerX(N - 1) + sdx, topY - 6, 22, 0.4 + 1.6 * Math.exp(-tHour / 600), now, 2);

    // --------------------------------------------------------- the bottle
    if (a > 0.45 && a < 3.35) drawBottle(R, a, mm);
    // --------------------------------------------------------- syrup pour
    if (hourTurn && a > SYR0 - 0.3 && a < SYR0 + SYRD + 0.5) drawPour(R, a, H, N, squash, now);

    // ---------------------------------------------------------- out
    const dim = 1 - 0.6 * ctx.night;
    kit.blitGrid(ctx, R.img, dim);
  },
};

// ------------------------------------------------------------ griddle
function drawGriddle(Rs, now, tHour) {
  const img = Rs.img, W = Rs.w, st = COL.steel;
  for (let y = 64; y < 128; y++) {
    for (let x = 64; x < 128; x++) {
      const p = y * W + x, o = 3 * p;
      // seasoned black steel: a faint oily sheen that drifts in the heat
      const n = kit.noise2(x * 0.08 + now * 0.12, y * 0.11 - now * 0.05);
      const shim = kit.noise2(x * 0.3, y * 0.25 - now * 1.6);
      let s = 0.006 + 0.05 * sst(0.5, 0.95, n) * (0.6 + 0.8 * shim);
      // the lip round the back and left edges
      const lip = Math.max(sst(67.5, 64.5, x), sst(67.5, 64.5, y));
      s += 0.11 * lip * (x < 66 || y < 66 ? 1 : 0.5);
      img[o] = st[0] * s * 1.05; img[o + 1] = st[1] * s; img[o + 2] = st[2] * s * 1.1;
    }
  }
  // a pat of butter melting in the corner, foaming
  const melt = kit.clamp(tHour / 3600), bw = 3.4 - 1.6 * melt;
  const bx = 120 + 0.6 * Math.sin(now * 0.3), by = 120 + 0.5 * Math.cos(now * 0.23);
  glow(Rs, bx, by, bw + 3.5, COL.butter, 0.07);
  capsule(Rs, bx - bw * 0.4, by, bx + bw * 0.4, by, bw * 0.75, bw * 0.75, kit.scale(COL.butter, 0.75), 1, 0.4);
  for (let i = 0; i < 9; i++) {
    const ph = now * 3 + i * 1.37, cyc = Math.floor(ph);
    const life = ph - cyc, ang = kit.hash(i, cyc) * kit.TAU, rr = bw + 1 + 2.2 * kit.hash(i, cyc, 1);
    glow(Rs, bx + Math.cos(ang) * rr, by + Math.sin(ang) * rr * 0.85, 1.4, COL.cream, 0.35 * Math.sin(Math.PI * life));
  }
}

function drawSpatula(Rs, bx, by) {
  // handle off to the right, a slotted steel blade
  capsule(Rs, bx + 9, by + 1, bx + 46, by + 9, 1.6, 2.2, COL.wood, 1, 0.3);
  for (let i = 0; i < 6; i++) capsule(Rs, bx - 8, by - 6 + i * 2.4, bx + 8, by - 6 + i * 2.4, 1.3, 1.3, kit.scale(COL.steel, 0.55), 1, 0.6);
  for (let i = 0; i < 3; i++) capsule(Rs, bx - 4, by - 3.6 + i * 3.6, bx + 4, by - 3.6 + i * 3.6, 0.5, 0.5, [0, 0, 0], 0.7);
}

function drawBubbles(Rs, B, a, now) {
  for (const b of B) {
    if (a < b.tb) continue;
    const x = MX + b.u * RM, y = MY + b.v * RM * 0.85, age = a - b.tb;
    if (age < 1.6) {
      const g = E.out(age / 1.6);
      glow(Rs, x - 0.3, y - 0.3, 1.4 + 1.3 * b.r * g, [1, 0.95, 0.8], 0.3 * g);
    } else {
      const pop = Math.exp(-(age - 1.6) * 12);
      if (pop > 0.02) glow(Rs, x, y, 2.4 + 2 * (1 - pop), [1, 0.9, 0.7], 0.25 * pop);
      capsule(Rs, x, y, x, y, b.r * 1.1, b.r * 1.1, kit.scale(COL.toast, 0.3), 0.85 * sst(1.6, 1.9, age));
    }
  }
}

/** The squeeze bottle: tip at the batter, body leaning up and right. */
function drawBottle(Rs, a, mm) {
  const pl = places(mm, false);
  const toScreen = (P, gx, gy) => [MX + (P.u0 + gx * P.s) * RM, MY + (P.v0 + gy * P.s) * RM * 0.85];
  let tx, ty, lift = 0, squeeze = 0;
  const tau = (a - PIPE0) / PIPED;
  const first = toScreen(pl[0], ...tipAt(pl[0].d, 0));
  if (a < PIPE0) {
    const k = E.out(sst(0.45, PIPE0, a));
    tx = kit.lerp(first[0] + 40, first[0], k); ty = kit.lerp(first[1] - 70, first[1], k); lift = 3 * (1 - k);
  } else if (tau <= 1) {
    const P = tau < 0.5 ? pl[0] : pl[1], lt = (tau - P.t0) / (P.t1 - P.t0);
    const [gx, gy, down] = tipAt(P.d, kit.clamp(lt));
    [tx, ty] = toScreen(P, gx, gy);
    lift = down ? 0 : 2.5; squeeze = down ? 1 : 0;
    // between the two digits the bottle hops across
    if (pl.length > 1 && Math.abs(tau - 0.5) < 0.04) lift = 3;
  } else if (a < FILL1) {
    const last = pl[pl.length - 1], [gx, gy] = tipAt(last.d, 1), [lx, ly] = toScreen(last, gx, gy);
    const k = E.inOut(sst(PIPE0 + PIPED, FILL0, a));
    tx = kit.lerp(lx, MX + 1, k); ty = kit.lerp(ly, MY, k); lift = 3 * Math.sin(Math.PI * k);
    squeeze = a > FILL0 ? 1 : 0;
    tx += squeeze * 1.2 * Math.sin(a * 14); ty += squeeze * 1.0 * Math.cos(a * 14);
  } else {
    const k = E.in(sst(FILL1, 3.3, a));
    tx = MX + 1 + 50 * k; ty = MY - 90 * k; lift = 3 + 6 * k;
  }
  ty -= lift;
  const dx = 0.82, dy = -0.57;
  const n0x = tx + dx * 6, n0y = ty + dy * 6;
  const sq = 1 - 0.12 * squeeze;
  capsule(Rs, tx, ty, n0x, n0y, 0.7, 1.6, kit.scale(COL.cap, 0.7), 1, 0.5);           // nozzle
  capsule(Rs, n0x, n0y, n0x + dx * 3, n0y + dy * 3, 2.6, 2.6, COL.cap, 1, 0.6);        // cap
  const b0x = n0x + dx * 4, b0y = n0y + dy * 4;
  capsule(Rs, b0x, b0y, b0x + dx * 10, b0y + dy * 10, 4.4, 5.2 * sq, kit.scale(COL.bottle, 0.7), 1, 0.7);
  capsule(Rs, b0x + dx * 10, b0y + dy * 10, b0x + dx * 22, b0y + dy * 22, 5.2 * sq, 5.0, kit.scale(COL.bottle, 0.7), 1, 0.7);
  // a white label band round the red bottle
  capsule(Rs, b0x + dx * 11, b0y + dy * 11, b0x + dx * 15, b0y + dy * 15, 4.6 * sq, 4.6 * sq, kit.scale(COL.cap, 0.45), 0.9, 0.3);
}

/** On the hour: syrup poured from above, writing the hour on the top pancake. */
function drawPour(Rs, a, H, N, sq, now) {
  const pl = places(String(H), true);
  const cx = layerX(N - 1), cy = stackTopY(N, sq), Rr = layerR(N - 1);
  const tau = kit.clamp((a - SYR0) / syrDur(H));
  let P = pl[0];
  for (const q of pl) if (tau >= q.t0) P = q;
  const [gx, gy] = tipAt(P.d, kit.clamp((tau - P.t0) / (P.t1 - P.t0)));
  const tx = cx + (P.u0 + gx * P.s) * Rr, ty = cy + (P.v0 + gy * P.s) * Rr * 0.85;
  const fall = sst(SYR0 - 0.3, SYR0, a), stop = sst(SYR0 + syrDur(H), SYR0 + syrDur(H) + 0.4, a);
  const yTop = stop * ty, yBot = kit.lerp(0, ty, fall);
  const sx = 7;
  const w = 1.1 * (1 - stop * 0.5);
  if (yBot > yTop + 0.5) {
    for (let s = 0; s < 1; s += 0.125) {
      const y0 = kit.lerp(yTop, yBot, s), y1 = kit.lerp(yTop, yBot, s + 0.125);
      const x0 = kit.lerp(sx, tx, Math.sqrt(s)) + 0.4 * Math.sin(now * 9 + s * 6), x1 = kit.lerp(sx, tx, Math.sqrt(s + 0.125)) + 0.4 * Math.sin(now * 9 + s * 6 + 0.75);
      capsule(Rs, x0, y0, x1, y1, w, w, COL.syrupMid, 1, 1.2);
    }
  }
  // the spout of the syrup jug, just in view at the top
  const jy = -3 + 4 * sst(SYR0 - 0.6, SYR0 - 0.3, a) * (1 - stop);
  capsule(Rs, sx - 9, jy - 2, sx + 1, jy + 1, 2.2, 1.6, kit.scale(COL.steel, 0.7), 1, 0.8);
}

const STEAMC = [1, 1, 1];
function steam(Rs, x0, y0, spread, k, now, src) {
  const per = 0.42, life = 3.4, i1 = Math.floor(now / per);
  for (let i = i1 - Math.ceil(life / per); i <= i1; i++) {
    const tb = i * per + kit.hash(i, src) * per, age = now - tb;
    if (age < 0 || age > life) continue;
    const q = age / life;
    const x = x0 + (kit.hash(i, src, 1) - 0.5) * spread * 1.6 + Math.sin(age * 1.4 + i) * 3 * q;
    const y = y0 - age * 13 - 6 * kit.hash(i, src, 2);
    // steam catches the heat lamp's orange as it rises into it
    const lamp = sst(40, 8, y);
    STEAMC[0] = 0.9 + 0.1 * lamp; STEAMC[1] = 0.85 - 0.35 * lamp; STEAMC[2] = 0.8 - 0.65 * lamp;
    glow(Rs, x, y, 3 + age * 3, STEAMC, 0.075 * k * (1 + 1.5 * lamp) * Math.sin(Math.PI * q) ** 1.5);
  }
}

/** The heat lamp over the pass, at the top of the tall arm. */
function drawLamp(Rs, now) {
  const cx = SX + 1, hum = 0.5 + 0.04 * Math.sin(now * 1.3) + 0.02 * Math.sin(now * 3.7);
  const bulb = kit.blackbody(1900);
  glow(Rs, cx, 9, 34, bulb, 0.018 * hum);
  for (let y = 0; y < 8; y++) {
    const hw = 6 + 1.5 * y;
    for (let x = Math.floor(cx - hw - 1); x <= Math.ceil(cx + hw + 1); x++) {
      const cov = kit.clamp(hw - Math.abs(x - cx) + 0.5);
      if (cov <= 0) continue;
      const u = (x - cx) / hw, k = (0.05 + 0.1 * Math.max(0, -u) + (y === 7 ? 0.14 : 0)) * (1 - 0.4 * u * u);
      Rs.over(x, y, COL.steel[0] * k, COL.steel[1] * k, COL.steel[2] * k * 1.1, cov);
    }
  }
  capsule(Rs, cx - 7, 8.4, cx + 7, 8.4, 1.6, 1.6, bulb, 1, 0);
  glow(Rs, cx, 9.5, 9, bulb, 0.25 * hum);
}

/** Lacy edges frying: bright specks flickering round the rim. */
function sizzle(Rs, cx, cy, Rr, now, k) {
  if (k <= 0) return;
  const tick = Math.floor(now * 14);
  for (let i = 0; i < 30; i++) {
    const fl = kit.hash(i, tick, 5) - 0.62;
    if (fl <= 0) continue;
    const an = (i + kit.hash(i, tick, 6)) / 30 * kit.TAU, rr = Rr * (1.0 + 0.03 * kit.hash(i, tick, 7));
    glow(Rs, cx + Math.cos(an) * rr, cy + Math.sin(an) * rr * 0.85, 1.6, COL.cream, 0.7 * fl * k);
  }
}
