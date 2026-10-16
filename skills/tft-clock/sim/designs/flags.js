// Flags ("Two-Blocked"): the time is a signal. You are the officer of the
// watch on one ship, looking through binoculars at a schooner lying at
// anchor across the water. Her foremast flies the hour and her mainmast the
// minutes, as International Code of Signals numeral pennants, read top to
// bottom, streaming downwind and fluttering as real bunting does. A ship
// has one set of flags, so a figure repeated in a hoist flies as the first
// substitute (the yellow-and-blue triangle).
//
// Twice a minute you lower the glasses: the view zooms out to the naked eye
// and your signal log rises into view. On the first look of each minute you
// pencil the time you read (naval style, "1009") and sketch the hoists
// beside it; on the second you tick it. So the time is always findable: in
// code through the glasses, in plain figures on the page.
//
// The minute turn is real seamanship. From :52 each sailor whose hoist must
// change lowers it hand over hand until the pennants that change are below
// the bulwark, crouches to unclip and bend on the new ones, and after :00
// runs the hoist up again in pulls until it is two-blocked. A pennant is
// only ever right or out of sight. The ship's bell strikes the half hours
// in pairs (eight bells at 4, 8 and 12), and at the hour the bow gun fires
// a salute and the smoke rolls down the wind across the hoists.
//
// Style: flat two-tone forms (a schooner, a sea with crest dashes, cumulus)
// in a light that follows the real day, with the five ICS colours (red,
// blue, yellow, black, white) kept pure on the cloth so they read; the
// cloth's folds are three flat tones. The binocular mask is the camera.
// Hard fills for the pennants' interiors and the page's printed rules, AA
// for edges that move by fractions of a pixel (hull, rigging, handwriting).

import { ease, clamp, lerp, noise, sin, clockFields, previousMinute, mix } from '../js/kit.js';
import { hoistSymbols } from './flags-pennants.js';
import {
  lightAt, makeCam, shipPose, drawSky, drawSea, drawNearSea, drawRig, drawHull, drawHoist, drawSailor,
  drawBell, drawSalute, drawAnchorLight, drawGull, sheer, FORE, MAIN, PEN_TOP, shipScreen,
} from './flags-world.js';
import { drawPage, drawPencil } from './flags-log.js';

const MASTS = [{ x: FORE, top: -38 }, { x: MAIN, top: -46 }];

// ------------------------------------------------------------ the minute's rhythm

/** Glasses (0) or log (1), by second of the minute. */
function viewOf(sec) {
  const seg = (a, b) => ease.inOutCubic(clamp((sec - a) / (b - a), 0, 1));
  if (sec < 5) return 0;
  if (sec < 24) return seg(5, 6.3);
  if (sec < 36) return 1 - seg(24, 25.3);
  if (sec < 48) return seg(36, 37.3);
  return 1 - seg(48, 49.3);
}

const HOIST_T0 = 0.4, PULL = 0.6, PULLS = 7;      // after :00
const LOWER_T0 = 52, LOWER_T1 = 56.5;              // before :00

/** How far to lower a hoist so that pennant `idx` and below are out of sight. */
function dropFor(m, idx) {
  if (idx < 0) return 0;
  return sheer(MASTS[m].x) + 0.8 - PEN_TOP[idx];
}

function firstChange(a, b) {
  return a[0] !== b[0] ? 0 : a[1] !== b[1] ? 1 : -1;
}

/** One hoist's state: its symbols, how far it is lowered, and what its sailor is doing. */
function hoistState(m, f, prev, next) {
  const pick = (ff) => hoistSymbols(m === 0 ? ff.hh : ff.mm);
  const cur = pick(f), sec = f.sec;
  let drop = 0, act = 'idle', cyc = 0, dip = 0;
  if (sec >= 50) {
    const D = dropFor(m, firstChange(cur, pick(next)));
    if (D > 0) {
      const u = clamp((sec - LOWER_T0) / (LOWER_T1 - LOWER_T0), 0, 1);
      drop = D * ease.inOutQuad(u);
      if (sec >= LOWER_T0 && u < 1) { act = 'pay'; cyc = (sec - LOWER_T0) / 0.9; }
      if (sec >= LOWER_T1) { act = 'crouch'; dip = 6 * ease.outQuad(clamp((sec - LOWER_T1) / 0.6, 0, 1)) * (sec > 59.4 ? 1 : 1); }
    }
  } else if (sec < HOIST_T0 + PULL * PULLS + 0.2) {
    const D = dropFor(m, firstChange(pick(prev), cur));
    if (D > 0) {
      if (sec < HOIST_T0) {
        drop = D; act = 'crouch'; dip = 6 * (1 - ease.inOutQuad(clamp(sec / HOIST_T0, 0, 1)));
      } else {
        const p = (sec - HOIST_T0) / PULL;
        const k = Math.floor(p), fr = p - k;
        const step = k >= PULLS ? PULLS : k + ease.inOutQuad(clamp(fr / 0.62, 0, 1));
        drop = D * (1 - step / PULLS);
        if (k < PULLS) { act = 'haul'; cyc = p; }
      }
    }
  }
  return { syms: cur, drop, act, cyc, dip };
}

/** The sailor's hands for an action, in ship coordinates. */
function handsFor(m, st, tt) {
  const mx = MASTS[m].x;
  const deck = sheer(mx + 6) + 4 + st.dip;
  const hx = mx + 2.0;
  if (st.act === 'haul' || st.act === 'pay') {
    const k = Math.floor(st.cyc), fr = st.cyc - k;
    const u = st.act === 'haul' ? ease.inOutQuad(clamp(fr / 0.62, 0, 1)) : fr;
    const hi = deck - 18, lo = deck - 5;
    // hauling: the high hand pulls down while the low one reaches up; paying out reverses it
    const a = st.act === 'haul' ? lerp(hi, lo, u) : lerp(lo, hi, u);
    const b = st.act === 'haul' ? lerp(lo, hi, u) : lerp(hi, lo, u);
    return k % 2 ? [[hx, a], [hx + 0.4, b]] : [[hx + 0.4, b], [hx, a]];
  }
  if (st.act === 'crouch') return [[hx + 1, deck - 4], [hx + 2, deck - 3]];
  const br = 0.5 * sin(tt * 1.7 + m * 2);
  return [[hx, deck - 9 + br], [hx + 2.6, deck - 5.5]];
}

// ------------------------------------------------------------ the binocular mask

function drawMask(g, p) {
  const R = lerp(42, 118, ease.inOutQuad(p));
  if (R > 117) return;
  const col = 0x0c0c12;
  const A = [44, 116];
  for (let y = 0; y < 80; y++) {
    const dy = y + 0.5 - 40;
    if (Math.abs(dy) >= R) { g.fillRect(0, y, 160, 1, col); continue; }
    const h = Math.sqrt(R * R - dy * dy);
    let l0 = A[0] - h, r0 = A[0] + h, l1 = A[1] - h, r1 = A[1] + h;
    const spans = r0 >= l1 ? [[l0, r1]] : [[l0, r0], [l1, r1]];
    let x = 0;
    for (const [a, b] of spans) {
      const ia = Math.floor(a), ib = Math.floor(b);
      if (ia > x) g.fillRect(x, y, ia - x, 1, col);
      if (ia >= 0 && ia < 160) g.pixel(ia, y, col, { a: 1 - (a - ia) });
      if (ib >= 0 && ib < 160) g.pixel(ib, y, col, { a: b - ib });
      // a soft dark rim inside the eyepiece
      for (let k = 1; k <= 2; k++) {
        const al = (0.42 / k) * (1 - p);
        g.pixel(ia + k, y, col, { a: al });
        g.pixel(ib - k, y, col, { a: al });
      }
      x = ib + 1;
    }
    if (x < 160) g.fillRect(x, y, 160 - x, 1, col);
  }
  if (p < 0.6) {
    // a faint reflection in each objective, upper left
    for (const cx of A) g.arc(cx, 40, R - 7, R - 6, -1.25, -0.55, 0xffffff, { aa: true, a: 0.1 * (1 - p / 0.6) });
  }
}

// ------------------------------------------------------------ gulls

function gulls(g, cam, f, tt, L) {
  // a passer-by every so often, flying with the wind
  const cyc = Math.floor(tt / 19);
  for (const c of [cyc, cyc - 1]) {
    const age = tt - c * 19;
    if (noise(c * 0.71, 41) < 0.35) continue;
    const wx = -60 + age * 20;
    if (wx > 240) continue;
    const wy = -4 + noise(c * 1.3, 42) * 30 + 3 * sin(age * 0.8);
    draw1(g, cam, wx, wy, tt * 7 + c, L);
  }
  // flushed by the gun at the hour
  if (f.m === 0 && f.sec < 9) {
    const age = f.sec - 0.3;
    if (age > 0) for (let i = 0; i < 6; i++) {
      const sx = 30 + i * 17, sy = 58;
      const up = 1 - Math.exp(-age * (0.6 + i * 0.05));
      draw1(g, cam, sx + age * (14 + i * 2), sy - up * (34 + i * 5), tt * (9 + i) + i, L);
    }
  }
}
function draw1(g, cam, wx, wy, ph, L) {
  const x = cam.X(wx), y = cam.Y(wy);
  if (x < -8 || x > 168 || y < -6 || y > 86) return;
  drawGull(g, x, y, ph, Math.max(0.4, cam.z), L);
}

// ------------------------------------------------------------ the face

export default {
  name: 'Two-Blocked',
  blurb: 'Through binoculars, a schooner at anchor flies the time in ICS numeral pennants; sailors haul each change down and run it up again, and you pencil it into the signal log.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, date = ctx.date;
    const tt = (date.getTime() % 86400000) / 1000;   // continuous seconds for motion
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    const hour = f.h + f.m / 60 + f.sec / 3600;
    const L = lightAt(hour);
    const prev = previousMinute(date), next = clockFields(new Date(date.getTime() + 60000));

    // camera: glasses (z 1) <-> naked eye with the log raised (z 0.4); hand and deck motion
    const p = viewOf(f.sec);
    const z = lerp(1, 0.4, p);
    const ox = (noise(tt * 0.31, 3) - 0.5) * 3.0 * (1 - 0.7 * p);
    const oy = 1.1 * sin(tt * 1.19) + (noise(tt * 0.27, 5) - 0.5) * 2.2 * (1 - 0.7 * p);
    const cam = makeCam(z, lerp(80, 75, p), lerp(37, 88.5, p), ox, oy);
    const pose = shipPose(tt);
    const wind = 0.42 + 0.58 * noise(tt * 0.11, 9);

    drawSky(g, cam, L, tt);
    drawSea(g, cam, L, tt, false);
    drawRig(g, cam, pose, L);

    const st = [0, 1].map((m) => hoistState(m, f, prev, next));
    st.forEach((s, m) => drawHoist(g, cam, pose, L, MASTS[m].x, MASTS[m].top, s.syms, s.drop, tt, wind, m * 1.9));

    // bell: struck on the half hours, in pairs
    let ring = 0, swing = 0;
    if (f.m % 30 === 0) {
      const n = ((f.h * 2 + (f.m >= 30 ? 1 : 0)) % 8) || 8;
      for (let i = 0; i < n; i++) {
        const ts = 1.2 + Math.floor(i / 2) * 1.3 + (i % 2) * 0.42;
        const age = f.sec - ts;
        if (age >= 0 && age < 1.2) { ring = Math.max(ring, 1 - age / 1.2); swing += sin(age * 18) * (1 - age / 1.2); }
      }
    }
    drawBell(g, cam, pose, L, clamp(swing, -1, 1), ring);
    st.forEach((s, m) => {
      const look = s.act === 'idle' ? (noise(tt * 0.2, 20 + m) > 0.6 ? 1 : 0) : 0;
      drawSailor(g, cam, pose, L, MASTS[m].x + 6, s.dip, handsFor(m, s, tt), look);
    });
    drawHull(g, cam, pose, L);
    drawAnchorLight(g, cam, pose, L);
    drawNearSea(g, cam, L, tt, pose);
    if (f.m === 0) drawSalute(g, cam, pose, L, f.sec - 0.2);
    gulls(g, cam, f, tt, L);

    drawMask(g, p);

    // the log
    if (p > 0) {
      const top = lerp(84, 33, ease.outQuad(p)) + 0.5 * sin(tt * 1.1);
      const s = f.sec;
      const fresh = s < 36;   // first look of the minute: write it
      const write = fresh ? clamp((s - 7.0) / 3.0, 0, 1) : 1;
      const sketch = fresh ? clamp((s - 10.4) / 1.6, 0, 1) : 1;
      const tick = fresh ? 0 : clamp((s - 38.6) / 0.5, 0, 1);
      const entry = { digits: f.hh + f.mm, hoists: [st[0].syms, st[1].syms] };
      const tip = drawPage(g, top, L, entry, write, sketch, tick);
      // the pencil: comes in, writes, sketches, goes
      const off = [150, top + 64];
      let pen = null;
      const go = (a, b, u) => [lerp(a[0], b[0], ease.inOutQuad(u)), lerp(a[1], b[1], ease.inOutQuad(u))];
      if (fresh) {
        if (s >= 6.2 && s < 7.0) pen = go(off, [23, top + 16], (s - 6.2) / 0.8);
        else if (s >= 7.0 && s < 10.0) pen = tip;
        else if (s >= 10.0 && s < 10.4) pen = go([78, top + 30], [103, top + 15], (s - 10.0) / 0.4);
        else if (s >= 10.4 && s < 12.0) pen = tip;
        else if (s >= 12.0 && s < 12.9) pen = go([152, top + 24], off, (s - 12.0) / 0.9);
      } else {
        if (s >= 37.8 && s < 38.6) pen = go(off, [83, top + 21], (s - 37.8) / 0.8);
        else if (s >= 38.6 && s < 39.1) pen = tip;
        else if (s >= 39.1 && s < 39.9) pen = go([92, top + 14], off, (s - 39.1) / 0.8);
      }
      if (pen) drawPencil(g, pen[0], pen[1], L);
    }
  },
};
