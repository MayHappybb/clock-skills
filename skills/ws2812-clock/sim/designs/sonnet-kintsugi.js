// Kintsugi: the 64x64 HUB75 panel is a dark ceramic bowl seen from above,
// its black-blue glaze faintly crackled, lit by one soft window off to the
// side. The time lives in the kintsugi itself: four cracks of gold lacquer,
// mended into the glaze, radiating out from one old chip near the rim - not
// a row of digits, a real fracture map that happens to spell the time.
// Each numeral is drawn once as a clean centre-line (sonnet-kintsugi-glyphs.js)
// then broken into a jagged, tapering fracture with its own deterministic
// micro-steps and dead-end spurs (sonnet-kintsugi-core.js), so it reads as a
// break line first and a digit second.
//
// Always alive: the window light drifts slowly round and a glint travels
// down the gold in a loop; the glaze has a slow living shimmer; a soft leaf
// shadow drifts across the bowl. Minute turn (~2.2 s): the old numeral's
// gold sinks back into the glaze as a fading hairline (crack "healing")
// while a bright white hairline races along the next numeral's fracture
// from the chip outward (with a tiny perpendicular lift at the running
// tip), then molten gold pours in behind it from the same end to a bright
// cooling meniscus. Hour (~3.6 s): the whole glaze lets go along its
// crackle lines - the bowl's shards drift a little apart and tilt to the
// light, the gold time still fully visible throughout since it is only the
// already-correct picture being warped - then eases home and every seam
// flashes once, bright, as if just poured.
//
// Look: smoke (tinted acrylic). Bare GOB dots would scatter into points; a
// thin smoke tint lets the glaze's soft gradient and the gold line read as
// one continuous glazed surface (the whole point of a bowl), while staying
// crisp enough that the crack's jaggedness - the thing that sells "break",
// not "font" - survives, which it would not under a thick opal diffuser.
import * as kit from '../js/kit.js';
import * as K from './sonnet-kintsugi-core.js';

const { W, N, CX, CY, R_BOWL, CHIP, SLOTS, digitsOf, slotSegs, segDist, nearEndIsOne,
  GLAZE_DEEP, GLAZE_LIT, FOOT, GOLD, GOLD_HOT, GOLD_DARK, WINDOW } = K;

const img = new Float32Array(3 * N);

// ------------------------------------------------------- shard tessellation
// For the hour show: a fixed set of irregular cells (jittered seed points,
// nearest-seed assignment) covering the bowl, so "the glaze lets go" can
// move each shard as a rigid piece from its own centroid, not a clean pie
// slice. Built once; shard[p] = cell index or -1 outside the bowl.
const NSHARD = 16;
const shardSeed = [];
for (let i = 0; i < NSHARD; i++) {
  const a = (i + kit.hash(i, 1) * 0.7) / NSHARD * kit.TAU;
  const rad = R_BOWL * (0.35 + 0.55 * kit.hash(i, 2));
  shardSeed.push([CX + Math.cos(a) * rad, CY + Math.sin(a) * rad]);
}
const shardOf = new Int16Array(N).fill(-1);
const shardCentroid = [];
{
  const cx = new Float64Array(NSHARD), cy = new Float64Array(NSHARD), cn = new Float64Array(NSHARD);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x, dx0 = x - CX, dy0 = y - CY;
      if (Math.hypot(dx0, dy0) >= R_BOWL) continue;
      let best = 0, bd = Infinity;
      for (let i = 0; i < NSHARD; i++) {
        const dx = x - shardSeed[i][0], dy = y - shardSeed[i][1], d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      }
      shardOf[p] = best; cx[best] += x; cy[best] += y; cn[best]++;
    }
  }
  for (let i = 0; i < NSHARD; i++) shardCentroid.push(cn[i] ? [cx[i] / cn[i], cy[i] / cn[i]] : shardSeed[i]);
}
// each shard's own drift heading (away from the bowl centre, mostly) and a
// per-shard random phase so they don't all move in lockstep
const shardDir = [], shardPhase = [];
for (let i = 0; i < NSHARD; i++) {
  const [sx, sy] = shardCentroid[i], a0 = Math.atan2(sy - CY, sx - CX);
  const a = a0 + (kit.hash(i, 5) - 0.5) * 0.9;
  shardDir.push([Math.cos(a), Math.sin(a)]);
  shardPhase.push(kit.hash(i, 6) * 0.3);
}

// ---------------------------------------------------------- static glaze
// Per-pixel glaze facts baked once: in-bowl mask, radius, angle, a fine
// crackle field (very faint, independent of time: the bowl's OTHER, older
// crazing), and a speckle for the foot ring at the rim.
const inBowl = new Uint8Array(N), rr = new Float32Array(N), rth = new Float32Array(N);
const rcos = new Float32Array(N), rsin = new Float32Array(N);
const crackle = new Float32Array(N), speck = new Float32Array(N), grain = new Float32Array(N);
// per-pixel baked base colour (before window-light pooling/shimmer, which is
// cheap and still per-frame) and the per-pixel curve/crazing/grain factor,
// so frame() only has to mix two scalars, not rebuild all of this.
const baseMixAt = new Float32Array(N);   // 0.22 .. ~0.72, how far toward GLAZE_LIT
const shadeK = new Float32Array(N);      // curve * grain, folded together
for (let y = 0; y < W; y++) {
  for (let x = 0; x < W; x++) {
    const p = y * W + x, dx = x - CX, dy = y - CY, r = Math.hypot(dx, dy);
    rr[p] = r; const th = Math.atan2(dy, dx); rth[p] = th;
    rcos[p] = Math.cos(th); rsin[p] = Math.sin(th);
    inBowl[p] = r < R_BOWL ? 1 : 0;
    // fine old crazing: thin, faint, random hairline network from a cellular field
    const n1 = kit.fbm(x * 0.14, y * 0.14, 3, 3), n2 = kit.fbm(x * 0.14 + 50, y * 0.14 + 50, 7, 3);
    const cell = Math.abs(n1 - n2);
    crackle[p] = cell < 0.012 ? (1 - cell / 0.012) : 0;
    const g = kit.hash(x, y, 3);
    speck[p] = r > R_BOWL - 3 && r < R_BOWL + 0.6 && g > 0.55 ? (g - 0.55) / 0.45 : 0;
    grain[p] = 0.92 + 0.16 * kit.hash(x, y, 11);
    const rim = kit.smoothstep(R_BOWL * 0.55, R_BOWL * 0.98, r);
    shadeK[p] = (1 - (r / R_BOWL) ** 2 * 0.25) * grain[p];
    baseMixAt[p] = rim; // combined with `pool` (light-direction dependent) at frame time
  }
}

const pad = (n) => String(n).padStart(2, '0');

// ------------------------------------------------------- window + shimmer
/** Window azimuth drifts slowly through the day; elevation stays low and raking. */
function windowDir(t, date) {
  const hr = date.getHours() + date.getMinutes() / 60;
  const az = -2.3 + Math.sin(hr / 24 * kit.TAU) * 0.35 + t * 0.004;
  return [Math.cos(az), Math.sin(az)];
}

// The chip itself: a small dark, irregular gouge (the old impact that
// started every crack) with a few gold flecks caught in its broken edge -
// an uneven blob, not a ring, so it never reads as a zero or a degree
// sign. The radius is hash-perturbed per angle, baked once since it never
// moves.
const CHIP_R = 2.3;
const chipPixels = [];
{
  const nBumps = 5;
  const bumpR = [];
  for (let i = 0; i < 24; i++) {
    // a lumpy radius: base + a couple of low-frequency wobbles, so the
    // outline has 2-3 real lobes instead of being perfectly round
    let r = CHIP_R;
    for (let b = 1; b <= nBumps; b++) r += Math.sin(i / 24 * kit.TAU * b + kit.hash(b, 3) * kit.TAU) * (0.5 / b);
    bumpR.push(Math.max(0.6, r));
  }
  const radiusAt = (ang) => {
    const f = ((ang / kit.TAU) % 1 + 1) % 1 * 24;
    const i0 = Math.floor(f), i1 = (i0 + 1) % 24, u = f - i0;
    return bumpR[i0] + (bumpR[i1] - bumpR[i0]) * u;
  };
  const x0 = Math.floor(CHIP[0] - CHIP_R - 2), x1 = Math.ceil(CHIP[0] + CHIP_R + 2);
  const y0 = Math.floor(CHIP[1] - CHIP_R - 2), y1 = Math.ceil(CHIP[1] + CHIP_R + 2);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || y < 0 || x >= W || y >= W) continue;
      const dx = x - CHIP[0], dy = y - CHIP[1], d = Math.hypot(dx, dy);
      if (d > CHIP_R + 2.6) continue;
      const rLocal = radiusAt(Math.atan2(dy, dx));
      const divot = d < rLocal ? 1 - d / rLocal : 0;
      // only two or three short gold flecks along the broken rim, each at
      // its own angle, not a continuous circle
      let fleck = 0;
      for (const fa of [0.6, 2.4, 4.3]) {
        const da = Math.atan2(dy, dx) - fa, wrapped = Math.atan2(Math.sin(da), Math.cos(da));
        const rl = radiusAt(fa);
        if (Math.abs(wrapped) < 0.35 && d > rl - 0.5 && d < rl + 0.5) {
          fleck = Math.max(fleck, (1 - Math.abs(wrapped) / 0.35) * (1 - Math.abs(d - rl) / 0.5));
        }
      }
      if (divot <= 0 && fleck <= 0) continue;
      chipPixels.push({ p: y * W + x, divot: Math.max(0, divot), rim: Math.max(0, Math.min(1, fleck)) });
    }
  }
}

/** Paint the glaze (background) into img, lit from (lx, ly), with night dimming. */
function paintGlaze(t, date) {
  const [lx, ly] = windowDir(t, date);
  const sway = Math.sin(t * 0.11) * 10, drift = (t * 0.8) % 90 - 13;
  const sinT = Math.sin(t * 0.6), cosT = Math.cos(t * 0.6);
  for (let p = 0; p < N; p++) {
    const o = 3 * p;
    if (!inBowl[p]) {
      const s = speck[p] * 0.5;
      img[o] = FOOT[0] * (0.85 + s); img[o + 1] = FOOT[1] * (0.85 + s); img[o + 2] = FOOT[2] * (0.85 + s);
      continue;
    }
    const facing = rcos[p] * lx + rsin[p] * ly;
    const pool = facing < -1 ? 0 : facing > 1 ? 1 : 0.5 + 0.5 * facing;
    const m = 0.45 + 0.45 * pool * (0.4 + 0.6 * baseMixAt[p]);
    const b0 = GLAZE_DEEP[0] + (GLAZE_LIT[0] - GLAZE_DEEP[0]) * m;
    const b1 = GLAZE_DEEP[1] + (GLAZE_LIT[1] - GLAZE_DEEP[1]) * m;
    const b2 = GLAZE_DEEP[2] + (GLAZE_LIT[2] - GLAZE_DEEP[2]) * m;
    // shimmer: sin(t*0.6 + r*0.3 + th*2) via angle-sum, no per-pixel Math.sin
    const ang = rr[p] * 0.3 + rth[p] * 2, sA = Math.sin(ang), cA = Math.cos(ang);
    const shimmer = 1 + 0.05 * (sinT * cA + cosT * sA) * (0.4 + 0.6 * pool);
    const k = shadeK[p] * shimmer;
    let c0 = b0 * k, c1 = b1 * k, c2 = b2 * k;
    // the old, other crazing: just barely visible, cool, not gold
    const cz = crackle[p] * 0.028;
    c0 += cz * 0.6; c1 += cz * 0.75; c2 += cz * 1.0;
    // a soft leaf shadow drifting across (a branch outside the window)
    const x = p % W, y = (p / W) | 0;
    const u = x - drift, v = y - CY - sway * Math.sin(x * 0.08);
    const leaf = Math.exp(-((u - 20) ** 2) / 70 - (v * v) / 500) * 0.22;
    if (leaf > 0.002) { const lk = 1 - leaf; c0 *= lk; c1 *= lk; c2 *= lk; }
    img[o] = c0; img[o + 1] = c1; img[o + 2] = c2;
  }
  // the chip: a small dark, irregular gouge with a couple of gold flecks
  // caught in its broken edge - never a full ring, so it can't be misread
  // as a zero or a degree sign
  for (let k = 0; k < chipPixels.length; k++) {
    const { p: p2, divot, rim } = chipPixels[k];
    const o2 = 3 * p2;
    if (divot > 0) {
      const dk = divot * 0.8;
      img[o2] *= 1 - dk; img[o2 + 1] *= 1 - dk; img[o2 + 2] *= 1 - dk;
    }
    if (rim > 0) {
      const rk = rim * 0.6;
      img[o2] += (GOLD[0] - img[o2]) * rk;
      img[o2 + 1] += (GOLD[1] - img[o2 + 1]) * rk;
      img[o2 + 2] += (GOLD[2] - img[o2 + 2]) * rk;
    }
  }
}

// ------------------------------------------------------------ gold strokes
/**
 * Paint one digit's fracture at a slot with reveal fraction `show` (0..1,
 * from the chip end), and a 0..1 `fill` (gold fully poured once 1), plus a
 * 0..1 `fade` for an old, healing numeral (fades toward the glaze, no gold).
 * `glintPhase`: where the ambient glint sits along the gold, 0..1, for the
 * always-on idle shimmer (ignored while fade < 1 is mid-heal).
 */
const W_LINE = 2.4, SOFT = 0.6, LIFT_W = 0.9;
const REACH = W_LINE / 2 + SOFT + LIFT_W;
/**
 * Per (digit, slot) baked pixel list: every LED whose glaze pixel is within
 * reach of the fracture, with its distance-derived core/halo and arc-length
 * fraction already resolved - all of this is static per digit+slot, so it
 * is computed once and frame() just walks the short list.
 */
const bakeCache = new Map();
function bakedDigit(d, slotIdx) {
  const key = slotIdx * 10 + d;
  if (bakeCache.has(key)) return bakeCache.get(key);
  const slot = SLOTS[slotIdx];
  const { segs, bbox } = slotSegs(d, slot, slotIdx);
  const flip = nearEndIsOne(d, slot, slotIdx);
  const [x0, y0, x1, y1] = bbox;
  const xa = Math.max(0, x0), xb = Math.min(W - 1, x1), ya = Math.max(0, y0), yb = Math.min(W - 1, y1);
  const list = [];
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const p = y * W + x; if (!inBowl[p]) continue;
      let best = 1e9, bestF = 0, bestBranch = false;
      for (const s of segs) {
        const [dd, tt] = segDist(x + 0.5, y + 0.5, s.ax, s.ay, s.bx, s.by);
        if (dd < best) { best = dd; bestF = s.branch ? 0.5 : (flip ? 1 - (s.f0 + (s.f1 - s.f0) * tt) : (s.f0 + (s.f1 - s.f0) * tt)); bestBranch = s.branch; }
      }
      if (best > REACH) continue;
      const core = 1 - kit.smoothstep(W_LINE * 0.5, W_LINE * 0.5 + SOFT, best);
      const halo = 1 - kit.smoothstep(W_LINE * 0.5, W_LINE * 1.6 + SOFT, best);
      // lit edge: a brighter band flanking the centre line, like lacquer
      // raised a hair above the glaze and catching the window - not the
      // whole core lit flat, so a 2-3 px line still reads as a bead, not a bar
      const rim = Math.max(0, 1 - Math.abs(best - W_LINE * 0.32) / (W_LINE * 0.3));
      if (core <= 0.001 && halo <= 0.001) continue;
      list.push({ p, f: bestF, branch: bestBranch, core, halo, rim });
    }
  }
  bakeCache.set(key, list);
  return list;
}

const CUT0 = 0.14, CUT1 = 0.15, CUT2 = 0.17;
// GOLD_DARK mixed 30% toward GOLD: the resting (unlit) lacquer tone
const GD0 = GOLD_DARK[0] + (GOLD[0] - GOLD_DARK[0]) * 0.3;
const GD1 = GOLD_DARK[1] + (GOLD[1] - GOLD_DARK[1]) * 0.3;
const GD2 = GOLD_DARK[2] + (GOLD[2] - GOLD_DARK[2]) * 0.3;

function paintDigit(d, slotIdx, { show = 1, fill = 1, fade = 1, glintPhase = -1 } = {}) {
  const list = bakedDigit(d, slotIdx);
  for (let li = 0; li < list.length; li++) {
    const { p, f: bestF, branch: bestBranch, core, halo, rim } = list[li];
    // a branch spur only shows once its neighbourhood has revealed
    const localShow = bestBranch ? Math.min(1, show * 1.4) : show;
    if (bestF > localShow + 0.01) continue;
    const o = 3 * p;
    if (fade < 1) {
      // healing: gold ebbs back toward the glaze colour already painted there
      const k = core * fade * 0.9;
      img[o] += (GOLD_DARK[0] * 0.5 - img[o]) * k;
      img[o + 1] += (GOLD_DARK[1] * 0.5 - img[o + 1]) * k;
      img[o + 2] += (GOLD_DARK[2] * 0.5 - img[o + 2]) * k;
      continue;
    }
    // tip lift: just ahead of the reveal edge, a thin bright line (shard lifting)
    const edge = Math.abs(bestF - show);
    const tip = fill < 1 && edge < 0.09 && !bestBranch ? (1 - edge / 0.09) : 0;
    const g0 = fill >= 1 ? GOLD[0] : GD0, g1 = fill >= 1 ? GOLD[1] : GD1, g2 = fill >= 1 ? GOLD[2] : GD2;
    let hot = 0;
    if (fill <= 0) {
      // the racing hairline itself: bright white right at the reveal edge,
      // not the dim resting lacquer tone, before any gold has poured
      hot = tip;
    } else if (fill < 1) {
      // molten meniscus at the pour front
      const front = Math.abs(bestF - fill);
      hot = front < 0.09 ? (1 - front / 0.09) : 0;
    } else if (glintPhase >= 0) {
      const gd = Math.min(Math.abs(bestF - glintPhase), 1 - Math.abs(bestF - glintPhase));
      hot = gd < 0.05 ? (1 - gd / 0.05) : 0;
    }
    const litFrac = fill >= 1 ? 1 : (bestF <= fill ? 1 : 0);
    // revealed but not yet gold: the bare cut groove, a pale incised line
    // (never blank - the crack is visibly open before the lacquer fills it)
    const cutRaw = (!litFrac && bestF <= show) ? 1 : 0;
    if (!litFrac && tip <= 0 && cutRaw <= 0) continue;
    // the resting lit edge: a steady brighter band along the bead, on top
    // of (not instead of) the moving hot spots above, so a 2-3 px line
    // still reads gold-cored with a bright flank, not a flat bar
    const hk = Math.min(1, Math.max(hot, litFrac ? rim * 0.55 : 0)) * 0.9;
    const c0 = g0 + (GOLD_HOT[0] - g0) * hk, c1 = g1 + (GOLD_HOT[1] - g1) * hk, c2 = g2 + (GOLD_HOT[2] - g2) * hk;
    const amt = (litFrac ? core : 0) + tip * 0.8;
    if (cutRaw) {
      const ck = core * 0.9;
      img[o] += CUT0 * ck; img[o + 1] += CUT1 * ck; img[o + 2] += CUT2 * ck;
    }
    img[o] += c0 * amt + halo * c0 * 0.12;
    img[o + 1] += c1 * amt + halo * c1 * 0.12;
    img[o + 2] += c2 * amt + halo * c2 * 0.12;
  }
}

const MINUTE_DUR = 2.2, HAIR_END = 0.42, HOUR_DUR = 3.6;

// Bake every (digit, slot) fracture's pixel list at module load - the only
// expensive-per-key computation in the whole design (an O(bbox pixels x
// segments) scan) - so frame() never pays a first-seen-digit cost mid-show.
// frame() itself needs no time-history warmup (it is a pure function of
// ctx.date), so this runs once here rather than through the `warmup` field.
for (let slotIdx = 0; slotIdx < 4; slotIdx++) {
  for (let d = 0; d <= 9; d++) bakedDigit(d, slotIdx);
}

export default {
  name: 'Kintsugi',
  blurb: 'a dark glazed bowl whose gold-mended cracks fan from one chip and spell the time; minutes race a hairline and pour molten gold, the hour lets the whole glaze apart and home again',
  layouts: ['hub'], look: 'smoke', fps: 60, brightness: 0.32, dither: true,
  frame(ctx) {
    const date = ctx.date, t = ctx.date.getTime() / 1000;
    const dim = 1 - 0.4 * ctx.night;
    const nowMs = ctx.date.getTime();
    const minuteStart = Math.floor(nowMs / 60000) * 60000;
    const age = (nowMs - minuteStart) / 1000;
    const hourStart = Math.floor(nowMs / 3600000) * 3600000;
    const hourAge = (nowMs - hourStart) / 1000;
    const inHourShow = hourAge < HOUR_DUR;
    const inMinuteShow = !inHourShow && age < MINUTE_DUR;

    const curDigits = digitsOf(date);
    const prevDigits = digitsOf(new Date(minuteStart - 1000));

    paintGlaze(t, date);

    const glintPhase = (t * 0.045) % 1;

    for (let i = 0; i < 4; i++) {
      if (inMinuteShow && curDigits[i] !== prevDigits[i]) {
        const show = age < HAIR_END ? kit.ease.out(age / HAIR_END) : 1;
        const fillK = age < HAIR_END ? 0 : kit.ease.inOut(Math.min(1, (age - HAIR_END) / (MINUTE_DUR - HAIR_END)));
        if (age < HAIR_END * 0.85) paintDigit(prevDigits[i], i, { fade: Math.min(1, age / (HAIR_END * 0.85)) });
        paintDigit(curDigits[i], i, { show, fill: fillK });
      } else {
        paintDigit(curDigits[i], i, { show: 1, fill: 1, glintPhase });
      }
    }

    if (inHourShow) {
      // the glaze lets go: every shard (sonnet-kintsugi's fixed Voronoi
      // break-up) lifts off along its own outward heading, peaking mid-show
      // and easing back home. The underlying picture (img) already has the
      // correct, fully-lit time painted into it - shards just carry pixels
      // of it to a new place, so the numerals ride along on their shard and
      // are never wrong, only, briefly, apart.
      const k = Math.sin(Math.min(1, hourAge / HOUR_DUR) * Math.PI); // 0 -> 1 -> 0
      const amt = kit.ease.inOut(Math.min(1, k * 1.2)) * 3.4;
      const flash = amt > 2.0 ? kit.smoothstep(2.0, 3.0, amt) * 0.4 * (1 - kit.smoothstep(3.0, 3.4, amt)) : 0;
      const out2 = new Float32Array(3 * N);
      // background between separated shards: the dark underside of the glaze
      for (let p = 0; p < N; p++) { const o = 3 * p; out2[o] = GLAZE_DEEP[0] * 0.1; out2[o + 1] = GLAZE_DEEP[1] * 0.1; out2[o + 2] = GLAZE_DEEP[2] * 0.14; }
      for (let p = 0; p < N; p++) {
        const sh = shardOf[p]; if (sh < 0) continue;
        const x = p % W, y = (p / W) | 0;
        const [dirx, diry] = shardDir[sh], ph = shardPhase[sh];
        const a = Math.max(0, amt - ph * 2);
        const dx = dirx * a, dy = diry * a;
        const tx = Math.round(x + dx), ty = Math.round(y + dy);
        if (tx < 0 || ty < 0 || tx >= W || ty >= W) continue;
        const di = ty * W + tx, o = 3 * di, so = 3 * p;
        // tilt shading: a shard that's lifted faces the window a little more
        const tilt = 1 + 0.1 * (a / 3.4) * (dirx * 0.5 + diry * 0.2);
        out2[o] = img[so] * tilt * (1 + flash); out2[o + 1] = img[so + 1] * tilt * (1 + flash); out2[o + 2] = img[so + 2] * tilt * (1 + flash);
      }
      kit.blitGrid(ctx, out2, dim);
      return;
    }

    kit.blitGrid(ctx, img, dim);
  },
};
