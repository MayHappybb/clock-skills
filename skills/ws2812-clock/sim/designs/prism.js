// Prism: the big triangle is a glass prism. A white beam enters at the left
// point and splits into the six bands of Dark Side of the Moon, which fan out
// across the glass as six thin rays. The time is written ON those rays: the
// hours on the warm three (red, orange, yellow), the minutes on the cool
// three (green, blue, violet). Every horizontal stroke is a stretch of a ray
// that catches the light, every upright stroke a wavefront arc centred on the
// entry point, so the numerals are drawn in the fan's own polar grid,
// keystoned by the projection and fanned to the triangle's slopes.
//
// Alive: packets of light run out along the six rays and flare white as they
// pass through a numeral's ray strokes; a wavefront pulse leaves the entry
// point every second; dust motes flash where they drift across a ray.
// Minute: the changed digit disperses: its light splits into spectral copies
// pulled apart in angle, smears out and refocuses as the new digit.
// Hour: the beam is caught by total internal reflection and races three laps
// round the walls, its tail dispersing white to violet, while the spectrum
// slides once through the fan (a white gap between one spectrum and the next),
// recolouring every ray and so every digit.
//
// Look: opal at 3 mm. The diffuser is the prism's glass: at less than a pitch
// the rays fuse into continuous beams while the strokes stay apart.
//
// Stateless: a pure function of the wall clock.
import * as kit from '../js/kit.js';

const D2R = Math.PI / 180;
const A = [-24.25, 1];                               // entry point (the apex)

// --- the six bands, top of the fan to bottom
const BANDS = ['#ff1408', '#ff6200', '#ffcc00', '#22e03a', '#1a70ff', '#8a2eff'].map(kit.hex);
const ROWS = [[-27, -7], [7, 27]];                   // angular ranges (deg) of the hours and minutes rows
const BAND_TH = [ROWS[0][0], (ROWS[0][0] + ROWS[0][1]) / 2, ROWS[0][1], ROWS[1][0], (ROWS[1][0] + ROWS[1][1]) / 2, ROWS[1][1]];
/** Band position (0..5, fractional) at fan angle th. */
function bandPos(th) {
  if (th <= BAND_TH[0]) return 0;
  for (let k = 0; k < 5; k++) if (th <= BAND_TH[k + 1]) return k + (th - BAND_TH[k]) / (BAND_TH[k + 1] - BAND_TH[k]);
  return 5;
}
/** Colour at band position b, with the colours rolled by `roll` bands (cyclic). */
function bandCol(b, roll = 0) {
  if (roll) return rollCol(b, roll);
  const x = kit.clamp(b, 0, 5), i = Math.min(4, Math.floor(x));
  return kit.mix(BANDS[i], BANDS[i + 1], x - i);
}

// --- the font: strokes in glyph space u (radial, 0 near .. 1 far), v (angular, 0 top .. 1 bottom)
// ['r', v, u0, u1] is a ray (v must be 0, 0.5 or 1: one of the row's three bands),
// ['a', u, v0, v1] a wavefront arc.
const GLYPHS = {
  0: [['r', 0, 0, 1], ['r', 1, 0, 1], ['a', 0, 0, 1], ['a', 1, 0, 1]],
  1: [['a', 0.5, 0, 1], ['r', 0, 0.15, 0.5], ['r', 1, 0.22, 0.78]],
  2: [['r', 0, 0, 1], ['a', 1, 0, 0.5], ['r', 0.5, 0, 1], ['a', 0, 0.5, 1], ['r', 1, 0, 1]],
  3: [['r', 0, 0, 1], ['a', 1, 0, 1], ['r', 0.5, 0.3, 1], ['r', 1, 0, 1]],
  4: [['a', 0, 0, 0.5], ['r', 0.5, 0, 1], ['a', 1, 0, 1]],
  5: [['r', 0, 0, 1], ['a', 0, 0, 0.5], ['r', 0.5, 0, 1], ['a', 1, 0.5, 1], ['r', 1, 0, 1]],
  6: [['r', 0, 0, 1], ['a', 0, 0, 1], ['r', 0.5, 0, 1], ['a', 1, 0.5, 1], ['r', 1, 0, 1]],
  7: [['r', 0, 0, 1], ['a', 1, 0, 1]],
  8: [['r', 0, 0, 1], ['r', 0.5, 0, 1], ['r', 1, 0, 1], ['a', 0, 0, 1], ['a', 1, 0, 1]],
  9: [['r', 0, 0, 1], ['a', 0, 0, 0.5], ['r', 0.5, 0, 1], ['a', 1, 0, 1], ['r', 1, 0, 1]],
};
const RADS = [[48, 69], [77, 99]];
const SLOTS = [0, 1, 2, 3].map((k) => ({ r0: RADS[k % 2][0], r1: RADS[k % 2][1], t0: ROWS[k >> 1][0], t1: ROWS[k >> 1][1] }));
const W = 1.9, SOFT = 1.5;                           // stroke half-width and soft edge (mm)

/** Distance (mm) from the polar point (r, th) to one stroke of slot S. */
function strokeDist(S, st, r, th) {
  if (st[0] === 'r') {
    const ts = S.t0 + st[1] * (S.t1 - S.t0);
    const ra = S.r0 + st[2] * (S.r1 - S.r0), rb = S.r0 + st[3] * (S.r1 - S.r0);
    const along = r < ra ? ra - r : r > rb ? r - rb : 0;
    return Math.hypot(along, r * (th - ts) * D2R);
  }
  const rs = S.r0 + st[1] * (S.r1 - S.r0);
  const ta = S.t0 + st[2] * (S.t1 - S.t0), tb = S.t0 + st[3] * (S.t1 - S.t0);
  const along = th < ta ? ta - th : th > tb ? th - tb : 0;
  return Math.hypot(r - rs, rs * along * D2R);
}
function glyphDist(S, d, r, th) {
  let m = 1e9;
  for (const st of GLYPHS[d]) { const v = strokeDist(S, st, r, th); if (v < m) m = v; }
  return m;
}

// --- the glass walls, through the outermost LEDs: apex, top corner, bottom corner
const WALLS = [[-24.25, 0], [76.21, -58], [76.21, 62]];
const WALL_LEN = [0, 1, 2].map((k) => Math.hypot(WALLS[(k + 1) % 3][0] - WALLS[k][0], WALLS[(k + 1) % 3][1] - WALLS[k][1]));
const RIM = WALL_LEN[0] + WALL_LEN[1] + WALL_LEN[2];

// per-layout cache: each LED's polar position, and where it sits on the rim
const cache = new Map();
function geometry(L) {
  if (cache.has(L.key)) return cache.get(L.key);
  const P = L.leds.map((l) => ({ r: Math.hypot(l.x - A[0], l.y - A[1]), th: Math.atan2(l.y - A[1], l.x - A[0]) / D2R }));
  const rim = [];                                    // [led, s along the rim (mm), distance to the wall]
  for (const l of L.leds) {
    let s0 = 0;
    for (let k = 0; k < 3; k++) {
      const [ax, ay] = WALLS[k], [bx, by] = WALLS[(k + 1) % 3], len = WALL_LEN[k];
      const ux = (bx - ax) / len, uy = (by - ay) / len;
      const t = kit.clamp((l.x - ax) * ux + (l.y - ay) * uy, 0, len);
      const d = Math.hypot(l.x - ax - t * ux, l.y - ay - t * uy);
      if (d < 3.2) { rim.push([l.i, s0 + t, d]); break; }
      s0 += len;
    }
  }
  const g = { P, rim };
  cache.set(L.key, g);
  return g;
}

// the hour's colour roll: the spectrum slides through the fan with a white
// gap between one spectrum and the next (the prism face passing the beam)
const ROLL = [...BANDS, [1, 0.96, 0.9]];
function rollCol(b, roll) {
  const x = ((b + roll) % 7 + 7) % 7, i = Math.floor(x), f = x - i;
  return kit.mix(ROLL[i], ROLL[(i + 1) % 7], f);
}

const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => pad(d.getHours()) + pad(d.getMinutes());
const MOTES = 9;
const PV = 38, PSP = 46;                            // light packets on the rays: speed (mm/s), spacing (mm)
const TT = 2.2;                                      // seconds a digit takes to disperse and refocus
const HOUR = 4.2, LAPS = 3, TRAIL = 170;            // hour show: length (s), laps of the rim, comet tail (mm)

export default {
  name: 'Prism', blurb: 'white light splits into six rays; the time is written on them in rays and wavefronts',
  layouts: ['tri-big'], look: { look: 'opal', gap: 2.0 }, fps: 60, brightness: 0.6, dither: true,
  frame(ctx) {
    const { leds, layout: L } = ctx;
    const G = geometry(L), P = G.P;
    const now = ctx.date.getTime() / 1000, M = Math.floor(now / 60) * 60, age = now - M;
    const cur = digitsOf(ctx.date), prev = digitsOf(new Date((M - 60) * 1000));
    const hourTurn = ctx.date.getMinutes() === 0 && age < HOUR;
    const dim = 1 - 0.75 * ctx.night;

    const p = kit.clamp(age / TT), spread = Math.sin(Math.PI * p) ** 1.3;
    const roll = hourTurn ? 7 * kit.ease.inOut(kit.clamp((age - 0.3) / 3.6)) : 0;
    const pulseR = kit.fract(now) * 150;             // the second's wavefront

    // dust motes (polar), flashing where they cross a ray
    const motes = [];
    for (let m = 0; m < MOTES; m++) {
      const r = 12 + 92 * kit.fract(kit.hash(m, 3) + now * (0.012 + 0.01 * kit.hash(m, 5)));
      const th = -29 + 58 * kit.noise2(m * 7.1, now * 0.05 + m);
      motes.push([r, th]);
    }

    for (let i = 0; i < leds.length; i++) {
      const { r, th } = P[i];
      const b = bandPos(th);

      // the six rays, white where they leave the entry point
      let near = 1e9, nb = 0;
      for (let k = 0; k < 6; k++) { const dd = r * Math.abs(th - BAND_TH[k]) * D2R; if (dd < near) { near = dd; nb = k; } }
      const split = kit.smoothstep(3, 30, r);
      const fanW = kit.lerp(8, 1.6, split);            // the white beam is wide, the rays thin
      const rayLit = 1 - kit.smoothstep(fanW * 0.4, fanW + 1.2, near);
      // packets of light running out along each ray, and on through the numerals
      const ph = (r - PV * now + 17 * nb) / PSP;
      const packet = Math.exp(-(((ph - Math.round(ph)) * PSP / 4.5) ** 2)) * (1 - 0.5 * kit.smoothstep(60, 105, r));
      const onRay = 1 - kit.smoothstep(1.2, 3, near);
      if (rayLit > 0) {
        const wave = Math.exp(-(((r - pulseR) / 8) ** 2));
        const shimmer = 0.75 + 0.5 * kit.noise2(r * 0.07 - now * 1.3, nb * 3.1);
        const c = kit.mix([1, 1, 1], bandCol(nb, roll), split);
        // bright as it crosses the open glass, faint once it reaches the numerals
        const lvl = (0.06 * shimmer + 0.08 * wave + 0.28 * packet * split) * (1 - 0.86 * kit.smoothstep(36, 47, r)) * (1 + 3 * (1 - split));
        kit.add(ctx, i, c, rayLit * lvl * dim);
      }

      // the digits
      for (let k = 0; k < 4; k++) {
        const S = SLOTS[k];
        if (r < S.r0 - 8 || r > S.r1 + 8 || th < S.t0 - 14 || th > S.t1 + 14) continue;
        const changed = cur[k] !== prev[k] && p < 1;
        let cr = 0, cg = 0, cb = 0;
        if (!changed) {
          const dd = glyphDist(S, cur[k], r, th);
          const v = 1 - kit.smoothstep(W - SOFT, W + SOFT, dd);
          if (v <= 0) continue;
          const c = bandCol(b, roll); cr = c[0] * v; cg = c[1] * v; cb = c[2] * v;
        } else {
          // dispersion: five spectral copies pulled apart in angle, then back together
          // each copy turns toward its own colour of the whole spectrum as it separates;
          // old and new cross only while the copies are furthest apart
          // the hours fan out toward the top wall, the minutes toward the bottom one
          // the old digit dissolves into its spectrum before the new one condenses out of
          // it, so the two are never seen together (a 9 over a 0 would read as 8)
          const fo = 1 - kit.smoothstep(0.22, 0.47, p), fi = kit.smoothstep(0.53, 0.78, p), dir = k < 2 ? -1 : 1;
          const gain = (1 + 0.8 * spread) / 5;
          for (let c = 0; c < 5; c++) {
            const tc = th - dir * (c + 1) * 1.3 * spread;
            const target = k < 2 ? 5 - 1.25 * c : 1.25 * c;
            let v = 0;
            if (fo > 0) v += fo * (1 - kit.smoothstep(W - SOFT, W + SOFT, glyphDist(S, prev[k], r, tc)));
            if (fi > 0) v += fi * (1 - kit.smoothstep(W - SOFT, W + SOFT, glyphDist(S, cur[k], r, tc)));
            if (v <= 0) continue;
            const col = bandCol(kit.lerp(bandPos(tc), target, spread), roll);
            cr += col[0] * v * gain; cg += col[1] * v * gain; cb += col[2] * v * gain;
          }
          if (cr + cg + cb <= 0) continue;
        }
        const wave = Math.exp(-(((r - pulseR) / 6) ** 2));
        // a packet running through a ray stroke makes it flare white-hot as it passes
        const flare = packet * onRay;
        const glow = 0.72 + 0.3 * wave + 0.1 * kit.noise2(r * 0.2 + now * 0.7, th * 0.3 - now * 0.4) + 0.9 * flare;
        if (flare > 0.05) { const m = (cr + cg + cb) / 3; cr += (m - cr) * 0.5 * flare; cg += (m - cg) * 0.5 * flare; cb += (m - cb) * 0.5 * flare; }
        kit.add(ctx, i, [cr, cg, cb], glow * dim);
      }

      // motes: a dust grain shows only where a ray lights it
      for (const [mr, mth] of motes) {
        const dx = r - mr, dy = r * (th - mth) * D2R;
        const d2 = dx * dx + dy * dy;
        if (d2 > 16) continue;
        let onRay = 0;
        for (let k = 0; k < 6; k++) onRay = Math.max(onRay, Math.exp(-(((mr * (mth - BAND_TH[k]) * D2R) / 2.2) ** 2)));
        if (onRay < 0.02) continue;
        kit.add(ctx, i, kit.mix([1, 1, 1], bandCol(bandPos(mth), roll), 0.5), 0.6 * onRay * (1 - d2 / 16) ** 2 * dim);
      }
    }

    // the hour: the beam is trapped by total internal reflection and skims
    // round the three walls, laps accelerating then easing off; its tail
    // disperses behind it from white through the six bands
    if (hourTurn) {
      const head = LAPS * RIM * kit.ease.inOut(kit.clamp(age / (HOUR - 0.4)));
      const env = kit.smoothstep(0, 0.3, age) * (1 - kit.smoothstep(HOUR - 0.7, HOUR, age));
      for (const [i, s, d] of G.rim) {
        // the most recent pass of the head over this LED
        if (head < s) continue;
        const behind = (head - s) % RIM;
        if (behind > TRAIL) continue;
        const u = behind / TRAIL;
        const col = u < 0.12 ? kit.mix([1, 1, 1], BANDS[0], u / 0.12) : bandCol(5 * (u - 0.12) / 0.88);
        const v = (1 - u) ** 1.5 * (1 - kit.smoothstep(1, 3.2, d)) * env;
        kit.add(ctx, i, col, v * dim);
      }
    }
    // entry flare at the apex
    kit.splat(ctx, A[0] + 2, A[1] - 0.5, 7, [1, 0.97, 0.92], (0.45 + 0.08 * Math.sin(now * 2.1)) * dim);
  },
};
