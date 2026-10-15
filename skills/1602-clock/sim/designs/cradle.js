// Cradle — a Newton's cradle on the desk.
//
// Five steel balls hang in a row from a bar. A cartoon glove floats in from
// the edge, points at the end ball and draws one, two or three of them out,
// then lets go: click, and the same number fly out at the far end. The swing
// dies away over a minute or so, the row shivers as one the way a real cradle
// goes muddy, and it hangs still until the glove comes back. One round in six
// it just flicks the end ball instead. Six rounds of two minutes make the
// cycle: twelve minutes, then it repeats.
//
// The bar and the strings at rest are free ROM: 'T' is a bar along the top
// dot row with a stem down the middle, so five T's side by side are the bar
// and its five strings. A resting ball is one tile, shared by all five, with
// a dark dot at its shoulder for the shine. A swinging ball is the same five
// rows stamped where it hangs, so it is the same ball lifted out. It moves in
// dot columns, five per cell: crossing a seam it keeps all five columns and
// the seam opens a dark line through it. Placed in glass columns, the gap ate
// a column and it read as a half-moon. Balls that swing together share one
// angle and hang exactly a cell apart, so a moving group deduplicates.
//
// The glove is three cells (cuff, fist, finger) and the expensive part.
// Pulls take the balls out exactly one cell, so the held pose is whole cells
// throughout. One ball is drawn out smoothly; two or three would need more
// tiles than there are mid-pull, so the glove gives them one tug, a cell in a
// frame, and the glass smears it. After a one-ball release the glove waits
// for the strike and backs out a whole cell at a time, which keeps its tiles
// constant; after a multi-ball release it is simply gone. An earlier forearm
// and fist read as a pipe with a lump.
//
// Up to 8 tiles (checked at every frame of the whole twelve-minute cycle).
// ~40 ms on 100 kHz I2C, 10 fps.

import { Stage, clamp, ease } from '../js/kit.js';

const FPS = 10;
const N = 5;
const C0 = 6;                    // cell of the first ball
const ROUND = 120;               // seconds per round
const P = 2.4;                   // pendulum period, s
const W = (2 * Math.PI) / P;

// The dot geometry, in mm (datasheet): a cell is 3.55 mm across, dot rows are
// 0.70 mm apart, and the bottom row of cells starts 5.95 mm down.
const PY = 0.7, CX = 3.55, CY = 5.95;
const L = CY + 4 * PY;           // string length, mm: bar to a resting ball's centre

// A steel ball: the dark dot at its shoulder is the highlight.
const BALL = ['.###.', '#.###', '#####', '#####', '.###.'];
// At rest, with the end of its string: the stem of the 'T' above stops a dot
// short of its cell, as ROM glyphs do, and this picks it up.
const BALL_TILE = ['..#..', '..#..', ...BALL, '.....'];
const BAR = ['#####', '.....', '.....', '.....', '.....', '.....', '.....', '.....'];

// A pull takes the balls out exactly one cell (5 dot columns, one dot row
// up), so the pose the eye rests on, held in the hand, has every ball whole
// in its own cell and the glove whole in its three.
const PULL = Math.asin((5 * CX / 5) / L);

// The rounds: how many balls, from which side, and whether the hand pulls
// them out or a finger flicks the end of the row.
const ROUNDS = [
  { n: 1, side: -1, start: 'tap', amp: 0.5 },
  { n: 2, side: -1, start: 'pull' },
  { n: 1, side: 1, start: 'pull' },
  { n: 3, side: -1, start: 'pull' },
  { n: 1, side: -1, start: 'pull' },
  { n: 2, side: 1, start: 'pull' },
];

const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };

// ------------------------------------------------------------- the round

/**
 * Everything about second `tau` of a round: each ball's angle, and where the
 * hand is. The start is scripted; after the release the cradle is a virtual
 * pendulum psi: while psi is on the pulled side, the pulled group hangs at
 * psi and the rest hang still; on the other side the far group does.
 */
function roundState(rd, tau) {
  const s = rd.side, A = rd.amp ?? PULL;
  const angles = Array(N).fill(0);
  const near = [...Array(rd.n).keys()].map((i) => (s < 0 ? i : N - 1 - i));
  const far = [...Array(rd.n).keys()].map((i) => (s < 0 ? N - 1 - i : i));
  let hand = null;

  // Script of the start, in seconds of the round.
  const IN0 = 2, IN1 = 4.2;             // hand comes in
  const GRIP = 4.8;                     // finger on the ball, pulling starts
  const PULL1 = 7.0;                    // ball out at full height
  const LET = 8.0;                      // let go, ball falls
  let release;

  if (rd.start === 'pull') {
    release = LET;
    if (tau < LET) {
      // One ball is drawn out smoothly. Two or three moving together with the
      // hand on the glass would need more tiles than there are, so the hand
      // gives them one tug, a cell in a frame, and the glass smears it.
      const u = clamp((tau - GRIP) / (PULL1 - GRIP), 0, 1);
      const pulled = rd.n === 1 ? ease.inOutQuad(u) : u >= 0.5 ? 1 : 0;
      near.forEach((i) => { angles[i] = s * A * pulled; });
      // The hand's reach: how far it is from holding the ball, 1 = off glass.
      const reach = tau < IN0 ? 1 : tau < IN1 ? 1 - ease.outQuad((tau - IN0) / (IN1 - IN0)) : 0;
      hand = { ball: near[0], reach };
      return { angles, hand };
    }
    if (rd.n === 1 && tau < LET + 1.8) {
      // Let go, and once the balls have struck, back out the way it came. With
      // more balls swinging there is no room for it: it lets go and is gone.
      const reach = ease.inQuad(clamp((tau - LET - P / 4) / 1.0, 0, 1));
      hand = { ball: near[0], reach, at: s * A, stepped: true };
    }
  } else {
    // A flick: the finger creeps up to the end ball, then strikes it.
    const HIT = 6.0;
    release = HIT;
    if (tau < HIT + 1.6) {
      let reach;
      if (tau < IN0) reach = 1;
      else if (tau < 4.6) reach = 0.45 - 0.2 * ease.outQuad((tau - IN0) / (4.6 - IN0)) + 0.55 * (1 - smooth(IN0, IN0 + 1.5, tau));
      else if (tau < 5.4) reach = 0.25 + 0.08 * ease.inOutQuad((tau - 4.6) / 0.8);   // draws back
      else if (tau < HIT) reach = 0.33 * (1 - ease.inQuad((tau - 5.4) / (HIT - 5.4)));
      else reach = ease.inQuad(clamp((tau - HIT - 0.1) / 1.2, 0, 1));
      hand = { ball: near[0], reach, stepped: tau >= HIT };
    }
  }

  const u = tau - release;
  if (u < 0) return { angles, hand };

  // The clean swing decays; the whole row's sway grows as it does, then dies.
  const clean = A * Math.exp(-u / 40) * (1 - smooth(80, 98, u));
  const sway = A * 0.16 * smooth(25, 55, u) * (1 - smooth(70, 100, u));
  // A pull starts at the near end of the arc; a flick starts at the bottom,
  // heading out on the far side.
  const psi = rd.start === 'pull' ? s * clean * Math.cos(W * u) : -s * clean * Math.sin(W * u);
  const c = sway * Math.sin(W * u * 0.97 + 0.6);
  for (let i = 0; i < N; i++) angles[i] = c;
  if (psi * s > 0) near.forEach((i) => { angles[i] = psi + c; });
  else far.forEach((i) => { angles[i] = psi + c; });
  return { angles, hand };
}

// --------------------------------------------------------------- drawing
//
// Sprites are placed in dot columns, five per cell, not in glass columns: a
// ball crossing a seam keeps all five of its columns and the seam opens a
// dark line through it, where in glass columns the gap ate one and it read
// as a half-moon.

/** Ink a dot by dot column (5 per cell) and glass dot row (0-15). */
function ink(st, x, y) {
  const col = Math.floor(x / 5);
  st.dotAt(col, y >> 3, x - col * 5, y & 7);
}

/** Ball `i` at angle `th`: its left dot column and top dot row (in row 1). */
function place(i, th) {
  return {
    x: (C0 + i) * 5 + Math.round((L * Math.sin(th)) / (CX / 5)),
    top: 2 - Math.round((L * (1 - Math.cos(th))) / PY),
  };
}

/**
 * One ball and its string. At rest it is ROM and the shared tile. Swinging,
 * it is the same five rows stamped where it hangs, and the string is the
 * nearest dot in each dot row on the line back to the pivot.
 */
function drawBall(st, i, th) {
  const { x, top } = place(i, th), x0 = (C0 + i) * 5;
  if (x === x0 && top === 2) {
    st.put(C0 + i, 0, 0x54);              // 'T': bar and string
    st.put(C0 + i, 1, BALL_TILE);
    return;
  }
  st.put(C0 + i, 0, BAR);
  const yb = 8 + top;                      // glass row of the ball's top
  for (let y = 1; y < yb; y++) ink(st, x0 + 2 + Math.round(((x - x0) * y) / yb), y);
  BALL.forEach((line, r) => [...line].forEach((ch, k) => { if (ch === '#') ink(st, x + k, yb + r); }));
}

// A cartoon glove pointing right, three cells wide: the cuff, the fist (thumb
// over the top, fingers curled under) and the index finger, which runs to the
// edge of its cell, level with the middle of the ball. Held against a ball
// in its own cell, the glove's cells are whole, and the two seams fall at the
// wrist and at the knuckle.
const GLOVE = [
  '..... ..... .....',
  '...## .##.. .....',
  '...## ####. .....',
  '...## ####. .....',
  '...## ##### #####',
  '...## ###.. .....',
  '...## .##.. .....',
  '..... ..... .....',
].map((l) => l.replace(/ /g, ''));
const GW = GLOVE[0].length;

/**
 * The glove at the ball whose left column is x, the fingertip touching it
 * from the outside, or `reach` of the way back to the edge of the glass.
 * Backing out after the release it moves a whole cell at a time, so its
 * tiles stay the same while the swing is under way.
 */
function drawHand(st, x, side, reach, stepped) {
  let shift = reach * (side < 0 ? x : 80 - (x + 5));
  shift = stepped ? Math.ceil(shift / 5 - 1e-9) * 5 : Math.round(shift);
  GLOVE.forEach((line, r) => [...line].forEach((ch, k) => {
    if (ch === '#') ink(st, side < 0 ? x - GW + k - shift : x + 4 + GW - k + shift, 8 + r);
  }));
}

export default {
  name: 'Cradle',
  blurb: "A Newton's cradle: pulled, released, click-clack, and slowly still again.",
  bus: 'i2c100',
  panel: 'gray',
  fps: FPS,

  frame(lcd, api, { fields }) {
    const T = fields.h * 3600 + fields.m * 60 + fields.s + fields.ms / 1000;
    const k = Math.floor(T / ROUND);
    const rd = ROUNDS[k % ROUNDS.length];
    const { angles, hand } = roundState(rd, T - k * ROUND);

    const st = new Stage(lcd);
    angles.forEach((th, i) => drawBall(st, i, th));
    if (hand) {
      drawHand(st, place(hand.ball, hand.at ?? angles[hand.ball]).x, rd.side, hand.reach, hand.stepped);
    }
    st.draw();
  },
};
