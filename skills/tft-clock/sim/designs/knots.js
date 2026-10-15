// Knots: sailor's ropework at sea. A heavy line (a jackstay) is rigged
// from corner to corner across the top of the glass and sags in a
// catenary; the four numerals hang from it by lanyards, each one tied from
// rope (knots-glyphs.js: the 0 a grommet, the 8 a figure-eight with a true
// crossing, the 4's bar laid over its post, the 6 and 9 tucking their end
// over the stem), every strand ending in a whipped end. Each rope is drawn
// the way engravers draw rope: its lay, diagonal grooves that are cut
// wider on the shadow side and at the rim, and a ground keyline where one
// pass crosses over another. The line sags lowest in the middle, so the
// hours and minutes hang in a shallow smile, and from its lowest point
// hangs the ship's bell; its bell rope carries two stopper knots: the
// colon. Below, the sea.
//
// The time is alive, all the time: the rope is always running. The lay
// slides through every strand of every numeral (and along the jackstay and
// the lanyards) continuously, and on every beat the line is hauled: the
// lay surges, the tension runs along the jackstay from left to right, the
// sag pulls up and every numeral is lifted and drops back with a little
// slack, in turn; each knot swings a pixel or two on its lanyard (moved,
// never turned); the bell rope swings. Every 15 s a bigger move: at :15 a
// whip runs down the jackstay and drops each numeral in turn; at :30 a
// swell rolls the length of the strip; at :45 the bell is struck and its
// rings spread over the whole glass.
//
// Minute turn: the old knot is untied and hauled away: from :58.3 each
// changing rope runs back up through its seizing (the lay moving with it,
// the whipped end chasing up the path), leaving the knot-diagram lead (a
// dashed centre line) that keeps its outline; the lead dissolves by :59.95;
// the hitch slides along the jackstay to where the new knot hangs; after
// :00 the new lead appears whole, and the rope is paid out along it from
// the seizing, done by :01.5. The working end carries a knot-diagram
// arrowhead both ways (leading the rope in, pointing home as it is hauled
// out). Changing digits work concurrently, by
// fraction of their own length, so the time is never a wrong number.
// Hour: a fishing net (knotwork: a mesh tied at every crossing) is cast
// from the bell over the whole strip, billows on the swell, and is hauled
// back in; the bell rings the hour. The numerals keep their moats, so they
// read throughout.
//
// Pair: hemp #d8b46a on sea blue #0f2a44: the colour of tarred-hemp rope
// in sunlight and of deep water at dusk, the only two values on the glass.
// Grey is made the 1-bit way: the rope's lay grooves, the net's mesh, the
// hatching in the swell, dashes on the water. Night dims the backlight only.
//
// Cost: every knot is stamped at load into pixel lists (flash tables): for
// each rope pixel its strand, arc length, lay coordinate and groove
// threshold; for each moat pixel its strand and arc length. A frame is a
// 1-bit mask built with integer table lookups (each digit ~1,100 table
// entries), then written to the frame buffer in two colours.

import { clockFields, previousMinute, hash, progress, sin, to565 } from '../js/kit.js';
import { GLYPHS } from './knots-glyphs.js';
import { chaikin, resample, stamp, lead } from './knots-rope.js';

const W = 160, H = 80, N = W * H;
const INK_C = 0xd8b46a, GND_C = 0x0f2a44;
const INK = to565(INK_C), GND = to565(GND_C);

// ------------------------------------------------------------ the knots (load time = flash)

const S = 2.4, R = 2.75, MOAT = 2, PAD = 7, P = 5;
const LAY = { P, twist: 1.0, lw: 0.85, rim: 0.3, shade: 0.45 };
const K64 = 64 / P;
const GW = Math.ceil(10 * S + 2 * PAD), GH = Math.ceil(18 * S + 2 * PAD);

const KNOT = GLYPHS.map((strands) => {
  const st = strands.map((pts) => resample(chaikin(pts.map((p) => [p[0] * S + PAD, p[1] * S + PAD, p[2] ?? 0]), 2), 0.3));
  const r = stamp(st, R, GW, GH, LAY, MOAT);
  r.lead = lead(st, GW, GH, 6, 2.2);
  r.sx = strands[0][0][0] * S;
  r.sy = strands[0][0][1] * S;
  r.L4 = r.L.map((l) => Math.round(l * 4));
  // the centre line, one point per px, for the working end's arrow (flash)
  r.line = st.map((c) => {
    const n = Math.max(2, Math.round(c.L) + 1), o = new Float32Array(n * 4);
    for (let j = 0; j < n; j++) {
      const i = Math.round((j / (n - 1)) * (c.n - 1));
      o[j * 4] = c.x[i]; o[j * 4 + 1] = c.y[i]; o[j * 4 + 2] = c.tx[i]; o[j * 4 + 3] = c.ty[i];
    }
    return o;
  });
  return r;
});

// ------------------------------------------------------------ layout

const SLOT_X = [4, 37, 99, 132];          // glyph x = 0 of each slot
const Y0 = 2, SAG = 10, LAN = 4;          // jackstay ends, sag, lanyard drop
const SEA = 66;                           // the sea's mean surface
const BELL_X = 80;

// sea dashes: 14 rows of 256 px, sparse, in flash
const DASH = new Uint8Array(14 * 256);
for (let r = 0; r < 14; r++) {
  let x = (hash(r, 7) & 15);
  while (x < 256) {
    const len = 2 + (hash(r, x, 1) % (2 + (r >> 2)));
    for (let k = 0; k < len && x + k < 256; k++) DASH[r * 256 + x + k] = 1;
    x += len + 7 + (hash(r, x, 2) % (16 - (r >> 1)));
  }
  if (r % 2 === 0) DASH.fill(0, r * 256, r * 256 + 256); // every other row is clear water
}

// the beat: the line's tension response over one second (flash table)
const TENS = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const t = i / 256;
  TENS[i] = t < 0.12 ? ((x) => x * x * (3 - 2 * x))(t / 0.12) : Math.exp(-5 * (t - 0.12)) * Math.cos(11 * (t - 0.12));
}
const tension = (tau) => TENS[(((tau % 1) + 1) % 1) * 256 | 0];
// a unit circle and a bell curve, in flash, so nothing per pixel calls Math
const CS = new Float32Array(512), SN = new Float32Array(512);
for (let i = 0; i < 512; i++) { CS[i] = Math.cos((i / 512) * Math.PI * 2); SN[i] = Math.sin((i / 512) * Math.PI * 2); }
const GAUSS = new Float32Array(97);
for (let i = 0; i < 97; i++) GAUSS[i] = Math.exp(-((i / 32) ** 2));
const bump = (d) => { const a = d < 0 ? -d : d; return a >= 3 ? 0 : GAUSS[(a * 32) | 0]; };
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// ------------------------------------------------------------ working buffers (RAM)

const M = new Uint8Array(N);              // the 1-bit frame
const YC = new Float32Array(W);           // the jackstay's centre line, per column
const SURF = new Int16Array(W);           // the sea surface, per column
const LEN = new Int32Array(4);            // per strand: visible length (x4)
const PH = new Int32Array(4);             // per strand: lay phase (64ths)

// ------------------------------------------------------------ drawing into the mask

function knot(d, ox, oy, lenU, leadP, ph, arrow, cost) {
  const kn = KNOT[d];
  for (let k = 0; k < kn.L.length; k++) {
    const l4 = kn.L4[k], v = Math.round(l4 * lenU);
    LEN[k] = v;
    // the rope moves with the haul: material leaving or arriving shifts the lay
    PH[k] = (ph + Math.round(((l4 - v) * K64) / 4)) | 0;
  }
  let work = 0;
  // moat: the ground round the rope (only where the rope is)
  const { mx, my, mk, ms, mn } = kn;
  for (let i = 0; i < mn; i++) {
    if (ms[i] > LEN[mk[i]] + 6) continue;
    const x = ox + mx[i], y = oy + my[i];
    if (x >= 0 && x < W && y >= 0 && y < H) M[y * W + x] = 0;
  }
  work += mn;
  // the knot-diagram lead
  if (leadP > 0) {
    const ld = kn.lead, thr = (leadP * 256) | 0;
    for (let i = 0; i < ld.n; i++) {
      if (ld.r[i] >= thr || ld.s[i] <= LEN[ld.k[i]]) continue;
      const x = ox + ld.x[i], y = oy + ld.y[i];
      if (x >= 0 && x < W && y >= 0 && y < H) M[y * W + x] = 1;
    }
    work += ld.n;
  }
  // the rope
  const { x: rx, y: ry, k: rk, s: rs, q, th, n } = kn;
  for (let i = 0; i < n; i++) {
    const k = rk[i], L = LEN[k];
    if (rs[i] > L) continue;
    const x = ox + rx[i], y = oy + ry[i];
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    // a whipping of twine near the free end: solid, with one groove
    const e = L - rs[i];
    let ink;
    if (e < 10 && L < kn.L4[k] - 2) ink = e > 2 ? 1 : 0;
    else ink = ((q[i] + PH[k]) & 63) >= th[i] ? 1 : 0;
    M[y * W + x] = ink;
  }
  work += n;
  // the working end, as in a knot diagram: an arrowhead leading the rope
  if (arrow !== 0 && lenU > 0.02 && lenU < 0.98) {
    for (let k = 0; k < kn.L.length; k++) {
      const ln = kn.line[k], np = ln.length >> 2;
      const j = Math.min(np - 1, Math.round((LEN[k] / kn.L4[k]) * (np - 1))) * 4;
      let tx = ln[j + 2], ty = ln[j + 3];
      if (arrow < 0) { tx = -tx; ty = -ty; }
      const cx = ox + ln[j] + tx * (arrow > 0 ? 1.5 : 3.5), cy = oy + ln[j + 1] + ty * (arrow > 0 ? 1.5 : 3.5);
      for (let yy = (cy - 6) | 0; yy <= cy + 6; yy++) for (let xx = (cx - 6) | 0; xx <= cx + 6; xx++) {
        if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
        const dx = xx + 0.5 - cx, dy = yy + 0.5 - cy;
        const a = dx * tx + dy * ty, v = -dx * ty + dy * tx, av = v < 0 ? -v : v;
        if (a >= -0.5 && a <= 4.6 && av <= (4.6 - a) * 0.8) M[yy * W + xx] = 1;
        else if (a >= -1.5 && a <= 5.8 && av <= (5.8 - a) * 0.8 + 0.6) M[yy * W + xx] = 0;
      }
      work += 169;
    }
  }
  cost.box += work * 2;
}

/** A seizing: a served collar of twine where the knot hangs from its lanyard. */
function seizing(x, y) {
  for (let yy = y - 3; yy <= y + 3; yy++) for (let xx = x - 4; xx <= x + 4; xx++) {
    if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
    const inside = yy >= y - 2 && yy <= y + 2 && xx >= x - 3 && xx <= x + 3 && !((yy === y - 2 || yy === y + 2) && (xx === x - 3 || xx === x + 3));
    M[yy * W + xx] = inside ? (yy === y ? 0 : 1) : 0;
  }
}

/** A lanyard: a short rope from the jackstay down to the seizing. */
function lanyard(x0, y0, y1, sway, phq) {
  for (let y = y0; y < y1; y++) {
    if (y < 0 || y >= H) continue;
    const x = x0 + (((sway * (y - y0)) / (y1 - y0) + 64.5) | 0) - 64;
    M[y * W + x - 2] = 0; M[y * W + x + 2] = 0;
    for (let dx = -1; dx <= 1; dx++) {
      const qq = ((y * K64 + dx * K64 * 0.9) | 0) + phq;
      M[y * W + x + dx] = (qq & 63) >= (dx === 1 ? 22 : 16) ? 1 : 0;
    }
  }
}

function jackstay(phq) {
  const Rj = 1.75;
  for (let x = 0; x < W; x++) {
    const yc = YC[x];
    const y0 = Math.floor(yc - Rj - 1), y1 = Math.ceil(yc + Rj + 1);
    for (let y = y0; y <= y1; y++) {
      if (y < 0 || y >= H) continue;
      const v = y + 0.5 - yc, av = v < 0 ? -v : v;
      if (av <= Rj) {
        const qq = (((x + 1.0 * v) * K64) | 0) - phq;
        const t = (LAY.lw + (av > 1.2 ? 0.5 : 0) + (v > 0 ? 0.6 : 0)) * K64;
        M[y * W + x] = (qq & 63) >= t ? 1 : 0;
      } else M[y * W + x] = 0;
    }
  }
}

function disc(cx, cy, r, ink, keyline) {
  const rr = r * r, ro = (r + keyline) * (r + keyline);
  const x0 = Math.floor(cx - r - keyline), x1 = Math.ceil(cx + r + keyline);
  const y0 = Math.floor(cy - r - keyline), y1 = Math.ceil(cy + r + keyline);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = dx * dx + dy * dy;
    if (d <= rr) M[y * W + x] = ink;
    else if (d <= ro) M[y * W + x] = 0;
  }
}

/** The ship's bell, its clapper and the bell rope with two stopper knots (the colon). */
function bell(top, swing, strike, ph) {
  const cx = BELL_X;
  // crown loop round the jackstay
  for (let y = top - 1; y < top + 3; y++) for (let x = cx - 3; x <= cx + 3; x++) {
    const edge = x === cx - 3 || x === cx + 3 || y === top - 1;
    M[y * W + x] = edge ? 0 : (x === cx - 2 || x === cx + 2 || y === top) ? 1 : 0;
  }
  // body: a flared trapezoid, a ground band (the bead) near the lip
  const bx = cx + Math.round(strike);
  const ROWS = [3, 4, 4, 5, 5, 5, 5, 6, 6, 7, 7];
  for (let i = 0; i < ROWS.length; i++) {
    const y = top + 3 + i, hw = ROWS[i];
    for (let x = bx - hw - 1; x <= bx + hw + 1; x++) {
      const out = x < bx - hw || x > bx + hw;
      M[y * W + x] = out ? 0 : (i === 7 ? 0 : (i === 2 && (x === bx - 2 || x === bx - 1) ? 0 : 1));
    }
  }
  for (let x = bx - 8; x <= bx + 8; x++) M[(top + 14) * W + x] = 0;
  // clapper and bell rope, swinging as a pendulum
  const y0 = top + 14, y1 = top + 40;
  for (let y = y0; y < y1; y++) {
    const dx = Math.round((swing * (y - y0)) / (y1 - y0));
    const x = cx + dx;
    M[y * W + x - 2] = 0; M[y * W + x + 1] = 0;
    const g = ((y * 2 + ph) & 7) < 2;
    M[y * W + x - 1] = g ? 0 : 1; M[y * W + x] = g ? 1 : 0;
    if (!g) M[y * W + x] = 1;
  }
  disc(cx + strike * 0.6, y0 + 1, 2.2, 1, 1);
  // the two stopper knots: the colon
  for (const yk of [top + 20, top + 33]) {
    const dx = (swing * (yk - y0)) / (y1 - y0);
    disc(cx - 0.5 + dx, yk + 0.5, 3.0, 1, 1);
    // a turn of the knot: a short ground groove across it
    const x = Math.round(cx + dx), yy = yk;
    M[yy * W + x - 2] = 0; M[(yy - 1) * W + x - 1] = 0; M[(yy + 1) * W + x + 1] = 0;
  }
}

/** The sea: surface, dashes on the water, the swell at :30. */
function sea(T, swell, cost) {
  for (let x = 0; x < W; x++) {
    let s = SEA + 1.5 * sin(x * 0.11 - T * 1.9) + 1.0 * sin(x * 0.047 + T * 0.8);
    if (swell) s -= swell.a * bump((x - swell.x) / 14);
    SURF[x] = Math.round(s);
  }
  for (let r = 0; r < 14; r++) {
    const y = SEA + r;
    const off = ((T * (6 + r * 3.2)) | 0) + r * 37;
    for (let x = 0; x < W; x++) if (y > SURF[x] + 1) M[y * W + x] = DASH[r * 256 + ((x + off) & 255)];
  }
  // the surface: a broken line of little crests
  for (let x = 0; x < W; x++) {
    const y = SURF[x];
    if (y >= 0 && y < H && ((x + ((T * 9) | 0)) % 23) < 19) M[y * W + x] = 1;
  }
  if (swell) {
    for (let x = Math.max(0, (swell.x - 40) | 0); x < Math.min(W, (swell.x + 40) | 0); x++) {
      const top = SURF[x];
      for (let y = top + 2; y < SEA + 2 && y < H; y++) M[y * W + x] = ((x + y) & 3) === 0 ? 1 : 0;
      // foam on the crest, thrown forward
      if (x > swell.x - 6 && x < swell.x + 10 && top > 0) {
        for (let k = 1; k <= 3; k++) if ((hash(x, k, (swell.x | 0)) & 3) === 0 && top - k > 0) M[(top - k) * W + x] = 1;
      }
    }
  }
  cost.box += W * 16;
}

/** The hour's net: a knotted mesh cast from the bell over the whole glass. */
function net(cx, cy, r, T, cost) {
  const rr = r * r, ri = (r - 2) * (r - 2);
  for (let x = 0; x < W; x++) {
    const bo = Math.round(2.4 * sin(x * 0.07 + T * 2.6));
    const dx = x + 0.5 - cx, dx2 = dx * dx;
    for (let y = 0; y < H; y++) {
      const dy = y + 0.5 - cy, d = dx2 + dy * dy;
      if (d > rr) continue;
      if (d > ri) { M[y * W + x] = 1; continue; }
      const yy = y + bo + 64;
      const a = (x + yy) % 10, b = (x - yy + 640) % 10;
      if (a === 0 || b === 0 || (a <= 1 && b <= 1)) M[y * W + x] = 1;
    }
  }
  // sinkers on the lead line
  for (let k = 0; k < 28; k++) {
    const a = ((k * 512) / 28) | 0;
    disc(cx + r * CS[a], cy + r * SN[a] - 1, 1.6, 1, 1);
  }
  cost.box += N * 4;
}

/** The rings of a struck bell, spreading. */
function rings(cx, cy, age) {
  for (let j = 0; j < 3; j++) {
    const r = (age - j * 0.22) * 70;
    if (r < 12 || r > 110) continue;
    const n = Math.ceil(r * 6.3);
    for (let i = 0; i < n; i++) {
      if (((i / 3) | 0) % 3 === 2) continue;   // a broken ring: sparse
      const a = ((i * 512) / n) | 0;
      const x = ((cx + r * CS[a] + 512.5) | 0) - 512, y = ((cy + r * 0.8 * SN[a] + 512.5) | 0) - 512;
      if (x >= 0 && x < W && y >= 0 && y < H) M[y * W + x] = 1;
    }
  }
}

// ------------------------------------------------------------ the frame

export default {
  name: 'Knots',
  blurb: 'Sailor\'s ropework at sea: four numerals tied from running rope hang from a hauled line; knots untie and are retied each minute, a net is cast at the hour.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, sec = f.sec, date = ctx.date;
    ctx.lcd.backlight(1 - 0.7 * ctx.night);
    const cost = g.cost;
    // seconds of the day (continuous), for every running motion
    const T = (f.h * 3600 + f.m * 60 + sec);
    const beat = sec % 1;

    // ---- which knots hang now
    let old, nw;
    if (sec >= 58) { old = f.hh + f.mm; const n = clockFields(new Date(date.getTime() + 60000)); nw = n.hh + n.mm; }
    else if (sec < 2) { const p = previousMinute(date); old = p.hh + p.mm; nw = f.hh + f.mm; }
    else { old = nw = f.hh + f.mm; }
    const hourShow = sec < 10 && f.m === 0;

    // ---- the line: catenary sag, the beat's tension, the whip at :15
    const whip = sec >= 15 && sec < 17 ? (sec - 15) * 130 - 20 : -999;
    for (let x = 0; x < W; x++) {
      const u = (x - 80) / 80;
      const tn = tension(beat - x / 260);
      let y = Y0 + SAG * (1 - 0.32 * tn) * (1 - u * u);
      if (whip > -999) y += 4.5 * bump((x - whip) / 16) * (1 - u * u * 0.5);
      YC[x] = y;
    }

    // lay phase: a slow creep plus a surge on every beat (hauled)
    const surge = (Math.floor(T) + (beat < 0.45 ? 1 - (1 - beat / 0.45) ** 3 : 1)) * 3.6 + T * 0.5;
    const phq = Math.round(surge * K64);

    M.fill(0);

    // ---- the hour's net, under everything
    if (hourShow) {
      let r = 0;
      if (sec < 0.3) r = 0;
      else if (sec < 1.9) r = 112 * (1 - (1 - (sec - 0.3) / 1.6) ** 3);
      else if (sec < 7) r = 112;
      else if (sec < 9.6) r = 112 * (1 - ((sec - 7) / 2.6) ** 2);
      if (r > 3) net(BELL_X, 18, r, T, cost);
    }

    // ---- the sea
    let swell = null;
    if (sec >= 30 && sec < 33.2) swell = { x: -40 + (sec - 30) * 75, a: 11 * Math.min(1, (sec - 30) / 0.5, (33.2 - sec) / 0.5) };
    sea(T, swell, cost);

    jackstay(phq);

    // ---- the bell and its rope (the colon)
    const bellTop = Math.round(YC[BELL_X]) + 1;
    let strike = 0, age = -1;
    if (sec >= 45 && sec < 48) age = sec - 45;
    if (hourShow && sec >= 0.4 && sec < 4) age = sec - 0.4;
    if (age >= 0) strike = 1.5 * bump(age * 0.7) * sin(age * 30);
    const swing = 2.2 * sin((T % 2) * Math.PI) + strike;
    if (age >= 0) rings(BELL_X, bellTop + 8, age);
    bell(bellTop, swing, strike, -phq >> 3);

    // ---- the four knots
    for (let i = 0; i < 4; i++) {
      const d0 = old.charCodeAt(i) - 48, d1 = nw.charCodeAt(i) - 48;
      let d = d1, lenU = 1, leadP = 0, lanU = 1;
      if (d0 !== d1) {
        if (sec >= 58) {
          d = d0;
          lenU = 1 - smooth((sec - 58.3) / 1.3);
          leadP = progress(sec, 58.2, 58.5) - progress(sec, 59.5, 59.95);
          lanU = sec < 59.5 ? 0 : smooth((sec - 59.5) / 0.7);
        } else {
          lenU = smooth((sec - 0.2) / 1.3);
          leadP = progress(sec, 0, 0.3);
          lanU = sec < 0.2 ? smooth((sec + 0.5) / 0.7) : 1;
        }
      }
      const kn = KNOT[d];
      const lx = Math.round(SLOT_X[i] + (d0 !== d1 ? KNOT[d0].sx + (KNOT[d1].sx - KNOT[d0].sx) * lanU : kn.sx));
      const cxs = SLOT_X[i] + 12;
      const top = Math.round(YC[cxs]) + LAN;
      // each knot swings a little on its lanyard (moved, never turned)
      const sw = ((1.7 * sin(T * Math.PI + i * 1.3) + 64.5) | 0) - 64;
      const ox = SLOT_X[i] - PAD + sw, oy = top - PAD;
      if (lenU > 0 || leadP > 0) knot(d, ox, oy, lenU, leadP, phq + i * 11, d0 === d1 ? 0 : sec >= 58 ? -1 : 1, cost);
      const ly = Math.round(YC[lx]);
      const sy = top + Math.round(kn.sy);
      lanyard(lx, ly + 2, sy - 1, sw, phq);
      seizing(lx + sw, sy);
    }

    // ---- two colours out
    const buf = g.buf;
    for (let i = 0; i < N; i++) buf[i] = M[i] ? INK : GND;
    cost.px += N; cost.box += N;
  },
};
