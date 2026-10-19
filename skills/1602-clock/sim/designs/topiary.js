// Topiary — the time is a row of clipped hedges, and a gardener keeps it.
//
// The four numerals are box hedges clipped into digits, three cells wide and
// both rows tall, all built from one leaf texture: a full cell of leaves and
// four bars cut from the same texture (top, bottom, top+middle, middle), so a
// whole face costs at most five tiles whatever the time. The seams between
// cells read as the cuts between clipped blocks. The gardener in his straw
// hat lives in the wide gap between the hours and the minutes.
//
// Idle: gusts rustle every hedge at once (the leaf tile shifts) and he holds
// his hat; a stray twig sprouts from a hedge, he spots it, trudges over and
// snips it; a sparrow pops out of a hedge, sits on his hat, and dives back.
//
// Minute: he walks to the hedge that is about to change. It sprouts shoots,
// then its holes fill with leaves cell by cell until it is a shaggy block. On
// the minute he steps into it and clips it column by column into the new
// numeral, blades snapping above his head. The old digit is only ever
// overgrown, so the glass shows the old time, a bush, or the new time
// emerging, never a wrong one.
//
// Hour: he fetches the electric trimmer, the whole garden bursts into a
// jungle, and he buzzes along the glass trimming the new time out of it in
// one pass, leaving a block between the hours and the minutes. He carves it
// into a topiary rabbit, steps back to admire it... and it hops away.
//
// Tiles: parts first (never more than five, a repeated digit shares), then
// the gardener, then the blade, the growing cell, the rabbit, the sparrow,
// the twig and the sprouts, each falling back to blank or to the part under
// it. Everything is derived from the clock.

import { TileAllocator, noise } from '../js/kit.js';

// ------------------------------------------------------------------ bitmaps

const bits = (rows) => rows.map((l) => [...l].reduce((b, ch) => (b << 1) | (ch === '#' ? 1 : 0), 0));
const str = (b) => { let s = ''; for (let i = 0; i < 5; i++) s += (b >> (4 - i)) & 1 ? '#' : '.'; return s; };
const rev = (b) => { let o = 0; for (let i = 0; i < 5; i++) if (b & (1 << i)) o |= 0x10 >> i; return o; };
const EMPTY = [0, 0, 0, 0, 0, 0, 0, 0];
const and = (a, m) => a.map((v, r) => v & m[r]);
const or = (a, b) => a.map((v, r) => v | b[r]);
const dilate = (s) => s.map((v, r) => (v | (v << 1) | (v >> 1) | (s[r - 1] ?? 0) | (s[r + 1] ?? 0)) & 0x1f);
// Sprite over a background, with a one-dot clear outline so it reads in front of leaves.
const over = (base, spr) => { const h = dilate(spr); return base.map((v, r) => ((v & ~h[r]) | spr[r]) & 0x1f); };
const rnd = (a, b) => noise(a * 7.13 + b * 0.917, 23);

// Clipped hedge: solid, with a leafy fringe along the top that a gust ruffles.
// Wild hedge: shaggy, holes and stray leaves everywhere.
const SOLID = bits(['#####', '#####', '#####', '#####', '#####', '#####', '#####', '#####']);
const CROWN = [
  bits(['.###.', '#####', '#####', '#####', '#####', '#####', '#####', '#####']),
  bits(['..##.', '.####', '#####', '#####', '#####', '#####', '#####', '#####']),
];
const WILDTOP = [
  bits(['##.#.', '#####', '###.#', '#####', '#####', '#.###', '#####', '#####']),
  bits(['.##.#', '#####', '#.###', '#####', '#####', '###.#', '#####', '#####']),
];
// Overgrown: a solid mass with a ragged crown that never matches a clipped
// one, so a half-grown digit can never read as a different, clean numeral.
const SHAG = [
  bits(['##.#.', '#####', '###.#', '#####', '#####', '#.###', '#####', '#####']),
  bits(['.##.#', '#####', '#.###', '#####', '#####', '###.#', '#####', '#####']),
];
const wild = (r, ph) => (r === 0 ? SHAG[ph] : SOLID);
const leaf = (r, ph) => (r === 0 ? CROWN[ph] : SOLID);
// Part masks: bars cut square, like a freshly clipped hedge.
const MASK = {
  L: SOLID,
  T: bits(['#####', '#####', '#####', '.....', '.....', '.....', '.....', '.....']),
  B: bits(['.....', '.....', '.....', '.....', '.....', '#####', '#####', '#####']),
  M: bits(['#####', '#####', '#####', '.....', '.....', '.....', '#####', '#####']),
  G: bits(['.....', '.....', '.....', '.....', '.....', '.....', '#####', '#####']),
  ' ': EMPTY,
};
const part = (p, ph, r) => and(leaf(r, ph), MASK[p]);

// Each digit as [top row, bottom row] of [left, centre, right] parts.
const DIG = {
  0: ['LTL', 'LBL'], 1: [' L ', ' L '], 2: ['MML', 'LBB'], 3: ['MML', 'BBL'],
  4: ['LGL', '  L'], 5: ['LMM', 'BBL'], 6: ['LMM', 'LBL'], 7: ['TTL', '  L'],
  8: ['LML', 'LBL'], 9: ['LML', 'BBL'],
};
const DCOL = [0, 4, 9, 13];      // first column of each digit
const HOME = 7;                  // the gardener's spot, between hours and minutes

// Growth stages: a fraction of the missing leaves comes in, seeded per stage.
const growMask = (k, seed) => Array.from({ length: 8 }, (_, r) => {
  let m = 0; for (let i = 0; i < 5; i++) if (rnd(seed + r * 5 + i, 3) < k / 3) m |= 0x10 >> i; return m;
});
const GROW = [null,
  bits(['.....', '.....', '.....', '.....', '..#..', '#.#.#', '#####', '#####']),
  bits(['.....', '..#..', '#.#.#', '#####', '#####', '#####', '#####', '#####'])];
// A growing top cell loses its clipped crown at once, so it never passes
// through the picture of another clipped part.
const grow = (p, k, ph, r) => {
  if (k >= 3) return wild(r, ph);
  const g = or(part(p, ph, r), and(wild(r, ph), GROW[k]));
  if (r === 0) g[0] = SHAG[ph][0];
  return g;
};
// Cutting: the wild block loses the leaves that do not belong, from the top down.
const CUT = [null, bits(['.....', '.....', '.....', '.....', '#####', '#####', '#####', '#####'])];
const cut = (p, k, ph, r) => (k === 0 ? wild(r, ph) : k >= 2 ? part(p, ph, r) : or(part(p, ph, r), and(wild(r, ph), CUT[1])));

// Sprouts reaching out of the hedge on the right into a gap (two stages).
const SPROUT = [
  null,
  bits(['.....', '.....', '...##', '....#', '.....', '.....', '..###', '.....']),
  bits(['##...', '.##..', '..###', '....#', '.....', '##...', '.####', '.....']),
];

// The gardener, facing right. Straw hat, huge shears.
const G = {
  stand: ['.###.', '#####', '..##.', '.###.', '#.##.', '..##.', '.#.#.', '.#.#.'],
  idle:  ['.###.', '#####', '..##.', '.###.', '.###.', '#.##.', '.#.#.', '.#.#.'],
  step:  ['.###.', '#####', '..##.', '.###.', '.###.', '..##.', '.#..#', '#...#'],
  snipO: ['.###.', '#####', '..##.', '.####', '.##.#', '.##..', '.#.#.', '.#.#.'],
  snipC: ['.###.', '#####', '..##.', '.####', '.##..', '.##..', '.#.#.', '.#.#.'],
  up:    ['.###.', '#####', '..##.', '.###.', '..##.', '..##.', '.#.#.', '.#.#.'],
  hat:   ['##...', '.###.', '..##.', '.###.', '.###.', '..##.', '.#.#.', '.#.#.'],
  front: ['.###.', '#####', '.#.#.', '.....', '#####', '.###.', '.#.#.', '.#.#.'],
  proud: ['.###.', '#####', '.#.#.', '.....', '#.#.#', '.###.', '.#.#.', '#...#'],
  shock: ['#####', '.###.', '.#.#.', '..#..', '#.#.#', '.###.', '.#.#.', '.#.#.'],
  trim0: ['.###.', '#####', '..##.', '.###.', '.####', '..###', '.#.#.', '.#.#.'],
  trim1: ['.###.', '#####', '..##.', '.###.', '.####', '..##.', '.#.##', '.#.#.'],
  sleep: ['.....', '.###.', '#####', '.....', '.###.', '#####', '.###.', '.#.#.'],
};
const GR = {}, GL = {};
for (const [k, r] of Object.entries(G)) { GR[k] = bits(r); GL[k] = GR[k].map(rev); }
const gard = (pose, dir) => (dir < 0 ? GL : GR)[pose];

// Blades above his head while he cuts a top cell.
const BLADE = {
  open: bits(['.....', '.....', '.....', '.....', '#...#', '.#.#.', '.#.#.', '..#..']),
  shut: bits(['.....', '.....', '.....', '.....', '..#..', '..#..', '..#..', '..#..']),
  buzz0: bits(['.....', '.....', '.#.#.', '.###.', '.#.#.', '.###.', '.#.#.', '..#..']),
  buzz1: bits(['.....', '.....', '#.#..', '.###.', '..#.#', '.###.', '#.#..', '..#..']),
};

// The sparrow, facing right; and the topiary rabbit (5x16, leaf textured).
const BIRD = {
  sit:  bits(['.....', '.....', '.....', '..##.', '.####', '###..', '.#...', '.....']),
  look: bits(['.....', '.....', '.....', '.##..', '####.', '..###', '...#.', '.....']),
  peek: bits(['.....', '.....', '.....', '.....', '...##', '....#', '.....', '.....']),
  hop:  bits(['.....', '..##.', '.####', '###..', '.#...', '.....', '.....', '.....']),
};
const RAB_T = [
  bits(['.#.#.', '.#.#.', '.#.#.', '.#.#.', '.###.', '#####', '##.##', '#####']),
  bits(['.#..#', '.#.#.', '.#.#.', '.#.#.', '.###.', '#####', '##.##', '#####']),
];
const RAB_B = [
  bits(['.###.', '#####', '#####', '#####', '#####', '#####', '#####', '#.#.#']),
  bits(['.###.', '#####', '#####', '#####', '#####', '#####', '####.', '.#.#.']),
];
const ROUGH = bits(['.###.', '#####', '#####', '#####', '#####', '#####', '#####', '#####']);

// ------------------------------------------------------------------ time

const value = (kit, ms) => { const f = kit.clockFields(new Date(ms)); return f.hh + f.mm; };

// The gardener's moves as segments of local time u (seconds from the event).
class Script {
  constructor(col, dir, t) { this.s = []; this.col = col; this.dir = dir; this.t = t; }
  hold(d, pose, extra = {}) { this.s.push({ t0: this.t, t1: this.t + d, col: this.col, dir: this.dir, pose, ...extra }); this.t += d; return this; }
  walk(to, dt = 0.32) {
    if (to === this.col) return this;
    this.dir = Math.sign(to - this.col);
    while (this.col !== to) { this.col += this.dir; this.hold(dt / 2, 'step'); this.hold(dt / 2, 'stand'); }
    return this;
  }
  face(d) { this.dir = d; return this; }
  at(u) {
    for (const g of this.s) if (u >= g.t0 && u < g.t1) return { ...g, pose: typeof g.pose === 'function' ? g.pose(u - g.t0) : g.pose };
    return null;
  }
}

// Idle fidgets at home: mostly standing, clacking the shears, a glance round.
function idlePose(T) {
  const k = Math.floor(T / 0.9), n = rnd(k, 5);
  if (n < 0.18) return { pose: Math.floor(T / 0.3) % 2 ? 'snipO' : 'snipC', dir: 1 };
  if (n < 0.3) return { pose: 'front', dir: 1 };
  if (n < 0.45) return { pose: 'stand', dir: -1 };
  return { pose: k % 2 ? 'stand' : 'idle', dir: 1 };
}

// ------------------------------------------------------------------ the face

export default {
  name: 'Topiary',
  blurb: 'The time is four clipped hedges; each minute the one that changes grows wild and the gardener clips the new numeral out of it, and on the hour he trims a jungle and carves a rabbit that hops away.',
  bus: 'i2c100',
  panel: 'green',
  fps: 10,

  frame(lcd, api, { fields, date, kit }) {
    const ms = date.getTime();
    const sec = fields.s + fields.ms / 1000;
    const mStart = ms - sec * 1000;
    const T = ms / 1000;
    const pre = sec >= 45;                       // heading for the next minute
    const B = pre ? mStart + 60000 : mStart;     // the minute boundary we are around
    const u = pre ? sec - 60 : sec;              // seconds from it
    const vOld = value(kit, B - 60000), vNew = value(kit, B);
    const D = [0, 1, 2, 3].filter((i) => vOld[i] !== vNew[i]);
    const hour = vNew.slice(2) === '00';
    const mId = Math.round(mStart / 60000);

    // ---- the wind: a gust every so often shifts the leaves for a moment
    const gk = Math.floor(T / 11), gt = T - gk * 11 - 3 - rnd(gk, 1) * 5;
    const gust = gt >= 0 && gt < 1.6;
    const ph = gust && Math.floor(gt / 0.4) % 2 === 0 ? 1 : 0;

    // ---- cells: { b: bitmap | null, rom, pri, alt: [fallback bitmaps] }
    const grid = [[], []];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 16; c++) grid[r][c] = { b: null, rom: 0x20 };
    const setPart = (c, r, p, b) => { grid[r][c] = { b: p === ' ' && !b ? null : b ?? part(p, ph, r), pri: 10, alt: [] }; };

    // the time at rest
    const shown = u < 0 ? vOld : vNew;
    for (let i = 0; i < 4; i++) for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) setPart(DCOL[i] + k, r, DIG[shown[i]][r][k]);

    let g = null;                    // the gardener {col, dir, pose}
    let blade = null;                // a blade sprite over the top cell above him
    let mark = null;                 // ROM over his head ('!' or '?')
    const extra = [];                // sprites: {c, r, b, base, pri}
    const script = new Script(HOME, 1, 0);

    if (D.length && !hour && u > -9.5 && u < 12) {
      // ================================================ the minute turn
      const first = DCOL[D[0]];
      const sc = first - 1;
      // the growth: every non-leaf cell of the changing digits, one at a time
      const cells = [];
      for (const i of D) for (let k = 0; k < 3; k++) for (let r = 0; r < 2; r++) {
        const p = DIG[vOld[i]][r][k];
        if (p !== 'L' || r === 0) cells.push({ c: DCOL[i] + k, r, p });
      }
      cells.sort((a, b) => a.r - b.r);           // the crowns go shaggy first
      const G0 = -0.3 - 0.4 * cells.length;
      const gaps = [sc]; if (D.includes(2)) gaps.push(12);
      // the cutting pass, column by column, from the gap where he waits
      const cols = []; let t = 0;
      for (let c = sc; c <= 15; c++) {
        const gap = gaps.includes(c);
        cols.push({ c, t0: t, t1: t + (gap ? 0.5 : 0.8), gap });
        t += gap ? 0.5 : 0.8;
      }
      const tEnd = t;

      script.t = -9;
      script.walk(sc).face(1);
      script.hold(G0 - 1.6 - script.t, (lt) => (Math.floor(lt / 0.8) % 3 === 2 ? 'idle' : 'stand'));
      script.hold(0.8, 'up', { mark: 0x21 });                         // a shoot: !
      script.hold(-1.0 - script.t, (lt) => (Math.floor(lt / 0.6) % 2 ? 'stand' : 'up'));
      script.hold(1.0, (lt) => (lt < 0.5 ? 'snipO' : 'snipC'));       // ready
      for (const k of cols) {
        script.col = k.c;
        script.hold(k.t1 - k.t0, (lt) => (Math.floor(lt / 0.27) % 2 ? 'snipC' : 'snipO'), { cutting: k });
      }
      script.hold(0.4, 'front');
      script.walk(HOME, 0.3);

      if (u < 0) {
        cells.forEach((cl, j) => {
          const s = G0 + 0.4 * j;
          if (u < s) return;
          const k = u >= s + 0.4 ? 3 : u >= s + 0.2 ? 2 : 1;
          grid[cl.r][cl.c] = { b: grow(cl.p, k, ph, cl.r), pri: k >= 3 ? 10 : 7, alt: [part(cl.p, ph, cl.r)] };
        });
        const sk = u >= G0 - 0.6 ? 2 : u >= G0 - 1.2 ? 1 : 0;
        if (sk) for (const c of gaps) for (let r = 0; r < 2; r++) grid[r][c] = { b: SPROUT[sk], pri: 4, alt: [] };
      } else {
        // wild until cut; the cut columns show the new digit
        for (const k of cols) {
          if (u >= k.t1) continue;
          const inCut = u >= k.t0;
          for (let r = 0; r < 2; r++) {
            if (k.gap) { grid[r][k.c] = { b: inCut && u - k.t0 > 0.25 ? null : SPROUT[2], pri: 4, alt: [] }; continue; }
            const i = DCOL.findLastIndex((d) => d <= k.c);
            const p = DIG[vNew[i]][r][k.c - DCOL[i]];
            const stage = inCut ? (u - k.t0 < 0.27 ? 0 : u - k.t0 < 0.54 ? 1 : 2) : 0;
            const b = cut(p, stage, ph, r);
            grid[r][k.c] = { b: p === ' ' && stage === 2 ? null : b, pri: stage === 0 ? 10 : 8, alt: [wild(r, ph)] };
          }
        }
      }
      const s = script.at(u);
      if (s) {
        g = s; mark = s.mark ?? null;
        if (s.cutting && !s.cutting.gap) blade = Math.floor((u - s.cutting.t0) / 0.27) % 2 ? BLADE.shut : BLADE.open;
        if (s.cutting && s.cutting.gap && u - s.cutting.t0 < 0.25) blade = BLADE.open;
      }
      if (u > tEnd + 3) g = null;
    }

    if (hour && u > -10.5 && u < 20) {
      // ================================================ the hour show
      const P = [];                         // pass columns
      let t = 0;
      for (let c = 0; c <= 15; c++) {
        const skip = c === 7 || c === 8;
        P.push({ c, t0: t, t1: t + (skip ? 0.25 : 0.4), skip });
        t += skip ? 0.25 : 0.4;
      }
      const tPass = t;
      script.t = -10;
      script.walk(0, 0.28).face(1);
      script.hold(-7.0 - script.t, 'stand');
      script.hold(-1.2 - -7.0, (lt) => (Math.floor(lt / 0.3) % 2 ? 'trim0' : 'trim1'));
      script.hold(1.2, (lt) => (Math.floor(lt / 0.2) % 2 ? 'trim0' : 'trim1'));
      for (const k of P) { script.col = k.c; script.hold(k.t1 - k.t0, (lt) => (Math.floor(lt / 0.2) % 2 ? 'trim0' : 'trim1'), { cutting: k }); }
      script.hold(0.6, 'front');
      script.walk(7, 0.3);                            // back to the block
      const tCarve = script.t;
      script.face(1).hold(1.6, (lt) => (Math.floor(lt / 0.27) % 2 ? 'snipC' : 'snipO'), { carve: true });
      script.hold(1.4, 'proud');
      const tAlive = script.t;
      script.hold(0.9, 'proud');
      script.hold(2.6, 'shock', { mark: 0x21 });
      script.hold(1.8, 'front', { mark: 0x3f });

      const jungle = (u) => (u >= -1.0 ? 3 : u >= -2.0 ? 2 : u >= -3.0 ? 1 : 0);
      if (u < 0) {
        const k = jungle(u);
        if (k) for (let r = 0; r < 2; r++) for (let c = 0; c < 16; c++) {
          const i = DCOL.findLastIndex((d) => d <= c);
          const off = c - DCOL[i];
          const p = off < 3 ? DIG[vOld[i]][r][off] : ' ';
          grid[r][c] = { b: grow(p, k, ph, r), pri: 10, alt: [] };
        }
      } else {
        for (const k of P) for (let r = 0; r < 2; r++) {
          const c = k.c;
          const i = DCOL.findLastIndex((d) => d <= c);
          const off = c - DCOL[i];
          const p = off < 3 ? DIG[vNew[i]][r][off] : ' ';
          if (k.skip) {                          // the block between hours and minutes
            if (u < tCarve) grid[r][c] = { b: wild(r, ph), pri: 10, alt: [] };
            continue;
          }
          if (u >= k.t1) continue;
          const stage = u < k.t0 ? 0 : u - k.t0 < 0.2 ? 1 : 2;
          grid[r][c] = { b: p === ' ' && stage === 2 ? null : cut(p, stage, ph, r), pri: stage ? 8 : 10, alt: [wild(r, ph)] };
        }
        // the carving: col 7 cut away, col 8 becomes a rabbit
        if (u >= tCarve && u < tAlive + 0.9) {
          const lt = u - tCarve;
          const st = lt < 0.5 ? 0 : lt < 1.1 ? 1 : 2;
          grid[0][8] = { b: st === 0 ? wild(0, ph) : st === 1 ? ROUGH : RAB_T[0], pri: 8, alt: [] };
          grid[1][8] = { b: st < 2 ? SOLID : RAB_B[0], pri: 8, alt: [] };
          for (let r = 0; r < 2; r++) grid[r][7] = lt < 0.8 ? { b: lt < 0.4 ? wild(r, ph) : and(wild(r, ph), CUT[1]), pri: 8, alt: [] } : { b: null, rom: 0x20 };
        }
        // it comes alive: an ear twitch, then away it hops to the right
        if (u >= tAlive + 0.9) {
          const lt = u - tAlive - 0.9;
          const hops = Math.floor(lt / 0.4);
          const col = 8 + Math.max(0, hops - 1);
          const air = hops >= 1 && (lt % 0.4) < 0.2;
          if (col <= 15) {
            const top = lt < 0.4 ? RAB_T[1] : RAB_T[0];
            const lift = (b, n) => b.slice(n).concat(Array(n).fill(0));
            let tb = top, bb = RAB_B[air ? 1 : 0];
            if (air) { const all = lift(tb.concat(bb), 2); tb = all.slice(0, 8); bb = all.slice(8); }
            extra.push({ c: col, r: 0, b: tb, pri: 8, halo: true });
            extra.push({ c: col, r: 1, b: bb, pri: 8, halo: true });
          }
        }
      }
      const s = script.at(u);
      if (s) {
        g = s; mark = s.mark ?? null;
        if (s.cutting && !s.cutting.skip) blade = Math.floor(u / 0.2) % 2 ? BLADE.buzz0 : BLADE.buzz1;
        if (s.carve) blade = Math.floor(u / 0.27) % 2 ? BLADE.shut : BLADE.open;
      }
    }

    // ================================================ idle life
    const idleFrom = 9, idleTo = pre ? -9.5 : 99;
    const idle = !g && (D.length === 0 || (!pre && u >= (hour ? 20 : 9)) || (pre && u < idleTo));
    if (!g) {
      g = { col: HOME, ...idlePose(T) };
      if (gust) g = { col: HOME, dir: 1, pose: 'hat' };
    }
    const night = fields.h >= 23 || fields.h < 6;
    if (idle && night && g.col === HOME) g = { col: HOME, dir: 1, pose: 'sleep' };
    if (idle && night && g.col === HOME && Math.floor(T / 1.5) % 3 === 0) grid[0][HOME] = { b: null, rom: 0x7a };

    if (idle && !night) {
      // a stray twig, spotted and snipped
      const tw0 = 13 + rnd(mId, 2) * 8;
      const tsec = pre ? sec : u;
      const lt = tsec - tw0;
      if (lt >= 0 && lt < 9 && rnd(mId, 3) < 0.8) {
        const opts = [[3, 1], [3, 0], [12, 1], [12, 0], [8, 0]];
        const [tc, tr] = opts[Math.floor(rnd(mId, 4) * opts.length)];
        // the hedge it grows from is on its right
        const tw = [
          bits(['.....', '.....', '.....', '.....', '....#', '.....', '.....', '.....']),
          bits(['.....', '.....', '.....', '...##', '....#', '.....', '.....', '.....']),
          bits(['.....', '.....', '.#...', '..###', '....#', '.....', '.....', '.....']),
        ];
        const away = 3.2 + Math.abs(tc - HOME) * 0.32;
        const ts = new Script(HOME, 1, 2.2);
        ts.hold(0.8, 'up', { mark: 0x21 }).walk(tc).face(1).hold(1.0, (l) => (l < 0.35 ? 'snipO' : l < 0.6 ? 'snipC' : 'stand'), { snip: true }).walk(HOME);
        const k = lt < 0.7 ? 0 : lt < 1.4 ? 1 : 2;
        const snipped = lt >= away + 0.45;
        if (!snipped) extra.push({ c: tc, r: tr, b: tw[k], pri: 5 });
        else if (lt < away + 1.1 && tr === 0) extra.push({ c: tc, r: 1, b: null, rom: 0x2c });   // the clipping falls
        const s = ts.at(lt);
        if (s) {
          g = s; mark = s.mark ?? null;
          if (s.snip && tr === 0 && lt < away + 0.45) blade = lt - away < 0.35 ? BLADE.open : BLADE.shut;
        }
      }
      // the sparrow pops out of a hedge, sits on his hat, dives back
      const b0 = 30 + rnd(mId, 6) * 8;
      const lb = tsec - b0;
      if (lb >= 0 && lb < 5.2 && rnd(mId, 7) < 0.7 && g.col === HOME && !mark) {
        // it lives in the hours' last column and comes out into col 7, top row
        const pose = lb < 0.6 ? BIRD.peek.map(rev) : lb < 1.0 ? BIRD.hop.map(rev) : lb < 4.4
          ? (Math.floor(lb / 0.7) % 3 === 1 ? BIRD.look : BIRD.sit).map(Math.floor(lb / 1.4) % 2 ? (v) => v : rev)
          : lb < 4.8 ? BIRD.hop : BIRD.peek;
        // sitting on the hat: the bird's feet on the cell's bottom row
        extra.push({ c: 7, r: 0, b: pose, pri: 5 });
        if (lb >= 1.0 && lb < 4.4) g = { col: HOME, dir: 1, pose: 'up' };
      }
    }

    // ---- compose sprites
    for (const e of extra) {
      if (e.b === null) { grid[e.r][e.c] = { b: null, rom: e.rom ?? 0x20 }; continue; }
      const under = grid[e.r][e.c].b ?? EMPTY;
      // behind: the hedge wins, the sprite shows only through its gaps and counters
      const b = e.behind ? or(under, and(e.b, dilate(under).map((v) => ~v & 0x1f))) : e.halo ? over(under, e.b) : or(under, e.b);
      grid[e.r][e.c] = { b, pri: e.pri, alt: [under] };
    }
    if (g && g.col >= 0 && g.col < 16) {
      const under = grid[1][g.col].b ?? EMPTY;
      grid[1][g.col] = { b: over(under, gard(g.pose, g.dir)), pri: 9, alt: [] };
      if (blade) {
        const above = grid[0][g.col].b ?? EMPTY;
        grid[0][g.col] = { b: over(above, blade), pri: 8, alt: [above] };
      } else if (mark && !grid[0][g.col].b) grid[0][g.col] = { b: null, rom: mark };
    }

    // ---- allocate by priority, fall back to what was under
    const alloc = new TileAllocator(lcd, 0);
    const order = [];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 16; c++) if (grid[r][c].b) order.push([r, c]);
    order.sort((a, b) => (grid[b[0]][b[1]].pri ?? 0) - (grid[a[0]][a[1]].pri ?? 0));
    const codes = [Array(16).fill(0x20), Array(16).fill(0x20)];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 16; c++) if (!grid[r][c].b) codes[r][c] = grid[r][c].rom ?? 0x20;
    for (const [r, c] of order) {
      const cell = grid[r][c];
      const enc = (b) => (b.every((v) => v === 0x1f) ? 0xff : b.some((v) => v) ? alloc.add(b.map(str)) : 0x20);
      let code = enc(cell.b);
      for (const a of cell.alt ?? []) { if (code != null) break; code = enc(a); }
      codes[r][c] = code ?? 0x20;
    }
    alloc.flush();
    codes.forEach((row, r) => { lcd.setCursor(0, r); row.forEach((c) => lcd.data(c)); });
  },
};
