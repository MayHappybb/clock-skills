// Origami: each numeral is one sheet of two-sided kami, folded. Its strokes
// are the part of the sheet lying face up: a ribbon creased along its spine
// (two tones, one facet each side of the crease), mitred at every turn. All
// the rest of the sheet is still there (origami-fold.js): the counters, the
// notches and the cut corners are flaps of the same paper, hinged on a stroke
// edge and folded flat, pleated behind the stroke (an accordion of strips no
// wider than it) or rolled over it, where the paper's coloured reverse shows
// as a band beside the counter or a triangle at a corner. The font is that
// construction, all ten digits on one sheet size: every numeral unfolds to
// the same full rectangle, and folded every flap hides inside its strokes
// (out/origami-test.mjs checks both).
//
// At rest the four models are never still. Once a second a beat crosses the
// glass left to right: each model hops on its folds (the shadow on the
// washi spreads as it rises and snaps back as it lands), sways left and
// right, its spine crease flexes so the two tones of every stroke trade
// light, and as it lands its flaps follow through like a flapping bird: the
// reverse bands and corner triangles lift (narrowing to slivers) and drop,
// and the outer pleats spread a few pixels like wings and close. The colon is
// two squares of black paper folding in half on alternate beats. Every 15 s
// the models breathe open: the wings spread wide, the bands stand up.
//
// Minute turn: the changing sheet lifts its flaps (anticipation), then
// unfolds: the counter flaps swing out of their strokes first, then the
// pleats open strip after strip like a fan, the corners last, until the
// sheet lies flat as one plain rectangle at :00. Then it folds again into the
// new numeral, the same choreography played backwards: corners, pleats,
// counters, flap after flap, each a rigid strip turning on its crease (seen
// from above: foreshortened, flipping to its reverse past upright), eased,
// staggered, never faster than ~1.6 px a frame (out/origami-speed.mjs).
// Partial states are a stroke-thickened version of the old digit, or a
// blank sheet: counters close before notches fill, so a 6 never passes
// through a 0. Hour: after the hours refold, a square of gold paper slides in
// above the minutes, is folded on its diagonal and in half (real folds), is
// turned, opens its neck, tail and wings out of the packet and flies off to
// the left, flapping, climbing and shrinking into the distance, above the
// time (origami-crane.js).
//
// Palette: a pack of duo kami, one sheet per place: vermilion/marigold,
// ultramarine/sky, jade/chartreuse, magenta/apricot, each front deep and
// saturated against a pale cream washi (kozo fibres, a faint pulp cloud), so
// the time is the strongest contrast and the ground the calmest thing on the
// glass; flat crisp shadows in a warm grey. The colon is black paper with a
// gold reverse, the crane gold with a red reverse. Facets take a level from a
// light at the upper left, so tilting paper changes tone in flat steps; no
// gradients. At night the washi is indigo-dyed (dissolved in over the fade
// minute), the papers keep their colour and the backlight dims to 45 %.
// Hard pixels throughout: paper edges are crisp.
//
// Cost: a frame copies the washi (flash), then fills ~150 hard polygons
// (strips posed by an affine map each, a few kit sin/cos per strip).
import { clockFields, sin, cos, to565, mix, clamp, progress, noise2, rand } from '../js/kit.js';
import { buildFont, poseFlap, clipHalf } from './origami-fold.js';
import { crane, waiting, CRANE_T } from './origami-crane.js';

const W = 160, H = 80, N = W * H;
const HF = buildFont(30, 54, 7), MF = buildFont(26, 42, 6);
const SLOTS = [
  { x: 10, y: 20, font: HF }, { x: 45, y: 20, font: HF },
  { x: 93, y: 32, font: MF }, { x: 124, y: 32, font: MF },
];
const PAPERS = [
  [0xe5401f, 0xf0a51a],   // vermilion / marigold
  [0x2c4fc4, 0x3fb2e8],   // ultramarine / sky
  [0x0e9468, 0xa9cf2e],   // jade / chartreuse
  [0xd2246f, 0xff9440],   // magenta / apricot
];
const COLON = [0x23232e, 0xe8b23a], CRANE = [0xf0c44a, 0xd8452a], CREASE = 0xdcaa36;
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const sm5 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (x * 6 - 15) + 10));

// ------------------------------------------------------------ tones (flash tables)
const LV = 64;
function ramp(c, night) {
  const dark = mix(c, night ? 0x0c0a1c : 0x1a1030, 0.55), light = mix(c, 0xffffff, night ? 0.4 : 0.55), t = new Uint32Array(LV);
  for (let i = 0; i < LV; i++) {
    const b = (i / (LV - 1)) * 2;         // brightness 0..2, 1 = lying flat
    t[i] = b < 1 ? mix(dark, c, b) : mix(c, light, b - 1);
  }
  return t;
}
const RAMPS = PAPERS.map(([f, r]) => [ramp(f), ramp(r)]);
const R_COLON = [ramp(COLON[0]), ramp(COLON[1])], R_CRANE = [ramp(CRANE[0]), ramp(CRANE[1])];
const LX = -0.42, LY = -0.5, LZ = 0.76;   // light from the upper left, in front
const lvl = (b, side) => side[clamp(Math.round(b * 0.5 * (LV - 1)), 0, LV - 1)];
function tone(p, side) {
  // the visible face's normal against the light, relative to lying flat
  const st = sin(p.th), ct = p.ct, sg = ct < 0 ? -1 : 1;
  return lvl((-st * p.n[0] * sg * LX - st * p.n[1] * sg * LY + ct * sg * LZ) / LZ, side);
}
/** A ribbon facet, tilted `spine` radians off flat toward its outer edge. */
const spineTone = (o, spine, side) => lvl((o[0] * sin(spine) * LX + o[1] * sin(spine) * LY + cos(spine) * LZ) / LZ, side);

// ------------------------------------------------------------ washi (flash)
// by day a cream kozo washi; by night the same sheet in indigo-dyed washi
const WASHI = { base: 0xefe6d4, hi: 0xf6f0e3, lo: 0xe8ddc7, fibreHi: 0xfbf8f0, fibreLo: 0xd9cdb4, shadow: 0xcbbca1 };
const WASHI_N = { base: 0x262c44, hi: 0x2e3552, lo: 0x20253a, fibreHi: 0x3a4262, fibreLo: 0x1b1f31, shadow: 0x141726 };
function washi(P) {
  const buf = new Uint16Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      // flat paper with a faint cloud of pulp: only the densest flecks show
      const m = noise2(x / 9, y / 7, 3) * 0.6 + noise2(x / 3, y / 3, 4) * 0.4;
      buf[y * W + x] = to565(m > 0.8 ? P.hi : m < 0.17 ? P.lo : P.base);
    }
  // kozo fibres: short wavy strands
  for (let k = 0; k < 45; k++) {
    let x = rand(k, 1) * W, y = rand(k, 2) * H, a = rand(k, 3) * 6.28;
    const len = 5 + rand(k, 4) * 14, c = to565(k % 4 === 0 ? P.fibreLo : P.fibreHi);
    for (let i = 0; i < len; i++) {
      a += (rand(k, i, 5) - 0.5) * 0.6;
      x += Math.cos(a); y += Math.sin(a) * 0.7;
      const xi = Math.floor(x), yi = Math.floor(y);
      if (xi >= 0 && yi >= 0 && xi < W && yi < H) buf[yi * W + xi] = c;
    }
  }
  return buf;
}
const GROUND = washi(WASHI), GROUND_N = washi(WASHI_N);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

// ------------------------------------------------------------ the turn's choreography
// unfold: counters first, then notches, the cut corners last; each strip of
// a pleat after the one before it. Folding is the same, played backwards.
const STRIP_T = 0.4, GROUP_T = 0.2, NEXT_T = 0.14;
for (const F of [HF, MF]) for (const dg of F.digits) {
  let T = 0;
  for (const fl of dg.flaps) {
    fl.t0 = fl.strips.map((_, i) => fl.group * GROUP_T + i * NEXT_T);
    T = Math.max(T, ...fl.t0.map((t) => t + STRIP_T));
  }
  dg.T = T;
}
const UNFOLD0 = 58.55, FOLD0 = 0.1, STAGGER = 0.12;

/** The beat: a quick lift, a slow eased fall with a small rebound; 0..1. */
function kick(ph) {
  const b = ph - Math.floor(ph);
  if (b < 0.09) return sm(b / 0.09);
  const u = (b - 0.09) / 0.6;
  return u >= 1 ? 0 : (1 - sm(u)) - 0.12 * sin(u * Math.PI) * u;
}

/** The hop: up fast, down eased, a little bounce on landing; height 0..1. */
function hop(ph) {
  const b = ph - Math.floor(ph);
  if (b < 0.2) return 1 - (1 - b / 0.2) ** 2;
  if (b < 0.42) { const u = (b - 0.2) / 0.22; return 1 - u * u; }
  if (b < 0.6) { const u = (b - 0.42) / 0.18; return 0.16 * 4 * u * (1 - u); }
  return 0;
}
const HOP = 3.5, SWAY = 2.5;

/** The wings' slower beat: an eased spread and an eased close, 0..1. */
function wingBeat(ph) {
  const b = ph - Math.floor(ph);
  return b < 0.32 ? sm(b / 0.32) : b < 0.38 ? 1 : 1 - sm((b - 0.38) / 0.5);
}

/** Everything about slot i at this instant: which digit, how folded each strip, its lift. */
function slotState(i, s, cur, old, nw, hourShow) {
  const slot = SLOTS[i];
  // changing sheets go one after another, right to left, 0.12 s apart (against the beat)
  let ru = 0, rf = 0;
  for (let j = i + 1; j < 4; j++) { if (cur[j] !== nw[j]) ru++; if (cur[j] !== old[j]) rf++; }
  const UNFOLD_AT = UNFOLD0 + STAGGER * ru, FOLD_AT = FOLD0 + STAGGER * rf;
  const dg = slot.font.digits[+cur[i]];
  const beat = s - slot.x / 420;             // the beat runs across the glass left to right
  let mode = 'rest', tau = 0;
  if (cur[i] !== nw[i] && s >= UNFOLD_AT) { mode = 'unfold'; tau = s - UNFOLD_AT; if (tau > dg.T) mode = 'flat'; }
  else if (cur[i] !== old[i] && s < 3) { tau = s - FOLD_AT; mode = tau < 0 ? 'flat' : tau > dg.T ? 'rest' : 'fold'; }
  // rest life: the beat runs across the glass left to right, flap by flap
  const settle = cur[i] !== old[i] ? progress(s, FOLD_AT + dg.T - 0.1, FOLD_AT + dg.T + 0.5) : 1;
  const flo = flourish(s, hourShow);
  const fs = [];
  for (const fl of dg.flaps) {
    const hx = slot.x + fl.P[0] + fl.strips[0].s1 * fl.n[0] * 0.5;
    // the flaps lag the body: they flap as it lands (follow-through), corners first
    const k = kick(s - hx / 420 - 0.36 - 0.03 * fl.group);
    const arr = new Array(fl.strips.length);
    for (let j = 0; j < arr.length; j++) {
      let f;
      if (mode === 'flat') f = 0;
      else if (mode === 'unfold') f = 1 - sm5(progress(tau, fl.t0[j], fl.t0[j] + STRIP_T));
      else if (mode === 'fold') f = sm5(progress(tau, dg.T - fl.t0[j] - STRIP_T, dg.T - fl.t0[j]));
      else f = 1;
      if (j === 0 && mode !== 'flat') {
        if (fl.kind === 'V') {
          // anticipation before the unfold: every valley flap lifts and holds
          const ant = mode === 'rest' && cur[i] !== nw[i] ? sm(progress(s, UNFOLD_AT - 0.45, UNFOLD_AT)) : 0;
          const lift = Math.max(0.3 * k * settle + 0.36 * flo.open, ant * 0.3);
          f *= 1 - lift;
        } else if (fl.group === 1) f *= 1 - Math.max(0.74 * wingBeat(s - hx / 420 - 0.3) * settle, 0.8 * flo.wing(slot.x + fl.P[0]));   // the outer pleats breathe
      }
      arr[j] = f;
    }
    fs.push(arr);
  }
  // the ribbon's spine crease flattens out with the sheet, so a flat sheet is one plain colour
  const folded = mode === 'flat' ? 0 : mode === 'unfold' ? 1 - sm(tau / dg.T) : mode === 'fold' ? sm(tau / dg.T) : 1;
  const spine = (0.22 + 0.42 * kick(s - (slot.x + 15) / 420) * settle + 0.2 * flo.open) * folded;
  // the body hops and waddles (alternate beats lean left and right); not while unfolding
  const live = settle * (mode === 'rest' && cur[i] === nw[i] ? 1 : mode === 'rest' ? 1 - progress(s, UNFOLD_AT - 0.6, UNFOLD_AT - 0.2) : 0) * (hourShow ? 0.6 : 1);
  // one full sway, left then right, every second, eased through the landing
  const hp = hop(beat) * live, bf = beat - Math.floor(beat);
  const sx = SWAY * sin(2 * Math.PI * (bf + 0.08 * sin(2 * Math.PI * bf))) * live;
  return { slot, dg, fs, spine, mode, ox: slot.x + sx, oy: slot.y - HOP * hp, lift: HOP * hp };
}

/** Every 15 s the models breathe open: wings (outer pleats) part, bands lift; 0..1. */
const flourishAt = (s, hourShow) => (hourShow ? -99 : s >= 13 && s < 18 ? 14.4 : s >= 28 && s < 33 ? 29.4 : s >= 43 && s < 48 ? 44.4 : -99);
function flourish(s, hourShow) {
  const at = flourishAt(s, hourShow);
  if (hourShow || at < 0) return { open: 0, wing: () => 0 };
  const env = (x) => { const u = (s - at - x / 300) / 1.7; return u <= 0 || u >= 1 ? 0 : sm(u / 0.35) * (1 - sm((u - 0.45) / 0.55)); };
  return { open: env(80), wing: env };
}

// ------------------------------------------------------------ drawing
function posePolys(st) {
  const { dg, fs, ox, oy } = st, polys = [];
  for (let k = 0; k < dg.flaps.length; k++) poseFlap(dg.flaps[k], fs[k], ox, oy, polys);
  for (const p of dg.strokes) polys.push({ pts: p.pts.map(([a, b]) => [a + ox, b + oy]), stroke: true, o: p.o, key: 0, z: 0 });
  polys.sort((a, b) => a.key - b.key);
  return polys;
}

function drawShadow(g, st, polys, col) {
  const { x, y, font } = st.slot;
  g.clip(x - 3, y, font.W + 8, font.H + 5);
  // the shadow stays on the table: it does not rise with the hop, it spreads away from it
  const L = st.lift, bx = st.slot.x - st.ox, by = st.slot.y - st.oy;
  for (const p of polys) {
    const z = Math.max(0, p.z) + L, ox = bx + 1 + z * 0.35, oy = by + 1.5 + z * 0.45;
    g.fillPolygon(p.pts.map(([a, b]) => [a + ox, b + oy]), col);
  }
  g.unclip();
}

const lvlI = (b) => clamp(Math.round(b * 0.5 * (LV - 1)), 0, LV - 1);
function toneI(p) {
  const st = sin(p.th), ct = p.ct, sg = ct < 0 ? -1 : 1;
  return lvlI((-st * p.n[0] * sg * LX - st * p.n[1] * sg * LY + ct * sg * LZ) / LZ);
}
const spineI = (o, spine) => lvlI((o[0] * sin(spine) * LX + o[1] * sin(spine) * LY + cos(spine) * LZ) / LZ);
const GN = 0.7071;

function drawPaper(g, st, polys, pal, glintX) {
  const { font } = st.slot;
  g.clip(Math.round(st.ox), Math.round(st.oy), font.W, font.H);
  for (const p of polys) {
    const side = pal[p.stroke ? 0 : p.back ? 1 : 0], i = p.stroke ? spineI(p.o, st.spine) : toneI(p);
    g.fillPolygon(p.pts, side[i]);
    // a glint: a diagonal band of light crossing the paper (and only the paper)
    if (glintX !== null) {
      const c0 = (glintX + st.oy) * GN;
      const band = clipHalf(clipHalf(p.pts, GN, GN, c0), -GN, -GN, -(c0 + 3.2));
      if (band.length >= 3) g.fillPolygon(band, side[Math.min(LV - 1, i + 13)]);
    }
  }
  g.unclip();
}

// the colon: two small squares of black paper, each folding in half on alternate beats
const COLON_XY = [[84, 45], [84, 61]];
function colon(g, s, shadowCol) {
  for (let k = 0; k < 2; k++) {
    const [cx, cy] = COLON_XY[k], r = 4.5;
    const b = (s + k) / 2, ph = b - Math.floor(b);       // each folds once every two seconds, alternating
    const a = Math.PI * (ph < 0.42 ? sm5(ph / 0.42) : 1 - sm5((ph - 0.42) / 0.5)) * 0.98;
    const ca = cos(a);
    // the bottom half lies still; the top half rotates about the horizontal diagonal
    const top = [[cx - r, cy], [cx, cy - r * ca], [cx + r, cy]], bot = [[cx - r, cy], [cx + r, cy], [cx, cy + r]];
    const lift = sin(a) * r * 0.5;
    g.fillPolygon(bot.map(([x, y]) => [x + 1, y + 1.5]), shadowCol);
    g.fillPolygon(top.map(([x, y]) => [x + 1 + lift * 0.35, y + 1.5 + lift * 0.45]), shadowCol);
    g.fillPolygon(bot, R_COLON[0][LV >> 1]);
    g.fillPolygon(top, tone({ th: a, ct: ca, n: [0, -1] }, R_COLON[ca < 0 ? 1 : 0]));
  }
}

function drawCrane(g, c, shadowCol) {
  for (const p of c.polys) g.fillPolygon(p.pts.map(([x, y]) => [x + c.shadow * 0.6, y + c.shadow * 0.8]), shadowCol);
  c.polys.forEach((p, i) => {
    g.fillPolygon(p.pts, R_CRANE[p.back ? 1 : 0][Math.round((0.62 + 0.38 * (p.lit ?? 1)) * (LV >> 1))]);
    // the pressed creases lie on the sheet, under any flap lifted over it
    if (c.lines && i + 1 === c.linesAfter) for (const [x0, y0, x1, y1] of c.lines) g.line(Math.floor(x0 - (x1 < x0 ? 0.01 : 0)), Math.floor(y0), Math.floor(x1), Math.floor(y1), CREASE);
  });
}

/** For tests: the posed polygons of every slot at a time, in a fixed order. */
export function _pose(date) {
  const f = clockFields(date), s = f.sec;
  const prv = clockFields(new Date(date.getTime() - 60000)), nxt = clockFields(new Date(date.getTime() + 60000));
  return [0, 1, 2, 3].map((i) => {
    const st = slotState(i, s, f.hh + f.mm, prv.hh + prv.mm, nxt.hh + nxt.mm, prv.h !== f.h && s < 12);
    const out = [];
    for (let k = 0; k < st.dg.flaps.length; k++) poseFlap(st.dg.flaps[k], st.fs[k], st.ox, st.oy, out);
    return { d: st.dg.d, mode: st.mode, polys: out };
  });
}

export default {
  name: 'Origami',
  blurb: 'Each numeral is a sheet of two-sided paper folded into the digit; they hop and flap on the beat, and each minute a sheet unfolds flat and refolds, flap after flap, into the next.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec;
    ctx.lcd.backlight(1 - 0.55 * ctx.night);
    // the ground: day or night washi; over the fade minute one dissolves into the other
    const nt = ctx.night;
    if (nt <= 0) g.buf.set(GROUND); else if (nt >= 1) g.buf.set(GROUND_N);
    else {
      const buf = g.buf;
      for (let i = 0, y = 0; y < H; y++) for (let x = 0; x < W; x++, i++) buf[i] = nt > BAYER[((y & 3) << 2) | (x & 3)] ? GROUND_N[i] : GROUND[i];
      g.cost.box += N * 2;
    }
    g.cost.px += N;
    const SHADOW = nt >= 0.5 ? WASHI_N.shadow : WASHI.shadow;
    const prv = clockFields(new Date(ctx.date.getTime() - 60000)), nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm, old = prv.hh + prv.mm, nw = nxt.hh + nxt.mm;
    const hourShow = prv.h !== f.h && s < 10;
    const states = [0, 1, 2, 3].map((i) => slotState(i, s, cur, old, nw, hourShow));
    const polys = states.map(posePolys);
    for (let i = 0; i < 4; i++) drawShadow(g, states[i], polys[i], SHADOW);
    colon(g, s, SHADOW);
    // glints: one runs across the glass (x + y = const, moving right) as each sheet lies open at
    // :00, and one with every flourish; ~1.3 px a frame
    const gt = s >= 59.2 ? s - 59.2 : s < 1.2 ? s + 0.8 : -1;
    const fa = flourishAt(s, hourShow);
    const gX = gt >= 0 ? -60 + gt * 80 : fa > 0 && s - fa > 0.2 && s - fa < 3.2 ? -60 + (s - fa - 0.2) * 80 : null;
    for (let i = 0; i < 4; i++) drawPaper(g, states[i], polys[i], RAMPS[i], gX);
    // the crane's square arrives as the old hour unfolds, and folds while the new one does
    const ctT = nxt.h !== f.h && s >= 58.6 ? s - 58.6 : prv.h !== f.h && s < CRANE_T ? s + 1.4 : -1;
    const cr = ctT >= 0 ? crane(ctT) : null;
    // the next sheet: lying there all hour; after the crane has gone a fresh one slides in from the right
    const showing = ctT >= 0 && ctT < CRANE_T + 0.1;
    if (!showing || ctT > 6.4) {
      const dx = showing ? 46 * (1 - sm5(progress(ctT, 6.4, 8.0))) : 0;
      const k = showing ? 0 : 0.7 * wingBeat(s - 0.55) + 0.3 * flourish(s, false).open;
      const drift = showing ? 0 : 2.2 * sin(2 * Math.PI * (s - 0.3));       // a draught: once a second, side to side
      drawCrane(g, waiting(k, dx, drift), SHADOW);
    }
    if (cr) drawCrane(g, cr, SHADOW);
  },
};
