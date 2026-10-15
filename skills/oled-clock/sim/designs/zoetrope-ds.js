// Zoetrope — two slotted drums on a stand: the time is the loop of film
// running inside them.
//
// Two cylinders stand on a base, seen from a little above. The big one is the
// minute reel, the small one the hour reel. Each is drawn as a real cylinder.
// A screen column x is at the drum's own angle, theta = asin((x-cx)/r); the
// near wall is a cage of vertical slats, black but for a highlight, and behind
// it, through the slits and over the near rim, is the inner far wall carrying
// the strip. The far wall is visible between the two rim ellipses of its own
// circle, which is why a drum's top reads as a mouth: the near rim dips (a
// smile) and the far rim rises (a frown) by r*sin(phi)*cos(theta), and the
// film's perforated top edge shows in the gap between them.
//
// The strip is film. Frames run round it, one per minute on the big drum and
// one per hour on the small one, and the frame at the front of each drum is
// the time. Neighbouring frames are visible where the wall turns away, dimmer
// and compressed by the projection, so a loop of frames recedes into the
// dark: the strip is a loop, and the drum is the loop. The digits are printed
// on that strip and inherit the cylinder, a stroke thinner where the wall
// turns away. They come from a signed-distance field sampled through the same
// asin, so a frame travelling to the silhouette shrinks and wraps as ink
// would, and the whole face is smooth to the pixel at any instant.
//
// Idle motion is the drum's own: each turns once a minute, so the minute
// drum's slats comb across its frames every four seconds and the bead on each
// rim walks right round it, sub-pixel, once a minute.
//
// The minute: the drum winds up and spins (two whole extra turns, so the
// slats smear away and the digits dim inside the blur), the strip slips
// exactly one frame pitch with a spring overshoot, and the old minute is
// carried round the curve of the drum while the new one grows out of the far
// silhouette. The hour: the same, but the longer three-turn wind-up is
// followed by a second whirr as the drums settle, and both reels turn over.
//
// Burn-in: kit.orbit walks the drums, the base and the base's dither; the
// rims thin to a dotted line where the wall turns away; the panel dims from
// 23:00 (ctx.night).

import { clamp, dither, progress, orbit, clockFields } from '../js/kit.js';

const TAU = Math.PI * 2;
const W = 128, H = 64;

// ------------------------------------------------------------------ letterforms
// A condensed geometric numeral with round terminals, the shape of a film
// print. Authored as centre-lines in a 10 x 14 box; the ink box below is what
// gets mapped onto the strip, so the face is one weight at any size.

const GX0 = 2.2, GY0 = 2.4, GW = 6.0, GH = 9.2;
const GR = 0.68;              // stroke radius, glyph units
const AA = 0.085;             // edge softening, glyph units
const BAR = 1.0;              // how brightly the drum's slats catch the light

const arc = (cx, cy, rx, ry, a0, a1, n = 12) => {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return p;
};

const PATHS = {
  0: [arc(5, 7, 2.65, 4.4, 0, TAU, 26)],
  1: [[[3.7, 4.5], [5.2, 2.8]], [[5.2, 2.8], [5.2, 11.4]], [[3.4, 11.4], [7.0, 11.4]]],
  2: [[...arc(5, 4.6, 2.9, 2.9, Math.PI, TAU + 0.9, 12), [7.95, 7.0], [2.35, 11.4], [8.0, 11.4]]],
  3: [[...arc(5.15, 4.6, 2.85, 2.6, Math.PI, TAU + 1.35, 12),
    ...arc(5.15, 9.6, 2.85, 2.5, -1.35, Math.PI, 12)]],
  4: [[[7.1, 2.7], [2.3, 9.5], [8.2, 9.5]], [[7.1, 2.7], [7.1, 11.5]]],
  5: [[[8.0, 2.8], [2.5, 2.8], [2.5, 6.6], [5.6, 6.7]],
    [...arc(5.6, 9.2, 2.6, 2.6, -Math.PI / 2, Math.PI, 14), [2.4, 10.7]]],
  6: [[[7.6, 2.8], ...arc(6.4, 5.0, 3.0, 2.4, -Math.PI / 2, -Math.PI, 8), [3.4, 9.0],
    ...arc(5.6, 9.0, 2.3, 2.4, Math.PI, -Math.PI / 2, 14)]],
  7: [[[2.4, 2.8], [8.0, 2.8], [4.4, 11.5]]],
  8: [arc(5, 4.85, 2.75, 2.55, 0, TAU, 22), arc(5, 9.25, 2.85, 2.5, 0, TAU, 24)],
};
// 9 is 6 turned over.
PATHS[9] = PATHS[6].map((p) => p.map(([x, y]) => [10 - x, 14 - y]));

// A distance field per digit, in glyph units, built once at load.
const SDFR = 10, SDFW = Math.round(GW * SDFR), SDFH = Math.round(GH * SDFR);

function buildSDF(d) {
  const segs = [];
  for (const poly of PATHS[d])
    for (let i = 1; i < poly.length; i++)
      segs.push([poly[i - 1][0], poly[i - 1][1], poly[i][0], poly[i][1]]);
  const out = new Uint8Array(SDFW * SDFH);
  for (let j = 0; j < SDFH; j++) {
    const gy = GY0 + (j + 0.5) / SDFR;
    for (let i = 0; i < SDFW; i++) {
      const gx = GX0 + (i + 0.5) / SDFR;
      let best = 1e9;
      for (const [ax, ay, bx, by] of segs) {
        const dx = bx - ax, dy = by - ay;
        const l2 = dx * dx + dy * dy;
        const u = l2 ? Math.max(0, Math.min(1, ((gx - ax) * dx + (gy - ay) * dy) / l2)) : 0;
        const e = Math.hypot(gx - ax - u * dx, gy - ay - u * dy);
        if (e < best) best = e;
      }
      out[j * SDFW + i] = Math.min(255, Math.round(best * 64));
    }
  }
  return out;
}
const SDF = Array.from({ length: 10 }, (_, d) => buildSDF(d));

// ------------------------------------------------------------------ the drums

const MIDY = 29.5;              // both rows of digits sit on one line

/** cx, r, top, bot: the cylinder. n slits, `open` the fraction left open.
 *  sinPhi: the camera's tilt, so the rims are ellipses of half-height r*sinPhi.
 *  Then per digit: arc width, gap, screen height, and the frame pitch. */
function makeDrum(cx, r, top, bot, n, open, sinPhi, WA, GAP, HH, PITCH) {
  return { cx, r, top, bot, n, open, dipv: r * sinPhi, WA, GAP, HH, PITCH, midY: MIDY, FA: 2 * WA + GAP };
}

// The big drum: minutes. The small one: hours.
const MIN_D = makeDrum(87, 38, 9, 51, 14, 0.88, 0.11, 21, 5.0, 28, 53);
const HR_D = makeDrum(21, 21, 9, 51, 8, 0.88, 0.11, 22, 4.0, 28, 54);

/** Coverage 0..1 of the strip at arc coordinate `arcPos`, `dy` below the digits' middle. */
function stripCov(D, arcPos, dy, slideArc, digitAt, rad = GR) {
  const k = Math.round((arcPos + slideArc) / D.PITCH);
  const u = arcPos + slideArc - k * D.PITCH + D.FA * 0.5;
  if (u < 0 || u > D.FA) return 0;
  const right = u >= D.WA + D.GAP;
  if (!right && u > D.WA) return 0;          // the gap between the two digits
  const gu = ((right ? u - D.WA - D.GAP : u) / D.WA) * GW;
  const gv = ((dy + D.HH * 0.5) / D.HH) * GH;
  if (gv < 0 || gv >= GH) return 0;
  const i = Math.min(SDFW - 1, (gu * SDFR) | 0);
  const j = Math.min(SDFH - 1, (gv * SDFR) | 0);
  const dd = SDF[digitAt(k, right ? 1 : 0)][j * SDFW + i] / 64;
  return clamp((rad + AA - dd) / (2 * AA), 0, 1);
}

/**
 * Paint one drum. Columns are the drum's own angles; the near wall (a cage of
 * slats) is black but for a highlight, and the far wall — the strip — shows
 * through the slits and over the near rim. `blur` (0..1) is the slats smeared
 * away by the spin.
 */
function paintDrum(g, D, ox, oy, phase, slideArc, digitAt, blur, gain) {
  const { r, n, open, dipv, HH } = D;
  const pitch = TAU / n, half = pitch * open * 0.5;
  const CX = D.cx + ox, TP = D.top + oy, BT = D.bot + oy, MY = D.midY + oy;
  const x0 = Math.max(0, Math.floor(CX - r)), x1 = Math.min(W - 1, Math.ceil(CX + r));
  const y0 = Math.max(0, Math.floor(TP - dipv - 1)), y1 = Math.min(H - 1, Math.ceil(BT + dipv + 1));
  const buf = g.buf;
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5;
    for (let x = x0; x <= x1; x++) {
      const sn = (x + 0.5 - CX) / r;
      if (sn <= -1 || sn >= 1) continue;
      const c = Math.sqrt(1 - sn * sn);
      const ft = TP - dipv * c, fb = BT - dipv * c;     // the far rim, above the near one
      if (py < ft || py > fb) continue;
      const th = Math.asin(sn);
      const fade = clamp((0.96 - Math.abs(sn)) / 0.07, 0, 1);   // gone at the silhouette
      if (fade <= 0) continue;
      if (py >= TP + dipv * c) {                        // behind the near wall: the cage
        const u = ((th - phase) % pitch + pitch) % pitch;
        const d = Math.min(u, pitch - u);
        const bar = d >= half ? BAR * fade * (1 - blur) : 0;
        if (bar > 0 && dither(x + ox, y + oy, bar)) { buf[y * W + x] = 1; continue; }
        if (d >= half && (blur <= 0 || !dither(x + ox, y + oy, blur))) continue;
      }
      // Through the cage: the strip. It is read at the front of the drum and
      // falls away to either side, where the loop wraps round into the dark.
      const arc = th * r;
      const dim = clamp(1 - 0.85 * (arc / 54) ** 2, 0.1, 1);
      let cov = stripCov(D, arc, py - MY, slideArc, digitAt) * gain * fade * dim;
      // The film's perforations along its top edge, seen into the drum's mouth.
      const pa = ((arc + slideArc) % 9 + 9) % 9;
      if (Math.abs(py - (TP + 0.5)) < 1.4 && Math.min(pa, 9 - pa) < 1.05 / c) cov = 1;
      if (cov > 0 && dither(x + ox, y + oy, cov)) buf[y * W + x] = 1;
    }
  }
}

/**
 * One of a drum's rim ellipses: the near one is a smile, the far one a frown.
 * It thins to a dotted line where the wall turns away, both because that is
 * how an edge catching the light goes and to spare those pixels the wear of a
 * hairline that never moves.
 */
function rim(g, D, ox, oy, top, sgn) {
  const CX = D.cx + ox, Y = top + oy;
  const x0 = Math.max(0, Math.ceil(CX - D.r)), x1 = Math.min(W - 1, Math.floor(CX + D.r));
  for (let x = x0; x <= x1; x++) {
    const sn = (x + 0.5 - CX) / D.r;
    const c = Math.sqrt(Math.max(0, 1 - sn * sn));
    if (dither(x + ox, Y, clamp(1.35 * c, 0.4, 1))) g.pixel(x, Math.round(Y + sgn * D.dipv * c));
  }
}

// ------------------------------------------------------------------ the turn

const MT0 = -1.1, MT1 = 1.1;          // minute turn: 2.2 s
const HT0 = -1.5, HT1 = 1.5;          // hour turn: 3.0 s
const SMOOTH = (u) => u * u * (3 - 2 * u);

/** Spring step response 0 -> 1 with a small overshoot: the strip's settle. */
function settle(u) {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  const z = 0.65, w = 8.5, wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * u) * (Math.cos(wd * u) + ((z * w) / wd) * Math.sin(wd * u));
}

export default {
  name: 'Zoetrope',
  blurb: 'Two slotted drums on a stand: the time is the loop of film running inside them. The strip slips one frame a minute, a frame an hour, and the drum smears its slats away while it turns.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { date, fields: f, oled, night }) {
    const sec = f.sec;
    const late = sec >= 50;
    const to = late ? clockFields(new Date(date.getTime() + 60000)) : f;
    const tau = late ? sec - 60 : sec;

    // The hour reel turns over when the minute reel wraps.
    const isHour = to.m === 0;
    const t0 = isHour ? HT0 : MT0, t1 = isHour ? HT1 : MT1;
    const u = progress(tau, t0, t1);
    const spins = isHour ? 3 : 2;    // the wind-up
    const hitch = isHour ? 1 : 0;    // and, on the hour, a second whirr as it settles
    // Whole extra turns only, so the slats land where they started and the
    // phase is continuous across the minute however the window is entered.
    const spinAt = (v) => TAU * (spins * SMOOTH(v) + hitch * SMOOTH(progress(v, 0.68, 1)));
    const phase = (TAU / 60) * tau + spinAt(u);
    const e = 1e-3;
    const blur = clamp(Math.abs(spinAt(Math.min(1, u + e)) - spinAt(Math.max(0, u - e)))
      / (Math.min(1, u + e) - Math.max(0, u - e)) / (t1 - t0) / 9, 0, 1);
    // The film itself slips over the middle of the turn, so the drum is seen
    // spinning for a moment before and after the frame changes.
    const su = progress(tau, t0 * 0.55, t1 * 0.55);
    const slideU = -(1 - settle(su));
    const gain = (1 - 0.45 * blur) * (1 - 0.4 * Math.sin(Math.PI * su) ** 4);
    const [ox, oy] = orbit(date, 2, 3);

    const minAt = (k, which) => {          // what frame k of the strip runs
      const v = (((to.m + k) % 60) + 60) % 60;
      return which ? v % 10 : (v / 10) | 0;
    };
    const hrAt = (k, which) => {           // the hours only step when the minutes wrap
      const h = (((to.h + Math.floor((to.m + k) / 60)) % 24) + 24) % 24;
      return which ? h % 10 : (h / 10) | 0;
    };

    // Spindles, axle stubs, and the base they stand on.
    const BY = 58 + oy;
    for (const D of [HR_D, MIN_D]) {
      const yb = D.bot + oy + Math.round(D.dipv);
      g.fillRect(D.cx + ox - 1, yb, 3, BY - yb);
      g.fillRect(D.cx + ox - 1, D.top + oy - Math.round(D.dipv) - 4, 3, 4);
    }
    for (let x = 3; x < 126; x++) if (dither(x + ox, BY, 0.62)) g.pixel(x, BY);

    // The minute reel takes a frame every minute; the hour reel only when the
    // hour itself steps, so its strip is still through an ordinary turn.
    const hrPhase = (TAU / 60) * tau + (isHour ? spinAt(u) : 0);
    const hrBlur = isHour ? blur : 0, hrGain = isHour ? gain : 1;
    paintDrum(g, HR_D, ox, oy, hrPhase, isHour ? HR_D.PITCH * slideU : 0, hrAt, hrBlur, hrGain);
    paintDrum(g, MIN_D, ox, oy, phase, MIN_D.PITCH * slideU, minAt, blur, gain);

    for (const D of [HR_D, MIN_D]) {
      const ph = D === HR_D ? hrPhase : phase;
      rim(g, D, ox, oy, D.bot, 1);
      rim(g, D, ox, oy, D.top, 1);
      rim(g, D, ox, oy, D.top, -1);
      // A bead on the rim, carried right round once a minute: the seconds.
      g.fillCircle(D.cx + ox + D.r * Math.sin(ph), D.top + oy + D.dipv * Math.cos(ph), 1.7);
    }

    // The colon: two punched holes, beating once a second.
    const beat = 1 - (sec % 1);
    for (const cy of [23.5, 35.5]) g.fillCircle(45.5 + ox, cy + oy, 1.5 + 0.9 * beat ** 3);

    oled.contrast(0xcf + (0x20 - 0xcf) * night);
  },
};
