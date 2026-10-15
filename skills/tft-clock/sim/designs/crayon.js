// Crayon: a page of a child's lined school notebook, and the time is four
// doodle monsters the child drew on it. Each monster's body IS its numeral
// (crayon-glyphs.js): a fat felt-tip outline, coloured in with a waxy crayon
// scribble that slips over the line in places and stops short of it in
// others; googly eyes perched on its top edge, a toothy mouth on a stroke,
// stick legs with big flat feet standing in a strip of crayon grass. Hours
// are the two big monsters, minutes the two smaller ones.
//
// The medium's motion is line boil: every body (and the sun, the cloud, the
// grass) exists as three drawings, cycled 12 times a second, so every line
// and every patch of wax trembles as in hand-drawn animation. On top, at
// 60 fps, the monsters stomp: once a second each lifts a foot, rises and
// stomps down (squash, a shimmy, impact ticks at the foot, its googly pupils
// rattling), hours on the beat and minutes on the off-beat, while they sway
// and look about. Every 15 s a flourish: one monster roars (mouth wide,
// teeth, roar strokes, the others jump), a hop runs down the line, a fly
// buzzes in on a dotted flight path, lands on a head and gets chomped at.
//
// Minute turn: the old monster sees it coming (eyes up, shivering, sweat
// drops), then the felt-tip scribbles it out in three passes that darken it
// evenly; the scribble screws itself into a tangle ball with the monster's
// eyes, which scurries off the right edge. After :00 the new monster is
// drawn in: a pencil sketch of the whole outline flickers in, the felt-tip
// inks it along the way the numeral is written, the crayon colours it in,
// its eyes pop open and its legs unfold. Hour: a monster party, with hats
// dropping on, confetti, everybody jumping on every half-beat with arms up,
// singing, pupils spinning.
//
// Palette: what is in a school pencil case. Notebook paper, its pale blue
// rules and red margin, the felt-tip black (the strongest contrast, kept for
// the monsters' lines), ten crayons (one per numeral, each in three
// pressures: light, normal, pressed hard), pencil grey for the sketch, white
// for the eyes. The world is crayon only, without felt-tip line, so it stays
// softer than the time. Night: the backlight dims and the paper cools as if
// under a night light, the sun becomes a crayon moon with stars, and the
// monsters doze with heavy lids, still bobbing on the beat.
//
// Cost: bodies are byte maps (flash) looked up per pixel under each
// monster's bounce, squash and sway (a few integer ops a pixel, charged as
// box work); everything else is small hard kit shapes. Flash ~218 KB in
// all (bodies 203 KB, scribble 3 KB, world 12 KB); RAM: no buffers beyond
// the frame buffer, under 1 KB of per-frame scratch.

import { clockFields, hash, sin, to565 } from '../js/kit.js';
import { GLYPHS, SIZES, M, SCRIBBLE } from './crayon-glyphs.js';
import { SUN, MOON, CLOUD, GRASS, GRASS_Y, HAT, STAR, SUN_CX, SUN_CY } from './crayon-world.js';

const W = 160, H = 80;
const SLOT_X = [14, 49, 93, 124];          // left edge of each body box
const SLOT_S = [0, 0, 1, 1];               // size: hours big, minutes small
const BOTTOM = 65;                         // bodies stand with their bottom edge here
const GROUND = 72;                         // feet
const BEAT_OFF = [0, 0.08, 0.5, 0.58];
const RULES = [6, 17, 28, 39, 50, 61];

// ------------------------------------------------------------ colours (0xRRGGBB)

const PAPER = 0xf5f0e2, PAPER_N = 0xc9cfdf;
const RULE = 0xa6c2e4, RULE_N = 0x93a6c8;
const MARGIN = 0xe79896, MARGIN_N = 0xb98b9c;
const DESK = 0x4d4239;
const INK = 0x221e29;
const WHITE = 0xffffff, WHITE_N = 0xeef0f6;
const PENCIL = 0xa3a09a;
const GULLET = 0x7a1a2a;
const SWEAT = 0x5aa6e6;
const CRAYON = [0x3ea64f, 0xf2882c, 0x8a57c4, 0xe03a3c, 0x3374d4, 0xf0bf1c, 0xef6ea8, 0x1ea59b, 0xa5683c, 0x92c43a];
const SUN_C = 0xf6c21e, SUN_DUSK = 0xf27a26, MOON_C = 0xf2e08a;
const CLOUD_C = 0x86b3e8, GRASS_C = 0x52b04a, HAT_C = [0xe03a3c, 0x3374d4, 0xf0bf1c, 0x8a57c4, 0xef6ea8, 0x1ea59b];

function mixc(a, b, t) {                    // integer mix, t in 0..1
  const k = (t * 256) | 0, j = 256 - k;
  return ((((a >> 16) & 255) * j + ((b >> 16) & 255) * k) >> 8) << 16
    | ((((a >> 8) & 255) * j + ((b >> 8) & 255) * k) >> 8) << 8
    | (((a & 255) * j + (b & 255) * k) >> 8);
}
const dim = (c, t) => mixc(c, 0, t);

// ------------------------------------------------------------ small helpers

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const prog = (v, a, b) => clamp01((v - a) / (b - a));
const inOut = (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));
const outQ = (t) => t * (2 - t);
const outBack = (t) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
const frac = (v) => v - Math.floor(v);
const TAU = Math.PI * 2;
const rnd = (a, b, c) => hash(a, b, c) / 4294967296;

const LOOKS = [[0, 0.35], [-1, 0], [1, 0], [0, -1], [0.75, -0.65], [-0.75, -0.65], [0.3, 0.9], [-0.9, 0.4]];

/** Draw a crayon byte map (codes 1..3) at integer (x0, y0) with lut[code]. */
function blob(g, b, k, x0, y0, lut) {
  const map = b.maps[k], buf = g.buf;
  const xs = Math.max(0, -x0), xe = Math.min(b.w, W - x0), ys = Math.max(0, -y0), ye = Math.min(b.h, H - y0);
  let n = 0;
  for (let y = ys; y < ye; y++) {
    let i = y * b.w + xs, o = (y + y0) * W + x0 + xs;
    for (let x = xs; x < xe; x++, i++, o++) { const c = map[i]; if (c) { buf[o] = lut[c]; n++; } }
  }
  g.cost.px += n; g.cost.box += Math.max(0, (xe - xs) * (ye - ys)) * 2;
}

/**
 * Draw a monster body: map pixel (mx, my) appears at screen
 * ax + (mx - bx) * sx + kx * (ay - y), ay + (my - by) * sy.
 * Reveal thresholds (0..256): sk pencil sketch, ik ink, fk crayon; th thins
 * the body away by the same hashed rank.
 */
function body(g, gl, k, lut, ax, ay, sx, sy, kx, sk, ik, fk, th, pencil) {
  const map = gl.maps[k], path = gl.path, fill = gl.fill, MW = gl.MW, MH = gl.MH, buf = g.buf;
  const bx = M + (MW - 2 * M) / 2, by = gl.bottom + 1;
  const reach = Math.abs(kx) * MH + 2;
  const x0 = Math.max(0, Math.floor(ax - bx * sx - reach)), x1 = Math.min(W, Math.ceil(ax + (MW - bx) * sx + reach));
  const y0 = Math.max(0, Math.floor(ay - by * sy - 1)), y1 = Math.min(H, Math.ceil(ay + (MH - by) * sy + 1));
  const isx = 1 / sx, isy = 1 / sy;
  let n = 0, scan = 0;
  for (let y = y0; y < y1; y++) {
    const my = Math.floor(by + (y + 0.5 - ay) * isy);
    if (my < 0 || my >= MH) continue;
    const shift = kx * (ay - y - 0.5);
    // fixed point 16.16 along the row
    let mxf = Math.floor((bx + (x0 + 0.5 - ax - shift) * isx) * 65536);
    const step = Math.floor(isx * 65536);
    const row = my * MW;
    scan += x1 - x0;
    for (let x = x0; x < x1; x++, mxf += step) {
      const mx = mxf >> 16;
      if (mx < 0 || mx >= MW) continue;
      const i = row + mx, c = map[i];
      if (!c) continue;
      const r = fill[i];
      if (r < th) continue;
      if (c === 4) {
        if (path[i] < ik) buf[y * W + x] = lut[4];
        else if (r < sk) buf[y * W + x] = pencil;
        else continue;
      } else if (r < fk) buf[y * W + x] = lut[c];
      else continue;
      n++;
    }
  }
  g.cost.px += n; g.cost.box += scan * 5;
}

/** The scribble-out over a body box: ink where the pen has been by `thr`, scaled `s` about (cx, by). */
function scribble(g, sc, thr, s, cx, by, ink) {
  const map = sc.map, w = sc.w, h = sc.h, buf = g.buf;
  const x0 = Math.max(0, Math.floor(cx - (w / 2) * s)), x1 = Math.min(W, Math.ceil(cx + (w / 2) * s));
  const y0 = Math.max(0, Math.floor(by - h * s)), y1 = Math.min(H, by);
  const is = 1 / s;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    const my = Math.floor(h - (by - y - 0.5) * is);
    if (my < 0 || my >= h) continue;
    for (let x = x0; x < x1; x++) {
      const mx = Math.floor(w / 2 + (x + 0.5 - cx) * is);
      if (mx < 0 || mx >= w) continue;
      const v = map[my * w + mx];
      if (v && v <= thr) { buf[y * W + x] = ink; n++; }
    }
  }
  g.cost.px += n; g.cost.box += Math.max(0, (x1 - x0) * (y1 - y0)) * 5;
}

function digitsOf(f) { return [+f.hh[0], +f.hh[1], +f.mm[0], +f.mm[1]]; }

// ------------------------------------------------------------ per-frame scratch (monomorphic, reused)

const P = Array.from({ length: 4 }, () => ({
  ax: 0, ay: 0, sx: 1, sy: 1, kx: 0, lookX: 0, lookY: 0, rattle: 0, eye: 1, lid: 0, mouth: 0,
  lift0: 0, lift1: 0, leg: 1, legs: true, sk: 256, ik: 256, fk: 256, th: 0, show: true, feat: true,
  arms: 0, hat: -1, roar: 0, tick: -1, shiver: 0, scrib: -1,
}));
const LUT = Array.from({ length: 10 }, () => new Uint16Array(5));
const WORLD = new Uint16Array(4), CLOUDL = new Uint16Array(4), GRASSL = new Uint16Array(4), HATL = new Uint16Array(4), STARL = new Uint16Array(4);

export default {
  name: 'Crayon',
  blurb: 'A child\'s notebook doodle: the four numerals are crayon monsters with googly eyes, stomping on the beat in line boil; each minute the old one is scribbled out and runs off, and the new one is drawn in.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, sec = f.sec, mk = f.minuteKey, night = ctx.night;
    ctx.lcd.backlight(1 - 0.62 * night);
    const boil = Math.floor((ctx.date.getTime() % 60000) / 83.333) % 3;   // 12 drawings a second
    const bstep = Math.floor(ctx.date.getTime() / 83.333);

    const cur = digitsOf(f);
    const next = digitsOf(clockFields(new Date(ctx.date.getTime() + 60000)));
    const prev = digitsOf(clockFields(new Date(ctx.date.getTime() - 60000)));
    const party = f.m === 0 && sec < 14;

    // ---- palette for this moment
    const nt = night;
    const paper = mixc(PAPER, PAPER_N, nt);
    const ink565 = to565(INK), pencil565 = to565(mixc(PENCIL, paper, 0.1));
    const white = mixc(WHITE, WHITE_N, nt);
    for (let d = 0; d < 10; d++) {
      const c = mixc(CRAYON[d], dim(CRAYON[d], 0.25), nt);
      const L = LUT[d];
      L[1] = to565(mixc(c, paper, 0.55)); L[2] = to565(c); L[3] = to565(dim(c, 0.28)); L[4] = ink565;
    }

    // ---- the page
    g.clear(paper);
    const rule = mixc(RULE, RULE_N, nt);
    for (const y of RULES) g.hline(12, y, W - 12, rule);
    g.vline(10, 0, H, mixc(MARGIN, MARGIN_N, nt));
    for (const hy of [13, 40, 66]) { g.fillCircle(4.5, hy + 0.5, 2.7, DESK); g.hline(3, hy - 2, 3, dim(paper, 0.18)); }

    // ---- sky: sun by day, moon and stars by night, a cloud
    const hour = f.h + f.m / 60;
    if (nt < 0.5) {
      const dusk = hour >= 17 ? prog(hour, 17, 20) : 0;
      const sc = mixc(SUN_C, SUN_DUSK, dusk);
      WORLD[1] = to565(mixc(sc, paper, 0.5)); WORLD[2] = to565(sc); WORLD[3] = to565(mixc(sc, 0xd0501e, 0.45));
      // rays: crayon strokes that turn slowly and boil
      const rot = sec * 0.02;
      for (let r = 0; r < 6; r++) {
        const a = Math.PI * 0.5 + (r + 0.2) * (Math.PI * 0.5 / 5.4) + rot + (rnd(r, bstep, 3) - 0.5) * 0.05;
        const ca = Math.cos(a), sa = Math.sin(a);
        const pulse = party ? 4 * Math.abs(sin(TAU * sec)) : 0;
        const r0 = 15 + (r & 1), r1 = 20 + (r & 1) * 2 + Math.sin(sec * TAU * 0.5 + r) * 1 + pulse;
        g.thickLine(SUN_CX + ca * r0, SUN_CY + sa * r0, SUN_CX + ca * r1, SUN_CY + sa * r1, 2, mixc(sc, 0xd0501e, 0.25));
      }
      blob(g, SUN, boil, SUN_CX - 14, SUN_CY - 14, WORLD);
    } else {
      WORLD[1] = to565(mixc(MOON_C, paper, 0.5)); WORLD[2] = to565(MOON_C); WORLD[3] = to565(mixc(MOON_C, 0xb09a40, 0.5));
      blob(g, MOON, boil, 134, -7, WORLD);
      STARL[1] = WORLD[1]; STARL[2] = WORLD[2]; STARL[3] = WORLD[3];
      const stars = [[96, 2], [118, 5], [66, 1], [30, 1]];
      for (let s = 0; s < stars.length; s++) {
        const tw = sin(sec * TAU * 0.25 + s * 1.7);
        if (tw > -0.6) blob(g, STAR, (boil + s) % 3, stars[s][0], stars[s][1] + (tw > 0.5 ? 0 : 0), STARL);
      }
    }
    {
      const cc = mixc(CLOUD_C, dim(CLOUD_C, 0.3), nt);
      CLOUDL[1] = to565(mixc(cc, paper, 0.55)); CLOUDL[2] = to565(cc); CLOUDL[3] = to565(dim(cc, 0.2));
      const cx = Math.round(98 + 14 * sin((sec / 60) * TAU));
      blob(g, CLOUD, boil, cx, 1, CLOUDL);
    }

    // ---- confetti behind everybody at the party
    if (party && sec > 1.1) {
      const fade = 1 - prog(sec, 12.5, 14);
      for (let c = 0; c < 28; c++) {
        if (rnd(c, 9, mk) > fade) continue;
        const vy = 9 + rnd(c, 1, mk) * 9, x = rnd(c, 2, mk) * 150 + 10 + 3 * sin(sec * 3 + c);
        const y = ((sec - 1.1) * vy + rnd(c, 3, mk) * 90) % 90 - 8;
        const col = CRAYON[c % 10], flip = ((sec * 4 + c) | 0) & 1;
        g.fillRect(Math.round(x), Math.round(y), flip ? 3 : 2, flip ? 1 : 2, mixc(col, paper, 0.15));
      }
    }

    // ---- grass
    {
      const gc = mixc(GRASS_C, dim(GRASS_C, 0.3), nt);
      GRASSL[1] = to565(mixc(gc, paper, 0.62)); GRASSL[2] = to565(mixc(gc, paper, 0.38)); GRASSL[3] = to565(gc);
      blob(g, GRASS, boil, 0, GRASS_Y, GRASSL);
    }

    // ---- what each monster is doing
    const roarer = (mk % 4 + 4) % 4, flyTo = (mk + 2) % 4;
    for (let i = 0; i < 4; i++) {
      const p = P[i], gl = GLYPHS[SLOT_S[i]][cur[i]];
      const W0 = SIZES[SLOT_S[i]].W;
      p.show = true; p.feat = true; p.legs = true; p.leg = 1; p.eye = 1; p.mouth = 0; p.arms = 0; p.hat = -1; p.roar = 0;
      p.sk = 256; p.ik = 256; p.fk = 256; p.th = 0; p.shiver = 0; p.tick = -1; p.scrib = -1;
      let amp = 1 - 0.5 * nt;                       // dozing monsters stomp softer
      // drawn in at the start of the minute
      const isNew = prev[i] !== cur[i];
      if (isNew && sec < 1.4) {
        p.sk = Math.floor(prog(sec, 0, 0.14) * 256);
        p.ik = Math.floor(outQ(prog(sec, 0.06, 0.5)) * 256);
        p.fk = Math.floor(prog(sec, 0.3, 0.85) * 256);
        p.eye = outBack(prog(sec, 0.5, 0.72));
        p.leg = outQ(prog(sec, 0.58, 0.82));
        p.feat = sec > 0.5;
        amp *= prog(sec, 0.85, 1.4);
      }
      // the beat
      const tsec = sec - BEAT_OFF[i];
      const tb = frac(tsec), nb = Math.floor(tsec);
      let dy = 0, sx = 1, sy = 1, dx = 0;
      if (tb >= 0.55) {
        if (tb < 0.86) dy = -3 * outQ(prog(tb, 0.55, 0.86));
        else { const v = prog(tb, 0.86, 1); dy = -3 * (1 - v * v); }
      }
      const q = tb < 0.28 ? (1 - tb / 0.28) ** 2 : 0;
      sy = 1 - 0.075 * q; sx = 1 + 0.05 * q;
      dy -= 1.0 * Math.max(0, sin(Math.PI * prog(tb, 0.12, 0.34)));
      const lift = tb >= 0.55 ? -dy * 1.4 : 0;
      p.lift0 = nb & 1 ? lift : 0; p.lift1 = nb & 1 ? 0 : lift;
      if (tb < 0.16) p.tick = nb & 1 ? 0 : 1;      // the foot that just came down
      let kx = 0.03 * sin(TAU * (sec * 0.5 + i * 0.3)) + 0.05 * (tb < 0.5 ? (1 - tb * 2) ** 3 : 0) * sin(TAU * tb * 4);
      p.rattle = tb < 0.45 ? (1 - tb / 0.45) ** 2 : 0;
      // where the eyes look
      const lw = Math.floor((sec + i * 1.3) / 2.6), lt = frac((sec + i * 1.3) / 2.6) * 2.6;
      const la = LOOKS[hash(lw, i, mk) % 8], lb = LOOKS[hash(lw - 1, i, mk) % 8], lu = inOut(prog(lt, 0, 0.18));
      p.lookX = lb[0] + (la[0] - lb[0]) * lu; p.lookY = lb[1] + (la[1] - lb[1]) * lu;
      // blink
      const bw = Math.floor((sec + i * 0.9) / 3.3);
      if (hash(bw, i, 7) % 3 === 0 && frac((sec + i * 0.9) / 3.3) * 3.3 > 1.6 && frac((sec + i * 0.9) / 3.3) * 3.3 < 1.74) p.lid = 1;
      else p.lid = nt > 0.5 ? 0.55 : 0;

      // flourish 1: a roar
      if (sec >= 12 && sec < 13.9 && !party) {
        const rr = prog(sec, 12, 12.18) * (1 - prog(sec, 13.6, 13.9));
        if (i === roarer) { p.mouth = rr; p.roar = rr; dx = rr > 0.9 ? (((sec * 30) | 0) & 1 ? 1 : -1) * 0.6 : 0; p.lookY = -0.6; p.lookX = 0; p.lid = 0; kx *= 0.3; }
        else {
          const jump = sin(Math.PI * prog(sec, 12.12, 12.5)) * 3;
          dy -= jump; p.lookX = roarer < i ? -1 : 1; p.lookY = 0; p.lid = 0;
          if (sec < 12.5) { p.lift0 = jump; p.lift1 = jump; }
        }
      }
      // flourish 2: a hop runs down the line
      if (sec >= 27 && sec < 29.6) {
        const t0 = 27.2 + i * 0.24, hq = prog(sec, t0, t0 + 0.5);
        if (hq > 0 && hq < 1) {
          const jh = sin(Math.PI * hq) * 7;
          dy = -jh; p.lift0 = jh * 0.8; p.lift1 = jh * 0.8; sy = 1 + 0.04 * sin(Math.PI * hq); sx = 1;
          p.lookY = -0.8; p.mouth = 0.4; p.rattle = 0;
        }
        if (hq >= 1 && sec < t0 + 0.75) { const sq = 1 - prog(sec, t0 + 0.5, t0 + 0.75); sy = 1 - 0.1 * sq; sx = 1 + 0.07 * sq; p.rattle = sq; }
      }
      // flourish 3: the fly (looked at, then chomped)
      if (sec >= 42.6 && sec < 46.2 && !party) {
        if (i === flyTo && sec >= 43.9 && sec < 45.4) { p.lookX = 0; p.lookY = -1; }
        if (i === flyTo && sec >= 45 && sec < 45.4) p.mouth = sin(Math.PI * prog(sec, 45, 45.3));
        if (i !== flyTo && sec >= 42.6 && sec < 45.2) {
          const fx = flyPos(sec, mk, flyTo)[0];
          p.lookX = fx < SLOT_X[i] ? -1 : fx > SLOT_X[i] + W0 ? 1 : 0; p.lookY = -0.6;
        }
      }
      // the party
      if (party && sec >= 1.0) {
        const pa = prog(sec, 1.0, 1.6) * (1 - prog(sec, 12.4, 13.4));
        const bounce = Math.abs(sin(TAU * (sec - 1.0)));
        dy = -5 * bounce * pa + dy * (1 - pa);
        const land = 1 - bounce;
        sy = 1 - 0.06 * pa * land * land * land; sx = 1 + 0.04 * pa * land * land * land;
        p.lift0 = 4 * bounce * pa; p.lift1 = 4 * bounce * pa;
        p.arms = pa; p.mouth = Math.max(p.mouth, pa * (0.45 + 0.35 * sin(sec * TAU * 2 + i)));
        const sa = sec * TAU * 1.4 + i * 1.5;
        p.lookX = Math.cos(sa) * pa + p.lookX * (1 - pa); p.lookY = Math.sin(sa) * pa + p.lookY * (1 - pa);
        p.lid = 0; p.rattle = 0;
        p.hat = prog(sec, 1.0, 1.7);
        if (sec > 12.6) p.hat = 2 + prog(sec, 12.6, 13.5);      // thrown off
      }
      // the minute turn, old side: dread, then the scribble
      const isOld = next[i] !== cur[i];
      if (isOld && sec >= 57.3) {
        const dread = prog(sec, 57.3, 57.6);
        p.lookX = 0.35; p.lookY = -1; p.lid = 0; p.eye = 1 + 0.18 * dread;
        p.shiver = dread;
        dx += Math.round(sin(sec * TAU * 7 + i) * 0.9 * dread);
        if (sec >= 58.7) {
          // legs kick under the scribble, eyes dart
          p.lift0 = 3 * Math.max(0, sin(sec * TAU * 5)); p.lift1 = 3 * Math.max(0, -sin(sec * TAU * 5));
          p.lookX = sin(sec * TAU * 3 + i); p.lookY = -0.3;
          p.th = Math.floor(prog(sec, 59.0, 59.45) * 257);
          p.scrib = Math.floor(inOut(prog(sec, 58.7, 59.45)) * 255);
        }
        if (sec >= 59.45) { p.show = false; }
      }
      amp = Math.max(0, amp);
      dy *= amp; kx *= amp;
      sy = 1 + (sy - 1) * amp; sx = 1 + (sx - 1) * amp;
      p.lift0 *= amp; p.lift1 *= amp; p.rattle *= amp;
      p.ax = SLOT_X[i] + W0 / 2 + Math.round(dx); p.ay = BOTTOM + Math.round(dy);
      p.sx = sx; p.sy = sy; p.kx = kx;
      if (!p.show) continue;
      drawMonster(g, i, gl, cur[i], boil, bstep, p, white, pencil565, nt);
    }

    // ---- the child's felt-tip and crayon drawing the newest monster in
    if (prev[3] !== cur[3] && sec < 1.0) drawTools(g, GLYPHS[1][cur[3]], P[3], sec, cur[3]);

    // ---- the minute turn: scribble-out, tangle, run
    for (let i = 0; i < 4; i++) {
      // this minute's leaving monsters
      if (next[i] !== cur[i] && sec >= 59.45) tangle(g, i, sec - 58.7, cur[i], P[i], white, bstep);
      // last minute's, still running
      if (prev[i] !== cur[i] && sec < 1.6) tangle(g, i, sec + 60 - 58.7, prev[i], null, white, bstep);
    }

    // ---- the colon: two felt-tip dots that hop on the beat
    {
      const b = frac(sec);
      const hop = b > 0.75 ? Math.round(sin(Math.PI * prog(b, 0.75, 1)) * 2) : 0;
      g.fillCircle(87, 36.5 - hop, 2.4, INK);
      g.fillCircle(87, 50.5 - hop, 2.4, INK);
    }

    // ---- the fly
    if (sec >= 42 && sec < 46.6 && !party) drawFly(g, sec, mk, flyTo, pencil565, bstep);
  },
};

// ------------------------------------------------------------ the monster

function toScreen(p, gl, mx, my, out) {
  const bx = M + (gl.MW - 2 * M) / 2, by = gl.bottom + 1;
  const Y = p.ay + (my - by) * p.sy;
  out[0] = p.ax + (mx - bx) * p.sx + p.kx * (p.ay - Y);
  out[1] = Y;
  return out;
}
const T0 = [0, 0], T1 = [0, 0];

function drawMonster(g, i, gl, d, boil, bstep, p, white, pencil, nt) {
  const lut = LUT[d];
  const j = (n) => (rnd(i * 7 + n, bstep, 41) - 0.5) * 0.8;     // the boil of the felt-tip features
  // legs first, behind the body
  if (p.legs && p.leg > 0) {
    for (let h = 0; h < 2; h++) {
      const hip = gl.hips[h];
      toScreen(p, gl, hip.x, hip.y, T0);
      const side = h === 0 ? -1 : 1;
      const lift = h === 0 ? p.lift0 : p.lift1;
      const fxg = T0[0] + side * 2.2, fyg = GROUND - lift;
      const fx = T0[0] + (fxg - T0[0]) * p.leg + j(h), fy = T0[1] + (fyg - T0[1]) * p.leg;
      g.thickLine(T0[0], T0[1], fx, fy - 1, 2.1, INK);
      if (p.leg > 0.6) g.fillEllipse(fx + side * 1.4, fy - 0.6, 2.9, 1.6, INK);
      if (p.tick === h && lift < 0.5) {
        // impact ticks either side of the foot that just stomped
        g.thickLine(fx + side * 1.4 - 5, fy - 1, fx + side * 1.4 - 7, fy - 3, 1.4, INK);
        g.thickLine(fx + side * 1.4 + 5, fy - 1, fx + side * 1.4 + 7, fy - 3, 1.4, INK);
      }
    }
  }
  body(g, gl, boil, lut, p.ax, p.ay, p.sx, p.sy, p.kx, p.sk, p.ik, p.fk, p.th, pencil);
  if (p.scrib >= 0) {
    // the felt-tip scribbling it out, over the body but under its eyes
    const s = SLOT_S[i];
    scribble(g, SCRIBBLE[s], p.scrib, 1, SLOT_X[i] + SIZES[s].W / 2, BOTTOM + 2, to565(INK));
  }
  if (!p.feat) return;
  // party hat (behind the eyes), or the monster's own horns, tuft or feelers
  if (p.hat >= 0) drawHat(g, i, gl, p, boil);
  else if (p.scrib < 0) drawDeco(g, i, gl, d, p, bstep);
  // mouth
  if (p.scrib < 0) {
    toScreen(p, gl, gl.mouth.x, gl.mouth.y, T0);
    const w = Math.round(gl.mouth.w * p.sx), h = 2 + Math.round(3 * p.mouth);
    const x0 = Math.round(T0[0] - w / 2), y0 = Math.round(T0[1] - 1 - (h - 2) / 2);
    g.fillRect(x0, y0, w, h, INK);
    if (h >= 4) {
      g.fillRect(x0 + 1, y0 + 1, w - 2, h - 2, GULLET);
      for (let x = x0 + 1; x < x0 + w - 1; x += 2) { g.fillRect(x, y0 + 1, 1, 1, white); g.fillRect(x + 1, y0 + h - 2, 1, 1, white); }
    } else {
      g.fillRect(x0 + 1, y0 + 2, 2, 2, white);
      if (w >= 7) g.fillRect(x0 + w - 3, y0 + 2, 2, 2, white);
    }
  }
  // googly eyes
  for (let e = 0; e < gl.eyes.length; e++) {
    const ey = gl.eyes[e];
    toScreen(p, gl, ey.x, ey.y, T0);
    const r = ey.r * p.eye;
    if (r < 0.8) continue;
    const cx = Math.round(T0[0] * 2) / 2 + j(e + 3) * 0.5, cy = Math.round(T0[1] * 2) / 2;
    g.fillCircle(cx, cy, r, white);
    g.ring(cx, cy, r - 1.05, r + 0.25, INK);
    const pr = Math.max(1.25, r * 0.38), reach = Math.max(0, r - pr - 1.0);
    let lx = p.lookX, ly = p.lookY + p.rattle * 0.9 * Math.cos(p.rattle * 18);
    const ll = Math.hypot(lx, ly);
    if (ll > 1) { lx /= ll; ly /= ll; }
    g.fillCircle(cx + lx * reach, cy + ly * reach, pr, INK);
    if (p.lid > 0) {
      // heavy lid: the top of the eye in the monster's crayon, with a felt-tip lid line
      const ly0 = cy - r + 2 * r * p.lid * (p.lid >= 1 ? 1 : 0.9);
      g.clip(cx - r - 1, cy - r - 1, 2 * r + 2, ly0 - (cy - r - 1));
      g.fillCircle(cx, cy, r - 0.6, from565c(LUT[d][2]));
      g.unclip();
      g.thickLine(cx - r + 0.8, ly0, cx + r - 0.8, ly0, 1.6, INK);
    }
  }
  // arms up at the party
  if (p.arms > 0) {
    const e0 = gl.eyes[0], e1 = gl.eyes[gl.eyes.length - 1];
    const wave = sin(bstep * 0.26 + i) * 0.35;
    for (let s = 0; s < 2; s++) {
      const ey = s === 0 ? e0 : e1, side = s === 0 ? -1 : 1;
      toScreen(p, gl, ey.x + side * (ey.r + 1), ey.y + 5, T0);
      const ang = -Math.PI / 2 + side * (0.5 + wave * side) ;
      const L = 7 * p.arms;
      const hx = T0[0] + Math.cos(ang) * L, hy = T0[1] + Math.sin(ang) * L;
      g.thickLine(T0[0], T0[1], hx, hy, 1.8, INK);
      // three fingers
      for (let k = -1; k <= 1; k++) {
        const a2 = ang + k * 0.6;
        g.thickLine(hx, hy, hx + Math.cos(a2) * 2.2, hy + Math.sin(a2) * 2.2, 1.3, INK);
      }
    }
  }
  // roar strokes
  if (p.roar > 0.5) {
    toScreen(p, gl, gl.hat.x, gl.hat.y, T0);
    const top = T0[1] - 5;
    for (let k = -1; k <= 1; k++) {
      const a = -Math.PI / 2 + k * 0.55 + (rnd(k + 2, bstep, 5) - 0.5) * 0.12;
      const r0 = 3 + (bstep & 1), r1 = r0 + 4;
      g.thickLine(T0[0] + Math.cos(a) * r0, top + Math.sin(a) * r0, T0[0] + Math.cos(a) * r1, top + Math.sin(a) * r1, 1.7, INK);
    }
  }
  // sweat drops of dread
  if (p.shiver > 0) {
    for (let s = 0; s < 2; s++) {
      const ph = frac(bstep / 6 + s * 0.5), side = s ? 1 : -1;
      const e = gl.eyes[s ? gl.eyes.length - 1 : 0];
      toScreen(p, gl, e.x + side * (e.r + 1), e.y, T0);
      const x = T0[0] + side * ph * 6, y = T0[1] - 2 - ph * 4 + ph * ph * 9;
      g.fillCircle(x, y, 1.3, SWEAT);
    }
  }
}

const DECO = [1, 2, 3, 0, 0, 1, 2, 1, 3, 2];     // per numeral: 1 horns, 2 tuft, 3 feelers
const BONE = 0xfbf4dc;
const HP = [[0, 0], [0, 0], [0, 0]];
function headTop(gl) {
  let hx = gl.hat.x, hy = gl.hat.y;
  for (const e of gl.eyes) if (Math.abs(e.x - hx) < 4) hy = Math.min(hy, e.y - e.r + 0.5);
  return [hx, hy];
}
function drawDeco(g, i, gl, d, p, bstep) {
  const kind = DECO[d];
  if (!kind) return;
  const j = (n) => (rnd(i * 5 + n, bstep, 43) - 0.5) * 0.7;
  if (kind === 1) {
    for (let s = -1; s <= 1; s += 2) {
      const e = s < 0 ? gl.eyes[0] : gl.eyes[gl.eyes.length - 1];
      const hx = Math.max(M + 2, Math.min(gl.MW - M - 3, e.x + s * (e.r + 1.6)));
      const by = gl.tops[Math.round(hx)] + 1.5;
      toScreen(p, gl, hx - 2.2, by, T0); HP[0][0] = T0[0]; HP[0][1] = T0[1];
      toScreen(p, gl, hx + 2.2, by, T0); HP[1][0] = T0[0]; HP[1][1] = T0[1];
      toScreen(p, gl, hx + s * 2.6, by - 7, T0); HP[2][0] = T0[0] + j(s); HP[2][1] = T0[1];
      g.fillPolygon(HP, INK);
      const cx = (HP[0][0] + HP[1][0] + HP[2][0]) / 3, cy = (HP[0][1] + HP[1][1] + HP[2][1]) / 3;
      for (const q of HP) { q[0] = cx + (q[0] - cx) * 0.45; q[1] = cy + (q[1] - cy) * 0.5 + 0.4; }
      g.fillPolygon(HP, BONE);
    }
    return;
  }
  const [hx, hy] = headTop(gl);
  toScreen(p, gl, hx, hy, T0);
  const x = T0[0], y = T0[1] + 0.5;
  if (kind === 2) {
    for (let k = -1; k <= 1; k++) {
      const a = -Math.PI / 2 + k * 0.5 + p.kx * 3 + j(k + 2) * 0.2, L = k ? 4.5 : 5.5;
      g.thickLine(x + k, y, x + k + Math.cos(a) * L, y + Math.sin(a) * L, 1.5, INK);
    }
    return;
  }
  // feelers: they lag the bounce
  const lag = -p.kx * 20;
  for (let s = -1; s <= 1; s += 2) {
    const x0 = x + s * 2.5, tx = x0 + s * 3.5 + lag + j(s), ty = y - 8;
    g.thickLine(x0, y, tx, ty, 1.5, INK);
    g.fillCircle(tx, ty, 1.9, INK);
  }
}

function from565c(v) {
  const r = (v >> 11) & 31, gg = (v >> 5) & 63, b = v & 31;
  return ((r << 3) | (r >> 2)) << 16 | ((gg << 2) | (gg >> 4)) << 8 | ((b << 3) | (b >> 2));
}

function drawHat(g, i, gl, p, boil) {
  let hx = gl.hat.x, hy = gl.hat.y;
  for (const e of gl.eyes) if (Math.abs(e.x - hx) < 4) hy = Math.min(hy, e.y - e.r + 1);
  toScreen(p, gl, hx, hy, T0);
  let x = T0[0], y = T0[1] + 1;
  const t = p.hat;
  if (t < 1) y -= (1 - outBounceish(t)) * 30;
  else if (t > 2) { y -= (t - 2) * (t - 2) * 60; x += (t - 2) * 14 * (i & 1 ? 1 : -1); }
  const c = HAT_C[(i + 2) % 6];
  HATL[1] = to565(mixc(c, 0xffffff, 0.5)); HATL[2] = to565(c); HATL[3] = to565(dim(c, 0.25));
  blob(g, HAT, boil, Math.round(x - 6), Math.round(y - 13), HATL);
  g.fillCircle(Math.round(x), Math.round(y - 13), 1.8, 0xf0bf1c);
}
const outBounceish = (t) => (t < 0.7 ? (t / 0.7) ** 2 : 1 - 0.25 * sin(Math.PI * (t - 0.7) / 0.3));

// ------------------------------------------------------------ the child's tools

const PEN_BODY = 0x3b4157, PEN_CAP = 0x23262f, WRAP = 0xf4ecd0;
function drawTools(g, gl, p, sec, d) {
  // the felt-tip, its nib on the point of the writing path being inked
  const pu = prog(sec, 0.06, 0.5), pin = prog(sec, 0.0, 0.08), pout = prog(sec, 0.5, 0.62);
  if (pout < 1) {
    const q = Math.min(64, Math.floor(outQ(pu) * 64));
    toScreen(p, gl, gl.pen[q * 2], gl.pen[q * 2 + 1], T0);
    const off = (1 - pin) * 40 + pout * 40;
    const tx = T0[0] + off * 0.75, ty = T0[1] - off * 0.65;
    tool(g, tx, ty, 0.75, -0.66, 26, 4.6, PEN_BODY, PEN_CAP, INK, 2.4);
  }
  // the crayon, scribbling back and forth down the body
  const cin = prog(sec, 0.28, 0.4), cout = prog(sec, 0.82, 0.98);
  if (sec >= 0.28 && cout < 1) {
    const cp = prog(sec, 0.3, 0.85);
    const cx = p.ax + 8 * sin(sec * TAU * 4.5), cy = p.ay - 40 + 36 * cp;
    const off = (1 - cin) * 40 + cout * 40;
    const c = CRAYON[d];
    tool(g, cx + off * 0.7, cy - off * 0.7, 0.7, -0.72, 22, 5, c, mixc(c, 0xffffff, 0.75), dim(c, 0.2), 3.2);
  }
}

/** A drawing tool lying at an angle: its point at (x, y), its body along (ux, uy). */
function tool(g, x, y, ux, uy, len, wid, body, band, tip, tipLen) {
  g.thickLine(x + ux * (tipLen + 1), y + uy * (tipLen + 1), x + ux * len, y + uy * len, wid, body);
  g.thickLine(x + ux * (tipLen + 5), y + uy * (tipLen + 5), x + ux * (tipLen + 12), y + uy * (tipLen + 12), wid + 0.2, band);
  g.fillPolygon([[x, y], [x + ux * tipLen - uy * wid * 0.45, y + uy * tipLen + ux * wid * 0.45], [x + ux * tipLen + uy * wid * 0.45, y + uy * tipLen - ux * wid * 0.45]], tip);
}

// ------------------------------------------------------------ the scribble-out and the run

function tangle(g, i, t, d, p, white, bstep) {
  // t: seconds since the scribble began (58.7)
  const s = SLOT_S[i], sc = SCRIBBLE[s], size = SIZES[s];
  const cx0 = SLOT_X[i] + size.W / 2, by0 = BOTTOM + 2;
  const thr = Math.floor(inOut(prog(t, 0, 0.75)) * 255);
  const cont = inOut(prog(t, 0.75, 1.02));
  const scale = 1 - 0.66 * cont;
  let cx = cx0, by = by0;
  const tr = t - 1.02;
  if (tr > 0) {
    cx += 48 * tr + 95 * tr * tr;
    by = by0 + 8 * Math.min(1, tr * 4) - Math.abs(sin(tr * TAU * 3.2)) * 3;
  } else by = by0 + 8 * cont;
  if (cx - 10 > W) return;
  scribble(g, sc, thr, scale, cx, Math.round(by), to565(INK));
  // its eyes, panicked, on top of the tangle
  const er = 3.1;
  const ey = by - sc.h * scale + (cont > 0 ? 2 + 3 * cont : 5);
  for (let e = -1; e <= 1; e += 2) {
    const ex = cx + e * (3.2 + 5 * (1 - cont));
    g.fillCircle(ex, ey, er, white);
    g.ring(ex, ey, er - 1.2, er + 0.2, INK);
    g.fillCircle(ex + 1.1 + (tr > 0 ? 0.4 : 0), ey - 0.4 + (bstep & 1) * 0.6, 1.3, INK);
  }
  // running legs
  if (tr > 0) {
    const ph = sin(tr * TAU * 6.4);
    for (let k = -1; k <= 1; k += 2) {
      const lx = cx + k * 2.5, ly = by - 1;
      g.thickLine(lx, ly, lx + ph * k * 3, ly + 4, 1.7, INK);
    }
    // speed lines
    for (let k = 0; k < 3; k++) g.hline(Math.round(cx - 12 - k * 3), Math.round(by - 4 - k * 4), 5, to565(PENCIL));
  }
}

// ------------------------------------------------------------ the fly

function flyPos(sec, mk, to) {
  const gl = GLYPHS[SLOT_S[to]][0];
  const hx = SLOT_X[to] + SIZES[SLOT_S[to]].W / 2, hy = BOTTOM - SIZES[SLOT_S[to]].H - 6;
  if (sec < 44) {
    const q = prog(sec, 42, 44);
    return [-4 + (hx + 4) * q + 14 * Math.sin(q * TAU * 1.5) * (1 - q), 6 + (hy - 6) * q + 4 * Math.cos(q * TAU * 2) * (1 - q) - 2 * (1 - q)];
  }
  if (sec < 45.05) return [hx + Math.sin(sec * 9) * 0.6, hy];
  const q = prog(sec, 45.05, 46.5);
  return [hx + 40 * q + 6 * Math.sin(q * 12), hy - 30 * q * q * 1.4 - 6 * q];
}

function drawFly(g, sec, mk, to, pencil, bstep) {
  // the dotted flight path, a few dashes behind
  for (let k = 1; k <= 8; k++) {
    const ts = sec - k * 0.09;
    if (ts < 42) break;
    const [x, y] = flyPos(ts, mk, to);
    if ((k & 1) === 0) g.fillRect(Math.round(x), Math.round(y), 2, 1, pencil);
  }
  const [x, y] = flyPos(sec, mk, to);
  const flap = bstep & 1;
  g.fillEllipse(x - 1.6, y - 2.2 - flap, 1.8, 1.3, 0xffffff);
  g.fillEllipse(x + 1.6, y - 2.2 - flap, 1.8, 1.3, 0xffffff);
  g.circle(Math.round(x - 1.6), Math.round(y - 2.2 - flap), 2, PENCIL);
  g.circle(Math.round(x + 1.6), Math.round(y - 2.2 - flap), 2, PENCIL);
  g.fillCircle(x, y, 1.7, INK);
}
