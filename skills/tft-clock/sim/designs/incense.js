// incense: an incense seal clock (香篆钟), seen from straight above.
//
// A bronze tray of fine ash. Pressed into it, one continuous line of
// sandalwood powder, folded back and forth inside squared seal-script
// strokes: the line spells the HOUR. It folds exactly sixty times, so
// every crossing of a stroke is one minute; a brass pin stands beside every
// fifth, a red one at the start. One ember creeps along it: it crosses a
// stroke in exactly a minute (its place on the crossing is the seconds),
// and leaves pale ash behind it. Dark powder = minutes still to come, pale
// ash = minutes gone. Smoke threads up from the ember, its shadow drifting
// over the ash; the room's light moves over the tray through the day (a
// window lattice of sunlight by day, a lamp in the evening, at night only
// the ember lights it).
//
// At the hour the burnt-out seal is swept flat by the ash press in the last
// four seconds, a bronze mould for the new hour slides over the tray,
// powder is scraped into its cut-outs, the mould lifts, and a joss stick
// lights the new seal at the red pin.
//
// Rendering: a lit still life. Everything that changes at most once a minute
// is a cached frame (incense-tray.js); per frame only the ~200 pixels round
// the ember are recoloured, then glow, sparks and smoke are drawn on top.
// Palette: grey ash, dark sandalwood, pale burnt ash, bronze, and the
// ember's ramp from white-hot to char; light, not outlines, makes the depth.

import { Gfx, mix, rand, noise, sin, cos, clamp, ease, progress, clockFields } from '../js/kit.js';
import { buildSeal, trailAt, pixFrom } from './incense-glyphs.js';
import { minuteBase, dith, trailColour, ambientAt, sunAt, mould, KEY, POWDER, speckle } from './incense-tray.js';

const W = 160, H = 80;
const IGN = 5.4;          // seconds after the hour when the new seal is lit
const SWEEP = 56;         // second of :59 when the ash press starts its pass

/** The light of the room at minute (h, m). */
function lightAt(h, m) {
  const hour = h + m / 60;
  return { amb: ambientAt(hour), sun: sunAt(hour), hour, key: `${h}:${m}` };
}

// the 24 seals and their moulds are fixed data: lay them all out once
// (the mould is lit as the room is at the hour it is used)
for (let h = 0; h < 24; h++) { const hh = String(h).padStart(2, '0'); buildSeal(hh); mould(hh, lightAt(h, 0)); }


/** Where the ash press is during the last seconds of the hour (x of its edge). */
const pressX = (sec) => -6 + 172 * ease.inOutQuad(progress(sec, SWEEP, 60));

/** Arc length of the ember on the seal at (m, sec), or null when there is none. */
function frontArc(seal, m, sec) {
  const u = seal.units;
  if (m === 0) {
    if (sec < IGN) return null;
    return u[0] + (u[1] - u[0]) * (sec - IGN) / (60 - IGN);
  }
  return u[m] + (u[m + 1] - u[m]) * sec / 60;
}

/** The ember at a moment (ms since epoch): { x, y, s, seal } or null (swept, or not yet lit). */
function emberAt(ms) {
  const f = clockFields(new Date(ms));
  const seal = buildSeal(f.hh), s = frontArc(seal, f.m, f.sec);
  if (s === null) return null;
  const [x, y] = trailAt(seal, s);
  if (f.m === 59 && f.sec >= SWEEP && pressX(f.sec) >= x - 1) return null;
  return { x, y, s, seal };
}

// The ember's colour ramp, by distance behind the burning front (px).
const RAMP = [
  [-1.6, null], [0, [0x30, 0x18, 0x0c]], [0.01, [0xff, 0xf6, 0xd0]], [1.0, [0xff, 0xd8, 0x70]], [2.4, [0xff, 0x80, 0x20]],
  [4.5, [0xd0, 0x34, 0x0c]], [7.5, [0x62, 0x18, 0x0a]], [11, [0x36, 0x2e, 0x2a]], [17, null],
];

export default {
  name: 'Incense Seal',
  blurb: 'The hour pressed in incense powder, folded 60 times: an ember crosses one fold a minute and leaves ash.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, sec = f.sec, m = f.m, ms = ctx.date.getTime();
    const night = ctx.night;
    ctx.lcd.backlight(1 - 0.6 * night);
    const tod = f.h * 3600 + m * 60 + sec;
    const light = lightAt(f.h, m);
    const seal = buildSeal(f.hh);
    const base = minuteBase(f.hh, m, light);
    const dark = clamp(1 - (light.amb[0] + light.amb[1]) / 1.4, 0, 1);   // how much the ember's light matters

    // ---------------------------------------------------------------- the tray
    if (m === 0 && sec < 4.6) {
      hourMould(g, ctx, f, sec, seal, base, light);
    } else {
      g.draw(base.canvas, 0, 0);
      if (m === 59 && sec >= SWEEP) {
        const xb = pressX(sec);
        g.clip(0, 0, Math.max(0, xb), H); g.draw(base.empty, 0, 0); g.unclip();
      }
    }

    // ---------------------------------------------------------------- the ember
    const em = emberAt(ms);
    const flick = 0.75 + 0.25 * noise(tod * 7.3, 5) + 0.12 * noise(tod * 23, 6);
    if (em) {
      const pix = seal.pix, sF = em.s;
      const from = pixFrom(seal, Math.min(sF - 17, seal.units[m])), to = pixFrom(seal, sF + 0.1);
      const burntTo = seal.units[m];
      for (let i = from; i < to + 40 && i < pix.n; i++) {
        const k = pix.k[i], d = sF - pix.s[i];
        if (d < -1.6) break;
        const x = k % W, y = (k / W) | 0;
        const lr = base.lr[k], lg = base.lg[k], lb = base.lb[k];
        const bed = base.bed;
        let col;
        if (d >= 17 || (d >= 11 && pix.s[i] < burntTo)) {
          if (pix.s[i] < burntTo) continue;     // already ash in the cached frame
          col = trailColour(k, true, lr, lg, lb, seal.cov);
        } else {
          // ramp, stretched a little by the flicker
          const dd = d / (0.7 + 0.3 * flick);
          let j = 1;
          while (j < RAMP.length - 1 && RAMP[j][0] < dd) j++;
          const a = RAMP[j - 1], b = RAMP[j], u = clamp((dd - a[0]) / (b[0] - a[0]), 0, 1);
          const ca = a[1] ?? trailColour(k, false, lr, lg, lb, seal.cov), cb = b[1] ?? trailColour(k, true, lr, lg, lb, seal.cov);
          const hot = d > 0 && d < 8 ? flick : 1;
          col = [(ca[0] + (cb[0] - ca[0]) * u) * hot, (ca[1] + (cb[1] - ca[1]) * u) * hot, (ca[2] + (cb[2] - ca[2]) * u) * hot];
        }
        const c = pix.cov[i];
        const r = bed[k * 3] + (col[0] - bed[k * 3]) * c, gg = bed[k * 3 + 1] + (col[1] - bed[k * 3 + 1]) * c, bb = bed[k * 3 + 2] + (col[2] - bed[k * 3 + 2]) * c;
        g.buf[k] = dith(r, gg, bb, x, y);
        g.cost.px++;
      }
      // its light on the ash round it
      const big = 1 + 1.4 * dark;
      const glowC = 0xff7a28;
      g.fillCircle(em.x, em.y, 13 * big, glowC, { a: (0.05 + 0.06 * dark) * flick, aa: true });
      g.fillCircle(em.x, em.y, 7 * big, glowC, { a: (0.07 + 0.06 * dark) * flick, aa: true });
      g.fillCircle(em.x, em.y, 3.2, 0xffa040, { a: 0.22 * flick, aa: true });
      g.fillCircle(em.x, em.y, 1.3, 0xfff0c0, { a: 0.7 * flick, aa: true });

      // a brass pin glints as the ember reaches it
      if (m % 5 === 0 && (m > 0 ? sec < 1.6 : sec - IGN < 1.6)) {
        const pin = seal.pins[m / 5], p = m > 0 ? sec / 1.6 : (sec - IGN) / 1.6;
        const a = Math.sin(Math.PI * p), r = 1 + 2.5 * a, px = Math.floor(pin.x) + 0.5, py = Math.floor(pin.y) + 0.5;
        g.thickLine(px - r, py, px + r, py, 0.8, 0xfff4d0, { a: 0.9 * a, aa: true });
        g.thickLine(px, py - r, px, py + r, 0.8, 0xfff4d0, { a: 0.9 * a, aa: true });
      }

      // sparks: now and then the powder crackles
      const k0 = Math.floor(tod * 2);
      for (let q = k0 - 1; q <= k0; q++) {
        if (rand(q, 3) > 0.22) continue;
        const t0 = q / 2 + rand(q, 4) * 0.4, age = tod - t0;
        if (age < 0 || age > 0.45) continue;
        for (let n = 0; n < 3; n++) {
          const ang = rand(q, n, 5) * 6.283, dist = (2 + 5 * rand(q, n, 6)) * ease.outQuad(age / 0.45);
          g.pixel(em.x + cos(ang) * dist, em.y + sin(ang) * dist, mix(0xffe090, 0xff4010, age / 0.45), { a: 1 - age / 0.45 });
        }
      }
    }

    // ---------------------------------------------------------------- the press, sweeping at :59
    if (m === 59 && sec >= SWEEP) press(g, pressX(sec), light);

    // ---------------------------------------------------------------- lighting the new seal
    if (m === 0 && sec >= 4.6 && sec < 6.6) jossStick(g, sec, seal, light);

    // ---------------------------------------------------------------- smoke, and its shadow
    smoke(g, ms, tod, light, dark);
  },
};

// The smoke: a thread drawn through points emitted over the last few
// seconds. Each point leaves the ember where it was, rises (so, from above,
// spreads and drifts with the draught) and curls; its shadow falls on the
// ash further away the higher it has risen.
const AGES = 26, DA = 0.2;
function smoke(g, ms, tod, light, dark) {
  const pts = [];
  for (let i = 0; i < AGES; i++) {
    const a = i * DA, te = tod - a;
    const em = emberAt(ms - a * 1000);
    if (!em) { pts.push(null); continue; }
    // the draught turns slowly through the hours; it gusts a little by the minute
    const wind = -0.35 + 6.283 * noise(te * 0.0011, 41) + 0.8 * (noise(te * 0.05, 42) - 0.5);
    const v = 5.5 + 4 * noise(te * 0.09, 43);
    const wob = (noise(te * 0.9, 44) - 0.5) * (2 * a + 1.1 * a * a);
    const cr = 1.6 * a, ca = te * 1.3 + a * 1.9;
    // the room's air drifts it, and the warm tray draws it in over itself
    const cx = 80 - em.x, cy = 40 - em.y, cl = Math.hypot(cx, cy * 2) + 1;
    let ux = cos(wind) + 1.1 * cx / cl, uy = sin(wind) * 0.8 + 1.1 * cy * 2 / cl;
    const ul = Math.hypot(ux, uy) + 1e-3; ux /= ul; uy /= ul;
    let x = em.x + ux * v * a - uy * wob + cos(ca) * cr;
    let y = em.y + uy * v * a * 0.75 + ux * wob + sin(ca) * cr * 0.8;
    x += (x - 80) * 0.03 * a; y += (y - 40) * 0.03 * a;         // nearer the eye, it spreads from the centre
    pts.push([x, y, a]);
  }
  const sunK = light.sun.k * (1 - dark);
  const lum = (light.amb[0] + light.amb[1] + light.amb[2]) / 3 + 0.4 * light.sun.k;
  const day = mix(0x6a7080, 0xe4e8ee, clamp(lum, 0, 1));
  const CH = [[0, 4, 0.9, 0.6], [4, 9, 1.4, 0.42], [9, 14, 2.2, 0.27], [14, 19, 3.2, 0.16], [19, AGES - 1, 4.6, 0.08]];
  for (const pass of [0, 1]) {
    if (pass === 0 && sunK < 0.05) continue;
    for (const [i0, i1, w, a] of CH) {
      // a chunk of the thread, broken wherever the ember was out
      let run = [];
      const flush = () => {
        if (run.length >= 2) {
          if (pass === 0) {
            const sh = run.map(([x, y, aa]) => [x + 1.5 + aa * 3.2, y + 1 + aa * 2.4]);
            g.stroke(sh, w + 1, 0x000000, { a: a * 0.32 * sunK, aa: true });
          } else {
            const warm = clamp(1 - run[0][2] / 0.6, 0, 1);
            g.stroke(run.map(([x, y]) => [x, y]), w, mix(day, 0xffb070, warm * 0.6 * (0.4 + dark)), { a: a * (0.85 + 0.3 * dark), aa: true });
          }
        }
        run = [];
      };
      for (let i = i0; i <= i1; i++) { if (pts[i]) run.push(pts[i]); else flush(); }
      flush();
    }
  }
}

// The ash press: a flat bronze blade drawn across the tray in the last
// seconds of the hour, wiping the burnt seal flat, a ridge of ash before it.
function press(g, xb, light) {
  const L = (light.amb[0] + light.amb[1]) / 2 + light.sun.k * 0.3;
  if (xb > -4 && xb < W + 4) {
    for (let y = 2; y < H - 2; y++) {
      const lump = 1.5 + 1.5 * rand(y, Math.floor(xb), 51);
      g.fillRect(Math.round(xb + 2), y, Math.round(lump), 1, mix(0x5a5650, 0xd0ccc4, rand(y, 52) * 0.6), { a: 0.85 });
    }
    g.fillRect(Math.round(xb) + 3, 0, 3, H, 0x000000, { a: 0.28 });     // its shadow
    const c = (k) => mix(0x000000, k, clamp(L * 1.3, 0.35, 1.2));
    g.fillRect(Math.round(xb) - 4, 0, 6, H, c(0x7a5a34));
    g.vline(Math.round(xb) - 4, 0, H, c(0xd8b070));
    g.vline(Math.round(xb) - 3, 0, H, c(0xa07c48));
    g.vline(Math.round(xb) + 1, 0, H, c(0x3a2814));
  }
}

// The new hour, :00 to :04.6: the mould slides over the swept tray, powder
// is scraped into its cut-outs left to right, and it lifts away.
function hourMould(g, ctx, f, sec, seal, base, light) {
  const plate = mould(f.hh, light);
  const IN = 1.2, FILL0 = 1.3, FILL1 = 3.3, LIFT0 = 3.4;
  let py = 0;
  if (sec < IN) py = -H * (1 - ease.outCubic(sec / IN));
  else if (sec > LIFT0) py = -H * ease.inCubic((sec - LIFT0) / (4.6 - LIFT0));
  // under the plate
  if (sec < LIFT0) {
    g.draw(base.empty, 0, 0);
    const xf = sec < FILL0 ? -10 : -6 + 172 * ease.inOutQuad(progress(sec, FILL0, FILL1));
    if (xf > -6) {
      const pix = seal.pix;
      for (let i = 0; i < pix.n; i++) {
        const k = pix.k[i], x = k % W, y = (k / W) | 0;
        if (x > xf + 2 * sin(y * 0.4)) continue;
        const col = trailColour(k, false, base.lr[k], base.lg[k], base.lb[k], seal.cov), c = pix.cov[i], bd = base.bed;
        g.buf[k] = dith(bd[k * 3] + (col[0] - bd[k * 3]) * c, bd[k * 3 + 1] + (col[1] - bd[k * 3 + 1]) * c, bd[k * 3 + 2] + (col[2] - bd[k * 3 + 2]) * c, x, y);
        g.cost.px++;
      }
    }
    g.draw(plate, 0, Math.round(py), { key: KEY });
    if (py > -H) g.fillRect(0, Math.round(py) + H, W, 4, 0x000000, { a: 0.35 });
    // the scraper and its heap of powder, riding on the plate
    if (sec >= FILL0 && sec < FILL1 + 0.05) {
      const L = clamp((light.amb[0] + light.amb[1]) / 1.4 + light.sun.k * 0.3, 0.4, 1.1);
      for (let y = 1; y < H - 1; y++) {
        const w = 2 + 2.5 * rand(y, Math.floor(xf * 2), 61);
        g.fillRect(Math.round(xf + 2), y, Math.round(w), 1, mix(0x000000, mix(0x5a3218, 0x9a6234, rand(y, 62)), L));
      }
      g.fillRect(Math.round(xf) - 2, 0, 3, H, mix(0x000000, 0xd8c08a, L));
      g.vline(Math.round(xf) + 1, 0, H, mix(0x000000, 0x7a6440, L));
      g.fillRect(Math.round(xf) + 5, 0, 2, H, 0x000000, { a: 0.2 });
    }
  } else {
    g.draw(base.canvas, 0, 0);
    g.fillRect(0, Math.round(py) + H, W, 3 + 6 * (sec - LIFT0), 0x000000, { a: 0.3 * (1 - (sec - LIFT0) / 1.2) });
    g.draw(plate, 0, Math.round(py), { key: KEY });
  }
}

// A joss stick comes in, touches the red pin's end of the seal, and goes.
function jossStick(g, sec, seal, light) {
  const [sx, sy] = seal.start;
  const dx = sx < 80 ? -0.8 : 0.8, dy = 0.6;            // from the nearer bottom corner
  const reach = sec < 5.25 ? 1 - ease.outCubic(progress(sec, 4.6, 5.25)) : sec < 5.8 ? 0 : ease.inCubic(progress(sec, 5.8, 6.6));
  const tx = sx + dx * (1.5 + 110 * reach), ty = sy + dy * (1.5 + 110 * reach);
  const ex = tx + dx * 150, ey = ty + dy * 150;
  const L = clamp((light.amb[0] + light.amb[1]) / 1.4 + light.sun.k * 0.3, 0.35, 1.1);
  g.thickLine(tx + 4, ty + 3, ex + 4, ey + 3, 2.4, 0x000000, { a: 0.25 * light.sun.k + 0.1, aa: true });
  g.thickLine(tx, ty, ex, ey, 2.4, mix(0x000000, 0x7a3020, L), { aa: true });
  g.thickLine(tx - 0.5, ty - 0.5, ex - 0.5, ey - 0.5, 0.8, mix(0x000000, 0xc0603c, L), { aa: true });
  g.fillCircle(tx, ty, 2.2, 0xff6a20, { a: 0.5, aa: true });
  g.fillCircle(tx, ty, 1.1, 0xffe0a0, { aa: true });
  g.fillCircle(tx, ty, 6, 0xff7a28, { a: 0.12, aa: true });
}
