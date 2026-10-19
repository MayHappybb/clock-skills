// Pachinko: the whole 64x128 tall assembly is one pachinko machine, and the
// time is part of the machine.
//
// The HOURS are hammered into the playfield as brass nails (kugi): every ball
// that cascades down from the guide rail rattles off the numerals, rolls along
// their curves and makes the nails it strikes flash. The MINUTES live on the
// centre LCD of the yakumono as a pair of flashy anime reel numerals (gold-to-
// red gradient, white keyline, highlight bevel, idle bob, glints, twinkles).
//
// Always alive: a steady stream (1.6 balls/s, the real rate) is shot up the
// left rail, over the top arc, and falls through the nails on real sub-pixel
// physics (pachinko-sim.js), off the yakumono roof, through two windmills,
// into the start pocket, the attacker or the out-hole. Lamps chase round the
// cabinet; the tray's ball heap creeps toward the launcher.
//
// Minute turn: one ball finds the warp, rolls back and forth on the stage
// (two near misses) and drops into the start pocket exactly on the minute.
// The reels spin through symbols (never through other numbers), the tens reel
// stops, the ones reel goes into REACH (red speed lines, racing lamps), crawls
// with the new numeral half in view, and lands with a recoil, a star burst
// and a payout of balls into the tray.
// Hour: while the reels spin, the nail-master's work happens by itself: the
// old hour's nails pull loose and glide to the new hour's numerals, balls
// ricocheting off them in flight. The reels hit and the machine goes into
// FEVER: strobing cabinet lamps, gold rays on the LCD, the attacker door
// opens, a flood of balls pours up the rail and through the new hour, and the
// payout fills the tray.
import * as kit from '../js/kit.js';
import { nailDigit, reelCell, NSYM } from './pachinko-glyphs.js';
import { simulate, RATE, RB, MAXLIFE, RAIL, INNER_X, INNER_TOP, FRAME, GUIDES, WINDMILLS, WM_R, LIFE, HESO, ATT, END } from './pachinko-sim.js';

const W = 64, H = 128;
const img = new Float32Array(3 * W * H);
let STATIC = null;

// ---------------------------------------------------------------- palette
const BRASS = kit.hex('#ffb648'), HOT = kit.hex('#fff2c8'), CHROME = kit.hex('#c8d6ff'), GOLD = kit.hex('#ffc95a');
const RED = kit.hex('#ff2a14'), ROSE = kit.hex('#ff4f7a'), AMBER = kit.hex('#ffa22a'), WHITE = [1, 1, 1];
const NAVY0 = kit.hex('#0b1c52'), NAVY1 = kit.hex('#050a24'), REACH = kit.hex('#ff1a3a'), CYAN = kit.hex('#58d8ff');

// ------------------------------------------------------------ raster tools
function addp(x, y, c, a) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const q = 3 * (y * W + x); img[q] += c[0] * a; img[q + 1] += c[1] * a; img[q + 2] += c[2] * a;
}
/** A point of light at a sub-pixel position, split over four LEDs. */
function dot(x, y, c, a) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  addp(x0, y0, c, a * (1 - fx) * (1 - fy)); addp(x0 + 1, y0, c, a * fx * (1 - fy));
  addp(x0, y0 + 1, c, a * (1 - fx) * fy); addp(x0 + 1, y0 + 1, c, a * fx * fy);
}
function disc(x, y, r, c, a) {
  const x0 = Math.max(0, Math.floor(x - r - 1)), x1 = Math.min(W - 1, Math.ceil(x + r + 1));
  const y0 = Math.max(0, Math.floor(y - r - 1)), y1 = Math.min(H - 1, Math.ceil(y + r + 1));
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const d = Math.hypot(px - x, py - y), k = r + 0.5 - d;
    if (k > 0) addp(px, py, c, a * (k > 1 ? 1 : k));
  }
}
function line(x0, y0, x1, y1, w, c, a) {
  const minx = Math.max(0, Math.floor(Math.min(x0, x1) - w - 1)), maxx = Math.min(W - 1, Math.ceil(Math.max(x0, x1) + w + 1));
  const miny = Math.max(0, Math.floor(Math.min(y0, y1) - w - 1)), maxy = Math.min(H - 1, Math.ceil(Math.max(y0, y1) + w + 1));
  for (let py = miny; py <= maxy; py++) for (let px = minx; px <= maxx; px++) {
    const k = w / 2 + 0.5 - kit.segDist(px, py, x0, y0, x1, y1);
    if (k > 0) addp(px, py, c, a * (k > 1 ? 1 : k));
  }
}
/** A chrome ball: dark body occluding what is behind, a cool rim, a hot highlight. */
function chromeBall(x, y, a = 1) {
  const x0 = Math.max(0, Math.floor(x - 2)), x1 = Math.min(W - 1, Math.ceil(x + 2));
  const y0 = Math.max(0, Math.floor(y - 2)), y1 = Math.min(H - 1, Math.ceil(y + 2));
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const dx = px - x, dy = py - y, d = Math.sqrt(dx * dx + dy * dy), cov = RB + 0.5 - d;
    if (cov <= 0) continue;
    const k = (cov > 1 ? 1 : cov) * a, q = 3 * (py * W + px);
    // chrome: bright toward the upper left, a cool blue-grey under-side
    const lit = 0.07 + 0.3 * kit.clamp(-(dx + dy) * 0.55 + 0.35, 0, 1);
    img[q] = img[q] * (1 - 0.9 * k) + 0.8 * lit * k; img[q + 1] = img[q + 1] * (1 - 0.9 * k) + 0.88 * lit * k; img[q + 2] = img[q + 2] * (1 - 0.9 * k) + lit * k;
  }
  dot(x - 0.45, y - 0.5, WHITE, 0.85 * a);
}

// ---------------------------------------------------------------- nails
const BOX = [[11, 14], [33, 14]], BW = 20, BH = 32;
const NAILS = [0, 1].map((s) => Array.from({ length: 10 }, (_, d) => nailDigit(d, BOX[s][0], BOX[s][1], BW, BH)));
const pad = (n) => String(n).padStart(2, '0');
const hd = (h) => [Math.floor(h / 10), h % 10];
// the nails pull loose 0.9 s before the hour (while the minutes still read :59)
// and are all home 0.9 s after it, as the tens reel lands: never >1 s unreadable
const MORPH0 = -0.9, STAG = 0.5, GLIDE = 1.3, MORPH1 = MORPH0 + STAG + GLIDE;

// the rest of the playfield: plain steel nails on a staggered grid, kept off
// the hour's boxes (a dark moat) and out of the launch channel and side lanes
const FILL = [];
for (let r = 0; r < 12; r++) {
  const y = 5.5 + r * 4.2;
  for (let x = 6 + (r % 2) * 2.3; x < 60; x += 4.6) {
    const px = Math.round(x), py = Math.round(y);
    if (Math.hypot(px - RAIL.cx, py - RAIL.cy) > RAIL.r - 3.2 && py < RAIL.cy) continue;
    if (px < 9 || px > 56) continue;
    if (py > 9 && py < 50 && px > 8 && px < 56) continue;           // the hour's boxes + moat
    FILL.push([px, py]);
  }
}
for (const y of [60, 66, 72, 78, 84, 90]) FILL.push([57, y]);      // right lane beside the yakumono
const NF = FILL.length;
const fields = new Map();
function staticField(h) {
  let f = fields.get(h);
  if (f) return f;
  const [a, b] = hd(h), pts = [...FILL, ...NAILS[0][a], ...NAILS[1][b]];
  const rows = [];
  for (let y = 0; y < H; y++) rows.push(Int16Array.from(pts.map((p, i) => (Math.abs(p[1] - y) <= 2.6 ? i : -1)).filter((i) => i >= 0)));
  f = { n: pts.length, xy: new Float32Array(pts.flat()), heat: new Float32Array(pts.length), key: h, moving: false, rows };
  fields.set(h, f);
  return f;
}
const pairs = new Map();
function pair(slot, a, b) {
  const key = slot * 100 + a * 10 + b;
  let p = pairs.get(key);
  if (p) return p;
  const A = NAILS[slot][a], B = NAILS[slot][b], N = Math.max(A.length, B.length);
  // each nail flies through its own waypoint scattered over the digit's box,
  // so mid-flight the nails are a loose swarm, never another numeral
  const from = new Float32Array(2 * N), to = new Float32Array(2 * N), via = new Float32Array(2 * N), delay = new Float32Array(N);
  const bx = BOX[slot][0], by = BOX[slot][1];
  for (let i = 0; i < N; i++) {
    const pa = A[Math.floor((i * A.length) / N)], pb = B[Math.floor((i * B.length) / N)];
    from[2 * i] = pa[0]; from[2 * i + 1] = pa[1]; to[2 * i] = pb[0]; to[2 * i + 1] = pb[1];
    via[2 * i] = bx - 4 + kit.hash(key, i, 1) * (BW + 8); via[2 * i + 1] = by - 4 + kit.hash(key, i, 2) * (BH + 8);
    delay[i] = STAG * (0.7 * (i / N) + 0.3 * kit.hash(key, i, 3));
  }
  p = { N, from, to, via, delay };
  pairs.set(key, p);
  return p;
}
const scratch = { n: 0, xy: new Float32Array(800), heat: new Float32Array(400), key: -1, moving: true, rows: null };
/** The nails mid-glide, tau seconds after the hour from ha to hn. */
function morphField(ha, hn, tau) {
  const A = hd(ha), B = hd(hn);
  let n = 0;
  for (const [x, y] of FILL) { scratch.xy[2 * n] = x; scratch.xy[2 * n + 1] = y; scratch.heat[n] = 0; n++; }
  for (let s = 0; s < 2; s++) {
    if (A[s] === B[s]) {
      const pts = NAILS[s][A[s]];
      for (const [x, y] of pts) { scratch.xy[2 * n] = x; scratch.xy[2 * n + 1] = y; scratch.heat[n] = 0; n++; }
      continue;
    }
    const P = pair(s, A[s], B[s]);
    for (let i = 0; i < P.N; i++) {
      const u = kit.clamp((tau - MORPH0 - P.delay[i]) / GLIDE), e = kit.ease.inOut(u), v = 1 - e, arc = Math.sin(Math.PI * u);
      // quadratic Bezier: from -> via -> to
      scratch.xy[2 * n] = v * v * P.from[2 * i] + 2 * v * e * P.via[2 * i] + e * e * P.to[2 * i];
      scratch.xy[2 * n + 1] = v * v * P.from[2 * i + 1] + 2 * v * e * P.via[2 * i + 1] + e * e * P.to[2 * i + 1];
      scratch.heat[n] = arc; n++;
    }
  }
  scratch.n = n;
  return scratch;
}
function hourStart(t) { const d = new Date(t * 1000); return [t - (d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000), d.getHours()]; }
/** The nail field a ball launched at t0 will meet. */
function fieldFor(t0) {
  const [hs, h] = hourStart(t0);
  const near = t0 - hs < MORPH1 + 0.5;
  const hb = near ? hs : hs + 3600, ha = near ? (h + 23) % 24 : h, hn = near ? h : (h + 1) % 24;
  return { at: (t) => { const tau = t - hb; return tau < MORPH0 ? staticField(ha) : tau > MORPH1 ? staticField(hn) : morphField(ha, hn, tau); } };
}

// ----------------------------------------------------------------- balls
const SPACING = 0.62;
const balls = new Map();
function attackerOpen(t) { const [hs] = hourStart(t); const a = t - hs; return a > 2.5 && a < 10; }
function getBall(key, t0, v0) {
  let b = balls.get(key);
  if (!b || b.t0 !== t0) {
    const r = simulate(t0, v0, fieldFor(t0), attackerOpen);
    b = { t0, n: r.n, track: r.track, hits: r.hits, nh: r.nh, end: r.end, endT: r.endT };
    balls.set(key, b);
  }
  return b;
}
const launchV = (k) => 187 + 19 * kit.hash(k % 100003, 7);
const FLOOD = 44;

// --------------------------------------------------------------- the reels
const CW = 21, CH = 32, WX0 = 12, WX1 = 52, WY0 = 58, WY1 = 89;   // LCD window (inclusive)
const REEL_X = [11, 32];            // left edge of each reel cell column
const CELLS = Array.from({ length: 10 + NSYM }, (_, k) => reelCell(k, CW, CH));
/** Cubic Hermite through keys [t, p, v]. */
function keyed(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i + 1 < keys.length; i++) {
    const [t0, p0, v0] = keys[i], [t1, p1, v1] = keys[i + 1];
    if (t <= t1) {
      const h = t1 - t0, u = (t - t0) / h, u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * h * v0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * h * v1;
    }
  }
  return null;
}
const K = [6, 9];
const KEYS = [
  [[0, 0, 0], [0.12, -0.06, 0], [0.38, 1.0, 9], [0.95, 6, 10]],
  [[0, 0, 0], [0.12, -0.06, 0], [0.4, 1.1, 10], [0.92, 6.3, 10], [1.4, 7.85, 1.0], [2.05, 8.45, 0.35], [2.3, 8.62, 0.4], [2.45, 9, 6]],
];
const LAND = [0.95, 2.45];
/** Reel position in cells and speed (cells/s), a seconds after the start pocket. */
function reelPos(r, a) {
  if (a <= 0) return 0;
  const L = LAND[r];
  if (a < L) return keyed(KEYS[r], a);
  const v = KEYS[r][KEYS[r].length - 1][2], w = 38, z = 9, tau = a - L;
  return K[r] + (v / w) * Math.exp(-z * tau) * Math.sin(w * tau);
}
function cellKind(r, j, oldD, newD, seed) {
  if (j === 0) return oldD;
  if (j === K[r]) return newD;
  if (j < 0 || j > K[r]) return -1;
  return 10 + Math.floor(kit.hash(seed, r, j) * NSYM);
}

// ---------------------------------------------------------------- lamps
// Cabinet lamps: bulbs of 3 px every 4 px round the left, top and right edges.
const LAMPS = [];
for (let y = 117; y >= 2; y--) LAMPS.push([0, y]);
for (let x = 0; x <= 63; x++) LAMPS.push([x, 0]);
for (let y = 2; y <= 117; y++) LAMPS.push([63, y]);
const NLAMP = Math.floor(LAMPS.length / 4);

// ------------------------------------------------------------ static art
function buildStatic() {
  img.fill(0);
  const C = RAIL;
  // guide rail (outer), chrome
  for (let i = 0; i < 90; i++) {
    const a0 = Math.PI + (i / 90) * Math.PI, a1 = Math.PI + ((i + 1) / 90) * Math.PI, r = C.r + 0.6;
    line(C.cx + r * Math.cos(a0), C.cy + r * Math.sin(a0), C.cx + r * Math.cos(a1), C.cy + r * Math.sin(a1), 0.7, CHROME, 0.07);
  }
  line(C.left - 0.4, C.cy, C.left - 0.4, 118, 0.7, CHROME, 0.07);
  line(C.right + 0.4, C.cy, C.right + 0.4, 112, 0.7, CHROME, 0.07);
  line(INNER_X + 0.2, INNER_TOP, INNER_X + 0.2, 118, 0.6, CHROME, 0.05);
  // yakumono: gold body, roof, window frame
  for (let y = 49; y <= 96; y++) for (let x = 10; x <= 54; x++) {
    const roofY = x < 32 ? 55 - (6 * (x - 10)) / 22 : 49 + (6 * (x - 32)) / 22;
    if (y < roofY - 0.2) continue;
    const inWin = x >= WX0 && x <= WX1 && y >= WY0 && y <= WY1;
    if (inWin) continue;
    const q = 3 * (y * W + x), lattice = ((x + y) % 4 === 0 || (x - y + 400) % 4 === 0) ? 1 : 0;
    img[q] += GOLD[0] * (0.012 + 0.012 * lattice); img[q + 1] += GOLD[1] * (0.012 + 0.012 * lattice); img[q + 2] += GOLD[2] * (0.012 + 0.012 * lattice);
  }
  for (let i = 0; i < FRAME.length; i++) { const a = FRAME[i], b = FRAME[(i + 1) % FRAME.length]; line(a[0], a[1], b[0], b[1], 0.8, GOLD, 0.16); }
  line(WX0 - 1, WY0 - 1, WX1 + 1, WY0 - 1, 0.8, GOLD, 0.22); line(WX0 - 1, WY1 + 1, WX1 + 1, WY1 + 1, 0.8, GOLD, 0.22);
  line(WX0 - 1, WY0 - 1, WX0 - 1, WY1 + 1, 0.8, GOLD, 0.22); line(WX1 + 1, WY0 - 1, WX1 + 1, WY1 + 1, 0.8, GOLD, 0.22);
  // the stage: a glass shelf under the window
  for (let x = 13; x <= 51; x++) { const u = (x - 32) / 19; dot(x, 94.6 - 2.2 * u * u + 0.4, CYAN, 0.07); }
  // warp entrance on the left pillar
  disc(11.2, 61, 0.6, CYAN, 0.06);
  // guides, life nails, the start pocket cup
  line(GUIDES[0][0], GUIDES[0][1], GUIDES[1][0], GUIDES[1][1], 0.7, BRASS, 0.07);
  line(GUIDES[2][0], GUIDES[2][1], GUIDES[3][0], GUIDES[3][1], 0.7, BRASS, 0.07);
  for (const [x, y] of LIFE) { dot(x, y, BRASS, 0.45); }
  line(29.6, 102.2, 29.6, 105.5, 0.7, GOLD, 0.12); line(34.4, 102.2, 34.4, 105.5, 0.7, GOLD, 0.12); line(29.6, 105.8, 34.4, 105.8, 0.7, GOLD, 0.08);
  // attacker housing, floor, out-hole
  line(ATT.x0 - 1, ATT.y - 1.5, ATT.x0 - 1, ATT.y + 2, 0.7, RED, 0.05); line(ATT.x1 + 1, ATT.y - 1.5, ATT.x1 + 1, ATT.y + 2, 0.7, RED, 0.05);
  line(INNER_X, 112, 26.5, 117.6, 0.7, CHROME, 0.035); line(60, 112, 37.5, 117.6, 0.7, CHROME, 0.035);
  line(26.5, 118.3, 37.5, 118.3, 0.7, RED, 0.04);
  // the tray (uezara) below the glass
  line(2, 119.4, 56, 119.4, 0.7, CHROME, 0.06);
  for (let x = 2; x <= 56; x++) { const u = (x - 29) / 27; dot(x, 126.3 - 0.8 * u * u * u * u, CHROME, 0.05); }
  line(2, 119.4, 2.5, 125.5, 0.7, CHROME, 0.05); line(56, 119.4, 55.5, 125.5, 0.7, CHROME, 0.05);
  // the launch handle
  disc(60, 123, 2.2, CHROME, 0.05); disc(60, 123, 1.0, RED, 0.08);
  return Float32Array.from(img);
}

// --------------------------------------------------------------- the face
export default {
  name: 'Pachinko',
  blurb: 'a pachinko machine: the hour is hammered into the playfield as brass nails the balls rattle off; the minutes are anime reel numerals that spin into a REACH when the warp ball drops in; the hour re-nails itself and the machine goes into FEVER',
  layouts: ['hub-tall'], look: 'smoke', fps: 60, brightness: 0.38, dither: true,
  frame(ctx) {
    if (!STATIC) STATIC = buildStatic();
    img.set(STATIC);
    const now = ctx.date.getTime() / 1000;
    const M = Math.floor(now / 60) * 60, a = now - M;                // seconds since the minute
    const [hs, hour] = hourStart(now), ah = now - hs;               // seconds since the hour
    const fever = ah < 12 ? kit.smoothstep(2.3, 2.6, ah) * (1 - kit.smoothstep(9, 12, ah)) : 0;
    const reachK = a > 0.95 && a < 2.45 ? kit.smoothstep(0.9, 1.15, a) * (1 - kit.smoothstep(2.35, 2.5, a)) : 0;
    const win = a > 2.45 && a < 5 ? Math.exp(-(a - 2.45) * 2.2) : 0;  // fanfare pulse after the reels land
    const dimN = 1 - 0.65 * ctx.night;

    // ------------------------------------------------ cabinet lamps
    for (let k = 0; k < LAMPS.length; k++) {
      if (k % 4 === 3) continue;
      const id = Math.floor(k / 4), [x, y] = LAMPS[k];
      let v, c;
      if (fever > 0) {
        const strobe = Math.floor(now * 9) % 2;
        v = 0.25 + 0.75 * ((id + Math.floor(now * 14)) % 3 === 0 ? 1 : 0.15) * (strobe ? 1 : 0.6);
        c = id % 3 === 0 ? RED : id % 3 === 1 ? GOLD : WHITE;
        v = kit.lerp(0.12, v, fever);
      } else {
        const sp = 0.55 + 2.2 * reachK, ph = id / 9 - now * sp;
        v = 0.06 + 0.5 * Math.max(0, Math.cos(kit.TAU * ph)) ** 6;
        c = id % 2 ? AMBER : ROSE;
        if (reachK > 0) c = kit.mix(c, REACH, reachK);
        if (win > 0) v += 0.6 * win * (Math.floor(now * 10) % 2);
      }
      addp(x, y, c, v * 0.5);
    }

    // ------------------------------------------------ the LCD
    const mNow = new Date(M * 1000).getMinutes(), mOld = (mNow + 59) % 60;
    const nd = [Math.floor(mNow / 10), mNow % 10], od = [Math.floor(mOld / 10), mOld % 10];
    const spin = a < 4.5;
    const p = [spin ? reelPos(0, a - 0.05) : 0, spin ? reelPos(1, a - 0.05) : 0];
    const pv = [0, 1].map((r) => (spin ? (reelPos(r, a - 0.05 + 0.008) - reelPos(r, a - 0.05 - 0.008)) / 0.016 : 0));
    const bob = [0.55 * Math.sin(now * 2.1), 0.55 * Math.sin(now * 2.1 + 2.2)];
    const ccx = (WX0 + WX1) / 2, ccy = (WY0 + WY1) / 2;
    const seed = Math.floor(M / 60) % 100000;
    for (let y = WY0; y <= WY1; y++) {
      const gy = (y - WY0) / (WY1 - WY0);
      for (let x = WX0; x <= WX1; x++) {
        const q = 3 * (y * W + x);
        // background: navy; red speed lines in a reach; gold rays in fever
        let r = kit.lerp(NAVY0[0], NAVY1[0], gy), g = kit.lerp(NAVY0[1], NAVY1[1], gy), b = kit.lerp(NAVY0[2], NAVY1[2], gy);
        const dx = x - ccx, dy = y - ccy;
        if (reachK > 0 || fever > 0) {
          const th = Math.atan2(dy, dx), rr = Math.hypot(dx, dy);
          if (reachK > 0) {
            const s = Math.max(0, Math.cos(14 * th + now * 9)) ** 3 * kit.smoothstep(3, 18, rr) * reachK;
            r += REACH[0] * (0.05 * reachK + 0.16 * s); g += REACH[1] * 0.16 * s; b += REACH[2] * (0.16 * s);
          }
          if (fever > 0) {
            const s = Math.max(0, Math.cos(8 * th - now * 2.4)) ** 2 * fever;
            r += GOLD[0] * 0.11 * s; g += GOLD[1] * 0.11 * s; b += GOLD[2] * 0.11 * s;
          }
        }
        // bokeh drifting in the LCD's depth
        // (cheap: two soft blobs on Lissajous paths)
        const b1 = Math.max(0, 1 - Math.hypot(x - ccx - 14 * Math.sin(now * 0.31), y - ccy - 9 * Math.sin(now * 0.47)) / 7);
        const b2 = Math.max(0, 1 - Math.hypot(x - ccx - 15 * Math.sin(now * 0.23 + 2), y - ccy - 10 * Math.cos(now * 0.37)) / 6);
        r += 0.015 * b1 * b1 + 0.03 * b2 * b2; g += 0.03 * b1 * b1 + 0.008 * b2 * b2; b += 0.05 * b1 * b1 + 0.02 * b2 * b2;
        if (win > 0) { const f = 0.16 * win * win * (1 - gy * 0.6); r += GOLD[0] * f; g += GOLD[1] * f; b += GOLD[2] * f; }
        // the reels
        let cr = 0, cg = 0, cb = 0, ca = 0;
        for (let k = 0; k < 2; k++) {
          const cx = x - REEL_X[k];
          if (cx < 0 || cx >= CW) continue;
          const v = pv[k], nb = Math.abs(v) > 2 ? 4 : 1;
          for (let sIdx = 0; sIdx < nb; sIdx++) {
            const pos = p[k] + (nb > 1 ? (v / 60) * (sIdx / nb - 0.5) : 0);
            const u = y - WY0 - pos * CH - bob[k] - 0.5 + (CH - (WY1 - WY0 + 1)) / 2;
            const fl = Math.floor(u / CH), j = -fl, rr = u - fl * CH;
            const r0 = Math.floor(rr), fr = rr - r0;
            for (let t2 = 0; t2 < 2; t2++) {
              let row = r0 + t2, jj = j;
              if (row >= CH) { row -= CH; jj -= 1; }
              const kind = spin ? cellKind(k, jj, od[k], nd[k], seed) : jj === 0 ? nd[k] : -1;
              if (kind < 0) continue;
              const wgt = (t2 ? fr : 1 - fr) / nb, C = CELLS[kind], o = 4 * (row * CW + cx);
              cr += C[o] * wgt; cg += C[o + 1] * wgt; cb += C[o + 2] * wgt; ca += C[o + 3] * wgt;
            }
          }
        }
        if (ca > 0) {
          // glint: a diagonal band of light sweeps across the numerals
          const gl = Math.max(0, 1 - Math.abs(x + y * 0.6 - (now % 6.5) * 26) / 2.2);
          const lift = 1 + 1.3 * gl + 0.35 * fever * (0.5 + 0.5 * Math.sin(now * 12));
          r = r * (1 - ca) + cr * lift; g = g * (1 - ca) + cg * lift; b = b * (1 - ca) + cb * lift;
        }
        img[q] += r; img[q + 1] += g; img[q + 2] += b;
      }
    }
    // twinkles on the numerals at rest
    if (!spin || a > 3) for (let k = 0; k < 3; k++) {
      const per = 1.3, tt = now / per + k / 3, n = Math.floor(tt), f = tt - n;
      const sx = WX0 + 3 + kit.hash(n, k, 3) * 35, sy = WY0 + 4 + kit.hash(n, k, 5) * 24;
      const s = Math.sin(Math.PI * f) ** 3 * 0.6;
      dot(sx, sy, WHITE, s); dot(sx - 1, sy, WHITE, s * 0.35); dot(sx + 1, sy, WHITE, s * 0.35); dot(sx, sy - 1, WHITE, s * 0.35); dot(sx, sy + 1, WHITE, s * 0.35);
    }

    // ------------------------------------------------ the nails
    const nf = snapField(fieldFor(now).at(now));
    const glow = scratchGlow; glow.fill(0, 0, nf.n);
    const curKey = nf.moving ? -1 : nf.key;

    // ------------------------------------------------ balls
    const k1 = Math.floor(now / SPACING), k0 = Math.floor((now - MAXLIFE) / SPACING) - 1;
    for (let k = k0; k <= k1; k++) {
      const t0 = k * SPACING + 0.25 * kit.hash(k % 100003, 3);
      if (t0 > now || t0 < now - MAXLIFE) continue;
      drawBall(getBall(k, t0, launchV(k)), now, curKey, glow);
    }
    // the flood: in fever balls are fired as fast as the handle allows
    if (ah < 2.4 + FLOOD * 0.11 + MAXLIFE) {
      for (let j = 0; j < FLOOD; j++) {
        const t0 = hs + 2.4 + j * 0.11;
        if (t0 > now || t0 < now - MAXLIFE) continue;
        drawBall(getBall(-1 - (Math.floor(hs) % 100000) * 64 - j, t0, 184 + 24 * kit.hash(j, 11)), now, curKey, glow);
      }
    }
    for (const [key, b] of balls) if (b.t0 < now - MAXLIFE - 1 || b.t0 > now + 2) balls.delete(key);

    // draw the nails over the ball field's dark: brass heads, flashing where struck
    const feverWave = fever > 0 ? fever : 0;
    const nailN = 1 + 0.9 * ctx.night;   // the hour is only nails: at night they lose less than the rest
    for (let i = 0; i < nf.n; i++) {
      const x = nf.xy[2 * i], y = nf.xy[2 * i + 1];
      const hit = Math.min(1, glow[i]), heat = nf.heat[i];
      const wave = feverWave * Math.max(0, Math.sin(y * 0.35 - now * 9)) ** 4;
      if (i < NF) {   // steel field nail: faint, flashes when struck
        const v = 0.045 + 0.5 * hit + 0.1 * wave;
        dot(x, y, kit.mix(CHROME, HOT, hit), v);
        continue;
      }
      const c = kit.mix(BRASS, HOT, Math.min(1, hit + heat + wave));
      const v = 0.8 + 0.2 * Math.min(1, hit + heat + wave);
      dot(x, y, c, v * nailN);
      dot(x - 1, y, c, v * 0.2); dot(x + 1, y, c, v * 0.2); dot(x, y - 1, c, v * 0.2); dot(x, y + 1, c, v * 0.2);
    }

    // ------------------------------------------------ windmills, attacker, start pocket
    for (const [wx, wy, sp] of WINDMILLS) {
      const ang = sp * now * 3.1;
      for (let v = 0; v < 4; v++) {
        const t = ang + (v * Math.PI) / 2;
        line(wx, wy, wx + WM_R * Math.cos(t), wy + WM_R * Math.sin(t), 0.6, v % 2 ? CHROME : ROSE, 0.3);
      }
      dot(wx, wy, GOLD, 0.3);
    }
    const open = attackerOpen(now) ? kit.smoothstep(2.5, 2.8, ah) * (1 - kit.smoothstep(9.6, 10, ah)) : 0;
    {
      const drop = open * 2.6;
      line(ATT.x0, ATT.y - ATT.tilt * (1 - open), ATT.x1, ATT.y + ATT.tilt * (1 - open), 0.8, RED, 0.18 * (1 - open) + 0.04);
      if (open > 0) {
        line(ATT.x0, ATT.y + drop, ATT.x1, ATT.y + drop, 0.8, RED, 0.2);
        for (let x = ATT.x0 + 1; x < ATT.x1; x++) dot(x, ATT.y + 0.5, GOLD, open * (0.25 + 0.25 * Math.sin(x * 0.9 - now * 12)));
      }
    }
    // stage: the warp ball's run, and the start pocket's flash
    warpBall(a, now);
    const hesoFlash = Math.max(a < 0.6 ? Math.exp(-a * 6) : 0, lastHeso);
    if (hesoFlash > 0.01) { disc(32, 103.5, 1.6, GOLD, 0.35 * hesoFlash); }
    lastHeso = 0;

    // ------------------------------------------------ fanfare stars and payout
    if (a > 2.45 && a < 5) starBurst(a - 2.45, ah < 12 ? 26 : 12, seed);
    if (ah > 2.6 && ah < 12) confetti(ah - 2.6, now);
    tray(now, a, ah);

    kit.blitGrid(ctx, img, dimN);
  },
};
const scratchGlow = new Float32Array(400);
// the field drawn this frame, copied: ball simulation reuses morphField's scratch
const drawn = { n: 0, xy: new Float32Array(800), heat: new Float32Array(400), key: -1, moving: false, rows: null };
function snapField(f) {
  drawn.n = f.n; drawn.key = f.key; drawn.moving = f.moving;
  drawn.xy.set(f.xy.subarray(0, 2 * f.n)); drawn.heat.set(f.heat.subarray(0, f.n));
  return drawn;
}
let lastHeso = 0;

function drawBall(b, now, curKey, glow) {
  const f = (now - b.t0) * RATE, i0 = Math.floor(f);
  if (i0 >= b.n - 1) {
    if (b.end === END.heso && now - b.endT < 0.4) lastHeso = Math.max(lastHeso, 1 - (now - b.endT) / 0.4);
    return;
  }
  const u = f - i0, x = kit.lerp(b.track[2 * i0], b.track[2 * i0 + 2], u), y = kit.lerp(b.track[2 * i0 + 1], b.track[2 * i0 + 3], u);
  // fade in out of the launcher, out into the holes
  const left = (b.n - 1 - f) / RATE, fade = Math.min(1, left / 0.12, f / RATE / 0.08);
  chromeBall(x, y, fade);
  for (let h = 0; h < b.nh; h++) {
    const th = b.hits[3 * h];
    if (th > now) break;
    if (now - th < 0.7 && b.hits[3 * h + 2] === curKey) glow[b.hits[3 * h + 1]] += Math.exp(-(now - th) * 5);
  }
}

/** The minute's warp ball: down the left gap, into the warp, along the stage, into the pocket at :00. */
function warpBall(a, now) {
  const tb = a > 30 ? a - 60 : a;           // seconds relative to the minute
  if (tb < -3.6 || tb > 0.2) return;
  let x, y, vis = 1;
  if (tb < -3.0) { const u = (tb + 3.6) / 0.6; x = 8; y = 46 + 15 * u * u; }              // drops down the left gap
  else if (tb < -2.4) { const u = (tb + 3.0) / 0.6; x = 11.2; y = 61 + 31 * u * u; vis = 0.45; } // inside the warp tube
  else if (tb < -2.0) { const u = (tb + 2.4) / 0.4; x = 11.2 + 2.8 * u; y = 92 + 0.6 * u; }   // pops out onto the stage
  else if (tb < 0) {
    const tau = tb + 2.0, w = (2.5 * Math.PI) / 2;
    x = 32 - 18 * Math.exp(-0.55 * tau) * Math.cos(w * tau);
    const uu = (x - 32) / 19; y = 92.6 - 2.2 * uu * uu;
  } else { const u = tb / 0.2; x = 32; y = 92.6 + 10.5 * u * u; vis = 1 - u * 0.5; }
  chromeBall(x, y, vis);
  if (tb > -2.0 && tb < 0) dot(x, y - 2.2, CYAN, 0.12 + 0.1 * Math.sin(now * 20));
}

function starBurst(t, n, seed) {
  for (let i = 0; i < n; i++) {
    const ang = kit.hash(seed, i, 1) * kit.TAU, sp = 30 + 40 * kit.hash(seed, i, 2);
    const life = 1.1 + 0.8 * kit.hash(seed, i, 4);
    if (t > life) continue;
    const x = 42.5 + Math.cos(ang) * sp * t, y = 73 + Math.sin(ang) * sp * t + 40 * t * t;
    const k = (1 - t / life) * (0.7 + 0.3 * Math.sin(t * 30 + i));
    const c = i % 3 ? GOLD : WHITE;
    dot(x, y, c, k); dot(x - 1, y, c, k * 0.3); dot(x + 1, y, c, k * 0.3); dot(x, y - 1, c, k * 0.3); dot(x, y + 1, c, k * 0.3);
  }
}
function confetti(t, now) {
  // fever: gold sparks rain down the whole playfield
  const n = 30;
  for (let i = 0; i < n; i++) {
    const per = 1.6 + kit.hash(i, 9) * 0.8, ph = (t + kit.hash(i, 8) * per) / per, cyc = Math.floor(ph), f = ph - cyc;
    if (t - f * per < 0 || t > 9) continue;
    const x = 6 + kit.hash(i, cyc, 2) * 52 + 2 * Math.sin(now * 3 + i), y = 3 + f * 110;
    const k = Math.sin(Math.PI * f) * (0.35 + 0.35 * Math.max(0, Math.sin(now * 17 + i * 2))) * kit.smoothstep(9, 7, t);
    dot(x, y, i % 2 ? GOLD : RED, k);
  }
}

/** The ball tray below the glass: a heap creeping toward the launcher, payouts pouring in. */
function tray(now, a, ah) {
  const step = 2.3, drift = (now * 1.6 * step) % step;
  // payout: a pour after each win, a long one in fever
  const pourA = ah < 12 ? ah - 2.6 : a - 2.6, pourLen = ah < 12 ? 7 : 1.6;
  let level = 0.35;
  if (pourA > 0 && pourA < pourLen + 20) level += Math.min(pourA, pourLen) / pourLen * (ah < 12 ? 0.6 : 0.2) * Math.exp(-Math.max(0, pourA - pourLen) / 12);
  const rows = [[124.6, 22, 0], [122.4, 22, 1.15], [120.6, 22, 0]];
  for (let r = 0; r < 3; r++) {
    const [y, n, off] = rows[r];
    for (let i = 0; i < n; i++) {
      const x = 4.5 + off + i * step - drift + step;
      if (x < 4 || x > 54) continue;
      const fill = r === 0 ? 1 : r === 1 ? kit.clamp((level - 0.15) * 3 - (54 - x) / 60) : kit.clamp((level - 0.55) * 3 - (54 - x) / 50);
      if (fill > 0.02) trayBall(x, y, fill);
    }
  }
  if (pourA > 0 && pourA < pourLen) {
    for (let j = 0; j < 4; j++) {
      const u = (pourA * 6 + j / 4) % 1;
      const x = 56 - 9 * u, y = 118 + 7 * u * u - 2 * u;
      trayBall(x, y, 1);
    }
  }
}
function trayBall(x, y, a) {
  disc(x, y, 0.6, CHROME, 0.08 * a);
  dot(x - 0.4, y - 0.5, WHITE, 0.22 * a);
}
