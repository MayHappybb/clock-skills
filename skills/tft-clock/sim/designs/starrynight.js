// The Starry Night: the glass is Van Gogh's painting, and the time is the
// wind in it. Every pixel belongs to a thick flat brushstroke (an 8 px dash
// on a ~2.6 px lane) that follows a flow field and slides along it, as if
// the paint itself were moving: the sky's wind runs round the stars and
// the moon, the hills' strokes creep along their contours, the cypress
// burns upward and sways like a dark flame at the left. The four numerals
// are swirls of that wind: each digit is three lanes of pale strokes
// (lemon, cream, sky-white) streaming along the digit's own shape, inside
// a dark ultramarine keyline. Hours sit high on the left over the village,
// minutes low on the right under the moon and stars, the way the painting
// steps down from the cypress to the church.
//
// The time is never still: the strokes of every digit flow along it all
// the time, and on every second the wind gusts through them: all their
// strokes leap forward along the stroke and a glint runs through each
// swirl, while every star's halo throbs outward ring by ring. Every 15 s a
// gust front crosses the sky (:15, :45), lightening the strokes as it
// passes, surging the digits' flow and bending the cypress; at :30 the
// moon and stars bloom, their rings flashing out in turn.
//
// Minute turn: the wind takes the old swirl apart; its strokes peel off one
// by one (a fixed random order, so the digit thins evenly) and blow away to
// the right, curling, fading into sky colours, gone by :00. Then the new
// swirl curls in from the sky above, stroke by stroke, each landing in its
// lane. Hour: a comet falls down the gap between hours and minutes, its
// tail laid down as fresh lemon-white strokes that the wind then takes; the
// old digits' strokes are pulled into its wake, the new ones are flung out
// of its tail into place, and a bright wave runs out across the sky.
//
// Palette, the painting's own: cobalt, ultramarine and Prussian blue for the
// sky, lemon and Naples yellow for stars and moon, white-cream swirls, the
// orange moon disc, green-black cypress, slate and ochre village. Every
// mark is a flat dash of one colour: no shading, no gradients, no AA; the
// medium's only "light" is the paler colour of a stroke. The time is the
// palest, strongest thing on the glass, keyed off the sky by its dark
// lane. Night (23-07) deepens the sky and the ground to the painting seen
// by lamplight, shrinks the halos, keeps the numerals cream, and the
// backlight drops to 50 %.
//
// Cost per frame: one integer pass over the glass for sky and ground (a lane
// lookup, a subtract, a shift, two table reads a pixel), the cypress layer
// (26 x 80) with a shift per row, four 30 x 46 glyph maps, a few hundred
// palette entries mixed in integers, small kit shapes for star cores,
// windows and the comet head. No per-minute caches: every frame is cold.

import { clockFields, sin, cos, hash, clamp, progress, ease } from '../js/kit.js';
import {
  W, H, N, NOLANE, LANE, ARC, CLS, REG, LSPEED, LPER, LSEED, NLANES, CLASSES, NCLASS, HBASE, NHALO, HALO_OF,
  STARS, MOON, SLOTS, CYP, WINDOWS, CL,
} from './starrynight-scene.js';
import { GLYPHS, MW, MH, MG, NONE } from './starrynight-glyphs.js';

// ------------------------------------------------------------ colour (flash tables, mixed per frame in integers)

const to565 = (c) => ((c >> 8) & 0xf800) | ((c >> 5) & 0x07e0) | ((c >> 3) & 0x1f);
/** integer mix of two 0xRRGGBB colours, u in 0..256 */
function mixi(a, b, u) {
  const v = 256 - u;
  return ((((a >> 16) & 255) * v + ((b >> 16) & 255) * u) >> 8) << 16 | ((((a >> 8) & 255) * v + ((b >> 8) & 255) * u) >> 8) << 8 | (((a & 255) * v + (b & 255) * u) >> 8);
}
const scl = (c, k, add = 0) => mixi(c, add, 256 - k);

const NROW = NCLASS + NHALO;
const classList = Object.values(CLASSES).sort((a, b) => a.id - b.id);
const nameOf = Object.fromEntries(Object.entries(CLASSES).map(([k, v]) => [v.id, k]));
/** Day and night versions of every row: 6 stroke colours, then the ground twice. */
const DAY = new Int32Array(NROW * 8), NIGHT = new Int32Array(NROW * 8);
function nightOf(name, c) {
  if (name.startsWith('sky')) return scl(c, 150, 0x060a24);
  if (name === 'ring1' || name === 'moonLit') return scl(c, 215, 0x302000);
  if (name === 'ring2' || name === 'moonRing' || name === 'moonDisc') return scl(c, 150, 0x0a1030);
  if (name === 'ring3' || name === 'ring4') return scl(c, 105, 0x0a1440);
  if (name.startsWith('cypress')) return scl(c, 170);
  return scl(c, 140, 0x04061a);
}
for (let r = 0; r < NROW; r++) {
  const name = r < NCLASS ? nameOf[r] : HALO_OF[r - HBASE], cl = CLASSES[name];
  for (let j = 0; j < 8; j++) {
    const c = j < 6 ? cl.strokes[j] : cl.gap;
    DAY[r * 8 + j] = c; NIGHT[r * 8 + j] = nightOf(name, c);
  }
}
const ROW = new Uint16Array(NROW * 8), ROWB = new Uint16Array(NROW * 8);
const SKYFADE = 0x3458b2;

// the numerals: lemon edge, cream heart, sky-white edge, dark keyline
const DIG = [
  [0xf4dc5c, 0xf8e680, 0xecc840, 0xfbee9c, 0xfff6d0, 0xf6e278, 0xc49c30],
  [0xfbf6dc, 0xf4e8b0, 0xfff8e6, 0xf6e070, 0xd8ecf2, 0xffffff, 0xc8bc90],
  [0xd4eaf0, 0xbcdcec, 0xe8f6f4, 0xa8d0e4, 0xf4eebc, 0xe0f0f6, 0x88acc8],
  [0x101a52, 0x16226c, 0x0e1848, 0x1a2a76, 0x121e5c, 0x0a1240, 0x08103a],
];
const DIGN = DIG.map((row, k) => row.map((c) => (k === 3 ? scl(c, 170, 0x02040c) : k === 1 ? scl(c, 240, 0x201400) : scl(c, 225, 0x100c00))));
// per frame: [sub][j] normal, glint, and four fade levels toward the sky (or the comet)
const DROW = new Uint16Array(4 * 8), DGL = new Uint16Array(4 * 8), DFADE = new Uint16Array(5 * 4 * 8);

// noise tables (flash): which colour a stroke takes, whether it ends in a gap, its turn bucket
const PICK = new Uint8Array(1024), GAPF = new Uint8Array(1024), BKT = new Uint8Array(1024), BKT2 = new Uint8Array(1024);
for (let i = 0; i < 1024; i++) {
  const h = hash(i, 4242);
  // three strokes in four end in a sliver of underpaint
  PICK[i] = h % 6; GAPF[i] = (h >>> 8) & 3 ? 1 : 0; BKT[i] = (h >>> 12) & 31; BKT2[i] = (h >>> 20) & 31;
}

// ------------------------------------------------------------ timing

const LEN = 8;
const BEAT_JUMP = [5, 7, 5, 2, 3, 2];  // px each sub-lane leaps on the beat (keyline and echoes least)
const SPEED = [15, 21, 15, 6, 11, 8];  // px/s of steady flow
const ECHO_CLS = [CL.skyTeal, CL.skyMid];
const D0 = 59.2, DSPAN = 0.4, FLY = 0.45, A0 = 0.2, ASPAN = 0.5;

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** The digits' surge from gusts this minute, made to sum to zero over the minute so :00 never jumps. */
function surge(s, cx) {
  let a = 0;
  for (const g0 of [15, 45]) a += 12 * smooth((frontX(s, g0) - cx) / 26 + 0.5);
  return a - (24 * s) / 60;
}
const frontX = (s, g0) => -20 + (s - g0) * 74;

// the comet's path, from above the gap down behind the village hill
const CPATH = [[93, -12], [85, 6], [81, 26], [81, 46], [76, 70], [72, 86]];
const CT0 = -1.25, CT1 = 0.45;
function cometAt(tc) {
  const u = clamp((tc - CT0) / (CT1 - CT0), 0, 1) * (CPATH.length - 1);
  const i = Math.min(CPATH.length - 2, u | 0), f = u - i;
  const p0 = CPATH[Math.max(0, i - 1)], p1 = CPATH[i], p2 = CPATH[i + 1], p3 = CPATH[Math.min(CPATH.length - 1, i + 2)];
  const f2 = f * f, f3 = f2 * f;
  const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f2 + (-a + 3 * b - 3 * c + d) * f3);
  return [cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])];
}

// ------------------------------------------------------------ per-frame scratch (RAM)

const OFF = new Int32Array(NLANES);
const LOFF = new Int32Array(32), LPERD = new Int32Array(4);
const RSH = new Int8Array(MH), MODE = new Uint8Array(4), MODE2 = new Uint8Array(4);
const BST = new Uint8Array(32), BDX = new Int16Array(32), BDY = new Int16Array(32), BLV = new Uint8Array(32);

export default {
  name: 'The Starry Night',
  blurb: 'Van Gogh\'s sky in moving brushstrokes: each numeral is a swirl of wind whose strokes stream along it, gusting on the beat; the wind blows a minute away and curls the next one in, and a comet falls at the hour.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, ms = ctx.date.getTime(), T = ms / 1000;
    const night = ctx.night;
    ctx.lcd.backlight(1 - 0.5 * night);
    const buf = g.buf, cost = g.cost;
    const nxt = clockFields(new Date(ms + 60000)), prv = clockFields(new Date(ms - 60000));
    const cur = f.hh + f.mm;
    const hourTurn = (s >= 50 && nxt.m === 0) || (s < 10 && f.m === 0);
    const tc = s >= 50 ? s - 60 : s;                               // seconds from the nearest turn
    const bt = T - Math.floor(T);                                   // the beat: every whole second

    // ---- palettes for this frame
    const nu = (night * 256) | 0;
    const bloom = s >= 30 && s < 33 ? s - 30 : -1;
    for (let r = 0; r < NROW; r++) {
      let flash = 0, fc = 0;
      if (r >= HBASE) {
        // halos throb outward on the beat, star by star; at :30 the moon and stars bloom
        const k = (r - HBASE) >> 2, j = (r - HBASE) & 3;
        const lt = bt - 0.05 * k + (bt - 0.05 * k < 0 ? 1 : 0);
        flash = clamp(1 - Math.abs(lt - 0.04 - 0.075 * j) / 0.11, 0, 1) * 0.6;
        if (bloom >= 0) flash = Math.max(flash, clamp(1 - Math.abs(bloom - 0.25 * k - 0.12 * j - 0.2) / 0.3, 0, 1));
        if (hourTurn && tc > 0 && tc < 2.5) flash = Math.max(flash, clamp(1 - Math.abs(tc - 0.4 - 0.12 * j - 0.1 * k) / 0.35, 0, 1));
        fc = j < 2 ? 0xfffbe0 : 0xd8f4ff;
      }
      const fu = (flash * 200) | 0;
      for (let j = 0; j < 8; j++) {
        let c = nu ? mixi(DAY[r * 8 + j], NIGHT[r * 8 + j], nu) : DAY[r * 8 + j];
        if (fu) c = mixi(c, fc, fu);
        ROW[r * 8 + j] = to565(c);
      }
    }
    cost.box += NROW * 8 * 8;
    const gust0 = s >= 14 && s < 18.5 ? 15 : s >= 44 && s < 48.5 ? 45 : -1;
    const wake = hourTurn && tc > 0.2 && tc < 2.6;
    if (gust0 > 0 || wake) {
      for (let r = 0; r < NROW; r++) for (let j = 0; j < 8; j++) {
        const c = nu ? mixi(DAY[r * 8 + j], NIGHT[r * 8 + j], nu) : DAY[r * 8 + j];
        ROWB[r * 8 + j] = to565(mixi(c, 0xb8dcff, wake ? 110 : 80));
      }
      cost.box += NROW * 8 * 6;
    }

    // ---- lane offsets: every dash of the picture slides along its lane
    // at the hour the comet's wind makes the whole painting rush for two seconds, then
    // runs it a little slow until :09.5 to give the time back (so nothing ever jumps)
    const rush = hourTurn ? 2.2 * smooth((tc + 1.0) / 2.6) - 2.2 * clamp((tc - 1.6) / 7.9, 0, 1) : 0;
    for (let L = 0; L < NLANES; L++) {
      const p = LPER[L], v = LSPEED[L];
      OFF[L] = v ? Math.floor((LSEED[L] + v * (T + rush * (v > 4 ? 1.6 : 0.5))) % p) : LSEED[L] % p;
    }
    cost.box += NLANES * 12;

    // ---- sky and ground, one pass
    let gx0 = -1, gx1 = -1, wcx = -1, wr = 0;
    if (gust0 > 0) { gx1 = frontX(s, gust0); gx0 = gx1 - 16; }
    if (wake) { wcx = 81; wr = (tc - 0.2) * 78; }
    for (let y = 0, i = 0; y < H; y++) {
      const tilt = ((y - 40) * 0.3) | 0;
      for (let x = 0; x < W; x++, i++) {
        let rows = ROW;
        if (gx1 > 0) { const xx = x + tilt; if (xx >= gx0 && xx < gx1 && REG[i] === 0) rows = ROWB; }
        if (wcx >= 0) { const d = x > wcx ? x - wcx : wcx - x; if (d < wr && d > wr - 15 && REG[i] === 0) rows = ROWB; }
        const L = LANE[i], cb = CLS[i] << 3;
        if (L === NOLANE) { buf[i] = rows[cb + 6]; continue; }
        let u = ARC[i] - OFF[L];
        if (u < 0) u += LPER[L];
        const key = (L * 37 + (u >> 3) * 11) & 1023;
        buf[i] = (u & 7) === 7 && GAPF[key] ? rows[cb + 6] : rows[cb + PICK[key]];
      }
    }
    cost.px += N; cost.box += N * 9;

    // ---- star cores and lit windows
    for (let k = 0; k < STARS.length; k++) {
      const st = STARS[k];
      const lt = bt - 0.05 * k + (bt - 0.05 * k < 0 ? 1 : 0);
      const big = lt < 0.18 ? 1 : 0;
      g.fillCircle(st.x, st.y, 2.1 + 0.5 * big + 0.4 * (st.r > 8 ? 1 : 0), nu > 128 ? 0xe8d070 : 0xfce870);
      g.fillCircle(st.x, st.y, 1.1 + 0.3 * big, 0xfffff0);
    }
    const winC = mixi(0xf8cc3c, 0xffd860, nu);
    for (const [wx, wy, grp] of WINDOWS) {
      // now and then a lamp goes out for a few seconds
      const slot = Math.floor(T / 7) + grp * 3;
      if (hash(slot, grp, 77) % 9 === 0) continue;
      g.fillRect(wx, wy, 2, 2, grp === 4 ? 0xf0a030 : winC);
    }

    // ---- the numerals' state this frame, and the wind's echo round them (under everything else)
    const bj = bt < 0.32 ? ease.outCubic(bt / 0.32) : 1, beats = Math.floor(T) + bj;
    for (let k = 0; k < 4; k++) {
      let mode = 0;       // 0 rest, 1 leaving, 2 arriving
      if (s >= D0 - 0.1 && (nxt.hh + nxt.mm)[k] !== cur[k]) mode = 1;
      else if (s < A0 + ASPAN + 0.1 && (prv.hh + prv.mm)[k] !== cur[k]) mode = 2;
      MODE[k] = mode;
      MODE2[k] = s < 1.5 && (prv.hh + prv.mm)[k] !== cur[k] ? 1 : 0;   // arrived this minute (settling until 1.5 s)
      numeral(g, k, +cur[k], mode, s, T, beats, hourTurn, tc, 0);
    }

    // ---- the comet (hour): head, and a tail of fresh strokes that the wind takes
    if (hourTurn && tc > CT0 - 0.05 && tc < CT1 + 1.1) comet(g, tc, nu);

    // ---- the cypress, swaying like a flame
    const gustAmp = gust0 > 0 ? 1.4 * Math.max(0, 1 - Math.abs(frontX(s, gust0) - 12) / 40) : 0;
    let cn = 0;
    for (let y = 0; y < H; y++) {
      const a = (1.5 + gustAmp) * (1 - y / 95) * (1 - y / 95);
      const sh = Math.round(a * sin(T * 1.7 - y * 0.085) + gustAmp * 0.6 * (1 - y / 80));
      const row = y * CYP.w;
      for (let x = 0; x < CYP.w; x++) {
        if (!CYP.mask[row + x]) continue;
        const X = x + sh;
        if (X < 0 || X >= W) continue;
        const L = CYP.lane[row + x], cb = CYP.cls[row + x] << 3;
        let c;
        if (L === NOLANE) c = ROW[cb + 6];
        else {
          let u = CYP.arc[row + x] - OFF[L];
          if (u < 0) u += LPER[L];
          const key = (L * 37 + (u >> 3) * 11) & 1023;
          c = (u & 7) === 7 && GAPF[key] ? ROW[cb + 6] : ROW[cb + PICK[key]];
        }
        buf[y * W + X] = c; cn++;
      }
    }
    cost.px += cn; cost.box += CYP.w * H + cn * 9;

    // ---- the numerals
    const du = (night * 256) | 0;
    for (let k = 0; k < 4; k++) for (let j = 0; j < 7; j++) {
      const c = du ? mixi(DIG[k][j], DIGN[k][j], du) : DIG[k][j];
      DROW[k * 8 + j] = to565(c);
      DGL[k * 8 + j] = to565(k === 3 ? c : mixi(c, 0xffffff, 150));
    }
    DROW[3 * 8 + 6] = DGL[3 * 8 + 6] = ROW[CL.skyMid * 8 + 6];   // the keyline's gaps show the same underpaint
    for (let k = 0; k < 4; k++) for (let j = 0; j < 7; j++) {
      const c = du ? mixi(DIG[k][j], DIGN[k][j], du) : DIG[k][j];
      for (let lv = 1; lv <= 4; lv++) {
        const tgt = nu ? mixi(SKYFADE, 0x0c1a48, nu) : SKYFADE;
        DFADE[(lv * 4 + k) * 8 + j] = to565(mixi(c, tgt, [0, 70, 130, 180, 225][lv]));
      }
    }
    cost.box += 4 * 7 * 6 * 6;
    for (let k = 0; k < 4; k++) numeral(g, k, +cur[k], MODE[k], s, T, beats, hourTurn, tc, 1);
  },
};

// ------------------------------------------------------------ one numeral

function numeral(g, k, d, mode, s, T, beats, hourTurn, tc, layer) {
  const G = GLYPHS[d], ox = SLOTS[k][0] - MG, oy = SLOTS[k][1] - MG, buf = g.buf;
  const cx = SLOTS[k][0] + 12, cy = SLOTS[k][1] + 20;
  let sg = surge(s, cx);
  // a changing swirl spins up before the wind takes it, and a new one lands spinning and settles
  if (mode === 1 && s > 58.4) sg += 14 * (s - 58.4) * (s - 58.4);
  else if (mode === 2 || (s < 1.5 && MODE2[k])) sg -= 14 * (1.5 - s) * (1.5 - s);
  // lane offsets: steady flow, the beat's leap, the gusts' surge; keylines slower
  for (let p = 0; p < G.paths; p++) {
    const per = G.per[p];
    LPERD[p] = per;
    for (let sub = 0; sub < 6; sub++) {
      const v = SPEED[sub] * T + BEAT_JUMP[sub] * beats + sg * (sub >= 3 ? 0.4 : 1) + ((k * 29 + p * 13 + sub * 7) % per);
      LOFF[p * 8 + sub] = Math.floor(v % per);
    }
  }
  // the glint: on each beat a light runs along every swirl
  const bt = T - Math.floor(T), gl = bt < 0.55 ? ease.inOutQuad(bt / 0.55) : -1;
  // the turn: each stroke's bucket says when it leaves (or lands) and where it flies
  let anim = false;
  if (mode && layer === 0) {
    // echoes do not fly: they thin out with the digit, on the same schedule
    anim = true;
    for (let b = 0; b < 32; b++) {
      const r = (b + 0.5) / 32;
      if (mode === 1) BST[b] = s < D0 + DSPAN * r ? 0 : 2;
      else BST[b] = s >= A0 + ASPAN * ((BKT2[b * 31 & 1023] + 0.5) / 32) - FLY * 0.5 ? 0 : 2;
    }
  } else if (mode) {
    anim = true;
    for (let b = 0; b < 32; b++) {
      const r = (b + 0.5) / 32;
      const th = (hash(b, k, 11) % 1000) / 1000, cu = ((hash(b, k, 12) % 1000) / 1000 - 0.5) * 2.6;
      const dist = 22 + 16 * ((hash(b, k, 13) % 1000) / 1000);
      let p = -1;                              // flight progress: 0 home .. 1 far away
      if (mode === 1) {
        const td = D0 + DSPAN * r;
        p = s < td ? 0 : (s - td) / FLY;
      } else {
        const ta = A0 + ASPAN * ((BKT2[b * 31 & 1023] + 0.5) / 32);
        p = s >= ta ? 0 : (ta - s) / FLY;
      }
      if (p >= 1) { BST[b] = 2; continue; }
      if (p <= 0) { BST[b] = 0; continue; }
      BST[b] = 1;
      let dx, dy;
      if (hourTurn) {
        // pulled into the comet's wake, or flung out of its tail
        const [qx, qy] = cometAt(mode === 1 ? s - 60 + FLY * 0.8 : tc - FLY * 0.6);
        const e = mode === 1 ? Math.pow(p, 1.3) : p * p;
        dx = (qx - cx) * e + 8 * (th - 0.5) * p; dy = (qy - cy) * e + 8 * (cu / 2.6) * p;
      } else if (mode === 1) {
        // blown off to the right and up, curling
        const a = -0.95 + 1.2 * th + cu * p, R = dist * Math.pow(p, 1.6);
        dx = R * cos(a); dy = R * sin(a);
      } else {
        // curling in from the sky above
        const a = -2.5 + 1.2 * th + cu * p, R = dist * Math.pow(p, 1.6);
        dx = R * cos(a); dy = R * sin(a);
      }
      BDX[b] = Math.round(dx); BDY[b] = Math.round(dy);
      BLV[b] = Math.min(4, 1 + ((p * 4.5) | 0));
    }
  }
  // the beat's ripple: a wave of wind runs down the swirl, rows sway a pixel either way
  const rip = bt < 0.7 ? 1 : 0;
  for (let py = 0; py < MH; py++) {
    if (!rip) { RSH[py] = 0; continue; }
    const yb = (bt / 0.7) * (MH + 16) - 8, e = (py - yb) / 7, env = e > -1.6 && e < 1.6 ? 1 - (e * e) / 2.56 : 0;
    RSH[py] = Math.round(1.45 * env * sin(py * 0.42 - bt * 9 + k));
  }
  const salt = k * 101;
  let n = 0, nf = 0;
  if (layer === 0) {
    for (let py = 0, j = 0; py < MH; py++) {
      const Y = oy + py, rs = RSH[py];
      if (Y < 0 || Y >= H) { j += MW; continue; }
      for (let px = 0; px < MW; px++, j++) {
        const lane = G.lane[j];
        if (lane === NONE || (lane & 7) < 4) continue;
        const X = ox + px + rs;
        if (X < 0 || X >= W) continue;
        const i = Y * W + X;
        if (REG[i] !== 0 || CLS[i] >= HBASE || CLS[i] === CL.moonLit || CLS[i] === CL.moonDisc) continue;
        const sub = lane & 7, path = lane >> 3;
        let u = G.arc[j] - LOFF[lane];
        if (u < 0) u += LPERD[path];
        const key = (lane * 53 + (u >> 3) * 7 + salt) & 1023;
        if (anim && BST[BKT[key]] !== 0) continue;
        const cb = ECHO_CLS[sub - 4] << 3;
        buf[i] = (u & 7) === 7 && GAPF[key] ? ROW[cb + 6] : ROW[cb + PICK[key]];
        n++;
      }
    }
    g.cost.px += n; g.cost.box += MW * MH * 3 + n * 12;
    return;
  }
  for (let pass = anim ? 0 : 1; pass < 2; pass++) {
    for (let py = 0, j = 0; py < MH; py++) {
      const Y = oy + py, rs = RSH[py];
      for (let px = 0; px < MW; px++, j++) {
        const lane = G.lane[j];
        if (lane === NONE || (lane & 7) > 3) continue;
        const sub = lane & 7, path = lane >> 3, arc = G.arc[j];
        let u = arc - LOFF[lane];
        if (u < 0) u += LPERD[path];
        const key = (lane * 53 + (u >> 3) * 7 + salt) & 1023;
        let st = 0, b = 0;
        if (anim) { b = BKT[key]; st = BST[b]; }
        const ci = (u & 7) === 7 && GAPF[key] ? 6 : PICK[key];
        if (pass === 0) {
          // flying strokes (keylines just vanish)
          if (st !== 1 || sub === 3) continue;
          const X = ox + px + rs + BDX[b], YY = Y + BDY[b];
          if (X < 0 || X >= W || YY < 0 || YY >= H) continue;
          buf[YY * W + X] = DFADE[(BLV[b] * 4 + sub) * 8 + ci];
          nf++;
          continue;
        }
        if (st !== 0) continue;
        const X = ox + px + rs;
        if (X < 0 || X >= W || Y < 0 || Y >= H) continue;
        let glint = false;
        if (gl >= 0 && sub < 3) {
          const per = LPERD[path], L = per > 4096 ? G.plen[path] : per;
          let dd = arc - gl * L;
          if (per <= 4096) { if (dd < -per / 2) dd += per; else if (dd > per / 2) dd -= per; }
          glint = dd > -4 && dd < 4;
        }
        buf[Y * W + X] = glint ? DGL[sub * 8 + ci] : DROW[sub * 8 + ci];
        n++;
      }
    }
  }
  g.cost.px += n + nf; g.cost.box += MW * MH * (anim ? 2 : 1) * 3 + (n + nf) * 10;
}

// ------------------------------------------------------------ the comet

const TAILN = 48;
function comet(g, tc, nu) {
  const buf = g.buf;
  let n = 0;
  const stamp = (x, y, r, c) => {
    const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(W - 1, Math.ceil(x + r));
    const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(H - 1, Math.ceil(y + r)), r2 = r * r;
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      const dx = xx + 0.5 - x, dy = yy + 0.5 - y, i = yy * W + xx;
      if (dx * dx + dy * dy <= r2 && REG[i] === 0) { buf[i] = c; n++; }
    }
  };
  // tail colours by age: white, lemon, Naples yellow, then sky blues the wind can take
  const TAIL = [0xffffff, 0xfff4b0, 0xf8dc58, 0xd8b850, 0x7ab0d8, 0x5a90c8, 0x4878bc].map(to565);
  const AGES = [0.06, 0.13, 0.22, 0.32, 0.5, 0.75, 1.0];
  // the tail: dashes laid where the head has been; they yellow, cool and drift with the wind as they age
  for (let i = 0; i < TAILN; i++) {
    const tj = CT0 + ((CT1 - CT0) * i) / TAILN, age = tc - tj;
    if (age < 0 || age > 1.0) continue;
    let lv = 0;
    while (lv < 6 && age > AGES[lv]) lv++;
    if (i % 3 === 0 && lv < 6) lv++;
    const [ax, ay] = cometAt(tj), [bx, by] = cometAt(tj + (CT1 - CT0) / TAILN);
    const drift = age * age * 6;
    const w = lv < 4 ? Math.max(0.8, 2.6 - age * 5) : 0.9;
    for (let q = 0; q < 3; q++) {
      const u = q / 3;
      stamp(ax + (bx - ax) * u + drift, ay + (by - ay) * u - drift * 0.3, w, TAIL[lv]);
    }
  }
  // the head: a star with two halo rings that throb as it falls, until it drops behind the hill
  if (tc >= CT0 && tc <= CT1) {
    const [hx, hy] = cometAt(tc);
    const th = (tc * 4) % 1 < 0.5 ? 0 : 1;
    const ring = (r, c) => {
      for (let a = 0; a < 40; a++) {
        const x = Math.round(hx + r * cos(a * 0.157)), y = Math.round(hy + r * sin(a * 0.157));
        if (x >= 0 && x < W && y >= 0 && y < H && REG[y * W + x] === 0) { buf[y * W + x] = c; n++; }
      }
    };
    ring(6 + th, to565(0x8cc4e0));
    ring(4.5 + th * 0.5, to565(0xf0e080));
    stamp(hx, hy, 3.3, to565(0xfce870));
    stamp(hx, hy, 2.0, to565(0xffffff));
  }
  g.cost.px += n; g.cost.box += n * 4 + TAILN * 30;
}
