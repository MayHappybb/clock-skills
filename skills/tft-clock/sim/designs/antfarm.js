// Formicarium: an ant farm, a slice of layered sand between two panes of
// glass, seen side-on, and the time is the colony's own architecture. The
// hours and minutes are the nest: each numeral is a system of galleries the
// ants have dug, an even round bore with chambers where a gallery ends, the
// counters left solid sand, each digit hung from the surface by its own
// wandering shaft. The hours lie deeper than the minutes, as older workings
// do; the main shaft between them threads two round seed stores, the colon;
// below the minutes is the queen's hall, where she lies with her larvae.
//
// Always alive: a big worker patrols every digit's galleries, stopping and
// turning; traffic runs the main shaft with grains; a forager drags a crumb
// in along the surface and down to the queen; an attendant feeds her; grains
// trickle down; the grass on the surface moves in the draught.
//
// Minute turn: before :59 porters fetch grains from the spoil heap, walk in
// along the surface and go down into the digit that is about to change, and
// the colony backfills it, the whole gallery packing evenly at once until it
// is solid sand (gone before :00). After :00 they dig the new digit: a thin
// pilot tunnel opened from twelve faces at once along its whole outline, then
// widened to full bore, and the porters carry the spoil up its shaft and
// along the surface to the heap. A tunnel only ever narrows or widens along
// its whole length, so a digit is never a partial that reads as another.
//
// The hour: a shower comes on as the hour turns, the water runs down every
// entrance and floods the whole nest, galleries and digits, along their
// length (the nurses carry the larvae up to the surface), drains away into
// the sand, and after the rain, as in life, the nuptial flight: winged queens
// and males pour out of the entrances and flutter up and away across the
// glass, in front of the nest.
//
// Pair: dark umber ink on pale sand, the two colours of the thing itself:
// pale sand with dark grains, as a 1-bit print or a mono module would show
// it. The sand is a sparse stipple, denser with depth in poured layers with
// dotted lines between them; the tunnels are clean ground, and round a digit
// the sand is packed (a solid wall, a band of packed grains, a clear moat), so
// the digits are the boldest thing on the glass; side passages get a lighter,
// dotted wall. The ants are solid ink sprites drawn by hand in profile at 8
// headings, each with a 1 px ground outline so it reads on any sand; in the
// digits' full-bore galleries they are drawn bigger. Night: the backlight
// dims and the ants slow to half pace (their own clock, warped, so every
// position stays a closed form of the time).
//
// Cost: the frame is composed in a 1-bit map (one byte a pixel here, a bit
// on the device) from a static base, the four glyph distance tables (q per
// pixel, compared with the bore) and ~35 sprites, then written to the frame
// buffer in the two colours.
import { rand, noise, sin as ksin, clamp, clockFields } from '../js/kit.js';
import { GLYPHS, DW, DH } from './antfarm-glyphs.js';
import { WORKER_S, BIG_S, QUEEN_S, ALATE, LARVA, CRUMB, GRAIN } from './antfarm-art.js';

const W = 160, H = 80, TAU = Math.PI * 2;
// kit.sin returns NaN for a tiny negative angle (the table index wraps to 1024 and reads past the end); there sin is 0
const sin = (a) => { const v = ksin(a); return v === v ? v : 0; };
const INK = 0x2a1a0c, GROUND = 0xe2c48c;
const c565 = (c) => (((c >> 19) & 31) << 11) | (((c >> 10) & 63) << 5) | ((c >> 3) & 31);
const INK5 = c565(INK), GND5 = c565(GROUND);

// ------------------------------------------------------------ the farm (built at load)

const SLOTS = [[0, 30], [31, 30], [73, 15], [104, 15]];
const SURF = new Int16Array(W);
for (let x = 0; x < W; x++) SURF[x] = 11 + Math.round(noise(x / 9, 3) * 1.6 - 0.8);
// the spoil heap beside the main entrance
const HEAP = (x) => Math.max(0, 4.4 - Math.abs(x - 76) * 0.55);
for (let x = 67; x < 86; x++) SURF[x] -= Math.round(HEAP(x));

const SAND = new Uint8Array(W * H);     // the sand's own grains: 1 ink
const BASE = new Uint8Array(W * H);     // 0 sand, 1 packed wall, 2 open (air, tunnels)
const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x;
  if (y < SURF[x]) { BASE[i] = 2; continue; }
  // pale sand, as the farms are sold: a sparse stipple of dark grains, denser with depth in wavy layers,
  // with a dotted line where one layer was poured on another (kept out of the digits' boxes)
  const yb = y + (noise(x / 23, 7) - 0.5) * 3.5 + (noise(x / 6, 8) - 0.5) * 1.2;
  const band = yb < 24 ? 0 : yb < 37 ? 1 : yb < 50 ? 2 : yb < 63 ? 3 : 4;
  let d = [0.07, 0.11, 0.15, 0.2, 0.25][band];
  if (y < 12 && HEAP(x) > 0) d = 0.3;             // loose spoil
  if (y === SURF[x]) d = 1;                         // the surface crust
  SAND[i] = rand(x, y, 6) < d ? 1 : 0;
  const inDigit = SLOTS.some(([sx, sy]) => x >= sx - 2 && x < sx + DW + 2 && y >= sy - 2 && y < sy + DH + 2);
  for (const L of [37, 50, 63]) if (!inDigit && Math.abs(yb - L) < 0.5 && x % 3 !== 2) SAND[i] = 1;
}

/** A route at 1 px steps along a polyline: x, y, heading. */
function route(pts) {
  const fine = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 4));
    for (let k = 0; k < n; k++) fine.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  fine.push(pts[pts.length - 1]);
  const arc = [0];
  for (let i = 1; i < fine.length; i++) arc.push(arc[i - 1] + Math.hypot(fine[i][0] - fine[i - 1][0], fine[i][1] - fine[i - 1][1]));
  const len = arc[arc.length - 1], n = Math.floor(len) + 1;
  const RX = new Float32Array(n), RY = new Float32Array(n), RH = new Float32Array(n);
  for (let k = 0, i = 0; k < n; k++) {
    while (i < fine.length - 2 && arc[i + 1] < k) i++;
    const u = arc[i + 1] > arc[i] ? clamp((k - arc[i]) / (arc[i + 1] - arc[i]), 0, 1) : 0;
    RX[k] = fine[i][0] + (fine[i + 1][0] - fine[i][0]) * u;
    RY[k] = fine[i][1] + (fine[i + 1][1] - fine[i][1]) * u;
  }
  for (let k = 0; k < n; k++) {
    const a = Math.max(0, k - 2), c = Math.min(n - 1, k + 2);
    RH[k] = Math.atan2(RY[c] - RY[a], RX[c] - RX[a]);
  }
  return { RX, RY, RH, n, len: n - 1 };
}

// static galleries: wandering passages [points, r] and chambers (round, or domed with a flat floor)
const MAIN = [[66, 4], [64.6, 10], [67.6, 16], [64.8, 23], [67.4, 30], [66.5, 37], [66.5, 43], [66.5, 56], [65.6, 64], [67, 70], [71, 73.6], [82, 74.2], [94, 73.2], [106, 74.6]];
const PASSAGES = [[MAIN, 1.2]];
const ROUND = [[66.5, 43, 4.4], [66.5, 56, 4.4]];                 // the two seed stores: the colon
const DOMES = [[125, 78, 21, 11]];                                // the queen's hall, with her brood  [cx, floor, rx, ry]
function segD(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  return Math.hypot(px - ax - u * dx, py - ay - u * dy);
}
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const px = x + 0.5, py = y + 0.5, i = y * W + x;
  let e = 1e9;
  for (const [pts, r] of PASSAGES)
    for (let k = 0; k + 1 < pts.length; k++) e = Math.min(e, segD(px, py, ...pts[k], ...pts[k + 1]) - r);
  for (const [cx, cy, r] of ROUND) e = Math.min(e, Math.hypot(px - cx, py - cy) - r);
  for (const [cx, fl, rx, ry] of DOMES) {
    const q = Math.hypot((px - cx) / rx, Math.min(0, py - fl) / ry);
    e = Math.min(e, Math.max((q - 1) * ry, py - fl));
  }
  if (e < 0) BASE[i] = 2; else if (e < 1 && BASE[i] === 0) BASE[i] = ((x + y) & 1) ? 1 : 3;   // a dotted wall: lighter than the digits'
}
const R_MAIN = route(MAIN);

// how far water poured in at the entrances has to run to reach each open pixel of the static nest (px, 255 = never)
const FLOW = new Uint8Array(W * H).fill(255);
{
  const q = [];
  for (let x = 0; x < W; x++) { const i = SURF[x] * W + x; if (BASE[i] === 2) { FLOW[i] = 0; q.push(i); } }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % W, d = FLOW[i] + 1;
    for (const j of [i - W, i + W, x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1]) {
      if (j < 0 || j >= W * H || BASE[j] !== 2 || FLOW[j] !== 255 || (j / W | 0) < SURF[j % W] || d > 254) continue;
      FLOW[j] = d; q.push(j);
    }
  }
}
// the rescue: from each larva's place in the queen's hall, along its floor, up the main shaft and out onto the surface
const LARVAE = [[139, 75], [144, 76]];
const R_RESCUE = LARVAE.map(([x, y], k) => route([[x, 75.5], [106, 75], ...MAIN.slice().reverse(), [66, SURF[66] - 3], [52 - k * 9, SURF[52 - k * 9] - 3]]));

// pebbles: two solid angular stones away from the digits, with a clear margin; roots: fine wandering lines with rootlets
const PEBBLES = [[[27, 19], [31, 17], [35, 18], [36, 21], [32, 23], [27, 22]], [[146, 64], [149, 62], [153, 63], [154, 66], [150, 68], [146, 67]]];
for (const P of PEBBLES) {
  const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
  for (let y = Math.min(...ys) - 2; y <= Math.max(...ys) + 2; y++) for (let x = Math.min(...xs) - 2; x <= Math.max(...xs) + 2; x++) {
    let inside = false, e = 1e9;
    for (let k = 0, j = P.length - 1; k < P.length; j = k++) {
      const [ax, ay] = P[k], [bx, by] = P[j];
      if ((ay > y + 0.5) !== (by > y + 0.5) && x + 0.5 < ((bx - ax) * (y + 0.5 - ay)) / (by - ay) + ax) inside = !inside;
      e = Math.min(e, segD(x + 0.5, y + 0.5, ax, ay, bx, by));
    }
    const i = y * W + x;
    if (inside || e < 0.75) SAND[i] = 1; else if (e < 1.8) SAND[i] = 0;          // solid stones with a clear margin
  }
}
const ROOTS = [[8, 4, 15], [140, 3, 28], [153, 6, 18], [98, 9, 3]];
for (const [x0, seed, len] of ROOTS) {
  let x = x0 + 0.5;
  for (let y = SURF[x0] + 1, n = 0; y < SURF[x0] + len && y < H; y++, n++) {
    x += (noise(y / 5, seed) - 0.5) * 1.1;
    const xi = Math.floor(x), i = y * W + xi;
    if (BASE[i] !== 0) continue;
    SAND[i] = 1; SAND[i - 1] = 0; SAND[i + 1] = 0;
    if (n % 7 === 4) for (let k = 1; k <= 3; k++) { const j = (y + k) * W + xi + (seed & 1 ? k : -k); if (BASE[j] === 0) SAND[j] = 1; }
  }
}
// grass: [x, height, lean]
const GRASS = [];
for (const [x0, n] of [[2, 4], [21, 3], [52, 4], [99, 3], [133, 4], [156, 3]])
  for (let k = 0; k < n; k++) {
    const x = x0 + k * 2 + (rand(x0, k, 9) < 0.5 ? 0 : 1);
    if (x < W - 1) GRASS.push([x, 4 + Math.floor(rand(x0, k, 2) * 5), Math.round((rand(x0, k, 3) - 0.5) * 3)]);
  }

// ------------------------------------------------------------ time

// The ants' own clock: they walk at half speed at night, and this warped
// time keeps every position a closed form of the wall clock.
function antTime(date) {
  const local = date.getTime() / 1000 - date.getTimezoneOffset() * 60;
  const day = Math.floor(local / 86400), s = local - day * 86400;
  let I;
  if (s < 25140) I = s;
  else if (s < 25200) I = 25140 + (s - 25140) - ((s - 25140) ** 2) / 120;
  else if (s < 82800) I = 25170;
  else if (s < 82860) I = 25170 + ((s - 82800) ** 2) / 120;
  else I = 25200 + (s - 82860);
  return local - 0.5 * (day * 28740 + I);
}

// ------------------------------------------------------------ drawing into the 1-bit map

const M = new Uint8Array(W * H);
let blitN = 0;

/**
 * Plot a sprite. Its `clr` pixels are ground: for haloed sprites (`soft`, the ants) an outline that clears
 * only the sand behind it, so walls and other ants stay; for the rest, forced ground (a larva's pale body).
 * `show` < 1 lets only that share of its ink through, by the ordered screen, and drops the outline: an ant
 * coming out of, or going into, the dust of a gallery being dug or packed.
 */
function put(spr, x, y, show = 1) {
  const ink = spr.ink, clr = spr.clr, th = show * 64, soft = spr.soft;
  if (show >= 1)
    for (let k = 0; k < clr.length; k += 2) {
      const xx = x + clr[k], yy = y + clr[k + 1];
      if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
      const i = yy * W + xx;
      if (!soft || M[i] === 0) M[i] = 3;
    }
  for (let k = 0; k < ink.length; k += 2) {
    const xx = x + ink[k], yy = y + ink[k + 1];
    if (xx >= 0 && xx < W && yy >= 0 && yy < H && (show >= 1 || BAYER[(yy & 7) * 8 + (xx & 7)] < th)) M[yy * W + xx] = 1;
  }
  blitN += (ink.length + clr.length) >> 1;
}
function line(x0, y0, x1, y1) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  for (;;) {
    if (x0 >= 0 && x0 < W && y0 >= 0 && y0 < H) M[y0 * W + x0] = 1;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
    blitN++;
  }
}

// the flood at the hour: water in a tunnel is wavy lines of glints running along (a seventh ink, so a flooded
// gallery still reads open), drained by an ordered dissolve
const FL = { on: false, front: 0, drain: 0, ap: 0, flow: 0 };
const RIP = new Int8Array(W);
const wetInk = (x, y) => ((y + RIP[x]) & 3) === 0 && (x + FL.flow + y * 5) % 7 < 4 && BAYER[(y & 7) * 8 + (x & 7)] >= FL.drain * 64;
const isDry = (x, y) => BAYER[(y & 7) * 8 + (x & 7)] < FL.drain * 64;

/**
 * Carve a digit's galleries at bore fraction k; `pilot` < 1 digs only the stretches round twelve faces, spread evenly along the whole outline.
 * Round a dug gallery the sand is packed: a solid 1 px wall, a band of half-packed grains, then a clear moat,
 * all scaled with the bore, so the digit is the boldest thing on the glass. While the ants backfill, the
 * inside edge is a fringe of fresh loose grains.
 */
function dig(gl, ox, oy, k, pilot, packing = false) {
  const Q = gl.Q, A = gl.A, K = (k * 64) | 0;
  const K1 = K + Math.min(18, K), K2 = K + Math.min(40, K >> 1), K3 = K + Math.min(54, K >> 1), K0 = packing ? K - 14 : K;
  const seg = gl.len / 12, half = pilot * seg * 0.5 + 0.5;
  for (let y = 0; y < DH; y++) {
    const yy = oy + y;
    for (let x = 0; x < DW; x++) {
      const xx = ox + x, j = y * DW + x, q = Q[j];
      if (q >= K3) continue;
      if (pilot < 1) { const a = A[j] % seg - seg * 0.5; if (a > half || a < -half) continue; }
      const i = yy * W + xx;
      if (q < K) {
        if (q > K0 && ((q - K0) * 64) / (K - K0) > BAYER[(yy & 7) * 8 + (xx & 7)]) { M[i] = 0; continue; }
        M[i] = FL.on && Math.abs(A[j] - FL.ap) < FL.front && wetInk(xx, yy) ? 1 : 2;
      } else if (M[i] === 0) M[i] = q < K1 ? 1 : q < K2 ? (((xx + yy) & 1) ? 1 : 3) : 3;
    }
  }
}
/** The centre of a slot's shaft at row y: narrow, wandering as real ones do, arriving straight at the port. */
function shaftX(x, y0, y1, y, seed) {
  const len = y1 - y0, u = (y - y0) / len;
  return x + 1.4 * sin(u * 5 + seed) * (1 - u) * Math.min(1, len / 10);
}
function shaft(x, y0, y1, k, seed, pilot) {
  const r = 1.3 * k, rw = r + Math.min(1, r);
  for (let yy = y0; yy < y1; yy++) {
    if (pilot < 1 && ((yy - y0) % 6) > pilot * 6) continue;
    const cx = shaftX(x, y0, y1, yy, seed);
    for (let xx = Math.floor(cx - rw); xx <= cx + rw; xx++) {
      const d = Math.abs(xx + 0.5 - cx), i = yy * W + xx;
      if (d < r) M[i] = FL.on && yy - y0 < FL.front && wetInk(xx, yy) ? 1 : 2;
      else if (d < rw && M[i] === 0) M[i] = ((xx + yy) & 1) ? 1 : 3;
    }
  }
}

// legs side per heading (the ant stands on that wall): E SE S SW W NW N NE
const LEG = [[0, 1], [-1, 1], [-1, 0], [1, 1], [0, 1], [-1, 1], [1, 0], [1, 1]];
const dirOf = (h) => { let d = Math.round(h / (TAU / 8)) % 8; return d < 0 ? d + 8 : d; };
/** An ant on a gallery's centre line (x, y), heading h, gait from distance walked; `load` is carried in the jaws. */
function ant(x, y, h, walked, load = null, onFloor = true, show = 1) {
  const d = dirOf(h), big = onFloor === 2, spr = (big ? BIG_S : WORKER_S)[d][Math.floor(walked / (big ? 3 : 2.5)) & 1];
  // in a narrow passage the ant keeps to the floor it walks on; in a full-bore gallery it walks the middle
  const o = big ? 0 : onFloor ? 1 : 0;
  const ax = Math.round(x - 0.5 + LEG[d][0] * o), ay = Math.round(y - 0.5 + LEG[d][1] * o);
  put(spr, ax, ay, show);
  if (load) put(load, ax + Math.round(Math.cos(h) * 7), ay + Math.round(Math.sin(h) * 7) - (d === 0 || d === 4 ? 1 : 0));
}
function onRoute(R, s, dirSign, walked, load, ox = 0, oy = 0, show = 1) {
  const k = clamp(Math.round(s), 0, R.n - 1);
  ant(ox + R.RX[k], oy + R.RY[k], R.RH[k] + (dirSign < 0 ? Math.PI : 0), walked, load, ox ? 2 : true, show);
}

const pingpong = (s, L) => { const m = ((s % (2 * L)) + 2 * L) % (2 * L); return m < L ? [m, 1] : [2 * L - m, -1]; };
/** Distance walked by a stop-and-go ant: speed v px/s on average, a pause every P s. */
const walk = (T, v, P, ph) => v * (T - (P / TAU) * sin((TAU * T) / P + ph));

// ------------------------------------------------------------ porters: the sand's way out and back in

const HEAP_X = 76;
/** A slot's shaft as numbers: port (x, y), top row, the entrance's x, and the side the heap lies on. */
function shaftOf(s, d) {
  const gl = GLYPHS[d], [ox, oy] = SLOTS[s], px = ox + gl.port[0], y1 = oy + gl.port[1] + 1, y0 = SURF[Math.floor(px)] - 1;
  return { px, y0, y1, seed: s * 2.3, xe: shaftX(px, y0, y1, y0, s * 2.3), side: s < 2 ? 1 : -1 };
}
/**
 * A porter walking the surface from one edge to the other, passing a digit's
 * entrance at time 0 (u is the time since). Inbound porters (before a turn)
 * pick a grain off the spoil heap and drop it down the shaft; outbound ones
 * (after) pick one up at the entrance and drop it on the heap.
 */
function porter(sh, u, inbound) {
  const dir = inbound ? -sh.side : sh.side, d = stride(u), x = sh.xe + dir * d;
  if (x < -8 || x > W + 8) return;
  const xi = clamp(Math.round(x), 3, W - 4), slope = (SURF[xi + 3] - SURF[xi - 3]) / 6;
  const pastHeap = sh.side > 0 ? x > HEAP_X : x < HEAP_X;
  const loaded = !pastHeap && (inbound ? u < 0 : u > 0);
  ant(x, SURF[xi] - 3.5, Math.atan2(slope * dir, dir), d, loaded ? GRAIN : null, false);
  if (inbound && u > 0) {               // the dropped grain rattles down the shaft
    const y = Math.round(sh.y0 + 1 + u * 40);
    if (y < sh.y1) M[y * W + Math.round(shaftX(sh.px, sh.y0, sh.y1, y, sh.seed) - 0.5)] = 1;
  }
}
/** Grains flicked out of an entrance while the digit below is dug: little arcs toward the heap. */
function spoil(sh, u, seed) {
  for (let k = 0; k < 14; k++) {
    const t = u - k * 0.17;
    if (t < 0 || t > 0.55) continue;
    const vx = sh.side * (14 + rand(k, seed, 7) * 22), vy = -(26 + rand(k, seed, 8) * 18);
    const x = Math.round(sh.xe + vx * t), y = Math.round(SURF[clamp(Math.round(sh.xe), 0, W - 1)] - 2 + vy * t + 90 * t * t);
    if (x >= 0 && x < W && y >= 0 && y < SURF[x] - 1) { M[y * W + x] = 1; blitN++; }
  }
}
const PV = 9;                                   // porters' pace, px/s
const stride = (u) => PV * (u - 0.4 * sin(u * 2.1));   // stop-and-go along the way

// ------------------------------------------------------------ the hour: the nuptial flight

/** The shower: streaks of rain across the open air above the sand, splashing on the crust. */
function rain(sec) {                    // sec: from the shower's start, 3 s before the hour
  const n = Math.round(46 * clamp(Math.min(sec / 1.2, (6.5 - sec) / 1.5), 0, 1));
  for (let k = 0; k < n; k++) {
    const per = 0.22 + rand(k, 1) * 0.08, ph = (sec / per + rand(k, 2)) % 1, x0 = Math.floor(rand(k, 3) * (W + 8));
    const y = Math.floor(ph * 16) - 3, x = x0 - (y >> 2);
    for (let j = 0; j < 3; j++) {
      const yy = y + j, xx = x - (j >> 1);
      if (yy >= 0 && xx >= 0 && xx < W && yy < SURF[xx] - 1) M[yy * W + xx] = 1;
    }
    if (y + 3 >= SURF[clamp(x, 0, W - 1)] - 1 && x > 0 && x < W - 1) { M[(SURF[x] - 2) * W + x - 1] = 1; M[(SURF[x] - 2) * W + x + 1] = 1; }
  }
  blitN += n * 4;
}

const N_ALATE = 18;
function flight(sec, f, sh) {
  for (let i = 0; i < N_ALATE; i++) {
    const t0 = 0.3 + i * 0.62, tau = sec - t0;
    if (tau < 0 || tau > 5.4) continue;
    const from = i % 3 === 0 ? 67 : i % 3 === 1 ? 152 : sh[i % 2].xe;
    const ys = SURF[clamp(Math.round(from), 0, W - 1)];
    const flap = (Math.floor(sec * 20) + i) & 1;
    if (tau < 0.6) { put(ALATE[1], Math.round(from - 0.5), Math.round(ys + 2 - tau * 12)); continue; }
    const u = tau - 0.6, D = 4.8, side = rand(i, 3) < 0.5 ? -1 : 1, A = 16 + rand(i, 4) * 24;
    const x = from + side * (13 * u + 6 * sin(2.3 * u + i));
    const y = ys - 5 + A * sin((Math.PI * u) / D) - 48 * (u / D) * (u / D);
    put(ALATE[flap], Math.round(x - 0.5), Math.round(y - 0.5));
  }
}

// ------------------------------------------------------------ the minute's jobs

const BF0 = 58.5, BF1 = 59.92;       // backfill: the old galleries packed evenly
const PILOT = 0.45, DG1 = 1.45;      // dig: pilot along the whole outline, then widened

function slotState(cur, prv, nxt, s, sec) {
  if (nxt !== cur && sec >= BF0) { const u = clamp((sec - BF0) / (BF1 - BF0), 0, 1); return [1 - u * u * u, 1, -1]; }
  if (prv !== cur && sec < DG1) {
    if (sec < PILOT) { const u = sec / PILOT; return [0.3, u * (2 - u), 1]; }
    const u = (sec - PILOT) / (DG1 - PILOT);
    return [0.3 + 0.7 * (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u)), 1, 1];
  }
  return [1, 1, 0];
}

export default {
  name: 'Formicarium',
  blurb: 'An ant farm: the time is the tunnels the colony has dug. Each minute they backfill a digit and dig the next; at the hour, the nuptial flight.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, sec = f.sec, date = ctx.date;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    const T = antTime(date);
    const pf = clockFields(new Date(date.getTime() - 60000)), nf = clockFields(new Date(date.getTime() + 60000));
    const cur = f.hh + f.mm, prv = pf.hh + pf.mm, nxt = nf.hh + nf.mm;
    blitN = 0;
    M.set(BASE);

    // ---- the hour: a shower, the nest floods and drains, then the nuptial flight
    const hour = pf.h !== f.h && sec < 18;
    FL.on = hour && sec > 1.6 && sec < 12;
    if (FL.on) {
      const u = sec - 1.6;
      FL.front = u * 30;
      FL.drain = clamp((sec - 8.8) / 2.6, 0, 1);
      FL.flow = Math.floor(T * 9) % 7;
      for (let x = 0; x < W; x++) RIP[x] = Math.round(sin(x * 0.55 + T * 5) * 1.2);
      const fr = Math.min(254, FL.front);
      for (let i = W * 11; i < W * H; i++) {
        if (BASE[i] === 2 && FLOW[i] < fr) { const x = i % W, y = (i / W) | 0; if (wetInk(x, y)) M[i] = 1; }
      }
      g.cost.box += W * H * 2;
    }

    // ---- the digits: galleries and their shafts
    const st = [];
    for (let s = 0; s < 4; s++) {
      const gl = GLYPHS[+cur[s]], [ox, oy] = SLOTS[s];
      const [k, pilot, phase] = slotState(cur[s], prv[s], nxt[s], s, sec);
      const packing = phase < 0;
      st.push([k, pilot, phase]);
      if (k <= 0.02) continue;
      const px = ox + gl.port[0], y0 = SURF[Math.floor(px)] - 1, y1 = oy + gl.port[1] + 1;
      if (FL.on) {
        const f0 = FL.front;
        shaft(px, y0, y1, k, s * 2.3, pilot);
        FL.front = f0 - (y1 - y0); FL.ap = gl.A[Math.round(gl.port[1]) * DW + Math.round(gl.port[0])];
        dig(gl, ox, oy, k, pilot, packing);
        FL.front = f0;
      } else {
        dig(gl, ox, oy, k, pilot, packing);
        shaft(px, y0, y1, k, s * 2.3, pilot);
      }
    }

    // ---- the surface: grass in the draught, the sugar cube
    for (const [x, h, lean] of GRASS) {
      const y0 = SURF[x] - 1, tip = lean + Math.round(sin(T * 0.8 + x * 0.6) * 1.1);
      line(x, y0, x + (tip >> 1), y0 - (h >> 1));
      line(x + (tip >> 1), y0 - (h >> 1), x + tip, y0 - h);
    }
    put(CRUMB, 31, SURF[31] - 2);

    // ---- the queen's hall: the queen, her larvae, an attendant feeding her
    for (let k = 0; k < 2; k++) {
      const R = R_RESCUE[k], t0 = 2.2 + k * 0.5, t1 = 12 + k * 0.6;
      if (hour && sec > t0 && sec < t1 + R.len / 8) {
        // out with the larva at 8 px/s, wait on the surface, then home again
        const w = Math.min(R.len, (sec - t0) * 8), back = sec > t1 ? Math.min(R.len, (sec - t1) * 8) : 0;
        onRoute(R, w - back, back > 0 ? -1 : 1, w + back, LARVA);
      } else put(LARVA, LARVAE[k][0], LARVAE[k][1] - (k === 1 && sin(T * 0.7) > 0.6 ? 1 : 0));
    }
    const qb = sin(T * 0.9) > 0.2 ? 1 : 0;
    put(QUEEN_S[1][qb], 126, 74);
    {
      const w1 = walk(T, 0.8, 5, 0), [a1] = pingpong(w1, 3);
      ant(109 + a1, 75.5, 0, w1 * 3);              // feeding her
    }

    // ---- residents of the digits: one to a digit, pausing, turning; buried while their gallery is packed or dug
    for (let s = 0; s < 4; s++) {
      const [k, pilot, phase] = st[s];
      const show = phase === 0 ? 1 : pilot < 1 ? 0 : clamp((k - 0.35) / 0.6, 0, 1);
      if (show <= 0) continue;
      const gl = GLYPHS[+cur[s]], [ox, oy] = SLOTS[s];
      for (let a = 0; a < 1; a++) {
        const t = phase < 0 ? T - (sec - BF0) : phase > 0 ? T + (DG1 - sec) : T;     // frozen at work
        const w = walk(t, 6 + a * 3 + s, 6 + a * 2.5, s * 1.7 + a * 2.9) + gl.len * (a * 0.5 + s * 0.13);
        const [p, dir] = pingpong(w, gl.len);
        onRoute(gl, p, dir, w, null, ox, oy, show);
      }
    }

    // ---- grains trickling down the main shaft
    for (let k = 0; k < 3; k++) {
      const ph = (T / 7 + k * 0.37) % 1, y = 12 + ph * 7 * 40;
      if (y < 68) { const j = Math.round(y - 4); M[Math.round(y) * W + Math.round(R_MAIN.RX[clamp(j, 0, R_MAIN.n - 1)] - 0.5)] = 1; }
    }
    // ---- a forager dragging a crumb home: in along the surface from the right, down the main shaft to the queen's store
    {
      const Ls = W + 10 - 66, L = Ls + R_MAIN.len, w = walk(T, 5, 8, 0.7), [p, dir] = pingpong(w, L);
      if (p < Ls) {
        const x = W + 10 - p, xi = clamp(Math.round(x), 3, W - 4), slope = (SURF[xi + 3] - SURF[xi - 3]) / 6;
        if (x < W + 8) ant(x, SURF[xi] - 3.5, dir > 0 ? Math.atan2(-slope, -1) : Math.atan2(slope, 1), w, dir > 0 ? CRUMB : null, false);
      } else onRoute(R_MAIN, p - Ls, dir, w, dir > 0 ? CRUMB : null);
    }
    // ---- the main shaft's traffic
    for (let a = 0; a < 2; a++) {
      const w = walk(T, 7 + a * 2, 9 + a, a * 2.1) + a * 70;
      const [p, dir] = pingpong(w, R_MAIN.len);
      onRoute(R_MAIN, p, dir, w, dir < 0 ? GRAIN : null);
    }

    // ---- porters: sand back in before a turn, out to the heap after one (this minute's turn and the next)
    for (let s = 0; s < 4; s++) for (const [was, now, tau] of [[prv[s], cur[s], sec], [cur[s], nxt[s], sec - 60]]) {
      if (was === now || tau < -14 || tau > 18) continue;
      const shIn = shaftOf(s, +was), shOut = shaftOf(s, +now);
      for (let j = 0; j < 3; j++) {
        porter(shIn, tau + 1.8 - j * 0.45, true);
        porter(shOut, tau - 0.9 - j * 0.55, false);
      }
      // backfill: a stream of grains rattling down the old shaft; digging: spoil spat out of the new entrance
      if (tau > -2 && tau < -0.3)
        for (let k = 0; k < 6; k++) {
          const y = Math.round(shIn.y0 + 1 + (((tau + 2) * 45 + k * 7.3) % (shIn.y1 - shIn.y0 + 6)));
          if (y < shIn.y1) M[y * W + Math.round(shaftX(shIn.px, shIn.y0, shIn.y1, y, shIn.seed) - 0.5)] = 1;
        }
      if (tau > 0.15 && tau < 2.6) spoil(shOut, tau - 0.15, s);
    }
    // ---- the hour
    const shower = nf.h !== f.h && sec >= 57 ? sec - 57 : hour && sec < 3.5 ? sec + 3 : -1;
    if (shower >= 0) rain(shower);
    if (hour && sec > 10) flight(sec - 10, f, [shaftOf(0, +cur[0]), shaftOf(1, +cur[1])]);

    const buf = g.buf;
    for (let i = 0; i < W * H; i++) {
      const m = M[i];
      buf[i] = (m === 1 || (m === 0 && SAND[i])) ? INK5 : GND5;
    }
    g.cost.px += W * H; g.cost.box += W * H * 3 + 4 * DW * DH * 3; g.cost.blit += blitN;
  },
};
