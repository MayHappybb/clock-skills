// Escalator: three HUB75 panels corner to corner are three floors of a
// department store, cut away, and one long DOWN escalator runs through all
// of them, passing the floor slabs where the panels kiss. The time is four
// numerals with legs running UP the down escalator, each exactly as fast as
// the steps come down, so they never get anywhere: running to stand still.
// Every foot lands on a real tread and is carried down with it before it
// lifts for the next one; shoppers ride calmly down past the frantic digits.
//
// Minute: the old digit gives up, hops on the handrail and slides down it,
// flies off the end; the new one bursts out of the revolving door at the
// bottom and sprints up into its place. The changing digits are always a
// suffix of the time (a digit only changes when all after it roll over), so
// leavers and arrivals never have to pass a digit that stays.
// Hour: a SALE. The revolving door spins wild and a crowd of shoppers
// stampedes up the escalator behind the new numerals.
import * as kit from '../js/kit.js';
import { GLYPHS, GW, GH, M as GM, R as GR, FW, FH } from './escalator-glyphs.js';

const W = 192;
const S = 6, V = 12, D = 16;            // step size (px), escalator speed (px/s per axis), line offset
const YF = 176, XC = 170;               // ground floor level, comb plate
const HR = 19, LEG = 8, LSEG = 6.8;     // handrail height, hip height, thigh = shin
const C0 = 0.4 * S;                     // where a foot lands on a tread
const SLOT = [26.5, 46, 90.5, 110];         // feet x of H1 H2 M1 M2 (panel 0 and 1)
const DOORX = 184, DOORR = 7, DOORTOP = 149;
const LEAN = 0.1, ACC = 210;

const lin = (s) => kit.hex(s);
const CORAL = lin('#ff7a52'), PEACH = lin('#ffd2b0'), TIRED = lin('#8a6f8c');
const LEGC = lin('#cfc4b8'), SHOE = lin('#ffffff'), PUPIL = [0, 0, 0];
const STEEL = lin('#7f8da3'), NOSE = lin('#ffc23a'), SKIRT = lin('#38d6ff');
const RAIL = lin('#ff2a1a'), WARM = lin('#ffb46a');
const COATS = ['#3d63e0', '#7a52d6', '#1fa3a0', '#5d7b9c', '#3c8fd8', '#8a7dff'].map(lin);
const BAGS = ['#ffe36a', '#ffffff', '#7ff0ff', '#c8ff6a'].map(lin);
const SKIN = lin('#e0a37c');

const img = new Float32Array(3 * W * W);
let VX = null, VY = null;               // valid pixel coordinates

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const sstep = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const mod = (a, n) => a - n * Math.floor(a / n);

/** Height of the tread centre line at x: a 45 degree incline that flattens onto the ground floor. */
function prof(x) {
  const a = x + D, b = YF, k = 16;
  const h = clamp(0.5 + (0.5 * (b - a)) / k);
  return b + (a - b) * h - k * h * (1 - h);
}
/** Top of the tread under screen x when the steps have moved by sh. */
function treadTop(x, sh) {
  if (x >= XC) return YF;
  const k = Math.floor((x - sh) / S);
  return prof(k * S + sh + S / 2);
}

// --------------------------------------------------------------- painting
function over(p, c, a) {
  if (a <= 0) return;
  const o = 3 * p;
  img[o] += (c[0] - img[o]) * a; img[o + 1] += (c[1] - img[o + 1]) * a; img[o + 2] += (c[2] - img[o + 2]) * a;
}
function addc(p, c, a) { const o = 3 * p; img[o] += c[0] * a; img[o + 1] += c[1] * a; img[o + 2] += c[2] * a; }
/** Anti-aliased capsule from a to b, painted over. */
function seg(ax, ay, bx, by, w, c, k = 1) {
  const r = w / 2 + 0.6;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r)), y1 = Math.min(W - 1, Math.ceil(Math.max(ay, by) + r));
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-6;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    let t = ((x - ax) * dx + (y - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - ax - t * dx, y - ay - t * dy);
    const a = clamp(w / 2 + 0.5 - d);
    if (a > 0) over(y * W + x, c, a * k);
  }
}
/** Anti-aliased ellipse (ry = r * sy), painted over. */
function disc(cx, cy, r, c, k = 1, sy = 1) {
  const ry = Math.max(0.3, r * sy);
  const x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(W - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - ry - 1)), y1 = Math.min(W - 1, Math.ceil(cy + ry + 1));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = (x - cx) / r, dy = (y - cy) / ry, q = Math.sqrt(dx * dx + dy * dy);
    const a = clamp((1 - q) * Math.min(r, ry) + 0.5);
    if (a > 0) over(y * W + x, c, a * k);
  }
}

// ------------------------------------------------------------ background
function background(tt, lightK) {
  const sh = V * tt, shR = -V * tt;
  for (let n = 0; n < VX.length; n++) {
    const x = VX[n], y = VY[n], p = y * W + x, o = 3 * p;
    let r = 0, g = 0, b = 0;
    const yl = prof(x);
    if (x < XC) {
      // the steps
      const k = Math.floor((x - sh) / S), fx = x - sh - k * S;
      const ty = prof(k * S + sh + S / 2);
      const dy = y - ty;
      const tread = clamp(1.15 - Math.abs(dy - 0.55));
      if (tread > 0) {
        const nose = fx > S - 2.2 ? 1 : 0;
        const c = nose ? NOSE : STEEL, a = nose ? 0.42 : 0.22;
        r += c[0] * a * tread; g += c[1] * a * tread; b += c[2] * a * tread;
      }
      // riser at the left edge of this step, up to the higher step behind it
      const tyHi = prof((k - 1) * S + sh + S / 2);
      if (fx < 1.5 && y > tyHi + 0.5 && y < ty) {
        const a = clamp(1.2 - fx) * 0.12;
        r += STEEL[0] * a; g += STEEL[1] * a; b += STEEL[2] * a;
      }
      // step side wedge, faint
      const below = yl + S / 2 + 1.5;
      if (dy > 1 && y < below) { r += 0.02; g += 0.022; b += 0.028; }
      // skirt light and truss
      const ds = y - below;
      const sk = clamp(1 - Math.abs(ds - 0.5));
      if (sk > 0) { r += SKIRT[0] * 0.16 * sk; g += SKIRT[1] * 0.16 * sk; b += SKIRT[2] * 0.16 * sk; }
      if (ds > 1.5 && ds < 15) {
        // return run: steps upside down, going back up
        const k2 = Math.floor((x - shR) / S), f2 = x - shR - k2 * S;
        const ry = prof(k2 * S + shR + S / 2) + 11.5;
        const ret = clamp(1 - Math.abs(y - ry));
        const rr = (f2 < 1 && y > ry - S && y < ry) ? 0.5 : 0;
        const a = 0.05 * Math.max(ret, rr);
        r += STEEL[0] * a; g += STEEL[1] * a; b += STEEL[2] * a;
      }
      const bt = clamp(1 - Math.abs(ds - 15.5));
      if (bt > 0) { r += 0.02 * bt; g += 0.022 * bt; b += 0.028 * bt; }
    } else {
      // ground floor beyond the comb
      if (y >= YF && y < YF + 1.5) { const a = y < YF + 0.5 ? 0.09 : 0.04; r += WARM[0] * a; g += WARM[1] * a; b += WARM[2] * a; }
      if (x < XC + 2 && y >= YF - 1 && y <= YF) { r += 0.12; g += 0.12; b += 0.13; }
    }
    // handrail, sliding with the steps: dark rubber, sheen travelling down
    const hy = prof(Math.min(x, XC + 6)) - HR;
    if (x <= XC + 6) {
      const hr = clamp(1.4 - Math.abs(y - hy));
      if (hr > 0) {
        const sheen = Math.pow(0.5 + 0.5 * Math.cos(((x - sh) / 9) * kit.TAU), 6);
        const a = hr * (0.6 + 1.4 * sheen);
        r += RAIL[0] * 0.13 * a; g += RAIL[1] * 0.13 * a; b += RAIL[2] * 0.13 * a;
      }
    } else {
      // the newel: the rail turns down round a half circle
      const cx = XC + 6, cy = YF - HR + 4.5, d = Math.hypot(x - cx, y - cy);
      if (x >= cx) { const hr = clamp(1.4 - Math.abs(d - 4.5)); if (hr > 0) { r += RAIL[0] * 0.12 * hr; g += RAIL[1] * 0.12 * hr; b += RAIL[2] * 0.12 * hr; } }
    }
    img[o] = r * lightK; img[o + 1] = g * lightK; img[o + 2] = b * lightK;
  }
  // bottom sprocket in the pit, turning with the chain
  const scx = XC - 3, scy = YF + 7.5, sr = 5;
  const ang = sh / sr;
  for (let k = 0; k < 6; k++) {
    const a = ang + (k * kit.TAU) / 6;
    seg(scx, scy, scx + Math.cos(a) * sr, scy + Math.sin(a) * sr, 1, STEEL, 0.05 * lightK);
  }
  disc(scx, scy, 1.2, STEEL, 0.08 * lightK);
}

// ------------------------------------------------------------ the store
const GLOW = lin('#ffd9a0'), MANNE = lin('#e8d6c8'), DRESS = [lin('#ff4f8b'), lin('#57d6c3')];
/** Floors 1 and 2: ceiling strip, pendant lamps over the empty corner, a window display under the escalator. */
function store(tt, lightK, night) {
  for (let f = 0; f < 2; f++) {
    const ox = 64 * f, oy = 64 * f;
    // ceiling: a warm strip with a cornice
    for (let x = ox + 20; x < ox + 64; x++) { addc(oy * W + x, WARM, 0.05 * lightK); addc((oy + 1) * W + x, WARM, 0.015 * lightK); }
    // two pendant lamps in the upper right, swaying a little
    for (const [lx, len, ph] of [[ox + 52, 6, f * 2.1], [ox + 60, 10, f * 2.1 + 1.3]]) {
      const sw = 0.1 * Math.sin(tt * 1.1 + ph);
      const bx = lx + Math.sin(sw) * len, by = oy + Math.cos(sw) * len;
      seg(lx, oy, bx, by, 0.8, WARM, 0.08 * lightK);
      seg(bx - 2.6, by + 2, bx + 2.6, by + 2, 1.3, WARM, 0.35 * lightK);
      disc(bx, by + 1, 1.6, WARM, 0.25 * lightK, 0.7);
      disc(bx, by + 3.2, 1, GLOW, 0.9 * lightK);
    }
    // shelves of goods in the free corner above the riders (clipped to y < x - 34)
    for (let sh = 0; sh < 3; sh++) {
      const yy = oy + 16 + 9 * sh;
      for (let x = ox + 36; x < ox + 62; x++) if (yy < x - ox + oy - 34) addc(yy * W + x, WARM, 0.09 * lightK);
      for (let b = 0; b < 6; b++) {
        const bx = ox + 37 + b * 4.2, hh = 2 + Math.floor(kit.hash(f, sh, b) * 4);
        if (yy - hh < bx - ox + oy - 36) {
          const cc = [COATS, BAGS][(sh + f) % 2][Math.floor(kit.hash(b, sh, f + 9) * 4)];
          for (let y = yy - hh; y < yy; y++) for (let x = Math.ceil(bx); x < bx + 3; x++) if (y < x - ox + oy - 34) addc(y * W + x, cc, 0.06 * lightK);
        }
      }
    }
    // floor slab at the panel's bottom, lit edge
    for (let x = ox; x < ox + 64; x++) { addc((oy + 63) * W + x, WARM, 0.07 * lightK); }
    // window display under the escalator: a mannequin in a dress, turning slowly on a plinth
    const mx = ox + 9, my = oy + 62;
    const turn = Math.cos(tt * 0.5 + f * 1.7), wid = 0.45 + 0.55 * Math.abs(turn);
    seg(mx - 3.5, my, mx + 3.5, my, 1.2, GLOW, 0.2 * lightK);
    seg(mx, my, mx, my - 6, 0.8, MANNE, 0.25 * lightK);
    const dc = DRESS[f];
    for (let j = 0; j < 9; j++) { const yy = my - 6 - j, hw = (j < 5 ? 3.2 - 0.35 * j : 1.4) * wid; seg(mx - hw, yy, mx + hw, yy, 1, dc, 0.45 * lightK); }
    disc(mx, my - 17, 1.7, MANNE, 0.4 * lightK);
    // spotlight cone on it
    for (let y = oy + 46; y < my; y++) { const hw = (y - oy - 46) * 0.4; for (let x = Math.ceil(mx - hw); x <= mx + hw; x++) if (x >= ox) addc(y * W + x, GLOW, 0.006 * lightK); }
  }
}
function door(theta, lightK, night) {
  const x0 = DOORX - DOORR, x1 = DOORX + DOORR;
  // outside, seen through the glass: daylight or street dark
  const out = kit.mix(lin('#5c88b8'), lin('#1a2440'), night);
  for (let y = DOORTOP + 2; y < YF; y++) for (let x = x0; x <= x1; x++) addc(y * W + x, out, 0.035 * lightK);
  // four glass wings round the axis, front wings brighter
  for (let k = 0; k < 4; k++) {
    const a = theta + (k * Math.PI) / 2, ex = DOORX + Math.cos(a) * DOORR, z = Math.sin(a);
    const lum = (0.04 + 0.08 * (z > 0 ? z : 0)) * lightK;
    seg(ex, DOORTOP + 2.5, ex, YF - 1, 1, lin('#bfe6ff'), lum / 0.12 * 0.12);
  }
  // drum: canopy and posts
  seg(x0 - 1, DOORTOP, x1 + 1, DOORTOP, 2, WARM, 0.16 * lightK);
  seg(x0, DOORTOP, x0, YF - 0.5, 1, WARM, 0.08 * lightK);
}

function lamps(tt, lightK) {
  // pendant globes on the ground floor ceiling, gently swinging
  for (const [lx, len, ph] of [[150, 7, 0], [166, 11, 1.7]]) {
    const sw = 0.12 * Math.sin(tt * 1.3 + ph);
    const bx = lx + Math.sin(sw) * len, by = 128 + Math.cos(sw) * len;
    seg(lx, 128, bx, by, 0.8, WARM, 0.05 * lightK);
    disc(bx, by + 1.2, 1.8, WARM, 0.5 * lightK);
  }
}

// ------------------------------------------------------------ the riders
/** Sample a glyph SDF (px) at glyph coordinates. */
function sdfAt(G, gx, gy) {
  let sx = (gx + GM) * GR - 0.5, sy = (gy + GM) * GR - 0.5;
  if (sx < 0 || sy < 0 || sx >= FW - 1 || sy >= FH - 1) return 9;
  const ix = sx | 0, iy = sy | 0, fx = sx - ix, fy = sy - iy, s = G.sdf, q = iy * FW + ix;
  const a = s[q] + (s[q + 1] - s[q]) * fx, b = s[q + FW] + (s[q + FW + 1] - s[q + FW]) * fx;
  return a + (b - a) * fy;
}

/**
 * One numeral. (X, bodyY) is the hip centre (bottom middle of the body),
 * pass 0 cuts the moat, pass 1 paints the body.
 */
function body(d, X, bodyY, pass, col, k) {
  const G = GLYPHS[d], ox = X - G.hip, oy = bodyY - GH;
  const x0 = Math.max(0, Math.floor(ox - LEAN * GH - 3)), x1 = Math.min(W - 1, Math.ceil(ox + GW + 3));
  const y0 = Math.max(0, Math.floor(oy - 3)), y1 = Math.min(W - 1, Math.ceil(oy + GH + 3));
  for (let y = y0; y <= y1; y++) {
    const gy = y - oy, shx = LEAN * (GH - gy);
    for (let x = x0; x <= x1; x++) {
      const s = sdfAt(G, x - ox + shx, gy);
      const p = y * W + x, o = 3 * p;
      if (pass === 0) {
        if (s < 2.6) { const m = (1 - sstep((s - 1.2) / 1.4)) * k; img[o] *= 1 - m; img[o + 1] *= 1 - m; img[o + 2] *= 1 - m; }
      } else {
        const a = clamp(0.5 - s);
        if (a <= 0) continue;
        const core = clamp(-s / 2.3), top = 1.12 - 0.3 * (gy / GH);
        const f = (0.62 + 0.45 * core) * top * k;
        img[o] += (col[0] * f + PEACH[0] * 0.18 * core * core * k - img[o]) * a;
        img[o + 1] += (col[1] * f + PEACH[1] * 0.18 * core * core * k - img[o + 1]) * a;
        img[o + 2] += (col[2] * f + PEACH[2] * 0.18 * core * core * k - img[o + 2]) * a;
      }
    }
  }
}
function eye(d, X, bodyY, open, k, look) {
  const G = GLYPHS[d], ox = X - G.hip, oy = bodyY - GH;
  const ex = ox + G.eye[0] - LEAN * (GH - G.eye[1]), ey = oy + G.eye[1];
  if (open > 0.15) {
    disc(ex, ey, 1.75, [1, 1, 1], k, open);
    disc(ex - 0.55 + look, ey - 0.35, 0.85, PUPIL, k, open);
  } else seg(ex - 1.6, ey, ex + 1.6, ey, 0.9, PUPIL, k);
}

/** A leg from the hip to the foot, bending its knee forward (up the stairs). */
function leg(hx, hy, fx, fy, k) {
  let vx = fx - hx, vy = fy - hy, d = Math.hypot(vx, vy);
  const L = LSEG;
  if (d > 2 * L - 0.01) { const s = (2 * L - 0.01) / d; vx *= s; vy *= s; fx = hx + vx; fy = hy + vy; d = 2 * L - 0.01; }
  const h = Math.sqrt(Math.max(0, L * L - (d * d) / 4));
  const kx = hx + vx / 2 - (vy / d) * h, ky = hy + vy / 2 + (vx / d) * h;
  seg(hx, hy, kx, ky, 2.1, LEGC, 0.75 * k);
  seg(kx, ky, fx, fy, 1.9, LEGC, 0.75 * k);
  seg(fx + 0.8, fy - 0.6, fx - 2.6, fy - 0.6, 2.2, SHOE, 0.9 * k);
}

/**
 * The running gait. sigma is the body's position in the steps' own frame
 * (x - V t): each foot plants on a tread, is carried down with it for 6 px,
 * then swings up two steps. Returns the body bob.
 */
function runLegs(X, hipY, sigma, sh, k) {
  let bob = 0;
  for (let i = 0; i < 2; i++) {
    const z = mod(sigma - C0 - i * S, 2 * S);
    let q, lift = 0;
    if (z <= S / 2) q = sigma - z;
    else if (z >= 1.5 * S) q = sigma - z + 2 * S;
    else {
      const tau = (1.5 * S - z) / S, e = sstep(tau);
      q = sigma - z + 2 * S * (1 - e);
      lift = 4.2 * Math.sin(Math.PI * tau);
      bob = Math.max(bob, Math.sin(Math.PI * tau));
    }
    const fx = q + sh, fy = treadTop(fx, sh) - 0.6 - lift;
    leg(X + (i ? 1.3 : -1.3), hipY - 0.5, fx, fy, k);
  }
  return bob;
}

// ------------------------------------------------------------- shoppers
/** A small shopper with feet at (x, fy): coat, head, swinging bag; walk phase w (or -1 standing). */
function shopper(x, fy, h, coat, bag, w, k) {
  const hip = fy - h * 0.38, sho = fy - h * 0.78;
  if (w < 0) {
    seg(x - 0.8, hip, x - 0.8, fy - 0.5, 1.1, coat, 0.5 * k);
    seg(x + 0.8, hip, x + 0.8, fy - 0.5, 1.1, coat, 0.5 * k);
  } else {
    const s = Math.sin(w) * h * 0.18;
    seg(x, hip, x + s, fy - 0.5, 1.1, coat, 0.55 * k);
    seg(x, hip, x - s, fy - 0.5, 1.1, coat, 0.55 * k);
  }
  seg(x, hip, x, sho, 2.6, coat, k);
  disc(x - 0.2, sho - h * 0.13, h * 0.11 + 0.6, SKIN, 0.9 * k);
  if (bag) {
    const sw = w < 0 ? 0 : Math.sin(w + 1) * 0.8;
    seg(x + 1.6, sho + 1, x + 2.2 + sw, hip + 0.5, 0.6, bag, 0.5 * k);
    disc(x + 2.4 + sw, hip + 1.8, 1.6, bag, 0.9 * k);
  }
}

// ----------------------------------------------------------------- time
const pad = (n) => String(n).padStart(2, '0');
const digitsAt = (ms) => { const d = new Date(ms); return pad(d.getHours()) + pad(d.getMinutes()); };

const TURN = { minA0: 0.6, minTr: 1.9, hourA0: 0.45, hourTr: 2.0 };

export default {
  name: 'Escalator',
  blurb: 'four numerals running up the down escalator of a three-floor store, to stand still; sale stampede on the hour',
  layouts: ['hub-steps'], look: 'smoke', fps: 60, brightness: 0.45,
  frame(ctx) {
    const Gd = kit.grid(ctx);
    if (!VX) {
      const xs = [], ys = [];
      for (let y = 0; y < Gd.h; y++) for (let x = 0; x < Gd.w; x++) if (Gd.idx[y * Gd.w + x] >= 0) { xs.push(x); ys.push(y); }
      VX = Int16Array.from(xs); VY = Int16Array.from(ys);
    }
    const ms = ctx.date.getTime();
    const tt = (((ms % 3600000) + 3600000) % 3600000) / 1000;   // periodic time: every motion has a period dividing 1 h
    const sh = V * tt;
    const lightK = 1 - 0.55 * ctx.night;
    const Mn = Math.floor(ms / 60000), age = (ms - Mn * 60000) / 1000;
    const cur = digitsAt(ms), prev = digitsAt((Mn - 1) * 60000);
    let c = 0; while (c < 4 && cur[c] === prev[c]) c++;
    const hour = c <= 1;
    const A0 = hour ? TURN.hourA0 : TURN.minA0, TR = hour ? TURN.hourTr : TURN.minTr;
    const inTurn = c < 4 && age < A0 + TR + 1.5;

    background(tt, 1.8 * lightK);
    lamps(tt, 1.5 * lightK);
    store(tt, 1.6 * lightK, ctx.night);

    // revolving door: idles, and is kicked a quarter turn by everyone who passes
    let theta = 0.35 * tt;
    const kick = (e) => { theta += (Math.PI / 2) * sstep((tt - e + 0.25) / 0.7); };

    // calm shoppers riding down, then walking out of the door
    const PER = 10;
    const n0 = Math.floor(tt / PER);
    const calm = [];
    for (let n = n0 - 2; n <= n0; n++) {
      const t0 = n * PER, a = tt - t0;
      if (a < 0) continue;
      const tc = (XC - 2 + 18) / V;           // time to reach the comb
      let x, w = -1;
      if (a < tc) x = -18 + V * a;
      else { x = XC - 2 + 20 * (a - tc); w = (x - XC) / 2.2; }
      const tDoor = t0 + tc + (DOORX - XC + 2) / 20;
      kick(tDoor);
      if (x > W + 6) continue;
      const hh = kit.hash(n, 3);
      calm.push([x, w, 10 + Math.floor(hh * 3), COATS[Math.floor(kit.hash(n, 4) * COATS.length)], kit.hash(n, 5) > 0.4 ? BAGS[Math.floor(kit.hash(n, 6) * BAGS.length)] : null]);
    }

    // hour: the sale crowd
    const crowd = [];
    if (hour && age < 14) {
      const N = 38;
      for (let j = 0; j < N; j++) {
        const r = 0.9 + j * 0.15 + 0.12 * kit.hash(j, Mn), u = 46 + 16 * kit.hash(j, 7);
        const a = age - r;
        if (a < 0) continue;
        kick(tt - age + r + (W + 8 - DOORX) / u);
        const x = W + 8 - u * a;
        if (x < -14) continue;
        crowd.push([x, (W + 8 - x) / 2.0 + j, 10 + Math.floor(kit.hash(j, 9) * 4), COATS[j % COATS.length], BAGS[(j * 7) % BAGS.length]]);
      }
    }

    // riders: steady ones, leavers (sliding the rail) and arrivals
    const riders = [];   // [digit, X, mode, aux]  mode 0 slot, 1 arriving
    const leavers = [];
    for (let i = 0; i < 4; i++) {
      const X0 = SLOT[i];
      if (!inTurn || i < c) { riders.push([+cur[i], X0, 0, 0]); continue; }
      leavers.push([+prev[i], X0, i]);
      const a0 = A0 + 0.12 * (i - c), Xs = W + 14 + 24 * (i - c);
      const tau = (age - a0) / TR;
      const X = X0 + (Xs - X0) * (1 - sstep(tau));
      if (X < W + 12) riders.push([+cur[i], X, 1, tau]);
      // when it comes through the door
      const tDoorTau = 1 - (DOORX - X0) / (Xs - X0);  // smoothstep inverse not needed exactly: kick near it
      kick(tt - age + a0 + TR * Math.acos(1 - 2 * clamp(tDoorTau)) / Math.PI * 0.95);
    }
    door(theta, lightK, ctx.night);

    for (const s of calm) shopper(s[0], (s[1] < 0 ? treadTop(s[0], sh) : YF) - 0.5, s[2], s[3], s[4], s[1], 0.32 * lightK);
    for (const s of crowd) shopper(s[0], treadTop(s[0], sh) - 0.5 - 1.5 * Math.abs(Math.sin(s[1])), s[2], s[3], s[4], s[1], 0.45 * lightK);

    // leavers: hop on the rail, slide, fly off the end
    for (const [d, X0, i] of leavers) {
      const a = age - 0.06 * (i - c);
      if (a < 0) continue;
      const hop = sstep(a / 0.32);
      const s = Math.max(0, a - 0.25);
      let X = X0 + V * a + 0.5 * ACC * s * s, by;
      const railEnd = XC + 6;
      if (X <= railEnd) {
        const ride = prof(X) - LEG, rail = prof(X) - HR + 0.8;
        by = ride + (rail - ride) * hop - 3 * Math.sin(Math.PI * hop);
      } else {
        const vx = V + ACC * (Math.sqrt((railEnd - X0 - V * 0.25) * 2 / ACC) || 0);
        const tf = (X - railEnd) / Math.max(vx, 1);
        X = railEnd + (X - railEnd);
        by = prof(railEnd) - HR + 0.8 - 30 * tf + 160 * tf * tf;
      }
      if (X > W + 12 || by > W + GH) continue;
      const k = lightK * 0.55;
      body(d, X, by, 0, null, 0.6);
      seg(X - 1.3, by - 0.5, X + 3.5, by + 3.5, 1.5, LEGC, 0.3 * k);
      seg(X + 1.3, by - 0.5, X + 5.0, by + 3.0, 1.5, LEGC, 0.3 * k);
      body(d, X, by, 1, TIRED, k);
      eye(d, X, by, 0, k, 0);
    }

    // runners
    for (const [d, X, mode, tau] of riders) {
      const foot = X >= XC ? YF : prof(X);
      const sigma = X - sh;
      const hipY0 = foot - LEG;
      body(d, X, hipY0, 0, null, 1);
      const bob = runLegs(X, hipY0, sigma, sh, lightK);
      const by = hipY0 - 0.8 * bob;
      body(d, X, by, 1, CORAL, lightK);
      const blink = kit.hash(Math.floor(tt / 0.13), d * 7 + Math.floor(X)) > 0.985 ? 0 : 1;
      eye(d, X, by, blink, lightK, mode ? -0.3 : 0);
    }

    kit.blitGrid(ctx, img, 1);
  },
};
