// Potter — the time pressed into wet clay on a spinning wheel.
//
// A wide-mouthed jar stands on the wheel head under a dark studio light,
// turning with the wheel and swaying a little because it is not quite
// centred. Nothing on the glass is painted: the time is pressed into the
// clay, and the whole face is a relief lit from the upper left — the digits
// exist only as the ridges of a height field, and they are read the way a
// mark on a pot is read, by the light catching one flank of each ridge and
// the other flank falling into shadow.
//
// The clay does what clay does. A numeral never switches: over the last half
// second of the minute the changed numeral is smoothed flat, the potter's
// thumb easing the old ridges back into the wall; at :00 the thumb comes
// down again and the new numeral rises out of the clay, one digit after the
// next, springing a little past its height before it settles. In between,
// the surface is simply smooth — nothing false is ever shown.
//
// On the hour the pot is thrown again. From :58.6 the wall settles down into
// a lump of clay (the relief sinks with it); at :00 the wheel is already
// running fast, and the lump is drawn up into the jar over the next two
// seconds, the new hour and minute rising with it. Slip spatters off the
// rim. Then the wheel slows back to its working speed.
//
// Always alive: the wheel head turns at about a revolution every two and a
// half seconds, its throw-marks wheeling round the rim; the pot sways with
// its off-centre; water creeps down the wall in a slow thread; and the
// ridges on the shoulder flicker as they turn through the light.
//
// Burn-in: the whole picture walks a two-pixel orbit every three minutes,
// and the pot's sway moves with it. From 23:00 to 07:00 the panel dims
// through ctx.night.

import {
  dither, clamp, lerp, ease, noise, orbit, previousMinute, clockFields, ON, OFF,
} from '../js/kit.js';

const TAU = Math.PI * 2;
const CX = 64;
const FOOT = 57;                    // where the pot sits on the wheel head
const RIM_TOP = 14;                 // the top of the rim, fully thrown
const LUMP_TOP = 44;                // the top of the clay when it has settled
const REV = 2.5;                    // seconds per turn of the wheel head

// the jar's half-width at v, v running 0 at the foot to 1 at the rim
const PROFILE = [16, 34, 42.5, 45.5, 46.5, 46.5, 46, 45.5, 45, 44.5, 44, 42.5, 41];

/** Half-width of the wall at v, narrowed while the clay is still a lump. */
const LUMP = [15, 25, 30, 32.5, 33, 32.5, 31, 28.5, 25, 20.5, 15, 8, 2];

/** Half-width of the wall at v, blended from the settled lump to the pot. */
function widthAt(v, u) {
  const n = PROFILE.length;
  const t = clamp(v, 0, 1) * (n - 1);
  const i = Math.min(n - 2, Math.floor(t)), k = t - i;
  const w = (j) => lerp(LUMP[j], PROFILE[j], u);
  const p0 = w(Math.max(0, i - 1)), p1 = w(i);
  const p2 = w(i + 1), p3 = w(Math.min(n - 1, i + 2));
  return Math.max(1, 0.5 * (2 * p1 + (-p0 + p2) * k
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * k * k
    + (-p0 + 3 * p1 - 3 * p2 + p3) * k * k * k));
}

/** The burn-in orbit, applied to the finished frame: g.shift, without
 *  allocating a fresh buffer every frame. */
const SCRATCH = new Uint8Array(128 * 64);
function ride(g, dx, dy) {
  if (!dx && !dy) return;
  const b = g.buf, W = g.width, H = g.height;
  SCRATCH.set(b);
  for (let y = 0; y < H; y++) {
    const sy = y - dy;
    for (let x = 0; x < W; x++) {
      const sx = x - dx;
      b[y * W + x] = sx >= 0 && sy >= 0 && sx < W && sy < H ? SCRATCH[sy * W + sx] : 0;
    }
  }
}

// ---------------------------------------------------------------- letterforms
//
// A hand-pressed clay face: one stroke weight, rounded ends and soft
// shoulders, a little heavier than a printed figure and never quite
// mechanical. Box 11 wide, 20 tall (y down); arcs are clock angles.

function arcP(cx, cy, rx, ry, a0, a1) {
  const span = a1 - a0;
  const n = Math.max(3, Math.ceil(Math.abs(span) / 11));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (span * i) / n) * Math.PI) / 180;
    out.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return out;
}

const GLYPH = {
  0: [arcP(5.5, 10, 3.6, 7.4, 0, 360)],
  1: [[[3.3, 7.4], [6.5, 3.1], [6.5, 17.5]]],
  2: [[...arcP(5.5, 6.7, 3.5, 4.0, 250, 462), [2.0, 17.5], [9.4, 17.5]]],
  3: [[...arcP(5.4, 5.9, 3.4, 3.8, 272, 470), [8.3, 10.2], ...arcP(5.4, 12.7, 3.4, 4.7, 86, 278)]],
  4: [[[7.8, 2.8], [2.2, 12.9], [9.5, 12.9]], [[7.8, 2.8], [7.8, 17.5]]],
  5: [[[9.1, 2.9], [3.2, 2.9], [2.8, 9.8]], arcP(5.8, 13.3, 3.4, 4.2, 306, 586)],
  6: [arcP(5.6, 6.9, 3.6, 4.3, 56, -116).concat(arcP(5.6, 13.3, 3.6, 4.3, 244, 604))],
  7: [[[2.1, 2.9], [9.1, 2.9], [5.4, 17.5]]],
  8: [arcP(5.5, 6.1, 3.4, 3.7, 0, 360), arcP(5.5, 13.4, 3.5, 4.1, 0, 360)],
  9: [arcP(5.5, 6.2, 3.5, 4.1, 284, 644), [[8.8, 7.4], [8.0, 12.2], [6.5, 17.5]]],
};

const GW = 11, GH = 20;

/** A hand-formed digit at scale s: distances from the stroke's centre-line. */
const TILES = new Map();
function tile(d, s) {
  const key = d + '|' + s;
  let t = TILES.get(key);
  if (t) return t;
  const pad = 3;
  const w = Math.ceil((GW + 2 * pad) * s), h = Math.ceil((GH + 2 * pad) * s);
  // flatten the strokes, then measure from every pixel of the tile
  const segs = [];
  for (const st of GLYPH[d]) {
    for (let i = 1; i < st.length; i++) {
      const [ax, ay] = st[i - 1], [bx, by] = st[i];
      if (Math.hypot(bx - ax, by - ay) > 1e-6) segs.push([ax, ay, bx, by]);
    }
  }
  const dd = new Float32Array(w * h);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const gx = (i + 0.5) / s - pad, gy = (j + 0.5) / s - pad;
      let m = 1e9;
      for (const [ax, ay, bx, by] of segs) {
        const dx = bx - ax, dy = by - ay;
        const L2 = dx * dx + dy * dy;
        const u = clamp(((gx - ax) * dx + (gy - ay) * dy) / L2, 0, 1);
        const q = Math.hypot(gx - ax - dx * u, gy - ay - dy * u);
        if (q < m) m = q;
      }
      dd[j * w + i] = m;
    }
  t = { w, h, d: dd, pad, s };
  TILES.set(key, t);
  return t;
}

/** The tile's distance at a screen offset from the glyph's origin. */
function sampleD(t, dx, dy) {
  const fx = dx + t.pad * t.s - 0.5, fy = dy + t.pad * t.s - 0.5;
  const i0 = Math.floor(fx), j0 = Math.floor(fy);
  const w = t.w, h = t.h, d = t.d;
  if (i0 < -1 || j0 < -1 || i0 > w || j0 > h) return 99;
  const tx = fx - i0, ty = fy - j0, i1 = i0 + 1, j1 = j0 + 1;
  const r0 = j0 >= 0 && j0 < h, r1 = j1 >= 0 && j1 < h;
  const c0 = i0 >= 0 && i0 < w, c1 = i1 >= 0 && i1 < w;
  const a = (c0 && r0 ? d[j0 * w + i0] : 99) * (1 - tx) + (c1 && r0 ? d[j0 * w + i1] : 99) * tx;
  const b = (c0 && r1 ? d[j1 * w + i0] : 99) * (1 - tx) + (c1 && r1 ? d[j1 * w + i1] : 99) * tx;
  return a * (1 - ty) + b * ty;
}

// ---------------------------------------------------------------- the relief
//
// The four numerals are laid out as slot boxes on the wall; their distance
// fields are combined into one height field, which is then lit from the
// upper left: a pixel is clay where the ridge is high, and glints where the
// surface tilts toward the light.

const HSC = 0.78, MSC = 0.97;
const SLOTS = [
  { x: 36.5, y: 30.0, sc: HSC },     // hour tens
  { x: 36.5 + GW * HSC + 3.4, y: 30.0, sc: HSC },
  { x: 65.5, y: 28.0, sc: MSC },     // minute tens
  { x: 65.5 + GW * MSC + 5.0, y: 28.0, sc: MSC },
];
const BX = 30, BY = 22, BW = 68, BH = 32;
const RIDGE = 3.3;                   // how far a pressed stroke reaches
const HH = new Float32Array(BW * BH);

/**
 * Build the height field. `cur` and `ref` are the four digits now and the
 * four before the change, with per-slot weights: a weight of 0 means that
 * numeral is not in the clay at all.
 */
function relief(g, sw, cur, curW, ref, refW) {
  HH.fill(0);
  for (let k = 0; k < 4; k++) {
    const wa = curW[k], wb = refW[k];
    if (wa < 0.02 && wb < 0.02) continue;
    const S = SLOTS[k], sc = S.sc;
    const ta = wa >= 0.02 ? tile(cur[k], sc) : null;
    const tb = wb >= 0.02 ? tile(ref[k], sc) : null;
    const gw = GW * sc + 7, gh = GH * sc + 7;
    const x0 = Math.max(0, Math.floor(S.x - BX - 7)), x1 = Math.min(BW - 1, Math.ceil(S.x - BX + gw));
    const y0 = Math.max(0, Math.floor(S.y - BY - 7)), y1 = Math.min(BH - 1, Math.ceil(S.y - BY + gh));
    for (let j = y0; j <= y1; j++)
      for (let i = x0; i <= x1; i++) {
        const px = BX + i + sw, py = BY + j;
        const dx = px - S.x, dy = py - S.y;
        let v = HH[j * BW + i];
        if (ta) {
          const q = (1 - sampleD(ta, dx, dy) / RIDGE) * wa;
          if (q > v) v = q;
        }
        if (tb) {
          const q = (1 - sampleD(tb, dx, dy) / RIDGE) * wb;
          if (q > v) v = q;
        }
        HH[j * BW + i] = v;
      }
  }
  // light it from the upper left and lay the clay down
  for (let j = 1; j < BH - 1; j++)
    for (let i = 1; i < BW - 1; i++) {
      const k = j * BW + i, h = HH[k];
      if (h < 0.16) continue;
      const slope = (HH[k + 1] - HH[k - 1]) + (HH[k + BW] - HH[k - BW]);
      if (h > 0.52 || slope > 0.10) g.pixel(BX + i + sw, BY + j, ON);
    }
}

// ---------------------------------------------------------------- the pot

/** The wheel head: a disc in perspective, its throw-marks wheeling round. */
function wheelHead(g, rot) {
  const cy = FOOT + 2, rx = 48, ry = 6;
  // the far rim, dotted; the near rim, a heavy edge
  for (let k = 0; k <= 160; k++) {
    const a = (k / 160) * TAU;
    const x = Math.round(CX + rx * Math.sin(a));
    const yf = Math.round(cy - ry * Math.cos(a));
    if (yf < cy) { if (noise(k * 0.7, 1) > 0.35) g.pixel(x, yf, ON); continue; }
    g.pixel(x, yf, ON);
    g.pixel(x, Math.round(cy - (ry + 3.2) * Math.cos(a)), ON);
    if (ry * Math.cos(a) > 1) g.pixel(x, yf + 1, ON);
  }
  // the throw-marks, marching round the rim as the wheel turns
  for (let k = 0; k < 20; k++) {
    const a = rot + (k * TAU) / 20;
    const c = Math.cos(a);
    if (c < 0.05) continue;
    const x0 = Math.round(CX + rx * 0.82 * Math.sin(a)), y0 = Math.round(cy + ry * 0.82 * c);
    const x1 = Math.round(CX + rx * 1.02 * Math.sin(a)), y1 = Math.round(cy + (ry + 2.4) * c);
    g.line(x0, y0, x1, y1, ON);
  }
}

function pot(g, u, sway, rot) {
  const top = lerp(LUMP_TOP, RIM_TOP, u);
  const cxx = CX + sway;
  // the wall, seen against the dark: a lit edge, the light falling from the left
  let prevW = -1;
  for (let y = Math.round(top); y <= FOOT; y++) {
    const v = (FOOT - y) / (FOOT - top);
    const w = widthAt(v, u);
    if (w < 1) continue;
    if (prevW > 0 && Math.abs(w - prevW) > 2.6) continue;      // no ragged jumps
    prevW = w;
    const lx = Math.round(cxx - w), rx = Math.round(cxx + w);
    g.pixel(lx, y, ON);
    g.pixel(lx + 1, y, ON);
    g.pixel(rx, y, ON);
    // the light lying along the left of the belly, where the wall turns away
    if (w > 12) {
      for (let k = 2; k < 9; k++) {
        const lvl = 0.26 * Math.exp(-(k - 2) / 2.2) * clamp((w - 12) / 10, 0, 1);
        if (lvl > 0.02 && dither(lx + k, y, lvl)) g.pixel(lx + k, y, ON);
      }
    }
  }
  // the mouth: the near rim lit, the far rim dimmer, the inside black
  const rimW = widthAt(1, u);
  const ry = 6.2 * u + 0.6;
  // the rim: the near edge lit, the far edge dimmer, the mouth black
  for (let k = 0; k <= 200; k++) {
    const a = (k / 200) * TAU;
    const x = Math.round(cxx + rimW * Math.sin(a)), y = Math.round(top - ry * Math.cos(a));
    if (Math.cos(a) > 0) { if (noise(k * 0.9, 3) > 0.3) g.pixel(x, y, ON); }
    else g.pixel(x, y, ON);
  }
  // the far wall seen through the mouth, lit on the side the light comes from
  if (u > 0.6) for (let k = 0; k <= 140; k++) {
    const a = (k / 140) * TAU;
    const c = Math.cos(a);
    if (c <= 0.05) continue;
    const x = Math.round(cxx + (rimW - 7.5) * Math.sin(a));
    const y = Math.round(top + ry * 1.75 - (ry - 1.4) * c);
    if (Math.sin(a) < -0.15 || noise(k * 0.9, 7) > 0.5) g.pixel(x, y, ON);
  }
  // the foot ring, and the throwing rings round the shoulder
  g.fillWhere((px, py) => {
    const uu = ((px - cxx) / widthAt(0, u)) ** 2 + ((py - FOOT) / 2.4) ** 2;
    return uu <= 1 && uu > 0.45;
  }, ON, [cxx - 24, FOOT - 4, 48, 8]);
  if (u > 0.55) {
    for (const v of [0.055, 0.115, 0.70, 0.78, 0.86]) {
      const y = Math.round(FOOT - v * (FOOT - top));
      const w = widthAt(v, u) - 2;
      if (w < 6 || (y > BY - 1 && y < BY + BH)) continue;
      for (let x = -w + 1; x < w - 1; x += 4) {
        if (noise(x * 0.5, v * 9) > 0.3) g.pixel(Math.round(cxx + x), y, ON);
      }
    }
  }
  // a thread of water creeping down the left of the belly
  for (let k = 0; k < 9; k++) {
    const v = 0.30 + 0.55 * ((rot / TAU) % 1) + k * 0.02;
    const y = Math.round(FOOT - v * (FOOT - top));
    if (y < top + 4 || y > FOOT - 2) continue;
    const w = widthAt((FOOT - y) / (FOOT - top), u);
    g.pixel(Math.round(cxx - w + 3), y, ON);
    if (k > 6) g.pixel(Math.round(cxx - w + 3), y, OFF);
  }
}

/** The potter's thumb and wrist, drawn as a silhouette against the clay. */
function thumb(g, x, y, depth) {
  if (depth <= 0) return;
  const d = clamp(depth, 0, 1);
  const tipY = y + 11 - 11 * d;
  const x0 = Math.round(x), y0 = Math.round(tipY);
  const inside = (px, py) => {
    // a thumb: a fat, tapered pad on the end of a wrist, angled a little
    const ax = x0 - 4 - 2.5 * (1 - d), ay = y0 - 15;
    const bx = x0, by = y0;
    const dx = bx - ax, dy = by - ay;
    const L2 = dx * dx + dy * dy;
    const u = clamp(((px - ax) * dx + (py - ay) * dy) / L2, 0, 1);
    const r = lerp(6.2, 4.6, u * u);
    return Math.hypot(px - ax - dx * u, py - ay - dy * u) <= r;
  };
  g.fillWhere(inside, OFF, [x0 - 14, y0 - 26, 30, 32]);
  g.fillWhere((px, py) => inside(px, py) && !(inside(px - 1, py) && inside(px + 1, py) && inside(px, py - 1) && inside(px, py + 1)), ON,
    [x0 - 14, y0 - 26, 30, 32]);
  // the nail
  if (d > 0.6) g.pixel(Math.round(x0 + 1), Math.round(y0 - 5), ON);
}

// ---------------------------------------------------------------- schedule

const MIN_SINK = 0.5, MIN_PRESS = 0.95, STAGGER = 0.34;
const HOUR_SINK = 1.4, HOUR_THROW = 2.2;
const digits4 = (hh, mm) => [Math.floor(hh / 10), hh % 10, Math.floor(mm / 10), mm % 10];

export default {
  name: 'Thrown',
  blurb: 'The time pressed into wet clay on a spinning wheel: the digits are ridges read by the light, smoothed flat and pressed again every minute, and the pot is re-thrown on the hour.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, ctx) {
    const { date, fields: f, oled, night } = ctx;
    const T = date.getTime() / 1000;
    const s = f.sec;
    // the wheel, and the turn it takes to get up to throwing speed on the hour
    const fracHr = f.m * 60 + s;
    const hrId = Math.floor(date.getTime() / 3600000);
    const rot = TAU * (T / REV + 1.5 * hrId + 1.5 * (1 - Math.exp(-fracHr / 1.9)));

    // the hour: the pot settles into a lump and is thrown up again
    let u = 1;
    const hourTurn = f.m === 0 && s < HOUR_THROW;
    if (f.m === 59 && s > 60 - HOUR_SINK) u = 1 - ease.inOutCubic((s - (60 - HOUR_SINK)) / HOUR_SINK);
    else if (hourTurn) u = ease.outCubic(clamp(s / HOUR_THROW, 0, 1));
    const thrown = clamp((u - 0.72) / 0.22, 0, 1);      // the wall is tall enough to carry a mark

    // which slots show which digits, and how strongly
    const cur = digits4(f.h, f.m);
    const BLOW = f.m === 59 ? 1 : MIN_SINK;
    let curW = [1, 1, 1, 1], refW = [0, 0, 0, 0], ref = cur.slice();
    const press = [];
    if (!hourTurn && f.m !== 59 && s < MIN_PRESS) {
      const pv = previousMinute(date);
      const p = digits4(pv.h, pv.m);
      let rank = 0;
      for (let i = 0; i < 4; i++) {
        if (cur[i] === p[i]) continue;
        const q = clamp((s - rank * STAGGER) / MIN_PRESS, 0, 1);
        curW[i] = ease.outBack(clamp(q * 1.25, 0, 1));
        ref[i] = p[i]; refW[i] = 1 - clamp(q * 1.8, 0, 1);
        press.push([i, q]);
        rank++;
      }
    } else if (!hourTurn && f.m === 59) {
      const nf = clockFields(new Date(Math.round(T * 1000) + 60000));
      const nx = digits4(nf.h, nf.m);
      const p = clamp((s - (60 - BLOW)) / BLOW, 0, 1);
      let rank = 0;
      for (let i = 0; i < 4; i++) {
        if (cur[i] === nx[i]) continue;
        const q = clamp((p - rank * 0.12) / 0.8, 0, 1);
        curW[i] = 1 - ease.inOutQuad(q);
        press.push([i, q]);
        rank++;
      }
    }
    for (let i = 0; i < 4; i++) { curW[i] *= thrown; refW[i] *= thrown; }

    // ---- the studio
    const [ox, oy] = orbit(date, 2, 3);
    const sway = 1.5 * Math.sin(rot) * (0.35 + 0.65 * u);
    wheelHead(g, rot);
    // the floor the wheel stands on, just catching the light
    g.fillWhere((px, py, ix, iy) => py > FOOT + 6 && dither(ix, iy, 0.06), ON, [0, FOOT + 6, 128, 8]);
    // clay dust hanging in the light over the wheel
    for (let i = 0; i < 7; i++) {
      const cyc = ((T / (11 + i * 3) + noise(i, 51)) % 1 + 1) % 1;
      if (cyc < 0.12 || cyc > 0.92) continue;
      const x = 6 + noise(i, 52) * 62 + cyc * 14 + Math.sin(T * 0.3 + i) * 3;
      const y = 4 + ((noise(i, 53) * 30 + cyc * 16) % 34);
      if (noise(i, 54 + Math.floor(cyc * 9)) < 0.42) continue;
      g.pixel(Math.round(x), Math.round(y), ON);
    }

    pot(g, u, sway, rot);
    relief(g, Math.round(sway), cur, curW, ref, refW);

    // slip thrown off the rim as the pot comes up
    if (hrId >= 0 && fracHr < 1.6) {
      for (let i = 0; i < 12; i++) {
        const dt = fracHr - noise(i, 41) * 0.3;
        if (dt < 0 || dt > 1.1) continue;
        const d = 0.35 + 0.65 * noise(i, 44);
        const x = CX + (i % 2 ? 1 : -1) * (widthAt(1, 1) + 1 + 4.5 * d * dt);
        const y = RIM_TOP - 1.5 - 7 * dt + 6.5 * dt * dt;
        if (y > FOOT + 5) continue;
        if (noise(i, 45) < dt) continue;
        g.pixel(Math.round(x), Math.round(y), ON);
        if (dt < 0.35) g.pixel(Math.round(x), Math.round(y) + 1, ON);
      }
    }

    // the thumb: it presses whichever numeral is being changed
    if (press.length) {
      let bestI = -1, bestD = 0;
      for (const [i, q] of press) {
        const d = q < 0.55 ? q / 0.55 : 1 - (q - 0.55) / 0.45;
        if (d > bestD) { bestD = d; bestI = i; }
      }
      if (bestI >= 0) {
        const S = SLOTS[bestI];
        // the pad rides the wall, so it never floats over settled clay
        const py = Math.max(S.y + GH * S.sc * 0.62, lerp(LUMP_TOP, RIM_TOP, u) + 6);
        thumb(g, S.x + GW * S.sc * 0.5 + sway, py, bestD * 0.9);
      }
    }

    ride(g, ox, oy);
    oled.contrast(0xcf + (0x20 - 0xcf) * night);
  },
};
