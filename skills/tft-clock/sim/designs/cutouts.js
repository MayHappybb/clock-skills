// Cut-Outs: the glass is a stretch of Matisse's studio wall at the Régina,
// where he pinned up the shapes he cut "directly into colour". The wall is
// a collage of painted-paper grounds (ultramarine, vermilion, emerald,
// magenta, violet, black, lemon, orange, a little askew, their scissor-cut
// edges never quite square), and the time is four cut-paper numerals pinned
// on it: the hours big in white paper, the minutes smaller in lemon, each
// hung from one pin and tilted the way a hand pins paper. Loose cut-outs
// share the wall: a lemon star (Icarus's), an alga, a three-fingered leaf.
//
// The numerals are drawn for this grid as scissor work (cutouts-glyphs.js):
// bold strokes that swell on the curves and are snipped square or slanted at
// their ends, and every counter cut with two snips, a pointed almond, which
// is the set's signature (0, 6, 8, 9; the 4's is a triangle).
//
// Always alive: a draught crosses the wall every 14.4 s; the numerals sway
// on their pins (flat turns of a degree or two, AA from distance fields, so
// edges glide) and lift, their flat shadows reaching further; the alga
// waves along its length; the leaf flutters; every 9.6 s the star flips
// over on its pin (squeezed flat, never tilted in depth) and shows its
// other cut.
//
// Minute turn: before :00 the changing numeral's pin is drawn out and the
// paper drops off the wall, turning a little. After :00 a fresh sheet of
// its paper comes down into the place, and a pair of shears cuts the new
// numeral out of it along its contour, counters first: the slit opens
// behind the blades, each counter drops out as its contour closes, the
// waste outside comes away in pieces that fall turning over (painted face,
// plain back), and a pin goes in; the numeral settles to its hanging tilt.
// Old numerals only leave before :00, new ones only appear after it.
//
// Hour ("L'Escargot"): while the hours are cut, the wall is recomposed in
// the new hour's colours: seven fresh grounds come in one by one along a
// spiral, spinning flat, outermost first, and are pinned over the old ones,
// as the pieces of The Snail wind round its centre. Six day schemes take
// turns; from 23:00 to 07:00 two night schemes of deep colours.
//
// Palette: Matisse's own gouaches (Linel), flat, with the painted sheets'
// faint brush streaks as four texture levels a colour; white paper on deep
// grounds and lemon on saturated ones so the time is always the strongest
// contrast; the wall a warm white with old pin holes. At night the grounds
// are deep and deliberate (ultramarine, violet, emerald, wine, ochre) and
// the backlight drops to 40 %; white and lemon paper still lead.
//
// Hard pixels for the static paper (grounds, wall, pins); AA where a piece
// moves (numerals, loose shapes, flying grounds, shears).
//
// Cost: an integer pass composites the baked grounds (one lookup a pixel);
// each piece is sampled from its int8 distance field (bilinear, fixed-point
// steps) with its flat shadow; all charged to g.cost.box. Nothing is redrawn
// outside the canvas. Flash: numeral fields + piece maps + tau 20 x ~2.3 KB x
// 3 = ~140 KB, paths ~25 KB, ground layout 4 x 12.8 KB = 51 KB, wall 25.6 KB,
// loose shapes ~3 KB: ~245 KB.

import { sin, cos, clockFields, progress, ease, clamp } from '../js/kit.js';
import { W, H, C, WALL, shades, bakeLayout, grounds, flyingSheet, lay, layM } from './cutouts-paper.js';
import { GLYPHS, SHAPES, MARGIN } from './cutouts-glyphs.js';
import { cutSheet, sheetOnly, pathAt, scissors } from './cutouts-cut.js';

const TAU = Math.PI * 2;

// ------------------------------------------------------------ the wall's composition

// The numerals: hours big at the left, minutes smaller and stepped at the right.
const SLOTS = [
  { size: 'big', gx: 5, gy: 12, tilt: -0.035 },
  { size: 'big', gx: 41, gy: 15, tilt: 0.03 },
  { size: 'small', gx: 94, gy: 9, tilt: 0.05 },
  { size: 'small', gx: 126, gy: 29, tilt: -0.04 },
];
// The painted grounds pinned on the wall. 0-3 lie under numerals (always a
// deep colour under white paper); 4-6 carry the loose shapes.
const BLOCKS = [
  { cx: 26, cy: 40, w: 58, h: 86, rot: -0.02 },
  { cx: 63, cy: 43, w: 30, h: 66, rot: 0.045 },
  { cx: 108, cy: 30, w: 46, h: 46, rot: -0.03 },
  { cx: 139, cy: 52, w: 36, h: 54, rot: 0.04 },
  { cx: 83, cy: 14, w: 16, h: 24, rot: 0.08 },
  { cx: 97, cy: 68, w: 30, h: 20, rot: -0.06 },
  { cx: 151, cy: 12, w: 22, h: 22, rot: 0.1 },
];
BLOCKS.forEach((b, i) => { b.seed = 11 + i; });
const LAYOUT = bakeLayout(BLOCKS);

// Colour schemes, one per hour in turn: [the seven grounds], then the loose
// shapes' colours [star, alga, leaf].
const SCHEMES = [
  { g: [C.ultra, C.verm, C.emer, C.mag, C.black, C.lemon, C.orange], d: [C.lemon, C.black, C.ultra] },
  { g: [C.verm, C.ultra, C.mag, C.violet, C.lemon, C.orange, C.emer], d: [C.verm, C.ultra, C.lemon] },
  { g: [C.emer, C.ultra, C.verm, C.ultra, C.orange, C.lemon, C.black], d: [C.ultra, C.verm, C.lemon] },
  { g: [C.violet, C.mag, C.ultra, C.verm, C.lemon, C.black, C.orange], d: [C.mag, C.lemon, C.ultra] },
  { g: [C.black, C.ultra, C.verm, C.emer, C.mag, C.lemon, C.orange], d: [C.lemon, C.ultra, C.black] },
  { g: [C.mag, C.violet, C.emer, C.ultra, C.orange, C.black, C.lemon], d: [C.ultra, C.lemon, C.verm] },
];
// Night (23-07): the same wall by lamplight, deep colours on purpose, the
// star lemon on black; the backlight carries the dimming.
const NIGHTS = [
  { g: [0x1c3286, 0x4a2f86, 0x0f6a48, 0x86255a, C.black, 0xb88f1c, 0xa85a1c], d: [C.lemon, C.black, 0x1c3286] },
  { g: [0x4a2f86, 0x1c3286, 0x86255a, 0x0f6a48, 0xb88f1c, C.black, 0x1c3286], d: [C.black, C.lemon, 0xb88f1c] },
];
const SCHEME_SH = SCHEMES.map((s) => ({ g: s.g.map((c) => shades(c)), d: s.d.map((c) => shades(c)) }));
const NIGHT_SH = NIGHTS.map((s) => ({ g: s.g.map((c) => shades(c)), d: s.d.map((c) => shades(c)) }));
const isNight = (h) => h >= 23 || h < 7;
const schemeOf = (h) => (isNight(h) ? NIGHT_SH[h % 2] : SCHEME_SH[h % SCHEMES.length]);

// The hour: "L'Escargot". The new hour's sheets come in one by one along a
// spiral, spinning flat, the outermost first, and are pinned over the old
// ones: the wall is recomposed in new colours round the time.
const CXS = 80, CYS = 40;
const SNAIL = BLOCKS.map((b, i) => {
  const dx = b.cx - CXS, dy = (b.cy - CYS) * 2;
  return { i, r: Math.sqrt(dx * dx + dy * dy), a: Math.atan2(dy, dx) };
}).sort((p, q) => q.r - p.r).map((p, k) => ({ ...p, land: 0.9 + 0.55 * k }));
const FLY = 1.5;   // s each sheet is in the air
const SNAIL_END = SNAIL[SNAIL.length - 1].land + 0.05;

/** Where sheet k of the snail is at s (seconds into the hour), or null if not flying. */
function snailPose(q, s) {
  const u = (s - (q.land - FLY)) / FLY;
  if (u <= 0 || u >= 1) return null;
  const e = ease.outCubic(u), b = BLOCKS[q.i];
  const a = q.a - (1 - e) * 2.6, r = q.r + (1 - e) * 140;
  return { x: CXS + r * cos(a), y: CYS + (r * sin(a)) / 2, rot: b.rot + (1 - e) * 2.2, lift: 0.8 + (1 - e) * 5 };
}

// The numerals' paper: white for the hours, lemon for the minutes; the back of a sheet is plain.
const PAPERS = [shades(C.white, 0.45), shades(C.white, 0.45), shades(C.lemon), shades(C.lemon)];
const PAPER_BACK565 = ((0xd6 >> 3) << 11) | ((0xd3 >> 2) << 5) | (0xc6 >> 3);

// ------------------------------------------------------------ time and air

const DAY = 86400;
const wrap = (v, P) => { v %= P; return v < 0 ? v + P : v; };
/** A phase that closes over the day: P must divide 86400. */
const ph = (t, P) => (wrap(t, P) / P) * TAU;
/** The draught: a gust crosses the wall left to right every 14.4 s; its strength at x. */
function gust(t, x) {
  const q = wrap(t - x / 85, 14.4);
  if (q > 2.6) return 0;
  const e = sin((q / 2.6) * Math.PI);
  return e * e;
}

// ------------------------------------------------------------ the turn's timetable

const CUT_IN = 0.35;   // s for a fresh sheet to come down into place
const cutLen = (G) => clamp(0.4 + G.pathLen / 150, 1.1, 1.9);

function plan(f, date) {
  const cur = f.hh + f.mm, prv = clockFields(new Date(date.getTime() - 60000)), nxt = clockFields(new Date(date.getTime() + 60000));
  const pd = prv.hh + prv.mm, nd = nxt.hh + nxt.mm, s = f.sec;
  const jobs = [];
  let rOut = 0, rIn = 0;
  for (let i = 0; i < 4; i++) {
    const G = GLYPHS[SLOTS[i].size][+cur[i]];
    const j = { G, digit: +cur[i], out: null, cut: null };
    if (nd[i] !== cur[i]) { j.out = 58.6 + 0.12 * rOut++; }
    if (pd[i] !== cur[i]) {
      const t0 = 0.02 + 0.25 * rIn++, Tc = cutLen(G);
      j.cut = { t0, Tc, c0: t0 + CUT_IN + 0.08, c1: t0 + CUT_IN + 0.08 + Tc };
    }
    jobs.push(j);
  }
  return { jobs, hourIn: prv.h !== f.h, hourOut: nxt.h !== f.h, prvH: prv.h };
}

// ------------------------------------------------------------ the face

export default {
  name: 'Cut-Outs',
  blurb: "Matisse's studio wall: the time is cut-paper numerals pinned on painted grounds; shears cut each new minute, and every hour the wall is recomposed along The Snail's spiral.",
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec;
    const t = f.h * 3600 + f.m * 60 + s;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    const P = plan(f, ctx.date);

    // the wall and its grounds; in the hour's first seconds the new sheets come in
    g.buf.set(WALL); g.cost.px += W * H;
    const sch = schemeOf(f.h);
    let SH = sch.g, DS = sch.d, flying = null;
    if (P.hourIn && s < SNAIL_END + 0.1) {
      const old = schemeOf(P.prvH);
      SH = new Array(BLOCKS.length); flying = [];
      for (const q of SNAIL) {
        SH[q.i] = s >= q.land ? sch.g[q.i] : old.g[q.i];
        const pose = snailPose(q, s);
        if (pose) flying.push([q.i, pose]);
      }
      DS = [4, 5, 6].map((bi, k) => (s >= SNAIL.find((q) => q.i === bi).land ? sch.d[k] : old.d[k]));
    }
    grounds(g, LAYOUT, SH);
    if (flying) for (const [bi, p] of flying) { const b = BLOCKS[bi]; flyingSheet(g, p.x, p.y, b.w, b.h, p.rot, sch.g[bi], p.lift); }

    // loose shapes pinned on the small grounds
    drawLoose(g, t, DS);

    // the numerals
    for (let i = 0; i < 4; i++) drawSlot(g, i, P.jobs[i], s, t);
  },
};

// ------------------------------------------------------------ loose shapes

function drawLoose(g, t, D) {
  // the alga on the bottom ground: sways the most, it is long and pinned at its middle
  {
    const S = SHAPES.alga, b = BLOCKS[5], e = gust(t, b.cx);
    const th = 0.05 * sin(ph(t, 7.2) + 1) + e * 0.12 * sin(ph(t, 1.2));
    lay(g, S, S.pin[0], S.pin[1], b.cx - 2, b.cy - 1, cos(th), sin(th), D[1], 1.2, 1.4, 205, 1.6 + 2 * e, 0.35, -ph(t, 2.4));
    pin(g, b.cx - 2, b.cy - 1);
  }
  // the leaf top right, half off the glass
  {
    const S = SHAPES.leaf, b = BLOCKS[6], e = gust(t, b.cx);
    const th = -0.5 + 0.06 * sin(ph(t, 6.4) + 2) + e * 0.14 * sin(ph(t, 0.96) + 1);
    lay(g, S, S.pin[0], S.pin[1], b.cx - 2, b.cy + 1, cos(th), sin(th), D[2], 1.2, 1.4, 205);
    pin(g, b.cx - 2, b.cy + 1);
  }
  // the star on the black ground: every 9.6 s it flips over on its pin, and the other cut is behind
  {
    const b = BLOCKS[4], q = wrap(t, 9.6), flip = progress(q, 0, 0.7);
    const which = ((wrap(t, 19.2) >= 9.6) ? 1 : 0) ^ (flip >= 0.5 ? 1 : 0);
    const S = which ? SHAPES.star6 : SHAPES.star5;
    const kx = Math.abs(cos(flip * Math.PI));
    if (kx > 0.08) {
      const th = 0.04 * sin(ph(t, 4.8));
      const c = cos(th), sn = sin(th);
      layM(g, S, S.pin[0], S.pin[1], b.cx, b.cy, c / kx, sn / kx, -sn, c, D[0], 1, 1.2, 205);
    }
    pin(g, b.cx, b.cy);
  }
}

function pin(g, x, y) {
  g.fillRect(Math.round(x - 1), Math.round(y - 1), 2, 2, C.pin);
}

// ------------------------------------------------------------ a numeral slot

function drawSlot(g, i, job, s, t) {
  const S = SLOTS[i], G = job.G, PAPER = PAPERS[i];
  const ox = S.gx - MARGIN, oy = S.gy - MARGIN;          // field origin at rest
  const px = ox + G.pin[0], py = oy + G.pin[1];          // the pin on the glass
  const e = gust(t, px);
  let amp = 1;
  // ---- arriving: a fresh sheet, the shears, the pin
  if (job.cut && s < job.cut.c1 + 1.6) {
    const c = job.cut;
    if (s < c.t0) return;
    if (s < c.c0) {
      const u = ease.outCubic(progress(s, c.t0, c.t0 + CUT_IN));
      sheetOnly(g, G, ox, Math.round(oy - (1 - u) * (oy + G.sheet[1] + G.sheet[3] + 2)), PAPER);
      return;
    }
    if (s < c.c1 + 0.9) {
      const p = progress(s, c.c0, c.c1);
      cutSheet(g, G, ox, oy, (s - c.c0) / c.Tc, c.Tc, PAPER, PAPER_BACK565, i < 2 ? -1 : 1);
      if (s < c.c1 + 0.35) {
        const out = progress(s, c.c1, c.c1 + 0.35);
        const [x, y, tx, ty, lifted] = pathAt(G, Math.min(p, 0.999));
        const snip = 0.5 + 0.5 * sin(s * TAU * 4.5);
        scissors(g, ox + x + tx * out * 10, oy + y + ty * out * 10 - out * 8, tx, ty, p >= 1 ? 1 : snip, lifted || p >= 1 ? 1 : 0);
      }
      if (s >= c.c1 + 0.45) pin(g, px, py - (1 - ease.outCubic(progress(s, c.c1 + 0.45, c.c1 + 0.7))) * 5);
      return;
    }
    amp = ease.inOutQuad(progress(s, c.c1 + 0.9, c.c1 + 1.6));
  }
  // ---- leaving: the pin comes out, the paper drops
  if (job.out !== null && s >= job.out) {
    const a = s - job.out;
    if (a < 0.22) {
      // the pin is drawn out: it lifts and is gone
      const th = S.tilt + 0.014 * sin(ph(t, 6.4) + i * 1.7);
      lay(g, G, G.pin[0], G.pin[1], px, py, cos(th), sin(th), PAPER, 1.2, 1.6, 196);
      if (a < 0.16) pin(g, px + a * 12, py - a * 30);
      return;
    }
    const fa = a - 0.22, dir = i % 2 ? 1 : -1;
    const th = S.tilt + 0.014 * sin(ph(t, 6.4) + i * 1.7) + dir * (0.5 * fa + 0.35 * fa * fa) + 0.03 * sin(fa * 9);
    const y = py + 260 * fa * fa + 8 * fa, x = px + dir * 9 * fa + 1.5 * sin(fa * 8);
    if (y - G.h > H) return;
    lay(g, G, G.pin[0], G.pin[1], x, y, cos(th), sin(th), PAPER, 1.2 + fa * 3, 1.6 + fa * 3, 196);
    return;
  }
  // ---- at rest: hanging from its pin, swaying in the draught
  const th = amp * (S.tilt + 0.014 * sin(ph(t, 6.4) + i * 1.7) + e * 0.035 * sin(ph(t, 1.2) + i));
  const lift = e * amp * 1.2;
  lay(g, G, G.pin[0], G.pin[1], px, py, cos(th), sin(th), PAPER, 1.2 + lift, 1.6 + lift, 196);
  pin(g, px, py);
}
