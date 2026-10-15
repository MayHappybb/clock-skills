// Kolam: the doorstep of a South Indian house at dawn, and the time is the
// kolam on it. Each numeral is drawn the way a kolam is: a row of pulli (rice
// flour dots) laid along the digit's centreline, and one closed flour line
// weaving round them, its two branches crossing between every pair of dots
// so each dot sits in its own lens, wrapping round the end dots of an open
// stroke and crossing at its corners (kolam-glyphs.js: ten centrelines drawn
// for this face, open counters, a figure-eight 8, a ring-and-tail 6 and 9).
// Hours are a small kolam top left, minutes a big one at the right; a clay
// lamp on a mango leaf with marigolds sits below the hours.
//
// Alive at rest: the line is never finished. The lenses breathe in a wave
// that runs along every digit, the crossings slide to and fro as if the line
// were being retraced, and once a second the flour is re-sprinkled: a bright
// front runs down each digit and swells the lenses as it passes. Ants walk
// the line (rice flour kolams feed them). The shadow of a coconut frond sways
// across the step, the lamp's flame flickers. Every quarter minute a hand of
// rangoli powder fills the lenses with colour along the digit (kumkum and
// saffron, turmeric and leaf green, red and indigo), and it soaks away.
//
// Minute turn: a coconut-rib broom comes up the step and sweeps the changing
// kolams in three strokes (the flour thins grain by grain, ranked once, and
// goes to dust), the broom flicks off the top, the swept ground is sprinkled
// (it darkens in spots and dries over ten seconds), the new pulli are tapped
// in all along the new digit, and a hand in glass bangles reaches in from the
// step and draws the line round them, both branches at once, fresh flour
// bright behind the fingers. Hour: the whole step is washed, and after the
// new kolam a festival rangoli blooms out from the colon in a powder front:
// a lotus in rings and a sikku lattice in deep powder colours, every lens of
// the time filled, a dark moat kept round each flour line. It soaks away at
// :50-:56.
//
// Palette: what is on a real doorstep: damp dark earth (warm by day, blue-
// black by night), rice flour white (four grain shades and a fresh white),
// six rangoli powders in a bright and a deep set, fired clay, oil, flame,
// marigold and leaf. Every pixel is an index (flour, ground, powder) looked
// up through a palette mixed per frame for night and for light (sun, frond
// shadow, lamp glow): one table lookup a pixel. All hard pixels (flour is
// grainy); only the hand is anti-aliased. Night dims the backlight to 45%,
// cools the ground and flour, and lets the lamp light a warm pool.
//
// Cost: the flour line is stamped by a 1.5 px pen at 0.5 px steps along
// precomputed centreline tables (4.2k samples, ~50 KB as int16), three
// table sines a sample; the frame is one index-to-colour pass. Per minute: a
// wet-ground field (12.8k px, the frame that needs it), and at the hour a
// moat mask. RAM beyond the frame: the index buffer 12.8 KB, two wet fields
// 25.6 KB, one moat 12.8 KB.
import { clockFields, sin, ease, clamp, progress, hash } from '../js/kit.js';
import { buildGlyph } from './kolam-glyphs.js';
import {
  W, H, N, I, PAL, palettes, GRAIN, RANK, GROUND, FINE, SW, SHADOW, GLOWD, lampInto, flameInto,
  RANGOLI, RDIST, RCX,
} from './kolam-world.js';

const SIZES = {
  big: { w: 37, h: 72, d: 7.2, A: 3.4, inset: 4.7, dot: 2, mo: 1 },
  small: { w: 25, h: 46, d: 6.0, A: 2.7, inset: 3.9, dot: 1, mo: 0.72 },
};
const SLOTS = [
  { x: 3, y: 3, z: 'small' }, { x: 31, y: 3, z: 'small' },
  { x: 80, y: 4, z: 'big' }, { x: 121, y: 4, z: 'big' },
];
const TRAVEL = 50;   // samples of hand travel between two strokes of a digit
const GLYPH = {};
for (const z of Object.keys(SIZES)) {
  const S = SIZES[z];
  GLYPH[z] = [];
  for (let c = 0; c < 10; c++) {
    const gl = buildGlyph(c, S.w - 2 * S.inset, S.h - 2 * S.inset, S.d);
    let o = 0;
    gl.offs = gl.strokes.map((st, k) => { const v = o; o += st.M + 1 + (k < gl.strokes.length - 1 ? TRAVEL : 0); return v; });
    gl.T = o;
    // every dot's place on the drawing timeline, for waves along the digit
    let k = 0;
    for (let q = 0; q < gl.strokes.length; q++) for (const dt of gl.strokes[q].dots) { dt.frac = (gl.offs[q] + dt.j) / gl.T; dt.k = k++; }
    GLYPH[z][c] = gl;
  }
  // the colour fill of one lens: pixel offsets round a dot, nearest first
  const r = S.A - 0.8, off = [];
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    const ex = dx + 0.5 - S.dot * 0.5, ey = dy + 0.5 - S.dot * 0.5, d = Math.hypot(ex, ey);
    if (d < r) off.push([dx, dy, d]);
  }
  off.sort((a, b) => a[2] - b[2]);
  S.fill = off.map(([dx, dy]) => [dx, dy]);
}
const sineE = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);
const CAP = Array.from({ length: 11 }, (_, k) => [Math.cos(((k + 1) / 12) * Math.PI), Math.sin(((k + 1) / 12) * Math.PI)]);

// ------------------------------------------------------------ the turn's schedule (seconds of the minute)
const SW_IN = 58.0, SW0 = 58.2, PASS = 0.48, SW_OUT = SW0 + 3 * PASS, SW_END = 59.98;  // the broom
const WET0 = 59.7, WETLEN = 0.5, DRY = 4.5;                                                   // the sprinkle
const TAP0 = 0.15, TAP1 = 0.5;                                                              // the pulli
const DRAW0 = 0.4, DRAW1 = 2.7;                                                             // the hand
const FLOUR_RISE = 0.8;

// ------------------------------------------------------------ the index buffer and the flour pen
const IDX = new Uint8Array(N);
let ops = 0;
let THR = null, DLO = 0, FADE = 0;     // sweep thresholds per row; dust floor; festival fade
const THR_ROWS = new Int16Array(H);

function put(i, y, v) {
  if (THR !== null) {
    const r = RANK[i], t = THR_ROWS[y];
    if (r < t) { if (r >= t - 70 && r >= DLO && IDX[i] < 8) IDX[i] = I.DUST; return; }
  }
  IDX[i] = v;
}

function flourAt(i, fresh) {
  if (fresh > 0.7) return I.FRESH;
  const g = GRAIN[i];
  if (fresh > 0.3 || g > 215) return I.BRIGHT;
  return g < 45 ? I.DIM : I.FLOUR;
}

/** The 1.5 px flour pen at (x, y). */
function pen(x, y, fresh) {
  const xa = ((x + 7.75) | 0) - 8, ya = ((y + 7.75) | 0) - 8;   // ceil(x - 1.25)
  const xb = ((x + 8.25) | 0) - 8, yb = ((y + 8.25) | 0) - 8;   // ceil(x + 0.25) - 1
  for (let yy = ya; yy <= yb; yy++) {
    if (yy < 0 || yy >= H) continue;
    for (let xx = xa; xx <= xb; xx++) {
      if (xx < 0 || xx >= W) continue;
      const i = yy * W + xx;
      put(i, yy, flourAt(i, fresh));
    }
  }
  ops += 6;
}

// one glyph's drawing parameters (reused, monomorphic)
const G = {
  ox: 0, oy: 0, S: null, rest: 1, tau: 0, head: 1e9, rate: 1, tap: 1e9, slot: 0,
  fillT: -1, fillA: 0, fillB: 0, fill4: false, fillFade: 0, hand: null,
};

function drawGlyph(gl) {
  const { ox, oy, S, tau, head, rate } = G, rest = G.rest * S.mo;
  const A0 = S.A;
  // lens colours first, so the line lies over their edges
  if (G.fillT > 0) {
    const F = S.fill, nF = F.length;
    for (const st of gl.strokes) for (const dt of st.dots) {
      const lt = G.fillT - 0.9 * dt.frac;
      if (lt <= 0) continue;
      const n = Math.min(nF, Math.ceil((lt / 0.25) * nF));
      const v = G.fill4 ? I.MAG + ((dt.k * 3) % 5) : dt.k & 1 ? G.fillB : G.fillA;
      const bx = Math.floor(ox + dt.x - (S.dot - 1) * 0.5), by = Math.floor(oy + dt.y - (S.dot - 1) * 0.5);
      for (let q = 0; q < n; q++) {
        const x = bx + F[q][0], y = by + F[q][1];
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        if (RANK[i] < G.fillFade) continue;
        put(i, y, v);
      }
      ops += n * 3;
    }
  }
  for (let q = 0; q < gl.strokes.length; q++) {
    const st = gl.strokes[q], { px, py, nx, ny, w, M, L } = st;
    const jd = Math.min(M, Math.floor(head - gl.offs[q]));
    if (jd < 0) continue;
    const sf = (tau / 0.55) * L, LAM = 1 / (2 * S.d);
    for (let b = -1; b <= 1; b += 2) {
      for (let j = 0; j <= jd; j++) {
        const sj = st.s[j];
        let fresh = 0, A = A0, wj = w[j];
        if (rest > 0) {
          const age = tau - (sj / L) * 0.55;
          if (age >= 0 && age < 0.4) fresh = (1 - age / 0.4) * G.rest;
          const dd = sj > sf ? sj - sf : sf - sj;
          // the lenses breathe in a wave along the line, and the beat's front swells them
          A += rest * ((dd < 8 ? (1 - dd / 8) * 1.0 : 0) + 0.6 * sin(6.2832 * (sj * LAM - G.sec)));
          // the crossings slide to and fro: the line is being retraced
          wj = sin(3.14159 * (st.ph[j] + rest * 0.16 * sin(6.2832 * (sj / 31 - 0.5 * G.sec))));
        }
        if (head < 1e8) { const ag = (jd - j) / rate; if (ag < 0.5) fresh = Math.max(fresh, 1 - ag / 0.5); }
        const o = b * A * wj;
        pen(ox + px[j] + o * nx[j], oy + py[j] + o * ny[j], fresh);
      }
    }
    // an open stroke wraps round its end dots
    if (st.open) for (let e = 0; e < 2; e++) {
      const j = e ? M : 0, sg = e ? 1 : -1;
      if (e && jd < M) continue;
      const A = A0 + rest * 0.6 * sin(6.2832 * (st.s[j] / (2 * S.d) - G.sec));
      const tx = ny[j], ty = -nx[j];
      for (let k = 0; k < CAP.length; k++) {
        const ca = CAP[k][0], sa = CAP[k][1];
        pen(ox + px[j] + A * (w[j] * ca * nx[j] + sg * sa * tx), oy + py[j] + A * (w[j] * ca * ny[j] + sg * sa * ty), 0);
      }
    }
  }
  // the pulli, tapped in before the line
  for (const st of gl.strokes) for (const dt of st.dots) {
    const tt = G.tap - 0.35 * ((hash(dt.k, G.slot, 7) & 255) / 255);
    if (tt < 0) continue;
    const x = Math.floor(ox + dt.x - (S.dot - 1) * 0.5), y = Math.floor(oy + dt.y - (S.dot - 1) * 0.5);
    // a dot also flares as the beat's re-sprinkle front passes it
    const age = tau - (dt.s / st.L) * 0.55;
    const pop = tt < 0.18 || (G.rest > 0.5 && age >= 0 && age < 0.16);
    for (let yy = 0; yy < S.dot; yy++) for (let xx = 0; xx < S.dot; xx++) put((y + yy) * W + x + xx, y + yy, pop ? I.FRESH : I.DOT);
    if (pop) for (const [dx, dy] of [[-1, 0], [S.dot, 0], [0, -1], [0, S.dot]]) put((y + dy) * W + x + dx, y + dy, I.BRIGHT);
  }
}

/** Where the drawing hand's fingertips are on the glyph's timeline. */
function headPoint(gl, h, out) {
  const n = gl.strokes.length;
  for (let q = 0; q < n; q++) {
    const st = gl.strokes[q], o = gl.offs[q];
    if (h < o + st.M + 1 || q === n - 1) {
      if (h < o && q > 0) {
        const pv = gl.strokes[q - 1], u = ease.inOutQuad(clamp((h - (o - TRAVEL)) / TRAVEL, 0, 1));
        out[0] = pv.px[pv.M] + (st.px[0] - pv.px[pv.M]) * u; out[1] = pv.py[pv.M] + (st.py[0] - pv.py[pv.M]) * u;
        return;
      }
      const j = clamp(Math.floor(h - o), 0, st.M);
      out[0] = st.px[j]; out[1] = st.py[j];
      return;
    }
  }
}

// ------------------------------------------------------------ per-minute caches
const WETS = new Map();
function wetField(mk) {
  let f = WETS.get(mk);
  if (f) return f;
  f = new Uint8Array(N);
  const a = clockFields(new Date((mk - 1) * 60000)), b = clockFields(new Date(mk * 60000));
  const da = a.hh + a.mm, db = b.hh + b.mm, hour = a.h !== b.h;
  const boxes = [];
  for (let k = 0; k < 4; k++) if (da[k] !== db[k]) { const sl = SLOTS[k], S = SIZES[sl.z]; boxes.push([sl.x, sl.y, sl.x + S.w, sl.y + S.h]); }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let d = 99;
    for (const [x0, y0, x1, y1] of boxes) {
      const ex = x < x0 ? x0 - x : x > x1 ? x - x1 : 0, ey = y < y0 ? y0 - y : y > y1 ? y - y1 : 0;
      d = Math.min(d, Math.max(ex, ey * 1.3));
    }
    const i = y * W + x;
    let v = (1 - d / 15) * 210 + (FINE[i] - 128) * 0.7 + 30;
    if (hour) v = Math.max(v, 150 + (FINE[i] - 128) * 0.8);
    f[i] = clamp(Math.round(v), 0, 255);
  }
  ops += N * 6;
  WETS.set(mk, f);
  if (WETS.size > 2) WETS.delete(WETS.keys().next().value);
  return f;
}

const MOATS = new Map();
/** At the festival the field keeps a dark moat round every flour line. */
function moat(mk, digits) {
  let m = MOATS.get(mk);
  if (m) return m;
  m = new Uint8Array(N);
  for (let k = 0; k < 4; k++) {
    const sl = SLOTS[k], S = SIZES[sl.z], gl = GLYPH[sl.z][+digits[k]], R = S.A + 3.2, R2 = R * R;
    for (const st of gl.strokes) for (let j = 0; j <= st.M; j += 3) {
      const cx = sl.x + S.inset + st.px[j], cy = sl.y + S.inset + st.py[j];
      for (let y = Math.floor(cy - R); y <= cy + R; y++) for (let x = Math.floor(cx - R); x <= cx + R; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        if (dx * dx + dy * dy < R2) m[y * W + x] = 1;
      }
      ops += 60;
    }
  }
  for (const cy of COLON_Y) for (let y = cy - 6; y <= cy + 6; y++) for (let x = COLON_X - 6; x <= COLON_X + 6; x++) if ((x - COLON_X) ** 2 + (y - cy) ** 2 < 30) m[y * W + x] = 1;
  MOATS.set(mk, m);
  if (MOATS.size > 1) MOATS.delete(MOATS.keys().next().value);
  return m;
}

const COLON_X = 67, COLON_Y = [19, 33];

// ------------------------------------------------------------ actors drawn over the glass
const HP = [0, 0];
function hand(g, x, y, nt) {
  const k = 1 - 0.45 * nt;
  const sc = (c) => ((((c >> 16) & 255) * k) << 16) | ((((c >> 8) & 255) * k) << 8) | ((c & 255) * k);
  const SK = sc(0x8d5a3b), SKD = sc(0x5e3a24);
  // the forearm reaches in from the bottom edge (we are kneeling on the step)
  const ax = x + 6, ay = y + 11, ex = x + 6 + 26, ey = y + 11 + 45;
  g.thickLine(ax, ay, ex, ey, 7.6, SKD, { aa: true });
  g.thickLine(ax, ay, ex, ey, 6, SK, { aa: true });
  // glass bangles at the wrist
  const ux = (ex - ax) / 52, uy = (ey - ay) / 52;
  const bangles = [sc(0xd8202c), sc(0x2a9a40), sc(0xe0b030), sc(0xd8202c)];
  for (let q = 0; q < 4; q++) {
    const bx = ax + ux * (5 + q * 1.6), by = ay + uy * (5 + q * 1.6);
    g.thickLine(bx - uy * 4.2, by + ux * 4.2, bx + uy * 4.2, by - ux * 4.2, 1.4, bangles[q], { aa: true });
  }
  // the hand: palm, and the thumb and fingers pinched on the flour
  g.fillCircle(x + 4, y + 7, 4.6, SKD, { aa: true });
  g.fillCircle(x + 4, y + 7, 3.8, SK, { aa: true });
  g.thickLine(x + 1.5, y + 5, x + 0.5, y + 1, 2.8, SKD, { aa: true });
  g.thickLine(x + 1.5, y + 5, x + 0.5, y + 1, 2.0, SK, { aa: true });
  g.thickLine(x + 4.5, y + 3.5, x + 1.2, y + 0.6, 2.2, SK, { aa: true });
  g.fillCircle(x + 0.6, y + 0.4, 1.1, sc(0xc89070), { aa: true });   // the fingertips, floury
}

function broom(g, sl, S, tip, dir, nt) {
  const k = 1 - 0.45 * nt;
  const sc = (c) => ((((c >> 16) & 255) * k) << 16) | ((((c >> 8) & 255) * k) << 8) | ((c & 255) * k);
  const cx = sl.x + S.w / 2, bx = cx + 2, by = tip + 30;
  const C1 = sc(0xc2a464), C2 = sc(0x8c7444);
  for (let q = 0; q <= 14; q++) {
    const u = q / 14 - 0.5, tx = cx + u * (S.w + 6), bend = dir * (2 + 2 * Math.abs(u));
    g.line(Math.round(bx + u * 5), by, Math.round(tx), Math.round(tip + bend), q & 1 ? C2 : C1);
  }
  g.fillRect(Math.round(bx - 3), by - 1, 7, 4, sc(0x8a2a1c));
  g.thickLine(bx, by + 3, bx + 1, by + 30, 3, sc(0x6b5030));
}

// ------------------------------------------------------------ the face
export default {
  name: 'Kolam',
  blurb: 'The time is a rice-flour kolam on a damp doorstep: lines weave round pulli and breathe; a broom sweeps, a hand redraws; a festival rangoli blooms at the hour.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey, nt = ctx.night;
    ctx.lcd.backlight(1 - 0.55 * nt);
    ops = 0;
    const prv = clockFields(new Date(ctx.date.getTime() - 60000)), nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm, pd = prv.hh + prv.mm, nd = nxt.hh + nxt.mm;
    const hourMin = prv.h !== f.h;
    G.sec = s;

    IDX.set(GROUND);
    // the festival field (the hour's first minute)
    let fadeF = 0;
    if (hourMin && s > 2.8) {
      const rf = 112 * ease.inOutQuad(progress(s, 2.8, 5.6));
      fadeF = Math.round(256 * progress(s, 50, 56));
      const M = moat(mk, cur);
      for (let i = 0; i < N; i++) {
        if (M[i]) continue;
        const d = RDIST[i];
        if (d < rf) { if (RANK[i] >= fadeF) IDX[i] = rf - d < 1.5 && rf < 110 ? I.FRESH : RANGOLI[i]; }
      }
      ops += N * 4;
    }
    ops += lampInto(IDX) * 2;
    ops += flameInto(IDX, s, mk) * 12;

    const actors = [];
    let tau0 = s - Math.floor(s);
    for (let k = 0; k < 4; k++) {
      const sl = SLOTS[k], S = SIZES[sl.z];
      G.ox = sl.x + S.inset; G.oy = sl.y + S.inset; G.S = S; G.slot = k;
      let tau = tau0 - 0.07 * k; if (tau < 0) tau += 1;
      G.tau = tau; G.fillT = -1; G.fillFade = 0; G.fill4 = false;
      THR = null; DLO = 0;
      // the old kolam's dust, just after the turn
      const gl = GLYPH[sl.z][+cur[k]];
      const fresh = pd[k] !== cur[k] && s < DRAW1 + 1;
      const leaving = nd[k] !== cur[k] && s >= SW0;
      if (fresh) {
        G.tap = s - TAP0;
        const u = sineE(progress(s, DRAW0, DRAW1));
        G.head = s < DRAW1 ? u * gl.T : 1e9;
        G.rate = gl.T / (DRAW1 - DRAW0);
        G.rest = progress(s, DRAW1, DRAW1 + FLOUR_RISE);
        if (s > DRAW0 - 0.35 && s < DRAW1 + 0.4) {
          let hx, hy;
          headPoint(gl, s < DRAW1 ? u * gl.T : gl.T, HP);
          hx = G.ox + HP[0]; hy = G.oy + HP[1];
          if (s < DRAW0) { const e = ease.outCubic(progress(s, DRAW0 - 0.35, DRAW0)); hx += (1 - e) * 30; hy += (1 - e) * (H + 12 - hy); }
          if (s > DRAW1) { const e = ease.inCubic(progress(s, DRAW1, DRAW1 + 0.4)); hx += e * 30; hy += e * (H + 12 - hy); }
          actors.push([0, hx, hy]);
        }
      } else {
        G.tap = 1e9; G.head = 1e9; G.rest = 1;
      }
      if (leaving) {
        THR = THR_ROWS;
        const p = Math.floor((s - SW0) / PASS), lp = sineE(progress(s - SW0 - p * PASS, 0, PASS));
        const top = sl.y - 3, bot = sl.y + S.h + 3;
        let tip;
        if (s < SW_OUT) {
          const up = (p & 1) === 0;
          tip = up ? bot - (bot - top) * lp : top + (bot - top) * lp;
          for (let y = 0; y < H; y++) {
            const behind = up ? y > tip : y < tip;
            THR_ROWS[y] = Math.round(((p + (behind ? 1 : 0)) * 256) / 3);
          }
          actors.push([1, k, tip, up ? 1 : -1]);
        } else {
          // the last of the dust is flicked away before the minute turns
          THR_ROWS.fill(256); DLO = 186 + 70 * progress(s, SW_OUT, SW_END - 0.05);
          tip = top - (top + 75) * sineE(progress(s, SW_OUT, SW_END));
          if (s < SW_END) actors.push([1, k, tip, 1]);
        }
        G.rest = 1;
      } else if (s >= SW_IN && s < SW0 && nd[k] !== cur[k]) {
        const bot = sl.y + S.h + 3;
        actors.push([1, k, H + 40 - (H + 40 - bot) * ease.outCubic(progress(s, SW_IN, SW0)), 1]);
      }
      // the colour: a flourish every quarter minute, the whole festival at the hour
      if (hourMin) {
        if (s > 3.2) { G.fillT = s - 3.2; G.fill4 = true; G.fillFade = fadeF; }
      } else {
        const e = Math.floor(s / 15), t0 = e * 15, lt = s - t0;
        if (e > 0 && lt < 7) {
          G.fillT = lt; G.fillFade = Math.round(256 * progress(lt, 5.5, 7));
          const PAIRS = [[I.MAG, I.SAF], [I.TUR, I.GRN], [I.KUM, I.IND]];
          G.fillA = PAIRS[e - 1][0]; G.fillB = PAIRS[e - 1][1];
        }
      }
      drawGlyph(gl);
      THR = null;
      // ants walk the line at rest
      if (!fresh && !leaving) {
        const st = gl.strokes[0], loop = 2 * (st.M + 1);
        for (let a = 0; a < (S === SIZES.big ? 2 : 1); a++) {
          const pos = ((hash(k, a, mk) % loop) + Math.floor(s * 18)) % loop;
          const b = pos <= st.M ? 1 : -1, j = b > 0 ? pos : loop - 1 - pos;
          const o = b * S.A * st.w[j];
          const x = Math.floor(G.ox + st.px[j] + o * st.nx[j]), y = Math.floor(G.oy + st.py[j] + o * st.ny[j]);
          if (x >= 0 && y >= 0 && x < W && y < H) IDX[y * W + x] = I.ANT;
          const j2 = clamp(j - b * 2, 0, st.M), o2 = b * S.A * st.w[j2];
          const x2 = Math.floor(G.ox + st.px[j2] + o2 * st.nx[j2]), y2 = Math.floor(G.oy + st.py[j2] + o2 * st.ny[j2]);
          if (x2 >= 0 && y2 >= 0 && x2 < W && y2 < H) IDX[y2 * W + x2] = I.ANT;
        }
      }
    }
    // the colon: two pulli in small loops
    for (const cy of COLON_Y) {
      const fr = tau0 < 0.3 ? 1 - tau0 / 0.3 : 0;
      IDX[cy * W + COLON_X] = I.DOT;
      for (let q = 0; q < 14; q++) {
        const a = (q / 14) * 6.2832;
        pen(COLON_X + 0.5 + 2.2 * sin(a + 1.5708), cy + 0.5 + 2.2 * sin(a), fr);
      }
    }

    // ---- light: wet ground, the frond's shadow, the lamp's glow, through the palettes
    ops += palettes(nt);
    let wf = null, wthr = 256;
    if (s >= WET0) { wf = wetField(mk + 1); wthr = 256 - 196 * progress(s, WET0, WET0 + WETLEN); }
    else if (s < DRY) {
      wf = wetField(mk);
      const sp = 60 - WET0;   // seconds of the sprinkle already spent before :00
      wthr = s < WETLEN - sp ? 256 - 196 * progress(s + sp, 0, WETLEN) : 60 + 196 * progress(s, WETLEN - sp, DRY);
    }
    const off = 30 + Math.round(10 * sin((6.2832 * s) / 10) + 4 * sin((6.2832 * s) / 4 + 1));
    const flick = sin(s * 9.4) + 0.6 * sin(s * 23.1);
    const g1 = 9 + Math.round(flick), g2 = 20 + Math.round(flick * 1.5);
    const buf = g.buf, P0 = PAL[0], P1 = PAL[1], P2 = PAL[2], P3 = PAL[3], P4 = PAL[4];
    for (let y = 0, i = 0; y < H; y++) {
      const row = y * SW;
      for (let x = 0; x < W; x++, i++) {
        let v = IDX[i];
        if (v < 4 && wf !== null && wf[i] > wthr) v += 4;
        const gd = GLOWD[i];
        if (gd < g2) { buf[i] = gd < g1 ? P3[v] : P4[v]; continue; }
        const l = SHADOW[row + ((x + off) & 255)];
        buf[i] = l === 0 ? P0[v] : l === 1 ? P1[v] : P2[v];
      }
    }
    g.cost.px += N; g.cost.box += N * 3 + Math.round(ops / 3);

    for (const a of actors) {
      if (a[0] === 0) hand(g, a[1], a[2], nt);
      else broom(g, SLOTS[a[1]], SIZES[SLOTS[a[1]].z], a[2], a[3], nt);
    }
  },
};
