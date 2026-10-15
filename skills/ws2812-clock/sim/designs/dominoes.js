// Domino Run: a walnut games table under one warm lamp, seen in 3D. The time
// is set up in standing ivory dominoes, each digit a domino artist's trail
// (forks where a figure needs two strokes). Round the table edge runs a ring
// of 60 oxblood dominoes: the seconds. Each second one more clicks over, and
// the wind-up rainbow frog in round glasses walks behind the wave standing
// them back up. Before the minute it leaves the ring, hops to the first
// domino of the minute digit and flicks it: the digit topples in a real chain
// wave (every tile pivots on its front edge and leans on the next, ending
// shingled), the fallen tiles slide across the walnut into the new figure, and
// it stands back up in reverse, a film run backwards. On the hour all four
// digits go down in one right-to-left cascade while the camera swings round,
// and then the whole thing rewinds at double speed.
import * as kit from '../js/kit.js';
import * as gfx from './dominoes-gfx.js';
import { layDigit } from './dominoes-glyphs.js';

// ------------------------------------------------------------------ scene
const AZ0 = 0;                                     // square on: the time reads straight
const AISLE = -0.1;                                // the walkway between the hour and minute rows
const DOM = { h: 1.05, w: 0.55, t: 0.22, s: 0.42 }; // digit dominoes (s = spacing)
const RING = { h: 1.0, w: 0.5, t: 0.2 };
const SLOT = [[-3.75, -5.95, 0.88], [0.23, -5.95, 0.88], [-3.75, 0.53, 0.88], [0.23, 0.53, 0.88]]; // glyph origin x, z, and world units per cell unit
const IVORY = { r: 0.86, g: 0.8, b: 0.64, pr: 0.03, pg: 0.025, pb: 0.02, spec: 1.6 };
const OXBLOOD = { r: 0.42, g: 0.06, b: 0.03, pr: 0.75, pg: 0.68, pb: 0.5, spec: 1.2 };
const VT = 28, VR = 34, TSLIDE = 0.65, H0 = 3.9, VH = 30;

// rounded-rectangle ring path, index 0 at top centre, clockwise from above
const RX = 4.75, RZ = 6.45, RC = 1.4, RZ0 = -0.1;
const ringSegs = (() => {
  const s = [], sx = RX - RC, sz = RZ - RC;
  s.push({ L: sx, f: (d) => [d, -RZ, 0] });
  s.push({ L: (Math.PI / 2) * RC, f: (d) => { const a = -Math.PI / 2 + d / RC; return [sx + RC * Math.cos(a), -sz + RC * Math.sin(a), a + Math.PI / 2]; } });
  s.push({ L: 2 * sz, f: (d) => [RX, -sz + d, Math.PI / 2] });
  s.push({ L: (Math.PI / 2) * RC, f: (d) => { const a = d / RC; return [sx + RC * Math.cos(a), sz + RC * Math.sin(a), a + Math.PI / 2]; } });
  s.push({ L: 2 * sx, f: (d) => [sx - d, RZ, Math.PI] });
  s.push({ L: (Math.PI / 2) * RC, f: (d) => { const a = Math.PI / 2 + d / RC; return [-sx + RC * Math.cos(a), sz + RC * Math.sin(a), a + Math.PI / 2]; } });
  s.push({ L: 2 * sz, f: (d) => [-RX, sz - d, -Math.PI / 2] });
  s.push({ L: (Math.PI / 2) * RC, f: (d) => { const a = Math.PI + d / RC; return [-sx + RC * Math.cos(a), -sz + RC * Math.sin(a), a + Math.PI / 2]; } });
  s.push({ L: sx, f: (d) => [-sx + d, -RZ, 0] });
  return s;
})();
const RING_LEN = ringSegs.reduce((a, s) => a + s.L, 0), RING_SP = RING_LEN / 60;
function ringAt(idx) {
  let d = (((idx % 60) + 60) % 60) * RING_SP;
  for (const s of ringSegs) { if (d <= s.L) { const [x, z, yaw] = s.f(d); return [x, z + RZ0, yaw]; } d -= s.L; }
  return [0, -RZ + RZ0, 0];
}

// ------------------------------------------------------------ chain physics
// Domino i (pivoting on its front edge) rests its top edge on the back face
// of domino i+1 tilted by th1:  sin(th - th1) = (s cos th1 - t) / h.
const g = (th1, s, t, h) => th1 + Math.asin(kit.clamp((s * Math.cos(th1) - t) / h, -1, 1));
const lead = (x) => x ** 1.3;
/** The last domino of a run: no one to lean on, so it goes flat and bounces. */
function endFall(x, thc) {
  if (x <= 1) return thc * lead(x);
  const y = (x - 1) / 0.9;
  if (y < 1) return thc + (Math.PI / 2 - thc) * y * y;
  return Math.PI / 2 - 0.16 * Math.exp(-3.5 * (y - 1)) * Math.abs(Math.sin(6 * (y - 1)));
}
/** Tilt of a domino with wave index gi on a stroke ending at E, wave front at F. */
function tilt(gi, E, F, s, t, h, thc) {
  let th, steps;
  if (F >= E) { th = endFall(F - E, thc); steps = E - gi; }
  else {
    const j = Math.floor(F);
    if (gi > j) return 0;
    th = thc * lead(F - j); steps = j - gi;
  }
  if (steps > 14) steps = 14;
  for (let k = 0; k < steps; k++) th = g(th, s, t, h);
  return th;
}
const FALLEN = 3.2; // wave index past the last domino when everything has settled

// --------------------------------------------------------------- layouts
const lays = new Map();
function lay(slot, d) {
  const key = slot * 10 + d;
  if (lays.has(key)) return lays.get(key);
  const [ox, oz, CS] = SLOT[slot], L = layDigit(d, DOM.s / CS);
  for (const q of L.doms) {
    q.x = ox + q.u * CS; q.z = oz + q.v * CS;
    q.pa = Math.floor(kit.hash(key, q.gi, 1) * 7); q.pb = Math.floor(kit.hash(key, q.gi, 2) * 7);
    q.E = L.strokes[q.s].end;
  }
  L.Fend = L.maxEnd + FALLEN;
  lays.set(key, L);
  return L;
}
const THC = Math.asin((DOM.s - DOM.t) / DOM.h);
const RTHC = Math.asin((RING_SP - RING.t) / RING.h);

// pose pool: everything drawn this frame
const pool = [];
let np = 0;
function pose(x, z, yaw, th, y, dims, mat, pa, pb) {
  const p = pool[np] || (pool[np] = {});
  np++;
  p.x = x; p.z = z; p.yaw = yaw; p.th = th; p.y = y; p.h = dims.h; p.w = dims.w; p.t = dims.t; p.mat = mat; p.pa = pa; p.pb = pb; p.frog = false;
  return p;
}

/** Push a digit with its wave front at F (0 = standing, Fend = all down). */
function pushDigit(L, F) {
  for (const q of L.doms) pose(q.x, q.z, q.yaw, F <= 0 ? 0 : tilt(q.gi, q.E, F, DOM.s, DOM.t, DOM.h, THC), 0, DOM, IVORY, q.pa, q.pb);
}
const angLerp = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * k; };
/** Fallen tiles of Lo gliding into the fallen figure of Ln, k 0..1. */
function pushSlide(Lo, Ln, k) {
  const no = Lo.doms.length, nn = Ln.doms.length;
  for (let j = 0; j < nn; j++) {
    const i = nn > 1 ? Math.round((j * (no - 1)) / (nn - 1)) : 0;
    const a = Lo.doms[i], b = Ln.doms[j];
    // stagger along the trail: the tail of the old run leaves first
    const st = (j / Math.max(1, nn - 1)) * 0.35, e = kit.ease.inOut(kit.clamp((k - st) / 0.65));
    // skip duplicates that sit exactly on top of a twin (merges, splits)
    if (e <= 0 && nn > no && i === Math.round(((j - 1) * (no - 1)) / (nn - 1)) && j > 0) continue;
    const tha = tilt(a.gi, a.E, Lo.Fend, DOM.s, DOM.t, DOM.h, THC), thb = tilt(b.gi, b.E, Ln.Fend, DOM.s, DOM.t, DOM.h, THC);
    // a curved path: bulge sideways, and a little hop
    const dx = b.x - a.x, dz = b.z - a.z, bulge = 0.35 * Math.sin(Math.PI * e) * (kit.hash(j, 7) - 0.5);
    const x = a.x + dx * e - dz * bulge, z = a.z + dz * e + dx * bulge;
    const th = kit.lerp(tha, thb, e) + (Math.PI / 2 - Math.max(tha, thb)) * Math.sin(Math.PI * e);
    const src = e < 0.5 ? a : b;
    pose(x, z, angLerp(a.yaw, b.yaw, e), th, 0.12 * Math.sin(Math.PI * e), DOM, IVORY, src.pa, src.pb);
  }
  // merges: old tiles with no new partner ride along onto a twin and vanish under it
  if (no > nn) {
    const used = new Set();
    for (let j = 0; j < nn; j++) used.add(nn > 1 ? Math.round((j * (no - 1)) / (nn - 1)) : 0);
    for (let i = 0; i < no; i++) {
      if (used.has(i)) continue;
      const j = Math.round((i * (nn - 1)) / Math.max(1, no - 1)), a = Lo.doms[i], b = Ln.doms[j];
      const st = (j / Math.max(1, nn - 1)) * 0.35, e = kit.ease.inOut(kit.clamp((k - st) / 0.65));
      if (e >= 1) continue;
      const tha = tilt(a.gi, a.E, Lo.Fend, DOM.s, DOM.t, DOM.h, THC), thb = tilt(b.gi, b.E, Ln.Fend, DOM.s, DOM.t, DOM.h, THC);
      const dx = b.x - a.x, dz = b.z - a.z;
      pose(a.x + dx * e, a.z + dz * e, angLerp(a.yaw, b.yaw, e), kit.lerp(tha, thb, e) + (Math.PI / 2 - Math.max(tha, thb)) * Math.sin(Math.PI * e), 0.1 * Math.sin(Math.PI * e), DOM, IVORY, a.pa, a.pb);
    }
  }
}

/**
 * One slot through a minute turn. age = seconds since the minute; the slot's
 * wave starts at `start`; every changed slot lies fallen until `tend`, so
 * all of them slide together: the time never mixes old and new digits.
 */
function pushTurn(slot, dOld, dNew, age, start, tend) {
  const Lo = lay(slot, dOld), Ln = lay(slot, dNew), Tr = Ln.Fend / VR;
  if (age < start) pushDigit(Lo, 0);
  else if (age < tend) pushDigit(Lo, Math.min(Lo.Fend, (age - start) * VT));
  else if (age < tend + TSLIDE) pushSlide(Lo, Ln, (age - tend) / TSLIDE);
  else if (age < tend + TSLIDE + Tr) pushDigit(Ln, Ln.Fend - (age - tend - TSLIDE) * VR);
  else pushDigit(Ln, 0);
}
const RIPPLE = [0.6, 0.4, 0.2, 0];  // carry ripple: minute ones first

// hour show timing: the cascade runs slot 3 -> 0, then rewinds at 2x
const HSTART = [H0 + 1.5, H0 + 1.0, H0 + 0.5, H0];
let HREW = 0; // computed per hour from the digits
function hourF(slot, L, age) {
  const fwd = (tau) => kit.clamp((tau - HSTART[slot]) * VH, 0, L.Fend);
  if (age <= HREW) return fwd(age);
  return fwd(HREW - 2 * (age - HREW));
}

// ------------------------------------------------------------------ the frog
// The ring's state: F = wave front (absolute seconds, ticking), R = how far
// the frog has stood the ring back up. The frog leaves at :50 and is back at :06.
function ringR(S) {
  const m = Math.floor(S / 60), s = S - 60 * m;
  if (s < 6) return 60 * (m - 1) + 41;
  if (s < 16) return kit.lerp(60 * (m - 1) + 41, 60 * m + 7, kit.smoothstep(0, 1, (s - 6) / 10));
  if (s < 50) return 60 * m + s - 9;
  return 60 * m + 41;
}
const tickF = (S) => { const i = Math.floor(S); return i + kit.ease.out(kit.clamp((S - i) / 0.35)); };

/** Where the frog stands to flick a digit: just behind its first domino (every trail starts at the top). */
function frogSpot(L) {
  const q = L.doms[0];
  return [q.x, q.z - 0.6];
}
function ringInner(idx) {
  const [x, z] = ringAt(idx);
  // pull toward the table centre
  const cx = 0, cz = RZ0, dx = cx - x, dz = cz - z, l = Math.hypot(dx, dz);
  return [x + (dx / l) * 0.1, z + (dz / l) * 0.1];
}
function pathPoint(pts, k) {
  let total = 0;
  const seg = [];
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); total += l; }
  let d = kit.clamp(k) * total;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) { const u = seg[i] ? kit.clamp(d / seg[i]) : 0; return [kit.lerp(pts[i][0], pts[i + 1][0], u), kit.lerp(pts[i][1], pts[i + 1][1], u), total]; }
    d -= seg[i];
  }
  return [pts[0][0], pts[0][1], total];
}
/** Frog position (x, z), hop height, gaze direction, and push lean, at absolute second S. */
function frogState(S, onesNow, onesPrev) {
  const m = Math.floor(S / 60), s = S - 60 * m;
  const home = ringInner(41);
  if (s >= 16 && s < 50 || (s >= 6 && s < 16)) {
    const R = ringR(S), [x, z] = ringInner(R - 0.45), [xa, za] = ringInner(R + 0.5);
    return { x, z, hop: 0.28 * Math.abs(Math.sin(Math.PI * R)), look: Math.sign(xa - x) * 0.5, push: 0 };
  }
  const L = s >= 50 ? onesNow : onesPrev, [bx, bz] = frogSpot(L);
  const path = [home, [-3.9, AISLE], [bx, AISLE], [bx, bz]];
  if (s >= 50) {
    const k = kit.clamp((s - 50) / 7.5), e = kit.ease.inOut(k), [x, z, tot] = pathPoint(path, e);
    const steps = tot * 1.6;
    return { x, z, hop: k < 1 ? 0.3 * Math.abs(Math.sin(Math.PI * e * steps)) : 0, look: k < 1 ? 0 : 0.6, push: 0, wind: k >= 1 ? 1 : 0 };
  }
  // s < 6: flick at 0, then walk home
  const push = s < 0.45 ? Math.sin((Math.PI * s) / 0.45) : 0;
  const k = kit.clamp((s - 0.8) / 5.2), e = kit.ease.inOut(k), [x, z, tot] = pathPoint(path, 1 - e);
  return { x, z, hop: k > 0 && k < 1 ? 0.3 * Math.abs(Math.sin(Math.PI * e * tot * 1.6)) : 0, look: -0.5, push };
}

// frog palette: rainbow body
const RAINBOW = [kit.hex('#ff2a2a'), kit.hex('#ff8a1a'), kit.hex('#ffe22a'), kit.hex('#3ee05a'), kit.hex('#2a8cff'), kit.hex('#a04cff')];
const GOLD = kit.hex('#ffc860');
function drawFrog(fr, t, dim) {
  const C = gfx.col, W = gfx.W, H = gfx.H;
  const k = gfx.project(fr.x, 0.45 + fr.hop, fr.z), cx = gfx.P.x + fr.push * k * 0.18, cy = gfx.P.y;
  const E = 1.15 * dim * Math.min(1.4, Math.max(0.35, lampLevel(fr.x, fr.z)));
  const s = k * 0.85; // body half-width in 2x px
  const x0 = Math.max(0, Math.floor(cx - 1.25 * s)), x1 = Math.min(W - 1, Math.ceil(cx + 1.25 * s));
  const y0 = Math.max(0, Math.floor(cy - 1.5 * s)), y1 = Math.min(H - 1, Math.ceil(cy + 0.95 * s));
  const blink = kit.fract(t / 4.3 + 0.5) < 0.035;
  const key = Math.abs(Math.cos(t * (fr.wind ? 9 : 2.5)));
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const u = (px + 0.5 - cx) / s, v = (py + 0.5 - cy) / s; // body units
    let c = null;
    // wind-up key behind the head
    if (Math.abs(v + 1.25) < 0.12 && Math.abs(u) < 0.45 * key + 0.08) c = GOLD;
    // legs: little splayed feet
    const fu = Math.abs(u) - 0.85, fv = v - 0.62;
    if (fu * fu / 0.09 + fv * fv / 0.05 < 1) c = RAINBOW[3];
    // body
    if (u * u / 1.0 + (v * v) / 0.62 < 1) {
      const band = Math.min(5, Math.max(0, Math.floor((u + 1) * 3)));
      c = RAINBOW[band];
      if (v > 0.35 && Math.abs(u) < 0.5) c = kit.hex('#ffe9b0'); // pale belly / mouth line
      if (Math.abs(v - 0.2) < 0.07 && Math.abs(u) < 0.45) c = [0.02, 0.01, 0.01];
    }
    // eyes in round glasses
    for (const ex of [-0.42, 0.42]) {
      const du = u - ex, dv = v + 0.6, r2 = du * du + dv * dv;
      if (r2 < 0.2) c = GOLD;                                   // rims
      if (r2 < 0.12) c = blink ? RAINBOW[3] : [0.95, 0.95, 0.9];  // whites
      const pu = du - fr.look * 0.13, pv = dv;
      if (!blink && pu * pu + pv * pv < 0.03) c = [0.01, 0.01, 0.02];
    }
    if (!c) continue;
    const o = 3 * (py * W + px);
    C[o] = c[0] * E; C[o + 1] = c[1] * E; C[o + 2] = c[2] * E;
  }
}
function lampLevel(x, z) {
  const l = gfx.lamp, dx = l.x - x, dz = l.z - z, d2 = dx * dx + l.y * l.y + dz * dz;
  return (l.k * l.y) / (d2 * Math.sqrt(d2)) * 1.0;
}

// ------------------------------------------------------------------- frame
const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => (pad(d.getHours()) + pad(d.getMinutes())).split('').map(Number);
const order = [];

export default {
  name: 'Domino Run',
  blurb: 'the time stood up in ivory domino trails on a lamp-lit table; the frog flicks each minute down and it rewinds into the next',
  // smoke: the table pool floats in a black room; the acrylic hides the GOB grid between the lit dots
  layouts: ['hub'], look: 'smoke', fps: 60, brightness: 0.4, dither: true,
  frame(ctx) {
    const date = ctx.date, now = date.getTime() / 1000;
    const M = Math.floor(now / 60) * 60, age = now - M;
    const prevD = new Date((M - 60) * 1000), prev = digitsOf(prevD), cur = digitsOf(date);
    const S = (date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds()) + date.getMilliseconds() / 1000;
    const dim = 1 - 0.45 * ctx.night;
    const t = ctx.t;
    const isHour = date.getMinutes() === 0 && age < 12;

    // hour show length
    let swing = 0;
    if (isHour) {
      let last = 0;
      for (let k = 0; k < 4; k++) last = Math.max(last, HSTART[k] + lay(k, cur[k]).Fend / VH);
      HREW = last + 0.8;
      const end = HREW + (HREW - H0) / 2;
      swing = age < H0 ? 0 : age > end ? 0 : Math.sin(Math.PI * kit.ease.inOut(kit.clamp((age - H0) / (end - H0))));
    }

    // camera: a slow drift, and a big swing round on the hour
    const az = AZ0 + 0.05 * Math.sin((t * 2 * Math.PI) / 37) + 0.02 * Math.sin((t * 2 * Math.PI) / 13) - 0.45 * swing;
    const el = 1.22 + 0.03 * Math.sin((t * 2 * Math.PI) / 29) - 0.25 * swing;
    gfx.setCamera(0, -0.1, az, el, 34, 158 * gfx.SS, 0.5 * gfx.H);
    gfx.lamp.x = 0.8 + 0.3 * Math.sin(t * 0.7); gfx.lamp.z = -0.8; gfx.lamp.y = 14; gfx.lamp.k = 250;

    // ---- gather everything to draw
    let tend = 0;
    for (let k = 0; k < 4; k++) if (prev[k] !== cur[k]) tend = Math.max(tend, RIPPLE[k] + lay(k, prev[k]).Fend / VT);
    np = 0;
    for (let k = 0; k < 4; k++) {
      if (isHour && age >= H0) pushDigit(lay(k, cur[k]), hourF(k, lay(k, cur[k]), age));
      else if (prev[k] !== cur[k]) pushTurn(k, prev[k], cur[k], age, RIPPLE[k], tend);
      else pushDigit(lay(k, cur[k]), 0);
    }
    // the seconds ring
    let F = tickF(S);
    const R = ringR(S);
    if (isHour && age >= H0) {
      // the hour: a wave races round the whole ring as well, and rewinds with the rest
      const tau = age <= HREW ? age : HREW - 2 * (age - HREW);
      F = Math.min(R + 59.5, F + Math.max(0, (tau - H0) * 26));
    }
    const j = Math.floor(F);
    for (let k = 0; k < 60; k++) {
      // the latest wave index with this ring position
      let n = j + 1 - ((((j + 1 - k) % 60) + 60) % 60);
      let th = 0;
      if (n > R - 1 && n <= j) {
        th = tilt(n, 1e9, F, RING_SP, RING.t, RING.h, RTHC);
        if (n < R + 1) th *= kit.smoothstep(0, 1, n - R); // the frog is lifting this one
      }
      const [x, z, yaw] = ringAt(k);
      pose(x, z, yaw, th, 0, RING, OXBLOOD, (k * 3) % 7, (k * 5 + 2) % 7);
    }
    const fr = frogState(S, lay(3, cur[3]), lay(3, prev[3]));
    if (isHour) fr.hop += 0.9 * Math.max(0, Math.sin(Math.PI * kit.clamp((age - (HREW - 0.75)) / 0.45))) + 0.6 * Math.max(0, Math.sin(Math.PI * kit.clamp((age - (HREW - 0.25)) / 0.35)));
    const frogP = pose(fr.x, fr.z, 0, 0, 0, DOM, IVORY, 0, 0); frogP.frog = true; frogP.st = fr;

    // ---- shadows, table, then painter's order
    gfx.clearShadow();
    for (let i = 0; i < np; i++) { const p = pool[i]; if (!p.frog) gfx.dominoShadow(p); }
    gfx.blobShadow(fr.x + 0.15, fr.z + 0.15, 0.55, 0.45, 0.7 / (1 + fr.hop * 3));
    gfx.drawTable(dim);
    order.length = 0;
    for (let i = 0; i < np; i++) {
      const p = pool[i];
      gfx.project(p.x, 0.3, p.z); p.depth = gfx.P.z;
      order.push(p);
    }
    order.sort((a, b) => b.depth - a.depth);
    for (const p of order) {
      if (p.frog) drawFrog(p.st, t, dim);
      else gfx.drawDomino(p, p.mat, dim);
    }
    gfx.blit(ctx, 1);
  },
};
