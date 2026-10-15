// Manga SFX: the glass is a page of a fight manga, and the time is its sound
// effects. The four numerals are giant hand-lettered SFX (mangasfx-glyphs.js:
// fat brush strokes that taper to lifted, split dry-brush tails), lettered
// across two panels in a falling cascade, alternately tilted and sized, each
// in solid ink inside a paper keyline and a thin ink rule, the way SFX sit on
// top of the art. Panel A (hours) is a focus-line panel over radial tone;
// panel B (minutes) a speed-line panel; a slanted gutter cuts between them.
//
// The time is never still. Every second the four letters slam onto the page
// in a rolling DO-DO-DO-DO: each is drawn back toward the reader (it grows and
// lifts) and drops onto its beat, squashes, shakes itself still, throws impact
// lines and rings the page with an echo of its own contour. Their edges boil
// the way hand-inked animation does (redrawn 12 times a second), the focus
// lines shimmer, line by line, and snap inward on the hours' beats, the speed
// lines stream. Every 15 s a combo: a red explosion burst behind the minutes
// (behind the hours at :30), the letters shake harder and a second echo rings
// out in red, then the burst dissolves into red screentone.
//
// Minute turn: a fist winds in along the top-right corner, drops onto the
// last digit at :59.15 and the blow runs left through every digit about to
// change: each cracks along white fault lines and bursts into ink shards that
// fly off and thin away by a fixed pixel rank, gone before :00. After :00 the
// new SFX comes at the reader as a big hollow outline and slams down onto its
// own beat, inked solid at the moment of impact.
// Hour: the darkening build-up (tone and lines thicken over the last five
// seconds, the letters tremble), the punch, a paper-white flash, and the page
// turns into a full-bleed splash: no panels, dense focus lines round the
// centre and a huge red burst behind the new time, which slams in letter by
// letter with double echoes. At :06.4 the page is re-cut into panels by a
// ruled line sweeping down, and the burst dissolves into red tone.
//
// Palette: a printed manga page: paper, black ink and one spot colour, red,
// kept for bursts. Grey exists only as screentone (a 45-degree dot screen of
// 4.2 px pitch, bold enough to read as dots at true size). Hard pixels only:
// it is print. Night: the page prints in negative, a black page (as manga
// does for night and drama), light lines and lettering on near-black, red
// darkened, backlight to 50 %; dissolved in by dither over the fade minute.
//
// Cost: letters are a bilinear lookup in a 2x distance field per pixel of
// their box (charged 18 ops a pixel), the page is one integer pass over two
// small tables (quadrant polar table, dot screen), echoes are contour point
// lists mapped forward. The shatter is built once per changing digit per
// minute (a Voronoi split of its ink pixels, ~0.2 M ops, charged in the frame
// that builds it). Flash: distance fields 102 KB, contours 19 KB, polar table
// 25.6 KB, fist sprite and noise 2 KB: ~149 KB. RAM beyond the frame buffer:
// shard lists for up to four digits (~7 B a pixel, ~42 KB at midnight), 3 KB
// scratch while splitting, 12 KB of per-frame direction tables.
import { clockFields, hash } from '../js/kit.js';
import { SDF, CONTOUR, SW, SH, RES, MARG, GW0, GH0, GCX, GCY } from './mangasfx-glyphs.js';
import {
  W, H, N, PAPER, INK, RED, PAPER_C, INK_C, N_GROUND, N_LINE, N_RED,
  background, focusLines, burstShape, burst, impactLines, fist, cutLine, THR,
} from './mangasfx-page.js';

// ------------------------------------------------------------ the lettering layout
// A falling cascade, alternately tilted, as SFX are lettered across a panel.
const SLOT = [
  { cx: 22, cy: 35, rot: -0.13, s: 1.08 },
  { cx: 57, cy: 45, rot: 0.08, s: 0.95 },
  { cx: 104, cy: 37, rot: -0.1, s: 1.04 },
  { cx: 139, cy: 49, rot: 0.15, s: 0.93 },
];
const BEAT0 = [0.30, 0.40, 0.50, 0.60];    // each digit's slam within the second
const KL = 2.6, OL = 1.25;                 // keyline (paper) and outer rule (ink), screen px
const HIT = 59.15, CHAIN = 0.07, SHARD_LIFE = 0.62;

// boil: smooth value noise, 32 x 32, in 1/8 px; re-drawn 12 times a second
const BOIL = new Int8Array(1024);
{
  const rnd = (x, y) => (hash(x & 7, y & 7, 404) & 255) / 255;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const fx = x / 4, fy = y / 4, ix = Math.floor(fx), iy = Math.floor(fy), u = fx - ix, v = fy - iy;
    const a = rnd(ix, iy), b = rnd(ix + 1, iy), c = rnd(ix, iy + 1), d = rnd(ix + 1, iy + 1);
    const n = a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    BOIL[y * 32 + x] = Math.round((n - 0.5) * 12);
  }
}

const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const cl = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x);

// ------------------------------------------------------------ one lettered digit
// mode 0: solid ink letter, paper keyline, ink rule. 1: hollow (paper
// letter in an ink rim) with keyline and rule. 2: echo, the contour only.
function letter(g, d, cx, cy, sc, rot, mode, bx, by, col) {
  const f = SDF[d], buf = g.buf;
  const c = Math.cos(rot), s = Math.sin(rot);
  const ex = (GW0 / 2 + MARG - 1) * sc, ey = (GH0 / 2 + MARG - 1) * sc;
  const hw = Math.abs(c) * ex + Math.abs(s) * ey, hh = Math.abs(s) * ex + Math.abs(c) * ey;
  const x0 = Math.max(0, Math.floor(cx - hw)), x1 = Math.min(W, Math.ceil(cx + hw));
  const y0 = Math.max(0, Math.floor(cy - hh)), y1 = Math.min(H, Math.ceil(cy + hh));
  if (x1 <= x0 || y1 <= y0) return;
  const k = RES / sc, ux = c * k, vx = -s * k, uy = s * k, vy = c * k;
  const dsc = sc / 8, edge = mode === 2 ? 0.62 : KL + OL;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    const dy = y + 0.5 - cy, dx0 = x0 + 0.5 - cx;
    let fi = (GCX + MARG) * RES + ux * dx0 + uy * dy, fj = (GCY + MARG) * RES + vx * dx0 + vy * dy;
    const brow = ((y + by) & 31) << 5, row = y * W;
    for (let x = x0; x < x1; x++, fi += ux, fj += vx) {
      if (fi < 0 || fj < 0 || fi >= SW - 1 || fj >= SH - 1) continue;
      const i = fi | 0, j = fj | 0, u = fi - i, v = fj - j, o = j * SW + i;
      const top = f[o] + (f[o + 1] - f[o]) * u, bot = f[o + SW] + (f[o + SW + 1] - f[o + SW]) * u;
      const dd = (top + (bot - top) * v) * dsc;
      if (dd >= edge + 1) continue;
      const b = BOIL[brow | ((x + bx) & 31)] * 0.125;
      const e = dd + b;
      let out;
      if (mode === 2) { if (e > -0.62 && e < 0.62) out = col; else continue; }
      else if (e < 0) out = mode === 1 && e < -1.4 ? PAPER : INK;
      else if (dd - b * 0.6 < KL) out = PAPER;
      else if (dd - b * 0.6 < KL + OL) out = INK;
      else continue;
      buf[row + x] = out; n++;
    }
  }
  g.cost.box += (x1 - x0) * (y1 - y0) * 18; g.cost.px += n;
}

// The echo of a slammed letter: its contour mapped forward at a larger scale.
function echo(g, d, cx, cy, sc, rot, col) {
  const P = CONTOUR[d], buf = g.buf, n = P.length;
  const c = Math.cos(rot) * sc / 16, s = Math.sin(rot) * sc / 16, gx = GCX * 16, gy = GCY * 16;
  for (let k = 0; k < n; k += 2) {
    const u = P[k] - gx, v = P[k + 1] - gy;
    const x = (cx + c * u - s * v) | 0, y = (cy + s * u + c * v) | 0;
    if (x >= 0 && y >= 0 && x < W && y < H) buf[y * W + x] = col;
  }
  g.cost.box += (n >> 1) * 8; g.cost.px += n >> 1;
}

// ------------------------------------------------------------ the beat
// Every second each digit is drawn back toward the reader (it grows and
// lifts) and slams down onto the page on its beat, the four in a rolling
// DO-DO-DO-DO; at the slam it squashes, the page rings with echoes of its
// contour, impact lines fly off it and it shakes itself still.
function beatPose(i, s, F, amp) {
  let u = s - BEAT0[i]; u -= Math.floor(u);
  let k;
  if (u < 0.28) k = 0; else if (u < 0.84) k = sm((u - 0.28) / 0.56); else { const q = (1 - u) / 0.16; k = q * q; }
  const sq = u < 0.12 ? 0.045 * Math.sin((u / 0.12) * Math.PI) : 0;
  const sh = u < 0.32 ? 2.0 * amp * (1 - u / 0.32) ** 2 : 0;
  const h = hash(F >> 1, i, 17);
  const jx = sh * (((h & 7) - 3.5) / 3.5), jy = sh * 0.6 * ((((h >>> 3) & 7) - 3.5) / 3.5);
  return { sc: 1 + 0.08 * k - sq, lift: -2.2 * k, jx, jy, u };
}

// ------------------------------------------------------------ the shatter
// At the punch each leaving digit is frozen as its ink pixels, split into
// shards (Voronoi round seeds hashed from the minute), with the cracks
// between them. Built once per digit per minute, kept by minute.
const SHARDS = new Map();
let buildOps = 0;
const NSEED = 12;
function shardsFor(mk, i, d, pose, ix, iy) {
  const key = mk * 4 + i;
  let S = SHARDS.get(key);
  if (S) return S;
  const P = SLOT[i], sc = pose.sc * P.s, cx = P.cx + pose.jx, cy = P.cy + pose.lift + pose.jy;
  const f = SDF[d], c = Math.cos(P.rot), s = Math.sin(P.rot), k = RES / sc;
  const bw = 48, bh = 64, bx0 = Math.round(cx - bw / 2), by0 = Math.round(cy - bh / 2);
  const seeds = [];
  for (let n = 0; n < NSEED; n++) {
    const h = hash(mk, i * 31 + n, 55);
    seeds.push([cx + ((h & 255) / 255 - 0.5) * 30 * sc, cy + (((h >>> 8) & 255) / 255 - 0.5) * 44 * sc]);
  }
  const id = new Int8Array(bw * bh).fill(-1);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const px = bx0 + x + 0.5, py = by0 + y + 0.5, dx = px - cx, dy = py - cy;
    const fi = (GCX + MARG) * RES + (c * dx + s * dy) * k, fj = (GCY + MARG) * RES + (-s * dx + c * dy) * k;
    if (fi < 0 || fj < 0 || fi >= SW - 1 || fj >= SH - 1) continue;
    if (f[(fj | 0) * SW + (fi | 0)] >= 0) continue;
    let best = 0, bd = 1e9;
    for (let n = 0; n < NSEED; n++) { const ex = px - seeds[n][0], ey = py - seeds[n][1], e = ex * ex + ey * ey; if (e < bd) { bd = e; best = n; } }
    id[y * bw + x] = best;
  }
  const xs = [], ys = [], sid = [], crack = [], rank = [];
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const v = id[y * bw + x];
    if (v < 0) continue;
    const r = x + 1 < bw ? id[y * bw + x + 1] : -1, dn = y + 1 < bh ? id[(y + 1) * bw + x] : -1;
    xs.push(bx0 + x); ys.push(by0 + y); sid.push(v); rank.push(hash(x, y, mk) & 255);
    crack.push((r >= 0 && r !== v) || (dn >= 0 && dn !== v) ? 1 : 0);
  }
  // each shard flies away from the blow, with a spin of its own speed
  const vel = seeds.map(([sx, sy], n) => {
    const h = hash(mk, i * 31 + n, 66), ax = sx - ix, ay = sy - iy, l = Math.hypot(ax, ay) || 1;
    const sp = 55 + (h & 63);
    return [(ax / l) * sp + ((h >>> 8) % 30) - 15, (ay / l) * sp * 0.8 - 40 - ((h >>> 16) % 30)];
  });
  S = { xs: Int16Array.from(xs), ys: Int16Array.from(ys), sid: Uint8Array.from(sid), crack: Uint8Array.from(crack), rank: Uint8Array.from(rank), vel };
  buildOps += bw * bh * (NSEED * 4 + 20);
  SHARDS.set(key, S);
  if (SHARDS.size > 4) SHARDS.delete(SHARDS.keys().next().value);
  return S;
}

function drawShards(g, S, t) {
  const buf = g.buf, n = S.xs.length;
  const tf = t - 0.1, thin = cl((t - 0.22) / (SHARD_LIFE - 0.22)) * 255;
  const off = S.vel.map(([vx, vy]) => [tf > 0 ? vx * tf : 0, tf > 0 ? vy * tf + 160 * tf * tf : 0]);
  let w = 0;
  for (let k = 0; k < n; k++) {
    if (S.rank[k] < thin) continue;
    const o = off[S.sid[k]], x = (S.xs[k] + o[0]) | 0, y = (S.ys[k] + o[1]) | 0;
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    buf[y * W + x] = S.crack[k] ? (tf > 0 ? INK : PAPER) : INK;
    w++;
  }
  g.cost.box += n * 6; g.cost.px += w;
}

// ------------------------------------------------------------ tables reused every frame
const INNER_A = new Float32Array(1024), INNER_S = new Float32Array(1024), BURST = new Float32Array(1024);
const BG = { cut: 80, flash: false, boost: 0, fa: [40, 40], innerA: INNER_A, innerS: INNER_S, t: 0 };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export default {
  name: 'Manga SFX',
  blurb: 'A fight-manga page: the time is the brush-lettered sound effects, slamming onto the panels on every beat; each minute a fist smashes the old digit to shards.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey, ms = ctx.date.getTime();
    const nt = ctx.night;
    ctx.lcd.backlight(1 - 0.5 * nt);
    const F = Math.floor(ms * 0.06), T = (ms % 86400000) / 1000, bf = Math.floor(T * 12);
    const prv = clockFields(new Date(ms - 60000)), nxt = clockFields(new Date(ms + 60000));
    const cur = f.hh + f.mm, old = prv.hh + prv.mm, nw = nxt.hh + nxt.mm;
    const hourShow = prv.h !== f.h && s < 8;
    const preHour = nxt.h !== f.h;
    buildOps = 0;

    // ---- the page: panels, or the splash at the hour
    const boost = preHour ? sm((s - 54) / 5) : 0;
    let cut = 80, flash = false;
    if (preHour && s >= HIT && s < HIT + 0.16) flash = true;
    else if (preHour && s >= HIT + 0.16) cut = 0;
    else if (hourShow) cut = s < 6.4 ? 0 : Math.round(80 * sm((s - 6.4) / 1.2));
    BG.cut = cut; BG.flash = flash; BG.boost = boost; BG.t = T;
    // focus lines boil 12 times a second and snap inward on each hour beat
    const lastA = Math.min(...[0, 1].map((i) => { let u = s - BEAT0[i]; return u - Math.floor(u); }));
    const pulse = lastA < 0.15 ? (1 - lastA / 0.15) * 8 : 0;
    let ops = focusLines(INNER_A, 1, T, 7, 64 + Math.round(18 * boost), 20 - pulse - 6 * boost, 14, 3, 7);
    if (cut < 80 || flash) ops += focusLines(INNER_S, 2, T, 9, 84, 44, 14, 3, 7);
    g.cost.box += ops;
    background(g, BG);

    // ---- the red spot colour: the hour's burst, and the 15-second combo
    if (cut < 80) {
      const a = hourShow ? s + 0.85 : s - HIT - 0.16;
      const grow = sm(a / 0.35), R = 46 * grow + 3 * Math.max(0, 1 - lastA / 0.2);
      const lvl = hourShow ? Math.round(18 * (1 - sm((s - 5.4) / 1.6))) : 18;
      if (R > 1 && lvl > 0) { g.cost.box += burstShape(BURST, 3, 13, R, T * 0.04); burst(g, 80, 40, BURST, Math.ceil(R), lvl); }
    }
    const fk = Math.floor(s / 15), ft = s - fk * 15 - 0.25;
    const combo = !hourShow && !preHour && fk > 0 && ft >= 0 && ft < 1.3;
    if (combo) {
      const [bx, by] = fk === 2 ? [40, 40] : [121, 43];
      const R = 34 * Math.min(1, ft / 0.12) ** 0.5, lvl = Math.round(18 * (1 - sm((ft - 0.55) / 0.7)));
      if (lvl > 0) { g.cost.box += burstShape(BURST, fk, 11, R, ft * 0.05); burst(g, bx, by, BURST, Math.ceil(R), lvl); }
    }
    if (cut > 0 && cut < 80) cutLine(g, cut);

    // ---- the lettering
    const amp = 1 + (combo ? 0.6 : 0) + (cut < 80 ? 0.4 : 0);
    const ix = SLOT[3].cx - 6, iy = SLOT[3].cy - 24;      // where the fist lands
    const poses = [], jobs = [];
    for (let i = 0; i < 4; i++) {
      const P = SLOT[i];
      const p = beatPose(i, s, F, amp);
      if (preHour) { const sh = 0.8 * boost * ((hash(F >> 1, i, 23) & 3) - 1.5) / 1.5; p.jx += sh; }
      const tHit = HIT + CHAIN * (3 - i);
      const leaving = cur[i] !== nw[i] && s >= tHit;
      const entering = old[i] !== cur[i] && s < BEAT0[i];
      let sc = p.sc * P.s, mode = 0;
      if (entering) {
        const q = s / BEAT0[i];
        sc = P.s * (1 + 0.38 * (1 - q * q));
        mode = 1;
        p.u = 1; p.jx = 0; p.jy = 0; p.lift = 0;
      }
      poses.push(p);
      jobs.push({ i, d: +cur[i], sc, mode, leaving, tHit, entering, x: P.cx + p.jx, y: P.cy + p.lift + p.jy });
    }
    // impact lines and echoes behind the letters
    for (const J of jobs) {
      if (J.leaving || J.entering) continue;
      const p = poses[J.i];
      if (p.u < 0.22) impactLines(g, J.x, J.y, Math.floor(s) * 4 + J.i, p.u, 24);
      if (p.u < 0.17) {
        const e = p.u / 0.17;
        echo(g, J.d, J.x, J.y, J.sc * (1.08 + 0.22 * e), SLOT[J.i].rot, INK);
        if (amp > 1.2) echo(g, J.d, J.x, J.y, J.sc * (1.2 + 0.35 * e), SLOT[J.i].rot, combo ? RED : INK);
      }
    }
    const bx = hash(bf, 1) & 31, by = hash(bf, 2) & 31;
    for (const J of jobs) {
      if (J.entering) continue;
      if (J.leaving) {
        const t = s - J.tHit;
        if (t >= SHARD_LIFE) continue;
        const pz = beatPose(J.i, J.tHit, 0, 0);
        const S = shardsFor(mk, J.i, J.d, pz, ix, iy);
        if (t < 0.1) letter(g, J.d, SLOT[J.i].cx, SLOT[J.i].cy + pz.lift, pz.sc * SLOT[J.i].s, SLOT[J.i].rot, 0, bx, by);
        drawShards(g, S, t);
        continue;
      }
      letter(g, J.d, J.x, J.y, J.sc, SLOT[J.i].rot, J.mode, bx, by);
    }
    for (const J of jobs) if (J.entering) letter(g, J.d, J.x, J.y, J.sc, SLOT[J.i].rot, J.mode, bx, by);

    // ---- the fist: winds in along the top right, drops onto the last digit
    if (s > 58.3 && s < 59.95) {
      let kx, ky;
      if (s < 59.0) { const u = sm((s - 58.3) / 0.7); kx = 168 - 40 * u; ky = 12 - 2 * u; }
      else if (s < HIT) { const u = ((s - 59.0) / (HIT - 59.0)) ** 2; kx = 128 - 6 * u; ky = 10 + 9 * u; }
      else if (s < HIT + 0.2) { kx = 122; ky = 19; }
      else { const u = sm((s - HIT - 0.2) / 0.6); kx = 122 + 50 * u; ky = 19 - 12 * u; }
      fist(g, kx, ky, F);
      if (s >= HIT && s < HIT + 0.25) impactLines(g, ix, iy + 4, mk, (s - HIT) * 0.8, 6);
    }
    if (buildOps) g.cost.box += buildOps;

    // ---- night: the page prints in negative (a black page), dissolved in over the fade minute
    if (nt > 0) {
      const buf = g.buf;
      for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
        if (nt < 1 && nt <= BAYER[((y & 3) << 2) | (x & 3)]) continue;
        const v = buf[i];
        buf[i] = v === PAPER ? N_GROUND : v === INK ? N_LINE : v === RED ? N_RED : v;
      }
      g.cost.box += N * 4;
    }
  },
};
