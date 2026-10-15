// Tangram: the glass is a plate from a tangram puzzle book, and the time is
// the puzzle. Every numeral is a tangram figure: two complete sets of the
// seven pieces (two big triangles, a medium one, two small ones, a square, a
// parallelogram) laid edge to edge with hairline seams, all fourteen used,
// as the puzzle demands. The letterforms are what those pieces allow on a
// 45-degree grid: one-cell strokes, chamfered corners, counters cut to
// points, and the big triangles settling where a stroke turns, which gives
// the bowls their pinwheels and the 8 its hourglass waist. Hours are big sets
// at the left, minutes smaller sets top right; in the corner below them a
// plain wooden set solves the minute's printed problem (a boat, a fir, a
// house), one piece every 7.6 s, and when it is solved the reader stamps the
// page with a red seal. Each digit was tiled by an exact-cover solver
// (tangram-pieces.js) from a drawn silhouette (tangram-glyphs.js).
//
// Always alive: the pieces breathe (a fraction of a pixel, the seams open
// and close), a lacquer glint slides diagonally across the strip every 9 s,
// every 2.3 s one piece is nudged a pixel out of place and settles back, and
// every 3.5 s one piece is turned over and back (a flat flip about its own
// mirror axis, the duller back showing for a moment). The wooden set is
// always mid-solve.
//
// Minute: from :58.7 the changing numeral comes apart: every piece slides
// and turns (the parallelogram flips if it has to change hands) into the
// puzzle's rest, each set packed into its square, two squares stacked in the
// slot. After :00 the squares unpack into the new numeral, done by :01.3.
// Squares are not a digit, so the time is never wrong.
// Hour: the hour digit turns into a creature of the same fourteen pieces (a
// cat on even hours, a sailboat on odd ones) that hops once and then
// becomes the new digit; the other digits pack and unpack briskly so the
// time is gone for about a second at most, even at midnight. Then a front
// rolls across the strip and turns every piece over to the new hour's
// colourway.
//
// Palette: four lacquer colourways, one per hour in turn, each a single
// family with one accent so a numeral reads as one object and its pieces as
// pieces: imperial (vermilion, lapis, gold), cinnabar, blue-and-white
// porcelain (the white is the paper) and jade. All are mid to dark so no
// piece dissolves into the cream paper. Night (23-07): the paper turns
// indigo and the pieces go to pale moonlit tints, the brightest thing on a
// 40 % backlight; the wooden set darkens. Pieces are flat fills, AA edges
// (they glide and turn by fractions of a pixel); the paper grain and the
// printed rule are hard pixels.
//
// Cost: one convex-polygon fill per piece (a min of 3-4 edge distances per
// pixel, written straight into the buffer), ~63 pieces a frame, and a
// paper copy. Flash: the paper (day and night, 2 x 25.6 KB) and the layouts
// (10 digits + 4 figures + squares + 3 problems, ~260 piece placements,
// ~3 KB as tables): ~55 KB. Nothing is drawn outside the canvas.

import { LOCAL, SYM, solveMask, packedSquare } from './tangram-pieces.js';
import { DIGITS, FIGURES, FIG_ORDER, PROBLEMS, PROBLEM_ORDER } from './tangram-glyphs.js';
import { fillPiece } from './tangram-raster.js';
import { clockFields, rand, hash, sin, cos, ease, clamp, dither565 } from '../js/kit.js';

const W = 160, H = 80;
const DEG45 = Math.PI / 4;

// ------------------------------------------------------------ layout
const SLOTS = [{ x: 4, y: 10, c: 10 }, { x: 48, y: 10, c: 10 }, { x: 98, y: 5, c: 7 }, { x: 129, y: 5, c: 7 }];
const CORNER = { x: 98, y: 51, c: 5 };

// ------------------------------------------------------------ layouts (flash tables)
const LAY_D = {};
for (const d of Object.keys(DIGITS)) LAY_D[d] = solveMask(DIGITS[d], -1);
const LAY_F = {};
for (const k of FIG_ORDER) {
  const rows = FIGURES[k], fw = Math.max(...rows.map((r) => r.length)), fh = rows.length;
  const dx = (4 - fw) / 2, dy = (6 - fh) / 2;
  LAY_F[k] = solveMask(rows, -1).map((p) => ({ ...p, x: p.x + dx, y: p.y + dy, alt: p.alt && { ...p.alt, x: p.alt.x + dx, y: p.alt.y + dy } }));
}
// the rest of the puzzle: each set packed in its square, stacked in the slot
const SQ_S = 2 * Math.SQRT2, SQ_GAP = 0.22;
const LAY_Q = [];
for (let set = 0; set < 2; set++) {
  const ox = (4 - SQ_S) / 2, oy = (6 - 2 * SQ_S - SQ_GAP) / 2 + set * (SQ_S + SQ_GAP);
  for (const p of packedSquare(0)) LAY_Q.push({ ...p, set, x: p.x + ox, y: p.y + oy, alt: p.alt && { ...p.alt, x: p.alt.x + ox, y: p.alt.y + oy } });
}

// the corner puzzle: one plain set, its packed square and the minute's problem
const PZ_Q = packedSquare(0).map((p) => ({ ...p, x: p.x + 0.6, y: p.y + 1.15 }));
const PZ_F = {};
for (const k of PROBLEM_ORDER) PZ_F[k] = solveMask(PROBLEMS[k], -1, { sets: 1 }).map((p) => ({ ...p, x: p.x + 6.1, y: p.y + 0.55, alt: p.alt && { ...p.alt, x: p.alt.x + 6.1, y: p.alt.y + 0.55 } }));
const PZ_ORDER = [0, 1, 2, 6, 3, 4, 5];   // the solver places the big pieces first
const WOOD = [0xc8955a, 0xb98549, 0xd4a76c, 0xc08c50, 0xd9b07a, 0xb07a42, 0xcd9e62].map((v) => [(v >> 16) & 255, (v >> 8) & 255, v & 255]);
const WOOD_N = WOOD.map(([r, g, b]) => [(r * 0.62) | 0, (g * 0.6) | 0, (b * 0.66) | 0]);
const INK = [196, 182, 156], INK_N = [58, 66, 108];

// flip axes (local): the pieces' mirror axes, so a piece turned over in place keeps its footprint
const AXIS = { BT: [Math.SQRT1_2, Math.SQRT1_2], ST: [Math.SQRT1_2, Math.SQRT1_2], MT: [0, 1], SQ: [0, 1], PG: [1, 0] };
const PERIOD = {};
for (const k of Object.keys(SYM)) PERIOD[k] = SYM[k] * DEG45;

/** The path of one piece from transform A to transform B: the end keeps A's mirror; a chirality change is a flat flip (s to -1). */
function legPlan(type, A, B) {
  let Bt = B.mir === A.mir ? B : B.alt && B.alt.mir === A.mir ? B.alt : null;
  const th0 = A.ang * DEG45;
  let th1, s1 = 1;
  if (Bt) th1 = Bt.ang * DEG45;
  else {
    // R(th1) = R(angB) M(mirB) Ref_a M(mirA)
    const [ax, ay] = AXIS[type];
    let m = [[ax * ax - ay * ay, 2 * ax * ay], [2 * ax * ay, ay * ay - ax * ax]];
    const M = (mm, on) => (on ? [[-mm[0][0], -mm[0][1]], [mm[1][0], mm[1][1]]] : mm);          // M * mm
    const Mr = (mm, on) => (on ? [[-mm[0][0], mm[0][1]], [-mm[1][0], mm[1][1]]] : mm);         // mm * M
    m = M(Mr(m, A.mir), B.mir);
    const a = B.ang * DEG45, c = Math.cos(a), s = Math.sin(a);
    const r = [[c * m[0][0] - s * m[1][0], c * m[0][1] - s * m[1][1]], [s * m[0][0] + c * m[1][0], s * m[0][1] + c * m[1][1]]];
    th1 = Math.atan2(r[1][0], r[0][0]);
    s1 = -1;
    Bt = B;
  }
  const P = PERIOD[type];
  th1 += Math.round((th0 - th1) / P) * P;
  return { x0: A.x, y0: A.y, x1: B.x, y1: B.y, th0, th1, mir: A.mir, s1 };
}

// ------------------------------------------------------------ colour
const hx = (v) => [(v >> 16) & 255, (v >> 8) & 255, v & 255];
const mk = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, hx(v)]));
const PALS = [
  // imperial: vermilion, lapis and gold, as on a manuscript page
  mk({ BTa: 0xcc3624, BTb: 0x23409a, MT: 0xc8901e, PG: 0x2f5cb0, STa: 0xdc5a34, STb: 0x182a6a, SQ: 0xd0a030 }),
  // cinnabar lacquer
  mk({ BTa: 0xcc3424, BTb: 0x861a28, MT: 0xd47a1c, PG: 0xb0502a, STa: 0xdc5a40, STb: 0x5a1a34, SQ: 0xc8902a }),
  // blue-and-white porcelain (the white is the paper)
  mk({ BTa: 0x2a56b0, BTb: 0x182c70, MT: 0x3470bc, PG: 0x22708a, STa: 0x3f80c8, STb: 0x33307e, SQ: 0x4a62b4 }),
  // jade
  mk({ BTa: 0x23845a, BTb: 0x145040, MT: 0x4a983a, PG: 0x247480, STa: 0x5a9e3e, STb: 0x1e3c3a, SQ: 0xc0a030 }),
];
const palOf = (h) => h % PALS.length;
// night: the moonlight set, pale pieces on indigo paper
const MOON = mk({ BTa: 0xeadcb4, BTb: 0x86aede, MT: 0xe2bc62, PG: 0x96cca8, STa: 0xec9c8c, STb: 0xb4a4dc, SQ: 0xf2e8cc });
const lerp3 = (a, b, u) => [(a[0] + (b[0] - a[0]) * u) | 0, (a[1] + (b[1] - a[1]) * u) | 0, (a[2] + (b[2] - a[2]) * u) | 0];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

// ------------------------------------------------------------ the ground: paper (flash, 25.6 KB)
const PAPER = new Uint16Array(W * H), NIGHT = new Uint16Array(W * H);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const n = (rand(x, y, 7) - 0.5) * 7 + (rand(x >> 3, y, 8) - 0.5) * 4;
    PAPER[y * W + x] = dither565(236 + n, 226 + n, 204 + n * 0.9, x, y);
    NIGHT[y * W + x] = dither565(30 + n * 0.6, 36 + n * 0.6, 70 + n, x, y);
  }

// ------------------------------------------------------------ timing
const MIN = { out: -1.3, stag: 0.3, dur: 0.85, inn: 0.1 };
const HR = { out: -1.0, stag: 0.15, dur: 0.6, inn: 0.3 };      // the hour digit that turns into a figure
const FAST = { out: -0.72, stag: 0.1, dur: 0.55, inn: 0.03 };   // the other digits at the hour: brisk, so the time is never gone long
const FRONT = { dur: 3.0, w: 18 };

// per-frame scratch
const xs = new Float64Array(4), ys = new Float64Array(4);

function drawPiece(g, S, type, x, y, th, mir, s, rgb, gl, back, inset = 0.45, alpha = 1) {
  const L = LOCAL[type], [ax, ay] = AXIS[type], c = cos(th), sn = sin(th);
  for (let i = 0; i < L.length; i++) {
    const lx = L[i][0], ly = L[i][1];
    const p = lx * ax + ly * ay, q = -lx * ay + ly * ax;
    let fx = p * ax - s * q * ay;
    const fy = p * ay + s * q * ax;
    if (mir) fx = -fx;
    xs[i] = S.x + (x + c * fx - sn * fy) * S.c;
    ys[i] = S.y + (y + sn * fx + c * fy) * S.c;
  }
  let [r, gg, b] = rgb;
  if (back) { r = (r * 0.72) | 0; gg = (gg * 0.72) | 0; b = (b * 0.72) | 0; }
  fillPiece(g, xs, ys, L.length, r, gg, b, inset, back ? null : gl, alpha);
}

// ------------------------------------------------------------ the corner puzzle
function puzzle(g, f, sec, nt) {
  const inkC = nt > 0 ? lerp3(INK, INK_N, nt) : INK;
  // which problem is on the page, and how firmly it is printed
  const prob = PZ_F[PROBLEM_ORDER[f.minuteKey % PROBLEM_ORDER.length]];
  const ink = clamp(sec / 1.2, 0, 1) * (1 - clamp((sec - 58.6) / 1.0, 0, 1));
  if (ink > 0) for (const P of prob) {
    const type = P.key.slice(0, 2);
    drawPiece(g, CORNER, type, P.x, P.y, P.ang * DEG45, P.mir, 1, inkC, null, false, -0.35, ink);
  }
  // solved: the reader stamps the page with a seal where the box stood
  const seal = clamp((sec - 51.2) / 0.12, 0, 1) * (1 - clamp((sec - 58.6) / 1.0, 0, 1));
  if (seal > 0) {
    const a = seal * (1 - 0.25 * nt), red = nt > 0.5 ? 0xb85848 : 0xc0362a;
    const press = 1 - seal;   // lands a touch large, settles to size
    const sx = 103 - press, sy = 60 - press, sz = 9 + 2 * press;
    g.fillRect(sx, sy, sz, sz, red, { a });
    g.rect(sx + 1, sy + 1, sz - 2, sz - 2, nt > 0.5 ? 0x24284a : 0xf4e8d0, { a: a * 0.9 });
    // the seal's glyph: a small square set on its corner, the puzzle's own sign
    g.fillPolygon([[sx + sz / 2, sy + 2.5], [sx + sz - 2.5, sy + sz / 2], [sx + sz / 2, sy + sz - 2.5], [sx + 2.5, sy + sz / 2]], nt > 0.5 ? 0x24284a : 0xf4e8d0, { a: a * 0.9 });
  }
  for (let j = 0; j < 7; j++) {
    const i = PZ_ORDER[j], Q = PZ_Q[i], F = prob[i], type = Q.key.slice(0, 2);
    // out of the box one by one over the minute, back into it at the turn
    const t0 = 3 + j * 7.6, uIn = clamp((sec - t0) / 1.8, 0, 1);
    const uBack = clamp((sec - 58.5 - j * 0.12) / 0.9, 0, 1);
    let plan, e;
    if (uBack > 0) { plan = legPlan(type, F, Q); e = ease.inOutCubic(uBack); }
    else { plan = legPlan(type, Q, F); e = ease.inOutCubic(uIn); }
    const dx = plan.x1 - plan.x0, dy = plan.y1 - plan.y0, dl = Math.sqrt(dx * dx + dy * dy) || 1;
    const arc = -0.8 * sin(Math.PI * e);
    const x = plan.x0 + dx * e - (dy / dl) * arc, y = plan.y0 + dy * e + (dx / dl) * arc;
    const th = plan.th0 + (plan.th1 - plan.th0) * e, s = plan.s1 < 0 ? cos(Math.PI * e) : 1;
    drawPiece(g, CORNER, type, x, y, th, plan.mir, s, nt > 0 ? lerp3(WOOD[i], WOOD_N[i], nt) : WOOD[i], null, s < 0);
  }
}

export default {
  name: 'Tangram',
  blurb: 'A tangram puzzle book: every numeral is two sets of the seven pieces; at the minute they pack into squares and re-form, at the hour a digit becomes a cat or a boat.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, sec = f.sec, nt = ctx.night;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    if (nt <= 0) g.buf.set(PAPER);
    else if (nt >= 1) g.buf.set(NIGHT);
    else {
      // over the fade minute the indigo dissolves in through an ordered pattern
      const buf = g.buf;
      for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) buf[i] = nt > BAYER[((y & 3) << 2) | (x & 3)] ? NIGHT[i] : PAPER[i];
      g.cost.box += W * H;
    }
    g.cost.px += W * H;
    // the plate's printed rule
    g.rect(1, 1, W - 2, H - 2, nt > 0.5 ? 0xa08a50 : 0xb8503c, { a: 0.55 });

    // ---- which turn are we in
    let A = f.hh + f.mm, B = A, tau = 99, hour = false, hFrom = f.h, hTo = f.h;
    if (sec >= 58.5) {
      const n = clockFields(new Date(ctx.date.getTime() + 60000));
      B = n.hh + n.mm; tau = sec - 60; hour = n.h !== f.h; hTo = n.h;
    } else if (sec < 3.5) {
      const p = clockFields(new Date(ctx.date.getTime() - 60000));
      A = p.hh + p.mm; tau = sec; hour = p.h !== f.h; hFrom = p.h;
    }
    
    const palA = PALS[palOf(hFrom)], palB = PALS[palOf(hTo)];
    const frontX = hour && tau >= 0 ? -30 + (tau / FRONT.dur) * 230 : -1e9;

    // ---- the glint: a soft diagonal band of lighter lacquer, every 9 s
    const tt = (f.minuteKey % 1440) * 60 + sec;
    const gp = (tt % 9) / 3.6;
    const gl = gp < 1 ? { k: 1, pos: -20 + gp * 280, w: 7, amt: 0.38, lr: 255, lg: 250, lb: 236 } : null;

    // ---- an idle twirl: one piece turned over and back, every 7 s
    const tw = Math.floor(tt / 3.5), twu = (tt - tw * 3.5 - 0.6) / 1.0;
    const twSlot = hash(tw, 1) % 4, twIdx = hash(tw, 2) % 14;
    const twOk = sec - (tt - tw * 3.5) + 0.6 >= 3.6 && sec - (tt - tw * 3.5) + 1.6 <= 58.4;
    // ---- and a nudge: a piece slides a pixel out of its place and settles back
    const nd = Math.floor(tt / 2.3), ndu = (tt - nd * 2.3) / 1.5;
    const ndSlot = hash(nd, 3) % 4, ndIdx = hash(nd, 4) % 14;
    const ndOk = sec - (tt - nd * 2.3) >= 3.6 && sec - (tt - nd * 2.3) + 1.5 <= 58.4;

    for (let k = 0; k < 4; k++) {
      const S = SLOTS[k];
      const changing = A[k] !== B[k] && tau < 2;
      const fig = hour && k === 1 ? LAY_F[FIG_ORDER[hTo % FIG_ORDER.length]] : null;
      const L0 = LAY_D[A[k]], L2 = LAY_D[B[k]], L1 = fig ?? LAY_Q, T = fig ? HR : hour ? FAST : MIN, viaFig = !!fig;
      for (let i = 0; i < 14; i++) {
        const P = L0[i], type = P.key.slice(0, 2);
        let x, y, th, mir, s = 1, bw = 1;
        if (changing) {
          const st = rand(f.minuteKey + (tau < 0 ? 1 : 0), k * 14 + i, 5) * T.stag;
          let u, plan;
          if (tau < T.inn - 0.05 && (tau < 0 || viaFig)) {
            plan = legPlan(type, P, L1[i]);
            u = clamp((tau - T.out - st) / T.dur, 0, 1);
          } else {
            plan = legPlan(type, L1[i], L2[i]);
            u = clamp((tau - T.inn - st) / T.dur, 0, 1);
          }
          const e = ease.inOutCubic(u);
          bw = plan === null ? 1 : tau < T.inn - 0.05 && (tau < 0 || viaFig) ? 1 - e : e;
          const dx = plan.x1 - plan.x0, dy = plan.y1 - plan.y0, dl = Math.sqrt(dx * dx + dy * dy) || 1;
          const arc = (rand(k, i, 9) - 0.5) * 1.4 * sin(Math.PI * e);
          x = plan.x0 + dx * e - (dy / dl) * arc; y = plan.y0 + dy * e + (dx / dl) * arc;
          th = plan.th0 + (plan.th1 - plan.th0) * e; mir = plan.mir;
          s = plan.s1 < 0 ? cos(Math.PI * e) : 1;
          if (viaFig && tau > -0.2 && tau < T.inn + 0.1) y -= 0.3 * Math.max(0, sin(Math.PI * clamp((tau + 0.15) / 0.5, 0, 1)));
        } else {
          const R = A[k] !== B[k] && tau >= 0 ? L2[i] : P;
          x = R.x; y = R.y; th = R.ang * DEG45; mir = R.mir;
          if (k === twSlot && i === twIdx && twu > 0 && twu < 1 && twOk) s = cos(2 * Math.PI * twu);
        }
        if (bw > 0) {
          // breathing: each piece eases a fraction of a pixel out from the digit's centre and back
          // (around its place in the digit, faded out while it travels)
          const R = changing ? (tau < 0 || (viaFig && tau < T.inn - 0.05) ? P : L2[i]) : A[k] !== B[k] && tau >= 0 ? L2[i] : P;
          const bx = R.x - 2, by = R.y - 3, bl = Math.sqrt(bx * bx + by * by) || 1;
          let br = (0.3 / S.c) * (0.5 + 0.5 * sin(tt * 1.6 + i * 0.9 + k * 1.7));
          if (k === ndSlot && i === ndIdx && ndu < 1 && ndOk) br += (1.3 / S.c) * sin(Math.PI * ndu) * (1 - 0.35 * ndu);
          x += (bx / bl) * br * bw; y += (by / bl) * br * bw;
        }
        // colour: the hour front turns the pieces over into the new colourway
        let pal = tau < 0 ? palA : hour ? palA : palB;
        if (hour && tau >= 0) {
          const px = S.x + x * S.c, py = S.y + y * S.c;
          const v = (frontX - (px + 0.5 * py)) / FRONT.w;
          if (v >= 1) pal = palB;
          else if (v > 0) { s *= Math.abs(cos(Math.PI * v)); if (v >= 0.5) pal = palB; }
        }
        const rgb = nt > 0 ? lerp3(pal[P.key], MOON[P.key], nt) : pal[P.key];
        drawPiece(g, S, type, x, y, th, mir, s, rgb, gl, s < 0);
      }
    }
    puzzle(g, f, sec, nt);
  },
};
