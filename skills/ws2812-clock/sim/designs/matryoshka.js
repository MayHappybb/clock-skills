// Matryoshka: a whole set of Russian nesting dolls lined up on a black
// lacquer shelf, smallest to biggest, the way a set is shown off. The two
// big ones carry the time on their black aprons, painted in Khokhloma gold
// with red rowan berries: Mother holds the hour, her eldest the minutes.
// Everyone rocks on her round foot, sways, blinks; a light sweeps the gilding.
//
// Minute: the eldest shivers, her head is unscrewed (the scarf's dots spin
// round, her face turns away and back) and pops off out of the top of the
// panel; the doll inside leaps out of the cup with her back to us, the old
// cup drops through the shelf, she lands, swells to full size and turns round
// to show the new minutes on her apron.
// Hour: before it, the little ones nest, each hopping into the next bigger
// one and being screwed shut, the last into Mother; on the hour Mother and
// daughter both pop their heads in unison and turn round with the new time;
// then the set comes back out, one doll out of another, back into the line.
import * as kit from '../js/kit.js';
import { drawItem, shape, palette, SEAM } from './matryoshka-doll.js';

const W = 192, HC = 64, BASE = 60.6;
const img = new Float32Array(3 * W * HC);

const RED = kit.hex('#c41d18'), RED2 = kit.hex('#b0151a');
const P = {
  mother: palette({ body: kit.hex('#d88c10'), scarf: kit.hex('#cc1a14'), dots: kit.hex('#ffc640'), trim: kit.hex('#ffd060'), nDots: 11, flower: kit.hex('#b01010') }),
  daughter: palette({ body: RED2, scarf: kit.hex('#1f7d3c'), dots: kit.hex('#f0b830'), trim: kit.hex('#f2c050'), nDots: 10, flower: kit.hex('#3aa050') }),
  bGold: palette({ body: kit.hex('#e8a417'), scarf: kit.hex('#cc1a14'), dots: kit.hex('#ffc640'), trim: kit.hex('#ffd060'), flower: kit.hex('#b01010') }),
  bGreen: palette({ body: RED2, scarf: kit.hex('#1f7d3c'), dots: kit.hex('#f0b830'), trim: kit.hex('#f2c050'), flower: kit.hex('#3aa050') }),
};

// the set, left to right: five little ones, Mother (hours), daughter (minutes)
const SET = [
  { H: 8, rx: 0.34, pal: P.bGreen }, { H: 12, rx: 0.34, pal: P.bGold }, { H: 18, rx: 0.34, pal: P.bGreen },
  { H: 26, rx: 0.34, pal: P.bGold }, { H: 36, rx: 0.35, pal: P.bGreen },
  { H: 60, rx: 0.42, pal: P.mother }, { H: 56, rx: 0.42, pal: P.daughter },
];
{
  const gaps = [2.5, 2.5, 2.5, 2.5, 3, 6];
  let total = 0;
  SET.forEach((d, i) => { d.w = 2 * d.rx * d.H; total += d.w + (gaps[i] ?? 0); });
  let x = (W - total) / 2;
  SET.forEach((d, i) => {
    d.home = x + d.w / 2; x += d.w + (gaps[i] ?? 0);
    d.shape = shape(d.rx, i >= 5 ? 0.36 : 0.22);
    d.ph = kit.hash(i, 7) * 6.28; d.per = 2.1 + 1.3 * kit.hash(i, 3); d.z = i * 10;
  });
}
const MOM = 5, DAU = 6;

// ------------------------------------------------------------ item pool
const pool = [];
let used = 0;
function item() {
  if (used === pool.length) pool.push({ shape: null, pal: null, H: 0, x: 0, y: 0, anchor: 1, rot: 0, sx: 1, sy: 1, part: 0, yaw: 0, yawTop: 0, blink: 0, d0: -1, d1: -1, z: 0, glint: 0 });
  const it = pool[used++];
  it.anchor = 1; it.rot = 0; it.sx = 1; it.sy = 1; it.part = 0; it.yaw = 0; it.yawTop = 0; it.blink = 0; it.d0 = -1; it.d1 = -1;
  return it;
}
function put(d, x, y, rot, part, z) {
  const it = item();
  it.shape = d.shape; it.pal = d.pal; it.H = d.H; it.x = x; it.y = y; it.rot = rot; it.part = part; it.z = z;
  return it;
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const seg = (a, t0, t1) => clamp01((a - t0) / (t1 - t0));

/** Rest motion of doll i at time t: rock angle, yaw, blink. */
function rest(i, t, night) {
  const d = SET[i], small = d.H < 40;
  const amp = (small ? 0.06 : 0.032) * (1 - 0.5 * night);
  let rot = amp * Math.sin((t * 6.2832) / d.per + d.ph) + 0.012 * Math.sin(t * 1.7 + d.ph * 2);
  const yaw = 0.11 * Math.sin((t * 6.2832) / (d.per * 2.6) + d.ph * 1.3);
  // blink: one per ~4 s window, sometimes double
  const win = 3.9 + i * 0.37, k = Math.floor((t + d.ph) / win), lt = t + d.ph - k * win - kit.hash(k, i) * 2.6;
  let blink = lt > 0 && lt < 0.17 ? Math.sin((Math.PI * lt) / 0.17) : 0;
  if (kit.hash(k, i, 5) > 0.7 && lt > 0.3 && lt < 0.47) blink = Math.sin((Math.PI * (lt - 0.3)) / 0.17);
  if (night > 0.5) blink = 1;            // the set sleeps at night
  // a little one sometimes hops for joy
  let hop = 0;
  if (small) {
    const hk = Math.floor(t / 6.5), ht = t - hk * 6.5 - 1.5;
    if (Math.floor(kit.hash(hk, 11) * 5) === i && ht > 0 && ht < 0.42) hop = Math.sin((Math.PI * ht) / 0.42);
  }
  return { rot, yaw, blink, hop };
}

/** A whole doll at home, resting (or carried by the rest state r). */
function drawRest(i, r, dig, glint) {
  const d = SET[i];
  const it = put(d, d.home + 0.3 * d.H * r.rot, BASE - r.hop * 0.35 * d.H, r.rot + r.hop * 0.08 * Math.sin(d.ph), 0, d.z);
  it.yaw = r.yaw; it.yawTop = r.yaw; it.blink = r.blink; it.d0 = dig[0]; it.d1 = dig[1]; it.glint = glint;
}

/**
 * Doll i with her head lifted by o (0 closed .. 1 fully open), still at home:
 * the inside of the cup, then anything inside it (z + 2), the cup, the head.
 */
function drawOpen(i, o, r, dig, glint) {
  const d = SET[i], H = d.H;
  const bx = d.home + 0.3 * H * r.rot, rot = r.rot;
  if (o <= 0.001) { drawRest(i, r, dig, glint); return; }
  const sx = bx - Math.sin(rot) * (1 - SEAM) * H, sy = BASE - Math.cos(rot) * (1 - SEAM) * H;
  const it3 = put(d, sx, sy, rot, 3, d.z + 1); it3.anchor = SEAM;
  const it2 = put(d, bx, BASE, rot, 2, d.z + 3);
  it2.yaw = r.yaw; it2.yawTop = r.yaw; it2.d0 = dig[0]; it2.d1 = dig[1]; it2.glint = glint;
  const lift = o * Math.min(0.5 * H, 13), side = o * Math.min(0.18 * H, 4) + o * Math.max(0, H - 30) * 0.12;
  const it1 = put(d, sx + side, sy - lift, rot + o * 0.35, 1, d.z + 4);
  it1.anchor = SEAM; it1.yaw = r.yaw; it1.yawTop = r.yaw + 6.2832 * kit.ease.inOut(o); it1.blink = r.blink; it1.glint = glint;
}

/** How far the lid of a doll is open during a nesting event at local time e (0..1.3 s). */
const lidOpen = (e) => kit.ease.inOut(seg(e, 0, 0.32)) * (1 - kit.ease.inOut(seg(e, 0.95, 1.3)));

/** Doll j jumps between home and inside container c; f 0..1 out->in (or reversed by caller). */
function drawJump(j, c, f, toInside, glint) {
  const d = SET[j], C = SET[c];
  const inY = BASE + Math.max(0, d.H - (1 - SEAM) * C.H + 1.5);
  const ax = toInside ? d.home : C.home, bx = toInside ? C.home : d.home;
  const ay = toInside ? BASE : inY, by = toInside ? inY : BASE;
  const e = kit.ease.inOut(f);
  const apex = (1 - SEAM) * C.H + d.H * 0.15 + 3;
  const x = ax + (bx - ax) * e, y = ay + (by - ay) * f - apex * 4 * f * (1 - f) - (toInside ? 0 : 0);
  const dir = bx > ax ? 1 : -1;
  const it = put(d, x, y, dir * 0.45 * Math.sin(Math.PI * f), 0, C.z + 2);
  it.yaw = it.yawTop = 6.2832 * e * dir; it.glint = glint;
}

/**
 * The minute (or hour) swap of numeral doll i at local time a (0..3.3 s):
 * old doll shivers, head unscrewed and flung off, the inner doll leaps out
 * back-first, the old cup sinks through the shelf, she lands, grows, turns.
 */
const SWAP_END = 3.3;
function drawSwap(i, a, r, oldD, newD, glint, fly) {
  const d = SET[i], H = d.H;
  const shiver = 0.06 * Math.sin(a * 6.2832 * 7) * Math.sin(Math.PI * seg(a, 0, 0.5));
  const rot = r.rot * (1 - seg(a, 0, 0.3)) + shiver;
  const bx = d.home + 0.3 * H * rot;
  if (a < 0.35) { drawRest(i, { rot, yaw: r.yaw, blink: r.blink, hop: 0 }, oldD, glint); return; }
  const sxp = bx - Math.sin(rot) * (1 - SEAM) * H, syp = BASE - Math.cos(rot) * (1 - SEAM) * H;
  // the old head: unscrewed (0.35-0.95), then flung out of the top
  const un = kit.ease.inOut(seg(a, 0.35, 0.95)), ff = seg(a, 0.95, 1.55);
  if (ff < 1) {
    const it1 = put(SET[i], sxp + fly * (0.55 * H * ff + 6 * ff * ff), syp - 0.06 * H * un - H * (0.35 * ff + 1.5 * ff * ff), rot + fly * 3.2 * ff * ff, 1, 90);
    it1.anchor = SEAM; it1.yaw = r.yaw; it1.yawTop = r.yaw + 6.2832 * 1.5 * un + 4 * ff; it1.blink = 0; it1.glint = glint;
  }
  // the old cup sinks through the shelf
  const sink = (H + 4) * kit.ease.in(seg(a, 1.05, 1.45));
  if (sink < H + 3) {
    const it3 = put(d, sxp, syp + sink, rot, 3, d.z + 1); it3.anchor = SEAM;
    const it2 = put(d, bx, BASE + sink, rot, 2, d.z + 3);
    it2.yaw = r.yaw; it2.yawTop = r.yaw; it2.d0 = oldD[0]; it2.d1 = oldD[1]; it2.glint = glint;
  }
  // the doll inside: leaps out with her back to us, lands, grows, turns round
  const s0 = 0.62, jf = seg(a, 1.0, 1.62);
  const J = 0.62 * H;
  const y = BASE - J * 4 * jf * (1 - jf);
  const gf = seg(a, 1.62, 2.2), sc = s0 + (1 - s0) * kit.ease.outBack(gf);
  const land = seg(a, 1.62, 1.9), squash = Math.sin(Math.PI * land) * 0.13;
  const tf = seg(a, 1.45, 2.25), yaw = Math.PI * (1 - kit.ease.inOut(tf)) + r.yaw * tf;
  const settle = a > 2.25 ? 0.05 * Math.exp(-(a - 2.25) * 4) * Math.sin((a - 2.25) * 13) : 0;
  const it = put(d, bx, y, settle + 0.06 * fly * Math.sin(Math.PI * jf), 0, d.z + 2);
  it.sx = sc * (1 + squash * 0.6); it.sy = sc * (1 - squash); it.yaw = yaw; it.yawTop = yaw; it.blink = tf < 1 ? 0 : r.blink;
  it.d0 = newD[0]; it.d1 = newD[1]; it.glint = glint;
}

const pad2 = (n) => [Math.floor(n / 10), n % 10];
const NONE = [-1, -1];

export default {
  name: 'Matryoshka',
  blurb: 'a nesting-doll set on a lacquer shelf: Mother wears the hour, her daughter the minutes, painted in Khokhloma gold; each minute a new doll leaps out of the old, on the hour the whole set nests and unnests',
  layouts: ['hub-x3'], look: 'smoke', fps: 60, brightness: 0.45, dither: true,
  frame(ctx) {
    const date = ctx.date, night = ctx.night, dim = 1 - 0.6 * night;
    const t = (date.getTime() % 86400000) / 1000;
    const sec = kit.secOf(date), mi = date.getMinutes(), hr = date.getHours();
    const prev = new Date(date.getTime() - 60000);
    const curH = pad2(hr), curM = pad2(mi), oldH = pad2(prev.getHours()), oldM = pad2(prev.getMinutes());
    const glint = ((t % 9.5) / 9.5) * 330 - 70;
    used = 0;

    // nesting state of the little ones (0..4): -1 at home, else the index of the doll she is inside
    const R = SET.map((_, i) => rest(i, t, night));
    const preT = mi === 59 ? sec - 53.6 : -1;                    // little ones nest into Mother
    const postT = mi === 0 ? sec - 3.3 : -1;                     // and come back out after the hour
    // each little one k: jump[k] < 0 at home, 0..1 on her way from home into doll k+1, 2 inside
    const SP = 1.1, EV = 1.3;
    const jump = [-1, -1, -1, -1, -1], lid = [0, 0, 0, 0, 0, 0, 0];
    if (preT >= 0) {
      for (let k = 0; k < 5; k++) {
        const e = preT - k * SP;
        if (e >= 0 && e < EV) lid[k + 1] = lidOpen(e);
        jump[k] = e < 0.22 ? -1 : e < 0.92 ? seg(e, 0.22, 0.92) : 2;
      }
    } else if (postT >= 0) {
      for (let k = 0; k < 5; k++) {
        const e = postT - (4 - k) * SP;                          // the biggest first, out of Mother
        if (e >= 0 && e < EV) lid[k + 1] = lidOpen(e);
        jump[k] = e < 0.25 ? 2 : e < 0.95 ? 1 - seg(e, 0.25, 0.95) : -1;
      }
    } else if (mi === 0 && sec < SWAP_END) jump.fill(2);

    for (let k = 0; k < 5; k++) {
      const j = jump[k];
      if (j === 2) continue;
      if (j >= 0) drawJump(k, k + 1, j, true, glint);
      else if (lid[k] > 0) drawOpen(k, lid[k], R[k], NONE, glint);
      else drawRest(k, R[k], NONE, glint);
    }
    // Mother and daughter
    // Mother goes first, her daughter a beat behind: old hour gone before the
    // old minutes, new hour shown only once the old minutes are gone (never a mixed time)
    const HLAG = 0.25;
    const hourTurn = mi === 0 && sec < SWAP_END;
    const minTurn = sec < SWAP_END + (mi === 0 ? HLAG : 0) && (oldM[0] !== curM[0] || oldM[1] !== curM[1]);
    if (hourTurn) drawSwap(MOM, sec, R[MOM], oldH, curH, glint, -1);
    else if (lid[MOM] > 0) drawOpen(MOM, lid[MOM], R[MOM], curH, glint);
    else {
      const r = R[MOM];
      if (preT > 5 * SP) r.rot += 0.05 * Math.sin((preT - 5 * SP) * 9) * Math.exp(-(preT - 5 * SP) * 1.5); // full of babies
      drawRest(MOM, r, curH, glint);
    }
    if (minTurn) drawSwap(DAU, mi === 0 ? Math.max(0, sec - HLAG) : sec, R[DAU], oldM, curM, glint, 1);
    else drawRest(DAU, R[DAU], curM, glint);

    // draw back to front
    img.fill(0);
    const items = pool.slice(0, used).sort((a, b) => a.z - b.z);
    for (const it of items) drawItem(img, W, HC, it, dim);
    shelf(dim);
    kit.blitGrid(ctx, img);
  },
};

/** The shelf: black lacquer with a gilded edge that mirrors the dolls faintly. */
function shelf(dim) {
  const top = 61;
  for (let y = top; y < HC; y++) {
    const src = 2 * top - y - 2, k = y === top ? 0 : 0.10 / (y - top);
    for (let x = 0; x < W; x++) {
      const o = 3 * (y * W + x), s = 3 * (src * W + x);
      if (y === top) { img[o] = 0.16 * dim; img[o + 1] = 0.075 * dim; img[o + 2] = 0.012 * dim; }
      else { img[o] = img[s] * k; img[o + 1] = img[s + 1] * k; img[o + 2] = img[s + 2] * k; }
    }
  }
}
