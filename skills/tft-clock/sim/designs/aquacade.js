// Aquacade: a 1930s Busby Berkeley water ballet filmed from the gantry
// above the pool. The time is the troupe: every numeral is a daisy chain of
// synchronised swimmers floating on their backs head to toe (scarlet caps,
// navy suits), held in the shape of a tall Deco numeral by a ring of their
// own white splash. Hours ride high on the left, minutes low on the right,
// as a diagonal formation; between them a little wheel of six girls spins
// as the colon.
//
// At rest the digits never stop: a slow wave rolls along every chain (each
// girl drifts and sways a fraction of a pixel in turn), a white crest runs
// down every chain at ~52 px/s (the splash swells under it, the girls it
// reaches throw their arms up and spray a few drops), and on every beat
// the whole troupe flutter-kicks at once: the splash round each numeral
// flares into a white bump at every pair of feet and throws a few drops,
// and on the off-beat every girl sweeps her arms out and back. Every 12 s
// the kaleidoscope: a ring of chorus girls under the water (seen through it,
// flat dark teal) flowers out from the colon wheel across the pool and
// folds back, and the caps turn gold as its front passes and scarlet again
// as it returns. Around them the world is calmer: the caustic nets crawl,
// two girls swim slow breaststroke laps under the water in the open
// corners (kicking on the beat), and a glint of sun runs along the coping.
//
// Minute turn: the changing numerals' chains let go, their splash falls
// back, and every girl swims (backstroke, arms windmilling, a wake at her
// feet) on her own curve to her place in the new numeral; girls left over
// dive under (a splash ring, a dark shape sinking), girls needed surface.
// The new chain's splash closes round it by :00.95. The hour: the grand
// finale. Three rings of chorus girls bloom under the water one after
// another and wheel against each other, the fountain under the colon throws
// a burst of spray on every beat, the pool lights come up, and the caps
// change colour in kaleidoscope sectors that rotate round the pool, until
// the rings fold away at :11.
//
// Palette (aquacade-pool.js): flat Technicolor. Three flat water tones for
// the caustic net, one under-water teal, splash white, scarlet and gold
// caps, skin, navy suits, cream tiles. No shading anywhere: the only depth
// is the flat dark teal of things under the surface. Hard pixels throughout
// (the girls are small; AA would only blur them).
//
// Cost: the water is two table lookups a pixel; the splash and moat are a
// lookup of two baked byte maps per digit against a per-frame arc table; the
// girls are kit shapes (about 9 per girl). No per-pixel callbacks.
// Flash: splash maps 45.6 KB, chain samples ~29 KB, caustic nets 8 KB.
// RAM: a few hundred bytes of scratch; nothing is redrawn off-canvas.

import { clockFields, hash, rand, sin, cos, clamp } from '../js/kit.js';
import { GLYPHS, ASSIGN, SW, SH, MARGIN, pointAt } from './aquacade-glyphs.js';
import { W, H, palette, water, coping } from './aquacade-pool.js';

const ORIG = [[6, 5], [37, 5], [95, 25], [126, 25]];   // digit boxes (28 x 50), top-left
const CX = 80, CY = 40;                                  // the colon wheel and the fountain
const TURN0 = 59.2, TURN_T = 1.75;                        // the swim: :59.2 .. :00.95
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const TAU = Math.PI * 2;

// ------------------------------------------------------------ scratch (RAM)

const RT = new Uint8Array(256);        // splash radius by arc, quarter px
const PT = new Float32Array(4);
const POSE = new Float32Array(12);     // H, S, M, Hp, F (x, y) + axis (x, y)
const POSE_B = new Float32Array(12);
const F_AT = [0.24, 0.45, 0.6, 0.74, 1.0];

/** The beat envelope: a sharp attack on the second, gone by 0.5 s. */
const kickOf = (b) => (b < 0.05 ? b / 0.05 : Math.max(0, 1 - (b - 0.05) / 0.45) ** 2);

// ------------------------------------------------------------ one girl at rest in her chain

function restPose(gl, k, ox, oy, T, out) {
  const w = gl.swim[k], st = gl.strokes[w.stroke], L = w.L;
  const ph = T * 3.4 - (st.off + w.s) * 0.165;
  const ds = 0.7 * sin(ph), lat = 0.45 * sin(ph + 1.4);
  let ax = 0, ay = 0;
  for (let j = 0; j < 5; j++) {
    pointAt(st, w.s + ds + F_AT[j] * L, PT, 0);
    const tl = Math.hypot(PT[2], PT[3]) || 1, tx = PT[2] / tl, ty = PT[3] / tl;
    out[2 * j] = ox + PT[0] - ty * lat;
    out[2 * j + 1] = oy + PT[1] + tx * lat;
    if (j === 2) { ax = tx; ay = ty; }
  }
  out[10] = ax; out[11] = ay;
  return st.off + ((st.closed ? (w.s + ds + L) % st.len : w.s + ds + L));
}

// ------------------------------------------------------------ drawing a girl

function drawGirl(g, P, p, cap, arm, rim, alpha) {
  const ax = P[10], ay = P[11], o = alpha < 1 ? { a: alpha } : undefined;
  if (rim) {
    const wc = p.white;
    g.thickLine(P[6], P[7], P[8], P[9], 4.2, wc, o);
    g.thickLine(P[2], P[3], P[6], P[7], 5.6, wc, o);
    g.fillCircle(P[0], P[1], 3.4, wc, o);
  }
  if (cap < 0) {   // under water: a flat dark shape
    g.thickLine(P[2], P[3], P[8], P[9], 3.2, p.deep, o);
    g.fillCircle(P[0], P[1], 2.3, p.deep, o);
    return;
  }
  g.thickLine(P[6], P[7], P[8], P[9], 2.0, p.skin, o);
  g.thickLine(P[2], P[3], P[4], P[5], 3.6, p.suit, o);
  g.thickLine(P[4], P[5], P[6], P[7], 3.4, p.suit, o);
  // arms from the shoulders: `arm` is the angle off the line to the feet
  const c = cos(arm), s = sin(arm), Ls = 3.3;
  const lx = ax * c - ay * s, ly = ax * s + ay * c, rx = ax * c + ay * s, ry = -ax * s + ay * c;
  g.thickLine(P[2], P[3], P[2] + lx * Ls, P[3] + ly * Ls, 1.2, p.skin, o);
  g.thickLine(P[2], P[3], P[2] + rx * Ls, P[3] + ry * Ls, 1.2, p.skin, o);
  g.fillCircle(P[0], P[1], 2.35, cap, o);
  g.fillCircle(P[0] + ax * 0.9, P[1] + ay * 0.9, 1.15, p.skin, o);
}

// ------------------------------------------------------------ the splash ring and moat

const CREST_V = 52;   // px/s down the chain: under a pixel a frame
/** Where the rolling crest is on a stroke (local arc, px). */
function crestAt(S, T) {
  if (S.closed) return (T * CREST_V + S.off * 7) % S.len;
  const per = S.len + 24;
  return ((T * CREST_V + S.off * 7) % per) - 12;
}
/** 0..1: how close local arc `a` is to the crest. */
function crestNear(S, a, T) {
  let d = Math.abs(a - crestAt(S, T));
  if (S.closed && d > S.len / 2) d = S.len - d;
  return d < 8 ? 1 - d / 8 : 0;
}

/** Fill RT for a glyph: base radius, flared at every pair of feet on the beat. */
function splashTable(gl, phi, kick, feet, nf, T) {
  const r0 = (12 + kick * 2) * phi;
  RT.fill(Math.round(r0), 0, gl.total + 1);
  if (phi <= 0) return;
  // the crest rolling down every chain: a white swell 2.5 px high
  for (let si = 0; si < gl.strokes.length; si++) {
    const S = gl.strokes[si], Ln = Math.ceil(S.len), c = crestAt(S, T);
    for (let a = 0; a <= Ln; a++) {
      let d = Math.abs(a - c);
      if (S.closed && d > Ln / 2) d = Ln - d;
      if (d < 7) RT[S.off + a] = Math.min(255, RT[S.off + a] + Math.round(10 * phi * (1 - d / 7)));
    }
  }
  const amp = 9 * kick * phi;
  for (let q = 0; q < nf; q++) {
    const sf = feet[q], st = feet[q + 32];   // global arc, stroke index
    const S = gl.strokes[st];
    for (let d = -4; d <= 4; d++) {
      let a = Math.round(sf) + d;
      if (S.closed) { a -= S.off; a = ((a % Math.ceil(S.len)) + Math.ceil(S.len)) % Math.ceil(S.len); a += S.off; }
      if (a < S.off || a > S.off + Math.ceil(S.len)) continue;
      const v = RT[a] + amp * Math.max(0, 1 - Math.abs(a - sf) / 4);
      RT[a] = Math.min(255, Math.round(v));
    }
  }
}

function moatPass(g, gl, ox, oy, phi, cWater) {
  const D = gl.dist, A = gl.arc, buf = g.buf, mo = Math.round(9 * phi);
  let n = 0;
  for (let y = 0; y < SH; y++) {
    const gy = oy + y;
    if (gy < 0 || gy >= H) continue;
    for (let x = 0; x < SW; x++) {
      const gx = ox + x;
      if (gx < 0 || gx >= W) continue;
      const i = y * SW + x, d = D[i];
      if (d !== 255 && d <= RT[A[i]] + mo) { buf[gy * W + gx] = cWater; n++; }
    }
  }
  g.cost.box += SW * SH * 3; g.cost.px += n;
}

function haloPass(g, gl, ox, oy, cWhite) {
  const D = gl.dist, A = gl.arc, buf = g.buf;
  let n = 0;
  for (let y = 0; y < SH; y++) {
    const gy = oy + y;
    if (gy < 0 || gy >= H) continue;
    for (let x = 0; x < SW; x++) {
      const gx = ox + x;
      if (gx < 0 || gx >= W) continue;
      const i = y * SW + x;
      if (D[i] <= RT[A[i]]) { buf[gy * W + gx] = cWhite; n++; }
    }
  }
  g.cost.box += SW * SH * 3; g.cost.px += n;
}

// ------------------------------------------------------------ the chorus under the water

function chorusRing(g, n, R, len, rot, p, armOpen) {
  if (R < 1) return;
  const L = Math.min(len, R * 1.1);
  for (let k = 0; k < n; k++) {
    const a = rot + (k * TAU) / n, c = cos(a), s = sin(a);
    const hx = CX + c * R, hy = CY + s * R;
    if (hx < -6 || hx > W + 6 || hy < -6 || hy > H + 6) continue;
    const fx = CX + c * (R - L), fy = CY + s * (R - L);
    const sx = CX + c * (R - 2.6), sy = CY + s * (R - 2.6);
    g.thickLine(fx, fy, sx, sy, 3.2, p.deep);
    g.fillCircle(hx, hy, 2.5, p.deep);
    // arms out in a V: the petals of the flower
    const ao = 0.5 + armOpen;
    for (const sg of [-1, 1]) {
      const b = a + sg * ao;
      g.thickLine(sx, sy, sx + cos(b) * 5, sy + sin(b) * 5, 1.6, p.deep);
    }
  }
}

/** A girl swimming breaststroke under the water on an elliptical lap; kicks on the beat. */
function underGirl(g, p, cx, cy, rx, ry, ph, b) {
  const a = ph * TAU, dir = ph >= 0 ? 1 : -1;
  const hx = cx + rx * cos(a), hy = cy + ry * sin(a);
  let tx = -rx * sin(a) * dir, ty = ry * cos(a) * dir;
  const tl = Math.hypot(tx, ty) || 1;
  tx /= tl; ty /= tl;
  const c = p.deep, nx = -ty, ny = tx;
  const sx = hx - tx * 2.4, sy = hy - ty * 2.4, px = hx - tx * 7.5, py = hy - ty * 7.5;
  g.thickLine(sx, sy, px, py, 3.2, c);
  g.fillCircle(hx, hy, 2.3, c);
  // frog kick: legs snap together on the beat and open again; arms sweep
  const k = b < 0.25 ? b / 0.25 : 1 - (b - 0.25) / 0.75, open = 1.6 + 2.6 * (1 - k);
  for (const sg of [-1, 1]) {
    g.thickLine(px, py, px - tx * 4.5 + nx * sg * open, py - ty * 4.5 + ny * sg * open, 1.6, c);
    const ar = 1.2 + 2.8 * k;
    g.thickLine(sx, sy, sx + tx * (4 - k * 2) + nx * sg * ar, sy + ty * (4 - k * 2) + ny * sg * ar, 1.4, c);
  }
}

/** A glint of sun running along the top coping every 8 s. */
function glint(g, p, T) {
  const u = (T % 8) / 2.2;
  if (u >= 1) return;
  const x = Math.round(-10 + u * 180);
  g.fillRect(x, 0, 5, 2, p.white);
  g.fillRect(x + 5, 0, 3, 1, p.white);
}

// ------------------------------------------------------------ the frame

const FEET = new Float32Array(64);

export default {
  name: 'Aquacade',
  blurb: 'A Busby Berkeley water ballet seen from above: each numeral is a chain of synchronised swimmers who kick on the beat, flower into a kaleidoscope, and swim into the new digits each minute.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey;
    const T = (ctx.date.getTime() % 86400000) / 1000;
    const night = ctx.night;
    ctx.lcd.backlight(1 - 0.55 * night);
    const p = palette(night);
    const b = s - Math.floor(s), kick = kickOf(b);
    const prv = clockFields(new Date(ctx.date.getTime() - 60000)), nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm, old = prv.hh + prv.mm, nw = nxt.hh + nxt.mm;
    const hourShow = prv.h !== f.h && s < 12;

    // ---- the kaleidoscope's front: a ring blooming out from the colon and back
    let ringR = -1, ringRot = T * 0.35;
    const fl = (s + 6) % 12;   // flourishes start at :06, :18, :30, :42, :54
    if (!hourShow && s >= 5.9 && s < 58 && fl < 3.4) {
      const q = fl / 3.4;
      ringR = q < 0.45 ? 40 * sm(q / 0.45) : q < 0.6 ? 40 : 40 * (1 - sm((q - 0.6) / 0.4));
    }
    // the hour: three rings bloom one after another, wheel, and fold away
    const rings = [];
    let glow = 0;
    if (hourShow) {
      const close = sm((s - 9.2) / 1.6);
      const spec = [[10, 17, 9, 1.0], [16, 35, 12, -0.6], [24, 56, 14, 0.4]];
      spec.forEach(([n, Rt, len, w], j) => {
        const R = Rt * sm((s - 1.0 - 0.7 * j) / 1.3) * (1 - close);
        rings.push([n, R, len, T * w + j * 0.3]);
      });
      glow = sm((s - 1.2) / 1.5) * (1 - close);
      ringR = rings[2][1];
    }

    // ---- the water and what is under it
    water(g, T, p, sin, glow);
    if (ringR > 0 && !hourShow) {
      chorusRing(g, 16, ringR, 13, ringRot, p, 0.25 + 0.25 * kick);
      chorusRing(g, 8, ringR * 0.5, 9, -ringRot * 1.6, p, 0.25 + 0.25 * kick);
    }
    for (const [n, R, len, rot] of rings) chorusRing(g, n, R, len, rot, p, 0.3 * kick);
    // two girls doing slow breaststroke laps under the water, in the open corners
    underGirl(g, p, 128, 12.5, 27, 5.5, T / 9.5, b);
    underGirl(g, p, 33, 68.5, 27, 5, -T / 10.5 + 0.4, b);
    if (hourShow && s > 1.8 && s < 10) {
      // the fountain throws spray on every beat
      const age = b;
      if (age < 0.9) {
        const r = 6 + age * 46, n = 20, wc = p.white;
        for (let k = 0; k < n; k++) {
          const a = (k * TAU) / n + Math.floor(s) * 0.4 + (hash(k, Math.floor(s)) % 100) * 0.003;
          const rr = r * (0.8 + (hash(k, 7, Math.floor(s)) % 40) / 100);
          if (age > 0.6 && (k & 1)) continue;
          g.fillRect(Math.round(CX + cos(a) * rr * 1.25), Math.round(CY + sin(a) * rr), 2, 2, wc);
        }
      }
    }

    // ---- the four chains: what each slot shows and whether it is swimming
    const slots = [];
    for (let i = 0; i < 4; i++) {
      let a = +cur[i], bb = a, tau = -1;
      if (s >= TURN0 && cur[i] !== nw[i]) { bb = +nw[i]; tau = s - TURN0; }
      else if (s < TURN_T - (60 - TURN0) && old[i] !== cur[i]) { a = +old[i]; tau = s + (60 - TURN0); }
      slots.push({ a, b: bb, tau });
    }

    // ---- splash and moat: every moat first, then every splash (so one digit's moat never cuts another's splash)
    const jobs = [];
    for (let i = 0; i < 4; i++) {
      const { a, b: bd, tau } = slots[i], ox = ORIG[i][0] - MARGIN, oy = ORIG[i][1] - MARGIN;
      if (tau < 0) jobs.push([GLYPHS[a], 1, ox, oy]);
      else {
        const po = 1 - sm(tau / 0.3), pn = sm((tau - 1.35) / 0.35);
        if (po > 0) jobs.push([GLYPHS[a], po, ox, oy]);
        if (pn > 0) jobs.push([GLYPHS[bd], pn, ox, oy]);
      }
    }
    const tabs = jobs.map(([gl, phi, ox, oy]) => {
      let nf = 0;
      for (let k = 0; k < gl.swim.length; k++) {
        FEET[nf] = restPose(gl, k, ox + MARGIN, oy + MARGIN, T, POSE) - 0; FEET[nf + 32] = gl.swim[k].stroke; nf++;
      }
      splashTable(gl, phi, kick, FEET, nf, T);
      return RT.slice(0, gl.total + 1);
    });
    const wc565 = toC(p.water), wh565 = toC(p.white);
    jobs.forEach(([gl, phi, ox, oy], j) => { RT.set(tabs[j]); moatPass(g, gl, ox, oy, phi, wc565); });
    jobs.forEach(([gl, , ox, oy], j) => { RT.set(tabs[j]); haloPass(g, gl, ox, oy, wh565); });

    // ---- the girls
    const armRest = 2.75;                                   // ~157 deg: hands at the hips
    const sweep = b >= 0.5 ? Math.sin(Math.PI * (b - 0.5) / 0.5) : 0;
    const armAt = armRest - 1.15 * sweep;
    const front = (x, y) => (ringR > 0 ? Math.hypot((x - CX) / 1.0, y - CY) < ringR : false);
    const capOf = (x, y) => {
      if (hourShow && glow > 0.05) {
        const a = Math.atan2(y - CY, x - CX) - T * 1.1;
        const k = Math.floor(((a / TAU) % 1 + 1) % 1 * 6);
        return k & 1 ? p.gold : p.cap;
      }
      return front(x, y) ? p.gold : p.cap;
    };

    for (let i = 0; i < 4; i++) {
      const { a, b: bd, tau } = slots[i], ox = ORIG[i][0], oy = ORIG[i][1];
      const gA = GLYPHS[a];
      if (tau < 0) {
        for (let k = 0; k < gA.swim.length; k++) {
          restPose(gA, k, ox, oy, T, POSE);
          const w = gA.swim[k], S = gA.strokes[w.stroke], cr = crestNear(S, w.s + w.L * 0.45, T);
          drawGirl(g, POSE, p, capOf(POSE[0], POSE[1]), armAt - (1.25 - 1.15 * sweep) * cr * (armAt > 2 ? 1 : 0.3), false, 1);
          if (cr > 0.75) spray(g, POSE, p.white, T, k);
        }
        continue;
      }
      // swimming from glyph a to glyph bd
      const gB = GLYPHS[bd], asg = ASSIGN[a][bd], seed = mk * 7 + i;
      const phiA = 1 - sm(tau / 0.3), phiB = sm((tau - 1.35) / 0.35);
      for (let k = 0; k < gA.swim.length; k++) {
        const j = asg.pair[k];
        const u = clamp((tau - 0.1 - rand(seed, k, 1) * 0.12) / 1.45, 0, 1);
        restPose(gA, k, ox, oy, T, POSE);
        if (j >= 0) {
          restPose(gB, j, ox, oy, T, POSE_B);
          swimGirl(g, POSE, POSE_B, u, rand(seed, k, 2), T + k, p, capOf, phiA, phiB, 1);
        } else {
          // she dives: a short swim out, a splash ring, a dark shape sinking
          const dx = POSE[4] - (ox + 14), dy = POSE[5] - (oy + 25), dl = Math.hypot(dx, dy) || 1;
          for (let q = 0; q < 12; q++) POSE_B[q] = POSE[q];
          for (let q = 0; q < 10; q += 2) { POSE_B[q] += (dx / dl) * 6; POSE_B[q + 1] += (dy / dl) * 6; }
          const uu = Math.min(1, u * 1.6);
          diveGirl(g, POSE, POSE_B, uu, rand(seed, k, 2), T + k, p, capOf, phiA, true);
        }
      }
      for (const j of asg.born) {
        const u = clamp((tau - 0.1 - rand(seed, j, 3) * 0.12) / 1.45, 0, 1);
        restPose(gB, j, ox, oy, T, POSE_B);
        const dx = POSE_B[4] - (ox + 14), dy = POSE_B[5] - (oy + 25), dl = Math.hypot(dx, dy) || 1;
        for (let q = 0; q < 12; q++) POSE[q] = POSE_B[q];
        for (let q = 0; q < 10; q += 2) { POSE[q] += (dx / dl) * 6; POSE[q + 1] += (dy / dl) * 6; }
        const uu = Math.max(0, (u - 0.375) / 0.625);
        diveGirl(g, POSE_B, POSE, 1 - uu, rand(seed, j, 4), T + j, p, capOf, phiB, uu > 0);
      }
    }

    // ---- the colon: a wheel of six girls, feet to the middle
    colonWheel(g, p, T, kick, hourShow, capOf);

    coping(g, p);
    glint(g, p, T);
  },
};

/** A few drops thrown out sideways at the crest. */
function spray(g, P, wc, T, k) {
  const ax = P[10], ay = P[11], fr = Math.floor(T * 15) + k;
  for (let q = 0; q < 2; q++) {
    const sg = q ? 1 : -1, r = 4.6 + ((fr + q) % 3) * 0.8;
    g.fillRect(Math.round(P[2] - ay * sg * r), Math.round(P[3] + ax * sg * r), 1, 1, wc);
  }
}

const toC = (c) => ((((c >> 16) & 255) >> 3) << 11) | ((((c >> 8) & 255) >> 2) << 5) | ((c & 255) >> 3);

// ------------------------------------------------------------ swimming between formations

const PS = new Float32Array(12);
const easeSwim = (u) => u * u * u * (u * (u * 6 - 15) + 10);

function swimGirl(g, A, B, u, r, ph, p, capOf, phiA, phiB, alpha) {
  if (u <= 0) { drawGirl(g, A, p, capOf(A[0], A[1]), 2.75, phiA < 0.95, alpha); return; }
  if (u >= 1) { drawGirl(g, B, p, capOf(B[0], B[1]), 2.75, phiB < 0.95, alpha); return; }
  const e = easeSwim(u);
  const ax = A[4], ay = A[5], bx = B[4], by = B[5];
  let dx = bx - ax, dy = by - ay, dl = Math.hypot(dx, dy);
  let nx, ny;
  if (dl < 1) { nx = cos(r * TAU); ny = sin(r * TAU); } else { nx = -dy / dl; ny = dx / dl; }
  const side = r < 0.5 ? -1 : 1, kk = side * (6 + 8 * ((r * 2) % 1));
  const qx = (ax + bx) / 2 + nx * kk, qy = (ay + by) / 2 + ny * kk;
  const m = 1 - e;
  const cx = m * m * ax + 2 * m * e * qx + e * e * bx, cy = m * m * ay + 2 * m * e * qy + e * e * by;
  let tx = 2 * m * (qx - ax) + 2 * e * (bx - qx), ty = 2 * m * (qy - ay) + 2 * e * (by - qy);
  const tl = Math.hypot(tx, ty) || 1;
  tx /= tl; ty /= tl;
  // she swims head first: the axis (head to feet) points back along her path
  const axx = -tx, axy = -ty;
  const src = e < 0.5 ? A : B, scx = src[4], scy = src[5];
  const w = sm(e / 0.22) * sm((1 - e) / 0.22);
  const th = Math.atan2(axy, axx), ts = Math.atan2(src[11], src[10]);
  let dth = th - ts;
  while (dth > Math.PI) dth -= TAU;
  while (dth < -Math.PI) dth += TAU;
  const c = cos(dth * w), s = sin(dth * w);
  const L = 10;
  for (let j = 0; j < 5; j++) {
    const rx = src[2 * j] - scx, ry = src[2 * j + 1] - scy;
    const qx2 = rx * c - ry * s, qy2 = rx * s + ry * c;
    const sx = axx * (F_AT[j] - 0.6) * L, sy = axy * (F_AT[j] - 0.6) * L;
    PS[2 * j] = cx + qx2 + (sx - qx2) * w;
    PS[2 * j + 1] = cy + qy2 + (sy - qy2) * w;
  }
  const ac = cos(dth * w), as = sin(dth * w);
  PS[10] = src[10] * ac - src[11] * as; PS[11] = src[10] * as + src[11] * ac;
  PS[10] += (axx - PS[10]) * w; PS[11] += (axy - PS[11]) * w;
  // backstroke: the arms windmill while she swims
  const arm = 2.75 - w * (1.2 + 1.1 * sin(ph * 9.0));
  drawGirl(g, PS, p, capOf(PS[0], PS[1]), arm, true, alpha);
  // the wake at her feet
  if (w > 0.3) {
    const wc = p.white;
    for (let q = 1; q <= 3; q++) {
      const jig = (Math.floor(ph * 20 + q) & 1) ? 1 : -1;
      g.fillRect(Math.round(PS[8] + axx * q * 1.6 - axy * jig), Math.round(PS[9] + axy * q * 1.6 + axx * jig), 1, 1, wc);
    }
  }
}

/** A girl leaving (dive) or arriving (surface) through the surface: u 0 = on top, 1 = gone under. */
function diveGirl(g, A, B, u, r, ph, p, capOf, phi, active) {
  if (!active) return;
  if (u < 0.45) { swimGirl(g, A, B, u / 0.45, r, ph, p, capOf, phi, 1, 1); return; }
  // under water: a flat dark shape where she went down, fading
  const k = (u - 0.45) / 0.55;
  if (k < 0.85) drawGirl(g, B, p, -1, 0, false, 1 - k / 0.85);
  // the splash ring where she broke the surface
  if (k < 0.6) {
    const rr = 2.5 + k * 9;
    g.ring(B[4], B[5], rr - 0.8, rr + 0.4, p.white, { a: 1 - k / 0.6 });
  }
}

// ------------------------------------------------------------ the colon wheel

function colonWheel(g, p, T, kick, hourShow, capOf) {
  const rot = T * (hourShow ? 1.6 : 0.7);
  g.fillCircle(CX, CY, 8.7 + kick * 0.9, p.white);
  const n = 6, P = POSE;
  for (let k = 0; k < n; k++) {
    const a = rot + (k * TAU) / n, c = cos(a), s = sin(a);
    const rh = 5.7 + kick * 0.5;
    P[0] = CX + c * rh; P[1] = CY + s * rh;           // head
    P[2] = CX + c * (rh - 2.0); P[3] = CY + s * (rh - 2.0);
    P[4] = CX + c * (rh - 3.0); P[5] = CY + s * (rh - 3.0);
    P[6] = CX + c * (rh - 4.0); P[7] = CY + s * (rh - 4.0);
    P[8] = CX + c * 0.6; P[9] = CY + s * 0.6;
    P[10] = -c; P[11] = -s;
    drawGirl(g, P, p, capOf(P[0], P[1]), 2.9, false, 1);
  }
}

