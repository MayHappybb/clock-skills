// Four Lifts: a night tower across the street, seen through a long lens, and
// the time is where its four glass lifts are standing. Each lift serves one
// digit. Its floors are numbered 0-9 on the shaft pier beside it (the hours'
// tens lift only has floors 0-2, so it lives in a three-storey podium; the
// minutes' tens has 0-5 in a six-storey wing), and the floor a lift waits at
// is the digit: the pier number lights amber like a lift indicator, the
// motion-sensor landing light beside it is on, and the lit car hangs there in
// its glass shaft. Read the four amber numbers left to right: 1 0 . 4 7, a
// staircase of digits climbing the building instead of a row.
//
// At the minute the lifts that have to move do. Before :00 somebody walks
// out of the lit landing into the car, the doors shut, the indicator goes
// dark and the landing light clicks off; the car rides (cable paying out,
// counterweight passing it the other way in the same shaft, a long-exposure
// light streak behind it) and arrives after :00, the indicator dings on, the
// doors open and the passenger steps out under the new landing light. One
// floor takes a second; 9 -> 0 drops the whole tower in three. Mid-ride no
// indicator is lit, so the time is never wrong, just briefly missing.
// At the hour the whole tower switches on behind the arriving lifts, floor by
// floor up the facade, holds, and goes back to its own lives top down.
//
// Around them, about 120 windows have lives on their own clocks: lamps go on
// and off, offices flicker on fluorescent, a TV throws blue, people cross the
// glass, blinds are half drawn. Which kinds are lit follows the time of day
// (offices by day, flats in the evening, a few insomniacs at 3 am), the sky
// follows it too (dusk, sodium night, dawn), a moon in its real phase hangs
// over the podium, clouds drift, the obstruction beacons on the two roofs
// blink once a second.
//
// Look: a night photograph rather than flat vector art. No keylines; light
// is additive (bloom round the cars, the indicators and the beacons is added
// into the frame buffer, not painted on), the sky is dithered, glass is dark
// and lit from inside. Palette: tungsten amber, sodium, cool fluorescent and
// TV blue against blue-black glass; the indicators are the one saturated
// amber on the face, so the eye finds the time first.
//
// Hard pixels throughout (windows, cars and stencil numerals are pixel art at
// this scale); the softness comes only from the additive glows and the
// dithered sky.
//
// Cost: the static tower (with the sodium street light washing up its lower
// floors) is built once per hour into a second canvas (25.6 KB on the
// device) and copied each frame with a key colour; ~150 window rects, four cars, a sky
// shaded on a 4 px grid over the gaps only, and a handful of glows done as
// integer adds into the buffer (charged as blends).

import { Gfx, to565, hash, rand, rng, clockFields, from565, dither565, R, G, B, mix, scale, clamp, noise2 } from '../js/kit.js';
import { DIGITS } from './tower-glyphs.js';

const W = 160, H = 80, P = 7;
const yOf = (f) => H - P * (f + 1);             // top row of floor band f

// ------------------------------------------------------------ the building

const WINGS = [
  { x: 0, w: 34, floors: 3, cols: 4 },          // hours, tens   (0-2)
  { x: 34, w: 42, floors: 10, cols: 6 },        // hours, units  (0-9)
  { x: 84, w: 34, floors: 6, cols: 4 },         // minutes, tens (0-5)
  { x: 118, w: 42, floors: 10, cols: 6 },       // minutes, units
];
for (const wg of WINGS) { wg.S = wg.x + 7; wg.bay = wg.x + 16; wg.top = yOf(wg.floors - 1); }

const KEY = 0xff00ff;
const FAC = 0x141927, PIER = 0x1a1f2f, SLAB = 0x252c3e, GLASS_D = 0x090d19, GLASS_T = 0x111a2e;
const RAIL = 0x3a4452, SHAFT = 0x0a1c24, BEAM = 0x15303a, ROOF = 0x1e2434, RIM = 0x39405a;
const LABEL_DIM = 0x262c3a, VFD = 0x5cffc8, DING = 0xe8fff4;
const CAR_FRAME = 0x5c6272, CAR_IN = 0xfff0cc, CAR_LOW = 0xe6c98e, CABLE = 0x434b5c;
const LANDING = 0xd6ecff, LOBBY = 0xb88c58, BEACON = 0xff2a18;

// Window kinds: warm flats, offices, TV rooms, coloured LED rooms, the dark ones.
const WARM = [0xd8904a, 0xe0a05c, 0xe4b47e, 0xc88440];
const COOL = [0xb4c6d8, 0xa2b8d0, 0xc0d0e0];
const TONE = [0xd04878, 0xc03030, 0x9060d8, 0xd86030];

const WINS = [];
WINGS.forEach((wg, wi) => {
  for (let f = 0; f < wg.floors; f++)
    for (let c = 0; c < wg.cols; c++) {
      const h = hash(wi, f, c + 11);
      const r = (h & 1023) / 1024;
      let kind = r < 0.46 ? 'flat' : r < 0.68 ? 'office' : r < 0.8 ? 'tv' : r < 0.86 ? 'tone' : 'dark';
      if (c === 0) kind = 'landing';
      if (f === 0) kind = c === 0 ? 'landing' : 'lobby';
      WINS.push({
        wi, f, c, kind, x: wg.bay + 1 + 4 * c, y: yOf(f) + 1, h,
        L: 18 + ((h >>> 10) % 70), ph: (h >>> 17) % 97,
        col: kind === 'office' ? COOL[(h >>> 5) % 3] : kind === 'tone' ? TONE[(h >>> 5) % 4] : WARM[(h >>> 5) % 4],
        blind: ((h >>> 24) & 3) === 0, walker: ((h >>> 26) & 3) < 2, deco: (h >>> 28) & 3,
      });
    }
});

// How likely each kind is lit, by hour of day.
function pOn(kind, hr) {
  const eve = hr >= 18 && hr < 23, late = hr >= 23 || hr < 1, night = hr >= 1 && hr < 6, morn = hr >= 6 && hr < 9;
  const work = hr >= 8 && hr < 19;
  if (kind === 'flat') return eve ? 0.72 : late ? 0.42 : night ? 0.1 : morn ? 0.45 : 0.18;
  if (kind === 'office') return work ? 0.8 : eve ? 0.3 : late ? 0.1 : night ? 0.05 : 0.25;
  if (kind === 'tv') return hr >= 19 || hr < 1 ? 0.65 : night ? 0.12 : 0.15;
  if (kind === 'tone') return hr >= 20 || hr < 3 ? 0.55 : 0.1;
  return 0;
}

// ------------------------------------------------------------ sky by hour

const SKY_KEYS = [
  [0, 0x04061a, 0x2a1834], [4.5, 0x04061a, 0x2a1834], [6, 0x1a2450, 0xc0786a],
  [7.5, 0x4672ac, 0xa6c0d8], [17, 0x3a62a0, 0xbcb4ac], [19, 0x1a2048, 0xdc7646],
  [20.5, 0x0a0d2a, 0x4a2a4e], [22, 0x04061a, 0x2a1834], [24, 0x04061a, 0x2a1834],
];
function skyAt(hf) {
  let i = 0;
  while (SKY_KEYS[i + 1][0] <= hf) i++;
  const a = SKY_KEYS[i], b = SKY_KEYS[i + 1], u = (hf - a[0]) / (b[0] - a[0]);
  return { top: mix(a[1], b[1], u), hor: mix(a[2], b[2], u), day: clamp(((hf < 12 ? hf - 6 : 19.5 - hf)) / 1.5, 0, 1) };
}

// ------------------------------------------------------------ the static layer

let fgKey = -1, FG = null;
const LIT = new Int32Array(WINS.length), LITC = new Int32Array(WINS.length);

function buildFG(sky) {
  const g = new Gfx(W, H);
  g.clear(KEY);
  // The city behind: far blocks with sparse lights, darker than the glow.
  const far = mix(sky.top, 0x000000, 0.35), farLit = mix(0x8a6a40, sky.hor, 0.3);
  const r = rng(77);
  for (let x = -4; x < W;) {
    const w = 4 + Math.floor(r() * 9), top = 22 + Math.floor(r() * 34);
    g.fillRect(x, top, w, H - top, far);
    for (let y = top + 2; y < H; y += 2)
      for (let xx = x + 1; xx < x + w - 1; xx += 2)
        if (r() < 0.18) g.pixel(xx, y, mix(far, farLit, 0.4 + 0.6 * r()));
    x += w + (r() < 0.3 ? 1 : 0);
  }
  for (const [wi, wg] of WINGS.entries()) {
    const { x, w, floors, S, top } = wg;
    // roof: parapet with a rim of sky light
    g.fillRect(x, top - 2, w, 2, ROOF);
    g.hline(x, top - 2, w, RIM);
    g.fillRect(x, top, w, H - top, FAC);
    g.fillRect(x, top, 7, H - top, PIER);
    g.vline(x, top - 2, H - top + 2, mix(RIM, FAC, 0.5));
    // lift machine room above the shaft
    g.fillRect(S - 1, top - 5, 11, 3, ROOF);
    g.hline(S - 1, top - 5, 11, RIM);
    for (let f = 0; f < floors; f++) {
      const yb = yOf(f);
      g.hline(x + 7, yb, w - 7, SLAB);
      g.blit(DIGITS[f], x + 1, yb, { c: LABEL_DIM });
      for (let c = 0; c < wg.cols; c++) {
        const wx = wg.bay + 1 + 4 * c, hh = f === 0 ? 6 : 4;
        g.fillRect(wx, yb + 1, 3, hh, GLASS_D);
        g.hline(wx, yb + 1, 3, GLASS_T);
      }
    }
    // the glass shaft
    g.fillRect(S + 1, top, 7, H - top, SHAFT);
    g.vline(S, top, H - top, RAIL);
    g.vline(S + 8, top, H - top, RAIL);
    for (let f = 0; f < floors; f++) g.hline(S + 1, yOf(f), 7, BEAM);
    // a pale reflection running diagonally down the glass
    for (let y = top; y < H; y++) {
      const k = (y * 3 + wi * 17) % 23;
      if (k < 2) g.pixel(S + 1 + ((y >> 1) % 7), y, 0x16303c);
    }
  }
  // Podium roof: a water tank on legs.
  g.fillRect(19, 45, 9, 8, 0x1a1a22);
  g.fillPolygon([[18, 45], [23.5, 40], [29, 45]], 0x1d1d26);
  g.vline(19, 45, 8, 0x2c2a34); g.hline(19, 47, 9, 0x24232e); g.hline(19, 50, 9, 0x24232e);
  g.vline(20, 53, 4, 0x1a1a22); g.vline(26, 53, 4, 0x1a1a22); g.line(20, 53, 26, 56, 0x1a1a22); g.line(26, 53, 20, 56, 0x1a1a22);
  // Tall roofs: antennas.
  g.vline(62, 1, 7, 0x2a3040); g.vline(146, 1, 7, 0x2a3040);
  g.fillRect(60, 6, 5, 2, ROOF); g.fillRect(144, 6, 5, 2, ROOF);
  // Wing C roof plant.
  g.fillRect(104, 31, 8, 5, 0x1c2130); g.hline(104, 31, 8, RIM); g.vline(110, 27, 4, 0x2a3040);
  return g;
}

// ------------------------------------------------------------ light

/** Add light into the buffer: an elliptical falloff, integer adds, dithered. */
function glow(g, cx, cy, rx, ry, col, k) {
  const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(W, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(H, Math.ceil(cy + ry));
  const cr = R(col) * k, cg = G(col) * k, cb = B(col) * k, buf = g.buf;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    const dy = (y + 0.5 - cy) / ry;
    for (let x = x0; x < x1; x++) {
      const dx = (x + 0.5 - cx) / rx;
      let w = 1 - dx * dx - dy * dy;
      if (w <= 0) continue;
      w *= w;
      const i = y * W + x, d = from565(buf[i]);
      buf[i] = dither565(R(d) + cr * w, G(d) + cg * w, B(d) + cb * w, x, y);
      n++;
    }
  }
  g.cost.box += (x1 - x0) * Math.max(0, y1 - y0);
  g.cost.blend += n; g.cost.dither += n;
}

// ------------------------------------------------------------ the lifts

const digitsOf = (f) => [f.hh.charCodeAt(0) - 48, f.hh.charCodeAt(1) - 48, f.mm.charCodeAt(0) - 48, f.mm.charCodeAt(1) - 48];
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/**
 * Where lift `i` is at second `s` of the minute, given the digits of the
 * previous, current and next minute. Times `tt` are relative to the nearest
 * minute turn: the ride is centred on :00 (leaves before, arrives after).
 */
function liftAt(i, s, prev, cur, next) {
  let a, b, tt;
  if (s < 30) { a = prev[i]; b = cur[i]; tt = s; } else { a = cur[i]; b = next[i]; tt = s - 60; }
  const n = Math.abs(b - a);
  const T = 0.9 + 0.24 * n, dep = -T / 2, arr = T / 2;
  const st = { a, b, tt, dep, arr, moving: false, pos: a, label: a, door: 0, pax: -1, landing: a, ding: 0 };
  if (n === 0) {
    st.pos = a;
    return st;
  }
  const posAt = (t) => (t <= dep ? a : t >= arr ? b : a + (b - a) * smooth((t - dep) / T));
  st.posAt = posAt;
  st.pos = posAt(tt);
  st.moving = tt > dep && tt < arr + 0.5;
  st.label = tt < dep ? a : tt >= arr ? b : -1;
  st.ding = tt >= arr ? clamp(1 - (tt - arr) / 0.35, 0, 1) : 0;
  // Boarding before the ride, alighting after: doors (0 shut .. 1 open) and
  // the passenger's x offset from the car centre (0 in the car, 1 on the landing).
  if (tt < dep) {
    const u = tt - (dep - 1.7);
    if (u > 0) {
      st.door = smooth(u / 0.25) * (1 - smooth((u - 1.25) / 0.3));
      if (u > 0.15) st.pax = 1 - smooth((u - 0.15) / 0.75);
    }
    st.landing = u < 1.45 ? a : -1;
  } else if (tt < arr) {
    st.pax = 0; st.landing = -1;
  } else {
    const u = tt - arr;
    st.door = smooth((u - 0.1) / 0.25) * (1 - smooth((u - 1.3) / 0.3));
    st.pax = u < 0.3 ? 0 : u < 1.2 ? smooth((u - 0.3) / 0.75) : -1;
    st.landing = u > 0.75 ? b : -1;
  }
  return st;
}

// ------------------------------------------------------------ the face

export default {
  name: 'Four Lifts',
  blurb: 'A night tower across the street: the time is the floors its four glass lifts stand at. Each minute a passenger rides one floor; 120 windows live their own lives.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey;
    const T = ctx.date.getTime() / 1000, Tm = T % 86400;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    const hf = f.h + f.m / 60;
    const sky = skyAt(hf);

    if (fgKey !== f.h) { fgKey = f.h; FG = buildFG(skyAt(f.h + 0.5)); }

    const prevF = clockFields(new Date((mk - 1) * 60000)), nextF = clockFields(new Date((mk + 1) * 60000));
    const prev = digitsOf(prevF), cur = digitsOf(f), next = digitsOf(nextF);
    const lifts = WINGS.map((_, i) => liftAt(i, s, prev, cur, next));

    // ---- sky with drifting cloud, over the gaps between the buildings only
    const cloudC = mix(mix(sky.hor, sky.top, 0.35), 0xf0f0f4, 0.15 + 0.5 * sky.day);
    const drift = Tm * 0.02;
    const skyFn = (px, py) => {
      const base = mix(sky.top, sky.hor, clamp(py / 70, 0, 1));
      const n = noise2(px / 26 + drift, py / 7, 5);
      return mix(base, cloudC, clamp((n - 0.52) * 2.4, 0, 0.55));
    };
    for (const box of [[0, 0, 160, 10], [0, 10, 34, 46], [76, 10, 8, 70], [84, 10, 34, 26]]) g.coarse(skyFn, { cell: 4, box });

    // ---- the moon, in its real phase (synodic month from a known new moon)
    const age = (((T - 947182440) / 86400) % 29.530588 + 29.530588) % 29.530588 / 29.530588;
    const lit = 1 - Math.abs(age - 0.5) * 2;      // 0 new .. 1 full
    if (lit > 0.04) {
      const mx = 13, my = 15;
      g.fillCircle(mx, my, 3.6, mix(0xf4eed6, sky.top, 0.15 + 0.5 * sky.day), { aa: true });
      const off = (age < 0.5 ? -1 : 1) * lit * 7.4;
      g.fillCircle(mx + off, my, 3.8, mix(sky.top, sky.hor, my / 70), { aa: true });
      glow(g, mx, my, 9, 9, 0xd8d0b8, 0.18 * lit * (1 - sky.day));
    }

    // ---- the tower
    g.draw(FG, 0, 0, { key: KEY });

    // ---- the hour: everyone switches on, floor by floor up the facade
    let waveY = 99, waveCut = -1;
    if (prevF.h !== f.h && s < 8) {
      if (s > 1.2 && s < 6.5) waveY = H - (H - 8) * smooth((s - 1.2) / 1.6);
      if (s >= 4.6) waveCut = (H - 8) * smooth((s - 4.6) / 1.8) + 8;   // windows above this go back
    }

    // ---- windows
    const night = f.h >= 1 && f.h < 6;
    let nLit = 0;
    for (const w of WINS) {
      const L = lifts[w.wi];
      let c = -1, walker = false;
      if (w.kind === 'landing') {
        if (L.landing === w.f) c = LANDING;
      } else if (w.kind === 'lobby') {
        c = night ? scale(LOBBY, 0.6) : LOBBY;
        walker = true;
      } else if (w.kind !== 'dark' || waveY < 99) {
        const u = Tm + w.ph, slot = Math.floor(u / w.L), into = u - slot * w.L;
        let on = rand(w.h, slot) < pOn(w.kind, f.h);
        if (on && w.kind === 'office' && into < 0.4) on = ((into * 22) | 0) % 3 !== 1;   // fluorescent strike
        if (on) {
          c = w.col;
          if (w.kind === 'tv') c = mix(0x3a5cff, 0xb0c4ff, noise2(Tm * 7, w.h & 255, 3));
          walker = w.walker && rand(w.h, slot, 9) < 0.6;
        }
      }
      if (w.y >= waveY && (waveCut < 0 || w.y >= waveCut) && w.kind !== 'landing') {
        if (c < 0) c = 0xf0d0a0;
      }
      if (c < 0) continue;
      const hh = w.f === 0 ? 6 : 4;
      g.fillRect(w.x, w.y, 3, hh, c);
      g.hline(w.x, w.y + hh - 1, 3, scale(c, 0.74));
      if (w.kind !== 'landing' && w.kind !== 'lobby') {
        if (w.blind) g.fillRect(w.x, w.y, 3, 2, scale(c, 0.55));
        else if (w.deco === 1) g.pixel(w.x + 2 * (w.h & 1), w.y, mix(c, 0xffffff, 0.55));        // a lamp
        else if (w.deco === 2) { g.vline(w.x, w.y, hh, scale(c, 0.6)); g.vline(w.x + 2, w.y, hh, scale(c, 0.6)); } // curtains
        else if (w.deco === 3) g.vline(w.x + 2 * (w.h & 1), w.y + 2, 2, scale(c, 0.3));           // a plant
      }
      if (nLit < LIT.length) LIT[nLit++] = w.x * 256 + w.y * 2 + (w.f === 0 ? 1 : 0), LITC[nLit - 1] = c;
      if (walker) {
        // someone crossing the room: in view while the noise says so
        const n = noise2(Tm * 0.35, w.h & 1023, 1);
        if (n > 0.45) {
          const px = w.x + Math.floor(((n - 0.45) / 0.55) * 3.99);
          g.vline(px, w.y + hh - 3, 3, scale(c, 0.2));
        }
      }
    }

    // the lit windows bleed a little light onto the facade round them
    for (let k = 0; k < nLit; k++) {
      const wx = LIT[k] >> 8, wy = (LIT[k] & 255) >> 1, tall = LIT[k] & 1;
      glow(g, wx + 1.5, wy + (tall ? 3 : 2), 3.6, tall ? 4.6 : 3.4, LITC[k], 0.16);
    }

    // ---- lifts
    WINGS.forEach((wg, i) => {
      const L = lifts[i], S = wg.S;
      const carY = yOf(L.pos) + 1, cy = Math.round(carY);
      const cwY = Math.round((yOf(0) + 1) - (carY - (wg.top + 1)) + 0.0);
      // cables from the machine room
      g.vline(S + 4, wg.top - 2, Math.max(0, cy - wg.top + 2), CABLE);
      g.vline(S + 1, wg.top - 2, Math.max(0, cwY - wg.top + 2), CABLE);
      g.fillRect(S + 1, cwY, 1, 4, 0x58606e);
      // long-exposure streak behind a moving car
      if (L.moving && L.posAt) {
        for (let k = 8; k >= 1; k--) {
          const yp = Math.round(yOf(L.posAt(L.tt - k * 0.05)) + 1);
          if (Math.abs(yp - cy) < 1) continue;
          g.fillRect(S + 3, yp + 1, 4, 4, CAR_IN, { a: 0.42 * (1 - k / 9) });
        }
      }
      // the car
      g.fillRect(S + 2, cy, 6, 6, CAR_FRAME);
      g.fillRect(S + 3, cy + 1, 4, 3, CAR_IN);
      g.hline(S + 3, cy + 4, 4, CAR_LOW);
      if (L.door > 0.5) g.vline(S + 7, cy + 1, 4, CAR_IN);
      // the passenger: 0 = in the car, 1 = out on the landing
      if (L.pax >= 0) {
        const px = Math.round(S + 4 + L.pax * (wg.bay + 2 - (S + 4)));
        const ink = px > S + 7 ? 0x1c140e : 0x2a2018;
        g.pixel(px, cy + 1, ink);
        g.fillRect(px - (px > S + 7 ? 0 : 1), cy + 2, px > S + 7 ? 1 : 2, 3, ink);
      }
    });

    // ---- indicators: the time
    WINGS.forEach((wg, i) => {
      const L = lifts[i];
      if (L.label < 0) return;
      const c = mix(VFD, DING, L.ding);
      g.blit(DIGITS[L.label], wg.x + 1, yOf(L.label), { c });
    });

    // ---- light: blooms
    WINGS.forEach((wg, i) => {
      const L = lifts[i], cy = yOf(L.pos) + 4;
      glow(g, wg.S + 5, cy, 8, 6, 0xffe0a0, L.moving ? 0.34 : 0.2);
      if (L.label >= 0) glow(g, wg.x + 3.5, yOf(L.label) + 3.5, 7, 6, VFD, 0.32 + 0.4 * L.ding);
      if (L.landing >= 0) glow(g, wg.bay + 2.5, yOf(L.landing) + 3, 4, 4, LANDING, 0.25);
    });

    // ---- obstruction beacons, once a second
    const fr = s % 1;
    if (fr < 0.35) {
      const k = 1 - fr / 0.35;
      for (const [bx, by] of [[62, 1], [146, 1], [110, 27]]) {
        g.pixel(bx, by, BEACON);
        glow(g, bx + 0.5, by + 0.5, 5, 4, BEACON, 0.6 * k);
      }
    }
  },
};
