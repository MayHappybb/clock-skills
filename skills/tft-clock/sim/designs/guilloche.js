// Guilloche: the glass is a banknote of the Bank of Hours, and the time is its
// denomination. Big engraved figures (a Didone cut drawn for this grid: a 2 px
// keyline, a white line inside it, and horizontal ruling whose weight follows
// the form, solid in the shadows, broken where the light falls) stand on a
// guilloche underprint, either side of an oval vignette, inside a frame of
// interlaced lathe bands, with a windowed security thread carrying microprint.
//
// Always alive: the rose engine's rings of the underprint slide round the
// vignette, each against its neighbours, and swell in a slow wave; the two
// families of the frame bands drift apart so their moire travels along the
// note; the thread's microprint runs and a glint of inverted lines passes
// along it; in the vignette a lighthouse's beam swings out to one side and the
// other through the ruled sky, the lamp flashing as it faces us, over a moving
// sea (on the reverse a sheaf of wheat sways in a ruled field).
//
// Minute: from :57.6 every figure that changes is burnished away on one
// schedule, by fraction of its own ink (between-line ruling first, then each
// hatch line from its ends towards its middle, the keyline last), while the
// underprint closes back over its ground at the same pace; by :59.9 the slot
// is plain underprint. After :00 the burin cuts the new one: its whole keyline
// at once, in dashes that grow together all round, then the hatching ploughed
// across in parallel, each line by its own point, throwing a burr. Nothing of
// the new figure shows before :00.
//
// The underprint is drawn only in pieces at least ~14 px long between the
// figures' moats and the vignette's frame, so the ground stays long quiet
// curves round the figures and never breaks into scraps.
//
// Hour: once the new figures are cut the note turns over, a flat flip, its
// edge running across the glass with the other side behind it: even hours
// show the front (green ink on cream, the lighthouse), odd hours the reverse
// (the same two colours swapped, the sheaf of wheat). The digits stay pinned,
// legible on either side of the edge. On the front the lamp then gives the
// hour's character, one flash per hour; on the reverse a gust runs through
// the wheat.
//
// Two colours, all day: banknote green #1d5a3c and note-paper cream #efe6c8,
// the intaglio ink and its paper. Engraving is already a 1-bit art: every tone
// is line weight and density, never grey. Night only dims the backlight.
//
// Cost: the frame is built as a 1-bit mask and written once as two colours.
// Underprint: 12 rings, ~6.5k table-sine samples run-filtered against a
// keep-clear mask; figures: four byte-table
// lookups over their boxes; all charged to g.cost.box. During the 2.9 s flip
// both sides are built (~4.3 ms on esp32c3). Flash: figure tables 20 x 2
// bytes per pixel, role and burnish rank (~81 KB), sine table 2 KB, art and
// frame tables a few KB. RAM: two 12.8 KB masks, a 12.8 KB keep-clear mask.

import { to565, clockFields, previousMinute } from '../js/kit.js';
import { figureSet, ROLE, HK, PAD } from './guilloche-glyphs.js';
import { W, H, SIN, COS_OFF, strip, VX, VY, OX, OY, DISC, LIGHT } from './guilloche-art.js';

const BAYER = Uint8Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);
const INK = to565(0x1d5a3c), PAPER = to565(0xefe6c8);
const BIG = figureSet(28, 60, 11, 4), SMALL = figureSet(22, 46, 9, 3.5);
const SLOTS = [
  { x: 5, y: 10, set: BIG }, { x: 34, y: 10, set: BIG },
  { x: 110, y: 17, set: SMALL }, { x: 134, y: 17, set: SMALL },
];
// row parity of each set on the glass (both slots of a set share it); the lit
// hatching's dots keep the phase of the set's first slot, so a figure's ink is
// the same in either slot
BIG.yp = (10 - PAD) & 1; BIG.xp = (5 - PAD) & 1;
SMALL.yp = (17 - PAD) & 1; SMALL.xp = (110 - PAD) & 1;
/** Ink of figure G at box pixel (x, y), whole: 1 or 0. */
function ink(G, set, x, y, r) {
  const role = r & 7;
  if (role === ROLE.KEY_O || role === ROLE.KEY_I) return 1;
  if (role !== ROLE.HATCH) return 0;
  const k = r >> 3;
  if (((y + set.yp) & 1) === 0) return k === HK.LIT ? (x + set.xp) & 1 : 1;
  return k === HK.SHADOW ? 1 : 0;
}
// The burnishing order: every ink pixel of a figure ranked 0..255 by when the
// burnisher takes it (between-line ruling first, then the lit dots, then each
// hatch line from its ends towards its middle, then the inner keyline, then the
// outer), so at any moment every vanishing figure has lost the same fraction of
// its own ink, a thin 1 no faster than a heavy 8. Built once; on the hardware
// this byte table replaces the run table in flash.
for (const set of [BIG, SMALL])
  for (const G of set) {
    const ids = [], sc = [];
    for (let y = 0; y < G.h; y++)
      for (let x = 0; x < G.w; x++) {
        const i = y * G.w + x, r = G.role[i];
        if (!ink(G, set, x, y, r)) continue;
        const role = r & 7, b = BAYER[((y & 3) << 2) | (x & 3)] / 16;
        let v;
        if (role === ROLE.KEY_O) v = 5 + b;
        else if (role === ROLE.KEY_I) v = 4 + b;
        else {
          const ru = G.run[i], cent = ru < 128 ? ru / 128 : (255 - ru) / 128;
          if (((y + set.yp) & 1) === 1) v = 0.4 * b;
          else if ((r >> 3) === HK.LIT) v = 0.5 + 0.4 * b;
          else v = 1 + 2.4 * cent + 0.3 * b;
        }
        ids.push(i); sc.push(v);
      }
    const ord = ids.map((_, k) => k).sort((a, b) => sc[a] - sc[b]);
    G.rank = new Uint8Array(G.w * G.h);
    for (let k = 0; k < ord.length; k++) G.rank[ids[ord[k]]] = Math.floor((k * 256) / ord.length);
  }
const MA = new Uint8Array(W * H), MB = new Uint8Array(W * H);
let M = MA;   // the side being engraved this pass
const LEGEND = strip('BANK OF HOURS * PAYABLE * ');
const TX = 65;   // the security thread's left column

let work = 0;   // own loop work this frame, charged to the estimate as box pixels

// ------------------------------------------------------------ the rose engine
// the underprint: the rose engine's rings round the medallion, each ring two
// curves woven into a chain of lenses, r = R + A sin(kθ + φ), on ovals that
// fit the strip. The lathe turns them, each ring against its neighbours.
const RINGS = 12;
const ringAx = (j) => 23.5 + 5.5 * j, ringAy = (j) => 35.5 + 4.5 * j;
const RIPPLE = { per: 10, A: 1.4, n: 1, tw: 0.5 }, RIPPLE_B = { per: 13, A: 1.7, n: 1, tw: 0.2 };
const PERIM = Array.from({ length: RINGS }, (_, j) => 6.2832 * Math.sqrt((ringAx(j) ** 2 + ringAy(j) ** 2) / 2));
// Where the rings may run: 0 open ground, 1 kept clear (the figures with their
// moats, the vignette's frame), 2 a figure being burnished off or cut, whose
// ground the rings show through (cleared there by the figure, with a dither).
// A ring is drawn only in pieces at least LMIN samples (~14 px) long between
// kept-clear pixels, so where the figures cut it, the ground keeps its long
// quiet curves and never breaks into scraps. 
const B = new Uint8Array(W * H), RUN = new Int16Array(1024), LMIN = 21;
function ringPlot(j, P, t) {
  const ax = ringAx(j), ay = ringAy(j), k = Math.round(PERIM[j] / P.per);
  const ns = Math.ceil(PERIM[j] * 1.5), step = 1024 / ns;
  const A = P.A * (1 + 0.22 * SIN[((t * 170 - j * 110) | 0) & 1023] / 4096);   // breathing, a 6 s swell rolling outward
  for (let c = 0; c < P.n; c++) {
    const ph = c * 512 + j * P.tw * 512 + (j & 1 ? -1 : 1) * t * (10 * 1024 / P.per);   // chains slide 10 px/s
    let n = 0;
    for (let i = 0; i <= ns; i++) {
      let q = -1;
      if (i < ns) {
        const a = i * step, ti = a | 0, o = A * SIN[((k * a + ph) | 0) & 1023] / 4096;
        const x = VX + 0.5 + ((ax + o) * SIN[ti]) / 4096;
        const y = VY + 0.5 - ((ay + o) * SIN[(ti + COS_OFF) & 1023]) / 4096;
        if (x >= 3 && x < 157 && y >= 7 && y < 73) q = (y | 0) * W + (x | 0);
      }
      const b = q < 0 ? 1 : B[q];
      if (b === 0) { RUN[n++] = q; continue; }
      if (n >= LMIN) for (let m = 0; m < n; m++) M[RUN[m]] = 1;
      n = 0;
      if (b === 2) M[q] = 1;
    }
    work += ns * 7;
  }
}
// the medallion's frame: a 2 px keyline, a paper line, a 1 px rule
const FRAME = (() => {
  const a = [], clear = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const r = Math.hypot((x + 0.5 - VX) / (OX + 0.5), (y + 0.5 - VY) / (OY + 0.5));
    const d = (r - 1) * (OX + OY) / 2;     // ~ px outside the picture
    if ((d >= 0 && d < 2) || (d >= 3 && d < 4)) a.push(y * W + x);
    else if (d >= 2 && d < 6.5) clear.push(y * W + x);
  }
  return { ink: Int16Array.from(a), clear: Int16Array.from(clear) };
})();
function rosette(t, P, st) {
  B.fill(0);
  for (let k = 0; k < FRAME.clear.length; k++) B[FRAME.clear[k]] = 1;
  for (let k = 0; k < FRAME.ink.length; k++) B[FRAME.ink[k]] = 1;
  for (let k = 0; k < 4; k++) {
    const S = SLOTS[k], G = S.set[st[k].n], ox = S.x - PAD, oy = S.y - PAD, v = st[k].mode ? 2 : 1;
    for (let y = 0; y < G.h; y++)
      for (let x = 0; x < G.w; x++) if ((G.role[y * G.w + x] & 7) !== ROLE.OUT) B[(oy + y) * W + ox + x] = v;
    work += G.w * G.h;
  }
  for (let j = 0; j < RINGS; j++) ringPlot(j, P, t);
  for (let k = 0; k < FRAME.clear.length; k++) M[FRAME.clear[k]] = 0;
  for (let k = 0; k < FRAME.ink.length; k++) M[FRAME.ink[k]] = 1;
}

// ------------------------------------------------------------ the frame border
function border(t) {
  for (let x = 0; x < W; x++) { M[x] = 1; M[6 * W + x] = 1; M[73 * W + x] = 1; M[79 * W + x] = 1; }
  for (let y = 7; y < 73; y++) { M[y * W] = 1; M[y * W + 2] = 1; M[y * W + 157] = 1; M[y * W + 159] = 1; }
  const pa = (t * 1230) | 0, pb = (-t * 745) | 0;   // 12 px/s one way, 8 px/s the other: the moire travels
  for (let x = 0; x < W; x++) {
    const a = (x * 1024) / 10, b = (x * 1024) / 11;
    const y1 = (3.5 + 2.3 * SIN[((a + pa) | 0) & 1023] / 4096) | 0;
    const y2 = (3.5 - 2.3 * SIN[((a + pa) | 0) & 1023] / 4096) | 0;
    const y3 = (3.5 + 2.3 * SIN[((b + pb + 256) | 0) & 1023] / 4096) | 0;
    const y4 = (3.5 - 2.3 * SIN[((b + pb + 256) | 0) & 1023] / 4096) | 0;
    M[y1 * W + x] = 1; M[y2 * W + x] = 1; M[y3 * W + x] = 1; M[y4 * W + x] = 1;
    M[(79 - y1) * W + x] = 1; M[(79 - y2) * W + x] = 1; M[(79 - y3) * W + x] = 1; M[(79 - y4) * W + x] = 1;
  }
  work += W * 16;
}

// ------------------------------------------------------------ the vignette
const HORIZON = 11;
function vignette(t, night, flashes) {
  // the lamp turns; seen from the side its beam swings out to one side, then the other
  const ox = VX - 7, oy = VY - 17, lx = ox + LIGHT.lx, ly = oy + LIGHT.ly;
  const pa = ((t * 0.8 * 163) | 0) & 1023, s = SIN[pa], c = SIN[(pa + COS_OFF) & 1023];
  const reach = (20 * (s < 0 ? -s : s)) >> 12, dir = s < 0 ? -1 : 1;
  // sky ruled, the beam a lane of bare paper through it; sea in moving wave lines
  const ws = (t * 420) | 0;
  for (let k = 0; k < DISC.n; k++) {
    const u = DISC.u[k], v = DISC.v[k];
    let ink;
    if (v < HORIZON) {
      ink = (v & 1) === 0 ? 1 : 0;
      const dx = (VX + u - lx) * dir, dy = VY + v - ly;
      const ady = dy < 0 ? -dy : dy;
      if (dx > 1 && dx <= reach && ady * 3 <= dx + 2) ink = (ady + 1) * 3 > dx + 2 ? 1 : 0;
    } else {
      const o = (SIN[(u * 70 + v * 300 - ws) & 1023] * 3) >> 13;   // -1..1
      ink = ((v + o) & 1) === 0 ? 1 : 0;
    }
    M[DISC.idx[k]] = ink;
  }
  work += DISC.n * 6;
  // the rock: solid, lit along its top edge
  for (let u = -8; u <= 7; u++) {
    const au = u < 0 ? -u - 0.5 : u + 0.5, top = 9 + ((au * au) / 6 | 0);
    for (let v = top; v < 27; v++) {
      const eu = au / OX, ev = (v + 0.5) / OY;
      if (eu * eu + ev * ev >= 1) break;
      M[(VY + v) * W + VX + u] = v === top || (u + v + 30) % 3 !== 0 ? 1 : 0;
    }
  }
  // the lighthouse
  for (let y = 0; y < LIGHT.h; y++)
    for (let x = 0; x < LIGHT.w; x++) {
      const p = LIGHT.px[y * LIGHT.w + x];
      if (p >= 0) M[(oy + y) * W + ox + x] = p;
    }
  // the lamp flashes as it faces us; lit all night
  const flash = flashes >= 0 ? flashes === 1 : c > 3300 || night > 0.5;
  if (flash) {
    // a burst: a disc of bare paper round the lantern, eight rays of light ruled through it
    for (let dy = -9; dy <= 9; dy++)
      for (let dx = -9; dx <= 9; dx++) {
        const r2 = dx * dx + dy * dy, x = lx + dx, y = ly + dy;
        const sx = x - ox, sy = y - oy;
        if (r2 > 81 || (sx >= 0 && sx < LIGHT.w && sy >= 0 && sy < LIGHT.h && LIGHT.px[sy * LIGHT.w + sx] >= 0)) continue;
        const ex = (x + 0.5 - VX) / OX, ey = (y + 0.5 - VY) / OY;
        if (ex * ex + ey * ey >= 1) continue;
        const ax = dx < 0 ? -dx : dx, ay = dy < 0 ? -dy : dy;
        M[y * W + x] = r2 > 4 && (dx === 0 || dy === 0 || ax === ay) ? 1 : 0;
      }
    M[ly * W + lx] = 1;
  }
}

// the reverse: a sheaf of wheat standing in a ruled field, swaying in the wind
const STALKS = 9;
function line(x0, y0, x1, y1, v) {
  let dx = x1 - x0, dy = y1 - y0;
  const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1;
  dx = dx < 0 ? -dx : dx; dy = dy < 0 ? -dy : dy;
  let err = dx - dy;
  for (;;) {
    M[y0 * W + x0] = v;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}
function sheaf(t, gust) {
  // sky ruled, the stubble field below in close horizontal lines
  const HZ = 15;
  for (let k = 0; k < DISC.n; k++) {
    const v = DISC.v[k];
    M[DISC.idx[k]] = v < HZ ? ((v + 30) % 3 === 0 ? 1 : 0) : (v & 1) === 0 ? 1 : 0;
  }
  work += DISC.n * 4;
  const by = VY + 19, ty = VY + 4, amp = 1 + gust * 2.5;
  // an hourglass of stalks: a spread foot, the tie, a fan of ears
  const EX = new Int16Array(STALKS), EY = new Int16Array(STALKS);
  for (let i = 0; i < STALKS; i++) {
    const c = i - 4, sw = (amp * SIN[((t * 260 + i * 90) | 0) & 1023]) / 4096;
    EX[i] = VX + Math.round(c * 3 + sw); EY[i] = VY - 16 + Math.round(c * c * 0.4);
  }
  for (let i = 0; i < STALKS; i++) {
    const c = i - 4, fx = VX + Math.round(c * 1.8), tx = VX + Math.round(c * 0.5);
    for (let d = -1; d <= 1; d++) { line(fx + d, by, tx + d, ty, 0); line(tx + d, ty, EX[i] + d, EY[i] + 4, 0); }
    for (let yy = -6; yy <= 5; yy++) for (let xx = -2; xx <= 2; xx++) M[(EY[i] + yy) * W + EX[i] + xx] = 0;
  }
  for (let i = 0; i < STALKS; i++) {
    const c = i - 4, fx = VX + Math.round(c * 1.8), tx = VX + Math.round(c * 0.5);
    line(fx, by, tx, ty, 1); line(tx, ty, EX[i], EY[i] + 4, 1);
  }
  for (let i = 0; i < STALKS; i++) {
    const ex = EX[i], ey = EY[i];
    // the ear: grains stacked in pairs, a beard of awns above
    for (let yy = -3; yy <= 3; yy++) {
      const full = (yy & 1) === 0 && yy > -3 && yy < 3;
      M[(ey + yy) * W + ex] = 1;
      if (full) { M[(ey + yy) * W + ex - 1] = 1; M[(ey + yy) * W + ex + 1] = 1; }
    }
    M[(ey - 5) * W + ex] = 1; M[(ey - 6) * W + ex - 1] = 1; M[(ey - 6) * W + ex + 1] = 1;
  }
  // the band round its waist
  for (let yy = ty - 1; yy <= ty + 2; yy++) for (let xx = VX - 4; xx <= VX + 4; xx++) M[yy * W + xx] = yy === ty || yy === ty + 1 ? 1 : 0;
  work += STALKS * 90;
}

// ------------------------------------------------------------ the security thread
// A windowed thread woven through the paper: where it surfaces it carries
// the bank's microprint, running down it; where it dives it shows as a dotted
// shadow. A glint (the thread's foil catching the light) runs along it now and
// then as a band of inverted lines.
function thread(t) {
  const gy = ((t * 45) % 240) - 80, L = LEGEND.cols, sc = (t * 6) | 0;
  for (let y = 0; y < H; y++) {
    const win = (y + 3) % 16 < 11;
    const col = (((y - sc) % L) + L) % L;
    const glint = y > gy - 5 && y < gy + 5 ? 1 : 0;
    for (let r = 0; r < 4; r++) {
      const v = win ? LEGEND.s[r * L + col] : r === 1 && (y & 1) === 0 ? 1 : 0;
      M[y * W + TX + 3 - r] = v ^ (win ? glint : 0);
    }
  }
  work += H * 4 * 3;
}

// ------------------------------------------------------------ the figures
// 4 x 4 ordered dither thresholds (0..15): the even way to thin or clear
const bay = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];
// keyline dash order: diagonal stripes 6 px apart, so the cut grows as dashes all round the figure
const dash = (x, y) => (x + y + 600) % 6;
const RAG = Float32Array.from([0, 2.1, 0.7, 2.8, 1.2, 0.2, 2.4, 1.6, 0.4, 2.9, 1.1, 0.1, 1.9, 0.8, 2.6, 1.4]);

/**
 * Engrave figure n in a slot. mode 0: whole. mode 1: burnished away, p 0..1:
 * every ink pixel goes when p passes its rank, so each figure keeps 1 - p of
 * its own ink, and the underprint returns over its ground (moat included) at
 * the same pace. mode 2: cut by the burin, p 0..1 (the ground cleared first,
 * then the whole keyline in dashes that grow all round at once, then the hatch
 * lines ploughed in parallel).
 */
function stamp(slot, n, mode, p) {
  const G = slot.set[n], set = slot.set, ox = slot.x - PAD, oy = slot.y - PAD;
  // how much of the ground is cleared of underprint, 0..16
  const clr = mode === 1 ? (1 - p) * 16 : mode === 2 ? (p / 0.12) * 16 : 16;
  const cut = (p * 256) | 0;
  // burin: the keyline grows in dashes, then the comb crosses
  const dO = mode === 2 ? (p / 0.22) * 6 : 6, dI = mode === 2 ? ((p - 0.1) / 0.22) * 6 : 6;
  const front = mode === 2 ? ((p - 0.3) / 0.66) * (G.w + G.h * 0.25 + 6) - 3 : 1e9;
  for (let y = 0; y < G.h; y++) {
    const yy = oy + y, slant = (G.h - y) * 0.25;
    for (let x = 0; x < G.w; x++) {
      const xx = ox + x, i = y * G.w + x;
      const r = G.role[i], role = r & 7;
      if (role === ROLE.OUT) continue;
      let v = ink(G, set, x, y, r);
      if (mode === 1) { if (v && G.rank[i] < cut) v = 0; }
      else if (mode === 2) {
        if (role === ROLE.KEY_O) v = dO > dash(xx, yy) ? 1 : 0;
        else if (role === ROLE.KEY_I) v = dI > dash(xx, yy) ? 1 : 0;
        else if (role === ROLE.HATCH) {
          // each line is ploughed by its own point, a little ahead or behind its neighbours;
          // the point throws up a burr on the line above it
          const ahead = x + slant + RAG[(yy >> 1) & 15] - front;
          if (ahead > 0 || ((yy & 1) === 1 && ahead > -5)) v = 0;
          if ((yy & 1) === 1 && ahead > 0) {
            const below = x + slant + RAG[((yy + 1) >> 1) & 15] - front;
            if (below > -1 && below <= 0.6) v = 1;
          }
        }
      }
      if (v || clr > bay(xx, yy)) M[yy * W + xx] = v;
    }
  }
  work += G.w * G.h * 4;
}

// What each slot shows at second s of the minute. Nothing of the new figure
// shows before :00 (not even its bare ground): the old one is burnished off
// while the underprint closes over it, the same schedule for every figure that
// changes.
const BURN0 = 57.6, BURN1 = 59.9, CUT1 = 2.5;
const ST = Array.from({ length: 4 }, () => ({ n: 0, mode: 0, p: 0 }));
function slotStates(f, prev, next) {
  const s = f.sec, cur = f.hh + f.mm, pv = prev.hh + prev.mm, nx = next.hh + next.mm;
  for (let k = 0; k < 4; k++) {
    const c = +cur[k], o = +pv[k], n = +nx[k], q = ST[k];
    q.n = c; q.mode = 0; q.p = 0;
    if (n !== c && s >= BURN0) { q.mode = 1; q.p = Math.min(1, (s - BURN0) / (BURN1 - BURN0)); }
    else if (o !== c && s < CUT1) { q.mode = 2; q.p = s / CUT1; }
  }
  return ST;
}
function figures(st) {
  for (let k = 0; k < 4; k++) stamp(SLOTS[k], st[k].n, st[k].mode, st[k].p);
}

// ------------------------------------------------------------ the two sides
// Even hours show the front (ink on paper, the lighthouse); odd hours the
// reverse (the same two colours swapped: paper on an inked ground, the sheaf).
// At the hour, once the new hour figures are cut, the note turns over: a flat
// flip, the edge running left to right with the new side behind it.
const FLIP0 = 2.8, FLIP1 = 5.7, FLASH0 = 6.0;
function side(buf, rev, t, f, prev, next, night, hourS) {
  M = buf;
  M.fill(0);
  const st = slotStates(f, prev, next);
  border(t);
  rosette(t, rev ? RIPPLE_B : RIPPLE, st);
  if (rev) sheaf(t, hourS >= FLASH0 && hourS < FLASH0 + 4 ? SIN[(((hourS - FLASH0) / 4) * 512) | 0] / 4096 : 0);
  else {
    // after a turn to the front the lamp gives the hour's character: h12 flashes
    let fl = -1;
    if (hourS >= FLASH0 && hourS < FLASH0 + 0.6 * 12) {
      const u = (hourS - FLASH0) / 0.6, n = u | 0;
      fl = n < f.h12 && u - n < 0.4 ? 1 : 0;
    }
    vignette(t, night, fl);
  }
  thread(t);
  figures(st);
}

export default {
  name: 'Guilloche',
  blurb: 'A banknote of the Bank of Hours: the time is its engraved denomination; burnished off and re-cut by the burin each minute, turned over each hour.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, t = (f.minuteKey % 1440) * 60 + f.sec;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    work = 0;
    const prev = previousMinute(ctx.date), next = clockFields(new Date(ctx.date.getTime() + 60000));
    const hourS = prev.h !== f.h ? f.sec : -1, nowRev = (f.h & 1) === 1, wasRev = (prev.h & 1) === 1;
    const flipping = hourS >= 0 && hourS < FLIP1 && nowRev !== wasRev;
    const buf = g.buf;
    if (!flipping) {
      side(MA, nowRev, t, f, prev, next, ctx.night, hourS);
      const on = nowRev ? PAPER : INK, off = nowRev ? INK : PAPER;
      for (let i = 0; i < W * H; i++) buf[i] = MA[i] ? on : off;
    } else {
      side(MA, wasRev, t, f, prev, next, ctx.night, -1);
      const u = hourS < FLIP0 ? 0 : (hourS - FLIP0) / (FLIP1 - FLIP0);
      const X = hourS < FLIP0 ? -99 : ((u * u * (3 - 2 * u)) * (W + 12) - 6) | 0;
      if (X >= 0) side(MB, nowRev, t, f, prev, next, ctx.night, -1);
      const aOn = wasRev ? PAPER : INK, aOff = wasRev ? INK : PAPER, bOn = nowRev ? PAPER : INK, bOff = nowRev ? INK : PAPER;
      for (let y = 0, i = 0; y < H; y++)
        for (let x = 0; x < W; x++, i++) {
          if (x < X) buf[i] = MB[i] ? bOn : bOff;
          else if (x === X) buf[i] = INK;
          else if (x === X + 1) buf[i] = PAPER;
          else if (x < X + 6) buf[i] = ((y + x) & 1) === 0 ? INK : (MA[i] ? aOn : aOff);   // the lifting edge, in shade
          else buf[i] = MA[i] ? aOn : aOff;
        }
    }
    g.cost.px += W * H; g.cost.box += work + W * H;
  },
};
