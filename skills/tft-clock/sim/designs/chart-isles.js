// The islands of chart.js, drawn in one integer pass: every slot writes its
// coast distance (quarter pixels) into a shared distance buffer, keeping the
// nearest island, so water-lines of neighbouring islands merge as an
// engraver would run them; then each pixel is looked up in its island's
// layer table (coast colours composited per frame from the palette).

import { R, G, B, to565, noise2 } from '../js/kit.js';
import { W, H, M, SLOTS, SIZES, GLYPHS, COV, LUT_N, LUT_OFF, layers } from './chart-sheet.js';
import { MARGIN } from './chart-glyphs.js';

const DB = new Int16Array(W * H), SB = new Uint8Array(W * H);
const FAR = 127;
// distance from the quill's tip, quarter pixels, for |dx|, |dy| < 64 (flash, 8 KB)
const TIPD = new Int16Array(64 * 64);
for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) TIPD[y * 64 + x] = Math.round(Math.hypot(x, y) * 4);

// the flood's noise: as the sea rises it takes the low ground first, so a
// drowning island breaks into islets (64 x 64 int8, tiling; flash 4 KB)
const FLOOD = new Int8Array(64 * 64);
for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
  const n = noise2(x / 3.2, y / 3.2, 77) * 0.7 + noise2(x / 1.6, y / 1.6, 78) * 0.3;
  FLOOD[y * 64 + x] = Math.round((n - 0.5) * 2 * 18);
}

const LUTC = SLOTS.map(() => new Uint16Array(LUT_N)), LUTA = SLOTS.map(() => new Uint8Array(LUT_N));
const LAY = SIZES.map((_, si) => layers(si));

/**
 * Composite one slot's coast table from the palette. `wash` 0..1: the
 * colourist's wash over the new land (0: bare inked paper); `lines` 0..1
 * fades the water-lines. Integer over-compositing: ~6 layers x 80 entries.
 */
function buildLUT(k, size, pal, wash, lines) {
  const cov = COV[size], lay = LAY[size], C = LUTC[k], A = LUTA[k];
  const wk = Math.round(wash * 256), lk = Math.round(lines * 256);
  const paper = pal[M.PAPER];
  for (let e = 0; e < LUT_N; e++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let l = 0; l < lay.length; l++) {
      const cv = cov[l][e];
      if (!cv) continue;
      const mat = lay[l][2];
      let al = Math.round(lay[l][3] * 256);
      if (mat === M.WLINE || mat === M.SHALLOW) al = (al * lk) >> 8;
      const x = (cv * al) >> 8;
      if (!x) continue;
      let c = pal[mat];
      if (mat === M.LAND || mat === M.BANDH || mat === M.BANDM) {
        // unwashed land is the bare paper
        const cr = (R(paper) * (256 - wk) + R(c) * wk) >> 8, cg = (G(paper) * (256 - wk) + G(c) * wk) >> 8, cb = (B(paper) * (256 - wk) + B(c) * wk) >> 8;
        c = (cr << 16) | (cg << 8) | cb;
      }
      r = (r * (256 - x) + R(c) * x) >> 8; g = (g * (256 - x) + G(c) * x) >> 8; b = (b * (256 - x) + B(c) * x) >> 8;
      a = a + ((x * (256 - a)) >> 8);
    }
    if (a > 0) { r = Math.min(255, ((r << 8) / a) | 0); g = Math.min(255, ((g << 8) / a) | 0); b = Math.min(255, ((b << 8) / a) | 0); }
    C[e] = to565((r << 16) | (g << 8) | b);
    A[e] = (a + 4) >> 3;    // 0..32
  }
  return LUT_N * lay.length;
}

/**
 * Draw the islands. `jobs[k]`: { digit, rise (quarter px the sea has
 * risen over it), pen (null, or { u: 0..255 drawn so far, tip: [x, y] in
 * table coords, down: pen on paper }), wash, lines }. `breathe` shifts the
 * offshore water-lines (quarter px). Returns work done, for the estimate.
 */
export function drawIsles(g, jobs, pal, breathe) {
  let work = 0;
  DB.fill(FAR);
  for (let k = 0; k < SLOTS.length; k++) {
    const job = jobs[k];
    if (!job) continue;
    const slot = SLOTS[k], gl = GLYPHS[slot.size][job.digit];
    const ox = slot.x - MARGIN, oy = slot.y - MARGIN, tw = gl.tw, th = gl.th, D = gl.d, U = gl.u;
    const rise = job.rise | 0, pen = job.pen;
    const pu = pen ? pen.u : 256, tx = pen ? pen.tip[0] : 0, ty = pen ? pen.tip[1] : 0, down = pen ? pen.down : true;
    const rq = Math.round(gl.r * 4);
    for (let y = 0; y < th; y++) {
      const yy = oy + y;
      if (yy < 0 || yy >= H) continue;
      for (let x = 0; x < tw; x++) {
        const xx = ox + x;
        if (xx < 0 || xx >= W) continue;
        const t = y * tw + x;
        let d = D[t];
        if (rise) d += rise + ((FLOOD[((yy & 63) << 6) | (xx & 63)] * rise) >> 5);
        if (U[t] > pu) {
          // ahead of the quill: only its round tip, if it is on the paper
          if (!down) continue;
          const ax = Math.abs(x + 0.5 - tx) | 0, ay = Math.abs(y + 0.5 - ty) | 0;
          const dt = ax < 64 && ay < 64 ? TIPD[ay * 64 + ax] - rq : FAR;
          if (dt > d) d = dt;
        }
        const i = yy * W + xx;
        if (d < DB[i]) { DB[i] = d; SB[i] = k; }
      }
    }
    work += tw * th * 4;
    work += buildLUT(k, slot.size, pal, job.wash, job.lines);
  }
  // the pass: each pixel near a coast through its island's table
  const buf = g.buf, top = LUT_N - LUT_OFF;
  let n = 0;
  for (let i = 0; i < W * H; i++) {
    let d = DB[i];
    if (d >= top) continue;
    if (d > 5) { d -= breathe; if (d >= top) continue; if (d < 5) d = 5; }
    const e = d < -LUT_OFF ? 0 : d + LUT_OFF, k = SB[i];
    const a = LUTA[k][e];
    if (!a) continue;
    const c = LUTC[k][e];
    if (a >= 32) buf[i] = c;
    else {
      const o = buf[i];
      const r = (((o >> 11) * (32 - a) + (c >> 11) * a) >> 5), gg = ((((o >> 5) & 63) * (32 - a) + ((c >> 5) & 63) * a) >> 5), b = (((o & 31) * (32 - a) + (c & 31) * a) >> 5);
      buf[i] = (r << 11) | (gg << 5) | b;
    }
    n++;
  }
  g.cost.px += n; g.cost.box += W * H * 2 + n * 6;
  return work;
}
