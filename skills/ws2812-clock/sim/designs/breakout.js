// Breakout: the 64 x 192 tower is an arcade brick-breaker screen and the
// time is the brick wall. Hours are laid in unbreakable gold bricks, minutes
// in glass, each numeral bricklaid in running bond (breakout-font.js). The
// owner's frog holds the paddle over its head and plays forever: the ball
// ricochets off the numerals (they ring, never break), the paddle's curved
// face sends it on long flights up the tower, and the frog's eyes follow it.
//
// Late in each minute the frog catches the ball and it heats up on the
// paddle. At :00 it launches as a fireball along one swooping path that
// smashes exactly the bricks the old numeral has and the new one lacks, then
// lays the missing ones in its wake (they drop into the course with a
// bounce), and comes home. Missing bricks happen; extra ones never do.
// On the hour the ball splits: one fireball per changing numeral, the wall
// flashes top to bottom and a ROUND banner rolls in.
import * as kit from '../js/kit.js';
import { minute, prepare, pathAt, pathDist, enemyAt, W, H, WALL, PY, PHW, R, DT, HOME } from './breakout-sim.js';
import { img, rect, dot, sprite, makeSprite } from './breakout-gfx.js';
import { drawBanner } from './breakout-banner.js';

// ---- palette (sRGB picks, linear light)
const MAT = [
  { top: kit.hex('#fff2b0'), body: kit.hex('#f2a91a'), low: kit.hex('#9c5600'), glint: kit.hex('#fff6d8') },   // gold
  { top: kit.hex('#dafcff'), body: kit.hex('#1ab8f0'), low: kit.hex('#0b5aa0'), glint: kit.hex('#ffffff') },   // glass
];
const WHITE = [1, 1, 1], BALL_TRAIL = kit.hex('#86a4ff'), FIRE = kit.hex('#ff8a1e'), FIRE_HOT = kit.hex('#fff0a0'), EMBER = kit.hex('#ff3c10');
const PIPE = kit.hex('#4a5a80'), PIPE_HI = kit.hex('#8fa6d8'), JOINT = kit.hex('#28d8c8');
const SILVER = [kit.hex('#eef4ff'), kit.hex('#98a6c4'), kit.hex('#44506c')], CAP = kit.hex('#ff2c3c');

// ---- the frog: rainbow bands, arms up holding the paddle, eyes drawn live
const EYE_L = [5.5, 4.5], EYE_R = [14.5, 4.5], EYE_R2 = 4.4;
const FROG = makeSprite([
  'A..................A',
  'A..................A',
  'A..................A',
  'A..................A',
  'A.R..............R.A',
  'A.RR............RR.A',
  'A.RRR..........RRR.A',
  'A.RRRR........RRRR.A',
  'A.RRRRRRRRRRRRRRRR.A',
  'A.OOOOOOOOOOOOOOOO.A',
  'AAOOkOOOOOOOOOOkOOAA',
  '..YYYkkYYYYYYkkYYY..',
  '..YYYYYkkkkkkYYYYY..',
  '.GGGGGGGGGGGGGGGGGG.',
  'GGGGGGGGGGGGGGGGGGGG',
  'BBBBBBBBBBBBBBBBBBBB',
  'BBBBBBBBBBBBBBBBBBBB',
  '.VVVVVVVVVVVVVVVVVV.',
  '..VVVVVVVVVVVVVVVV..',
], {
  A: kit.hex('#34e060'), R: kit.hex('#ff2a2a'), O: kit.hex('#ff8418'), Y: kit.hex('#ffe020'),
  G: kit.hex('#2ee05a'), B: kit.hex('#2a86ff'), V: kit.hex('#a24cff'),
}, (i, j) => Math.hypot(i + 0.5 - EYE_L[0], j + 0.5 - EYE_L[1]) > EYE_R2 + 0.3 && Math.hypot(i + 0.5 - EYE_R[0], j + 0.5 - EYE_R[1]) > EYE_R2 + 0.3);
const FOOT = kit.hex('#34e060'), SCLERA = kit.hex('#fff2d0');

function drawEye(cx, cy, lx, ly, blink, a) {
  // white rim, pale lens, black pupil that looks toward (lx, ly)
  const d = Math.hypot(lx - cx, ly - cy) || 1, k = Math.min(1.5, d / 8);
  const pxx = cx + (lx - cx) / d * k, pyy = cy + (ly - cy) / d * k;
  const x0 = Math.floor(cx - 5), y0 = Math.floor(cy - 5);
  for (let y = y0; y <= y0 + 10; y++) for (let x = x0; x <= x0 + 10; x++) {
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    const r = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    let c = null, f = 0;
    if (r <= EYE_R2 && r > EYE_R2 - 1) { c = WHITE; f = 1; }
    else if (r <= EYE_R2 - 1) {
      const lid = Math.abs(y + 0.5 - cy) > (1 - blink) * 3.4;
      const pr = Math.hypot(x + 0.5 - pxx, y + 0.5 - pyy);
      if (lid) { c = FOOT; f = 0.8; }
      else { c = SCLERA; f = 0.3 * kit.smoothstep(1.3, 2.1, pr); }
    }
    if (c) { const o = 3 * (y * W + x); img[o] += c[0] * f * a; img[o + 1] += c[1] * f * a; img[o + 2] += c[2] * f * a; }
  }
}

function drawFrog(px, bob, lx, ly, t, walk) {
  const x0 = px - 10, y0 = PY + 3 + bob;
  sprite(FROG.spr, FROG.sw, FROG.sh, x0, y0);
  const bl = kit.fract(t / 4.3) > 0.965 ? 1 : 0;
  drawEye(x0 + EYE_L[0], y0 + EYE_L[1], lx, ly, bl, 1);
  drawEye(x0 + EYE_R[0], y0 + EYE_R[1], lx, ly, bl, 1);
  // feet step as the frog shuffles along
  const s = Math.sin(walk);
  rect(x0 + 1, y0 + 19 - Math.max(0, s) * 1.2, x0 + 7, y0 + 20.5 - Math.max(0, s) * 1.2, FOOT, 0.9);
  rect(x0 + 13, y0 + 19 - Math.max(0, -s) * 1.2, x0 + 19, y0 + 20.5 - Math.max(0, -s) * 1.2, FOOT, 0.9);
}

function drawPaddle(px, flash) {
  const x0 = px - PHW, x1 = px + PHW;
  rect(x0 + 1, PY, x1 - 1, PY + 1, SILVER[0], 0.85 + 0.15 * flash);
  rect(x0, PY + 1, x1, PY + 2, SILVER[1]);
  rect(x0 + 0.5, PY + 2, x1 - 0.5, PY + 3, SILVER[2]);
  rect(x0, PY + 0.6, x0 + 3, PY + 2.6, CAP); rect(x1 - 3, PY + 0.6, x1, PY + 2.6, CAP);
  if (flash > 0.01) rect(x0 + 2, PY - 1, x1 - 2, PY, WHITE, 0.5 * flash);
}

function drawPipes(t) {
  const sh = 0.85 + 0.15 * Math.sin(t * 0.7);
  rect(0, 0, 1, H, PIPE, 0.8 * sh); rect(1, 2, 2, H, PIPE_HI, 0.45 * sh);
  rect(W - 1, 0, W, H, PIPE, 0.8 * sh); rect(W - 2, 2, W - 1, H, PIPE_HI, 0.3 * sh);
  rect(1, 0, W - 1, 1, PIPE, 0.8 * sh); rect(2, 1, W - 2, 2, PIPE_HI, 0.4 * sh);
  for (let y = 24; y < H; y += 32) {
    rect(0, y, 2, y + 3, JOINT, 0.6); rect(W - 2, y, W, y + 3, JOINT, 0.6);
  }
}

/** The two ceiling hatches: they slide open as a molecule comes through. */
function drawHatches(m, age) {
  for (const hx of [17.5, 49.5]) {
    let open = 0;
    for (const e of m.enemies) if (e.hx === hx) open = Math.max(open, kit.smoothstep(-0.8, -0.2, age - e.ts) * (1 - kit.smoothstep(0.6, 1.2, age - e.ts)));
    const g = 2.5 * open;
    rect(hx - 4, 0, hx - g, 2, JOINT, 0.7); rect(hx + g, 0, hx + 4, 2, JOINT, 0.7);
    if (open > 0.01) rect(hx - g, 0, hx + g, 2, ENEMY[0], 0.4 * open);
  }
}

const ENEMY = [kit.hex('#ff3cc8'), kit.hex('#5cff7a'), kit.hex('#ffd23c')];
/** A molecule: three spheres turning about each other, with a bright core. */
function drawEnemy(e, age, m) {
  const tk = m.kill.get(e) ?? e.tEnd, t = Math.min(age, tk);
  if (age < e.ts) return;
  const [x, y] = enemyAt(e, t), c = ENEMY[e.kind];
  if (age < tk) {
    const a0 = age * 2.6 + e.ph, ap = kit.clamp((age - e.ts) / 0.5);
    for (let k = 0; k < 3; k++) {
      const an = a0 + k * 2.094, z = Math.sin(an);
      dot(x + 0.5 + Math.cos(an) * 2.6, y + 0.5 + z * 1.2, 1.9, c, ap * (0.65 + 0.35 * z));
    }
    dot(x + 0.5, y + 0.5, 1.4, WHITE, 0.6 * ap);
  } else {
    const u = (age - tk) / 0.55;
    if (u > 1) return;
    dot(x + 0.5, y + 0.5, 3 + 6 * u, c, 0.7 * (1 - u) * (1 - u));
    for (let k = 0; k < 8; k++) {
      const an = k * 0.785 + e.ph, r = 2 + 11 * kit.ease.out(u);
      dot(x + 0.5 + Math.cos(an) * r, y + 0.5 + Math.sin(an) * r, 1.1, k & 1 ? WHITE : c, 0.9 * (1 - u));
    }
  }
}

const CAPS = [kit.hex('#ff8a1e'), kit.hex('#2a86ff'), kit.hex('#2ee05a'), kit.hex('#ff2a3a'), kit.hex('#c060ff')];
/** A power-up capsule tumbling down: a pill with a band of light rolling round it. */
function drawCapsule(c, age) {
  if (age < c.t) return;
  const col = CAPS[c.kind];
  if (age < c.ta || !c.got) {
    const y = c.y + 26 * (age - c.t);
    if (y > H + 3) return;
    const x = c.x + 0.5, a = kit.clamp((age - c.t) / 0.3);
    rect(x - 3, y - 1, x + 3, y + 2, col, 0.8 * a);
    rect(x - 2, y - 1.5, x + 2, y - 0.5, WHITE, 0.35 * a);
    const roll = kit.fract((age - c.t) * 2.2);
    rect(x - 3, y - 1 + roll * 3, x + 3, y + roll * 3, WHITE, 0.45 * a * Math.sin(roll * Math.PI));
  } else {
    const u = (age - c.ta) / 0.5;
    if (u < 1) for (let k = 0; k < 6; k++) dot(c.x + 0.5 + (k - 2.5) * 3.5 * u, PY - 2 - 8 * u * (1 - 0.3 * (k & 1)), 1.2, k & 1 ? WHITE : col, 1 - u);
  }
}

function drawBrick(b, dy, k, flash, glint, cold = 0, hot = 0) {
  const C = MAT[b.mat], x0 = b.x, x1 = b.x + b.w - 1, y = b.y + dy, l = 0.72 + 0.6 * cold;
  rect(x0, y, x1, y + 1, C.top, k * (0.6 + 0.5 * glint + 0.5 * cold));
  rect(x0, y + 1, x1, y + 2, C.body, k * l);
  rect(x0, y + 2, x1, y + 3, C.low, k * l);
  if (hot > 0.02) rect(x0, y, x1, y + 3, FIRE, k * 0.7 * Math.min(1, hot));
  rect(x0, y, x0 + 1, y + 1, C.glint, k * (b.mat ? 0.6 : 0.25));
  if (flash > 0.003) rect(x0, y, x1, y + 3, WHITE, flash * 0.8);
}

/** Shards of a smashed brick, closed form from the smash time. */
function drawShards(b, ts, age, M) {
  const tau = age - ts;
  if (tau < 0 || tau > 1.6) return;
  const C = MAT[b.mat], fade = (1 - tau / 1.6) ** 1.5;
  if (tau < 0.15) dot(b.cx + 0.5, b.cy + 0.5, 5, WHITE, (1 - tau / 0.15) * 0.9);
  for (let j = 0; j < 4; j++) {
    const h1 = kit.hash(M, b.key + b.slot * 977, j), h2 = kit.hash(j, b.key, M + 5);
    const ang = -Math.PI / 2 + (h1 - 0.5) * 2.6, sp = 25 + 55 * h2;
    const x = b.cx + 0.5 + (h1 - 0.5) * 4 + Math.cos(ang) * sp * tau;
    const y = b.cy + 0.5 + Math.sin(ang) * sp * tau + 75 * tau * tau;
    dot(x, y, 1.5, j & 1 ? C.top : C.body, fade);
  }
}

function drawBall(x, y, heat, a = 1) {
  const core = kit.mix(WHITE, FIRE_HOT, heat);
  dot(x, y, 4.5 + 3 * heat, heat > 0 ? FIRE : BALL_TRAIL, (0.12 + 0.25 * heat) * a);
  dot(x, y, 2.7, core, a);
}

export default {
  name: 'Breakout',
  blurb: 'brick-breaker tower: the time is the brick wall; the frog\'s fireball smashes and re-lays it each minute',
  layouts: ['hub-tall3'], look: 'smoke', fps: 60, brightness: 0.35, dither: false,
  frame(ctx) {
    const ms = ctx.date.getTime(), M = Math.floor(ms / 60000), age = (ms - M * 60000) / 1000;
    const t = ms / 1000;
    const m = minute(M);
    if (age > 45) prepare(M + 1);   // plan the next minute a rally per frame, well ahead
    img.fill(0);
    drawPipes(t);
    drawHatches(m, age);

    for (const e of m.enemies) drawEnemy(e, age, m);
    for (const c of m.capsules) drawCapsule(c, age);

    // ---------------------------------------------------- ball(s), paddle
    let px = HOME, lx = HOME, ly = 100, padFlash = 0;
    const lights = [];
    if (age < m.T0) {
      // the turn: fireball(s) on their paths
      const last = Math.max(...m.paths.map((p) => p.t0 + p.D));
      m.paths.forEach((p) => {
        const st = [p.sp.xs[0], p.sp.ys[0]];
        let x, y, heat = 1, a = 1;
        if (age < p.t0) { const u = kit.ease.inOut(kit.clamp(age / Math.max(0.01, p.t0))); x = kit.lerp(HOME, st[0], u); y = st[1]; }
        else if (age <= p.t0 + p.D) {
          [x, y] = pathAt(p, pathDist(p, age));
          for (let k = 24; k >= 1; k--) {
            const ta = age - k * 0.014;
            if (ta < p.t0) continue;
            const [qx, qy] = pathAt(p, pathDist(p, ta)), f = 1 - k / 25;
            dot(qx + 0.5, qy + 0.5, 1.2 + 1.8 * f, kit.mix(EMBER, FIRE, f), 0.55 * f * f);
          }
        } else {
          const u = kit.ease.inOut(kit.clamp((age - p.t0 - p.D) / Math.max(0.05, m.T0 - 0.15 - (p.t0 + p.D))));
          x = kit.lerp(st[0], HOME + 2, u); y = st[1];
          heat = 1 - kit.clamp((age - last) / (m.T0 - last));
        }
        drawBall(x + 0.5, y + 0.5, heat, a);
        lights.push([x, y, heat]);
      });
      lx = m.paths.length ? pathAt(m.paths[0], pathDist(m.paths[0], age))[0] : HOME;
      ly = m.paths.length ? pathAt(m.paths[0], pathDist(m.paths[0], age))[1] : 100;
    } else if (age < m.caught) {
      const f = (age - m.T0) / DT, i = Math.min(m.n - 2, Math.floor(f)), u = f - i;
      const x = kit.lerp(m.bx[i], m.bx[i + 1], u), y = kit.lerp(m.by[i], m.by[i + 1], u);
      px = kit.lerp(m.px[i], m.px[i + 1], u);
      for (let k = 12; k >= 1; k--) {
        const j = i - k * 2;
        if (j < 0) continue;
        const ff = 1 - k / 13;
        dot(m.bx[j] + 0.5, m.by[j] + 0.5, 1.0 + 1.3 * ff, BALL_TRAIL, 0.6 * ff * ff);
      }
      drawBall(x + 0.5, y + 0.5, 0);
      lights.push([x, y, 0]);
      lx = x; ly = y;
      for (const tp of m.pads) { const d = age - tp; if (d >= 0 && d < 0.4) padFlash = Math.max(padFlash, Math.exp(-d * 10)); }
    } else {
      // caught: the paddle walks home and the ball heats up on it
      const g = kit.ease.inOut(kit.clamp((age - m.caught) / Math.max(0.6, Math.min(1.6, 59.7 - m.caught))));
      px = kit.lerp(m.xc, HOME, g);
      const x = px + kit.lerp(m.off, 2, g), y = PY - R, heat = kit.smoothstep(57.2, 59.9, age);
      drawBall(x + 0.5, y + 0.5, heat);
      lights.push([x, y, heat]);
      for (let j = 0; j < 6; j++) {
        const ph = kit.fract(age * 1.2 + j / 6), rr = 9 * (1 - ph), an = j * 1.047 + age * 3;
        dot(x + 0.5 + Math.cos(an) * rr, y + 0.5 + Math.sin(an) * rr * 0.6, 0.9, FIRE_HOT, heat * ph * 0.8);
      }
      lx = x; ly = y - 30 * heat;
      const tp = m.caught, d = age - tp; if (d >= 0 && d < 0.4) padFlash = Math.exp(-d * 10);
    }
    for (const c of m.capsules) { const d = age - c.ta; if (c.got && d >= 0 && d < 0.6) padFlash = Math.max(padFlash, 1 - d / 0.6); }
    let bob = 0.35 * Math.sin(t * 2.1);
    for (const tp of m.pads) { const d = age - tp; if (d >= 0 && d < 0.5) bob += 1.2 * Math.sin(d * 12) * Math.exp(-d * 8); }
    drawPaddle(px, padFlash);
    drawFrog(px, bob, lx, ly, t, px * 0.55);

    // ---------------------------------------------------- the brick wall
    const hits = new Float32Array(m.bricks.length);
    for (const [th, bi] of m.hits) { const d = age - th; if (d >= 0 && d < 0.6) hits[bi] = Math.max(hits[bi], Math.exp(-d * 9)); }
    const hourWave = m.hour ? (b) => { const d = age - 0.1 - b.y / 260; return d > -0.3 && d < 0.6 ? Math.exp(-d * d * 60) : 0; } : () => 0;
    const glintOf = (b) => { const g = kit.fract((b.x * 0.6 + b.y * 0.35 - t * 22) / 90); return Math.exp(-((g - 0.5) ** 2) * 300); };
    // the ball is the only lamp in the cabinet: bricks near it catch its light
    const lightOf = (b) => {
      let cold = 0, hot = 0;
      for (const [x, y, h] of lights) {
        const d2 = (b.cx - x) ** 2 + (b.cy - y) ** 2, f = 1 / (1 + d2 / 140);
        cold += f * (1 - h); hot += f * h;
      }
      return [cold, hot];
    };
    m.bricks.forEach((b, i) => {
      let dy = 0, k = 1, fl = hits[i] + hourWave(b);
      if (b.isNew) {
        const tl = m.layT.get(b.slot * 10000 + b.key);
        if (tl === undefined || age < tl) return;
        const u = kit.clamp((age - tl) / 0.45);
        dy = -3.5 * (1 - kit.ease.outBack(u));
        k = kit.clamp(0.35 + u * 3);
        fl += 0.7 * Math.max(0, 1 - u * 1.8);
      }
      drawBrick(b, dy, k, fl, glintOf(b), ...lightOf(b));
    });
    for (const e of m.events) {
      if (e.kind !== 'smash') continue;
      if (age < e.t) {
        // doomed, still standing: it warms as the fireball nears
        const warm = kit.clamp(1 - (e.t - age) / 0.5);
        drawBrick(e.br, 0, 1, 0, glintOf(e.br), ...lightOf(e.br));
        if (warm > 0) rect(e.br.x, e.br.y, e.br.x + e.br.w - 1, e.br.y + 3, FIRE, 0.6 * warm);
      } else drawShards(e.br, e.t, age, M);
    }
    for (const e of m.events) if (e.kind === 'lay') { const u = (age - e.t) / 0.3; if (u > 0 && u < 1) dot(e.br.cx + 0.5, e.br.cy + 0.5, 3.2, FIRE_HOT, 0.45 * (1 - u)); }

    if (m.hour) drawBanner(age, m.now.slice(0, 2));

    const dim = 1 - 0.6 * ctx.night;
    kit.blitGrid(ctx, img, dim);
  },
};
