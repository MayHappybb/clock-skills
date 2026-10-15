// Hive: the hexagon is a honeycomb, every LED a cell. The time is written in
// honey, in COMB letters (pointed arches: the lattice's own shape), hours
// over minutes. Five worker bees wander the comb; a sixth does the waggle
// dance in the gap between the rows.
//
// At each minute the workers rewrite the changed digits: they drink the
// cells the new time does not need, then fill the new ones in stroke order,
// five at a time, each cell glinting as it fills. The time is never wrong:
// the old digits stay whole until the minute turns.
//
// Stateless: every bee and cell is a function of time, so any instant
// renders on its own.
import * as kit from '../js/kit.js';

const DX = 4 * Math.sqrt(3) / 2;
const ROWS = [-30, 6];                          // y of glyph row 0, hours and minutes
const X0 = -5 * DX;                             // first digit's column 0 (q = -5)
const WORKERS = 5;
const SLOT = 0.5, FLY = 0.3;                    // seconds per cell, of which flying
const START = 0.25;                             // after the minute turns

const WAX = [0.012, 0.004, 0.0005];
const AMBER = kit.hex('#ff9a12'), DEEP = kit.hex('#d05800'), GLINT = [1, 0.8, 0.35];
const BEE = kit.hex('#ffd84a'), WING = [0.45, 0.6, 0.95];

const pad = (n) => String(n).padStart(2, '0');
const timeText = (d) => [pad(d.getHours()), pad(d.getMinutes())];

/** Cells of the time shown during minute `d`: Map(ledIndex -> stroke order). */
function cellsOf(ctx, d) {
  const cells = [];
  timeText(d).forEach((txt, row) => {
    for (const g of kit.combText(ctx, txt, X0, ROWS[row])) for (const dot of g.dots) if (dot.i >= 0) cells.push(dot.i);
  });
  return cells;
}

const schedules = new Map();
/** What the workers do in the minute starting at epoch second M. */
function schedule(ctx, M) {
  if (schedules.has(M)) return schedules.get(M);
  const prev = cellsOf(ctx, new Date((M - 60) * 1000)), next = cellsOf(ctx, new Date(M * 1000));
  const ps = new Set(prev), ns = new Set(next);
  const tasks = [
    ...prev.filter((i) => !ns.has(i)).map((i) => ({ i, fill: false })),
    ...next.filter((i) => !ps.has(i)).map((i) => ({ i, fill: true })),
  ];
  // round robin: consecutive stroke dots go to different bees, together
  tasks.forEach((tk, j) => { tk.bee = j % WORKERS; tk.at = M + START + Math.floor(j / WORKERS) * SLOT; });
  const s = { tasks, prev: ps, next: ns, end: M + START + Math.ceil(tasks.length / WORKERS) * SLOT, byCell: new Map(tasks.map((tk) => [tk.i, tk])) };
  if (schedules.size > 6) schedules.delete(schedules.keys().next().value);
  schedules.set(M, s);
  return s;
}

/** A bee's idle wandering: smooth, inside the hexagon. */
function wander(b, t) {
  const x = 62 * (kit.noise2(t * 0.11, b * 13.7) - 0.5) * 1.6;
  const y = 70 * (kit.noise2(b * 7.3, t * 0.1 + 40) - 0.5) * 1.6;
  // keep inside the hexagon (ring 9 or so): scale back along the ray
  const r = Math.max(Math.abs(x) / 33, (Math.abs(x) * 0.5 + Math.abs(y) * Math.sqrt(3) / 2) / 33);
  return r > 1 ? [x / r, y / r] : [x, y];
}

/** The waggle dancer, in the band between the rows. */
function dancer(t) {
  const P = 3.4, ph = (t % (2 * P)) / P, side = ph < 1 ? 1 : -1, u = ph % 1;
  if (u < 0.45) {                                       // waggle run, left to right
    const s = u / 0.45;
    return [kit.lerp(-9, 9, s), Math.sin(s * 40) * 1.6, true];
  }
  const s = (u - 0.45) / 0.55, a = Math.PI * s;          // return loop, alternating sides
  return [9 * Math.cos(a), side * 7 * Math.sin(a), false];
}

function drawBee(ctx, x, y, vx, vy, a, buzz) {
  kit.splat(ctx, x, y, 3.4, BEE, a * (0.95 + 0.05 * buzz));
  const n = Math.hypot(vx, vy) || 1, px = -vy / n, py = vx / n;
  const w = a * 0.3 * (0.5 + 0.5 * buzz);
  kit.splat(ctx, x + px * 2.6, y + py * 2.6, 2.2, WING, w);
  kit.splat(ctx, x - px * 2.6, y - py * 2.6, 2.2, WING, w);
}

export default {
  name: 'Hive', blurb: 'time written in honey; bees drink and refill the cells each minute',
  layouts: ['hex'], look: 'bare', fps: 60, brightness: 0.55, dither: true,
  frame(ctx) {
    const { t, date, leds } = ctx;
    const now = date.getTime() / 1000, M = Math.floor(now / 60) * 60;
    const S = schedule(ctx, M);
    const dim = 1 - 0.8 * ctx.night;

    // wax, with a faint grain so the comb reads as a surface
    for (const l of leds) kit.set(ctx, l.i, WAX, dim * (0.7 + 0.6 * kit.noise2(l.x * 0.15, l.y * 0.15)));

    // honey
    const level = (i) => {
      const tk = S.byCell.get(i);
      if (!tk) return S.next.has(i) ? 1 : 0;
      const p = kit.clamp((now - tk.at - FLY) / (SLOT - FLY));
      return tk.fill ? kit.ease.out(p) : 1 - kit.ease.in(p);
    };
    for (const i of new Set([...S.prev, ...S.next])) {
      const l = leds[i], v = level(i);
      if (v <= 0) continue;
      const sh = kit.fbm(l.x * 0.06, l.y * 0.06, t * 0.25, 3);
      kit.over(ctx, i, kit.scale(kit.mix(DEEP, AMBER, sh), 0.55 + 0.6 * sh), v * dim);
      const tk = S.byCell.get(i);
      if (tk?.fill) {
        const p = (now - tk.at - FLY) / (SLOT - FLY + 0.5);
        if (p > 0 && p < 1) kit.add(ctx, i, GLINT, 0.9 * Math.sin(Math.PI * p) * dim);
      }
    }

    // workers
    for (let b = 0; b < WORKERS; b++) {
      const mine = S.tasks.filter((tk) => tk.bee === b);
      let pos = wander(b, now), pre = wander(b, now - 0.05);
      const posAt = (tt) => {
        if (!mine.length || tt < mine[0].at || tt > mine[mine.length - 1].at + SLOT + 0.7) return wander(b, tt);
        let from = wander(b, mine[0].at);
        for (let j = 0; j < mine.length; j++) {
          const c = leds[mine[j].i], cell = [c.x, c.y + 0.6 * Math.sin(tt * 9 + b)];
          const t0 = mine[j].at;
          if (tt < t0 + FLY) { const e = kit.ease.inOut(kit.clamp((tt - t0) / FLY)); return [kit.lerp(from[0], cell[0], e), kit.lerp(from[1], cell[1], e)]; }
          if (tt < t0 + SLOT) return cell;
          from = [c.x, c.y];
        }
        const e = kit.ease.inOut(kit.clamp((tt - mine[mine.length - 1].at - SLOT) / 0.7)), w = wander(b, tt);
        return [kit.lerp(from[0], w[0], e), kit.lerp(from[1], w[1], e)];
      };
      pos = posAt(now); pre = posAt(now - 0.05);
      drawBee(ctx, pos[0], pos[1], pos[0] - pre[0], pos[1] - pre[1], dim * (1 - 0.6 * ctx.night), Math.sin(now * 70 + b * 2));
    }

    // the dancer
    const [dx, dy, waggling] = dancer(now), [qx, qy] = dancer(now - 0.03);
    drawBee(ctx, dx, dy, dx - qx, dy - qy, dim, waggling ? Math.sin(now * 90) : 0.3);
  },
};
