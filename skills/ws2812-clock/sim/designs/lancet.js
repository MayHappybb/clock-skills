// Lancet: the arc triangle is a Gothic lancet window, and its LEDs sit where
// arcs struck from the two base corners cross: the masons' own construction.
// It is glazed as a two-light window under a head: the minutes stand in the
// two lights, either side of the mullion, in silver-stain gold; the hour
// (1-12, as a tower clock strikes it) is pale white glass in the head. The
// ground is cobalt and ruby pot-metal behind black came.
//
// The real sun lights it (48 N, the date's declination): its shaft leans
// with the azimuth, low sun is amber, dusk rose, then moonlight, so the light
// itself says morning or evening. Between turns the shaft wanders as a tree
// sways outside, leaves dapple the glass, old wavy glass shimmers, the
// numerals' jewels glint where the shaft crosses them, and dust motes turn in
// it.
//
// Minute: a cloud drifts across. Under it the old numeral goes dark; as the
// sun comes back out behind it, the new one kindles, glinting.
// Quarters: the bell chimes 1-3 strokes. Each stroke swings two arcs out from
// the springers along the lattice's own rings; they cross up the mullion and
// meet at the apex, and the glass they pass flares.
// Hour: a cloud bank darkens the window; the first stroke's arcs write the new
// time as they pass; the bell strikes the hour; after the last stroke the sun
// breaks through from its side, the window blazes, and the pigeons on the
// sill take wing across it.
import * as kit from '../js/kit.js';

// ------------------------------------------------------------ the numerals
// Two hands, because the lattice changes character up the window. Low down,
// where the minutes are, the rings cross at a shallow angle: rows ~4 mm apart,
// a row's LEDs 5 mm, so bars run straight and verticals zigzag. In the head
// they cross near 60 degrees: rows 2.5 mm apart, a row's LEDs 6.8 mm, so
// verticals run straight (every other row) and bars zigzag.
// Rows top first; '#' is glass. The lattice is a checkerboard in
// (c = u - v, w): only every other position in a row exists.
const LIGHT = {   // 7 half-columns x 7 rows; rows 0,2,4,6 have columns 0,2,4,6
  0: ['  # #  ', ' #   # ', '#     #', ' #   # ', '#     #', ' #   # ', '  # #  '],
  1: ['    #  ', ' # #   ', '    #  ', '   #   ', '    #  ', '   #   ', '  # # #'],
  2: ['  # #  ', ' #   # ', '      #', '   # # ', '  #    ', ' #     ', '# # # #'],
  3: ['  # #  ', ' #   # ', '      #', '   # # ', '      #', ' #   # ', '  # #  '],
  4: ['    #  ', '   # # ', '  # #  ', ' #   # ', '# # # #', '     # ', '    #  '],
  5: ['# # # #', ' #     ', '# # #  ', '     # ', '      #', ' #   # ', '  # #  '],
  6: ['  # #  ', ' #     ', '#      ', ' # # # ', '#     #', ' #   # ', '  # #  '],
  7: ['# # # #', ' #   # ', '    #  ', '   #   ', '  #    ', '   #   ', '  #    '],
  8: ['  # #  ', ' #   # ', '  # #  ', ' #   # ', '#     #', ' #   # ', '  # #  '],
  9: ['  # #  ', ' #   # ', '#     #', ' # # # ', '      #', '     # ', '  # #  '],
};
// The head: 7 columns x 9 half-steps for 1-9; rows 0,2,..8 have columns 1,3,5.
// Its columns run straight up, so verticals are straight; bars zigzag.
const HEAD = {
  1: ['   #   ', '  #    ', ' # #   ', '       ', '   #   ', '       ', '   #   ', '       ', ' # # # '],
  2: [' # # # ', '#     #', '       ', '      #', '     # ', '    #  ', '   #   ', '  #    ', ' # # # '],
  3: [' # # # ', '#     #', '       ', '      #', '   # # ', '      #', '       ', '#     #', ' # # # '],
  4: ['     # ', '    #  ', '   # # ', '  #    ', ' #   # ', '# # # #', '     # ', '       ', '     # '],
  5: ['       ', '# # # #', '       ', '#      ', ' # # # ', '      #', '       ', '      #', ' # # # '],
  6: ['   # # ', '  #    ', ' #     ', '#      ', ' # # # ', '#     #', '       ', '#     #', ' # # # '],
  7: ['       ', '# # # #', '     # ', '    #  ', '   #   ', '       ', '   #   ', '       ', '   #   '],
  8: [' # # # ', '#     #', '       ', '#     #', ' # # # ', '#     #', '       ', '#     #', ' # # # '],
  9: [' # # # ', '#     #', '       ', '#     #', ' # # # ', '      #', '     # ', '    #  ', ' # #   '],
};
// 10, 11, 12: no room for two tall numerals in the point of the arch, so they
// sit lower and squatter (7 half-steps), the 1 a single straight column.
const PAIR = {
  0: [' # # # ', '#     #', '       ', '#     #', '       ', '#     #', ' # # # '],
  1: ['   #   ', '  #    ', ' # #   ', '       ', '   #   ', '       ', ' # # # '],
  2: [' # # # ', '#     #', '     # ', '    #  ', '   #   ', '  #    ', ' # # # '],
};
const NARROW1 = [' # ', '#  ', ' # ', '   ', ' # ', '   ', ' # '];   // the 1 of 10, 11, 12
// ------------------------------------------------------------ the glass
const H = (s) => kit.hex(s);
const COBALT = H('#1f3dff'), DEEPBLUE = H('#2a20d0'), RUBY = H('#ff1430'), MURREY = H('#b0189a');
const EMERALD = H('#12c060'), POT = H('#ffa31a'), PEARL = H('#ffe0a0'), BEAD = H('#ffc070');
const STAIN = H('#ffb22e');                                   // silver-stain gold: the minutes
const WHITE = H('#ffe6b0');                                   // pale white glass: the hour
const MOON = H('#9fb4ff'), DUSK = H('#ff6a8a'), SKY = H('#a8c4ff');

const keyOf = (c, w) => (c + 32) * 64 + w;

let G = null;
/** Lattice tables for this layout: (c, w) lookup, neighbours, the glazing. */
function geom(ctx) {
  if (G && G.L === ctx.layout) return G;
  const leds = ctx.leds, n = leds.length, at = new Map();
  for (const l of leds) at.set(keyOf(l.u - l.v, l.w), l.i);
  const find = (c, w) => at.get(keyOf(c, w)) ?? -1;
  // In the head the rows w bend down hard towards the sides, but the columns
  // c stay near-vertical, ~3.4 mm apart, LEDs ~4.9 mm apart up each, the odd
  // columns half a step down: a comb lattice. Index it by column and the
  // half-step k under the apex (parity follows the column).
  const headAt = new Map();
  for (const l of leds) {
    if (l.y > 0) continue;
    const c = l.u - l.v, par = Math.abs(c) % 2;
    const k = 2 * Math.round(((l.y + 33.9) / 2.45 - par) / 2) + par;
    headAt.set(keyOf(c, k), l.i);
  }
  const findHead = (c, k) => headAt.get(keyOf(c, k)) ?? -1;
  const nb = leds.map((l) => {
    const c = l.u - l.v, w = l.w;
    return [[1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [-2, 0]].map(([a, b]) => find(c + a, w + b)).filter((i) => i >= 0);
  });
  // glazing: a border of ruby with amber beads on the outermost rings, a
  // leaded fillet inside it down the lights, the mullion, a transom row
  const glass = [], lead = new Uint8Array(n), tex = new Float32Array(n);
  for (const l of leds) {
    const c = l.u - l.v, w = l.w, i = l.i;
    tex[i] = 0.75 + 0.5 * kit.hash(l.u, l.v, 7);
    const border = l.u === 20 || l.v === 20 || w === 1;
    if (border) { glass[i] = (l.v === 20 ? l.u : l.u === 20 ? l.v : l.u) % 4 === 1 ? BEAD : RUBY; continue; }
    if ((l.u === 19 || l.v === 19) && w <= 12) { lead[i] = 1; glass[i] = COBALT; continue; }
    if (w <= 9 && Math.abs(c) <= 1) { lead[i] = 1; glass[i] = COBALT; continue; }
    if (w === 9) { lead[i] = 2; glass[i] = COBALT; continue; }           // transom: lead unless a numeral lands on it
    // pot-metal pieces of 2 x 2 rings: mostly cobalt, some ruby, the odd emerald;
    // murrey and amber in the head
    const pu = l.u >> 1, pv = l.v >> 1, hsh = kit.hash(pu, pv, 3), chk = (pu + pv) & 1;
    if (w <= 9) glass[i] = hsh > 0.92 ? EMERALD : chk && hsh > 0.6 ? RUBY : hsh < 0.3 ? DEEPBLUE : COBALT;
    else glass[i] = hsh > 0.88 ? POT : chk && hsh > 0.4 ? MURREY : COBALT;
  }
  G = { L: ctx.layout, n, find, findHead, nb, glass, lead, tex, cache: new Map() };
  return G;
}

// ------------------------------------------------------------ the inscription
/** Which LEDs are numeral glass at this time: slot per LED (-1 none; 0 hour, 1 tens, 2 units). */
function inscription(G, date) {
  const h = date.getHours() % 12 || 12, m = date.getMinutes(), k = h * 100 + m;
  if (G.cache.has(k)) return G.cache.get(k);
  const slot = new Int8Array(G.n).fill(-1);
  const put = (rows, c0, top, s, head) => rows.forEach((row, r) => [...row].forEach((ch, col) => {
    if (ch !== '#') return;
    const i = head ? G.findHead(c0 + col, top + r) : G.find(c0 + col, top - r);
    if (i >= 0) slot[i] = s;
  }));
  if (h >= 10) { put(NARROW1, -5, 4, 0, true); put(PAIR[h - 10], -1, 4, 0, true); }
  else put(HEAD[h], -3, 2, 0, true);
  put(LIGHT[Math.floor(m / 10)], -8, 8, 1);
  put(LIGHT[m % 10], 2, 8, 2);
  // each numeral is leaded in: its neighbours are came, so it stands in black
  const came = new Uint8Array(G.n);
  for (let i = 0; i < G.n; i++) if (slot[i] >= 0) for (const j of G.nb[i]) if (slot[j] < 0) came[j] = 1;
  const r = { slot, came, digits: [h, Math.floor(m / 10), m % 10] };
  if (G.cache.size > 8) G.cache.delete(G.cache.keys().next().value);
  G.cache.set(k, r);
  return r;
}
// ------------------------------------------------------------ the sky
const RAD = Math.PI / 180, LAT = 48 * RAD;
/** Sun elevation and azimuth (radians, azimuth from south, + west) at the wall clock, as solar time. */
function sunAt(date) {
  const y0 = new Date(date.getFullYear(), 0, 1), doy = (date - y0) / 864e5;
  const dec = 23.44 * RAD * Math.sin(kit.TAU * (doy - 81) / 365);
  const ha = 15 * RAD * (date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600 - 12);
  const e = Math.asin(Math.sin(LAT) * Math.sin(dec) + Math.cos(LAT) * Math.cos(dec) * Math.cos(ha));
  const a = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(LAT) - Math.tan(dec) * Math.cos(LAT));
  return { e, a };
}

/** The light outside: sun colour and strength, where its hot spot falls, sky and moon. */
function skyOf(date) {
  const { e, a } = sunAt(date);
  const day = kit.smoothstep(-0.1, 0.12, e);                       // civil twilight to full day
  const twi = kit.clamp(1 - Math.abs(e + 0.04) / 0.11);            // the glow round sunset
  const sunCol = kit.mix([1, 1, 1], kit.blackbody(1900 + 4300 * kit.smoothstep(0, 0.6, e)), 0.65);
  const facing = 0.35 + 0.65 * kit.clamp(Math.cos(a));              // the window faces south
  return {
    day, twi, sunCol, direct: day * facing,
    tilt: 0.55 * kit.clamp(Math.sin(a), -1, 1),                    // the shaft leans away from the sun
    sx: kit.clamp(44 * Math.sin(a), -40, 40), sy: 30 - 75 * kit.clamp(Math.sin(e) / 0.7, -0.2, 1),
    sky: kit.scale(kit.mix(SKY, DUSK, twi), 0.3 * Math.max(day, twi)),
    moon: kit.scale(MOON, 0.5 * (1 - day)),
  };
}

// ------------------------------------------------------------ the turn
/** The cloud that carries the turn at T: path, size, and when each LED changes. */
function cloudFor(G, ctx, T, prev, next, hourTurn) {
  if (hourTurn) return { xT: 0, yT: 0, R: 62, v: 80, depth: 0.9, squash: 0.45 };
  let x0 = 1e9, x1 = -1e9, ys = 0, k = 0;
  for (let i = 0; i < G.n; i++) {
    const a = prev.slot[i], b = next.slot[i];
    if (a < 0 && b < 0) continue;
    if (a >= 0 && b >= 0 && prev.digits[a] === next.digits[b]) continue;
    const l = ctx.leds[i];
    x0 = Math.min(x0, l.x); x1 = Math.max(x1, l.x); ys += l.y; k++;
  }
  if (!k) return null;
  const hw = (x1 - x0) / 2;
  return { xT: (x0 + x1) / 2, yT: ys / k, R: Math.max(34, 2.1 * hw + 12), v: 40, depth: 0.8, squash: 0.7 };
}

// ------------------------------------------------------------ the face
const GROUND = 0.2, NUMERAL = 0.62, PEARLS = 0.2, CAME = 0.08;
const MOTES = 7, PIGEONS = 6, STROKE = 1.3;
/** Radius (mm) of a bell stroke's arcs a seconds after it, and its inverse. */
const waveR = (a) => 4 + 81 * kit.ease.out(Math.min(a / 1.4, 1));
const waveA = (r) => 1.4 * (1 - Math.cbrt(1 - kit.clamp((r - 4) / 81, 0, 0.999)));

/** A soft silhouette against the light: darkens what is already drawn. */
function shadow(ctx, x, y, r, k) {
  for (const i of ctx.layout.index.near(x, y, r)) {
    const l = ctx.leds[i], d = Math.hypot(l.x - x, l.y - y) / r, f = 1 - k * (1 - d * d) ** 2;
    ctx.out[3 * i] *= f; ctx.out[3 * i + 1] *= f; ctx.out[3 * i + 2] *= f;
  }
}

export default {
  name: 'Lancet',
  blurb: 'a stained-glass lancet lit by the real sun; a cloud re-glazes each minute, the bell\'s arcs write the hour',
  layouts: ['arc'], look: { look: 'opal', gap: 2 }, fps: 60, brightness: 0.9, dither: true,
  frame(ctx) {
    const G = geom(ctx), { leds, date, out } = ctx;
    const now = date.getTime() / 1000, M = Math.floor(now / 60) * 60, age = now - M;
    const T = age >= 30 ? M + 60 : M;
    const prev = inscription(G, new Date((T - 60) * 1000)), next = inscription(G, new Date(T * 1000));
    const hourTurn = new Date(T * 1000).getMinutes() === 0;
    const C = cloudFor(G, ctx, T, prev, next, hourTurn);
    const S = skyOf(date), dim = 1 - 0.75 * ctx.night;
    const xc = C ? C.xT + C.v * (now - T) : 1e9;
    const hour12 = new Date(T * 1000).getHours() % 12 || 12;
    const L = [0, 0, 0];
    // the shaft of sun through the window: a broad band that wanders as the
    // tree outside moves, leaning with the sun's azimuth
    const bnx = Math.cos(S.tilt), bny = Math.sin(S.tilt);
    const q0 = 30 * Math.sin(now * 0.11) + 12 * Math.sin(now * 0.27 + 2);
    let beamAt = 0;
    // the bell: the hour strikes 1-12 at the hour, the quarters chime 1-3.
    // Each stroke swings two arcs out from the springers (the rings round the
    // base corners); the glass they pass flares in its own colour.
    const minT = new Date(T * 1000).getMinutes();
    const strokes = hourTurn ? hour12 : minT % 15 === 0 ? minT / 15 : 0;
    const t0 = T + (hourTurn ? 0.1 : 0.6), waves = [];
    for (let k = 0; k < strokes; k++) {
      const a = now - (t0 + STROKE * k);
      if (a > 0 && a < 1.8) waves.push([waveR(a), (hourTurn ? 2.6 : 1.6) * (1 - a / 1.8)]);
    }
    // the hour: a cloud bank holds while the bell strikes; the sun breaks
    // through after the last stroke, sweeping in from the side it shines from
    const tBreak = t0 + STROKE * (hour12 - 1) + 1.1, fromLeft = S.sx <= 0;

    for (const l of leds) {
      const i = l.i, x = l.x, y = l.y;
      // --- the light arriving at this piece of glass
      let shade = 0, rim = 0, eT = 0, dT = 0, blaze = 0;
      if (hourTurn) {
        // old glass goes dark as the bank comes over; the first stroke's arcs
        // write the new hour as they pass
        eT = Math.min(T - 0.95 + 0.006 * (x + 42), T - 0.35);
        dT = Math.max(t0 + waveA(Math.min(5.042 + 4 * (l.u - 1), 5.042 + 4 * (l.v - 1))), T + 0.06);
        const pass = tBreak + 0.009 * (fromLeft ? x + 45 : 45 - x) * 8 / 8;
        shade = 0.88 * kit.smoothstep(T - 1.7, T - 0.6, now) * (1 - kit.smoothstep(pass, pass + 0.45, now));
        rim = Math.exp(-(((now - pass - 0.2) / 0.22) ** 2));
        if (now > pass) blaze = Math.exp(-(now - pass) / 5) * kit.smoothstep(pass, pass + 0.4, now);
      } else if (C) {
        const d = Math.hypot(x - xc, (y - C.yT) * C.squash) + 7 * (kit.noise2(x * 0.07 + T, y * 0.07) - 0.5);
        shade = C.depth * (1 - kit.smoothstep(0.45 * C.R, 1.05 * C.R, d));
        if (x < xc) rim = Math.exp(-(((d - 1.0 * C.R) / 8) ** 2));            // the sun coming back out
        eT = Math.min(T + (x - C.xT - 0.42 * C.R) / C.v, T - 0.35);           // old glass goes dark
        dT = Math.max(T + (x - C.xT + 0.42 * C.R) / C.v, T + 0.06);           // new glass kindles
      }
      const drift = 1 - 0.32 * kit.smoothstep(0.52, 0.78, kit.fbm(x * 0.016 - now * 0.035, y * 0.02 + 5, now * 0.015, 3));
      const hot = Math.exp(-((x - S.sx) ** 2 + (y - S.sy) ** 2) / (2 * 34 * 34));
      // a tree outside: its leaves sway, and the sunlight through them dapples the glass
      const sway = 2.5 * Math.sin(now * 0.7) + 1.2 * Math.sin(now * 1.9 + 1);
      const leaf = 0.62 + 0.7 * kit.smoothstep(0.38, 0.68, kit.fbm((x + sway) * 0.05, y * 0.05 + now * 0.02, now * 0.09, 2));
      const beam = Math.exp(-(((x * bnx + y * bny - q0) / 11) ** 2));
      beamAt = beam;
      const sun = S.direct * (0.15 + 0.3 * hot + 1.8 * beam) * drift * leaf * (1 - shade) * (1 + 0.8 * rim * (1 - shade));
      const ray = blaze > 0 ? blaze * Math.max(S.direct, 0.4) * Math.pow(0.5 + 0.5 * Math.cos(9 * Math.atan2(y - S.sy, x - S.sx) + now * 0.5), 6) : 0;
      const skyK = 1 - 0.5 * shade, moonK = (1 - 0.6 * shade) * (0.45 + 0.35 * Math.exp(-((x + 18) ** 2 + (y + 20) ** 2) / 1800) + 0.5 * beam);
      const shim = 0.84 + 0.16 * kit.noise2(x * 0.22 + now * 0.45, y * 0.22 - now * 0.3);
      for (let k = 0; k < 3; k++) L[k] = (S.sunCol[k] * sun + S.sky[k] * skyK + S.moon[k] * moonK) * shim * dim;

      if (G.lead[i] === 1 || (G.lead[i] === 2 && prev.slot[i] < 0 && next.slot[i] < 0)) continue;   // stone and came
      // --- what glass is here: the old inscription, then the new one
      const was = prev.slot[i] >= 0 ? 2 : prev.came[i] ? 1 : 0;
      const is = next.slot[i] >= 0 ? 2 : next.came[i] ? 1 : 0;
      // a numeral that changes goes dark whole and kindles whole: the glass two
      // numerals share is not left standing, or it could spell a third
      const slotChanged = was === 2 && is === 2 && prev.digits[prev.slot[i]] !== next.digits[next.slot[i]];
      let wOld = 1, wNew = 0;
      if (was !== is || slotChanged) { wOld = 1 - kit.smoothstep(eT, eT + 0.3, now); wNew = kit.smoothstep(dT, dT + 0.35, now); }
      else if (was === 2) { wOld = 0; wNew = 1; }
      const paint = (role, a, src) => {
        if (a <= 0) return;
        if (role === 2) {
          // the numerals are jewels of glass: each catches the light on its own
          const g = src.slot[i] === 0 ? WHITE : STAIN, lum = (L[0] + L[1] + L[2]) / 3;
          const lift = Math.max(1, (0.5 * dim) / Math.max(lum, 1e-3));          // never sink below legible
          const glint = 1 + 0.6 * kit.smoothstep(0.62, 0.9, kit.noise2(now * 0.9 + G.tex[i] * 40, i * 1.7)) * beamAt;
          kit.add(ctx, i, [g[0] * L[0], g[1] * L[1], g[2] * L[2]], NUMERAL * a * lift * glint);
        } else {
          const g = G.glass[i], k = (g === BEAD ? PEARLS : GROUND) * G.tex[i] * a * (role === 1 ? CAME : 1) * (1 + 3.5 * blaze + 4 * ray);
          kit.add(ctx, i, [g[0] * L[0], g[1] * L[1], g[2] * L[2]], k);
        }
      };
      if (was === is && was !== 2) paint(was, 1, next);
      else if (was === 2 && is === 2 && !slotChanged) paint(2, 1, next);
      else { paint(was, wOld, prev); paint(is, wNew, next); }
      // the new glass catches the light as the sun returns
      if (is === 2 && (was !== 2 || slotChanged) && now > dT) kit.add(ctx, i, PEARL, 0.9 * Math.exp(-(now - dT) / 0.35) * kit.smoothstep(dT, dT + 0.1, now) * dim * Math.max(0.3, S.day));
      if (waves.length && !G.lead[i]) {
        const r1 = 5.042 + 4 * (l.u - 1), r2 = 5.042 + 4 * (l.v - 1);
        let f = 0;
        for (const [R, amp] of waves) f += amp * (Math.exp(-(((r1 - R) / 2.6) ** 2)) + Math.exp(-(((r2 - R) / 2.6) ** 2)));
        out[3 * i] *= 1 + f; out[3 * i + 1] *= 1 + f; out[3 * i + 2] *= 1 + f;
        kit.add(ctx, i, PEARL, 0.3 * f * dim);                              // the came between rings too
      }
    }

    // --- the pigeons on the sill take wing as the sun breaks through
    if (hourTurn) {
      // they flutter up the two sides of the arch, along the ruby border (the
      // outermost rings, struck from the opposite corner), and off over the apex
      const { C1, C2 } = ctx.layout.panels[0].def.corners;
      for (let j = 0; j < PIGEONS; j++) {
        const tau = now - (tBreak + 0.5 + 0.16 * j);
        if (tau < 0 || tau > 2.4) continue;
        const right = j % 2 === 0, c = right ? C1 : C2, R = 77 + 3 * (j >> 1);
        const th = (6 + 22 * (j >> 1) * 0.3 + 75 * kit.ease.inOut(Math.min(tau / 2.2, 1))) * RAD;
        const px = c[0] + (right ? 1 : -1) * R * Math.cos(th), py = c[1] - R * Math.sin(th);
        const flap = Math.sin(tau * 21 + j * 1.3), ox = right ? -1 : 1;     // wings across the line of flight
        shadow(ctx, px, py, 4.4, 0.95);
        shadow(ctx, px + ox * 3 * Math.sin(th) + 4 * Math.cos(th) * flap, py + 3 * Math.cos(th) - 4 * flap * Math.sin(th), 3.8, 0.85);
        shadow(ctx, px - ox * 3 * Math.sin(th) - 4 * Math.cos(th) * flap, py - 3 * Math.cos(th) + 4 * flap * Math.sin(th), 3.8, 0.85);
      }
    }

    // --- dust motes turning in the shaft
    const motes = Math.max(S.direct, 0.3 * (1 - S.day)) * dim;
    for (let k = 0; k < MOTES; k++) {
      const p = (now / 9 + k / MOTES) % 1, life = Math.sin(Math.PI * p) ** 2;
      const along = 70 * (kit.noise2(k * 3.7, now * 0.05) - 0.5) * 1.6 - 10 * p;   // along the shaft
      const across = q0 + 14 * (kit.noise2(now * 0.07, k * 5.1 + 9) - 0.5) * 2;
      const mx = across * bnx - along * bny, my = across * bny + along * bnx;
      const tw = 0.55 + 0.45 * Math.sin(now * (2.1 + k * 0.37) + k);
      kit.splat(ctx, mx, my, 4.2, S.day > 0.3 ? PEARL : MOON, 0.4 * life * tw * motes);
    }
    // a channel too faint to mean anything is left off: deep glass stays one
    // clean colour instead of a 1/255 tint of the others
    for (let k = 0; k < out.length; k++) if (out[k] < 0.012) out[k] = 0;
  },
};
