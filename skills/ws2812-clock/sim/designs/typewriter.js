// Typewriter: a close-up of a sea-green portable typing the time onto a
// lamplit sheet. Dark ink on glowing paper: the page is the light source and
// the type is the shadow in it.
//
// The machine is the clock. Each minute is one typed line; a page holds 60
// lines, so one sheet is one hour, and the lines above the type line are the
// last minutes' log. The carriage's escapement is a clock escapement: it
// ticks the carriage one notch left every second, so the whole page walks
// across the panel's width during the minute, and the bell rings near the
// margin.
//
// Minute: the carriage is thrown back to the right (and bumps the margin
// stop), the platen rolls the line up, and the new time is typed key by key:
// a typebar swings out of the basket, the ribbon lifts, the slug strikes, the
// carriage escapes one character.
// Hour: the full sheet is ripped out upward, a fresh letterheaded sheet is
// wound in from behind the platen, and the new hour is typed on it.
//
// Look: a thin opal sheet (1.2 mm over the 2 mm pitch). The face is dark type
// on a lit page; behind smoke the GOB dot grid broke the thin dark strokes up
// and the page read as a screen. Just-touching dots read as one sheet of paper.
import * as kit from '../js/kit.js';
import { GW, MH, ADV, impression } from './typewriter-type.js';
import { W, H, over, ellipse, seg } from './typewriter-paint.js';
import { drawFrog } from './typewriter-frog.js';

const N = W * H;
const XS = 98;          // print point: screen column where the struck character's centre lands
const TOP = 26;         // screen row of the type line's top at rest (baseline = TOP + 14)
const LP = 18;          // line pitch, rows
const PB = 44;          // the paper goes under the platen below this row
const PADL = 112;       // page left edge, left of the first character's centre (page units): a real inch of margin
const CREEP = 30;       // px the escapement walks the carriage during a minute
const DT = 0.3;         // seconds between keystrokes
const BC = [XS, 46];    // centre of the typebar basket
const VEND = TOP + LP * 59 + 22; // the bottom of a full sheet (page units)

const PAPER = kit.hex('#f6ead2');
const INK = [0.07, 0.07, 0.1];       // transmission of black ribbon ink
const REDINK = [0.95, 0.12, 0.08];   // transmission of red ribbon ink
const ENAMEL = kit.hex('#3f8574');
const STEEL = [0.55, 0.58, 0.62];

const pad = (n) => String(n).padStart(2, '0');
const lineText = (h, m) => pad(h) + ':' + pad(m);
// which bar in the basket carries each character (17 bars, left to right)
const BAR = { '1': 1, '2': 2, '3': 4, '4': 5, '5': 7, ':': 8, '6': 9, '7': 11, '8': 12, '9': 14, '0': 15 };
const NB = 17, TH0 = 0.16, TH1 = Math.PI - 0.16;
const barAngle = (i) => TH1 - (i / (NB - 1)) * (TH1 - TH0); // left (near pi) to right (near 0)

// ------------------------------------------------------------ static rasters
const img = new Float32Array(3 * N);
const BG = new Float32Array(3 * N);     // void, platen, deck, basket without bars
const lamp = new Float32Array(N);       // the desk lamp's pool on the paper
const TEXW = 128, TEXH = 64, tex = new Float32Array(TEXW * TEXH);
(function init() {
  for (let y = 0; y < TEXH; y++) for (let x = 0; x < TEXW; x++) {
    // laid paper: faint chain lines, fibre streaks, grain
    const fib = kit.noise2(x * 0.09, y * 0.9) - 0.5, grain = kit.hash(x, y, 3) - 0.5;
    tex[y * TEXW + x] = 1 + 0.05 * fib + 0.035 * grain + 0.012 * Math.cos(x * kit.TAU / 16);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x, o = 3 * p;
    const dx = (x - 70) / 66, dy = (y - 35) / (y < 35 ? 17 : 30);
    // a low desk lamp: the type line in its pool, the log above going into shade
    lamp[p] = 0.24 + 0.76 * Math.exp(-(dx * dx + dy * dy) * 0.9);
    let c = [0, 0, 0];
    if (y < PB) {
      // the platen behind the paper: black rubber with one soft highlight
      const ry = (y - 30) / 14;
      if (y >= 22) c = kit.scale([0.5, 0.5, 0.55], 0.012 + 0.03 * Math.exp(-((y - 31) ** 2) / 6) * lamp[p] + 0.006 * (1 - ry * ry));
    } else {
      // deck: sea-green enamel lit from above-left, darker toward the front
      const k = 0.11 * (1 - (y - PB) / 30) * (0.45 + 0.55 * Math.exp(-(((x - 60) / 70) ** 2)));
      c = kit.scale(ENAMEL, k);
      if (y === PB) c = kit.scale([0.9, 0.92, 0.95], 0.1 * lamp[p] + 0.02); // chrome trim
      // the basket: a dark half-moon opening the typebars lie in
      const bx = x - BC[0], by = y - BC[1], r = Math.hypot(bx, by);
      if (by > 0 && r < 20.5) {
        const a = kit.clamp(20.5 - r);
        c = kit.mix(c, kit.scale(ENAMEL, 0.008), a);
        if (r > 19.2 && r < 20.8) c = kit.mix(c, [0.08, 0.085, 0.09], 0.7); // chrome rim
      }
    }
    BG[o] = c[0]; BG[o + 1] = c[1]; BG[o + 2] = c[2];
  }
})();

// letterhead: a split-fountain (rainbow) frog-in-glasses mark and a red double rule
const LHU0 = -10, LHW = 70, LHH = 26;
const lhA = new Float32Array(LHW * LHH), lhC = new Float32Array(3 * LHW * LHH);
(function letterhead() {
  const cu = 24 - LHU0, cv = 11;
  for (let v = 0; v < LHH; v++) for (let u = 0; u < LHW; u++) {
    const q = v * LHW + u, x = u - cu, y = v - cv;
    let a = 0;
    // head
    const hd = Math.hypot(x / 9, (y - 1.5) / 6.2);
    if (hd < 1) a = 1;
    // eye bumps
    for (const s of [-1, 1]) {
      const e = Math.hypot(x - s * 4.6, y + 4.3);
      if (e < 3.6) a = 1;
      if (e < 2.1 && e > 0.8) a = 0.12;          // glasses: paper shows through the lens
      if (e < 0.8) a = 1;                          // pupil
    }
    if (Math.abs(x) < 1.2 && Math.abs(y + 4.3) < 0.6) a = 1; // bridge
    // smile, cut out of the face
    if (Math.abs(Math.hypot(x, y + 1) - 5) < 0.6 && y > 1.5) a = 0.15;
    if (v === 22 || v === 24) { if (u > 4 && u < 66) a = Math.max(a, 0.85); }
    lhA[q] = a;
    // split fountain: the inks run left to right through the rainbow
    const col = v >= 21 ? REDINK : kit.hsv(0.95 - (u - cu + 10) / 26 * 0.78, 0.85, 1);
    lhC[3 * q] = col[0]; lhC[3 * q + 1] = col[1]; lhC[3 * q + 2] = col[2];
  }
})();

// ------------------------------------------------------------- the mechanism
const smooth = (a, b, x) => kit.smoothstep(a, b, x);
let NOW = 0;
function timing(hourTurn) {
  return hourTurn ? { ret0: 0.15, ret1: 0.85, T0: 1.1 } : { ret0: 0, ret1: 0.75, T0: 1.0 };
}
const strikeT = (tm, k) => tm.T0 + k * DT;

/** Carriage offset: screen x of page u = 0. Closed form in the seconds of the minute. */
function carriage(s, tm) {
  const end = XS - 5 * ADV - CREEP;
  if (s < tm.ret0) return end;
  if (s < strikeT(tm, 0)) {
    const p = (s - tm.ret0) / (tm.ret1 - tm.ret0);
    // thrown: it gathers speed, slams the margin stop, rebounds a few px and settles
    const e = p < 1 ? p * p * (2 - p) : 1 - 0.035 * Math.sin(Math.PI * kit.clamp((p - 1) / 0.3));
    return end + (XS - end) * e;
  }
  let esc = 0;
  for (let k = 0; k < 5; k++) {
    const q = kit.clamp((s - strikeT(tm, k) - 0.05) / 0.09);
    esc += q < 1 ? q * q * (3 - 2 * q) + 0.08 * Math.sin(Math.PI * q) : 1;
  }
  const f = Math.floor(s);
  const steps = f >= 3 ? f - 3 + kit.ease.outBack(kit.clamp((s - f) / 0.16)) : 0;
  return XS - ADV * esc - (CREEP / 57) * steps;
}

/** How far a typebar is swung up (0 rest, 1 on the platen) for strike time T. */
function swing(s, T) {
  if (s < T - 0.11 || s > T + 0.2) return 0;
  if (s < T) { const q = (s - T + 0.11) / 0.11; return q * q; }
  const q = (s - T) / 0.2; return 1 - q * q * (3 - 2 * q);
}

// --------------------------------------------------------------- the paper
/**
 * Composite one sheet. S: page row at screen row 0; C: carriage; typed: the
 * number of characters on line `last` already struck; rot: tilt (rad) about
 * the page point (pu, pv) as it is torn out; bottom: page row of its lower
 * edge (or Infinity).
 */
function drawPage(pg, S, C, rot, light, night) {
  const { hour, last, typed, bottom, letterhead } = pg;
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const pivX = C + 24, pivY = TOP - S + 6;   // tear pivot, screen
  const seedBase = hour * 977;
  const lines = [];
  for (let j = Math.max(0, last - 4); j <= last; j++) {
    const txt = lineText(hour, j);
    lines[j] = [...txt].map((ch, k) => impression(ch, seedBase + j * 13 + k));
    lines[j].txt = txt;
    // the log: once a line has rolled up it is yesterday's ink. Its age runs
    // with the platen (sc), so the fade is continuous: dark while it is the
    // time, a faint grey a line up, almost gone two lines up under the bail.
    const age = (last - j) - (1 - (pg.sc ?? 1));
    lines[j].fade = age <= 0 ? 1 : age < 1 ? kit.lerp(1, 0.3, kit.ease.inOut(age)) : 0.3 * 0.4 ** (age - 1);
  }
  const yMax = Math.min(PB, H);
  for (let y = 0; y < yMax; y++) {
    for (let x = 0; x < W; x++) {
      // screen -> page
      let u, v;
      if (rot) {
        const dx = x - pivX, dy = y - pivY;
        u = cs * dx + sn * dy + 24; v = -sn * dx + cs * dy + pivY + S;
      } else { u = x - C; v = y + S; }
      // page edges (soft, one pixel)
      let cov = kit.clamp(u + PADL + 0.5) * kit.clamp(v + 0.5);
      if (bottom < Infinity) {
        const jag = 1.5 * kit.hash(Math.floor(u * 0.7), 9) + 0.8 * Math.sin(u * 0.9);
        cov *= kit.clamp(bottom + jag - v + 0.5);
      }
      if (cov <= 0) continue;
      const p = y * W + x, o = 3 * p;
      // paper: texture (bilinear) times the lamp
      const tu = u + 4096, tv = v + 4096, iu = Math.floor(tu), iv = Math.floor(tv), fu = tu - iu, fv = tv - iv;
      const a0 = (iu & (TEXW - 1)), a1 = ((iu + 1) & (TEXW - 1)), b0 = (iv & (TEXH - 1)) * TEXW, b1 = ((iv + 1) & (TEXH - 1)) * TEXW;
      const tx = (tex[b0 + a0] * (1 - fu) + tex[b0 + a1] * fu) * (1 - fv) + (tex[b1 + a0] * (1 - fu) + tex[b1 + a1] * fu) * fv;
      let L = light * lamp[p] * tx;
      // the loose top of the sheet bows a little in the room's air
      // above the bail the sheet leans back out of the lamp
      if (y < 24) L *= 0.62 + 0.38 * kit.smoothstep(4, 24, y);
      if (y < 23) L *= 1 + 0.06 * Math.sin(u * 0.05 + v * 0.03 - NOW * 0.8) * (23 - y) / 23;
      let r = PAPER[0] * L, g = PAPER[1] * L, b = PAPER[2] * L;
      // type
      const jv = (v - TOP) / LP, j = Math.floor(jv);
      if (j >= 0 && j <= last && lines[j]) {
        const ly = v - TOP - j * LP;
        const k = Math.floor((u + ADV / 2) / ADV);
        if (k >= 0 && k < 5 && (j < last || k < typed)) {
          const m = lines[j][k];
          const lx = u - k * ADV + (GW - 1) / 2 - m.dx, my = ly - m.dy;
          const ix = Math.floor(lx), iy = Math.floor(my), fx = lx - ix, fy = my - iy;
          let ink = 0;
          if (ix >= -1 && ix < GW && iy >= -1 && iy < MH) {
            const A = m.a;
            const s00 = ix >= 0 && iy >= 0 ? A[iy * GW + ix] : 0;
            const s10 = ix + 1 < GW && iy >= 0 ? A[iy * GW + ix + 1] : 0;
            const s01 = ix >= 0 && iy + 1 < MH ? A[(iy + 1) * GW + ix] : 0;
            const s11 = ix + 1 < GW && iy + 1 < MH ? A[(iy + 1) * GW + ix + 1] : 0;
            ink = (s00 * (1 - fx) + s10 * fx) * (1 - fy) + (s01 * (1 - fx) + s11 * fx) * fy;
          }
          if (ink > 0) {
            const a = (ink > 0.8 ? 0.97 : ink * 1.21) * lines[j].fade;
            r *= 1 - a * (1 - INK[0]); g *= 1 - a * (1 - INK[1]); b *= 1 - a * (1 - INK[2]);
          }
        }
      }
      if (letterhead && v < LHH && v >= 0) {
        const lu = u - LHU0;
        if (lu >= 0 && lu < LHW - 1) {
          const q = Math.floor(v) * LHW + Math.floor(lu), a = lhA[q] * 0.9;
          if (a > 0) { r *= 1 - a * (1 - lhC[3 * q]); g *= 1 - a * (1 - lhC[3 * q + 1]); b *= 1 - a * (1 - lhC[3 * q + 2]); }
        }
      }
      img[o] += (r - img[o]) * cov; img[o + 1] += (g - img[o + 1]) * cov; img[o + 2] += (b - img[o + 2]) * cov;
    }
  }
}

// ------------------------------------------------------------- the machine
function drawBars(skip) {
  // typebars lying in the basket, chrome, converging on the print point
  const cx = BC[0], cy = BC[1];
  for (let y = cy + 1; y < H; y++) for (let x = cx - 20; x <= cx + 20; x++) {
    const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy);
    if (r < 9.5 || r > 19.4) continue;
    const th = Math.atan2(dy, dx);
    const fi = (TH1 - th) / (TH1 - TH0) * (NB - 1), i = Math.round(fi);
    if (i < 0 || i >= NB || i === skip) continue;
    const d = Math.abs(fi - i) * (TH1 - TH0) / (NB - 1) * r; // px from the bar's axis
    const wdt = r > 15.5 ? 0.75 : 0.25;                      // slugs are fatter
    const a = kit.clamp(wdt + 0.5 - d);
    if (a <= 0) continue;
    const sh = r > 15.5 ? 0.12 : 0.03 + 0.06 * ((r - 9) / 10);
    over(img, y * W + x, kit.scale(STEEL, sh), a);
  }
}

function drawRibbon(lift) {
  // a black-over-red bichrome ribbon from the spool to the right edge;
  // the vibrator lifts it into the type line at the print point
  for (let x = 58; x < W; x++) {
    const w = Math.abs(x - XS), bump = 1 - kit.smoothstep(4.5, 9, w); // the vibrator lifts a flat section
    const top = 41.4 - lift * bump;
    for (let y = Math.floor(top) - 1; y <= Math.ceil(top + 4); y++) {
      if (y < 0 || y >= H) continue;
      const a = kit.clamp(Math.min(y + 1 - top, top + 4 - y));
      if (a <= 0) continue;
      const red = y + 0.5 - top > 2.1;
      const sheen = 0.5 + 0.5 * Math.sin((x + y) * 1.7);
      over(img, y * W + x, red ? kit.scale([0.6, 0.05, 0.04], 0.12 + 0.03 * sheen) : kit.scale([0.5, 0.5, 0.6], 0.012 + 0.008 * sheen), a);
    }
  }
}

function drawGuide() {
  const c = kit.scale([0.9, 0.9, 0.95], 0.06);
  seg(img, XS - 6.5, 40.5, XS - 6.5, 45, 1, c);
  seg(img, XS + 6.5, 40.5, XS + 6.5, 45, 1, c);
  seg(img, XS - 6.5, 45, XS + 6.5, 45, 1, c);
}

/** The margin bell, rung by the carriage five notches before the end of the line. */
function drawBell(s) {
  const cx = 121.5, cy = 55;
  const r = s - 55, ring = r > 0 && r < 1.6 ? Math.exp(-r * 2.5) : 0;
  const jx = ring * 0.5 * Math.sin(r * 70);
  ellipse(img, cx, cy + 1.5, 5.2, 2.6, [0.003, 0.004, 0.004]);
  ellipse(img, cx + jx, cy, 4.6, 3.4, (dx, dy) => kit.scale([0.95, 0.85, 0.6], 0.05 + 0.2 * kit.clamp(0.6 - Math.hypot(dx + 0.4, dy + 0.5)) + 0.25 * ring));
  // the ring, seen: two thin rings of light spreading off the dome
  for (const lag of [0, 0.22]) {
    const q = r - lag;
    if (q <= 0 || q > 0.9) continue;
    const rad = 5 + q * 16, a = 0.18 * (1 - q / 0.9);
    for (let t = Math.PI * 0.9; t < Math.PI * 1.75; t += 0.6 / rad) {
      const x = cx + Math.cos(t) * rad, y = cy + Math.sin(t) * rad * 0.7;
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < W && yi >= PB && yi < H) over(img, yi * W + xi, [1, 0.85, 0.55], a);
    }
  }
}

/**
 * The escapement: a brass star wheel that lets the carriage go one notch a
 * second, its rocking dog catching each tooth. The clock's own escapement.
 */
function drawEscapement(s, typing) {
  const cx = 66, cy = 56, R = 6.4, NT = 8;
  const f = s - Math.floor(s);
  const tick = Math.floor(s) + kit.ease.outBack(kit.clamp(f / 0.14));
  const ang = (tick + typing * 2) * kit.TAU / NT;
  const BR = kit.hex('#d9a441');
  ellipse(img, cx, cy + 1, R + 1, R * 0.62 + 0.6, [0.003, 0.004, 0.003]);
  // teeth, seen a little from above (squashed), lit on their upper faces
  for (let k = 0; k < NT; k++) {
    const a = ang + k * kit.TAU / NT, ca = Math.cos(a), sa = Math.sin(a);
    seg(img, cx + ca * 2.5, cy + sa * 1.55, cx + ca * R, cy + sa * R * 0.62, 1.5, kit.scale(BR, 0.05 + 0.08 * kit.clamp(-sa + 0.4)));
  }
  ellipse(img, cx, cy, 2.8, 1.8, kit.scale(BR, 0.1));
  ellipse(img, cx, cy, 0.9, 0.6, [0.01, 0.01, 0.01]);
  // the dog: rocks out as the tooth passes, drops back with the tick
  const rock = Math.exp(-f * 9) * Math.sin(Math.min(1, f / 0.14) * Math.PI);
  const px = cx - 3, py = cy - 6.5;
  seg(img, px - 4, py - 1, px + 0.6 + rock * 1.4, py + 2.6 - rock * 1.2, 1, kit.scale([0.75, 0.78, 0.82], 0.13));
}

function drawSpool(ang) {
  const cx = 50, cy = 51;
  ellipse(img, cx, cy + 1.2, 9, 5.6, [0.003, 0.004, 0.004]);                     // shadow
  ellipse(img, cx, cy, 8.5, 5.2, kit.scale([0.75, 0.78, 0.82], 0.12));           // cover rim
  ellipse(img, cx, cy, 7.2, 4.4, (dx, dy) => {
    const r = Math.hypot(dx, dy);
    return r > 0.55 ? kit.scale([0.55, 0.06, 0.05], 0.05 + 0.02 * Math.sin(r * 30)) : [0.01, 0.01, 0.012];
  });
  // the hub's three spokes turn as the ribbon feeds
  for (let k = 0; k < 3; k++) {
    const a = ang + k * kit.TAU / 3;
    seg(img, cx, cy, cx + Math.cos(a) * 3.6, cy + Math.sin(a) * 2.2, 1, kit.scale([0.8, 0.82, 0.85], 0.12));
  }
  ellipse(img, cx, cy, 1.1, 0.8, kit.scale([0.9, 0.9, 0.9], 0.2));
}

/** A typebar in flight: from its pivot in the basket to the print point. */
function drawTypebar(ch, u) {
  const th = barAngle(BAR[ch]), dx = Math.cos(th), dy = Math.sin(th);
  const pvx = BC[0] + dx * 7, pvy = BC[1] + dy * 7;
  const rx = BC[0] + dx * 17.5, ry = BC[1] + dy * 17.5;
  const tx = XS, ty = TOP + 7.5;
  const kx = pvx + (rx - pvx) * 0.2, ky = pvy - 18;
  const e = u, m1 = 1 - e;
  const sx = m1 * m1 * rx + 2 * e * m1 * kx + e * e * tx, sy = m1 * m1 * ry + 2 * e * m1 * ky + e * e * ty;
  seg(img, pvx, pvy, sx, sy, 1.8, (t) => kit.scale(STEEL, 0.1 + 0.22 * t));
  // the slug: dark steel, a glint on its shoulder
  ellipse(img, sx, sy, 3.2, 2.6, (ddx, ddy) => kit.scale(STEEL, 0.08 + 0.35 * kit.clamp(-ddx - ddy)));
}

function drawBail(C, lifted) {
  // the paper bail: a chrome rod with two rubber rollers, riding the carriage
  const y = 24 - 5 * lifted;
  for (let x = 0; x < W; x++) {
    const p0 = Math.floor(y) * W + x, f = y - Math.floor(y);
    const c = kit.scale([0.85, 0.87, 0.9], 0.03 + 0.12 * lamp[p0]);
    if (y >= 0) { over(img, p0, c, 1 - f); if (y + 1 < H) over(img, p0 + W, c, 1); if (y + 2 < H) over(img, p0 + 2 * W, kit.scale(c, 0.4), f); }
  }
  for (const ru of [-14, 68]) {
    const x0 = ru + C;
    if (x0 < -10 || x0 > W + 10) continue;
    for (let yy = Math.floor(y) - 1; yy <= y + 3; yy++) for (let x = Math.floor(x0 - 5); x <= x0 + 5; x++) {
      if (x < 0 || x >= W || yy < 0) continue;
      const a = kit.clamp(Math.min(x - (x0 - 4.5), x0 + 4.5 - x) + 0.5) * kit.clamp(Math.min(yy - (y - 1), y + 3 - yy) + 0.5);
      over(img, yy * W + x, [0.012, 0.012, 0.014], a);
    }
  }
}

export default {
  name: 'Typewriter',
  blurb: 'a sea-green portable types each minute as a line; the escapement walks the page across, one sheet per hour, torn out on the hour',
  layouts: ['hub-x2'], look: { look: 'opal', gap: 1.2 }, fps: 60, brightness: 0.22, dither: true,
  frame(ctx) {
    const ms = ctx.date.getTime(), m0 = Math.floor(ms / 60000), s = (ms - m0 * 60000) / 1000;
    const d = ctx.date, hr = d.getHours(), mm = d.getMinutes();
    const hourTurn = mm === 0;
    const tm = timing(hourTurn);
    const night = ctx.night, light = 0.6 * (1 - 0.45 * night);
    img.set(BG);
    NOW = ms / 1000 % 3600;

    const C = carriage(s, tm);
    let typed = 0;
    for (let k = 0; k < 5; k++) if (s >= strikeT(tm, k)) typed++;

    if (!hourTurn) {
      const S = LP * (mm - 1) + LP * kit.ease.inOut(kit.clamp((s - 0.15) / 0.6));
      drawPage({ hour: hr, last: mm, typed, bottom: Infinity, letterhead: true, sc: S / LP - (mm - 1) }, S, C, 0, light, night);
    } else {
      // the fresh sheet winds up from behind the platen...
      const feed = kit.ease.inOut(kit.clamp((s - 0.25) / 0.75));
      drawPage({ hour: hr, last: 0, typed, bottom: Infinity, letterhead: true }, -44 * (1 - feed), C, 0, light, night);
      // ...as the full one is ripped out over it
      const k = kit.clamp((s - 0.02) / 0.8), lift = 130 * k * k * (0.4 + 0.6 * k);
      if (lift < 125) {
        const ph = (hr + 23) % 24;
        drawPage({ hour: ph, last: 59, typed: 5, bottom: VEND, letterhead: false, sc: 0 }, LP * 59 + lift, C, -0.32 * k * k, light, night);
      }
    }
    const bailUp = hourTurn ? smooth(0, 0.2, s) * (1 - smooth(0.85, 1.05, s)) : 0;
    drawBail(C, bailUp);

    // the typebar for the key being struck
    let lift = 0, active = -1, au = 0, ach = '';
    const txt = lineText(hr, mm);
    for (let k = 0; k < 5; k++) {
      const T = strikeT(tm, k), u = swing(s, T);
      if (u > 0) { active = BAR[txt[k]]; au = u; ach = txt[k]; }
      lift = Math.max(lift, s > T - 0.1 && s < T + 0.18 ? Math.sin(Math.PI * kit.clamp((s - T + 0.1) / 0.28)) : 0);
    }
    drawBars(active);
    drawRibbon(lift * 7);
    drawGuide();
    // ribbon spool: turns a little at every strike, through the hour
    drawSpool(-(mm * 5 + typed) * 0.35);
    if (active >= 0) drawTypebar(ach, au);
    drawBell(s);
    drawEscapement(s, typed);
    drawFrog(img, { s, tm, strikeT, hourTurn, mm, night, DT });

    // values run near full scale so the dark machine stays above the HUB75's
    // crushed bottom bit planes; the panel's OE brightness brings it down
    kit.blitGrid(ctx, img, 2 * (1 - 0.5 * night));
  },
};
