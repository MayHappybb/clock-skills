// Voxel Triplet: a floating voxel island, rendered in real 3D (orthographic
// camera, z-buffer, sun shadow map) on the 128 x 128 HUB75 square.
//
// The hours are a brick monument on the mesa (left), the minutes a brick
// monument on the harbour plaza (right), with a bay in front and one behind.
// The numerals are laid in running bond: courses may shift half a brick, so
// curves and diagonals step by half a block (voxel-glyphs.js).
//
// Minute turn: the bricks the new digit doesn't share hop off in arcs and
// land, bottom course first, where the new digit needs them; spare bricks
// dive into the bay with a splash, missing ones drop in from the sky.
//
// Hour turn, the trick: the camera sinks to eye level, face-on. Out of
// sight, each monument becomes the INTERSECTION of the old number extruded
// one way and the new number extruded at right angles (Hofstadter's GEB
// "trip-let"): seen face-on it is still exactly the old time. The island
// then turns 90 degrees, and the very same blocks read the new time from
// the side. Fireworks, and the camera climbs back up. The island turns back
// and forth, so the time is written on the island's south faces one hour
// and its west faces the next.
//
// Everything is a pure function of the wall clock: sun, shadows, windows
// (they light one by one at dusk), boats, gulls, windmill, lighthouse.
import * as kit from '../js/kit.js';
import { Engine, STRIDE } from './voxel-engine.js';
import { courses } from './voxel-glyphs.js';

const SS = 2;                            // supersampling per axis
const RD = 16.5;                         // island disc radius, in bricks
const C = 6;                             // hours stand at (C, C), minutes at (-C, -C)
const MZ = 4, PZ = 1, ZB = -5, BAYZ = -2;
const PHI = 0.5;                        // rest pitch (rad)
const TH = [0.36, Math.PI / 2 - 0.36];   // rest yaw for facing A (south faces) / B (west faces)
const FACE = [0, Math.PI / 2];           // face-on yaw for A / B
const SCALE = 3.95;                      // px per brick at 1x
const GROUND = 0, WATER = 1, WCUT = 2, BRICK = 3, EMIT = 4, WALL = 5;

const hx = kit.hex;
const PAL = {
  grass: hx('#5c9a3a'), grassSide: hx('#5a7a34'), soil: hx('#7a5634'), dirt: hx('#654630'), stone: hx('#55504c'),
  sand: hx('#d6c48e'), plaza: hx('#4d5566'), plaza2: hx('#434a5a'), rock: hx('#8a7a68'),
  shallow: hx('#2a8fa8'), deep: hx('#14507c'), cut: hx('#2a7fb0'),
  hour: hx('#e25a3a'), minute: hx("#ffc43c"),
  trunk: hx('#6b4a2e'), leaf: hx('#3d7a33'), leaf2: hx('#5d9a3a'),
  wall: hx('#e6dcc6'), roof: hx('#4a5a76'), white: hx('#eeeee6'), red: hx('#c43c2c'), dark: hx('#2c2c32'),
  sail: hx('#e8e2d0'), hull: hx('#f0ece0'), hull2: hx('#2f5d8a'),
};
const WIN = [1.0, 0.58, 0.2];
const EXPO = 0.25 * 2.2;                 // 2x2 box average times the exposure gain
const pad = (n) => String(n).padStart(2, '0');
const strs = (d) => [pad(d.getHours()), pad(d.getMinutes())];
const serialOf = (d) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 3600000);
const parity = (n) => ((n % 2) + 2) % 2;
// ------------------------------------------------------------ the island
// Quadrants: NW a mesa (hours), SE a paved plaza (minutes), so that seen
// face-on from the south AND from the west the hours stand left of the
// minutes. SW (in front) and NE (behind) are bays.
// The lighthouse stands at the island's centre: in every view it falls in
// the one-brick gap between the hours and the minutes, so it is the colon.
const LH = [0, 0], ISLE = [10.6, 11.2];            // ISLE: a wooded islet in the back bay
const NC = 34, O = 17;
const cell = (i, j) => (i < -O || j < -O || i >= O || j >= O ? -1 : (j + O) * NC + i + O);
function terrain() {
  const H = new Float32Array(NC * NC).fill(NaN), K = new Uint8Array(NC * NC);   // K: 1 grass 2 sand 3 plaza 4 water 5 rock
  for (let j = -O; j < O; j++) for (let i = -O; i < O; i++) {
    const x = i + 0.5, y = j + 0.5;
    if (Math.hypot(x, y) > RD) continue;
    let h, k;
    if (x < 0 && y > 0 && x > -12 && y < 12) { h = MZ; k = 1; }                        // NW mesa: hours
    else if (x > 0 && y < 0 && x < 12 && y > -12) { h = PZ; k = 3; }                   // SE plaza: minutes
    else if (x < 0 && y > 0) { h = 2 + (kit.hash(i, j, 3) > 0.5 ? 1 : 0); k = 1; }     // hills round the mesa
    else if (x > 0 && y < 0) { h = PZ; k = Math.hypot(x, y) > RD - 1.3 ? 2 : 1; }      // lawns round the plaza
    else {
      const isl = Math.hypot(x - ISLE[0], y - ISLE[1]);
      if (x > 0 && isl < 1.6) { h = 2; k = 5; }
      else if (x > 0 && isl < 2.7) { h = 1; k = 1; }
      else if (x > 0 ? y < 2.2 + 0.6 * kit.hash(i, j, 7) || x < 1.6 : y > -1.6 - 0.6 * kit.hash(i, j, 7) || x > -2.2) { h = 1; k = 2; }
      else { h = BAYZ; k = 4; }
    }
    H[cell(i, j)] = h; K[cell(i, j)] = k;
  }
  return { H, K };
}
/** Water cells far enough from land to swallow a brick, for each bay. */
function seaCells(T) {
  const out = [[], []];
  for (let j = -O; j < O; j++) for (let i = -O; i < O; i++) {
    const c = cell(i, j);
    if (T.K[c] !== 4) continue;
    let ok = true;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const n = cell(i + di, j + dj); if (n >= 0 && T.K[n] && T.K[n] !== 4) ok = false; }
    if (ok) out[i + 0.5 > 0 ? 0 : 1].push([i + 0.5, j + 0.5]);   // 0 = back (NE) bay, 1 = front (SW) bay
  }
  return out;
}
const vary = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
/** Static faces: ground tops with corner occlusion, cliff and cut faces by strata, water. */
function buildTerrain(E, T) {
  const { H, K } = T;
  const top = (i, j) => { const c = cell(i, j); return c < 0 || K[c] === 0 ? -99 : K[c] === 4 ? 0 : H[c]; };
  const solid = (i, j) => { const c = cell(i, j); return c < 0 || K[c] === 0 ? ZB : H[c]; };
  for (let j = -O; j < O; j++) for (let i = -O; i < O; i++) {
    const c = cell(i, j), k = K[c];
    if (!k) continue;
    const h = H[c], n = 0.92 + 0.16 * kit.hash(i, j, 11);
    if (k === 4) {
      // water colour by distance to the shore: shallow turquoise to deep blue
      let d = 9;
      for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) { const m = cell(i + di, j + dj); if (m >= 0 && K[m] && K[m] !== 4) d = Math.min(d, Math.hypot(di, dj)); }
      const w = kit.mix(PAL.shallow, PAL.deep, kit.smoothstep(1, 3.5, d));
      E.quad(i, j, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, WATER, w[0], w[1], w[2], 1, 1, 1, 1, d);
    } else {
      const base = k === 1 ? PAL.grass : k === 2 ? PAL.sand : k === 3 ? ((i + j) & 1 ? PAL.plaza : PAL.plaza2) : PAL.rock;
      const ao = (dx, dy) => {
        const s1 = top(i + dx, j) > h, s2 = top(i, j + dy) > h, cc = top(i + dx, j + dy) > h;
        return 1 - 0.17 * (s1 && s2 ? 3 : s1 + s2 + cc);
      };
      const col = vary(base, n);
      E.quad(i, j, h, 1, 0, 0, 0, 1, 0, 0, 0, 1, GROUND, col[0], col[1], col[2], ao(-1, -1), ao(1, -1), ao(-1, 1), ao(1, 1), 0);
    }
    // sides, one brick-high face per stratum
    const sides = [[-1, 0, i, j + 1, 0, -1, -1, 0], [1, 0, i + 1, j, 0, 1, 1, 0], [0, -1, i, j, 1, 0, 0, -1], [0, 1, i + 1, j + 1, -1, 0, 0, 1]];
    for (const [di, dj, ox, oy, ax, ay, nx, ny] of sides) {
      const nc = cell(i + di, j + dj), outside = nc < 0 || !K[nc];
      if (k === 4 && !outside) continue;
      const nh = outside ? ZB : K[nc] === 4 ? 0 : solid(i + di, j + dj);
      const ht = k === 4 ? 0 : h;
      for (let z = Math.floor(nh); z < ht; z++) {
        if (k === 4 && z >= BAYZ) {
          const g = 0.75 + 0.25 * (z - BAYZ) / -BAYZ;
          E.quad(ox, oy, z, ax, ay, 0, 0, 0, 1, nx, ny, 0, WCUT, PAL.cut[0] * g, PAL.cut[1] * g, PAL.cut[2] * g, 1, 1, 1, 1, 0);
          continue;
        }
        const zt = k === 4 ? BAYZ : h;
        let s = z >= zt - 1 ? (k === 1 ? PAL.grassSide : k === 2 ? PAL.sand : k === 3 ? PAL.plaza2 : PAL.rock) : z >= -2 ? PAL.soil : z >= -3 ? PAL.dirt : PAL.stone;
        s = vary(s, (0.9 + 0.2 * kit.hash(i * 7 + di, j * 5 + dj, z + 40)) * (z === Math.floor(nh) && !outside ? 0.8 : 1));
        E.quad(ox, oy, z, ax, ay, 0, 0, 0, 1, nx, ny, 0, GROUND, s[0], s[1], s[2], 1, 1, 1, 1, 0);
      }
    }
  }
}
function tree(E, x, y, z, s) {
  E.box(x - 0.14, y - 0.14, z, 0.28, 0.28, 0.7 * s, GROUND, ...PAL.trunk);
  const l = kit.mix(PAL.leaf, PAL.leaf2, kit.hash(x * 9, y * 9, 1));
  E.box(x - 0.55 * s, y - 0.55 * s, z + 0.55 * s, 1.1 * s, 1.1 * s, 0.9 * s, GROUND, ...l);
  E.box(x - 0.33 * s, y - 0.33 * s, z + 1.45 * s, 0.66 * s, 0.66 * s, 0.45 * s, GROUND, ...vary(l, 1.12));
}
function house(E, x, y, z, w, d, hgt, p) {
  E.box(x - w / 2, y - d / 2, z, w, d, hgt, WALL, ...PAL.wall, p);
  E.box(x - w / 2 - 0.12, y - d / 2 - 0.12, z + hgt, w + 0.24, d + 0.24, 0.3, GROUND, ...PAL.roof);
  E.box(x - w / 2 + 0.2, y - d / 2 + 0.2, z + hgt + 0.3, w - 0.4, d - 0.4, 0.3, GROUND, ...vary(PAL.roof, 0.85));
  E.box(x + w / 4, y - 0.15, z + hgt + 0.3, 0.3, 0.3, 0.55, GROUND, ...PAL.red);
}
function buildObjects(E, T) {
  // trees on the hills round the mesa and on the islets
  for (let j = -O; j < O; j++) for (let i = -O; i < O; i++) {
    const c = cell(i, j), x = i + 0.5, y = j + 0.5;
    if (T.K[c] !== 1) continue;
    // only where no tree can stand between the camera and a number in either face-on view
    const hills = x < 0 && y > 12;
    const islet = T.H[c] === 1 && x > 0 && y > 0 && Math.hypot(x - ISLE[0], y - ISLE[1]) < 3;
    if ((hills && kit.hash(i, j, 21) > 0.3) || (islet && kit.hash(i, j, 22) > 0.55)) {
      tree(E, x + 0.3 * (kit.hash(i, j, 23) - 0.5), y + 0.3 * (kit.hash(i, j, 24) - 0.5), T.H[c], 0.8 + 0.35 * kit.hash(i, j, 25));
    }
  }
  // two cottages on the wooded islet (anything taller behind the plaza would cross the minutes)
  [[ISLE[0] - 1.2, ISLE[1] - 0.6], [ISLE[0] + 0.4, ISLE[1] - 1.4]].forEach(([p, q], n) => house(E, p, q, 1, 1.4, 1.2, 1.0, 10 + n));
  // lighthouse: red and white courses tapering up; the lantern is drawn per frame
  for (let z = 0; z < 7; z++) {
    const w = 1.0 - 0.03 * z, c = z & 1 ? PAL.red : PAL.white;
    E.box(-w / 2, -w / 2, 1 + z, w, w, 1, GROUND, ...c);
  }
  E.box(-0.55, -0.55, 8, 1.1, 1.1, 0.15, GROUND, ...PAL.dark);
  E.box(-0.45, -0.45, 8.85, 0.9, 0.9, 0.3, GROUND, ...PAL.red);
  E.box(-0.2, -0.2, 9.15, 0.4, 0.4, 0.25, GROUND, ...PAL.dark);
}
// ------------------------------------------------------------ the monuments
// A brick is (k, j): half-column k (0..21 across the two digits), course j
// (0 = top). Facing A writes the number along +x on a south-facing slab,
// facing B along -y on a west-facing one; a trip-let takes x from one
// number and y from the other, course by course.
const MON = [{ cx: -C, cy: C, z0: MZ, col: PAL.hour }, { cx: C, cy: -C, z0: PZ, col: PAL.minute }];
function slabPos(m, F, k, j, out) {
  out[2] = m.z0 + 8 - j;
  if (F === 0) { out[0] = m.cx - 5.5 + k / 2; out[1] = m.cy - 0.5; }
  else { out[0] = m.cx - 0.5; out[1] = m.cy + 4.5 - k / 2; }
  return out;
}
/** Thin slab: Float32Array of brick corners [x, y, z, id] */
const slabCache = new Map();
function slab(mi, str, F) {
  const key = mi + str + F;
  if (slabCache.has(key)) return slabCache.get(key);
  const m = MON[mi], cs = courses(str), out = [], p = [0, 0, 0];
  cs.forEach((row, j) => row.forEach((k) => { slabPos(m, F, k, j, p); out.push(p[0], p[1], p[2], F === 0 ? k * 16 + j : k * 512 + j); }));
  const a = new Float32Array(out);
  slabCache.set(key, a);
  return a;
}
/** The trip-let: course j holds a brick at (x of every A brick) x (y of every B brick). */
function triplet(mi, strA, strB) {
  const key = 't' + mi + strA + strB;
  if (slabCache.has(key)) return slabCache.get(key);
  const m = MON[mi], ca = courses(strA), cb = courses(strB), out = [];
  for (let j = 0; j < 9; j++) for (const ka of ca[j]) for (const kb of cb[j]) out.push(m.cx - 5.5 + ka / 2, m.cy + 4.5 - kb / 2, m.z0 + 8 - j, ka * 16 + j + kb * 512);
  const a = new Float32Array(out);
  slabCache.set(key, a);
  return a;
}
/**
 * The minute turn as a plan: bricks both digits share stay; the old digit's
 * others leave top course first (all within 0.6 s), the new digit's arrive
 * bottom course first (from 0.85 s on), so the slab only ever holds part of
 * the old number or part of the new one. Hops pair a leaving brick with an
 * arriving one; spares dive into the nearer bay; shortfalls drop from the sky.
 */
const planCache = new Map();
function minutePlan(oldS, newS, F, sea) {
  const key = oldS + newS + F;
  if (planCache.has(key)) return planCache.get(key);
  const m = MON[1], co = courses(oldS), cn = courses(newS), stat = [], mov = [], p = [0, 0, 0], q = [0, 0, 0];
  const id = (k, j) => (F === 0 ? k * 16 + j : k * 512 + j);
  for (let slot = 0; slot < 2; slot++) {
    const lo = slot * 12, hi = lo + 10, inSlot = (k) => k >= lo && k < hi;
    const dep = [], arr = [];
    for (let j = 0; j < 9; j++) {
      const o = co[j].filter(inSlot), n = cn[j].filter(inSlot);
      for (const k of o) (oldS[slot] === newS[slot] || n.includes(k) ? stat : dep).push([k, j]);
      if (oldS[slot] !== newS[slot]) for (const k of n) if (!o.includes(k)) arr.push([k, j]);
    }
    if (!dep.length && !arr.length) continue;
    arr.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    const dly = slot === 0 && oldS[1] !== newS[1] ? 0.15 : 0;
    const td = (i) => dly + 0.05 + 0.5 * (dep.length > 1 ? i / (dep.length - 1) : 0);
    const ta = (i) => dly + 0.9 + 0.75 * (arr.length > 1 ? i / (arr.length - 1) : 0);
    const n = Math.max(dep.length, arr.length);
    for (let i = 0; i < n; i++) {
      if (i < dep.length) slabPos(m, F, dep[i][0], dep[i][1], p);
      if (i < arr.length) slabPos(m, F, arr[i][0], arr[i][1], q);
      if (i < dep.length && i < arr.length) mov.push({ a: [...p], b: [...q], t0: td(i), t1: ta(i), type: 0, id: id(...arr[i]) });
      else if (i < dep.length) {
        // nearer bay: the left digit's spares go to the front bay, the right one's to the back
        const bay = sea[dep[i][0] < 11 ? 1 : 0];
        const w = bay[Math.floor(kit.hash(dep[i][0], dep[i][1], 5) * bay.length)];
        mov.push({ a: [...p], b: [w[0] - 0.5, w[1] - 0.5, -1.3], t0: td(i), t1: td(i) + 0.95, type: 1, id: id(...dep[i]) });
      } else mov.push({ a: [q[0], q[1], q[2] + 26], b: [...q], t0: ta(i) - 0.8, t1: ta(i), type: 2, id: id(...arr[i]) });
    }
  }
  const stA = new Float32Array(stat.length * 4);
  stat.forEach(([k, j], n) => { slabPos(m, F, k, j, p); stA.set([p[0], p[1], p[2], id(k, j)], 4 * n); });
  const plan = { stat: stA, mov };
  planCache.set(key, plan);
  return plan;
}
// ------------------------------------------------------------ light
const norm3 = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
const SUN_LO = kit.blackbody(2100), SUN_HI = kit.mix(kit.blackbody(5600), [1, 1, 1], 0.2), MOON = [0.5, 0.62, 1];
/** Sun east at 6, south at noon, west at 18; the moon takes over at night. */
function lighting(hf) {
  const a = Math.PI * (hf - 6) / 12, sz = Math.sin(a);
  const el = Math.asin(kit.clamp(0.85 * sz, -1, 1));
  const sun = norm3(Math.cos(a) * Math.cos(el), -Math.sin(a) * Math.cos(el), Math.sin(el));
  const ma = a - Math.PI, moon = norm3(Math.cos(ma) * 0.75, -Math.sin(ma) * 0.75 - 0.2, 0.7);
  const day = sz >= 0;
  const I = day ? kit.smoothstep(-0.02, 0.28, sz) : 0.5 * kit.smoothstep(0.02, 0.3, -sz);
  const lc = day ? kit.mix(SUN_LO, SUN_HI, kit.smoothstep(0.05, 0.55, sz)) : MOON;
  const AMB_DAY = [0.36, 0.4, 0.48], AMB_DUSK = [0.26, 0.17, 0.24], AMB_NIGHT = [0.07, 0.085, 0.16];
  const amb = sz > 0.1 ? kit.mix(AMB_DUSK, AMB_DAY, kit.smoothstep(0.1, 0.45, sz)) : kit.mix(AMB_NIGHT, AMB_DUSK, kit.smoothstep(-0.25, 0.1, sz));
  return { L: day ? sun : moon, col: kit.scale(lc, I), amb, lamps: 1 - kit.smoothstep(-0.08, 0.2, sz), stars: 1 - kit.smoothstep(-0.3, 0.05, sz) };
}
// ------------------------------------------------------------ the clock
const E_IO = kit.ease.inOut;
const SEQ = { down0: -1.9, down1: -0.3, swap1: -0.12, rot0: 0.05, rot1: 2.85, swap2: 3.0, up0: 3.15, up1: 4.9 };
const ZC_REST = 2.2, ZC_EYE = 4.3;
/** What the clock shows at `date`: camera, the two monuments, the minute plan, the hour show's clock. */
function scene(date, sea) {
  const serial = serialOf(date);
  const secH = date.getMinutes() * 60 + date.getSeconds() + date.getMilliseconds() / 1000;
  const S = { th: 0, ph: PHI, zc: ZC_REST, sc: SCALE, mons: [null, null], plan: null, pt: 0, fade: 0, show: null, dw: 1 };
  let sh = null;
  if (secH >= 3600 + SEQ.down0) sh = { tt: secH - 3600, s: serial + 1 };
  else if (secH < SEQ.up1 + 0.2) sh = { tt: secH, s: serial };
  if (sh) {
    const tt = sh.tt, T0 = date.getTime() - tt * 1000;
    const o = strs(new Date(T0 - 30000)), n = strs(new Date(T0 + 30000));
    const Fo = parity(sh.s - 1), Fn = parity(sh.s);
    if (tt < SEQ.rot0) {
      const k = E_IO(kit.clamp((tt - SEQ.down0) / (SEQ.down1 - SEQ.down0)));
      S.th = kit.lerp(TH[Fo], FACE[Fo], k); S.ph = kit.lerp(PHI, 0, k); S.zc = kit.lerp(ZC_REST, ZC_EYE, k); S.sc = SCALE * (1 + 0.12 * k); S.dw = 1 - k;
    } else if (tt < SEQ.up0) {
      const k = E_IO(kit.clamp((tt - SEQ.rot0) / (SEQ.rot1 - SEQ.rot0)));
      S.th = kit.lerp(FACE[Fo], FACE[Fn], k); S.ph = 0; S.zc = ZC_EYE; S.sc = SCALE * 1.12; S.dw = 0;
    } else {
      const k = E_IO(kit.clamp((tt - SEQ.up0) / (SEQ.up1 - SEQ.up0)));
      S.th = kit.lerp(FACE[Fn], TH[Fn], k); S.ph = kit.lerp(0, PHI, k); S.zc = kit.lerp(ZC_EYE, ZC_REST, k); S.sc = SCALE * (1 + 0.12 * (1 - k)); S.dw = k;
    }
    for (let mi = 0; mi < 2; mi++) {
      if (tt < SEQ.swap1) S.mons[mi] = { b: slab(mi, o[mi], Fo), F: Fo };
      else if (tt < SEQ.swap2) S.mons[mi] = { b: Fo === 0 ? triplet(mi, o[mi], n[mi]) : triplet(mi, n[mi], o[mi]), F: -1 };
      else S.mons[mi] = { b: slab(mi, n[mi], Fn), F: Fn };
    }
    S.facing = tt < SEQ.swap1 ? Fo : tt < SEQ.swap2 ? -1 : Fn;
    S.fade = kit.smoothstep(SEQ.down0, SEQ.down1, tt) * (1 - kit.smoothstep(SEQ.swap2, SEQ.up1, tt));
    S.show = tt;
  } else {
    const F = parity(serial), cur = strs(date), sec = date.getSeconds() + date.getMilliseconds() / 1000;
    S.th = TH[F]; S.facing = F;
    S.mons[0] = { b: slab(0, cur[0], F), F };
    const old = strs(new Date(date.getTime() - (sec + 30) * 1000));
    if (sec < 2.2 && old[1] !== cur[1]) { S.plan = minutePlan(old[1], cur[1], F, sea); S.pt = sec; S.planF = F; }
    else S.mons[1] = { b: slab(1, cur[1], F), F };
  }
  return S;
}
// ------------------------------------------------------------ drawing the moving parts
const ROT = new Float32Array(9), I3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
function rot(ax, ay, az, ang) {
  const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
  ROT[0] = t * ax * ax + c; ROT[1] = t * ax * ay - s * az; ROT[2] = t * ax * az + s * ay;
  ROT[3] = t * ax * ay + s * az; ROT[4] = t * ay * ay + c; ROT[5] = t * ay * az - s * ax;
  ROT[6] = t * ax * az - s * ay; ROT[7] = t * ay * az + s * ax; ROT[8] = t * az * az + c;
  return ROT;
}
const brickCol = (m) => m.col;   // per-brick tint is applied in shading, keyed by the face's place in its number
function drawBricks(E, m, b) {
  for (let n = 0; n < b.length; n += 4) { const c = brickCol(m, b[n + 3]); E.box(b[n], b[n + 1], b[n + 2], 1, 1, 1, BRICK, c[0], c[1], c[2], b[n + 3]); }
}
const G_ARC = 18;
/** The minute plan at plan time pt: static bricks, flyers, and the splashes they leave. */
function drawPlan(E, plan, pt, ripples) {
  const m = MON[1];
  drawBricks(E, m, plan.stat);
  for (const v of plan.mov) {
    const c = brickCol(m, v.id), T = v.t1 - v.t0;
    if (pt < v.t0) { if (v.type !== 2) E.box(v.a[0], v.a[1], v.a[2], 1, 1, 1, BRICK, c[0], c[1], c[2], v.id); continue; }
    if (pt >= v.t1) {
      if (v.type === 1) { if (pt - v.t1 < 1.6) ripples.push(v.b[0] + 0.5, v.b[1] + 0.5, pt - v.t1); continue; }
      const q = (pt - v.t1) / 0.24, bz = q < 1 ? 0.22 * Math.sin(Math.PI * q) * (v.type === 2 ? 1.5 : 1) : 0;
      E.box(v.b[0], v.b[1], v.b[2] + bz, 1, 1, 1, BRICK, c[0], c[1], c[2], v.id);
      continue;
    }
    const k = (pt - v.t0) / T;
    let x, y, z, R = I3;
    if (v.type === 2) { x = v.b[0]; y = v.b[1]; z = v.a[2] + (v.b[2] - v.a[2]) * k * k; }
    else {
      x = kit.lerp(v.a[0], v.b[0], k); y = kit.lerp(v.a[1], v.b[1], k);
      z = kit.lerp(v.a[2], v.b[2], k) + 0.5 * G_ARC * T * T * k * (1 - k);
      const dx = v.b[0] - v.a[0], dy = v.b[1] - v.a[1], l = Math.hypot(dx, dy) || 1;
      R = rot(-dy / l, dx / l, 0, (Math.PI / 2) * (T > 1.1 ? 2 : 1) * k);
    }
    E.cube(x + 0.5, y + 0.5, z + 0.5, 0.5, R, BRICK, c[0], c[1], c[2], v.id);
  }
}
/** A box of half-sizes (hx, hy, hz) centred at (x, y, z), turned by heading (ca, sa) about z. Bottom skipped. */
function obox(E, x, y, z, hx, hy, hz, ca, sa, mat, c, p = 0) {
  const ex = ca * hx, ey = sa * hx, fx = -sa * hy, fy = ca * hy;
  E.quad(x - ex - fx, y - ey - fy, z + hz, 2 * ex, 2 * ey, 0, 2 * fx, 2 * fy, 0, 0, 0, 1, mat, c[0], c[1], c[2], 1, 1, 1, 1, p);
  E.quad(x + ex - fx, y + ey - fy, z - hz, 2 * fx, 2 * fy, 0, 0, 0, 2 * hz, ca, sa, 0, mat, c[0], c[1], c[2], 1, 1, 1, 1, p);
  E.quad(x - ex - fx, y - ey - fy, z - hz, 2 * fx, 2 * fy, 0, 0, 0, 2 * hz, -ca, -sa, 0, mat, c[0], c[1], c[2], 1, 1, 1, 1, p);
  E.quad(x - ex + fx, y - ey + fy, z - hz, 2 * ex, 2 * ey, 0, 0, 0, 2 * hz, -sa, ca, 0, mat, c[0], c[1], c[2], 1, 1, 1, 1, p);
  E.quad(x - ex - fx, y - ey - fy, z - hz, 2 * ex, 2 * ey, 0, 0, 0, 2 * hz, sa, -ca, 0, mat, c[0], c[1], c[2], 1, 1, 1, 1, p);
}
const BOATS = [[-6.6, -6.6, 2.9, 2.5, 47, 0], [-7.0, -6.2, 1.7, 1.9, -31, 1.7], [6.2, 6.2, 2.4, 2.2, -53, 3.1]];
function drawLife(E, t, L) {
  // boats: two in the front (SW) bay, one in the back, sailing loops
  BOATS.forEach(([cx, cy, rx, ry, per, ph], n) => {
    const a = ph + (t / per) * kit.TAU, s = Math.sign(per);
    let x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a), vx = -rx * Math.sin(a) * s, vy = ry * Math.cos(a) * s;
    const l = Math.hypot(vx, vy), ca = vx / l, sa = vy / l, bob = 0.04 * Math.sin(t * 2.1 + n);
    obox(E, x, y, 0.15 + bob, 0.75, 0.3, 0.2, ca, sa, GROUND, n === 1 ? PAL.hull2 : PAL.hull);
    obox(E, x - 0.15 * ca, y - 0.15 * sa, 0.5 + bob, 0.28, 0.2, 0.15, ca, sa, n === 1 ? GROUND : WALL, n === 1 ? PAL.white : PAL.red, 40 + n);
    E.box(x + 0.55 * ca - 0.06, y + 0.55 * sa - 0.06, 0.35 + bob, 0.12, 0.12, 0.12, EMIT, ...kit.scale([1, 0.85, 0.6], 0.15 + 1.4 * L.lamps));
  });
  // the lighthouse lantern
  // the lighthouse lantern: the colon. It flashes on every second, day and night
  const sec = ((t % 60) + 60) % 60, fl = Math.exp(-4 * (sec - Math.floor(sec)));
  const lit = 0.12 + 0.9 * L.lamps + (0.35 + 0.8 * L.lamps) * fl;
  E.box(-0.32, -0.32, 8.15, 0.64, 0.64, 0.7, EMIT, ...kit.scale([1, 0.8, 0.45], lit));
  // gulls wheeling over the bays, wings flapping
  for (let g = 0; g < 3; g++) {
    const a = t * (0.32 + 0.05 * g) + g * 2.1, ccx = g === 1 ? 6 : -6, ccy = g === 1 ? 6 : -6;
    const x = ccx + 4.2 * Math.cos(a), y = ccy + 3.4 * Math.sin(a), z = 9.5 + g * 1.1 + 0.4 * Math.sin(a * 2);
    const vx = -Math.sin(a), vy = Math.cos(a), l = Math.hypot(vx, vy), fx = vx / l, fy = vy / l;
    const flap = 0.35 * Math.sin(t * 9 + g * 3), sx = -fy * 0.55, sy = fx * 0.55;
    for (const side of [1, -1]) {
      const tx = sx * side, ty = sy * side, tz = flap;
      E.quad(x - 0.12 * fx, y - 0.12 * fy, z, tx, ty, tz, 0.24 * fx, 0.24 * fy, 0, 0, 0, 1, GROUND, ...PAL.white);
      E.quad(x - 0.12 * fx, y - 0.12 * fy, z, tx, ty, tz, 0.24 * fx, 0.24 * fy, 0, 0, 0, -1, GROUND, ...vary(PAL.white, 0.6));
    }
  }
}
// ------------------------------------------------------------ shading
let WORLD = null;
function world() {
  if (WORLD) return WORLD;
  const E = new Engine(128 * SS, 128 * SS, 16000, 176, 21), T = terrain();
  buildTerrain(E, T); buildObjects(E, T);
  WORLD = { E, T, sea: seaCells(T), nStatic: E.n, FA: new Float32Array(16000), FD: new Float32Array(16000), HS: new Float32Array(1024) };
  for (let i = 0; i < 1024; i++) WORLD.HS[i] = kit.hash(i, 91);
  return WORLD;
}
const seedOf = (id, ny) => (ny > 0.5 || ny < -0.5 ? id & 511 : (id >> 9) * 16 + (id & 15));
function shade(Wd, L, t, S, ripples) {
  const E = Wd.E, F = E.F, M = E.M, nf = E.n, FA = Wd.FA, FD = Wd.FD, HS = Wd.HS;
  const Lx = L.L[0], Ly = L.L[1], Lz = L.L[2], sr = L.col[0], sg = L.col[1], sb = L.col[2], ar = L.amb[0], ag = L.amb[1], ab = L.amb[2];
  for (let f = 0; f < nf; f++) {
    const k = f * STRIDE, nz = F[k + 11];
    FA[f] = 0.68 + 0.32 * nz;
    const d = F[k + 9] * Lx + F[k + 10] * Ly + nz * Lz;
    FD[f] = d > 0 ? d : 0;
  }
  const cd = E.cam.d, fid = E.fid, U = E.U, V = E.V, col = E.col, N = E.N, lamps = L.lamps, fade = S.fade;
  const ba = -0.75 * Math.PI - (((t % 60) + 60) % 60) * kit.TAU / 60;   // the beam sweeps once a minute: a seconds hand
  const bc = Math.cos(ba), bs = Math.sin(ba), beam = lamps * 0.5, nr = ripples.length;
  const P = SHP;
  P.t = t; P.lamps = lamps; P.Lx = Lx; P.Ly = Ly; P.Lz = Lz; P.sr = sr; P.sg = sg; P.sb = sb; P.cd = cd; P.rip = ripples; P.HS = HS; P.facing = S.facing;
  for (let p = 0; p < N; p++) {
    const f = fid[p], p3 = 3 * p;
    if (f < 0) { col[p3] = 0; col[p3 + 1] = 0; col[p3 + 2] = 0; continue; }
    const k = f * STRIDE, u = U[p], v = V[p], m = M[f];
    if (m === EMIT) { col[p3] = F[k + 12]; col[p3 + 1] = F[k + 13]; col[p3 + 2] = F[k + 14]; continue; }
    const wx = F[k] + u * F[k + 3] + v * F[k + 6], wy = F[k + 1] + u * F[k + 4] + v * F[k + 7], wz = F[k + 2] + u * F[k + 5] + v * F[k + 8];
    const nz = F[k + 11];
    const ao = (F[k + 15] * (1 - u) + F[k + 16] * u) * (1 - v) + (F[k + 17] * (1 - u) + F[k + 18] * u) * v;
    let sh = FD[f] > 0 ? E.lit(wx + F[k + 9] * 0.08, wy + F[k + 10] * 0.08, wz + nz * 0.08) : 0;
    if (m === BRICK) sh += (1 - sh) * fade;
    const a = FA[f] * ao, dsh = FD[f] * sh * (0.6 + 0.4 * ao);
    col[p3] = F[k + 12] * (ar * a + sr * dsh); col[p3 + 1] = F[k + 13] * (ag * a + sg * dsh); col[p3 + 2] = F[k + 14] * (ab * a + sb * dsh);
    if (m === BRICK) brickTex(col, p3, F, k, u, v, P);
    else if (m === WALL) wallTex(col, p3, F, k, f, u, v, P);
    else if (m === WATER) waterTex(col, p3, wx, wy, sh, P);
    if (beam > 0 && nz > 0.5) beamAt(col, p, wx - LH[0], wy - LH[1], bc, bs, beam);
  }
}
const SHP = {};
/** Brick: mortar joints, per-brick tint, and a window (dark glass by day, lit at night). */
function brickTex(col, p3, F, k, u, v, P) {
  const ny = F[k + 10], nz = F[k + 11], seed = seedOf(F[k + 19], ny), HS = P.HS;
  const e = Math.min(Math.min(u, 1 - u), Math.min(v, 1 - v));
  let mul = (0.55 + 0.45 * kit.smoothstep(0.03, 0.14, e)) * (0.88 + 0.24 * HS[seed & 1023]);
  // the number is read off the faces that face the camera: they are glazed and bright,
  // the tops and the slab's ends are bare clay and darker
  const front = P.facing < 0 || (P.facing === 0 ? ny > 0.5 || ny < -0.5 : F[k + 9] > 0.5 || F[k + 9] < -0.5);
  mul *= nz > 0.5 ? 0.7 : front ? 1.3 : 0.6;
  // at dusk the windows light one by one; a lit brick's whole face glows a little
  const h = HS[(seed * 7 + 3) & 1023] * 0.85, on = nz < 0.5 && nz > -0.5 ? kit.smoothstep(h, h + 0.1, P.lamps) : 0;
  let gl = on * (front ? 0.07 : 0.03);
  if (on > 0 && Math.abs(u - 0.5) < 0.2 && Math.abs(v - 0.5) < 0.22) { mul *= 1 - 0.45 * on; gl += on * 0.55; }
  const er = WIN[0] * gl, eg = WIN[1] * gl, eb = WIN[2] * gl;
  col[p3] = col[p3] * mul + er; col[p3 + 1] = col[p3 + 1] * mul + eg; col[p3 + 2] = col[p3 + 2] * mul + eb;
}
function wallTex(col, p3, F, k, f, u, v, P) {
  const nz = F[k + 11], fu = u * 2 - Math.floor(u * 2);
  if (!(nz < 0.5 && nz > -0.5 && Math.abs(fu - 0.5) < 0.22 && v > 0.3 && v < 0.68)) return;
  const h = P.HS[(F[k + 19] * 13 + (f & 63)) & 1023] * 0.8, on = kit.smoothstep(h, h + 0.1, P.lamps) * 0.6;
  col[p3] = col[p3] * 0.42 + WIN[0] * on; col[p3 + 1] = col[p3 + 1] * 0.45 + WIN[1] * on; col[p3 + 2] = col[p3 + 2] * 0.55 + WIN[2] * on;
}
const COS = new Float32Array(2048), CK = 2048 / kit.TAU;
for (let i = 0; i < 2048; i++) COS[i] = Math.cos(i / CK);
/** Water: ripples tilt the normal, so the sun (or moon) glints where the reflection lines up; splash rings. */
function waterTex(col, p3, wx, wy, sh, P) {
  const t = P.t, cd = P.cd;
  const tt = t % 6283.185307179586, C = COS;   // table cosines: the phase stays small, the lookup is cheap
  const s1 = C[((1.9 * wx + 1.3 * tt) * CK) & 2047], s2 = C[((1.6 * wy - 1.1 * tt + 1) * CK) & 2047];
  const s3 = C[((1.2 * (wx + wy) + 0.8 * tt + 2) * CK) & 2047], s4 = C[((2.7 * wx - 2.2 * wy - 1.7 * tt) * CK) & 2047];
  const gx = 0.11 * (1.9 * s1 + 1.2 * s3 + 2.7 * s4), gy = 0.11 * (1.6 * s2 + 1.2 * s3 - 2.2 * s4);
  const il = 1 / Math.sqrt(gx * gx + gy * gy + 1), wnx = -gx * il, wny = -gy * il, wnz = il;
  const dn = cd[0] * wnx + cd[1] * wny + cd[2] * wnz;
  let sp = (cd[0] - 2 * dn * wnx) * P.Lx + (cd[1] - 2 * dn * wny) * P.Ly + (cd[2] - 2 * dn * wnz) * P.Lz;
  sp = sp > 0.9 ? (sp - 0.9) * (sp - 0.9) * (sp - 0.9) * 1400 * sh : 0;
  const shim = 0.85 + 0.15 * (s1 * s2);
  let r = col[p3] * shim + P.sr * sp, g = col[p3 + 1] * shim + P.sg * sp, b = col[p3 + 2] * shim + P.sb * sp;
  const R = P.rip;
  for (let q = 0; q < R.length; q += 3) {
    const age = R[q + 2], dx = wx - R[q], dy = wy - R[q + 1], dd = Math.sqrt(dx * dx + dy * dy), rad = 0.3 + 2.4 * Math.sqrt(age);
    const x = (dd - rad) / 0.22, w = Math.exp(-x * x) * (1 - age / 1.6) * 0.35 + (age < 0.3 && dd < 0.7 ? 0.6 * (1 - age / 0.3) : 0);
    r += w * 0.8; g += w * 0.9; b += w;
  }
  col[p3] = r; col[p3 + 1] = g; col[p3 + 2] = b;
}
/** The lighthouse beam sweeping the ground and water (kept out of the hot loop: V8 optimises it badly inline). */
function beamAt(col, p, dx, dy, bc, bs, beam) {
  const al = dx * bc + dy * bs;
  if (al <= 0) return;
  const pe = Math.abs(dy * bc - dx * bs), w = 0.25 + al * 0.13;
  if (pe >= w) return;
  const i = beam * (1 - pe / w) * Math.exp(-al / 12);
  col[3 * p] += i; col[3 * p + 1] += i * 0.85; col[3 * p + 2] += i * 0.6;
}
// ------------------------------------------------------------ light in the air
const FW = [[1, 0.68, 0.28], [1, 0.32, 0.18], [0.35, 0.9, 1], [1, 0.95, 0.85], [0.75, 1, 0.4]];
const P3 = [0, 0, 0];
function glow(ctx, G, x, y, c, a) {
  const xi = Math.floor(x - 0.5), yi = Math.floor(y - 0.5), fx = x - 0.5 - xi, fy = y - 0.5 - yi, o = ctx.out;
  for (let q = 0; q < 4; q++) {
    const X = xi + (q & 1), Y = yi + (q >> 1);
    if (X < 0 || Y < 0 || X >= G.w || Y >= G.h) continue;
    const w = a * ((q & 1) ? fx : 1 - fx) * ((q >> 1) ? fy : 1 - fy), i = G.idx[Y * G.w + X];
    if (i >= 0) { o[3 * i] += c[0] * w; o[3 * i + 1] += c[1] * w; o[3 * i + 2] += c[2] * w; }
  }
}
/** A point of light in the world, hidden when something solid stands in front of it. */
function spark(ctx, G, E, x, y, z, c, a) {
  E.project(x, y, z, P3);
  const sx = Math.floor(P3[0]), sy = Math.floor(P3[1]);
  if (sx < 0 || sy < 0 || sx >= E.W || sy >= E.H || E.zb[sy * E.W + sx] < P3[2] - 0.3) return;
  glow(ctx, G, P3[0] / SS, P3[1] / SS, c, a * 2.1);   // x2.1: the same exposure as the scene
}
function fireworks(ctx, G, E, tt, dim) {
  for (let i = 0; i < 9; i++) {
    const tb = 0.15 + i * 0.48, tau = tt - tb, h = (n) => kit.hash(i, n, 333);
    const cx = -9 + 18 * h(1), cy = -9 + 18 * h(2), cz = 13 + 4 * h(3), c = FW[Math.floor(h(4) * FW.length)];
    if (tau < -0.5 || tau > 1.5) continue;
    if (tau < 0) {                                   // the rocket climbing
      const k = 1 + tau / 0.5;
      for (let s = 0; s < 4; s++) spark(ctx, G, E, cx, cy, cz * (k - s * 0.04) ** 0.7, [1, 0.8, 0.5], 0.5 * dim * (1 - s / 4));
      continue;
    }
    const life = (1 - tau / 1.5) ** 1.6;
    for (let n = 0; n < 34; n++) {
      const u = kit.hash(i, n, 7) * 2 - 1, ph = kit.hash(i, n, 8) * kit.TAU, rr = Math.sqrt(1 - u * u), sp = 3.6 + 0.8 * kit.hash(i, n, 9);
      const dx = rr * Math.cos(ph), dy = rr * Math.sin(ph), dz = u, tw = 0.75 + 0.25 * Math.sin(tt * 40 + n);
      for (let s = 0; s < 3; s++) {
        const ts = Math.max(0, tau - s * 0.06), e = sp * (1 - Math.exp(-2.6 * ts)) / 2.6 * 2.6 / 1.6;
        spark(ctx, G, E, cx + dx * e, cy + dy * e, cz + dz * e - 1.4 * ts * ts, c, dim * life * tw * (s ? 0.35 / s : 0.9));
      }
    }
  }
}

export default {
  name: 'Voxel Triplet',
  blurb: 'a floating brick island; each hour it turns 90 degrees and the same carved blocks spell the new time',
  layouts: ['hub-2x2'], look: 'smoke', fps: 60, brightness: 0.19, dither: false,
  frame(ctx) {
    const Wd = world(), E = Wd.E, G = kit.grid(ctx), date = ctx.date;
    const t = date.getTime() / 1000 - 1699999980;   // a multiple of 60: t % 60 is the wall clock's seconds
    const hf = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
    const L = lighting(hf), S = scene(date, Wd.sea), ripples = [];
    E.reset(Wd.nStatic);
    for (let mi = 0; mi < 2; mi++) if (S.mons[mi]) drawBricks(E, MON[mi], S.mons[mi].b);
    if (S.plan) drawPlan(E, S.plan, S.pt, ripples);
    drawLife(E, t, L);
    // the island floats: the camera drifts round it a little, always (but not during the hour show's face-on views)
    const dth = S.dw * (0.075 * Math.sin(t * kit.TAU / 41) + 0.025 * Math.sin(t * kit.TAU / 17 + 1));
    const dph = S.dw * 0.035 * Math.sin(t * kit.TAU / 29 + 2), bob = 0.18 * Math.sin(t * kit.TAU / 11);
    E.setCamera(S.th + dth, S.ph + dph, S.sc * SS, 0, 0, S.zc - bob);
    E.shadows(L.L[0], L.L[1], L.L[2]);
    E.clear(); E.raster();
    shade(Wd, L, t, S, ripples);
    const dim = 1 - 0.5 * ctx.night, o = ctx.out, cb = E.col, BW = E.W;
    for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
      const i = G.idx[y * G.w + x];
      if (i < 0) continue;
      const p = (2 * y) * BW + 2 * x, q = p + BW;
      let r = cb[3 * p] + cb[3 * p + 3] + cb[3 * q] + cb[3 * q + 3];
      let g = cb[3 * p + 1] + cb[3 * p + 4] + cb[3 * q + 1] + cb[3 * q + 4];
      let b = cb[3 * p + 2] + cb[3 * p + 5] + cb[3 * q + 2] + cb[3 * q + 5];
      if (L.stars > 0 && E.fid[p] < 0 && E.fid[q + 1] < 0 && Wd.HS[(x * 37 + y * 101) & 1023] < 0.03 && ((x * 7 + y * 13) & 3) === 0) {
        const s = L.stars * 0.05 * (0.7 + 0.3 * Math.sin(t * (1.3 + (x & 3)) + y));
        r += 4 * s * 0.9; g += 4 * s * 0.95; b += 4 * s;
      }
      // exposure: the scene is drawn hot and the panel dimmed by its OE pulse (brightness), which keeps
      // shadows and night out of the crushed bottom bit planes; a soft shoulder keeps glints from clipping
      r *= EXPO * dim; g *= EXPO * dim; b *= EXPO * dim;
      o[3 * i] = r < 0.75 ? r : 0.75 + (r - 0.75) / (1 + 4 * (r - 0.75));
      o[3 * i + 1] = g < 0.75 ? g : 0.75 + (g - 0.75) / (1 + 4 * (g - 0.75));
      o[3 * i + 2] = b < 0.75 ? b : 0.75 + (b - 0.75) / (1 + 4 * (b - 0.75));
    }
    
    if (S.show !== null && S.show > -0.4) fireworks(ctx, G, E, S.show, dim);
  },
};
