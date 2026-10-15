// Claw Machine: the whole 64x128 tall assembly is one arcade crane cabinet.
// The hour is the neon on its marquee; the minutes are two felt numberfolk
// (stitched plush numerals with button eyes) sitting on the prize heap, either
// side of the prize chute. The claw never rests: the trolley glides, the
// cable swings as a real pendulum (driven by the trolley, see -plan.js), and
// it keeps trying for the frog, the bear, the bunny, and fumbling them.
// Minute turn: the claw comes for the old numeral (it squeezes its eyes shut,
// squashed in the grip), drops it down the chute (the prize door flaps), then
// dives into the heap and hauls the new numeral out from where it was buried,
// lets it drop onto its seat with a squash and a bounce.
// Hour: the neon re-strikes, the claw finally holds the frog, it goes down
// the chute, jackpot: chasing bulbs, prizes rain, and the frog waves from the
// prize door.
import * as kit from '../js/kit.js';
import { W, H, drawPlush, drawNeon, drawClaw, sprite, drawSprite } from './clawmachine-draw.js';
import { plan, winOf, claw, gripAt, pose, theta, SLOTX, SEAT, NTOP, RIM, HOME, ACT, TOPY } from './clawmachine-plan.js';

const clamp = kit.clamp, sst = kit.smoothstep;
const img = new Float32Array(3 * W * H);
const PINK = kit.hex('#ff2a8a'), CYAN = kit.hex('#28d8ff'), AMBER = kit.blackbody(2300);
const WX0 = 2, WX1 = 61, WY0 = 25, WY1 = 100;          // the glass window
const CH0 = 26, CH1 = 37;                              // chute walls
const DOOR = { x0: 23, x1: 40, y0: 112, y1: 125 };     // prize door
const GF = 1100;                                        // falling prizes, px/s^2

// --------------------------------------------------------------- sprites
const L = (h, k = 1) => kit.scale(kit.hex(h), k);
const SPR = {
  frog: sprite([
    '..wwww....wwww..',
    '.weeeew..weeeew.',
    '.wekkewwwwekkew.',
    'rwekkewrrwekkewr',
    'rrwwwwrrrrwwwwrr',
    'rrrrrrrrrrrrrrrr',
    'ook' + 'o'.repeat(10) + 'koo',
    'ooo' + 'k'.repeat(10) + 'ooo',
    'yyyyyyyyyyyyyyyy',
    'gggggggggggggggg',
    'bbbbbbbbbbbbbbbb',
    '.vvvvvvvvvvvvvv.',
    '.vvv..vvvv..vvv.',
  ], { w: L('#ffffff', 0.8), e: L('#e8f0ff', 0.55), k: [0, 0, 0], r: L('#ff2020'), o: L('#ff7a00'), y: L('#ffd800'),
    g: L('#20d040'), b: L('#2060ff'), v: L('#9a30ff') }),
  bear: sprite([
    '.nn.....nn.',
    'nmnnnnnnnmn',
    'nnnnnnnnnnn',
    'nnknnnnnknn',
    'nnnnmmmnnnn',
    'nnnmmkmmnnn',
    '.nnnmmmnnn.',
    '..nnnnnnn..',
    '.nnnnnnnnn.',
    'nnnnmmmnnnn',
    '.nn.....nn.',
  ], { n: L('#b0662a'), m: L('#ffc890'), k: [0, 0, 0] }),
  bunny: sprite([
    '.ww...ww.',
    '.wp...pw.',
    '.wp...pw.',
    '.wp...pw.',
    '.www.www.',
    'wwwwwwwww',
    'wwkwwwkww',
    'wwwwpwwww',
    '.wwwwwww.',
    '..wwwww..',
    '.wwwwwww.',
    'wwwwwwwww',
    '.ww...ww.',
  ], { w: L('#ffe0ee', 0.8), p: L('#ff5c9a'), k: [0, 0, 0] }),
  octo: sprite([
    '...qqqqq...',
    '..qqqqqqq..',
    '.qqkqqqkqq.',
    '.qqqqqqqqq.',
    '..qqqqqqq..',
    'qq.qqqqq.qq',
    'q..q.q.q..q',
    'q.q..q..q.q',
  ], { q: L('#9a5cff'), k: [0, 0, 0] }),
};
for (const A of ACT) A.S = SPR[A.key];
const ACT_LVL = 0.42;                                   // plush in the heap: dimmer than the time

// -------------------------------------------------------- static layers
const BACK = new Float32Array(3 * W * H);               // window interior: back wall + heap
const CAB = new Float32Array(3 * W * H);                // the cabinet round the window
const inWin = (x, y) => x >= WX0 && x <= WX1 && y >= WY0 && y <= WY1;
const BODY = [0.066, 0, 0.1], BODY2 = [0.1, 0, 0.14], TRIM = [0.1, 0.09, 0.12];
function put(A, x, y, c, k = 1) { const p = 3 * (y * W + x); A[p] = c[0] * k; A[p + 1] = c[1] * k; A[p + 2] = c[2] * k; }
function buildStatic() {
  // back wall: lit from the LED strip under the marquee
  for (let y = WY0; y <= WY1; y++) for (let x = WX0; x <= WX1; x++) {
    const g = 0.06 * Math.exp(-(y - WY0) / 6);
    put(BACK, x, y, [0.75 * g, 0.7 * g, 1.0 * g]);
  }
  // the heap: felt balls and lumps, back to front
  const PAL = ['#ff7eb6', '#3fd0c9', '#a98bff', '#7fe08a', '#ffa47a', '#5aa8ff', '#e8d8f0', '#ff5a5a'].map((h) => kit.hex(h));
  const blobs = [];
  for (let i = 0; i < 90; i++) {
    const side = i % 2, x = side ? 38.5 + kit.hash(i, 1) * 23 : 1.5 + kit.hash(i, 1) * 24.5;
    blobs.push({ x, y: 84 + kit.hash(i, 2) * 18, r: 2.4 + kit.hash(i, 3) * 2.4, c: PAL[Math.floor(kit.hash(i, 4) * PAL.length)] });
  }
  blobs.sort((a, b) => a.y - b.y);
  for (const b of blobs) for (let y = Math.floor(b.y - b.r); y <= b.y + b.r; y++) for (let x = Math.floor(b.x - b.r); x <= b.x + b.r; x++) {
    if (!inWin(x, y) || (x >= CH0 && x <= CH1)) continue;
    const dx = (x - b.x) / b.r, dy = (y - b.y) / b.r, q = dx * dx + dy * dy;
    if (q > 1.15) continue;
    const cov = clamp((1.15 - q) * 3), nz = Math.sqrt(Math.max(0, 1 - q));
    const dif = Math.max(0, -0.48 * dx - 0.62 * dy + 0.62 * nz);
    const depth = 0.7 + 0.3 * sst(84, 98, b.y);                 // the back of the heap is in shadow
    const k = (0.085 + 0.22 * dif) * depth, p = 3 * (y * W + x);
    for (let c = 0; c < 3; c++) BACK[p + c] += (b.c[c] * k - BACK[p + c]) * cov;
  }
  // cabinet body
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (inWin(x, y)) continue;
    let c = BODY, k = 1;
    if (y >= 3 && y <= 19 && x >= 3 && x <= 60) k = 0;          // marquee glass: black, the neon lives here
    if (y >= 103 && y <= 110) { c = BODY2; k = 1 - 0.3 * (y - 103) / 7; }   // control panel, lit from above
    if (y >= DOOR.y0 && y <= DOOR.y1 && x >= DOOR.x0 && x <= DOOR.x1) k = 0;
    const edge = x <= 1 || x >= 62 ? 1.25 : 1;                    // rounded side edges catch the light
    put(CAB, x, y, c, k * edge * (1.2 - 0.5 * y / (H - 1)));
  }
  const trimH = (y, x0, x1, k = 1) => { for (let x = x0; x <= x1; x++) put(CAB, x, y, TRIM, k); };
  const trimV = (x, y0, y1, k = 1) => { for (let y = y0; y <= y1; y++) put(CAB, x, y, TRIM, k); };
  trimH(2, 2, 61); trimH(20, 2, 61); trimV(2, 2, 20); trimV(61, 2, 20);
  trimH(24, 1, 62, 1.4); trimV(1, 24, 101, 1.4); trimV(62, 24, 101, 1.4);
  trimH(101, 1, 62, 1.8); trimH(102, 1, 62, 0.6);
  trimH(DOOR.y0 - 1, DOOR.x0 - 1, DOOR.x1 + 1, 1.5); trimH(DOOR.y1 + 1, DOOR.x0 - 1, DOOR.x1 + 1, 1.5);
  trimV(DOOR.x0 - 1, DOOR.y0 - 1, DOOR.y1 + 1, 1.5); trimV(DOOR.x1 + 1, DOOR.y0 - 1, DOOR.y1 + 1, 1.5);
  trimH(126, 0, 63, 0.8);
}
buildStatic();
// marquee bulbs: round the sign, in order
const BULBS = [];
for (let x = 2; x <= 61; x += 3) BULBS.push([x, 1]);
for (let y = 4; y <= 19; y += 3) BULBS.push([62, y]);
for (let x = 61; x >= 2; x -= 3) BULBS.push([x, 21]);
for (let y = 19; y >= 4; y -= 3) BULBS.push([1, y]);
// neon stars beside the hour
function starSegs(cx, cy, r) {
  const s = [];
  for (let i = 0; i < 5; i++) {
    const a0 = -Math.PI / 2 + i * 2 * Math.PI / 5, a1 = a0 + Math.PI / 5, a2 = a0 + 2 * Math.PI / 5;
    s.push([cx + r * Math.cos(a0), cy + r * Math.sin(a0), cx + 0.45 * r * Math.cos(a1), cy + 0.45 * r * Math.sin(a1)]);
    s.push([cx + 0.45 * r * Math.cos(a1), cy + 0.45 * r * Math.sin(a1), cx + r * Math.cos(a2), cy + r * Math.sin(a2)]);
  }
  return s;
}
const STARS = [starSegs(10.5, 11.5, 4.4), starSegs(53, 11.5, 4.4)];

// ------------------------------------------------------- small painters
const segD = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = L2 ? clamp(((px - ax) * dx + (py - ay) * dy) / L2) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
function neonSegs(segs, col, lit) {
  if (lit <= 0) return;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const s of segs) { x0 = Math.min(x0, s[0], s[2]); x1 = Math.max(x1, s[0], s[2]); y0 = Math.min(y0, s[1], s[3]); y1 = Math.max(y1, s[1], s[3]); }
  for (let y = Math.max(0, Math.floor(y0 - 3)); y <= Math.min(H - 1, y1 + 3); y++) for (let x = Math.max(0, Math.floor(x0 - 3)); x <= Math.min(W - 1, x1 + 3); x++) {
    let d = 9;
    for (const s of segs) d = Math.min(d, segD(x, y, s[0], s[1], s[2], s[3]));
    if (d > 3) continue;
    const k = lit * ((1 - sst(0.25, 0.95, d)) * 0.9 + Math.exp(-d * d / 2) * 0.35), p = 3 * (y * W + x);
    img[p] += col[0] * k; img[p + 1] += col[1] * k; img[p + 2] += col[2] * k;
  }
}
function addPx(x, y, c, k) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const p = 3 * (y * W + x); img[p] += c[0] * k; img[p + 1] += c[1] * k; img[p + 2] += c[2] * k;
}
/** A soft-edged shaded ball (rain prizes, the joystick knob, the button). */
function ball(cx, cy, r, col, a = 1, add = 0) {
  for (let y = Math.max(0, Math.floor(cy - r - 1)); y <= Math.min(H - 1, cy + r + 1); y++) for (let x = Math.max(0, Math.floor(cx - r - 1)); x <= Math.min(W - 1, cx + r + 1); x++) {
    const dx = (x - cx) / r, dy = (y - cy) / r, q = Math.hypot(dx, dy);
    const cov = clamp((1 - q) * r + 0.5) * a;
    if (cov <= 0) continue;
    const nz = Math.sqrt(Math.max(0, 1 - q * q)), sh = 0.25 + 0.9 * Math.max(0, -0.48 * dx - 0.62 * dy + 0.62 * nz) + add;
    const p = 3 * (y * W + x);
    for (let c = 0; c < 3; c++) img[p + c] += (col[c] * sh - img[p + c]) * cov;
  }
}

// ---------------------------------------------------- held / falling things
const g0 = {}, g1 = {}, cs = {};
/** Release state of hold h (window k): where and how fast it left the claw. */
function released(k, h, o) {
  const t = 60 * k + h.t1;
  gripAt(t, g0); gripAt(t - 1 / 60, g1);
  o.x = g0.gx; o.y = g0.gy; o.vx = (g0.gx - g1.gx) * 60; o.vy = (g0.gy - g1.gy) * 60; o.th = g0.th;
  return o;
}
const R0 = {};
/** Falling from a release, landing when the top reaches yLand. */
function fall(tau, r, yLand) {
  const y = r.y + r.vy * tau + 0.5 * GF * tau * tau;
  let tL = Infinity;
  if (yLand != null) {
    tL = r.y >= yLand ? 0 : (-r.vy + Math.sqrt(r.vy * r.vy + 2 * GF * (yLand - r.y))) / GF;
  }
  return { x: r.x + r.vx * Math.min(tau, tL), y: Math.min(y, yLand ?? 1e9), tL, landed: tau >= tL, sig: tau - tL, vI: r.vy + GF * Math.min(tau, tL) };
}
const squash = (sig, vI) => {
  const amp = 0.05 + 0.2 * clamp(vI / 260);
  return 1 - amp * Math.exp(-5 * sig) * Math.sin(13 * sig);
};

/** The numeral in slot s at time t: an instance for drawPlush, or null. */
function numeral(s, t, cl) {
  const k = winOf(t), p = plan(k), rel = t - 60 * k, cx = SLOTX[s];
  const dig = (D) => (s ? D.o : D.t);
  const look = clamp((cl.hx - cx) / 22, -1, 1);
  const bl = (t + s * 1.9) % 4.3;
  const blink = bl < 0.13 && kit.hash(Math.floor((t + s * 1.9) / 4.3), s) > 0.25;
  // they duck when the claw swings low right over their heads
  const prox = clamp(1 - Math.abs(cl.hx - cx) / 11) * sst(44, 54, cl.hy);
  const seated = (d) => ({ d, px: cx, py: SEAT, pu: 10, pv: 28, look, sy: 1 - 0.08 * prox, sx: 1 + 0.035 * prox,
    eyes: blink || prox > 0.55 ? 'shut' : 'open' });
  if (!p.changed.includes(s)) return seated(dig(rel < 0 ? p.P : p.N));
  const hO = p.holds.find((h) => h.obj === 'old' + s), hN = p.holds.find((h) => h.obj === 'new' + s);
  if (rel < hO.t0) return seated(dig(p.P));
  if (hO.end === 'hop') {
    if (rel < hN.t0) {
      // crouch, then a dive into the chute after its partner
      const tau = rel - hO.t0;
      if (tau < 0.2) { const sy = 1 - 0.16 * Math.sin(Math.PI * tau / 0.2); return { ...seated(dig(p.P)), sy, sx: 1 / Math.sqrt(sy), eyes: 'shut' }; }
      const u = tau - 0.2, by = SEAT - 210 * u + 550 * u * u;
      if (by - 28 > WY1 + 1) return null;
      const sq = sst(RIM - 4, RIM + 10, by);
      return { d: dig(p.P), px: kit.lerp(cx, HOME, sst(0, 0.42, u)), py: by, pu: 10, pv: 28, rot: 0.55 * sst(0, 0.4, u) * (1 - sq),
        sx: 1 - 0.45 * sq, sy: 1 + 0.1 * sq, eyes: 'shut', mouth: 'o' };
    }
    // the new one jumps out of the heap onto its seat
    const tau = rel - hN.t0, VY = 208, GJ = 600, tL = (VY + Math.sqrt(VY * VY - 4 * (GJ / 2) * 28)) / GJ;
    if (tau < tL) return { d: dig(p.N), px: cx, py: SEAT + 28 - VY * tau + GJ / 2 * tau * tau, pu: 10, pv: 28, clipY: 86, sy: 1.06, sx: 0.95, eyes: 'open', mouth: 'o', look: 0 };
    const sig = tau - tL, sy = squash(sig, -VY + GJ * tL);
    return { d: dig(p.N), px: cx, py: SEAT, pu: 10, pv: 28, sy, sx: 1 / Math.sqrt(sy), look, eyes: sig < 1.8 ? 'happy' : blink ? 'shut' : 'open' };
  }
  if (rel < hO.t1) {
    gripAt(t, cs);
    const u = sst(0, 0.25, rel - hO.t0), wob = 0.03 * Math.sin((rel - hO.t0) * 17) * Math.exp(-(rel - hO.t0) * 3);
    return { d: dig(p.P), px: kit.lerp(cx, cs.gx, u), py: kit.lerp(NTOP, cs.gy, u), pu: 10, pv: 0, rot: -cs.th * u,
      sx: kit.lerp(1.03, 0.87, u) + wob, sy: kit.lerp(0.93, 1.05, u) - wob, eyes: 'shut', mouth: 'o' };
  }
  if (rel < (hN ? hN.t0 : 99)) {
    // down the chute
    const tau = rel - hO.t1, f = fall(tau, released(k, hO, R0), null);
    if (f.y > WY1 + 1) return null;
    const x = kit.lerp(f.x, HOME, sst(0, 0.16, tau)), sq = sst(RIM - 22, RIM - 4, f.y + 12);
    return { d: dig(p.P), px: x, py: f.y, pu: 10, pv: 0, rot: -R0.th * (1 - sst(0, 0.2, tau)), sx: 1 - 0.45 * sq, sy: 1 + 0.12 * sq, eyes: 'shut', mouth: 'o' };
  }
  if (rel < hN.t1) {
    gripAt(t, cs);
    return { d: dig(p.N), px: cs.gx, py: cs.gy, pu: 10, pv: 0, rot: -cs.th, sx: 0.9, sy: 1.04, clipY: 86, eyes: 'open', mouth: 'o', look: 0 };
  }
  const tau = rel - hN.t1, f = fall(tau, released(k, hN, R0), NTOP);
  if (!f.landed) return { d: dig(p.N), px: f.x, py: f.y, pu: 10, pv: 0, rot: -R0.th * (1 - tau / Math.max(0.01, f.tL)), sx: 0.92, sy: 1.04, eyes: 'open', mouth: 'o' };
  const sy = squash(f.sig, f.vI), x = kit.lerp(f.x, cx, kit.ease.out(clamp(f.sig / 0.45)));
  const happy = f.sig < 1.8;
  return { d: dig(p.N), px: x, py: SEAT, pu: 10, pv: 28, sx: 1 / Math.sqrt(sy) * (1 - 0.1 * (1 - clamp(f.sig / 0.12))), sy, look, eyes: happy ? 'happy' : blink ? 'shut' : 'open' };
}

/** Plush actor a (in the heap) at time t: draws it. */
function actor(a, t) {
  const A = ACT[a], S = A.S, k = winOf(t), p = plan(k), rel = t - 60 * k;
  const xr = Math.round(A.x - S.w / 2 + 0.5) + S.w / 2 - 0.5, yr = A.bot + 0.5, topR = yr - (S.h - 2);
  const rest = (o = {}) => drawSprite(img, S, o.x ?? xr, yr, S.w / 2, S.h - 1, { sx: o.sx ?? 1, sy: o.sy ?? 1, lvl: ACT_LVL });
  const lvlAt = (ytop) => ACT_LVL + 0.4 * sst(88, 52, ytop);
  let h = null;
  for (const q of p.holds) if (q.obj === 'a' + a && q.t0 <= rel) h = q;
  if (!h) return rest();
  if (rel < h.t1) {
    gripAt(t, cs);
    const u = sst(0, 0.3, rel - h.t0), y = kit.lerp(topR, cs.gy, u);
    return drawSprite(img, S, kit.lerp(xr, cs.gx, u), y, S.w / 2, 1, { rot: -cs.th * u, sx: 1 - 0.1 * u, sy: 1 + 0.06 * u, lvl: lvlAt(y) });
  }
  const tau = rel - h.t1;
  if (h.end === 'slip') {
    const f = fall(tau, released(k, h, R0), topR);
    if (!f.landed) return drawSprite(img, S, f.x, f.y, S.w / 2, 1, { rot: -R0.th * (1 - clamp(tau / f.tL)), lvl: lvlAt(f.y) });
    const sy = squash(f.sig, f.vI);
    return rest({ x: kit.lerp(f.x, xr, kit.ease.inOut(clamp(f.sig / 0.7))), sy, sx: 1 / Math.sqrt(sy) });
  }
  // the frog wins: down the chute, and later a fresh frog drops in with the prize rain
  const back = p.show.back;
  if (rel < back) {
    const f = fall(tau, released(k, h, R0), null);
    if (f.y > WY1 + 1) return;
    const sq = sst(RIM - 14, RIM - 2, f.y + 8);
    return drawSprite(img, S, kit.lerp(f.x, HOME, sst(0, 0.16, tau)), f.y, S.w / 2, 1, { sx: 1 - 0.3 * sq, sy: 1 + 0.1 * sq, lvl: lvlAt(f.y) });
  }
  const f = fall(rel - back, { x: xr, y: WY0 - 14, vx: 0, vy: 0 }, topR);
  if (!f.landed) return drawSprite(img, S, xr, f.y, S.w / 2, 1, { lvl: lvlAt(f.y), clipY: H });
  const sy = squash(f.sig, f.vI);
  return rest({ sy, sx: 1 / Math.sqrt(sy) });
}

// --------------------------------------------------------------- scene
const RAIN_PAL = ['#ff7eb6', '#3fd0c9', '#a98bff', '#7fe08a', '#ffa47a', '#5aa8ff'].map((h) => kit.hex(h));
const cl = {}, pa = {}, pb = {};
function jackpot(p, rel) {
  if (!p.show) return;
  const S = p.show;
  // prizes rain from the hatch: the ones over the chute fall through, the rest sink into the heap
  for (let i = 0; i < 44; i++) {
    const tau = rel - S.rain - i * 0.07;
    if (tau < 0 || tau > 2.5) continue;
    const x = 4 + kit.hash(i, 77) * 56, chute = x > CH0 + 1.5 && x < CH1 - 1.5;
    const y = WY0 - 2 + 0.5 * 520 * tau * tau, land = 83 + kit.hash(i, 78) * 9;
    let yy = y, a = 1;
    if (!chute && y > land) { yy = land; a = 1 - clamp((tau - Math.sqrt(2 * (land - WY0 + 2) / 520)) / 0.35); }
    if (a <= 0 || yy > WY1 + 2) continue;
    ball(x + Math.sin(tau * 5 + i) * 0.8, yy, 1.9 + 0.9 * kit.hash(i, 79), kit.scale(RAIN_PAL[i % RAIN_PAL.length], 0.85), a);
  }
}
function sparkles(p, rel) {
  if (!p.show) return;
  const tau = rel - p.show.win;
  if (tau < 0 || tau > 7) return;
  const env = sst(0, 0.3, tau) * (1 - sst(5.5, 7, tau));
  for (let i = 0; i < 22; i++) {
    const x = WX0 + 1 + kit.hash(i, 5) * 57, y = WY0 + 3 + kit.hash(i, 6) * 50;
    const tw = Math.max(0, Math.sin(tau * (5 + 3 * kit.hash(i, 7)) + i * 2.1)) ** 6 * env;
    if (tw < 0.02) continue;
    addPx(x, y, [1, 0.95, 0.8], 0.6 * tw);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) addPx(x + dx, y + dy, [1, 0.8, 0.6], 0.15 * tw);
  }
}

export default {
  name: 'Claw Machine',
  blurb: 'an arcade crane cabinet: neon hour, plush numberfolk minutes the claw swaps through the prize chute',
  layouts: ['hub-tall'], look: 'smoke', fps: 60, brightness: 0.35, dither: true,
  frame(ctx) {
    const t = ctx.date.getTime() / 1000, k = winOf(t), p = plan(k), rel = t - 60 * k;
    claw(t, cl);
    img.set(BACK);
    jackpot(p, rel);
    for (let a = 0; a < ACT.length; a++) actor(a, t);
    const front = p.front.some(([a, b]) => rel >= a && rel < b);
    const drawC = () => drawClaw(img, cl.hx, cl.hy, -cl.th, cl.a, cl.x, TOPY, front ? 1 : 0.8);
    if (!front) drawC();
    for (let s = 0; s < 2; s++) { const I = numeral(s, t, cl); if (I) drawPlush(img, I); }
    if (front) drawC();

    // chute: smoked acrylic front, lit rim
    for (let y = RIM + 1; y <= WY1; y++) for (let x = CH0; x <= CH1; x++) {
      const q = 3 * (y * W + x);
      img[q] *= 0.55; img[q + 1] *= 0.6; img[q + 2] *= 0.62;
    }
    for (let y = RIM; y <= WY1; y++) { const f = 0.06 * (1 - 0.6 * (y - RIM) / (WY1 - RIM)); addPx(CH0, y, CYAN, f); addPx(CH1, y, CYAN, f); }
    for (let x = CH0; x <= CH1; x++) addPx(x, RIM, CYAN, 0.22 + 0.06 * Math.sin(t * 2 + x * 0.5));

    // light strip, rail and trolley
    const jp = p.show ? sst(0, 0.3, rel - p.show.win) * (1 - sst(6, 8, rel - p.show.win)) : 0;
    const jc = jp > 0 ? [PINK, CYAN, AMBER][Math.floor((rel - p.show.win) * 6) % 3] : PINK;
    for (let x = WX0; x <= WX1; x++) {
      addPx(x, WY0, kit.mix([1, 0.95, 1], jc, jp), 0.22 + 0.3 * jp); addPx(x, 27, [0.5, 0.52, 0.6], 0.2);
      if (jp > 0) for (let y = WY0 + 1; y < WY0 + 12; y++) addPx(x, y, jc, 0.07 * jp * Math.exp(-(y - WY0) / 4));
    }
    for (let y = 26; y <= 29; y++) for (let x = Math.floor(cl.x - 5); x <= cl.x + 5; x++) {
      const cov = clamp(4.5 - Math.abs(x - cl.x)), q = 3 * (y * W + x);
      if (cov <= 0 || x < 0 || x >= W) continue;
      const sh = y === 26 ? 0.75 : y === 29 ? 0.3 : 0.5;
      for (let c = 0; c < 3; c++) img[q + c] += ([0.42, 0.45, 0.52][c] * sh - img[q + c]) * cov;
    }
    sparkles(p, rel);

    // glass: two slow diagonal reflections
    const c1 = 40 + 9 * Math.sin(t * 0.05), c2 = c1 + 8;
    for (let y = WY0 + 1; y <= WY1; y++) {
      const fade = 1 - 0.6 * (y - WY0) / (WY1 - WY0);
      for (let x = WX0; x <= WX1; x++) {
        const s = x + 0.55 * y - 40, r1 = (s - c1) / 2.4, r2 = (s - c2) / 0.9;
        const k2 = (0.022 * Math.exp(-r1 * r1) + 0.04 * Math.exp(-r2 * r2)) * fade * fade;
        if (k2 < 0.004) continue;
        const q = 3 * (y * W + x);
        img[q] += 0.8 * k2; img[q + 1] += 0.9 * k2; img[q + 2] += k2;
      }
    }

    // the cabinet round the window
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (inWin(x, y)) continue;
      const q = 3 * (y * W + x);
      img[q] = CAB[q]; img[q + 1] = CAB[q + 1]; img[q + 2] = CAB[q + 2];
    }

    // marquee: neon hour, stars, chasing bulbs
    const hourShow = p.hour && rel >= 0 && rel < 14;
    let litOld = 1, litNew = 1;
    if (p.hour) {
      const fl = kit.hash(Math.floor(t * 22), 3) > 0.4 ? 1 : 0.2;
      litOld = rel < 0 ? 1 : rel < 0.3 ? (1 - rel / 0.3) * fl : 0;
      litNew = rel < 0.38 ? 0 : rel < 0.9 ? (rel > 0.75 ? 1 : fl * (0.4 + (rel - 0.38))) : 1;
    }
    const hum = 0.93 + 0.07 * kit.noise2(t * 3, 1.5);
    const flash = p.show && rel > p.show.win && rel < p.show.win + 2.4 ? 1 + 0.6 * (Math.sin((rel - p.show.win) * 22) > 0) : 1;
    const sc = 15 / 28;
    const neonHour = (h, lit) => {
      drawNeon(img, Math.floor(h / 10), 20.4, 4.2, sc, PINK, lit * hum * flash);
      drawNeon(img, h % 10, 33, 4.2, sc, PINK, lit * hum * flash);
    };
    if (litOld > 0 && rel < 0.31) neonHour(p.P.h, litOld);
    if (litNew > 0 && (p.hour ? rel >= 0.38 : true)) neonHour(rel < 0 ? p.P.h : p.N.h, p.hour ? litNew : 1);
    STARS.forEach((st, i) => neonSegs(st, CYAN, 0.35 + 0.3 * Math.max(0, Math.sin(t * 1.3 + i * 2.2)) * (hourShow ? 2 : 1)));
    const n = BULBS.length;
    BULBS.forEach(([bx, by], i) => {
      let v, col = AMBER;
      if (hourShow) {
        v = 0.25 + 0.75 * (Math.floor(i - rel * 24) % 3 === 0 ? 1 : 0.15);
        col = [AMBER, PINK, CYAN][(Math.floor(rel * 3) + i) % 3];
      } else v = 0.2 + 0.8 * (0.5 + 0.5 * Math.cos(2 * Math.PI * (i / 7 - t * 0.45))) ** 3;
      addPx(bx, by, col, 0.55 * v);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) addPx(bx + dx, by + dy, col, 0.06 * v);
    });
    void n;

    // control panel: the joystick follows the trolley, the button lights as the claw drops
    pose(t + 0.05, pa); pose(t - 0.05, pb);
    const vx = (pa.x - pb.x) / 0.1, vy = (pa.y - pb.y) / 0.1, tilt = clamp(vx / 40, -1, 1);
    const kx = 12 + 3 * tilt, ky = 105.2 + 0.5 * Math.abs(tilt);
    for (let i = 0; i <= 8; i++) addPx(kit.lerp(12, kx, i / 8), kit.lerp(109, ky, i / 8), [0.4, 0.42, 0.5], 0.12);
    ball(12, 109.6, 1.6, [0.05, 0.05, 0.06]);
    ball(kx, ky, 1.8, kit.hex('#ff2030'));
    const press = clamp(vy / 30);
    ball(51, 106.6, 2.3, kit.mix(kit.hex('#20ff60'), kit.hex('#ff3020'), press), 1, 0.2 + 0.5 * press);
    // coin slots
    for (const x of [8, 55]) for (let y = 115; y <= 120; y++) addPx(x, y, AMBER, (0.25 + 0.2 * Math.sin(t * 2.4)) * (y === 115 || y === 120 ? 0.4 : 1));

    // prize door: the flap kicks when a prize comes down
    let flap = 0;
    for (const h of p.holds) if (h.end === 'chute' || h.end === 'win') {
      const tau = rel - h.t1 - 0.45;
      if (tau > 0 && tau < 2) flap += Math.exp(-4 * tau) * Math.abs(Math.sin(9 * tau));
    }
    if (p.show) { const tau = rel - p.show.rain - 0.6; if (tau > 0 && tau < 4) flap += 0.4 * Math.abs(Math.sin(tau * 11)) * (1 - tau / 4); }
    flap = clamp(flap);
    for (let x = DOOR.x0; x <= DOOR.x1; x++) {
      addPx(x, DOOR.y0, TRIM, 1.2);
      addPx(x, Math.round(DOOR.y1 - 7 * flap), [0.6, 0.6, 0.7], 0.12 + 0.2 * flap);
      for (let y = Math.round(DOOR.y1 - 7 * flap) + 1; y <= DOOR.y1; y++) addPx(x, y, AMBER, 0.05 * flap);
    }
    if (p.show) {
      const tau = rel - p.show.win - 0.6;
      if (tau > 0 && tau < 9) {
        const rise = sst(0, 0.6, tau) * (1 - sst(7.6, 8.8, tau)), S = SPR.frog;
        const top = DOOR.y1 + 1 - rise * 12.5 + 0.7 * Math.sin(tau * 6) * rise;
        drawSprite(img, S, (DOOR.x0 + DOOR.x1 + 1) / 2, top, S.w / 2, 1, { clipY: DOOR.y1 + 1, lvl: 0.85 });
        if (rise > 0.5) for (let i = 0; i < 6; i++) {
          const a = tau * 2 + i * 1.05, tw = Math.max(0, Math.sin(tau * 7 + i * 1.7)) ** 4;
          addPx(31.5 + 13 * Math.cos(a), 118 + 6 * Math.sin(a), [1, 0.9, 0.6], 0.5 * tw * rise);
        }
      }
    }
    kit.blitGrid(ctx, img, 1 - 0.6 * ctx.night);
  },
};
