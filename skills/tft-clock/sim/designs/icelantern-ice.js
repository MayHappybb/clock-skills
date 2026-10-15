// The ice renderer for icelantern.js: draws one digit-building from its
// maps (icelantern-glyphs.js) with this frame's light, plus the raw block a
// new digit is carved from.
//
// Per pixel it mixes three looks of the same ice, all integer arithmetic:
//   unlit   a dim blue ambient, through the block's own light map
//   lit     the LED colour of that row times the light map, plus the white
//           of joints, rims and bubbles
//   day     sunlit blue-white: the facing map picks highlight or blue shadow
// Cost: ~10 box units per scanned pixel (charged to g.cost), writes via g.put.

const W = 160, H = 80;

/** Per-row light for the building being drawn: filled by the caller. */
export const ROW = {
  br: new Int32Array(H), bg: new Int32Array(H), bb: new Int32Array(H),   // body LED colour per screen row
  cr: new Int32Array(H), cg: new Int32Array(H), cb: new Int32Array(H),   // crown LED colour
};
/** Day ice by facing (16 steps), ambient unlit ice: filled per frame. */
export const DAY = { r: new Int32Array(16), g: new Int32Array(16), b: new Int32Array(16), amb: 0x3c4a78, key: 0x0a0820, frost: 0xa8c4e8 };

/**
 * Draw glyph `gl` with its body box top-left at (x0, y0) (y0 may be
 * fractional: the block on the crane). Options (all numbers):
 *   lt      LED level 0..1        dl     daylight 0..1
 *   hide    rows above this screen y are cut away (old digit under the saw)
 *   hot     screen y of the saw's cut: a bright line of fresh-cut ice
 *   frost   rows above this screen y are still raw block (new digit, not yet carved)
 *   glint   x of the sun glint band by day (or -999)
 *   show    0..1: the hour show's LED colour over the daylight ice
 */
export function drawIce(g, gl, x0, y0, o) {
  const gx = x0 - gl.ox, gyF = y0 - gl.oy;
  const lt = (o.lt * 256) | 0, dl = (o.dl * 256) | 0, show = (o.show * 250) | 0;
  const ar = (DAY.amb >>> 16) & 255, ag = (DAY.amb >>> 8) & 255, ab = DAY.amb & 255;
  const kr = (DAY.key >>> 16) & 255, kg = (DAY.key >>> 8) & 255, kb = DAY.key & 255;
  const fr = (DAY.frost >>> 16) & 255, fg = (DAY.frost >>> 8) & 255, fb = DAY.frost & 255;
  const whK = 80 + ((lt * 176) >> 8);
  const gw = gl.gw, gh = gl.gh, A = gl.A, Lm = gl.L, Wh = gl.Wh, F = gl.F, K = gl.K, C = gl.C;
  const yTop = Math.floor(gyF), yBot = Math.ceil(gyF + gh);
  const crownTop = gyF + gl.top;
  const blockL = x0 - 1, blockR = x0 + gl.w + 1;
  for (let y = yTop < 0 ? 0 : yTop; y < yBot && y < H; y++) {
    const jf = y - gyF, j0 = Math.floor(jf), u = jf - j0;
    const j = u < 0.5 ? j0 : j0 + 1;               // the row the attributes come from
    const ja = j0 >= 0 && j0 < gh ? j0 : -1, jb = j0 + 1 < gh && j0 + 1 >= 0 ? j0 + 1 : -1;
    if (j < 0 || j >= gh) continue;
    if (y + 1 <= o.hide) continue;
    let rowA = 1;
    if (y < o.hide) rowA = y + 1 - o.hide;
    const hot = o.hot > -500 ? 1 - Math.abs(y + 0.5 - o.hot) / 2.2 : 0;
    const raw = y + 0.5 < o.frost && y + 1 > crownTop;   // inside the uncarved block
    const br = ROW.br[y], bg = ROW.bg[y], bb = ROW.bb[y], cr = ROW.cr[y], cg = ROW.cg[y], cb = ROW.cb[y];
    let xa = gl.rowL[j], xb = gl.rowR[j];
    if (raw) { xa = blockL - gx; xb = blockR - 1 - gx; }
    const topCov = raw ? Math.min(1, y + 1 - crownTop) : 1;
    for (let i = xa; i <= xb; i++) {
      const x = gx + i;
      if (x < 0 || x >= W) continue;
      g.cost.box += 10;
      const inG = i >= 0 && i < gw;
      const q = inG ? j * gw + i : 0;
      // coverage, blended between the two source rows when the block moves
      let a = 0, kk = 0;
      if (inG) {
        const a0 = ja >= 0 ? A[ja * gw + i] : 0, a1 = jb >= 0 ? A[jb * gw + i] : 0;
        a = (a0 + (a1 - a0) * u) * rowA;
        kk = K[q];
      }
      // colour of the ice here
      let r = 0, gg = 0, b = 0;
      if (a > 0) {
        const L = Lm[q], wh = Wh[q], cw = C[q];
        const lr = cw ? cr : br, lg = cw ? cg : bg, lb = cw ? cb : bb;
        // unlit and lit
        const ur = ((ar * L) >> 8) + (wh >> 2), ug = ((ag * L) >> 8) + (wh >> 2), ub = ((ab * L) >> 8) + (wh >> 2);
        const nr = ((lr * L) >> 8) + ((wh * whK) >> 8), ng = ((lg * L) >> 8) + ((wh * whK) >> 8), nb = ((lb * L) >> 8) + ((wh * whK) >> 8);
        r = ur + (((nr - ur) * lt) >> 8); gg = ug + (((ng - ug) * lt) >> 8); b = ub + (((nb - ub) * lt) >> 8);
        // by day
        if (dl > 0) {
          const fi = F[q] >> 4;
          let dr = DAY.r[fi] + (wh >> 2), dg = DAY.g[fi] + (wh >> 2), db = DAY.b[fi] + (wh >> 2);
          if (show > 0) {   // the hour show lights the palace even in sunshine
            const sl = (L * show) >> 8;
            dr = (dr * (256 - (show >> 1)) + lr * sl) >> 8; dg = (dg * (256 - (show >> 1)) + lg * sl) >> 8; db = (db * (256 - (show >> 1)) + lb * sl) >> 8;
          }
          if (o.glint > -500) {
            const gd = x + y * 0.5 - o.glint;
            if (gd > -2 && gd < 2 && F[q] > 150) { dr += 90; dg += 90; db += 90; }
          }
          r += ((dr - r) * dl) >> 8; gg += ((dg - gg) * dl) >> 8; b += ((db - b) * dl) >> 8;
        }
        if (hot > 0) { const hv = (hot * 200) | 0; r += hv; gg += hv; b += hv; }
        if (r > 255) r = 255; if (gg > 255) gg = 255; if (b > 255) b = 255;
      }
      if (raw) {
        // the raw block: frosted, its big sawn joints, the digit glowing through
        const bi = x - blockL, bj = y - Math.floor(crownTop);
        const edge = x === blockL || x === blockR - 1;
        let f = edge ? 0.55 : (bi === ((gl.w + 2) >> 1) || bj % 12 === 11) ? 1.15 : 0.9 + ((bi + bj) & 3 ? 0 : 0.05);
        if (bj === 0) f = 1.25;
        let sr = fr * f, sg = fg * f, sb = fb * f;
        const m = a / 255 * 0.88;
        sr += (r - sr) * m; sg += (gg - sg) * m; sb += (b - sb) * m;
        if (sr > 255) sr = 255; if (sg > 255) sg = 255; if (sb > 255) sb = 255;
        g.put(x, y, ((sr | 0) << 16) | ((sg | 0) << 8) | (sb | 0), (a > 0 ? 0.97 : 0.85) * topCov);
        continue;
      }
      if (kk && a < 255) g.put(x, y, (kr << 16) | (kg << 8) | kb, (kk * (255 - a)) / 65025 * 0.85 * rowA);
      if (a > 3) g.put(x, y, (r << 16) | (gg << 8) | b, a / 255);
    }
  }
}
