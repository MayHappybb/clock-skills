// Cats: a flat woodblock print after Kuniyoshi, who drew cats twisted into
// the letters of fish names. Here the four numerals are four cats sitting
// along an Edo roof ridge that runs down the strip at an angle: each body IS
// the numeral's stroke (a 6 px coat in a 1 px sumi keyline, cats-glyphs.js),
// its head is the numeral's ball terminal (a 13 x 11 pixel sprite with big
// ears, cats-art.js), and its tail hangs down over the eave. Ten cats, ten
// coats: calico, ginger, tabby, hachiware.
//
// At rest the time is never still. Twice a second a hop rolls through the
// four from left to right: each cat springs 3 px, stretched in the air and
// squashed on landing, its head nodding; all four sway in a slow shear, tails
// swing and flick on the beat, ears twitch, eyes blink and follow the yarn
// ball, which the two middle cats bump back and forth across the gap once a
// second (a shove of the whole body); flat cast shadows on the ridge cap
// tighten as they leave it. Kasumi mist drifts behind them; a glint runs along
// the ridge cap every 10 s. Every 14 s a flourish: the ball hops from head to
// head as the cats head it, a red dragonfly flits in and one cat pounces at
// it, or a yawn goes round the four.
//
// Minute turn: the old cat yawns and stretches, curls up small on its seat
// into a ball (its ears and tail round the rim) and rolls off down the roof
// behind the others; the new cat, already curled, drops from a higher roof
// into the empty seat before :00 and unfurls into its numeral after it, then
// shakes itself off. The old numeral only ever shrinks (never a part of it),
// the new one only grows. Hour: a mouse runs the ridge and the cats pounce
// after it one by one; then fireworks open in the sky behind them and every
// cat starts at each bang; when the hour brings a new sky (dawn, day, dusk,
// evening, night) it sweeps in from the left behind them.
//
// Palette: the print's own: sumi keyline, washi-cream coat, persimmon orange
// and blue-grey markings, yellow-green eyes, pink noses; one flat sky per time
// of day (aizome blue, persimmon dusk, Prussian indigo night) with an
// ichimonji band printed across its top and mist bands in a near tone, slate
// tiles. The cats are the only light, warm, keylined shapes on the glass, so
// the time is the strongest contrast in every sky. Night dims the backlight
// and uses the indigo sky. Hard pixels throughout (a print is flat).
//
// Cost: bodies are sampled from ten 32 x 48 distance fields (Int8) with their
// coat markings (Uint8), 30 KB of flash; the roof is a 12.8 KB material map;
// head sprites are built from 13 x 11 pictures. Everything is closed form in
// the time; no per-minute caches. RAM: one 25.6 KB scratch frame, used only
// while a new sky sweeps in at the hour.
import { clockFields, hash, sin, cos, to565, progress, ease } from '../js/kit.js';
import { GH, M, SW, SH, SDF, COAT, CAST } from './cats-glyphs.js';
import { SUMI, CREAM, ORANGE, GREY, EYE, PINK, SKIES, skyFor, HEADS, headSprite } from './cats-art.js';
import { floorY, backdrop, yarn, BALL_R, dragonfly, mouse, hanabi } from './cats-scene.js';

const W = 160, H = 80;
const SLOT_X = [7, 35, 89, 118];
const SCRATCH = new Uint16Array(W * H);     // the old sky while a new one sweeps in (25.6 KB, the hour only)
const BASE = SLOT_X.map((x) => Math.round(floorY(x + 12)));
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const frac = (x) => x - Math.floor(x);

// ------------------------------------------------------------ per-digit tables (flash)

// left and right edge of the coat at the ball's height (glyph row 33): where the ball turns back
const EDGE_L = [], EDGE_R = [];
for (let d = 0; d < 10; d++) {
  const row = (33 + M) * SW;
  let a = SW, b = -1;
  for (let i = 0; i < SW; i++) if (SDF[d][row + i] <= 0) { a = Math.min(a, i); b = Math.max(b, i); }
  EDGE_L.push(a - M); EDGE_R.push(b - M + 1);
}
// ------------------------------------------------------------ drawing a cat

const SPR = new Map();
function headFor(coat, eyes, ears, mouth, pal) {
  const k = `${coat}/${eyes}/${ears}/${mouth}/${pal.id}`;
  let s = SPR.get(k);
  if (!s) {
    const sp = headSprite(HEADS[`${coat}/${eyes}/${ears}/${mouth}`], coat, pal);
    s = { w: sp.w, h: sp.h, data: Uint16Array.from(sp.data, (v) => (v < 0 ? 0 : to565(v))), mask: Uint8Array.from(sp.data, (v) => (v < 0 ? 0 : 1)) };
    SPR.set(k, s);
  }
  return s;
}

/**
 * One cat: the body sampled from its distance field under the pose
 * (a uniform scale `sc` and a squash `sy` about the middle of its seat, a
 * lean that shears the rows, a lift `dy`), hard pixels; then its head
 * sprite at the same scale.
 */
function drawCat(g, d, x0, base, P, C) {
  const f = SDF[d], c = COAT[d], buf = g.buf, sc = P.sc, sxf = sc, syf = P.sy * sc, seat = base + P.dy, px0 = x0 + 12;
  if (sc <= 0.05) return;
  const kl = 9 / sc;                                         // the keyline stays one screen pixel at any scale
  const yA = Math.max(0, Math.floor(seat - (GH + M) * syf)), yB = Math.min(H, Math.ceil(seat + M * syf));
  const half = (12 + M) * sxf + 4;
  let n = 0;
  for (let y = yA; y < yB; y++) {
    const gj = GH - (seat - (y + 0.5)) / syf + M - 0.5;
    if (gj < 0 || gj >= SH - 1) continue;
    const j = gj | 0, fy = gj - j, row = j * SW, rowN = fy < 0.5 ? row : row + SW;
    const sh = Math.round((P.lean * (seat - y)) / GH);
    const xa = Math.max(0, Math.floor(px0 + sh - half)), xb = Math.min(W, Math.ceil(px0 + sh + half));
    for (let x = xa; x < xb; x++) {
      const gi = 12 + (x + 0.5 - px0 - sh) / sxf + M - 0.5;
      if (gi < 0 || gi >= SW - 1) continue;
      const i = gi | 0, fx = gi - i, k = row + i;
      const top = f[k] + (f[k + 1] - f[k]) * fx, bot = f[k + SW] + (f[k + SW + 1] - f[k + SW]) * fx;
      const v = top + (bot - top) * fy;
      n++;
      if (v > kl) continue;
      buf[y * W + x] = v <= 0 ? C[c[rowN + (fx < 0.5 ? i : i + 1)]] : C[4];
    }
  }
  g.cost.box += n * 12;
  // the head rides the body's top
  const cast = CAST[d];
  const hy = seat - (GH - cast.head[1]) * syf + P.hdy * sc;
  const hx = px0 + (cast.head[0] - 12) * sxf + Math.round((P.lean * (GH - cast.head[1]) * syf) / GH);
  const s = headFor(cast.coat, P.eyes, P.ears, P.mouth, C.pal);
  const w = Math.max(1, Math.round(s.w * sc)), h = Math.max(1, Math.round(s.h * sc));
  const bx = Math.round(hx - w / 2), by = Math.round(hy - (5.5 * h) / s.h);
  for (let j = 0; j < h; j++) {
    const y = by + j;
    if (y < 0 || y >= H) continue;
    const sj = sc >= 1 ? j : Math.min(s.h - 1, ((j + 0.5) * s.h / h) | 0);
    for (let i = 0; i < w; i++) {
      const x = bx + i;
      if (x < 0 || x >= W) continue;
      const k = sj * s.w + (sc >= 1 ? i : Math.min(s.w - 1, ((i + 0.5) * s.w / w) | 0));
      if (s.mask[k]) buf[y * W + x] = s.data[k];
    }
  }
  g.cost.blit += w * h;
}

/** The tail hangs over the eave and swings; its tip hooks and flicks. `len` 0..1. */
function tail(g, d, x0, base, P, s, i, C, len) {
  if (len <= 0.05 || P.sc < 0.3) return;
  const cast = CAST[d];
  let x = x0 + 12 + (cast.tail[0] - 12) * P.sc + Math.round((P.lean * (GH - cast.tail[1])) / GH), y = base + P.dy - (GH - cast.tail[1]) * P.sy * P.sc;
  const pts = [[x, y]];
  let a = Math.PI / 2 + 0.34 * sin(s * 2.9 + i * 1.9) + P.tailKick;
  const n = 5, step = 2.5 * len * P.sc;
  for (let k = 1; k <= n; k++) {
    a += cast.curl * (k >= 3 ? 0.32 + 0.22 * sin(s * 5.8 + i) + P.tailKick : 0.03);
    x += step * cos(a); y += step * sin(a);
    pts.push([x, y]);
  }
  g.stroke(pts, 2 + 3 * P.sc, C.pal.sumi);
  g.stroke(pts, 3 * P.sc, C.pal.cream);
  const tip = pts[n];
  if (cast.coat === 'ginger' || cast.coat === 'calico') g.fillCircle(tip[0], tip[1], 1.3, C.pal.orange);
}

// ------------------------------------------------------------ the minute's choreography

const FLOURISH_T = [13, 27, 41], FL_LEN = 4.2, KINDS = ['heads', 'dragonfly', 'yawn'];
function flourishAt(mk, s) {
  for (let k = 0; k < FLOURISH_T.length; k++) {
    const t = s - FLOURISH_T[k];
    if (t >= 0 && t < FL_LEN) return { kind: KINDS[(hash(mk, 9) + k) % 3], t, k };
  }
  return null;
}

// the yarn ball at rest: rolled across the gap, batted back once a second
function ballRest(s, xl, xr) {
  const u = s % 2, dir = u < 1 ? 1 : -1, p = u < 1 ? u : u - 1;
  const e = 1 - (1 - p) * (1 - p);
  const x = dir > 0 ? xl + (xr - xl) * e : xr - (xr - xl) * e;
  return { x, y: floorY(x) - BALL_R - 1 - 3 * sin(Math.PI * Math.min(1, p / 0.45)) * (p < 0.45 ? 1 : 0), bat: u };
}

const HEAD_SEQ = [-1, 1, 0, 1, -1, 2, 3, 2, -1], HOP = 0.45;

export default {
  name: 'Cats',
  blurb: 'A Kuniyoshi woodblock: four cats on an Edo roof ARE the numerals, hopping on the beat; each minute the old cat curls into a ball and rolls away, the new one drops in and unfurls.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    const T = (ctx.date.getTime() % 86400000) / 1000, F = Math.floor(T * 60);
    const skyKey = skyFor(f.h), sky = SKIES[skyKey];
    const pal = { id: skyKey, sumi: SUMI, cream: CREAM, orange: ORANGE, grey: GREY, eye: EYE, pink: PINK };
    const C = [to565(CREAM), to565(ORANGE), to565(SUMI), to565(GREY), to565(SUMI)];
    C.pal = pal;

    const prv = clockFields(new Date(ctx.date.getTime() - 60000)), nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm, old = prv.hh + prv.mm, nw = nxt.hh + nxt.mm;

    // ---- the jobs: which slots are leaving (before :00) or arriving (after)
    const leave = [0, 1, 2, 3].map((i) => s >= 56 && cur[i] !== nw[i]);
    const arrive = [0, 1, 2, 3].map((i) => s < 3 && cur[i] !== old[i]);
    const turning = leave.some(Boolean) || arrive.some(Boolean);
    const fl = turning ? null : flourishAt(mk, s);

    // ---- the hour: a mouse runs the ridge, the cats pounce one after another;
    // then fireworks over the roofs; and a new sky sweeps in if the hour brings one
    const hourShow = prv.h !== f.h && s < 11;
    const glint = s % 10 < 2.2 ? (s % 10) / 2.2 : -1;
    const oldKey = skyFor(prv.h);
    if (hourShow && oldKey !== skyKey && s < 5.5) {
      const front = Math.round(sm((s - 2) / 3.5) * (W + 24)) - 12;
      backdrop(g, SKIES[oldKey], T, glint);
      SCRATCH.set(g.buf);
      backdrop(g, sky, T, glint);
      for (let y = 0; y < H; y++) for (let x = Math.max(0, front); x < W; x++) g.buf[y * W + x] = SCRATCH[y * W + x];
      // the front itself: a soft sumi brush edge
      if (front >= 0 && front < W) g.fillRect(front, 0, 1, Math.round(floorY(front)), SKIES[oldKey].mist);
      g.cost.box += W * H * 2;
    } else backdrop(g, sky, T, glint);
    const BURSTS = [[6.2, 112, 15, 0xf8d468], [7.1, 50, 9, 0xe8503a], [7.9, 146, 9, 0xf4f0e0]];
    let bang = -1;
    if (hourShow) for (const [t0, bx, by, c] of BURSTS) {
      const tau = s - t0;
      if (tau > 0 && tau < 2.6) hanabi(g, bx, by, tau, c, Math.round(t0 * 10));
      if (tau > 0 && tau < 0.35) bang = tau;
    }
    const mouseT = hourShow ? s - 1.7 : -1, mouseX = -8 + 38 * mouseT;

    // ---- poses
    const poses = [];
    for (let i = 0; i < 4; i++) {
      // the beat: twice a second a hop rolls through the four, left to right,
      // stretched in the air and squashed on landing; and a slow sway
      const ph = frac(2 * s - i * 0.22);
      const air = ph < 0.36 ? sin((Math.PI * ph) / 0.36) : 0;
      const land = ph >= 0.36 && ph < 0.56 ? sin((Math.PI * (ph - 0.36)) / 0.2) : 0;
      poses.push({
        dy: -Math.round(3 * air), hdy: land > 0.5 ? 1 : 0, sy: 1 + 0.04 * air - 0.08 * land, lean: 3 * sin(s * Math.PI + i * 1.1),
        eyes: 'C', ears: 'up', mouth: 'shut', tailKick: 0, sc: 1, tail: 1, nudge: 0, show: true,
      });
    }

    // ---- the ball, and who it is with
    const d1 = +cur[1], d2 = +cur[2];
    const xl = SLOT_X[1] + EDGE_R[d1] + 2 + BALL_R, xr = SLOT_X[2] + EDGE_L[d2] - 2 - BALL_R;
    let ball = ballRest(s, xl, xr), look = ball.x;
    if (!turning) {
      // the ball comes back to a middle cat once a second: it bumps it back
      // with a shove of its whole body (a lean into it and a nudge)
      const u = ball.bat;
      if (u < 0.25) { const q = sin((Math.PI * u) / 0.25); poses[1].lean += 2 * q; poses[1].nudge = Math.round(q); }
      if (u >= 1 && u < 1.25) { const q = sin((Math.PI * (u - 1)) / 0.25); poses[2].lean -= 2 * q; poses[2].nudge = -Math.round(q); }
    } else {
      // during a turn the ball waits in the middle of the gap
      const x = (xl + xr) / 2;
      ball = { x, y: floorY(x) - BALL_R - 1, bat: 0 };
    }

    // ---- the flourish
    let fly = null;
    if (fl && fl.kind === 'heads') {
      // the ball hops head to head: the cats head it like a shuttlecock
      const k = Math.floor(fl.t / HOP), p = fl.t / HOP - k;
      if (k < HEAD_SEQ.length - 1) {
        const at = (j) => (j < 0 ? [ball.x, ball.y] : [SLOT_X[j] + CAST[+cur[j]].head[0], BASE[j] - (GH - CAST[+cur[j]].head[1]) - 6 - BALL_R]);
        const [ax, ay] = at(HEAD_SEQ[k]), [bx, by] = at(HEAD_SEQ[k + 1]);
        ball = { x: ax + (bx - ax) * p, y: ay + (by - ay) * p - 4 * (9 + Math.abs(by - ay) / 2) * p * (1 - p), bat: -1 };
        const hit = HEAD_SEQ[k];
        if (hit >= 0 && p < 0.4) { poses[hit].sy = Math.min(poses[hit].sy, 1 - 0.07 * sin((Math.PI * p) / 0.4)); poses[hit].eyes = 'shut'; }
      }
    } else if (fl && fl.kind === 'dragonfly') {
      const j = hash(mk, fl.k, 4) % 4, t = fl.t;
      const hx = SLOT_X[j] + 12, hy = Math.max(3, BASE[j] - GH - 9);
      let x, y;
      if (t < 1.8) { const e = ease.inOutQuad(t / 1.8); x = 168 + (hx - 168) * e + 6 * sin(t * 7); y = 4 + (hy - 4) * e + 2 * sin(t * 11); }
      else if (t < 2.3) { x = hx + sin(t * 23); y = hy + cos(t * 17); }
      else { const e = ease.inQuad((t - 2.3) / 1.9); x = hx + (-14 - hx) * e; y = hy - (hy + 6) * e + 3 * sin(t * 9); }
      fly = { x, y, left: t < 2.3 };
      look = x;
      const tp = t - 2.15;
      if (tp > 0 && tp < 0.6) {
        poses[j].dy -= Math.round(6 * sin((Math.PI * tp) / 0.6));
        poses[j].sy = 1 + 0.06 * sin((Math.PI * tp) / 0.6);
        poses[j].ears = 'B';
      }
    } else if (fl && fl.kind === 'yawn') {
      for (let i = 0; i < 4; i++) {
        const t = fl.t - i * 0.55;
        if (t > 0 && t < 1.5) {
          poses[i].sy = 1 + 0.06 * sin((Math.PI * t) / 1.5);
          if (t > 0.25 && t < 1.25) { poses[i].mouth = 'open'; poses[i].eyes = 'shut'; poses[i].ears = t > 0.5 && t < 1 ? 'B' : 'up'; }
        }
      }
    }

    if (hourShow) {
      for (let i = 0; i < 4; i++) {
        const P = poses[i], cx = SLOT_X[i] + 12;
        const tau = mouseT - ((cx + 8) / 38 - 0.3);
        if (tau > 0 && tau < 0.62) {
          const q = sin((Math.PI * tau) / 0.62);
          P.dy = -Math.round(8 * q); P.sy = 1 + 0.07 * q; P.ears = 'B'; P.lean = 3 * q;
        }
        if (bang >= 0) { P.dy = Math.min(P.dy, -Math.round(3 * sin((Math.PI * bang) / 0.35))); P.ears = 'B'; }
      }
      if (mouseT > 0 && mouseX < W + 10) look = mouseX;
      else if (s > 6) look = SLOT_X[0] - 100;       // all watching the sky: eyes front
    }

    // ---- the turn: the old cat yawns, curls up into a ball and rolls away
    // down the roof; the new one, curled, leaps in and unfurls after :00
    const balls = [];
    for (let i = 0; i < 4; i++) {
      const P = poses[i], cx = SLOT_X[i] + 12;
      if (leave[i]) {
        const t = s;
        if (t > 56.6 && t < 57.8) {                                   // a long yawn and stretch
          const u = (t - 56.6) / 1.2;
          P.sy = 1 + 0.08 * sin(Math.PI * u); P.mouth = u > 0.15 && u < 0.85 ? 'open' : 'shut'; P.eyes = 'shut';
          P.ears = u > 0.3 && u < 0.7 ? 'B' : 'up'; P.dy = 0;
        }
        if (t >= 57.8) { P.eyes = 'shut'; P.ears = 'B'; }
        if (t > 58.1) P.dy = 0;
        const u = progress(t, 58.25, 58.95);
        P.sc = 1 - 0.68 * ease.inOutCubic(u);                        // curls up, small, onto its seat
        P.sy = t > 58.1 ? 1 - 0.1 * sin(Math.PI * progress(t, 58.1, 58.5)) : P.sy;
        const rb = 4.2 * sm((t - 58.75) / 0.3);
        if (t > 59.05) P.show = false;
        if (rb > 0.2) balls.push({ d: +cur[i], x: cx + roll(t - 59.05), y: 0, r: rb, behind: t > 59.05, slot: i });
      }
      if (!leave[i] && s < 3 && cur[i] !== old[i]) {
        // last minute's ball still rolling away
        const t = s + 60 - 59.05;
        const x = cx + roll(t);
        if (x < W + 10) balls.push({ d: +old[i], x, y: 0, r: 4.2, behind: true, slot: i });
      }
      // the newcomer: a curled ball leaping in from the upper left, before :00 ...
      const inTime = leave[i] ? s - 60 : arrive[i] ? s : 99;
      if (inTime > -0.85 && inTime < 0.3) {
        const d = leave[i] ? +nw[i] : +cur[i];
        // it drops from a higher roof, straight down its own column, and bounces once
        const u = progress(inTime, -0.85, -0.08), gy = floorY(cx) - 5.2;
        let x = cx + 5 * (1 - u), y = -9 + (gy + 9) * u * u;
        if (inTime > -0.08) { const b = progress(inTime, -0.08, 0.12); x = cx; y = gy - 2.5 * sin(Math.PI * b); }
        const r = inTime < 0.05 ? 4.2 : 4.2 * (1 - sm((inTime - 0.05) / 0.2));
        if (r > 0.2) balls.push({ d, x, y, r, behind: false, front: true, slot: i, flying: u < 1 });
      }
      // ... and unfurling into its numeral after it
      if (arrive[i]) {
        if (s < 0.02) P.show = false;
        P.sc = s < 0.55 ? 0.32 + 0.74 * ease.outCubic(progress(s, 0.02, 0.45)) - 0.06 * sm((s - 0.4) / 0.15) : 1;
        if (s < 0.6) { P.eyes = 'shut'; P.ears = 'B'; P.dy = 0; P.lean = 0; }
        P.tail = progress(s, 0.3, 0.8);
        if (s > 0.6 && s < 2.2) P.lean += 2.6 * sin((s - 0.6) * 20) * (1 - (s - 0.6) / 1.6);   // shakes itself off
      }
    }
    if (balls.length) look = balls[balls.length - 1].x;

    // ---- blinks, ear flicks, eyes on the thing of interest
    for (let i = 0; i < 4; i++) {
      const P = poses[i], hx = SLOT_X[i] + 12;
      if (P.eyes === 'C') P.eyes = look < hx - 9 ? 'L' : look > hx + 9 ? 'R' : 'C';
      const bk = Math.floor(s / 0.8);
      if (P.eyes !== 'shut' && hash(mk, i, bk) % 5 === 0 && s - bk * 0.8 < 0.12) P.eyes = 'shut';
      const ek = Math.floor(s * 2);
      if (P.ears === 'up' && hash(mk, i + 11, ek) % 6 === 0 && frac(s * 2) < 0.3) P.ears = hash(mk, i, ek) & 1 ? 'L' : 'R';
      // the tail flicks on the beat
      const tb = frac(s + i * 0.25);
      P.tailKick = tb < 0.3 ? 0.25 * sin((Math.PI * tb) / 0.3) : 0;
    }

    // ---- the cast: balls rolling behind, tails, bodies, heads, paws, balls in front
    // flat cast shadows on the ridge cap: they tighten as a cat leaves the ridge
    for (let i = 0; i < 4; i++) {
      const P = poses[i];
      if (!P.show) continue;
      const cx = SLOT_X[i] + 12 + P.nudge, w = 9.5 * P.sc * (1 + 0.07 * P.dy);
      if (w > 1) g.fillEllipse(cx, floorY(cx) + 3, w, 1.4, sky.line);
    }
    for (const b of balls) if (b.behind) curled(g, b, F, pal);
    if (hourShow && mouseT > 0 && mouseX < W + 10) mouse(g, mouseX, floorY(mouseX) + 1, F, false);
    for (let i = 0; i < 4; i++) if (poses[i].show) tail(g, +cur[i], SLOT_X[i] + poses[i].nudge, BASE[i], poses[i], s, i, C, poses[i].tail);
    for (let i = 0; i < 4; i++) if (poses[i].show) drawCat(g, +cur[i], SLOT_X[i] + poses[i].nudge, BASE[i], poses[i], C);
    for (const b of balls) if (!b.behind) curled(g, b, F, pal);

    // ---- the yarn, the dragonfly
    yarn(g, ball.x, ball.y, ball.x / BALL_R, null);
    if (fly) dragonfly(g, fly.x, fly.y, F, fly.left);
  },
};

/** How far a curled cat has rolled down the roof, t s after it set off. */
function roll(t) { return t <= 0 ? 0 : 30 * t + 26 * t * t; }

/** A cat curled into a ball: a coat disc with its ears and tail round the rim, rolling. */
function curled(g, b, F, pal) {
  const { r } = b, coat = CAST[b.d].coat;
  const x = b.x, y = b.y || floorY(b.x) - r - 1;
  const a = b.behind || b.flying ? (b.flying ? F * 0.25 : (b.x - SLOT_X[b.slot] - 12) / r) : 0;
  const ca = cos(a), sa = sin(a);
  // ears: two triangles on the rim
  if (r > 2.5) for (const da of [-0.55, 0.55]) {
    const e = a - Math.PI / 2 + da, ex = cos(e), ey = sin(e);
    const tx = x + ex * (r + 2.6), ty = y + ey * (r + 2.6);
    const b0x = x + cos(e - 0.32) * (r - 0.5), b0y = y + sin(e - 0.32) * (r - 0.5), b1x = x + cos(e + 0.32) * (r - 0.5), b1y = y + sin(e + 0.32) * (r - 0.5);
    g.fillPolygon([[tx + ex, ty + ey], [b0x - ex, b0y - ey], [b1x - ex, b1y - ey]], SUMI);
    g.fillPolygon([[tx - ex * 0.4, ty - ey * 0.4], [b0x, b0y], [b1x, b1y]], CREAM);
  }
  g.fillCircle(x, y, r + 1, SUMI);
  g.fillCircle(x, y, r, CREAM);
  // the coat's patch, and the tail wrapped round
  const pc = coat === 'ginger' || coat === 'calico' ? ORANGE : GREY;
  if (coat !== 'tabby') g.fillCircle(x - ca * r * 0.45, y - sa * r * 0.45, r * 0.5, pc);
  else for (const o of [-0.4, 0.4]) g.thickLine(x + ca * r * o - sa * r * 0.8, y + sa * r * o + ca * r * 0.8, x + ca * r * o + sa * r * 0.8, y + sa * r * o - ca * r * 0.8, 1, GREY);
  if (r > 3) g.arc(x, y, r - 1.6, r - 0.6, a + 0.6, a + 2.6, SUMI);
  void pal;
}
