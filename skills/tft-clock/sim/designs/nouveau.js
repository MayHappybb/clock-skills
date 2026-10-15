// Nouveau: an Art Nouveau poster in the manner of Mucha, and the time is the
// muse's hair. She sits at the centre before her halo, eyes closed, a gold
// circlet in her copper hair; four locks of that hair stream out to either
// side, and each lock is drawn into a numeral (nouveau-glyphs.js: tall Art
// Nouveau figures whose terminals whip out and taper to a hair's point, the
// 0's tip wrapping over its root, the 8 crossing itself). The rest of her
// hair fills the poster as long faint lines unwinding from her head, the way
// Mucha fills a whole sheet with a woman's hair. Gold frame, mosaic halo, a
// sage robe, two Madonna lilies at her shoulders.
//
// The time is alive: every lock ripples continuously along its length, its
// strands and sheen stream from root to tip, and on every beat a gust runs
// down each lock (it swells and bows as the front passes, inner locks first,
// outer a beat-fraction later), with a softer ripple running back on the
// off-beat; the tapered tips swing widest. The halo's mosaic ratchets one
// tile a second, its two rows turning against each other; the loose hair
// waves outward; the lilies nod. Every 15 s a stronger gust: all the hair
// heaves and lily petals blow out from her head across the poster.
//
// Minute turn (:59.1 to :00.9): the breeze lifts the changing lock; it frays
// into five fibres that whirl in big waves while the lock itself thins away,
// the fibres slide over to the new numeral's line as they wave, settle on it,
// and the lock fills in round them. The old numeral holds until ~:59.5, the
// new one reads from ~:00.4. Hour: the poster blooms: she opens her eyes,
// the halo spins up three turns, gold rays open out of it across the ground,
// her loose hair turns gold, the lilies open into stars, then all settles.
//
// Palette: a Mucha colour lithograph, flat muted pastels with gold and a
// fine dark brown keyline; no shading anywhere. The four palettes are his
// 'Times of the Day' (1899): morning awakening (primrose and green), the
// brightness of day (cream and gold), evening reverie (rose and lilac) and
// night's rest (slate blue, the copper hair brightened so it stays the
// strongest thing on the glass, the backlight at 55 %). The copper locks with
// their dark keyline and a moat of plain ground are the highest contrast.
// Hard pixels throughout (a print); only the turn's fibres and the lilies AA.
//
// Cost: one integer pass for the poster (a palette-index map, with two zone
// lookups for the loose hair and the mosaic), each lock shaded from its
// precomputed field with per-sample tables (~14 integer ops a pixel of its
// 33 x 60 box), the fibres as bilinear splats. Flash: glyph fields 79 KB,
// glyph samples 12 KB, poster maps 51 KB: ~142 KB. RAM: the frame buffer plus
// ~2 KB of per-frame tables. No per-minute caches; every frame is built cold.
import { clockFields, sin, to565 } from '../js/kit.js';
import { GLYPHS, FW, FH, MARGIN, NONE } from './nouveau-glyphs.js';
import { W, H, N, C, NCOL, BASE, PSI, RHO, ANG, PLAIN, Z_GROUND, Z_ROW1, Z_ROW2, Z_GROUT, PALETTES } from './nouveau-poster.js';
import { strands, petals, lily, eyes } from './nouveau-fx.js';

const PAL565 = new Uint16Array(64);

// slot box origins (top-left of the 19 x 46 glyph box): the outer locks fall lower
const SLOT_X = [10, 40, 101, 131], SLOT_Y = [18, 12, 12, 18];

const DQ = new Int16Array(256), RQ = new Int16Array(256), DASH = new Uint8Array(256);
const DPSI = new Int16Array(256), WID = new Uint8Array(256);
for (let r = 0; r < 256; r++) WID[r] = Math.min(255, Math.round((256 * 30) / (Math.PI * Math.max(r, 8)) * 1.05));

const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

function lockTables(gl, s, slot, scale, gust) {
  const beat = Math.floor(s), bt = s - beat - (slot === 0 || slot === 3 ? 0.12 : 0);
  const front = bt * 150;
  const fa = Math.floor(s * 15), fb = Math.floor(s * 12), fh = Math.floor(s * 20);
  for (let l = 0; l < gl.n; l++) {
    const tp = gl.taper[l];
    const x = (l - front) / 15, pulse = x > -3 && x < 3 ? Math.exp(-x * x) : 0;
    // the off-beat: a softer ripple running back from the tip to the root
    const x2 = (gl.n - l - (bt - 0.5) * 150) / 15, back = x2 > -3 && x2 < 3 ? Math.exp(-x2 * x2) : 0;
    const tail = 1 + 1.4 * (1 - tp);
    const d = ((0.8 + 0.5 * gust) * sin(l * 0.26 - s * 4.6 + slot * 1.7) + 1.4 * pulse - 0.9 * back) * tail;
    DQ[l] = Math.round(d * 8);
    RQ[l] = Math.round((3.0 + 0.8 * pulse + 0.4 * back) * tp * scale * 8);
    DASH[l] = ((l + fa) % 11 < 7 ? 1 : 0) | ((l + fb + 5) % 13 < 8 ? 2 : 0) | ((l - fh + 600) % 19 < 6 || pulse > 0.5 ? 4 : 0);
  }
}

function drawLock(g, gl, ox, oy) {
  const buf = g.buf, S1 = gl.S1, L1 = gl.L1, S2 = gl.S2, L2 = gl.L2, P = PAL565;
  let n = 0;
  for (let fy = 0; fy < FH; fy++) {
    const y = oy + fy;
    if (y < 0 || y >= H) continue;
    for (let fx = 0; fx < FW; fx++) {
      const x = ox + fx;
      if (x < 0 || x >= W) continue;
      const k = fy * FW + fx, l1 = L1[k];
      if (l1 === NONE) continue;
      n++;
      let c = -1, moat = false;
      const o = S1[k] - DQ[l1], a = o < 0 ? -o : o, r = RQ[l1];
      if (a < r) c = interior(o, DASH[l1]);
      else if (a < r + 8) c = C.OUT;
      else {
        moat = a < r + 20;
        const l2 = L2[k];
        if (l2 !== NONE) {
          const o2 = S2[k] - DQ[l2], a2 = o2 < 0 ? -o2 : o2, r2 = RQ[l2];
          if (a2 < r2) c = interior(o2, DASH[l2]);
          else if (a2 < r2 + 8) c = C.OUT;
          else if (a2 < r2 + 20) moat = true;
        }
      }
      const i = y * W + x;
      if (c >= 0) buf[i] = P[c];
      else if (moat) buf[i] = P[PLAIN[BASE[i]]];
    }
  }
  g.cost.box += n * 14; g.cost.px += n;
}

function interior(o, dash) {
  if (o > -4 && o < 4) return dash & 4 ? C.LT : C.HAIR;
  if (o <= -8 && o > -16) return dash & 1 ? C.DK : C.HAIR;
  if (o >= 8 && o < 16) return dash & 2 ? C.DK : C.HAIR;
  return C.HAIR;
}

const TILE1 = [C.GOLDLT, C.TEAL], TILE2 = [C.GOLD, C.ROSE, C.TILE2];

function background(g, s, gust, hourT, bloom) {
  const buf = g.buf, P = PAL565;
  // her loose hair: lines that wave outward from her head
  for (let r = 0; r < 256; r++) {
    const amp = r < 28 ? 0 : (1.6 + 2.4 * gust) * sm((r - 28) / 30);
    DPSI[r] = Math.round((amp * sin(r * 0.17 - s * 2.4) * 256 * 30) / (Math.PI * Math.max(r, 8)));
  }
  // the mosaic turns a tile on every beat, the two rows against each other
  const b = Math.floor(s), u = sm((s - b) / 0.45);
  // at the hour the halo spins up: three extra turns of the mosaic, eased
  const spin = hourT < 0 ? 0 : 72 * sm((hourT - 0.4) / 7.5);
  const rot1 = Math.round((b + u + spin) * 256), rot2 = Math.round(-(b + u + spin) * 256);
  const pG = P[C.GROUND], pL = P[C.LINE], pO = P[C.OUT], pR = P[C.GOLDLT];
  // and gold rays open out of the halo across the ground
  const rayR = bloom > 0 ? 30 + 70 * sm((hourT - 0.5) / 2.2) * bloom : 0, rayRot = Math.round(hourT * 6) & 255;
  for (let i = 0; i < N; i++) {
    const z = BASE[i];
    if (z < 40) buf[i] = P[z];
    else if (z === Z_GROUND) {
      const r = RHO[i];
      if (r < rayR && ((ANG[i] * 2 + rayRot) & 15) < 3) buf[i] = pR;
      else buf[i] = ((PSI[i] + DPSI[r]) & 255) < WID[r] ? pL : pG;
    } else if (z === Z_ROW1) {
      const t = ANG[i] * 24 + rot1 + 0x10000, fr = t & 255;
      buf[i] = fr < 52 ? pO : P[TILE1[(t >> 8) & 1]];
    } else if (z === Z_ROW2) {
      const t = ANG[i] * 30 + rot2 + 0x10000, fr = t & 255;
      buf[i] = fr < 52 ? pO : P[TILE2[((t >> 8) % 3)]];
    } else buf[i] = pO;
  }
  g.cost.px += N; g.cost.box += N * 4;
}

// ------------------------------------------------------------ palette of the hour
const PAL = new Array(NCOL).fill(0);
const mixc = (a, b, t) => {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t);
  const gg = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * t);
  return ((r + 0.5) << 16) | ((gg + 0.5) << 8) | (bl + 0.5);
};
function buildPalette(f, night, bloom) {
  const hm = f.h + f.m / 60 + f.sec / 3600;
  // which of Mucha's times of day, crossfaded over the first half hour of each
  let a = 'evening', b = 'evening', t = 0;
  if (hm >= 7 && hm < 11) { a = hm < 7.5 ? 'evening' : 'morning'; b = 'morning'; t = hm < 7.5 ? (hm - 7) / 0.5 : 1; }
  else if (hm >= 11 && hm < 17) { a = 'morning'; b = 'day'; t = Math.min(1, (hm - 11) / 0.5); }
  else if (hm >= 17) { a = 'day'; b = 'evening'; t = Math.min(1, (hm - 17) / 0.5); }
  const A = PALETTES[a], B = PALETTES[b], NT = PALETTES.night;
  for (let i = 0; i < NCOL; i++) {
    let c = t >= 1 ? B[i] : mixc(A[i], B[i], t);
    if (night > 0) c = mixc(c, NT[i], night);
    PAL[i] = c;
  }
  if (bloom > 0) {
    // the poster blooms: the loose hair turns gold, the ground warms, the halo glows
    PAL[C.LINE] = mixc(PAL[C.LINE], PAL[C.GOLD], bloom);
    PAL[C.GROUND] = mixc(PAL[C.GROUND], PAL[C.CREAM], bloom * 0.6);
    PAL[C.HALO] = mixc(PAL[C.HALO], 0xfff2c0, bloom);
    PAL[C.TEAL] = mixc(PAL[C.TEAL], PAL[C.GOLDLT], bloom * 0.7);
  }
  for (let i = 0; i < NCOL; i++) PAL565[i] = to565(PAL[i]);
}

const FIB = [0, 0, 0];

export default {
  name: 'Nouveau',
  blurb: "A Mucha poster: the time is the muse's hair, four copper locks that ripple on every beat and fray into the breeze at the turn.",
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, t0 = ctx.date.getTime();
    ctx.lcd.backlight(1 - 0.45 * ctx.night);
    // the turn: from :59.1 to :00.9 of the next minute
    let oldD = f.hh + f.mm, newD = oldD, u = -1;
    if (s >= 59.1) { const nx = clockFields(new Date(t0 + 60000)); newD = nx.hh + nx.mm; u = (s - 59.1) / 1.8; }
    else if (s < 0.9) { const pv = clockFields(new Date(t0 - 60000)); oldD = pv.hh + pv.mm; u = (s + 0.9) / 1.8; }
    const hourT = f.m === 0 ? s : -1;
    const bloom = hourT < 0 ? 0 : sm((hourT - 0.6) / 1.2) * (1 - sm((hourT - 8.5) / 2));
    buildPalette(f, ctx.night, bloom);
    // a gust every 15 s
    const gt = s % 15, gust = s > 5 && s < 55 && gt < 3.4 ? sm(gt / 0.6) * (1 - sm((gt - 2.2) / 1.2)) : 0;
    background(g, s, gust, hourT, bloom);
    // her lilies: buds that sway on the beat, opening for the hour
    const open = hourT < 0 ? 0 : sm((hourT - 1.0) / 1.6) * (1 - sm((hourT - 9.5) / 1.8));
    const LC = { out: PAL[C.OUT], white: PAL[C.WHITE], leaf: PAL[C.LEAF], stamen: PAL[C.STAMEN] };
    const bob = sin((s - Math.floor(s)) * Math.PI) * 0.5;
    lily(g, 68.5, 60.5, open, -0.8 - bob - gust * 1.2, LC);
    lily(g, 91.5, 60.5, open, 0.8 + bob + gust * 1.2, LC);
    if (hourT >= 1.6 && hourT < 8.4) eyes(g, true, { out: PAL[C.OUT], skin: PAL[C.SKIN], iris: PAL[C.TEAL] });
    FIB[0] = PAL565[C.DK]; FIB[1] = PAL565[C.HAIR]; FIB[2] = PAL565[C.LT];
    let ops = 0;
    for (let i = 0; i < 4; i++) {
      const bx = SLOT_X[i], by = SLOT_Y[i];
      if (u >= 0 && oldD[i] !== newD[i]) {
        const ga = GLYPHS[+oldD[i]], gb = GLYPHS[+newD[i]];
        if (u < 0.34) { lockTables(ga, s, i, 1 - sm((u - 0.04) / 0.28), gust); drawLock(g, ga, bx - MARGIN, by - MARGIN); }
        if (u > 0.66) { lockTables(gb, s, i, sm((u - 0.68) / 0.26), gust); drawLock(g, gb, bx - MARGIN, by - MARGIN); }
        ops += strands(g, ga, gb, bx, by, u, s, i < 2 ? -1 : 1, FIB);
      } else {
        const gl = GLYPHS[+(u >= 0 && s < 0.9 ? newD : oldD)[i]];
        lockTables(gl, s, i, 1, gust);
        drawLock(g, gl, bx - MARGIN, by - MARGIN);
      }
    }
    if (gust > 0) ops += petals(g, gt, Math.floor(s / 15), [PAL565[C.OUT], PAL565[C.WHITE]]);
    g.cost.box += ops;
  },
};
