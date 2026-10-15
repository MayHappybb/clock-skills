// Echo: a 1960s op-art print on a white-on-blue STN module, after Bridget
// Riley and Vasarely. The whole glass is one family of 1-px lines, and the
// time makes it: every line is an outline of the four numerals repeated
// outward every 5 px, so the hours and minutes radiate their own shapes
// across the strip, and where two numerals' echoes meet the lines fold into
// cusps. The numerals themselves are the negative of still water: inside
// them the lines turn to dense white with still horizontal hairlines, behind
// a two-pixel moat; their counters are calm ground. Ten geometric digits
// (circle and ellipse arcs with flat radial cuts, straight bars, an open 4)
// drawn for this grid, hours 32 x 70, minutes 24 x 46 set lower right.
//
// Always alive: the echoes flow outward (2.6 px/s) with a pulse every
// second, and a faint travelling current ripples them.
//
// Minute turn: from :58.2 a leaving numeral's echo yields (its lines run in
// and are absorbed) while the neighbours' echoes flood across its place; its
// white thins evenly back into the field, gone by :59.9. After :00 the new
// numeral appears outline first, fills inward in still stripes, and pushes
// its own echo outward over the glass (to :01.9).
//
// Hour: as the old hour leaves, the echoes give way to a Vasarely target
// centred between hours and minutes (a bullseye where the colon would be);
// the new numerals arrive on it. Then a second target slides out from the
// first and orbits it: the two transparencies make real moiré fringes that
// sweep round the glass. Then Riley's Blaze: the rings fold into a turning
// zigzag. Then the current surges and the numerals' echoes take the glass
// back (to :14). The numerals stay drawn throughout.
//
// Colour: exactly two RGB565 values all day, near-white #f0f4ff ink on deep
// blue #1030c8 ground, the white-on-blue of a 12864 STN module; op art is
// strictly two-tone anyway. Every pixel is ink or ground by its phase alone;
// grey exists only as line density. Night dims the backlight to 40 %.
//
// Cost: the echo is the minimum of four precomputed digit distance tables
// (and the target) on an 81 x 41 half-resolution grid, interpolated per
// pixel; a line is drawn where the phase crosses a period between a pixel
// and its upper or left neighbour. A few integer ops a pixel, no per-pixel
// callbacks, no Math in the loops. Nothing heavy is built per minute: the
// minute map is stamped from per-digit code tables (~21 k byte writes).
import { sin, cos, clockFields, clamp, ease, progress } from '../js/kit.js';
import { W, H, N, U, GW, GH, SLOTS, DIST, CODE, TABLE, CT, RW, RT, AT } from './moire-echo.js';

const INK = 0xf0f4ff, GROUND = 0x1030c8;
const c565 = (c) => ((c >> 19) << 11) | (((c >> 10) & 63) << 5) | ((c >> 3) & 31);
const CI = c565(INK), CG = c565(GROUND);
const LW = 52;                                   // a still line: the phase band [0, LW) of a 256 period
const DAY = 86400, om = (r) => (2 * Math.PI * Math.round((r * DAY) / (2 * Math.PI))) / DAY;   // close over a day

// ---- the numerals' map for a minute: slot (high nibble, 1-based) and depth (low nibble; 0 = moat or counter)
const CACHE = new Map();
let BUILD_OPS = 0;
function mapFor(key) {
  let e = CACHE.get(key);
  if (e) return e;
  const f = clockFields(new Date(key * 60000)), digs = f.hh + f.mm, m = new Uint8Array(N);
  for (let k = 0; k < 4; k++) {
    const S = SLOTS[k], cd = CODE[S.size][digs.charCodeAt(k) - 48], x0 = S.x - 2, y0 = S.y - 2;
    for (let v = 0; v < cd.ph; v++) for (let u = 0; u < cd.pw; u++) {
      const c = cd.c[v * cd.pw + u];
      if (c) m[(y0 + v) * W + x0 + u] = ((k + 1) << 4) | (c & 15);
    }
  }
  BUILD_OPS = N + 4000 * 2;
  e = { m, digs };
  CACHE.set(key, e);
  if (CACHE.size > 3) CACHE.delete(CACHE.keys().next().value);
  return e;
}

// ---- frame tables
const S1 = new Int32Array(W), C1 = new Int32Array(W), S2 = new Int32Array(W), C2 = new Int32Array(W);
const A1 = new Int32Array(H), B1 = new Int32Array(H), A2 = new Int32Array(H), B2 = new Int32Array(H);
const LO = new Int32Array(256), WD = new Int32Array(256);
const L = new Int32Array(GW * GH), ROWL = new Int32Array(GW), PU = new Int32Array(W), PV = new Int32Array(W);
const OFF = new Int32Array(5);
const TRI = new Int16Array(256);
for (let i = 0; i < 256; i++) TRI[i] = (i < 128 ? i - 64 : 192 - i) * 2;
const W1 = om(1.6), W2 = om(0.9), W3 = om(0.23);
const FLOW = (om((2.6 * 2 * Math.PI) / 5) * 5) / (2 * Math.PI);   // px/s the echoes travel outward
const BLAZE_K = 12;

const ch = (a, b, k) => a[k] !== b[k];
const sine = (u) => 0.5 - 0.5 * Math.cos(Math.PI * u);
const bell = (s, a, b, c) => (s < b ? ease.inOutQuad(progress(s, a, b)) : 1 - ease.inOutQuad(progress(s, b, c)));

export default {
  name: 'Echo',
  blurb: 'Op art in white on blue: every line on the glass is an echo of the time\'s outlines; the hour brings a target, real moiré fringes and Riley\'s Blaze.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, tt = f.h * 3600 + f.m * 60 + s;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    BUILD_OPS = 0;
    const cur = mapFor(f.minuteKey), map = cur.m, digs = cur.digs;
    const prev = clockFields(new Date(ctx.date.getTime() - 60000)), next = clockFields(new Date(ctx.date.getTime() + 60000));
    const pd = prev.hh + prev.mm, nd = next.hh + next.mm;

    // ---- the hour: the target takes over as the old hour leaves; then Moiré, Blaze, and the echoes return
    const toHour = next.h !== f.h && s >= 57.5, show = prev.h !== f.h && s < 14.5;
    const tgt = toHour ? sine(progress(s, 57.5, 59.9)) : show ? 1 - sine(progress(s, 11.4, 14.0)) : 0;
    const dX = show ? 14 * ease.inOutQuad(progress(s, 3.6, 5.2)) * (1 - ease.inOutQuad(progress(s, 7.6, 8.8))) : 0;
    const zB = show ? ease.inOutQuad(progress(s, 8.4, 9.8)) * (1 - ease.inOutQuad(progress(s, 10.8, 12.2))) : 0;
    const gam = show ? 1 + 1.8 * bell(s, 11.2, 12.8, 14.5) : 1;               // the current surges as the echoes return
    const zB8 = (zB * 256) | 0, rot = (s * 40) & 255, phi = s * 1.5;
    const r2x = Math.round(80 + dX * cos(phi)), r2y = Math.round(40 + dX * sin(phi));

    // ---- the numerals: band per slot and depth; echo offset per slot (half pixels)
    for (let k = 0; k < 4; k++) {
      let v = 1, R = 0;
      if (s >= 58.0 && ch(digs, nd, k)) {
        v = 1 - ease.inOutQuad(progress(s, 58.7, 59.9));                     // every band thins evenly
        R = 160 * sine(progress(s, 58.0, 59.9));                              // its echo yields to the neighbours'
      } else if (s < 2.1 && ch(pd, digs, k)) {
        R = 160 * (1 - sine(progress(s, 0.05, 2.1)));                        // the new echo pushes out
      }
      const grow = s < 1.9 && ch(pd, digs, k) ? ease.outQuad(progress(s, 0.0, 1.4)) : -1;
      for (let d = 0; d < 16; d++) {
        const vd = grow >= 0 ? clamp((grow * 9.5 - d) / 1.2, 0, 1) : v;           // arriving: from the outline inward
        const m = ((k + 1) << 4) | d;
        LO[m] = (LW + (1 - vd) * 102) | 0; WD[m] = d === 0 ? (vd > 0.6 ? -1 : 0) : (204 * vd) | 0;
      }
      OFF[k] = (Math.max(R, 180 * tgt)) | 0;
    }
    OFF[4] = (44 * (1 - tgt)) | 0;              // at rest the target loses everywhere, just

    // the echoes travel outward, with a pulse: each second they surge a little, then glide
    const fs = s - Math.floor(s), beat = Math.floor(tt) * 1.6 + 1.6 * ease.outCubic(progress(fs, 0, 0.45));
    // (in the hour show they run 14 periods farther, so the phase meets itself again after it)
    const fH = ((((FLOW * tt + beat) % 3840) + (show ? 70 * sine(progress(s, 0, 14)) : 0)) * U) | 0, fM = fH, fT = fH;

    // ---- the echo on the half-resolution grid: nearest numeral (or the target), in phase units
    {
      const T0 = TABLE[0], T1 = TABLE[1];
      const t = [0, 1, 2, 3].map((k) => DIST[SLOTS[k].size][digs.charCodeAt(k) - 48]);
      const base = [0, 1, 2, 3].map((k) => {
        const S = SLOTS[k], T = S.size ? T1 : T0;
        return (-S.y / 2 - T.gy0) * T.TW + (-S.x / 2 - T.gx0);
      });
      const tw0 = T0.TW, tw1 = T1.TW;
      const ta = t[0], tb = t[1], tc = t[2], td = t[3], oa = OFF[0], ob = OFF[1], oc = OFF[2], od = OFF[3], oe = OFF[4];
      for (let gy = 0, j = 0; gy < GH; gy++) {
        const ia = base[0] + gy * tw0, ib = base[1] + gy * tw0, ic = base[2] + gy * tw1, id = base[3] + gy * tw1;
        for (let gx = 0; gx < GW; gx++, j++) {
          let v = ta[ia + gx] + oa, ph = fH;
          const vb = tb[ib + gx] + ob; if (vb < v) v = vb;
          const vc = tc[ic + gx] + oc; if (vc < v) { v = vc; ph = fM; }
          const vd = td[id + gx] + od; if (vd < v) { v = vd; ph = fM; }
          const ve = CT[j] + oe; if (ve < v) { v = ve; ph = fT; }
          L[j] = ((v * 1638) >> 6) - ph;                                     // half px x 25.6 = phase, less its flow
        }
      }
    }

    // ---- Riley's current: small travelling waves on top of the echo
    for (let x = 0; x < W; x++) {
      const t1 = x * 0.085 - W1 * tt, t2 = x * 0.21 + W2 * tt;
      S1[x] = (sin(t1) * 256) | 0; C1[x] = (cos(t1) * 256) | 0;
      S2[x] = (sin(t2) * 256) | 0; C2[x] = (cos(t2) * 256) | 0;
    }
    for (let y = 0; y < H; y++) {
      const a1 = (0.8 + 0.5 * sin(y * 0.07 + W3 * tt)) * U * gam, p1 = y * 0.07, a2 = 0.35 * U * gam, p2 = -y * 0.05;
      A1[y] = (a1 * cos(p1)) | 0; B1[y] = (a1 * sin(p1)) | 0;
      A2[y] = (a2 * cos(p2)) | 0; B2[y] = (a2 * sin(p2)) | 0;
    }

    const buf = g.buf, two = dX > 0.5;
    let n = 0;
    for (let y = 0, i = 0; y < H; y++) {
      const gy = y >> 1;
      if (y & 1) for (let gx = 0, j = gy * GW; gx < GW; gx++, j++) ROWL[gx] = (L[j] + L[j + GW]) >> 1;
      else for (let gx = 0, j = gy * GW; gx < GW; gx++, j++) ROWL[gx] = L[j];
      const a1 = A1[y], b1 = B1[y], a2 = A2[y], b2 = B2[y], ul = (y * U) | 0;
      const dy = y < 40 ? 40 - y : y - 40, dy2 = y < r2y ? r2y - y : y - r2y, yN = y < 40;
      let lu = 0, lv = 0;
      for (let x = 0; x < W; x++, i++) {
        const hx = x >> 1;
        const e = x & 1 ? (ROWL[hx] + ROWL[hx + 1]) >> 1 : ROWL[hx];
        let u = e + ((S1[x] * a1 + C1[x] * b1 + S2[x] * a2 + C2[x] * b2) >> 8);
        if (zB8) {
          // Riley's Blaze: a zigzag round the target
          const dx = x < 80 ? 80 - x : x - 80;
          let a = AT[dy * RW + dx];
          if (x < 80) a = 128 - a;
          if (yN) a = 256 - a;
          u += (TRI[(a * BLAZE_K + rot) & 255] * zB8) >> 8;
        }
        // the second transparency, in the hour: a second target orbiting the first
        let u2 = 0;
        if (two) { const dx2 = x < r2x ? r2x - x : x - r2x; u2 = ((RT[dy2 * RW + dx2] * 205) >> 6) - fT + 4096; }
        const pu = y ? PU[x] : u, pv = y ? PV[x] : u2;
        PU[x] = u; PV[x] = u2;
        if (x === 0) { lu = u; lv = u2; }
        const cu = u >> 8;
        let ink = cu !== pu >> 8 || cu !== lu >> 8;                            // a line of the echo crosses here
        if (two) { const cv = u2 >> 8; if (cv !== pv >> 8 || cv !== lv >> 8) ink = true; }
        lu = u; lv = u2;
        const m = map[i];
        if (m) {
          const w = WD[m];
          if (w < 0) ink = false;                                                // moat and counters: calm ground
          else if (w > 0) {
            const band = ((((ul + 128) & 255) - LO[m]) & 255) < w;                // the numeral: still lines, negative
            ink = w >= 204 ? band : ink || band;                                 // (the field shows through only while it comes and goes)
          }
          n++;
        }
        buf[i] = ink ? CI : CG;
      }
    }
    g.cost.px += N;
    g.cost.box += GW * GH * 14 + N * (zB8 ? 26 : two ? 20 : 15) + n * 4 + BUILD_OPS;
  },
};
