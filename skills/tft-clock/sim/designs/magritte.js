// magritte: "L'Empire des heures".
//
// A Magritte, L'Empire des lumières: a calm afternoon sky over a street where
// it is already night (black trees, a dark house with lit windows, one lamp,
// its light in the canal). The impossibility carries the time: the hours and
// minutes are holes cut out of the day sky, and through them you see the
// night that lies behind it, with its stars and a moon drifting slowly past.
// Clouds sail across the day and are cut off where they cross a numeral,
// because the numeral is not in the sky, it is a gap in it.
//
// The minute: in the last second the old numeral heals over (the night in it
// pales into day as every stroke thins in proportion, so it stays itself to
// the end). After :00 the new one cracks into the sky along its own outline
// (La Clef des champs: the view is painted on the glass) and the pane gives:
// shards carrying painted sky and cloud tumble down through the night street,
// catching the light, and sink into the canal with a ring; the night is open
// in the new shape. Sometimes, and on every hour, a dove made of daylight
// (La Grande Famille) flies up out of the street: invisible against the day,
// it shows only where it crosses the night, over the house and through the
// numerals. Now and then a shooting star crosses the night, seen only through
// the time; windows go on and off; a man in a bowler hat walks home.
//
// From 19:00 to 07:00 the painting hangs the other way round: a night sky
// over a sunlit street, the time cut out of the night so the day shows
// through, clouds drifting only inside the numerals. At 19:00 and 07:00 it
// turns over behind a seam that sweeps left to right.
//
// Palette: the painting's own, pale cerulean to haze, cloud white with a cool
// grey belly, black-green trees, lamplight amber; the night is a deep navy
// with warm stars. Smooth light and anti-aliased edges for everything in the
// sky (it is painted), hard pixels for the street (a silhouette).
//
// Rhythm: none on the second. Magritte is still; the motion is the slow drift
// of clouds and stars, the lamp breathing, the water, and the rare events.

import { Gfx, hex, from565, sprite, sin, cos, clamp, progress, ease, rand, clockFields, previousMinute } from '../js/kit.js';
import { GLYPHS, COLON, BW, BH, PAD } from './magritte-glyphs.js';
import { P, PD, W, H, WATER, LAMP, WINDOWS, SKY_BG, NIGHT_BG, STARS, MOON, drawClouds, STREET, STREET_DAY, SKYLINE } from './magritte-scene.js';
import { DOVE, dovePose } from './magritte-dove.js';

const SLOT_X = [22, 49, 87, 114], COLON_X = 76, TOP = 4;
const HEAL0 = 58.7, HEAL1 = 59.92;       // the old numeral closes
const CRACK = 0.5;                        // cracks run over the new one, s
const STAGGER = 0.3;                      // between numerals breaking at once
const GRAV = 135;                         // px/s², slow, painted gravity
const BREAK_END = 4;
const FLIP0 = 5, FLIP1 = 9;               // the painting turns over at 07:00 and 19:00
const DRIFT = 0.12;                       // the night turns behind the day, px/s

const R8 = (c) => (c >> 16) & 255, G8 = (c) => (c >> 8) & 255, B8 = (c) => c & 255;
/** Blend without library calls (what C does on the stored values). */
const mixI = (a, b, u) => {
  if (u <= 0) return a;
  if (u >= 1) return b;
  const r = R8(a) + (R8(b) - R8(a)) * u, g = G8(a) + (G8(b) - G8(a)) * u, bl = B8(a) + (B8(b) - B8(a)) * u;
  return ((r + 0.5) << 16) | ((g + 0.5) << 8) | (bl + 0.5);
};

// Magritte's man in a bowler hat, seen from behind, two steps of a walk
const MAN = ['A', 'B'].map((k) => sprite(`
  .###.
  #####
  .###.
  .###.
  #####
  #####
  .###.
  .###.
  ${k === 'A' ? '.#.#.' : '..#..'}
  ${k === 'A' ? '#...#' : '.##..'}`));

// Two painted skies, redrawn every frame: the day (gradient + clouds) and the
// night (stars + moon, drifting). One is in front, the other shows through
// the numerals; the shards and the dove carry the front one.
const DAY = new Gfx(W, H), NGT = new Gfx(W, H);

function addCost(g, c) {
  for (const k in c.cost) { g.cost[k] += c.cost[k]; c.cost[k] = 0; }
}

/** Is the day sky in front? From 07:00 to 19:00 it is (the painting as Magritte hung it). */
const dayFront = (h) => h >= 7 && h < 19;

export default {
  name: "L'Empire des heures",
  blurb: 'A Magritte: a day sky over a night street, the time cut out of the day so the night shows through. Each minute the sky cracks and falls into the canal; at night the painting turns over.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, s = f.sec;
    const T = ctx.date.getTime() / 1000;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);

    // ---- which way round the painting hangs; at 07:00 and 19:00 it turns, left to right
    const nowDay = dayFront(f.h);
    let seam = -1, leftDay = nowDay, rightDay = nowDay;
    if (f.m === 0 && (f.h === 7 || f.h === 19) && s < FLIP1) {
      rightDay = !nowDay;
      seam = s < FLIP0 ? 0 : ease.inOutCubic(progress(s, FLIP0, FLIP1)) * (W + 1);
    }
    const dayAt = (x) => (x < seam ? leftDay : rightDay);
    const both = seam > 0 && seam < W;
    const frontOf = (day) => (day ? DAY : NGT), behindOf = (day) => (day ? NGT : DAY);
    const span = (fn) => {
      // run a drawing step once per side of the seam, clipped to that side
      if (!both) return fn(dayAt(0), 0, W);
      g.clip(0, 0, Math.ceil(seam), H); fn(leftDay, 0, Math.ceil(seam)); g.unclip();
      g.clip(Math.ceil(seam), 0, W, H); fn(rightDay, Math.ceil(seam), W); g.unclip();
    };

    // ---- the day sky
    DAY.draw(SKY_BG, 0, 0);
    drawClouds(DAY, T);

    // ---- the night: a tiled field of stars turning slowly, the moon, now and then a meteor
    const ox = ((T * DRIFT) % W + W) % W, oxi = ox | 0;
    NGT.draw(NIGHT_BG, 0, 0);
    for (const st of STARS) {
      const x = (st.x + oxi) % W, tw = st.b > 0.5 ? 0.5 + 0.5 * sin(T * st.f + st.ph) : 1;
      NGT.pixel(x, st.y, mixI(from565(NGT.buf[st.y * W + x]), P.star, st.b * (0.45 + 0.55 * tw)));
    }
    const moonX = (((T * DRIFT + 70) % 300) + 300) % 300 - 60;
    NGT.blit(MOON, moonX - 7.5, 14);
    const mk = f.minuteKey;
    if (rand(mk, 12) < 0.35) {
      const t0 = 6 + 46 * rand(mk, 13), age = s - t0;
      if (age >= 0 && age < 0.7) {
        const hx = 10 + 90 * rand(mk, 14) + 150 * age, hy = 2 + 10 * rand(mk, 15) + 40 * age, fade = 1 - age / 0.7;
        for (let j = 0; j < 3; j++)
          NGT.thickLine(hx - 4.8 * j, hy - 1.3 * j, hx - 4.8 * (j + 1), hy - 1.3 * (j + 1), 1, P.star, { aa: true, a: fade * (1 - j / 3) });
      }
    }

    // ---- what each numeral is doing this frame
    const prev = previousMinute(ctx.date), next = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm, was = prev.hh + prev.mm, will = next.hh + next.mm;
    const breaking = [];
    for (let i = 0; i < 4; i++) if (cur[i] !== was[i]) breaking.push(i);
    const slots = [];
    for (let i = 0; i < 4; i++) {
      const st = { i, d: +cur[i], k: 0, alpha: 1, mode: 'rest', tau: 0 };
      if (cur[i] !== was[i] && s < BREAK_END) {
        st.tau = s - breaking.indexOf(i) * STAGGER;
        st.mode = st.tau < CRACK ? 'crack' : 'fall';
      } else if (cur[i] !== will[i] && s >= HEAL0) {
        const u = ease.inOutQuad(progress(s, HEAL0, HEAL1));
        st.k = 0.55 * u; st.alpha = 1 - u;
        if (u >= 1) st.mode = 'gone';
      }
      slots.push(st);
    }

    // ---- the front sky
    span((day) => g.draw(frontOf(day), 0, 0));

    // ---- the holes, painted along each numeral's row runs: what is behind shows through
    const hole = (Gl, X0, Y0, w, k, alpha) => {
      const fn = (px, py, x, y) => {
        const p = (y - Y0) * w + (x - X0);
        const cov = 0.5 - (k - Gl.N[p]) * Gl.R[p];
        if (cov <= 0) return -1;
        const a = (cov >= 1 ? 1 : cov) * alpha;
        const back = from565((x < seam ? (leftDay ? NGT : DAY) : (rightDay ? NGT : DAY)).buf[y * W + x]);
        return a >= 1 ? back : mixI(from565(g.buf[y * W + x]), back, a);
      };
      for (const [ry, rx0, rx1] of Gl.runs) g.paint(fn, [X0 + rx0, Y0 + ry, rx1 - rx0, 1]);
    };
    for (const st of slots) {
      if (st.mode === 'gone' || st.mode === 'crack') continue;
      hole(GLYPHS[st.d], SLOT_X[st.i] - PAD, TOP - PAD, BW, st.k, st.alpha);
    }
    hole(COLON, COLON_X - PAD, TOP - PAD, COLON.W, 0, 1);

    // ---- cracks running through the new numeral before it gives
    for (const st of slots) {
      if (st.mode !== 'crack' || st.tau < 0) continue;
      const G = GLYPHS[st.d], X0 = SLOT_X[st.i] - PAD, Y0 = TOP - PAD;
      const q0 = G.pieces[0];
      const reach = ease.outCubic(st.tau / CRACK) * 46, r2 = reach * reach;
      const ix = q0.cx, iy = q0.cy;
      g.paint((px, py, x, y) => {
        const bx = x - X0, by = y - Y0, p = by * BW + bx;
        if (!G.rim[p]) return -1;
        const dx = bx - ix, dy = by - iy;
        if (dx * dx + dy * dy > r2) return -1;
        const cc = dayAt(x) ? P.crack : P.crackNight;
        return G.crack[p] ? cc : mixI(from565(g.buf[y * W + x]), cc, 0.85);
      }, [X0, Y0, BW, BH]);
    }

    // ---- the street, in front of everything in the sky (night under a day sky, and the other way round)
    const flick = 0.85 + 0.1 * sin(T * 1.7) + 0.05 * sin(T * 7.3);
    span((day) => {
      g.blit(day ? STREET : STREET_DAY, 0, 0);
      if (!day) return;
      g.fillWhere((px, py, x, y) => {
        if (y < SKYLINE[x]) return 0;
        const dx = px - LAMP[0], dy = (py - LAMP[1]) * 1.1, d2 = dx * dx + dy * dy;
        if (d2 > 196) return 0;
        const v = 1 - d2 / 196;
        return v * v * 0.42 * flick;
      }, P.glow, [LAMP[0] - 14, LAMP[1] - 13, 28, 26]);
    });

    // ---- someone is home: windows go on and off at odd moments; now and then a man walks by
    const clock = f.minuteKey * 60 + s;
    span((day) => {
      if (!day) return;
      WINDOWS.forEach(([wx, wy, ww, wh], i) => {
        const period = 170 + 90 * i, on = rand(Math.floor((clock + i * 53) / period), i, 31) > 0.45;
        g.fillRect(wx, wy, ww, wh, on ? P.win : P.winDark);
        if (on) { g.fillRect(wx + 2, wy, 1, wh, P.sash); g.fillRect(wx, wy + 2, ww, 1, P.sash); }
      });
    });
    if (rand(mk, 21) < 0.3) {
      const t0 = 4 + 20 * rand(mk, 22), walk = s - t0;
      if (walk >= 0 && walk < 32) {
        const x = -6 + walk * 5.4;
        g.blit(MAN[((walk * 4) | 0) & 1], x, 60, { c: dayAt(x) ? hex('040405') : hex('1b1c22') });
      }
    }

    // ---- the falling shards: the front sky, painted on broken glass
    const ripples = [];
    g.clip(0, 0, W, WATER);
    for (const st of slots) {
      if (st.mode !== 'fall') continue;
      const G = GLYPHS[st.d], X0 = SLOT_X[st.i] - PAD, Y0 = TOP - PAD;
      const tFall = st.tau - CRACK;
      const FRONT = frontOf(dayAt(SLOT_X[st.i] + 12));
      G.pieces.forEach((q, k) => {
        const tp = Math.max(0, tFall - q.delay);
        const drop = WATER - (Y0 + q.cy);
        const tEnter = (-q.vy + Math.sqrt(q.vy * q.vy + 2 * GRAV * drop)) / GRAV;
        const vx = q.vx * 0.35;
        if (tp >= tEnter) {
          ripples.push({ x: X0 + q.cx + vx * tEnter, age: tp - tEnter });
          return;
        }
        const cx = X0 + q.cx + vx * tp, cy = Y0 + q.cy + q.vy * tp + 0.5 * GRAV * tp * tp;
        const phi = q.spin * tp, c = cos(phi), sn = sin(phi);
        const gl = tp > 0 ? Math.max(0, cos(phi * 2 + q.glint)) ** 6 * 0.7 : 0;
        // the shard's own box, turned with it
        const ac = c < 0 ? -c : c, as = sn < 0 ? -sn : sn;
        const ex = ac * q.hw + as * q.hh + 1, ey = as * q.hw + ac * q.hh + 1;
        const bx = cx + c * q.bx - sn * q.by, by = cy + sn * q.bx + c * q.by;
        g.paint((px, py) => {
          const rx = px - cx, ry = py - cy;
          const sx = c * rx + sn * ry + q.cx, sy = -sn * rx + c * ry + q.cy;
          if (sx < 0 || sy < 0 || sx >= BW || sy >= BH) return -1;
          const p = (sy | 0) * BW + (sx | 0);
          if (G.cell[p] !== k) return -1;
          let col = from565(FRONT.buf[(Y0 + (sy | 0)) * W + X0 + (sx | 0)]);
          if (tp > 0 && G.rim[p]) col = mixI(col, P.glass, 0.55);
          return gl > 0 ? mixI(col, P.glass, gl) : col;
        }, [bx - ex, by - ey, 2 * ex, 2 * ey]);
      });
    }
    g.unclip();

    // ---- the dove, a bird-shaped piece of the front sky: unseen against it, plain over everything else
    const dv = doveNow(f, s);
    if (dv) {
      const M = DOVE[dovePose(dv.flap)], x0 = Math.round(dv.x - M.w / 2), y0 = Math.round(dv.y - M.h / 2);
      g.paint((px, py, x, y) => {
        const a = M.a[(y - y0) * M.w + (x - x0)];
        if (a <= 0) return -1;
        const sky = from565(frontOf(dayAt(x)).buf[y * W + x]);
        return a >= 1 ? sky : mixI(from565(g.buf[y * W + x]), sky, a);
      }, [x0, y0, M.w, M.h]);
    }

    // ---- the canal: the street upside down, trembling; under the lamp, its road of light
    span((day) => {
      const water = day ? P.water : PD.water;
      g.paint((px, py, x, y) => {
        const depth = y - WATER;
        const wob = (sin(y * 2.1 + T * 2.3 + x * 0.11) * (0.6 + depth * 0.22) + 0.5) | 0;
        const xs = x + wob, src = from565(g.buf[(2 * WATER - 1 - y) * W + (xs < 0 ? 0 : xs >= W ? W - 1 : xs)]);
        return mixI(water, src, 0.5 - depth * 0.05);
      }, [0, WATER, W, H - WATER]);
      if (!day) return;
      for (let y = WATER; y < H; y++) {
        const w = sin(y * 1.9 + T * 3.1), a = (0.55 - (y - WATER) * 0.05) * flick * (0.6 + 0.4 * w);
        g.fillRect(Math.floor(LAMP[0]) + (w > 0.3 ? 1 : w < -0.3 ? -1 : 0), y, (y & 1) ? 2 : 1, 1, P.glow, { a });
      }
    });
    for (const r of ripples) {
      if (r.age > 1.3) continue;
      const a = (1 - r.age / 1.3) * 0.7, spread = 1 + r.age * 7;
      const yy = WATER + 1 + Math.min(4, (r.age * 3) | 0);
      g.fillRect(r.x - spread - 2, yy, 2, 1, P.cloudShade, { a });
      g.fillRect(r.x + spread, yy, 2, 1, P.cloudShade, { a });
      if (r.age < 0.25) g.fillRect(r.x - 1, WATER, 2, 1, P.glass, { a: 0.8 });
    }

    // ---- the seam of the turning painting: a thin bright edge
    if (both) g.fillRect(Math.ceil(seam) - 1, 0, 1, H, P.glass, { a: 0.5 });

    addCost(g, DAY);
    addCost(g, NGT);
  },
};

/** Where the dove is, if it is flying: every hour, and in some minutes. */
function doveNow(f, s) {
  let t0 = -1;
  if (f.m === 0) t0 = f.h === 7 || f.h === 19 ? FLIP1 + 0.5 : 2.6;
  else if (rand(f.minuteKey, 11) < 0.12) t0 = 10 + 34 * rand(f.minuteKey, 16);
  if (t0 < 0) return null;
  const u = (s - t0) / 7.5;
  if (u < 0 || u > 1) return null;
  // up out of the street on the left, a long climb across the numerals, out at the top right
  const x = -18 + 196 * u;
  const y = 66 - 58 * u + 7 * sin(u * 6.283 * 1.2);
  return { x, y, flap: (s - t0) * 2.6 };
}
