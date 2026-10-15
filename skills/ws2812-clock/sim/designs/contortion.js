// Contortion: rubber acrobats on a little circus stage, and they ARE the
// time. Each digit is one glossy rubber tube with a head and white mittens
// at the ends of its stroke. The minutes are big candy-striped contortionists
// on the boards; the hours are gold-sequinned wire walkers balancing on a
// high wire that sags and bobs under them. They breathe, sway, blink and
// glance at each other while the follow-spot drifts. On the minute the
// changing acrobat crouches and bends its own body into the new digit
// (segment headings bend, the tube thins as it stretches), the spot swings
// onto it, the others watch, it bows. On the hour the walkers crouch on the
// wire, it springs them up, they somersault while contorting into the new
// hour, land with a bounce, and everyone bows under confetti.
import * as kit from '../js/kit.js';
import { N, GLYPHS, BRIDGES, curlOf, bend } from './contortion-glyphs.js';
import { W, H, drawBody, drawFace } from './contortion-tube.js';
import { FLOOR, beam, drawStage, drawMotes, drawFootlights, drawConfetti } from './contortion-stage.js';
import { look, gaze, act, sag, hop, wireY, bump, WIRE, HOUR } from './contortion-acts.js';

const SLOT_X = [21, 43, 21, 43];
const ROLE = [ // wire walkers (hours) then contortionists (minutes)
  { k: 0.95, r: 1.5, rh: 3.3 }, { k: 0.95, r: 1.5, rh: 3.3 },
  { k: 1.4, r: 2.25, rh: 4.5 }, { k: 1.4, r: 2.25, rh: 4.5 },
];
const ROPE = kit.hex('#f0d8a8'), POLE = kit.hex('#c88a3a');

const img = new Float32Array(3 * W * H);
const U = new Float64Array(2 * N), P = new Float64Array(2 * N);
const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => (pad(d.getHours()) + pad(d.getMinutes())).split('').map(Number);

/** The body of acrobat j, in px relative to its feet: returns [L, faceIdx, feetX, r, glyph for mittens]. */
function pose(j, a, prev, next, ch, now) {
  const R = ROLE[j], k = R.k;
  let L, fi;
  const morph = (ch[j] || a.force) && a.e >= 0 && a.e < 1, e = a.e;
  let gm = GLYPHS[!morph && !ch[j] || e >= 0.5 ? next[j] : prev[j]];
  if (morph) {
    // curl up into a ball, roll, unroll as the new digit
    // The bridge is symmetric: entered the way the old digit curls, left the
    // way the new one does, so neither half unwinds through a straight line.
    // A 1 bends from the flag down and straightens from the foot up, so it
    // never passes through the look of a 7.
    const Bl = BRIDGES[curlOf(prev[j])], B2 = BRIDGES[curlOf(next[j])];
    let b;
    if (e < 0.4) { const f = kit.ease.inOut(e / 0.4); b = bend(GLYPHS[prev[j]], Bl, f, 0.3 * Math.sin(Math.PI * f), now * 7.5, U, 0.3, prev[j] === 1 ? 0.6 : 0); }
    else if (e < 0.6) { U.set(Bl.pts); b = { L: Bl.L, face: Bl.face }; }
    else { const f = kit.ease.inOut((e - 0.6) / 0.4); b = bend(B2, GLYPHS[next[j]], f, 0.3 * Math.sin(Math.PI * f), now * 7.5, U, 0.3, next[j] === 1 ? -0.6 : 0); }
    L = b.L; fi = b.face;
    if (e > 0.25 && e < 0.75) gm = Bl;
    // a body mid-bend may reach taller or wider than its slot: it squashes
    // to fit (under the wire, clear of its neighbour) instead
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < N; i++) {
      const x = U[2 * i], y = U[2 * i + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const sy = Math.min(1, 16.4 / (y1 - y0)), sx = Math.min(1, 12.5 / (x1 - x0)), mx = (x0 + x1) / 2;
    if (sy < 1 || sx < 1) for (let i = 0; i < N; i++) { U[2 * i] = mx + (U[2 * i] - mx) * sx; U[2 * i + 1] = y1 + (U[2 * i + 1] - y1) * sy; }
  } else { const g = GLYPHS[ch[j] && e < 0 ? prev[j] : next[j]]; U.set(g.pts); L = g.L; fi = g.face; }
  const r = R.r * kit.clamp((38 / L) ** 0.35, 0.82, 1.3);
  // to px about the centroid; somersault in the air
  const ang = a.spin + a.roll / (5.4 * k), cs = Math.cos(ang), sn = Math.sin(ang);
  let cx = 0, cy = 0;
  for (let i = 0; i < N; i++) { cx += U[2 * i]; cy += U[2 * i + 1]; }
  cx /= N; cy /= N;
  for (let i = 0; i < N; i++) {
    const u = U[2 * i] - cx, v = U[2 * i + 1] - cy;
    P[2 * i] = (cs * u - sn * v + cx - 5) * k; P[2 * i + 1] = (sn * u + cs * v + cy - 8) * k;
  }
  // a slow ripple along the rubber, and a wobble just after a contortion
  const ph = j * 1.9;
  for (let i = 0; i < N; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(N - 1, i + 1);
    const tx = P[2 * i1] - P[2 * i0], ty = P[2 * i1 + 1] - P[2 * i0 + 1], tl = Math.hypot(tx, ty) || 1;
    const d = 0.1 * Math.sin(i * 0.55 - now * 3.1 + ph) + 0.9 * a.jig * Math.sin(i * 0.33 + ph);
    P[2 * i] += (-ty / tl) * d; P[2 * i + 1] += (tx / tl) * d;
  }
  // feet: the lowest part of the body, found smoothly
  let yb = -1e9;
  for (let i = 0; i < N; i++) if (P[2 * i + 1] > yb) yb = P[2 * i + 1];
  let sw = 0, sx = 0;
  for (let i = 0; i < N; i++) { const w = Math.exp((P[2 * i + 1] - yb) * 1.5); sw += w; sx += w * P[2 * i]; }
  const xb = sx / sw;
  yb += r;
  // breathe, crouch/stretch, bow, sway: all about the feet; then feet to (0, 0)
  const fly = j < 2, c = a.c + 0.018 * Math.sin(now * 1.7 + ph), bow = a.bow;
  const sway = (fly ? 0.06 : 0.02) * Math.sin(now * (fly ? 1.25 : 0.9) + ph);
  const sc = Math.cos(sway), ss = Math.sin(sway);
  for (let i = 0; i < N; i++) {
    const x = (P[2 * i] - xb) * (1 + 0.6 * c + 0.25 * bow), y = (P[2 * i + 1] - yb) * (1 - c - 0.5 * bow);
    P[2 * i] = sc * x - ss * y; P[2 * i + 1] = ss * x + sc * y;
  }
  return [L, fi, xb, r, gm];
}

/** The high wire, anti-aliased one LED thick, and its two poles. */
function drawWire(pts, spotX, spot) {
  for (let x = Math.ceil(WIRE.x0); x <= WIRE.x1; x++) {
    const y = wireY(x, pts), yi = Math.floor(y), f = y - yi;
    const [ax, bw] = beam(spotX, y), l = 0.16 + 0.22 * spot * (1 - kit.smoothstep(0.4, 1.1, Math.abs(x - ax) / bw));
    for (const [yy, w] of [[yi, 1 - f], [yi + 1, f]]) {
      if (yy < 0 || yy >= H) continue;
      const o = 3 * (yy * W + x);
      for (let c = 0; c < 3; c++) img[o + c] += (ROPE[c] * l - img[o + c]) * w;
    }
  }
  for (const px of [Math.floor(WIRE.x0), Math.ceil(WIRE.x1)]) {
    for (let y = Math.floor(WIRE.y) - 1; y < FLOOR; y++) {
      const o = 3 * (y * W + px), l = y < WIRE.y + 0.5 ? 0.3 : 0.12;
      for (let c = 0; c < 3; c++) img[o + c] = POLE[c] * l;
    }
  }
}

export default {
  name: 'Contortion',
  blurb: 'rubber circus acrobats ARE the digits: contortionists bend into the next minute, wire walkers flip into the hour',
  layouts: ['hub'], look: 'smoke', fps: 60, brightness: 0.42, dither: true,
  frame(ctx) {
    const now = ctx.date.getTime() / 1000, M = Math.floor(now / 60) * 60, sec = now - M;
    const prev = digitsOf(new Date((M - 60) * 1000)), next = digitsOf(ctx.date);
    const hour = ctx.date.getMinutes() === 0 && sec < 8;
    const ch = next.map((d, j) => d !== prev[j]);
    look.now = now;
    // the follow-spot drifts, and swings onto whoever is performing
    let spotX = 32 + 7 * Math.sin(now * 0.21) + 3 * Math.sin(now * 0.53 + 1);
    const tgt = !hour && ch[3] && !ch[2] ? SLOT_X[3] : 32;
    const env = hour ? kit.smoothstep(0, 0.5, sec) * (1 - kit.smoothstep(4, 5.5, sec))
      : ch[3] ? kit.smoothstep(0, 0.7, sec) * (1 - kit.smoothstep(2.8, 4, sec)) : 0;
    spotX += (tgt - spotX) * env;
    const spot = (1 + (hour ? 0.35 * bump(sec, 2.3, 5) : 0)) * (1 - 0.35 * ctx.night);
    const lit = (x, y) => { const [ax, bw] = beam(spotX, y), d = Math.abs(x - ax) / bw; return 0.5 + 0.55 * spot * (1 - kit.smoothstep(0.5, 1.1, d)); };

    const acts = next.map((d, j) => act(sec, hour, ch[j], j));
    const hops = [hop(now, sec, hour, 0), hop(now, sec, hour, 1)];
    acts[0].c += hops[0][1]; acts[1].c += hops[1][1];
    drawStage(img, now, spotX, spot, [[SLOT_X[2], 9], [SLOT_X[3], 9]]);
    drawMotes(img, now, spotX, spot);
    // confetti drifts down behind the performers, so it never hides the time
    if (hour) drawConfetti(img, sec - HOUR.conf, ctx.date.getHours());
    // poses first: the walkers' feet set where the wire sags
    const poses = [], load = [];
    for (let j = 0; j < 4; j++) {
      const p = pose(j, acts[j], prev, next, ch, now);
      poses.push([P.slice(), ...p]);
      if (j < 2) load.push([SLOT_X[j] + 0.4 * p[2], WIRE.y + sag(now, sec, hour, j)]);
    }
    for (const j of [2, 3, -1, 0, 1]) {
      if (j < 0) { drawWire(load, spotX, spot); continue; }
      const R = ROLE[j], a = acts[j], [Q, L, fi, xb, r, gm] = poses[j];
      let ox, oy;
      if (j >= 2) { ox = SLOT_X[j] + xb + a.roll; oy = FLOOR - 0.35; }
      else {
        ox = load[j][0];
        if (hour && a.air > 0 && a.air < 1) {
          const u = a.air, y0 = WIRE.y + sag(now, HOUR.launch - 1e-3, true, j);
          oy = y0 + (WIRE.y - y0) * u - 26 * u * (1 - u) + 0.3;
        } else oy = load[j][1] + 0.3 - hops[j][0];
      }
      for (let i = 0; i < N; i++) { Q[2 * i] += ox; Q[2 * i + 1] += oy; }
      const tuck = (ch[j] || a.force) && a.e > 0 && a.e < 1 ? kit.smoothstep(0.22, 0.4, a.e) * (1 - kit.smoothstep(0.6, 0.78, a.e)) : 0;
      look.gold = j < 2; look.seg = L * R.k / (N - 1); look.plain = tuck;
      const rh = R.rh * (1 + 0.2 * tuck);
      const hd = drawBody(img, Q, r, fi, rh, gm.mitA, gm.mitB, look, lit);
      if (!hd) continue;
      // the face: blinks, glances, watches whoever is performing
      let [gx, gy] = gaze(now, j);
      const star = hour ? -1 : ch.findIndex((v, q) => v && q !== j);
      if (star >= 0) {
        const w = bump(sec, 0.1, 3.4);
        const tx = SLOT_X[star] - hd[0], ty = (star < 2 ? 12 : 40) - hd[1], tl = Math.hypot(tx, ty) || 1;
        gx += (tx / tl - gx) * w; gy += (ty / tl - gy) * w;
      }
      const bl = kit.fract(now / (3.3 + 0.7 * j) + 0.29 * j);
      let open = (1 - (bl < 0.04 ? Math.sin(Math.PI * bl / 0.04) : 0)) * (1 - 0.45 * ctx.night);
      const strain = a.e > 0 && a.e < 1 ? Math.sin(Math.PI * a.e) : 0;  // squeezed shut while contorting
      if (strain > 0.3) open = 0.1;
      const happy = a.bow > 0.06;
      if (happy) open = 0;
      drawFace(img, hd[0], hd[1], rh, gx, gy, open, happy, strain);
    }
    drawFootlights(img, now, hour ? 1 - kit.smoothstep(2.2, 2.6, sec) : 0);
    kit.blitGrid(ctx, img, 1 - 0.45 * ctx.night);
  },
};
