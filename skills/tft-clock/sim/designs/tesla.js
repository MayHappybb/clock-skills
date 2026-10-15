// Tesla: a high-voltage lab at night. A Tesla coil stands between the hours
// and the minutes; each numeral is a small circuit of brass electrode knobs
// with live plasma arcs strung between them (a 0 is two arcs between a top
// and a bottom knob, an 8 four arcs between three). Every frame the arcs are
// struck again: a bold 2-px core channel and two thin filaments that hug it
// (1-2 px of ground between) with kinks that jump every few frames and a
// braid that crawls along the stroke, pinched at the knobs.
//
// The beat: every second a surge of current climbs the coil's winding, the
// toroid fires a bolt through the sky and straight down onto one numeral's
// apex (in turn; it never crosses a counter or an open side), the struck
// numeral flares and sparks to its outside, a bulge of current swells the
// filaments along every arc left to right across the strip, and the return
// current crawls out along the bench to both ends. Every knob hisses a short
// brush spark to the outside of its digit. Every 15 s the coil fires all
// four at once. A few streamers (six, in fixed fans left and right) flicker
// off the toroid and stay out of a 4 px moat round every numeral.
//
// Minute: from :58.75 the changing numerals' arcs sputter out (the
// filaments first, then the core, in 3-px chunks spread evenly over the
// whole outline by a golden-ratio rank, so the digit thins as one), leaving
// the bare knobs; from :59.6 the knobs glide to the new digit's electrode
// positions (splitting or merging as needed); from :00 thin leaders creep
// along the new arcs, evenly everywhere, and at :00.45 the coil fires the
// return stroke into each new numeral, which lights up flaring.
// Hour: the coil lets go: the winding pumps surge after surge, streamers
// double and lengthen, the coil fires bolt after bolt into the new numerals
// every 0.16 s for ~2.5 s, and three lightning flashes swap ink and ground
// for four frames each (the time stays readable in negative).
//
// Two colours, a mono module's own pair: electric violet #c8a8ff ink on
// near-black #050008, the colour of an arc in air against a dark lab.
// Grey exists only as the coil's 1-px winding. Night dims only the
// backlight (to 35 %) and halves the streamers.
//
// Cost: the frame is a 1-bit mask (12.8 KB RAM) cleared and rebuilt each
// frame from closed-form geometry (hashes of the frame index, so any frame
// builds cold), then written as two colours. ~16 arcs of ~50 samples x 3
// filaments, ~12 streamers / bolts of 17 points, a few knobs. Flash: arc
// samples 2 sizes x 10 digits, ~2000 samples x 8 B = 16 KB, tables 2 KB.
import { to565, hash, clockFields, clamp, ease } from '../js/kit.js';
import { makeGlyphs } from './tesla-glyphs.js';

const W = 160, H = 80;
const INK = to565(0xc8a8ff), GND = to565(0x050008);
const HG = makeGlyphs(30, 60, 4), MG = makeGlyphs(26, 46, 4);
const SLOTS = [
  { x: 2, y: 13, w: 30, h: 60, G: HG, kr: 3 },
  { x: 35, y: 13, w: 30, h: 60, G: HG, kr: 3 },
  { x: 99, y: 27, w: 26, h: 46, G: MG, kr: 2.5 },
  { x: 129, y: 27, w: 26, h: 46, G: MG, kr: 2.5 },
];
const CX = 82, TOR_Y = 7, FLOOR = 77;
// how far down the sky reaches in each column (streamers stay above this)
// (a 4 px moat round every numeral's box: the boxes hold all of its ink)
const SKY = new Int16Array(W).fill(FLOOR - 2);
for (const S of SLOTS) for (let x = S.x - 4; x < S.x + S.w + 4; x++) if (x >= 0 && x < W) SKY[x] = Math.min(SKY[x], S.y - 4);
for (let x = 64; x <= 100; x++) SKY[x] = Math.min(SKY[x], x >= 77 && x <= 87 ? 2 : 13);

// flash: a smooth periodic noise table, values -127..127
const NZ = new Int8Array(1024);
{
  const v = (i, c, s) => (hash(((i % (1024 / c)) + 1024 / c) % (1024 / c), s) / 4294967296) * 2 - 1;
  for (let i = 0; i < 1024; i++) {
    let a = 0;
    for (const [c, amp, s] of [[32, 0.75, 1], [8, 0.25, 2]]) {
      const f = i / c, k = Math.floor(f), u = f - k, w = u * u * (3 - 2 * u);
      a += amp * (v(k, c, s) * (1 - w) + v(k + 1, c, s) * w);
    }
    NZ[i] = Math.round(clamp(a * 1.3, -1, 1) * 127);
  }
}
// flash: a sine table, values -127..127 (1024 = a full turn)
const SN = Int8Array.from({ length: 1024 }, (_, i) => Math.round(127 * Math.sin((i / 1024) * Math.PI * 2)));
// flash: knob sprites (a brass ball with a 1-px glint), r = 3 and 2.5
function knobMask(r) {
  const n = Math.ceil(r * 2), m = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = x + 0.5 - n / 2, dy = y + 0.5 - n / 2;
    if (dx * dx + dy * dy <= r * r + 0.6) m[y * n + x] = 1;
  }
  m[Math.floor(n / 2 - 1) * n + Math.floor(n / 2 - 1)] = 0;   // the glint
  return { n, m };
}
const KNOB = { 3: knobMask(3.6), 2.5: knobMask(3.1) };
const MOAT = { 3: knobMask(5.2), 2.5: knobMask(4.6) };

// ---- the 1-bit frame
const M = new Uint8Array(W * H);
let ops = 0;
function dot(x, y) { if (x >= 0 && x < W && y >= 0 && y < H) M[y * W + x] = 1; }
function stamp(x, y, b) {
  if (b === 0) dot(x, y);
  else if (b === 1) { dot(x, y); dot(x + 1, y); dot(x, y + 1); dot(x + 1, y + 1); }
  else { for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) dot(x + i, y + j); }
}
// sky-clipped dot: streamers never come down into the numerals' space
function sdot(x, y) { if (x >= 0 && x < W && y >= 0 && y < SKY[x]) M[y * W + x] = 1; }
function line(x0, y0, x1, y1, b, sky) {
  let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  for (;;) {
    if (sky) { sdot(x0, y0); if (b) sdot(x0 + 1, y0); } else stamp(x0, y0, b);
    ops += 6;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
}

// ---- a bolt: midpoint displacement between two points, 17 points, with forks
const BX = new Float32Array(17), BY = new Float32Array(17);
function bolt(x0, y0, x1, y1, seed, rough, b, sky, forks) {
  BX[0] = x0; BY[0] = y0; BX[16] = x1; BY[16] = y1;
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, px = -dy / L, py = dx / L;
  let amp = L * rough;
  for (let step = 8; step >= 1; step >>= 1) {
    for (let i = step; i < 16; i += step * 2) {
      const d = ((hash(seed, i, step) & 1023) / 511.5 - 1) * amp;
      BX[i] = (BX[i - step] + BX[i + step]) / 2 + px * d;
      BY[i] = (BY[i - step] + BY[i + step]) / 2 + py * d;
    }
    amp *= 0.55;
  }
  for (let i = 1; i <= 16; i++) line(Math.round(BX[i - 1]), Math.round(BY[i - 1]), Math.round(BX[i]), Math.round(BY[i]), b, sky);
  if (forks) {
    for (let f = 0; f < forks; f++) {
      const i = 3 + (hash(seed, f, 91) % 10), side = hash(seed, f, 92) & 1 ? 1 : -1;
      const fl = L * (0.18 + (hash(seed, f, 93) % 100) / 400);
      const ax = BX[i], ay = BY[i], ux = dx / L, uy = dy / L;
      const ex = ax + (ux * 0.7 + px * side * 0.7) * fl, ey = ay + (uy * 0.7 + py * side * 0.7) * fl;
      // a short fork: three kinks
      let lx = ax, ly = ay;
      for (let k = 1; k <= 3; k++) {
        const u = k / 3, j = ((hash(seed, f, k) & 255) / 127.5 - 1) * fl * 0.25 * (k < 3 ? 1 : 0);
        const nx = ax + (ex - ax) * u + px * j, ny = ay + (ey - ay) * u + py * j;
        line(Math.round(lx), Math.round(ly), Math.round(nx), Math.round(ny), 0, sky);
        lx = nx; ly = ny;
      }
    }
  }
}

// ---- knobs between two digits: every old knob glides to a new one (merging),
// every new one comes from an old one (splitting)
const PAIRS = new Map();
function pairing(G, a, b) {
  const key = G === HG ? `h${a}${b}` : `m${a}${b}`;
  let P = PAIRS.get(key);
  if (P) return P;
  const A = G[a].knobs, B = G[b].knobs, cand = [];
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) cand.push([Math.hypot(A[i][0] - B[j][0], A[i][1] - B[j][1]), i, j]);
  cand.sort((p, q) => p[0] - q[0]);
  const ua = new Uint8Array(A.length), ub = new Uint8Array(B.length);
  P = [];
  for (const [, i, j] of cand) if (!ua[i] && !ub[j]) { ua[i] = ub[j] = 1; P.push([A[i], B[j]]); }
  for (const [, i, j] of cand) {
    if (!ua[i]) { ua[i] = 1; P.push([A[i], B[j]]); }
    if (!ub[j]) { ub[j] = 1; P.push([A[i], B[j]]); }
  }
  PAIRS.set(key, P);
  return P;
}

// a knob: a brass ball with a 1-px glint, cleared round by a ground moat so
// it reads as an electrode with the arcs springing off its rim
function knob(S, x, y, moat) {
  const cx = S.x + x, cy = S.y + y;
  if (moat) {
    const K = MOAT[S.kr], n = K.n, x0 = Math.round(cx - n / 2), y0 = Math.round(cy - n / 2);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const xx = x0 + i, yy = y0 + j;
      if ((K.m[j * n + i] || (i === (n >> 1) - 1 && j === (n >> 1) - 1)) && xx >= 0 && xx < W && yy >= 0 && yy < H) M[yy * W + xx] = 0;
    }
    ops += n * n * 2;
  }
  const K = KNOB[S.kr], n = K.n, x0 = Math.round(cx - n / 2), y0 = Math.round(cy - n / 2);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (K.m[j * n + i]) dot(x0 + i, y0 + j);
  ops += n * n * 2;
}

// One digit's arcs. mode 0: rest; 1: sputtering (p = fraction gone);
// 2: leaders (p = how far they have crept); flare: extra energy 0..1;
// surge: where the beat's bulge is along each arc (0..1, <0 none).
function arcs(S, gl, k, digit, fi, tt, mode, p, flare, surge, forks) {
  // the channel re-strikes every 3 frames (every 2 while it sputters)
  const ep = mode !== 0 ? fi >> 1 : (fi / 3) | 0;
  const KP = 5;   // a kink every 5 px of arc
  // how far the filaments may stray: at rest they hug the core (0-1 px of
  // ground between), a little wider while the digit flares
  const gap = 1.0 + 2.2 * flare;
  for (let a = 0; a < gl.arcs.length; a++) {
    const A = gl.arcs[a], n = A.n, X = A.x, Y = A.y, NX = A.nx, NY = A.ny;
    const sd = digit * 7 + a * 3 + k * 31;
    const tw = tt * (5.5 + (sd % 3)) + sd;   // the filaments' braid crawls along the arc
    // the beat's surge: a 12-px bulge of current running along the arc
    const us = surge >= 0 ? surge * (n + 24) - 12 : -99;
    let have0 = false, have1 = false, have2 = false;
    let x0p = 0, y0p = 0, x1p = 0, y1p = 0, x2p = 0, y2p = 0;
    const shift = (ep * 7) & 3;   // kinks land somewhere new each strike
    for (let i = 0; i < n; i++) {
      // sputter and leaders work in 3-px chunks ranked by a golden-ratio
      // sequence along each arc: removal and reveal stay even over the
      // whole outline, so the digit thins to a dashed line of itself and
      // never to a part that reads as another digit
      const rk = (((i / 3) | 0) * 0.618034 + a * 0.29) % 1;
      const coreOn = !(mode === 1 && rk * 0.6 + 0.4 < p) && !(mode === 2 && rk >= p);
      const filOn = mode !== 2 && !(mode === 1 && rk * 0.4 < p);
      if (!coreOn) have0 = false;
      if (!filOn) { have1 = false; have2 = false; }
      if (!coreOn && !filOn) continue;
      const env = Math.min(1, (i + 1) / 7, (n - i) / 7);
      const ii = i + shift, g = (ii / KP) | 0, fr = (ii - g * KP) / KP;
      const h0 = hash(sd, g, ep), h1 = hash(sd, g + 1, ep);
      const jag = (((h0 & 255) + (((h1 & 255) - (h0 & 255)) * fr)) - 128) / 128;
      const oc = env * (mode === 2 ? 1.4 : 0.5 + 0.4 * flare) * jag;
      const du = i - us, inSurge = du > -12 && du < 12;
      // the bulge: filaments swell out to ~4 px as the surge passes, then hug the core again
      const bulge = inSurge ? 2.6 * (1 - (du < 0 ? -du : du) / 12) : 0;
      const cx = S.x + X[i], cy = S.y + Y[i], nx = NX[i], ny = NY[i];
      if (coreOn) {
        // the core: 2 px wide, 3 px where the surge or a flare passes
        const b = mode === 2 ? 0 : inSurge || flare > 0.45 ? 2 : 1, off = b === 1 ? 0.5 : 0;
        const x = Math.round(cx + nx * oc - off), y = Math.round(cy + ny * oc - off);
        if (have0) line(x0p, y0p, x, y, b, false); else stamp(x, y, b);
        x0p = x; y0p = y; have0 = true;
        ops += 30;
      }
      if (filOn) {
        // two thin filaments, one each side, kinked on their own, braiding
        const k0 = (h0 >> 8) & 255, k1 = (h1 >> 8) & 255, k2 = (h0 >> 16) & 255, k3 = (h1 >> 16) & 255;
        const wob = SN[((i * 9 + tw * 160) | 0) & 1023] / 254;
        const g1 = 1.5 + bulge + gap * (k0 + (k1 - k0) * fr) / 255 + wob;
        const g2 = 1.5 + bulge + gap * (k2 + (k3 - k2) * fr) / 255 - wob;
        const o1 = oc + env * g1, o2 = oc - env * g2;
        const xa = Math.round(cx + nx * o1), ya = Math.round(cy + ny * o1);
        const xb = Math.round(cx + nx * o2), yb = Math.round(cy + ny * o2);
        if (have1) line(x1p, y1p, xa, ya, 0, false); else dot(xa, ya);
        if (have2) line(x2p, y2p, xb, yb, 0, false); else dot(xb, yb);
        x1p = xa; y1p = ya; x2p = xb; y2p = yb; have1 = have2 = true;
        ops += 60;
      }
    }
    // forks: short sparks off the arc, always to the outside of the digit
    // (away from its centre), so they never reach into a counter or across
    // an open side
    for (let q = 0; q < forks; q++) {
      const i = 2 + (hash(sd, q, fi >> 2) % Math.max(1, n - 4));
      const ox = X[i] - gl.cx, oy = Y[i] - gl.cy, side = NX[i] * ox + NY[i] * oy >= 0 ? 1 : -1;
      const len = 4 + (hash(sd, q, 78 + (fi >> 2)) % 3), bend = (hash(sd, q, 79 + (fi >> 2)) & 1) ? 1 : -1;
      const xs = S.x + X[i] + NX[i] * side * 1.5, ys = S.y + Y[i] + NY[i] * side * 1.5;
      const xm = xs + NX[i] * side * len * 0.5 + NY[i] * bend * 1.2, ym = ys + NY[i] * side * len * 0.5 - NX[i] * bend * 1.2;
      const xe = xs + NX[i] * side * len, ye = ys + NY[i] * side * len;
      line(Math.round(xs), Math.round(ys), Math.round(xm), Math.round(ym), 0, false);
      line(Math.round(xm), Math.round(ym), Math.round(xe), Math.round(ye), 0, false);
      ops += 60;
    }
  }
}

// ---- the coil: toroid, secondary winding, primary turns, base
function coil(frac, tt, band) {
  // toroid: a doughnut seen from a little above: an elliptical ring with the
  // hole showing, so it reads as an apparatus and never as a stroke
  for (let y = TOR_Y - 5; y <= TOR_Y + 5; y++) {
    const dy = (y + 0.5 - (TOR_Y + 0.5)) / 5.6, hw = 16.5 * Math.sqrt(Math.max(0, 1 - dy * dy));
    const hy = (y + 0.5 - (TOR_Y - 0.5)) / 2.2, hh = hy > -1 && hy < 1 ? 8.5 * Math.sqrt(1 - hy * hy) : -1;
    for (let x = Math.round(CX - hw); x <= Math.round(CX + hw); x++) if (hh < 0 || Math.abs(x + 0.5 - CX) > hh) dot(x, y);
  }
  // secondary: a column of fine wire, a 1-px turn every third row between
  // two cheek lines: it reads as grey winding, never as a stroke; the beat's
  // surge climbs it as a bright band
  for (let x = CX - 2; x <= CX + 2; x++) { dot(x, 13); dot(x, 59); }
  for (let y = 14; y < 59; y++) {
    const solid = band >= 0 && y >= band && y < band + 6;
    if (solid) { for (let x = CX - 3; x <= CX + 3; x++) dot(x, y); }
    else if (y % 3 === 0) for (let x = CX - 3; x <= CX + 3; x++) dot(x, y);
  }
  // primary: a flat spiral round the foot, three turns seen in perspective
  for (const [rx, ry] of [[16, 3], [12, 2.2], [8, 1.5]]) {
    for (let a = 0; a < 64; a++) {
      const c = Math.cos((a / 64) * Math.PI * 2), sn = Math.sin((a / 64) * Math.PI * 2);
      if (sn < 0 && Math.abs(c) < 0.42) continue;   // hidden behind the column
      dot(Math.round(CX + rx * c), Math.round(64 + ry * sn));
    }
  }
  // base: a stepped plinth on the bench
  for (let y = 69; y < 77; y++) {
    const hw = y < 71 ? 6 : 11;
    for (let x = CX - hw; x <= CX + hw; x++) dot(x, y);
  }
  for (let x = CX - 8; x <= CX + 8; x += 4) { M[73 * W + x] = 0; M[74 * W + x] = 0; }   // vents
  ops += 1600;
}

const digitsOf = (f) => f.hh + f.mm;
// where the beat's bolt lands on a glyph: its apex (the topmost arc
// sample, nearest the middle on ties), which has nothing above it, so a bolt
// dropping straight down onto it never crosses a counter or an open side
const APEX = new Map();
function apexOf(G, d) {
  const key = (G === HG ? 'h' : 'm') + d;
  let A = APEX.get(key);
  if (A) return A;
  let bx = 0, by = 1e9, bc = 1e9;
  const mid = G === HG ? 15 : 13;
  for (const a of G[d].arcs) for (let i = 0; i < a.n; i++) {
    const y = Math.round(a.y[i]), c = Math.abs(a.x[i] - mid);
    if (y < by || (y === by && c < bc)) { by = y; bx = a.x[i]; bc = c; }
  }
  A = [bx, by];
  APEX.set(key, A);
  return A;
}

export default {
  name: 'Tesla',
  blurb: 'A Tesla-coil lab in 1-bit violet: each numeral is brass knobs with live plasma arcs between them; the coil strikes one every beat, the arcs sputter out and re-strike at the minute, a lightning storm at the hour.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec;
    ctx.lcd.backlight(1 - 0.65 * ctx.night);
    const tt = f.h * 3600 + f.m * 60 + s, fi = Math.floor(tt * 60 + 1e-6);
    const frac = s - Math.floor(s), si = Math.floor(s);
    const cur = digitsOf(f);
    const nxt = digitsOf(clockFields(new Date(ctx.date.getTime() + 60000)));
    const prv = digitsOf(clockFields(new Date(ctx.date.getTime() - 60000)));
    const hourIn = prv.slice(0, 2) !== cur.slice(0, 2), hourOut = nxt.slice(0, 2) !== cur.slice(0, 2);
    const quiet = 1 - 0.5 * ctx.night;
    M.fill(0);
    ops = 0;

    // ---- timeline of the minute
    const SP0 = 58.75, SP1 = 59.6, GL1 = 60.15, LD1 = 0.45;   // sputter, knob glide (into the next minute), leaders from :00, return stroke
    const show = hourIn && s < 3.2;
    const allBeat = si % 15 === 0 && si > 0 && si < 58;     // :15, :30, :45 the coil fires all four
    const struck = s < 58 && !(s < 2) ? (si * 3 + 1) % 4 : -1;

    // ---- the coil, with the surge climbing its winding before each strike
    let band = -1;
    if (s < 58 && frac > 0.45) band = Math.round(58 - (46 * (frac - 0.45)) / 0.55);
    else if (show || (hourOut && s > 57)) { const u = (s * 4) % 1; band = Math.round(58 - 46 * u); }
    coil(frac, tt, band);

    // ---- the bench, and on the beat a ground crawl: the strike's return
    // current runs out along the bench from the coil's foot to both ends, a
    // low crackling arc a few px above the bench
    for (let x = 0; x < W; x++) { M[FLOOR * W + x] = 1; if (((x + 2) & 3) === 0) M[(FLOOR + 2) * W + x] = 1; }
    if (s < 58.5 && frac < 0.55) {
      const reach = 12 + (W / 2) * ease.outQuad(frac / 0.55), tail = frac > 0.3 ? (frac - 0.3) / 0.25 * reach : 0;
      for (let side = -1; side <= 1; side += 2) {
        let lx = CX + side * 11, ly = FLOOR - 1;
        for (let d = 14; d <= reach; d += 2) {
          const x = Math.round(CX + side * d), h = hash(d, (fi / 2) | 0, side + 3);
          const y = FLOOR - 1 - (h % 3);   // rows 74-76: a moat row above, clear of the numerals feet
          if (d > tail) line(lx, ly, x, y, 0, false);
          lx = x; ly = y;
        }
      }
    }

    // ---- digits
    for (let k = 0; k < 4; k++) {
      const S = SLOTS[k], G = S.G;
      const cd = +cur[k], gl = G[cd];
      let mode = 0, p = 0, flare = 0, forks = 0, knobs = gl.knobs, glide = -1, P = null;
      if (cur[k] !== nxt[k] && s >= SP0) {
        if (s < SP1) { mode = 1; p = ease.inQuad((s - SP0) / (SP1 - SP0)); forks = 1; }
        else { mode = 3; glide = (s - SP1) / (GL1 - SP1); P = pairing(G, cd, +nxt[k]); }
      } else if (cur[k] !== prv[k] && s < LD1 + 1.2) {
        if (s < LD1) {
          // leaders creep along the new arcs from :00 while the knobs settle
          mode = 2; p = ease.outQuad(s / LD1);
          if (s < GL1 - 60) { glide = (s + 60 - SP1) / (GL1 - SP1); P = pairing(G, +prv[k], cd); }
        }
        else { const u = (s - LD1) / 1.2; flare = (1 - u) * (1 - u); forks = u < 0.5 ? 2 : 0; }
      }
      // the beat: the struck numeral flares; all flare on the 15 s discharge
      if (mode === 0) {
        if ((k === struck || allBeat) && frac < 0.6) { const u = frac / 0.6; flare = Math.max(flare, (1 - u) * (1 - u) * (allBeat ? 1.2 : 1)); if (frac < 0.45) forks = Math.max(forks, allBeat ? 3 : 5); }
      }
      // the surge: a bulge of current along every arc, a wave left to right
      const sq = (frac - S.x / 400) / 0.4;
      const surge = mode === 0 && sq >= 0 && sq <= 1 ? sq : -1;
      if (mode !== 3) arcs(S, gl, k, cd, fi, tt, mode, p, flare, surge, forks);
      // knobs
      if (P) {
        const e = ease.inOutCubic(clamp(glide, 0, 1));
        for (const [a, b] of P) knob(S, a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, false);
      } else for (let qi = 0; qi < knobs.length; qi++) {
        const q = knobs[qi];
        knob(S, q[0], q[1], false);
        // brush discharge: each knob hisses a short spark to the outside of
        // the digit (away from its centre), re-struck every 3 frames
        // (knobs near the middle, like the 8's waist, stay quiet: no spark into a counter)
        const ox = q[0] - gl.cx, oy = q[1] - gl.cy, ol = Math.hypot(ox, oy) || 1;
        if (mode === 0 && ol > 9) {
          const h = hash(k * 7 + qi, (fi / 3) | 0, cd);
          const a = Math.atan2(oy / ol, ox / ol) + ((h & 255) / 255 - 0.5) * 1.9, len = S.kr + 3 + ((h >> 8) % 4);
          const ca = Math.cos(a), sa = Math.sin(a), x0 = S.x + q[0] + ca * (S.kr + 1.5), y0 = S.y + q[1] + sa * (S.kr + 1.5);
          const xm = S.x + q[0] + ca * len * 0.75 - sa * (((h >> 12) & 1) ? 1 : -1), ym = S.y + q[1] + sa * len * 0.75 + ca * (((h >> 12) & 1) ? 1 : -1);
          line(Math.round(x0), Math.round(y0), Math.round(xm), Math.round(ym), 0, false);
          line(Math.round(xm), Math.round(ym), Math.round(S.x + q[0] + ca * len), Math.round(S.y + q[1] + sa * len), 0, false);
        }
      }
    }

    // ---- streamers off the toroid: a few, in fixed fans, alternating left
    // and right, each re-striking on its own cycle; they live in the sky
    // band and never enter the 4 px moat round a numeral
    const nStr = Math.round((6 + (show ? 2 : 0)) * quiet) + (ctx.night ? 1 : 0);
    const FAN_R = [-0.3, 0.02, 0.26, -0.12], FAN_L = [-0.3, -0.08, 0.06, -0.2];
    for (let j = 0; j < nStr; j++) {
      const right = (j & 1) === 0, slot = (j >> 1) & 3;
      const life = 0.5 + (hash(j, 3) % 100) / 250, cyc = Math.floor((tt + j * 0.29) / life), u = (tt + j * 0.29) / life - cyc;
      const grow = u < 0.3 ? u / 0.3 : u < 0.8 ? 1 : (1 - u) / 0.2;
      const L = (24 + (hash(j, cyc) % 30)) * (0.4 + 0.6 * grow) * (show ? 1.3 : 1);
      const jit = ((hash(j, cyc, 2) % 100) / 100 - 0.5) * 0.14;
      const ang = right ? (right ? FAN_R : FAN_L)[slot] + jit : Math.PI - FAN_L[slot] - jit;
      const sx = CX + (right ? 15 : -15), sy = TOR_Y;
      bolt(sx, sy, sx + Math.cos(ang) * L, sy + Math.sin(ang) * L, hash(j, cyc, (fi / 2) | 0), 0.18, 0, true, 1);
    }

    // ---- the beat's bolt: from the toroid through the sky to a point above
    // the numeral's apex, then straight down onto it
    const strike = (k, seed, b, fk) => {
      const S = SLOTS[k], q = apexOf(S.G, +cur[k]);
      const tx = Math.round(S.x + q[0]), ty = Math.round(S.y + q[1]) - 2, wy = S.y - 5;
      const sx = tx < CX ? CX - 14 : CX + 14;
      bolt(sx, TOR_Y + 2, tx, wy, seed, 0.14, b, true, fk);
      // the drop: a vertical leader with 1-px kinks
      let lx = tx, ly = wy;
      for (let y = wy + 3; ; y += 3) {
        const yy = y > ty ? ty : y, xx = yy === ty ? tx : tx + ((hash(seed, y) % 3) - 1);
        line(lx, ly, xx, yy, b, false);
        lx = xx; ly = yy;
        if (yy === ty) break;
      }
    };
    if (struck >= 0 && frac < 0.22) strike(struck, hash(si, (fi / 2) | 0), frac < 0.1 ? 1 : 0, 2);
    if (allBeat && frac < 0.3) for (let k = 0; k < 4; k++) strike(k, hash(si, k, (fi / 2) | 0), frac < 0.15 ? 1 : 0, 2);
    // the return stroke of a new digit is struck from the coil too
    if (s >= LD1 && s < LD1 + 0.25) for (let k = 0; k < 4; k++) if (cur[k] !== prv[k]) strike(k, hash(k, (fi / 2) | 0, 5), s < LD1 + 0.12 ? 1 : 0, 3);

    // ---- the hour: the coil lets go. After the return stroke it fires
    // bolt after bolt into the new numerals, every 0.16 s, and three
    // lightning flashes swap ink and ground for a few frames each
    let inv = false;
    if (show && s >= LD1 + 0.1 && s < 2.9) {
      const q = Math.floor((s - LD1 - 0.1) / 0.16), qa = s - LD1 - 0.1 - q * 0.16;
      if (qa < 0.11) {
        const k1 = hash(q, f.h, 3) % 4, k2 = (k1 + 1 + (hash(q, f.h, 4) % 3)) % 4;
        strike(k1, hash(q, k1, (fi / 2) | 0), qa < 0.05 ? 1 : 0, 3);
        if (q % 2 === 0) strike(k2, hash(q, k2, 7 + ((fi / 2) | 0)), 0, 2);
      }
      for (const t0 of [LD1 + 0.12, 1.25, 1.9]) if (s >= t0 && s < t0 + 0.06) inv = true;
    }

    // ---- write the two colours
    const buf = g.buf, A = inv ? GND : INK, B = inv ? INK : GND;
    for (let i = 0; i < W * H; i++) buf[i] = M[i] ? A : B;
    g.cost.px += W * H; g.cost.box += ops + W * H * 2;
  },
};
