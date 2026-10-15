// Pinball: a whole table seen from above fills the 64 x 64 panel, and the
// time is its own light show. The hours and minutes are lamp inserts set in
// the playfield (chevron arrows that chase along each stroke, round "ball
// terminal" lamps at the stroke ends). A silver ball is always in play on
// real physics (pinball-table.js): a flipper player, pop bumpers,
// slingshots, drains and ball-saves.
//
// Each minute ends with a skill shot: the plunger draws back (a visible
// countdown), the ball rides the orbit, comes down the inlane and the left
// flipper fires it into the drop-target bank exactly on the minute. One
// target per digit; the targets of the digits that change drop, the old
// inserts flicker out and the new digit lights insert by insert. On the
// hour: multiball from the saucer, the JACKPOT lamps, and every lamp on the
// table in a chase - while the hour stays lit.
import * as kit from '../js/kit.js';
import { insertMap } from './pinball-font.js';
import * as P from './pinball-table.js';

const { T, BALL_R } = P;
const RED = kit.hex('#ff2e14'), AMBER = kit.hex('#ffa21c'), HOT = kit.hex('#fff1d6');
const STEEL = kit.hex('#5d6a80'), CREAM = kit.hex('#f4ead8'), BLUE = kit.hex('#3c7dff');
const W = 64, H = 64;

// where the digits sit: hours big over the upper playfield, minutes between the slings
const SLOTS = [
  { x: 17, y: 16, s: 1.1, col: RED }, { x: 31, y: 16, s: 1.1, col: RED },
  { x: 20, y: 36, s: 0.8, col: AMBER }, { x: 31, y: 36, s: 0.8, col: AMBER },
];

// ------------------------------------------------------------ raster helpers
/** Coverage of a capsule a-b (radius r) at every pixel of its box: calls fn(p, cov, d, u). */
function capsule(ax, ay, bx, by, r, fn, r1 = r) {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r + 1));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r - 1)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r + 1));
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5, py = y + 0.5;
    let u = ((px - ax) * dx + (py - ay) * dy) / L2; u = u < 0 ? 0 : u > 1 ? 1 : u;
    const ex = px - ax - u * dx, ey = py - ay - u * dy;
    const d = Math.sqrt(ex * ex + ey * ey) - (r + (r1 - r) * u);
    const cov = d < -0.5 ? 1 : d > 0.5 ? 0 : 0.5 - d;
    if (cov > 0) fn(y * W + x, cov, d, u);
  }
}
function addPx(img, p, c, a) { img[3 * p] += c[0] * a; img[3 * p + 1] += c[1] * a; img[3 * p + 2] += c[2] * a; }
function overPx(img, p, c, a) {
  const q = 3 * p;
  img[q] += (c[0] - img[q]) * a; img[q + 1] += (c[1] - img[q + 1]) * a; img[q + 2] += (c[2] - img[q + 2]) * a;
}
const line = (img, ax, ay, bx, by, r, c, a) => capsule(ax, ay, bx, by, r, (p, cov) => addPx(img, p, c, a * cov));

// ------------------------------------------------------------ static layer
let BASE = null;
function base() {
  if (BASE) return BASE;
  const img = new Float32Array(3 * W * H);
  // chrome rails: brighter where they face the light (up and left)
  const rail = (pts, a = 1) => {
    for (let k = 1; k < pts.length; k++) {
      const [ax, ay] = pts[k - 1], [bx, by] = pts[k], len = Math.hypot(bx - ax, by - ay) || 1;
      const nx = -(by - ay) / len, ny = (bx - ax) / len, lit = 0.55 + 0.45 * Math.abs(nx * -0.6 + ny * -0.8);
      line(img, ax, ay, bx, by, 0.32, STEEL, 0.5 * lit * a);
    }
  };
  rail(T.outerPts); rail(T.rightPts); rail(T.rightLower);
  // sling bodies: dim plastic triangles
  for (const s of T.slings) rail([s.a, s.b, s.c], 0.6);
  // apron: the bottom edge under the flippers
  line(img, 1, 61.5, 15, 61.5, 0.3, STEEL, 0.08); line(img, 44, 61.5, 58, 61.5, 0.3, STEEL, 0.08);
  // GI: warm bulbs under the slingshot plastics and the top arch, very low
  const GI = kit.hex('#ffcf8a');
  const pool = (cx, cy, r, a) => capsule(cx, cy, cx, cy, r, (p, cov, dd) => addPx(img, p, GI, a * cov * (1 - kit.smoothstep(-r, 0, dd)) ** 0.5 * kit.smoothstep(0, -r, dd)));
  BASE = img;
  return img;
}

// ------------------------------------------------------------ the frame
const img = new Float32Array(3 * W * H), smp = new Float32Array(P.STRIDE), smp2 = new Float32Array(P.STRIDE);
const ballAcc = new Float32Array(4 * W * H), reflect = new Float32Array(3 * W * H);

// JACKPOT in lamp letters, 4 x 5, drawn for this panel
const JP = {
  J: ['.###', '...#', '...#', '#..#', '.##.'], A: ['.##.', '#..#', '####', '#..#', '#..#'],
  C: ['.###', '#...', '#...', '#...', '.###'], K: ['#..#', '#.#.', '##..', '#.#.', '#..#'],
  P: ['###.', '#..#', '###.', '#...', '#...'], O: ['.##.', '#..#', '#..#', '#..#', '.##.'],
  T: ['####', '.##.', '.##.', '.##.', '.##.'],
};
function drawJackpot(t, now) {
  const word = 'JACKPOT', y0 = 3;
  const fade = kit.smoothstep(0.2, 0.5, t) * (1 - kit.smoothstep(7.5, 9, t));
  for (let i = 0; i < 7; i++) {
    const on = kit.smoothstep(0.3 + i * 0.12, 0.42 + i * 0.12, t);              // letters light in a chase
    const blink = t > 1.4 ? 0.55 + 0.45 * Math.cos(kit.TAU * (now * 2.5 - i * 0.14)) : 1;
    const g = JP[word[i]], col = (i + Math.floor(now * 4)) % 2 ? AMBER : HOT;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) {
      if (g[r][c] !== '#') continue;
      const x = (i < 4 ? 8 + i * 5 : 34 + (i - 4) * 5) + c, y = y0 + r;
      addPx(img, y * W + x, col, 0.85 * on * blink * fade);
    }
  }
}

/** Where everything is at minute-local time t: fills smp from the right record. */
function stateAt(M, t, out) {
  if (t >= M.plunge) return P.sampleRec(P.shot(M.next).rec, t - M.plunge, out);
  return P.sampleRec(M.rec, t, out);
}

function lastEvent(events, t, kind, id) {
  let best = -99;
  for (let i = 0; i < events.length; i++) { const e = events[i]; if (e[0] > t) break; if (e[1] === kind && e[2] === id) best = e[0]; }
  return best;
}

let BALLS = [], warm = 0;
const built = new Uint8Array(20);   // ball centres this frame, for the rollover flare
function drawInserts(slot, digit, t, I) {
  const S = SLOTS[slot], m = insertMap(digit, S.s);
  for (let j = 0; j < m.inserts.length; j++) {
    const ins = m.inserts[j];
    let v = I(ins.order, j) * (0.88 + 0.24 * kit.hash(slot, digit, j));
    // a ball rolling over an insert sets it flaring
    for (let b = 0; b < BALLS.length; b += 2) {
      const dx = BALLS[b] - S.x - ins.cx, dy = BALLS[b + 1] - S.y - ins.cy, d2 = dx * dx + dy * dy;
      if (d2 < 16 && v > 0.2) v += 0.7 * (1 - d2 / 16);
    }
    if (v <= 0.002) continue;
    const hot = Math.max(0, v - 0.8) * 1.4;
    for (let q = 0; q < ins.cov.length; q++) {
      const x = S.x + ins.px[2 * q], y = S.y + ins.px[2 * q + 1];
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const p = y * W + x, g = ins.glow[q];
      const g3 = g * g * g;
      addPx(img, p, S.col, 1.15 * v * g);
      addPx(img, p, HOT, (0.22 * v + hot * 0.6) * g3 * g3);     // the bulb under the plastic
    }
  }
}

export default {
  name: 'Pinball',
  blurb: 'a whole pinball table in play; the time is its lamp inserts, and each minute a skill shot hits the drop target of the digit that changes',
  layouts: ['hub'], look: 'smoke', fps: 60, brightness: 0.4,
  frame(ctx) {
    const d = ctx.date, now = d.getTime() / 1000;
    const mAbs = Math.floor(now / 60), t = now - mAbs * 60;
    const m = d.getHours() * 60 + d.getMinutes();
    const M = P.minute(m);
    if (t > 3 && t < 57) P.prefetch(m + 1, 1.2);    // the next minute is simulated a little each frame
    img.set(base());
    // build the next missing insert map, one a frame, so no turn waits on one
    for (let w = 0; w < 20; w++) { const key = (warm + w) % 20; if (!built[key]) { insertMap(key % 10, key < 10 ? 1.1 : 0.8); built[key] = 1; warm = key; break; } }
    // the hour: the general illumination strobes and the bumpers chase round
    const show = M.multi && t < 5 ? 1 - kit.smoothstep(3, 5, t) : 0;
    if (show > 0) {
      const k = 1.8 * show * (0.5 + 0.5 * Math.cos(now * kit.TAU * 3.5)), B = base();
      for (let i = 0; i < B.length; i++) img[i] += B[i] * k;
    }
    const cur = P.digitsOf(m), prev = P.digitsOf((m + 1439) % 1440), ch = P.changedAt(m);
    const st = stateAt(M, t, smp);
    BALLS = [];
    for (let b = 0; b < P.NB; b++) if (st[3 * b + 2]) BALLS.push(st[3 * b], st[3 * b + 1]);

    // ---- the inserts: four digits
    for (let k = 0; k < 4; k++) {
      const chase = (o) => 0.62 + 0.38 * (0.5 + 0.5 * Math.cos(kit.TAU * (o * 1.3 - now * (k < 2 ? 0.32 : 0.45)))) ** 3;
      if (!ch[k] || t > 3) { drawInserts(k, +cur[k], t, chase); continue; }
      const td = Math.max(0, k - M.aim) * 0.09;      // the bank ripples from the target the ball hit
      const a = t - td;
      if (a < 0) { drawInserts(k, +prev[k], t, chase); continue; }
      if (a < 0.4) {
        const fl = kit.hash(Math.floor(now * 30), k) > 0.4 ? 1 : 0.35;
        drawInserts(k, +prev[k], t, (o) => chase(o) * (1 - a / 0.4) * fl);
      }
      const t0 = 0.45, SW = 1.15;
      drawInserts(k, +cur[k], t, (o) => {
        const ghost = 0.07 * kit.smoothstep(0.25, 0.5, a);
        const ti = t0 + o * SW;
        if (a < ti) return ghost;
        const e = a - ti, flash = 1.0 * Math.exp(-e / 0.18);
        const done = kit.smoothstep(t0 + SW, t0 + SW + 0.15, a), pulse = 0.5 * Math.exp(-Math.max(0, a - t0 - SW - 0.1) / 0.25) * done;
        return chase(o) + flash + pulse;
      });
    }

    // ---- slings: white rubber on the kicker face, a lamp behind it that fires with the kick
    for (let i = 0; i < 2; i++) {
      const sl = T.slings[i], e = t - lastEvent(M.events, t, 1, i), kick = Math.exp(-Math.max(0, e) / 0.09);
      const [ax, ay] = sl.a, [cx, cy] = sl.c, len = Math.hypot(cx - ax, cy - ay), nx = (cy - ay) / len * (i ? 1 : -1), ny = -(cx - ax) / len * (i ? 1 : -1);
      const bow = 1.1 * kick;
      const mx = (ax + cx) / 2 + nx * bow, my = (ay + cy) / 2 + ny * bow;
      line(img, ax, ay, mx, my, 0.4, CREAM, 0.30 + 0.5 * kick); line(img, mx, my, cx, cy, 0.4, CREAM, 0.30 + 0.5 * kick);
      const gx = (sl.a[0] + sl.b[0] + sl.c[0]) / 3, gy = (sl.a[1] + sl.b[1] + sl.c[1]) / 3;
      capsule(gx, gy, gx, gy, 1.4, (p, cov) => addPx(img, p, AMBER, cov * (0.05 + 0.9 * kick)));
    }
    // ---- saucer: a dark cup in a lit ring, hot during multiball
    {
      const hot = M.multi && t < 2.4 ? 0.5 + 0.5 * Math.sin(now * 30) : 0;
      capsule(T.saucer.x, T.saucer.y, T.saucer.x, T.saucer.y, 2.0, (p, cov, dd) => addPx(img, p, AMBER, cov * kit.smoothstep(-1.1, -0.3, dd) * (0.18 + 0.8 * hot)));
    }
    // ---- shooter lane: plunger, waiting ball, gate
    let laneY = null, off = 0;
    const waits = M.lanes.map((L) => [L.appear, L.pull, L.launch]);
    if (M.final >= 0) waits.push([M.final, M.plunge - P.PULL, M.plunge]);
    for (const [ap, pu, la] of waits) {
      if (t >= ap && t < la) {
        laneY = kit.lerp(66, T.laneRest, kit.ease.out(kit.clamp((t - ap) / 0.4)));
        off = 1.8 * kit.ease.inOut(kit.clamp((t - pu) / (la - pu)));
        laneY += off;
      } else if (t >= la && t < la + 0.25) off = -0.7 * Math.exp(-(t - la) / 0.05) * Math.cos((t - la) * 60);
    }
    if (t >= M.plunge && t < M.plunge + 0.25) off = -0.7 * Math.exp(-(t - M.plunge) / 0.05) * Math.cos((t - M.plunge) * 60);
    line(img, T.lanex, T.laneRest + BALL_R + 0.6 + off, T.lanex, 64, 0.55, STEEL, 0.55);
    line(img, T.lanex - 1.4, T.laneRest + BALL_R + 0.5 + off, T.lanex + 1.4, T.laneRest + BALL_R + 0.5 + off, 0.35, CREAM, 0.4);
    {
      let sw = 0;
      for (const la of [...M.lanes.map((L) => L.launch), M.plunge]) { const e = t - la - 0.2; if (e > 0 && e < 0.8) sw = Math.max(sw, Math.sin(e * 14) * Math.exp(-e / 0.2)); }
      const [gx, gy] = T.gate.a, [hx, hy] = T.gate.b, ang = -0.9 * Math.abs(sw);
      const c = Math.cos(ang), sn = Math.sin(ang), dx = hx - gx, dy = hy - gy;
      line(img, gx, gy, gx + c * dx - sn * dy, gy + sn * dx + c * dy, 0.3, STEEL, 0.45);
    }

    // ---- orbit arrows: chevron inserts up both side lanes, chasing toward the top
    for (const ax of [4.0, 55.0]) for (let i = 0; i < 3; i++) {
      const y = 29 - i * 4, ph = kit.fract(now * 0.9 - i * 0.22), v = 0.12 + 0.75 * Math.exp(-ph / 0.18);
      line(img, ax - 1.3, y + 1.1, ax, y, 0.45, AMBER, v); line(img, ax, y, ax + 1.3, y + 1.1, 0.45, AMBER, v);
    }
    // ---- shoot again: blinks while a ball waits in the shooter lane
    {
      const v = laneY !== null ? 0.25 + 0.6 * (Math.sin(now * 9) > 0 ? 1 : 0) : 0.06;
      capsule(29.5, 61.2, 29.5, 61.2, 1.1, (p, cov) => addPx(img, p, RED, cov * v));
    }
    // ---- JACKPOT: the hour's lamps across the top of the table
    if (M.multi && t < 9) drawJackpot(t, now);

    // ---- balls
    reflect.set(img);
    ballAcc.fill(0);
    const SUB = 3;
    for (let sI = 0; sI < SUB; sI++) {
      const ts = t + ((sI + 0.5) / SUB - 0.5) / 60;
      const s2 = stateAt(M, Math.max(0, ts), smp2);
      for (let b = 0; b < P.NB; b++) {
        if (!s2[3 * b + 2]) continue;
        const bx = s2[3 * b], by = s2[3 * b + 1];
        capsule(bx, by, bx, by, BALL_R, (p, cov, dd) => {
          const px = (p % W) + 0.5 - bx, py = Math.floor(p / W) + 0.5 - by, r2 = Math.min(1, (px * px + py * py) / (BALL_R * BALL_R));
          const nz = Math.sqrt(1 - r2);
          const hx = px + 0.62, hy = py + 0.72, spec = Math.exp(-(hx * hx + hy * hy) / 0.35);
          // chrome: a dim steel body, the lamps around it reflected, one glint
          const sh = 0.14 + 0.30 * nz;
          const rx = Math.min(W - 1, Math.max(0, Math.floor(bx + px * 3.2))), ry = Math.min(H - 1, Math.max(0, Math.floor(by + py * 3.2)));
          const rq = 3 * (ry * W + rx), rf = 0.75 * (1 - 0.5 * nz);
          const q = 4 * p;
          ballAcc[q] += (sh * 0.92 + spec * 1.6 + reflect[rq] * rf) * cov / SUB;
          ballAcc[q + 1] += (sh * 0.96 + spec * 1.55 + reflect[rq + 1] * rf) * cov / SUB;
          ballAcc[q + 2] += (sh * 1.08 + spec * 1.45 + reflect[rq + 2] * rf) * cov / SUB;
          ballAcc[q + 3] += cov / SUB;
        });
      }
    }
    if (laneY !== null) capsule(T.lanex, laneY, T.lanex, laneY, BALL_R, (p, cov) => {
      const px = (p % W) + 0.5 - T.lanex, py = Math.floor(p / W) + 0.5 - laneY, nz = Math.sqrt(Math.max(0, 1 - (px * px + py * py) / (BALL_R * BALL_R)));
      const hx = px + 0.62, hy = py + 0.72, spec = Math.exp(-(hx * hx + hy * hy) / 0.35), sh = 0.14 + 0.30 * nz, q = 4 * p;
      ballAcc[q] += (sh * 0.92 + spec * 1.6) * cov; ballAcc[q + 1] += (sh * 0.96 + spec * 1.55) * cov; ballAcc[q + 2] += (sh * 1.08 + spec * 1.45) * cov; ballAcc[q + 3] += cov;
    });
    for (let p = 0; p < W * H; p++) {
      const a = Math.min(1, ballAcc[4 * p + 3]);
      if (a <= 0) continue;
      const q = 3 * p;
      img[q] = img[q] * (1 - a) + ballAcc[4 * p]; img[q + 1] = img[q + 1] * (1 - a) + ballAcc[4 * p + 1]; img[q + 2] = img[q + 2] * (1 - a) + ballAcc[4 * p + 2];
    }

    // ---- flippers
    for (let k = 0; k < 2; k++) {
      const f = T.flippers[k], a = st[P.NB * 3 + k], [ux, uy] = P.flipperDir(k, a);
      capsule(f.x, f.y, f.x + ux * f.len, f.y + uy * f.len, f.r0, (p, cov, dd) => {
        const c = kit.mix(RED, CREAM, kit.smoothstep(-0.2, -0.9, dd));
        overPx(img, p, kit.scale(c, 0.5), cov);
      }, f.r1);
    }
    // ---- bumpers
    for (let i = 0; i < T.bumpers.length; i++) {
      const bp = T.bumpers[i], e = t - lastEvent(M.events, t, 0, i);
      const fl = Math.max(Math.exp(-Math.max(0, e) / 0.12), show * Math.exp(-kit.fract(now * 2.5 - i / 4) / 0.12));
      capsule(bp.x, bp.y, bp.x, bp.y, bp.r, (p, cov, dd) => {
        const ring = kit.smoothstep(-1.4, -0.6, dd);
        const core = 1 - kit.smoothstep(-2.4, -1.6, dd);
        addPx(img, p, BLUE, cov * (0.16 + 0.6 * fl) * ring);
        addPx(img, p, RED, cov * (0.14 + 0.3 * fl) * (1 - ring) * (1 - core));
        addPx(img, p, CREAM, cov * (0.10 + 1.0 * fl) * core);
      });
    }
    // ---- targets
    for (let k = 0; k < 4; k++) {
      const tg = T.targets[k], col = SLOTS[k].col;
      let hgt = 1;
      if (ch[k] && t < P.RESET + 0.2) {
        const td = Math.max(0, k - M.aim) * 0.09;
        hgt = t < td ? 1 : t < P.RESET ? Math.max(0, 1 - (t - td) / 0.1) : kit.smoothstep(P.RESET, P.RESET + 0.12, t);
      }
      if (hgt > 0) {
        const hitf = Math.exp(-Math.max(0, t - lastEvent(M.events, t, 2, k)) / 0.15);
        for (let x = Math.ceil(tg.x0); x < tg.x1 - 0.5; x++) for (let y = Math.floor(tg.y - 2.2 * hgt); y < tg.y; y++) {
          const cov = kit.clamp(y + 1 - (tg.y - 2.2 * hgt));
          addPx(img, y * W + x, col, cov * (0.5 + 0.6 * hitf)); addPx(img, y * W + x, HOT, cov * 0.12 * (y === Math.floor(tg.y - 2.2 * hgt) ? 1 : 0.3));
        }
      }
    }

    kit.blitGrid(ctx, img, 1 - 0.7 * ctx.night);
  },
};
