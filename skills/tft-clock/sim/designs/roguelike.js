// Roguelike: the glass is a NetHack session on a DOS text screen, and the time
// is the dungeon. Every pixel belongs to a 4 x 6 character cell drawn from a
// tiny CP437 of my own (roguelike-font.js): letters, the dungeon's symbols,
// box drawing and the shade blocks. Each numeral is a ROOM whose floor plan is
// the digit (roguelike-level.js): a one-cell band of floor closed in by walls
// joined the way NetHack joins them, chamfered at the corners, the 2 and 7
// stepping down in a staircase; every counter is solid rock at least 10 px
// across. The rooms sit staggered like a real level, linked by dark corridors
// the hero maps as he walks them; the colon is the up and down staircase
// < >. The top line is the message line ("You kill the jackal!").
//
// The time is alive at rest: the game takes two turns a second and every
// monster in every room steps (the screen update ripples left to right as a
// terminal redraws), the hero '@' walks his tour room to room and fights what
// is in his way. And on every second each room's torch flares and a front of
// light runs out along the floor of the digit: the floor shades rise through
// ░ ▒ ▓ █ (cold blue in the dark, brown and yellow in the light), and the
// walls it reaches turn from the thin grey line of stone in the dark to the
// white CP437 double line, then gutter back; the beat runs on out of the doors
// along the mapped corridors. Flourishes: a wand bolt at :12, :24 and :48
// races along the floor and bounces off the walls, lighting each digit's
// stroke as it goes (and kills what it hits); at :36 a scroll of light floods
// every room at once.
//
// Minute turn: at :57.5 the hero takes the down stair ("You climb down the
// stairs."). The rooms that change are forgotten: their floors melt through
// the shades by a fixed random rank, the walls last, so the outline reads to
// the end; gone by :59.9. After :00, "A map coalesces in your mind!": the
// whole outline of each new room is drawn first, cell by cell, as the thin
// line of the remembered map, then its floor fills in through the shades; the
// hero comes up the stair. Unchanged rooms and their monsters go on untouched.
// Hour (roguelike-show.js): a roar and the screen shakes (pel panning); a red
// dragon slithers in through the rock under and between the hour rooms,
// breathes, and both hour rooms burn, the blaze running along their floors;
// it reaches the stair, fights the hero and dies in a reverse-video flash,
// a ring of fire runs out through all the open rock, and its body turns to
// gold head to tail. The dragon and the ring only ever cover rock outside the
// rooms (never a counter), so the walls, and the time, read throughout.
//
// Palette: the sixteen EGA colours of the text mode, nothing else (to565 of
// the exact values), one foreground on one background per cell, no
// anti-aliasing. White and grey are the walls (the time, and the strongest
// contrast); blue and brown shades the floors; the bright colours are kept for
// monsters, items and fire; the rock is black. Night is the remembered map:
// the backlight dims to 0.4, every wall is a bold grey line, white only where
// light reaches it, floors in dark blue and a smaller torchlight.
//
// Cost: a frame is a cell screen (40 x 13 cells: glyph, fg, bg) filled from
// tables, then a text-mode raster of 12,800 table lookups. A level is built
// once a minute (rooms, walls, corridors, the hero's 120 turns: ~200k simple
// integer steps, billed to the frame that builds it, ~4 ms on an ESP32-C3;
// on the device it can be spread over the frames of :58-:59). Monsters move
// in closed form from their room's epoch, so any frame builds cold. RAM: the
// cell screen ~2 KB, two levels ~8 KB, a few rooms ~3 KB: ~15 KB beyond the
// frame buffer. Flash: the font (~180 glyphs x 6 B), ten floor plans, names
// and messages: ~5 KB.
import { hash, rand, noise } from '../js/kit.js';
import { GLYPH, SHADES, FLOOR as G_FLOOR, WALL0, WALLT0, WALLD0, FLAME0, code } from './roguelike-font.js';
import {
  COLS, ROWS, MAP_Y, CW, CH, TPS, TURNS, UP, DOWN, ROCK, FLOOR, WALL, DOOR, CORR, STAIR, level, monAt, BUILT,
} from './roguelike-level.js';
import { hourLight, hourDraw, hourMsg, hourShake, hourFlash, SHOW_END } from './roguelike-show.js';

const W = 160, H = 80, N = COLS * ROWS;

// The sixteen EGA colours, and nothing else.
const EGA = [0x000000, 0x0000aa, 0x00aa00, 0x00aaaa, 0xaa0000, 0xaa00aa, 0xaa5500, 0xaaaaaa,
  0x555555, 0x5555ff, 0x55ff55, 0x55ffff, 0xff5555, 0xff55ff, 0xffff55, 0xffffff];
const to565 = (c) => (((c >> 19) & 31) << 11) | (((c >> 10) & 63) << 5) | ((c >> 3) & 31);
const P565 = EGA.map(to565);
const BLK = 0, BLU = 1, BRN = 6, LGY = 7, DGY = 8, YEL = 14, WHT = 15, LRED = 12, RED = 4;

// the cell screen: glyph, foreground, background
const GL = new Uint8Array(N), FG = new Uint8Array(N), BG = new Uint8Array(N);
const LV = new Int8Array(N);                    // light level per cell this frame
const MSG = new Uint8Array(COLS);
const GLYPHS = [];
for (let c = 0; c < 256; c++) GLYPHS.push(GLYPH.get(c) || new Uint8Array(6));

const FLOOR_GL = [SHADES[1], SHADES[2], SHADES[2], SHADES[3], SHADES[3], SHADES[4]];
const FLOOR_FG = [9, 9, 6, 6, 14, 14], FLOOR_FG_N = [1, 1, 9, 6, 6, 6];
const BOLT = { lightning: [15, 11], fire: [12, 14], cold: [11, 15] };
const BOLT_GL = ['-', '|', '/', '\\'].map((ch) => ch.charCodeAt(0));
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** Which cells differ between two levels (the cells a minute turn re-maps). */
const DIFF = new Map();
function diffOf(a, b) {
  const key = a.mk;
  let d = DIFF.get(key);
  if (d) return d;
  d = new Uint8Array(N);
  const ch = a.digits.map((v, i) => v !== b.digits[i]);
  for (let c = 0; c < N; c++) {
    const oa = a.owner[c], ob = b.owner[c];
    if (a.kind[c] !== b.kind[c] || a.mask[c] !== b.mask[c] || (oa >= 0 && ch[oa]) || (ob >= 0 && ch[ob])) d[c] = 1;
  }
  DIFF.set(key, d);
  if (DIFF.size > 3) DIFF.delete(DIFF.keys().next().value);
  return d;
}

/** Draw the level of minute L at second s into the cell screen. `fade(c)` returns a stage per cell. */
function compose(L, s, T, night, frameNo, hour) {
  const { kind, mask } = L, hero = L.hero;
  GL.fill(32); FG.fill(LGY); BG.fill(BLK); LV.fill(0);
  const T0 = L.mk * 60 * TPS;
  // ---- light: torches flicker, the hero carries a lamp
  const lights = [];
  for (const r of L.rooms) for (let j = 0; j < r.torches.length; j++) {
    const [x, y] = r.torches[j];
    // a torch flares on the beat (when its room's light front leaves it) and gutters down between
    const tb = s - r.i * 0.06, tau = tb - Math.floor(tb);
    const fl = noise(s * 9 + j * 7.3 + r.i * 3.1, r.seed & 255) * 0.7 + 2.4 * (1 - tau) * (1 - tau);
    lights.push([x, y, (night ? 1.0 : 1.3) + fl]);
  }
  const hp = hero.pos[Math.min(T, TURNS - 1)];
  const heroOn = T >= 1 && T < 115;
  if (heroOn) { const tau = s - Math.floor(s); lights.push([hp[0], hp[1], (night ? 1.6 : 1.4) + 1.4 * (1 - tau) * (1 - tau)]); }
  for (const [lx, ly, I] of lights) {
    const R = Math.ceil(I), bx = Math.round(lx), by = Math.round(ly);
    for (let y = by - R; y <= by + R; y++) for (let x = bx - R; x <= bx + R; x++) {
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
      const dx = x - lx, dy = y - ly;
      // cells are 4 x 6 px: distance in "cell widths" weights rows by 1.5, then squashed toward round
      const d2 = dx * dx * 0.64 + dy * dy * 1.44;
      let lv = 0;
      for (let k = 1; k <= 4; k++) if (d2 < (I - k + 1) * (I - k + 1)) lv = k;
      const c = y * COLS + x;
      if (lv > LV[c]) LV[c] = lv;
    }
  }
  // the beat: on every second each torch flares and a front of light runs out along the room's floor
  for (const r of L.rooms) {
    const tb = s - r.i * 0.06, k = Math.floor(tb), tau = tb - k;
    const rho = (1 - (1 - tau) * (1 - tau)) * (r.maxDist + 4);
    const fade = 1 - 0.45 * tau;
    for (let n = 0; n < r.floor.length; n++) {
      const d = r.dist[n];
      if (d > rho + 0.5) continue;
      const lag = rho - d, e = (night ? 3.4 : 5.6) * fade * (lag < 0 ? 1 + lag * 2 : Math.max(0, 1 - lag * 0.28));
      const lv = Math.min(5, Math.floor(e));
      const c = r.floor[n][1] * COLS + r.floor[n][0];
      if (lv > LV[c]) LV[c] = lv;
    }
  }
  // the flourishes: a bolt racing along the floor, lighting what it passes; a scroll of light
  const zaps = hero.zaps;
  let bolt = null;
  for (const z of zaps) {
    const tz = z.T / TPS, dt = s - tz;
    if (dt < 0 || dt > 2) continue;
    if (z.kind === 'light') {
      const e = Math.floor(5 * (1 - sm((dt - 0.15) / 1.6)));
      if (dt > 0.1) for (const r of L.rooms) for (const [x, y] of r.floor) { const c = y * COLS + x; if (e > LV[c]) LV[c] = Math.min(4, e); }
    } else {
      const head = dt * 26;
      bolt = { z, head };
      for (let k = 0; k < z.ray.length; k++) {
        const a = head - k;
        if (a < 0 || a > 7) continue;
        const [x, y] = z.ray[k];
        const e = a < 3 ? 4 : a < 5 ? 3 : 2;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
          const c = ny * COLS + nx, v = dx || dy ? e - 1 : e;
          if (v > LV[c]) LV[c] = v;
        }
      }
    }
  }
  if (hour) hourLight(L, s, LV);
  // ---- the map
  for (let c = 0; c < N; c++) {
    const k = kind[c];
    if (k === WALL) {
      // stonework in the light is a bold white line; walls in the dark, a thin grey one
      // at night the map is remembered, not seen: every wall bold grey, white where light reaches it
      const lit = nearLit(c);
      GL[c] = (lit ? WALLD0 : night ? WALL0 : WALLT0) + mask[c];
      FG[c] = lit ? WHT : LGY;
    } else if (k === FLOOR) {
      // the floor is shaded by the light on it: cold blue checker in the dark, warm shades near a flame
      const lv = LV[c];
      GL[c] = FLOOR_GL[lv]; FG[c] = (night ? FLOOR_FG_N : FLOOR_FG)[lv];
    } else if (k === DOOR) { GL[c] = code('+'); FG[c] = BRN; }
    else if (k === CORR) {
      // a mapped corridor: dark grey, lit for a moment as the beat runs out along it from the doors
      if (hero.seen[c] <= T) { const u = (s - Math.floor(s)) * 9 - L.cdist[c]; GL[c] = code('#'); FG[c] = u > 0 && u < 2.2 && !night ? LGY : DGY; }
    }
    else if (k === STAIR) { GL[c] = code(c === UP[1] * COLS + UP[0] ? '<' : '>'); FG[c] = WHT; }
  }
  // ---- things on the floor: items, corpses, torches, monsters, the hero
  for (const r of L.rooms) {
    for (const it of r.items) { const c = it.y * COLS + it.x; GL[c] = it.ch; FG[c] = it.c; }
    for (let j = 0; j < r.torches.length; j++) {
      const [x, y] = r.torches[j], c = y * COLS + x;
      const fr = hash(Math.floor(s * 12), r.i, j);
      GL[c] = FLAME0 + (fr & 3); FG[c] = (fr >> 2) % 3 === 0 ? LRED : YEL;
    }
  }
  for (const cp of hero.corpses) if (cp.T <= T) { const c = cp.y * COLS + cp.x; GL[c] = code('%'); FG[c] = cp.c; }
  // monsters step in a ripple: the terminal redraws the map left to right, ~0.2 s a turn
  for (const r of L.rooms) for (const m of r.mons) {
    const kt = hero.kills.get(r.i * 16 + m.id);
    const tx = Math.floor((s - (r.c0 / COLS) * 0.22) * TPS);
    if (kt !== undefined && kt <= tx) continue;
    const [x, y] = monAt(r, m, T0 + tx);
    const c = y * COLS + x;
    GL[c] = m.ch; FG[c] = m.c;
  }
  if (bolt) {
    const { z, head } = bolt, col = BOLT[z.kind];
    for (let k = 0; k < z.ray.length; k++) {
      const a = head - k;
      if (a < 0 || a > 4) continue;
      const [x, y, d] = z.ray[k], c = y * COLS + x;
      GL[c] = BOLT_GL[d]; FG[c] = col[(frameNo + k) & 1];
    }
  }
  // out of the light, things on the floor show in the dark twin of their colour; the beat brightens them
  for (let c = 0; c < N; c++) if (kind[c] === FLOOR && LV[c] < 2 && GL[c] < 128 && FG[c] >= 9) FG[c] -= 8;
  if (heroOn) { const c = hp[1] * COLS + hp[0]; GL[c] = code('@'); FG[c] = WHT; }
  if (hour) hourDraw(L, s, GL, FG, frameNo);
  return heroOn ? hp : null;
}

function nearLit(c) {
  const x = c % COLS, y = (c / COLS) | 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS && LV[ny * COLS + nx] >= 2) return true;
  }
  return false;
}

/** Text-mode raster: every pixel is its cell's glyph bit, foreground or background. */
function raster(g, ox, oy) {
  const buf = g.buf;
  for (let cy = 0; cy < ROWS; cy++) for (let cx = 0; cx < COLS; cx++) {
    const c = cy * COLS + cx, gl = GLYPHS[GL[c]], f = P565[FG[c]], b = P565[BG[c]];
    const x0 = cx * CW + ox, y0 = MAP_Y + cy * CH + oy;
    for (let j = 0; j < CH; j++) {
      const y = y0 + j;
      if (y < 0 || y >= H) continue;
      const row = gl[j], o = y * W;
      for (let i = 0; i < CW; i++) {
        const x = x0 + i;
        if (x >= 0 && x < W) buf[o + x] = row & (8 >> i) ? f : b;
      }
    }
  }
}

function rasterMsg(g, fg) {
  const buf = g.buf, f = P565[fg];
  for (let cx = 0; cx < COLS; cx++) {
    const gl = GLYPHS[MSG[cx]];
    for (let j = 0; j < CH; j++) for (let i = 0; i < CW; i++) if (gl[j] & (8 >> i)) buf[j * W + cx * CW + i] = f;
  }
}

export default {
  name: 'Roguelike',
  blurb: 'A NetHack session in EGA text mode: each numeral is a dungeon room shaped like the digit, its monsters stepping every turn and torchlight running through it on the beat; each minute the hero takes the stairs and the new rooms are mapped in.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey, night = ctx.night > 0.5;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    const T = Math.floor(s * TPS), frameNo = Math.floor(s * 60);
    const built0 = BUILT.n;
    const L = level(mk);
    const hour = f.m === 0 && s < SHOW_END;
    compose(L, s, T, night, frameNo, hour);
    // ---- the minute turn. Out: the old room is forgotten, its floor and all on it melting through
    // the shades first, its walls last, so its outline reads to the end. In: "a map coalesces":
    // the whole outline of the new room is drawn first, a cell at a time, then its floor fills in.
    if (s >= 59) {
      const Ln = level(mk + 1), d = diffOf(L, Ln);
      for (let c = 0; c < N; c++) if (d[c]) {
        const wall = L.kind[c] === WALL || L.kind[c] === DOOR || L.kind[c] === STAIR;
        const st = wall ? 59.42 + rand(c, mk, 1) * 0.4 : 59.0 + rand(c, mk, 1) * 0.32, p = Math.floor((s - st) / 0.08);
        if (p <= 0 || GL[c] === 32) continue;
        if (p >= 3 || wall) { GL[c] = 32; continue; }
        GL[c] = SHADES[3 - p];
      }
    } else if (s < 1.2) {
      const Lo = level(mk - 1), d = diffOf(Lo, L);
      for (let c = 0; c < N; c++) if (d[c]) {
        const k = L.kind[c], wall = k === WALL || k === DOOR || k === STAIR;
        const st = wall ? rand(c, mk, 2) * 0.36 : 0.42 + rand(c, mk, 2) * 0.32, p = Math.floor((s - st) / 0.08);
        if (GL[c] === 32 || p >= 3) continue;
        if (p < 0) { GL[c] = 32; continue; }
        // a wall arrives as the thin grey line of the remembered map; a floor cell through the shades
        if (wall) { if (k === WALL) { GL[c] = WALLT0 + L.mask[c]; FG[c] = LGY; } continue; }
        GL[c] = SHADES[p + 1]; FG[c] = BLU + 8;
      }
    }
    // the kill flash: reverse video for three frames
    if (hour && hourFlash(s)) for (let c = 0; c < N; c++) { const t = FG[c]; FG[c] = BG[c]; BG[c] = t === BLK ? LGY : t; }
    g.clear(EGA[BLK]);
    raster(g, hour ? hourShake(s, frameNo) : 0, 0);
    // ---- the message line
    MSG.fill(32);
    const msgs = L.hero.msgs;
    let txt = null, t0 = 0;
    for (let j = msgs.length - 1; j >= 0; j--) if (msgs[j][0] <= T) { if (T - msgs[j][0] < 5) { txt = msgs[j][1]; t0 = msgs[j][0] / TPS; } break; }
    if (hour) { const hm = hourMsg(s); txt = hm ? hm[1] : null; t0 = hm ? hm[0] : 0; }
    if (txt) {
      const n = Math.min(txt.length, Math.floor((s - t0) * 90));
      for (let j = 0; j < n && j < COLS; j++) MSG[j] = txt.charCodeAt(j);
    }
    rasterMsg(g, LGY);
    g.cost.px += W * H; g.cost.blit += W * H; g.cost.box += N * 24;
    // a level (rooms, walls, corridors, the hero's 120 turns) is built once a minute: bill it to this frame
    g.cost.box += (BUILT.n - built0) * 200000;
  },
};
