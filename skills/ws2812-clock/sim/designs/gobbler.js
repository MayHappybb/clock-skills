// Gobbler: an arcade maze whose walls ARE the time. The four digits are runs
// of glowing double-line maze wall (gobbler-maze), their bays cut exactly
// one frog wide, and the owner's rainbow frog in round blue glasses hops
// through them catching flies with its tongue, while four ghost-like
// beetles patrol the streets and chase it (gobbler-sim plans each minute
// as one deterministic level).
//
// Minute: a power fly drifts down to the centre; the frog comes home and
// tongues it; the beetles turn blue and flee to their corners; then the
// changed digit's wall pieces slide one after another into the new digit
// (walls split and merge, never vanish), and a new swarm of flies settles
// along the new corridors.
// Hour: LEVEL UP. The maze flashes, the walls take the new level's colour
// as they slide, the frog dances, and the hour's bonus fruit pops up
// beside it, to be tongued.
import * as kit from '../js/kit.js';
import { N, BORDER, glyphSegs, morphPlan, distField } from './gobbler-maze.js';
import { level, digitsAt, sAtTime, pathAt, HOP_T, T_POWER, T_FLEE, T_FLY, CX, CY, HOMES, NODES, BEETLE_HZ } from './gobbler-sim.js';
import * as SP from './gobbler-sprites.js';

const img = new Float32Array(N * N * 3), D = new Float32Array(N * N), DB = new Float32Array(N * N);
distField(BORDER, DB);
let wallKey = -1;

const C = kit.hex;
// one wall colour per level (the hour)
const LEVELS = ['#2438ff', '#8a2cff', '#00b39a', '#ff4a8a', '#ff7a12', '#3a9cff', '#c03aff', '#18c25a'].map(C);
const FLY = C('#ffd8a0'), POWER = C('#e8ff60'), TONGUE = C('#ff3a6a'), SPARK = C('#fff2c0');
const levelCol = (sec) => LEVELS[new Date(sec * 1000).getHours() % LEVELS.length];
const SLIDE = 1.8;   // seconds the walls take to slide, from :00

// ----------------------------------------------------------------- walls
function wallSegs(m, s) {
  const cur = digitsAt(m * 60), prev = digitsAt(m * 60 - 60), segs = [], lifts = [];
  for (let k = 0; k < 4; k++) {
    if (s >= SLIDE || cur[k] === prev[k]) { for (const g of glyphSegs(+cur[k], k)) { segs.push(g); lifts.push(0); } continue; }
    for (const mv of morphPlan(+prev[k], +cur[k], k)) {
      const u = kit.clamp((s - 0.1 - mv.delay * 0.6) / 1.0), p = kit.ease.inOut(u);
      segs.push(mv.from.map((v, q) => v + (mv.to[q] - v) * p));
      lifts.push(mv.cost > 0.5 ? Math.sin(Math.PI * u) : 0);   // a piece in motion is lit up, like a lifted tile
    }
  }
  return [segs, lifts];
}
const LIFT = new Float32Array(N * N);
/** The wall field, and for each pixel how lifted its nearest piece is. */
function wallField(segs, lifts) {
  D.fill(99); LIFT.fill(0);
  for (let q = 0; q < segs.length; q++) {
    const [ax, ay, bx, by] = segs[q], lf = lifts[q];
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - 3)), x1 = Math.min(N - 1, Math.ceil(Math.max(ax, bx) + 3));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - 3)), y1 = Math.min(N - 1, Math.ceil(Math.max(ay, by) + 3));
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      let t = ((x - ax) * dx + (y - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x - ax - t * dx, ey = y - ay - t * dy, d = Math.sqrt(ex * ex + ey * ey), p = y * N + x;
      if (d < D[p]) { D[p] = d; LIFT[p] = lf; }
    }
  }
  for (let p = 0; p < N * N; p++) if (DB[p] < D[p]) { D[p] = DB[p]; LIFT[p] = 0; }
}
const WHITE = [0.85, 0.88, 1];
/** wave: [radius, old colour] of the LEVEL UP colour wave, or null. */
function paintWalls(col, a, now, wave) {
  // a slow current of light runs round the tubes: two waves crossing
  for (let p = 0; p < N * N; p++) {
    const d = D[p];
    if (d > 2) continue;
    const x = p % N, y = (p / N) | 0;
    const sh = 0.84 + 0.16 * Math.sin(0.21 * (x + y) - now * 2.1) * Math.sin(0.17 * (x - y) + now * 1.3);
    let k = (Math.max(0, 1 - Math.abs(d - 1) / 0.7) + (d < 1 ? 0.1 : 0)) * a * sh;
    let c = col;
    if (wave) {
      const r = Math.hypot(x - CX, y - CY) - wave[0];
      c = kit.mix(col, wave[1], kit.smoothstep(-2, 1, r));
      const rim = Math.exp(-r * r / 3);
      c = kit.mix(c, WHITE, rim * 0.8); k *= 1 + 0.6 * rim;
    }
    const lf = LIFT[p];
    if (lf > 0) { c = kit.mix(c, WHITE, 0.45 * lf); k *= 1 + 0.5 * lf; }
    img[3 * p] += c[0] * k; img[3 * p + 1] += c[1] * k; img[3 * p + 2] += c[2] * k;
  }
}

// ------------------------------------------------------------------ flies
const buzz = (f, now) => [f.x + 0.35 * Math.sin(now * 7.3 + f.ph), f.y + 0.3 * Math.sin(now * 9.1 + 2 * f.ph)];
function drawFly(x, y, now, ph, a) {
  const tw = 0.8 + 0.2 * Math.sin(now * 5 + ph * 3);
  SP.glow(img, x, y, FLY, 0.85 * tw * a);
  // wings: a faint flicker either side
  const wf = 0.5 + 0.5 * Math.sin(now * 40 + ph);
  SP.glow(img, x - 0.9, y - 0.6, FLY, 0.12 * wf * a);
  SP.glow(img, x + 0.9, y - 0.6, FLY, 0.12 * (1 - wf) * a);
}
const swarms = new Map();
/** Minute m's flies arriving: from the leftovers of the last level, or from off the edge. */
function swarm(m) {
  if (swarms.has(m)) return swarms.get(m);
  if (swarms.size > 4) swarms.delete(swarms.keys().next().value);
  const old = level(m - 1).flies.filter((f) => !(f.te < 99)), nu = level(m).flies;
  const used = new Set(), legs = [];
  nu.forEach((f, i) => {
    let best = -1, bd = 1e9;
    old.forEach((o, j) => { if (!used.has(j)) { const d = Math.hypot(o.x - f.x, o.y - f.y); if (d < bd) { bd = d; best = j; } } });
    let from;
    if (best >= 0) { used.add(best); from = [old[best].x, old[best].y]; }
    else {   // from the nearest edge, off the board
      const e = [f.x, 63 - f.x, f.y, 63 - f.y], k = e.indexOf(Math.min(...e));
      from = [[-3, f.y], [66, f.y], [f.x, -3], [f.x, 66]][k];
    }
    legs.push({ from, to: [f.x, f.y], ph: f.ph, delay: 0.3 + 1.5 * kit.hash(i, m), dur: 1.4 + 0.5 * kit.hash(m, i), bend: (kit.hash(i, m, 7) - 0.5) * 8 });
  });
  old.forEach((o, j) => { if (!used.has(j)) legs.push({ from: [o.x, o.y], to: [o.x < 32 ? -4 : 67, o.y - 6], ph: o.ph, delay: 0.2 + kit.hash(j, m, 3), dur: 1.5, bend: 3 }); });
  swarms.set(m, legs);
  return legs;
}

// ------------------------------------------------------------------ frame
function frogPose(lv, tau) {
  // returns [x, y, face, lift]
  const sMax = lv.L;
  if (tau < lv.tArrive) {
    const s = Math.min(sAtTime(tau), sMax), [x, y, face] = pathAt(lv.path, s);
    const u = tau / HOP_T - Math.floor(tau / HOP_T);
    return [x, y, face, u < 0.72 ? Math.sin(Math.PI * u / 0.72) : 0];
  }
  const [ex, ey, ef] = pathAt(lv.path, sMax);
  const hop0 = T_POWER + 0.3;
  if (tau < hop0) return [ex, ey, ef, 0];
  const u = kit.clamp((tau - hop0) / 0.32);
  const x = ex + (CX - ex) * kit.smoothstep(0, 1, u), y = ey + (CY - ey) * kit.smoothstep(0, 1, u);
  const face = tau < hop0 + 0.4 ? ef : (Math.floor((tau - hop0) / 1.4) % 2 ? -ef : ef);   // looks about
  return [x, y, face, u < 1 ? Math.sin(Math.PI * u) : 0];
}

export default {
  name: 'Gobbler',
  blurb: 'arcade maze whose walls are the time; the rainbow frog tongues flies, beetles chase, walls slide each minute',
  layouts: ['hub'], look: 'smoke', fps: 60, brightness: 0.35, dither: true,
  frame(ctx) {
    const now = ctx.date.getTime() / 1000;
    const m = Math.floor(now / 60), sec = now - m * 60;
    const w = sec < 4 ? m - 1 : m, tau = now - (w * 60 + 4);
    const lv = level(w);
    const hourTurn = digitsAt(m * 60).slice(2) === '00';
    const hourSoon = digitsAt(m * 60 + 60).slice(2) === '00';
    img.fill(0);

    // walls: the level colour; flashing before LEVEL UP, the new colour as they slide
    // the wall field only changes while walls slide; otherwise it is kept for the minute
    if (sec < SLIDE || wallKey !== m) {
      wallField(...wallSegs(m, sec));
      wallKey = sec < SLIDE ? -1 : m;
    }
    let wc = levelCol(m * 60), wa = 1, wave = null;
    // LEVEL UP: the new colour rolls out from the frog in a ring of white light
    if (hourTurn && sec < 2.6) wave = [kit.ease.out(kit.clamp((sec - 0.35) / 2)) * 50 - 2, levelCol(m * 60 - 60)];
    if (hourSoon && sec > 58.4) { const f = 0.5 - 0.5 * Math.cos((sec - 58.4) * Math.PI * 2 * 2.5); wc = kit.mix(wc, WHITE, f); wa = 1 + 0.2 * f; }
    paintWalls(wc, wa, now, wave);

    // flies
    if (sec < 4) {
      for (const g of swarm(m)) {
        const u = kit.clamp((sec - g.delay) / g.dur), e = kit.ease.inOut(u);
        const dx = g.to[0] - g.from[0], dy = g.to[1] - g.from[1], l = Math.hypot(dx, dy) || 1;
        const x = g.from[0] + dx * e - dy / l * g.bend * Math.sin(Math.PI * e), y = g.from[1] + dy * e + dx / l * g.bend * Math.sin(Math.PI * e);
        drawFly(x + 0.35 * Math.sin(now * 7.3 + g.ph), y + 0.3 * Math.sin(now * 9.1 + 2 * g.ph), now, g.ph, 1);
      }
    } else {
      for (const f of lv.flies) {
        if (f.te < tau - 0.001 || tau < f.ts - 1.6) continue;
        let [x, y] = buzz(f, now);
        if (tau < f.ts) {   // still flying in
          const e = kit.ease.out((tau - f.ts + 1.6) / 1.6);
          x = f.from[0] + (x - f.from[0]) * e + 3 * Math.sin(e * 9) * (1 - e); y = f.from[1] + (y - f.from[1]) * e;
        }
        drawFly(x, y, now, f.ph, 1);
      }
    }
    // the power fly: drifts down the middle avenue and hovers in the centre
    if (tau > T_FLY && tau < T_POWER) {
      const u = kit.ease.out(kit.clamp((tau - T_FLY) / 2.2));
      const x = CX + 1.4 * Math.sin(now * 3.1), y = -4 + (CY + 1.2 * Math.sin(now * 4.3) + 4) * u;
      const pulse = 0.65 + 0.35 * Math.sin(now * 8);
      SP.disc(img, x, y, 2.2, POWER, 0.14 * pulse);
      SP.disc(img, x, y, 0.9, POWER, 0.9);
      const wf = 0.5 + 0.5 * Math.sin(now * 45);
      SP.glow(img, x - 1.6, y - 1, SPARK, 0.3 * wf); SP.glow(img, x + 1.6, y - 1, SPARK, 0.3 * (1 - wf));
    }

    // beetles
    const k = kit.clamp(tau * BEETLE_HZ, 0, 60 * BEETLE_HZ - 1.001), k0 = Math.floor(k), kf = k - k0;
    lv.beetles.forEach((b, i) => {
      const x = b.x[k0] + (b.x[k0 + 1] - b.x[k0]) * kf, y = b.y[k0] + (b.y[k0 + 1] - b.y[k0]) * kf;
      const ka = Math.max(0, k0 - 3), kb = Math.min(b.x.length - 1, k0 + 3), dx = b.x[kb] - b.x[ka];
      const face = Math.abs(dx) > 0.2 ? Math.sign(dx) : NODES[HOMES[i]][0] < 32 ? 1 : -1;
      const moving = Math.hypot(dx, b.y[kb] - b.y[ka]) > 0.2;
      let mode = 0;
      if (tau >= T_POWER && tau < T_FLEE + 0.2) mode = tau > T_FLEE - 1.6 && Math.floor(tau * 5) % 2 ? 2 : 1;
      SP.beetle(img, x, y, i, face, moving ? Math.floor(tau * 9) : 0, mode);
    });

    // the frog
    let [fx, fy, face, lift] = frogPose(lv, tau);
    let hue = 0, jump = 1.4;
    if (tau > T_POWER) hue = (tau - T_POWER) * 0.6;              // powered up: the rainbow runs
    if (hourTurn && sec < 4 && sec > 0.3) {                       // LEVEL UP dance: spins and high hops
      const u = (sec - 0.3) / 0.45, ph = u - Math.floor(u);
      lift = Math.sin(Math.PI * ph); jump = 3.2;
      face = Math.floor(u) % 2 ? -1 : 1;
      if (sec > 2.9) { lift = 0; face = 1; }
    }
    const blink = kit.fract(now / 3.7) < 0.04;
    SP.frog(img, fx, fy - lift * jump, face, { leap: lift > 0.35, blink, hue });

    // the tongue: flies, the power fly, the bonus fruit
    const [mx, my] = SP.mouth(fx, fy - lift * jump, face);
    const lick = (tx, ty, te, draw) => {
      const ext = (tau - (te - 0.1)) / 0.1, ret = (tau - te) / 0.13;
      if (ext < 0 || ret > 1) return false;
      const f = ret < 0 ? kit.clamp(ext) : 1 - kit.clamp(ret);
      const ex = mx + (tx - mx) * f, ey = my + (ty - my) * f;
      SP.line(img, mx, my, ex, ey, TONGUE, 1);
      if (ret >= 0 && draw) draw(ex, ey);
      return true;
    };
    if (sec >= 4 || tau < 56) for (const f of lv.flies) if (f.te < 99 && Math.abs(tau - f.te) < 0.25) {
      const [x, y] = buzz(f, now);
      lick(x, y, f.te, (ex, ey) => drawFly(ex, ey, now, f.ph, 1));
    }
    lick(CX + 1.4 * Math.sin(now * 3.1), CY + 1.2 * Math.sin(now * 4.3), T_POWER, (ex, ey) => SP.disc(img, ex, ey, 0.9, POWER, 0.9));

    // LEVEL UP: the hour's fruit pops up on the cross street, and is tongued
    if (hourTurn && sec < 4.2 && sec > 0.6) {
      const fx2 = CX + 9, fy2 = CY, te = 3.4;
      const hk = new Date(m * 60000).getHours();
      if (tau < 56 + te - 4 + 4 && sec < te) {
        const pop = kit.ease.outBack(kit.clamp((sec - 0.6) / 0.4));
        SP.fruit(img, fx2, fy2 + (1 - pop) * 3, hk, kit.clamp(pop));
        // sparkles round it
        for (let q = 0; q < 4; q++) {
          const a = now * 3 + q * Math.PI / 2, r = 5.5 + Math.sin(now * 5 + q);
          SP.glow(img, fx2 + r * Math.cos(a), fy2 + r * Math.sin(a), SPARK, 0.5 * kit.clamp(pop));
        }
      }
      const tauTe = tau - sec + te;   // the fruit's lick, in window time
      lick(fx2, fy2, tauTe, (ex, ey) => SP.fruit(img, ex, ey, hk, 0.8));
      if (sec > te && sec < te + 0.8) {   // a ring of light where it was
        const r = (sec - te) * 14, a = 1 - (sec - te) / 0.8;
        for (let q = 0; q < 16; q++) { const t = q / 16 * kit.TAU; SP.glow(img, fx2 + r * Math.cos(t), fy2 + r * Math.sin(t), SPARK, 0.6 * a); }
      }
    }

    kit.blitGrid(ctx, img, 1 - 0.65 * ctx.night);
  },
};
