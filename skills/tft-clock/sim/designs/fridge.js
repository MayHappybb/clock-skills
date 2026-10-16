// Fridge: the time is a sentence somebody keeps on the fridge door.
//
// A crop of a mint enamel fridge door, close up: magnetic-poetry tiles say
// "it's twenty three / minutes past / NINE / in the morning", the hour in a
// child's chunky plastic alphabet magnets, among the usual clutter (a
// postcard, a crayon drawing under a strawberry magnet, a shopping note) and
// the chrome handle. Nobody is shown, only hands. Every minute an adult hand
// comes up from below the glass, pinches the old number off the door and,
// after :00, brings the new one and presses it into place. A two-word number
// travels as one pinched pair, so the door never says a wrong time: only a
// gap ("it's ___ minutes past nine").
//
// At the hour somebody opens the fridge: a hand pulls the handle, the door
// swings out, the cold interior light shows in the gap (it is the only bright
// thing in the kitchen at night), then the door is slammed and the jolt
// knocks the plastic letters off; they tumble out of the bottom of the
// glass before :00. After it a child's hand (striped jumper) puts the new
// hour back, letter by letter, crooked, while the adult fixes "o'clock".
// 12:00 and 0:00 are "it's NOON" and "it's MIDNIGHT".
//
// The room's light is the clock's other hand: a window's light, four panes
// and a pot plant's leaves swaying in it, crosses the door from right to
// left through the day, warm at the ends of the day; the kitchen lamp in the
// evening; dark blue at night with the backlight down.
//
// Style: a photographed-looking close-up rather than flat keylined
// graphics: lit enamel, magnets standing off the door with soft shadows
// that move with height (a lifted tile's shadow walks away from it, a hand's
// shadow meets the fingers as they touch the door). Hard pixels for the
// tiles and their type (a proportional poetry lowercase drawn for it, 9
// rows); AA for the plastic letters, the hands and everything that moves.
// Palette: mint door, cream tiles with near-black ink, the six toy-plastic
// primaries, skin and two sleeves; the postcard and drawing bring their own.

import { clockFields, previousMinute, hash, rand, sin, ease, clamp, mix } from '../js/kit.js';
import { POETRY, letterW, letterLines, PEN, hand } from './fridge-art.js';

const W = 160, H = 80;
const DOOR_T = 0xa9dcc8, DOOR_B = 0x86c2ad;          // enamel, lit from above
const TILE = 0xf5f1e6, TILE_SIDE = 0xc9c2b2, INK = 0x1d1a1a;
const SHADOW = 0x0c2a22;
const PLASTIC = [0xe0302a, 0xf6c21a, 0x2a5fd6, 0xf27a14, 0x8a3fc4, 0x0e8c3c];
const TILE_H = 11;

// ------------------------------------------------------------ the sentence
const HOURS = ['TWELVE', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE'];
const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty'];
const numWords = (m) => (m < 20 ? [ONES[m]] : ONES[m % 10] ? [TENS[(m / 10) | 0], ONES[m % 10]] : [TENS[(m / 10) | 0]]);
function period(h) {
  if (h >= 5 && h < 12) return ['in', 'the', 'morning'];
  if (h >= 12 && h < 18) return ['in', 'the', 'afternoon'];
  if (h >= 18 && h < 22) return ['in', 'the', 'evening'];
  return ['at', 'night'];
}
const strHash = (s) => { let h = 7; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193); return h >>> 0; };
const tileW = (w) => POETRY.measure(w) + 4;
const ROW = { A: 3, B: 15, C: 54, D: 66 };

// Units: what a hand moves in one go. N = the number (a pair travels
// together), U = "minute(s)", P = "past", T = each tail word.
const LAYOUTS = new Map();
function layout(f) {
  const id = f.minuteKey;
  if (LAYOUTS.has(id)) return LAYOUTS.get(id);
  const { m, h } = f;
  const special = m === 0 && (h === 0 || h === 12);
  const word = special ? (h === 0 ? 'MIDNIGHT' : 'NOON') : HOURS[f.h12];
  const tiles = [];
  const put = (unit, w, row, x, i) => {
    const r = hash(strHash(w), row.charCodeAt(0), i + x);
    const t = { unit, word: w, row, x, y: ROW[row] + (r % 3) - 1, w: tileW(w), skew: [0, 0, 1, -1, 0, 0][(r >>> 5) % 6] };
    tiles.push(t);
    return t;
  };
  put('0', "it's", 'A', 4, 0);
  let x = 4 + tileW("it's");
  const nw = m === 15 ? ['a', 'quarter'] : m === 30 ? ['half'] : m > 0 ? numWords(m) : [];
  nw.forEach((w, i) => { x += 2 + (hash(strHash(w), i) % 2); x += put('N', w, 'A', x, i).w; });
  if (m > 0) {
    const PX = 52;
    put('P', 'past', 'B', PX, 0);
    if (m !== 15 && m !== 30) { const u = m === 1 ? 'minute' : 'minutes'; put('U', u, 'B', PX - 2 - tileW(u), 0); }
  }
  const per = special ? [] : period(h);
  const rowsT = m === 0 && !special ? [["o'clock"], per] : [per, []];
  [['C', 13], ['D', 27]].forEach(([row, x0], ri) => {
    let xx = x0;
    rowsT[ri].forEach((w, i) => { const t = put('T' + row + i, w, row, xx, i); xx += t.w + 2 + (hash(strHash(w), i, 3) % 2); });
  });
  // the hour, in plastic letters
  const seed = strHash(word) + h * 131;
  const letters = [];
  const nat = [...word].reduce((a, ch) => a + letterW(ch) + 2, -2);
  const k = Math.min(1.3, 104 / nat);
  let lx = 5 + (seed % 3), last = -1;
  [...word].forEach((ch, i) => {
    const r = (q) => rand(seed, i, q);
    const lw = letterW(ch) * k;
    let col = (hash(seed, i, 9) % PLASTIC.length);
    if (col === last) col = (col + 1 + (hash(seed, i, 10) % 5)) % PLASTIC.length;
    last = col;
    letters.push({ ch, i, k, cx: lx + lw / 2, cy: 40.5 + (r(1) - 0.5) * 3, rot: (r(2) - 0.5) * 0.3, col: PLASTIC[col] });
    lx += lw + 1.2 + r(3) * 1.8;
  });
  const sig = {};
  for (const t of tiles) sig[t.unit] = (sig[t.unit] ?? '') + `${t.word}@${t.x},${t.y},${t.skew};`;
  const L = { tiles, letters, word, sig: { ...sig, H: word + h } };
  if (LAYOUTS.size > 64) LAYOUTS.clear();
  LAYOUTS.set(id, L);
  return L;
}
const changed = (a, b, u) => (a.sig[u] ?? '') !== (b.sig[u] ?? '');

// ------------------------------------------------------------ the minute's script
const D_TILE = 1.4, D_LETTER = 1.05;
// the hour: the door is opened and slammed
const HANDLE0 = 55.9, OPEN0 = 56.5, OPEN1 = 57.2, SLAM0 = 58.05, SLAM1 = 58.35, LET0 = 58.4;

/** Placement pose at v (0 = arriving from off the glass, 1 = gone again). */
function placePose(v) {
  if (v < 0.55) { const p = ease.outCubic(v / 0.55); return { carry: 1 - p, z: 4.5 * (1 - p), hand: 1 - p, pinch: 1, on: false }; }
  if (v < 0.65) return { carry: 0, z: 0, hand: 0, pinch: 1, on: false };
  const p = ease.inCubic((v - 0.65) / 0.35);
  return { carry: 0, z: 0, hand: p, handZ: 7 * p, pinch: 1 - clamp((v - 0.65) / 0.08, 0, 1), on: true };
}

function script(f, date) {
  const cur = layout(f);
  const sec = f.sec;
  const jobs = [];          // { unit | letter, t0, d, kind: 'place'|'remove', who }
  let hourOut = false, hourIn = false;
  if (sec < 30) {
    const prev = layout(previousMinute(date));
    hourIn = changed(prev, cur, 'H');
    const order = ['P', 'N', 'U', 'TC0', 'TC1', 'TC2', 'TD0', 'TD1', 'TD2'];
    const units = order.filter((u) => cur.sig[u] && changed(prev, cur, u));
    let t = hourIn ? 0.9 : 0.3;
    // "past" outlives the hour by a moment ("it's past ELEVEN" is still true)
    if (hourIn && prev.sig.P && !cur.sig.P) {
      jobs.push({ unit: 'Pold', tiles: prev.tiles.filter((x) => x.unit === 'P'), t0: 0.3, d: D_TILE, kind: 'remove', who: 'adult' });
      t = 0.3 + D_TILE;
    }
    for (const u of units) { jobs.push({ unit: u, t0: t, d: D_TILE, kind: 'place', who: 'adult' }); t += D_TILE; }
    if (hourIn) cur.letters.forEach((l, k) => jobs.push({ letter: l, t0: 0.5 + k * D_LETTER, d: D_LETTER, kind: 'place', who: f.h >= 22 || f.h < 6 ? 'adult' : 'kid' }));
  } else {
    const next = layout(clockFields(new Date(date.getTime() + 60000)));
    hourOut = changed(cur, next, 'H');
    const order = ['N', 'U', 'TD2', 'TD1', 'TD0', 'TC2', 'TC1', 'TC0'].concat(hourOut ? [] : ['P']);
    const units = order.filter((u) => cur.sig[u] && changed(cur, next, u));
    const end = hourOut ? HANDLE0 - 0.3 : 59.7;
    units.forEach((u, k) => jobs.push({ unit: u, t0: end - (units.length - k) * D_TILE, d: D_TILE, kind: 'remove', who: 'adult' }));
  }
  return { cur, jobs, hourOut, hourIn };
}

// ------------------------------------------------------------ drawing: magnets
function tileShape(x, y, w, skew) {
  return [[x, y], [x + w, y + skew], [x + w, y + skew + TILE_H], [x, y + TILE_H]];
}
const moveP = (pts, dx, dy) => pts.map(([a, b]) => [a + dx, b + dy]);

function drawTile(g, t, x, y, z, sh) {
  const pts = tileShape(x, y, t.w, t.skew);
  g.fillPolygon(moveP(pts, 1.2 + z * 0.9, 1.4 + z * 1.15), SHADOW, { a: z > 0.2 ? 0.2 : 0.3, aa: z > 0.2 });
  if (z > 0.2) g.fillPolygon(moveP(pts, 0.6 + z * 0.9, 0.8 + z * 1.15), SHADOW, { a: 0.12, aa: true });
  g.fillPolygon(moveP(pts, 0, 1), mix(TILE_SIDE, SHADOW, sh));
  g.fillPolygon(pts, mix(TILE, SHADOW, sh));
  let cx = Math.round(x) + 2;
  const ink = mix(INK, SHADOW, sh * 0.5);
  for (const ch of t.word) {
    const gl = POETRY.glyph(ch);
    const dy = t.skew ? Math.round((t.skew * (cx - x + gl.w / 2)) / t.w - 0.0001 * t.skew) : 0;
    g.blit(gl, cx, Math.round(y) + 1 + dy, { c: ink });
    cx += gl.w + 1;
  }
}

function drawLetter(g, l, cx, cy, rot, z, sh, a = 1) {
  const lines = letterLines(l.ch, cx, cy, rot, l.k);
  const so = [1.3 + z * 0.9, 1.9 + z * 1.15], pen = PEN * l.k;
  const col = mix(l.col, SHADOW, sh);
  for (const pl of lines) g.stroke(moveP(pl, so[0], so[1]), pen + 0.6 + z * 0.3, SHADOW, { aa: true, a: 0.28 * a });
  for (const pl of lines) g.stroke(moveP(pl, 0.45, 0.6), pen, mix(col, 0x000000, 0.28), { aa: true, a });
  for (const pl of lines) g.stroke(pl, pen, col, { aa: true, a });
  const hi = mix(col, 0xffffff, 0.6);
  for (const pl of lines) g.stroke(moveP(pl, -0.75, -0.8), 1.3 * l.k, hi, { aa: true, a: 0.7 * a });
}

// ------------------------------------------------------------ drawing: the door and its clutter
function drawDoor(g, ox, oy) {
  g.gradient(0, 0, W, H, [DOOR_T, DOOR_B]);
  // the door's rounded right edge, past the handle
  g.fillRect(158 + ox, 0, 2, H, mix(DOOR_B, SHADOW, 0.25));
  g.fillRect(160 + ox - 1, 0, 1, H, mix(DOOR_B, SHADOW, 0.5));
}

function postcard(g, ox, oy) {
  const x = 116 + ox, y = 3 + oy, w = 32, h = 21;
  g.fillRect(x + 1, y + 1, w, h, SHADOW, { a: 0.28 });
  g.fillRect(x, y, w, h, 0xf6f1e4);
  g.gradient(x + 2, y + 2, w - 4, 10, [0x5a6fc0, 0xe88a74, 0xf6cf86]);
  g.fillCircle(x + 21, y + 12, 3.6, 0xfff3c0, { aa: true });
  g.fillRect(x + 2, y + 12, w - 4, 7, 0x2f679e);
  g.fillRect(x + 17, y + 13, 8, 1, 0xf6cf86, { a: 0.8 });
  g.fillRect(x + 19, y + 15, 4, 1, 0xf6cf86, { a: 0.6 });
  g.fillRect(x + 2, y + 17, w - 4, 2, 0xe2c27a);
  // a palm
  g.thickLine(x + 7, y + 18, x + 8.5, y + 9, 1.1, 0x2a2018, { aa: true });
  for (const [dx, dy] of [[-4, 1.5], [4, 1.8], [-2.5, -2.2], [3, -2]]) g.thickLine(x + 8.5, y + 9, x + 8.5 + dx, y + 9 + dy, 1, 0x2a2018, { aa: true });
  // a round red magnet
  g.fillCircle(x + 16.5, y + 2.6, 3, SHADOW, { aa: true, a: 0.3 });
  g.fillCircle(x + 15.6, y + 1.6, 2.8, 0xd23a32, { aa: true });
  g.fillCircle(x + 14.8, y + 0.8, 0.9, 0xff9a8a, { aa: true });
}

const DRAWINGS = ['house', 'rocket', 'cat'];
function kidDrawing(g, ox, oy, day) {
  const x = 119 + ox, y = 28 + oy, w = 29, h = 35;
  g.fillPolygon([[x + 1, y + 1.5], [x + w + 1, y + 1], [x + w + 1.5, y + h + 1.5], [x + 1.5, y + h + 1]], SHADOW, { a: 0.26 });
  g.fillPolygon([[x, y], [x + w, y], [x + w, y + h - 4], [x + w - 4, y + h], [x, y + h]], 0xfbf9f1);
  g.fillPolygon([[x + w, y + h - 4], [x + w - 4, y + h - 4], [x + w - 4, y + h]], 0xddd8cb);  // a dog-ear
  const C = { blue: 0x3a64d0, red: 0xd8382e, green: 0x2f9a3e, yel: 0xf2b21c, brown: 0x8a5a2a, pink: 0xe86aa0 };
  const ln = (a, b, c, d, col) => g.line(Math.round(x + a), Math.round(y + b), Math.round(x + c), Math.round(y + d), col);
  // grass and sun on every one
  for (let i = 0; i < w - 3; i += 3) { ln(2 + i, 31, 3.5 + i, 29, C.green); ln(3.5 + i, 29, 5 + i, 31, C.green); }
  g.circle(x + 23, y + 6, 3, C.yel);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; ln(23 + 4.5 * Math.cos(a), 6 + 4.5 * Math.sin(a), 23 + 6 * Math.cos(a), 6 + 6 * Math.sin(a), C.yel); }
  const kind = DRAWINGS[day % DRAWINGS.length];
  if (kind === 'house') {
    g.rect(x + 3, y + 18, 12, 12, C.blue);
    ln(2, 18, 9, 11, C.red); ln(9, 11, 16, 18, C.red); ln(2, 18, 16, 18, C.red);
    g.rect(x + 7, y + 24, 4, 6, C.brown);
    g.rect(x + 4, y + 20, 3, 3, C.yel);
  } else if (kind === 'rocket') {
    g.rect(x + 7, y + 13, 6, 14, C.blue);
    ln(7, 13, 10, 8, C.red); ln(10, 8, 12, 13, C.red);
    ln(7, 27, 4, 30, C.red); ln(12, 27, 15, 30, C.red);
    g.circle(x + 9.5, y + 18, 1.5, C.yel);
    ln(9, 28, 8, 31, C.yel); ln(11, 28, 12, 31, C.yel);
    for (const [sx, sy] of [[3, 4], [16, 10], [5, 22], [18, 19]]) g.pixel(Math.round(x + sx), Math.round(y + sy), C.pink);
  } else {
    g.circle(x + 10, y + 22, 5, C.brown);
    ln(6, 18, 6, 13, C.brown); ln(6, 13, 9, 17, C.brown); ln(14, 18, 14, 13, C.brown); ln(14, 13, 11, 17, C.brown);
    g.pixel(Math.round(x + 8), Math.round(y + 21), C.green); g.pixel(Math.round(x + 12), Math.round(y + 21), C.green);
    ln(15, 26, 20, 22, C.brown);
    ln(3, 23, 7, 23, C.pink); ln(13, 23, 17, 23, C.pink);
  }
  // a stick person, waving
  g.circle(x + 22, y + 17, 2, C.pink);
  ln(22, 19, 22, 25, C.pink); ln(22, 25, 20, 29, C.pink); ln(22, 25, 24, 29, C.pink);
  ln(22, 21, 19, 20, C.pink); ln(22, 21, 25, 18, C.pink);
  // the strawberry magnet holding it up
  const sx = x + 14.5, sy = y + 1.5;
  g.fillEllipse(sx + 1.2, sy + 2.2, 3.4, 3.9, SHADOW, { aa: true, a: 0.3 });
  g.fillPolygon([[sx - 3.4, sy - 0.6], [sx + 3.4, sy - 0.6], [sx + 2.4, sy + 2.6], [sx, sy + 4.8], [sx - 2.4, sy + 2.6]], 0xd8262c, { aa: true });
  g.fillEllipse(sx, sy - 0.4, 3.4, 1.6, 0xd8262c, { aa: true });
  for (const [a, b] of [[-1.5, 0.6], [1.2, 0.8], [0, 2.4], [-0.6, 3.6], [1.8, 2.2], [-2, 2]]) g.pixel(Math.floor(sx + a), Math.floor(sy + b), 0xf4d36a);
  g.fillEllipse(sx, sy - 1.8, 3, 1.1, 0x2e9a3a, { aa: true });
  g.fillRect(Math.round(sx), Math.round(sy) - 4, 1, 2, 0x2e9a3a);
}

function note(g, ox, oy) {
  const x = 121 + ox, y = 67 + oy;
  g.fillRect(x + 1, y + 1, 26, 14, SHADOW, { a: 0.24 });
  g.fillRect(x, y, 26, 14, 0xf6e27c);
  g.fillRect(x, y, 26, 2, 0xe8cc5a);
  // somebody's scrawl: milk, eggs (not a word you could misread as the time)
  const pen = 0x2a3e8a;
  for (const [yy, x0, n] of [[5, 3, 13], [9, 3, 18]]) {
    let px = x + x0, py = y + yy;
    for (let i = 0; i < n; i++) {
      const ny = y + yy + ((i * 7) % 3) - 1;
      g.line(px, py, px + 1, ny, pen);
      px += 1; py = ny;
    }
  }
  g.fillCircle(x + 22.5, y + 1.5, 2.4, SHADOW, { aa: true, a: 0.3 });
  g.fillCircle(x + 21.6, y + 0.8, 2.3, 0x2a5fd6, { aa: true });
  g.fillCircle(x + 21, y + 0.2, 0.8, 0x9ab8ff, { aa: true });
}

function handle(g, ox, oy) {
  const x = 151 + ox;
  g.fillRect(x + 6, 0, 2, H, SHADOW, { a: 0.22 });          // shadow on the door
  for (const yy of [6, 70]) {
    g.fillRect(x - 1, yy + oy, 8, 5, 0x6d777c);
    g.fillRect(x - 1, yy + oy, 8, 1, 0xb8c2c6);
  }
  g.gradient(x, 0, 6, H, [[0, 0x7a858a], [0.3, 0xf2f6f8], [0.55, 0xb5bfc4], [1, 0x5c666b]], { angle: 0 });
}

function interior(g, x0) {
  // the cabinet behind the door: what the gap shows
  if (x0 >= W) return;
  const w = W - x0;
  g.gradient(x0, 0, w, H, [0xf2fbff, 0xcfe4ee]);
  g.fillRect(x0, 24, w, 2, 0x9cb8c6); g.fillRect(x0, 24, w, 1, 0xffffff);
  g.fillRect(x0, 52, w, 2, 0x9cb8c6); g.fillRect(x0, 52, w, 1, 0xffffff);
  g.fillRoundRect(150, 6, 8, 18, 2, 0xc8302a, { aa: true });         // a ketchup
  g.fillRect(152, 3, 4, 4, 0xf4f4f0);
  g.fillRect(146, 32, 9, 20, 0xfafaf6);                               // a milk carton
  g.fillPolygon([[146, 32], [150.5, 27], [155, 32]], 0x3a72d0);
  g.fillRect(146, 38, 9, 3, 0x3a72d0);
  g.fillCircle(155, 66, 6, 0xf2c23a, { aa: true });                    // a lemon on the bottom shelf
  g.fillRect(x0, 0, 2, H, 0x6a9a88);                                  // the door's own edge
  g.fillRect(x0 + 2, 0, 1, H, 0x8c9a9a);                              // the gasket
}

// ------------------------------------------------------------ light
const AMB = [   // hour, overlay colour, overlay alpha
  [0, 0x050a20, 0.5], [5.5, 0x050a20, 0.5], [6.6, 0x3a2048, 0.32], [8, 0xfff0d0, 0], [16.5, 0xfff0d0, 0],
  [18.5, 0xff8a3a, 0.12], [19.5, 0x2a1608, 0.24], [22.6, 0x2a1608, 0.28], [23.2, 0x050a20, 0.5], [24, 0x050a20, 0.5],
];
function ambient(hf) {
  let k = 1;
  while (AMB[k][0] < hf) k++;
  const a = AMB[k - 1], b = AMB[k], u = (hf - a[0]) / (b[0] - a[0]);
  return { c: mix(a[1], b[1], u), a: a[2] + (b[2] - a[2]) * u };
}

function windowLight(g, hf, T) {
  const u = (hf - 7) / 12;
  if (u <= 0 || u >= 1) return;
  const strength = Math.min(1, Math.min(u, 1 - u) * 6) * (0.2 + 0.03 * sin(T * 0.37));
  const c = mix(0xffd27a, 0xfffbea, Math.min(1, Math.min(u, 1 - u) * 4));
  const px = 150 - 175 * u, py = 4 + 10 * Math.abs(u - 0.5), sk = (u - 0.5) * 1.1;
  const P = (a, b) => [px + a + b * sk, py + b * 0.95];
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      const a0 = i * 19, b0 = j * 17;
      g.fillPolygon([P(a0, b0), P(a0 + 17, b0), P(a0 + 17, b0 + 15), P(a0, b0 + 15)], c, { a: strength, aa: true });
    }
  // a pot plant on the sill throws swaying leaves into it
  for (let k = 0; k < 5; k++) {
    const sway = sin(T * 0.9 + k * 1.7) * 1.4;
    const [lx, ly] = P(6 + k * 6.5 + sway, 30 - (k % 2) * 6 - Math.abs(k - 2) * 2);
    g.fillEllipse(lx, ly, 3.2, 1.8, SHADOW, { a: strength * 0.9, aa: true });
  }
}

// ------------------------------------------------------------ the door and the minute's small event
const HOUR_DOOR = { hand0: HANDLE0, open0: OPEN0, open1: OPEN1, close0: SLAM0, close1: SLAM1, amp: 17, slam: true };

function doorState(sec, D) {
  let o = 0;
  if (sec >= D.open0 && sec < D.close1) {
    o = sec < D.open1 ? ease.outCubic((sec - D.open0) / (D.open1 - D.open0))
      : sec < D.close0 ? 1 + 0.06 * sin((sec - D.open1) * 2.2)
      : 1 - (D.slam ? ease.inQuad : ease.inOutQuad)((sec - D.close0) / (D.close1 - D.close0));
  }
  let sx = 0, sy = 0;
  const k = sec - D.close1;
  if (D.slam && k >= 0 && k < 0.7) {
    const e = 1 - k / 0.7;
    sx = Math.round(2.4 * e * sin(k * 60));
    sy = Math.round(1.3 * e * sin(k * 47 + 1));
  }
  let hand = null;
  if (sec >= D.hand0 && sec < D.close1 + 0.9) {
    if (sec < D.open0) hand = 1 - ease.outCubic((sec - D.hand0) / (D.open0 - D.hand0));
    else if (sec < D.close1 + 0.15) hand = 0;
    else hand = ease.inCubic((sec - D.close1 - 0.15) / 0.75);
  }
  return { dx: -Math.round(D.amp * o), sx, sy, hand };
}

/** Most minutes something small happens mid-minute: a passer-by's shadow, a child at the letters, the fridge opened for a moment. */
function eventOf(f, amb) {
  const r = hash(f.minuteKey, 99), pick = r % 10, t0 = 13 + ((r >>> 8) % 17);
  const day = amb.a < 0.3, kidHours = f.h >= 7 && f.h < 21;
  let kind = null;
  if (pick < 3) kind = day ? 'pass' : null;
  else if (pick < 6) kind = kidHours ? 'wiggle' : null;
  else if (pick < 8 || (!day && pick < 9)) kind = 'peek';
  if (!kind) return null;
  const ev = { kind, t0 };
  if (kind === 'peek') ev.door = { hand0: t0, open0: t0 + 0.6, open1: t0 + 1.2, close0: t0 + 3.4, close1: t0 + 4.1, amp: 8, slam: false };
  if (kind === 'wiggle') ev.li = (r >>> 16) % HOURS[f.h12].length;
  return ev;
}

function wiggleState(sec, ev) {
  const v = (sec - ev.t0) / 2.4;
  if (v < 0 || v >= 1) return { li: ev.li, rot: 0, hand: null };
  if (v < 0.3) return { li: ev.li, rot: 0, hand: 1 - ease.outCubic(v / 0.3) };
  if (v < 0.7) { const u = (v - 0.3) / 0.4; return { li: ev.li, rot: 0.2 * sin(u * Math.PI * 3) * Math.sin(u * Math.PI), hand: 0 }; }
  return { li: ev.li, rot: 0, hand: ease.inCubic((v - 0.7) / 0.3) };
}

// ------------------------------------------------------------ the face
export default {
  name: 'Fridge',
  blurb: 'Magnetic poetry on a fridge door says the time; a hand swaps the words each minute, and at the hour the door is slammed and a child puts the plastic letters back.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, date = ctx.date;
    const sec = f.sec, hf = f.h + f.m / 60 + sec / 3600, T = f.m * 60 + sec;
    ctx.lcd.backlight(1 - 0.62 * ctx.night);
    const { cur, jobs, hourOut } = script(f, date);
    const amb = ambient(hf);
    const dark = amb.a;

    // this minute's small event, and the door's swing and the slam's shake (whole pixels)
    const ev = hourOut || f.m === 0 ? null : eventOf(f, amb);
    const door = hourOut ? HOUR_DOOR : ev && ev.kind === 'peek' ? ev.door : null;
    const ds = door ? doorState(sec, door) : { dx: 0, sx: 0, sy: 0, hand: null };
    const dx = ds.dx, sx = ds.sx, sy = ds.sy;
    const ox = dx + sx, oy = sy;
    // a door swung away from the window is a little darker
    const swing = -dx / 17;
    const wig = ev && ev.kind === 'wiggle' ? wiggleState(sec, ev) : null;

    drawDoor(g, ox, oy);
    postcard(g, ox, oy);
    kidDrawing(g, ox, oy, Math.floor(date.getTime() / 86400000 + 0.5));
    note(g, ox, oy);

    // magnets that are on the door
    const jobOf = new Map();
    for (const j of jobs) if (j.unit) jobOf.set(j.unit, j);
    const letterJob = new Map();
    for (const j of jobs) if (j.letter) letterJob.set(j.letter.i, j);
    const carried = [];            // drawn above the door, after the light
    const hands = [];

    // tiles
    const byUnit = new Map();
    for (const t of cur.tiles) { if (!byUnit.has(t.unit)) byUnit.set(t.unit, []); byUnit.get(t.unit).push(t); }
    for (const j of jobs) if (j.tiles) byUnit.set(j.unit, j.tiles);
    for (const [u, ts] of byUnit) {
      const j = jobOf.get(u);
      let pose = { on: true, carry: 0, z: 0 };
      if (j) {
        const v = (sec - j.t0) / j.d;
        if (j.kind === 'place') pose = v < 0 ? { on: false, hidden: true } : v >= 1 ? { on: true, carry: 0, z: 0 } : placePose(v);
        else pose = v < 0 ? { on: true, carry: 0, z: 0 } : v >= 1 ? { on: false, hidden: true } : placePose(1 - v);
        if (v >= 0 && v < 1) {
          const x0 = Math.min(...ts.map((t) => t.x)), x1 = Math.max(...ts.map((t) => t.x + t.w));
          const G = [ox + (x0 + x1) / 2, oy + ts[0].y + TILE_H - 2.5];
          const off = [G[0] * 0.45 + 78, 104];
          const tile = { ts, G, off, pose };
          if (pose.hidden) continue;
          if (pose.on && !pose.carry) { for (const t of ts) drawTile(g, t, t.x + ox, t.y + oy, 0, swing * 0.15); }
          else carried.push(tile);
          hands.push({ who: j.who, G, off, pose });
          continue;
        }
      }
      if (pose.hidden || !pose.on) continue;
      for (const t of ts) drawTile(g, t, t.x + ox, t.y + oy, 0, swing * 0.15);
    }

    // letters
    const falling = [];
    for (const l of cur.letters) {
      const j = letterJob.get(l.i);
      if (hourOut && sec >= LET0) {
        const td = LET0 + rand(l.i, cur.word.length, 77) * 0.45;
        if (sec >= td) { falling.push({ l, k: sec - td }); continue; }
      }
      if (j) {
        const v = (sec - j.t0) / j.d;
        if (v < 0) continue;
        if (v < 1) {
          const pose = placePose(v);
          const G = [ox + l.cx, oy + l.cy + 7 * l.k + 1];
          const off = [G[0] * 0.4 - 14, 102];
          if (pose.on) drawLetter(g, l, l.cx + ox, l.cy + oy, l.rot, 0, swing * 0.15);
          else carried.push({ l, G, off, pose });
          hands.push({ who: j.who, G, off, pose });
          continue;
        }
      }
      drawLetter(g, l, l.cx + ox, l.cy + oy, l.rot + (wig && wig.li === l.i ? wig.rot : 0), 0, swing * 0.15);
    }

    handle(g, ox, oy);
    windowLight(g, hf, T);
    if (swing > 0) g.fillRect(0, 0, W, H, SHADOW, { a: 0.16 * swing });
    if (ev && ev.kind === 'pass' && sec >= ev.t0 && sec < ev.t0 + 3.2) {
      // somebody walks between the window and the fridge
      const u = (sec - ev.t0) / 3.2, x = 215 - 290 * u, bob = Math.abs(sin(u * 18)) * 2;
      for (const [grow, a] of [[7, 0.06], [0, 0.1]]) {
        g.fillEllipse(x, 62 - bob, 24 + grow, 46 + grow, SHADOW, { a, aa: true });
        g.fillCircle(x + 3, 6 - bob, 11 + grow / 2, SHADOW, { a, aa: true });
      }
    }

    // things in the air: carried tiles and letters, falling letters
    const lerp2 = (a, b, p) => [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p];
    for (const c of carried) {
      const p = c.pose.carry;
      const pos = lerp2(c.G, c.off, p);
      const ddx = pos[0] - c.G[0], ddy = pos[1] - c.G[1];
      if (c.ts) for (const t of c.ts) drawTile(g, t, t.x + ox + ddx, t.y + oy + ddy, c.pose.z, 0);
      else drawLetter(g, c.l, c.l.cx + ox + ddx, c.l.cy + oy + ddy, c.l.rot * (1 - p) + p * 0.6, c.pose.z, 0);
    }
    for (const { l, k } of falling) {
      const vx = (rand(l.i, 5) - 0.5) * 40, w = (rand(l.i, 6) - 0.5) * 14;
      const x = l.cx + ox + vx * k, y = l.cy + oy - 26 * k + 0.5 * 330 * k * k;
      if (y > H + 16) continue;
      drawLetter(g, l, x, y, l.rot + w * k, 2 + 18 * k, 0, 1);
    }

    // hands
    for (const h of hands) {
      const p = h.pose;
      const at = lerp2(h.G, h.off, p.hand);
      const z = p.handZ ?? p.z;
      const base = h.who === 'kid' ? [at[0] * 0.5 - 18, 128] : [at[0] * 0.35 + 112, 132];
      hand(g, at[0], at[1], base[0], base[1], { who: h.who, z: z + 0.6, pinch: p.pinch ?? 1 });
    }
    // the hand that opens the fridge
    if (ds.hand !== null) {
      const G = [154 + ox, 44 + oy];
      const at = lerp2(G, [180, 110], ds.hand);
      hand(g, at[0], at[1], 196, 128, { who: 'adult', z: 0.8 + 6 * ds.hand, pinch: ds.hand > 0.05 ? 0.3 : 1 });
    }
    // a child fiddles with a letter
    if (wig && wig.hand !== null) {
      const l = cur.letters[wig.li];
      const G = [ox + l.cx + 1, oy + l.cy + 7 * l.k + 1];
      const at = lerp2(G, [G[0] * 0.4 - 14, 102], wig.hand);
      hand(g, at[0], at[1], at[0] * 0.5 - 18, 128, { who: 'kid', z: 0.6 + 6 * wig.hand, pinch: wig.hand > 0.05 ? 0 : 1 });
    }
    // the room
    if (dark > 0.002) g.fillRect(0, 0, W, H, amb.c, { a: dark });
    // the fridge's own light, the brightest thing in the kitchen
    if (dx < 0) {
      interior(g, W + dx);
      const glow = (0.06 + 0.3 * amb.a) * swing;
      g.fillRect(Math.max(0, W + dx - 46), 0, 46 + dx, H, 0xdff4ff, { a: glow * 0.5, dither: true });
      g.fillRect(Math.max(0, W + dx - 20), 0, 20 + dx, H, 0xdff4ff, { a: glow * 0.5, dither: true });
    }
  },
};
