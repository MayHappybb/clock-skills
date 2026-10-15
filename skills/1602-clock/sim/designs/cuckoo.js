// Cuckoo — a cuckoo clock: chalet, dial, pendulum, pine cones, and the bird.
//
// The house is a 15x16 picture in the left three cells, redrawn every frame
// (six tiles): a steep gable with the bird's door in it, a little dial whose
// minute hand really points, a pendulum swinging once a second under the
// floor, and a pine cone hanging either side. The time and date are in ROM
// beside it.
//
// On the hour the door opens and the bird slides out on its arm, in
// profile, into the two cells to the right of the house (the seventh and
// eighth tiles). It calls the hour, twelve-hour style, one call a second:
// tail up and beak open on CUC-, beak open again on KOO!, and a dot printed
// for every call so the count can be read. On the half hour it calls once.
// Then it slides back in and the door shuts.
//
// Every step of the motion holds 150 ms or more: the slide is three steps of
// 200 ms, and the beak and tail move on each half-note.

import { clamp } from '../js/kit.js';

const W = 25, H = 16;                 // cells 0-4, both rows: house 0-2, bird 3-4
const HOUSE_W = 15;

const HOUSE = [
  '.......#.......',
  '......#.#......',
  '.....#...#.....',
  '....#.###.#....',
  '...#..#.#..#...',
  '..#...###...#..',
  '.#...........#.',
  '###############',
  '..#...###...#..',
  '..#..#...#..#..',
  '..#..#...#..#..',
  '..#..#...#..#..',
  '..#...###...#..',
  '..###########..',
];
const DOOR = { x: 7, y: 4 };          // the door's middle dot, in the gable
const DIAL = { x: 7, y: 10 };         // the dial's centre dot

// The bird in profile, facing right, on the end of its arm. 10 wide: when it
// is all the way out it fills cells 3-4 of the top row.
const BIRD = {
  rest: [
    '..........',
    '......###.',
    '.....##.##',
    '##...#####',
    '.########.',
    '..######..',
    '...#..#...',
    '##########',
  ],
  cuc: [
    '##........',
    '.#....####',
    '..#..##.#.',
    '...#######',
    '.########.',
    '..######..',
    '...#..#...',
    '##########',
  ],
  koo: [
    '..........',
    '......####',
    '.....##.#.',
    '##...#####',
    '.########.',
    '..######..',
    '...#..#...',
    '##########',
  ],
};

const OPEN = 0.3, SLIDE = 0.6, CALL = 1.0;

/** Where this minute's show has got to, or null if there is none now. */
function show(fields) {
  const calls = fields.m === 0 ? (fields.h % 12 || 12) : fields.m === 30 ? 1 : 0;
  if (!calls) return null;
  const sec = fields.s + fields.ms / 1000;
  const t1 = OPEN, t2 = t1 + SLIDE, t3 = t2 + calls * CALL, t4 = t3 + SLIDE, t5 = t4 + OPEN;
  if (sec >= t5) return null;
  // How far out the bird is: a third, two thirds, all the way, and back.
  const out = sec < t1 ? 0 : sec < t2 ? Math.floor(((sec - t1) / SLIDE) * 3) / 3 + 1 / 3
    : sec < t3 ? 1 : sec < t4 ? 1 - Math.floor(((sec - t3) / SLIDE) * 3) / 3 - 1 / 3 : 0;
  const call = sec >= t2 && sec < t3 ? (sec - t2) / CALL : -1;
  const phase = call >= 0 ? call % 1 : -1;
  return {
    calls,
    out: clamp(out, 0, 1),
    heard: sec >= t3 ? calls : call >= 0 ? Math.floor(call) + 1 : 0,
    note: phase < 0 ? 0 : phase < 0.5 ? 1 : 2,      // CUC- then KOO!
    beak: phase >= 0 && (phase % 0.5) < 0.3,
  };
}

function picture(fields, seq) {
  const px = Array.from({ length: H }, () => Array(W).fill(false));
  const paint = (art, x0, y0, clipX = 0) => art.forEach((line, r) => [...line].forEach((ch, c) => {
    const x = x0 + c, y = y0 + r;
    if (ch === '#' && x >= clipX && x < W && y >= 0 && y < H) px[y][x] = true;
  }));
  paint(HOUSE, 0, 0);

  // The minute hand: the dial is three dots across inside, so it is one dot
  // out from the centre, in eight directions. Enough to glance at.
  const a = ((fields.m + fields.s / 60) / 60) * 2 * Math.PI;
  px[DIAL.y][DIAL.x] = true;
  px[DIAL.y - Math.round(Math.cos(a))][DIAL.x + Math.round(Math.sin(a))] = true;

  // The door is shut (filled) until the show starts.
  px[DOOR.y][DOOR.x] = !seq;

  // The pendulum hangs from the floor and swings once a second.
  const sec = fields.s + fields.ms / 1000;
  const dx = Math.round(2 * Math.sin(Math.PI * sec));
  px[14][7 + Math.round(dx / 2)] = true;
  for (const x of [6, 7, 8]) px[15][x + dx] = true;
  // Pine cones hanging from the floor either side.
  for (const cx of [3, 11]) { px[14][cx] = true; px[15][cx - 1] = px[15][cx] = px[15][cx + 1] = true; }

  if (seq && seq.out > 0) {
    const art = !seq.beak ? BIRD.rest : seq.note === 1 ? BIRD.cuc : BIRD.koo;
    // Slides out of the wall: everything left of the house's edge is hidden.
    paint(art, HOUSE_W - 10 + Math.round(seq.out * 10), 0, HOUSE_W);
  }
  return px;
}

const tile = (px, col, row) => px.slice(row * 8, row * 8 + 8)
  .map((r) => r.slice(col * 5, col * 5 + 5).map((v) => (v ? '#' : '.')).join(''));

export default {
  name: 'Cuckoo',
  blurb: 'A chalet with a working dial and swinging pendulum; on the hour the bird slides out and calls the hour, a dot per call.',
  bus: 'i2c100',
  panel: 'green',
  fps: 12,

  frame(lcd, api, { fields }) {
    const seq = show(fields);
    const px = picture(fields, seq);

    const top = Array(16).fill(0x20), bottom = Array(16).fill(0x20);
    let slot = 0;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) { lcd.defineChar(slot, tile(px, col, row)); (row ? bottom : top)[col] = slot++; }
    }
    if (seq && seq.out > 0) for (const col of [3, 4]) { lcd.defineChar(slot, tile(px, col, 0)); top[col] = slot++; }

    const put = (arr, col, text) => [...text].forEach((ch, i) => { arr[col + i] = ch.charCodeAt(0); });
    if (seq) {
      if (seq.note >= 1) put(top, 6, 'CUC-');
      if (seq.note >= 2) put(top, 10, 'KOO!');
      for (let k = 0; k < seq.heard; k++) bottom[4 + k] = 0xa5;
    } else {
      const h12 = String(fields.h % 12 || 12).padStart(2, ' ');
      put(top, 6, `${h12}:${fields.mm} ${fields.h < 12 ? 'am' : 'pm'}`);
      put(bottom, 5, `${fields.dow} ${String(fields.day).padStart(2, ' ')} ${fields.month}`);
    }

    lcd.setCursor(0, 0); top.forEach((c) => lcd.data(c));
    lcd.setCursor(0, 1); bottom.forEach((c) => lcd.data(c));
  },
};
