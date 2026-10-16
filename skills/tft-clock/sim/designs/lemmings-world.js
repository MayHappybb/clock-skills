// lemmings: the level. Terrain as a function of absolute time, the walkers'
// route over it, the walker simulation, and the minute's jobs (diggers,
// bombers, builders).
//
// Everything is a pure function of the absolute time T (seconds since the
// epoch). The terrain at T is minute m = floor(T / 60)'s numerals, each cell
// laid at a time (if it changed from minute m - 1) and each pixel removed at a
// time (if it changes in minute m + 1). A lemming is simulated from the moment
// it left the hatch, in fixed 1/30 s steps, against the terrain at each step,
// so the same T always gives the same crowd. On the device the same rules run
// incrementally, one step a frame.
import { rand, clockFields } from '../js/kit.js';
import { MASK, ROUTE, CW, CH, GW, GH, DW, DH } from './lemmings-glyphs.js';

export const W = 160, H = 80;

// ------------------------------------------------------------ layout

/** The four numerals: left edge and top. */
export const SLOTS = [{ x: 8, y: 14 }, { x: 36, y: 16 }, { x: 74, y: 20 }, { x: 102, y: 22 }];
/** The colon: two steel plates. */
export const STEEL = [{ x: 63, y: 29, w: 7, h: 6 }, { x: 63, y: 44, w: 7, h: 6 }];
export const HATCH = { x: 8, y: 0, w: 15, h: 7 };
export const EXIT = { x: 138, y: 56, w: 17, door: 146 };

/** Ground surface per column: terraces stepping down to the exit. */
export const GROUND = new Int16Array(W);
for (let x = 0; x < W; x++) GROUND[x] = x < 34 ? 56 : x < 62 ? 58 : x < 72 ? 60 : x < 100 ? 62 : x < 128 ? 64 : 70;

/** Static solid: ground and steel. */
export const SOLID0 = new Uint8Array(W * H);
for (let x = 0; x < W; x++) for (let y = GROUND[x]; y < H; y++) SOLID0[y * W + x] = 1;
for (const s of STEEL) for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) SOLID0[y * W + x] = 2;

// ------------------------------------------------------------ the minute's plan

const FIELDS = new Map();
export function fieldsOf(m) {
  let f = FIELDS.get(m);
  if (!f) {
    f = clockFields(new Date(m * 60000));
    FIELDS.set(m, f);
    if (FIELDS.size > 400) FIELDS.delete(FIELDS.keys().next().value);
  }
  return f;
}
const digitsOf = (m) => { const f = fieldsOf(m); return [f.hh[0], f.hh[1], f.mm[0], f.mm[1]]; };

export const BUILD_T0 = 0.5, DIG_V = 5.2, BUILD_V = 13;
export const ERASED = 59.5; // nothing of an old numeral survives past this

const LAYERS = new Map();
/**
 * Minute m's numerals and jobs. Per slot:
 *   d        the digit shown this minute
 *   born     Float32Array(GW*GH) second each cell is laid (-1: already there)
 *   dies     Float32Array(DW*DH) second each pixel goes (99: stays)
 *   jobs     diggers / bombers / builder for drawing
 */
export function layer(m) {
  let L = LAYERS.get(m);
  if (L) return L;
  const prev = digitsOf(m - 1), cur = digitsOf(m), next = digitsOf(m + 1);
  const f = fieldsOf(m);
  const hourEnd = f.m === 59;
  const slots = [];
  for (let s = 0; s < 4; s++) {
    const d = cur[s], mask = MASK[d];
    const born = new Float32Array(GW * GH).fill(-1);
    const dies = new Float32Array(DW * DH).fill(99);
    const sl = { d, born, dies, diggers: [], bombers: [], builder: null, changing: next[s] !== d, built: prev[s] !== d };
    // ---- built this minute: a builder lays the bricks along the numeral's route
    if (sl.built) {
      const r = ROUTE[d];
      const v = Math.max(BUILD_V, r.len / 10);
      const t0 = BUILD_T0 + s * 0.25;
      for (let i = 0; i < GW * GH; i++) if (mask[i]) born[i] = t0 + r.cellS[i] / v + 0.12;
      sl.builder = { t0, v, t1: t0 + r.len / v };
    }
    // ---- leaving this minute: dug out or blown up
    if (sl.changing) {
      const alive = (px, py) => mask[((py / CH) | 0) * GW + ((px / CW) | 0)] === 1;
      const method = hourEnd ? 'bomb' : rand(m, s, 11) < 0.55 ? 'dig' : 'bomb';
      if (method === 'dig') {
        for (let j = 0; j < 3; j++) {
          const x0 = j * 8, t0 = 50 + j * 0.35 + rand(m, s, j) * 0.3;
          const rows = new Float32Array(DH + 1);
          let t = t0;
          for (let py = 0; py < DH; py++) {
            rows[py] = t;
            let any = false;
            for (let px = x0; px < x0 + 8; px++) if (alive(px, py)) any = true;
            t += any ? 1 / DIG_V : 1 / 45;
            for (let px = x0; px < x0 + 8; px++) dies[py * DW + px] = Math.min(dies[py * DW + px], rows[py] + (any ? 0.5 / DIG_V : 0));
          }
          rows[DH] = t;
          sl.diggers.push({ x: x0 + 4, t0, t1: t, rows });
        }
      } else {
        // bombers stand on the highest point left and blow a crater; repeat until nothing is left
        const top = (px, t) => { for (let py = 0; py < DH; py++) if (alive(px, py) && dies[py * DW + px] > t) return py; return -1; };
        const cols = [4, 12, 20, 8, 16];
        let k = 0;
        for (let t = hourEnd ? 51.8 : 50.8; t < 58.8 && k < 16; t += hourEnd ? 0.6 : 0.75, k++) {
          let best = -1, by = DH;
          for (let c = 0; c < cols.length; c++) {
            const cx = cols[(c + k) % cols.length], y = top(cx, t);
            if (y >= 0 && y < by - 2) { by = y; best = cx; }
          }
          if (best < 0) {
            for (let px = 0; px < DW; px++) { const y = top(px, t); if (y >= 0 && y < by) { by = y; best = px; } }
          }
          if (best < 0) break;
          const cx = best, cy = by - 2, r = 10.5;
          for (let py = 0; py < DH; py++) for (let px = 0; px < DW; px++) {
            const dx = px + 0.5 - cx, dy = py + 0.5 - cy;
            if (dx * dx + dy * dy <= r * r && alive(px, py) && dies[py * DW + px] > t) dies[py * DW + px] = t;
          }
          sl.bombers.push({ x: cx, t, cy });
        }
        // whatever the last crater left crumbles with it
        const last = sl.bombers.length ? sl.bombers[sl.bombers.length - 1].t + 0.25 : 58;
        for (let i = 0; i < DW * DH; i++) if (dies[i] > last) dies[i] = last;
      }
      for (let i = 0; i < DW * DH; i++) if (dies[i] > ERASED) dies[i] = ERASED;
      sl.method = method;
    }
    slots.push(sl);
  }
  L = { m, f, slots, hourEnd, hourStart: f.m === 0 };
  LAYERS.set(m, L);
  if (LAYERS.size > 64) LAYERS.delete(LAYERS.keys().next().value);
  return L;
}

/** Is the numeral pixel (px, py) of slot s alive at second `sec` of layer L? */
export function aliveAt(L, s, px, py, sec) {
  const sl = L.slots[s];
  const ci = ((py / CH) | 0) * GW + ((px / CW) | 0);
  if (!MASK[sl.d][ci]) return false;
  return sl.born[ci] <= sec && sec < sl.dies[py * DW + px];
}

// ------------------------------------------------------------ the route

const PATHS = new Map();
/**
 * The walkers' route at absolute time T: p[x] the surface they walk on in
 * column x, and bridge[x] where a builder's stair carries them over a gap
 * (a rise too steep to walk and too broken to climb).
 */
export function pathAt(T) {
  const m = (T / 60) | 0, sec = T - m * 60;
  const still = sec >= 13 && sec < 46.5;
  const key = m * 1000 + (still ? 999 : (sec * 10) | 0);
  let P = PATHS.get(key);
  if (P) return P;
  const L = layer(m), qs = still ? 30 : ((sec * 10) | 0) / 10 + 0.05;
  const c = new Int16Array(W), solidCol = (x, y) => solidAt(L, x, y, qs);
  for (let x = 0; x < W; x++) {
    let top = GROUND[x];
    for (const st of STEEL) if (x >= st.x && x < st.x + st.w && st.y < top) top = st.y;
    for (let s = 0; s < 4; s++) {
      const S = SLOTS[s], px = x - S.x;
      if (px < 0 || px >= DW) continue;
      for (let py = 0; py < DH && S.y + py < top; py++) if (aliveAt(L, s, px, py, qs)) { top = S.y + py; break; }
    }
    c[x] = top;
  }
  const p = new Int16Array(W), bridge = new Uint8Array(W);
  p[W - 1] = c[W - 1];
  for (let x = W - 2; x >= 0; x--) {
    const nx = p[x + 1];
    if (c[x] <= nx + 3 || x < HATCH.x + 2) { p[x] = c[x]; continue; }
    let climb = true;
    for (let y = nx; y < c[x]; y++) if (!solidCol(x + 1, y)) { climb = false; break; }
    if (climb) p[x] = c[x];
    else { p[x] = nx + 1; bridge[x] = 1; }
  }
  P = { p, c, bridge };
  PATHS.set(key, P);
  if (PATHS.size > 2500) PATHS.delete(PATHS.keys().next().value);
  return P;
}

/** Any solid at (x, y) at second sec of layer L. */
export function solidAt(L, x, y, sec) {
  if (x < 0 || x >= W || y < 0 || y >= H) return false;
  if (SOLID0[y * W + x]) return true;
  for (let s = 0; s < 4; s++) {
    const S = SLOTS[s], px = x - S.x, py = y - S.y;
    if (px >= 0 && px < DW && py >= 0 && py < DH) return aliveAt(L, s, px, py, sec);
  }
  return false;
}

// ------------------------------------------------------------ walkers

export const DT = 1 / 30, LIFE = 40;
const V = 10, CLIMB_V = 7, G = 160, FALL_MAX = 60, FLOAT_V = 13, BROLLY_AT = 12;

/**
 * Who is out at T: [{ id, t0, x, y }] for every lemming released (or put to
 * work and since let go) in the last LIFE seconds, with its start.
 */
export function spawnsFor(T) {
  const out = [];
  const m0 = Math.floor((T - LIFE) / 60), m1 = Math.floor(T / 60);
  for (let m = m0; m <= m1; m++) {
    const base = m * 60, f = fieldsOf(m);
    const add = (id, sec, x, y) => { const t0 = base + sec; if (t0 <= T && t0 > T - LIFE) out.push({ id, t0, x, y }); };
    if (f.m === 0) for (let k = 0; k < 90; k++) add(m * 4096 + 2000 + k, 0.6 + k * 0.085, 10.5 + rand(m, k, 3) * 10, HATCH.h + 1);
    for (let k = 0; k < 133; k++) {
      const sec = 0.25 + k * 0.45;
      if (f.m === 0 && sec < 8.4) continue;
      if (f.m === 59 && sec > 51) continue;
      add(m * 4096 + k, sec, 12.5 + rand(m, k, 1) * 6, HATCH.h + 1);
    }
    // the minute's workers, when their job is done, walk on
    const L = layer(m);
    L.slots.forEach((sl, s) => {
      const S = SLOTS[s];
      sl.diggers.forEach((dg, j) => add(m * 4096 + 3000 + s * 8 + j, dg.t1, S.x + dg.x, S.y + DH));
      if (sl.builder) {
        const r = ROUTE[sl.d], e = r.pts[r.pts.length - 1];
        add(m * 4096 + 3100 + s, sl.builder.t1 + 0.2, S.x + e[0], S.y + e[1] - 2);
      }
    });
  }
  return out;
}

/** When a lemming is nuked (the hour's last minute), or Infinity. */
export function nukeAt(id, t0) {
  const m = Math.floor(t0 / 60);
  for (const mm of [m, m + 1]) {
    const f = fieldsOf(mm);
    if (f.m !== 59) continue;
    const start = mm * 60 + 51.5 + rand(id, 7) * 2.2;
    if (start + 5 > t0 + 0.5) return start;
  }
  return Infinity;
}

/**
 * Simulate one lemming from its release to T. Returns its state at T:
 *   { x, y, mode: 0 walk | 1 fall | 2 climb, brolly, age, gone, blast }
 * y is the surface row its feet stand on (feet pixel y - 1).
 */
export function simulate(sp, T) {
  let x = sp.x, y = sp.y, mode = 1, vy = 0, fy = y, brolly = false;
  const nuke = nukeAt(sp.id, sp.t0);
  const end = Math.min(T, nuke + 5);
  const n = ((end - sp.t0) / DT) | 0;
  let t = sp.t0;
  for (let k = 0; k < n; k++) {
    t = sp.t0 + (k + 1) * DT;
    const P = pathAt(t).p;
    let xi = x | 0;
    if (mode === 1) {
      vy = vy + G * DT;
      if (y - fy > BROLLY_AT) { brolly = true; if (vy > FLOAT_V) { vy -= 400 * DT; if (vy < FLOAT_V) vy = FLOAT_V; } }
      if (vy > FALL_MAX) vy = FALL_MAX;
      y += vy * DT;
      if (y >= P[xi]) { y = P[xi]; mode = 0; brolly = false; }
    } else if (mode === 2) {
      const tg = P[xi + 1];
      if (tg >= y - 3) { mode = 0; x = xi + 1.05; if (tg < y) y = tg; if (tg > y + 1) { mode = 1; vy = 0; fy = y; } }
      else { y -= CLIMB_V * DT; if (y <= tg) { y = tg; x = xi + 1.05; mode = 0; } }
    } else {
      if (P[xi] > y + 1) { mode = 1; vy = 0; fy = y; continue; }
      if (P[xi] < y) y = P[xi];
      const nx = x + V * DT, nxi = nx | 0;
      if (nxi !== xi && nxi < W) {
        const tg = P[nxi];
        if (tg < y - 3) { mode = 2; x = xi + 0.95; }
        else { x = nx; if (tg < y) y = tg; }
      } else x = nx;
    }
    if (x >= EXIT.door) return { gone: true };
  }
  const blast = nuke + 5 <= T ? nuke + 5 : 0;
  return { x, y, mode, brolly, age: T - sp.t0, gone: false, nuke, blast };
}
