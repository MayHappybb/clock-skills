// Snake: the glass is an old mobile phone's Snake screen, and every numeral
// is a nest of snakes. Each digit is drawn on the game's own grid as a
// spanning tree of 8 px cells, and its snakes run the Hamiltonian cycle round
// that tree (the trick a Snake AI uses never to bite itself): out along one
// side of every stroke and back along the other, two 3 px lanes with a 1 px
// seam, U-turns at the tips. Three to six snakes share each loop, nose to
// tail, so the numerals are always crawling.
//
// Always alive: the snakes slither (a lateral wave runs back down every
// body, a pixel either way, so the strokes' edges are always moving), glide
// round their numerals and lunge on every second; each lunge ends with a gulp
// of the pellet lying in the gap before its nose, crumbs spring off its jaws
// and the pellet travels down its body as a lump. Tongues flick. Every 15 s
// the snakes of each numeral race round a whole spacing, a wave left to
// right. In the two open bands of the board (top right, bottom left) four
// classic Nokia snakes (3 px blocks) play a real game of Snake: out of their
// burrows, hunting pellets, growing, and home again before the turn.
//
// Minute: a row of pits opens along every changing numeral, ~10 px apart
// round its whole loop, and its snakes dive through them like a stitch
// through cloth: every stitch slides into the pit ahead at once, so the digit
// thins evenly all over to a dotted outline of itself (gone by :59.8, its
// pits closing to dots by :00). After :00 the new numeral's pits open along
// its own route and its snakes surface out of all of them at once, nose first
// (whole by :00.85).
// The hour: a giant diamondback serpent slithers the whole board along the
// free corridor, in along the top band, down the channel between the hours
// and the minutes, out along the bottom, and as its head passes each
// numeral, that numeral's snakes bolt once round their loop.
//
// Pair: dark LCD #43523d ink on pale mint #c7f0d8: the green-grey pixels on
// the mint backlit glass of the phone that made Snake famous. 1-bit through
// and through: every frame is drawn into a byte mask and written as those two
// colours; grey exists only as the snakes' seams and the serpent's diamonds.
//
// Cost: per frame one clear and one write of the 12,800-pixel mask, a table
// walk of each numeral's tube (~500-960 pixels: a subtract, a table lookup and
// a few compares each), a few hundred pixels of heads, lumps, pellets, holes
// and Nokia snakes; the hour's serpent adds a 3,400-pixel corridor lookup for
// 8 s. The Nokia snakes' game is a BFS per grid step (12 a second), its work
// charged to every frame; a cold start replays the minute so far once.

import { clockFields, clamp } from '../js/kit.js';
import { GLYPHS, GAP, ZO } from './snake-glyphs.js';
import { setBoard, gameFor, lengthAt, NX, CS, RATE } from './snake-wild.js';
import { paintGiant, arcAtX, ROUTE_LEN, GLEN } from './snake-giant.js';

const W = 160, H = 80, N = W * H;
const INK = 0x43523d, GROUND = 0xc7f0d8;
const to565 = (c) => (((c >> 19) & 31) << 11) | (((c >> 10) & 63) << 5) | ((c >> 3) & 31);
const INK565 = to565(INK), GROUND565 = to565(GROUND);

// hours top left, minutes bottom right: the strip read as a game board
const SLOTS = [[1, 2], [38, 2], [89, 22], [126, 22]];
const BOXES = SLOTS.map(([x, y]) => [x - 4, y - 4, x + 34, y + 58]);
// the wild snakes keep to the two open bands (top right, bottom left), not the channel between the pairs
setBoard([...BOXES, [72, 16, 88, 63]]);

// ------------------------------------------------------------ motion
const CREEP = 2, LUNGE = 4, L0 = 0.62;       // px/s glide; px per beat, lunging from f = L0 to the beat
const RACE_T = 1.3, RACES = [15, 30, 45];
const LUMP_V = 62;
// the slither wave along a body: lean -1, 0, +1 (a pixel out of the lane), WIGL px long, running back at WIGV px/s
const WIG = Int8Array.from([0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, -1, -1, -1, -1, -1, 0, 0]);
const WIGL = WIG.length, WIGV = 20;
const sm = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** Glide plus lunges: arc travelled by every digit snake at absolute time T (s). */
function travel(T) {
  const n = Math.floor(T), f = T - n;
  return CREEP * T + LUNGE * (n + sm((f - L0) / (1 - L0)));
}

// ------------------------------------------------------------ per-frame state
const mask = new Uint8Array(N);
const set = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) mask[y * W + x] = 1; };
const clr = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) mask[y * W + x] = 0; };
let ops = 0;

// head: rows d = 0..5 behind the nose, lateral -1..1 (the +-2 bulge is drawn apart)
const HEAD = [[0, 1, 0], [1, 1, 1], [1, 1, 1], [0, 1, 0], [1, 1, 1], [1, 1, 1]];
const HEAD_W = [0, 0, 1, 1, 1, 0];          // rows with the +-2 bulge (the jaw and eyes)
// hole ring offsets (r = 3), in angle order, and the inside (r <= 2)
const RING = [], INSIDE = [];
for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
  const q = x * x + y * y;
  if (q <= 5) INSIDE.push(x, y);
  else if (q <= 13) RING.push([Math.atan2(y, x), x, y]);
}
RING.sort((a, b) => a[0] - b[0]);
const RINGXY = RING.flatMap(([, x, y]) => [x, y]);

/** A warp hole at (x, y): the inside cleared, a ring of dashes spinning, `r` 0..1 open. */
function hole(x, y, r, spin) {
  if (r <= 0) return;
  if (r < 0.34) { set(x, y); return; }
  if (r < 0.67) { for (let k = 0; k < INSIDE.length; k += 2) { const ox = INSIDE[k], oy = INSIDE[k + 1]; if (ox * ox + oy * oy <= 2) set(x + ox, y + oy); } clr(x, y); return; }
  for (let k = 0; k < INSIDE.length; k += 2) clr(x + INSIDE[k], y + INSIDE[k + 1]);
  const n = RINGXY.length >> 1;
  for (let k = 0; k < n; k++) if ((k + spin) % 6 < 4) set(x + RINGXY[2 * k], y + RINGXY[2 * k + 1]);
  set(x, y);
  ops += 40;
}

/**
 * The snakes of one numeral. tr: the loop's travel (px of arc); lump: rows of
 * the lump, or -1. At a turn the snakes dive (or surface) through the pits
 * spaced evenly round the loop (G.PITS): e = G.PREV[arc] is how far a pixel's
 * place is past the pit behind it; e < cut has slid into the pit ahead,
 * e >= vis has not come up yet. So every changing digit thins evenly all
 * over, never one end first.
 */
const SEG = 12;                  // how far the bodies travel while diving (> the pit spacing)
function drawDigit(G, ox, oy, tr, cut, vis, lump, T) {
  const L = G.L, len = G.len, tx = G.tx, ty = G.ty, ts = G.ts, tl = G.tl, REL = G.REL, PREV = G.PREV;
  let t0 = tr % L; if (t0 < 0) t0 += L;
  t0 |= 0;
  const turning = cut > 0 || vis < 255;
  // the slither: a lateral wave running back down every body, a pixel either way
  let ph = (WIGL * 4096 - Math.floor(WIGV * T)) % WIGL;
  for (let i = 0, n = G.N; i < n; i++) {
    let rel = t0 - ts[i]; if (rel < 0) rel += L;
    const d = REL[rel] & 255;
    if (d >= len) continue;
    if (turning) { const e = PREV[ts[i]]; if (e < cut || e >= vis) continue; }
    const lat = tl[i];
    let on;
    if (lump >= 0 && d >= lump - 1 && d <= lump + 1) on = true;
    else if (d <= 5) on = lat === 3 || lat === -3 ? d >= 2 && d <= 4 && HEAD_W[d] === 1 : HEAD[d][lat + 1] === 1;
    else if (d >= len - 2) on = lat === 0;
    else {
      const w = d < len - 6 ? WIG[(d + ph) % WIGL] : 0;
      if (lat === 3 || lat === -3) on = w !== 0 && (lat > 0) === (w > 0);
      else on = lat - w <= 1 && w - lat <= 1;
    }
    if (on) mask[(ty[i] + oy) * W + tx[i] + ox] = 1;
  }
  ops += G.N * 6;
  // the parts outside the tube: jaw and eyes, the lump's bulge, the tongue
  for (let k = 0; k < G.K; k++) {
    const h = t0 - G.HOFF[k];
    if (!turning) {
      for (let d = 2; d <= 4; d++) side(G, ox, oy, h - d, 2);
      // tongue: flicks out in front, forked, twice a second, each snake in its own time
      const ph = (T * 2.1 + k * 0.29 + G.L * 0.013) % 1;
      if (ph < 0.22) {
        const a1 = wrap(h + 1, L), a2 = wrap(h + 2, L), a3 = wrap(h + 3, L);
        set(G.px[a1] + ox, G.py[a1] + oy);
        if (ph > 0.05 && ph < 0.17) { set(G.px[a2] + ox, G.py[a2] + oy); side(G, ox, oy, h + 3, 1); }
        void a3;
      }
    }
    if (lump >= 0 && !turning) {
      side(G, ox, oy, h - lump, 2);
      // the crunch: two crumbs spring off the jaws as the pellet goes down
      if (lump < 12) side(G, ox, oy, h - 2, lump < 8 ? 3 : 4);
    }
    // the slither's outer pixel, where the body leans out of its lane
    for (let d = 6; d < len - 6; d++) {
      const w = WIG[(d + ph) % WIGL];
      if (w === 0) continue;
      if (turning) { const e = PREV[wrap(h - d, L)]; if (e < cut || e >= vis) continue; }
      lean(G, ox, oy, h - d, 2 * w);
    }
    ops += (len - 12) * 3;
  }
}
const wrap = (a, L) => { a %= L; return a < 0 ? a + L : a; };
/** The two pixels at lateral +-o from the path at arc a. */
function side(G, ox, oy, a, o) {
  a = wrap(a, G.L);
  const x = G.px[a] + ox, y = G.py[a] + oy, rx = -G.dy[a] * o, ry = G.dx[a] * o;
  set(x + rx, y + ry); set(x - rx, y - ry);
}
/** The pixel at lateral o (signed) from the path at arc a. */
function lean(G, ox, oy, a, o) {
  a = wrap(a, G.L);
  set(G.px[a] + ox - G.dy[a] * o, G.py[a] + oy + G.dx[a] * o);
}
/** A pellet: a plus on the path at arc a. */
function pellet(G, ox, oy, a) {
  a = wrap(a, G.L);
  const x = G.px[a] + ox, y = G.py[a] + oy;
  set(x, y); set(x - 1, y); set(x + 1, y); set(x, y - 1); set(x, y + 1);
}

// ------------------------------------------------------------ the giant (the hour)
const GV = 60, GT0 = 1.0, GT1 = GT0 + (ROUTE_LEN + GLEN) / GV;
// when its nose passes each numeral: the minutes on the top band, the hours on the bottom one
const GPASS = SLOTS.map(([x], i) => GT0 + arcAtX(x + 16, i < 2 ? 'bottom' : 'top') / GV);

// ------------------------------------------------------------ the wild snakes
const BURROWS = [18 * NX + 2, 1 * NX + 37, 17 * NX + 17, 2 * NX + 23];

function wild(s, T, mk, start) {
  if (s < start - 0.5) return;
  const gm = gameFor(mk, BURROWS, start, 54.5);
  ops += gm.ops / 3600;                       // the game advances a step at a time: its work spread over the minute
  const u = (s - start) * RATE;
  for (let q = 0; q < gm.snakes.length; q++) {
    const a = gm.snakes[q];
    // pellets of its game: a plus that throbs to a ring
    for (const p of a.pellets) {
      const t0 = p.from / RATE + start, t1 = p.to / RATE + start;
      if (s < t0 || s >= t1) continue;
      const x = (p.cell % NX) * CS + 1, y = ((p.cell / NX) | 0) * CS + 1;
      set(x, y); set(x - 1, y); set(x + 1, y); set(x, y - 1); set(x, y + 1);
      if ((s - t0) % 0.8 < 0.4) { set(x - 1, y - 1); set(x + 1, y - 1); set(x - 1, y + 1); set(x + 1, y + 1); clr(x, y); }
    }
    if (u >= 0) {
      const len = lengthAt(a, u), front = Math.min(u, a.arrive), back = Math.max(0, u - len);
      // blocks one grid step apart, from the head back
      for (let m = 0; ; m++) {
        const at = u - m;
        if (at < back) break;
        if (at > front) continue;
        const k = Math.floor(at), fr = at - k;
        const c0 = a.trail[k], c1 = a.trail[Math.min(k + 1, a.n)];
        const i0 = c0 % NX, j0 = (c0 / NX) | 0, di = (c1 % NX) - i0, dj = ((c1 / NX) | 0) - j0;
        const x = Math.round((i0 + di * fr) * CS) + 1, y = Math.round((j0 + dj * fr) * CS) + 1;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) set(x + ox, y + oy);
        if (m === 0 && u <= a.arrive && (di || dj)) {
          // the head: an eye, and a tongue flick toward where it is going
          clr(x - dj, y + di);
          if ((T * 2.6 + q * 0.5) % 1 < 0.3) { set(x + 2 * di, y + 2 * dj); set(x + 3 * di, y + 3 * dj); }
        }
        ops += 12;
      }
    }
    // the burrow, open while the snake comes out or goes down
    const outS = start + (4 + 1) / RATE, arriveS = a.arrive / RATE + start;
    const goneS = arriveS + (lengthAt(a, a.arrive) + 1) / RATE;
    let ro = 0;
    if (s < outS + 0.4) ro = clamp((s - (start - 0.5)) / 0.4, 0, 1) * clamp((outS + 0.4 - s) / 0.3, 0, 1);
    else if (s > arriveS - 0.8) ro = clamp((s - (arriveS - 0.8)) / 0.4, 0, 1) * clamp((goneS + 0.35 - s) / 0.3, 0, 1);
    const c = ro > 0 && s > arriveS - 0.8 ? a.dive : BURROWS[q];
    hole((c % NX) * CS + 1, ((c / NX) | 0) * CS + 1, ro, ((T * 10) | 0));
  }
}

// ------------------------------------------------------------ the face
const PIT = 0.6;                 // pits are small rings (see hole())
const OUT0 = 58.8, OUT1 = 59.1, OUT2 = 59.8, IN1 = 0.15, IN2 = 0.85, IN3 = 1.15;
/** Drain/emerge progress: a quick ease-in, then steady (so speed stays ~1 px a frame). */
const ramp = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u < 0.15 ? (u * u) / 0.3 : (u - 0.075) / 0.925);

export default {
  name: 'Snake',
  blurb: 'An old phone\'s Snake screen: every numeral is a nest of snakes circling its strokes, gulping a pellet each second; at the minute they dive through a row of pits and surface as the new digit.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    ops = 0;
    mask.fill(0);
    const ms = ctx.date.getTime(), T = ms / 1000, Tmin = T - s;
    const prv = clockFields(new Date(ms - 60000)), nxt = clockFields(new Date(ms + 60000));
    const now = f.hh + f.mm, was = prv.hh + prv.mm, will = nxt.hh + nxt.mm;
    const hourShow = prv.h !== f.h && s < GT1 + 0.5;

    // the hour: the giant serpent, behind everything; the numerals keep their moats
    let gxs = null;
    if (hourShow && s >= GT0 - 0.1) {
      ops += paintGiant(mask, Math.floor(GV * (s - GT0)), (T * 3) % 1 < 0.55) * 4;
      for (let i = 0; i < 4; i++) {
        const G = GLYPHS[+now[i]], z = G.zone, ox = SLOTS[i][0] - ZO, oy = SLOTS[i][1] - ZO;
        for (let k = 0; k < z.length; k += 3) {
          const y = z[k] + oy; if (y < 0 || y >= H) continue;
          const a = Math.max(0, z[k + 1] + ox), b = Math.min(W, z[k + 2] + ox);
          if (b > a) mask.fill(0, y * W + a, y * W + b);
        }
        ops += z.length * 4;
      }
      gxs = GPASS;
    }

    // the wild snakes' game in the free ground (after the serpent, in the hour)
    wild(s, T, mk, prv.h !== f.h ? GT1 + 0.6 : 0.8);

    const n = Math.floor(T), fb = T - n;
    for (let i = 0; i < 4; i++) {
      const [ox, oy] = SLOTS[i];
      const cur = +now[i];
      const out = s >= OUT0 && +will[i] !== cur, inn = s < IN3 && +was[i] !== cur;
      const G = GLYPHS[cur];
      // races: once round a spacing every 15 s, a wave left to right; and as the serpent passes
      const race = (tt) => {
        const ss = tt - Tmin;
        let r = 0;
        for (const r0 of RACES) r += sm((ss - r0 - 0.15 * i) / RACE_T);
        if (gxs) r += sm((ss - gxs[i]) / RACE_T);
        return r * G.sp;
      };
      const trAt = (tt) => travel(tt) + race(tt);
      let tr = trAt(T), cut = 0, vis = 255, lump = -1;
      const holes = [];
      if (out) {
        // dive: every stitch of every snake slides forward into the pit ahead of it
        const base = Math.floor(trAt(Tmin + OUT1));
        tr += SEG * ramp((s - OUT1) / (OUT2 - OUT1));
        cut = s > OUT1 ? Math.max(1e-9, Math.floor(tr) - base) : 0;
        // the pits close to dots by :00 (never quite gone: the glass is never blank at midnight)
        const r = PIT * clamp((s - OUT0) / (OUT1 - OUT0), 0, 1) * clamp((60 - s) / (60 - OUT2), 0.05, 1);
        for (let k = 0; k < G.PITS.length; k++) holes.push(G.PITS[k], r);
      } else if (inn) {
        // surface: after :00 every stitch comes up out of the pit behind it
        const base = Math.floor(trAt(Tmin + IN1) - SEG);
        tr -= SEG * (1 - ramp((s - IN1) / (IN2 - IN1)));
        vis = s < IN1 ? 0 : Math.floor(tr) - base;
        if (vis > SEG) vis = 255;
        const r = PIT * clamp(s / IN1, 0.05, 1) * clamp((IN3 - s) / (IN3 - IN2), 0, 1);
        for (let k = 0; k < G.PITS.length; k++) holes.push(G.PITS[k], r);
      } else {
        // pellets lie in the gap before every nose; each lunge ends with a gulp
        const quiet = s > OUT0 - 0.4 && +will[i] !== cur;
        const nb = trAt(n + 1), dl = nb - tr;
        if (!quiet && fb >= 0.25 && dl >= 1.5 && dl <= GAP - 2) {
          for (let k = 0; k < G.K; k++) pellet(G, ox, oy, Math.floor(nb) - G.HOFF[k] - 1);
        }
        // the lump of the last gulp, if there was one
        const dlE = trAt(n) - trAt(n - 0.2), sE = n - 0.2 - Tmin;
        const wasIn = sE < IN3 && +was[i] !== cur && sE >= 0;
        if (dlE >= 1.5 && dlE <= GAP - 2 && !wasIn) {
          const ld = Math.floor(4 + LUMP_V * fb);
          if (ld < G.len - 4) lump = ld;
        }
      }
      drawDigit(G, ox, oy, tr, cut, vis, lump, T);
      for (let k = 0; k < holes.length; k += 2) {
        const a = wrap(holes[k], G.L);
        hole(G.px[a] + ox, G.py[a] + oy, holes[k + 1], ((T * 12) | 0) + k);
      }
    }

    const buf = g.buf;
    for (let i = 0; i < N; i++) buf[i] = mask[i] ? INK565 : GROUND565;
    g.cost.px += N; g.cost.box += N * 2 + Math.round(ops);
  },
};
