// skating, "Night Rink": an ice rink seen straight down from the roof
// girders at night. The time is not drawn, it is CUT: four skaters each own a
// numeral and skate it into the ice as one continuous blade tracing, slanted
// like handwriting, with the cusps of compulsory figures (the 8 is the
// figure eight). Follow spots track the skaters; where a spot passes, the
// grooves catch the light and glitter. Between minutes the skaters free-skate
// loops, jump (shadow peels away, three turns in the air, a spray on
// landing) and spin to a stop, and their faint scratches pile up and slowly
// soften.
//
// Before a digit changes, the resurfacer comes out through the boards and
// shaves its strip of ice in overlapping passes, headlights on, beacon
// turning; the old numeral vanishes under the conditioner, the new ice is
// wet and glossy for a few seconds, and just after :00 the skater cuts the
// new numeral there. At the hour two machines resurface the whole sheet
// from both ends, all four skaters cut the new time, two of them spin the
// colon dots into the ice, and the four join hands in a pinwheel round
// centre ice.
//
// Palette: night ice (navy to slate), frost white grooves, warm follow-spot
// light, four costume colours, a white-and-blue machine with an amber
// beacon. Ice and spots are one coarse shader; grooves, skaters and the
// machine are AA shapes moving by fractions of a pixel.

import { mix, hex, clamp, rand, noise2, sin } from '../js/kit.js';
import { GLYPH, DIGIT_OX, COLON, along } from './skating-glyphs.js';
import {
  schedule, skaterAt, freeAt, spinAmt, jumpAir, lastLanding, spinOff,
  machineAt, passTime, stripBox, CARVE_V, PIN_C,
} from './skating-show.js';

const ICE_D = hex('#101c33'), ICE_M = hex('#1a2b48'), ICE_LIT = hex('#8e98ac'), ICE_EDGE = hex('#22385a');
const FROST_D = hex('#46638a'), FROST_L = hex('#d6e6f8'), CORE_D = hex('#9ab6d6'), CORE_L = hex('#ffffff');
const SCRATCH = hex('#7d98ba');
const WET = hex('#060c1c'), SHEEN = hex('#9fc0e8');
const BOARD = hex('#dfe6ee'), BOARD_CAP = hex('#3a4a66'), OUTSIDE = hex('#070b16');
const RED_LINE = hex('#c03848'), BLUE_RING = hex('#3a64b0');
const SPOT_C = hex('#fff1d6');
const SKIN = hex('#f2c4a0');
const COSTUME = [
  { c: hex('#ff3b5c'), d: hex('#a8183a'), hair: hex('#3a2418') },
  { c: hex('#ffc23a'), d: hex('#b07a10'), hair: hex('#1a1414') },
  { c: hex('#2fe0c0'), d: hex('#108a78'), hair: hex('#f0d27a') },
  { c: hex('#b07aff'), d: hex('#6a38c0'), hair: hex('#7a3a1a') },
];
const BULBS = [hex('#ff5a5a'), hex('#ffd24a'), hex('#5aff8a'), hex('#5ab4ff'), hex('#ff7ae0')];

const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

// rink interior: rounded rect
const RX0 = 3, RY0 = 3, RX1 = 157, RY1 = 77, RR = 14;

export default {
  name: 'Night Rink',
  blurb: 'Skaters cut the time into floodlit ice as blade tracings; a resurfacer shaves each changing numeral away.',
  fps: 60,
  frame(g, ctx) {
    const T = ctx.date.getTime() / 1000;
    const mk = Math.floor(T / 60), sec = T - mk * 60;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    const S = schedule(mk), Sp = schedule(mk - 1);
    const runsNow = S.runs, runsAll = [...Sp.runs, ...S.runs];

    // ---------------------------------------------------------- skaters & spots
    const sk = [0, 1, 2, 3].map((i) => {
      const a = skaterAt(i, T), b = skaterAt(i, T - 1 / 30), l = skaterAt(i, T - 0.22);
      let hx = a.x - b.x, hy = a.y - b.y;
      if (a.free > 0.5 && Math.hypot(hx, hy) < 0.15) {
        // nearly stopped in a spin: take the heading from the path itself
        const p = freeAt(i, T + 0.6), q = freeAt(i, T - 0.6);
        hx = p[0] - q[0]; hy = p[1] - q[1];
      }
      const hl = Math.hypot(hx, hy) || 1;
      return { ...a, hx: hx / hl, hy: hy / hl, sx: l.x, sy: l.y, i };
    });
    const spots = sk.map((s) => [s.sx, s.sy, 9.5]);
    if (S.pin) {
      const w = smooth((T - S.pin.c0 + 1.5) / 1.5) * (1 - smooth((T - S.pin.c1) / 1.5));
      if (w > 0) spots.push([PIN_C[0], PIN_C[1], 21 * w]);
    }
    const lightAt = (x, y) => {
      let L = 0;
      for (const [cx, cy, r] of spots) {
        const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
        if (d2 >= (r + 2) * (r + 2)) continue;
        L += d2 < (r - 2) * (r - 2) ? 1 : (r + 2 - Math.sqrt(d2)) / 4;
      }
      return clamp(L, 0, 1);
    };

    // ---------------------------------------------------------- the ice
    g.coarse((x, y) => {
      const n = noise2(x / 34, y / 22, 7);
      const edge = clamp(1 - Math.min(x - RX0, RX1 - x, (y - RY0) * 1.6, (RY1 - y) * 1.6) / 22, 0, 1);
      const base = mix(mix(ICE_D, ICE_M, n), ICE_EDGE, edge * 0.6);
      return mix(base, ICE_LIT, lightAt(x, y) * 0.8);
    }, { cell: 4 });

    // markings under the ice
    g.fillRect(80, RY0, 2, RY1 - RY0, RED_LINE, { a: 0.28 });
    g.ring(PIN_C[0], PIN_C[1], 12.5, 13.5, BLUE_RING, { aa: true, a: 0.35 });

    // ---------------------------------------------------------- scratches
    const swept = (x, y, tau) => {
      for (const r of runsAll) { const p = passTime(r, x, y); if (p > tau && p <= T) return true; }
      return false;
    };
    const RATE = 4, AGE = 18;
    const base0 = Math.floor(T * RATE) / RATE;
    for (const s of sk) {
      let px = s.x, py = s.y, pAir = jumpAir(s.i, T) * s.free > 0.05;
      for (let k = 0; k <= AGE * RATE; k++) {
        const tau = base0 - k / RATE;
        const q = skaterAt(s.i, tau);
        const air = jumpAir(s.i, tau) * q.free > 0.05;
        if (!air && !pAir && !swept(q.x, q.y, tau)) {
          const fade = 1 - (T - tau) / AGE;
          const L = lightAt(q.x, q.y);
          g.line(px, py, q.x, q.y, mix(SCRATCH, FROST_L, L), { a: (0.16 + 0.22 * L) * fade });
        }
        px = q.x; py = q.y; pAir = air;
      }
    }

    // ---------------------------------------------------------- the numerals
    const grooveSeg = (ax, ay, bx, by) => {
      const L = lightAt((ax + bx) / 2, (ay + by) / 2);
      g.thickLine(ax, ay, bx, by, 2.7, mix(FROST_D, FROST_L, 0.25 + 0.75 * L), { aa: true });
      return L;
    };
    const coreSeg = (ax, ay, bx, by, L) => g.line(ax, ay, bx, by, mix(CORE_D, CORE_L, L), { a: 0.85 });
    const glints = [];
    for (let p = 0; p < 4; p++) {
      const d = +S.cd[p], G = GLYPH[d], ox = DIGIT_OX[p];
      const carve = S.carves.find((c) => c.p === p);
      const upto = carve ? clamp((T - carve.c0) * CARVE_V, 0, G.len) : G.len;
      if (upto <= 0) continue;
      const run = S.nextChange[p] ? runsNow : [];
      const gone = (x, y) => { for (const r of run) if (passTime(r, x, y) <= T) return true; return false; };
      const n = Math.min(G.pts.length - 1, Math.ceil(upto / G.step));
      const pts = [];
      // every other resampled point: segments ~3 px, fewer overlapping AA edges
      for (let k = 0; k < n; k += 2) pts.push([ox + G.pts[k][0], G.pts[k][1]]);
      { const [x, y] = along(d, upto); pts.push([ox + x, y]); }
      const Ls = [];
      for (let k = 1; k < pts.length; k++) {
        const [ax, ay] = pts[k - 1], [bx, by] = pts[k];
        if (gone((ax + bx) / 2, (ay + by) / 2)) { Ls.push(-1); continue; }
        Ls.push(grooveSeg(ax, ay, bx, by));
      }
      for (let k = 1; k < pts.length; k++) {
        const L = Ls[k - 1];
        if (L < 0) continue;
        coreSeg(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], L);
        if (L > 0.5 && k % 3 === 0) glints.push([pts[k][0], pts[k][1], L, p * 100 + k]);
      }
    }
    // the colon: two spin rosettes
    for (let k = 0; k < 2; k++) {
      const [cx, cy] = COLON[k];
      let prog = 1;
      if (S.hour) { const sp = S.spins[k]; prog = clamp((T - sp.c0) / (sp.c1 - sp.c0), 0, 1); }
      if (prog <= 0) continue;
      if (S.nextChange[2]) { let gone = false; for (const r of runsNow) if (passTime(r, cx, cy) <= T) gone = true; if (gone) continue; }
      const L = lightAt(cx, cy);
      const a1 = Math.PI * 2 * smooth(prog);
      g.arc(cx, cy, 0.4, 2.5, 0, a1, mix(FROST_D, FROST_L, 0.25 + 0.75 * L), { aa: true });
      g.arc(cx, cy, 1.0, 1.7, 0, a1 * 0.8, mix(CORE_D, CORE_L, L), { aa: true, a: 0.8 });
    }
    // glitter where a spot lies on a groove
    for (const [x, y, L, id] of glints) {
      const tw = sin(T * 7 + rand(id) * 6.28);
      if (tw > 0.55) g.pixel(x + (rand(id, 1) - 0.5) * 2, y + (rand(id, 2) - 0.5) * 2, CORE_L, { a: L * (tw - 0.55) / 0.45 });
    }

    // ---------------------------------------------------------- wet fresh ice
    for (const r of runsAll) {
      for (let k = 0; k < r.n; k++) {
        const [xa, xb] = stripBox(r, k);
        for (let y = RY0; y < RY1; y += 6) {
          const age = T - passTime(r, (xa + xb) / 2, y + 3);
          if (age < 0 || age > 7) continue;
          const wet = 1 - age / 7;
          g.fillRect(xa, y, xb - xa, 6, WET, { a: 0.45 * wet });
          g.fillRect(xa + 3, y, 1, 6, SHEEN, { a: 0.25 * wet });
        }
      }
    }

    // ---------------------------------------------------------- spray
    const spray = (x, y, hx, hy, t0, seed, n = 8) => {
      const age = T - t0;
      if (age < 0 || age > 0.6) return;
      for (let j = 0; j < n; j++) {
        const side = j % 2 ? 1 : -1;
        const a = Math.atan2(hy, hx) + side * (1.2 + rand(seed, j) * 1.0);
        const v = 7 + rand(seed, j, 3) * 9, dist = v * (1 - Math.exp(-age * 6)) / 6;
        g.fillCircle(x + Math.cos(a) * dist, y + Math.sin(a) * dist, 0.6, FROST_L, { aa: true, a: 1 - age / 0.6 });
      }
    };
    for (const c of [...S.carves, ...Sp.carves]) {
      const G = GLYPH[c.d];
      for (const cs of G.cusps) {
        const [x, y, hx, hy] = along(c.d, cs);
        spray(c.ox + x, y, hx, hy, c.c0 + cs / CARVE_V, c.p * 31 + cs | 0, 6);
      }
      const [x, y, hx, hy] = along(c.d, G.len);
      spray(c.ox + x, y, hx, hy, c.c1, c.p * 17 + 5, 10);
    }
    for (const s of sk) {
      const land = lastLanding(s.i, T);
      if (T - land < 0.6) {
        const q = skaterAt(s.i, land);
        if (q.free > 0.5) spray(q.x, q.y, s.hx, s.hy, land, s.i * 7 + Math.floor(land), 9);
      }
    }

    // ---------------------------------------------------------- the resurfacer
    for (const r of runsAll) {
      const m = machineAt(r, T);
      if (m) drawMachine(g, m[0], m[1], m[2], T);
    }

    // ---------------------------------------------------------- skaters
    for (const s of sk) drawSkater(g, s, T);

    // ---------------------------------------------------------- boards
    drawBoards(g, T, S.hour ? sec : 99);
  },
};

// ------------------------------------------------------------ pieces

function drawSkater(g, s, T) {
  const C = COSTUME[s.i];
  const air = jumpAir(s.i, T) * s.free;
  const spin = spinAmt(s.i, T) * s.free;
  const sc = 1 + 0.5 * air;
  // body angle: along the heading; arms across it
  let ang = Math.atan2(s.hy, s.hx);
  if (air > 0) {
    // three turns in the air
    const land = lastLanding(s.i, T + 0.7);
    const u = clamp(1 - (land - T) / 0.7, 0, 1);
    ang += 3 * Math.PI * 2 * u;
  }
  if (spin > 0) {
    // spin: integral of the spin rate, 12 half-turns over the window
    const x = (((T - spinOff(s.i)) % 30) + 30) % 30 / 6;
    const c = Math.cos(Math.PI * x);
    ang += 6 * Math.PI * ((-c + c * c * c / 3) + 2 / 3) / (4 / 3);
  }
  const ax = -Math.sin(ang), ay = Math.cos(ang), fx = Math.cos(ang), fy = Math.sin(ang);
  // shadow stays on the ice and slides away as she rises
  g.fillEllipse(s.x + 1.2 + 3.5 * air, s.y + 1.5 + 3.5 * air, 2.8 - 0.6 * air, 2.0 - 0.4 * air, 0x000000, { aa: true, a: 0.4 - 0.15 * air });
  const arm = (spin > 0.3 ? 2.2 : 4.2) * sc;
  if (spin < 0.3 && air < 0.2) {
    // free leg stretched behind
    const hx = Math.cos(Math.atan2(s.hy, s.hx)), hy = Math.sin(Math.atan2(s.hy, s.hx));
    g.thickLine(s.x, s.y, s.x - hx * 4, s.y - hy * 4, 1.1, C.d, { aa: true });
  }
  g.fillCircle(s.x, s.y, 2.3 * sc, C.d, { aa: true });
  g.thickLine(s.x - ax * arm, s.y - ay * arm, s.x + ax * arm, s.y + ay * arm, 1.1 * sc, SKIN, { aa: true });
  g.fillCircle(s.x, s.y, 1.55 * sc, C.c, { aa: true });
  g.fillCircle(s.x + fx * 0.5 * sc, s.y + fy * 0.5 * sc, 1.05 * sc, C.hair, { aa: true });
  if (spin > 0.5) g.ring(s.x, s.y, 3.6, 4.4, C.c, { aa: true, a: 0.25 * spin });
}

function drawMachine(g, x, y, th, T) {
  const fx = Math.cos(th), fy = Math.sin(th), rx = -fy, ry = fx;
  const P = (a, b) => [x + fx * a + rx * b, y + fy * a + ry * b];
  const box = (a0, a1, b0, b1) => [P(a0, b0), P(a1, b0), P(a1, b1), P(a0, b1)];
  // headlight beams on the ice
  g.fillPolygon([P(7, -3), P(24, -8), P(24, 8), P(7, 3)], SPOT_C, { aa: true, a: 0.14 });
  // shadow
  g.fillPolygon(box(-9.5, 7, -5.6, 5.6).map(([px, py]) => [px + 1.6, py + 1.8]), 0x000000, { aa: true, a: 0.4 });
  g.fillPolygon(box(-9.6, -6.4, -5.8, 5.8), hex('#2b3138'), { aa: true });        // conditioner
  g.fillPolygon(box(-6.6, 7, -4.6, 4.6), hex('#e9eef2'), { aa: true });           // body
  g.fillPolygon(box(-5.6, 1.6, -3.7, 3.7), hex('#2d62b8'), { aa: true });         // snow tank
  g.fillPolygon(box(-5.6, 1.6, -0.6, 0.6), hex('#7fb0f0'), { aa: true });         // tank seam
  g.fillPolygon(box(2.4, 5.4, -3.1, 3.1), hex('#1c2733'), { aa: true });          // cab
  const [hx, hy] = P(3.8, 0);
  g.fillCircle(hx, hy, 1.2, hex('#f0c8a0'), { aa: true });                       // driver
  g.fillCircle(hx, hy, 0.7, hex('#c03030'), { aa: true });                       // red toque
  // the amber beacon turns: a sweeping glow
  const [bx, by] = P(-2, 0);
  const ba = T * 9;
  g.fillCircle(bx + Math.cos(ba) * 2, by + Math.sin(ba) * 2, 2.6, hex('#ffb020'), { aa: true, a: 0.3 });
  g.fillCircle(bx, by, 1.0, hex('#ffc040'), { aa: true });
  const [la, lb] = [P(7, -3), P(7, 3)];
  g.fillCircle(la[0], la[1], 0.8, SPOT_C, { aa: true });
  g.fillCircle(lb[0], lb[1], 0.8, SPOT_C, { aa: true });
}

// outside corners as polygons, built once
const CORNERS = (() => {
  const out = [];
  const R = RR + 2, cs = [[RX0 - 2 + R, RY0 - 2 + R, Math.PI, 0, 0], [RX1 + 2 - R, RY0 - 2 + R, -Math.PI / 2, 160, 0],
    [RX1 + 2 - R, RY1 + 2 - R, 0, 160, 80], [RX0 - 2 + R, RY1 + 2 - R, Math.PI / 2, 0, 80]];
  for (const [cx, cy, a0, ex, ey] of cs) {
    const pts = [[ex, ey]];
    for (let k = 0; k <= 8; k++) { const a = a0 + (k / 8) * (Math.PI / 2); pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
    out.push(pts);
  }
  return out;
})();
const BULB_POS = (() => {
  const out = [];
  for (let x = 20; x <= 140; x += 8) { out.push([x, 1.5]); out.push([x, 78.5]); }
  for (let y = 18; y <= 62; y += 8) { out.push([1.5, y]); out.push([158.5, y]); }
  return out;
})();

function drawBoards(g, T, hourSec) {
  for (const pts of CORNERS) g.fillPolygon(pts, OUTSIDE, { aa: true });
  g.roundRect(RX0 - 2, RY0 - 2, RX1 - RX0 + 4, RY1 - RY0 + 4, RR + 2, BOARD, { t: 2, aa: true });
  g.roundRect(RX0 - 2, RY0 - 2, RX1 - RX0 + 4, RY1 - RY0 + 4, RR + 2, BOARD_CAP, { t: 0.8, aa: true, a: 0.8 });
  // string of bulbs on the board cap; a chase at the hour
  const chase = hourSec < 16;
  BULB_POS.forEach(([x, y], k) => {
    const c = BULBS[k % BULBS.length];
    let on = 0.55 + 0.45 * sin(T * 1.3 + rand(k) * 6.28);
    if (chase) on = ((k + Math.floor(T * 12)) % 5 === 0) ? 1 : 0.25;
    g.fillCircle(x, y, 0.9, c, { aa: true, a: on });
  });
}
