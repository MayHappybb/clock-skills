// Datamosh: the clock as a broken video stream.
//
// The picture is decoded, not drawn. Once a minute the "encoder" sends a
// keyframe (datamosh-codec.js): the time in numerals built of whole
// macroblocks (datamosh-font.js) over a colour field for the hour, really
// DCT-compressed, so the blocking, ringing and blocky chroma fringes are
// the codec's. After that only P-frames arrive, and they are wrong: their
// motion vectors belong to some other video. So the picture flows.
//
// THE NUMERALS ARE THE ONLY BLOCKS THAT DECODE RIGHT. Their macroblocks
// have zero motion, so they hold; everything else is dragged along the
// stray vectors, and wherever a numeral sits upstream the stream drags ITS
// pixels out: every numeral bleeds a wake of its own ink downstream, the
// residual error piling up block by block along it (darker, hue-shifted),
// while the colour field slides past and decays. Counters are held too, so
// a 0 never floods. The time survives the corruption; the corruption is
// the face.
//
// RHYTHM: periodic intra refresh, as real low-latency encoders do it. A
// one-macroblock column of clean blocks sweeps left to right every 6 s
// (ten sweeps a minute, on the minute). Behind it the picture is clean;
// from there it rots until the sweep comes round again: wakes grow, the
// field slides and darkens. Each sweep brings a new set of motion vectors
// (one of eight directions, a speed per macroblock band, its own residual
// tint), so the sweep line is also where the wind changes. Now and then a
// slice slips sideways for a few frames.
//
// MINUTE: the changing numerals lose their sync. From :56.6 their blocks
// stop holding one by one and melt downstream with the flow; from :58.4 the
// cell fills with decoder garbage (green and magenta blocks, bare DCT basis
// patterns, macroblocks copied from elsewhere, chroma swapped), all of it
// garbage by :59.6, and the garbage bleeds too. After :00 the new numeral is
// born from that corruption: its blocks first glow out of the garbage as an
// overexposed ghost, then decode slice by slice, top to bottom, first as
// a flat DC mosaic and a moment later in full. Done by about :01.7.
// HOUR: the same, under a pixel sort. From :57 the columns sort by
// brightness in spans that widen left to right until the whole frame is a
// curtain of sorted strands (:59.5); the new hour's frame (a new field,
// a new palette by time of day) unsorts out of it, :00.3 to :02.8.
// NIGHT (23-07): the night palette, backlight at 35 %.
//
// Hard pixels throughout: every value comes from the decoder (YCbCr to
// RGB565), so nothing is anti-aliased and the codec's own artefacts are the
// texture. Colour: per time of day a deep five-stop field (datamosh-codec.js)
// with pale ink, so the wakes read as ink leaving the numerals.
//
// Cost: per pixel one lookup in a byte distance map (how far upstream the
// nearest held block is), a wrap, a YCbCr fetch, an integer residual and a
// YCbCr->RGB565: integer work, billed as box work below (esp32c3 ~5 ms a
// frame). Two distance maps a frame (this sweep's vectors and the last
// one's). The keyframe build (~2.5 M cycles: the field, 1,200 4x4 DCTs) is
// billed as an even share of every frame, since the device builds the next
// minute's a block row per frame. The hour sort is billed at n log n per
// span (worst frame ~9 ms). RAM: keyframe Y/U/V + RGB565 (100 KB, two of
// them across a turn), two 12.8 KB distance maps.

import { clockFields, hash, rand } from '../js/kit.js';
import { STATE } from '../js/cost.js';
import { W, H, N, keyframe, yuv565, basis } from './datamosh-codec.js';
import { MB, BW, BH, GW, GH, SLOT_X, SLOT_Y } from './datamosh-font.js';

const P = 6;                                   // intra-refresh period, s
const COLT = P / BW;                           // the sweep's time per macroblock column
/** Content motion, downstream, per direction index. */
const DIRS = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];
const TINTS = [[-5, -6], [5, 6], [6, -5], [-6, 5], [-2, 7], [7, -1]];   // residual chroma per step: green, magenta, blue, orange, red, violet

const NB = BW * BH;
const BS = new Uint8Array(NB);                 // block state: 0 flowing, 1 held, 2 garbage, 3 DC only (held)
const MELT = new Float32Array(NB);             // when a flowing block began to flow (-1: always)
const GHOST = new Float32Array(NB);            // garbage brightening into the new numeral, 0..1
const DIST = DIRS.map(() => new Uint8Array(N));
const SORTK = new Float64Array(H);
const mods = new Map();

/** The vectors one refresh generation carries. */
function mode(g) {
  let m = mods.get(g);
  if (m) return m;
  if (mods.size > 8) mods.delete(mods.keys().next().value);
  const dir = (((g % 8) * 5) % 8 + 8 + (hash(g, 1) % 3)) % 8;
  const sp = new Float32Array(BW);
  for (let b = 0; b < BW; b++) {
    const r = rand(g, b, 2);
    sp[b] = r < 0.15 ? 13 + 5 * rand(g, b, 3) : 2.5 + 7 * rand(g, b, 4);
  }
  const t = TINTS[hash(g, 5) % TINTS.length];
  m = { dir, dx: DIRS[dir][0], dy: DIRS[dir][1], sp, tu: t[0], tv: t[1] };
  mods.set(g, m);
  return m;
}

/** Byte distance (px, upstream along d) to the nearest held block; 255 if none. */
function distMap(d) {
  const D = DIST[d], dx = DIRS[d][0], dy = DIRS[d][1];
  const y0 = dy >= 0 ? 0 : H - 1, y1 = dy >= 0 ? H : -1, sy = dy >= 0 ? 1 : -1;
  const x0 = dx >= 0 ? 0 : W - 1, x1 = dx >= 0 ? W : -1, sx = dx >= 0 ? 1 : -1;
  for (let y = y0; y !== y1; y += sy) {
    const uy = y - dy, row = y * W, brow = (y >> 2) * BW;
    for (let x = x0; x !== x1; x += sx) {
      const s = BS[brow + (x >> 2)];
      if (s === 1 || s === 3) { D[row + x] = 0; continue; }
      const ux = x - dx;
      if (ux < 0 || uy < 0 || ux >= W || uy >= H) { D[row + x] = 255; continue; }
      const v = D[uy * W + ux] + 1;
      D[row + x] = v > 255 ? 255 : v;
    }
  }
}

// garbage, written to gY gU gV
let gY = 0, gU = 0, gV = 0;
function garbage(K, b, x, y, seed, flick) {
  const h = hash(b, seed, 21);
  switch (h % 6) {
    case 0: gY = 64 + (((x ^ y) & 1) << 3); gU = -62; gV = -84; break;                 // the decoder's green
    case 1: gY = 118; gU = 62; gV = 92; break;                                          // magenta
    case 2: {                                                                           // a bare basis pattern
      const u = 1 + ((h >> 4) % 3), v = (h >> 7) & 3, c = (((b / BW) | 0) * MB + 2) * W + (b % BW) * MB + 2;
      gY = (120 + 120 * basis(u, v, x & 3, y & 3)) | 0; gU = K.U[c] * 2; gV = K.V[c] * 2; break;
    }
    case 3: {                                                                           // a block from elsewhere, chroma swapped
      const b2 = hash(b, flick, 23) % NB, p = (((b2 / BW) | 0) * MB + (y & 3)) * W + (b2 % BW) * MB + (x & 3);
      gY = K.Y[p]; gU = K.V[p]; gV = K.U[p]; break;
    }
    case 4: {                                                                           // its top row, smeared down
      const p = ((b / BW) | 0) * MB * W + x;
      gY = K.Y[p] + 40; gU = K.U[p] - 20; gV = K.V[p] + 30; break;
    }
    default: {                                                                          // DC at the wrong level, chroma inverted
      const p = (((b / BW) | 0) * MB + 1) * W + (b % BW) * MB + 1;
      gY = 255 - K.Y[p]; gU = -K.U[p]; gV = -K.V[p];
    }
  }
}

const digitsOf = (f) => [f.hh[0], f.hh[1], f.mm[0], f.mm[1]].map(Number);
const hourSeed = (f) => hash(f.year * 400 + f.mon * 32 + f.day, f.h, 7) & 0xffff;

export default {
  name: 'Datamosh',
  blurb: 'A broken video stream: only the numerals decode right, so the rest of the picture drags their ink away; new minutes are born out of decoder garbage.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, date = ctx.date, sec = f.sec;
    const abs = date.getTime() / 1000;
    ctx.lcd.backlight(1 - 0.65 * ctx.night);

    const dg = digitsOf(f);
    // The keyframe: built once a minute, ahead of time on the device (a block
    // row a frame through the previous minute), so its work is billed as the
    // flat share below, not to the frame that happens to build it here.
    STATE.prim++;
    let K;
    try { K = keyframe(f.h, dg, hourSeed(f)); } finally { STATE.prim--; }
    const mk = f.minuteKey;

    // ---- block states for this frame
    for (let b = 0; b < NB; b++) { BS[b] = K.role[b] ? 1 : 0; MELT[b] = -1; GHOST[b] = 0; }
    let sortU = 0;
    if (sec >= 56) {
      const nx = clockFields(new Date(date.getTime() + 60000)), nd = digitsOf(nx);
      if (nx.h !== f.h) sortU = Math.min(1, Math.max(0, (sec - 57) / 2.5));
      for (let s = 0; s < 4; s++) {
        if (nd[s] === dg[s]) continue;
        for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
          const b = (SLOT_Y + j) * BW + SLOT_X[s] + i;
          const tLoss = 56.6 + 2.0 * rand(b, mk, 3), tGarb = 58.4 + 1.2 * rand(b, mk, 4);
          if (sec >= tGarb) BS[b] = 2;
          else if (sec >= tLoss && BS[b] === 1) { BS[b] = 0; MELT[b] = tLoss; }
        }
      }
    } else if (sec < 2.5) {
      const pv = clockFields(new Date(date.getTime() - 60000)), pd = digitsOf(pv);
      if (pv.h !== f.h) sortU = 1 - Math.min(1, Math.max(0, (sec - 0.3) / 2.5));
      for (let s = 0; s < 4; s++) {
        if (pd[s] === dg[s]) continue;
        for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
          const b = (SLOT_Y + j) * BW + SLOT_X[s] + i;
          if (K.role[b]) {
            const tDec = 0.3 + 0.09 * j + 0.22 * rand(b, mk, 5);
            if (sec < tDec) {
              BS[b] = 2;
              if (K.role[b] === 1) { const u = Math.min(1, sec / tDec); GHOST[b] = 0.85 * u * u; }
            } else if (sec < tDec + 0.14) BS[b] = 3;
          } else {
            const tClr = 0.25 + 1.3 * rand(b, mk, 6);
            if (sec < tClr) BS[b] = 2; else MELT[b] = tClr;
          }
        }
      }
    }

    // ---- this sweep's vectors and the last one's
    const gen = Math.floor(abs / P), tau = abs - gen * P;
    const sweep = Math.min(BW, Math.floor(tau / COLT));
    const mNow = mode(gen), mOld = mode(gen - 1);
    distMap(mNow.dir);
    if (mOld.dir !== mNow.dir) distMap(mOld.dir);

    // ---- decode
    const buf = g.buf, KY = K.Y, KU = K.U, KV = K.V, K565 = K.K565, gseed = mk & 0xffff, flick = Math.floor(abs * 4);
    for (let cb = 0; cb < BW; cb++) {
      const fresh = cb < sweep, m = fresh ? mNow : mOld;
      const age = fresh ? tau - cb * COLT : tau + P - cb * COLT;
      const D = DIST[m.dir], dx = m.dx, dy = m.dy, vertical = dx === 0;
      for (let y = 0; y < H; y++) {
        const brow = (y >> 2) * BW, band = vertical ? cb : dy === 0 ? (y >> 2) * 2 : cb;
        let L0 = Math.floor(m.sp[band] * age);
        for (let x = cb * MB; x < cb * MB + MB; x++) {
          const p = y * W + x, b = brow + cb, s = BS[b];
          if (s === 1) { buf[p] = K565[p]; continue; }
          if (s === 3) { buf[p] = K.DC[b]; continue; }
          let Y, U, V;
          if (s === 2) {
            garbage(K, b, x, y, gseed, flick);
            Y = gY; U = gU; V = gV;
            const gh = GHOST[b];
            if (gh > 0) { Y += (238 - Y) * gh; U *= 1 - gh * 0.8; V *= 1 - gh * 0.8; }
          } else {
            let L = L0;
            if (MELT[b] >= 0) { const l = Math.floor(9 * (sec - MELT[b])); if (l < L) L = l; }
            const d = D[p];
            let sx, sy, tail;
            if (L < d) {
              sx = x - dx * L; sy = y - dy * L; tail = false;
              sx = ((sx % W) + W) % W; sy = ((sy % H) + H) % H;
            } else { sx = x - dx * d; sy = y - dy * d; tail = true; }
            const q = sy * W + sx, sb = BS[(sy >> 2) * BW + (sx >> 2)];
            if (sb === 2) { garbage(K, (sy >> 2) * BW + (sx >> 2), sx, sy, gseed, flick); Y = gY; U = gU; V = gV; }
            else { Y = KY[q]; U = KU[q]; V = KV[q]; }
            if (tail) {
              const k = (d + 3) >> 2;                       // whole macroblocks of residual
              Y -= 80 + k * 22; U += m.tu * (5 + 2 * k); V += m.tv * (5 + 2 * k);
            } else {
              Y -= L >> 2; U += (L * m.tu) >> 3; V += (L * m.tv) >> 3;
            }
          }
          buf[p] = yuv565(Y < 0 ? 0 : Y > 255 ? 255 : Y | 0, U < -128 ? -128 : U > 127 ? 127 : U | 0, V < -128 ? -128 : V > 127 ? 127 : V | 0);
        }
      }
    }
    g.cost.px += N; g.cost.box += N * 12 + 2 * N * 2 + 600; g.cost.calls += BW;

    // ---- a slice slips for a few frames
    const sl = hash(Math.floor(abs * 5), 31);
    if (sl % 13 === 0) {
      const r = (sl >> 4) % BH, sh = ((sl >> 9) % 7) - 3 || 2;
      for (let y = r * MB; y < r * MB + MB; y++) {
        const row = buf.slice(y * W, y * W + W);
        for (let x = 0; x < W; x++) buf[y * W + x] = row[(((x - sh) % W) + W) % W];
      }
      g.cost.px += W * MB;
    }

    // ---- hour: pixel sort
    if (sortU > 0) {
      const post = sec < 30;
      let work = 0;
      for (let x = 0; x < W; x++) {
        const xx = post ? W - 1 - x : x;
        let v = sortU * 1.6 - (0.6 * xx) / W;
        v = v < 0 ? 0 : v > 1 ? 1 : v;
        if (v <= 0) continue;
        const thr = 255 * (1 - v);
        let y = 0;
        while (y < H) {
          let y1 = y;
          while (y1 < H && luma(buf[y1 * W + x]) >= thr) y1++;
          const n = y1 - y;
          if (n > 1) {
            for (let k = 0; k < n; k++) { const c = buf[(y + k) * W + x]; SORTK[k] = luma(c) * 65536 + c; }
            const a = SORTK.subarray(0, n).sort();
            for (let k = 0; k < n; k++) buf[(y + k) * W + x] = a[k] % 65536;
            work += n * (32 - Math.clz32(n)) * 2;
          }
          y = y1 === y ? y + 1 : y1;
        }
      }
      g.cost.box += work + W * H * 2;
    }
  },
};

function luma(c) {
  return ((((c >> 11) & 31) * 8 * 77 + ((c >> 5) & 63) * 4 * 150 + (c & 31) * 8 * 29) >> 8);
}
