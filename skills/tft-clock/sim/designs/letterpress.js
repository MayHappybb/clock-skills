// Letterpress: the glass is the bed of a jobbing press, and the time is wood
// type locked up in the chase. Each numeral is a block of end-grain maple
// (its growth rings show on the shoulder) with the figure standing proud of
// it, cut in a French Clarendon, the reverse-contrast wood type of the
// playbill and the WANTED poster (letterpress-type.js): heavy horizontals,
// light verticals, slab spurs. Hours in 64-line type, minutes in 40-line
// above a line of Gothic for the weekday, a pair of lozenges for the colon
// and a printer's star: a poster lockup, not a row of digits.
//
// The time is worked every second, as a press works it: on the beat the
// platen kisses the form, the ink squashes a pixel fat round every figure,
// and when the sheet comes away the ink has split: every face is left
// salty and starved, the bare wood showing through in streaks along the
// grain, a different pattern each pull. Then the inking roller (a band of
// ink-covered composition) runs over the form, down on even seconds and up
// on odd, and behind it every figure is solid and fresh again, with the
// little ridge of ink a roller leaves on an edge. Every 15 s the minute has
// a bigger move: at :15 and :45 a proof is pulled: the impression cylinder
// rolls a cream sheet down over the form, and the time stands printed on
// it, salt, halo, bite and all, until the sheet is peeled back; at :30 the
// fountain is split and for eight beats the roller lays a rainbow roll (four
// inks blended across the form, drifting as the vibrator roller swings).
//
// Minute turn: the press stops. The compositor scrubs the changing blocks
// clean with a rag (the ink leaves evenly, by a fixed rank, so the figure
// thins and never turns into another one), lifts them out of the chase, and
// drops the new blocks in, bare wood, where a brayer inks them up evenly
// over two strokes. The hour: a three-colour poster run. The cylinder lays a
// sheet and prints the figures in the hour's ink, rolls back to overprint a
// drop-shadow form in a second ink, and rolls again with a split-fountain
// solid (yellow to orange to pink) over everything; transparent inks
// multiply where they cross. Then the sheet is peeled away and the form,
// re-inked in the hour's new colour, runs on.
//
// Palette: only what is in a print shop. Maple shoulders and pale bare faces
// (four tones each, the rings and pores), the dark bed and iron chase, cream
// rag paper with fibres, and real printing inks: one deep ink an hour
// (ultramarine, crimson, black, green, purple, burnt orange), the shadow
// ink, the fountain's yellow-orange-pink, all overprinting by multiply. The
// inked figure is the darkest thing on the glass; the wood is calm and warm.
// Every surface is flat: the "depth" is the ink ridge, the rim of squashed
// ink and the one-pixel bite in the paper, as on a real print. At night the
// backlight drops to 45 % and the inks stay deep against the pale wood.
//
// Cost: one pass over the glass of byte-table lookups (block code, grain
// tone, rank; a handful of integer ops a pixel, billed as box work), the
// roller and the sheet rows the same way, and a few kit rects. No per-minute
// work at all: every block face is precomputed for every glyph (flash).

import { clockFields, sin, cos, ease, clamp, progress, to565, rgb, mix, scale, hex, R, G, B } from '../js/kit.js';
import { W, H, N, SLOTS, BLOCK, GRAIN, BG, RANK, PAPER, mul, FORM_BYTES } from './letterpress-form.js';
import { TYPE_BYTES } from './letterpress-type.js';

// ------------------------------------------------------------ inks and wood
const INKS = ['#23347a', '#9e1b32', '#211d22', '#1a5843', '#4c2063', '#124a5e'].map(hex);
const SHADOW_INK = ['#e0482a', '#2c6fc0', '#e0482a', '#d8407a', '#e08a24', '#e0482a'].map(hex);
const RAINBOW = ['#a01c3c', '#5a2070', '#22378a', '#17634a'].map(hex);
const FOUNTAIN = ['#f4d23e', '#f39a3a', '#ee6a92'].map(hex);
const SHOULDER = ['#c49a66', '#b38956', '#a57b4a', '#cfa673'].map(hex);
const FACE = ['#ecd3a6', '#e4c99a', '#d9bc8b', '#f2dcb2'].map(hex);
const BITE = to565(hex('#7a5631')), LIP = to565(hex('#d9b47e'));
const SH565 = Uint16Array.from(SHOULDER, to565), FACE565 = Uint16Array.from(FACE, to565);
const PAPERS = ['#efe4cc', '#e7dbc1', '#dccfb3', '#b7a68c'].map(hex);

const inkOfHour = (h) => INKS[h % INKS.length];

/** A per-column ink table: [body, edge ridge, starved, squash rim] for each x. */
const INK_TABS = new Map();
function inkTable(key, colourAt) {
  let t = INK_TABS.get(key);
  if (!t) {
    t = new Uint16Array(W * 4);
    for (let x = 0; x < W; x++) {
      const c = colourAt(x);
      t[x * 4] = to565(c);
      t[x * 4 + 1] = to565(scale(c, 0.72));
      t[x * 4 + 2] = to565(mix(c, SHOULDER[0], 0.5));
      t[x * 4 + 3] = to565(mix(c, SHOULDER[1], 0.25));
    }
    INK_TABS.set(key, t);
    if (INK_TABS.size > 24) INK_TABS.delete(INK_TABS.keys().next().value);
  }
  return t;
}
function rampAt(stops, u) {
  u = clamp(u, 0, 1) * (stops.length - 1);
  const k = Math.min(stops.length - 2, Math.floor(u));
  return mix(stops[k], stops[k + 1], u - k);
}
const RAIN_FROM = 30, RAIN_TO = 37;
function passInk(h, n) {
  if (n >= RAIN_FROM && n <= RAIN_TO) {
    const off = Math.round(14 * Math.sin(n * 1.9));        // the vibrator roller swings the blend
    return inkTable(`r${off}`, (x) => rampAt(RAINBOW, (x + off + 10) / (W + 20)));
  }
  const c = inkOfHour(h);
  return inkTable(`h${h % INKS.length}`, () => c);
}

// ------------------------------------------------------------ where each block's glyph comes from
const glyphsOf = (f) => [+f.hh[0], +f.hh[1], 0, +f.mm[0], +f.mm[1], f.dow[0], f.dow[1], f.dow[2], 0];
const SLOT_ID = new Int8Array(N).fill(-1);
SLOTS.forEach((s, k) => { for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) SLOT_ID[y * W + x] = k; });

// ------------------------------------------------------------ the minute's timetable
const PROOFS = [15, 45];
const PROOF = { lay: [0.1, 1.1], hold: 2.3, peel: [2.3, 3.3] };
const HOUR = { p1: [1.0, 2.0], p2: [2.4, 3.4], p3: [3.8, 4.8], peel: [6.0, 7.0] };
const TURN = { wash: [58.95, 59.4], lift: [59.4, 59.92], drop: [0.08, 0.56], ink: [0.56, 1.06] };
const SALT_T = 112;                      // a starved face keeps ink on ~56 % of its pixels

function paused(n, hourShow) {
  if (n === 59 || n === 0) return true;
  for (const b of PROOFS) if (n >= b && n <= b + 3) return true;
  return hourShow && n <= 7;
}
/** The last second before n in which the roller ran. */
function lastPass(n, hourShow) {
  for (let k = n - 1; k > n - 12; k--) if (k >= 0 && !paused(k, hourShow)) return k;
  return n - 12;
}

const sheetSpan = (u) => -8 + ease.inOutQuad(u) * (H + 16);       // the cylinder's line, top to bottom

// ------------------------------------------------------------ drawing a block
const ST = {
  pass: false, front: 0, down: true, split: false, squash: false,
  cur: null, prev: null, saltX: 0, saltY: 0, rowMax: H,
};

function drawBlock(g, k, glyph, ox, oy, cov) {
  const s = SLOTS[k], C = BLOCK[k][glyph], T = GRAIN[k], buf = g.buf;
  const x0 = Math.max(0, s.x + ox), x1 = Math.min(W, s.x + s.w + ox);
  const y0 = Math.max(ST.rowMin, s.y + oy), y1 = Math.min(ST.rowMax, s.y + s.h + oy);
  if (x0 >= x1 || y0 >= y1) return;
  const cv = Math.round(cov * 256), { pass, front, down, split, squash, cur, prev, saltX, saltY } = ST;
  for (let Y = y0; Y < y1; Y++) {
    const ly = Y - s.y - oy, row = ly * s.w, behind = pass && (down ? Y < front : Y > front);
    const tab = behind ? cur : prev, sRow = ((Y + saltY) % H) * W;
    for (let X = x0; X < x1; X++) {
      const li = row + X - s.x - ox, c = C[li];
      let v;
      if (c === 0) v = SH565[T[li]];
      else if (c >= 3) v = squash && !behind ? tab[X * 4 + 3] : cv < 256 ? (c === 4 ? BITE : LIP) : SH565[T[li]];
      else if (cv < 256 && RANK[li] >= cv) v = FACE565[T[li]];
      else if (split && !behind && RANK[sRow + ((X + saltX) % W)] < SALT_T) v = tab[X * 4 + 2];
      else v = tab[X * 4 + (c === 2 ? 1 : 0)];
      buf[Y * W + X] = v;
    }
  }
  const n = (x1 - x0) * (y1 - y0);
  g.cost.px += n; g.cost.box += n * 6;
}

// ------------------------------------------------------------ the printed sheet
const PRINT_TABS = new Map();
/** 4 fountain bands x 256 keys: paper tone | face | edge | salt | shadow | bite | yellow. */
function printTable(h, mode) {
  const key = `${h % INKS.length}${mode}`;
  let t = PRINT_TABS.get(key);
  if (t) return t;
  t = new Uint16Array(4 * 256);
  const body = inkOfHour(h), shad = SHADOW_INK[h % INKS.length];
  for (let band = 0; band < 4; band++) {
    const yel = rampAt(FOUNTAIN, band / 3);
    for (let k = 0; k < 256; k++) {
      const pt = k & 3, face = k & 4, edge = k & 8, salt = k & 16, sh = k & 32, bite = k & 64, ye = k & 128;
      let c = PAPERS[pt];
      if (bite && !face) c = scale(c, 0.86);
      if (ye) c = mul(c, yel);
      if (sh) c = mul(c, mix(shad, 0xffffff, 0.08));
      if (face) {
        const ink = mul(c, mix(body, 0xffffff, 0.1));
        c = salt ? mix(c, ink, 0.5) : edge ? scale(ink, 0.8) : ink;
      }
      t[band * 256 + k] = to565(c);
    }
  }
  PRINT_TABS.set(key, t);
  if (PRINT_TABS.size > 8) PRINT_TABS.delete(PRINT_TABS.keys().next().value);
  return t;
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/**
 * Print rows y0..y1 of the sheet. `lay(y)` says which layers have been
 * printed on that row: bit 0 shadow, bit 1 fountain.
 */
function printRows(g, y0, y1, glyphs, tab, seed, shadowFrom, yellowFrom, shadowDown, yellowDown) {
  y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(H, Math.ceil(y1));
  const buf = g.buf, sx = (seed * 37) % W, sy = (seed * 13) % H;
  for (let Y = y0; Y < y1; Y++) {
    const shOn = shadowDown ? Y < shadowFrom : Y >= shadowFrom;
    const yeOn = yellowDown ? Y < yellowFrom : Y >= yellowFrom;
    const sRow = ((Y + sy) % H) * W, yRow = ((Y + sy + 31) % H) * W;
    for (let X = 0; X < W; X++) {
      const i = Y * W + X;
      let key = PAPER[i];
      const k = SLOT_ID[i];
      if (k >= 0) {
        const s = SLOTS[k], c = BLOCK[k][glyphs[k]][(Y - s.y) * s.w + X - s.x];
        if (c === 1 || c === 2) {
          key |= 4;
          if (c === 2) key |= 8;
          if (RANK[sRow + ((X + sx) % W)] < 34) key |= 16;
        } else if (c === 4) key |= 64;
      }
      if (shOn && X >= 2 && Y >= 2) {
        const j = i - 2 * W - 2, k2 = SLOT_ID[j];
        if (k2 >= 0) {
          const s = SLOTS[k2], c = BLOCK[k2][glyphs[k2]][(Y - 2 - s.y) * s.w + X - 2 - s.x];
          if (c === 1 || c === 2) key |= 32;
        }
      }
      if (yeOn && X >= 3 && X < W - 3 && Y >= 3 && Y < H - 3 && RANK[yRow + ((X + sx + 50) % W)] >= 22) key |= 128;
      // the fountain's blend across the sheet, four inks dithered between
      const u = (X * 3 * 16) / W + BAYER[((Y & 3) << 2) | (X & 3)];
      buf[i] = tab[Math.min(3, u >> 4) * 256 + key];
    }
  }
  const n = (y1 - y0) * W;
  g.cost.px += n; g.cost.box += n * 9;
}

// ------------------------------------------------------------ the machinery
function inkRoller(g, F, tab) {
  // composition roller, seen from above: a band of ink, its sheen, its dark edges, iron cores at the ends
  const y0 = Math.round(F) - 4, buf = g.buf;
  for (let r = 0; r < 9; r++) {
    const Y = y0 + r;
    if (Y < 0 || Y >= H) continue;
    const k = r === 0 || r === 8 ? 1 : 0, sheen = r === 2 || r === 3;
    for (let X = 0; X < W; X++) {
      let v = tab[X * 4 + k];
      if (sheen) v = SHEEN(v);
      if (X < 2 || X >= W - 2) v = r === 0 || r === 8 ? CORE_D : CORE;
      buf[Y * W + X] = v;
    }
  }
  g.cost.px += 9 * W; g.cost.box += 9 * W * 2;
}
const IRON = 0x6b665e, IRON_D = 0x4a4640, IRON_L = 0x7a756c;
const CORE = to565(0x77736c), CORE_D = to565(0x4a4744);
const SHEEN_CACHE = new Map();
function SHEEN(v) {
  let s = SHEEN_CACHE.get(v);
  if (s === undefined) {
    const r = (v >> 11) << 3, gg = ((v >> 5) & 63) << 2, b = (v & 31) << 3;
    s = to565(mix(rgb(r, gg, b), 0xfff4e0, 0.28));
    SHEEN_CACHE.set(v, s);
  }
  return s;
}

function cylinder(g, E) {
  // the impression cylinder's line as it rolls: steel, its bearer edge, the sheet's gripper edge
  const y = Math.round(E);
  g.fillRect(0, y - 6, W, 12, 0x8a857c);
  g.fillRect(0, y - 6, W, 1, 0x4c4842);
  g.fillRect(0, y - 3, W, 2, 0xb3ada2);
  g.fillRect(0, y + 5, W, 1, 0x4c4842);
  g.fillRect(0, y + 2, W, 1, 0x6e6a62);
  for (let x = 6; x < W; x += 22) g.fillRect(x, y - 5, 2, 10, 0x6e6a62);   // the gripper fingers
}
function peelEdge(g, E) {
  // the sheet coming away: its back, curling, and its shadow on the form below
  const y = Math.round(E);
  g.fillRect(0, y, W, 4, 0xf7efdf);
  g.fillRect(0, y + 3, W, 1, 0xd9ccb2);
  g.fillRect(0, y + 4, W, 2, 0x000000, { a: 0.35 });
}

function rag(g, cx, cy, t, a) {
  // a shop rag, balled, scrubbing in small loops
  const x = cx + 6 * cos(t * 13), y = cy + 9 * sin(t * 17);
  g.fillRoundRect(x - 8, y - 6, 16, 12, 4, 0xd9d3c7, { a });
  g.fillRoundRect(x - 5, y - 2, 9, 6, 3, 0x6d6a75, { a: 0.8 * a });
  g.fillRect(Math.round(x - 7), Math.round(y - 3), 13, 1, 0xa9a399, { a });
  g.fillRect(Math.round(x - 2), Math.round(y + 3), 8, 1, 0xa9a399, { a });
}
function brayer(g, s, y, tab, ox) {
  // the hand brayer: a short roller the block's width, its fork and handle
  const x0 = s.x - 1, yy = Math.round(y);
  for (let r = 0; r < 6; r++) {
    const Y = yy - 3 + r;
    if (Y < 0 || Y >= H) continue;
    for (let X = Math.max(0, x0); X < Math.min(W, x0 + s.w + 2); X++)
      g.buf[Y * W + X] = r === 0 || r === 5 ? tab[X * 4 + 1] : r === 2 ? SHEEN(tab[X * 4]) : tab[X * 4];
  }
  g.cost.px += 6 * (s.w + 2);
  g.fillRect(x0 - 1, yy - 3, 1, 6, 0x5a5650);
  g.fillRect(x0 + s.w + 2, yy - 3, 1, 6, 0x5a5650);
  g.thickLine(x0 + s.w + 2.5, yy + 0.5, x0 + s.w + 2.5 + ox, yy + 12.5, 2.2, 0x6b3f22, { aa: true });
}

// ------------------------------------------------------------ the face
export default {
  name: 'Letterpress',
  blurb: 'Wood type locked in a press bed: the ink roller works the figures every beat, proofs are pulled, and the hour is a three-colour poster run.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, n = Math.floor(s), p = s - n;
    ctx.lcd.backlight(1 - 0.55 * ctx.night);
    const prv = clockFields(new Date(ctx.date.getTime() - 60000));
    const nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const hourShow = prv.h !== f.h;

    // ---- which glyph each block carries, and which blocks are being changed
    const cur = glyphsOf(f);
    let older = cur, newer = cur, before = false;
    if (s >= 59) { newer = glyphsOf(nxt); before = true; } else if (s < 1) older = glyphsOf(prv);
    const glyphs = before ? older : newer;

    // ---- the roller's state this frame
    const run = !paused(n, hourShow);
    const lp = lastPass(n, hourShow);
    ST.cur = passInk(f.h, n); ST.prev = passInk(lp < 0 ? f.h : f.h, lp);
    ST.pass = false; ST.split = false; ST.squash = false; ST.rowMin = 0; ST.rowMax = H;
    ST.saltX = (n * 53) % W; ST.saltY = (n * 29) % H;
    if (run) {
      ST.down = n % 2 === 0;
      ST.split = p >= 0.04;
      ST.squash = p >= 0.04 && p < 0.13;
      const u = ease.inOutQuad(progress(p, 0.12, 0.8));
      ST.front = ST.down ? -6 + u * (H + 12) : H + 6 - u * (H + 12);
      ST.pass = p >= 0.12;
    } else {
      // after a proof is pulled the faces stand starved until the roller comes back
      for (const b of PROOFS) if (s >= b + PROOF.peel[0] && s < b + 4) { ST.split = true; ST.saltX = (b * 53) % W; ST.saltY = (b * 29) % H; }
      if (hourShow && s >= HOUR.peel[0] && s < 8) ST.split = true;
    }

    // ---- the sheet: which rows it covers, and what is printed on them
    let sheet = null;
    for (const b of PROOFS) {
      if (s >= b + PROOF.lay[0] && s < b + PROOF.peel[1]) {
        const lay = progress(s, b + PROOF.lay[0], b + PROOF.lay[1]), peel = progress(s, b + PROOF.peel[0], b + PROOF.peel[1]);
        sheet = { seed: b, to: peel > 0 ? sheetSpan(1 - peel) : sheetSpan(lay), edge: peel > 0 ? 'peel' : lay < 1 ? 'cyl' : null, sh: false, ye: false };
      }
    }
    if (hourShow && s >= HOUR.p1[0] && s < HOUR.peel[1]) {
      const u1 = progress(s, ...HOUR.p1), u2 = progress(s, ...HOUR.p2), u3 = progress(s, ...HOUR.p3), up = progress(s, ...HOUR.peel);
      sheet = { seed: 7, to: up > 0 ? sheetSpan(1 - up) : sheetSpan(u1), edge: up > 0 ? 'peel' : null, sh: u2 > 0, ye: u3 > 0 };
      sheet.shFrom = u2 >= 1 ? -99 : sheetSpan(1 - u2);       // pass 2 rolls up: printed below its line
      sheet.yeFrom = u3 >= 1 ? 999 : sheetSpan(u3);           // pass 3 rolls down: printed above its line
      if (up === 0 && ((u1 > 0 && u1 < 1) || (u2 > 0 && u2 < 1) || (u3 > 0 && u3 < 1)))
        sheet.edge = 'cyl', sheet.cyl = u1 < 1 ? sheetSpan(u1) : u2 < 1 ? sheet.shFrom : sheet.yeFrom;
    }
    if (sheet) ST.rowMin = clamp(Math.ceil(sheet.to), 0, H);

    // ---- the form
    g.buf.set(BG); g.cost.px += N;
    const moving = [], holes = [], hourInk = passInk(f.h, 999);
    for (let k = 0; k < SLOTS.length; k++) {
      const changing = older[k] !== newer[k];
      if (!changing) { drawBlock(g, k, glyphs[k], 0, 0, 1); continue; }
      const s0 = SLOTS[k], away = -(s0.y + s0.h + 4);
      if (before) {
        const wash = progress(s, ...TURN.wash), lift = progress(s, ...TURN.lift);
        if (lift <= 0) drawBlock(g, k, glyphs[k], 0, 0, 1 - wash);
        else { holes.push(k); moving.push([k, glyphs[k], away * ease.inOutQuad(lift), 0, Math.min(1, lift * 6)]); }
      } else {
        const drop = progress(s, ...TURN.drop), inkUp = progress(s, ...TURN.ink);
        if (drop >= 1) {
          ST.prev = hourInk; ST.cur = hourInk;
          drawBlock(g, k, glyphs[k], 0, 0, inkUp);
          ST.prev = passInk(f.h, lp); ST.cur = passInk(f.h, n);
        } else {
          holes.push(k);
          if (drop > 0) moving.push([k, glyphs[k], away * (1 - ease.inOutQuad(drop)), 0, Math.min(1, (1 - drop) * 5)]);
        }
      }
    }
    // an empty place in the lockup: the iron bed, in the shadow of its neighbours
    for (const k of holes) {
      const h0 = SLOTS[k];
      g.fillRect(h0.x, h0.y, h0.w, h0.h, IRON);
      g.fillRect(h0.x, h0.y, h0.w, 2, IRON_D);
      g.fillRect(h0.x, h0.y, 2, h0.h, IRON_D);
      for (let yy = h0.y + 7; yy < h0.y + h0.h; yy += 9) g.fillRect(h0.x + 2, yy, h0.w - 2, 1, IRON_L);
    }
    // lifted blocks: their shadow on the form, then the block in the compositor's fingers
    for (const [k, gl, oy, cov, lifted] of moving) {
      const s0 = SLOTS[k];
      g.fillRect(s0.x + 2, Math.round(s0.y + oy) + 3, s0.w, s0.h, 0x0a0604, { a: 0.4 * lifted });
      const keep = ST.pass; ST.pass = false; ST.split = false; ST.squash = false;
      drawBlock(g, k, gl, -Math.round(lifted), Math.round(oy) - Math.round(lifted), cov);
      ST.pass = keep;
    }
    if (ST.pass && !sheet) inkRoller(g, ST.front, ST.cur);

    // ---- the compositor's hands: rag before the turn, brayer after
    for (let k = 0; k < SLOTS.length; k++) {
      if (older[k] === newer[k]) continue;
      const s0 = SLOTS[k];
      if (before && s >= TURN.wash[0] - 0.1 && s < TURN.lift[0]) {
        const a = progress(s, TURN.wash[0] - 0.1, TURN.wash[0]) * (1 - progress(s, TURN.lift[0] - 0.06, TURN.lift[0]));
        rag(g, s0.x + s0.w / 2, s0.y + s0.h / 2, s + k, a);
      }
      if (!before && s >= TURN.ink[0] && s < TURN.ink[1]) {
        const u = progress(s, ...TURN.ink), tri = u < 0.5 ? u * 2 : 2 - u * 2;
        brayer(g, s0, s0.y + 2 + ease.inOutQuad(tri) * (s0.h - 4), hourInk, k < 3 ? 4 : 2);
      }
    }

    // ---- the sheet over it
    if (sheet) {
      const tab = printTable(f.h, sheet.sh || sheet.ye ? 'p' : 'q');
      printRows(g, 0, sheet.to, glyphs, tab, sheet.seed + (f.minuteKey % 7),
        sheet.sh ? sheet.shFrom : 999, sheet.ye ? sheet.yeFrom : -99, false, true);
      if (sheet.edge === 'cyl') cylinder(g, sheet.cyl ?? sheet.to);
      else if (sheet.edge === 'peel') peelEdge(g, sheet.to);
    }
  },
};

export const FLASH_BYTES = FORM_BYTES + TYPE_BYTES;
