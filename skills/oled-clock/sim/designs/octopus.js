// Octopus — a little octopus in a rock pool that IS the clock.
//
// The minutes are two of its arms. Each numeral is one continuous tentacle
// that comes up from behind the ledge at its root, lays itself along the
// numeral (thick at the rock, tapering to a fine curled tip, suckers on its
// underside) and never stops moving: the tip coils and uncoils as it tastes
// the water, a peristaltic bulge and a ripple run up it, and it rises and
// settles with the octopus's breath. The digits were drawn as a set, each
// as the path an arm would take, starting at the rock.
//
// The hour is on its mantle, the way an octopus shows anything: a pattern
// of dark chromatophores strung along the same hand, opening and closing.
// Twice a minute a "passing cloud" of colour sweeps off its body and out
// along the numeral arms.
//
// Minute turn: the arm lets go tip first, unfurls into a free arm that rises
// and reaches for the fish nosing past (which darts off), then wraps itself
// root first round the next numeral, the tip snapping in last with a springy
// overshoot. The octopus blinks, watches, and squints happily when it is done.
// Hour: it startles (eyes wide), jets back, and squirts a cloud of ink that
// billows over the pool and withers away; a flush rolls down its mantle,
// leaving the new hour behind it, so the hour is never blank.
//
// Every frame comes from the clock alone (turns from previousMinute, idle
// life from absolute time). Burn-in: the scene walks kit.orbit, the octopus
// breathes and bobs; night dimming via ctx.night.
import { ease, clamp, lerp, progress, noise, smoothNoise, orbit, previousMinute, dither, sprite, ON, OFF } from '../js/kit.js';

const TAU = Math.PI * 2;
let W = 128, H = 64;   // stride of the canvas being drawn (the specimen sheet is taller)

// ------------------------------------------------------------ geometry helpers

function catmull(cp, per = 10) {
  const out = [];
  const n = cp.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = cp[Math.max(i - 1, 0)], p1 = cp[i], p2 = cp[i + 1], p3 = cp[Math.min(i + 2, n - 1)];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(cp[n - 1].slice());
  return out;
}

function resample(pts, n) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1], out = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const s = (L * k) / (n - 1);
    while (j < pts.length - 1 && cum[j] < s) j++;
    const a = pts[j - 1], b = pts[j], seg = cum[j] - cum[j - 1] || 1, u = clamp((s - cum[j - 1]) / seg, 0, 1);
    out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
  }
  return { pts: out, len: L };
}

// ------------------------------------------------------------ the arm numerals
//
// Each minute numeral is ONE arm: it comes up from behind the ledge at its
// root (local y > 38 is hidden) and lays itself along the numeral, ending in
// a curled tip. Box 24 x 38, y down.

const NB = 60;           // samples along the body of the arm
// Control points in a 24 x 40 box; the first point is under the ledge (y 41).
const ARM_DEF = {
  0: { cp: [[13, 47], [12, 38], [5, 32], [3, 20], [6, 7], [12, 2.5], [18, 7], [21, 20], [19, 31], [14, 35.5]], curl: -1 },
  1: { cp: [[14, 47], [14, 36], [14, 20], [14, 4], [11, 4], [7, 7]], curl: -1 },
  2: { cp: [[22, 47], [21, 38], [14, 36], [4, 36], [6, 32], [13, 25], [19, 17], [20, 9], [15, 3], [8, 3.5], [4, 8]], curl: -1 },
  3: { cp: [[1, 47], [3, 36.5], [9, 37], [17, 35], [21, 28], [17, 21], [11, 19.5], [17, 17], [20, 10], [15, 3], [8, 3], [4, 7]], curl: -1 },
  4: { cp: [[17, 47], [17, 34], [17, 16], [17, 3], [12, 9], [6, 18], [3, 27], [10, 27], [20, 27]], curl: -1 },
  5: { cp: [[1, 47], [3, 36.5], [10, 37], [18, 35], [21, 27], [18, 20], [11, 18], [5, 20], [5.5, 11], [6, 3], [13, 3], [20, 3]], curl: 1 },
  6: { cp: [[12, 47], [12, 39], [6.5, 36.5], [3.5, 30], [5, 22.5], [11, 18.5], [17.5, 20], [21, 27], [19, 34.5], [12, 37.5], [6.5, 35.5], [3.5, 28], [3.5, 18], [6, 9], [11, 3.5], [18, 4.5]], curl: 1 },
  7: { cp: [[9, 47], [9.5, 36], [12, 24], [17, 12], [20, 4], [13, 3], [5, 3]], curl: -1 },
  8: { cp: [[12, 47], [12.5, 37], [19, 34], [20, 27], [12, 20], [5, 14], [6, 6], [12, 2.5], [18, 6], [19, 14], [12, 20], [4, 27], [5, 34], [10, 36.5]], curl: -1 },
  9: { cp: [[4, 47], [8, 36.5], [15, 36], [20, 28], [21, 15], [18, 5], [12, 2.5], [6, 5], [3.5, 12], [7, 19], [12.5, 20.5], [17, 19]], curl: -1 },
};
const ARM = {};
for (const d in ARM_DEF) {
  const { pts, len } = resample(catmull(ARM_DEF[d].cp, 12), NB);
  ARM[d] = { pts, len, curl: ARM_DEF[d].curl };
}

// Radius along the arm: thick at the root, even through the numeral, a
// fine curled tip.
function armRadius(u) {
  return lerp(3.2, 1.35, u ** 0.8);
}

/**
 * Full arm polyline: body samples + generated curled tip.
 * `curlAmt` 0..1.4 scales how tight the tip spirals.
 */
function withTip(body, dir, curlAmt, tipLen = 11, nTip = 14) {
  const pts = body.slice();
  const a = body[body.length - 2], b = body[body.length - 1];
  let th = Math.atan2(b[1] - a[1], b[0] - a[0]);
  let x = b[0], y = b[1];
  const ds = tipLen / nTip;
  for (let i = 1; i <= nTip; i++) {
    const u = i / nTip;
    const k = curlAmt * (0.05 + 0.55 * u * u);   // curvature rises toward the tip
    th += dir * k * ds;
    x += Math.cos(th) * ds; y += Math.sin(th) * ds;
    pts.push([x, y]);
  }
  return pts;
}

// ------------------------------------------------------------ rasterising soft tubes

const FILL = new Uint8Array(128 * 192), HALO = new Uint8Array(128 * 192);
function begin(g) { W = g.width; H = g.height; }

function stampDisc(mask, cx, cy, r) {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy, dy2 = dy * dy;
    if (dy2 > r2) continue;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      if (dx * dx + dy2 <= r2) mask[y * W + x] = 1;
    }
  }
}

/** Stamp a tube along pts with radii rs (same length) into FILL and HALO. */
function tube(pts, rs, halo = 1) {
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(L / 0.45));
    for (let k = 0; k < n; k++) {
      const u = k / n, x = ax + (bx - ax) * u, y = ay + (by - ay) * u, r = rs[i - 1] + (rs[i] - rs[i - 1]) * u;
      stampDisc(FILL, x, y, r);
      if (halo) stampDisc(HALO, x, y, r + halo);
    }
  }
  const [x, y] = pts[pts.length - 1];
  stampDisc(FILL, x, y, rs[rs.length - 1]);
}

function flush(g, clip = null) {
  const b = g.buf;
  for (let i = 0; i < W * H; i++) {
    if (HALO[i]) { if (!clip || clip(i)) b[i] = 0; HALO[i] = 0; }
  }
  for (let i = 0; i < W * H; i++) {
    if (FILL[i]) { if (!clip || clip(i)) b[i] = 1; FILL[i] = 0; }
  }
}
// ------------------------------------------------------------ one arm, alive

/**
 * Draw an arm from its pose (NB points; for a numeral, in its 24 x 40 box)
 * placed at (x0, y0). A wobble field moves overlapping strokes together, a
 * bulge runs up the arm, the curled tip tastes the water, and suckers line
 * its underside. `opts.curl` is the signed tip curl (+ clockwise).
 */
function drawArm(g, body, x0, y0, t, seed, opts = {}) {
  const pulse = ((t / 2.8 + seed * 0.37) % 1) * 1.5 - 0.25;
  // the tip coils and uncoils as it tastes the water
  const breathe = 1.0 + 0.45 * Math.sin(t * 1.7 + seed * 2.1) + 0.2 * Math.sin(t * 3.3 + seed);
  const c = opts.curl ?? -1, anchor = opts.anchor ?? 41, wob = opts.wobble ?? 1;
  const tipLen = (opts.tipLen ?? 11) * (1 + 0.22 * Math.sin(t * 1.1 + seed * 1.3));
  const local = withTip(body, Math.sign(c) || 1, Math.abs(c) * breathe, tipLen);
  // every few seconds a ripple runs up the arm from the rock to the tip
  const RP = 4.6, rk = Math.floor((t + seed * 1.37) / RP), rt = t + seed * 1.37 - rk * RP;
  const ripple = rt < 1.8 ? rt / 1.8 * 1.5 - 0.25 : null, rAmp = 1.1 * (0.6 + 0.4 * noise(rk, seed));
  const n = local.length, pts = new Array(n), rs = new Array(n);
  const thick = opts.thick ?? 1;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    let [x, y] = local[i];
    if (opts.breath) y = anchor - (anchor - y) * (1 + opts.breath);      // rises and settles with the octopus's breath
    const w = wob * clamp((anchor - y) / 6, 0, 1) * (0.5 + 0.5 * u);
    x += w * 0.45 * Math.sin(0.31 * y + 1.6 * t + seed);
    y += w * 0.35 * Math.sin(0.27 * x - 1.25 * t + seed * 1.7);
    const tipU = clamp((i - NB) / (n - NB), 0, 1);
    x += tipU * tipU * 1.4 * Math.sin(t * 2.3 + seed * 3);
    y += tipU * tipU * 1.1 * Math.cos(t * 2.9 + seed * 2);
    if (ripple !== null && wob > 0) {
      const q = (u - ripple) / 0.09;
      if (q > -3 && q < 3) {
        const a = local[Math.max(0, i - 1)], b = local[Math.min(n - 1, i + 1)];
        const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
        const d = rAmp * Math.exp(-q * q) * Math.sin(q * 2.2) * clamp((anchor - y) / 4, 0, 1);
        x += (-ty / l) * d; y += (tx / l) * d;
      }
    }
    pts[i] = [x0 + x, y0 + y];
    const bulge = 0.6 * Math.exp(-(((u - pulse) / 0.07) ** 2));
    rs[i] = (i < NB ? armRadius(i / (NB - 1)) : lerp(1.35, 0.55, tipU)) * thick + bulge;
  }
  tube(pts, rs);
  flush(g, opts.clip);
  // Suckers: a dark pore every other sample, near the underside edge.
  const side = -(Math.sign(c) || 1);
  for (let i = 2; i < n - 3; i += 2) {
    if (rs[i] < 1.6 || opts.noSuckers) continue;
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i + 1];
    const tx = bx - ax, ty = by - ay, l = Math.hypot(tx, ty) || 1;
    const nx = (-ty / l) * side, ny = (tx / l) * side, off = rs[i] - 1.1;
    const sx = pts[i][0] + nx * off, sy = pts[i][1] + ny * off;
    if (!opts.clip || opts.clip(Math.floor(sy) * W + Math.floor(sx))) g.pixel(sx, sy, OFF);
  }
  return { pts, rs };
}

/** A free arm, NB points from (x0, y0): heading th(u) integrated along length L. */
function freeArm(x0, y0, L, th) {
  const pts = [];
  let x = x0, y = y0;
  const ds = L / (NB - 1);
  for (let i = 0; i < NB; i++) {
    pts.push([x, y]);
    const a = th(i / (NB - 1));
    x += Math.cos(a) * ds; y += Math.sin(a) * ds;
  }
  return pts;
}

// ------------------------------------------------------------ the minute turn
//
// e = seconds since the turn. The old numeral lets go tip first and unfurls
// into a free arm that rises and waves (at the passing fish); then it wraps
// itself root first round the new numeral, the tip arriving last with a
// springy overshoot. Done by e = 2.65.

const TURN = { unfurl: 0.55, spread: 0.35, coil: 1.25, coilLen: 0.85, coilSpread: 0.55 };
const TURN_END = TURN.coil + TURN.coilSpread + TURN.coilLen;

/** The free, waving arm, in the numeral's box coordinates. */
function freePose(t, seed, lean, hook) {
  return freeArm(12, 47, 57, (u) =>
    -Math.PI / 2 + lean * (0.5 + u) + 0.6 * u * Math.sin(t * 3.4 - u * 5 + seed) + 1.9 * u ** 3 * hook);
}

function turnPose(from, to, e, t, seed, lean, hook) {
  const A = ARM[from], B = ARM[to];
  const R = freePose(t, seed, lean, hook);
  const pts = new Array(NB);
  for (let i = 0; i < NB; i++) {
    const u = i / (NB - 1);
    const wa = ease.inOutQuad(clamp((e - (1 - u) * TURN.spread) / TURN.unfurl, 0, 1));
    const wc = ease.outBack(clamp((e - TURN.coil - u * TURN.coilSpread) / TURN.coilLen, 0, 1));
    const px = lerp(A.pts[i][0], R[i][0], wa), py = lerp(A.pts[i][1], R[i][1], wa);
    pts[i] = [lerp(px, B.pts[i][0], wc), lerp(py, B.pts[i][1], wc)];
  }
  // Tip curl: the numeral's own, tightening to a free curl while it waves.
  const free = 1.6 * hook;
  const m1 = ease.inOutQuad(clamp(e / 0.8, 0, 1)), m2 = ease.inOutQuad(clamp((e - TURN.coil - 0.4) / 0.9, 0, 1));
  const curl = lerp(lerp(A.curl, free, m1), B.curl, m2);
  return { pts, curl };
}

// ------------------------------------------------------------ the rock pool

// Top of the rock at each column: a boulder the octopus sits behind, then
// the ledge its numeral arms come up from behind.
const LEDGE = new Float32Array(W);
{
  const cp = [[-4, 60.2], [8, 59.4], [20, 60.3], [33, 59.6], [40, 59.4], [43.5, 57.6], [45.5, 54.6], [48.5, 52.6], [53, 51.9], [60, 51.8], [76, 51.6], [88, 52.4], [102, 51.8], [116, 52.5], [132, 51.5]];
  const c = catmull(cp, 16);
  for (let x = 0; x < W; x++) {
    let best = c[0];
    for (const p of c) if (Math.abs(p[0] - x - 0.5) < Math.abs(best[0] - x - 0.5)) best = p;
    LEDGE[x] = best[1];
  }
}
const ledgeAt = (x) => LEDGE[clamp(Math.floor(x), 0, W - 1)];

function drawRocks(g, ox, oy) {
  let py = null;
  for (let x = 0; x < W; x++) {
    const top = Math.round(LEDGE[clamp(x - ox, 0, W - 1)] + oy);
    for (let y = top; y < H; y++) g.pixel(x, y, OFF);
    if (py !== null && Math.abs(top - py) > 1) g.line(x - 1, py, x, top);
    else g.pixel(x, top, ON);
    py = top;
  }
}

// ------------------------------------------------------------ the octopus
//
// The hour is shown on its mantle the way an octopus shows anything: as a
// pattern of chromatophores, spots strung along the same hand as its arms.

const HOUR_SCALE = 0.5, HOUR_STEP = 2.9;
const HOUR_SPOTS = {};
for (const d in ARM_DEF) {
  const all = resample(catmull(ARM_DEF[d].cp, 12), 400).pts;
  // drop the part that comes up from under the ledge
  const dense = all.slice(all.findIndex((p) => p[1] < 37.2)).filter((p) => p[1] < 38);
  const out = [];
  let acc = HOUR_STEP, s = 0;
  for (let i = 1; i < dense.length; i++) {
    const l = Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]) * HOUR_SCALE;
    acc += l; s += l;
    if (acc >= HOUR_STEP) {
      acc = 0;
      const x = dense[i][0] * HOUR_SCALE, y = (dense[i][1] - 2.5) * HOUR_SCALE;
      // skip a spot that would sit on one already placed (8's crossing, 6's double pass)
      if (!out.some((o) => Math.hypot(o[0] - x, o[1] - y) < HOUR_STEP * 0.8)) out.push([x, y, s]);
    }
  }
  HOUR_SPOTS[d] = out;
}

const HEAD = { cx: 24, cy: 20, rx: 20, ry: 19 };

/** Inside the mantle (an egg, fuller at the crown), grown by `grow` pixels. */
function headTest(cx, cy, rx, ry, grow = 0) {
  rx += grow; ry += grow;
  return (x, y) => {
    const dy = (y - cy) / ry;
    const r = rx * (1 - 0.09 * dy);
    const dx = (x - cx) / r;
    return dx * dx + dy * dy <= 1;
  };
}

const SPOT = new Uint8Array(128 * 192);

/** Stamp one numeral of chromatophores into SPOT, its box's top-left at (x0, y0). */
function stampDigit(d, x0, y0, t, k, keep) {
  for (const [x, y, s] of HOUR_SPOTS[d]) {
    const X = x0 + x, Y = y0 + y;
    if (keep && !keep(X, Y)) continue;
    // chromatophores open and close; a "passing cloud" swells them as it rolls down
    const cq = ((Y - y0 - 10) / 30 - ((t / 3.1) % 1.6) + 0.8) / 0.09;
    const r = 1.3 + 0.22 * Math.sin(t * 2.2 + s * 0.9 + k) + 0.5 * Math.exp(-cq * cq);
    stampDisc(SPOT, X, Y, r);
  }
}

/** Stamp an hour's chromatophores into SPOT; `keep(x, y)` limits where. */
function stampHour(hh, cx, cy, t, keep) {
  stampDigit(hh[0], cx - 14, cy - 14, t, 0, keep);
  stampDigit(hh[1], cx + 2, cy - 14, t, 1, keep);
}

// Eyes are sprites, drawn dark into the lit skin ('#' is dark).
const EYE = {
  open: sprite(`
    ..####..
    .######.
    #..#####
    #..#####
    ########
    #####.##
    .######.
    ..####..
  `),
  half: sprite(`
    ........
    ........
    ########
    #..#####
    ########
    #####.##
    .######.
    ..####..
  `),
  shut: sprite(`
    ........
    ........
    ........
    ........
    #......#
    .######.
    ........
    ........
  `),
  happy: sprite(`
    ........
    ........
    ...##...
    ..####..
    .##..##.
    ##....##
    #......#
    ........
  `),
  wide: sprite(`
    ..####..
    .#....#.
    #......#
    #..##..#
    #..##..#
    #......#
    .#....#.
    ..####..
  `),
};

function drawEye(g, ex, ey, st) {
  let spr = EYE.open;
  if (st.happy > 0.5) spr = EYE.happy;
  else if (st.wide) spr = EYE.wide;
  else if (st.lid > 0.75) spr = EYE.shut;
  else if (st.lid > 0.25) spr = EYE.half;
  // the eye rolls a pixel towards what it is looking at
  const dx = spr === EYE.open || spr === EYE.half ? Math.round(st.gx * 1.2) : 0;
  const dy = spr === EYE.open ? Math.round(st.gy * 0.9) : 0;
  const x = Math.round(ex - 4 + dx), y = Math.round(ey - 4 + dy);
  g.fillRect(x - 1, y - 1, 10, 10, ON);
  g.blit(spr, x, y, { c: OFF });
}

/**
 * The mantle: solid skin, rounded off by a dithered shadow towards the
 * lower rim, with the hour as dark chromatophores and a dark "passing
 * cloud" rolling over it.
 */
function drawOctopus(g, st) {
  const { cx, cy, t } = st;
  const rx = HEAD.rx * st.sx, ry = HEAD.ry * st.sy;
  const box = [cx - rx - 4, cy - ry - 4, 2 * rx + 8, 2 * ry + 8];
  const halo = headTest(cx, cy, rx, ry, 1.2), inner = headTest(cx, cy, rx, ry, -1.3);
  const inside = headTest(cx, cy, rx, ry, -3);
  const h = st.hour;
  if (h.band === null) stampHour(h.now, cx, cy, t, inside);
  else {
    stampHour(h.now, cx, cy, t, (x, y) => inside(x, y) && y < h.band - 2.5);
    stampHour(h.old, cx, cy, t, (x, y) => inside(x, y) && y > h.band + 2.5);
  }
  const x0 = Math.max(0, Math.floor(box[0])), x1 = Math.min(W, Math.ceil(box[0] + box[2]));
  const y0 = Math.max(0, Math.floor(box[1])), y1 = Math.min(H, Math.ceil(box[1] + box[3]));
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      if (!halo(px, py)) continue;
      const i = y * W + x;
      let on = false;
      if (SPOT[i]) on = false;
      else if (!inner(px, py)) on = headTest(cx, cy, rx, ry)(px, py);
      else {
        // light from the upper left: full skin, thinning to a dither at the lower right
                let lv = 1;
        if (h.band !== null) lv -= 0.75 * Math.exp(-(((py - h.band) / 3) ** 2));      // the hour flush
        // dither fixed to the head, so the skin does not swim as it breathes
        on = lv >= 1 || dither(Math.round(px - cx) + 64, Math.round(py - cy) + 64, lv);
      }
      g.buf[i] = on ? 1 : 0;
      SPOT[i] = 0;
    }
  drawEye(g, cx - 4, cy + 11, st.eye);
  drawEye(g, cx + 8.5, cy + 10.5, st.eye);
  // a small smile under them
  if (!st.eye.wide) g.stroke([[cx + 0.5, cy + 16], [cx + 2, cy + 17.3], [cx + 3, cy + 16.5], [cx + 4, cy + 17.3], [cx + 5.5, cy + 16]], 1, OFF);
  else g.fillCircle(cx + 3, cy + 16.8, 1.3, OFF);
}

// ------------------------------------------------------------ the fish, bubbles, ink

const FISH = [
  sprite(`
    ..####...#
    .#.####.##
    ##########
    .######.##
    ..####...#
  `),
  sprite(`
    ..####....
    .#.####..#
    ##########
    .######..#
    ..####....
  `),
];

/** The minute fish: noses in from the right at :56, over the numerals at the
 *  turn, darts off when the arm waves at it. Returns null when out of sight. */
function fishAt(f, T) {
  let tau = f.sec - 57;
  let key = f.minuteKey;
  if (tau < -45) { tau += 60; key -= 1; }           // still leaving after :00
  if (tau < 0 || tau > 8) return null;
  const y0 = 4 + 3 * noise(key, 5), DART = 4.0;
  let x, dart = 0;
  if (tau < DART) x = 134 - 10 * tau;
  else { const d = tau - DART; x = 134 - 10 * DART - 10 * d - 80 * d * d; dart = 1; }
  const y = y0 + 1.2 * Math.sin(T * 2.6) - dart * 3 * Math.min(1, (tau - DART) * 2);
  if (x < -14) return null;
  return { x, y, frame: Math.floor(T * (dart ? 14 : 5)) % 2 };
}

function drawBubbles(g, T, ox, oy) {
  const P = 3.3;
  for (let k = Math.floor(T / P) - 3; k <= Math.floor(T / P); k++) {
    const age = T - k * P - noise(k, 3) * 1.5;
    if (age < 0) continue;
    const y = 30 - age * 9;
    if (y < -3) continue;
    const x = 5 + 2 * Math.sin(age * 3 + k) + age * 0.6;
    const r = 1 + Math.min(1, age * 0.5) * (noise(k, 4) > 0.5 ? 0.7 : 0.2);
    g.fillCircle(x + ox, y + oy, r + 1, OFF);
    g.circle(x + ox, y + oy, Math.round(r));
  }
}

/**
 * The ink cloud on the hour, e seconds since the jet: puffs thrown out of
 * the siphon billow, slow, rise, and then wither away. A soft dithered body
 * inside a crisp rim, drawn behind everything, so every arm and the hour
 * stay readable through it.
 */
const INK = new Float32Array(128 * 64);
function drawInk(g, e, key, ox, oy) {
  if (e < 0 || e > 7) return;
  INK.fill(0);
  const go = 1 - Math.exp(-e * 2.6);
  const wither = clamp((e - 2.6) / 4, 0, 1);
  let any = false;
  for (let i = 0; i < 10; i++) {
    const a = -0.85 + 1.25 * ((i + 0.5) / 10) + 0.25 * (noise(i, key % 97) - 0.5);
    const v = 18 + 46 * noise(i, 31) * (0.6 + 0.4 * Math.cos(a));
    const px = 30 + ox + Math.cos(a) * v * go + 2.5 * Math.sin(e * 1.1 + i * 2);
    const py = 38 + oy + Math.sin(a) * v * go * 0.75 - e * 2 - 3 * noise(i, 8) * go;
    const r = (2 + (7 + 5 * noise(i, 77)) * Math.min(1, e * 1.8) + e * 0.8) * (1 - wither ** (0.6 + 0.8 * noise(i, 5)));
    if (r < 0.8) continue;
    any = true;
    const x0 = Math.max(0, Math.floor(px - r)), x1 = Math.min(W - 1, Math.ceil(px + r));
    const y0 = Math.max(0, Math.floor(py - r)), y1 = Math.min(H - 1, Math.ceil(py + r));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const q = 1 - Math.hypot(x + 0.5 - px, y + 0.5 - py) / r;
        if (q > INK[y * W + x]) INK[y * W + x] = q;
      }
  }
  if (!any) return;
  const body = 1 - wither;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = INK[y * W + x];
      if (d <= 0) continue;
      const rim = !(INK[y * W + x - 1] > 0 && INK[y * W + x + 1] > 0 && (y > 0 ? INK[(y - 1) * W + x] > 0 : true) && (y < H - 1 ? INK[(y + 1) * W + x] > 0 : true));
      const lv = rim ? 0.95 * Math.sqrt(body) : (0.18 + 0.55 * Math.min(1, d * 2.2)) * body * body;
      if (dither(x, y, lv)) g.pixel(x, y, ON);
    }
}

// ------------------------------------------------------------ kelp

// A starfish stuck to the face of the ledge.
const STAR = sprite(`
  ....#....
  ...###...
  ...#.#...
  ####.####
  .#.....#.
  ..#...#..
  .#..#..#.
  .#.#.#.#.
  ..#...#..
`);
function drawRockLife(g, T, ox, oy) {
  g.blit(STAR, 108 + ox, 54 + oy);
}

// ------------------------------------------------------------ the arms at rest on the rock

function drawIdleArms(g, T, ox, oy) {
  const arms = [
    { x: 11, y: 33, L: 18, seed: 1, curl: 2.0, th: (u) => Math.PI * 0.6 + 1.4 * u * u + 0.3 * u * Math.sin(T * 1.1 - 3 * u) },
    { x: 17, y: 38, L: 16, seed: 2, curl: 2.0, th: (u) => Math.PI * 0.6 + 2.2 * u * u + 0.35 * u * Math.sin(T * 0.9 - 2.5 * u + 2) },
    { x: 26, y: 38, L: 14, seed: 4, curl: -2.0, th: (u) => Math.PI * 0.45 - 2.3 * u * u + 0.35 * u * Math.sin(T * 1.2 - 2.5 * u + 4) },
  ];
  for (const a of arms) drawArm(g, freeArm(a.x + ox, a.y + oy, a.L, a.th), 0, 0, T, a.seed, { curl: a.curl, anchor: 999, thick: 0.85, tipLen: 10, noSuckers: true });
}

/** The arms that run from the octopus along the floor and in behind the ledge, to come up as the minutes. */
function drawLinkArms(g, T, ox, oy) {
  for (let k = 0; k < 2; k++) {
    const pts = freeArm(31 + 5 * k + ox, 37 + oy, 22 - 2 * k, (u) => 1.15 - 0.2 * k - 1.3 * u + 0.9 * u * u + 0.2 * Math.sin(T * 1.3 - 3.5 * u + k * 2) * u);
    drawArm(g, pts, 0, 0, T, 7 + k, { curl: 0.3, anchor: 999, thick: 0.8 + 0.1 * k, tipLen: 2, noSuckers: true });
  }
}

// ------------------------------------------------------------ specimen (digits sheet)

export function specimenSheet(g, t = 0) {
  begin(g);
  for (let k = 0; k < 10; k++) {
    const col = k % 5, row = Math.floor(k / 5);
    const x0 = 2 + col * 25, y0 = 8 + row * 64, ledge = y0 + 41;
    drawArm(g, ARM[k].pts, x0, y0, t, k, { curl: ARM[k].curl, clip: (i) => Math.floor(i / W) < ledge });
    for (let x = col * 25; x < col * 25 + 24; x++) g.pixel(x, ledge + 1);
  }
  // the hour hand: chromatophores on a strip of skin
  g.fillRect(0, 134, 128, 26, ON);
  for (let k = 0; k < 10; k++) stampDigit(String(k), 1 + k * 12.7, 138, t, k, null);
  for (let i = 0; i < W * H; i++) if (SPOT[i]) { g.buf[i] = 0; SPOT[i] = 0; }
}

// ------------------------------------------------------------ the face

const ARM_X = [60, 92], ARM_Y = 11;
const DAY_CONTRAST = 0xcf, NIGHT_CONTRAST = 0x10;

export default {
  name: 'Octopus',
  blurb: 'An octopus in a rock pool writes the time with itself: its arms curl into the minutes, its skin spots the hour; each minute an arm lets go, waves at the fish and coils into the next, and on the hour it inks the pool and flushes a new hour.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, ctx) {
    begin(g);
    const { fields: f, date, oled } = ctx;
    const T = date.getTime() / 1000, sec = f.sec;
    const [ox, oy] = orbit(date, 2, 3);

    // The turn: e seconds since :00, while the arms are still moving.
    const turning = sec < TURN_END + 0.3;
    const prev = previousMinute(date);
    const oldMM = turning ? prev.mm : f.mm, nowMM = f.mm;
    const hourE = f.m === 0 && sec < 10 ? sec : null;

    // ---- the ink, behind everything
    if (hourE !== null) drawInk(g, hourE - 0.35, f.h, ox, oy);
    drawBubbles(g, T, ox, oy);

    // ---- the fish
    const fish = fishAt(f, T);
    if (fish) {
      const spr = FISH[fish.frame];
      g.fillWhere(() => true, OFF, [fish.x - 1, fish.y - 1, spr.w + 2, spr.h + 2]);
      g.blit(spr, fish.x, fish.y);
    }


    // ---- the minute arms
    const breath = 0.03 * Math.sin(T * 1.25 - 0.6);
    for (let k = 1; k >= 0; k--) {
      const x0 = ARM_X[k] + ox, y0 = ARM_Y + oy;
      const e = sec - (k === 0 ? 0.3 : 0);
      if (turning && oldMM[k] !== nowMM[k] && e >= 0 && e < TURN_END) {
        const p = turnPose(oldMM[k], nowMM[k], e, T, k * 3 + 1, k ? 0.1 : -0.08, k ? -1 : 1);
        drawArm(g, p.pts, x0, y0, T, k * 5, { curl: p.curl, breath });
      } else {
        const d = turning && oldMM[k] !== nowMM[k] && e < 0 ? oldMM[k] : nowMM[k];
        drawArm(g, ARM[d].pts, x0, y0, T, k * 5, { curl: ARM[d].curl, breath });
      }
    }

    // ---- the octopus
    let jx = 0, jy = 0, sx = 1 + 0.025 * Math.sin(T * 1.25), sy = 1 - 0.02 * Math.sin(T * 1.25);
    let band = null, wide = false;
    if (hourE !== null) {
      const j = hourE - 0.35;
      if (j > 0) { const k = (1 - Math.exp(-j * 7)) * Math.exp(-j * 1.1); jx = -3 * k; jy = -2.2 * k; }
      sx *= 1 - 0.09 * Math.exp(-(((hourE - 0.3) / 0.14) ** 2)) + 0.04 * Math.exp(-(((hourE - 0.6) / 0.2) ** 2));
      sy *= 1 + 0.05 * Math.exp(-(((hourE - 0.3) / 0.14) ** 2));
      wide = hourE < 1.8;
      if (hourE > 0.6 && hourE < 1.8) band = lerp(HEAD.cy - HEAD.ry - 5, HEAD.cy + HEAD.ry + 5, ease.inOutQuad(progress(hourE, 0.6, 1.8))) + oy + jy;
    }
    const cx = HEAD.cx + ox + jx, cy = HEAD.cy + oy + jy + 0.5 * Math.sin(T * 1.25);

    // where it looks: the fish, else whichever arm is moving, else wandering over its minutes
    let tx = 76 + 30 * smoothNoise(T * 0.23, 8), ty = 28 + 14 * (smoothNoise(T * 0.19, 12) - 0.5);
    if (turning && sec < TURN_END) { const k = oldMM[0] !== nowMM[0] && sec > 1.4 ? 0 : 1; tx = ARM_X[k] + 12; ty = sec < 1.3 ? 10 : 30; }
    if (fish && fish.x > 0) { tx = fish.x + 5; ty = fish.y + 2; }
    if (hourE !== null && hourE < 1.8) { tx = 90; ty = 26; }
    const dx = tx - (cx + 11), dy = ty - (cy + 13), dl = Math.hypot(dx, dy) || 1;
    const gk = Math.min(1, dl / 25);
    const eye = { gx: (dx / dl) * gk, gy: (dy / dl) * gk, lid: 0, wide, happy: 0 };
    // blinks: one at the turn, others now and then
    const bk = Math.floor(T / 4.7), bt = T - bk * 4.7 - noise(bk, 21) * 3.5;
    let lid = bt > 0 && bt < 0.2 ? 1 - Math.abs(bt - 0.1) / 0.1 : 0;
    if (sec < 0.24) lid = Math.max(lid, 1 - Math.abs(sec - 0.12) / 0.12);
    eye.lid = hourE !== null && hourE < 1.8 ? 0 : clamp(lid * 1.25, 0, 1);
    if (oldMM !== nowMM && sec > TURN_END - 0.1 && sec < TURN_END + 0.9) eye.happy = 1;
    if (hourE !== null && hourE > 2.8 && hourE < 4.2) eye.happy = 1;

    // ---- the arms it sits on, the octopus, then the rock in front
    drawLinkArms(g, T, ox, oy);
    drawIdleArms(g, T, ox + jx * 0.3, oy);
    drawOctopus(g, { cx, cy, sx, sy, t: T, hour: { now: hourE !== null && hourE < 0.6 ? prev.hh : f.hh, old: prev.hh, band }, eye });
    // A "passing cloud": twice a minute a band of colour sweeps off the
    // octopus and out along its numeral arms, as an octopus's skin does.
    for (const at of [17, 41]) {
      const p = (sec - at) / 1.8;
      if (p < 0 || p > 1) continue;
      const xb = lerp(-12, 140, ease.inOutQuad(p)) + ox;
      for (let y = 0; y < 50 + oy; y++)
        for (let x = Math.max(0, Math.floor(xb - 12)); x < Math.min(W, xb + 12); x++) {
          const d = (x - xb + 0.35 * (y - 30)) / 3.2;
          if (d * d < 9 && g.buf[y * W + x] && !dither(x, y, 1 - 0.6 * Math.exp(-d * d))) g.buf[y * W + x] = 0;
        }
    }

    drawRocks(g, ox, oy);
    drawRockLife(g, T, ox, oy);

    oled.contrast(DAY_CONTRAST + (NIGHT_CONTRAST - DAY_CONTRAST) * ctx.night);
  },
};
