// Bricks — the time built out of toy bricks, in real 3D.
//
// The hour is built in big toddler bricks (hollow studs, two to a cell)
// standing far back on the table; the minutes in ordinary bricks close to
// the lens. Each numeral is a real little model: runs of cells are 1xN
// bricks, lone cells stacked into one tall pillar, corners and diagonals
// are 45-degree slope bricks laid on their side, and studs show only on the
// skyline. Every piece is an extruded polygon in 3D, projected through a
// perspective camera that sways slowly; front faces are lit solid with
// seams a pixel and a half inside the outline, tops and sides are black so
// the studs stand alone. Painter's order: separating-axis on the grid,
// depth for anything tumbling.
//
// Beside the hour lies a giant brick upside down, tipped towards the
// viewer: its hollow underside with three tubes is the parts tub.
//
// Always alive: the camera's sway, and every second a thumb presses one
// brick of the minutes home (lift, wiggle, click, squash).
//
// The minute: the changing numeral is unbuilt top brick first, each piece
// unclicked, wiggled and tossed end over end into the tub, all gone by
// :00; the new one is fished out of the tub and built bottom brick first,
// each landing with a squash. Studs under a lifted brick show while it is
// away. The tens go a beat before the units.
//
// The hour: the whole model is lifted a hand's height, wobbling, and
// dropped. It smashes at :00 (the table shakes): every brick flies out
// sideways and away, bounces and slides; half a second later each brick of
// the new time flies home from where one of the old ones landed, and the
// leftovers are tossed into the tub. Readable again at about 1.3 s.
//
// Burn-in: everything is in perspective under a moving camera, so no pixel
// holds still. 23:00-07:00 the panel dims (ctx.night).

import { dither, clamp, ease, progress, previousMinute, clockFields } from '../js/kit.js';

const W = 128, H = 64;
const TAU = Math.PI * 2;

// ------------------------------------------------------------ letterforms
// Each digit is a little relief model built on a grid of cells, one stud
// wide and one course (1.2 studs) tall. '#' is a solid cell, the letters are
// 45-degree slope bricks laid on their side, named by the half they fill:
// r lower-right, l lower-left (true slopes, their slant faces up), R
// upper-right, L upper-left (inverted slopes). Runs of '#' become 1xN bricks,
// lone cells stacked in a column become tall pillar bricks.

// The minutes: four studs wide, regular bricks.
const LEGO = {
  0: ['r##l', '#..#', '#..#', '#..#', 'R##L'],
  1: ['.r#.', '..#.', '..#.', '..#.', '.###'],
  2: ['r##l', '...#', '..rL', '.rL.', '####'],
  3: ['r##l', '...#', '.###', '...#', 'R##L'],
  4: ['..r#', '.rL#', 'rL.#', '####', '...#'],
  5: ['####', '#...', '###l', '...#', 'R##L'],
  6: ['r##.', '#...', '###l', '#..#', 'R##L'],
  7: ['####', '..rL', '.rL.', '.#..', '.#..'],
  8: ['r##l', '#..#', '|##|', '#..#', 'R##L'],
  9: ['r##l', '#..#', 'R###', '...#', '.##L'],
};
// The hour: three cells wide, in the big bricks a toddler builds with.
const DUPLO = {
  0: ['r#l', '#.#', '#.#', '#.#', 'R#L'],
  1: ['r#.', '.#.', '.#.', '.#.', '###'],
  2: ['r#l', '..#', '.rL', 'rL.', '###'],
  3: ['r#l', '..#', '.##', '..#', 'R#L'],
  4: ['.r#', 'rL#', '###', '..#', '..#'],
  5: ['###', '#..', '##l', '..#', 'R#L'],
  6: ['r#.', '#..', '##l', '#.#', 'R#L'],
  7: ['###', '..#', '.rL', '.#.', '.#.'],
  8: ['r#l', '#.#', '|#|', '#.#', 'R#L'],
  9: ['r#l', '#.#', 'R##', '..#', '##L'],
};

const FLAT_TOP = { '#': 1, R: 1, L: 1 }, FLAT_BOTTOM = { '#': 1, r: 1, l: 1 };
// The full sides of each cell shape, coded 2*nx + ny of their outward normal.
const FULL = { '#': [2, -2, 1, -1], r: [-1, 2], l: [-1, -2], R: [2, 1], L: [-2, 1] };

/**
 * The pieces of digit `d` in `font`, at `k` studs per cell (1 or 2), in the
 * digit's own frame: x right from its left edge, y up from the plate, z away
 * from the viewer from its front face.
 */
function buildDigit(font, d, k) {
  // '|' is a solid cell that belongs to the stem through it, not to the bar
  // across it (the waist of an 8 sits between unbroken stems).
  const raw = font[d], rows = raw.map((r) => r.replace(/\|/g, '#')), nr = rows.length, nc = rows[0].length;
  const stem = (c, r) => raw[r]?.[c] === '|';
  const U = k, CH = 1.2 * k, DP = 2 * k;
  const at = (c, r) => (r >= 0 && r < nr && c >= 0 && c < nc ? rows[r][c] : '.');
  const owner = rows.map((row) => Array.from(row, () => -1));
  const pieces = [];
  const x0 = (c) => c * U, y0 = (r) => (nr - 1 - r) * CH;
  const add = (kind, cells, poly) => {
    const i = pieces.length;
    for (const [c, r] of cells) owner[r][c] = i;
    pieces.push({ kind, cells, poly, depth: DP, k });
  };
  // Slopes.
  for (let r = 0; r < nr; r++)
    for (let c = 0; c < nc; c++) {
      const ch = at(c, r);
      if (ch === '#' || ch === '.') continue;
      const a = x0(c), b = a + U, lo = y0(r), hi = lo + CH;
      const poly = ch === 'r' ? [[a, lo], [b, lo], [b, hi]]
        : ch === 'l' ? [[a, lo], [b, lo], [a, hi]]
          : ch === 'R' ? [[b, lo], [b, hi], [a, hi]]
            : [[a, lo], [b, hi], [a, hi]];
      add(ch, [[c, r]], poly);
    }
  // Horizontal runs of two or more: 1xN bricks, N <= 4, split evenly.
  for (let r = 0; r < nr; r++) {
    let c = 0;
    while (c < nc) {
      if (at(c, r) !== '#' || stem(c, r)) { c++; continue; }
      let e = c;
      while (at(e, r) === '#' && !stem(e, r)) e++;
      const n = e - c;
      if (n >= 2) {
        const parts = Math.ceil(n / 4), base = Math.floor(n / parts);
        let s = c;
        for (let p = 0; p < parts; p++) {
          const len = base + (p < n - base * parts ? 1 : 0);
          const cells = Array.from({ length: len }, (_, i) => [s + i, r]);
          add('brick', cells, [[x0(s), y0(r)], [x0(s + len), y0(r)], [x0(s + len), y0(r) + CH], [x0(s), y0(r) + CH]]);
          s += len;
        }
      }
      c = e;
    }
  }
  // Lone cells, stacked: one tall pillar brick per stroke, so a seam never
  // cuts a stem.
  for (let c = 0; c < nc; c++) {
    let r = 0;
    while (r < nr) {
      if (at(c, r) !== '#' || owner[r][c] >= 0) { r++; continue; }
      let e = r;
      while (at(c, e) === '#' && owner[e][c] < 0) e++;
      const n = e - r, parts = Math.ceil(n / 5), base = Math.floor(n / parts);
      let s = r;
      for (let p = 0; p < parts; p++) {
        const len = base + (p < n - base * parts ? 1 : 0);
        const cells = Array.from({ length: len }, (_, i) => [c, s + i]);
        const top = s, bot = s + len - 1;
        add('pillar', cells, [[x0(c), y0(bot)], [x0(c) + U, y0(bot)], [x0(c) + U, y0(top) + CH], [x0(c), y0(top) + CH]]);
        s += len;
      }
      r = e;
    }
  }
  // Studs: on every flat top that is not inside its own piece. A stud
  // remembers the piece sitting on it, so it shows while that piece is away.
  for (const p of pieces) {
    p.studs = [];
    for (const [c, r] of p.cells) {
      if (!FLAT_TOP[at(c, r)]) continue;
      const above = r > 0 ? owner[r - 1][c] : -1;
      if (above === pieces.indexOf(p)) continue;
      const cover = above >= 0 && FLAT_BOTTOM[at(c, r - 1)] ? above : -1;
      // Studs inside a counter (under an arch of the same digit) would
      // clutter the letterform: only the skyline, and studs bared when the
      // piece above them is lifted off, are drawn.
      let roofed = false;
      for (let q = r - 2; q >= 0; q--) if (at(c, q) !== '.') roofed = true;
      if (cover < 0 && (above >= 0 || roofed)) continue;
      // Studs low on a numeral (the foot of a 1) read as a decimal point.
      if (cover < 0 && r > nr / 2) continue;
      if (cover >= 0 && roofed) continue;
      for (const z of [DP * 0.25, DP * 0.75]) p.studs.push({ x: x0(c) + U / 2, y: y0(r) + CH, z, cover });
    }
    let cx = 0, cy = 0;
    for (const [x, y] of p.poly) { cx += x; cy += y; }
    p.cx = cx / p.poly.length; p.cy = cy / p.poly.length; p.cz = DP / 2;
    // Which edges of the front face touch another piece: those get a seam.
    p.seam = p.poly.map((a, i) => {
      const b = p.poly[(i + 1) % p.poly.length], ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey);
      if ((ex && ey) || p.kind.length === 1) return false;
      const nx = ey / l, ny = -ex / l, steps = Math.round(l / (ex ? U : CH));
      for (let k = 0; k < steps; k++) {
        const u = (k + 0.5) / steps;
        const x = a[0] + ex * u + nx * U * 0.5, y = a[1] + ey * u + ny * CH * 0.5;
        const nb = at(Math.floor(x / U), nr - 1 - Math.floor(y / CH));
        if (nb === '#') return true;
      }
      return false;
    });
    // Side faces pressed flat against a neighbour are never seen while both
    // are in place; drawing them would only fight the painter's order.
    p.inner = p.poly.map((a, i) => {
      const b = p.poly[(i + 1) % p.poly.length], ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey);
      if (ex && ey) return [];
      const nx = ey / l, ny = -ex / l, steps = Math.round(l / (ex ? U : CH)), out = [];
      for (let k = 0; k < steps; k++) {
        const u = (k + 0.5) / steps;
        const x = a[0] + ex * u + nx * U * 0.5, y = a[1] + ey * u + ny * CH * 0.5;
        const c = Math.floor(x / U), r = nr - 1 - Math.floor(y / CH), nb = at(c, r);
        if (nb === '.' || !FULL[nb].includes(-nx * 2 - ny)) return [];
        out.push(owner[r][c]);
      }
      return out;
    });
    // Bounds about the centre, for the painter's order.
    p.bx = [Math.min(...p.poly.map((q) => q[0])) - p.cx, Math.max(...p.poly.map((q) => q[0])) - p.cx];
    p.by = [Math.min(...p.poly.map((q) => q[1])) - p.cy, Math.max(...p.poly.map((q) => q[1])) - p.cy];
    p.rad = Math.hypot(p.bx[1] - p.bx[0], p.by[1] - p.by[0], DP) / 2;
    p.bottom = Math.min(...p.poly.map((q) => q[1]));
    p.top = Math.max(...p.poly.map((q) => q[1]));
  }
  return pieces;
}

const LEGO_P = Array.from({ length: 10 }, (_, d) => buildDigit(LEGO, d, 1));
const DUPLO_P = Array.from({ length: 10 }, (_, d) => buildDigit(DUPLO, d, 2));

// ------------------------------------------------------------ the scene
// World in studs: x right, y up, z away from the viewer; the baseplate's top is y = 0.

const SLOTS = [
  { font: DUPLO_P, x: -20, z: 30 },   // hour tens
  { font: DUPLO_P, x: -12, z: 30 },   // hour units
  { font: LEGO_P, x: 1.2, z: 0 },       // minute tens
  { font: LEGO_P, x: 6.2, z: 0 },       // minute units
];
const PLATE = { x0: -40, x1: 40, z0: -13, z1: 20, t: 0.4 };
const BIN = { x0: -6.5, x1: -1, z0: 0.5, z1: 3.3, h: 1.4, t: 0.3 };

// ------------------------------------------------------------ camera

const cam = { C: [0, 0, 0], r: [1, 0, 0], u: [0, 1, 0], f: [0, 0, 1], F: 126 };
function setCamera(yaw, pitch, dist, T) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  cam.f = [sy * cp, -sp, cy * cp];
  cam.r = [cy, 0, -sy];
  cam.u = [sy * sp, cp, cy * sp];
  cam.C = [T[0] - dist * cam.f[0], T[1] - dist * cam.f[1], T[2] - dist * cam.f[2]];
}
const SX = 64, SY = 34;
/** World -> [screen x, screen y, depth] into out at k. */
function project(x, y, z, out, k) {
  const dx = x - cam.C[0], dy = y - cam.C[1], dz = z - cam.C[2];
  const X = dx * cam.r[0] + dy * cam.r[1] + dz * cam.r[2];
  const Y = dx * cam.u[0] + dy * cam.u[1] + dz * cam.u[2];
  const Z = dx * cam.f[0] + dy * cam.f[1] + dz * cam.f[2];
  out[k] = SX + (cam.F * X) / Z; out[k + 1] = SY - (cam.F * Y) / Z; out[k + 2] = Z;
}

// ------------------------------------------------------------ rasterising

let BUF = null;
/** Fill a convex screen polygon (flat [x, y, ...], n points) with a dither level; 1 solid, 0 black. */
function fillConvex(P, n, level) {
  let ymin = 1e9, ymax = -1e9;
  for (let i = 0; i < n; i++) { const y = P[2 * i + 1]; if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
  const ya = Math.max(0, Math.ceil(ymin - 0.5)), yb = Math.min(H - 1, Math.floor(ymax - 0.5));
  for (let y = ya; y <= yb; y++) {
    const py = y + 0.5;
    let xl = 1e9, xr = -1e9;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const y0 = P[2 * j + 1], y1 = P[2 * i + 1];
      if ((y0 <= py) === (y1 <= py)) continue;
      const x = P[2 * j] + ((py - y0) * (P[2 * i] - P[2 * j])) / (y1 - y0);
      if (x < xl) xl = x; if (x > xr) xr = x;
    }
    if (xl > xr) continue;
    const xa = Math.max(0, Math.ceil(xl - 0.5)), xb = Math.min(W - 1, Math.floor(xr - 0.5));
    const row = y * W;
    if (level >= 1) for (let x = xa; x <= xb; x++) BUF[row + x] = 1;
    else if (level <= 0) for (let x = xa; x <= xb; x++) BUF[row + x] = 0;
    else for (let x = xa; x <= xb; x++) BUF[row + x] = dither(x, y, level) ? 1 : 0;
  }
}
function line(x0, y0, x1, y1, c) {
  x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.floor(x1); y1 = Math.floor(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  for (let i = 0; i < 400; i++) {
    if (x0 >= 0 && x0 < W && y0 >= 0 && y0 < H) BUF[y0 * W + x0] = c;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
}
function ellipse(cx, cy, rx, ry, c) {
  const ya = Math.max(0, Math.ceil(cy - ry - 0.5)), yb = Math.min(H - 1, Math.floor(cy + ry - 0.5));
  for (let y = ya; y <= yb; y++) {
    const v = (y + 0.5 - cy) / ry, w = 1 - v * v;
    if (w < 0) continue;
    const hw = rx * Math.sqrt(w);
    const xa = Math.max(0, Math.ceil(cx - hw - 0.5)), xb = Math.min(W - 1, Math.floor(cx + hw - 0.5));
    for (let x = xa; x <= xb; x++) BUF[y * W + x] = c;
  }
}

// ------------------------------------------------------------ drawing a brick

const LIGHT = (() => { const v = [-0.35, 0.6, -0.72]; const l = Math.hypot(...v); return v.map((c) => c / l); })();
// Faces toward the viewer (the front, and the slants of slope bricks) are
// lit solid; tops and sides are black, so the studs stand on them alone.
const shadeOf = (nx, ny, nz) => {
  return nz < -0.5 ? 1 : 0;
};

const PV = new Float64Array(48), PS = new Float64Array(16), WV = new Float64Array(48);

/**
 * Draw one piece. `pose`: { x, y, z } of its centre in the world, R (3x3
 * row-major) about that centre, sq: vertical squash, studs: which studs show.
 */
function drawPiece(p, pose, showStud, home) {
  const n = p.poly.length, R = pose.R, sq = pose.sq ?? 1;
  // Vertices: front ring then back ring, in world space.
  for (let i = 0; i < 2 * n; i++) {
    const q = p.poly[i % n];
    const lx = q[0] - p.cx, ly = (q[1] - p.cy) * sq + (p.cy - p.bottom) * (sq - 1), lz = (i < n ? 0 : p.depth) - p.cz;
    const wx = pose.x + R[0] * lx + R[1] * ly + R[2] * lz;
    const wy = pose.y + R[3] * lx + R[4] * ly + R[5] * lz;
    const wz = pose.z + R[6] * lx + R[7] * ly + R[8] * lz;
    WV[3 * i] = wx; WV[3 * i + 1] = wy; WV[3 * i + 2] = wz;
    project(wx, wy, wz, PV, 3 * i);
  }
  const face = (idx, nl, seams) => {
    // nl: local normal; visible if it faces the camera.
    const nx = R[0] * nl[0] + R[1] * nl[1] + R[2] * nl[2], ny = R[3] * nl[0] + R[4] * nl[1] + R[5] * nl[2], nz = R[6] * nl[0] + R[7] * nl[1] + R[8] * nl[2];
    const a = idx[0];
    const vx = cam.C[0] - WV[3 * a], vy = cam.C[1] - WV[3 * a + 1], vz = cam.C[2] - WV[3 * a + 2];
    if (nx * vx + ny * vy + nz * vz <= 0) return false;
    for (let i = 0; i < idx.length; i++) { PS[2 * i] = PV[3 * idx[i]]; PS[2 * i + 1] = PV[3 * idx[i] + 1]; }
    const lv = shadeOf(nx, ny, nz);
    fillConvex(PS, idx.length, lv);
    // Tops and sides: black, in a lit contour, so the depth shows without
    // competing with the lit fronts.
    // The slant of a slope brick: black like a top, its far ridge lit.
    // A tumbling brick: its dark faces get a lit contour so its form reads.
    if (lv > 0 && pose.seams === false) for (let i = 0, j = idx.length - 1; i < idx.length; j = i++) line(PS[2 * j], PS[2 * j + 1], PS[2 * i], PS[2 * i + 1], 0);
    if (lv === 0 && pose.seams === false) for (let i = 0, j = idx.length - 1; i < idx.length; j = i++) line(PS[2 * j], PS[2 * j + 1], PS[2 * i], PS[2 * i + 1], 1);
    // Seams between bricks, kept a pixel and a half inside the outline so
    // they never notch the numeral's silhouette.
    if (seams) for (let i = 0, j = idx.length - 1; i < idx.length; j = i++) {
      if (!p.seam[idx[i]]) continue;
      const ax = PS[2 * j], ay = PS[2 * j + 1], bx = PS[2 * i], by = PS[2 * i + 1], l = Math.hypot(bx - ax, by - ay);
      if (l < 4) continue;
      const k = 1.5 / l;
      line(ax + (bx - ax) * k, ay + (by - ay) * k, bx - (bx - ax) * k, by - (by - ay) * k, 0);
    }
    return ny > 0.3;
  };
  // Side faces, one per polygon edge, then the front; studs on top of all.
  let topY = null;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, a = p.poly[i], b = p.poly[j];
    const ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey);
    const nl = [ey / l, -ex / l, 0];
    if (home && p.inner[i].length && p.inner[i].every(home)) continue;
    const up = face([i, j, j + n, i + n], nl);
    if (up && ey === 0 && ex < 0) topY = a[1];
  }
  face(Array.from({ length: n }, (_, i) => n - 1 - i), [0, 0, -1], pose.seams !== false);
  if (topY !== null && p.studs.length) drawStuds(p, pose, sq, showStud, topY);
}

const SB = new Float64Array(3), ST = new Float64Array(3);
function drawStuds(p, pose, sq, showStud, yTop) {
  const R = pose.R, duplo = p.k > 1;
  const rad = 0.3 * p.k, hgt = 0.34 * p.k;
  for (const s of p.studs) {
    if (Math.abs(s.y - yTop) > 1e-6 || !showStud(s)) continue;
    const lx = s.x - p.cx, ly = (s.y - p.cy) * sq + (p.cy - p.bottom) * (sq - 1), lz = s.z - p.cz;
    const bx = pose.x + R[0] * lx + R[1] * ly + R[2] * lz, by = pose.y + R[3] * lx + R[4] * ly + R[5] * lz, bz = pose.z + R[6] * lx + R[7] * ly + R[8] * lz;
    project(bx, by, bz, SB, 0);
    project(bx + R[1] * hgt, by + R[4] * hgt, bz + R[7] * hgt, ST, 0);
    const rx = (rad * cam.F) / SB[2];
    // How much the stud's axis points at the eye: the ellipse's squash.
    const vx = cam.C[0] - bx, vy = cam.C[1] - by, vz = cam.C[2] - bz, vl = Math.hypot(vx, vy, vz);
    const ry = Math.max(0.6, rx * Math.abs((R[1] * vx + R[4] * vy + R[7] * vz) / vl));
    ellipse(SB[0], SB[1], rx, ry, 1);
    for (let k = 1; k < 4; k++) ellipse(SB[0] + ((ST[0] - SB[0]) * k) / 4, SB[1] + ((ST[1] - SB[1]) * k) / 4, rx, ry, 1);
    ellipse(ST[0], ST[1], rx, ry, 1);
    if (duplo) ellipse(ST[0], ST[1], rx * 0.5, ry * 0.5, 0);
  }
}

// ------------------------------------------------------------ the plate and the tub

const P18 = new Float64Array(24);
function drawPlate() {
  const { x0, x1, z0, t } = PLATE;
  project(x0, 0, z0, P18, 0); project(x1, 0, z0, P18, 3); project(x1, -t, z0, P18, 6); project(x0, -t, z0, P18, 9);
  // The plate's front edge: one clean band.
  const ya = Math.round(P18[1]), yb = Math.max(ya + 1, Math.round(P18[10]));
  for (let y = ya; y <= Math.min(H - 1, yb); y++) for (let x = 0; x < W; x++) BUF[y * W + x] = 1;
}

// The tub: a giant 2x4 brick lying upside down, so its hollow underside,
// with the three tubes every brick has, is open to the sky. Pieces that
// come off a numeral are tossed into it and fished out of it. Drawn in
// contour only, so it never competes with the time. `part` 0 is the inside
// (behind anything falling in), 1 the walls in front of it.
// It is tipped towards the viewer, resting on its front edge, so the bores show.
const TILT = 0.55, CT = Math.cos(TILT), ST_ = Math.sin(TILT);
/** A point in the tub's own frame (x, height above its floor, z) -> world. */
function tubPoint(x, y, z) {
  const dz = z - BIN.z0;
  return [x, y * CT + dz * ST_, BIN.z0 - y * ST_ + dz * CT];
}
const B8 = new Float64Array(48), RING = new Float64Array(40);
function tp(x, y, z, out, k) { const q = tubPoint(x, y, z); project(q[0], q[1], q[2], out, k); }
function drawTub(part) {
  const { x0, x1, z0, z1, h, t } = BIN;
  const c = [[x0, 0, z0], [x1, 0, z0], [x1, h, z0], [x0, h, z0], [x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1],
    [x0 + t, h, z0 + t], [x1 - t, h, z0 + t], [x1 - t, h, z1 - t], [x0 + t, h, z1 - t]];
  c.forEach((q, i) => tp(q[0], q[1], q[2], B8, 3 * i));
  const L = (a, b, col = 1) => line(B8[3 * a], B8[3 * a + 1], B8[3 * b], B8[3 * b + 1], col);
  const quad = (a, b, cc, d, lv) => fillConvex([B8[3 * a], B8[3 * a + 1], B8[3 * b], B8[3 * b + 1], B8[3 * cc], B8[3 * cc + 1], B8[3 * d], B8[3 * d + 1]], 4, lv);
  if (part === 0) {
    quad(3, 2, 6, 7, 0);
    // The three tubes, seen down their bores: rims at the brim.
    const zc = (z0 + z1) / 2, r = (z1 - z0) * 0.28;
    for (let k = 1; k <= 3; k++) {
      const xc = x0 + ((x1 - x0) * k) / 4;
      for (let i = 0; i < 16; i++) tp(xc + r * Math.cos((i * TAU) / 16), h, zc + r * Math.sin((i * TAU) / 16), B8, 36 + 0), RING[2 * i] = B8[36], RING[2 * i + 1] = B8[37];
      fillConvex(RING, 16, 0);
      for (let i = 0, j = 15; i < 16; j = i++) line(RING[2 * j], RING[2 * j + 1], RING[2 * i], RING[2 * i + 1], 1);
    }
    L(8, 9); L(9, 10); L(10, 11); L(11, 8);
  } else {
    const right = cam.C[0] > x1;
    if (right) { quad(1, 5, 6, 2, 0); L(5, 6); L(1, 5); L(2, 6); }
    else { quad(4, 0, 3, 7, 0); L(4, 7); L(0, 4); L(3, 7); }
    quad(0, 1, 2, 3, 0);
    L(0, 1); L(1, 2); L(2, 3); L(3, 0);
    L(8, 9); L(8, 11); L(9, 10);
  }
}

// ------------------------------------------------------------ motion

const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
function axisAngle(x, y, z, a) {
  const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
  const c = Math.cos(a), s = Math.sin(a), k = 1 - c;
  return [c + x * x * k, x * y * k - z * s, x * z * k + y * s,
    y * x * k + z * s, c + y * y * k, y * z * k - x * s,
    z * x * k - y * s, z * y * k + x * s, c + z * z * k];
}
/** A repeatable random number in [0, 1) from integers. */
function hash(a, b = 0, c = 0) {
  let h = (a * 374761393 + b * 668265263 + c * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const G = 46;                      // gravity, studs / s^2
const MOUTH = [(BIN.x0 + BIN.x1) / 2, BIN.h, (BIN.z0 + BIN.z1) / 2];   // in the tub's frame

/**
 * A piece hopping between its place and the tub, s in [0, 1] from the start
 * of its hop: out (place -> tub) or in (tub -> place). Returns a pose, or
 * null when it is inside the tub.
 */
function hop(home, p, s, out, seed) {
  if (s <= 0 || s >= 1) return null;
  const jx = (hash(seed, 1) - 0.5) * 3, jz = (hash(seed, 2) - 0.5) * 1.6;
  const tq = tubPoint(MOUTH[0] + jx, MOUTH[1] - 1.3 * p.k, MOUTH[2] + jz * 0.5), tub = { x: tq[0], y: tq[1], z: tq[2] };
  const a = out ? home : tub, b = out ? tub : home;
  // Out: a short unclick (lift and a wiggle) before the throw.
  let u = s, lift = 0;
  if (out) {
    if (s < 0.22) {
      const w = s / 0.22;
      return { x: home.x, y: home.y + 0.35 * p.k * Math.sin(w * Math.PI * 0.5), z: home.z - 0.2 * w, R: axisAngle(0, 0, 1, 0.12 * Math.sin(w * TAU * 1.5)), seams: false };
    }
    u = (s - 0.22) / 0.78; lift = 0.35 * p.k;
  }
  const e = out ? u : ease.outQuad(u) * 0.35 + u * 0.65;
  const top = Math.max(a.y, b.y) + 0.8 + 0.8 * hash(seed, 3);
  const y0 = a.y + lift, y1 = b.y;
  // A parabola through y0 at 0, top near the middle, y1 at 1.
  const y = y0 + (y1 - y0) * e + 4 * (top - (y0 + y1) / 2) * e * (1 - e);
  // An end-over-end tumble, half a turn or a whole one.
  const spin = (hash(seed, 4) < 0.5 ? -1 : 1) * Math.PI * (1 + Math.floor(hash(seed, 5) * 2));
  const ang = out ? spin * e : spin * (1 - e);
  return {
    x: a.x + (b.x - a.x) * e, y, z: a.z + (b.z - a.z) * e,
    R: axisAngle(1, 0.15 * (hash(seed, 6) - 0.5), 0.35 * (hash(seed, 7) - 0.5), ang), seams: false,
  };
}

/** Squash on landing: dt seconds after a piece clicks into place. */
const squash = (dt) => (dt < 0 || dt > 0.22 ? 1 : 1 - 0.28 * Math.sin((dt / 0.22) * Math.PI) * (1 - dt / 0.22));

/**
 * The scattered flight of piece `p` from the smash: position at time
 * t (s) after impact, analytic, bouncing on the plate.
 */
function scatter(home, centre, p, t, seed) {
  const dx = home.x - centre[0], dl = Math.abs(dx) || 1;
  // Out sideways and up, a little away from the viewer: never at the lens.
  const sp = (2.5 + 3.5 * hash(seed, 7)) * (p.k > 1 ? 1.3 : 1);
  let vx = (dx / dl) * sp * (0.4 + Math.abs(dx) / 6) + (hash(seed, 8) - 0.5) * 3;
  let vz = (1 + 3 * hash(seed, 9)) * p.k;
  let vy = (3 + 5 * hash(seed, 10)) + home.y * 0.5;
  let x = home.x, y = home.y, z = home.z, tt = t;
  const floor = 0.6 * p.k;
  for (let b = 0; b < 4 && tt > 0; b++) {
    // Time to reach the floor from y with vy.
    const disc = vy * vy + 2 * G * (y - floor);
    const th = (vy + Math.sqrt(Math.max(0, disc))) / G;
    if (tt < th) { x += vx * tt; z += vz * tt; y += vy * tt - 0.5 * G * tt * tt; tt = 0; break; }
    x += vx * th; z += vz * th; y = floor; vy = -(vy - G * th) * 0.38; vx *= 0.55; vz *= 0.55; tt -= th;
  }
  if (tt > 0) { x += vx * Math.min(tt, 0.3); z += vz * Math.min(tt, 0.3); }
  const ang = (hash(seed, 11) < 0.5 ? -1 : 1) * (1.2 + 1.8 * hash(seed, 15)) * (1 - Math.exp(-t * 3));
  return { x, y, z, R: axisAngle(0.3 * (hash(seed, 12) - 0.5), 0.3 * (hash(seed, 13) - 0.5), 1, ang), seams: false };
}

const lerpPose = (a, b, e, R) => ({ x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, z: a.z + (b.z - a.z) * e, R, seams: false });

// ------------------------------------------------------------ the timeline

const OUT0 = -1.65, OUT_SPAN = 1.05, OUT_DUR = 0.6;   // the old digit comes apart before :00
const IN0 = -0.1, IN_SPAN = 1.0, IN_DUR = 0.62;       // the new one lands brick by brick after
const LIFT0 = -1.3, DROP = -0.26;                      // the hour: picked up, dropped at :00
const REB0 = 0.5, REB_DUR = 0.8;                       // the hour: back together

const homeOf = (slot, p) => ({ x: slot.x + p.cx, y: p.cy, z: slot.z + p.cz });
function order(pieces, topFirst) {
  return pieces.map((p, i) => i).sort((a, b) => (topFirst ? pieces[b].top - pieces[a].top || pieces[a].cx - pieces[b].cx : pieces[a].bottom - pieces[b].bottom || pieces[a].cx - pieces[b].cx));
}

/**
 * Every second a child's thumb presses one brick of the minutes home: it
 * is lifted a hair, wiggled, and clicked down with a squash. The thumb
 * works its way through the bricks in a shuffled order, a new brick each
 * second.
 */
function press(items, f) {
  const cand = items.filter((it) => it.p.k === 1 && it.atHome);
  if (!cand.length) return;
  const k = Math.floor(hash(f.minuteKey, f.s, 3) * cand.length), it = cand[k];
  const w = f.sec - f.s;
  if (w > 0.5) return;
  const up = Math.sin(Math.PI * clamp(w / 0.3, 0, 1));
  it.pose = { ...it.pose, y: it.pose.y + 0.3 * up, R: axisAngle(0, 0, 1, 0.07 * up * Math.sin(w * 40)), sq: squash(w - 0.3) };
}

/** Every piece to draw now: [{ p, pose, show }]. */
function scene(date, f) {
  const sec = f.sec;
  let oldF, newF, u = null;
  if (sec >= 60 + OUT0 - 0.3) { oldF = f; newF = clockFields(new Date(date.getTime() + 60000)); u = sec - 60; }
  else if (sec < 2.6) { oldF = previousMinute(date); newF = f; u = sec; }
  const digitsOf = (q) => [Math.floor(q.h / 10), q.h % 10, Math.floor(q.m / 10), q.m % 10];
  const items = [];
  const push = (p, pose, homeSet, atHome = homeSet !== null) => items.push({ p, pose, homeSet, atHome });
  const still = (slot, d, homeSet) => {
    for (const p of slot.font[d]) push(p, homeOf(slot, p), homeSet, true);
  };

  if (u === null) {
    const dg = digitsOf(f);
    SLOTS.forEach((s, i) => still(s, dg[i], null));
    press(items, f);
    return items;
  }
  const od = digitsOf(oldF), nd = digitsOf(newF);
  const seedBase = newF.h * 60 + newF.m;

  if (newF.m !== 0) {
    // A minute: the digits that change come apart into the tub, top brick
    // first, all gone by :00; the new ones are fished out of it before :00
    // and click home, bottom brick first, from just after :00. The tens go
    // a beat before the units.
    SLOTS.forEach((slot, si) => {
      if (od[si] === nd[si]) { still(slot, nd[si], null); return; }
      const lead = si === 2 && od[3] !== nd[3] ? 0.2 : 0;
      const oldP = slot.font[od[si]], newP = slot.font[nd[si]];
      {
        const ord = order(oldP, true), n = ord.length, home = new Array(oldP.length).fill(true);
        const start = (rank) => OUT0 - lead + (OUT_SPAN * rank) / Math.max(1, n - 1);
        ord.forEach((pi, rank) => { if (u > start(rank)) home[pi] = false; });
        ord.forEach((pi, rank) => {
          const p = oldP[pi], h = homeOf(slot, p), sv = (u - start(rank)) / OUT_DUR;
          if (sv <= 0) push(p, h, home);
          else { const pose = hop(h, p, sv, true, seedBase * 13 + si * 7 + pi); if (pose) push(p, pose, null); }
        });
      }
      {
        const ord = order(newP, false), n = ord.length, home = new Array(newP.length).fill(false);
        const land = (rank) => IN0 + lead * 0.5 + (IN_SPAN * rank) / Math.max(1, n - 1);
        ord.forEach((pi, rank) => { if (u >= land(rank)) home[pi] = true; });
        ord.forEach((pi, rank) => {
          const p = newP[pi], h = homeOf(slot, p), L = land(rank);
          if (u >= L) { push(p, { ...h, R: I3, sq: squash(u - L) }, home); return; }
          const pose = hop(h, p, (u - (L - IN_DUR)) / IN_DUR, false, seedBase * 17 + si * 5 + pi);
          if (pose) push(p, pose, null);
        });
      }
    });
    return items;
  }

  // The hour: the whole model is picked up, dropped, smashed, rebuilt.
  SLOTS.forEach((slot, si) => {
    const centre = si < 2 ? [SLOTS[1].x - 1, 0, SLOTS[1].z] : [SLOTS[3].x - 0.5, 0, SLOTS[3].z];
    const oldP = slot.font[od[si]], newP = slot.font[nd[si]];
    if (u < 0) {
      // Up it goes (wobbling in the hand), then down.
      let ly = 0, tilt = 0;
      if (u > LIFT0 && u < DROP) { const w = progress(u, LIFT0, LIFT0 + 0.7); ly = (slot.font === DUPLO_P ? 0.5 : 1.2) * ease.outBack(w); tilt = 0.05 * Math.sin((u - LIFT0) * 9) * w; }
      if (u >= DROP) { const w = (u - DROP) / -DROP; ly = (slot.font === DUPLO_P ? 0.5 : 1.2) * (1 - w * w); }
      const R = axisAngle(0, 0, 1, tilt), whole = oldP.map(() => true);
      for (const p of oldP) {
        const h = homeOf(slot, p);
        const rx = h.x - centre[0], ry = h.y;
        // Still one rigid model: drawn as at rest, hidden faces culled.
        push(p, { x: centre[0] + R[0] * rx + R[1] * ry, y: ly + R[3] * rx + R[4] * ry, z: h.z, R }, whole);
      }
      return;
    }
    // Old pieces fly apart; at REB0 each new piece takes over from one of
    // them (same slot) and flies home; leftovers drop into the tub.
    const nO = oldP.length, nN = newP.length;
    const taken = new Array(nO).fill(false), home = new Array(nN).fill(false);
    newP.forEach((p, j) => {
      const h = homeOf(slot, p);
      const k = j % nO; taken[k] = true;
      const seed = seedBase * 31 + si * 11 + k;
      const t0 = REB0 + 0.12 * (p.bottom / (5 * p.k));
      if (u < t0) { if (j < nO) push(oldP[k], scatter(homeOf(slot, oldP[k]), centre, oldP[k], u, seed), null); return; }
      const from = scatter(homeOf(slot, oldP[k]), centre, oldP[k], t0, seed);
      const e = progress(u, t0, t0 + REB_DUR);
      if (e >= 1) { home[j] = true; push(p, { ...h, R: I3, sq: squash(u - t0 - REB_DUR) }, home); return; }
      const ee = ease.inOutCubic(e);
      const pose = lerpPose(from, h, ee, null);
      pose.y += 3 * Math.sin(Math.PI * e);
      // Unwind the scatter spin.
      pose.R = mix(from.R, ee);
      if (j >= nO && e < 0.02) return;
      push(p, pose, null);
    });
    oldP.forEach((p, k) => {
      if (taken[k]) return;
      const seed = seedBase * 31 + si * 11 + k;
      if (u < REB0) { push(p, scatter(homeOf(slot, p), centre, p, u, seed), null); return; }
      const from = scatter(homeOf(slot, p), centre, p, REB0, seed);
      const s = (u - REB0) / 0.7;
      const pose = hop(from, p, 0.22 + s * 0.78, true, seed);
      if (pose) push(p, pose, null);
    });
  });
  return items;
}

/** Blend a rotation towards the identity: nlerp of the matrix, re-orthonormalised. */
function mix(R, e) {
  const m = R.map((v, i) => v * (1 - e) + I3[i] * e);
  const a = [m[0], m[3], m[6]], b = [m[1], m[4], m[7]];
  const na = Math.hypot(...a); a[0] /= na; a[1] /= na; a[2] /= na;
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  b[0] -= d * a[0]; b[1] -= d * a[1]; b[2] -= d * a[2];
  const nb = Math.hypot(...b); b[0] /= nb; b[1] /= nb; b[2] /= nb;
  const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return [a[0], b[0], c[0], a[1], b[1], c[1], a[2], b[2], c[2]];
}

// ------------------------------------------------------------ frame

const TMP = new Float64Array(3);
export default {
  name: 'Bricks',
  blurb: 'The time built from toy bricks in real 3D: the hour in big toddler bricks at the back, the minutes in studded bricks up front beside an upside-down giant brick used as the parts tub. Each minute the old numeral is unclicked brick by brick and tossed into the tub, and the new one is fished out and snapped together; on the hour the whole model is dropped, smashes, and the bricks fly back as the new time.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  frame(g, { date, fields: f, oled, night }) {
    BUF = g.buf;
    const day = date.getHours() * 3600 + date.getMinutes() * 60 + f.sec;
    // The hour's thump shakes the table.
    let shake = 0;
    const toTurn = f.sec < 3 && f.m === 0 ? f.sec : null;
    if (toTurn !== null) shake = 0.35 * Math.exp(-toTurn * 6) * Math.sin(toTurn * 70);
    setCamera(0.09 * Math.sin((day * TAU) / 47), 0.145 + 0.015 * Math.sin((day * TAU) / 31), 18, [2, 4.3 + shake, 0]);
    drawPlate();
    const items = scene(date, f);
    for (const it of items) { project(it.pose.x, it.pose.y, it.pose.z, TMP, 0); it.d = TMP[2]; it.pose.R ??= I3; }
    // The tub: inside first, front wall in its depth order.
    tp(MOUTH[0], 0, BIN.z1, TMP, 0); items.push({ tub: 0, d: TMP[2] });
    tp(MOUTH[0], BIN.h, BIN.z0, TMP, 0); items.push({ tub: 1, d: TMP[2] - 0.3 });
    // Painter's order. Bricks at rest are boxes on a grid, and for two
    // boxes apart along any axis the one on the far side from the eye goes
    // first; anything tumbling, or overlapping, falls back to depth.
    const C = cam.C;
    for (const it of items) {
      if (it.tub !== undefined) { it.bb = null; continue; }
      const P = it.pose, p = it.p;
      if (P.seams === false) { const r = p.rad; it.bb = [P.x - r, P.x + r, P.y - r, P.y + r, P.z - r, P.z + r]; }
      else it.bb = [P.x + p.bx[0], P.x + p.bx[1], P.y + p.by[0] * (P.sq ?? 1), P.y + p.by[1], P.z - p.cz, P.z + p.cz];
    }
    const E = 1e-6;
    items.sort((a, b) => {
      const A = a.bb, B = b.bb;
      if (A && B) {
        for (let k = 0; k < 3; k++) {
          const c = C[k];
          if (A[2 * k + 1] <= B[2 * k] + E) return c >= B[2 * k] ? -1 : c <= A[2 * k + 1] ? 1 : 0;
          if (B[2 * k + 1] <= A[2 * k] + E) return c >= A[2 * k] ? 1 : c <= B[2 * k + 1] ? -1 : 0;
        }
      }
      return b.d - a.d;
    });
    for (const it of items) {
      if (it.tub !== undefined) { drawTub(it.tub); continue; }
      const hs = it.homeSet;
      if (it.atHome) drawPiece(it.p, it.pose, (s) => s.cover < 0 || (hs !== null && !hs[s.cover]), (k) => hs === null || hs[k]);
      else drawPiece(it.p, it.pose, () => true, null);
    }
    oled.contrast(0xcf + (0x20 - 0xcf) * night);
  },
};
