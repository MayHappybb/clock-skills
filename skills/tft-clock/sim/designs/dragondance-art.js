// The woodblock for "dragondance": inks, the paper, and the small cut
// pictures (dragon heads, dancers, the pearl, the drum, cloud scrolls, the
// lion, firecrackers). Every picture is cut as a nianhua block would be: a
// black key line round flat areas of the five inks, no shading.
//
// Inks (a Yangjiabu / Taohuawu nianhua's set): soot black, vermilion,
// emerald, gold yellow, peach pink, on warm paper; plus the paper itself as
// the white. Night is the same block printed on dark red paper (the
// lantern-lit door print), so the inks stay and only the ground changes.

import { sprite, Gfx, hash, noise2, to565 } from '../js/kit.js';

export const W = 160, H = 80;

export const INK = 0x1c1410, VERM = 0xe2381d, EMER = 0x139160, GOLD = 0xf5b623, PINK = 0xf27fa0;
export const SKIN = 0xf7cfa2, WHITE = 0xfbf4e3;
// the paper by day, its grain, the cloud tints; and the same for the night paper
export const DAY = { paper: 0xf1e2c2, grain: 0xe6d2ab, cloud: 0xf3cdbf, cloud2: 0xcfe2c4, cline: 0xc39a80, floor: 0xd9c296 };
export const NIGHT = { paper: 0x3a1418, grain: 0x30101a, cloud: 0x5a2228, cloud2: 0x203a32, cline: 0x7a3a34, floor: 0x4a1c1e };

/** The paper with its woodgrain, as an RGB565 frame (built once at load: 25.6 KB in RAM, or flash). */
function paperOf(P) {
  const out = new Uint16Array(W * H);
  const a = to565(P.paper), b = to565(P.grain), f = to565(P.floor);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      // long horizontal grain streaks of the pear-wood block, a little wavy
      const n = noise2(x / 14, y / 1.3 + 0.6 * Math.sin(x / 19), 7);
      let c = n > 0.8 ? b : a;
      if (y >= 77) c = y === 77 ? to565(P.cline) : f;
      out[y * W + x] = c;
    }
  return out;
}
export const PAPER_DAY = paperOf(DAY), PAPER_NIGHT = paperOf(NIGHT);

// ------------------------------------------------------------ dragon heads
// Facing right; the neck point (where the body's last sample sits) is NECK.
const HEAD_PIC = `
  ..yy..........
  ...yy..yy.....
  ....yyyy......
  ..kkkkkkkkk...
  .kwwkbbbbbkk..
  .kwkkbbbbbbbk.
  mkbbbbbbbbbbbk
  mkbbbbkkkkkkk.
  mmkbbkpwpwppk.
  .mkbbbkkkkkbbk
  ..mkbbbbbbbbk.
  ...kbbbbkkkk..`;
// the jaw shut: the snap on the beat
const HEAD_SHUT = `
  ..yy..........
  ...yy..yy.....
  ....yyyy......
  ..kkkkkkkkk...
  .kwwkbbbbbkk..
  .kwkkbbbbbbbk.
  mkbbbbbbbbbbbk
  mkbbbbkwkwkkk.
  mmkbbbkkkkkbbk
  .mkbbbbbbbbbk.
  ..mkbbbbkkkk..
  ...kbbbbk.....`;
export const NECK = [5, 11];
export const HEAD_W = 14;

export function headSprite(body, mane) {
  const pal = { y: GOLD, k: INK, w: WHITE, b: body, m: mane, p: PINK };
  return [sprite(HEAD_PIC, pal), sprite(HEAD_SHUT, pal)];
}

// ------------------------------------------------------------ dancers
// Seen from the front, both hands up on the pole; two steps.
const DANCER_A = `
  ..f.f..
  .t...t.
  .t.h.t.
  .thhht.
  ..hfh..
  ..ttt..
  .ttttt.
  ..sss..
  ..lll..
  ..l.l..
  ..l.l..
  .kk.kk.`;
const DANCER_B = `
  ..f.f..
  .t...t.
  .t.h.t.
  .thhht.
  ..hfh..
  ..ttt..
  .ttttt.
  ..sss..
  ..lll..
  .ll.l..
  .k..l..
  ....kk.`;
export function dancerSprites(tunic, sash) {
  const pal = { f: SKIN, t: tunic, h: INK, s: sash, l: INK, k: INK };
  return [sprite(DANCER_A, pal), sprite(DANCER_B, pal)];
}

// ------------------------------------------------------------ the pearl and the drum
export function pearl(g, cx, cy, T, P) {
  // flames streaming up behind it: three tongues that boil (a new cut every 1/8 s)
  const fr = Math.floor(T * 8);
  for (let k = 0; k < 3; k++) {
    const h = hash(fr, k, 11) % 3, dx = (k - 1) * 3.2;
    const tip = [cx + dx * 1.3 + (h - 1), cy - 9 - h - (k === 1 ? 2 : 0)];
    g.fillPolygon([[cx + dx - 2.6, cy - 1], tip, [cx + dx + 2.6, cy - 1]], INK);
    g.fillPolygon([[cx + dx - 1.4, cy - 1.5], [tip[0], tip[1] + 2.2], [cx + dx + 1.4, cy - 1.5]], k === 1 ? GOLD : VERM);
  }
  g.fillCircle(cx, cy, 5.2, INK);
  g.fillCircle(cx, cy, 4.0, WHITE);
  // the pearl's spiral, turning
  const a = T * 3;
  g.arc(cx, cy, 1.4, 3.0, a, a + 2.4, PINK);
  g.fillCircle(cx + 1.6 * Math.sin(a + 3.6), cy - 1.6 * Math.cos(a + 3.6), 1.1, PINK);
}

/** The big drum on its stand, side on. `hit` 0..1 just after a beat. */
export function drum(g, cx, by, hit) {
  const w = 18, h = 11, x = Math.round(cx - w / 2), y = Math.round(by - h - 4);
  // stand
  g.fillRect(x + 2, y + h, 2, 5, INK); g.fillRect(x + w - 4, y + h, 2, 5, INK);
  g.fillRect(x + 1, y + h + 2, w - 2, 1, INK);
  // barrel: ink, vermilion, gold rims with studs
  g.fillRoundRect(x, y, w, h, 3, INK);
  g.fillRoundRect(x + 1, y + 1, w - 2, h - 2, 2, VERM);
  g.fillRect(x + 1, y + 2, w - 2, 1, GOLD); g.fillRect(x + 1, y + h - 3, w - 2, 1, GOLD);
  for (let k = 0; k < 4; k++) { g.pixel(x + 3 + k * 4, y + 2, INK); g.pixel(x + 3 + k * 4, y + h - 3, INK); }
  // the skin is on top: an ellipse seen nearly edge on, and the beater
  g.fillEllipse(cx, y + 0.5, w / 2 - 0.5, 1.6, INK);
  g.fillEllipse(cx, y + 0.5, w / 2 - 2, 0.8, hit > 0.5 ? WHITE : SKIN);
  const lift = 6 * (1 - hit) * (1 - hit);
  const sx = cx + 5, sy = y - 1 - lift;
  g.thickLine(sx, sy, sx + 7, sy - 4 - lift * 0.3, 1.5, INK);
  g.fillCircle(sx, sy, 1.6, VERM);
  if (hit > 0.6) {   // the hit: cut marks springing off the skin
    for (const [dx, dy] of [[-4, -3], [0, -4], [4, -3]]) g.thickLine(cx + dx * 0.9, y - 2, cx + dx * 1.6, y - 2 + dy * 0.8, 1, INK);
  }
}

// ------------------------------------------------------------ cloud scrolls
/** One auspicious cloud (xiangyun), cut once onto its own small canvas: a curl, a lobe and a tail. */
function cloud(P, flip) {
  const c = new Gfx(34, 13);
  c.clear(0xff00ff);
  const lobes = [[9, 7, 4.6], [16, 5.5, 5.2], [23, 7.5, 4.0]];
  for (const [x, y, r] of lobes) c.fillCircle(x, y, r + 1, P.cline);
  c.fillRect(4, 9, 27, 3, P.cline);
  for (const [x, y, r] of lobes) c.fillCircle(x, y, r, P.cloud);
  c.fillRect(5, 9, 25, 2, P.cloud);
  // the curls: a spiral cut in each lobe
  for (const [x, y, r] of lobes) { c.arc(x, y, r - 2.6, r - 1.6, -2.2, 2.0, P.cline); c.fillCircle(x + 0.3, y - 0.3, 0.9, P.cline); }
  if (flip) {
    const d = c.buf.slice();
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) c.buf[y * c.width + x] = d[y * c.width + c.width - 1 - x];
  }
  return c;
}
export const CLOUDS_DAY = [cloud(DAY, false), cloud(DAY, true)];
export const CLOUDS_NIGHT = [cloud(NIGHT, false), cloud(NIGHT, true)];
export const CLOUD_KEY = 0xff00ff;

// ------------------------------------------------------------ the lion (the hour)
// A southern lion's face, seen from the front: the mirror on its brow, big
// lidded eyes, a pink nose, the open mouth with its teeth, a white beard.
const LION_PIC = `
  ......yyyyyyy......
  ....yyrrrrrrryy....
  ...yrrrrkkkrrrry...
  ..yrrrrkwgwkrrrry..
  .yrrkkkrkkkrkkkrry.
  .yrkwwwkrrrkwwwkry.
  yrrkwkwkrrrkwkwkrry
  yrrrkkkrrrrrkkkrrry
  yrgrrrrrpppprrrrgry
  ywwrrrrppppprrrrwwy
  .ywwkkkkkkkkkkkwwy.
  ..ywpwpwpwpwpwpwy..
  ...yykkkkkkkkkyy...
  ....wwwwwwwwwww....
  .....w.w.w.w.w.....`;
// eyes shut (the blink while it shakes its head on the drum)
const LION_BLINK = LION_PIC.split('\n').map((r, i) => (i === 5 || i === 6 ? r.replace(/w/g, 'k') : r)).join('\n');
const LPAL = { y: GOLD, r: VERM, k: INK, w: WHITE, g: EMER, p: PINK };
export const LION = [sprite(LION_PIC, LPAL), sprite(LION_BLINK, LPAL)];

/**
 * The lion's body behind its head, going left from x (the head's left edge):
 * a cloth of vermilion with gold fur bands and a fringe, on two dancers'
 * legs. `ph` 0..1 the step.
 */
export function lionBody(g, x, y, ph) {
  const bx = Math.round(x - 20), by = Math.round(y + 3);
  g.fillRoundRect(bx, by, 22, 10, 4, INK);
  g.fillRoundRect(bx + 1, by + 1, 20, 8, 3, VERM);
  for (let k = 0; k < 4; k++) g.fillRect(bx + 3 + k * 5, by + 1, 2, 8, GOLD);
  for (let k = 0; k < 10; k++) g.fillRect(bx + 1 + k * 2, by + 9, 1, 2, k & 1 ? WHITE : GOLD);   // the fringe
  // legs: the back dancer's two and the front dancer's two, stepping in turn
  const lift = [ph < 0.5 ? 2 : 0, ph < 0.5 ? 0 : 2];
  for (let k = 0; k < 4; k++) {
    const lx = bx + 2 + k * 5, up = lift[k & 1];
    g.fillRect(lx, by + 10, 2, 5 - up, k < 2 ? GOLD : PINK);
    g.fillRect(lx - 1, by + 15 - up, 3, 1, INK);
  }
  // the tail tuft
  g.fillRect(bx - 2, by + 1, 3, 3, INK); g.fillRect(bx - 1, by + 2, 2, 1, GOLD);
}

// ------------------------------------------------------------ firecrackers (the hour)
/** A pop: a star cut in gold and paper white, r 1..3. */
export function popStar(g, x, y, r) {
  x = Math.round(x); y = Math.round(y);
  g.fillRect(x - r, y, 2 * r + 1, 1, GOLD); g.fillRect(x, y - r, 1, 2 * r + 1, GOLD);
  if (r > 1) { g.pixel(x - 1, y - 1, WHITE); g.pixel(x + 1, y - 1, WHITE); g.pixel(x - 1, y + 1, WHITE); g.pixel(x + 1, y + 1, WHITE); g.pixel(x, y, WHITE); }
}
/** One cracker lying on the floor before it goes off. */
export function cracker(g, x, y) {
  x = Math.round(x);
  g.fillRect(x, y, 4, 2, VERM); g.pixel(x + 4, y, GOLD); g.pixel(x - 1, y + 1, INK);
}

/** The lion reared up on the drum: its cloth hangs straight down behind its face, its front dancer's legs on the drum. */
export function lionUp(g, cx, y, ph) {
  const x = Math.round(cx - 7), top = Math.round(y + 10), bot = 61;
  if (bot > top) {
    g.fillRect(x, top, 14, bot - top, INK);
    g.fillRect(x + 1, top, 12, bot - top - 1, VERM);
    for (let k = 0; k < 3; k++) g.fillRect(x + 2 + k * 4, top, 2, bot - top - 1, GOLD);
  }
  const up = ph < 0.5 ? 1 : 0;
  g.fillRect(x + 3, bot - up, 2, 2, PINK); g.fillRect(x + 9, bot - 1 + up, 2, 2, PINK);
}
