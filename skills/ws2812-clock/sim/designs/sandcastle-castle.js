// Low Tide: the castles. Each slot shows its digit's castle; in a turn the
// old castle slumps column by column as the wave passes (sand sinks and
// spreads into a wet mound), then the new one is built part by part: drums
// drop out of a bucket, walls are patted along, and the flag goes up last.
import * as kit from '../js/kit.js';
import { GW, GH, GROUND, SLOTS, img, over, C, dot } from './sandcastle-common.js';
import { glyph } from './sandcastle-font.js';

const DRY = C('#eac485'), WET = C('#b08450'), MOUND = C('#6e4c28'), CANDLE = C('#ffae4a');
const FLAG = C('#ff3424'), BUCKETS = [C('#ffc21a'), C('#ff3b30'), C('#2f80ff'), C('#2ed06a')];
const PENNANTS = [C('#ff3424'), C('#ffd21a'), C('#2f80ff'), C('#f4f4f4'), C('#2ed06a')];

const mounds = new Map();
/** The slumped heap an old castle turns into: its sand per column, spread and lowered. */
function moundOf(g) {
  if (mounds.has(g)) return mounds.get(g);
  const n = g.bw + 8, m = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < g.bw; j++) s += g.col[j] * Math.exp(-((i - 4 - j) ** 2) / (2 * 2.6 * 2.6));
    m[i] = Math.min(g.S.H * 0.4, s / (2.6 * 2.507) * 0.42);
  }
  mounds.set(g, m);
  return m;
}

/** How far each part of a build has got (0..1) at sec. */
export function partProgress(b, g, sec) {
  const n = g.parts.length, slot = (b.dur * 0.82) / n;
  return g.parts.map((_, i) => kit.clamp((sec - b.start - i * slot) / (slot * 1.5)));
}
/** Screen x of a part (where the builder stands), at progress f. */
export function partX(g, k, p, f) {
  const q = g.parts[p], x0 = SLOTS[k].x;
  if (q.k === 'drum') return x0 + q.cx;
  if (q.k === 'R') return x0 + q.x0 + (q.x1 - q.x0) * f;
  return x0 + q.x0 + (q.x1 - q.x0) * f;
}

const glow = (E, now, k) => kit.clamp((1 - E.dayK) * 1.1 + E.duskK * 0.3) * (0.85 + 0.15 * Math.sin(now * 9 + k * 2.3) * Math.sin(now * 5.3 + k));

function shade(E, g, p, x, y, wet, now, k) {
  const m = g.mat[p], cy = g.cyl[p], bw = g.bw;
  let base = kit.mix(DRY, WET, wet);
  const lx = E.lx;
  let diff;
  if (cy <= 1) { const nz = Math.sqrt(Math.max(0, 1 - cy * cy)); diff = Math.max(0, cy * lx + nz * 0.78) + 0.05; }
  else {
    diff = 0.72;
    const c = p % bw;
    const l = c > 0 ? g.cov[p - 1] : 0, r = c < bw - 1 ? g.cov[p + 1] : 0;
    if (l < 0.4) diff += -0.25 * lx; if (r < 0.4) diff += 0.25 * lx;
  }
  if (p >= bw && g.cov[p - bw] < 0.4) diff += 0.16;
  if (m === 1) diff += 0.08; else if (m === 3) diff *= 0.72; else if (m === 4) diff *= 1.12; else if (m === 5) diff *= 0.62;
  const grain = 0.9 + 0.14 * kit.hash(x, y, 11);
  const L = E.lev * diff * grain;
  let r = base[0] * (E.lcol[0] * L + E.amb[0] * 0.5 + 0.015), gg = base[1] * (E.lcol[1] * L + E.amb[1] * 0.5 + 0.012), b = base[2] * (E.lcol[2] * L + E.amb[2] * 0.5 + 0.01);
  if (m === 2) {
    const gl = glow(E, now, k);
    r = r * 0.12 + CANDLE[0] * 0.55 * gl; gg = gg * 0.12 + CANDLE[1] * 0.55 * gl; b = b * 0.12 + CANDLE[2] * 0.55 * gl;
  } else if (kit.hash(x * 3 + k, y, 17) > 0.975) { r += 0.06 * E.lev; gg += 0.05 * E.lev; b += 0.05 * E.lev; }   // a pressed-in shell
  return [r, gg, b];
}

export function drawCastles(E, now, sec, A, cur) {
  const flags = [];
  for (let k = 0; k < 4; k++) {
    const S = SLOTS[k], g = glyph(cur[k], S.size), rx0 = S.x - g.ox, ry0 = GROUND - g.bh;
    const b = A.builds.find((q) => q.k === k);
    const inTurn = b && sec >= A.tb && sec < b.end + 0.05;
    let wet = b ? (sec < b.end ? 1 : Math.exp(-(sec - b.end) / 22)) : 0;
    if (!inTurn) {
      for (let r = 0; r < g.bh; r++) for (let c = 0; c < g.bw; c++) {
        const p = r * g.bw + c, cv = g.cov[p];
        if (cv < 0.02) continue;
        const X = rx0 + c, Y = ry0 + r;
        over(Y * GW + X, shade(E, g, p, X, Y, wet, now, k), cv);
      }
      flags.push({ k, x: rx0 + g.flag.x + 0.5, y: ry0 + g.flag.y + 2, rise: 1, wet });
      continue;
    }
    // --- mid-turn: old castle slumping into a mound, new one rising
    const go = glyph(b.old, S.size), mound = moundOf(go), prog = partProgress(b, g, sec);
    let built = 0;
    for (let i = 0; i < prog.length; i++) built += kit.smoothstep(0.4, 0.7, prog[i]);
    built /= prog.length;
    for (let c = -4; c < g.bw + 4; c++) {
      const X = rx0 + c;
      if (X < 0 || X >= GW) continue;
      const s = kit.ease.inOut(kit.clamp((sec - A.hit(X + 0.5)) / (A.hour ? 0.9 : 0.6)));
      const mh = mound[c + 4] * kit.smoothstep(0, 0.75, s) * (1 - 0.92 * built);
      for (let r = 0; r < g.bh; r++) {
        const Y = ry0 + r, h = GROUND - Y - 0.5, P = Y * GW + X;
        // the old castle sinking into itself
        if (s < 1 && c >= 0 && c < go.bw) {
          const hs = h / (1 - 0.82 * s), rr = Math.round(go.bh - 0.5 - hs);
          if (rr >= 0 && rr < go.bh) {
            const p = rr * go.bw + c, cv = go.cov[p] * (1 - kit.smoothstep(0.55, 1, s));
            if (cv > 0.02) over(P, shade(E, go, p, X, Y, kit.lerp(wet * 0, 1, Math.min(1, s * 2)), now, k), cv);
          }
        }
        const mc = kit.clamp(mh - h + 0.5);
        if (mc > 0) {
          const t = kit.clamp((mh - h) / 3);
          over(P, kit.scale(MOUND, (0.25 + 0.9 * E.lev) * (0.75 + 0.35 * (1 - t)) * (0.9 + 0.15 * kit.hash(X, Y, 3))), mc);
        }
        // the new castle, part by part
        if (c >= 0 && c < g.bw) {
          const p = r * g.bw + c, cv = g.cov[p];
          if (cv < 0.02) continue;
          const q = g.part[p], f = prog[q], part = g.parts[q];
          const vis = part.k === 'drum' ? kit.smoothstep(0.48, 0.56, f) : kit.clamp((f * 1.25 - 0.15 - g.sweep[p]) * 6);
          if (vis > 0) over(P, shade(E, g, p, X, Y, 1, now, k), cv * vis);
        }
      }
    }
    for (let i = 0; i < prog.length; i++) if (g.parts[i].k === 'drum' && prog[i] > 0 && prog[i] < 0.95) bucket(E, g.parts[i], S.x, g.S.H, prog[i], BUCKETS[(k + i) % 4]);
    flags.push({ k, x: rx0 + g.flag.x + 0.5, y: ry0 + g.flag.y + 2, rise: kit.smoothstep(b.end - 0.3, b.end, sec), wet });
  }
  return flags;
}

/** An upturned bucket comes down on the spot, sits, and lifts away off a fresh drum. */
function bucket(E, q, x0, H, f, col) {
  let oy, a = 1;
  if (f < 0.35) oy = -16 * (1 - f / 0.35) ** 2;
  else if (f < 0.5) oy = 0.4 * Math.sin((f - 0.35) / 0.15 * Math.PI);
  else { const u = (f - 0.5) / 0.45; oy = -20 * u * u; a = 1 - kit.smoothstep(0.55, 1, u); }
  const cx = x0 + q.cx, top = q.y0 + GROUND - H + oy - 0.8, bot = top + (q.y1 - q.y0) + 1.1;
  const c = kit.scale(col, 0.2 + 0.8 * E.lev);
  for (let y = Math.max(0, Math.floor(top)); y <= Math.min(GH - 1, Math.ceil(bot)); y++) {
    const fy = kit.clamp((y + 0.5 - top) / (bot - top)), hw = (q.wt + 1.2 + (q.wb - q.wt + 0.6) * fy) / 2;
    for (let x = Math.floor(cx - hw - 1); x <= Math.ceil(cx + hw + 1); x++) {
      if (x < 0 || x >= GW) continue;
      const cov = kit.clamp(hw + 0.5 - Math.abs(x + 0.5 - cx)) * kit.clamp(y + 1 - top) * kit.clamp(bot - y);
      if (cov <= 0) continue;
      const u = (x + 0.5 - cx) / hw, sh = 0.65 + 0.45 * Math.max(0, u * E.lx + 0.7) - (fy > 0.85 ? 0.25 : 0);
      over(y * GW + x, kit.scale(c, sh), cov * a);
    }
  }
}

/** Flags on the tallest towers; bunting from flag to flag after the hour's rebuild. */
export function drawFlags(E, now, flags, sec, A) {
  const fc = kit.scale(FLAG, 0.2 + 0.8 * E.lev), pole = kit.scale([0.6, 0.55, 0.5], 0.2 + 0.6 * E.lev);
  const tops = [];
  for (const f of flags) {
    const len = (SLOTS[f.k].size === 'H' ? 7 : 5.5) * f.rise, py = f.y - len;
    tops.push([f.x, f.y - (SLOTS[f.k].size === 'H' ? 7 : 5.5)]);
    if (f.rise <= 0) continue;
    for (let y = Math.floor(py); y < f.y; y++) over(y * GW + Math.floor(f.x), pole, Math.min(1, y + 1 - py) * 0.9);
    const L = SLOTS[f.k].size === 'H' ? 4.6 : 3.6;
    for (let y = Math.floor(py); y <= py + 3; y++) for (let x = Math.floor(f.x - L - 1); x < f.x; x++) {
      let cov = 0;
      for (let s = 0; s < 4; s++) {
        const sx = x + 0.25 + 0.5 * (s & 1), sy = y + 0.25 + 0.5 * (s >> 1), u = (f.x - sx) / L;
        if (u < 0 || u > 1) continue;
        const mid = py + 1.2 + 0.7 * u * Math.sin(now * 7 + u * 4 + f.k), half = 1.25 * (1 - u) + 0.15;
        if (Math.abs(sy - mid) < half) cov += 0.25;
      }
      if (cov > 0) over(y * GW + x, kit.scale(fc, 0.85 + 0.25 * Math.sin(now * 7 + x)), cov);
    }
  }
  if (!A.hour || sec < A.fanfare || sec > 46) return;
  const drop = kit.ease.outElastic(kit.clamp((sec - A.fanfare) / 1.4)) * (1 - kit.ease.in(kit.clamp((sec - 43) / 3)));
  const lift = -28 * (1 - drop);
  const line = kit.scale([0.7, 0.7, 0.65], 0.2 + 0.5 * E.lev);
  let n = 0;
  for (let i = 0; i + 1 < tops.length; i++) {
    const [ax, ay] = tops[i], [bx, by] = tops[i + 1];
    for (let x = Math.ceil(ax); x < bx; x++) {
      const u = (x - ax) / (bx - ax), sag = 4 + 1.2 * Math.sin(now * 2 + i);
      const y = ay + (by - ay) * u + sag * 4 * u * (1 - u) + lift;
      if (y >= 0 && y < GH) over(Math.floor(y) * GW + x, line, 0.6);
      if ((x - Math.ceil(ax)) % 3 === 1) {
        const pc = kit.scale(PENNANTS[n++ % PENNANTS.length], 0.25 + 0.75 * E.lev), sw = 0.5 * Math.sin(now * 5 + x * 0.7);
        for (let j = 0; j < 3; j++) dot(x + 0.5 + sw * j * 0.5, y + 1 + j * 0.9, 1.0 - j * 0.32, pc, 0.95);
      }
    }
  }
}
