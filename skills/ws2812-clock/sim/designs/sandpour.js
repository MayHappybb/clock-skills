// Sand Pour: a 64 x 128 hourglass with a glass time-cartridge hung in its
// waist. The cartridge holds four sealed glass tubes bent into numerals; the
// time is the sand inside them. A thin stream runs from the upper bulb, down
// the gap between the moulds, onto a cone in the lower bulb, all hour: the
// upper bulb empties as the hour goes (an hourglass is a clock already).
//
// Minute turn: a brass trapdoor under the changing numeral opens, its sand
// drains out grain by grain (a real falling-sand automaton, sandpour-sim.js),
// skitters along the glass shelves and pours down the middle into the lower
// bulb; the empty tube softens and re-forms as the next numeral, and the
// stream is diverted into its mouth and fills it from the bottom up, in
// strata. Partly filled, the glass skin already shows which numeral it is.
//
// Hour: the upper bulb has run dry, so the whole hourglass turns over, 180
// degrees, the camera pulling back to keep it in frame. The cartridge hangs
// on a gimbal at the waist and stays upright (it swings a little), so the
// time reads the whole way round; the full bulb comes over the top, its sand
// sliding to stay level, and then the new hour is poured.
//
// Deterministic: every mould fill and drain is a pure function of (digit,
// slot, step), replayed from its start; the bulbs, stream and cascade are
// closed form.
import * as kit from '../js/kit.js';
import { GLYPHS, BW, BH, R, GLASS } from './sandpour-glyphs.js';
import { Run, fillResult } from './sandpour-sim.js';

const W = 64, H = 128, NP = W * H, CXW = 31.5, CYW = 63.5;
const RATE = 200;                       // automaton steps per second
const FLIP = 2.8;                       // hour flip, seconds
const DRAIN0 = 0.12, DRAIN_END = 1.0, MORPH0 = 0.95, MORPH1 = 1.35, FILL0 = 1.3;
const G = 240;                          // gravity, px / s^2 (a slow, pretty fall)
const SLOT_X = [3, 36, 3, 36], SLOT_Y = [23, 23, 63, 63];
const NECK_Y = 18.5;                    // where the stream leaves the upper neck

// ---------------------------------------------------------------- colour
const SAND = ['#e2a448', '#f0d6a2', '#b9532c', '#c98a38', '#3b2d24'].map(kit.hex);
const VAR = [0.8, 0.9, 1.0, 1.1];
const PAL = new Float32Array(3 * 21);   // grain id 1..20 -> settled colour
for (let b = 0; b < 5; b++) for (let v = 0; v < 4; v++) {
  const id = 1 + b * 4 + v;
  for (let c = 0; c < 3; c++) PAL[3 * id + c] = SAND[b][c] * VAR[v] * (b === 4 ? 1.6 : 0.62);
}
const GLASSC = kit.scale(kit.hex('#a6cde0'), 0.10);
const BRASS = kit.scale(kit.hex('#ffd27a'), 0.55), SPEC = kit.hex('#e8f4ff');
const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => pad(d.getHours()) + pad(d.getMinutes());
const clamp = kit.clamp, sst = kit.smoothstep;

// -------------------------------------------------------------- the vessel
// Inner glass of the hourglass, as a signed distance (negative inside), in
// vessel pixels. Point-symmetric about (31.5, 63.5), so turned over it is the
// same glass.
function hwTop(y) {                     // half width of the upper bulb at row y
  if (y < 6) return 25.5 + Math.sqrt(Math.max(0, 36 - (6 - y) ** 2));
  if (y < 8) return 31.5;
  if (y < 17) { const t = (y - 8) / 9, e = t * t * (3 - 2 * t) * 0.35 + t * 0.65; return 31.5 - 30 * e; }
  return 1.5;
}
function sdfTopHalf(x, y) {
  const dx = Math.abs(x - CXW);
  let bulb = Math.max(dx - hwTop(y), -y);
  if (y > 6) bulb *= 0.75;              // the funnel walls are slanted
  if (y > 21) bulb = Math.max(bulb, y - 21);
  const neck = Math.max(dx - 1.5, Math.abs(y - 19.5) - 2.5);
  return Math.min(bulb, neck);
}
function sdfChamber(x, y) {
  const qx = Math.abs(x - CXW) - 31.5 + 5, qy = Math.abs(y - CYW) - 42.5 + 5;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 5;
}
function vesselSdf(x, y) {
  const top = y <= CYW ? sdfTopHalf(x, y) : sdfTopHalf(2 * CXW - x, 2 * CYW - y);
  return Math.min(top, sdfChamber(x, y));
}
/** Upper-bulb interior points (vessel coords), for the sand volume. */
const BULB = [];
for (let y = 0; y < 18; y++) for (let x = 0; x < W; x++) if (sdfTopHalf(x, y) < -0.6 && y < 17.5) BULB.push(x, y);
const NB = BULB.length / 2, VFULL = Math.round(NB * 0.78);

// ------------------------------------------------------- sand in the bulbs
// A bulb's sand is everything below a surface that is level in the WORLD
// (plus a cone, a crater, a slosh tilt), at the height that holds its volume.
const BWX = new Float32Array(NB), BWY = new Float32Array(NB);
const SH_CONE = 1, SH_CRATER = 2;
function surf(wx, level, tilt, shape, amp) {
  const dx = wx - CXW;
  let y = level + tilt * dx;
  if (shape === SH_CONE) y += amp * 0.62 * (Math.sqrt(dx * dx + 6) - 2.45);
  else if (shape === SH_CRATER) { const k = Math.max(0, 1 - Math.abs(dx) / 13); y += amp * 5 * k * k; }
  return y;
}
/** Level for `vol` grains in bulb `which` (0 = vessel top, 1 = bottom) at angle th. */
function solveLevel(which, th, vol, tilt, shape, amp) {
  const c = Math.cos(th), s = Math.sin(th);
  for (let k = 0; k < NB; k++) {
    let x = BULB[2 * k], y = BULB[2 * k + 1];
    if (which) { x = 2 * CXW - x; y = 2 * CYW - y; }
    const ux = x - CXW, uy = y - CYW;
    BWX[k] = CXW + c * ux - s * uy; BWY[k] = CYW + s * ux + c * uy;
  }
  let lo = -80, hi = 220;
  for (let it = 0; it < 22; it++) {
    const mid = (lo + hi) / 2;
    let n = 0;
    for (let k = 0; k < NB; k++) if (BWY[k] > surf(BWX[k], mid, tilt, shape, amp)) n++;
    if (n > vol) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
const L0 = solveLevel(1, 0, VFULL, 0, SH_CONE, 1);       // full lower bulb, at rest
const LTOP = solveLevel(0, 0, VFULL, 0, 0, 0);           // full upper bulb, level
const bandHash = (n) => kit.hash(n | 0, 77);
/** Sand colour of a stratum coordinate b; px, py add per-grain variation. */
function bandColour(b, wx, out, o, a) {
  const j = b + 1.6 * kit.noise2(wx * 0.13, b * 0.21);
  const n = Math.floor(j / 2.3), h = bandHash(n);
  const base = h < 0.42 ? 0 : h < 0.64 ? 1 : h < 0.84 ? 2 : 3;
  const g = kit.hash(Math.floor(wx * 1.0), Math.floor(b * 1.0), 5);
  const v = g < 0.05 ? 16 : 1 + base * 4 + ((g * 4) | 0);  // a few black grains
  out[o] += PAL[3 * v] * a; out[o + 1] += PAL[3 * v + 1] * a; out[o + 2] += PAL[3 * v + 2] * a;
}

// -------------------------------------------------- moulds: fills, drains
const fills = new Map(), runs = new Map();
const seedOf = (d, slot, kind) => 1000 + d * 17 + slot * 131 + kind * 7919;
const sideOf = (slot) => slot & 1;
const fillRate = (g) => g.count / 240, drainRate = (g) => g.count / 180;
/** The finished fill of digit d in a slot: its grid, its spawn log, its length. */
function fillOf(d, slot) {
  const k = d * 4 + slot;
  let f = fills.get(k);
  if (!f) { const g = GLYPHS[sideOf(slot)][d]; f = fillResult(g, seedOf(d, slot, 0), fillRate(g)); fills.set(k, f); }
  return f;
}
for (let d = 0; d < 10; d++) for (let slot = 0; slot < 4; slot++) fillOf(d, slot);
function runOf(kind, d, slot) {
  const k = `${kind}${d}${slot}`;
  let r = runs.get(k);
  if (!r) {
    const g = GLYPHS[sideOf(slot)][d];
    r = kind === 'fill' ? new Run(g, 'fill', seedOf(d, slot, 0), null, fillRate(g))
      : new Run(g, 'drain', seedOf(d, slot, 1), fillOf(d, slot).grid, drainRate(g));
    runs.set(k, r);
  }
  return r;
}

// ------------------------------------------------- the cartridge's glass
// Shelves under the hour moulds and a shallow funnel floor under the minute
// moulds lead everything drained to the middle, and down.
const shelfY = (x) => { const d = x < CXW ? x - 1.5 : 61.5 - x; return 58.8 + d * (2.2 / 27); };
const floorY = (x) => { const d = x < CXW ? x - 1.5 : 61.5 - x; return 100.2 + d * (3.6 / 28); };
const SHELF_END = 27.5, FLOOR_END = 29.5;           // distance from the wall where each stops
const CART_STATIC = new Float32Array(NP);           // glass coverage of shelves + floor
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const dxw = x < CXW ? x - 1.5 : 61.5 - x;
  let c = 0;
  if (dxw >= -0.5 && dxw <= SHELF_END) c = Math.max(c, 1 - Math.abs(y - shelfY(x)) / 0.8);
  if (dxw >= -0.5 && dxw <= FLOOR_END) c = Math.max(c, 1 - Math.abs(y - floorY(x)) / 0.8);
  CART_STATIC[y * W + x] = clamp(c);
}
// the vessel's glass at rest, for the fast path
const VGLASS = new Float32Array(NP), VSDF = new Float32Array(NP);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const d = vesselSdf(x, y);
  VSDF[y * W + x] = d; VGLASS[y * W + x] = clamp(1.15 - Math.abs(d) / 0.95);
}

// ---------------------------------------------------------------- buffers
const IMG = new Float32Array(3 * NP), CART = new Float32Array(3 * NP), CA = new Float32Array(NP);

/** A soft grain at world (x, y), already in screen coords; bilinear coverage. */
function dot(x, y, c, a) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  for (let j = 0; j < 2; j++) {
    const yy = y0 + j;
    if (yy < 0 || yy >= H) continue;
    const wy = j ? fy : 1 - fy;
    for (let i = 0; i < 2; i++) {
      const xx = x0 + i;
      if (xx < 0 || xx >= W) continue;
      const w = (i ? fx : 1 - fx) * wy * a, o = 3 * (yy * W + xx);
      IMG[o] += c[0] * w; IMG[o + 1] += c[1] * w; IMG[o + 2] += c[2] * w;
    }
  }
}
const GRAIN = [0, 0, 0];
function grainRGB(id, k) {
  GRAIN[0] = PAL[3 * id] * k; GRAIN[1] = PAL[3 * id + 1] * k; GRAIN[2] = PAL[3 * id + 2] * k;
  return GRAIN;
}
/** Glass sheen: a slow diagonal glint that sweeps the whole piece. */
const sheen = (x, y, ph) => { const q = (x * 0.8 + y * 0.45 - ph) / 3.2; return 1 + 2.4 * Math.exp(-q * q); };

// ----------------------------------------------------------- one mould
/**
 * Draw slot `slot` into CART. gA/gB: the glyphs whose glass is shown (morph
 * k from A to B); grid/gg: the sand (and the glyph it lives in), moved/step
 * for the glitter of moving grains, fade for residue, gate 0 shut .. 1 open.
 */
function drawMould(slot, gA, gB, k, grid, gg, moved, step, fade, gate, ph) {
  const x0 = SLOT_X[slot], y0 = SLOT_Y[slot];
  const mx = kit.lerp(gA.mouth.x, gB.mouth.x, k), my = kit.lerp(gA.mouth.y, gB.mouth.y, k);
  const dx = kit.lerp(gA.door.x, gB.door.x, k), dy = kit.lerp(gA.door.y, gB.door.y, k);
  const sa = gA.sdf, sb = gB.sdf;
  for (let by = 0; by < BH; by++) {
    const y = y0 + by;
    for (let bx = 0; bx < BW; bx++) {
      const i = by * BW + bx, p = y * W + x0 + bx, o = 3 * p;
      const sd = k <= 0 ? sa[i] : k >= 1 ? sb[i] : sa[i] + (sb[i] - sa[i]) * k;
      let g = 1 - Math.abs(sd - GLASS) / 0.75;
      if (g > 0) {
        const px = bx + 0.5, py = by + 0.5;
        const dm = Math.hypot(px - mx, py - my), dd = Math.hypot(px - dx, py - dy);
        g *= sst(1.5, 2.7, dm) * sst(2.2, 3.0, dd);
        // a softened, re-forming tube glows a little warmer
        const hot = k > 0 && k < 1 ? 4 * k * (1 - k) : 0;
        const sh = sheen(x0 + bx, y, ph) * g;
        CART[o] += GLASSC[0] * sh + hot * 0.06 * g; CART[o + 1] += GLASSC[1] * sh + hot * 0.025 * g; CART[o + 2] += GLASSC[2] * sh;
      }
      if (grid) {
        const id = grid[i];
        if (id && id !== 255) {
          const cov = clamp(R + 0.55 - gg.sdf[i]);
          const glit = (step - moved[i] < 5 ? 1.5 : 1) * gg.shade[i];
          const a = cov * fade;
          CART[o] = CART[o] * (1 - a) + PAL[3 * id] * glit * a;
          CART[o + 1] = CART[o + 1] * (1 - a) + PAL[3 * id + 1] * glit * a;
          CART[o + 2] = CART[o + 2] * (1 - a) + PAL[3 * id + 2] * glit * a;
          CA[p] = Math.max(CA[p], a);
        }
      }
    }
  }
  // the glass highlight along the tube, over the sand
  const pa = gA.spec, pb = gB.spec;
  for (let by = 1; by < BH - 1; by++) for (let bx = 1; bx < BW - 1; bx++) {
    const i = by * BW + bx, sp = k <= 0 ? pa[i] : k >= 1 ? pb[i] : pa[i] + (pb[i] - pa[i]) * k;
    if (sp < 0.02) continue;
    const o = 3 * ((y0 + by) * W + x0 + bx), a = sp * 0.3;
    CART[o] += SPEC[0] * a; CART[o + 1] += SPEC[1] * a; CART[o + 2] += SPEC[2] * a;
  }
  // the trapdoor: a brass gate that slides aside
  const gx = x0 + dx - 2.9 + gate * 4.4 * (gA.side ? 1 : -1), gy = y0 + dy - 0.5;
  for (let q = 0; q <= 10; q++) {
    const xx = gx + q * 0.48, yy = gy;
    const xi = Math.floor(xx), fx = xx - xi, yi = Math.floor(yy), fy = yy - yi;
    for (let j = 0; j < 2; j++) for (let ii = 0; ii < 2; ii++) {
      const X = xi + ii, Y = yi + j;
      if (X < 0 || X >= W || Y < 0 || Y >= H) continue;
      const w = (ii ? fx : 1 - fx) * (j ? fy : 1 - fy) * 0.45, o = 3 * (Y * W + X);
      CART[o] += BRASS[0] * w; CART[o + 1] += BRASS[1] * w; CART[o + 2] += BRASS[2] * w;
    }
  }
}

// --------------------------------------------------------- particle paths
const P = { x: 0, y: 0 };
const fallTime = (h, v0) => (-v0 + Math.sqrt(v0 * v0 + 2 * G * Math.max(0, h))) / G;
/**
 * A drained grain, tau s after it left the trapdoor at (ex, ey) of `slot`:
 * drops onto the shelf (hour moulds) or the floor (minute moulds), skitters
 * along it to the middle, and falls down the centre to the lower bulb's cone
 * at height `land`. Returns false once it has landed.
 */
function drainPath(slot, ex, ey, tau, hj, land) {
  const line = slot < 2 ? shelfY : floorY, end = slot < 2 ? SHELF_END : FLOOR_END;
  const left = ex < CXW, xe = left ? 1.5 + end : 61.5 - end;
  const ys = line(ex) - 0.8, tA = fallTime(ys - ey, 4);
  if (tau < tA) { P.x = ex; P.y = ey + 4 * tau + 0.5 * G * tau * tau; return true; }
  tau -= tA;
  const v = 16 * (0.8 + 0.4 * hj), a = 45, D = Math.abs(xe - ex);
  const tB = (-v + Math.sqrt(v * v + 2 * a * D)) / a;
  if (tau < tB) {
    const s = v * tau + 0.5 * a * tau * tau, x = ex + (left ? s : -s);
    P.x = x; P.y = line(x) - 0.8 - 1.3 * Math.exp(-9 * tau) * Math.abs(Math.sin(16 * tau + hj * 3)); return true;
  }
  tau -= tB;
  const y0 = line(xe) - 0.8, y = y0 + 8 * tau + 0.5 * G * tau * tau;
  if (y > land) return false;
  P.x = CXW + (xe - CXW) * Math.exp(-tau / 0.08) + (hj - 0.5) * 0.9; P.y = y; return true;
}
/** A poured grain arriving at its mould cell (tx, ty) at time 0; tau <= 0 before. */
const FEED_ARC = 0.16;
function feedPath(slot, tx, ty, tau) {
  const yd = slot < 2 ? 22.2 : 61.4, t1 = fallTime(yd - NECK_Y, 12);
  const T = t1 + FEED_ARC;
  if (tau < -T || tau > 0) return false;
  const t = tau + T;
  if (t < t1) { P.x = CXW; P.y = NECK_Y + 12 * t + 0.5 * G * t * t; return true; }
  const e = (t - t1) / FEED_ARC, ee = 1 - (1 - e) * (1 - e);
  P.x = kit.lerp(CXW, tx, ee); P.y = kit.lerp(yd, ty, e) - 2.2 * Math.sin(Math.PI * e); return true;
}
const feedLead = (slot) => fallTime((slot < 2 ? 22.2 : 61.4) - NECK_Y, 12) + FEED_ARC;

// ---------------------------------------------------------------- vessel
const MODE_ANY = 0, MODE_TOP = 1, MODE_BOT = 2, MODE_FLIP = 3;
const cone = (dx) => 0.62 * (Math.sqrt(dx * dx + 6) - 2.45);
const BP = [{}, {}];                    // per bulb: level, tilt, shape, amp, mode
function bulbSand(o, which, wx, wy, d, sc, f, bump) {
  const b = BP[which];
  let ys = surf(wx, b.level, b.tilt, b.shape, b.amp);
  let glit = 1;
  if (which === 1 && bump) { const k = bump(wx); ys -= k; glit += 0.5 * k; }
  const cov = clamp((wy - ys) * sc + 0.5) * clamp(-d * sc + 0.4);
  if (cov <= 0) return;
  const dx = wx - CXW;
  let band;
  if (b.mode === MODE_TOP) band = wy - LTOP + L0 - f * 14 * Math.exp(-dx * dx / 70);
  else if (b.mode === MODE_BOT) band = wy - cone(dx);
  else if (b.mode === MODE_FLIP) band = wy - ys + L0;
  else band = wy;
  bandColour(band, wx, IMG, o, cov * glit);
}
function drawVessel(flipping, th, sc, f, ph, bump) {
  if (!flipping) {
    for (let p = 0; p < NP; p++) {
      const g = VGLASS[p], o = 3 * p;
      if (g > 0) { const x = p % W, y = (p / W) | 0, k = g * sheen(x, y, ph); IMG[o] = GLASSC[0] * k; IMG[o + 1] = GLASSC[1] * k; IMG[o + 2] = GLASSC[2] * k; }
    }
    for (let y = 0; y < H; y++) {
      if (y >= 18 && y <= 109) continue;
      const which = y > CYW ? 1 : 0;
      for (let x = 0; x < W; x++) { const p = y * W + x; if (VSDF[p] < 0.4) bulbSand(3 * p, which, x, y, VSDF[p], 1, f, bump); }
    }
    return;
  }
  const c = Math.cos(th), s = Math.sin(th), inv = 1 / sc;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const wx = CXW + (px - CXW) * inv, wy = CYW + (py - CYW) * inv;
    const ux = wx - CXW, uy = wy - CYW, vx = CXW + c * ux + s * uy, vy = CYW - s * ux + c * uy;
    if (vx < -3 || vx > 66 || vy < -3 || vy > 130) continue;
    const d = vesselSdf(vx, vy), o = 3 * (py * W + px);
    const g = clamp(1.15 - Math.abs(d) * sc / 0.95);
    if (g > 0) { const k = g * sheen(vx, vy, ph); IMG[o] += GLASSC[0] * k; IMG[o + 1] += GLASSC[1] * k; IMG[o + 2] += GLASSC[2] * k; }
    if (d < 0.4 && (vy < 18 || vy > 109)) bulbSand(o, vy > CYW ? 1 : 0, wx, wy, d, sc, f, null);
  }
}

// ----------------------------------------------------------------- frame
const NOMOVE = new Int32Array(BW * BH).fill(-1e9);
const STREAM_RATE = 44, PIVOT_Y = 60.5;
const hh = (a, b) => kit.hash(a & 0x3fffffff, b);

function frame(ctx) {
  const now = ctx.date.getTime() / 1000, M = Math.floor(now / 60) * 60, sec = now - M;
  const minute = ctx.date.getMinutes(), hourSec = minute * 60 + sec;
  const next = digitsOf(ctx.date), prev = digitsOf(new Date((M - 60) * 1000));
  const flipping = minute === 0 && sec < FLIP;
  const u = flipping ? sec / FLIP : 1;
  const th = flipping ? Math.PI * kit.ease.inOut(u) : 0;
  const cs = Math.abs(Math.cos(th)), sn = Math.abs(Math.sin(th));
  const sc = flipping ? 1 - 0.38 * sn * sn : 1;       // pull back a little; the bulbs sweep out past the edges
  let phi = 0;                                        // the gimballed cartridge swings
  if (flipping) phi = 0.09 * Math.sin(2 * Math.PI * u) * (1 - 0.4 * u);
  else if (minute === 0 && sec < FLIP + 1.6) { const t = sec - FLIP; phi = 0.014 * Math.exp(-3 * t) * Math.sin(9 * t); }
  const f = clamp((hourSec - FLIP) / (3600 - FLIP));
  const T0 = minute === 0 ? FLIP + 0.25 : 0;
  const ph = (now * 13) % 300 - 80;                   // glint sweep

  // ---- the bulbs
  if (flipping) {
    const tilt = -0.32 * Math.sin(Math.PI * u);
    Object.assign(BP[0], { vol: 4, tilt, shape: 0, amp: 0, mode: MODE_ANY });
    Object.assign(BP[1], { vol: VFULL, tilt, shape: SH_CONE, amp: 1 - sst(0, 0.3, u), mode: MODE_FLIP });
  } else {
    Object.assign(BP[0], { vol: 4 + (VFULL - 4) * (1 - f), tilt: 0, shape: SH_CRATER, amp: sst(0, 0.02, f), mode: MODE_TOP });
    Object.assign(BP[1], { vol: 3 + (VFULL - 3) * f, tilt: 0, shape: SH_CONE, amp: 1, mode: MODE_BOT });
  }
  for (let w = 0; w < 2; w++) { const b = BP[w]; b.level = solveLevel(w, th, b.vol, b.tilt, b.shape, b.amp); }
  const apex = flipping ? 108 : BP[1].level;
  // an avalanche slips down one face of the cone every few seconds
  let bump = null;
  if (!flipping) {
    const n = Math.floor(now / 4.3), t = now - n * 4.3;
    if (t < 1.8) {
      const side = hh(n, 9) < 0.5 ? -1 : 1, pos = 2 + 15 * kit.ease.out(t / 1.8), a = 1.1 * (1 - t / 1.8);
      bump = (wx) => { const q = (wx - CXW) * side; return q > 0 ? a * Math.exp(-(((q - pos) / 2.4) ** 2)) : 0; };
    }
  }
  IMG.fill(0);
  drawVessel(flipping, th, sc, f, ph, bump);

  // ---- the cartridge: shelves, floor, four moulds
  CART.fill(0); CA.fill(0);
  for (let p = 0; p < NP; p++) {
    const g = CART_STATIC[p];
    if (g > 0) { const k = 0.65 * g * sheen(p % W, (p / W) | 0, ph), o = 3 * p; CART[o] = GLASSC[0] * k; CART[o + 1] = GLASSC[1] * k; CART[o + 2] = GLASSC[2] * k; }
  }
  const parts = [];                                   // [kind, slot, run|fill, t0]
  for (let slot = 3; slot >= 0; slot--) {
    const side = sideOf(slot), dN = +next[slot], dO = +prev[slot], gN = GLYPHS[side][dN];
    const changed = dN !== dO;
    const delay = 0;                                  // all changing moulds move together: never a mixed old-new time
    const tau = sec - T0 - delay, fN = fillOf(dN, slot);
    const fillEnd = FILL0 + fN.steps / RATE + 0.05;
    if (!changed || tau >= fillEnd) { drawMould(slot, gN, gN, 1, fN.grid, gN, NOMOVE, 0, 1, 0, ph); continue; }
    const gO = GLYPHS[side][dO];
    const gate = sst(0, DRAIN0, tau) * (1 - sst(DRAIN_END, DRAIN_END + 0.25, tau));
    if (tau < DRAIN0) { drawMould(slot, gO, gO, 0, fillOf(dO, slot).grid, gO, NOMOVE, 0, 1, gate, ph); continue; }
    const dr = runOf('drain', dO, slot);
    const dn = Math.min(Math.floor((tau - DRAIN0) * RATE), Math.round((DRAIN_END - DRAIN0) * RATE));
    dr.to(dn);
    parts.push(0, slot, dr, M + T0 + delay + DRAIN0);
    const k = kit.ease.inOut(sst(MORPH0, MORPH1, tau));
    if (tau < FILL0) {
      const fade = 1 - sst(DRAIN_END - 0.05, DRAIN_END + 0.2, tau);
      drawMould(slot, gO, gN, k, dr.grid, gO, dr.moved, dr.step, fade, gate, ph);
    } else {
      const fr = runOf('fill', dN, slot).to(Math.floor((tau - FILL0) * RATE));
      drawMould(slot, gO, gN, k, fr.grid, gN, fr.moved, fr.step, 1, 0, ph);
    }
    parts.push(1, slot, fN, M + T0 + delay + FILL0);
  }

  // ---- compose: vessel behind, cartridge over it (turned and scaled while flipping)
  if (!flipping && phi === 0) {
    for (let p = 0; p < NP; p++) {
      const a = 1 - CA[p], o = 3 * p;
      IMG[o] = IMG[o] * a + CART[o]; IMG[o + 1] = IMG[o + 1] * a + CART[o + 1]; IMG[o + 2] = IMG[o + 2] * a + CART[o + 2];
    }
  } else composeTurned(sc, phi);

  // ---- grains in flight (screen = centre + (world - centre) * sc)
  const S = (x) => CXW + (x - CXW) * sc, SY = (y) => CYW + (y - CYW) * sc;
  for (let q = 0; q < parts.length; q += 4) {
    const kind = parts[q], slot = parts[q + 1], src = parts[q + 2], t0 = parts[q + 3];
    const x0 = SLOT_X[slot], y0 = SLOT_Y[slot], ev = src.events;
    if (kind === 0) {
      for (let e = 0; e < ev.length; e += 3) {
        const tau = now - (t0 + ev[e] / RATE), cell = ev[e + 1];
        if (tau < 0) continue;
        const hj = hh(cell * 31 + ev[e], 2);
        if (!drainPath(slot, x0 + (cell % BW), y0 + Math.floor(cell / BW) + 1, tau, hj, apex)) continue;
        dot(S(P.x), SY(P.y), grainRGB(ev[e + 2], 1.25), 0.9);
      }
    } else {
      const lead = feedLead(slot);
      for (let e = 0; e < ev.length; e += 3) {
        const tau = now - (t0 + ev[e] / RATE);
        if (tau > 0) continue;
        if (tau < -lead) break;
        const cell = ev[e + 1];
        if (!feedPath(slot, x0 + (cell % BW), y0 + Math.floor(cell / BW), tau)) continue;
        dot(S(P.x), SY(P.y), grainRGB(ev[e + 2], 1.3), 0.8);
      }
    }
  }
  drawStream(now, hourSec, flipping, apex, S, SY);

  // ---- out, dimmed at night
  const dim = 1 - 0.6 * ctx.night, idx = kit.grid(ctx).idx, out = ctx.out;
  for (let p = 0; p < NP; p++) {
    const i = idx[p];
    if (i < 0) continue;
    out[3 * i] = IMG[3 * p] * dim; out[3 * i + 1] = IMG[3 * p + 1] * dim; out[3 * i + 2] = IMG[3 * p + 2] * dim;
  }
}

/** The cartridge drawn turned by phi about its pivot and scaled by sc about the centre. */
function composeTurned(sc, phi) {
  const c = Math.cos(phi), s = Math.sin(phi), inv = 1 / sc, o4 = 0.25 * inv;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let q = 0; q < 4; q++) {
      const wx = CXW + (px - CXW) * inv + (q & 1 ? o4 : -o4), wy = CYW + (py - CYW) * inv + (q & 2 ? o4 : -o4);
      const ux = wx - CXW, uy = wy - PIVOT_Y;
      const cx = CXW + c * ux + s * uy, cy = PIVOT_Y - s * ux + c * uy;
      const x0 = Math.floor(cx), y0 = Math.floor(cy), fx = cx - x0, fy = cy - y0;
      if (x0 < 0 || y0 < 0 || x0 >= W - 1 || y0 >= H - 1) continue;
      const p = y0 * W + x0;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      r += CART[3 * p] * w00 + CART[3 * p + 3] * w10 + CART[3 * (p + W)] * w01 + CART[3 * (p + W) + 3] * w11;
      g += CART[3 * p + 1] * w00 + CART[3 * p + 4] * w10 + CART[3 * (p + W) + 1] * w01 + CART[3 * (p + W) + 4] * w11;
      b += CART[3 * p + 2] * w00 + CART[3 * p + 5] * w10 + CART[3 * (p + W) + 2] * w01 + CART[3 * (p + W) + 5] * w11;
      a += CA[p] * w00 + CA[p + 1] * w10 + CA[p + W] * w01 + CA[p + W + 1] * w11;
    }
    const o = 3 * (py * W + px), k = 1 - a / 4;
    IMG[o] = IMG[o] * k + r / 4; IMG[o + 1] = IMG[o + 1] * k + g / 4; IMG[o + 2] = IMG[o + 2] * k + b / 4;
  }
}

/** The thin stream: grains leave the upper neck and fall to the cone, all hour. */
function drawStream(now, hourSec, flipping, apex, S, SY) {
  const Tmax = fallTime(130 - NECK_Y, 12);
  const k0 = Math.floor((now - Tmax) * STREAM_RATE), k1 = Math.floor(now * STREAM_RATE);
  for (let k = k0; k <= k1; k++) {
    const te = (k + 0.8 * hh(k, 3)) / STREAM_RATE, tau = now - te;
    if (tau < 0 || tau > Tmax) continue;
    let hs = hourSec - tau;                            // seconds into the hour it left the neck
    if (hs >= 0 && hs < FLIP + 0.1) continue;          // the neck is sideways: nothing runs
    const left = hs < 0 ? -hs : 3600 - hs;             // the upper bulb runs dry at the hour
    if (hh(k, 4) > 0.22 + 0.78 * sst(0, 50, left)) continue;
    const y = NECK_Y + 12 * tau + 0.5 * G * tau * tau;
    const id = [1, 2, 3, 4, 5, 6, 7, 8, 13, 14, 15, 16][(hh(k, 6) * 12) | 0];   // the stream runs pale: amber, cream, ochre
    if (y > apex) {
      // landed: some grains bounce and roll down a face of the cone
      if (flipping || hh(k, 7) > 0.4) continue;
      const tl = tau - fallTime(apex - NECK_Y, 12);
      if (tl > 0.8) continue;
      const side = hh(k, 8) < 0.5 ? -1 : 1, d = (7 + 6 * hh(k, 10)) * tl - 3.5 * tl * tl;
      const x = CXW + side * (0.8 + d);
      dot(S(x), SY(surf(x, BP[1].level, 0, SH_CONE, 1) - 0.6 - 1.4 * Math.exp(-7 * tl) * Math.abs(Math.sin(12 * tl))), grainRGB(id, 1.2), 0.9 * (1 - tl / 0.8));
      continue;
    }
    if (flipping && y > 108) continue;
    const x = CXW + (hh(k, 5) - 0.5) * 0.8;
    for (let q = 0; q < 3; q++) {                      // a short streak: motion blur
      const t2 = tau - q / 180, y2 = NECK_Y + 12 * t2 + 0.5 * G * t2 * t2;
      dot(S(x), SY(y2), grainRGB(id, 1.5), 0.42);
    }
  }
}

export default {
  name: 'Sand Pour',
  blurb: 'an hourglass whose waist holds four glass tubes bent into numerals: minutes drain and are re-poured grain by grain; on the hour the whole glass turns over',
  layouts: ['hub-tall'], look: 'smoke', fps: 60, brightness: 0.35, dither: true,
  frame,
};
