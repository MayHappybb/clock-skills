// Crayon House: an L-shaped dollhouse cutaway (two floors on the left, a
// ground-floor wing on the right) where the time is crayoned on the
// wallpaper. Big sister keeps the hours in red on the nursery wall; the
// toddler scrawls the minutes in blue on the living-room wall. Every minute
// the toddler sneaks up in the dim room with a crayon, the lamp flicks on,
// Mum marches in with a mop and scrubs the old number off, and the moment her
// back is turned the toddler is whisked up the wall scribbling the new one.
// On the hour sister redraws the hour upstairs, then the whole family meets
// in the living room round a cake under bunting and confetti.
import * as kit from '../js/kit.js';
import { W, H, ROOM, STAIR, stairY, LAMPS, WIN, TABLE, bake, inside } from './dollhouse-scene.js';
import { glyph, tipAt } from './dollhouse-glyphs.js';
import { drawDoll, drawCat } from './dollhouse-dolls.js';

// ------------------------------------------------------------- slots
const MSLOT = [{ x: 71, y: 72, w: 24, h: 34 }, { x: 100, y: 72, w: 24, h: 34 }];   // minutes (living room)
const HSLOT = [{ x: 9, y: 19, w: 20, h: 27 }, { x: 35, y: 19, w: 20, h: 27 }];     // hours (nursery)
const MR = 1.8, HR = 1.55;
const RED = kit.hex('#ff3424'), BLUE = kit.hex('#3a8cff');

const digitsOf = (mi) => { const h = Math.floor(mi / 60) % 24, m = mi % 60; return [Math.floor(h / 10), h % 10, Math.floor(m / 10), m % 10]; };
/** The glyph each slot shows at minute mi (seeded by the minute it was drawn). */
function glyphsAt(mi) {
  const d = digitsOf(mi), h = Math.floor(mi / 60) % 24, m = mi % 60;
  return [
    glyph(d[0], HSLOT[0].w, HSLOT[0].h, HR, 97 + (h - (h % 10)) * 7, 0.45),
    glyph(d[1], HSLOT[1].w, HSLOT[1].h, HR, 31 + h * 7, 0.45),
    glyph(d[2], MSLOT[0].w, MSLOT[0].h, MR, 5 + (h * 60 + m - (m % 10)), 1),
    glyph(d[3], MSLOT[1].w, MSLOT[1].h, MR, 11 + h * 60 + m, 1),
  ];
}
const slotOf = (k) => (k < 2 ? HSLOT[k] : MSLOT[k - 2]);

// ------------------------------------------------------------- tracks
// A track is keyframes {t, x, y, face, pose}; between two keys at different
// places the doll walks (eased), hopping like a peg doll moved by a hand.
const P = { STAND: 0, WALK: 1, STIR: 2, SNEAK: 3, DANCE: 4, CARRY: 5, SCRUB: 6, LIE: 7, MOP: 8, HIDE: 9, LOOK: 10, READ: 11 };
class Track {
  constructor(x, y, face, pose) { this.k = []; this.t = 0; this.x = x; this.y = y; this.key(face, pose); }
  key(face, pose) { this.k.push({ t: this.t, x: this.x, y: this.y, face, pose }); return this; }
  hold(until, face, pose) { if (until > this.t) { this.key(face, pose); this.t = until; this.key(face, pose); } return this; }
  go(x, y, speed, pose = P.WALK) {
    const d = Math.hypot(x - this.x, y - this.y);
    if (d < 0.01) return this;
    const face = Math.abs(x - this.x) > 0.5 ? Math.sign(x - this.x) : 0;
    this.key(face, pose); this.t += d / speed; this.x = x; this.y = y; this.key(face, pose);
    return this;
  }
  /** Walk along the stairs (kitchen foot <-> nursery top). */
  stairs(up, speed, pose = P.WALK) {
    if (up) { this.go(STAIR.x0, STAIR.y0, speed, pose); this.go(STAIR.x1, STAIR.y1, speed * 0.75, pose); }
    else { this.go(STAIR.x1, STAIR.y1, speed, pose); this.go(STAIR.x0, STAIR.y0, speed * 0.85, pose); }
    return this;
  }
}
const mkS = () => ({ x: 0, y: 0, face: 0, pose: 0, moving: 0, dist: 0 });
const SR = [mkS(), mkS(), mkS(), mkS(), mkS()];   // one reused result per slot (monomorphic)
function evalTrack(tr, t, S = SR[4]) {
  const k = tr.k;
  let i = 0;
  while (i + 1 < k.length && k[i + 1].t <= t) i++;
  const a = k[i], b = k[Math.min(i + 1, k.length - 1)];
  if (b === a || t >= b.t || a.x === b.x && a.y === b.y) {
    const c = t >= b.t ? b : a;
    S.x = c.x; S.y = c.y; S.face = c.face; S.pose = c.pose; S.moving = 0; S.dist = 0;
    return S;
  }
  const u = (t - a.t) / (b.t - a.t), e = u * u * (3 - 2 * u) * 0.6 + u * 0.4;
  S.x = a.x + (b.x - a.x) * e; S.y = a.y + (b.y - a.y) * e;
  S.face = b.face; S.pose = b.pose; S.moving = 1;
  S.dist = Math.hypot(b.x - a.x, b.y - a.y) * e;
  return S;
}

const MUM_HOME = 27, FLOOR = 122, UP = 60, BED_X = 47;
const isNight = (mi) => { const h = Math.floor(mi / 60) % 24; return h >= 23 || h < 7; };

const plans = new Map();
/** Everything that happens in minute mi (local minute of the day). */
function plan(mi) {
  let p = plans.get(mi);
  if (p) return p;
  if (plans.size > 8) plans.clear();
  const prev = digitsOf((mi + 1439) % 1440), cur = digitsOf(mi), next = digitsOf((mi + 1) % 1440);
  const chIn = [0, 1, 2, 3].map((k) => prev[k] !== cur[k]);     // changed at the start of this minute
  const chOut = [0, 1, 2, 3].map((k) => cur[k] !== next[k]);   // changed at the start of the next
  const hourIn = mi % 60 === 0, hourOut = (mi + 1) % 60 === 0;
  const night = isNight(mi), rnd = (k) => kit.hash(mi, k, 77);

  // where Mum stands to scrub, where the toddler hides
  const scrubX = (ch) => (ch[2] ? 97 : 112);
  const sneakX = (ch) => (ch[2] ? 83 : 112);

  // ---- Mum
  const mum = new Track(chIn[3] ? scrubX(chIn) : MUM_HOME, FLOOR, 0, chIn[3] ? P.SCRUB : P.STIR);
  if (chIn[3]) {
    mum.hold(0.85, 0, P.SCRUB).go(70, FLOOR, 24, P.MOP).hold(3.7, 1, P.LOOK)
      .go(50, FLOOR, 22, P.MOP).hold(4.8, 0, P.STAND);
    if (hourIn) {
      mum.go(MUM_HOME - 4, FLOOR, 24).hold(6.2, -1, P.STAND).go(77, FLOOR, 21, P.CARRY).hold(10.2, 1, P.CARRY)
        .hold(20.5, 2, P.DANCE).go(MUM_HOME, FLOOR, 22).hold(24, -1, P.STIR);
    } else mum.go(MUM_HOME, FLOOR, 22);
  }
  const mv = rnd(1);
  if (!hourIn && mv < 0.45) {                    // looks out of the window for a while
    const t0 = 16 + 8 * rnd(2);
    mum.hold(t0, -1, P.STIR).go(19, FLOOR, 14).hold(t0 + 9, 0, P.LOOK).go(MUM_HOME, FLOOR, 14);
  }
  // fetches the mop at :54 and marches in
  mum.hold(54, -1, P.STIR).go(50, FLOOR, 22).hold(mum.t + 0.4, 0, P.STAND)
    .go(scrubX(chOut), FLOOR, 22, P.MOP).hold(60.1, 0, P.SCRUB);

  // ---- toddler
  const tod = new Track(122, FLOOR, 2, P.HIDE);
  tod.hold(chIn[3] ? 4.2 : 0.1, 2, P.HIDE);
  if (hourIn) tod.go(111, FLOOR, 16).hold(20.5, 2, P.DANCE);
  // toddles about the room; now and then wanders into the kitchen
  let tt = tod.t + 1;
  while (tt < 42) {
    const r = kit.hash(mi, Math.floor(tt * 10), 5);
    const x = r < 0.18 && !hourIn ? 40 + 14 * r : 70 + 40 * kit.hash(mi, Math.floor(tt * 10), 6);
    tod.hold(tt, tod.k[tod.k.length - 1].face, P.STAND).go(x, FLOOR, 13);
    tt = tod.t + 2.5 + 4 * kit.hash(mi, Math.floor(tt * 10), 7);
  }
  tod.hold(Math.max(tod.t, 46), 2, P.STAND).go(sneakX(chOut), FLOOR, 12).hold(Math.max(tod.t, 52), 0, P.SNEAK)
    .hold(58.4, 0, P.SNEAK).go(122, FLOOR, 30).hold(60.1, 2, P.HIDE);

  // ---- big sister (nursery)
  const sis = new Track(chIn[1] ? 32 : BED_X, chIn[1] ? UP : 52, 2, chIn[1] ? P.STAND : P.READ);
  if (hourIn) {
    sis.hold(3.3, 2, P.STAND).go(STAIR.x1 + 2, UP, 20).stairs(false, 22).go(119, FLOOR, 20).hold(20.5, 2, P.DANCE)
      .go(STAIR.x0, FLOOR, 20).stairs(true, 18).go(BED_X, UP, 18).hold(sis.t + 0.3, 1, P.STAND);
    sis.key(1, P.READ); sis.y = 52; sis.key(1, P.READ);
  }
  if (!hourIn && !hourOut && !night && rnd(3) < 0.4) {     // pops down to see Mum
    sis.hold(9, 1, P.READ); sis.y = UP; sis.key(-1, P.STAND); sis.t += 0.4; sis.key(-1, P.STAND);
    sis.go(STAIR.x1 + 2, UP, 18).stairs(false, 20).go(38, FLOOR, 18).hold(sis.t + 7, -1, P.STAND)
      .go(STAIR.x0, FLOOR, 18).stairs(true, 17).go(BED_X, UP, 18).hold(sis.t + 0.3, 1, P.STAND);
    sis.key(1, P.READ); sis.y = 52; sis.key(1, P.READ);
  }
  if (hourOut) {                                    // gets up to redo the hour
    sis.hold(55, 1, P.READ); sis.y = UP; sis.key(-1, P.STAND); sis.t += 0.4; sis.key(-1, P.STAND);
    sis.go(32, UP, 10).hold(60.1, 0, P.SNEAK);
  }
  sis.hold(60.1, sis.k[sis.k.length - 1].face, sis.k[sis.k.length - 1].pose);

  // ---- cat on the stairs; joins the party
  const catHome = 40, catY = Math.round(stairY(40)) - 3;
  const cat = new Track(catHome, catY, 1, P.STAND);
  if (hourIn) {
    cat.hold(5, 1, P.STAND).go(STAIR.x0, FLOOR, 16).go(69, FLOOR, 16).hold(26, 1, P.STAND)
      .go(STAIR.x0, FLOOR, 14).go(catHome, catY, 12).hold(60.1, 1, P.STAND);
  } else cat.hold(60.1, 1, P.STAND);

  p = { prev, cur, next, chIn, chOut, hourIn, night, mum, tod, sis, cat, gIn: glyphsAt(mi), gPrev: glyphsAt((mi + 1439) % 1440) };
  plans.set(mi, p);
  return p;
}

// --------------------------------------------------------- the frame
let B = null;
const img = new Float32Array(3 * W * H), light = new Float32Array(W * H);
const GRAIN = new Float32Array(W * H);
for (let p = 0; p < W * H; p++) GRAIN[p] = kit.hash(p % W, Math.floor(p / W), 3);

const SCRUB_T = 0.85, DRAW0 = 1.05, DRAW1 = 2.6, FLY0 = 0.4;

/** Erasure 0..1 of pixel (x, y) at scrub progress u over box b (zigzag bands). */
const SOAP = new Float32Array(W * H);
for (let p = 0; p < W * H; p++) SOAP[p] = 0.6 * kit.noise2((p % W) / 2.3, Math.floor(p / W) / 2.3) + 0.4 * kit.hash(p, 5, 1);
function erased(x, y, b, u, nb) {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  // everywhere at once: pales, then breaks up into soapy specks (no shape survives)
  const e = 0.55 * u + 1.6 * (u - 0.45 * SOAP[y * W + x]) ;
  return e <= 0 ? 0 : e >= 1 ? 1 : e;
}
function spongeAt(b, u, nb) {
  const band = Math.min(nb - 1, Math.floor(u * nb)), v = u * nb - band;
  const xr = band & 1 ? 1 - v : v;
  return [b.x + xr * b.w, b.y + (band + 0.5) * (b.h / nb) + Math.sin(u * 60) * 1.2];
}

/** Paint one crayon glyph: revealed up to length `upto`, scrubbed by (box, u). */
function crayon(g, slot, col, upto, box, u, nb) {
  const ox = slot.x + g.gx, oy = slot.y + g.gy;
  for (let j = 0; j < g.gh; j++) {
    const y = oy + j;
    for (let i = 0; i < g.gw; i++) {
      const q = j * g.gw + i, m = g.moat[q];
      if (m <= 0) continue;
      const x = ox + i, p = y * W + x;
      let vis = upto - g.s[q] + 1;
      if (vis <= 0) continue;
      if (vis > 1) vis = 1;
      if (box) vis *= 1 - erased(x, y, box, u, nb);
      if (vis <= 0) continue;
      // a dark moat keeps the wax line off the wallpaper
      const k = 1 - 0.8 * m * vis;
      img[3 * p] *= k; img[3 * p + 1] *= k; img[3 * p + 2] *= k;
      let c = g.cov[q];
      if (c < 1) c *= c * (0.55 + 0.9 * GRAIN[p]);        // wax skips on the paper's tooth at the edges
      c *= vis;
      if (c <= 0) continue;
      const L = light[p], sh = (0.62 + 0.25 * (L > 1 ? 1 : L)) * (0.7 + 0.42 * GRAIN[p]);
      img[3 * p] += (col[0] * sh - img[3 * p]) * c;
      img[3 * p + 1] += (col[1] * sh - img[3 * p + 1]) * c;
      img[3 * p + 2] += (col[2] * sh - img[3 * p + 2]) * c;
    }
  }
}

/** Unite the changed slots into the box the sponge works over. */
function boxOf(ch, a, b) {
  let x0 = 1e9, x1 = -1e9, s = null;
  for (let k = a; k <= b; k++) if (ch[k]) { s = slotOf(k); x0 = Math.min(x0, s.x - 2); x1 = Math.max(x1, s.x + s.w + 2); }
  return s ? { x: x0, y: s.y - 3, w: x1 - x0, h: s.h + 6 } : null;
}

function soft(x, y, r, c, a) {
  const x0 = Math.floor(x - r), x1 = Math.ceil(x + r), y0 = Math.floor(y - r), y1 = Math.ceil(y + r);
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    if (!inside(px, py)) continue;
    const d = Math.hypot(px - x, py - y) / r;
    if (d >= 1) continue;
    const f = (1 - d * d) ** 2 * a, p = py * W + px;
    img[3 * p] += c[0] * f; img[3 * p + 1] += c[1] * f; img[3 * p + 2] += c[2] * f;
  }
}
function line(x0, y0, x1, y1, r, c) {
  const minx = Math.floor(Math.min(x0, x1) - r - 1), maxx = Math.ceil(Math.max(x0, x1) + r + 1);
  const miny = Math.floor(Math.min(y0, y1) - r - 1), maxy = Math.ceil(Math.max(y0, y1) + r + 1);
  for (let py = miny; py <= maxy; py++) for (let px = minx; px <= maxx; px++) {
    if (!inside(px, py)) continue;
    const d = kit.segDist(px, py, x0, y0, x1, y1), a = kit.clamp(r + 0.5 - d);
    if (a <= 0) continue;
    const p = py * W + px, L = Math.min(0.95, 0.4 + 0.3 * light[p]);
    img[3 * p] += (c[0] * L - img[3 * p]) * a; img[3 * p + 1] += (c[1] * L - img[3 * p + 1]) * a; img[3 * p + 2] += (c[2] * L - img[3 * p + 2]) * a;
  }
}
function box(x, y, w, h, c, out = true) {
  for (let py = Math.floor(y - 1); py <= Math.ceil(y + h); py++) for (let px = Math.floor(x - 1); px <= Math.ceil(x + w); px++) {
    if (!inside(px, py)) continue;
    const ax = Math.min(px + 0.5 - x, x + w - px - 0.5), ay = Math.min(py + 0.5 - y, y + h - py - 0.5);
    const d = -Math.min(ax, ay), p = py * W + px, L = 0.45 + 0.75 * light[p];
    if (out) { const ao = kit.clamp(1.5 - d); img[3 * p] *= 1 - ao; img[3 * p + 1] *= 1 - ao; img[3 * p + 2] *= 1 - ao; }
    const a = kit.clamp(0.5 - d);
    if (a > 0) { img[3 * p] += (c[0] * L - img[3 * p]) * a; img[3 * p + 1] += (c[1] * L - img[3 * p + 1]) * a; img[3 * p + 2] += (c[2] * L - img[3 * p + 2]) * a; }
  }
}

// dolls (monomorphic objects, reused)
const mk = (h, hr, wt, wb, dress, hair, hairStyle) => ({
  x: 0, y: 0, h, hr, wt, wb, dress: kit.hex(dress), hair: kit.hex(hair), skin: kit.hex('#f0b890'), face: 2, hairStyle,
  asleep: 0, lean: 0, arm: 0, hx: 0, hy: 0, arm2: 0, h2x: 0, h2y: 0, item: 0, itemCol: [1, 1, 1], lying: 0,
});
const MUM = mk(27, 4.6, 3.2, 6.2, '#2f9a8a', '#6a3014', 1);
const SIS = mk(20, 4.0, 2.6, 4.8, '#e0a020', '#3a1a08', 2);
const TOD = mk(15, 3.6, 2.4, 3.8, '#f070a0', '#e0b050', 3);
const SPONGE = kit.hex('#ffd030'), CAKE = kit.hex('#f8e8d0'), ICING = kit.hex('#ff6aa0');
const CONF = [kit.hex('#ffd040'), kit.hex('#ff70b0'), kit.hex('#60e0c0'), kit.hex('#ffffff'), kit.hex('#a080ff')];

function placeDoll(d, s, t, bob) {
  d.x = s.x; d.y = s.y; d.face = s.face; d.lean = 0; d.arm = 0; d.arm2 = 0; d.item = 0; d.lying = 0; d.asleep = 0;
  if (s.moving) d.y -= Math.abs(Math.sin(s.dist * 0.42)) * bob;
  if (s.pose === P.DANCE) { d.y -= Math.abs(Math.sin(t * Math.PI * 2.2)) * 3; d.lean = Math.sin(t * Math.PI * 1.1) * 1.2; d.arm = 1; d.hx = d.x - 6; d.hy = d.y - d.h + 4 + Math.sin(t * 7) * 2; d.arm2 = 1; d.h2x = d.x + 6; d.h2y = d.y - d.h + 4 - Math.sin(t * 7) * 2; }
  if (s.pose === P.STAND || s.pose === P.HIDE) d.y -= Math.max(0, Math.sin(t * 2.1 + d.h)) * 0.6;   // idle sway
}

// --------------------------------------------------------- export
export default {
  name: 'Crayon House',
  blurb: 'a dollhouse where the toddler crayons the minutes on the wall and Mum scrubs them off; party with cake on the hour',
  layouts: ['hub-stair'], look: 'smoke', fps: 60, brightness: 0.45,
  frame(ctx) {
    if (!B) B = bake();
    const d = ctx.date, hh = d.getHours(), mm = d.getMinutes(), s = kit.secOf(d);
    const mi = hh * 60 + mm, pl = plan(mi), hourF = hh + mm / 60 + s / 3600;
    const day = kit.smoothstep(6.5, 8, hourF) * (1 - kit.smoothstep(18.5, 20.5, hourF));
    const t = s, night = ctx.night;

    // ---- who is where
    const ms = evalTrack(pl.mum, t, SR[0]); const mx = ms.x, mpose = ms.pose, mmov = ms.moving;
    const mumX = mx, mumIn = mx < 62 ? 2 : 3;
    // lights: on where Mum (or the party) is; the living room is dim while the toddler plots
    const presence = (tq) => { const q = evalTrack(pl.mum, tq); return q.x; };
    let kitL = 0, livL = 0;
    for (let k = 0; k < 4; k++) { const x = presence(Math.max(0, t - k * 0.06)); if (x < 60) kitL += 0.25; else livL += 0.25; }
    const party = pl.hourIn ? kit.smoothstep(9.5, 10.5, t) * (1 - kit.smoothstep(20, 22, t)) : 0;
    livL = Math.max(livL, party, pl.hourIn ? 1 - kit.smoothstep(22, 26, t) : 0);
    const sisS = evalTrack(pl.sis, t, SR[1]);
    const sisUp = sisS.y < 64;
    const nurL = sisUp ? (pl.night ? 0.12 : 1) : 0.12;
    const amb = [0.55 + 0.25 * day, 0.85 + 0.4 * day, 1.0 + 0.7 * day, 0.85 + 0.45 * day, 1.3 + 0.6 * day];
    const lamp = [0, nurL, 0.15 + 0.85 * kitL, 0.12 + 0.88 * livL];
    // party lights wash the living room in slow colour
    const pr = 1 + 0.3 * party * Math.sin(t * 2.6), pg = 1 + 0.3 * party * Math.sin(t * 2.6 + 2.1), pb = 1 + 0.45 * party * Math.sin(t * 2.6 + 4.2);

    // ---- the house
    const { alb, emis, room, pool } = B;
    for (let p = 0; p < W * H; p++) {
      const r = room[p];
      if (r === ROOM.WINDOW) { light[p] = 1; continue; }
      const L = amb[r] + (r >= 1 && r <= 3 ? lamp[r] * pool[p] * 2.6 : 0);
      light[p] = L;
      const e = r >= 1 && r <= 3 ? lamp[r] : 0;
      if (r === ROOM.LIVING && party > 0) {
        img[3 * p] = alb[3 * p] * L * pr + emis[3 * p] * e; img[3 * p + 1] = alb[3 * p + 1] * L * pg + emis[3 * p + 1] * e; img[3 * p + 2] = alb[3 * p + 2] * L * pb + emis[3 * p + 2] * e;
      } else {
        img[3 * p] = alb[3 * p] * L + emis[3 * p] * e; img[3 * p + 1] = alb[3 * p + 1] * L + emis[3 * p + 1] * e; img[3 * p + 2] = alb[3 * p + 2] * L + emis[3 * p + 2] * e;
      }
    }
    // the oven glows on its own
    // window: the sky outside, by the hour
    const skyTop = kit.mix(kit.hex('#0a1030'), kit.hex('#4a8ad8'), day), skyBot = kit.mix(kit.hex('#101838'), kit.hex('#a8d0f0'), day);
    const dusk = Math.max(0, 1 - Math.abs(hourF - 19.3) / 1.2) + Math.max(0, 1 - Math.abs(hourF - 6.8) / 1.0);
    const cloudX = WIN.x - 6 + ((ctx.date.getTime() / 1000 / 7) % 26);
    for (let y = WIN.y; y < WIN.y + WIN.h; y++) for (let x = WIN.x; x < WIN.x + WIN.w; x++) {
      const p = y * W + x;
      if (room[p] !== ROOM.WINDOW) continue;
      const v = (y - WIN.y) / WIN.h;
      let c = kit.mix(skyTop, skyBot, v);
      c = kit.mix(c, kit.hex('#ff8040'), dusk * v * 0.7);
      let r = c[0], g = c[1], b = c[2];
      if (day > 0.3) { const cd = Math.hypot((x - cloudX) / 3.2, (y - WIN.y - 5) / 1.6); if (cd < 1) { const a = (1 - cd) * day; r += 0.5 * a; g += 0.5 * a; b += 0.5 * a; } }
      else if (kit.hash(x, y, 9) > 0.93) { const tw = 0.06 * (0.6 + 0.4 * Math.sin(t * 2 + x * 3)); r += tw; g += tw; b += tw; }
      img[3 * p] = r * 0.55; img[3 * p + 1] = g * 0.55; img[3 * p + 2] = b * 0.55;
    }
    if (day < 0.3) soft(WIN.x + 9, WIN.y + 4, 2.2, [0.5, 0.48, 0.35], 0.6 * (1 - day));   // the moon

    // ---- crayon on the walls
    for (let k = 0; k < 4; k++) {
      const col = k < 2 ? RED : BLUE, slot = slotOf(k);
      if (!pl.chIn[k] || t >= DRAW1 + 0.05) { crayon(pl.gIn[k], slot, col, 1e9, null, 0, 0); continue; }
      // the turn: old digit scrubbed off, new one scribbled
      const hourSlot = k < 2, bx = hourSlot ? boxOf(pl.chIn, 0, 1) : boxOf(pl.chIn, 2, 3);
      const nb = hourSlot ? 3 : 4;
      const u = kit.clamp(t / SCRUB_T);
      if (u < 1) crayon(pl.gPrev[k], slot, col, 1e9, bx, u, nb);
      if (t > DRAW0) {
        const [fA, fB] = drawWindow(pl.chIn, k, pl.gIn);
        const f = kit.clamp((t - fA) / (fB - fA));
        if (f > 0) crayon(pl.gIn[k], slot, col, f * pl.gIn[k].len, null, 0, 0);
      }
    }
    // soap suds left by the sponge, popping over a second
    for (const [a, b, nb] of [[0, 1, 3], [2, 3, 4]]) {
      const bx = boxOf(pl.chIn, a, b);
      if (!bx || t > 3) continue;
      for (let n = 0; n < 26; n++) {
        const x = bx.x + kit.hash(n, mi, a) * bx.w, y = bx.y + kit.hash(n, mi, a + 9) * bx.h;
        let yr = kit.clamp((y - bx.y) / bx.h, 0, 0.999); const band = Math.floor(yr * nb), xr = (x - bx.x) / bx.w;
        const tE = ((band + (band & 1 ? 1 - xr : xr)) / nb) * SCRUB_T, age = t - tE;
        if (age < 0 || age > 1.6) continue;
        soft(x, y + age * 2, 1.3, [0.5, 0.52, 0.6], 0.5 * (1 - age / 1.6));
      }
    }

    // ---- kettle steam, always
    for (let n = 0; n < 7; n++) {
      const ph = kit.fract(t / 3.2 + n / 7), x = 2 + ph * 6 + Math.sin(ph * 6 + n) * 2.2, y = 97 - ph * 26;
      soft(x, y, 1.2 + ph * 2.4, [0.6, 0.62, 0.66], 0.16 * Math.sin(ph * Math.PI) * (0.6 + 0.4 * day + 0.3));
    }

    // ---- the cat
    const cs = evalTrack(pl.cat, t, SR[2]);
    const stretch = cs.moving ? 0 : kit.smoothstep(0, 1, Math.max(0, Math.sin((ctx.date.getTime() / 1000) * Math.PI * 2 / 31) * 1.6 - 0.6));
    drawCat(img, light, cs.x, cs.y - (cs.moving ? Math.abs(Math.sin(cs.dist * 0.5)) * 1.5 : 0), cs.moving ? cs.face || 1 : (mumX > 62 ? 1 : -1), stretch, t * 2.4, cs.moving ? cs.dist * 0.9 : 0);

    // ---- big sister
    {
      const S2 = sisS, D = SIS;
      placeDoll(D, S2, t, 2);
      const turnIn = pl.chIn[1] && t < 3.3;
      if (S2.pose === P.READ && !turnIn) {
        D.lying = 1; D.x = BED_X; D.y = 52; D.h = 19; D.lean = Math.sin(t * 3.1); D.item = pl.night ? 0 : 4; D.itemCol = kit.hex('#3070d0');
        D.asleep = pl.night ? 1 : 0; if (pl.night) D.lean = 0;
      } else D.h = 20;
      if (turnIn) flyDraw(D, pl, t, [0, 1], RED, 9, UP, 32);
      else if (S2.pose === P.SNEAK) { D.face = 0; D.arm = 1; D.hx = D.x + 4; D.hy = D.y - 16; D.item = 1; D.itemCol = SPONGE; }
      drawDoll(img, light, D);
    }
    // ---- Mum
    {
      const D = MUM;
      placeDoll(D, ms, t, 2.2);
      if (mpose === P.STIR) { D.arm = 1; D.hx = 16 + Math.sin(t * 3) * 1.2; D.hy = 103 + Math.cos(t * 3) * 0.8; }
      if (mpose === P.LOOK) { D.lean = 0.8 * D.face; }
      if (mpose === P.CARRY) { D.arm = 1; D.hx = D.x + 6; D.hy = FLOOR - 12; D.arm2 = 1; D.h2x = D.x + 5; D.h2y = FLOOR - 13; }
      let mop = null;
      if (mpose === P.SCRUB && pl.chIn[3] && t < SCRUB_T) {
        const bx = boxOf(pl.chIn, 2, 3), sp = spongeAt(bx, kit.clamp(t / SCRUB_T), 4);
        D.face = 0; D.arm = 1; D.hx = D.x + (sp[0] > D.x ? 3 : -3); D.hy = FLOOR - 19; mop = sp;
        D.lean = kit.clamp((sp[0] - D.x) / 12, -1, 1) * 1.5;
      } else if (mpose === P.SCRUB) { D.face = 0; D.arm = 1; D.hx = D.x + 3; D.hy = FLOOR - 19; mop = [D.x + 6, 96]; }
      else if (mpose === P.MOP || (mpose === P.LOOK && t < 5)) { D.arm = 1; D.hx = D.x + (D.face || 1) * 3; D.hy = FLOOR - 15; mop = [D.x - (D.face || 1) * 7, FLOOR - 1]; }
      drawDoll(img, light, D);
      if (mop) {
        line(D.hx, D.hy, mop[0], mop[1], 0.6, kit.hex('#a07040'));
        box(mop[0] - 2.5, mop[1] - 1.7, 5, 3.4, SPONGE);
      }
    }
    // ---- toddler
    {
      const D = TOD, ts = evalTrack(pl.tod, t, SR[3]);
      placeDoll(D, ts, t, 2.5);
      if (pl.chIn[3] && t > FLY0 && t < DRAW1 + 0.5) flyDraw(D, pl, t, [2, 3], BLUE, 122, FLOOR, null);
      else if (ts.pose === P.SNEAK) {
        // on tiptoe at the wall, crayon up, can't quite reach
        const r = Math.abs(Math.sin(t * 5.5));
        D.face = 0; D.y -= r * 3; D.arm = 1; D.hx = D.x + 3; D.hy = D.y - 15 - r; D.item = 2; D.itemCol = BLUE;
      } else if (ts.moving && kit.hash(mi, 1, 2) < 2) { D.arm = 1; D.hx = D.x + (D.face || 1) * 4; D.hy = D.y - 8; D.item = 2; D.itemCol = BLUE; }
      drawDoll(img, light, D);
    }

    // ---- cake on the table during the hour's first minute
    if (pl.hourIn) {
      if (party > 0 || t < 30) { box(TABLE.x, TABLE.top, TABLE.w, 2, kit.hex('#7d4a24')); box(TABLE.x + 2, TABLE.top + 2, 2, 6, kit.hex('#5a3418')); box(TABLE.x + TABLE.w - 4, TABLE.top + 2, 2, 6, kit.hex('#5a3418')); }
      const placed = t >= 10.2, held = mpose === P.CARRY && !placed;
      // carried in Mum's hands, then lifted over and set down on the table (eased)
      let cx = mumX + 6, cy = FLOOR - 13 - (mmov ? Math.abs(Math.sin(ms.dist * 0.42)) * 2 : 0);
      const e = kit.ease.inOut(kit.clamp((t - 9.2) / 1.0));
      if (e > 0) { const tx = TABLE.x + TABLE.w / 2; cx = cx + (tx - cx) * e; cy = cy + (TABLE.top - cy) * e - Math.sin(e * Math.PI) * 3; }
      if (placed || held || t > 6.2) {
        const left = placed ? 1 - kit.clamp((t - 30) / 26) : 1;               // slices go
        const cw = 13 * Math.max(0.0001, left);
        if (left > 0.04) {
          box(cx - 6.5, cy - 7, cw, 4, CAKE); box(cx - 6.5, cy - 8.5, cw, 2, ICING, false);
          for (let c = 0; c < 4; c++) {
            const x = cx - 5 + c * 3.3;
            if (x > cx - 6.5 + cw - 1) continue;
            line(x, cy - 9.5, x, cy - 12, 0.45, [0.8, 0.8, 0.9]);
            const lit = placed && t < 18 ? 1 : held ? 0 : 0;
            if (lit) soft(x + Math.sin(t * 9 + c) * 0.3, cy - 13.6, 1.5, [1, 0.6, 0.15], 0.9);
            if (placed && t > 18 && t < 21) soft(x + (t - 18) * 1.5, cy - 14 - (t - 18) * 4, 1 + (t - 18), [0.25, 0.25, 0.27], 0.25 * (1 - (t - 18) / 3));
          }
        }
      }
    }

    // ---- party trimmings: bunting under the ceiling, confetti
    if (pl.hourIn) {
      const ba = kit.smoothstep(8, 9.5, t) * (1 - kit.smoothstep(40, 43, t));
      if (ba > 0) for (let x = 66; x <= 125; x++) {
        const xr = (x - 66) / 59, y = 66.5 + 2.2 * Math.sin(Math.PI * xr) + Math.sin(t * 2 + xr * 6) * 0.3 * party;
        const p = Math.round(y) * W + x;
        img[3 * p] += 0.12 * ba; img[3 * p + 1] += 0.1 * ba; img[3 * p + 2] += 0.08 * ba;
        const fi = Math.floor((x - 66) / 5), fx = (x - 66) % 5;
        const col = CONF[fi % 5];
        for (let dy = 1; dy <= 3 - Math.abs(fx - 2) && fx < 5; dy++) {
          const q = (Math.round(y) + dy) * W + x;
          img[3 * q] = col[0] * 0.35 * ba + img[3 * q] * (1 - ba); img[3 * q + 1] = col[1] * 0.35 * ba + img[3 * q + 1] * (1 - ba); img[3 * q + 2] = col[2] * 0.35 * ba + img[3 * q + 2] * (1 - ba);
        }
      }
      if (t > 10.3 && t < 50) {
        for (let n = 0; n < 44; n++) {
          const sp = 7 + 7 * kit.hash(n, 2), x0 = 68 + 56 * kit.hash(n, 3);
          const tt2 = t - 10.3 - 2 * kit.hash(n, 4);
          if (tt2 < 0) continue;
          let y = 67 + tt2 * sp, x = x0 + Math.sin(tt2 * 3 + n) * 2.5;
          if (y > 121.5) { y = 121.5; x = x0 + Math.sin((55 / sp) * 3 + n) * 2.5; }
          const fade = 1 - kit.smoothstep(40, 50, t);
          const tw = y >= 121.5 ? 0.4 : 0.5 + 0.5 * Math.sin(t * 9 + n * 2);
          soft(x, y, 1.1, CONF[n % 5], 0.7 * tw * fade);
        }
      }
    }

    // ---- night dims the whole house
    const dim = 1 - 0.55 * night;
    kit.blitGrid(ctx, img, dim);
  },
};

/** When (seconds) the scribble of slot k runs, given which slots changed. */
function drawWindow(ch, k, g) {
  const a = k < 2 ? 0 : 2, list = [a, a + 1].filter((q) => ch[q]);
  const t0 = k < 2 ? DRAW0 - 0.05 : DRAW0, t1 = DRAW1;
  let total = 0; for (const q of list) total += g[q].len;
  let acc = 0;
  for (const q of list) {
    const ta = t0 + ((t1 - t0) * acc) / total; acc += g[q].len;
    if (q === k) return [ta, t0 + ((t1 - t0) * acc) / total];
  }
  return [t0, t1];
}

/**
 * A doll whisked up the wall by an unseen hand: hanging from the crayon (or
 * the sponge) as it moves. Before the scrub ends it holds a sponge (sister
 * scrubs her own hour); then it scribbles the changed slots in order and
 * drops back to the floor at (homeX, floorY).
 */
function flyDraw(D, pl, t, slots, col, homeX, floorY, scrubHomeX) {
  const ch = pl.chIn, g = pl.gIn;
  let hand = null, item = 2;
  const list = slots.filter((q) => ch[q]);
  if (!list.length) return;
  const own = scrubHomeX != null;                         // sister scrubs her own
  const bx = boxOf(ch, slots[0], slots[1]);
  const startTip = (() => { const s = slotOf(list[0]), p = tipAt(g[list[0]], 0); return [s.x + p[0], s.y + p[1]]; })();
  const restHand = [scrubHomeX ?? homeX, floorY - D.h + 4];
  if (own && t < SCRUB_T) {
    const sp = spongeAt(bx, kit.clamp(t / SCRUB_T), 3), e = kit.smoothstep(0, 0.18, t);
    hand = [restHand[0] + (sp[0] - restHand[0]) * e, restHand[1] + (sp[1] - restHand[1]) * e]; item = 1;
  } else if (t < DRAW0) {
    const from = own ? spongeAt(bx, 1, 3) : restHand;
    const f0 = own ? SCRUB_T : FLY0, e = kit.ease.inOut(kit.clamp((t - f0) / (DRAW0 - f0)));
    hand = [from[0] + (startTip[0] - from[0]) * e, from[1] + (startTip[1] - from[1]) * e - Math.sin(e * Math.PI) * 4];
  } else if (t < DRAW1) {
    for (const q of list) {
      const [a, b] = drawWindow(ch, q, g);
      if (t <= b || q === list[list.length - 1]) {
        const f = kit.clamp((t - a) / (b - a)), s = slotOf(q), p = tipAt(g[q], f);
        hand = [s.x + p[0], s.y + p[1]]; break;
      }
    }
  } else {
    // let go: drop to the floor below the last digit and bounce
    const s = slotOf(list[list.length - 1]), p = tipAt(g[list[list.length - 1]], 1);
    const end = [s.x + p[0], s.y + p[1]];
    const e = kit.clamp((t - DRAW1) / 0.45), landX = own ? scrubHomeX : homeX;
    const bx2 = end[0] + (landX - end[0]) * kit.ease.inOut(e);
    const fall = end[1] + (restHand[1] - end[1]) * (e * e);
    const bounce = e >= 1 ? Math.abs(Math.sin((t - DRAW1 - 0.45) * 9)) * 3 * Math.exp(-(t - DRAW1 - 0.45) * 5) : 0;
    D.x = bx2 - 3; D.y = Math.min(floorY, fall + D.h - 4) - bounce; D.face = 2;
    if (e < 1) { D.arm = 1; D.hx = D.x + 3; D.hy = D.y - D.h + 4 - 2; D.item = 2; D.itemCol = col; } else D.face = 2;
    return;
  }
  // hang below the hand, swinging a little
  D.arm = 1; D.hx = hand[0]; D.hy = hand[1]; D.item = item; D.itemCol = item === 1 ? SPONGE : col;
  D.x = hand[0] - 3.5; D.y = Math.min(floorY, hand[1] + D.h - 3); D.face = 2; D.lean = Math.sin(t * 8) * 0.8;
}
