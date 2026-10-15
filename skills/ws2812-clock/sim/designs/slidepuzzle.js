// Slide Puzzle: the nine panels are the nine slots of a giant 8-puzzle.
// Eight glossy tiles carry one 1930s travel poster (a lighthouse on a
// headland, a living picture: the sky follows the day, the lantern sweeps
// its beam at night), and four of them carry the poster's Didone numerals,
// on a stair: hours top-left, minutes bottom-right. The ninth slot is the
// empty tray, a recess lined with felt, with a trapdoor in its floor.
//
// Each minute the puzzle plays itself: the tray slides to the changing
// digit, the old digit tile is pushed into the tray and sinks through the
// trapdoor, and at :00 the new tile rises in its slot and seats with a
// click; then the tray slides home. On the hour the tray runs a flurry up
// and down the board, and a wave of key-presses rolls across all nine
// slots: the hour tiles sink and return new, the tray moves to a new home.
//
// Rendering: the poster is painted in picture space (slidepuzzle-scene.js);
// each tile builds its 64x64 face (picture piece, numeral, bevel) and is
// composited at its sub-pixel position and scale, over the felt and the
// soft shadows the tiles cast into the tray.
import * as kit from '../js/kit.js';
import { GLYPHS } from './slidepuzzle-glyphs.js';
import { render as paintScene, palette, N } from './slidepuzzle-scene.js';
import { scriptFor, SINK, RISE } from './slidepuzzle-plan.js';

const T = 64, NN = N * N;
const P = new Float32Array(3 * NN), O = new Float32Array(3 * NN), SH = new Float32Array(NN);
const FELT = new Float32Array(3 * NN), TEX = new Float32Array(3 * T * T);
const BMUL = new Float32Array(T * T), BADD = new Float32Array(T * T), CREAM = new Float32Array(3 * T);

// felt: oxblood wool with fibre noise, darker toward the walls of the recess
(function felt() {
  const c = kit.hex('#5a1620');
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const lx = x % T, ly = y % T, e = Math.min(lx, ly, T - 1 - lx, T - 1 - ly);
    const n = 0.75 + 0.5 * kit.fbm(x * 0.35, y * 0.35, 7, 3) + 0.15 * (kit.hash(x, y) - 0.5);
    const wall = 0.35 + 0.65 * kit.smoothstep(0, 9, e);
    const p = 3 * (y * N + x);
    FELT[p] = c[0] * n * wall; FELT[p + 1] = c[1] * n * wall + 0.003; FELT[p + 2] = c[2] * n * wall + 0.003;
  }
  // bevel: light from the top-left; a dark groove on the outermost pixel
  for (let v = 0; v < T; v++) for (let u = 0; u < T; u++) {
    let m = 1, a = 0;
    const top = v, left = u, bot = T - 1 - v, right = T - 1 - u, e = Math.min(top, left, bot, right);
    if (e < 4) {
      // which face of the bevel: the nearest edge
      const k = (4 - e) / 4;
      if (e === top && top <= left) { m = 1 + 0.5 * k; a = 0.09 * k; }
      else if (e === left) { m = 1 + 0.3 * k; a = 0.05 * k; }
      else if (e === bot) { m = 1 - 0.6 * k; }
      else { m = 1 - 0.45 * k; }
    }
    if (e === 0) { m *= 0.12; a *= 0.2; } else if (e === 1) { m *= 0.75; }
    BMUL[v * T + u] = m; BADD[v * T + u] = a;
  }
  // numeral ink: ivory at the crown, warm gold at the foot
  const hi = kit.hex('#fff3d6'), lo = kit.hex('#f2b45a');
  for (let v = 0; v < T; v++) { const c2 = kit.mix(hi, lo, kit.smoothstep(6, 58, v)); CREAM.set(c2, 3 * v); }
})();

const slotXY = (s) => [(s % 3) * T, Math.floor(s / 3) * T];
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// per-frame tile states (monomorphic, reused)
const ST = Array.from({ length: 24 }, () => ({ tile: null, x: 0, y: 0, s: 1, lum: 1, z: 1, order: 0 }));
const OPEN = new Float32Array(9), FLAPW = new Float32Array(9), FLAPL = new Float32Array(9);

/** Where a tile is at local time t; returns false if not on the board. */
function place(st, tl, t, now) {
  if (t < tl.birth || t >= tl.death) return false;
  let slot = tl.slot0, x, y, z = 1, s = 1, lum = 1, order = 1;
  [x, y] = slotXY(slot);
  const sl = tl.slides;
  for (let i = 0; i < sl.length; i += 4) {
    const t0 = sl[i], t1 = sl[i + 1], a = sl[i + 2], b = sl[i + 3];
    if (t < t0) break;
    const [ax, ay] = slotXY(a), [bx, by] = slotXY(b);
    if (t < t1) {
      const k = easeIO((t - t0) / (t1 - t0));
      x = ax + (bx - ax) * k; y = ay + (by - ay) * k; order = 2;
      break;
    }
    // seated: the click, a short rebound against the stop
    x = bx; y = by; slot = b;
    const dt = t - t1;
    if (dt < 0.3) {
      const r = 0.9 * Math.exp(-dt * 18) * Math.sin(dt * 70);
      x -= Math.sign(bx - ax) * r; y -= Math.sign(by - ay) * r;
    }
  }
  if (t >= tl.sink0) {
    const k = kit.clamp((t - tl.sink0) / SINK);
    s = 1 - 0.42 * kit.ease.in(k) - 0.06 * k; lum = (1 - k) ** 1.4; z = 1 - k; order = 0;
  } else if (t < tl.rise0 + RISE) {
    const k = kit.clamp((t - tl.rise0) / RISE);
    s = 0.55 + 0.45 * kit.ease.outBack(k); lum = kit.smoothstep(0, 0.6, k); z = Math.max(0, (s - 0.55) / 0.45); order = 3;
  }
  if (t >= tl.dip0 && t < tl.dip0 + 0.9) {
    const k = (t - tl.dip0) / 0.9;
    const d = k < 0.35 ? -Math.sin((k / 0.35) * Math.PI / 2) : -Math.cos(((k - 0.35) / 0.65) * Math.PI * 1.5) * Math.exp(-(k - 0.35) * 3.5);
    s = 1 + 0.13 * d; lum = 1 + (d < 0 ? 0.55 * d : 0.3 * d); z = 1 + 2.5 * d; order = 2;
  }
  // gentle life: tiles are never perfectly still in their slots
  x += 0.22 * Math.sin(now * 0.9 + tl.frag * 2.3); y += 0.22 * Math.sin(now * 0.73 + tl.frag * 1.7 + 1);
  st.tile = tl; st.x = x; st.y = y; st.s = s; st.lum = lum; st.z = z; st.order = order;
  return true;
}

/** The 64x64 face of a tile: its piece of the poster, its numeral, its bevel. */
function buildFace(tl) {
  const fx = (tl.frag % 3) * T, fy = Math.floor(tl.frag / 3) * T;
  const g = tl.glyph >= 0 ? GLYPHS.G[tl.glyph] : null, kk = tl.glyph >= 0 ? GLYPHS.K[tl.glyph] : null;
  for (let v = 0; v < T; v++) {
    const prow = 3 * ((fy + v) * N + fx), cr = CREAM[3 * v], cg = CREAM[3 * v + 1], cb = CREAM[3 * v + 2];
    for (let u = 0; u < T; u++) {
      const q = 3 * (v * T + u), p = prow + 3 * u, j = v * T + u;
      let r = P[p], gg = P[p + 1], b = P[p + 2];
      if (g) {
        const dk = 1 - 0.9 * kk[j], ink = g[j];
        r = r * dk + (cr - r * dk) * ink; gg = gg * dk + (cg - gg * dk) * ink; b = b * dk + (cb - b * dk) * ink;
      }
      const m = BMUL[j], a = BADD[j];
      TEX[q] = r * m + a; TEX[q + 1] = gg * m + a; TEX[q + 2] = b * m + a;
    }
  }
}

function composite(st, glossC, glossA) {
  const s = st.s, cx = st.x + 32, cy = st.y + 32, half = 32 * s, lum = st.lum;
  const X0 = Math.max(0, Math.floor(cx - half)), X1 = Math.min(N - 1, Math.ceil(cx + half));
  const Y0 = Math.max(0, Math.floor(cy - half)), Y1 = Math.min(N - 1, Math.ceil(cy + half));
  const inv = 1 / s;
  for (let Y = Y0; Y <= Y1; Y++) {
    const v = (Y + 0.5 - cy) * inv + 32;
    const ay = kit.clamp(Math.min(v, 64 - v) * s + 0.5);
    if (ay <= 0) continue;
    const tv = Math.min(63, Math.max(0, v - 0.5)), v0 = Math.min(62, Math.floor(tv)), fv = tv - v0;
    for (let X = X0; X <= X1; X++) {
      const u = (X + 0.5 - cx) * inv + 32;
      const a = kit.clamp(Math.min(u, 64 - u) * s + 0.5) * ay;
      if (a <= 0) continue;
      const tu = Math.min(63, Math.max(0, u - 0.5)), u0 = Math.min(62, Math.floor(tu)), fu = tu - u0;
      const i00 = 3 * (v0 * T + u0), i01 = i00 + 3, i10 = i00 + 3 * T, i11 = i10 + 3;
      const w00 = (1 - fu) * (1 - fv), w01 = fu * (1 - fv), w10 = (1 - fu) * fv, w11 = fu * fv;
      // gloss: a soft window reflection travelling slowly across the board
      const gb = (X * 0.75 + Y - glossC) / 16, gl = glossA * Math.exp(-gb * gb);
      const o = 3 * (Y * N + X);
      for (let c = 0; c < 3; c++) {
        const tex = TEX[i00 + c] * w00 + TEX[i01 + c] * w01 + TEX[i10 + c] * w10 + TEX[i11 + c] * w11;
        O[o + c] += ((tex + gl) * lum - O[o + c]) * a;
      }
    }
  }
}

function castShadow(st) {
  const z = st.z;
  if (z <= 0.01) return;
  const s = st.s, half = 32 * s, cx = st.x + 32 + 3.2 * z + 0.8, cy = st.y + 32 + 4.4 * z + 0.8, soft = 2 + 2.4 * z;
  const X0 = Math.max(0, Math.floor(cx - half - soft)), X1 = Math.min(N - 1, Math.ceil(cx + half + soft));
  const Y0 = Math.max(0, Math.floor(cy - half - soft)), Y1 = Math.min(N - 1, Math.ceil(cy + half + soft));
  const k = 0.85 * Math.min(1, st.lum + 0.3);
  for (let Y = Y0; Y <= Y1; Y++) {
    const dy = Math.abs(Y + 0.5 - cy) - half, ay = kit.clamp(0.5 - dy / soft);
    for (let X = X0; X <= X1; X++) {
      const dx = Math.abs(X + 0.5 - cx) - half, ax = kit.clamp(0.5 - dx / soft);
      SH[Y * N + X] *= 1 - k * ax * ay;
    }
  }
}

export default {
  name: 'Slide Puzzle',
  blurb: 'the nine panels are a giant 8-puzzle of a lighthouse poster; digit tiles swap through a trapdoor in the empty tray, and the hour plays a flurry',
  layouts: ['hub-3x3'], look: 'smoke', fps: 60, brightness: 0.3, dither: true,
  frame(ctx) {
    const G = kit.grid(ctx);
    const now = ctx.date.getTime() / 1000;
    const B = Math.round(now / 60), t = now - B * 60;
    const scr = scriptFor(B);
    const d = ctx.date, hourF = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
    const pal = palette(hourF);
    if (scr.hourTurn) {
      // the lighthouse marks the hour: its lamp blazes and the beam sweeps the board
      const e = kit.smoothstep(-1.5, 0, t) * (1 - kit.smoothstep(6, 9, t));
      pal.beam = Math.max(pal.beam, e); pal.lamp = Math.max(pal.lamp, e);
    }
    paintScene(P, now, d, pal, 0.95);

    // tiles on the board now
    let n = 0;
    OPEN.fill(0);
    for (const tl of scr.tiles) {
      if (tl.rise0 > -1e8) {
        const r = t - tl.rise0, k = kit.smoothstep(-0.35, 0, r) * (1 - kit.smoothstep(RISE - 0.1, RISE + 0.6, r));
        OPEN[tl.slot0] = Math.max(OPEN[tl.slot0], k);
      }
      if (tl.sink0 < 1e8 && t > tl.sink0 - 0.15) { const k = t < tl.death ? kit.smoothstep(-0.15, 0.3, t - tl.sink0) : 1 - kit.smoothstep(0.05, 0.6, t - tl.death); OPEN[tl.slot] = Math.max(OPEN[tl.slot], k); }
      if (place(ST[n], tl, t, now)) n++;
    }
    // felt, opened where a trapdoor is down, then the tiles' shadows
    SH.fill(1);
    for (let i = 0; i < n; i++) castShadow(ST[i]);
    // trapdoors: two felt flaps hinged at the slot's sides swing down
    for (let k = 0; k < 9; k++) { const o = OPEN[k]; FLAPW[k] = 32 * Math.cos(o * Math.PI / 2); FLAPL[k] = 1 - 0.65 * Math.sin(o * Math.PI / 2); }
    for (let y = 0; y < N; y++) {
      const ry = Math.floor(y / T) * 3, ly = y % T;
      for (let x = 0; x < N; x++) {
        const p = y * N + x, sl = ry + Math.floor(x / T);
        let k = SH[p];
        if (OPEN[sl] > 0) {
          const lx = x % T + 0.5, w = FLAPW[sl], e = Math.min(lx, T - lx);
          // in a flap: tilted away from the light; in the gap: the dark shaft
          const inFlap = kit.clamp(w - e + 0.5);
          const shaft = 0.08 * kit.smoothstep(0, 24, Math.min(ly, T - ly));
          k *= FLAPL[sl] * inFlap + shaft * (1 - inFlap);
        }
        O[3 * p] = FELT[3 * p] * k; O[3 * p + 1] = FELT[3 * p + 1] * k; O[3 * p + 2] = FELT[3 * p + 2] * k;
      }
    }
    // tiles, lowest first
    const order = ST.slice(0, n).sort((a, b) => a.order - b.order);
    const glossC = 150 + 150 * Math.sin(now * 0.045);
    let glossA = 0.022;
    if (scr.hourTurn && t > 0 && t < 3) glossA += 0.16 * Math.sin(Math.PI * t / 3) ** 2;
    const shineC = scr.hourTurn && t > 0 && t < 3 ? -40 + t * 140 : glossC;
    for (const st of order) { buildFace(st.tile); composite(st, shineC, glossA); }

    const dim = 1 - 0.4 * ctx.night, out = ctx.out, idx = G.idx;
    for (let p = 0; p < NN; p++) {
      const i = idx[p];
      if (i < 0) continue;
      out[3 * i] = O[3 * p] * dim; out[3 * i + 1] = O[3 * p + 1] * dim; out[3 * i + 2] = O[3 * p + 2] * dim;
    }
  },
};
