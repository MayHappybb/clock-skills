// Eighty-Eight: the bow tie is a butterfly, and its markings are the time.
//
// Diaethria, the "88 butterfly" of South America, carries numerals on its
// wings: pale figures ringed by concentric echo lines, cut into cells by the
// veins. Here the hours are the marking on the left wing and the minutes on
// the right; the body, where the two arc boards meet apex to apex, is the colon.
//
// The figures are drawn in the wing's own venation. Each arc board is a
// bipolar lattice of rings round its two outer corners. In its coordinates
// (w = row from the outer margin in to the body, q = the vein radiating from
// the body) the digits are built from columns, veins and ring arcs, every
// anchor on an LED, so they bow with the wing and its pointed arches are
// Gothic. The same 4-row figure is bigger at the margin, smaller by the body.
//
// The butterfly basks: the wings open and close in 3D (foreshortened, the
// tips swelling in perspective as they rise), and the structural blue of the
// scales slides teal -> blue -> violet with the angle, glittering where a scale
// catches the light. Each minute a shiver runs out from the body; the scales
// only the old figure uses flip dark, then the ones the new figure needs flip
// bright, glinting violet as they turn, and the echo lines flow to follow. On
// the hour it takes off: fast beats with the morpho's blue flash, it rises
// away and banks through a turn, sheds scale dust, and settles wearing the
// new hour.
//
// Look: opal at 1.5 mm. Each LED stays a separate soft dot, one powdery scale
// on a black wing, and the board vanishes; the soft edge also lets the thin
// figures read from across a room, which bare packages did not.
//
// Stateless: the distance fields of each digit in each slot are built once at
// load; everything else is a closed-form function of time.
import * as kit from '../js/kit.js';

// ---------------------------------------------------------------- geometry
// One wing in "wing space": xw = distance out from the body axis (mm), y down.
// The board's ring centres sit on its outer edge at (xw = CX, y = -+HALF).
const R0 = 5.042, DC = 81.62, HALF = DC / 2, CX = 72.29;
const R_EDGE = R0 + 76 + 2;                 // the convex sides (ring 20 + margin)
const BASE_SUM = 2 * R0 + 4 * 18;           // rT + rB along the concave base edge

/** Lattice coordinates (w = 1 base .. 20 apex, q = vein, top negative) to wing space. */
function wq2xy(w, q) {
  const rT = 2 * (w + 18) + R0 + 2 * q, rB = 2 * (w + 18) + R0 - 2 * q;
  const y = (rT * rT - rB * rB) / (2 * DC);
  const h = Math.sqrt(Math.max(0, rT * rT - (y + HALF) ** 2));
  return [CX - h, y];
}

// ------------------------------------------------------------------ digits
// Drawn on the lattice itself: x counts rows w (out from the margin), y counts
// veins q. An LED sits wherever x + y is even, so every anchor below is an
// LED; verticals run down a column, slope-1 diagonals run along a ring arc,
// and arches come out as pointed Gothic arcs. Width 4, height H (even); m is
// the waist, an even row (low for 2/3/5/6/8, high for 9).
function glyph(ch, H) {
  const m = 2 * Math.floor(H / 4), M = H - m, B = H - 2;
  switch (ch) {
    case 0: return [[[0, 2], [2, 0], [4, 2], [4, B], [2, H], [0, B], [0, 2]]];
    case 1: return [[[0, 2], [2, 0], [2, H]]];
    case 2: return [[[0, 2], [2, 0], [4, 2], [4, H - 8], [0, H - 4], [0, H], [4, H]]];
    case 3: return [[[0, 2], [2, 0], [4, 2], [4, m - 2], [2, m], [4, m + 2], [4, B], [2, H], [0, B]], [[0, m], [2, m]]];
    case 4: return [[[4, H], [4, 0], [0, 4], [0, M], [4, M]]];
    case 5: return [[[4, 0], [0, 0], [0, m], [2, m - 2], [4, m], [4, B], [2, H], [0, B]]];
    case 6: return [[[4, 2], [2, 0], [0, 2], [0, B], [2, H], [4, B], [4, m + 2], [2, m], [0, m + 2]]];
    case 7: return [[[0, 0], [4, 0], [4, 2], [2, 4], [2, H]]];
    case 8: return [[[2, 0], [4, 2], [4, m - 2], [2, m], [0, m - 2], [0, 2], [2, 0]],
      [[2, m], [4, m + 2], [4, B], [2, H], [0, B], [0, m + 2], [2, m]]];
    case 9: return [[[0, B], [2, H], [4, B], [4, 2], [2, 0], [0, 2], [0, M - 2], [2, M], [4, M - 2]]];
  }
}

// Slots, left to right: H tens (outer left), H units, | body |, M tens, M units
// (outer right). w0 is the row of the glyph's outer side, qt its top vein;
// w0 + qt is even so the glyph lands on LEDs. The units sit nearer the body,
// where the lattice is finer, so the same 4 x H figure comes out smaller.
const SLOTS = [
  { side: -1, w0: 1, qt: -7, H: 14 },
  { side: -1, w0: 7, qt: -5, H: 10 },
  { side: 1, w0: 7, qt: -5, H: 10 },
  { side: 1, w0: 1, qt: -7, H: 14 },
];

/** A slot's digit as segments in wing space (mm), curved along the lattice. */
function glyphSegs(slot, ch) {
  const segs = [];
  // glyph x runs left to right on screen: from the margin on the left wing, from the body on the right
  const map = (gx, gy) => wq2xy(slot.side < 0 ? slot.w0 + gx : slot.w0 + 4 - gx, slot.qt + gy);
  for (const path of glyph(ch, slot.H)) {
    for (let k = 0; k + 1 < path.length; k++) {
      const [ax, ay] = path[k], [bx, by] = path[k + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 1));
      let p = map(ax, ay);
      for (let j = 1; j <= n; j++) {
        const q = map(kit.lerp(ax, bx, j / n), kit.lerp(ay, by, j / n));
        segs.push([p[0], p[1], q[0], q[1]]);
        p = q;
      }
    }
  }
  return segs;
}


// Distance fields on a 1 mm grid over the wing, per (slot, digit), built lazily.
const GX = 76, GY = 90, GY0 = -45;
const fields = new Map();
function field(si, ch) {
  const key = si * 10 + ch;
  let f = fields.get(key);
  if (f) return f;
  const segs = glyphSegs(SLOTS[si], ch);
  f = new Float32Array(GX * GY);
  for (let j = 0; j < GY; j++) {
    for (let i = 0; i < GX; i++) {
      let d = 1e9;
      for (const s of segs) {
        const e = kit.segDist(i, j + GY0, s[0], s[1], s[2], s[3]);
        if (e < d) d = e;
      }
      f[j * GX + i] = d;
    }
  }
  fields.set(key, f);
  return f;
}
// all forty up front (about 0.15 s at load), so no frame pays for one at a minute turn
for (let si = 0; si < 4; si++) for (let ch = 0; ch < 10; ch++) field(si, ch);

function sample(f, x, y) {
  const fx = kit.clamp(x, 0, GX - 1.001), fy = kit.clamp(y - GY0, 0, GY - 1.001);
  const i = Math.floor(fx), j = Math.floor(fy), a = fx - i, b = fy - j, k = j * GX + i;
  return (f[k] * (1 - a) + f[k + 1] * a) * (1 - b) + (f[k + GX] * (1 - a) + f[k + GX + 1] * a) * b;
}

// ------------------------------------------------------------------ colour
const CORE = kit.hex('#eef7ff');
const STOPS = [kit.hex('#10dcff'), kit.hex('#2858ff'), kit.hex('#8636ff'), kit.hex('#28075c')];
const CRIMSON = kit.hex('#ff1430'), GOLD = kit.hex('#ffb648'), SPOT = kit.hex('#fff1dc');

/** Structural blue: the scale's hue slides with the angle it is seen at (rad). */
function irid(phi) {
  const t = kit.clamp(phi / 1.05) * 3, k = Math.min(2, Math.floor(t));
  return kit.mix(STOPS[k], STOPS[k + 1], t - k);
}
const bump = (d, c, w) => { const z = (d - c) / w; return z * z >= 1 ? 0 : (1 - z * z) ** 2; };

// ------------------------------------------------------------------ motion
const F = 260;                 // camera distance (mm) for the wings' perspective
const BEAT = 3.1;              // wing beats per second in flight
const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => pad(d.getHours()) + pad(d.getMinutes());

/** Where the butterfly is and how its wings stand, at epoch second `now`. */
function motion(now, night) {
  const H = Math.floor(now / 3600) * 3600, aH = now - H, aPre = now - (H + 3600);
  const A = 0.74 * (1 - 0.45 * night);
  // at rest: basking, opening and closing slowly
  let th = A * (0.5 - 0.5 * Math.cos(kit.TAU * now / 5.3)) + 0.05 * Math.sin(kit.TAU * now / 1.7) * Math.sin(kit.TAU * now / 5.3) ** 2;
  // a shiver as each minute turns
  const a = now - Math.floor(now / 60) * 60;
  th += 0.09 * Math.sin(kit.TAU * 7 * a) * Math.max(0, 1 - a / 0.7) * (a < 0.7 ? 1 : 0);
  // before the hour: it presses its wings flat, ready
  th *= 1 - 0.9 * kit.smoothstep(-0.7, -0.15, aPre);
  const m = { sc: 1, cx: 0, cy: 0, yaw: 0, thL: th, thR: th, fl: 0, flash: 0, aH };
  if (aH > 4.6) return m;
  // the hour: take-off. The waist of the bow tie pins the body, so the flight
  // is told by the wings and by depth: fast beats, rising away (smaller),
  // banking through a turn (yaw, one wing beating wider), then the descent.
  const fl = kit.smoothstep(0, 0.3, aH) * (1 - kit.smoothstep(3.3, 4.4, aH));
  const ph = kit.TAU * BEAT * aH, open = 0.5 - 0.5 * Math.sin(ph);   // 1 = flat open
  const thb = 0.03 + 0.68 * (1 - open);
  const lift = kit.smoothstep(0.1, 1.0, aH) * (1 - kit.smoothstep(2.6, 3.7, aH));
  const ang = kit.TAU * (aH - 0.7) / 2.4, bank = Math.sin(ang) * lift;
  th = kit.lerp(th, thb, fl);
  m.fl = fl; m.flash = fl * open ** 3;
  m.sc = 1 - 0.2 * lift;
  m.cy = -2.5 * Math.sin(ang * 2) * lift - 1.4 * Math.cos(ph) * fl;
  m.yaw = 0.1 * bank;
  m.thL = th * (1 + 0.2 * bank); m.thR = th * (1 - 0.2 * bank);
  return m;
}

/** Wing space (side, xw, yw) to screen, under motion m. */
function toScreen(m, side, xw, yw) {
  const th = side < 0 ? m.thL : m.thR, k = F / (F - xw * Math.sin(th));
  const lx = side * xw * Math.cos(th) * k * m.sc, ly = yw * k * m.sc;
  const c = Math.cos(m.yaw), s = Math.sin(m.yaw);
  return [m.cx + c * lx - s * ly, m.cy + s * lx + c * ly];
}

/**
 * A changed digit's scales flip in two strict halves: first the scales only the
 * old figure uses flip dark, then the ones only the new figure uses flip
 * bright (scales both share stay lit). So the marking is never a union of the
 * two (9 + 0 would read 8) and an old digit never stands beside a finished new
 * one: all changed slots share the window. o (0..0.25) staggers the scales,
 * body first. Returns [old-only kept, new-only shown, band morph].
 */
function flips(changed, a, hourTurn, o) {
  if (!changed) return [0, 1, 1, 1];
  const t0 = hourTurn ? 1.0 : 0.3, dur = hourTurn ? 1.8 : 1.3;
  const tau = (a - t0) / dur;
  // the shared scales dim to a ghost while the figure is in between, so the
  // half-way shape (9 and 0 share a backwards C) never reads as a digit
  const ghost = 1 - 0.7 * Math.sin(Math.PI * kit.clamp(tau / 0.9 - 0.05)) ** 2;
  return [1 - kit.ease.inOut(kit.clamp((tau - o) / 0.2)), kit.ease.inOut(kit.clamp((tau - 0.55 - o) / 0.2)), kit.ease.inOut(kit.clamp(tau)), ghost];
}

const DUST = 56;

export default {
  name: 'Eighty-Eight',
  blurb: 'a butterfly whose wing markings are the time; it flies a circle each hour and lands with the new one',
  layouts: ['arc-pair'], look: { look: 'opal', gap: 1.5 }, fps: 60, brightness: 0.6, dither: true,
  frame(ctx) {
    const { leds, out } = ctx;
    const now = ctx.date.getTime() / 1000, M = Math.floor(now / 60) * 60, a = now - M;
    const night = ctx.night, dim = 1 - 0.8 * night;
    const prev = digitsOf(new Date((M - 60) * 1000)), next = digitsOf(ctx.date);
    const hourTurn = M % 3600 === 0 && a < 4.6;
    const m = motion(now, night);
    const changed = [0, 1, 2, 3].map((k) => prev[k] !== next[k]);
    const fOld = [0, 1, 2, 3].map((k) => field(k, +prev[k])), fNew = [0, 1, 2, 3].map((k) => field(k, +next[k]));
    const c = Math.cos(m.yaw), s = Math.sin(m.yaw);
    const rip = !hourTurn && a < 2.2 ? a : -1;            // the minute's ripple, running out from the body
    const xf = 4 + 40 * rip;

    for (const l of leds) {
      // screen -> butterfly -> wing space
      const px = l.x - m.cx, py = l.y - m.cy;
      const lx = (c * px + s * py) / m.sc, ly = (-s * px + c * py) / m.sc;
      const side = lx < 0 ? -1 : 1, th = side < 0 ? m.thL : m.thR;
      const Xs = Math.abs(lx), sn = Math.sin(th), cs = Math.cos(th);
      const xw = Xs * F / (F * cs + Xs * sn), yw = ly * (F - xw * sn) / F;
      const h = CX - xw;
      if (h <= 0) continue;
      const rT = Math.hypot(h, yw + HALF), rB = Math.hypot(h, yw - HALF);
      const eSide = Math.min(R_EDGE - rT, R_EDGE - rB), eBase = (rT + rB - BASE_SUM) / 2;
      const edge = Math.min(eSide, eBase);
      if (edge < -0.6) continue;
      const inside = kit.smoothstep(-0.6, 0.8, edge);

      // the marking: this wing's two figures, their scales flipping old -> new
      const nz = kit.noise2(xw * 0.3 + side * 37, yw * 0.3 + now * 0.08);
      const o = 0.25 * (0.6 * kit.clamp(xw / 70) + 0.4 * nz);
      let d = 1e9, core = 0, flip = 0;
      for (const si of side < 0 ? [0, 1] : [2, 3]) {
        const [keep, show, e, ghost] = flips(changed[si], hourTurn ? m.aH : a, hourTurn, o);
        const dO = sample(fOld[si], xw, yw), dN = changed[si] ? sample(fNew[si], xw, yw) : dO;
        const lO = 1 - kit.smoothstep(1.3, 2.7, dO), lN = 1 - kit.smoothstep(1.3, 2.7, dN), both = Math.min(lO, lN);
        core = Math.max(core, both * ghost + (lO - both) * keep + (lN - both) * show);
        flip += (lO - both) * Math.sin(Math.PI * keep) + (lN - both) * Math.sin(Math.PI * show);
        d = Math.min(d, kit.lerp(dO, dN, e));
      }
      // veins: dark lines radiating from the body (the lattice's q lines) cut the echo bands into cells
      const qv = (rT - rB) / 4, vein = kit.smoothstep(0.35, 0.9, Math.abs(qv / 4 - Math.round(qv / 4)) * 4);
      const bands = (0.3 * bump(d, 7.8, 1.7) + 0.14 * bump(d, 14.5, 1.6)) * (1 - core) * vein;

      // the ripple: a wave of scales tipping, colour sliding as it passes
      const wave = rip >= 0 ? Math.exp(-(((xw - xf) / 4.5) ** 2)) * (1 - rip / 2.2) : 0;
      const phi = th + 0.6 * (nz - 0.5) + 0.75 * wave + 0.25 * m.fl;
      const col = irid(phi);
      const glint = Math.exp(-(((phi - 0.42) / 0.07) ** 2));
      const shade = (0.72 + 0.28 * cs) * inside * dim;

      let r = 0, g = 0, b = 0;
      const add = (cc, k) => { r += cc[0] * k; g += cc[1] * k; b += cc[2] * k; };
      add(kit.mix(CORE, col, 0.22), core);
      add(col, bands * (0.8 + 0.4 * nz));
      add([0.75, 0.85, 1], (core + bands) * glint * 0.5);
      // the wing base: a Diaethria-red flush by the body
      add(CRIMSON, 0.3 * kit.smoothstep(17, 5, xw) * (1 - core) * (0.6 + 0.6 * kit.noise2(xw * 0.2, yw * 0.2 + 9)));
      // the margin: a row of pale spots along the edge
      const along = eSide < eBase ? (R_EDGE - rT < R_EDGE - rB ? rB : rT) : yw + 50;
      const sp = Math.abs(along / 9 - Math.round(along / 9)) * 9;
      add(SPOT, 0.2 * (1 - kit.smoothstep(1.0, 2.4, sp)) * (1 - kit.smoothstep(1.2, 3, Math.abs(edge - 2))) * (1 - core));
      // the morpho flash of a wing beat, and the minute's wave crossing the dark
      add(col, (0.16 * m.flash + 0.1 * wave) * (1 - core));
      add([0.8, 0.7, 1], wave * (core + bands) * 0.4 * (0.4 + 0.6 * glint));
      add(kit.mix(STOPS[2], [1, 1, 1], 0.4), 0.9 * flip);
      out[3 * l.i] = r * shade; out[3 * l.i + 1] = g * shade; out[3 * l.i + 2] = b * shade;
    }

    // the body, where the wings meet
    const [bx, by] = toScreen(m, 1, 0, 0);
    kit.splat(ctx, bx, by, 4.6 * m.sc, GOLD, 0.45 * dim * (0.85 + 0.15 * Math.sin(now * 2.1)));

    // scale dust shed in flight
    if (M % 3600 === 0 && a < 6.5) {
      for (let k = 0; k < DUST; k++) {
        const tb = 0.3 + 3.0 * kit.hash(k, 1), life = 1.3 + 1.2 * kit.hash(k, 2), age = m.aH - tb;
        if (age < 0 || age > life) continue;
        const side = kit.hash(k, 5) < 0.5 ? -1 : 1, xw = 30 + 36 * kit.hash(k, 3);
        const yw = (kit.hash(k, 4) - 0.5) * 70 * (1 - xw / 85);
        const [sx, sy] = toScreen(motion(H0(now) + tb, night), side, xw, yw);
        const vx = side * (3 + 7 * kit.hash(k, 6)), vy = 3 + 6 * kit.hash(k, 7);
        const x = sx + vx * age + 2.5 * Math.sin(age * 5 + k), y = sy + vy * age + 3 * age * age;
        const tw = 0.5 + 0.5 * Math.sin(age * 23 + k * 1.7);
        const cc = kit.hash(k, 8) < 0.3 ? GOLD : irid(0.2 + 0.7 * kit.hash(k, 9));
        kit.splat(ctx, x, y, 3.3, cc, 0.75 * dim * tw * (1 - age / life));
      }
    }
  },
};

const H0 = (now) => Math.floor(now / 3600) * 3600;
