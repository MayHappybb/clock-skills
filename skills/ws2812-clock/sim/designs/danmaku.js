// Danmaku: five panels in a plus are the arena of a bullet-hell boss fight.
// The boss (an eye in petals, rings of turrets) fills the centre and sprays
// patterns down all four lanes; the rainbow frog's ship weaves round it on a
// rounded-square lane, focused shot chipping at the core. The time is a
// curtain of bullets: hours across (rose), minutes down (azure), each numeral
// a stream of orbs flowing along its strokes. On the minute the boss's spell
// cancels the old numeral (its bullets turn into score items that stream to
// the frog) and fires a new stream that curves out of the core into the new
// one. On the hour: SPELL CARD, a screen-filling pattern, the frog bombs, and
// the boss's rings fly apart and reassemble.
import * as kit from '../js/kit.js';
import { W, H, CX, CY, bg, dl, moat, clear, orb, moatDisc, boss } from './danmaku-draw.js';
import { frogPos, drawFrog, bullets, drawBomb, banner } from './danmaku-fx.js';
import { GW, GH, glyph, pathAt } from './danmaku-glyphs.js';

const SX = 1.58, SY = 1.1, SP = 5.2;             // glyph scale to px (38 x 46 px numerals), bead spacing in px
const HX = (GW * SX) / 2, HY = (GH * SY) / 2;
const ROSE = kit.hex('#ff3a68'), AZURE = kit.hex('#2f9dff'), ITEM = kit.hex('#ffe9a0');
// slot centres: H1 left, H2 right, M1 top, M2 bottom
const SLOTS = [[26, CY], [W - 1 - 26, CY], [CX, 24.5], [CX, H - 1 - 24.5]];
const COL = [ROSE, ROSE, AZURE, AZURE];
const FLOW = 3;                                   // px/s the beads drift along their strokes
const RB = 1.9, RJ = 2.7, RE = 3.0;               // bead, joint and end orb radii (px)

const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (m) => { m = ((m % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + pad(m % 60); };

const tmp = [0, 0];
/** Bead b of path p at time T, glyph space -> raster, into out; returns visibility 0..1. */
function beadAt(p, b, T, slot, out) {
  let s, vis = 1;
  if (p.closed) { s = (b * p.L) / p.n + FLOW * T; }
  else {
    const step = p.L / (p.n - 1), loop = p.L + step;
    s = (b * step + FLOW * T) % loop;
    if (s > p.L) {
      // in transit: the boss fires this bead out of the core, it curves in and slows onto the stroke's start
      const u = (s - p.L) / step, e = 1 - (1 - u) * (1 - u);
      pathAt(p, 0, tmp);
      const [cx, cy] = SLOTS[slot], tx = cx + tmp[0] - HX, ty = cy + tmp[1] - HY;
      const dx = tx - CX, dy = ty - CY, L = Math.hypot(dx, dy), sx = CX + (dx / L) * 9, sy = CY + (dy / L) * 9;
      const sd = (p.first & 1 ? -0.35 : 0.35) * L, kx = (sx + tx) / 2 - (dy / L) * sd, ky = (sy + ty) / 2 + (dx / L) * sd;
      out[0] = (1 - e) * (1 - e) * sx + 2 * e * (1 - e) * kx + e * e * tx;
      out[1] = (1 - e) * (1 - e) * sy + 2 * e * (1 - e) * ky + e * e * ty;
      return -kit.smoothstep(0, 0.15, u);
    }
    vis = kit.smoothstep(0, step * 0.7, s) * kit.smoothstep(0, step * 0.7, p.L - s);
  }
  pathAt(p, s, tmp);
  const [cx, cy] = SLOTS[slot];
  out[0] = cx + tmp[0] - HX; out[1] = cy + tmp[1] - HY;
  return vis;
}
const gpos = ([x, y], slot) => [SLOTS[slot][0] + x - HX, SLOTS[slot][1] + y - HY];

/** One numeral. mode: 'rest' | 'old' (cancelling, a = phase) | 'new' (forming). */
function numeral(d, slot, T, a, mode, F, dly, dim) {
  const g = glyph(d, SP, SX, SY), col = COL[slot], P = [0, 0];
  for (const p of g.paths) {
    for (let b = 0; b < p.n; b++) {
      const q = (p.first + b) / g.total;
      let vis = beadAt(p, b, T, slot, P);
      if (vis < 0) {                                   // a feeder bead in flight from the core
        if (mode === 'rest') orb(dl, P[0], P[1], 1.4, col, -vis * 0.8 * dim, 0.8, 0.5);
        continue;
      }
      if (vis <= 0) continue;
      const tw = 0.85 + 0.15 * Math.sin(T * 2.3 + q * 19);
      if (mode === 'old') {
        const tc = -0.6 + 0.5 * kit.hash(p.first + b, d, 31);   // the curtain evaporates bead by bead, in no order
        if (a >= tc) {
          const u = (a - tc) / 0.9;
          if (u >= 1) continue;
          if (u < 0.12) orb(bg, P[0], P[1], RB + 8 * u, [1, 1, 1], (1 - u / 0.12) * dim, 1, 0.6);
          // a score item: kicked off in its own direction, then drawn in to the frog
          const ka = kit.TAU * kit.hash(p.first + b, slot, d), kr = 9 + 9 * kit.hash(b, d, 7);
          const e = kit.ease.inOut(u), kx = P[0] + Math.cos(ka) * kr, ky = P[1] + Math.sin(ka) * kr;
          const x = (1 - e) * (1 - e) * P[0] + 2 * e * (1 - e) * kx + e * e * F[0];
          const y = (1 - e) * (1 - e) * P[1] + 2 * e * (1 - e) * ky + e * e * F[1];
          const tw2 = 0.6 + 0.4 * Math.sin(T * 30 + b);
          orb(bg, x, y, 0.9, ITEM, 0.8 * tw2 * dim * (1 - kit.smoothstep(0.85, 1, u)), 0.8, 0.4);
          continue;
        }
      }
      if (mode === 'new') {
        const tl = dly + 0.8 * q, u = (a - tl) / 0.55;
        if (u < 0) continue;
        if (u < 1) {
          const e = kit.ease.inOut(u), dx = P[0] - CX, dy = P[1] - CY, L = Math.hypot(dx, dy);
          const sx = CX + (dx / L) * 8, sy = CY + (dy / L) * 8, side = (b & 1 ? 1 : -1) * 0.45 * L;
          const kx = (sx + P[0]) / 2 - (dy / L) * side, ky = (sy + P[1]) / 2 + (dx / L) * side;
          const x = (1 - e) * (1 - e) * sx + 2 * e * (1 - e) * kx + e * e * P[0];
          const y = (1 - e) * (1 - e) * sy + 2 * e * (1 - e) * ky + e * e * P[1];
          orb(dl, x, y, RB, col, (0.6 + 0.4 * e) * dim, 1, 0.5);
          moatDisc(x, y, 3.6, 0.7);
          continue;
        }
      }
      orb(dl, P[0], P[1], RB, col, vis * tw * dim, 1, 0.55);
      moatDisc(P[0], P[1], 5 * vis);
    }
  }
  // the big orbs on joints and stroke ends
  let k = 1;
  if (mode === 'old') k = 1 - kit.smoothstep(-0.4, -0.15, a);
  if (mode === 'new') k = kit.ease.outBack(kit.clamp((a - dly - 1.1) / 0.5));
  if (k <= 0) return;
  for (const [list, r] of [[g.joints, RJ], [g.ends, RE]]) {
    for (const pt of list) {
      const [x, y] = gpos(pt, slot), pulse = 1 + 0.12 * Math.sin(T * 3 + x * 0.3);
      orb(dl, x, y, r * k * pulse, col, dim, 1, 0.5);
      moatDisc(x, y, (r + 3) * k);
    }
  }
}
const VOID = kit.hex('#ff2050'), FLOOR = 0.022;
export default {
  name: 'Danmaku',
  blurb: 'bullet-hell boss in a plus; the time is a curtain of bullets the boss rewrites every minute, the frog bombs on the hour',
  layouts: ['hub-cross'], look: 'smoke', fps: 60, brightness: 0.35, dither: true,
  frame(ctx) {
    const d = ctx.date, dim = 1 - 0.55 * ctx.night;
    const T = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000;
    const Tm = Math.floor(T / 60), aN = T - Tm * 60;
    let from, to, a;
    if (aN >= 58.8) { from = digitsOf(Tm); to = digitsOf(Tm + 1); a = aN - 60; }
    else if (aN < 3) { from = digitsOf(Tm - 1); to = digitsOf(Tm); a = aN; }
    else { from = to = digitsOf(Tm); a = 99; }
    // the hour show: a runs -1.2 .. 9 around the hour
    const hs = T - Math.round(T / 3600) * 3600, hour = hs > -1.5 && hs < 9;
    clear();

    const [fx, fy] = frogPos(T), F = [fx, fy];
    const lk = [fx - CX, fy - CY], ll = Math.hypot(lk[0], lk[1]); lk[0] /= ll; lk[1] /= ll;
    // bomb at hs = 1.2, a rainbow ring from the frog
    let bomb = null;
    if (hour && hs > 1.2) {
      const u = (hs - 1.2) / 1.6;
      if (u < 1) bomb = { x: fx, y: fy, t0: T - (hs - 1.2), r: 170 * kit.ease.out(u), fade: 1 - u };
      else bomb = { x: fx, y: fy, t0: T - (hs - 1.2), r: 999, fade: 0 };
    }
    const graze = bullets(T, fx, fy, bomb, dim);

    // the boss: rings scatter and reassemble on the hour
    const hu = hour ? kit.clamp((hs + 1.2) / 4.2) : 0;
    const spread = Math.sin(Math.PI * hu) ** 2 * 0.9, spin = kit.TAU * 2 * kit.ease.inOut(hu);
    const bl = Math.sin(kit.TAU * T / 7.0);
    const blink = bl > 0.995 ? 0.15 : 1;
    const hot = a < 0 ? kit.smoothstep(-1.2, -0.7, a) : a < 2.5 ? 1 - kit.smoothstep(0.5, 2.5, a) : 0;
    boss(T, { spin, spread, look: lk, blink, hot, dim });

    // focused shot: needles from the frog to the boss rim, sparks where they chip it
    const rim = 24 + spread * 20;
    for (let k = 0; k < 6; k++) {
      const u = kit.fract(T * 9 + k / 6), r = ll - 8 - u * (ll - 8 - rim);
      if (r < rim) continue;
      orb(bg, CX + lk[0] * r - 2, CY + lk[1] * r, 0.7, [0.45, 1, 0.6], 0.5 * dim, 0.6, 0.3);
      orb(bg, CX + lk[0] * r + 2, CY + lk[1] * r, 0.7, [0.45, 1, 0.6], 0.5 * dim, 0.6, 0.3);
    }
    const sp = 0.5 + 0.5 * Math.sin(T * 41);
    orb(bg, CX + lk[0] * rim, CY + lk[1] * rim, 1.2 + sp, [1, 0.9, 0.6], 0.35 * dim * sp, 1, 0.8);

    // charge: a flickering aim line from the core to each arm whose numeral is about to change
    for (let s = 0; s < 4; s++) {
      if (from[s] === to[s] || a > -0.6 || a < -1.2) continue;
      const k = Math.sin(Math.PI * (a + 1.2) / 0.6) * (0.6 + 0.4 * Math.sin(T * 60));
      const [sx, sy] = SLOTS[s], L = Math.hypot(sx - CX, sy - CY);
      for (let r = 30; r < L - 20; r += 2) orb(bg, CX + (sx - CX) * r / L, CY + (sy - CY) * r / L, 0.6, VOID, 0.4 * k * dim, 0.3, 0.3);
    }
    if (bomb && bomb.fade > 0) drawBomb(bomb, dim);
    if (hour) banner(T, hs, dim);
    drawFrog(fx, fy, T, dim * (1 + 0.15 * Math.min(graze, 4) / 4));

    // the numerals: hours stagger a little behind the minutes on the hour
    for (let s = 0; s < 4; s++) {
      const dly = s < 2 ? 0.15 : 0;
      if (from[s] === to[s]) numeral(+to[s], s, T, a, 'rest', F, 0, dim);
      else if (a < 0) numeral(+from[s], s, T, a, 'old', F, 0, dim);
      else { numeral(+from[s], s, T, a, 'old', F, 0, dim); numeral(+to[s], s, T, a, 'new', F, dly, dim); }
    }
    // composite: the ground is pushed dark round the numerals, then the numerals add
    const G = kit.grid(ctx), idx = G.idx, o = ctx.out;
    for (let p = 0; p < idx.length; p++) {
      const i = idx[p];
      if (i < 0) continue;
      const m = 1 - 0.92 * moat[p];
      // a black floor: glow tails under ~6/255 would only step and shift hue on the crushed HUB75 dim end
      for (let c = 0; c < 3; c++) { const v = bg[3 * p + c] * m + dl[3 * p + c]; o[3 * i + c] = v < FLOOR ? 0 : v; }
    }
  },
};
