// Etch A Sketch: the glass is the toy's screen, and everything on it is
// drawn by its one stylus, a 1-px line that moves only by the two knobs
// (so diagonals are staircases and curves are careful stairs) and is never
// lifted. A horizon runs across the bottom; the hours and minutes stand on
// it as block numerals, a little house between them with smoke curling from
// its chimney, and the stylus parks at the top of the smoke.
//
// The numerals are the medium's own lettering: each digit is one excursion
// from the horizon. The stylus runs the figure once as a thin skeleton,
// then comes back over it and goes round it twice, so the bold digit is an
// inline block letter (a centre line inside a double rim), the way a careful
// Etch A Sketch hand makes a line heavy. All ten use only long straight
// runs, staircases and one corner radius.
//
// Always drawing: six times a minute the stylus leaves the smoke (its line
// rises as more smoke, then one straight knob-turn across the sky) and
// doodles something at 1-2 px a frame: a cat, a square spiral, a sailboat,
// a skyline, a rocket, a fish, a Greek key, a car, a star, a heart, a snail,
// a tree. It zips home along its own line, and a gentle tilt slides the
// powder back across the sky as a soft dithered band, erasing it.
//
// Minute turn: the toy is tilted and the powder re-coats the old digit, an
// even dissolve, gone by :59.9, while the stylus slides down the smoke,
// round the house and along the horizon (all retrace, nothing new drawn) to
// the digit's foot. After :00 it races the new skeleton thin, then
// thickens it on the way back, and goes home.
// Hour: the toy is shaken. Three sloshing waves of powder roll left, right
// and left across the glass, wiping the horizon and the house; the old
// digits dissolve. At :00 the stylus races out along a fresh horizon,
// drawing every new numeral thin, thickens them all on the way back, draws
// the house again, and then the hour's picture: a mountain range across the
// whole top of the glass with the sun on a peak (a crescent moon at night).
//
// Colour: two values only, like a mono module: graphite #3c3c3c (the line,
// where the stylus has scraped the aluminium powder off the glass) on the
// powder's grey #c4c4bc. The toy's own two colours, nothing in between:
// every grey is a stipple of powder. Night dims only the backlight.
//
// Cost: the frame is a 1-bit mask (12.8 KB) written to the canvas as two
// colours; numerals, house, doodles and panorama are precomputed pixel
// routes (flash) replayed as prefixes, a few thousand byte stores a frame.
import { to565, hash, clockFields, sin, clamp } from '../js/kit.js';
import { makeGlyph } from './etchasketch-glyphs.js';
import { Route, trace } from './etchasketch-line.js';
import { DOODLES, panorama, travel, join, reverse, moved } from './etchasketch-doodles.js';

const W = 160, H = 80, G = 77;
const INK = 0x3c3c3c, GROUND = 0xc4c4bc;
const INK5 = to565(INK), GROUND5 = to565(GROUND);

// ------------------------------------------------------------ the numerals (flash)

const BIG = [], SMALL = [];
for (let d = 0; d < 10; d++) { BIG.push(makeGlyph(d, 22, 43, 8)); SMALL.push(makeGlyph(d, 18, 33, 7)); }
const SLOT_X = [2, 33, 100, 129];
const SETS = [BIG, BIG, SMALL, SMALL];
const glyphAt = (k, d) => SETS[k][d];
const topOf = (gl) => G - gl.h;
const footX = (k, d) => SLOT_X[k] + glyphAt(k, d).ex;

// ------------------------------------------------------------ the house, its smoke, the parking spot

const HX0 = 69, HX1 = 91, HP = HX0 + 11, CX = HX0 + 16;   // walls, roof peak, chimney
const LINK = new Route(HX0, G).to(HX0, 70).to(HX0 + 4, 70).to(HX0 + 4, 66).to(HX0, 66).to(HX0, 63).to(HP, 52).to(CX, 57).to(CX, 50).pixels();
const REST = new Route(CX, 50).to(CX + 3, 50).to(CX + 3, 60).to(HX1, 63).to(HX1, G).to(HX0 + 15, G).to(HX0 + 15, 69).to(HX0 + 9, 69).to(HX0 + 9, G).to(HX0, G).pixels().subarray(2);
const SMOKE = new Route(CX, 50).to(CX + 1, 50).to(CX + 1, 48).to(CX + 3, 46).to(CX + 2, 44).to(CX, 43).to(CX - 1, 41).to(CX, 39).to(CX + 2, 38).to(CX + 2, 36).to(CX, 35).pixels().subarray(2);
const SCENE = join(LINK, REST, LINK.subarray(2), SMOKE);        // the house drawn in one line, ending in the smoke
const PX = SMOKE[SMOKE.length - 2], PY = SMOKE[SMOKE.length - 1];   // the stylus parks at the top of the smoke
const DOWN = reverse(join(LINK, SMOKE));                         // parking spot to the house's foot (a retrace)
const UP = join(LINK, SMOKE);

const ground = (x0, x1) => {
  const n = Math.abs(x1 - x0) + 1, p = new Int16Array(2 * n), s = Math.sign(x1 - x0);
  for (let i = 0; i < n; i++) { p[2 * i] = x0 + s * i; p[2 * i + 1] = G; }
  return p;
};

// ------------------------------------------------------------ a minute's plan: the stylus's legs

const ease = (u) => u * u * (3 - 2 * u);

function digitsOf(mk) {
  const f = clockFields(new Date(mk * 60000));
  return { f, d: [+f.hh[0], +f.hh[1], +f.mm[0], +f.mm[1]] };
}

const PLANS = new Map();
export function planFor(mk) {
  let p = PLANS.get(mk);
  if (p) return p;
  const { f, d } = digitsOf(mk), pd = digitsOf(mk - 1).d;
  const D = [0, 1, 2, 3].filter((k) => d[k] !== pd[k]);
  const hour = f.m === 0;
  const legs = [];
  let t = 0;
  const leg = (kind, path, speed, slot = -1) => {
    const n = path.length / 2, dur = Math.max(n, 2) / (speed * 60);
    legs.push({ kind, path, n, t0: t, t1: t + dur, slot });
    t += dur;
  };
  const vThin = hour ? 11 : D.length > 1 ? 5 : 3.5, vBold = hour ? 6 : D.length > 1 ? 4 : 2.6;
  const Fs = D.map((k) => { const gl = glyphAt(k, d[k]); return moved(gl.F, SLOT_X[k], topOf(gl)); });
  let x = hour ? 0 : footX(D[0], d[D[0]]);
  // out: the thin pass, left to right
  D.forEach((k, i) => {
    const fx = footX(k, d[k]);
    if (fx !== x || hour) leg(hour ? 'ground' : 'move', ground(x, fx), hour ? 10 : 6);
    leg('thin', join(travel(fx, G, fx, G - 3), Fs[i]), vThin, k);
    x = fx;
  });
  if (hour) { leg('ground', ground(x, W - 1), 10); x = W - 1; }
  // back: the retrace, right to left, thickening each figure
  for (let i = D.length - 1; i >= 0; i--) {
    const k = D[i], fx = footX(k, d[k]);
    if (fx !== x) leg('move', ground(x, fx), 8);
    leg('bold', join(reverse(Fs[i]), travel(fx, G - 4, fx, G)), vBold, k);
    x = fx;
  }
  // home: along the ground to the house, up it and its smoke to the parking spot
  leg('move', ground(x, HX0), 6);
  if (hour) leg('scene', SCENE, 5);
  else leg('move', UP, 4);
  const pre = hour ? join(DOWN, ground(HX0, 0).subarray(2)) : join(DOWN, ground(HX0, footX(D[0], d[D[0]])).subarray(2));
  p = { mk, f, d, D, hour, legs, end: t, pre };
  PLANS.set(mk, p);
  if (PLANS.size > 4) PLANS.delete(PLANS.keys().next().value);
  return p;
}

// ------------------------------------------------------------ the sky: doodles while it waits

const NOISE = new Uint8Array(64 * 64);
for (let i = 0; i < NOISE.length; i++) NOISE[i] = hash(i, 77) & 255;
const PANO_DAY = panorama(PX, PY, false), PANO_NIGHT = panorama(PX, PY, true);
const SKY_Y = 33;                                   // doodles stay above this row (the minutes start at 37)
const SLOT0 = 4.5, SLOT = 8.6, TILT = 1.5;          // six doodles a minute, each tilted away before the next
// how far down the glass the tilt's powder band reaches, per column (it keeps off the numerals)
const COLMAX = new Int16Array(W);
for (let x = 0; x < W; x++) COLMAX[x] = x < 64 ? 23 : x < 97 ? 40 : 33;

// the stylus leaves the smoke as more smoke: a curling staircase up to where the doodle starts
function curl(ax, ay, bx, by, phase) {
  const n = Math.max(2, Math.round(Math.hypot(bx - ax, by - ay) / 2)), L = Math.hypot(bx - ax, by - ay) || 1;
  const nx = -(by - ay) / L, ny = (bx - ax) / L, pts = [[ax, ay]];
  for (let i = 1; i <= n; i++) {
    const u = i / n, w = 2.2 * Math.sin(u * Math.PI * 3 + phase) * Math.sin(u * Math.PI);
    pts.push([ax + (bx - ax) * u + nx * w, ay + (by - ay) * u + ny * w]);
  }
  return trace(pts).subarray(2);
}

function doodlePath(mk, slot) {
  let k = hash(mk, slot, 5) % DOODLES.length;
  if (slot > 0 && k === hash(mk, slot - 1, 5) % DOODLES.length) k = (k + 1) % DOODLES.length;
  const dd = DOODLES[k];
  const lo = W - 2 - dd.w > 100 ? 94 : 66, ox = lo + (hash(mk, slot, 6) % (W - 1 - lo - dd.w)), oy = 1 + (hash(mk, slot, 7) % Math.max(1, SKY_Y - dd.h));
  const pts = moved(dd.path, ox, oy);
  // smoke rising to the doodle's height, then one straight knob-turn across to where it starts
  const sy = Math.min(PY - 6, pts[1]);
  const out = join(curl(PX, PY, PX, sy, slot), travel(PX, sy, pts[0], sy), travel(pts[0], sy, pts[0], pts[1]), pts.subarray(2));
  return { out, n: out.length / 2, back: reverse(out) };
}
const SKIES = new Map();
function skyFor(mk, hourShow) {
  let list = SKIES.get(mk);
  if (list) return list;
  list = [];
  let first = 0;
  if (hourShow) {
    // the hour: one big picture instead of the first three doodles
    const h = clockFields(new Date(mk * 60000)).h, pano = h >= 19 || h < 7 ? PANO_NIGHT : PANO_DAY;
    list.push({ path: pano, n: pano.length / 2, back: null, pano: true, t0: SLOT0, t1: SLOT0 + pano.length / 2 / (1.6 * 60), t2: 0, e0: SLOT0 + 3 * SLOT - TILT, e1: SLOT0 + 3 * SLOT });
    first = 3;
  }
  // once a minute (not in the hour's) the stylus goes down instead and runs over one of the
  // numerals, out along its line and back: a touch-up that leaves the time exactly as it was
  const touch = hourShow ? -1 : 1 + (hash(mk, 9) % 5);
  for (let i = first; i < 6; i++) {
    const t0 = SLOT0 + i * SLOT;
    if (i === touch) {
      const d = digitsOf(mk).d, k = hash(mk, 10) & 3, gl = glyphAt(k, d[k]), fx = footX(k, d[k]);
      const F = moved(gl.F, SLOT_X[k], topOf(gl));
      const path = join(DOWN, ground(HX0, fx).subarray(2), travel(fx, G, fx, G - 3), F, reverse(F), travel(fx, G - 4, fx, G), ground(fx, HX0).subarray(2), UP);
      const n = path.length / 2;
      list.push({ touch: true, path, n, t0, t1: t0 + Math.min(SLOT - 0.5, n / (2 * 60)), e0: 0, e1: 0 });
      continue;
    }
    const dp = doodlePath(mk, i);
    const v = clamp(dp.n / (60 * 5), 1, 2);          // 1-2 px a frame
    const t1 = t0 + dp.n / (v * 60);
    // then it zips home along its own line (a retrace: nothing new on the glass)
    list.push({ path: dp.out, n: dp.n, back: dp.back, t0, t1, t2: Math.min(t1 + dp.n / (4 * 60), t0 + SLOT - TILT - 0.1), e0: t0 + SLOT - TILT, e1: t0 + SLOT });
  }
  SKIES.set(mk, list);
  if (SKIES.size > 3) SKIES.delete(SKIES.keys().next().value);
  return list;
}

// ------------------------------------------------------------ the frame

const mask = new Uint8Array(W * H);
const st = { sx: PX, sy: PY, thin: [0, 0, 0, 0], front: [0, 0, 0, 0], gx: W - 1, scene: SCENE.length / 2 };

function walk(p, s) {
  st.thin.fill(-1); st.front.fill(0); st.gx = W - 1; st.scene = SCENE.length / 2;
  st.sx = PX; st.sy = PY;
  for (const k of p.D) { st.thin[k] = 0; st.front[k] = 1e9; }
  if (p.hour) { st.gx = -1; st.scene = 0; }
  for (const L of p.legs) {
    if (s < L.t0) break;
    const u = s >= L.t1 ? 1 : ease((s - L.t0) / (L.t1 - L.t0));
    const i = Math.min(L.n - 1, Math.floor(u * (L.n - 1) + 0.5));
    st.sx = L.path[2 * i]; st.sy = L.path[2 * i + 1];
    if (L.kind === 'thin') st.thin[L.slot] = Math.max(0, i - 2);
    else if (L.kind === 'bold') st.front[L.slot] = glyphAt(L.slot, p.d[L.slot]).n - 1 - i;
    else if (L.kind === 'ground') st.gx = Math.max(st.gx, L.path[0], L.path[2 * i]);
    else if (L.kind === 'scene') st.scene = i + 1;
  }
}

function put(x, y) { if (x >= 0 && y >= 0 && x < W && y < H) mask[y * W + x] = 1; }

// the hour's shake: three sloshes of loose powder across the glass, before :00
const SLOSH = [[57.0, 57.95, 1], [57.95, 58.9, -1], [58.9, 59.85, 1]];
const BAND = 16;
function sloshX(k, s, y) {
  const [a, b, dir] = SLOSH[k], u = ease(clamp((s - a) / (b - a), 0, 1));
  const x = dir > 0 ? -BAND - 8 + (W + 2 * BAND + 16) * u : W + BAND + 8 - (W + 2 * BAND + 16) * u;
  return x + 7 * sin(y * 0.09 + k * 2.1 + s * 3) * dir;   // the powder's front is a wave, leaning with the slosh
}

export default {
  name: 'Etch A Sketch',
  blurb: 'One stylus line, never lifted: the time drawn as Etch A Sketch block numerals on a horizon, doodles in the sky, a tilt to erase, a shake at the hour.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    const p = planFor(mk), nx = planFor(mk + 1), sky = skyFor(mk, p.hour);
    walk(p, s);

    // ---- what the end of the minute takes away
    const shaking = nx.hour && s >= SLOSH[0][0];
    const preT0 = nx.hour ? 57.1 : 57.6, preT1 = nx.hour ? 59.6 : 59.9;
    let dis = -1;
    if (nx.hour) { if (s >= 58.4) dis = ease(clamp((s - 58.4) / 1.55, 0, 1)); }
    else if (s >= 58.0) dis = ease(clamp((s - 58.0) / 1.9, 0, 1));
    if (s >= preT0) {
      const u = ease(clamp((s - preT0) / (preT1 - preT0), 0, 1)), i = Math.round(u * (nx.pre.length / 2 - 1));
      st.sx = nx.pre[2 * i]; st.sy = nx.pre[2 * i + 1];
    }
    const dslots = dis >= 0 ? nx.D : null, cut = Math.round(dis * 256);

    let work = 0;          // loop iterations of our own, billed as box work
    mask.fill(0);
    // ---- ground and house (the first slosh wipes them)
    let e0 = -1e9, eG = -1e9;
    if (shaking) eG = sloshX(0, s, G);
    for (let x = Math.max(0, Math.ceil(eG)); x <= st.gx; x++) mask[G * W + x] = 1;
    if (!shaking) for (let i = 0; i < st.scene; i++) put(SCENE[2 * i], SCENE[2 * i + 1]);
    else for (let i = 0; i < st.scene; i++) { const x = SCENE[2 * i], y = SCENE[2 * i + 1]; if (x >= sloshX(0, s, y)) put(x, y); }

    // ---- numerals: the thin line being drawn, the bold figure behind the retrace, or powder re-coating it
    for (let k = 0; k < 4; k++) {
      const gl = glyphAt(k, p.d[k]), ox = SLOT_X[k], oy = topOf(gl);
      const th = st.thin[k], fr = st.front[k];
      if (dslots && dslots.includes(k)) {
        const ink = gl.ink, thr = gl.thr;
        for (let i = 0; i < thr.length; i++) if (thr[i] >= cut) mask[(ink[2 * i + 1] + oy) * W + ink[2 * i] + ox] = 1;
        work += thr.length;
        continue;
      }
      if (th !== 0) { const fx = ox + gl.ex; put(fx, G - 1); put(fx, G - 2); put(fx, G - 3); }
      if (th >= 0) { for (let i = 0; i < th; i++) put(gl.F[2 * i] + ox, gl.F[2 * i + 1] + oy); work += th; }
      if (fr < 1e9) {
        const ink = gl.ink, idx = gl.idx;
        for (let i = 0; i < idx.length; i++) if (idx[i] >= fr) mask[(ink[2 * i + 1] + oy) * W + ink[2 * i] + ox] = 1;
        work += idx.length + (fr > 0 ? gl.n : 0);
        if (fr > 0) for (let i = 0; i < gl.n; i++) put(gl.F[2 * i] + ox, gl.F[2 * i + 1] + oy);
      }
    }

    // ---- the sky: today's doodle, or the hour's panorama, and the tilt that takes it away
    for (const it of sky) {
      if (it.touch) {
        if (s >= it.t0 && s < it.t1) {
          const i = Math.floor(ease((s - it.t0) / (it.t1 - it.t0)) * (it.n - 1));
          st.sx = it.path[2 * i]; st.sy = it.path[2 * i + 1];
          break;
        }
        continue;
      }
      if (s < it.t0 || s >= it.e1) continue;
      let n = it.n;
      if (s < it.t1) {
        n = 1 + Math.floor(((s - it.t0) / (it.t1 - it.t0)) * (it.n - 1));
        st.sx = it.path[2 * n - 2]; st.sy = it.path[2 * n - 1];
      } else if (it.back && s < it.t2) {
        const i = Math.floor(ease((s - it.t1) / (it.t2 - it.t1)) * (it.n - 1));
        st.sx = it.back[2 * i]; st.sy = it.back[2 * i + 1];
      }
      const path = it.path;
      work += n;
      if (s < it.e0) { for (let i = 0; i < n; i++) put(path[2 * i], path[2 * i + 1]); break; }
      // the gentle tilt: the powder slides across the sky as a soft band, from the right,
      // re-coating the line behind its front
      const x0 = it.pano ? 0 : 64;
      const front = Math.round(W + 14 - (W + 28 - x0) * ease((s - it.e0) / (it.e1 - it.e0)));
      for (let i = 0; i < n; i++) {
        const x = path[2 * i], y = path[2 * i + 1];
        if (x - (NOISE[((y & 63) << 6) | (x & 63)] & 7) < front) put(x, y);
      }
      for (let x = Math.max(x0, front); x < Math.min(W, front + 14); x++) {
        const dens = (14 - (x - front)) * 6, y1 = COLMAX[x];
        work += y1 + 1;
        for (let y = 0; y <= y1; y++) if (NOISE[((y & 63) << 6) | ((x - front) & 63)] < dens) mask[y * W + x] = 1;
      }
      break;
    }

    // ---- the shake's powder bands
    if (shaking) for (let k = 0; k < 3; k++) {
      if (s < SLOSH[k][0] || s >= SLOSH[k][1]) continue;
      for (let y = 0; y < H; y++) {
        const xr = Math.round(sloshX(k, s, y));
        work += 2 * BAND + 1;
        for (let x = Math.max(0, xr - BAND); x <= Math.min(W - 1, xr + BAND); x++) {
          const dens = (BAND - Math.abs(x - xr)) * 9;
          if (NOISE[((y & 63) << 6) | ((x - xr) & 63)] < dens) mask[y * W + x] = 1;
        }
      }
    }

    // ---- the stylus: the little dark point at the end of the line
    // (a ring of bare powder round it, so it shows where it runs over its own heavy line)
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = st.sx + dx, y = st.sy + dy;
      if (x >= 0 && y >= 0 && x < W && y < H && (dx * dx + dy * dy) <= 5) mask[y * W + x] = dx * dx + dy * dy <= 2 ? 1 : 0;
    }
    const buf = g.buf;
    for (let i = 0; i < W * H; i++) buf[i] = mask[i] ? INK5 : GROUND5;
    g.cost.px += W * H; g.cost.box += W * H * 2 + work * 2 + st.scene + W;
  },
};
