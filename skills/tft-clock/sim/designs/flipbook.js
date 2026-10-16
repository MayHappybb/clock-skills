// Flipbook: a little landscape flipbook pad, held by its cloth spine on the
// left and riffled by a thumb at the bottom-right corner. The time is
// written on every page in quick pencil, and the pages are a film.
//
// The rhythm is the riffle, not a beat. Every ten seconds the thumb throws
// the whole block of pages back over the spine (one fat 60 fps page-turn
// running backwards), bends the corner, and lets the pages go: slow single
// turns at first, each a full page curl across the glass, then faster and
// faster until the corner only flicks (twenty pages a second), then slowing
// again until the last page turns over and settles. Each page is a frame
// drawn by hand: the strokes are re-traced on every one, so the lines boil,
// the paper's speckle changes, the drawing sits a pixel off now and then,
// and the page number in the corner counts. The turning page shows its own
// pencil mirrored through the paper.
//
// The film. Every riffle one numeral turns into the doodle hidden in it
// (flipbook-glyphs.js: 0 fish, 1 rocket, 2 swan, 3 bird, 4 sailboat,
// 5 snake, 6 snail, 7 boomerang, 8 snowman, 9 balloon): its extra marks draw
// themselves on, frame by frame, it does its little act, and the marks are
// rubbed out again. The numeral's own stroke never leaves, so the time reads
// throughout. At :45 all four do it at once.
// Minute turn (the riffle from :55): each changing numeral becomes its
// doodle and leaves the page its own way (the rocket launches, the swan swims
// off, the balloon floats up) and is gone by :59.6; after :00 the new
// numeral's doodle arrives (the balloon rises from below, the boomerang
// spins in), settles in its place and sheds its marks. Hour: every numeral
// leaves, the last page before :00 says THE END, and four new doodles arrive.
//
// Palette: cream flipbook paper, graphite, and six coloured pencils (red,
// orange, blue, sky, green, brown) for the doodles only; the cloth spine in
// oxblood, the thumb in two skin tones. Hard pixels throughout, as a pencil
// leaves them; only the thumb is anti-aliased.

import { clockFields, sin, cos, rand, ease, clamp, font3x5 } from '../js/kit.js';
import { Pen, clipHalf, mirror, shiftPoly } from './flipbook-pencil.js';
import { DIGITS, DOODLES, LETTERS, INK } from './flipbook-glyphs.js';

const XB = 8, PR = 160, PB = 77;                  // page: spine at x = 8, bottom edge at 77
const RECT = [[XB, 0], [PR, 0], [PR, PB], [XB, PB]];
const PAPER = 0xf1e8d3, BACK = 0xe2d6bc, EDGE = 0xcdbf9f, SPINE = 0x7e2a24;

const REW = 0.55;                // the block thrown back
const R0 = 0.9, D = 8.0, N = 44, A = 0.7;   // riffle start, length, pages, speed swing
const SLOT_X = [14, 41, 82, 109], SLOT_Y = [12, 12, 14, 14], SLOT_W = 24, SLOT_H = [42, 42, 40, 40];
const SL = 0.12;                 // handwriting slant

// ------------------------------------------------------------ the riffle schedule

const gsched = (x) => x + (A * sin(2 * Math.PI * x)) / (2 * Math.PI);
/** When flip k of a cycle starts, seconds after the cycle's start. */
const aOf = (k) => R0 + D * gsched(k / N);
function flipShape(k) {
  const i = k < N - 1 ? aOf(k + 1) - aOf(k) : aOf(k) - aOf(k - 1);
  const slow = clamp((i - 0.07) / (0.2 - 0.07), 0, 1);
  const full = slow >= 1;
  return { full, tmax: full ? 1 : 0.13 + 0.3 * slow, dur: full ? Math.max(0.36, 1.2 * i) : 1.15 * i };
}
const SHAPES = Array.from({ length: N }, (_, k) => flipShape(k));
const STARTS = Array.from({ length: N }, (_, k) => aOf(k));

/** The fold of a page peeled from the bottom-right corner by tau (0 flat .. 1 turned over the spine). */
function fold(tau) {
  const cx = PR, cy = PB;
  const px = cx - tau * 2 * (cx - XB), py = cy - 97 * sin(Math.PI * tau);
  let nx = cx - px, ny = cy - py;
  const l = Math.sqrt(nx * nx + ny * ny) || 1;
  nx /= l; ny /= l;
  const mx = (cx + px) / 2, my = (cy + py) / 2;
  return { mx, my, nx, ny, c: nx * mx + ny * my };
}

// ------------------------------------------------------------ the film

const fieldsCache = new Map();
function fieldsAt(sec) {
  let f = fieldsCache.get(sec);
  if (!f) { f = clockFields(new Date(sec * 1000)); fieldsCache.set(sec, f); if (fieldsCache.size > 16) fieldsCache.delete(fieldsCache.keys().next().value); }
  return f;
}
const prog = (v, a, b) => clamp((v - a) / (b - a), 0, 1);

/** What the page drawn at absolute time c shows. */
function film(c) {
  const n = Math.floor((c - 5) / 10), T0 = n * 10 + 5, v = c - T0;
  const fo = fieldsAt(T0), fnw = fieldsAt(T0 + 5);
  const turn = fo.m !== fnw.m, hour = turn && fo.h !== fnw.h;
  const od = fo.hh + fo.mm, nd = fnw.hh + fnw.mm;
  const ci = Math.floor((((T0 % 60) + 60) % 60) / 10);   // 0..5: the riffles at :05 .. :55
  const slots = [];
  let end = false;
  for (let i = 0; i < 4; i++) {
    if (turn && (hour || od[i] !== nd[i])) {
      const st = i * 0.12;
      if (v < 4.7) {
        const grow = prog(v, 0.7 + st, 1.8 + st), p = prog(v, 2.0 + st, hour ? 4.1 : 4.5);
        if (p < 1) slots.push({ d: od[i], grow, kind: p > 0 ? 'exit' : 'idle', p, phi: v });
        else slots.push(null);
      } else if (v >= 5.3) {
        const p = prog(v, 5.4 + st, 7.4 + st), grow = 1 - prog(v, 7.6 + st, 8.7 + st);
        slots.push({ d: nd[i], grow, kind: p < 1 ? 'enter' : 'idle', p, phi: v });
      } else slots.push(null);
    } else {
      const feat = !turn && (ci === i || ci === 4);
      const grow = feat ? prog(v, 1.0, 2.3) - prog(v, 6.7, 8.1) : 0;
      slots.push({ d: od[i], grow, kind: 'idle', p: 0, phi: v });
    }
  }
  if (hour && v >= 4.2 && v < 5.0) end = true;
  return { slots, end, ci };
}

// ------------------------------------------------------------ drawing one page

function slotMap(i, s) {
  const x = SLOT_X[i], y = SLOT_Y[i], h = SLOT_H[i], w = SLOT_W;
  const dd = DOODLES[s.d];
  let dx = 0, dy = 0, r = 0;
  if (s.kind === 'idle') { const o = dd.idle(s.phi, s.grow); dx = o.dx; dy = o.dy; r = o.rot; }
  else { const o = dd.move(s.kind, s.p, x, y, w, h); dx = o.dx; dy = o.dy; r = o.rot; }
  const pcx = x + w / 2, pcy = y + h / 2, cr = cos(r), sr = sin(r);
  const still = (u, vv) => [x + (u + SL * (1 - vv)) * w, y + vv * h];
  const moved = r === 0
    ? (u, vv) => [x + (u + SL * (1 - vv)) * w + dx, y + vv * h + dy]
    : (u, vv) => {
      const px = x + (u + SL * (1 - vv)) * w - pcx, py = y + vv * h - pcy;
      return [pcx + px * cr - py * sr + dx, pcy + px * sr + py * cr + dy];
    };
  return { moved, still };
}

function drawPage(g, pen, pageId, c, hp, ghost) {
  const fm = film(c);
  const seed = pageId * 7 + 3;
  const ox = rand(pageId, 1) < 0.25 ? (rand(pageId, 2) < 0.5 ? -1 : 1) : 0;
  const oy = rand(pageId, 3) < 0.2 ? (rand(pageId, 4) < 0.5 ? -1 : 1) : 0;
  pen.hp = hp;
  if (!ghost) {
    // the paper, and this page's speckle
    if (hp) { const poly = clipHalf(RECT, hp[0], hp[1], hp[2], true); if (poly.length > 2) g.fillPolygon(poly, PAPER); }
    else g.fillRect(XB, 0, PR - XB, PB, PAPER);
    pen.k = 1;
    for (let i = 0; i < 26; i++) {
      const sx = XB + 1 + ((rand(pageId, i, 5) * (PR - XB - 2)) | 0), sy = (rand(pageId, i, 6) * (PB - 1)) | 0;
      pen.dab(sx, sy, 0xb8aa8a, 0.5);
    }
  }
  const mk = (f) => (u, v) => { const p = f(u, v); return [p[0] + ox, p[1] + oy]; };

  if (fm.end) {
    const word = 'THE END';
    let x = 34;
    for (const ch of word) {
      for (const st of LETTERS[ch]) pen.stroke(st.map(([u, v]) => [x + u * 9 + (1 - v) * 1.5 + ox, 26 + v * 15 + oy]), INK.graphite, { passes: 2, jit: 0.45, a: 0.85, seed: seed + x, smooth: st.length > 2 });
      x += ch === ' ' ? 8 : 12;
    }
    pen.stroke([[36, 46], [70, 48], [112, 45], [118, 43]], INK.graphite, { passes: 1, jit: 0.4, a: 0.7, seed });
  } else {
    // the colon: two pressed dots
    pen.dot(73.2 + ox, 27.5 + oy + (rand(pageId, 9) - 0.5) * 0.6, 2.1, INK.graphite);
    pen.dot(71.6 + ox, 45.5 + oy + (rand(pageId, 10) - 0.5) * 0.6, 2.1, INK.graphite);
  }

  for (let i = 0; i < 4; i++) {
    const s = fm.slots[i];
    if (!s) continue;
    const m = slotMap(i, s), mv = mk(m.moved), st = mk(m.still);
        for (const stroke of DIGITS[s.d]) pen.stroke(stroke.map(([u, v]) => mv(u, v)), INK.graphite, { passes: 4, jit: 0.45, a: 0.74, seed: seed + i * 31 + stroke.length, smooth: stroke.length > 2, spread: 2.2 });
    if (s.grow > 0) {
      const ex = DOODLES[s.d].extras(s.phi, s.kind, s.p);
      const n = ex.length;
      for (let j = 0; j < n; j++) {
        const part = clamp(s.grow * n - j, 0, 1);
        if (part <= 0) break;
        const it = ex[j], f = it.fixed ? st : mv;
        if (it.d) pen.dot(...f(it.d[0], it.d[1]), it.r, it.c);
        else if (it.h) pen.hatch(it.h.map(([u, v]) => f(u, v)), it.c, { gap: 2, a: 0.62, seed: seed + j, upto: part });
        else pen.stroke(it.p.map(([u, v]) => f(u, v)), it.c, { passes: it.w ?? 2, jit: 0.4, a: 0.8, seed: seed + j * 5, smooth: !it.sharp, upto: part });
      }
    }
  }
  // the page number, in the top corner, as every flipbook has
  const num = String((pageId % 64) + 1);
  let x = 154 - num.length * 4;
  for (const ch of num) {
    const gl = font3x5.glyph(ch);
    for (let j = 0; j < gl.h; j++) for (let k = 0; k < gl.w; k++) if (gl.data[j * gl.w + k] >= 0) { pen.lx = -99; pen.dab(x + k + ox, 3 + j + oy, INK.graphite, 0.55); }
    x += 4;
  }
}

/** A page flap: the back of the peeled part, its shadow, the curl. */
function drawFlap(g, pen, fd, pageId, c, block) {
  const peeled = clipHalf(RECT, fd.nx, fd.ny, fd.c, false);
  if (peeled.length < 3) return;
  const flap = mirror(peeled, fd.mx, fd.my, fd.nx, fd.ny);
  // shade on the page beneath, along the fold
  const band = clipHalf(peeled, fd.nx, fd.ny, fd.c + 4, true);
  if (band.length > 2) g.fillPolygon(band, 0x5a4a30, { a: 0.18 });
  g.fillPolygon(shiftPoly(flap, 1.5, 2), 0x4a3c28, { a: 0.22 });
  if (block) g.fillPolygon(shiftPoly(flap, -1, 1), EDGE);
  g.fillPolygon(flap, BACK);
  // the curl's light along the fold
  const lit = clipHalf(flap, fd.nx, fd.ny, fd.c - 3, false);
  if (lit.length > 2) g.fillPolygon(lit, 0xf6efe0);
  // the graphite of its front, mirrored through the paper
  pen.mir = [fd.mx, fd.my, fd.nx, fd.ny];
  pen.k = 0.22;
  drawPage(g, pen, pageId, c, [fd.nx, fd.ny, fd.c], true);
  pen.mir = null; pen.k = 1;
}

// ------------------------------------------------------------ the pad and the thumb

const NAIL = Array.from({ length: 10 }, (_, i) => [6.2 * Math.cos((i / 10) * Math.PI * 2), 4.6 * Math.sin((i / 10) * Math.PI * 2)]);

function drawPad(g) {
  // the block's edge under the page
  g.fillRect(XB, PB, PR - XB, 3, EDGE);
  for (let x = XB; x < PR; x += 1) if (((x * 7) % 5) < 2) g.pixel(x, PB + 1, 0xb5a682);
  g.fillRect(XB, PB + 2, PR - XB, 1, 0xa89870);
  // the spine's shadow on the page
  g.fillRect(XB, 0, 1, PB, 0x5a4a30, { a: 0.28 });
  g.fillRect(XB + 1, 0, 2, PB, 0x5a4a30, { a: 0.14 });
  g.fillRect(XB + 3, 0, 2, PB, 0x5a4a30, { a: 0.06 });
  // the cloth spine
  g.fillRect(0, 0, XB, 80, SPINE);
  g.fillRect(1, 0, 1, 80, 0x9a3a30);
  g.fillRect(XB - 1, 0, 1, 80, 0x531a16);
  for (let y = 1; y < 80; y += 3) g.pixel(3 + (y % 2), y, 0x6a221d);
  // two staples
  for (const sy of [14, 62]) { g.fillRect(3, sy, 3, 1, 0xc9c9c4); g.fillRect(3, sy + 1, 3, 1, 0x8c8c88); }
}

function drawThumb(g, tx, ty) {
  const ax = 147 + tx, ay = 61 + ty, bx = 176 + tx, by = 96 + ty;
  g.thickLine(ax, ay, bx, by, 25, 0xb5725a, { aa: true });
  g.thickLine(ax + 0.6, ay + 0.4, bx, by, 23, 0xe3a585, { aa: true });
  g.thickLine(ax + 5, ay + 2, bx + 4, by, 9, 0xeeb898, { aa: true, a: 0.6 });
  // the nail, along the thumb's axis
  const ux = 0.64, uy = 0.77, vx = -uy, vy = ux;
  const nail = NAIL.map(([p, q]) => [ax + 3 + ux * (p + 3) + vx * q, ay + 3 + uy * (p + 3) + vy * q]);
  g.fillPolygon(nail, 0xc98e7c, { aa: true });
  g.fillPolygon(shiftPoly(nail.map(([x, y]) => [ax + 3 + (x - ax - 3) * 0.86, ay + 3 + (y - ay - 3) * 0.86]), 0.3, 0.3), 0xf3cfc0, { aa: true });
  g.fillPolygon(nail.slice(6, 9).concat([[ax + 3 + ux * 1, ay + 3 + uy * 1]]), 0xfbe6dc, { aa: true, a: 0.8 });
}



export default {
  name: 'Flipbook',
  blurb: 'A pencil flipbook riffled by a thumb every ten seconds: the time is hand-drawn on every page, and each numeral hides a doodle (2 a swan, 9 a balloon) that comes out, acts, and at the minute leaves the page.',
  fps: 60,
  frame(g, ctx) {
    ctx.lcd.backlight(1 - 0.7 * ctx.night);
    const T = ctx.date.getTime() / 1000;
    const n = Math.floor((T - 5) / 10), T0 = n * 10 + 5, u = T - T0;
    const pen = new Pen(g);
    const pid = (cyc, k) => ((cyc % 1000) + 1000) * 64 + k;
    const content = (cyc, k) => (k === 0 ? cyc * 10 + 5 + REW : cyc * 10 + 5 + STARTS[k - 1]);
    let tx = 0, ty = 0;

    if (u < REW) {
      // the whole block thrown back over: a page turn run backwards
      const tau = 1 - ease.inOutQuad(u / REW);
      drawPage(g, pen, pid(n - 1, N), content(n - 1, N), null, false);
      const fd = fold(tau);
      drawPage(g, pen, pid(n, 0), content(n, 0), [fd.nx, fd.ny, fd.c], false);
      drawFlap(g, pen, fd, pid(n, 0), content(n, 0), true);
      tx = 6 * sin(Math.PI * (u / REW)); ty = -3 * sin(Math.PI * (u / REW));
    } else {
      // which flips have started, which are still in the air
      let started = 0;
      while (started < N && STARTS[started] <= u) started++;
      const flying = [];
      for (let k = Math.max(0, started - 6); k < started; k++) {
        const s = SHAPES[k], e = (u - STARTS[k]) / s.dur;
        if (e < 1) flying.push([k, s.full ? ease.inOutQuad(e) : s.tmax * e * Math.sqrt(e)]);
      }
      drawPage(g, pen, pid(n, started), content(n, started), null, false);
      for (let j = flying.length - 1; j >= 0; j--) {
        const [k, tau] = flying[j];
        const fd = fold(Math.max(0.004, tau));
        drawPage(g, pen, pid(n, k), content(n, k), [fd.nx, fd.ny, fd.c], false);
        drawFlap(g, pen, fd, pid(n, k), content(n, k), false);
      }
      // the thumb: presses, slides down the edge as it lets pages go, lifts at the end
      const r = clamp((u - R0) / D, 0, 1);
      const kick = started > 0 && started < N ? Math.max(0, 1 - (u - STARTS[started - 1]) / 0.08) : 0;
      tx = -1.5 * sin(Math.PI * clamp((u - REW) / 0.4, 0, 1)) + 3 * prog(u, 9.3, 9.9);
      ty = 4 * ease.inOutQuad(r) - 1.2 * kick - 4 * prog(u, 9.3, 9.9);
    }
    drawPad(g);
    drawThumb(g, tx, ty);
  },
};
