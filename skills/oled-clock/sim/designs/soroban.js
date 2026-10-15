// Soroban — the time as the bead pattern of a Japanese abacus.
//
// Four rods run across the glass, one decimal place each (hour tens, hour
// units, minute tens, minute units). Every rod carries a soroban's own set:
// one heaven bead on the far side of the reckoning bar, worth five when it
// stands against the bar, and four earth beads on the near side, worth one
// each. A digit is not drawn anywhere — it is how many beads are standing at
// the bar — which is why no font can stand in for it. Four rods read as four
// digits; the beads are the numerals.
//
// Everything is a mechanism. At rest the earth beads are parked at the far
// end of their rod, a clear two bead-widths back from the bar, and the
// heaven bead sits back against the left stile. A minute turn slides only the
// beads that have to move, as a rigid pack the way a finger moves them, with
// the impulse travelling along the pack, and each bead lands against the bar
// with a small overshoot and a glint. A rod whose digit does not change does
// not move at all.
//
// The hour is the whole rack: every rod is plucked, the beads shiver on
// their wires and the pack rings back in, rows settling top to bottom; the
// frame itself takes the shock and rocks. Rods whose digit happens to stay
// the same shiver too, so the rack reads as one instrument being struck
// rather than four independent counters.
//
// The seconds are a bead falling down the tensioned wire in the right
// margin, one pass a minute, past its tick marks; it lands at the foot, is
// flicked back to the head just before :00 and drops again, trembling as it
// slips — so the face is never still.
//
// Drawn, not fonted: the frame is a rule-line, kept dark and mostly dithered
// so the glass is spent on the beads rather than on a lit border, with a post
// where each wire meets it; the rods are hairline wires through the beads,
// the reckoning bar a slim brass bar, each bead biconical and lit from the
// top left with a dithered foot. Black elsewhere.
//
// Pure function of the clock: the turn is scheduled backwards from :00 out
// of this minute's digits and the next minute's. Burn-in: the whole rack
// walks a 2 px orbit, a step every three minutes; 23:00-07:00 the panel dims.

import { clamp, ease, orbit, previousMinute, clockFields, ON } from '../js/kit.js';

// ------------------------------------------------------------ geometry

const FX0 = 3, FY0 = 2, FX1 = 124, FY1 = 61, BT = 3;   // the frame, before the orbit
const IX0 = FX0 + BT, IY0 = FY0 + BT, IX1 = FX1 - BT, IY1 = FY1 - BT;

const RY = [13, 26, 39, 52];            // the four rod centre lines
const BW = 11, BH = 10, DW = 10;        // bead pitch, height, drawn width
const ROD_X0 = 7, ROD_X1 = 104;         // where a wire starts and ends
const BAR_X = 29, BAR_W = 2;            // the reckoning bar
const HV_REST = 8, HV_SET = 19;         // left edge of the heaven bead, back / at the bar
const E_REST = 59, E_SET = 31;          // left edge of earth bead 0, back / at the bar
const RIB_Y = 32;                       // the rib between the hour pair and the minute pair

const WIRE_X = 112;                     // the seconds wire, right margin
const SEC_TOP = 13, SEC_BOT = 51;       // the falling bead's centre, head and foot
const SEC_FALL = 58.4;                  // when it reaches the foot

const DAY = 0xcf, NIGHT = 0x12;

// ------------------------------------------------------------ the turn schedule

const MIN_OUT = 0.4, MIN_IN = 0.5;      // the minute turn, seconds either side of :00
const HR_OUT = 0.4, HR_IN = 1.6;        // the hour: a longer, louder show
const MIN_START = -0.35, MIN_Z = 0.62, MIN_W = 10.5, MIN_STAG = 0.018;
const HR_START = -0.4, HR_Z = 0.4, HR_W = 9.5, HR_STAG = 0.11, HR_BSTAG = 0.018;
const MIN_ARRIVE = 0.34, HR_ARRIVE = 0.32;

/** Step response of a damped spring, 0 -> 1, starting at rest. */
function spring(t, zeta, w) {
  if (t <= 0) return 0;
  const wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t));
}

const digitsOf = (f) => [...`${f.hh}${f.mm}`].map(Number);

// ------------------------------------------------------------ beads

/**
 * One biconical abacus bead filling the DW x BH box at integer (x0, y0):
 * flat at the poles, widest at the waist, lit from the top left so the lower
 * half is shaded with a dither. `flash` (0..1) is the click: the bead goes
 * solid and throws a spark off both poles.
 */
function bead(g, x0, y0, flash = 0) {
  const solid = flash > 0.45;
  g.fillWhere((px, py) => {
    const v = (py - y0) / BH;
    const hw = (DW / 2) * (1 - (2 * v - 1) ** 2) ** 0.7;   // a pointed lozenge: the koma
    const d = Math.abs(px - (x0 + DW / 2));
    if (d > hw) return false;
    if (solid || v < 0.5) return true;
    return d > hw - 1 ? true : 0.42;     // lit upper half, a shaded foot
  }, ON, [x0, y0, DW, BH]);
  if (flash > 0.15) {
    // The click: a spark thrown off the poles, longest at the moment of contact.
    const w = flash > 0.6 ? 4 : 2;
    g.hline(x0 + (DW - w) / 2, y0 - 1, w, ON);
    g.hline(x0 + (DW - w) / 2, y0 + BH, w, ON);
  }
}

/** A spark decaying after the bead lands: `d` seconds since its move began. */
const spark = (d, arrive) => (d > arrive ? clamp(Math.exp(-(d - arrive) * 9), 0, 1) : 0);

/** A dithered hairline: hline/vline take a boolean, grey needs the dither. */
const dh = (g, x, y, w, l) => g.shade(x, y, w, 1, l);
const dv = (g, x, y, h, l) => g.shade(x, y, 1, h, l);

// ------------------------------------------------------------ the face

/**
 * The frame. Not a lit moulding — that would be a solid border burning all
 * day — but a drawn rule-line round the bed, weighted to the light, with a
 * post where each wire meets it. The frame is the darkest thing on the glass;
 * what is lit is the beads and the bar they are counted against.
 */
function drawFrame(g, ox, oy) {
  const x0 = FX0 + ox, y0 = FY0 + oy, x1 = FX1 + ox, y1 = FY1 + oy;
  dh(g, x0, y0, x1 - x0 + 1, 0.42);       // the head rail
  dh(g, x0, y1, x1 - x0 + 1, 0.42);       // the foot
  dv(g, x0, y0, y1 - y0 + 1, 0.42);       // the left stile
  dv(g, x1, y0, y1 - y0 + 1, 0.42);       // the right stile
  for (const y of RY) {                    // a post at each wire's end
    const p = Math.round(y + oy) - 2;
    g.fillRect(x0, p, 3, 5, ON);
    g.fillRect(x1 - 2, p, 3, 5, ON);
  }
}

/** The reckoning bar: a rounded bar crossing every rod, with a glint running it. */
function drawBar(g, ox, oy, glint) {
  const x = BAR_X + ox, y0 = IY0 + oy, y1 = IY1 + oy;
  g.vline(x, y0, y1 - y0 + 1, ON);
  dv(g, x + 1, y0, y1 - y0 + 1, 0.5);
  if (glint > 0) {
    const gy = Math.round(y0 + (y1 - y0) * glint);
    g.vline(x, gy - 3, 7, ON);
    g.vline(x + 1, gy - 3, 7, ON);
  }
}

/**
 * The rib dividing the hour pair of rods from the minute pair: a recessed
 * groove (grey), not a rod, so it reads as frame rather than a fifth place.
 */
function drawRib(g, ox, oy) {
  const x0 = IX0 + ox, w = IX1 - IX0 + 1, y = RIB_Y + oy;
  dh(g, x0, y, w, 0.38);
}

/** The seconds wire and its bead: a plummet past five ten-second marks. */
function secY(sec) {
  if (sec <= SEC_FALL) {
    const y = SEC_TOP + (SEC_BOT - SEC_TOP) * (sec / SEC_FALL);
    const fr = sec - Math.floor(sec);
    return y + 2.2 * Math.exp(-7 * fr) * Math.sin(fr * 20);   // clicking down, one a second
  }
  const u = (sec - SEC_FALL) / (60 - SEC_FALL);
  return SEC_BOT + (SEC_TOP - SEC_BOT) * ease.inOutCubic(u);
}

function drawSeconds(g, ox, oy, sec) {
  const x = WIRE_X + ox, y0 = IY0 + oy, y1 = IY1 + oy;
  g.vline(x, y0, y1 - y0 + 1, ON);
  g.hline(x - 2, y0, 5, ON);                       // the bosses the wire is strung on
  g.hline(x - 2, y1, 5, ON);
  for (let k = 1; k <= 5; k++) {                   // a mark every ten seconds,
    const ty = Math.round(secY(k * 10)) + oy;      // filled once the bead is past it
    if (sec >= k * 10) g.hline(x - 2, ty, 5, ON);
    else dh(g, x - 1, ty, 3, 0.3);
  }
  const cy = Math.round(secY(sec)) + oy;
  const fr = sec - Math.floor(sec);
  if (fr < 0.14) {                                 // the click: a spark off the bead
    const w = fr < 0.07 ? 5 : 3;
    dh(g, x - (w - 1) / 2, cy - BH / 2 - 2, w, 0.75);
  }
  bead(g, x - DW / 2, Math.round(cy - BH / 2), 0);
}

// ------------------------------------------------------------ one rod

/**
 * A rod and its five beads at turn time `tt` (null when the digit is settled).
 * `from`/`to` are the digits either side of the turn; `st` is this rod's
 * share of the stagger, `hour` selects the loud settling.
 */
function drawRod(g, i, ox, oy, from, to, tt, st, hour) {
  const cy = RY[i] + oy, y0 = Math.round(cy - BH / 2);
  const x = (v) => Math.round(v) + ox;
  g.hline(ROD_X0 + ox, Math.round(cy), ROD_X1 - ROD_X0 + 1, ON);

  const z = hour ? HR_Z : MIN_Z, w = hour ? HR_W : MIN_W;
  const arrive = hour ? HR_ARRIVE : MIN_ARRIVE;

  // One bead: `s` how far it stands at the bar (0 rest .. 1 set), `d` seconds
  // since its own move began (negative before it starts), `changed` whether it
  // has actually to travel this turn.
  const put = (left, s, d, changed, j = 0) => {
    let dx = 0, dy = 0;
    if (hour && d > 0) {
      // The whole rack is struck: every bead shivers on its wire, and the
      // ones that are not changing get the loudest shake. The phase runs
      // along the pack, so the shiver is a wave, not a shove.
      const amp = Math.exp(-3.2 * d) * (changed ? 0.45 : 1);
      dx = 2.0 * amp * Math.sin(15 * d + j * 0.8);
      dy = 1.1 * amp * Math.sin(18 * d + 1 + j * 0.5);
    }
    const f = changed ? spark(d, arrive) : hour ? spark(d, arrive) * 0.5 : 0;
    bead(g, x(left) + Math.round(dx), y0 + Math.round(dy), f);
  };

  // A bead reaching the bar can go no further, so the spring's overshoot is
  // arrested about two pixels in and rings back off it.
  const held = (s, travel) => clamp(s, -2.2 / travel, 1 + 2.2 / travel);

  // The heaven bead: 0 = back against the stile, 1 = standing at the bar.
  const ha = from >= 5 ? 1 : 0, hb = to >= 5 ? 1 : 0;
  const hd = tt === null ? 0 : tt - st;
  const hs = held(ha + (hb - ha) * (tt === null ? 0 : spring(hd, z, w)), HV_SET - HV_REST);
  put(HV_REST + hs * (HV_SET - HV_REST), 0, hd, ha !== hb, -1);

  // The earth beads: bead j (0 nearest the bar) is counted for j < digit % 5,
  // and they travel as one pack, the impulse running along it.
  for (let j = 0; j < 4; j++) {
    const a = j < from % 5 ? 1 : 0, b = j < to % 5 ? 1 : 0;
    const d = tt === null ? 0 : tt - st - j * (hour ? HR_BSTAG : MIN_STAG);
    const s = held(a + (b - a) * (tt === null ? 0 : spring(d, z, w)), E_REST - E_SET);
    put(E_REST + j * BW + s * (E_SET - E_REST), 0, d, a !== b, j);
  }
}

// ------------------------------------------------------------ the face

export default {
  name: 'Soroban',
  blurb: 'A soroban whose bead pattern is the time: beads click to the bar every minute and the whole rack is plucked on the hour.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { date, fields: f, oled, night }) {
    oled.contrast(DAY + (NIGHT - DAY) * night);
    // Burn-in: the rack walks two decorrelated orbits, so no static member of
    // the frame (or the reckoning bar) rests on one pixel.
    const [ox0] = orbit(date, 2, 3);
    const [, oy0] = orbit(new Date(date.getTime() + 11 * 60000), 2, 5);
    const sec = f.sec;

    const hour = (f.m === 0 && sec < HR_IN) || (f.m === 59 && sec >= 60 - HR_OUT);
    const OUT = hour ? HR_OUT : MIN_OUT, IN = hour ? HR_IN : MIN_IN;
    let tt = null;
    if (sec >= 60 - OUT) tt = sec - 60;
    else if (sec < IN) tt = sec;

    const cur = digitsOf(f);
    const prev = digitsOf(previousMinute(date));
    const next = digitsOf(clockFields(new Date(date.getTime() + 60000)));
    const from = tt === null ? cur : tt < 0 ? cur : prev;
    const to = tt === null ? cur : tt < 0 ? next : cur;

    // The frame takes the shock of the hour and rocks on its mounts.
    let oy = oy0;
    if (hour && tt !== null && tt > 0) oy += 2.2 * Math.exp(-2.4 * tt) * Math.sin(10 * tt);

    drawFrame(g, ox0, oy);
    drawBar(g, ox0, oy, hour && tt !== null ? clamp((tt + 0.2) / 1.4, 0, 1) : 0);
    drawRib(g, ox0, oy);
    for (let i = 0; i < 4; i++) {
      // The turn begins a third of a second before :00, so the beads are
      // already in flight as the minute changes, and rings out after it.
      const st = tt === null ? 0 : (hour ? HR_START + i * HR_STAG : MIN_START);
      drawRod(g, i, ox0, oy, from[i], to[i], tt, st, hour);
    }
    drawSeconds(g, ox0, oy, sec);
  },
};
