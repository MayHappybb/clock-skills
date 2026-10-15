// Ukiyo-e: the glass is a woodblock print after Hokusai's Great Wave, and
// the time is its foam. A great wave rises from the left edge and breaks to
// the right, its lip clawing over Fuji; a far wave answers it from the
// right. The hours are cut into the great wave and the minutes into the far
// one as white foam letters (ukiyoe-glyphs.js: brush-stroke numerals whose
// ends curl like crests, keylined in sumi, with an indigo block printed a
// pixel out of register under them). Fuji sits small in the trough between,
// as in the print; oshiokuri boats row through the seigaiha sea in front; a
// cartouche gives the weekday in a carved hand, with the publisher's seal.
//
// Always alive, in the medium's own few effects: the talons along both lips
// reach out and draw back in a wave running along each crest, and beads of
// spray fly off them and fall; a sheen of mica (kirazuri) glints across the
// sky every 17 s; the sea rolls in; plovers cross the gap with a rolling
// wing-beat; and each season has its weather (spring petals, Hiroshige's
// sudden shower every third summer minute, maple leaves, snow).
//
// Minute turn: the print is made block by block. From :57.85 the changing
// numeral's blocks lift off one at a time (bubbles, offset block, foam,
// keyline last) and the wave's blue shows through; after :00 the new one is
// printed: the white block presses down and settles into register, then the
// sumi keyblock snaps onto it, then the indigo offset block, then the
// bubbles, each sliding the last few pixels into place. Done by :02. Old
// blocks only lift and new ones only arrive after :00, so the time is never
// wrong; at midnight the strip is empty for ~0.6 s.
// Hour: the publisher re-issues the print in the next season (spring,
// summer, autumn, winter in turn). The printer's baren rubs across the sheet
// in long up-and-down strokes and the new colours show exactly where it has
// rubbed: sky bokashi, Fuji (blue, then Red Fuji in autumn, white in
// winter), wave and sea. The foam numerals and keylines stay put.
//
// Palette: the woodblock printer's: Prussian blue in a bokashi from pale
// crest to deep foot, sumi keylines, gofun white foam, persimmon and
// vermilion skies wiped in bokashi (the medium's one gradient, dithered),
// the cartouche's yellow and the seal's vermilion; washi fibre shows through
// every block a shade paler. Night is a moonlit re-issue: indigo sky, lighter
// wave block, pale foam numerals, the backlight at 40 %.
//
// Hard pixels for the print (it is cut wood and paper); AA only for what
// glides over it: spray, boats, birds, weather, the baren.
//
// Cost: the print is one integer pass through the season's 128-entry
// palette (a byte map lookup, a claw test, a mica test, the front compare),
// then the four numerals from byte maps; while a block prints or lifts it
// is sampled bilinearly at its offset with dithered coverage (priced in
// g.cost.box). Nothing is redrawn outside the canvas. Flash: print map,
// claw ranks and claw blocks 3 x 12.8 KB, numeral maps 32.8 KB, palettes
// 2 KB: about 73 KB.

import { to565, mix, rand, sin, cos, clockFields, ease, progress, clamp } from '../js/kit.js';
import { SLOTS, GM, M_KEY, M_SHADOW, M_CORE, M_FOAM } from './ukiyoe-glyphs.js';
import { MAP, SKY_N, PALS, PALS_NIGHT, KANJI, SEAL, SEA_Y, CLAW_RANK, CLAW_IDX, CLAW_TIPS } from './ukiyoe-print.js';

const W = 160, H = 80, TAU = Math.PI * 2;
const BAYER = Uint8Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], (v) => v * 16 + 8);

// ------------------------------------------------------------ the inks of the numerals
// sumi keyline, the deep indigo offset block, pale ai bubbles, and the
// foam: gofun white (bare paper in the original)
const INK_DAY = [0, 0x1b1a26, 0x101a40, 0x86acd4, 0xf8f4e8];
const INK_NIGHT = [0, 0x060812, 0x0a1028, 0x7c98cc, 0xe4ecfc];
function inks(base) {
  const t = new Uint16Array(16);
  for (let m = 1; m <= 4; m++) { t[m] = to565(base[m]); t[m + 8] = to565(mix(base[m], m === 4 ? 0xd8d0c0 : 0xffffff, m === 1 ? 0.06 : 0.1)); }
  return t;
}
const INKS = [inks(INK_DAY), inks(INK_NIGHT)];

// ------------------------------------------------------------ timing of a minute turn
// Before :00 the old numeral's blocks lift off one at a time (bubbles,
// offset block, foam, keyline last) and the wave's blue shows through; after
// :00 the new one is printed block by block, each pressing down and settling
// into register from its own offset: the white first (so the shape is there
// at once), then the sumi keyblock snapping onto it, the indigo offset block,
// the bubbles.
const LIFT = [];  LIFT[M_CORE] = 57.85; LIFT[M_SHADOW] = 58.25; LIFT[M_FOAM] = 58.65; LIFT[M_KEY] = 59.05;
const PRESS = []; PRESS[M_FOAM] = 0.1; PRESS[M_KEY] = 0.6; PRESS[M_SHADOW] = 1.05; PRESS[M_CORE] = 1.45;
const FROM = [];  FROM[M_FOAM] = [0, -4]; FROM[M_KEY] = [-3.5, -2.5]; FROM[M_SHADOW] = [3.5, 3]; FROM[M_CORE] = [3, -2];
const DUR = 0.6, LDUR = 0.45, PRESS_END = 2.05;
const settle = (u) => (1 - u) * (1 - u) * cos(u * Math.PI * 1.5);
const LAYER_ORDER = [M_SHADOW, M_FOAM, M_CORE, M_KEY];

const seasonOf = (h) => h % 4;

// per-frame scratch, reused (no allocation in the hot loops)
const clawLen = new Uint8Array(64);
const LA = new Int32Array(5), LOX = new Float32Array(5), LOY = new Float32Array(5);

export default {
  name: 'Ukiyo-e',
  blurb: 'A Hokusai print: the time is foam on two great waves either side of Fuji, printed block by block each minute; each hour the print is re-issued in the next season.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, buf = g.buf;
    const tt = f.h * 3600 + f.m * 60 + s;
    const nt = ctx.night;
    ctx.lcd.backlight(1 - 0.6 * nt);

    const prev = clockFields(new Date(ctx.date.getTime() - 60000));
    const next = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm, old = prev.hh + prev.mm, nxt = next.hh + next.mm;

    // ---- the season, and the hour's re-issue front
    const hourShow = prev.h !== f.h && s < 8;
    const sNew = seasonOf(f.h), sOld = hourShow ? seasonOf(prev.h) : sNew;
    let front = 999;
    if (hourShow) front = rubbed(s);

    // ---- the claws: each talon reaches out and draws back, a wave of it running along the lip
    for (let c = 0; c < 64; c++) {
      const v = 2.2 + 1.5 * sin(tt * 2.1 - c * 0.7) + 0.6 * sin(tt * 4.7 + c * 1.9);
      clawLen[c] = v < 0 ? 0 : v > 3.99 ? 4 : v | 0;
    }

    // ---- the print: one pass through the season's palette, the mica sheen riding on the sky
    const band = -40 + 240 * ((tt % 17) / 17);
    for (let y = 0, i = 0; y < H; y++) {
      const fy = hourShow ? EDGE[y] : 999;
      let q = -band + 0.6 * y;
      for (let x = 0; x < W; x++, i++, q++) {
        const th = BAYER[((y & 3) << 2) | (x & 3)];
        const P = (nt >= 1 || (nt > 0 && nt * 256 > th) ? PALS_NIGHT : PALS)[x + (th >> 6) < fy ? sNew : sOld];
        const v = MAP[i];
        let k = v & 127;
        const cr = CLAW_RANK[i];
        if (cr && ((cr - 1) & 3) < clawLen[(cr - 1) >> 2]) k = CLAW_IDX[i];
        else if ((v & 63) < SKY_N && q > -7 && q < 7) {
          if (v & 128) { buf[i] = q > -2.5 && q < 2.5 ? P.glint : P.glintSoft; continue; }
          if (q > -3.5 && q < 3.5) k |= 64;
        }
        buf[i] = P.t[k];
      }
    }
    g.cost.px += W * H; g.cost.box += W * H * 6;

    spray(g, tt, nt);
    sea(g, tt, nt);
    boats(g, tt, nt);
    weather(g, tt, f, nt, sOld, sNew, front);

    // ---- the numerals, printed into the waves
    const ink = INKS[nt >= 0.5 ? 1 : 0];
    for (let k = 0; k < 4; k++) {
      const changing = old[k] !== cur[k], leaving = nxt[k] !== cur[k];
      let state = 0;
      for (let m = 1; m <= 4; m++) { LA[m] = 256; LOX[m] = 0; LOY[m] = 0; }
      if (changing && s < PRESS_END) {
        state = 1;
        for (let m = 1; m <= 4; m++) {
          const u = progress(s, PRESS[m], PRESS[m] + DUR);
          LA[m] = Math.round(256 * clamp(u * 4, 0, 1));
          const e = settle(u);
          LOX[m] = FROM[m][0] * e; LOY[m] = FROM[m][1] * e;
        }
      } else if (leaving && s > LIFT[M_CORE]) {
        state = 1;
        for (let m = 1; m <= 4; m++) {
          const u = ease.inOutQuad(progress(s, LIFT[m], LIFT[m] + LDUR));
          LA[m] = Math.round(256 * (1 - u));
          LOX[m] = 1.2 * u; LOY[m] = -3.2 * u;
        }
      }
      drawSlot(g, k, +cur[k], state, ink);
    }

    birds(g, tt, nt);
    if (nt > 0) moon(g, nt);
    cartouche(g, f, nt);
    if (hourShow && s > B_T0 - 0.3 && s < B_T1 + 0.3) baren(g, s);
  },
};

// ------------------------------------------------------------ one numeral

function drawSlot(g, k, d, state, ink) {
  const sl = SLOTS[k], S = sl.S, mat = S.glyphs[d].mat, buf = g.buf, tw = S.tw, th = S.th;
  const ox = sl.x - GM, oy = sl.y - GM;
  let n = 0;
  if (state === 0) {
    for (let y = 0; y < th; y++) {
      const py = oy + y;
      if (py < 0 || py >= H) continue;
      for (let x = 0; x < tw; x++) {
        const px = ox + x, m = mat[y * tw + x];
        if (!m || px < 0 || px >= W) continue;
        const i = py * W + px;
        buf[i] = ink[m + ((MAP[i] & 64) >> 3)];
        n++;
      }
    }
    g.cost.px += n; g.cost.box += tw * th * 2;
    return;
  }
  // printing or lifting: each block sampled at its own fractional offset, its coverage dithered
  for (let li = 0; li < 4; li++) {
    const m = LAYER_ORDER[li], A = LA[m];
    if (A <= 0) continue;
    const fx0 = Math.floor(LOX[m]), fy0 = Math.floor(LOY[m]);
    const fx = ((LOX[m] - fx0) * 256) | 0, fy = ((LOY[m] - fy0) * 256) | 0;
    const w00 = ((256 - fx) * (256 - fy)) >> 8, w10 = (fx * (256 - fy)) >> 8, w01 = ((256 - fx) * fy) >> 8, w11 = (fx * fy) >> 8;
    for (let y = -4; y < th + 4; y++) {
      const py = oy + y;
      if (py < 0 || py >= H) continue;
      const sy = y - fy0 - 1;   // sample rows sy and sy + 1 straddle the block's offset position
      for (let x = -4; x < tw + 4; x++) {
        const px = ox + x;
        if (px < 0 || px >= W) continue;
        const sx = x - fx0 - 1;
        let cov = 0;
        if (sy >= 0 && sy < th) {
          const r = sy * tw;
          if (sx >= 0 && sx < tw && mat[r + sx] === m) cov += w11;
          if (sx + 1 >= 0 && sx + 1 < tw && mat[r + sx + 1] === m) cov += w01;
        }
        if (sy + 1 >= 0 && sy + 1 < th) {
          const r = (sy + 1) * tw;
          if (sx >= 0 && sx < tw && mat[r + sx] === m) cov += w10;
          if (sx + 1 >= 0 && sx + 1 < tw && mat[r + sx + 1] === m) cov += w00;
        }
        if (!cov || ((cov * A) >> 8) <= BAYER[((py & 3) << 2) | (px & 3)]) continue;
        const i = py * W + px;
        buf[i] = ink[m + ((MAP[i] & 64) >> 3)];
        n++;
      }
    }
    g.cost.box += (tw + 8) * (th + 8) * 10;
  }
  g.cost.px += n;
}

// ------------------------------------------------------------ spray: beads thrown off the talons, falling back

function spray(g, tt, nt) {
  const c = nt >= 0.5 ? 0xdce4f4 : 0xfbf8ee, edge = nt >= 0.5 ? 0x080a18 : 0x1d3c74;
  for (let j = 0; j < CLAW_TIPS.length; j += 2) {
    const tip = CLAW_TIPS[j], L = tip[2];
    const per = 2.1 + 0.6 * rand(j, 1), ph = (tt + rand(j, 2) * per) % per, u = ph / per;
    if (u > 0.7) continue;
    const vx = L * (4 + 4 * rand(j, 3)), vy = -(5 + 4 * rand(j, 4));
    const x = tip[0] + vx * ph, y = tip[1] + vy * ph + 8 * ph * ph;
    const a = 1 - progress(u, 0.45, 0.7);
    g.fillCircle(x, y, 1.0, edge, { aa: true, a: 0.7 * a });
    g.fillCircle(x, y, 0.62, c, { aa: true, a });
  }
}

// ------------------------------------------------------------ the near sea and its boats

function sea(g, tt, nt) {
  const crest = nt >= 0.5 ? 0xb8c8e4 : 0xf4efe2, line = nt >= 0.5 ? 0x0e1a3c : 0x1d3c74;
  for (let row = 0; row < 2; row++) {
    const y = SEA_Y + 4 + row * 5, sp = 9, off = ((tt * (3 + row * 1.6) + row * 4.5) % sp);
    for (let x = -sp + off; x < W + sp; x += sp) {
      g.arc(x, y + 1, 3.2, 4.3, -1.45, 1.45, line, { aa: true });
      g.arc(x, y + 1.2, 2.1, 3.0, -1.2, 1.25, crest, { aa: true, a: 0.85 });
    }
  }
}

function boats(g, tt, nt) {
  const hull = nt >= 0.5 ? 0x9a8c6a : 0xd8b878, keel = nt >= 0.5 ? 0x0a0c1c : 0x1b1a26, crew = nt >= 0.5 ? 0x6d84b0 : 0x3d5c8c;
  for (let b = 0; b < 2; b++) {
    const span = W + 60, x = ((tt * (2.2 + b * 0.9) + b * 97) % span) - 30;
    const y = SEA_Y + 3.4 + b * 2.6 + 0.9 * sin(tt * 1.6 + b * 2);
    const tilt = 0.5 * cos(tt * 1.6 + b * 2);
    g.fillPolygon([[x, y - tilt], [x + 20, y + tilt], [x + 17, y + 2 + tilt], [x + 3, y + 2 - tilt]], hull, { aa: true });
    g.thickLine(x + 0.5, y + 2.2 - tilt, x + 19.5, y + 2.2 + tilt, 1, keel, { aa: true });
    for (let r = 0; r < 6; r++) g.fillCircle(x + 4 + r * 2.4, y - 0.8 + tilt * ((r * 2.4 - 8) / 10), 0.9, crew, { aa: true });
  }
}

// ------------------------------------------------------------ plovers over the gap, in a rolling wing-beat

function birds(g, tt, nt) {
  const c = nt >= 0.5 ? 0xc8d2ea : 0x1b1a26;
  const cx = 96 + 6 * sin(tt * TAU / 47), cy = 30 + 3 * sin(tt * TAU / 31);
  for (let b = 0; b < 4; b++) {
    const x = cx + (b - 1.5) * 5.5 + 1.2 * sin(tt * 0.7 + b), y = cy + Math.abs(b - 1.5) * 1.8 - 2 + 0.8 * sin(tt * 0.9 + b * 1.3);
    const lift = 1.6 * sin(tt * 7 - b * 1.1);
    g.thickLine(x - 2.2, y - lift, x, y + 0.6, 0.9, c, { aa: true });
    g.thickLine(x, y + 0.6, x + 2.2, y - lift, 0.9, c, { aa: true });
  }
}

// ------------------------------------------------------------ the season's weather

function weather(g, tt, f, nt, sOld, sNew, front) {
  for (let side = 0; side < (sOld === sNew ? 1 : 2); side++) {
    const season = side ? sOld : sNew, lo = side ? front : -99, hi = side ? 999 : front;
    if (season === 0) {               // spring: cherry petals
      for (let p = 0; p < 12; p++) {
        const x = (rand(p, 1) * 200 + tt * (6 + 3 * rand(p, 2)) + 4 * sin(tt * 1.3 + p)) % 200 - 20;
        const y = (rand(p, 3) * 90 + tt * (5 + 2 * rand(p, 4))) % 90 - 5;
        if (x < lo || x > hi) continue;
        g.fillEllipse(x, y, 1.3, 0.8 + 0.4 * sin(tt * 3 + p), nt >= 0.5 ? 0xd0a8c0 : 0xf2b4c2, { aa: true });
      }
    } else if (season === 1) {        // summer: a sudden shower, every third minute
      if (f.minuteKey % 3 !== 0) continue;
      const amt = progress(f.sec, 6, 12) * (1 - progress(f.sec, 46, 54));
      const n = Math.round(46 * amt);
      for (let r = 0; r < n; r++) {
        const ph = (rand(r, 8) * 100 + tt * 64) % 100 - 10;
        const x = rand(r, 7) * 190 - ph * 0.3, y = ph;
        if (x < lo || x > hi) continue;
        g.line(x, y, x - 1.6, y + 6, nt >= 0.5 ? 0x8090b8 : 0x2a3448, { a: 0.55 });
      }
    } else if (season === 2) {        // autumn: maple leaves tumbling
      for (let p = 0; p < 7; p++) {
        let x = (rand(p, 11) * 200 - tt * (5 + 2 * rand(p, 12)) + 6 * sin(tt * 0.9 + p)) % 200;
        x = x < 0 ? x + 180 : x - 20;
        const y = (rand(p, 13) * 90 + tt * (4 + 2 * rand(p, 14))) % 90 - 5;
        if (x < lo || x > hi) continue;
        const a = tt * 1.7 + p, col = nt >= 0.5 ? 0xa05060 : 0xc8381e;
        for (let l = 0; l < 5; l++) g.thickLine(x, y, x + 1.8 * sin(a + l * 1.2566), y - 1.8 * cos(a + l * 1.2566), 1, col, { aa: true });
      }
    } else {                          // winter: snow
      for (let p = 0; p < 34; p++) {
        let x = (rand(p, 21) * 180 + 3 * sin(tt * 0.8 + p * 0.7) - tt * 1.5) % 180;
        x = x < 0 ? x + 170 : x - 10;
        const y = (rand(p, 22) * 86 + tt * (6 + 4 * rand(p, 23))) % 86 - 3;
        if (x < lo || x > hi) continue;
        g.fillCircle(x, y, 0.6 + 0.5 * rand(p, 24), 0xfafaf8, { aa: true });
      }
    }
  }
}

function moon(g, nt) {
  g.fillCircle(97, 13, 5, 0xf2ead0, { aa: true, a: clamp(nt * 1.5, 0, 1) });
}

// ------------------------------------------------------------ title cartouche and seal

function cartouche(g, f, nt) {
  const field = nt >= 0.5 ? 0x8a7c58 : 0xecc860, key = nt >= 0.5 ? 0x0a0c1c : 0x1b1a26, red = nt >= 0.5 ? 0x8a3a3a : 0xc4382a;
  const X = 146, Y = 2;
  g.fillRect(X, Y, 11, 12, field);
  g.rect(X, Y, 11, 12, key);
  const kj = KANJI[f.wday];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 7; c++) if (kj[r][c]) g.pixel(X + 2 + c, Y + 2 + r, key);
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) g.pixel(138 + c, 3 + r, SEAL[r][c] ? red : field);
}

// ------------------------------------------------------------ the baren, rubbing the new season in
// At the hour the printer pulls the next state of the print: the baren (a
// disc of coiled cord under a twisted bamboo-sheath cover) rubs across the
// sheet in up-and-down strokes, and the new season's colours show exactly
// where it has rubbed. EDGE[y] is how far right row y has been rubbed.

const B_T0 = 0.4, B_T1 = 6.9, B_R = 9, B_LEG = 0.62;
const EDGE = new Float32Array(H);
const CHORD = Float32Array.from({ length: B_R + 1 }, (_, d) => Math.sqrt(B_R * B_R - d * d));
const barenX = (s) => -B_R - 2 + (W + 2 * B_R + 4) * ((s - B_T0) / (B_T1 - B_T0));
const barenY = (s) => {
  const u = (s - B_T0) / B_LEG, k = Math.floor(u), f = u - k, e = f * f * (3 - 2 * f);
  return 6 + 68 * ((k & 1) ? 1 - e : e);
};

/** Fill EDGE for time s; returns the leftmost edge (for the weather split). */
function rubbed(s) {
  const t = s < B_T0 ? B_T0 : s > B_T1 ? B_T1 + 2 : s;
  const base = s <= B_T0 ? -99 : barenX(t - 2 * B_LEG) - B_R;
  for (let y = 0; y < H; y++) EDGE[y] = base;
  if (s <= B_T0) return -99;
  if (s > B_T1 + 1) { EDGE.fill(999); return 999; }
  // the strokes of the last two legs: each sample rubs the rows under the disc
  for (let q = 0; q < 2 * B_LEG * 60; q++) {
    const ts = t - q / 60;
    if (ts < B_T0) break;
    const bx = barenX(ts), by = barenY(ts), y0 = Math.max(0, Math.ceil(by - B_R)), y1 = Math.min(H - 1, Math.floor(by + B_R));
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - by, e = bx + CHORD[(dy < 0 ? -dy : dy) | 0];
      if (e > EDGE[y]) EDGE[y] = e;
    }
  }
  let lo = 999;
  for (let y = 0; y < H; y++) if (EDGE[y] < lo) lo = EDGE[y];
  return lo;
}

function baren(g, s) {
  const t = s < B_T0 ? B_T0 : s > B_T1 ? B_T1 : s;
  const bx = barenX(t), by = barenY(t);
  const a = progress(s, B_T0 - 0.3, B_T0) * (1 - progress(s, B_T1, B_T1 + 0.3));
  const key = 0x1b1a26, sheath = 0xc8a868, coil = 0x8a6a3c, knot = 0x6e5230;
  g.fillCircle(bx + 1.2, by + 1.2, B_R + 0.6, 0x101a40, { aa: true, a: 0.35 * a });   // the printer's flat shadow
  g.fillCircle(bx, by, B_R + 0.6, key, { aa: true, a });
  g.fillCircle(bx, by, B_R - 0.4, sheath, { aa: true, a });
  // the sheath's folds gathered toward the handle, and the twisted handle across the back
  for (let k = -1; k <= 1; k += 2) g.thickLine(bx + k * 7.2, by - 3.5, bx + k * 3.2, by, 0.9, coil, { aa: true, a });
  for (let k = -1; k <= 1; k += 2) g.thickLine(bx + k * 7.2, by + 3.5, bx + k * 3.2, by, 0.9, coil, { aa: true, a });
  g.fillRoundRect(bx - 2.4, by - B_R + 0.6, 4.8, 2 * B_R - 1.2, 2.2, key, { aa: true, a });
  g.fillRoundRect(bx - 1.6, by - B_R + 1.2, 3.2, 2 * B_R - 2.4, 1.4, knot, { aa: true, a });
  for (let k = -6; k <= 6; k += 2) g.thickLine(bx - 1.3, by + k - 0.8, bx + 1.3, by + k + 0.8, 0.8, sheath, { aa: true, a });
  g.fillCircle(bx, by - B_R + 0.4, 2.2, key, { aa: true, a });
  g.fillCircle(bx, by - B_R + 0.4, 1.4, knot, { aa: true, a });
  g.fillCircle(bx, by + B_R - 0.4, 2.2, key, { aa: true, a });
  g.fillCircle(bx, by + B_R - 0.4, 1.4, knot, { aa: true, a });
}
