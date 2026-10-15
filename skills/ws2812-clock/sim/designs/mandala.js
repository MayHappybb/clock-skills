// Sand mandala. The hexagon's ten rings are the bands of a Tibetan sand
// mandala: inner palace with the hour in gold sand at its heart, palace
// wall with six gates, a turning lotus, the vajra ring, and outside it the
// ring of fire. The ring of fire is the minute track: ring 10 has 60 LEDs,
// ten per side, and a chak-pur funnel lays one gold grain per minute,
// clockwise from the top vertex, so the six corners are the ten-minutes.
//
// Hour: the ritual destruction. The master cuts the mandala along its six
// spokes, then everything is swept spiralling into one heap of mixed sand
// at the centre; the new hour is poured out of the heap, and six monks
// spiral outward laying the mandala again.
//
// Stateless: every grain and funnel is a closed-form function of time,
// with caches keyed by the hour.
import * as kit from '../js/kit.js';

const P = 4, DX = P * Math.sqrt(3) / 2;

// ------------------------------------------------------------- numerals
// Drawn on the triangular lattice: c = column (0..4), k = half-row (0..14),
// c + k even. Strokes are verticals (dc 0) and 30-degree runs (|dc| = |dk|),
// so every stroke is a chain of nearest neighbours. Bowls are hexagons, the
// board's own shape; flat bars are the lattice's zigzag.
const GLYPHS = {
  0: [[[2, 0], [0, 2], [0, 12], [2, 14], [4, 12], [4, 2], [2, 0]]],
  1: [[[0, 4], [1, 3], [1, 1], [2, 0], [2, 14]]],
  2: [[[0, 2], [2, 0], [4, 2], [4, 6], [0, 10], [0, 14]], [[0, 14], [1, 13], [2, 14], [3, 13], [4, 14]]],
  3: [[[0, 2], [2, 0], [4, 2], [4, 6], [3, 7], [4, 8], [4, 12], [2, 14], [0, 12]], [[3, 7], [2, 6], [1, 7]]],
  4: [[[0, 0], [0, 8], [1, 9], [2, 8], [3, 9], [4, 8]], [[3, 3], [3, 13]]],
  5: [[[4, 0], [3, 1], [2, 0], [1, 1], [0, 0], [0, 6], [2, 4], [4, 6], [4, 12], [2, 14], [0, 12]]],
  6: [[[4, 2], [2, 0], [0, 2], [0, 12], [2, 14], [4, 12], [4, 8], [2, 6], [0, 8]]],
  7: [[[0, 0], [1, 1], [2, 0], [3, 1], [4, 0], [4, 4], [2, 6], [2, 14]]],
  8: [[[2, 6], [0, 4], [0, 2], [2, 0], [4, 2], [4, 4], [2, 6], [0, 8], [0, 12], [2, 14], [4, 12], [4, 8], [2, 6]]],
  9: [[[0, 12], [2, 14], [4, 12], [4, 2], [2, 0], [0, 2], [0, 6], [2, 8], [4, 6]]],
};

/** Lattice points of a glyph in drawing order: [{ c, k, ord 0..1 }]. */
function glyphDots(d) {
  const pts = [], seen = new Set();
  for (const path of GLYPHS[d]) {
    for (let s = 0; s + 1 < path.length; s++) {
      let [c, k] = path[s];
      const [c1, k1] = path[s + 1];
      const sc = Math.sign(c1 - c), sk = Math.sign(k1 - k), stepK = sc === 0 ? 2 * sk : sk;
      for (;;) {
        const key = c * 100 + k;
        if (!seen.has(key)) { seen.add(key); pts.push({ c, k }); }
        if (c === c1 && k === k1) break;
        c += sc; k += stepK;
      }
    }
  }
  pts.forEach((p, j) => { p.ord = pts.length > 1 ? j / (pts.length - 1) : 0; });
  return pts;
}
const DOTS = Object.fromEntries(Object.keys(GLYPHS).map((d) => [d, glyphDots(d)]));

const numerals = new Map();
/** The hour's numeral on the board: dots (LED, stroke order), and its dark halo. */
function numeral(ctx, H) {
  if (numerals.has(H)) return numerals.get(H);
  const s = String(H);
  // one digit centred (2 mm high: the lattice parity), two digits either side of column 0
  const places = s.length === 1 ? [[-2, -16]] : [[-5, -14], [1, -14]];
  const dots = [], set = new Set();
  [...s].forEach((ch, gi) => {
    const [q0, y0] = places[gi];
    for (const p of DOTS[ch]) {
      const i = ctx.layout.index.at((q0 + p.c) * DX, y0 + 2 * p.k);
      if (i < 0 || set.has(i)) continue;
      set.add(i); dots.push({ i, ord: p.ord, x: ctx.leds[i].x, y: ctx.leds[i].y });
    }
  });
  // pouring order from the centre outward: the new hour is poured out of the heap
  const rmax = Math.max(...dots.map((d) => Math.hypot(d.x, d.y)));
  for (const d of dots) d.rord = Math.hypot(d.x, d.y) / rmax;
  const halo = new Set();
  for (const d of dots) for (const j of ctx.layout.index.near(d.x, d.y, P * 1.05)) if (!set.has(j)) halo.add(j);
  const N = { dots, set, halo };
  numerals.set(H, N);
  if (numerals.size > 6) numerals.delete(numerals.keys().next().value);
  return N;
}

// --------------------------------------------------------------- palette
const GOLD = kit.hex('#ffb32a'), GOLD_HI = kit.hex('#fff0b0');
const LAPIS = kit.hex('#1b3dff'), CINNABAR = kit.hex('#ff2a10'), MALACHITE = kit.hex('#10c050');
const SAFFRON = kit.hex('#ff8a00'), ROSE = kit.hex('#ff3a6a'), CONCH = kit.hex('#fff2dc');
const SILVER = [0.55, 0.75, 1];
const SECTOR = [LAPIS, MALACHITE, CINNABAR, LAPIS, MALACHITE, CINNABAR];

// ------------------------------------------------------------ the mandala
/** Side (0..5, clockwise from the top vertex) and offset j along it, of an LED. */
const sideOf = (l) => (l.ring ? [Math.floor(l.ringPos / l.ring), l.ringPos % l.ring] : [0, 0]);

/** Lotus ring (ring 8): 12 petals, rose and saffron in turn; period 8 LEDs. */
const LOTUS = [0.3, 1, 0.3, 0];
function lotusAt(p) {
  const a = ((Math.floor(p) % 48) + 48) % 48, b = (a + 1) % 48, f = p - Math.floor(p);
  const at = (q) => kit.scale(q % 4 === 1 ? kit.mix(ROSE, CONCH, 0.15) : ROSE, LOTUS[q % 4]);
  return kit.mix(at(a), at(b), f);
}

/** The architecture's colour at LED l (not the numeral, not the fire ring). */
function archColour(l, lotusShift) {
  const k = l.ring, [sd, j] = sideOf(l);
  if (k <= 6) {
    if (k === 6) return kit.scale(SECTOR[(sd + (j > 3 ? 1 : 0)) % 6], j === 3 ? 0 : 0.16);   // inner wall
    return [0, 0, 0];
  }
  if (k === 7) {                                              // palace wall, a gate mid-side
    if (j === 3) return kit.scale(CONCH, 0.35);
    if (j === 2 || j === 4) return [0, 0, 0];
    return kit.scale(SECTOR[(sd + (j > 3 ? 1 : 0)) % 6], 0.32);   // six corner bastions
  }
  if (k === 8) return kit.scale(lotusAt(l.ringPos - lotusShift), 0.5);
  if (k === 9) return [0, 0, 0];
  return [0, 0, 0];
}

// ------------------------------------------------------------- the sand
/** A grain's own tint and weight: sand is a mixture, not a flat colour. */
const grain = (i, c) => {
  const w = 0.8 + 0.4 * kit.hash(i, 57);
  return [c[0] * w * (0.9 + 0.2 * kit.hash(i, 31)), c[1] * w * (0.9 + 0.2 * kit.hash(i, 32)), c[2] * w * (0.9 + 0.2 * kit.hash(i, 33))];
};
/** Mica glints: each grain flashes now and then, a quarter-second sparkle. */
function glint(i, now) {
  const u = now * 0.31 + kit.hash(i, 3), n = Math.floor(u);
  if (kit.hash(i, n) > 0.16) return 0;
  return Math.sin(Math.PI * kit.clamp((u - n) * 9)) ** 2;
}
/** Ring 10 LED index by position, and the point on the ring at a fractional slot. */
const fireRings = new WeakMap();
function fireRing(ctx) {
  let f = fireRings.get(ctx.layout);
  if (!f) {
    f = [];
    for (const l of ctx.leds) if (l.ring === 10) f[l.ringPos] = l;
    fireRings.set(ctx.layout, f);
  }
  return f;
}
function slotXY(F, s) {
  const a = Math.floor(s), f = s - a, A = F[((a % 60) + 60) % 60], B = F[(((a + 1) % 60) + 60) % 60];
  return [kit.lerp(A.x, B.x, f), kit.lerp(A.y, B.y, f)];
}
/** The colour of minute grain p (1..60) on the ring of fire. */
const fireColour = (p) => (p % 10 === 0 ? CINNABAR : p % 5 === 0 ? kit.mix(SAFFRON, CINNABAR, 0.35) : kit.mix(GOLD, SAFFRON, 0.35 * kit.hash(p, 9)));
const FIRE = 0.62;
const WAVE0 = 0.35, WAVEV = 48;   // the minute's vibration: start (s), speed (mm/s)

// --------------------------------------------------------- the hour show
const SHOW = 5.6;                 // seconds
const CUT = 0.35;                 // the six cuts run in
const RB0 = 1.7, RATE = 2.7;      // rebuild start, rings per second
const sweeps = new Map();
/** Every grain of the finished mandala of hour Hp (at :59), as particles for the sweep. */
function sweepOf(ctx, Hp) {
  if (sweeps.has(Hp)) return sweeps.get(Hp);
  const N = numeral(ctx, Hp), parts = [];
  let mean = [0, 0, 0], w = 0;
  for (const l of ctx.leds) {
    let c, kind = 0;
    if (N.set.has(l.i)) { c = GOLD; kind = 1; }
    else if (l.ring === 10) { if (l.ringPos === 0) continue; c = fireColour(l.ringPos === 0 ? 60 : l.ringPos); c = kit.scale(c, FIRE); }
    else { c = archColour(l, 59); if (N.halo.has(l.i)) c = kit.scale(c, 0.1); }
    c = grain(l.i, c);
    if (Math.max(...c) < 0.02) continue;
    const r = Math.hypot(l.x, l.y), th = Math.atan2(l.x, -l.y);
    // the cut: grains on the six spokes are pushed aside as the vajra runs in
    const [sd, j] = l.ring ? [Math.floor(l.ringPos / l.ring), l.ringPos % l.ring] : [0, 0];
    const onSpoke = l.ring > 0 && j === 0 && kind === 0;
    parts.push({
      i: l.i, c, r, th, kind, onSpoke,
      cut: CUT * (1 - r / 42),
      d: kind ? 0.05 * kit.hash(l.i, 5) : 0.25 + 0.2 * (1 - r / 40) + 0.15 * kit.hash(l.i, 4),
      dur: kind ? 0.45 : 0.6 + 0.55 * (r / 40),
    });
    mean = [mean[0] + c[0], mean[1] + c[1], mean[2] + c[2]]; w++;
  }
  const mx = Math.max(...mean) || 1;
  // mixed sand: all the colours ground together come out a warm ochre-grey
  const heap = kit.mix(kit.scale(mean, 1 / mx), kit.hex('#b0702c'), 0.7);
  const S = { parts, heap, n: w };
  sweeps.set(Hp, S);
  if (sweeps.size > 3) sweeps.delete(sweeps.keys().next().value);
  return S;
}

/** When the rebuilding monks pour LED l (seconds into the hour). */
function rebuildAt(l) {
  if (l.ring === 0) return RB0;
  return RB0 + (l.ring - 1 + (l.ringPos % l.ring) / l.ring) / RATE;
}
/** Six funnels spiral outward, each laying one side of every ring: funnel n at time t. */
function monk(n, t) {
  const rho = (t - RB0) * RATE;
  if (rho < 0 || rho > 9) return null;
  const R = Math.floor(rho), f = rho - R, ring = R + 1, rad = (R + f) * P + P;
  const sd = (n + R) % 6, v = (k) => [Math.sin(k * Math.PI / 3), -Math.cos(k * Math.PI / 3)];
  const a = v(sd), b = v(sd + 1);
  const rr = ring * P + f * P * 0;                         // along the side of ring `ring`
  return [kit.lerp(a[0], b[0], f) * rr, kit.lerp(a[1], b[1], f) * rr, rad];
}

export default {
  name: 'Sand Mandala',
  blurb: 'the hour in gold sand at the heart, minutes poured grain by grain round the ring of fire; swept away every hour',
  layouts: ['hex'], look: { look: 'opal', gap: 2.0 }, fps: 60, brightness: 0.6, dither: true,
  frame(ctx) {
    const { leds, date } = ctx;
    const now = date.getTime() / 1000;
    const H = date.getHours(), m = date.getMinutes(), age = kit.secOf(date);
    const tH = m * 60 + age;                                 // seconds into the hour
    const dim = 1 - 0.7 * ctx.night;
    const N = numeral(ctx, H);
    const F = fireRing(ctx);
    const show = tH < SHOW;

    // ---- the mandala: architecture and the ring of fire
    // the minute's pour sends a vibration through the sand, from the slot inward
    const [ox, oy] = m ? slotXY(F, m) : [0, -40];
    const waveR = (age - WAVE0) * WAVEV, waving = m > 0 && age < WAVE0 + 90 / WAVEV;
    const arrive = (l) => WAVE0 + Math.hypot(l.x - ox, l.y - oy) / WAVEV;
    for (const l of leds) {
      const lotusShift = Math.max(0, m - 1) + (m ? kit.ease.inOut(kit.clamp((age - arrive(l)) / 0.7)) : 0);
      if (N.set.has(l.i)) continue;
      let c, a = 1;
      if (l.ring === 10) {
        const p = l.ringPos;
        if (p < 1 || p > m) {
          // the marks the monks chalked first: where each ten minutes will end
          if (p % 10 === 0) kit.set(ctx, l.i, CINNABAR, 0.07 * dim * (show ? kit.smoothstep(RB0 + 9 / RATE, RB0 + 9.6 / RATE, tH) : 1));
          continue;
        }
        a = p === m ? kit.smoothstep(0.1, 1.3, age) : 1;      // the grain being poured
        // the ring of fire flickers: a slow flame running round
        const fl = 0.78 + 0.22 * kit.noise2(p * 0.45 - now * 1.3, now * 0.4);
        c = kit.scale(fireColour(p), FIRE * fl);
      } else {
        c = archColour(l, lotusShift);
        if (show) a = kit.smoothstep(rebuildAt(l), rebuildAt(l) + 0.35, tH);
        if (N.halo.has(l.i)) continue;
      }
      if (a <= 0 || c[0] + c[1] + c[2] < 1e-4) continue;
      if (l.ring === 8) c = kit.scale(c, 0.8 + 0.2 * Math.sin(Math.atan2(l.x, -l.y) * 2 - now * 0.9));  // the lotus breathes
      c = grain(l.i, c);
      kit.set(ctx, l.i, c, a * dim);
      kit.add(ctx, l.i, CONCH, 0.35 * glint(l.i, now) * Math.max(...c) * a * dim);
    }

    // ---- the master's funnel on the ring of fire
    if (!show || tH > SHOW - 0.8) {
      const slot = !m ? 1 : age < 1.3 ? m : m + kit.ease.inOut(kit.clamp((age - 1.3) / 0.8));
      const [fx, fy] = slotXY(F, slot);
      const pouring = m && age < 1.3;
      const rasp = Math.max(0, Math.sin(now * 2 * Math.PI * 2.3)) ** 6;       // the rod rasping the funnel
      const fa = (show ? kit.clamp((tH - (SHOW - 0.8)) / 0.8) : 1) * (pouring ? 0.35 : 0.3 + 0.35 * rasp);
      kit.splat(ctx, fx * 1.04, fy * 1.04, 4.2, SILVER, fa * dim);
      if (pouring) {                                          // grains falling: sparkle on the slot
        const s = Math.floor(now * 30);
        if (kit.hash(s, 77) > 0.5) kit.splat(ctx, fx + (kit.hash(s, 1) - 0.5) * 3, fy + (kit.hash(s, 2) - 0.5) * 3, 3, GOLD_HI, 0.4 * dim);
      }
    }

    // ---- the hour
    let numTint = 0;
    if (show) {
      const S = sweepOf(ctx, (H + 23) % 24), t = tH;
      let arrived = 0;
      for (const p of S.parts) {
        let a = 1, x, y;
        if (p.onSpoke) {                                     // the cut
          a = 1 - kit.smoothstep(p.cut, p.cut + 0.18, t);
          if (a <= 0) continue;
        }
        const s = kit.clamp((t - p.d) / p.dur);
        if (s <= 0) { kit.add(ctx, p.i, p.c, a * dim); continue; }
        const e = p.kind ? kit.ease.in(s) : kit.ease.inOut(s);
        const r = p.r * (1 - (p.kind ? 0.45 : 1) * e), th = p.th + (p.kind ? 0.5 : 2.4) * e * e;
        x = r * Math.sin(th); y = -r * Math.cos(th);
        const fade = p.kind ? 0.8 * (1 - kit.smoothstep(0, 0.7, e)) : 1 - kit.smoothstep(0.7, 1, e);
        if (e > 0.85) arrived++;
        if (fade > 0) kit.splat(ctx, x, y, 4.2, p.c, a * fade * dim);
      }
      // the vajra tips cutting in along the spokes
      if (t < CUT + 0.2) {
        const fr = 42 * (1 - kit.clamp(t / CUT)), ga = 0.8 * (1 - kit.smoothstep(CUT, CUT + 0.2, t));
        for (let k = 0; k < 6; k++) kit.splat(ctx, fr * Math.sin(k * Math.PI / 3), -fr * Math.cos(k * Math.PI / 3), 4.5, CONCH, ga * dim);
      }
      // the heap of mixed sand at the centre
      const mass = arrived / S.n, gone = kit.smoothstep(1.05, 1.9, t);   // poured out into the new hour
      const Rh = 4 + 10 * Math.sqrt(mass) * (1 - 0.7 * gone);
      const hl = (0.1 + 0.25 * mass) * (1 - gone);
      if (hl > 0.002) for (const i of ctx.layout.index.near(0, 0, Rh)) {
        const l = leds[i], d = Math.hypot(l.x, l.y) / Rh;
        // a mound of every colour ground together, still glittering
        const mixc = kit.mix(S.heap, SECTOR[Math.floor(kit.hash(i, Math.floor(t * 12)) * 6)], 0.35);
        kit.add(ctx, i, grain(i, mixc), hl * (1 - d * d) * dim);
        kit.add(ctx, i, CONCH, 0.25 * hl * glint(i, now * 6) * dim);
      }
      // the new hour is poured out of the heap
      numTint = 1 - kit.smoothstep(1.6, 3.4, t);
      // the six monks laying the mandala again
      for (let n = 0; n < 6; n++) {
        const q = monk(n, t);
        if (q) kit.splat(ctx, q[0], q[1], 4.2, SILVER, 0.55 * dim);
      }
    }

    // ---- the vibration crest: grains jump and catch the light as it passes
    if (waving && !show) {
      const o = ctx.out;
      for (const l of leds) {
        const d = Math.hypot(l.x - ox, l.y - oy), u = (d - waveR) / 3.2, crest = Math.exp(-u * u) * (1 - kit.smoothstep(40, 95, waveR));
        if (crest < 0.01) continue;
        const k = 1 + 0.9 * crest, i = l.i;
        const lum = Math.max(o[3 * i], o[3 * i + 1], o[3 * i + 2]);
        o[3 * i] *= k; o[3 * i + 1] *= k; o[3 * i + 2] *= k;
        if (lum > 0.01) kit.add(ctx, i, CONCH, 0.25 * crest * Math.min(1, lum * 3) * dim);
      }
    }

    // ---- the hour in gold, cut clear of everything round it
    for (const i of N.halo) { const o = ctx.out; const k = show ? 1 - kit.smoothstep(0.6, 1.1, tH) : 0; o[3 * i] *= k; o[3 * i + 1] *= k; o[3 * i + 2] *= k; }
    for (const d of N.dots) {
      let a = 1, hot = 0;
      if (show) {
        const tp = 0.7 + 0.55 * d.rord;
        a = kit.smoothstep(tp, tp + 0.12, tH);
        hot = Math.max(0, 1 - Math.abs(tH - tp - 0.06) / 0.14);
      }
      if (a <= 0) continue;
      const base = show ? kit.mix(GOLD, sweepOf(ctx, (H + 23) % 24).heap, 0.5 * numTint) : GOLD;
      const c = grain(d.i, base);
      kit.over(ctx, d.i, c, a * dim);
      // sand settling: a slow sheen runs down the stroke, and the minute's crest
      const sh = Math.exp(-(((d.ord - kit.fract(now / 7)) / 0.07) ** 2));
      let crest = 0;
      if (waving && !show) { const u = (Math.hypot(d.x - ox, d.y - oy) - waveR) / 3.2; crest = Math.exp(-u * u); }
      kit.add(ctx, d.i, GOLD_HI, (0.6 * hot + 0.3 * glint(d.i, now) + 0.18 * sh + 0.5 * crest) * dim);
    }
    // pure pigments: drop the faint stray channels of saturated colours
    // (they would sit below 8/255, where these LEDs step and shift hue)
    const o = ctx.out;
    for (let i = 0; i < o.length; i += 3) {
      const mx = Math.max(o[i], o[i + 1], o[i + 2]) * 0.07;
      if (o[i] < mx) o[i] = 0; if (o[i + 1] < mx) o[i + 1] = 0; if (o[i + 2] < mx) o[i + 2] = 0;
    }
  },
};
