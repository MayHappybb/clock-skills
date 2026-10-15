// Pong — the score is the time.
//
// The left player is the hours, the right player the minutes. Every minute
// the hours player misses and the minutes score; on the hour it goes the
// other way. Each point is a full rally, worked out from the wall clock
// alone: the serve leaves the net at :01, and the ball's speed is chosen so
// that after a whole number of crossings it reaches the losing paddle at :59.5,
// which has just moved the wrong way.
//
// The scores are free ROM and the net is one tile. The rest of CGRAM goes on
// what moves. The ball is 2x2 and moves in
// glass columns, so the gap between cells swallows half of it rather than
// splitting it across two cells: it never needs more than two tiles. Each
// paddle is five dots tall and needs two when it straddles the rows. Worst
// case seven slots.
//
// At 14 dots a second the ball moves about one dot a frame. The glass lags it
// by two frames, so it trails a short comet tail, as a CRT does.

import { Stage, noise, clamp, ease } from '../js/kit.js';

const FPS = 12;
const SERVE = 1.0;          // second the ball leaves the net
const MISS = 59.5;          // second the ball reaches the losing paddle
const CROSSINGS = 9;        // full crossings in a rally, after the serve's half

// Glass columns: six per cell. Paddles are two dots wide, as wide as the
// ball, one dot in from each edge.
const LEFT_X = 1, RIGHT_X = 15 * 6 + 2;
const BALL_L = LEFT_X + 2, BALL_R = RIGHT_X - 2;   // ball's left edge at contact
const SPAN = BALL_R - BALL_L;
const CENTRE = (BALL_L + BALL_R) / 2;
const PADDLE = 5;           // paddle height in dots
const TOP = 0, BOTTOM = 14; // ball's top row bounces between these

// The net: a dashed line in the last column of cell 7, which is the middle of
// the glass to within half a dot. One tile, shown in both rows.
const NET = ['....#', '....#', '.....', '.....', '....#', '....#', '.....', '.....'];

/** Reflect a value into [lo, hi], as a ball off two walls. */
function bounce(v, lo, hi) {
  const span = hi - lo, p = (((v - lo) % (2 * span)) + 2 * span) % (2 * span);
  return lo + (p <= span ? p : 2 * span - p);
}

/**
 * The rally for one minute, as contact points: the serve, then a hit or miss
 * at alternate ends. `leftLoses` is whether the hours player misses.
 */
function rally(minuteKey, leftLoses) {
  const legs = CROSSINGS + 1;
  const path = SPAN / 2 + CROSSINGS * SPAN;
  const v = path / (MISS - SERVE);
  // The ball reaches the loser on the last leg, so it starts towards the winner
  // when the leg count is even, and towards the loser when it is odd.
  let dir = (legs % 2 === 0) === leftLoses ? 1 : -1;
  const contacts = [];
  let t = SERVE, y = 3 + noise(minuteKey, 1) * 8;
  for (let i = 0; i < legs; i++) {
    const dist = i === 0 ? SPAN / 2 : SPAN;
    const dt = dist / v;
    // A new angle off every paddle, as if it was hit off-centre.
    const vy = (noise(minuteKey * 31 + i, 2) * 2 - 1) * 9 + (noise(minuteKey + i, 3) > 0.5 ? 3 : -3);
    contacts.push({ t0: t, t1: t + dt, y0: y, vy, dir, x0: i === 0 ? CENTRE : dir > 0 ? BALL_L : BALL_R });
    y = bounce(y + vy * dt, TOP, BOTTOM);
    t += dt;
    dir = -dir;
  }
  return { contacts, v };
}

/** Ball position at second `sec` of the minute, or null when out of play. */
function ballAt(sec, r) {
  if (sec < SERVE) return null;
  const leg = r.contacts.find((c) => sec < c.t1) ?? r.contacts[r.contacts.length - 1];
  const dt = sec - leg.t0;
  const x = leg.x0 + leg.dir * r.v * dt;
  if (x < -2 || x > 96) return null;
  return { x, y: bounce(leg.y0 + leg.vy * dt, TOP, BOTTOM), leg };
}

/** Where a paddle wants its top row at each of its contacts in a rally. */
function targets(side, r, leftLoses) {
  const mine = r.contacts.filter((c) => (side < 0 ? c.dir < 0 : c.dir > 0));
  const last = mine[mine.length - 1];
  const loses = (side < 0) === leftLoses;
  return mine.map((c) => {
    // Centre the paddle on the ball, which is two dots tall.
    let y = bounce(c.y0 + c.vy * (c.t1 - c.t0), TOP, BOTTOM) + 1 - (PADDLE - 1) / 2;
    // The loser's last move is the wrong way, by enough to clear the ball.
    if (loses && c === last) y += y > 5 ? -PADDLE - 2 : PADDLE + 2;
    return { t: c.t1, y: clamp(y, 0, 16 - PADDLE) };
  });
}

/**
 * A paddle's top row at second `sec`: it holds where the last point left it,
 * then glides to meet the ball at each contact, arriving just before it.
 */
function paddleTop(sec, aims, from) {
  let prev = { t: 0, y: from };
  for (const tg of aims) {
    if (sec <= tg.t) {
      const start = Math.max(prev.t, tg.t - 2.2);
      const u = clamp((sec - start) / (tg.t - 0.15 - start), 0, 1);
      return prev.y + (tg.y - prev.y) * ease.inOutQuad(u);
    }
    prev = tg;
  }
  return prev.y;
}

export default {
  name: 'Pong',
  blurb: 'The score is the time: the hours player misses every minute, the minutes player every hour.',
  bus: 'i2c100',
  panel: 'gray',
  fps: FPS,

  frame(lcd, api, { fields, date }) {
    const sec = fields.s + fields.ms / 1000;
    // The point being played is the one that ends at the next minute.
    const next = new Date(date.getTime() + 60000);
    const leftLoses = next.getMinutes() !== 0;
    const minuteKey = Math.floor(date.getTime() / 60000);
    const r = rally(minuteKey, leftLoses);

    const st = new Stage(lcd);
    for (const row of [0, 1]) st.put(7, row, NET);

    // Scores. The one that just went up blinks twice as the ball is reset.
    const scored = fields.m === 0 ? 'h' : 'm';
    const blink = sec < SERVE && Math.floor(sec / 0.25) % 2 === 1;
    if (!(blink && scored === 'h')) st.text(5, 0, fields.hh);
    if (!(blink && scored === 'm')) st.text(9, 0, fields.mm);

    // The previous point, so each paddle starts where that one left it.
    const before = rally(minuteKey - 1, fields.m !== 0);
    for (const side of [-1, 1]) {
      const from = targets(side, before, fields.m !== 0).at(-1).y;
      const top = Math.round(paddleTop(sec, targets(side, r, leftLoses), from));
      const x = side < 0 ? LEFT_X : RIGHT_X;
      for (let y = top; y < top + PADDLE; y++) st.dot(x, y).dot(x + 1, y);
    }

    const ball = ballAt(sec, r);
    if (ball) {
      const bx = Math.round(ball.x), by = Math.round(ball.y);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) st.dot(bx + dx, by + dy);
    }

    st.draw();
  },
};
