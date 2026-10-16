// dollquilt: "Running Stitch". The owner's two plush dolls live on a grey
// cotton quilt, appliqued in felt and bouclé, and the time is quilted into
// the cloth in white running stitch.
//
// Story of a minute. The shaggy panda sits on the right, holding a sewing
// needle. Before each minute turns, a loose end works free from the digit
// that is about to change; the floppy black-and-tan puppy, lying flat with
// its head on its paws, paws at it and tugs, and the stitches pop out one by
// one (right to left) until the old digit is gone, the thread balled up
// round its paw. After :00 the needle hops out of the panda's paw and sews
// the new digit, stitch by stitch, drawing the very same thread back out of
// the puppy's tangle; it ties off and hops home. In between: the panda nods
// off and jerks awake, the puppy lifts its head to look about, sighs, and
// gives the loose end a playful tug that puckers the stitches. On the hour
// the puppy rolls belly-up (its tan belly and lavender tag) and paddles its
// paws while the panda throws its arms up.
//
// Never wrong: an old digit is only ever unpicked before :00 and a new one
// only sewn after it; a digit is whole, partly removed or partly sewn.
//
// Palette, from the photos: the dolls' sampled colours (tan #b8781a with its
// lit and shaded felt, black #161412, nose #5a3a22, tag lavender #9a7ad8;
// panda cream #efeadf / #d2cbbc, black #141418) on a cool mid-grey cotton
// that both blacks and the cream read against, plus white thread. All hard
// pixels: felt and thread have crisp cut edges; the panda's pile is built
// from many small loops so its outline is ragged everywhere.

import { Gfx, hex, mix, sin, cos, rand, noise, clamp, lerp, progress, ease, clockFields, TAU } from '../js/kit.js';
import { GLYPHS, GW, GH, at } from './dollquilt-glyphs.js';

// ------------------------------------------------------------ palette
const C = {
  cloth: hex('#7e838d'), twill: hex('#777c86'), clothLo: hex('#6f747e'), clothHi: hex('#878c96'),
  quilt: hex('#979ca6'), quiltDent: hex('#6c717a'),
  thread: hex('#ece8de'), sheen: hex('#ffffff'), threadSh: hex('#5a5f68'), hole: hex('#4c5058'),
  tan: hex('#b8781a'), tanLit: hex('#e0a040'), tanSh: hex('#845618'),
  pup: hex('#161412'), pupFuzz: hex('#2c2722'), nose: hex('#5a3a22'), noseLit: hex('#7a5436'),
  bead: hex('#050505'), glint: hex('#ffffff'), tag: hex('#9a7ad8'),
  cream: hex('#efeadf'), creamSh: hex('#d2cbbc'), pblack: hex('#141418'), ploop: hex('#30303a'),
  pshine: hex('#4a4a56'), pupRim: hex('#433a31'),
  chalk: hex('#a6d2ff'),
  steel: hex('#b9bec8'), steelHi: hex('#ffffff'), steelLo: hex('#7a808a'),
  btnA: hex('#9a7ad8'), btnALo: hex('#6e54a8'), btnB: hex('#d9a640'), btnBLo: hex('#a8781e'),
};

// ------------------------------------------------------------ layout
const DY = 5;                                   // top of the numerals
const DX = [4, 25, 58, 79];                     // H1 H2 : M1 M2
const COLON_X = 51.5;
const NEEDLE_HOME = [114.5, 58];                // in the panda's left paw (viewer's left)
const PUP_X = 58;                               // puppy's centre line
const LEG_L = [26.5, 72.5], LEG_R = [89.5, 72.5]; // the splayed back paws, at rest

// ------------------------------------------------------------ the quilt (built once)
const BG = new Gfx(160, 80);
(function buildCloth() {
  const g = BG;
  g.clear(C.cloth);
  // plain-weave cotton with a faint twill, and soft mottling of the batting
  for (let y = 0; y < 80; y++)
    for (let x = 0; x < 160; x++) {
      const n = noise(x * 0.11 + y * 0.03, 7) * 0.6 + noise(y * 0.17 - x * 0.02, 9) * 0.4;
      let c = C.cloth;
      if ((x + 2 * y) % 5 === 0) c = C.twill;
      if (n > 0.74) c = mix(c, C.clothHi, 0.45);
      else if (n < 0.24) c = mix(c, C.clothLo, 0.4);
      g.pixel(x, y, c);
    }
  // echo quilting: running-stitch contours round where the dolls sit, the way
  // a quilter outlines an applique; each line dents the batting beside it
  const echo = (cx, cy, rx, ry, a0, a1, seedOff) => {
    const n = Math.ceil(((a1 - a0) * (rx + ry)) / 2 / 4.2);
    for (let i = 0; i < n; i++) {
      const u0 = a0 + ((a1 - a0) * i) / n, u1 = u0 + ((a1 - a0) / n) * 0.6;
      const x0 = cx + Math.cos(u0) * rx, y0 = cy + Math.sin(u0) * ry;
      const x1 = cx + Math.cos(u1) * rx, y1 = cy + Math.sin(u1) * ry;
      g.thickLine(x0 + 0.5, y0 + 1.2, x1 + 0.5, y1 + 1.2, 1, C.quiltDent);
      g.thickLine(x0, y0, x1, y1, 1, C.quilt);
    }
  };
  // round the panda (right) and the puppy (bottom), and a wave under the time
  echo(132, 46, 34, 44, Math.PI * 0.62, Math.PI * 1.62, 1);
  echo(132, 46, 40, 52, Math.PI * 0.7, Math.PI * 1.55, 2);
  echo(PUP_X, 80, 46, 30, Math.PI * 1.05, Math.PI * 1.95, 3);
  for (let i = 0; i < 26; i++) {
    const x0 = 2 + i * 3.9, x1 = x0 + 2.4;
    const y0 = 39 + Math.sin(x0 * 0.12) * 1.6, y1 = 39 + Math.sin(x1 * 0.12) * 1.6;
    if (x0 > 100) break;
    g.thickLine(x0 + 0.5, y0 + 1.2, x1 + 0.5, y1 + 1.2, 1, C.quiltDent);
    g.thickLine(x0, y0, x1, y1, 1, C.quilt);
  }
})();

// ------------------------------------------------------------ helpers
const digitsOf = (f) => f.hh + f.mm;
const sheenAt = (x, t) => {
  const p = ((t * 26) % 260) - 50;             // a slow glint that runs along the threads
  const d = Math.abs(x - p);
  return d < 9 ? 1 - d / 9 : 0;
};

/** Quadratic sag curve from a to b, `sag` px down at the middle; points. */
function sagCurve(ax, ay, bx, by, sag, n = 10) {
  const mx = (ax + bx) / 2, my = Math.max(ay, by) + sag;
  const p = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, v = 1 - u;
    p.push([v * v * ax + 2 * u * v * mx + u * u * bx, v * v * ay + 2 * u * v * my + u * u * by]);
  }
  return p;
}
/** Draw the first fraction `upto` of a polyline as a 1 px thread. */
function threadLine(g, pts, upto = 1, c = C.thread) {
  const total = pts.length - 1, end = total * clamp(upto, 0, 1);
  for (let i = 1; i <= Math.ceil(end); i++) {
    const a = pts[i - 1], b = pts[i];
    const f = Math.min(1, end - (i - 1));
    g.line(a[0], a[1], a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, c);
  }
}

// ------------------------------------------------------------ the plan of a minute
const SEW_SPEED = 30;                          // px of path a second
const HOP = 0.45, TIE = 0.25, HOME = 0.6;

function sewSchedule(changed, D) {
  const jobs = [];
  let t = 0.25;
  for (const i of changed) {
    const gl = GLYPHS[D[i]];
    const dur = gl.L / (changed.length > 2 ? SEW_SPEED * 1.25 : SEW_SPEED);
    jobs.push({ i, hop0: t, t0: t + HOP, t1: t + HOP + dur, tie: t + HOP + dur + TIE });
    t += HOP + dur + TIE;
  }
  return { jobs, end: t, home: t + HOME };
}

function unpickSchedule(changed) {
  const order = [...changed].reverse();         // nearest the puppy first
  const n = order.length;
  const U = n === 1 ? 5.0 : n === 2 ? 4.3 : 3.7;
  const end = 59.35, start = end - n * U;
  return { order, U, start, end, prep: start - 1.1 };
}

function plan(f, date) {
  const D = digitsOf(f);
  const P = digitsOf(clockFields(new Date(date.getTime() - 60000)));
  const N = digitsOf(clockFields(new Date(date.getTime() + 60000)));
  const s = f.sec;
  const changedIn = [0, 1, 2, 3].filter((i) => P[i] !== D[i]);
  const changedOut = [0, 1, 2, 3].filter((i) => N[i] !== D[i]);
  const vis = [1, 1, 1, 1];                     // sewn fraction of each digit's path
  const rem = [0, 0, 0, 0];                     // fraction of its stitches unpicked
  const chalk = [0, 0, 0, 0];                   // the marked line of a digit still to sew
  const out = { D, vis, rem, chalk, needle: null, line: null, tail: null, tangle: 0, tug: 0, tugPull: 0, watchX: null, sewing: false, unpicking: false };

  // ---- sewing the new digits, after :00
  const sew = sewSchedule(changedIn, D);
  let sewnFrac = 1;
  if (s < sew.home) {
    out.sewing = true;
    let done = 0, total = 0;
    for (const j of sew.jobs) total += GLYPHS[D[j.i]].L;
    for (const j of sew.jobs) {
      const gl = GLYPHS[D[j.i]];
      const u = progress(s, j.t0, j.t1);
      vis[j.i] = u;
      // the whole new numeral is marked in quilter's blue the moment the
      // minute turns, so it reads in full while the needle works along it
      chalk[j.i] = ease.outQuad(progress(s, 0, 0.3));
      done += u * gl.L;
    }
    sewnFrac = total ? done / total : 1;
    out.tangle = 1 - sewnFrac;
    if (changedIn.length) out.tangleSide = Math.min(...changedIn) < 2 ? -1 : 1;
    // where is the needle?
    let nd = null;
    for (let k = 0; k < sew.jobs.length; k++) {
      const j = sew.jobs[k];
      const gl = GLYPHS[D[j.i]];
      const startP = at(gl, 0);
      const sx = DX[j.i] + startP.x, sy = DY + startP.y;
      if (s >= j.hop0 && s < j.t0) {
        // hop from home (or the previous digit's end) to this digit's start
        let fx = NEEDLE_HOME[0], fy = NEEDLE_HOME[1];
        if (k > 0) { const pj = sew.jobs[k - 1], pg = GLYPHS[D[pj.i]], e = at(pg, pg.L); fx = DX[pj.i] + e.x; fy = DY + e.y; }
        const u = ease.inOutQuad(progress(s, j.hop0, j.t0));
        nd = { x: lerp(fx, sx, u), y: lerp(fy, sy, u) - Math.sin(u * Math.PI) * 9, dx: -0.6, dy: 0.8, mode: 'fly' };
      } else if (s >= j.t0 && s < j.tie) {
        const p = at(gl, vis[j.i] * gl.L);
        // under the cloth between stitches?
        const sl = vis[j.i] * gl.L;
        let onTop = false;
        for (const d of gl.dashes) if (sl >= d.s0 && sl <= d.s1 + 0.2) { onTop = true; break; }
        if (s >= j.t1) onTop = false;
        nd = { x: DX[j.i] + p.x, y: DY + p.y, dx: p.dx, dy: p.dy, mode: onTop ? 'top' : 'under', tie: s >= j.t1 ? progress(s, j.t1, j.tie) : 0 };
      }
    }
    if (!nd && sew.jobs.length && s >= sew.end && s < sew.home) {
      const lj = sew.jobs[sew.jobs.length - 1], lg = GLYPHS[D[lj.i]], e = at(lg, lg.L);
      const u = ease.inOutQuad(progress(s, sew.end, sew.home));
      nd = { x: lerp(DX[lj.i] + e.x, NEEDLE_HOME[0], u), y: lerp(DY + e.y, NEEDLE_HOME[1], u) - Math.sin(u * Math.PI) * 10, dx: 0.3, dy: -1, mode: 'fly' };
    }
    if (nd) { out.needle = nd; out.watchX = nd.x; }
    if (!sew.jobs.length) out.sewing = false;
  }

  // ---- unpicking the old digits, before :00
  const un = unpickSchedule(changedOut);
  if (s >= un.prep) {
    out.unpicking = true;
    let pulled = 0, total = 0;
    for (const i of un.order) total += GLYPHS[D[i]].L;
    const K = 5;                                 // tugs per digit
    for (let k = 0; k < un.order.length; k++) {
      const i = un.order[k], gl = GLYPHS[D[i]];
      const t0 = un.start + k * un.U, t1 = t0 + un.U;
      const lead = k === 0 ? un.prep : t0;       // the loose end works free and falls
      const tugT0 = t0 + (k === 0 ? 0 : 0.45);
      let frac = 1;
      if (s >= tugT0) {
        const v = clamp((s - tugT0) / (t1 - tugT0 - 0.15), 0, 1) * K;
        const n = Math.floor(v), ph = v - n;
        const step = n >= K ? K : n + ease.outCubic(clamp(ph / 0.42, 0, 1));
        frac = 1 - step / K;
        if (s < t1 && n < K) { out.tug = ph; out.tugPull = ph < 0.42 ? ease.outQuad(ph / 0.42) : 1 - ease.inOutQuad((ph - 0.42) / 0.58); }
      }
      if (s >= t1) frac = 0;
      rem[i] = 1 - frac;
      pulled += (1 - frac) * gl.L;
      if (s >= lead && s < t1) {
        const e = at(gl, gl.L);                  // the loose end, at the end of the thread
        out.line = { i, x: DX[i] + e.x, y: DY + e.y, grow: progress(s, lead, lead + (k === 0 ? 0.7 : 0.4)) };
        if (s < tugT0 && k === 0) out.reach = progress(s, lead + 0.4, tugT0);
      }
    }
    out.tangle = total ? pulled / total : 0;
    if (s >= un.end) out.tangle = 1;
    out.tangleSide = Math.min(...changedOut) < 2 ? -1 : 1;
  }
  return out;
}

// ------------------------------------------------------------ the numerals
export function drawDigit(g, d, ox, oy, vis, t, pucker, rem = 0, chalk = 0) {
  const gl = GLYPHS[d];
  const v = vis * gl.L;
  if (chalk > 0) {
    // the marked line, only where the needle has not been yet
    const cc = mix(C.cloth, C.chalk, chalk);
    for (const st of gl.strokes) {
      const p = st.pts;
      for (let k = 4; k < p.length + 3; k += 4) {
        const a = p[k - 4], b = p[Math.min(k, p.length - 1)];
        if (st.base + b[2] <= v + 1.2) continue;
        g.thickLine(ox + a[0], oy + a[1], ox + b[0], oy + b[1], 1.6, cc);
      }
    }
  }
  if (v <= 0 || rem >= 0.999) return;
  // the knot where the thread starts
  const k0 = at(gl, 0);
  g.pixel(ox + k0.x, oy + k0.y + 1, C.hole);
  for (const ds of gl.dashes) {
    if (ds.s0 >= v) break;
    const s1 = Math.min(ds.s1, v);
    if (s1 - ds.s0 < 0.3) continue;
    // round-ended 2 px thread: inset the ends so the gaps under the cloth show
    let p0 = Math.min(ds.s0 + 0.9, s1), p1 = Math.max(ds.s0 + 0.9, s1 - (s1 >= ds.s1 ? 0.9 : 0.4));
    if (rem > 0) {
      // unpicking: every tug draws the thread through, and every stitch of
      // the numeral shortens toward its middle at once, down to a dot; the
      // numeral fades as a whole and never becomes part of another one
      const mid = (p0 + p1) / 2, half = ((p1 - p0) / 2) * (1 - rem);
      p0 = mid - half; p1 = mid + half;
    }
    const a = at(gl, p0), b = at(gl, p1);
    const fade = rem > 0.7 ? 1 - (rem - 0.7) / 0.3 : 1, w = rem > 0.7 ? 1.5 : 2;
    let ax = ox + a.x, ay = oy + a.y, bx = ox + b.x, by = oy + b.y;
    if (pucker) {
      // a playful tug draws the last few stitches toward the paw
      const wa = clamp(1 - (gl.L - ds.s0) / 16, 0, 1), wb = clamp(1 - (gl.L - s1) / 16, 0, 1);
      ax += pucker[0] * wa; ay += pucker[1] * wa; bx += pucker[0] * wb; by += pucker[1] * wb;
    }
    g.thickLine(ax + 0.6, ay + 0.9, bx + 0.6, by + 0.9, w, C.threadSh, { a: fade });
    const sh = sheenAt((ax + bx) / 2, t);
    g.thickLine(ax, ay, bx, by, w, sh > 0 ? mix(C.thread, C.sheen, sh) : C.thread, { a: fade });
    // the needle holes at each end of a stitch
    if (s1 >= ds.s1) {
      g.pixel(bx + b.dx * 1.4, by + b.dy * 1.4, C.hole);
    }
  }
}

function drawButton(g, cx, cy, c, lo, t) {
  g.fillCircle(cx + 0.5, cy + 0.6, 3.3, C.threadSh);
  g.fillCircle(cx, cy, 3.2, c);
  g.circle(Math.floor(cx), Math.floor(cy), 3, lo);
  // four holes sewn with a white cross
  const x = Math.floor(cx), y = Math.floor(cy);
  g.pixel(x - 1, y - 1, C.thread); g.pixel(x + 1, y + 1, C.thread);
  g.pixel(x + 1, y - 1, C.thread); g.pixel(x - 1, y + 1, C.thread);
  g.pixel(x, y, C.thread);
}

// ------------------------------------------------------------ the needle
function drawNeedle(g, nd) {
  let { x, y, dx, dy } = nd;
  // a needle is held at a slant to the seam, point first
  const ang = Math.atan2(dy, dx) - 0.5;
  dx = Math.cos(ang); dy = Math.sin(ang);
  const len = nd.mode === 'under' ? 3 : 8;
  const tx = x + dx * 1.5, ty = y + dy * 1.5;
  const ex = tx - dx * len, ey = ty - dy * len;
  if (nd.mode === 'under') g.pixel(tx, ty, C.hole);
  g.line(tx, ty, ex, ey, C.steel);
  g.pixel(ex, ey, C.steelLo);
  g.pixel(tx - dx * 3, ty - dy * 3, C.steelHi);
  return [ex - dx, ey - dy];                     // the eye
}

// ------------------------------------------------------------ the panda
// Shaggy: every black or cream mass is an ellipse fringed with small loops,
// so no edge is smooth, and a scatter of curls in the shade colour.
function shag(g, cx, cy, rx, ry, c, loopC, seed, n, t, curls = 0) {
  g.fillEllipse(cx, cy, rx, ry, c);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (rand(i, seed) - 0.5) * 0.35;
    const out = 0.2 + rand(i, seed, 2) * 1.3 + Math.sin(t * 1.3 + i) * 0.25;
    const r = 0.9 + rand(i, seed, 1) * 0.9;
    g.fillCircle(cx + Math.cos(a) * (rx + out - 0.6), cy + Math.sin(a) * (ry + out - 0.6), r, c);
  }
  for (let i = 0; i < curls; i++) {
    const a = rand(i, seed, 5) * TAU, rr = Math.sqrt(rand(i, seed, 6)) * 0.82;
    const x = Math.floor(cx + Math.cos(a) * rx * rr), y = Math.floor(cy + Math.sin(a) * ry * rr);
    // a little looped curl: three pixels in an arch
    g.pixel(x, y, loopC); g.pixel(x + 1, y - 1, loopC); g.pixel(x + 2, y, loopC);
  }
}
function capsule(g, x0, y0, x1, y1, r, c, loopC, seed, t) {
  g.thickLine(x0, y0, x1, y1, r * 2, c);
  const n = 10;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), side = i % 2 ? 1 : -1;
    const px = lerp(x0, x1, u), py = lerp(y0, y1, u);
    const nx = -(y1 - y0), ny = x1 - x0, nl = Math.hypot(nx, ny) || 1;
    const o = r + 0.1 + rand(i, seed) * 0.8;
    g.fillCircle(px + (nx / nl) * o * side, py + (ny / nl) * o * side, 1 + rand(i, seed, 1) * 0.6, c);
  }
  g.pixel(lerp(x0, x1, 0.5), lerp(y0, y1, 0.5), loopC);
  g.pixel(lerp(x0, x1, 0.5) + 1, lerp(y0, y1, 0.5) - 1, loopC);
}
/** A slanted teardrop eye patch: narrow at the bridge (p0), round and low at the outside (p1). */
function teardrop(g, p0x, p0y, r0, p1x, p1y, r1, c) {
  const dx = p1x - p0x, dy = p1y - p0y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
  g.fillPolygon([[p0x + nx * r0, p0y + ny * r0], [p1x + nx * r1, p1y + ny * r1], [p1x - nx * r1, p1y - ny * r1], [p0x - nx * r0, p0y - ny * r0]], c);
  g.fillCircle(p1x, p1y, r1, c);
  g.fillCircle(p0x, p0y, r0, c);
}

function drawPanda(g, pose, t) {
  const { hx, hy, rot, armL, armR, night } = pose;
  const ct = Math.cos(rot), st = Math.sin(rot);
  const R = (x, y) => [hx + x * ct - y * st, hy + x * st + y * ct];   // head-local to canvas
  // body
  const bx = 132, by = 53 + pose.breathe * 0.4;
  // legs out in front: big round black feet
  shag(g, 122, 72.5, 8.2, 7.2, C.pblack, C.ploop, 31, 16, t, 3);
  shag(g, 142.5, 72.5, 8.2, 7.2, C.pblack, C.ploop, 32, 16, t, 3);
  // torso and its cream heart belly under a black shawl
  shag(g, bx, by + 1, 14, 13.5, C.cream, C.creamSh, 33, 22, t, 5);
  shag(g, bx, by - 8, 17, 7, C.pblack, C.ploop, 34, 22, t, 4);
  // heart belly: two lobes pushing up into the shawl, a point at the bottom
  g.fillCircle(bx - 5.2, by - 2.5, 6.2, C.cream);
  g.fillCircle(bx + 5.2, by - 2.5, 6.2, C.cream);
  g.fillPolygon([[bx - 11, by - 1], [bx + 11, by - 1], [bx, by + 12.5]], C.cream);
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(bx - 7 + rand(i, 41) * 14), y = Math.floor(by - 4 + rand(i, 42) * 10);
    g.pixel(x, y, C.creamSh); g.pixel(x + 1, y - 1, C.creamSh); g.pixel(x + 2, y, C.creamSh);
  }
  // arms hanging at the sides, running out of the shawl
  capsule(g, 118, 46, 115.5 + armL[0], 61 + armL[1], 4.2, C.pblack, C.ploop, 35, t);
  capsule(g, 146, 46, 148.5 + armR[0], 61 + armR[1], 4.2, C.pblack, C.ploop, 36, t);
  // head: ears behind, then the big round cream head
  const e1 = R(-13.6, -12.2 + pose.earL), e2 = R(13.6, -12.2 + pose.earR);
  shag(g, e1[0], e1[1], 5, 4.6, C.pblack, C.ploop, 37, 12, t, 1);
  shag(g, e2[0], e2[1], 5, 4.6, C.pblack, C.ploop, 38, 12, t, 1);
  shag(g, hx, hy, 17.5, 15.8, C.cream, C.creamSh, 39, 34, t, 8);
  // eye patches: big slanting teardrops drooping out and down from the bridge
  const fd = pose.faceDrop;
  const a0 = R(-2.7, -3.6 + fd), a1 = R(-8.4, 2.6 + fd);
  const b0 = R(2.7, -3.6 + fd), b1 = R(8.4, 2.6 + fd);
  teardrop(g, a0[0], a0[1], 1.7, a1[0], a1[1], 4.1, C.pblack);
  teardrop(g, b0[0], b0[1], 1.7, b1[0], b1[1], 4.1, C.pblack);
  // the eyes, lost in the patches: a faint shine, gone when it dozes
  if (!pose.shut) {
    const s1 = R(-5.6, -0.4 + fd), s2 = R(4.6, -0.4 + fd);
    g.pixel(s1[0], s1[1], C.pshine); g.pixel(s2[0], s2[1], C.pshine);
  }
  // small black rounded nose low in the face, and a stitched mouth
  const n = R(0, 9 + fd);
  g.fillEllipse(n[0], n[1], 2.2, 1.6, C.pblack);
  const m = R(0, 11.2 + fd);
  g.pixel(m[0], m[1], C.creamSh); g.pixel(m[0] - 1, m[1] + 1, C.creamSh); g.pixel(m[0] + 1, m[1] + 1, C.creamSh);
}

// ------------------------------------------------------------ the puppy
// Felt applique: flat blocks of black and tan with hard cut edges, a lit and
// a shaded edge on the tan, and a little fuzz.
function drawPuppy(g, pose, t) {
  const { sx, ox, oy } = pose;
  if (Math.abs(sx) < 0.04) return;
  const X = (x) => PUP_X + (x - PUP_X) * sx + ox;
  const E = (x, y, rx, ry, c) => g.fillEllipse(X(x), y + oy, Math.max(0.3, rx * Math.abs(sx)), ry, c);
  const Pt = (x, y, c) => g.pixel(X(x), y + oy, c);
  const ell = (x, y, rx, ry, rot, c) => {
    const pts = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU, px = Math.cos(a) * rx, py = Math.sin(a) * ry;
      pts.push([X(x + px * Math.cos(rot) - py * Math.sin(rot)), y + oy + px * Math.sin(rot) + py * Math.cos(rot)]);
    }
    g.fillPolygon(pts, c);
  };
  if (pose.belly) return drawBellyUp(g, pose, X, E, Pt, ell, t);

  const lift = pose.lift, hy = -2.6 * lift, ey = -1.8 * pose.earLift;
  const breath = pose.sigh;
  // back legs splayed out at the sides, tan mitten paws
  // (either one can lift to catch a loose thread, and kick back to tug it)
  const [lx0, ly0] = pose.legL, [rx0, ry0] = pose.legR;
  const leg = (bx, px, py, ox, oy2) => {
    g.thickLine(X(bx), 70.5 + oy, X(px + ox * 0.5), py + oy2 * 0.6 + oy, 8, C.pup);
    E(px + ox, py + oy2, 5.6, 3.9, C.tan);
    E(px + ox + (px < PUP_X ? -0.5 : 0.5), py + oy2 - 1.3, 3.8, 1.6, C.tanLit);
    E(px + ox, py + oy2 + 0.3, 4.6, 2.6, C.tan);
  };
  leg(40, LEG_L[0], LEG_L[1], lx0, ly0);
  leg(76, LEG_R[0], LEG_R[1], rx0, ry0);
  // the lavender sewn-in tag on one paw
  g.fillRect(Math.round(X(LEG_R[0] + rx0 + 1)), Math.round(LEG_R[1] + ry0 + oy + 1), 2, 2, C.tag);
  // the beanbag body behind the head
  E(PUP_X, 60.5 - breath, 24 + breath * 0.6, 10.5 + breath, C.pup);
  // front paws, the head resting on them
  for (const px of [48.5, 67.5]) {
    E(px, 74.5, 6, 4, C.tan);
    E(px, 73.3, 4, 1.6, C.tanLit); E(px, 74.8, 5, 2.8, C.tan);
  }
  // ears: long, soft, rounded, hanging below the jaw (drawn behind the face);
  // a lighter fuzz rim is the only thing that tells black felt from black felt
  const ey0 = 62.8 + hy * 0.5 + ey;
  ell(38.2, ey0, 6, 11.4, 0.2 + pose.earSwing, C.pupRim);
  ell(77.8, ey0, 6, 11.4, -0.2 - pose.earSwing, C.pupRim);
  ell(38.2, ey0, 5, 10.4, 0.2 + pose.earSwing, C.pup);
  ell(77.8, ey0, 5, 10.4, -0.2 - pose.earSwing, C.pup);
  // head: wide, flattened, black on top
  E(PUP_X, 57 + hy, 18, 12.6, C.pupRim);
  E(PUP_X, 57 + hy, 17, 11.8, C.pup);
  // fuzz on the crown
  for (let i = 0; i < 9; i++) Pt(PUP_X - 13 + i * 3.2 + rand(i, 51) * 1.5, 45.3 + hy + Math.abs(i - 4) * 0.55, C.pupFuzz);
  // the muzzle: puffy tan cheeks like a fat crescent
  E(51.6, 63.2 + hy, 6.6, 6.2, C.tan); E(64.4, 63.2 + hy, 6.6, 6.2, C.tan);
  E(PUP_X, 64 + hy, 9.5, 5.6, C.tan);
  E(51.4, 60.6 + hy, 4.4, 2.8, C.tanLit); E(64.6, 60.6 + hy, 4.4, 2.8, C.tanLit);
  E(51.6, 64.1 + hy, 6.2, 5, C.tan); E(64.4, 64.1 + hy, 6.2, 5, C.tan);
  E(PUP_X, 68.4 + hy, 7, 1.6, C.tanSh);
  E(PUP_X, 66.8 + hy, 8.4, 1.8, C.tan);
  // nose: small rounded triangle of dark-brown felt, in the middle of the tan
  E(PUP_X, 59.4 + hy, 3.1, 1.7, C.nose);
  g.fillPolygon([[X(PUP_X - 2.6), 59.6 + hy + oy], [X(PUP_X + 2.6), 59.6 + hy + oy], [X(PUP_X), 62.4 + hy + oy]], C.nose);
  Pt(PUP_X - 1, 58.4 + hy, C.noseLit);
  // the mouth seam
  Pt(PUP_X, 63 + hy, C.tanSh); Pt(PUP_X - 1, 64 + hy, C.tanSh); Pt(PUP_X + 1, 64 + hy, C.tanSh);
  // two tiny bead eyes close together, high, just above the muzzle, and the
  // tan eyebrow dots above them
  const lx = pose.look;
  for (const ex of [54.5, 61.5]) {
    const x = Math.round(X(ex) - 1 + lx), y = Math.round(53.4 + hy + oy);
    g.fillRect(Math.round(X(ex) - 1), y - 3, 2, 1, C.tan);
    if (pose.shut) { g.fillRect(x, y + 1, 2, 1, C.pupFuzz); continue; }
    g.fillRect(x, y, 2, 2, C.bead);
    g.pixel(x, y, C.glint);
  }
}

function drawBellyUp(g, pose, X, E, Pt, ell, t) {
  // on its back, head to the left: black sides, the long tan belly oval, four
  // tan mitten paws in the air, paddling, and the lavender tag on the belly
  const pad = (k) => Math.sin(t * 9 + k * 1.7) * 1.2;
  const oy = pose.oy;
  // legs, black, with tan paws, splayed
  ell(48, 53 + pad(0), 3.6, 7, 0.5, C.pup); ell(48, 73 - pad(1), 3.6, 7, -0.5, C.pup);
  ell(76, 53 + pad(2), 3.6, 7, -0.5, C.pup); ell(76, 73 - pad(3), 3.6, 7, 0.5, C.pup);
  E(45, 48 + pad(0), 5, 3.6, C.tan); E(45, 78 - pad(1), 5, 3.6, C.tan);
  E(79, 48 + pad(2), 5, 3.6, C.tan); E(79, 78 - pad(3), 5, 3.6, C.tan);
  E(45, 47.2 + pad(0), 3.2, 1.4, C.tanLit); E(79, 47.2 + pad(2), 3.2, 1.4, C.tanLit);
  // body
  E(64, 63, 19, 10.5, C.pup);
  E(65, 63, 14, 6.6, C.tan);
  E(65, 61.4, 10, 2.6, C.tanLit);
  E(65, 63.4, 13, 4.6, C.tan);
  g.fillRect(Math.round(X(70)), Math.round(64 + oy), 3, 2, C.tag);
  // head, upside down: black crown to the left, tan chin and muzzle to the right
  ell(36, 54.5, 4.4, 9, 1.2, C.pup); ell(36, 71.5, 4.4, 9, -1.2, C.pup);
  E(38, 63, 11, 10.5, C.pup);
  E(42, 59, 5.4, 5.6, C.tan); E(42, 67, 5.4, 5.6, C.tan); E(45, 63, 4.6, 7, C.tan);
  E(39.3, 63, 1.6, 2.6, C.nose);
  // eyes squeezed shut with joy: two tiny arcs
  Pt(33, 60, C.tan); Pt(33, 66, C.tan);
  Pt(31.5, 59.5, C.bead); Pt(31, 60, C.bead); Pt(31.5, 66.5, C.bead); Pt(31, 66, C.bead);
}

// ------------------------------------------------------------ poses from the clock
function pandaPose(f, pl, t, night) {
  const s = f.sec;
  // sleepy nodding: droops over ~6 s, then jerks awake
  const cyc = 7.3, ph = ((s + f.minuteKey * 2.1) % cyc) / cyc;
  let droop = ph < 0.86 ? ease.inQuad(ph / 0.86) : 1 - ease.outCubic((ph - 0.86) / 0.14);
  let jerk = ph >= 0.86 && ph < 0.95 ? Math.sin(((ph - 0.86) / 0.09) * Math.PI) : 0;
  if (pl.sewing || pl.unpicking) { droop *= 0.25; jerk = 0; }
  if (night) { droop = 1; jerk = 0; }
  let rot = (droop * 0.11) * (f.minuteKey % 2 ? 1 : -1);
  if (pl.watchX != null) rot = clamp((pl.watchX - 132) / 400, -0.12, 0.08);
  const pose = {
    hx: 132 + rot * 6, hy: 24.5 + droop * 2.2, rot, faceDrop: droop * 0.8,
    earL: -jerk * 1.5, earR: -jerk * 1.5, armL: [0, 0], armR: [0, 0],
    breathe: Math.sin(t * 1.6), shut: droop > 0.75 || night,
  };
  // holding the needle: the left paw lifts while it is out sewing
  if (pl.needle) pose.armL = [-1, -3];
  // hour: both arms up
  if (f.m === 0 && s > 1 && s < 4.2) {
    const u = Math.sin(progress(s, 1, 4.2) * Math.PI);
    pose.armL = [-4 * u, -14 * u]; pose.armR = [4 * u, -14 * u];
    pose.hy -= 1.5 * u; pose.shut = false;
  }
  return pose;
}

function puppyPose(f, pl, t, night) {
  const s = f.sec, key = f.minuteKey;
  const pose = { sx: 1, ox: 0, oy: 0, lift: 0, earLift: 0, earSwing: 0, look: 0, sigh: 0, shut: false, legL: [0, 0], legR: [0, 0], side: 1, belly: false };
  // idle life, in 8-second beats chosen per minute
  const beat = Math.floor(s / 8), bp = (s % 8) / 8, r = rand(key, beat, 61);
  if (r < 0.4) { // lift the head and look about
    const u = Math.sin(progress(bp, 0.1, 0.7) * Math.PI);
    pose.lift = u; pose.earLift = Math.sin(clamp(progress(bp, 0.06, 0.66), 0, 1) * Math.PI);
    pose.look = Math.round(Math.sin(bp * TAU * 1.5)) * u;
  } else if (r < 0.65) { // a big sigh
    pose.sigh = Math.sin(progress(bp, 0.2, 0.8) * Math.PI) * 1.2;
  } else if (r < 0.85) { // a playful paw at the loose end
    const u = Math.sin(progress(bp, 0.2, 0.55) * Math.PI);
    pose.legR = [1.5 * u, -5 * u];
    pose.pucker = u; pose.look = Math.round(u);
  }
  // blinks
  if (((s + (key % 5)) % 4.3) < 0.13) pose.shut = true;
  if (night && !pl.unpicking) { pose.shut = true; pose.lift = 0; pose.look = 0; }
  // watching the needle
  if (pl.watchX != null) { pose.lift = 0.6; pose.look = clamp(Math.round((pl.watchX - PUP_X) / 22), -1, 1); pose.shut = false; }
  // tugging: paw up to the loose end, then yank back with the whole body
  if (pl.unpicking && pl.line) {
    const reach = pl.reach ?? 1, back = pl.tugPull, side = pl.line.i < 2 ? -1 : 1;
    // the back paw comes up to catch the end, then kicks down and out
    const lg = [side * (1 + back * 2.5), -5 * reach + back * 4];
    if (side < 0) pose.legL = lg; else pose.legR = lg;
    pose.side = side;
    pose.ox = -side * back * 1.6; pose.lift = 0.5 + back * 0.4; pose.earSwing = back * 0.3 * side; pose.shut = false;
    pose.look = side;
  } else if (pl.unpicking && pl.tangle >= 1) {
    pose.lift = 0.4;
  }
  // which paw holds the tangle: the side of the leftmost changing digit
  if (pl.tangleSide) pose.side = pl.tangleSide;
  pose.pucker = pose.pucker && !pl.unpicking && !pl.sewing ? pose.pucker : 0;
  // the hour: roll onto its back, paddle, roll back (a quick squash flip)
  if (f.m === 0 && s > 0.6 && s < 9.6) {
    const flip = s < 1.1 ? progress(s, 0.6, 1.1) : s > 9.1 ? 1 - progress(s, 9.1, 9.6) : 1;
    pose.sx = Math.cos(flip * Math.PI);           // 1 -> 0 -> -1
    pose.belly = flip > 0.5;
    if (pose.belly) pose.sx = -pose.sx;           // keep the head on the left
    pose.oy = -Math.sin(flip * Math.PI) * 3;
  }
  return pose;
}

// ------------------------------------------------------------ tangle of thread
const TANGLE = (() => {
  const p = [];
  let a = 0;
  for (let i = 0; i < 26; i++) {
    a += 1.9 + rand(i, 71) * 1.1;
    const r = 1.2 + rand(i, 72) * 2.4;
    p.push([Math.cos(a) * r * 1.3, Math.sin(a) * r * 0.85]);
  }
  return p;
})();
function drawTangle(g, x, y, amount) {
  const n = Math.floor(amount * (TANGLE.length - 1));
  for (let i = 1; i <= n; i++) g.line(x + TANGLE[i - 1][0], y + TANGLE[i - 1][1], x + TANGLE[i][0], y + TANGLE[i][1], C.thread);
}

// ------------------------------------------------------------ the face
export default {
  name: 'Running Stitch',
  blurb: 'The owner\'s floppy puppy and shaggy panda on a grey quilt: the puppy tugs out the old minute\'s stitches, the panda\'s needle sews the new one with the same thread.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, t = (ctx.date.getTime() % 3600000) / 1000, night = ctx.night > 0.5;
    ctx.lcd.backlight(1 - 0.7 * ctx.night);
    const pl = plan(f, ctx.date);
    const pp = puppyPose(f, pl, t, night);
    const pa = pandaPose(f, pl, t, night);

    g.draw(BG, 0, 0);

    // the time, quilted in
    const pk = pp.pucker ? [pp.pucker * 1.2, pp.pucker * 1.6] : null;
    for (let i = 0; i < 4; i++) drawDigit(g, pl.D[i], DX[i], DY, pl.vis[i], t, i === 3 ? pk : null, pl.rem[i], pl.chalk[i]);
    drawButton(g, COLON_X, 12.5, C.btnA, C.btnALo, t);
    drawButton(g, COLON_X, 26, C.btnB, C.btnBLo, t);

    drawPanda(g, pa, t);
    if (!pl.needle) {
      // resting in the panda's paw, point up
      g.line(NEEDLE_HOME[0] - 2, NEEDLE_HOME[1] - 5, NEEDLE_HOME[0] + 1, NEEDLE_HOME[1] + 3, C.steel);
      g.pixel(NEEDLE_HOME[0] - 2, NEEDLE_HOME[1] - 5, C.steelHi);
    }
    drawPuppy(g, pp, t);

    // where the puppy holds its thread
    let hold;
    if (pp.belly) hold = [PUP_X + ((pp.side < 0 ? 45 : 79) - PUP_X) * Math.abs(pp.sx), 46.5 + pp.oy];
    else {
      const L = pp.side < 0 ? LEG_L : LEG_R, o = pp.side < 0 ? pp.legL : pp.legR;
      hold = [PUP_X + (L[0] + o[0] - PUP_X) * pp.sx + pp.ox, L[1] + o[1] - 3 + pp.oy];
    }
    // the freed thread runs down the outside of the puppy's ear to its paw
    const tether = (x, y, side, grow, slack) => {
      const cx = hold[0] + side * slack, cy = y + 6;
      const pts = [];
      for (let k = 0; k <= 12; k++) {
        const u = k / 12, v = 1 - u;
        pts.push([v * v * x + 2 * u * v * cx + u * u * hold[0], v * v * (y + 1) + 2 * u * v * cy + u * u * hold[1]]);
      }
      threadLine(g, pts, grow);
    };
    if (pl.line) tether(pl.line.x, pl.line.y, pl.line.i < 2 ? -1 : 1, pl.line.grow, 3 - pl.tugPull * 2);
    else if (pp.pucker > 0) {
      // playing with the loose end of the minute: it pulls the stitches a little
      const gl = GLYPHS[pl.D[3]], e = at(gl, gl.L);
      tether(DX[3] + e.x + pk[0], DY + e.y + pk[1], 1, clamp(pp.pucker * 2, 0, 1), 4 - pp.pucker * 2);
    }
    if (pl.tangle > 0.02) drawTangle(g, hold[0], hold[1] + 1, pl.tangle);
    if (pl.needle) drawNeedle(g, pl.needle);
  },
};
