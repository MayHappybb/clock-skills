// Press — a letterpress forme, set, inked and pressed.
//
// The picture is the bed of a hand press seen straight down in a cavalier
// projection: heights ride up the screen, the plane stays true, so the type
// is never tilted and the time is always square to the eye. The four minute
// sorts are big; the hour's two are small, set beside them on the same
// baseline like a rubric on a poster. Spaces, a quad and the furniture fill
// the line out to the quoin that locks it, and every sort stands type-high on
// the bed, so the line shows its metal body below the printing face.
//
// The roller is the press's clock. Once a minute it comes down, lays its ink
// across the forme from the left and lifts again; for the rest of the minute
// it drifts slowly back through the air, so its cast shadow crawls over the
// inked faces — where the ink front stands is the second.
//
// The minute: the quoin key turns and the wedge backs off; the sort that must
// change is carried off the bed (it rises, then goes out over the front of
// the frame); the new sort drops in from the far side and rings to rest; the
// key drives the quoin home with a tap; and then the roller comes down and
// inks it. You watch the new numeral fill with ink from the left as the
// roller crosses. A sort shows only bare metal — a lit rim, a breath of
// grain — until the ink reaches it, so no half-set time is ever legible.
//
// The hour is a full pull: every sort is carried off and the forme stands
// empty for a beat, four fresh sorts are set and inked the length of the
// line, and then the platen comes down from above, blacks out the glass and
// strikes — a flash, a shock ring running out from under it, the frame
// ringing — before it lifts and the freshly printed forme glistens.
//
// Burn-in: the whole forme walks a 5x5 orbit; 23:00-07:00 the panel dims.

import { dither, clamp, ease, progress, clockFields, previousMinute, orbit, segDist } from '../js/kit.js';

const W = 128, H = 64;
const R = Math.PI / 180;

// ------------------------------------------------------------ the letterform
//
// A condensed antique: heavy even stems, blunt slab feet, flat-sided bowls.
// Every stroke is a centre-line with a weight, sampled as a signed distance:
// below zero is the printing surface, near zero the rim that catches light.

const GW = 24, GH = 32;   // the glyph box, in glyph units

/** Clock-angle arc (degrees) as points: 0 = up, clockwise. */
function arcP(cx, cy, rx, ry, a0, a1, n = 14) {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + ((a1 - a0) * i) / n) * R;
    p.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return p;
}

/** A closed rounded-rectangle centre-line. */
function rr(x0, y0, x1, y1, r, n = 4) {
  const p = [];
  const c = (cx, cy, a0, a1) => { for (let i = 0; i <= n; i++) { const a = (a0 + ((a1 - a0) * i) / n) * R; p.push([cx + r * Math.sin(a), cy - r * Math.cos(a)]); } };
  c(x1 - r, y0 + r, 0, 90); c(x1 - r, y1 - r, 90, 180); c(x0 + r, y1 - r, 180, 270); c(x0 + r, y0 + r, 270, 360);
  p.push(p[0]);
  return p;
}

const S = (pts, w) => ({ pts, w });
const GLYPHS = {
  0: [S(rr(3.2, 3.1, 20.8, 28.9, 7.6), 5.2)],
  1: [S([[12, 28.9], [12, 3.1]], 5.2), S([[12, 3.1], [4.7, 10.1]], 5.2), S([[3.2, 28.9], [20.8, 28.9]], 5.2)],
  2: [S([...arcP(12, 10.6, 8.1, 7.5, 300, 495), [3.7, 28.9], [20.8, 28.9]], 5.2)],
  3: [S(arcP(11.6, 10.6, 8.0, 7.5, 300, 495), 5.0), S(arcP(11.6, 21.0, 8.5, 8.0, 45, 215), 5.0)],
  4: [S([[18.6, 28.9], [18.6, 3.1], [3.6, 22.4], [20.9, 22.4]], 5.2)],
  5: [S([[20.8, 3.1], [3.2, 3.1]], 5.2), S([[3.2, 3.1], [4.6, 15.0]], 5.0), S(arcP(12, 21.0, 8.5, 8.0, 288, 510), 5.0)],
  6: [S([[3.2, 28.9], [3.2, 3.1]], 5.0), S(rr(3.2, 15.2, 20.8, 28.9, 6.9), 5.0)],
  7: [S([[3.2, 3.1], [20.8, 3.1]], 5.2), S([[13.6, 3.1], [6.4, 29.4]], 5.2)],
  8: [S(rr(4.2, 3.1, 19.8, 15.4, 6.1), 5.0), S(rr(3.2, 15.4, 20.8, 28.9, 6.7), 5.0)],
  9: null,   // 6, turned half a turn
};
GLYPHS[9] = GLYPHS[6].map((s) => S(s.pts.map(([x, y]) => [GW - x, GH - y]), s.w));

/** Flattened segments [x0,y0,x1,y1,r] per digit, with the stroke radius. */
const GSEG = [];
for (let d = 0; d < 10; d++) {
  const seg = [];
  for (const st of GLYPHS[d])
    for (let i = 1; i < st.pts.length; i++)
      seg.push([st.pts[i - 1][0], st.pts[i - 1][1], st.pts[i][0], st.pts[i][1], st.w / 2]);
  GSEG[d] = seg;
}

/** Signed distance to a digit's printing surface, in glyph units. */
function sd(d, x, y) {
  let best = 1e9;
  const seg = GSEG[d];
  for (let i = 0; i < seg.length; i++) {
    const v = segDist(x, y, seg[i][0], seg[i][1], seg[i][2], seg[i][3]) - seg[i][4];
    if (v < best) best = v;
  }
  return best;
}

// The distances are tabulated once, finely enough to resolve the relief's
// shadow offset, so a face is a couple of lookups per pixel, not a hundred.
const PAD = 3.5, SP = 3.0;
const TW = Math.ceil((GW + 2 * PAD) * SP), TH = Math.ceil((GH + 2 * PAD) * SP);
const SDFTEX = GSEG.map((_, d) => {
  const a = new Float32Array(TW * TH);
  for (let j = 0; j < TH; j++) {
    const gy = -PAD + (j + 0.5) / SP;
    for (let i = 0; i < TW; i++) a[j * TW + i] = sd(d, -PAD + (i + 0.5) / SP, gy);
  }
  return a;
});
/** The tabulated signed distance at (gx, gy); large outside the table. */
function sdf(d, gx, gy) {
  const i = Math.round((gx + PAD) * SP - 0.5), j = Math.round((gy + PAD) * SP - 0.5);
  if (i < 0 || j < 0 || i >= TW || j >= TH) return 99;
  return SDFTEX[d][j * TW + i];
}

// ------------------------------------------------------------ the scene

const CH = { x0: 0, y0: 0, x1: 128, y1: 64, bar: 5 };
const IN = { x0: CH.x0 + CH.bar, y0: CH.y0 + CH.bar, x1: CH.x1 - CH.bar, y1: CH.y1 - CH.bar };
const INW = IN.x1 - IN.x0, INH = IN.y1 - IN.y0;

const UP_TYPE = 8, UP_FURN = 4;       // height above the bed, in screen pixels
const FEET = 59;                      // every sort stands with its feet here

const SLOT = [];
{
  const put = (x, w, h, k, kind) => SLOT.push({ x, y: FEET - h, w, h, k, kind });
  put(IN.x0 + 4, 15, 24, 0, 'hour');
  put(IN.x0 + 19, 2, 24, -1, 'space');
  put(IN.x0 + 21, 15, 24, 1, 'hour');
  put(IN.x0 + 36, 13, 24, -1, 'quad');
  put(IN.x0 + 49, 26, 34, 2, 'min');
  put(IN.x0 + 77, 2, 34, -1, 'space');
  put(IN.x0 + 79, 26, 34, 3, 'min');
  SLOT.push({ x: IN.x0, y: FEET - 34, w: 4, h: 34, k: -1, kind: 'furn', down: 1 });
  SLOT.push({ x: IN.x1 - 13, y: FEET - 34, w: 13, h: 34, k: -1, kind: 'furn', down: 1 });
}
const QUAD = SLOT[3];
const COLON_X = QUAD.x + QUAD.w / 2;
const COLON_Y = [29, 36];

// The roller's travel and the ink front.
const RX0 = IN.x0 - 2, RX1 = IN.x1 + 2;

/** Where the ink roller stands, in screen x, `tau` seconds from the turn. */
function rollerX(tau) {
  if (tau >= 0.70 && tau <= 1.90) return RX0 + (RX1 - RX0) * ((tau - 0.70) / 1.20);
  if (tau > 1.90) return RX1 + (RX0 - RX1) * clamp((tau - 1.90) / 56.0, 0, 1);
  return RX0;
}

/** How far off the forme the roller is: 0 touching, 1 a hand's width. */
function rollerLift(tau) {
  return 1 - ease.inOutQuad(progress(tau, -0.20, 0.70)) + ease.inOutQuad(progress(tau, 1.90, 2.50)) * ease.inOutQuad(progress(tau, -0.20, 0.70));
}

/** The specular band: a light sliding across the forme, over the wet ink. */
const bandY = (T) => IN.y0 - 6 + (INH + 12) * (0.5 + 0.5 * Math.sin(T * 0.40 + 1.1));

/** Spring step, 0 -> 1, starting at rest: a sort dropping into the forme. */
function spring(s, zeta, w) {
  if (s <= 0) return 0;
  const wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * s) * (Math.cos(wd * s) + ((zeta * w) / wd) * Math.sin(wd * s));
}

// ------------------------------------------------------------ drawing the sorts

/**
 * One sort: its printing face (carrying `d`) raised `off` pixels off the bed,
 * and the metal body below it down to its feet. `inkX` is where the ink front
 * has reached; nothing may be read off a face until the ink is on it.
 */
function drawSort(g, s, d, inkX, opts) {
  d = +d;
  const { off, band, ox, oy, blank, down } = opts;
  const x = s.x, y = s.y - off, w = s.w, h = s.h;
  const up = off - (down ? 0 : UP_TYPE);
  const k = (w - 2) / GW;
  const gw = GW * k, gh = GH * k;
  const gx0 = x + (w - gw) / 2, gy0 = y + h - 1 - gh;   // feet share one baseline
  const fBot = y + h, bot = s.y + h;
  const x0 = Math.max(0, Math.floor(x)), x1 = Math.min(W, Math.ceil(x + w));
  const y0 = Math.max(0, Math.floor(y)), y1 = Math.min(H, Math.ceil(bot));

  for (let py = y0; py < y1; py++) {
    const cy = py + 0.5;
    const glint = Math.abs(cy - band) < 1.0;
    const t = (cy - fBot) / Math.max(1, bot - fBot);
    for (let px = x0; px < x1; px++) {
      const cx = px + 0.5;
      let lit = 0;
      if (cy < fBot) {
        // The printing face. Only the ink is lit: the bed is black, the type
        // metal is black, and the numerals stand alone on it.
        const gxx = (cx - gx0) / k, gyy = (cy - gy0) / k;
        if (!blank && gxx > -0.6 && gyy > -0.6 && gxx < GW + 0.6 && gyy < GH + 0.6) {
          const q = sdf(d, gxx, gyy);
          if (q < 0) {
            if (inkX > cx) lit = glint ? 0 : 1;                      // the sheen's line
            else lit = q > -1.2 ? 1 : dither(px + ox, py + oy, 0.16) ? 1 : 0;   // bare metal
          }
        }
      } else if (!blank) {
        if (dither(px + ox * 2, py + oy, 0.06)) lit = 1;                    // the metal body
        if (cx > x + w * 0.26 && cx < x + w * 0.46 && t > 0.34 && t < 0.72) lit = 0;   // the nick
      }
      if (cy > bot - 1.1) lit = 1;                      // the feet close the silhouette
      if (lit) g.pixel(px, py, 1);
    }
  }
  return up;
}

/** The chase: a thin steel rule round the bed, with its corner bolts. */
function chase(g, ox, oy) {
  for (let px = IN.x0 - 1; px < IN.x1 + 1; px++)
    if (dither(px + ox, 1, 0.3)) { g.pixel(px + ox, IN.y0 - 1 + oy, 1); g.pixel(px + ox, IN.y1 + oy, 1); }
  for (let py = IN.y0; py < IN.y1; py++)
    if (dither(2, py + oy, 0.3)) { g.pixel(IN.x0 - 1 + ox, py + oy, 1); g.pixel(IN.x1 + ox, py + oy, 1); }
  for (const [bx, by] of [[IN.x0 - 4, IN.y0 - 4], [IN.x1, IN.y0 - 4], [IN.x0 - 4, IN.y1], [IN.x1, IN.y1]])
    g.fillRect(bx + ox, by + oy, 3, 3, 1);

}

/** The quoin and its key, at the right hand of the forme. */
function quoin(g, ox, oy, slack, tap) {
  const x0 = SLOT[SLOT.length - 1].x, x1 = IN.x1 - 1;
  const xw = x0 + 1.5 + slack * 2 + tap;
  for (let i = 0; i < 4; i++) {
    const t = i / 4, b = (i + 1) / 4;
    const yy0 = IN.y0 + 2 + t * (INH - 4), yy1 = IN.y0 + 2 + b * (INH - 4);
    g.fillPolygon([[xw, yy0], [xw + 3.2 - i * 0.6 + slack, (yy0 + yy1) / 2], [xw, yy1]], 1);
  }
  const kx = (xw + x1) / 2 + 2, ky = FEET - 17;
  const a = slack * 1.1;
  const ca = Math.cos(a), sa = Math.sin(a);
  const P = (u, v) => [kx + u * ca - v * sa + ox, ky + u * sa + v * ca + oy];
  const [ax, ay] = P(-7, 0);
  g.thickLine(ax, ay, kx + ox, ky + oy, 2.2, 1);
  g.circle(kx + ox, ky + oy, 2.8, 1);
}

/** The platen: it lives above the forme and comes down for the impression. */
function platen(g, drop, ox, oy, struck) {
  if (drop <= 0.005) return;
  const y0 = IN.y0 - (1 - drop) * 74, y1 = IN.y1 - (1 - drop) * 74;
  const py0 = Math.max(0, Math.floor(y0)), py1 = Math.min(H, Math.ceil(y1));
  for (let py = py0; py < py1; py++) {
    const t = (py + 0.5 - y0) / (y1 - y0);
    for (let px = CH.x0 + 1; px < CH.x1 - 1; px++) {
      if (px < IN.x0 - 1 || px > IN.x1) { g.pixel(px + ox, py, 1); continue; }
      const lv = 0.28 - 0.20 * t;
      if (lv > 0.02 && !dither(px + ox, py, lv)) g.pixel(px + ox, py, 1);
    }
  }
  if (struck > 0) {
    const rr = 8 + 76 * ease.outCubic(clamp(struck / 0.4, 0, 1));
    g.ring(64, (y0 + y1) / 2, rr, rr + 1.6, 1);
  }
}

// ------------------------------------------------------------ the design

export default {
  name: 'Press',
  blurb: 'A letterpress forme: the time is lead type standing in the chase, the roller inks the new sorts as the minute turns, and on the hour the platen strikes.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { date, fields: f, oled, night }) {
    const T = date.getTime() / 1000;
    const late = f.sec >= 52;
    const from = late ? f : previousMinute(date);
    const to = late ? clockFields(new Date(date.getTime() + 60000)) : f;
    const tau = late ? f.sec - 60 : f.sec;
    const [ox, oy] = orbit(date, 3, 3);

    const fromD = from.hh + from.mm, toD = to.hh + to.mm;
    const showing = tau < 0 ? fromD : toD;
    const isHour = to.m === 0 && tau < 8.6 && tau > -6.5;

    // The press's schedule, in seconds from the turn.
    const slack = progress(tau, -3.6, -3.0) - progress(tau, 0.35, 0.70);
    const tap = 2.2 * Math.exp(-(((tau - 0.72) / 0.10) ** 2));
    const struck = tau > 3.35 && tau < 3.75 ? (tau - 3.35) / 0.40 : 0;
    const drop = clamp(progress(tau, 2.30, 3.35) - progress(tau, 3.75, 4.60), 0, 1);
    const shake = struck > 0 && struck < 0.5 ? 2 : 0;

    const band = bandY(T);
    const inTurn = tau >= (isHour ? -5.4 : -3.2) && tau <= (isHour ? 8.4 : 2.8);

    chase(g, ox, oy + (shake ? 1 : 0));
    quoin(g, ox, oy, slack, tap);

    for (const s0 of SLOT) {
      const s = { ...s0, x: s0.x + ox, y: s0.y + oy };      // the forme walks its orbit
      if (s.kind === 'furn') {
        drawSort(g, s, 0, 1e9, { off: UP_FURN, band: 1e9, ox, oy, blank: true, down: 1 });
        continue;
      }
      if (s.kind === 'space' || s.kind === 'quad') {
        drawSort(g, s, 0, 1e9, { off: UP_TYPE, band: 1e9, ox, oy, blank: true });
        continue;
      }
      // Only inside the turn is a sort "the one being changed"; the rest of
      // the minute every sort stands inked, whatever the last turn did.
      const isNew = inTurn && fromD[s.k] !== toD[s.k];
      const inkFront = tau <= 1.90 ? rollerX(tau) : RX1;   // ink, once laid, stays
      const inkedNow = !isNew || inkFront > s.x + s.w;
      const setAt = 0.06 + (isHour ? s.k * 0.14 : 0);
      const t0 = isHour ? -3.5 + s.k * 0.12 : -2.40;

      if (!isNew) {
        drawSort(g, s, showing[s.k], 1e9, { off: UP_TYPE, band, ox, oy });
      } else {
        // It is picked up off the bed, then carried out over the front of the
        // frame; the pocket stands empty until the new sort drops in and rings
        // on the bed, and it stays bare metal until the roller inks it.
        const pick = ease.inCubic(progress(tau, t0, t0 + 0.35));
        if (tau < t0 + 0.35) drawSort(g, s, fromD[s.k], 1e9, { off: UP_TYPE + 9 * pick, band, ox, oy });
        const away = ease.inCubic(progress(tau, t0 + 0.35, t0 + 1.45));
        if (away > 0 && away < 1) {
          const kk = 1 + 0.55 * away;
          drawSort(g, { x: s.x + (s.w * (1 - kk)) / 2, y: s.y + s.h * (1 - kk) + away * 58, w: s.w * kk, h: s.h * kk },
            fromD[s.k], 1e9, { off: UP_TYPE * kk + 12 * away, band, ox, oy });
        }
        if (tau >= setAt) {
          const land = spring(tau - setAt, 0.45, 12);
          drawSort(g, s, toD[s.k], inkedNow ? 1e9 : -1e9, { off: UP_TYPE + (1 - land) * 11, band, ox, oy });
        }
      }
    }

    // the colon: two period sorts standing on the quad
    for (const cy of COLON_Y) g.fillRect(COLON_X - 2 + ox, cy + oy, 4, 4, 1);

    // The roller: down on the forme to ink it, lifted and carried back over
    // the frame for the rest of the minute. Its shadow falls on the forme.
    const lift = rollerLift(tau);
    const rx = rollerX(tau) + ox;
    const cy = (IN.y0 + IN.y1) / 2 + (10 - (IN.y0 + IN.y1) / 2) * lift;
    const hh = INH + 6 + (14 - INH - 6) * lift;
    const ry0 = cy - hh / 2, ry1 = cy + hh / 2;
    const shx = rx + 3 + lift * 5;
    for (let py = Math.max(0, Math.floor(ry0 + 2)); py < IN.y1; py++)
      if (g.get(Math.round(shx), py)) g.pixel(Math.round(shx), py, 0);

    const prof = [0, 0.5, 0.75, 1, 1, 1, 0.6, 0.3, 0];
    const rp = Math.round(rx);
    for (let py = Math.max(0, Math.floor(ry0)); py < Math.min(H, Math.ceil(ry1)); py++)
      for (let dx = -4; dx <= 4; dx++) {
        const lv = prof[dx + 4];
        if (lv >= 1 || (lv > 0 && dither(rp + dx, py, lv))) g.pixel(rp + dx, py, 1);
      }
    // its ends: the face of the cylinder, with its trunnion beyond
    g.hline(rp - 3, Math.max(0, Math.floor(ry0)), 7, 1);
    g.hline(rp - 3, Math.min(H - 1, Math.ceil(ry1) - 1), 7, 1);
    g.fillRect(rp - 1, Math.max(0, Math.floor(ry0) - 3), 3, 3, 1);
    g.fillRect(rp - 1, Math.min(H - 3, Math.ceil(ry1)), 3, 3, 1);

    if (isHour) platen(g, drop, ox, oy, struck);

    if (struck > 0 && struck < 0.22) {
      // the impression lands: a couple of frames of flash on the glass
      const ph = Math.floor(T * 60);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (dither(x + ph, y + ph, 0.88)) g.pixel(x, y, 2);
    }

    oled.contrast(0xcf + (0x20 - 0xcf) * night);
  },
};
