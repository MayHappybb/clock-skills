// String art. Every mark on the glass is a straight thread between two nails.
// The minutes are numerals wound on nails: each bowl is a run of chords that
// skip k nails, so its inner edge is an envelope of straight lines; each bar
// a crescent wound the same way. The hour is a needle of three threads from
// the spool to one of 12 hour nails (a thread sun at the hub by day, a moon by
// night). A traveller laps the rim once a minute, wrapping it pin by pin. At
// the minute the rim comes off, the changed numeral's own threads are unwound,
// and the new ones are wound in a few at a time, slack and dotted until they
// pull taut and twang. On the hour the needle is thrown into a times-table
// cardioid that swells towards a nephroid and swings to the new hour.
import { clockFields, previousMinute, ease, clamp, progress, orbit } from '../js/kit.js';

const TAU = Math.PI * 2;
const DW = 28, DH = 50;            // numeral box
let STEP = Number(globalThis.process?.env?.STEP ?? 4.5), LSTEP = Number(globalThis.process?.env?.LSTEP ?? 4);

// ---------------------------------------------------------------- strokes
// A stroke is wound from nails. Arc: nails on the outer ellipse, each thread
// skips k nails, so the inner edge is an envelope of straight chords. Line:
// two rails of nails, the thread zigzags between them.
// Clock angles in degrees: 0 = up, clockwise.
const A = (cx, cy, rx, ry, a0, a1, w = 4.5) => ({ t: 'a', cx, cy, rx, ry, a0, a1, w, closed: a1 - a0 >= 360 });
const L = (x0, y0, x1, y1, w = 4.5) => ({ t: 'l', x0, y0, x1, y1, w });

function ept(s, a) {
  const r = (a * Math.PI) / 180;
  return [s.cx + s.rx * Math.sin(r), s.cy - s.ry * Math.cos(r)];
}

/** chords [[x0,y0,x1,y1], ...] in winding order, and nails [[x,y]...] */
function buildStroke(s) {
  const chords = [], nails = [];
  if (s.t === 'a') {
    const R = (s.rx + s.ry) / 2;
    const span = 2 * Math.acos(1 - Math.min(s.w, R * 0.9) / R) * 180 / Math.PI;
    const step = ((s.st ?? STEP) / R) * 180 / Math.PI;
    const total = s.a1 - s.a0;
    const n = Math.max(2, Math.round(total / step));
    const st = total / n;
    const k = Math.max(1, Math.round(span / st));
    const cnt = s.closed ? n : n + 1;
    for (let i = 0; i < cnt; i++) nails.push(ept(s, s.a0 + i * st));
    // the first pass runs nail to nail: the outer edge, crisp
    for (let i = 0; i < (s.closed ? n : n); i++) { const p = nails[i], q = nails[(i + 1) % cnt]; chords.push([p[0], p[1], q[0], q[1]]); }
    if (s.closed) {
      for (let i = 0; i < n; i++) { const p = nails[i], q = nails[(i + k) % n]; chords.push([p[0], p[1], q[0], q[1]]); }
    } else {
      // open arc: the span shrinks toward the ends, so the stroke tapers
      // onto its nails instead of shooting tangents off the end
      for (let c = 1; c < 2 * n; c++) {
        const i = Math.max(0, Math.ceil((c - k) / 2)), j = Math.min(n, Math.floor((c + k) / 2));
        if (j - i < 1 || (c - k) % 2 !== 0 && j - i < k && i > 0 && j < n) continue;
        const p = nails[i], q = nails[j]; chords.push([p[0], p[1], q[0], q[1]]);
      }
    }
  } else {
    const dx = s.x1 - s.x0, dy = s.y1 - s.y0, len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len, h = s.w / 2;
    const n = Math.max(2, Math.round(len / LSTEP));
    const P = (i, side) => [s.x0 + (dx * i) / n + nx * h * side, s.y0 + (dy * i) / n + ny * h * side];
    for (let i = 0; i <= n; i++) { nails.push(P(i, -1)); nails.push(P(i, 1)); }
    // out along one zig, back along the other: an X lattice
    for (let i = 0; i < n; i++) { const p = P(i, i % 2 ? 1 : -1), q = P(i + 1, i % 2 ? -1 : 1); chords.push([...p, ...q]); }
    for (let i = n; i > 0; i--) { const p = P(i, i % 2 ? -1 : 1), q = P(i - 1, i % 2 ? 1 : -1); chords.push([...p, ...q]); }
  }
  return { chords, nails };
}

/** A crescent from (x0,y0) to (x1,y1) bowed by sagitta s (positive: to the
 *  left of travel on screen). Thickness is the sagitta, capped at w. */
function C(x0, y0, x1, y1, sg, w = 4.5) {
  const c = Math.hypot(x1 - x0, y1 - y0), dx = (x1 - x0) / c, dy = (y1 - y0) / c;
  const nx = dy, ny = -dx;                       // left of travel (y down)
  const R = (c * c / 4 + sg * sg) / (2 * sg);
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const cx = mx + nx * (sg - R), cy = my + ny * (sg - R), r = Math.abs(R);
  const ang = (x, y) => (Math.atan2(x - cx, -(y - cy)) * 180) / Math.PI;
  let a0 = ang(x0, y0), a1 = ang(x1, y1);
  const aB = ang(mx + nx * sg, my + ny * sg);
  const m = (v) => ((v % 360) + 360) % 360;
  if (m(aB - a0) > m(a1 - a0)) [a0, a1] = [a1, a0];
  a1 = a0 + m(a1 - a0);
  return { ...A(cx, cy, r, r, a0, a1, Math.min(w, Math.abs(sg) * 0.9)), st: 3 };
}

const flip = (s) => ({ ...s, cx: DW - s.cx, cy: DH - s.cy, a0: s.a0 + 180, a1: s.a1 + 180 });

const SIX = [A(14, 36, 13.5, 13.5, 0, 360), A(27, 36, 25.5, 34, 270, 355)];
const GLYPHS = [
  [A(14, 25, 13.5, 24.5, 0, 360, 5)],
  [C(18, 50, 17, 0.5, 5.5), C(17, 1, 5, 14, 4)],
  [A(14, 14, 12.5, 12.5, -75, 135), C(22.8, 22, 1, 48, -5), C(1, 47, 28, 47, -4)],
  [A(14, 13, 12, 12, -70, 200), A(14, 37, 13.5, 12.5, -20, 245)],
  [C(22, 0.5, 0.5, 35, 4.5), C(0.5, 33, 28, 33, -4), C(21, 6, 21, 50, -5)],
  [C(7, 1, 28, 1, -4), C(7.5, 1.5, 3.5, 26, 4.5), A(14, 35, 13.5, 14, -50, 225)],
  SIX,
  [C(0.5, 1, 28, 1, -4), C(27.5, 2, 10, 50, 5)],
  [A(14, 12.5, 11.5, 12, 0, 360), A(14, 36.5, 13.5, 13.5, 0, 360)],
  SIX.map(flip),
];

const CACHE = new Map();
function strokeOf(s) {
  const key = JSON.stringify(s);
  let b = CACHE.get(key);
  if (!b) { b = { key, ...buildStroke(s) }; CACHE.set(key, b); }
  return b;
}
const DIGITS = GLYPHS.map((ss) => ss.map(strokeOf));

// ---------------------------------------------------------------- threads

/** One strand from (x0,y0) to (x1,y1), bowed sideways by `bow` px (a plucked
 *  string: a sine of half a wavelength), drawn as a short polyline. */
function strand(g, x0, y0, x1, y1, bow = 0) {
  if (Math.abs(bow) < 0.25) { g.line(x0, y0, x1, y1); return; }
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  const n = Math.max(2, Math.min(10, Math.round(len / 4)));
  let px = x0, py = y0;
  for (let i = 1; i <= n; i++) {
    const u = i / n, b = bow * Math.sin(Math.PI * u);
    const qx = x0 + dx * u + nx * b, qy = y0 + dy * u + ny * b;
    g.line(px, py, qx, qy); px = qx; py = qy;
  }
}
/** Decaying twang `age` seconds after a strand was pulled taut. */
const twang = (age, amp = 1.6, hz = 9) => (age < 0 || age > 0.9 ? 0 : amp * Math.exp(-age * 5) * Math.sin(TAU * hz * age));

/** The chords of digit d, in winding order, tagged with their stroke. */
function chordList(d) {
  const out = [];
  for (const st of DIGITS[d]) for (const c of st.chords) out.push({ c, key: st.key });
  return out;
}

/** A slack thread: a dotted curve (every other pixel, so it reads at half
 *  brightness) from (x0,y0) to (x1,y1), sagging `sag` px under gravity. */
function slack(g, x0, y0, x1, y1, sag) {
  const len = Math.hypot(x1 - x0, y1 - y0) + Math.abs(sag), n = Math.max(2, Math.ceil(len));
  let lx = -99, ly = -99, k = 0;
  for (let i = 0; i <= n; i++) {
    const u = i / n, x = Math.round(x0 + (x1 - x0) * u - 0.5), y = Math.round(y0 + (y1 - y0) * u + sag * 4 * u * (1 - u) - 0.5);
    if (x === lx && y === ly) continue;
    if (k++ % 2 === 0) g.pixel(x, y);
    lx = x; ly = y;
  }
}

/**
 * A digit going from `a` to `b`, u seconds after its change started. Strokes
 * the two share stay on their nails. The old numeral's own threads are
 * unwound backwards, each shrinking onto its nail; then the new one's are
 * wound in winding order, a few in the air at a time: each comes off its
 * nail as a dotted, sagging slack thread, swings to its far nail, pulls
 * taut and twangs.
 */
const UNW = 0.8, WIN0 = 0.2, WND = 1.4, AIR = 4;   // winding starts while the old thread is still coming off
const TURN = WIN0 + WND;
function drawTurning(g, a, b, u, ox, oy) {
  const keep = new Set(DIGITS[b].map((s) => s.key));
  const had = new Set(DIGITS[a].map((s) => s.key));
  for (const x of chordList(a)) if (keep.has(x.key)) g.line(ox + x.c[0], oy + x.c[1], ox + x.c[2], oy + x.c[3]);
  // the old numeral thins out evenly (all its strokes at once), so no half-
  // unwound glyph can read as another digit
  const goes = [];
  for (const st of DIGITS[a]) if (!keep.has(st.key)) st.chords.forEach((c, i) => goes.push({ c, r: (i + 0.5) / st.chords.length }));
  goes.sort((p, q) => p.r - q.r);
  const comes = chordList(b).filter((x) => !had.has(x.key));
  if (u < UNW) {
    const v = goes.length * (1 - ease.inOutQuad(u / UNW));
    const whole = Math.floor(v), part = v - whole;
    for (let i = 0; i < whole; i++) { const c = goes[i].c; g.line(ox + c[0], oy + c[1], ox + c[2], oy + c[3]); }
    if (whole < goes.length && part > 0) {
      const c = goes[whole].c;
      slack(g, ox + c[0], oy + c[1], ox + c[0] + (c[2] - c[0]) * part, oy + c[1] + (c[3] - c[1]) * part, 2 * part);
    }
  }
  if (u < WIN0) return;
  const n = comes.length, w = clamp((u - WIN0) / WND, 0, 1);
  const v = (n + AIR) * ease.inOutQuad(w);             // thread i is in the air for v in (i, i + AIR)
  const rate = (n + AIR) / WND;                         // threads per second, roughly
  for (let i = 0; i < n; i++) {
    const c = comes[i].c, p = (v - i) / AIR;
    if (p <= 0) break;
    if (p >= 1) {
      const age = (p - 1) * AIR / rate;
      strand(g, ox + c[0], oy + c[1], ox + c[2], oy + c[3], twang(age, 1.2) * (i % 2 ? 1 : -1));
    } else {
      // the free end swings from below the first nail over to the far one
      const e = ease.outCubic(p), L = Math.hypot(c[2] - c[0], c[3] - c[1]);
      const hx = c[0], hy = c[1] + L * 0.5;                  // hanging straight down
      const fx = hx + (c[2] - hx) * e, fy = hy + (c[3] - hy) * e;
      slack(g, ox + c[0], oy + c[1], ox + fx, oy + fy, (1 - e) * 0.35 * L + 1.5 * (1 - p));
    }
  }
}
function invInOutQuad(y) { return y < 0.5 ? Math.sqrt(y / 2) : 1 - Math.sqrt((1 - y) / 2); }

function drawDigit(g, d, ox, oy) {
  for (const st of DIGITS[d]) for (const c of st.chords) g.line(ox + c[0], oy + c[1], ox + c[2], oy + c[3]);
}

/** For review (out/stringart-digits.png). */
export function specimen(g, t = 0) {
  for (let d = 0; d <= 9; d++) drawDigit(g, d, 4 + (d % 5) * 34, 4 + Math.floor(d / 5) * 56);
}
export const specimenSize = { w: 176, h: 116 };

// ---------------------------------------------------------------- the hoop
// A round frame of 60 pins (seconds) with 12 bigger nails (hours). The hour is
// a spike of thread fanned from the hour nail to the far rim; a flyer on the
// spool at the centre laps the hoop once a minute and wraps the rim pin by pin.
const HX = 27.5, HY = 32, HR = 27;
const pin = (k) => { const a = (k / 60) * TAU; return [HX + HR * Math.sin(a), HY - HR * Math.cos(a)]; };
const pinA = (a) => [HX + HR * Math.sin(a), HY - HR * Math.cos(a)];

// The hour is read on 12 hour nails set inside the rim: a needle of three
// threads runs from the spool's collar to the hour nail, its tip on the nail.
const HN = 21.5;
const hourNail = (h) => { const a = ((h % 12) / 12) * TAU; return [HX + HN * Math.sin(a), HY - HN * Math.cos(a)]; };
function needleChords(h) {
  const a = ((h % 12) / 12) * TAU, s = Math.sin(a), c = Math.cos(a), [nx, ny] = hourNail(h);
  return [-1.6, 0, 1.6].map((o) => [HX + 5.2 * s + o * c, HY - 5.2 * c + o * s, nx, ny]);
}
function needle(g, H, n, dx, dy, age = 9) {
  const ch = needleChords(H);
  for (let i = 0; i < Math.min(3, Math.floor(n)); i++) {
    const c = ch[[1, 0, 2][i]];
    strand(g, c[0] + dx, c[1] + dy, c[2] + dx, c[3] + dy, twang(age - 0.05 * i, 1.1, 7) * (i === 2 ? -1 : 1));
  }
}
function needleGrow(g, H, v, dx, dy) {
  for (const c of needleChords(H)) g.line(c[0] + dx, c[1] + dy, c[0] + (c[2] - c[0]) * v + dx, c[1] + (c[3] - c[1]) * v + dy);
}
/** The cardioid (times table x2), cusp at angle a0, chords i0..i1 of TT_N. */
function cardioid(g, a0, i0, i1, dx, dy) {
  for (let i = Math.max(1, Math.ceil(i0)); i < i1; i++) {
    const p = pinA(a0 + Math.PI + (i / TT_N) * TAU), q = pinA(a0 + Math.PI + ((2 * i) / TT_N) * TAU);
    const u = Math.min(1, i1 - i);                      // the chord being wound
    g.line(p[0] + dx, p[1] + dy, p[0] + (q[0] - p[0]) * u + dx, p[1] + (q[1] - p[1]) * u + dy);
  }
}
function drawDial(g, dx, dy) {
  for (let k = 0; k < 60; k++) { const [x, y] = pin(k); g.pixel(Math.floor(x + dx), Math.floor(y + dy)); }
  for (let h = 0; h < 12; h++) {
    const [x, y] = hourNail(h), X = Math.round(x + dx), Y = Math.round(y + dy);
    if (h % 3 === 0) {
      g.fillRect(X - 1, Y - 1, 3, 3);
      const p = pin(h * 5); g.line(X, Y, p[0] + dx, p[1] + dy);       // a thread tied off to the rim
      g.pixel(X, Y, 0);
    } else g.fillRect(Math.round(x + dx - 1), Math.round(y + dy - 1), 2, 2);
  }
}

/** The hub: the spool, a sun of thread by day (06-18), a moon by night. */
function drawHub(g, x, y, day, ang) {
  if (day) {
    g.fillCircle(x, y, 4.2, 0);
    g.circle(Math.round(x - 0.5), Math.round(y - 0.5), 3);
    for (let k = 0; k < 8; k++) {
      const a = ang + (k * TAU) / 8, s = Math.sin(a), c = Math.cos(a);
      g.line(x + 4.6 * s, y - 4.6 * c, x + 6.4 * s, y - 6.4 * c);
    }
  } else {
    // a crescent wound as a fan of threads from its horns
    g.fillCircle(x, y, 5.5, 0);
    g.fillWhere((px, py) => (px - x) ** 2 + (py - y) ** 2 <= 20 && (px - x - 2.2) ** 2 + (py - y + 1.6) ** 2 > 13, 1, [x - 6, y - 6, 12, 12]);
  }
}


const RIM_OFF = 0.6;                       // the rim comes off in the first 0.6 s
const H_OUT = [RIM_OFF, 1.0], H_WIND = [1.0, 2.0], H_SWING = [2.0, 2.9], H_UNWIND = [2.9, 3.6], H_IN = [3.4, 3.9], TT_N = 30;


export default {
  name: 'String Art',
  blurb: 'String art: the minutes wound as envelopes of straight threads on nails, the hour a needle of thread on a nailed hoop under a thread sun or moon; each minute the changed numeral is unwound and rewound thread by thread, and the hour is thrown into a cardioid.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { fields: f, date, oled, night }) {
    oled.contrast(Math.round(207 - 160 * night));
    const sec = f.sec, prv = previousMinute(date);
    const [ox, oy] = orbit(date, 1);
    const MX = [63 + ox, 97 + ox], MY = 7 + oy;

    // ---- minutes: changed strokes unwound backwards, then rewound
    const cur = [Math.floor(f.m / 10), f.m % 10], old = [Math.floor(prv.m / 10), prv.m % 10];
    for (const k of [0, 1]) {
      const u = sec - (RIM_OFF - 0.2) - (k === 0 ? 0.3 : 0);
      if (cur[k] !== old[k] && u < TURN + 1) {
        if (u < 0) drawDigit(g, old[k], MX[k], MY); else drawTurning(g, old[k], cur[k], u, MX[k], MY);
      } else drawDigit(g, cur[k], MX[k], MY);
    }

    // ---- the hoop
    const hourShow = f.m === 0 && sec < H_IN[1];
    // the traveller brushes the needle as it passes the hour: it twangs
    const hA = ((f.h % 12) / 12) * 60;
    const pluck = ((sec - hA) % 60 + 60) % 60;
    if (!hourShow) needle(g, f.h, 3, ox, oy, f.m === 0 && sec < 8 ? sec - H_IN[1] : pluck);
    else {
      // the needle is drawn back onto the spool, the thread is wound round
      // the rim into a cardioid whose lobe points at the old hour, the whole
      // figure swings its cusp on to the new hour, unwinds, and the new
      // needle is paid out to its nail
      const oldH = (f.h + 23) % 24, aOld = ((oldH % 12) / 12) * TAU;
      const aNew = aOld + TAU / 12;
      if (sec < H_OUT[1]) needleGrow(g, oldH, 1 - ease.inQuad(progress(sec, H_OUT[0], H_OUT[1])), ox, oy);
      if (sec >= H_WIND[0] && sec < H_UNWIND[1]) {
        const a0 = aOld + (aNew - aOld) * ease.inOutCubic(progress(sec, H_SWING[0], H_SWING[1]));
        const i1 = TT_N * ease.inOutQuad(progress(sec, H_WIND[0], H_WIND[1]));
        const i0 = TT_N * ease.inOutQuad(progress(sec, H_UNWIND[0], H_UNWIND[1]));
        cardioid(g, a0, i0, i1, ox, oy);
      }
      if (sec >= H_IN[0]) needleGrow(g, f.h, ease.outCubic(progress(sec, H_IN[0], H_IN[1])), ox, oy);
    }
    if (hourShow) for (let h = 0; h < 12; h++) { const [x, y] = hourNail(h); g.fillRect(Math.round(x + ox) - 2, Math.round(y + oy) - 2, 5, 5, 0); }
    drawDial(g, ox, oy);

    // the seconds: a traveller laps the rim and wraps it pin by pin; at the
    // turn it runs backwards and the rim thread comes off
    let wound = sec;
    if (sec < RIM_OFF) wound = 60 * (1 - ease.inOutQuad(sec / RIM_OFF));
    const nW = Math.floor(wound), armA = (wound / 60) * TAU;
    for (let k = 0; k < nW; k++) { const p = pin(k), q = pin(k + 1); g.line(p[0] + ox, p[1] + oy, q[0] + ox, q[1] + oy); }
    const [tx, ty] = pinA(armA), p = pin(nW);
    g.line(p[0] + ox, p[1] + oy, tx + ox, ty + oy);
    g.fillCircle(tx + ox, ty + oy, 1.9, 0);
    g.circle(Math.round(tx + ox - 0.5), Math.round(ty + oy - 0.5), 1);
    drawHub(g, HX + ox, HY + oy, f.h >= 6 && f.h < 18, sec / 60 * TAU * 0.5);
  },
};
