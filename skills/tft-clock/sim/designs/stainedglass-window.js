// The window for 'stainedglass', built once at load: a material map of the
// whole glass (piece id and tone per pixel) and a table of pieces (kind,
// colour, centre). Two lancets (pointed lights with a pearled border, a
// roundel in the head and a field of painted quarries) and a rose (twelve
// cusped petals round a hub of quarries), set in ashlar.

import { hash, rand, noise } from '../js/kit.js';

export const W = 160, H = 80;

// piece kinds
export const K_LEAD = 0, K_QLEAD = 1, K_SKY = 2, K_STONE = 3, K_FRAME = 4, K_QUARRY = 5,
  K_BMAIN = 6, K_BPEARL = 7, K_RA = 8, K_RB = 9, K_PIN = 10, K_POUT = 11, K_DIGIT = 12;

export const MAXP = 600;
export const pKind = new Uint8Array(MAXP);
export const pCx = new Float32Array(MAXP), pCy = new Float32Array(MAXP);
export const pT = new Int16Array(MAXP * 3);     // glass colour under white light (fixed kinds)
export const pOrd = new Float32Array(MAXP);     // hour show order: petal index, border height
const pN = new Float32Array(MAXP);
export const pPix = [];                          // pixel lists, for the pieces that can fall
let NP = 0;
function piece(kind, rgb = [0, 0, 0]) {
  const i = NP++;
  pKind[i] = kind; pT[i * 3] = rgb[0]; pT[i * 3 + 1] = rgb[1]; pT[i * 3 + 2] = rgb[2];
  return i;
}
export const P_LEAD = piece(K_LEAD), P_QLEAD = piece(K_QLEAD), P_SKY = piece(K_SKY);

export const CODE = new Uint16Array(W * H);     // piece * 4 + tone

// ------------------------------------------------------------ geometry
export const LAN_X = [2, 40], LAN_W = 35, LAN_TOP = 2, LAN_BOT = 78;
const AR = 22, HALF = LAN_W / 2;
export const YS = LAN_TOP + Math.sqrt(AR * AR - (AR - HALF) ** 2);   // springing line
export const ROSE = { cx: 122, cy: 40, r: 37 };

/** Signed distance into lancet k (positive inside). */
export function lancetDist(k, px, py) {
  const x0 = LAN_X[k], x1 = x0 + LAN_W;
  let d = LAN_BOT - py;
  if (py >= YS) d = Math.min(d, px - x0, x1 - px);
  else {
    const dl = AR - Math.hypot(px - (x0 + AR), py - YS), dr = AR - Math.hypot(px - (x1 - AR), py - YS);
    d = Math.min(d, dl, dr);
  }
  return d;
}

// ------------------------------------------------------------ build
const QUARRY = [206, 216, 190];
const keyed = new Map();
function keyedPiece(key, kind, rgb) {
  let i = keyed.get(key);
  if (i === undefined) { i = piece(kind, rgb); keyed.set(key, i); }
  return i;
}
function quarryColour(a, b, s) {
  const r = rand(a, b, s), r2 = rand(b, a, s + 1);
  // old glass: each quarry a little greener, warmer or greyer than the next
  return [QUARRY[0] - 10 + ((r * 22) | 0), QUARRY[1] - 6 + ((r2 * 14) | 0), QUARRY[2] - 12 + ((r * r2 * 26) | 0)];
}
/** Quarry lattice: lead line, or the quarry and paint tone. */
function quarryAt(px, py, ox, oy, tag) {
  const u = (px - ox) + 0.8 * (py - oy), v = (px - ox) - 0.8 * (py - oy);
  const a = Math.floor(u / 8), b = Math.floor(v / 8), fu = u - a * 8, fv = v - b * 8;
  if (fu < 1 || fv < 1) return -1;
  const id = keyedPiece(`${tag}:${a}:${b}`, K_QUARRY, quarryColour(a, b, tag.length));
  const paint = Math.abs(fu - 4.5) + Math.abs(fv - 4.5) < 1.6;
  const n = noise(u * 0.4 + a * 3, b * 7 + 11);
  return id * 4 + (paint ? 3 : n < 0.22 ? 1 : n > 0.8 ? 2 : 0);
}

const stone = [];
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const px = x + 0.5, py = y + 0.5, i = y * W + x;
    let code = -1;
    // lancets
    for (let k = 0; k < 2 && code < 0; k++) {
      const d = lancetDist(k, px, py);
      if (d < -1.6) continue;
      if (d < 0) { code = keyedPiece(`frame${k}`, K_FRAME) * 4 + (d < -1 ? 1 : 0); break; }
      if (d < 1) { code = P_LEAD * 4; break; }
      const x0 = LAN_X[k], xc = x0 + HALF;
      if (d < 3.5) {
        const bottom = LAN_BOT - py < Math.min(px - x0, x0 + LAN_W - px);
        const side = bottom ? 'b' : px < xc ? 'l' : 'r';
        const prm = bottom ? x : y;
        const pm = (((prm - 2) % 10) + 10) % 10, bk = Math.floor((prm - 2) / 10);
        if (pm === 6 || pm === 9) code = P_LEAD * 4;
        else if (pm < 6) code = keyedPiece(`bm${k}${side}${bk}`, K_BMAIN) * 4 + (rand(x, y, 3) < 0.25 ? 1 : 0);
        else code = keyedPiece(`bp${k}${side}${bk}`, K_BPEARL) * 4;
        break;
      }
      if (d < 4.5) { code = P_LEAD * 4; break; }
      // the roundel in the head
      const rx = px - xc, ry = py - 14, rr = Math.hypot(rx, ry);
      if (rr < 6.6) {
        if (rr > 5.6 || Math.abs(rx) < 0.5 || Math.abs(ry) < 0.5) code = P_LEAD * 4;
        else code = keyedPiece(`rd${k}${rx < 0 ? 0 : 1}${ry < 0 ? 0 : 1}`, (rx < 0) === (ry < 0) ? K_RA : K_RB) * 4 + (rr < 2.2 ? 2 : 0);
        break;
      }
      const q = quarryAt(px, py, xc, 14, `q${k}`);
      code = q < 0 ? P_QLEAD * 4 : q;
    }
    // the rose
    if (code < 0) {
      const dx = px - ROSE.cx, dy = py - ROSE.cy, r = Math.hypot(dx, dy);
      if (r <= 39) {
        const th = (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI);   // clock angle
        const wd = th / (Math.PI / 6), p = Math.floor(wd + 0.5) % 12, f = wd + 0.5 - Math.floor(wd + 0.5);
        const edge = r * Math.sin(Math.min(f, 1 - f) * Math.PI / 6);     // distance to the nearer spoke
        const rOut = 33.2 + 3.6 * Math.sin(Math.PI * f);
        const tr = keyedPiece('tracery', K_FRAME);
        if (r > 37.6) code = keyedPiece('roseframe', K_FRAME) * 4 + (r > 38.4 ? 1 : 0);
        else if (r < 25.6) code = -2;
        else if (r < 26.6) code = P_LEAD * 4;
        else if (r < 28.4) code = tr * 4;
        else if (r < 29.3) code = P_LEAD * 4;
        else if (edge < 1.1) code = tr * 4;
        else if (edge < 2.0) code = P_LEAD * 4;
        else if (r > rOut + 1) code = tr * 4;
        else if (r > rOut) code = P_LEAD * 4;
        else if (r < 31.9) code = keyedPiece(`pi${p}`, K_PIN) * 4;
        else if (r < 32.8) code = P_LEAD * 4;
        else code = keyedPiece(`po${p}`, K_POUT) * 4 + (rand(x, y, 9) < 0.2 ? 1 : 0);
        if (code === -2) {
          const q = quarryAt(px, py, ROSE.cx, ROSE.cy, 'hub');
          code = q < 0 ? P_QLEAD * 4 : q;
        }
        const pc = code >> 2;
        if (pKind[pc] === K_PIN || pKind[pc] === K_POUT) pOrd[pc] = p + (pKind[pc] === K_POUT ? 0.35 : 0);
      }
    }
    // the wall: ashlar courses, 8 rows, blocks 13-21 wide
    if (code < 0) {
      const c = y >> 3, off = (hash(c, 1) % 13);
      let bx = Math.floor((x + off) / 17);
      const id = keyedPiece(`st${c}:${bx}`, K_STONE);
      const joint = (y & 7) === 7 || ((x + off) % 17) === 16;
      code = id * 4 + (joint ? 3 : hash(c, bx, 2) % 3);
      stone.push(i);
    }
    CODE[i] = code;
    const pc = code >> 2;
    pCx[pc] += px; pCy[pc] += py; pN[pc]++;
  }
for (let i = 0; i < NP; i++) if (pN[i]) { pCx[i] /= pN[i]; pCy[i] /= pN[i]; }
for (let i = 0; i < NP; i++) pPix.push(null);
// pixel lists for petals (they fall at the hour) and border heights (the colour front climbs them)
for (let i = 0; i < W * H; i++) {
  const pc = CODE[i] >> 2;
  if (pKind[pc] === K_PIN || pKind[pc] === K_POUT) (pPix[pc] ??= []).push(i);
}
for (let i = 0; i < NP; i++) {
  if (pPix[i]) pPix[i] = Int16Array.from(pPix[i]);
  const k = pKind[i];
  if (k === K_BMAIN || k === K_BPEARL || k === K_RA || k === K_RB) pOrd[i] = 1 - pCy[i] / H;
}
export const NBASE = NP;

/** Reserve n pieces for a digit slot; returns the first id. */
export function reserve(n) {
  const i = NP;
  for (let k = 0; k < n; k++) piece(K_DIGIT);
  return i;
}
export const pieceCount = () => NP;

/** For a box on the glass, the code each pixel would show with the quarry leads healed over: the pale moat. */
export function moatCodes(x0, y0, bw, bh) {
  const out = new Uint16Array(bw * bh);
  for (let j = 0; j < bh; j++)
    for (let i = 0; i < bw; i++) {
      const x = x0 + i, y = y0 + j;
      let c = x >= 0 && y >= 0 && x < W && y < H ? CODE[y * W + x] : P_LEAD * 4;
      if ((c >> 2) === P_QLEAD) {
        // nearest quarry glass round it
        let found = -1;
        for (let r = 1; r <= 2 && found < 0; r++)
          for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const cc = CODE[yy * W + xx];
            if (pKind[cc >> 2] === K_QUARRY) { found = (cc >> 2) * 4; break; }
          }
        if (found >= 0) c = found;
      } else if (pKind[c >> 2] === K_QUARRY && (c & 3) === 3) c = c & ~3;   // and no paint in the moat
      out[j * bw + i] = c;
    }
  return out;
}
