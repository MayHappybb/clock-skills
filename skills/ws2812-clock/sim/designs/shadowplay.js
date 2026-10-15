// Shadowplay (皮影戏): the two panels are the lit cloth of a Chinese shadow
// theatre, a wide screen like a real stage's. An oil lamp flickers behind it;
// dyed, carved leather puppets pressed to the cloth show as transparent colour
// with black-cut rims and pierced holes of pure lamplight.
//
// The hours are two tall jointed numeral puppets on bamboo rods. The minutes
// are smaller numeral puppets balanced on the Monkey King's golden staff,
// which he holds overhead and keeps in balance. Each minute he crouches and
// flicks the staff: the old numeral is tossed off and flies apart joint by
// joint, lifting off the cloth toward the lamp (its shadow grows, blurs, and
// fades); the new one is swung in from above, its strips snapping together
// at their joints and swinging there like pendulums. On the hour, drums: the
// lamp throbs, a dragon chases its flaming pearl across the whole stage and
// knocks the hour apart; the new hour is raised on its rods behind it.
import * as kit from '../js/kit.js';
import { W, H, N, T, clear, draw, dot, rod, LAMP_X, LAMP_Y } from './shadowplay-cloth.js';
import { puppet, ASPECT } from './shadowplay-glyphs.js';
import { monkey, STAFF_HW } from './shadowplay-monkey.js';
import { dragon } from './shadowplay-dragon.js';

const RED = [0.82, 0.07, 0.025];
const HOUR_H = 50, MIN_H = 23;
const cache = new Map();
function pup(d, big) {
  const k = d * 2 + (big ? 1 : 0);
  let p = cache.get(k);
  if (!p) {
    p = big ? puppet(d, HOUR_H, 0.078, RED, 1, 4.3, 1.15) : puppet(d, MIN_H, 0.09, RED, 1, 3.6, 0.7);
    cache.set(k, p);
  }
  return p;
}

// ------------------------------------------------------------ puppets
const PX = new Float64Array(8), PY = new Float64Array(8), PA = new Float64Array(8), SW = new Float64Array(8);
function fk(parts, rx, ry, ra) {
  for (let i = 0; i < parts.length; i++) {
    const q = parts[i];
    if (q.par < 0) { PX[i] = rx; PY[i] = ry; PA[i] = ra + SW[i]; continue; }
    const p = parts[q.par], dx = q.px - p.px, dy = q.py - p.py, a = PA[q.par];
    const c = Math.cos(a), s = Math.sin(a);
    PX[i] = PX[q.par] + c * dx - s * dy; PY[i] = PY[q.par] + s * dx + c * dy; PA[i] = a + SW[i];
  }
}
/** Joint swing: each strip a pendulum on its joint, kept going by the hand on the rod. */
function swings(parts, t, seed, amp) {
  for (let i = 0; i < parts.length; i++) {
    const w = 3.0 + 1.6 * kit.hash(seed, i);
    SW[i] = i === 0 ? 0 : amp * Math.sin(w * t + 6.28 * kit.hash(seed, i, 7));
  }
}
const rivets = (parts, z, a) => { for (let i = 1; i < parts.length; i++) dot(PX[i], PY[i], 1.2, 0.03, 0.03, 0.03, z, a); };

function restDigit(parts, rx, ry, ra, t, seed, z = 0) {
  swings(parts, t, seed, 0.02);
  fk(parts, rx, ry, ra);
  for (let i = 0; i < parts.length; i++) draw(parts[i].pc, PX[i], PY[i], PA[i], z, 1);
  rivets(parts, z, 1);
}
/** Flung off: every strip flies on its own, spinning, lifting toward the lamp. */
function leaveDigit(parts, rx, ry, ra, t, seed, tau, vx0, vy0, grav) {
  if (tau > 1.1) return;
  swings(parts, t, seed, 0.02);
  fk(parts, rx, ry, ra);
  const cx = PX[0];
  const z = Math.min(0.75, tau * 0.95) ** 1.2, al = 1 - kit.smoothstep(0.4, 1.05, tau);
  for (let i = 0; i < parts.length; i++) {
    const h1 = kit.hash(seed, i, 31), h2 = kit.hash(seed, i, 32), h3 = kit.hash(seed, i, 33);
    const vx = vx0 + (PX[i] - cx) * 1.4 + (h1 - 0.5) * 22, vy = vy0 * (0.7 + 0.6 * h2);
    const w = (h3 - 0.5) * 9 + (vx0 > 0 ? 2.5 : -2.5);
    draw(parts[i].pc, PX[i] + vx * tau, PY[i] + vy * tau + 0.5 * grav * tau * tau, PA[i] + w * tau, z, al);
  }
}
/** Swung in: strips arrive from (ox, oy) off the cloth and snap together at their joints, root first. */
const ST = 0.07;   // stagger between strips
function arriveDigit(parts, rx, ry, ra, t, seed, tau, ox, oy) {
  if (tau <= 0) return;
  const n = parts.length;
  let done = 1;
  for (let i = 0; i < n; i++) {
    const k = kit.clamp((tau - ST * i) / 0.8), after = tau - ST * i - 0.8;
    const ring = after > 0 ? 0.28 * Math.exp(-3.2 * after) * Math.sin(7.5 * after) : 0;
    SW[i] = i === 0 ? 0.6 * ring * 0.3 : (1 - kit.ease.inOut(k)) * (kit.hash(seed, i, 41) - 0.5) * 2.5 + ring + 0.02 * Math.sin(3.4 * t + i);
    if (k < 1) done = 0;
  }
  fk(parts, rx, ry, ra);
  // an exploded view: every strip pushed out from the numeral's middle, so a
  // half-built numeral never reads as another digit, and blurred until it lands
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += PX[i]; my += PY[i]; }
  mx /= n; my /= n;
  for (let i = 0; i < n; i++) {
    const k = kit.clamp((tau - ST * i) / 0.8), e = kit.ease.inOut(k), m = 1 - e;
    const h1 = kit.hash(seed, i, 51), h2 = kit.hash(seed, i, 52);
    const q = parts[i], c = Math.cos(PA[i]), s = Math.sin(PA[i]);
    const cx = PX[i] + c * (q.cx - q.px) - s * (q.cy - q.py), cy = PY[i] + s * (q.cx - q.px) + c * (q.cy - q.py);
    const dx = ox + (cx - mx) * 1.6 + (h1 - 0.5) * 10, dy = oy + (cy - my) * 1.6 - h2 * 6;
    draw(parts[i].pc, PX[i] + m * dx, PY[i] + m * dy, PA[i], 0.9 * m ** 0.8, kit.smoothstep(0, 0.35, k));
  }
  if (done || tau > 1.3) rivets(parts, 0, kit.smoothstep(1.0, 1.4, tau));
}

// ------------------------------------------------------------ the stage
const HX0 = [3, 33], HY0 = 6;              // hour puppets: glyph top-left
const MX = 96.5, FLOOR = 61.4;             // monkey: hip x, where his feet stand
const MOFS = [-8.7, 8.7];                  // minute puppets along the staff

let SX = 0, SY = 0, SA = 0, HIPX = 0, HIPY = 0, BA = 0, LOOK = 0;
const bump = (u, a, b) => (u > a && u < b ? Math.sin((Math.PI * (u - a)) / (b - a)) : 0);
/** The monkey's pose at time t, u seconds from the minute's turn. */
let HOP = 0, SHOW = false;
function pose(t, u) {
  HOP = SHOW ? 6.5 * bump(u, -2.35, -1.75) : 0;
  const sway = Math.sin(0.75 * t - 0.5);
  const crouch = 2.4 * kit.smoothstep(-1.5, -0.55, u) * (1 - kit.smoothstep(-0.42, -0.2, u));
  const thrust = bump(u, -0.44, -0.02);
  const tc = u - 1.62, cat = tc > 0 ? 2.0 * Math.exp(-3.4 * tc) * Math.sin(9 * tc) : 0;
  HIPX = MX - 0.5 * sway;
  HIPY = 49.8 + 0.35 * Math.sin(1.7 * t) + 0.9 * crouch - 1.6 * thrust + 0.6 * cat - HOP;
  BA = 0.025 * Math.sin(0.75 * t + 1) - 0.04 * thrust;
  SX = MX + 1.1 * sway;
  SY = 26.2 + 0.3 * Math.sin(1.7 * t - 0.4) + crouch - 4.2 * thrust + cat - HOP * 0.45;
  SA = 0.04 * Math.sin(0.75 * t) + 0.015 * Math.sin(2.1 * t + 1) + 0.05 * thrust * (u < 0 ? 1 : 0);
  // he watches the toss go up, then the new numeral come down
  LOOK = -0.28 * kit.smoothstep(-0.6, -0.1, u) * (1 - kit.smoothstep(1.4, 2.4, u)) + 0.03 * Math.sin(0.5 * t);
}
let RX = 0, RY = 0, RA = 0;
/** Rod point of minute puppet k riding the staff (after pose()). */
function minuteRoot(parts, k, t) {
  const gl = MOFS[k] - (ASPECT * MIN_H) / 2 + parts[0].px;
  const gy = -STAFF_HW - 0.2 - (1.012 * MIN_H - parts[0].py);
  const c = Math.cos(SA), s = Math.sin(SA);
  RA = SA + 0.03 * Math.sin(1.3 * t + k * 2.1);
  RX = SX + c * gl - s * gy; RY = SY + s * gl + c * gy;
}
function hourRoot(parts, k, t) {
  RX = HX0[k] + parts[0].px; RY = HY0 + parts[0].py + 0.45 * Math.sin(1.1 * t + k * 1.7);
  RA = 0.012 * Math.sin(1.3 * t + k * 2);
}

// the cloth: a fine weave, fixed
const WEAVE = new Float32Array(N);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
  WEAVE[y * W + x] = 1 + 0.035 * (kit.hash(x, y) - 0.5) + 0.02 * (kit.noise2(x * 0.15, y * 1.3) - 0.5);

const BEATS = [-2.8, -2.2, -1.6, -1.3, -1.0, -0.7, -0.45, -0.25, 0.7, 1.4, 1.75, 2.5];
const pad = (n) => String(n).padStart(2, '0');
const hhmm = (ms) => { const d = new Date(ms); return pad(d.getHours()) + pad(d.getMinutes()); };

export default {
  name: 'Shadowplay',
  blurb: 'Shadow-puppet theatre: carved leather numerals on rods; the Monkey King juggles the minutes, a dragon brings the hour',
  layouts: ['hub-x2'], look: { look: 'opal', gap: 1.3 }, fps: 60, brightness: 0.36, dither: true,
  frame(ctx) {
    const G = kit.grid(ctx), t = ctx.t;
    const ms = ctx.date.getTime(), now = ms / 1000, m0 = Math.floor(now / 60) * 60, sec = now - m0;
    const B = sec >= 56 ? m0 + 60 : m0, u = now - B;          // u: seconds from the nearest turn
    const prev = hhmm(B * 1000 - 500), next = hhmm(B * 1000 + 500);
    clear();

    // hours
    for (let k = 0; k < 2; k++) {
      const changed = prev[k] !== next[k];
      const a = pup(+prev[k], true), b = pup(+next[k], true);
      if (!changed) {
        const p = u < 0 ? a : b;
        hourRoot(p, k, t);
        rod(RX, RY, RX + (k ? 9 : -7), 70, 0.6, 0.3, 0, 0.5, 1);
        // now and then the hand behind eases a numeral off the cloth: its edge softens to a halo
        const lift = 0.07 * kit.smoothstep(0.55, 1, Math.sin(0.33 * t + k * 2.6));
        restDigit(p, RX, RY, RA, t, k + 1, lift);
        continue;
      }
      if (u < 0) {
        hourRoot(a, k, t); rod(RX, RY, RX + (k ? 9 : -7), 70, 0.6, 0.3, 0, 0.5, 1); restDigit(a, RX, RY, RA, t, k + 1);
      } else {
        hourRoot(a, k, t - u); leaveDigit(a, RX, RY, RA, t - u, k + 1, u, k ? 16 : -34, -44, 70);
        const ta = u - 0.22;
        hourRoot(b, k, t);
        if (ta > 0) rod(RX, RY + 40 * (1 - kit.ease.out(kit.clamp(ta / 0.8))), RX + (k ? 9 : -7), 70, 0.6, 0.3, 0, 0.5, 1);
        arriveDigit(b, RX, RY, RA, t, k + 11, ta, (k ? 8 : -8), 30);
      }
    }

    // the monkey and his minutes
    SHOW = prev[1] !== next[1];
    pose(t, u);
    const P0x = SX, P0y = SY, P0a = SA;
    for (let k = 0; k < 2; k++) {
      const changed = prev[2 + k] !== next[2 + k];
      const a = pup(+prev[2 + k], false), b = pup(+next[2 + k], false);
      if (!changed || u < -0.25) {
        const p = !changed && u >= 0 ? b : a;
        minuteRoot(p, k, t); restDigit(p, RX, RY, RA, t, k + 3);
        continue;
      }
      // tossed off at u = -0.25, frozen where the staff was then
      const tr = t - (u + 0.25);
      pose(tr, -0.25); minuteRoot(a, k, tr);
      leaveDigit(a, RX, RY, RA, tr, k + 3, u + 0.25, k ? 40 : -16, -40, 115);
      pose(t, u); minuteRoot(b, k, t);
      arriveDigit(b, RX, RY, RA, t, k + 13, u - 0.12 - 0.1 * k, k ? -16 : 14, -14);
    }
    SX = P0x; SY = P0y; SA = P0a;
    const hourShow = prev[1] !== next[1];
    if (hourShow && u > -3.2 && u < 3.6) dragon(u, t);
    monkey(HIPX, HIPY, BA, SX, SY, SA, LOOK, t, MX - 0.5, FLOOR - HOP, 1);

    // the lamp behind the cloth
    const out = ctx.out, idx = G.idx;
    const fl = 1 + 0.03 * Math.sin(t * 45.9) + 0.02 * Math.sin(t * 69.7 + 1) + 0.06 * (kit.noise2(t * 2.3, 0.5) - 0.5) + 0.03 * Math.sin(t * 1.2);
    const lx = LAMP_X + 2.5 * Math.sin(t * 0.9), ly = LAMP_Y + 1.5 * Math.sin(t * 1.4);
    let drum = 0;
    if (hourShow) {
      // gong-and-drum: a roll building to the crash at the turn, the lamp throbbing with it
      for (const b of BEATS) if (u > b) drum += 0.14 * Math.exp(-(u - b) * 9);
      if (u > 0) drum += 0.32 * Math.exp(-u * 2.2);
    }
    const lev = (1 + drum) * fl * (1 - 0.6 * ctx.night);
    for (let y = 0; y < H; y++) {
      const ey = Math.min(y + 0.5, H - 0.5 - y), fy = kit.smoothstep(0, 5, ey);
      for (let x = 0; x < W; x++) {
        const dx = (x - lx) / 100, dy = (y - ly) / 60;
        const ex = Math.min(x + 0.5, W - 0.5 - x);
        let v = lev / (1 + dx * dx + dy * dy) ** 1.6 * fy * kit.smoothstep(0, 7, ex);
        const p = y * W + x, i = idx[p];
        v *= WEAVE[p];
        out[3 * i] = v * T[3 * p];
        out[3 * i + 1] = v ** 1.1 * 0.72 * T[3 * p + 1];
        out[3 * i + 2] = v ** 1.35 * 0.38 * T[3 * p + 2];
      }
    }
  },
};
