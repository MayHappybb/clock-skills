// Katamari: a kid's bedroom rug seen from above at an angle, and the time
// lying on it, laid out in toys: pencils and crayons for the straight
// strokes, chains of wrapped sweets, gumballs and coins for the curves, a
// die, a rubber duck, a toy car at the joints (katamari-digits.js). The big
// hour lies at the front left in big things; the minutes further back, in
// small ones.
//
// The little prince (lime capsule head, antenna) pushes his katamari round
// the open floor all minute. It really rolls: its orientation is the
// integral of its path, so everything stuck to it turns with it, poking out
// (katamari-plan.js). And it grows: its size is the number of things it has
// picked up since the hour began, so the ball itself is a minute hand, small
// at :00 and huge by :59.
//
// Minute turn: before :00 the prince rolls the ball along the old digit's
// own strokes, object by object; each one leaps onto the ball with a pop and
// sticks where it lands. Just before :00 the King of All Cosmos leans in from
// the sky; after :00 he throws the new digit down a rainbow, thing by thing,
// and they bounce into place. The time is never wrong: the old digit is
// gone before :00, the new one starts after it. Nothing ever covers a
// numeral that stays: the ball and the prince keep to open floor at rest
// and eat from the side away from it (katamari-plan.js), the King's
// rainbows lie under the toys, and a throw to the ones while the tens stay
// goes up high over them.
//
// Hour: the ball has eaten the minutes and is huge. The King lassos it with a
// rainbow and flings it up into the sky, trailing rainbow; it becomes a
// star. The star draws the old hour up into itself (59:00-59:85, so the
// time is readable until a moment before :00), bursts at :00 and rains the
// new hour and the new minutes down. A tiny new ball drops for the prince.
//
// Palette: the game's: bright candy toys (lemon, bubblegum, mint, sky,
// tangerine, grape, cherry) with a deep plum keyline, never black, on a
// calm periwinkle rug so every hue stands off it; honey floorboards round
// the rug; a hot-pink katamari, a lime prince, a gold-crowned King, a full
// rainbow. Window light lies across the rug and moves through the day,
// amber at evening; at night the room goes indigo with a cool moon patch,
// the toys stay bright (lit by a night light) and the backlight dims.
//
// Hard and AA: everything is anti-aliased, since everything moves or rolls
// by fractions of a pixel; only the King's crown band and the prince's eyes
// are hard pixels. Resting digits are cached sprites (RGB565 + alpha, their
// soft shadow baked in), blitted by an integer loop; the rug is cached per
// quarter hour.

import { Gfx, hex, mix, sin, cos, clamp, rand, ease, progress, lerp } from '../js/kit.js';
import { drawObj, OUT } from './katamari-objects.js';
import {
  SLOTS, SPAWN, SPAWN_T, SIN_E, COS_E, R0, FLIGHT, planOf, pathAt, rollOf, orientAt, countBefore, radiusFor, bulkFor, laid, rotate, PRINCE_OFF,
} from './katamari-plan.js';
import { drawBall, drawPrince, drawKing, drawRainbow, rainbowAt, drawStar, twinkle } from './katamari-actors.js';

const W = 160, H = 80;
const STUCK = 56;                 // things showing on the ball; older ones sink in
const KX = 74, KY = 19;           // the King's face, when he is in
const STAR = [119, 24];           // where the hour's ball becomes a star
const VAC0 = 58.95, VAC_STEP = 0.033, VAC_FLY = 0.32;   // the old hour drawn up into the star
const LAUNCH = { in: 54.9, beam: 55.6, lift: 56.0, fly: 56.9, gone: 57.7, star: 57.9 };

// ------------------------------------------------------------ the floor

// A periwinkle rug on honey floorboards, seen from above at an angle (the rug
// widens toward the viewer). Sunlight from a window lies across it as a
// pale parallelogram that slides from left to right through the day, goes
// amber at evening and becomes a cool moon patch at night. All of it is
// cached: one canvas per night level and quarter hour.
const RUG = hex('a6b0f2'), RUG_L = hex('bcc4fa'), RUG_D = hex('8a94e0'), BORDER = hex('7c6fd6'), FRINGE = hex('fff2dc');
const WOODA = hex('e9b47a'), WOODB = hex('dca46c'), WOOD_LINE = hex('b97e4c');
const NIGHT_TINT = hex('262a6e');
const FLOORS = new Map();
const RUG_TOP = 5, RUG_X0 = 9, RUG_X1 = 151, RUG_SLANT = 0.32;
function sunAt(hour) {
  // [x offset of the patch, colour, strength]
  if (hour >= 7 && hour < 18.5) {
    const u = (hour - 7) / 11.5;
    const warm = clamp((hour - 16) / 2.5, 0, 1);
    return [-40 + 150 * u, mix(hex('fffbe8'), hex('ffc070'), warm), 0.22 + 0.06 * warm];
  }
  const hn = (hour + 24 - 18.5) % 24, u = hn / 12.5;
  return [130 - 150 * u, hex('cfe0ff'), 0.13];
}
function floor(nb, hour) {
  const qh = Math.floor(hour * 4), key = nb * 100 + qh;
  if (FLOORS.has(key)) return FLOORS.get(key);
  const c = new Gfx(W, H), k = nb / 8;
  const T = (col) => mix(col, NIGHT_TINT, k * 0.72);
  // floorboards, with staggered joints
  for (let y = 0; y < H; y += 5) {
    c.fillRect(0, y, W, 5, T((y / 5) & 1 ? WOODA : WOODB));
    c.fillRect(0, y, W, 1, T(mix(WOOD_LINE, WOODB, 0.4)));
    for (let x = ((y * 7) % 37); x < W; x += 41) c.fillRect(x, y, 1, 5, T(WOOD_LINE));
  }
  // the rug: a trapezoid, border band, soft centre
  const rx0 = (y) => RUG_X0 - (y - RUG_TOP) * RUG_SLANT, rx1 = (y) => RUG_X1 + (y - RUG_TOP) * RUG_SLANT;
  c.fillPolygon([[rx0(RUG_TOP), RUG_TOP], [rx1(RUG_TOP), RUG_TOP], [rx1(H + 2), H + 2], [rx0(H + 2), H + 2]], T(BORDER), { aa: true });
  const ins = 3;
  c.fillPolygon([[rx0(RUG_TOP) + ins, RUG_TOP + ins], [rx1(RUG_TOP) - ins, RUG_TOP + ins], [rx1(H + 2) - ins, H + 2], [rx0(H + 2) + ins, H + 2]], T(RUG_L), { aa: true });
  c.fillPolygon([[rx0(RUG_TOP) + ins + 1, RUG_TOP + ins + 1], [rx1(RUG_TOP) - ins - 1, RUG_TOP + ins + 1], [rx1(H + 2) - ins - 1, H + 2], [rx0(H + 2) + ins + 1, H + 2]], T(RUG), { aa: true });
  c.radial(92, 50, 100, [[0, T(mix(RUG, RUG_L, 0.5))], [0.6, T(RUG)], [1, T(RUG_D)]], { box: [Math.ceil(rx0(RUG_TOP) + ins + 1.5), RUG_TOP + ins + 2, 140, H] , a: 0.85 });
  // the fringe along the far edge
  for (let x = Math.ceil(rx0(RUG_TOP)) + 1; x < rx1(RUG_TOP) - 1; x += 3) c.fillRect(x, RUG_TOP - 3, 1, 3, T(FRINGE));
  // a woven pattern of soft dots, quiet
  for (let y = RUG_TOP + 6; y < H; y += 5) for (let x = (y * 3) % 6; x < W; x += 6) c.pixel(x, y, mix(c.get(x, y), T(RUG_L), 0.4));
  // window light
  const [sx, sc, sa] = sunAt(hour);
  for (const [a0, a1] of [[20, 37.5], [40, 58]])
    c.fillPolygon([[sx + a0, 0], [sx + a1, 0], [sx + a1 - 26, H], [sx + a0 - 26, H]], sc, { aa: true, a: sa * (1 - 0.3 * k), dither: true });
  FLOORS.set(key, c);
  if (FLOORS.size > 12) FLOORS.delete(FLOORS.keys().next().value);
  return c;
}

// ------------------------------------------------------------ digit sprites (RGB + alpha, with their shadow)

const SPR = new Map();
const SHADOW = hex('2a2260');
function digitSprite(d, i) {
  const key = d * 4 + i;
  if (SPR.has(key)) return SPR.get(key);
  const s = SLOTS[i], x0 = Math.floor(s.x) - 3, y0 = Math.floor(s.y) - 3;
  const w = Math.ceil(13 * s.unit) + 10, h = Math.ceil(22 * s.unit) + 10;
  const objs = laid(d, i);
  const paint = (bg) => {
    const c = new Gfx(w, h); c.clear(bg);
    for (const p of objs) drawObj(c, p.o, p.x - x0, p.y - y0, p.ux, p.uy, 1);
    return c;
  };
  const kb = paint(0x000000), kw = paint(0xffffff);
  const n = w * h, A = new Float32Array(n), CR = new Float32Array(n), CG = new Float32Array(n), CB = new Float32Array(n);
  for (let j = 0; j < n; j++) {
    const a = kb.buf[j], b = kw.buf[j];
    const ra = (a >> 11) * 255 / 31, rb = (b >> 11) * 255 / 31;
    const al = clamp(1 - (rb - ra) / 255, 0, 1);
    A[j] = al; CR[j] = ra; CG[j] = ((a >> 5) & 63) * 255 / 63; CB[j] = (a & 31) * 255 / 31;
  }
  // the soft shadow: the alpha, shifted down-right and blurred a little
  const sr = (SHADOW >> 16) & 255, sg = (SHADOW >> 8) & 255, sb = SHADOW & 255;
  const out = { x: x0, y: y0, w, h, a: new Uint8Array(n), c: new Uint16Array(n) };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const j = y * w + x;
      let sh = 0, sn = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x - 1 - dx, yy = y - 2 - dy;
        sn++;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) sh += A[yy * w + xx];
      }
      const as = (i >= 2 ? 0.56 : 0.42) * sh / sn, ao = A[j];   // the minutes, smaller, get a firmer shadow
      const al = ao + as * (1 - ao);
      const r = CR[j] + sr * as * (1 - ao), g = CG[j] + sg * as * (1 - ao), b = CB[j] + sb * as * (1 - ao);
      out.a[j] = Math.round(al * 255);
      // store the colour un-premultiplied, as RGB565 (what the firmware would keep in flash)
      const ia = al > 0.004 ? 1 / al : 0;
      out.c[j] = ((Math.min(255, r * ia) >> 3) << 11) | ((Math.min(255, g * ia) >> 2) << 5) | (Math.min(255, b * ia) >> 3);
    }
  SPR.set(key, out);
  return out;
}

/** Blend an RGB565 + alpha sprite at integer (x, y): what the firmware loop does, billed to g.cost. */
function blitA(g, sp, ox, oy) {
  const buf = g.buf, cost = g.cost;
  cost.calls++;
  for (let y = 0; y < sp.h; y++) {
    const py = oy + y;
    if (py < 0 || py >= H) continue;
    for (let x = 0; x < sp.w; x++) {
      const px = ox + x;
      if (px < 0 || px >= W) continue;
      const j = y * sp.w + x, a = sp.a[j];
      cost.box++;
      if (a === 0) continue;
      const i = py * W + px;
      if (a === 255) { buf[i] = sp.c[j]; cost.blit++; continue; }
      const d = buf[i], s = sp.c[j];
      const dr = d >> 11, dg = (d >> 5) & 63, db = d & 31;
      buf[i] = ((dr + ((((s >> 11) - dr) * a) >> 8)) << 11) | ((dg + (((((s >> 5) & 63) - dg) * a) >> 8)) << 5) | (db + ((((s & 31) - db) * a) >> 8));
      cost.blend++;
    }
  }
}

// ------------------------------------------------------------ the new digits: thrown down by the King, or rained from the star

const ARR = new Map();
function arrivalsOf(mk) {
  if (ARR.has(mk)) return ARR.get(mk);
  const P = planOf(mk), list = [], ends = [0, 0, 0, 0];
  const slots = [0, 1, 2, 3].filter((i) => P.prv[i] !== P.cur[i]);
  let g = 0;
  slots.forEach((i, k) => {
    const objs = laid(+P.cur[i], i), s = SLOTS[i];
    const cx = s.x + 6 * s.unit, cy = s.y + 11 * s.unit;
    objs.forEach((p, j) => {
      let th, ride, hop;
      if (P.hourStart) { th = 0.06 + g * 0.05; ride = 0.62; hop = 0.32; }
      else { th = k * 1.0 + 0.55 + j * 0.09; ride = 0.45; hop = 0.34; }
      const a = { slot: i, j, p, th, tl: th + ride, ts: th + ride + hop, cx, cy, spin: (rand(mk, g, 5) - 0.5) * 9, rb: k };
      list.push(a); g++;
      ends[i] = Math.max(ends[i], a.ts);
    });
  });
  const r = { list, ends, slots, hourStart: P.hourStart };
  ARR.set(mk, r);
  if (ARR.size > 100) ARR.delete(ARR.keys().next().value);
  return r;
}

// ------------------------------------------------------------ the ball and the prince over time

const T4 = [0, 0, 0, 0], T4b = [0, 0, 0, 0], Q = [1, 0, 0, 0];

/** Things on the ball at second s of minute mk (landings eased in). */
function countAt(mk, s) {
  let n = countBefore(mk);
  for (const e of rollOf(mk).landed) if (e.land < s) n += ease.outCubic(clamp((s - e.land) / 0.3, 0, 1));
  return n;
}

/** Where the prince stands, at second s of minute mk. */
function princeAt(mk, s, R) {
  const P = planOf(mk);
  if (P.hourStart && s < SPAWN_T + 0.9) {
    const prev = princeAt(mk - 1, 60, radiusFor(countAt(mk - 1, 60)));
    const tx = SPAWN[0] - (R0 + PRINCE_OFF), ty = SPAWN[1];
    const u = ease.inOutQuad(progress(s, 0.9, SPAWN_T + 0.9));
    const x = lerp(prev.x, tx, u), y = lerp(prev.y, ty, u);
    const moving = u > 0 && u < 1;
    return { x, y, f: u > 0.5 || tx > prev.x ? 1 : prev.f, moving, push: u >= 1 ? 1 : 0, look: 1 - u };
  }
  const end = P.hourEnd ? P.route.end : 999;
  const tt = Math.min(s, end);
  const bp = pathAt(P, tt, T4);
  const bx = bp[0], by = bp[1], vx = bp[2], vy = bp[3];
  // heading: where the ball came from over the last half second
  let dx = 0, dy = 0;
  for (const win of [0.45, 1.3, 3]) {
    const t0 = tt - win;
    let qx, qy;
    if (t0 >= 0 || P.hourStart) { pathAt(P, Math.max(t0, 0), T4b); qx = T4b[0]; qy = T4b[1]; }
    else { pathAt(planOf(mk - 1), 60 + t0, T4b); qx = T4b[0]; qy = T4b[1]; }
    dx = bx - qx; dy = (by - qy) / SIN_E;
    if (dx * dx + dy * dy > 0.4) break;
  }
  let l = Math.sqrt(dx * dx + dy * dy);
  if (l < 0.3) { dx = 1; dy = 0; l = 1; }
  dx /= l; dy /= l;
  const off = R + PRINCE_OFF;
  const x = bx - dx * off, y = by - dy * off * SIN_E;
  const speed = Math.sqrt(vx * vx + vy * vy);
  const f = Math.abs(dx) > 0.2 ? (dx > 0 ? 1 : -1) : (bx >= x ? 1 : -1);
  let look = 0;
  if (P.hourEnd && s > LAUNCH.beam) look = clamp((s - LAUNCH.beam) / 0.6, 0, 1);
  return { x, y, f, moving: speed > 2 && s <= end, push: s <= end ? 1 : 0, look };
}

// ------------------------------------------------------------ frame

export default {
  name: 'Katamari',
  blurb: 'The time is toys on a bedroom rug; the prince rolls the old digit up into his katamari and the King throws down the new one. The ball grows all hour; at the hour it becomes a star.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey;
    ctx.lcd.backlight(1 - 0.62 * ctx.night);
    const hour = f.h + f.m / 60;
    g.draw(floor(Math.round(ctx.night * 8), hour), 0, 0);

    // dust motes drifting in the window light
    {
      const [sx, , sa] = sunAt(hour), tod = f.h * 3600 + f.m * 60 + s;
      const n = sa > 0.2 ? 7 : 3;
      for (let k = 0; k < n; k++) {
        const per = 14 + rand(k, 3) * 10, ph = (tod / per + rand(k, 4)) % 1;
        const y = 78 - ph * 74, a0 = 22 + rand(k, 5) * 34 + 2.5 * sin(tod * (0.5 + rand(k, 6) * 0.4) + k);
        const x = sx + a0 - (26 * y) / H;
        const tw = 0.5 + 0.5 * sin(tod * (1.3 + k * 0.21) + k * 2);
        g.fillCircle(x, y, 0.62, 0xfffbe8, { aa: true, a: (0.25 + 0.5 * tw) * sin(Math.PI * ph) * (sa > 0.2 ? 1 : 0.6) });
      }
    }

    const P = planOf(mk), roll = rollOf(mk), A = arrivalsOf(mk);
    const nextP = planOf(mk + 1);
    // the King's rainbows for the minutes lie under the toys, so a numeral that stays is never covered
    const K = kingState(s, P, nextP, A);
    if (K) minuteRainbows(g, s, P, A, K);

    // ---- the digits on the floor
    const flying = [], rising = [];
    for (let i = 0; i < 4; i++) {
      const d = +P.cur[i];
      const picks = P.picks.filter((p) => p.slot === i);
      const arriving = A.ends[i] > 0 && s < A.ends[i];
      const vac = P.hourEnd && i < 2 && P.cur[i] !== P.nxt[i];
      if (vac && s >= VAC0) {
        // the hour's star draws the old hour up into itself, one thing at a time
        const objs = laid(d, i), base = i === 1 && P.cur[0] !== P.nxt[0] ? laid(+P.cur[0], 0).length : 0;
        objs.forEach((p, j) => {
          const t0 = VAC0 + (base + j) * VAC_STEP;
          if (s < t0) floorObj(g, p);
          else if (s < t0 + VAC_FLY) rising.push([p, (s - t0) / VAC_FLY, j]);
        });
      } else if (picks.length && s >= picks[0].t) {
        // being eaten: what is left lies where it was
        const objs = laid(d, i);
        for (const pk of picks) if (pk.t > s) floorObj(g, objs[pk.j]);
      } else if (arriving) {
        for (const a of A.list) {
          if (a.slot !== i || s < a.th) continue;
          if (s < a.tl) { flying.push(a); continue; }
          const u = clamp((s - a.tl) / (a.ts - a.tl), 0, 1);
          const p = a.p, hx = lerp(a.cx, p.x, ease.outQuad(Math.min(1, u * 1.6)));
          const hy = lerp(a.cy, p.y, ease.outQuad(Math.min(1, u * 1.6))) - 7 * sin(Math.PI * Math.min(1, u * 1.6)) - 1.6 * Math.max(0, sin(Math.PI * clamp((u - 0.62) / 0.38, 0, 1)));
          const sp = a.spin * (1 - ease.outCubic(u)) * 0.12;
          const c = cos(sp), sn = sin(sp);
          floorObjAt(g, p, hx, hy, p.ux * c - p.uy * sn, p.ux * sn + p.uy * c, 7 * sin(Math.PI * Math.min(1, u * 1.6)));
        }
      } else {
        const sp = digitSprite(d, i);
        blitA(g, sp, sp.x, sp.y);
      }
    }

    // ---- the ball
    const nb = countAt(mk, s), R = radiusFor(nb), bulk = bulkFor(nb);
    let bp = pathAt(P, P.hourEnd ? Math.min(s, P.route.end) : s, T4);
    let bx = bp[0], by = bp[1], lift = 0, kScale = 1, ballOn = true, spin = 0;
    if (P.hourStart && s < SPAWN_T) {
      // the new ball falls from the King's hand
      const u = progress(s, 0.9, SPAWN_T);
      ballOn = u > 0;
      lift = (1 - ease.outBounce(u)) * 40;
    }
    if (P.hourEnd && s > LAUNCH.lift) {
      const u1 = progress(s, LAUNCH.lift, LAUNCH.fly), u2 = progress(s, LAUNCH.fly, LAUNCH.gone);
      lift = 4 * ease.inOutQuad(u1) + 1.2 * sin(s * 30) * u1 * (1 - u2);
      bx = lerp(bx, STAR[0], ease.inQuad(u2)); by = lerp(by, by, 0);
      lift += ease.inQuad(u2) * (by + 30);
      kScale = 1 - 0.6 * ease.inQuad(u2);
      spin = (s - LAUNCH.lift) * (s - LAUNCH.lift) * 6;
      ballOn = s < LAUNCH.gone;
    }
    const q = orientAt(mk, s, Q);
    if (spin) {
      // spun about the view axis as it flies: q' = r * q
      const h = spin * 0.5, cw = cos(h), sw = sin(h);
      const ax = 0, ay = COS_E, az = SIN_E;
      const w = q[0], x = q[1], y = q[2], z = q[3];
      const rw = cw, rx = sw * ax, ry = sw * ay, rz = sw * az;
      q[0] = rw * w - rx * x - ry * y - rz * z; q[1] = rw * x + rx * w + ry * z - rz * y;
      q[2] = rw * y - rx * z + ry * w + rz * x; q[3] = rw * z + rx * y - ry * x + rz * w;
    }
    const Rb = R * kScale;
    const bcx = bx, bcy = by - Rb * COS_E - lift;

    // what is stuck on it: the last STUCK landed, the older ones sinking in
    const stuck = [];
    let total = countBefore(mk);
    for (const e of roll.landed) if (e.land <= s) total = e.n + 1;
    const pushStuck = (e, landed) => {
      const newer = total - (e.n + 1);
      let p = clamp((STUCK - newer) / 6, 0, 1);
      if (landed) p *= ease.outBack(clamp((s - e.land) / 0.22, 0, 1));
      if (p > 0.02) stuck.push({ o: e.o, u: e.u, p });
    };
    for (let k = mk, n = 0; n < 12; k--, n++) {
      const L = rollOf(k).landed;
      for (let j = L.length - 1; j >= 0; j--) {
        const e = L[j];
        if (k === mk && e.land > s) continue;
        if (total - (e.n + 1) > STUCK) break;
        pushStuck(e, k === mk);
      }
      if (planOf(k).hourStart || stuck.length >= STUCK) break;
    }

    // the prince
    const pr = princeAt(mk, s, R);
    const ph = s * 13;
    const drawP = () => drawPrince(g, pr.x, pr.y, pr.f, pr.moving ? ph : 0, pr.push, pr.look,
      P.hourEnd && s > LAUNCH.fly && s < LAUNCH.gone + 0.3 ? 2.5 * Math.abs(sin((s - LAUNCH.fly) * 9)) : 0);
    if (ballOn) {
      // its shadow on the rug
      const sa = 0.3 * clamp(1 - lift / 30, 0, 1);
      if (sa > 0.01) g.fillEllipse(bx + Rb * 0.25, by + Rb * 0.12, Rb * 1.05, Rb * 0.55, SHADOW, { aa: true, a: sa });
    }
    const princeFirst = !ballOn || (pr.y < by && lift < 3);
    if (princeFirst) drawP();
    if (ballOn) drawBall(g, bcx, bcy, Rb, q, stuck, Math.min(0.9, 0.46 + bulk * 0.03) * (0.85 + 0.15 * kScale));
    if (!princeFirst) drawP();

    // ---- things in the air: leaping onto the ball
    for (const e of roll.landed) {
      if (s < e.t || s >= e.land) continue;
      const u = (s - e.t) / FLIGHT, p = laid(e.d, e.slot)[e.j];
      const n = rotate(q[0], q[1], q[2], q[3], e.u[0], e.u[1], e.u[2]);
      const sx = n[0], sy = n[2] * SIN_E - n[1] * COS_E;
      const tx = bcx + sx * (Rb + 2), ty = bcy + sy * (Rb + 2);
      const ue = ease.inOutQuad(u);
      const x = lerp(p.x, tx, ue), y = lerp(p.y, ty, ue) - 12 * u * (1 - u);
      const k = lerp(1, 0.72, ue);
      drawObj(g, p.o, x, y, p.ux, p.uy, k, 0, true);
      if (u > 0.75) popSparks(g, tx, ty, (u - 0.75) / 0.25, e.j);
    }

    // ---- the hour: a rainbow trail as the ball is flung up, then it is a star
    if (P.hourEnd && s > LAUNCH.fly && s < LAUNCH.gone + 0.3) {
      const back = Math.max(LAUNCH.fly, s - 0.35);
      const u2 = progress(back, LAUNCH.fly, LAUNCH.gone);
      const p0 = pathAt(P, P.route.end, T4b);
      const tx = lerp(p0[0], STAR[0], ease.inQuad(u2)), ty = p0[1] - ease.inQuad(u2) * (p0[1] + 30) - Rb * COS_E - 4;
      const a = 1 - progress(s, LAUNCH.gone, LAUNCH.gone + 0.3);
      drawRainbow(g, tx, ty, bcx, bcy + Rb * 0.7, 0, 0, 1, 1.5 * kScale + 0.5, a);
    }
    if (P.hourEnd && s > LAUNCH.star) {
      const u = progress(s, LAUNCH.star, LAUNCH.star + 0.6);
      const r = 6.5 * ease.outBack(u) * (1 + 0.08 * sin(s * 9));
      drawStar(g, STAR[0], STAR[1], r, s * 1.2, u);
      for (let k = 0; k < 4; k++) {
        const ph = s * 2.2 + k * 1.7;
        twinkle(g, STAR[0] + 12 * cos(k * 1.9 + s * 0.7), STAR[1] + 9 * sin(k * 1.9 + s * 0.7), 2.5 * Math.abs(sin(ph)), 0xffffff, u);
      }
    }
    for (const [p, u, j] of rising) {
      const ue = ease.inQuad(u), sp = u * u * 7 * (j % 2 ? 1 : -1), c = cos(sp), sn = sin(sp);
      const x = lerp(p.x, STAR[0], ue), y = lerp(p.y, STAR[1], ue) - 6 * sin(Math.PI * u);
      drawObj(g, p.o, x, y, p.ux * c - p.uy * sn, p.ux * sn + p.uy * c, 1 - 0.7 * ue, 0, u < 0.6);
    }
    if (P.hourStart && s < 0.8) {
      // the star bursts, and the new hour rains from it
      const u = s / 0.8;
      drawStar(g, STAR[0], STAR[1], 6.5 + 8 * ease.outQuad(u), u * 3, 1 - u);
      for (let k = 0; k < 8; k++) {
        const ang = k * 0.785 + 0.3, r = 6 + 30 * ease.outQuad(u);
        twinkle(g, STAR[0] + r * cos(ang), STAR[1] + r * sin(ang) * 0.7, 3 * (1 - u) + 0.5, 0xfff6c0, 1 - u);
      }
    }

    // ---- the King, his rainbow, things thrown down it
    if (K) king(g, s, P, A, K, flying, bx, bcy);
  },
};

// ------------------------------------------------------------ drawing helpers

function floorObj(g, p) { floorObjAt(g, p, p.x, p.y, p.ux, p.uy, 0); }
function floorObjAt(g, p, x, y, ux, uy, h) {
  const w = Math.max(p.o.len, p.o.wid) * 0.5;
  g.fillEllipse(x + 1.2, y + 1.8 + h, w, p.o.wid * 0.55, SHADOW, { aa: true, a: 0.3 * clamp(1 - h / 14, 0, 1) });
  drawObj(g, p.o, x, y, ux, uy, 1);
}

function popSparks(g, x, y, u, seed) {
  const r = 2 + 5 * u, a = 1 - u;
  for (let k = 0; k < 5; k++) {
    const ang = k * 1.2566 + seed;
    twinkle(g, x + r * cos(ang), y + r * sin(ang) * 0.8, 1.6 * (1 - u) + 0.6, 0xffffff, a);
  }
}

const T2 = [0, 0];

/** Is the King in, and where: { y, tail } or null. */
function kingState(s, P, nextP, A) {
  const enter = (t0, t1) => KY - 46 * (1 - ease.outBack(progress(s, t0, t1)));
  const leave = (t0, t1) => KY - 46 * ease.inQuad(progress(s, t0, t1));
  const tail = A.list.length && !A.hourStart ? Math.max(...A.list.map((a) => a.tl)) + 0.25 : 0;
  let y = null;
  if (P.hourEnd && s > LAUNCH.in) y = enter(LAUNCH.in, LAUNCH.in + 0.7);
  else if (!P.hourEnd && !nextP.hourStart && s > 59.35) y = enter(59.35, 60);
  else if (P.hourStart && s < 3.2) y = leave(2.4, 3.2);
  else if (!P.hourStart && tail && s < tail + 0.9) y = s < tail ? KY : leave(tail, tail + 0.9);
  return y === null ? null : { y, tail };
}

/**
 * The arc a new numeral's things ride from the King's raised hand to slot i:
 * [hx, hy, tx, ty, bow]. Thrown to the ones while the tens stay, it goes up
 * high over them (most of it off the top of the glass) and drops in.
 */
function throwArc(i, A, y, a0) {
  const over = i === 3 && !A.slots.includes(2);
  return over ? [KX + 10, y - 17, a0.cx, a0.cy, 60] : [KX + 13, y - 1, a0.cx, a0.cy, 16];
}

function minuteRainbows(g, s, P, A, K) {
  if (P.hourStart || !A.list.length || s >= K.tail + 0.3) return;
  for (const i of A.slots) {
    const sl = A.list.filter((a) => a.slot === i);
    const t0 = sl[0].th - 0.25, t1 = sl[sl.length - 1].tl;
    if (s < t0 || s > t1 + 0.35) continue;
    const [hx, hy, tx, ty, bow] = throwArc(i, A, K.y, sl[0]);
    const u1 = ease.outQuad(progress(s, t0, t0 + 0.25)), u0 = ease.inQuad(progress(s, t1, t1 + 0.35));
    drawRainbow(g, hx, hy, tx, ty, bow, u0, u1);
    K.hand = [hx, hy];
  }
}

function king(g, s, P, A, K, flying, bx, bcy) {
  const y = K.y;
  let hand = K.hand ?? null, grin = hand ? 1 : 0.4;
  // the hour: he lassos the ball with a rainbow (over everything: the hour is being taken anyway)
  if (P.hourEnd && s > LAUNCH.beam && s < LAUNCH.fly + 0.3) {
    hand = [KX + 15, y + 9];
    const u1 = ease.outQuad(progress(s, LAUNCH.beam, LAUNCH.beam + 0.35)), u0 = ease.inQuad(progress(s, LAUNCH.fly - 0.1, LAUNCH.fly + 0.3));
    drawRainbow(g, hand[0], hand[1], bx, bcy, 10, u0, u1);
    grin = 1;
  }
  drawKing(g, KX, y, 1, grin, hand);
  // things riding the rainbow (or raining from the star)
  for (const a of flying) {
    const u = (s - a.th) / (a.tl - a.th);
    let x, yy;
    if (A.hourStart) {
      const ue = ease.inQuad(u);
      x = lerp(STAR[0], a.cx, ue); yy = lerp(STAR[1], a.cy, ue) - 20 * sin(Math.PI * u) * (a.cx < 80 ? 1 : 0.4);
    } else {
      const [hx, hy, tx, ty, bow] = throwArc(a.slot, A, y, a);
      rainbowAt(hx, hy, tx, ty, bow, ease.inQuad(u), T2);
      x = T2[0]; yy = T2[1];
    }
    const sp = a.spin * (1 - u), c = cos(sp), sn = sin(sp);
    drawObj(g, a.p.o, x, yy, a.p.ux * c - a.p.uy * sn, a.p.ux * sn + a.p.uy * c, 0.8 + 0.2 * u, 0);
  }
}
