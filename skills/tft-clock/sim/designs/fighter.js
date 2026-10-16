// fighter: every minute is a round of a 16-bit arcade fighting game.
//
// THE IDEA. Hours versus minutes. On the left stands the hour's champion; on
// the right, each minute, a new challenger leaps in ("HERE COMES A NEW
// CHALLENGER!", FIGHT!) and they fight the round out: pokes, roundhouses,
// sweeps, fireballs that get jumped or blocked or eaten, jump-ins swatted
// by uppercuts, spinning kicks, hit sparks, screen shake, a crowd that
// jumps at the big hits. At :54.6 the champion's super flashes the stage
// dark, he dashes in, five hits on the counter, the uppercut launches the
// challenger, K.O., and the beaten fighter blinks out of existence as the
// next one arrives. Sixty challengers an hour, each a different fighter.
//
// READING IT. The time sits where the arcade put the round timer, in its
// numerals: HH (the champion's number) and MM (the challenger's) under the
// K.O. badge. The bars are honest too: the challenger's life is the
// seconds (each hit he takes sets it to what is left of the minute), the
// champion's life is the hour (it starts each round at (60 - minute) / 60,
// with quarter marks, and every challenger chips a sixtieth off it).
// After a K.O. the beaten number greys; at :00 the new one drops in.
//
// THE HOUR. Round 59 is the upset: the champion is on his last sliver and
// the challenger, nearly beaten himself, lands the super and K.O.s the hour.
// He stays on: the winner of round 59 turns round at :00 as the new
// champion, with the new hour's number and a full bar.
//
// STAGES by time of day: a noon harbour with a ship's crowd, a sunset
// airbase, a moonlit temple roof; three parallax planes over a perspective
// floor whose seams swing as the camera follows the fight.
//
// PALETTE AND PIXELS. Hard pixels throughout (it is sprite art): fighters
// keylined in near-black with a lit and a shaded side, the HUD in the
// genre's gold, cream and red, the numerals on a hot yellow-to-red ramp.
// The fighters are not sprites but rigs: bones posed by angle and tweened,
// which is why sixty different challengers an hour cost nothing.
import { rand, mix, hex, rng } from '../js/kit.js';
import { place, drawFighter, lerpC } from './fighter-rig.js';
import { round, fighterAt, SW } from './fighter-script.js';
import { stage, stageFor, drawStage, FEET_Y } from './fighter-stage.js';
import { bigPair, bigWord, lifeBar, koBadge, caption, font5x7, font3x5, DIGIT_W } from './fighter-hud.js';

// ------------------------------------------------------------ the fighters' looks

const SKIN = [0xf2c8a0, 0xe0a878, 0xc08458, 0x8a5a38, 0x6a4028, 0xf6d8b8];
const CLOTH = [0xf4f0e6, 0xd83028, 0x2a5ad0, 0x2a2a38, 0xf08a20, 0x3aa050, 0x7a3ab0, 0xf0c830, 0x28a8b0, 0xe85890, 0x8a6a40];
const HAIR = [0x2a1a10, 0x101018, 0x8a4a20, 0xe8c050, 0xb02818, 0xf0f0f0, 0x3a3a5a];
const ENERGY = [0x60b0ff, 0xff9030, 0x80ff90, 0xff60d0, 0xfff070];
const dk = (c, k = 0.42) => lerpC(c, 0x100818, k);

const LOOKS = new Map();
function makeLook(seed) {
  if (LOOKS.has(seed)) return LOOKS.get(seed);
  const r = rng(seed * 13 + 5);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const kind = pick(['gi', 'gi', 'kungfu', 'soldier', 'wrestler', 'ninja', 'boxer', 'gi']);
  const skin = pick(SKIN);
  let top = pick(CLOTH), pants = top, sleeve = top, feet = skin, glove = skin, belt = 0x181018, band = null, hair = pick(HAIR);
  let build = 1, chest = 1, size = 1, legW = 5, armW = 3.6, fist = 2.3, boots = false, mask = null, vee = false, hairStyle = pick(['spike', 'flat', 'tail', 'flat']);
  if (kind === 'gi') {
    sleeve = r() < 0.5 ? skin : top; band = r() < 0.7 ? pick([0xe02828, 0xf4f0e6, 0x2a2a38, 0xf0c830]) : null; vee = true;
    glove = r() < 0.4 ? 0xc82020 : skin;
  } else if (kind === 'kungfu') {
    pants = dk(pick(CLOTH), 0.3); belt = 0xf0c830; boots = true; feet = 0xf4f0e6; hairStyle = 'tail'; glove = skin;
  } else if (kind === 'soldier') {
    top = pick([0x5a7a3a, 0x3a5a2a, 0xa08a50, 0x2a5ad0]); sleeve = skin; pants = pick([0x4a5a2a, 0x6a6a3a, 0x3a3a4a]);
    boots = true; feet = 0x2a2018; belt = 0x2a2018; hairStyle = pick(['flat', 'spike']); build = 1.08;
  } else if (kind === 'wrestler') {
    top = skin; sleeve = skin; vee = false; pants = pick(CLOTH); boots = true; feet = pick(CLOTH); belt = 0xf0c830;
    build = 1.22; chest = 1.15; size = 1.1; legW = 5.8; armW = 4.4; fist = 2.7; hairStyle = pick(['mohawk', 'flat', 'none']);
    if (r() < 0.35) mask = pick([0xe02828, 0x2a5ad0, 0xf0c830]);
  } else if (kind === 'ninja') {
    top = pick([0x2a2a48, 0x3a1a3a, 0x1a3a3a, 0x5a1a1a]); pants = top; sleeve = top; glove = dk(top, 0.2); feet = dk(top, 0.3);
    mask = dk(top, 0.15); band = pick([0xe02828, 0xf0c830, 0xf4f0e6]); size = 0.95; build = 0.9; hairStyle = 'flat'; hair = top;
  } else if (kind === 'boxer') {
    top = skin; sleeve = skin; pants = pick(CLOTH); belt = 0xf4f0e6; glove = pick([0xe02828, 0x2a5ad0, 0xf4f0e6]); fist = 3.1;
    boots = true; feet = 0xf4f0e6; hairStyle = pick(['flat', 'spike']);
  }
  if (hairStyle === 'none') hair = null;
  const look = {
    seed: (seed % 97) * 0.13, kind, skin, skinD: dk(skin), top, topD: dk(top), pants, pantsD: dk(pants), sleeve, sleeveD: dk(sleeve),
    feet, feetD: dk(feet), glove, gloveD: dk(glove), belt, band, hair, hairStyle, build, chest, size, legW, armW, fist, boots, mask, vee,
    energy: pick(ENERGY),
  };
  LOOKS.set(seed, look);
  if (LOOKS.size > 8) LOOKS.delete(LOOKS.keys().next().value);
  return look;
}

// ------------------------------------------------------------ effects

const ATTACKS = new Set(['jab', 'strong', 'kick', 'sweep', 'fireball', 'uppercut', 'jumpKick', 'spin', 'dash', 'charge']);

function spark(g, x, y, d, heavy, block, energy) {
  // a hit spark: a white star with hot rays, or a blue-white block flash
  const life = heavy ? 0.2 : 0.14;
  if (d < 0 || d > life) return;
  const u = d / life;
  if (block) {
    const r = 2 + u * 5;
    g.fillPolygon([[x, y - r], [x + r * 0.6, y], [x, y + r], [x - r * 0.6, y]], 0x9ad8ff, { a: 1 - u * 0.6 });
    g.fillPolygon([[x, y - r * 0.5], [x + r * 0.3, y], [x, y + r * 0.5], [x - r * 0.3, y]], 0xffffff);
    return;
  }
  const R = (heavy ? 9 : 6) * (0.4 + u);
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3;
    const len = R * (i % 2 ? 0.6 : 1);
    const x1 = x + Math.cos(a) * len, y1 = y + Math.sin(a) * len;
    g.thickLine(x, y, x1, y1, u < 0.5 ? 2 : 1, i % 2 ? 0xffa020 : 0xffe060);
  }
  g.fillCircle(x, y, (heavy ? 3.4 : 2.4) * (1 - u * 0.6), 0xffffff);
  void energy;
}

function fireball(g, x, y, dir, t, c) {
  const fl = Math.floor(t * 30);
  for (let k = 3; k >= 1; k--) {
    const tx = x - dir * k * 4.2, ty = y + ((fl + k) % 3 - 1) * 0.8;
    g.fillCircle(tx, ty, 3.6 - k * 0.7, mix(c, 0x000000, 0.15 * k), { a: 0.85 });
  }
  g.fillEllipse(x, y, 5.2, 4.4, c);
  g.fillEllipse(x + dir * 0.8, y, 3.4, 3, mix(c, 0xffffff, 0.6));
  g.fillCircle(x + dir * 1.2, y, 1.6, 0xffffff);
  if (fl % 2) { g.pixel(x + dir * 5, y - 3, 0xffffff); g.pixel(x - dir * 2, y + 4, 0xffffff); }
}

function dust(g, x, d, big) {
  const life = big ? 0.5 : 0.35;
  if (d < 0 || d > life) return;
  const u = d / life;
  for (const s of [-1, 1]) {
    const px = x + s * (3 + u * (big ? 14 : 9));
    g.fillCircle(px, FEET_Y - 1 - u * 2, (big ? 3.4 : 2.4) * (1 - u * 0.5), 0xd8c8b0, { a: 0.75 * (1 - u) });
  }
}

// ------------------------------------------------------------ health

function lifeM(rd, t) {
  let hp = rd.ev.reversed ? Math.min(1, t / 1.2) : Math.min(1, t / 1.2);
  for (const e of rd.ev.hits) if (e.tgt === 'M' && e.kind === 'hit' && e.t <= t) hp = e.ko ? 0 : 1 - e.t / 60;
  return hp;
}
function lifeH(rd, t, minute) {
  let base = (60 - minute) / 60;
  if (minute === 0) base = Math.min(1, t / 1.2);
  let n = 0;
  for (const e of rd.ev.hits) if (e.tgt === 'H' && e.kind === 'hit' && e.t <= t) n++;
  const tot = rd.ev.mHitsTotal || 1;
  return Math.max(0, base - (n / tot) / 60);
}

// ------------------------------------------------------------ the frame

export default {
  name: 'Fighter',
  blurb: 'Hours versus minutes: every minute a new challenger fights the hour, K.O. at :57; round 59 is the upset.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, t = f.sec, m = f.m, key = f.minuteKey;
    ctx.lcd.backlight(1 - 0.65 * ctx.night);
    const rd = round(key, m);
    const ev = rd.ev;
    const lookH = makeLook(key - m - 1), lookM = makeLook(key);

    const FH = fighterAt(rd, 'H', t), FM = fighterAt(rd, 'M', t);
    let cam = Math.max(0, Math.min(SW - 160, (FH.x + FM.x) / 2 - 80));

    // shake: heavy hits and big landings
    let amp = 0, sd = 0;
    for (const e of ev.hits) {
      const d = t - e.t;
      if (e.heavy && d >= 0 && d < 0.22) { const a = (e.ko ? 3.5 : 2) * (1 - d / 0.22); if (a > amp) { amp = a; sd = d; } }
    }
    for (const e of ev.land) {
      const d = t - e.t;
      if (e.big && d >= 0 && d < 0.25) { const a = 2.5 * (1 - d / 0.25); if (a > amp) { amp = a; sd = d; } }
    }
    const sx = Math.round(amp * Math.sin(sd * 110)), sy = Math.round(amp * 0.7 * Math.cos(sd * 90));

    // the crowd's excitement
    let cheer = 0;
    for (const e of ev.hits) {
      const d = t - e.t;
      if (e.kind === 'hit' && d >= 0 && d < 1.6) cheer = Math.max(cheer, (e.heavy ? 1 : 0.5) * (1 - d / 1.6));
    }
    if (ev.ko !== undefined && t > ev.ko) cheer = Math.max(cheer, 0.8);

    const st = stage(stageFor(f.h));
    drawStage(g, st, cam, (key % 1000) * 60 + t, sx, sy, cheer);

    // the super: the stage goes dark, a white flash, the attacker glows
    let sup = null;
    for (const s of ev.supers) if (t >= s.t0 && t < s.t1 + 0.35) sup = s;
    if (sup) {
      const u = t < sup.t1 ? Math.min(1, (t - sup.t0) / 0.12) : 1 - (t - sup.t1) / 0.35;
      g.fillRect(0, 0, 160, 80, 0x080420, { a: 0.62 * u });
      if (t - sup.t0 < 0.07) g.fillRect(0, 0, 160, 80, 0xffffff, { a: 0.75 });
    }
    // K.O. flash
    if (ev.ko !== undefined) {
      const d = t - ev.ko;
      if (d >= 0 && d < 0.12) g.fillRect(0, 0, 160, 80, d < 0.05 ? 0xffffff : 0xff3020, { a: 0.55 });
    }

    const sxW = (x) => x - cam + sx;
    const fy = FEET_Y + sy;
    // shadows
    for (const F of [FH, FM]) {
      if (F.alpha <= 0) continue;
      const k = Math.max(0.35, 1 - F.h / 40);
      g.fillEllipse(sxW(F.x), fy + 1, 9 * k, 1.8 * k, st.shadow, { a: 0.55 });
    }

    // aura of the charging fighter
    for (const [F, L] of [[FH, lookH], [FM, lookM]]) {
      if (!F.aura) continue;
      const cx = sxW(F.x), ph = t * 6;
      for (let i = 0; i < 3; i++) {
        const r = 8 + ((ph + i / 3) % 1) * 18;
        g.ring(cx, fy - 20, r - 1, r, L.energy, { a: 0.7 * (1 - ((ph + i / 3) % 1)) });
      }
      for (let i = 0; i < 6; i++) {
        const x = cx + (rand(i, Math.floor(t * 12)) - 0.5) * 22, y0 = fy - ((t * 50 + i * 9) % 44);
        g.fillRect(x, y0, 1, 4, mix(L.energy, 0xffffff, 0.5));
      }
    }

    // fighters: the one attacking is drawn in front
    const JH = place(FH.pose, sxW(FH.x), FH.face, fy, lookH.size);
    const JM = place(FM.pose, sxW(FM.x), FM.face, fy, lookM.size);
    // a placed rig is planted at h = 0; lift by its height
    const lift = (J, h, s) => { for (const k in J) if (Array.isArray(J[k])) J[k] = [J[k][0], J[k][1] - h * s]; return J; };
    lift(JH, FH.h, lookH.size); lift(JM, FM.h, lookM.size);
    const order = ATTACKS.has(FM.clip.mv) && !ATTACKS.has(FH.clip.mv) ? [['H', JH, FH, lookH], ['M', JM, FM, lookM]] : [['M', JM, FM, lookM], ['H', JH, FH, lookH]];
    for (const [, J, F, L] of order) if (F.alpha > 0) drawFighter(g, J, L, (key % 1000) * 60 + t, { flash: F.flash });

    // fireballs
    for (const p of ev.proj) {
      if (t < p.t0 || t >= p.t1) continue;
      const u = (t - p.t0) / (p.t1 - p.t0);
      const x = p.x0 + (p.x1 - p.x0) * u;
      fireball(g, sxW(x), fy - p.y, p.by === 'H' ? 1 : -1, t, (p.by === 'H' ? lookH : lookM).energy);
    }

    // hit sparks
    for (const e of ev.hits) {
      const d = t - e.t;
      if (d < 0 || d > 0.22) continue;
      const T = e.tgt === 'H' ? FH : FM;
      const x = sxW(T.x) + T.face * 5 * (e.tgt === 'H' ? lookH.size : lookM.size);
      spark(g, x, fy - e.h - T.h, d, e.heavy, e.kind !== 'hit');
    }
    // dust
    for (const e of ev.land) {
      const d = t - e.t;
      if (d < 0 || d > 0.5) continue;
      if (e.x === undefined) e.x = fighterAt(rd, e.f, e.t).x;
      dust(g, sxW(e.x), d, e.big);
    }

    // ---------------------------------------------------------- HUD
    const hpH = lifeH(rd, t, m), hpM = lifeM(rd, t);
    const lagH = lifeH(rd, Math.max(0, t - 0.7), m), lagM = lifeM(rd, Math.max(0, t - 0.7));
    lifeBar(g, 'L', hpH, Math.max(hpH, lagH), t, true);
    lifeBar(g, 'R', hpM, Math.max(hpM, lagM), t);
    koBadge(g, t, hpM < 0.2 || hpH < 0.05);
    caption(g, 'HOUR', 3, 12, 0xf8f0d8);
    caption(g, 'MIN', 157, 12, 0xf8f0d8, { align: 'right' });

    // the clock in the timer's place
    const koT = ev.ko ?? 99;
    const beatenM = !ev.reversed && t > koT + 0.25, beatenH = ev.reversed && t > koT + 0.25;
    const dropIn = (t < 0.3) ? Math.round(-8 * (1 - t / 0.3) ** 2) : 0;
    const X0 = 80 - (DIGIT_W * 2 + 1) - 3, X1 = 80 + 3;
    bigPair(g, f.hh, X0, 13, { grey: beatenH, drop: m === 0 ? dropIn : 0 });
    bigPair(g, f.mm, X1, 13, { grey: beatenM, drop: dropIn });
    // the colon
    const colOn = !(beatenM || beatenH) || Math.floor(t * 4) % 2;
    if (colOn) for (const yy of [18, 24]) { g.fillRect(79, yy, 2, 2, 0x3a0800); g.fillRect(79, yy, 2, 1, 0xffd838); }

    // combo counter
    let combo = null;
    for (const c of ev.combo) if (t >= c.t && t < c.t + 1.1) combo = c;
    if (combo && combo.n >= 2) {
      const s = `${combo.n} HITS`;
      if (combo.by === 'H') caption(g, s, 3, 20, 0xffe060, { font: font5x7 });
      else caption(g, s, 157, 20, 0xffe060, { font: font5x7, align: 'right' });
    }

    // announcer
    for (const tx of ev.text) {
      if (t < tx.t0 || t >= tx.t1) continue;
      const d = t - tx.t0;
      if (tx.k === 'challenger' || tx.k === 'champion') {
        const h = Math.min(1, d / 0.12) * Math.min(1, (tx.t1 - t) / 0.12);
        const bh = Math.round(18 * h);
        g.fillRect(0, 40 - bh / 2, 160, bh, 0x100410, { a: 0.85 });
        if (h > 0.9) {
          g.fillRect(0, 40 - bh / 2, 160, 1, 0xe02818);
          g.fillRect(0, 40 + bh / 2 - 1, 160, 1, 0xe02818);
          const c = Math.floor(d * 10) % 2 ? 0xffe060 : 0xffffff;
          const l1 = tx.k === 'champion' ? 'NEW CHAMPION!' : 'HERE COMES A', l2 = tx.k === 'champion' ? '+ NEW CHALLENGER' : 'NEW CHALLENGER!';
          caption(g, l1, 80, 32, c, { font: font5x7, align: 'center' });
          caption(g, l2, 80, 41, c, { font: font5x7, align: 'center' });
        }
      } else if (tx.k === 'fight') {
        const sc = d < 0.1 ? 2 : 1;
        if (d < 0.6 || Math.floor(d * 8) % 2 === 0) bigWord(g, 'FIGHT!', 80, 42, 'fight', sc);
      } else if (tx.k === 'ko') {
        const sc = d < 0.12 ? 2 : 1;
        if (d > 0.5 || Math.floor(d * 12) % 2 === 0) bigWord(g, 'K.O.', 80, 44, 'ko', sc);
      }
    }
    void font3x5; void hex;
  },
};
