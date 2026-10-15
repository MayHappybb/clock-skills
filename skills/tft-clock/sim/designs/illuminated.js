// Illuminated: an open book of hours on the desk, at night by a candle.
// The time is two kinds of initial, the way a manuscript ranks them: the
// hour is the great historiated initial filling the verso, numerals in
// raised, burnished gold on lapis with vermilion counters and white
// filigree, and small folk living in them (a snail in the 0, a knight
// climbing the 1, goldfinches in the bowls); the minutes are two "champ"
// initials on the recto, numerals painted in lapis and vermilion on squares
// of gold, set into the text under the rubric, which names the office being
// read (Ad matutinas ... Completorium, in a textura drawn for this panel).
//
// The gold is the point. Every gold pixel has a normal (the gesso is
// pillowed, the champs' edges are punched), and every frame it is lit by a
// moving candle: a broad sheen and a sharp glint slide across the leaf as
// the flame wanders, rims flash on the side facing it, and the vellum and
// pigments take the warm pool of its light. In the bas-de-page a hare with a
// sword goes at a snail, and thinks better of it. A gold ivy garland grows
// round the inside of the great initial's frame over the hour, a bud
// gliding at its tip; the new page starts bare.
//
// Minute turn: the scribe's left hand comes in with a pen-knife and scrapes
// the old champ off the vellum, line by line, before :00 (paler, scuffed
// vellum left behind). After :00 a sheet of gold leaf flutters down onto the
// place, glinting as it tilts; the loose leaf flakes away from its edges
// leaving the burnished square; then the right hand's quill paints the new
// numeral along its pen path, and runs the white-lead line after it.
// Hour: the page turns. The recto lifts, stands and falls over onto the
// verso, lit and shadowed by the candle (the gold on it flashes as it
// tilts), the new hour's initial on its back; the new recto is ready-gilded
// and the quill paints the minutes on it at once.
//
// Palette: the illuminator's own: vellum, iron-gall ink, ultramarine,
// vermilion, white lead, verdigris, and gold leaf as a ramp from umber
// shadow to white-hot glint. Day lights it all evenly (a warm room); night
// is the candle only, a warm pool on deep brown, the far page sinking into
// a dark that is still vellum-coloured, not grey.
//
// Hard pixels for the page (cut gold edges, inked keylines, the text);
// anti-aliasing for everything that moves: hands, folk, the falling leaf.
// The page is lit by one integer pass over the glass (my own loop, priced
// below in cost.box); gold, light and turn all live in it.

import { hex, R, G, B, sin, cos, clamp, noise, rand, ease, progress, lerp, clockFields } from '../js/kit.js';
import { W, H, GUT, P, HB, HD, HG, MB, K, CHAMPS, MGLYPH, VINE, buildPage } from './illuminated-page.js';
import { pathAt } from './illuminated-glyphs.js';
import { quillHand, knifeHand, snail, bird, knight, hare, C } from './illuminated-art.js';

const N = W * H;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v * 16 + 8);

// frame buffers: albedo, gold mask, normals (and a copy for the turning leaf)
const A = new Uint16Array(N), GM = new Uint8Array(N), NX = new Int8Array(N), NY = new Int8Array(N);
const LA = new Uint16Array(N), LGM = new Uint8Array(N), LNX = new Int8Array(N), LNY = new Int8Array(N);

// ------------------------------------------------------------ light tables
const GW = 41, GH = 21, CELL = 4;
const LGRID = new Int32Array(GW * GH);
const LROW = new Int32Array(W);
const LR = new Int32Array(256), LG = new Int32Array(256), LB = new Int32Array(256);
const GOLDR = new Uint8Array(256), GOLDG = new Uint8Array(256), GOLDB = new Uint8Array(256);
const GB = new Int32Array(256);
const SPEC = new Int32Array(2048);
const HX = new Int32Array(W), HY = new Int32Array(H);
const COLK = new Int32Array(W);      // per column: page curvature at the gutter, the leaf's shading and shadow
const TILT = new Int32Array(W);      // per column: added to the gold's nx (the leaf's slope)
const STATIC_COLK = new Int32Array(W);
for (let x = 0; x < W; x++) {
  const u = (x + 0.5 - GUT) / 5.5;
  STATIC_COLK[x] = Math.round(256 * (1 - 0.5 * Math.exp(-u * u)));
}
const GOLD_STOPS = [[0, '1e1006'], [50, '4c300c'], [100, '8a6018'], [150, 'c08e2a'], [195, 'e6bc4e'], [225, 'f8de8a'], [248, 'fff4cc'], [255, 'fffcf2']]
  .map(([p, c]) => [p, hex(c)]);
for (let b = 0; b < 256; b++) {
  let k = 1;
  while (GOLD_STOPS[k][0] < b) k++;
  const [p0, c0] = GOLD_STOPS[k - 1], [p1, c1] = GOLD_STOPS[k], u = (b - p0) / (p1 - p0 || 1);
  GOLDR[b] = R(c0) + (R(c1) - R(c0)) * u; GOLDG[b] = G(c0) + (G(c1) - G(c0)) * u; GOLDB[b] = B(c0) + (B(c1) - B(c0)) * u;
}
for (let i = 0; i < 2048; i++) {
  const e = i * 64;
  SPEC[i] = Math.round(78 * Math.exp(-e / (2 * 46 * 46)) + 140 * Math.exp(-e / (2 * 13 * 13)));
}

// per-slot tables for the turn: the knife's scrape order, the loose leaf's flake order
const MARGIN = 3;
const SCRAPE = MB.map(({ w, h }) => Uint8Array.from({ length: w * h }, (_, i) => {
  const x = i % w, y = (i / w) | 0;
  return Math.round(255 * clamp((y + 0.5) / h * 0.82 + rand(x, y, 21) * 0.16 + (x % 3 === 0 ? 0.01 : 0), 0, 1));
}));
const FLAKE = MB.map(({ w, h }) => {
  const fw = w + 2 * MARGIN, fh = h + 2 * MARGIN, a = new Uint8Array(fw * fh);
  for (let y = 0; y < fh; y++)
    for (let x = 0; x < fw; x++) {
      const dx = Math.max(MARGIN - x, x - (w + MARGIN - 1), 0), dy = Math.max(MARGIN - y, y - (h + MARGIN - 1), 0);
      const dout = Math.max(dx, dy);
      // ragged edge: some of the margin was never covered
      const ragged = MARGIN - 0.6 - 1.6 * rand(x >> 1, y >> 1, 5);
      a[y * fw + x] = dout === 0 ? 255 : dout > ragged ? 0 : 1 + Math.round(254 * clamp((1 - dout / (MARGIN + 0.5)) * 0.65 + rand(x, y, 6) * 0.35, 0, 1));
    }
  return { fw, fh, a };
});
const GRAIN = Int8Array.from({ length: 256 }, (_, i) => Math.round((rand(i, 3, 9) - 0.5) * 30));

// ------------------------------------------------------------ pages (two kept: the turn needs both)
const PAGES = new Map();
function page(h) {
  let pg = PAGES.get(h);
  if (!pg) {
    pg = buildPage(h, String(h).padStart(2, '0'));
    PAGES.set(h, pg);
    if (PAGES.size > 2) PAGES.delete(PAGES.keys().next().value);
  }
  return pg;
}

// ------------------------------------------------------------ the schedule
// Times are seconds from the turn (negative before :00).
const SHEET = 0.42, FLAKE_T = 0.5, PAINT = 0.85, WHITE = 0.6;
const LIFT = 1.25, FALL = 0.5;
/** What the turn from fields a to fields b does. */
function plan(a, b) {
  const hour = a.h !== b.h;
  const ch = [a.mm[0] !== b.mm[0], a.mm[1] !== b.mm[1]];
  const p = { hour, ch, scrape: [null, null], lay: [null, null], gilded: hour, old: a, neu: b };
  if (hour) {
    p.lay[0] = FALL + 0.05; p.lay[1] = FALL + 0.05 + PAINT + WHITE * 0.6;
    return p;
  }
  if (ch[0] && ch[1]) { p.scrape[0] = [-3.0, -1.6]; p.scrape[1] = [-1.55, -0.15]; p.lay[0] = 0; p.lay[1] = 1.45; }
  else { const k = ch[0] ? 0 : 1; p.scrape[k] = [-2.3, -0.15]; p.lay[k] = 0; }
  return p;
}
/** Paint and white-line spans of slot k (absolute, from the turn). */
function paintSpan(p, k) {
  const l = p.lay[k];
  const p0 = p.gilded ? l : l + SHEET + FLAKE_T;
  return [p0, p0 + PAINT, p0 + PAINT + WHITE];
}

// ------------------------------------------------------------ composing the champs
function writeGold(i, nx, ny) { GM[i] = 1; NX[i] = nx; NY[i] = ny; }

/** A champ at rest, or being scraped (sp 0..1), or being laid (τ seconds into its lay). */
function composeChamp(slot, d, mode, v, pg, gilded, cost) {
  const L = CHAMPS[slot][d], { x: x0, y: y0, w, h } = MB[slot];
  const scr = SCRAPE[slot], sp = (v * 255) | 0;
  let pp = 2, wp = 2, goldOn = true;
  if (mode === 2) {
    const tau = v;
    goldOn = gilded || tau >= SHEET;
    const p0 = gilded ? 0 : SHEET + FLAKE_T;
    pp = ((tau - p0) / PAINT) * 1.06;
    wp = (tau - p0 - PAINT) / WHITE;
  }
  const ppi = (pp * 255) | 0, wpi = (wp * 255) | 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const j = y * w + x, i = (y0 + y) * W + x0 + x;
      if (mode === 1 && scr[j] < sp) { GM[i] = 0; A[i] = pg.scraped[i]; continue; }
      if (mode === 2 && !goldOn) { GM[i] = 0; A[i] = pg.scraped[i]; continue; }
      const kd = L.kind[j];
      if (L.gold[j]) { writeGold(i, L.nx[j], L.ny[j]); continue; }
      // painted pixels: gold until the quill reaches them
      const ord = L.ord[j];
      if (kd === K.LINE && ord === 0 && (x === 0 || y === 0 || x === w - 1 || y === h - 1)) {
        if (ppi > 0) { GM[i] = 0; A[i] = L.alb[j]; } else writeGold(i, GRAIN[j & 255], GRAIN[(j * 7) & 255]);
        continue;
      }
      if (ord < ppi) {
        GM[i] = 0;
        A[i] = kd === K.WHITE && ord >= wpi ? L.alb2[j] : L.alb[j];
      } else writeGold(i, GRAIN[j & 255], GRAIN[(j * 7) & 255]);
    }
  cost.box += w * h * 5;
}

/** The loose margin of a laid sheet, flaking off its edges (fp 0..1). */
function composeFlake(slot, fp, cost) {
  const { fw, fh, a } = FLAKE[slot], x0 = MB[slot].x - MARGIN, y0 = MB[slot].y - MARGIN, f = (fp * 255) | 0;
  for (let y = 0; y < fh; y++)
    for (let x = 0; x < fw; x++) {
      const v = a[y * fw + x];
      if (v === 0 || v === 255 || v <= f) continue;
      const i = (y0 + y) * W + x0 + x;
      writeGold(i, GRAIN[(x * 13 + y) & 255] * 2, GRAIN[(x + y * 11) & 255] * 2);
    }
  cost.box += fw * fh * 3;
}

/**
 * The falling sheet of leaf over slot k, q 0..1 of its fall: bigger and
 * turned while high, its shadow cast away from the candle; fluttering tilt
 * in its normal, so it flashes as it comes down.
 */
function composeSheet(slot, tau, Lt, cost) {
  const q = clamp(tau / SHEET, 0, 1), up = 1 - q * q;
  const { x: bx, y: by, w, h } = MB[slot];
  const cx = bx + w / 2 + 5 * up * sin(tau * 5 + slot), cy = by + h / 2 - 3 * up;
  const s = 1 + 0.22 * up, rot = 0.35 * up * sin(tau * 6 + 1 + slot);
  const hw = (w / 2 + MARGIN) * s, hh = (h / 2 + MARGIN) * s;
  const tx = (90 * up * sin(tau * 16)) | 0, ty = (70 * up * cos(tau * 13)) | 0;
  const c = cos(rot), sn = sin(rot);
  // shadow: away from the light, further while the sheet is high
  const dx = cx - Lt.lx, dy = cy - Lt.ly, dl = Math.sqrt(dx * dx + dy * dy) + 1;
  const off = 1.5 + 9 * up, sx = cx + (dx / dl) * off, sy = cy + (dy / dl) * off;
  const R0 = Math.ceil(Math.sqrt(hw * hw + hh * hh)) + 1;
  for (let pass = 0; pass < 2; pass++) {
    const ox = pass ? cx : sx, oy = pass ? cy : sy;
    const xa = Math.max(0, Math.floor(ox - R0)), xb = Math.min(W - 1, Math.ceil(ox + R0));
    const ya = Math.max(0, Math.floor(oy - R0)), yb = Math.min(H - 1, Math.ceil(oy + R0));
    for (let y = ya; y <= yb; y++)
      for (let x = xa; x <= xb; x++) {
        const px = x + 0.5 - ox, py = y + 0.5 - oy;
        const u = px * c + py * sn, v = -px * sn + py * c;
        if (u < -hw || u > hw || v < -hh || v > hh) continue;
        const i = y * W + x;
        if (pass === 0) {
          if (!GM[i]) { const a = A[i]; A[i] = ((((a >> 11) * 12) >> 4) << 11) | (((((a >> 5) & 63) * 12) >> 4) << 5) | (((a & 31) * 12) >> 4); }
        } else writeGold(i, clamp(tx + GRAIN[(x * 5 + y * 3) & 255], -127, 127), clamp(ty + GRAIN[(x + y * 7) & 255], -127, 127));
      }
    cost.box += (xb - xa + 1) * (yb - ya + 1) * 6;
  }
}

// ------------------------------------------------------------ the rinceau
/** The ivy garland grown to `u` (0..1 of the hour) on the verso in the frame buffers. */
function composeVine(u, cost) {
  const lim = (u * 65535) | 0, n = VINE.idx.length;
  let k = 0;
  for (; k < n && VINE.ord[k] <= lim; k++) {
    const i = VINE.idx[k];
    if (VINE.leaf[k]) { GM[i] = 1; NX[i] = VINE.nx[k]; NY[i] = VINE.ny[k]; }
    else if (!GM[i]) A[i] = VINE.stem;
  }
  cost.box += k * 3 + 20;
}
/** The bud at the growing tip: a gold point gliding along the stem. */
function vineBud(g, u, tn) {
  const p = VINE.path, f = clamp(u, 0, 1) * (p.length - 1), j = Math.min(p.length - 2, f | 0), r = f - j;
  const x = p[j][0] + (p[j + 1][0] - p[j][0]) * r, y = p[j][1] + (p[j + 1][1] - p[j][1]) * r;
  g.fillCircle(x, y, 1.05, tn(hex('f8e08a')), { aa: true });
  g.fillCircle(x - 0.3, y - 0.3, 0.45, 0xfffcf0, { aa: true, a: 0.8 });
}

// ------------------------------------------------------------ the page turn
const D_EYE = 260;
/**
 * The leaf at angle th (0 = flat on the recto, PI = flat on the verso),
 * drawn into the frame buffers from the leaf source (front: the old recto,
 * in LA..; back: the new verso, in pgB), with perspective, shading and the
 * gold's tilt; and its shadow on the page it is coming over.
 */
function composeLeaf(th, pgB, Lt, cost) {
  const wl = GUT, cw = wl * cos(th), sw = wl * sin(th), front = th < Math.PI / 2;
  // light on the leaf: its normal against the direction to the candle
  const nxl = front ? -sin(th) : sin(th), nzl = front ? cos(th) : -cos(th);
  const lxd = Lt.lx - GUT, lzd = Lt.lz + 20, ll = Math.sqrt(lxd * lxd + lzd * lzd);
  const lam = clamp((nxl * lxd + nzl * lzd) / ll, 0, 1);
  const tilt = (127 * (front ? -sin(th) : sin(th))) | 0;
  const edge = GUT + (cw * D_EYE) / (D_EYE - sw);   // screen x of the free edge
  const xa = Math.max(0, Math.floor(Math.min(GUT, edge))), xb = Math.min(W, Math.ceil(Math.max(GUT, edge)));
  for (let x = xa; x < xb; x++) {
    const X = x + 0.5 - GUT;
    const den = cw * D_EYE + X * sw;
    if (Math.abs(den) < 1e-3) continue;
    const u = (X * D_EYE) / den;
    if (u < 0 || u > 1) continue;
    const k = D_EYE / (D_EYE - u * sw);
    const src = front ? Math.min(W - 1, GUT + ((u * wl) | 0)) : Math.max(0, GUT - 1 - ((u * wl) | 0));
    // shade: lambert plus a little ambient, darker toward the hinge as the leaf curls off it
    COLK[x] = (256 * (0.38 + 0.62 * lam) * (0.82 + 0.18 * Math.min(1, u * 4))) | 0;
    TILT[x] = tilt;
    const ik = 1 / k;
    for (let y = 0; y < H; y++) {
      const sy = (40 + (y + 0.5 - 40) * ik) | 0, i = y * W + x, s = sy * W + src;
      if (front) { A[i] = LA[s]; GM[i] = LGM[s]; NX[i] = LNX[s]; NY[i] = LNY[s]; }
      else { A[i] = pgB.alb[s]; GM[i] = pgB.gold[s]; NX[i] = pgB.nx[s]; NY[i] = pgB.ny[s]; }
    }
    // the free edge: a darker line of the leaf's thickness
    if (u > 0.985) for (let y = 0; y < H; y++) A[y * W + x] = 0x8c4a;
  }
  // edge-on: a sliver of the leaf's edge standing at the gutter
  if (xb - xa < 2) for (let y = 0; y < H; y++) { const i = y * W + GUT; A[i] = 0xc5ce; GM[i] = 0; COLK[GUT] = 220; }
  // shadow on the page below, beyond the free edge: deeper as the leaf stands up
  const sh = Math.abs(sin(th));
  if (front) {
    for (let x = xb; x < W; x++) { const d = (x - xb) / (4 + 30 * sh); if (d > 1) break; COLK[x] = (COLK[x] * (1 - 0.55 * sh * (1 - d))) | 0; }
  } else {
    // over the old verso: the falling leaf darkens what it is about to cover
    // (it is between the candle and the page: the whole uncovered verso goes dark at once)
    const deep = clamp((th - Math.PI * 0.49) / (Math.PI * 0.05), 0, 1);
    for (let x = xa - 1; x >= 0; x--) { const d = (xa - x) / 90; COLK[x] = (COLK[x] * (1 - 0.93 * deep * (1 - 0.4 * d))) | 0; }
  }
  cost.box += (xb - xa) * H * 6 + W * 4;
}

// ------------------------------------------------------------ the light
function light(g, tod, night) {
  const day = 1 - night;
  // the flame drifts in the draught; the light it throws wanders the spread
  // (at night the candle stands closer to the middle of the book, its pool wider, so both pages keep their time)
  const wander = 1 - 0.55 * night;
  const lx = 80 + (62 * sin(tod * 0.21) + 10 * sin(tod * 0.53 + 1)) * wander;
  const ly = 38 + (26 * sin(tod * 0.17 + 2) + 6 * sin(tod * 0.61)) * wander;
  const lz = 46 + 16 * night;
  const fl = 0.93 + 0.05 * noise(tod * 7.3, 3) + 0.03 * noise(tod * 13.1, 5);
  const lz2 = lz * lz;
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const dx = i * CELL - lx, dy = j * CELL - ly;
      const q = lz2 / (dx * dx + dy * dy + lz2);
      LGRID[j * GW + i] = (255 * q * q * fl) | 0;
    }
  g.cost.box += GW * GH * 12;
  const ar = 0.9 * day + 0.13 * night, ag = 0.88 * day + 0.11 * night, ab = 0.84 * day + 0.16 * night;
  const cr = 0.25 * day + 1.35 * night, cg = 0.17 * day + 0.88 * night, cb = 0.07 * day + 0.4 * night;
  for (let f = 0; f < 256; f++) {
    const u = f / 255;
    LR[f] = (256 * (ar + cr * u)) | 0; LG[f] = (256 * (ag + cg * u)) | 0; LB[f] = (256 * (ab + cb * u)) | 0;
    GB[f] = (day * 142 + night * 62 + (day * 26 + night * 116) * u) | 0;
  }
  const ks = (127 / (2 * lz)) * 1.15;
  for (let x = 0; x < W; x++) HX[x] = clamp(((lx - x - 0.5) * ks) | 0, -400, 400);
  for (let y = 0; y < H; y++) HY[y] = clamp(((ly - y - 0.5) * ks) | 0, -400, 400);
  g.cost.box += 256 * 8 + (W + H) * 4;
  return { lx, ly, lz, fl, spec: (day * 0.85 + night) * fl };
}

/** The candle's light level at a point (0..255), from the grid. */
function levelAt(x, y) {
  const i = clamp(Math.round(x / CELL), 0, GW - 1), j = clamp(Math.round(y / CELL), 0, GH - 1);
  return Math.min(255, (LGRID[j * GW + i] * COLK[clamp(x | 0, 0, W - 1)]) >> 8);
}
/** A colour function for a figure at (x, y): its colours under the light there. */
function toner(x, y, fade = 1) {
  const f = levelAt(x, y), lr = LR[f], lg = LG[f], lb = LB[f];
  return (c) => (Math.min(255, (R(c) * lr) >> 8) << 16) | (Math.min(255, (G(c) * lg) >> 8) << 8) | Math.min(255, (B(c) * lb) >> 8);
}

/** Light the albedo and the gold into the frame: per pixel a lerp, three multiplies, a dither. */
function composite(g, Lt) {
  const buf = g.buf, specK = (Lt.spec * 256) | 0;
  let gold = 0;
  for (let y = 0; y < H; y++) {
    const fy = (y + 0.5) / CELL, j = Math.min(GH - 2, fy | 0), v = ((fy - j) * 256) | 0;
    for (let i = 0; i < GW - 1; i++) {
      const a0 = LGRID[j * GW + i] + (((LGRID[(j + 1) * GW + i] - LGRID[j * GW + i]) * v) >> 8);
      const a1 = LGRID[j * GW + i + 1] + (((LGRID[(j + 1) * GW + i + 1] - LGRID[j * GW + i + 1]) * v) >> 8);
      for (let q = 0; q < CELL; q++) LROW[i * CELL + q] = a0 + (((a1 - a0) * (q * 2 + 1)) >> 3);
    }
    const hy = HY[y], row = y * W, by = (y & 3) << 2;
    for (let x = 0; x < W; x++) {
      const i = row + x, t = BAYER[by | (x & 3)], ck = COLK[x];
      let f = (LROW[x] * ck) >> 8;
      if (f > 255) f = 255;
      let r, gg, b;
      if (GM[i]) {
        const ex = NX[i] + TILT[x] - HX[x], ey = NY[i] - hy;
        let e = (ex * ex + ey * ey) >> 6;
        if (e > 2047) e = 2047;
        let lv = GB[f] + ((((SPEC[e] * specK) >> 8) * (64 + f)) >> 8);
        lv = (lv * ck) >> 8;
        if (lv > 255) lv = 255;
        r = GOLDR[lv]; gg = GOLDG[lv]; b = GOLDB[lv];
        gold++;
      } else {
        const a = A[i];
        r = (((a >> 11) << 3) * LR[f]) >> 8; gg = ((((a >> 5) & 63) << 2) * LG[f]) >> 8; b = (((a & 31) << 3) * LB[f]) >> 8;
        if (ck < 256) { r = (r * ck) >> 8; gg = (gg * ck) >> 8; b = (b * ck) >> 8; }
        if (r > 255) r = 255; if (gg > 255) gg = 255; if (b > 255) b = 255;
      }
      buf[i] = (((r * 7967 + t * 255) >> 16) << 11) | (((gg * 16191 + t * 255) >> 16) << 5) | ((b * 7967 + t * 255) >> 16);
    }
  }
  g.cost.box += N * 16 + gold * 8;
}

// ------------------------------------------------------------ the folk
const GX = (k, u) => HD[k].x + HG.pad + u * HG.w, GY = (k, v) => HD[k].y + HG.pad + v * HG.h;
/** The inhabitant of hour numeral d in slot k. */
function inhabitant(g, k, d, tod, sec, fade) {
  if (fade <= 0.02) return;
  const ph = tod + k * 7.3 + d;
  const peck = Math.max(0, sin(ph * 1.1)) ** 6, hop = 1.6 * Math.max(0, sin(ph * 0.45 + 1)) ** 12;
  const at = (u, v) => [GX(k, u), GY(k, v)];
  let x, y;
  switch (d) {
    case 0: { [x, y] = at(0.5 + 0.07 * sin(ph * 0.11), 0.885); snail(g, x, y, sin(ph * 0.11 + 1.6) > 0 ? 1 : -1, ph * 2, toner(x, y), 0.75); return; }
    case 1: case 7: {
      // the knight climbs over the minute
      // climbs for 50 s, then slides back down to the foot before the minute is out
      const u = sec < 50 ? ease.inOutQuad(sec / 50) : 1 - ease.inOutQuad(clamp((sec - 50) / 8, 0, 1));
      // (on the roomier side: left of the first numeral's stem, right of the second's)
      const side = k === 0 ? 1 : -1;
      if (d === 1) [x, y] = at(k === 0 ? 0.31 : 0.8, lerp(0.84, 0.36, u));
      else { [x, y] = at(lerp(0.66, 0.98, u), lerp(0.9, 0.36, u)); }
      knight(g, x, y, d === 1 ? side : -1, sec < 50 ? sec * 5.5 : 0, toner(x, y), 1.15);
      return;
    }
    case 2: [x, y] = at(0.66, 0.875); break;
    case 3: [x, y] = at(0.48, 0.035); break;
    case 4: [x, y] = at(0.47, 0.64); break;
    case 5: { [x, y] = at(0.62 + 0.06 * sin(ph * 0.1), 0.03); snail(g, x, y, -1, ph * 2, toner(x, y), 0.75); return; }
    case 6: [x, y] = at(0.5, 0.855); break;
    case 8: [x, y] = at(0.5, 0.405); break;
    case 9: [x, y] = at(0.5, 0.5); break;
  }
  bird(g, x, y, k === 0 ? 1 : -1, peck, hop, toner(x, y), 0.85);
}

/** The bas-de-page: a hare with a sword and a snail, a little play every 20 s. */
const BASE_Y = 77;
function drollery(g, tod, fade) {
  if (fade <= 0.02) return;
  const ph = tod % 20;
  const tnG = toner(118, BASE_Y);
  // ground: a hairline of grass with a few tufts
  g.thickLine(86, BASE_Y + 0.5, 150, BASE_Y + 0.5, 0.8, tnG(C.green), { aa: true, a: 0.85 * fade });
  for (let k = 0; k < 7; k++) {
    const gx = 90 + k * 9.3;
    g.thickLine(gx, BASE_Y + 0.3, gx - 1, BASE_Y - 1.8, 0.6, tnG(C.green), { aa: true, a: 0.8 * fade });
    g.thickLine(gx + 1, BASE_Y + 0.3, gx + 1.6, BASE_Y - 2.2, 0.6, tnG(C.green), { aa: true, a: 0.8 * fade });
  }
  // the hare: hops in (0-6 s), raises the sword (6-8.5), the snail rears (8.5-10), he backs off in hops (10-14), rests
  let hx, hop = 0, swing = 0;
  const hopArc = (u) => 2.8 * Math.abs(sin(u * Math.PI));
  if (ph < 6) { const u = ph / 6; hx = lerp(96, 118, ease.inOutQuad(u)); hop = hopArc(ph / 0.75); }
  else if (ph < 10) { hx = 118; swing = ease.inOutQuad(progress(ph, 6.2, 7.6)) * (1 - 0.15 * Math.max(0, sin((ph - 7.6) * 9)) * (ph > 7.6 ? 1 : 0)); }
  else if (ph < 14) { const u = (ph - 10) / 4; hx = lerp(118, 96, ease.inOutQuad(u)); hop = hopArc((ph - 10) / 0.5) * 1.2; swing = 1 - ease.inOutQuad(progress(ph, 10, 11.5)); }
  else { hx = 96; }
  const horn = 1 + 0.9 * (ph > 8.5 && ph < 12 ? Math.sin(Math.PI * clamp((ph - 8.5) / 3.5, 0, 1)) : 0);
  const snx = 140 - 2.5 * sin((tod / 20) * Math.PI * 2) - (horn - 1) * 1.5;
  snail(g, snx, BASE_Y, -1, tod * 1.7, toner(snx, BASE_Y), 1.05, horn);
  hare(g, hx, BASE_Y, 1, swing, hop, toner(hx, BASE_Y - 6), 1);
}

// ------------------------------------------------------------ the hands
/** A keyframed track: [[t, x, y, a], ...] -> position at time s, smoothstepped between keys. */
function track(keys, s) {
  if (s <= keys[0][0]) return keys[0];
  for (let k = 1; k < keys.length; k++) {
    if (keys[k][0] >= s) {
      const a = keys[k - 1], b = keys[k], u = (s - a[0]) / (b[0] - a[0] || 1), e = u * u * (3 - 2 * u);
      return [s, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e, a[3] + (b[3] - a[3]) * e];
    }
  }
  return keys[keys.length - 1];
}
const KNIFE_OFF = [92, 116, -0.75], QUILL_OFF = [176, 108, 0.2];

/** Where the knife is at τ (from the turn) for plan p, or null. */
function knifeAt(p, tau) {
  const sp = p.scrape.filter(Boolean);
  if (!sp.length) return null;
  const t0 = sp[0][0], t1 = sp[sp.length - 1][1];
  if (tau < t0 - 0.7 || tau > t1 + 0.7) return null;
  // approach to the first slot's top, then scrubbing strokes along each slot's rows, then away
  const slotOf = (k) => MB[k];
  if (tau < t0) {
    const k0 = p.scrape[0] ? 0 : 1, b = slotOf(k0);
    return [...track([[t0 - 0.7, ...KNIFE_OFF], [t0, b.x + 4, b.y + 2, -0.6]], tau).slice(1), 0];
  }
  if (tau > t1) {
    const k1 = p.scrape[1] ? 1 : 0, b = slotOf(k1);
    return [...track([[t1, b.x + b.w - 4, b.y + b.h - 2, -0.6], [t1 + 0.7, ...KNIFE_OFF]], tau).slice(1), 0];
  }
  for (let k = 0; k < 2; k++) {
    const s = p.scrape[k];
    if (!s || tau < s[0] || tau > s[1] + (k === 0 && p.scrape[1] ? 0.05 : 0)) continue;
    const b = slotOf(k), u = clamp((tau - s[0]) / (s[1] - s[0]), 0, 1);
    const stroke = sin((tau - s[0]) * 2 * Math.PI * 2.2);
    const x = b.x + b.w / 2 + (b.w / 2 - 3) * stroke, y = b.y + 2 + (b.h - 4) * u;
    return [x, y, -0.6 + 0.12 * stroke, Math.max(0, stroke) ** 8];
  }
  // between the slots: across the gap
  const b0 = slotOf(0), b1 = slotOf(1), u = clamp((tau - p.scrape[0][1]) / (p.scrape[1][0] - p.scrape[0][1]), 0, 1);
  return [lerp(b0.x + b0.w / 2, b1.x + 4, u), lerp(b0.y + b0.h - 2, b1.y + 2, u), -0.6, 0];
}

/** Where the quill tip is at τ for plan p, or null: arriving, painting each numeral along its path, then the white line, leaving. */
function quillAt(p, tau) {
  const ks = [0, 1].filter((k) => p.lay[k] !== null);
  if (!ks.length) return null;
  const spans = ks.map((k) => [k, ...paintSpan(p, k)]);
  const t0 = spans[0][1], t1 = spans[spans.length - 1][3];
  if (tau < t0 - 0.8 || tau > t1 + 0.8) return null;
  const tip = (k, s) => {
    const gl = MGLYPH[+p.neu.mm[k]], b = MB[k];
    const [x, y] = pathAt(gl.path, clamp(s, 0, 1));
    return [b.x + Math.round((b.w - gl.w) / 2) + x, b.y + Math.round((b.h - gl.h) / 2) + y];
  };
  if (tau < t0) { const [x, y] = tip(spans[0][0], 0); return track([[t0 - 0.8, ...QUILL_OFF], [t0, x, y, 0]], tau).slice(1); }
  if (tau > t1) { const [x, y] = tip(spans[spans.length - 1][0], 1); return track([[t1, x, y, 0], [t1 + 0.8, ...QUILL_OFF]], tau).slice(1); }
  for (let n = 0; n < spans.length; n++) {
    const [k, a, b, c] = spans[n];
    if (tau >= a && tau <= b) { const [x, y] = tip(k, (tau - a) / PAINT * 1.06); return [x, y, 0.05 * sin(tau * 9)]; }
    if (tau > b && tau <= c) { const [x, y] = tip(k, (tau - b) / WHITE); return [x, y, 0.04 * sin(tau * 11)]; }
    const nx = spans[n + 1];
    if (nx && tau > c && tau < nx[1]) {
      const [x0, y0] = tip(k, 1), [x1, y1] = tip(nx[0], 0);
      return track([[c, x0, y0, 0], [nx[1], x1, y1, 0]], tau).slice(1);
    }
  }
  return null;
}

// ------------------------------------------------------------ the face
export default {
  name: 'Illuminated',
  blurb: 'A book of hours by candlelight: gold-leaf initials tell the time; a scribe scrapes and re-gilds the minutes, and the page turns on the hour.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, night = ctx.night;
    const tod = f.h * 3600 + f.m * 60 + s;
    ctx.lcd.backlight(1 - 0.55 * night);
    const date = ctx.date.getTime();
    const prev = clockFields(new Date(date - 60000)), next = clockFields(new Date(date + 60000));
    const pin = plan(prev, f), pout = plan(f, next);   // the turn behind us (τ = s) and ahead (τ = s - 60)
    const tin = s, tout = s - 60;
    const cost = g.cost;
    COLK.set(STATIC_COLK); TILT.fill(0);
    const Lt = light(g, tod, night);
    const grow = (f.m * 60 + s) / 3600;   // the garland's growth over the hour

    // which pages, and the leaf
    const pg = page(f.h);
    let leaf = null;   // [theta, back page]
    if (pout.hour && tout > -LIFT) leaf = [Math.PI / 2 * ease.inOutQuad(clamp((tout + LIFT) / LIFT, 0, 1)), null];
    else if (pin.hour && tin < FALL) {
      const u = clamp(tin / FALL, 0, 1);
      leaf = [Math.PI / 2 + Math.PI / 2 * u * u, pg];
    }

    if (leaf && leaf[0] < Math.PI / 2) {
      // lifting: the leaf front is this page with its champs as they stand
      A.set(pg.alb); GM.set(pg.gold); NX.set(pg.nx); NY.set(pg.ny);
      composeVine(grow, cost);
      composeChamp(0, +f.mm[0], 0, 0, pg, false, cost); composeChamp(1, +f.mm[1], 0, 0, pg, false, cost);
      LA.set(A); LGM.set(GM); LNX.set(NX); LNY.set(NY);
      // underneath: this verso, the next page's recto with its champs gilded and unpainted
      const np = page(next.h);
      for (let y = 0; y < H; y++) {
        const r0 = y * W + GUT, r1 = r0 + (W - GUT);
        A.set(np.alb.subarray(r0, r1), r0); GM.set(np.gold.subarray(r0, r1), r0); NX.set(np.nx.subarray(r0, r1), r0); NY.set(np.ny.subarray(r0, r1), r0);
      }
      for (let k = 0; k < 2; k++) composeChamp(k, +next.mm[k], 2, -1, np, true, cost);
      composeLeaf(leaf[0], null, Lt, cost);
      cost.px += N * 6;
    } else {
      // the page at rest, or after the fall: the old verso stays under the leaf until it lands
      A.set(pg.alb); GM.set(pg.gold); NX.set(pg.nx); NY.set(pg.ny);
      cost.px += N * 3;
      if (leaf) {
        const op = page(prev.h);
        for (let y = 0; y < H; y++) {
          const r0 = y * W, r1 = r0 + GUT;
          A.set(op.alb.subarray(r0, r1), r0); GM.set(op.gold.subarray(r0, r1), r0); NX.set(op.nx.subarray(r0, r1), r0); NY.set(op.ny.subarray(r0, r1), r0);
        }
        composeVine(1, cost);   // the old verso's garland, finished
      } else composeVine(grow, cost);
      for (let k = 0; k < 2; k++) {
        const d = +f.mm[k];
        if (pout.scrape[k] && tout > pout.scrape[k][0]) composeChamp(k, d, 1, progress(tout, pout.scrape[k][0], pout.scrape[k][1]) * 1.01, pg, false, cost);
        else if (pin.lay[k] !== null && tin - pin.lay[k] < SHEET + FLAKE_T + PAINT + WHITE + 0.1) {
          const tau = tin - pin.lay[k];
          composeChamp(k, d, 2, tau, pg, pin.gilded, cost);
          if (!pin.gilded && tau >= SHEET && tau < SHEET + FLAKE_T) composeFlake(k, (tau - SHEET) / FLAKE_T, cost);
          if (!pin.gilded && tau >= 0 && tau < SHEET) composeSheet(k, tau, Lt, cost);
        } else composeChamp(k, d, 0, 0, pg, false, cost);
      }
      if (leaf) composeLeaf(leaf[0], pg, Lt, cost);
    }
    composite(g, Lt);

    // the folk: they hide while the page turns, and come back after it
    let fade = 1;
    if (pout.hour) fade = 1 - progress(tout, -LIFT - 0.6, -LIFT);
    if (pin.hour) fade = progress(tin, FALL + 0.3, FALL + 1.1);
    if (!leaf) { const p = VINE.path[Math.min(VINE.path.length - 1, (grow * VINE.path.length) | 0)]; vineBud(g, grow, toner(p[0], p[1])); }
    for (let k = 0; k < 2; k++) inhabitant(g, k, +f.hh[k], tod, s, fade);
    drollery(g, tod, fade);

    // the hands
    const sdx = (x, y) => { const dx = x - Lt.lx, dy = y - Lt.ly, l = Math.sqrt(dx * dx + dy * dy) + 8; return [dx / l, dy / l]; };
    const kn = knifeAt(pout, tout) ?? knifeAt(pin, tin);
    if (kn) { const [sx, sy] = sdx(kn[0], kn[1]); knifeHand(g, kn[0], kn[1], kn[2], toner(kn[0] - 6, kn[1] + 6), sx, sy, kn[3]); }
    const qu = quillAt(pin, tin) ?? quillAt(pout, tout);
    if (qu) { const [sx, sy] = sdx(qu[0], qu[1]); quillHand(g, qu[0], qu[1], qu[2], toner(qu[0] + 6, qu[1] + 6), sx, sy); }
  },
};
