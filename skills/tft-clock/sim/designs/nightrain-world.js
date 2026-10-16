// nightrain world: the journey as a function of the clock, and the layers of
// the view out of the window (sky, the two hill towns that carry the time,
// the fields, the embankment, the masts).
import { hex, mix, rand, noise, clamp, cos } from '../js/kit.js';
import { lampsFor, routeFor, along } from './nightrain-glyphs.js';

export const W = 160, H = 80;
export const NEAR = 300;     // embankment, px per second of travel
export const MASTS = 340;    // catenary masts, a little nearer
export const MID = 46;       // fields and farms
export const FAR_M = 0.5;    // the minute town's drift
export const FAR_H = 0.13;   // the hour village's drift
export const HOP = 3578;     // seconds of travel in an hour (22 s lost at each hour's station stop)

const sstep = (p) => p * p * (3 - 2 * p);
/** Distance covered over a smoothstep ramp of 8 s, after p of it. */
const rampDist = (p) => 8 * (p * p * p - (p * p * p * p) / 2);

/**
 * Seconds of travel into the hour at `sih` seconds past the hour, and the
 * train's speed (0..1). The train stands at a station from :59:58 to :00:12,
 * braking over the 8 s before and pulling away over the 8 s after.
 */
export function travel(sih) {
  if (sih < 12) return [0, 0];
  if (sih < 20) { const p = (sih - 12) / 8; return [rampDist(p), sstep(p)]; }
  if (sih < 3590) return [4 + sih - 20, 1];
  if (sih < 3598) { const p = (sih - 3590) / 8; return [3574 + 8 * p - rampDist(p), 1 - sstep(p)]; }
  return [HOP, 0];
}

/** The journey at a date: distance X (travel seconds since midnight), speed v, and the minute's own drift. */
export function journey(date) {
  const h = date.getHours(), m = date.getMinutes(), s = date.getSeconds() + date.getMilliseconds() / 1000;
  const sih = m * 60 + s;
  const [xin, v] = travel(sih);
  const [x0] = travel(m * 60);
  return { X: h * HOP + xin, v, drift: xin - x0, sih, h, m, s, T: h * 3600 + sih };
}

// ------------------------------------------------------------ light

/** A point of light at a fractional position: a soft square halo and a bilinear core. */
export function lamp(g, x, y, c, core = 1, halo = 0.22) {
  const ix = Math.round(x), iy = Math.round(y);
  if (halo > 0) g.fillRect(ix - 2, iy - 2, 3, 3, c, { a: halo });
  splat(g, x, y, c, core);
}

/** One pixel's worth of light spread over the four pixels round (x, y). */
export function splat(g, x, y, c, a) {
  const fx = x - 0.5, fy = y - 0.5;
  const ix = Math.floor(fx), iy = Math.floor(fy), u = fx - ix, v = fy - iy;
  const w00 = (1 - u) * (1 - v) * a, w10 = u * (1 - v) * a, w01 = (1 - u) * v * a, w11 = u * v * a;
  if (w00 > 0.03) g.pixel(ix, iy, c, { a: Math.min(1, w00 * 1.25) });
  if (w10 > 0.03) g.pixel(ix + 1, iy, c, { a: Math.min(1, w10 * 1.25) });
  if (w01 > 0.03) g.pixel(ix, iy + 1, c, { a: Math.min(1, w01 * 1.25) });
  if (w11 > 0.03) g.pixel(ix + 1, iy + 1, c, { a: Math.min(1, w11 * 1.25) });
}

// ------------------------------------------------------------ the sky by the hour

// [hour, top, middle, horizon]: deep night, a pre-dawn blue, a rainy
// overcast blue by day (the train still runs with its lights on), dusk.
const SKY = [
  [0, '#03060f', '#081029', '#191b36'],
  [4, '#04081a', '#0b1533', '#252a4a'],
  [6, '#0a1430', '#253766', '#5f5778'],
  [8, '#13234c', '#30497a', '#6e7290'],
  [13, '#182a55', '#36527f', '#78809a'],
  [17.5, '#131d46', '#2b3870', '#80566a'],
  [20, '#070c22', '#111b3e', '#382b47'],
  [22.5, '#04070f', '#091128', '#1c1c38'],
  [24, '#03060f', '#081029', '#191b36'],
].map(([h, ...c]) => [h, ...c.map(hex)]);

export function skyAt(hf) {
  let i = 0;
  while (SKY[i + 1][0] <= hf) i++;
  const a = SKY[i], b = SKY[i + 1], u = (hf - a[0]) / (b[0] - a[0]);
  return { top: mix(a[1], b[1], u), mid: mix(a[2], b[2], u), hor: mix(a[3], b[3], u) };
}

/** How dark the sky is, 0 (day blue) .. 1 (deep night): stars and the moon come out. */
export const darkness = (hf) => clamp(hf < 12 ? (6.5 - hf) / 2 : (hf - 18.5) / 2, 0, 1);

// ------------------------------------------------------------ this minute's valley

/**
 * Everything about the view that belongs to one minute: where its two towns
 * stand, the hills under them, the weather. Seeded by the minute.
 */
export function valley(f) {
  const k = f.minuteKey;
  const r = (n) => rand(k, n, 917);
  return {
    key: k,
    hh: f.hh, mm: f.mm,
    hx: 17 + Math.floor(r(1) * 6), hy: 7 + Math.floor(r(2) * 3),
    mx: 93 + Math.floor(r(3) * 5), my: 19 + Math.floor(r(4) * 3),
    rain: r(5),              // 0 drizzle .. 1 downpour
    clear: r(6) < 0.45,      // stars and moon through a break in the cloud
    seed: Math.floor(r(8) * 1000),
  };
}

export const HD = { w: 13, h: 20, gap: 4, sp: 2.1 };   // hour digits: village roads
export const MD = { w: 19, h: 28, gap: 5, sp: 2.0 };   // minute digits: town streets

const shoulder = (d, flat, fall) => (d < flat ? 1 : d < flat + fall ? 0.5 + 0.5 * cos((Math.PI * (d - flat)) / fall) : 0);

/** The mountain under the hour village, the ridge behind, the hill under the minute town; drawn into the sky. */
export function drawHills(g, vy, sky, dh, dm) {
  const ridge = mix(sky.hor, 0x000000, 0.55);
  const mount = mix(sky.mid, 0x000000, 0.72);
  const hill = mix(sky.mid, 0x000000, 0.86);
  const rim = mix(sky.hor, 0xffffff, 0.08);
  const hc = vy.hx + HD.w + HD.gap / 2, mc = vy.mx + MD.w + MD.gap / 2;
  const s = vy.seed;
  for (let x = 0; x < W; x++) {
    // A long low ridge across the far horizon.
    const yr = 40 + 4 * noise((x - dh * 0.6) / 23, s + 1) + 2 * noise((x - dh * 0.6) / 7, s + 2);
    g.vline(x, Math.round(yr), H - Math.round(yr), ridge);
    // The mountain: a broad top for the village, falling away both sides.
    const xm = x + dh;
    const ym = 44 - 41 * shoulder(Math.abs(xm - hc), 23, 52) + 2.4 * noise(xm / 8, s + 3) - 1.2;
    const iy = Math.round(ym);
    g.vline(x, iy, H - iy, mount);
    g.pixel(x, iy, rim, { a: 0.35 });
    // The hill under the minute town, nearer and darker.
    const xh = x + dm;
    const yh = 52 - 38 * shoulder(Math.abs(xh - mc), 27, 40) + 1.8 * noise(xh / 6, s + 4);
    const jy = Math.round(yh);
    g.vline(x, jy, H - jy, hill);
    g.pixel(x, jy, rim, { a: 0.22 });
  }
}

const SODIUM = hex('#ffad4a'), SODIUM_HOT = hex('#ffe2a8');
const MERCURY = hex('#bcd2ff'), MERCURY_HOT = hex('#f2f6ff');
const CAR_W = hex('#ffffff'), CAR_R = hex('#ff3a2a');

/** Lamps along every road of a two-digit town, and a few cars on them. */
function drawTown(g, str, x0, y0, D, cool, T, key, glow) {
  const c = cool ? MERCURY : SODIUM, hot = cool ? MERCURY_HOT : SODIUM_HOT;
  for (let i = 0; i < 2; i++) {
    const d = +str[i];
    const bx = x0 + i * (D.w + D.gap);
    if (bx > W + 2 || bx + D.w < -2) continue;
    const lamps = lampsFor(d, D.w, D.h, D.sp);
    for (let j = 0; j < lamps.length; j++) {
      const [lx, ly] = lamps[j];
      // Each lamp flickers a little through the rain between here and there.
      const tw = 0.78 + 0.22 * noise(T * 1.7 + j * 3.1, key + i * 31 + j);
      lamp(g, bx + lx, y0 + ly, (j * 7 + i) % 9 === 0 ? hot : c, tw, glow);
    }
    // Cars: white heads one way, red tails the other.
    const routes = routeFor(d, D.w, D.h);
    for (let n = 0; n < 2; n++) {
      const rt = routes[n % routes.length];
      const sp = (cool ? 1.6 : 2.6) * (n ? -1 : 1);
      let s = rand(key, i, n) * rt.len + T * sp;
      if (!rt.closed) { const L = rt.len, m = ((s % (2 * L)) + 2 * L) % (2 * L); s = m < L ? m : 2 * L - m; }
      const [px, py] = along(rt, s);
      splat(g, bx + px, y0 + py, n ? CAR_R : CAR_W, 1);
    }
  }
}

/** Faint scattered windows round a town, kept off its roads. */
function drawStrays(g, x0, y0, wBox, hBox, n, key, c, dy0, hillTop) {
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side > 0 ? x0 + wBox + 3 + rand(key, i, 1) * 16 : x0 - 3 - rand(key, i, 1) * 16;
    const y = y0 + hBox * (0.35 + 0.65 * rand(key, i, 2)) + dy0;
    if (y < hillTop(x) + 2) continue;
    g.pixel(x, y, c, { a: 0.35 + 0.3 * rand(key, i, 3) });
  }
}

/** The two towns that tell the time, and the red colon beacons. */
export function drawTowns(g, vy, T, dh, dm, sec) {
  const hx = vy.hx - dh, mx = vy.mx - dm;
  drawStrays(g, hx, vy.hy, 2 * HD.w + HD.gap, HD.h, 10, vy.key * 3 + 1, MERCURY, 2, () => 6);
  drawTown(g, vy.hh, hx, vy.hy, HD, true, T, vy.key * 7 + 1, 0.2);
  drawStrays(g, mx, vy.my, 2 * MD.w + MD.gap, MD.h, 12, vy.key * 3 + 2, SODIUM, 0, () => 18);
  drawTown(g, vy.mm, mx, vy.my, MD, false, T, vy.key * 7 + 2, 0.26);
  // A radio mast on the town's shoulder: its two red lights are the colon,
  // and they blink with the seconds.
  const cx = mx - 6.5;
  const on = sec % 1 < 0.55;
  g.vline(Math.round(cx), vy.my + 6, 22, 0x05060a);
  lamp(g, cx + 0.5, vy.my + 9, 0xff2a1a, on ? 1 : 0.25, on ? 0.35 : 0.08);
  lamp(g, cx + 0.5, vy.my + 19, 0xff2a1a, on ? 1 : 0.25, on ? 0.35 : 0.08);
}

// ------------------------------------------------------------ fields and farms (mid layer)

const MIDC = 0x04060b;
const WINDOW = hex('#ffcc66');

export function drawMid(g, X, ground, top = 0) {
  const off = X * MID;
  g.fillRect(0, ground, W, H - ground, MIDC);
  const cw = 22;
  const k0 = Math.floor(off / cw) - 1;
  for (let k = k0; k <= k0 + 9; k++) {
    const x = k * cw - off;
    const r = rand(k, 11, 5);
    if (r < 0.38) {
      // A copse: three round crowns.
      for (let j = 0; j < 3; j++) {
        const rr = 3 + rand(k, j, 6) * 3.5;
        g.fillCircle(x + 4 + j * 6 + rand(k, j, 7) * 4, ground - rr * 0.8 + 1, rr, MIDC);
      }
    } else if (r < 0.52) {
      // A farmhouse: roof, a lit window or two, smoke-dark chimney.
      const hw = 11 + Math.floor(rand(k, 2, 8) * 6), hh = 5 + Math.floor(rand(k, 3, 8) * 2);
      const hx = Math.round(x + 3);
      g.fillRect(hx, ground - hh, hw, hh, MIDC);
      g.fillPolygon([[hx - 1, ground - hh], [hx + hw / 2, ground - hh - 5], [hx + hw + 1, ground - hh]], MIDC);
      g.fillRect(hx + hw - 4, ground - hh - 6, 2, 4, MIDC);
      for (let j = 0; j < 2; j++)
        if (rand(k, j, 9) < 0.7) g.fillRect(hx + 2 + j * (hw - 6), ground - hh + 2, 2, 2, WINDOW);
    } else if (r < 0.62) {
      // A telegraph pole.
      const px = Math.round(x + 10);
      g.vline(px, ground - 13, 13, MIDC);
      g.hline(px - 2, ground - 12, 5, MIDC);
    } else if (r < 0.7) {
      // A lone lamp on a farm track.
      lamp(g, x + 11, ground - 5, WINDOW, 0.9, 0.18);
    }
  }
}

// ------------------------------------------------------------ the embankment (near layer)

/** Rectangles of our carriage's window light thrown onto whatever is outside. */
export const PATCHES = [[6, 68], [86, 68]];

export function drawNear(g, X, top) {
  const off = X * NEAR;
  g.fillRect(0, top, W, H - top, 0x030405);
  for (const [px, pw] of PATCHES) {
    g.clip(px, top, pw, H - top);
    g.fillRect(px, top + 2, pw, H - top - 2, 0x1c160c);
    g.fillRect(px, top + 1, pw, 1, 0x1c160c, { a: 0.5 });
    // Grass and ballast smeared into streaks by the speed.
    for (let y = top + 2; y < H; y++) {
      if (y === top + 4 || y === top + 5) continue;
      const cell = 14, o = off + y * 37;
      const c0 = Math.floor((px + o) / cell);
      const c1 = Math.floor((px + pw + o) / cell);
      for (let c = c0; c <= c1; c++) {
        const r = rand(c, y, 3);
        const sx = c * cell - o + r * 6, len = 4 + rand(c, y, 4) * 10;
        const lit = 0.3 + 0.7 * (y - top) / (H - top);
        g.fillRect(sx, y, len, 1, mix(0x2a2412, 0x8a7240, r * lit), { a: 0.8 });
      }
    }
    // The concrete cable trough, a bright unbroken line.
    g.fillRect(px, top + 4, pw, 1, 0x7a6a50);
    g.fillRect(px, top + 5, pw, 1, 0x3a3226);
    g.unclip();
  }
}

/** Catenary masts flicking past, and the wires swinging between them. */
export function drawMasts(g, X, v) {
  const per = 520, off = X * MASTS;
  const k0 = Math.floor(off / per);
  const xs = [];
  for (let k = k0; k <= k0 + 1; k++) xs.push(k * per - off + 40);
  // Wires: a sag between masts, so on screen they rise and fall.
  for (let wi = 0; wi < 2; wi++) {
    let px = -1, py = 0;
    for (let x = 0; x <= W; x += 8) {
      const u = (((x + off - 40) % per) + per) % per / per;
      const y = 1 + wi * 2 + 3 * (1 - (2 * u - 1) * (2 * u - 1));
      if (px >= 0) g.line(px, Math.round(py), x, Math.round(y), 0x0c0e14);
      px = x; py = y;
    }
  }
  const blur = clamp(v, 0, 1);
  for (const x of xs) {
    if (x < -8 || x > W + 8) continue;
    const ix = Math.round(x);
    if (blur > 0.2) g.fillRect(ix - 3, 0, 9, H, 0x06070a, { a: 0.3 * blur });
    g.fillRect(ix, 0, 3, H, 0x07080b);
    g.fillRect(ix + 3, 60, 1, 20, 0x3a2c1c, { a: 0.8 });   // lit by our windows low down
    g.thickLine(ix + 1.5, 4, ix + 16, 9, 1.4, 0x07080b);
    g.thickLine(ix + 1.5, 12, ix + 16, 9, 1.0, 0x07080b);
  }
}
