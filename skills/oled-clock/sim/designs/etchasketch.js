// Etch A Sketch — the time drawn with two knobs and one unbroken line.
//
// The whole glass is the toy: its case, its two white knobs, and on the
// screen one line that has never been lifted, because the stylus cannot lift.
// Everything follows from that. The numerals are outline block letters, the
// way Etch A Sketch people letter: only horizontals, verticals and 45-degree
// chamfers (one knob, the other, or both at once), each traced once round its
// outline, with a slit cut through the body into every counter and back out.
// They are threaded on one line that runs in from the screen's left edge,
// under the hours on an upper terrace, down a staircase, under the minutes
// along the floor and out to the bottom-right corner, E. Swap the numerals
// for a font and the line no longer joins up.
//
// The seconds are the frame every Etch A Sketch drawing gets: once a minute
// the stylus goes round the screen from E, a twist of the knob a second, and
// closes it just before :00. The knobs turn with every pixel it moves: left
// is x, right is y.
//
// On the minute the case is tapped on its right side: the frame and the
// changed numerals let go of the glass in flakes and fall away as powder,
// starting on the side that was struck. The stylus, still at E, comes back in
// along the floor and draws the new numerals right to left (it can only
// reach them from E), then glides back out over its own line. Old numerals
// only before :00, new ones only after.
//
// On the hour it is turned face down and shaken clean, the way it is really
// erased: the toy flips over about its long axis, shakes, all the powder
// comes off, it flips back blank, and the knobs draw the whole time again
// from the left, hours first.
//
// Pure function of the clock: the drawing is a pixel route from S to E, and
// "how far the stylus has got" is a time. The toy walks a 1 px orbit;
// 23:00-07:00 the panel dims.

import { Gfx, orbit, clamp, ease, noise, previousMinute } from '../js/kit.js';

// ------------------------------------------------------------ glyph masks

/** Octagon (x0,y0)-(x1,y1) with corner chamfers [tl, tr, br, bl] (or one number). */
function oct(x0, y0, x1, y1, c = 0) {
  const [tl, tr, br, bl] = Array.isArray(c) ? c : [c, c, c, c];
  return [
    [x0 + tl, y0], [x1 - tr, y0], [x1, y0 + tr], [x1, y1 - br],
    [x1 - br, y1], [x0 + bl, y1], [x0, y1 - bl], [x0, y0 + tl],
  ];
}

/**
 * The ten numerals as solid block shapes: only horizontals, verticals and
 * 45-degree chamfers, the three strokes two knobs make. Each is a list of
 * [polygon, colour] painted in order onto a W x H mask.
 */
function shapes(d, s) {
  const { W, H, T, C } = s;
  const ci = Math.max(1, Math.round(C - 0.586 * T));   // inner chamfer: keeps the diagonal T thick
  const ym = Math.floor((H - T) / 2);                   // top of the middle bar
  const D = Math.round(T * Math.SQRT2);                 // a 45-degree band's (x+y) width
  const band = (k, ya, yb) => [[k - ya, ya], [k - yb, yb], [k - D - yb, yb], [k - D - ya, ya]];
  switch (d) {
    case 0: return [[oct(0, 0, W, H, C), 1], [oct(T, T, W - T, H - T, ci), 0]];
    case 1: {
      const a = Math.round((W - T) / 2) + 1;
      return [
        [oct(a, 0, a + T, H, 0), 1],
        [[[a - s.F, s.F], [a + 1, 0], [a + 1, D], [a - s.F, s.F + D]], 1],
        [oct(a - s.foot, H - T + 1, a + T + s.foot, H, 0), 1],
      ];
    }
    case 2: return [
      [oct(0, 0, W, ym + 1, [C, C, 0, 0]), 1],
      [oct(T, T, W - T, ym + 2, [ci, ci, 0, 0]), 0],
      [oct(0, T + s.hook, T, ym + 2, 0), 0],
      [band(W + ym, ym - 2, H - T + 1), 1],
      [oct(0, H - T, W, H, 0), 1],
    ];
    case 3: return [
      [oct(0, 0, W, H, [0, C, C, 0]), 1],
      [oct(-1, T, W - T, ym, [0, ci, ci, 0]), 0],
      [oct(-1, ym + T, W - T, H - T, [0, ci, ci, 0]), 0],
      [oct(-1, ym - 1, s.mid, ym + T + 1, 0), 0],
      [[[W + 1, ym], [W - s.notch, ym + T / 2], [W + 1, ym + T]], 0],
    ];
    case 4: {
      const st = W - T - s.stem, cb = H - T - s.cross;
      return [
        [[[st, 0], [st + T, 0], [st + T, cb], [W, cb], [W, cb + T], [st + T, cb + T], [st + T, H],
          [st, H], [st, cb + T], [0, cb + T], [0, st]], 1],
        [[[st, D], [st, cb], [T, cb], [T, st + D - T]], 0],
      ];
    }
    case 5: return [
      [oct(0, 0, W, T, 0), 1],
      [oct(0, 0, T, ym + T, 0), 1],
      [oct(0, ym, W, H, [0, C, C, 0]), 1],
      [oct(-1, ym + T, W - T, H - T, [0, ci, ci, 0]), 0],
    ];
    case 6: return [
      [oct(0, 0, W, H, [C, s.arm, C, C]), 1],
      [oct(T, T, W + 1, ym - s.bowl, 0), 0],
      [oct(W - T, ym - s.bowl, W + 1, ym - s.bowl + 2, 0), 0],
      [oct(T, ym - s.bowl + T, W - T, H - T, Math.min(ci, s.bowlC)), 0],
    ];
    case 7: {
      const a = s.seven, K = T + 1 + W - D;
      return [[[[0, 0], [W, 0], [W, T + 1], [a + T, T + 1 + W - a - T], [a + T, H], [a, H], [a, K - a], [K - T, T], [0, T]], 1]];
    }
    case 8: return [
      [oct(1, 0, W - 1, ym + T, C - 1), 1],
      [oct(0, ym, W, H, C), 1],
      [oct(1 + T, T, W - 1 - T, ym, 1), 0],
      [oct(T, ym + T, W - T, H - T, ci), 0],
    ];
    case 9: return shapes(6, s).map(([p, c]) => [p.map(([x, y]) => [W - x, H - y]), c]);
  }
  return [];
}

export const SIZES = {
  hour: { W: 20, H: 30, T: 5, C: 6, F: 5, foot: 5, hook: 3, mid: 4, notch: 3, stem: 2, cross: 6, arm: 2, seven: 6, bowl: 2, bowlC: 3 },
  minute: { W: 16, H: 24, T: 4, C: 5, F: 4, foot: 4, hook: 2, mid: 3, notch: 2, stem: 2, cross: 5, arm: 2, seven: 5, bowl: 1, bowlC: 2 },
};

export function glyphMask(d, s) {
  const g = new Gfx(s.W, s.H);
  for (const [p, c] of shapes(d, s)) g.fillPolygon(p, c);
  return g.buf;
}

// ------------------------------------------------------------ outlines

/**
 * Follow the cracks between lit and unlit pixels of a mask. Returns closed
 * loops as chains of the lit pixels just inside the crack, with the signed
 * area: outer contours run clockwise on screen (area > 0), holes the other way.
 */
function traceLoops(m, W, H) {
  const inM = (x, y) => x >= 0 && y >= 0 && x < W && y < H && m[y * W + x];
  const VW = W + 1;
  const out = new Map();
  const add = (ax, ay, bx, by, px, py) => {
    const k = ay * VW + ax;
    if (!out.has(k)) out.set(k, []);
    out.get(k).push({ ax, ay, bx, by, px, py, used: false });
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!inM(x, y)) continue;
      if (!inM(x, y - 1)) add(x, y, x + 1, y, x, y);
      if (!inM(x + 1, y)) add(x + 1, y, x + 1, y + 1, x, y);
      if (!inM(x, y + 1)) add(x + 1, y + 1, x, y + 1, x, y);
      if (!inM(x - 1, y)) add(x, y + 1, x, y, x, y);
    }
  const loops = [];
  for (const list of out.values())
    for (const e0 of list) {
      if (e0.used) continue;
      const chain = [];
      let area = 0, e = e0;
      while (e && !e.used) {
        e.used = true;
        area += e.ax * e.by - e.bx * e.ay;
        const last = chain[chain.length - 1];
        if (!last || last[0] !== e.px || last[1] !== e.py) chain.push([e.px, e.py]);
        const dx = e.bx - e.ax, dy = e.by - e.ay;
        const cand = (out.get(e.by * VW + e.bx) || []).filter((n) => !n.used);
        // At a pinch, turn right first: keeps diagonal neighbours apart.
        const rank = (n) => {
          const ndx = n.bx - n.ax, ndy = n.by - n.ay;
          if (ndx === -dy && ndy === dx) return 0;
          if (ndx === dx && ndy === dy) return 1;
          return 2;
        };
        cand.sort((a, b) => rank(a) - rank(b));
        e = cand[0];
      }
      if (chain.length > 1 && chain[0][0] === chain[chain.length - 1][0] && chain[0][1] === chain[chain.length - 1][1]) chain.pop();
      loops.push({ chain, area });
    }
  return loops;
}

/**
 * One numeral as a single stylus route, in its box: it comes in along the
 * baseline at the bottom-left corner, goes once round the outline (up the
 * left, over, down the right, back along the foot), cuts a slit into each
 * counter and round it and back out, runs back along the foot and leaves at
 * the bottom-right corner. Pixels may repeat: a retraced line stays one line.
 */
function buildRoute(d, s) {
  const { W, H } = s;
  const m = glyphMask(d, s);
  const loops = traceLoops(m, W, H);
  const outer = loops.filter((l) => l.area > 0).sort((a, b) => b.chain.length - a.chain.length)[0].chain;
  const holes = loops.filter((l) => l.area < 0).map((l) => l.chain);
  const base = H - 1;
  // Start the loop at its bottom-left pixel.
  let i0 = -1;
  outer.forEach(([x, y], i) => { if (y === base && (i0 < 0 || x < outer[i0][0])) i0 = i; });
  const loop = [...outer.slice(i0), ...outer.slice(0, i0)];
  let route = [];
  for (let x = 0; x < loop[0][0]; x++) route.push([x, base]);
  route.push(...loop, loop[0]);
  // Counters: slit straight down to something already drawn, lowest first.
  const key = (x, y) => y * 64 + x;
  holes.sort((a, b) => Math.max(...b.map((p) => p[1])) - Math.max(...a.map((p) => p[1])));
  for (const hole of holes) {
    const drawn = new Set(route.map(([x, y]) => key(x, y)));
    let best = null;
    for (let j = 0; j < hole.length; j++) {
      const [hx, hy] = hole[j];
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        let x = hx + dx, y = hy + dy, n = 0;
        while (x >= 0 && y >= 0 && x < W && y < H && m[y * W + x] && !drawn.has(key(x, y))) { x += dx; y += dy; n++; }
        if (!(x >= 0 && y >= 0 && x < W && y < H) || !drawn.has(key(x, y))) continue;
        const score = n + (dy === 1 ? 0 : 3) + Math.abs(hx - W / 2) * 0.05;
        if (!best || score < best.score) best = { score, j, dx, dy, n, ax: x, ay: y };
      }
    }
    const { j, dx, dy, n, ax, ay } = best;
    const slit = [];
    for (let k = n; k >= 1; k--) slit.push([hole[j][0] + dx * k, hole[j][1] + dy * k]);
    const ring = [...hole.slice(j), ...hole.slice(0, j), hole[j]];
    const detour = [...slit, ...ring, ...slit.slice().reverse(), [ax, ay]];
    const at = route.findIndex(([x, y]) => x === ax && y === ay);
    route.splice(at + 1, 0, ...detour);
  }
  // Back along the foot to its right end, then out to the corner.
  // The loop ends coming leftwards along the foot, so walk it backwards.
  let i = loop.length;
  while (i - 1 > 0 && loop[i - 1][1] === base && loop[i - 1][0] > route[route.length - 1][0]) route.push(loop[--i]);
  for (let x = route[route.length - 1][0] + 1; x < W; x++) route.push([x, base]);
  return route;
}

export const ROUTES = {};
for (const k of Object.keys(SIZES)) ROUTES[k] = Array.from({ length: 10 }, (_, d) => buildRoute(d, SIZES[k]));

// ------------------------------------------------------------ the sheet

const LAP = { x0: 5, y0: 3, x1: 122, y1: 48 };   // the frame the seconds draw
const HB = 36, MB = LAP.y1;                       // hour and minute baselines
const SLOTS = [{ x: 12, k: 'hour' }, { x: 36, k: 'hour' }, { x: 76, k: 'minute' }, { x: 96, k: 'minute' }];
const KNOBS = [[12.5, 55.5], [115.5, 55.5]];
const KNOB_R = 6.2;

const run = (x0, x1, y) => { const o = []; for (let x = x0; x <= x1; x++) o.push([x, y]); return o; };
const col = (x, y0, y1) => { const o = [], s = y1 >= y0 ? 1 : -1; for (let y = y0; y !== y1 + s; y += s) o.push([x, y]); return o; };
const rev = (a) => a.slice().reverse();

const LEAD = run(LAP.x0, SLOTS[0].x - 1, HB);              // from S, on the frame's left side
const C12 = run(SLOTS[0].x + 20, SLOTS[1].x - 1, HB);
const STAIRS = (() => {                                    // the staircase down to the minutes
  const o = [], n = 4, x0 = SLOTS[1].x + 20, w = Math.floor((SLOTS[2].x - x0) / (n + 1));
  let x = x0, y = HB;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < w; k++) o.push([x++, y]);
    const y1 = HB + Math.round(((i + 1) * (MB - HB)) / n);
    while (y < y1) o.push([x, ++y]);
    x++;
  }
  while (x < SLOTS[2].x) o.push([x++, y]);
  return o;
})();
const C34 = run(SLOTS[2].x + 16, SLOTS[3].x - 1, MB);
const TAIL = run(SLOTS[3].x + 16, LAP.x1, MB);             // to E, on the frame's right side
const E = [LAP.x1, MB];

// The frame, from E clockwise: back along the foot, up the left, over the top, down to E.
const LAP_ROUTE = [
  ...run(LAP.x0, LAP.x1, LAP.y1).reverse(), ...col(LAP.x0, LAP.y1 - 1, LAP.y0),
  ...run(LAP.x0 + 1, LAP.x1, LAP.y0), ...col(LAP.x1, LAP.y0 + 1, LAP.y1),
];

const digitsOf = (f) => [Math.floor(f.h / 10), f.h % 10, Math.floor(f.m / 10), f.m % 10];

const sheetCache = new Map();
/** The whole drawing for a time as its nine segments, in stylus order from S to E. */
function sheet(dg) {
  const key = dg.join('');
  let s = sheetCache.get(key);
  if (s) return s;
  const glyph = (i) => {
    const { x, k } = SLOTS[i], sz = SIZES[k], y0 = (i < 2 ? HB : MB) - sz.H + 1;
    return ROUTES[k][dg[i]].map(([px, py]) => [x + px, y0 + py]);
  };
  s = { glyphs: [0, 1, 2, 3].map(glyph) };
  s.segs = [LEAD, s.glyphs[0], C12, s.glyphs[1], STAIRS, s.glyphs[2], C34, s.glyphs[3], TAIL];
  s.all = s.segs.flat();
  if (sheetCache.size > 8) sheetCache.clear();
  sheetCache.set(key, s);
  return s;
}

/** Position `idx` (fractional) along a pixel route. */
function along(route, idx) {
  const i = clamp(Math.floor(idx), 0, route.length - 1), j = Math.min(route.length - 1, i + 1), u = clamp(idx - i, 0, 1);
  return [route[i][0] + (route[j][0] - route[i][0]) * u, route[i][1] + (route[j][1] - route[i][1]) * u];
}

const hash = (x, y, k, n) => noise(x * 0.37 + y * 13.1 + n * 101.7, k % 9973);

// ------------------------------------------------------------ the minute

/**
 * Everything about the toy at this instant: what is drawn, where the stylus
 * is, which old pixels are crumbling and how the toy is being moved.
 */
const LAP_T1 = 59.4;     // the frame closes here, and the stylus rests at E

/** How the case is being moved at `s` seconds into the minute: [dx, dy, sy]. */
function handling(hourTurn, s) {
  if (!hourTurn) {
    // A sharp tap on the side: a decaying jolt.
    if (s >= 0.9) return [0, 0, 1];
    const a = Math.exp(-4.5 * s);
    return [Math.round(2.6 * a * Math.sin(2 * Math.PI * 6.5 * s)), Math.round(0.9 * a * Math.sin(2 * Math.PI * 9 * s + 1)), 1];
  }
  // Turned face down, shaken hard, turned back.
  const fl = s < 0.7 ? ease.inOutCubic(s / 0.7) : s < 1.9 ? 1 : s < 2.5 ? 1 + ease.inOutCubic((s - 1.9) / 0.6) : 2;
  let dx = 0, dy = 0;
  if (s > 0.7 && s < 1.9) {
    const env = Math.sin((Math.PI * (s - 0.7)) / 1.2);
    dx = Math.round(3.2 * env * Math.sin(2 * Math.PI * 7 * s));
    dy = Math.round(2.2 * env * Math.sin(2 * Math.PI * 5.3 * s + 0.7));
  }
  return [dx, dy, Math.cos(Math.PI * fl)];
}

/**
 * Everything about the toy at this instant: what is drawn, where the stylus
 * is, which old pixels are crumbling.
 */
function state(date, f) {
  const sec = f.sec;
  const cur = digitsOf(f), old = digitsOf(previousMinute(date));
  const S0 = sheet(cur), S1 = sheet(old);
  const hourTurn = f.m === 0;
  const st = { hourTurn, lines: [], stylus: E, crumble: [], R0: 0, SPREAD: 0.7, key: f.minuteKey };
  let prog, tD0, D, tL0, glide = null;

  if (!hourTurn) {
    // A tap on the case: the changed numerals and the frame fall away. The
    // stylus comes back in from E along the tail and draws the new numerals
    // right to left, glides back out to E, and starts the frame again.
    const first = cur[2] !== old[2] ? 2 : 3;
    st.lines.push(LEAD, S0.glyphs[0], C12, S0.glyphs[1], STAIRS, C34, TAIL);
    if (first === 3) st.lines.push(S0.glyphs[2]);
    st.crumble = [...S1.glyphs[3], ...(first === 2 ? S1.glyphs[2] : []), ...LAP_ROUTE];
    prog = [...rev(TAIL), ...rev(S0.glyphs[3]), ...(first === 2 ? [...rev(C34), ...rev(S0.glyphs[2])] : [])];
    tD0 = 0.35; D = clamp(prog.length / 105, 1.1, 2.5);
    glide = { t0: tD0 + D + 0.15, d: clamp(prog.length / 260, 0.5, 1.2) };
    tL0 = Math.max(4, glide.t0 + glide.d + 0.2);
  } else {
    // On the hour: face down and shaken clean, then the whole drawing again
    // from S, left to right.
    st.crumble = [...S1.all, ...LAP_ROUTE];
    st.R0 = 0.75; st.SPREAD = 0.85;
    prog = S0.all;
    tD0 = 2.75; D = clamp(prog.length / 190, 2.6, 3.6);
    tL0 = tD0 + D + 0.5;
  }

  // The drawing, as far as the stylus has got.
  const di = (prog.length - 1) * ease.inOutQuad(clamp((sec - tD0) / D, 0, 1));
  if (sec >= tD0) st.lines.push(prog.slice(0, Math.floor(di) + 1));
  // A twist of a knob every second: the frame advances in eased nudges.
  const nudged = Math.floor(sec) + ease.inOutCubic(clamp((sec % 1) / 0.45, 0, 1));
  const li = (LAP_ROUTE.length - 1) * clamp((nudged - tL0) / (LAP_T1 - tL0), 0, 1);
  if (sec >= tL0) st.lines.push(LAP_ROUTE.slice(0, Math.floor(li) + 1));

  // Where the stylus is.
  if (sec < tD0) {
    // Face down, the knobs bring it round to S; the falling powder covers its track.
    if (hourTurn) st.stylus = along([E, LEAD[0]], ease.inOutQuad(clamp((sec - 1.0) / 0.8, 0, 1)));
  } else if (sec < tD0 + D) st.stylus = along(prog, di);
  else if (glide && sec < glide.t0) st.stylus = along(prog, prog.length - 1);
  else if (glide && sec < glide.t0 + glide.d)
    st.stylus = along(prog, (prog.length - 1) * (1 - ease.inOutCubic((sec - glide.t0) / glide.d)));
  else if (sec >= tL0 && sec < LAP_T1) st.stylus = along(LAP_ROUTE, li);
  return st;
}

// ------------------------------------------------------------ drawing

function knob(g, cx, cy, a) {
  // A fat white knob seen from the front: a rim, a cut notch that turns with
  // it, and a pointer from the hub out to the notch.
  g.ring(cx, cy, KNOB_R - 1.6, KNOB_R);
  const [nx, ny] = [Math.sin(a), -Math.cos(a)];
  g.fillWhere((px, py) => {
    const ux = px - cx, uy = py - cy, along = ux * nx + uy * ny;
    return along > KNOB_R - 2.4 && Math.abs(ux * ny - uy * nx) < 1.1;
  }, 0, [cx - KNOB_R - 1, cy - KNOB_R - 1, 2 * KNOB_R + 2, 2 * KNOB_R + 2]);
  g.thickLine(cx, cy, cx + nx * (KNOB_R - 3.2), cy + ny * (KNOB_R - 3.2), 1.6);
}

let toyBuf = null;

export default {
  name: 'Etch A Sketch',
  blurb: 'An Etch A Sketch: two knobs draw the time as one line that never lifts; a tap shakes the changed numeral off as powder and the knobs redraw it; on the hour it is turned over and shaken clean.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, ctx) {
    const { date, fields: f, oled } = ctx;
    const sec = f.sec;
    const st = state(date, f);
    const [ox, oy] = orbit(date, 1);
    const W = g.width, H = g.height, CY = H / 2;
    const [hdx, hdy, fsy] = handling(st.hourTurn, sec);
    const flipping = fsy < 0.999;
    if (flipping) { if (!toyBuf || toyBuf.width !== W) toyBuf = new Gfx(W, H); toyBuf.clear(); }
    const t = flipping ? toyBuf : g;
    const dx = ox + hdx, dy = oy + hdy;
    const P = (x, y) => t.pixel(x + dx, y + dy);

    // The lines that stand.
    const lit = new Set();
    for (const seg of st.lines) for (const [x, y] of seg) { P(x, y); lit.add(y * 256 + x); }
    // The lines that are crumbling: in place until each grain lets go.
    const grains = [];
    for (const [x, y] of st.crumble) {
      const k = y * 256 + x;
      if (lit.has(k)) continue;
      const patch = hash(Math.floor(x / 5), Math.floor(y / 5), st.key, 1);
      // It lets go in flakes, starting on the side the case was struck.
      const side = st.hourTurn ? 1 - y / H : 1 - x / W;
      const r = st.R0 + st.SPREAD * (0.5 * side + 0.32 * patch + 0.18 * hash(x, y, st.key, 2));
      if (sec < r) { P(x, y); lit.add(k); continue; }
      if (hash(x, y, st.key, 3) < 0.45) grains.push([x, y, r]);
    }
    // The stylus and the knobs that move it.
    const [sx, sy] = st.stylus;
    const hx = Math.round(sx), hy = Math.round(sy);
    for (const [ax, ay] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) P(hx + ax, hy + ay);
    t.roundRect(1 + dx, 1 + dy, 126, 62, 7);
    knob(t, KNOBS[0][0] + dx, KNOBS[0][1] + dy, sx * 0.3);
    knob(t, KNOBS[1][0] + dx, KNOBS[1][1] + dy, -sy * 0.3);

    if (flipping) {
      // Turning over about its long axis: the picture squashes through a line.
      if (Math.abs(fsy) < 0.06) g.hline(LAP.x0 - 3 + dx, Math.round(CY), LAP.x1 - LAP.x0 + 7);
      else
        for (let y = 0; y < H; y++) {
          const ys = Math.floor(CY + (y + 0.5 - CY) / fsy);
          if (ys < 0 || ys >= H) continue;
          for (let x = 0; x < W; x++) if (toyBuf.buf[ys * W + x]) g.pixel(x, y);
        }
    }
    // Grains fall in the room, not in the toy: from where the toy put them.
    for (const [x, y, r] of grains) {
      const tau = sec - r, life = 0.25 + 0.35 * hash(x, y, st.key, 4);
      if (tau > life) continue;
      const [rdx, rdy, rsy] = handling(st.hourTurn, r);
      const x0 = x + ox + rdx, y0 = CY + (y + oy + rdy + 0.5 - CY) * rsy;
      const vx = (hash(x, y, st.key, 5) - 0.5) * 6;
      g.pixel(x0 + vx * tau, y0 + 4 * tau + 0.5 * 140 * tau * tau);
    }

    oled.contrast(Math.round(0xcf + (0x14 - 0xcf) * ctx.night));
  },
};
