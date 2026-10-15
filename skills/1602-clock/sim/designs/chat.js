// Chat — a robot and a ghost at either end of the glass, talking about the time.
//
//   [RB] BOO, TIME?   [GH]
//   [RB]   IT'S 10:09 [GH]
//
// Each character is its own 10x16 canvas, two cells by both rows, four tiles
// each: all eight, redrawn every frame. Everything they say is ROM text in
// the cells between them, laid out like a chat app: the robot's lines on
// the top row from the left, the ghost's on the bottom row against the
// right, with a blank cell between each character and its words. Position
// says who is speaking, and so does the mouth, which flaps while that line
// is being typed out. Lines are at most ten characters.
//
// The minute is seven exchanges of eight seconds. One asks, the other
// answers, and nearly every answer carries the time in some form: the time,
// the seconds so far, the seconds left (live, counting down while you read
// it), the minutes past the hour. A few are hour-aware ("MORNING!" /
// "TOO EARLY"). After a punchline the robot sometimes turns to look at you.
// At :00 both turn to face the room and shout the new minute, the robot with
// its arms up, the ghost bobbing high; on the hour, and at midnight and noon,
// they say something else.
//
// The robot is an outline, the ghost solid, so they never read as the same
// sort of thing. The ghost's eyes are dark sockets with a lit pupil, which
// is what lets it look left, at you, or blink; its hem ripples and it floats
// a dot up and down. Typing is 120 ms a character, the mouth holds each
// state 200 ms, the float 350 ms a step: every visible change outlasts the
// glass's 150 ms.

import { noise } from '../js/kit.js';

const FPS = 10;
const TYPE = 0.12;                    // seconds per character typed
const TURN = 4;                       // the minute-turn shout, from :00
const SLOT = 8;                       // seconds per exchange after that
const REPLY = 2.8;                    // when the answer starts, into a slot
const TEXT_L = 3, TEXT_R = 12;        // a blank cell either side, so text never touches them
const WIDE = TEXT_R - TEXT_L + 1;      // ten characters a line

// ----------------------------------------------------------- the characters

const grid = () => Array.from({ length: 16 }, () => Array(10).fill('.'));
const paint = (g, art, x0, y0) => art.forEach((l, r) => [...l].forEach((ch, i) => {
  const y = y0 + r, x = x0 + i;
  if (y >= 0 && y < 16 && x >= 0 && x < 10 && ch === '#') g[y][x] = '#';
}));

/** gaze: 1 at the ghost, 0 at you. mouth: open or shut. */
function robot({ gaze, blink, mouth, armsUp, tips, chest }) {
  const g = grid();
  if (tips) { g[0][2] = '#'; g[0][7] = '#'; }
  g[1][2] = '#'; g[1][7] = '#';
  paint(g, ['##########', ...Array(6).fill('#........#'), '##########'], 0, 2);
  const ex = gaze > 0 ? [3, 6] : [2, 6];
  for (const x of ex) {
    if (blink) g[5][x] = g[5][x + 1] = '#';
    else for (const y of [4, 5]) g[y][x] = g[y][x + 1] = '#';
  }
  const mx = gaze > 0 ? 4 : 3;
  if (mouth) { for (let x = mx; x < mx + 4; x++) g[7][x] = g[8][x] = '#'; g[8][mx + 1] = g[8][mx + 2] = '.'; }
  else for (let x = mx; x < mx + 4; x++) g[8][x] = '#';
  paint(g, ['.######.', '.#....#.', chest ? '.#.##.#.' : '.#....#.', '.######.'], 1, 10);
  g[14][2] = g[15][2] = g[14][7] = g[15][7] = '#';
  const arms = armsUp ? [10, 11] : [11, 12, 13];
  for (const y of arms) g[y][0] = g[y][9] = '#';
  return g;
}

/** gaze: -1 at the robot, 0 at you. mouth: 0 shut, 1 open, 2 a slit. */
function ghost({ gaze, blink, mouth, bob, hem }) {
  const g = grid();
  paint(g, [
    '...####...',
    '.########.',
    ...Array(9).fill('##########'),
    hem ? '##.###.###' : '###.###.##',
    hem ? '#...#...#.' : '.#...#...#',
  ], 0, bob);
  for (const sx of [1, 6]) {
    for (let y = 3; y <= 5; y++) for (let x = sx; x < sx + 3; x++) g[y + bob][x] = '.';
    if (blink) for (let x = sx; x < sx + 3; x++) g[3 + bob][x] = g[5 + bob][x] = '#';
    else g[4 + bob][sx + 1 + gaze] = '#';
  }
  if (mouth === 1) for (let y = 8; y <= 9; y++) for (let x = 3; x <= 6; x++) g[y + bob][x] = '.';
  else if (mouth === 2) for (let x = 3; x <= 6; x++) g[8 + bob][x] = '.';
  return g;
}

const tiles = (g) => [0, 1].flatMap((row) => [0, 1].map((col) =>
  g.slice(row * 8, row * 8 + 8).map((l) => l.slice(col * 5, col * 5 + 5).join(''))));

// ----------------------------------------------------------- the script

const h12 = (f) => String(f.h % 12 || 12);

/** Exchanges as [who asks, question, answer], each line at most ten characters. */
const EXCHANGES = [
  ['R', () => 'BOO, TIME?', (f) => `IT'S ${f.hh}:${f.mm}`],
  ['G', () => 'WHAT TIME?', (f) => `${f.hh}:${f.mm}:${f.ss}`],
  ['R', () => 'SECONDS?', (f) => `${f.ss} SO FAR`],
  ['G', () => 'HOW LONG?', (f) => `${String(60 - f.s).padStart(2, ' ')} TO GO`],
  ['G', () => 'BOO!', (f) => `EEK! ${f.hh}:${f.mm}`],
  ['R', () => 'BEEP BOOP?', (f) => `${f.hh}:${f.mm}, BOT`],
  ['G', () => "I'M BORED", (f) => `${f.mm} PAST ${h12(f)}`],
  ['R', () => 'U REAL?', () => 'ARE YOU?'],
  ['G', () => 'NICE BOLTS', () => 'NICE SHEET'],
  ['R', () => 'U SCARED?', (f) => `OF ${f.hh}:${f.mm}?`],
  ['R', (f) => greeting(f.h)[0], (f) => greeting(f.h)[1]],
];
const PUNCHLINES = new Set([7, 8, 9, 10]);   // after these the robot looks at you

function greeting(h) {
  if (h >= 5 && h < 12) return ['MORNING!', 'TOO EARLY'];
  if (h >= 12 && h < 17) return ['LUNCH?', 'NO TUMMY'];
  if (h >= 17 && h < 22) return ['SPOOKY?', 'ALWAYS!'];
  return ['U AWAKE?', 'NO SLEEP'];
}

/** The shout at the minute turn: [robot, ghost]. */
function shout(f) {
  if (f.h === 0 && f.m === 0) return ['MIDNIGHT!!', 'SPOOKY!!'];
  if (f.h === 12 && f.m === 0) return ['NOON!!', 'NO TUMMY'];
  if (f.m === 0) return [`BONG ${f.hh}:00`, 'BOOOOOO!'];
  return [`DING ${f.hh}:${f.mm}`, 'WOOO-HOO!'];
}

/**
 * The exchange for slot `k` of minute `key`. Even slots are always ones
 * whose answer has the time in it, so it is never long off the glass; odd
 * slots are banter. Each list is walked from a different start every minute,
 * so nothing comes round twice in a row.
 */
const TIMELY = [0, 1, 4, 5, 6, 9];
const BANTER = [2, 3, 7, 8, 10];
function exchange(key, k) {
  const list = k % 2 === 0 ? TIMELY : BANTER;
  const start = Math.floor(noise(key, 41 + (k % 2)) * list.length);
  return list[(start + Math.floor(k / 2)) % list.length];
}

/** Characters of `text` typed by `dt` seconds after it started. */
const typed = (text, dt) => (dt < 0 ? '' : text.slice(0, Math.min(text.length, Math.floor(dt / TYPE) + 1)));
const typing = (text, dt) => dt >= 0 && dt < text.length * TYPE;

/** Blink for 200 ms every few seconds, out of step for each character. */
function blinking(T, seed) {
  const w = Math.floor(T / 3.3);
  const at = 0.3 + noise(w, seed) * 2.6;
  const d = T - w * 3.3;
  return d >= at && d < at + 0.2;
}

// ----------------------------------------------------------- design

export default {
  name: 'Chat',
  blurb: 'A robot and a ghost at either end of the glass, chatting about the time; at :00 they turn and shout the new minute.',
  bus: 'i2c100',
  panel: 'blue',
  fps: FPS,

  frame(lcd, api, { fields, date }) {
    const sec = fields.s + fields.ms / 1000;
    const T = date.getTime() / 1000;
    const key = Math.floor(T / 60);

    let top = '', bottom = '', rTalk = false, gTalk = false, rGaze = 1, gGaze = -1, party = false;
    if (sec < TURN) {
      // Both turn to you and shout; the ghost's line lands a beat after.
      const [r, g] = shout(fields);
      top = typed(r, sec - 0.2);
      bottom = typed(g, sec - 0.6).padEnd(g.length, ' ');
      rTalk = typing(r, sec - 0.2) || sec < 1.6;
      gTalk = typing(g, sec - 0.6) || (sec > 0.6 && sec < 2.0);
      rGaze = 0; gGaze = 0; party = true;
    } else {
      const k = Math.floor((sec - TURN) / SLOT);
      const at = sec - TURN - k * SLOT;
      const i = exchange(key, k);
      const [who, q, a] = EXCHANGES[i];
      const question = q(fields), answer = a(fields);
      const qdt = at - 0.3;
      const adt = at - Math.max(REPLY, 0.3 + question.length * TYPE + 0.5);
      const [rLine, gLine, rdt, gdt] = who === 'R' ? [question, answer, qdt, adt] : [answer, question, adt, qdt];
      top = typed(rLine, rdt);
      bottom = typed(gLine, gdt);
      // Right-align the ghost's line on its final length, so it types into place.
      bottom = bottom.padEnd(gLine.length, ' ');
      rTalk = typing(rLine, rdt);
      gTalk = typing(gLine, gdt);
      // After a punchline lands, the robot turns to look at you for a beat.
      if (PUNCHLINES.has(i) && at > 6 && at < 7.4) rGaze = 0;
      // While it is not their turn, each looks at whoever is talking.
      if (rTalk) gGaze = -1;
    }

    const flap = Math.floor(T / 0.2) % 2 === 0;
    const R = robot({
      gaze: rGaze,
      blink: !rTalk && blinking(T, 51),
      mouth: rTalk && flap,
      armsUp: party && sec < 3,
      tips: rTalk ? flap : true,
      chest: Math.floor(T) % 2 === 0,
    });
    const bobs = [1, 2, 2, 1, 0, 0];
    const G = ghost({
      gaze: gGaze,
      blink: !gTalk && blinking(T, 52),
      mouth: gTalk ? (flap ? 1 : 2) : 0,
      bob: party && sec < 3 ? [0, 0, 1][Math.floor(T / 0.35) % 3] : bobs[Math.floor(T / 0.35) % bobs.length],
      hem: Math.floor(T / 0.3) % 2,
    });

    tiles(R).forEach((t, i) => lcd.defineChar(i, t));
    tiles(G).forEach((t, i) => lcd.defineChar(4 + i, t));

    const rowTop = Array(16).fill(0x20), rowBottom = Array(16).fill(0x20);
    rowTop[0] = 0; rowTop[1] = 1; rowBottom[0] = 2; rowBottom[1] = 3;
    rowTop[14] = 4; rowTop[15] = 5; rowBottom[14] = 6; rowBottom[15] = 7;
    [...top.slice(0, WIDE)].forEach((ch, i) => { rowTop[TEXT_L + i] = ch.charCodeAt(0); });
    const b = bottom.slice(0, WIDE);
    [...b].forEach((ch, i) => { rowBottom[TEXT_R - b.length + 1 + i] = ch.charCodeAt(0); });

    lcd.setCursor(0, 0); rowTop.forEach((c) => lcd.data(c));
    lcd.setCursor(0, 1); rowBottom.forEach((c) => lcd.data(c));
  },
};
