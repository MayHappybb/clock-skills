// Watch — an analog dial done properly at 64 pixels tall.
//
// A round dial (r 30) fills the left: a dotted minute track, baton hour
// indices (a pair at 12), a tapered hour hand with a pointed tip, a longer,
// finer minute hand, and a one-pixel seconds hand with a round counterweight
// that sweeps smoothly at 60 fps. The dial centre sits on a pixel centre, so
// odd-width shapes (3-pixel batons and hands, the hairline) are crisp at the
// cardinals. The hour and minute hands are drawn on a dark keyline, so where
// the minute hand crosses the hour hand or an index it reads as lying on top.
// The seconds hand is drawn in XOR instead: lying along a hand it shows as a
// dark seam, where a keyline would erase the hand under it. The hub is a
// small ring with a dark centre, cleared round so the hands start from it.
//
// On the right, the complications: day and date in a framed window, whose
// wheels roll up at midnight; a moon-phase aperture with the real phase of
// the moon (age from a known new moon over the synodic month, drawn with the
// terminator as an ellipse and the face as dither in a solid edge); and a
// small digital readout with seconds.
//
// Every angle comes straight from the clock: seconds from fields.sec (with
// its fraction, so the hand sweeps), minutes from m + sec/60, hours from
// h + m/60 + sec/3600; the moon from date. Nothing is remembered.
//
// Night: from 23:00 to 07:00 (ctx.night, shared by every design) the panel
// dims through oled.contrast(), faded over the first and last minute, and
// the seconds hand and the minute track go out, leaving hands and indices.
//
// Burn-in: indices, hub and moon are lit for hours, so the dial and the
// complication column each walk their own 2-pixel orbit (every 5 and 7
// minutes); the 12 has a 3-pixel gap between its batons so no column is lit
// at every step; the moon's dither is anchored to the moon so it moves too.

import { font3x5, font5x7, polar, orbit, sprite, clamp, ease, progress, clockFields, dither, OFF, ON, XOR } from '../js/kit.js';

// The 5x7 is the HD44780 ROM, whose zero is slashed; a plain oval zero
// suits an instrument dial better, so swap that one glyph.
const ZERO = sprite(`
  .###.
  #...#
  #...#
  #...#
  #...#
  #...#
  .###.
`);
const font5 = { ...font5x7, glyph: (ch) => (ch === '0' ? ZERO : font5x7.glyph(ch)) };

const CX = 31.5, CY = 31.5;          // dial centre: a pixel centre, so cardinal hands are crisp
const R_TRACK = 29.4;                // minute dots
const R_INDEX_OUT = 28, R_INDEX_IN = 22;

const DAY_CONTRAST = 0xcf, NIGHT_CONTRAST = 0x10;

// ------------------------------------------------------------ helpers

/** A hand as a polygon: list of [r, halfWidth] stations along clock angle a. */
function handPoly(cx, cy, a, stations) {
  const ux = Math.sin(a), uy = -Math.cos(a);   // along the hand
  const vx = -uy, vy = ux;                     // across it
  const left = [], right = [];
  for (const [r, w] of stations) {
    left.push([cx + ux * r + vx * w, cy + uy * r + vy * w]);
    right.push([cx + ux * r - vx * w, cy + uy * r - vy * w]);
  }
  return [...left, ...right.reverse()];
}

/** Fill a polygon with a dark keyline `k` pixels round it, then the shape. */
function keyedPoly(g, pts, k = 1) {
  const off = [];
  for (let dx = -k; dx <= k; dx++) for (let dy = -k; dy <= k; dy++) if (dx || dy) off.push([dx, dy]);
  for (const [dx, dy] of off) g.fillPolygon(pts.map(([x, y]) => [x + dx, y + dy]), OFF);
  g.fillPolygon(pts, ON);
}


// ------------------------------------------------------------ moon

const SYNODIC = 29.530588853;
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);   // a known new moon

/** Moon age as a fraction of the synodic month, 0 = new, 0.5 = full. */
function moonPhase(date) {
  const days = (date.getTime() - NEW_MOON) / 86400000;
  return (((days / SYNODIC) % 1) + 1) % 1;
}

function drawMoon(g, cx, cy, r, p) {
  const k = Math.cos(2 * Math.PI * p);
  // Lit where the point is inside the disc and on the sunward side of the
  // terminator, an ellipse of half-width |k| (k = cos of the phase angle).
  const lit = (px, py) => {
    const x = (px - cx) / r, y = (py - cy) / r;
    if (x * x + y * y > 1) return false;
    const s = Math.sqrt(1 - y * y);
    return p < 0.5 ? x > k * s : x < -k * s;
  };
  // The lit part has a solid edge and a dithered face: it reads as the
  // moon's grey, and its pixels are not all lit all day (it is the one
  // solid shape on the face that otherwise only changes over weeks).
  const edge = (px, py) => lit(px, py) && !(lit(px - 1, py) && lit(px + 1, py) && lit(px, py - 1) && lit(px, py + 1));
  // The dither is anchored to the moon, so as the face orbits it moves too.
  const ax = Math.floor(cx), ay = Math.floor(cy);
  g.fillWhere((px, py, ix, iy) => edge(px, py) || (lit(px, py) && dither(ix - ax, iy - ay, 0.5)),
    ON, [cx - r - 1, cy - r - 1, 2 * r + 2, 2 * r + 2]);
  // The unlit limb as a dotted outline, so a new moon is still a moon.
  for (let i = 0; i < 24; i += 2) {
    const [x, y] = polar(cx, cy, r - 0.5, (i / 24) * 2 * Math.PI);
    // Only on the dark side, clear of the lit part, so the lit limb stays a clean arc.
    let clear = true;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (g.get(x + dx, y + dy)) clear = false;
    if (clear) g.pixel(x, y);
  }
}
// A few fixed stars in the aperture, as offsets from the moon window centre.
const STARS = [[-11, -4], [-7, -9], [8, -10], [12, -3], [4, -13]];

// ------------------------------------------------------------ dial

function drawDial(g, cx, cy, night) {
  if (!night)
    for (let i = 0; i < 60; i++) {
      if (i % 5 === 0) continue;
      const [x, y] = polar(cx, cy, R_TRACK, (i / 60) * 2 * Math.PI);
      g.pixel(x, y);
    }
  for (let h = 0; h < 12; h++) {
    const a = (h / 12) * 2 * Math.PI;
    if (h === 0) {
      // Double baton at 12.
      for (const s of [-2.5, 2.5]) {
        const [x0, y0] = [cx + s, cy - R_INDEX_OUT - 1];
        g.fillPolygon([[x0 - 1, y0], [x0 + 1, y0], [x0 + 1, cy - R_INDEX_IN + 1], [x0 - 1, cy - R_INDEX_IN + 1]]);
      }
    } else if (h % 3 === 0) {
      g.fillPolygon(handPoly(cx, cy, a, [[R_INDEX_IN, 1.5], [R_INDEX_OUT + 1, 1.5]]));
    } else {
      g.fillPolygon(handPoly(cx, cy, a, [[R_INDEX_IN + 1, 1], [R_INDEX_OUT, 1]]));
    }
  }
}

function drawHands(g, cx, cy, f, night) {
  const sec = f.sec;
  const aS = (sec / 60) * 2 * Math.PI;
  const aM = ((f.m + sec / 60) / 60) * 2 * Math.PI;
  const aH = (((f.h % 12) + f.m / 60 + sec / 3600) / 12) * 2 * Math.PI;

  // Hour: a broad baton, slightly tapered, with a pointed tip.
  keyedPoly(g, handPoly(cx, cy, aH, [[-3, 1.9], [13.5, 1.6], [16.5, 0]]));
  // Minute: longer and finer, reaching the inner end of the indices.
  keyedPoly(g, handPoly(cx, cy, aM, [[-3, 1.6], [22, 1.1], [26, 0]]));

  if (!night) {
    // Seconds: a hairline drawn in XOR, so where it lies over a hand or an
    // index it shows as a dark seam instead of cutting the hand away (a
    // keyline would erase a hand it runs alongside). Round counterweight.
    const [tx, ty] = polar(cx, cy, 27.5, aS);
    const [bx, by] = polar(cx, cy, -4.6, aS);
    const [wx, wy] = polar(cx, cy, -6.5, aS);
    g.line(Math.floor(bx), Math.floor(by), Math.floor(tx), Math.floor(ty), XOR);
    g.fillCircle(wx, wy, 2.9, OFF);
    g.fillCircle(wx, wy, 1.9);
  }

  // Hub: a small ring with a dark centre.
  g.fillCircle(cx, cy, 3.6, OFF);
  g.ring(cx, cy, 1.6, 2.7, ON);
}

// ------------------------------------------------------------ complications

function drawComplications(g, x0, y0, f, date) {
  const mid = x0 + 31;
  // Day and date window.
  const dw = 17, dayW = font5x7.measure(f.dow);
  const left = Math.round(mid - (dayW + 4 + dw) / 2), wx = left + dayW + 4;
  g.rect(wx, y0 + 2, dw, 13);
  // At midnight the day and date wheels roll up by one, like the real ones:
  // the old day leaves through the top of the window as the new one rises.
  const u = f.h === 0 && f.m === 0 ? ease.inOutCubic(progress(f.sec, 0, 0.9)) : 1;
  const was = clockFields(new Date(date.getTime() - 86400000));
  g.clip(left, y0 + 3, wx + dw - 1 - left, 11);
  for (const [day, dd, dy] of [[was.dow, was.dd, -11 * u], [f.dow, f.dd, 11 * (1 - u)]]) {
    if (Math.abs(dy) >= 11) continue;
    g.text(day, left, y0 + 5 + Math.round(dy), { font: font5 });
    g.text(dd, wx + 3, y0 + 5 + Math.round(dy), { font: font5 });
  }
  g.unclip();

  // Moon-phase aperture: an arch with the moon and some stars in it.
  const mx = mid, my = y0 + 40;
  g.arc(mx, my, 15, 15.9, -Math.PI / 2, Math.PI / 2);
  g.hline(Math.round(mx - 16), my, 32);
  for (const [sx, sy] of STARS) g.pixel(mx + sx, my + sy);
  drawMoon(g, mx, my - 6.5, 6.4, moonPhase(date));

  // Digital readout.
  const hm = `${f.hh}:${f.mm}`;
  const w = font5x7.measure(hm) + 2 + font3x5.measure(f.ss);
  const tx = Math.round(mid - w / 2);
  const end = g.text(hm, tx, y0 + 51, { font: font5 });
  g.text(f.ss, end + 2, y0 + 53, { font: font3x5 });
}

export default {
  name: 'Watch',
  blurb: 'An analog watch: baton hands, sweeping seconds, day-date and the real moon phase.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'dirty',

  frame(g, { fields: f, date, oled, night: dim }) {
    const night = dim >= 0.5;
    const [ox, oy] = orbit(date, 2, 5);           // the dial
    const [px, py] = orbit(date, 2, 7);           // the complications, on their own walk
    const cx = CX + ox, cy = CY + oy;
    drawComplications(g, 66 + px, py + 1, f, date);
    drawDial(g, cx, cy, night);
    drawHands(g, cx, cy, f, night);
    oled.contrast(DAY_CONTRAST + (NIGHT_CONTRAST - DAY_CONTRAST) * dim);
  },
};
