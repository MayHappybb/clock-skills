// Marble Run: a tall marble machine on two stacked HUB75 panels (64x128).
// The time is held as glossy glass marbles packed into glass tubes bent into
// the four digits. An Archimedes screw lifts marbles up the right side; they
// roll along brass rails, drop through glass chutes, ride a pocket wheel
// round a U-turn and strike a bell on their way back to the basin.
// Minute turn: the changing digit's marbles slide down to the gate at its
// lowest point and fall out onto the rail below, its glass tube is re-bent,
// and a bead chain pulled from the hopper threads the new tube. Hour: every
// tube empties at once, the whole stock floods through the machine, and the
// bell strikes the hour (12-hour count) in rings of gold. Every ring of the
// bell sets the resting digits' glass glinting as it passes. A frog in round
// glasses sits inside the U-turn and cranks the wheel; it hops at each stroke.
import * as kit from '../js/kit.js';
import { glyph, resample, pathAt } from './marblerun-glyphs.js';

const W = 64, HT = 128, NPX = W * HT;
const SLOT = [[7, 17], [31, 17], [7, 60], [31, 60]];
const R = 1.95; const SPQ = 4.4;                 // marble radius (px; 1 px = 2 mm)
const VL = 19;                  // screw lift speed, px/s
const VW = 72;                  // pocket wheel rim speed, px/s
const WHEEL = [9, 105.5, 6.5];  // centre, radius of the marble path round it
const BELL = [51.2, 113.2];
const BELL_HW = [0.9, 1.7, 1.9, 2.0, 2.3, 2.9, 3.7]; // a bell: round crown, waist, flared lip
const GF = 300;                 // gravity for falling marbles, px/s^2 (a big machine, slowed)
const GAPT = 0.075;             // the gate lets one marble out every GAPT s
const VT = 125;                 // bead-chain speed, px/s
const EST = 3.2;                // chain stop distance (px): beads clack to rest

// ----------------------------------------------------------- palette
const AMBER = kit.hex('#ff9a24'), TEAL = kit.hex('#22dcc6'), RUBY = kit.hex('#ff3048');
const MILK = kit.hex('#d6d2c8'), COBALT = kit.hex('#4a6cff');
const BRASS = kit.hex('#c88e3e'), GLASS = kit.hex('#9cc4ff'), GOLD = kit.hex('#ffbe48');
const CIRC = [AMBER, TEAL, RUBY, MILK, TEAL, AMBER, COBALT];

// ----------------------------------------------------------- the circuit
const PIECES = [
  { kind: 'const', v: VL, pts: [[59.5, 124], [59.5, 5]], name: 'lift' },
  { kind: 'const', v: 18, pts: [[59.5, 4.6], [59.1, 3.0], [57.8, 1.9], [55.6, 1.8]] },
  { kind: 'roll', pts: [[55.4, 1.9], [52, 3.9], [48.6, 6.5]], name: 'hopper' },
  { kind: 'roll', pts: [[48.6, 6.5], [46, 8], [4, 11.3], [2.7, 12.3]], name: 'T' },
  { kind: 'fall', pts: [[2.5, 13], [2.5, 49]], name: 'dropL' },
  { kind: 'roll', pts: [[2.5, 49.4], [3.4, 50.6], [5, 51], [52, 54.8], [53.4, 55.8]], name: 'M' },
  { kind: 'fall', pts: [[53.5, 56.5], [53.5, 93]], name: 'dropR' },
  { kind: 'roll', pts: [[53.5, 93.4], [52.5, 94.4], [51, 94.6], [10, 99]], name: 'B1' },
  { kind: 'const', v: VW, arc: [WHEEL[0], WHEEL[1], WHEEL[2], -90, -270], name: 'wheel' },
  { kind: 'roll', pts: [[9, 112], [47.6, 117]], name: 'B2' },
  { kind: 'fall', pts: [[48.4, 117.4], [49.6, 122.2]], name: 'bell' },
  { kind: 'const', v: 13, pts: [[49.6, 122.4], [56, 124.3], [59.5, 124]], name: 'basin' },
];

const C = (() => {
  const raw = [], owner = [];
  PIECES.forEach((p, k) => {
    let pts = p.pts;
    if (p.arc) {
      const [cx, cy, r, a0, a1] = p.arc; pts = [];
      for (let i = 0; i <= 60; i++) { const a = ((a0 + ((a1 - a0) * i) / 60) * Math.PI) / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    }
    for (const q of pts) { raw.push(q); owner.push(k); }
  });
  // piece start arc lengths
  const startS = [], cum = [0];
  for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
  owner.forEach((k, i) => { if (startS[k] === undefined) startS[k] = cum[i]; });
  const P = resample(raw, false);
  const S = (name) => PIECES.findIndex((p) => p.name === name);
  const range = (k) => [startS[k], k + 1 < PIECES.length ? startS[k + 1] : P.L];
  const kindAt = (s) => { let k = 0; while (k + 1 < PIECES.length && startS[k + 1] <= s) k++; return k; };

  // probe marble: real rolling down slopes (5/7 g sin), falls, constant lift / wheel
  const G = 260, KR = 0.22, KF = 1.6, VMIN = 22, VLAND = 48, dt = 1 / 480, every = 4;
  const TX = [], TY = [], TS = [];
  let s = 0, v = VL, t = 0, step = 0, prevKind = 'const';
  const pt = [0, 0], pt2 = [0, 0];
  while (s < P.L) {
    if (step % every === 0) { pathAt(P, s, pt); TX.push(pt[0]); TY.push(pt[1]); TS.push(s); }
    const k = kindAt(s), pc = PIECES[k];
    pathAt(P, s, pt); pathAt(P, s + 0.5, pt2);
    const sin = (pt2[1] - pt[1]) / 0.5;
    if (pc.kind === 'const') v = pc.v;
    else if (pc.kind === 'roll') { if (prevKind === 'fall') v = Math.min(v, VLAND); v = Math.max(VMIN, v + (G * (5 / 7) * sin - KR * v) * dt); }
    else v = Math.max(VMIN, v + (G * sin - KF * v) * dt);
    prevKind = pc.kind;
    s += v * dt; t += dt; step++;
  }
  const dT = dt * every, Tc = TX.length * dT;
  const N = Math.round(Tc / 0.62), D = Tc / N;
  const tauOfS = (sv) => { let a = 0, b = TS.length - 1; while (a < b) { const m = (a + b) >> 1; if (TS[m] < sv) a = m + 1; else b = m; } return a * dT; };
  // S on a named rail (x monotonic there) where it passes x
  const railS = (names, x) => {
    const [s0] = range(S(names[0])), [, s1] = range(S(names[names.length - 1]));
    let a = s0, b = s1;
    pathAt(P, a, pt); const xa = pt[0]; pathAt(P, b, pt); const dir = pt[0] > xa ? 1 : -1;
    for (let i = 0; i < 40; i++) { const m = (a + b) / 2; pathAt(P, m, pt); if ((pt[0] - x) * dir < 0) a = m; else b = m; }
    return (a + b) / 2;
  };
  return {
    P, TX: Float32Array.from(TX), TY: Float32Array.from(TY), TS: Float32Array.from(TS), dT, Tc, N, D, tauOfS, railS, range, S,
    sHop: range(S('hopper'))[0],
    tauBell: tauOfS(range(S('bell'))[0]), tauBasin: tauOfS(range(S('basin'))[0] + 2),
  };
})();

function tabXY(tau, out) {
  tau %= C.Tc; if (tau < 0) tau += C.Tc;
  const f = tau / C.dT, i = Math.floor(f), u = f - i, j = (i + 1) % C.TX.length;
  out[0] = C.TX[i] + (C.TX[j] - C.TX[i]) * u; out[1] = C.TY[i] + (C.TY[j] - C.TY[i]) * u;
  return out;
}
// ----------------------------------------------------------- digits and their glass
const pad = (n) => String(n).padStart(2, '0');
const digs = (M) => { const d = new Date(M * 1000); return pad(d.getHours()) + pad(d.getMinutes()); };
const glyphs = new Map();
const G = (d, j) => { const k = d + j; if (!glyphs.has(k)) glyphs.set(k, glyph(d, SLOT[j][0], SLOT[j][1])); return glyphs.get(k); };
const masks = new Map();
/** Glass tube of digit d in slot j: sparse { idx, val } — bright walls, faint core. */
function glassOf(d, j) {
  const k = d + j;
  if (masks.has(k)) return masks.get(k);
  const acc = new Float32Array(NPX);
  for (const st of G(d, j)) {
    const P = st.P;
    const [ox, oy] = SLOT[j];
    for (let y = Math.max(0, oy - 6); y < Math.min(HT, oy + 35); y++) for (let x = Math.max(0, ox - 6); x < Math.min(W, ox + 25); x++) {
      let best = 99;
      for (let i = 0; i <= P.n; i += 2) { const dx = P.x[i] - x, dy = P.y[i] - y, d2 = dx * dx + dy * dy; if (d2 < best) best = d2; }
      if (best > 16) continue;
      const dd = Math.sqrt(best);
      const v = Math.exp(-(((dd - 3.0) / 0.6) * ((dd - 3.0) / 0.6))) + 0.22 * (1 - kit.smoothstep(2.2, 2.9, dd));
      if (v > acc[y * W + x]) acc[y * W + x] = v;
    }
  }
  const idx = [], val = [];
  for (let p = 0; p < NPX; p++) if (acc[p] > 0.02) { idx.push(p); val.push(acc[p]); }
  const m = { idx: Int32Array.from(idx), val: Float32Array.from(val) };
  masks.set(k, m);
  return m;
}

// ----------------------------------------------------------- one minute turn, planned
const plans = new Map();
function plan(M) {
  if (plans.has(M)) return plans.get(M);
  const prev = digs(M - 60), next = digs(M), hour = new Date(M * 1000).getMinutes() === 0;
  const changed = [0, 1, 2, 3].filter((j) => hour || prev[j] !== next[j]);
  const drains = [], trains = [], pt = [0, 0], drainEnd = [0, 0, 0, 0], drainStart = [9, 9, 9, 9];
  let firstBell = 99;
  for (const j of changed) {
    const tgt = j < 2 ? ['M'] : ['B1'], col = j < 2 ? AMBER : TEAL;
    const delay = hour ? [0, 0.055, 0, 0.055][j] : j === 2 && changed.includes(3) ? GAPT / 2 : j === 0 && changed.includes(1) ? GAPT / 2 : 0;
    for (const st of G(prev[j], j)) {
      pathAt(st.P, st.qd, pt);
      const gx = pt[0], gy = pt[1];
      const sl = C.railS(tgt, gx); pathAt(C.P, sl, pt);
      const drop = Math.max(0.5, pt[1] - gy), tauLand = C.tauOfS(sl);
      // the gate meters them out one at a time; each side of the tube slides
      // down toward it just fast enough to deliver its next marble on cue
      const items = st.slots.map((q) => ({ q, dist: Math.abs(q - st.qd), dir: q <= st.qd ? 1 : -1 }));
      items.sort((a, b) => a.dist - b.dist);
      const knots = { 1: [[delay, 0]], [-1]: [[delay, 0]] };
      const first = delay + Math.max(0.12, items[0].dist / 30);
      items.forEach((it, k) => { it.te = first + k * GAPT; knots[it.dir].push([it.te, it.dist]); });
      for (const it of items) {
        const vy = 18, tl = (-vy + Math.sqrt(vy * vy + 2 * GF * drop)) / GF;
        drains.push({ st, q: it.q, dir: it.dir, knots: knots[it.dir], te: it.te, gx, gy, vy, tl, tauLand, sl, col });
        drainEnd[j] = Math.max(drainEnd[j], it.te); drainStart[j] = Math.min(drainStart[j], it.te); firstBell = Math.min(firstBell, it.te + tl + C.tauBell - tauLand);
      }
    }
  }
  // no new tube is bent until every changing tube is empty: a half-old, half-new
  // time would be a wrong time
  const allOut = Math.max(...drainEnd);
  for (const j of changed) drainEnd[j] = allOut;
  for (const j of changed) {
    for (const st of G(next[j], j)) {
      const sDiv = C.railS(j < 2 ? ['hopper', 'T'] : ['M'], st.sx); pathAt(C.P, sDiv, pt);
      const drop = st.sy - pt[1], F = drop + (sDiv - C.sHop);
      trains.push({ j, st, sDiv, drop, F, len: (st.slots.length - 1) * st.sp, col: j < 2 ? AMBER : TEAL });
    }
  }
  // downstream first; on the hour the hour tubes are threaded first and the minute
  // chains wait until the hour marbles have rolled off the middle rail
  trains.sort((a, b) => (hour ? (a.j < 2) - (b.j < 2) : 0) * -1 || b.sDiv - a.sDiv);
  const mClear = hour ? Math.max(drainEnd[0], drainEnd[1]) + 1.6 : 0, sM = C.range(C.S('M'))[0];
  let prevEnd = -99;
  for (const tr of trains) {
    tr.launch = Math.max(prevEnd, drainEnd[tr.j] + 0.2 - tr.F / VT, tr.j >= 2 ? mClear - (sM - C.sHop) / VT : -99);
    prevEnd = tr.launch + (tr.len + tr.st.sp + 3) / VT;
    tr.tEase = tr.launch + (tr.F + tr.st.P.L - EST) / VT;
    tr.tStop = tr.tEase + (2 * EST) / VT;
    tr.tIn = tr.launch + tr.F / VT;  // head reaches START
  }
  const tIn = [9, 9, 9, 9];
  for (const tr of trains) tIn[tr.j] = Math.min(tIn[tr.j], tr.tIn);
  const chimes = hour ? (new Date(M * 1000).getHours() % 12 || 12) : 0;
  const p = { prev, next, hour, changed, drains, trains, tIn, drainEnd, drainStart, firstBell, chimes };
  plans.set(M, p);
  if (plans.size > 4) plans.delete(plans.keys().next().value);
  return p;
}

/** How far one side of a draining tube has slid at time r (piecewise linear through its knots). */
function side(kn, r) {
  if (r <= kn[0][0]) return 0;
  for (let i = 1; i < kn.length; i++) if (r < kn[i][0]) { const [t0, d0] = kn[i - 1], [t1, d1] = kn[i]; return d0 + ((d1 - d0) * (r - t0)) / (t1 - t0); }
  return kn[kn.length - 1][1];
}
/** Chain head coordinate at plan time r. */
function head(tr, r) {
  if (r < tr.tEase) return -tr.F + VT * (r - tr.launch);
  const u = Math.min(1, (r - tr.tEase) / ((2 * EST) / VT));
  return tr.st.P.L - EST + EST * (1 - (1 - u) * (1 - u));
}
/** Where a bead at chain coordinate q of train tr is; false while in the hopper. */
function chainXY(tr, q, out) {
  if (q >= 0) { pathAt(tr.st.P, Math.min(q, tr.st.P.L), out); return true; }
  if (q >= -tr.drop) { out[0] = tr.st.sx; out[1] = tr.st.sy + q; return true; }
  const s = tr.sDiv + (q + tr.drop);
  if (s < C.sHop) return false;
  pathAt(C.P, s, out); return true;
}
// ----------------------------------------------------------- drawing
const img = new Float32Array(3 * NPX);
const PT = [0, 0], PT2 = [0, 0];

/** Add a soft line of width w (px) in colour c times a. */
function line(buf, x0, y0, x1, y1, w, c, a) {
  const r = w / 2 + 0.6;
  const xa = Math.max(0, Math.floor(Math.min(x0, x1) - r)), xb = Math.min(W - 1, Math.ceil(Math.max(x0, x1) + r));
  const ya = Math.max(0, Math.floor(Math.min(y0, y1) - r)), yb = Math.min(HT - 1, Math.ceil(Math.max(y0, y1) + r));
  const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1e-9;
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
    let t = ((x - x0) * dx + (y - y0) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - x0 - t * dx, ey = y - y0 - t * dy, d = Math.sqrt(ex * ex + ey * ey);
    const cov = w / 2 + 0.5 - d;
    if (cov <= 0) continue;
    const k = (cov > 1 ? 1 : cov) * a, p = 3 * (y * W + x);
    buf[p] += c[0] * k; buf[p + 1] += c[1] * k; buf[p + 2] += c[2] * k;
  }
}

/** A glass marble at (x, y): opaque, lit from the upper left, caustic glow low right, white glint. */
function marble(x, y, c, a = 1, spark = 0) {
  const xa = Math.max(0, Math.floor(x - R - 0.5)), xb = Math.min(W - 1, Math.ceil(x + R + 0.5));
  const ya = Math.max(0, Math.floor(y - R - 0.5)), yb = Math.min(HT - 1, Math.ceil(y + R + 0.5));
  const RR = (R + 0.5) * (R + 0.5);
  for (let py = ya; py <= yb; py++) {
    const dy = py - y;
    for (let px = xa; px <= xb; px++) {
      const dx = px - x, d2 = dx * dx + dy * dy;
      if (d2 >= RR) continue;
      const d = Math.sqrt(d2);
      let cov = R + 0.5 - d; cov = (cov > 1 ? 1 : cov) * a;
      const nx = dx / R, ny = dy / R;
      let cau = 0.25 + 0.75 * (0.55 * nx + 0.8 * ny); cau = cau < 0 ? 0 : cau > 1 ? 1 : cau;
      const body = (0.12 + 0.88 * cau * cau) * (1 - 0.7 * kit.smoothstep(0.55, 1.15, d / R)) * (1 + 0.8 * spark);
      const gx = dx + 0.8, gy = dy + 0.85, glint = (0.9 + 1.2 * spark) * Math.exp(-(gx * gx + gy * gy) * (2.4 - 1.2 * Math.min(1, spark)));
      const p = 3 * (py * W + px);
      img[p] += (c[0] * body + glint - img[p]) * cov;
      img[p + 1] += (c[1] * body + glint * 0.97 - img[p + 1]) * cov;
      img[p + 2] += (c[2] * body + glint * 0.92 - img[p + 2]) * cov;
    }
  }
}

function glass(d, j, a) {
  if (a <= 0.002) return;
  const m = glassOf(d, j), k = 0.07 * a;
  for (let n = 0; n < m.idx.length; n++) {
    const p = 3 * m.idx[n], v = m.val[n] * k;
    img[p] += GLASS[0] * v; img[p + 1] += GLASS[1] * v; img[p + 2] += GLASS[2] * v;
  }
}

/** Paint an anti-aliased ellipse over what is there. */
function disc(x, y, rx, ry, c, a = 1) {
  const xa = Math.max(0, Math.floor(x - rx - 1)), xb = Math.min(W - 1, Math.ceil(x + rx + 1));
  const ya = Math.max(0, Math.floor(y - ry - 1)), yb = Math.min(HT - 1, Math.ceil(y + ry + 1));
  const rm = Math.min(rx, ry);
  for (let py = ya; py <= yb; py++) for (let px = xa; px <= xb; px++) {
    const ex = (px - x) / rx, ey = (py - y) / ry, e = Math.sqrt(ex * ex + ey * ey);
    let cov = (1 - e) * rm + 0.5;
    if (cov <= 0) continue;
    cov = (cov > 1 ? 1 : cov) * a;
    const p = 3 * (py * W + px);
    img[p] += (c[0] - img[p]) * cov; img[p + 1] += (c[1] - img[p + 1]) * cov; img[p + 2] += (c[2] - img[p + 2]) * cov;
  }
}

// The frog who powers the machine: a rainbow frog in round gold glasses,
// sitting inside the U-turn and cranking the pocket wheel by its hub.
const SPRITE = [
  '...YYY...YYY...',
  '..YWLLY.YWLLY..',
  '..YLKKYYYLKKY..',
  '..YLKKY.YLKKY..',
  '.GGYYYGGGYYYGG.',
  'GGGGGGGGGGGGGGG',
  'GDGGGGGGGGGGGDG',
  '.GDDDDDMDDDDDG.',
  '.GGGBBBBBBBGGG.',
  'GGGBBBBBBBBBGGG',
  'GGGGBBBBBBBGGGG',
  'GGG.GGGGGGG.GGG',
];
const RIM = kit.scale(kit.hex('#ffc94a'), 0.6), LENS = kit.hex('#0a1c22'), BELLY = kit.scale(kit.hex('#f2f0c0'), 0.4);
const ROWHUE = SPRITE.map((_, r) => kit.scale(kit.hsv(0.27 + r * 0.014, 0.8, 1), 0.42));
function frog(now, ang, cheer) {
  const hx = WHEEL[0] + 3.3 * Math.cos(ang), hy = WHEEL[1] + 3.3 * Math.sin(ang);
  const X = 18, Y = 100 - Math.round(cheer * 2);
  const blink = kit.fract(now / 4.7) < 0.03;
  for (let r = 0; r < SPRITE.length; r++) for (let c = 0; c < 15; c++) {
    let ch = SPRITE[r][c];
    if (ch === '.') continue;
    if (blink && r >= 1 && r <= 3 && 'WLK'.includes(ch)) ch = r === 2 ? 'D' : 'G';
    if (cheer > 0.3 && ch === 'M') ch = 'R';
    const col = ch === 'Y' ? RIM : ch === 'L' ? LENS : ch === 'K' ? [0, 0, 0] : ch === 'W' ? [0.75, 0.75, 0.75]
      : ch === 'B' ? BELLY : ch === 'R' ? [0.5, 0.02, 0.05] : ch === 'D' || ch === 'M' ? kit.scale(ROWHUE[r], 0.2) : ROWHUE[r];
    const p = 3 * ((Y + r) * W + X + c);
    img[p] = col[0]; img[p + 1] = col[1]; img[p + 2] = col[2];
  }
  // its arm, out to the crank handle on the wheel hub
  line(img, X + 0.5, Y + 6, hx, hy, 0.9, ROWHUE[6], 0.8);
  disc(hx, hy, 1, 1, ROWHUE[5]);
}

let STATIC = null;
function buildStatic() {
  const b = new Float32Array(3 * NPX), pt = [0, 0];
  const railOf = (name, off = 2.7) => {
    const [s0, s1] = C.range(C.S(name));
    let px = null, py = null;
    for (let s = s0; s <= s1; s += 1) {
      pathAt(C.P, s, pt);
      if (px !== null) line(b, px, py, pt[0], pt[1] + off, 1, BRASS, 0.13);
      px = pt[0]; py = pt[1] + off;
    }
  };
  for (const n of ['hopper', 'T', 'M', 'B1', 'B2']) railOf(n);
  // glass chutes for the drops
  for (const [x, y0, y1] of [[2.5, 13, 49.5], [53.5, 57, 93]]) {
    line(b, x - 2.9, y0, x - 2.9, y1, 0.8, GLASS, 0.05); line(b, x + 2.9, y0, x + 2.9, y1, 0.8, GLASS, 0.05);
  }
  // screw lift housing
  line(b, 56.3, 1, 56.3, 126.5, 0.8, BRASS, 0.07); line(b, 62.7, 6, 62.7, 126.5, 0.8, BRASS, 0.07);
  // pocket wheel ring and hub
  const [wx, wy, wr] = WHEEL;
  for (let i = 0; i < 48; i++) {
    const a0 = (i / 48) * kit.TAU, a1 = ((i + 1) / 48) * kit.TAU;
    line(b, wx + (wr + 1.6) * Math.cos(a0), wy + (wr + 1.6) * Math.sin(a0), wx + (wr + 1.6) * Math.cos(a1), wy + (wr + 1.6) * Math.sin(a1), 0.7, BRASS, 0.05);
  }
  // bell gallows
  line(b, BELL[0], 107.2, BELL[0], 110, 0.8, BRASS, 0.12); line(b, BELL[0], 107.2, 56.3, 107.2, 0.8, BRASS, 0.09);
  // basin
  line(b, 43.6, 119.5, 44.8, 127.4, 0.8, BRASS, 0.08); line(b, 44.8, 127.4, 56.3, 127.4, 0.8, BRASS, 0.08);
  return b;
}
const PILE = [[47.6, 125.2, RUBY], [51.9, 125.4, AMBER], [46.2, 121.4, TEAL], [55.2, 125.6, MILK]];

export default {
  name: 'Marble Run',
  blurb: 'a marble machine: the time is glass marbles packed in tubes bent into digits; a turn drains a tube through the machine and threads a new one; the bell strikes the hour',
  layouts: ['hub-tall'], look: 'smoke', fps: 60, brightness: 0.4, dither: false,
  frame(ctx) {
    if (!STATIC) STATIC = buildStatic();
    img.set(STATIC);
    const now = ctx.date.getTime() / 1000, M = Math.floor(now / 60) * 60, rel = now - M;
    const p = plan(M), pn = rel > 50 ? plan(M + 60) : null;
    const live = rel < 12;
    let ring = 0;
    const hits = [];
    const bellHit = (tau) => { const a = tau - C.tauBell; if (a >= 0 && a < 1.4) { ring += Math.exp(-3.2 * a); hits.push(a); } };

    // screw lift: brass helix whose threads carry the marbles up
    const pitch = VL * C.D, fr = (now % C.D) / C.D;
    for (let y = 3; y <= 126; y++) for (let x = 57; x <= 62; x++) {
      const cx = (x - 59.5) / 3.1, cyl = Math.cos(cx * 1.4);
      let u = (124 - y) / pitch - fr + cx * 0.22 + 0.5; u -= Math.round(u);
      const th = Math.exp(-(((u * pitch) / 1.1) * ((u * pitch) / 1.1))), v = (0.018 + 0.11 * th) * cyl, q = 3 * (y * W + x);
      img[q] += BRASS[0] * v; img[q + 1] += BRASS[1] * v; img[q + 2] += BRASS[2] * v;
    }
    // pocket wheel spokes turn with the marbles riding it (counter-clockwise)
    const om = VW / WHEEL[2], ang = -om * (now % (kit.TAU / om));
    for (let k = 0; k < 5; k++) {
      const a = ang + (k * kit.TAU) / 5;
      line(img, WHEEL[0] + 1.2 * Math.cos(a), WHEEL[1] + 1.2 * Math.sin(a), WHEEL[0] + 7.6 * Math.cos(a), WHEEL[1] + 7.6 * Math.sin(a), 0.9, BRASS, 0.16);
    }

    // the frog hops for joy at each stroke of the hour bell
    let cheer = 0;
    if (live && p.chimes) for (let k = 0; k < p.chimes; k++) {
      const a = rel - (p.firstBell + 0.62 * k);
      if (a >= 0 && a < 0.4) cheer = Math.max(cheer, Math.sin((Math.PI * a) / 0.4));
    }
    frog(now, ang, cheer);

    // glass tubes (re-bent while a changed digit is empty)
    for (let j = 0; j < 4; j++) {
      if (live && p.changed.includes(j)) {
        // the old tube fades as it empties; the new one is bent as soon as it is empty
        const e = p.drainEnd[j];
        // (never both at once: two tubes overlaid can spell a third digit)
        glass(p.prev[j], j, 1 - 0.4 * kit.smoothstep(p.drainStart[j], e, rel) - 0.6 * kit.smoothstep(e - 0.15, e + 0.03, rel));
        glass(p.next[j], j, kit.smoothstep(e + 0.05, e + 0.35, rel));
      } else glass(p.next[j], j, 1);
    }

    // marbles circulating through the machine
    for (let k = 0; k < C.N; k++) {
      const tau = (now + k * C.D) % C.Tc;
      if (tau > C.tauBasin) continue;
      tabXY(tau, PT); marble(PT[0], PT[1], CIRC[k % CIRC.length], 0.92);
      bellHit(tau);
    }
    for (const [x, y, c] of PILE) marble(x, y, c, 0.8);

    // drained marbles: slide to the gate, fall, then run the machine to the basin
    const rolling = [];
    if (live) for (const dr of p.drains) {
      if (rel < dr.te) {
        const d = side(dr.knots, rel);
        pathAt(dr.st.P, dr.q + dr.dir * d, PT); marble(PT[0], PT[1], dr.col);
        continue;
      }
      const tt = rel - dr.te;
      if (tt < dr.tl) { marble(dr.gx, dr.gy + dr.vy * tt + 0.5 * GF * tt * tt, dr.col); continue; }
      const tau = dr.tauLand + (tt - dr.tl);
      if (tau > C.tauBasin) continue;
      bellHit(tau);
      const f = tau / C.dT, i = Math.floor(f);
      dr.sFree = C.TS[i] + (C.TS[i + 1] - C.TS[i]) * (f - i); dr.since = tt - dr.tl;
      rolling.push(dr);
    }
    // marbles on the rails queue: none can sit closer than a marble behind the one ahead
    rolling.sort((a, b) => b.sFree - a.sFree);
    let lead = 1e9;
    for (const dr of rolling) {
      const sq = Math.max(Math.min(dr.sFree, lead - SPQ), Math.min(dr.sFree, dr.sl)); lead = sq;
      pathAt(C.P, sq, PT);
      const k = kit.smoothstep(0, 0.15, dr.since), ly = dr.gy + dr.vy * dr.tl + 0.5 * GF * dr.tl * dr.tl;
      marble(kit.lerp(dr.gx, PT[0], k), kit.lerp(ly, PT[1], k), dr.col);
    }

    // bead chains threading new tubes (this turn's, and the next turn's leaving early)
    const chains = (pl, r) => {
      for (const tr of pl.trains) {
        if (r < tr.launch) continue;
        const D = head(tr, r), n = tr.st.slots.length;
        for (let k = 0; k < n; k++) if (chainXY(tr, D - k * tr.st.sp, PT)) marble(PT[0], PT[1], tr.col);
      }
    };
    if (live) chains(p, rel);
    if (pn) chains(pn, rel - 60);

    // the bell, and its ring spreading through the dark
    if (live && p.chimes) for (let k = 0; k < p.chimes; k++) {
      const a = rel - (p.firstBell + 0.62 * k);
      if (a >= 0 && a < 2) ring += 1.4 * Math.exp(-4 * a);
    }
    const sw = 0.5 * Math.min(1, ring) * Math.sin(now * kit.TAU * 3.1), glow = Math.min(1.2, ring);
    for (let dy = -3; dy <= 3; dy++) {
      const hw = BELL_HW[dy + 3], cx = BELL[0] + sw * (dy + 4) * 0.35, y = Math.round(BELL[1] + dy);
      for (let x = Math.floor(cx - hw - 1); x <= Math.ceil(cx + hw + 1); x++) {
        const cov = kit.clamp(hw + 0.5 - Math.abs(x - cx));
        if (cov <= 0 || x < 0 || x >= W) continue;
        const shade = 0.55 + 0.45 * Math.cos((x - cx + 1) / (hw + 1)), v = cov * shade * (0.2 + 0.75 * glow), q = 3 * (y * W + x);
        img[q] += GOLD[0] * v; img[q + 1] += GOLD[1] * v; img[q + 2] += GOLD[2] * v;
      }
    }
    // the clapper swings the other way under the lip
    disc(BELL[0] - sw * 2.2, BELL[1] + 4.2, 0.8, 0.8, kit.scale(GOLD, 0.2 + 0.5 * glow));
    hits.sort((a, b) => a - b);
    const rings = hits.slice(0, 3).map((a) => [4 + 26 * a, 0.05 * (1 - a / 1.4) ** 2, 1.5]);
    // on the hour the bell strikes the hour, each stroke a wide ring of gold through the dark
    if (live && p.chimes) for (let k = 0; k < p.chimes; k++) {
      const a = rel - (p.firstBell + 0.62 * k);
      if (a >= 0 && a < 2.2) rings.push([3 + 48 * a, 0.045 * (1 - a / 2.2) ** 2, 1.4]);
    }
    // digits at rest; each ring of the bell sets their glass glinting as it passes
    for (let j = 0; j < 4; j++) {
      if (live && p.changed.includes(j)) continue;
      const col = j < 2 ? AMBER : TEAL;
      for (const st of G(p.next[j], j)) for (const q of st.slots) {
        pathAt(st.P, q, PT);
        let sp = 0;
        const dist = Math.hypot(PT[0] - BELL[0], PT[1] - BELL[1]);
        for (const [rr, al] of rings) { const u = (dist - rr) / 2.2; if (u > -3 && u < 3) sp += al * 14 * Math.exp(-u * u); }
        marble(PT[0], PT[1], col, 1, sp);
      }
    }
    for (const [rr, al, wd] of rings) {
      const xa = Math.max(0, Math.floor(BELL[0] - rr - 3)), xb = Math.min(W - 1, Math.ceil(BELL[0] + rr + 2));
      const ya = Math.max(0, Math.floor(BELL[1] - rr - 2)), yb = Math.min(HT - 1, Math.ceil(BELL[1] + rr + 2));
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
        const d = Math.hypot(x - BELL[0], y - BELL[1]) - rr;
        if (d > wd || d < -wd) continue;
        const v = al * (1 - Math.abs(d) / wd), q = 3 * (y * W + x);
        img[q] += GOLD[0] * v; img[q + 1] += GOLD[1] * v; img[q + 2] += GOLD[2] * v;
      }
    }

    kit.blitGrid(ctx, img, 1 - 0.72 * ctx.night);
  },
};
