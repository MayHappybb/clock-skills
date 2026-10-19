// Crossroads: the five panels are a city junction seen from above. The
// time is road paint: hours painted in the two lanes of the north arm,
// minutes in the south arm, in stretched road-lettering numerals of white
// thermoplastic, worn by their age (the hour tens may be ten hours old, the
// minute units are a minute old and still gleam). Traffic runs on a real
// signal cycle locked to the minute: east-west queues and discharges, the
// north-south green wave rolls over the paint, then everyone stops for a
// pedestrian scramble across the yellow box junction.
// Minute turn: north-south is held at red; a road crew walks out, the
// grinder scours the old numeral off in a dust cloud, and the applicator
// walks the new numeral's strokes, laying hot white line behind it.
// Hour: rush-hour gridlock locks the box, horns blare, the signals fail to
// flashing amber and a traffic officer steps into the box and waves it clear,
// while crews repaint both arms.
import * as kit from '../js/kit.js';
import { DIGITS, DW, DH, CW, CH, walkAt } from './crossroads-glyphs.js';
import { W, N, ALB, SH, LADD, EM, dot, blob, ring, vehicle, person, machine, KIND } from './crossroads-draw.js';
import { CYCLE, WALK, ROUTES, pose, bucket, travel, light, V, ACC, DEC } from './crossroads-traffic.js';

const { clamp, smoothstep, hash } = kit;
const R0 = 72, R1 = 120;               // the roads span [72, 120) both ways
const inPlus = (x, y) => (x >= 64 && x < 128) || (y >= 64 && y < 128);

// ------------------------------------------------------------------ ground
const BASE = new Float32Array(3 * N), LAMP = new Float32Array(3 * N);
const ASPH = [0.033, 0.034, 0.037], PAVE = [0.075, 0.068, 0.06], JOINT = [0.045, 0.042, 0.04], KERB = [0.13, 0.125, 0.115];
const LINE = [0.42, 0.41, 0.38], YEL = [0.42, 0.25, 0.02];
const LAMPS = [[66, 66], [126, 66], [66, 126], [126, 126], [66, 24], [126, 30], [66, 168], [126, 162], [24, 66], [32, 126], [168, 126], [160, 66]];
(function buildGround() {
  const put = (x, y, c, a = 1) => { const p = 3 * (y * W + x); for (let k = 0; k < 3; k++) BASE[p + k] += (c[k] - BASE[p + k]) * a; };
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    if (!inPlus(x, y)) continue;
    const road = (x >= R0 && x < R1) || (y >= R0 && y < R1);
    if (road) {
      const n = kit.noise2(x * 0.7, y * 0.7) * 0.5 + kit.hash(x, y, 3) * 0.5;
      let k = 0.85 + 0.3 * n;
      // rubber in the wheel paths of each lane
      const along = x >= R0 && x < R1 && !(y >= R0 && y < R1) ? x : y >= R0 && y < R1 && !(x >= R0 && x < R1) ? y : -1;
      if (along >= 0) { const lc = ((along - R0) % 24) - 12; if (Math.abs(Math.abs(lc) - 4.5) < 1.6) k *= 0.82 + 0.1 * kit.noise2(x * 0.2, y * 0.2); }
      put(x, y, [ASPH[0] * k, ASPH[1] * k, ASPH[2] * k]);
    } else {
      // pavement: 4 px flags with joints, a kerb line on the road side
      const jx = x % 4 === 0, jy = y % 4 === 0;
      const v = 0.9 + 0.2 * kit.hash(x >> 2, y >> 2, 7);
      put(x, y, jx || jy ? JOINT : [PAVE[0] * v, PAVE[1] * v, PAVE[2] * v]);
      const kerb = x === R0 - 1 || x === R1 || y === R0 - 1 || y === R1;
      if (kerb) put(x, y, KERB);
    }
  }
  // the yellow box: border and criss-cross hatching
  for (let y = R0 + 2; y < R1 - 2; y++) for (let x = R0 + 2; x < R1 - 2; x++) {
    const b = x === R0 + 2 || x === R1 - 3 || y === R0 + 2 || y === R1 - 3;
    const d1 = ((x + y) % 10 + 10) % 10, d2 = ((x - y) % 10 + 10) % 10;
    const h = b ? 1 : Math.max(d1 < 1 ? 0.8 : 0, d2 < 1 ? 0.8 : 0);
    if (h > 0) put(x, y, YEL, h * (0.75 + 0.25 * kit.hash(x, y, 9)));
  }
  // zebras: 3 px stripes across each arm mouth
  for (let k = 0; k < 8; k++) {
    const s0 = R0 + 1 + 6 * k;
    for (let a = s0; a < s0 + 3; a++) for (let b = 0; b < 8; b++) {
      const w = 0.6 + 0.4 * kit.hash(a, b, k);
      put(a, 64 + b, LINE, w); put(a, 120 + b, LINE, w);
      put(64 + b, a, LINE, w); put(120 + b, a, LINE, w);
    }
  }
  // stop lines on the inbound half, lane dashes on the east-west arms
  for (let a = 0; a < 24; a++) for (let b = 0; b < 2; b++) {
    put(R0 + a, 60 + b, LINE); put(96 + a, 130 + b, LINE);
    put(60 + b, 96 + a, LINE); put(130 + b, R0 + a, LINE);
  }
  for (let x = 0; x < W; x++) {
    if (x >= 60 && x < 132) continue;
    if (x % 12 < 7) { put(x, 95, LINE, 0.7); put(x, 96, LINE, 0.7); }
  }
  // a short centre line where the lanes meet the stop lines
  for (let y = 54; y < 62; y++) { put(96, y, YEL, 0.8); put(95, y + 76, YEL, 0.8); }
  // manholes and drains in the east-west arms
  for (const [cx, cy] of [[30, 84], [160, 108], [44, 108]]) for (let y = cy - 4; y <= cy + 4; y++) for (let x = cx - 4; x <= cx + 4; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d < 3.6) put(x, y, (x + y) % 2 ? [0.05, 0.05, 0.05] : [0.03, 0.03, 0.032]);
    else if (d < 4.4) put(x, y, [0.06, 0.06, 0.06], 0.6);
  }
  // street-lamp pools (used at night)
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    let s = 0;
    for (const [lx, ly] of LAMPS) { const d2 = ((x + 0.5 - lx) ** 2 + (y + 0.5 - ly) ** 2) / (30 * 30); if (d2 < 1) s += (1 - d2) ** 2; }
    const p = 3 * (y * W + x);
    LAMP[p] = 2.6 * s; LAMP[p + 1] = 2.1 * s; LAMP[p + 2] = 1.45 * s;
  }
})();

// ------------------------------------------------------------------ digits
// slots: H1 H2 in the north arm, M1 M2 in the south arm; jy is the junction end (cell y)
const SLOTS = [
  { x0: 74, y0: 3, jy: DH, pav: 67.5, edge: -8 }, { x0: 98, y0: 3, jy: DH, pav: 124.5, edge: -8 },
  { x0: 74, y0: 139, jy: 0, pav: 67.5, edge: 200 }, { x0: 98, y0: 139, jy: 0, pav: 124.5, edge: 200 },
];
// paint wear: a fixed noise field per slot
const WEAR = SLOTS.map((_, s) => {
  const a = new Float32Array(CW * CH);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const tyre = Math.abs(Math.abs(x - 1 + 0.5 - DW / 2) - 4.5) < 1.5 ? 0.25 : 0;
    a[y * CW + x] = 0.65 * kit.noise2(x * 0.55 + s * 31, y * 0.45) + 0.35 * kit.hash(x, y, s + 5) - tyre * kit.noise2(x * 0.3, y * 0.15 + s);
  }
  return a;
});
const PAINT = [0.8, 0.78, 0.72];
const GRIND = 1.6, IN = 2.8, MAXLEN = Math.max(...DIGITS.map((g) => g.len));
// the line goes down fast at first so the new numeral appears at once, then slows to finish
const revEase = (x) => 1 - (1 - kit.clamp(x)) ** 2;
const paintDur = (g) => 0.9 + 1.5 * g.len / MAXLEN;

/** The four digits HHMM of local minute index m (minutes since the epoch, local). */
function digitsOf(m, out) {
  const mm = ((m % 1440) + 1440) % 1440, h = Math.floor(mm / 60), mi = mm % 60;
  out[0] = Math.floor(h / 10); out[1] = h % 10; out[2] = Math.floor(mi / 10); out[3] = mi % 10;
  return out;
}
const dPrev = [0, 0, 0, 0], dCur = [0, 0, 0, 0], dNext = [0, 0, 0, 0];
/** Seconds since slot s last changed, given the local minute index m. */
function ageOf(s, m, sec) {
  const mm = ((m % 1440) + 1440) % 1440;
  let back = 0;
  if (s === 3) back = 0;
  else if (s === 2) back = mm % 10;
  else if (s === 1) back = mm % 60;
  else { const h = Math.floor(mm / 60); back = (h >= 20 ? h - 20 : h >= 10 ? h - 10 : h) * 60 + mm % 60; }
  return back * 60 + sec;
}

function drawDigit(s, d, reveal, cut, cutDir, age, gleamT) {
  const S = SLOTS[s], G = DIGITS[d], wear = WEAR[s];
  const erode = 0.08 + 0.24 * smoothstep(0, 6 * 3600, age), dull = 1 - 0.3 * smoothstep(0, 8 * 3600, age);
  const gleam = 1 + 0.35 * Math.exp(-gleamT / 2.5);
  const k = dull * gleam;
  for (let y = 0; y < CH; y++) {
    const cy = y - 0.5;
    // grinding: rows on the far side of the cut survive
    let keep = 1;
    if (cut !== null) keep = clamp(cutDir > 0 ? cy - cut : cut - cy, 0, 1);
    if (keep <= 0) continue;
    const gy = S.y0 - 1 + y;
    for (let x = 0; x < CW; x++) {
      const p = y * CW + x;
      let c = G.cov[p];
      if (c <= 0) continue;
      if (reveal < 1e8) { const r = clamp((reveal - G.par[p]) / 1.5, 0, 1); if (r <= 0) continue; c *= r; }
      const w = wear[p];
      const e = clamp((w - erode) * 6 + 0.5, 0, 1) * (0.85 + 0.15 * G.edge[p]);
      c *= e * keep;
      if (c <= 0) continue;
      const q = 3 * (gy * W + S.x0 - 1 + x), f = c * (0.85 + 0.15 * w);
      ALB[q] += (PAINT[0] * k - ALB[q]) * f; ALB[q + 1] += (PAINT[1] * k - ALB[q + 1]) * f; ALB[q + 2] += (PAINT[2] * k - ALB[q + 2]) * f;
    }
  }
}
/** Dotted setting-out marks along a numeral's centreline. */
function premark(s, G, a) {
  const S = SLOTS[s], pts = G.pts, ink = G.ink;
  for (let k = 1; k < pts.length; k++) {
    if (!ink[k - 1]) continue;
    const [ax, ay] = pts[k - 1], [bx, by] = pts[k], L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(L / 1.2));
    for (let j = 0; j < n; j++) {
      const u = (j + 0.5) / n, x = S.x0 + ax + (bx - ax) * u, y = S.y0 + ay + (by - ay) * u;
      // every ~3.6 px along the walk
      const along = G.acc[k - 1] + (G.acc[k] - G.acc[k - 1]) * u;
      if ((along % 3.6) > 1.2) continue;
      blob(x, y, 1.5, 0.75, 0.55, 0.12, a);
    }
  }
}
/** The scar of fresh-ground asphalt under a digit. */
function scar(s, a, cut, cutDir) {
  if (a <= 0) return;
  const S = SLOTS[s];
  for (let y = 0; y < DH + 2; y++) {
    const cy = y - 0.5;
    if (cut !== null && (cutDir > 0 ? cy - cut : cut - cy) > 0) continue;
    for (let x = -1; x < DW + 1; x++) {
      const q = 3 * ((S.y0 - 1 + y) * W + S.x0 + x), n = 0.7 + 0.3 * hash(x, y, s);
      ALB[q] += (0.05 * n - ALB[q]) * a; ALB[q + 1] += (0.048 * n - ALB[q + 1]) * a; ALB[q + 2] += (0.046 * n - ALB[q + 2]) * a;
    }
  }
}

// ------------------------------------------------------------------ people
const SHIRTS = [[0.5, 0.06, 0.05], [0.05, 0.2, 0.5], [0.45, 0.45, 0.42], [0.08, 0.35, 0.3], [0.5, 0.35, 0.05], [0.3, 0.08, 0.35], [0.1, 0.1, 0.12]];
const HAIRS = [[0.03, 0.02, 0.015], [0.2, 0.1, 0.03], [0.5, 0.38, 0.15], [0.25, 0.25, 0.25]];
const VEST = [0.85, 0.3, 0.02], HAT = [0.85, 0.85, 0.8];
const CORNERS = [[68, 68], [124, 68], [68, 124], [124, 124]];
// each corner's two pavement ends (off the raster edge)
const ENDS = [[[68, -8], [-8, 68]], [[124, -8], [200, 68]], [[68, 200], [-8, 124]], [[124, 200], [200, 124]]];
const P3 = [0, 0, 0];
function walkerAt(ax, ay, bx, by, u, out) { out[0] = ax + (bx - ax) * u; out[1] = ay + (by - ay) * u; out[2] = Math.atan2(by - ay, bx - ax); return out; }

function drawPeople(t, sx, sy, shK) {
  // ambient walkers: round a corner from one pavement to the other
  for (let cI = 0; cI < 4; cI++) for (let dir = 0; dir < 2; dir++) {
    const per = 6.5, k0 = Math.floor(t / per);
    for (let k = k0 - 3; k <= k0; k++) {
      const st = k * per + 4 * hash(cI, dir, k), v = 9 + 4 * hash(cI, k, dir + 9);
      const A = ENDS[cI][dir], B = ENDS[cI][1 - dir], C = CORNERS[cI];
      const L1 = Math.hypot(C[0] - A[0], C[1] - A[1]), L2 = Math.hypot(B[0] - C[0], B[1] - C[1]);
      const d = (t - st) * v;
      if (d < 0 || d > L1 + L2) continue;
      const off = (hash(cI, k, 3) - 0.5) * 4;
      if (d < L1) walkerAt(A[0], A[1], C[0], C[1], d / L1, P3); else walkerAt(C[0], C[1], B[0], B[1], (d - L1) / L2, P3);
      const nx = -Math.sin(P3[2]), ny = Math.cos(P3[2]);
      person(P3[0] + nx * off, P3[1] + ny * off, P3[2], 1.3, SHIRTS[(cI * 3 + k * 7 + dir) % 7], HAIRS[(k + cI) % 4], d * 0.55, sx, sy, shK);
    }
  }
  // the scramble: crowds gather at the corners and cross every way at once
  const c0 = Math.floor(t / CYCLE);
  for (let c = c0 - 1; c <= c0; c++) {
    const ws = c * CYCLE + WALK[0];
    for (let k = 0; k < 11; k++) {
      const a = Math.floor(hash(c, k, 1) * 4), b = (a + 1 + Math.floor(hash(c, k, 2) * 3)) % 4;
      const A = CORNERS[a], B = CORNERS[b], E0 = ENDS[a][Math.floor(hash(c, k, 3) * 2)], E1 = ENDS[b][Math.floor(hash(c, k, 4) * 2)];
      const ox = (hash(c, k, 5) - 0.5) * 6, oy = (hash(c, k, 6) - 0.5) * 6;
      const vIn = 11, Lin = Math.hypot(A[0] - E0[0], A[1] - E0[1]);
      const Lx = Math.hypot(B[0] - A[0], B[1] - A[1]), vx = Lx / (4.2 + 0.8 * hash(c, k, 7));
      const go = ws + 0.6 * hash(c, k, 8), tArr = go - 1 - 4 * hash(c, k, 9), tIn = tArr - Lin / vIn, tOut = go + Lx / vx;
      const Lout = Math.hypot(E1[0] - B[0], E1[1] - B[1]);
      const ax = A[0] + ox, ay = A[1] + oy, bx = B[0] + oy, by = B[1] + ox;
      let step;
      if (t < tIn || t > tOut + Lout / vIn) continue;
      if (t < tArr) { walkerAt(E0[0], E0[1], ax, ay, (t - tIn) / (tArr - tIn), P3); step = (t - tIn) * 6; }
      else if (t < go) { walkerAt(E0[0], E0[1], ax, ay, 1, P3); P3[2] = Math.atan2(B[1] - A[1], B[0] - A[0]); step = 0; }
      else if (t < tOut) { walkerAt(ax, ay, bx, by, (t - go) / (tOut - go), P3); step = (t - go) * 7; }
      else { walkerAt(bx, by, E1[0], E1[1], (t - tOut) / (Lout / vIn), P3); step = (t - tOut) * 6; }
      person(P3[0], P3[1], P3[2], 1.3, SHIRTS[(k * 5 + c) % 7 < 0 ? 0 : (k * 5 + c) % 7], HAIRS[(k + c) % 4 < 0 ? 0 : (k + c) % 4], step, sx, sy, shK);
    }
  }
}

// ------------------------------------------------------------------ the crew
const W3 = [0, 0, 0];
/** Road crew for slot s changing from dOld to dNew at time tc (u = t - tc). */
function crew(s, dOld, dNew, u, sx, sy, shK, night) {
  const S = SLOTS[s], dirOut = S.jy === 0 ? 1 : -1;            // +1: far end is further down
  const jyG = S.y0 + S.jy, fyG = S.y0 + (S.jy === 0 ? DH : 0), cx = S.x0 + DW / 2;
  const G = DIGITS[dNew], P = paintDur(G);
  // cones at the two junction-side corners
  if (u > -IN - GRIND && u < P + 3.4) {
    const sc = kit.ease.outBack(clamp((u + IN + GRIND - 0.2) / 0.5)) * (1 - kit.ease.in(clamp((u - P - 2.9) / 0.5)));
    for (const ex of [S.x0 - 1.5, S.x0 + DW + 1.5]) {
      const ey = jyG - dirOut * 2;
      blob(ex, ey, 2.4 * sc, 0.75, 0.2, 0.01, 1);
      blob(ex, ey, 1.0 * sc, 0.8, 0.8, 0.75, 1);
    }
  }
  // grinder
  const g0 = -GRIND - IN;
  if (u > g0 && u < 4.5) {
    let x, y, h, step;
    if (u < -GRIND) { const k = kit.ease.inOut((u - g0) / IN); x = S.pav + (cx - S.pav) * k; y = jyG - dirOut * 4; h = Math.atan2(0, cx - S.pav); step = (u - g0) * 7; }
    else if (u < 0) { const k = (u + GRIND) / GRIND; x = cx; y = jyG - dirOut * 4 + (fyG - jyG + dirOut * 4) * k; h = dirOut > 0 ? Math.PI / 2 : -Math.PI / 2; step = u * 9; }
    else if (u < 2) { const k = kit.ease.inOut(u / 2); x = cx + (S.pav - cx) * k; y = fyG; h = Math.atan2(0, S.pav - cx); step = u * 7; }
    else { const k = (u - 2) / 2.5; x = S.pav; y = fyG + (S.edge - fyG) * k; h = dirOut > 0 ? Math.PI / 2 : -Math.PI / 2; step = u * 7; }
    const c = Math.cos(h), sn = Math.sin(h);
    machine(x, y, h, 0, u, sx, sy, shK, night);
    void step;
    if (u > -GRIND - 0.1 && u < 0.05) {            // sparks off the drum
      for (let k = 0; k < 4; k++) { const a = h + Math.PI + (hash(k, Math.floor(u * 30), s) - 0.5) * 2.4, r = 9 + 5 * hash(k, Math.floor(u * 30), 7); dot(EM, x + c * 9 + Math.cos(a) * (r - 9), y + sn * 9 + Math.sin(a) * (r - 9), 1.1, 1, 0.6, 0.2, 0.6); }
    }
  }
  // dust from the grinder: puffs born along its pass, drifting and fading
  for (let k = 0; k < 40; k++) {
    const tb = -GRIND + GRIND * (k + 0.5) / 40, age = u - tb;
    if (age < 0 || age > 1.5) continue;
    const yb = jyG - dirOut * 4 + (fyG - jyG + dirOut * 4) * ((tb + GRIND) / GRIND) + dirOut * 6;
    const vx = (hash(s, k, 1) - 0.5) * 26, vy = (hash(s, k, 2) - 0.5) * 14 + dirOut * 4;
    const dr = 1 - Math.exp(-age * 1.6);
    const px = cx + vx * dr, py = yb + vy * dr, r = 2 + 4 * age, a = 0.4 * (1 - age / 1.5) ** 2;
    blob(px, py, r, 0.24, 0.22, 0.19, a);
  }
  // painter: walks in to the first stroke, walks the strokes, walks off
  const p0 = -IN - 0.6;
  if (u > p0 && u < P + 5) {
    let x, y, h, step;
    walkAt(G, 0, W3);
    const fx = S.x0 + W3[0], fy = S.y0 + W3[1];
    if (u < 0) {
      const k = kit.ease.inOut(clamp((u - p0) / (IN + 0.6)));
      const sx0 = S.pav, sy0 = jyG + dirOut * 10;
      x = sx0 + (fx - sx0) * k; y = sy0 + (fy - sy0) * k; h = Math.atan2(fy - sy0, fx - sx0); step = (u - p0) * 7;
      if (k > 0.85) h = h + (W3[2] - h) * (k - 0.85) / 0.15;
    } else if (u < P) {
      walkAt(G, G.len * revEase(u / P), W3);
      h = W3[2]; x = S.x0 + W3[0] - Math.cos(h) * 6.5; y = S.y0 + W3[1] - Math.sin(h) * 6.5; step = u * 10;
      dot(EM, S.x0 + W3[0], S.y0 + W3[1], 1.8, 1, 0.75, 0.45, 0.4 + 0.3 * night);
    } else {
      walkAt(G, G.len, W3);
      const lx = S.x0 + W3[0], ly = S.y0 + W3[1];
      if (u < P + 2.5) { const k = kit.ease.inOut((u - P) / 2.5); x = lx + (S.pav - lx) * k; y = ly; h = Math.atan2(0, S.pav - lx); }
      else { const k = (u - P - 2.5) / 2.5; x = S.pav; y = ly + (S.edge - ly) * k; h = dirOut > 0 ? Math.PI / 2 : -Math.PI / 2; }
      step = u * 7;
    }
    machine(x, y, h, 1, u + 0.4, sx, sy, shK, night);
    void step;
  }
}

// ------------------------------------------------------------- the gridlock
// cars that jam the box before the hour and are waved out after it.
// app, kind, colour, s where it stops, lateral, yaw, stop time, release time (s from the hour)
const GCOL = [[0.04, 0.12, 0.55], [0.78, 0.5, 0.025], [0.55, 0.55, 0.56], [0.55, 0.035, 0.03], [0.05, 0.28, 0.12], [0.6, 0.04, 0.03], [0.26, 0.28, 0.31], [0.35, 0.05, 0.3]];
const JAM = [
  // in the box
  { app: 0, kind: 'taxi', col: 1, s: 126, lat: -1, yaw: 0.12, tS: -16, tR: 7.0 },
  { app: 3, kind: 'car', col: 0, s: 133, lat: -2, yaw: -0.3, tS: -19, tR: 5.0 },
  { app: 2, kind: 'van', col: 2, s: 116, lat: 1, yaw: 0.22, tS: -18, tR: 6.0 },
  { app: 1, kind: 'car', col: 3, s: 96, lat: 0, yaw: -0.05, tS: -12, tR: 8.0 },
  { app: 0, kind: 'bike', col: 4, s: 113, lat: -9, yaw: 0.5, tS: -9, tR: 4.0 },
  // queued behind it on the east-west arms
  { app: 0, kind: 'car', col: 6, s: 100, lat: 0, yaw: 0, tS: -11, tR: 8.8 },
  { app: 0, kind: 'car', col: 4, s: 76, lat: 0, yaw: 0, tS: -8, tR: 9.6 },
  { app: 0, kind: 'bus', col: 5, s: 42, lat: 0, yaw: 0, tS: -6, tR: 10.6 },
  { app: 1, kind: 'bus', col: 5, s: 68, lat: 0, yaw: 0, tS: -9, tR: 9.2 },
  { app: 1, kind: 'car', col: 7, s: 39, lat: 0, yaw: 0, tS: -6, tR: 10.2 },
  { app: 1, kind: 'taxi', col: 1, s: 15, lat: 0, yaw: 0, tS: -4, tR: 11.0 },
];
const GL0 = -24, GL1 = 16;                       // normal traffic is replaced by the jam in this window
function jamTravel(J, u, out) {
  const db = V * V / (2 * DEC), tB = J.tS - V / DEC;
  const a0 = tB - (J.s - db) / V;
  if (u < tB) { out[0] = V * (u - a0); out[1] = 0; out[3] = 0; }
  else if (u < J.tS) { const w = u - tB; out[0] = J.s - db + V * w - 0.5 * DEC * w * w; out[1] = 1; out[3] = kit.ease.inOut((u - tB) / (J.tS - tB)); }
  else if (u < J.tR) { out[0] = J.s; out[1] = 1; out[3] = 1; }
  else { const w = u - J.tR, ta = V / ACC; out[0] = w < ta ? J.s + 0.5 * ACC * w * w : J.s + 0.5 * ACC * ta * ta + V * (w - ta); out[1] = 0; out[3] = 1 - kit.ease.inOut(clamp(w / 1.2)); }
  return out;
}

// ------------------------------------------------------------------ frame
const TR = [0, 0, 0, 0], PO = [0, 0, 0];
const HEADS = [  // signal heads: x, y, group, facing (unit vector toward drivers)
  [65, 56, 1, 0, -1], [127, 136, 1, 0, 1], [56, 127, 0, -1, 0], [136, 65, 0, 1, 0],
];
const SIG = [[1, 0.03, 0.01], [1, 0.45, 0.01], [0.1, 1, 0.35]];

export default {
  name: 'Crossroads',
  blurb: 'a city junction from above: the time is road paint, hours in the north arm, minutes in the south; a road crew grinds off and repaints the numeral each minute while the lights hold the traffic; on the hour the box gridlocks and an officer waves it clear',
  layouts: ['hub-cross'], look: 'smoke', fps: 60, brightness: 0.28, dither: true,
  frame(ctx) {
    const Gd = kit.grid(ctx), idx = Gd.idx, out = ctx.out;
    const ms = ctx.date.getTime(), tL = ms / 1000 - ctx.date.getTimezoneOffset() * 60;
    const m = Math.floor(tL / 60), sec = tL - m * 60;
    const hr = (((tL / 3600) % 24) + 24) % 24;
    // daylight: dawn 5:30-7:30, dusk 18:00-20:00
    const day = smoothstep(5.5, 7.5, hr) * (1 - smoothstep(18, 20, hr));
    const dusk = Math.max(0, 1 - Math.abs(hr - 19) / 1.2) + Math.max(0, 1 - Math.abs(hr - 6.5) / 1.2);
    const lights = 1 - smoothstep(0.3, 0.8, day);
    const th = (hr - 12) / 6 * Math.PI / 2, shL = 2.5 + 3.5 * Math.abs(Math.sin(clamp(th, -1.5, 1.5)));
    const sx = Math.sin(th) * shL, sy = -Math.cos(th) * shL, shK = 0.85 * day;

    ALB.set(BASE); SH.fill(0); LADD.fill(0); EM.fill(0);

    // ---- road paint
    digitsOf(m - 1, dPrev); digitsOf(m, dCur); digitsOf(m + 1, dNext);
    for (let s = 0; s < 4; s++) {
      const age = ageOf(s, m, sec);
      const changedNow = dPrev[s] !== dCur[s], changingNext = dNext[s] !== dCur[s];
      const S = SLOTS[s], dirOut = S.jy === 0 ? 1 : -1;
      if (changingNext && sec > 60 - GRIND) {
        // the grinder's cut moves from the junction end outward
        const k = (sec - 60 + GRIND) / GRIND;
        const cut = S.jy === 0 ? -4 + (DH + 8) * k : DH + 4 - (DH + 8) * k;
        scar(s, 0.9, cut, dirOut);
        drawDigit(s, dCur[s], 1e9, cut, dirOut, age, 99);
      } else if (changedNow && sec < 30) {
        const G = DIGITS[dCur[s]], P = paintDur(G);
        scar(s, 0.9 * (1 - smoothstep(4, 30, sec)), null, 0);
        const rev = sec >= P ? 1e9 : G.len * revEase(sec / P);
        // gleam follows the nozzle: freshly laid line is hot and glossy
        drawDigit(s, dCur[s], rev, null, 0, age, Math.max(0, sec - P * 0.5));
        // pre-marking: the crew's dotted setting-out of the whole numeral, so a
        // half-laid line never reads as another digit (a 0's first side is a 1)
        const pm = smoothstep(-0.05, 0.25, sec) * (1 - smoothstep(P, P + 0.8, sec));
        if (pm > 0) premark(s, G, pm);
      } else drawDigit(s, dCur[s], 1e9, null, 0, age, 99);
    }

    // ---- traffic
    const Hn = Math.round(tL / 3600) * 3600, hu = tL - Hn;
    const c = Math.floor(tL / CYCLE);
    for (let app = 0; app < 4; app++) for (let cc = c - 2; cc <= c + 1; cc++) {
      for (const v of bucket(app, cc)) {
        const da = v.a0 - Hn;
        if (da > GL0 - 6 && da < GL1) continue;
        travel(v, tL, TR);
        const route = ROUTES[app][v.turn];
        if (TR[0] < -20 || TR[0] > route.total + 20) continue;
        pose(route, TR[0], PO);
        const nx = -Math.sin(PO[2]), ny = Math.cos(PO[2]);
        vehicle(v.kind, PO[0] + nx * v.lat, PO[1] + ny * v.lat, PO[2], v.col, lights, TR[1], sx, sy, shK);
      }
    }
    if (hu > GL0 - 4 && hu < GL1 + 8) {
      for (let j = 0; j < JAM.length; j++) {
        const J = JAM[j];
        jamTravel(J, hu, TR);
        const route = ROUTES[J.app][0];
        if (TR[0] < -20 || TR[0] > route.total + 20) continue;
        pose(route, TR[0], PO);
        const k = TR[3], h = PO[2] + J.yaw * k, lat = J.lat * k + (J.kind === 'bike' ? 7.5 * (1 - k) : 0);
        const nx = -Math.sin(PO[2]), ny = Math.cos(PO[2]);
        vehicle(KIND[J.kind], PO[0] + nx * lat, PO[1] + ny * lat, h, GCOL[J.col], lights, TR[1], sx, sy, shK);
        // horns: blasts from the stuck cars' bonnets
        if (hu > -7 && hu < J.tR - 0.3 && J.kind !== 'bike') {
          for (let b = 0; b < 3; b++) {
            const per = 1.3 + 0.7 * hash(j, 1, 2), ph = (hu + 2 * hash(j, b, 3)) / per, f = ph - Math.floor(ph);
            if (hash(j, Math.floor(ph), b) < 0.45 || f > 0.5) continue;
            const hl = KIND[J.kind].hl, fx = PO[0] + nx * lat + Math.cos(h) * (hl + 1), fy = PO[1] + ny * lat + Math.sin(h) * (hl + 1);
            ring(fx, fy, 2 + 14 * f, 0.9, 1, 0.8, 0.35, 0.5 * (1 - 2 * f));
          }
        }
      }
      // the officer: steps into the box, faces each car in turn and waves it out
      if (hu > -1 && hu < 15) {
        const tx = 96, ty = 95;
        let x, y, h, step = 0;
        if (hu < 2.5) { const k = kit.ease.inOut((hu + 1) / 3.5); x = 68 + (tx - 68) * k; y = 68 + (ty - 68) * k; h = Math.PI / 4; step = hu * 7; }
        else if (hu < 12) {
          x = tx; y = ty;
          // turn to whichever car is next to go
          let nextJ = null;
          for (const J of JAM) if (J.tR > hu - 0.3 && (!nextJ || J.tR < nextJ.tR)) nextJ = J;
          const dir = nextJ ? [0, Math.PI, Math.PI / 2, -Math.PI / 2][nextJ.app] + Math.PI : 0;
          h = dir;
        } else { const k = kit.ease.inOut((hu - 12) / 3); x = tx + (124 - tx) * k; y = ty + (124 - ty) * k; h = Math.PI / 4; step = hu * 7; }
        // white gloves sweep: the waving arm
        if (hu > 2.5 && hu < 12) {
          const wv = Math.sin(hu * 7) * 0.9, a = h + Math.PI / 2 + wv;
          dot(EM, x + Math.cos(a) * 7.5, y + Math.sin(a) * 7.5, 2.2, 0.9, 0.9, 0.85, 0.9);
          dot(EM, x - Math.cos(h + Math.PI / 2) * 6.5, y - Math.sin(h + Math.PI / 2) * 6.5, 2, 0.9, 0.9, 0.85, 0.6);
        }
        blob(x, y, 7.5, 0.02, 0.02, 0.025, 0.85);             // a dark ring keeps him off the hatching
        blob(x, y, 5.2, 0.55, 0.85, 0.05, 1);                 // hi-vis tabard
        blob(x, y, 2.6, 0.95, 0.95, 0.92, 1);                 // white helmet
        void step;
        // whistle flashes
        if (hu > 2.5 && hu < 12 && (hu * 2.2) % 1 < 0.25) ring(x, y, 7 + 3 * ((hu * 2.2) % 1) * 4, 0.8, 0.9, 0.95, 1, 0.35);
      }
    }

    // ---- people and the road crew
    drawPeople(tL, sx, sy, shK);
    for (let s = 0; s < 4; s++) {
      if (dNext[s] !== dCur[s] && sec > 60 - GRIND - IN - 0.7) crew(s, dCur[s], dNext[s], sec - 60, sx, sy, shK, lights);
      if (dPrev[s] !== dCur[s] && sec < 12) crew(s, dPrev[s], dCur[s], sec, sx, sy, shK, lights);
    }

    // ---- signals
    const flash = hu > 0 && hu < 10;
    for (const [x, y, g, fx, fy] of HEADS) {
      let st = light(g, tL);
      // N-S is held at red while a crew is out on the paint
      const crewOut = (sec > 60 - GRIND - IN - 1 || sec < 8);
      if (g === 1 && crewOut && st === 2) st = 0;
      let col = SIG[st === 2 ? 2 : st === 1 ? 1 : 0], a = 1;
      if (flash) { col = SIG[1]; a = (hu * 1.6) % 1 < 0.55 ? 1 : 0.05; }
      blob(x, y, 2.4, 0.03, 0.03, 0.035, 1);
      dot(EM, x + fx * 1.2, y + fy * 1.2, 1.6, col[0], col[1], col[2], 0.9 * a);
      dot(LADD, x + fx * 6, y + fy * 6, 7, col[0], col[1], col[2], 0.6 * a * (0.3 + 0.7 * lights));
    }
    // pedestrian signals glow green at the corners during the scramble
    const cyc = ((tL % CYCLE) + CYCLE) % CYCLE, walk = cyc >= WALK[0] && cyc < WALK[1] && !flash;
    for (const [x, y] of CORNERS) dot(EM, x + (x < 96 ? -2.5 : 2.5), y + (y < 96 ? -2.5 : 2.5), 1.2, walk ? 0.2 : 1, walk ? 1 : 0.1, walk ? 0.5 : 0.03, 0.5);
    // street lamps
    for (const [x, y] of LAMPS) { blob(x, y, 1.6, 0.04, 0.04, 0.045, 1); dot(EM, x, y, 2.2, 1, 0.82, 0.55, 0.05 + 0.9 * lights); }

    // ---- light it
    const skyR = 0.1 + 0.9 * day + 0.25 * dusk, skyG = 0.12 + 0.86 * day + 0.08 * dusk, skyB = 0.2 + 0.75 * day - 0.05 * dusk;
    const sun = 0.6;
    const dim = 1.9 * (1 - 0.5 * ctx.night);   // exposure: keep cars and paint above the 5-panel crush
    for (let p = 0; p < N; p++) {
      const i = idx[p];
      if (i < 0) continue;
      const q = 3 * p, sh = 1 - sun * SH[p] * day;
      const lr = skyR * sh + LAMP[q] * lights + LADD[q], lg = skyG * sh + LAMP[q + 1] * lights + LADD[q + 1], lb = skyB * sh + LAMP[q + 2] * lights + LADD[q + 2];
      out[3 * i] = (ALB[q] * lr + EM[q]) * dim;
      out[3 * i + 1] = (ALB[q + 1] * lg + EM[q + 1]) * dim;
      out[3 * i + 2] = (ALB[q + 2] * lb + EM[q + 2]) * dim;
    }
  },
};
