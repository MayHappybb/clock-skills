// Polo: a page from a Safavid manuscript, a royal game of chowgan on the
// maidan, and the time is the four horses in it. Each numeral IS a horse in
// the miniaturist's flying gallop (polo-glyphs.js): its neck and body are
// the digit's stroke, swelling from a slim neck to a heavy rump and keylined
// in one fine dark line, with a small refined head on the top-left end of
// the stroke, four legs galloping from its foot, a knotted tail streaming
// from its back and a turbaned rider (hours in vermilion, minutes in lapis)
// sitting on top swinging his chowgan. The herd rides left across a deep
// malachite meadow under a high horizon of spongy pastel rocks, cypresses
// and an almond in blossom, against a sky of gold leaf; a lapis border with a
// running gold quatrefoil closes the page.
//
// At rest the time is never still: the four ride a rotary gallop at two
// strides a second (legs cycling, bodies rising in the suspension), tails
// and manes stream, the meadow runs past under them; every second a rider
// strikes and the white ball skids to the next horse (a pass, a dribble, a
// backhand across the gap between the hours and the minutes). Every 12 s a
// flourish: the whole herd bounds in the flying gallop with legs flung out,
// a high drive lofts the ball over all four, or cranes cross the gold.
// Light slides over the gold leaf.
//
// Minute turn: the old horse veers up-field and falls back, dissolving into
// gold dust (zar-afshan, the gold flecks of a manuscript's margins) that
// blows back and comes down again as the new horse, which gallops in from
// behind out of the dust. Every stroke pixel of the old numeral is a fleck
// that flies to a pixel of the new one; both thin and fill by one fixed
// rank, so a digit only ever thins evenly; the old one is gone by :59.85 and
// the new one starts at :00.15. Hour: the goal. The new hour's rider drives
// the ball high into the goal posts on the horizon, gold bursts from the
// goal, pennants fly, the king's nisar showers gold coins over the maidan,
// the hour's horses are gilded, and the herd bounds on every beat.
//
// Palette: see polo-art.js: the miniaturist's ground pigments and gold, one
// keyline colour; hard pixels throughout (a miniature is flat colour inside
// fine lines). Night: a lapis sky with gold stars, a darker meadow, the
// backlight dimmed; the pale horses stay the brightest things on the glass.
//
// Cost: bodies are looked up from ten Int8 distance fields (polo-glyphs.js);
// legs come from a 64-phase pose table, tails, legs and mallets are kit
// lines, everything else is indexed sprites and wrapping textures copied
// row by row. A changing horse is drawn into a 52 x 68 scratch canvas
// (7 KB) and composited through its rank; the flecks are closed form per
// pixel. No per-minute caches: every frame is built cold.
import { Gfx, clockFields, hash, sin, to565 } from '../js/kit.js';
import { SDF, SW, SH, M, ANCHOR, LEGS, PIX, RANK } from './polo-glyphs.js';
import {
  W, H, INK, FIELD_Y0, FIELD_Y1, HORSE565, GILT565, COATS, HEADS, RIDER, RIDER565, FW, FIELD_TEX,
  SKY_H, GOLD_RAMP, NIGHT_RAMP, SKY_IDX, HILLS, HILL_PAL, POSTS_X, BORDER, GOLD, GOLD_LT,
} from './polo-art.js';

const SLOT_X = [8, 40, 92, 124], TOP = 22, GROUND = TOP + 43.5;
// the hours' team rides a little up-field of the minutes' (higher is further, as a miniature stacks depth)
const SLOT_Y = [-2, -2, 2, 2];
const C = to565;
const CLOTH = C(0xe8be4c), HEM_DOT = C(0xfff0b8);
const INK565 = C(INK), STICK = 0x6a4424, WHITE = 0xf8f2e2;
const FAR565 = COATS.map((k) => {
  const c = k.coat, r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return ((r * 0.72) << 16) | ((g * 0.7) << 8) | (b * 0.74);
});
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const frac = (x) => x - Math.floor(x);
const PI = Math.PI;

// ---------------------------------------------------------- the gallop (tables, flash)
// 64 phases of a stride: the body's rise, and per leg the knee and hoof
// relative to its root. Legs: hind far, fore far, hind near, fore near.
const NP = 64, L1 = 5.6, L2 = 6.0, REACH = 10.2;
const LEG_PH = [0.08, 0.36, 0, 0.28], LEG_FORE = [0, 1, 0, 1];
export const BOB = new Int8Array(NP), LEGT = new Float32Array(NP * 4 * 4);
for (let p = 0; p < NP; p++) {
  const ph = p / NP;
  const b = Math.round(2 * Math.max(0, Math.cos(2 * PI * (ph - 0.86))));
  BOB[p] = b;
  for (let l = 0; l < 4; l++) {
    const q = frac(ph - LEG_PH[l]), fore = LEG_FORE[l];
    let hx, hy;
    if (q < 0.42) { const u = q / 0.42; hx = -3.6 + 7.8 * u; hy = REACH + b; }
    else { const u = (q - 0.42) / 0.58; hx = 4.2 - 8.6 * sm(u); hy = REACH + b - 4.4 * Math.sin(PI * u); }
    const d = Math.min(L1 + L2 - 0.05, Math.hypot(hx, hy));
    const base = Math.atan2(hy, hx), a = Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d));
    // fore knees point forward (left), hind hocks back (right)
    const s1 = base + a, s2 = base - a;
    const k1 = [L1 * Math.cos(s1), L1 * Math.sin(s1)], k2 = [L1 * Math.cos(s2), L1 * Math.sin(s2)];
    const k = fore ? (k1[0] < k2[0] ? k1 : k2) : (k1[0] > k2[0] ? k1 : k2);
    const sc = d / Math.hypot(hx, hy);
    const o = (p * 4 + l) * 4;
    LEGT[o] = k[0]; LEGT[o + 1] = k[1]; LEGT[o + 2] = hx * sc; LEGT[o + 3] = hy * sc;
  }
}
// the flying gallop: fore legs flung forward, hind legs back (the miniaturist's pose)
const FLY = [[4.4, 3.4, 10.2, 2.6], [-4.6, 3.0, -10.4, 3.4], [4.0, 3.8, 9.6, 3.6], [-4.2, 3.6, -9.8, 4.4]];

// ---------------------------------------------------------- the play: who has the ball
const PASS = [3, 2, 1, 0, 1, 2];
const flourishAt = (mk, k) => ['leap', 'drive', 'birds'][(hash(mk, 11) + k) % 3];

/** The pass that starts on second n of the minute: from horse, to horse, and how. */
function pass(n, mk, hourShow) {
  if (hourShow && n < 12) return null;
  const k = Math.floor(n / 12), r = n - k * 12;
  if (k >= 1 && flourishAt(mk, k) === 'drive') {
    if (r === 0) return { from: 3, to: 1, loft: true, len: 2 };
    if (r === 1) return { from: -1 };
  }
  return { from: PASS[n % 6], to: PASS[(n + 1) % 6], loft: false, len: 1 };
}

// ---------------------------------------------------------- scratch for a changing horse
const SCW = 52, SCH = 68, SOX = 12, SOY = 20, KEY = 0x0001;
const SCR = new Gfx(SCW, SCH);

/** Draw one horse with its rider; (ox, oy) is the glyph's top-left in G's pixels. */
function horse(G, d, ox, oy, o) {
  const buf = G.buf, GWd = G.width, GHt = G.height;
  const A = ANCHOR[d], Lg = LEGS[d], pal = o.pal, gold = o.gild;
  const p = o.p;
  // --- the knotted tail of a polo pony: a ribbon knot and a short flying tuft
  const tx = ox + A.tail[0], ty = oy + A.tail[1], w1 = sin(o.T * 14 + d), w2 = sin(o.T * 14 + d + 1.9);
  const tail = [[tx + 1, ty], [tx + 3.6, ty - 1.6 + 0.7 * w1], [tx + 6.2, ty - 2.6 + 1.5 * w2]];
  G.stroke(tail, 2.6, INK);
  G.stroke(tail, 1.0, COATS[d].henna);
  G.fillRect(Math.round(tx), Math.round(ty - 1), 2, 2, 0xc8301e);
  // --- legs: far pair, then near pair
  const lam = o.fly;
  for (let l = 0; l < 4; l++) {
    const rx = ox + (LEG_FORE[l] ? Lg.front : Lg.hind) + (l < 2 ? 1.2 : 0), ry = oy + Lg.y;
    const q = (p * 4 + l) * 4, F = FLY[l];
    const kx = rx + LEGT[q] + (F[0] - LEGT[q]) * lam, ky = ry + LEGT[q + 1] + (F[1] - LEGT[q + 1]) * lam;
    const hx = rx + LEGT[q + 2] + (F[2] - LEGT[q + 2]) * lam, hy = ry + LEGT[q + 3] + (F[3] - LEGT[q + 3]) * lam;
    // a miniaturist's legs: slim, in the coat, with dark hooves (far legs a shade darker)
    const lc = gold > 0.5 ? 0xf0d070 : l < 2 ? FAR565[d] : COATS[d].coat;
    const low = gold > 0.5 ? 0xf0d070 : l < 2 ? lc : COATS[d].henna === COATS[d].mane ? lc : COATS[d].henna;
    G.thickLine(rx, ry, kx, ky, 2.2, lc);
    G.thickLine(kx, ky, hx, hy, 1.8, low);
    G.fillRect(Math.round(hx - 1), Math.round(hy - 0.5), 2, 2, INK);
  }
  // --- the body: the numeral, from its distance field
  const sdf = SDF[d], pc = pal[1], pg = GILT565[1], gr = gold * SH;
  let n = 0;
  for (let j = 0; j < SH; j++) {
    const Y = oy - M + j;
    if (Y < 0 || Y >= GHt) continue;
    const coat = j < gr ? pg : pc;
    for (let i = 0; i < SW; i++) {
      const v = sdf[j * SW + i];
      if (v > 0) continue;
      const X = ox - M + i;
      if (X < 0 || X >= GWd) continue;
      buf[Y * GWd + X] = v > -8 ? INK565 : coat; n++;
    }
  }
  G.cost.box += SW * SH * 2; G.cost.px += n;
  // the saddle cloth under the rider: gold brocade with a vermilion hem, laid on the stroke only
  {
    const cx = Math.round(A.seat[0]) + M, cy = Math.round(A.seat[1]) + M, robe = o.hem;
    for (let j = cy - 3; j <= cy + 2; j++) {
      const Y = oy - M + j;
      if (j < 0 || Y < 0 || Y >= GHt) continue;
      for (let i = cx - 4; i <= cx + 3; i++) {
        if (sdf[j * SW + i] > -8) continue;
        const X = ox - M + i;
        if (X < 0 || X >= GWd) continue;
        const rim = j === cy + 2 || i === cx - 4 || i === cx + 3 || sdf[(j + 1) * SW + i] > -8;
        buf[Y * GWd + X] = rim ? robe : ((i + j) & 3) === 0 ? HEM_DOT : CLOTH;
      }
    }
    G.cost.box += 48;
  }
  // --- the head: keyline only where it is off the stroke, so the neck runs on
  const hd = HEADS[A.pose], hx0 = Math.round(ox + A.head[0]) - hd.ax, hy0 = Math.round(oy + A.head[1]) - hd.ay;
  const hp = gold > 0.3 ? GILT565 : pal;
  n = 0;
  for (let j = 0; j < hd.h; j++) {
    const Y = hy0 + j;
    if (Y < 0 || Y >= GHt) continue;
    for (let i = 0; i < hd.w; i++) {
      let v = hd.data[j * hd.w + i];
      if (v < 0) continue;
      const X = hx0 + i;
      if (X < 0 || X >= GWd) continue;
      if (v === 0) {
        const si = X - ox + M, sj = Y - oy + M;
        if (si >= 0 && sj >= 0 && si < SW && sj < SH && sdf[sj * SW + si] <= 0 && !hd.feat[j * hd.w + i]) v = 1;
      }
      buf[Y * GWd + X] = hp[v]; n++;
    }
  }
  G.cost.blit += n;
  // the mane: three locks flying back from the poll
  const px = hx0 + hd.px, py = hy0 + hd.py;
  for (let k = 0; k < 3; k++) {
    const wv = sin(o.T * 16 + k * 1.3 + d);
    G.thickLine(px + k * 1.6, py + k * 0.9, px + k * 1.6 + 3.2, py + k * 0.9 - 1.6 + wv, 1.2, COATS[d].mane);
  }
  // --- the rider and his chowgan
  const sx = Math.round(ox + A.seat[0]) - RIDER.ax, sy = Math.round(oy + A.seat[1]) - RIDER.ay - 2;
  G.cost.blit += blit(G, RIDER, sx, sy, o.rpal);
  const shx = sx + 2.5, shy = sy + 9.5, th = o.mallet;
  const ux = sin(th), uy = -sin(th + PI / 2);
  const hx = shx + ux * 3, hy = shy + uy * 3;
  G.thickLine(shx, shy, hx, hy, 1.6, o.robe);
  const mx = hx + ux * 12, my = hy + uy * 12;
  G.line(hx, hy, mx, my, STICK);
  // the hooked head of the stick, turned toward the front
  G.line(mx, my, mx - 2, my + 1, STICK);
  G.pixel(hx, hy, 0xf2c8a2);
}

function blit(G, spr, x, y, pal) {
  const buf = G.buf, GWd = G.width, GHt = G.height;
  let n = 0;
  for (let j = 0; j < spr.h; j++) {
    const Y = y + j;
    if (Y < 0 || Y >= GHt) continue;
    for (let i = 0; i < spr.w; i++) {
      const v = spr.data[j * spr.w + i];
      if (v < 0) continue;
      const X = x + i;
      if (X < 0 || X >= GWd) continue;
      buf[Y * GWd + X] = pal[v]; n++;
    }
  }
  return n;
}

// ---------------------------------------------------------- the page behind
const CLOUD = [
  '...bbb.....bb..',
  '..bwwwb...bwwb.',
  '.bwwbwwbbbwwbwb',
  'bwwwwwwwwwwwwb.',
  '.bbbbbbbbbbbb..',
];
const CRANE = [['b...b', '.bbb.', '..b..'], ['.....', 'bbbbb', '..b..']];

function page(g, T, night, sheenSpeed) {
  const buf = g.buf, ramp = night ? NIGHT_RAMP : GOLD_RAMP, tex = FIELD_TEX[night ? 1 : 0], hp = HILL_PAL[night ? 1 : 0];
  // gold leaf, with light sliding over it in a broad diagonal
  const pos = ((T * sheenSpeed) % 420) - 130;
  for (let y = 0; y < FIELD_Y0; y++) {
    const row = y * W, base = pos - y * 2;
    for (let x = 0; x < W; x++) {
      const dd = x - base, ad = dd < 0 ? -dd : dd;
      let k = SKY_IDX[row + x] + (ad < 9 ? 2 : ad < 22 ? 1 : 0);
      if (night) k = SKY_IDX[row + x] - 2;
      buf[row + x] = ramp[k];
    }
  }
  g.cost.box += W * FIELD_Y0 * 3; g.cost.px += W * FIELD_Y0;
  if (night) {
    for (let k = 0; k < 22; k++) {
      const h = hash(k, 41), x = h % W, y = (h >>> 8) % 10;
      const tw = (Math.floor(T * 3) + k) % 7;
      if (tw) buf[y * W + x] = C(tw < 2 ? 0xf0d888 : 0xb89848);
    }
  }
  // the meadow runs past under the herd
  const off = Math.floor(T * 36) % FW;
  for (let y = FIELD_Y0; y < FIELD_Y1; y++) {
    const src = (y - FIELD_Y0) * FW, row = y * W;
    for (let x = 0; x < W; x++) { let sx = x - off; if (sx < 0) sx += FW; buf[row + x] = tex[src + sx]; }
  }
  g.cost.box += W * (FIELD_Y1 - FIELD_Y0); g.cost.px += W * (FIELD_Y1 - FIELD_Y0);
  // tchi clouds drifting over the gold
  const cw = night ? [0x3a4a7a, 0x22305a] : [0xf6f0e0, 0x5a7cc4];
  for (let k = 0; k < 2; k++) {
    const x = Math.round(((T * (2 + k) + k * 90) % 200) - 20), y = 1 + k * 3;
    for (let j = 0; j < CLOUD.length; j++)
      for (let i = 0; i < CLOUD[j].length; i++) {
        const ch = CLOUD[j][i]; if (ch === '.') continue;
        const X = (k ? W - 1 - (x + i) : x + i), Y = y + j;
        if (X >= 0 && X < W && Y < FIELD_Y0) buf[Y * W + X] = C(ch === 'w' ? cw[0] : cw[1]);
      }
  }
  g.cost.blit += 120;
  return hp;
}

function hills(g, hp) {
  const buf = g.buf;
  for (let i = 0; i < W * SKY_H; i++) { const v = HILLS[i]; if (v >= 0) buf[i] = hp[v]; }
  g.cost.box += W * SKY_H * 2;
  for (let i = 0; i < W * 6; i++) buf[FIELD_Y1 * W + i] = BORDER[i];
  g.cost.px += W * 6;
}

// ---------------------------------------------------------- the face
export default {
  name: 'Polo',
  blurb: 'A Persian miniature of a royal polo match: each numeral is a horse in the flying gallop with its rider; the minute dissolves into gold dust and gallops back in as the next.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey;
    const night = ctx.night > 0.5;
    ctx.lcd.backlight(1 - 0.55 * ctx.night);
    const T = (ctx.date.getTime() % 86400000) / 1000;
    const prv = clockFields(new Date(ctx.date.getTime() - 60000)), nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm, old = prv.hh + prv.mm, nw = nxt.hh + nxt.mm;
    const hourShow = prv.h !== f.h && s < 12;

    // ---- the flourish of this 12 s, and the hour's bounding
    const k12 = Math.floor(s / 12), r12 = s - k12 * 12;
    const fl = k12 >= 1 && !(hourShow) ? flourishAt(mk, k12) : null;
    let fly = 0, lift = 0;
    if (fl === 'leap' && r12 > 0.3 && r12 < 1.3) { const u = (r12 - 0.3) / 1.0; fly = sin(PI * u); lift = 5 * sin(PI * u); }
    if (hourShow && s > 3 && s < 10) { const u = frac(s); if (u < 0.7) { fly = sin((PI * u) / 0.7); lift = 4 * fly; } }

    const hp = page(g, T, night, hourShow && s > 2 && s < 10 ? 70 : 16);
    if (hourShow) coinsAndGoal(g, s, 'back');
    hills(g, hp);
    if (hourShow) coinsAndGoal(g, s, 'front');
    if (fl === 'birds') cranes(g, r12, night);

    // ---- the four horses
    const ball = ballAt(s, mk, hourShow);
    for (let i = 0; i < 4; i++) {
      const ph = frac(T * 2 + i * 0.07), p = Math.floor(ph * NP);
      const bob = BOB[p] + Math.round(lift);
      const surge = Math.round(1.5 * sin(T * 0.8 + i * 1.9));
      let mallet = 0.55 + 0.12 * sin(ph * 2 * PI);
      const st = strikeOf(i, s, mk, hourShow);
      if (st !== null) mallet = st;
      if (hourShow && s > 2.6 && s < 10) mallet = -0.1 + 0.45 * sin(s * 7 + i);
      const gild = hourShow && i < 2 ? sm((s - 2.4) / 0.6) * (1 - sm((s - 9.4) / 0.6)) : 0;
      const o = { p, T, fly, mallet, gild, pal: HORSE565[0], rpal: RIDER565[i < 2 ? 0 : 1], robe: i < 2 ? 0xd8442a : 0x2f58b4, hem: C(i < 2 ? 0xc8301e : 0x2a4ca8) };
      const leaving = s >= 59 && cur[i] !== nw[i], arriving = s < 1.05 && old[i] !== cur[i];
      if (!leaving && !arriving) {
        const d = +cur[i];
        o.pal = HORSE565[d];
        horse(g, d, SLOT_X[i] + surge, TOP + SLOT_Y[i] - bob, o);
      } else {
        turn(g, i, s, leaving ? +cur[i] : +old[i], leaving ? +nw[i] : +cur[i], leaving, o, surge, bob);
      }
    }

    // ---- the ball
    if (ball) {
      const bx = Math.round(ball[0]), by = Math.round(ball[1]);
      g.fillRect(bx - 1, by - 2, 3, 5, INK); g.fillRect(bx - 2, by - 1, 5, 3, INK);
      g.fillRect(bx - 1, by - 1, 3, 3, WHITE);
      if (ball[2] > 0) {
        const a = ball[2];
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [0, -1.4]]) g.line(bx + dx * 3, by + dy * 3, bx + dx * (3 + 3 * a), by + dy * (3 + 3 * a), WHITE);
      }
    }
  },
};

/** The mallet angle of rider i if he is striking now (0 up, + back, - forward), else null. */
function strikeOf(i, s, mk, hourShow) {
  let n = Math.floor(s + 0.4), t0 = n;
  let ps = pass(n, mk, hourShow);
  if (hourShow && s < 3) { if (i !== 1) return null; t0 = 1.3; ps = { from: 1 }; }
  if (!ps || ps.from !== i) return null;
  const tau = s - t0, idle = 0.55;
  if (tau < -0.4 || tau > 0.6) return null;
  if (tau < -0.08) return idle + (1.3 - idle) * sm((tau + 0.4) / 0.32);
  if (tau < 0.1) return 1.3 - 3.7 * sm((tau + 0.08) / 0.18);
  return -2.4 + (idle + 2.4) * sm((tau - 0.1) / 0.5);
}

const frontX = (i) => SLOT_X[i] + 1;
const groundAt = (x) => GROUND + 2 * Math.max(-1, Math.min(1, (x - 76) / 12));

/** [x, y, clack] of the ball, or null when it is out of play. */
function ballAt(s, mk, hourShow) {
  if (hourShow && s < 12) {
    if (s < 1.3) return [frontX(1) - 2, groundAt(frontX(1)) - 1.5 * Math.abs(sin(s * 6)), 0];
    if (s < 2.4) {
      const u = (s - 1.3) / 1.1, x0 = frontX(1) - 2, x1 = (POSTS_X[0] + POSTS_X[1]) / 2 + 1;
      return [x0 + (x1 - x0) * u, GROUND + (8 - GROUND) * u - 26 * sin(PI * u), u < 0.1 ? 1 - u * 10 : 0];
    }
    if (s < 2.8) return [(POSTS_X[0] + POSTS_X[1]) / 2 + 1, 9 + (s - 2.4) * 10, 0];
    if (s > 11) {
      const u = s - 11, x0 = (POSTS_X[0] + POSTS_X[1]) / 2 + 1, x1 = frontX(3) - 2;
      return [x0 + (x1 - x0) * u, 13 + (GROUND - 13) * u - 10 * sin(PI * u), 0];
    }
    return null;
  }
  let n = Math.floor(s), ps = pass(n, mk, false);
  if (ps.from === -1) { n--; ps = pass(n, mk, false); }
  const u = (s - n) / ps.len, x0 = frontX(ps.from) - 2, x1 = frontX(ps.to) - 2;
  const clack = u * ps.len < 0.12 ? 1 - (u * ps.len) / 0.12 : 0;
  if (ps.loft) {
    const v = Math.min(1, u / 0.8);
    const bx = x0 + (x1 - x0) * v;
    return [bx, groundAt(bx) - 46 * v * (1 - v), clack];
  }
  const v = Math.min(1, u / 0.85), e = 1 - (1 - v) * (1 - v);
  const bx = x0 + (x1 - x0) * e;
  return [bx, groundAt(bx) - 2.4 * Math.abs(sin(PI * 2 * v)) * (1 - v), clack];
}

// ---------------------------------------------------------- the minute turn: gold dust
const EX0 = -0.85, EXD = 0.7, FLYT = 1.0;

function turn(g, i, s, dOld, dNew, leaving, o, surge, bob) {
  const tau = s >= 30 ? s - 60 : s;
  // where each horse is at time t: the old one veers up and back, the new one gallops in from behind
  const offOld = (t) => { const u = sm((t + 0.85) / 0.85); return [5 * u * u, -4 * u * u]; };
  const offNew = (t) => { const u = sm(t / 1.05); return [8 * (1 - u) * (1 - u), 0]; };
  const d = leaving ? dOld : dNew;
  const K = leaving ? sm((tau - EX0) / EXD) : sm((tau - EX0 - FLYT) / EXD);  // fraction departed / arrived
  const [ex, ey] = leaving ? offOld(tau) : offNew(tau);
  const ox = SLOT_X[i] + surge + Math.round(ex), oy = TOP + SLOT_Y[i] - bob + Math.round(ey);
  // draw the horse alone, then copy it through its rank
  SCR.buf.fill(KEY);
  const c0 = { ...SCR.cost };
  o.pal = HORSE565[d];
  horse(SCR, d, SOX, SOY, o);
  for (const k in SCR.cost) g.cost[k] += SCR.cost[k] - c0[k];
  const rk = RANK[d], buf = g.buf, sb = SCR.buf, thr = K * 255;
  let n = 0;
  for (let y = 0; y < SCH; y++) {
    const Y = oy - SOY + y;
    if (Y < 0 || Y >= FIELD_Y1) continue;
    for (let x = 0; x < SCW; x++) {
      const v = sb[y * SCW + x];
      if (v === KEY) continue;
      const X = ox - SOX + x;
      if (X < 0 || X >= W) continue;
      const ci = x - SOX + M, cj = y - SOY + M;
      let r = ci >= 0 && cj >= 0 && ci < SW && cj < SH ? rk[cj * SW + ci] : 255;
      if (r === 255) r = hash(x, y, d) & 255;
      if (leaving ? r >= thr : r < thr) { buf[Y * W + X] = v; n++; }
    }
  }
  g.cost.box += SCW * SCH * 4; g.cost.px += n;
  // the flecks: each stroke pixel of the old numeral flies to one of the new
  const PA = PIX[dOld], PB = PIX[dNew], na = PA.length, nb = PB.length, N = na > nb ? na : nb;
  const gl = [C(GOLD_LT), C(GOLD), C(0xfff4c8)];
  let m = 0;
  for (let k = 0; k < N; k++) {
    const u = k / N, td = EX0 + EXD * u, ta = td + FLYT;
    if (tau <= td || tau >= ta) continue;
    const a = PA[Math.floor((k * na) / N)], b = PB[Math.floor((k * nb) / N)];
    const [e0x, e0y] = offOld(td), [e1x] = offNew(ta);
    const x0 = SLOT_X[i] - M + (a & 255) + e0x, y0 = TOP + SLOT_Y[i] - M + (a >> 8) + e0y;
    const x1 = SLOT_X[i] - M + (b & 255) + e1x, y1 = TOP + SLOT_Y[i] - M + (b >> 8);
    const v = (tau - td) / FLYT, e = sm(v), h = hash(k, i, 5);
    const arc = sin(PI * v);
    const X = Math.round(x0 + (x1 - x0) * e + arc * (6 + (h & 7))), Y = Math.round(y0 + (y1 - y0) * e - arc * (5 + ((h >>> 3) & 7)));
    if (X < 0 || X >= W || Y < 0 || Y >= FIELD_Y1) continue;
    buf[Y * W + X] = gl[(h + Math.floor(s * 20)) % 3]; m++;
  }
  g.cost.box += N * 12; g.cost.px += m;
}

// ---------------------------------------------------------- flourishes and the hour
function cranes(g, t, night) {
  if (t > 6) return;
  const c = night ? 0x8a94b8 : 0x3a2a1c;
  for (let k = 0; k < 3; k++) {
    const x = Math.round(W + 6 - t * 30 + k * 7), y = 2 + (k === 1 ? 0 : 2) + Math.round(sin(t * 2 + k));
    const fr = CRANE[(Math.floor(t * 6) + k) & 1];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 5; i++) if (fr[j][i] === 'b') g.pixel(x + i, y + j, c);
  }
}

function coinsAndGoal(g, s, layer) {
  const gx = (POSTS_X[0] + POSTS_X[1]) / 2 + 1;
  if (layer === 'back') {
    // the goal burst behind the hills' edge
    if (s > 2.3 && s < 3.4) {
      const u = (s - 2.3) / 1.1;
      for (let k = 0; k < 10; k++) {
        const an = (k / 10) * 2 * PI, r0 = 3 + 10 * u, r1 = r0 + 4 * (1 - u);
        g.line(gx + r0 * sin(an), 7 - r0 * sin(an + PI / 2) * 0.6, gx + r1 * sin(an), 7 - r1 * sin(an + PI / 2) * 0.6, k & 1 ? 0xfff4c8 : 0xc8301e);
      }
    }
    return;
  }
  // pennants on the posts
  if (s > 2.3 && s < 11) {
    const up = sm((s - 2.3) / 0.5) * (1 - sm((s - 10.4) / 0.6));
    POSTS_X.forEach((px, k) => {
      const len = Math.round(8 * up);
      for (let x = 0; x < len; x++) {
        const y = 2 + Math.round(sin(s * 9 - x * 0.7 + k) * 0.8 * (x / 8));
        const X = k ? px + 2 + x : px - 1 - x;
        g.fillRect(X, y, 1, x < len - 2 ? 2 : 1, k ? 0x2f58b4 : 0xd8442a);
      }
    });
  }
  // the king's nisar: gold coins showering over the maidan
  if (s > 2.4 && s < 11.5) {
    for (let k = 0; k < 46; k++) {
      const h = hash(k, 77), t0 = 2.4 + (k / 46) * 5.6 + ((h & 15) / 30);
      const age = s - t0;
      if (age < 0) continue;
      const y = -2 + age * (22 + ((h >>> 4) & 15));
      if (y > FIELD_Y1 - 2) continue;
      const x = Math.round(4 + ((h >>> 8) % 152) + 2.5 * sin(age * 3 + k));
      const spin = (Math.floor(age * 10) + k) & 3;
      const Y = Math.round(y);
      g.fillRect(x, Y, spin === 1 ? 1 : 2, 2, spin === 0 ? 0xfff0b0 : 0xe0b040);
    }
  }
}
