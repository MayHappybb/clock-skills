// Aquarelle: a sheet of cold-press paper under a desk lamp, and the time is
// watercolour. The hour is a big pale wash laid wet-in-wet (soft, feathered),
// the minutes are glazed over it later, wet-on-dry, small, dark and crisp,
// with the dark rim a stroke leaves as it dries. Light is the paper; pigment
// only takes light away (Beer-Lambert), so where a minute crosses the hour
// the two transparent colours really mix.
//
// How a digit is painted: the brush first lays it in clear water (a shape you
// see only as wet sheen), then touches pigment in at two points, and the
// colour runs through the water by itself, fingering along the wet stroke,
// the two touches meeting in a bleed.
// Always alive: the newest minute dries over its minute (its sheen shrinks
// along the stroke order and its rim darkens), twice a minute the brush comes
// back and lets a drop fall into the wet paint, which blooms into a
// backrun, and the lamp drifts so glints crawl round the wet strokes.
// Minute: a sponge scrubs the old digit off (leaving a faint ghost stain),
// then water, then pigment. Hour: a wash floods down the sheet; the old hour
// bleeds away into it, the brush rides the bead and touches the new hour
// into the wet sheet, where it blooms out soft; then the minutes go in.
import * as kit from '../js/kit.js';
import { font, bake, flow, path, brushOn } from './watercolor-glyphs.js';

const W = 64, H = 64, N = W * H;
const FH = font(1.04, 1.64, 1.2), FM = font(0.84, 0.92, 1.0);
// hour tens, hour ones, minute tens, minute ones: [x, y, font]
const SLOTS = [[1, 2, FH], [22, 2, FH], [29, 35, FM], [44, 35, FM]];
const PAPER = kit.hex('#fff0d8');
const GLINT = [1, 0.97, 0.92];
const k = (h) => kit.hex(h).map((v) => -Math.log(Math.max(v, 0.008)));   // absorbance at density 1

const PG = {
  cerul: k('#3d8fd6'), gold: k('#e39b1c'), rose: k('#e0507a'), sap: k('#5f9e2a'), aureo: k('#e8c21e'),
  opera: k('#e8609c'), turq: k('#22a8a0'), lilac: k('#8c6ad2'), orange: k('#f07a28'), sky: k('#5ab4e6'),
  ultra: k('#2f52d8'), indigo: k('#3a48a8'), aliz: k('#d0203e'), sepia: k('#8a5230'), pruss: k('#1474a0'),
  violet: k('#7240c0'), green: k('#3a8424'), burnt: k('#c0561c'), payne: k('#3a5068'), teal: k('#0c9488'),
};
// per hour of the clock: hour pigment + its charge, minute pigment + its charge
const PAL = [
  ['cerul', 'lilac', 'aliz', 'burnt'], ['gold', 'orange', 'pruss', 'ultra'], ['rose', 'opera', 'teal', 'green'],
  ['sap', 'aureo', 'violet', 'aliz'], ['sky', 'turq', 'burnt', 'aliz'], ['aureo', 'gold', 'ultra', 'violet'],
  ['opera', 'rose', 'indigo', 'teal'], ['turq', 'sky', 'aliz', 'violet'], ['orange', 'gold', 'indigo', 'pruss'],
  ['lilac', 'cerul', 'green', 'sepia'], ['gold', 'aureo', 'aliz', 'violet'], ['cerul', 'turq', 'sepia', 'burnt'],
];
/** The pigment K scaled so a full-strength layer lets through `target` of the light (by luminance). */
function strength(K, target) {
  let lo = 0, hi = 20;
  for (let i = 0; i < 30; i++) {
    const m = (lo + hi) / 2, l = 0.2126 * Math.exp(-K[0] * m) + 0.7152 * Math.exp(-K[1] * m) + 0.0722 * Math.exp(-K[2] * m);
    if (l > target) lo = m; else hi = m;
  }
  return K.map((v) => v * lo);
}
const HOUR_T = 0.24, MIN_T = 0.07;   // the hour is a mid-tone wash, the minute a dark glaze
const palette = (h) => {
  const p = PAL[(h + (h >= 12 ? 5 : 0)) % 12];
  return { H1: strength(PG[p[0]], HOUR_T), H2: strength(PG[p[1]], HOUR_T), M1: strength(PG[p[2]], MIN_T), M2: strength(PG[p[3]], MIN_T) };
};

const pad = (n) => String(n).padStart(2, '0');
const digitsAt = (M) => { const d = new Date(M * 60000); return pad(d.getHours()) + pad(d.getMinutes()); };
const minuteOf = (M) => new Date(M * 60000).getMinutes();
const hourOf = (M) => new Date(M * 60000).getHours();

// ------------------------------------------------------------ static paper
const grain = new Float32Array(N), ggx = new Float32Array(N), ggy = new Float32Array(N), lift = new Float32Array(N), tex = new Float32Array(N);
const wobX = new Float32Array(W);
{
  const raw = new Float32Array(N);
  for (let p = 0; p < N; p++) raw[p] = kit.hash(p % W, (p / W) | 0, 7) * 2 - 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0, n = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const xx = x + i, yy = y + j;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const wgt = i || j ? 0.5 : 1; s += raw[yy * W + xx] * wgt; n += wgt;
    }
    grain[y * W + x] = s / n;
    lift[y * W + x] = kit.noise2(x * 0.45 + 40, y * 0.45);
    tex[y * W + x] = kit.fbm(x * 0.08, y * 0.08, 3.3, 3);
  }
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const p = y * W + x; ggx[p] = grain[p + 1] - grain[p - 1]; ggy[p] = grain[p + W] - grain[p - W];
  }
  for (let x = 0; x < W; x++) wobX[x] = (kit.noise2(x * 0.12, 5.5) - 0.5) * 7 + (kit.noise2(x * 0.5, 9) - 0.5) * 2;
}

const bakes = new Map();
function glyph(d, slot) {
  const key = d * 4 + slot;
  let g = bakes.get(key);
  if (!g) { const [x, y, F] = SLOTS[slot]; g = flow(F, bake(F, d, x, y)); bakes.set(key, g); }
  return g;
}
// bake every digit in every slot up front (~70 ms at load) so no turn stalls on a cache miss
for (let s = 0; s < 4; s++) for (let d = 0; d < 10; d++) glyph(d, s);
const touchPt = (d, slot, which) => { const g = glyph(d, slot), t = which ? g.t2 : g.t1; return [SLOTS[slot][0] + t.x + 0.5, SLOTS[slot][1] + t.y + 0.5]; };
const pathPt = (d, slot, end) => { const S = path(SLOTS[slot][2], d).S, p = end ? S[S.length - 1] : S[0]; return [SLOTS[slot][0] + p.x + 0.5, SLOTS[slot][1] + p.y + 0.5]; };

// ------------------------------------------------------------ the flood
const FLOOD_0 = 0.1, FLOOD_T = 1.0;
/** When the hour's flood front passes pixel (x, y), in s after the hour. */
function floodPass(x, y) {
  const u = kit.clamp((y - wobX[x] * 0.5 + 5) / 75, 0, 1);
  return FLOOD_0 + FLOOD_T * (1 - Math.sqrt(1 - u));
}
const floodFront = (t) => -5 + 75 * (1 - (1 - kit.clamp((t - FLOOD_0) / FLOOD_T)) ** 2);

// ------------------------------------------------------------ the minute's plan
const BRUSH_HOME = [74, -8], SPONGE_HOME = [-14, 76];
const V_MIN = 42, V_HOUR = 60;     // how fast pigment runs through water, cost-px per s
/** The digit that stood in a slot before its last change (for the ghost stain), or -1. */
function ghostOf(slot, M) {
  const m = minuteOf(M), h = hourOf(M);
  const last = slot === 3 ? M : slot === 2 ? M - (m % 10) : slot === 1 ? M - m : M - m - 60 * (h % 10);
  const g = +digitsAt(last - 1)[slot], c = +digitsAt(M)[slot];
  return g === c ? -1 : g;
}

const plans = new Map();
function newSlot(P, s, d, od, changed) {
  const hour = s < 2;
  return {
    d, od, changed, hour,
    K1: hour ? P.pal.H1 : P.pal.M1, K2: hour ? P.pal.H2 : P.pal.M2,
    oK1: hour ? P.prevPal.H1 : P.prevPal.M1, oK2: hour ? P.prevPal.H2 : P.prevPal.M2,
    wiw: hour,                            // wet-in-wet: soft edges, no hard rim
    tWater: -1e9, dWater: 0.32,            // clear water laid along the path
    tC1: -1e9, tC2: -1e9, v: hour ? V_HOUR : V_MIN,   // the two pigment touches
    tL0: 0, tL1: 0,                       // the old digit lifted (sponge) / bled away (flood)
    ghost: ghostOf(s, P.M), oghost: ghostOf(s, P.M - 1),
  };
}
function plan(M) {
  let P = plans.get(M);
  if (P) return P;
  const cur = digitsAt(M), prev = digitsAt(M - 1), isHour = minuteOf(M) === 0;
  P = { M, isHour, pal: palette(hourOf(M)), prevPal: palette(hourOf(M - 1)), slots: [], brush: [], sponge: [], drips: [] };
  for (let s = 0; s < 4; s++) P.slots.push(newSlot(P, s, +cur[s], +prev[s], +cur[s] !== +prev[s] || (isHour && s < 2)));
  if (!isHour) for (let s = 0; s < 4; s++) { P.slots[s].oK1 = P.slots[s].K1; P.slots[s].oK2 = P.slots[s].K2; }
  const br = P.brush, sp = P.sponge;
  let bpos = BRUSH_HOME;
  const move = (t0, t1, to, h1) => { br.push({ kind: 'move', t0, t1, a: bpos, b: to, h0: bpos === BRUSH_HOME ? 9 : br.length ? br[br.length - 1].h1 ?? 0 : 9, h1 }); bpos = to; return t1; };
  const touch = (t0, at, d = 0.15) => { br.push({ kind: 'touch', t0, t1: t0 + d, a: at, h0: 0, h1: 0 }); bpos = at; return t0 + d; };

  // the sponge lifts the minute digits that change
  const ch = isHour ? [] : [2, 3].filter((s) => P.slots[s].changed);
  let st = 0, spos = SPONGE_HOME;
  for (const s of ch) {
    const [ox, oy] = SLOTS[s], S = P.slots[s];
    sp.push({ kind: 'move', t0: st, t1: st + 0.2, a: spos, b: [ox + 9, oy + 3], h0: spos === SPONGE_HOME ? 4 : 1, h1: 0 });
    sp.push({ kind: 'wipe', t0: st + 0.2, t1: st + 0.6, slot: s });
    S.tL0 = st + 0.2; S.tL1 = st + 0.6;
    spos = [ox + 9, oy + 25]; st += 0.6;
  }
  sp.push({ kind: 'move', t0: st, t1: st + 0.55, a: spos, b: SPONGE_HOME, h0: 0, h1: 4 });

  let t = 0.25;
  if (isHour) {
    // the flood bleeds the old digits away as its front passes; the brush rides
    // just behind the bead and touches each new digit into the wet sheet
    // every old digit bleeds out as the front passes it ...
    for (let s = 0; s < 4; s++) {
      const S = P.slots[s], [ox, oy, F] = SLOTS[s];
      let first = 1e9, last = 0;
      for (let x = Math.max(0, ox - 4); x < Math.min(W, ox + F.w + 10); x++) {
        first = Math.min(first, floodPass(x, Math.max(0, oy - 4)));
        last = Math.max(last, floodPass(x, Math.min(H - 1, oy + F.h + 5)));
      }
      S.tL0 = first; S.tL1 = last + 0.4;
    }
    // ... and the new ones go in only once the old minutes are past reading,
    // so no frame mixes the new hour with the old minutes
    const safe = Math.max(P.slots[2].tL1, P.slots[3].tL1) - 0.15;
    for (let s = 0; s < 4; s++) {
      const S = P.slots[s], a = touchPt(S.d, s, 0), b = touchPt(S.d, s, 1);
      S.v = s < 2 ? V_HOUR : 70;
      t = move(t, Math.max(t + 0.09, s === 0 ? safe : 0), a, 0);
      S.tC1 = t; t = touch(t, a, 0.09);
      t = move(t, t + 0.08, b, 0); S.tC2 = t; t = touch(t, b, 0.09);
    }
  }
  // minutes: clear water, then two touches of pigment (on the hour, straight into the wet flood)
  const order = ch;
  for (const s of order) {
    const S = P.slots[s];
    if (!isHour) {
      const start = Math.max(t + 0.14, S.tL1 - 0.12);
      t = move(t, start, pathPt(S.d, s, 0), 0);
      br.push({ kind: 'paint', t0: start, t1: start + S.dWater, slot: s, d: S.d });
      S.tWater = start; t = start + S.dWater; bpos = pathPt(S.d, s, 1);
    }
    const a = touchPt(S.d, s, 0), b = touchPt(S.d, s, 1);
    t = move(t, t + 0.12, a, 0); S.tC1 = t; t = touch(t, a);
    t = move(t, t + 0.12, b, 0); S.tC2 = t; t = touch(t, b);
  }
  move(t, t + 0.8, BRUSH_HOME, 9);

  // two drops a minute into the still-wet minute digit
  const ones = P.slots[3];
  for (let i = 0; i < 2; i++) {
    const T = (i ? 37 : 17) + 5 * kit.hash(M, i, 3);
    const pt = brushOn(FM, ones.d, (i ? 0.7 : 0.35) + 0.2 * kit.hash(M, i, 4), {});
    const at = [SLOTS[3][0] + pt.x + 0.5, SLOTS[3][1] + pt.y + 0.5];
    P.drips.push({ T, x: at[0], y: at[1], R: 4.2 + 1.4 * kit.hash(M, i, 5) });
    br.push({ kind: 'move', t0: T - 1.7, t1: T - 0.5, a: BRUSH_HOME, b: [at[0] - 0.3, at[1] - 0.4], h0: 9, h1: 5 });
    br.push({ kind: 'hover', t0: T - 0.5, t1: T + 0.45, a: [at[0] - 0.3, at[1] - 0.4], h0: 5, h1: 5 });
    br.push({ kind: 'move', t0: T + 0.45, t1: T + 1.7, a: [at[0] - 0.3, at[1] - 0.4], b: BRUSH_HOME, h0: 5, h1: 9 });
  }
  plans.set(M, P);
  if (plans.size > 4) plans.delete(plans.keys().next().value);
  return P;
}

// ------------------------------------------------------------ paint layers
const AR = new Float32Array(N), AG = new Float32Array(N), AB = new Float32Array(N), GL = new Float32Array(N), WET = new Float32Array(N);
const img = new Float32Array(3 * N);
const tmp = { x: 0, y: 0, down: 0, r: 0, lift: 0 };

const GHOST = 0.018;   // what the sponge leaves: a blurred tint, far below the paint
/** A faint stain where the sponge lifted a digit. */
function paintGhost(d, slot, K, a) {
  if (d < 0 || a <= 0.002) return;
  const g = glyph(d, slot);
  for (let j = 0; j < g.bh; j++) {
    const y = g.oy + j; if (y < 0 || y >= H) continue;
    for (let i = 0; i < g.bw; i++) {
      const x = g.ox + i; if (x < 0 || x >= W) continue;
      const e = g.e[j * g.bw + i]; if (e < -3.5) continue;
      const c = kit.clamp(0.4 + (e + 1.5) / 6) * GHOST * a, p = y * W + x;
      AR[p] += c * K[0]; AG[p] += c * K[1]; AB[p] += c * K[2];
    }
  }
}

/**
 * One numeral. old: the digit being lifted or bled away. Pigment density at
 * a cell = coverage x arrival (from the touches) x texture, plus the dried
 * rim on crisp strokes; wet cells collect glint and darken a touch.
 */
function paintDigit(P, S, slot, age, old) {
  const d = old ? S.od : S.d, g = glyph(d, slot), F = SLOTS[slot][2];
  const K1 = old ? S.oK1 : S.K1, K2 = old ? S.oK2 : S.K2;
  const fresh = !old && S.changed;
  const wiw = S.wiw;
  const base = 1;
  const soft0 = S.hour ? 0.9 : 0.3, spread0 = S.hour ? 0.5 : 0.25;
  const total = path(F, d).total;
  const drips = !old && slot === 3 ? P.drips : null;
  const tc1 = S.tC1, tc2 = S.tC2, v = S.v;
  const waterOn = fresh && S.tWater > -1e8;
  for (let j = 0; j < g.bh; j++) {
    const y = g.oy + j; if (y < 0 || y >= H) continue;
    for (let i = 0; i < g.bw; i++) {
      const x = g.ox + i; if (x < 0 || x >= W) continue;
      const q = j * g.bw + i, e = g.e[q];
      if (e < -4) continue;
      const p = y * W + x;
      // ---- water: laid along the path (minute turns) or the flood (hour)
      let water = 1, tWet = -1e9;
      if (waterOn) {
        const pr = (age - S.tWater) / S.dWater;
        water = kit.clamp((pr - g.s[q]) * total / 1.8 + 0.5);
        tWet = S.tWater + g.s[q] * S.dWater;
      } else if (fresh && P.isHour) tWet = floodPass(x, y);
      // ---- pigment arrival from the two touches
      let arr = 1, mixB = g.m[q] * 0.5, tArr = -1e9;
      if (fresh) {
        const a1 = tc1 + g.d1[q] / v, a2 = tc2 + g.d2[q] / v;
        tArr = a1 < a2 ? a1 : a2;
        arr = kit.smoothstep(tArr - 0.05, tArr + 0.5, age);
        mixB = 0.12 + 0.5 * kit.smoothstep(-0.35, 0.35, a1 - a2);
      } else mixB = 0.12 + 0.5 * kit.smoothstep(-0.35, 0.35, g.d1[q] / v - g.d2[q] / v);
      // ---- edge: wet paint creeps out a little and feathers
      let soft = soft0, spread = spread0;
      const dtA = age - tArr;
      if (fresh && dtA < 40) {
        const k = Math.exp(-Math.max(dtA, 0) / 2);
        if (wiw) { soft += 1.4 * k; spread += 0.4 * (1 - k); } else spread *= 0.6 + 0.4 * (1 - Math.exp(-Math.max(dtA, 0) / 0.8));
      }
      let L = 0;
      if (old) {
        if (P.isHour) { const fp = floodPass(x, y); L = kit.smoothstep(fp - 0.05, fp + 0.35, age); soft += 3.5 * L; spread += 1.8 * L; }
        else {
          const pr = (age - S.tL0) / (S.tL1 - S.tL0), thr = 0.1 + 0.75 * (j / g.bh) + 0.25 * (lift[p] - 0.5);
          L = kit.smoothstep(thr - 0.1, thr + 0.1, pr);
        }
        if (L >= 1) continue;
      }
      const ee = e + spread, c = kit.clamp(0.5 + ee / (1 + soft));
      // the wet stroke (clear water before the pigment) catches the light
      let wetness = 0;
      if (fresh) {
        const cw = kit.clamp(0.5 + (e + 0.4) / 1.2) * water;
        // wet until it dries: thin edges first, the stroke order sets the rest
        const tdry = Math.max(tWet, tArr) + 3 + 46 * (0.55 * g.s[q] + 0.45 * kit.clamp(ee / (2.4 * F.ws)));
        wetness = cw * (1 - kit.smoothstep(-1.5, 1.5, age - tdry));
      }
      let Dn = c * arr * (1 - L);
      if (Dn > 0.002) {
        const gr = grain[p];
        let D = base * (0.92 + 0.3 * gr + 0.3 * kit.smoothstep(0.75, 1, g.u[q]));
        if (!wiw) D += (1 - wetness) * 0.45 * Math.exp(-Math.max(ee, 0) / 0.5);       // the dried rim
        else D *= 0.85 + 0.3 * tex[p];
        D *= 1 + 0.25 * wetness;                                                     // wet paint is darker
        if (fresh && dtA < 2) D *= 1 + 0.5 * Math.exp(-Math.max(dtA, 0) / 0.4);     // the fresh charge
        if (drips) for (let n = 0; n < 2; n++) {
          const B = drips[n], ta = age - B.T;
          if (ta < 0) continue;
          const R = B.R * (1 - Math.exp(-ta / 1.3));
          const rp = Math.hypot(x + 0.5 - B.x, y + 0.5 - B.y) + (lift[p] - 0.5) * 2.4 + gr * 0.6;
          const inside = 1 - kit.smoothstep(R - 0.9, R + 0.3, rp), ring = Math.exp(-(((rp - R) / 0.75) ** 2));
          D = D * (1 - 0.72 * inside) + 1.3 * ring * kit.smoothstep(0, 0.5, ta);
          const wb = inside * Math.exp(-ta / 10);
          if (wb > wetness) wetness = wb;
        }
        D *= Dn;
        const da = D * (1 - mixB), db = D * mixB;
        AR[p] += da * K1[0] + db * K2[0]; AG[p] += da * K1[1] + db * K2[1]; AB[p] += da * K1[2] + db * K2[2];
      }
      if (old && L > 0 && !P.isHour) {   // what the sponge can't lift
        const gs = GHOST * L * kit.clamp(0.4 + (e + 1.5) / 6);
        AR[p] += gs * K1[0]; AG[p] += gs * K1[1]; AB[p] += gs * K1[2];
      }
      if (wetness > WET[p]) WET[p] = wetness;
    }
  }
}

// ------------------------------------------------------------ the tools
const SD = [0.55, 0.7];     // the lamp is up and to the left: shadows fall down-right
const BU = [0.6, -0.8];     // the brush handle points up-right
let LX = 0, LY = 0;
function brushR(a, pr) {
  if (a < 8) return 0.4 + 1.7 * Math.sqrt(a / 8) + 0.7 * pr * (1 - a / 8);
  if (a < 13) return 2.1;
  return 1.6 + 0.4 * Math.sin(kit.clamp((a - 13) / 45) * Math.PI);
}
function drawBrush(tx, ty, h, pr, K, dim) {
  if (tx > W + 6 && ty < -4) return;
  const x0 = Math.max(0, Math.floor(tx - 5)), y1 = Math.min(H - 1, Math.ceil(ty + 5 + h));
  const sx = tx + SD[0] * h, sy = ty + SD[1] * h, vx = BU[0] + SD[0] * 0.3, vy = BU[1] + SD[1] * 0.3, vl = vx * vx + vy * vy, vs = Math.sqrt(vl);
  for (let y = 0; y <= y1; y++) for (let x = x0; x < W; x++) {
    const px = x + 0.5 - sx, py = y + 0.5 - sy, a = (px * vx + py * vy) / vl;
    if (a < -1 || a > 90) continue;
    const perp = Math.abs(px * vy - py * vx) / vs, rs = brushR(Math.max(a, 0), pr) + 0.4;
    const blur = 0.7 + 0.07 * (h + 0.3 * a);
    const sh = 0.5 * (1 - kit.smoothstep(rs - blur, rs + blur, perp)) * (a < 0 ? 1 + a : 1);
    if (sh > 0.002) { const q = 3 * (y * W + x), f = 1 - sh; img[q] *= f; img[q + 1] *= f; img[q + 2] *= f; }
  }
  const tc = [Math.exp(-K[0] * 1.6) * 0.55, Math.exp(-K[1] * 1.6) * 0.55, Math.exp(-K[2] * 1.6) * 0.55];
  const y1b = Math.min(H - 1, Math.ceil(ty + 3));
  for (let y = 0; y <= y1b; y++) for (let x = x0; x < W; x++) {
    const px = x + 0.5 - tx, py = y + 0.5 - ty, a = px * BU[0] + py * BU[1];
    if (a < -1 || a > 90) continue;
    const sp = px * BU[1] - py * BU[0];
    const r = brushR(Math.max(a, 0), pr), cov = kit.clamp(r - Math.abs(sp) + 0.5) * (a < 0 ? kit.clamp(1 + a) : 1);
    if (cov <= 0) continue;
    const hz = (sp / r + 0.45) / 0.3, hl = Math.exp(-hz * hz);
    let cr, cg, cb;
    if (a < 8) { cr = tc[0] + 0.45 * hl; cg = tc[1] + 0.43 * hl; cb = tc[2] + 0.4 * hl; }
    else if (a < 13) { const m = a > 12 ? 0.5 : 1; cr = (0.15 + 0.75 * hl) * m; cg = (0.15 + 0.74 * hl) * m; cb = (0.16 + 0.72 * hl) * m; }
    else { cr = 0.55 + 0.45 * hl; cg = 0.06 + 0.2 * hl; cb = 0.03 + 0.12 * hl; }
    const q = 3 * (y * W + x);
    img[q] += (cr * dim - img[q]) * cov; img[q + 1] += (cg * dim - img[q + 1]) * cov; img[q + 2] += (cb * dim - img[q + 2]) * cov;
  }
}

const SPONGE = kit.hex('#ffc23a');
function drawSponge(cx, cy, h, squash, dim) {
  const rx = 8 * squash, ry = 6 * squash;
  if (cx < -rx - 4 || cy > H + ry + 4) return;
  const sx = cx + SD[0] * (h + 1.3), sy = cy + SD[1] * (h + 1.3);
  const bx0 = Math.max(0, Math.floor(Math.min(cx, sx) - rx - 2)), bx1 = Math.min(W - 1, Math.ceil(Math.max(cx, sx) + rx + 2));
  const by0 = Math.max(0, Math.floor(Math.min(cy, sy) - ry - 2)), by1 = Math.min(H - 1, Math.ceil(Math.max(cy, sy) + ry + 2));
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
    const q = 3 * (y * W + x);
    const dxs = (x + 0.5 - sx) / rx, dys = (y + 0.5 - sy) / ry, rhs = Math.sqrt(dxs * dxs + dys * dys);
    const sh = 0.5 * (1 - kit.smoothstep(0.8, 1.25 + 0.05 * h, rhs));
    if (sh > 0.002) { const f = 1 - sh; img[q] *= f; img[q + 1] *= f; img[q + 2] *= f; }
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, rho = Math.sqrt(dx * dx + dy * dy);
    const th = Math.atan2(dy, dx), edge = 1 + 0.24 * (kit.noise2(Math.cos(th) * 2 + 3, Math.sin(th) * 2) - 0.5);
    const cov = kit.clamp((edge - rho) * rx * 0.8 + 0.5);
    if (cov <= 0) continue;
    const pore = kit.noise2((x + 0.5 - cx) / squash * 0.75 + 11, (y + 0.5 - cy) / squash * 0.75 + 4);
    const shade = kit.clamp(1.05 - 0.45 * (dx * 0.7 + dy * 0.7) - 0.25 * rho * rho, 0.25, 1.2);
    const v = shade * (pore > 0.66 ? 0.3 : pore > 0.58 ? 0.65 : 1) * 1.0 * dim;
    img[q] += (SPONGE[0] * v - img[q]) * cov; img[q + 1] += (SPONGE[1] * v - img[q + 1]) * cov; img[q + 2] += (SPONGE[2] * v - img[q + 2]) * cov;
  }
}

function splatImg(x, y, r, c, a) {
  for (let yy = Math.max(0, Math.floor(y - r)); yy <= Math.min(H - 1, Math.ceil(y + r)); yy++)
    for (let xx = Math.max(0, Math.floor(x - r)); xx <= Math.min(W - 1, Math.ceil(x + r)); xx++) {
      const d = Math.hypot(xx + 0.5 - x, yy + 0.5 - y) / r; if (d >= 1) continue;
      const f = (1 - d * d) ** 2 * a, q = 3 * (yy * W + xx);
      img[q] += c[0] * f; img[q + 1] += c[1] * f; img[q + 2] += c[2] * f;
    }
}

/** Where a tool is, from its segment list: eased moves with a little hop. */
function toolAt(segs, t, home, homeH, out) {
  out.x = home[0]; out.y = home[1]; out.h = homeH; out.seg = null; out.p = 0;
  for (const sg of segs) {
    if (t < sg.t0 || t >= sg.t1) continue;
    const f = (t - sg.t0) / (sg.t1 - sg.t0);
    out.seg = sg; out.p = f;
    if (sg.kind === 'move') {
      const e = kit.ease.inOut(f);
      out.x = kit.lerp(sg.a[0], sg.b[0], e); out.y = kit.lerp(sg.a[1], sg.b[1], e);
      out.h = kit.lerp(sg.h0, sg.h1, e) + 2.5 * Math.sin(Math.PI * f);
    } else { out.x = sg.a ? sg.a[0] : out.x; out.y = sg.a ? sg.a[1] : out.y; out.h = sg.h0 ?? 0; }
    return out;
  }
  return out;
}
const bst = { x: 0, y: 0, h: 0, seg: null, p: 0 }, sst = { x: 0, y: 0, h: 0, seg: null, p: 0 };

export default {
  name: 'Aquarelle',
  blurb: 'the time in live watercolour: clear water, then pigment that runs through it; minutes dry, drops bloom, a sponge lifts them; the hour floods the sheet',
  layouts: ['hub'], look: { look: 'opal', gap: 1.2 }, fps: 60, brightness: 0.42, dither: true,
  frame(ctx) {
    const now = ctx.date.getTime() / 1000, M = Math.floor(now / 60), age = now - M * 60;
    const P = plan(M);
    const dim = 1 - 0.55 * ctx.night;
    AR.fill(0); AG.fill(0); AB.fill(0); GL.fill(0); WET.fill(0);
    const la = 0.95 + 0.45 * Math.sin(now * 0.05);    // the light swings slowly: glints crawl
    LX = Math.cos(la); LY = Math.sin(la);

    // ---- the flood (the hour): a wash of the new hour's colour, drying lighter
    if (P.isHour && age < 40) {
      const K = P.pal.H2, fy = floodFront(age);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const p = y * W + x, tp = floodPass(x, y);
        if (age < tp) continue;
        const dt = age - tp;
        let F = (0.06 + 0.22 * Math.exp(-dt / 1.2)) * Math.exp(-dt / 8) * (0.7 + 0.6 * tex[p]);
        const dist = fy - (y - wobX[x] * 0.5);
        if (age < FLOOD_0 + FLOOD_T + 0.5) {
          const fade = 1 - kit.smoothstep(FLOOD_0 + FLOOD_T - 0.1, FLOOD_0 + FLOOD_T + 0.5, age);
          const bead = Math.exp(-((dist / 1.8) ** 2)) * fade;
          F += 0.7 * bead;                                   // the pooled bead at the front
          GL[p] += 1.2 * Math.exp(-(((dist - 0.9) / 0.8) ** 2)) * fade;   // its meniscus catches the lamp
        }
        AR[p] += F * K[0]; AG[p] += F * K[1]; AB[p] += F * K[2];
        WET[p] = Math.max(Math.exp(-dt / 3), age < FLOOD_0 + FLOOD_T + 0.5 ? 1 : 0);
      }
    }

    // ---- the numerals, with the ghost of what the sponge took
    for (let s = 0; s < 4; s++) {
      const S = P.slots[s];
      if (S.changed && age < S.tL1 + 0.05) {
        const fade = 1 - kit.clamp((age - S.tL0) / (S.tL1 - S.tL0));
        if (!S.hour) paintGhost(S.oghost, s, S.oK1, fade);
        paintDigit(P, S, s, age, true);
      }
      if (!S.hour) paintGhost(S.changed ? (S.od === S.d ? -1 : S.od) : S.ghost, s, S.K1, S.changed ? kit.smoothstep(S.tL0, S.tL1, age) : 1);
      paintDigit(P, S, s, age, false);
    }

    // ---- light: a lamp pool drifting over the sheet, the paper's tooth raked
    const cx = 30 + 9 * Math.sin(now * 0.043), cy = 28 + 7 * Math.sin(now * 0.031 + 1);
    const tw = now * 1.4;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = y * W + x, dx = x - cx, dy = y - cy;
      const Lp = (0.6 + 0.4 * Math.exp(-(dx * dx + dy * dy) / 1600)) * (1 + 0.06 * (ggx[p] * LX + ggy[p] * LY) + 0.03 * grain[p]) * dim;
      const wt = WET[p], q = 3 * p;
      // wet paper is a touch darker and cooler, and glints where the bead faces the lamp
      const wd = 1 - 0.12 * wt;
      let g = 0;
      if (wt > 0.01) {
        // the wet bead's rim that faces the lamp catches it (slope of the wet field)
        const xm = x > 0 ? p - 1 : p, xp = x < W - 1 ? p + 1 : p, ym = y > 0 ? p - W : p, yp = y < H - 1 ? p + W : p;
        const sl = (WET[xp] - WET[xm]) * LX + (WET[yp] - WET[ym]) * LY;
        const gl = (sl > 0 ? sl : 0) + GL[p];
        const sp = 0.55 + 0.45 * kit.noise3(x * 0.8, y * 0.8, tw);
        g = Lp * (0.025 * wt * sp + 0.45 * kit.smoothstep(0.45, 0.9, gl) * sp * sp);
      }
      img[q] = PAPER[0] * Lp * wd * Math.exp(-AR[p]) + GLINT[0] * g;
      img[q + 1] = PAPER[1] * Lp * wd * Math.exp(-AG[p]) + GLINT[1] * g;
      img[q + 2] = PAPER[2] * Lp * (wd + 0.03 * wt) * Math.exp(-AB[p]) + GLINT[2] * g;
    }

    // ---- the sponge (from the lower left) and the brush (from the upper right)
    toolAt(P.sponge, age, SPONGE_HOME, 4, sst);
    let squash = 1;
    if (sst.seg && sst.seg.kind === 'wipe') {
      const [ox, oy] = SLOTS[sst.seg.slot], f = sst.p;
      sst.x = ox + 9 + 3 * Math.sin(f * Math.PI * 5); sst.y = oy + 3 + f * 22; sst.h = 0.4 + 0.4 * Math.sin(f * Math.PI * 10);
      squash = 1.06 - 0.04 * sst.h;
    }
    drawSponge(sst.x, sst.y, sst.h, squash, dim);

    toolAt(P.brush, age, BRUSH_HOME, 9, bst);
    let pr = 0, K = P.slots[3].K1;
    if (bst.seg && bst.seg.kind === 'paint') {
      const sg = bst.seg, [ox, oy, F] = SLOTS[sg.slot];
      brushOn(F, sg.d, bst.p, tmp);
      bst.x = ox + tmp.x + 0.5; bst.y = oy + tmp.y + 0.5; bst.h = tmp.down ? 0 : 2.2 * tmp.lift; pr = tmp.down ? kit.clamp(tmp.r / 2) : 0;
      K = [0.05, 0.03, 0.02];   // clear water: the tip looks pale
    } else if (bst.seg && bst.seg.kind === 'touch') { bst.h = 0.6 * (1 - Math.sin(Math.PI * bst.p)); pr = Math.sin(Math.PI * bst.p); }
    else if (bst.seg && bst.seg.kind === 'hover') { bst.h = 5 + 0.3 * Math.sin(now * 5); bst.y += 0.25 * Math.sin(now * 3.3); }
    drawBrush(bst.x, bst.y, bst.h, pr, K, dim);

    // ---- the drop: falls from the tip (its shadow closes in), splashes
    for (const B of P.drips) {
      const f = (age - (B.T - 0.3)) / 0.3;
      if (f > 0 && f < 1) {
        const hd = 5 * (1 - f * f);
        splatImg(B.x + SD[0] * hd, B.y + SD[1] * hd, 1.3, [-0.22 * dim, -0.2 * dim, -0.18 * dim], 1);
        splatImg(B.x - 0.3 * (1 - f), B.y - 0.4 * (1 - f), 1.1 + 0.3 * f, [0.35 * dim, 0.4 * dim, 0.45 * dim], 1);
      }
      const g = age - B.T;
      if (g > 0 && g < 0.35) {
        const rr = 1 + 6 * g, a = (1 - g / 0.35) * 0.3 * dim;
        for (let n = 0; n < 10; n++) { const th = n * kit.TAU / 10 + B.T; splatImg(B.x + Math.cos(th) * rr, B.y + Math.sin(th) * rr, 1, GLINT, a); }
      }
    }
    for (let i = 0; i < img.length; i++) if (img[i] < 0) img[i] = 0;
    kit.blitGrid(ctx, img);
  },
};
