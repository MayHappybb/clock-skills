// Spell Card: the time is a boss's bullet pattern in a horizontal danmaku shmup.
//
// A tiny ship holds the left of the strip, a boss in a turning magic circle
// holds the right, and between them the current time hangs in the air as a
// frozen curtain of bullets: each numeral is a chain of 5 px orbs laid along
// the strokes of a rounded digit. Around it, the boss's real danmaku streams
// leftwards in one of four spell patterns (squared-angle arms, flower rings,
// aimed fans over a spiral, snaking streams), and the ship weaves through it.
// The weaving is not faked by collision: any bullet whose path would cross
// the ship's column near where the ship will be is never fired, so each
// pattern carries a moving gap, and the ship rides it, grazing the edges.
//
// Reading it: the big bullet numerals are HH:MM (24 h). The spell card's
// name across the top is the same time in words ("TIME SIGN [TEN OH NINE]"),
// the boss's ring gauge is the minute running out, the label bottom left is
// the difficulty, which follows the time of day (EASY through the night,
// NORMAL mornings, HARD afternoons, LUNATIC evenings).
//
// The minute is one spell card:
//   :00  the card is declared: a cut-in sweeps the glass, the name slides in,
//        the gauge fills, and the boss sprays the numerals' bullets in two
//        braided arcs that decelerate onto their places (by :03).
//   :29  the frozen numerals are launched at the player as a wall, peeling
//        from the left; the ship ducks over or under it; the boss re-forms the
//        same time in a new colour while a new pattern starts.
//   :57  the gauge empties and the card breaks: every bullet on the glass
//        turns into a score item, hops, and is vacuumed into the ship under
//        "GET SPELL CARD BONUS!!". The glass is clear before :00.
// The hour: the boss itself is destroyed at :57 ("STAGE CLEAR!!") and a new
// one, in the next hour's colour, flies in before :00.
//
// Palette: each half-minute pattern owns a pair of decoy colours and a
// numeral colour picked to fight them (violet/blue vs gold, red/pink vs
// cyan, green/yellow vs magenta, cyan vs orange), on a near-black spell
// background of its own tone. The numerals are the only 5 px white-cored
// bullets, so they always read as the brightest, largest thing.
//
// Hard pixels for every bullet, item, ship and letter (it is a sprite game);
// AA only on the boss's turning magic circle and gauge.
import { font3x5, font5x7, mix, rand, noise2, sin, cos, ease, clamp } from '../js/kit.js';
import {
  DIG, TIMES, mod, bossPos, shipPos, digitPoints, flyIn, wallPos, decoys, level, LEVELS, patternOf, cardName,
} from './bullethell-plan.js';
import { PAL, orb5, orb5hot, trail, decoy, HALO, ITEM_POINT, ITEM_POWER, SHIP, FLAME, BOSS } from './bullethell-art.js';

const WHITE = 0xffffff, BLACK = 0x000000;
const TAU = Math.PI * 2;
const LEVEL_C = [0x6aff8a, 0x6ab8ff, 0xffa040, 0xff50d0];

export default {
  name: 'Spell Card',
  blurb: 'A danmaku boss fight: the time is a frozen curtain of bullets the ship weaves around; each minute is a spell card that breaks into items at :57.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, date = ctx.date;
    ctx.lcd.backlight(1 - 0.7 * ctx.night);
    const T = (date.getTime() % 86400000) / 1000;
    const s = mod(T, 60), M = Math.floor(T / 60);
    const lvl = level(f.h);
    const pA = patternOf(M, 0), pB = patternOf(M, 1), pN = patternOf(M + 1, 0);
    const hourEnd = f.m === 59 && s >= TIMES.brk;

    // ---------------------------------------------------- the boss's whereabouts
    let [bx, by] = bossPos(T);
    let bossCol = BOSS[f.h % BOSS.length], bossShown = true;
    if (hourEnd) {
      if (s >= 57.15) bossCol = BOSS[(f.h + 1) % BOSS.length];
      if (s >= 57.15 && s < 59.0) bossShown = false;
      if (s >= 59.0) bx += 44 * (1 - ease.outCubic(clamp((s - 59.0) / 0.9, 0, 1)));
    }

    // ---------------------------------------------------- spell background
    let kAB = clamp((s - 29.0) / 2.5, 0, 1);
    let base = mix(PAL[pA].bg, PAL[pB].bg, kAB), neb = mix(PAL[pA].neb, PAL[pB].neb, kAB);
    if (s > 57.5) {
      const k = clamp((s - 57.5) / 2.3, 0, 1);
      base = mix(base, PAL[pN].bg, k); neb = mix(neb, PAL[pN].neb, k);
    }
    const ripple = bossShown ? 1 : 0.3;
    g.coarse((x, y) => {
      const n = noise2(x * 0.045 + T * 0.4, y * 0.09, 5);
      const dx = x - bx, dy = y - by, d = Math.sqrt(dx * dx + dy * dy);
      const r = (0.5 + 0.5 * sin(d * 0.21 - T * 2.4)) * clamp(1 - d / 170, 0, 1) * ripple;
      return mix(base, neb, n * n * 0.85 + r * 0.32);
    }, { cell: 8 });
    // parallax star streaks: the fight is flying right
    for (let i = 0; i < 26; i++) {
      const v = 10 + 64 * rand(i, 1), y = Math.floor(rand(i, 2) * 80);
      const x = Math.floor(mod(rand(i, 3) * 190 - v * T, 190)) - 15;
      g.hline(x, y, v > 50 ? 3 : v > 28 ? 2 : 1, mix(neb, WHITE, 0.25 + 0.5 * (v / 74)));
    }

    // ---------------------------------------------------- spell declaration cut-in
    if (s < 0.8) {
      const u = s / 0.8, x0 = -60 + 260 * ease.inOutQuad(u);
      g.fillPolygon([[x0, 0], [x0 + 34, 0], [x0 + 14, 80], [x0 - 20, 80]], bossCol, { a: 0.28 * (1 - u * 0.6) });
    }

    // ---------------------------------------------------- boss, behind the bullets
    if (bossShown) {
      const rot = T * 0.8, a0 = s < 1.2 ? 0.45 + 0.5 * (1 - s / 1.2) : 0.45;
      const rr = s < 1.2 ? 11.8 + 6 * (1 - ease.outCubic(s / 1.2)) : 11.8;
      g.ring(bx, by, rr - 0.5, rr + 0.5, bossCol, { aa: true, a: a0 });
      const P = [];
      for (let k = 0; k < 6; k++) P.push([bx + rr * cos(rot + (k * TAU) / 6), by + rr * sin(rot + (k * TAU) / 6)]);
      for (let k = 0; k < 6; k++) g.thickLine(P[k][0], P[k][1], P[(k + 2) % 6][0], P[(k + 2) % 6][1], 0.9, bossCol, { aa: true, a: a0 * 0.8 });
      g.ring(bx, by, 6.6, 7.3, bossCol, { aa: true, a: 0.5 });
      for (let k = 0; k < 8; k++) {
        const a = -rot * 1.7 + (k * TAU) / 8;
        g.pixel(bx + 9 * cos(a), by + 9 * sin(a), mix(bossCol, WHITE, 0.5));
      }
    }

    // ---------------------------------------------------- the ship's shots
    const [sx, sy] = shipPos(T);
    const stopX = bossShown ? bx - 7 : 170;
    for (let n = Math.floor((T - 0.75) * 15); n <= Math.floor(T * 15); n++) {
      const Tn = n / 15, [ox, oy] = shipPos(Tn);
      const x = ox + 5 + 230 * (T - Tn);
      if (x > stopX) continue;
      g.hline(x, oy - 2, 4, 0xa8f0ff, { a: 0.55 });
      g.hline(x, oy + 2, 4, 0xa8f0ff, { a: 0.55 });
    }
    if (bossShown) {
      const k = Math.floor(T * 30);
      for (let j = 0; j < 3; j++)
        g.pixel(bx - 7 - rand(k, j) * 4, by - 4 + rand(k, j, 1) * 8, rand(k, j, 2) < 0.5 ? WHITE : 0xa8f0ff);
    }

    // ---------------------------------------------------- decoy danmaku
    const live = decoys(T, s, lvl);
    for (const [x, y, shape, ci, pi] of live) {
      const spr = decoy(shape, PAL[pi].dec[ci]);
      g.blit(spr, x - spr.w / 2, y - spr.h / 2);
    }

    // ---------------------------------------------------- boss core and gauge
    if (bossShown) {
      const flare = s < 2.0 || (s > TIMES.emitB && s < TIMES.emitB + 1.6) ? 1 : 0;
      g.fillCircle(bx, by, 7 + flare, bossCol, { a: 0.18 });
      g.fillCircle(bx, by, 5 + flare * 0.6, bossCol, { a: 0.35 });
      g.fillCircle(bx, by, 3.6, mix(bossCol, WHITE, 0.3));
      g.fillCircle(bx, by, 2.1, WHITE);
      const frac = hourEnd ? 0 : s < 0.8 ? ease.outQuad(s / 0.8) : s < TIMES.brk ? 1 - (s - 0.8) / (TIMES.brk - 0.8) : 0;
      g.ring(bx, by, 14.6, 15.4, bossCol, { aa: true, a: 0.18 });
      if (frac > 0.002) {
        const low = frac < 0.12 && Math.floor(T * 6) % 2 === 0;
        g.arc(bx, by, 14.3, 15.7, 0, frac * TAU, low ? 0xff3040 : mix(bossCol, WHITE, 0.6), { aa: true });
      }
    }

    // ---------------------------------------------------- the numerals
    const D = digitPoints(f.hh, f.mm);
    const drawWave = (emit0, col, wall) => {
      const at = D.pts.map((p) => (wall && s >= TIMES.releaseA ? wallPos(p, s) : flyIn(p, D.n, emit0, T, s)));
      for (const pos of at) if (pos && pos[0] > -4) g.blit(HALO, pos[0] - 3.5, pos[1] - 3.5, { a: 0.55 * pos[2] ** 2 });
      for (let i = 0; i < D.n; i++) {
        const p = D.pts[i], pos = at[i];
        if (!pos || pos[0] < -4) continue;
        const [x, y, u] = pos;
        if (!wall || s < TIMES.releaseA) {
          if (u < 1) {
            const q = flyIn(p, D.n, emit0, T, s - 0.045);
            if (q) g.blit(trail(col), q[0] - 1.5, q[1] - 1.5);
          }
        }
        const glint = u >= 1 && mod(s - p.x * 0.008, 3.7) < 0.1;
        g.blit(glint ? orb5hot(col) : orb5(col), x - 2.5, y - 2.5);
      }
    };
    if (s >= TIMES.emitA && s < 31.8) drawWave(TIMES.emitA, PAL[pA].dig, true);
    if (s >= TIMES.emitB && s < TIMES.brk) drawWave(TIMES.emitB, PAL[pB].dig, false);

    // ---------------------------------------------------- the card breaks
    if (s >= TIMES.brk) {
      const sb = s - TIMES.brk, Tb = T - sb;
      const src = [];
      for (const p of D.pts) src.push([p.x, p.y, 1]);
      for (const d of decoys(Tb, TIMES.brk - 1e-4, lvl)) src.push([d[0], d[1], 0]);
      const pop = ease.outQuad(clamp(sb / 0.4, 0, 1));
      for (let i = 0; i < src.length; i++) {
        const [x0, y0, power] = src[i];
        let x = x0 + (rand(i, 4) - 0.5) * 6 * pop, y = y0 - (3 + 4 * rand(i, 5)) * pop;
        const u = (s - (57.4 + 0.95 * rand(i, 9))) / 0.55;
        if (u >= 1) continue;
        if (u > 0) { const q = ease.inQuad(u); x += (sx - x) * q; y += (sy - y) * q; }
        const spr = power ? ITEM_POWER : ITEM_POINT;
        g.blit(spr, x - 1.5, y - 1.5, sb < 0.1 ? { c: WHITE } : {});
      }
      // the break's shockwave, or the boss's death at the hour
      if (sb < 0.7) g.ring(bx, by, 3 + 150 * sb, 5 + 150 * sb, WHITE, { aa: true, a: 0.6 * (1 - sb / 0.7) });
      if (hourEnd && sb < 1.6) {
        const [ex, ey] = bossPos(Tb);
        for (let k = 0; k < 3; k++) {
          const tk = sb - k * 0.18;
          if (tk > 0 && tk < 1) g.ring(ex, ey, 40 * tk, 40 * tk + 2.5, k === 1 ? BOSS[f.h % BOSS.length] : WHITE, { a: 1 - tk });
        }
        for (let k = 0; k < 22; k++) {
          const a = rand(k, 21) * TAU, v = 30 + 70 * rand(k, 22), d = v * sb - 25 * sb * sb;
          if (sb < 1.4) g.fillRect(ex + cos(a) * d, ey + sin(a) * d, 2, 2, k & 1 ? WHITE : BOSS[f.h % BOSS.length]);
        }
        if (sb < 0.3) g.fillRect(0, 0, 160, 80, WHITE, { a: 0.55 * (1 - sb / 0.3) });
      }
    }

    // ---------------------------------------------------- the ship
    const flame = FLAME[Math.floor(T * 20) & 1];
    g.blit(flame, sx - 6, sy - 1);
    g.blit(SHIP, sx - 4, sy - 3);
    for (const [x, y] of live) {
      const dx = x - sx, dy = y - sy;
      if (dx * dx + dy * dy < 81) {
        const k = Math.floor(T * 40);
        g.pixel(sx + dx * 0.55 + (rand(k, x | 0) - 0.5) * 3, sy + dy * 0.55 + (rand(k, y | 0) - 0.5) * 3, WHITE);
      }
    }

    // ---------------------------------------------------- HUD
    if (s < 59.5) {
      const nm = cardName(f.h, f.m, M);
      const slide = s < 0.55 ? 1 - ease.outCubic(s / 0.55) : 0;
      const fade = s > 59.2 ? (59.5 - s) / 0.3 : 1;
      const wide = (nm.sign.length + 1) * 4 + 4 + nm.words.length * 4 + 3;
      const x0 = 159 - wide + Math.round(slide * (wide + 4));
      g.fillRect(x0 - 3, 0, 165 - x0, 7, BLACK, { a: 0.55 * fade });
      const sc = mix(PAL[s < 29.5 ? pA : pB].dig, WHITE, 0.2);
      let x = g.text(nm.sign, x0, 1, { font: font3x5, c: sc, a: fade }) + 5;
      g.hline(x, 1, 3, sc, { a: fade }); g.vline(x, 2, 3, sc, { a: fade });          // 「
      x += 4;
      x = g.text(nm.words, x, 1, { font: font3x5, c: WHITE, a: fade }) + 1;
      g.hline(x, 5, 3, sc, { a: fade }); g.vline(x + 2, 2, 3, sc, { a: fade });      // 」
    }
    g.text(LEVELS[lvl], 2, 74, { font: font3x5, c: LEVEL_C[lvl], a: 0.75 });

    if (s >= 57.25 && s < 59.5) {
      const u = clamp((s - 57.25) / 0.25, 0, 1), out = s > 59.2 ? (59.5 - s) / 0.3 : 1;
      const lines = hourEnd ? ['STAGE CLEAR!!'] : ['GET SPELL CARD', 'BONUS!!'];
      const y0 = hourEnd ? 36 : 31;
      const hh = Math.max(1, Math.round(4 * u));
      g.clip(0, 40 - hh * 3 - 6, 160, hh * 6 + 12);
      lines.forEach((ln, i) => {
        const w = ln.length * 6 - 1, x = Math.round((160 - w) / 2), y = y0 + i * 10;
        g.text(ln, x + 1, y + 1, { font: font5x7, c: 0x301000, a: out });
        g.text(ln, x, y, { font: font5x7, c: Math.floor(T * 8) % 2 ? 0xffe070 : 0xffffff, a: out });
      });
      g.unclip();
    }
  },
};
