// Tomb: a painted wall in a Theban tomb, and the time is written in its
// signs. Each numeral is one sign of the hieroglyphic script, alive: the
// serpents (2 3 5 6 9, and the 4, a cobra coiled on a reed staff) slither
// in place, their chevron bands crawling toward the head, a kink running
// down the body and the tongue flicking on every beat; the reeds (1, 7) sway
// from side to side on the beat, a gleam running up the stem; the ropes
// (0 the shen ring, 8 the twisted-flax sign) turn, their twist rolling on
// the beat. The sky goddess Nut arches over the whole register, her starry
// body along the top, her hands and feet on the earth at either end. Hours
// stand tall at the left; the minutes are smaller (the Egyptian hierarchy of
// scale) above a sub-register of the Nile, a pool of zigzag water with fish.
//
// Every ~15 s a flourish: the north wind (reeds bow in a wave, the water
// races, kinks run down every serpent), the serpents hiss and rear (tongues
// out in a cascade, bands surge), the heron at the pool's end strikes a fish.
//
// Minute turn, the painter's own process: the old sign's paint flakes off
// the wall in 2 px flakes that fall to the ground line; the painter's red
// grid is snapped in the empty place; the red ochre sketch dabs in (the new
// numeral, whole, in outline); the master's black brush corrects along it;
// then the colours are laid in from the head down, and the creature wakes.
// Hour: Ra's barque sails along Nut's body from her mouth to her feet, the
// sky lightening round the disk, its rays reaching down to the register in
// little hands (Amarna fashion) over a fan of gold on the bare plaster, and
// each sign greets it as it passes (serpents rear, reeds lean, ropes pull).
//
// Palette: the tomb painter's six pigments and nothing else: gypsum plaster,
// carbon black, red and yellow ochre, Egyptian blue, malachite green, plus
// lighter grinds of each, and the mud brick where plaster has flaked. Every
// numeral has a black keyline (the master's outline), so the time is the
// strongest contrast on the wall. Hard pixels everywhere: a wall painting is
// flat colour. Night: the plaster sinks into lamp shadow (a darker buff,
// faded in by dither over the night minute) and the backlight dims.
//
// Cost: the numerals are table lookups (tomb-glyphs.js, rasterised once into
// flash, ~140 KB); the wall is two 25.6 KB flash copies (day, night);
// everything else is sprites, lines and small loops. No per-minute caches;
// every frame is built cold. RAM: two 72-entry row tables.

import { clockFields, hash, sin, ease, progress, to565, from565 } from '../js/kit.js';
import { rasterise, SNAKE, REED, ROPE, M } from './tomb-glyphs.js';
import {
  W, H, P, PN, WALL, WALL_N, STAR, STARS, FISH, BARQUE, RAYHAND, HERON,
  BAND_Y1, ARM_X1, LEG_X0, GROUND, SUB_Y, NILE, COL,
} from './tomb-art.js';

// ------------------------------------------------------------ the numerals (flash)

const SIZE = { hr: [30, 54, 3.5], mn: [23, 40, 3.0] };
const GLY = {};
for (const k of Object.keys(SIZE)) GLY[k] = Array.from({ length: 10 }, (_, d) => rasterise(d, ...SIZE[k]));
const SLOTS = [
  { x: 13, y: 16, sz: 'hr' }, { x: 46, y: 16, sz: 'hr' },
  { x: 97, y: 16, sz: 'mn' }, { x: 124, y: 16, sz: 'mn' },
];

// colours of each sign's lines: [body, band, head]
const SPECIES = {
  2: [[P.blue, P.ochreL]], 3: [[P.ochre, P.red]], 4: [[P.red, P.ochreL], null], 5: [[P.green, P.ochreL]],
  6: [[P.ochre, P.blue]], 9: [[P.ochre, P.green]],
};
const C = {};
for (const k in P) C[k] = to565(P[k]);
C.gold = to565(0xf3d68e); C.gold2 = to565(0xe8c87c); C.ngrid = to565(0xae8660); C.nplaster = to565(PN.plaster); C.nplaster2 = to565(PN.plaster2);

/** Per digit, per line: a colour table for the pattern, by kind. */
function lineLut(d, li, kind) {
  if (kind === SNAKE) {
    const [body, band] = SPECIES[d][li];
    const b = to565(band), o = to565(body);
    return Uint16Array.from([b, b, o, o, o, o, o, to565(body)]);   // 7 steps, then the head colour
  }
  if (kind === REED) return Uint16Array.from([C.green, C.greenL, C.greenD, C.greenL]);   // stem, shine, node, gleam
  return Uint16Array.from([C.ochreD, C.ochre, C.ochre, C.ochreL]);                        // twist, cord, cord, cord-light
}
const LUTS = Array.from({ length: 10 }, (_, d) => GLY.hr[d].lines.map((ln, li) => lineLut(d, li, ln.k)));

// 16 x 16 shuffled ranks for even dissolves (flaking, dabbing), by 2 px cells
const RANK = new Uint8Array(256);
{ const idx = Array.from({ length: 256 }, (_, i) => i); for (let i = 255; i > 0; i--) { const j = hash(i, 77) % (i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; } idx.forEach((v, i) => { RANK[v] = i; }); }
const rankAt = (x, y) => RANK[(((y >> 1) & 15) << 4) | ((x >> 1) & 15)];

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const PAD = 4, ROWS = new Int8Array(72), SRC = new Int16Array(72);   // per output row: x shift, source row (-1 none)

// ------------------------------------------------------------ one sign

/**
 * Paint glyph G (digit d) with its box origin at (ox, oy).
 * st: { live, ph, ropePh, gleam, rows (row shifts), flake (0..1 removed),
 *       paint: null | { sketch, ink, fill } }
 */
function sign(g, G, d, ox, oy, st) {
  const buf = g.buf, bw = G.bw, bh = G.bh, mat = G.mat, U = G.u, V = G.v, S = G.s, luts = LUTS[d], lines = G.lines;
  const flake = st.flake, pt = st.paint;
  const fl = (flake * 256) | 0;
  let n = 0;
  for (let yo = -PAD; yo < bh; yo++) {
    const yy = oy + yo, y = st.src[yo + PAD];
    if (yy < 0 || yy >= H || y < 0) continue;
    const dx = st.rows[yo + PAD], row = yy * W;
    for (let x = 0; x < bw; x++) {
      const i = y * bw + x, m = mat[i];
      if (m === 0) continue;
      const xx = ox + x + dx;
      if (xx < 0 || xx >= W) continue;
      n++;
      if (fl > 0 && rankAt(xx, yy) < fl) continue;      // flaked off
      const li = S[i], ln = lines[li], lut = luts[li], u = U[i];
      let c;
      if (pt) {
        // the painter: sketch, then the black outline, then the colour
        const un = ln.head && ln.headEnd ? 1 - u / ln.L : u / ln.L;
        if (m === 1) {
          if (u / ln.L < pt.ink) c = C.ink;
          else if (rankAt(xx + 1, yy) < pt.sketch * 256) c = C.sketch;
          else continue;
          buf[row + xx] = c; continue;
        }
        if (un >= pt.fill) continue;
      }
      if (m === 1 || m === 3) c = C.ink;
      else if (ln.k === SNAKE) {
        if (m === 4) c = lut[7];
        else {
          const v = V[i] < 0 ? -V[i] : V[i];
          c = lut[(((u + ln.dir * st.ph + (v >> 1)) % 7) + 7) % 7];
        }
      } else if (ln.k === REED) {
        const gl = (u - st.gleam + 512) & 63;
        c = gl < 3 ? lut[3] : (u % 11 === 5 && !ln.leaf) ? lut[2] : V[i] <= -2 ? lut[1] : lut[0];
      } else {
        c = lut[(u + (V[i] >> 1) + st.ropePh + 1024) & 3];
        if (c === lut[1] && V[i] <= -3) c = lut[3];
      }
      buf[row + xx] = c;
    }
  }
  g.cost.box += n * 6 + bw * (bh + PAD);
}

// direction of travel along each line (toward the head) and which end is the head
for (const k of Object.keys(GLY)) for (let d = 0; d < 10; d++) {
  for (const ln of GLY[k][d].lines) {
    ln.headEnd = false; ln.dir = 1;
    if (ln.head) {
      const [hx, hy] = ln.head, e = ln.P[ln.P.length - 1];
      ln.headEnd = Math.abs(hx - e[0]) < 1e-6 && Math.abs(hy - e[1]) < 1e-6;
      ln.dir = ln.headEnd ? -1 : 1;     // bands crawl toward the head
    }
  }
}

// ------------------------------------------------------------ the tongue and the brush

function tongue(g, G, ox, oy, rows, len, r, lift) {
  for (const ln of G.lines) {
    if (!ln.head || len <= 0) continue;
    const [hx, hy, tx, ty] = ln.head;
    const yr = Math.max(0, Math.min(G.bh - 1, Math.floor(hy - lift)));
    const x0 = ox + hx + tx * r + rows[yr + PAD], y0 = oy + hy - lift + ty * r;
    const x1 = x0 + tx * len, y1 = y0 + ty * len;
    g.line(Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1), P.red);
    if (len > 2.5) {
      const nx = -ty, ny = tx;
      g.line(Math.round(x1), Math.round(y1), Math.round(x1 + tx * 1.5 + nx * 1.5), Math.round(y1 + ty * 1.5 + ny * 1.5), P.red);
      g.line(Math.round(x1), Math.round(y1), Math.round(x1 + tx * 1.5 - nx * 1.5), Math.round(y1 + ty * 1.5 - ny * 1.5), P.red);
    }
  }
}

/** The master's brush at fraction q along each line of G (the black outline's front). */
function brush(g, G, ox, oy, q) {
  for (const ln of G.lines) {
    const target = q * ln.raw, cum = ln.cum;
    let k = 1;
    while (k < cum.length - 1 && cum[k] < target) k++;
    const [x, y] = ln.P[k];
    const bx = ox + x, by = oy + y;
    // a reed brush held slanting: a dark tip and a lighter shaft
    g.thickLine(bx, by, bx + 4, by - 7, 1.4, P.ochreD);
    g.thickLine(bx, by, bx + 1.2, by - 2, 1.6, P.ink);
  }
}

// ------------------------------------------------------------ the world

function stars(g, T, night, sunX) {
  for (let k = 0; k < STARS.length; k++) {
    let [x, y] = STARS[k];
    // the decans march along her body (the star clock of the coffin lids)
    if (y < BAND_Y1) x = ((x + Math.floor(T * 1.5)) % 162) - 3;
    const tw = (hash(k, Math.floor(T * 2.5 + k * 0.37), 5) & 7) === 0;
    if (sunX > -99 && Math.abs(x + 2 - sunX) < 16 && y < BAND_Y1) continue;   // drowned by the sun's light
    if (tw) g.pixel(x + 2, y + 1, P.white);
    else g.blit(STAR, x, y);
  }
}

function nile(g, s, T, gust, heronT) {
  const buf = g.buf, x0 = NILE.x0, x1 = NILE.x1, top = 60, bot = NILE.y1;
  // the pool: blue, ruled with the black zigzags of the water sign
  const sp = 1 + 2.5 * gust;
  const ph = [Math.floor(T * 3 * sp), Math.floor(T * 2.2 * sp + 3)];
  const ZZ = [0, 1, 2, 2, 1, 0];
  for (let y = top; y < bot; y++) {
    const row = y * W;
    for (let x = x0; x < x1; x++) {
      let c = C.blue;
      if (y === top) c = C.ink;
      else for (let k = 0; k < 2; k++) {
        const yk = top + 2 + k * 5;
        if (y - yk === ZZ[(x + ph[k]) % 6]) { c = C.blueD; break; }
      }
      buf[row + x] = c;
    }
  }
  g.cost.box += (bot - top) * (x1 - x0) * 5;
  // two fish in it
  for (let k = 0; k < 2; k++) {
    const per = k ? 23 : 17, u = (T / per + k * 0.4) % 1, back = u > 0.5;
    const e = back ? 1 - (u - 0.5) * 2 : u * 2;
    const fx = x0 + 1 + (x1 - x0 - 12) * ease.inOutQuad(e), fy = top + 2 + k * 4 + Math.round(sin(T * 2 + k));
    g.blit(FISH, fx, fy, { flipX: !back });
  }
  // the heron at the far end of the pool; at its flourish it strikes and eats
  let pose = 0;
  if (heronT >= 0) pose = heronT < 0.35 ? 0 : heronT < 0.75 ? 1 : heronT < 2.2 ? 2 : 0;
  g.blit(HERON[pose], x1 - 13, NILE.y0, {});
}

/** Ra's barque along Nut's body; returns the disk's x. */
function barque(g, s) {
  const bx = -26 + (W + 30) * ease.inOutQuad(progress(s, 0.3, 11.6));
  const cx = bx + 12;
  // daylight round the disk: Nut's body lightens to the pale blue of day
  const buf = g.buf, b = C.blue, bl = C.blueL;
  for (let y = 0; y < BAND_Y1; y++)
    for (let x = Math.max(0, Math.floor(cx - 20 + y * 0.5)); x < Math.min(W, Math.ceil(cx + 20 - y * 0.5)); x++)
      if (buf[y * W + x] === b) buf[y * W + x] = bl;
  g.cost.box += BAND_Y1 * 40 * 2;
  // the rays reach down into the register, ending in little hands; between
  // them the plaster is washed with the sun's gold (only the bare wall: the
  // signs are painted over it)
  const a = sm(progress(s, 0.8, 2.0)) * (1 - sm(progress(s, 10.4, 11.4)));
  if (a > 0) {
    const pl = C.plaster, pl2 = C.plaster2, npl = C.nplaster, npl2 = C.nplaster2, gold = C.gold, gold2 = C.gold2, yEnd = BAND_Y1 + 1 + Math.round((GROUND - BAND_Y1 - 2) * a);
    let nn = 0;
    for (let y = BAND_Y1 + 1; y < yEnd; y++) {
      const hw = 3 + (y - BAND_Y1) * 0.95, row = y * W;
      const xa = Math.max(ARM_X1 + 1, Math.round(cx - hw)), xb = Math.min(LEG_X0, Math.round(cx + hw));
      for (let x = xa; x < xb; x++) { const v = buf[row + x]; if (v === pl || v === npl) buf[row + x] = gold; else if (v === pl2 || v === npl2) buf[row + x] = gold2; }
      nn += Math.max(0, xb - xa);
    }
    g.cost.box += nn * 3;
    const len = (GROUND - BAND_Y1 - 4) * a;
    for (let k = -3; k <= 3; k++) {
      const ang = k * 0.28, ex = cx + Math.sin(ang) * len * 1.25, ey = BAND_Y1 + 1 + Math.cos(ang) * len;
      if (ex < ARM_X1 + 2 || ex > LEG_X0 - 2) continue;
      g.line(Math.round(cx + Math.sin(ang) * 3), BAND_Y1 + 1, Math.round(ex), Math.round(ey), P.redL);
      if (a > 0.95) g.blit(RAYHAND, ex - 1, ey);
    }
  }
  return { bx, cx };
}

// ------------------------------------------------------------ the design

const FLOURISH = [[8, 'wind'], [23, 'hiss'], [37, 'heron'], [50, 'wind']];

export default {
  name: 'Tomb',
  blurb: 'A Theban tomb wall under the arch of Nut: each numeral is a living hieroglyph (serpents, reeds, ropes) that slithers, sways and turns on the beat; each minute the paint flakes off and the painter grids, sketches, outlines and colours the new sign.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, T = (ctx.date.getTime() % 86400000) / 1000;
    const night = ctx.night;
    ctx.lcd.backlight(1 - 0.5 * night);
    const prv = clockFields(new Date(ctx.date.getTime() - 60000)), nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm, old = prv.hh + prv.mm, nw = nxt.hh + nxt.mm;
    const hourShow = prv.h !== f.h && s < 12;

    // ---- the wall (by night it sinks into shadow, dissolved in over the night minute)
    const buf = g.buf;
    if (night <= 0) buf.set(WALL);
    else if (night >= 1) buf.set(WALL_N);
    else for (let i = 0, y = 0; y < H; y++) for (let x = 0; x < W; x++, i++) buf[i] = night * 16 > BAYER[((y & 3) << 2) | (x & 3)] + 0.5 ? WALL_N[i] : WALL[i];
    g.cost.px += W * H; if (night > 0 && night < 1) g.cost.box += W * H * 2;

    // ---- the beat and the flourishes
    const beat = Math.floor(s), p = s - beat;
    let fk = null, ft = 0;
    if (!hourShow) for (const [t0, kind] of FLOURISH) if (s >= t0 && s < t0 + 2.6) { fk = kind; ft = s - t0; }
    const fAmt = fk ? sm(ft / 0.4) * (1 - sm((ft - 2.0) / 0.6)) : 0;
    const gust = fk === 'wind' ? fAmt : 0, hiss = fk === 'hiss' ? fAmt : 0;
    // serpents: bands crawl 3 px a beat (eased: a push, then a glide), surging when they hiss
    const ph = Math.floor(3 * (beat + ease.inOutQuad(Math.min(1, p / 0.6))) + 12 * sm(progress(s, 23.2, 24.6)));
    const ropePh = Math.floor(2 * (beat + ease.inOutQuad(Math.min(1, p / 0.5))) + T * 1.5);

    // ---- the sky: Nut's stars, and Ra's barque at the hour
    let sun = null;
    if (hourShow) sun = barque(g, s);
    stars(g, T, night, sun ? sun.cx : -999);
    if (sun) g.blit(BARQUE, sun.bx, 0);

    // ---- the Nile sub-register under the minutes
    nile(g, s, T, gust, fk === 'heron' ? ft : -1);

    // ---- the column between hours and minutes: two sun disks are the colon
    for (const cy of [32, 44]) {
      g.fillCircle(COL.x0 + 5.5, cy, 3.2, P.ink);
      g.fillCircle(COL.x0 + 5.5, cy, 2.2, (beat & 1) === (cy === 32 ? 0 : 1) ? P.red : P.redL);
    }

    // ---- the signs
    const flakes = [];
    for (let i = 0; i < 4; i++) {
      const sl = SLOTS[i], d = +cur[i], G = GLY[sl.sz][d];
      const ox = sl.x - M, oy = sl.y - M;
      const leaving = s >= 58.6 && cur[i] !== nw[i];
      const arriving = s < 2.6 && old[i] !== cur[i];
      // the painter's grid behind the sign while it is redone
      let grid = 0;
      if (leaving) grid = progress(s, 59.2, 59.9);
      if (arriving) grid = 1 - progress(s, 1.9, 2.5);
      if (grid > 0) {
        const step = sl.sz === 'hr' ? 9 : 7, gc = night > 0.5 ? C.ngrid : C.grid;
        for (let y = sl.y - 2; y < sl.y + SIZE[sl.sz][1] + 2; y++)
          for (let x = sl.x - 2; x < sl.x + SIZE[sl.sz][0] + 2; x++)
            if (((x - sl.x) % step === 0 || (y - sl.y) % step === 0) && rankAt(x, y) < grid * 256) buf[y * W + x] = gc;
        g.cost.box += (SIZE[sl.sz][0] + 4) * (SIZE[sl.sz][1] + 4) * 3;
      }
      // life: how much the sign moves (none while it is being painted)
      const life = arriving ? sm(progress(s, 1.9, 2.7)) : leaving ? 1 - sm(progress(s, 58.6, 58.9)) : 1;
      const greet = sun ? Math.max(0, 1 - Math.abs(sun.cx - (sl.x + SIZE[sl.sz][0] / 2)) / 18) : 0;
      const kinds = G.lines.map((l) => l.k);
      const isReed = !kinds.includes(SNAKE) && !kinds.includes(ROPE);
      const isSnake = kinds.includes(SNAKE);
      // the sign's body in motion, as a row map: serpents undulate (a 1 px wave
      // running down the body) and rear on the beat; reeds sway from the root;
      // ropes are pulled taut on the beat (a 2 px stretch) and shiver
      const rows = ROWS, src = SRC, bh = G.bh, base = bh - M, gh = SIZE[sl.sz][1];
      const lp = (p - i * 0.07 + 1) % 1;
      const pulse = lp < 0.12 ? ease.outQuad(lp / 0.12) : 1 - ease.inOutQuad(Math.min(1, (lp - 0.12) / 0.5));
      let lift = 0, stretch = 0, wave = 0, sway = 0;
      if (isReed) {
        const side = (k) => ((k & 1) ? 1 : -1);
        const sw = side(beat - 1) + (side(beat) - side(beat - 1)) * ease.inOutQuad(Math.min(1, p / 0.7));
        const lean = sun ? Math.sign(sun.cx - (sl.x + 12)) * greet * 2 : 0;
        sway = life * (sw * (3.6 + 2 * gust + 1.5 * greet) + lean);
        lift = life * 3 * pulse;
      } else if (isSnake) {
        wave = life * (1.6 + 0.5 * gust);
        lift = life * ((sl.sz === 'hr' ? 4 : 3) * pulse + 2 * greet + 1.5 * hiss);
      } else {
        stretch = life * ((sl.sz === 'hr' ? 4 : 3) * pulse + 1.5 * greet + 1.5 * gust);
        wave = life * (1.6 + 0.5 * gust);
      }
      const sc = gh / (gh + stretch);
      for (let yo = -PAD; yo < bh; yo++) {
        const k = yo + PAD;
        const sy = Math.round(base + (yo - base + lift) * sc);
        src[k] = sy >= 0 && sy < bh ? sy : -1;
        let dx = 0;
        if (sway !== 0) { const q = Math.max(0, (base - yo) / gh); dx = sway * q * Math.sqrt(q); }
        if (wave !== 0) dx += wave * sin(6.2832 * (yo / 24 - s * 0.9 + i * 0.27));
        rows[k] = Math.round(dx);
      }
      const gleam = Math.floor((G.bh + 20) * (1 - lp)) - 10;
      const flake = leaving ? progress(s, 58.7, 59.75) : 0;
      if (leaving && flake > 0) flakes.push([i, G, d, ox, oy]);
      if (flake >= 1) continue;
      let paint = null;
      if (arriving) paint = { sketch: progress(s, 0.0, 0.35), ink: progress(s, 0.35, 1.1), fill: ease.inOutQuad(progress(s, 1.0, 1.95)) };
      sign(g, G, d, ox, oy, { ph, ropePh, gleam, rows, src, flake, paint });
      if (paint && paint.ink > 0 && paint.ink < 1) brush(g, G, ox, oy, paint.ink);
      // tongues flick on the beat (each serpent a little after the one before)
      if (isSnake && life > 0.9 && flake === 0) {
        let len = 0;
        if (lp < 0.3) len = 4 * Math.sin((lp / 0.3) * Math.PI);
        const hp = (ft - i * 0.25);
        if (hiss > 0 && hp > 0 && hp < 1.4) len = Math.max(len, 5 * Math.sin(Math.min(1, hp / 1.4) * Math.PI) * (1 + 0.3 * Math.sin(hp * 40)));
        if (greet > 0.3) len = Math.max(len, 5 * greet);
        tongue(g, G, ox, oy, rows, Math.round(len), SIZE[sl.sz][2] + 0.6, Math.round(lift));
      }
    }

    // ---- flakes falling from the signs as they come off the wall
    for (const [i, G, d, ox, oy] of flakes) {
      const col = SPECIES[d] && SPECIES[d][0] ? SPECIES[d][0][0] : d === 0 || d === 8 ? P.ochre : P.green;
      for (let k = 0; k < 16; k++) {
        const t0 = 58.7 + (hash(k, d, 3) % 1000) / 1000 * 0.95, t = s - t0;
        if (t < 0) continue;
        const sx = ox + M + (hash(k, i, 5) % (G.w - 4)) + 2, sy = oy + M + (hash(k, i, 6) % (G.h - 8)) + 4;
        let y = sy + 70 * t * t;
        if (y > GROUND - 2) y = GROUND - 2;
        const x = sx + 2 * sin(t * 6 + k);
        g.fillRect(Math.round(x), Math.round(y), 2, 1, k & 1 ? col : P.ink);
      }
    }
  },
};
