// Sepia: the 32x16 panel is a close-up of a cuttlefish's flank, and the
// animal writes the time in its own skin.
//
// Every LED is a patch of skin: an iridophore layer that shimmers blue-green
// underneath, and chromatophores (yellow, orange-red, brown-black sacs) on
// top that expand and contract. "Passing clouds", dark bands of black sacs,
// roll across the skin all the time, as they do on a hunting cuttlefish.
//
// The digits are body pattern: hours in the yellow sacs on the upper strip,
// minutes in the red sacs on the lower, each ringed by a moat of expanded
// black sacs. At the minute a deep cloud sweeps across; as it reaches a
// changing digit, its sacs contract (the strokes thin to nothing, flashing
// the iridescence they were hiding) and behind the cloud the new digit's
// sacs bloom out, yellow before red. The old digit only ever thins, the new
// only ever grows, so the time is never a wrong number.
//
// The hour is a courtship display. The skin slides left as the animal turns
// to you, carrying its digits with it: its eye (a W-shaped pupil) and its
// fanned arms come into frame, the mantle flashes pulsing zebra stripes, and
// the hour is rewritten in the middle of it.
//
// Stateless: everything is a function of the wall clock.
import * as kit from '../js/kit.js';

// ---------------------------------------------------------------- glyphs
// Ten digits drawn for a 5 x 7 cell of the square lattice (x 0..4, y 0..6),
// as centrelines: each stroke is a run of expanded sacs one LED wide.
const GLYPHS = {
  0: [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]]],
  1: [[[0.6, 1.4], [2, 0], [2, 6]]],
  2: [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [0, 6], [4, 6]]],
  3: [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [1.4, 3]], [[3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]]],
  4: [[[3, 6], [3, 0], [0, 3], [0, 4], [4, 4]]],
  5: [[[4, 0], [0, 0], [0, 2.4], [3, 2.4], [4, 3.4], [4, 5], [3, 6], [1, 6], [0, 5]]],
  6: [[[3.6, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]]],
  7: [[[0, 0], [4, 0], [4, 1], [2, 3], [2, 6]]],
  8: [[[1, 3], [0, 2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [1, 3], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3]]],
  9: [[[0.4, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0], [0, 1], [0, 2], [1, 3], [4, 3]]],
};
/** Polylines to a flat segment array [ax, ay, bx, by, ...]. */
function segsOf(paths) {
  const s = [];
  for (const p of paths) {
    const pts = p.length === 1 ? [p[0], p[0]] : p;
    for (let k = 0; k + 1 < pts.length; k++) s.push(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]);
  }
  return s;
}

// ---------------------------------------------------------------- palette
// iridophores: structural blue-green (no red at all, so dim tones stay pure)
const IRID = [[0, 0.55, 0.45], [0, 0.22, 0.75], [0, 0.8, 0.25], [0.32, 0.06, 1]];
const YEL = [[1, 0.52, 0], [1, 0.32, 0]];              // hour sacs
const RED = [[1, 0.1, 0], [0.85, 0.035, 0]];          // minute sacs
const BROWN = [0.2, 0.02, 0];
const LEUCO = [0.75, 0.85, 1];                           // zebra white (leucophores)
const IRIS = kit.hex('#f0c860'), IRIS2 = kit.hex('#c8e8e0');  // gold and silver
const ARM = kit.hex('#ffe0c0');

// ----------------------------------------------------------------- layout
// Digit cells are 5 x 7 LEDs, in skin coordinates (LED units, gx/gy).
// Hours ride high and left, minutes low and right: a diagonal, like a
// body-pattern band across the mantle.
const TOP = 0, BOT = 9;
const SLOT_X = [8, 15, 13, 20];
const SLOT_Y = [TOP, TOP, BOT, BOT];
const R = 0.62;                       // stroke half-width at rest (LED units)
const PAN = 8;                        // how far the skin slides at the hour
const EYE = [29.5, 7.5], ER = 3.9, ARMS = [34.3, 7.5];

const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => pad(d.getHours()) + pad(d.getMinutes());
const EPOCH = 1.7e9;                  // keep noise inputs small

// --------------------------------------------------------------- timings
// minute turn (seconds after :00)
const CLOUD_V = 24, CLOUD_X0 = -8;    // the minute's deep cloud
const ERODE = 0.55, GAP = 0.35, BLOOM = 0.9;
// hour show (seconds relative to hh:00:00)
const SHOW0 = -3, SHOW1 = 5.6;

const segCache = new Map();
const segs = (ch) => { if (!segCache.has(ch)) segCache.set(ch, segsOf(GLYPHS[ch])); return segCache.get(ch); };

function sdf(s, x, y) {
  let d = 1e9;
  for (let k = 0; k < s.length; k += 4) {
    const v = kit.segDist(x, y, s[k], s[k + 1], s[k + 2], s[k + 3]);
    if (v < d) d = v;
  }
  return d;
}

/** Coverage of a stroke of half-width r at distance d. */
const cover = (d, r) => 1 - kit.smoothstep(r - 0.42, r + 0.42, d);
/** Below about 2/255 an LED is dark anyway (V5 parts): fade those tails to black. */
const knee = (v) => v * kit.smoothstep(0.005, 0.014, v);
/** A smooth bump of width w around 0. */
const bump = (x, w) => { const u = x / w; return u * u >= 1 ? 0 : (1 - u * u) ** 2; };

/** Per-slot state of the turn: old/new glyph, and when each phase starts. */
function turnPlan(date) {
  const sec = date.getSeconds() + date.getMilliseconds() / 1000;
  const prev = digitsOf(new Date(date.getTime() - sec * 1000 - 1000));
  const next = digitsOf(date);
  const hourly = date.getMinutes() === 0;
  return { sec, prev, next, hourly };
}

/** Pan amount (0..1), zebra envelope, from seconds relative to the hour. */
function showOf(T) {
  if (T < SHOW0 || T > SHOW1) return { pan: 0, zeb: 0, T };
  const pan = T < 0 ? kit.ease.inOut(kit.clamp((T - SHOW0) / 1.9)) : 1 - kit.ease.inOut(kit.clamp((T - 3.6) / 2.0));
  const zeb = T < 0 ? kit.smoothstep(SHOW0 + 0.4, SHOW0 + 1.6, T) : 1 - kit.smoothstep(3.4, 5.0, T);
  return { pan, zeb, T };
}

/**
 * Where each digit slot is in its turn. Old digits erode as the cloud reaches
 * them; new digits only start to bloom once EVERY old digit is gone, so an
 * old and a new digit never stand together (10:09 never passes through 10:19,
 * and 23:59 never through 23:00). The gap is under a second.
 */
function slotStates(tp) {
  const out = [];
  for (let k = 0; k < 4; k++) {
    const o = tp.prev[k], n = tp.next[k];
    if (o === n || tp.sec > 7) { out.push({ n, o: null }); continue; }
    const t0 = tp.hourly ? (k < 2 ? 0.45 : 0.1) : (SLOT_X[k] + 2 - CLOUD_X0) / CLOUD_V - 0.2;
    out.push({ n, o, t0, er: tp.hourly ? 0.6 : ERODE, bl: tp.hourly ? 1.1 : BLOOM });
  }
  let end = -1e9;
  for (const st of out) if (st.o) end = Math.max(end, st.t0 + st.er + J_MAX);
  const gap = tp.hourly ? 0.2 : GAP;
  for (const st of out) if (st.o) { st.a = tp.sec - st.t0; st.b = tp.sec - end - gap; }
  return out;
}
const J_MAX = 0.07;                   // per-sac jitter: small, so a digit thins as a whole and never reads as another
const R_GONE = -0.55;
const rOld = (s, j) => kit.lerp(R, R_GONE, kit.ease.in(kit.clamp((s.a - j) / s.er)));
const pNew = (s, j) => kit.clamp((s.b - j) / s.bl);
const rNew = (p) => kit.lerp(R_GONE, R, kit.ease.outBack(p));


/** Arm n at show time T, in skin coordinates; g (0..1) is how far it has unfurled. */
function armPath(n, T, g) {
  const base = [-0.8, -0.27, 0.27, 0.8][n];
  let x = ARMS[0], y = ARMS[1] + (n - 1.5) * 1.5;
  const pts = [[x, y]], L = 1.05 * (0.3 + 0.7 * g);
  for (let s = 1; s <= 7; s++) {
    const a = base * (1 + 0.12 * s) + 0.55 * Math.sin(2.1 * T + n * 1.9 - s * 0.7) * (s / 7) ** 1.5;
    x += Math.cos(a) * L; y += Math.sin(a) * L;
    pts.push([x, y]);
  }
  return segsOf([pts]);
}

/** Distance to a segment list, and which segment (for "how far along"). */
function sdfAlong(s, x, y) {
  let d = 1e9, at = 0;
  for (let k = 0; k < s.length; k += 4) {
    const v = kit.segDist(x, y, s[k], s[k + 1], s[k + 2], s[k + 3]);
    if (v < d) { d = v; at = k / 4; }
  }
  return [d, at];
}

export default {
  name: 'Sepia',
  blurb: 'a cuttlefish writes the time in its skin; passing clouds rewrite it, and on the hour it turns to court you',
  layouts: ['strip-x2'], look: { look: 'opal', gap: 1.5 }, fps: 60, brightness: 0.85, dither: true,
  frame(ctx) {
    const { leds, date } = ctx;
    const now = date.getTime() / 1000 - EPOCH;
    const dim = 1 - 0.8 * ctx.night;
    const tp = turnPlan(date);
    const T = date.getMinutes() === 59 && tp.sec >= 60 + SHOW0 ? tp.sec - 60 : tp.hourly && tp.sec < SHOW1 ? tp.sec : null;
    const show = T === null ? { pan: 0, zeb: 0, T: 0 } : showOf(T);
    const pan = PAN * show.pan, zeb = show.zeb;
    const states = slotStates(tp);
    const deep = !tp.hourly && tp.sec < 2.6;                 // the minute's cloud
    const cloudX = CLOUD_X0 + CLOUD_V * tp.sec;
    const zpulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(kit.TAU * 1.3 * show.T));

    // the eye and arms only exist while the head is in frame
    const head = pan > 0.3;
    const arms = head ? [0, 1, 2, 3].map((n) => armPath(n, show.T, zeb)) : null;
    const look = [0.35 * Math.sin(show.T * 0.9), 0.15 * Math.sin(show.T * 1.3 + 1)];
    const blink = bump(show.T - 2.7, 0.3);                   // one slow blink
    const dil = 0.5 + 0.5 * Math.sin(show.T * 1.1);
    const o = ctx.out;

    for (const l of leds) {
      const i = l.i, sx = l.gx + pan, sy = l.gy;
      const j = J_MAX * kit.hash(i, 7);

      // ---- skin ground: iridophores under a mottle of dark sacs
      const h = kit.noise3(sx * 0.11 + now * 0.05, sy * 0.16, now * 0.07);
      const g = h < 0.5 ? kit.mix(IRID[0], IRID[1], kit.smoothstep(0.2, 0.5, h)) : kit.mix(IRID[1], IRID[2], kit.smoothstep(0.5, 0.8, h));
      const glim = kit.noise3(sx * 0.42, sy * 0.42, now * 0.3);
      const mot = kit.smoothstep(0.4, 0.66, kit.fbm(sx * 0.17, sy * 0.21, now * 0.045, 2));
      // iridophores glow under the skin, except where the dark mottle covers them
      const gl = (0.042 + 0.06 * kit.smoothstep(0.3, 0.75, glim)) * (1 - 0.85 * mot);
      const fr = kit.smoothstep(0.62, 0.8, kit.noise3(sx * 0.8 + 50, sy * 0.8, now * 0.35)) * (1 - mot);
      let gr = g[0] * gl + 0.055 * fr, gg = g[1] * gl, gb = g[2] * gl;

      // ---- passing clouds (always), and the minute's deep one
      const u = sx + 0.07 * (sy - 7.5) ** 2 - 8 * now, q = u / 22, qi = Math.floor(q);
      // each cloud is a dark band of expanded black sacs; just ahead of it the
      // sacs are still relaxing, and the iridophores catch the light
      const ca = 0.7 + 0.3 * kit.hash(qi, 3), cf = (q - qi) * 22 - 11;
      let cloud = ca * bump(cf, 4.5);
      let edge = 0.6 * ca * bump(cf - 4.8, 2.4);
      if (deep) {
        const dx = l.gx + 0.07 * (sy - 7.5) ** 2 - cloudX;
        cloud = Math.max(cloud, 0.95 * bump(dx + 2, 6));
        edge = Math.max(edge, bump(dx - 4.2, 1.6) * kit.smoothstep(0, 0.3, tp.sec) * (1 - kit.smoothstep(1.8, 2.6, tp.sec)));
      }

      // ---- zebra (hour): leucophore stripes with iridescent fringes
      if (zeb > 0) {
        const s = Math.sin(kit.TAU * (sx / 4.6 + 0.22 * Math.sin(sy * 0.4 + sx * 0.11)));
        const white = kit.smoothstep(0.2, 0.6, s) * zpulse, fringe = bump(s - 0.15, 0.3);
        const fc = kit.mix(IRID[3], IRID[0], 0.5 + 0.5 * Math.sin(now * 2 + sx * 0.3));
        const zw = 0.065 * white, zf = 0.05 * fringe * (1.2 - zpulse);
        gr = kit.lerp(gr, LEUCO[0] * zw + fc[0] * zf, zeb);
        gg = kit.lerp(gg, LEUCO[1] * zw + fc[1] * zf, zeb);
        gb = kit.lerp(gb, LEUCO[2] * zw + fc[2] * zf, zeb);
        cloud *= 1 - 0.8 * zeb;
      }
      const cd = 1 - 0.88 * cloud;
      gr *= cd; gg *= cd; gb *= cd;
      if (edge > 0) { const e = 0.13 * edge * (0.45 + 0.55 * glim) * (1 - 0.6 * mot); gr += IRID[0][0] * e; gg += IRID[0][1] * e; gb += IRID[0][2] * e; }

      // ---- digits: expanded sacs, ringed by a moat of black ones
      let dr = 0, dg = 0, db = 0, rim = 0;
      // the mantle breathes: glyphs are sampled through a slow, small warp
      const wx = 0.5 * (kit.noise2(sy * 0.3, now * 0.35) - 0.5), wy = 0.4 * (kit.noise2(sx * 0.28 + 9, now * 0.3) - 0.5);
      for (let k = 0; k < 4; k++) {
        const lx = sx - SLOT_X[k] + wx, ly = sy - SLOT_Y[k] + wy;
        if (lx < -3 || lx > 7 || ly < -3 || ly > 9) continue;
        const st = states[k], pal = k < 2 ? YEL : RED;
        const sac = kit.noise2(sx * 1.25 + k * 20, sy * 1.25);
        const brown = kit.smoothstep(0.66, 0.85, kit.noise2(sx * 0.8 + 70 + k * 9, sy * 0.8 + now * 0.06));
        const tw = 0.74 + 0.26 * Math.sin(now * (1.4 + 1.6 * kit.hash(i, k)) + 6.3 * kit.hash(i, k + 9));
        const paint = (cov, warmUp) => {
          if (cov <= 0) return;
          let c = kit.mix(pal[0], pal[1], kit.clamp(sac * 1.5 - 0.25));
          if (warmUp < 1) c = kit.mix(YEL[0], c, warmUp);         // yellow sacs open before red
          c = kit.mix(c, BROWN, 0.6 * brown);
          const a = cov * 0.85 * tw * (1 - 0.35 * brown);
          dr = Math.max(dr, c[0] * a); dg = Math.max(dg, c[1] * a); db = Math.max(db, c[2] * a);
        };
        const rimOf = (d, r) => cover(d, r + 1.1 * kit.clamp((r - R_GONE) / (R - R_GONE)));
        if (!st.o) {
          const d = sdf(segs(st.n), lx, ly);
          paint(cover(d, R), 1); rim = Math.max(rim, rimOf(d, R));
        } else {
          const dO = sdf(segs(st.o), lx, ly), dN = sdf(segs(st.n), lx, ly);
          const ro = rOld(st, j), p = pNew(st, j), rn = rNew(p);
          paint(cover(dO, ro), 1); paint(cover(dN, rn), kit.smoothstep(0.1, 0.8, p));
          rim = Math.max(rim, rimOf(dO, ro), rimOf(dN, rn));
          // the pigment withdrawing uncovers, for a moment, the iridescence it hid
          const e = kit.clamp((st.a - j) / st.er);
          const fl = (cover(dO, R) - cover(dO, ro)) * bump(e - 0.6, 0.55) * (tp.hourly ? 0.16 : 0.2);
          if (fl > 0) { const c = IRID[0]; gr += c[0] * fl; gg += c[1] * fl; gb += c[2] * fl; }
        }
      }
      const keep = 1 - 0.9 * rim;
      const dc = 1 - 0.42 * cloud;
      let r = gr * keep + dr * dc, gn = gg * keep + dg * dc, b = gb * keep + db * dc;

      // ---- the head: eye and arms
      if (head) {
        const ex = sx - EYE[0], ey = sy - EYE[1], de = Math.hypot(ex, ey);
        if (de < ER + 1.2) {
          // a dark socket opens in the zebra; the eye was camouflaged until now
          const sock = 1 - zeb * (1 - kit.smoothstep(ER, ER + 1.1, de));
          r *= sock; gn *= sock; b *= sock;
          const open = zeb * (1 - blink), lid = Math.abs(ey) > ER * open;
          if (de < ER && !lid) {
            const ang = Math.atan2(ey, ex);
            const ic = kit.mix(IRIS, IRIS2, kit.smoothstep(-1.5, 1.5, ey) * 0.8);
            const ia = 0.4 * open * (1 - kit.smoothstep(ER - 0.7, ER, de)) * (0.78 + 0.22 * Math.sin(ang * 9 + de * 1.5));
            const px = ex - look[0], py = ey - look[1];
            const lobe = 1 - kit.smoothstep(0.8, 1.4, Math.hypot(px * 0.85, py + 1.9));
            const pupil = (1 - kit.smoothstep(1.6 + 0.5 * dil, 2.2 + 0.5 * dil, Math.hypot(px, py * 1.1))) * (1 - lobe);
            const glint = bump(Math.hypot(ex + 1.5, ey + 2.0), 0.9) * 0.4 * open;
            r += ic[0] * ia * (1 - pupil) + glint; gn += ic[1] * ia * (1 - pupil) + glint; b += ic[2] * ia * (1 - pupil) + glint;
          }
        }
        if (sx > ARMS[0] - 2) {
          // arms: a fanned bundle, each outlined by dark skin, banded like the mantle
          let fill = 0, line = 0, along = 0;
          for (let n = 0; n < 4; n++) {
            const [d, at] = sdfAlong(arms[n], sx, sy);
            const al = at / 6, rad = 0.6 - 0.32 * al;
            const c = cover(d, rad);
            if (c > fill) { fill = c; along = al; }
            line = Math.max(line, cover(d, rad + 0.75));
          }
          const k = (1 - 0.92 * line * zeb);
          r *= k; gn *= k; b *= k;
          if (fill > 0) {
            // white leucophore bands and red-brown chromatophore bands, rippling out to the tips
            const band = kit.smoothstep(-0.3, 0.4, Math.sin(along * 12 - show.T * 4));
            const ac = kit.mix(kit.scale(RED[1], 0.45), kit.scale(ARM, 0.26), band);
            const a = fill * zeb;
            r += ac[0] * a; gn += ac[1] * a; b += ac[2] * a;
          }
        }
      }

      o[3 * i] = knee(r * dim); o[3 * i + 1] = knee(gn * dim); o[3 * i + 2] = knee(b * dim);
    }
  },
};
