// Klangfigur — sand on a driven Chladni plate.
//
// A brass plate is bolted at its centre and driven at one point on its lower
// edge. Fine sand on it is kicked off every part that moves and comes to rest
// where the plate is still: on the nodal lines of the mode it is ringing in,
// and those nodal lines are the four digits of the time. Nothing is written
// on the glass: the digits are the figure a real plate would shake sand into,
// and their strokes are grains.
//
// The drive touches the plate at a point, so what leaves it is a ring. One
// ring leaves every second and spreads across the plate, swelling the sand to
// a bead as it passes and dying away as it travels; the newest ring's radius
// is the second, and it catches the light on the way. Each grain also shivers
// where it lies, and grains that have not found a node yet dance loose in the
// open plate. The driver rides along the edge and back once a minute, so its
// slow slide is the minute's pulse.
//
// At :00 the drive attacks instead of cruising: it locks to the next minute's
// mode and one shock ring runs out across the plate. Behind it the sand has
// already been scoured off the old figure and dropped onto the new one, so
// the time is rewritten outward from the point. In the two seconds before the
// turn the drive is dying, the rings fade and the plate goes quiet — the
// breath before the attack.
//
// On the hour the plate is struck: the sand is thrown clear above it in one
// arc, and it rains back down as the new hour.
//
// Everything is a function of the clock. A grain's resting place is sampled
// from its digit's own nodal curve, so grain i of one digit and grain i of
// the next share a fraction of that curve — which is what lets sand become
// sand. Its position during a turn is closed form in the seconds since the
// attack. Burn-in: the whole face walks kit.orbit and the panel dims
// 23:00-07:00.

import { previousMinute, orbit, dither } from '../js/kit.js';

// ------------------------------------------------------------ the plate
const PL = 5, PR = 122, PT = 6, PB = 52;            // the plate's surface, inclusive
const PLW = PR - PL + 1, PLH = PB - PT + 1;

// ------------------------------------------------------------ the digits
const DW = 21, DH = 40;                             // the design box a digit is drawn in
const TOPY = 9;                                     // screen y of that box
const XS = [8, 33, 74, 99];                         // screen x of each box: HH : MM
const COLON_X = 64, COLON_DY = 5.5;             // the centre clamp: two heaps, the colon

// ------------------------------------------------------------ helpers
const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
const smoother = (u) => { u = clamp01(u); return u * u * u * (u * (u * 6 - 15) + 10); };

function hash(a, b, c) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ------------------------------------------------------------ the nodal curves
//
// Each digit is drawn as a nodal curve of a vibrating plate: no serifs, no
// ruled straight lines, every stroke bowed or S-curved. Centre-lines in a
// DW x DH box, y down. Arcs use clock angles in degrees (0 = up, clockwise).
function arc(cx, cy, rx, ry, a0, a1, n = 18) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    pts.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return pts;
}
function bez(p0, p1, p2, p3, n = 16) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return pts;
}
/** A rounded square — Chladni's own figure for a free square plate. */
function sup(cx, cy, rx, ry, p, n = 44) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI, c = Math.cos(a), s = Math.sin(a);
    pts.push([cx + rx * Math.sign(s) * Math.abs(s) ** (2 / p), cy - ry * Math.sign(c) * Math.abs(c) ** (2 / p)]);
  }
  return pts;
}
/** The 8: one line crossing itself, a narrow loop over a wider one. */
function eight(cx, cy, r1, r2, ry) {
  const pts = [];
  for (let i = 0; i <= 72; i++) {
    const t = (i / 72) * 2 * Math.PI, c = Math.cos(t);
    pts.push([cx + (c > 0 ? r1 : r2) * Math.sin(2 * t), cy - ry * c]);
  }
  return pts;
}
const turn180 = (paths) => paths.map((p) => p.map(([x, y]) => [DW - x, DH - y]));

// One path per stroke; a digit is a list of paths.
const SKEL = {
  0: [sup(10.5, 20, 7.2, 18.0, 2.6)],
  1: [
    [...bez([4.2, 11.2], [6.8, 4.2], [9.4, 0.7], [11.7, 1.7]),
     ...bez([11.7, 1.7], [12.6, 10], [11.9, 24], [10.4, 35.6]).slice(1),
     ...bez([10.4, 35.6], [9.9, 38.2], [11.8, 39.8], [14.4, 39.8]).slice(1)],
  ],
  2: [
    [...arc(10.5, 11.4, 7.1, 8.9, -72, 110),
     ...bez([17.2, 14.6], [17.6, 22.5], [10.6, 30.5], [3.5, 38.4]).slice(1),
     ...bez([3.5, 38.4], [4.4, 39.7], [10.5, 39.7], [19.4, 39.7]).slice(1)],
  ],
  3: [arc(10.2, 10.8, 6.5, 7.9, -80, 184), arc(10.2, 29.6, 6.9, 10.6, -4, 250)],
  4: [
    bez([15.6, 1.2], [15.2, 14], [15.4, 27], [16.2, 39.4]),
    [...bez([15.6, 1.2], [11.4, 12], [7.2, 22.4], [2.8, 29.8]),
     ...bez([2.8, 29.8], [7.4, 30.2], [13.2, 30.4], [19.2, 30.2]).slice(1)],
  ],
  5: [
    [...bez([18.4, 2.2], [13, 1.3], [8, 1.3], [4.6, 2.0]),
     ...bez([4.6, 2.0], [4.0, 9], [4.0, 15], [4.2, 22.2]).slice(1),
     ...arc(10.0, 28.0, 6.9, 10.4, -56, 232).slice(1)],
  ],
  6: [
    [...bez([16.2, 2.6], [6.6, 3.4], [2.1, 15], [3.4, 29.0]),
     ...arc(10.3, 29.2, 6.9, 10.4, -90, 270).slice(1)],
  ],
  7: [
    [...bez([3.0, 2.2], [8.5, 1.5], [14, 1.5], [18.4, 2.2]),
     ...bez([18.4, 2.2], [16.6, 10], [13.6, 18], [12.1, 22]).slice(1),
     ...bez([12.1, 22], [10.5, 28], [8.4, 34], [6.2, 39.6]).slice(1)],
  ],
  8: [eight(10.4, 20.4, 6.1, 7.1, 19.5)],
};
SKEL[9] = turn180(SKEL[6]);

// Flatten each digit's paths into one sampled curve, so a grain can be asked
// for "the point 37% along this digit".
const SAMP = 0.34, DENS = 9.0;        // sample step (px) and grains per px of curve
const CURVE = {};
for (const d of Object.keys(SKEL)) {
  const pts = [];
  let len = 0;
  for (const path of SKEL[d]) {
    for (let i = 1; i < path.length; i++) {
      const [ax, ay] = path[i - 1], [bx, by] = path[i];
      const seg = Math.hypot(bx - ax, by - ay);
      const n = Math.max(1, Math.round(seg / SAMP));
      for (let j = i === 1 ? 0 : 1; j <= n; j++) {
        const u = j / n;
        pts.push({ x: ax + (bx - ax) * u, y: ay + (by - ay) * u, s: len + seg * u });
      }
      len += seg;
    }
  }
  CURVE[d] = { pts, len };
}
/** The point, tangent and normal at fraction `fr` along the digit's curve.
 *  Written into one scratch record: this runs thousands of times a frame and
 *  must not allocate. */
const AT = { x: 0, y: 0, tx: 0, ty: 0, nx: 0, ny: 0 };
function at(d, fr) {
  const { pts, len } = CURVE[d];
  const target = clamp01(fr) * len;
  let lo = 0, hi = pts.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (pts[mid].s < target) lo = mid + 1; else hi = mid; }
  const b = pts[lo], a = pts[Math.max(0, lo - 1)];
  const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
  AT.x = b.x; AT.y = b.y; AT.tx = dx / l; AT.ty = dy / l; AT.nx = -dy / l; AT.ny = dx / l;
  return AT;
}

// ------------------------------------------------------------ the sand
//
// Grains sit along the curve at a fixed linear density, in a band whose core
// is packed and whose edge is loose, so the pile has the soft edge sand has.
const CORE = 1.15;                    // half-width of the packed core of the line, px
const MAXG = Math.ceil(Math.max(...Object.values(CURVE).map((c) => c.len)) * DENS) + 4;
const OFF = new Float32Array(MAXG), PH = new Float32Array(MAXG), SED = new Float32Array(MAXG);
for (let i = 0; i < MAXG; i++) {
  // most of the sand lies packed in the core of the line; the rest is the
  // strays that never quite settled
  const u = hash(i, 7, 11) * 2 - 1, core = hash(i, 13, 17) < 0.90;
  OFF[i] = Math.sign(u) * (core ? Math.abs(u) * CORE : CORE + 0.05 + Math.abs(u) * 0.8);
  PH[i] = hash(i, 19, 23) * 6.283;
  SED[i] = hash(i, 29, 31);
}
const COUNT = {};
for (const d of Object.keys(CURVE)) COUNT[d] = Math.max(40, Math.round(CURVE[d].len * DENS));

/** The rest positions of digit `d`'s sand, in design-box coordinates. */
const HOME = {};
for (const d of Object.keys(CURVE)) {
  const n = COUNT[d], out = new Array(n);
  for (let i = 0; i < n; i++) {
    const sd = d.charCodeAt(0);
    const fr = clamp01((i + 0.5 + 1.5 * (hash(i, sd, 3) - 0.5)) / n);
    const p = at(d, fr);
    out[i] = { x: p.x + p.nx * OFF[i], y: p.y + p.ny * OFF[i], nx: p.nx, ny: p.ny, fr };
  }
  HOME[d] = out;
}

// ------------------------------------------------------------ the colon
//
// The plate is bolted at its centre, so that is where it is stillest, and
// that is where the sand lies deepest: two heaps either side of the bolt,
// which read as the colon. They are sand rather than hardware for two
// reasons -- they belong to the same world as the digits, and a pile of
// grains that never stop moving cannot burn a dot into the glass.
const HEAP = [];
for (let i = 0; i < 132; i++) {
  const dy = i & 1 ? COLON_DY : -COLON_DY;
  const a = hash(i, 71, dy > 0 ? 9 : 4) * 6.283;
  const r = Math.sqrt(hash(i, 73, dy > 0 ? 11 : 6)) * 2.2;
  HEAP.push({ cy: dy, x: Math.cos(a) * r, y: Math.sin(a) * r, ph: hash(i, 79, 3) * 6.283 });
}

// ------------------------------------------------------------ the loose sand
//
// Grains that have not found a node yet: they never rest, they are kicked by
// whatever the plate is doing under them, and they wander the open plate.
const NL = 26;
const LOOSE = new Array(NL);
for (let j = 0; j < NL; j++) {
  LOOSE[j] = {
    x: PL + 4 + hash(j, 41, 5) * (PLW - 8),
    y: PT + 4 + hash(j, 43, 6) * (PLH - 8),
    ph: hash(j, 47, 7) * 6.283,
    r: 0.7 + hash(j, 53, 8) * 2.1,
    sp: 0.8 + hash(j, 59, 9) * 2.4,
  };
}

// ------------------------------------------------------------ the wave
//
// The driver touches the plate at a point, so what it sends out is a ring.
// One leaves the contact point every second and its radius is that second: the
// sand swells to a bead as the ring passes over it. The ring's speed is set
// so the edge of the plate is reached exactly as the next one is born.
const CROSS = 58;                     // px a ring travels in its second
const WAVE_W = 4.2;                   // half-width of the swelling band, px

// ------------------------------------------------------------ the turn
const TTURN = 2.2;                    // the minute's attack, seconds
const TTURN_H = 2.4;                  // the hour's
const SWEEP = 1.5;                    // how long the shock takes to cross
const SWEEP_H = 2.1;
const SHOCK = 152;                    // px the shock travels
const HTHROW = 1.3;                   // how long the hour's sand is in the air
const HLIFT = 26;                     // how far above the plate it is thrown
const BAND = 24;                      // how far a grain takes to re-form, px
const PUFF = 9;                       // how far the minute's attack lifts the sand, px
const SQ = (v) => v * v;

// ------------------------------------------------------------ the rim
//
// The plate's edge, walked once as a list so the near edge can be drawn a
// pixel heavier than the far one: a free-edged plate is thin, and the only
// place its thickness shows is along the bottom.
const RIM = [];
for (let x = PL; x <= PR; x++) { RIM.push([x, PT, 0, -1]); RIM.push([x, PB, 0, 1]); }
for (let y = PT + 1; y < PB; y++) { RIM.push([PL, y, -1, 0]); RIM.push([PR, y, 1, 0]); }

export default {
  name: 'Klangfigur',
  blurb: 'A driven brass plate: the sand on its nodal lines spells the time, and every second a ring sets out from the point that drives it.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { fields: f, date, oled, night }) {
    const [ox, oy] = orbit(date);
    const s = f.sec;
    const prev = previousMinute(date);
    const cur = f.hh + f.mm, old = prev.hh + prev.mm;

    // ---- the drive -------------------------------------------------------
    // The point makes one pass along the edge a minute, out and back; it is
    // quickest in the middle and still at the ends, and the last two seconds
    // before :00 it is slowing into the turn.
    const ph = (s < 30 ? s : 60 - s) / 30;              // 0 -> 1 -> 0 across the minute
    const speed = Math.sin(Math.PI * ph);               // 0 at the ends, 1 mid-pass
    const quiet = smooth((s - 57.6) / 2.4);             // the ring-down before :00
    const hour = f.m === 0;
    const TT = hour ? TTURN_H : TTURN;
    const tt = s < TT ? 1 : 0;                          // inside a turn
    const attack = tt ? 1 - smooth(s / TT) : 0;
    const drive = (0.42 + 0.58 * speed) * (1 - 0.62 * quiet);

    // ---- the driver ------------------------------------------------------
    // A carriage on a rail under the plate, carrying the point that drives
    // it. It rides the rail once a minute, and where its point touches is
    // where every ring comes from.
    const drvX = 26 + 72 * (1 - Math.cos(Math.PI * ph)) / 2;
    const tipX = Math.round(drvX + ox), tipY = PB + 1 + oy;
    g.hline(PL + 1, 62 + oy, PLW - 2, 1);                // the rail
    g.fillRect(tipX - 4, tipY + 5, 9, 4, 1);             // the carriage
    g.fillRect(tipX - 2, tipY + 3, 5, 2, 1);             // its collar
    g.fillRect(tipX - 1, tipY, 3, 3, 1);                 // the point

    // ---- the wave the driver is sending out ------------------------------
    // Rings, one per second, from the point that touches the plate. They die
    // away as they travel, so the newest is the brightest and its radius is
    // the second. The turn replaces them with one hard shock.
    const srcX = tipX, srcY = tipY;
    const frac = s - Math.floor(s);
    const shockR = tt ? smoother(clamp01(s / (hour ? SWEEP_H : SWEEP))) * SHOCK : 0;
    const wAmp = tt ? 1.5 + 2.6 * attack : (0.85 + 0.5 * speed) * (1 - 0.5 * quiet);
    const ring0 = tt ? shockR : frac * CROSS;
    const ring1 = tt ? 0 : (frac + 1) * CROSS;
    const dec1 = tt ? 0 : Math.max(0, 1 - (frac + 1) / 2.25);

    // ---- the plate's edge: free, so it is only as thick as the metal -----
    for (let i = 0; i < RIM.length; i++) {
      const [x, y, nx, ny] = RIM[i];
      g.pixel(x + ox, y + oy, 1);
      if (ny > 0) g.pixel(x + ox, y + oy - 1, 1);         // the near edge reads as thickness
    }

    // ---- the colon: the two heaps of sand at the centre clamp ------------
    const heapAmp = 0.5 + 0.8 * drive;
    for (let i = 0; i < HEAP.length; i++) {
      const h = HEAP[i];
      const sh = heapAmp * Math.sin(h.ph + s * 3.1) + 0.45 * Math.sin(h.ph * 2.7 + s * 5.3);
      g.pixel(Math.round(COLON_X + h.x + ox + sh * 0.55), Math.round(29 + h.cy + h.y + oy + sh), 1);
    }

    // ---- the sheen: the plate is metal, and a wave running through it
    // catches the light. A faint dithered band on the crest of each ring, so
    // the rings read even where the plate is bare. Walking the crest column
    // by column is a whole plate's worth of pixels for a hundred square
    // roots. The dither pattern is carried along with the ring so the
    // texture travels instead of swimming.
    const wS = 5.0, off0 = Math.round(ring0), off1 = Math.round(ring1);
    for (let x = PL + ox; x <= PR + ox; x++) {
      const dxr = x + 0.5 - srcX;
      for (let n = 0; n < 2; n++) {
        const r = n ? ring1 : ring0;
        const lvl0 = (n ? dec1 : 1) * 0.21 * Math.min(1, wAmp);
        if (!lvl0 || !r) continue;
        const h2 = r * r - dxr * dxr;
        if (h2 <= 0) continue;
        const yArc = srcY - Math.sqrt(h2);
        const y0 = Math.max(PT + oy, Math.ceil(yArc - wS)), y1 = Math.min(PB + oy, Math.floor(yArc + wS));
        const dxo = x + (n ? off1 : off0);
        for (let y = y0; y <= y1; y++) {
          const q = (y - yArc) / wS;
          const lvl = (1 - q * q) * lvl0;
          if (lvl > 0 && dither(dxo, y, lvl)) g.pixel(x, y, 1);
        }
      }
    }

    // ---- the sand --------------------------------------------------------
    for (let k = 0; k < 4; k++) {
      const dNew = cur[k], dOld = old[k];
      const hx = XS[k] + ox, hy = TOPY + oy;
      const changing = tt && (hour || dNew !== dOld);
      const list = HOME[dNew];
      for (let i = 0, n = list.length; i < n; i++) {
        const h = list[i];
        let px = hx + h.x, py = hy + h.y, fly = 0;

        if (changing) {
          // it starts where the old digit's same fraction of curve was
          const o = at(dOld, h.fr);
          const sx = hx + o.x + o.nx * OFF[i], sy = hy + o.y + o.ny * OFF[i];
          const tx = hx + h.x, ty = hy + h.y;
          if (hour) {
            // the hour: the whole figure is thrown up off the plate in one
            // arc and comes down as the new one. It is off the plate within
            // a third of a second, so nothing stale is ever left standing.
            const p = clamp01(s / HTHROW);
            fly = Math.sin(Math.PI * p);
            // a little variation per grain, so it is thrown as a spray
            // and not as a sheet
            const cx = (sx + tx) / 2, cy = (sy + ty) / 2 - HLIFT - (SED[i] - 0.5) * 17;
            const u = smooth(p < 0.5 ? p / 0.18 : (p - 0.5) / 0.5);
            const ax = p < 0.5 ? sx : cx, ay = p < 0.5 ? sy : cy;
            const bx2 = p < 0.5 ? cx : tx, by2 = p < 0.5 ? cy : ty;
            px = ax + (bx2 - ax) * u + (SED[i] - 0.5) * 17 * fly;
            py = ay + (by2 - ay) * u + (hash(i, 3, k) - 0.5) * 13 * fly;
          } else {
            // the minute: the attack puffs the old figure off the plate at
            // once -- the moment :00 arrives nothing stale is still standing
            // -- and the shock ring lays the new one down as it passes, so
            // the time is rewritten outward from the point.
            const puff = smooth(clamp01(s / 0.24));
            const kick = puff * (0.45 + 0.55 * SED[i]);
            const ax = sx + (SED[i] - 0.5) * 6 * kick;
            const ay = sy - PUFF * kick + (hash(i, 3, k) - 0.5) * 4 * kick;
            const p = smooth(clamp01((ring0 - Math.sqrt(SQ(sx - srcX) + SQ(sy - srcY))) / BAND + 0.5));
            px = ax + (tx - ax) * p;
            py = ay + (ty - ay) * p;
            fly = Math.max(puff - p, Math.sin(Math.PI * p));
          }
        }

        // the rings swell the sand as they pass over it
        const dx = px - srcX, dy = py - srcY;
        const D = Math.sqrt(dx * dx + dy * dy);
        let band = 0;
        const q0 = (D - ring0) / WAVE_W;
        if (q0 > -1 && q0 < 1) band = 1 - q0 * q0;
        if (dec1 > 0) {
          const q1 = (D - ring1) / WAVE_W;
          if (q1 > -1 && q1 < 1) band += (1 - q1 * q1) * dec1;
        }
        if (band > 0) {
          const bx = D > 0.01 ? dx / D : 0, by = D > 0.01 ? dy / D : 1;
          px += bx * band * wAmp * 1.5;
          py += by * band * wAmp * 1.5 - band * wAmp * 0.4;
        }

        // and every grain shivers where it lies
        const sh = (0.10 + 0.34 * drive + 2.2 * fly) *
          Math.sin(PH[i] * 2.3 + s * 4.6 + (SED[i] - 0.5) * 1.6 + h.fr * 7.0);
        g.pixel(Math.round(px + h.nx * sh), Math.round(py + h.ny * sh), 1);
      }
    }

    // ---- the loose sand --------------------------------------------------
    for (let j = 0; j < NL; j++) {
      const L = LOOSE[j];
      const hop = Math.abs(Math.sin(s * L.sp * 2.6 + L.ph));
      let px = L.x + Math.sin(s * 0.62 + L.ph * 2.1) * L.r * 3.4 + (hop - 0.5) * L.r;
      let py = L.y + Math.cos(s * 0.51 + L.ph * 1.7) * L.r * 2.6 - hop * hop * L.r * 1.7;
      const dx = px - srcX, dy = py - srcY;
      const D = Math.sqrt(dx * dx + dy * dy);
      let band = 0;
      const q0 = (D - ring0) / (WAVE_W * 2);
      if (q0 > -1 && q0 < 1) band = 1 - q0 * q0;
      if (dec1 > 0) {
        const q1 = (D - ring1) / (WAVE_W * 2);
        if (q1 > -1 && q1 < 1) band += (1 - q1 * q1) * dec1;
      }
      py -= band * wAmp * 3.2;
      px += band * wAmp * 0.8 * Math.sin(L.ph + s * 3);
      g.pixel(Math.round(px + ox), Math.round(py + oy), 1);
    }

    oled.contrast(0xcf + (0x24 - 0xcf) * night);
  },
};
