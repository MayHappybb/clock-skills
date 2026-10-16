// Soroban (key 'abacus'): a Japanese abacus lying on washi paper, seen from
// straight above, and it IS the clock. Six rods in three compartments read
// HH | MM | SS. On each rod the one bead above the bar counts 5 when it
// touches the bar; each of the four beads below counts 1 when it touches the
// bar. No numerals anywhere: the time is literally counted.
//
// Nobody is seen working it. An unseen bookkeeper's fingertip flicks one
// bead every second, and all you see of the hand is its shadow: it hovers,
// soft and wide, over the next bead, sharpens as the finger comes down, and
// the bead jumps away from the shadow's tip with a click. The arithmetic is
// real soroban arithmetic, so the rhythm writes itself: +1, +1, +1, +1, then
// the pinch (+5 -4), ... then the clear-and-carry (+10 -9). Carries are a
// swipe along the bar, right to left, each rod clicking a beat after the
// last: two rods every ten seconds, three at the minute, four at ten
// minutes, five at the hour, all six at midnight.
//
// Light: by day a window on the left, shadows swinging with the sun; after
// dusk a paper lamp, warm, flickering, so every shadow on the paper sways.
//
// Palette, light to dark: washi (paper), honey hinoki (frame), lacquer
// vermilion (bar), ebony (beads), plus mother-of-pearl dots and the soft
// blue-grey of shadow. Beads and frame are flat two-tone facets with a
// keyline and an edge highlight, drawn AA because they move by fractions of
// a pixel; the shadows are layered translucent AA shapes; the paper fibres
// and wood grain are hard static pixels.

import { hex, mix, scale, clamp, lerp, ease, noise, rand, progress, clockFields } from '../js/kit.js';

// ---------------------------------------------------------------- geometry
const RODS = [18, 40, 69, 91, 120, 142];          // rod centres, x
const COMPS = [[6, 52], [57, 103], [108, 154]];   // compartment openings, x0..x1
const BW2 = 9.5, BT = 3, BH2 = 4.5;               // bead half-width, half flat end, half height
const TOP = 4, BAR0 = 22, BAR1 = 27, BOT = 75;    // deck limits (y)
const H_UP = TOP + BH2, H_DN = BAR0 - BH2;        // heaven bead centre: rest / counted
const E_ON = (i) => BAR1 + BH2 + 9 * i;           // earth bead i (0 nearest the bar) counted
const E_OFF = (i) => BOT - BH2 - 9 * (3 - i);     // ... resting at the bottom

// ---------------------------------------------------------------- palette
const PAPER_DAY = hex('ece2cc'), PAPER_LAMP = hex('d9b57e');
const FIBRE_D = hex('d6c9ad'), FIBRE_L = hex('f7f0e0');
const WOOD = hex('c8945a'), WOOD_HI = hex('e6bd85'), WOOD_LO = hex('8a5a30'), GRAIN = hex('b07c46');
const BAR = hex('93301f'), BAR_HI = hex('c4573a'), BAR_LO = hex('5e1c12');
const PEARL = hex('e9eef0');
const ROD = hex('d4b47a'), ROD_LO = hex('a07c48');
const BEAD_KEY = hex('140c08'), BEAD_TOP = hex('694733'), BEAD_LOW = hex('2e1d14'), BEAD_HI = hex('a8805c');
const SHADOW_DAY = hex('2c3448'), SHADOW_LAMP = hex('3a2210');
const GLINT = hex('fff4d6');

// ---------------------------------------------------------------- timing
const D = 0.085;       // a flick's travel, seconds
const REB = 0.07;      // the rebound after the click
const STAG = 0.045;    // carry ripple: delay from rod to rod
const LIFT = 0.06;     // a carry: each rod's beads lift to mid-rod, staggered right to left ...
const MIDU = 0.5;      // ... and wait there, clearly in transit, ...
const DL = 0.03;       // ... until the last has lifted; then every rod lands in the same frame

/**
 * A carry's bead travel: lift to MIDU from `start` (staggered per rod), hold,
 * then land from `land` (the same instant for every rod of the carry), so the
 * reading flips from the old time to the new in one frame, never a mixture.
 */
function carryFlick(s, start, land) {
  if (s <= start) return 0;
  if (s < land) return MIDU * ease.outQuad(Math.min(1, (s - start) / LIFT));
  const q = s - land;
  if (q < DL) return MIDU + (1 - MIDU) * (q / DL) ** 1.4;
  if (q < DL + REB) return 1 - 0.07 * Math.sin((Math.PI * (q - DL)) / REB);
  return 1;
}

/** Bead travel 0..1 at time tau after the flick began: fast, a click, a small rebound. */
function flick(tau) {
  if (tau <= 0) return 0;
  if (tau < D) return 1 - (1 - tau / D) ** 1.7;
  if (tau < D + REB) return 1 - 0.09 * Math.sin((Math.PI * (tau - D)) / REB);
  return 1;
}

// ---------------------------------------------------------------- static texture
const FIBRES = [];
for (let i = 0; i < 260; i++) {
  const x = Math.floor(rand(i, 1) * 160), y = Math.floor(rand(i, 2) * 80);
  const len = 1 + Math.floor(rand(i, 3) * 3), dir = rand(i, 4) < 0.5 ? 1 : 0;
  FIBRES.push([x, y, len, dir, rand(i, 5) < 0.6 ? FIBRE_D : FIBRE_L]);
}
// wood grain: wavering 1-px lines along each rail
const GRAINS = [];
function grainH(x0, x1, y0, y1, seed) {
  for (let k = 0; k < 2; k++) {
    const yb = y0 + 1 + rand(seed, k) * (y1 - y0 - 2);
    for (let x = x0; x < x1; x++) {
      if (rand(seed, k, x) < 0.18) continue;
      GRAINS.push([x, Math.floor(yb + 0.9 * (noise(x * 0.09, seed + k) - 0.5) * 2)]);
    }
  }
}
function grainV(x0, x1, y0, y1, seed) {
  const xb = x0 + 1 + rand(seed, 9) * (x1 - x0 - 2);
  for (let y = y0; y < y1; y++) {
    if (rand(seed, y, 7) < 0.2) continue;
    GRAINS.push([Math.floor(xb + 0.9 * (noise(y * 0.12, seed) - 0.5) * 2), y]);
  }
}
grainH(0, 160, 0, 4, 11); grainH(0, 160, 75, 80, 12);
grainV(0, 6, 4, 75, 13); grainV(154, 160, 4, 75, 14); grainV(52, 57, 4, 75, 15); grainV(103, 108, 4, 75, 16);

// ---------------------------------------------------------------- the count
const digitsOf = (f) => [Math.floor(f.h / 10), f.h % 10, Math.floor(f.m / 10), f.m % 10, Math.floor(f.s / 10), f.s % 10];
/** Which of a rod's five beads touch the bar for digit d: [heaven, earth0..3]. */
const beadsOf = (d) => [d >= 5 ? 1 : 0, d % 5 > 0 ? 1 : 0, d % 5 > 1 ? 1 : 0, d % 5 > 2 ? 1 : 0, d % 5 > 3 ? 1 : 0];

/** The work done at the start of a second: from the previous second's digits to these. */
function transition(prevDigits, digits) {
  const rods = [];
  for (let r = 5; r >= 0; r--) if (prevDigits[r] !== digits[r]) rods.push(r);   // right to left
  return rods.map((r, k) => {
    const A = beadsOf(prevDigits[r]), B = beadsOf(digits[r]);
    const contact = rods.length > 1 ? { x: RODS[r], y0: MID, y1: MID, swipe: true } : contactOf(r, A, B);
    const carry = rods.length > 1, land = (rods.length - 1) * STAG + LIFT;
    return { r, k, A, B, start: k * STAG, carry, land, hit: carry ? land + DL : k * STAG + D, contact, strikes: strikesOf(A, B) };
  });
}

const MID = (BAR0 + BAR1) / 2;

/** Where moving beads strike something (the bar, the frame, a resting bead): y of each click. */
function strikesOf(A, B) {
  const out = [];
  if (A[0] !== B[0]) out.push(B[0] ? BAR0 : TOP);
  let upTop = -1, dnBot = -1;
  for (let i = 0; i < 4; i++) {
    if (!A[i + 1] && B[i + 1] && upTop < 0) upTop = i;
    if (A[i + 1] && !B[i + 1]) dnBot = i;
  }
  if (upTop >= 0) out.push(E_ON(upTop) - BH2);
  if (dnBot >= 0) out.push(E_OFF(dnBot) + BH2);
  return out;
}

/** Where the fingertip meets the rod, and where it ends the push: { x, y0, y1 }. */
function contactOf(r, A, B) {
  const x = RODS[r];
  const heaven = A[0] !== B[0];
  let up = -1, dn = -1;
  for (let i = 0; i < 4; i++) {
    if (!A[i + 1] && B[i + 1]) up = i;                 // lowest bead pushed up
    if (A[i + 1] && !B[i + 1] && dn < 0) dn = i;       // highest bead pushed down
  }
  const earth = up >= 0 || dn >= 0;
  const mid = (BAR0 + BAR1) / 2;
  if (heaven && earth) return { x, y0: mid, y1: mid, swipe: true };      // pinch or clear: along the bar
  if (heaven) return B[0] ? { x, y0: TOP, y1: TOP + 9 } : { x, y0: BAR0, y1: BAR0 - 9 };
  if (up >= 0) { const y0 = E_OFF(up) + BH2; return { x, y0, y1: y0 - 12 }; }
  const y0 = E_ON(dn) - BH2; return { x, y0, y1: y0 + 12 };
}

/** Bead travel u (0 rest, 1 counted) for every bead of every rod at time s into the second. */
function beadTravel(digits, trans, s) {
  const u = digits.map((d) => beadsOf(d));
  for (const tr of trans) {
    const p = tr.carry ? carryFlick(s, tr.start, tr.land) : flick(s - tr.start);
    for (let j = 0; j < 5; j++) u[tr.r][j] = tr.A[j] + (tr.B[j] - tr.A[j]) * p;
  }
  return u;
}

// ---------------------------------------------------------------- the hand
/** The first touch of a second's work, approached from slightly behind. */
function approach(trans) {
  const c = trans[0].contact;
  if (c.swipe) return { x: c.x + 5, y: c.y0 + 1 };
  return { x: c.x, y: c.y0 - 3 * Math.sign(c.y1 - c.y0) };
}
/** Fingertip during the push: follows the bead, or sweeps along the bar from rod to rod. */
function pushTip(trans, s) {
  for (let i = trans.length - 1; i >= 0; i--) {
    if (s < trans[i].start && i > 0) continue;
    const c = trans[i].contact, p = clamp((s - trans[i].start) / D, 0, 1);
    const y = lerp(c.y0, c.y1, ease.outQuad(p));
    if (i < trans.length - 1) {
      const n = trans[i + 1].contact, q = progress(s, trans[i].start, trans[i + 1].start);
      return { x: lerp(c.x, n.x, q), y: lerp(y, n.y0, q) };
    }
    return { x: c.x, y };
  }
  return { x: trans[0].contact.x, y: trans[0].contact.y0 };
}

/** Fingertip (x, y) and height z at time s in this second; the hand is a pure function of the clock. */
function handAt(cur, nxt, s, tod) {
  const last = cur[cur.length - 1];
  const pushEnd = Math.max(last.start + D, last.hit);
  const hz = nxt.length >= 3 ? 15 : 9;                 // wind up higher before a long carry
  const H = approach(nxt);
  const env = Math.sin(Math.PI * progress(s, pushEnd, 1)) ** 2;
  const dx = env * 3 * (noise(tod * 0.9, 21) - 0.5), dy = env * 3 * (noise(tod * 1.1, 22) - 0.5);
  if (s < pushEnd) return { ...pushTip(cur, s), z: 0 };
  const P = pushTip(cur, pushEnd);
  if (s < 0.42) {
    const u = progress(s, pushEnd, 0.42), e = ease.inOutQuad(u);
    return { x: lerp(P.x, H.x, e) + dx, y: lerp(P.y, H.y, e) + dy, z: hz * ease.outQuad(u) + env * 1.5 * noise(tod * 1.3, 23) };
  }
  if (s < 0.8) return { x: H.x + dx, y: H.y + dy, z: hz + env * 1.5 * noise(tod * 1.3, 23) };
  const u = progress(s, 0.8, 1), e = ease.inQuad(u);
  const c = nxt[0].contact;
  return { x: lerp(H.x, c.x, e) + dx, y: lerp(H.y, c.y0, e) + dy, z: (hz + env * 1.5 * noise(tod * 1.3, 23)) * (1 - e) };
}

/** The shadow of the unseen hand: index finger, knuckles and a curled fist, softer the higher. */
function drawHandShadow(g, tip, kx, ky, col, strength) {
  const dir = [0.5, 0.866];                       // finger runs from the tip toward bottom-right
  const at = (dist, side, dz) => {
    const z = tip.z + dz;
    return [tip.x + dir[0] * dist - dir[1] * side + z * kx, tip.y + dir[1] * dist + dir[0] * side + z * ky, z];
  };
  const t0 = at(0, 0, 0), t1 = at(30, 0, 9);      // index finger
  const k0 = at(30, -3, 10), k1 = at(44, 7, 15);  // fist
  const th0 = at(30, -12, 9), th1 = at(18, -13, 6);  // thumb, tucked along the side
  const blur = 0.6 + 0.2 * tip.z;
  const core = strength * (0.24 + 0.16 / (1 + tip.z / 5));
  for (let L = 2; L >= 0; L--) {
    const grow = L * blur, a = L === 0 ? core : core * 0.38;
    g.thickLine(t0[0], t0[1], t1[0], t1[1], 8.5 + grow, col, { a, aa: true });
    g.thickLine(k0[0], k0[1], k1[0], k1[1], 21 + grow, col, { a: a * 0.85, aa: true });
    g.thickLine(th0[0], th0[1], th1[0], th1[1], 7 + grow, col, { a: a * 0.8, aa: true });
  }
}

// ---------------------------------------------------------------- drawing
function drawBead(g, cx, cy, shade) {
  const w = BW2, t = BT, h = BH2;
  g.fillPolygon([[cx - w, cy], [cx - t, cy - h], [cx + t, cy - h], [cx + w, cy], [cx + t, cy + h], [cx - t, cy + h]], shade(BEAD_KEY), { aa: true });
  g.fillPolygon([[cx - w + 1.7, cy - 0.3], [cx - t + 0.5, cy - h + 1], [cx + t - 0.5, cy - h + 1], [cx + w - 1.7, cy - 0.3]], shade(BEAD_TOP), { aa: true });
  g.fillPolygon([[cx - w + 1.7, cy + 0.5], [cx + w - 1.7, cy + 0.5], [cx + t - 0.5, cy + h - 1], [cx - t + 0.5, cy + h - 1]], shade(BEAD_LOW), { aa: true });
  g.thickLine(cx - w + 2.2, cy - 0.9, cx - t + 0.4, cy - h + 1.4, 0.9, shade(BEAD_HI), { aa: true, a: 0.85 });
}

function beadPolygon(cx, cy) {
  return [[cx - BW2, cy], [cx - BT, cy - BH2], [cx + BT, cy - BH2], [cx + BW2, cy], [cx + BT, cy + BH2], [cx - BT, cy + BH2]];
}

export default {
  name: 'Soroban',
  blurb: 'A soroban on washi counts the seconds itself, flicked by a fingertip seen only as its shadow; carries ripple left along the bar. Rods read HH | MM | SS: the top bead is 5, each lower bead 1, when touching the bar.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, night = ctx.night;
    ctx.lcd.backlight(1 - 0.65 * night);
    const s = f.ms / 1000;
    const tod = f.h * 3600 + f.m * 60 + f.s + s;
    const whole = Math.floor(ctx.date.getTime() / 1000) * 1000;
    const digits = digitsOf(f);
    const prev = digitsOf(clockFields(new Date(whole - 1000)));
    const next = digitsOf(clockFields(new Date(whole + 1000)));
    const cur = transition(prev, digits), nxt = transition(digits, next);

    // ---- light: window by day, a flickering paper lamp after dusk
    const hf = f.h + f.m / 60;
    const lamp = 1 - clamp(Math.min(hf - 6, 18.5 - hf), 0, 1);       // fades in over an hour at dawn and dusk
    const flk = lamp * (0.6 * noise(tod * 6.5, 31) + 0.4 * noise(tod * 15, 32) - 0.5);
    const sunU = clamp((hf - 6) / 13, 0, 1);
    const kx = lerp(lerp(0.85, 0.3, sunU), 0.62 + 0.12 * flk, lamp);
    const ky = lerp(0.42, 0.55 + 0.1 * flk, lamp);
    const warm = lamp * (0.85 + 0.3 * flk);
    const shade = (c) => mix(c, mix(scale(c, 0.78), hex('ffb060'), 0.12), warm);   // lamp tint
    const shadowC = mix(SHADOW_DAY, SHADOW_LAMP, lamp);

    // ---- paper
    g.clear(shade(mix(PAPER_DAY, PAPER_LAMP, lamp * 0.6)));
    for (const [x, y, len, dir, c] of FIBRES) {
      if (dir) g.hline(x, y, len, shade(c)); else g.pixel(x, y, shade(c));
    }

    // ---- bead positions
    const u = beadTravel(digits, cur, s);
    const beadsY = RODS.map((_, r) => [lerp(H_UP, H_DN, u[r][0]), ...[0, 1, 2, 3].map((i) => lerp(E_OFF(i), E_ON(i), u[r][i + 1]))]);

    // ---- shadows on the paper: rods, beads, the frame's inner edges
    const sb = 3.2, ox = kx * sb, oy = ky * sb;
    for (const x of RODS) g.fillRect(Math.round(x - 1 + kx * 1.5), TOP, 2, BOT - TOP, shadowC, { a: 0.22 });
    for (let r = 0; r < 6; r++) {
      for (const cy of beadsY[r]) g.fillPolygon(beadPolygon(RODS[r] + ox, cy + oy), shadowC, { aa: true, a: 0.3 });
    }
    // ---- rods
    for (const x of RODS) { g.vline(x - 1, TOP, BOT - TOP, shade(ROD)); g.vline(x, TOP, BOT - TOP, shade(ROD_LO)); }

    // ---- beads
    for (let r = 0; r < 6; r++) for (const cy of beadsY[r]) drawBead(g, RODS[r], cy, shade);

    // ---- frame shadow falling into each opening (the frame stands taller than the beads)
    const fs = 2.6;
    for (const [x0, x1] of COMPS) {
      for (const [y0, y1] of [[TOP, BAR0], [BAR1, BOT]]) {
        g.fillPolygon([[x0, y0], [x1, y0], [x1, y0 + ky * fs], [x0 + kx * fs, y0 + ky * fs], [x0 + kx * fs, y1], [x0, y1]], shadowC, { aa: true, a: 0.32 });
      }
    }

    // ---- frame: rails and dividers in hinoki, the bar in vermilion lacquer
    const wood = shade(WOOD), woodHi = shade(WOOD_HI), woodLo = shade(WOOD_LO);
    const rails = [[0, 0, 160, TOP], [0, BOT, 160, 80 - BOT], [0, TOP, 6, BOT - TOP], [154, TOP, 6, BOT - TOP], [52, TOP, 5, BOT - TOP], [103, TOP, 5, BOT - TOP]];
    for (const [x, y, w, h] of rails) g.fillRect(x, y, w, h, wood);
    const grain = shade(GRAIN);
    for (const [x, y] of GRAINS) g.pixel(x, y, grain);
    // edge highlights where the light catches the frame, dark edges facing away
    g.hline(0, 0, 160, woodHi); g.vline(0, 0, 80, woodHi);
    g.hline(0, 79, 160, woodLo); g.vline(159, 0, 80, woodLo);
    g.hline(6, TOP - 1, 148, woodLo);                              // top rail's inner edge
    g.hline(6, BOT, 148, woodHi);                                  // bottom rail's inner edge, lit
    for (const x of [5, 56, 107]) g.vline(x, TOP, BOT - TOP, woodLo);
    for (const x of [52, 103, 154]) g.vline(x, TOP, BOT - TOP, woodHi);
    // the bar
    g.fillRect(6, BAR0, 148, BAR1 - BAR0, shade(BAR));
    g.hline(6, BAR0, 148, shade(BAR_HI));
    g.hline(6, BAR1 - 1, 148, shade(BAR_LO));
    for (const [x0] of [[52], [103]]) g.fillRect(x0, BAR0, 5, BAR1 - BAR0, wood);  // dividers cross over the bar
    for (const [x0] of [[52], [103]]) { g.vline(x0, BAR0, BAR1 - BAR0, woodHi); g.vline(x0 + 4, BAR0, BAR1 - BAR0, woodLo); }
    // mother-of-pearl dots: one per compartment, catching the light
    for (let c = 0; c < 3; c++) {
      const [x0, x1] = COMPS[c], cx = (x0 + x1) / 2;
      const pearl = mix(PEARL, c === 1 ? hex('cfe6ff') : hex('ffe2ef'), 0.25 + 0.25 * noise(tod * 0.4 + c * 3, 33));
      g.fillCircle(cx, (BAR0 + BAR1) / 2, 1.5, shade(pearl), { aa: true });
    }

    // ---- the click: a glint where each moved bead strikes
    for (const tr of cur) {
      const tau = s - tr.hit;
      if (tau < 0 || tau > 0.16) continue;
      const a = (1 - tau / 0.16) ** 2, x = RODS[tr.r], spread = 1 + 5 * (tau / 0.16);
      for (const y of tr.strikes) for (const side of [-1, 1]) {
        const x0 = x + side * (BT + 1 + spread);
        g.thickLine(x0, y, x0 + side * 2.5, y + (y < MID ? -1.2 : 1.2), 1, GLINT, { aa: true, a });
      }
    }

    // ---- the unseen hand's shadow
    const tip = handAt(cur, nxt, s, tod);
    drawHandShadow(g, tip, kx, ky, shadowC, 1);

    // ---- the lamp's falloff at night: brighter top-left, the far corner in shade
    if (lamp > 0) g.radial(20, -10, 190, [[0, hex('ffcf8a')], [0.55, hex('8a5a2a')], [1, hex('1e1008')]], { a: lamp * (0.22 + 0.05 * flk) });
  },
};
