// fighter: the arcade HUD. Life bars, the K.O. badge, the round clock in
// the timer's place, and the announcer's big lettering.
//
// The big type is built, not drawn: each glyph is a 3x5 mask stretched onto
// unequal columns and rows (fat strokes, a narrow counter), its outer
// corners nicked, then rendered once into a sprite with a hot vertical ramp,
// a dark keyline and a drop shadow: the sort of numerals that sat in the
// timer box of every 1991 fighting game.
import { sprite, font5x7, font3x5 } from '../js/kit.js';
import { lerpC } from './fighter-rig.js';

const M3 = {
  0: '### #.# #.# #.# ###', 1: '##. .#. .#. .#. ###', 2: '### ..# ### #.. ###', 3: '### ..# ### ..# ###',
  4: '#.# #.# ### ..# ..#', 5: '### #.. ### ..# ###', 6: '### #.. ### #.# ###', 7: '### ..# ..# ..# ..#',
  8: '### #.# ### #.# ###', 9: '### #.# ### ..# ###',
  K: '#.# #.# ##. #.# #.#', O: '### #.# #.# #.# ###', F: '### #.. ##. #.. #..', I: '### .#. .#. .#. ###',
  G: '### #.. #.# #.# ###', H: '#.# #.# ### #.# #.#', T: '### .#. .#. .#. .#.', '!': '# # # . #', '.': '. . . . #',
};

/**
 * Build a big glyph sprite: mask stretched to columns `cw`, rows `rh`,
 * filled with the vertical ramp `ramp`, keylined with `ol`, shadowed.
 */
function bigGlyph(ch, cw, rh, ramp, ol, shadow) {
  const rows = M3[ch].split(' ');
  const mw = rows[0].length;
  const cws = mw === 1 ? [cw[1]] : cw;
  const W = cws.reduce((a, b) => a + b, 0), H = rh.reduce((a, b) => a + b, 0);
  const ink = Array.from({ length: H }, () => new Array(W).fill(0));
  let y = 0;
  rows.forEach((row, j) => {
    let x = 0;
    for (let i = 0; i < mw; i++) {
      if (row[i] === '#') for (let yy = 0; yy < rh[j]; yy++) for (let xx = 0; xx < cws[i]; xx++) ink[y + yy][x + xx] = 1;
      x += cws[i];
    }
    y += rh[j];
  });
  // nick convex corners
  const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? ink[y][x] : 0);
  const nick = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!ink[y][x]) continue;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
      if (!at(x + dx, y) && !at(x, y + dy) && !at(x + dx, y + dy)) nick.push([x, y]);
  }
  for (const [x, y] of nick) ink[y][x] = 0;
  // picture: 1 px keyline round, shadow 1 px down-right
  const PW = W + 3, PH = H + 3;
  const pic = Array.from({ length: PH }, () => new Array(PW).fill('.'));
  const inkAt = (x, y) => at(x - 1, y - 1);
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    if (inkAt(x, y)) continue;
    let near = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inkAt(x + dx, y + dy)) near = true;
    if (near) pic[y][x] = 'o';
    else if (shadow && (inkAt(x - 1, y - 1) || inkAt(x - 2, y - 2) || inkAt(x - 1, y - 2) || inkAt(x - 2, y - 1))) pic[y][x] = 's';
  }
  const pal = { o: ol, s: shadow ?? 0 };
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    if (!inkAt(x, y)) continue;
    const u = (y - 1) / Math.max(1, H - 1);
    const n = ramp.length - 1, f = Math.min(n - 0.001, u * n), i = Math.floor(f);
    let c = lerpC(ramp[i], ramp[i + 1], f - i);
    // a lit top edge on every stroke
    if (!inkAt(x, y - 1)) c = lerpC(c, 0xffffff, 0.55);
    const key = 'c' + y;
    pal[key] = c;
    pic[y][x] = key;
  }
  // sprite() wants one char a pixel: map row colours onto single letters
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const map = {}, P2 = { o: ol };
  if (shadow !== undefined) P2.s = shadow;
  let n = 0;
  const out = pic.map((row) => row.map((k) => {
    if (k === '.' || k === 'o' || k === 's') return k;
    if (!(pal[k] in map)) { map[pal[k]] = chars[n++]; P2[map[pal[k]]] = pal[k]; }
    return map[pal[k]];
  }).join(''));
  return sprite(out, P2);
}

const TIMER_RAMP = [0xfff6b0, 0xffd838, 0xffa020, 0xe85010];
const GREY_RAMP = [0xd8d8e0, 0xa8a8b8, 0x80809a, 0x606078];
const KO_RAMP = [0xfff0a0, 0xffb020, 0xf04010, 0xa00808];
const FIGHT_RAMP = [0xffffff, 0xfff080, 0xffb830, 0xf06018];

const CACHE = {};
const glyphs = (name, chars, cw, rh, ramp, ol, sh) => {
  if (!CACHE[name]) {
    CACHE[name] = {};
    for (const ch of chars) CACHE[name][ch] = bigGlyph(ch, cw, rh, ramp, ol, sh);
  }
  return CACHE[name];
};
const DIG = () => glyphs('dig', '0123456789', [4, 3, 4], [4, 3, 3, 3, 4], TIMER_RAMP, 0x3a0800, 0x000000);
const DIGG = () => glyphs('digg', '0123456789', [4, 3, 4], [4, 3, 3, 3, 4], GREY_RAMP, 0x101018, 0x000000);
const KOG = () => glyphs('ko', 'KO.', [5, 4, 5], [5, 4, 5, 4, 5], KO_RAMP, 0x200000, 0x000000);
const FG = () => glyphs('fight', 'FIGHT!', [4, 3, 4], [3, 3, 3, 3, 3], FIGHT_RAMP, 0x401000, 0x000000);

export const DIGIT_W = 11, DIGIT_H = 17;

/** Two big digits with their top-left ink at (x, y). `grey` for a beaten fighter. */
export function bigPair(g, str, x, y, { grey = false, drop = 0 } = {}) {
  const G = grey ? DIGG() : DIG();
  let cx = x;
  for (const ch of str) {
    const s = G[ch];
    g.blit(s, cx - 1, y - 1 + drop);
    cx += DIGIT_W + 1;
  }
}

/** Big announcer word centred on (cx, cy); `scale` 1 or 2 (a slam-in). */
export function bigWord(g, word, cx, cy, which, scale = 1) {
  const G = which === 'ko' ? KOG() : FG();
  const gap = which === 'ko' ? 1 : 1;
  let w = 0;
  for (const ch of word) w += G[ch].w - 3 + gap;
  w -= gap;
  const h = G[word[0]].h - 3;
  let x = Math.round(cx - (w * scale) / 2), y = Math.round(cy - (h * scale) / 2);
  for (const ch of word) {
    const s = G[ch];
    g.blit(s, x - scale, y - scale, { scale });
    x += (s.w - 3 + gap) * scale;
  }
}

// ------------------------------------------------------------ life bars

const BAR = { y: 3, h: 6, L: [3, 68], R: [92, 157] };
const C = {
  frame: 0xf0e0b0, frameD: 0x60402a, empty: 0x2a1030, life: 0xf8d830, lifeHi: 0xfff7a8, lifeLo: 0xd89a10,
  lag: 0xe02818, low: 0xff7020,
};

/**
 * One life bar. `side` 'L' (drains towards the left end) or 'R' (towards the
 * right end): the life that is left always sits next to the K.O. badge.
 */
export function lifeBar(g, side, life, lag, t, ticks = false) {
  const [x0, x1] = BAR[side];
  const w = x1 - x0, y = BAR.y, h = BAR.h;
  g.fillRect(x0 - 1, y - 1, w + 2, h + 2, C.frameD);
  g.rect(x0 - 2, y - 2, w + 4, h + 4, C.frame);
  g.fillRect(x0, y, w, h, C.empty);
  const n = Math.max(0, Math.min(w, Math.round(life * w)));
  const nl = Math.max(n, Math.min(w, Math.round(lag * w)));
  const lowFlash = life < 0.2 && Math.floor(t * 6) % 2 === 0;
  const body = lowFlash ? C.low : C.life;
  const fill = (from, len, c, hi, lo) => {
    if (len <= 0) return;
    const xs = side === 'L' ? x1 - from - len : x0 + from;
    g.fillRect(xs, y, len, h, c);
    if (hi !== undefined) { g.fillRect(xs, y, len, 1, hi); g.fillRect(xs, y + h - 1, len, 1, lo); }
  };
  fill(n, nl - n, C.lag);
  fill(0, n, body, C.lifeHi, C.lifeLo);
  if (n > 0 && n < 2) fill(0, 2, body); // a sliver stays visible
  if (ticks) {
    // quarter-hour marks on the hour's bar
    for (let k = 1; k < 4; k++) {
      const xx = side === 'L' ? x1 - Math.round((w * k) / 4) : x0 + Math.round((w * k) / 4);
      g.fillRect(xx, y + h - 2, 1, 2, 0x000000, { a: 0.5 });
    }
  }
}

/** The K.O. badge between the bars; it flashes red when someone is nearly beaten. */
export function koBadge(g, t, danger) {
  const x = 71, y = 1, w = 19, h = 10;
  const hot = danger && Math.floor(t * 5) % 2 === 0;
  g.fillRect(x, y, w, h, 0x200808);
  g.rect(x, y, w, h, 0xf0e0b0);
  g.fillRect(x + 1, y + 1, w - 2, h - 2, hot ? 0xe02010 : 0xf8f0d8);
  const c = hot ? 0xfff0a0 : 0xd01010;
  g.text('KO', x + 4, y + 2, { font: font5x7, c, spacing: 1 });
}

/** Small caption with a 1 px shadow. */
export function caption(g, str, x, y, c, { font = font3x5, align = 'left' } = {}) {
  const w = font.measure(str);
  const xx = align === 'right' ? x - w : align === 'center' ? Math.round(x - w / 2) : x;
  // a full keyline, so small type holds up over a busy stage
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, 1], [1, -1], [-1, -1]])
    g.text(str, xx + dx, y + dy, { font, c: 0x100810 });
  g.text(str, xx, y, { font, c });
  return w;
}

export { font5x7, font3x5 };
