// Origami — the time folded from paper.
//
// Each digit is one sheet of paper cut to a numeral on a 3 x 5 grid of
// panels, some of them half-panels cut on the diagonal, joined by creases.
// The front of the paper is white (a fine even grain, each panel catching
// the light a little differently, as a pressed sheet does), the back is a
// striped print, as origami paper is coloured on one side.
//
// The minute: each changing digit folds itself up. The creases form a
// tree (a spanning tree of the panels, rooted at its centre, so the folding
// takes as few steps as possible) and every flap rotates about its crease
// in 3D, valley-folded towards the viewer, leaves first and siblings
// together, carrying everything already folded onto it; in perspective, a
// flap swings up, grows as it nears the eye, shows its striped back and
// lands flat. Painter's order comes from a paper thickness bookkept fold by
// fold, so stacks layer correctly. The collapsed square takes a hop and a
// somersault across to where the new digit's sheet will unfold (the swap
// happens edge-on), and the new digit unfolds as the time-reverse of its
// own folding, springing flat with a little overshoot.
//
// The hour: all four digits fold into squares, which fly together into one
// big sheet; that sheet folds in half on its diagonal, then in half again,
// and opens into a crane, which flaps its wings and flies a loop round the
// glass. It lands, folds back into the sheet, the sheet comes apart into
// four squares, and each flies home and unfolds into the new hour.
//
// The colon is two small paper squares turning on a thread.
//
// A pure function of the clock: fold trees and schedules are built once per
// digit; every crease angle is a closed-form function of seconds from the
// turn.
//
// Burn-in: the face walks kit.orbit, the paper is a grain (dither) rather
// than solid white, the colon turns, and 23:00-07:00 the panel dims.

import { Gfx, dither, orbit, clockFields, previousMinute } from '../js/kit.js';

const W = 128, H = 64;
const CW = 8, CH = 9;                    // a panel
const DW = 3 * CW, DH = 5 * CH;          // a digit's sheet: 24 x 45
const TOP = 9;
const SLOT_X = [4, 32, 72, 100];
const COLON_X = 64;
const FOCAL = 170;                       // camera distance, px (perspective)
const EPS = 0.03;                        // paper thickness, px (for layering only)

const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
const inOut = (u) => { u = clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2; };
const lerp = (a, b, u) => a + (b - a) * u;

function hash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ------------------------------------------------------------ letterforms
// Rows of three panels: F full, . none, and half-panels cut on a diagonal,
// named by the corner they lack: a top-left, b top-right, c bottom-right,
// d bottom-left.

const SHEETS = {
  0: ['aFb', 'F.F', 'F.F', 'F.F', 'dFc'],
  1: ['aF.', '.F.', '.F.', '.F.', 'FFF'],
  2: ['aFb', '..F', 'aFc', 'F..', 'FFF'],
  3: ['FFb', '..F', '.FF', '..F', 'FFc'],
  4: ['.aF', 'acF', 'FFF', '..F', '..F'],
  5: ['FFF', 'F..', 'FFb', '..F', 'FFc'],
  6: ['aFc', 'F..', 'FFb', 'F.F', 'dFc'],
  7: ['FFF', '..F', '.ac', '.F.', '.F.'],
  8: ['aFb', 'F.F', 'FFF', 'F.F', 'dFc'],
};
// 9 is 6 turned over: rows and columns reversed, each half-panel's missing corner turned.
SHEETS[9] = SHEETS[6].map((row) => [...row].reverse().map((ch) => ({ a: 'c', b: 'd', c: 'a', d: 'b' }[ch] ?? ch)).join('')).reverse();

// Which sides of a panel are whole (and so can carry a crease): top, right, bottom, left.
const SIDES = { F: [1, 1, 1, 1], a: [0, 1, 1, 0], b: [0, 0, 1, 1], c: [1, 0, 0, 1], d: [1, 1, 0, 0] };
// A panel's outline, corners in its own box (0..1), clockwise from top-left.
const CORNERS = { F: [[0, 0], [1, 0], [1, 1], [0, 1]], a: [[1, 0], [1, 1], [0, 1]], b: [[0, 0], [1, 1], [0, 1]], c: [[0, 0], [1, 0], [0, 1]], d: [[0, 0], [1, 0], [1, 1]] };

/**
 * A digit's sheet as a fold tree: panels, the crease each folds on, and a
 * schedule. Times are in fold steps; a panel's crease folds once everything
 * hanging from it has folded (its height in the tree), siblings together.
 */
function buildSheet(d) {
  const tiles = [];
  SHEETS[d].forEach((row, r) => [...row].forEach((ch, c) => { if (ch !== '.') tiles.push({ r, c, type: ch }); }));
  const at = (r, c) => tiles.findIndex((t) => t.r === r && t.c === c);
  const nb = tiles.map(() => []);
  tiles.forEach((t, i) => {
    const s = SIDES[t.type];
    const right = at(t.r, t.c + 1), down = at(t.r + 1, t.c);
    if (right >= 0 && s[1] && SIDES[tiles[right].type][3]) { nb[i].push(right); nb[right].push(i); }
    if (down >= 0 && s[2] && SIDES[tiles[down].type][0]) { nb[i].push(down); nb[down].push(i); }
  });
  const bfs = (root) => {
    const dist = tiles.map(() => -1), par = tiles.map(() => -1), order = [root];
    dist[root] = 0;
    for (let k = 0; k < order.length; k++)
      for (const j of nb[order[k]]) if (dist[j] < 0) { dist[j] = dist[order[k]] + 1; par[j] = order[k]; order.push(j); }
    return { dist, par, order, ecc: Math.max(...dist) };
  };
  // Root: the panel the sheet folds down onto. The centre of the tree (fewest
  // steps), nearest the middle of the digit on ties.
  let best = null;
  tiles.forEach((t, i) => {
    const b = bfs(i);
    const key = b.ecc * 100 + Math.abs(t.c - 1) * 10 + Math.abs(t.r - 2) + (t.type === 'F' ? 0 : 5);
    if (!best || key < best.key) best = { key, i, ...b };
  });
  const { i: root, par, order } = best;
  // Height of each panel's subtree, and children.
  const kids = tiles.map(() => []);
  par.forEach((p, i) => { if (p >= 0) kids[p].push(i); });
  const height = tiles.map(() => 0);
  for (let k = order.length - 1; k >= 0; k--) {
    const i = order[k];
    for (const j of kids[i]) height[i] = Math.max(height[i], height[j] + 1);
  }
  // Creases: the shared side of each panel and its parent, as a hinge line
  // (point, direction along it, and the in-plane normal towards the child).
  const hinges = tiles.map((t, i) => {
    const p = par[i];
    if (p < 0) return null;
    const q = tiles[p];
    if (q.r === t.r) {
      const x = Math.max(t.c, q.c) * CW;
      return { hx: x - 0.5, hy: t.r * CH, ex: 0, ey: 1, ox: t.c > q.c ? 1 : -1, oy: 0 };
    }
    const y = Math.max(t.r, q.r) * CH;
    return { hx: t.c * CW, hy: y - 0.5, ex: 1, ey: 0, ox: 0, oy: t.r > q.r ? 1 : -1 };
  });
  // Fold order: by height (leaves first); bookkeep layers so each fold's
  // hinge sits above what is already stacked, and stacks layer correctly.
  const layers = tiles.map(() => 0);
  const seq = tiles.map((_, i) => i).filter((i) => par[i] >= 0).sort((p, q) => height[p] - height[q] || p - q);
  for (const i of seq) {
    const p = par[i];
    hinges[i].hz = (EPS * (layers[p] + layers[i] + 1)) / 2;
    layers[p] += layers[i] + 1;
  }
  // Path from each panel up to the root (its own crease first).
  const path = tiles.map((_, i) => { const out = []; for (let j = i; par[j] >= 0; j = par[j]) out.push(j); return out; });
  const steps = Math.max(...height);
  for (const t of tiles) {
    t.poly = CORNERS[t.type].map(([u, v]) => [(t.c + u) * CW - u, (t.r + v) * CH - v]);
    t.ctr = [(t.c + 0.5) * CW, (t.r + 0.5) * CH];
    t.relief = 0;
    t.side = (t.r + t.c) & 1 ? 1 : -1;
  }
  return { tiles, par, root, height, hinges, path, steps, kids, digit: d };
}
const SHEET = {};
for (let d = 0; d <= 9; d++) SHEET[d] = buildSheet(d);

// ------------------------------------------------------------ kinematics

const STEP = 0.16, DUR = 0.3;            // s between fold steps, s per fold
const foldTime = (sh) => sh.steps * STEP + DUR;

/** Crease angles of a sheet `t` seconds into folding up (0 flat, pi folded). */
function foldAngles(sh, t, out) {
  for (let i = 0; i < sh.tiles.length; i++) out[i] = sh.par[i] < 0 ? 0 : Math.PI * inOut((t - sh.height[i] * STEP) / DUR);
  return out;
}

/** Crease angles while unfolding, `t` s in: the reverse of folding, springing flat with an overshoot. */
function unfoldAngles(sh, t, out) {
  const T = foldTime(sh);
  for (let i = 0; i < sh.tiles.length; i++) {
    if (sh.par[i] < 0) { out[i] = 0; continue; }
    const u = (t - (T - sh.height[i] * STEP - DUR)) / DUR;
    const e = u <= 0 ? 0 : u >= 1 ? 1 : 1 + 2.2 * (u - 1) ** 3 + 1.2 * (u - 1) ** 2;
    out[i] = Math.PI * (1 - e);
  }
  return out;
}

/** Rotate point p (in place) about crease h by angle th. */
function crease(p, h, th) {
  const qx = p[0] - h.hx, qy = p[1] - h.hy;
  const a = qx * h.ex + qy * h.ey, d = qx * h.ox + qy * h.oy, w = p[2] - h.hz;
  const c = Math.cos(th), s = Math.sin(th);
  const d2 = d * c - w * s;
  p[0] = h.hx + a * h.ex + d2 * h.ox;
  p[1] = h.hy + a * h.ey + d2 * h.oy;
  p[2] = d * s + w * c + h.hz;
}

/**
 * A sheet posed: every panel's corners and centre in 3D (sheet coordinates,
 * px), after its chain of creases, then `xf` (a rigid move of the whole
 * sheet into the scene).
 */
function poseSheet(sh, ang, xf) {
  const out = [];
  for (let i = 0; i < sh.tiles.length; i++) {
    const t = sh.tiles[i];
    const pts = t.poly.map(([x, y]) => [x, y, 0]);
    const uv = t.poly;
    const ctr = [t.ctr[0], t.ctr[1], 0];
    const nrm = [0, 0, 1];
    const all = [...pts, ctr];
    for (const j of sh.path[i]) {
      for (const p of all) crease(p, sh.hinges[j], ang[j]);
      // The normal turns with the panel.
      const h = sh.hinges[j], c = Math.cos(ang[j]), s = Math.sin(ang[j]);
      const d = nrm[0] * h.ox + nrm[1] * h.oy, a = nrm[0] * h.ex + nrm[1] * h.ey, w = nrm[2];
      const d2 = d * c - w * s;
      nrm[0] = a * h.ex + d2 * h.ox; nrm[1] = a * h.ey + d2 * h.oy; nrm[2] = d * s + w * c;
    }
    for (const p of all) xf(p);
    xf.normal?.(nrm);
    out.push({ pts, uv, ctr, nrm, relief: t.relief, side: t.side });
  }
  return out;
}

const project = (p) => {
  const s = FOCAL / (FOCAL - p[2]);
  return [W / 2 + (p[0] - W / 2) * s, H / 2 + (p[1] - H / 2) * s];
};

// ------------------------------------------------------------ paper

const LIGHT = (() => { const v = [-0.4, -0.6, 0.7]; const l = Math.hypot(...v); return v.map((c) => c / l); })();
const FRONT = 0.76;                    // the white side's grain at rest

/**
 * One panel, opaque: clears what is behind it (and a hairline round it, the
 * crease), then lays its face: the white side as an even grain lit by its
 * normal, the back as a striped print.
 */
function drawPanel(g, panel) {
  const P = panel.pts.map(project), UV = panel.uv, n = panel.nrm;
  const front = n[2] >= 0;
  const s = front ? 1 : -1;
  const dl = s * (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
  const lev = Math.max(0, (front ? FRONT : 0.75) * (0.25 + 0.75 * dl / LIGHT[2]) + panel.relief);
  let area = 0;
  for (let i = 0; i < P.length; i++) { const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length]; area += x1 * y2 - x2 * y1; }
  const wind = area >= 0 ? 1 : -1;
  const ne = P.length, E = EDGES;
  for (let i = 0; i < ne; i++) {
    const x1 = P[i][0], y1 = P[i][1], x2 = P[(i + 1) % ne][0], y2 = P[(i + 1) % ne][1];
    const l = Math.hypot(x2 - x1, y2 - y1) || 1;
    E[4 * i] = x1; E[4 * i + 1] = y1; E[4 * i + 2] = (wind * (x2 - x1)) / l; E[4 * i + 3] = (wind * (y2 - y1)) / l;
  }
  // Screen -> sheet coordinates, per triangle of the fan: u = a0 + a1 dx + a2 dy.
  let nt = 0;
  const TR = TRIS;
  for (let k = 1; k < ne - 1; k++) {
    const x0 = P[0][0], y0 = P[0][1], x1 = P[k][0], y1 = P[k][1], x2 = P[k + 1][0], y2 = P[k + 1][1];
    const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(det) < 1e-6) continue;
    // Barycentrics a, b as linear functions of (px - x0, py - y0).
    const aX = (y2 - y0) / det, aY = -(x2 - x0) / det, bX = -(y1 - y0) / det, bY = (x1 - x0) / det;
    const o = nt * 12;
    TR[o] = x0; TR[o + 1] = y0; TR[o + 2] = aX; TR[o + 3] = aY; TR[o + 4] = bX; TR[o + 5] = bY;
    TR[o + 6] = UV[0][0]; TR[o + 7] = UV[0][1];
    TR[o + 8] = UV[k][0] - UV[0][0]; TR[o + 9] = UV[k][1] - UV[0][1];
    TR[o + 10] = UV[k + 1][0] - UV[0][0]; TR[o + 11] = UV[k + 1][1] - UV[0][1];
    nt++;
  }
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (const [x, y] of P) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
  const bx0 = Math.max(0, Math.floor(minx - 1)), bx1 = Math.min(W - 1, Math.ceil(maxx + 1));
  const by0 = Math.max(0, Math.floor(miny - 1)), by1 = Math.min(H - 1, Math.ceil(maxy + 1));
  const edgeOn = Math.abs(n[2]) < 0.3 || nt === 0;
  const outline = panel.outline, side = panel.side;
  for (let y = by0; y <= by1; y++)
    for (let x = bx0; x <= bx1; x++) {
      const px = x + 0.5, py = y + 0.5;
      let dmin = Infinity;
      for (let i = 0; i < ne; i++) {
        const dd = E[4 * i + 2] * (py - E[4 * i + 1]) - E[4 * i + 3] * (px - E[4 * i]);
        if (dd < dmin) dmin = dd;
      }
      if (dmin < -0.7) continue;
      if (outline && dmin >= -0.2 && dmin < 1.2) { g.pixel(x, y, 1); continue; }
      if (dmin < 0.5 || edgeOn) { g.pixel(x, y, 0); continue; }
      // Which fan triangle, and where on the sheet.
      let u = 0, v = 0;
      for (let k = 0; k < nt; k++) {
        const o = k * 12, dx = px - TR[o], dy = py - TR[o + 1];
        const a = TR[o + 2] * dx + TR[o + 3] * dy, b = TR[o + 4] * dx + TR[o + 5] * dy;
        u = TR[o + 6] + a * TR[o + 8] + b * TR[o + 10];
        v = TR[o + 7] + a * TR[o + 9] + b * TR[o + 11];
        if (a >= -0.01 && b >= -0.01 && a + b <= 1.01) break;
      }
      const ui = Math.floor(u), vi = Math.floor(v);
      // Each panel is pressed with a faint diagonal crease: two facets, one lighter.
      let on;
      if (front) {
        const fu = (u % CW) / CW, fv = (v % CH) / CH;
        on = dither(ui, vi, lev + (fu + fv < 1 ? 0.12 : -0.12) * side);
      } else on = dmin < 1.5 ? lev > 0.1 : (ui + vi) % 3 === 0 ? lev > 0.12 : dither(ui, vi, lev * 0.2);
      g.pixel(x, y, on ? 1 : 0);
    }
  // Seen edge-on, paper is a bright line.
  if (edgeOn) {
    let bi = 0, bj = 1, bd = -1;
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const d = Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]);
      if (d > bd) { bd = d; bi = i; bj = j; }
    }
    g.line(Math.floor(P[bi][0]), Math.floor(P[bi][1]), Math.floor(P[bj][0]), Math.floor(P[bj][1]));
  }
}

const EDGES = new Float64Array(16), TRIS = new Float64Array(48);

/** Draw posed panels back to front (paper thickness keeps stacks in order). */
function drawPanels(g, panels) {
  panels.sort((p, q) => p.ctr[2] - q.ctr[2]);
  for (const p of panels) drawPanel(g, p);
}

/**
 * A rigid move from sheet coordinates into the scene: about a pivot (sheet
 * coordinates), turn in the plane by `rot`, tumble about the horizontal by
 * `tumble`, then put the pivot at (x, y, z) on the scene.
 */
function rigid({ px = 0, py = 0, rot = 0, tumble = 0, x = 0, y = 0, z = 0 }) {
  const cr = Math.cos(rot), sr = Math.sin(rot), ct = Math.cos(tumble), st = Math.sin(tumble);
  const turn = (v) => {
    const a = v[0] * cr - v[1] * sr, b = v[0] * sr + v[1] * cr, c = v[2];
    v[0] = a; v[1] = b * ct - c * st; v[2] = b * st + c * ct;
  };
  const f = (p) => { p[0] -= px; p[1] -= py; turn(p); p[0] += x; p[1] += y; p[2] += z; };
  f.normal = turn;
  return f;
}
/** Sheet placed with its origin at (x0, y0); tumbling about (cx, cy) if asked. */
function placement(x0, y0, { cx = 0, cy = 0, tumble = 0, dz = 0 } = {}) {
  return rigid({ px: cx, py: cy, tumble, x: x0 + cx, y: y0 + cy, z: dz });
}

const ANG = new Float64Array(16);
function drawSheet(g, sh, ang, xf) { drawPanels(g, poseSheet(sh, ang, xf)); }

// A digit lying flat looks the same wherever it lies (whole-pixel moves, no
// perspective at z = 0), so its pixels are drawn once and reused.
const FLAT = {};
function drawFlat(g, d, X0, Y0) {
  let pix = FLAT[d];
  if (!pix) {
    const tmp = new Gfx(W, H), ZERO = new Float64Array(16);
    drawSheet(tmp, SHEET[d], ZERO, placement(8, 8));
    pix = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (tmp.get(x, y)) pix.push(x - 8, y - 8);
    FLAT[d] = pix = Int16Array.from(pix);
  }
  for (let i = 0; i < pix.length; i += 2) g.pixel(X0 + pix[i], Y0 + pix[i + 1]);
}

// ------------------------------------------------------------ the hour's sheet and crane

// The big sheet the four squares join into: 18 px square, creased on both
// diagonals and both midlines (eight triangles round the centre), as a fold
// tree: fold 1 is the diagonal TL-BR (two creases on one line), fold 2 the
// half-diagonal BL-C, which folds the triangle in half.
const BS = 18;
const BIG = (() => {
  const C = [BS / 2, BS / 2], TL = [0, 0], TM = [BS / 2, 0], TR = [BS, 0], RM = [BS, BS / 2];
  const BR = [BS, BS], BM = [BS / 2, BS], BL = [0, BS], LM = [0, BS / 2];
  const polys = [[C, BL, LM], [C, LM, TL], [C, TL, TM], [C, TM, TR], [C, BM, BL], [C, BR, BM], [C, RM, BR], [C, TR, RM]];
  const par = [-1, 0, 1, 2, 0, 4, 5, 6];
  const hingeOn = [null, [C, LM], [C, TL], [C, TM], [C, BL], [C, BM], [C, BR], [C, RM]];
  const fold = [0, 0, 1, 0, 2, 0, 1, 0];          // which fold moves each crease
  const hzs = [0, 0, 0.5, 0, 1.5, 0, 0.5, 0];
  const tiles = polys.map((poly, i) => ({
    poly, ctr: [(poly[0][0] + poly[1][0] + poly[2][0]) / 3, (poly[0][1] + poly[1][1] + poly[2][1]) / 3],
    relief: (hash(i, 3, 5) - 0.5) * 0.12, side: i & 1 ? 1 : -1,
  }));
  const hinges = hingeOn.map((hh, i) => {
    if (!hh) return null;
    const [A, B] = hh, l = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const ex = (B[0] - A[0]) / l, ey = (B[1] - A[1]) / l;
    let ox = -ey, oy = ex;
    if ((tiles[i].ctr[0] - A[0]) * ox + (tiles[i].ctr[1] - A[1]) * oy < 0) { ox = -ox; oy = -oy; }
    return { hx: A[0], hy: A[1], ex, ey, ox, oy, hz: hzs[i] * EPS };
  });
  const path = tiles.map((_, i) => { const out = []; for (let j = i; par[j] >= 0; j = par[j]) out.push(j); return out; });
  return { tiles, par, hinges, path, fold, C };
})();
function bigAngles(f1, f2, out) {
  for (let i = 0; i < BIG.tiles.length; i++) out[i] = BIG.fold[i] === 1 ? Math.PI * f1 : BIG.fold[i] === 2 ? Math.PI * f2 : 0;
  return out;
}

/**
 * The crane, as paper faces in its own frame (x forward, y down, z towards
 * the viewer when side-on), origin at the middle of its base line. `open`
 * 0 is the folded triangle (wings up together, neck and tail along the base),
 * 1 the crane; `flap` is the wings' angle from upright.
 */
function craneFaces(open, flap) {
  const F = [];
  const tri = (a, b, c) => F.push([a, b, c]);
  // Neck and tail: inside-reverse folds pulled up out of the base; the head
  // is one more reverse fold at the neck's tip.
  const limb = (sx, ang, len, head) => {
    const r = [sx * 3, 0, 0];
    const a = -ang * open, L = 6 + len * open;
    const tip = [r[0] + sx * L * Math.cos(a), L * Math.sin(a), 0];
    tri(r, [sx * (3 + 3 * open), 1 + 2 * open, 0], tip);
    if (head) tri(tip, [tip[0] + sx * 3.8 * open, tip[1] + 2.2 * open, 0], [tip[0] + sx * 0.6 * open, tip[1] + 2 * open, 0]);
  };
  limb(1, 1.0, 9.5, true);
  limb(-1, 0.78, 8.5, false);
  // The body hangs below the back, a shallow pyramid.
  tri([-6, 0, 0], [6, 0, 0], [0, 5 * open, 2.2 * open]);
  tri([6, 0, 0], [-6, 0, 0], [0, 5 * open, -2.2 * open]);
  // The wings: broad triangles hinged along the back.
  const L = 9 + 6 * open;
  for (const sz of [1, -1]) tri([-7 + open, 0, 0], [7 - open, 0, 0], [-3 * open, -L * Math.cos(flap), sz * L * Math.sin(flap)]);
  return F;
}

/** The crane, posed in the scene and drawn. */
function drawCrane(g, open, flap, { x, y, z = 0, yaw = 0, roll = 0, scale = 1 }) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cr = Math.cos(roll), sr = Math.sin(roll);
  const xf = (p) => {
    let [a, b, c] = p;
    a *= scale; b *= scale; c *= scale;
    const b1 = b * cr - c * sr, c1 = b * sr + c * cr;           // roll about the body axis
    const a2 = a * cy - c1 * sy, c2 = a * sy + c1 * cy;           // heading
    return [x + a2, y + b1, z + c2];
  };
  const panels = craneFaces(open, flap).map((f) => {
    const pts = f.map(xf);
    const u = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]];
    const v = [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...n) || 1;
    n = n.map((c) => c / l);
    const ctr = [0, 1, 2].map((k) => (pts[0][k] + pts[1][k] + pts[2][k]) / 3);
    return { pts, uv: f.map((q) => [q[0] * 1.6 + 20, q[1] * 1.6 + 20]), ctr, nrm: n, relief: 0.1, side: 1, outline: true };
  });
  drawPanels(g, panels);
}

// ------------------------------------------------------------ the colon

function drawColon(g, x, y, phi) {
  const r = 3.5, c = Math.cos(phi), s = Math.sin(phi);
  const pts = [[-r, -r], [r, -r], [r, r], [-r, r]].map(([u, v]) => [x + u * c, y + v, u * s]);
  drawPanel(g, { pts, uv: [[0, 0], [7, 0], [7, 7], [0, 7]], ctr: [x, y, 0], nrm: [-s, 0, c], relief: 0.1, side: 1 });
  // The thread it turns on.
  for (let k = 3; k < 6; k++) g.pixel(Math.floor(x), Math.floor(y - r - k + 0.5));
}

// ------------------------------------------------------------ the minute

const HOP0 = -0.5, HOP1 = 0.55;          // the folded square's hop, s from :00
const UNFOLD0 = 0.6;
const LIFT = 0.45;                       // anticipation: the flaps lift and settle before folding
const SWAP_U = 0.397;                    // where the somersault is edge-on (inOut(u) = 1/4)

const rootCentre = (sh) => { const t = sh.tiles[sh.root]; return [(t.c + 0.5) * CW - 0.5, (t.r + 0.5) * CH - 0.5]; };

function minuteSlot(g, so, sn, tl, X0, Y0) {
  const fo = foldTime(so), start = HOP0 - 0.1 - fo;
  if (tl < HOP0) return minuteFold(g, so, tl - start, X0, Y0);
  if (tl < HOP1) {
    const u = (tl - HOP0) / (HOP1 - HOP0);
    const ro = rootCentre(so), rn = rootCentre(sn);
    const m = smooth(u);
    const px = lerp(ro[0], rn[0], m), py = lerp(ro[1], rn[1], m) - 7 * Math.sin(Math.PI * u);
    const tumble = 2 * Math.PI * inOut(u), dz = 22 * Math.sin(Math.PI * u);
    const [sh, r] = u < SWAP_U ? [so, ro] : [sn, rn];
    for (let i = 0; i < sh.tiles.length; i++) ANG[i] = sh.par[i] < 0 ? 0 : Math.PI;
    return drawSheet(g, sh, ANG, placement(X0 + px - r[0], Y0 + py - r[1], { cx: r[0], cy: r[1], tumble, dz }));
  }
  if (tl - UNFOLD0 >= foldTime(sn)) return drawFlat(g, sn.digit, X0, Y0);
  drawSheet(g, sn, unfoldAngles(sn, tl - UNFOLD0, ANG), placement(X0, Y0));
}

// ------------------------------------------------------------ the hour

const H_FOLDED = -1.7;                   // every digit is a square by now (+0.1 per slot)
const G1 = -0.75, F1 = -0.42, F2 = -0.08, ROT = 0.28, OPEN = 0.75, FLY = 3.35, CLOSE = 3.75;
const UNROT = 4.05, UF2 = 4.35, UF1 = 4.7, SPLIT = 5.4, UNF = 5.45;
const QUAD = [[4.5, 4.5], [13.5, 4.5], [4.5, 13.5], [13.5, 13.5]];

function flatAngles(sh, out) { for (let i = 0; i < sh.tiles.length; i++) out[i] = sh.par[i] < 0 ? 0 : Math.PI; return out; }

/** A folded stack flying from one place to another with a somersault; swaps sheets edge-on. */
function hop(g, shA, rA, shB, rB, from, to, u, lift = 7) {
  const m = smooth(u);
  const x = lerp(from[0], to[0], m), y = lerp(from[1], to[1], m) - lift * Math.sin(Math.PI * u);
  const tumble = 2 * Math.PI * inOut(u), z = 20 * Math.sin(Math.PI * u);
  const [sh, r] = u < SWAP_U || !shB ? [shA, rA] : [shB, rB];
  drawSheet(g, sh, flatAngles(sh, ANG), rigid({ px: r[0], py: r[1], tumble, x, y, z }));
}

const CARD = (() => {
  const poly = [[0, 0], [8, 0], [8, 8], [0, 8]];
  return { tiles: [{ poly, ctr: [4.5, 4.5], relief: 0, side: 1 }], par: [-1], path: [[]], hinges: [null] };
})();

/** The flight, w 0..1: off to the right and out of the glass, back in from the left, home. */
function cranePath(w) {
  let dx = 150 * w;
  if (dx > 75) dx -= 150;
  return [dx, -9 * Math.sin(2 * Math.PI * w) - 3 * Math.sin(Math.PI * w), 0];
}

function hourShow(g, A, B, tau, ox, Y0, T) {
  const BX = COLON_X + ox, BY = Y0 + 22;
  const quadScreen = (k) => [BX - BS / 2 + QUAD[k][0], BY - BS / 2 + QUAD[k][1]];
  if (tau < G1) {
    for (let k = 0; k < 4; k++) {
      const so = SHEET[+A[k]], X0 = SLOT_X[k] + ox, E = H_FOLDED + 0.1 * k;
      if (tau < E) { minuteFold(g, so, tau - (E - foldTime(so)), X0, Y0); continue; }
      const r = rootCentre(so), u = (tau - E) / (G1 - E);
      hop(g, so, r, null, null, [X0 + r[0], Y0 + r[1]], quadScreen(k), u, 10);
    }
    return;
  }
  const LMx = 0, LMy = BS / 2;
  if (tau < ROT) {
    const e1 = smooth((tau - G1) / (F1 - G1)), e2 = inOut((tau - F1) / (F2 - F1));
    const r = inOut((tau - F2) / (ROT - F2));
    // Turned in the plane about the hypotenuse's middle, so the triangle stands on its long side.
    const pivot = [lerp(BX - BS / 2 + LMx, BX, r), lerp(BY - BS / 2 + LMy, BY + 4, r)];
    return drawSheet(g, BIG, bigAngles(e1, e2, ANG), rigid({ px: LMx, py: LMy, rot: (-Math.PI / 2) * r, x: pivot[0], y: pivot[1] }));
  }
  if (tau < CLOSE) {
    // Open into a crane, fly a loop, land.
    let open, w = 0;
    if (tau < OPEN) open = smooth((tau - ROT) / (OPEN - ROT));
    else if (tau < FLY) { open = 1; const u = (tau - OPEN) / (FLY - OPEN); w = u - Math.sin(2 * Math.PI * u) / (2 * Math.PI); }
    else open = 1 - smooth((tau - FLY) / (CLOSE - FLY));
    const [dx, dy, dz] = cranePath(w);
    const beat = Math.sin(2 * Math.PI * 2.4 * (tau - ROT));
    const flap = open * (1.05 + 0.8 * beat) ;
    const view = 0.6 * open;
    // Opening, the crane rises towards the eye (so it grows in perspective).
    return drawCrane(g, open, flap, { x: BX + dx, y: BY + 4 + dy - 1.2 * open * Math.cos(2 * Math.PI * 2.4 * (tau - ROT)) + 3 * open, z: dz + 62 * open,
      yaw: view + 0.15 * Math.sin(2 * Math.PI * w), roll: 0.2 * Math.sin(2 * Math.PI * w), scale: 1 });
  }
  if (tau < UF1) {
    const r = 1 - inOut((tau - CLOSE) / (UNROT - CLOSE));
    const e2 = 1 - inOut((tau - UNROT) / (UF2 - UNROT)), e1 = 1 - smooth((tau - UF2) / (UF1 - UF2));
    const pivot = [lerp(BX - BS / 2 + LMx, BX, r), lerp(BY - BS / 2 + LMy, BY + 4, r)];
    return drawSheet(g, BIG, bigAngles(e1, e2, ANG), rigid({ px: LMx, py: LMy, rot: (-Math.PI / 2) * r, x: pivot[0], y: pivot[1] }));
  }
  // The sheet comes apart into four squares; each flies home and unfolds into the new hour.
  for (let k = 0; k < 4; k++) {
    const sn = SHEET[+B[k]], X0 = SLOT_X[k] + ox, rn = rootCentre(sn);
    const s0 = UF1 + 0.05 + 0.06 * k, u = (tau - s0) / (SPLIT - UF1 - 0.05);
    if (u < 1) {
      if (u <= 0) { drawSheet(g, CARD, [0], rigid({ px: 4, py: 4, x: quadScreen(k)[0], y: quadScreen(k)[1] })); continue; }
      hop(g, CARD, [4, 4], sn, rn, quadScreen(k), [X0 + rn[0], Y0 + rn[1]], u, 9);
      continue;
    }
    const tu = tau - (UNF + 0.06 * k + 0.12);
    if (tu >= foldTime(sn)) drawFlat(g, sn.digit, X0, Y0);
    else drawSheet(g, sn, unfoldAngles(sn, tu, ANG), placement(X0, Y0));
  }
}

/** Folding up (with the anticipating lift), `t` seconds from the start of the folds. */
function minuteFold(g, so, t, X0, Y0) {
  if (t < -LIFT) return drawFlat(g, so.digit, X0, Y0);
  if (t < 0) {
    const k = Math.sin((Math.PI * (t + LIFT)) / LIFT) ** 2 * 0.32;
    for (let i = 0; i < so.tiles.length; i++) ANG[i] = so.par[i] < 0 ? 0 : k * (so.height[i] === 0 ? 1 : 0.35);
    return drawSheet(g, so, ANG, placement(X0, Y0));
  }
  drawSheet(g, so, foldAngles(so, t, ANG), placement(X0, Y0));
}

// ------------------------------------------------------------ the face

const DIG = (c) => `${c.hh}${c.mm}`;

export default {
  name: 'Origami',
  blurb: 'Paper digits that fold: each minute the changing digit folds itself up crease by crease into a square, somersaults, and unfolds into the next; on the hour the paper becomes a crane.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { date, fields: f, oled, night }) {
    const [ox, oy] = orbit(date, 2, 3);
    const late = f.sec >= 50;
    const from = late ? f : previousMinute(date);
    const to = late ? clockFields(new Date(date.getTime() + 60000)) : f;
    const tau = late ? f.sec - 60 : f.sec;
    const A = DIG(from), B = DIG(to);
    const Y0 = TOP + oy;
    const T = (date.getTime() / 1000) % 3600;

    // On the hour the colon is hoisted out of the way on its threads.
    const hoist = B.slice(2) === '00' ? -70 * smooth((tau + 1.3) / 0.7) * (1 - smooth((tau - 5.2) / 0.8)) : 0;
    drawColon(g, COLON_X + ox, Y0 + 14 + hoist, (2 * Math.PI * T) / 6);
    drawColon(g, COLON_X + ox, Y0 + 32 + hoist, (2 * Math.PI * T) / 6 + 1.9);

    if (B.slice(2) === '00') { hourShow(g, A, B, tau, ox, Y0, T); oled.contrast(0xcf + (0x20 - 0xcf) * night); return; }
    const changing = [];
    for (let k = 3; k >= 0; k--) if (A[k] !== B[k]) changing.push(k);
    for (let k = 0; k < 4; k++) {
      const X0 = SLOT_X[k] + ox;
      const i = changing.indexOf(k);
      if (i < 0) { drawFlat(g, +B[k], X0, Y0); continue; }
      minuteSlot(g, SHEET[+A[k]], SHEET[+B[k]], tau - 0.3 * i, X0, Y0);
    }
    oled.contrast(0xcf + (0x20 - 0xcf) * night);
  },
};
