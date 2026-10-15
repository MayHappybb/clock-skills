// Cat's cradle: the owner's frog plays cat's cradle, and the figure on its
// fingers IS the time. Two loops of glowing pink thread, hours on the top
// fingers and minutes on the little fingers, every stroke a taut straight
// strand, every corner a crossing. A bead of light runs along the minute
// string once a minute and the frog's eyes follow it.
// Minute turn: the tongue flicks out, sticks to the changing figure and pulls
// it down into a V; the string slides over, the tongue lets go and the thread
// twangs up into the new numeral. Hour: the hands spread and pump, the
// minute string opens into Jacob's ladder, then drops back into 00.
import * as kit from '../js/kit.js';
import { W, H, strand } from './catscradle-draw.js';
import { glyph, sample, ladderPath } from './catscradle-glyphs.js';
import { handGeom, drawHand, drawFrog, drawTongue, MOUTH } from './catscradle-frog.js';

const DW = 26, DH = 31, BX = [32, 70], BY = [5, 50];
const NL = 8, ND = 64, NB = 8, NT = 2 * NL + NB + 2 * ND;   // intervals per string
const OFF = [NL, NL + ND + NB];                              // where each digit sits in it
const STR = kit.hex('#ff2f8e'), HOT = kit.hex('#ffd9ec'), BEAD = kit.hex('#fff0c0');
const SLACK = 0.24;                                          // weight of leads and bridges
const pad2 = (n) => String(n).padStart(2, '0');
const hhmm = (s) => { const d = new Date(s * 1000); return pad2(d.getHours()) + pad2(d.getMinutes()); };
const spring = (t) => (t <= 0 ? 0 : 1 - Math.exp(-6 * t) * Math.cos(9 * t));

const mk = () => ({ x: new Float32Array(NT + 1), y: new Float32Array(NT + 1), w: new Float32Array(NT + 1), c: new Float32Array(NT + 1) });
const ROW = [mk(), mk()], RO = mk(), RN = mk();
const img = new Float32Array(3 * W * H), core = new Float32Array(W * H), glow = new Float32Array(W * H);

/** A digit at rest into R at off, trembling: a slow breath plus a twang of amplitude A2. */
function putRest(R, off, g, dx, dy, t, A2) {
  for (let i = 0; i <= ND; i++) {
    const s = Math.sin(Math.PI * g.u[i]) * (0.16 * Math.sin(4.1 * t + g.ph[i]) + A2 * Math.sin(44 * t + 2 * g.ph[i]));
    R.x[off + i] = g.x[i] + dx + g.nx[i] * s; R.y[off + i] = g.y[i] + dy + g.ny[i] * s;
    R.w[off + i] = 1; R.c[off + i] = g.corner[i];
  }
}
/** Straight-with-sag interior points of a lead or bridge between existing ends. */
function putLine(R, off, n, sag) {
  const ax = R.x[off], ay = R.y[off], bx = R.x[off + n], by = R.y[off + n];
  for (let j = 1; j < n; j++) {
    const u = j / n;
    R.x[off + j] = ax + (bx - ax) * u; R.y[off + j] = ay + (by - ay) * u + 4 * sag * u * (1 - u);
    R.w[off + j] = SLACK; R.c[off + j] = 0;
  }
  R.w[off] = Math.min(R.w[off], 1); R.w[off + n] = Math.min(R.w[off + n], 1);
}
function putLeads(R, aL, aR, sag) {
  R.x[0] = aL[0]; R.y[0] = aL[1]; R.w[0] = SLACK; R.c[0] = 0;
  R.x[NT] = aR[0]; R.y[NT] = aR[1]; R.w[NT] = SLACK; R.c[NT] = 0;
  putLine(R, 0, NL, sag); putLine(R, NL + ND, NB, sag * 2.2); putLine(R, NL + 2 * ND + NB, NL, sag);
}
/** Point i of the V from the figure's ends through (tx, ty): where a pulled string goes. */
function vee(g, i, tx, ty, dx, dy, o) {
  const ex = g.x[0] + dx, ey = g.y[0] + dy, xx = g.x[ND] + dx, xy = g.y[ND] + dy;
  const l1 = Math.hypot(tx - ex, ty - ey), l2 = Math.hypot(xx - tx, xy - ty), s = (i / ND) * (l1 + l2);
  if (s < l1) { const k = l1 ? s / l1 : 0; o[0] = ex + (tx - ex) * k; o[1] = ey + (ty - ey) * k; }
  else { const k = l2 ? (s - l1) / l2 : 0; o[0] = tx + (xx - tx) * k; o[1] = ty + (xy - ty) * k; }
}
const va = [0, 0], vb = [0, 0];
/**
 * A digit in transfer. tl = { grab, pulled, rel }: the string is taken at
 * grab, is a V by pulled, slides from the old V to the new one, and is let go
 * at rel. T is the pull point (tongue tip) or null for a straight chord.
 */
function putMorph(R, off, go, gn, dx, dy, v, tl, T, G, t, A2) {
  if (v < tl.grab) return putRest(R, off, go, dx, dy, t, A2);
  const chord = !T;
  const toX = (g) => (chord ? (g.x[0] + g.x[ND]) / 2 + dx : T[0]), toY = (g) => (chord ? (g.y[0] + g.y[ND]) / 2 + dy : T[1]);
  if (v < tl.rel) {
    const q = kit.clamp((v - tl.grab) / (tl.pulled - tl.grab));
    const s = kit.smoothstep(tl.pulled, tl.rel, v);
    for (let i = 0; i <= ND; i++) {
      vee(go, i, toX(go), toY(go), dx, dy, va);
      let x = va[0], y = va[1], c = 0;
      if (q < 1) {
        const del = kit.clamp(Math.hypot(go.x[i] + dx - G[0], go.y[i] + dy - G[1]) / 34);
        const p = kit.ease.inOut(kit.clamp((q - 0.35 * del) / 0.65));
        x = go.x[i] + dx + (x - go.x[i] - dx) * p; y = go.y[i] + dy + (y - go.y[i] - dy) * p; c = go.corner[i] * (1 - p);
      } else if (s > 0) {
        vee(gn, i, toX(gn), toY(gn), dx, dy, vb);
        x += (vb[0] - x) * s; y += (vb[1] - y) * s;
      }
      R.x[off + i] = x; R.y[off + i] = y; R.w[off + i] = 1; R.c[off + i] = c;
    }
    return;
  }
  putRest(R, off, gn, dx, dy, t, A2);
  const Hx = toX(gn), Hy = toY(gn);
  for (let i = 0; i <= ND; i++) {
    const del = kit.clamp(Math.hypot(gn.x[i] + dx - Hx, gn.y[i] + dy - Hy) / 40);
    const k = tl.soft ? kit.ease.inOut(kit.clamp((v - tl.rel - 0.25 * del) / 0.7)) : spring(v - tl.rel - 0.22 * del);
    if (k >= 0.999 && v - tl.rel > 1.2) continue;
    vee(gn, i, Hx, Hy, dx, dy, va);
    R.x[off + i] = va[0] + (R.x[off + i] - va[0]) * k; R.y[off + i] = va[1] + (R.y[off + i] - va[1]) * k;
    R.c[off + i] *= kit.clamp(k);
  }
}

const TL_TONGUE = { grab: -1.22, pulled: -0.3, rel: 0.15 };
const TL_CHORD = { grab: 0.1, pulled: 0.55, rel: 0.95, soft: true };
const TL_LADDER = { grab: -1.5, pulled: -0.75, rel: -0.15 };
const HOLD = [64, 90];

/** Where the tongue tip is (or null) for a minute turn grabbing at G. */
function tongueTip(v, G) {
  const M = MOUTH;
  if (v < -1.5 || v > 0.42) return null;
  if (v < -1.22) { const k = kit.ease.out((v + 1.5) / 0.28); return [M[0] + (G[0] - M[0]) * k, M[1] + (G[1] - M[1]) * k]; }
  if (v < -0.3) { const k = kit.ease.inOut((v + 1.22) / 0.92); return [G[0] + (HOLD[0] - G[0]) * k, G[1] + (HOLD[1] - G[1]) * k]; }
  if (v < 0.15) { const q = (v + 0.3) / 0.45, e = Math.sin(Math.PI * q); return [HOLD[0] + 1.3 * e * Math.sin(30 * q), HOLD[1] + 1.2 * e * Math.sin(19 * q)]; }
  const k = kit.ease.in((v - 0.15) / 0.27);
  return [HOLD[0] + (M[0] - HOLD[0]) * k, HOLD[1] + (M[1] - HOLD[1]) * k];
}

/** The rest point nearest the middle of a digit's box: where the tongue sticks. */
function grabPoint(g, dx, dy, bx, by) {
  let best = 1e9, bi = 0;
  for (let i = 0; i <= ND; i++) {
    const d = (g.x[i] + dx - bx) ** 2 + (g.y[i] + dy - by) ** 2;
    if (d < best) { best = d; bi = i; }
  }
  return [g.x[bi] + dx, g.y[bi] + dy];
}

function drawString(R, boost) {
  for (let i = 0; i < NT; i++) {
    const w = Math.min(R.w[i], R.w[i + 1]) * (boost ? boost(i) : 1);
    let ax = R.x[i], ay = R.y[i], bx = R.x[i + 1], by = R.y[i + 1];
    const ca = R.c[i], cb = R.c[i + 1];
    if (ca > 0 || cb > 0) { // crossings: the strand runs on past the turn
      const l = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / l, uy = (by - ay) / l;
      ax -= ux * 1.3 * ca; ay -= uy * 1.3 * ca; bx += ux * 1.3 * cb; by += uy * 1.3 * cb;
    }
    strand(core, glow, ax, ay, bx, by, w, w > 0.6 ? 0.8 : 0.55);
  }
}

export default {
  name: "Cat's cradle",
  blurb: 'the rainbow frog plays cat\'s cradle; the string figure is the time, the tongue does the minute transfer, Jacob\'s ladder on the hour',
  layouts: ['hub-2x2'], look: 'smoke', fps: 60, brightness: 0.32, dither: true,
  frame(ctx) {
    const now = ctx.date.getTime() / 1000, t = now % 86400;
    const M = Math.floor(now / 60) * 60, sec = now - M;
    const v = sec > 30 ? sec - 60 : sec;                 // seconds from the nearest minute turn
    const B = sec > 30 ? M + 60 : M;                     // that turn
    const od = hhmm(B - 60), nd = hhmm(B);
    const hourTurn = od.slice(0, 2) !== nd.slice(0, 2);

    // hands: breathing, a spread-and-pump on the hour
    const env = hourTurn ? kit.smoothstep(-1.7, -1.0, v) * (1 - kit.smoothstep(0.6, 1.5, v)) : 0;
    const breath = Math.sin((t * kit.TAU) / 4.2);
    const spread = 0.5 * breath + env * (3.5 + 1.8 * Math.sin(kit.TAU * 1.25 * (v + 1.0)));
    const dyH = 0.45 * Math.sin((t * kit.TAU) / 4.2 + 1.2);
    const curl = 0.5 + 0.5 * Math.sin(t * 0.9) * 0.6;
    const hL = handGeom(-1, spread, dyH, curl), hR = handGeom(1, spread, dyH, curl);

    // random plucks, one strand set ringing every 8 s
    const P8 = Math.floor(t / 8), tp = t - P8 * 8 - 2, pk = Math.floor(kit.hash(P8, 3) * 4);
    const pluck = tp > 0 ? 0.55 * Math.exp(-2.5 * tp) : 0;

    let tip = null, look = null;
    for (let r = 0; r < 2; r++) {
      const R = ROW[r], aL = hL.tips[r ? 3 : 0], aR = hR.tips[r ? 3 : 0];
      const dy = dyH * 0.6; const sag = Math.max(0.3, 2.2 - 0.45 * spread);
      const changed = [0, 1].map((k) => od[2 * r + k] !== nd[2 * r + k]);
      const dxs = [-0.3 * spread, 0.3 * spread];
      const gO = [0, 1].map((k) => glyph(od[2 * r + k], BX[k], BY[r], DW, DH, ND));
      const gN = [0, 1].map((k) => glyph(nd[2 * r + k], BX[k], BY[r], DW, DH, ND));
      const ladder = r === 1 && hourTurn && v > TL_LADDER.grab - 0.2 && v < TL_LADDER.rel + 2;

      if (ladder) {
        // Jacob's ladder: the whole minute string opens into the classic figure
        for (const [S, g] of [[RO, gO], [RN, gN]]) {
          for (let k = 0; k < 2; k++) putRest(S, OFF[k], g[k], dxs[k], dy, t, 0);
          putLeads(S, aL, aR, sag);
        }
        const lp = sample(ladderPath(aL[0], aL[1], aR[0], aR[1], 52 + dy, 80 + dy, 3), NT);
        const q = kit.clamp((v - TL_LADDER.grab) / (TL_LADDER.pulled - TL_LADDER.grab));
        for (let i = 0; i <= NT; i++) {
          const del = Math.abs(i / NT - 0.5) * 2;
          let x, y, w, c;
          if (v < TL_LADDER.rel) {
            const p = kit.ease.inOut(kit.clamp((q - 0.4 * del) / 0.6));
            x = RO.x[i] + (lp.x[i] - RO.x[i]) * p; y = RO.y[i] + (lp.y[i] - RO.y[i]) * p;
            w = RO.w[i] + (1 - RO.w[i]) * p; c = RO.c[i] * (1 - p) + lp.corner[i] * p;
          } else {
            const k = spring(v - TL_LADDER.rel - 0.3 * del);
            x = lp.x[i] + (RN.x[i] - lp.x[i]) * k; y = lp.y[i] + (RN.y[i] - lp.y[i]) * k;
            const kc = kit.clamp(k);
            w = 1 + (RN.w[i] - 1) * kc; c = lp.corner[i] * (1 - kc) + RN.c[i] * kc;
          }
          // the ladder hums: a slow standing wave across it
          y += env * 0.9 * Math.sin(Math.PI * (x - aL[0]) / (aR[0] - aL[0]) * 4) * Math.sin(kit.TAU * 2.2 * v);
          R.x[i] = x; R.y[i] = y; R.w[i] = w; R.c[i] = c;
        }
        look = [64, 66];
        continue;
      }

      const tongue = r === 1 && !hourTurn && v > -1.6 && v < 2.6;
      const chordH = r === 0 && hourTurn && v > 0 && v < 2.9;
      let G = null;
      if (tongue) {
        if (changed[0] && changed[1]) {
          G = [(gO[0].x[ND] + dxs[0] + gO[1].x[0] + dxs[1]) / 2, (gO[0].y[ND] + gO[1].y[0]) / 2 + dy];
        } else {
          const k = changed[0] ? 0 : 1;
          G = grabPoint(gO[k], dxs[k], dy, BX[k] + DW / 2, BY[r] + DH / 2);
        }
        tip = tongueTip(v, G);
        look = tip ?? HOLD;
      }
      for (let k = 0; k < 2; k++) {
        let A2 = pk === 2 * r + k ? pluck : 0;
        if (tongue && v > -1.22) A2 = Math.max(A2, (changed[k] ? 0 : 0.5) * Math.exp(-3 * (v + 1.22)));
        if ((tongue || chordH) && changed[k]) {
          const tl = tongue ? TL_TONGUE : TL_CHORD;
          if (v > tl.rel) A2 = Math.max(A2, 1.1 * Math.exp(-3 * (v - tl.rel)));
          const Gk = tongue ? G : [BX[k] + DW / 2 + dxs[k], BY[r] + DH / 2 + dy];
          putMorph(R, OFF[k], gO[k], gN[k], dxs[k], dy, v, tl, tongue ? (v < tl.rel ? (tip ?? HOLD) : HOLD) : null, Gk, t, A2);
        } else {
          putRest(R, OFF[k], v < 0 || (r === 0 && hourTurn && v < TL_CHORD.grab) ? gO[k] : gN[k], dxs[k], dy, t, A2);
        }
      }
      putLeads(R, aL, aR, sag);
    }

    // ---- paint
    img.fill(0); core.fill(0); glow.fill(0);
    drawHand(img, hL); drawHand(img, hR);

    // the bead of light: seconds, along the minute string
    const R1 = ROW[1], f = (sec / 60) * NT, fi = Math.min(NT - 1, Math.floor(f)), ff = f - fi;
    const bx = R1.x[fi] + (R1.x[fi + 1] - R1.x[fi]) * ff, by = R1.y[fi] + (R1.y[fi + 1] - R1.y[fi]) * ff;
    const ba = kit.smoothstep(0, 4, f) * kit.smoothstep(NT, NT - 4, f);
    if (!look) look = [bx, by];

    const blinkPh = (t % 5.3) / 5.3, blink = blinkPh > 0.97 ? Math.sin(((blinkPh - 0.97) / 0.03) * Math.PI) : 0;
    const wide = env;
    const mouth = tip ? kit.smoothstep(0, 6, Math.hypot(tip[0] - MOUTH[0], tip[1] - MOUTH[1])) : wide * 0.6;
    drawFrog(img, look[0], look[1], blink, mouth, wide);

    const pulse = env > 0 ? (i) => 1 + 0.9 * env * Math.exp(-(((i / NT) - kit.fract(v * 0.8)) ** 2) / 0.004) : null;
    drawString(ROW[0]); drawString(ROW[1], pulse);
    const sr = STR[0], sg = STR[1], sb = STR[2];
    for (let p = 0, q = 0; p < W * H; p++, q += 3) {
      const c = core[p], g = glow[p];
      if (c <= 0 && g <= 0) continue;
      const hot = c > 1 ? 1 : c * c * c;
      img[q] += sr * (0.95 * c + 0.26 * g) + HOT[0] * 0.45 * hot;
      img[q + 1] += sg * (0.95 * c + 0.26 * g) + HOT[1] * 0.45 * hot;
      img[q + 2] += sb * (0.95 * c + 0.26 * g) + HOT[2] * 0.45 * hot;
    }
    if (tip) drawTongue(img, tip[0], tip[1]);
    if (ba > 0) {
      for (let y = Math.floor(by - 3); y <= by + 3; y++) for (let x = Math.floor(bx - 3); x <= bx + 3; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const d2 = (x - bx) ** 2 + (y - by) ** 2;
        if (d2 > 9) continue;
        const a = ba * (Math.max(0, 1 - Math.sqrt(d2) / 1.7) * 0.9 + (1 - d2 / 9) ** 2 * 0.25), p = 3 * (y * W + x);
        img[p] += BEAD[0] * a; img[p + 1] += BEAD[1] * a; img[p + 2] += BEAD[2] * a;
      }
    }
    kit.blitGrid(ctx, img, 1 - 0.7 * ctx.night);
  },
};
