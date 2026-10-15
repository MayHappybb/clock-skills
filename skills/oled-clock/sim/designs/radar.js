// Radar — the time as weather on a plan-position indicator.
//
// A PPI scope centred on the glass: the antenna sits between the hours and
// the minutes, its sweep turns once every 3 s (20 rpm), locked to the clock
// so it points north at every :00, :03, :06... The rectangular glass crops
// the scope: three range rings are whole, the rest are arcs, and bearing
// ticks run round the border where each 10-degree ray meets it.
//
// The digits are radar returns, a storm cell for each. A screen pixel shows
// what the sweep found the last time it passed that pixel's bearing, fading
// until the next pass (a digital scan converter: each pass repaints). The
// echo is sampled on the radar's own polar cells (2 degrees by 1.5 px), so
// far from the centre it breaks into little arcs, and its edges scintillate,
// re-rolled every pass; only the solid core stays put. The letterforms are
// drawn for this: thick strokes that swell and taper like rain bands.
//
// Traffic: an airliner in the top band and a ship in the bottom one, raw
// blips painted by the sweep, with history dots and ATC data blocks that
// jump forward at each paint. Ground clutter boils round the antenna, and
// the colon is two beacons that flare when the sweep passes.
//
// The minute turn: from :55 the tracker acquires the digits that will
// change, a track box hopping along each stroke. From :57 every pass of the
// sweep finds the echo gone (the storm has passed), so by :00 only the track
// boxes hold the old digit. They lift off at :58.6, scatter, and land on the
// new digit's strokes at about :01.5; the crossing is timed so the swarm is
// shapeless at :00, never a mix of old and new. Then the sweep paints the
// new echo and each box vanishes as the sweep reaches it. On the hour every
// digit goes, the swarm dives into the antenna at :00, an IFF interrogation
// flashes the panel (one-frame invert) and rings out across the scope, every
// contact squawks the hour, and the swarm bursts out into the new time.
//
// Everything is derived from the clock: what a pixel shows is the target as
// it was at the pass time, sec - age, which can lie in the previous minute;
// the target at any instant follows from this minute's, the last and the
// next digits. Track flights, scintillation and clutter come from noise() of
// the turn's minute key and the pass number. Polar tables are cached by
// orbit offset, digit fields at load.
//
// Burn-in: the whole scope walks a 3 px orbit; rings are dotted and the
// dots crawl round with the minute; the sweep and its wedge move all day.
// From 23:00 to 07:00 the panel runs at low contrast.

import { dither, noise, orbit, previousMinute, clockFields, clamp, font3x5 } from '../js/kit.js';

const TAU = Math.PI * 2;
const W = 128, H = 64;
const P = 3;                          // sweep period, s; divides the minute
const CX = 64, CY = 32;               // the antenna, before the orbit
const BW = 22, BH = 38, PAD = 4;      // a digit's box, and the field's margin
const GW = BW + 2 * PAD, GH = BH + 2 * PAD;
const SLOT_X = [5, 31, 75, 101], SLOT_Y = 13;
const AZ = TAU / 180;                 // azimuth cell: 2 degrees
const RB = 1.5;                       // range bin, px
const COLON = [[0, -8], [0, 8]];

// ------------------------------------------------------------ letterforms
// Centre-lines in a 14 x 30 box (y down), in pieces: a piece is smoothed,
// pieces meet at corners. The stroke swells mid-stroke and tapers at the
// open ends, like a rain band.

const SK = {
  0: [ellipse(7, 15, 7, 15)],
  1: [[[2, 7], [5.5, 3.5], [8.5, 0]], [[8.5, 0], [8.5, 30]]],
  2: [[[0.5, 7.5], [2, 2.2], [7, 0], [12, 2], [13.6, 7], [12, 12.5], [6, 19.5], [0, 30]], [[0, 30], [14, 30]]],
  3: [[[0.5, 3.5], [4, 0.3], [9, 0.3], [13, 3.5], [13, 8.5], [10, 12.5], [5.5, 14.2]],
    [[5.5, 14.2], [10.5, 15.5], [14, 19.5], [14, 25], [11, 29.5], [6, 30], [2, 29], [0, 26]]],
  4: [[[10.5, 30], [10.5, 0]], [[10.5, 0], [0, 21]], [[0, 21], [14, 21]]],
  5: [[[13.5, 0], [2, 0]], [[2, 0], [1, 13.5]],
    [[1, 13.5], [6, 11.6], [11.5, 13], [14, 19], [13.6, 25.5], [9.5, 29.7], [4, 30], [0, 27]]],
  6: [[[12.5, 1.5], [8, 0], [3.5, 2], [0.8, 8], [0, 15], [0, 22], [2, 28], [7, 30], [12, 28], [14, 22.5], [12.5, 16.5], [7, 14.5], [2.5, 16], [0.3, 20]]],
  7: [[[0, 0], [14, 0]], [[14, 0], [9.5, 10], [6.5, 20], [5, 30]]],
  8: [[[7, 14.5], [2.2, 12], [1, 7], [2.5, 2], [7, 0], [11.5, 2], [13, 7], [11.8, 12], [7, 14.5], [1.5, 17.5], [0, 23], [2, 28.5], [7, 30], [12, 28.5], [14, 23], [12.5, 17.5], [7, 14.5]]],
};
SK[9] = SK[6].map((pc) => pc.map(([x, y]) => [14 - x, 30 - y]));

function ellipse(cx, cy, rx, ry) {
  const pts = [];
  for (let i = 0; i <= 24; i++) { const a = (i / 24) * TAU; pts.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]); }
  return pts;
}

/** Catmull-Rom through a piece's points, finely sampled. */
function smooth(pts) {
  if (pts.length < 3) return pts;
  const closed = Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) < 0.01;
  const at = (i) => {
    if (closed) { const n = pts.length - 1; return pts[((i % n) + n) % n]; }
    if (i < 0) return [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]];
    if (i >= pts.length) return [2 * pts.at(-1)[0] - pts.at(-2)[0], 2 * pts.at(-1)[1] - pts.at(-2)[1]];
    return pts[i];
  };
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let k = 0; k < 10; k++) {
      const t = k / 10, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  out.push(pts.at(-1));
  return out;
}

/** A digit's centre-line as one path of [x, y, s] in its box, and its total length. */
function skeleton(d) {
  const raw = [];
  for (const pc of SK[d]) for (const p of smooth(pc)) raw.push([p[0] + PAD + 4, p[1] + PAD + 4]);
  // Resample to ~0.4 px so straight pieces have samples along them too.
  const path = [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    const [ax, ay] = raw[i - 1], [bx, by] = raw[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.4));
    for (let k = 1; k <= n; k++) path.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  let s = 0;
  const out = path.map((p, i) => { if (i) s += Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]); return [p[0], p[1], s]; });
  return { pts: out, len: s, closed: d === '0' || d === '8' || +d === 0 || +d === 8 };
}

const R0 = 2.4;
/**
 * A digit's echo as a field over its box: how deep inside the stroke each
 * pixel is (radius minus distance; >= 0 is the core). Built once.
 */
function buildField(d) {
  const sk = skeleton(d);
  const F = new Float32Array(GW * GH).fill(-9);
  const rad = sk.pts.map(([, , s]) => {
    const end = sk.closed ? 1 : clamp(Math.min(s, sk.len - s) / 6, 0, 1);
    return R0 * (0.72 + 0.28 * end) * (0.92 + 0.16 * Math.sin(s * 0.45 + d * 1.7));
  });
  for (let y = 0; y < GH; y++)
    for (let x = 0; x < GW; x++) {
      let best = -9;
      for (let i = 0; i < sk.pts.length; i++) {
        const v = rad[i] - Math.hypot(x + 0.5 - sk.pts[i][0], y + 0.5 - sk.pts[i][1]);
        if (v > best) best = v;
      }
      F[y * GW + x] = best;
    }
  return F;
}
const FIELD = Array.from({ length: 10 }, (_, d) => buildField(d));

/** N track positions along a digit's centre-line, evenly by length. */
const NT = 14;
const TRACK_PTS = Array.from({ length: 10 }, (_, d) => {
  const sk = skeleton(d);
  const n = sk.closed ? NT : NT - 1;
  const out = [];
  for (let j = 0, i = 0; j < NT; j++) {
    const s = (sk.len * j) / n;
    while (i < sk.pts.length - 1 && sk.pts[i + 1][2] < s) i++;
    out.push([sk.pts[i][0] - PAD, sk.pts[i][1] - PAD]);
  }
  return out;
});

// ------------------------------------------------------------ polar tables

const polarCache = new Map();
/** Per screen pixel: its bearing, range, and the polar cell it falls in. */
function polar(cx, cy) {
  const key = `${cx},${cy}`;
  if (polarCache.has(key)) return polarCache.get(key);
  const n = W * H;
  const T = { phi: new Float32Array(n), r: new Float32Array(n), qx: new Float32Array(n), qy: new Float32Array(n),
    tsw: new Float32Array(n), cell: new Int32Array(n), tswRaw: new Float32Array(n) };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x, dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const r = Math.hypot(dx, dy);
      let phi = Math.atan2(dx, -dy);
      if (phi < 0) phi += TAU;
      const ai = Math.floor(phi / AZ), ri = Math.floor(r / RB);
      const pq = (ai + 0.5) * AZ, rq = (ri + 0.5) * RB;
      T.phi[i] = phi; T.r[i] = r;
      T.qx[i] = cx + rq * Math.sin(pq); T.qy[i] = cy - rq * Math.cos(pq);
      T.tsw[i] = (pq / TAU) * P; T.tswRaw[i] = (phi / TAU) * P;
      T.cell[i] = ai * 97 + ri;
    }
  polarCache.set(key, T);
  return T;
}

/** Seconds since the sweep last passed sweep-time `ts` (0..P), at `sec`. */
const ageAt = (sec, ts) => (((sec - ts) % P) + P) % P;
const tswOf = (x, y, cx, cy) => { let a = Math.atan2(x - cx, cy - y); if (a < 0) a += TAU; return (a / TAU) * P; };

// ------------------------------------------------------------ what the radar sees

const BREAK = 54, WIPE = 57;          // the echo weakens, then is gone
const LIFT = -1.4, FLY = 2.8, JIT = 0.25;   // track flights, relative to :00
const LOCK = LIFT + JIT + FLY;        // every track has landed by then

/**
 * The echo in a slot at pass time `tp` (seconds of this minute, may be
 * negative = the previous minute): null, or the digit and how far it has
 * broken up (0..1).
 */
function echoAt(X, slot, tp) {
  if (tp < 0) return X.inn[slot] ? null : { d: X.now[slot], k: 0 };
  if (X.inn[slot] && tp < LOCK) return null;
  if (X.out[slot]) {
    if (tp >= WIPE) return null;
    if (tp >= BREAK) return { d: X.now[slot], k: (tp - BREAK) / (WIPE - BREAK) };
  }
  return { d: X.now[slot], k: 0 };
}

/** Phosphor: bright at the paint, settling to a steady glow by the next pass. */
const decay = (age) => 0.5 + 0.5 * Math.exp(-age / 0.8);

function drawEchoes(g, X, T, sec, ox, oy) {
  for (let s = 0; s < 4; s++) {
    const bx = SLOT_X[s] + ox - PAD, by = SLOT_Y + oy - PAD;
    for (let y = Math.max(0, by); y < Math.min(H, by + GH); y++)
      for (let x = Math.max(0, bx); x < Math.min(W, bx + GW); x++) {
        const i = y * W + x;
        const lx = Math.floor(T.qx[i]) - bx, ly = Math.floor(T.qy[i]) - by;
        if (lx < 0 || ly < 0 || lx >= GW || ly >= GH) continue;
        const age = ageAt(sec, T.tsw[i]);
        const tp = sec - age;
        const E = echoAt(X, s, tp);
        if (!E) continue;
        const e = FIELD[E.d][ly * GW + lx];
        if (e < -2.6) continue;
        const pass = Math.round((tp - T.tsw[i]) / P) + X.key * 20;
        const sc = noise(T.cell[i] * 0.37 + s * 7, pass % 9973);
        const fresh = age < 0.3 ? 1 - age / 0.3 : 0;
        let a;
        if (e >= 0) a = 1.75;
        else if (e >= -1) a = 0.5 + 0.6 * sc;
        else if (e >= -1.8) a = 0.15 + 0.4 * sc;
        else a = 0.6 * fresh * sc;
        if (E.k > 0) {
          // A storm cell breaking up: the core thins, cells drop out.
          if (sc < E.k * 0.7) a = 0;
          else if (e < E.k * 1.8 - 0.2) a = Math.min(a, 0.45);
        }
        const v = a * decay(age);
        if (v >= 1 || dither(x, y, v)) g.pixel(x, y, 1);
      }
  }
}

// ------------------------------------------------------------ scope furniture

const lit = (g, x, y) => g.get(x, y) || g.get(x - 1, y) || g.get(x + 1, y) || g.get(x, y - 1) || g.get(x, y + 1);

function drawRings(g, cx, cy, crawl) {
  for (let r = 15; r <= 75; r += 15) {
    const n = Math.round((TAU * r) / 2);
    for (let k = 0; k < n; k++) {
      const a = ((k + crawl) / n) * TAU;
      const x = Math.round(cx - 0.5 + r * Math.sin(a)), y = Math.round(cy - 0.5 - r * Math.cos(a));
      if (x < 0 || y < 0 || x >= W || y >= H || lit(g, x, y)) continue;
      g.pixel(x, y, 1);
    }
  }
}

/** Bearing ticks where each 10-degree ray meets the edge of the glass. */
function drawTicks(g, cx, cy) {
  for (let deg = 0; deg < 360; deg += 10) {
    const a = (deg * Math.PI) / 180, dx = Math.sin(a), dy = -Math.cos(a);
    const tx = dx > 0 ? (W - 0.5 - cx) / dx : dx < 0 ? (0.5 - cx) / dx : 1e9;
    const ty = dy > 0 ? (H - 0.5 - cy) / dy : dy < 0 ? (0.5 - cy) / dy : 1e9;
    const t = Math.min(tx, ty);
    const len = deg % 90 === 0 ? 4 : deg % 30 === 0 ? 3 : 2;
    for (let k = 0; k < len; k++) {
      const x = Math.floor(cx + dx * (t - k)), y = Math.floor(cy + dy * (t - k));
      if (!lit(g, x, y)) g.pixel(x, y, 1);
    }
  }
}

/** The sweep and the glow it leaves on the dark behind it. */
function drawSweep(g, T, cx, cy, sec) {
  const th = ((sec % P) / P) * TAU;
  const span = 0.8;
  for (let i = 0; i < W * H; i++) {
    const d = (((th - T.phi[i]) % TAU) + TAU) % TAU;
    if (d > span || T.r[i] < 3) continue;
    const x = i % W, y = (i / W) | 0;
    if (g.buf[i]) continue;
    const u = 1 - d / span;
    if (dither(x, y, 0.32 * u * u)) g.buf[i] = 1;
  }
  const dx = Math.sin(th), dy = -Math.cos(th);
  for (let r = 2; r < 75; r += 0.5) {
    const x = Math.floor(cx + dx * r), y = Math.floor(cy + dy * r);
    if (x < 0 || y < 0 || x >= W || y >= H) break;
    g.pixel(x, y, 1);
  }
}

/** Ground clutter boiling round the antenna, and the colon's two beacons. */
function drawCentre(g, T, cx, cy, sec, key) {
  const x0 = Math.floor(cx - 7), y0 = Math.floor(cy - 7);
  for (let y = y0; y < y0 + 14; y++)
    for (let x = x0; x < x0 + 14; x++) {
      const i = y * W + x, r = T.r[i];
      if (r > 5.5 || r < 1.5) continue;
      const age = ageAt(sec, T.tsw[i]);
      const pass = Math.round((sec - age - T.tsw[i]) / P) + key * 20;
      const p = 0.75 * (1 - (r - 1.5) / 4);
      if (noise(T.cell[i] * 0.71, pass % 9973) < p * decay(age)) g.pixel(x, y, 1);
    }
  for (const [bx, by] of COLON) {
    const x = cx + bx, y = cy + by;
    const age = ageAt(sec, tswOf(x, y, cx, cy));
    const flare = age < 0.4;
    g.fillCircle(x, y, flare ? 2.6 : 2, 1);
  }
}

// ------------------------------------------------------------ traffic

const TRAFFIC = [
  { period: 170, phase: 0.13, y: 6, dir: 1, calls: ['BAW217', 'DLH4K', 'KLM62', 'UAE88', 'AFR9T', 'CES501', 'JAL7'], alt: ['350', '370', '310', '390', '330'], tagY: 4 },
  { period: 460, phase: 0.62, y: 57, dir: -1, calls: ['ORCA', 'TUG 7', 'FERRY', 'KOI'], alt: ['12K', '8K', '15K', '10K'], tagY: 55 },
];

const trafficPos = (c, T) => {
  const u = T / c.period + c.phase, pass = Math.floor(u), f = u - pass;
  return { x: c.dir > 0 ? -30 + f * 190 : 160 - f * 190, pass };
};

function drawTraffic(g, cx, cy, ox, oy, Tabs, sec, squawk) {
  for (const c of TRAFFIC) {
    const here = trafficPos(c, Tabs);
    const ts = tswOf(here.x + ox, c.y + oy, cx, cy);
    const age = ageAt(sec, ts);
    const tp = Tabs - age;
    const at = trafficPos(c, tp);
    if (at.pass !== here.pass) continue;
    const X = Math.round(at.x + ox), Y = c.y + oy;
    if (X < -4 || X > W + 3) continue;
    // History: where the last four passes found it.
    for (let k = 1; k <= 4; k++) {
      const h = trafficPos(c, tp - k * P);
      if (h.pass === here.pass) g.pixel(Math.round(h.x + ox), Y, 1);
    }
    // The raw blip: a smear along the sweep, fading.
    const v = decay(age);
    g.fillRect(X - 1, Y - 1, 3, 3, 0);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [2, 0]])
      if (dx >= 0 && dx <= 1 && dy >= 0 ? true : age < 0.4) g.pixel(X + dx, Y + dy, v > 0.55 || dither(X + dx, Y + dy, v) ? 1 : 0);
    // The data block, with its leader.
    const call = c.calls[((here.pass % c.calls.length) + c.calls.length) % c.calls.length];
    const txt = squawk ? `${call} ${squawk}` : `${call} ${c.alt[((here.pass % c.alt.length) + c.alt.length) % c.alt.length]}`;
    const tw = font3x5.measure(txt);
    let tx = X + 6;
    if (tx + tw > W - 2) tx = X - 4 - tw;
    const ty = Y - 2;
    g.fillRect(tx - 1, ty - 1, tw + 2, 7, 0);
    g.text(txt, tx, ty, { font: font3x5 });
    if (tx > X) g.hline(X + 3, Y, tx - X - 4); else g.hline(tx + tw + 1, Y, X - tx - tw - 3);
  }
}

// ------------------------------------------------------------ the track swarm

/**
 * Track j of `slot` across a turn: on the old digit's stroke until it lifts,
 * through a scattered midpoint (the antenna, on the hour) at about :00, onto
 * the new digit's stroke. `tau` is seconds after :00 of the turn.
 */
function trackAt(oldD, newD, slot, j, tau, key, hour, ox, oy) {
  const sx = SLOT_X[slot] + ox, sy = SLOT_Y + oy;
  const o = TRACK_PTS[oldD][j], n = TRACK_PTS[newD][j];
  const t0 = LIFT + JIT * (2 * noise(j + slot * 17, key) - 1);
  const u = clamp((tau - t0) / FLY, 0, 1);
  const e = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
  const mid = hour
    ? [CX + ox - sx + (noise(j, key + 3) - 0.5) * 4, CY + oy - sy + (noise(j, key + 4) - 0.5) * 4]
    : [-4 + 30 * noise(j + slot * 31, key + 1), -4 + 46 * noise(j + slot * 31, key + 2)];
  const c = [2 * mid[0] - (o[0] + n[0]) / 2, 2 * mid[1] - (o[1] + n[1]) / 2];
  const b = (k) => (1 - e) ** 2 * o[k] + 2 * (1 - e) * e * c[k] + e * e * n[k];
  return { x: sx + b(0), y: sy + b(1), u };
}

function trackBox(g, x, y) {
  x = Math.round(x); y = Math.round(y);
  g.fillRect(x - 2, y - 2, 5, 5, 0);
  g.rect(x - 1, y - 1, 3, 3, 1);
}

/** The swarm across one turn: `tau` seconds after its :00, `A` the turn's digits. */
function drawSwarm(g, A, tau, cx, cy, ox, oy) {
  for (let s = 0; s < 4; s++) {
    if (!A.changed[s]) continue;
    for (let j = 0; j < NT; j++) {
      const acquired = -5 + 0.25 * s + (1.0 * j) / NT;
      if (tau < acquired) continue;
      const p = trackAt(A.was[s], A.now[s], s, j, tau, A.key, A.hour, ox, oy);
      if (p.u >= 1) {
        // Landed: gone when the sweep paints the new echo under it.
        const ts = tswOf(p.x, p.y, cx, cy);
        const tAbs = LOCK + ((ts - LOCK) % P + P) % P;
        if (tau >= tAbs) continue;
      }
      if (p.u > 0 && p.u < 1) {
        for (let k = 1; k <= 3; k++) {
          const h = trackAt(A.was[s], A.now[s], s, j, tau - 0.09 * k, A.key, A.hour, ox, oy);
          g.pixel(Math.round(h.x), Math.round(h.y), 1);
        }
      }
      trackBox(g, p.x, p.y);
    }
  }
}

const digitsOf = (f) => [...`${f.hh}${f.mm}`].map(Number);

export default {
  name: 'Radar',
  blurb: 'A PPI radar scope: the time is four storm cells the sweep repaints; on the minute a swarm of tracks re-forms it.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { fields: f, date, oled, night }) {
    const sec = f.sec, Tabs = date.getTime() / 1000;
    const prev = previousMinute(date), next = clockFields(new Date(date.getTime() + 60000));
    const now = digitsOf(f), was = digitsOf(prev), will = digitsOf(next);
    const hourIn = f.m === 0, hourOut = next.m === 0;
    const [ox, oy] = orbit(date, 3, 2);
    const cx = CX + ox, cy = CY + oy;
    const T = polar(cx, cy);
    const X = {
      now, key: f.minuteKey % 9973,
      inn: now.map((d, i) => hourIn || d !== was[i]),
      out: now.map((d, i) => hourOut || d !== will[i]),
    };

    drawEchoes(g, X, T, sec, ox, oy);
    drawCentre(g, T, cx, cy, sec, X.key);
    drawRings(g, cx, cy, (f.minuteKey % 60) / 20);
    drawTicks(g, cx, cy);
    drawSweep(g, T, cx, cy, sec);

    // The turn this minute ends with, or the one it began with.
    const ahead = sec >= 54;
    const A = ahead
      ? { was: now, now: will, hour: hourOut, key: (f.minuteKey + 1) % 9973, changed: X.out }
      : { was, now, hour: hourIn, key: X.key, changed: X.inn };
    const tau = ahead ? sec - 60 : sec;
    const hour = A.hour;

    // IFF: on the hour every contact answers with the time.
    const squawk = hourIn && sec > 0.3 && sec < 6 ? `${f.hh}${f.mm}` : null;
    drawTraffic(g, cx, cy, ox, oy, Tabs, sec, squawk);
    if (tau > -6 && tau < 6) drawSwarm(g, A, tau, cx, cy, ox, oy);

    if (hour && tau >= 0 && tau < 1.6) {
      for (const lag of [0, 0.25, 0.5]) {
        const r = (tau - lag) * 70;
        if (r > 2) g.ring(cx, cy, r - 0.8, r + 0.8, 1);
      }
    }
    oled.invert(hour && tau >= 0 && tau < 0.034);   // the interrogation flash: two frames
    oled.contrast(0xcf + (0x20 - 0xcf) * night);   // night dimming, 23:00-07:00 (ctx.night)
  },
};
