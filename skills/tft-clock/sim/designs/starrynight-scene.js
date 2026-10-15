// Starry Night scene: the painting under the time, baked once at load.
//
// The whole picture is laid in as LANES: evenly spaced streamlines of a flow
// field (the wind of the sky, the contours of the hills, the planks of the
// walls, the rising flames of the cypress), each ~2.6 px wide. A pixel
// stores its lane, its arc position along it, and a colour class. At run
// time a lane is cut into 8 px dashes that slide along it, each dash one
// flat colour drawn from its class: that is the whole brushwork.
//
// Flash: sky/ground lane map (u16) + arc (u16) + class (u8) + region (u8)
// = 76.8 KB; the cypress layer 26 x 80 x 4 B = 8.3 KB; per-lane tables a
// few KB.

import { rand, hash } from '../js/kit.js';

export const W = 160, H = 80, N = W * H;
export const NOLANE = 0xffff;
const DSEP = 2.6, DTEST = 1.25, STEP = 0.5;

// ------------------------------------------------------------ layout

export const SLOTS = [[24, 3], [51, 3], [88, 27], [115, 27]];

/** Stars: centre, halo radius (rings at 2.5, 4.5, 6.5, 8.5 px), vortex strength. */
export const STARS = [
  { x: 101, y: 12, r: 8, g: 22 },
  { x: 124, y: 6, r: 6, g: -12 },
  { x: 153, y: 33, r: 7, g: -14 },
];
export const MOON = { x: 147, y: 12, r: 6.5, halo: 11, g: 26 };

/** The horizon: top of the hills, high under the hours, low under the minutes. */
export function hz(x) {
  const t = Math.min(1, Math.max(0, (x - 60) / 36)), sm = t * t * (3 - 2 * t);
  return 49 + 24 * sm + 2.2 * Math.sin(x * 0.12);
}

// houses: x, width, wall top, roof apex y, wall colour class, roof class
export const HOUSES = [
  [26, 9, 58, 54, 'wallB', 'roofD'], [37, 8, 60, 56, 'wallW', 'roofR'], [47, 10, 59, 54, 'wallB', 'roofD'],
  [60, 8, 63, 59, 'wallW', 'roofD'], [69, 7, 66, 63, 'wallB', 'roofR'],
  [22, 11, 68, 63, 'wallW', 'roofD'], [35, 9, 70, 66, 'wallB', 'roofR'], [46, 12, 69, 64, 'wallW', 'roofD'],
  [61, 9, 72, 68, 'wallB', 'roofD'], [73, 10, 74, 70, 'wallW', 'roofR'],
  [91, 8, 76, 73, 'wallB', 'roofD'], [103, 10, 77, 74, 'wallW', 'roofR'], [117, 8, 76, 73, 'wallB', 'roofD'],
  [129, 9, 77, 74, 'wallW', 'roofD'],
];
// the church: nave, tower, spire
export const CHURCH = { nave: [143, 15, 68, 64], tower: [147, 6, 57], spire: [[146.5, 57], [153.5, 57], [150, 43]] };
// lit windows, 2 x 2 (x, y, flicker group)
export const WINDOWS = [
  [29, 61, 0], [40, 63, 1], [51, 62, 2], [56, 62, 0], [62, 66, 3], [25, 71, 1], [30, 72, 2], [38, 73, 0],
  [50, 72, 3], [54, 74, 1], [64, 75, 2], [76, 77, 0], [94, 78, 3], [107, 78, 1], [120, 78, 2], [133, 78, 0],
  [149, 60, 4], [147, 72, 1], [153, 73, 3],
];

// ------------------------------------------------------------ regions

export const R_SKY = 0, R_HILLFAR = 1, R_HILLNEAR = 2, R_HOUSE = 10, R_ROOF = 40, R_CHURCH = 70;

function inTri(x, y, a, b, c) {
  const s = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = s(a, b, [x, y]), d2 = s(b, c, [x, y]), d3 = s(c, a, [x, y]);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

/** Region id at a point (later houses stand in front of earlier ones). */
export function regionAt(x, y) {
  const c = CHURCH;
  if (inTri(x, y, ...c.spire)) return R_CHURCH + 2;
  if (x >= c.tower[0] && x < c.tower[0] + c.tower[1] && y >= c.tower[2]) return R_CHURCH + 1;
  if (x >= c.nave[0] && x < c.nave[0] + c.nave[1]) {
    if (y >= c.nave[2]) return R_CHURCH;
    if (inTri(x, y, [c.nave[0] - 1, c.nave[2]], [c.nave[0] + c.nave[1] + 1, c.nave[2]], [c.nave[0] + c.nave[1] / 2, c.nave[3]])) return R_ROOF + 30;
  }
  for (let i = HOUSES.length - 1; i >= 0; i--) {
    const [hx, hw, wt, ry] = HOUSES[i];
    if (x >= hx && x < hx + hw && y >= wt) return R_HOUSE + i;
    if (y < wt && y >= ry - 0.5 && inTri(x, y, [hx - 1, wt], [hx + hw + 1, wt], [hx + hw / 2, ry])) return R_ROOF + i;
  }
  const h = hz(x);
  if (y >= h) return y < h + 7 + 3 * Math.sin(x * 0.07 + 1) ? R_HILLFAR : R_HILLNEAR;
  return R_SKY;
}

// ------------------------------------------------------------ the flow

const VORT = [
  ...STARS.map((s) => ({ x: s.x, y: s.y, g: s.g, R: s.r + 5 })),
  { x: MOON.x, y: MOON.y, g: MOON.g, R: MOON.halo + 4 },
  // the time's own swirls: each pair of numerals sits in a slow eddy
  { x: 50, y: 23, g: -16, R: 34 }, { x: 114, y: 47, g: 18, R: 34 },
  // the big wave of the sky, between the pairs and over the village
  { x: 84, y: 40, g: 9, R: 16 }, { x: 38, y: 50, g: -6, R: 14 },
];

/** Sky wind at a point: a drift to the right plus the vortices. */
function skyVel(x, y) {
  let vx = 1.0 + 0.35 * Math.sin(y * 0.11 + x * 0.02), vy = 0.32 * Math.sin(x * 0.055 + y * 0.03);
  for (const v of VORT) {
    const dx = x - v.x, dy = y - v.y, r2 = dx * dx + dy * dy;
    const f = (v.g * Math.exp(-r2 / (v.R * v.R))) / (r2 + 4);
    vx += -dy * f; vy += dx * f;
  }
  return [vx, vy];
}

function dirAt(reg, x, y) {
  if (reg === R_SKY) {
    const [vx, vy] = skyVel(x, y), m = Math.hypot(vx, vy);
    return m < 1e-3 ? null : [vx / m, vy / m];
  }
  if (reg === R_HILLFAR || reg === R_HILLNEAR) {
    const d = (hz(x + 0.5) - hz(x - 0.5)) * (reg === R_HILLFAR ? 1 : 0.6) + 0.12 * Math.sin(x * 0.3 + y);
    const m = Math.hypot(1, d);
    return [1 / m, d / m];
  }
  if (reg >= R_ROOF && reg < R_CHURCH) {
    // roofs: strokes down the slope, either side of the ridge
    const i = reg - R_ROOF, hh = i === 30 ? CHURCH.nave : null;
    const cx = hh ? hh[0] + hh[1] / 2 : HOUSES[i][0] + HOUSES[i][1] / 2;
    return x < cx ? [-0.8, 0.6] : [0.8, 0.6];
  }
  if (reg === R_CHURCH + 2) return [0, 1];
  // walls: upright strokes
  return [0.05, 1];
}

// ------------------------------------------------------------ evenly spaced streamlines

/**
 * Jobard-Lefer style: seed every pixel in turn, trace both ways inside the
 * region while no other line is within DTEST, keep lines longer than 5 px.
 * Returns lines of points [x, y], each with `closed`.
 */
function trace(regFn, dirFn, x0, y0, x1, y1) {
  const CS = DSEP, GWc = Math.ceil((x1 - x0) / CS) + 2, GHc = Math.ceil((y1 - y0) / CS) + 2;
  const grid = Array.from({ length: GWc * GHc }, () => []);
  const cell = (x, y) => (Math.floor((y - y0) / CS) + 1) * GWc + Math.floor((x - x0) / CS) + 1;
  const near = (x, y, d, self, selfFrom) => {
    const cx = Math.floor((x - x0) / CS) + 1, cy = Math.floor((y - y0) / CS) + 1, d2 = d * d;
    for (let j = cy - 1; j <= cy + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) {
      if (i < 0 || j < 0 || i >= GWc || j >= GHc) continue;
      for (const p of grid[j * GWc + i]) {
        if (p[2] === self && p[3] >= selfFrom) continue;
        const dx = p[0] - x, dy = p[1] - y;
        if (dx * dx + dy * dy < d2) return p;
      }
    }
    return null;
  };
  const lines = [];
  for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) {
    const px = sx + 0.5 + (rand(sx, sy, 7) - 0.5) * 0.6, py = sy + 0.5 + (rand(sx, sy, 8) - 0.5) * 0.6;
    const reg = regFn(px, py);
    if (reg < 0 || near(px, py, DSEP, -1, 0)) continue;
    if (!dirFn(reg, px, py)) continue;
    const id = lines.length;
    // trace one way; own points are checked too (a spiral stops, a loop closes)
    const own = [];
    const go = (sgn) => {
      const out = [];
      let x = px, y = py;
      for (let n = 0; n < 1400; n++) {
        const d = dirFn(reg, x, y);
        if (!d) break;
        const mx = x + sgn * d[0] * STEP * 0.5, my = y + sgn * d[1] * STEP * 0.5;
        const d2 = dirFn(reg, mx, my);
        if (!d2) break;
        const nx = x + sgn * d2[0] * STEP, ny = y + sgn * d2[1] * STEP;
        if (nx < x0 - 1 || ny < y0 - 1 || nx > x1 + 1 || ny > y1 + 1) { out.push([nx, ny]); break; }
        if (regFn(nx, ny) !== reg) break;
        if (near(nx, ny, DTEST, -1, 0)) break;
        // closing on itself?
        if (sgn > 0 && out.length > 24) {
          const dx = nx - px, dy = ny - py;
          if (dx * dx + dy * dy < STEP * STEP * 2.2) return { out, closed: true };
        }
        let hit = false;
        for (let k = 0; k < out.length - 8; k += 2) {
          const dx = out[k][0] - nx, dy = out[k][1] - ny;
          if (dx * dx + dy * dy < DTEST * DTEST) { hit = true; break; }
        }
        if (hit) break;
        out.push([nx, ny]);
        x = nx; y = ny;
      }
      return { out, closed: false };
    };
    const f = go(1);
    let pts;
    if (f.closed) pts = [[px, py], ...f.out];
    else {
      const b = go(-1);
      pts = [...b.out.reverse(), [px, py], ...f.out];
    }
    if (pts.length * STEP < 5) continue;
    lines.push({ pts, closed: f.closed, reg });
    pts.forEach((p, k) => grid[cell(p[0], p[1])].push([p[0], p[1], id, k]));
    own.length = 0;
  }
  return { lines, grid, GWc, GHc, CS };
}

// ------------------------------------------------------------ colour classes

// Each class: six stroke colours and the ground showing between strokes.
export const CLASSES = {};
const C = (name, strokes, gap) => { CLASSES[name] = { strokes, gap, id: Object.keys(CLASSES).length }; };
C('skyDeep', [0x1a2a7a, 0x22348c, 0x1c3c98, 0x2a48a4, 0x16266c, 0x2e4c9c], 0x101a50);
C('skyMid', [0x2a4ca8, 0x3458b2, 0x2a5cba, 0x3c68bc, 0x22409c, 0x4674be], 0x1a2c78);
C('skyLow', [0x3a66b6, 0x4878c2, 0x5688c6, 0x4680b0, 0x3460ac, 0x6292c4], 0x24408a);
C('skyTeal', [0x3a7ab0, 0x4a88b6, 0x2e6aa4, 0x5894ba, 0x3a6cb0, 0x2a5aa0], 0x1e3c80);
C('skyDark', [0x14205e, 0x1a2a70, 0x101c58, 0x20307a, 0x182868, 0x0e1850], 0x0a1240);
// star halos, inner to outer
C('ring1', [0xf0d840, 0xf8e060, 0xe8c830, 0xfcec78, 0xf0d050, 0xe4c440], 0xc8a830);
C('ring2', [0xb0b468, 0xa0b080, 0xbcb870, 0x90a890, 0xa8b068, 0x98ac98], 0x708090);
C('ring3', [0x5a90c4, 0x6aa0cc, 0x4e84bc, 0x78aad0, 0x5c94c4, 0x4a80bc], 0x3a68a8);
C('ring4', [0x4a80c0, 0x5890c8, 0x3e70b8, 0x68a0cc, 0x4a84c4, 0x3a6cb4], 0x2c5aa4);
// the moon: the lit crescent, the rest of its orange disc, its own halo
C('moonLit', [0xfce468, 0xfff090, 0xf8d850, 0xfff4b0, 0xf4dc60, 0xfce878], 0xe0b840);
C('moonDisc', [0xe89a28, 0xf0aa38, 0xd88a20, 0xf4b848, 0xe0a030, 0xd09028], 0xb07018);
C('moonRing', [0xe8c050, 0xf0cc60, 0xd8b040, 0xf4d878, 0xe0bc58, 0xd0a848], 0xa88830);
// the ground
C('hillFar', [0x1c3a6a, 0x24446e, 0x2a4a5c, 0x1a3460, 0x304c70, 0x203c58], 0x142a48);
C('hillNear', [0x1e3a3c, 0x26463a, 0x1a3236, 0x2e4a40, 0x223e48, 0x18303a], 0x10241e);
C('wallB', [0x34466a, 0x40527a, 0x34445e, 0x4a5c7c, 0x3c4c6c, 0x30405c], 0x222c46);
C('wallW', [0x5a5440, 0x686048, 0x4e4a3a, 0x726a4e, 0x605842, 0x544e3c], 0x36321e);
C('roofD', [0x26304e, 0x2e385a, 0x1e2846, 0x363e62, 0x283252, 0x1c2440], 0x12182e);
C('roofR', [0x8a4a24, 0x9a5a2c, 0x7a401e, 0xa86634, 0x8e5028, 0x703a1c], 0x4a2412);
C('spire', [0x1a2240, 0x222a4c, 0x161c38, 0x2a3456, 0x1e2644, 0x121834], 0x0c1028);
// the cypress
C('cypress', [0x0e2a1c, 0x163a22, 0x1e4428, 0x2a4a20, 0x10301e, 0x34502a], 0x08180e);
C('cypressDark', [0x08180e, 0x0e2216, 0x122a18, 0x1a2a14, 0x0a1c12, 0x203018], 0x040c08);
export const NCLASS = Object.keys(CLASSES).length;
export const CL = Object.fromEntries(Object.entries(CLASSES).map(([k, v]) => [k, v.id]));

// ------------------------------------------------------------ the static sky + ground map

export const LANE = new Uint16Array(N).fill(NOLANE), ARC = new Uint16Array(N), CLS = new Uint8Array(N), REG = new Uint8Array(N);
/** per lane: speed px/s, period of its dash pattern, phase seed */
export let LSPEED, LPER, LSEED, NLANES;
/**
 * Halo classes: each star (and the moon) gets its own copy of the ring
 * classes, so its rings can throb on their own beat. Class HBASE + k*4 + j
 * is ring j (0..3) of star k; the moon is k = STARS.length.
 */
export const HBASE = NCLASS, NHALO = (STARS.length + 1) * 4;
export const HALO_OF = [];
for (let k = 0; k <= STARS.length; k++) for (let j = 0; j < 4; j++)
  HALO_OF.push(k === STARS.length ? ['moonRing', 'ring3', 'ring4', 'ring4'][j] : 'ring' + (j + 1));

const regionPx = (x, y) => regionAt(x, y);

function rasterise(res, mapLane, mapArc, ox, oy, w, h, laneBase, inside) {
  const { lines, grid, GWc, GHc, CS } = res;
  // arc lengths; loops are rescaled to hold a whole number of 8 px dashes
  const arcs = lines.map((l) => {
    const a = [0];
    for (let i = 1; i < l.pts.length; i++) a.push(a[i - 1] + Math.hypot(l.pts[i][0] - l.pts[i - 1][0], l.pts[i][1] - l.pts[i - 1][1]));
    const L = a[a.length - 1] + (l.closed ? STEP : 0);
    l.len = L;
    l.per = l.closed ? Math.max(2, Math.round(L / 8)) * 8 : 8 * 1024;
    l.scale = l.closed ? l.per / L : 1;
    return a;
  });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = ox + x + 0.5, py = oy + y + 0.5;
    if (!inside(px, py)) continue;
    const reg = regionPx(px, py);
    const cx = Math.floor((px - ox) / CS) + 1, cy = Math.floor((py - oy) / CS) + 1;
    let best = 9, bl = -1, bk = 0;
    for (let j = cy - 1; j <= cy + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) {
      if (i < 0 || j < 0 || i >= GWc || j >= GHc) continue;
      for (const p of grid[j * GWc + i]) {
        if (lines[p[2]].reg !== reg) continue;
        const dx = p[0] - px, dy = p[1] - py, d = dx * dx + dy * dy;
        if (d < best) { best = d; bl = p[2]; bk = p[3]; }
      }
    }
    if (bl < 0) continue;
    const l = lines[bl];
    mapLane[y * w + x] = laneBase + bl;
    mapArc[y * w + x] = Math.round(arcs[bl][bk] * l.scale) % l.per;
  }
}

function skySpeed(l) {
  // mean wind speed along the line, as px/s for its dashes
  let m = 0;
  const n = Math.min(l.pts.length, 40);
  for (let k = 0; k < n; k++) {
    const p = l.pts[Math.floor((k * l.pts.length) / n)];
    const [vx, vy] = skyVel(p[0], p[1]);
    m += Math.hypot(vx, vy);
  }
  return Math.min(16, Math.max(5, (m / n) * 7.5));
}

function meanY(l) { let s = 0; for (const p of l.pts) s += p[1]; return s / l.pts.length; }

function buildStatic() {
  const res = trace((x, y) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : regionPx(x, y)), dirAt, 0, 0, W, H);
  rasterise(res, LANE, ARC, 0, 0, W, H, 0, () => true);
  const { lines } = res;
  // cypress lines go in the same tables, after these
  const cyp = traceCypress();
  const all = [...lines, ...cyp.lines];
  NLANES = all.length;
  LSPEED = new Float32Array(NLANES); LPER = new Uint16Array(NLANES); LSEED = new Uint16Array(NLANES);
  const LCLS = new Uint8Array(NLANES);
  all.forEach((l, i) => {
    LPER[i] = l.per;
    LSEED[i] = hash(i, 91) % l.per;
    const r = rand(i, 5);
    if (l.reg === R_SKY) {
      LSPEED[i] = l.closed ? 7 + 3 * rand(i, 6) : skySpeed(l);
      const y = meanY(l);
      LCLS[i] = r < 0.12 ? CL.skyDark : r < 0.27 ? CL.skyTeal : y < 20 ? CL.skyDeep : y < 46 ? (r < 0.6 ? CL.skyMid : CL.skyDeep) : CL.skyLow;
    } else if (l.reg === R_HILLFAR) { LSPEED[i] = 2.5; LCLS[i] = CL.hillFar; }
    else if (l.reg === R_HILLNEAR) { LSPEED[i] = 1.5; LCLS[i] = CL.hillNear; }
    else if (l.reg === 200) { LSPEED[i] = 9 + 4 * rand(i, 6); LCLS[i] = r < 0.3 ? CL.cypressDark : CL.cypress; }
    else LSPEED[i] = 0;
    if (l.reg >= R_HOUSE && l.reg < R_ROOF) LCLS[i] = CL[HOUSES[l.reg - R_HOUSE][4]];
    else if (l.reg >= R_ROOF && l.reg < R_CHURCH) LCLS[i] = l.reg === R_ROOF + 30 ? CL.roofD : CL[HOUSES[l.reg - R_ROOF][5]];
    else if (l.reg === R_CHURCH || l.reg === R_CHURCH + 1) LCLS[i] = CL.wallB;
    else if (l.reg === R_CHURCH + 2) LCLS[i] = CL.spire;
  });
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i / W) | 0, px = x + 0.5, py = y + 0.5;
    const reg = regionPx(px, py);
    REG[i] = reg === R_SKY ? 0 : reg === R_HILLFAR || reg === R_HILLNEAR ? 1 : 2;
    let c = LANE[i] !== NOLANE ? LCLS[LANE[i]] : reg === R_SKY ? CL.skyMid : reg === R_HILLFAR ? CL.hillFar : CL.hillNear;
    if (reg === R_SKY && LANE[i] !== NOLANE && LPER[LANE[i]] === 8192) {
      // long sky lanes change colour every ~30 px of their length, in patches
      const L = LANE[i], r = rand(L, (ARC[i] + LSEED[L] % 23) >> 5, 3);
      c = r < 0.12 ? CL.skyDark : r < 0.27 ? CL.skyTeal : y < 18 ? CL.skyDeep : y < 44 ? (r < 0.62 ? CL.skyMid : CL.skyDeep) : (r < 0.75 ? CL.skyLow : CL.skyMid);
    }
    if (reg === R_SKY) {
      // halos are drawn by distance, so the rings are true circles; the strokes still run round them
      STARS.forEach((s, k) => {
        const d = Math.hypot(px - s.x, py - s.y);
        if (d < s.r + 1.5) {
          const ring = d < 4.2 ? 1 : d < 6.2 ? 2 : d < 8.2 ? 3 : 4;
          if (ring <= Math.ceil((s.r - 0.5) / 2)) { c = HBASE + k * 4 + ring - 1; }
        }
      });
      const dm = Math.hypot(px - MOON.x, py - MOON.y);
      if (dm < MOON.r) {
        const ds = Math.hypot(px - (MOON.x + 3.2), py - (MOON.y - 2.4));
        c = ds < 5.6 ? CL.moonDisc : CL.moonLit;
      } else if (dm < MOON.halo) {
        const ring = dm < MOON.r + 2 ? 1 : dm < MOON.r + 3.6 ? 2 : 3;
        c = HBASE + STARS.length * 4 + ring - 1;
      }
    }
    CLS[i] = c;
  }
  CYP.lane.forEach((l, j) => { if (l !== NOLANE) CYP.lane[j] = l + lines.length; });
  CYP.cls = new Uint8Array(CYP.lane.length);
  CYP.lane.forEach((l, j) => { CYP.cls[j] = l === NOLANE ? CL.cypressDark : LCLS[l]; });
}

// ------------------------------------------------------------ the cypress (its own layer: it sways)

export const CYP = { x0: 0, w: 26, h: H, lane: null, arc: null, cls: null };

/** Half widths left and right of the trunk line, and the trunk line: a flame. */
export function cypressEdge(y) {
  const u = Math.max(0, (y + 10) / 90);
  const base = 2.4 + 7.2 * Math.pow(u, 0.85);
  const cx = 11 + 1.6 * Math.sin(y * 0.06);
  const l = base * (1 + 0.22 * Math.sin(y * 0.47 + 0.8 * Math.sin(y * 0.13)));
  const r = base * (1 + 0.24 * Math.sin(y * 0.41 + 2.1 + 0.7 * Math.sin(y * 0.11)));
  return [cx - l, cx + r];
}
const inCypress = (x, y) => { const [a, b] = cypressEdge(y); return x >= a && x < b; };

function traceCypress() {
  const reg = (x, y) => (x < 0 || x >= CYP.w || y < -2 || y >= H ? -1 : inCypress(x, y) ? 200 : -1);
  const dir = (r, x, y) => {
    const [a, b] = cypressEdge(y), [a2, b2] = cypressEdge(y - 1);
    // flames: lean with the outline near the edges, wave in the middle
    const u = (x - a) / Math.max(1, b - a);
    const dx = (a2 - a) * (1 - u) + (b2 - b) * u + 0.35 * Math.sin(y * 0.35 + x * 0.6);
    const m = Math.hypot(dx, 1);
    return [dx / m, -1 / m];
  };
  const res = trace(reg, dir, 0, -2, CYP.w, H);
  res.lines.forEach((l) => { l.reg = 200; });
  CYP.lane = new Uint16Array(CYP.w * H).fill(NOLANE);
  CYP.arc = new Uint16Array(CYP.w * H);
  // the regionPx test inside rasterise does not apply here: use our own
  const { lines, grid, GWc, GHc, CS } = res;
  const arcs = lines.map((l) => {
    const a = [0];
    for (let i = 1; i < l.pts.length; i++) a.push(a[i - 1] + Math.hypot(l.pts[i][0] - l.pts[i - 1][0], l.pts[i][1] - l.pts[i - 1][1]));
    l.per = 8 * 1024; l.closed = false;
    return a;
  });
  for (let y = 0; y < H; y++) for (let x = 0; x < CYP.w; x++) {
    const px = x + 0.5, py = y + 0.5;
    if (!inCypress(px, py)) continue;
    const cx = Math.floor(px / CS) + 1, cy = Math.floor((py + 2) / CS) + 1;
    let best = 9, bl = -1, bk = 0;
    for (let j = cy - 1; j <= cy + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) {
      if (i < 0 || j < 0 || i >= GWc || j >= GHc) continue;
      for (const p of grid[j * GWc + i]) {
        const dx = p[0] - px, dy = p[1] - py, d = dx * dx + dy * dy;
        if (d < best) { best = d; bl = p[2]; bk = p[3]; }
      }
    }
    if (bl < 0) { CYP.lane[y * CYP.w + x] = NOLANE - 1; continue; }
    CYP.lane[y * CYP.w + x] = bl;
    CYP.arc[y * CYP.w + x] = Math.round(arcs[bl][bk]);
  }
  // pixels inside with no line: dark ground of the tree
  CYP.lane.forEach((l, j) => { if (l === NOLANE - 1) CYP.lane[j] = NOLANE; });
  CYP.mask = new Uint8Array(CYP.w * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < CYP.w; x++) CYP.mask[y * CYP.w + x] = inCypress(x + 0.5, y + 0.5) ? 1 : 0;
  return res;
}

buildStatic();
