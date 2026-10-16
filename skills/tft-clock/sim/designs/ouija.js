// Ouija: a talking board by candlelight, and the spirit on it is impatient.
//
// Seen from above, an 1890s board lit by one candle just off the top-left
// corner (ouija-board.js bakes the board and its light). The planchette, a
// mahogany heart with a brass-rimmed glass window, glides on its own. Every
// minute it spells the time out of the row of figures, one figure at a time;
// as its window settles on a figure, a wisp of ectoplasm rises out of the
// glass and condenses above the board into that figure, in the spirit's
// Didone numerals (ouija-ghost.js). So the time hangs in the air as cold,
// wavering smoke, ordered the way it was spelled, while the planchette keeps
// fidgeting: it drifts, re-spells the time to remind you, spells HURRY or
// TICK or BORED out of the letters, darts to YES or NO, drums, circles.
// Near the end of the minute it slides to GOOD BYE and the message is drawn
// back down into the window, gone before :00; after :00 it spells the new
// time. On the hour the candle gutters at the turn, the planchette whirls
// round the board trailing smoke, spells the figures, then the hour's name.
//
// Two lights, two palettes. The candle is warm and flickers: wood ochre to
// umber, brown-black ink, oxblood, wax. The spirit is cold and steady: a
// pale mint core, a teal glow, and an aura that steals the candlelight round
// it (it darkens the board, which is also what keeps the figures legible
// over the printed letters). The board is hard pixels, as printed; what the
// spirit moves (planchette, wisps, figures) is anti-aliased and glides.

import { hex, sin, clamp, progress, ease, noise, rand, rng, from565, R, G, B } from '../js/kit.js';
import { BOARD, SPOT, PRINT, LETTER, CANDLE, lit, W, H } from './ouija-board.js';
import { GLYPHS, GW, GH, PAD, MW, MH, CW, sample } from './ouija-ghost.js';

const CORE = hex('e8fff4'), GLOW = hex('4fd8c6'), AURA = hex('061a1e'), SMOKE = hex('9af0e2');
const MAHOGANY = hex('6c2c16'), RIM = hex('c0703e'), BRASS = hex('d9a64a'), BRASS_DK = hex('6a4a1a');

// ---- the message in the air: four figures and a colon, centred over the arcs
const GY = 8;
const SLOT_X = [37.5, 56.5, 86.5, 105.5], COLON_X = 76.5;
const slotCentre = (k) => [SLOT_X[k] + GW / 2, GY + GH / 2];

// ---- the planchette: a heart, point up, window at the origin
const PS = 0.78;
const HEART = Array.from({ length: 30 }, (_, i) => {
  const t = (i / 30) * Math.PI * 2;
  return [PS * 16 * Math.sin(t) ** 3, PS * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t) - 1)];
});
const LENS_R = 6.4, RIM_R = 7.7;

const WORDS = ['HURRY', 'TICK', 'TOCK', 'WAIT', 'BORED', 'LATE', 'SOON', 'NOW', 'BOO', 'HELLO', 'LISTEN', 'KNOCK', 'AGAIN', 'YAWN', 'HERE', 'WHO'];
const HOUR_NAMES = ['MIDNIGHT', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'NOON'];

// ------------------------------------------------------------ the minute's script
//
// Built from the clock fields alone (cached per minute), so any instant has
// an answer: where the planchette is, what it touched and when.

function buildScript(f) {
  const r = rng(f.minuteKey * 7919 + 17);
  const segs = [], touches = [];
  let t = 0, p = SPOT.BYE, dir = [0, -1];
  const go = (q, dur, bend = (r() - 0.5) * 0.6) => {
    const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy);
    if (l > 0.5) dir = [dx / l, dy / l];
    segs.push({ type: 'go', t0: t, t1: t + dur, a: p, b: q, bend });
    t += dur; p = q;
  };
  const hold = (dur, style = 'still') => { segs.push({ type: 'hold', t0: t, t1: t + dur, p, style, dir }); t += dur; };
  const touch = (target, kind, slot = -1) => touches.push({ t, target, kind, slot });
  const loop = (c, rx, ry, turns, dur) => {
    go([c[0], c[1] + ry], 0.45);
    segs.push({ type: 'loop', t0: t, t1: t + dur, c, rx, ry, turns });
    t += dur;
  };
  const spell = (word, travel, dwell, kind) => {
    for (const ch of word) { go(SPOT[ch], travel); touch(ch, kind); hold(dwell); }
  };
  const digits = f.hh + f.mm;
  const hour = f.m === 0;

  hold(hour ? 0.15 : 0.25);
  if (hour) loop([80, 37], 60, 25, 1, 1.7);                 // the whirl
  for (let k = 0; k < 4; k++) { go(SPOT[digits[k]], 0.42); touch(digits[k], 'spell', k); hold(0.36); }
  hold(0.5, 'still');
  if (hour) {
    const name = f.h === 0 ? HOUR_NAMES[0] : f.h === 12 ? HOUR_NAMES[12] : HOUR_NAMES[f.h % 12];
    spell(name, 0.4, 0.28, 'hour');
    go(SPOT.YES, 0.6); touch('YES', 'word'); hold(1.0, 'nod');
  }

  // the fidgeting, more impatient as the minute wears on
  const pool = ['word', 'loop', 'yes', 'word', 'drum', 'no', 'word', 'loop'];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  let reminded = false, n = 0;
  while (t < 50) {
    const hurry = 1 - 0.3 * (t / 50);
    go([30 + r() * 100, 24 + r() * 24], (1.5 + r() * 0.9) * hurry);
    hold((0.5 + r() * 0.8) * hurry);
    const act = !reminded && t > 17 ? 'remind' : pool[n++ % pool.length];
    if (act === 'remind') {
      if (t > 46) continue;
      reminded = true;
      for (let k = 0; k < 4; k++) { go(SPOT[digits[k]], 0.55 * hurry); touch(digits[k], 'remind', k); hold(0.42 * hurry); }
    } else if (act === 'word') {
      const w = WORDS[Math.floor(r() * WORDS.length)];
      if (t + w.length * 0.8 > 52) continue;
      spell(w, 0.46 * hurry, 0.3 * hurry, 'word');
    } else if (act === 'loop') {
      if (t > 49) continue;
      loop([50 + r() * 60, 30 + r() * 8], 18 + r() * 12, 8 + r() * 4, 2, 2.6 * hurry);
    } else if (act === 'yes' || act === 'no') {
      go(SPOT[act.toUpperCase()], 0.65 * hurry); touch(act.toUpperCase(), 'word'); hold(1.3, act === 'yes' ? 'nod' : 'shake');
    } else hold(1.5, 'drum');
  }
  // last few seconds: drumming, then GOOD BYE
  go([60 + r() * 40, 44], Math.max(0.5, 54.2 - t - 1.2));
  hold(Math.max(0.3, 56.55 - t), 'drum');
  go(SPOT.BYE, 0.8, 0.3);
  touch('BYE', 'bye');
  const tBye = t;
  hold(60 - t + 1, 'still');
  return { segs, touches, tBye, digits, hour };
}

const CACHE = new Map();
function scriptFor(f) {
  let s = CACHE.get(f.minuteKey);
  if (!s) {
    if (CACHE.size > 6) CACHE.clear();
    s = buildScript(f);
    CACHE.set(f.minuteKey, s);
  }
  return s;
}

// ------------------------------------------------------------ where the planchette is
function posAt(S, s) {
  const segs = S.segs;
  let seg = segs[segs.length - 1];
  for (let i = 0; i < segs.length; i++) if (s < segs[i].t1) { seg = segs[i]; break; }
  const u = clamp((s - seg.t0) / (seg.t1 - seg.t0), 0, 1);
  if (seg.type === 'go') {
    const { a, b, bend } = seg;
    const e = ease.inOutCubic(u);
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
    if (l < 0.5) {                       // the same figure twice: a little hop round and back
      const ph = e * Math.PI * 2;
      return [a[0] + 2.4 * sin(ph), a[1] - 2.2 * (1 - Math.cos(ph))];
    }
    const mx = (a[0] + b[0]) / 2 - dy * bend, my = (a[1] + b[1]) / 2 + dx * bend;
    const v = 1 - e;
    return [v * v * a[0] + 2 * v * e * mx + e * e * b[0], v * v * a[1] + 2 * v * e * my + e * e * b[1]];
  }
  if (seg.type === 'loop') {
    const e = ease.inOutQuad(u), ph = Math.PI + e * seg.turns * Math.PI * 2;
    return [seg.c[0] + seg.rx * sin(ph), seg.c[1] - seg.ry * Math.cos(ph)];
  }
  // hold: settle from the glide, then the spirit's restlessness
  const tau = s - seg.t0, [x, y] = seg.p;
  const settle = 1.3 * Math.exp(-tau * 6) * sin(tau * 17);
  let ox = seg.dir[0] * settle, oy = seg.dir[1] * settle;
  ox += 0.5 * (noise(s * 3.1, 1) - 0.5); oy += 0.5 * (noise(s * 3.3, 2) - 0.5);
  const fade = clamp(tau * 3, 0, 1) * clamp((seg.t1 - s) * 3, 0, 1);
  if (seg.style === 'drum') { const k = sin(s * 2 * Math.PI * 5.5); oy -= 1.3 * fade * (k > 0 ? k * k * k * k : 0); ox += 0.8 * fade * (noise(s * 9, 3) - 0.5); }
  else if (seg.style === 'nod') oy += 2.2 * fade * sin(tau * 2 * Math.PI * 2.6);
  else if (seg.style === 'shake') ox += 2.8 * fade * sin(tau * 2 * Math.PI * 3.0);
  return [x + ox, y + oy];
}

// ------------------------------------------------------------ the candle
function candle(tod, f) {
  let b = 0.87 + 0.06 * (noise(tod * 2.1, 4) - 0.5) * 2 + 0.04 * (noise(tod * 7.7, 5) - 0.5) * 2 + 0.025 * (noise(tod * 19, 6) - 0.5) * 2;
  const gust = clamp((noise(tod * 0.37, 7) - 0.72) * 4, 0, 1);
  b -= 0.16 * gust * (0.6 + 0.4 * noise(tod * 11, 8));
  // on the hour it gutters at the turn, nearly out, and flares back
  const s = f.sec;
  if (f.m === 59 && s > 59.3) b *= 1 - 0.7 * ease.inQuad(progress(s, 59.3, 59.9));
  if (f.m === 0 && s < 1.6) b *= 1 - 0.7 * (1 - ease.outQuad(progress(s, 0.15, 1.6)));
  const sway = 4 * (noise(tod * 1.3, 9) - 0.5) + 3 * gust;
  return { b: clamp(b, 0.15, 1), sway };
}

// ------------------------------------------------------------ helpers
const ch8 = (v) => (v <= 0 ? 0 : v >= 255 ? 255 : v | 0);
const pack = (r, g, b) => (ch8(r) << 16) | (ch8(g) << 8) | ch8(b);
/** Blend c over d by a (0..1) without the kit's rounding (one C expression per channel). */
function over(d, c, a) {
  return pack(R(d) + (R(c) - R(d)) * a, G(d) + (G(c) - G(d)) * a, B(d) + (B(c) - B(d)) * a);
}
const bezier = (a, m, b, u) => { const v = 1 - u; return [v * v * a[0] + 2 * v * u * m[0] + u * u * b[0], v * v * a[1] + 2 * v * u * m[1] + u * u * b[1]]; };

/** A wisp of ectoplasm from a to b, head at progress u: a comet of soft discs. */
function wisp(g, a, b, u, seed, fade = 1) {
  const m = [(a[0] + b[0]) / 2 + (rand(seed, 1) - 0.5) * 30, Math.min(a[1], b[1]) - 6 - rand(seed, 2) * 8];
  for (let j = 9; j >= 0; j--) {
    const v = u - j * 0.045;
    if (v < 0 || v > 1) continue;
    const [x, y] = bezier(a, m, b, ease.inOutQuad(v));
    const k = 1 - j / 10;
    const wob = 1.2 * sin(v * 14 + seed);
    g.fillCircle(x + wob, y, 0.6 + 1.9 * k, j === 0 ? CORE : SMOKE, { aa: true, a: (0.25 + 0.6 * k) * fade });
  }
}

export default {
  name: 'Ouija',
  blurb: 'A planchette spells the time by candlelight; each figure rises from its window as ectoplasm and hangs over the board until GOOD BYE.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec;
    const tod = f.h * 3600 + f.m * 60 + s;
    ctx.lcd.backlight(1 - 0.7 * ctx.night);
    const S = scriptFor(f);
    const light = candle(tod, f);

    g.draw(BOARD, 0, 0);

    // ---- what the spirit has touched glows a while on the board
    const recent = S.touches.filter((q) => s >= q.t && s < q.t + 3);
    for (const q of recent) {
      const a = 0.95 * Math.exp(-(s - q.t) * 1.2);
      for (const [ch, gx, gy, w] of PRINT) {
        if (q.target.length > 1 ? w !== q.target : (w || ch !== q.target)) continue;
        g.blit(LETTER[ch], gx, gy, { c: GLOW, a: a * 0.45 }); g.blit(LETTER[ch], gx + 1, gy, { c: GLOW, a: a * 0.25 });
        g.blit(LETTER[ch], gx, gy, { c: CORE, a: a * 0.8 });
      }
    }

    // ---- the planchette
    const [px, py] = posAt(S, s);
    const [qx] = posAt(S, s - 0.04), [nx] = posAt(S, s + 0.04);
    const yaw = clamp((nx - qx) * 0.025, -0.28, 0.28);
    const th = 0.5 * Math.atan2(px - 80, 140 - py) + yaw;
    const cs = Math.cos(th), sn = Math.sin(th);
    const place = (pts, dx = 0, dy = 0, k = 1) => pts.map(([x, y]) => [px + dx + k * (x * cs - y * sn), py + dy + k * (x * sn + y * cs)]);
    // shadow, thrown away from the swaying flame
    const lx = px - (CANDLE[0] + light.sway), ly = py - CANDLE[1], ll = Math.hypot(lx, ly);
    const sd = 2.6 + 0.6 * (1 - light.b);
    g.fillPolygon(place(HEART, (lx / ll) * sd, (ly / ll) * sd, 1.04), 0x000000, { aa: true, a: 0.42 });
    // lit edge on the candle side, then the body
    g.fillPolygon(place(HEART, -(lx / ll) * 0.8, -(ly / ll) * 0.8), lit(RIM, px, py), { aa: true });
    g.fillPolygon(place(HEART), lit(MAHOGANY, px, py), { aa: true });
    // a brass inlay star at the heel
    const [hx, hy] = place([[0, 6.2]])[0];
    g.fillCircle(hx, hy, 1.1, lit(BRASS, px, py, 0.9), { aa: true });
    // the window: what's under it, magnified twice
    const lr = LENS_R;
    const src = [];
    const sx0 = Math.floor(px - lr / 2) - 1, sy0 = Math.floor(py - lr / 2) - 1;
    for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) src.push(g.get(sx0 + i, sy0 + j));
    let spirit = 0;
    for (const q of recent) spirit = Math.max(spirit, Math.exp(-(s - q.t) * 2.2));
    if (S.hour && s < 2.2) spirit = 1;
    if (s > S.tBye) spirit = Math.max(spirit, 1 - progress(s, S.tBye + 1.6, S.tBye + 2.4));
    g.paint((x, y) => {
      const dx = x - px, dy = y - py, d2 = dx * dx + dy * dy;
      if (d2 > lr * lr) return -1;
      const i = clamp(Math.floor(px + dx / 2) - sx0, 0, 8), j = clamp(Math.floor(py + dy / 2) - sy0, 0, 8);
      const c = src[j * 9 + i], q = d2 / (lr * lr), k = 1.1 - 0.4 * q * q;
      return over(pack(R(c) * k, G(c) * k, B(c) * k), GLOW, 0.32 * spirit);
    }, [px - lr - 1, py - lr - 1, 2 * lr + 2, 2 * lr + 2]);
    g.ring(px, py, lr - 0.2, RIM_R, lit(BRASS, px, py), { aa: true });
    g.arc(px, py, RIM_R - 0.6, RIM_R, 2.0, 4.6, lit(BRASS_DK, px, py), { aa: true });
    g.arc(px, py, lr - 2.4, lr - 1.2, 5.2, 6.0, 0xfff4dc, { aa: true, a: 0.75 });   // the flame's gleam on the glass

    // ---- the candle flickers on everything it lights
    g.fillRect(0, 0, W, H, 0x000000, { a: 1 - light.b });

    // ---- the message: figures of smoke, each there from its spelling to GOOD BYE
    const slotState = (k) => {
      const sp = S.touches.find((q) => q.kind === 'spell' && q.slot === k);
      if (!sp || s < sp.t) return null;
      const form = progress(s, sp.t + 0.32, sp.t + 1.0);
      const d0 = S.tBye + 0.15 + 0.28 * k;
      const gone = progress(s, d0 + 0.05, d0 + 0.7);
      let flare = Math.exp(-(s - sp.t - 0.4) * 3) * (s > sp.t + 0.4 ? 1 : 0);
      for (const q of S.touches) if (q.kind === 'remind' && q.slot === k && s >= q.t) flare = Math.max(flare, Math.exp(-(s - q.t) * 2.2));
      return { form, gone, flare, d0 };
    };
    const ghost = (gl, x0, k, st) => {
      if (st.form <= 0 || st.gone >= 1) return;
      const bob = 0.9 * sin(tod * 1.25 + k * 1.9), sway = 0.45 * sin(tod * 0.8 + k * 2.3);
      const breathe = 0.93 + 0.07 * sin(tod * 2.2 + k);
      const coreA = Math.min(1, breathe + 0.4 * st.flare);
      const ox = x0 - PAD + sway, oy = GY - PAD + bob;
      const lift = st.gone * 9;                          // drawn off downwards, toward the window
      // the smoke wavers sideways, row by row (one table lookup per row)
      const y0 = Math.max(0, Math.floor(oy - 1)), wave = [];
      for (let j = 0; j < MH + 3; j++) wave.push(0.5 * sin((j + y0 - oy) * 0.42 + tod * 3.3 + k * 1.3));
      const buf = g.buf;
      g.paint((x, y, ix, iy) => {
        const v = y - oy - lift * (0.5 + rand(ix, 3, k));
        const u = x - ox - wave[iy - y0];
        if (u < -1 || v < -1 || u > MW || v > MH) return -1;
        const cov = sample(gl.cov, u - 0.5, v - 0.5), dist = sample(gl.dist, u - 0.5, v - 0.5, 99);
        if (dist > 4.5 && cov <= 0) return -1;
        // forming: smoke fills the figure from the bottom up, with grain; going: it unravels
        const n = rand(ix, iy, 77) * 0.55 + (1 - v / MH) * 0.45;
        const pres = clamp((st.form * 1.6 - n) * 4, 0, 1) * clamp((1 - st.gone * 1.5 - (1 - n) * 0.5) * 3 + 0.5 * (1 - st.gone), 0, 1);
        if (pres <= 0) return -1;
        let c = from565(buf[iy * W + ix]);
        const aura = clamp(1 - dist / (4.5 + st.flare), 0, 1);
        c = over(c, AURA, aura * 0.72 * pres);
        c = over(c, GLOW, clamp(1 - dist / 1.7, 0, 1) * (0.6 + 0.35 * st.flare) * pres);
        c = over(c, CORE, cov * coreA * pres);
        return c;
      }, [ox - 1, y0, MW + 2, Math.min(MH + 2, H - y0)]);
    };
    const states = [0, 1, 2, 3].map(slotState);
    for (let k = 0; k < 4; k++) if (states[k]) ghost(GLYPHS[S.digits[k]], SLOT_X[k], k, states[k]);
    if (states[1]) ghost(GLYPHS[':'], COLON_X, 4, { ...states[1], flare: 0, form: progress(s, S.touches.find((q) => q.slot === 1).t + 0.8, S.touches.find((q) => q.slot === 1).t + 1.4) });

    // ---- wisps: out of the window up to the message, and back down at GOOD BYE
    for (const q of S.touches) {
      if (q.kind !== 'spell') continue;
      const u = progress(s, q.t + 0.02, q.t + 0.5);
      if (u > 0 && u < 1.4 && s < q.t + 0.75) wisp(g, SPOT[q.target], slotCentre(q.slot), u, q.slot * 3 + 1, 1 - progress(s, q.t + 0.5, q.t + 0.75));
      const st = states[q.slot];
      if (st && s > st.d0 && s < st.d0 + 0.85) wisp(g, slotCentre(q.slot), SPOT.BYE, progress(s, st.d0, st.d0 + 0.6), q.slot * 3 + 2, 1 - progress(s, st.d0 + 0.6, st.d0 + 0.85));
    }
    // the whirl leaves smoke behind it
    if (S.hour && s < 2.4) {
      for (let j = 1; j <= 8; j++) {
        const [x, y] = posAt(S, s - j * 0.035);
        g.fillCircle(x, y, 3.2 - j * 0.3, SMOKE, { aa: true, a: 0.32 * (1 - j / 9) * (1 - progress(s, 1.9, 2.4)) });
      }
    }
    // spelled letters puff up out of the window as they're read
    for (const q of recent) {
      if (q.kind !== 'word' && q.kind !== 'hour') continue;
      if (q.target.length > 1) continue;
      const age = s - q.t;
      if (age > 1.3) continue;
      const [x, y] = SPOT[q.target];
      g.blit(LETTER[q.target], x - 2.5 + 1.5 * sin(age * 5), y - 14 - age * 9, { c: CORE, a: 0.85 * (1 - age / 1.3) });
    }
  },
};
