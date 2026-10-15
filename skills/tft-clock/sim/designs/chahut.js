// Le Chahut: Seurat's can-can (1889-90) painted again on 160 x 80 pixels,
// and the time is the chorus line. Each numeral is a dancer: the digit is
// her frilled petticoat, tiered in white and rose ruffles with a lace rim,
// her head (auburn chignon, a red flower, turned-up nose, facing left as in
// the painting) on top and her black-stockinged legs below. The two gas
// globes of the cafe-concert hang between hours and minutes: they are the
// colon.
//
// The medium is the whole picture: every pixel belongs to a 5-pixel plus
// dot (plus-shaped dots tile the plane on a slanted lattice, so the dots
// never line up in rows), and every dot is one pure pigment from Seurat's
// palette. Mixtures are the ratio of dots: the wall is ultramarine and violet
// dotted with emerald, warming to orange and chrome dots round the globes
// and towards the footlights; the boards are orange and chrome laid against
// violet and blue. Next to a light shape the ground darkens (Seurat's
// irradiation): that is the numerals' moat. The medium's own motion is the
// optical vibration: the dots are re-laid continually (slowly in the room,
// quickly in the cast), the gas halos swell in rings of dots.
//
// At rest: the galop has a beat every second. On it the line kicks, a ripple
// running left to right: the kicking leg (alternating) swings up to the
// left, the body rises on its toes and leans back, the head nods, the
// petticoat flounces (its ruffle tiers flip white/rose and the lace frills
// flare at the edges), and a front of freshly laid dots sweeps across the
// skirts. All the time the ruffles cascade downwards through the numerals.
// Every 12 s a flourish: a high-kick ripple with the gas flaring, a skirt
// toss (the vermilion linings flash through every petticoat), or a jump.
//
// Minute turn: the old dancer gives a high kick and skips off to the right,
// her dots thrown away as she goes; the new one cartwheels in from the
// right (a wheel of petticoat and stockinged legs) and springs up into her
// numeral after :00. Hour: the changing dancers fold into cartwheels where
// they stand, turn over, and spring up as the new hour; then the finale,
// the grand ecart: the whole line leaps and drops into the splits, flowers
// fly up from the pit, a ring of light runs out from the globes; they rise
// again at :06.
//
// Palette: Seurat's prismatic pigments only (white, lemon, chrome,
// orange, vermilion, crimson, rose, violet, ultramarine, cobalt, emerald,
// and his darkest, ultramarine with crimson): no blends, no earths, no
// black. Hard pixels (a dot is a dot). Night: the Parade de cirque palette,
// more ultramarine and violet dots, cobalt in the skirts, dimmer gas, the
// backlight down; it arrives as dots repainted one by one over the fade.
//
// Cost: the scene is painted as material codes into one scratch canvas
// (25.6 KB RAM) with kit shapes and per-pixel lookups of the numerals'
// distance fields; one pass then maps each pixel through its dot's pick and
// its code's mixture table (~3 loads a pixel). Every frame is built cold.
import { Gfx, clockFields, hash, sin, cos, sprite, ease } from '../js/kit.js';
import { SDF, FW, FH, GM, GW, GH, HEAD_X, HIP_X, TOP_Y } from './chahut-glyphs.js';
import {
  LUT_DAY, LUT_NIGHT, NCODES, DOT, NDOTS, DX, PH, RK, NM, RND, enc, FAST,
  WALL, FLOOR, HALO, GROUND_END, SKW, SKP, RIM, LIN, STK, SHOE, SKIN, HAIR, FLOWER, EYE, RIB,
  LAMPC, LAMPG, CONF,
} from './chahut-dots.js';

const W = 160, H = 80, N = W * H;
const SLOT_X = [9, 40, 94, 125];      // glyph boxes, left edges
const TOPY = 15;                      // glyph top at rest
const HIP_GY = 32;                    // hips: glyph row
const FLOOR_Y = 76;                   // where the shoes stand
const STAGE_Y = 52;                   // the back edge of the boards
const LAMPS = [[80, 24], [80, 38]];   // the colon: two gas globes
const CXG = GW / 2, CYG = GH / 2;     // glyph centre (scale pivot)
const DEG = Math.PI / 180;

// ------------------------------------------------------------ static maps (flash)
const GB = new Uint8Array(N);         // ground code without the gas
const LD = new Uint8Array(N);         // distance to the nearer globe, px
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x;
  if (y < STAGE_Y) {
    // the wall warms towards the footlights' glow at its foot
    const u = Math.max(0, (y - 26) / (STAGE_Y - 26));
    GB[i] = WALL + Math.round(u * u * 3);
  } else {
    const u = (y - STAGE_Y) / (H - 1 - STAGE_Y);
    GB[i] = FLOOR + Math.min(6, Math.round(1 + u * 4));
  }
  let d = 1e9;
  for (const [lx, ly] of LAMPS) d = Math.min(d, Math.hypot(x + 0.5 - lx, y + 0.5 - ly));
  LD[i] = Math.min(255, Math.round(d));
}
const LV = new Int8Array(256);        // per frame: gas light by distance

// ------------------------------------------------------------ the dancer's head
const HEAD = sprite(`
  .........ff.
  ........fff.
  ...hhh.ff...
  ..hhhhhhf...
  .hhhhhhhhh..
  sshhhhhhhhh.
  sesshhhhhh..
  ssssshhhhh..
  .sssssshh...
  ..sssss.....
  ...kkkk.....
  ....ss......`, { f: enc(FLOWER), h: enc(HAIR), s: enc(SKIN), e: enc(EYE), k: enc(RIB) });
const HEAD_AX = 4.5, HEAD_H = 12;

// cartwheel tables: radius (quarter px) and angle (0..255) round a 25 x 25 box
const WR = 12, WS = 2 * WR + 1;
const WRAD = new Uint8Array(WS * WS), WANG = new Uint8Array(WS * WS);
for (let y = 0; y < WS; y++) for (let x = 0; x < WS; x++) {
  const dx = x - WR, dy = y - WR;
  WRAD[y * WS + x] = Math.min(255, Math.round(Math.hypot(dx, dy) * 4));
  WANG[y * WS + x] = Math.round(((Math.atan2(dy, dx) / (2 * Math.PI)) * 256) + 256) & 255;
}

// ------------------------------------------------------------ working buffers (RAM)
const CG = new Gfx(W, H);             // material codes (25.6 KB)
const PO = new Uint16Array(NDOTS * 2);// per dot: LUT offset for the room [2d] and the cast [2d+1]
const LUT = new Uint16Array(NCODES * 256 * 2);
LUT.set(LUT_DAY, 0); LUT.set(LUT_NIGHT, NCODES * 256);
const NIGHT_OFF = NCODES * 256;

const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const frac = (x) => x - Math.floor(x);

// ------------------------------------------------------------ the beat

/** Kick height 0..1 through one beat (p in 0..1): up fast, a hold, down. */
function kickCurve(p) {
  if (p < 0.18) return ease.outCubic(p / 0.18);
  if (p < 0.3) return 1;
  if (p < 0.62) return 1 - ease.inOutQuad((p - 0.3) / 0.32);
  return 0;
}

/** The flourish running at second s of minute mk, or null: { kind, t } */
function flourish(mk, s) {
  for (const at of [12, 24, 36, 48]) {
    if (s >= at && s < at + 2) {
      const kinds = ['ripple', 'toss', 'jump'];
      return { kind: kinds[(hash(mk, at) + at / 12) % 3], t: s - at };
    }
  }
  return null;
}

// ------------------------------------------------------------ drawing into the code canvas

/** One leg from the hip, `ang` from straight down, positive to the left. */
function leg(hx, hy, ang, len) {
  const fx = hx - len * Math.sin(ang), fy = hy + len * Math.cos(ang);
  CG.thickLine(hx, hy, fx, fy, 3.2, enc(STK));
  // the shoe points along the leg's end, toe to the left when kicked
  const tx = Math.abs(ang) < 0.5 ? -1.6 : -1.4 * Math.sin(ang) * 1.6, ty = Math.abs(ang) < 0.5 ? 0.6 : 1.4 * Math.cos(ang);
  CG.fillEllipse(fx + tx, fy + ty, 2.6, 1.8, enc(SHOE));
}

/**
 * A numeral-petticoat: its field sampled into the code canvas, with the halo,
 * the ruffle tiers, the lace rim and the frill flare; `cut` (0..1) throws
 * away that fraction of its dots, by rank.
 */
function petticoat(d, bx, by, P) {
  const { sc, lean, amp, phase, lining, cut } = P;
  const f = SDF[d], buf = CG.buf;
  const x0 = Math.max(0, Math.floor(bx + CXG - (CXG + GM) * sc - 3)), x1 = Math.min(W, Math.ceil(bx + CXG + (CXG + GM) * sc + 3));
  const y0 = Math.max(0, Math.floor(by + CYG - (CYG + GM) * sc)), y1 = Math.min(H, Math.ceil(by + CYG + (CYG + GM) * sc));
  const isc = 1 / sc, cutR = (cut * 256) | 0, hipY = by + HIP_GY;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    const gy = CYG + (y + 0.5 - by - CYG) * isc;
    const fy = (gy + GM) | 0;
    if (gy + GM < 0 || fy >= FH) continue;
    const sh = (lean * (hipY - y)) / HIP_GY;
    // ruffle tier and flare for this row (glyph space)
    const tu = (gy + phase) / 6, tier = Math.floor(tu), flare = amp * (tu - tier);
    const tierCode = lining > 0 && ((tier + 16) & 1) === 0 && frac(tier * 0.37 + 0.5) < lining ? LIN : (tier & 1) ? SKP : SKW;
    const row = y * W;
    for (let x = x0; x < x1; x++) {
      const gx = CXG + (x + 0.5 - sh - bx - CXG) * isc;
      if (gx + GM < 0) continue;
      const fx = (gx + GM) | 0;
      if (fx >= FW) continue;
      n++;
      const de = f[fy * FW + fx] * 0.25 * sc - flare;
      if (de >= 2.4) continue;
      const i = row + x;
      if (de >= 0) { if (buf[i] < GROUND_END) buf[i] = HALO; continue; }
      if (cutR && RK[DOT[i]] < cutR) continue;
      buf[i] = de > -1.15 ? RIM : tierCode;
    }
  }
  CG.cost.box += n * 6;
}

/** A dancer standing (or kicking) in her slot; returns her hip position. */
function dancer(d, P) {
  const bx = P.x, by = P.y;
  const hx = bx + HIP_X[d] + P.lean * 0, hy = by + HIP_GY + 1;
  if (P.legs) {
    const len = P.legLen ?? Math.max(6, FLOOR_Y - hy);
    leg(hx + 1.5, hy, P.angB, len);   // the far leg
    leg(hx - 1.5, hy, P.angA, len);
  }
  petticoat(d, bx, by, P);
  if (P.sc > 0.7) {
    // the head on the neck, riding the lean; it nods on the beat
    const topY = by + CYG + (TOP_Y[d] - CYG) * P.sc;
    const nx = bx + CXG + (HEAD_X[d] - CXG) * P.sc + P.lean + (P.nod ?? 0) * -0.6;
    CG.blit(HEAD, Math.round(nx - HEAD_AX), Math.round(topY - HEAD_H + 1 + (P.nod ?? 0)));
  }
}

/** A cartwheel: a disc of ruffles with the stockinged legs and arms as spokes. */
function cartwheel(cx, cy, ang, size, limbs) {
  // the petticoat wheel first: a rosette of rose and white gores turning with
  // the wheel, scalloped at the rim (no ring inside it, so it never reads 0)
  const R4 = size * 4, buf = CG.buf, a8 = ((ang / (2 * Math.PI)) * 256) | 0;
  const ix = Math.round(cx) - WR, iy = Math.round(cy) - WR;
  let n = 0;
  for (let y = 0; y < WS; y++) {
    const py = iy + y;
    if (py < 0 || py >= H) continue;
    for (let x = 0; x < WS; x++) {
      const px = ix + x;
      if (px < 0 || px >= W) continue;
      n++;
      const k = y * WS + x, r = WRAD[k], q = (WANG[k] - a8) & 31;
      const sc = q < 16 ? 4 : 0;                                // eight scallops
      if (r > R4 + sc) continue;
      buf[py * W + px] = r > R4 + sc - 5 ? RIM : q < 16 ? SKP : SKW;
    }
  }
  CG.cost.box += n * 4;
  // then the dancer's limbs as spokes right across it: legs out one side, arms the other
  if (limbs > 0.05) {
    const ca = cos(ang), sa = sin(ang), L = 7 + 13 * limbs;
    for (const off of [-0.32, 0.32]) {
      const a = ang + off, ex = cx + L * cos(a), ey = cy + L * sin(a);
      CG.thickLine(cx, cy, ex, ey, 3.2, enc(STK));
      CG.fillCircle(ex, ey, 1.9, enc(SHOE));
    }
    for (const off of [Math.PI - 0.42, Math.PI + 0.42]) {
      const a = ang + off;
      CG.thickLine(cx - 2 * ca, cy - 2 * sa, cx + (L - 3) * cos(a), cy + (L - 3) * sin(a), 2, enc(SKIN));
    }
    const hxp = cx - (L - 6) * ca, hyp = cy - (L - 6) * sa;
    CG.fillCircle(hxp, hyp, 3.2, enc(HAIR));
    CG.fillCircle(hxp + 0.8 * ca, hyp + 0.8 * sa, 2.0, enc(SKIN));
  }
}

// ------------------------------------------------------------ the face

export default {
  name: 'Le Chahut',
  blurb: 'Seurat\'s can-can in pure dots: each numeral is a dancer\'s frilled petticoat, kicking on the beat under the gas globes of the colon; each minute the old dancer skips off and the new one cartwheels in.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey, nt = ctx.night;
    ctx.lcd.backlight(1 - 0.55 * nt);
    const T = (ctx.date.getTime() % 86400000) / 1000;
    const now = ctx.date.getTime();
    const prv = clockFields(new Date(now - 60000)), nxt = clockFields(new Date(now + 60000));
    const cur = f.hh + f.mm;

    // ---- the turn: tau runs -2..0 at the end of a minute and 0..7 at the start of the next
    let tau = 99, from = cur, to = cur, hour = false;
    if (s >= 58) { tau = s - 60; from = cur; to = nxt.hh + nxt.mm; hour = nxt.h !== f.h; }
    else if (s < 7) { tau = s; from = prv.hh + prv.mm; to = cur; hour = prv.h !== f.h; }
    const changing = [0, 1, 2, 3].map((i) => from[i] !== to[i]);
    const anyChange = changing.some((c) => c);
    if (!anyChange) tau = 99;
    const finale = hour && tau >= 0.7 && tau < 6.4 ? tau - 0.7 : -1;   // the grand ecart
    const fl = tau === 99 && s > 3 ? flourish(mk, s) : null;

    // ---- the gas: flicker, the swelling rings of dots, the finale's ring of light
    const flick = 0.5 * (sin(T * 7.1) + sin(T * 11.3 + 1.7)) * 0.5 + (hash(Math.floor(T * 15), 9) & 3) * 0.12;
    let flare = 0;
    if (fl && fl.kind === 'ripple') flare = sm(fl.t / 0.4) * (1 - sm((fl.t - 1.2) / 0.8));
    if (finale >= 0) flare = Math.max(flare, sm(finale / 0.6) * (1 - sm((finale - 4.6) / 1.1)));
    const pulse = Math.max(0, 1 - frac(s) * 4);                     // the gas jumps on the band's beat
    const Lmax = (nt > 0.5 ? 4 : 5) + flare * 2 + flick * 0.6 + pulse * 1.2;
    const Rl = 20 + flare * 14 + flick * 1.5;
    const ringR = finale >= 0.9 ? (finale - 0.9) * 95 : -99;
    for (let d = 0; d < 256; d++) {
      let v = Lmax * (1 - d / Rl);
      if (v > 0) v += 0.9 * cos(d * 0.75 - T * 2.4);                           // Seurat's halo rings
      if (Math.abs(d - ringR) < 5) v = Math.max(v, 5 - Math.abs(d - ringR) * 0.6);
      LV[d] = v < 0 ? 0 : v > 7 ? 7 : v | 0;
    }

    // ---- the ground, as codes
    const cb = CG.buf, fs = (hash(Math.floor(T * 9), 3) & 7) === 0 ? 1 : 0;
    for (let i = 0; i < N; i++) {
      const b = GB[i];
      if (b < FLOOR) { const v = b + LV[LD[i]]; cb[i] = v > WALL + 7 ? WALL + 7 : v; }
      else cb[i] = b + fs;
    }
    CG.cost.px += N; CG.cost.box += N * 3;
    // the footlights' flames along the front edge
    for (let k = 0; k < 9; k++) {
      const x = 6 + k * 19, hgt = 2 + ((hash(k, Math.floor(T * 12)) & 3) === 0 ? 1 : 0);
      CG.fillRect(x, H - hgt, 3, hgt, enc(LAMPG));
      CG.fillRect(x + 1, H - hgt + 1, 1, hgt - 1, enc(LAMPC));
    }
    // the globes (the colon)
    for (const [lx, ly] of LAMPS) {
      CG.fillCircle(lx, ly, 3.6 + flare * 0.5, enc(LAMPG));
      CG.fillCircle(lx, ly, 2.1, enc(LAMPC));
    }
    // flowers thrown from the pit at the finale
    if (finale >= 0.9 && finale < 5.5) {
      for (let k = 0; k < 26; k++) {
        const t0 = 0.9 + (k % 13) * 0.11 + (k >= 13 ? 0.7 : 0), t = finale - t0;
        if (t < 0 || t > 2.6) continue;
        const h = hash(k, 77), v = 95 + (h & 31), x0 = 4 + ((h >>> 5) % 152), vx = ((h >>> 13) % 41) - 20;
        const y = H + 2 - v * t + 45 * t * t, x = x0 + vx * t + 3 * sin(t * 5 + k);
        if (y < H) CG.fillRect(Math.round(x), Math.round(y), 2, 2, enc(CONF));
      }
    }

    // ---- the line
    const wheels = [], cast = [];
    for (let i = 0; i < 4; i++) {
      const dOld = +from[i], dNew = +to[i];
      const ch = changing[i] && tau !== 99;
      // the beat: a ripple of kicks left to right
      const stag = fl && fl.kind === 'ripple' ? 0.14 : 0.07;
      const bt = s - i * stag, p = frac(bt), beatN = Math.floor(bt);
      let k = kickCurve(p);
      const kmax = fl && fl.kind === 'ripple' ? 76 : 62;
      let angA = 0, angB = 0, bob = 0, lean = 0, legLen;
      const kickLeft = (beatN & 1) === 0;
      if (kickLeft) angA = k * kmax * DEG; else angB = k * kmax * DEG;
      bob = -3 * k - 1.5 * (p > 0.55 && p < 0.85 ? sm((p - 0.55) / 0.15) * (1 - sm((p - 0.7) / 0.15)) : 0);
      lean = 2.2 * k;
      let y = TOPY + bob, x = SLOT_X[i];
      const P = {
        x, y, sc: 1, lean, amp: 0.5 + 1.1 * k, phase: T * 4.2 + 3 * ease.inOutQuad(clamp01(p / 0.25)) + i * 2,
        lining: 0, cut: 0, legs: true, angA, angB, nod: k > 0.5 ? 1 : 0,
      };
      if (fl && fl.kind === 'toss') {
        const u = fl.t - i * 0.12;
        P.lining = u > 0 && u < 1.6 ? sm(u / 0.3) * (1 - sm((u - 1.1) / 0.5)) : 0;
        P.amp += P.lining * 0.6;
      }
      if (fl && fl.kind === 'jump') {
        const u = fl.t - 0.2;
        if (u > 0 && u < 0.9) {
          const j = Math.sin((u / 0.9) * Math.PI);
          P.y = TOPY - 6 * j; P.angA = 55 * j * DEG; P.angB = -55 * j * DEG; P.lean = 0;
          P.legLen = FLOOR_Y - (TOPY + HIP_GY + 1);
        }
      }

      // ---- the grand ecart (everyone, after the hour)
      if (finale >= 0) {
        const up = finale < 0.6 ? Math.sin((finale / 0.6) * Math.PI) : 0;
        const drop = finale < 0.45 ? 0 : finale < 4.4 ? ease.outBack(clamp01((finale - 0.45) / 0.35)) : 1 - ease.inOutCubic(clamp01((finale - 4.4) / 0.9));
        const split = clamp01(drop);
        P.y = TOPY - 6 * up + 17 * drop;
        P.legLen = FLOOR_Y - (TOPY + HIP_GY + 1);
        P.angA = (split * 88 + up * 50) * DEG + (1 - split) * P.angA * (up > 0 ? 0 : 1);
        P.angB = -(split * 88 + up * 50) * DEG;
        P.lean = 0;
        if (drop > 0.2) { P.amp = 1.2 + 0.5 * sin(T * 14 + i); P.phase = T * 9 + i * 2; }
        P.nod = finale > 0.6 && finale < 4.4 ? ((Math.floor(finale * 4) + i) & 1) : 0;
      }

      if (ch) {
        if (hour) {
          // fold into a cartwheel where she stands, turn over, spring up
          const cx = SLOT_X[i] + CXG, cy = TOPY + CYG;
          if (tau < -1.0) { cast.push([dOld, P]); continue; }
          if (tau < -0.55) {
            const u = (tau + 1.0) / 0.45;
            P.sc = 1 - 0.6 * ease.inQuad(u); P.legs = u < 0.5; P.y = TOPY; P.lean = 0;
            cast.push([dOld, P]);
            wheels.push([cx, cy, -u * 3, 9 * sm(u), sm(u)]);
            continue;
          }
          if (tau < 0) {
            const u = (tau + 0.55) / 0.55, hop = Math.sin(u * Math.PI);
            wheels.push([cx, cy - 7 * hop, -3 - u * 13, 9, 1]);
            continue;
          }
          if (tau < 0.45) {
            const u = tau / 0.45;
            P.sc = 0.5 + 0.5 * ease.outBack(u); P.y = TOPY; P.lean = 0; P.legs = u > 0.5;
            if (u < 0.3) wheels.push([cx, cy, -16 - u * 4, 9 * (1 - u / 0.3), 1 - u / 0.3]);
          }
          cast.push([dNew, P]);
          continue;
        }
        // minute: high kick and skip off right; cartwheel in from the right
        let leftmost = 3;
        for (let j = 0; j < 4; j++) if (changing[j]) { leftmost = j; break; }
        if (tau < 0) {
          if (tau < -1.8) { cast.push([dOld, P]); continue; }
          if (tau < -1.4) {
            // the big kick before she goes
            const u = (tau + 1.8) / 0.4, kk = Math.sin(u * Math.PI);
            P.angA = kk * 78 * DEG; P.angB = 0; P.y = TOPY - 2 * kk; P.lean = 2 * kk; P.amp = 0.6 + kk;
            cast.push([dOld, P]);
            continue;
          }
          if (tau < -0.55) {
            const u = (tau + 1.4) / 0.85, E = W + 14 - SLOT_X[leftmost];
            const run = Math.pow(u, 1.7);
            P.x = SLOT_X[i] + E * run;
            const sk = sin(u * 26);
            P.angA = Math.max(0, sk) * 55 * DEG; P.angB = Math.max(0, -sk) * -40 * DEG;
            P.y = TOPY - 2 * Math.abs(sk); P.lean = 2.2; P.cut = sm((u - 0.4) / 0.55);
            if (P.x < W + 4) cast.push([dOld, P]);
          }
          if (tau < -0.95) continue;
        }
        // the wheel rolls in from the right
        const cxs = SLOT_X[i] + CXG, E2 = W + 14 - SLOT_X[leftmost];
        if (tau < 0.05) {
          const u = clamp01((tau + 0.95) / 1.0), xx = cxs + E2 * (1 - ease.outQuad(u));
          wheels.push([xx, 53, -xx / 18, 9, 1]);
          continue;
        }
        if (tau < 0.45) {
          const u = (tau - 0.05) / 0.4;
          if (u > 0) {
            P.sc = 0.55 + 0.45 * ease.outBack(u); P.y = TOPY + (1 - u) * 10; P.lean = 0;
            P.legs = u > 0.45; P.angA = 0; P.angB = 0;
            cast.push([dNew, P]);
          }
          if (u < 0.35) wheels.push([cxs, 53 - 22 * ease.outQuad(u / 0.35), -cxs / 18 - u * 3, 9 * (1 - u / 0.35), 1 - u / 0.35]);
          continue;
        }
        cast.push([dNew, P]);
        continue;
      }
      cast.push([ch ? dNew : +cur[i], P]);
    }
    for (const [cx, cy, a, sz, lb] of wheels) if (sz > 0.5) cartwheel(cx, cy, a, sz, lb);
    for (const [d, P] of cast) dancer(d, P);

    // ---- the dots: each dot's pick this frame, and night as dots repainted
    const nthr = (nt * 256) | 0;
    const front = s * 1.0;
    for (let d = 0; d < NDOTS; d++) {
      const off = NM[d] < nthr ? NIGHT_OFF : 0, ph = PH[d] * (1 / 256);
      const es = (T * 0.65 + ph) | 0, ef = (T * 1.6 + ph) | 0, fr = (front - DX[d] * 0.005) | 0;
      PO[2 * d] = off + RND[(d * 7 + es * 131) & 8191];
      PO[2 * d + 1] = off + RND[(d * 13 + ef * 151 + fr * 97) & 8191];
    }
    g.cost.box += NDOTS * 12;

    // ---- paint: every pixel is its dot's pigment in its own mixture
    const out = g.buf;
    for (let i = 0; i < N; i++) {
      const c = cb[i];
      out[i] = LUT[(c << 8) + PO[(DOT[i] << 1) + (c >= FAST ? 1 : 0)]];
    }
    g.cost.px += N; g.cost.box += N * 4;
    for (const k in CG.cost) { g.cost[k] += CG.cost[k]; CG.cost[k] = 0; }
  },
};
