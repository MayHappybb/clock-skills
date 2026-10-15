// Microcity: a 384 mm living city map, seen from a plane, whose avenues ARE
// the time. Each numeral is a boulevard (ring roads for bowls, radiused
// bends, cul-de-sac bulbs, a T-junction for the 1) cut through a 12 px
// street grid of rooftops, parks, a river with bridges, a harbour and a
// stadium. Traffic runs on the avenues (white headlights one way, red tail
// lights the other, queues at signals), so the digits are always moving.
// The day follows the real clock: shadows swing with the sun, at dusk the
// windows come on block by block and the avenues light up as rivers of
// sodium (hours, old town) and LED white (minutes, new town).
// Minute turn: the changed digit's avenue is coned off, its lamps die, the
// road crumbles back into blocks, then trucks pave the new numeral chunk by
// chunk and the cars flood in behind them. Hour: fireworks over the whole
// city from the stadium and chase-light bunting along every avenue.
import * as kit from '../js/kit.js';
import { buildGlyph, along, RB_R } from './microcity-glyphs.js';
import * as C from './microcity-city.js';
import { drawExtras } from './microcity-life.js';
import { img, addPt, overPt } from './microcity-px.js';

const { GW, GH, N } = C;
const dayAlb = new Float32Array(3 * N);
let dayMin = -1;
const SLOTS = [{ x: 6, y: 6 }, { x: 66, y: 6 }, { x: 76, y: 112 }, { x: 136, y: 112 }], SW = 52, SH = 74;
// every digit in every slot, built once at load (about 80 ms) so no frame ever waits for one
for (const S of SLOTS) for (let d = 0; d < 10; d++) buildGlyph(String(d), S.x, S.y, SW, SH, GW, GH);

// palette (linear)
const SODIUM = kit.blackbody(2000), LED = kit.mix(kit.blackbody(6500), [0.45, 0.8, 1], 0.4);
const ROAD_DAY = kit.hex('#d4d0c6'), KERB = kit.hex('#e8e4da'), DASH = kit.hex('#fafaf4'), GRASS = kit.scale(kit.hex('#5f9a48'), 0.35), TREE = kit.scale(kit.hex('#5aa040'), 0.9);
const CONE = kit.hex('#ff6a00'), TRUCK = kit.hex('#ffc400'), AMBER = kit.hex('#ff9a10');
const HEAD = [1, 0.9, 0.75], TAIL = [1, 0.05, 0.015];
const BODY = ['#18181c', '#8a1410', '#14306e', '#f0b000', '#26262a', '#0c5a4c', '#18181c', '#c02818'].map((s) => kit.hex(s));
const FEST = [kit.hex('#ffb000'), kit.hex('#ff2850'), kit.hex('#fff2d0')];

const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => pad(d.getHours()) + pad(d.getMinutes());


const sstep = (a, b, x) => { const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return t * t * (3 - 2 * t); };
const smin = (a, b, k) => { const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k)); return b + (a - b) * h - k * h * (1 - h); };
const smax = (a, b, k) => -smin(-a, -b, k);

// ---------------------------------------------------------------- traffic
const V = 8, HW = 1.15, G = 2.4, HD = 0.28, SIG_T = 17, SIG_R = 7;
const tmp = [0, 0, 0, 0];

/** Position of car j on an open lane with a signal at S; [pos, braking]. */
function carPos(j, lid, t, S, phase, out) {
  const Ej = j * HW_T + HW_T * 0.4 * kit.hash(j, lid, 3);
  const u = V * (t - Ej);
  const tau = Ej + S / V;
  const k = Math.floor((tau - phase) / SIG_T), t0 = phase + k * SIG_T, t1 = t0 + SIG_R;
  let i = Math.ceil((t0 - S / V) / HW_T - 0.45);
  while (i * HW_T + HW_T * 0.4 * kit.hash(i, lid, 3) + S / V < t0) i++;
  const n = Math.max(0, j - i);
  const Cq = t1 + n * (HD + G / V), Cx = Math.max(tau, Cq);
  const pos = smin(u, smax(S - G * n - 0.5, S - V * (Cx - t), 1.2), 1.4);
  out[0] = pos; out[1] = u - pos > 0.6 && pos < S + 0.5 ? 1 : 0;
  return out;
}
const HW_T = 0.72;   // seconds between cars entering a lane

let amb = 0, festK = 0;
function drawCar(x, y, dx, dy, fwd, brake, bodyIdx, a, dayK, nightK) {
  if (a <= 0.01) return;
  const bc = BODY[bodyIdx];
  // body by day: painted over the road, two points along the heading
  if (dayK > 0.02) {
    const bus = bodyIdx === 3 && (brake & 2), k = amb * (bus ? 1.6 : 1.0), len = bus ? 4.5 : 1.8;
    // on the hour the traffic becomes a parade of floats in the festival colours
    const fc = FEST[bodyIdx % 3], fk = amb * 2.2 * festK, ck = 1 - festK;
    const r = bc[0] * k * ck + fc[0] * fk, g = bc[1] * k * ck + fc[1] * fk, b = bc[2] * k * ck + fc[2] * fk;
    for (let m = 0; m <= len + 0.01; m += 0.9) overPt(x - dx * m, y - dy * m, r, g, b, dayK * a * (m === 0 ? 1 : 0.9));
  }
  if (nightK <= 0) return;
  const nk = nightK * a;
  if (fwd) {
    addPt(x, y, HEAD[0] * nk, HEAD[1] * nk, HEAD[2] * nk);
    addPt(x + dx * 0.9, y + dy * 0.9, HEAD[0] * 0.45 * nk, HEAD[1] * 0.45 * nk, HEAD[2] * 0.4 * nk);
    addPt(x + dx * 1.9, y + dy * 1.9, HEAD[0] * 0.15 * nk, HEAD[1] * 0.15 * nk, HEAD[2] * 0.12 * nk);
    addPt(x - dx, y - dy, 0.3 * nk, 0.02 * nk, 0.01 * nk);
  } else {
    const k = (brake & 1 ? 1.6 : 0.9) * nk;
    addPt(x - dx * 0.5, y - dy * 0.5, TAIL[0] * k, TAIL[1] * k, TAIL[2] * k);
    addPt(x - dx * 1.4, y - dy * 1.4, TAIL[0] * k * 0.4, TAIL[1] * k * 0.4, TAIL[2] * k * 0.4);
    addPt(x + dx * 0.5, y + dy * 0.5, 0.2 * nk, 0.17 * nk, 0.13 * nk);
  }
}

/** Cars on one glyph. vis(k, s) gives 0..1 visibility by stroke and arc length. */
function drawTraffic(g, slot, t, vis, dayK, nightK) {
  const ra = vis(0, 0);
  if (ra > 0) for (let n = 0; n < g.nodes.length; n++) {
    const [nx, ny] = g.nodes[n], r = RB_R - 1.3;
    for (let c = 0; c < 3; c++) {   // anticlockwise on screen (drive on the right)
      const a = -t * 1.6 + c * kit.TAU / 3 + n, ca = Math.cos(a), sa = Math.sin(a);
      drawCar(nx + r * ca, ny + r * sa, sa, -ca, c % 2 === 0, 0, (c * 3 + n) % BODY.length, ra, dayK, nightK);
    }
  }
  for (let k = 0; k < g.strokes.length; k++) {
    const st = g.strokes[k], L = st.L;
    for (const fwd of [true, false]) {
      const lid = slot * 16 + k * 2 + (fwd ? 0 : 1) + g.ch.charCodeAt(0) * 64;
      const side = fwd ? HW : -HW, sgn = fwd ? 1 : -1;
      if (st.closed) {
        const n = Math.max(3, Math.floor(L / (V * HW_T)));
        for (let j = 0; j < n; j++) {
          const s = sgn * ((j * L) / n + 3 * kit.hash(j, lid) + V * t * 0.9);
          const sm = ((s % L) + L) % L, a = vis(k, sm);
          if (a <= 0) continue;
          along(st, sm, tmp);
          const dx = tmp[2] * sgn, dy = tmp[3] * sgn;
          drawCar(tmp[0] - tmp[3] * side, tmp[1] + tmp[2] * side, dx, dy, fwd, 0, Math.floor(kit.hash(j, lid, 5) * BODY.length), a, dayK, nightK);
        }
      } else {
        const S = Math.max(4, L * 0.5 + (fwd ? -2.5 : -2.5)), ph = SIG_T * kit.hash(slot, k, 77);
        const j0 = Math.floor((t - (L + 20) / V - 18) / HW_T), j1 = Math.floor(t / HW_T) + 1;
        const o = [0, 0];
        for (let j = j0; j <= j1; j++) {
          carPos(j, lid, t, S, ph, o);
          const pos = o[0];
          if (pos < -0.5 || pos > L + 0.5) continue;
          const s = fwd ? pos : L - pos;
          let a = vis(k, s) * Math.min(1, (pos + 0.5) / 3, (L + 0.5 - pos) / 3);
          if (a <= 0) continue;
          along(st, s, tmp);
          const dx = tmp[2] * sgn, dy = tmp[3] * sgn;
          drawCar(tmp[0] - tmp[3] * side, tmp[1] + tmp[2] * side, dx, dy, fwd, o[1] | (kit.hash(j, lid, 8) < 0.35 ? 2 : 0), Math.floor(kit.hash(j, lid, 5) * BODY.length), a, dayK, nightK);
        }
      }
    }
  }
}

// ---------------------------------------------------------------- roads
// Roadworks timeline (seconds into the minute) for a changed digit.
const OLD_OFF = 0.4, OLD_GONE = 0.9, PAVE0 = 0.72, PAVE_DUR = 1.3, CHUNK = 40;

function chunkFront(g, k, s, age) {
  const L = g.strokes[k].L, nC = Math.max(1, Math.ceil(L / CHUNK)), cl = L / nC;
  const c = Math.min(nC - 1, Math.floor(s / cl));
  const st = PAVE0 + 0.25 * kit.hash(c, k, g.ch.charCodeAt(0));
  const p = kit.clamp((age - st) / PAVE_DUR);
  return [c * cl, c * cl + cl * (1 - (1 - p) ** 2.4), p];
}

/**
 * Paint a glyph's corridor over the city: verge (trees / dark moat), road
 * surface, lamps. mode 0 steady, 1 old (closing), 2 new (paving).
 */
function paintRoad(g, slot, mode, age, env) {
  const { dayK, amb, sun, lampK, fest, tt } = env;
  const LAMP = slot < 2 ? SODIUM : LED;
  const n = g.pix.length;
  const lampOff = mode === 1 ? 1 - sstep(0.05, OLD_OFF, age) : 1;
  for (let j = 0; j < n; j++) {
    const p = g.pix[j], d = g.d[j], s = g.s[j], k = g.k[j];
    let b = 1, lampOn = lampOff, fresh = 0;
    if (mode === 1) {
      const crumb = kit.hash(Math.floor(s / 3), k, 91);
      b = 1 - kit.clamp((age - OLD_OFF - 0.3 * crumb) / 0.18);
      if (b <= 0) continue;
      if (age < OLD_OFF && kit.hash(Math.floor(age * 24), k, Math.floor(s / 6)) < 0.35 * age / OLD_OFF) lampOn *= 0.2;
    } else if (mode === 2) {
      const [a0, f] = chunkFront(g, k, s, age);
      b = kit.clamp((f - s) / 1.2 + 0.5);
      if (b <= 0 || s < a0 - 0.01) { if (b <= 0) continue; }
      lampOn = kit.clamp((f - s) / 3);
      fresh = kit.clamp(1 - (f - s) / 5) * (f > a0 + 0.1 ? 1 : 0);
    }
    const aClear = (1 - sstep(4.1, 5.3, d)) * b, aRoad = (1 - sstep(1.9, 2.9, d)) * b;
    if (aClear <= 0) continue;
    const q = 3 * p;
    // verge: grass and a tree every 4 px by day, a dark moat at night
    const tree = d > 2.9 && (((s + 1) % 4.6) < 2.4) ? 1 - Math.abs(d - 3.9) / 1.1 : 0;
    const vg = amb * (0.35 + 0.65 * kit.clamp(tree));
    let vr = (tree > 0 ? TREE[0] : GRASS[0]) * vg * sun[0], vgc = (tree > 0 ? TREE[1] : GRASS[1]) * vg * sun[1], vb = (tree > 0 ? TREE[2] : GRASS[2]) * vg * sun[2];
    // lamp heads along both kerbs, every 5 px
    const ls = ((s % 5) + 5) % 5 - 2.5, ld = d - 3.25;
    let lampHead = Math.exp(-(ls * ls + ld * ld * 2.2) / 0.55);
    let lr = LAMP[0], lgc = LAMP[1], lb = LAMP[2];
    if (fest > 0) {
      const fc = FEST[(Math.floor(s / 5) + Math.floor(tt * 6) + k) % 3];
      lr += (fc[0] - lr) * fest; lgc += (fc[1] - lgc) * fest; lb += (fc[2] - lb) * fest;
    }
    const lk = lampK * lampOn, hk = (lampK + fest * 0.8) * lampOn;
    vr += lr * lampHead * 0.9 * hk; vgc += lgc * lampHead * 0.9 * hk; vb += lb * lampHead * 0.9 * hk;
    img[q] += (vr - img[q]) * aClear; img[q + 1] += (vgc - img[q + 1]) * aClear; img[q + 2] += (vb - img[q + 2]) * aClear;
    if (aRoad <= 0) continue;
    // road: pale concrete by day, a pool of lamp light by night
    // asphalt by day with a dashed centre line and pale kerbs
    const dash = d < 0.6 && ((s % 4) < 2) ? 0.6 : 0, kerb = sstep(1.7, 2.5, d);
    const RD = d > 2.0 ? KERB : ROAD_DAY;
    const dr = (RD[0] + (DASH[0] - RD[0]) * dash) * amb, dg = (RD[1] + (DASH[1] - RD[1]) * dash) * amb, db = (RD[2] + (DASH[2] - RD[2]) * dash) * amb;
    const pool = (0.17 + 0.06 * Math.cos((s / 5) * kit.TAU) + 0.05 * (1 - d / 2.9)) * (1 - 0.5 * kerb);
    let rr = dr * sun[0] + lr * pool * lk;
    let rg = dg * sun[1] + lgc * pool * lk;
    let rb = db * sun[2] + lb * pool * lk;
    if (fresh > 0) {  // hot fresh asphalt under the work lights
      const w = fresh * 0.6;
      rr = rr * (1 - w) + AMBER[0] * 0.22 * w; rg = rg * (1 - w) + AMBER[1] * 0.22 * w; rb = rb * (1 - w) + AMBER[2] * 0.22 * w;
    }
    img[q] += (rr - img[q]) * aRoad; img[q + 1] += (rg - img[q + 1]) * aRoad; img[q + 2] += (rb - img[q + 2]) * aRoad;
    const il = g.isl[j] * b;
    if (il > 0) {   // the roundabout's island: a lawn by day, one lamp at night
      const ir = TREE[0] * amb * 0.8 * sun[0] + lr * 0.5 * lk, ig = TREE[1] * amb * 0.8 * sun[1] + lgc * 0.5 * lk, ib = TREE[2] * amb * 0.8 * sun[2] + lb * 0.5 * lk;
      img[q] += (ir - img[q]) * il; img[q + 1] += (ig - img[q + 1]) * il; img[q + 2] += (ib - img[q + 2]) * il;
    }
  }
}

/** Cones on a closing road, trucks on a paving one. */
function drawWorks(g, mode, age, nightK) {
  for (let k = 0; k < g.strokes.length; k++) {
    const st = g.strokes[k], L = st.L;
    if (mode === 1) {
      for (let s = 1.5; s < L; s += 4) {
        const appear = sstep(0.0, 0.12, age - 0.25 * (s / L));
        const crumb = kit.hash(Math.floor(s / 3), k, 91);
        const gone = 1 - kit.clamp((age - OLD_OFF - 0.3 * crumb) / 0.18);
        const a = appear * gone;
        if (a <= 0) continue;
        along(st, s, tmp);
        const blink = 0.55 + 0.45 * (Math.sin(age * 18 + s) > 0 ? 1 : 0) * nightK;
        const v = 0.9 * a * blink;
        addPt(tmp[0], tmp[1], CONE[0] * v, CONE[1] * v, CONE[2] * v);
        addPt(tmp[0] - tmp[3] * 1.6, tmp[1] + tmp[2] * 1.6, CONE[0] * v * 0.6, CONE[1] * v * 0.6, CONE[2] * v * 0.6);
        addPt(tmp[0] + tmp[3] * 1.6, tmp[1] - tmp[2] * 1.6, CONE[0] * v * 0.6, CONE[1] * v * 0.6, CONE[2] * v * 0.6);
      }
    } else if (mode === 2) {
      const nC = Math.max(1, Math.ceil(L / CHUNK)), cl = L / nC;
      for (let c = 0; c < nC; c++) {
        const [, f, p] = chunkFront(g, k, c * cl + 0.01, age);
        if (p <= 0 || p >= 1) continue;
        const env = Math.min(1, p * 8, (1 - p) * 8);
        along(st, f, tmp);
        const x = tmp[0], y = tmp[1], dx = tmp[2], dy = tmp[3];
        for (let m = 0; m < 3; m++) { const v = 0.8 * env; addPt(x - dx * m * 0.8, y - dy * m * 0.8, TRUCK[0] * v, TRUCK[1] * v, TRUCK[2] * v); }
        const flash = (Math.floor(age * 7 + c) % 2) * env;
        addPt(x + dx * 0.6, y + dy * 0.6, AMBER[0] * 0.9 * flash, AMBER[1] * 0.9 * flash, AMBER[2] * 0.9 * flash);
        addPt(x - dy * 2.6, y + dx * 2.6, AMBER[0] * 0.18 * flash, AMBER[1] * 0.18 * flash, AMBER[2] * 0.18 * flash);
        addPt(x + dy * 2.6, y - dx * 2.6, AMBER[0] * 0.18 * flash, AMBER[1] * 0.18 * flash, AMBER[2] * 0.18 * flash);
      }
    }
  }
}

// ---------------------------------------------------------------- frame
export default {
  name: 'Microcity',
  blurb: 'a living city map whose avenues are the numerals: traffic, signals, dusk windows, roadworks on the minute, fireworks on the hour',
  layouts: ['hub-3x3'], look: 'smoke', fps: 60, brightness: 0.25, dither: true,
  frame(ctx) {
    const date = ctx.date, ms = date.getTime();
    const sec = kit.secOf(date), mins = date.getHours() * 60 + date.getMinutes();
    const h = mins / 60 + sec / 3600, tt = h * 3600;   // seconds of the local day
    // daylight from the real clock
    const D = sstep(5.7, 7.6, h) * (1 - sstep(17.4, 19.6, h)), dk = 1 - D;
    const elev = Math.sin(kit.clamp((h - 6) / 12) * Math.PI);
    const warm = 1 - sstep(0.12, 0.55, elev);
    const sun = kit.mix([1, 0.97, 0.93], [1, 0.6, 0.36], warm);
    amb = 0.55 * D;
    if (dayMin !== mins) { C.sunDay(h, dayAlb); dayMin = mins; }
    // the base city: daylight albedo with shadows, plus night light switching on block by block
    const sr = sun[0] * amb, sg = sun[1] * amb, sb = sun[2] * amb;
    const thr = C.thr, emit = C.emit;
    for (let p = 0; p < N; p++) {
      const x = dk - thr[p];
      let on = 0;
      if (x >= 0.05) on = 1; else if (x > -0.05) { const u = (x + 0.05) * 10; on = u * u * (3 - 2 * u); }
      const q = 3 * p;
      img[q] = dayAlb[q] * sr + emit[q] * on;
      img[q + 1] = dayAlb[q + 1] * sg + emit[q + 1] * on;
      img[q + 2] = dayAlb[q + 2] * sb + emit[q + 2] * on;
    }
    const dayK = D, nightK = sstep(0.25, 0.75, dk);
    // the hour show
    const hourShow = date.getMinutes() === 0 && sec < 11 ? sec : -1;
    const fest = hourShow >= 0 ? Math.min(1, hourShow / 0.6, (11 - hourShow) / 1.5) : 0;
    festK = fest;
    const env = { dayK, amb, sun, lampK: sstep(0.2, 0.55, dk), fest, tt };

    drawExtras({ phase: 'under', tt, sec, D, dk, nightK, amb, sun, hourShow, mins });

    const cur = digitsOf(date), prv = digitsOf(new Date(ms - 60000));
    const jobs = [];
    for (let i = 0; i < 4; i++) {
      const S = SLOTS[i];
      const gNew = buildGlyph(cur[i], S.x, S.y, SW, SH, GW, GH);
      if (prv[i] === cur[i] || sec >= PAVE0 + 0.25 + PAVE_DUR + 0.2) { jobs.push([gNew, i, 0]); continue; }
      if (sec < OLD_GONE) jobs.push([buildGlyph(prv[i], S.x, S.y, SW, SH, GW, GH), i, 1]);
      if (sec >= PAVE0) jobs.push([gNew, i, 2]);
    }
    for (const [g, i, mode] of jobs) paintRoad(g, i, mode, sec, env);
    for (const [g, i, mode] of jobs) {
      let vis;
      if (mode === 0) vis = () => 1;
      else if (mode === 1) { const f = 1 - sstep(0, OLD_OFF, sec); vis = () => f; }
      else vis = (k, s) => { const [, f] = chunkFront(g, k, s, sec); return kit.clamp((f - s - 3) / 4); };
      drawTraffic(g, i, tt, vis, dayK, nightK);
      if (mode) drawWorks(g, mode, sec, nightK);
    }

    drawExtras({ phase: 'over', tt, sec, D, dk, nightK, amb, sun, hourShow, mins });

    kit.blitGrid(ctx, img, 2 * (1 - 0.4 * ctx.night));   // values x2 keep the city above the crushed dim end; brightness halves it back
  },
};
