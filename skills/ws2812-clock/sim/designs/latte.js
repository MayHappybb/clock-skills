// Latte: a cup of coffee seen from above, filling the panel. The time is the
// latte art: each numeral is one barista's pour of white microfoam on the
// crema (heavy dollop, thinning stream, rosetta ripple, pull-through tail),
// the hour small at the top of the cup, the minutes big below.
// Always alive: the foam drifts on a slow differential swirl, the crema
// shimmers and spirals, bubbles rise and pop at the rim, steam curls over
// it all, a highlight slides along the lip.
// Minute: the teaspoon leaves the saucer, stirs the changing digit into a
// spiral (a real vortex map: foam winds, then melts into a caramel swirl),
// returns, and the jug pours the new numeral with a wiggle.
// Hour: the spoon stirs the whole cup into a whirlpool and the new time
// unwinds out of it.
import * as kit from '../js/kit.js';
import { pour, along } from './latte-glyphs.js';
import { BG, RAD, CREMA, noise, drawHandle, W, H, N, CX, CY, R_CREMA, R_RIM } from './latte-scene.js';

const pad = (n) => String(n).padStart(2, '0');
const digits = (d) => pad(d.getHours()) + pad(d.getMinutes());

// the minutes: two big pours across the cup. The hour is the cup's handle,
// turned to its mark on the saucer's painted rim.
const MS = { w: 13.4, h: 22, rmax: 2.45, rmin: 0.72, slant: 1.8 };
const SLOTS = [{ ...MS, x: 15.2, y: 20.5 }, { ...MS, x: 31.6, y: 20.5 }];
for (const s of SLOTS) { s.cx = s.x + s.w / 2 + s.slant / 2; s.cy = s.y + s.h / 2; }
const hourAng = (h) => -Math.PI / 2 + ((h % 12) * Math.PI) / 6;

const FOAM = kit.hex('#fff2dc'), DARK = kit.hex('#3c1704'), GOLD = kit.hex('#b0601c');
const CARAMEL = kit.hex('#c08a52'), STEEL = kit.hex('#8c9096');

// crema pixels, listed once
const CP = [];
for (let p = 0; p < N; p++) if (CREMA[p] > 0) CP.push(p);
const CPI = Int32Array.from(CP);
// pixels of the cup and its rim (for steam and the sliding highlight)
const RIMP = [], RIMA = [];
for (let p = 0; p < N; p++) {
  const r = RAD[p];
  if (r > R_CREMA - 0.5 && r < R_RIM + 0.6) { RIMP.push(p); RIMA.push(Math.atan2(Math.floor(p / W) - CY, (p % W) - CX)); }
}
const IMG = new Float32Array(3 * N);

/** Bilinear sample of a 64 x 64 field, clamped. */
function samp(f, x, y) {
  x = x < 0 ? 0 : x > 62.999 ? 62.999 : x; y = y < 0 ? 0 : y > 62.999 ? 62.999 : y;
  const xi = x | 0, yi = y | 0, u = x - xi, v = y - yi, p = yi * W + xi;
  const a = f[p], b = f[p + 1], c = f[p + W], d = f[p + W + 1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** Add a soft dot into IMG. */
function dot(x, y, r, c, a) {
  const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(W - 1, Math.ceil(x + r));
  const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(H - 1, Math.ceil(y + r));
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const d2 = ((i - x) ** 2 + (j - y) ** 2) / (r * r);
    if (d2 >= 1) continue;
    const f = a * (1 - d2) ** 2, q = 3 * (j * W + i);
    IMG[q] += c[0] * f; IMG[q + 1] += c[1] * f; IMG[q + 2] += c[2] * f;
  }
}
/** Paint over IMG toward c with alpha. */
function paint(p, c, a) {
  const q = 3 * p;
  IMG[q] += (c[0] - IMG[q]) * a; IMG[q + 1] += (c[1] - IMG[q + 1]) * a; IMG[q + 2] += (c[2] - IMG[q + 2]) * a;
}

/** The teaspoon from above: bowl at (bx, by), handle running out at angle ang. sub: 0..1 under the coffee. */
function spoon(bx, by, ang, lift, sub) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const x0 = Math.max(0, Math.floor(Math.min(bx, bx + 19 * ca) - 4)), x1 = Math.min(W - 1, Math.ceil(Math.max(bx, bx + 19 * ca) + 4));
  const y0 = Math.max(0, Math.floor(Math.min(by, by + 19 * sa) - 4)), y1 = Math.min(H - 1, Math.ceil(Math.max(by, by + 19 * sa) + 4));
  const sc = 1 + 0.12 * lift, sh = 0.6 + 2.2 * lift;
  for (let pass = 0; pass < 2; pass++) {
    const ox = pass ? 0 : sh, oy = pass ? 0 : sh;
    for (let j = y0; j <= y1 + 3 && j < H; j++) for (let i = x0; i <= x1 + 3 && i < W; i++) {
      const dx = i - bx - ox, dy = j - by - oy;
      const u = (dx * ca + dy * sa) / sc, v = (-dx * sa + dy * ca) / sc;
      // bowl: an egg, broad end away from the handle
      const eb = Math.hypot((u + 0.3) / (u < 0 ? 3.0 : 2.5), v / 2.05) - 1;
      const bowl = eb * 2.1;
      // handle: a capsule from the bowl's neck, widening at the end
      const t = u < 2.2 ? 0 : u > 17 ? 1 : (u - 2.2) / 14.8;
      const hw = 0.55 + 0.6 * t * t;
      const hd = (u < 2.2 ? Math.hypot(u - 2.2, v) : u > 17 ? Math.hypot(u - 17, v) : Math.abs(v)) - hw;
      const d = Math.min(bowl, hd);
      const cov = d < -0.5 ? 1 : d > 0.5 ? 0 : 0.5 - d;
      if (cov <= 0) continue;
      const p = j * W + i;
      if (!pass) { paint(p, [0, 0, 0], cov * 0.55 * (1 - sub)); continue; }
      const inBowl = bowl < hd;
      const shine = inBowl ? 0.35 + 0.6 * Math.exp(-(((u + 0.9) ** 2 + (v + 0.8) ** 2) / 1.4)) : 0.42 + 0.5 * Math.exp(-((v + 0.25) ** 2) / 0.12);
      const k = shine * (1 - 0.65 * (inBowl ? sub : 0));
      paint(p, [STEEL[0] * k, STEEL[1] * k, STEEL[2] * k], cov);
    }
  }
}

/** The milk jug from above, its spout tip over (tx, ty), body off to the upper right; a 0..1 in/out. */
function jug(tx, ty, a) {
  const ux = 0.62, uy = -0.78, len = 26;
  const ex = tx + ux * len, ey = ty + uy * len;
  const x0 = Math.max(0, Math.floor(Math.min(tx, ex) - 9)), x1 = Math.min(W - 1, Math.ceil(Math.max(tx, ex) + 9));
  const y0 = Math.max(0, Math.floor(Math.min(ty, ey) - 9)), y1 = Math.min(H - 1, Math.ceil(Math.max(ty, ey) + 9));
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const dx = i - tx, dy = j - ty, al = dx * ux + dy * uy, ac = -dx * uy + dy * ux;
    if (al < -1.5) continue;
    const hw = al < 0 ? 1.1 : 1.1 + Math.min(al, 9) * 0.55 + Math.max(0, al - 9) * 0.12;
    const d = (al < 0 ? Math.hypot(al, ac) : Math.abs(ac)) - hw;
    const cov = (d < -0.5 ? 1 : d > 0.5 ? 0 : 0.5 - d) * a;
    if (cov <= 0) continue;
    const p = j * W + i, c = ac / hw;
    // a polished steel body, a bright streak down one flank, milk in the spout
    let k = 0.3 + 0.75 * Math.exp(-(((c + 0.45) / 0.22) ** 2)) + 0.1 * (1 - c * c);
    paint(p, [STEEL[0] * k, STEEL[1] * k, STEEL[2] * k * 1.05], cov * 0.92);
    if (al < 6 && Math.abs(ac) < 0.8) paint(p, FOAM, cov * 0.8 * (1 - al / 6));
  }
}

const REST = { x: 11.0, y: 53.0, ang: 2.36 };
// every pour field (10 digits x 2 slots, plain and rosetta), built one a frame
const WARM = [];
for (let r = 0; r < 2; r++) for (let k = 0; k < 2; k++) for (let d = 0; d < 10; d++) if (!r || d === 0) WARM.push([String(d), k, r]);

export default {
  name: 'Latte',
  blurb: 'latte art clock: numerals poured in microfoam, stirred away by the teaspoon, re-poured by the jug',
  layouts: ['hub'], look: 'smoke', fps: 60, brightness: 0.35, dither: true,
  frame(ctx) {
    if (WARM.length) { const [d, k, r] = WARM.pop(); pour(d, SLOTS[k], 's' + k, r); }
    const date = ctx.date, ms = date.getTime(), t = (ms / 1000) % 3600;
    const sec = kit.secOf(date);
    // the transition window straddles the minute: u is seconds from the turn
    let u, oldS, newS;
    if (sec >= 57.5) { u = sec - 60; oldS = digits(date); newS = digits(new Date(ms + 60000)); }
    else { u = sec; oldS = digits(new Date(ms - 60000)); newS = digits(date); }
    if (u > 4) oldS = newS;
    const ch = [oldS[2] !== newS[2], oldS[3] !== newS[3]];
    const hour = oldS.slice(0, 2) !== newS.slice(0, 2);
    const mode = hour ? 3 : ch[0] ? 2 : ch[1] ? 1 : 0;
    const E = kit.ease.inOut, cl = kit.clamp;

    // vortex: where the spoon stirs, how wide, how far it has wound
    let vx = SLOTS[1].cx, vy = SLOTS[1].cy, sig = 7.5, A = 0, spPos = null;
    if (mode >= 2) { vx = (SLOTS[0].cx + SLOTS[1].cx) / 2; sig = mode === 3 ? 14 : 11.5; }
    const T = mode === 3
      ? { a0: -2.0, a1: -1.5, a2: 0.15, a3: 0.65, rr: 6.5, om: 1.5, A: 10 }
      : { a0: -1.25, a1: -0.8, a2: 0.3, a3: 0.8, rr: mode === 2 ? 3.6 : 2.0, om: 2.4, A: 7.5 };
    if (mode) A = T.A * E(cl((u - T.a1 + 0.05) / (T.a2 - T.a1 + 0.05)));
    // the spoon's path: off the saucer, stir circles, back
    if (mode && u > T.a0 && u < T.a3) {
      const { a0, a1, a2, a3 } = T, om = T.om * kit.TAU;
      const inStir = u >= a1 && u <= a2;
      const k = u < a1 ? E((u - a0) / (a1 - a0)) : u > a2 ? 1 - E((u - a2) / (a3 - a2)) : 1;
      const ru = u < a1 ? 0 : u > a2 ? T.rr : T.rr * Math.min(1, (u - a1) / 0.3);
      const uu = Math.min(Math.max(u, a1), a2);
      const tx = vx + ru * Math.cos(om * uu), ty = vy + ru * Math.sin(om * uu);
      const lift = inStir ? 0 : Math.sin(Math.PI * (u < a1 ? 0.5 * (u - a0) / (a1 - a0) : 0.5 + 0.5 * (u - a2) / (a3 - a2)));
      spPos = { bx: REST.x + (tx - REST.x) * k, by: REST.y + (ty - REST.y) * k, ang: REST.ang + 0.3 * Math.sin(om * uu) * k, lift, sub: inStir ? 1 : 0.3 * k };
    }

    // fields for this frame
    const F = [], kind = [], prog = [], NEWF = [];
    const ros = newS.slice(2) === '00' ? 1 : 0;   // the hour's pour is a grand rosetta
    const pours = mode === 1 ? [[0, 0], [0.5, 1.4]] : mode === 2 ? [[0.3, 0.95], [1.15, 0.95]] : [[0.12, 0.85], [0.9, 0.85]];
    for (let k = 0; k < 2; k++) {
      F[k] = pour(newS[k + 2], SLOTS[k], 's' + k, ros);
      kind[k] = 0; prog[k] = 1e9;
      if (!ch[k]) continue;
      kind[k] = 1;
      NEWF[k] = F[k];
      F[k] = pour(oldS[k + 2], SLOTS[k], 's' + k, oldS.slice(2) === '00' ? 1 : 0);
      const [st, du] = pours[k];
      prog[k] = (NEWF[k].L + 2.5) * E(cl((u - st) / du)) - 1.5;
    }
    const oldA = 1 - kit.smoothstep(-0.45, 0.25, u), carA = kit.smoothstep(-0.6, -0.1, u) * (1 - kit.smoothstep(0.5, 3.0, u));
    // the hour: the cup is turned on its saucer to the next mark
    const h0 = +oldS.slice(0, 2), h1 = +newS.slice(0, 2);
    const turn = mode === 3 ? kit.ease.outBack(cl((u - 0.1) / 1.5)) : 1;
    const handleAng = hourAng(h0) + (mode === 3 ? (Math.PI / 6) * turn : 0) + 0.012 * Math.sin(t * 0.7);

    IMG.set(BG);
    drawHandle(IMG, handleAng);
    // drift: a slow differential swirl and a little sway of the whole surface
    const th0 = 0.035 * Math.sin(t * 0.23), th1 = 0.022 * Math.sin(t * 0.37 + 1), tx = 0.3 * Math.sin(t * 0.17), ty = 0.3 * Math.cos(t * 0.13);
    const isg = 1 / (sig * sig);
    for (let n = 0; n < CPI.length; n++) {
      const p = CPI[n], x = p % W, y = (p / W) | 0, r = RAD[p];
      const th = th0 + th1 * Math.sin(r * 0.21), c = Math.cos(th), s = Math.sin(th);
      const dx = x - CX, dy = y - CY;
      const sx = CX + c * dx + s * dy - tx, sy = CY - s * dx + c * dy - ty;
      // stirred coordinates
      let wx = sx, wy = sy;
      if (A > 0) {
        const ex = sx - vx, ey = sy - vy, a = A * Math.exp(-(ex * ex + ey * ey) * isg);
        const ca = Math.cos(a), sa = Math.sin(a);
        wx = vx + ca * ex + sa * ey; wy = vy - sa * ex + ca * ey;
      }
      // crema: two moving noises, through the stir so it spirals too
      const n1 = noise(wx * 1.3 + t * 0.5, wy * 1.3 - t * 0.35), n2 = noise(wx * 0.55 - t * 0.2, wy * 0.55 + 31 + t * 0.12);
      let k = 0.15 + 0.62 * n2 + 0.25 * n1;
      k *= 0.55 + 0.45 * kit.smoothstep(R_CREMA + 0.5, R_CREMA - 6, r);
      let cr = DARK[0] + (GOLD[0] - DARK[0]) * k, cg = DARK[1] + (GOLD[1] - DARK[1]) * k, cb = DARK[2] + (GOLD[2] - DARK[2]) * k;
      // foam
      let fa = 0, fsd = 9, oa = 0;
      for (let q = 0; q < 2; q++) {
        if (kind[q] === 0) {
          const v = samp(F[q].sd, sx, sy);
          if (v < fsd) fsd = v;
          continue;
        }
        // old digit, wound by the vortex
        const v = samp(F[q].sd, wx, wy);
        const o = v < -0.7 ? 1 : v > 0.7 ? 0 : 0.5 - v / 1.4;
        if (o > oa) oa = o;
        // new digit: revealed along the pour
        const G = NEWF[q];
        let w = samp(G.sd, sx, sy);
        const S = G.S[(Math.round(sy) * W + Math.round(sx)) | 0];
        const rv = prog[q] - S;
        if (rv < 1) w += (1 - rv) * 3;
        if (w < fsd) fsd = w;
      }
      fa = fsd < -0.7 ? 1 : fsd > 0.7 ? 0 : 0.5 - fsd / 1.4;
      // a darker moat of crema pushed aside by the foam
      if (fsd > 0 && fsd < 2.6) { const m = 1 - 0.5 * (1 - fsd / 2.6) ** 1.5; cr *= m; cg *= m; cb *= m; }
      // the stirred foam melting into a caramel swirl
      if (oa > 0) {
        const ca2 = oa * carA * 0.7;
        cr += (CARAMEL[0] - cr) * ca2; cg += (CARAMEL[1] - cg) * ca2; cb += (CARAMEL[2] - cb) * ca2;
        const o2 = oa * oldA;
        if (o2 > fa) fa = fa + (o2 - fa);
      }
      const body = 0.78 + 0.2 * (fsd < -1.6 ? 1 : fsd > 0 ? 0 : -fsd / 1.6), grain = 0.93 + 0.12 * n1;
      const fr = FOAM[0] * body * grain, fg = FOAM[1] * body * grain, fb = FOAM[2] * body * grain;
      const m = CREMA[p], q3 = 3 * p;
      const or = cr + (fr - cr) * fa, og = cg + (fg - cg) * fa, ob = cb + (fb - cb) * fa;
      IMG[q3] += (or - IMG[q3]) * m; IMG[q3 + 1] += (og - IMG[q3 + 1]) * m; IMG[q3 + 2] += (ob - IMG[q3 + 2]) * m;
    }

    // the pour: the jug's stream lands as a bright dollop with a wiggle
    let jugAt = null;
    for (let q = 0; q < 2; q++) {
      if (!kind[q]) continue;
      const G = NEWF[q], a = prog[q];
      if (a <= 0.2 || a >= G.L) continue;
      const [hx, hy, ddx, ddy] = along(G, a);
      const wig = 0.55 * Math.sin(u * 38);
      dot(hx - ddy * wig, hy + ddx * wig, 2.4, FOAM, 0.55);
      jugAt = [hx - ddy * wig, hy + ddx * wig, Math.min(1, a / 3, (G.L - a) / 3)];
    }

    // bubbles: crema bubbles rise near the rim, sit, and pop
    for (let j = 0; j < 14; j++) {
      const T = 2.4 + 1.6 * kit.hash(j, 5), cyc = Math.floor((t + j * 0.71) / T), ph = (t + j * 0.71) / T - cyc;
      const a = kit.hash(j, cyc) * kit.TAU + (A > 0 ? A * Math.exp(-((R_CREMA - 3) ** 2) * isg) : 0);
      const r = R_CREMA - 1.3 - 4 * kit.hash(j, cyc, 3);
      const bx = CX + r * Math.cos(a), by = CY + r * Math.sin(a);
      if (ph < 0.82) dot(bx, by, 1.15, [0.55, 0.36, 0.17], 0.7 * kit.smoothstep(0, 0.2, ph));
      else dot(bx, by, 1.4 + 3 * (ph - 0.82), [0.5, 0.36, 0.2], 0.6 * (1 - (ph - 0.82) / 0.18));
    }

    // the lip: a highlight sliding round
    const ha = -2.3 + 0.45 * Math.sin(t * 0.29);
    for (let n = 0; n < RIMP.length; n++) {
      const p = RIMP[n], r = RAD[p];
      let d = RIMA[n] - ha; d -= kit.TAU * Math.round(d / kit.TAU);
      const lip = Math.exp(-(((r - (R_RIM - 1.3)) / 0.9) ** 2));
      const h = lip * (0.5 * Math.exp(-((d / 0.33) ** 2)) + 0.12 * Math.exp(-(((d - Math.PI) / 0.5) ** 2)));
      if (h > 0.004) { const q = 3 * p; IMG[q] += 0.95 * h; IMG[q + 1] += 0.9 * h; IMG[q + 2] += 0.82 * h; }
    }

    if (spPos) spoon(spPos.bx, spPos.by, spPos.ang, spPos.lift, spPos.sub);
    else spoon(REST.x, REST.y, REST.ang, 0, 0);

    if (jugAt) jug(jugAt[0] + 0.8, jugAt[1] - 1.0, jugAt[2]);

    // steam: faint curls rising over the cup (a burst on the hour)
    const st = 0.05 + (mode === 3 ? 0.06 * Math.exp(-((u + 0.2) ** 2) / 1.5) : 0);
    for (let p = 0; p < N; p++) {
      const r = RAD[p];
      if (r > R_RIM + 3) continue;
      const x = p % W, y = (p / W) | 0;
      const s1 = noise(x * 0.42 + 2.5 * Math.sin(t * 0.21 + y * 0.08), y * 0.42 + t * 1.6);
      const s2 = noise(x * 0.9 - t * 0.3, y * 0.9 + t * 2.4 + 19);
      const v = kit.smoothstep(0.58, 0.82, s1 * 0.75 + s2 * 0.35) * st * kit.smoothstep(R_RIM + 3, R_RIM - 4, r);
      if (v > 0.002) { const q = 3 * p; IMG[q] += v; IMG[q + 1] += v; IMG[q + 2] += v * 1.05; }
    }

    const dim = 1 - 0.55 * ctx.night;
    kit.blitGrid(ctx, IMG, dim);
  },
};
