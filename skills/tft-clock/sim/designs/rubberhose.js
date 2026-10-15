// Rubber Hose: a 1930s black-and-white cartoon short, and the four numerals
// are its cast. Each digit is a rubber-hose character whose body is the
// numeral itself (rubberhose-glyphs.js: fat round strokes, open counters),
// with pie-cut eyes on its head stroke, noodle arms in white gloves and
// noodle legs in big shoes, all kept outside the counters. They stand in a
// chorus line on a little stage, hours left and minutes right of a
// gramophone that plays the beat.
//
// The time is never still: two beats a second, and on every beat each body
// bobs, squashes and stretches (on its shoes, legs bowing like hoses),
// sways and leans with its own swing, taps a foot, pumps its arms; the eyes
// follow the Fleischer bouncing ball, which hops head to head across the
// strip (and off the gramophone horn), squashing whoever it lands on. Notes
// puff out of the horn on the beat. Every 12 s a gag: a tap break, a heel
// click in the air, a big note that flies across the strip and makes each
// digit duck in turn, a rain cloud over one digit (it shivers). The film is
// alive too: gate weave of the scenery, dust specks, the odd scratch, and an
// iris that rounds the corners.
//
// Minute turn: every changing digit takes a bow, its legs wind up into a
// running wheel, and it zips off right (speed lines, puffs), leaving a dust
// cloud in its own shape that thins away evenly by a fixed pixel rank; it
// is gone by :59.5. After :00 the new digit springs out of a POOF, small to
// full size (never a partial shape), arms up, landing on the beat.
// Changing digits always lie to the right of steady ones, so a digit that
// zips right only ever crosses digits that are leaving too.
// Hour: the chorus line kicks in sync while the cartoon iris closes on
// centre stage. The iris is done the 1-bit way: outside it the picture is
// in negative, so the time reads throughout (cream on ink); it closes to a
// point, and opens again on the next set (morning farm with a windmill, the
// town by day, the night town under the man in the moon).
//
// Pair: ink #141210 on film cream #efe6cf, the black and the warm white of
// an old nitrate print, the only two tones the rubber-hose era drew in. Grey
// exists only as dither (the night sky), hatching (the rain cloud) and the
// dust stipple. Night dims the backlight only.
//
// Cost: bodies are sampled from 10 small distance fields (14 KB flash) with
// a bilinear lookup per pixel of each digit's box; everything else is hard
// kit shapes and sprites. No per-minute caches: every frame is built cold.
// RAM: one 25.6 KB scratch frame, used only while the hour's iris reopens.
import { clockFields, hash, sin } from '../js/kit.js';
import { INK, GROUND, INK_C, GROUND_C, PUFF, STAR, NOTES2 } from './rubberhose-art.js';
import { body, character, at } from './rubberhose-cast.js';
import { backdrop, gramophone, notes, setFor, GRAM_X, MOUTH_Y } from './rubberhose-scene.js';
import { perform, gagAt, noteX, SLOT_X, REST_BY, FLOOR, EXIT_T0 } from './rubberhose-dance.js';

const W = 160, H = 80, N = W * H;
const SEQ = [0, 1, -1, 2, 3, 2, -1, 1];        // the bouncing ball: head to head, via the horn
const HEAD_Y = 17.5, HORN_Y = 28.5;
const SCRATCH = new Uint16Array(N);            // the incoming set during the hour's iris

/** Is slot i free to be bonked on beat nn of this minute? */
function ballTarget(nn, mk, hourShow) {
  const t = nn / 2;
  if (hourShow || t >= EXIT_T0 - 0.5 || t < 1.6) return -1;
  const i = SEQ[((nn % 8) + 8) % 8];
  if (i < 0) return -1;
  const gag = gagAt(mk, t);
  if (gag && gag.slot === i && gag.kind !== 'note') return -1;
  return i;
}
const landing = (i) => (i < 0 ? [GRAM_X + 0.5, HORN_Y] : [SLOT_X[i] + 0.5, HEAD_Y]);

function ball(s, mk, hourShow) {
  const b = s * 2, n = Math.floor(b), p = b - n;
  const i0 = ballTarget(n, mk, hourShow), i1 = ballTarget(n + 1, mk, hourShow);
  const [x0, y0] = landing(i0), [x1, y1] = landing(i1);
  const hgt = 10 + Math.abs(y1 - y0) / 2;
  const e = p * p * (3 - 2 * p) * 0.5 + p * 0.5;
  return { x: x0 + (x1 - x0) * e, y: y0 + (y1 - y0) * p - 4 * hgt * p * (1 - p), p, hit: i0 };
}

const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/**
 * The cartoon iris, done the 1-bit way: everything outside it is drawn in
 * negative (ink and ground swap). At rest it only rounds the corners; at the
 * hour it closes to a point round centre stage and opens again.
 */
function iris(g, r) {
  const buf = g.buf, RC = 10;
  let n = 0;
  for (let y = 0; y < H; y++) {
    let a = 0, b = W;
    const cy = y < RC ? RC - (y + 0.5) : y >= H - RC ? y + 0.5 - (H - RC) : 0;
    if (cy > 0) { const ins = Math.round(RC - Math.sqrt(RC * RC - cy * cy)); a = ins; b = W - ins; }
    if (r < 92) {
      const dy = y + 0.5 - 44;
      if (Math.abs(dy) >= r) { a = W; b = W; }
      else { const hw = Math.sqrt(r * r - dy * dy); a = Math.max(a, Math.round(80 - hw)); b = Math.min(b, Math.round(80 + hw)); }
    }
    if (a > b) a = b;
    const row = y * W;
    for (let x = 0; x < a; x++) buf[row + x] = buf[row + x] === INK ? GROUND : INK;
    for (let x = b; x < W; x++) buf[row + x] = buf[row + x] === INK ? GROUND : INK;
    n += a + W - b;
  }
  g.cost.box += n * 3 + H * 10;
}

/** A puff of smoke: a few overlapping discs in ink outline. */
function cloudPuff(g, x, y, r) {
  if (r < 0.8) return;
  const C = [[0, 0, r], [-r * 0.8, r * 0.3, r * 0.7], [r * 0.8, r * 0.3, r * 0.7]];
  for (const [dx, dy, q] of C) g.fillCircle(x + dx, y + dy, q + 1, INK_C);
  for (const [dx, dy, q] of C) g.fillCircle(x + dx, y + dy, q, GROUND_C);
}

/** The rain cloud of the 'rain' gag over slot i. */
function rainCloud(g, i, t, F) {
  const cx = SLOT_X[i];
  const y = t < 2.9 ? -12 + 20 * sm(t / 0.6) : 8 - 20 * sm((t - 2.9) / 0.6);
  if (y < -10) return;
  const yr = Math.round(y), x = cx - 9;
  g.fillRoundRect(x - 1, yr - 1, 20, 9, 4, INK_C);
  g.fillCircle(cx - 2, yr - 1, 4.5, INK_C);
  g.fillCircle(cx + 4, yr, 3.5, INK_C);
  // hatched belly: a rain cloud is grey, the 1-bit way
  const buf = g.buf;
  for (let yy = Math.max(0, yr + 1); yy < yr + 6; yy++)
    for (let xx = x + 2; xx < x + 16; xx++) if (((xx + yy) & 1) === 0) buf[yy * W + xx] = GROUND;
  g.cost.box += 70 * 3;
  if (t > 0.7 && t < 2.9) {
    for (let j = 0; j < 9; j++) {
      const dx = (hash(j, 3) % 17) - 8, ph = (t * 70 + j * 7) % 16;
      const dy = yr + 8 + ph;
      if (dy < 21) g.fillRect(cx + dx, Math.round(dy), 1, 3, INK_C);
    }
  }
}

/** Film: dust specks and the odd scratch, kept off the cast. */
function film(g, T, boxes) {
  const F = Math.floor(T * 20);
  const clear = (x, y) => {
    for (const [a, b, c, d] of boxes) if (x >= a - 5 && x <= c + 5 && y >= b - 3 && y <= d + 1) return false;
    return true;
  };
  for (let k = 0; k < 2; k++) {
    const h = hash(F, k, 77);
    if (h % 3) continue;
    const x = (h >>> 4) % W, y = (h >>> 12) % H;
    if (!clear(x, y)) continue;
    g.fillRect(x, y, 1 + ((h >>> 20) & 1), 1 + ((h >>> 21) & 1), INK_C);
    if ((h >>> 22) % 4 === 0 && clear(x + 3, y + 2)) { g.pixel(x + 1, y + 1, INK_C); g.pixel(x + 2, y + 2, INK_C); g.pixel(x + 3, y + 2, INK_C); }
  }
  const w = Math.floor(T / 2.5), hw = hash(w, 91);
  if (hw % 3 === 0 && T - w * 2.5 < 0.45) {
    const x = 12 + (hw >>> 3) % 136 + (Math.floor(T * 30) % 3 === 0 ? 1 : 0);
    const buf = g.buf;
    for (let y = 0; y < H; y++) if ((hash(y >> 2, w) & 7) && clear(x, y)) buf[y * W + x] = INK;
    g.cost.box += H * 2;
  }
}

export default {
  name: 'Rubber Hose',
  blurb: 'A 1930s rubber-hose cartoon: the four numerals are the dancing cast, bouncing on the beat of a gramophone; each minute the old digit dashes off and the new one pops in.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    const T = (ctx.date.getTime() % 86400000) / 1000, F = Math.floor(T * 60);
    const b = s * 2, p = b - Math.floor(b);
    const prv = clockFields(new Date(ctx.date.getTime() - 60000)), nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm, old = prv.hh + prv.mm, nw = nxt.hh + nxt.mm;
    const hourShow = prv.h !== f.h && s < 12;
    const chorus = hourShow && s > 1.4 && s < 10.6 ? s - 1.4 : -1;
    const gag = hourShow ? null : gagAt(mk, s);
    const wk = 3 + (hash(mk, 3) % 45), wink = s >= wk && s < wk + 0.5 && !(gag && gag.kind === 'rain') ? 'wink' : null;

    // ---- the set (two at once while the hour's iris opens on the new one)
    const wy = hash(Math.floor(F / 9), 5) % 4 === 0 ? 1 : 0;
    let r = 92;
    if (hourShow) r = s < 4.6 ? 92 * (1 - sm((s - 2.2) / 2.4)) : s < 5 ? 0 : 92 * sm((s - 5) / 2.6);
    const setNew = setFor(f.h), setOld = hourShow && s < 5 ? setFor(prv.h) : setNew;
    if (hourShow && s >= 5 && r < 92) {
      g.clear(GROUND_C); backdrop(g, setNew, T, p, wy, wink);
      SCRATCH.set(g.buf);
      g.clear(GROUND_C); backdrop(g, setFor(prv.h), T, p, wy, wink);
      for (let y = 0; y < H; y++) {
        const dy = y + 0.5 - 44;
        if (Math.abs(dy) >= r) continue;
        const hw = Math.sqrt(r * r - dy * dy), a = Math.max(0, Math.round(80 - hw)), e = Math.min(W, Math.round(80 + hw));
        for (let x = a; x < e; x++) g.buf[y * W + x] = SCRATCH[y * W + x];
      }
      g.cost.box += N * 2;
    } else { g.clear(GROUND_C); backdrop(g, setOld, T, p, wy, wink); }

    // ---- centre stage: the gramophone and its notes
    gramophone(g, T, p, hourShow);
    notes(g, b, hourShow ? 1 : 2);
    if (gag && gag.kind === 'rain') rainCloud(g, gag.slot, gag.t, F);

    // ---- the cast
    const bl = ball(s, mk, hourShow);
    const acts = [];
    let zipping = false;
    for (let i = 0; i < 4; i++) {
      let job = null, d = +cur[i];
      if (s >= EXIT_T0 && cur[i] !== nw[i]) job = { exit: s - EXIT_T0 };
      else if (s < 2 && old[i] !== cur[i]) job = { enter: s };
      const a = perform(i, s, mk, job, gag, chorus, bl.hit === i);
      if (job && job.exit >= 1.0) zipping = true;
      acts.push({ i, d, a });
    }
    // dust left where a digit dashed off, and the puffs
    for (const { i, d, a } of acts) {
      if (a.dust > 0) { const q = a.dustPose; body(g, d, q.cx, q.by, q.sx, q.sy, q.k, 2, a.dust); }
      if (a.puff !== null && a.puff < 1.2) {
        const t = a.puff, x0 = a.dustPose.cx;
        for (let j = 0; j < 3; j++) {
          const sz = 2 - Math.floor((t + j * 0.15) / 0.4);
          if (sz >= 0) g.blit(PUFF[sz], Math.round(x0 - 10 - j * 6 - t * 6), Math.round(FLOOR - 5 - j - t * 4));
        }
      }
      if (a.poof !== undefined && a.poof < 0.65) {
        const t = a.poof, cx = SLOT_X[i];
        const rr = t < 0.3 ? 7 * sm(t / 0.12) : 7 * (1 - sm((t - 0.3) / 0.35));
        cloudPuff(g, cx, FLOOR - 7, rr);
        if (t < 0.35) for (let k = 0; k < 8; k++) {
          const an = (k * Math.PI) / 4, r0 = rr + 2 + t * 10;
          g.line(Math.round(cx + r0 * Math.cos(an)), Math.round(FLOOR - 7 + r0 * Math.sin(an) * 0.8), Math.round(cx + (r0 + 3) * Math.cos(an)), Math.round(FLOOR - 7 + (r0 + 3) * Math.sin(an) * 0.8), INK_C);
        }
      }
    }
    const shown = acts.filter((q) => q.a.show === 'body');
    for (const { d, a } of shown) { const P = a.pose; body(g, d, P.cx + (a.shiver && F & 1 ? 1 : 0), P.by, P.sx, P.sy, P.k, 0); }
    const boxes = [];
    for (const { i, d, a } of shown) {
      const P = a.pose, cx = P.cx + (a.shiver && F & 1 ? 1 : 0);
      const lookX = a.lookRight || zipping ? 2 : bl.x < cx - 6 ? 0 : bl.x > cx + 6 ? 2 : 1;
      const lookY = a.shiver ? 0 : a.lookRight || zipping ? 1 : bl.y < P.by - 42 ? 0 : 2;
      const blink = a.blink || (hash(mk, i, Math.floor(s * 1.5)) % 5 === 0 && (s * 1.5) % 1 < 0.1) || (bl.hit === i && bl.p < 0.08);
      character(g, { d, cx, by: P.by, sx: P.sx, sy: P.sy, k: P.k }, {
        footL: [Math.round(P.flx), Math.round(P.fly)], footR: [Math.round(P.frx), Math.round(P.fry)], knee: P.knee,
        handL: [P.hlx + (d === 1 ? 1 : 0), P.hly + (d === 1 ? 6 : 0)], handR: [P.hrx - (d === 1 ? 1 : 0), P.hry + (d === 1 ? 6 : 0)], elbow: P.elbow, up: P.up, lookX, lookY, blink, wheel: P.wheel,
      });
      boxes.push([Math.round(cx - 13), Math.round(P.by - 42), Math.round(cx + 13), Math.round(P.by + 2)]);
      if (a.star) g.blit(STAR, a.star[0] - 3, a.star[1] - 3);
      if (a.taps) { const x = Math.round(a.taps === 'L' ? P.flx - 9 : P.frx + 7); g.fillRect(x, FLOOR - 3, 2, 1, INK_C); g.fillRect(x + (a.taps === 'L' ? -1 : 1), FLOOR - 5, 2, 1, INK_C); }
    }
    for (const { a } of acts) if (a.lines) {
      const [xa, xb] = a.lines, by = a.pose.by;
      for (const dy of [30, 19, 8]) if (xb > xa) g.fillRect(xa, Math.round(by - dy), Math.min(W, xb) - xa, 1, INK_C);
    }
    if (gag && gag.kind === 'note') {
      const t = gag.t, x = noteX(t), y = 5 + 2 * sin(t * 8) + (t < 0.6 ? 26 * (1 - sm(t / 0.6)) : 0);
      g.blit(NOTES2, Math.round(x - 10), Math.round(y), { scale: 2 });
    }
    // ---- the bouncing ball
    const squash = bl.p < 0.07 || bl.p > 0.95;
    g.fillEllipse(bl.x, bl.y + (squash ? 1 : 0), squash ? 5.6 : 4.8, squash ? 3.8 : 4.8, GROUND_C);
    g.fillEllipse(bl.x, bl.y + (squash ? 1 : 0), squash ? 4.4 : 3.6, squash ? 2.6 : 3.6, INK_C);
    g.fillRect(Math.round(bl.x - 2), Math.round(bl.y - 2 + (squash ? 1 : 0)), 2, 1, GROUND_C);

    film(g, T, boxes);
    iris(g, r);
  },
};
