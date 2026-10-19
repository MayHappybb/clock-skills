// Snack-O-Matic: the whole 128x192 portrait assembly is a vending machine in a
// dark corridor, lit from inside by a cold fluorescent tube. The time is the
// stock: the hours are printed on two soda cans (a tall slanted cola cut),
// the minutes on two crisp bags (a fat bubble cut with an extruded shadow),
// one flavour per numeral, each standing in its spiral coil with the next
// flavours queued behind it.
//
// Always alive: the tube hums and now and then flickers, a moth keeps bonking
// the glass in front of it, reflections slide across the glass, coils twitch,
// the selection display scrolls, the marquee bulbs chase.
// Minute: an unseen customer drops a coin and keys C2; the coil turns once,
// the bag walks to the lip, tips and drops into the bin with a thud (the
// machine jolts), and the next bag, the new numeral, is standing there. A few
// seconds later a hand comes up, pushes the flap and takes the snack.
// Some minutes it gets STUCK: it hangs off the coil, the display says ENJOY,
// and the customer shakes the whole machine, twice for nothing, and on the
// third it falls, exactly at the minute.
// Hour: JACKPOT. The display flashes FREE!, every coil in the top row spins
// and dumps its candy down past the time into the bin, coins gush into the
// return cup, the tube goes wild; then the empty row is restocked from the
// back, and the hand comes for the whole armful.
import * as kit from '../js/kit.js';
import { CAN, BAG, CANDY, canSprite, bagSprite, candySprite, textCols } from './vending-art.js';

const W = 128, H = 192, N = W * H;
const clamp = kit.clamp, ease = kit.ease;
const img = new Float32Array(3 * N), bg = new Float32Array(3 * N), outb = new Float32Array(3 * N);

// ----------------------------------------------------------- geometry
const GLASS = { x0: 5, y0: 15, x1: 95, y1: 155 };            // inner glass, [x0, x1) x [y0, y1)
const BIN = { x0: 9, y0: 160, x1: 91, y1: 187 };
const TUBE = { x0: 9, x1: 91, y: 16 };
const ROW_A = { base: 33, R: 9, ky: 0.42, kz: 2.2, lip: 38 };
const ROW_B = { base: 90, R: 16.5, ky: 0.44, kz: 3.2, lip: 97 };
const ROW_C = { base: 145, R: 20.5, ky: 0.36, kz: 3.0, lip: 151 };
const DECOR_X = [16, 38.5, 61, 83.5];
// the four time slots: hour tens, hour ones (cans), minute tens, minute ones (bags)
const SLOTS = [
  { row: ROW_B, cx: 27.5, can: true, mod: 3 }, { row: ROW_B, cx: 72.5, can: true, mod: 10 },
  { row: ROW_C, cx: 27.5, can: false, mod: 6 }, { row: ROW_C, cx: 72.5, can: false, mod: 10 },
];
const KEYS = []; // 3 x 4 keypad: A B C / 1 2 3 / 4 5 6 / 7 8 9
for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) KEYS.push({ x: 102 + 8 * c, y: 50 + 7 * r });
const KEY_C = 2, KEY_2 = 4;

// ------------------------------------------------------------ colours
const TUBEC = kit.hex('#d8f0ff'), WIRE = [0.16, 0.18, 0.21], GOLD = kit.hex('#ffbf3a');
const LCD = kit.hex('#5dff8a'), AMBER = kit.hex('#ffa53a'), ICE = kit.hex('#5ab8ff');
const SKIN = kit.scale(kit.hex('#d8a488'), 0.42), SLEEVE = kit.scale(kit.hex('#34507a'), 0.3);

// ------------------------------------------------------- raster helpers
function rect(b, x, y, w, h, c, a = 1) {
  for (let j = Math.max(0, y); j < Math.min(H, y + h); j++) for (let i = Math.max(0, x); i < Math.min(W, x + w); i++) {
    const p = 3 * (j * W + i);
    b[p] += (c[0] - b[p]) * a; b[p + 1] += (c[1] - b[p + 1]) * a; b[p + 2] += (c[2] - b[p + 2]) * a;
  }
}
/** Add light c * a at a sub-pixel point, spread bilinearly over 4 pixels. */
function dot(b, x, y, c, a) {
  x -= 0.5; y -= 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  for (let k = 0; k < 4; k++) {
    const xi = x0 + (k & 1), yi = y0 + (k >> 1);
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) continue;
    const w = ((k & 1) ? fx : 1 - fx) * ((k >> 1) ? fy : 1 - fy) * a, p = 3 * (yi * W + xi);
    b[p] += c[0] * w; b[p + 1] += c[1] * w; b[p + 2] += c[2] * w;
  }
}
function text(b, str, x, y, c, a = 1, x0 = -1e9, x1 = 1e9) {
  const cols = textCols(str);
  for (let k = 0; k < cols.length; k++) {
    const xi = x + k; if (xi < x0 || xi >= x1 || xi < 0 || xi >= W) continue;
    for (let r = 0; r < 5; r++) if (cols[k] & (1 << r)) { const p = 3 * ((y + r) * W + xi); b[p] = c[0] * a; b[p + 1] = c[1] * a; b[p + 2] = c[2] * a; }
  }
  return cols.length;
}
function disc(b, cx, cy, r, c, a = 1) {
  for (let j = Math.floor(cy - r - 1); j <= cy + r + 1; j++) for (let i = Math.floor(cx - r - 1); i <= cx + r + 1; i++) {
    if (i < 0 || j < 0 || i >= W || j >= H) continue;
    const cov = clamp(r - Math.hypot(i + 0.5 - cx, j + 0.5 - cy) + 0.5) * a;
    if (cov <= 0) continue;
    const p = 3 * (j * W + i);
    b[p] += (c[0] - b[p]) * cov; b[p + 1] += (c[1] - b[p + 1]) * cov; b[p + 2] += (c[2] - b[p + 2]) * cov;
  }
}

/**
 * Draw sprite S with its point (ox, oy) at screen (cx, cy): scaled by s,
 * foreshortened by cos(pitch) vertically (tipping toward the glass), rolled
 * in-plane by `roll`, lit by `light`, painted over, inside the clip box.
 */
function sprite(S, cx, cy, ox, oy, s, cp, roll, light, cx0, cy0, cx1, cy1) {
  // never quite edge-on: a product turned to the glass still shows its end
  const b = s * (cp < 0 ? -1 : 1) * Math.max(0.2, Math.abs(cp));
  const cr = Math.cos(roll), sr = Math.sin(roll);
  let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
  for (let k = 0; k < 4; k++) {
    const du = ((k & 1) ? S.w : 0) - ox, dv = ((k >> 1) ? S.h : 0) - oy;
    const X = cx + cr * du * s - sr * dv * b, Y = cy + sr * du * s + cr * dv * b;
    if (X < mnx) mnx = X; if (X > mxx) mxx = X; if (Y < mny) mny = Y; if (Y > mxy) mxy = Y;
  }
  const i0 = Math.max(cx0, Math.floor(mnx)), i1 = Math.min(cx1, Math.ceil(mxx)), j0 = Math.max(cy0, Math.floor(mny)), j1 = Math.min(cy1, Math.ceil(mxy));
  const sw = S.w, sh = S.h, A = S.a, Cc = S.c;
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
    const dx = i + 0.5 - cx, dy = j + 0.5 - cy;
    const u = ox + (cr * dx + sr * dy) / s - 0.5, v = oy + (-sr * dx + cr * dy) / b - 0.5;
    if (u < -1 || v < -1 || u >= sw || v >= sh) continue;
    const u0 = Math.floor(u), v0 = Math.floor(v), fu = u - u0, fv = v - v0;
    let a = 0, r = 0, g = 0, bl = 0;
    for (let k = 0; k < 4; k++) {
      const uu = u0 + (k & 1), vv = v0 + (k >> 1);
      if (uu < 0 || vv < 0 || uu >= sw || vv >= sh) continue;
      const w = ((k & 1) ? fu : 1 - fu) * ((k >> 1) ? fv : 1 - fv), q = vv * sw + uu;
      a += A[q] * w; r += Cc[3 * q] * w; g += Cc[3 * q + 1] * w; bl += Cc[3 * q + 2] * w;
    }
    if (a <= 0.002) continue;
    const p = 3 * (j * W + i), ia = 1 - a;
    img[p] = img[p] * ia + r * light; img[p + 1] = img[p + 1] * ia + g * light; img[p + 2] = img[p + 2] * ia + bl * light;
  }
}

// ------------------------------------------------------- static cabinet
function buildStatic() {
  const b = bg;
  b.fill(0);
  // body edges and the control-panel plate
  rect(b, 0, 0, W, H, [0.004, 0.004, 0.005]);
  rect(b, 1, 1, W - 2, H - 2, [0.0015, 0.0015, 0.002]);
  rect(b, 98, 14, 27, 143, [0.007, 0.007, 0.009]);
  rect(b, 98, 14, 27, 1, [0.02, 0.022, 0.026]);
  // marquee lightbox
  for (let y = 2; y < 12; y++) rect(b, 4, y, 120, 1, kit.scale(kit.hex('#a01018'), 0.22 + 0.1 * Math.sin(((y - 2) / 9) * Math.PI)));
  text(b, 'SNACKS', 10, 4, kit.scale(kit.hex('#fff0d0'), 0.55));
  text(b, 'COLD DRINKS', 75, 4, kit.scale(kit.hex('#fff0d0'), 0.55));
  // glass frame
  rect(b, 3, 13, 94, 144, [0.022, 0.024, 0.028]);
  rect(b, 4, 14, 92, 142, [0.008, 0.009, 0.011]);
  // interior back wall: cold, brighter near the tube
  for (let y = GLASS.y0; y < GLASS.y1; y++) {
    const k = Math.exp(-(y - GLASS.y0) / 45);
    for (let x = GLASS.x0; x < GLASS.x1; x++) {
      const e = 0.6 + 0.4 * Math.sin((Math.PI * (x - GLASS.x0 + 0.5)) / (GLASS.x1 - GLASS.x0));
      rect(b, x, y, 1, 1, kit.scale([0.012 + 0.03 * k, 0.02 + 0.05 * k, 0.026 + 0.062 * k], e));
    }
  }
  rect(b, GLASS.x0, GLASS.y0, 1, GLASS.y1 - GLASS.y0, [0.012, 0.018, 0.024]);
  rect(b, GLASS.x1 - 1, GLASS.y0, 1, GLASS.y1 - GLASS.y0, [0.012, 0.018, 0.024]);
  // shelves: the shelf floor behind the coils, then the lip with price tags
  const tags = [[ROW_A, DECOR_X], [ROW_B, [27.5, 72.5]], [ROW_C, [27.5, 72.5]]];
  for (const [row, xs] of tags) {
    rect(b, GLASS.x0, row.base - 3, GLASS.x1 - GLASS.x0, row.lip - row.base + 3, [0.01, 0.016, 0.02]);
    const lh = row === ROW_C ? 4 : 4;
    rect(b, GLASS.x0, row.lip, GLASS.x1 - GLASS.x0, lh, [0.022, 0.026, 0.03]);
    rect(b, GLASS.x0, row.lip, GLASS.x1 - GLASS.x0, 1, [0.13, 0.15, 0.17]);
    for (const x of xs) {
      rect(b, Math.round(x - 4), row.lip + 1, 9, 3, [0.12, 0.12, 0.1]);
      rect(b, Math.round(x - 3), row.lip + 2, 2, 1, [0.02, 0.02, 0.02]);
      rect(b, Math.round(x + 0), row.lip + 2, 3, 1, [0.03, 0.03, 0.03]);
    }
  }
  // the delivery bin: a deep recess under a smoked flap
  rect(b, BIN.x0 - 2, BIN.y0 - 2, BIN.x1 - BIN.x0 + 4, BIN.y1 - BIN.y0 + 4, [0.03, 0.032, 0.036]);
  rect(b, BIN.x0, BIN.y0, BIN.x1 - BIN.x0, BIN.y1 - BIN.y0, [0.0015, 0.002, 0.003]);
  // kick plate grille
  for (let x = 6; x < 122; x += 3) rect(b, x, 189, 2, 2, [0.012, 0.012, 0.014]);
  // display bezel
  rect(b, 100, 16, 24, 11, [0.03, 0.032, 0.036]);
  rect(b, 101, 17, 22, 9, [0.004, 0.012, 0.006]);
  // coin slot: chrome bezel, the slit
  rect(b, 104, 30, 14, 14, [0.05, 0.055, 0.06]);
  rect(b, 105, 31, 12, 12, [0.025, 0.027, 0.03]);
  rect(b, 110, 33, 2, 8, [0.001, 0.001, 0.001]);
  // keypad
  for (const k of KEYS) { rect(b, k.x, k.y, 6, 5, [0.03, 0.033, 0.038]); rect(b, k.x, k.y, 6, 1, [0.06, 0.065, 0.075]); rect(b, k.x + 2, k.y + 2, 2, 1, [0.09, 0.09, 0.085]); }
  // coin return cup and lever
  rect(b, 108, 79, 6, 2, [0.05, 0.055, 0.06]);
  rect(b, 103, 84, 16, 13, [0.04, 0.044, 0.05]);
  rect(b, 104, 85, 14, 11, [0.002, 0.002, 0.003]);
  // the ICE COLD decal (snowflake drawn live, it breathes)
  text(b, 'COLD', 104, 130, kit.scale(ICE, 0.25));
  // sticker stripes
  rect(b, 101, 142, 21, 2, kit.scale(kit.hex('#a01018'), 0.12));
  rect(b, 101, 146, 21, 1, kit.scale(kit.hex('#a01018'), 0.08));
}
buildStatic();

// ----------------------------------------------------------- the clock
const pad = (n) => String(n).padStart(2, '0');
function digitsAt(sec, out) {
  const d = new Date(sec * 1000), s = pad(d.getHours()) + pad(d.getMinutes());
  for (let k = 0; k < 4; k++) out[k] = s.charCodeAt(k) - 48;
  return d.getMinutes() === 0;
}
const OLD = [0, 0, 0, 0], NEW = [0, 0, 0, 0];

// Timeline of one purchase, relative to the minute boundary (s).
function stuckAt(B) { return kit.hash(Math.round(B / 60), 77) < 0.22; }
const NORMAL = { coin: -4.4, k1: -3.6, k2: -3.15, coil0: -2.5, coil1: -0.1 };
const STUCK = { coin: -8.8, k1: -8.0, k2: -7.55, coil0: -7.1, coil1: -5.2 };
const STALL = 0.62, HANG = 50;
/** The stuck snack leans out over the lip, and rocks when the machine is shaken. */
function stuckPitch(tt) {
  let p = HANG * ease.outElastic(clamp((tt - STUCK.coil1 + 0.4) / 1.4));
  for (let k = 0; k < 3; k++) if (tt > SHAKES[k]) { const q = tt - SHAKES[k]; p += (5 + 4 * k) * Math.exp(-4 * q) * Math.sin(16 * q); }
  return p;
}
const SHAKES = [-3.3, -1.9, -0.45], SHAKE_A = [0.010, 0.016, 0.024];

// Coil drawing: a helix seen along its axis, receding up into the machine.
function coil(row, cx, phi, light, front) {
  const R = row.R, turns = 2.6, n = Math.ceil(turns * R * 6.5);
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * turns * kit.TAU, depth = a / kit.TAU - 0.55, ang = a + phi;
    const sn = Math.sin(ang), isFront = depth < 0.05 && sn > 0;
    if (isFront !== front) continue;
    const sc = 1 - 0.035 * depth;
    const x = cx + R * sc * Math.cos(ang), y = row.base - depth * row.kz + R * row.ky * sc * sn;
    const fall = Math.max(0.15, 1 - 0.32 * depth) * light;
    const hl = Math.max(0, -Math.cos(ang + 0.6)) ** 3;
    dot(img, x, y, WIRE, (0.45 + 0.55 * hl) * fall);
    dot(img, x, y + 0.9, WIRE, 0.35 * fall);
    if (front) dot(img, x, y - 0.4, [0.9, 0.95, 1], 0.12 * hl * fall);
  }
}

/** A product falling from a lip into the bin; tt is time since it started to tip. */
const fall = { x: 0, y: 0, cp: 1, roll: 0, s: 1, landed: 0, tLand: 0 };
function fallPose(row, cx, w, h, tt, tip, p0, seed, s0) {
  const pivotY = row.base + row.kz, g = 950;
  if (tt < tip) {
    const p = p0 + (90 - p0) * (tt / tip) ** 2;
    fall.x = cx; fall.y = pivotY; fall.cp = Math.cos((p * Math.PI) / 180); fall.roll = 0; fall.s = s0; fall.landed = 0; fall.tLand = 1e9;
    return 'tip';
  }
  const tf = tt - tip, sEnd = 0.55;
  const y0 = pivotY, pa = 90;
  const yLand = BIN.y1 - 1.5 - (w * sEnd) / 2 - 3 * kit.hash(seed, 3);
  const T = (-25 + Math.sqrt(625 + 2 * g * (yLand - y0))) / g;
  const drift = (kit.hash(seed, 1) - 0.5) * 30, rollEnd = (kit.hash(seed, 2) > 0.5 ? 1 : -1) * (1.35 + 0.4 * kit.hash(seed, 4));
  const k = clamp(tf / T);
  fall.x = clamp(cx + drift * Math.min(tf, T), BIN.x0 + (h * sEnd) / 2, BIN.x1 - (h * sEnd) / 2);
  fall.y = tf < T ? y0 + 0.5 * g * tf * tf + 25 * tf : yLand - 3.5 * Math.exp(-9 * (tf - T)) * Math.abs(Math.sin(11 * (tf - T)));
  fall.cp = Math.cos(((pa + (180 - pa) * k) * Math.PI) / 180);
  fall.roll = rollEnd * k; fall.s = kit.lerp(s0, sEnd, k); fall.landed = tf >= T ? 1 : 0; fall.tLand = T + tip;
  return 'fall';
}

// --------------------------------------------------------------- frame
const st = { jolts: [0, 0, 0, 0, 0, 0, 0, 0], nj: 0 };
function drawItem(Sf, Sb, x, y, ox, oy, s, cp, roll, light, clipGlass, clipBin, binDim) {
  const S = cp >= 0 ? Sf : Sb;
  if (clipGlass) sprite(S, x, y, ox, oy, s, cp, roll, light, GLASS.x0, GLASS.y0, GLASS.x1, GLASS.y1);
  if (clipBin) sprite(S, x, y, ox, oy, s, cp, roll, light * binDim, BIN.x0, BIN.y0, BIN.x1, BIN.y1);
}

export default {
  name: 'Snack-O-Matic',
  blurb: 'a vending machine whose stock is the time: cola-cut hours on soda cans, bubble-cut minutes on crisp bags; each minute one is bought, drops with a thud, sometimes gets stuck and the machine is shaken; JACKPOT on the hour',
  layouts: ['hub-2x3'], look: 'smoke', fps: 60, brightness: 0.5, dither: true,
  frame(ctx) {
    const now = ctx.date.getTime() / 1000, t = now;
    const M = Math.floor(now / 60) * 60;
    const B = now >= M + 51 ? M + 60 : M, tt = now - B;
    const hourB = digitsAt(B, NEW);
    digitsAt(B - 1, OLD);
    const stuck = !hourB && OLD[2] === NEW[2] && OLD[3] !== NEW[3] && stuckAt(B);
    const TL = stuck ? STUCK : NORMAL;
    let nj = 0;
    const jolts = st.jolts;

    // ---- light: the tube hums, sometimes flickers; wild at the jackpot
    let tube = 0.96 + 0.04 * Math.sin(t * 2 * Math.PI * 0.7);
    const win = Math.floor(t / 23), fs = win * 23 + 4 + 14 * kit.hash(win, 5);
    if (kit.hash(win, 6) < 0.6 && t > fs && t < fs + 0.75) tube *= kit.hash(Math.floor(t * 22), 9) > 0.45 ? 1 : 0.2;
    if (hourB && tt > 0 && tt < 1.8) tube *= kit.hash(Math.floor(t * 18), 11) > 0.5 ? 1 : 0.15;
    const L = 0.72 + 0.28 * tube;

    img.set(bg);

    // ---- top row: candy, and the jackpot cascade on the hour
    const binDim = 0.5;
    for (let j = 0; j < 4; j++) {
      const S = candySprite(j), row = ROW_A, cx = DECOR_X[j];
      const tw = Math.floor(t / 5.3 + j * 0.37), tw0 = (tw - j * 0.37) * 5.3 + 2 * kit.hash(tw, j);
      let phi = 1.2 * j + 0.3 * Math.exp(-7 * Math.max(0, t - tw0)) * Math.sin(28 * Math.max(0, t - tw0)) * (t > tw0 ? 1 : 0);
      let v = 0, restock = -1;
      const jack = hourB && tt >= 0 && tt < 12;
      const t0 = 0.4 + 0.22 * j;
      if (jack) {
        v = 3 * clamp((tt - t0) / 2.4);
        phi += v * kit.TAU;
        restock = clamp((tt - 5.6 - 0.35 * j) / 2.2);
      }
      for (let k = 2; k >= 0; k--) {
        let depth = k - v;
        if (jack && v >= 3) depth = k + 3.2 * (1 - ease.out(restock));
        if (depth < -1) continue;
        const lt = L * clamp(1 - 0.3 * depth);
        if (lt <= 0.01) continue;
        const sc = 1 - 0.035 * depth;
        sprite(S, cx, row.base - depth * row.kz, CANDY.w / 2, CANDY.h, sc, 1, 0, lt, GLASS.x0, GLASS.y0, GLASS.x1, GLASS.y1);
        if (k === 0) coil(row, cx, phi, L, false);
      }
      coil(row, cx, phi, L, true);
    }

    // jackpot candy into the bin: it rains down behind the time (so it never
    // crosses a numeral) and lands on top of the heap
    if (hourB && tt >= 0 && tt < HT + 3) {
      for (let j = 0; j < 4; j++) for (let k = 0; k < 3; k++) {
        const td = 0.4 + 0.22 * j + (2.4 * (k + 1)) / 3, q = tt - td;
        if (q < 0) continue;
        fallPose(ROW_A, DECOR_X[j], CANDY.w, CANDY.h, q, 0.12, 0, 1000 + j * 3 + k, 1.035);
        const S = candySprite(j);
        const yy = fall.y + (fall.landed ? -6 * k - 4 * kit.hash(j, k) : 0) + handTake(tt);
        drawItem(S, S, fall.x, yy, CANDY.w / 2, fall.cp > 0.99 ? CANDY.h : CANDY.h / 2, fall.s * 1.25, fall.cp, fall.roll * 0.4, fall.landed ? 0.8 : L, !fall.landed, true, binDim + 0.4 * flapOpen(tt));
      }
    }

    // ---- the time: four coils
    for (let s = 0; s < 4; s++) {
      const sl = SLOTS[s], row = sl.row, cx = sl.cx, mk = sl.can ? canSprite : bagSprite, D = sl.can ? CAN : BAG;
      const changed = OLD[s] !== NEW[s], isStuck = stuck && s === 3;
      const tl = isStuck ? STUCK : NORMAL;
      let v = 0, phi = 0.7 + 1.9 * s;
      // idle twitch
      const tw = Math.floor(t / 7.1 + s * 0.29), tw0 = (tw - s * 0.29) * 7.1 + 3 * kit.hash(tw, 20 + s);
      if (t > tw0) phi += 0.18 * Math.exp(-6 * (t - tw0)) * Math.sin(24 * (t - tw0));
      const queue = [0, 0, 0];
      let tipping = false;
      if (changed) {
        v = ease.inOut(clamp((tt - tl.coil0) / (tl.coil1 - tl.coil0)));
        if (isStuck) v = STALL * v + (1 - STALL) * ease.inOut(clamp((tt - SHAKES[2]) / 0.4));
        phi += v * kit.TAU;
        if (tt < 0) { queue[0] = OLD[s]; queue[1] = NEW[s]; queue[2] = (NEW[s] + 1) % sl.mod; }
        else { tipping = true; queue[0] = NEW[s]; queue[1] = (NEW[s] + 1) % sl.mod; queue[2] = (NEW[s] + 2) % sl.mod; }
      } else { queue[0] = NEW[s]; queue[1] = (NEW[s] + 1) % sl.mod; queue[2] = (NEW[s] + 2) % sl.mod; }
      // queued products, back to front (the back ones only show their tops)
      const vq = tipping ? 0 : v;
      for (let k = 2; k >= 0; k--) {
        const depth = (tipping ? k : k - vq), sc = 1 - 0.035 * depth;
        const lt = L * clamp(1 - 0.28 * depth);
        if (k === 0) coil(row, cx, phi, L, false);
        const S = mk(queue[k], queue[k]);
        let cp = 1, roll = 0, sy = 0, sc2 = sc;
        if (k === 0 && changed && !tipping && v > 0 && v < 1) {
          // the coil end pushes it out: it waddles toward the lip, nodding over
          const w = Math.sin(v * Math.PI);
          roll = 0.07 * w * Math.sin(v * kit.TAU * 2);
          cp = Math.cos(0.32 * w * Math.abs(Math.sin(v * kit.TAU)));
          sy = 2.2 * v; sc2 = sc * (1 + 0.04 * v);
        }
        if (k === 0 && isStuck && !tipping) {
          // hung on the coil end: leans out toward the glass, askew, a little closer
          const p = (stuckPitch(tt) * Math.PI) / 180;
          cp = Math.cos(p); roll = 0.16 * Math.sin(p); sy = 2.5 * Math.sin(p); sc2 = sc * (1 + 0.06 * Math.sin(p));
        }
        sprite(S, cx, row.base - depth * row.kz + sy, D.w / 2, D.h, sc2, cp, roll, lt, GLASS.x0, GLASS.y0, GLASS.x1, GLASS.y1);
      }
      coil(row, cx, phi, L, true);
    }

    // ---- falling and landed products (drawn over the rows, under the glass)
    for (let s = 0; s < 4; s++) {
      if (OLD[s] === NEW[s]) continue;
      const sl = SLOTS[s], isStuck = stuck && s === 3, D = sl.can ? CAN : BAG, mk = sl.can ? canSprite : bagSprite;
      const t0 = 0;
      if (tt < 0) continue;
      let ttt = tt, p0 = 0, tip = 0.24;
      if (isStuck) { p0 = stuckPitch(0); tip = 0.16; }
      const seed = Math.round(B / 60) * 7 + s;
      const mode = fallPose(sl.row, sl.cx, D.w, D.h, ttt, tip, p0, seed, 1.035);
      const take = handTake(tt);
      if (mode === 'tip') drawItem(mk(OLD[s], OLD[s]), mk(OLD[s], -1), fall.x, fall.y, D.w / 2, D.h, fall.s, fall.cp, 0, L, true, false, 1);
      else {
        const y = fall.y + take;
        drawItem(mk(OLD[s], OLD[s]), mk(OLD[s], -1), fall.x, y, D.w / 2, D.h / 2, fall.s, fall.cp, fall.roll, fall.landed ? 0.8 : L, !fall.landed, true, binDim + 0.4 * flapOpen(tt));
        if (nj < 8) jolts[nj++] = B + t0 + fall.tLand;
      }
    }
    // ---- the tube and its glow, the moth, reflections on the glass
    if (L < 0.999) for (let y = GLASS.y0; y < GLASS.y1; y++) for (let x = GLASS.x0; x < GLASS.x1; x++) { const p = 3 * (y * W + x); img[p] *= L; img[p + 1] *= L; img[p + 2] *= L; }
    for (let x = TUBE.x0; x < TUBE.x1; x++) {
      const e = Math.min(x - TUBE.x0, TUBE.x1 - 1 - x) < 2 ? 0.35 : 1;
      for (let y = TUBE.y; y < TUBE.y + 2; y++) { const p = 3 * (y * W + x); img[p] = TUBEC[0] * 0.85 * tube * e; img[p + 1] = TUBEC[1] * 0.85 * tube * e; img[p + 2] = TUBEC[2] * 0.85 * tube * e; }
      for (let y = TUBE.y + 2; y < TUBE.y + 9; y++) { const g = 0.035 * tube * Math.exp(-(y - TUBE.y - 2) / 2.2) * e, p = 3 * (y * W + x); img[p] += TUBEC[0] * g; img[p + 1] += TUBEC[1] * g; img[p + 2] += TUBEC[2] * g; }
    }
    drawMoth(t);
    // reflections: two diagonal sheens sliding slowly across the glass
    const ph = ((t * 7) % 300) - 60;
    for (let y = GLASS.y0; y < GLASS.y1; y++) {
      const base = ph - y * 0.55;
      const xa = Math.max(GLASS.x0, Math.floor(base - 22)), xb = Math.min(GLASS.x1, Math.ceil(base + 22));
      for (let x = xa; x < xb; x++) {
        const q = x - base, gl = 0.016 * Math.exp(-(q * q) / 30) + 0.009 * Math.exp(-((q - 13) ** 2) / 5);
        const p = 3 * (y * W + x); img[p] += gl * 0.85; img[p + 1] += gl * 0.95; img[p + 2] += gl;
      }
    }

    // ---- bin flap (smoked), the hand
    const fo = flapOpen(tt);
    let swing = 0;
    for (let k = 0; k < nj; k++) { const q = t - jolts[k]; if (q > 0 && q < 1.2) swing += Math.exp(-5 * q) * Math.sin(14 * q); }
    const hy = BIN.y0 + 2.5 + 1.6 * swing - 2 * fo;
    for (let x = BIN.x0; x < BIN.x1; x++) {
      dot(img, x + 0.5, hy, [0.05, 0.055, 0.06], 1 - fo * 0.7);
      dot(img, x + 0.5, hy + 1, [0.02, 0.022, 0.025], 1 - fo * 0.7);
    }
    text(img, 'PUSH', 42, BIN.y1 - 7, [0.05, 0.05, 0.05], 1 - fo);
    drawHand(tt);

    // ---- controls: display, coin, keys, coin return, decal, marquee bulbs
    drawControls(t, tt, B, hourB, stuck, TL);

    // ---- the machine moves: shakes (stuck), jolts (landings)
    let th = 0, dy = 0;
    if (stuck) for (let k = 0; k < 3; k++) { const q = tt - SHAKES[k]; if (q > 0) th += SHAKE_A[k] * Math.exp(-4.5 * q) * Math.sin(2 * Math.PI * 2.6 * q); }
    for (let k = 0; k < nj; k++) { const q = t - jolts[k]; if (q > 0 && q < 0.5) dy += 0.9 * Math.exp(-12 * q) * Math.cos(38 * q); }
    const dim = 1 - 0.6 * ctx.night;
    if (Math.abs(th) > 2e-4 || Math.abs(dy) > 0.02) { transform(th, dy); kit.blitGrid(ctx, outb, dim); }
    else kit.blitGrid(ctx, img, dim);
  },
};

// the customer comes back for the snack at HT seconds past the minute
const HT = 27;
function flapOpen(tt) { tt -= HT; return tt < 0.4 ? 0 : clamp(Math.min((tt - 0.4) / 0.4, (2.2 - tt) / 0.5)); }
function handY(tt) {
  tt -= HT;
  if (tt < 0 || tt > 3) return 999;
  return 210 - 34 * ease.out(clamp(tt / 0.7)) + 40 * ease.in(clamp((tt - 1.4) / 1.1));
}
function handTake(tt) { return tt < HT + 1.4 ? 0 : 40 * ease.in(clamp((tt - HT - 1.4) / 1.1)); }

// A hand: palm, four fingers, a thumb, a sleeve; it curls to grab.
const CAPS = new Float32Array(7 * 5);
function drawHand(tt) {
  const hy = handY(tt);
  if (hy > 205) return;
  const hx = 50 + 3 * Math.sin(tt * 2), curl = clamp((tt - HT - 0.75) / 0.35);
  let n = 0;
  const cap = (ax, ay, bx, by, r) => { CAPS[n * 5] = ax; CAPS[n * 5 + 1] = ay; CAPS[n * 5 + 2] = bx; CAPS[n * 5 + 3] = by; CAPS[n * 5 + 4] = r; n++; };
  cap(hx, hy + 2, hx + 3, hy + 40, 4.6);                         // sleeve
  cap(hx - 2.5, hy - 4, hx + 2.5, hy - 4, 4.6);                  // palm
  for (let f = 0; f < 4; f++) {
    const fx = hx - 4.3 + 2.9 * f, len = (f === 0 || f === 3 ? 5 : 6.5) * (1 - 0.55 * curl);
    cap(fx, hy - 8, fx + 0.6 * curl, hy - 8 - len, 1.3);
  }
  cap(hx + 5, hy - 3, hx + 8.5, hy - 7 + 3 * curl, 1.4);         // thumb
  const x0 = Math.floor(hx - 12), x1 = Math.ceil(hx + 13), y0 = Math.max(BIN.y0, Math.floor(hy - 17)), y1 = Math.min(H, Math.ceil(hy + 30));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    let best = -1e9, bi = -1;
    for (let k = 0; k < n; k++) {
      const r = CAPS[k * 5 + 4], d = r - kit.segDist(x + 0.5, y + 0.5, CAPS[k * 5], CAPS[k * 5 + 1], CAPS[k * 5 + 2], CAPS[k * 5 + 3]);
      if (d > best) { best = d; bi = k; }
    }
    const cov = clamp(best + 0.5);
    if (cov <= 0) continue;
    const r = CAPS[bi * 5 + 4], shade = 0.45 + 0.55 * clamp(best / r) ** 0.5;
    const c = bi === 0 ? SLEEVE : SKIN, p = 3 * (y * W + x), a = cov;
    img[p] += (c[0] * shade - img[p]) * a; img[p + 1] += (c[1] * shade - img[p + 1]) * a; img[p + 2] += (c[2] * shade - img[p + 2]) * a;
  }
}

// The moth: flutters round the top of the glass, bonks it in front of the tube.
const MOTH = kit.hex('#cfc2a4');
function drawMoth(t) {
  const f = (t % 3.7) / 3.7;
  let x = 48 + 30 * Math.sin(t * 0.41) + 7 * Math.sin(t * 1.37 + 1);
  let y = 29 + 5 * Math.sin(t * 0.73 + 1) + 1.5 * Math.sin(t * 3.1);
  if (f < 0.16) { const k = Math.sin((Math.PI * f) / 0.16); y = kit.lerp(y, 18.6, k ** 0.6); }
  const flap = Math.abs(Math.sin(t * 2 * Math.PI * 9)), lt = 0.22 + 0.15 * Math.exp(-(y - 18) / 4);
  const c = kit.scale(MOTH, lt);
  // two wings either side of a short body: soft discs that open and close
  for (let k = -1; k <= 1; k += 2) {
    const wx = x + k * (1.1 + 1.6 * flap), wy = y - 0.4 + 0.3 * flap;
    disc(img, wx, wy, 0.9 + 0.9 * flap, kit.scale(c, 0.8), 0.9);
  }
  disc(img, x, y + 0.3, 0.75, kit.scale(c, 0.6), 1);
}

const DISP = textCols('ICE COLD   SNACKS   DRINKS   ').length;
function drawControls(t, tt, B, hourB, stuck, TL) {
  // display: scrolls idly; shows the code being keyed, then ENJOY
  let msg = null;
  if (tt > TL.k1 && tt < TL.k2) msg = 'C';
  else if (tt >= TL.k2 && tt < TL.coil1) msg = 'C2';
  else if (tt >= TL.coil1 && tt < 3) msg = hourB && tt > 0 ? null : 'ENJOY';
  if (hourB && tt > 0 && tt < 8) msg = Math.floor(tt * 2.5) % 2 ? '$$$$$' : 'FREE!';
  if (msg) text(img, msg, 102, 19, LCD, 0.5, 101, 123);
  else {
    const off = Math.floor((t * 9) % DISP);
    text(img, 'ICE COLD   SNACKS   DRINKS   ICE COLD', 102 - off, 19, LCD, 0.32, 101, 123);
  }
  // coin slot: "insert coin" glow; the coin going in
  const cg = 0.04 + 0.02 * Math.sin(t * 3);
  for (let y = 33; y < 41; y++) { dot(img, 109, y + 0.5, LCD, cg); dot(img, 113, y + 0.5, LCD, cg); }
  const cq = tt - TL.coin;
  if (cq > 0 && cq < 0.6) {
    const k = ease.inOut(clamp(cq / 0.6));
    disc(img, 111, 37, 3.2 * (1 - k) + 0.5, kit.scale(GOLD, 0.45), 1 - k * 0.6);
    dot(img, 110, 36, [1, 1, 1], 0.4 * (1 - k));
  }
  // keys: pressed keys light amber and sink a pixel
  for (const [ki, tk] of [[KEY_C, TL.k1], [KEY_2, TL.k2]]) {
    const q = tt - tk;
    if (q < 0 || q > 0.6) continue;
    const g = Math.exp(-q * 5), k = KEYS[ki];
    rect(img, k.x, k.y + 1, 6, 4, kit.scale(AMBER, 0.35 * g + 0.02));
  }
  // coin return: the jackpot spits coins
  if (hourB && tt > 0 && tt < 13) {
    for (let c = 0; c < 9; c++) {
      const tc = 1.0 + c * 0.28, q = tt - tc;
      if (q < 0) continue;
      const restY = 93 - 2.2 * Math.floor(c / 3), restX = 106.5 + 4.5 * (c % 3);
      const y = q < 0.25 ? 85 + (restY - 85) * (q / 0.25) ** 2 : restY - 2 * Math.exp(-10 * (q - 0.25)) * Math.abs(Math.sin(18 * (q - 0.25)));
      const fade = clamp(12.5 - tt);
      disc(img, restX, y, 2.1, kit.scale(GOLD, 0.4), fade);
      dot(img, restX - 0.6, y - 0.7, [1, 0.95, 0.8], 0.25 * fade * (0.5 + 0.5 * Math.sin(t * 9 + c)));
    }
  }
  // the ICE COLD snowflake breathes
  const sb = 0.16 + 0.06 * Math.sin(t * 1.3);
  for (let a = 0; a < 6; a++) {
    const ang = (a * Math.PI) / 3 + 0.1 * Math.sin(t * 0.5);
    for (let r = 0; r <= 7; r += 0.5) {
      dot(img, 111 + r * Math.cos(ang), 118 + r * Math.sin(ang), ICE, sb);
      if (Math.abs(r - 4.5) < 0.3) for (let s = -1; s <= 1; s += 2) for (let q = 0.5; q <= 2; q += 0.5)
        dot(img, 111 + r * Math.cos(ang) + q * Math.cos(ang + s * 0.9), 118 + r * Math.sin(ang) + q * Math.sin(ang + s * 0.9), ICE, sb);
    }
  }
  // marquee bulbs: a slow chase, a fast bright one on the jackpot
  const fast = hourB && tt > -0.5 && tt < 9;
  for (let x = 6; x < 123; x += 4) {
    const ph = fast ? (x / 4 - t * 14) : (x / 4 - t * 2.2);
    const on = 0.5 + 0.5 * Math.cos(ph * (fast ? 1.6 : 0.8));
    const lv = fast ? 0.05 + 0.4 * on ** 4 : 0.03 + 0.08 * on ** 6;
    rect(img, x, 10, 2, 1, kit.scale(AMBER, lv));
  }
}

/** The whole picture rocked by th radians about the foot, and dropped by dy. */
function transform(th, dy) {
  const c = Math.cos(th), s = Math.sin(th), px = 64, py = 196;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const X = i + 0.5 - px, Y = j + 0.5 - py - dy;
    const u = c * X + s * Y + px - 0.5, v = -s * X + c * Y + py - 0.5;
    const u0 = Math.floor(u), v0 = Math.floor(v), fu = u - u0, fv = v - v0, o = 3 * (j * W + i);
    let r = 0, g = 0, b = 0;
    for (let k = 0; k < 4; k++) {
      const uu = u0 + (k & 1), vv = v0 + (k >> 1);
      if (uu < 0 || vv < 0 || uu >= W || vv >= H) continue;
      const w = ((k & 1) ? fu : 1 - fu) * ((k >> 1) ? fv : 1 - fv), q = 3 * (vv * W + uu);
      r += img[q] * w; g += img[q + 1] * w; b += img[q + 2] * w;
    }
    outb[o] = r; outb[o + 1] = g; outb[o + 2] = b;
  }
}
