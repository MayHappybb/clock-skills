// Laundry Day: the owner's two plush dolls, the floppy black-and-tan puppy
// and the shaggy panda, do the washing on the balcony.
//
// Left half: the front of a white front-loader, seen close, its porthole
// nearly the full height of the glass. Through the glass the two dolls go
// round with the wash: carried up the drum wall, flopping back down into
// the suds, a full roll now and then, the drum reversing every eight
// seconds; then the water drains, the spin pins them to the wall, and they
// drop to the bottom and sit out the last seconds dizzy, the panda upright
// with its legs stuck out, the puppy flat on its belly with its chin on its
// paws.
//
// Right half: the balcony sky, and the time pegged out on the washing line,
// four numerals cut from terry towelling with a stitched hem, swaying in
// the breeze.
//
// The minute turn is the laundry itself: from :57 each numeral that is
// about to change slips out of its pegs and drops away below the balcony
// (all gone before :59.3). The door swings open, the puppy flops over the
// rim to look out, and from :00 the panda flings the new numerals out of the drum
// one by one: each flies across as a wet crumpled ball, unfurls on the line
// and is pegged, dark with water and dripping, then dries pale over the
// next half minute. The door closes, the water comes in, round they go.
//
// Every five minutes (and so on the hour) it is the dolls' turn to dry:
// after the numerals they fly out themselves and hang pegged by their ears
// on the lower line, swinging, dripping and drying, blinking at the street,
// until :26 when they hop back into the drum for a shorter wash. On the
// hour the door lets out a cloud of soap bubbles as it opens.
//
// Never a wrong time: old numerals are off the line by :59.3, new ones
// leave the drum only after :00, and a numeral in flight is a crumpled ball
// until it is on its pegs.
//
// Style: flat colour blocks, no modelled volume. The machine is white enamel
// and grey plastic; the restrained effects belong to the scene: a sheen on
// the door glass, translucent water and suds over the dolls, wet cloth
// darker than dry, drips, a breeze. The towels are a small warm set (coral,
// mustard, teal, rose...) against a sky that follows the real day.
// Hard pixels for the machine and pegs; AA for the dolls, the towels and
// anything that moves.

import {
  hex, mix, sin, cos, clamp, lerp, progress, ease, rand, noise, sprite,
  clockFields, previousMinute,
} from '../js/kit.js';
import { drawPuppy, drawPanda } from './dollwash-dolls.js';
import { GLYPHS } from './dollwash-glyphs.js';

const TAU = Math.PI * 2;

// ------------------------------------------------------------ layout
const CX = 39, CY = 41;          // porthole centre
const RG = 29;                   // glass / drum opening
const RR = 37;                   // outer door ring
const MACH_W = 80;
const LINE1 = { y0: 8, sag: 2.5 };   // upper line: the time
const LINE2 = { y0: 46, sag: 3 };    // lower line: the dolls, a pair of socks
const SLOT = [83, 101, 123, 141];    // left edge of each numeral (16 px wide)
const GW = 11 / 12;                  // glyph x scale (12-unit box drawn 11 wide)
const lineY = (L, x) => { const u = clamp((x - MACH_W) / (160 - MACH_W), 0, 1); return L.y0 + L.sag * 4 * u * (1 - u); };

// ------------------------------------------------------------ colours
const ENAMEL = hex('eceeea'), ENAMEL_EDGE = hex('c4c9c9'), RING = hex('d3d9dd'), RING_IN = hex('a3adb5');
const GASKET = hex('4b5259'), GASKET_IN = hex('363c42');
const DRUM = hex('a9b8c2'), DRUM_WALL = hex('8b9aa5'), HOLE = hex('6f808c'), BAFFLE = hex('c9d3da');
const WATER = hex('3a9ac8'), FOAM = hex('f4f8fa');
const GLASS_TINT = hex('7fa6bf');
const PEG = hex('d9b27a'), PEG_DARK = hex('9a7646'), SPRING = hex('9aa3a8');
const LINE_C = hex('f2f2ec');
const TOWEL = ['ee6a4d', 'f2b434', '2ba79a', 'e8628f', '69b34c', 'f28a2e', '8f6ad8', 'd9483b', '2f6fc0', 'f08fb0'].map(hex);
const DROP = hex('cdeaf8');

const SKY = [
  [0, '0b1430', '1a2a52'], [5.5, '15204a', '3b3f73'], [6.6, '4f6aa8', 'f2a878'], [8, '4f98d8', '9ccdee'],
  [16.5, '4f98d8', 'a4d2ef'], [18.2, '5a62a8', 'f5a066'], [19.4, '28306a', 'a86a7a'], [20.6, '0e1838', '22305a'], [24, '0b1430', '1a2a52'],
].map(([h, a, b]) => [h, hex(a), hex(b)]);

function skyAt(hour) {
  let k = 1;
  while (SKY[k][0] < hour) k++;
  const a = SKY[k - 1], b = SKY[k], u = (hour - a[0]) / (b[0] - a[0]);
  return [mix(a[1], b[1], u), mix(a[2], b[2], u)];
}

const PEG_SPR = sprite(`
  .w.
  wdw
  sss
  wdw
  w.w
  w.w`, { w: PEG, d: PEG_DARK, s: SPRING });

// ------------------------------------------------------------ the programme

/** Is this a minute when the dolls go out to dry? */
const dryMinute = (f) => f.m % 5 === 0;

/** Knots of drum speed (rad/s), piecewise linear, for one minute. */
function speedKnots(dry) {
  const k = [[0, 0]];
  const bouts = dry ? [31] : [7, 15, 23, 31];
  bouts.forEach((b, i) => {
    const dir = (dry ? 1 : i % 2 ? -1 : 1) * 4.6;
    k.push([b, 0], [b + 0.4, dir], [b + 7.2, dir], [b + 7.6, 0]);
  });
  k.push([42, 0], [45, 10.5], [49, 10.5], [52, 0], [60, 0]);
  return k;
}
const KNOTS = [speedKnots(false), speedKnots(true)];

/** Drum angle at `sec`: the exact integral of the piecewise-linear speed. */
function drumAngle(sec, dry) {
  const k = KNOTS[dry ? 1 : 0];
  let a = 0;
  for (let i = 1; i < k.length; i++) {
    const [t0, w0] = k[i - 1], [t1, w1] = k[i];
    if (t1 <= t0) continue;
    if (sec >= t1) { a += ((w0 + w1) / 2) * (t1 - t0); continue; }
    if (sec > t0) { const u = (sec - t0) / (t1 - t0), w = w0 + (w1 - w0) * u; a += ((w0 + w) / 2) * (sec - t0); }
    break;
  }
  return a;
}
function drumSpeed(sec, dry) {
  const k = KNOTS[dry ? 1 : 0];
  for (let i = 1; i < k.length; i++) {
    const [t0, w0] = k[i - 1], [t1, w1] = k[i];
    if (sec < t1 && t1 > t0) return sec <= t0 ? w0 : w0 + ((w1 - w0) * (sec - t0)) / (t1 - t0);
  }
  return 0;
}

/** The door: 0 shut .. 1 wide open (about 100 degrees). */
function doorOpen(sec, dry) {
  // it opens just before the minute turns (so the dolls are ready at :00)
  if (sec >= DOOR_OPENS) return ease.inOutQuad(progress(sec, DOOR_OPENS, DOOR_OPENS + 1));
  const close = dry ? 28.3 : 3.2;
  return 1 - ease.inOutQuad(progress(sec, close, close + 1));
}
const DOOR_OPENS = 58.6;

/** Water level: px below the drum centre of the surface; > RG means empty. */
function waterLevel(sec, dry) {
  const fill0 = dry ? 29.3 : 4.2, fill1 = dry ? 31 : 7;
  const fill = ease.outQuad(progress(sec, fill0, fill1)) * (1 - ease.inQuad(progress(sec, 39, 42)));
  return lerp(RG + 3, 9, fill);
}

const sudsAmount = (sec, dry) => progress(sec, dry ? 30 : 6, dry ? 34 : 14) * (1 - progress(sec, 38, 41.5));

// ------------------------------------------------------------ the dolls in the drum

const REST = {
  pup: { x: CX - 9, y: CY + 18, s: 0.85, rot: 0, lie: 1 },
  panda: { x: CX + 9, y: CY + 14, s: 0.72, rot: 0.04, legA: 0.45, legL: 5.5, armA: 0.15 },
};
const RIM = { x: CX - 3, y: CY + 26.5, s: 1.0, rot: 0, lie: 1 };   // puppy flopped over the door rim
const HANG = {
  pup: { x: 108, peg: 16.4, s: 0.85 },     // pegged by the top of its head / ear roots
  panda: { x: 140, peg: 24.5, s: 0.68 },   // pegged by its ears
};

const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

/**
 * One tumble: phase u 0..1, carried up the wall on side `sg` then falling
 * back. Returns position, extra rotation and the limbs' flop.
 */
function tumble(u, sg, roll, R) {
  const P = (phi, rho) => [CX + rho * sin(phi), CY + rho * cos(phi)];
  const phi0 = sg * 0.2, phi1 = sg * 1.3;
  if (u < 0.55) {
    const k = ease.inOutQuad(u / 0.55);
    const [x, y] = P(lerp(phi0, phi1, k), R);
    return { x, y, rot: -sg * 1.1 * k, flop: sg * 0.7 * sin(Math.PI * k) };
  }
  const k = (u - 0.55) / 0.45;
  const [x0, y0] = P(phi1, R), [x1, y1] = P(phi0, R);
  const x = lerp(x0, x1, ease.outQuad(k)) - sg * 4 * sin(Math.PI * k);
  const y = lerp(y0, y1, k * k) - 5 * sin(Math.PI * k) * (1 - k);
  const end = roll ? sg * TAU : 0;
  return { x, y, rot: lerp(-sg * 1.1, end, ease.inOutQuad(k)), flop: -sg * 0.9 * sin(TAU * k) };
}

/** Where each doll is inside the drum at `sec` (when it is in the drum). */
function drumPose(who, sec, dry, t) {
  const rest = REST[who];
  const isPup = who === 'pup';
  const sprawl = isPup ? { lie: 0 } : { legA: 0.75, legL: 7.5, armA: 0.9 };
  const restParams = isPup ? { lie: 1 } : { legA: 0.45, legL: 5.5, armA: 0.15 };
  const R = isPup ? 12 : 11;
  let pose = { ...rest };

  // wash bouts
  const bouts = dry ? [31] : [7, 15, 23, 31];
  for (let i = 0; i < bouts.length; i++) {
    const b = bouts[i];
    const sg = (dry ? 1 : i % 2 ? -1 : 1);
    const t0 = b + (isPup ? 0.3 : 0.75), t1 = b + 7.2;
    if (sec < t0 - 0.35 || sec > t1 + 0.4) continue;
    const n = isPup ? 5 : 4, per = (t1 - t0) / n;
    const v = clamp(sec - t0, 0, t1 - t0), c = Math.min(n - 1, Math.floor(v / per)), u = sec >= t1 ? 1 : (v - c * per) / per;
    const roll = rand(c, i, isPup ? 7 : 9) < 0.45;
    const tm = sec < t0 ? tumble(0, sg, false, R) : tumble(u >= 1 ? 0.9999 : u, sg, roll, R);
    // blend in from rest at the start of the bout, back to rest at its end
    const w = progress(sec, t0 - 0.35, t0) * (1 - progress(sec, t1, t1 + 0.4));
    const ww = ease.inOutQuad(w);
    pose.x = lerp(rest.x, tm.x, ww);
    pose.y = lerp(rest.y, tm.y, ww);
    pose.rot = rest.rot + tm.rot * ww + 0.0;
    pose.flop = tm.flop * ww;
    for (const k of Object.keys(sprawl)) pose[k] = lerp(restParams[k], sprawl[k], ww);
    if (!isPup) pose.armR = 0.6 * sin(t * 7) * ww;
    return pose;
  }

  // the spin: picked up off the bottom, pinned to the wall, dropped when it stops
  if (sec >= 42 && sec < 53.2) {
    const off = isPup ? 0 : Math.PI;
    const psi = drumAngle(sec, dry);
    const Rw = isPup ? 14 : 13;
    const pinned = (s2) => {
      const a = drumAngle(s2, dry) + off + 0.35;
      return { x: CX + Rw * sin(a), y: CY + Rw * cos(a), rot: -a };
    };
    const lift = ease.inOutQuad(progress(sec, 42.3, 43.8));
    if (sec < 52) {
      const p = pinned(sec);
      // until fully lifted, the doll is dragged from its resting place
      pose.x = lerp(rest.x, p.x, lift); pose.y = lerp(rest.y, p.y, lift);
      pose.rot = rest.rot + angDiff(rest.rot, p.rot) * lift;
      pose.flop = 0.5 * sin(psi * 2) * lift;
      for (const k of Object.keys(sprawl)) pose[k] = lerp(restParams[k], sprawl[k], lift);
      return pose;
    }
    const p = pinned(52), k = progress(sec, 52, 53.2);
    pose.x = lerp(p.x, rest.x, ease.outQuad(k));
    pose.y = lerp(p.y, rest.y, k * k) - 3 * sin(Math.PI * k) * (1 - k);
    pose.rot = p.rot + angDiff(p.rot, rest.rot) * ease.inOutQuad(k);
    pose.flop = sin(k * 9) * (1 - k);
    for (const kk of Object.keys(sprawl)) pose[kk] = lerp(sprawl[kk], restParams[kk], ease.inOutQuad(k));
    return pose;
  }

  // at rest: dizzy after the spin, waiting by the door
  const dizzy = progress(sec, 53.2, 54) * (1 - progress(sec, 57, 60));
  pose.rot = rest.rot + 0.07 * sin(t * 5.3 + (isPup ? 0 : 1.7)) * dizzy;
  pose.flop = 0.35 * sin(t * 3.1) * dizzy;
  return pose;
}

// ------------------------------------------------------------ drawing: the machine

function drawMachineBody(g, sec, dry, t, night) {
  g.fillRect(0, 0, MACH_W, 80, ENAMEL);
  g.fillRect(MACH_W - 2, 0, 2, 80, ENAMEL_EDGE);
  // programme dial, top left: its pointer goes round once a minute
  g.fillCircle(7.5, 7.5, 5, RING_IN);
  g.fillCircle(7.5, 7.5, 3.8, hex('e3e7ea'));
  const a = (sec / 60) * TAU;
  g.thickLine(7.5, 7.5, 7.5 + 3.2 * sin(a), 7.5 - 3.2 * cos(a), 1.3, hex('4a5560'), { aa: true });
  // three lamps, top right: wash, rinse, spin
  const phase = sec < 39 ? (doorOpen(sec, dry) > 0.01 ? -1 : 0) : sec < 42 ? 1 : sec < 52 ? 2 : -1;
  for (let i = 0; i < 3; i++) {
    const lit = phase === i || (phase === -1 && i === 0 && (t * 2) % 2 < 1 && dry && sec > 4 && sec < 28);
    g.fillRect(66 + i * 4, 3, 3, 2, lit ? (i === 2 ? hex('ffb340') : hex('5fe08a')) : hex('9aa3a8'));
  }
  // hinges
  g.fillRect(0, 27, 3, 6, RING_IN); g.fillRect(0, 49, 3, 6, RING_IN);
}

function drawDrum(g, sec, dry, t) {
  const psi = drumAngle(sec, dry);
  g.fillCircle(CX, CY, RG + 1, DRUM_WALL);
  g.fillCircle(CX, CY, RG - 3.5, DRUM);
  // perforations, turning with the drum
  const rings = [[6, 6], [11, 10], [16, 14], [21, 18]];
  for (let r = 0; r < rings.length; r++) {
    const [rad, n] = rings[r];
    for (let i = 0; i < n; i++) {
      const a = psi + (i / n) * TAU + r * 0.3;
      g.pixel(CX + rad * sin(a), CY + rad * cos(a), HOLE);
    }
  }
  // three lifting baffles on the wall
  for (let i = 0; i < 3; i++) {
    const a = -psi + (i / 3) * TAU;     // clock angle (arc() runs clockwise from 12)
    g.arc(CX, CY, RG - 4, RG + 1, a - 0.2, a + 0.2, BAFFLE);
  }
}

function drawWater(g, sec, dry, t) {
  const lvl = waterLevel(sec, dry);
  if (lvl >= RG) return;
  const w = drumSpeed(sec, dry);
  const tilt = clamp(-w * 0.035, -0.25, 0.25);
  const surf = (x) => CY + lvl + tilt * (x - CX) + 1.1 * sin(x * 0.31 + t * 5.2) + 0.6 * sin(x * 0.17 - t * 3.1);
  for (let x = CX - RG; x <= CX + RG; x++) {
    const dx = x + 0.5 - CX;
    if (Math.abs(dx) >= RG) continue;
    const bot = CY + Math.sqrt(RG * RG - dx * dx);
    const ys = surf(x + 0.5);
    if (ys >= bot) continue;
    const y0 = Math.ceil(ys);
    g.fillRect(x, y0, 1, Math.ceil(bot) - y0, WATER, { a: 0.42 });
    g.pixel(x, y0 - 1, hex('bfe6f5'), { a: 0.5 + 0.4 * (y0 - ys) });
  }
  // suds riding the surface, and a few clinging to the glass
  const sd = sudsAmount(sec, dry);
  if (sd > 0.02) {
    for (let i = 0; i < 11; i++) {
      const bx = CX - 24 + i * 4.8 + 1.5 * sin(t * 1.7 + i * 2.1);
      const dx = bx - CX;
      if (Math.abs(dx) > RG - 2) continue;
      const r = (1.6 + 2.2 * rand(i, 3)) * sd + 0.4 * sin(t * 3 + i);
      if (r < 0.6) continue;
      g.fillCircle(bx, surf(bx) - r * 0.4, r, FOAM, { aa: true, a: 0.92 });
    }
    for (let i = 0; i < 6; i++) {
      const a = 1.9 + i * 0.5 + 0.08 * sin(t * 0.7 + i), rr = RG - 2.5 - 2 * rand(i, 9);
      g.fillCircle(CX + rr * sin(a), CY - rr * cos(a), (1.2 + 1.5 * rand(i, 4)) * sd, FOAM, { aa: true, a: 0.55 });
    }
    // bubbles rising through the water
    for (let i = 0; i < 6; i++) {
      const per = 1.3 + rand(i, 1), ph = ((t + rand(i, 2) * 5) / per) % 1;
      const bx = CX - 18 + rand(i, 5) * 36 + sin(t * 4 + i) * 1.2;
      const by = CY + RG - 4 - ph * (RG - lvl);
      if (by < surf(bx) + 1) continue;
      g.circle(bx, by, 1, FOAM, { a: 0.75 * sd });
    }
  }
}

function drawGlass(g) {
  // the door glass: a faint tint and one sheen
  g.fillCircle(CX, CY, RG, GLASS_TINT, { a: 0.12 });
  g.arc(CX, CY, RG - 6, RG - 3.5, 4.75, 5.75, 0xffffff, { a: 0.22, aa: true });
  g.arc(CX, CY, RG - 3, RG - 2, 5.85, 6.05, 0xffffff, { a: 0.3, aa: true });
}

function drawGasket(g) {
  // the machine's own ring round the opening (visible once the door swings away)
  g.ring(CX, CY, RG, RR + 0.5, ENAMEL);
  g.ring(CX, CY, RG - 0.5, RG + 3, GASKET, { aa: true });
  g.ring(CX, CY, RG - 0.5, RG + 0.8, GASKET_IN, { aa: true });
}

/** The door at angle `open` (0..1), hinged on the left, swinging towards us. */
function drawDoor(g, open) {
  const ang = open * 1.5;
  const c = Math.cos(ang);
  const hinge = CX - RR;
  const rx = RR * Math.abs(c);
  const cx = c >= 0 ? hinge + rx : hinge - rx;
  if (rx < 0.8) { g.fillRect(hinge - 1, CY - RR, 2, 2 * RR, RING_IN); return; }
  const k = rx / RR;
  if (open < 0.02) {
    // shut: just the ring round the glass we look through
    g.ring(CX, CY, RG + 1.5, RR, RING, { aa: true });
    g.ring(CX, CY, RG + 2.5, RR - 1.2, hex('e2e7ea'), { aa: true });
    g.ring(CX, CY, RG - 0.5, RG + 2.5, RING_IN, { aa: true });
  } else {
    g.fillEllipse(cx, CY, rx, RR, RING, { aa: true });
    g.fillEllipse(cx, CY, Math.max(0.5, rx - 1.2), RR - 1.2, hex('e2e7ea'), { aa: true });
    g.fillEllipse(cx, CY, Math.max(0.4, (RG + 2.5) * k), RG + 2.5, RING_IN, { aa: true });
    g.fillEllipse(cx, CY, Math.max(0.3, (RG + 0.5) * k), RG + 0.5, c > 0 ? hex('9ab7c8') : hex('8aa6b8'), { aa: true });
    if (c > 0) g.fillEllipse(cx - 2 * k, CY - 5, Math.max(0.3, 8 * k), 12, 0xffffff, { aa: true, a: 0.25 });
  }
  // handle on the free edge
  const hx = c >= 0 ? cx + rx - 2.5 * k : cx - rx + 2.5 * k;
  g.fillRect(Math.round(hx - 1), CY - 5, 2, 10, hex('8e98a0'));
}

// ------------------------------------------------------------ drawing: the line and the towels

const towelColour = (d, wet, night) => {
  const base = TOWEL[d];
  return mix(mix(base, 0x000000, 0.32 * wet), hex('1a2440'), 0.25 * night);
};

/**
 * One towel numeral. (x, y) the top-left of its 16 x 27 box; `k` scale about
 * the top centre; `shear` px of sideways billow at the bottom.
 */
function drawTowel(g, d, x, y, { k = 1, shear = 0, wet = 0, night = 0, a = 1, pegs = true } = {}) {
  const gl = GLYPHS[d], col = towelColour(d, wet, night);
  const mx = x + 8;
  const P = ([lx, ly]) => {
    const q = ly / 22;
    return [mx + ((lx * GW + 2.5 - 8) * k) + shear * q * q * k, y + (2.5 + ly) * k];
  };
  for (const st of gl.strokes) g.stroke(st.map(P), 5 * k, col, { aa: true, a });
  // the stitched hem down the middle of the strip
  if (k > 0.7) {
    const hem = mix(col, 0xffffff, 0.5 - 0.15 * wet);
    for (const st of gl.strokes) {
      let acc = 0;
      for (let i = 1; i < st.length; i++) {
        const [ax, ay] = P(st[i - 1]), [bx, by] = P(st[i]);
        const len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(len));
        for (let j = 0; j < n; j++) {
          if (Math.floor(acc + j) % 3 !== 2) g.pixel(ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n, hem, { a });
        }
        acc += n;
      }
    }
  }
  // its pegs
  if (k > 0.55 && pegs) drawPegs(g, d, x, k, shear);
}

/** The two pegs holding numeral `d` in the slot at x (they stay on the line when it drops). */
function drawPegs(g, d, x, k = 1, shear = 0) {
  for (const [lx, ly] of GLYPHS[d].pegs) {
    const q = ly / 22, px = x + 8 + (lx * GW + 2.5 - 8) * k + shear * q * q * k;
    g.blit(PEG_SPR, px - 1.5, lineY(LINE1, px) - 2);
  }
}

/** Drips falling from a wet towel's lowest points. */
function drawDrips(g, d, x, y, wet, sinceLand, shear) {
  if (wet < 0.25) return;
  const gl = GLYPHS[d];
  // lowest points of the glyph
  let lows = [];
  for (const st of gl.strokes) for (const p of st) if (p[1] > 19) lows.push(p);
  if (!lows.length) return;
  lows = [lows[0], lows[lows.length - 1]];
  for (let n = 0; n < 40; n++) {
    const born = n * 0.55 + rand(d, n) * 0.3;
    if (born > sinceLand) break;
    const w = 1 - born / 35;
    if (w < 0.3 || rand(n, d, 4) > w) continue;
    const age = sinceLand - born, fall = 0.5 * 220 * age * age;
    const p = lows[n % lows.length];
    const px = x + 8 + (p[0] * GW + 2.5 - 8) + shear, py = y + 2.5 + p[1] + 2.5 + fall;
    if (py > 82) continue;
    g.fillRect(Math.round(px), Math.round(py), 1, 2, DROP, { a: 0.85 });
  }
}

function drawLines(g) {
  for (const L of [LINE1, LINE2]) {
    let py = Math.round(lineY(L, MACH_W));
    for (let x = MACH_W; x < 160; x++) {
      const y = Math.round(lineY(L, x + 0.5));
      g.pixel(x, y, LINE_C);
      if (y !== py) g.pixel(x, py, LINE_C, { a: 0.5 });
      py = y;
    }
    g.fillRect(MACH_W, Math.round(L.y0) - 1, 2, 3, hex('8e98a0'));
    g.fillRect(158, Math.round(L.y0) - 1, 2, 3, hex('8e98a0'));
  }
}

function drawSocks(g, t, wind, night) {
  // a pair of little striped socks at the left end of the lower line
  const base = mix(hex('9a7ad8'), hex('1a2440'), 0.25 * night), stripe = mix(0xffffff, hex('1a2440'), 0.3 * night);
  for (let i = 0; i < 2; i++) {
    const x = 85 + i * 7, y = lineY(LINE2, x) + 1;
    const sw = (0.8 + wind) * sin(t * 2.3 + i * 1.3);
    const pts = [[x, y], [x + sw * 0.3, y + 6], [x + 2.5 + sw, y + 9]];
    g.stroke(pts, 3.2, base, { aa: true });
    g.fillRect(Math.round(x - 1), Math.round(y + 2), 3, 1, stripe);
    g.blit(PEG_SPR, x - 1.5, lineY(LINE2, x) - 2);
  }
}

// ------------------------------------------------------------ the frame

export default {
  name: 'Laundry Day',
  blurb: 'The puppy and the panda go round in the wash; each new numeral is flung out of the drum and pegged up wet to dry.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, sec = f.sec, t = ctx.t, night = ctx.night;
    ctx.lcd.backlight(1 - 0.65 * night);
    const dry = dryMinute(f);
    const prev = previousMinute(ctx.date), next = clockFields(new Date(ctx.date.getTime() + 60000));
    const now = f.hh + f.mm, was = prev.hh + prev.mm, will = next.hh + next.mm;
    const hour = f.h + f.m / 60 + sec / 3600;
    const wind = noise(t * 0.35, 3);

    // ---------------- the balcony sky
    const [top, bot] = skyAt(hour);
    g.gradient(MACH_W, 0, 160 - MACH_W, 80, [top, bot]);
    if (hour < 6 || hour >= 20) {
      g.fillCircle(124.5, 58, 4, hex('f4f0d8'), { aa: true });
      g.fillCircle(126.5, 57, 3.4, mix(top, bot, 0.7), { aa: true });
      for (let i = 0; i < 9; i++) g.pixel(84 + rand(i, 1) * 74, 4 + rand(i, 2) * 50, hex('c8d0f0'), { a: 0.5 + 0.4 * sin(t * 1.5 + i) });
    } else {
      // clouds drifting past behind the lines
      for (let i = 0; i < 3; i++) {
        const span = 110, x = MACH_W + ((rand(i, 7) * span + t * (1.2 + 0.5 * i)) % span) - 15, y = 18 + i * 13 + rand(i, 8) * 5;
        const c = mix(0xffffff, bot, 0.25);
        g.fillEllipse(x, y, 9, 2.6, c, { aa: true, a: 0.75 });
        g.fillEllipse(x - 3, y - 1.8, 4.5, 2.4, c, { aa: true, a: 0.75 });
      }
    }
    // the balcony rail
    const rail = mix(hex('e8e6dc'), hex('2a3452'), 0.5 * night);
    g.fillRect(MACH_W, 70, 80, 2, rail);
    for (let x = MACH_W + 5; x < 160; x += 9) g.fillRect(x, 72, 1, 8, rail);

    drawLines(g);
    drawSocks(g, t, wind, night);

    // ---------------- the time on the line
    for (let i = 0; i < 4; i++) {
      const d = +now[i], changed = now[i] !== was[i], leaving = now[i] !== will[i];
      const x = SLOT[i], yTop = lineY(LINE1, x + 8) - 1.5;
      const sway = (1 + 1.8 * wind) * sin(t * 1.9 + i * 1.1) + 0.6 * sin(t * 3.3 + i);
      // arrival: thrown out of the drum after :00 (left to right)
      const order = [0, 1, 2, 3].filter((j) => now[j] !== was[j]).indexOf(i);
      const tThrow = 0.45 + 0.3 * order, tLand = tThrow + 0.9;
      let wet = 0, since = 99;
      if (changed) {
        if (sec < tLand) { drawPegs(g, +was[i], x); continue; }   // still in the drum or in flight; the old pegs wait
        since = sec - tLand;
        wet = 1 - progress(since, 0, 35);
      }
      // departure: dropped off the line from :57, right to left
      let fallY = 0, fallSh = 0;
      if (leaving) {
        const ordR = [3, 2, 1, 0].filter((j) => now[j] !== will[j]).indexOf(i);
        const t0 = 57 + 0.5 * ordR;
        if (sec >= t0) {
          const u = sec - t0;
          fallY = 0.5 * 240 * u * u + 1.5 * u;
          fallSh = 6 * u * (i % 2 ? 1 : -1);
          drawPegs(g, d, x);
          if (yTop + fallY > 82) continue;
        }
      }
      const k = changed ? lerp(0.35, 1, ease.outBack(progress(since, 0, 0.45))) : 1;
      const sh = sway * (1 - 0.55 * wet) + fallSh;
      if (fallY > 0) drawTowel(g, d, x + fallSh * 0.3, yTop + fallY, { k, shear: sh, wet, night, pegs: false });
      else {
        drawTowel(g, d, x, yTop, { k, shear: sh, wet, night });
        drawDrips(g, d, x, yTop, wet, since, sh);
      }
    }

    // ---------------- the machine
    const open = doorOpen(sec, dry);
    drawMachineBody(g, sec, dry, t, night);
    const spinShake = sec > 44.5 && sec < 49 ? (Math.floor(t * 22) % 2) : 0;
    const ox = spinShake;   // the drum rattles a pixel during the full spin

    // who is where
    const throws = [0, 1, 2, 3].filter((j) => now[j] !== was[j]).map((_, o) => 0.45 + 0.3 * o);
    const pupState = dollState('pup', sec, dry, t, throws);
    const pandaState = dollState('panda', sec, dry, t, throws);

    const drawInside = () => {
      g.clip(CX - RG - 1 + ox, CY - RG - 1, 2 * RG + 2, 2 * RG + 2);
      drawDrum(g, sec, dry, t);
      if (pandaState.where === 'drum') drawPanda(g, { ...pandaState.pose, x: pandaState.pose.x + ox });
      if (pupState.where === 'drum') drawPuppy(g, { ...pupState.pose, x: pupState.pose.x + ox });
      g.unclip();
      if (open < 0.02) { drawWater(g, sec, dry, t); drawGlass(g); }
    };
    drawInside();
    drawGasket(g);
    drawDoor(g, open);
    if (pupState.where === 'rim') drawPuppy(g, pupState.pose);

    // ---------------- things in the air, in front of everything
    // new numerals in flight: wet crumpled balls
    const changedIdx = [0, 1, 2, 3].filter((j) => now[j] !== was[j]);
    changedIdx.forEach((i, order) => {
      const tThrow = 0.45 + 0.3 * order, tLand = tThrow + 0.9;
      if (sec < tThrow || sec >= tLand) return;
      const u = (sec - tThrow) / 0.9;
      const hand = [CX + 12, CY + 6], dst = [SLOT[i] + 8, lineY(LINE1, SLOT[i] + 8) + 5];
      const ctrl = [lerp(hand[0], dst[0], 0.45), Math.min(hand[1], dst[1]) - 18];
      const bx = (1 - u) * (1 - u) * hand[0] + 2 * u * (1 - u) * ctrl[0] + u * u * dst[0];
      const by = (1 - u) * (1 - u) * hand[1] + 2 * u * (1 - u) * ctrl[1] + u * u * dst[1];
      const col = towelColour(+now[i], 1, night), r = lerp(2.6, 4.2, u);
      g.fillCircle(bx, by, r, col, { aa: true });
      g.fillCircle(bx - r * 0.35 * cos(t * 9), by - r * 0.35 * sin(t * 9), r * 0.55, mix(col, 0xffffff, 0.35), { aa: true });
      g.pixel(bx + 2, by + r + 1 + u * 2, DROP);
    });
    // the dolls flying to or from the line, or hanging on it
    for (const st of [pandaState, pupState]) {
      if (st.where !== 'air' && st.where !== 'line') continue;
      if (st.who === 'pup') drawPuppy(g, st.pose); else drawPanda(g, st.pose);
      if (st.where === 'line') {
        for (const px of st.pegs) g.blit(PEG_SPR, px - 1.5, lineY(LINE2, px) - 2);
        drawDollDrips(g, st, sec);
      }
    }
    // the hour's soap bubbles
    if (f.m === 0) drawBubbles(g, sec + 60 - DOOR_OPENS, t);
    else if (f.m === 59 && sec >= DOOR_OPENS) drawBubbles(g, sec - DOOR_OPENS, t);
  },
};

// ------------------------------------------------------------ dolls: drum, rim, air, line

function hangPose(who, sec, tLand, t, wind) {
  const h = HANG[who], since = sec - tLand;
  const pegY = lineY(LINE2, h.x) + 0.5;
  const swing = 0.32 * Math.exp(-since / 1.4) * sin(since * 4.6) + (0.03 + 0.04 * wind) * sin(t * 1.4 + (who === 'pup' ? 0 : 2));
  const d = h.peg * h.s;
  const wet = 1 - progress(since, 0, 22);
  const blink = rand(Math.floor(t / 3.1), who === 'pup' ? 1 : 2) < 0.6 && (t % 3.1) < 0.14;
  const base = { x: h.x - d * sin(swing), y: pegY + d * cos(swing), s: h.s, rot: swing, wet: wet * 0.8, glint: blink ? 0 : 1 };
  if (who === 'pup') {
    // hanging, the floppy legs dangle; it kicks them now and then
    const kick = 0.25 * sin(t * 6) * (rand(Math.floor(t / 2.5), 3) < 0.4 ? 1 : 0);
    return { ...base, lie: 0, fA: 1.05 + kick, hA: 0.28 - kick, flop: -0.2 + 0.15 * sin(t * 2) };
  }
  return { ...base, legA: 0.18 + 0.08 * sin(t * 2.2), legL: 9, armA: 0.08 + 0.05 * sin(t * 1.7), armR: 0 };
}

function pegsFor(who, pose) {
  const h = HANG[who];
  const off = (who === 'pup' ? 6 : 8.2) * h.s;
  return [pose.x - off, pose.x + off];
}

function dollState(who, sec, dry, t, throws) {
  const isPup = who === 'pup';
  const wind = noise(t * 0.35, 3);
  if (dry) {
    const tOut = isPup ? 1.9 : 2.5, tIn = isPup ? 26 : 26.6, fly = 0.9;
    const rest = isPup ? RIM : REST[who];   // the puppy leaves from the rim, where it was looking out
    const home = REST[who];
    if (sec >= tOut && sec < tIn + fly) {
      if (sec >= tOut + fly && sec < tIn) {
        const pose = hangPose(who, sec, tOut + fly, t, wind);
        return { who, where: 'line', pose, pegs: pegsFor(who, pose), since: sec - tOut - fly };
      }
      // flying out or back: a high arc with a roll
      const outbound = sec < tIn;
      const u = outbound ? (sec - tOut) / fly : (sec - tIn) / fly;
      const end = hangPose(who, outbound ? tOut + fly : tIn, outbound ? tOut + fly : tOut + fly + 30, t, wind);
      const [A, B] = outbound ? [rest, end] : [end, home];
      const e = ease.inOutQuad(u);
      const pose = { ...A };
      for (const k of Object.keys(B)) if (typeof B[k] === 'number' && typeof A[k] === 'number') pose[k] = lerp(A[k], B[k], e);
      pose.x = lerp(A.x, B.x, u);
      pose.y = lerp(A.y, B.y, u) - 30 * sin(Math.PI * u);
      pose.rot = lerp(A.rot ?? 0, B.rot ?? 0, e) + (outbound ? 1 : -1) * TAU * ease.inOutQuad(u);
      pose.flop = sin(u * 12);
      return { who, where: 'air', pose };
    }
  }
  // the puppy flops over the rim when the door opens (not when it's off to dry)
  if (isPup && !(dry && sec >= 1.9 && sec < 27)) {
    const w = sec >= 59 ? ease.inOutQuad(progress(sec, 59, 59.7)) : 1 - ease.inOutQuad(progress(sec, 2.5, 3.1));
    if (w > 0.001) {
      const rest = REST.pup;
      return {
        who, where: w > 0.5 ? 'rim' : 'drum',
        pose: { ...rest, x: lerp(rest.x, RIM.x, w), y: lerp(rest.y, RIM.y, w) - 3 * sin(Math.PI * w), s: lerp(rest.s, RIM.s, w), lie: 1, look: sin(t * 2.2), flop: 0.3 * sin(t * 4) * w },
      };
    }
  }
  const pose = drumPose(who, sec, dry, t);
  // the panda flings each new numeral out with its right arm: up, and over
  if (!isPup) {
    let arm = 0;
    for (const tt of throws) arm = Math.max(arm, sin(Math.PI * clamp((sec - tt + 0.3) / 0.45, 0, 1)));
    pose.armR = (pose.armR ?? 0) + 2.4 * arm;
  }
  const blink = rand(Math.floor(t / 2.7), isPup ? 5 : 6) < 0.5 && (t % 2.7) < 0.13;
  pose.glint = blink ? 0 : 1;
  return { who, where: 'drum', pose };
}

function drawDollDrips(g, st, sec) {
  const wet = st.pose.wet ?? 0;
  if (wet < 0.15) return;
  const since = st.since ?? 0;
  const pts = st.who === 'pup' ? [[-9, 18], [9, 18], [-3, 14]] : [[-6, 20], [6, 20], [-11, 8], [11, 8]];
  for (let n = 0; n < 60; n++) {
    const born = n * 0.33 + rand(n, 8) * 0.2;
    if (born > since) break;
    if (rand(n, 9) > wet + 0.15) continue;
    const age = since - born, [lx, ly] = pts[n % pts.length];
    const x = st.pose.x + lx * st.pose.s, y = st.pose.y + ly * st.pose.s + 0.5 * 220 * age * age;
    if (y > 82) continue;
    g.fillRect(Math.round(x), Math.round(y), 1, 2, DROP, { a: 0.85 });
  }
}

/** The hour's soap bubbles; `sec` counts from the door opening. */
function drawBubbles(g, sec, t) {
  if (sec < 0.3 || sec > 14) return;
  for (let i = 0; i < 16; i++) {
    const born = 0.3 + i * 0.22, life = 4 + rand(i, 2) * 4;
    const u = sec - born;
    if (u < 0 || u > life) continue;
    const r = 1.6 + rand(i, 3) * 2.6;
    const x = CX + 6 + u * (16 + rand(i, 4) * 18) + 3 * sin(u * 2.2 + i);
    const y = CY - 4 - u * (5 + rand(i, 5) * 7) + 2 * sin(u * 3 + i * 0.7);
    if (y < -5 || x > 165) continue;
    g.circle(x, y, r, 0xeef8ff, { a: 0.8 });
    g.pixel(x - r * 0.5, y - r * 0.5, 0xffffff);
  }
}
