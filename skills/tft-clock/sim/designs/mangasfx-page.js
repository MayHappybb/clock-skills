// Manga SFX: the page. Screentone, focus lines, speed lines, panel borders,
// the red spot-colour burst, and the fist. Everything is written straight
// into the RGB565 buffer from small tables, in three inks: paper, ink, red.

import { to565, hash, Gfx } from '../js/kit.js';

export const W = 160, H = 80, N = W * H;

// the three inks of the printed page (and their night negatives)
export const PAPER_C = 0xf2eee4, INK_C = 0x1a191c, RED_C = 0xd8291f;
export const PAPER = to565(PAPER_C), INK = to565(INK_C), RED = to565(RED_C);
export const N_GROUND = to565(0x111014), N_LINE = to565(0xcdc5b4), N_RED = to565(0xb0231c);

// ------------------------------------------------------------ screentone
// A 45-degree dot screen, 4.2 px pitch: two dots in a 6 x 6 tile. THR is the
// fill order of each pixel within its dot; a pixel is inked when THR < level
// (0 = paper, 18 = solid). Dots stay round and at least 1 px from level 1.
export const THR = new Uint8Array(36);
{
  const L = [];
  for (let a = -6; a <= 12; a += 3) for (let b = -6; b <= 12; b += 3) if (((a + b) % 6 + 6) % 6 === 0) L.push([a, b]);
  const cells = [];
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
    let m = 1e9;
    for (const [a, b] of L) m = Math.min(m, (x - a) ** 2 + (y - b) ** 2 + 0.01 * ((x - a) + 0.5 * (y - b)));
    cells.push([m, y * 6 + x]);
  }
  cells.sort((p, q) => p[0] - q[0]);
  cells.forEach(([, i], r) => { THR[i] = r >> 1; });
}

// ------------------------------------------------------------ polar table (one quadrant)
// For an offset (dx, dy) >= 0 from a centre at a pixel corner: the angle in
// 256 steps over the quadrant and the radius in px. 25.6 KB of flash serves
// focus lines and bursts round any integer centre.
export const QA = new Uint8Array(N), QR = new Uint8Array(N);
for (let dy = 0; dy < H; dy++) for (let dx = 0; dx < W; dx++) {
  const x = dx + 0.5, y = dy + 0.5;
  QA[dy * W + dx] = Math.min(255, Math.floor((Math.atan2(y, x) / (Math.PI / 2)) * 256));
  QR[dy * W + dx] = Math.min(255, Math.round(Math.hypot(x, y)));
}

// ------------------------------------------------------------ focus lines
// A focus-line set is a table over 1024 directions: the radius at which a
// line starts (255: none). Lines are wedges a few directions wide, pointed at
// the inner end, so they taper toward the centre as drawn ones do.
export function focusLines(tab, seed, T, rate, n, r0, spread, wMin, wMax) {
  tab.fill(255);
  let ops = 1024;
  for (let k = 0; k < n; k++) {
    // each line is redrawn on its own beat, so the set shimmers rather than flashes
    const h = hash(seed, k, Math.floor(T * rate + ((k * 0.618) % 1)));
    const a0 = h & 1023, w = wMin + ((h >>> 10) % (wMax - wMin + 1)), ri = r0 + ((h >>> 16) % spread);
    const mid = (w - 1) / 2;
    for (let j = 0; j < w; j++) {
      const A = (a0 + j) & 1023, v = ri + (j > mid ? j - mid : mid - j) * 2.2;
      if (v < tab[A]) tab[A] = v;
    }
    ops += w * 3;
  }
  return ops;
}

// a red explosion burst: radius per direction, spiky
export function burstShape(tab, seed, spikes, R, rot) {
  const per = 1024 / spikes;
  for (let A = 0; A < 1024; A++) {
    const p = (A + rot * 1024) / per + spikes * 64, k = p | 0, f = p - k;
    const tip = 0.72 + 0.28 * ((hash(seed, ((k % spikes) + spikes) % spikes, 5) & 255) / 255);
    const tri = f < 0.5 ? f * 2 : (1 - f) * 2;          // 0 at the valleys, 1 at the tips
    tab[A] = R * (0.55 + 0.45 * tri * tip);
  }
  return 1024 * 4;
}

/** The direction (0..1023) and radius of pixel (x, y) about corner (cx, cy). */
export function polarIndex(x, y, cx, cy) {
  const dx = x >= cx ? x - cx : cx - 1 - x, dy = y >= cy ? y - cy : cy - 1 - y;
  if (dx >= W || dy >= H) return -1;
  return dy * W + dx;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// ------------------------------------------------------------ the page background
// P: { cut, flash, boost, fa: [x, y], innerA, innerS, tlA, tlS, lb, t, panelX(y) }
// Rows above `cut` are the two-panel page, rows from `cut` down the splash.

const TL_A = new Uint8Array(256), TL_S = new Uint8Array(256), LB = new Uint8Array(H);

export const GUT0 = 88.5, GUT_SLOPE = -0.17;     // the slanted gutter's centre line
export const gutterAt = (y) => GUT0 + GUT_SLOPE * y;

export function background(g, P) {
  const buf = g.buf, t = P.t;
  let box = 0, px = 0;
  if (P.flash) { buf.fill(PAPER); g.cost.px += N; return; }
  // tone ramps: panel A darkens away from its focus centre, the splash more so
  const bA = P.boost;
  for (let r = 0; r < 256; r++) {
    TL_A[r] = Math.max(0, Math.min(18, ((r - 36) * (0.24 + 0.12 * bA)) + 4 * bA)) | 0;
    TL_S[r] = Math.max(0, Math.min(18, (r - 62) * 0.3)) | 0;
  }
  for (let y = 0; y < H; y++) {
    const e = Math.abs(y - 45);
    LB[y] = Math.max(0, Math.min(16, (e - 26) * (0.3 + 0.15 * bA) + 4 * bA)) | 0;
  }
  const [fax, fay] = P.fa, inA = P.innerA, inS = P.innerS;
  for (let y = 0; y < H; y++) {
    const row = y * W, tr = (y % 6) * 6;
    if (y >= P.cut) {
      // the splash: one page, focus lines round the centre, a dark vignette
      const dn = y >= 40, dy = dn ? y - 40 : 39 - y, q = dy * W;
      for (let x = 0, m = 0; x < W; x++) {
        const rt = x >= 80, dx = rt ? x - 80 : 79 - x, a = QA[q + dx], r = QR[q + dx];
        const A = rt ? (dn ? a : 1023 - a) : (dn ? 511 - a : 512 + a);
        buf[row + x] = r > inS[A] || THR[tr + m] < TL_S[r] ? INK : PAPER;
        if (++m === 6) m = 0;
      }
      box += W * 9; px += W;
      continue;
    }
    // the two-panel page: border round the glass, slanted gutter between
    if (y < 2 || y >= H - 2) { buf.fill(INK, row, row + W); px += W; continue; }
    const gc = gutterAt(y), b0 = Math.round(gc - 4), g0 = Math.round(gc - 2), g1 = Math.round(gc + 2), b1 = Math.round(gc + 4);
    buf[row] = INK; buf[row + 1] = INK; buf[row + W - 1] = INK; buf[row + W - 2] = INK;
    buf.fill(INK, row + b0, row + g0); buf.fill(PAPER, row + g0, row + g1); buf.fill(INK, row + g1, row + b1);
    // panel A: focus lines round its centre over a radial tone
    const dn = y >= fay, dy = dn ? y - fay : fay - 1 - y, q = dy * W;
    for (let x = 2, m = 2; x < b0; x++) {
      const rt = x >= fax, dx = rt ? x - fax : fax - 1 - x, a = QA[q + dx], r = QR[q + dx];
      const A = rt ? (dn ? a : 1023 - a) : (dn ? 511 - a : 512 + a);
      buf[row + x] = r > inA[A] || THR[tr + m] < TL_A[r] ? INK : PAPER;
      if (++m === 6) m = 0;
    }
    box += (b0 - 2) * 9;
    // panel B: tone bands top and bottom, then the speed lines streaming left
    const lv = LB[y];
    for (let x = b1, m = b1 % 6; x < W - 2; x++) {
      buf[row + x] = THR[tr + m] < lv ? INK : PAPER;
      if (++m === 6) m = 0;
    }
    box += (W - 2 - b1) * 4; px += W;
    for (let k = 0; k < 2; k++) {
      const h = hash(y, k, 33);
      if (h % 5 > (bA > 0.3 ? 3 : 1)) continue;
      const v = 60 + ((h >>> 4) % 70) * (1 + 1.4 * bA), L = 14 + ((h >>> 12) % 42), per = 170 + ((h >>> 20) % 110);
      let x0 = W - ((t * v + (h >>> 8) % per) % per);
      const x1 = Math.min(W - 2, Math.round(x0 + L)), xa = Math.max(b1, Math.round(x0));
      // a ruled streak, solid at its head, breaking into dashes toward its tail
      if (x1 > xa) {
        const xm = Math.min(x1, Math.round(x0 + L * 0.6));
        if (xm > xa) buf.fill(INK, row + xa, row + xm);
        for (let x = Math.max(xa, xm) + 1; x < x1; x += 2) buf[row + x] = INK;
        px += x1 - xa;
      }
      box += 12;
    }
  }
  g.cost.box += box; g.cost.px += px;
}

/** The return to panels after the splash: a ruled ink line where the page is being re-cut. */
export function cutLine(g, cut) {
  if (cut <= 0 || cut >= H) return;
  g.fillRect(0, cut - 1, W, 2, INK_C);
}

// ------------------------------------------------------------ the red burst
// Solid red with an ink rim; `level` < 18 dissolves it into red tone.
export function burst(g, cx, cy, tab, Rmax, level) {
  const buf = g.buf;
  const x0 = Math.max(0, cx - Rmax - 1), x1 = Math.min(W, cx + Rmax + 1), y0 = Math.max(0, cy - Rmax - 1), y1 = Math.min(H, cy + Rmax + 1);
  let n = 0;
  for (let y = y0; y < y1; y++) {
    const dn = y >= cy, dy = dn ? y - cy : cy - 1 - y, q = dy * W, tr = (y % 6) * 6;
    for (let x = x0; x < x1; x++) {
      const rt = x >= cx, dx = rt ? x - cx : cx - 1 - x, a = QA[q + dx], r = QR[q + dx];
      const A = rt ? (dn ? a : 1023 - a) : (dn ? 511 - a : 512 + a), R = tab[A];
      if (r >= R) continue;
      if (level >= 18) buf[y * W + x] = r >= R - 1.5 ? INK : RED;
      else if (THR[tr + (x % 6)] < level) buf[y * W + x] = RED;
      n++;
    }
  }
  g.cost.box += (x1 - x0) * (y1 - y0) * 8; g.cost.px += n;
}

// ------------------------------------------------------------ impact lines
export function impactLines(g, cx, cy, seed, u, rIn) {
  if (u >= 0.22) return;
  const k = u / 0.22, r0 = rIn + 9 * k, len = 7 * (1 - k) + 2;
  for (let j = 0; j < 7; j++) {
    const h = hash(seed, j, 9), a = ((h & 1023) / 1024) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a), sx = 1.25, sy = 0.95;
    const xa = cx + c * r0 * sx, ya = cy + s * r0 * sy, xb = cx + c * (r0 + len) * sx, yb = cy + s * (r0 + len) * sy;
    g.line(xa, ya, xb, yb, INK_C);
    g.line(xa + (Math.abs(s) > 0.5 ? 1 : 0), ya + (Math.abs(s) > 0.5 ? 0 : 1), xb + (Math.abs(s) > 0.5 ? 1 : 0), yb + (Math.abs(s) > 0.5 ? 0 : 1), INK_C);
  }
}

// ------------------------------------------------------------ the fist
// Side view, knuckles to the left, drawn once at load into a sprite (flash):
// an inked outline, paper fill, the finger creases, the thumb wrapped under,
// tone on the wrist. The forearm is drawn per frame back to the edge.
const FW = 28, FH = 22;
export const FIST = (() => {
  const c = new Gfx(FW, FH), KEY = 0x00ff00;
  c.clear(KEY);
  c.fillRoundRect(0, 0, 21, 22, 7, INK_C);
  c.fillRoundRect(1.5, 1.5, 18, 19, 5.5, PAPER_C);
  // the wrist, stepping back to the forearm
  c.fillRect(17, 4, 11, 15, INK_C);
  c.fillRect(17, 5.5, 11, 12, PAPER_C);
  // creases between the four curled fingers, and the knuckle fold
  for (const y of [6, 10.5, 15]) c.fillRect(1, Math.round(y), 7, 1, INK_C);
  c.fillRect(8, 3, 1, 16, INK_C);
  c.fillRect(9, 2, 1, 2, INK_C);
  // the thumb, wrapped across the lower fingers
  c.fillRoundRect(5, 13, 13, 6, 3, INK_C);
  c.fillRoundRect(6, 14, 11, 4, 2, PAPER_C);
  // knuckle highlights cut by a single tone patch on the back of the hand
  for (let y = 2; y < 12; y++) for (let x = 11; x < 20; x++) if (THR[(y % 6) * 6 + (x % 6)] < 5 && c.get(x, y) === c.get(12, 6)) c.pixel(x, y, INK_C);
  const data = new Int32Array(FW * FH);
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) { const v = c.get(x, y); data[y * FW + x] = v === c.get(0, 0) ? -1 : v; }
  return { w: FW, h: FH, data };
})();

/** The fist with its knuckles at (kx, ky) (left-middle), and the arm to the right edge. */
export function fist(g, kx, ky, F) {
  const x = Math.round(kx), y = Math.round(ky - FH / 2);
  // the forearm: an inked sleeve back to the glass edge, toned, with speed lines along it
  const ax = x + FW - 1;
  if (ax < W) {
    g.fillRect(ax, y + 2, W - ax, 18, INK_C);
    g.fillRect(ax, y + 4, W - ax, 14, PAPER_C);
    for (let j = 0; j < 3; j++) {
      const yy = y + 7 + j * 4, off = (F * 3 + j * 11) % 23;
      g.fillRect(ax + off, yy, 9, 1, INK_C);
    }
    g.fillRect(ax + 6, y + 2, 3, 18, INK_C);       // the cuff
  }
  g.blit(FIST, x, y);
}
