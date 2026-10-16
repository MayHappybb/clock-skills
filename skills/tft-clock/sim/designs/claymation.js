// claymation: the time as one lump of plasticine, re-sculpted by hand,
// shot on a cutting mat at 12 frames a second.
//
// Idea: stop-motion is a single lump of clay that becomes things. Here the
// lump becomes the hour ("10:", in vermilion clay, colon after), gets
// squashed back into a ball whose colour marbles into canary yellow, and
// becomes the minutes (":09", colon before), then back, every ten seconds.
// You read the time over one cycle: red with the colon after it is the hour,
// yellow with the colon before it is the minute. Between frames the
// animator's hands touch it, so the clay boils, thumbprints appear in it,
// the snakes lean; at every minute the ball hops; at the hour a thumb comes
// into shot and flattens it.
//
// Technique: no flat fills or keylines. Every glyph is a distance field
// (claymation-glyphs.js); per frame the fields are blended with the ball's,
// read as a height (a rolled snake's round cross-section), and lit from the
// top left with a soft plasticine sheen, thumbprint dents and ridges, and a
// cast shadow on the mat. Everything is quantised to 12 fps and the design
// sends 12 frames a second: the stop-motion cadence is the rhythm.
//
// Palette: dark green self-healing mat with its grid, vermilion and canary
// plasticine (and their orange marbling), skin for the one thumb.

import { FIELDS, FW, FH, R, TOP, SW, skeletonPoints } from './claymation-glyphs.js';
import { hash, rand, noise, noise2, ease, clamp, progress, lerp, mix, scale, hex, R as cR, G as cG, B as cB, rgb, cos, sin } from '../js/kit.js';

const W = 160, H = 80;
const FPS = 12;

const MAT = hex('#1d4a40'), GRID = hex('#2e6656'), SHADOW = hex('#0c231e');
const CLAY = [hex('#e4492a'), hex('#f4b923')]; // hour, minute
const SKIN = hex('#e9a77f'), NAIL = hex('#f6d2bf');

// Light from the top left, a little above.
const L = (() => { const v = [-0.5, -0.62, 0.6], n = Math.hypot(...v); return v.map((c) => c / n); })();
const HV = (() => { const v = [L[0], L[1], L[2] + 1], n = Math.hypot(...v); return v.map((c) => c / n); })();

const DIGIT_CX = [57.5, 102.5];   // the two digits, centred on the glass
const COLON_CX = [134, 26];       // hour: colon after; minute: colon before
const BALL = { x: 80, y: 40, r: 21 };

// sqrt from a table over [0, 512) with a lerp (a lookup on the device, like kit.sin)
const SQN = 4, SQ = Float32Array.from({ length: 512 * SQN + 2 }, (_, i) => Math.sqrt(i / SQN));
function tsqrt(v) {
  if (v <= 0) return 0;
  if (v >= 512) return Math.sqrt(v);
  const f = v * SQN, i = f | 0;
  return SQ[i] + (SQ[i + 1] - SQ[i]) * (f - i);
}
// 0xRRGGBB from float channels, clamped (integer ops only)
const pk = (r, g, b) => ((r > 255 ? 255 : r < 0 ? 0 : r | 0) << 16) | ((g > 255 ? 255 : g < 0 ? 0 : g | 0) << 8) | (b > 255 ? 255 : b < 0 ? 0 : b | 0);

const D = new Float32Array(W * H); // this frame's clay distance, scratch (a 25.6 KB buffer on the device)
const BOX = [12, 2, 136, 76];      // where the clay can be

// ---------------------------------------------------------------- timing

/**
 * The state of the sculpture at stop-motion time tq (seconds into the
 * minute, on 1/12 s) for clock fields f.
 */
function state(f, tq) {
  const cycle = Math.floor(tq / 10), ct = tq - cycle * 10;
  const half = ct < 5 ? 0 : 1, local = ct - half * 5;
  const hourTurn = f.m === 0 && cycle === 0 && half === 0;
  // u: 1 = a ball, 0 = the numerals.
  const s0 = hourTurn ? 1.6 : 0.3, s1 = s0 + 0.9;
  let u;
  if (local < s0) u = 1;
  else if (local < s1) u = 1 - ease.inOutQuad((local - s0) / (s1 - s0));
  else if (local < 3.9) u = 0;
  else if (local < 4.7) u = ease.inOutQuad((local - 3.9) / 0.8);
  else u = 1;
  // Colour: marbles from one clay into the other across the lump moment.
  let other = 0;
  if (local > 4.3) other = 0.5 * progress(local, 4.3, 5);
  else if (local < 0.7) other = 0.5 - 0.5 * progress(local, 0, 0.7);
  const otherHalf = 1 - half;
  return { cycle, half, local, u, other, otherHalf, hourTurn, s1 };
}

// ---------------------------------------------------------------- the design

export default {
  name: 'Claymation',
  blurb: 'One lump of plasticine, re-sculpted at 12 fps into the hour, then the minutes, then back; thumbprints, boil, a thumb at the hour.',
  fps: FPS,

  frame(g, ctx) {
    const f = ctx.fields;
    ctx.lcd.backlight(1 - 0.7 * ctx.night);
    const k = Math.floor(f.sec * FPS);            // stop-motion frame in the minute
    const tq = k / FPS;
    const kg = f.minuteKey * 720 + k;             // frame number since the epoch
    const st = state(f, tq);
    const { half, u } = st;
    const label = half === 0 ? f.hh : f.mm;
    const formId = hash(f.minuteKey, st.cycle * 2 + half, 7);

    // Exposure flicker, frame to frame, as on a real stop-motion stage.
    const ex = 1 + (rand(kg, 3) - 0.5) * 0.05;

    // ---- the ball: hops at the minute, gets flattened by a thumb at the hour
    let bx = BALL.x, by = BALL.y, ax = BALL.r, ay = BALL.r, lift = 0, ballH = BALL.r;
    const toTurn = f.sec < 30 ? f.sec : f.sec - 60;          // seconds from the nearest minute turn
    const thumb = thumbAt(f, toTurn);
    if (thumb.press > 0) {
      // squashed into a pancake under the thumb
      const p = thumb.press;
      ax = BALL.r * (1 + 0.45 * p); ay = BALL.r * (1 + 0.32 * p); ballH = BALL.r * (1 - 0.6 * p);
    } else if (!st.hourTurn && Math.abs(toTurn) < 0.34 && !(f.m === 59 && toTurn < 0) && !(f.m === 0 && toTurn >= 0)) {
      const ph = (toTurn + 0.34) / 0.68;                        // 0..1 over the hop
      lift = Math.sin(Math.PI * ph);
      const sq = ph < 0.15 ? 1 - ph / 0.15 : ph > 0.85 ? (ph - 0.85) / 0.15 : 0;
      ax = BALL.r * (1 + 0.12 * sq) * (1 + 0.18 * lift); ay = BALL.r * (1 - 0.1 * sq) * (1 + 0.18 * lift);
      by -= 3 * lift;
    }
    // Wobble of the ball while it is a ball (hand-rolled, never quite round).
    const wob = (noise(kg * 0.35, 11) - 0.5) * 0.08;
    ax *= 1 + wob; ay *= 1 - wob;

    // ---- the numerals: each leans a little, frame to frame
    const glyphs = [];
    if (u < 1) {
      for (let i = 0; i < 2; i++) glyphs.push({ ch: label[i], cx: DIGIT_CX[i], lean: (noise(kg * 0.18, 20 + i + half * 2) - 0.5) * 0.07 });
      glyphs.push({ ch: ':', cx: COLON_CX[half], lean: 0 });
    }

    // ---- pass A: the clay's signed distance into D
    D.fill(99);
    const seed = kg & 1023;
    const boil = 0.7;
    const tseed = formId & 1023;
    const rmin = Math.min(ax, ay);
    g.fillWhere((px, py, x, y) => {
      let dd = 99;
      if (u < 1) {
        for (let i = 0; i < glyphs.length; i++) {
          const gl = glyphs[i];
          const sx = px - gl.lean * (py - 66) - gl.cx + FW / 2;
          const ix = sx | 0;
          if (ix < 0 || ix >= FW) continue;
          const v = FIELDS[gl.ch][y * FW + ix];
          if (v < dd) dd = v;
        }
      }
      let d = dd;
      if (u > 0) {
        const qx = (px - bx) / ax, qy = (py - by) / ay;
        const dl = (tsqrt(qx * qx + qy * qy) - 1) * rmin;
        d = u >= 1 ? dl : dd + (dl - dd) * u;
      }
      // hand-worked surface (fixed for this sculpt) plus the boil (new every frame)
      if (d < 3) d += (noise2(px * 0.34, py * 0.34, tseed) - 0.5) * 0.7 + (noise2(px * 0.2, py * 0.2, seed) - 0.5) * boil;
      D[y * W + x] = d;
      return false;
    }, 0, BOX);

    // ---- thumbprints: a few, pressed in between frames during the hold
    const prints = [];
    const pr = (n) => rand(formId, n);
    if (u < 1) {
      const pts = [skeletonPoints(label[0], DIGIT_CX[0]), skeletonPoints(label[1], DIGIT_CX[1])];
      for (let j = 0; j < 4; j++) {
        const appear = j === 0 ? 0 : st.s1 + 0.2 + j * 0.7 + pr(j * 5) * 0.4;
        if (st.local < appear) continue;
        const set = pts[(pr(j * 5 + 1) * 2) | 0];
        const p = set[(pr(j * 5 + 2) * set.length) | 0];
        prints.push({ x: p[0] + (pr(j * 5 + 3) - 0.5) * 3, y: p[1] + (pr(j * 5 + 4) - 0.5) * 3, r: 5.2, dent: 1.4, ell: 1.25 });
      }
    } else {
      prints.push({ x: bx - 6 + pr(1) * 10, y: by - 8 + pr(2) * 10, r: 6, dent: 1.6, ell: 1.2 });
    }
    if (thumb.print > 0 && u > 0) prints.push({ x: bx + 2, y: by - 1, r: 13, dent: 2.6 * thumb.print * u, ell: 1.35, big: true });

    // ---- colours
    const own = CLAY[half], oth = CLAY[st.otherHalf];
    const marble = st.other;
    const mseed = (formId & 255) + 5;
    const swirl = (Math.floor(tq * 1.5) % 7) * 0.4;

    // ---- shadow and height parameters
    const Rh = R + (ballH - R) * u;                  // height of the clay
    const so = 3.5 + u * 1.5 + lift * 9;             // shadow offset (down right)
    const soi = Math.round(so);

    // ---- pass B: mat, shadow, lit clay
    const matC = scale(MAT, ex), gridC = scale(GRID, ex), shC = scale(SHADOW, ex);
    const shK = 0.33 * (0.75 - lift * 0.35);
    g.paint((px, py, x, y) => {
      // the mat
      let bg = ((x + 3) % 10 === 0 || (y + 5) % 10 === 0) ? gridC : matC;
      const i = y * W + x;
      const d = D[i];
      if (d > 0.5) {
        const sx = x - soi, sy = y - soi;
        if (sx >= 0 && sy >= 0) {
          const ds = D[sy * W + sx];
          if (ds < 1.5) {
            const a = (1.5 - ds) * shK, k = a > 0.75 ? 0.75 : a;
            bg = pk(cR(bg) + (cR(shC) - cR(bg)) * k, cG(bg) + (cG(shC) - cG(bg)) * k, cB(bg) + (cB(shC) - cB(bg)) * k);
          }
        }
        return bg;
      }
      // the clay: gradient of the distance, slope of a round snake
      let gx = (D[i + 1] - D[i - 1]) * 0.5, gy = (D[i + W] - D[i - W]) * 0.5;
      const gl = tsqrt(gx * gx + gy * gy) || 1;
      gx /= gl; gy /= gl;
      let slope = 0;
      if (d > -Rh) {
        const a = Rh + d, hh = Rh * Rh - a * a, h = tsqrt(hh > 0.36 ? hh : 0.36);
        slope = a / h; if (slope > 3.2) slope = 3.2;
      }
      let nx = gx * slope, ny = gy * slope;
      for (let j = 0; j < prints.length; j++) {
        const p = prints[j];
        const dx = px - p.x, dy = (py - p.y) * p.ell;
        const r2 = dx * dx + dy * dy;
        if (r2 >= p.r * p.r) continue;
        const r = tsqrt(r2) + 1e-3, fall = 1 - r / p.r;
        // a dent (normal leans toward the centre) with whorl ridges
        const k2 = (2 * p.dent) / (p.r * p.r);
        const ridge = 0.55 * 2.3 * cos(r * (p.big ? 1.9 : 2.3)) * fall;
        nx += -k2 * dx - ridge * (dx / r);
        ny += -k2 * dy - ridge * (dy / r);
      }
      const inv = 1 / tsqrt(nx * nx + ny * ny + 1);
      const ndl = (nx * L[0] + ny * L[1] + L[2]) * inv;
      let ndh = (nx * HV[0] + ny * HV[1] + HV[2]) * inv;
      ndh = ndh > 0 ? ndh : 0;
      ndh *= ndh; ndh *= ndh; ndh *= ndh; ndh *= ndh; // ^16
      // which clay: marbled streaks while it changes colour
      let base = own;
      if (marble > 0) {
        const qx = px - bx, qy = py - by;
        const a = swirl + tsqrt(qx * qx + qy * qy) * 0.07;
        const ca = cos(a), sa = sin(a);
        const v = noise2((qx * ca - qy * sa) * 0.09 + 9, (qx * sa + qy * ca) * 0.32 + 9, mseed);
        if (v < marble * 1.15) base = oth;
      }
      // wrapped diffuse: plasticine scatters light a little round its form
      const wr = (ndl + 0.35) / 1.35;
      const lit = 0.3 + 0.78 * (wr > 0 ? wr : 0);
      const sp = ndh * 0.38 * 255;
      let r = (cR(base) * lit + sp) * ex, gg = (cG(base) * lit + sp * 0.95) * ex, b = (cB(base) * lit + sp * 0.85) * ex;
      if (d > -0.5) { const k = 0.5 - d; r = cR(bg) + (r - cR(bg)) * k; gg = cG(bg) + (gg - cG(bg)) * k; b = cB(bg) + (b - cB(bg)) * k; }
      return pk(r, gg, b);
    });

    // ---- crumbs of clay on the mat, where the clay is not
    // (in the margins the sculpture never reaches; a new scatter each hour)
    for (let j = 0; j < 6; j++) {
      const a = rand(f.h, j, 31), b = rand(f.h, j, 32);
      const zone = j % 4;
      const cx = zone === 0 ? 3 + a * 8 : zone === 1 ? 149 + a * 8 : 10 + a * 140;
      const cy = zone < 2 ? 4 + b * 72 : zone === 2 ? 2.5 + b * 3 : 75 + b * 3;
      const col = CLAY[j & 1];
      g.fillCircle(cx + 0.8, cy + 0.8, 1.6, scale(SHADOW, ex), { a: 0.6 });
      g.fillCircle(cx, cy, 1.5, scale(scale(col, 0.75), ex));
      g.pixel(cx - 0.6, cy - 0.6, scale(mix(col, 0xffffff, 0.4), ex));
    }

    // ---- the thumb, in shot at the hour
    if (thumb.on) drawThumb(g, thumb, ex);
  },
};

// ---------------------------------------------------------------- the thumb

/**
 * The animator's thumb at the hour turn: comes in from the bottom right,
 * presses the ball flat, lifts away. Seconds from the minute turn `tt`.
 */
function thumbAt(f, tt) {
  const out = { on: false, press: 0, print: 0, x: 0, y: 0, ang: 0 };
  const isTurn = (f.m === 0 && tt >= 0) || (f.m === 59 && tt < 0);
  if (!isTurn) return out;
  // stop-motion time already quantised by the caller's clock (12 fps)
  const t = Math.floor(tt * FPS) / FPS;
  // the ball is flattened as the thumb lands and stays a pancake (with the
  // thumb's print in it) until it is sculpted into the new hour
  if (t > -0.1 && t < 2.6) out.press = out.print = ease.outQuad(progress(t, -0.1, 0.1));
  if (t < -0.25 || t > 1.4) return out;
  // in: -0.25..0.1, pressed: 0.1..0.6, out: 0.6..1.4
  let reach;
  if (t < 0.1) reach = ease.outQuad(progress(t, -0.25, 0.1));
  else if (t < 0.6) reach = 1;
  else reach = 1 - ease.inQuad(progress(t, 0.6, 1.4));
  out.on = reach > 0.02;
  out.reach = reach;
  out.down = t >= 0.05 && t < 0.65;
  return out;
}

function drawThumb(g, th, ex) {
  // The thumb, seen from above: a long rounded shape with a nail, coming in
  // along a diagonal from the bottom right corner.
  const r = th.reach;
  const tipX = lerp(200, 86, r), tipY = lerp(120, 44, r);
  const dirX = 0.78, dirY = 0.62; // pointing from tip toward the hand
  const len = 70, rad = th.down ? 15 : 14;
  const bx = tipX + dirX * len, by = tipY + dirY * len;
  const sh = th.down ? 3 : 9;
  const box = [Math.min(tipX, bx) - rad - 2, Math.min(tipY, by) - rad - 2, Math.abs(bx - tipX) + 2 * rad + sh + 4, Math.abs(by - tipY) + 2 * rad + sh + 4];
  const cap = (px, py, ox, oy) => {
    const dx = px - tipX - ox, dy = py - tipY - oy;
    const along = clamp(dx * dirX + dy * dirY, 0, len);
    const qx = dx - dirX * along, qy = dy - dirY * along;
    return qx * qx + qy * qy; // squared distance from the thumb's axis
  };
  const r2 = rad * rad;
  // shadow
  g.fillWhere((px, py) => cap(px, py, sh, sh) < r2, scale(SHADOW, ex), box, { a: 0.55 });
  // skin, lit across its width (a cylinder lying toward the light's left)
  g.paint((px, py) => {
    if (cap(px, py, 0, 0) > r2) return -1;
    const dx = px - tipX, dy = py - tipY;
    const side = (dx * -dirY + dy * dirX) / rad;          // -1..1 across the thumb
    const along = dx * dirX + dy * dirY;
    let lit = 0.55 + 0.45 * clamp(1 - Math.abs(side + 0.35) * 1.1, 0, 1);
    // knuckle crease
    if (Math.abs(along - 34) < 1.2 && Math.abs(side) < 0.75) lit *= 0.82;
    let c = scale(SKIN, lit);
    // the nail, near the tip, on top
    const na = along - 9, ns = side * rad;
    if (na > -3 && na < 13 && Math.abs(ns) < 8.5 - Math.max(0, -na) * 1.4) {
      c = scale(mix(NAIL, 0xffffff, ns < -3 && na > 2 ? 0.35 : 0), lit * 0.95 + 0.08);
      if (na > 10 || Math.abs(ns) > 7.4 - Math.max(0, -na) * 1.4) c = scale(SKIN, lit * 0.85);
    }
    return scale(c, ex);
  }, box);
}
