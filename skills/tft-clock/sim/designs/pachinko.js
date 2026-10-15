// Pachinko: the glass is a Showa-era pachinko playfield, and the time runs
// on it in steel balls. Each numeral is a brass ball gutter on the printed
// board (two nail-studded brass rails, a flat cast shadow, a plain moat),
// drawn for this face (pachinko-glyphs.js), and full of steel balls in single
// file. Hours stand tall on the left, minutes lower right under the tulip
// pocket and the windmill; the colon is a pair of jackpot lamps.
//
// The time is never still: every second a ball is shot along the top rail,
// drops through two pins into the tulip, and on that catch every gutter
// clacks: all its balls advance one ball pitch (eased, then a slow creep)
// while a 1-2 px lift wave rolls left to right through the gutters, the lamp
// ring flashes and the colon lamps blink. Balls enter each gutter at its
// entry hole and sink into its drain hole, so a numeral is a running stream.
// A light sweep glints along the brass every 6 s. Every 15 s the tulip opens:
// payout, the windmill spins up, balls spray out behind the gutters, two more
// lift waves run and every queue runs two extra pitches.
//
// Minute turn: the changing gutter's entry closes at :57.4 and its balls run
// out of the drain (dropping off the board where the drain is at the bottom)
// by :58.9; the empty gutter, still the old digit, unlights pixel by pixel in
// a gold sparkle (:59.3-:59.9, ranked once), the new gutter lights the same
// way after :00, and from :00.3 balls drop into its entry and run down to
// pile up from the far end (full by ~:02). Hour: fever. Once the new numerals
// have their balls, a crimson sunburst opens from the tulip and turns behind
// everything, the rails run a gold-red-white marquee, the lamps chase in
// rainbow, a torrent of balls rains behind the gutters and every queue races
// twelve pitches; at :10.6 the front closes back into the tulip.
//
// Palette, the board as printed: midnight-navy celluloid with a slightly
// lighter seigaiha wave print (calm), brass for pins, rails and nail heads,
// chrome for the guide rail, red and amber lamps, a red tulip. The pocket is
// the board's own navy, so the steel balls (one flat grey and one white glint
// each, no shading) are the strongest contrast on the glass, keylined by the
// brass. Fever turns the ground into crimson rays (the navy then reads as the
// pocket). Night: a deliberately deeper navy, duller brass, dimmed tulip and
// a 45% backlight; balls stay the lightest thing.
//
// Cost: one byte-map pass over the glass (a table lookup a pixel), a mask
// pass over the four slots, ~100 hard 5 x 5 ball sprites, a few kit shapes.
// No per-minute work, no extra frame buffer. Flash: glyph masks + ranks
// 2 x 10 x (36 x 68 + 32 x 50) B = 81 KB, lane tables ~16 KB, board, angle
// and distance maps 3 x 12.8 KB = 38 KB: ~135 KB.

import { clockFields, sin, cos, hash, hex, to565, ease } from '../js/kit.js';
import { buildSet, M, PAD } from './pachinko-glyphs.js';
import { W, H, B, BOARD, ANG, DIST, SLOT_BOX, TX, TY, WMX, WMY, HOPS } from './pachinko-board.js';

const N = W * H;
const BIG = buildSet(32, 64), SMALL = buildSet(28, 46);
const SETS = [BIG, BIG, SMALL, SMALL];

// ------------------------------------------------------------ palettes (RGB565)
const c5 = (s) => to565(hex(s));
const DAY = {
  board: [c5('#1c2b52'), c5('#283b68'), c5('#101a36'), c5('#e2b04c'), c5('#c4cdd3'), c5('#0b0e16')],
  mask: [0, c5('#1c2b52'), c5('#101a36'), c5('#e2b04c'), c5('#1c2b52'), c5('#05070e'), c5('#ffd98a')],
  lit: c5('#fff2b8'), ball: c5('#c9d1d9'), glint: c5('#ffffff'),
};
const NIGHT = {
  board: [c5('#111a34'), c5('#18244a'), c5('#0a1022'), c5('#b0863a'), c5('#7c8a94'), c5('#06070c')],
  mask: [0, c5('#111a34'), c5('#0a1022'), c5('#b0863a'), c5('#111a34'), c5('#030409'), c5('#d8b060')],
  lit: c5('#ffe6a0'), ball: c5('#b4c0cc'), glint: c5('#f0f6ff'),
};
const RAY = [c5('#8e1b2b'), c5('#b82a38')], RAY_N = [c5('#5a1420'), c5('#74202c')];
const MARQ = [c5('#ffd24a'), c5('#ff5a3a'), c5('#fff6e0')];
const LAMP_ON = [0xff4a2a, 0xffc23a, 0x7cf0ff, 0xff7ad0], LAMP_OFF = 0x5a2620;
const TULIP = 0xe8402a, CREAM = 0xf3e6c4;
const LIFT = new Int8Array(160);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

// ------------------------------------------------------------ helpers
const ifloor = (v) => { const t = v | 0; return t > v ? t - 1 : t; };
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const prog = (v, a, b) => clamp01((v - a) / (b - a));
const sm = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };

/** The clack: one pitch a second, most of it in the first third, the rest a creep. */
const clack = (f) => 0.72 * ease.outCubic(f < 0.32 ? f / 0.32 : 1) + 0.28 * f;

/** Hard 5 x 5 steel ball, top-left at (x, y), straight into the buffer. */
function ball(g, x, y, P, lit) {
  const buf = g.buf, b = P.ball;
  let n = 0;
  for (let j = 0; j < 5; j++) {
    const yy = y + j;
    if (yy < 0 || yy >= H) continue;
    const a = j === 0 || j === 4 ? 1 : 0, row = yy * W;
    for (let i = a; i < 5 - a; i++) { const xx = x + i; if (xx >= 0 && xx < W) { buf[row + xx] = b; n++; } }
  }
  if (y + 1 >= 0 && y + 1 < H && x + 1 >= 0 && x + 1 < W) buf[(y + 1) * W + x + 1] = P.glint;
  if (lit && y + 1 >= 0 && y + 1 < H && x + 2 >= 0 && x + 2 < W) buf[(y + 1) * W + x + 2] = P.glint;
  g.cost.px += n + 1; g.cost.box += 30;
}

/** Ball positions (arc length) of lane `ln` at flow coordinate u (balls, fractional). */
function laneS(ln, u, k) {
  const v = u + k, m = v - ln.N * ifloor(v / ln.N);
  return m * ln.P;
}

function at(ln, s) {
  const i = s | 0, f = s - i, X = ln.X, Y = ln.Y, n = X.length - 1;
  if (i >= n) return [X[n], Y[n]];
  return [X[i] + (X[i + 1] - X[i]) * f, Y[i] + (Y[i + 1] - Y[i]) * f];
}

/** Flow coordinate at day-time T (seconds) with an extra whole-ball offset e. */
function flowU(T, e) { const n = ifloor(T); return n + clack(T - n) + e; }

export default {
  name: 'Pachinko',
  blurb: 'A Showa pachinko playfield: each numeral is a brass gutter full of steel balls that clack forward on every catch in the tulip; at the turn the gutter drains and refills, at the hour the board goes into fever.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, buf = g.buf;
    const night = ctx.night;
    ctx.lcd.backlight(1 - 0.55 * night);
    const P = night >= 0.5 ? NIGHT : DAY;
    const T = (ctx.date.getTime() % 86400000) / 1000;   // day seconds (closed over a day: flows are periodic in whole balls)
    const T0 = T - s;                                     // this minute's start
    const bt = s - ifloor(s);                             // beat phase: the tulip catches at bt = 0
    const prv = clockFields(new Date(ctx.date.getTime() - 60000)), nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm, old = prv.hh + prv.mm, nw = nxt.hh + nxt.mm;
    const hourShow = prv.h !== f.h && s < 12.5;
    const fl = hourShow ? -1 : s >= 15 && s < 17.4 ? s - 15 : s >= 30 && s < 32.4 ? s - 30 : s >= 45 && s < 47.4 ? s - 45 : -1;

    // ---- fever: a crimson sunburst front from the tulip
    const frontR = hourShow ? 190 * sm(prog(s, 1.9, 3.3)) * (1 - sm(prog(s, 10.6, 12.2))) : 0;
    const rot = (s * 22) | 0;
    const RY = night >= 0.5 ? RAY_N : RAY;

    // ---- the light sweep (every 6 s), as a band in x + y/2
    const sw = (s % 6) < 1.1 ? -12 + 200 * ((s % 6) / 1.1) : -99;

    // ---- the board pass
    const bp = P.board, D = DAY.board, Nn = NIGHT.board, fade = night > 0 && night < 1;
    for (let i = 0, y = 0; y < H; y++)
      for (let x = 0; x < W; x++, i++) {
        const v = BOARD[i];
        let c;
        if (fade) c = (night > BAYER[((y & 3) << 2) | (x & 3)] ? Nn : D)[v];
        else c = bp[v];
        if (v <= B.PRINT && DIST[i] < frontR) c = RY[((ANG[i] + rot) >> 4) & 1];
        else if (v === B.PIN || v === B.RAIL) { const q = x + (y >> 1) - sw; if (q >= 0 && q < 4) c = P.lit; }
        buf[i] = c;
      }
    g.cost.px += N; g.cost.box += N * 3;

    // ---- behind the gutters: payout spray and the fever torrent
    if (fl >= 0 && fl < 2.4) {
      for (let k = 0; k < 8; k++) {
        const t = fl - 0.3 - k * 0.12;
        if (t < 0 || t > 1.4) continue;
        const dir = k & 1 ? 1 : -1, vx = dir * (14 + (hash(k, 5) % 18)), vy = -30 - (hash(k, 6) % 20);
        const x = TX + vx * t, y = TY + vy * t + 70 * t * t;
        if (y < 82) ball(g, Math.round(x - 2.5), Math.round(y - 2.5), P, false);
      }
    }
    if (hourShow && s > 2.6 && s < 11.5) {
      for (let k = 0; k < 22; k++) {
        const per = 1.15 + (hash(k, 9) % 40) / 100, t0 = 2.6 + (hash(k, 8) % 100) / 100;
        const tt = s - t0;
        if (tt < 0 || s > 10.8 + (k % 5) * 0.12) continue;
        const ph = (tt % per) / per;
        const x0 = 8 + (hash(k, 7) % 144), y = -6 + 92 * ph * (0.5 + 0.5 * ph);
        const x = x0 + 4 * sin(ph * 18 + k);
        ball(g, Math.round(x - 2.5), Math.round(y - 2.5), P, false);
      }
    }

    // ---- the catch's wave: a lift of 0-2 px that rolls left to right through the gutters after each catch
    const front = bt < 0.62 ? -14 + 190 * ease.inOutQuad(bt / 0.62) : -99;
    const flF = fl >= 0 && fl < 2.4 ? -14 + 190 * ((fl % 0.8) / 0.8) : -99;
    for (let x = 0; x < W; x++) {
      const d = Math.min(Math.abs(x + 0.5 - front), Math.abs(x + 0.5 - flF));
      LIFT[x] = d < 3.5 ? 2 : d < 8 ? 1 : 0;
    }

    // ---- the gutters: per slot the digit shown (old until :59.85, new from :00) and its lighting
    const gutters = [];
    for (let k = 0; k < 4; k++) {
      const chg = cur[k] !== nw[k], was = cur[k] !== old[k];
      let d = +cur[k], th = 0, mode = 0;              // mode 0 steady, 1 dissolving, 2 appearing
      if (chg && s >= 59.3) { mode = 1; th = 256 * sm(prog(s, 59.3, 59.88)); }
      else if (was && s < 0.42) { mode = 2; th = 256 * sm(prog(s, 0.0, 0.38)); }
      gutters.push({ k, d, chg, was, mode, th });
    }
    for (const G of gutters) {
      if (G.mode === 1 && G.th >= 256) continue;
      const set = SETS[G.k][G.d], [sx, sy] = SLOT_BOX[G.k];
      const mask = set.mask, rank = set.rank, mw = set.mw, mh = set.mh;
      const ox = sx - PAD, oy = sy - PAD, fever = hourShow && frontR > 20;
      let n = 0;
      for (let j = 0; j < mh; j++) {
        for (let i = 0; i < mw; i++) {
          const c = mask[j * mw + i];
          if (c === M.NONE) continue;
          const xx = ox + i, yy = oy + j - LIFT[xx], r = rank[j * mw + i];
          if (yy < 0 || yy >= H) continue;
          let lit = false;
          if (G.mode === 1) { if (r < G.th) continue; lit = r < G.th + 28; }
          else if (G.mode === 2) { if (r >= G.th) continue; lit = r >= G.th - 28; }
          const o = yy * W + xx;
          if (c === M.MOAT) { if (BOARD[o] === B.PRINT && !(DIST[o] < frontR)) buf[o] = P.board[0]; n++; continue; }
          if (c === M.SHADOW) { if (!(DIST[o] < frontR)) buf[o] = P.mask[2]; n++; continue; }
          let col = P.mask[c];
          if (c === M.BRASS || c === M.NAIL) {
            if (fever) col = MARQ[(((xx + yy * 2 - ((s * 30) | 0)) >> 2) % 3 + 3) % 3];
            else { const q = xx + (yy >> 1) - sw; if (q >= 0 && q < 4) col = P.lit; }
          }
          if (lit) col = P.lit;
          buf[o] = col; n++;
        }
      }
      g.cost.px += n; g.cost.box += mw * mh * 4;
    }

    // ---- the balls in the gutters
    const eHour = hourShow ? 12 * sm(prog(s, 3, 10)) : 0;
    const eFl = fl >= 0 ? 2 * sm(prog(fl, 0.2, 2.2)) : 0;
    const falling = [];
    for (const G of gutters) {
      const set = SETS[G.k][G.d], [sx, sy] = SLOT_BOX[G.k], ox = sx - PAD, oy = sy - PAD;
      if (G.mode === 1 || (G.mode === 2 && s < 0.3)) continue;
      for (const ln of set.lanes) {
        const draw = (sArc) => {
          const [x, y] = at(ln, sArc), cx = ox + x, cy = oy + y;
          const ix = Math.round(cx - 2.5), hop = LIFT[ix < 0 ? 0 : ix > W - 1 ? W - 1 : ix + 2 > W - 1 ? W - 1 : ix + 2];
          const q = cx + (cy / 2) - sw;
          ball(g, ix, Math.round(cy - 2.5) - hop, P, q > -3 && q < 4);
        };
        if (G.chg && s >= 57.4) {
          // the drain: entry closed, the queue runs out of the drain hole
          const u0 = flowU(T0 + 57.4, 0), t = s - 57.4, v = 115, ta = 0.4;
          const E = t < ta ? (v * t * t) / (2 * ta) : v * (t - ta / 2);
          const ex = ln.X[ln.X.length - 1] - ln.X[ln.X.length - 3], ey = ln.Y[ln.Y.length - 1] - ln.Y[ln.Y.length - 3];
          const el = Math.hypot(ex, ey) || 1;
          for (let b = 0; b < ln.N; b++) {
            const q0 = laneS(ln, u0, b);
            if (q0 > ln.L) continue;
            const sA = q0 + E;
            if (sA <= ln.L) draw(sA);
            else {
              const tau = (sA - ln.L) / v;
              const x = ox + ln.ex + (ex / el) * 40 * tau, y = oy + ln.ey + (ey / el) * 40 * tau + 260 * tau * tau;
              if (y < 84 && ln.ey > set.mh * 0.75) falling.push(x, y);   // a drain mid-glyph swallows its balls
            }
          }
        } else if (G.was && s < 2.6) {
          // the refill: balls drop into the entry and run down to pile up from the far end
          const u1 = flowU(T0 + 2.6, 0), qs = [];
          for (let b = 0; b < ln.N; b++) { const q = laneS(ln, u1, b); if (q <= ln.L) qs.push(q); }
          qs.sort((a, b2) => b2 - a);
          for (let j = 0; j < qs.length; j++) {
            const tj = 0.34 + j * 0.068, dt = s - tj;
            if (dt >= 0) draw(Math.min(qs[j], 125 * dt));
            else if (dt > -0.16) { const a = -dt; falling.push(ox + ln.sx, oy + ln.sy - 110 * a - 160 * a * a); }
          }
        } else {
          const u = flowU(T, eHour + eFl);
          for (let b = 0; b < ln.N; b++) { const q = laneS(ln, u, b); if (q <= ln.L) draw(q); }
        }
      }
    }
    for (let i = 0; i < falling.length; i += 2) ball(g, Math.round(falling[i] - 2.5), Math.round(falling[i + 1] - 2.5), P, false);

    // ---- the colon: two jackpot lamps, lit on the beat
    const on = bt < 0.5;
    for (const cy of [44, 58]) {
      g.fillCircle(80.5, cy, 3.2, 0x2a0e0c);
      g.fillCircle(80.5, cy, 2.4, on ? (night >= 0.5 ? 0xd8902a : LAMP_ON[1]) : LAMP_OFF);
      if (on) g.pixel(79, cy - 2, 0xfff4d0);
    }

    // ---- the tulip and its lamp ring
    tulip(g, s, bt, fl, hourShow, night >= 0.5);
    lamps(g, T, bt, fl, hourShow, night);
    windmill(g, T, fl, night >= 0.5);

    // ---- the launched ball: along the top rail, through two pins, into the tulip
    if (!(hourShow && s > 2 && s < 11)) {
      let x, y;
      if (bt < HOPS[0][2]) { const u = bt / HOPS[0][2]; x = 14 + (HOPS[0][0] - 14) * (u * (1.6 - 0.6 * u)); y = 4.5; }
      else {
        let k = 1;
        while (k < HOPS.length - 1 && bt > HOPS[k][2]) k++;
        const [ax, ay, at0] = HOPS[k - 1], [bx, by, at1] = HOPS[k], u = (bt - at0) / (at1 - at0);
        x = ax + (bx - ax) * u; y = ay + (by - ay) * u - (k === 1 ? 0 : 10 * u * (1 - u));
      }
      if (bt < 0.97) ball(g, Math.round(x - 2.5), Math.round(y - 2.5), P, false);
      if (bt < HOPS[0][2] && bt > 0.05) for (let k = 1; k <= 3; k++) g.fillRect(Math.round(x - 3 - k * 4), 4, 2, 1, 0xdde4ea, { a: 0.5 - k * 0.12 });
    }
  },
};

// ------------------------------------------------------------ the tulip
function tulip(g, s, bt, fl, hourShow, nt) {
  const TU = nt ? 0xa83020 : TULIP, CR = nt ? 0xa89c84 : CREAM;
  const open = fl >= 0 ? sm(prog(fl, 0, 0.3)) * (1 - sm(prog(fl, 1.9, 2.3))) : hourShow ? sm(prog(s, 1.7, 2.1)) * (1 - sm(prog(s, 11, 12))) : 0;
  const catchK = bt < 0.12 ? 1 : 0;
  // petals: flat quads pivoting outwards on the cup's rim
  const ang = 0.12 + 0.75 * open + 0.08 * catchK;
  for (const side of [-1, 1]) {
    const px = TX + side * 3.5, py = TY + 3;
    const ca = cos(ang), sa = sin(ang);
    const tip = [px + side * sa * 9, py - ca * 9], mid = [px + side * (sa * 5 + ca * 2.5), py - ca * 5 + sa * 2.5];
    const inn = [px - side * ca * 1.5 + side * sa * 4, py - ca * 4 - sa * 1.5];
    g.fillPolygon([[px - side * 1, py + 1], [px + side * 2.5, py + 1], mid, tip, inn], TU);
  }
  g.fillRoundRect(TX - 5, TY + 2, 10, 7, 2, TU);
  g.fillRect(TX - 4, TY + 4, 8, 2, CR);
  g.fillRect(TX - 2, TY + 1, 4, 2, 0x10141c);   // the mouth
}

function lamps(g, T, bt, fl, hourShow, night) {
  const n = 10, chase = ifloor(T * (hourShow || fl >= 0 ? 18 : 7)) % n, flash = bt < 0.14;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const x = Math.round(TX + 13.5 * cos(a)), y = Math.round(TY + 1 + 8 * sin(a));
    let c = LAMP_OFF;
    if (hourShow || fl >= 0) c = LAMP_ON[(k + chase) % 4];
    else if (flash || k === chase || k === (chase + 5) % n) c = LAMP_ON[k & 1];
    if (night >= 0.5 && c !== LAMP_OFF) c = c === LAMP_ON[0] ? 0xc03a22 : c === LAMP_ON[1] ? 0xc89030 : c;
    g.fillRect(x - 1, y - 1, 3, 3, 0x2a0e0c);
    g.fillRect(x - 1, y, 3, 1, c); g.fillRect(x, y - 1, 1, 3, c);
  }
}

function windmill(g, T, fl, nt) {
  const spin = T * 2.2 + (fl >= 0 ? 6 * sm(prog(fl, 0, 2.4)) * Math.PI : 0);
  for (let k = 0; k < 4; k++) {
    const a = spin + (k * Math.PI) / 2;
    const x1 = WMX + 6 * cos(a), y1 = WMY + 6 * sin(a), x2 = WMX + 4.5 * cos(a + 0.5), y2 = WMY + 4.5 * sin(a + 0.5);
    g.fillPolygon([[WMX, WMY], [x1, y1], [x2, y2]], k & 1 ? (nt ? 0xa83020 : TULIP) : nt ? 0xa89c84 : CREAM);
  }
  g.fillRect(WMX - 1, WMY - 1, 2, 2, 0xe2b04c);
}
