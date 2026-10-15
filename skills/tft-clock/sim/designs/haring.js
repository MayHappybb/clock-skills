// Haring: a Keith Haring mural, and the four numerals are its dancers.
//
// Each digit is one Haring figure whose body IS the numeral (haring-glyphs.js:
// a 6 px flat fill inside one fat 2 px black line, open counters), with the
// faceless round head on top, two stubby legs and, where the numeral leaves
// a shoulder free, arms; where its own stroke can be an arm it is one (the
// 1's flag, the 4's waving forearm, the bars of 5 and 7). Hours stand left
// and minutes right of a centre column where the barking dog, the radiant
// baby and a heart (the colon) keep the beat with them. The wall is a flat
// bright ground doodled all over in its own tone, Haring's alphabet of
// little dancers, hearts, crosses, saucers, pyramids and zigzags, and every
// figure keeps a moat of plain wall round its line.
//
// The time is never still: the club beat is 120 bpm. On every beat each
// dancer hops (hours on the beat, minutes on the off-beat, so the pairs
// pump in counterpoint), squashes on landing, sways from side to side and
// swings its arms up; Haring's motion marks flash with it, three dashes over
// the head at the top of each hop, ticks at the feet on each landing. The
// wall's doodles flip between their two drawings on every beat, the way his
// own animations boil; the baby crawls and its rays flicker, the dog barks,
// the heart beats. Every 12 s a flourish: the dog rears up and barks a
// volley and the dancers leap in fright; a jump wave runs along the line and
// back; or the baby glows, its rays spin out and the dancers reach for it.
//
// Minute turn: the changing dancer crouches, springs, and leaps away into
// the wall (it shrinks as it rises, whole, so it only ever reads as itself),
// and vanishes in a Haring pop of radiating lines before :00. After :00 the
// new dancer drops out of the pop, growing as it falls, lands in a deep
// squash with impact lines, strikes a breakdance freeze (leaning hard, one
// leg kicked), and joins the beat. Hour: the party. On each of 16 beats a
// new ground floods out from the heart in a ring (red, sky, yellow, green,
// pink, orange, purple), each dancer taking the new colours as the ring
// passes it, while a jump wave runs along the line, the dog barks on its
// hind legs and the baby blazes; the last flood is the new hour's wall.
//
// Palette (haring-art.js): Haring's Pop Shop primaries on one flat ground per
// part of the day, one black line; by night a subway panel, black paper and a
// white chalk line, the fills sunk to deep inks, the backlight down. Hard
// pixels throughout: his line has no soft edge.
//
// Cost: bodies are sampled from 10 distance fields (27 KB flash) per pixel
// of each dancer's box; limbs, marks and actors are kit capsules and class
// maps; the wall is two 1-bit doodle maps (3.2 KB as bits). No caches and no
// scratch frame: every frame is built cold from the time.
import { clockFields, hash, sin, cos, ease, to565 } from '../js/kit.js';
import { body, hips, head, shoulders, limbs } from './haring-cast.js';
import { BLACK, wallFor, PARTY, PARTY_NIGHT, c565, paintWall, stamp, DOG, BABY, HEART } from './haring-art.js';

const W = 160, H = 80;
const SLOT = [18, 52, 108, 142];
const BY = 66, FOOT = 71.5, CX = 80;
const HEART_Y = 32, DOG_Y = 52, BABY_Y = 5;
const TAU = Math.PI * 2;
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const frac = (x) => x - Math.floor(x);

// arm poses: [elbow, hand] offsets from the shoulder, for the left arm (the right mirrors)
const ARM = { V: [-4.5, -3, -8.5, -9], UP: [-6.5, -2.5, -7.5, -10.5], LOW: [-5, -1, -9.5, -3.5], HIGH: [-3.5, -5, -4.5, -12] };
const lerpPose = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);

/** A Haring motion mark: a fat 2 px dash. */
function dash(g, x0, y0, x1, y1, c) { g.thickLine(x0, y0, x1, y1, 2, c); }

/** Radiating dashes round a point. */
function rays(g, x, y, r0, r1, n, rot, c, sy = 1, skip = -1, sx = 1) {
  for (let j = 0; j < n; j++) {
    if (skip >= 0 && (j & 1) === skip) continue;
    const a = rot + (j * TAU) / n, ca = cos(a), sa = sin(a);
    dash(g, x + ca * r0 * sx, y + sa * r0 * sy, x + ca * r1 * sx, y + sa * r1 * sy, c);
  }
}

// ------------------------------------------------------------ the flourishes

const FL = [12, 24, 36, 48], FL_LEN = 3.2, KINDS = ['bark', 'wave', 'glow'];
function flourish(mk, s) {
  for (let j = 0; j < FL.length; j++)
    if (s >= FL[j] && s < FL[j] + FL_LEN) return { kind: KINDS[(hash(mk, 7) + j) % 3], t: s - FL[j] };
  return null;
}

// ------------------------------------------------------------ one dancer

/**
 * The pose of slot i at second s. job: null, { out: t } (leaving, t from
 * :58.3) or { in: t } (arriving, t from :00). party: beat time of the hour's
 * wave, or -1. Returns the body pose P, limbs and which marks to flash.
 */
function dance(i, d, s, job, fl, party, mk) {
  const b = s * 2 + (i < 2 ? 0 : 0.5);              // minutes on the off-beat
  const n = Math.floor(b), p = b - n;
  let hop = n & 1 ? 2.6 : 4.2;
  let sway = 2.8 * (i & 1 ? -1 : 1);
  let lean = 0, armA = 'V', armB = 'UP', sq = 0.07;
  let marks = 1;
  // flourishes
  if (fl) {
    if (fl.kind === 'bark') {
      const t = fl.t;
      if (t > 0.35 && t < 1.5) { const u = (t - 0.35) / 1.15; return pose(i, d, 7 * Math.sin(Math.PI * u), 0, 0, 1, 'HIGH', 'HIGH', u, 2, p, n); }
    } else if (fl.kind === 'wave') {
      const t = fl.t, xw = t < 1.6 ? -10 + t * 112 : 170 - (t - 1.6) * 112;
      const dx = Math.abs(SLOT[i] - xw);
      if (dx < 26) { const u = 1 - dx / 26; hop += 6 * sm(u) * Math.sin(Math.PI * p); armA = 'UP'; armB = 'HIGH'; }
    } else if (fl.kind === 'glow') {
      const u = sm(fl.t / 0.6) * (1 - sm((fl.t - 2.5) / 0.7));
      lean = (i < 2 ? 1 : -1) * 4.5 * u; sway *= 1 - u; hop *= 1 - 0.6 * u; armA = 'HIGH'; armB = 'HIGH';
    }
  }
  if (party >= 0) {
    // the hour's jump wave: one crest running along the line on every beat
    const q = frac(party - i * 0.22);
    hop = 7 * Math.sin(Math.PI * q); sway = 1.5 * (i & 1 ? -1 : 1); armA = 'UP'; armB = 'HIGH'; marks = 2;
    return pose(i, d, hop, sway * Math.sin(Math.PI * q), 0, 1, armA, armB, q, marks, q, n);
  }
  let lift = hop * Math.sin(Math.PI * p);
  let k = sway * Math.sin(Math.PI * b) + lean;
  // arriving or leaving: the leap
  if (job && job.out !== undefined) return leaveOut(i, d, job.out, lift, k, p, n);
  if (job && job.in !== undefined) return arriveIn(i, d, job.in, lift, k, p, n);
  return pose(i, d, lift, k, 0, 1, armA, armB, 0.5 - 0.5 * Math.cos(TAU * p), marks, p, n, sq);
}

/** A standing/hopping pose. lift: px off the floor; k: lean; crouch 0..1; sc: size. */
function pose(i, d, lift, k, crouch, sc, armA, armB, au, marks, p, n, sq = 0.07, dx = 0, dy = 0, kick = 0) {
  if (lift > 7.5) lift = 7.5;                                  // the head never leaves the glass
  const c = Math.max(0, 1 - Math.min(p, 1 - p) / 0.12);       // contact: squash
  let sy = (1 - sq * c + 0.03 * Math.sin(Math.PI * p) - 0.16 * crouch) * sc, sx = (1 + 0.6 * sq * c + 0.06 * crouch) * sc;
  const by = BY - lift + dy;
  const P = { d, cx: SLOT[i] + dx, by, sx, sy, k };
  // legs: feet rise less than the body, knees bow out
  const L = [];
  const [hl, hr] = hips(P), fy = FOOT - lift * 0.45 + dy;
  const bow = 2 + lift * 0.35 + crouch * 3;
  for (let side = 0; side < 2; side++) {
    const h0 = side ? hr : hl, sg = side ? 1 : -1;
    const kk = side === 1 ? kick : 0;
    const foot = [h0[0] + sg * (3.5 + crouch * 2 + kk * 6) * sc, (fy - kk * 5 - h0[1]) * (sc < 1 ? sc : 1) + h0[1]];
    const knee = [(h0[0] + foot[0]) / 2 + sg * bow * sc, (h0[1] + foot[1]) / 2 - kk * 2];
    L.push([h0, knee, foot]);
  }
  // arms
  const A = [], pa = lerpPose(ARM[armA], ARM[armB], au);
  const S = shoulders(P);
  for (let side = 0; side < 2; side++) {
    const s0 = S[side];
    // one arm each, on the pair's outer side for the outer dancers and reaching
    // in to the centre column for the inner two, so no two hands ever meet
    if (!s0 || side !== (i & 1)) continue;
    const sg = side ? -1 : 1;
    A.push([s0, [s0[0] + sg * pa[0] * sc, s0[1] + pa[1] * sc], [s0[0] + sg * pa[2] * sc, s0[1] + pa[3] * sc]]);
  }
  return { P, L, A, marks, p, n, sc, lift };
}

// leaving: crouch (58.3-59.0), spring and leap away into the wall, shrinking whole (59.0-59.75)
const T_SPRING = 0.7, T_LEAP = 0.75;
function leaveOut(i, d, t, lift, k, p, n) {
  if (t < T_SPRING) {
    const u = sm(t / T_SPRING), w = 1 - sm(t / 0.3);
    return pose(i, d, lift * w, k * w, u, 1, 'V', 'LOW', u, t < 0.3 ? 1 : 0, p * w, n);
  }
  const u = Math.min(1, (t - T_SPRING) / T_LEAP), e = ease.inOutQuad(u);
  const sc = 1 - 0.84 * e;
  // it springs up first, then its top stays near y 6 while it shrinks: it leaps back into the wall
  const top = 9 - 6 * Math.sin(Math.PI * Math.min(1, u / 0.5) * 0.5) + 3 * Math.max(0, u - 0.5);
  const cy = top + 28.5 * sc;
  const dx = (i < 2 ? -1 : 1) * 7 * e;
  const st = u < 0.2 ? 1 + 0.12 * Math.sin((Math.PI * u) / 0.2) : 1;
  const out = pose(i, d, 0, 0, 0, sc, 'HIGH', 'HIGH', 1, 0, 0.5, n, 0, dx, cy + 28 * sc - BY);
  out.P.sy *= st; out.trail = 1 - u; out.pop = -1;
  return out;
}
/** Where the pop of a leaving or arriving dancer is. */
const popAt = (i) => [SLOT[i] + (i < 2 ? -7 : 7), 13];

// arriving: drops out of the pop growing as it falls (0-0.75), lands in a squash (0.75-1.0),
// breakdance freeze (1.0-1.6), joins the beat (1.6-2.1)
function arriveIn(i, d, t, lift, k, p, n) {
  const T1 = 0.75;
  if (t < T1) {
    const u = t / T1, e = ease.inQuad(u);
    const cy = 13 + 25.5 * e, sc = Math.max(0.14, Math.min(1, (cy - 9.5) / 28.5));
    const dx = (i < 2 ? -1 : 1) * 7 * (1 - e);
    const o = pose(i, d, 0, 0, 0, sc, 'HIGH', 'UP', u, 0, 0.5, n, 0, dx, cy + 28 * sc - BY);
    o.trail = u;
    return o;
  }
  if (t < 1.0) {
    const u = (t - T1) / 0.25, c = Math.sin(Math.PI * u);
    const o = pose(i, d, 0, 0, 0.9 * c, 1, 'LOW', 'V', u, 0, 0.5, n);
    o.impact = 1 - u;
    return o;
  }
  const sgn = i < 2 ? -1 : 1;
  if (t < 1.6) {
    const u = (t - 1.0) / 0.6, e = sm(u / 0.3) * (1 - sm((u - 0.75) / 0.25));
    return pose(i, d, 2 * e, sgn * 6 * e, 0.25 * e, 1, 'V', 'HIGH', e, 1, 0.5, n, 0, 0, 0, e);
  }
  const w = sm((t - 1.6) / 0.5);
  return pose(i, d, lift * w, k * w, 0, 1, 'V', 'UP', 0.5 - 0.5 * Math.cos(TAU * p), 1, p, n);
}

// ------------------------------------------------------------ drawing one dancer

function drawDancer(g, D, Q, fillC, ink565, inkC) {
  const fill = to565(fillC);
  body(g, D.P, ink565, fill, Q.ground, null);
  limbs(g, D.P, D.L, inkC, fillC, fill, D.sc);
  if (D.A.length) limbs(g, D.P, D.A, inkC, fillC, fill, D.sc);
}

function marksFor(g, D, inkC, big) {
  const P = D.P, p = D.p;
  if (D.marks <= 0) return;
  const [hx, hy] = head(P);
  // over the head at the top of the hop
  if (p > 0.3 && p < 0.72) {
    const r0 = 9.5 + (big ? 1 : 0), r1 = r0 + (big ? 4.5 : 3.2);
    for (const a of big ? [-0.9, -0.45, 0, 0.45, 0.9] : [-0.62, 0, 0.62]) {
      const ang = -Math.PI / 2 + a, ca = cos(ang), sa = sin(ang);
      dash(g, hx + ca * r0, hy + sa * r0, hx + ca * r1, hy + sa * r1, inkC);
    }
  }
  // vibration lines down both sides at the top of the big hop, Haring's (( figure ))
  if (p > 0.36 && p < 0.66 && ((D.n & 1) === 0 || big)) {
    const ya = P.by - 34 * P.sy, yb = P.by - 17 * P.sy, sh = P.k * 0.5;
    for (const sg of [-1, 1]) {
      const x = P.cx + sh + sg * (15.5 + (big ? 0.5 : 0));
      dash(g, x, ya, x + sg * 0.8, ya + 5, inkC);
      dash(g, x + sg * 0.8, yb, x, yb + 5, inkC);
    }
  }
  // ticks at the feet on landing
  if (p < 0.2 || p > 0.94) {
    const f0 = D.L[0][2], f1 = D.L[1][2];
    dash(g, f0[0] - 4.5, FOOT + 0.5, f0[0] - 7, FOOT - 1.5, inkC);
    dash(g, f1[0] + 4.5, FOOT + 0.5, f1[0] + 7, FOOT - 1.5, inkC);
  }
}

// ------------------------------------------------------------ the frame

export default {
  name: 'Haring',
  blurb: 'A Keith Haring mural: the four numerals are his dancers, hopping on a 120 bpm beat with flashing motion marks beside the barking dog and the radiant baby; each minute the old dancer leaps away and the new one drops in.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey;
    ctx.lcd.backlight(1 - 0.55 * ctx.night);
    const T = ctx.date.getTime();
    const prv = clockFields(new Date(T - 60000)), nxt = clockFields(new Date(T + 60000));
    const cur = f.hh + f.mm, old = prv.hh + prv.mm, nw = nxt.hh + nxt.mm;
    const hourShow = prv.h !== f.h && s < 11;
    const beat = s * 2, bn = Math.floor(beat), bp = beat - bn;

    // ---- the wall (and the hour's floods)
    let A = wallFor(f.h), B = null, rr = -1, party = -1;
    const PT = A.night ? PARTY_NIGHT : PARTY;
    if (hourShow) {
      const old = wallFor(prv.h);
      if (s < 2) A = old;
      else if (s < 10) {
        const k = Math.floor((s - 2) * 2), u = (s - 2) * 2 - k;
        A = k === 0 ? old : PT[(k - 1 + f.h) % PT.length];
        B = k === 15 ? wallFor(f.h) : PT[(k + f.h) % PT.length];
        rr = 190 * ease.outCubic(Math.min(1, u / 0.6));
        party = (s - 2) * 2;
      }
    }
    paintWall(g, A, bn, B, CX, HEART_Y + 8, rr);
    const inWall = (x, y) => (B && (x - CX) ** 2 + (y - HEART_Y - 8) ** 2 < rr * rr ? B : A);
    const ink = A.ink, ink565 = to565(ink);

    const fl = hourShow ? null : flourish(mk, s);

    // ---- the centre column: baby, heart, dog
    const Wc = c565(inWall(CX, 20));
    {
      const glow = fl && fl.kind === 'glow' ? sm(fl.t / 0.5) * (1 - sm((fl.t - 2.6) / 0.6)) : party >= 0 ? 1 : 0;
      const bob = Math.round(Math.sin(Math.PI * bp) * 1.5);
      const bx = CX - 11, by = BABY_Y + 1 - bob;
      const rot = glow * fl?.t * 2 || 0;
      rays(g, CX, by + 8, 12.5 + glow * 1, 16.5 + glow * 4 + (bn & 1) * 1.5, 12, rot + (bn & 1 ? 0.26 : 0), ink, 0.68, -1, 0.8);
      stamp(g, BABY[bn & 1], bx, by, Wc.ink, Wc.baby, Wc.ground);
    }
    {
      const Wh = c565(inWall(CX, HEART_Y + 8));
      const big = bp < 0.25 ? 0 : 1;
      stamp(g, HEART[big], CX - 8.5, HEART_Y, Wh.ink, Wh.heart, Wh.ground);
      if (big === 0) { dash(g, CX - 11, HEART_Y + 2, CX - 13, HEART_Y, ink); dash(g, CX + 11, HEART_Y + 2, CX + 13, HEART_Y, ink); }
    }
    {
      const Wd = c565(inWall(CX, 62));
      const rear = (fl && fl.kind === 'bark' && fl.t < 2.4) || party >= 0;
      const bark = rear ? frac(s * 4) < 0.5 : (bn & 3) === 1 && bp < 0.5;
      const pz = rear ? 2 : bark ? 1 : 0;
      const hopd = rear ? Math.round(Math.sin(Math.PI * frac(s * 4)) * 1.5) : 0;
      stamp(g, DOG[pz], CX - 15, DOG_Y - hopd, Wd.ink, Wd.dog, Wd.ground);
      if (bark) {
        const mx = CX - 15 + (rear ? 26 : 27), my = DOG_Y - hopd + (rear ? 1 : 7);
        for (const a of [-1.15, -0.65, -0.15]) {
          const ca = cos(a), sa = sin(a);
          if (rear) dash(g, mx + ca * 2 - 4, my - 3 + sa * 2, mx + ca * 4.5 - 4, my - 3 + sa * 4.5, ink);
          else dash(g, mx - 2 + ca * 1, my - 4 + sa * 2, mx - 2 + ca * 3, my - 4 + sa * 4.5, ink);
        }
      }
    }

    // ---- the dancers
    const Ds = [];
    for (let i = 0; i < 4; i++) {
      let job = null, d = +cur[i];
      if (s >= 58.3 && cur[i] !== nw[i]) job = { out: s - 58.3 };
      else if (s < 2.1 && old[i] !== cur[i]) job = { in: s };
      if (job && job.out !== undefined && job.out >= T_SPRING + T_LEAP) { Ds.push({ i, gone: job.out - T_SPRING - T_LEAP }); continue; }
      if (job && job.in !== undefined && job.in < 0.05) { Ds.push({ i, gone: -1, pre: job.in }); continue; }
      const D = dance(i, d, s, job, fl, party, mk);
      D.i = i; D.job = job;
      Ds.push(D);
    }
    // steady dancers first, flying ones on top
    const order = Ds.filter((D) => D.P && !(D.sc < 1)).concat(Ds.filter((D) => D.P && D.sc < 1));
    for (const D of order) {
      const Wq = inWall(D.P.cx, 40), Q = c565(Wq);
      drawDancer(g, D, Q, Wq.fills[D.i], Wq.ink === BLACK ? ink565 : Q.ink, Wq.ink);
      if (D.sc >= 1) marksFor(g, D, Wq.ink, D.marks > 1 || (fl && fl.kind !== 'glow' && fl.t < 1.6));
      if (D.impact > 0) {
        const f0 = D.L[0][2], f1 = D.L[1][2], e = 1 - D.impact;
        for (const [x, sg] of [[f0[0], -1], [f1[0], 1]]) {
          dash(g, x + sg * (4 + e * 4), FOOT + 1, x + sg * (8 + e * 5), FOOT - 0.5, Wq.ink);
          dash(g, x + sg * (3 + e * 3), FOOT - 4, x + sg * (6 + e * 5), FOOT - 7 - e * 2, Wq.ink);
        }
      }
      if (D.trail > 0 && D.sc < 1) {
        // speed lines under a dancer in flight
        const [hx] = head(D.P), y0 = D.P.by + 8 * D.sc;
        for (let j = -1; j <= 1; j++) dash(g, hx + j * 4 * D.sc, y0 + 2, hx + j * 4 * D.sc, y0 + 2 + 5 * D.trail, Wq.ink);
      }
    }
    // the pops: a leaving dancer bursts at its last spot, a new one drops out of it
    for (const D of Ds) {
      if (D.P) continue;
      const [px, py] = popAt(D.i);
      const t = D.gone >= 0 ? D.gone : 0.25 + D.pre;
      if (t > 0.35) continue;
      const u = t / 0.35;
      rays(g, px, py, 2 + u * 6, 4 + u * 7, 8, 0.2, ink);
    }
  },
};
