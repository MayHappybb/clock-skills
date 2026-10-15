// Bayeux: a stretch of the Bayeux Tapestry, the Norman fleet crossing the
// Channel. Two longships row left along the strip, as the tapestry draws
// them: striped clinker hulls, a dragon-headed stem and a curling stern, a
// row of shields along the gunwale. Their cargo is the time: the hour ship
// carries the hours, the minute ship the minutes, and every numeral is a
// thing out of the tapestry drawn as that numeral (bayeux-glyphs.js): a
// round shield with its studs and boss is 0, a tower with battlements, door
// and pennant 1, a horse's head on an arched neck 2, a bow with horn nocks
// 3, a lance with its gonfanon 4, a mast, yard and bellied striped sail 5,
// an oliphant horn 6, a Danish axe 7, an interlace knot 8, a bishop's
// crozier 9. Above them runs the Latin inscription, one for each hour of the
// day ("HIC NAVIGANT", "HIC FECERVNT PRANDIVM" shortened, "HIC NOX TACET"),
// in a stitched Romanesque capital alphabet drawn for this panel.
//
// Always alive: the camera keeps pace with the fleet, so the cloth runs past:
// both border friezes (beasts and birds between slanting bars) and the
// stitched wave lines of the sea slide right under the ships at a steady
// 6 px/s (the sea faster, it is nearer the keel), and the oars pull a stroke
// a second, which is the seconds.
//
// Minute turn: an embroiderer's needle comes down to each numeral that is
// about to change and unpicks it, in the reverse of the order it was made:
// the stem-stitch outline first, then the couching, then the laid wool,
// column by column; the pulled wool gathers on the needle's tail. All gone
// before :00. After :00 it stitches in the new numeral the way the tapestry
// was worked: laid wool in columns, couching bars across it, the outline
// last, the tail shrinking as the wool is used.
// Hour: Halley's star. As in the tapestry, the comet streaks across the top
// of the band, its flame streamers rippling, and the old caption is replaced
// by the one the tapestry gives it, ISTI MIRANT STELLA ("these men marvel at
// the star"), stitched in behind the comet as it passes; the fleet surges,
// rowing harder (the cloth runs 3.5 times as fast, then eases back); later
// the new hour's caption is stitched. The hours are re-stitched by needle
// as at any minute.
//
// Palette: the tapestry's own eight wools on undyed linen: madder
// terracotta, weld yellow, sage and a dark green, two woads (a light blue
// and a deep indigo), near-black. Flat fields only: the texture is the
// stitching (couching bars, tacks, the twisted stem-stitch outline) and the
// linen's weave, slubs and tide-marks. The numerals are all terracotta with
// an indigo outline, the strongest contrast on the cloth; everything else is
// quieter. Night (23-07) is the hanging in a dark hall: the backlight dims
// and a warm pool of candlelight falls on the middle of the band, the
// corners sinking to umber (a light table, not a black face).
//
// Hard pixels for everything stitched (it is a counted grid of wool); AA
// only for what moves over the cloth: the needles, the wool, the oars and
// the comet. The friezes and sea pan at sub-pixel offsets by blending the
// two neighbouring columns in integer RGB.
//
// Cost: every frame copies the cached cloth (12.8k px), blends 22 rows of
// friezes and sea, writes the numerals and ships from flash tables (a byte
// compare a pixel), and draws a few AA lines; at night one integer multiply
// a channel over the glass. Off the main canvas: one 25.6 KB cloth copy per
// hour's caption (a buffer fill, cached). Flash: numerals 10 x 25 x 40 px x
// 7 B = 70 KB plus their needle paths (u8 + 2 x u16 a stitch) ~33 KB; ships
// 2 x 72 x 36 x 7 B = 36 KB; linen 25.6 KB; friezes and sea 14 KB; candle
// light 38 KB; alphabet, captions and tree < 2 KB: about 220 KB.

import { clockFields, ease, progress, sin, cos } from '../js/kit.js';
import { WOOL, buildDigits, needleAt, to565 } from './bayeux-glyphs.js';
import { W, H, LINEN, TOPF, BOTF, FP, inscription, INSCRIPTIONS, STELLA } from './bayeux-cloth.js';
import { buildShip, SEA, SEA_P, SEA_H, GUNWALE } from './bayeux-ships.js';

const DIG = buildDigits(WOOL.terra, 0.92);
const SHIPS = [{ x: 2, y: 32, S: buildShip(72, WOOL.terra, 0) }, { x: 86, y: 32, S: buildShip(72, WOOL.terra, 2, ['sage', 'ochre', 'green'], 'lblue') }];
const SLOTS = [{ x: 12, y: 18 }, { x: 38, y: 18 }, { x: 96, y: 18 }, { x: 122, y: 18 }];
const INS_X = 80, INS_Y = 10, SEA_Y = 63;

// ------------------------------------------------------------ the still cloth, per inscription
const SCENES = new Map();
function scene(text) {
  let s = SCENES.get(text);
  if (s) return s;
  const b = new Uint16Array(LINEN);
  const line = (y, c) => { for (let x = 0; x < W; x++) b[y * W + x] = to565(c); };
  line(1, WOOL.green); line(8, WOOL.green); line(70, WOOL.green); line(79, WOOL.green);
  s = { buf: b, ins: inscription(text, INS_X, INS_Y) };
  SCENES.set(text, s);
  if (SCENES.size > 6) SCENES.delete(SCENES.keys().next().value);
  return s;
}

const STELLA_INS = inscription(STELLA, INS_X, INS_Y);
const UNPICK = [57.8, 59.72], STITCH = [0.12, 2.75];

// ------------------------------------------------------------ night: the hanging in a dark hall, by candlelight
// A per-pixel light table (flash, 3 x 12.8 KB bytes): a warm pool of candlelight
// low in the middle, falling to a deep umber at the corners, the blue of the
// wools muted as candlelight mutes it. Applied as one integer multiply a
// channel; faded in by ctx.night.
const NLR = new Uint8Array(W * H), NLG = new Uint8Array(W * H), NLB = new Uint8Array(W * H);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const dx = (x + 0.5 - 80) / 92, dy = (y + 0.5 - 50) / 58, r2 = dx * dx + dy * dy;
    const L = Math.max(0.3, 1 - 0.78 * r2) + ((x * 5 + y * 3) % 4) * 0.004;
    const i = y * W + x;
    NLR[i] = Math.min(255, Math.round(256 * L)); NLG[i] = Math.round(256 * L * 0.86); NLB[i] = Math.round(256 * L * 0.62);
  }
function candle(buf, night) {
  const nk = Math.round(night * 256);
  for (let i = 0; i < W * H; i++) {
    const v = buf[i];
    const kr = 256 - ((nk * (256 - NLR[i])) >> 8), kg = 256 - ((nk * (256 - NLG[i])) >> 8), kb = 256 - ((nk * (256 - NLB[i])) >> 8);
    buf[i] = ((((v >> 11) * kr) >> 8) << 11) | (((((v >> 5) & 63) * kg) >> 8) << 5) | (((v & 31) * kb) >> 8);
  }
}

// ------------------------------------------------------------ the friezes, panned with a fractional offset
function frieze(buf, rgb, P, h, y0, off) {
  const io = Math.floor(off), fw = ((off - io) * 256) | 0;
  for (let y = 0; y < h; y++) {
    const row = y * P, by = (y0 + y) * W;
    for (let x = 0; x < W; x++) {
      const k = (x + io) % P;
      let a = rgb[row + k], b = rgb[row + (k + 1) % P];
      if (a < 0 && b < 0) continue;
      const lv = LINEN[by + x], lin = (((lv >> 11) << 3) << 16) | ((((lv >> 5) & 63) << 2) << 8) | ((lv & 31) << 3);
      if (a < 0) a = lin; if (b < 0) b = lin;
      const r = (((a >> 16) & 255) * (256 - fw) + ((b >> 16) & 255) * fw) >> 8;
      const g = (((a >> 8) & 255) * (256 - fw) + ((b >> 8) & 255) * fw) >> 8;
      const bl = ((a & 255) * (256 - fw) + (b & 255) * fw) >> 8;
      buf[by + x] = ((r >> 3) << 11) | ((g >> 2) << 5) | (bl >> 3);
    }
  }
}

// ------------------------------------------------------------ a digit at stitch progress p (0..255)
function digit(buf, dg, x0, y0, p) {
  if (p <= 0) return 0;
  let n = 0;
  const w = dg.w, h = dg.h;
  for (let y = 0; y < h; y++) {
    const by = (y0 + y) * W + x0, row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      if (!dg.mask[i]) continue;
      if (p >= dg.t1[i]) buf[by + x] = dg.fin[i];
      else if (p >= dg.t0[i]) buf[by + x] = dg.lay[i];
      n++;
    }
  }
  return n;
}

// ------------------------------------------------------------ the needle and its wool
// A flat steel needle, keyed in indigo, lying at a slant with its eye up and
// to the right. The wool runs from the stitch at its point up through the eye
// and off as a loose tail: the tail is the wool itself, so it grows as a
// numeral is unpicked (the pulled wool gathers on it) and shrinks as the new
// one is stitched (the wool is used up).
const STEEL = 0xa7b0ba;
const NDX = 0.6, NDY = -0.8, NLEN = 12;
function needle(g, tx, ty, wool, tail, s, k) {
  const ex = tx + NDX * NLEN, ey = ty + NDY * NLEN;
  // the wool: from the point up to the eye, then the tail curling away up-right
  const pts = [[tx + 0.6, ty - 0.4], [ex - 1.2, ey + 3.2], [ex, ey + 1]];
  const n = Math.max(2, Math.round(tail / 3));
  let x = ex, y = ey + 1;
  for (let j = 1; j <= n; j++) {
    const u = j / n, a = -0.35 - 0.9 * u + 0.5 * sin(s * 3.1 + j * 0.9 + k);
    x += 3 * cos(a); y += 3 * sin(a) + 0.9 * u;
    pts.push([x, y]);
  }
  g.stroke(pts, 1.4, wool, { aa: true });
  // the needle
  g.thickLine(tx, ty, ex, ey, 2.6, WOOL.indigo, { aa: true });
  g.thickLine(tx + NDX * 0.6, ty + NDY * 0.6, ex - NDX * 0.4, ey - NDY * 0.4, 1.1, STEEL, { aa: true });
  g.thickLine(ex - NDX * 2.6, ey - NDY * 2.6, ex - NDX * 1, ey - NDY * 1, 0.8, WOOL.indigo, { aa: true });   // the eye
}

// ------------------------------------------------------------ Halley's star, as the tapestry stitches it
const COMET_T0 = 0.3, COMET_T1 = 7.8;
function cometX(s) { return 196 - 262 * (s - COMET_T0) / (COMET_T1 - COMET_T0); }
function cometY(x) { const u = (x - 70) / 120; return 13.4 + 4 * u * u; }
const TAIL = [WOOL.terra, WOOL.ochre, WOOL.sage, WOOL.lblue, WOOL.ochre, WOOL.terra];
function comet(g, s) {
  const hx = cometX(s), hy = cometY(hx);
  // the tail: six flame streamers fanning back from the head, rippling as it flies
  for (let k = 0; k < 6; k++) {
    const e = k - 2.5, len = 40 - Math.abs(e) * 6;
    const pts = [];
    for (let j = 0; j <= 8; j++) {
      const u = j / 8, x = hx + 3 + u * len;
      pts.push([x, cometY(x) + e * (0.7 + 2.1 * u) + 0.9 * u * sin(s * 8 + k * 1.9 - u * 6)]);
    }
    g.stroke(pts, 1.7 - 0.5 * (Math.abs(e) > 2 ? 1 : 0), TAIL[k], { aa: true });
  }
  // the head: a star in a keyed ring, rays round it
  g.fillCircle(hx, hy, 4.6, WOOL.indigo, { aa: true });
  g.fillCircle(hx, hy, 3.4, WOOL.ochre, { aa: true });
  g.fillCircle(hx, hy, 1.5, WOOL.terra, { aa: true });
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4 + s * 0.6;
    g.thickLine(hx + cos(a) * 4.4, hy + sin(a) * 4.4, hx + cos(a) * (k % 2 ? 6.2 : 7.6), hy + sin(a) * (k % 2 ? 6.2 : 7.6), 1.1, WOOL.indigo, { aa: true });
  }
}

// ------------------------------------------------------------ the fleet's pace
// The camera keeps pace with the fleet; the cloth runs past at V px/s. At the
// hour the fleet surges (pace x 3.5, a raised-cosine bump over SURGE s). The
// position is the integral, closed form: every past hour's surge adds a whole
// bump's distance.
const V = 6, SURGE_A = 0.6, SURGE_D = 9, SURGE_K = 2.5;
function surge(u) { return u <= 0 ? 0 : u >= 1 ? 0.5 : u / 2 - Math.sin(2 * Math.PI * u) / (4 * Math.PI); }
function pace(date, f, hourIn) {
  const t = date.getTime() / 1000, hours = Math.floor(t / 3600);
  const u = hourIn ? (f.sec - SURGE_A) / SURGE_D : 0;
  const dist = V * t + V * SURGE_K * SURGE_D * ((hours - (hourIn ? 1 : 0)) * 0.5 + surge(u));
  return dist;
}

export default {
  name: 'Bayeux',
  blurb: 'The Norman fleet in the Bayeux Tapestry: the ships carry the time as embroidered objects; a needle unpicks and restitches each minute, and Halley\'s star crosses at the hour.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, t = ctx.date.getTime() / 1000;
    ctx.lcd.backlight(1 - 0.45 * ctx.night);
    const prv = clockFields(new Date(ctx.date.getTime() - 60000)), nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm, old = prv.hh + prv.mm, nw = nxt.hh + nxt.mm;
    const sc = scene(INSCRIPTIONS[f.h]);
    const buf = g.buf;
    buf.set(sc.buf);
    g.cost.px += W * H;

    // the inscription: unpicked before the hour; the star stitches its own caption
    // behind it as it passes; then the new hour's caption is stitched in
    const hourIn = prv.h !== f.h && s < 16, hourOut = nxt.h !== f.h && s >= 57.6;
    let ins = sc.ins, lo = 0, hi = 1, behind = -1;
    if (hourOut) hi = 1 - ease.inOutQuad(progress(s, 57.6, 59.6));
    else if (hourIn) {
      if (s < 12.4) { ins = STELLA_INS; behind = cometX(s) + 2; }
      else if (s < 13.6) { ins = STELLA_INS; hi = 1 - ease.inOutQuad(progress(s, 12.4, 13.6)); }
      else hi = ease.inOutQuad(progress(s, 13.8, 15.6));
    }
    for (const [x, y, c, u] of ins) if (u >= lo && u < hi && x > behind) buf[y * W + x] = c;
    g.cost.blit += ins.length;

    // the friezes pan along
    // the camera keeps pace with the fleet rowing left: the cloth runs right past it
    const dist = pace(ctx.date, f, prv.h !== f.h);
    const off = (((-dist) % FP) + FP) % FP;
    frieze(buf, TOPF.rgb, FP, TOPF.h, 2, off);
    frieze(buf, BOTF.rgb, FP, BOTF.h, 71, (off + 40) % FP);
    frieze(buf, SEA, SEA_P, SEA_H, SEA_Y, ((((-dist * 1.6) % SEA_P) + SEA_P) % SEA_P));
    g.cost.box += (TOPF.h + BOTF.h + SEA_H) * W * 8;

    // the digits, and the needles at work on them
    const jobs = [];
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const d = +cur[k];
      let p = 255;
      const lag = k * 0.1;
      if (nw[k] !== cur[k] && s >= UNPICK[0] + lag - 0.4) {
        const a0 = UNPICK[0] + lag, u = progress(s, a0, UNPICK[1]);
        p = Math.round(255 * (1 - ease.inOutQuad(u)));
        jobs.push({ k, d, p, u, a0, a1: UNPICK[1], tail: 6 + 34 * ease.inOutQuad(u) });
      } else if (old[k] !== cur[k] && s < STITCH[1] + 0.8) {
        const a0 = STITCH[0] + lag, a1 = STITCH[1] + lag * 0.5, u = progress(s, a0, a1);
        p = Math.round(255 * ease.inOutQuad(u));
        jobs.push({ k, d, p, u, a0, a1, tail: 6 + 34 * (1 - ease.inOutQuad(u)) });
      }
      n += digit(buf, DIG[d], SLOTS[k].x, SLOTS[k].y, p);
    }
    // the ships, over their cargo, and the oars
    for (const sh of SHIPS) n += digit(buf, sh.S, sh.x, sh.y, 255);
    g.cost.box += n * 3;
    for (let si = 0; si < 2; si++) {
      const sh = SHIPS[si];
      for (let k = 0; k < sh.S.oars.length; k++) {
        const ph = (dist / V) * 2 * Math.PI + si * 0.5 + k * 0.18;   // a stroke a second; quicker in the surge
        const ox = sh.x + sh.S.oars[k], oy = sh.y + GUNWALE + 5;
        const sw = sin(ph), dip = cos(ph);
        g.thickLine(ox, oy, ox + 2.5 + 3 * sw, SEA_Y + 4.4 + 0.8 * dip, 1.3, 0x7a5a30, { aa: true });
      }
    }
    for (const j of jobs) {
      const sl = SLOTS[j.k], dg = DIG[j.d];
      let [nx, ny] = needleAt(dg, Math.max(1, j.p));
      nx += sl.x; ny += sl.y;
      // in and out of the cloth, along its own length
      const bob = j.u > 0 && j.u < 1 ? 1.5 * (0.5 + 0.5 * sin(s * 24 + j.k * 2)) : 0;
      // flying in from above and away again
      const fin = progress(s, j.a0 - 0.4, j.a0), fout = progress(s, j.a1, j.a1 + 0.4);
      const away = 1 - ease.outQuad(fin) + ease.inQuad(fout);
      nx += away * 34; ny -= away * 46;
      if (away < 1) needle(g, nx + NDX * bob, ny + NDY * bob, WOOL.terra, j.tail, s, j.k);
    }
    if (hourIn && s > COMET_T0 && s < COMET_T1) comet(g, s);
    if (ctx.night > 0) { candle(buf, ctx.night); g.cost.box += W * H * 6; }
  },
};
