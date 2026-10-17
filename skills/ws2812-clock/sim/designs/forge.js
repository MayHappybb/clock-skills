// Forge: a smithy on two HUB75 panels stacked, 64 x 128.
//
// Top to bottom, the way heat moves through a forge: the finished hours hang
// from the hood rail as cold black wrought iron, lit from below by the fire;
// the coal fire breathes with the bellows; the minutes stand on the anvil,
// forged hot and cooling while you watch, so the seconds are the colour of
// the iron: white-yellow at :03, orange, cherry, blood red, black heat by :59.
//
// Every numeral is ONE square bar bent round the scroll jig: tapered scroll
// ends, twisted stems, forge-welded collars where bars meet.
//
// Minute turn: at :56 tongs lift the cold digit into the coals and it heats
// from the top down to white; at :00 it lies back on the anvil and the smith
// and the striker hammer it, alternate blows, straight into a billet and then
// bent into the next numeral, sparks off every blow.
// Hour: the old hour slips off its hook into the fire (the fire roars, a
// fountain of sparks), and a ladle pours the new hour, white-hot, into place.
import * as kit from '../js/kit.js';
import { Raster, drawBar, buildStatic, drawFire, heatAt, cool, toneMap, FIRE, STEEL } from './forge-draw.js';
import { shapeInto, squashInto, makePath, GLYPHS, FROM, BOX_W, BOX_H } from './forge-glyphs.js';

const E = kit.ease, sst = kit.smoothstep, clamp = kit.clamp;
const pad = (n) => String(n).padStart(2, '0');
const dstr = (ms) => { const d = new Date(ms); return pad(d.getHours()) + pad(d.getMinutes()); };

// geometry (LED units, y down)
const HK = 0.75, HCX = [17, 47], HBY = 31.2;          // hours, hanging
const MK = 1.0, MCX = [16.5, 47.5], MBY = 90;          // minutes, on the anvil
const HW = 1.9;                                        // bar half-width at k = 1
const FIRE_Y = 41;

// the minute's forging: blows (time s, bar progress after it)
const UNB = [[0.10, 0.32], [0.42, 0.15], [0.74, 0]];
const BEND = [[1.12, 0.24], [1.44, 0.48], [1.76, 0.7], [2.08, 0.88], [2.40, 1]];
const OFFSET2 = 0.16;                                  // the striker's alternate blow
const FORGE_END = 2.75;
const PRE = 56;                                        // tongs come for the old digit

let R = null, S = null;
const S0 = buildStatic(64, 128);       // the smithy, built once at load
const PH = [makePath(), makePath()], PM = [makePath(), makePath()], PO = [makePath(), makePath()];
const TT = new Float32Array(512), AL = new Float32Array(512);
const SH = new Float32Array(128);
const BAR = { T: TT, fire: 1, dir: 1, sheen: 1, shimmer: null, alpha: null, clipY: 1e9, k: 1 };
const HEATC = new Float32Array(3);
const REFL = [new Float32Array(3), new Float32Array(3)];

function resetBar(o) { o.T = TT; o.fire = 1; o.dir = 1; o.sheen = 1; o.shimmer = null; o.alpha = null; o.clipY = 1e9; o.k = 1; }

/** Bar progress p of one slot at time u into the forging; which glyph (0 old, 1 new). */
function forgeState(u, off) {
  let p = 1, phase = 0;
  for (const [s, q] of UNB) if (u >= s + off) { const prev = p; p = prev + (q - prev) * E.out(clamp((u - s - off) / 0.12)); }
  if (u >= BEND[0][0] + off) {
    phase = 1; p = 0;
    for (const [s, q] of BEND) if (u >= s + off) { const prev = p; p = prev + (q - prev) * E.out(clamp((u - s - off) / 0.13)); }
  }
  return [phase, p];
}
/** Blow times of one slot, for the hammer's swing and sparks. */
const BLOWS = [...UNB, ...BEND].map((b) => b[0]);

/** Hammer lift 0 (on the bar) .. 1 (raised) .. 2 (out of frame) at time u. */
function hammerLift(u, off) {
  const b = BLOWS, first = b[0] + off, last = b[b.length - 1] + off;
  if (u < first - 0.45 || u > last + 0.7) return 2;
  if (u < first) { const k = (u - (first - 0.45)) / 0.45; return k < 0.55 ? 2 - E.inOut(k / 0.55) : 1 - E.in((k - 0.55) / 0.45); }
  if (u >= last + 0.05) { const k = (u - last - 0.05) / 0.65; return E.inOut(clamp(k * 1.6)) * (1 + E.in(clamp(k * 1.6 - 0.6))); }
  for (let i = 0; i < b.length - 1; i++) {
    const s0 = b[i] + off, s1 = b[i + 1] + off;
    if (u >= s0 && u < s1) {
      const k = (u - s0 - 0.04) / (s1 - s0 - 0.04);
      if (k < 0) return 0;
      return k < 0.62 ? E.out(k / 0.62) : 1 - E.in((k - 0.62) / 0.38);
    }
  }
  return 0;
}

function placeHour(P, d, cx, ang, dy) {
  shapeInto(P, d, 1, HK, cx, HBY);
  const G = GLYPHS[d], hx = P.x[G.top], hy = P.y[G.top] - 0.6;
  const c = Math.cos(ang), s = Math.sin(ang);
  for (let i = 0; i < P.n; i++) {
    const x = P.x[i] - hx, y = P.y[i] - hy;
    P.x[i] = hx + x * c - y * s; P.y[i] = hy + x * s + y * c + dy;
  }
  return [hx, hy];
}

export default {
  name: 'Forge',
  blurb: 'a smithy: the hours hang as cold wrought iron, the minutes are forged on the anvil and cool through the minute; at the hour the old one drops in the fire and a ladle pours the new',
  layouts: ['hub-tall'], look: 'smoke', fps: 60, brightness: 0.45, dither: true,
  frame(ctx) {
    const G = kit.grid(ctx), W = G.w;
    if (!R || R.w !== G.w) { R = new Raster(G.w, G.h); S = G.w === 64 && G.h === 128 ? S0 : buildStatic(G.w, G.h); }
    const ms = ctx.date.getTime(), a = kit.secOf(ctx.date), now = (ms % 1e7) / 1000;
    const cur = dstr(ms), prev = dstr(ms - 60000), next = dstr(ms + 60000);
    const min = ctx.date.getMinutes();

    // ------------------------------------------------ the bellows' breath
    const ph = kit.fract(now / 3.4);
    const open = ph < 0.3 ? 1 - E.inOut(ph / 0.3) : E.inOut((ph - 0.3) / 0.7);
    const bump = Math.exp(-(((ph - 0.33) / 0.17) ** 2)) + Math.exp(-(((ph - 1.33) / 0.17) ** 2));
    const hourShow = min === 0 && a < 4.5;
    const flare = hourShow ? sst(0.3, 0.7, a) * (1 - sst(1.6, 4.2, a)) : 0;
    const b = 0.72 + 0.45 * bump + 1.1 * flare;

    // ------------------------------------------------ still parts, firelit
    const I = R.img, L0 = S.L0, L1 = S.L1;
    for (let k = 0; k < I.length; k++) I[k] = L0[k] + L1[k] * b;
    drawFire(R, now, b, 6 * flare);

    // ------------------------------------------------ the hours
    for (let y = 0; y < 34; y++) SH[y] = 0.32 * sst(6, 32, y) * (0.6 + 0.4 * b) * Math.sin(y * 0.71 - now * 8.3 + 1.7 * Math.sin(now * 1.1 + y * 0.13));
    const hourChanged = [cur[0] !== prev[0] && min === 0, cur[1] !== prev[1] && min === 0];
    const both = hourChanged[0] && hourChanged[1];
    const tSinceHour = min * 60 + a;
    for (let j = 0; j < 2; j++) {
      // both old digits drop together (never an old digit beside a new one);
      // the ladle then pours the two in turn
      const fall0 = 0, pour0 = 0.45 + (both && j === 1 ? 0.7 : 0), pour1 = pour0 + 0.78;
      const sway = 0.014 * Math.sin(now * 1.27 + j * 2.1) + 0.006 * Math.sin(now * 2.9 + j);
      const P = PH[j];
      resetBar(BAR); BAR.k = HK; BAR.dir = 1; BAR.fire = 2.4 * b; BAR.sheen = 2.2; BAR.shimmer = SH;
      // the hook it hangs from
      const Gd = GLYPHS[+cur[j]], hx = HCX[j] + (Gd.xs[Gd.top] - BOX_W / 2) * HK;
      R.capsule(hx, -1, hx, HBY + (Gd.ys[Gd.top] - BOX_H) * HK - 0.8, 0.45, 0.03 + 0.03 * b, 0.022 + 0.012 * b, 0.02, 1);
      if (hourChanged[j] && tSinceHour < pour1 + 0.2) {
        // the old hour drops off its hook into the coals
        const u = tSinceHour - fall0;
        if (u < 0.75) {
          const O = PO[j], dy = u > 0 ? 0.5 * 150 * u * u : 0;
          placeHour(O, +prev[j], HCX[j], sway + (u > 0 ? 0.25 * u * (j ? 1 : -1) : 0), dy);
          for (let i = 0; i < O.n; i++) TT[i] = 560 + 1100 * sst(FIRE_Y - 3, FIRE_Y + 4, O.y[i]);
          BAR.clipY = 45; BAR.fire = 0.75 * b + 0.8 * clamp(dy / 10);
          drawBar(R, O, HW * HK, BAR);
          BAR.clipY = 1e9;
        }
        // the ladle pours the new one, running along the bar from its first end
        const f = clamp((tSinceHour - pour0) / (pour1 - pour0));
        if (f > 0) {
          placeHour(P, +cur[j], HCX[j], sway, 0);
          const n = P.n, front = f * (n - 1);
          const rev = FROM[+cur[j]] === 1;     // pour in the order the smith forms it
          for (let i = 0; i < n; i++) {
            const o = rev ? n - 1 - i : i;
            AL[i] = clamp(front - o + 1.5);
            const born = pour0 + (o / (n - 1)) * (pour1 - pour0);
            TT[i] = cool(tSinceHour - born, P.t[i], 1850);
          }
          BAR.alpha = AL;
          drawBar(R, P, HW * HK, BAR);
          BAR.alpha = null;
          if (f < 1) {
            // the stream from the ladle lip to the running front
            const f0 = Math.min(n - 1, Math.floor(front)), fi = rev ? n - 1 - f0 : f0, fx = P.x[fi], fy = P.y[fi];
            const lip = HCX[j] + 3 * Math.sin(f * 3);
            for (let y = 0; y <= fy; y++) {
              const k = y / Math.max(1, fy), x = lip + (fx - lip) * k * k + 0.25 * Math.sin(now * 40 + y);
              heatAt(1800, HEATC, 0);
              R.dot(x, y, HEATC[0] * 0.9, HEATC[1] * 0.9, HEATC[2] * 0.9);
            }
            R.glow(fx, fy, 3.2, 0.5, 0.25, 0.05);
          }
        }
        continue;
      }
      placeHour(P, +cur[j], HCX[j], sway, 0);
      const age = hourChanged[j] ? tSinceHour - (pour0 + pour1) / 2 : (min * 60 + a) + 3600;
      for (let i = 0; i < P.n; i++) TT[i] = cool(age, P.t[i], 1850);
      drawBar(R, P, HW * HK, BAR);
    }
    // the ladle itself, tipping in at the top during the pour
    if (hourShow) {
      const tip = sst(0.15, 0.45, a) * (1 - sst(2.3, 2.9, a));
      if (tip > 0) {
        const lx = 32 + 14 * Math.sin(a * 1.4), ly = -6 + 6 * tip;
        R.capsule(lx - 6, ly, lx + 6, ly - 1.5, 3, 0.05, 0.03, 0.025, tip);
        R.capsule(lx + 6, ly - 1.5, lx + 26, ly - 8, 0.8, 0.05, 0.035, 0.03, tip);
        heatAt(1750, HEATC, 0);
        R.glow(lx - 5, ly + 2.5, 3, HEATC[0] * 0.5 * tip, HEATC[1] * 0.5 * tip, HEATC[2] * 0.5 * tip);
      }
    }

    // ------------------------------------------------ the minutes
    const mChanged = [cur[2] !== prev[2], cur[3] !== prev[3]];
    const mNext = [next[2] !== cur[2], next[3] !== cur[3]];
    const bothM = mChanged[0] && mChanged[1];
    const strikes = [];        // [x, y, time since blow, blow id, slot]
    for (let j = 0; j < 2; j++) {
      const side = j === 0 ? -1 : 1, off = j === 0 && bothM ? OFFSET2 : 0;
      const P = PM[j];
      resetBar(BAR); BAR.k = MK; BAR.dir = -1; BAR.fire = 1.4 * b; BAR.sheen = 1.6;
      let lift = 0, tongs = -1, hammer = 2;
      if (mChanged[j] && a < FORGE_END + off) {
        const [phase, p] = forgeState(a, off);
        if (phase) shapeInto(P, +cur[2 + j], p, MK, MCX[j], MBY);
        else squashInto(P, +prev[2 + j], 1 - p, MK, MCX[j], MBY);
        for (let i = 0; i < P.n; i++) TT[i] = 1900 - 20 * a - 120 * (1 - P.t[i]);
        hammer = hammerLift(a, off);
        if (a < 0.45) tongs = 1 - a / 0.45;
        for (const s of BLOWS) if (a >= s + off && a < s + off + 0.7) strikes.push(s + off, a - s - off, j, s);
      } else {
        shapeInto(P, +cur[2 + j], 1, MK, MCX[j], MBY);
        let age;
        if (mChanged[j]) age = a - FORGE_END - off;
        else age = j === 1 ? 999 : ((min % 10) * 60 + a - FORGE_END - OFFSET2);
        let heat = 0;
        if (mNext[j] && a >= PRE) {
          lift = E.inOut(sst(PRE + 0.15, PRE + 0.95, a)) * (1 - E.inOut(sst(59.2, 59.85, a)));
          heat = sst(PRE + 0.8, 59.3, a);
          tongs = a < PRE + 0.4 ? (a - PRE) / 0.4 : 1;
        }
        const top = P.y[GLYPHS[+cur[2 + j]].top];
        for (let i = 0; i < P.n; i++) {
          let T = cool(age, P.t[i], 1850);
          if (heat > 0) {
            const yn = (P.y[i] - top) / 37;            // the top is in the coals first
            T = Math.max(T, T + (1700 - T) * clamp(heat * 1.7 - yn * 0.8));
          }
          TT[i] = T;
          P.y[i] -= 8 * lift;
        }
      }
      drawBar(R, P, HW * MK, BAR);
      // mean glow of the bar, for its reflection in the anvil face
      const RF = REFL[j]; RF[0] = RF[1] = RF[2] = 0;
      for (let i = 0; i < P.n; i += 3) { heatAt(TT[i], HEATC, 0); RF[0] += HEATC[0]; RF[1] += HEATC[1]; RF[2] += HEATC[2]; }
      const kk = 3 / P.n; RF[0] *= kk; RF[1] *= kk; RF[2] *= kk;
      RF.lift = lift;

      // the tongs that carry it to the fire and back
      if (tongs > -1) {
        const e = E.inOut(clamp(tongs));
        const jx = MCX[j] + side * (11 + 22 * (1 - e)), jy = MBY - 5 - 8 * lift;
        for (const o of [-0.9, 0.9]) R.capsule(jx, jy + o * 0.6, jx + side * 26, jy + 9 + o * 1.6, 0.55, 0.045 + 0.05 * b, 0.03 + 0.02 * b, 0.025, e);
        R.capsule(jx + side * 2.5, jy, jx + side * 2.5, jy, 1.0, 0.09, 0.06, 0.04, e);
      }
      // the hammer: the smith's from the right, the striker's sledge from the left
      if (hammer < 2) {
        let top = 1e9, tx = MCX[j];
        for (let i = 0; i < P.n; i++) if (P.y[i] < top) { top = P.y[i]; tx = P.x[i]; }
        const sx = kit.lerp(tx, MCX[j], 0.6), hl = hammer;
        const hx = sx + side * (9 * hl + 26 * Math.max(0, hl - 1)), hy = top - HW - 3 - 13 * hl;
        const rot = side * 0.45 * Math.min(1, hl);
        const c = Math.cos(rot), s = Math.sin(rot);
        // handle: ash, its underside lit by the hot iron
        const ex = hx + side * 30 * c, ey = hy + 30 * s * side + 10;
        R.capsule(hx, hy, ex, ey, 0.9, 0.09 * b + 0.04, 0.04 * b + 0.018, 0.012, 1);
        R.capsule(hx, hy + 0.9, ex, ey + 0.9, 0.35, 0.2, 0.08, 0.02, 0.8);
        // head: a block of dark steel; its striking face glows with the iron
        // it is about to hit, its top edge catches the cool skylight
        const hwid = j === 0 ? 4.4 : 3.6, near = clamp(1.3 - hl);
        R.capsule(hx - hwid * c, hy - hwid * s, hx + hwid * c, hy + hwid * s, 2.4, 0.07, 0.065, 0.08, 1);
        R.capsule(hx - hwid * c, hy + 2.0, hx + hwid * c, hy + 2.0, 0.55, 0.5 + 0.5 * near, 0.2 + 0.25 * near, 0.05 + 0.08 * near, 1);
        R.capsule(hx - hwid * c, hy - 2.1, hx + hwid * c, hy - 2.1, 0.45, STEEL[0] * 0.3, STEEL[1] * 0.3, STEEL[2] * 0.3, 1);
      }
      // sparks off each blow: scale knocked off the hot iron
      for (let q = 0; q < strikes.length; q += 4) {
        if (strikes[q + 2] !== j) continue;
        const dt = strikes[q + 1], id = Math.round(strikes[q + 3] * 100);
        let top = 1e9, tx = MCX[j];
        for (let i = 0; i < P.n; i++) if (P.y[i] < top) { top = P.y[i]; tx = P.x[i]; }
        const sx = kit.lerp(tx, MCX[j], 0.6), sy = top - HW;
        if (dt < 0.1) R.glow(sx, sy, 5, 0.6 * (1 - dt / 0.1), 0.4 * (1 - dt / 0.1), 0.15 * (1 - dt / 0.1));
        for (let s = 0; s < 11; s++) {
          const life = 0.3 + 0.4 * kit.hash(id, s, j * 7 + 1);
          if (dt > life) continue;
          const ang = Math.PI * (1.05 + 0.9 * kit.hash(id, s, j * 7 + 2)), v = 28 + 40 * kit.hash(id, s, j * 7 + 3);
          const x = sx + Math.cos(ang) * v * dt, y = sy + Math.sin(ang) * v * dt + 70 * dt * dt;
          const k = (1 - dt / life) ** 1.3;
          heatAt(1450 + 300 * k, HEATC, 0);
          R.dot(x, y, HEATC[0] * k * 1.6, HEATC[1] * k * 1.6, HEATC[2] * k * 1.6);
        }
      }
    }
    // the polished face of the anvil mirrors the glowing iron above it
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, bl = 0;
      for (let j = 0; j < 2; j++) {
        const RF = REFL[j], f = Math.exp(-(((x - MCX[j]) / 9) ** 2)) * 0.55 * (1 - 0.8 * RF.lift);
        r += RF[0] * f; g += RF[1] * f; bl += RF[2] * f;
      }
      for (let y = 90; y <= 91; y++) {
        const p = y * W + x, c = S.anvil[p] * (y === 90 ? 1 : 0.4);
        I[3 * p] += r * c; I[3 * p + 1] += g * c; I[3 * p + 2] += bl * c;
      }
    }

    // ------------------------------------------------ sparks from the fire
    const nSp = hourShow ? 46 : 18;
    for (let i = 0; i < nSp; i++) {
      const big = i >= 18;
      const per = big ? 2.2 : 1.7 + 1.9 * kit.hash(i, 1), phs = kit.hash(i, 2) * per;
      const tt = big ? a - 0.45 - 0.5 * kit.hash(i, 9) : (now + phs) % per;
      const cyc = big ? 0 : Math.floor((now + phs) / per);
      const life = big ? 1.4 + 1.2 * kit.hash(i, 3) : 0.7 + 0.7 * kit.hash(i, 3);
      if (tt < 0 || tt > life) continue;
      const x0 = big ? 12 + 40 * kit.hash(i, 4) : 3 + 58 * kit.hash(i, cyc, 4);
      const v = big ? 40 + 50 * kit.hash(i, 5) : 10 + 16 * kit.hash(i, cyc, 5);
      const y = 39 - v * tt * (1 - (big ? 0.18 : 0.3) * tt);
      if (y < -1) continue;
      const x = x0 + (big ? (kit.hash(i, 6) - 0.5) * 28 * tt : 0) + 2.2 * Math.sin(tt * 3.5 + i * 1.7);
      const k = (1 - tt / life) ** 1.4 * (0.8 + 0.2 * Math.sin(now * 37 + i));
      heatAt(1250 + 350 * k, HEATC, 0);
      const m = big ? 1.3 : 0.9;
      R.dot(x, y, HEATC[0] * k * m, HEATC[1] * k * m, HEATC[2] * k * m);
    }

    // ------------------------------------------------ the bellows
    {
      const nx = 6.5, ny = 110.2, bx = 1.4, byb = 126.6, fx = 8.4 + 4.2 * open, fy = 126.6 - 1.2 * open;
      const LEATHER = [0.05 + 0.03 * b, 0.018 + 0.008 * b, 0.008];
      for (let y = 110; y < 128; y++) for (let x = 0; x < 15; x++) {
        // inside the triangle nozzle / back board end / front board end
        const s1 = (bx - nx) * (y - ny) - (byb - ny) * (x - nx), s2 = (fx - bx) * (y - byb) - (fy - byb) * (x - bx), s3 = (nx - fx) * (y - fy) - (ny - fy) * (x - fx);
        if ((s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)) {
          const fold = 0.65 + 0.35 * Math.cos((y - ny) * (1.3 - 0.4 * open));
          R.over(x, y, LEATHER[0] * fold, LEATHER[1] * fold, LEATHER[2] * fold, 1);
        }
      }
      R.capsule(nx, ny, bx, byb, 0.7, 0.07, 0.035, 0.015, 1);
      R.capsule(nx, ny, fx, fy, 0.7, 0.09, 0.045, 0.02, 1);
      R.capsule(fx, fy, fx + 2.5, fy + 2, 0.6, 0.08, 0.04, 0.02, 1);
      R.capsule(nx, ny, nx, ny - 1.5, 0.9, 0.06, 0.05, 0.05, 1);
    }

    toneMap(I);
    kit.blitGrid(ctx, I, 1 - 0.6 * ctx.night);
  },
};
