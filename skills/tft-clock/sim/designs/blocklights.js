// Block Lights: the glass is a street at night seen from a window across
// the road, and the time is who has their lights on. The tall tower on the
// left spells the hours in lit flats, the low block down the street spells
// the minutes; nothing else on either facade is lit near them, so the
// numerals are the light pattern of two buildings, the way people spell
// hearts and scores in hotel windows. The numerals are drawn on the window
// grid itself (blocklights-glyphs.js): 7 flats wide, 10 floors tall, stems
// two windows thick.
//
// Always alive ("Rear Window"): behind the lit glass people walk from room
// to room (navy silhouettes crossing window after window, vanishing into
// the dark flats at each end), someone dances, a cat walks the sill, a
// curtain is drawn halfway and opened again; flats on the other floors come
// on and go off behind net curtains and half-drawn blinds, a TV flickers;
// the lift car rides the core between the blocks; cars pass with their
// headlights on the road; now and then a plane's strobe crosses the sky.
//
// Minute: from :58.5 the residents of the changing numerals go to bed,
// flat by flat, evenly across the numeral (an ordered order at the scale of
// the windows): in each window the curtains close from both sides to a slit
// of light, then the lamp goes; the flats are dark by :59.7. After :00 the new residents come
// home: lamps switch on across the new numeral in the same even order and
// curtains open from the middle of each window; whole by :01.3.
//
// Hour: the new hour shows for a second, then a power cut takes the whole
// street dark (numerals too, about 0.6 s); the power comes back and every
// flat on both blocks switches on except the numerals' own: the time is
// spelled for seven seconds in DARK windows on two slabs of light, a party
// guest dancing in every fourth window, shells bursting in 1-bit sparks over
// the low roof. Then the block switches off, evenly, and the numerals' flats
// come back on (dark between the two for under a second).
//
// Colour: one ink and one ground, like a mono module: lamp-light yellow
// #ffd23c on night navy #0b1430. A lit window at night is exactly that
// yellow against that blue, so the pair is the scene itself, not a tint. Grey
// exists only as dither: the sky glow, net curtains, half blinds, the fades.
// Night dims only the backlight (the street is quieter after midnight too:
// fewer flats lit).
//
// Cost: the frame is built in a 1-bit mask (Uint8Array(160 x 80); bit-packed
// on the device it would be 1.6 KB): a copy of the static street, ~420
// windows of 12 px each, a few dozen actor pixels, then one pass mapping the
// mask to the two RGB565 values. All integer, charged to g.cost.box.

import { hash, rand, clockFields, to565, clamp, sin, cos, TAU } from '../js/kit.js';
import { GLYPHS, GW, GH } from './blocklights-glyphs.js';
import {
  W, H, PX, PY, BASE, SKY, SKYT, WINDOWS, CORE, STREET_Y, bayer8,
  RANK_DIM, RANK_OPEN, PAT_FULL, PAT_DIM,
} from './blocklights-city.js';

const INK = to565(0xffd23c), GROUND = to565(0x0b1430);
const MASK = new Uint8Array(W * H);
let ops = 0;

// ------------------------------------------------------------ timing

const OUT_A = 58.5, OUT_SPREAD = 0.85, OUT_DUR = 0.32;   // lights out: gone by :59.67
const IN_A = 0.1, IN_SPREAD = 0.8, IN_DUR = 0.36;        // lights on: whole by :01.26
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** 0..1: when this flat's lamp goes, evenly over the numeral (ordered at the window scale). */
const cellDelay = (gc, gr, slot) => (B4[((gr & 3) << 2) | (gc & 3)] + rand(gc, gr, slot + 11) * 0.9) / 16.9;

const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

// background density by the hour: busy evenings, a few night owls
const DENS = [0.24, 0.15, 0.08, 0.06, 0.06, 0.1, 0.2, 0.3, 0.2, 0.15, 0.14, 0.14, 0.16, 0.15, 0.14, 0.15, 0.2, 0.3, 0.42, 0.52, 0.55, 0.5, 0.42, 0.32];
function density(epochSec) {
  const d = new Date(epochSec * 1000), th = d.getHours() + d.getMinutes() / 60;
  const i = Math.floor(th), u = th - i;
  return DENS[i] + (DENS[(i + 1) % 24] - DENS[i]) * u;
}

// ------------------------------------------------------------ per-minute plans (cached)

const PLANS = new Map();
function planFor(mk) {
  let p = PLANS.get(mk);
  if (p) return p;
  const f = clockFields(new Date(mk * 60000));
  const digits = (f.hh + f.mm).split('').map(Number);
  p = { digits, actors: [] };
  // the residents: a few events per numeral, all inside :02.5 .. :57.5
  for (let slot = 0; slot < 4; slot++) {
    const g = GLYPHS[digits[slot]];
    const runs = [];
    for (let r = 0; r < GH; r++) {
      let c = 0;
      while (c < GW) {
        if (!g[r * GW + c]) { c++; continue; }
        const c0 = c; while (c < GW && g[r * GW + c]) c++;
        runs.push({ r, c0, n: c - c0 });
      }
    }
    const long = runs.filter((q) => q.n >= 3), lit = [];
    for (let i = 0; i < GW * GH; i++) if (g[i]) lit.push(i);
    const nEv = 2 + (hash(mk, slot, 1) % 2);
    for (let e = 0; e < nEv; e++) {
      const h = hash(mk, slot, 10 + e), span = 55 / nEv, t0 = 2.5 + e * span + (h % 1000) / 1000 * span * 0.25;
      const kind = (h >>> 10) % 5;
      if (kind <= 2 && long.length) {
        // a walker, a dancer (walks in, dances, walks out), or the cat on the bottom sill
        const bottom = long.filter((q) => q.r === GH - 1 || q.r === GH - 2);
        const isCat = kind === 2 && bottom.length > 0;
        const pool = isCat ? bottom : long, q = pool[(h >>> 14) % pool.length];
        p.actors.push({ type: isCat ? 'cat' : kind === 1 ? 'dancer' : 'walker', slot, r: q.r, c0: q.c0, n: q.n, dir: (h >>> 20) & 1 ? 1 : -1, t0, span: span * 0.7 });
      } else {
        const cell = lit[(h >>> 14) % lit.length];
        p.actors.push({ type: 'curtain', slot, r: (cell / GW) | 0, c0: cell % GW, n: 1, dir: (h >>> 20) & 1 ? 1 : -1, t0, span: span * 0.7 });
      }
    }
  }
  // flats next to a lit numeral flat (no party guests there: they would blur its edge)
  const litCells = new Set();
  for (const w of WINDOWS) if (w.slot >= 0 && GLYPHS[digits[w.slot]][w.gr * GW + w.gc]) litCells.add(w.bi * 10000 + w.r * 100 + w.c);
  p.near = new Uint8Array(WINDOWS.length);
  WINDOWS.forEach((w, i) => {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (litCells.has(w.bi * 10000 + (w.r + dr) * 100 + w.c + dc)) p.near[i] = 1;
  });
  PLANS.set(mk, p);
  if (PLANS.size > 4) PLANS.delete(PLANS.keys().next().value);
  return p;
}

// ------------------------------------------------------------ drawing into the mask

/** Light a window: pattern bits `pat`, the first `L` of 12 pixels in `rank` order. */
function lamp(x, y, pat, L, rank) {
  if (L <= 0) return;
  let i = y * W + x;
  for (let py = 0, k = 0; py < 4; py++, i += W)
    for (let px = 0; px < 3; px++, k++) if ((pat >> k) & 1 && rank[k] < L) MASK[i + px] = 1;
  ops += 12;
}
const dark = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) MASK[y * W + x] = 0; };
const lit = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) MASK[y * W + x] = 1; };
const skyLit = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H && SKY[y * W + x]) MASK[y * W + x] = 1; };

// slot -> pixel origin of glyph cell (0, 0)
const SLOT_XY = [];
for (const w of WINDOWS) if (w.slot >= 0 && w.gc === 0 && w.gr === 0) SLOT_XY[w.slot] = [w.x, w.y];
const cellX = (slot, gc) => SLOT_XY[slot][0] + gc * PX;
const cellY = (slot, gr) => SLOT_XY[slot][1] + gr * PY;

// ------------------------------------------------------------ the residents

function actor(a, s) {
  const tl = s - a.t0;
  if (tl < 0 || tl > a.span) return;
  const yb = cellY(a.slot, a.r) + 3;
  if (a.type === 'curtain') {
    // drawn across one window from one side, a column at a time, held, opened again
    const k = Math.min(2, Math.floor(Math.min(tl, a.span - tl) / 0.45));
    const x = cellX(a.slot, a.c0);
    for (let j = 0; j < k; j++) { const cx = a.dir > 0 ? x + j : x + 2 - j; for (let y = yb - 3; y <= yb; y++) dark(cx, y); }
    return;
  }
  const xL = cellX(a.slot, a.c0) - 4, xR = cellX(a.slot, a.c0 + a.n - 1) + 3 + 2;
  const len = xR - xL;
  const speed = a.type === 'cat' ? 9 : 12;
  let x, moving = true, pause = 0;
  if (a.type === 'walker') {
    const d = tl * speed; if (d > len) return;
    x = a.dir > 0 ? xL + d : xR - d;
  } else {
    // walk to the middle, stay a while, walk on
    const half = len / 2, tWalk = half / speed, stay = Math.max(2, a.span - 2 * len / speed);
    if (tl < tWalk) x = a.dir > 0 ? xL + tl * speed : xR - tl * speed;
    else if (tl < tWalk + stay) { x = xL + half; moving = false; pause = tl - tWalk; }
    else { const d = half + (tl - tWalk - stay) * speed; if (d > len) return; x = a.dir > 0 ? xL + d : xR - d; }
  }
  x = Math.floor(x);
  if (a.type === 'cat') {
    // a sitting cat flicks its tail; walking, it is a long low body
    const f = a.dir;
    const tail = moving ? 0 : (Math.floor(pause * 2.5) & 1);
    const px = (dx, dy) => dark(f > 0 ? x + dx : x + 6 - dx, yb + dy);
    for (let dx = 1; dx <= 5; dx++) px(dx, 0);
    px(4, -1); px(5, -1); px(6, -1); px(4, -2); px(6, -2);
    px(0, tail ? -2 : -1); px(0, tail ? -1 : 0);
    if (moving && (Math.floor(tl * 6) & 1)) px(2, 0);
    return;
  }
  // a person, waist up: head over two-pixel shoulders; the window's top row stays lit
  const step = moving ? Math.floor(tl * 6) & 1 : 0;
  dark(x, yb); dark(x + 1, yb); dark(x, yb - 1); dark(x + 1, yb - 1);
  if (a.type === 'dancer' && !moving) {
    const ph = Math.floor(pause * 3.2) & 3, sway = ph === 1 ? 1 : ph === 3 ? -1 : 0;
    dark(x + (ph & 1 ? 1 : 0) + (sway > 0 ? 0 : 0), yb - 2);
    if (ph === 0 || ph === 2) { dark(x - 1, yb - 3); dark(x + 2, yb - 3); }   // arms up
    else { dark(x - 1, yb - 1 + (ph === 1 ? 0 : 1)); dark(x + 2, yb - 1 + (ph === 3 ? 0 : 1)); }
  } else {
    dark(a.dir > 0 ? x + 1 : x, yb - 2 + step * 0);
    if (step) dark(a.dir > 0 ? x + 2 : x - 1, yb);
  }
}

// ------------------------------------------------------------ the hour: fireworks

const BURSTS = [
  [3.5, 122, 6, 11, 22], [4.3, 141, 9, 9, 18], [5.0, 97, 4, 13, 26], [5.7, 131, 3, 12, 24],
  [6.3, 83, 14, 8, 16], [6.9, 149, 6, 10, 20], [7.5, 113, 2, 14, 28],
  [8.2, 126, 8, 13, 26], [8.3, 100, 7, 11, 22], [8.4, 147, 5, 11, 22],
];
const RISE = 0.7;

function fireworks(s) {
  for (let b = 0; b < BURSTS.length; b++) {
    const [t0, cx, cy, R, N] = BURSTS[b], tau = s - t0;
    if (tau < -RISE || tau > 2.4) continue;
    if (tau < 0) {
      // the shell climbing from behind the roofs
      const u = 1 + tau / RISE, y = Math.round(STREET_Y - (STREET_Y - cy) * (1 - (1 - u) * (1 - u)));
      const x = cx + Math.round((1 - u) * 3);
      skyLit(x, y); skyLit(x, y + 1); if ((Math.floor(s * 30) & 1)) skyLit(x, y + 3);
      ops += 4;
      continue;
    }
    for (let i = 0; i < N; i++) {
      const life = 1.0 + 1.1 * rand(b, i, 1);
      if (tau > life) continue;
      const a = (TAU * (i + 0.4 * rand(b, i, 2))) / N, sp = R * (0.7 + 0.3 * rand(b, i, 3));
      const ca = cos(a), sa = sin(a);
      for (let k = 0; k < 3; k++) {
        const tt = tau - k * 0.05;
        if (tt < 0 || (k > 0 && tau > 0.75)) break;
        const e = Math.min(tt / 0.75, 1), r = sp * (1 - (1 - e) * (1 - e) * (1 - e)) + tt * 1.5;
        skyLit(Math.floor(cx + ca * r), Math.floor(cy + sa * r * 0.9 + 5 * tt * tt));
      }
      ops += 20;
    }
  }
}

// ------------------------------------------------------------ the frame

export default {
  name: 'Block Lights',
  blurb: 'Two blocks of flats across the road at night: the time is who has their lights on. Residents live behind the lit windows; the hour turns the lights out for fireworks.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey;
    const T = ctx.date.getTime() / 1000;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    ops = 0;

    const cur = planFor(mk), prv = planFor(mk - 1), nxt = planFor(mk + 1);
    const prevF = clockFields(new Date((mk - 1) * 60000));
    const hourShow = prevF.h !== f.h && s < 13;

    // ---- the hour: a power cut, then the whole block switches on but the
    // numerals' flats, a party in every window with fireworks over the roof,
    // then back to normal. Phases in seconds after :00.
    const H_CUT = 2.4, H_NEG = 2.65, H_NEGOFF = 9.5, H_BACK = 9.95, H_BG = 10.8;
    let skyGlow = 255;
    if (hourShow) skyGlow = Math.round(255 * (1 - smooth((s - H_CUT) / 0.25)) + 255 * smooth((s - H_NEG - 0.3) / 0.6));

    // ---- the street
    if (skyGlow >= 255) {
      for (let i = 0; i < W * H; i++) MASK[i] = BASE[i] | (SKYT[i] < 255 ? 1 : 0);
    } else {
      for (let i = 0; i < W * H; i++) MASK[i] = BASE[i] | (skyGlow > SKYT[i] ? 1 : 0);
    }
    ops += W * H * 2;
    const cutOut = hourShow && s > H_CUT && s < H_NEG + 0.4;
    if (cutOut) for (let y = 74; y < 78; y++) for (let x = 27; x < 37; x++) MASK[y * W + x] = 0;   // the lobby too
    if (hourShow) fireworks(s);

    // ---- the windows
    const party = hourShow && s > H_CUT && s < H_BG + 1.2;
    for (let wi = 0; wi < WINDOWS.length; wi++) {
      const w = WINDOWS[wi];
      let drawn = false, numeral = false;
      if (w.slot >= 0) {
        const d = cur.digits[w.slot], gi = w.gr * GW + w.gc;
        const changedIn = prv.digits[w.slot] !== d, changesOut = nxt.digits[w.slot] !== d;
        if (GLYPHS[d][gi]) {
          numeral = true;
          let L = 12, rank = RANK_DIM;
          if (changesOut && s >= OUT_A) { L = Math.round(12 * (1 - clamp((s - OUT_A - cellDelay(w.gc, w.gr, w.slot) * OUT_SPREAD) / OUT_DUR, 0, 1))); rank = RANK_OPEN; }
          else if (changedIn && s < IN_A + IN_SPREAD + IN_DUR + 0.1) { L = Math.round(12 * clamp((s - IN_A - cellDelay(w.gc, w.gr, w.slot) * IN_SPREAD) / IN_DUR, 0, 1)); rank = RANK_OPEN; }
          if (party && s > H_CUT) {
            // the cut takes the numerals too; they come back after the party
            const e = cellDelay(w.gc, w.gr, w.slot);
            if (s < H_BACK) L = Math.round(12 * (1 - clamp((s - H_CUT - e * 0.18) / 0.08, 0, 1)));
            else { L = Math.round(12 * clamp((s - H_BACK - e * 0.45) / 0.18, 0, 1)); rank = RANK_OPEN; }
          }
          lamp(w.x, w.y, PAT_FULL, L, rank);
          drawn = L > 0;
          // every flat is somebody's: tied-back curtains, a pendant lamp, a plant on the sill
          if (L === 12) {
            const k = hash(w.slot, gi, d + 70) % 20, x = w.x, y = w.y;
            if (k < 3) { dark(x, y); dark(x + 2, y); }
            else if (k < 5) dark(x + 1, y);
            else if (k < 7) { dark(x + (k & 1) * 2, y + 3); }
            else if (k === 7) { dark(x, y); dark(x, y + 1); }
          }
        }
      }
      if (!numeral && w.bg) {
        // a background flat: its own schedule of evenings, behind a net curtain or a blind
        const id = w.id, P = 30 + 90 * rand(id, 1), ph = rand(id, 2) * P;
        const k = Math.floor((T + ph) / P), into = T + ph - k * P;
        const dm = w.edge ? 0.4 : 1, on = rand(id, k, 3) < dm * density((k * P - ph)), was = rand(id, k - 1, 3) < dm * density(((k - 1) * P - ph));
        let L = 0, pat = PAT_DIM[hash(id, k, 4) & 3], tv = hash(id, k, 5) % 6 === 0;
        if (on && was) L = 12;
        else if (on) L = Math.round(12 * clamp(into / 0.4, 0, 1));
        else if (was) { L = Math.round(12 * (1 - clamp(into / 0.4, 0, 1))); pat = PAT_DIM[hash(id, k - 1, 4) & 3]; tv = hash(id, k - 1, 5) % 6 === 0; }
        if (w.edge) pat = PAT_DIM[0];   // right over or under a numeral: only a net curtain, never a solid shape
        if (tv && L > 0) pat = [0x2d2, 0x5a5, 0x1b6, 0x6c9][(hash(id, Math.floor(T * 7)) & 3)];
        if (party) {
          const e = wOrder(w);
          if (s < H_BG) L = Math.round(L * (1 - clamp((s - H_CUT - e * 0.18) / 0.08, 0, 1)));
          else L = Math.round(L * clamp((s - H_BG - e * 1.0) / 0.2, 0, 1));
        }
        if (L > 0) { lamp(w.x, w.y, pat, L, RANK_DIM); drawn = true; }
      }
      if (!numeral && party && s > H_NEG && s < H_BACK) {
        // the whole block switches on, evenly; only the numerals' flats stay dark
        const e = wOrder(w);
        const L = s < H_NEGOFF ? Math.round(12 * clamp((s - H_NEG - e * 0.6) / 0.1, 0, 1)) : Math.round(12 * (1 - clamp((s - H_NEGOFF - e * 0.4) / 0.1, 0, 1)));
        if (L > 0) {
          lamp(w.x, w.y, PAT_FULL, L, RANK_OPEN); drawn = true;
          if (L === 12 && !cur.near[wi] && rand(w.id, cur.digits[0] * 7 + cur.digits[1], 60) < 0.24) dancer(w, s);
        }
      }
      // dark glass: one pixel of reflected street light
      if (!drawn) MASK[(w.y + 1) * W + w.x + 1] = 1;
    }

    // ---- the residents
    if (s > 2 && s < 58.4 && !party) for (const a of cur.actors) actor(a, s);

    // ---- the lift
    lift(T);
    // ---- the plane
    if (!hourShow) plane(T);
    // ---- cars
    cars(T);

    // ---- out: one ink, one ground
    const buf = g.buf;
    for (let i = 0; i < W * H; i++) buf[i] = MASK[i] ? INK : GROUND;
    g.cost.px += W * H;
    g.cost.box += ops + W * H;
  },
};

// a party guest in a lit window: head and shoulders, arms up on the beat
function dancer(w, s) {
  const ph = Math.floor(s * 2.6 + rand(w.id, 61) * 4) & 3, x = w.x, y = w.y;
  const sx = ph === 1 ? 0 : ph === 3 ? 2 : 1;
  dark(x + sx, y + 1);
  dark(x, y + 3); dark(x + 1, y + 3); dark(x + 2, y + 3); dark(x + 1, y + 2);
  if (ph & 1) { dark(x, y); dark(x + 2, y); } else { dark(x, y + 2); dark(x + 2, y + 2); }
  ops += 8;
}

/** 0..1: an even order over a whole facade, for switching every flat. */
const wOrder = (w) => (B4[((w.r & 3) << 2) | (w.c & 3)] + rand(w.id, 7) * 0.9) / 16.9;

// the lift: rides between floors, eased, at most about a pixel a frame
const LIFT_SEG = 7, LIFT_FLOORS = 14;
const liftFloor = (n) => { let a = hash(n, 77) % LIFT_FLOORS; const b = hash(n - 1, 77) % LIFT_FLOORS; if (a === b) a = (a + 5) % LIFT_FLOORS; return a; };
function lift(T) {
  const n = Math.floor(T / LIFT_SEG), tl = T - n * LIFT_SEG;
  const ya = 8 + 5 * liftFloor(n - 1), yb = 8 + 5 * liftFloor(n);
  const dur = Math.abs(yb - ya) / 38 + 0.2;
  const y = Math.round(ya + (yb - ya) * smooth(tl / dur));
  for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 3; dx++) lit(CORE.shaftX + dx, y + dy);
  ops += 12;
}

// a plane: a steady light and a strobe, crossing behind the roofs
function plane(T) {
  const P = 37, n = Math.floor(T / P);
  if (rand(n, 90) > 0.7) return;
  const u = (T - n * P) / 10;
  if (u > 1) return;
  const x = Math.round(166 - 178 * u), y = 2 + (hash(n, 91) % 6) + Math.round(u * 3);
  skyLit(x, y);
  if ((T * 1000) % 1100 < 70) { skyLit(x + 1, y); skyLit(x + 2, y); skyLit(x + 1, y - 1); }
}

// cars: headlights and a pool of light on the road, tail lights behind
function cars(T) {
  const P = 9;
  for (let n = Math.floor(T / P) - 1; n <= Math.floor(T / P); n++) {
    if (rand(n, 50) > 0.75) continue;
    const v = 46 + 16 * rand(n, 51), t = T - n * P - rand(n, 52) * 2, dir = hash(n, 53) & 1 ? 1 : -1;
    if (t < 0) continue;
    const d = v * t, front = dir > 0 ? Math.round(-16 + d) : Math.round(176 - d);
    if (front < -40 || front > 200) continue;
    const back = front - dir * 12;
    // the body hides whatever is behind it
    for (let k = 0; k <= 12; k++) { const x = back + dir * k; for (let y = 75; y < 78; y++) dark(x, y); if (k > 2 && k < 9) dark(x, 74); }
    lit(front, 76); lit(front - dir, 76); lit(back, 76);
    // the beam: a dithered pool ahead on the road
    for (let k = 1; k < 18; k++) {
      const x = front + dir * k, den = (1 - k / 18) * 40;
      for (let y = 76; y < 80; y++) if (y >= 77 || k < 6) if (x >= 0 && x < W && bayer8(x, y) < den) MASK[y * W + x] = 1;
    }
    ops += 120;
  }
}
