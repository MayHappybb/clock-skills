// Platformer: the L of three HUB75 panels is one side-view level, and the
// time is its plumbing. Hours are two tall warp pipes bent into numerals that
// make the tower; minutes are two squat ones along the run. The owner's
// rainbow frog in round glasses speedruns the level all day: hops the minute
// pipes, rides a spring up the shaft, bonks the ? block at the top of the
// tower, wall-slides back down and dives through the warp pipe. Each minute
// it ground-pounds the changing digit: the pipe is slurped back into the
// ground and the new numeral sprouts out of it, lip first. On the hour it
// pounds the tower itself, then bounces on the spring under a fireworks
// count of the hour.
import * as kit from '../js/kit.js';
import { glyph, fronts, lipPixels, shade } from './platformer-glyphs.js';
import { drawFrog } from './platformer-frog.js';
import { Route, poundAndRecoil, SPRING, PIPE, QBLOCK, COINS, T_POUND_M, T_POUND_H } from './platformer-route.js';

const N = 128;
const img = new Float32Array(N * N * 3);
const GROUND = 118;
const SLOTS = [
  { x: 1, y: GROUND - 72, size: 'hour' },
  { x: 27, y: GROUND - 72, size: 'hour' },
  { x: 66, y: GROUND - 40, size: 'min' },
  { x: 92, y: GROUND - 40, size: 'min' },
];
const PIPE_C = kit.hex('#3cc845');
const pad = (n) => String(n).padStart(2, '0');
// build every pipe numeral up front, so no frame pays for it
for (const ch of '0123456789') { glyph(ch, 'hour', PIPE_C); glyph(ch, 'min', PIPE_C); }
const digitsAt = (sec) => { const d = new Date(sec * 1000); return pad(d.getHours()) + pad(d.getMinutes()); };

// ------------------------------------------------------------- drawing
function put(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= N || y >= N || a <= 0) return;
  const o = 3 * (y * N + x);
  img[o] += (r - img[o]) * a; img[o + 1] += (g - img[o + 1]) * a; img[o + 2] += (b - img[o + 2]) * a;
}
function addp(x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= N || y >= N) return;
  const o = 3 * (y * N + x);
  img[o] += r; img[o + 1] += g; img[o + 2] += b;
}
/** A soft dot at sub-pixel (x, y), radius rad, added light. */
function glow(x, y, rad, c, a) {
  const r2 = rad * rad;
  for (let py = Math.floor(y - rad); py <= Math.ceil(y + rad); py++) {
    for (let px = Math.floor(x - rad); px <= Math.ceil(x + rad); px++) {
      const dx = px + 0.5 - x, dy = py + 0.5 - y, d2 = dx * dx + dy * dy;
      if (d2 >= r2) continue;
      const f = (1 - d2 / r2) ** 2 * a;
      addp(px, py, c[0] * f, c[1] * f, c[2] * f);
    }
  }
}

function drawGlyph(G, ox, oy, thr = 1e9, wob = 0) {
  const { px, py, cov, col, g } = G;
  for (let i = 0; i < px.length; i++) {
    if (g[i] > thr) continue;
    const y = oy + py[i];
    if (y >= GROUND) continue;
    put(ox + px[i], y, col[3 * i], col[3 * i + 1], col[3 * i + 2], cov[i]);
  }
  if (wob !== 0) {
    // the lips spring when the pipe finishes growing
    const S2 = { r: G.S.r, lipW: G.S.lipW * (1 + wob), lipL: G.S.lipL * (1 + 0.6 * wob) };
    for (const L of G.lipList) for (const e of lipPixels(ox + L.x, oy + L.y, L.dx, L.dy, S2, PIPE_C)) if (e.y < GROUND) put(e.x, e.y, e.r, e.gr, e.b, e.c);
  } else for (const e of G.lips) {
    if (e.g > thr) continue;
    const y = oy + e.y;
    if (y >= GROUND) continue;
    put(ox + e.x, y, e.r, e.gr, e.b, e.c);
  }
  if (thr < G.gmax) {
    for (const f of fronts(G, thr)) {
      for (const e of lipPixels(ox + f.x, oy + f.y, f.dx, f.dy, G.S, PIPE_C)) if (e.y < GROUND) put(e.x, e.y, e.r, e.gr, e.b, e.c);
    }
  }
}

// --------------------------------------------------------- the level
function sky(hour) {
  // a deep evening-blue level; brighter by day
  const day = kit.smoothstep(6, 9, hour) * (1 - kit.smoothstep(17.5, 20, hour));
  const top = kit.mix([0.002, 0.003, 0.012], [0.01, 0.03, 0.11], day), bot = kit.mix([0.006, 0.006, 0.03], [0.03, 0.07, 0.16], day);
  for (let y = 0; y < N; y++) {
    const k = y / N, r = top[0] + (bot[0] - top[0]) * k, g = top[1] + (bot[1] - top[1]) * k, b = top[2] + (bot[2] - top[2]) * k;
    for (let x = 0; x < N; x++) { const o = 3 * (y * N + x); img[o] = r; img[o + 1] = g; img[o + 2] = b; }
  }
  return day;
}

function ground() {
  const top = kit.scale(kit.hex('#e0803a'), 0.6), mid = kit.scale(kit.hex('#a8481c'), 0.6), dark = kit.scale(kit.hex('#4a1a08'), 0.6);
  for (let y = GROUND; y < N; y++) {
    const j = y - GROUND;
    for (let x = 0; x < N; x++) {
      const bx = (x + (Math.floor(j / 5) % 2) * 4) % 8, by = j % 5;
      let c = by === 0 || bx === 0 ? dark : by === 1 || bx === 1 ? top : mid;
      if (j === 0) c = top;
      const o = 3 * (y * N + x);
      img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2];
    }
  }
}

// ------------------------------------------------------------- plans
const plans = new Map();
function geoFor(s) {
  const spot = {};
  const names = ['H1', 'H0', 'M1', 'M0'];
  for (let k = 0; k < 4; k++) {
    const S = SLOTS[k], G = glyph(s[k], S.size, PIPE_C), W = G.S.W;
    let best = null;
    for (let c = 2; c < W - 2; c++) {
      let top = 1e9;
      for (let j = -3; j <= 3; j++) top = Math.min(top, G.top[c + j + 3] ?? 1e9);
      const score = top + 0.18 * Math.abs(c + 0.5 - W / 2);
      if (!best || score < best.score) best = { score, x: S.x + c + 0.5, y: S.y + top };
    }
    spot[names[k]] = { x: best.x, y: best.y };
  }
  return { spot, glyphs: [0, 1, 2, 3].map((k) => glyph(s[k], SLOTS[k].size, PIPE_C)) };
}
function planFor(M) {
  if (plans.has(M)) return plans.get(M);
  const cur = digitsAt(M), prev = digitsAt(M - 60), next = digitsAt(M + 60);
  const hourIn = new Date(M * 1000).getMinutes() === 0, hourOut = new Date((M + 60) * 1000).getMinutes() === 0;
  const geo = geoFor(cur);
  const start = hourIn ? { station: 'SPR', t: 0, until: Math.max(5.6, 2.6 + 0.55 * fwCount(new Date(M * 1000).getHours())), hour: true } : { station: 'PIPE', t: 0, until: 1.7 };
  // plan the loop to arrive where the pound begins just in time
  const poundAt = hourOut ? 'H0' : 'M0';
  const R = new Route(geo, start, { station: poundAt, t: (hourOut ? T_POUND_H : T_POUND_M) - 1.1 });
  poundAndRecoil(R, poundAt, hourOut ? T_POUND_H : T_POUND_M, hourOut ? 'SPR' : 'PIPE');
  const P = { M, cur, prev, next, hourIn, hourOut, geo, R, plant: plantSchedule(R) };
  plans.set(M, P);
  if (plans.size > 4) plans.delete(plans.keys().next().value);
  return P;
}

/** Each slot's turn: [retract start (s into the old minute), grow start, grow length (s into the new one)]. */
function turnTiming(hour) {
  return hour
    ? [[T_POUND_H + 0.15, 0.35, 1.65], [T_POUND_H, 0.1, 1.8], [T_POUND_H + 0.25, 0.6, 1.2], [T_POUND_H + 0.32, 0.75, 1.2]]
    : [[59, 0, 1], [59, 0, 1], [T_POUND_M + 0.12, 0.28, 1.2], [T_POUND_M, 0.1, 1.2]];
}

// ------------------------------------------------------------ props
function coin(x, y, ph, a = 1) {
  const w = Math.abs(Math.cos(ph)) * 2.2 + 0.4, gold = kit.hex('#ffc93a');
  for (let py = Math.floor(y - 3.5); py <= Math.ceil(y + 3.5); py++) for (let px = Math.floor(x - 3); px <= Math.ceil(x + 3); px++) {
    const dx = (px + 0.5 - x) / w, dy = (py + 0.5 - y) / 3.2, d = Math.hypot(dx, dy);
    const c = kit.clamp((1 - d) * 3) * a;
    if (c > 0) { const sh = 0.6 + 0.4 * kit.clamp(-dx); put(px, py, gold[0] * sh, gold[1] * sh, gold[2] * sh, c); }
  }
}
function qBlock(s, P) {
  let bump = 0, pop = -1;
  for (const b of P.R.bonks) { const u = s - b; if (u >= 0 && u < 0.25) bump = Math.sin((Math.PI * u) / 0.25) * 2.5; if (u >= 0 && u < 0.7) pop = u; }
  const q = QBLOCK, x0 = q.x - q.s / 2, y0 = Math.round(q.y - bump);
  const gold = kit.hex('#ffb42a'), dark = kit.hex('#7a3a06'), hi = kit.hex('#fff0b0');
  const pulse = 0.8 + 0.2 * Math.sin(s * 3);
  for (let j = 0; j < q.s; j++) for (let i = 0; i < q.s; i++) {
    const edge = i === 0 || j === 0 || i === q.s - 1 || j === q.s - 1;
    const c = edge ? (i === 0 || j === 0 ? hi : dark) : gold;
    put(x0 + i, y0 + j, c[0] * pulse, c[1] * pulse, c[2] * pulse, 1);
  }
  const Q = ['.##.', '#..#', '...#', '..#.', '....', '..#.'];
  Q.forEach((row, j) => { for (let i = 0; i < 4; i++) if (row[i] === '#') put(x0 + 2 + i, y0 + 1 + j, 0.02, 0.005, 0, 1); });
  if (pop >= 0) {
    const y = q.y - 2 - 40 * pop + 45 * pop * pop, a = 1 - kit.smoothstep(0.45, 0.7, pop);
    coin(q.x, y, s * 14, a);
  }
}
function coins(s, P) {
  COINS.forEach(([cx, cy], k) => {
    let a = 1;
    for (const t of P.R.coinsTaken[k]) {
      const u = s - t;
      if (u >= 0 && u < 3.5) a = Math.min(a, kit.smoothstep(2.8, 3.5, u));
      if (u >= 0 && u < 0.4) glow(cx, cy - 10 * u, 3, [0.8, 0.7, 0.3], 0.6 * (1 - u / 0.4));
    }
    if (a > 0) coin(cx, cy + Math.sin(s * 2 + k) * 0.6, s * 3.2 + k * 0.7, a);
  });
}
function springProp(s, P) {
  let comp = 0;
  for (const e of P.R.spring) {
    const u = s - e.t;
    if (e.k === 'launch') {
      if (u > -0.14 && u < 0) comp += 3 * kit.smoothstep(-0.14, 0, u);
      else if (u >= 0 && u < 1) comp += -2.4 * Math.exp(-7 * u) * Math.sin(22 * u);
    } else if (u >= 0 && u < 1) comp += 3 * Math.exp(-6 * u) * Math.abs(Math.cos(9 * u));
  }
  comp = kit.clamp(comp, -2.5, 3.2);
  const x0 = SPRING.x - 5, top = SPRING.y + comp, red = kit.hex('#ff3b3b'), metal = kit.hex('#c8d4e0');
  const H = GROUND - top;
  for (let y = Math.floor(top); y < GROUND; y++) {
    const fy = y + 0.5 - top;
    for (let i = 0; i < 11; i++) {
      let c = null, a = 1;
      if (fy < 2) { c = red; a = kit.clamp(y + 1 - top); }
      else if (i >= 2 && i <= 8) {
        // a coil seen from the side: bright turns that close up as it squashes
        const ph = ((fy - 2) / Math.max(0.5, H - 2)) * 3;
        const turn = 0.5 + 0.5 * Math.cos(ph * kit.TAU);
        c = metal.map((v) => v * (0.15 + 0.85 * turn * turn));
      }
      if (c) put(x0 + i, y, c[0], c[1], c[2], a);
    }
  }
}
function warpPipe() {
  const S = { r: 4.5, lipW: 1.4, lipL: 4 };
  const tmp = new Float32Array(3);
  for (let y = PIPE.y; y < GROUND; y++) for (let x = 116; x < 128; x++) {
    const d = x + 0.5 - PIPE.x;
    if (Math.abs(d) > S.r + 0.5) continue;
    shade(Math.sign(d) || 1, 0, Math.abs(d) / S.r, PIPE_C, tmp, 0);
    put(x, y, tmp[0], tmp[1], tmp[2], kit.clamp(S.r + 0.5 - Math.abs(d)));
  }
  for (const e of lipPixels(PIPE.x, PIPE.y, 0, -1, S, PIPE_C)) put(e.x, e.y, e.r, e.gr, e.b, e.c);
}


// ------------------------------------------------------------ scenery
const STARS = Array.from({ length: 70 }, (_, k) => [Math.floor(kit.hash(k, 1) * 128), Math.floor(kit.hash(k, 2) * 112), kit.hash(k, 3)]);
function stars(s, night) {
  if (night <= 0.01) return;
  for (const [x, y, h] of STARS) {
    if (x >= 64 && y < 64) continue;
    const tw = 0.5 + 0.5 * Math.sin(s * (1 + 2 * h) + h * 40);
    const a = night * (0.02 + 0.05 * h) * (0.4 + 0.6 * tw);
    addp(x, y, a * 0.8, a * 0.85, a);
  }
}
function moon(s, day) {
  // sun by day, moon by night: a soft disc high in the tower
  const x = 31, y = 9;
  const c = day > 0.5 ? kit.hex('#ffe08a') : kit.hex('#dfe8ff'), a = day > 0.5 ? 0.35 : 0.22;
  for (let py = y - 6; py <= y + 6; py++) for (let px = x - 6; px <= x + 6; px++) {
    const d = Math.hypot(px + 0.5 - x, py + 0.5 - y);
    let k = kit.clamp(4.2 - d);
    if (day <= 0.5) k *= kit.clamp(Math.hypot(px + 0.5 - x - 2, py + 0.5 - y + 1.2) - 3.4);
    const halo = kit.clamp(1 - d / 6.5) ** 2 * 0.25;
    addp(px, py, c[0] * a * (k + halo), c[1] * a * (k + halo), c[2] * a * (k + halo));
  }
}
const CLOUDS = [
  { y: 30, v: 1.1, s: 1.0, lo: -16, hi: 80, ph: 0.1 },
  { y: 17, v: 0.6, s: 0.7, lo: -16, hi: 80, ph: 0.6 },
  { y: 73, v: 1.6, s: 0.9, lo: -20, hi: 150, ph: 0.35 },
];
function clouds(s, day) {
  const base = kit.mix([0.03, 0.035, 0.06], [0.16, 0.18, 0.24], day);
  for (const C of CLOUDS) {
    const span = C.hi - C.lo, cx = C.hi - ((s * C.v + C.ph * span) % span), cy = C.y, k = C.s;
    const bumps = [[-5, 1, 3.2], [0, -1.5, 4.2], [5, 0.5, 3.4], [-1, 2, 3.4]].map(([dx, dy, r]) => [cx + dx * k, cy + dy * k, r * k]);
    for (let py = Math.floor(cy - 7 * k); py <= Math.ceil(cy + 5 * k); py++) for (let px = Math.floor(cx - 10 * k); px <= Math.ceil(cx + 10 * k); px++) {
      let d = 1e9;
      for (const [bx, by, r] of bumps) d = Math.min(d, Math.hypot(px + 0.5 - bx, py + 0.5 - by) - r);
      if (py + 0.5 > cy + 3.2 * k) d = Math.max(d, py + 0.5 - cy - 3.2 * k);
      const a = kit.clamp(0.5 - d);
      if (a <= 0) continue;
      const sh = 0.7 + 0.3 * kit.clamp((cy - py) / (5 * k) + 0.5);
      put(px, py, base[0] * sh, base[1] * sh, base[2] * sh, a);
    }
  }
}
function hills(day) {
  // SMB-like rounded hills far behind the run
  const c = kit.mix([0.004, 0.018, 0.008], [0.012, 0.06, 0.02], day), e = kit.mix([0.008, 0.03, 0.012], [0.03, 0.12, 0.04], day);
  for (const [hx, hr, hh] of [[86, 26, 22], [124, 16, 14], [18, 22, 18]]) {
    for (let y = GROUND - hh - 1; y < GROUND; y++) for (let x = Math.floor(hx - hr - 1); x <= hx + hr + 1; x++) {
      const nx = (x + 0.5 - hx) / hr, ny = (GROUND - y - 0.5) / hh;
      const d = (nx * nx + ny * ny - 1) * Math.min(hr, hh) * 0.5;
      const a = kit.clamp(0.5 - d);
      if (a <= 0) continue;
      const rim = kit.clamp(1.3 + d);
      put(x, y, c[0] + (e[0] - c[0]) * rim, c[1] + (e[1] - c[1]) * rim, c[2] + (e[2] - c[2]) * rim, a);
    }
  }
}

// ---------------------------------------------------------- fireworks
const FW = [kit.hex('#ffc93a'), kit.hex('#ff5aa0'), kit.hex('#5ae0ff'), kit.hex('#b6ff5a'), kit.hex('#ff8a3a'), kit.hex('#c08aff')];
export const fwCount = (h) => h % 12 || 12;
function fireworks(s, P) {
  if (!P.hourIn) return 0;
  const n = fwCount(new Date(P.M * 1000).getHours());
  let flash = 0;
  for (let k = 0; k < n; k++) {
    const tl = 2.0 + 0.55 * k, u = s - tl;
    if (u < 0 || u > 2.2) continue;
    const bx = 8 + 46 * kit.hash(k, P.M, 1), by = 8 + 22 * kit.hash(k, P.M, 2), x0 = 10 + 40 * kit.hash(k, P.M, 3);
    const col = FW[(k + Math.floor(kit.hash(P.M, 9) * 6)) % FW.length], col2 = FW[(k + 3) % FW.length];
    const rise = 0.45;
    if (u < rise) {
      // the shell climbs from the tower top, sparks trailing
      const f = kit.ease.out(u / rise), x = x0 + (bx - x0) * f, y = 46 + (by - 46) * f;
      glow(x, y, 1.4, [1, 0.85, 0.6], 0.5);
      for (let j = 1; j < 5; j++) { const g = kit.ease.out(Math.max(0, u - j * 0.03) / rise); glow(x0 + (bx - x0) * g, 46 + (by - 46) * g, 1, col, 0.18 / j); }
      continue;
    }
    const v = u - rise, fade = (1 - kit.smoothstep(0.5, 1.6, v));
    flash += Math.exp(-v * 7) * 0.5;
    glow(bx, by, 4 * Math.exp(-v * 5) + 0.5, [1, 0.95, 0.8], 0.8 * Math.exp(-v * 8));
    const m = 26;
    for (let j = 0; j < m; j++) {
      const ang = (j / m) * kit.TAU + k * 0.7, sp = 46 + 10 * kit.hash(j, k, 5);
      const tw = 0.65 + 0.35 * Math.sin(v * 34 + j * 1.7);
      for (let q = 0; q < 3; q++) {
        const vv = Math.max(0, v - q * 0.05);
        const r = (sp * (1 - Math.exp(-3.2 * vv))) / 3.2;
        const x = bx + Math.cos(ang) * r, y = by + Math.sin(ang) * r + 10 * vv * vv;
        if (x >= 63 && y < 64) continue;
        glow(x, y, q ? 1.4 : 2.0, j % 2 ? col : col2, (q ? 0.5 / q : 1.8) * fade * tw);
      }
    }
  }
  return flash;
}

// --------------------------------------------------------------- dust
function dust(s, P) {
  for (const e of P.R.dust) {
    const u = s - e.t;
    if (u < 0 || u > 0.5) continue;
    const a = (1 - u / 0.5) * 0.12 * e.k;
    for (const sd of [-1, 1]) for (let j = 0; j < 2; j++) {
      const x = e.x + sd * (3 + (8 + 5 * j) * kit.ease.out(u / 0.5)), y = e.y - 1 - (3 + 2 * j) * kit.ease.out(u / 0.5);
      glow(x, y, 1.6 + 1.5 * u, [0.9, 0.85, 0.75], a);
    }
  }
}


// ------------------------------------------------------- piranha plant
/** How far the plant is out of the warp pipe (0..1) every 0.05 s: out only while the frog is far away. */
function plantSchedule(R) {
  const n = 1200, far = new Uint8Array(n), out = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const f = R.frog(k * 0.05);
    far[k] = f && f.x < 92 && !(f.clip) ? 1 : 0;
  }
  // stay in unless the frog is far for 1.2 s before and 1.0 s after
  const ok = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    let v = 1;
    for (let j = -24; j <= 20 && v; j++) { const q = k + j; if (q >= 0 && q < n && !far[q]) v = 0; if (q < 0 || q >= n) v = 0; }
    ok[k] = v;
  }
  // smooth: ramps of 0.5 s
  for (let k = 0; k < n; k++) {
    let a = 0;
    for (let j = -5; j <= 5; j++) { const q = Math.min(n - 1, Math.max(0, k + j)); a += ok[q]; }
    out[k] = a / 11;
  }
  return out;
}
function piranha(s, P, now) {
  const A = P.plant, k = Math.min(A.length - 2, Math.max(0, Math.floor(s / 0.05))), f = s / 0.05 - k;
  const h = kit.smoothstep(0, 1, A[k] + (A[k + 1] - A[k]) * f);
  if (h <= 0.01) return;
  const x = PIPE.x, top = PIPE.y - 15 * h + Math.sin(now * 2.2) * 0.6 * h, bite = 0.5 + 0.5 * Math.sin(now * 5);
  const red = kit.hex('#ff2a2a'), dot = kit.hex('#fff2f2'), stem = kit.hex('#2fbe36'), lip = kit.hex('#ffe0e0');
  for (let py = Math.floor(top - 1); py < PIPE.y; py++) for (let px = Math.floor(x - 7); px <= Math.ceil(x + 7); px++) {
    const lx = px + 0.5 - x, ly = py + 0.5 - top;
    // head: a red bulb with a gaping mouth facing left, white spots
    const hd = Math.hypot(lx / 4.6, (ly - 4.2) / 4.2) - 1;
    const mouth = Math.abs(ly - 4.2) < 0.6 + 1.8 * bite * kit.clamp(-lx / 4) && lx < 0.5;
    let c = null, a = 0;
    if (hd < 0.08 && !mouth) {
      a = kit.clamp((0.08 - hd) * 8);
      const spot = ((Math.floor(px + 0.5) + Math.floor(py * 1.0)) % 3 === 0) && hd < -0.25 && lx > 0.5;
      c = spot ? dot : red;
      if (Math.abs(Math.abs(ly - 4.2) - (0.6 + 1.8 * bite * kit.clamp(-lx / 4))) < 0.7 && lx < 0.5) c = lip;
    } else if (ly > 8 && Math.abs(lx) < 1.0) { c = stem; a = 1; }
    else if (ly > 9.5 && ly < 12.5) {
      // two leaves
      const lf = Math.hypot((Math.abs(lx) - 3) / 2.6, (ly - 11) / 1.2) - 1;
      if (lf < 0) { c = stem.map((v) => v * 0.8); a = kit.clamp(-lf * 3); }
    }
    if (c) put(px, py, c[0], c[1], c[2], a);
  }
}

// ------------------------------------------------------------ the frog
function frogPose(f, s) {
  const o = { dir: f.dir, sq: f.sq ?? 1, rot: f.rot ?? 0, leg: 0, arm: 0, look: 0.5, clip: f.clip, slide: 0, blink: 0 };
  if (f.air) {
    const vy = f.vy ?? 0;
    o.leg = vy < 0 ? 0.9 : kit.clamp(0.9 - vy / 300, 0.15, 0.9);
    o.arm = vy < 0 ? 0.8 : 0.4;
    if (f.slide) { o.slide = 1; o.leg = 0.35; o.arm = 0; }
    if (f.pound) { o.leg = 0; o.arm = 1; }
  }
  const bp = (s * 0.37 + 0.3) % 1;
  if (bp < 0.04) o.blink = Math.sin((bp / 0.04) * Math.PI);
  if (f.idle >= 0 && f.idleLen > 1.4) {
    const u = f.idle - f.idleLen * 0.55;
    if (u > 0 && u < 0.22) o.tongue = 9 * Math.sin((Math.PI * u) / 0.22);
  }
  return o;
}
function fly(f, s) {
  if (!f || !(f.idle >= 0) || f.idleLen <= 1.4) return;
  const tc = f.idleLen * 0.55, u = f.idle - tc;
  if (u > 0.11) return;
  const k = kit.clamp((f.idle - 0.2) / Math.max(0.1, tc - 0.2));
  const tx = f.x + f.dir * 13, ty = f.y - 8;
  const x = tx + (1 - k) * 10 * Math.sin(s * 9) + 1.2 * Math.sin(s * 31), y = ty - (1 - k) * 12 + 1.2 * Math.cos(s * 27);
  glow(x, y, 1.6, [0.9, 1, 0.5], 0.8);
}


// ---------------------------------------------------------------- fx
/** POW: the ground pound's flash and star sparks. */
function pow(s, x, y, t0) {
  const u = s - t0;
  if (u < 0 || u > 0.5) return;
  const f = 1 - u / 0.5;
  glow(x, y, 3 + 9 * u, [1, 0.95, 0.8], 1.4 * f * f);
  for (let j = 0; j < 8; j++) {
    const a = (j / 8) * kit.TAU + 0.3, r = 4 + 34 * kit.ease.out(u / 0.5);
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 0.7;
    if (px >= 63 && py < 64) continue;
    glow(px, py, 1.6, [1, 0.85, 0.3], 1.2 * f);
  }
}
/** Dirt thrown up where a pipe breaks out of the ground. */
function dirt(s, x, t0, n = 8) {
  const u = s - t0;
  if (u < 0 || u > 0.7) return;
  const c = kit.hex('#c8743a');
  for (let j = 0; j < n; j++) {
    const vx = (kit.hash(j, 7) - 0.5) * 70, vy = 50 + 60 * kit.hash(j, 8);
    const px = x + vx * u, py = GROUND - 1 - (vy * u - 0.5 * 600 * u * u);
    if (py > GROUND) continue;
    glow(px, py, 1.3, c, 0.9 * (1 - u / 0.7));
  }
}
function turnFx(s, P) {
  const tin = turnTiming(P.hourIn);
  for (let k = 0; k < 4; k++) if (P.cur[k] !== P.prev[k]) dirt(s, SLOTS[k].x + P.geo.glyphs[k].root[0], tin[k][1] + 0.05);
  const at = P.hourOut ? 'H0' : 'M0', sp = P.geo.spot[at];
  pow(s, sp.x, sp.y, P.hourOut ? T_POUND_H : T_POUND_M);
}

// ------------------------------------------------------------- design
export default {
  name: 'Platformer',
  blurb: 'the level is the clock: warp-pipe numerals the rainbow frog speedruns, pounds and replumbs every minute',
  layouts: ['hub-stair'], look: 'smoke', fps: 60, brightness: 0.35, dither: true,
  frame(ctx) {
    const d = ctx.date, now = d.getTime() / 1000, M = Math.floor(now / 60) * 60, s = now - M;
    const hour = d.getHours() + d.getMinutes() / 60;
    const P = planFor(M);
    const day = sky(hour);
    stars(now, 1 - day);
    moon(now, day);
    clouds(now, day);
    hills(day);
    coins(s, P);
    qBlock(s, P);
    springProp(s, P);
    const tin = turnTiming(P.hourIn), tout = turnTiming(P.hourOut);
    for (let k = 0; k < 4; k++) {
      const S = SLOTS[k], G = P.geo.glyphs[k];
      let thr = 1e9;
      if (P.cur[k] !== P.prev[k]) {
        const [, g0, gl] = tin[k];
        if (s < g0 + gl) thr = G.gmax * kit.ease.out(kit.clamp((s - g0) / gl));
      }
      if (P.cur[k] !== P.next[k]) {
        const r0 = tout[k][0];
        if (s >= r0) thr = Math.min(thr, G.gmax * (1 - kit.ease.in(kit.clamp((s - r0) / (60 - r0)))));
      }
      let wob = 0;
      if (P.cur[k] !== P.prev[k]) {
        const u = s - tin[k][1] - tin[k][2];
        if (u > 0 && u < 0.7) wob = 0.9 * Math.exp(-5 * u) * Math.sin(16 * u);
      }
      if (thr > 0) drawGlyph(G, S.x, S.y, thr >= G.gmax ? 1e9 : thr, wob);
    }
    piranha(s, P, now);
    warpPipe();
    ground();
    const f = P.R.frog(s);
    if (f) drawFrog(img, N, f.x, f.y, frogPose(f, now));
    fly(f, now);
    dust(s, P);
    turnFx(s, P);
    fireworks(s, P);
    const dim = 1 - 0.75 * ctx.night;
    kit.blitGrid(ctx, img, dim);
  },
};
