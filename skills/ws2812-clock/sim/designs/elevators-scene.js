// The Otis, the scenery: sky over the roof (follows the real sun), roof
// with machine rooms and water tower, the apartments between the shafts,
// the lobby with its floor-indicator needle, and the street.
import * as kit from '../js/kit.js';
import * as G from './elevators-gfx.js';

const C = kit.hex;
export const ROOMS_X0 = 44, ROOMS_X1 = 84;
const floorTop = (f) => 30 + (9 - f) * 15;
const SKIN = C('#e0a070'), HAIR = C('#3a2418'), PANTS = C('#2a2c40'), DARK = [0.008, 0.008, 0.01];
const SLAB = C('#34343a'), SILL = C('#5c5c64');

/** Hours as a float, local wall clock. */
export const hoursF = (d) => d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
export const daylight = (hf) => kit.smoothstep(5.8, 7.6, hf) * (1 - kit.smoothstep(18.2, 19.9, hf));
const twilight = (hf) => Math.max(0, 1 - Math.abs(hf - 6.7) / 1.1) + Math.max(0, 1 - Math.abs(hf - 19.1) / 1.1);

// ------------------------------------------------------------------ sky
const STARS = Array.from({ length: 34 }, (_, i) => [kit.hash(i, 1) * 128, kit.hash(i, 2) * 24, kit.hash(i, 3)]);
export function drawSky(now, date, hourAge) {
  const hf = hoursF(date), day = daylight(hf), tw = twilight(hf);
  for (let y = 0; y < 30; y++) {
    const t = y / 29;
    const r = kit.lerp(0.002, 0.012, t) * (1 - day) + day * kit.lerp(0.03, 0.12, t) + tw * 0.32 * t * t;
    const g = kit.lerp(0.003, 0.014, t) * (1 - day) + day * kit.lerp(0.08, 0.18, t) + tw * 0.11 * t * t;
    const b = kit.lerp(0.012, 0.04, t) * (1 - day) + day * kit.lerp(0.22, 0.28, t) + tw * 0.05 * t;
    const k = hourAge >= 0 && hourAge < 9 ? 1 - 0.85 * kit.smoothstep(0.3, 1.2, hourAge) * (1 - kit.smoothstep(6.2, 7.8, hourAge)) : 1;
    for (let x = 0; x < 128; x++) G.set(x, y, [r * k, g * k, b * k]);
  }
  const night = 1 - day;
  if (night > 0.05) for (const [x, y, k] of STARS) {
    const tw2 = 0.5 + 0.5 * Math.sin(now * (1.3 + 2 * k) + k * 40);
    G.add(Math.floor(x), Math.floor(y), [0.5, 0.5, 0.55], night * (0.15 + 0.35 * tw2) * (k > 0.7 ? 1.4 : 0.8));
  }
  // sun by day, a crescent moon by night, each on its arc
  const skyK = hourAge >= 0 && hourAge < 9 ? 1 - 0.85 * kit.smoothstep(0.3, 1.2, hourAge) * (1 - kit.smoothstep(6.2, 7.8, hourAge)) : 1;
  if (day > 0.02) {
    const u = (hf - 6) / 13, sx = 4 + 120 * u, sy = 25 - 21 * Math.sin(Math.PI * kit.clamp(u));
    G.splat(sx, sy, 7, [1, 0.75, 0.4], 0.25 * day * skyK);
    G.disc(sx, sy, 2.4, kit.scale(kit.mix([1, 0.5, 0.15], [1, 0.95, 0.75], kit.smoothstep(0, 0.3, Math.sin(Math.PI * kit.clamp(u)))), skyK), day);
  } else {
    const hn = (hf + 24 - 19) % 24, u = hn / 12, mx = 6 + 116 * u, my = 24 - 18 * Math.sin(Math.PI * kit.clamp(u));
    G.disc(mx, my, 2.5, [0.55, 0.55, 0.45], night);
    G.disc(mx + 1.3, my - 0.6, 2.2, [r0(), 0.003, 0.012], night);
  }
  // clouds drift over by day
  if (day > 0.05) for (let i = 0; i < 3; i++) {
    const cx = ((now * (0.6 + 0.2 * i) + i * 53) % 170) - 20, cy = 6 + 6 * i;
    for (let k = 0; k < 4; k++) G.splat(cx + k * 3.2, cy + (k % 2) * 0.8, 3.2, [0.35, 0.37, 0.4], 0.35 * day * skyK);
  }
  if (hourAge >= 0 && hourAge < 9) fireworks(hourAge);
}
const r0 = () => 0.004;

// ---------------------------------------------------------- fireworks
const FW = [C('#ffc860'), C('#ff6a8a'), C('#9fe8ff'), C('#ffffff'), C('#ffa040')];
function fireworks(t) {
  for (let i = 0; i < 10; i++) {
    const t0 = 0.9 + i * 0.5 + 0.3 * kit.hash(i, 5), tt = t - t0;
    if (tt < 0 || tt > 2.4) continue;
    const bx = 12 + 104 * kit.hash(i, 6), by = 6 + 7 * kit.hash(i, 7), col = FW[i % FW.length];
    const rise = 0.55;
    if (tt < rise) {                                    // the rocket climbs from the parapet
      const k = kit.ease.out(tt / rise), y = kit.lerp(28, by, k);
      G.splat(bx, y, 1.3, [1, 0.8, 0.5], 0.9);
      G.splat(bx, y + 2, 1.2, [1, 0.5, 0.2], 0.3);
      continue;
    }
    const s = tt - rise, fade = Math.max(0, 1 - s / 1.8), n = 28;
    if (s < 0.3) { const fl = kit.smoothstep(0, 0.07, s) * (1 - s / 0.3); G.splat(bx, by, 6, [1, 0.95, 0.85], 1.2 * fl); G.splat(bx, 26, 30, col, 0.12 * fl); }
    // a trail behind each spark

    for (let j = 0; j < n; j++) {
      const a = (j / n) * kit.TAU + i, v = 19 * (0.75 + 0.35 * kit.hash(i, j));
      const d = v * (1 - Math.exp(-2.2 * s)) / 2.2;
      const x = bx + Math.cos(a) * d, y = by + Math.sin(a) * d * 0.9 + 3 * s * s;
      if (y > 29) continue;
      const sp = fade * fade * (s > 1.1 ? (kit.hash(i, j, Math.floor(s * 20)) > 0.4 ? 1 : 0.2) : 1);
      G.splat(x, y, 1.4, col, 0.9 * sp);
      const d2 = v * (1 - Math.exp(-2.2 * Math.max(0, s - 0.08))) / 2.2;
      G.splat(bx + Math.cos(a) * d2, by + Math.sin(a) * d2 * 0.9 + 3 * (s - 0.08) ** 2, 1.1, col, 0.35 * sp);
    }
  }
}

/** The burst light that falls on the house: sum of fresh bursts' colours. */
export function washAt(t) {
  const w = [0, 0, 0];
  if (t < 0 || t > 9) return w;
  for (let i = 0; i < 10; i++) {
    const s = t - (0.9 + i * 0.5 + 0.3 * kit.hash(i, 5)) - 0.55;
    if (s < 0 || s > 0.9) continue;
    const k = kit.smoothstep(0, 0.08, s) * (1 - s / 0.9) ** 2, c = FW[i % FW.length];
    w[0] += c[0] * k; w[1] += c[1] * k; w[2] += c[2] * k;
  }
  return w;
}
// ---------------------------------------------------------------- roof
const WOOD = C('#7a4a22'), WOOD_D = C('#4a2a12'), HOOP = C('#5a5a60'), BRICK = C('#40261c');
const BULBS = [C('#ffcc66'), C('#ff6060'), C('#60c0ff'), C('#80ff90')];
export function drawRoof(now, date, sts, hourAge) {
  const hf = hoursF(date), day = daylight(hf), lit = 0.35 + 0.65 * day;
  const party = hourAge >= 0.6 && hourAge < 12 ? Math.min(1, (hourAge - 0.6) / 0.6, (12 - hourAge) / 1.5) : 0;
  // roof slab and parapet
  G.rect(0, 28, 128, 30, SLAB);
  G.rect(0, 26, 2, 28, SLAB); G.rect(126, 26, 128, 28, SLAB);
  // machine rooms over the two shaft pairs, cut open: hoist sheaves turn with the cars
  for (const [x0, ss] of [[22, [1]], [104, [3]]]) {
    G.rect(x0, 18, x0 + 15, 28, kit.scale(BRICK, lit));
    G.rect(x0 + 1, 19, x0 + 14, 27.5, [0.02, 0.018, 0.02]);
    G.rect(x0 - 1, 17, x0 + 16, 18, SLAB);
    for (const s of ss) {
      const st = sts[s], side = s === 0 || s === 2 ? -1 : 1;
      const cx = (side < 0 ? [11, 23, 93, 105][s] + 1 : [11, 23, 93, 105][s] + 3) + 4, cy = 23;
      const ang = st.pos * 2.4;
      G.disc(cx, cy, 2.9, C('#6a6e78'));
      G.disc(cx, cy, 1.9, [0.03, 0.03, 0.035]);
      for (let k = 0; k < 3; k++) {
        const a = ang + (k * kit.TAU) / 3;
        G.line(cx, cy, cx + Math.cos(a) * 2.2, cy + Math.sin(a) * 2.2, C('#9aa0aa'), 0.9, 0.8);
      }
      G.disc(cx, cy, 0.7, C('#c0a060'));
      // a red run lamp glows while that lift travels
      G.splat(cx + side * -4.5, 20.5, 1.2, [1, 0.15, 0.05], st.moving ? 0.9 : 0.12);
    }
  }
  // the water tower
  const cx = 64;
  for (const lx of [58.5, 69.5]) G.line(lx, 17, lx, 28, WOOD_D, lit, 1);
  G.line(58.5, 18, 69.5, 27, WOOD_D, 0.7 * lit, 0.7); G.line(69.5, 18, 58.5, 27, WOOD_D, 0.7 * lit, 0.7);
  for (let x = 57; x < 72; x++) G.rect(x, 7, x + 1, 17, kit.scale(x % 2 ? WOOD : WOOD_D, lit * (1 - Math.abs(x - 64) / 16)));
  for (const y of [8.5, 12, 15.5]) G.rect(56.6, y, 71.4, y + 0.7, kit.scale(HOOP, lit));
  for (let y = 2; y < 7; y++) { const w = (y - 1.5) * 1.6; G.rect(cx - w, y, cx + w, y + 1, kit.scale(WOOD_D, lit)); }
  G.rect(63.6, 0.5, 64.4, 2.2, kit.scale(HOOP, lit));
  // string lights from the machine rooms to the tower
  const evening = 1 - day;
  for (const [ax, bx] of [[37, 57], [71, 104]]) {
    for (let k = 0; k <= 8; k++) {
      const u = k / 8, x = kit.lerp(ax, bx, u), y = 19 + 3.2 * Math.sin(Math.PI * u);
      G.add(Math.floor(x), Math.floor(y), [0.12, 0.1, 0.08], 0.6);
      const on = party > 0 ? (Math.floor(now * 5 + k) % 3 ? 1 : 0.2) : 0.5 + 0.5 * Math.sin(now * 1.5 + k);
      G.splat(x, y + 0.6, 1.1, BULBS[k % 4], (0.25 * evening + party) * on);
    }
  }
  // the hour's roof party
  if (party > 0) for (let i = 0; i < 6; i++) {
    const x = (i < 3 ? 41 : 76) + (i % 3) * 4.2 + 0.6 * Math.sin(now * 2 + i), hop = Math.abs(Math.sin(now * 7 + i * 1.7)) * 1.3;
    person(x, 28 - hop, [C('#e04050'), C('#40a0e0'), C('#f0c030'), C('#a050d0'), C('#40c070'), C('#f07030')][i], party, true, now + i);
  }
}

/** A resident, 3 x 8, feet at yb. arms: raised (dance) or not. */
export function person(x, yb, shirt, a = 1, armsUp = false, ph = 0, pants = PANTS) {
  G.rect(x + 0.5, yb - 8, x + 2.5, yb - 6, SKIN, a);
  G.rect(x + 0.5, yb - 8.4, x + 2.5, yb - 7.5, HAIR, a);
  G.rect(x, yb - 6, x + 3, yb - 2.6, shirt, a);
  const sw = Math.sin(ph * 6) * 0.4;
  G.rect(x + 0.2 + sw, yb - 2.6, x + 1.3 + sw, yb, pants, a);
  G.rect(x + 1.7 - sw, yb - 2.6, x + 2.8 - sw, yb, pants, a);
  if (armsUp) {
    const w = Math.sin(ph * 5) * 1.2;
    G.line(x, yb - 5.5, x - 1 + w * 0.3, yb - 8.5, SKIN, a, 0.8);
    G.line(x + 3, yb - 5.5, x + 4 - w * 0.3, yb - 8.5, SKIN, a, 0.8);
  }
}
/** The hour: the house goes dark floor by floor from the top (0..1 s), the
 *  fireworks go up, and the lights come back from the lobby up (6..7.5 s). */
export function hourShow(t, fl) {
  if (t < 0 || t > 9) return 1;
  const off = kit.smoothstep(0.1 * (9 - fl), 0.1 * (9 - fl) + 0.18, t);
  const on = kit.smoothstep(6 + 0.13 * fl, 6 + 0.13 * fl + 0.1, t);
  return 1 - off + on * off;
}
// --------------------------------------------------------------- rooms
// When each flat is at home and awake (hours); lamps flick on and off
// within that, at moments hashed per two-minute slot.
export const AWAKE = {
  29: [[9, 18], [19, 23]], 28: [[7, 20]], 27: [[7, 20.5]], 26: [[8, 22]], 25: [[6.5, 8], [21.5, 23]], 24: [[6, 24.5]],
  39: [[6, 21]], 38: [[6, 8], [18, 21]], 37: [[19, 25]],
  9: [[7, 9.5], [17.5, 24.5]], 8: [[6.5, 8], [21, 23.2]], 7: [[8, 10], [16, 25.5]], 6: [[6, 8.5], [18, 24]],
  5: [[6, 24]], 3: [[11, 14], [19, 26.5]], 2: [[8.5, 18.5], [20, 22]], 1: [[7, 23]],
};
export const inWin = (w, hf) => w.some(([a, b]) => (hf >= a && hf < b) || (hf + 24 >= a && hf + 24 < b));
export function lampLevel(fl, now, date) {
  const seg = Math.floor(now / 120), sw = seg * 120 + 120 * kit.hash(fl, seg, 11);
  const S = (b) => (inWin(AWAKE[fl], hoursF(new Date(b * 120000))) && kit.hash(fl, b, 1) > 0.12 ? 1 : 0);
  const a = S(seg - 1), b = S(seg);
  if (a === b) return a;
  const k = kit.smoothstep(sw, sw + 0.3, now);
  // a lamp coming on stutters once
  const st = b && now > sw && now < sw + 0.25 && Math.floor((now - sw) * 30) % 3 === 1 ? 0.3 : 1;
  return kit.lerp(a, b, k) * st;
}
/** Light the room block [x0..x1) x [y0..y1): lamp warm, day cool, else a dim night blue. */
export function lightRoom(fl, x0, y0, x1, y1, now, date, hourAge, lamp, wf = fl) {
  const day = daylight(hoursF(date));
  let kr = Math.max(lamp * 1.35, day * 1.05, 0.16), kg = Math.max(lamp * 1.1, day * 1.1, 0.16), kb = Math.max(lamp * 0.8, day * 1.2, 0.25);
  if (hourAge >= 6 && hourAge < 9) {          // the lights come back on, a wave up the house
    const f = Math.exp(-(((hourAge - 6 - 0.13 * wf) / 0.14) ** 2));
    kr += 2.6 * f; kg += 2.2 * f; kb += 1.6 * f;
  }
  G.scaleBlock(x0, y0, x1, y1, kr, kg, kb);
}
function wallpaper(y0, h, col, stripe) {
  for (let x = ROOMS_X0; x < ROOMS_X1; x++) {
    const k = stripe && x % stripe === 0 ? 1.35 : 1;
    G.rect(x, y0, x + 1, y0 + h - 1, kit.scale(col, k));
  }
  G.rect(ROOMS_X0, y0 + h - 1, ROOMS_X1, y0 + h, C('#3a3634'));   // floorboards
}
function slab(y0) { G.rect(ROOMS_X0, y0 + 13, ROOMS_X1, y0 + 15, SLAB); G.rect(ROOMS_X0, y0 + 13, ROOMS_X1, y0 + 13.5, SILL, 0.4); }

// the owner's frog, bold: outline, flat rainbow bands, big white-rimmed glasses, a smile
const FROG = G.sprite([
  '...KKKK..KKKK...',
  '..KWWWWKKWWWWK..',
  '.KWllllWWllllWK.',
  '.KWlpllWWlpllWK.',
  '.KWllllWWllllWK.',
  '.KWllllWWllllWK.',
  '.KrWWWWrrWWWWrK.',
  'KrrrrrrrrrrrrrrK',
  'KoKoooooooooKooK',
  'KooKKooooooKKooK',
  'KyyyyKKKKKKyyyyK',
  'KyyyyyyyyyyyyyyK',
  'KggggggggggggggK',
  'KggggggggggggggK',
  'KbbbbbbbbbbbbbbK',
  'KvvvvvvvvvvvvvvK',
  '.KvvK......KvvK.',
  'KKKK........KKKK',
], { K: [0.004, 0.004, 0.006], W: [0.95, 0.95, 0.92], l: [0.05, 0.09, 0.14], p: [0.9, 0.95, 1],
  r: C('#ff3a30'), o: C('#ff8a1a'), y: C('#ffd820'), g: C('#38d048'), b: C('#3a78ff'), v: C('#a040e8') });

const CAT = G.sprite([
  'c...c..',
  'ccccc..',
  'cecec..',
  'ccncc..',
  '.cccc..',
  '.ccccc.',
  'cccccc.',
], { c: C('#e07a28'), e: C('#b8ff40'), n: C('#ff90a0') });

/** Each flat's furniture and resident. y0 = top of the floor's interior (13 rows). */
function room9(y0, now) {          // penthouse: the pianist
  wallpaper(y0, 13, C('#1c3432'), 4);
  G.rect(46, y0 + 4, 49, y0 + 12, C('#3a2a20')); G.splat(47.5, y0 + 4, 3, [0.2, 0.6, 0.2], 0.8);   // potted palm
  G.rect(66, y0 + 3, 79, y0 + 12, C('#4a2818')); G.rect(66, y0 + 3, 79, y0 + 4, C('#6a3a20')); G.rect(66, y0 + 7, 79, y0 + 8, C('#a8a090'));     // upright piano, keys
  G.rect(67, y0 + 8.5, 78, y0 + 11.5, C('#2a160c'));
  const sway = 0.5 * Math.sin(now * 1.9);
  person(61.5 + sway, y0 + 12, C('#2a2a50'));
  G.line(64 + sway, y0 + 7.5, 67, y0 + 7.5 + 0.5 * Math.abs(Math.sin(now * 8)), SKIN, 1, 0.8);
  for (let k = 0; k < 3; k++) {     // notes drifting up from the piano
    const t = kit.fract(now / 3 + k / 3), x = 70 + 6 * t + Math.sin(now * 2 + k) * 1.2, y = y0 + 4 - 4 * t + 2;
    G.rect(x, y, x + 1, y + 1, C('#f0e8a0'), Math.sin(Math.PI * t));
  }
  G.rect(54, y0 + 1, 55, y0 + 3, C('#4a3a2a')); G.splat(54.5, y0 + 3.5, 2.5, [1, 0.8, 0.5], 0.6);  // pendant
}
function room8(y0, now, date) {    // bedroom
  wallpaper(y0, 13, C('#2e1e34'), 0);
  const hf = hoursF(date), asleep = !inWin(AWAKE[8], hf);
  G.rect(47, y0 + 6, 48, y0 + 12, C('#6a4a30'));                     // headboard
  G.rect(48, y0 + 9, 66, y0 + 11, C('#a09890')); G.rect(48, y0 + 11, 66, y0 + 12, C('#5a3a28'));
  if (asleep) {
    const br = 0.35 * Math.sin(now * 1.6);
    G.rect(48.5, y0 + 7.5, 51.5, y0 + 9.5, C('#e8e0d8'));             // pillow
    G.disc(51, y0 + 7.8, 1.3, SKIN);
    G.rect(52, y0 + 7.5 - br, 65, y0 + 9.5, C('#4060b0'));            // blanket breathing
    for (let k = 0; k < 3; k++) {
      const t = kit.fract(now / 4 + k / 3);
      G.rect(53 + 4 * t + k, y0 + 5 - 4 * t, 54 + 4 * t + k, y0 + 6 - 4 * t, [0.7, 0.7, 0.9], Math.sin(Math.PI * t) * 0.8);
    }
  } else {
    G.rect(52, y0 + 8, 65, y0 + 9.5, C('#4060b0'));
    person(50.5, y0 + 9.5, C('#e8c8d8'));                               // sitting up, reading
    G.rect(53.5, y0 + 4.5, 55.5, y0 + 6, C('#f0f0e0'));
  }
  G.rect(69, y0 + 9, 72, y0 + 12, C('#6a4a30'));                     // nightstand + lamp
  G.rect(70, y0 + 6.5, 71, y0 + 9, C('#c0a060'));
  G.rect(75, y0 + 2, 82, y0 + 12, C('#5a3a28')); G.rect(78.4, y0 + 2, 78.6, y0 + 12, [0.02, 0.01, 0.01]);   // wardrobe
}
function room7(y0, now, date, lamp) {   // living room: the cat and the telly
  wallpaper(y0, 13, C('#3a3018'), 5);
  G.rect(47, y0 + 6, 66, y0 + 9, C('#7a2830')); G.rect(46, y0 + 8, 67, y0 + 11, C('#8a3038'));   // sofa
  G.rect(47, y0 + 11, 48, y0 + 12, C('#2a1a10')); G.rect(65, y0 + 11, 66, y0 + 12, C('#2a1a10'));
  const ear = Math.floor(now * 0.7) % 7 === 0 ? 0.4 : 0;
  G.blit(CAT, 55, y0 + 1.6 + ear * 0.2);
  const tl = Math.sin(now * 2.3) * 2.5;
  G.line(61, y0 + 7.4, 63 + tl * 0.3, y0 + 5 + Math.abs(tl) * 0.3, C('#e07a28'), 1, 1);
  G.rect(73, y0 + 9, 82, y0 + 12, C('#3a2a1a'));                     // TV stand
  G.rect(74, y0 + 3, 81, y0 + 8.5, C('#151515'));
}
function room7tv(y0, now, on) {
  if (!on) return;
  const ch = Math.floor(now / 3.7), fl = 0.75 + 0.25 * kit.hash(Math.floor(now * 8), 3);
  const col = [[0.3, 0.5, 1], [0.4, 1, 0.5], [1, 0.6, 0.3], [0.8, 0.8, 1]][Math.floor(kit.hash(ch, 4) * 4)];
  G.rect(74.6, y0 + 3.6, 80.4, y0 + 7.9, col, 0.8 * fl);
  G.splat(70, y0 + 6, 16, col, 0.05 * fl);
}
function room6(y0, now) {          // study with the big aquarium
  wallpaper(y0, 13, C('#24242e'), 0);
  G.rect(46, y0 + 9, 63, y0 + 12, C('#3a2a1a'));                     // cabinet
  G.rect(46.5, y0 + 2, 62.5, y0 + 9, [0.01, 0.02, 0.025]);
  G.rect(70, y0 + 6, 77, y0 + 12, C('#6a3a2a')); G.rect(70, y0 + 4, 71.5, y0 + 9, C('#6a3a2a'));   // armchair
  person(72, y0 + 9.5, C('#50a070'));
  const flip = kit.fract(now / 9) < 0.06 ? 1 : 0;
  G.rect(75, y0 + 4.5, 77.5 - flip, y0 + 6, C('#f0f0e0'));          // book, a page turns
  G.rect(80, y0 + 3, 81, y0 + 12, C('#3a3a3a')); G.rect(78.5, y0 + 2, 82, y0 + 3.5, C('#e0c080'));  // floor lamp
}
function room6glow(y0, now, lamp) {
  G.glow(46.5, y0 + 2, 62.5, y0 + 9, [0.02, 0.12, 0.14], 1);
  for (let k = 0; k < 4; k++) {
    const t = now * (0.08 + 0.03 * k) + k * 0.3, u = 0.5 + 0.5 * Math.sin(t * kit.TAU);
    const x = 48 + 12 * u, y = y0 + 4 + k * 1.2 + 0.4 * Math.sin(now * 1.3 + k), dir = Math.cos(t * kit.TAU);
    const col = [C('#ff8030'), C('#ffd040'), C('#60c0ff'), C('#ff5080')][k];
    G.rect(x, y, x + 1.6, y + 1, col);
    G.rect(dir > 0 ? x - 0.8 : x + 1.6, y + 0.1, dir > 0 ? x : x + 2.4, y + 0.9, col, 0.6);
  }
  for (let k = 0; k < 3; k++) {
    const t = kit.fract(now / 2.6 + k / 3);
    G.add(Math.floor(58 + k), Math.floor(y0 + 8.5 - 6 * t), [0.25, 0.5, 0.55], 0.6);
  }
  if (lamp > 0.05) G.splat(80, y0 + 4, 5, [1, 0.75, 0.4], 0.25 * lamp);
}
function kitchen(y0, now) {       // floors 5 and 4 knocked through: the frog's kitchen
  const h = 28;
  for (let y = y0; y < y0 + h - 1; y++) for (let x = ROOMS_X0; x < ROOMS_X1; x++) {
    const tile = (x % 4 === 0 || y % 4 === 0) ? 0.75 : 1;
    G.set(x, y, kit.scale(C('#2a3a2e'), tile));
  }
  G.rect(ROOMS_X0, y0 + h - 1, ROOMS_X1, y0 + h, C('#3a3634'));
  // fridge, shelf of jars, hanging lamp
  G.rect(45, y0 + 9, 53, y0 + 27, C('#5a5a56')); G.rect(45, y0 + 15, 53, y0 + 15.5, C('#808078'));
  G.rect(51.5, y0 + 11, 52.2, y0 + 14, C('#808078')); G.rect(51.5, y0 + 17, 52.2, y0 + 21, C('#808078'));
  G.rect(45, y0 + 5, 56, y0 + 5.7, C('#6a4a30'));
  [C('#e05030'), C('#f0c040'), C('#50a050'), C('#d0d0e0')].forEach((c, k) => G.rect(46 + k * 2.6, y0 + 2.6, 47.6 + k * 2.6, y0 + 5, c));
  G.line(62, y0, 62, y0 + 4, C('#4a3a2a'), 1, 0.7); G.rect(60.5, y0 + 4, 63.5, y0 + 5.4, C('#c08030'));
  // stove: enamel body, oven door, pan on a blue flame, hood above
  G.rect(72, y0 + 19, 83, y0 + 27, C('#5a5652')); G.rect(73.5, y0 + 21, 81.5, y0 + 25.5, C('#202020'));
  G.rect(71, y0 + 6, 84, y0 + 8.5, C('#9a9a9a')); G.rect(74, y0 + 3, 81, y0 + 6, C('#7a7a7a'));
  G.rect(74, y0 + 16.5, 81, y0 + 18.5, C('#2a2a2e')); G.rect(68.5, y0 + 17, 74, y0 + 17.7, C('#2a2a2e'));   // pan + handle
  // the frog, stirring; a little bob in time with the spoon
  const st = Math.sin(now * 3.4), bob = 0.35 * Math.abs(st);
  const ph = kit.fract(now / 6.5), hop = ph < 0.07 ? 2.2 * Math.sin(Math.PI * ph / 0.07) : 0;   // a happy little hop now and then
  G.blit(FROG, 55.5, y0 + 10 - hop);
  const hx = 70.5, hy = y0 + 19.5 - bob, sx = 76 + 1.6 * st, sy = y0 + 15.5 + 0.5 * Math.cos(now * 3.4);
  G.line(hx, hy, sx, sy, C('#38d048'), 1, 1.3);
  G.line(sx, sy, sx + 0.3, sy + 2.2, C('#b08050'), 1, 0.8);       // wooden spoon
}
function kitchenGlow(y0, now, lamp) {
  const fl = 0.8 + 0.2 * kit.noise2(now * 7, 1);
  for (let k = 0; k < 5; k++) G.add(74.5 + k * 1.4 | 0, y0 + 18 | 0 + 0, [0.15, 0.3, 1], 0.7 * fl);
  G.rect(74, y0 + 18.4, 81, y0 + 19, [0.2, 0.4, 1], 0.6 * fl);
  for (let k = 0; k < 5; k++) {       // steam curls up into the hood
    const t = kit.fract(now / 2.2 + k / 5), x = 77.5 + 2.2 * Math.sin(now * 1.7 + k * 2 + t * 4), y = y0 + 16 - 8 * t;
    G.splat(x, y, 1.6 + t, [0.5, 0.5, 0.5], 0.22 * Math.sin(Math.PI * t));
  }
  if (lamp > 0.05) G.splat(62, y0 + 6, 9, [1, 0.7, 0.35], 0.12 * lamp);
}
const DANCERS = [C('#e04050'), C('#40a0e0'), C('#f0c030')];
function room3(y0, now) {         // the party flat
  wallpaper(y0, 13, C('#16142a'), 0);
  for (let i = 0; i < 3; i++) {
    const x = 52 + i * 9 + 1.2 * Math.sin(now * 1.1 + i * 2), hop = Math.abs(Math.sin(now * 4.4 + i)) * 0.9;
    person(x, y0 + 12 - hop, DANCERS[i], 1, i !== 1, now + i * 0.7);
  }
  G.rect(46, y0 + 6, 49, y0 + 12, C('#2a2a2a')); G.disc(47.5, y0 + 8, 1.1, C('#606060'));   // speaker
}
function room3glow(y0, now, party) {
  G.disc(64, y0 + 2, 1.5, [0.6, 0.6, 0.65]);
  if (party <= 0) return;
  for (let k = 0; k < 4; k++) {     // the mirror ball's spots sweep the walls
    const a = now * 1.6 + k * kit.TAU / 4, x = 64 + 18 * Math.sin(a), y = y0 + 6 + 3 * Math.cos(a * 1.3);
    const col = [[1, 0.3, 0.5], [0.3, 0.6, 1], [1, 0.8, 0.3], [0.5, 1, 0.6]][k];
    if (x > 45 && x < 83) G.splat(x, y, 2.2, col, 0.5 * party);
  }
  G.splat(64, y0 + 2, 2.5, [1, 1, 1], 0.25 * party * (0.6 + 0.4 * Math.sin(now * 9)));
}
function room2(y0, now, date) {   // the home office
  wallpaper(y0, 13, C('#262a24'), 6);
  G.rect(46, y0 + 2, 52, y0 + 12, C('#4a3020'));                     // bookshelf
  for (let s = 0; s < 3; s++) for (let b = 0; b < 4; b++)
    G.rect(46.5 + b * 1.4, y0 + 3 + s * 3, 47.5 + b * 1.4, y0 + 5 + s * 3, [C('#a03030'), C('#3050a0'), C('#c0a040'), C('#40804a')][(b + s) % 4]);
  G.rect(60, y0 + 8, 78, y0 + 9, C('#6a4a30')); G.rect(61, y0 + 9, 62, y0 + 12, C('#6a4a30')); G.rect(76, y0 + 9, 77, y0 + 12, C('#6a4a30'));
  G.rect(68, y0 + 3, 75, y0 + 7.5, C('#181818')); G.rect(71, y0 + 7.5, 72, y0 + 8, C('#181818'));
  const at = inWin(AWAKE[2], hoursF(date));
  if (at) {
    const tap = Math.sin(now * 14) > 0.3 ? 0.4 : 0;
    person(63, y0 + 10.5, C('#c06030'));
    G.line(66, y0 + 6, 67.5, y0 + 7.6 + tap, SKIN, 1, 0.8);
  }
}
function room2glow(y0, now, on) {
  const s = on ? 1 : 0.35, t = Math.floor(now * 2);
  G.rect(68.6, y0 + 3.6, 74.4, y0 + 7, [0.25, 0.45, 0.6], 0.8 * s);
  if (on) for (let k = 0; k < 3; k++) G.rect(69.2, y0 + 4.2 + k * 0.9, 69.2 + 4.5 * kit.hash(t, k), y0 + 4.7 + k * 0.9, [0.9, 0.95, 1], 0.6);
}
function room1(y0, now) {         // the laundry: drums always turning
  wallpaper(y0, 13, C('#1e2a36'), 3);
  for (const x of [47, 57]) {
    G.rect(x, y0 + 3, x + 9, y0 + 12, C('#6a6a72'));
    G.disc(x + 4.5, y0 + 7.8, 3.1, C('#6a6a70'));
    G.disc(x + 4.5, y0 + 7.8, 2.4, [0.05, 0.08, 0.14]);
    G.rect(x + 1, y0 + 3.6, x + 3, y0 + 4.4, C('#40a0ff'));
  }
  person(72, y0 + 12, C('#d06090'), 1, false, 0);                     // folding sheets
  G.rect(75 + 0.6 * Math.sin(now * 2.2), y0 + 6, 80, y0 + 7.4, C('#f0f0f8'));
}
function room1glow(y0, now) {
  for (const [x, v] of [[47, 4.2], [57, -2.9]]) {
    const a = now * v;
    for (let k = 0; k < 3; k++) {
      const b = a + k * kit.TAU / 3;
      G.disc(x + 4.5 + Math.cos(b) * 1.3, y0 + 7.8 + Math.sin(b) * 1.3, 0.8, [C('#e05050'), C('#f0f0f0'), C('#5070e0')][k], 0.8);
    }
  }
}

export function drawRooms(now, date, hourAge) {
  const party = kit.smoothstep(18.8, 19.2, hoursF(date)) || kit.smoothstep(0, 0.1, (2.5 - hoursF(date)));
  const hourParty = hourAge >= 0 && hourAge < 12 ? 1 : 0;
  const L = {};
  for (const f of [9, 8, 7, 6, 5, 3, 2, 1]) L[f] = lampLevel(f, now, date);
  const y = (f) => floorTop(f);
  room9(y(9), now); slab(y(9)); lightRoom(9, 44, y(9), 84, y(9) + 13, now, date, hourAge, L[9]);
  room8(y(8), now, date); slab(y(8)); lightRoom(8, 44, y(8), 84, y(8) + 13, now, date, hourAge, L[8]);
  room7(y(7), now, date); slab(y(7)); lightRoom(7, 44, y(7), 84, y(7) + 13, now, date, hourAge, L[7]);
  room7tv(y(7), now, L[7] > 0.5 || inWin([[20, 25]], hoursF(date)));
  room6(y(6), now); slab(y(6)); lightRoom(6, 44, y(6), 84, y(6) + 13, now, date, hourAge, L[6]);
  room6glow(y(6), now, L[6]);
  kitchen(y(5), now); slab(y(4)); lightRoom(5, 44, y(5), 84, y(5) + 28, now, date, hourAge, L[5]);
  kitchenGlow(y(5), now, L[5]);
  room3(y(3), now); slab(y(3)); lightRoom(3, 44, y(3), 84, y(3) + 13, now, date, hourAge, Math.max(L[3] * 0.6, party * 0.3));
  room3glow(y(3), now, Math.max(party, hourParty));
  room2(y(2), now, date); slab(y(2)); lightRoom(2, 44, y(2), 84, y(2) + 13, now, date, hourAge, L[2]);
  room2glow(y(2), now, inWin(AWAKE[2], hoursF(date)));
  room1(y(1), now); slab(y(1)); lightRoom(1, 44, y(1), 84, y(1) + 13, now, date, hourAge, L[1]);
  room1glow(y(1), now);
  for (const f of [9, 8, 7, 6, 5, 4, 3, 2, 1]) hourDark(44, y(f), 84, y(f) + 13, f, hourAge);
}
/** The hour's blackout on one flat, and the burst light flashing into it. */
export function hourDark(x0, y0, x1, y1, f, hourAge) {
  const hs = hourShow(hourAge, f);
  if (hs >= 1) return;
  const k = 0.08 + 0.92 * hs;
  G.scaleBlock(x0, y0, x1, y1, k, k, k * 1.3);
  const w = washAt(hourAge), q = 7 * Math.exp(-(9 - f) * 0.2) * (1 - hs);
  if (w[0] + w[1] + w[2] > 0.01) G.scaleBlock(x0, y0, x1, y1, 1 + q * w[0], 1 + q * w[1], 1 + q * w[2]);
}

// --------------------------------------------------------------- lobby
const MARBLE = C('#5a5048'), GOLD = C('#e0b050');
export function drawLobby(now, date, sts, hourAge) {
  const y0 = floorTop(0);
  for (let x = ROOMS_X0; x < ROOMS_X1; x++) G.rect(x, y0, x + 1, y0 + 12, kit.scale(C('#3a2a24'), x % 8 < 1 ? 1.4 : 1));
  G.rect(ROOMS_X0, y0 + 12, ROOMS_X1, y0 + 13, MARBLE);
  for (let x = ROOMS_X0; x < ROOMS_X1; x += 4) G.rect(x, y0 + 12, x + 2, y0 + 13, C('#8a8078'));
  // the floor-indicator dial over the lifts: its needle follows the minute-units car
  const cx = 64, cy = y0 + 6.2, r = 5;
  for (let f = 0; f <= 9; f++) {
    const a = Math.PI + (f / 9) * Math.PI;
    G.add(Math.round(cx + Math.cos(a) * r - 0.5), Math.round(cy + Math.sin(a) * r - 0.5), GOLD, 0.45);
  }
  G.rect(cx - 6, cy, cx + 6, cy + 1, GOLD, 0.7);
  const st = sts[3], ang = Math.PI + (kit.clamp(st.pos, -0.3, 9.3) / 9) * Math.PI + (st.moving ? 0.05 * Math.sin(now * 23) : 0.012 * Math.sin(now * 3));
  G.line(cx, cy, cx + Math.cos(ang) * 4.4, cy + Math.sin(ang) * 4.4, [1, 0.6, 0.25], 1, 0.9, true);
  G.disc(cx, cy, 0.8, GOLD);
  // doorman, and the revolving door turning as people pass
  person(49, y0 + 12, C('#7a1a2a'));
  G.rect(48.6, y0 + 3.4, 51.4, y0 + 4.4, C('#7a1a2a')); G.rect(48.6, y0 + 4.2, 51.4, y0 + 4.6, GOLD);
  // the street doors under the dial, and a potted palm
  G.rect(60, y0 + 6.5, 68, y0 + 12, C('#3a2a1a'));
  const sw = Math.max(0, Math.sin(now * 0.31)) ** 6;          // someone comes in now and then
  G.rect(60.6, y0 + 7, 63.8 - 2.5 * sw, y0 + 12, [0.3, 0.42, 0.45]); G.rect(64.2 + 2.5 * sw, y0 + 7, 67.4, y0 + 12, [0.3, 0.42, 0.45]);
  G.rect(76, y0 + 9, 79, y0 + 12, C('#6a3a2a')); G.splat(77.5, y0 + 8, 2.6, [0.15, 0.5, 0.15], 0.9);
  G.rect(ROOMS_X0, y0 + 13, ROOMS_X1, y0 + 15, SLAB);
  // chandelier
  G.line(58, y0, 58, y0 + 1.5, GOLD, 0.6, 0.6); G.line(70, y0, 70, y0 + 1.5, GOLD, 0.6, 0.6);
  G.splat(58, y0 + 2, 2.2, [1, 0.8, 0.5], 0.5); G.splat(70, y0 + 2, 2.2, [1, 0.8, 0.5], 0.5);
  hourDark(44, y0, 84, y0 + 13, 0, hourAge);
}

// --------------------------------------------------------------- street
export function drawStreet(now, date) {
  const day = daylight(hoursF(date));
  G.rect(0, 180, 128, 182, kit.scale(C('#5a5650'), 0.4 + 0.6 * day));
  G.rect(0, 182, 128, 192, kit.scale(C('#2a2a30'), 0.35 + 0.65 * day));
  for (let x = 2; x < 128; x += 10) G.rect(x, 186.6, x + 5, 187.2, C('#a09060'), 0.25 + 0.25 * day);
  // a taxi now and then, each pass from the hash of its slot
  const slot = Math.floor(now / 17), t = now - slot * 17, dir = kit.hash(slot, 21) < 0.5 ? 1 : -1;
  if (kit.hash(slot, 22) < 0.7 && t < 5) {
    const u = t / 5, x = dir > 0 ? -16 + 160 * u : 144 - 160 * u, y = dir > 0 ? 187.5 : 183.5;
    G.rect(x, y, x + 13, y + 2.6, C('#f0b818'));
    G.rect(x + 3, y - 1.8, x + 10, y, C('#e0a810')); G.rect(x + 3.8, y - 1.3, x + 9.2, y - 0.2, [0.05, 0.07, 0.1]);
    G.disc(x + 3, y + 2.8, 1.1, DARK); G.disc(x + 10, y + 2.8, 1.1, DARK);
    G.splat(dir > 0 ? x + 14 : x - 1, y + 1, 3, [1, 0.9, 0.6], 0.3 + 0.5 * (1 - day));
    G.splat(dir > 0 ? x - 0.5 : x + 13.5, y + 1, 1.2, [1, 0.1, 0.05], 0.5);
  }
  // the lobby door's warm spill on the pavement
  G.splat(64, 181, 12, [1, 0.7, 0.4], 0.12 * (1 - day) + 0.04);
}
