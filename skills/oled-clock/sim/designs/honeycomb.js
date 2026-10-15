// Honeycomb — the time as liquid honey in a living hive.
//
// There is no field of comb here, only a tongue of it: one band of hexagonal
// cells built across the dark of the hive, from the top left down to the
// bottom right, thinning in the middle. Two honey numerals sit in it. The
// hours, small and up the tongue's upper end, have been poured and then sealed
// flat under wax, beads of it squeezed out around the rim. The minutes, larger
// and down at its lower end, are still wet — solid, with a dark shadow line
// under the meniscus and the cell walls notching their rim, because the honey
// has not settled. So the two halves of the time read as two different
// substances at two ends of one path, not as a row of four numerals.
//
// A forager walks the tongue between them, a lap a minute, from the hours to
// the minutes and back — the line the eye should follow. Two beads of honey
// hang where the tongue passes the middle, and a third falls between them once
// a second.
//
// The minute is a pour: the changed numeral's honey sinks, the top of the
// numeral emptying first, then the next minute's numeral fills from the bottom
// up with a travelling hump on its surface. The hour is a flood that runs the
// length of the tongue: honey sweeps from the hour end to the minute end
// filling every cell it passes, and when it has gone the hours are sealed
// again behind it.
//
// frame() is a pure function of the clock.

import { sprite, ease, clamp, lerp, smoothNoise, previousMinute, clockFields } from '../js/kit.js';

const SQ3 = Math.sqrt(3);
const NX = SQ3 / 2;
const TAU = Math.PI * 2;
const PW = 128, PH = 64;

// ---------------------------------------------------------------- the comb
const S = 5.6;
const HB = S * SQ3 / 2;
const COLX = 1.5 * S;
const ROWY = 2 * HB;
const CELLKEY = (q, r) => (q + 8) * 64 + r + 32;

/** Signed distance to the edge of a hexagon centred at the origin. */
function hexEdge(dx, dy) {
  const a = dy < 0 ? -dy : dy;
  const b = NX * dx + 0.5 * dy; const b1 = b < 0 ? -b : b;
  const c = -NX * dx + 0.5 * dy; const c1 = c < 0 ? -c : c;
  return Math.max(a, b1 > c1 ? b1 : c1) - HB;
}

// A static map of the lattice: the signed distance to the nearest wall and the
// cell each pixel belongs to. The whole face drifts by whole pixels, so this
// is built once and read at an offset.
const SDFv = new Int16Array(PW * PH);
const CELLv = new Int16Array(PW * PH);
function buildLattice() {
  for (let y = 0; y < PH; y++) {
    for (let x = 0; x < PW; x++) {
      const px = x + 0.5, py = y + 0.5;
      let best = 1e9, bq = 0, br = 0;
      const q0 = Math.round((px - S) / COLX);
      for (let dq = -1; dq <= 1; dq++) {
        const q = q0 + dq;
        const r = Math.round((py - HB - HB * q) / ROWY);
        for (let dr = -1; dr <= 1; dr++) {
          const rr = r + dr;
          const d = hexEdge(px - (S + COLX * q), py - (HB + ROWY * (rr + q / 2)));
          if (d < best) { best = d; bq = q; br = rr; }
        }
      }
      SDFv[y * PW + x] = Math.max(-400, Math.min(400, Math.round(best * 16)));
      CELLv[y * PW + x] = CELLKEY(bq, br);
    }
  }
}

// ---------------------------------------------------------------- the tongue
// One band of comb, from the hours down to the minutes. Which cells belong to
// it, and how far along it each cell sits, never change: only the pixels move.
const PATH = [[2, 22], [26, 15], [58, 30], [96, 44], [126, 58]];
const RIBBON = new Uint8Array(4096);       // cell is in the tongue
const ALONG = new Float32Array(4096);      // where along it the cell sits, 0..1
const CELLBOT = new Float32Array(4096);    // the cell's lower edge, for the flood

/** Centripetal Catmull-Rom through the control points, finely sampled. */
function spline(pts) {
  if (pts.length < 3) return pts.map((p) => [...p]);
  const Q = [[2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]], ...pts,
    [2 * pts.at(-1)[0] - pts.at(-2)[0], 2 * pts.at(-1)[1] - pts.at(-2)[1]]];
  const out = [];
  const tj = (a, b) => Math.max(1e-4, Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5);
  for (let i = 1; i < Q.length - 2; i++) {
    const [p0, p1, p2, p3] = [Q[i - 1], Q[i], Q[i + 1], Q[i + 2]];
    const t1 = tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
    const n = 12;
    for (let k = 0; k < n; k++) {
      const t = t1 + ((t2 - t1) * k) / n;
      const L = (a, b, ta, tb) => [((tb - t) * a[0] + (t - ta) * b[0]) / (tb - ta), ((tb - t) * a[1] + (t - ta) * b[1]) / (tb - ta)];
      const A1 = L(p0, p1, 0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
      const B1 = L(A1, A2, 0, t2), B2 = L(A2, A3, t1, t3);
      out.push(L(B1, B2, t1, t2));
    }
  }
  out.push([...pts.at(-1)]);
  return out;
}

const SPINE = spline(PATH);
const SEGLEN = [0];
for (let i = 1; i < SPINE.length; i++) SEGLEN.push(SEGLEN[i - 1] + Math.hypot(SPINE[i][0] - SPINE[i - 1][0], SPINE[i][1] - SPINE[i - 1][1]));
const PATHLEN = SEGLEN.at(-1);

/** A point on the tongue's centre-line at fraction `u`, and its direction. */
function alongPath(u) {
  const t = clamp(u, 0, 1) * PATHLEN;
  let lo = 1, hi = SEGLEN.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (SEGLEN[m] < t) lo = m + 1; else hi = m; }
  const c0 = SEGLEN[lo - 1], c1 = SEGLEN[lo];
  const k = c1 > c0 ? (t - c0) / (c1 - c0) : 0;
  const a = SPINE[lo - 1], b = SPINE[lo];
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
}
/** Half the width of the tongue at `u`: fatter at the two ends. */
const widthAt = (u) => 9.4 + 4.6 * (Math.exp(-((u / 0.20) ** 2)) + Math.exp(-(((u - 0.82) / 0.22) ** 2)));

function buildRibbon() {
  for (let q = -2; q <= 20; q++) {
    const r0 = Math.floor(-q / 2) - 2, r1 = Math.ceil(-q / 2) + 12;
    for (let r = r0; r <= r1; r++) {
      const cx = S + COLX * q, cy = HB + ROWY * (r + q / 2);
      if (cx < -14 || cx > PW + 14 || cy < -14 || cy > PH + 14) continue;
      let bd = 1e9, bu = 0;
      for (let i = 0; i < SPINE.length; i += 2) {
        const d = Math.hypot(cx - SPINE[i][0], cy - SPINE[i][1]);
        if (d < bd) { bd = d; bu = SEGLEN[i] / PATHLEN; }
      }
      const k = CELLKEY(q, r);
      CELLBOT[k] = cy + HB;
      const hw = widthAt(bu);
      if (bd < hw + HB) {
        // the walls of the tongue are built first and the middle is still
        // open, so the band reads as a tube the honey is being carried along
        const edge = bd > hw * 0.42;
        RIBBON[k] = (edge ? smoothNoise(q * 0.37 + r * 0.51, 3)  > 0.34
          : smoothNoise(q * 0.42 + r * 0.66, 3) > 0.78) ? 1 : 0;
        ALONG[k] = bu;
      }
    }
  }
}

// ---------------------------------------------------------------- the hand
// One continuous pour per numeral. Each glyph is a list of pieces; a piece is a
// smooth run through its control points, and the joins are corners.

const P = (s) => s.split(' ').map((v) => v.split(',').map(Number));
const oval = (cx, cy, rx, ry, sq) => {
  const o = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * TAU;
    const k = 1 - sq * Math.cos(a) - 0.03 * Math.cos(2 * a);
    o.push([cx + rx * Math.sin(a) * k, cy - ry * Math.cos(a) * k]);
  }
  return o;
};
const GLYPH = {
  0: [oval(8.5, 15, 6.0, 13.2, 0.06)],
  1: [P('3.4,7.6 8.6,2.5'), P('8.6,2.5 8.6,29')],
  2: [P('2.4,7.2 3.6,3.5 7.6,1.9 12.2,3.2 14,7.2 12.8,11.6 8.4,16.6 4,21.6 2.4,27.4'), P('2.4,27.4 15,27.4')],
  3: [P('2.6,4.6 6,2.2 11,2.4 13.6,6 12.2,10.6 8.6,12.8'), P('8.6,12.8 12.8,14.4 14.6,18.6 13.2,25 8.6,28.2 3.4,26.4')],
  4: [P('12.6,29 12.6,2.2'), P('12.6,2.2 2.2,20.6'), P('2.2,20.6 15.4,20.6')],
  5: [P('14.6,2.6 3.6,2.6'), P('3.6,2.6 3,11.6'), P('3,11.6 7,10.4 11,11 13.8,14.6 14,20.6 11.4,26 6.6,28.2 3,26')],
  6: [P('13.6,2.8 9,1.6 5,4 3.2,10 2.7,18 3.8,24 7.2,28 11.6,27.4 14,23.4 13.4,18.5 10.6,15.4 6.6,16 3.6,19.6')],
  7: [P('2.6,2.6 14.8,2.6'), P('14.8,2.6 10.6,9.6 8.6,18 8,28.6')],
  8: [P('8.5,14 5.6,11.2 5.2,6 8.5,2.2 11.8,6 11.4,11.2 8.5,14 4.6,17.8 3.2,23 6,27.6 11,27.6 13.8,23 12.4,17.8 8.5,14')],
  9: [P('3.6,27.2 8,28.4 12,25.8 14,20 14.4,12 13.4,6 10,2.2 5.6,2.8 3.4,6.8 3.9,11.8 6.9,14.8 10.9,14.2 13.6,10.6')],
};

/** One numeral's spine in its own box, for the bee and the ridge outlines. */
const SPINES = {};
for (const d of Object.keys(GLYPH)) {
  const pts = [];
  for (const piece of GLYPH[d]) for (const p of spline(piece)) pts.push(p);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  SPINES[d] = { pts, cum, len: cum.at(-1) };
}
function spineAt(d, u) {
  const sp = SPINES[d];
  const t = clamp(u, 0, 1) * sp.len;
  let lo = 1, hi = sp.cum.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sp.cum[m] < t) lo = m + 1; else hi = m; }
  const c0 = sp.cum[lo - 1], c1 = sp.cum[lo];
  const k = c1 > c0 ? (t - c0) / (c1 - c0) : 0;
  const a = sp.pts[lo - 1], b = sp.pts[lo];
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
}

// ---------------------------------------------------------------- on the tongue
// Hours at the upper end, small and sealed; minutes at the lower end, larger
// and wet. Same hand, two scales, two substances.
const SLOT = [
  { x: 13, y: 3, sc: 0.84, wax: 1 },
  { x: 30, y: 3, sc: 0.84, wax: 1 },
  { x: 75, y: 25, sc: 1.08, wax: 0 },
  { x: 98, y: 25, sc: 1.08, wax: 0 },
];
const R_OF = (sc) => 2.36 * sc;

/** Distance field, cross-stroke offset and ridge of a numeral at scale `sc`. */
const MASKS = new Map();
function maskOf(d, sc) {
  const key = d + '|' + sc.toFixed(2);
  let m = MASKS.get(key);
  if (m) return m;
  const w = Math.ceil(17 * sc) + 2, h = Math.ceil(30 * sc) + 2;
  const R = R_OF(sc), MR = R + 2.6;
  const dist = new Uint8Array(w * h);
  for (const piece of GLYPH[d]) {
    const pts = spline(piece);
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1][0] * sc, ay = pts[i - 1][1] * sc;
      const bx = pts[i][0] * sc, by = pts[i][1] * sc;
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - MR)), x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + MR));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - MR)), y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + MR));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5, py = y + 0.5;
          const k = len2 ? clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1) : 0;
          const dd = Math.hypot(px - ax - k * dx, py - ay - k * dy);
          if (dd > MR) continue;
          const v = Math.max(0, Math.min(255, Math.round((MR - dd) * 16)));
          if (v > dist[y * w + x]) dist[y * w + x] = v;
        }
      }
    }
  }
  m = { w, h, dist, R, MR };
  MASKS.set(key, m);
  return m;
}

// ---------------------------------------------------------------- the bees
// A honeybee: two wings held clear of a banded body, and six legs. 'o' is a
// dark band, so the stripes cut into the body without severing its outline.
const BEE = sprite(`
..##...##..
.####.####.
..##...##..
...........
..#######..
.#o##o##o#.
.#o##o##o#.
..#######..
..#..#..#..
`);
const BEE_FLY = sprite(`
.####.####.
.##########.
.####.####.
...........
..#######..
.#o##o##o#.
.#o##o##o#.
..#######..
..#..#..#..
`);

// ---------------------------------------------------------------- the clock
const MIN = 60;

/** A slow, whole-pixel drift of the whole face. */
function drift(date) {
  const t = date.getTime() / 1000;
  return [Math.round(2.3 * Math.sin(t * 0.00083) + 1.1 * Math.sin(t * 0.00217)),
    Math.round(2.1 * Math.sin(t * 0.00069 + 2.1) + 1.0 * Math.sin(t * 0.00193))];
}

/** The pour schedule for one numeral: how full it is, and is it moving. */
function slotFill(now, prev, next, s, isHour, hourTurn) {
  const changed = now !== prev;
  const leaves = now !== next;
  const fillDur = isHour && hourTurn ? 1.9 : 1.1;
  const drainDur = isHour && hourTurn ? 1.5 : 0.8;
  if (changed && s < fillDur) return [ease.outCubic(s / fillDur), 1];
  if (leaves && s >= MIN - drainDur) return [1 - ease.inCubic((s - (MIN - drainDur)) / drainDur), 1];
  return [1, 0];
}

/** The height above which a numeral's cell is dry. */
function surfaceY(top, bot, f, gx, t, motion) {
  const base = lerp(bot + 3, top - 3, f);
  if (motion === 0) return base;
  return base + motion * (1.6 * Math.sin(gx * 0.34 - t * 3.1) + 0.8 * Math.sin(gx * 0.83 + t * 5.3));
}

let BUILT = false;
export default {
  name: 'Honeycomb',
  blurb: 'A tongue of comb across the dark of a hive: the hours sealed small under wax at its top, the minutes wet and larger at its foot, and a forager walking between them.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { date, fields: f, oled, night }) {
    if (!BUILT) { BUILT = true; buildLattice(); buildRibbon(); }
    const t = date.getTime() / 1000;
    const s = f.sec;
    const [dx, dy] = drift(date);

    // ---- what the numerals are, and what they were and will be
    const now = [Number(f.hh[0]), Number(f.hh[1]), Number(f.mm[0]), Number(f.mm[1])];
    const pv = previousMinute(date);
    const prev = [Number(pv.hh[0]), Number(pv.hh[1]), Number(pv.mm[0]), Number(pv.mm[1])];
    const nxt = clockFields(new Date(date.getTime() + 60000));
    const next = [Number(nxt.hh[0]), Number(nxt.hh[1]), Number(nxt.mm[0]), Number(nxt.mm[1])];
    const hourTurn = f.m === 0;
    const hourCap = hourTurn
      ? clamp((s - 1.9) / 1.0, 0, 1) * clamp(1 - (s - (MIN - 2.4)) / 0.7, 0, 1)
      : 1;

    const slots = [];
    for (let i = 0; i < 4; i++) {
      const isH = i < 2;
      const [fill, motion] = slotFill(now[i], prev[i], next[i], s, isH, hourTurn);
      const mk = maskOf(now[i], SLOT[i].sc);
      slots.push({
        d: now[i], fill, motion, mk, sc: SLOT[i].sc, wax: SLOT[i].wax,
        cap: SLOT[i].wax ? hourCap : 0,
        x: SLOT[i].x + dx, y: SLOT[i].y + dy,
        top: SLOT[i].y + dy, bot: SLOT[i].y + dy + mk.h,
      });
    }

    // The hour's flood runs the length of the tongue: a front travelling from
    // the hours to the minutes, filling every cell it passes.
    const flood = hourTurn && s < 2.6 ? { front: ease.inOutQuad(clamp(s / 2.2, 0, 1)) } : null;

    // ---- the forager: a lap of the tongue a minute, and a flight home
    const WALK = 55;
    let bwx, bwy, bfly = false, bflip = false;
    if (s < WALK) {
      const u = s / WALK;
      const [gx, gy] = alongPath(u);
      const [ax2, ay2] = alongPath(Math.max(0, u - 0.02));
      let nxv = gy - ay2, nyv = ax2 - gx;
      const nl = Math.hypot(nxv, nyv) || 1; nxv /= nl; nyv /= nl;
      bwx = gx + dx + nxv * 1.5 - 5;
      bwy = gy + dy + nyv * 1.5 - 4;
      bflip = ax2 < gx;
    } else {
      const k = ease.inOutCubic((s - WALK) / (MIN - WALK));
      const a = alongPath(1), b = alongPath(0);
      bwx = lerp(a[0], b[0], k) + dx - 5;
      bwy = lerp(a[1], b[1], k) + dy - 4 - 8 * Math.sin(Math.PI * k);
      bfly = true;
    }
    const beeW = { x: bwx, y: bwy, fly: bfly, flip: bflip };

    // ------------------------------------------------------------ drawing
    const buf = g.buf, stride = g.width;

    // ---- the walls of the tongue
    for (let iy = 0; iy < PH; iy++) {
      const jy = iy - dy;
      if (jy < 0 || jy >= PH) continue;
      const jrow = jy * PW, orow = iy * stride, pyc = iy + 0.5;
      for (let ix = 0; ix < PW; ix++) {
        const jx = ix - dx;
        if (jx < 0 || jx >= PW) continue;
        const j = jrow + jx, k = CELLv[j], sdf = SDFv[j];
        if (sdf > -12 && sdf <= 0 && RIBBON[k]) buf[orow + ix] = 1;
      }
    }

    // ---- two lone cells, sealed and full, standing in the dark
    for (let n = 0; n < 2; n++) {
      const cxs = [112, 20][n] + dx + 2.4 * Math.sin(t * 0.00071 + n * 2.2);
      const cys = [12, 52][n] + dy + 2.0 * Math.sin(t * 0.00093 + n * 3.1);
      for (let iy = Math.floor(cys - HB - 1); iy <= cys + HB + 1; iy++) {
        if (iy < 0 || iy >= PH) continue;
        for (let ix = Math.floor(cxs - S - 1); ix <= cxs + S + 1; ix++) {
          if (ix < 0 || ix >= PW) continue;
          const e = hexEdge(ix + 0.5 - cxs, iy + 0.5 - cys);
          if (e <= 0 && e > -1.15) buf[iy * stride + ix] = 1;
        }
      }
    }

    // ---- the honey the flood leaves in the cells it has passed
    if (flood) {
      for (let iy = 0; iy < PH; iy++) {
        const jy = iy - dy;
        if (jy < 0 || jy >= PH) continue;
        const jrow = jy * PW, orow = iy * stride, pyc = iy + 0.5;
        for (let ix = 0; ix < PW; ix++) {
          const jx = ix - dx;
          if (jx < 0 || jx >= PW) continue;
          const j = jrow + jx;
          const k = CELLv[j], sdf = SDFv[j];
          if (sdf > 0) continue;
          const u = ALONG[k];
          if (!RIBBON[k] || u > flood.front) continue;
          // the cell fills from the bottom, and settles back after the front
          const lvl = ease.outQuad(clamp(1 - (flood.front - u) / 0.10, 0, 1)) * 0.85;
          if (pyc > CELLBOT[k] + dy - lvl * 2 * HB) buf[orow + ix] = 1;
        }
      }
    }

    // ---- the numerals, poured over the tongue
    for (let n = 0; n < 4; n++) {
      const sl = slots[n];
      const mk = sl.mk, md = mk.dist, mw = mk.w, mh = mk.h, R = mk.R;
      const capped = sl.cap > 0.5;
      const rad = R + (capped ? 0.5 : 0);
      for (let i = 0; i < mw; i++) {
        const ix = sl.x + i;
        if (ix < 0 || ix >= PW) continue;
        const pxc = ix + 0.5;
        const surf = surfaceY(sl.top, sl.bot, sl.fill, pxc - sl.x, t, sl.motion);
        for (let j = 0; j < mh; j++) {
          const iy = sl.y + j;
          if (iy < 0 || iy >= PH) continue;
          const dd = mk.MR - md[j * mw + i] / 16;
          let px = -1;
          if (dd < R + 2.5) px = 0;                        // clear the comb away
          const pyc = iy + 0.5;
          if (capped) {
            // a lid of wax, and the rim of the cap standing proud of it
            if (dd <= R && pyc > surf) px = 1;
            else if (dd > R + 0.55 && dd < R + 1.5) px = 1;
          } else if (dd <= rad && pyc > surf) {
            {
              let ok = true;
              if (dd > R - 0.75) {                         // the walls notch the rim
                const jx = ix - dx, jy = iy - dy;
                if (jx >= 0 && jy >= 0 && jx < PW && jy < PH) {
                  const sdf = SDFv[jy * PW + jx];
                  if (sdf > -12 && sdf <= 0) ok = false;
                }
              }
              if (ok && sl.motion > 0 && pyc > surf + 0.9 && pyc < surf + 2.6) ok = false;
              if (ok) px = 1;
            }
          }
          if (px >= 0) buf[iy * stride + ix] = px;
        }
      }
    }

    // ---- beads of wax squeezed out around a sealed hour
    for (let n = 0; n < 2; n++) {
      const sl = slots[n];
      if (sl.cap < 0.5) continue;
      const sp = SPINES[sl.d];
      for (let q = 0; q < 5; q++) {
        const u = 0.08 + q * 0.21;
        const [ax2, ay2] = spineAt(sl.d, u);
        const [bx2, by2] = spineAt(sl.d, Math.min(1, u + 0.02));
        let nxv = by2 - ay2, nyv = ax2 - bx2;
        const nl = Math.hypot(nxv, nyv) || 1; nxv /= nl; nyv /= nl;
        const sg = q % 2 ? 1 : -1;
        const bx3 = sl.x + ax2 * sl.sc + nxv * sg * (R_OF(sl.sc) + 0.7);
        const by3 = sl.y + ay2 * sl.sc + nyv * sg * (R_OF(sl.sc) + 0.7);
        const bi = Math.round(bx3), bj = Math.round(by3);
        if (bi > 0 && bi < PW - 1 && bj > 0 && bj < PH - 1) {
          buf[bj * stride + bi] = 1;
          if (q % 2 === 0) buf[bj * stride + bi + 1] = 1;
        }
      }
    }

    // ---- the colon: two beads where the tongue passes the middle, and a
    // third that falls between them once a second.
    const cbx = 62 + dx, cby0 = 26 + dy, cby1 = 37 + dy;
    const sub = s - Math.floor(s);
    const grav = sub * sub;
    const dropY = lerp(cby0 + 2.6, cby1 - 2.4, grav);
    const dropR = 1.5 + 0.85 * (1 - grav);
    const beadT = 3.1;
    for (let iy = Math.floor(cby0 - 4); iy <= cby1 + 4; iy++) {
      if (iy < 0 || iy >= PH) continue;
      for (let ix = Math.floor(cbx - 4); ix <= cbx + 4; ix++) {
        if (ix < 0 || ix >= PW) continue;
        const pxc = ix + 0.5, pyc = iy + 0.5;
        const ax2 = pxc - cbx, ay0 = pyc - cby0, ay1 = pyc - cby1;
        const d0 = ax2 * ax2 + ay0 * ay0, d1 = ax2 * ax2 + ay1 * ay1;
        const db = d0 < d1 ? d0 : d1;
        let v = -1;
        if (db >= beadT * beadT && db < (beadT + 1.3) ** 2) v = 0;
        const dd = ax2 * ax2 + (pyc - dropY) ** 2;
        if (dd >= dropR * dropR && dd < (dropR + 0.9) ** 2) v = 0;
        if (d0 < beadT * beadT || d1 < beadT * beadT || dd < dropR * dropR) v = 1;
        if (v >= 0) buf[iy * stride + ix] = v;
      }
    }

    // ---- a drip lets go of the tongue's lower edge now and then
    {
      const D = { x: 104 + dx, period: 11.3, phase: 0.42, fall: 0.62 };
      const u = (t / D.period + D.phase) % 1;
      const top = 60 + dy;
      if (u < D.fall) {
        const len = 3.4 * ease.inQuad(u / D.fall);
        const wdt = 0.7 + 0.55 * (u / D.fall);
        for (let iy = Math.floor(top); iy <= top + len + 1; iy++) {
          if (iy < 0 || iy >= PH) continue;
          const k = clamp((iy + 0.5 - top) / Math.max(0.6, len), 0, 1);
          const hw = 0.7 + k * (wdt - 0.7);
          for (let ix = Math.floor(D.x - wdt); ix <= D.x + wdt; ix++) {
            if (ix < 0 || ix >= PW) continue;
            if (Math.abs(ix + 0.5 - D.x) <= hw) buf[iy * stride + ix] = 1;
          }
        }
      }
    }

    // ---- the forager, on top of everything: a ring of dark, then the body
    {
      const spr = beeW.fly ? BEE_FLY : BEE;
      const ox = Math.floor(beeW.x - 0.5), oy = Math.floor(beeW.y - 0.5);
      const w = spr.w + 2, h = spr.h + 2;
      const at = (i, j) => (i < 0 || j < 0 || i >= spr.w || j >= spr.h) ? 0
        : spr.data[j * spr.w + (beeW.flip ? spr.w - 1 - i : i)];
      for (let j = 0; j < h; j++) {
        const iy = oy + j - 1;
        if (iy < 0 || iy >= PH) continue;
        for (let i = 0; i < w; i++) {
          const ix = ox + i - 1;
          if (ix < 0 || ix >= PW) continue;
          const li = i - 1, lj = j - 1;
          if (at(li, lj)) buf[iy * stride + ix] = 1;
          else if (at(li - 1, lj) || at(li + 1, lj) || at(li, lj - 1) || at(li, lj + 1)
            || at(li - 1, lj - 1) || at(li + 1, lj - 1) || at(li - 1, lj + 1) || at(li + 1, lj + 1))
            buf[iy * stride + ix] = 0;
        }
      }
    }

    oled.contrast(0xd2 + (0x22 - 0xd2) * night);
  },
};
