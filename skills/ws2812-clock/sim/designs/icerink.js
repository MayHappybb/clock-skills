// Ice rink at night, seen from above: the 128x64 board IS the rink (2:1,
// rounded boards with ads, centre ice). The time is carved into black
// mirror ice as skate grooves in an ice-script hand. Public skaters circle
// counter-clockwise with scarves and breath puffs, leaving faint scratches;
// snow falls and settles; floodlight reflections sway. Each minute a
// resurfacer (Zamboni, amber beacon turning) drives over the changing
// digit, its blade wiping the groove to steaming wet black, and a figure
// skater glides in behind it and carves the new numeral in one performance:
// edges throw spray at the corners, the 4 is finished with a jump, the end
// is a spin. On the hour the floods drop, spotlights follow a four-skater
// show, a convoy of resurfacers wipes the whole sheet and it is carved again.
import * as kit from '../js/kit.js';
import { buildDigit, pathAt } from './icerink-glyphs.js';
import * as R from './icerink-draw.js';

const W = 128, H = 64;
const DW = 21, DH = 36, SL = 4, DY = 14;            // digit box, slant, top row
const SLOT_CX = [19, 46, 82, 109];                  // centre of each digit box
const SLOT_OX = SLOT_CX.map((c) => Math.round(c - (DW + SL) / 2));
const ZV = 48, ZL = 22, Z0 = -1.15;                 // resurfacer speed px/s, length, nose at top when a = Z0
const ENTER = -0.55;                                // carver glides in from the top
const SPIN = 0.75, EXIT = 1.1, SK = 1.0;      // spin and exit times, skater scale

let GLY = null;
function glyphs() {
  if (GLY) return GLY;
  GLY = [];
  for (let d = 0; d < 10; d++) {
    const g = buildDigit(d, DW, DH, SL, 2.2);
    // static groove light per cell: two cut rims (one catching the floods),
    // a faint snow-filled floor, and shavings thrown out along the edges
    const c = g.cells, I = new Float32Array(c.n), tw = new Float32Array(c.n);
    for (let k = 0; k < c.n; k++) {
      const dd = c.d[k], side = -(c.nx[k] * 0.6 + c.ny[k] * 0.8);
      const rim = Math.exp(-(((dd - 0.95) / 0.42) ** 2)) * (0.45 + 0.55 * side);
      const floor = 0.16 * Math.exp(-((dd / 0.5) ** 2));
      const h = kit.hash(d * 7919 + k, 17);
      const fleck = dd > 1.5 && h > 0.9 ? 0.25 * (h - 0.9) / 0.1 : 0;
      I[k] = Math.min(1, rim + floor + fleck);
      tw[k] = kit.hash(d * 131 + k, 5);
    }
    g.I = I; g.tw = tw;
    g.air0 = -1; g.air1 = -1;
    for (let k = 0; k < g.N; k++) if (g.path[3 * k + 2]) { if (g.air0 < 0) g.air0 = k * 0.25; g.air1 = k * 0.25; }
    g.D = kit.clamp(g.L / 58, 1.3, 2.4);
    GLY.push(g);
  }
  return GLY;
}

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (sec) => { const d = new Date(sec * 1000); return pad(d.getHours()) + pad(d.getMinutes()); };

/** Carve progress (0..1 of the path) at x (0..1 of the carve time). */
const carveE = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 0.55 * x + 0.45 * x * x * (3 - 2 * x));
function carveInv(f) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (carveE(m) < f) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/** The turn nearest now: a = seconds since it (negative just before). */
function turnOf(now) {
  const M = Math.floor(now / 60) * 60;
  const T = now - M > 60 - 1.6 ? M + 60 : M;
  const prev = hhmm(T - 60), next = hhmm(T);
  let k = 0;
  while (k < 4 && prev[k] === next[k]) k++;
  const hour = next.slice(2) === '00';
  return { T, a: now - T, prev, next, first: hour ? 0 : k, hour };
}

// -------------------------------------------------------------- carvers
const CARVER_STYLE = [R.STYLE.rose, R.STYLE.teal, R.STYLE.gold, R.STYLE.violet];

/** Where the carver of a slot is at turn time a; false if off the ice. */
function carverPose(g, slot, a, o) {
  const ox = SLOT_OX[slot], p = R.tmp;
  if (a < ENTER) return false;
  if (a < 0) {
    pathAt(g, 0, p);
    const k = (a - ENTER) / -ENTER, sx = p.x + ox, sy = p.y + DY;
    o.x = kit.lerp(sx - 2, sx, k); o.y = kit.lerp(-8, sy, k);
    o.h = Math.atan2(sy + 8, 2) * (1 - k) + p.h * k; o.mode = 1; o.k = SK; o.ph = a * 6; o.spin = 0; o.lift = 0;
    return true;
  }
  if (a < g.D) {
    const s = g.L * carveE(a / g.D);
    pathAt(g, s, p);
    o.x = p.x + ox; o.y = p.y + DY; o.h = p.h; o.mode = 1; o.k = SK; o.ph = s * 0.35; o.spin = 0; o.lift = 0;
    if (p.air) {
      const f = kit.clamp((s - g.air0) / (g.air1 - g.air0 + 1e-6));
      o.lift = 8 * Math.sin(Math.PI * f); o.spin = kit.TAU * 2 * kit.ease.inOut(f); o.mode = 2;
    }
    return true;
  }
  pathAt(g, g.L, p);
  const ex = p.x + ox, ey = p.y + DY;
  const b = a - g.D;
  if (b < SPIN) {
    o.x = ex; o.y = ey; o.h = p.h; o.spin = kit.TAU * 3 * kit.ease.out(b / SPIN); o.lift = 0; o.mode = 2; o.k = SK; o.ph = 0;
    return true;
  }
  const c = (b - SPIN) / EXIT;
  if (c >= 1) return false;
  const tx = ex + (slot < 2 ? -4 : 4), ty = 74, e = c * c;
  o.x = kit.lerp(ex, tx, e); o.y = kit.lerp(ey, ty, e); o.h = Math.atan2(ty - ey, tx - ex); o.mode = 1; o.k = SK; o.ph = c * 8; o.spin = 0; o.lift = 0;
  return true;
}

// ---------------------------------------------------------- the rink
const ICE = [0.74, 0.88, 1.0], FLOOD = [0.8, 0.9, 1.0], WHITE = [1, 1, 1], STEAM = [0.9, 0.9, 0.85];
const AD = [[0.3, 0.015, 0.0], [0.0, 0.05, 0.32], [0.26, 0.15, 0.0], [0.0, 0.18, 0.04], [0.16, 0.16, 0.16], [0.22, 0.0, 0.12]];
const SPOT = [[1, 0.25, 0.55], [0.2, 0.9, 1], [1, 0.75, 0.25], [0.6, 0.35, 1]];
let BASE = null, ADS = null, SCR = null, COL = null;
/** Signed distance to the rink's rounded outline (negative inside). */
function rinkSD(x, y) {
  const rr = 12, qx = Math.abs(x - 63.5) - 63.5 + rr, qy = Math.abs(y - 31.5) - 31.5 + rr;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr;
}
function base() {
  if (BASE) return;
  BASE = new Float32Array(3 * W * H);
  ADS = new Int8Array(W * H).fill(-2);
  COL = new Int8Array(W * H).fill(-1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let best = 16, bj = -1;
    for (let j = 0; j < 4; j++) { const d = Math.abs(x - SLOT_CX[j]); if (d <= 15 && d < best) { best = d; bj = j; } }
    COL[y * W + x] = bj;
  }
  // an evening's worth of old skate scratches: long faint arcs, mostly along the loop
  SCR = new Float32Array(W * H);
  for (let n = 0; n < 80; n++) {
    const h = (k) => kit.hash(n, k, 41);
    const cx = 64 + (h(1) - 0.5) * 60, cy = 32 + (h(2) - 0.5) * 30, rad = 14 + 60 * h(3);
    const th0 = h(4) * kit.TAU, len = (10 + 30 * h(5)) / rad, amp = 0.006 + 0.012 * h(6);
    for (let q = 0; q < len * rad * 2; q++) {
      const th = th0 + (q / (len * rad * 2)) * len, x = cx + rad * Math.cos(th), y = cy + rad * 0.55 * Math.sin(th);
      const xi = Math.round(x), yi = Math.round(y);
      if (xi < 0 || yi < 0 || xi >= W || yi >= H || rinkSD(xi, yi) > -3) continue;
      SCR[yi * W + xi] = Math.min(0.009, SCR[yi * W + xi] + amp * 0.3);
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x, sd = rinkSD(x, y), o = 3 * p;
    if (sd > -0.5) {                                   // snow banked outside the corners
      const n = kit.noise2(x * 0.5, y * 0.5);
      BASE[o] = BASE[o + 1] = 0.035 + 0.04 * n; BASE[o + 2] = BASE[o + 1] * 1.08;
    } else if (sd > -2.5) {                            // the boards, with ads
      const u = (Math.atan2((y - 31.5) * 2, x - 63.5) / kit.TAU + 1) * 22, i = Math.floor(u);
      const outer = sd > -1.5;
      if (kit.fract(u) < 0.14 || (i % 4 === 3)) {
        const v = outer ? 0.13 : 0.05;
        BASE[o] = v; BASE[o + 1] = v; BASE[o + 2] = v * 1.05;
      } else {
        ADS[p] = i % AD.length;
        const c = AD[i % AD.length], lettering = !outer && kit.hash(x, y, 3) > 0.55 ? 1.7 : 1;
        BASE[o] = c[0] * lettering; BASE[o + 1] = c[1] * lettering; BASE[o + 2] = c[2] * lettering;
      }
    } else {                                           // markings painted under the ice
      if (x === 63 || x === 64) BASE[o] = 0.022;
      const dc = Math.hypot(x - 63.5, y - 31.5);
      if (Math.abs(dc - 8) < 0.6) { BASE[o + 2] = 0.03; BASE[o + 1] = 0.004; }
      if (dc < 1.3) BASE[o] = 0.05;
    }
  }
}

const lanePer = (o) => 4 * (45 + o) + 4 * (10 + o) + 2 * Math.PI * 12;
/** A lane of the public skaters' loop: rounded rectangle, counter-clockwise from above. */
function lane(o, s, out) {
  const hx = 57 + o, hy = 22 + o, rc = 12, sx = hx - rc, sy = hy - rc, CY = 39;
  const Lq = rc * Math.PI / 2, P = 4 * sx + 4 * sy + 4 * Lq;
  s = ((s % P) + P) % P;
  out.c = 0;
  const arc = (cx, cy, th0, d) => { const th = th0 - d / rc; out.x = cx + rc * Math.cos(th); out.y = cy + rc * Math.sin(th); out.h = Math.atan2(-Math.cos(th), Math.sin(th)); out.c = 1; };
  if (s < sx) { out.x = 64 - s; out.y = CY - hy; out.h = Math.PI; return out; } s -= sx;
  if (s < Lq) { arc(64 - sx, CY - sy, -Math.PI / 2, s); return out; } s -= Lq;
  if (s < 2 * sy) { out.x = 64 - hx; out.y = CY - sy + s; out.h = Math.PI / 2; return out; } s -= 2 * sy;
  if (s < Lq) { arc(64 - sx, CY + sy, Math.PI, s); return out; } s -= Lq;
  if (s < 2 * sx) { out.x = 64 - sx + s; out.y = CY + hy; out.h = 0; return out; } s -= 2 * sx;
  if (s < Lq) { arc(64 + sx, CY + sy, Math.PI / 2, s); return out; } s -= Lq;
  if (s < 2 * sy) { out.x = 64 + hx; out.y = CY + sy - s; out.h = -Math.PI / 2; return out; } s -= 2 * sy;
  if (s < Lq) { arc(64 + sx, CY - sy, 0, s); return out; } s -= Lq;
  out.x = 64 + sx - s; out.y = CY - hy; out.h = Math.PI; return out;
}

const CROWD = [
  { o: 0, v: 23, ph: 0.0, st: R.STYLE.red },
  { o: -1, v: 22.2, ph: 0.34, st: R.STYLE.green },
  { o: -2, v: 23.6, ph: 0.68, st: R.STYLE.amber },
];
const lanePt = { x: 0, y: 0, h: 0, c: 0 };
/** Is (x, y) in the way of a resurfacer at turn time a? */
function inZamboni(turn, a, x, y, m) {
  const nose = -2 + ZV * (a - Z0), rear = nose - ZL;
  if (nose < -2 - m || rear > 66 + m) return false;
  if (y < rear - m || y > nose + m + 2) return false;
  for (let j = turn.first; j < 4; j++) if (Math.abs(x - SLOT_CX[j]) < 15 + m) return true;
  return false;
}
/**
 * Arc length of a public skater along its lane at time now. Free skating is
 * closed form; around a turn they brake for the resurfacer and then catch
 * up, integrated from 1.6 s before the turn (deterministic, pure).
 */
const crowdOut = { s: 0, v: 0 };
function crowdS(c, now, turn) {
  const per = lanePer(c.o), off = c.ph * per, vf = 23 * per / 300;
  crowdOut.v = vf;
  const freeAt = (t) => kit.fract((23 * t) / 300 + c.ph) * per;
  if (turn.a < -1.6 || turn.a > 12) { crowdOut.s = freeAt(now); return crowdOut; }
  const t0 = turn.T - 1.6, fs0 = freeAt(t0);
  const free = (t) => fs0 + vf * (t - t0);
  void off;
  let s = fs0, v = vf;
  const dt = 1 / 60, n = Math.floor((now - t0) / dt);
  for (let i = 0; i <= n; i++) {
    const tau = t0 + i * dt, step = i < n ? dt : now - t0 - n * dt, aa = tau - turn.T, f = free(tau);
    lane(c.o, s, lanePt); const hereX = lanePt.x, hereY = lanePt.y;
    lane(c.o, s + 7, lanePt);
    const blocked = inZamboni(turn, aa, lanePt.x, lanePt.y, 4) && !inZamboni(turn, aa, hereX, hereY, 3);
    const inside = inZamboni(turn, aa, hereX, hereY, 3);
    let target = blocked ? 0 : inside ? vf * 1.6 : vf * (1 + 0.6 * kit.clamp((f - s) / 10));
    if (f - s < 0.05 && !blocked && !inside) target = vf;
    v += kit.clamp(target - v, -150 * dt, 90 * dt);
    s += v * step;
    if (s > f) s = f;
  }
  crowdOut.s = s; crowdOut.v = v;
  return crowdOut;
}

// ------------------------------------------------------------- the frame
const REFL = new Float32Array(W * H), SPOTS = new Float32Array(W * H), SPOTC = new Float32Array(3 * W * H);
const AGE = [0, 1, 2, 3].map(() => new Float32Array(H));
const pose = { x: 0, y: 0, h: 0, mode: 0, k: 1, ph: 0, spin: 0, lift: 0 };
const BLOBS = [[4.5, 30, 1], [123, 36, 2], [60, 8.5, 2], [68, 56.5, 1]];

function reflections(now, Fl, Fr) {
  REFL.fill(0);
  for (let b = 0; b < BLOBS.length; b++) {
    const [bx0, by0, bank] = BLOBS[b], F = bank === 1 ? Fl : Fr;
    if (F <= 0.01) continue;
    const bx = bx0 + 3 * Math.sin(now * 0.23 + b * 2.1), by = by0 + 1.6 * Math.sin(now * 0.31 + b);
    const rx = 15, ry = 8, amp = 0.014 * F;
    for (let y = Math.max(0, Math.ceil(by - ry)); y <= Math.min(H - 1, by + ry); y++) {
      const dy = (y - by) / ry;
      for (let x = Math.max(0, Math.ceil(bx - rx)); x <= Math.min(W - 1, bx + rx); x++) {
        const dx = (x - bx) / rx, d2 = dx * dx + dy * dy;
        if (d2 < 1) REFL[y * W + x] += amp * (1 - d2) * (1 - d2);
      }
    }
  }
}

function frame(ctx) {
  base();
  const G = glyphs(), img = R.img, now = ctx.date.getTime() / 1000, t = now % 3600;
  const turn = turnOf(now), a = turn.a;
  const inTurn = a > -1.6 && a < 12, show = turn.hour && a > -1.6 && a < 8;
  const dim = 1 - 0.55 * ctx.night;
  // floods: dropped for the hour show, the two banks come back one by one
  let Fl = 1, Fr = 1;
  if (show) {
    const down = kit.smoothstep(-1.6, -0.9, a);
    const fl = kit.hash(Math.floor(now * 18), 7) > 0.35 ? 1 : 0.35;
    const upL = kit.smoothstep(5.6, 6.2, a), upR = kit.smoothstep(6.1, 6.7, a);
    Fl = 1 - 0.8 * down + 0.8 * upL * (upL < 1 ? fl : 1);
    Fr = 1 - 0.8 * down + 0.8 * upR * (upR < 1 ? fl : 1);
  }
  reflections(now, Fl, Fr);
  const F = (Fl + Fr) / 2;
  const rear = -2 - ZL + ZV * (a - Z0);              // blade row of every resurfacer this turn

  // spotlights follow the show skaters
  if (show) {
    SPOTS.fill(0); SPOTC.fill(0);
    for (let j = 0; j < 4; j++) {
      const g = G[+turn.next[j]];
      let sx, sy, amt = kit.smoothstep(-1.4, -0.8, a) * (1 - kit.smoothstep(5.4, 6.4, a));
      if (carverPose(g, j, a, pose)) { sx = pose.x; sy = pose.y; }
      else if (a < ENTER) { pathAt(g, 0, R.tmp); const k = kit.smoothstep(-1.5, ENTER, a); sx = kit.lerp(64, SLOT_OX[j] + R.tmp.x, k); sy = kit.lerp(32, -6, k); }
      else { pathAt(g, g.L, R.tmp); sx = SLOT_OX[j] + R.tmp.x; sy = DY + R.tmp.y; }
      const c = SPOT[j], rad = 12;
      for (let y = Math.max(0, Math.ceil(sy - rad)); y <= Math.min(H - 1, sy + rad); y++) {
        for (let x = Math.max(0, Math.ceil(sx - rad)); x <= Math.min(W - 1, sx + rad); x++) {
          const d = Math.hypot(x - sx, y - sy) / rad;
          if (d >= 1) continue;
          const f = amt * kit.smoothstep(1, 0.8, d) * (0.7 + 0.3 * (1 - d)), p = y * W + x;
          SPOTS[p] += f; SPOTC[3 * p] += c[0] * f; SPOTC[3 * p + 1] += c[1] * f; SPOTC[3 * p + 2] += c[2] * f;
          img[3 * p] += c[0] * f * 0.07; img[3 * p + 1] += c[1] * f * 0.07; img[3 * p + 2] += c[2] * f * 0.07;
        }
      }
    }
  }

  // ice: reflections (sharper and stronger on the fresh wet strip), the old
  // scratches (wiped by each pass, growing back as people skate), boards
  for (let j = 0; j < 4; j++) {
    const per = j === 3 ? 60 : j === 2 ? 600 : 3600, Tw = Math.floor(now / per) * per, A = AGE[j];
    for (let y = 0; y < H; y++) {
      const dy = Z0 + (y + 24) / ZV;
      A[y] = now >= Tw + per + dy ? now - (Tw + per + dy) : now >= Tw + dy ? now - (Tw + dy) : now - (Tw - per + dy);
    }
  }
  for (let p = 0, y = 0; y < H; y++) {
    for (let x = 0; x < W; x++, p++) {
      let r = REFL[p], sc = SCR[p];
      const j = COL[p];
      if (j >= 0) {
        const age = AGE[j][y], wet = age < 7 ? 1 - age / 7 : 0;
        r = r * (1 + 4 * wet) + wet * wet * (0.004 + 0.02 * Math.max(0, Math.sin(x * 0.35 + y * 0.9 - now * 2.5)) ** 6);
        sc *= age < 50 ? age / 50 : 1;
      }
      const o = 3 * p, lit = ADS[p] >= 0 ? (show ? 0.6 + 1.6 * Math.max(0, Math.cos(ADS[p] * 1.7 + x * 0.05 - now * 7)) ** 4 : 1) : 0.35 + 0.65 * F;
      sc *= 0.4 + 0.6 * F + 30 * REFL[p];
      img[o] += BASE[o] * lit + r * FLOOD[0] + sc * ICE[0];
      img[o + 1] += BASE[o + 1] * lit + r * FLOOD[1] + sc * ICE[1];
      img[o + 2] += BASE[o + 2] * lit + r * FLOOD[2] + sc * ICE[2];
    }
  }

  // the floodlamps themselves, mirrored crisp in the black ice
  for (let b = 0; b < BLOBS.length; b++) {
    const [bx0, by0, bank] = BLOBS[b], Fb = bank === 1 ? Fl : Fr;
    const bx = bx0 + 1.2 * Math.sin(now * 0.23 + b * 2.1), by = by0 + 0.8 * Math.sin(now * 0.31 + b);
    const tw = 0.85 + 0.15 * Math.sin(now * 3.1 + b * 1.7);
    R.splat(bx, by, 1.5, FLOOD, 0.7 * Fb * tw);
    R.splat(bx, by + 2, 1.4, FLOOD, 0.12 * Fb * tw); R.splat(bx, by - 2, 1.4, FLOOD, 0.12 * Fb * tw);
    R.splat(bx + 2, by, 1.2, FLOOD, 0.06 * Fb * tw); R.splat(bx - 2, by, 1.2, FLOOD, 0.06 * Fb * tw);
  }

  // public skaters' fresh scratches behind them
  const crowd = CROWD.map((c) => { const q = crowdS(c, now, turn); return { c, s: q.s, v: q.v }; });
  for (const { c, s } of crowd) {
    for (let k = 1; k <= 30; k++) {
      const ds = k * 1.7, ss = s - ds;
      lane(c.o, ss, lanePt);
      const st = Math.abs(Math.sin(ss * 0.22)), nx = -Math.sin(lanePt.h), ny = Math.cos(lanePt.h);
      const a0 = 0.03 * (1 - k / 31);
      R.splat(lanePt.x + nx * (1.5 + 1.6 * st), lanePt.y + ny * (1.5 + 1.6 * st), 1.1, ICE, a0);
      R.splat(lanePt.x - nx * (1.5 + 1.6 * (1 - st)), lanePt.y - ny * (1.5 + 1.6 * (1 - st)), 1.1, ICE, a0);
    }
  }

  // settled snow (falling flakes are drawn last, above everything)
  const FLAKES = 34;
  for (let j = 0; j < FLAKES; j++) {
    const per = 9 + 6 * kit.hash(j, 1), tt = now + per * kit.hash(j, 2), cyc = Math.floor(tt / per), tau = tt - cyc * per;
    if (tau < 2.6) continue;
    const x0 = 4 + 120 * kit.hash(j, cyc, 3), y0 = 4 + 56 * kit.hash(j, cyc, 4);
    const lx = x0 - 2.6 * 5, ly = y0 + 2.6 * 2;
    R.splat(lx, ly, 1.2, WHITE, 0.045 * (1 - kit.smoothstep(per - 3, per, tau)) * (0.5 + 0.5 * F));
  }

  // the carved time
  const show4 = turn.hour;
  for (let j = 0; j < 4; j++) {
    const ox = SLOT_OX[j], changed = inTurn && j >= turn.first;
    for (let pass = 0; pass < (changed ? 2 : 1); pass++) {
      const isNew = !changed || pass === 1;
      const g = G[+(isNew ? turn.next[j] : turn.prev[j])], c = g.cells;
      let sk = g.L, fresh = 0;
      // the floods' glint runs along the cut edge, as light catches a groove you walk past
      const sg = ((now * 21 + j * 37) % (g.L + 70)) - 35;
      if (changed && isNew) {
        if (a <= 0) continue;
        sk = g.L * carveE(a / g.D);
        fresh = a < g.D ? 1 : kit.clamp(1 - (a - g.D) / 0.8);
      }
      for (let k = 0; k < c.n; k++) {
        const x = ox + c.x[k], y = DY + c.y[k];
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        let vis = 1;
        if (changed) {
          if (isNew) vis = kit.clamp((sk - c.s[k]) / 1.2 + 0.5) * kit.clamp(rear - y + 0.5);
          else vis = kit.clamp(y - rear + 0.5);
          if (vis <= 0) continue;
        }
        const p = y * W + x;
        const tw = g.tw[k], glint = Math.sin(now * (1.1 + tw) * 2.3 + tw * 60);
        const light = (0.5 + 0.5 * F) + 14 * REFL[p] + (glint > 0.97 ? 1.2 * (glint - 0.97) / 0.03 : 0);
        const q = (c.s[k] - sg) * 0.2, run = q > -2.5 && q < 2.5 ? (1 - q * q * 0.16) ** 2 : 0;
        const v = g.I[k] * (light + 0.9 * run * (0.4 + 0.6 * F)) * vis;
        const fr = fresh > 0 ? fresh * Math.exp(-Math.max(0, sk - c.s[k]) / 9) * vis * Math.exp(-((c.d[k] / 1.6) ** 2)) : 0;
        let c0 = ICE[0] * v + fr, c1 = ICE[1] * v + fr, c2 = ICE[2] * v + fr;
        if (show && SPOTS[p] > 0) { const q = g.I[k] * vis * 1.3; c0 += SPOTC[3 * p] * q; c1 += SPOTC[3 * p + 1] * q; c2 += SPOTC[3 * p + 2] * q; }
        img[3 * p] += c0; img[3 * p + 1] += c1; img[3 * p + 2] += c2;
      }
    }
  }
  // colon: two spin marks at centre ice
  for (let i = 0; i < 2; i++) {
    const cy = 25 + 14 * i, gl = 0.32 + 0.1 * Math.sin(now * 1.7 + i * 2);
    R.splat(63.5, cy, 2.4, ICE, gl * (0.5 + 0.5 * F));
  }

  // spray from the carvers' edges, the jump landing and the closing spin;
  // it settles as little fans of snow that stay until the next pass
  for (let j = 0; j < 4; j++) {
    const changed = inTurn && j >= turn.first;
    for (let pass = 0; pass < (changed ? 2 : 1); pass++) {
      const isNew = !changed || pass === 1;
      if (changed && isNew && a <= 0) continue;
      const d = +(isNew ? turn.next[j] : turn.prev[j]), g = G[d], ox = SLOT_OX[j];
      const pts = g.sprays.length + 1;
      for (let q = 0; q < pts; q++) {
        let sx, sy, ax = 0, ay = 0, ts;
        if (q < g.sprays.length) { const sp = g.sprays[q]; sx = sp.x; sy = sp.y; ax = sp.ax; ay = sp.ay; ts = g.D * carveInv(sp.s / g.L); }
        else { pathAt(g, g.L, R.tmp); sx = R.tmp.x; sy = R.tmp.y; ts = g.D; }
        const age = changed && isNew ? a - ts : 99;
        if (age < 0) continue;
        if (changed && !isNew && DY + sy < rear + 2) continue;
        const radial = ax === 0 && ay === 0, base0 = Math.atan2(ay, ax), nF = radial ? 12 : 9;
        for (let f = 0; f < nF; f++) {
          const h1 = kit.hash(d * 31 + q, f, 11), h2 = kit.hash(d * 31 + q, f, 12);
          const ang = radial ? (f / nF) * kit.TAU + h1 : base0 + (h1 - 0.5) * 2.2;
          const dist = (radial ? 2.5 + 2.5 * h2 : 2 + 4.5 * h2) * (1 - Math.exp(-age * 5));
          const px = ox + sx + Math.cos(ang) * dist, py = DY + sy + Math.sin(ang) * dist;
          const fly = age < 0.9 ? 0.6 * (1 - age / 0.9) ** 2 : 0;
          R.splat(px, py, age < 0.4 ? 1.3 : 1.0, WHITE, (fly + (radial ? 0.03 : 0.05)) * (0.5 + 0.5 * F));
        }
      }
    }
  }

  // public skaters, with breath clouds
  for (const { c, s, v } of crowd) {
    lane(c.o, s, lanePt);
    const x = lanePt.x, y = lanePt.y, h = lanePt.h;
    R.skater(x, y, h, 0, SK, s * 0.3, c.st, now);
    const bp = 2.6, bt = (now + c.ph * 7) % bp;
    if (bt < 1.5) {
      const back = Math.min(v, c.v) * bt * 0.8;
      const fc = Math.cos(h) >= 0 ? 1 : -1;
      R.splat(x + fc * (4.5 - back), y - 12 * SK - 1.5 * bt, 1 + 2.2 * bt, WHITE, 0.08 * (1 - bt / 1.5) * (1 - bt / 1.5));
    }
  }
  // the carvers
  if (inTurn) {
    for (let j = turn.first; j < 4; j++) {
      const g = G[+turn.next[j]];
      if (carverPose(g, j, a, pose)) R.skater(pose.x, pose.y, pose.h, pose.mode, pose.k, pose.ph, CARVER_STYLE[show4 ? j : 0], now, pose.spin, pose.lift);
    }
  }
  // resurfacers, then their steam
  if (inTurn) {
    const nose = rear + ZL;
    if (nose > -3 && rear < 66) {
      for (let j = turn.first; j < 4; j++) R.zamboni(SLOT_CX[j], nose + (j % 2) * 3, now * 7 + j * 2, 1);
    }
    for (let j = turn.first; j < 4; j++) {
      for (let q = 0; q < 26; q++) {
        const tb = Z0 + 0.5 + q * 0.07, age = a - tb;
        if (age < 0 || age > 1.6) continue;
        const ry = -2 - ZL + ZV * (tb - Z0);
        if (ry < 1 || ry > 62) continue;
        const px = SLOT_CX[j] + (kit.hash(q, j, 21) - 0.5) * 26 + 4 * age, py = ry - 1 - 2 * age;
        R.splat(px, py, 1.2 + 2.8 * age, STEAM, 0.07 * (1 - age / 1.6) * (1 - age / 1.6));
      }
    }
  }
  // falling snow
  for (let j = 0; j < FLAKES; j++) {
    const per = 9 + 6 * kit.hash(j, 1), tt = now + per * kit.hash(j, 2), cyc = Math.floor(tt / per), tau = tt - cyc * per;
    if (tau >= 2.6) continue;
    const x0 = 4 + 120 * kit.hash(j, cyc, 3), y0 = 4 + 56 * kit.hash(j, cyc, 4);
    const w = Math.sin(tau * 2.4 + j);
    const fx = x0 - tau * 5 + 1.2 * w, fy = y0 + tau * 2;
    const nearer = 1 - tau / 2.6;                       // falling away from us: shrinks as it lands
    R.splat(fx, fy, 1.0 + 1.4 * nearer, WHITE, 0.09 * kit.smoothstep(0, 0.4, tau) + 0.01);
  }

  // out, dimmed for the night
  const o = ctx.out, idx = ctx.layout.grid.idx;
  for (let p = 0; p < idx.length; p++) {
    const i = idx[p];
    if (i < 0) continue;
    o[3 * i] = img[3 * p] * dim; o[3 * i + 1] = img[3 * p + 1] * dim; o[3 * i + 2] = img[3 * p + 2] * dim;
  }
  img.fill(0);
}

export default {
  name: 'Ice Rink',
  blurb: 'the time is carved in black mirror ice; a resurfacer wipes each minute and a figure skater carves the next',
  layouts: ['hub-x2'], look: 'smoke', fps: 60, brightness: 0.35, dither: true,
  frame,
};
