// Rope Yarn — the time in sailor's ropework, in real 3D.
//
// Every numeral is one laid rope: a tube with three right-hand strands,
// shaded from a light up-left, ray-stamped into a depth buffer so where the
// rope crosses itself (the tail of the 0, the hook of the 7, the turn of the
// 8, the doubled stem of the 1 and 4) one part really passes in front of the
// other, and a depth pass cuts a dark gap along every near edge.
//
// The hours hang from the ship's near yard, each with a round turn over the
// spar. The minutes are ONE rope rove over a big sheave: one fall is tied
// into the tens, the other into the units, so as the hour goes by the rope
// creeps through the block (the units sink as the tens rise) and at the hour
// it runs back. The ship rolls on a slow swell; the ropes hang plumb under
// it, lagging, and twist slowly about their falls; the camera eases round.
//
// The minute: the knot comes undone from its end backwards, the freed rope
// drops away as a swinging tail, then is drawn back up and tied into the
// new numeral, slack, and cinched tight. Never a wrong time: the old digit
// is undone before :00, the new tied after.
// The hour: a big sea runs along the horizon, the ship heels hard, every
// rope swings, the hour knots are undone and retied while the minute rope
// runs back through the sheave.
//
// Burn-in: everything moves (roll, yaw, orbit). Night dims (ctx.night).
import { clamp, clockFields, previousMinute, orbit } from '../js/kit.js';

const TAU = Math.PI * 2;
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };

// ------------------------------------------------------------ camera
const DZ = 200;
let EX = 64, EY = 22;
function project(x, y, z) { const k = DZ / (z + DZ); return [EX + (x - EX) * k, EY + (y - EY) * k, k]; }
const L = (() => { const v = [-0.55, -0.7, -0.45], l = Math.hypot(...v); return v.map((c) => c / l); })();

// ------------------------------------------------------------ buffers
const END = new Float32Array(32).fill(1e9);
let BW = 0, BH = 0, ZB, SB, UB, RB, NB, RB2;
function buffers(w, h) {
  if (w !== BW || h !== BH) {
    BW = w; BH = h;
    ZB = new Float32Array(w * h); SB = new Float32Array(w * h); UB = new Float32Array(w * h);
    RB = new Int16Array(w * h); NB = new Float32Array(w * h); RB2 = new Float32Array(w * h);
  }
  ZB.fill(1e9); RB.fill(-1);
}

// Rasterise a tube given world points (flat array x,y,z,...) spaced `ds` apart.
// mat 0 = laid rope, 1 = wood.
function tube(P, S, n, R, id) {
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const j0 = Math.max(0, i - 1), j1 = Math.min(n - 1, i + 1);
    const [ax, ay] = project(P[j0 * 3], P[j0 * 3 + 1], P[j0 * 3 + 2]);
    const [bx, by] = project(P[j1 * 3], P[j1 * 3 + 1], P[j1 * 3 + 2]);
    let tx = bx - ax, ty = by - ay; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const [sx, sy, k] = project(x, y, z);
    const r = R * k, r2 = r * r;
    const x0 = Math.max(0, Math.floor(sx - r)), x1 = Math.min(BW - 1, Math.floor(sx + r));
    const y0 = Math.max(0, Math.floor(sy - r)), y1 = Math.min(BH - 1, Math.floor(sy + r));
    const s = S[i];
    for (let py = y0; py <= y1; py++) {
      const dy = py + 0.5 - sy;
      for (let px = x0; px <= x1; px++) {
        const dx = px + 0.5 - sx, d2 = dx * dx + dy * dy;
        if (d2 >= r2) continue;
        const along = dx * tx + dy * ty, perp = -dx * ty + dy * tx;
        const w = Math.sqrt(1 - d2 / r2);
        const depth = z - R * w;
        const o = py * BW + px;
        if (depth >= ZB[o]) continue;
        ZB[o] = depth; RB[o] = id; SB[o] = s + along / k; UB[o] = perp / r; RB2[o] = r;
        // diffuse on the tube's cross-section (normal ignores the along part)
        const u = perp / r, c = Math.sqrt(Math.max(0, 1 - u * u));
        const nx = -ty * u, ny = tx * u, nz = -c;
        NB[o] = nx * L[0] + ny * L[1] + nz * L[2];
      }
    }
  }
}

const LAY = 4.2;  // along-rope spacing of the strand grooves
function shadePass(g, ids) {
  const buf = g.buf;
  for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
    const o = y * BW + x, id = RB[o];
    if (id < 0) continue;
    const d = ZB[o], s = SB[o];
    // a nearer, unrelated surface right next to this pixel: cut a gap
    let gap = false;
    for (let k = 0; k < 8 && !gap; k++) {
      const nx = x + NX[k], ny = y + NY[k];
      if (nx < 0 || ny < 0 || nx >= BW || ny >= BH) continue;
      const q = ny * BW + nx;
      if (RB[q] < 0) continue;
      if (ZB[q] < d - 1.6 && (RB[q] !== id || Math.abs(SB[q] - s) > 9)) gap = true;
    }
    if (gap) continue;
    const mat = ids[id] ?? 0, lit = NB[o];
    let on;
    if (mat === 1) {
      on = lit > -0.2 && !(UB[o] > 0.2 && UB[o] < 0.45);
    } else if (mat === 3) {
      on = lit > -0.45;
    } else if (mat === 2) {
      on = lit > -0.3 && Math.abs(UB[o]) > 0.25;
    } else if (s > END[id] - 2.4) {
      on = !(s > END[id] - 1.6 && s < END[id] - 1.0);   // the whipping at the end
    } else {
      // three strands laid right-handed: grooves at ~50 degrees to the axis
      let f = (s + 1.25 * RB2[o] * UB[o]) / LAY; f -= Math.floor(f);
      on = f > 0.26 + 0.3 * clamp(-lit - 0.05, 0, 1) && lit > -0.62;
    }
    if (on) buf[o] = 1;
  }
}
const NX = [1, -1, 0, 0, 1, 1, -1, -1], NY = [0, 0, 1, -1, 1, -1, 1, -1];

// ------------------------------------------------------------ digits
// Centre-lines in a 20 x 34 box (rope radius 2.7), z > 0 away from the eye.
// Crossings get +-2.5 in z so the rope really passes over and under itself.
const SPEC = {
  0: [[10, 2.7, 0], [5.2, 4.6, 0], [3, 10, 0], [2.7, 17, 0], [3.3, 25, 0], [6.2, 30.4, 0], [10, 31.6, 0], [13.8, 30.4, 0], [16.7, 25, 0], [17.3, 17, 0], [17, 10, 0], [14.8, 4.6, 0], [11.5, 2.3, -2.6], [7.5, 0.6, -1.6], [5, -0.6, -0.6]],
  1: [[12.4, 2.7, 0], [12.4, 10, 0], [12.4, 20, 0], [12.4, 28.4, 0], [12.4, 31.4, 0.8], [12.4, 32.6, 2.7], [12.4, 31.4, 4.6], [12.4, 28.4, 5.4], [12.4, 18, 5.4], [12.4, 8, 5.4], [12, 4.2, 4.6], [10, 4.6, 2.6], [7.4, 7.4, 1.2], [4.6, 10.6, 0], [3.4, 12.4, 0]],
  2: [[3, 10, 0], [4.4, 4.8, 0], [10, 2.7, 0], [15.4, 4.6, 0], [17.2, 9.6, 0], [16, 15, 0], [11.6, 20.4, 0], [6.5, 25.6, 0],
      [3.4, 29.6, 0], [5, 31.4, 0], [10, 31.5, 0], [17.5, 31.3, 0]],
  3: [[2.9, 6.8, 0], [6, 3.4, 0], [11, 2.7, 0], [15.6, 4.6, 0], [16.8, 9.5, 0], [14.5, 14.2, -1], [10.5, 16, -2.6],
      [6.6, 15.4, -1.2], [5.6, 17.8, 1], [8, 19.3, 2.6], [11.5, 16.4, 1], [15.5, 19.6, 0], [17.3, 25, 0], [15.4, 29.9, 0],
      [10, 31.6, 0], [5, 30.6, 0], [2.5, 27.2, 0]],
  4: [[13.5, 2.7, 0], [13.5, 10, 0], [13.5, 20, 0], [13.5, 28.4, 0], [13.5, 31.4, 0.8], [13.5, 32.6, 2.7], [13.5, 31.4, 4.6], [13.5, 28.4, 5.4], [13.5, 18, 5.4], [13.5, 8, 5.4], [13.2, 4.2, 5.2], [11.4, 4.4, 3.6], [8.6, 9, 1.6], [5.4, 14.8, 0.4], [2.7, 21.2, 0], [6, 22.6, -1.4], [10, 22.8, -2.8], [14.5, 22.8, -2.8], [17.6, 22.6, -1.2], [19.2, 23.8, 0]],
  5: [[17.4, 2.9, 0], [11, 2.7, 0], [4.4, 2.9, 0], [3.5, 8, 0], [3.2, 14.6, 0], [8, 13.4, 0], [14.2, 14.6, 0],
      [17.3, 21, 0], [16.2, 28.4, 0], [10.6, 31.6, 0], [5, 30.6, 0], [2.4, 27.4, 0]],
  6: [[16, 4.6, 0], [11, 2.7, 0], [6, 4, 0], [3.2, 10, 0], [2.7, 18, 0], [3.4, 26, 0], [7, 31, 0], [12.5, 31.4, 0],
      [16.8, 27, 0], [17, 21, 0], [13.6, 16.8, 0], [8, 17, 0], [4.6, 20.2, -2.6], [2.4, 23.4, -1.2]],
  7: [[3, 6.8, 0], [3, 2.9, 0], [10, 2.7, 0], [17.2, 2.9, 0], [15.4, 8.4, 0], [12.6, 15.6, 0], [10.4, 23, 0], [9.6, 31.6, 0]],
  8: [[10, 2.7, -1], [15.4, 4.4, 0], [16.6, 10, 0], [13.2, 14.8, 1], [10, 17, 2.6], [5.2, 19.8, 1], [2.7, 25, 0],
      [5, 30.4, 0], [10, 31.6, 0], [15, 30.4, 0], [17.3, 25, 0], [14.8, 19.8, -1], [10, 17, -2.6], [6.8, 14.8, -1],
      [3.4, 10, 0], [4.6, 4.4, 0], [9, 2.4, 1.5], [12.5, 2.6, 2.8]],
  9: [[10, 2.7, 0], [5.4, 4, 0], [2.9, 8.8, 0], [3.4, 14, 0], [7.4, 17.4, 0], [12.4, 16.4, 0], [14.6, 12, 0], [14.4, 6.6, 0], [14.8, 3.2, 0], [17.4, 3.4, 0], [18.4, 8, 0], [18.3, 18, 0], [16.4, 27.6, 0], [11, 31.6, 0], [5.6, 31, 0], [2.6, 27.8, 0]],
};

// Catmull-Rom through the control points, resampled to equal arc length.
const DS = 0.5;
function resample(cp) {
  const dense = [];
  for (let i = 0; i < cp.length - 1; i++) {
    const p0 = cp[Math.max(0, i - 1)], p1 = cp[i], p2 = cp[i + 1], p3 = cp[Math.min(cp.length - 1, i + 2)];
    for (let k = 0; k < 16; k++) {
      const t = k / 16, t2 = t * t, t3 = t2 * t;
      dense.push([0, 1, 2].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t +
        (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  dense.push(cp[cp.length - 1].slice());
  const out = [dense[0]]; let acc = 0, need = DS;
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1], b = dense[i];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    while (acc + l >= need) {
      const u = (need - acc) / l;
      out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]);
      need += DS;
    }
    acc += l;
  }
  const P = new Float32Array(out.length * 3);
  out.forEach((p, i) => { P[i * 3] = p[0]; P[i * 3 + 1] = p[1]; P[i * 3 + 2] = p[2]; });
  return P;
}
const DIG = {};
for (const k in SPEC) DIG[k] = resample(SPEC[k]);

const RR = 2.7;
const LEN = {};
for (const k in DIG) LEN[k] = (DIG[k].length / 3 - 1) * DS;

// ------------------------------------------------------------ the world
// World units are screen pixels on the plane z = 0, z going away. The near
// yard of a ship carries the hours: each a rope with a round turn on the
// spar, hanging down and tied into a numeral. Further back a block hangs
// from the far yard, and ONE rope is rove over its sheave: one fall is tied
// into the tens of the minute, the other into the units. As the hour goes by
// the rope creeps through the block, the units sinking as the tens rise, so
// the pair is never level; at the hour it runs back through with a rush.
const YARDS = [
  { y: 3.5, z: -10, x0: -40, x1: 72, r: 3.3 },
];
const HSC = 1.22, MSC = 0.92;
const HOURS = [{ bx: 17 }, { bx: 45 }];
const BLK = { x: 99, y: 5, z: 6, r: 12 };     // the sheave's centre and radius (to the rope's axis)
const RUN = 4;                                  // half the travel of the minute rope over the hour

let CYAW = 0, CX = 64, CZ = 30, ROLL = 0, OX = 0, OY = 0;
function cam(x, y, z) {
  const c = Math.cos(CYAW), s = Math.sin(CYAW), dx = x - CX, dz = z - CZ;
  const X = dx * c - dz * s, Z = CZ + dx * s + dz * c;
  // the ship rolls: the whole view turns about a point below the glass
  const cr = Math.cos(ROLL), sr = Math.sin(ROLL), ry = y - 120;
  return [CX + OX + X * cr - ry * sr, 120 + OY + X * sr + ry * cr, Z];
}

const PB = new Float32Array(3 * 2400), SBUF = new Float32Array(2400);
let M = 0;
function put(x, y, z, s) {
  const q = cam(x, y, z);
  PB[M * 3] = q[0]; PB[M * 3 + 1] = q[1]; PB[M * 3 + 2] = q[2]; SBUF[M] = s; M++;
}

// One hanging rope from anchor (ax, ay, az). `d` its numeral, its box
// centred `dx` from the anchor with its top at `top` (world y), scale `sc`;
// `a` how much of the numeral is tied (0..1; the rest hangs free below the
// tie point as a tail), `swing` the pendulum angle (gravity is fixed, the
// ship rolls under it), `psi` a slow twist about the vertical, `loose` 0..1
// how slack the knot is. `s0`, `sd`: the strand phase where the rope leaves
// the anchor and which way it runs.
function rope(k, d, ax, ay, az, dx, top, sc, a, swing, psi, loose, T, s0 = 0, sd = 1) {
  const P = DIG[d], n = P.length / 3;
  M = 0;
  let s = 0;
  const cs = Math.cos(swing), ss = Math.sin(swing), cp = Math.cos(psi), sp = Math.sin(psi);
  const zs = 1 + 1.2 * loose, ws = 1 + 0.06 * loose;
  const hang = (lx, ly, lz) => {
    const xr = lx * cp - lz * sp, zr = lx * sp + lz * cp;
    put(ax + xr * cs - ly * ss, ay + xr * ss + ly * cs, az + zr, s0 + sd * s);
  };
  const ny0 = top - ay;
  // while hardly anything is tied, the numeral's start eases to a common
  // point under the anchor, so swapping one numeral for another never jumps
  const w = smooth(a / 0.18);
  const ofx = (1 - w) * (0 - dx - (P[0] - 10) * sc), ofy = (1 - w) * (2 - P[1] * sc);
  const lx = (i) => ofx + dx + (P[i * 3] - 10) * sc * ws, ly = (i) => ofy + ny0 + P[i * 3 + 1] * sc * ws, lz = (i) => P[i * 3 + 2] * sc * zs;
  // lead: from the anchor down into the numeral's first point
  const ex = lx(0), ey = ly(0), lead = Math.hypot(ex, ey);
  for (let p = 0; p < lead; p += DS, s += DS) { const u = p / lead; hang(ex * u * u, ey * u, 0); }
  const nTied = Math.max(0, Math.min(n - 1, Math.round(a * (n - 1))));
  for (let i = 0; i <= nTied; i++, s += DS * sc) hang(lx(i), ly(i), lz(i));
  END[k] = 1e9;
  if (nTied >= n - 1) { if (sd > 0) END[k] = s0 + s - DS * sc; return M; }
  // the tail: leaves the tie point along the rope, falls to hang plumb, and
  // swings; long enough to run off the bottom of the glass
  let px = lx(nTied), py = ly(nTied), pz = lz(nTied);
  const j = Math.max(0, nTied - 2);
  let tx = px - lx(j), ty = py - ly(j); const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
  const free = (n - 1 - nTied) * DS * sc;
  const wag = Math.sin(T * 5.2 + k) * 0.35 * Math.min(1, free / 30);
  for (let p = 0; p < 90; p += DS, s += DS) {
    const w = smooth(p / 9);
    let ux = tx * (1 - w) + Math.sin(wag * w) * w, uy = ty * (1 - w) + Math.cos(wag * w) * w;
    const l = Math.hypot(ux, uy) || 1; ux /= l; uy /= l;
    px += ux * DS; py += uy * DS; pz += (-4 - pz) * 0.04;
    hang(px, py, pz);
    if (py + ay > 80) break;
  }
  return M;
}

// A round turn of the hour rope about the near yard, at x.
function hitch(x, id, s0) {
  const Y = YARDS[0], wr = Y.r + RR * HSC * 0.85;
  M = 0;
  const n = Math.ceil(1.25 * TAU * wr / DS);
  for (let i = 0; i <= n; i++) {
    const u = i / n, ang = u * 1.25 * TAU;   // from the top front, round over the back, to the bottom
    put(x - 3 + 6 * u, Y.y - wr * Math.cos(ang), Y.z - wr * Math.sin(ang) * 1, s0 + i * DS);
  }
  tube(PB, SBUF, M, RR * HSC, id);
}

// The sheave: a big wooden wheel hung from above, its rim, hub and spokes
// turning with the rope that runs in its groove.
function block(run) {
  const rim = BLK.r - RR * MSC - 1.0, bz = BLK.z + 3;
  // the strop it hangs from, behind the wheel, up out of the glass
  M = 0;
  for (let y = -8; y <= BLK.y - 2; y += 0.5) put(BLK.x, y, bz + 1, y * 1.7);
  tube(PB, SBUF, M, 1.3, 14);
  M = 0;
  for (let i = 0; i <= 160; i++) { const a = i / 160 * TAU; put(BLK.x + rim * Math.sin(a), BLK.y - rim * Math.cos(a), bz, i); }
  tube(PB, SBUF, M, 1.1, 14);
  M = 0;
  for (let i = 0; i <= 24; i++) { const a = i / 24 * TAU; put(BLK.x + 1.6 * Math.sin(a), BLK.y - 1.6 * Math.cos(a), bz - 0.5, i); }
  tube(PB, SBUF, M, 1.1, 14);
  const rot = run / BLK.r;
  for (let j = 0; j < 5; j++) {
    M = 0;
    const a = rot + j * TAU / 5;
    for (let r = 3.4; r <= rim - 1.4; r += 0.5) put(BLK.x + r * Math.sin(a), BLK.y - r * Math.cos(a), bz, r);
    tube(PB, SBUF, M, 0.75, 14);
  }
}

function yard(k) {
  const Y = YARDS[k];
  M = 0;
  for (let x = Y.x0; x <= Y.x1; x += 0.6) put(x, Y.y, Y.z, x);
  tube(PB, SBUF, M, Y.r, 10 + k);
}

// The sea behind: a horizon that rolls with the ship, and the moon's road.
// `swell` 0..1: the hour's big sea, a crest running along the horizon.
function sea(g, T, swell, tau) {
  const c = Math.cos(ROLL), s = Math.sin(ROLL), hy = 60.5 + OY * 0.5 + 1.4 * Math.sin(TAU * T / 13.7);   // the ship heaves
  const xc = -30 + 50 * (tau + 1);
  for (let x = 0; x < 128; x++) {
    const wv = swell * 9 * Math.exp(-(((x - xc) / 22) ** 2));
    const y = Math.round(120 + (hy - wv - 120) * c + (x - 64) * s);
    if (y >= 0 && y < 64 && RB[y * BW + x] < 0) g.buf[y * BW + x] = 1;
  }
}

const MATS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 3, 0, 0, 0, 0, 0, 0, 0];

export function specimen(g, t = 0) {
  buffers(g.width, g.height);
  const ex = EX, ey = EY; EX = g.width / 2; EY = g.height / 2;
  for (let d = 0; d < 10; d++) {
    const col = d % 5, row = Math.floor(d / 5);
    const P = DIG[d], n = P.length / 3, psi = 0.25 * Math.sin(t * 1.3 + d);
    for (let i = 0; i < n; i++) {
      const lx = P[i * 3] - 10, lz = P[i * 3 + 2];
      PB[i * 3] = 26 + col * 30 + lx * Math.cos(psi) - lz * Math.sin(psi);
      PB[i * 3 + 1] = 4 + row * 42 + P[i * 3 + 1];
      PB[i * 3 + 2] = lx * Math.sin(psi) + lz * Math.cos(psi);
      SBUF[i] = i * DS; END[d] = LEN[d];
    }
    tube(PB, SBUF, n, RR, d);
  }
  shadePass(g, MATS);
  EX = ex; EY = ey;
}

// ------------------------------------------------------------ timing
// Minute: the old knot comes undone from its end back up (the freed rope
// drops and swings as a tail), then the tail is drawn back up and tied into
// the new numeral, slack, and the knot is cinched tight.
const UNTIE = 0.8, TIE = 1.5, CINCH = 0.4;
function minuteState(k, now, was, tau) {
  const t = tau - (k % 2) * 0.1;
  if (now === was) return { d: now, a: 1, loose: 0 };
  if (t < 0) {
    // undone end-first, slow at first, and gone just before :00
    const u = clamp((t + UNTIE + 0.06) / UNTIE, 0, 1);
    return { d: was, a: 1 - u * u * (3 - 2 * u), loose: smooth(u * 4) };
  }
  // tied fast at first so the new numeral reads within ~0.3 s, then worked in
  const u = clamp(t / TIE, 0, 1), c = clamp((t - TIE) / CINCH, 0, 1);
  return { d: now, a: 1 - (1 - u) ** 3, loose: 1 - smooth(c) };
}
function ease3(u) { return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2; }

export default {
  name: 'Rope Yarn',
  blurb: 'Sailor\'s ropework in 3D: hours knotted on the yard, minutes on one rope rove over a sheave that creeps all hour; ropes untie and retie at the turn, a big sea heels the ship at the hour.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  frame(g, ctx) {
    buffers(g.width, g.height);
    const f = ctx.fields, T = ctx.t, sec = f.sec;
    const after = sec < 30;
    const cur = after ? f : clockFields(new Date(ctx.date.getTime() + 60000));
    const prev = after ? previousMinute(ctx.date) : f;
    const tau = after ? sec : sec - 60;
    const dn = [Math.floor(cur.h / 10), cur.h % 10, Math.floor(cur.m / 10), cur.m % 10];
    const dw = [Math.floor(prev.h / 10), prev.h % 10, Math.floor(prev.m / 10), prev.m % 10];
    [OX, OY] = orbit(ctx.date, 2, 3);
    CYAW = 0.12 * Math.sin(TAU * T / 23);
    // the hour: a big sea lifts the ship and heels it hard, and the ropes
    // swing under it with a lag (they keep hanging plumb)
    const hourTurn = cur.m === 0 && dn[1] !== dw[1] || cur.m === 0 && dn[0] !== dw[0];
    const htau = hourTurn ? tau : 99;
    const env = (u) => clamp((u + 1.2) / 0.8, 0, 1) * Math.exp(-Math.max(0, u) / 1.8);
    const heel = (dt) => 0.035 * Math.sin(TAU * (T + dt) / 8.3) + 0.15 * env(htau + dt) * Math.sin(TAU * (htau + dt + 1.2) / 2.8);
    ROLL = heel(0);
    const ROLL_LAG = heel(-0.3);
    yard(0);
    // hours: hitched to the near yard
    for (let k = 0; k < 2; k++) {
      const st = minuteState(k, dn[k], dw[k], tau);
      const Y = YARDS[0], ax = HOURS[k].bx + 3, ay = Y.y + Y.r + RR * HSC * 0.85, az = Y.z;
      hitch(HOURS[k].bx, 20 + k, -40);
      const swing = -ROLL_LAG * 1.12 + 0.018 * Math.sin(TAU * T / 3.3 + k * 1.7);
      const psi = 0.28 * Math.sin(TAU * T / 11.3 + k * 2.1);
      tube(PB, SBUF, rope(k, st.d, ax, ay, az, -3, 13, HSC, st.a, swing, psi, st.loose, T), RR * HSC, k);
    }
    // minutes: one rope over the sheave
    // the minute rope creeps through the block all hour; at the hour it runs back with a rush
    let run = RUN * (2 * (f.m + sec / 60) / 60 - 1);
    if (f.m === 0 && sec < 2.2) run = RUN - 2 * RUN * smooth(sec / 2.2) * 1 + (run + RUN) * smooth(sec / 2.2);
    block(run);
    M = 0;
    const rr = BLK.r, R = RR * MSC;
    for (let i = 0; i <= 40; i++) {
      const a = -Math.PI / 2 + i / 40 * Math.PI;   // over the top, left to right
      put(BLK.x + rr * Math.sin(a), BLK.y - rr * Math.cos(a), BLK.z, run + (a + Math.PI / 2) * rr);
    }
    tube(PB, SBUF, M, R, 4);
    const arc = Math.PI * rr;
    for (let k = 2; k < 4; k++) {
      const st = minuteState(k, dn[k], dw[k], tau);
      const side = k === 2 ? -1 : 1;
      const top = 24 + (k === 2 ? -run : run);
      const swing = -ROLL_LAG * 1.12 + 0.022 * Math.sin(TAU * T / 2.9 + k * 1.3);
      const psi = 0.3 * Math.sin(TAU * T / 10.1 + k * 2.4);
      const s0 = k === 2 ? run : run + arc, sd = k === 2 ? -1 : 1;
      tube(PB, SBUF, rope(k, st.d, BLK.x + side * rr, BLK.y, BLK.z, 0, top, MSC, st.a, swing, psi, st.loose, T, s0, sd), R, k);
    }
    shadePass(g, MATS);
    sea(g, T, hourTurn ? env(htau) : 0, htau);
    ctx.oled.contrast(0xcf + (0x20 - 0xcf) * ctx.night);
  },
};
