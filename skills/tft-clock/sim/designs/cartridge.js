// Cartridge: the glass is a 1989 handheld's pea-green screen, and the time
// IS the level. The four numerals are built from the game's own 8 x 8 blocks
// (bricks, crates, sandstone, ice, lit night bricks: one tileset per world),
// with 45-degree slope blocks for the curves, an ink keyline round every
// numeral and a light lip on every top surface, so each stroke is a platform.
// The hours stand on the shore; the minutes float a block higher over the
// water; the colon is two bonus blocks whose diamonds flash once a second.
//
// Always alive: a sprout-headed little runner with a scarf plays the level
// all minute (runs over the numerals, jumps the gaps with real arcs, hops
// for coins, stomps a beetle that floats down on a leaf), with the old LCD's
// ghost trail behind every jump. Clouds drift; the far hills and near
// bushes slide in parallax with the hero; the water cycles; coins spin.
//
// Minute turn: the hero jumps high over the old digit and ground-pounds it.
// A ring of light runs out from the impact and every block it passes bursts
// into four spinning fragments, leaving a ghost of the old digit that fades
// by :59.85. After :00 the new digit's ghost is there at once and its
// blocks pop in one by one with a bump, nearest the hero first. Hour: a
// goal pole rises out of the colon; the hero leaps to it and slides down,
// and the level-clear blast bursts every changing block into the score
// tally; after :00 a light front wipes in the next world (plains, forest,
// desert, ice; night from 23 to 7) and the new blocks pop as it passes,
// while fireworks go up behind the numerals.
//
// Ramp: one hue, ~80 deg, the handheld's pea green, eight shades from olive
// ink to a lit near-white (cartridge-art.js). The original had four; here
// the four game shades (ink, dark, mid, light) do the drawing, and the two
// palest plus two glow steps are the screen itself: its unlit paper, the
// ghosting, and light (fronts, sparks, fireworks). Everything is drawn in
// ramp indices and turned into colour by one table at the end, so no pixel
// can leave the hue; ghosts and fades are ordered dither between ramp shades,
// never blends. Hard pixels throughout: it is pixel art, moving in whole
// pixels at <= ~1 px a frame. Night is the game's own night level: a dark
// sky, stars and moon, the blocks lit pale, the backlight down to 40 %.
//
// Cost: one index buffer (12.8 KB) drawn with integer loops into g.buf
// (charged to g.cost), one LUT pass. Per-minute work (a 160-column surface
// profile, the hero's moves, the block timings) is a few thousand integer
// operations, done once a minute.

import { LUT, T, BAYER, WORLDS, NIGHT_WORLD, digitArt, MASKS, DW, groundTex, layers, LW, CLOUD_Y, CLOUD_H, FAR_Y, FAR_H, NEAR_Y, NEAR_H,
  HERO, BEETLE, BEETLE_FLAT, LEAF, COIN, COIN_ORDER, BLOCK, FLAG, FRAG, SPARK, GLYPHS, ICON_COIN, ICON_HEART } from './cartridge-art.js';
import { DX, DY, COLON, GROUND, SHORE, POLE_X, planFor, turnInto, heroAt, wipeFront, WIPE_T, digitsOf } from './cartridge-plan.js';
import { clockFields, sin, cos, hash } from '../js/kit.js';

const W = 160, H = 80;
const I = new Uint8Array(W * H);          // the index buffer
const COLW = new Uint8Array(W);            // world per column (for the wipe)
const COLS = new Uint8Array(W);            // brightening per column (the light front)
const LUTS = [0, 1, 2, 3].map((k) => Uint16Array.from({ length: 8 }, (_, i) => LUT[Math.min(7, i + k)]));
let work = 0;                              // integer work this frame, for the estimate

export const worldOf = (h) => (h >= 23 || h < 7 ? NIGHT_WORLD : h % 4);

// sprite colour maps: by night the actors are drawn pale on the dark
const MAP_DAY = Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]);
const MAP_NIGHT = Uint8Array.from([0, 3, 4, 5, 5, 6, 7, 7]);

function blit(s, x, y, flip, map, lift = 0) {
  x = Math.round(x); y = Math.round(y);
  const { w, h, d } = s;
  for (let j = 0; j < h; j++) {
    const yy = y + j;
    if (yy < 0 || yy >= H) continue;
    for (let i = 0; i < w; i++) {
      const v = d[j * w + (flip ? w - 1 - i : i)];
      if (v === T) continue;
      const xx = x + i;
      if (xx < 0 || xx >= W) continue;
      const c = map[v] + lift;
      I[yy * W + xx] = c > 7 ? 7 : c;
    }
  }
  work += w * h;
}
/** A sprite as a dithered silhouette of one index: the LCD's ghosting. */
function ghost(s, x, y, flip, idx, a) {
  x = Math.round(x); y = Math.round(y);
  const th = (a * 16) | 0;
  const { w, h, d } = s;
  for (let j = 0; j < h; j++) {
    const yy = y + j;
    if (yy < 0 || yy >= H) continue;
    for (let i = 0; i < w; i++) {
      if (d[j * w + (flip ? w - 1 - i : i)] === T) continue;
      const xx = x + i;
      if (xx < 0 || xx >= W) continue;
      if (BAYER[((yy & 3) << 2) | (xx & 3)] < th) I[yy * W + xx] = idx;
    }
  }
  work += w * h;
}

// ------------------------------------------------------------ the backdrop
function backdrop(tAbs, hx, x0, x1, w, dim = 0) {
  const Wd = WORLDS[w], L = layers(w);
  const oc = Math.floor(tAbs * 4) & 255, of = Math.floor(tAbs * 1 + hx * 0.15) & 255, on = Math.floor(tAbs * 2.5 + hx * 0.32) & 255;
  const night = w === NIGHT_WORLD;
  const tw = Math.floor(tAbs * 3);
  const dk = Math.floor(dim), df = ((dim - dk) * 16) | 0;
  for (let y = 0; y < GROUND; y++) {
    const row = y * W;
    const hz = y >= 50 ? ((y - 50) * 16 / 22) | 0 : -1;
    const cy = y - CLOUD_Y, fy = y - FAR_Y, ny = y - NEAR_Y;
    for (let x = x0; x < x1; x++) {
      let v = T;
      if (ny >= 0 && ny < NEAR_H) v = L.near[ny * LW + ((x + on) & 255)];
      if (v === T && fy >= 0 && fy < FAR_H) v = L.far[fy * LW + ((x + of) & 255)];
      if (v === T && cy >= 0 && cy < CLOUD_H) {
        v = L.cloud[cy * LW + ((x + (night ? 0 : oc)) & 255)];
        if (night && v !== T && ((hash(x, y, tw) & 7) === 0)) v = v - 2; // stars twinkle
      }
      if (v === T) v = hz >= 0 && BAYER[((y & 3) << 2) | (x & 3)] < hz ? Wd.horizon : Wd.sky;
      if (dim > 0) { const kk = dk + (BAYER[((y & 3) << 2) | (x & 3)] < df ? 1 : 0); v = v > kk ? v - kk : 0; }
      I[row + x] = v;
    }
  }
  // the shore and the water
  const ph1 = Math.floor(tAbs * 9), ph2 = Math.floor(tAbs * 5), ph3 = Math.floor(tAbs * 7);
  const [w0, w1, w2] = Wd.water;
  for (let y = GROUND; y < H; y++) {
    const gy = y - GROUND, row = y * W;
    for (let x = x0; x < x1; x++) {
      if (x < SHORE) { let v = groundTex(Wd.ground, x, gy); if (dim > 0) { const kk = dk + (BAYER[((y & 3) << 2) | (x & 3)] < df ? 1 : 0); v = v > kk ? v - kk : 0; } I[row + x] = v; continue; }
      let v;
      if (gy === 0) v = ((x + ph1) % 12) < 4 ? w2 : (((x + ph1) % 12) < 6 ? w1 : I[row - W + x]);
      else if (gy === 1) v = ((x + ph1 + 6) % 12) < 3 ? w2 : w1;
      else {
        v = w1;
        if (((x + gy * 5 + ph2) % 17) === 0) v = w2;
        else if (((x * 2 + gy * 3 - ph3) % 13 + 13) % 13 === 0) v = w0;
      }
      if (dim > 0) { const kk = dk + (BAYER[((y & 3) << 2) | (x & 3)] < df ? 1 : 0); v = v > kk ? v - kk : 0; }
      I[row + x] = v;
    }
  }
  work += (x1 - x0) * H * 4;   // ~24 cycles a pixel once doubled below
}

// ------------------------------------------------------------ the minutes' reflection in the water
function reflect(tAbs, Wd, night) {
  const [w0, , w2] = Wd.water, ph = Math.floor(tAbs * 6);
  for (let y = GROUND + 2; y < H; y++) {
    const src = 63 - (y - GROUND - 2) * 2, row = y * W, srow = src * W;
    const dx = ((y + ph) & 3) === 0 ? 1 : ((y + ph) & 3) === 2 ? -1 : 0;
    for (let x = SHORE; x < W; x++) {
      const xs = x + dx;
      if (xs < 0 || xs >= W || I[row + x] === w2) continue;
      const v = I[srow + xs];
      if (night ? v >= 4 && v !== T : v <= 1) { if (((x + y) & 1) === 0 || !night) I[row + x] = night ? w2 : w0; }
    }
  }
  work += (W - SHORE) * 6 * 2;
}

// ------------------------------------------------------------ digits, block by block
function drawTile(n, i, c, r, dy, lift, wl, wr, fx) {
  const ox = DX[i] + c * 8, oy = DY[i] + r * 8 + dy;
  const A = digitArt(n, wl), B = wr === wl ? A : digitArt(n, wr);
  const night = (wl === NIGHT_WORLD);
  void night;
  for (let y = 0; y < 8; y++) {
    const Y = oy + y;
    if (Y < 0 || Y >= H) continue;
    const srow = (r * 8 + y) * DW + c * 8;
    for (let x = 0; x < 8; x++) {
      const X = ox + x;
      const v = (X < fx ? A : B)[srow + x];
      if (v === T) continue;
      const q = v + lift;
      I[Y * W + X] = q > 7 ? 7 : q;
    }
  }
  work += 64 * 2;
}
function ghostTile(n, i, c, r, idx, a) {
  const m = MASKS[n].m, ox = DX[i] + c * 8, oy = DY[i] + r * 8, th = (a * 16) | 0;
  if (th <= 0) return;
  for (let y = 0; y < 8; y++) {
    const Y = oy + y, srow = (r * 8 + y) * DW + c * 8;
    for (let x = 0; x < 8; x++) {
      if (!m[srow + x]) continue;
      const X = ox + x;
      if (BAYER[((Y & 3) << 2) | (X & 3)] < th) I[Y * W + X] = idx;
    }
  }
  work += 64;
}

// ------------------------------------------------------------ light: rings, sparks, fireworks
const DIRS = 128;
const UX = new Float32Array(DIRS), UY = new Float32Array(DIRS);
for (let k = 0; k < DIRS; k++) { UX[k] = Math.cos((k / DIRS) * Math.PI * 2); UY[k] = Math.sin((k / DIRS) * Math.PI * 2); }

function ring(cx, cy, r, idx, inner, a) {
  const th = (a * 16) | 0;
  if (th <= 0 || r <= 0) return;
  const n = Math.min(DIRS, Math.max(16, (r * 6.3) | 0)), step = DIRS / n;
  for (let j = 0; j < n; j++) {
    const k = (j * step) | 0;
    for (let dr = 0; dr < 2; dr++) {
      const X = Math.round(cx + (r - dr) * UX[k]), Y = Math.round(cy + (r - dr) * UY[k]);
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      if (BAYER[((Y & 3) << 2) | (X & 3)] < th) I[Y * W + X] = dr ? inner : idx;
    }
  }
  work += n * 4;
}
function dot(x, y, idx, a = 1) {
  const X = Math.round(x), Y = Math.round(y);
  if (X < 0 || Y < 0 || X >= W || Y >= H) return;
  if (a >= 1 || BAYER[((Y & 3) << 2) | (X & 3)] < ((a * 16) | 0)) I[Y * W + X] = idx;
}
function disc(cx, cy, r, idx, a) {
  const th = (a * 16) | 0, r2 = r * r;
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    if (dx * dx + dy * dy <= r2 && BAYER[((y & 3) << 2) | (x & 3)] < th) I[y * W + x] = idx;
  }
  work += (2 * r + 1) * (2 * r + 1);
}

function fireworks(s, key, night) {
  const HEAD = 7, TRAIL = night ? 4 : 6, BLOOM = 6;
  for (let i = 0; i < 6; i++) {
    const tl = 0.45 + i * 0.7, tb = tl + 0.5;
    const fx = [30, 118, 62, 140, 20, 96][i] + (hash(key, i, 1) % 12), fy = 13 + (hash(key, i, 2) % 8);
    if (s < tl || s > tb + 1.4) continue;
    if (s < tb) { // the rocket climbing
      const u = (s - tl) / 0.5, yy = 74 - (74 - fy) * (1 - (1 - u) * (1 - u));
      dot(fx, yy, HEAD); dot(fx, yy + 1, TRAIL); dot(fx, yy + 2, TRAIL, 0.6); dot(fx, yy + 4, TRAIL, 0.3);
      continue;
    }
    const tau = s - tb, fade = tau < 0.8 ? 1 : Math.max(0, 1 - (tau - 0.8) / 0.6);
    if (tau < 0.14) { disc(fx, fy, 3 + tau * 34, BLOOM, 1 - tau * 6); disc(fx, fy, 2.5 + tau * 12, 7, 1); }
    const u = Math.min(1, tau / 0.9), r = 21 * (1 - (1 - u) ** 3), g = 7 * tau * tau;
    const n = 16, rot = hash(key, i, 3) & 7, kind = i & 1;
    for (let k = 0; k < n; k++) {
      const d = ((k * DIRS) / n + rot) & (DIRS - 1);
      const ux = UX[d], uy = UY[d];
      // the head: a 2 x 2 spark; behind it a streak that shortens as it slows
      const hx = fx + r * ux, hy = fy + r * uy + g;
      dot(hx, hy, HEAD, fade); dot(hx + 1, hy, HEAD, fade); dot(hx, hy + 1, HEAD, fade); dot(hx + 1, hy + 1, HEAD, fade * 0.8);
      const len = kind ? 0.5 : 0.3;
      for (let q = 1; q <= 4; q++) {
        const rr = r * (1 - (len * q) / 4);
        dot(fx + rr * ux, fy + rr * uy + g * (1 - q * 0.1), TRAIL, fade * (1 - q * 0.2));
      }
      // a second, inner ring of sparks on alternate shells
      if (kind && u > 0.2) { const ri = r * 0.55; dot(fx + ri * UX[(d + 4) & (DIRS - 1)], fy + ri * UY[(d + 4) & (DIRS - 1)] + g, (tau * 10 | 0) & 1 ? HEAD : TRAIL, fade); }
    }
  }
  work += 600;
}

// ------------------------------------------------------------ HUD
function text(str, x, y, idx) {
  x = Math.round(x);
  for (const ch of str) {
    const g = GLYPHS[ch];
    if (g) for (let j = 0; j < 5; j++) for (let i = 0; i < 4; i++) if (g[j * 4 + i]) I[(y + j) * W + x + i] = idx;
    x += 5;
  }
  work += str.length * 20;
  return x;
}

// ------------------------------------------------------------ the frame
export default {
  name: 'Cartridge',
  blurb: 'A four-shade handheld platformer: the time is the level, built of blocks; the hero ground-pounds each old digit to bits and the new one pops in.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, key = f.minuteKey;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    work = 0;
    const tAbs = (ctx.date.getTime() % 3600000) / 1000 + f.h * 3600 * 0; // scroll clocks wrap hourly (layers are 256 px, rates divide)
    const P = planFor(key);
    const Tin = turnInto(key), Tout = turnInto(key + 1);
    const wNow = worldOf(f.h), wPrev = worldOf(clockFields(new Date((key - 1) * 60000)).h);
    const hero = heroAt(P, s);
    const wipe = Tin.hour && s < WIPE_T + 0.4;
    const fx = wipe ? wipeFront(s) : 999;
    const wL = wNow, wR = wipe ? wPrev : wNow;   // new world left of the front
    const Wd = WORLDS[wNow];
    const map = wNow === NIGHT_WORLD ? MAP_NIGHT : MAP_DAY;

    // ---- backdrop (two worlds split at the wipe front)
    const fxi = Math.max(0, Math.min(W, Math.ceil(fx)));
    // the lights go down for the fireworks after an hour (not at night: it is dark already)
    const dim = Tin.hour && wNow !== NIGHT_WORLD ? 2 * Math.min(1, Math.max(0, (s - 0.2) / 0.8), Math.max(0, (5.6 - s) / 1.4)) : 0;
    if (fxi > 0) backdrop(tAbs, hero.x, 0, fxi, wL, dim);
    if (fxi < W) backdrop(tAbs, hero.x, fxi, W, wR, dim);

    // ---- fireworks behind the numerals, after an hour
    if (Tin.hour && s < 6) fireworks(s, key, wNow === NIGHT_WORLD);

    // ---- the goal pole
    let poleTop = -1;
    if (Tout.hour && s > 55.6) poleTop = GROUND - (GROUND - 6) * easeOut(Math.min(1, (s - 55.6) / 1.0));
    if (Tin.hour && s < 4.4) poleTop = s < 3.4 ? 6 : 6 + (GROUND - 6) * easeIn((s - 3.4) / 1.0);
    if (poleTop >= 0 && poleTop < GROUND) {
      const pt = Math.round(poleTop);
      for (let y = Math.max(0, pt); y < GROUND; y++) { I[y * W + POLE_X - 1] = 0; I[y * W + POLE_X] = Math.min(7, map[3]); }
      for (let y = pt - 3; y < pt; y++) for (let x = POLE_X - 2; x < POLE_X + 2; x++) if (y >= 0) I[y * W + x] = (y === pt - 3 || x === POLE_X - 2 || x === POLE_X + 1) ? 0 : map[2];
      // the flag: at the top, then down with the hero's slide
      let fy = pt + 1;
      if (Tout.hour && s > 57.42) fy = Math.min(GROUND - 9, pt + 1 + (GROUND - 10 - pt) * Math.min(1, ((s - 57.42) / 1.0) ** 2));
      if (Tin.hour) fy = Math.max(pt + 1, GROUND - 9);
      blit(FLAG[Math.floor(s * 6) & 1], POLE_X - 10, fy, false, map);
    }

    // ---- the numerals: ghosts, then blocks
    const outRel = s - 60;        // time relative to the coming turn
    const ghostIdx = Wd.ghost;
    const burstOf = new Map();
    if (Tout.changed.length && s > 55) for (const b of Tout.burst) burstOf.set(b.i * 64 + b.c * 8 + b.r, b);
    const popOf = new Map();
    if (Tin.changed.length && s < 4) for (const p of Tin.pop) popOf.set(p.i * 64 + p.c * 8 + p.r, p);
    for (let i = 0; i < 4; i++) {
      const n = P.digs[i];
      for (const [c, r] of MASKS[n].tiles) {
        const k = i * 64 + c * 8 + r;
        let dy = 0, lift = 0, show = true;
        const b = burstOf.get(k);
        if (b) {
          if (outRel >= b.tb) {
            show = false;
            const a = 0.6 * Math.min(1, (59.85 - s) / 0.45) * (1 - Math.min(1, (outRel - b.tb) / 1.2));
            if (a > 0) ghostTile(n, i, c, r, ghostIdx, a);
          } else if (outRel >= b.tb - 0.08) lift = 2;
        }
        const p = popOf.get(k);
        if (p) {
          if (s < p.tp) { show = false; ghostTile(n, i, c, r, ghostIdx, 0.55 * Math.min(1, s / 0.12)); }
          else if (s < p.tp + 0.24) { const u = (s - p.tp) / 0.24; dy = -Math.round(4 * Math.sin(Math.PI * u)); lift = u < 0.3 ? 2 : 0; }
        }
        if (show) drawTile(n, i, c, r, dy, lift, wL, wR, fxi);
      }
    }
    // the colon: two bonus blocks, the diamonds flash once a second
    const flash = (s % 1) < 0.12 ? 1 : 0;
    for (const [cx, cy] of COLON) blit(BLOCK[flash], cx, cy, false, MAP_DAY, wNow === NIGHT_WORLD ? 2 : 0);

    // ---- fragments of burst blocks
    if (Tout.changed.length && s > 57) for (const b of Tout.burst) {
      const tau = outRel - b.tb;
      if (tau < 0 || tau > 0.95 || s > 59.9) continue;
      for (let q = 0; q < 4; q++) {
        const sx = q & 1 ? 1 : -1, top = q < 2;
        const vx = sx * (22 + (b.seed >> (q * 4) & 15) * 2), vy = top ? -(85 + (b.seed >> 16 & 15) * 2) : -(48 + (b.seed >> 20 & 15) * 2);
        const X = b.x + (q & 1 ? 4 : 0) + vx * tau, Y = b.y + (top ? 0 : 4) + vy * tau + 230 * tau * tau;
        if (Y > H) continue;
        const spr = FRAG[(Math.floor(tau * 14) + q) & 1];
        const a = Math.min(1, (0.95 - tau) / 0.2, (59.9 - s) / 0.15);
        if (a >= 1) blit(spr, X, Y, (Math.floor(tau * 14) & 2) > 0, map);
        else ghost(spr, X, Y, false, map[1], a);
      }
    }
    // the shock ring from the impact
    {
      const rr = (outRel - Tout.impactT) * 150;
      if (Tout.changed.length && rr > 0 && rr < 110) ring(Tout.impact[0], Tout.impact[1], rr, 7, wNow === NIGHT_WORLD ? 5 : 2, 1 - rr / 110);
    }

    // ---- coins
    for (const c of P.coins) {
      const t0 = Math.max(1.8, c.tHit - 7);
      if (s < t0 - 0.2 || s > c.tHit + 0.3) continue;
      if (s < t0) { blit(SPARK[0], c.x - 2, c.y + 1, false, MAP_DAY); continue; }
      if (s < c.tHit) blit(COIN[COIN_ORDER[(Math.floor(tAbs * 9) + c.x) % 6]], c.x - 3, c.y, false, map);
      else blit(SPARK[Math.min(2, Math.floor((s - c.tHit) / 0.1))], c.x - 2, c.y - 2 - (s - c.tHit) * 20, false, MAP_DAY);
    }
    // ---- beetles
    for (const e of P.beetles) {
      const tl = e.t0 - 0.3;
      if (s < tl - 1.6 || s > e.tb + 0.6) continue;
      const xAt = (tt) => e.x0 + e.dir * e.ve * (tt - e.t0);
      if (s < tl) { // floating down on its leaf
        const u = (s - (tl - 1.6)) / 1.6, yy = -2 + (e.y + 2) * u, xx = xAt(tl) + 3 * sin(u * 9);
        blit(LEAF, xx - 6, yy - 15, false, map);
        blit(BEETLE[0], xx - 6, yy - 10, e.dir < 0, map);
      } else if (s < e.tb) {
        const xx = xAt(s);
        blit(BEETLE[Math.floor(Math.abs(xx) / 3) & 1], xx - 6, P.ws[Math.max(0, Math.min(159, Math.round(xx)))] - 10, e.dir < 0, map);
      } else if (s < e.tb + 0.4) blit(BEETLE_FLAT, xAt(e.tb) - 6, P.ws[Math.max(0, Math.min(159, Math.round(xAt(e.tb))))] - 4, false, map);
      else blit(SPARK[2], xAt(e.tb) - 2, e.y - 6, false, MAP_DAY);
    }

    // ---- the hero, with the LCD's ghost trail
    const spr = HERO[hero.pose] ?? HERO.stand;
    const flip = hero.face < 0;
    for (const [dt, a] of [[0.1, 0.25], [0.05, 0.5]]) {
      const o = heroAt(P, s - dt);
      if (s - dt > 0 && Math.abs(o.x - hero.x) + Math.abs(o.y - hero.y) > 2.5) ghost(HERO[o.pose] ?? spr, o.x - 8, o.y - 16, o.face < 0, ghostIdx, a);
    }
    blit(spr, hero.x - 8, hero.y - 16, flip, map);
    // a dust puff on the impact
    if (!Tout.hour && outRel > Tout.impactT && outRel < Tout.impactT + 0.25) {
      const u = (outRel - Tout.impactT) / 0.25;
      for (const sx of [-1, 1]) blit(SPARK[u < 0.5 ? 1 : 2], Tout.impact[0] + sx * (6 + u * 10) - 2, Tout.impact[1] - 4, false, MAP_DAY);
    }

    reflect(tAbs, Wd, wNow === NIGHT_WORLD);

    // ---- HUD
    let pts = 0; for (const [tp, p] of P.points) if (s >= tp) pts += p;
    let nc = 0; for (const c of P.coins) if (s >= c.tHit) nc++;
    if (Tout.changed.length) for (const b of Tout.burst) if (outRel >= b.tb) pts += P.blockPoints;
    const mod = f.h * 60 + f.m;
    const score = String(Math.min(999999, mod * 600 + Math.round(pts))).padStart(6, '0');
    const hud = dim > 1 ? 6 : Wd.hud;
    blit(ICON_COIN, 2, 1, false, map);
    text('x' + String(nc).padStart(2, '0'), 7, 1, hud);
    text(score, 129, 1, hud);
    const banner = Tout.hour && s > 58.45 ? ((Math.floor(s * 4) & 1) ? 'CLEAR!' : '') : Tin.hour && s < 4.5 ? (s < 1.2 ? 'CLEAR!' : 'WORLD ' + (wNow + 1)) : null;
    if (banner !== null) { if (banner) text(banner, 80 - banner.length * 5 / 2, 1, hud); }
    else for (let k = 0; k < 3; k++) blit(ICON_HEART, 72 + k * 6, 1, false, map);

    // ---- the light front's glow, then out through the palette
    COLS.fill(0);
    if (wipe && fx < W + 8) for (let x = Math.max(0, Math.floor(fx - 9)); x < Math.min(W, fx + 2); x++) COLS[x] = Math.abs(x - fx) < 2.5 ? 3 : Math.abs(x - fx) < 5 ? 2 : 1;
    const buf = g.buf;
    for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) buf[i] = LUTS[COLS[x]][I[i]];
    g.cost.px += W * H; g.cost.box += W * H * 2 + work * 2;
  },
};

function easeOut(u) { return 1 - (1 - u) * (1 - u); }
function easeIn(u) { return u * u; }
void COLW; void cos; void digitsOf;
