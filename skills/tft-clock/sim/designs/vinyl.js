// Vinyl: the time is a hologram etched into the grooves of a spinning LP.
//
// A turntable seen from straight above, cropped close: platter, a pop-up
// lamp at top left, start/stop and 33/45 at bottom left, the strobe glowing
// orange under the platter, the S-shaped tonearm and pitch fader on the
// right. The record turns at a true 33 1/3 rpm (one turn every 1.8 s) and,
// like every black record under one lamp, its grooves catch the light as a
// stationary bow-tie of silver that never turns with it.
//
// The time is in that light. Some records are pressed with holograms cut
// into the vinyl; this one carries the hour arched over the label and the
// minutes arched under it, in iridescent foil colours that slide as the
// disc turns, with a deep second image floating beneath the first that
// swings round once a revolution (the hologram's parallax).
//
// Reading it: the number over the label is the hour, the number under it
// the minute. The tonearm says it again: a side lasts exactly an hour, the
// needle tracks from the lead-in at :00 to the run-out at :59, crossing a
// track gap every five minutes (twelve tracks, the gaps visible as fine
// bright rings in the sheen).
//
// The minute turns in the grooves: in the last two seconds the minutes'
// light slips loose and is carried round with the spin, smeared into arcs,
// and fades; after :00 the new minutes come round from behind as arcs and
// settle. At the hour the side is over: the needle runs out into the locked
// groove, the arm lifts and returns to its rest, the record rises off the
// platter, turns over (edge-on exactly at :00) and drops: the other side,
// another label colour, the new hour. Then the arm cues down at the lead-in.
//
// Rendering: the static scene (plinth, platter, sheen) is baked once with
// 3x3 supersampling; per frame only the rotating label, the hologram bands
// (row prefix sums in text space, so a smear of any length costs two
// lookups) and the arm are live. During the flip the record is the bake,
// looked up through the flip's projection, plus a glare that follows the tilt.
//
// Palette: satin black plinth and aluminium, black vinyl with a cool silver
// sheen, Technics strobe orange, a label colour per hour, and the foil ramp
// (cyan, violet, magenta, gold, green) for the time alone.

import { clamp, ease, mix, rgb, R, G, B, hex, sin, cos, rand, progress, from565 } from '../js/kit.js';
import {
  GEOM, TAB, BOX, BASE, BARE, label, LABEL_K, LABEL_T, MAT, MAT_K, MAT_T,
  band, TS, TW, DOTS, STROBE_A, STROBE_COL,
} from './vinyl-art.js';

const { CX, CY, RREC, RLAB, RMAT, PX, PY, ARM, BAND_IN, BAND_OUT, RREF } = GEOM;
const TAU = Math.PI * 2;


// integer colour maths for the per-pixel paths (what the C does: no float
// rounding calls). u in 0..1, channels clamped to 0..255.
const c8 = (v) => (v <= 0 ? 0 : v >= 255 ? 255 : v | 0);
const pack = (r, g, b) => (c8(r) << 16) | (c8(g) << 8) | c8(b);
function mixF(a, b, u) {
  if (u <= 0) return a;
  if (u >= 1) return b;
  const ar = a >>> 16, ag = (a >>> 8) & 255, ab = a & 255;
  return pack(ar + ((b >>> 16) - ar) * u + 0.5, ag + (((b >>> 8) & 255) - ag) * u + 0.5, ab + ((b & 255) - ab) * u + 0.5);
}

// ---- the foil ramp: 64 colours round the hue circle, hand-picked stops
const FOIL_STOPS = ['#5ff4ff', '#7a8cff', '#c66bff', '#ff6fd0', '#ffb36a', '#fff27a', '#8dff9a', '#5ff4ff'].map(hex);
const FOIL = Array.from({ length: 64 }, (_, i) => {
  const u = (i / 64) * (FOIL_STOPS.length - 1), k = Math.floor(u);
  return mix(FOIL_STOPS[k], FOIL_STOPS[k + 1], u - k);
});
const foil = (h) => FOIL[((h % 1) * 64) | 0];   // h is never negative
const DEEP = hex('#1a0f3a');

// ---- tonearm geometry: stylus at radius Rs from the spindle
const PCX = CX - PX, PCY = CY - PY, PD = Math.hypot(PCX, PCY);
const PSI0 = Math.atan2(PCY, PCX);
function armAngle(Rs) {
  const ca = clamp((ARM * ARM + PD * PD - Rs * Rs) / (2 * ARM * PD), -1, 1);
  return PSI0 - Math.acos(ca);
}
const R_LEAD = 36.6, R_END = 15.6, R_LOCK = 13.9, R_REST = 46;
const REST_PSI = armAngle(R_REST);
const REST_X = PX + ARM * Math.cos(REST_PSI), REST_Y = PY + ARM * Math.sin(REST_PSI);

/** Where the arm is at sH seconds into the hour: stylus radius and lift (0 down, 1 up). */
function armState(sH) {
  const k = (a, b) => ease.inOutQuad(progress(sH, a, b));
  if (sH < 4.5) return { Rs: R_REST, lift: 0.35 };
  if (sH < 5.5) return { Rs: R_REST, lift: 0.35 + 0.65 * k(4.5, 5.5) };
  if (sH < 9) return { Rs: R_REST + (R_LEAD - R_REST) * k(5.5, 9), lift: 1 };
  if (sH < 10) return { Rs: R_LEAD, lift: 1 - k(9, 10) };
  if (sH < 3578) return { Rs: R_LEAD + (R_END - R_LEAD) * ((sH - 10) / 3568), lift: 0 };
  if (sH < 3581) return { Rs: R_END + (R_LOCK - R_END) * ease.outQuad(progress(sH, 3578, 3581)), lift: 0 };
  if (sH < 3583) return { Rs: R_LOCK, lift: 0 };
  if (sH < 3584) return { Rs: R_LOCK, lift: k(3583, 3584) };
  if (sH < 3589) return { Rs: R_LOCK + (R_REST - R_LOCK) * k(3584, 3589), lift: 1 };
  if (sH < 3590) return { Rs: R_REST, lift: 1 - 0.65 * k(3589, 3590) };
  return { Rs: R_REST, lift: 0.35 };
}

// ---- the hologram
// Text space: x along the arc (1 = 1 px at RREF), y across it. The top
// band reads over the label (outer edge = glyph top), the bottom band under
// it (inner edge = glyph top), both left to right.
function rowSum(P, SW, row, x) {
  if (x <= 0) return 0;
  if (x >= SW) x = SW;
  const i = x | 0, f = x - i, o = row * (SW + 1);
  return P[o + i] + (i < SW ? (P[o + i + 1] - P[o + i]) * f : 0);
}
/**
 * Coverage of band `bd` at radius r, angular window [a0, a1] (clock
 * radians, a1 > a0), `top` true for the hour band. Box-filtered along the
 * arc, linear across it.
 */
function cover(bd, top, r, a0, a1) {
  const { P, SW, SH } = bd;
  let y = top ? (BAND_OUT - r) * TS + 0.5 : (r - BAND_IN) * TS + 0.5;
  if (y < 0 || y >= SH - 1) return 0;
  const j = y | 0, fy = y - j;
  // signed angle from the band's centre line
  const mid = top ? 0 : Math.PI;
  let u0 = a0 - mid, u1 = a1 - mid;
  while (u0 > Math.PI) { u0 -= TAU; u1 -= TAU; }
  while (u0 < -Math.PI) { u0 += TAU; u1 += TAU; }
  let x0 = (TW / 2 + u0 * RREF) * TS + 1, x1 = (TW / 2 + u1 * RREF) * TS + 1;
  if (!top) { const t = 2 * (TW / 2 * TS + 1); const a = t - x1, b = t - x0; x0 = a; x1 = b; }
  if (x1 <= 0 || x0 >= SW) return 0;
  const L = x1 - x0;
  const v0 = rowSum(P, SW, j, x1) - rowSum(P, SW, j, x0);
  const v1 = rowSum(P, SW, j + 1, x1) - rowSum(P, SW, j + 1, x0);
  return (v0 + (v1 - v0) * fy) / L;
}

/**
 * The hologram over one pixel. `st` carries the frame's state: bands, the
 * smear of each, parallax offset, rotation. Returns a colour mixed over
 * `under`, or -1 if nothing is there.
 */
function holo(st, r, a, s, c, under, tilt) {
  if (r < BAND_IN - 1.5 || r > BAND_OUT + 1.5) return -1;
  // the hours own the top 2 x 57 degrees; everything else is the minutes'
  const isTop = a < 1.0 || a > TAU - 1.0;
  const sm = isTop ? st.top : st.bot;
  if (!sm.bd) return -1;
  // pixel width along the arc, in clock radians, sets the box filter
  const pw = 0.9 / r;
  const lag = sm.phi, Lw = sm.len + pw;
  const a0 = a - lag - pw * 0.5;
  const f = cover(sm.bd, isTop, r, a0, a0 + Lw) * sm.fade;
  // the deep image: displaced by the parallax vector
  const dr = st.ox * s - st.oy * c, da = (st.ox * c + st.oy * s) / r;
  const b0 = a - da - lag - pw * 0.5;
  const d = sm.fade > 0 ? cover(sm.bd, isTop, r - dr, b0, b0 + Lw) * sm.fade : 0;
  if (f <= 0.01 && d <= 0.01) return -1;
  // foil colour: bands across the radius that slide with the turn
  const hue = r * 0.037 + 0.11 * sin(2 * a + st.rot) + st.hue + (isTop ? 0 : 0.33);
  let col = foil(hue);
  // groove ridges show through the foil
  const ridge = 0.8 + 0.2 * cos(r * 3.9);
  // the sheen axis turns it white-hot
  const sd = s * 0.70710678 + c * 0.70710678;
  let sp = 1 / (1 + (sd * sd) / 0.03); sp *= sp;
  const glow = sm.flare + tilt;
  col = pack((col >>> 16) * ridge, ((col >>> 8) & 255) * ridge, (col & 255) * ridge);
  col = mixF(col, 0xffffff, sp * 0.7 + glow * 0.5);
  let out = under;
  if (d > 0.01) out = mixF(out, mixF(DEEP, foil(hue + 0.5), 0.35), d * 0.9 * (1 - f));
  if (f > 0.01) out = mixF(out, col, f);
  return out;
}

// ---- small helpers
const labelSample = (tex, lx, ly) => {
  const k = LABEL_K, m = LABEL_T / 2;
  const x = (m + lx * k) | 0, y = (m + ly * k) | 0;
  if (x < 0 || y < 0 || x >= LABEL_T || y >= LABEL_T) return tex.col;
  return tex.buf[y * LABEL_T + x];
};
function labelColour(tex, dx, dy, cr, sr) {
  // rotate the screen offset back into the label's frame; 4 samples
  let r = 0, g = 0, b = 0;
  for (let k = 0; k < 4; k++) {
    const ox = dx + ((k & 1) ? 0.25 : -0.25), oy = dy + ((k & 2) ? 0.25 : -0.25);
    const v = labelSample(tex, ox * cr + oy * sr, -ox * sr + oy * cr);
    r += v >>> 16; g += (v >>> 8) & 255; b += v & 255;
  }
  return ((r >> 2) << 16) | ((g >> 2) << 8) | (b >> 2);
}
function matColour(dx, dy, cr, sr) {
  const lx = dx * cr + dy * sr, ly = -dx * sr + dy * cr;
  const x = (MAT_T / 2 + lx * MAT_K) | 0, y = (MAT_T / 2 + ly * MAT_K) | 0;
  if (x < 0 || y < 0 || x >= MAT_T || y >= MAT_T) return 0x1e1d21;
  return MAT.buf[y * MAT_T + x];
}

const DUST = Array.from({ length: 7 }, (_, i) => ({ r: 17 + rand(i, 1, 9) * 19, a: rand(i, 2, 9) * TAU }));

// ---- drawing the arm
function drawArm(g, Rs, lift) {
  const psi = armAngle(Rs);
  const ux = Math.cos(psi), uy = Math.sin(psi), vx = -uy, vy = ux;
  const P = (u, v, ox = 0, oy = 0) => [PX + ux * u * ARM + vx * v + ox, PY + uy * u * ARM + vy * v + oy];
  const up = lift * 1.6;
  const pass = (ox, oy, shadow) => {
    const A = shadow ? 0x000000 : null;
    const tube = [P(-0.05, 0, ox, oy), P(0.3, 2.6, ox, oy), P(0.58, 1.2, ox, oy), P(0.76, -1.6, ox, oy), P(0.86, -1.2, ox, oy)];
    const o = shadow ? { aa: true, a: 0.45 } : { aa: true };
    // counterweight behind the pivot
    const cw0 = P(-0.12, 0, ox, oy), cw1 = P(-0.27, 0, ox, oy);
    g.thickLine(cw0[0], cw0[1], cw1[0], cw1[1], 7.5, A ?? hex('#3c3e44'), o);
    if (!shadow) {
      g.thickLine(cw0[0], cw0[1], cw1[0], cw1[1], 5.5, hex('#8e9097'), o);
      const m = P(-0.2, -1.2, ox, oy), m2 = P(-0.2, 1.4, ox, oy);
      g.thickLine(m[0], m[1], m2[0], m2[1], 1, hex('#2a2b30'), { aa: true });
    }
    // gimbal base
    const pv = P(0, 0, ox, oy);
    if (!shadow) {
      g.fillCircle(pv[0], pv[1], 6.2, hex('#2a2b30'), { aa: true });
      g.fillCircle(pv[0], pv[1], 4.6, hex('#a9abb2'), { aa: true });
      g.fillCircle(pv[0] - 1, pv[1] - 1, 2, hex('#e6e8ec'), { aa: true });
    } else g.fillCircle(pv[0], pv[1], 6.2, A, o);
    // the S tube
    g.stroke(tube, 2.4, A ?? hex('#55575d'), o);
    if (!shadow) g.stroke(tube.map(([x, y]) => [x - 0.35, y - 0.35]), 1.1, hex('#e9ebef'), { aa: true });
    // headshell, offset toward the record
    const hs = [P(0.84, -2.6, ox, oy), P(0.84, 1.4, ox, oy), P(1.04, 2.3, ox, oy), P(1.06, -2.4, ox, oy)];
    g.fillPolygon(hs, A ?? hex('#121216'), o);
    if (!shadow) {
      const cb = [P(0.92, -1.7, ox, oy), P(0.92, 1.5, ox, oy), P(1.02, 1.8, ox, oy), P(1.02, -1.8, ox, oy)];
      g.fillPolygon(cb, hex('#b8322a'), { aa: true });
      // finger lift
      const f0 = P(0.9, -2.4, ox, oy), f1 = P(0.95, -5.2, ox, oy);
      g.thickLine(f0[0], f0[1], f1[0], f1[1], 1.1, hex('#c9cbd0'), { aa: true });
    } else {
      const f0 = P(0.9, -2.4, ox, oy), f1 = P(0.95, -5.2, ox, oy);
      g.thickLine(f0[0], f0[1], f1[0], f1[1], 1.1, A, o);
    }
  };
  pass(2 + 3 * lift, 2.5 + 3 * lift, true);
  pass(-up * 0.4, -up * 0.6, false);
  return P(1, 0);
}

export default {
  name: 'Vinyl',
  blurb: 'A spinning LP under one lamp: the hour and minutes are a hologram cut into the grooves; the arm plays one side an hour and the record turns over at the hour.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields;
    ctx.lcd.backlight(1 - 0.62 * ctx.night);
    const tod = f.h * 3600 + f.m * 60 + f.sec;
    const sH = f.m * 60 + f.sec;
    // 33 1/3 rpm: a turn every 1.8 s (48,000 a day, so midnight is seamless)
    const rot = TAU * ((tod % 1.8) / 1.8);
    const cr = Math.cos(rot), sr = Math.sin(rot);

    // which side, and the flip at the hour: edge-on at :00 exactly
    const sF = sH >= 1800 ? sH - 3600 : sH;
    const flipping = sF > -4 && sF < 4;
    const fl = flipping ? (sF + 4) / 8 : 0;
    const phiF = Math.PI * ease.inOutCubic(fl);
    const lift = flipping ? Math.sin(Math.PI * fl) : 0;

    // the minutes' smear around the minute turn (not at the hour: the flip does that)
    const sec = f.sec;
    const hourTurn = (f.m === 59 && sec >= 57) || (f.m === 0 && sec < 3);
    const st = {
      rot, hue: tod * 0.045, smear: false,
      ox: 1.7 * Math.cos(rot), oy: 1.7 * Math.sin(rot),
      top: { bd: band(f.hh), phi: 0, len: 0, fade: 1, flare: 0 },
      bot: { bd: band(f.mm), phi: 0, len: 0, fade: 1, flare: 0 },
    };
    if (!hourTurn && sec >= 57.6) {
      const u = (sec - 57.6) / 2.4;
      st.smear = true;
      st.bot.phi = 1.0 * u * u; st.bot.len = 1.0 * u * u;
      st.bot.fade = 1 - u * u * u; st.bot.flare = 0.5 * u;
    } else if (!hourTurn && sec < 2.4) {
      const u = 1 - sec / 2.4;
      st.smear = u > 0.02;
      st.bot.phi = -0.75 * u * u; st.bot.len = 0.75 * u * u;
      st.bot.fade = 1 - u * u * u; st.bot.flare = 0.5 * u;
    }
    // a gentle swell of the foil every revolution, as the parallax swings
    const tex = label(f.h);

    if (!flipping) {
      g.draw(BASE, 0, 0);
      // the label turns
      g.paint((px, py, x, y) => {
        const dx = px - CX, dy = py - CY, rr = TAB.r[y * TAB.w + x - BOX.x0];
        if (rr > RLAB + 0.5) return -1;
        const col = labelColour(tex, dx, dy, cr, sr);
        const cov = RLAB + 0.5 - rr;
        return cov >= 1 ? col : mixF(from565(g.buf[y * 160 + x]), col, cov);
      }, [CX - 13, CY - 13, 26, 26]);
      // the hologram bands
      const shade = (px, py, x, y) => {
        const i = y * TAB.w + x - BOX.x0;
        return holo(st, TAB.r[i], TAB.a[i], TAB.s[i], TAB.c[i], from565(g.buf[y * 160 + x]), 0);
      };
      g.paint(shade, [CX - 34, CY - 37, 68, 21]);
      if (st.smear) g.paint(shade, [CX - 37, CY - 14, 74, 52]);
      else g.paint(shade, [CX - 34, CY + 16, 68, 22]);
      // dust riding round
      for (const d of DUST) {
        const a = d.a + rot;
        const x = CX + d.r * sin(a), y = CY - d.r * cos(a);
        g.pixel(x, y, 0xc8ccd4, { a: 0.55 });
      }
    } else {
      // the record is off the platter: shade it live, with the mat beneath
      g.draw(BARE, 0, 0);
      const sc = 1 + 0.1 * lift;
      const cy = CY - 1.5 * lift;
      const cf = Math.cos(phiF), acf = Math.max(Math.abs(cf), 0.035);
      const tilt = Math.sin(phiF) * 0.7;
      const shx = 4 * lift, shy = 4.5 * lift;
      const back = cf < 0;
      const texS = label(f.h);
      const glare = tilt * 70;
      const RR2 = (RREC + 0.4) * (RREC + 0.4), LAB2 = RLAB * RLAB, M2 = RMAT * RMAT;
      g.paint((px, py) => {
        // the record: look its flat self up in the bake, nearest texel
        const dx = (px - CX) / sc, dy = (py - cy) / (sc * acf);
        const r2 = dx * dx + dy * dy;
        if (r2 < RR2) {
          if (acf < 0.06) return hex('#2c2c32');              // edge-on: the vinyl's edge
          const ddy = back ? -dy : dy;
          if (r2 < LAB2) return labelColour(texS, dx, ddy, cr, sr);
          const tx = (CX + dx) | 0, ty = (CY + ddy) | 0;
          const i = ty * TAB.w + tx - BOX.x0;
          const v = from565(BASE.buf[ty * 160 + tx]);
          let col = pack((v >>> 16) + glare, ((v >>> 8) & 255) + glare, (v & 255) + glare * 1.1);
          const h = holo(st, TAB.r[i], TAB.a[i], TAB.s[i], TAB.c[i], col, tilt * 0.6);
          if (h >= 0) col = h;
          return col;
        }
        // the mat, turning, under the record's shadow
        const mx = px - CX, my = py - CY;
        if (mx * mx + my * my >= M2) return -1;
        let col = matColour(mx, my, cr, sr);
        const sx = (px - CX - shx) / sc, sy = (py - cy - shy) / (sc * acf);
        if (sx * sx + sy * sy < RREC * RREC) col = ((col >>> 1) & 0x7f7f7f) - ((col >>> 3) & 0x1f1f1f);
        return col;
      }, [CX - 41, 0, 82, 80]);
    }
    g.fillCircle(CX, CY - (flipping ? 0 : 0), 1.5, hex('#d6d8dc'), { aa: true });

    // strobe row B: drifts slowly (the other speed's row never stands still)
    const drift = TAU * ((tod % 4) / 4) / DOTS;
    const rB = RMAT + 2.15;
    for (let j = 0; j < DOTS; j++) {
      const a = (j / DOTS) * TAU + drift;
      const y = CY - rB * cos(a);
      if (y < 0 || y >= 80) continue;
      const x = CX + rB * sin(a);
      let da = Math.abs(a - STROBE_A); da = da % TAU; if (da > Math.PI) da = TAU - da;
      const lit = da < 0.9 ? 1 - da / 0.9 : 0;
      g.pixel(x, y, mix(hex('#2a2a2e'), STROBE_COL, lit * 0.8), { a: 0.85 });
    }

    // arm rest post
    g.fillCircle(REST_X + 1, REST_Y + 1.5, 3, 0x000000, { aa: true, a: 0.4 });
    g.fillCircle(REST_X, REST_Y, 2.6, hex('#2a2b30'), { aa: true });
    g.fillCircle(REST_X, REST_Y, 1.4, hex('#6a6c72'), { aa: true });

    const arm = armState(sH);
    const tip = drawArm(g, arm.Rs, arm.lift);
    // the needle in the groove: a pin of light where it touches
    if (arm.lift < 0.05 && arm.Rs < RREC) {
      const fl2 = 0.55 + 0.45 * sin(tod * 37.0);
      g.fillCircle(tip[0], tip[1], 0.9, mix(hex('#9fb4d8'), 0xffffff, fl2), { aa: true, a: 0.85 });
    }
  },
};
