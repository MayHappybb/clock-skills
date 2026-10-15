// Goban — the time as a position on a go board.
//
// A goban at night, the glass black. A game is in progress and the position IS
// the clock: two big groups of white stones — solid lit discs, the only solid
// light on the panel — spell the minutes across the middle of the board, and a
// smaller, lighter group sits to their left with the hour, its stones a size
// down and hollow, so the two never read as one row of four numerals. The
// colon between them is two small stones.
//
// The lattice is pitched at one stone's width, four and a half pixels, so the
// stones of a stroke overlap and the numeral reads as one unbroken wire of
// beads rather than a scatter of dots — that is the whole of the letterform,
// and there is no font in it anywhere.
//
// Nothing is lit that is not a stone, except the rim — dotted, because it is
// the track the seconds bead walks in — and six star points, as a goban marks
// them. A goban's lines are dark wood; here they are simply not drawn. Each
// stone still cuts a small pocket out of what little is lit, so it sits on the
// board rather than in it.
//
// The seconds are a stone walked round the rim: one lap a minute, lifting and
// settling on each point it passes and ringing where it lands. The rim of the
// board is the second hand.
//
// On the minute, the digit that changes is *captured*. A black stone is played
// on its last liberty; then its stones lift, one after another from the foot
// of the group up, and are carried off towards the lid of the bowl, gone by
// :00. A moment after :00 the new digit's stones come out of the hand and
// click down one at a time, each landing with a ring. The old time is only
// ever shown before :00 and the new one after, and no instant shows part of
// one digit reading as some other.
//
// On the hour the whole board is swept: the stones blow outwards from the
// middle of the board in rings, the board stands empty, and the new time is
// dealt back in from the middle outwards.
//
// Burn-in: the board walks a small orbit, so no lit pixel of the rim or the
// star points stays put, and the seconds stone is always crossing the rim.
// From 23:00 to 07:00 the panel dims.

import { clamp, ease, progress, orbit, clockFields } from '../js/kit.js';

const TAU = Math.PI * 2;

// ------------------------------------------------------------ the board

const P = 4.5;                     // grid pitch, pixels: a stone's own width, so
                                   // a stroke of them is one unbroken wire
const OX = 10, OY = 5;             // where column 0, row 0 sits
const COLS = 25, ROWS = 13;        // the slice of board on the glass
const colX = (c) => OX + c * P;
const rowY = (r) => OY + r * P;


/**
 * The groove the seconds stone walks: the board's rim, as a rounded rectangle.
 * Sampled and measured once.
 */
const WALK = (() => {
  const x0 = colX(0) - 3, x1 = colX(COLS - 1) + 3;
  const y0 = rowY(0) - 3, y1 = rowY(ROWS - 1) + 3;
  const cr = 11, N = 5, pts = [];
  const arc = (cx, cy, a0, a1) => {
    for (let i = 0; i <= N; i++) {
      const a = a0 + ((a1 - a0) * i) / N;
      pts.push([cx + cr * Math.sin(a), cy - cr * Math.cos(a)]);
    }
  };
  for (let x = x0 + cr; x <= x1 - cr; x += 2) pts.push([x, y0]);
  arc(x1 - cr, y0 + cr, 0, Math.PI / 2);
  for (let y = y0 + cr + 2; y <= y1 - cr; y += 2) pts.push([x1, y]);
  arc(x1 - cr, y1 - cr, Math.PI / 2, Math.PI);
  for (let x = x1 - cr - 2; x >= x0 + cr; x -= 2) pts.push([x, y1]);
  arc(x0 + cr, y1 - cr, Math.PI, 1.5 * Math.PI);
  for (let y = y1 - cr - 2; y >= y0 + cr; y -= 2) pts.push([x0, y]);
  arc(x0 + cr, y0 + cr, 1.5 * Math.PI, TAU);
  const L = [0];
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[i - 1], b = pts[i % pts.length];
    L.push(L[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return { pts, L, len: L[pts.length] };
})();

/** The point `d` pixels along the walk. */
function along(d) {
  d = ((d % WALK.len) + WALK.len) % WALK.len;
  let lo = 0, hi = WALK.pts.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (WALK.L[mid] < d) lo = mid + 1; else hi = mid; }
  const i = Math.max(1, lo);
  const t = (d - WALK.L[i - 1]) / Math.max(1e-6, WALK.L[i] - WALK.L[i - 1]);
  const a = WALK.pts[i - 1], b = WALK.pts[i % WALK.pts.length];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// ------------------------------------------------------------ letterforms
//
// Both hands are stone patterns on the lattice, and drawn as such: the minutes
// six points wide and ten tall, the hour four by seven and one size down. A
// lit point is a white stone; a point drawn as a ring is a black one, which is
// what keeps the hour the lighter of the two systems.

const MIN_GLYPH = {
  0: ['..##..', '.#..#.', '#....#', '#....#', '#....#', '#....#', '#....#', '#....#', '.#..#.', '..##..'],
  1: ['..##..', '.#.#..', '#..#..', '...#..', '...#..', '...#..', '...#..', '...#..', '...#..', '.####.'],
  2: ['.####.', '#....#', '.....#', '.....#', '....#.', '...#..', '..#...', '.#....', '#.....', '######'],
  3: ['..##..', '.#..#.', '#....#', '.....#', '..###.', '.....#', '#....#', '#....#', '.#..#.', '..##..'],
  4: ['....#.', '....#.', '...#..', '..#.#.', '.#..#.', '#...#.', '######', '....#.', '....#.', '....#.'],
  5: ['######', '#.....', '#.....', '#.....', '#####.', '.....#', '.....#', '.....#', '#....#', '.####.'],
  6: ['..###.', '.#...#', '#.....', '#.....', '#.....', '#####.', '#....#', '#....#', '.#..#.', '..##..'],
  7: ['######', '.....#', '....#.', '....#.', '...#..', '...#..', '..#...', '..#...', '.#....', '.#....'],
  8: ['..##..', '.#..#.', '#....#', '.#..#.', '..##..', '.#..#.', '#....#', '#....#', '.#..#.', '..##..'],
  9: ['..##..', '.#..#.', '#....#', '#....#', '.#####', '.....#', '.....#', '....#.', '...#..', '.##...'],
};

const HOUR_GLYPH = {
  0: ['.##.', '#..#', '#..#', '#..#', '#..#', '#..#', '.##.'],
  1: ['.##.', '#.#.', '..#.', '..#.', '..#.', '..#.', '###.'],
  2: ['.##.', '#..#', '...#', '..#.', '.#..', '#...', '####'],
  3: ['.##.', '#..#', '...#', '.##.', '...#', '#..#', '.##.'],
  4: ['#..#', '#..#', '#..#', '####', '...#', '...#', '...#'],
  5: ['####', '#...', '###.', '...#', '...#', '#..#', '.##.'],
  6: ['.##.', '#...', '#...', '###.', '#..#', '#..#', '.##.'],
  7: ['####', '...#', '..#.', '..#.', '.#..', '.#..', '.#..'],
  8: ['.##.', '#..#', '#..#', '.##.', '#..#', '#..#', '.##.'],
  9: ['.##.', '#..#', '#..#', '.###', '...#', '...#', '.##.'],
};

/** The lit points of a glyph, as [col, row] pairs inside its box. */
function points(glyph, col0, row0) {
  const out = [];
  glyph.forEach((line, r) => [...line].forEach((ch, c) => { if (ch === '#') out.push([col0 + c, row0 + r]); }));
  return out;
}

// The four groups: the hour in the corner, the minutes across the board, and
// the colon between them. The minutes are the hero — solid white stones at
// full size; the hour is a smaller system, stones drawn lighter and hollow so
// the two never read as one row of four numerals.
const GROUP = [
  { cx: 1, cy: 3, kind: 'black', k: 0.9 },     // hour tens
  { cx: 6, cy: 3, kind: 'black', k: 0.9 },     // hour units
  { cx: 11, cy: 1, kind: 'white', k: 1 },      // minute tens
  { cx: 18, cy: 1, kind: 'white', k: 1 },      // minute units
];
const COLON = [[10, 4], [10, 7]];

/** Star points of the slice, as a goban marks them: the only furniture. */
const HOSHI = [[4, 1], [12, 1], [20, 1], [4, 11], [12, 11], [20, 11]];
const glyphOf = (i, d) => (i < 2 ? HOUR_GLYPH : MIN_GLYPH)[d];
const digitsOf = (f) => [+f.hh[0], +f.hh[1], +f.mm[0], +f.mm[1]];

// ------------------------------------------------------------ stones

const R = 2.3;                      // stone radius; at this pitch they overlap
const BR = 1.9;                     // the seconds stone, a bead on the rim

/**
 * A white stone is a lit disc; a black one is dark, so all that catches the
 * light is the thin bright rim of it. That difference in weight is what keeps
 * the hour a smaller system than the minutes.
 */
function glass(g, x, y, kind, r) {
  if (kind === 'white') g.fillCircle(x, y, r);
  else g.ring(x, y, Math.max(0.4, r - 1), r);
}

/** The ring a landing stone leaves: it spreads off the point and fades. */
function ripple(g, x, y, u, scale = 1) {
  if (u <= 0 || u >= 1) return;
  const r0 = R + (1.2 + 1.8 * scale) * ease.outCubic(u);
  const box = [x - r0 - 1.5, y - r0 - 1.5, 2 * r0 + 3, 2 * r0 + 3];
  g.fillWhere((px, py) => {
    const d = Math.hypot(px - x, py - y);
    return d >= r0 - 1.1 && d <= r0 ? (u < 0.55 ? 1 : 0.5) : false;
  }, 1, box);
}

// ------------------------------------------------------------ the turn
//
// Every stone carries a schedule: when it leaves the board and when it comes
// back. A stone leaving is lifted off and carried away, shrinking as it goes;
// one arriving comes out of the hand, settles on its point and rings.

const EXIT_DUR = 0.5, ENTRY_DUR = 0.52;

/** A stone being lifted off the board and carried away, `t` seconds after :00. */
function flight(t, t0, x0, y0, rr) {
  const u = (t - t0) / EXIT_DUR;
  if (u <= 0) return null;                                   // still on the board
  const p = clamp(u, 0, 1);
  const e = ease.inQuad(p);
  return { x: x0 + 26 * e, y: y0 - 30 * e, r: rr * (1 - 0.9 * p), gone: p >= 1 };
}

/** A stone coming back out of the hand on to its point. */
function arrive(t, t0, x0, y0, rr) {
  const u = (t - t0) / ENTRY_DUR;
  if (u <= 0) return null;
  const p = ease.outCubic(clamp(u, 0, 1));
  return {
    x: x0 + 22 - 22 * p,
    y: y0 - 28 + 28 * p - 5 * Math.sin(Math.PI * clamp(u, 0, 1)),
    r: rr * (0.5 + 0.5 * p),
    down: u >= 1,
  };
}

// ------------------------------------------------------------ drawing

/**
 * The board, black. A goban's lines are dark wood: here nothing is lit that is
 * not a stone, except the rim — dotted, because it is the track the seconds
 * bead runs in — and the star points. No grid.
 */
function board(g, ox, oy) {
  const x0 = Math.round(colX(0) - 3 + ox), x1 = Math.round(colX(COLS - 1) + 3 + ox);
  const y0 = Math.round(rowY(0) - 3 + oy), y1 = Math.round(rowY(ROWS - 1) + 3 + oy);
  for (let x = x0; x <= x1; x++) if ((x - ox) % 2 === 0) { g.pixel(x, y0); g.pixel(x, y1); }
  for (let y = y0; y <= y1; y++) if ((y - oy) % 2 === 0) { g.pixel(x0, y); g.pixel(x1, y); }
  for (const [c, r] of HOSHI) {
    const x = Math.round(colX(c) + ox), y = Math.round(rowY(r) + oy);
    g.pixel(x - 1, y).pixel(x + 1, y).pixel(x, y - 1).pixel(x, y + 1).pixel(x, y);
  }
}

/** The seconds stone: one lap of the board's rim a minute. */
function secondStone(S, sec) {
  const d = (sec / 60) * WALK.len;
  const step = d / 6, f = step - Math.floor(step);
  const [x, y] = along(d);
  S.push({ x, y: y - 2.4 * Math.sin(Math.PI * f), kind: 'white', r: BR * (1 - 0.08 * Math.sin(Math.PI * f)) });
  if (f < 0.4) {
    const [px, py] = along(Math.floor(step) * 6);
    S.settle = [px, py, 1 - f / 0.4];
  }
}

// ------------------------------------------------------------ the face

export default {
  name: 'Goban',
  blurb: 'A go board: white stones spell the minutes, black stones the hour, a stone walks the board rim at one lap a minute, and each minute the old digit is captured off the board as the new one is clicked down.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { date, fields: f, oled, night }) {
    const sec = f.sec;
    const [ox, oy] = orbit(date, 2, 3);
    const late = sec >= 54;
    const fromF = late ? f : clockFields(new Date(date.getTime() - 60000));
    const toF = late ? clockFields(new Date(date.getTime() + 60000)) : f;
    const t = late ? sec - 60 : sec;
    const from = digitsOf(fromF), to = digitsOf(toF);
    const hour = toF.m === 0 && t > -3.2 && t < 3.2;
    // The minute's turn: a capture. The hour's: the whole board is swept.
    const EX = hour ? -2.2 : -1.75, EX_STEP = hour ? 0.045 : 0.038;
    const EN = hour ? 0.12 : 0.25, EN_STEP = hour ? 0.045 : 0.038;
    const pill = [colX(12) + ox, rowY(6) + oy];       // the board's middle, for the sweep

    board(g, ox, oy);

    // Every stone of this frame, then the board's lines cut back around them
    // and the stones laid on top: that is what makes a stone read as a stone
    // and not as a fat intersection.
    const S = [];
    const ripples = [];
    const add = (x, y, kind, r = R) => S.push({ x, y, kind, r });

    // The colon: two stones, beating on the second.
    const beat = 1 + 0.12 * Math.sin(TAU * sec);
    for (const [c, r] of COLON) add(colX(c) + ox, rowY(r) + oy, 'white', R * 0.78 * beat);

    // The move that captures: black fills the last liberty of the doomed group
    // just before it goes, so the minute's change has a cause on the board.
    if (!hour) {
      for (const i of [2, 3]) {
        if (from[i] === to[i]) continue;
        const G = GROUP[i], pts = points(glyphOf(i, from[i]), G.cx, G.cy);
        const col = Math.round(pts.reduce((a, p) => a + p[0], 0) / pts.length);
        const row = Math.min(ROWS - 1, Math.max(...pts.map((p) => p[1])) + 1);
        add(colX(col) + ox, rowY(row) + oy, 'black', R * (1.6 - 0.6 * ease.outBack(progress(t, EX - 0.55, EX - 0.3))));
      }
    }

    for (let i = 0; i < 4; i++) {
      const G = GROUP[i], kind = G.kind, rr = R * G.k;
      if (!(hour || from[i] !== to[i])) {
        for (const [c, r] of points(glyphOf(i, to[i]), G.cx, G.cy)) add(colX(c) + ox, rowY(r) + oy, kind, rr);
        continue;
      }
      // Leaving. On the minute the doomed group goes from its foot upward, one
      // stone after another; on the hour the whole board is blown out from its
      // middle, a ring of stones at a time.
      const near = (a, b) => Math.hypot(colX(a[0]) - pill[0], rowY(a[1]) - pill[1]) - Math.hypot(colX(b[0]) - pill[0], rowY(b[1]) - pill[1]);
      const old = points(glyphOf(i, from[i]), G.cx, G.cy);
      old.sort(hour ? near : (a, b) => b[1] - a[1] || a[0] - b[0]);
      old.forEach(([c, r], k) => {
        const x = colX(c) + ox, y = rowY(r) + oy;
        const fl = flight(t, EX + i * 0.04 + k * EX_STEP, x, y, rr);
        if (!fl) add(x, y, kind, rr);
        else if (!fl.gone) add(fl.x, fl.y, kind, fl.r);
      });
      // Arriving: the crown of the group lands first; on the hour the middle of
      // the board first, so the new time spreads out from the centre.
      const nu = points(glyphOf(i, to[i]), G.cx, G.cy);
      nu.sort(hour ? near : (a, b) => a[1] - b[1] || b[0] - a[0]);
      nu.forEach(([c, r], k) => {
        const x = colX(c) + ox, y = rowY(r) + oy;
        const t0 = EN + i * 0.04 + k * EN_STEP;
        const la = arrive(t, t0, x, y, rr);
        if (!la) return;
        if (!la.down) add(la.x, la.y, kind, la.r);
        else {
          add(x, y, kind, rr);
          ripples.push([x, y, progress(t, t0 + ENTRY_DUR, t0 + ENTRY_DUR + 0.5), hour ? 1.6 : 1]);
        }
      });
    }
    secondStone(S, sec);

    for (const s of S) g.fillCircle(s.x, s.y, s.r + 0.75, 0);  // the pocket
    for (const s of S) glass(g, s.x, s.y, s.kind, s.r);
    if (S.settle) ripple(g, S.settle[0], S.settle[1], S.settle[2], 0.4);
    for (const [x, y, u, k] of ripples) ripple(g, x, y, u, k);

    oled.contrast(0xcf + (0x20 - 0xcf) * night);
  },
};
