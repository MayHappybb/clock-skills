// Sampler — the time embroidered on linen by a clockwork mouse.
//
// Minutes are satin-stitched: a bundle of parallel threads laid across a
// 6-pixel ribbon, so a stroke has the grain and the blunt, squared-off end
// that real satin stitch has, and a stroke only half worked simply stops
// where the needle is. Hours are cross-stitched on a 3-pixel grid, one X a
// cell, a quieter grey weave: two techniques, two time scales, no colon.
//
// Along the bottom a clockwork mouse bastes the hem, one zigzag stitch a
// second: reach, plant the needle, haul the thread taut, step on. Sixty
// stitches close the cloth and the mouse has walked the whole width. That
// is the only seconds hand.
//
// On the minute the flying needle hauls: the hem rips out from the mouse's
// end, towing the mouse back to the left, and the thread it recovers goes
// into the numeral. The needle rides the stitch frontier backwards, drawing
// the old digit out stitch by stitch, then forward again laying the new one,
// right to left to unpick and left to right to work. The hour is the same
// performance, longer, bracketed by the cross-stitch being picked out and
// worked again one X at a time.
//
// Everything comes from the clock: the stitch cycle from fields.sec, the
// turn scheduled either side of :00 from previousMinute() and the next
// minute, so any instant renders on its own.

import {
  ease, clamp, lerp, progress, noise, orbit, sprite,
  previousMinute, clockFields, ON, OFF, XOR,
} from '../js/kit.js';

const TAU = Math.PI * 2;

const MIN = { x: [64, 95], y: 1 };              // satin minute, ink y 2.5..33.5
const HR = { x: [6, 25], y: 11, cell: 3 };      // cross-stitch hour, 15x21 each
// The hem runs between the mouse's two extremes, so the mouse itself never
// leaves the glass: sixty stitches across ninety-seven pixels.
const HEM = { x0: 23, pitch: 1.62, n: 60, top: 56, bot: 60, fold: 61 };
const MOUSE_Y = 40;                             // top of the body sprite
const PARK = [142, 30];                         // the flying needle waits off the cloth

// ------------------------------------------------------------- the paths
//
// Each numeral is one centre-line in a 28x34 box (ink lives in x 1..27,
// y 1.5..32.5), written the way it would be worked: start, travel, finish.
// Where the thread has to cross a gap it shows as the single taut strand it
// really is, which is why the 1 and the 4 have a visible traveller.

function buildPath(build) {
  const pts = [];
  let cur = null;
  const push = (x, y, jump) => { pts.push([x, y, jump]); cur = [x, y]; };
  const P = {
    move(x, y) { push(x, y, 0); return P; },
    to(x, y, jump = 0) {
      const [x0, y0] = cur;
      const n = Math.max(1, Math.ceil(Math.hypot(x - x0, y - y0) / 0.35));
      for (let k = 1; k <= n; k++) {
        push(x0 + ((x - x0) * k) / n, y0 + ((y - y0) * k) / n, jump);
      }
      return P;
    },
    arc(cx, cy, rx, ry, a0, a1) {
      const A0 = (a0 * Math.PI) / 180, A1 = (a1 * Math.PI) / 180;
      const n = Math.max(6, Math.ceil((Math.abs(A1 - A0) * Math.max(rx, ry)) / 0.35));
      for (let k = cur ? 1 : 0; k <= n; k++) {
        const a = A0 + ((A1 - A0) * k) / n;
        push(cx + rx * Math.sin(a), cy - ry * Math.cos(a), 0);
      }
      return P;
    },
  };
  build(P);
  return pts;
}
const SKEL = [
  (P) => P.arc(14, 17, 9.4, 12.2, 0, 361),
  (P) => P.move(6, 11.5).to(13.8, 4.5).to(13.8, 29.5).to(6, 29.5, 1).to(22, 29.5),
  (P) => P.arc(14.2, 11, 8.6, 6.2, -62, 126).to(5.6, 29.5).to(23, 29.5),
  (P) => P.arc(14, 10.6, 8.2, 5.8, -54, 152).arc(13.4, 21.8, 9.6, 7.8, 28, 208),
  (P) => P.move(17.8, 4.5).to(4.6, 21.6).to(24.2, 21.6).to(19.4, 29.5, 1).to(19.4, 4.5),
  (P) => P.move(22.6, 5).to(7.4, 5).to(5.6, 17.4).arc(13.8, 21.4, 9.4, 8.1, -76, 204),
  (P) => P.arc(21.4, 19.4, 15.6, 14.4, -4, -88).arc(13.8, 20.4, 9.2, 9.2, 272, 630),
  (P) => P.move(4.8, 5).to(23.2, 5).to(9.6, 29.5),
  (P) => P.arc(14, 10.4, 7.2, 6.1, 180, -181).arc(14, 22.6, 9, 7.4, 0, 361),
  (P) => P.arc(6.6, 15, 15.6, 14.4, 176, 88).arc(14.2, 14.6, 9.2, 9.2, 88, 450),
];

const PITCH = 1.42;   // along the stroke, between threads
const SATW = 5.4;     // ribbon width
const LEAN = 0.30;    // the threads are laid slightly off square

/**
 * Pre-compute a numeral as a run of satin threads: each is a short bar
 * across the ribbon, so the silhouette stays crisp however far it is worked
 * and the parallel threads read as grain. Travellers are a single strand.
 */
function prep(pts) {
  const n = pts.length;
  const s = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    s[i] = s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  const L = s[n - 1];
  // Where the ribbon has a free end: the start, the finish, and either side
  // of a traveller. A closed loop has none, so it stays an even width.
  const term = [];
  if (Math.hypot(pts[0][0] - pts[n - 1][0], pts[0][1] - pts[n - 1][1]) > 1.5) term.push(0, L);
  for (let i = 1; i < n; i++) if (pts[i][2] !== pts[i - 1][2]) term.push(s[i]);
  const taper = (t) => {
    let d = 9e9;
    for (const q of term) d = Math.min(d, Math.abs(t - q));
    return clamp(0.66 + (0.34 * d) / 2.6, 0, 1);
  };

  const bars = [], pos = [];
  let i = 0;
  for (let t = 0, j = 0; t <= L + 1e-6; t += PITCH, j++) {
    while (i < n - 2 && s[i + 1] < t) i++;
    const seg = s[i + 1] - s[i];
    const f = seg > 1e-9 ? (t - s[i]) / seg : 0;
    const x = lerp(pts[i][0], pts[i + 1][0], f), y = lerp(pts[i][1], pts[i + 1][1], f);
    let tx = pts[i + 1][0] - pts[i][0], ty = pts[i + 1][1] - pts[i][1];
    const d = Math.hypot(tx, ty) || 1;
    tx /= d; ty /= d;
    const jump = pts[Math.min(n - 1, i + 1)][2];
    // the scallop: every other thread sits a shade proud of its neighbour
    const w = (SATW * taper(t) * (j & 1 ? 1 : 0.9)) / 2;
    const lx = -ty * w + tx * LEAN * w, ly = tx * w + ty * LEAN * w;
    bars.push(jump ? [x, y, x, y, t, 1] : [x - lx, y - ly, x + lx, y + ly, t, 0]);
    pos.push([x + lx * 1.05, y + ly * 1.05]);
  }
  return { bars, pos, L };
}

const SAT = SKEL.map((b) => prep(buildPath(b)));
/** Lay the first `u` of a numeral. Returns the stitch frontier. */
function drawSatin(g, d, ox, oy, u) {
  const S = SAT[d];
  if (u <= 0) return [S.pos[0][0] + ox, S.pos[0][1] + oy];
  const cut = Math.min(u, 1) * S.L;
  let last = 0, run = null;
  for (let i = 0; i < S.bars.length; i++) {
    const [ax, ay, bx, by, t, jump] = S.bars[i];
    if (t > cut) break;
    last = i;
    if (jump) {
      // a traveller: one strand, drawn taut from where the thread left off
      if (run) {
        g.line(Math.round(run[0] + ox), Math.round(run[1] + oy),
          Math.round(ax + ox), Math.round(ay + oy), ON);
      }
      run = [ax, ay];
    } else {
      run = null;
      g.thickLine(ax + ox, ay + oy, bx + ox, by + oy, 1.2, ON);
    }
  }
  return [S.pos[last][0] + ox, S.pos[last][1] + oy];
}

// --------------------------------------------------------- cross stitch
//
// Sampler numerals on a 5x7 grid worked as Xs. Kept plain and open — at four
// pixels a cell a slashed 0 or a barred 7 collapses into a motif, not a digit.

const XBM = [
  '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
  '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
  '.###.|#...#|....#|.###.|#....|#....|#####',
  '####.|....#|....#|.###.|....#|....#|####.',
  '#...#|#...#|#...#|#####|....#|....#|....#',
  '#####|#....|#....|####.|....#|....#|####.',
  '.###.|#....|#....|####.|#...#|#...#|.###.',
  '#####|....#|....#|...#.|...#.|...#.|...#.',
  '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
  '.###.|#...#|#...#|.####|....#|....#|####.',
];

// Worked in boustrophedon order, along one row and back along the next,
// because that is how the needle actually travels.
const XCELL = XBM.map((bm) => {
  const out = [];
  bm.split('|').forEach((row, r) => {
    const cols = [...row].map((c, i) => (c === '#' ? i : -1)).filter((i) => i >= 0);
    if (r & 1) cols.reverse();
    for (const c of cols) out.push([c, r]);
  });
  return out;
});

/** Work `n` crosses; the one in progress has only its first leg down. */
function drawCross(g, d, ox, oy, n) {
  // the diagonals span a whole cell, so neighbouring crosses touch at the
  // corners and the worked area reads as one piece of cloth
  const cells = XCELL[d], C = HR.cell, S = C;
  const lim = clamp(n, 0, cells.length), full = Math.floor(lim);
  for (let i = 0; i < full; i++) {
    const [c, r] = cells[i], x = ox + c * C, y = oy + r * C;
    g.line(x, y, x + S, y + S, ON);
    g.line(x + S, y, x, y + S, ON);
  }
  const k = clamp(full, 0, cells.length - 1);
  if (full < cells.length && lim - full > 0) {
    const [c, r] = cells[full], x = ox + c * C, y = oy + r * C;
    g.line(x, y, x + S, y + S, ON);
    if (lim - full > 0.55) g.line(x + S, y, x, y + S, ON);
  }
  return [ox + cells[k][0] * C + S / 2, oy + cells[k][1] * C + S / 2];
}
// -------------------------------------------------------------- the hem
//
// Sixty zigzag basting stitches closing the edge of the cloth, one a second.

const hemV = (k) => [HEM.x0 + k * HEM.pitch, k & 1 ? HEM.bot : HEM.top];

function drawHem(g, to, ox, oy) {
  const b = Math.min(HEM.n, to);
  for (let k = 0; k < b; k++) {
    const [x0, y0] = hemV(k), [x1, y1] = hemV(k + 1);
    const fr = Math.min(1, b - k);
    g.thickLine(x0 + ox, y0 + oy, lerp(x0, x1, fr) + ox, lerp(y0, y1, fr) + oy, 1.4, ON);
  }
}

/**
 * The crease of the turned-under edge. Always there — folding the cloth is
 * not the mouse's job — so the bottom of the frame keeps an anchor even at
 * the turn, when every basting stitch has been pulled out.
 */
function drawFold(g, ox, oy) {
  g.shade(HEM.x0 + ox, HEM.fold + oy, HEM.n * HEM.pitch, 1, 0.5, ON);
}

// ----------------------------------------------------------- the needle

function drawNeedle(g, tx, ty, len, dx, dy) {
  const bx = tx + dx * len, by = ty + dy * len;
  g.thickLine(bx, by, lerp(bx, tx, 0.72), lerp(by, ty, 0.72), 2.2, OFF);
  g.thickLine(bx, by, lerp(bx, tx, 0.72), lerp(by, ty, 0.72), 1.4, ON);
  g.line(Math.round(lerp(bx, tx, 0.6)), Math.round(lerp(by, ty, 0.6)),
    Math.round(tx), Math.round(ty), ON);
  g.pixel(Math.round(lerp(bx, tx, 0.1)), Math.round(lerp(by, ty, 0.1)), OFF);  // the eye
  return [bx, by];
}

/**
 * A strand of thread: dotted, and sagging across its whole span rather than
 * per segment, so even a long reach reads as something limp and fibrous and
 * never as a drawn line. XOR, so it shows over the worked cloth and over black.
 */
function thread(g, pts, sag, step = 1) {
  const seg = [];
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    seg.push(d);
    L += d;
  }
  if (L < 0.6) return;
  const n = Math.max(2, Math.round(L / step));
  for (let i = 0, run = 0, j = 0; i <= n; i++) {
    const want = (i / n) * L;
    while (j < seg.length - 1 && want > run + seg[j]) { run += seg[j]; j++; }
    const f = seg[j] > 0.001 ? clamp((want - run) / seg[j], 0, 1) : 0;
    g.pixel(Math.round(lerp(pts[j][0], pts[j + 1][0], f)),
      Math.round(lerp(pts[j][1], pts[j + 1][1], f)
        + Math.sin((i / n) * Math.PI) * sag), XOR);
  }
}
// ------------------------------------------------------------ the mouse
//
// Hand-drawn, because at twenty pixels long no formula gets a mouse right.
// Three poses: standing, dipped forward to plant the needle, and leaning
// back to haul. Ear, eye, tail, legs, arm and the wind-up key on its flank
// are drawn on top so they can move independently of the body.

// A mouse is read off two cues: a round rump and a small head with a big ear
// on it. So every pose keeps a notch at the neck, a blunt left end and a
// single point — the snout. Without the notch the silhouette reads as a fish.
const STAND = sprite(`
  ......#####...............
  ....#########....####.....
  ...###########..#######...
  ..#############.#######...
  ..#####################...
  .#####################....
  .#######################..
  .#########################
  .#######################..
  .#####################....
  ..##################......
  ..################........
  ...#############..........
  .....#########............
`);
const REACH = sprite(`
  ......#####...............
  ....#########.............
  ...###########....####....
  ..#############..#######..
  ..######################..
  .########################.
  .#########################
  .#######################..
  .#####################....
  ..##################......
  ..#################.......
  ..###############.........
  ...############...........
  .....#########............
`);
// Reared back on its haunches, snout up: the pose for pulling on something.
const HAUL = sprite(`
  ..............#####.......
  ...........##########.....
  .........###############..
  ......#################...
  ...###################....
  .####################.....
  ####################......
  ###################.......
  ##################........
  .################.........
  ..##############..........
  ...############...........
  ....##########............
  ......#######.............
`);

const POSE = [
  { spr: STAND, ear: [18, 1], eye: [20, 5], nose: [25, 7], sh: [16, 9], tail: [1, 8], foot: 13 },
  { spr: REACH, ear: [19, 3], eye: [21, 7], nose: [25, 6], sh: [17, 10], tail: [1, 7], foot: 13 },
  { spr: HAUL, ear: [15, 1], eye: [19, 3], nose: [23, 2], sh: [16, 6], tail: [3, 11], foot: 13 },
];
function drawMouse(g, mx, my, G) {
  const p = POSE[G.pose];
  const at = (v) => [mx + v[0], my + v[1]];

  // tail first, trailing left and curling, swaying with the walk
  // an S: dropping off the rump, then kicking up at the tip, the way a mouse
  // carries it. A straight tail reads as a rod stuck in the back.
  const tr = at(p.tail), tail = [];
  for (let k = 0; k <= 10; k++) {
    const fr = k / 10;
    tail.push([tr[0] - fr * 15 - 1.5 * Math.sin(fr * Math.PI),
      tr[1] + 3.6 * Math.sin(fr * Math.PI * 0.9) - 7.5 * fr ** 2.2
        + Math.sin(G.swish) * 2.2 * fr * fr]);
  }
  g.stroke(tail, 3, OFF);
  g.stroke(tail, 1.4, ON);

  // hind and fore legs, swinging out of step
  for (let i = 0; i < 2; i++) {
    const lx = mx + (i ? 18 : 6), ly = my + p.foot;
    const sw = Math.sin(G.step + i * Math.PI) * 1.5 * (G.pose === 2 ? 0.3 : 1);
    g.thickLine(lx, ly, lx + sw, ly + 3.6, 3, OFF);
    g.thickLine(lx, ly, lx + sw, ly + 3.6, 1.6, ON);
  }

  const ear = at(p.ear);
  g.fillEllipse(ear[0], ear[1], 3.6, 4.1, OFF);
  g.blit(p.spr, Math.round(mx), Math.round(my), { c: ON });
  g.fillEllipse(ear[0], ear[1], 2.6, 3.1, ON);
  g.fillEllipse(ear[0], ear[1] + 1, 1.3, 1.7, OFF);

  // the wind-up key on its flank: a dark socket with a turning cross
  const kx = Math.round(mx + 7), ky = Math.round(my + 6);
  g.fillCircle(kx, ky, 2.7, OFF);
  for (let i = 0; i < 2; i++) {
    const a = G.wind + i * Math.PI;
    g.line(kx, ky, Math.round(kx + Math.sin(a) * 2.4), Math.round(ky - Math.cos(a) * 1.9), ON);
  }

  const eye = at(p.eye);
  g.fillRect(Math.round(eye[0]), Math.round(eye[1]), 2, G.blink ? 1 : 2, OFF);
  const nose = at(p.nose);
  g.pixel(Math.round(nose[0]), Math.round(nose[1]), OFF);
  for (let i = -1; i <= 1; i += 2) {    // two short whiskers
    g.line(Math.round(nose[0]) - 1, Math.round(nose[1]) + i,
      Math.round(nose[0]) + 2, Math.round(nose[1]) + i * 3, ON);
  }
  return at(p.sh);
}

/** The foreleg, reaching from the shoulder to whatever it is holding. */
function drawArm(g, sx, sy, hx, hy) {
  const ex = (sx + hx) / 2 + 1.6, ey = (sy + hy) / 2 + 0.6;
  g.stroke([[sx, sy], [ex, ey], [hx, hy]], 3, OFF);
  g.stroke([[sx, sy], [ex, ey], [hx, hy]], 1.5, ON);
}
// --------------------------------------------------------------- timing
//
// The turn is an itinerary for one needle, in seconds either side of :00.
// A plain minute is two acts; an hour is four and starts three seconds
// early, because the cross-stitch has to come out and go back in. Between
// acts the needle flies, so it never jumps stations.

const MINUTE_ACTS = [
  { t0: -1.25, t1: 0, at: 'min', lay: 0 },
  { t0: 0.02, t1: 1.35, at: 'min', lay: 1 },
];
const HOUR_ACTS = [
  { t0: -3.1, t1: -1.9, at: 'hr', lay: 0 },
  { t0: -1.25, t1: 0, at: 'min', lay: 0 },
  { t0: 0.02, t1: 1.35, at: 'min', lay: 1 },
  { t0: 1.95, t1: 4.15, at: 'hr', lay: 1 },
];
const FAR = { t0: 9e8, t1: 9e8 };

/** Share a window between the slots that change: unpick right to left. */
function share(slots, u, lay) {
  const order = lay ? slots : [...slots].reverse();
  const out = [null, null];
  let live = order[order.length - 1];
  order.forEach((s, i) => {
    const w = progress(u, i / order.length, (i + 1) / order.length);
    // Asymmetric on purpose. When both digits change there has to be an
    // instant with no minute on the cloth — holding one old digit whole
    // beside one new one would read as a wrong time — so the last digit out
    // clings on and the first one in arrives fast, and that instant is a
    // frame or two rather than half a second.
    out[s] = lay ? 1 - (1 - w) ** 2 : 1 - w * w;
    if (w > 0 && w < 1) live = s;
  });
  return { out, live };
}

/** How far a group of digits is worked, and which slot holds the needle. */
function group(slots, oldS, newS, unpick, lay, tr) {
  const U = [1, 1], D = [+oldS[0], +oldS[1]];
  let live = slots[0] ?? 0, busy = false;
  if (!slots.length) return { U, D, live, busy };
  if (tr >= lay.t1) for (const i of slots) D[i] = +newS[i];
  else if (tr <= unpick.t0) { /* still the old digits, fully worked */ }
  else if (tr <= unpick.t1) {
    const r = share(slots, progress(tr, unpick.t0, unpick.t1), 0);
    for (const i of slots) U[i] = r.out[i];
    live = r.live; busy = true;
  } else if (tr < lay.t0) {
    for (const i of slots) U[i] = 0;
  } else {
    const r = share(slots, progress(tr, lay.t0, lay.t1), 1);
    for (const i of slots) { U[i] = r.out[i]; D[i] = +newS[i]; }
    live = r.live; busy = true;
  }
  return { U, D, live, busy };
}
/** Everything this instant needs, derived from the clock alone. */
function plan(date, f) {
  const ahead = f.sec >= 30;
  const old = ahead ? f : previousMinute(date);
  const neu = ahead ? clockFields(new Date(date.getTime() + 60000)) : f;
  const tr = ahead ? f.sec - 60 : f.sec;          // seconds either side of :00
  const isHour = neu.m === 0;
  const A = isHour ? HOUR_ACTS : MINUTE_ACTS;
  const mA = [A.find((a) => a.at === 'min' && !a.lay), A.find((a) => a.at === 'min' && a.lay)];
  const hA = isHour
    ? [A.find((a) => a.at === 'hr' && !a.lay), A.find((a) => a.at === 'hr' && a.lay)]
    : [FAR, FAR];

  const mS = [0, 1].filter((i) => old.mm[i] !== neu.mm[i]);
  const hS = isHour ? [0, 1].filter((i) => old.hh[i] !== neu.hh[i]) : [];
  const M = group(mS, old.mm, neu.mm, mA[0], mA[1], tr);
  const H = group(hS, old.hh, neu.hh, hA[0], hA[1], tr);

  const satTip = () => {
    const S = SAT[M.D[M.live]];
    const k = clamp(Math.round((M.U[M.live] * S.L) / PITCH), 0, S.pos.length - 1);
    return [S.pos[k][0] + MIN.x[M.live], S.pos[k][1] + MIN.y];
  };
  const xTip = () => {
    const cells = XCELL[H.D[H.live]];
    const k = clamp(Math.round(H.U[H.live] * cells.length) - 1, 0, cells.length - 1);
    const h = (HR.cell - 1) / 2;
    return [HR.x[H.live] + cells[k][0] * HR.cell + h, HR.y + cells[k][1] * HR.cell + h];
  };

  let tip = PARK, flight = 0;
  if (M.busy) tip = satTip();
  else if (H.busy) tip = xTip();
  else {
    // In a gap: fly from the station just left to the one coming up.
    const where = (k) => (k === 'min' ? satTip() : xTip());
    let from = PARK, t0 = -9e8, to = PARK, t1 = 9e8;
    for (const a of A) {
      if (a.at === 'hr' && !hS.length) continue;
      if (a.at === 'min' && !mS.length) continue;
      if (tr < a.t0) { to = where(a.at); t1 = a.t0; break; }
      from = where(a.at); t0 = a.t1;
    }
    const FLY = 1.3;
    const [a0, a1] = t0 > -9e7 ? [t0, t0 + Math.min(t1 - t0, FLY)] : [t1 - FLY, t1];
    if (tr <= a0) tip = from;
    else if (tr >= a1) tip = to;
    else {
      const w = ease.inOutCubic(progress(tr, a0, a1));
      tip = [lerp(from[0], to[0], w), lerp(from[1], to[1], w)];
      flight = Math.sin(w * Math.PI);
    }
  }
  return { tr, isHour, M, H, tip, flight };
}
// ------------------------------------------------------------- the frame

/** The mouse's stitch of the second: reach, plant, haul, step on. */
function gait(f, hauling) {
  const k = Math.min(HEM.n - 1, f.s);
  const u = f.sec - f.s;
  const plant = progress(u, 0.26, 0.42);
  const haul = progress(u, 0.42, 0.72);
  const adv = ease.inOutCubic(progress(u, 0.6, 1));
  const dip = ease.outQuad(plant) * (1 - ease.inOutQuad(haul));
  const breathe = Math.sin(u * TAU) * 0.6;
  return {
    k, u, adv, haul, dip, breathe,
    pose: hauling ? 2 : dip > 0.45 ? 1 : 0,
    step: u * TAU,
    swish: f.sec * 1.9,
    wind: f.sec * Math.PI,
    blink: noise(Math.floor(f.sec * 0.41), 7) > 0.87,
    plantAt: hemV(k + 1),
    laid: k + ease.outCubic(haul),
  };
}

export default {
  name: 'Sampler',
  blurb: 'A clockwork mouse bastes the hem a stitch a second; minutes are satin-stitched, hours cross-stitched.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, ctx) {
    const f = ctx.fields;
    const P = plan(ctx.date, f);
    const [ox, oy] = orbit(ctx.date, 2, 3);

    // The work. Both groups ride the burn-in orbit, as one piece of cloth.
    for (let i = 0; i < 2; i++) {
      drawCross(g, P.H.D[i], HR.x[i] + ox, HR.y + oy, P.H.U[i] * XCELL[P.H.D[i]].length);
      drawSatin(g, P.M.D[i], MIN.x[i] + ox, MIN.y + oy, P.M.U[i]);
    }

    // The hem rips out from the mouse's end through the turn, towing the
    // mouse back to the left: the hem and the numeral share one thread. The
    // unpicking lands exactly on :00, so the first stitch of the new minute
    // follows on without a seam. The strand stays attached afterwards, the
    // mouse feeding it up to the needle while the numeral is laid.
    const towing = P.tr >= -1.25 && P.tr < 0;
    const leaning = P.tr >= -1.25 && P.tr < 0.6;
    const feeding = P.tr >= -1.25 && P.tr < 1.45;
    const G = gait(f, leaning);
    const open = HEM.n * (1 - ease.inOutCubic(progress(P.tr, -1.25, -0.02)));
    drawFold(g, ox, oy);
    drawHem(g, towing ? open : G.laid, ox, oy);

    // The flying needle.
    const tx = P.tip[0] + ox, ty = P.tip[1] + oy - P.flight * 3;
    const nb = drawNeedle(g, tx, ty, 10, 0.70, -0.71);

    // The mouse.
    const mx = Math.round((towing ? HEM.x0 + open * HEM.pitch
      : hemV(G.k)[0] + G.adv * HEM.pitch) - 21) + ox;
    const my = MOUSE_Y + Math.round(G.breathe + G.dip * 2) + oy;
    const sh = drawMouse(g, mx, my, G);
    if (feeding) {
      // One thread, two jobs: the hem the mouse gives up becomes the numeral.
      // The paw yanks in time and the strand keeps a slack belly, so even a
      // reach right across the face reads as thread and not as a wire.
      const taut = ease.inOutQuad(progress(P.tr, -1.25, 1.1));
      const tug = 0.5 - 0.5 * Math.cos(P.tr * TAU * 2.2);
      const dx = nb[0] - sh[0], dy = nb[1] - sh[1];
      const dl = Math.max(1, Math.hypot(dx, dy));
      // While the mouse hauls, the strand leaves its paw; once it is back at
      // work the strand leaves the cloth instead, at the stitch it is
      // working. Anchoring it on the body would let the XOR eat the mouse.
      const reach = 5 + 6 * tug;
      const hx = sh[0] + (dx / dl) * reach, hy = sh[1] + (dy / dl) * reach;
      let a = [hx, hy];
      if (leaning) drawArm(g, sh[0], sh[1], hx, hy);
      else a = [G.plantAt[0] + ox, G.plantAt[1] + oy - 1];
      thread(g, [a, [lerp(a[0], nb[0], 0.55), lerp(a[1], nb[1], 0.55)],
        [nb[0], nb[1]]], 15 * (1 - taut) + 4 + 3 * tug, 2.1);
    }
    if (!leaning) {
      // the paw rides from its rest, down to plant the needle, then hauls up
      const d = ease.outQuad(progress(G.u, 0.26, 0.42));
      const plant = [G.plantAt[0] + ox, G.plantAt[1] + oy];
      const pw = [lerp(mx + 24, plant[0], d),
        lerp(my + 13, plant[1] - 5, d) - 3.5 * ease.outCubic(G.haul)];
      drawArm(g, sh[0], sh[1], pw[0], pw[1]);
      drawNeedle(g, pw[0] - 0.5, pw[1] + 5.5, 6, 0.22, -0.98);
      thread(g, [[pw[0], pw[1]], [plant[0], plant[1]]], 2.6 * (1 - G.haul));
    }

    ctx.oled.contrast(Math.round(170 + (26 - 170) * ctx.night));
  },
};
