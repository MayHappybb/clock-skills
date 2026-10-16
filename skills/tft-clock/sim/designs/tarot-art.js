// tarot: the twelve hour cards (Major Arcana I..XII, in the Marseille order:
// VIII is Justice, XI is Strength) and the Fool, who stands for zero.
//
// Each picture is a live woodcut in a 32 x 38 box: the Magician juggles,
// the Papesse turns a page, the Hermit's lantern swings, the Wheel of
// Fortune turns once a minute with the seconds, the Hanged Man sways.
// Every shape goes through the inked pen (tarot-ink.js): flat stencil
// colour, black line round it, hard pixels.

import { sin, cos, clamp, TAU } from '../js/kit.js';
import { INK, PAPER, RED, BLUE, SKY, YEL, FLESH, GREEN, WHITE, ORANGE, rot } from './tarot-ink.js';

const PI = Math.PI;
const frac = (x) => x - Math.floor(x);

/** The Marseille ground: a yellow rise with green tufts. */
function ground(p, v = 33) {
  p.poly([[-1, v + 1], [6, v - 1], [14, v], [22, v - 1], [33, v + 1], [33, 39], [-1, 39]], YEL);
  p.line(4, v + 3, 5, v + 1, GREEN); p.line(5, v + 3, 7, v + 1, GREEN);
  p.line(26, v + 3, 27, v + 1, GREEN); p.line(27, v + 3, 29, v + 1, GREEN);
}

// I. The Magician: a street juggler behind his table, three balls in a cascade.
function magician(p, t) {
  ground(p, 33);
  p.cap(14, 25, 13, 36, 2.5, RED); p.cap(18, 25, 19, 36, 2.5, SKY);
  p.poly([[11, 13], [21, 13], [22, 24], [10, 24]], BLUE);
  p.box(16, 14, 5, 9, RED);
  p.line(16, 13, 16, 24);
  // hands rise as they throw: the cascade, 1.6 s a cycle, balls a third apart
  const P = 1.6, hl = 18 + 1.2 * sin((t / P) * TAU * 1.5), hr = 18 + 1.2 * sin((t / P) * TAU * 1.5 + PI);
  p.cap(11, 14, 8, hl, 2, BLUE); p.cap(21, 14, 24, hr, 2, RED);
  p.disc(8, hl, 1.4, FLESH); p.disc(24, hr, 1.4, FLESH);
  // the table
  p.rect(1, 23, 30, 3, ORANGE);
  p.rect(3, 26, 2, 10, ORANGE); p.rect(27, 26, 2, 10, ORANGE);
  p.rect(4, 20, 3, 3, SKY); p.rect(25, 21, 2, 2, PAPER); p.rect(21, 21, 2, 2, RED);
  // the head and the big hat
  p.disc(16, 10, 2.7, FLESH);
  p.poly([[7, 7], [25, 7], [22, 4], [10, 4]], YEL);
  p.poly([[12, 4.5], [20, 4.5], [18, 1], [14, 1]], RED);
  const balls = [RED, SKY, YEL];
  for (let i = 0; i < 3; i++) {
    const ph = frac(t / P + i / 3);
    const s = ph < 0.5 ? ph * 2 : (ph - 0.5) * 2;
    const [x0, y0, x1, y1] = ph < 0.5 ? [8, hl - 1, 24, hr - 1] : [24, hr - 1, 8, hl - 1];
    const x = x0 + (x1 - x0) * s, y = y0 + (y1 - y0) * s - 15 * 4 * s * (1 - s);
    p.disc(x, y, 1.2, balls[i]);
  }
}

// II. The Papesse: seated under a veil with her tiara and an open book; she turns a page.
function papesse(p, t) {
  p.poly([[-1, -1], [33, -1], [33, 17], [28, 10], [23, 6], [9, 6], [4, 10], [-1, 17]], SKY);
  p.line(4, 0, 6, 8); p.line(27, 0, 26, 8);
  p.poly([[9, 14], [23, 14], [30, 39], [2, 39]], BLUE);
  p.poly([[13, 14], [19, 14], [21, 39], [11, 39]], RED);
  p.poly([[11, 9], [21, 9], [22, 16], [10, 16]], PAPER);
  p.disc(16, 11, 2.6, FLESH);
  p.poly([[12.5, 8.5], [19.5, 8.5], [18, 1], [14, 1]], YEL);
  p.line(13, 6, 19, 6); p.line(13.5, 3.5, 18.5, 3.5);
  // the book
  p.rect(9, 23, 14, 7, PAPER);
  p.line(16, 23, 16, 30);
  for (const y of [25, 27]) { p.line(10.5, y, 14.5, y, SKY); p.line(17.5, y, 21.5, y, SKY); }
  const ph = frac(t / 7), u = clamp((ph - 0.8) / 0.12, 0, 1);
  if (u > 0 && u < 1) {                    // a page lifts off the right half and lies down on the left
    const x = 16 + 7 * cos(u * PI), lift = 2.5 * sin(u * PI);
    p.poly([[16, 23], [x, 23 - lift], [x, 30 - lift], [16, 30]], WHITE);
  }
  p.disc(9, 27, 1.4, FLESH); p.disc(23, 27, 1.4, FLESH);
}

// III. The Empress: crowned on a winged throne, eagle shield and sceptre; the wings breathe.
function empress(p, t) {
  const a = 2.2 * sin(t * 1.4);
  p.poly([[10, 16], [1, 3 - a], [0, 15 - a * 0.5], [3, 23], [10, 22]], SKY);
  p.poly([[22, 16], [31, 3 - a], [32, 15 - a * 0.5], [29, 23], [22, 22]], SKY);
  p.line(3, 8 - a * 0.8, 9, 17); p.line(29, 8 - a * 0.8, 23, 17);
  p.poly([[11, 15], [21, 15], [27, 39], [5, 39]], RED);
  p.poly([[11, 15], [15, 15], [11, 39], [5, 39]], BLUE);
  p.poly([[17, 15], [21, 15], [27, 39], [22, 39]], BLUE);
  p.disc(16, 11, 2.7, FLESH);
  p.box(12, 9, 2, 5, YEL); p.box(18.5, 9, 2, 5, YEL);
  p.poly([[12, 8], [20, 8], [20, 3.5], [18.5, 5.5], [16, 2.5], [13.5, 5.5], [12, 3.5]], YEL);
  p.poly([[2, 21], [11, 21], [11, 28], [6.5, 33], [2, 28]], YEL);
  p.line(4, 24, 9, 24); p.line(6.5, 22.5, 6.5, 30); p.line(4.5, 27, 6.5, 25); p.line(8.5, 27, 6.5, 25);
  p.cap(24, 30, 25.5, 9, 1.4, YEL);
  p.disc(25.6, 7.5, 2, YEL);
  p.disc(24.4, 20, 1.5, FLESH);
}

// IV. The Emperor: in profile on his throne, legs crossed, sky-blue beard, eagle shield at his feet.
function emperor(p, t) {
  ground(p, 34);
  p.rect(21, 9, 8, 26, SKY);
  p.poly([[14, 12], [22, 12], [25, 32], [16, 32]], RED);
  p.poly([[11, 12], [19, 12], [19, 25], [11, 25]], BLUE);
  p.cap(14, 25, 13, 35, 2.4, RED);
  p.cap(12, 25, 6, 26, 3, RED); p.cap(6, 26, 8, 35, 2.4, SKY);
  const s = 1.2 * sin(t * 0.9);
  p.cap(6, 23, 6, 7 + s, 1.4, YEL); p.disc(6, 5.5 + s, 1.8, YEL); p.line(6, 2.2 + s, 6, 3.7 + s);
  p.cap(13, 14, 7, 18, 2.4, BLUE); p.disc(6.5, 18, 1.5, FLESH);
  p.disc(14, 8, 2.7, FLESH);
  p.poly([[10.5, 8.5], [14, 10], [13.5, 14], [10, 12.5]], SKY);
  p.poly([[11, 6.5], [17, 6.5], [17, 2], [15.5, 4], [14, 1], [12.5, 4], [11, 2]], YEL);
  // the shield, its eagle beating its wings
  p.ell(22, 30, 5, 4.2, YEL);
  const w = sin(t * 3) > 0 ? -1.5 : 0.5;
  p.line(22, 28, 22, 33); p.line(22, 29.5, 19, 28.5 + w); p.line(22, 29.5, 25, 28.5 + w);
}

// V. The Pope: triple crown, papal cross, two tonsured acolytes; his hand signs a blessing.
function pope(p, t) {
  p.rect(0, 3, 4, 35, SKY); p.rect(28, 3, 4, 35, SKY);
  p.cap(6, 6, 6, 31, 1.4, YEL);
  p.line(4, 7, 8, 7); p.line(4.5, 9, 7.5, 9); p.line(5, 11, 7, 11);
  p.poly([[10, 14], [22, 14], [27, 34], [5, 34]], BLUE);
  p.poly([[10, 14], [22, 14], [25, 25], [7, 25]], RED);
  p.disc(16, 10.5, 2.7, FLESH);
  p.fill([[13.5, 11.5], [18.5, 11.5], [17.5, 15], [14.5, 15]], WHITE);
  p.poly([[12.8, 9], [19.2, 9], [18, 1], [14, 1]], YEL);
  p.line(13.2, 6.5, 18.8, 6.5); p.line(13.8, 4, 18.2, 4);
  // the blessing: down, then across, a cross every 6 s
  const ph = frac(t / 6);
  let hx = 22, hy = 12;
  if (ph < 0.2) hy = 12 + 6 * (ph / 0.2);
  else if (ph < 0.3) { const u = (ph - 0.2) / 0.1; hx = 22 - 3 * u; hy = 18 - 3 * u; }
  else if (ph < 0.5) { hx = 19 + 6 * (ph - 0.3) / 0.2; hy = 15; }
  else if (ph < 0.65) { const u = (ph - 0.5) / 0.15; hx = 25 - 3 * u; hy = 15 - 3 * u; }
  p.cap(20, 15, hx, hy, 2, RED);
  p.disc(hx, hy - 0.5, 1.5, WHITE);
  for (const [x, c] of [[9, RED], [23, BLUE]]) {
    p.poly([[x - 6, 39], [x - 5, 34], [x + 5, 34], [x + 6, 39]], c);
    p.disc(x, 32, 3.6, YEL);
    p.dot(x, 31.6, 1.8, FLESH);
  }
}

// VI. The Lovers: a man between two women; Cupid in the sun draws and looses.
function lovers(p, t) {
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU + t * 0.4;
    p.bar(16 + 5.5 * sin(a), 5 + 5.5 * cos(a), 16 + 8 * sin(a), 5 + 8 * cos(a), 1.2, k % 2 ? RED : YEL);
  }
  p.disc(16, 5, 4.6, YEL);
  p.poly([[13, 4], [10, 1], [11, 6]], SKY); p.poly([[19, 4], [22, 1], [21, 6]], SKY);
  p.disc(16, 4.5, 1.6, FLESH);
  const ph = frac(t / 5), draw = ph < 0.6 ? ph / 0.6 : 0;
  p.line(12, 6, 13, 10); p.line(13, 10, 14, 6);
  // the arrow: drawn back, then loosed down at the man's head
  if (ph < 0.6) p.line(13 - draw, 8, 16 - draw, 9, INK);
  else if (ph < 0.75) { const u = (ph - 0.6) / 0.15; p.line(13 + 2 * u, 8 + 7 * u, 15 + 2 * u, 10 + 7 * u, RED); }
  const tilt = 0.6 * sin(t * 0.5);
  p.poly([[2, 21], [10, 21], [12, 39], [0, 39]], RED);
  p.poly([[13, 21], [19, 21], [21, 39], [11, 39]], YEL);
  p.box(15, 22, 2, 16, RED);
  p.poly([[22, 21], [30, 21], [32, 39], [20, 39]], BLUE);
  p.disc(6.5, 17.5, 2.5, FLESH); p.box(4, 14, 5, 2, YEL);
  p.disc(16 + tilt, 17.5, 2.5, FLESH); p.box(13.5 + tilt, 14.5, 5, 1.5, ORANGE);
  p.disc(25.5, 17.5, 2.5, FLESH); p.poly([[22.5, 16], [26, 13], [28.5, 16]], GREEN);
  p.cap(9, 23, 13.5, 22.5, 1.4, FLESH);
  p.cap(23, 23, 18.5, 25, 1.4, FLESH);
}

// VII. The Chariot: crowned rider under a canopy, two horses trotting.
function chariot(p, t) {
  ground(p, 34);
  p.cap(5, 3, 5, 16, 1.2, YEL); p.cap(27, 3, 27, 16, 1.2, YEL);
  p.rect(3, 1, 26, 3, RED);
  for (let x = 4; x < 29; x += 3) p.px(x, 4.5, YEL);
  p.poly([[12, 11], [20, 11], [20.5, 17], [11.5, 17]], SKY);
  p.disc(11.5, 12, 1.4, YEL); p.disc(20.5, 12, 1.4, YEL);
  p.disc(16, 8, 2.5, FLESH);
  p.poly([[13.5, 6], [18.5, 6], [18.5, 3.5], [16, 5], [13.5, 3.5]], YEL);
  p.cap(21, 16, 23, 7, 1.2, YEL);
  p.rect(7, 16, 18, 10, RED);
  p.rect(13, 18, 6, 5, YEL);
  p.rect(4, 18, 2, 9, YEL); p.rect(26, 18, 2, 9, YEL);
  // the horses trot: each leg lifts in turn
  for (const [x0, dir, c] of [[3, -1, BLUE], [29, 1, RED]]) {
    const bob = 0.6 * sin(t * 7 + (dir > 0 ? PI : 0));
    for (let k = 0; k < 3; k++) {
      const lx = x0 - dir * (2 + 3.5 * k), lift = Math.max(0, sin(t * 7 + k * 2.1 + (dir > 0 ? PI : 0))) * 2;
      p.cap(lx, 31, lx + dir * lift * 0.5, 36 - lift, 1.6, c);
    }
    p.ell(x0 - dir * 5.5, 29.5 + bob, 7, 3, c);
    p.disc(x0 + dir * 0.5, 26 + bob, 2.4, c);
    p.px(x0 + dir * 1, 25.5 + bob, WHITE);
  }
}

// VIII. Justice: seated between pillars, sword upright; her scales seek their balance.
function justice(p, t) {
  p.rect(0, 2, 3, 36, YEL); p.rect(29, 2, 3, 36, YEL);
  p.rect(7, 5, 18, 22, RED);
  p.poly([[10, 15], [22, 15], [27, 39], [5, 39]], RED);
  p.poly([[10, 15], [14, 15], [10, 39], [5, 39]], BLUE);
  p.poly([[18, 15], [22, 15], [27, 39], [22, 39]], BLUE);
  p.disc(16, 11, 2.7, FLESH);
  p.box(13, 9, 1.5, 5, YEL); p.box(18.5, 9, 1.5, 5, YEL);
  p.poly([[12.5, 8.5], [19.5, 8.5], [19, 4], [13, 4]], YEL);
  p.disc(16, 3, 1.5, YEL);
  p.cap(8.5, 23, 8.5, 2, 1.6, SKY);
  p.cap(5, 21.5, 12, 21.5, 1, YEL);
  p.cap(8.5, 23, 8.5, 27, 1.4, RED);
  p.disc(8.5, 25, 1.4, FLESH);
  // the scales: a slow damped hunt for level
  const a = 0.28 * sin(t * 0.9) * (0.6 + 0.4 * sin(t * 0.23));
  const cx = 24, cy = 14, dx = 5.5 * cos(a), dy = 5.5 * sin(a);
  p.cap(cx, cy, cx, 22, 1, YEL);
  p.cap(cx - dx, cy - dy, cx + dx, cy + dy, 1, YEL);
  for (const [x, y] of [[cx - dx, cy - dy], [cx + dx, cy + dy]]) {
    p.line(x, y, x - 2, y + 5); p.line(x, y, x + 2, y + 5);
    p.poly([[x - 3, y + 5], [x + 3, y + 5], [x + 2, y + 7], [x - 2, y + 7]], YEL);
  }
  p.disc(24, 21, 1.4, FLESH);
}

// IX. The Hermit: hooded, leaning on his staff, holding up a lantern that swings and glows.
function hermit(p, t) {
  ground(p, 34);
  const step = 0.5 * sin(t * 1.2);
  p.poly([[13, 5], [20, 3.5], [25, 10], [28, 37], [11, 37], [11.5, 14]], BLUE);
  p.poly([[11.5, 14], [14.5, 13], [14, 37], [11, 37]], RED);
  p.poly([[11.5, 10], [13, 3.5], [20, 3], [23, 9], [17, 7]], BLUE);
  p.disc(14, 9.5 + step * 0.3, 2.2, FLESH);
  p.poly([[11.5, 10.5], [15, 11], [14.5, 18], [12, 16.5]], WHITE);
  p.cap(21, 13, 22 + step, 37, 1.6, YEL);
  p.disc(21, 16, 1.5, FLESH);
  // the lantern hangs from his raised hand and swings
  const hx = 7, hy = 11.5, a = 0.35 * sin(t * 1.8);
  p.cap(13, 13, hx, hy, 2, BLUE);
  const lx = hx + 4.5 * sin(a), ly = hy + 4.5 * cos(a);
  p.glow(lx, ly, 6.5 + 0.8 * sin(t * 9) + 0.5 * sin(t * 13.7), 0xfff0a0, 0.33);
  p.line(hx, hy, lx, ly);
  p.with(rot(lx, ly, -a)).rect(lx - 2, ly - 1, 4, 5, YEL);
  p.with(rot(lx, ly, -a)).box(lx - 1, ly + 0.5, 2, 2.5, WHITE);
  p.disc(hx, hy, 1.4, FLESH);
}

// X. The Wheel of Fortune: it turns once a minute, with the seconds; its beasts ride it round.
function wheel(p, t, sec) {
  p.poly([[1, 35], [31, 35], [28, 39], [4, 39]], GREEN);
  p.cap(10, 20, 5, 35, 2, YEL); p.cap(22, 20, 27, 35, 2, YEL);
  const cx = 16, cy = 20, th = (sec / 60) * TAU;
  p.disc(cx, cy, 11.2, YEL);
  p.dot(cx, cy, 9.3, INK); p.dot(cx, cy, 8.3, PAPER);
  for (let k = 0; k < 8; k++) {
    const a = th + (k / 8) * TAU;
    p.bar(cx, cy, cx + 8.6 * sin(a), cy - 8.6 * cos(a), k === 0 ? 2 : 1.2, k === 0 ? RED : INK);
  }
  p.disc(cx, cy, 2, RED);
  p.cap(cx, cy, 30.5, cy + 2, 1, YEL); p.cap(30.5, cy + 2, 30.5, cy + 6, 1.6, YEL);
  // the two beasts cling to the rim
  for (const [off, c] of [[PI * 0.55, YEL], [PI * 1.45, SKY]]) {
    const a = th + off, x = cx + 13 * sin(a), y = cy - 13 * cos(a);
    p.ell(x, y, 2.2, 1.6, c); p.disc(x + 1.8 * sin(a + 1.2), y - 1.8 * cos(a + 1.2), 1.3, c);
  }
  // the crowned sphinx above
  p.rect(10, 5, 12, 2, RED);
  p.ell(17, 3, 3.5, 1.4, BLUE);
  p.disc(13.5, 2.2, 1.4, FLESH);
  p.poly([[17, 2], [21, -1], [20, 3]], SKY);
}

// XI. Strength: in her lemniscate hat she opens the lion's jaws; its tail lashes.
function strength(p, t) {
  ground(p, 35);
  p.poly([[11, 11], [19, 11], [25, 37], [11, 37]], BLUE);
  p.poly([[15, 11], [19, 11], [30, 37], [19, 37]], RED);
  const tail = 2.5 * sin(t * 2.1);
  p.cap(20, 30, 25 + tail, 24, 1.2, YEL); p.disc(25 + tail, 23, 1.5, ORANGE);
  p.ell(12, 31, 9, 4.6, YEL);
  p.cap(6, 33, 5, 37.5, 2, YEL); p.cap(17, 33, 18, 37.5, 2, YEL);
  // the lion's head and the jaw she holds open
  const o = 0.5 + 0.5 * sin(t * 1.1), jaw = 1 + 3 * o;
  p.disc(7, 25, 5.4, ORANGE);
  p.poly([[1, 25.5], [7, 25.5], [7, 25.5 + jaw], [2, 25 + jaw * 0.8]], RED);
  p.poly([[1.5, 25.5 + jaw], [7, 25.5 + jaw], [7, 27.5 + jaw], [2.5, 27 + jaw]], YEL);
  p.poly([[0.5, 25.5], [8, 21], [9, 25.5]], YEL);
  p.px(5, 23, INK);
  p.cap(13, 14, 6, 21.5, 1.8, FLESH);
  p.cap(15, 15, 5, 27 + jaw, 1.8, FLESH);
  p.disc(15, 8.5, 2.6, FLESH);
  p.poly([[5, 6.5], [25, 6.5], [27, 4], [21, 2], [16, 4.5], [11, 2], [3, 4]], YEL);
}

// XII. The Hanged Man: hung by one foot from the gallows between two trees, swaying.
function hanged(p, t) {
  p.poly([[-1, 39], [-1, 34], [8, 32], [16, 34], [24, 32], [33, 34], [33, 39]], GREEN);
  p.rect(1, 2, 4, 36, GREEN); p.rect(27, 2, 4, 36, GREEN);
  for (const y of [9, 17, 25]) { p.box(1, y, 1, 2, RED); p.box(30, y + 4, 1, 2, RED); }
  p.rect(1, 2, 30, 3, YEL);
  const q = p.with(rot(16, 5, 0.13 * sin(t * 1.3)));
  q.line(16, 5, 16, 7);
  q.cap(16, 12.5, 20, 12, 2.4, BLUE); q.cap(20, 12, 17, 17, 2.4, BLUE);
  q.cap(16, 7.5, 16, 17, 2.4, RED);
  q.poly([[12.5, 17], [19.5, 17], [20, 28], [12, 28]], BLUE);
  q.box(13, 19.5, 6, 1, RED); q.px(16, 23, YEL); q.px(16, 25, YEL);
  q.cap(12.5, 26, 13, 20, 1.4, RED); q.cap(19.5, 26, 19, 20, 1.4, RED);
  q.poly([[13.5, 31], [18.5, 31], [18, 36.5], [14, 36.5]], YEL);
  q.disc(16, 30.5, 2.7, FLESH);
}

// O. The Fool: off on his road with his bundle; a dog jumps at his leg.
export function FOOL_ART(p, t) {
  ground(p, 34);
  const w = sin(t * 3.2);
  p.cap(14, 24, 13 - 3 * w, 35.5, 2.4, SKY);
  p.cap(17, 24, 18 + 3 * w, 35.5, 2.4, RED);
  p.cap(14, 14, 3, 6, 1.2, YEL);
  p.disc(3.5, 8 + 0.4 * w, 3, PAPER);
  p.poly([[11, 13], [19, 13], [21, 25], [10, 25]], RED);
  p.poly([[15, 13], [19, 13], [21, 25], [15.5, 25]], YEL);
  p.cap(18, 15, 21, 18, 1.8, SKY);
  p.cap(23.5, 9, 26, 37, 1.3, YEL);
  p.disc(21.5, 18, 1.4, FLESH);
  p.disc(16, 9, 2.6, FLESH);
  p.poly([[12.5, 7.5], [19.5, 7.5], [23, 4], [17.5, 5.5], [15, 1.5], [13, 4.5]], RED);
  p.disc(23, 4, 1, YEL); p.disc(15, 1.5, 1, YEL);
  // the dog: a jump every 2.2 s
  const ph = frac(t / 2.2), j = ph < 0.4 ? 4 * sin((ph / 0.4) * PI) : 0;
  p.ell(6, 31.5 - j, 3.5, 1.8, WHITE);
  p.disc(9.5, 29.5 - j * 1.2, 1.6, WHITE);
  p.line(3, 30.5 - j, 1.5, 28.5 - j);
  p.line(4.5, 33 - j, 4, 35 - j); p.line(7.5, 33 - j, 8.5, 35 - j);
}

export const ART = [FOOL_ART, magician, papesse, empress, emperor, pope, lovers, chariot, justice, hermit, wheel, strength, hanged];
