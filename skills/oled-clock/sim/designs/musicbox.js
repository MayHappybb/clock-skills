// Music Box: an 18-note cylinder movement, seen from above, with the minutes
// pinned on its brass drum.
//
// The drum turns under the window and its pins, set on the 18 tracks of the
// comb, spell the minutes; the numeral is pinned four times round, so one
// copy is always coming to face us. The pins stand proud as spikes where
// they come over the top, and at the bottom each lifts its tooth of the
// steel comb, which then rings (a quiver at the tip, decaying). The governor
// lets the drum linger while a copy faces the window and hurries it between,
// never stopping: a copy faces us at :01, :06, :11...
//
// The numerals are pinned by hand (out/musicbox-digits.png): 7 tracks wide,
// pin rows 1.5 px apart so curves step by half a pin, and no track carries
// two pins closer than 3 px, or they would strike as one.
//
// The minute: the changed numeral is re-pinned in place. Track by track,
// left to right, its pins slide along their tracks to the new numeral's
// places (paired by the cheapest alignment); a spare pin is pressed into the
// drum, a missing one rises out of it, and as each track settles its tooth
// is struck, so the re-pinning plays an arpeggio.
//
// The hour is the box's other system: a 12-air tune indicator, a pointer on
// a star wheel. At :00 the box changes tune: the drum whirls round twice,
// pins streaking, the comb chattering, re-pinned on the fly as each track
// passes the top; the star wheel clicks on an hour once the old minutes are
// a blur, and a hammer strikes the hour on the dial's bell, ring by ring.
//
// Everything comes from the clock: the drum's total angle is a closed-form
// monotonic function of the time of day (phiAt), so "when did this pin last
// lift its tooth" is solved by bisection, not remembered.
// Burn-in: the whole movement walks a 2 px orbit; the drum's pins travel.
// Night (ctx.night) dims the panel through oled.contrast().

import { clamp, lerp, progress, orbit, ease, OFF, ON } from '../js/kit.js';

const TAU = Math.PI * 2;

// ------------------------------------------------------------ geometry
const CY = 24, R = 21;            // drum axis row, drum radius
const PITCH = 3, NCOL = 18;       // comb teeth = pin tracks
const X0 = 12;                    // left pixel of track 0
const CIRC = TAU * R;
const COPIES = 4;                 // the minute is pinned this many times round
const CYCLE = 5;                  // seconds from one pinned copy facing us to the next
const MIN_TURN = 2.9, HOUR_SPIN = 4.6;
const SLIDE = 1.2, slideAt = (col) => 0.15 + 0.08 * col;   // the re-pinning sweeps left to right
const GH = 26;                    // glyph height, in drum-surface pixels
const TIP = CY + R + 1;           // comb tooth tips
const TENS = 1, UNITS = 10;       // first track of each minute digit

// ------------------------------------------------------------ letterforms
//
// Pinned by hand. A numeral is 7 comb tracks wide (a column every 3 px) and
// 17 pin rows tall, the rows 1.5 px apart along the drum, so a curve can
// step by half a pin while a track never carries two pins closer than 3 px
// (they would strike as one). Each line below is "row: tracks".

const PI = Math.PI;
const GC = 7;                     // tracks per numeral
const ROW = 1.5;
const FONT = {
  0: '0:234 1:15 3:06 5:06 7:06 9:06 11:06 13:06 15:15 16:234',
  1: '0:3 1:2 2:3 3:1 4:3 6:3 8:3 10:3 12:3 14:3 16:12345',
  2: '0:234 1:15 3:06 5:6 7:5 9:4 10:3 12:2 14:1 16:0123456',
  3: '0:234 1:15 3:06 5:6 7:5 8:34 9:5 11:6 13:06 15:15 16:234',
  4: '0:5 2:45 4:35 6:25 8:15 10:05 12:0123456 14:5 16:5',
  5: '0:123456 2:1 4:1 6:1234 7:5 9:6 11:6 13:06 15:15 16:234',
  6: '0:234 1:15 3:0 5:0 7:0 8:234 9:15 11:06 13:06 15:15 16:234',
  7: '0:0123456 2:6 4:5 6:5 8:4 10:4 12:3 14:3 16:2',
  8: '0:234 1:15 3:06 5:06 7:15 8:234 9:15 11:06 13:06 15:15 16:234',
};
const parse = (spec) => spec.split(' ').flatMap((tok) => {
  const [r, cs] = tok.split(':');
  return [...cs].map((c) => ({ c: +c, y: +r * ROW + 1 }));
});
export const GLYPHS = Array.from({ length: 10 }, (_, d) => d === 9
  ? parse(FONT[6]).map((p) => ({ c: GC - 1 - p.c, y: GH - p.y }))
  : parse(FONT[d]));

// ------------------------------------------------------------ the drum's turn
//
// Total angle of the drum at u seconds after midnight. It runs at one turn
// per CYCLE * COPIES s, lingering; each hour adds two fast turns (the tune
// change). Monotonic and continuous, so "when did that pin pass the comb"
// has an answer.
function phiAt(u) {
  const k = Math.floor(u / 60), sec = u - k * 60;
  // the governor lets the drum linger while a copy faces the window and
  // hurries it between (never quite stopping): 0.15x to 1.85x running speed.
  // A copy faces us at :01, :06, ... so each minute's re-pinning is centred.
  const c = (u - 1) / CYCLE, x = c - Math.floor(c);
  const run = (Math.floor(c) + x - (0.85 * Math.sin(TAU * x)) / TAU) / COPIES;
  const whirl = k % 60 === 0 ? 2 * ease.inOutCubic(clamp(sec / HOUR_SPIN, 0, 1)) : 0;
  return TAU * (run + 2 * Math.ceil(k / 60) + whirl);
}
const wrap = (a) => ((a % TAU) + TAU) % TAU;          // 0..2π
const wrapS = (a) => wrap(a + PI) - PI;               // -π..π

/** Seconds since the drum had turned `d` radians less than now (bisection). */
function backTime(u, d, max = 4) {
  const p = phiAt(u);
  if (p - phiAt(u - max) < d) return Infinity;
  let lo = 0, hi = max;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (p - phiAt(u - mid) < d) lo = mid; else hi = mid;
  }
  return hi;
}

// ------------------------------------------------------------ re-pinning
//
// On the minute the changed numeral's pins slide along their tracks to the
// new one's places. Track by track, pins are paired in order by the cheapest
// alignment; a pin with no partner is pressed into the drum (old) or rises
// out of it (new).
const PLANS = new Map();
function slidePlan(a, b) {
  const key = a * 10 + b;
  if (PLANS.has(key)) return PLANS.get(key);
  const plan = [], SKIP = 8;
  for (let c = 0; c < GC; c++) {
    const A = GLYPHS[a].filter((p) => p.c === c).map((p) => p.y).sort((p, q) => p - q);
    const B = GLYPHS[b].filter((p) => p.c === c).map((p) => p.y).sort((p, q) => p - q);
    const D = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
    for (let i = 0; i <= A.length; i++) for (let j = 0; j <= B.length; j++) {
      if (!i && !j) continue;
      let best = Infinity;
      if (i && j) best = D[i - 1][j - 1] + Math.abs(A[i - 1] - B[j - 1]);
      if (i) best = Math.min(best, D[i - 1][j] + SKIP);
      if (j) best = Math.min(best, D[i][j - 1] + SKIP);
      D[i][j] = best;
    }
    for (let i = A.length, j = B.length; i || j;) {
      if (i && j && D[i][j] === D[i - 1][j - 1] + Math.abs(A[i - 1] - B[j - 1])) { plan.push({ c, y0: A[--i], y1: B[--j], k: 0 }); }
      else if (i && D[i][j] === D[i - 1][j] + SKIP) plan.push({ c, y0: A[--i], y1: A[i], k: -1 });
      else plan.push({ c, y0: B[--j], y1: B[j], k: 1 });
    }
  }
  PLANS.set(key, plan);
  return plan;
}

// ------------------------------------------------------------ drawing

/** A pin at track `col`, screen angle `th` (0 = facing us, +π/2 = down at the comb). */
function pinRows(th, cy, trail) {
  const s = Math.sin(th), c = Math.cos(th);
  const y1 = cy + R * s, y2 = y1 + 2.4 * s * Math.abs(s);   // seen end-on at the front, as spikes round the edge
  if (c > 0.6 && trail < 0.5) {               // face on: a steady 2x2 head
    const t0 = Math.round(y1 - 1);
    return [t0, t0 + 1.99, true];
  }
  if (c > 0) {
    const top = Math.min(y1, y2) - 0.95 * c - trail, bot = Math.max(y1, y2) + 0.95 * c;
    return [top, bot, true];
  }
  // round the back: only the part standing proud of the silhouette shows
  if (Math.abs(y2 - cy) <= R) return null;   // (y2 is the pin's tip)
  return s < 0 ? [y2, cy - R, false] : [cy + R, y2, false];
}

function fillRows(g, x, top, bot, w = 2, c = ON) {
  let any = false;
  for (let y = Math.floor(top); y <= Math.floor(bot); y++) {
    const cov = Math.min(bot, y + 1) - Math.max(top, y);
    if (cov >= 0.5) { for (let i = 0; i < w; i++) g.pixel(x + i, y, c); any = true; }
  }
  if (!any) { const y = Math.floor((top + bot) / 2); for (let i = 0; i < w; i++) g.pixel(x + i, y, c); }
}

function drawDrum(g, ox, cy, phi, omega, pins) {
  const L = X0 - 2 + ox, Rt = X0 + PITCH * NCOL + 1 + ox, w = Rt - L;
  // end flanges and arbor
  g.fillRoundRect(L - 3, cy - R - 1, 2, 2 * R + 2, 1);
  g.fillRoundRect(Rt + 1, cy - R - 1, 2, 2 * R + 2, 1);
  g.fillRect(L - 9, cy - 1, 6, 2); g.fillRect(Rt + 3, cy - 1, 7, 2);
  // pins: halos first, so a pin on the bright band still reads
  const rows = [];
  for (const p of pins) {
    const th = wrapS(p.a + phi);
    const trail = (R * Math.max(0, Math.cos(th)) * omega) / 60;
    const r = pinRows(th, cy, trail);
    if (r && (p.z ?? 1) >= 0.3) rows.push([X0 + PITCH * p.col + ox, ...r, p.z ?? 1]);
  }
  for (const [x, top, bot, front] of rows) if (front) g.fillRect(x - 1, Math.floor(top) - 1, 4, Math.floor(bot) - Math.floor(top) + 3, OFF);
  g.hline(L, cy - R, w); g.hline(L, cy + R - 1, w);
  for (const [x, top, bot, , z] of rows) {
    if (z >= 0.75) fillRows(g, x, top, bot);
    else g.pixel(x + (z < 0.5 ? 1 : 0), Math.floor((top + bot) / 2));
  }
}

const baseY = (c) => 56 - Math.round((c * 4) / (NCOL - 1));

function drawComb(g, ox, oy, amp, t) {
  const tip = TIP + oy;
  for (let c = 0; c < NCOL; c++) {
    const x = X0 + PITCH * c + ox, yb = baseY(c) + oy, A = amp[c];
    const wob = Math.sin(TAU * 11 * t + c * 1.7);
    for (let y = tip; y < yb; y++) {
      const f = ((yb - y) / (yb - tip)) ** 2;
      const dx = f > 0.45 ? Math.round(A * wob) : 0;
      g.pixel(x + dx + (y < tip + 2 ? 0 : 0), y);
      if (y >= yb - 3) g.pixel(x + 1 + dx, y);   // teeth widen into the plate
    }
  }
  // the comb's plate, outlined, stepped where the teeth join it
  const xl = X0 - 3 + ox, xr = X0 + PITCH * NCOL + ox, yB = 61 + oy;
  for (let c = 0; c < NCOL; c++) g.hline(X0 + PITCH * c + ox - 1, baseY(c) + oy, PITCH + 1);
  g.hline(xl, yB, xr - xl + 1);
  g.vline(xl, baseY(0) + oy, yB - baseY(0) - oy); g.vline(xr, baseY(NCOL - 1) + oy, yB - baseY(NCOL - 1) - oy);
  for (const sx of [X0 + 6, X0 + 46]) { g.circle(sx + ox, 58 + oy, 1); }
}

const DX = 104, DY = 31, DR = 20;

function drawDial(g, ox, oy, ang) {
  const cx = DX + ox, cy = DY + oy;
  for (let k = 0; k < 12; k++) {
    const a = (k * TAU) / 12;
    const x = Math.round(cx + DR * Math.sin(a) - 1), y = Math.round(cy - DR * Math.cos(a) - 1);
    if (k === 0) { g.fillRect(x - 2, y - 1, 2, 3); g.fillRect(x + 2, y - 1, 2, 3); }
    else if (k % 3 === 0) g.fillRect(x, y, 3, 3);
    else g.fillRect(x, y, 2, 2);
  }
  const [tx, ty] = [cx + 15 * Math.sin(ang), cy - 15 * Math.cos(ang)];
  const [bx, by] = [cx + 7 * Math.sin(ang), cy - 7 * Math.cos(ang)];
  g.thickLine(bx, by, tx, ty, 2.2);
  // the tune-change star wheel the pointer rides on: one point per hour
  const star = [];
  for (let i = 0; i < 24; i++) {
    const r = i % 2 ? 4.6 : 7, a = ang + (i * PI) / 12;
    star.push([cx + r * Math.sin(a), cy - r * Math.cos(a)]);
  }
  g.fillPolygon(star);
  g.fillCircle(cx, cy, 3.2, OFF);
}

// The hour strikes on a bell under the dial's hub: a hammer for each hour,
// the bell's ring spreading out over the dial.
const STRIKE0 = 3.0, STRIKE = 0.42;
function drawBell(g, ox, oy, sec, n) {
  const cx = DX + ox, cy = DY + oy;
  for (let i = 0; i < n; i++) {
    const dt = sec - (STRIKE0 + i * STRIKE);
    if (dt < 0 || dt > 0.9) continue;
    const r = 5 + dt * 26;
    if (r < DR - 2) g.circle(cx, cy, r);
    if (r + 4 < DR - 2 && dt < 0.4) g.circle(cx, cy, r - 3);
  }
  // the hammer rises from under the dial and strikes its rim
  const k = Math.round((sec - STRIKE0) / STRIKE);
  if (sec < STRIKE0 - 0.4 || k >= n + 1 || sec > STRIKE0 + (n - 1) * STRIKE + 0.4) return;
  const ph = Math.abs(sec - STRIKE0 - clamp(k, 0, n - 1) * STRIKE) / (STRIKE / 2);  // 0 at the blow
  const hy = cy + DR + 3 + 3 * Math.min(1, ph) ** 0.6;
  g.vline(Math.round(cx) - 1, Math.round(hy), 64);
  g.fillCircle(cx - 0.5, hy, 1.8);
}

export default {
  name: 'Music Box',
  blurb: 'The minutes pinned on the turning drum of a music box and plucked off its comb; each minute the pins slide to the new numeral, each hour the box whirls to a new air and strikes it.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',
  frame(g, ctx) {
    const { date, fields: f, oled } = ctx;
    oled.contrast(Math.round(lerp(0xcf, 0x18, ctx.night)));
    const [ox, oy] = orbit(date, 2, 3);
    const u = f.h * 3600 + f.m * 60 + f.sec;
    const phi = phiAt(u), omega = (phiAt(u + 0.005) - phi) / 0.005;
    const u0 = Math.floor(u / 60) * 60, phi0 = phiAt(u0), turned = phi - phi0;
    const hourTurn = f.m === 0, dur = hourTurn ? HOUR_SPIN : MIN_TURN;
    const pm = (f.m + 59) % 60;
    const now = [Math.floor(f.m / 10), f.m % 10], was = [Math.floor(pm / 10), pm % 10];
    const inTurn = f.sec < dur + 0.5;
    const pins = [];
    for (let di = 0; di < 2; di++) {
      const off = di ? UNITS : TENS;
      const changed = inTurn && now[di] !== was[di];
      for (let k = 0; k < COPIES; k++) {
        const base = (k * CIRC) / COPIES;
        const add = (d, keep) => {
          for (const p of GLYPHS[d]) {
            const a = (base + p.y - GH / 2) / R;
            if (!keep || keep(a)) pins.push({ col: off + p.c, a });
          }
        };
        if (!changed) add(now[di]);
        else if (!hourTurn) {
          for (const q of slidePlan(was[di], now[di])) {
            const pr = progress(f.sec, slideAt(off + q.c), slideAt(off + q.c) + SLIDE);
            const y = lerp(q.y0, q.y1, ease.inOutCubic(pr));
            const z = q.k < 0 ? 1 - progress(pr, 0.1, 0.5) : q.k > 0 ? progress(pr, 0.5, 0.9) : 1;
            pins.push({ col: off + q.c, a: (base + y - GH / 2) / R, z });
          }
        } else {
          const passed = (a) => turned > wrap(-PI / 2 - (a + phi0));
          add(was[di], (a) => !passed(a));
          add(now[di], passed);
        }
      }
    }
    // each tooth rings from the last pin that lifted it
    const amp = new Array(NCOL).fill(0);
    const last = new Array(NCOL).fill(Infinity);
    for (const p of pins) last[p.col] = Math.min(last[p.col], wrap(p.a + phi - PI / 2));
    for (let c = 0; c < NCOL; c++) if (last[c] < Infinity) amp[c] = Math.exp(-backTime(u, last[c], 3) / 0.6);
    // and as each re-pinned track settles, its tooth is struck: an arpeggio
    if (inTurn && !hourTurn) for (let di = 0; di < 2; di++) {
      if (now[di] === was[di]) continue;
      for (let c = 0; c < GC; c++) {
        const col = (di ? UNITS : TENS) + c, dt = f.sec - slideAt(col) - SLIDE * 0.85;
        if (dt >= 0) amp[col] = Math.max(amp[col], Math.exp(-dt / 0.7));
      }
    }

    drawDrum(g, ox, CY + oy, phi, omega, pins);
    drawComb(g, ox, oy, amp, f.sec);
    const hNow = f.h % 12, hWas = (f.h + 11) % 12;
    let ang = (hNow * TAU) / 12;
    if (hourTurn) {
      const a0 = (hWas * TAU) / 12;
      ang = lerp(a0, a0 + TAU / 12, ease.outBack(progress(f.sec, 1.3, 1.9)));   // once the old minutes are a blur
    }
    drawDial(g, ox, oy, ang);
    if (hourTurn && f.sec < 9) drawBell(g, ox, oy, f.sec, f.h12);
  },
};
