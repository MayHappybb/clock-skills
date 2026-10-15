// Zen — a dry garden, composed around its stones.
//
// The gravel is not raked in straight lines across the glass: the whole garden
// is raked in rings around the two small stones that stand for the colon, so
// every furrow is an arc of a circle centred between them, and the garden
// reads as one object with a middle rather than as a backdrop. Off to one side
// stands a larger stone with its own few rings raked around it.
//
// The time is raked into that gravel in two beds of different weight. The
// hours are small, high, between the colon and the top of the garden, combed
// with a coarse rake. The minutes are nearly twice the size, low and to the
// right, where the furrows run out widest, combed fine. In both, the rake was
// drawn along the numeral's own stroke, so the ridges curve with it and the
// numeral is the one thing on the glass whose lines do not belong to the
// garden's circles.
//
// The minute is a re-raking: the changed numeral is combed smooth from the end
// of its stroke back to the start, and the next minute's numeral is raked in
// from the start. The hour moves the stones: the centre the whole garden is
// raked around slides to a new place over two seconds, and every furrow on the
// glass re-forms with it, while the new hour is raked in more slowly than a
// minute ever is. The rake that does all of this is on the glass, walking an
// arc of the garden and turning at its edge.
//
// frame() is a pure function of the clock.

import { ease, clamp, lerp, dither, previousMinute, clockFields } from '../js/kit.js';

const TAU = Math.PI * 2;
const PW = 128, PH = 64;

// ---------------------------------------------------------------- the gravel
const RAKE_D = 15.0;         // distance between furrows
const LINE_W = 0.058;        // half-width of a ridge, in furrows
const EDGE = 88;             // where the raked bed gives out

// The centre the garden is raked around, one place per hour: the stones are
// moved and the whole bed re-formed when the hour turns.
const centreFor = (h) => [41 + 7.5 * Math.sin(h * 0.72 + 0.4), 32 + 6.0 * Math.cos(h * 1.07)];
/** The wander of the hand, as a table: a sine of the position along the arc. */
const WARP0 = -150, WSTEP = 0.4, WN = Math.ceil(300 / WSTEP) + 2;
const WARP = new Float32Array(WN);
for (let i = 0; i < WN; i++) WARP[i] = 1.5 * Math.sin((WARP0 + i * WSTEP) * 0.043 + 1.7);
const warp = (u) => {
  const i = ((u - WARP0) / WSTEP) | 0;
  return WARP[i < 0 ? 0 : i >= WN ? WN - 1 : i];
};

// ---------------------------------------------------------------- the hand
// One continuous rake-stroke per numeral. Each glyph is a list of pieces; the
// joins between pieces are corners, where the tines turn without lifting.
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

/** Centripetal Catmull-Rom through `pts`, sampled finely. */
function spline(pts) {
  if (pts.length < 3) return pts.map((p) => [...p]);
  const Q = [[2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]], ...pts,
    [2 * pts.at(-1)[0] - pts.at(-2)[0], 2 * pts.at(-1)[1] - pts.at(-2)[1]]];
  const out = [];
  const tj = (a, b) => Math.max(1e-4, Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5);
  for (let i = 1; i < Q.length - 2; i++) {
    const [p0, p1, p2, p3] = [Q[i - 1], Q[i], Q[i + 1], Q[i + 2]];
    const t1 = tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
    const n = 10;
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

// ---------------------------------------------------------------- the beds
// The hours sit small and high, the minutes nearly twice the size and low to
// the right: two beds of gravel, two weights of rake, two ends of the time.
const SLOT = [
  { x: 66, y: 2, sc: 0.92, hour: 1, pitch: 5.2 },
  { x: 84, y: 2, sc: 0.92, hour: 1, pitch: 5.2 },
  { x: 67, y: 27, sc: 1.18, hour: 0, pitch: 4.2 },
  { x: 93, y: 27, sc: 1.18, hour: 0, pitch: 4.2 },
];

/**
 * Per numeral at scale `sc`: how far the gravel is from the stroke (bright =
 * near) and the signed distance across it, in half-pixels, so the tines can be
 * laid along the stroke.
 */
const MASKS = new Map();
function maskOf(d, sc) {
  const key = d + '|' + sc.toFixed(2);
  let m = MASKS.get(key);
  if (m) return m;
  const w = Math.ceil(17 * sc) + 2, h = Math.ceil(30 * sc) + 2;
  const R = 2.36 * sc, MR = R + 3.2;
  const dist = new Uint8Array(w * h);
  const perp = new Int8Array(w * h);
  const along = new Uint8Array(w * h);
  for (const piece of GLYPH[d]) {
    const pts = spline(piece);
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1][0] * sc, ay = pts[i - 1][1] * sc;
      const bx = pts[i][0] * sc, by = pts[i][1] * sc;
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
      const len = Math.sqrt(len2) || 1e-6;
      const nx = -dy / len, ny = dx / len;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - MR)), x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + MR));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - MR)), y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + MR));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5, py = y + 0.5;
          const k = len2 ? clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1) : 0;
          const cx = ax + k * dx, cy = ay + k * dy;
          const dd = Math.hypot(px - cx, py - cy);
          if (dd > MR) continue;
          const i2 = y * w + x;
          const v = Math.max(0, Math.min(255, Math.round((MR - dd) * 16)));
          if (v <= dist[i2]) continue;
          dist[i2] = v;
          perp[i2] = Math.max(-127, Math.min(127, Math.round(((px - cx) * nx + (py - cy) * ny) * 2)));
          along[i2] = Math.round(clamp((i - 1 + k) / (pts.length - 1), 0, 1) * 255);
        }
      }
    }
  }
  m = { w, h, dist, perp, along, R, MR };
  MASKS.set(key, m);
  return m;
}

// ---------------------------------------------------------------- the clock
const MIN = 60;

/** A slow, whole-pixel drift, so the gravel itself is never lit in one place. */
function drift(date) {
  const t = date.getTime() / 1000;
  return [Math.round(2.2 * Math.sin(t * 0.00077) + 1.0 * Math.sin(t * 0.00205)),
    Math.round(2.0 * Math.sin(t * 0.00064 + 1.7) + 0.9 * Math.sin(t * 0.00181))];
}

/** How far the changed numeral has been re-raked: 0 smoothed, 1 fully raked. */
function rakeFront(now, prev, next, s, isHour, hourTurn) {
  const changed = now !== prev;
  const leaves = now !== next;
  const inDur = isHour && hourTurn ? 1.8 : 1.05;
  const outDur = isHour && hourTurn ? 1.4 : 0.7;
  if (changed && s < inDur) return ease.outCubic(s / inDur);
  if (leaves && s >= MIN - outDur) return ease.inCubic(1 - (s - (MIN - outDur)) / outDur);
  return 1;
}

export default {
  name: 'Zen',
  blurb: 'Rings raked around the stones that are the colon; the hours small and combed coarse above them, the minutes larger and combed fine below.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { date, fields: f, oled, night }) {
    const t = date.getTime() / 1000;
    const s = f.sec;
    const [dx, dy] = drift(date);

    // ---- what the numerals are, and what they were and will be
    const now = [Number(f.hh[0]), Number(f.hh[1]), Number(f.mm[0]), Number(f.mm[1])];
    const pv = previousMinute(date);
    const prev = [Number(pv.hh[0]), Number(pv.hh[1]), Number(pv.mm[0]), Number(pv.mm[1])];
    const nxt = clockFields(new Date(date.getTime() + 60000));
    const next = [Number(nxt.hh[0]), Number(nxt.hh[1]), Number(nxt.mm[0]), Number(nxt.mm[1])];
    const hourTurn = f.m === 0 && s < 3.4;

    // ---- the stones, and the centre the garden is raked around. On the hour
    // the centre slides to a new place and the whole bed re-forms with it.
    const [cxn, cyn] = centreFor(f.h);
    const [cxo, cyo] = centreFor((f.h + 23) % 24);
    const kk = hourTurn ? ease.inOutCubic(clamp(s / 2.6, 0, 1)) : 1;
    const cx = (cxo + (cxn - cxo) * kk) + dx;
    const cy = (cyo + (cyn - cyo) * kk) + dy;
    const colonR = hourTurn ? lerp(0.75, 1, kk) : 1;
    // two small stones for the colon, and a larger one off to the side
    const stones = [
      { x: cx, y: cy - 7.6, r: 3.4 * colonR, rings: 1 },
      { x: cx, y: cy + 7.6, r: 3.4 * colonR, rings: 1 },
      { x: cx - 26 + 2.2 * Math.sin(t * 0.00071), y: cy - 2 + 1.8 * Math.sin(t * 0.00092), r: 5.0, rings: 2 },
    ];

    // ---- the rake head, walking an arc of the garden
    const lift = s >= 55 ? ease.inOutCubic((s - 55) / (MIN - 55)) : 0;

    // ------------------------------------------------------------ drawing
    const buf = g.buf, stride = g.width;

    // ---- the gravel, furrow by furrow, raked in rings around the stones
    for (let iy = 0; iy < PH; iy++) {
      const ay = iy + 0.5 - cy;
      const row = iy * stride;
      for (let ix = 0; ix < PW; ix++) {
        const ax = ix + 0.5 - cx;
        const r = Math.sqrt(ax * ax + ay * ay);
        if (r > EDGE) continue;
        const inv = 1 / (r > 0.5 ? r : 0.5);
        const re = r + warp(ax * inv * 52 + ay * inv * 27);
        const fr = re / RAKE_D;
        const m = fr - Math.floor(fr);
        if (!(m < LINE_W || m > 1 - LINE_W)) continue;
        if (r > EDGE - 8 && !dither(ix, iy, (EDGE - r) / 8)) continue;
        buf[row + ix] = 1;
      }
    }

    // ---- the numerals, raked into the gravel over the top of it
    for (let n = 0; n < 4; n++) {
      const sl = SLOT[n];
      const front = rakeFront(now[n], prev[n], next[n], s, sl.hour === 1, hourTurn);
      const mk = maskOf(now[n], sl.sc);
      const sx0 = sl.x + dx, sy0 = sl.y + dy;
      const md = mk.dist, mp = mk.perp, ma = mk.along, mw = mk.w, mh = mk.h, R = mk.R;
      const fFront = front * 255;
      const tine = sl.pitch * 2;
      for (let i = 0; i < mw; i++) {
        const ix = sx0 + i;
        if (ix < 0 || ix >= PW) continue;
        for (let j = 0; j < mh; j++) {
          const iy = sy0 + j;
          if (iy < 0 || iy >= PH) continue;
          const k = j * mw + i;
          const dd = mk.MR - md[k] / 16;
          if (dd > R) {
            if (dd < R + 4.8) buf[iy * stride + ix] = 0;      // a smooth margin round the stroke
            continue;
          }
          buf[iy * stride + ix] = 0;
          if (ma[k] > fFront) continue;                        // not raked in yet
          const lm = mp[k] / tine;
          const line = lm - Math.floor(lm);
          const groove = (line < 0.14 || line > 0.86) && mp[k] > -1.6 && mp[k] < 1.6;
          buf[iy * stride + ix] = (dd > R - 0.8 || !groove) ? 1 : 0;
        }
      }
    }

    // ---- the stones, and the rings raked around each of them
    for (const st of stones) {
      const zone = 2.0 + st.rings * 3.2;
      const rr = st.r + zone;
      const x0 = Math.max(0, Math.floor(st.x - rr)), x1 = Math.min(PW, Math.ceil(st.x + rr));
      const y0 = Math.max(0, Math.floor(st.y - rr)), y1 = Math.min(PH, Math.ceil(st.y + rr));
      for (let iy = y0; iy < y1; iy++) {
        const pyc = iy + 0.5;
        for (let ix = x0; ix < x1; ix++) {
          const pxc = ix + 0.5;
          const ex = pxc - st.x, ey = pyc - st.y;
          const d = Math.sqrt(ex * ex + ey * ey);
          if (d > rr) continue;
          if (d < st.r) { buf[iy * stride + ix] = 0; continue; }
          if (d < st.r + 1.5) {                                // lit rim on the sun side
            buf[iy * stride + ix] = (ex * 0.7 + ey * 0.7 < 0) ? 1 : 0;
            continue;
          }
          const q = (d - st.r - 2.0) % 3.2;
          buf[iy * stride + ix] = q < 0.55 ? 1 : 0;
        }
      }
    }

    // ---- the rake itself, tines down, following the arc it is opening up
    {
      const ang = t * 0.052;
      const rr = 40 + 8 * Math.sin(t * 0.023);
      const rx = cx + rr * Math.cos(ang), ry = cy + rr * Math.sin(ang);
      const fxc = -Math.sin(ang), fyc = Math.cos(ang);         // along the furrow
      const bxc = (rx - cx) / rr, byc = (ry - cy) / rr;        // across it
      const seg = [];
      seg.push([rx - bxc * 8, ry - byc * 8, rx, ry, 1.5, 3.8]);            // the shaft
      for (let k = -2; k <= 2; k++) {
        const tx = rx + fxc * k * 2.8, ty = ry + fyc * k * 2.8;
        seg.push([tx, ty, tx + bxc * 3.4, ty + byc * 3.4, 1.2, 3.4]);      // the teeth
      }
      seg.push([rx - fxc * 6.6, ry - fyc * 6.6, rx + fxc * 6.6, ry + fyc * 6.6, 2.0, 4.4]);
      for (const q of seg) g.thickLine(q[0], q[1], q[2], q[3], q[5], 0);
      for (const q of seg) g.thickLine(q[0], q[1], q[2], q[3], q[4], 1);
    }

    oled.contrast(0xd6 + (0x26 - 0xd6) * night);
  },
};
